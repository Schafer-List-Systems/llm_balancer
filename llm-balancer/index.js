require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');
const { processRequest, extractModelsFromRequest } = require('./request-processor');

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

// Initialize backend info collector to discover API types before health checks
const BackendInfo = require('./capability-detector');
const backendInfo = new BackendInfo(config.healthCheckTimeout);

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
  }, config);
}

/**
 * Route: OpenAI-compatible API routes (with queuing support)
 */
app.all('/v1/chat/completions*', async (req, res) => {
  try {
    // Extract model from request body for backend selection
    const models = extractModelsFromRequest(req);

    // Select backend based on model if specified, otherwise use default selection
    let backend;
    // Check: models must be truthy AND have at least one valid entry (not empty array)
    if (models && (Array.isArray(models) ? models.length > 0 : true)) {
      backend = balancer.getNextBackendForModel(models);

      // If no backend supports the requested model(s), try any available backend
      if (!backend) {
        console.warn(`[${getTimestamp()}] [Gateway] No backend found for models: ${Array.isArray(models) ? models.join(', ') : models}. Falling back to default selection.`);
        backend = await balancer.queueRequest();
      } else {
        // Model matched - logging handled above
        console.debug(`[${getTimestamp()}] [Gateway] Selected backend ${backend.id} (${backend.url}) for models: ${Array.isArray(models) ? models.join(', ') : models}`);
      }
    } else {
      // No model specified in request or empty models array - use default selection
      backend = await balancer.queueRequest();
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request with model information
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url,
        models: Array.isArray(models) ? models : (models ? [models] : [])
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
 * Route: Anthropic API routes (with queuing support)
 */
app.all('/v1/messages*', async (req, res) => {
  try {
    // Extract model from request body for backend selection
    const models = extractModelsFromRequest(req);

    // Select backend based on model if specified, otherwise use default selection
    let backend;
    // Check: models must be truthy AND have at least one valid entry (not empty array)
    if (models && (Array.isArray(models) ? models.length > 0 : true)) {
      backend = balancer.getNextBackendForModel(models);

      // If no backend supports the requested model(s), try any available backend
      if (!backend) {
        console.warn(`[${getTimestamp()}] [Gateway] No backend found for models: ${Array.isArray(models) ? models.join(', ') : models}. Falling back to default selection.`);
        backend = await balancer.queueRequest();
      } else {
        // Model matched - logging handled above
        console.debug(`[${getTimestamp()}] [Gateway] Selected backend ${backend.id} (${backend.url}) for models: ${Array.isArray(models) ? models.join(', ') : models}`);
      }
    } else {
      // No model specified in request or empty models array - use default selection
      backend = await balancer.queueRequest();
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request with model information
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url,
        models: Array.isArray(models) ? models : (models ? [models] : [])
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
    // Extract model from request body for backend selection
    const models = extractModelsFromRequest(req);

    // Select backend based on model if specified, otherwise use default selection
    let backend;
    // Check: models must be truthy AND have at least one valid entry (not empty array)
    if (models && (Array.isArray(models) ? models.length > 0 : true)) {
      backend = balancer.getNextBackendForModel(models);

      // If no backend supports the requested model(s), try any available backend
      if (!backend) {
        console.warn(`[${getTimestamp()}] [Gateway] No backend found for models: ${Array.isArray(models) ? models.join(', ') : models}. Falling back to default selection.`);
        backend = await balancer.queueRequest();
      } else {
        // Model matched - logging handled above
        console.debug(`[${getTimestamp()}] [Gateway] Selected backend ${backend.id} (${backend.url}) for models: ${Array.isArray(models) ? models.join(', ') : models}`);
      }
    } else {
      // No model specified in request or empty models array - use default selection
      backend = await balancer.queueRequest();
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request with model information
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url,
        models: Array.isArray(models) ? models : (models ? [models] : [])
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
    // Extract model from request body for backend selection (if present)
    const models = extractModelsFromRequest(req);

    let backend;
    if (models) {
      backend = balancer.getNextBackendForModel(models);

      if (!backend) {
        console.warn(`[${getTimestamp()}] [Gateway] No backend found for models: ${Array.isArray(models) ? models.join(', ') : models}. Falling back to default selection.`);
        backend = await balancer.queueRequest();
      } else {
        console.debug(`[${getTimestamp()}] [Gateway] Selected backend ${backend.id} (${backend.url}) for models: ${Array.isArray(models) ? models.join(', ') : models}`);
      }
    } else {
      backend = await balancer.queueRequest();
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // Track debug request with model information
    const route = req.path || req.originalUrl || '/';
    balancer.trackDebugRequest(
      {
        route,
        method: req.method,
        priority: backend.priority || 0,
        backendId: backend.id,
        backendUrl: backend.url,
        models: Array.isArray(models) ? models : (models ? [models] : [])
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
    busyBackends: config.backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: config.backends.filter(b => b.activeRequestCount === 0).length,
    backendUrls: config.backends.map(b => b.url),
    healthCheckInterval: config.healthCheckInterval,
    overloadedBackends: config.backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: config.backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    ).length,
    routes: {
      openai_api: '/v1/chat/completions*',
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
  const healthStats = healthChecker.getStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: config.port,
    maxPayloadSize: config.maxPayloadSize,
    maxPayloadSizeMB: config.maxPayloadSizeMB,
    healthyBackends: healthStats.healthyBackends,
    totalBackends: healthStats.totalBackends,
    backends: healthStats.backends,
    hasHealthyBackends: balancer.hasHealthyBackends(),
    // Add: Backend concurrency information
    overloadedBackends: config.backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: config.backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    ).length,
    busyBackends: config.backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: config.backends.filter(b => b.activeRequestCount === 0).length
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
    // Add: Backend concurrency counts
    overloadedBackends: config.backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: config.backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    ).length,
    busyBackends: config.backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: config.backends.filter(b => b.activeRequestCount === 0).length,
    backendDetails: config.backends.map(b => ({
      url: b.url,
      priority: b.priority || 0,
      healthy: b.healthy,
      activeRequestCount: b.activeRequestCount,
      maxConcurrency: b.maxConcurrency,
      utilizationPercent: Math.round((b.activeRequestCount / b.maxConcurrency) * 100),
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
    backends: config.backends.map(b => {
      const caps = b.capabilities || {};
      // Flatten models from all API types
      const allModels = Object.values(caps.models || {}).flat();
      const apiTypes = Array.isArray(caps.apiTypes) ? caps.apiTypes : (caps.apiType ? [caps.apiType] : []);

      return {
        url: b.url,
        priority: b.priority || 0,
        healthy: b.healthy,
        activeRequestCount: b.activeRequestCount,
        maxConcurrency: b.maxConcurrency,
        utilizationPercent: Math.round((b.activeRequestCount / b.maxConcurrency) * 100),
        failCount: b.failCount || 0,
        requestCount: b.requestCount || 0,
        errorCount: b.errorCount || 0,
        apiTypes: apiTypes,
        models: allModels
      };
    })
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
 * Route: Model availability statistics
 */
app.get('/models/stats', (req, res) => {
  const stats = balancer.getModelAvailabilityStats();
  res.json(stats);
});

/**
 * Route: Check if backends support specific model(s)
 * Query parameters:
 *   - models: Comma-separated list of model names to check
 */
app.get('/models/check', (req, res) => {
  const modelsParam = req.query.models;

  if (!modelsParam) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required query parameter: models'
    });
  }

  // Parse comma-separated model list
  const requestedModels = modelsParam.split(',').map(m => m.trim()).filter(m => m.length > 0);

  if (requestedModels.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'No valid model names provided'
    });
  }

  const hasBackend = balancer.hasBackendForModel(requestedModels);
  const stats = balancer.getModelAvailabilityStats();

  // Find which backends support each requested model
  const backendSupports = {};
  for (const model of requestedModels) {
    const supportingBackends = [];
    for (const backend of config.backends) {
      if (backend.healthy && (backend.capabilities?.models || []).includes(model)) {
        supportingBackends.push({
          url: backend.url,
          id: backend.id,
          priority: backend.priority || 0
        });
      }
    }
    backendSupports[model] = supportingBackends;
  }

  res.json({
    requestedModels,
    hasBackend,
    stats,
    backendSupports
  });
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
 * Start the server with capability detection phase
 */
async function startServer() {
  // Phase 1: Detect backend capabilities before health checks begin
  console.debug(`[${getTimestamp()}] [Startup] Starting capability detection for ${config.backends.length} backends...`);

  try {
    const urls = config.backends.map(b => b.url);
    const backendInfoMap = await backendInfo.getInfoAll(urls);

    // Store detected backend info on backend objects immediately
    for (const url in backendInfoMap) {
      const info = backendInfoMap[url];
      const backend = config.backends.find(b => b.url === url);
      if (backend && !backend.capabilities) {
        backend.capabilities = {};
      }

      if (info.healthy && Object.keys(info.apis).length > 0) {
        // Convert new format to backward-compatible format
        const apiTypes = Object.keys(info.apis).filter(api => info.apis[api].supported);
        console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Detected API types: ${apiTypes.join(', ')}, models:`, info.models);
        if (backend && backend.capabilities) {
          backend.capabilities.apiTypes = apiTypes;
          backend.capabilities.models = Object.values(info.models).flat();
          backend.capabilities.endpoints = info.endpoints;
          backend.capabilities.detectedAt = info.detectedAt;
        }
      } else if (info.error) {
        console.warn(`[${getTimestamp()}] [Startup] Backend ${url}: Could not detect API - ${info.error}`);
      }
    }

    // Phase 2: Start health checker with pre-populated capabilities
    console.debug(`[${getTimestamp()}] [Startup] Starting health checker...`);
    healthChecker.start();

    // Phase 3: Start the load balancer server
    const server = app.listen(config.port, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`LLM Balancer ${config.version} running at http://localhost:${config.port}`);
      console.log(`${'='.repeat(60)}`);
      if (config.debug) {
        console.log(`[Balancer] In DEBUG mode`);
      }
      console.log(`Backends (${config.backends.length}):`);
      config.backends.forEach((backend, i) => {
        const apiTypes = backend.capabilities?.apiTypes || [];
        const modelCount = backend.capabilities?.models?.length || 0;
        const status = backend.healthy ? '✓' : '✗';
        const apiTypeStr = apiTypes.length > 0 ? apiTypes.join(', ') : 'none';
        console.log(`  ${i + 1}. ${backend.url} (${apiTypeStr}, ${modelCount} models) ${status}`);
      });
      console.log(`\nRoutes:`);
      console.log(`  OpenAI API:     /v1/chat/completions*`);
      console.log(`  Anthropic API:  /v1/messages*`);
      console.log(`  Ollama API:     /api/*`);
      console.log(`  Models:         /models*`);
      console.log(`  Health:         /health`);
      console.log(`  Stats:          /stats`);
      console.log(`\n${'='.repeat(60)}\n`);
    });

    // Handle server errors (inside try block)
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[${getTimestamp()}] [Balancer] Port ${config.port} is already in use`);
        process.exit(1);
      }
      console.error(`[${getTimestamp()}] [Balancer] Server error:`, err);
    });

    // Graceful shutdown - reject queued requests, drain in-flight, force exit after timeout
    const gracefulShutdown = (signal) => {
      console.debug(`\n[${getTimestamp()}] [Balancer] ${signal} received. Shutting down gracefully...`);

      // Stop accepting new health checks
      healthChecker.stop();

      // Reject all queued requests with a retry message
      const queueSize = balancer.getQueueStats().depth;
      if (queueSize > 0) {
        console.debug(`[${getTimestamp()}] [Balancer] Rejecting ${queueSize} queued request(s)...`);
        for (const request of balancer.queue) {
          clearTimeout(request.timeout);
          request.reject(new Error('Server shutting down, please retry'));
        }
      }

      // Close server to stop accepting new connections and wait for in-flight requests
      if (server) {
        server.close(() => {
          console.debug(`[${getTimestamp()}] [Balancer] Server closed. All in-flight requests completed.`);
          process.exit(0);
        });
      } else {
        process.exit(0);
      }

      // Force exit after shutdown timeout if in-flight requests are still pending
      setTimeout(() => {
        console.warn(`\n[${getTimestamp()}] [Balancer] ${config.shutdownTimeout / 1000}s timeout reached. Forcing exit...`);
        process.exit(1);
      }, config.shutdownTimeout);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (err) {
  console.error(`[${getTimestamp()}] [Startup] Capability detection failed:`, err.message);
  process.exit(1);
} finally {
  // Ensure graceful shutdown handlers are registered even if startup fails
  const gracefulShutdown = (signal) => {
    console.debug(`\n[${getTimestamp()}] [Balancer] ${signal} received. Shutting down gracefully...`);

    try {
      healthChecker.stop();
    } catch (e) {
      // Ignore errors during shutdown cleanup
    }

    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}
}

// Start the server
startServer();

module.exports = { app, balancer, healthChecker };
