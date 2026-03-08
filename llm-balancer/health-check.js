/**
 * Health checker for backend servers
 * Periodically checks backend health and marks as failed/recovered
 * Uses interface pattern to support multiple API types (Ollama, LiteLLM, OpenAI)
 */

const MultiAPIChecker = require('./interfaces/implementations/MultiAPIChecker');

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

    // Create health check interface instance (uses MultiAPIChecker for auto-detection)
    this.healthInterface = new MultiAPIChecker(config.healthCheckTimeout);
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
  async checkAll() {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Running health checks for all backends...`);
    }
    this.lastCheckTime = new Date().toISOString();

    // Run health checks in parallel for better performance
    await Promise.all(this.backends.map(backend => this.checkBackend(backend)));

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Health check cycle complete`);
    }
  }

  /**
   * Check a single backend's health using the interface pattern
   * The interface knows how to detect API type and extract models
   * @param {Object} backend - Backend object with url property
   */
  async checkBackend(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [HealthChecker] Checking ${url}`);

    try {
      // Use the health interface to check backend and update its capabilities
      const result = await this.healthInterface.check(backend);

      if (result.healthy) {
        // Update backend state from interface result
        backend.healthy = true;
        backend.failCount = 0;

        // Log with detected API type and models
        console.log(`[${getTimestamp()}] [HealthChecker] Backend healthy: ${url} (${result.apiType}) - models:`, result.models);
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[${getTimestamp()}] [HealthChecker] Backend unhealthy: ${url} (${result.error || 'unknown error'})`);
        }
        backend.healthy = false;
        backend.failCount = (backend.failCount || 0) + 1;

        // Clear models for unhealthy backends
        if (!backend.capabilities) {
          backend.capabilities = {};
        }
        backend.capabilities.models = [];
      }
    } catch (err) {
      console.error(`[${getTimestamp()}] [HealthChecker] Error checking ${url}:`, err.message);
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;

      if (!backend.capabilities) {
        backend.capabilities = {};
      }
      backend.capabilities.models = [];
    }
  }

  /**
   * Get health check statistics
   * @returns {Object} Health check stats
   */
  getStats() {
    const healthyBackends = this.backends.filter(b => b.healthy);
    const unhealthyBackends = this.backends.filter(b => !b.healthy);

    // Add API type info to backend stats if available
    const backendsWithInfo = this.backends.map(b => ({
      url: b.url,
      healthy: b.healthy,
      apiType: b.capabilities?.apiType || 'unknown',
      models: b.capabilities?.models || [],
      activeRequestCount: b.activeRequestCount,
      maxConcurrency: b.maxConcurrency,
      failCount: b.failCount || 0
    }));

    return {
      totalBackends: this.backends.length,
      healthyBackends: healthyBackends.length,
      unhealthyBackends: unhealthyBackends.length,
      lastCheck: this.lastCheckTime,
      interval: this.config.healthCheckInterval,
      timeout: this.config.healthCheckTimeout,
      backends: backendsWithInfo
    };
  }

  /**
   * Get the health check interface (for external use)
   * @returns {Object} Health check interface instance
   */
  getHealthInterface() {
    return this.healthInterface;
  }
}

module.exports = HealthChecker;
