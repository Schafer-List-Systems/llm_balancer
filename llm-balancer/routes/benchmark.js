const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const configModule = require('../config');
const config = configModule.loadConfig();

/**
 * Benchmark Router: Async Job Pattern for Long-Running Benchmarks
 *
 * Benchmarks can take minutes to complete (especially full prompt caching tests).
 * Rather than blocking HTTP responses, we use a job queue pattern:
 * 1. POST creates a job with ID and returns {jobId, status: 'queued'}
 * 2. Frontend polls GET /results/{jobId} every 500ms
 * 3. Background worker processes benchmark
 * 4. Result stored in memory when complete
 */

/**
 * In-memory job storage with automatic TTL cleanup
 * Maps jobId -> { job, result }
 */
const benchmarkResults = new Map();
const MAX_RESULTS = 50; // Limit to prevent memory growth
const RESULT_TTL = 3600000; // 1 hour TTL

/**
 * Cleanup expired results (called periodically)
 */
function cleanupExpiredResults() {
  const now = Date.now();
  for (const [jobId, data] of benchmarkResults.entries()) {
    if (now - data.createdAt > RESULT_TTL) {
      benchmarkResults.delete(jobId);
    }
  }

  // Enforce max results limit
  if (benchmarkResults.size > MAX_RESULTS) {
    const entries = Array.from(benchmarkResults.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );
    for (let i = 0; i < entries.length - MAX_RESULTS; i++) {
      benchmarkResults.delete(entries[i][0]);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredResults, 300000);

/**
 * Generate a unique job ID
 */
function generateJobId() {
  return crypto.randomUUID();
}

/**
 * Create a benchmark job
 */
function createBenchmarkJob(type, backendUrl, options) {
  const jobId = generateJobId();
  const job = {
    jobId,
    type,
    backendUrl,
    options,
    status: 'queued',
    createdAt: Date.now(),
    result: null
  };

  benchmarkResults.set(jobId, job);
  return job;
}

/**
 * Update benchmark job result
 */
function setBenchmarkResult(jobId, result) {
  const job = benchmarkResults.get(jobId);
  if (job) {
    job.status = 'completed';
    job.result = result;
    job.completedAt = Date.now();
  }
}

/**
 * Update benchmark job error
 */
function setBenchmarkError(jobId, error) {
  const job = benchmarkResults.get(jobId);
  if (job) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = Date.now();
  }
}

/**
 * Get job by ID
 */
function getJob(jobId) {
  const job = benchmarkResults.get(jobId);
  if (!job) return null;

  // Return a sanitized version without internal properties
  return {
    jobId: job.jobId,
    type: job.type,
    backendUrl: job.backendUrl,
    options: job.options,
    status: job.status,
    createdAt: job.createdAt,
    result: job.result,
    error: job.error,
    completedAt: job.completedAt
  };
}

/**
 * Get all completed jobs
 */
function getAllResults() {
  const results = [];
  for (const [jobId, job] of benchmarkResults.entries()) {
    if (job.status === 'completed' || job.status === 'failed') {
      results.push(getJob(jobId));
    }
  }
  return results.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a result by job ID
 */
function deleteResult(jobId) {
  return benchmarkResults.delete(jobId);
}

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * GET /benchmark/single-endpoints
 * List available single-backend benchmark types
 */
router.get('/single-endpoints', (req, res) => {
  res.json({
    endpoints: [
      {
        type: 'speed',
        name: 'Speed Test',
        description: 'Measures prompt processing and token generation speed',
        duration: '10-60 seconds'
      },
      {
        type: 'streaming',
        name: 'Streaming Test',
        description: 'Measures time-to-first-chunk and streaming throughput',
        duration: '10-60 seconds'
      }
    ]
  });
});

/**
 * POST /benchmark/single/speed
 * Run a speed test benchmark on a specific backend
 */
router.post('/single/speed', async (req, res) => {
  try {
    const { backendUrl, options } = req.body;

    if (!backendUrl) {
      return res.status(400).json({
        error: 'Missing required parameter: backendUrl'
      });
    }

    // Default options
    const defaultOptions = {
      tokens: 5000,
      maxTokens: 10,
      model: 'qwen/qwen3.5-35b-a3b',
      retries: 3
    };
    const mergedOptions = { ...defaultOptions, ...options };

    // Create job
    const job = createBenchmarkJob('speed', backendUrl, mergedOptions);

    // Run benchmark in background
    runSpeedBenchmark(job, backendUrl, mergedOptions)
      .then(result => setBenchmarkResult(job.jobId, result))
      .catch(error => setBenchmarkError(job.jobId, error));

    res.json({
      jobId: job.jobId,
      status: 'queued',
      message: 'Benchmark job created, polling results...'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create benchmark job',
      message: error.message
    });
  }
});

/**
 * POST /benchmark/streaming
 * Run a streaming benchmark on a specific backend
 */
router.post('/streaming', async (req, res) => {
  try {
    const { backendUrl, options } = req.body;

    if (!backendUrl) {
      return res.status(400).json({
        error: 'Missing required parameter: backendUrl'
      });
    }

    // Default options
    const defaultOptions = {
      tokens: 2000,
      maxTokens: 50,
      model: 'qwen/qwen3.5-35b-a3b',
      retries: 3
    };
    const mergedOptions = { ...defaultOptions, ...options };

    // Create job
    const job = createBenchmarkJob('streaming', backendUrl, mergedOptions);

    // Run benchmark in background
    runStreamingBenchmark(job, backendUrl, mergedOptions)
      .then(result => setBenchmarkResult(job.jobId, result))
      .catch(error => setBenchmarkError(job.jobId, error));

    res.json({
      jobId: job.jobId,
      status: 'queued',
      message: 'Benchmark job created, polling results...'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create benchmark job',
      message: error.message
    });
  }
});

/**
 * POST /benchmark/prompt-caching
 * Run prompt caching benchmark across multiple backends
 */
router.post('/prompt-caching', async (req, res) => {
  try {
    const { options } = req.body;

    // Default options
    const defaultOptions = {
      numPrompts: 4,
      tokens: 5000,
      maxTokens: 10,
      model: 'qwen/qwen3.5-35b-a3b',
      shortQuestion: 'What is the main topic?'
    };
    const mergedOptions = { ...defaultOptions, ...options };

    // Create job
    const job = createBenchmarkJob('prompt-caching', null, mergedOptions);

    // Run benchmark in background
    runPromptCachingBenchmark(job, mergedOptions)
      .then(result => setBenchmarkResult(job.jobId, result))
      .catch(error => setBenchmarkError(job.jobId, error));

    res.json({
      jobId: job.jobId,
      status: 'queued',
      message: 'Benchmark job created, polling results...'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create benchmark job',
      message: error.message
    });
  }
});

/**
 * GET /benchmark/results/{jobId}
 * Get benchmark result by job ID
 */
router.get('/results/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Benchmark result not found or expired'
    });
  }

  res.json(job);
});

/**
 * GET /benchmark/results
 * List all completed benchmark results
 */
router.get('/results', (req, res) => {
  const results = getAllResults();
  res.json({ results });
});

/**
 * DELETE /benchmark/results/{jobId}
 * Delete a benchmark result
 */
router.delete('/results/:jobId', (req, res) => {
  const { jobId } = req.params;
  const deleted = deleteResult(jobId);

  if (deleted) {
    res.json({ success: true, message: 'Result deleted' });
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: 'Result not found'
    });
  }
});

/**
 * POST /benchmark/cleanup
 * Manually trigger cleanup of expired results
 */
router.post('/cleanup', (req, res) => {
  cleanupExpiredResults();
  const remaining = benchmarkResults.size;
  res.json({
    success: true,
    remainingResults: remaining
  });
});

// ============================================================
// BENCHMARK IMPLEMENTATIONS
// ============================================================

/**
 * Speed Benchmark - Measure prompt processing and token generation speed
 */
async function runSpeedBenchmark(job, backendUrl, options) {
  const balancerUrl = process.env.LB_URL || `http://localhost:${config.port}`;
  const url = `${balancerUrl}/v1/chat/completions`;

  // Generate random text prompt
  const prompt = generateRandomPrompt(options.tokens);

  const request = {
    model: options.model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    stream: false,
    max_tokens: options.maxTokens
  };

  // Measure prompt processing time (first request)
  let firstResult = null;
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;

      // Extract token counts from usage
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = promptTokens + completionTokens;

      firstResult = {
        success: true,
        elapsed_ms: elapsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        prompt_speed: promptTokens / (elapsed / 1000),
        total_speed: totalTokens / (elapsed / 1000)
      };

      // Validate response has content (check both content and reasoning fields)
      const message = data.choices?.[0]?.message || {};
      const content = message.content || message.reasoning || message.reasoning_content || '';
      if (!content || content.length === 0) {
        throw new Error('Empty response from backend');
      }

      break;
    } catch (error) {
      if (attempt === options.retries) {
        throw new Error(`Speed benchmark failed after ${options.retries} retries: ${error.message}`);
      }
      console.warn(`Speed benchmark attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!firstResult) {
    throw new Error('Speed benchmark failed - no successful response');
  }

  // Create extended prompt for second test
  const extendedPrompt = `${prompt}\n\n${firstResult.completion_content || 'Response content'}`;
  const extendedRequest = {
    ...request,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: extendedPrompt }
    ]
  };

  // Measure extended prompt processing time
  let secondResult = null;
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extendedRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;

      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = promptTokens + completionTokens;

      secondResult = {
        success: true,
        elapsed_ms: elapsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        prompt_speed: promptTokens / (elapsed / 1000),
        total_speed: totalTokens / (elapsed / 1000)
      };

      break;
    } catch (error) {
      if (attempt === options.retries) {
        throw new Error(`Extended prompt benchmark failed after ${options.retries} retries: ${error.message}`);
      }
      console.warn(`Extended prompt attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!secondResult) {
    throw new Error('Extended prompt benchmark failed - no successful response');
  }

  // Calculate statistics
  const speedup = secondResult.elapsed_ms / firstResult.elapsed_ms;
  const improvement = ((firstResult.elapsed_ms - secondResult.elapsed_ms) / firstResult.elapsed_ms * 100);

  return {
    test: 'speed',
    backendUrl,
    results: {
      firstRequest: firstResult,
      secondRequest: secondResult,
      speedup: speedup,
      improvementPercent: improvement.toFixed(1)
    },
    options: {
      promptTokens: options.tokens,
      maxOutputTokens: options.maxTokens,
      model: options.model
    }
  };
}

/**
 * Streaming Benchmark - Measure time-to-first-chunk and streaming throughput
 */
async function runStreamingBenchmark(job, backendUrl, options) {
  const balancerUrl = process.env.LB_URL || `http://localhost:${config.port}`;
  const url = `${balancerUrl}/v1/chat/completions`;

  // Generate random text prompt
  const prompt = generateRandomPrompt(options.tokens);

  const request = {
    model: options.model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    stream: true,
    max_tokens: options.maxTokens
  };

  // Create a timeout that gets cancelled when benchmark completes
  const timeout = setTimeout(() => {
    console.error(`[StreamingBenchmark] Timeout after ${options.maxTimeout || 300} seconds`);
  }, (options.maxTimeout || 300) * 1000); // Default 5 minute timeout

  try {
    const startTime = Date.now();
    let firstChunkTime = null;
    let chunkCount = 0;
    let tokenCount = 0;
    let fullContent = '';
    let receivedData = false;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check if response is actually streaming
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/x-ndjson')) {
      throw new Error('Response is not streaming: ' + contentType);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log(`[StreamingBenchmark] Starting to read stream...`);

    try {
      let loopCount = 0;
      while (true) {
        loopCount++;
        try {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            receivedData = true;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const jsonData = JSON.parse(data);
                  chunkCount++;

                  if (firstChunkTime === null) {
                    firstChunkTime = Date.now() - startTime;
                  }

                  // Count tokens (approximate) - check content, reasoning, and reasoning_content fields
                  const delta = jsonData.choices?.[0]?.delta || {};
                  const content = delta.content || delta.reasoning || delta.reasoning_content || '';
                  tokenCount += content.split(/\s+/).filter(w => w.length > 0).length;
                  fullContent += content;
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
        } catch (readError) {
          if (readError.message === 'terminated') {
            break;
          }
          throw readError;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const totalTime = Date.now() - startTime;

    if (!receivedData) {
      throw new Error('No data received in streaming response');
    }

    if (chunkCount === 0) {
      throw new Error('No chunks received in streaming response');
    }

    // Calculate statistics
    const ttfcMs = firstChunkTime || totalTime;
    const throughput = tokenCount / (totalTime / 1000);

    return {
      test: 'streaming',
      backendUrl,
      results: {
        timeToFirstChunkMs: ttfcMs,
        totalTimeMs: totalTime,
        chunkCount,
        estimatedTokens: tokenCount,
        throughputTokensPerSecond: throughput.toFixed(2),
        contentLength: fullContent.length
      },
      options: {
        inputTokens: options.tokens,
        maxOutputTokens: options.maxTokens,
        model: options.model
      }
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error(`[StreamingBenchmark] Error: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Prompt Caching Benchmark - Test KV cache reuse across multiple backends
 */
async function runPromptCachingBenchmark(job, options) {
  // Get list of backends
  let backendsList;
  try {
    const response = await fetch(`${process.env.LB_URL || 'http://localhost:3001'}/backends`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    backendsList = data.backends || [];
  } catch (error) {
    throw new Error(`Failed to get backends list: ${error.message}`);
  }

  if (backendsList.length === 0) {
    throw new Error('No backends available');
  }

  const numPrompts = Math.min(options.numPrompts, backendsList.length);

  // Generate unique prompts
  const prompts = [];
  for (let i = 0; i < numPrompts; i++) {
    const prompt = `PROMPT ${i + 1}: Unique content for benchmark ${i + 1}\n\n${generateRandomPrompt(options.tokens)}`;
    prompts.push(prompt);
  }

  // Step 1: Send initial requests (concurrent)
  const firstResults = [];
  const poolUrl = process.env.LB_URL || 'http://localhost:3001';

  for (let i = 0; i < numPrompts; i++) {
    const request = {
      model: options.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompts[i] }
      ],
      stream: false,
      max_tokens: options.maxTokens
    };

    try {
      const startTime = Date.now();
      const response = await fetch(`${poolUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;
      const message = data.choices?.[0]?.message || {};
      const content = message.content || message.reasoning || message.reasoning_content || '';

      if (!content || content.length === 0) {
        throw new Error('Empty response');
      }

      firstResults.push({
        prompt_id: i,
        elapsed_ms: elapsed,
        content: content
      });
    } catch (error) {
      console.warn(`First request ${i} failed: ${error.message}`);
      firstResults.push({ prompt_id: i, elapsed_ms: null, content: null });
    }
  }

  // Step 2: Send extended prompts in REVERSE order
  const secondResults = [];

  for (let i = firstResults.length - 1; i >= 0; i--) {
    const firstResult = firstResults[i];
    if (!firstResult || !firstResult.content) continue;

    const extendedPrompt = `Original: ${firstResult.content}\n\nWhat is the main topic?`;
    const request = {
      model: options.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: extendedPrompt }
      ],
      stream: false,
      max_tokens: options.maxTokens
    };

    try {
      const startTime = Date.now();
      const response = await fetch(`${poolUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;
      const message = data.choices?.[0]?.message || {};
      const content = message.content || message.reasoning || message.reasoning_content || '';

      secondResults.push({
        prompt_id: i,
        elapsed_ms: elapsed,
        hasContent: !!content
      });
    } catch (error) {
      console.warn(`Extended request ${i} failed: ${error.message}`);
      secondResults.push({ prompt_id: i, elapsed_ms: null, hasContent: false });
    }
  }

  // Analyze results
  const successfulPairs = [];
  for (const second of secondResults) {
    if (second.hasContent && second.elapsed_ms) {
      const first = firstResults.find(f => f.prompt_id === second.prompt_id);
      if (first && first.elapsed_ms) {
        successfulPairs.push({
          prompt_id: second.prompt_id,
          firstRequest: first.elapsed_ms,
          secondRequest: second.elapsed_ms,
          speedup: first.elapsed_ms / second.elapsed_ms
        });
      }
    }
  }

  // Calculate statistics
  const firstTimes = successfulPairs.map(p => p.firstRequest);
  const secondTimes = successfulPairs.map(p => p.secondRequest);

  const firstAvg = firstTimes.reduce((a, b) => a + b, 0) / firstTimes.length;
  const secondAvg = secondTimes.reduce((a, b) => a + b, 0) / secondTimes.length;
  const overallSpeedup = firstAvg / secondAvg;
  const improvement = ((firstAvg - secondAvg) / firstAvg * 100);

  return {
    test: 'prompt-caching',
    backendsCount: backendsList.length,
    results: {
      successfulPairs: successfulPairs.length,
      totalPairs: numPrompts,
      firstRequestStats: {
        averageMs: firstAvg,
        minMs: Math.min(...firstTimes),
        maxMs: Math.max(...firstTimes)
      },
      secondRequestStats: {
        averageMs: secondAvg,
        minMs: Math.min(...secondTimes),
        maxMs: Math.max(...secondTimes)
      },
      overallSpeedup: overallSpeedup.toFixed(2),
      improvementPercent: improvement.toFixed(1),
      perRequestBreakdown: successfulPairs
    },
    options: {
      numPrompts,
      tokensPerPrompt: options.tokens,
      model: options.model
    }
  };
}

/**
 * Generate random text prompt of approximately specified tokens
 */
function generateRandomPrompt(targetTokens) {
  const words = [
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
    'Artificial', 'intelligence', 'transforms', 'industries', 'through', 'automation', 'and', 'insights'
  ];

  const targetChars = targetTokens * 4;
  let prompt = 'Write a comprehensive essay about technology and innovation:\n\n';
  let currentLength = prompt.length;

  while (currentLength < targetChars) {
    const word = words[Math.floor(Math.random() * words.length)];
    prompt += word + ' ';
    currentLength += word.length + 1;
  }

  return prompt.trim();
}

module.exports = router;
