const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');

const app = express();
const config = configModule.loadConfig();

// Initialize load balancer and health checker
const balancer = new Balancer(config.backends);
const healthChecker = new HealthChecker(config.backends, config);

// Middleware to parse JSON bodies
app.use(express.json({
  limit: `${config.maxPayloadSize}`
}));

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({
  extended: true,
  limit: `${config.maxPayloadSize}`
}));

// Middleware to parse raw bodies for streaming
app.use(express.raw({
  type: '*/*',
  limit: `${config.maxPayloadSize}`
}));

/**
 * Helper function to get body as buffer/string
 * Reuses patterns from original gateway
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

/**
 * Forward request to a specific backend
 * Reuses patterns from original gateway with modifications for load balancer
 */
function forwardRequest(req, res, backend) {
  const targetUrl = new URL(req.url, backend.url);

  // Copy request headers
  const headers = { ...req.headers };

  // Remove hop-by-hop headers
  const hopByHop = [
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade'
  ];

  hopByHop.forEach(header => delete headers[header.toLowerCase()]);

  // Handle streaming response
  if (req.is('raw') && headers['content-type']?.includes('stream')) {
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Copy response headers
      Object.keys(proxyRes.headers).forEach(header => {
        // Don't transfer hop-by-hop headers back
        if (!hopByHop.includes(header.toLowerCase())) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      // Handle streaming response
      if (proxyRes.headers['content-type']?.includes('stream')) {
        proxyRes.pipe(res);
      } else {
        let data = '';
        proxyRes.on('data', chunk => {
          if (Buffer.isBuffer(chunk)) {
            data += chunk.toString();
          } else {
            data += chunk;
          }
        });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            res.json(parsed);
          } catch (e) {
            res.send(data);
          }
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
    });

    const body = getRequestBody(req);
    if (Buffer.isBuffer(body)) {
      req.pipe(proxyReq);
    } else {
      proxyReq.write(body);
      proxyReq.end();
    }
  } else {
    // Handle non-streaming request
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: headers
    };

    http.request(options, (proxyRes) => {
      let data = '';

      proxyRes.on('data', chunk => {
        if (Buffer.isBuffer(chunk)) {
          data += chunk.toString();
        } else {
          data += chunk;
        }
      });

      proxyRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(proxyRes.statusCode).json(parsed);
        } catch (e) {
          res.status(proxyRes.statusCode).send(data);
        }
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
    })
    .end(getRequestBody(req));
  }
}

/**
 * Route: Anthropic API routes
 */
app.all('/v1/messages*', (req, res) => {
  if (!balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  const backend = balancer.getNextBackend();
  if (!backend) {
    return res.status(502).json({
      error: 'Bad Gateway',
      message: 'No backend available'
    });
  }

  forwardRequest(req, res, backend);
});

/**
 * Route: Ollama API routes
 */
app.all('/api/*', (req, res) => {
  if (!balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  const backend = balancer.getNextBackend();
  if (!backend) {
    return res.status(502).json({
      error: 'Bad Gateway',
      message: 'No backend available'
    });
  }

  forwardRequest(req, res, backend);
});

/**
 * Route: Models endpoint
 */
app.all('/models*', (req, res) => {
  if (!balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  const backend = balancer.getNextBackend();
  if (!backend) {
    return res.status(502).json({
      error: 'Bad Gateway',
      message: 'No backend available'
    });
  }

  forwardRequest(req, res, backend);
});

/**
 * Route: Root - show info
 */
app.get('/', (req, res) => {
  const stats = balancer.getStats();
  const healthStats = healthChecker.getStats();

  res.json({
    service: 'LLM Balancer',
    version: '2.0.0',
    status: 'running',
    port: config.port,
    backends: stats.totalBackends,
    healthy: stats.healthyBackends,
    unhealthy: stats.unhealthyBackends,
    backendUrls: config.backends.map(b => b.url),
    healthCheckInterval: config.healthCheckInterval,
    routes: {
      anthropic_api: '/v1/messages*',
      ollama_api: '/api/*',
      models: '/models*',
      health: '/health',
      stats: '/stats'
    },
    stats: {
      balancer: stats,
      healthCheck: healthStats
    }
  });
});

/**
 * Route: Health check with backend status
 */
app.get('/health', (req, res) => {
  const stats = balancer.getStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: config.port,
    maxPayloadSize: config.maxPayloadSize,
    maxPayloadSizeMB: config.maxPayloadSizeMB,
    healthyBackends: stats.healthyBackends,
    totalBackends: stats.totalBackends,
    backends: stats.backends,
    hasAvailableBackends: balancer.hasAvailableBackends()
  });
});

/**
 * Route: Detailed statistics
 */
app.get('/stats', (req, res) => {
  res.json({
    balancer: balancer.getStats(),
    healthCheck: healthChecker.getStats(),
    config: {
      healthCheckInterval: config.healthCheckInterval,
      healthCheckTimeout: config.healthCheckTimeout,
      maxRetries: config.maxRetries,
      maxPayloadSize: config.maxPayloadSize,
      maxPayloadSizeMB: config.maxPayloadSizeMB
    }
  });
});

/**
 * Route: Get current backend (for debugging/testing)
 */
app.get('/backend/current', (req, res) => {
  res.json({
    currentIndex: balancer.getCurrentIndex(),
    currentBackend: balancer.getNextBackend(),
    stats: balancer.getStats()
  });
});

/**
 * Route: Manual backend health check
 */
app.get('/health/:backendUrl', (req, res) => {
  const { backendUrl } = req.params;
  const backend = config.backends.find(b => b.url === backendUrl);

  if (!backend) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Backend not found: ${backendUrl}`
    });
  }

  // Perform single health check
  const { URL } = require('url');
  const parsedUrl = new URL(backendUrl);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 11434,
    path: '/api/tags',
    method: 'GET'
  };

  http.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      backend.healthy = true;
      backend.failCount = 0;
      res.json({
        backend: backendUrl,
        healthy: true,
        status: res.statusCode
      });
    } else {
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
      res.status(502).json({
        backend: backendUrl,
        healthy: false,
        status: res.statusCode
      });
    }
    res.resume();
  })
  .on('error', (err) => {
    backend.healthy = false;
    backend.failCount = (backend.failCount || 0) + 1;
    res.status(502).json({
      backend: backendUrl,
      healthy: false,
      error: err.message
    });
  })
  .end();
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Route not found. Use /health to check status.'
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('[Gateway] Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

/**
 * Start the server
 */
function startServer() {
  // Start health checker
  healthChecker.start();

  // Start the load balancer server
  const server = app.listen(config.port, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`LLM Balancer running at http://localhost:${config.port}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Backends (${config.backends.length}):`);
    config.backends.forEach((backend, i) => {
      console.log(`  ${i + 1}. ${backend.url} ${backend.healthy ? '✓' : '✗'}`);
    });
    console.log(`\nRoutes:`);
    console.log(`  Anthropic API:  /v1/messages*`);
    console.log(`  Ollama API:     /api/*`);
    console.log(`  Models:         /models*`);
    console.log(`  Health:         /health`);
    console.log(`  Stats:          /stats`);
    console.log(`\n${'='.repeat(60)}\n`);
  });

  // Handle server errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Balancer] Port ${config.port} is already in use`);
      process.exit(1);
    }
    console.error('[Balancer] Server error:', err);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Balancer] Shutting down gracefully...');
    healthChecker.stop();
    server.close(() => {
      console.log('[Balancer] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n[Balancer] Shutting down gracefully...');
    healthChecker.stop();
    server.close(() => {
      console.log('[Balancer] Server closed');
      process.exit(0);
    });
  });
}

// Start the server
startServer();

module.exports = { app, balancer, healthChecker };