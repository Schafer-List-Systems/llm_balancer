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
   * Run health checks on all backends with staggered execution
   * Staggering prevents request stacking and network contention
   */
  async checkAll() {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Running health checks for all backends...`);
    }
    this.lastCheckTime = new Date().toISOString();

    // Staggered health check execution - check one backend at a time with delay
    // This prevents request stacking and network contention that causes timeouts
    const staggerDelay = this.config.healthCheck.staggerDelay || 500;
    for (const backend of this.backends) {
      await this.checkBackendWithRetry(backend);
      await new Promise(resolve => setTimeout(resolve, staggerDelay));
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${getTimestamp()}] [HealthChecker] Health check cycle complete`);
    }
  }

  /**
   * Check a single backend's health with retry logic
   * Delegates to backend.healthChecker.check(this)
   * @param {Backend} backend - Backend instance with healthChecker assigned
   */
  async checkBackendWithRetry(backend) {
    const url = backend.url;
    const wasHealthy = backend.healthy;
    console.log(`[${getTimestamp()}] [HealthChecker] Checking ${url}`);

    // Try initial health check
    let result = await this.performHealthCheck(backend);

    // If timeout and retries allowed, retry once
    const isTimeout = result.error === 'Timeout' || (result.error && result.error.includes('ETIMEDOUT'));
    if (isTimeout && this.config.healthCheck.maxRetries > 0) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[${getTimestamp()}] [HealthChecker] Timeout on ${url}, retrying...`);
      }
      // Wait for retry delay
      const retryDelay = this.config.healthCheck.retryDelay || 2000;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      // Retry once
      result = await this.performHealthCheck(backend);
    }

    // Update backend state from final result
    if (result.healthy) {
      if (!wasHealthy) {
        console.log(`[${getTimestamp()}] [HealthChecker] Backend RECOVERED: ${url} (${backend.getApiTypes().join(', ')}) - models:`, result.models || []);
      }
      backend.healthy = true;
      backend.failCount = 0;
    } else {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[${getTimestamp()}] [HealthChecker] Backend unhealthy: ${url} (${result.error || 'unknown error'})`);
      }
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
    }
  }

  /**
   * Perform a single health check on a backend
   * @param {Backend} backend - Backend instance
   * @returns {Object} Health check result
   */
  async performHealthCheck(backend) {
    try {
      // ★ Insight ───────────────────────────────────────────────────
      // Use backend's own checkHealth method which delegates to the
      // assigned healthChecker. This ensures we use the correct
      // endpoint/port discovered at startup.
      // ──────────────────────────────────────────────────────────────
      return await backend.checkHealth();
    } catch (err) {
      console.error(`[${getTimestamp()}] [HealthChecker] Error checking ${backend.url}:`, err.message);
      return { healthy: false, error: err.message };
    }
  }

  /**
   * Get health check statistics
   * @returns {Object} Health check stats
   */
  getStats() {
    const healthyBackends = this.backends.filter(b => b.healthy);
    const unhealthyBackends = this.backends.filter(b => !b.healthy);

    // Health-only backend info with enhanced stats
    const backendsWithStats = this.backends.map(b => ({
      url: b.url,
      healthy: b.healthy,
      activeRequestCount: b.activeRequestCount,
      maxConcurrency: b.maxConcurrency,
      failCount: b.failCount || 0,
      timeoutCount: b.timeoutCount || 0,
      lastCheck: b.lastCheckTime || null,
      lastCheckDuration: b.lastCheckDuration || null
    }));

    return {
      totalBackends: this.backends.length,
      healthyBackends: healthyBackends.length,
      unhealthyBackends: unhealthyBackends.length,
      lastCheck: this.lastCheckTime,
      interval: this.config.healthCheck.interval,
      timeout: this.config.healthCheck.timeout,
      maxRetries: this.config.healthCheck.maxRetries,
      retryDelay: this.config.healthCheck.retryDelay,
      staggerDelay: this.config.healthCheck.staggerDelay,
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
