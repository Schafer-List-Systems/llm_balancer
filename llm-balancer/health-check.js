/**
 * Health checker for backend servers
 * Periodically checks backend health and marks as failed/recovered
 */

const http = require('http');
const { URL } = require('url');

// Helper function to get formatted timestamp
function getTimestamp() {
  return new Date().toISOString();
}

class HealthChecker {
  constructor(backends, config) {
    this.backends = backends;
    this.config = config;
    this.healthCheckIntervalId = null;
    this.lastCheckTime = null;
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.healthCheckIntervalId) {
      if (process.env.NODE_ENV === 'test') {
        return;
      }
      console.warn(`[${getTimestamp()}] [HealthChecker] Health checks already running`);
      return;
    }

    // Run immediate health check
    this.checkAll();

    // Set up periodic health checks
    this.healthCheckIntervalId = setInterval(() => {
      this.checkAll();
    }, this.config.healthCheckInterval);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Health checks started, interval: ${this.config.healthCheckInterval}ms`);
    }
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[${getTimestamp()}] [HealthChecker] Health checks stopped`);
      }
    }
  }

  /**
   * Run health checks on all backends
   */
  checkAll() {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Running health checks for all backends...`);
    }
    this.lastCheckTime = new Date().toISOString();
    this.backends.forEach(backend => {
      this.checkBackend(backend);
    });
  }

  /**
   * Get request options for a specific endpoint URL
   * @param {string} url - Backend URL
   * @param {string} endpoint - Endpoint path (/api/tags or /v1/models)
   * @returns {Object} HTTP request options
   */
  getEndpointOptions(url, endpoint) {
    const parsedUrl = new URL(url);
    return {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 11434,
      path: endpoint,
      method: 'GET',
      timeout: this.config.healthCheckTimeout
    };
  }

  /**
   * Make an HTTP request to check backend health
   * @param {Object} options - HTTP request options
   * @param {string} url - Backend URL for logging
   * @param {string} endpointName - Name of endpoint being checked (for logging)
   * @param {Object} backend - Backend object to update
   */
  makeHealthCheckRequest(options, url, endpointName, backend) {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk.toString(); });
      res.on('end', () => this.handleHealthResponse(res, body, backend, endpointName));
      res.resume();
    });

    req.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[${getTimestamp()}] [HealthChecker] ${endpointName} error for ${url}:`, err.message);
      }
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
    });

    req.on('timeout', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[${getTimestamp()}] [HealthChecker] ${endpointName} timeout for ${url}`);
      }
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
      req.destroy();
    });

    req.end();
  }

  /**
   * Check a single backend's health starting with Ollama endpoint
   * @param {Object} backend - Backend object with url property
   */
  checkBackend(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [HealthChecker] Checking ${url}`);

    // Try Ollama endpoint first: /api/tags -> { models: [{name: "..."}, ...] }
    this.makeHealthCheckRequest(
      this.getEndpointOptions(url, '/api/tags'),
      url,
      'Ollama',
      backend
    );
  }

  /**
   * Handle response and decide whether to try fallback endpoint
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Object} backend - Backend object to update
   * @param {string} endpointName - Name of endpoint that was checked
   */
  handleHealthResponse(res, body, backend, endpointName) {
    const url = backend.url;
    const healthy = backend.healthy;

    // Parse response and extract models from either format
    try {
      const data = JSON.parse(body);

      console.log(`[${getTimestamp()}] [HealthChecker] Parsed body for ${url} (${endpointName}):`, Object.keys(data));

      // Handle Ollama format: { models: [{name: "..."}, ...] }
      if (data.models && Array.isArray(data.models)) {
        backend.models = data.models.map(m => m.name || m);
        console.log(`[${getTimestamp()}] [HealthChecker] Extracted ${endpointName} models for ${url}:`, backend.models);
      }
      // Handle litellm/OpenAI format: { data: [{id: "...", ...}, ...] }
      else if (data.data && Array.isArray(data.data)) {
        backend.models = data.data.map(m => m.id || m);
        console.log(`[${getTimestamp()}] [HealthChecker] Extracted ${endpointName} models for ${url}:`, backend.models);
      }
      else {
        backend.models = [];
        console.log(`[${getTimestamp()}] [HealthChecker] No models found in response for ${url} (${endpointName}). Full response:`, body);

        // If this was Ollama endpoint and we got 404, try OpenAI format
        if (endpointName === 'Ollama' && res.statusCode === 404) {
          console.log(`[${getTimestamp()}] [HealthChecker] Trying OpenAI format fallback for ${url}`);
          this.makeHealthCheckRequest(
            this.getEndpointOptions(url, '/v1/models'),
            url,
            'OpenAI',
            backend
          );
          return;
        }
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [HealthChecker] Failed to parse response from ${url} (${endpointName}):`, e.message, 'Body:', body);
      backend.models = [];

      // If this was Ollama endpoint and we got an error, try OpenAI format
      if (endpointName === 'Ollama') {
        console.log(`[${getTimestamp()}] [HealthChecker] Trying OpenAI format fallback for ${url}`);
        this.makeHealthCheckRequest(
          this.getEndpointOptions(url, '/v1/models'),
          url,
          'OpenAI',
          backend
        );
        return;
      }
    }

    // Check for successful response (2xx status)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (!healthy) {
        console.log(`[${getTimestamp()}] [HealthChecker] Backend recovered: ${url} (status: ${res.statusCode})`);
      } else {
        console.log(`[${getTimestamp()}] [HealthChecker] Backend healthy: ${url} (status: ${res.statusCode})`);
      }
      backend.healthy = true;
      backend.failCount = 0;
    } else {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[${getTimestamp()}] [HealthChecker] Backend unhealthy: ${url} (status: ${res.statusCode})`);
      }
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
    }
  }

  /**
   * Get health check statistics
   * @returns {Object} Health check stats
   */
  getStats() {
    return {
      totalBackends: this.backends.length,
      healthyBackends: this.backends.filter(b => b.healthy).length,
      unhealthyBackends: this.backends.filter(b => !b.healthy).length,
      lastCheck: this.lastCheckTime,
      interval: this.config.healthCheckInterval,
      timeout: this.config.healthCheckTimeout
    };
  }
}

module.exports = HealthChecker;
