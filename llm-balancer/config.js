/**
 * Configuration module for LLM Balancer
 * Parses backend URLs from environment variables
 */

function loadConfig() {
  // Parse backend URLs from environment variable
  const backendUrls = process.env.OLLAMA_BACKENDS || 'http://localhost:11434';
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

  // Create backend objects with health status and statistics
  const backends = backendArray.map((url, index) => {
    // Try to parse priority from environment variable
    // Support both BACKEND_PRIORITY_{index} and BACKEND_PRIORITY_{url}
    let priority = 0;  // Default priority

    // Method 1: Try specific backend index
    const priorityEnv = process.env[`BACKEND_PRIORITY_${index}`];
    if (priorityEnv) {
      priority = parseInt(priorityEnv);
    }

    // Method 2: Try URL-based priority
    const urlPriority = process.env[`BACKEND_PRIORITY_${url}`];
    if (urlPriority !== undefined) {
      priority = parseInt(urlPriority);
    }

    return {
      id: index + 1,  // Backend ID (1-based)
      url: url,
      priority: priority,  // Priority level (higher = higher priority)
      healthy: true,
      failCount: 0,
      requestCount: 0,
      errorCount: 0,
      busy: false,  // Track if backend is handling a request
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
    queueTimeout
  };
}

module.exports = {
  loadConfig
};