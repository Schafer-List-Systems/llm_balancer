/**
 * Prefix Matching Performance Benchmark - PLAN
 *
 * TO BE IMPLEMENTED:
 *
 * This benchmark demonstrates prefix matching benefits by exploiting deterministic routing:
 *
 * CRITICAL DESIGN:
 * 1. Send N initial prompts to N backends (Backend 0 gets Prompt 0, etc.)
 * 2. Send N extended prompts in REVERSE order (Extended Prompt 0 sent LAST)
 *
 * WHY REVERSE ORDER IS CRITICAL:
 * Without prefix matching, the balancer uses priority/round-robin:
 *   - Extended Prompt 0 would route to Backend N-1 (WRONG, no cache)
 *   - Extended Prompt 1 would route to Backend N-2 (WRONG, no cache)
 *
 * With prefix matching:
 *   - Extended Prompt 0 routes to Backend 0 (CORRECT, has prefix cache!)
 *
 * The reverse order forces a mismatch between "which backend cached the prompt"
 * and "which backend would normally handle this request", making prefix matching
 * the DIFFERENCING factor for performance.
 *
 * IMPLEMENTATION PENDING USER APPROVAL
 */

const http = require('http');

// Configuration
const DEFAULT_BALANCER_URL = 'http://localhost:3001';
const LARGE_PROMPT_TOKENS = 20000;  // Target ~20k tokens (~80k characters)
const OUTPUT_TOKENS = 10;  // Limit output to ~10 tokens
const SHORT_QUESTION = 'What is the main topic?';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const color = (code, str) => `${code}${str}${colors.reset}`;

/**
 * Get number of backends from the balancer
 */
async function getBackendCount(balancerUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL('/backends', balancerUrl);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.backends.length);
        } catch (e) {
          reject(new Error(`Failed to parse backends response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => reject(new Error('Timeout getting backends')));
  });
}

/**
 * Generate a large random text prompt
 */
function generateLargePrompt(numTokens) {
  // Approximate: 1 token ≈ 4 characters in English
  const numChars = numTokens * 4;
  const words = [
    'The', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'In', 'the', 'world', 'of', 'programming', 'and', 'software', 'development',
    'Algorithms', 'and', 'data', 'structures', 'form', 'foundational', 'concepts',
    'Understanding', 'complexity', 'analysis', 'helps', 'developers', 'write', 'efficient',
    'Code', 'optimization', 'is', 'crucial', 'for', 'performance', 'critical', 'applications',
    'Modern', 'systems', 'require', 'scalable', 'solutions', 'that', 'handle', 'large',
    'Data', 'processing', 'pipelines', 'need', 'robust', 'architecture', 'design', 'patterns',
    'Machine', 'learning', 'models', 'require', 'massive', 'datasets', 'and', 'computational',
    'resources', 'for', 'training', 'inference', 'and', 'deployment', 'at', 'scale'
  ];

  let prompt = 'Write a comprehensive essay about technology and innovation:\n\n';
  let currentLength = prompt.length;

  while (currentLength < numChars) {
    const word = words[Math.floor(Math.random() * words.length)];
    prompt += word + ' ';
    currentLength += word.length + 1;
  }

  return prompt.trim();
}

/**
 * Send a request to the balancer
 */
async function sendRequest(balancerUrl, body, model = 'qwen/qwen3.5-35b-a3b') {
  const url = new URL('/v1/chat/completions', balancerUrl);
  const requestData = {
    model: model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: body }
    ],
    stream: false,
    max_tokens: OUTPUT_TOKENS
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(requestData);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      let firstChunkTime = null;

      res.on('data', chunk => {
        if (firstChunkTime === null) {
          firstChunkTime = Date.now();
        }
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const totalTime = Date.now() - firstChunkTime;
          resolve({
            success: true,
            data: response,
            firstChunkTime: firstChunkTime,
            totalTime: totalTime,
            statusCode: res.statusCode
          });
        } catch (e) {
          resolve({
            success: false,
            error: `Failed to parse response: ${e.message}`,
            raw: data
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(300000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Run the prefix matching benchmark
 */
async function runBenchmark(balancerUrl, concurrency) {
  console.log(color(colors.bold, '\n========================================'));
  console.log(color(colors.bold, 'Prefix Matching Performance Benchmark'));
  console.log(color(colors.bold, '========================================\n'));

  console.log(color(colors.cyan, 'Configuration:'));
  console.log(`  Balancer URL: ${balancerUrl}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Target tokens per prompt: ${LARGE_PROMPT_TOKENS}`);
  console.log(`  Output tokens limit: ${OUTPUT_TOKENS}`);
  console.log(`  Short question: "${SHORT_QUESTION}"`);
  console.log();

  // Step 1: Discover backends
  console.log(color(colors.yellow, 'Step 1: Discovering backends...'));
  const backendCount = await getBackendCount(balancerUrl);
  console.log(color(colors.green, `  Found ${backendCount} backends`));
  console.log();

  const numPrompts = Math.min(backendCount, concurrency);
  console.log(color(colors.yellow, `Step 2: Generating ${numPrompts} unique large prompts...`));

  // Step 2: Generate unique large prompts
  const prompts = [];
  for (let i = 0; i < numPrompts; i++) {
    // Make each prompt unique by adding a prefix
    const basePrompt = generateLargePrompt(LARGE_PROMPT_TOKENS);
    prompts.push({
      id: i,
      original: `${`PROMPT ${i + 1}: Unique content for benchmark ${i + 1}\n\n`}${basePrompt}`
    });
  }
  console.log(color(colors.green, `  Generated ${numPrompts} prompts (~${LARGE_PROMPT_TOKENS * numPrompts} total characters)`));
  console.log();

  // Step 3: Send initial requests concurrently
  console.log(color(colors.yellow, 'Step 3: Sending initial requests concurrently...'));
  const results1 = [];

  for (let i = 0; i < numPrompts; i++) {
    const prompt = prompts[i];
    console.log(`  Sending request ${i + 1}/${numPrompts}...`);
    const result = await sendRequest(balancerUrl, prompt.original);
    results1.push({
      promptId: i,
      success: result.success,
      response: result.success ? result.data : null,
      error: result.success ? null : result.error,
      firstChunkTime: result.success ? result.firstChunkTime : null,
      totalTime: result.success ? result.totalTime : null
    });

    if (!result.success) {
      console.error(color(colors.red, `    ERROR: ${result.error}`));
    } else {
      const content = result.data.choices?.[0]?.message?.content || 'No content';
      const duration = result.totalTime ? (result.totalTime / 1000).toFixed(2) : 'N/A';
      console.log(color(colors.green, `    Response received (${duration}s): ${content.substring(0, 50)}...`));
    }
  }
  console.log();

  // Step 4: Create extended prompts
  console.log(color(colors.yellow, 'Step 4: Creating extended prompts with responses...'));
  const extendedPrompts = [];

  for (let i = 0; i < results1.length; i++) {
    const result = results1[i];
    if (!result.success || !result.response?.choices?.[0]?.message?.content) {
      console.log(color(colors.red, `  Extended prompt ${i + 1}: SKIPPED (no response)`));
      continue;
    }

    const llmResponse = result.response.choices[0].message.content;
    const extendedBody = `${prompts[i].original}\n\n[LLM Response]: ${llmResponse}\n\n${SHORT_QUESTION}`;

    extendedPrompts.push({
      promptId: i,
      original: prompts[i].original,
      extended: extendedBody,
      llmResponse: llmResponse
    });

    console.log(`  Extended prompt ${i + 1}: ${extendedBody.length} characters`);
  }
  console.log();

  // Step 5: Send extended requests (in reverse order for interesting routing)
  console.log(color(colors.yellow, 'Step 5: Sending extended requests (reverse order)...'));
  console.log(color(colors.blue, '  Note: Sending in reverse order tests if prefix matching routes to correct backend\n'));

  const results2 = [];

  for (let i = extendedPrompts.length - 1; i >= 0; i--) {
    const extended = extendedPrompts[i];
    if (!extended) continue;

    console.log(`  Sending extended request ${extended.promptId + 1}/${extendedPrompts.length}...`);
    const result = await sendRequest(balancerUrl, extended.extended);

    results2.push({
      promptId: extended.promptId,
      success: result.success,
      response: result.success ? result.data : null,
      error: result.success ? null : result.error,
      firstChunkTime: result.success ? result.firstChunkTime : null,
      totalTime: result.success ? result.totalTime : null
    });

    if (!result.success) {
      console.error(color(colors.red, `    ERROR: ${result.error}`));
    } else {
      const content = result.success ? result.data.choices?.[0]?.message?.content || 'No content' : '';
      const duration = result.totalTime ? (result.totalTime / 1000).toFixed(2) : 'N/A';
      console.log(color(colors.green, `    Response received (${duration}s): ${content.substring(0, 50)}...`));
    }
  }
  console.log();

  // Step 6: Analyze results
  console.log(color(colors.bold, '========================================'));
  console.log(color(colors.bold, 'Analysis'));
  console.log(color(colors.bold, '========================================\n'));

  // Count successful pairs
  const successfulPairs = [];
  for (let i = 0; i < results1.length; i++) {
    const r1 = results1[i];
    const r2 = results2.find(r => r.promptId === i);

    if (r1.success && r2?.success) {
      successfulPairs.push({
        promptId: i,
        firstRequest: r1,
        secondRequest: r2
      });
    }
  }

  console.log(`Successful request pairs: ${successfulPairs.length}/${numPrompts}`);
  console.log();

  if (successfulPairs.length > 0) {
    // Calculate timing statistics
    const firstRequestDurations = successfulPairs.map(p => p.firstRequest.totalTime);
    const secondRequestDurations = successfulPairs.map(p => p.secondRequest.totalTime);

    const firstAvg = firstRequestDurations.reduce((a, b) => a + b, 0) / firstRequestDurations.length;
    const secondAvg = secondRequestDurations.reduce((a, b) => a + b, 0) / secondRequestDurations.length;

    const firstMin = Math.min(...firstRequestDurations);
    const firstMax = Math.max(...firstRequestDurations);
    const secondMin = Math.min(...secondRequestDurations);
    const secondMax = Math.max(...secondRequestDurations);

    console.log(color(colors.cyan, 'Timing Statistics (milliseconds):'));
    console.log();
    console.log(color(colors.bold, 'First Request (Large Prompt):'));
    console.log(`  Average: ${(firstAvg / 1000).toFixed(2)}s`);
    console.log(`  Min: ${(firstMin / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(firstMax / 1000).toFixed(2)}s`);
    console.log();
    console.log(color(colors.bold, 'Second Request (Extended Prompt):'));
    console.log(`  Average: ${(secondAvg / 1000).toFixed(2)}s`);
    console.log(`  Min: ${(secondMin / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(secondMax / 1000).toFixed(2)}s`);
    console.log();

    const speedup = firstAvg / secondAvg;
    const improvement = ((firstAvg - secondAvg) / firstAvg * 100).toFixed(1);

    console.log(color(colors.cyan, 'Performance Comparison:'));
    console.log(`  Speedup: ${speedup.toFixed(2)}x faster on average`);
    console.log(`  Improvement: ${improvement}% faster on average`);
    console.log();

    // Per-request comparison
    console.log(color(colors.bold, 'Per-Request Breakdown:'));
    console.log();

    for (const pair of successfulPairs) {
      const r1 = pair.firstRequest.totalTime;
      const r2 = pair.secondRequest.totalTime;
      const improvement = ((r1 - r2) / r1 * 100).toFixed(1);
      const speedup = (r1 / r2).toFixed(2);

      const indicator = speedup > 1.1
        ? color(colors.green, '✓')
        : speedup > 0.9
          ? color(colors.yellow, '~')
          : color(colors.red, '✗');

      console.log(`  Request ${pair.promptId + 1}: ${indicator} ${speedup}x (${improvement}% faster)`);
    }

    console.log();
    console.log(color(colors.cyan, 'Interpretation:'));
    console.log('  - With prefix matching: Extended prompts route to same backend');
    console.log('    that cached the original prompt, enabling faster processing');
    console.log('  - Without prefix matching: Requests route to any available backend');
    console.log('    (no cache benefit from previous requests)');
    console.log();
  } else {
    console.log(color(colors.red, 'No successful request pairs found.'));
    console.log(color(colors.yellow, 'Check that the balancer is running and backends are healthy.'));
  }

  console.log(color(colors.bold, '========================================\n'));
}

// Main execution
async function main() {
  const balancerUrl = process.argv[2] || DEFAULT_BALANCER_URL;
  const concurrency = parseInt(process.argv[3]) || 4;

  // Validate balancer URL
  try {
    new URL(balancerUrl);
  } catch (e) {
    console.error(color(colors.red, `Invalid balancer URL: ${balancerUrl}`));
    console.error(color(colors.yellow, 'Usage: node benchmark-prefix-matching.js [balancerUrl] [concurrency]'));
    process.exit(1);
  }

  try {
    await runBenchmark(balancerUrl, concurrency);
    process.exit(0);
  } catch (error) {
    console.error(color(colors.red, `Benchmark failed: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

main();