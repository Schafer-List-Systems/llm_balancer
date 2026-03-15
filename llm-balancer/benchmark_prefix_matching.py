#!/usr/bin/env python3
"""
LLM Balancer Prefix Matching Benchmark Script

Measures the performance benefit of prefix-based backend selection by:
1. Sending N unique large prompts to N backends concurrently
2. Each backend caches its prompt after processing
3. Sending N extended prompts in REVERSE order
4. Measuring speedup from prompt processing cache benefit

The reverse order routing forces the benchmark to rely on prefix matching:
- Without prefix matching: Extended Prompt 0 routes to Backend N-1 (no cache) -> SLOW
- With prefix matching: Extended Prompt 0 routes to Backend 0 (has cache) -> FAST

Usage:
    python benchmark_prefix_matching.py
    python benchmark_prefix_matching.py --stream --tokens 15000
    python benchmark_prefix_matching.py --fixed --prompt-file prompts.txt
"""

import argparse
import json
import random
import string
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional
import urllib.request
import urllib.error

# ANSI color codes for terminal output
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    RED = '\033[31m'
    CYAN = '\033[36m'

def color(text: str, color_code: str) -> str:
    """Apply color to text in terminal."""
    return f"{color_code}{text}{Colors.RESET}"

def print_header(text: str):
    """Print a formatted header."""
    print(f"\n{color(text, Colors.BOLD)}")
    print("=" * 60)

def print_section(text: str):
    """Print a formatted section."""
    print(f"\n{color(text, Colors.CYAN)}")

def print_success(text: str):
    """Print a success message."""
    print(f"  {color('✓', Colors.GREEN)} {text}")

def print_info(text: str):
    """Print an info message."""
    print(f"  {color('→', Colors.BLUE)} {text}")

def print_warning(text: str):
    """Print a warning message."""
    print(f"  {color('⚠', Colors.YELLOW)} {text}")

def print_error(text: str):
    """Print an error message."""
    print(f"  {color('✗', Colors.RED)} {text}")

@dataclass
class BenchmarkConfig:
    """Configuration for the benchmark."""
    balancer_url: str
    stream: bool
    fixed_prompts: bool
    prompt_file: Optional[str]
    tokens: int
    output_tokens: int
    concurrency: int
    model: str
    short_question: str
    debug: bool = False

@dataclass
class RequestResult:
    """Result from a single request."""
    success: bool
    prompt_id: int
    first_chunk_time_ms: Optional[float]
    total_time_ms: Optional[float]
    response_content: Optional[str]
    error: Optional[str]

def get_backend_count(balancer_url: str) -> int:
    """Discover the number of backends from the balancer."""
    try:
        url = f"{balancer_url}/backends"
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            return len(data.get('backends', []))
    except Exception as e:
        print_error(f"Failed to get backend count: {e}")
        return 0

def generate_large_prompt(num_tokens: int) -> str:
    """Generate a large random text prompt."""
    # Approximate: 1 token ≈ 4 characters in English
    num_chars = num_tokens * 4

    words = [
        'The', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
        'In', 'the', 'world', 'of', 'programming', 'and', 'software', 'development',
        'Algorithms', 'and', 'data', 'structures', 'form', 'foundational', 'concepts',
        'Understanding', 'complexity', 'analysis', 'helps', 'developers', 'write', 'efficient',
        'Code', 'optimization', 'is', 'crucial', 'for', 'performance', 'critical', 'applications',
        'Modern', 'systems', 'require', 'scalable', 'solutions', 'that', 'handle', 'large',
        'Data', 'processing', 'pipelines', 'need', 'robust', 'architecture', 'design', 'patterns',
        'Machine', 'learning', 'models', 'require', 'massive', 'datasets', 'and', 'computational',
        'resources', 'for', 'training', 'inference', 'and', 'deployment', 'at', 'scale'
    ]

    prompt = f"Write a comprehensive essay about technology and innovation:\n\n"
    current_length = len(prompt)

    while current_length < num_chars:
        word = random.choice(words)
        prompt += word + ' '
        current_length += len(word) + 1

    return prompt.strip()

def load_fixed_prompts(prompt_file: str) -> List[str]:
    """Load prompts from a file, one per line."""
    try:
        with open(prompt_file, 'r', encoding='utf-8') as f:
            prompts = [line.strip() for line in f if line.strip()]
        return prompts
    except Exception as e:
        print_error(f"Failed to load prompts from {prompt_file}: {e}")
        return []

def send_request(balancer_url: str, prompt: str, model: str, stream: bool, config: Optional[BenchmarkConfig] = None) -> RequestResult:
    """Send a request to the balancer and measure timing."""
    url = f"{balancer_url}/v1/chat/completions"
    config = config or BenchmarkConfig('', False, False, None, 0, 0, 0, '', '', False)

    request_data = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': 'You are a helpful assistant.'},
            {'role': 'user', 'content': prompt}
        ],
        'stream': stream,
        'max_tokens': 10
    }

    try:
        data = json.dumps(request_data).encode('utf-8')
        headers = {
            'Content-Type': 'application/json',
            'Content-Length': str(len(data))
        }

        request = urllib.request.Request(url, data=data, headers=headers, method='POST')

        start_time = time.time()
        first_chunk_time = None

        with urllib.request.urlopen(request, timeout=300) as response:
            chunks = []
            for chunk in iter(lambda: response.read(8192), b''):
                if first_chunk_time is None:
                    first_chunk_time = time.time()
                chunks.append(chunk)

            total_time = time.time() - start_time
            first_chunk_time_ms = (first_chunk_time - start_time) * 1000 if first_chunk_time else None
            total_time_ms = total_time * 1000

            # Combine and decode chunks
            full_response = b''.join(chunks).decode('utf-8')

            # Parse response
            response_data = json.loads(full_response)
            # Try content first, then reasoning (some backends put content in reasoning)
            message = response_data.get('choices', [{}])[0].get('message', {})

            # Debug: show raw response details
            if config.debug:
                content_val = message.get('content')
                reasoning_val = message.get('reasoning')
                print(f"    [DEBUG] message.content={repr(content_val[:30] if content_val else None)}")
                print(f"    [DEBUG] message.reasoning={repr(reasoning_val[:30] if reasoning_val else None)}")

            # Handle both 'content' and 'reasoning' fields (content may be null in some backends)
            # Note: Some models (like Qwen) return content in the 'reasoning' or 'reasoning_content' field
            # instead of 'content', so we check multiple fields
            content = message.get('content') or message.get('reasoning') or message.get('reasoning_content') or ''

            # Validate response - if both content and reasoning are null/empty, this is an error
            # This can happen when backends return invalid responses
            if not content or len(content.strip()) == 0:
                # Log the actual response for debugging
                if config and config.debug:
                    print(f"    [DEBUG] Empty response received - message={message}")
                return RequestResult(
                    success=False,
                    prompt_id=0,
                    first_chunk_time_ms=first_chunk_time_ms,
                    total_time_ms=total_time_ms,
                    response_content=None,
                    error=f"Empty response from backend (content={message.get('content')}, reasoning={message.get('reasoning')})"
                )

            return RequestResult(
                success=True,
                prompt_id=0,
                first_chunk_time_ms=first_chunk_time_ms,
                total_time_ms=total_time_ms,
                response_content=content,
                error=None
            )

    except Exception as e:
        return RequestResult(
            success=False,
            prompt_id=0,
            first_chunk_time_ms=None,
            total_time_ms=None,
            response_content=None,
            error=str(e)
        )

def send_request_streaming(balancer_url: str, prompt: str, model: str, config: Optional[BenchmarkConfig] = None) -> RequestResult:
    """Send a streaming request and measure timing."""
    url = f"{balancer_url}/v1/chat/completions"
    config = config or BenchmarkConfig('', False, False, None, 0, 0, 0, '', '', False)

    request_data = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': 'You are a helpful assistant.'},
            {'role': 'user', 'content': prompt}
        ],
        'stream': True,
        'max_tokens': 10
    }

    try:
        data = json.dumps(request_data).encode('utf-8')
        headers = {
            'Content-Type': 'application/json',
            'Content-Length': str(len(data))
        }

        request = urllib.request.Request(url, data=data, headers=headers, method='POST')

        start_time = time.time()
        first_chunk_time = None
        chunk_count = 0
        full_response = []

        with urllib.request.urlopen(request, timeout=300) as response:
            for line in response:
                line = line.decode('utf-8').strip()
                if line.startswith('data:'):
                    chunk_count += 1
                    if first_chunk_time is None:
                        first_chunk_time = time.time()
                    # Handle both [DONE] signal and actual data chunks
                    if line == 'data: [DONE]':
                        break
                    try:
                        full_response.append(json.loads(line[5:].strip()))
                    except:
                        pass

        total_time = time.time() - start_time
        first_chunk_time_ms = (first_chunk_time - start_time) * 1000 if first_chunk_time else None
        total_time_ms = total_time * 1000

        # Get content from streaming chunks
        content = ''
        if full_response:
            # Qwen returns reasoning in delta.reasoning, not reasoning_content
            last_chunk = full_response[-1]
            delta = last_chunk.get('choices', [{}])[0].get('delta', {})
            reasoning = delta.get('reasoning', '')
            content = reasoning

            # Debug: show raw response details
            if config.debug:
                print(f"    [DEBUG] delta.reasoning={repr(reasoning[:30] if reasoning else None)}")

        # Validate response - if content is empty, this is an error
        if not content or len(content.strip()) == 0:
            if config and config.debug:
                print(f"    [DEBUG] Empty streaming response - full_response={full_response}")
            return RequestResult(
                success=False,
                prompt_id=0,
                first_chunk_time_ms=first_chunk_time_ms,
                total_time_ms=total_time_ms,
                response_content=None,
                error="Empty response from backend (streaming)"
            )

        return RequestResult(
            success=True,
            prompt_id=0,
            first_chunk_time_ms=first_chunk_time_ms,
            total_time_ms=total_time_ms,
            response_content=content,
            error=None
        )

    except Exception as e:
        return RequestResult(
            success=False,
            prompt_id=0,
            first_chunk_time_ms=None,
            total_time_ms=None,
            response_content=None,
            error=str(e)
        )

def run_benchmark(config: BenchmarkConfig) -> dict:
    """Run the complete prefix matching benchmark."""
    results = {
        'backends_discovered': 0,
        'prompts_used': 0,
        'successful_pairs': 0,
        'first_request_times': [],
        'second_request_times': [],
        'errors': []
    }

    # Step 1: Discover backends
    print_section("Step 1: Discovering backends")
    backend_count = get_backend_count(config.balancer_url)

    if backend_count == 0:
        print_error("No backends found. Is the balancer running?")
        return results

    print_success(f"Found {backend_count} backends")
    results['backends_discovered'] = backend_count

    # Determine number of prompts
    num_prompts = min(backend_count, config.concurrency)
    print_info(f"Will use {num_prompts} prompts (min of backends and concurrency)")

    # Step 2: Load or generate prompts
    print_section("Step 2: Loading/generating prompts")
    prompts = []

    if config.fixed_prompts:
        if config.prompt_file:
            prompts = load_fixed_prompts(config.prompt_file)
            if len(prompts) < num_prompts:
                print_warning(f"Only {len(prompts)} prompts found in file, using all available")
                num_prompts = len(prompts)
        else:
            print_error("Please specify --prompt-file when using --fixed")
            return results
    else:
        # Generate random prompts
        for i in range(num_prompts):
            prompt = generate_large_prompt(config.tokens)
            # Make each prompt unique by adding a prefix
            prompts.append(f"PROMPT {i + 1}: Unique content for benchmark {i + 1}\n\n{prompt}")

    print_success(f"Loaded/generated {len(prompts)} prompts")
    results['prompts_used'] = len(prompts)

    # Step 3: Send initial requests
    print_section("Step 3: Sending initial requests (concurrent)")

    first_results = []
    total_workers = min(num_prompts, config.concurrency)

    with ThreadPoolExecutor(max_workers=total_workers) as executor:
        future_to_idx = {}

        send_func = send_request_streaming if config.stream else send_request

        for i, prompt in enumerate(prompts):
            if config.stream:
                future = executor.submit(send_func, config.balancer_url, prompt, config.model, config)
            else:
                future = executor.submit(send_func, config.balancer_url, prompt, config.model, config.stream, config)
            future_to_idx[future] = i
            print_info(f"Sending initial request {i + 1}/{num_prompts}...")

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            result = future.result()
            result.prompt_id = idx
            first_results.append(result)

            if result.success:
                response_preview = result.response_content[:50] if result.response_content else 'No content'
                duration = result.total_time_ms / 1000 if result.total_time_ms else 0
                # Debug: print actual content length
                content_len = len(result.response_content) if result.response_content else 0
                print_success(f"Request {idx + 1}: Received ({duration:.2f}s), content_len={content_len}: {response_preview}...")
            else:
                print_error(f"Request {idx + 1}: {result.error}")

    results['first_request_times'] = [r.total_time_ms for r in first_results if r.success]

    # Step 4: Create extended prompts
    print_section("Step 4: Creating extended prompts")

    extended_prompts = []
    for result in first_results:
        if result.success and result.response_content:
            extended_body = f"Original prompt:\n{prompts[result.prompt_id]}\n\n[LLM Response]:\n{result.response_content}\n\n{config.short_question}"

            extended_prompts.append({
                'prompt_id': result.prompt_id,
                'original': prompts[result.prompt_id],
                'llm_response': result.response_content
            })
            print_success(f"Extended prompt {result.prompt_id + 1}: Created")
        else:
            print_warning(f"Extended prompt {result.prompt_id + 1}: Skipped (no response)")

    results['prompts_used'] = len(extended_prompts)

    # Step 5: Send extended requests in reverse order
    print_section("Step 5: Sending extended requests (REVERSE ORDER)")
    print(color("This forces the benchmark to rely on prefix matching:", Colors.YELLOW))
    print(color("  Without prefix: Extended Prompt 0 -> Backend N-1 (no cache) = SLOW", Colors.YELLOW))
    print(color("  With prefix:   Extended Prompt 0 -> Backend 0 (has cache) = FAST", Colors.YELLOW))

    second_results = []

    # Send in reverse order - this is critical for the benchmark
    for extended in reversed(extended_prompts):
        if not extended:
            continue

        print_info(f"Sending extended request for prompt {extended['prompt_id'] + 1}...")
        if config.stream:
            result = send_request_streaming(config.balancer_url, extended['llm_response'], config.model, config)
        else:
            result = send_request(config.balancer_url, extended['llm_response'], config.model, config.stream, config)
        result.prompt_id = extended['prompt_id']
        second_results.append(result)

        if result.success:
            response_preview = result.response_content[:50] if result.response_content else 'No content'
            duration = result.total_time_ms / 1000 if result.total_time_ms else 0
            print_success(f"Request {extended['prompt_id'] + 1}: Received ({duration:.2f}s): {response_preview}...")
        else:
            print_error(f"Request {extended['prompt_id'] + 1}: {result.error}")

    results['second_request_times'] = [r.total_time_ms for r in second_results if r.success]

    # Step 6: Analyze and report results
    print_section("Analysis")

    # Count successful pairs
    successful_pairs = 0
    first_times = []
    second_times = []

    for result in second_results:
        if result.success:
            first_result = next((r for r in first_results if r.prompt_id == result.prompt_id), None)
            if first_result and first_result.success and first_result.total_time_ms:
                successful_pairs += 1
                first_times.append(first_result.total_time_ms)
                second_times.append(result.total_time_ms)

    results['successful_pairs'] = successful_pairs

    print(f"Successful request pairs: {successful_pairs}/{num_prompts}")

    if successful_pairs > 0:
        # Calculate statistics
        first_avg = sum(first_times) / len(first_times)
        second_avg = sum(second_times) / len(second_times)

        first_min = min(first_times)
        first_max = max(first_times)
        second_min = min(second_times)
        second_max = max(second_times)

        print_section("Timing Statistics (milliseconds)")
        print(f"\n{color('First Request (Large Prompt):', Colors.BOLD)}")
        print(f"  Average: {first_avg / 1000:.2f}s")
        print(f"  Min: {first_min / 1000:.2f}s")
        print(f"  Max: {first_max / 1000:.2f}s")

        print(f"\n{color('Second Request (Extended Prompt):', Colors.BOLD)}")
        print(f"  Average: {second_avg / 1000:.2f}s")
        print(f"  Min: {second_min / 1000:.2f}s")
        print(f"  Max: {second_max / 1000:.2f}s")

        # Calculate speedup
        speedup = first_avg / second_avg if second_avg > 0 else 1
        improvement = ((first_avg - second_avg) / first_avg * 100) if first_avg > 0 else 0

        print_section("Performance Comparison")
        print(f"\n  Speedup: {speedup:.2f}x faster on average")
        print(f"  Improvement: {improvement:.1f}% faster on average")

        print_section("Per-Request Breakdown")

        for result in second_results:
            if result.success:
                first_result = next((r for r in first_results if r.prompt_id == result.prompt_id), None)
                if first_result and first_result.success and first_result.total_time_ms:
                    r1 = first_result.total_time_ms
                    r2 = result.total_time_ms
                    imp = ((r1 - r2) / r1 * 100) if r1 > 0 else 0
                    spd = (r1 / r2) if r2 > 0 else 1

                    if spd > 1.1:
                        indicator = color('✓', Colors.GREEN)
                    elif spd > 0.9:
                        indicator = color('~', Colors.YELLOW)
                    else:
                        indicator = color('✗', Colors.RED)

                    print(f"  Request {result.prompt_id + 1}: {indicator} {spd:.2f}x ({imp:.1f}% faster)")

        print_section("Interpretation")
        print("""
  This benchmark demonstrates the prefix matching feature of the load balancer:

  - The first request to each backend processes the large prompt from scratch
  - The backend caches this prompt in its prefixCache after processing
  - The extended prompts are sent in REVERSE order
  - With prefix matching, the balancer routes each extended prompt to the
    SAME backend that cached the original prompt
  - The backend can then leverage its KV cache for faster prompt processing
  - The speedup you see is from the backend's KV cache remembering the prefix

  Without prefix matching, the extended prompts would route to different
  backends (based on priority/round-robin), and each would process from
  scratch, showing no significant speedup.
""")

    else:
        print(color("No successful request pairs found.", Colors.RED))
        print(color("Check that the balancer is running and backends are healthy.", Colors.YELLOW))

    return results

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='LLM Balancer Prefix Matching Benchmark',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark_prefix_matching.py                          # Basic benchmark
  python benchmark_prefix_matching.py --stream                 # Streaming mode
  python benchmark_prefix_matching.py --tokens 15000           # Custom token count
  python benchmark_prefix_matching.py --fixed --prompt-file prompts.txt  # Fixed prompts
  python benchmark_prefix_matching.py --model llama2:13b       # Custom model
        """
    )

    parser.add_argument('--url', type=str, default='http://localhost:3001',
                        help='Balancer URL (default: http://localhost:3001)')
    parser.add_argument('--stream', action='store_true',
                        help='Enable streaming benchmark')
    parser.add_argument('--fixed', action='store_true',
                        help='Use fixed prompts from file')
    parser.add_argument('--prompt-file', type=str,
                        help='Path to file with one prompt per line')
    parser.add_argument('--tokens', type=int, default=20000,
                        help='Target token count per prompt (default: 20000)')
    parser.add_argument('--output-tokens', type=int, default=10,
                        help='Max output tokens (default: 10)')
    parser.add_argument('--concurrency', type=int, default=4,
                        help='Request concurrency (default: 4)')
    parser.add_argument('--model', type=str, default='qwen/qwen3.5-35b-a3b',
                        help='Model name to use (default: qwen/qwen3.5-35b-a3b)')
    parser.add_argument('--short-question', type=str, default='What is the main topic?',
                        help='Follow-up question to ask after LLM response (default: "What is the main topic?")')
    parser.add_argument('--debug', action='store_true',
                        help='Enable debug output to see raw response details')

    args = parser.parse_args()

    # Validate arguments
    if args.fixed and not args.prompt_file:
        print_error("Please specify --prompt-file when using --fixed")
        sys.exit(1)

    # Create configuration
    config = BenchmarkConfig(
        balancer_url=args.url,
        stream=args.stream,
        fixed_prompts=args.fixed,
        prompt_file=args.prompt_file,
        tokens=args.tokens,
        output_tokens=args.output_tokens,
        concurrency=args.concurrency,
        model=args.model,
        short_question=args.short_question,
        debug=args.debug
    )

    # Print configuration
    print_header("LLM Balancer Prefix Matching Benchmark")
    print(f"  URL: {config.balancer_url}")
    print(f"  Streaming: {config.stream}")
    print(f"  Fixed Prompts: {config.fixed_prompts}")
    if config.fixed_prompts:
        print(f"  Prompt File: {config.prompt_file}")
    else:
        print(f"  Tokens per Prompt: {config.tokens}")
    print(f"  Output Tokens: {config.output_tokens}")
    print(f"  Concurrency: {config.concurrency}")
    print(f"  Model: {config.model}")
    print(f"  Short Question: {config.short_question}")

    # Run benchmark
    try:
        results = run_benchmark(config)

        # Exit with appropriate code
        if results['successful_pairs'] > 0:
            sys.exit(0)
        else:
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\nBenchmark interrupted by user")
        sys.exit(130)
    except Exception as e:
        print_error(f"Benchmark failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()