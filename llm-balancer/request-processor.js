/**
 * Request Processor Module
 * Handles HTTP proxy requests and backend management
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

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
 * @param {Object} responseBody - Response body object
 * @returns {{promptTokens: number, completionTokens: number, totalTokens: number}|null} Token counts or null if not found
 */
function extractTokenCounts(responseBody) {
  if (!responseBody || !responseBody.usage) {
    return null;
  }

  // Support both OpenAI format (prompt_tokens/completion_tokens) and LiteLLM format (input_tokens/output_tokens)
  return {
    promptTokens: responseBody.usage.prompt_tokens || responseBody.usage.input_tokens || 0,
    completionTokens: responseBody.usage.completion_tokens || responseBody.usage.output_tokens || 0,
    totalTokens: responseBody.usage.total_tokens || 0
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
    timeout: config.requestTimeout
  };

  console.debug(`[Gateway] executeProxyRequest to ${backend.url}: ${options.method} ${options.path}`);

  const req = protocol.request(requestOptions, (proxyRes) => {
    console.debug(`[Gateway] Proxy response from ${backend.url}: ${proxyRes.statusCode}`);
    req.on('timeout', () => {
      console.error(`[Gateway] Timeout after 60s for request to ${backend.url}`);
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
 */
function releaseBackend(balancer, backend) {
  if (backend.activeRequestCount > 0) {
    backend.activeRequestCount--;
    // Notify when transitioning from max to below max (queue may have waiting requests)
    if (backend.activeRequestCount < backend.maxConcurrency) {
      balancer.notifyBackendAvailable();
    }
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
  console.debug(`[Gateway] processRequest called for backend ${backend.id} (${backend.url})`);
  console.debug(`[Gateway] req.is('raw'):`, req?.is?.('raw') ?? 'N/A');
  console.debug(`[Gateway] req.headers['content-type']:`, req?.headers?.['content-type'] ?? 'N/A');
  console.debug(`[Gateway] req.body type:`, typeof req.body, 'isBuffer:', Buffer.isBuffer(req.body));

  // Increment active request count for this backend
  backend.activeRequestCount++;

  // Also increment the processed request counter here
  // This ensures the counter is tracked when the request actually starts processing
  // In the new architecture, Backend tracks its own requestCount (separation of concerns)
  backend.requestCount = (backend.requestCount || 0) + 1;

  const targetUrl = new URL(req.url, backend.url);

  // Capture request body for debug tracking
  let requestBody = null;
  let originalBody = getRequestBody(req);
  let responseBody = null;

  // Replace model field if matchedModel is provided
  if (matchedModel && typeof originalBody === 'string') {
    try {
      const parsedBody = JSON.parse(originalBody);
      const replacedBody = replaceModelInRequestBody(parsedBody, matchedModel);
      originalBody = JSON.stringify(replacedBody);
    } catch (e) {
      console.warn(`Failed to parse request body for model replacement:`, e.message);
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

  // Copy request headers
  const headers = { ...req.headers };

  // Remove hop-by-hop headers
  hopByHopHeaders.forEach(header => {
    delete headers[header.toLowerCase()];
  });

  // Remove Content-Length - let Node.js calculate it for the forwarded request
  delete headers['content-length'];

  // Handle streaming response - check if client requested stream in body
  const isStreaming = (originalBody && typeof originalBody === 'object' && originalBody.stream === true) ||
                      (typeof requestBody === 'string' && requestBody.includes('"stream":true'));

  if (isStreaming) {
    console.log(`[Gateway] Using handleStreamingRequest (stream: true detected in body)`);
    handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel);
  } else {
    console.log(`[Gateway] Using handleNonStreamingRequest`);
    handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel);
  }
}

/**
 * Handle streaming response request
 * @private
 */
function handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel = null) {
  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: headers,
    timeout: config.requestTimeout
  };

  console.debug(`[Gateway] handleStreamingRequest to ${backend.url}: ${options.method} ${options.path}`);
  console.debug(`[Gateway] Request headers: ${JSON.stringify(req.headers)}`);

  const proxyReq = http.request(options);

  // Attach all handlers BEFORE the request is sent
  proxyReq.on('error', (err) => {
    console.error(`[Gateway] Proxy request error to ${backend.url}:`, err.message);
    balancer.markFailed(backend.url);
    // Ensure backend is released on error
    releaseBackend(balancer, backend);
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

  proxyReq.setTimeout(config.requestTimeout, () => {
    console.error(`[Gateway] Proxy request timeout to ${backend.url} after ${config.requestTimeout}ms`);
    proxyReq.destroy();
    // Ensure backend is released even on timeout
    releaseBackend(balancer, backend);
    onRequestComplete();
    // Send error response to client
    if (!res.headersSent) {
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Backend request timed out',
        backend: backend.url
      });
    }
  });

  proxyReq.on('end', () => {
    console.debug(`[Balancer] Proxy request to ${backend.url} ended, releasing backend ${backend.id}`);
    releaseBackend(balancer, backend);
    onRequestComplete();
  });

  // Record when request is sent to backend
  const requestSentTime = Date.now();

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
    console.debug(`[Gateway] Streaming content-type check: ${contentType}`);

    if (contentType?.includes('stream')) {
      let data = '';
      const chunks = [];  // Collect all chunks for parsing

      proxyRes.on('data', chunk => {
        chunkCount++;
        // Capture first chunk arrival time
        if (firstChunkTimestamp === null) {
          firstChunkTimestamp = Date.now();
          const timeToFirstChunk = firstChunkTimestamp - requestSentTime;
          console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming Timing: firstChunkArrived=${firstChunkTimestamp}, timeToFirstChunk=${timeToFirstChunk}ms, chunkNumber=${chunkCount}`);
        }
        // Accumulate data for token extraction
        data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
        chunks.push(chunk);
        // Immediately pipe to client response (true streaming)
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        // Record when full response is received
        const fullResponseTime = Date.now();
        const timeFromHeaders = fullResponseTime - headersReceivedTime;
        const timeFromFirstChunk = fullResponseTime - firstChunkTimestamp;
        const totalTime = fullResponseTime - requestSentTime;
        const totalCompletionTimeMs = Date.now() - requestSentTime;
        const firstChunkTimeMs = firstChunkTimestamp !== null ? firstChunkTimestamp - requestSentTime : 0;

        console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, firstChunk=${firstChunkTimestamp}, fullResponse=${fullResponseTime}, timeToFirstHeader=${timeToFirstHeader}ms, timeFromHeaders=${timeFromHeaders}ms, timeFromFirstChunk=${timeFromFirstChunk}ms, totalTime=${totalTime}ms, chunkCount=${chunkCount}`);

        // Parse streaming response to extract token counts from final usage object
        // Note: vLLM streaming format doesn't include usage in chunks, only [DONE] at end
        // Some APIs (OpenAI) do include usage in the final chunk
        let promptTokens = null;
        let completionTokens = null;
        let usageFound = false;
        let streamedResponse = null;

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
                  promptTokens = msg.usage.prompt_tokens || null;
                  completionTokens = msg.usage.completion_tokens || null;
                  usageFound = true;
                }
                // Collect last message for response caching
                streamedResponse = msg;
              } catch (e) {
                // Not a JSON line, skip
              }
            }
          }

          // Update streaming stats with comprehensive tracking
          if (usageFound && (promptTokens !== null || completionTokens !== null)) {
            // Full token data available from usage field
            backend.updateStreamingStats(
              promptTokens !== null ? promptTokens : 0,
              completionTokens !== null ? completionTokens : 0,
              firstChunkTimeMs,
              totalCompletionTimeMs
            );
            console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming stats updated: ${promptTokens ?? 'N/A'} prompt tokens in ${firstChunkTimeMs}ms, ${completionTokens ?? 'N/A'} completion tokens in ${totalCompletionTimeMs - firstChunkTimeMs}ms`);
          } else if (chunkCount > 0) {
            // Use chunk counting for completion tokens (vLLM-style backends without usage)
            // Each SSE chunk ≈ 1 completion token (empirically verified)
            backend.updateStreamingStatsFromChunks(
              null,  // Estimated prompt tokens (could extract from request body if needed)
              chunkCount,
              firstChunkTimeMs,
              totalCompletionTimeMs
            );
            console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming stats updated (chunk count): ~${chunkCount} completion tokens in ${firstChunkTimeMs}ms to ${totalCompletionTimeMs - firstChunkTimeMs}ms`);
          } else {
            // No usable data - log for debugging
            console.warn(`[${getTimestamp()}] [RequestProcessor] No streaming stats to track: chunkCount=${chunkCount}, usageFound=${usageFound}`);
          }
        } catch (e) {
          console.warn(`[${getTimestamp()}] [RequestProcessor] Failed to parse streaming response for stats:`, e.message);
        }

        // The [DONE] message is already included in the chunks from the backend
        // Just end the response (only if headers not already sent)
        if (!res.headersSent) {
          res.end();
        }

        releaseBackend(balancer, backend);
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
              totalCompletionTimeMs
            );
            console.debug(`[${getTimestamp()}] [RequestProcessor] Streaming stats updated: ${tokenCounts.promptTokens} prompt tokens in ${firstChunkTimeMs}ms, ${tokenCounts.completionTokens} completion tokens in ${totalCompletionTimeMs - firstChunkTimeMs}ms`);
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

        releaseBackend(balancer, backend);
        onRequestComplete();
      });
    }
  });

  console.debug(`[Gateway] Sending request to ${backend.url} with body: ${requestBody ? requestBody.substring(0, 100) : 'none'}`);
  sendRequestBody(proxyReq, getRequestBody(req));
}

/**
 * Handle non-streaming response request
 * @private
 */
function handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete, config, headers, matchedModel = null) {
  console.debug(`[Gateway] handleNonStreamingRequest to ${backend.url}`);
  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: headers
  };

  console.debug(`[Gateway] Creating http.request to ${options.hostname}:${options.port}${options.path}`);
  console.debug(`[Gateway] Proxy request options: ${JSON.stringify(options)}`);
  const proxyReq = http.request(options);

  // Set request timeout
  proxyReq.setTimeout(config.requestTimeout, () => {
    console.error(`[Gateway] Proxy request timeout to ${backend.url} after ${config.requestTimeout}ms`);
    proxyReq.destroy();
    // Ensure backend is released even on timeout
    releaseBackend(balancer, backend);
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
    console.error(`[Gateway] Proxy request error to ${backend.url}:`, err.message);
    balancer.markFailed(backend.url);
    // Ensure backend is released on error
    releaseBackend(balancer, backend);
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
    console.debug(`[${getTimestamp()}] [RequestProcessor] Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, timeToFirstHeader=${timeToFirstHeader}ms, statusCode=${proxyRes.statusCode}`);

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
      console.debug(`[${getTimestamp()}] [RequestProcessor] Timing: requestSent=${requestSentTime}, headersReceived=${headersReceivedTime}, fullResponse=${fullResponseTime}, timeToFirstHeader=${timeToFirstHeader}ms, timeFromHeaders=${timeFromHeaders}ms, totalTime=${totalTime}ms, responseTimeMs=${responseTimeMs}, dataLength=${data.length}`);
      const parsedResponse = JSON.parse(data);
      responseBody = parsedResponse;
      const tokenCounts = extractTokenCounts(responseBody);

      if (tokenCounts) {
        backend.updateNonStreamingStats(
          tokenCounts.promptTokens,
          tokenCounts.completionTokens,
          totalTime,
          timeToFirstHeader  // Prompt processing time (time to first header)
        );
        console.debug(`[${getTimestamp()}] [RequestProcessor] Non-streaming stats: ${tokenCounts.promptTokens + tokenCounts.completionTokens} tokens, totalTime=${totalTime}ms, promptProcessing=${timeToFirstHeader}ms`);
      }

      if (!res.headersSent) {
        try {
          const parsed = JSON.parse(data);
          res.status(proxyRes.statusCode).json(parsed);
        } catch (e) {
          res.status(proxyRes.statusCode).send(data);
        }
      }

      releaseBackend(balancer, backend);
      onRequestComplete();

      // Cache the completed request for KV cache reuse
      if (matchedModel) {
        backend.cachePrompt(requestBody, matchedModel);
      }
    });
  });

  console.debug(`[Gateway] Request body type: ${typeof requestBody}, isBuffer: ${Buffer.isBuffer(requestBody)}, length: ${requestBody ? (Buffer.isBuffer(requestBody) ? requestBody.length : requestBody.length) : 'null'}`);
  console.debug(`[Gateway] Sending request body to ${backend.url}`);
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
  extractTokenCounts
};
