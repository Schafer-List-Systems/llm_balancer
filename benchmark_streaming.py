#!/usr/bin/env python3
"""
Streaming Benchmark Script

Measures:
1. Prompt processing speed (tokens/second) - time from request to first chunk
2. Token generation speed (tokens/second) - time from first chunk to completion

Usage:
    python benchmark_streaming.py
    python benchmark_streaming.py --model other-model --api-url http://localhost:4000/v1/chat/completions
"""

import argparse
import time
import requests
import json
import sys


def generate_random_text(num_words=5000):
    """Generate random text with specified number of words."""
    import random
    import string

    word_list = []
    for _ in range(5000):
        word = ''.join(random.choices(string.ascii_lowercase, k=random.randint(3, 10)))
        word_list.append(word)

    lines = []
    for _ in range(num_words // 10):
        line = ' '.join(random.choices(word_list, k=10))
        lines.append(line)

    return '\n'.join(lines)


def run_streaming_benchmark(
    api_url: str = "http://localhost:4000/v1/chat/completions",
    model: str = "qwen3.5-35b-a3b",
    max_tokens: int = 2000,
    num_prompt_words: int = 5000,
    output_file: str = None
) -> dict:
    """
    Measure prompt processing and token generation speed using streaming.

    Args:
        api_url: LiteLLM or vLLM API endpoint
        model: Model name to use
        max_tokens: Maximum completion tokens
        num_prompt_words: Number of random words in prompt
        output_file: Optional file to write full response

    Returns:
        Dictionary with benchmark results
    """
    # Generate large random text
    try:
        random_text = generate_random_text(num_prompt_words)
    except Exception as e:
        print(f"  ERROR: Failed to generate random text: {e}")
        return {'error': f'Failed to generate random text: {e}'}

    prompt = f"""Please analyze the following text and tell me exactly how many words it contains. Count each space-separated token as one word.

TEXT BEGIN:
{random_text}
TEXT END:

How many words are in the text above? Please provide only the number."""

    # Measure time
    start_time = time.time()
    first_chunk_time = None
    completion_time = None
    prompt_tokens = None
    completion_tokens = 0  # Count each chunk as one completion token

    print(f"  Sending request to {api_url}...")
    try:
        response = requests.post(
            api_url,
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': max_tokens,
                'stream': True
            },
            timeout=300,
            stream=True
        )
    except requests.exceptions.Timeout as e:
        print(f"  ERROR: Request timed out after 300 seconds: {e}")
        return {'error': f'Request timed out: {e}'}
    except requests.exceptions.ConnectionError as e:
        print(f"  ERROR: Connection error: {e}")
        return {'error': f'Connection error: {e}'}
    except requests.exceptions.RequestException as e:
        print(f"  ERROR: Request failed: {e}")
        return {'error': f'Request failed: {e}'}

    print(f"  Response status: {response.status_code}")
    print(f"  Response headers: {dict(response.headers)}")

    # Check for error response
    if response.status_code != 200:
        try:
            error_data = response.json()
            print(f"  ERROR: API returned error: {error_data}")
            return {'error': f'API error: {error_data}'}
        except:
            print(f"  ERROR: API returned non-200 status: {response.status_code}")
            return {'error': f'API returned status {response.status_code}'}

    # Check if response is actually streaming
    content_type = response.headers.get('content-type', '')
    if 'stream' not in content_type.lower():
        print(f"  WARNING: Response is not streaming (content-type: {content_type})")
        print(f"  This may indicate the balancer is buffering the response")

    print(f"  Starting to iterate over response lines...")

    # Process streaming response line by line
    line_count = 0
    full_response = []
    try:
        for line in response.iter_lines():
            if not line:
                continue

            # Decode line if it's bytes
            if isinstance(line, bytes):
                line = line.decode('utf-8')

            # Skip empty lines
            if not line.strip():
                continue

            line_count += 1
            full_response.append(line)

            # Handle [DONE] message
            if line == 'data: [DONE]' or line.strip() == '[DONE]':
                print(f"  Received [DONE] at line {line_count}")
                completion_time = time.time()
                break

            # Parse SSE data
            if line.startswith('data: '):
                try:
                    data = json.loads(line[6:])

                    # Track first chunk arrival time
                    if first_chunk_time is None:
                        first_chunk_time = time.time()
                        print(f"  First chunk received")

                    # Check for usage stats (may appear in final chunk)
                    if data.get('usage'):
                        prompt_tokens = data['usage'].get('prompt_tokens')
                        completion_tokens = data['usage'].get('completion_tokens')
                        print(f"  Usage found: prompt={prompt_tokens}, completion={completion_tokens}")
                    else:
                        # Count each chunk as one completion token
                        completion_tokens += 1

                    # Check for completion
                    if data.get('choices') and len(data['choices']) > 0:
                        finish_reason = data['choices'][0].get('finish_reason')
                        if finish_reason:
                            print(f"  Finish reason: {finish_reason}")
                            completion_time = time.time()

                except json.JSONDecodeError as e:
                    print(f"  JSON decode error: {e}")
                    pass

        print(f"  Total lines processed: {line_count}")

        # Write full response to file if requested
        if output_file:
            with open(output_file, 'w') as f:
                f.write('\n'.join(full_response))
            print(f"  Full response written to {output_file}")

        # Check if we got a [DONE] message
        if completion_time is None:
            print(f"  WARNING: Did not receive [DONE] message")

    except requests.exceptions.RequestException as e:
        print(f"  ERROR: Failed to iterate over response: {e}")
        return {'error': f'Failed to iterate response: {e}'}
    except Exception as e:
        print(f"  ERROR: Unexpected error during streaming: {e}")
        return {'error': f'Unexpected error: {e}'}

    end_time = time.time()
    total_elapsed = end_time - start_time

    # Calculate metrics
    time_to_first_chunk = first_chunk_time - start_time if first_chunk_time else None
    time_to_generate = completion_time - first_chunk_time if (first_chunk_time and completion_time) else None

    # If we didn't get usage stats, use chunk count as completion tokens
    if completion_tokens is None:
        completion_tokens = completion_tokens  # Already counted chunks

    # Calculate speeds
    prompt_speed = None
    generation_speed = None

    if prompt_tokens and time_to_first_chunk and time_to_first_chunk > 0:
        prompt_speed = prompt_tokens / time_to_first_chunk

    if completion_tokens and time_to_generate and time_to_generate > 0:
        generation_speed = completion_tokens / time_to_generate

    return {
        'test': 'streaming_benchmark',
        'elapsed_seconds': total_elapsed,
        'time_to_first_chunk_seconds': time_to_first_chunk,
        'time_to_generate_seconds': time_to_generate,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': prompt_tokens + completion_tokens if prompt_tokens and completion_tokens else None,
        'prompt_speed': prompt_speed,
        'generation_speed': generation_speed
    }


def print_results(results: dict) -> None:
    """Print formatted benchmark results."""
    print("\n" + "=" * 60)
    print("STREAMING BENCHMARK RESULTS")
    print("=" * 60)

    print("\n--- TIMING BREAKDOWN ---")
    print(f"  Total time:              {results['elapsed_seconds']:.2f} seconds")
    if results['time_to_first_chunk_seconds']:
        print(f"  Time to first chunk:     {results['time_to_first_chunk_seconds']:.2f} seconds")
    if results['time_to_generate_seconds']:
        print(f"  Time to generate:        {results['time_to_generate_seconds']:.2f} seconds")

    print("\n--- TOKEN COUNTS ---")
    print(f"  Prompt tokens:           {results['prompt_tokens']:,}" if results['prompt_tokens'] else "  Prompt tokens:           N/A")
    print(f"  Completion tokens:       {results['completion_tokens']:,}" if results['completion_tokens'] else "  Completion tokens:       N/A")
    print(f"  Total tokens:            {results['total_tokens']:,}" if results['total_tokens'] else "  Total tokens:            N/A")

    print("\n--- SPEED METRICS ---")
    if results['prompt_speed']:
        print(f"  Prompt processing speed: {results['prompt_speed']:.2f} tokens/sec")
    else:
        print(f"  Prompt processing speed: N/A")
    if results['generation_speed']:
        print(f"  Generation speed:        {results['generation_speed']:.2f} tokens/sec")
    else:
        print(f"  Generation speed:        N/A")

    print("\n" + "=" * 60 + "\n")


def main():
    """Run streaming benchmark."""
    parser = argparse.ArgumentParser(
        description="Benchmark streaming prompt processing and token generation speeds.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark_streaming.py                          # Use defaults (LiteLLM, qwen3.5-35b-a3b)
  python benchmark_streaming.py --model other-model      # Benchmark a different model
  python benchmark_streaming.py --api-url http://...     # Use a different API endpoint
  python benchmark_streaming.py --max-tokens 10000       # Generate more tokens
  python benchmark_streaming.py --prompt-words 10000     # Use more prompt words
        """
    )

    parser.add_argument(
        '--api-url',
        type=str,
        default='http://localhost:4000/v1/chat/completions',
        help='API endpoint (default: http://localhost:4000/v1/chat/completions)'
    )

    parser.add_argument(
        '--model',
        type=str,
        default='qwen/qwen3.5-35b-a3b',
        help='Model name to benchmark (default: qwen/qwen3.5-35b-a3b)'
    )

    parser.add_argument(
        '--max-tokens',
        type=int,
        default=2000,
        help='Maximum generation tokens (default: 2000)'
    )

    parser.add_argument(
        '--prompt-words',
        type=int,
        default=5000,
        help='Number of random words in prompt (default: 5000)'
    )

    parser.add_argument(
        '--output-file',
        type=str,
        help='Write full streaming response to a file (instead of stdout)'
    )

    args = parser.parse_args()

    print("Starting streaming benchmark...")
    print(f"Model: {args.model}")
    print(f"API: {args.api_url}")
    print(f"Max tokens: {args.max_tokens}")
    print(f"Prompt words: {args.prompt_words}")
    print("This may take a few minutes.\n")

    # Run benchmark
    results = run_streaming_benchmark(
        api_url=args.api_url,
        model=args.model,
        max_tokens=args.max_tokens,
        num_prompt_words=args.prompt_words,
        output_file=args.output_file
    )

    # Print results
    print_results(results)


if __name__ == "__main__":
    main()
