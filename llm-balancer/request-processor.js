/**
 * Request Processor Module
 * Handles HTTP proxy requests and backend management
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

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
 * Execute a proxy request to a backend
 * @param {Object} backend - Backend object with url, id, etc.
 * @param {Object} options - Request options (method, headers, path, etc.)
 * @param {Function} onData - Callback for data chunks
 * @param {Function} onEnd - Callback when request completes
 * @param {Function} onError - Callback for errors
 * @returns {Object} HTTP request object
 */
function executeProxyRequest(backend, options, onData, onEnd, onError) {
  const parsedUrl = new URL(backend.url);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const requestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: options.path,
    method: options.method,
    headers: options.headers
  };

  return protocol.request(requestOptions, (proxyRes) => {
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
 */
function processRequest(balancer, backend, req, res, onRequestComplete) {
  // Increment active request count for this backend
  backend.activeRequestCount++;

  const targetUrl = new URL(req.url, backend.url);

  // Capture request body for debug tracking
  let requestBody = null;
  const originalBody = getRequestBody(req);
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

  // Handle streaming response
  if (req.is('raw') && headers['content-type']?.includes('stream')) {
    handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete);
  } else {
    handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete);
  }
}

/**
 * Handle streaming response request
 * @private
 */
function handleStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete) {
  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Copy response headers
    Object.keys(proxyRes.headers).forEach(header => {
      const lowerHeader = header.toLowerCase();
      if (!hopByHopHeaders.includes(lowerHeader)) {
        res.setHeader(header, proxyRes.headers[header]);
      }
    });

    // Handle streaming response
    if (proxyRes.headers['content-type']?.includes('stream')) {
      proxyRes.pipe(res);
    } else {
      let data = '';
      proxyRes.on('data', chunk => {
        data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
      });

      proxyRes.on('end', () => {
        const route = req.path || req.originalUrl || '/';
        balancer.trackDebugRequest(
          {
            route,
            method: req.method,
            priority: backend.priority || 0,
            backendId: backend.id,
            backendUrl: backend.url
          },
          requestBody,
          { data: data, contentType: proxyRes.headers['content-type'] }
        );

        try {
          const parsed = JSON.parse(data);
          res.json(parsed);
        } catch (e) {
          res.send(data);
        }

        releaseBackend(balancer, backend);
        onRequestComplete();
      });
    }
  });

  proxyReq.on('error', (err) => {
    console.error(`[Gateway] Request to ${backend.url} failed:`, err.message);
    balancer.markFailed(backend.url);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Backend unavailable',
      backend: backend.url
    });
    releaseBackend(balancer, backend);
    onRequestComplete();
  });

  proxyReq.on('end', () => {
    console.log(`[Balancer] Proxy request to ${backend.url} ended, releasing backend ${backend.id}`);
    releaseBackend(balancer, backend);
    onRequestComplete();
  });

  sendRequestBody(proxyReq, getRequestBody(req));
}

/**
 * Handle non-streaming response request
 * @private
 */
function handleNonStreamingRequest(balancer, backend, req, res, requestBody, onRequestComplete) {
  const targetUrl = new URL(req.url, backend.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';

    proxyRes.on('data', chunk => {
      data += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
    });

    proxyRes.on('end', () => {
      console.log(`[Balancer] Response from ${backend.url} completed, releasing backend ${backend.id}`);

      // Track debug request with request/response content
      const route = req.path || req.originalUrl || '/';
      balancer.trackDebugRequest(
        {
          route,
          method: req.method,
          priority: backend.priority || 0,
          backendId: backend.id,
          backendUrl: backend.url
        },
        requestBody,
        { data: data, contentType: proxyRes.headers['content-type'], statusCode: proxyRes.statusCode }
      );

      try {
        const parsed = JSON.parse(data);
        res.status(proxyRes.statusCode).json(parsed);
      } catch (e) {
        res.status(proxyRes.statusCode).send(data);
      } finally {
        releaseBackend(balancer, backend);
      }

      onRequestComplete();
    });
  })
  .on('error', (err) => {
    console.error(`[Gateway] Request to ${backend.url} failed:`, err.message);
    balancer.markFailed(backend.url);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Backend unavailable',
      backend: backend.url
    });
    releaseBackend(balancer, backend);
    onRequestComplete();
  })
  .on('end', () => {
    // Release backend
    releaseBackend(balancer, backend);
    onRequestComplete();
  });

  sendRequestBody(proxyReq, getRequestBody(req));
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
  getRequestBody
};