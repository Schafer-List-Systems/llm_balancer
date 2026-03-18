/**
 * Request Processor Module
 * Handles HTTP proxy requests and backend management
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { countTokens } = require('./utils/token-utils');

function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Hop-by-hop headers that should not be forwarded
 */
const hopByHopHeaders = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade'
];

/**
 * Extract model(s) from a request body
 * Handles various request formats (JSON with "model" field or array of models)
 * @param {Object} req - Express request object
 * @returns {string|string[]} Model name(s) or null if not found
 */
function extractModelsFromRequest(req) {
  // Handle different content types for body parsing
  let body = null;

  if (req.is('raw') && Buffer.isBuffer(req.body)) {
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch (e) {
      return null;
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body;
  }

  if (!body || typeof body !== 'object') {
    return null;
  }

  // Check for "model" field in request body
  const modelField = body.model;

  if (modelField === undefined || modelField === null) {
    return null;
  }

  // Handle both string and array formats
  if (Array.isArray(modelField)) {
    // Filter out invalid entries
    const validModels = modelField.filter(m => typeof m === 'string' && m.length > 0);
    return validModels.length > 0 ? validModels : null;
  }

  if (typeof modelField === 'string' && modelField.length > 0) {
    return modelField;
  }

  return null;
}

/**
 * Extract token counts from a response body
 * Handles various response formats (usage object with token fields)
 * Supports prompt_tokens_details for cached token breakdown
 * @param {Object} responseBody - Response body object
 * @returns {{promptTokens: number, completionTokens: number, totalTokens: number, nonCachedPromptTokens: number}|null} Token counts or null if not found
 */
function extractTokenCounts(responseBody) {
  if (!responseBody || !responseBody.usage) {
    return null;
  }

  // Support both OpenAI format (prompt_tokens/completion_tokens) and LiteLLM format (input_tokens/output_tokens)
  const totalPromptTokens = responseBody.usage.prompt_tokens || responseBody.usage.input_tokens || 0;
  const cachedTokens = responseBody.usage.prompt_tokens_details?.cached_tokens || 0;

  // Non-cached prompt tokens = total prompt tokens - cached tokens
  const nonCachedPromptTokens = Math.max(0, totalPromptTokens - cachedTokens);

  return {
    promptTokens: totalPromptTokens,
    completionTokens: responseBody.usage.completion_tokens || responseBody.usage.output_tokens || 0,
    totalTokens: responseBody.usage.total_tokens || 0,
    nonCachedPromptTokens: nonCachedPromptTokens
  };
}

/**
 * Replace the model field in request body with matched actual model name
 * Handles both string and array formats for the model field
 * @param {Object} originalBody - Original request body object
 * @param {string} newModel - Actual model name to replace with
 * @returns {Object} Modified request body with replaced model field
 */
function replaceModelInRequestBody(originalBody, newModel) {
  if (!originalBody || typeof originalBody !== 'object') return originalBody;

  // Deep copy to avoid mutating the original object
  const modified = JSON.parse(JSON.stringify(originalBody));

  if (Array.isArray(modified.model)) {
    // Replace first matching model or prepend at index 0
    let replaced = false;
    for (let i = 0; i < modified.model.length; i++) {
      if (modified.model[i] === originalBody.model[0]) {
        modified.model[i] = newModel;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      modified.model.unshift(newModel);
    }
  } else if (typeof modified.model === 'string') {
    modified.model = newModel;
  }

  return modified;
}

/**
 * Execute a proxy request to a backend
 * @param {Object} backend - Backend object with url, id, etc.
 * @param {Object} options - Request options (method, headers, path, etc.)
 * @param {Object} config - Configuration object with requestTimeout
 * @param {Function} onData - Callback for data chunks
 * @param {Function} onEnd - Callback when request completes
 * @param {Function} onError - Callback for errors
 * @returns {Object} HTTP request object
 */
function executeProxyRequest(backend, options, config, onData, onEnd, onError) {
  const parsedUrl = new URL(backend.url);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const requestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: options.path,
    method: options.method,
    headers: options.headers,
    timeout: config.request.timeout
  };

  const requestId = req.internalRequestId || 'N/A';
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] executeProxyRequest to ${backend.url}: ${options.method} ${options.path}`);

  const req = protocol.request(requestOptions, (proxyRes) => {
    console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Proxy response from ${backend.url}: ${proxyRes.statusCode}`);
    req.on('timeout', () => {
      console.error(`[${getTimestamp()}] [Gateway][${requestId}] Timeout after 60s for request to ${backend.url}`);
      req.destroy();
    });
    // Remove hop-by-hop headers from response
    Object.keys(proxyRes.headers).forEach(header => {
      const lowerHeader = header.toLowerCase();
      if (!hopByHopHeaders.includes(lowerHeader)) {
        options.res.setHeader(header, proxyRes.headers[header]);
      }
    });

    let data = '';

    proxyRes.on('data', chunk => {
      data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
      onData(chunk);
    });

    proxyRes.on('end', () => {
      onEnd(data, proxyRes.headers, proxyRes.statusCode);
    });
  })
  .on('error', (err) => {
    onError(err, backend.url);
  });
}

/**
 * Send request body to the proxy request
 * @param {Object} proxyReq - HTTP request object
 * @param {string|Buffer} body - Request body
 */
function sendRequestBody(proxyReq, body) {
  if (Buffer.isBuffer(body)) {
    proxyReq.write(body);
  } else if (typeof body === 'object') {
    // Convert object to JSON string
    proxyReq.write(JSON.stringify(body));
  } else {
    // Assume string
    proxyReq.write(body);
  }
  proxyReq.end();
}

/**
 * Release a backend back to the pool
 * @param {Object} balancer - Balancer instance
 * @param {Object} backend - Backend to release
 * @param {string} mode - Request mode: 'streaming' or 'non-streaming'
 */
function releaseBackend(balancer, backend, mode = 'streaming') {
  // Use mode-specific release method
  if (mode === 'streaming') {
    backend.decrementStreamingRequest(() => balancer.notifyBackendAvailable());
  } else {
    backend.decrementNonStreamingRequest(() => balancer.notifyBackendAvailable());
  }
}

/**
 * Process a request to a backend
 * @param {Object} balancer - Balancer instance
 * @param {Object} backend - Backend to use
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} onRequestComplete - Callback when request is complete
 * @param {Object} config - Configuration object with requestTimeout
 * @param {string} [matchedModel] - Actual model name from regex matching (optional)
 */
function processRequest(balancer, backend, req, res, onRequestComplete, config, matchedModel = null) {
  const requestId = req.internalRequestId || 'N/A';
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] processRequest called for backend ${backend.id} (${backend.url})`);
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] req.is('raw'):`, req?.is?.('raw') ?? 'N/A');
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] req.headers['content-type']:`, req?.headers?.['content-type'] ?? 'N/A');
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] req.body type:`, typeof req.body, 'isBuffer:', Buffer.isBuffer(req.body));

  // Copy request headers
  const headers = { ...req.headers };

  // Remove hop-by-hop headers
  hopByHopHeaders.forEach(header => {
    delete headers[header.toLowerCase()];
  });

  // Remove Content-Length - let Node.js calculate it for the forwarded request
  delete headers['content-length'];

  // Capture request body for debug tracking
  let requestBody = null;
  let originalBody = getRequestBody(req);

  // Handle streaming response - check if client requested stream in body
  const isStreaming = (originalBody && typeof originalBody === 'object' && originalBody.stream === true) ||
                      (typeof originalBody === 'string' && originalBody.includes('"stream":true'));

  // Increment active request count using mode-specific method
  if (isStreaming) {
    backend.incrementStreamingRequest(() => balancer.notifyBackendAvailable());
  } else {
    backend.incrementNonStreamingRequest(() => balancer.notifyBackendAvailable());
  }

  // Also increment the processed request counter here
  // This ensures the counter is tracked when the request actually starts processing
  // In the new architecture, Backend tracks its own requestCount (separation of concerns)
  backend.requestCount = (backend.requestCount || 0) + 1;

  // Replace model field if matchedModel is provided
  if (matchedModel && typeof originalBody === 'string') {
    try {
      const parsedBody = JSON.parse(originalBody);
      const replacedBody = replaceModelInRequestBody(parsedBody, matchedModel);
      originalBody = JSON.stringify(replacedBody);
    } catch (e) {
      console.warn(`[${getTimestamp()}] [Gateway][${requestId}] Failed to parse request body for model replacement:`, e.message);
    }
  } else if (matchedModel && typeof originalBody === 'object' && !Buffer.isBuffer(originalBody)) {
    // Handle object body directly
    const replacedBody = replaceModelInRequestBody(originalBody, matchedModel);
    originalBody = JSON.stringify(replacedBody);
  }

  if (originalBody && typeof originalBody === 'string') {
    requestBody = originalBody;
  } else if (originalBody && Buffer.isBuffer(originalBody)) {
    requestBody = originalBody.toString('utf8');
  }

  if (isStreaming) {
    console.log(`[${getTimestamp()}] [Gateway][${requestId}] Using handleStreamingRequest (stream: true detected in body)`);
    console.log(`[${getTimestamp()}] [Gateway][${requestId}] Request body preview: ${JSON.stringify(originalBody).substring(0, 500)}`);
    handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel);
  } else {
    console.log(`[${getTimestamp()}] [Gateway][${requestId}] Using handleNonStreamingRequest`);
    console.log(`[${getTimestamp()}] [Gateway][${requestId}] Request body preview: ${JSON.stringify(originalBody).substring(0, 500)}`);
    handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel);
  }
}

/**
 * Count tokens in request body
 * @param {string} requestBody - Request body string
 * @returns {number} Token count or 0 if invalid
 */
function countRequestTokens(requestBody) {
  if (!requestBody || typeof requestBody !== 'string') {
    return 0;
  }

  try {
    return countTokens(requestBody);
  } catch (e) {
    console.warn(`[RequestProcessor] Failed to count request tokens:`, e.message);
    return 0;
  }
}

/**
 * Handle streaming response request
 * @private
 */
function handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel = null) {
  const requestId = req.internalRequestId || 'N/A';

  // Count tokens in request body for stats
  const requestTokens = countRequestTokens(requestBody);

  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: headers,
    timeout: config.request.timeout
  };

  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] handleStreamingRequest to ${backend.url}: ${options.method} ${options.path}`);
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Request headers: ${JSON.stringify(req.headers)}`);

  const proxyReq = http.request(options);

  // Attach all handlers BEFORE the request is sent
  proxyReq.on('error', (err) => {
    console.error(`[${getTimestamp()}] [Gateway][${requestId}] Proxy request error to ${backend.url}:`, err.message);
    balancer.markFailed(backend.url);
    // Ensure backend is released on error
    releaseBackend(balancer, backend, 'streaming');
    onRequestComplete();
    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend unavailable',
        backend: backend.url
      });
    }
  });

  const requestTimeout = config.request.timeout;
  proxyReq.setTimeout(requestTimeout, () => {
    console.error(`[${getTimestamp()}] [Gateway][${requestId}] Proxy request timeout to ${backend.url} after ${requestTimeout}ms`);
    proxyReq.destroy();
    // Ensure backend is released even on timeout
    releaseBackend(balancer, backend, 'non-streaming');
    onRequestComplete();
    // Send error response to client
    res.status(504).json({
      error: 'Gateway Timeout',
      message: 'Backend request timed out',
      backend: backend.url
    });
  });

  // Record when request is sent to backend
  const requestSentTime = Date.now();

  // Send request body to backend - this MUST be called before response handlers
  // to ensure the backend receives the complete request
  const requestBodyToForward = getRequestBody(req);
  proxyReq.end(requestBodyToForward);

  proxyReq.on('response', (proxyRes) => {
    // Record when headers are received from backend
    const headersReceivedTime = Date.now();
    const timeToFirstHeader = headersReceivedTime - requestSentTime;
    console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, timeToFirstHeader=${timeToFirstHeader}ms, statusCode=${proxyRes.statusCode}`);

    // Record start time for performance tracking
    const startTime = Date.now();
    let firstChunkTimestamp = null;
    let chunkCount = 0;

    // Copy response headers
    Object.keys(proxyRes.headers).forEach(header => {
      const lowerHeader = header.toLowerCase();
      if (!hopByHopHeaders.includes(lowerHeader)) {
        res.setHeader(header, proxyRes.headers[header]);
      }
    });

    // Handle streaming response with token tracking
    // Note: Node.js normalizes headers to lowercase
    const contentType = proxyRes.headers['content-type'] || proxyRes.headers['Content-Type'];
    console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Streaming content-type check: ${contentType}`);

    if (contentType?.includes('stream')) {
      let data = '';
      const chunks = [];  // Collect all chunks for parsing
      let completionTokenCount = 0;  // Track total completion tokens incrementally

      proxyRes.on('data', chunk => {
        chunkCount++;
        // Capture first chunk arrival time
        if (firstChunkTimestamp === null) {
          firstChunkTimestamp = Date.now();
          const timeToFirstChunk = firstChunkTimestamp - requestSentTime;
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Streaming Timing: firstChunkArrived=${firstChunkTimestamp}, timeToFirstChunk=${timeToFirstChunk}ms, chunkNumber=${chunkCount}`);
        }
        // Accumulate data for token extraction
        data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
        chunks.push(chunk);
        // Immediately pipe to client response (true streaming)
        res.write(chunk);

        // Count tokens from any delta field in the response
        // Generalize: collect all string values under delta keys (except 'role')
        try {
          // Parse SSE format: "data: {...}"
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.substring(5).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const msg = JSON.parse(jsonStr);
                // Extract delta from either OpenAI format or content_block_delta format
                const delta = msg.choices?.[0]?.delta || msg.delta || null;
                if (delta) {
                  // Collect all string content from delta fields (e.g., 'thinking', 'content', etc.)
                  // Exclude non-text fields like 'type' which is metadata, not generated content
                  let accumulatedContent = '';
                  const textFieldsToSkip = ['role', 'type'];
                  for (const key in delta) {
                    if (!textFieldsToSkip.includes(key) &&
                        delta[key] !== undefined &&
                        delta[key] !== null &&
                        typeof delta[key] === 'string') {
                      accumulatedContent += delta[key];
                    }
                  }
                  if (accumulatedContent) {
                    const chunkTokens = countTokens(accumulatedContent);
                    completionTokenCount += chunkTokens;
                  }
                }
              } catch (e) {
                // Not a JSON line, skip
              }
            }
          }
        } catch (e) {
          // Failed to parse chunk, skip token counting for this chunk
        }
        // Debug: Log final chunk count for troubleshooting
        if (chunkCount % 10 === 0) {
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Chunk ${chunkCount}, so far ${completionTokenCount} completion tokens counted`);
        }
      });

      proxyRes.on('end', () => {
        // Record when full response is received
        const fullResponseTime = Date.now();
        const timeFromHeaders = fullResponseTime - headersReceivedTime;
        const timeFromFirstChunk = fullResponseTime - firstChunkTimestamp;
        const totalTime = fullResponseTime - requestSentTime;
        const totalCompletionTimeMs = Date.now() - requestSentTime;
        const firstChunkTimeMs = firstChunkTimestamp !== null ? firstChunkTimestamp - requestSentTime : 0;
        // Network latency is half of time to first header (round-trip divided by 2)
        const networkLatencyMs = timeToFirstHeader / 2;

        console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Streaming Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, firstChunk=${firstChunkTimestamp}, fullResponse=${fullResponseTime}, timeToFirstHeader=${timeToFirstHeader}ms, timeFromHeaders=${timeFromHeaders}ms, timeFromFirstChunk=${timeFromFirstChunk}ms, totalTime=${totalTime}ms, chunkCount=${chunkCount}, networkLatency=${networkLatencyMs}ms`);

        // Parse streaming response to extract token counts from final usage object
        // Note: vLLM streaming format doesn't include usage in chunks, only [DONE] at end
        // Some APIs (OpenAI) do include usage in the final chunk
        let promptTokens = null;
        let completionTokens = null;
        let nonCachedPromptTokens = null;

        try {
          // Split by newline for SSE format and find messages with usage stats
          const lines = data.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.substring(5).trim();
              if (jsonStr === '[DONE]') continue;  // Skip completion marker
              try {
                const msg = JSON.parse(jsonStr);
                // Check for usage in this message (some APIs include it in final chunk)
                if (msg.usage) {
                  // Backend provides usage - use accurate backend count
                  const totalPrompt = msg.usage.prompt_tokens ?? msg.usage.input_tokens ?? null;
                  const cachedTokens = msg.usage.prompt_tokens_details?.cached_tokens ?? 0;
                  promptTokens = totalPrompt;
                  // If backend reports 0 completion tokens but we counted chunks, use chunk count
                  // (backends sometimes report 0 when they actually generated tokens)
                  const backendCompletionTokens = msg.usage.completion_tokens ?? null;
                  completionTokens = (backendCompletionTokens === 0 && completionTokenCount > 0)
                    ? completionTokenCount
                    : backendCompletionTokens;
                  // Compute non-cached prompt tokens
                  nonCachedPromptTokens = totalPrompt !== null ? Math.max(0, totalPrompt - cachedTokens) : null;
                }
                // Collect last message for response caching
                streamedResponse = msg;
                console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Usage found in stream: prompt=${totalPrompt}, completion=${backendCompletionTokens}, cached=${cachedTokens}`);
              } catch (e) {
                // Not a JSON line, skip
              }
            }
          }
        } catch (e) {
          console.warn(`[${getTimestamp()}] [Gateway][${requestId}] Failed to parse streaming response for token counts:`, e.message);
        }

        // If backend didn't provide usage, fall back to counting from request body
        // Only one variable tracks promptTokens: either from backend (accurate) or counted (fallback)
        if (promptTokens === null || promptTokens === undefined) {
          promptTokens = requestTokens ?? null;
          // If using request-counted tokens, assume all are non-cached
          nonCachedPromptTokens = requestTokens ?? null;
        }

        // Final fallback: if completionTokens is still null/undefined, use chunk count
        if (completionTokens === null || completionTokens === undefined) {
          completionTokens = completionTokenCount;
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] No usage in stream, using chunk count: ${completionTokenCount} completion tokens`);
        } else {
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Final completionTokens: ${completionTokens} (from backend=${backendCompletionTokens}, chunkCount=${completionTokenCount})`);
        }

        // Update streaming stats with comprehensive tracking
        if ((promptTokens !== null && promptTokens !== undefined) || completionTokens !== null) {
          // Full token data available
          // observedGeneration = time for n-1 tokens (tokens #2 through #n)
          const observedGeneration = totalCompletionTimeMs - firstChunkTimeMs;
          const completionTokensNum = completionTokens !== null ? completionTokens : 0;
          const completeGenerationTimeMs = completionTokensNum > 1
            ? observedGeneration * completionTokensNum / (completionTokensNum - 1)
            : observedGeneration;

          backend.updateStreamingStats(
            promptTokens,
            completionTokens !== null ? completionTokens : 0,
            firstChunkTimeMs,
            totalCompletionTimeMs,
            networkLatencyMs,                    // Pass network latency
            completeGenerationTimeMs,            // Pass corrected generation time
            nonCachedPromptTokens                // Pass non-cached prompt tokens
          );
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Streaming stats updated: ${promptTokens} prompt tokens, ${completionTokensNum} completion tokens, nonCached=${nonCachedPromptTokens ?? promptTokens}, networkLatency=${networkLatencyMs}ms, observedGeneration=${observedGeneration}ms, completeGeneration=${completeGenerationTimeMs}ms`);
        } else if (chunkCount > 0) {
          // No usage from backend - count from chunks for completion tokens
          // Fall back to request counting for prompt tokens (counted earlier)
          const n = chunkCount;
          const observedGeneration = totalCompletionTimeMs - firstChunkTimeMs;
          // Corrected generation time for ALL n tokens: observed × n/(n-1)
          const completeGenerationTimeMs = n > 1
            ? observedGeneration * n / (n - 1)
            : observedGeneration;

          backend.updateStreamingStatsFromChunks(
            requestTokens ?? 0,   // prompt tokens (counted from request body)
            n,                    // completion tokens (from chunk count)
            firstChunkTimeMs,
            totalCompletionTimeMs
          );
          console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Streaming stats updated (chunk count): ~${n} completion tokens, networkLatency=${networkLatencyMs}ms, observedGeneration=${observedGeneration}ms, completeGeneration=${completeGenerationTimeMs}ms`);
        } else {
          // No usable data - log for debugging
          console.warn(`[${getTimestamp()}] [Gateway][${requestId}] No streaming stats to track: chunkCount=${chunkCount}, promptTokens=${promptTokens}`);
        }

        // The [DONE] message is already included in the chunks from the backend
        // Just end the response (only if headers not already sent)
        if (!res.headersSent) {
          res.end();
        } else {
          // Ensure response is properly closed even if headers already sent
          // Use res.end() instead of res.destroy() to allow proper TCP connection close
          // res.destroy() would abruptly cut the connection, causing curl error 18
          res.end();
        }

        releaseBackend(balancer, backend, 'streaming');
        onRequestComplete();

        // Cache the completed request for KV cache reuse
        if (matchedModel) {
          backend.cachePrompt(requestBody, matchedModel);
        }
      });
    } else {
      let data = '';
      proxyRes.on('data', chunk => {
        // Capture first chunk arrival time for non-piped streaming
        if (firstChunkTimestamp === null) {
          firstChunkTimestamp = Date.now();
        }
        data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
      });

      proxyRes.on('end', () => {
        const totalCompletionTimeMs = Date.now() - startTime;
        const firstChunkTimeMs = firstChunkTimestamp !== null ? firstChunkTimestamp - startTime : 0;

        // Extract token counts and update streaming stats
        try {
          const responseBody = JSON.parse(data);
          const tokenCounts = extractTokenCounts(responseBody);

          if (tokenCounts) {
            backend.updateStreamingStats(
              tokenCounts.promptTokens,
              tokenCounts.completionTokens,
              firstChunkTimeMs,
              totalCompletionTimeMs,
              null,                          // networkLatencyMs - not measured here
              null,                          // correctedGenerationTimeMs - not calculated here
              tokenCounts.nonCachedPromptTokens  // Pass non-cached prompt tokens
            );
            console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming stats updated: ${tokenCounts.promptTokens} prompt tokens, ${tokenCounts.nonCachedPromptTokens} non-cached in ${firstChunkTimeMs}ms, ${tokenCounts.completionTokens} completion tokens in ${totalCompletionTimeMs - firstChunkTimeMs}ms`);
          }
        } catch (e) {
          console.warn(`[${getTimestamp()}] [RequestProcessor] Failed to parse streaming response for stats:`, e.message);
        }

        if (!res.headersSent) {
          try {
            const parsed = JSON.parse(data);
            res.json(parsed);
          } catch (e) {
            res.send(data);
          }
        }

        releaseBackend(balancer, backend, 'streaming');
        onRequestComplete();
      });
    }
  });
}

/**
 * Handle non-streaming response request
 * @private
 */
function handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel = null) {
  const requestId = req.internalRequestId || 'N/A';

  // Count tokens in request body for stats
  const requestTokens = countRequestTokens(requestBody);

  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] handleNonStreamingRequest to ${backend.url}`);
  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: headers
  };

  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Creating http.request to ${options.hostname}:${options.port}${options.path}`);
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Proxy request options: ${JSON.stringify(options)}`);
  const proxyReq = http.request(options);

  // Set request timeout
  const requestTimeout = config.request.timeout;
  proxyReq.setTimeout(requestTimeout, () => {
    console.error(`[${getTimestamp()}] [Gateway][${requestId}] Proxy request timeout to ${backend.url} after ${requestTimeout}ms`);
    proxyReq.destroy();
    // Ensure backend is released even on timeout
    releaseBackend(balancer, backend, 'streaming');
    onRequestComplete();
    // Send error response to client
    res.status(504).json({
      error: 'Gateway Timeout',
      message: 'Backend request timed out',
      backend: backend.url
    });
  });

  // Attach error handler BEFORE the request is sent
  proxyReq.on('error', (err) => {
    console.error(`[${getTimestamp()}] [Gateway][${requestId}] Proxy request error to ${backend.url}:`, err.message);
    balancer.markFailed(backend.url);
    // Ensure backend is released on error
    releaseBackend(balancer, backend, 'non-streaming');
    onRequestComplete();
    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend unavailable',
        backend: backend.url
      });
    }
  });

  // Record when request is sent to backend
  const requestSentTime = Date.now();

  proxyReq.on('response', (proxyRes) => {
    // Record when headers are received from backend
    const headersReceivedTime = Date.now();
    const timeToFirstHeader = headersReceivedTime - requestSentTime;
    console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, timeToFirstHeader=${timeToFirstHeader}ms, statusCode=${proxyRes.statusCode}`);

    // Record start time for performance tracking (when response starts arriving)
    const startTime = Date.now();
    let data = '';

    proxyRes.on('data', chunk => {
      data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
    });

    proxyRes.on('end', () => {
      // Record when full response is received
      const fullResponseTime = Date.now();
      const timeFromHeaders = fullResponseTime - headersReceivedTime;
      const totalTime = fullResponseTime - requestSentTime;
      const responseTimeMs = fullResponseTime - startTime;
      console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, fullResponse=${fullResponseTime}, timeToFirstHeader=${timeToFirstHeader}ms, timeFromHeaders=${timeFromHeaders}ms, totalTime=${totalTime}ms, responseTimeMs=${responseTimeMs}, dataLength=${data.length}`);
      const parsedResponse = JSON.parse(data);
      responseBody = parsedResponse;
      const tokenCounts = extractTokenCounts(responseBody);

      if (tokenCounts) {
        // For non-streaming mode: the backend is a black box
        // We CAN measure: totalTime (full round-trip)
        // We CANNOT accurately measure:
        //   - networkLatencyMs: In Node.js non-streaming mode, the entire response
        //     is buffered before the 'response' event fires, so headersReceivedTime
        //     ≈ fullResponseTime, making timeToFirstHeader meaningless
        //   - promptProcessingTimeMs: Cannot distinguish when backend finishes prompt
        //   - generationTimeMs: Cannot distinguish when backend starts generation
        //
        // Only totalTime and token counts are reliably measurable for non-streaming.

        backend.updateNonStreamingStats(
          tokenCounts.promptTokens,
          tokenCounts.completionTokens,
          totalTime,
          null,                    // promptProcessingTimeMs = null (cannot measure)
          null,                    // networkLatencyMs = null (unreliable in non-streaming)
          tokenCounts.nonCachedPromptTokens  // Pass non-cached prompt tokens
        );
        console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Non-streaming stats: ${tokenCounts.promptTokens + tokenCounts.completionTokens} tokens, ${tokenCounts.nonCachedPromptTokens} non-cached, totalTime=${totalTime}ms`);
      }

      if (!res.headersSent) {
        try {
          const parsed = JSON.parse(data);
          res.status(proxyRes.statusCode).json(parsed);
        } catch (e) {
          res.status(proxyRes.statusCode).send(data);
        }
      }

      releaseBackend(balancer, backend, 'non-streaming');
      onRequestComplete();

      // Cache the completed request for KV cache reuse
      // Extract prompt body (messages only) for better cache hit detection
      let cacheBody = requestBody;
      if (typeof requestBody === 'string') {
        try {
          const bodyObj = JSON.parse(requestBody);
          // Extract messages array for consistent cache key
          if (bodyObj.messages) {
            cacheBody = JSON.stringify(bodyObj.messages);
          } else if (bodyObj.prompt) {
            cacheBody = bodyObj.prompt;
          }
        } catch (e) {
          // Keep original requestBody if parsing fails
        }
      } else if (typeof requestBody === 'object') {
        // Extract messages array for consistent cache key
        if (requestBody.messages) {
          cacheBody = JSON.stringify(requestBody.messages);
        } else if (requestBody.prompt) {
          cacheBody = requestBody.prompt;
        }
      }

      console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Checking cache - matchedModel: ${matchedModel}, cacheBody length: ${cacheBody ? cacheBody.length : 0}`);
      if (matchedModel) {
        console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Calling cachePrompt with model: ${matchedModel}, cacheBody: ${cacheBody}`);
        backend.cachePrompt(cacheBody, matchedModel);
      } else {
        console.warn(`[${getTimestamp()}] [Gateway][${requestId}] Skipped caching - matchedModel is null/undefined`);
      }
    });
  });

  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Request body type: ${typeof requestBody}, isBuffer: ${Buffer.isBuffer(requestBody)}, length: ${requestBody ? (Buffer.isBuffer(requestBody) ? requestBody.length : requestBody.length) : 'null'}`);
  console.debug(`[${getTimestamp()}] [Gateway][${requestId}] Sending request body to ${backend.url}`);
  sendRequestBody(proxyReq, requestBody);
}

/**
 * Helper function to get body as buffer/string
 * @param {Object} req - Express request object
 * @returns {string|Buffer} Request body
 */
function getRequestBody(req) {
  if (req.is('raw')) {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return req.body || '';
}

// Export all public functions
module.exports = {
  processRequest,
  releaseBackend,
  executeProxyRequest,
  getRequestBody,
  extractModelsFromRequest,
  replaceModelInRequestBody,
  extractTokenCounts,
  handleStreamingRequest,
  handleNonStreamingRequest
};
