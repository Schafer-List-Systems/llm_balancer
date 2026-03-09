require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');
const Backend = require('./backends/Backend');
const { processRequest, extractModelsFromRequest } = require('./request-processor');

// Health check implementations
const OllamaHealthCheck = require('./interfaces/implementations/OllamaHealthCheck');
const OpenAIHealthCheck = require('./interfaces/implementations/OpenAIHealthCheck');
const AnthropicHealthCheck = require('./interfaces/implementations/AnthropicHealthCheck');
const GoogleHealthCheck = require('./interfaces/implementations/GoogleHealthCheck');

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

// ★ Insight ─────────────────────────────────────────────────────
// Convert config backends to Backend instances
// Each Backend contains: url, state, backendInfo, and healthChecker
// This follows composition over duplication - BackendInfo is attached
// directly to Backend rather than copied to capabilities.
// ──────────────────────────────────────────────────────────────────
const backends = config.backends.map(backendConfig => {
  return new Backend(backendConfig.url, backendConfig.maxConcurrency);
});

// Initialize load balancer and health checker with Backend instances
const balancer = new Balancer(backends, config.maxQueueSize, config.queueTimeout, config.debug, config.debugRequestHistorySize);
const healthChecker = new HealthChecker(backends, config);

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
    version: config.version,
    status: 'running',
    port: config.port,
    backends: stats.totalBackends,
    healthy: stats.healthyBackends,
    unhealthy: stats.unhealthyBackends,
    busyBackends: backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: backends.filter(b => b.activeRequestCount === 0).length,
    backendUrls: backends.map(b => b.url),
    healthCheckInterval: config.healthCheckInterval,
    overloadedBackends: backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: backends.filter(
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
    overloadedBackends: backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    ).length,
    busyBackends: backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: backends.filter(b => b.activeRequestCount === 0).length
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
    overloadedBackends: backends.filter(
      b => b.activeRequestCount >= b.maxConcurrency
    ).length,
    availableBackends: backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    ).length,
    busyBackends: backends.filter(b => b.activeRequestCount > 0).length,
    idleBackends: backends.filter(b => b.activeRequestCount === 0).length,
    backendDetails: backends.map(b => ({
      url: b.url,
      priority: b.priority || 0,
      healthy: b.healthy,
      activeRequestCount: b.activeRequestCount,
      maxConcurrency: b.maxConcurrency,
      utilizationPercent: Math.round((b.activeRequestCount / b.maxConcurrency) * 100),
      requestCount: b.requestCount,
      errorCount: b.errorCount,
      apiTypes: b.getApiTypes(),
      primaryApiType: b.getPrimaryApiType()
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
    backends: backends.map(b => {
      const apiTypes = b.getApiTypes();
      const allModels = Object.values(b.getAllModels()).flat();

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
        models: allModels,
        primaryApiType: b.getPrimaryApiType(),
        backendInfo: b.backendInfo ? {
          endpoints: b.backendInfo.endpoints,
          models: b.backendInfo.models,
          detectedAt: b.backendInfo.detectedAt
        } : null
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
    for (const backend of backends) {
      if (backend.healthy && backend.getModels('openai').includes(model) ||
          backend.getModels('ollama').includes(model) ||
          backend.getModels('google').includes(model)) {
        supportingBackends.push({
          url: backend.url,
          id: backend.url, // Backend doesn't have id field, use URL
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
  const backend = backends.find(b => b.url === backendUrl);

  if (!backend) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Backend not found: ${backendUrl}`
    });
  }

  // Perform single health check using backend.checkHealth()
  backend.checkHealth()
    .then(result => {
      if (result.healthy) {
        backend.healthy = true;
        backend.failCount = 0;
        res.json({
          backend: backendUrl,
          healthy: true,
          status: result.statusCode,
          models: result.models || []
        });
      } else {
        backend.healthy = false;
        backend.failCount = (backend.failCount || 0) + 1;
        res.status(502).json({
          backend: backendUrl,
          healthy: false,
          status: result.statusCode,
          error: result.error
        });
      }
    })
    .catch(err => {
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
      res.status(502).json({
        backend: backendUrl,
        healthy: false,
        error: err.message
      });
    });
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
  console.debug(`[${getTimestamp()}] [Startup] Starting capability detection for ${backends.length} backends...`);

  try {
    const urls = backends.map(b => b.url);
    const backendInfoMap = await backendInfo.getInfoAll(urls);

    // ★ Insight ───────────────────────────────────────────────────
    // Attach BackendInfo directly to Backend instances
    // Then assign health checker based on primary API type
    // This follows the delegation pattern - Backend delegates health
    // checking to its assigned healthChecker
    // ──────────────────────────────────────────────────────────────
    for (const url in backendInfoMap) {
      const backendInfo = backendInfoMap[url];
      const backend = backends.find(b => b.url === url);

      if (!backend) {
        console.warn(`[${getTimestamp()}] [Startup] Backend not found for URL: ${url}`);
        continue;
      }

      // Attach BackendInfo directly to backend instance (composition)
      backend.backendInfo = backendInfo;

      if (backendInfo.healthy && Object.keys(backendInfo.apis).length > 0) {
        // Find supported API types
        const supportedApiTypes = Object.keys(backendInfo.apis).filter(
          api => backendInfo.apis[api].supported
        );

        console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Detected API types: ${supportedApiTypes.join(', ')}, models:`, backendInfo.models);

        // ★ Insight ───────────────────────────────────────────────────
        // Primary API Selection: When a backend supports multiple APIs,
        // choose the first supported API as the primary. This simplifies
        // health checker assignment while ensuring accurate health checks.
        // ──────────────────────────────────────────────────────────────
        const primaryApiType = supportedApiTypes[0];

        // Assign health checker based on primary API type
        switch (primaryApiType) {
          case 'ollama':
            backend.healthChecker = new OllamaHealthCheck(config.healthCheckTimeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned OllamaHealthCheck`);
            break;
          case 'openai':
          case 'groq':
            backend.healthChecker = new OpenAIHealthCheck(config.healthCheckTimeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned OpenAIHealthCheck`);
            break;
          case 'anthropic':
            backend.healthChecker = new AnthropicHealthCheck(config.healthCheckTimeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned AnthropicHealthCheck`);
            break;
          case 'google':
            backend.healthChecker = new GoogleHealthCheck(config.healthCheckTimeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned GoogleHealthCheck`);
            break;
          default:
            // Fallback to OpenAI health check if unknown API type
            backend.healthChecker = new OpenAIHealthCheck(config.healthCheckTimeout);
            console.warn(`[${getTimestamp()}] [Startup] Backend ${url}: Unknown primary API ${primaryApiType}, using OpenAIHealthCheck`);
        }
      } else if (backendInfo.error) {
        console.warn(`[${getTimestamp()}] [Startup] Backend ${url}: Could not detect API - ${backendInfo.error}`);
        // Still assign a health checker for potential recovery
        backend.healthChecker = new OpenAIHealthCheck(config.healthCheckTimeout);
      }
    }

    // Phase 2: Start health checker with assigned health checkers
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
      console.log(`Backends (${backends.length}):`);
      backends.forEach((backend, i) => {
        const apiTypes = backend.getApiTypes();
        const modelCount = Object.values(backend.getAllModels()).flat().length;
        const status = backend.healthy ? '✓' : '✗';
        const apiTypeStr = apiTypes.length > 0 ? apiTypes.join(', ') : 'none';
        const primaryApi = backend.getPrimaryApiType() || 'none';
        console.log(`  ${i + 1}. ${backend.url} (${apiTypeStr}, ${modelCount} models, primary: ${primaryApi}) ${status}`);
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
