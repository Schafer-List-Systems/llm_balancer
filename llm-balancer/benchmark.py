#!/usr/bin/env python3
"""
LLM Balancer Comprehensive Benchmark Script

A powerful, flexible benchmark tool for testing LLM balancer performance,
including prefix matching benefits, frontend caching, and streaming performance.

Features:
- Prefix matching vs frontend caching benchmark modes
- Streaming and non-streaming options
- Fixed prompts (from file) or generated random large prompts
- Reverse order routing to force prefix matching benefits
- Comprehensive timing metrics and speedup analysis

Usage:
    python benchmark.py --mode prefix [--stream] [--fixed] [--tokens 20000]
    python benchmark.py --mode front --fixed --prompt-file prompts.txt
    python benchmark.py --stream --concurrency 8 --tokens 15000

Examples:
    # Basic prefix matching benchmark
    python benchmark.py

    # Frontend caching with fixed prompts
    python benchmark.py --mode front --fixed --prompt-file prompts.txt

    # Streaming benchmark
    python benchmark.py --stream

    # Custom configuration
    python benchmark.py --tokens 10000 --concurrency 4 --model llama2:13b
"""

import argparse
import json
import random
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
    mode: str  # 'prefix' or 'front'
    stream: bool
    fixed_prompts: bool
    prompt_file: Optional[str]
    tokens: int
    output_tokens: int
    concurrency: int
    model: str
    reverse_order: bool = True  # Always use reverse order for fair comparison

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
        'resources', 'for', 'training', 'inference', 'and', 'deployment', 'at', 'scale',
        'Neural', 'networks', 'utilize', 'layered', 'architectures', 'to', 'process', 'information',
        'Deep', 'learning', 'enables', 'automatic', 'feature', 'extraction', 'from', 'raw', 'data',
        'Artificial', 'intelligence', 'transforms', 'industries', 'through', 'automation', 'and', 'insights',
        'Natural', 'language', 'processing', 'enables', 'machines', 'to', 'understand', 'human', 'communication',
        'Computer', 'vision', 'allows', 'systems', 'to', 'interpret', 'visual', 'information', 'from', 'images',
        'Reinforcement', 'learning', 'enables', 'agents', 'to', 'learn', 'through', 'trial', 'and', 'error',
        'Transformers', 'revolutionized', 'deep', 'learning', 'with', 'attention', 'mechanisms', 'and', 'parallelism',
        'Gradient', 'descent', 'optimizes', 'model', 'parameters', 'during', 'training', 'iterations', 'systematically',
        'Backpropagation', 'calculates', 'gradients', 'efficiently', 'through', 'computational', 'graphs', 'accurately',
        'Activation', 'functions', 'introduce', 'nonlinearity', 'enabling', 'networks', 'to', 'approximate', 'complex',
        'Convolutional', 'neural', 'networks', 'excel', 'at', 'image', 'recognition', 'and', 'spatial', 'feature', 'extraction',
        'Recurrent', 'networks', 'process', 'sequential', 'data', 'using', 'memory', 'cells', 'and', 'temporal', 'dependencies'
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

def send_request(balancer_url: str, prompt: str, model: str, stream: bool) -> RequestResult:
    """Send a request to the balancer and measure timing."""
    url = f"{balancer_url}/v1/chat/completions"

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
            content = response_data.get('choices', [{}])[0].get('message', {}).get('content', '')

            return RequestResult(
                success=True,
                prompt_id=0,  # Will be set by caller
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

def send_request_streaming(balancer_url: str, prompt: str, model: str) -> RequestResult:
    """Send a streaming request and measure timing."""
    url = f"{balancer_url}/v1/chat/completions"

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
                    if line != 'data: [DONE]':
                        try:
                            full_response.append(json.loads(line[5:].strip()))
                        except:
                            pass

        total_time = time.time() - start_time
        first_chunk_time_ms = (first_chunk_time - start_time) * 1000 if first_chunk_time else None
        total_time_ms = total_time * 1000

        # Get content from last message
        content = ''
        if full_response:
            last_msg = full_response[-1]
            content = last_msg.get('choices', [{}])[0].get('message', {}).get('content', '')

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
    """Run the complete benchmark."""
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
            print_error("Please specify a prompt file with --prompt-file")
            return results
    else:
        # Generate random prompts
        for i in range(num_prompts):
            prompt = generate_large_prompt(config.tokens)
            # Make each prompt unique
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
            future = executor.submit(send_func, config.balancer_url, prompt, config.model, config.stream)
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
                print_success(f"Request {idx + 1}: Received ({duration:.2f}s): {response_preview}...")
            else:
                print_error(f"Request {idx + 1}: {result.error}")

    results['first_request_times'] = [r.total_time_ms for r in first_results if r.success]

    # Step 4: Create extended prompts
    print_section("Step 4: Creating extended prompts")

    extended_prompts = []
    for result in first_results:
        if result.success and result.response_content:
            extended_body = f"{result.response_content}\n\n[LLM Response]: {result.response_content}\n\nWhat is the main topic?"
            extended_prompts.append({
                'prompt_id': result.prompt_id,
                'original_length': len(prompts[result.prompt_id]),
                'extended_length': len(extended_body),
                'llm_response': result.response_content
            })
            print_success(f"Extended prompt {result.prompt_id + 1}: {len(extended_body)} chars")
        else:
            print_warning(f"Extended prompt {result.prompt_id + 1}: Skipped (no response)")

    results['prompts_used'] = len(extended_prompts)

    # Step 5: Send extended requests in reverse order
    print_section("Step 5: Sending extended requests (reverse order)")
    print(color("Note: Sending in reverse order forces the balancer to potentially route to different backends, ", Colors.YELLOW))
    print(color("which makes prefix matching the key factor for finding the correct backend with cached prompts.", Colors.YELLOW))

    second_results = []

    send_func = send_request_streaming if config.stream else send_request

    # Send in reverse order
    for extended in reversed(extended_prompts):
        if not extended:
            continue

        print_info(f"Sending extended request for prompt {extended['prompt_id'] + 1}...")
        result = send_func(config.balancer_url, f"Original: {prompts[extended['prompt_id']]}\n\nResponse: {extended['llm_response']}\n\nWhat is the main topic?", config.model, config.stream)
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
        if config.mode == 'prefix':
            print("""  - With prefix matching: Extended prompts route to the SAME backend
    that cached the original prompt, enabling faster prompt processing
  - Without prefix matching: Requests route to ANY available backend
    (no cache benefit from previous requests)
  - The speedup you see here is primarily from the backend's KV cache,
    which remembers the prompt prefix from the first request.""")
        else:
            print("""  - This benchmark tests the frontend caching layer
  - Compare results with and without the frontend cache enabled
  - The difference shows the effectiveness of the caching strategy""")

    else:
        print(color("No successful request pairs found.", Colors.RED))
        print(color("Check that the balancer is running and backends are healthy.", Colors.YELLOW))

    return results

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='LLM Balancer Comprehensive Benchmark',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark.py --mode prefix
  python benchmark.py --mode front --fixed --prompt-file prompts.txt
  python benchmark.py --stream --concurrency 8
  python benchmark.py --tokens 15000 --model llama2:13b
        """
    )

    parser.add_argument('--url', type=str, default='http://localhost:3001',
                        help='Balancer URL (default: http://localhost:3001)')
    parser.add_argument('--mode', type=str, choices=['prefix', 'front'], default='prefix',
                        help='Benchmark mode: prefix or front (default: prefix)')
    parser.add_argument('--stream', action='store_true',
                        help='Enable streaming benchmark')
    parser.add_argument('--fixed', action='store_true',
                        help='Use fixed prompts instead of generated')
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

    args = parser.parse_args()

    # Validate arguments
    if args.fixed and not args.prompt_file:
        print_error("Please specify --prompt-file when using --fixed")
        sys.exit(1)

    # Create configuration
    config = BenchmarkConfig(
        balancer_url=args.url,
        mode=args.mode,
        stream=args.stream,
        fixed_prompts=args.fixed,
        prompt_file=args.prompt_file,
        tokens=args.tokens,
        output_tokens=args.output_tokens,
        concurrency=args.concurrency,
        model=args.model
    )

    # Print configuration
    print_header("LLM Balancer Benchmark")
    print(f"  URL: {config.balancer_url}")
    print(f"  Mode: {config.mode}")
    print(f"  Streaming: {config.stream}")
    print(f"  Fixed Prompts: {config.fixed_prompts}")
    if config.fixed_prompts:
        print(f"  Prompt File: {config.prompt_file}")
    else:
        print(f"  Tokens per Prompt: {config.tokens}")
    print(f"  Output Tokens: {config.output_tokens}")
    print(f"  Concurrency: {config.concurrency}")
    print(f"  Model: {config.model}")

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
