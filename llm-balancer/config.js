/**
 * Configuration module for LLM Balancer
 * Parses backend URLs from environment variables
 */

function loadConfig() {
  // Parse backend URLs from environment variable
  const backendUrls = process.env.BACKENDS || 'http://localhost:11434';
  const backendArray = backendUrls.split(',').map(url => url.trim()).filter(url => url);

  // Parse port configuration
  const port = parseInt(process.env.LB_PORT) || 3001;

  // Parse health check settings
  const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000;
  const healthCheckTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;

  // Parse retry configuration
  const maxRetries = parseInt(process.env.MAX_RETRIES) || 3;

  // Parse max payload size (in bytes, default: 50MB)
  const maxPayloadSize = parseInt(process.env.MAX_PAYLOAD_SIZE) || 50 * 1024 * 1024;
  const maxPayloadSizeMB = Math.round(maxPayloadSize / (1024 * 1024));

  // Parse queue configuration
  const maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE) || 100;
  const queueTimeout = parseInt(process.env.QUEUE_TIMEOUT) || 30000;

  // Parse request timeout (default: 5 minutes for LLM generation)
  const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 300000;

  // Parse debug configuration
  const debug = process.env.DEBUG === 'true';
  const debugRequestHistorySize = parseInt(process.env.DEBUG_REQUEST_HISTORY_SIZE) || 100;

  // Parse prompt cache configuration
  const maxPromptCacheSize = parseInt(process.env.MAX_PROMPT_CACHE_SIZE) || 5;
  const promptCacheSimilarityThreshold = parseFloat(process.env.PROMPT_CACHE_SIMILARITY_THRESHOLD) || 0.85;

  // Parse graceful shutdown timeout (default: 60 seconds for compute-heavy requests)
  const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT) || 60000;

  // Parse version
  const version = process.env.VERSION || '0.0.0';

  // Create backend objects with health status and statistics
  const backends = backendArray.map((url, index) => {
    // Parse priority from environment variable using index-based naming
    // BACKEND_PRIORITY_0, BACKEND_PRIORITY_1, etc.
    let priority = 1;  // Default priority

    const priorityEnv = process.env[`BACKEND_PRIORITY_${index}`];
    if (priorityEnv) {
      priority = parseInt(priorityEnv);
    }

    // Parse concurrency from environment variable using index-based naming
    // BACKEND_CONCURRENCY_0, BACKEND_CONCURRENCY_1, etc.
    let maxConcurrency = 1;  // Default: 1 concurrent request at a time

    const concurrencyEnv = process.env[`BACKEND_CONCURRENCY_${index}`];
    if (concurrencyEnv) {
      maxConcurrency = Math.max(1, parseInt(concurrencyEnv));
    }

    return {
      id: index + 1,  // Backend ID (1-based)
      url: url,
      priority: priority,  // Priority level (higher = higher priority)
      healthy: true,
      failCount: 0,
      requestCount: 0,
      errorCount: 0,
      activeRequestCount: 0,  // Counter for concurrent requests
      maxConcurrency: maxConcurrency,  // Maximum parallel requests allowed
      models: []
    };
  });

  return {
    port,
    backends,
    healthCheckInterval,
    healthCheckTimeout,
    maxRetries,
    maxPayloadSize,
    maxPayloadSizeMB,
    maxQueueSize,
    queueTimeout,
    requestTimeout,
    debug,
    debugRequestHistorySize,
    maxPromptCacheSize,
    promptCacheSimilarityThreshold,
    shutdownTimeout,
    version
  };
}

module.exports = {
  loadConfig
};