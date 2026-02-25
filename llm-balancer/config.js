/**
 * Configuration module for LLM Balancer
 * Parses backend URLs from environment variables
 */

function loadConfig() {
  // Parse backend URLs from environment variable
  const backendUrls = process.env.OLLAMA_BACKENDS || 'http://10.0.0.1:11434';
  const backendArray = backendUrls.split(',').map(url => url.trim()).filter(url => url);

  // Parse port configuration
  const port = parseInt(process.env.LB_PORT) || 3001;

  // Parse health check settings
  const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000;
  const healthCheckTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;

  // Parse retry configuration
  const maxRetries = parseInt(process.env.MAX_RETRIES) || 3;

  // Create backend objects with health status
  const backends = backendArray.map(url => ({
    url: url,
    healthy: true,
    failCount: 0
  }));

  return {
    port,
    backends,
    healthCheckInterval,
    healthCheckTimeout,
    maxRetries
  };
}

module.exports = {
  loadConfig
};