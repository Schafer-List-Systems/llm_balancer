require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');
const { processRequest } = require('./request-processor');

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
const balancer = new Balancer(config.backends, config.maxQueueSize, config.queueTimeout, config.debug, config.debugRequestHistorySize);
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
 * Helper function to get ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Forward request to an available backend
 */
function forwardRequest(req, res, backend) {
  // Process the request using the request processor module
  processRequest(balancer, backend, req, res, () => {
    // Request completed
  });
}

/**
 * Route: Anthropic API routes (with queuing support)
 */
app.all('/v1/messages*', async (req, res) => {
  try {
    const backend = await balancer.queueRequest();
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url
      }
    );

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[${getTimestamp()}] [Gateway] Queue request failed:`, error.message);
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
  try {
    const backend = await balancer.queueRequest();
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url
      }
    );

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[${getTimestamp()}] [Gateway] Queue request failed:`, error.message);
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
  if (!balancer.hasHealthyBackends()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'No healthy backends available',
      stats: balancer.getStats()
    });
  }

  try {
    const backend = await balancer.queueRequest();
    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url
      }
    );

    forwardRequest(req, res, backend);
  } catch (error) {
    console.error(`[${getTimestamp()}] [Gateway] Queue request failed:`, error.message);
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
    hasHealthyBackends: balancer.hasHealthyBackends(),
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
    currentBackend: balancer.getNextBackend(),
    stats: balancer.getStats()
  });
});

/**
 * Route: Debug statistics
 */
app.get('/debug/stats', (req, res) => {
  res.json(balancer.getDebugStats());
});

/**
 * Route: Debug request history
 */
app.get('/debug/requests', (req, res) => {
  res.json(balancer.getDebugRequestHistory());
});

/**
 * Route: Get last N requests with content
 * Query parameter: n (number of requests to return, default: 10)
 */
app.get('/debug/requests/recent', (req, res) => {
  const n = parseInt(req.query.n) || 10;
  const history = balancer.getDebugRequestHistory();

  // Return the last N requests
  const recentRequests = history.slice(0, n);

  res.json({
    count: recentRequests.length,
    limit: n,
    requests: recentRequests
  });
});

/**
 * Route: Get debug requests filtered by backend ID
 * Query parameters:
 *   - backendId: (optional) Filter by specific backend ID
 *   - limit: (optional) Number of requests to return, default: 10
 */
app.get('/debug/requests/backend/:backendId', (req, res) => {
  const backendId = req.params.backendId;
  const limit = parseInt(req.query.limit) || 10;
  const history = balancer.getDebugRequestsFiltered(backendId, limit);

  res.json({
    backendId: backendId,
    count: history.length,
    limit: limit,
    requests: history
  });
});

/**
 * Route: Clear debug request history
 */
app.post('/debug/clear', (req, res) => {
  balancer.clearDebugRequestHistory();
  res.json({ success: true, message: 'Debug history cleared' });
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
  console.error(`[${getTimestamp()}] [Gateway] Error:`, err);
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
      console.error(`[${getTimestamp()}] [Balancer] Port ${config.port} is already in use`);
      process.exit(1);
    }
    console.error(`[${getTimestamp()}] [Balancer] Server error:`, err);
  });

// Graceful shutdown - Option B: reject queued requests, drain in-flight, force exit after timeout
  const gracefulShutdown = (signal) => {
    console.log(`\n[${getTimestamp()}] [Balancer] ${signal} received. Shutting down gracefully...`);
    
    // Stop accepting new health checks
    healthChecker.stop();
    
    // Reject all queued requests with a retry message
    const queueSize = balancer.getQueueStats().depth;
    if (queueSize > 0) {
      console.log(`[${getTimestamp()}] [Balancer] Rejecting ${queueSize} queued request(s)...`);
      for (const request of balancer.queue) {
        clearTimeout(request.timeout);
        request.reject(new Error('Server shutting down, please retry'));
      }
    }
    
    // Close server to stop accepting new connections and wait for in-flight requests
    server.close(() => {
      console.log(`[${getTimestamp()}] [Balancer] Server closed. All in-flight requests completed.`);
      process.exit(0);
    });
    
    // Force exit after shutdown timeout if in-flight requests are still pending
    setTimeout(() => {
      console.warn(`\n[${getTimestamp()}] [Balancer] ${config.shutdownTimeout / 1000}s timeout reached. Forcing exit...`);
      process.exit(1);
    }, config.shutdownTimeout);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// Start the server
startServer();

module.exports = { app, balancer, healthChecker };
