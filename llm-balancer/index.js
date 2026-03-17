require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const configModule = require('./config');
const Balancer = require('./balancer');
const HealthChecker = require('./health-check');
const Backend = require('./backends/Backend');
const { processRequest, extractModelsFromRequest, replaceModelInRequestBody } = require('./request-processor');

// Health check implementations
const OllamaHealthCheck = require('./interfaces/implementations/OllamaHealthCheck');
const OpenAIHealthCheck = require('./interfaces/implementations/OpenAIHealthCheck');
const AnthropicHealthCheck = require('./interfaces/implementations/AnthropicHealthCheck');
const GoogleHealthCheck = require('./interfaces/implementations/GoogleHealthCheck');

// ModelsAggregator for aggregating model listings across backends
const ModelsAggregator = require('./models-aggregator');

const app = express();
const config = configModule.loadConfig();

// Initialize ModelsAggregator after config is loaded
const modelsAggregator = new ModelsAggregator(config.healthCheck.timeout);

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
const BackendInfo = require('./backend-info');
const backendInfo = new BackendInfo(config.healthCheck.timeout);

// ★ Insight ─────────────────────────────────────────────────────
// Convert config backends to Backend instances
// Each Backend contains: url, state, backendInfo, and healthChecker
// This follows composition over duplication - BackendInfo is attached
// directly to Backend rather than copied to capabilities.
// ──────────────────────────────────────────────────────────────────
const backends = config.backends.map(backendConfig => {
  const backend = new Backend(backendConfig.url, backendConfig.maxConcurrency);
  // Store the config name for display in the frontend
  backend.configName = backendConfig.name || 'Backend';
  return backend;
});

// Initialize BackendPool for unified backend management
const BackendPool = require('./backend-pool');
const backendPool = new BackendPool(backends);

// Initialize load balancer and health checker with Backend instances
const balancer = new Balancer(backends, config.maxQueueSize, config.queue.timeout, config.debug.enabled, config.debug.requestHistorySize);
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
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} backend - Backend instance
 * @param {string} [matchedModel] - Actual model name from regex matching (optional)
 */
function forwardRequest(req, res, backend, matchedModel = null) {
  // Process the request using the request processor module with optional model replacement
  processRequest(balancer, backend, req, res, () => {
    // Request completed
  }, config, matchedModel);
}

/**
 * Route: OpenAI-compatible API routes (with queuing support)
 * Queue-first architecture: all requests go through the queue for cache-aware selection
 */
app.all('/v1/chat/completions*', async (req, res) => {
  try {
    // Extract model from request body for backend selection and caching
    const models = extractModelsFromRequest(req);
    // extractModelsFromRequest returns either a string or array of strings
    const requestModel = Array.isArray(models) ? models[0] : models || null;

    // Create selection criterion for queued request
    // This captures what backends can serve this request
    // Model matching (regex resolution) happens later in BackendSelector.selectBackendWithCache()
    // when the backend is actually selected - not when the request arrives
    const criterion = {
      modelString: requestModel,
      apiType: config.primaryApiType || 'openai'
    };

    // Queue-first architecture: all requests go through the queue
    // This ensures cache-aware selection via selectBackendWithCache()
    const result = await balancer.queueRequestWithRequestData({
      req, res, config, criterion,
      requestModel // Pass original model for potential use
    });

    if (!result) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    // result is the backend instance (backward compatible)
    const backend = result;

    forwardRequest(req, res, backend, requestModel);
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
 * Queue-first architecture: all requests go through the queue for cache-aware selection
 */
app.all('/v1/messages*', async (req, res) => {
  try {
    // Extract model from request body for backend selection and caching
    const models = extractModelsFromRequest(req);
    // extractModelsFromRequest returns either a string or array of strings
    const requestModel = Array.isArray(models) ? models[0] : models || null;

    let matchedModel = requestModel;

    // Create selection criterion for queued request
    // This captures what backends can serve this request
    const criterion = {
      modelString: matchedModel,
      apiType: config.primaryApiType || 'anthropic'
    };

    // Queue-first architecture: all requests go through the queue
    // This ensures cache-aware selection via selectBackendWithCache()
    const backend = await balancer.queueRequestWithRequestData({
      req, res, config, matchedModel,
      criterion
    });

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend, matchedModel);
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

    let backend;
    let matchedModel = null;

    // Get backend using normal selection with model matching
    const result = balancer.getNextBackendForModelWithMatch(models);
    backend = result.backend;
    matchedModel = result.actualModel;

    if (!backend) {
      // Create selection criterion for queued request
      // This captures what backends can serve this request
      const criterion = {
        modelString: matchedModel,
        apiType: config.primaryApiType || 'ollama'
      };

      const queuedRequest = await balancer.queueRequestWithRequestData({
        req, res, config, matchedModel,
        criterion  // NEW: include selection criterion
      });
      backend = queuedRequest;
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend, matchedModel);
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
    let matchedModel = null;

    if (models) {
      // Get backend using normal selection with model matching
      const result = balancer.getNextBackendForModelWithMatch(models);
      backend = result.backend;
      matchedModel = result.actualModel;

      if (!backend) {
        const queuedRequest = await balancer.queueRequestWithRequestData({ req, res, config, matchedModel });
        backend = queuedRequest;
      }
    } else {
      backend = await balancer.queueRequestWithRequestData({ req, res, config, matchedModel });
    }

    if (!backend) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'No backends configured or all backends unhealthy',
        stats: balancer.getStats(),
        queueStats: balancer.getAllQueueStats()
      });
    }

    forwardRequest(req, res, backend, matchedModel);
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
 * Route: OpenAI-compatible models listing - aggregates models from all OpenAI and Groq backends
 * Returns unified model list filtered by health status
 */
app.get('/v1/models', (req, res) => {
  const models = modelsAggregator.aggregateForOpenAI(backendPool);
  res.json(models);
});

/**
 * Route: Ollama models listing - aggregates models from all Ollama backends
 * Returns Ollama-formatted model list filtered by health status
 */
app.get('/api/tags', (req, res) => {
  const models = modelsAggregator.aggregateForOllama(backendPool);
  res.json(models);
});

/**
 * Route: Google Vertex AI models listing - aggregates models from all Google backends
 * Returns Google-formatted model list filtered by health status
 */
app.get('/v1beta/models', (req, res) => {
  const models = modelsAggregator.aggregateForGoogle(backendPool);
  res.json(models);
});

/**
 * Route: Groq-compatible models listing - aggregates models from all Groq backends
 * Returns OpenAI-compatible format (Groq uses same format as OpenAI)
 */
app.get('/openai/v1/models', (req, res) => {
  const models = modelsAggregator.aggregateForGroq(backendPool);
  res.json(models);
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
    healthCheckInterval: config.healthCheck.interval,
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
      model_listings: {
        openai: '/v1/models',
        ollama: '/api/tags',
        google: '/v1beta/models',
        groq: '/openai/v1/models'
      },
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
    backends: healthStats.backends.map(b => ({
      ...b,
      activeStreamingRequests: b.activeStreamingRequests || 0,
      activeNonStreamingRequests: b.activeNonStreamingRequests || 0
    })),
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
      healthCheck: config.healthCheck,
      maxRetries: config.maxRetries,
      maxPayloadSize: config.maxPayloadSize,
      maxPayloadSizeMB: config.maxPayloadSizeMB,
      maxQueueSize: config.maxQueueSize,
      queue: config.queue,
      prompt: config.prompt
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
      activeStreamingRequests: b.activeStreamingRequests || 0,
      activeNonStreamingRequests: b.activeNonStreamingRequests || 0,
      maxConcurrency: b.maxConcurrency,
      utilizationPercent: Math.round((b.activeRequestCount / b.maxConcurrency) * 100),
      requestCount: b.requestCount,
      errorCount: b.errorCount,
      apiTypes: b.getApiTypes(),
      primaryApiType: b.getPrimaryApiType(),
      performanceStats: b.getPerformanceStats(),
      promptCacheStats: b.getPromptCacheStats()
    })),
    // Add: Prompt cache statistics summary
    promptCache: backends.map(b => ({
      backendId: b.id,
      backendUrl: b.url,
      cache: b.getPromptCacheStats()
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
        name: b.configName || 'Backend',  // Add backend name from config
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
        } : null,
        performanceStats: b.getPerformanceStats()
      };
    })
  });
});

/**
 * Debug endpoints - only available when debug mode is enabled (config.debug.enabled === true)
 */
if (config.debug.enabled) {
  /**
   * Route: Queue statistics
   */
  app.get('/queue/stats', (req, res) => {
    res.json({
      maxQueueSize: config.maxQueueSize,
      queueTimeout: config.queue.timeout,
      queues: balancer.getAllQueueStats()
    });
  });

  /**
   * Route: View queue contents
   */
  app.get('/queue/contents', (req, res) => {
    const queue = balancer.queue;
    const contents = queue.map((req, index) => ({
      index,
      timestamp: req.timestamp,
      age: Date.now() - req.timestamp,
      criterion: req.criterion,
      hasRequestData: !!req.requestData,
      hasTimeout: !!req.timeout,
      clientIp: req.clientIp || 'unknown',
      timedOut: req.timedOut || false,
      requestData: req.requestData ? {
        model: req.requestData.req?.body?.model,
        apiType: req.requestData.req?.body?.messages ? 'chat/completions' : (req.requestData.req?.body?.prompt ? 'ollama' : 'unknown')
      } : null
    }));

    res.json({
      totalQueued: queue.length,
      maxQueueSize: config.maxQueueSize,
      queue: config.queue,
      contents
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
   * Route: Reset prompt caches
   * POST /cache/reset - Reset all backend caches
   * POST /cache/reset?backend=<url> - Reset specific backend cache
   */
  app.post('/cache/reset', (req, res) => {
    const { backend } = req.query;

    if (backend) {
      // Reset specific backend cache
      const targetBackend = backends.find(b => b.url === backend);
      if (!targetBackend) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Backend not found: ${backend}`
        });
      }

      const result = targetBackend.resetPromptCache();
      // Trigger queue processing after clearing specific backend cache
      const queueProcessed = balancer.triggerQueueProcessing();
      console.info(`[${getTimestamp()}] Cache reset for ${backend} completed, queue processed: ${queueProcessed}`);
      res.json({
        success: result.success,
        message: result.message,
        backend: backend,
        cacheStats: targetBackend.getPromptCacheStats(),
        queueProcessed
      });
    } else {
      // Reset all backend caches via BackendPool
      const results = backendPool.resetCaches();
      // Trigger queue processing after clearing all caches
      const queueProcessed = balancer.triggerQueueProcessing();
      console.info(`[${getTimestamp()}] Cache reset completed, queue processed: ${queueProcessed}`);
      res.json({
        success: results.every(r => r.success),
        message: `Reset ${results.filter(r => r.success).length}/${results.length} backend caches`,
        results,
        queueProcessed
      });
    }
  });

  /**
   * Route: Reset all backend performance statistics
   */
  app.post('/stats/reset', (req, res) => {
    console.info(`[${getTimestamp()}] Reset all backend performance stats`);

    backends.forEach(backend => {
      backend.resetPerformanceStats();
    });

    res.json({
      success: true,
      message: 'All backend stats reset successfully',
      backends: backends.length
    });
  });

  /**
   * Route: Reset performance statistics for specific backend
   */
  app.post('/stats/reset/:backendUrl', (req, res) => {
    const backendUrl = decodeURIComponent(req.params.backendUrl);
    const targetBackend = backends.find(b => b.url === backendUrl);

    if (!targetBackend) {
      return res.status(404).json({
        success: false,
        error: 'Backend not found',
        backendUrl
      });
    }

    console.info(`[${getTimestamp()}] Reset stats for ${backendUrl}`);
    targetBackend.resetPerformanceStats();

    res.json({
      success: true,
      message: `Stats reset for ${backendUrl}`,
      backendUrl
    });
  });
}

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
 * Route: Debug request history (deprecated - use /debug/stats for prompt cache stats)
 */
app.get('/debug/requests', (req, res) => {
  res.json({
    message: 'Debug request tracking has been replaced with prompt cache statistics. Use /debug/stats to view prompt cache metrics.',
    endpoints: {
      debugStats: '/debug/stats',
      stats: '/stats'
    }
  });
});

/**
 * Route: Get last N requests with content (deprecated - use /debug/stats for prompt cache stats)
 * Query parameter: n (number of requests to return, default: 10)
 */
app.get('/debug/requests/recent', (req, res) => {
  const n = parseInt(req.query.n) || 10;
  res.json({
    message: 'Debug request tracking has been replaced with prompt cache statistics. Use /debug/stats to view prompt cache metrics.',
    endpoints: {
      debugStats: '/debug/stats',
      stats: '/stats'
    },
    requestedLimit: n
  });
});

/**
 * Route: Get debug requests filtered by backend ID (deprecated - use /debug/stats for prompt cache stats)
 * Query parameters:
 *   - backendId: (optional) Filter by specific backend ID
 *   - limit: (optional) Number of requests to return, default: 10
 */
app.get('/debug/requests/backend/:backendId', (req, res) => {
  const backendId = req.params.backendId;
  const limit = parseInt(req.query.limit) || 10;
  res.json({
    message: 'Debug request tracking has been replaced with prompt cache statistics. Use /debug/stats to view prompt cache metrics.',
    endpoints: {
      debugStats: '/debug/stats',
      stats: '/stats'
    },
    backendId: backendId,
    requestedLimit: limit
  });
});

/**
 * Route: Clear debug request history (deprecated - no action needed)
 */
app.post('/debug/clear', (req, res) => {
  res.json({
    success: true,
    message: 'Debug request tracking has been replaced with prompt cache statistics. No clearing needed.',
    endpoints: {
      debugStats: '/debug/stats',
      stats: '/stats'
    }
  });
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
 * Mount benchmark router
 */
const benchmarkRouter = require('./routes/benchmark');
app.use('/benchmark', benchmarkRouter);

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
            backend.healthChecker = new OllamaHealthCheck(config.healthCheck.timeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned OllamaHealthCheck`);
            break;
          case 'openai':
          case 'groq':
            backend.healthChecker = new OpenAIHealthCheck(config.healthCheck.timeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned OpenAIHealthCheck`);
            break;
          case 'anthropic':
            backend.healthChecker = new AnthropicHealthCheck(config.healthCheck.timeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned AnthropicHealthCheck`);
            break;
          case 'google':
            backend.healthChecker = new GoogleHealthCheck(config.healthCheck.timeout);
            console.debug(`[${getTimestamp()}] [Startup] Backend ${url}: Assigned GoogleHealthCheck`);
            break;
          default:
            // Fallback to OpenAI health check if unknown API type
            backend.healthChecker = new OpenAIHealthCheck(config.healthCheck.timeout);
            console.warn(`[${getTimestamp()}] [Startup] Backend ${url}: Unknown primary API ${primaryApiType}, using OpenAIHealthCheck`);
        }
      } else if (backendInfo.error) {
        console.warn(`[${getTimestamp()}] [Startup] Backend ${url}: Could not detect API - ${backendInfo.error}`);
        // Still assign a health checker for potential recovery
        backend.healthChecker = new OpenAIHealthCheck(config.healthCheck.timeout);
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
      if (config.debug.enabled) {
        console.log(`[Balancer] In DEBUG mode`);
      }
      console.log(`Backends (${backends.length}):`);
      backends.forEach((backend, i) => {
        const apiTypes = backend.getApiTypes();
        const modelCount = Object.values(backend.getAllModels()).flat().length;
        const status = backend.healthy ? '✓' : '✗';
        const apiTypeStr = apiTypes.length > 0 ? apiTypes.join(', ') : 'none';
        const primaryApi = backend.getPrimaryApiType() || 'none';
        const apiBadges = apiTypes.map(api => `[${api}]`).join(' ');
        console.log(`  ${i + 1}. ${backend.url} ${apiBadges} (${modelCount} models) ${status}`);
      });
      console.log(`\nRoutes:`);
      console.log(`  OpenAI API:     /v1/chat/completions*`);
      console.log(`  Anthropic API:  /v1/messages*`);
      console.log(`  Ollama API:     /api/*`);
      console.log(`  Models:         /models*`);
      console.log(`  Model Listings:`);
      console.log(`    OpenAI:       /v1/models`);
      console.log(`    Ollama:       /api/tags`);
      console.log(`    Google:       /v1beta/models`);
      console.log(`    Groq:         /openai/v1/models`);
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
