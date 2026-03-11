#!/usr/bin/env python3
"""
vLLM Cluster Benchmark Script

Measures:
1. Prompt processing speed (tokens/second)
2. Token generation speed (tokens/second)

Usage:
    python benchmark.py
    python benchmark.py --model other-model --api-url http://localhost:8000/v1/chat/completions
"""

import argparse
import time
import requests
import json


def run_prompt_benchmark(api_url: str = "http://localhost:4000/v1/chat/completions",
                         model: str = "qwen3.5-35b-a3b",
                         max_tokens: int = 2000) -> dict:
    """
    Measure prompt processing speed using a 50,000 word input.

    Args:
        api_url: LiteLLM or vLLM API endpoint
        model: Model name to use
        max_tokens: Maximum completion tokens

    Returns:
        Dictionary with benchmark results
    """
    # Generate random 50,000 word text
    import random
    import string

    word_list = []
    for _ in range(5000):
        word = ''.join(random.choices(string.ascii_lowercase, k=random.randint(3, 10)))
        word_list.append(word)

    lines = []
    for _ in range(5000):
        line = ' '.join(random.choices(word_list, k=10))
        lines.append(line)

    random_text = '\n'.join(lines)

    prompt = f"""Please analyze the following text and tell me exactly how many words it contains. Count each space-separated token as one word.

TEXT BEGIN:
{random_text}
TEXT END:

How many words are in the text above? Please provide only the number."""

    # Measure time
    start_time = time.time()

    response = requests.post(
        api_url,
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'stream': False
        },
        timeout=300
    )

    end_time = time.time()
    elapsed = end_time - start_time

    # Parse results
    result = response.json()
    prompt_tokens = result['usage']['prompt_tokens']
    completion_tokens = result['usage']['completion_tokens']
    total_tokens = result['usage']['total_tokens']

    return {
        'test': 'prompt_processing',
        'elapsed_seconds': elapsed,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': total_tokens,
        'prompt_speed': prompt_tokens / elapsed,
        'total_speed': total_tokens / elapsed
    }


def run_generation_benchmark(api_url: str = "http://localhost:4000/v1/chat/completions",
                             model: str = "qwen3.5-35b-a3b",
                             max_tokens: int = 8000) -> dict:
    """
    Measure token generation speed using a long poem + analysis task.

    Args:
        api_url: LiteLLM or vLLM API endpoint
        model: Model name to use
        max_tokens: Maximum completion tokens

    Returns:
        Dictionary with benchmark results
    """
    prompt = """Write a very very long poem. Then perform an extensive analysis and interpretation of your poem.

Write as much as you can, be extremely detailed and thorough."""

    # Measure time
    start_time = time.time()

    response = requests.post(
        api_url,
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'stream': False,
            'temperature': 0.7
        },
        timeout=600
    )

    end_time = time.time()
    elapsed = end_time - start_time

    # Parse results
    result = response.json()
    prompt_tokens = result['usage']['prompt_tokens']
    completion_tokens = result['usage']['completion_tokens']
    total_tokens = result['usage']['total_tokens']

    return {
        'test': 'token_generation',
        'elapsed_seconds': elapsed,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'total_tokens': total_tokens,
        'generation_speed': completion_tokens / elapsed
    }


def print_results(prompt_results: dict, generation_results: dict) -> None:
    """Print formatted benchmark results."""
    print("\n" + "=" * 60)
    print("vLLM CLUSTER BENCHMARK RESULTS")
    print("=" * 60)

    print("\n--- PROMPT PROCESSING ---")
    print(f"  Time:              {prompt_results['elapsed_seconds']:.2f} seconds")
    print(f"  Prompt tokens:     {prompt_results['prompt_tokens']:,}")
    print(f"  Completion tokens: {prompt_results['completion_tokens']:,}")
    print(f"  Total tokens:      {prompt_results['total_tokens']:,}")
    print(f"  Prompt speed:      {prompt_results['prompt_speed']:.2f} tokens/sec")
    print(f"  Total speed:       {prompt_results['total_speed']:.2f} tokens/sec")

    print("\n--- TOKEN GENERATION ---")
    print(f"  Time:              {generation_results['elapsed_seconds']:.2f} seconds")
    print(f"  Prompt tokens:     {generation_results['prompt_tokens']:,}")
    print(f"  Completion tokens: {generation_results['completion_tokens']:,}")
    print(f"  Total tokens:      {generation_results['total_tokens']:,}")
    print(f"  Generation speed:  {generation_results['generation_speed']:.2f} tokens/sec")

    print("\n" + "=" * 60 + "\n")


def main():
    """Run all benchmarks."""
    parser = argparse.ArgumentParser(
        description="Benchmark vLLM cluster prompt processing and token generation speeds.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python benchmark.py                          # Use defaults (LiteLLM, qwen3.5-35b-a3b)
  python benchmark.py --model other-model      # Benchmark a different model
  python benchmark.py --api-url http://...     # Use a different API endpoint
  python benchmark.py --max-tokens 10000       # Generate more tokens
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
        default='qwen3.5-35b-a3b',
        help='Model name to benchmark (default: qwen3.5-35b-a3b)'
    )

    parser.add_argument(
        '--max-tokens',
        type=int,
        default=8000,
        help='Maximum generation tokens (default: 8000)'
    )

    args = parser.parse_args()

    print("Starting vLLM cluster benchmark...")
    print(f"Model: {args.model}")
    print(f"API: {args.api_url}")
    print(f"Max tokens: {args.max_tokens}")
    print("This may take a few minutes.\n")

    # Run prompt benchmark
    print("[1/2] Running prompt processing benchmark...")
    prompt_results = run_prompt_benchmark(
        api_url=args.api_url,
        model=args.model,
        max_tokens=2000
    )
    print(f"      Completed in {prompt_results['elapsed_seconds']:.2f}s\n")

    # Run generation benchmark
    print("[2/2] Running token generation benchmark...")
    generation_results = run_generation_benchmark(
        api_url=args.api_url,
        model=args.model,
        max_tokens=args.max_tokens
    )
    print(f"      Completed in {generation_results['elapsed_seconds']:.2f}s\n")

    # Print results
    print_results(prompt_results, generation_results)


if __name__ == "__main__":
    main()
