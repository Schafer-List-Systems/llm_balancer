/**
 * Health checker for backend servers
 * Periodically checks backend health and marks as failed/recovered
 * Uses Backend class with API-specific health checkers
 *
 * ★ Insight ─────────────────────────────────────────────────────
 * Delegation Pattern: HealthChecker.checkBackend() calls
 * backend.checkHealth() which delegates to the assigned
 * healthChecker.check(this). This keeps health logic separate
 * from backend state management.
 *
 * API-Centric Design: Each backend has a healthChecker assigned
 * based on its primary API type (ollama, openai, anthropic, google).
 * This ensures correct endpoint/port usage during health checks.
 * ──────────────────────────────────────────────────────────────────
 */

const Backend = require('./backends/Backend');

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

    // Set up periodic health checks using nested config structure
    const interval = this.config.healthCheck.interval;
    this.healthCheckIntervalId = setInterval(() => {
      this.checkAll();
    }, interval);

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Health checks started, interval: ${interval}ms`);
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
   * Check a single backend's health using backend.checkHealth()
   * Delegates to backend.healthChecker.check(this)
   * @param {Backend} backend - Backend instance with healthChecker assigned
   */
  async checkBackend(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [HealthChecker] Checking ${url}`);

    try {
      // ★ Insight ───────────────────────────────────────────────────
      // Use backend's own checkHealth method which delegates to the
      // assigned healthChecker. This ensures we use the correct
      // endpoint/port discovered at startup.
      // ──────────────────────────────────────────────────────────────
      const result = await backend.checkHealth();

      if (result.healthy) {
        // Update backend state from check result
        backend.healthy = true;
        backend.failCount = 0;

        // Log with detected API types and models
        const apiTypes = backend.getApiTypes();
        console.log(`[${getTimestamp()}] [HealthChecker] Backend healthy: ${url} (${apiTypes.join(', ')}) - models:`, result.models || []);
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[${getTimestamp()}] [HealthChecker] Backend unhealthy: ${url} (${result.error || 'unknown error'})`);
        }
        backend.healthy = false;
        backend.failCount = (backend.failCount || 0) + 1;
      }
    } catch (err) {
      console.error(`[${getTimestamp()}] [HealthChecker] Error checking ${url}:`, err.message);
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
    }
  }

  /**
   * Get health check statistics
   * @returns {Object} Health check stats
   */
  getStats() {
    const healthyBackends = this.backends.filter(b => b.healthy);
    const unhealthyBackends = this.backends.filter(b => !b.healthy);

    // Health-only backend info
    const backendsWithStats = this.backends.map(b => ({
      url: b.url,
      healthy: b.healthy,
      activeRequestCount: b.activeRequestCount,
      maxConcurrency: b.maxConcurrency,
      failCount: b.failCount || 0
    }));

    return {
      totalBackends: this.backends.length,
      healthyBackends: healthyBackends.length,
      unhealthyBackends: unhealthyBackends.length,
      lastCheck: this.lastCheckTime,
      interval: this.config.healthCheck.interval,
      timeout: this.config.healthCheck.timeout,
      backends: backendsWithStats
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
