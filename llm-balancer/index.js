require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');

const app = express();
const config = configModule.loadConfig();

// Enable CORS for frontend dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize load balancer and health checker
const balancer = new Balancer(config.backends, config.maxQueueSize, config.queueTimeout);
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
  // Mark backend as busy
  backend.busy = true;

  // Get the priority tier for this backend
  const backendPriority = backend.priority || 0;

  // Helper to release backend
  const releaseBackend = () => {
    if (backend.busy) {
      backend.busy = false;
      // Notify balancer that this backend is now available
      balancer.notifyBackendAvailable(backendPriority);
    }
  };

  // Set timeout to clear busy state if request takes too long
  const requestTimeout = setTimeout(() => {
    releaseBackend();
  }, 30000); // 30 seconds default

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
      clearTimeout(requestTimeout);
      console.error(`[Gateway] Request to ${backend.url} failed:`, err.message);
      balancer.markFailed(backend.url);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend unavailable',
        backend: backend.url
      });
    });

    proxyReq.on('end', () => {
      clearTimeout(requestTimeout);
      // Release backend
      releaseBackend();
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
      clearTimeout(requestTimeout);
      console.error(`[Gateway] Request to ${backend.url} failed:`, err.message);
      balancer.markFailed(backend.url);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend unavailable',
        backend: backend.url
      });
      // Release backend even on error
      releaseBackend();
    })
    .on('end', () => {
      clearTimeout(requestTimeout);
      // Release backend
      releaseBackend();
    })
    .end(getRequestBody(req));
  }
}

/**
 * Route: Anthropic API routes (with queuing support)
 */
app.all('/v1/messages*', async (req, res) => {
  const priority = req.query.priority !== undefined ? parseInt(req.query.priority) : undefined;
  const immediate = req.query.immediate === 'true';

  if (immediate && !balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  try {
    const backend = await balancer.queueRequest(priority);
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[Gateway] Queue request failed:`, error.message);
    res.status(503).json({
      error: 'Service Unavailable',
      message: error.message,
      queueStats: balancer.getAllQueueStats()
    });
  }
});

/**
 * Route: Ollama API routes (with queuing support)
 */
app.all('/api/*', async (req, res) => {
  const priority = req.query.priority !== undefined ? parseInt(req.query.priority) : undefined;
  const immediate = req.query.immediate === 'true';

  if (immediate && !balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  try {
    const backend = await balancer.queueRequest(priority);
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[Gateway] Queue request failed:`, error.message);
    res.status(503).json({
      error: 'Service Unavailable',
      message: error.message,
      queueStats: balancer.getAllQueueStats()
    });
  }
});

/**
 * Route: Models endpoint (with queuing support)
 */
app.all('/models*', async (req, res) => {
  const priority = req.query.priority !== undefined ? parseInt(req.query.priority) : undefined;
  const immediate = req.query.immediate === 'true';

  if (immediate && !balancer.hasAvailableBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  try {
    const backend = await balancer.queueRequest(priority);
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[Gateway] Queue request failed:`, error.message);
    res.status(503).json({
      error: 'Service Unavailable',
      message: error.message,
      queueStats: balancer.getAllQueueStats()
    });
  }
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
    busyBackends: config.backends.filter(b => b.busy).length,
    idleBackends: config.backends.filter(b => !b.busy).length,
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
    hasAvailableBackends: balancer.hasAvailableBackends(),
    // Add: Busy state information
    busyBackends: config.backends.filter(b => b.busy).length,
    idleBackends: config.backends.filter(b => !b.busy).length
  });
});

/**
 * Route: Detailed statistics
 */
app.get('/stats', (req, res) => {
  const stats = balancer.getStats();

  res.json({
    balancer: stats,
    healthCheck: healthChecker.getStats(),
    config: {
      healthCheckInterval: config.healthCheckInterval,
      healthCheckTimeout: config.healthCheckTimeout,
      maxRetries: config.maxRetries,
      maxPayloadSize: config.maxPayloadSize,
      maxPayloadSizeMB: config.maxPayloadSizeMB,
      maxQueueSize: config.maxQueueSize,
      queueTimeout: config.queueTimeout
    },
    // Add: Backend busy counts
    busyBackends: config.backends.filter(b => b.busy).length,
    idleBackends: config.backends.filter(b => !b.busy).length,
    backendDetails: config.backends.map(b => ({
      url: b.url,
      priority: b.priority || 0,
      healthy: b.healthy,
      busy: b.busy,
      requestCount: b.requestCount,
      errorCount: b.errorCount
    })),
    // Add: Queue statistics
    queueStats: balancer.getAllQueueStats()
  });
});

/**
 * Route: Backend statistics
 */
app.get('/backends', (req, res) => {
  res.json({
    backends: config.backends.map(b => ({
      url: b.url,
      priority: b.priority || 0,
      healthy: b.healthy,
      busy: b.busy,
      failCount: b.failCount || 0,
      requestCount: b.requestCount || 0,
      errorCount: b.errorCount || 0,
      models: b.models || []
    }))
  });
});

/**
 * Route: Queue statistics
 */
app.get('/queue/stats', (req, res) => {
  res.json({
    maxQueueSize: config.maxQueueSize,
    queueTimeout: config.queueTimeout,
    queues: balancer.getAllQueueStats()
  });
});

/**
 * Route: Queue status for a specific priority tier
 */
app.get('/queue/stats/:priority', (req, res) => {
  const priority = parseInt(req.params.priority) || 0;
  const queueStats = balancer.getQueueStats(priority);

  if (!queueStats) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No queue found for priority ${priority}`
    });
  }

  res.json(queueStats);
});

/**
 * Route: Queue list for a specific priority tier
 */
app.get('/queue/list/:priority', (req, res) => {
  const priority = parseInt(req.params.priority) || 0;
  const queueInfo = balancer.getQueueList(priority);

  if (!queueInfo) {
    return res.status(404).json({
      error: 'Not Found',
      message: `No queue found for priority ${priority}`
    });
  }

  res.json(queueInfo);
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