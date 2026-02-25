/**
 * Health checker for backend servers
 * Periodically checks backend health and marks as failed/recovered
 */

const http = require('http');
const { URL } = require('url');

class HealthChecker {
  constructor(backends, config) {
    this.backends = backends;
    this.config = config;
    this.healthCheckIntervalId = null;
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.healthCheckIntervalId) {
      console.warn('[HealthChecker] Health checks already running');
      return;
    }

    // Run immediate health check
    this.checkAll();

    // Set up periodic health checks
    this.healthCheckIntervalId = setInterval(() => {
      this.checkAll();
    }, this.config.healthCheckInterval);

    console.log(`[HealthChecker] Health checks started, interval: ${this.config.healthCheckInterval}ms`);
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
      console.log('[HealthChecker] Health checks stopped');
    }
  }

  /**
   * Run health checks on all backends
   */
  checkAll() {
    console.log('[HealthChecker] Running health checks for all backends...');
    this.backends.forEach(backend => {
      this.checkBackend(backend);
    });
  }

  /**
   * Check a single backend's health
   * @param {Object} backend - Backend object with url property
   */
  checkBackend(backend) {
    const { url, healthy } = backend;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: this.config.healthCheckTimeout
    };

    const req = http.request(options, (res) => {
      // Check for successful response (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (!healthy) {
          console.log(`[HealthChecker] Backend recovered: ${url} (status: ${res.statusCode})`);
          backend.healthy = true;
          backend.failCount = 0;
        } else {
          console.log(`[HealthChecker] Backend healthy: ${url} (status: ${res.statusCode})`);
        }
      } else {
        console.warn(`[HealthChecker] Backend unhealthy: ${url} (status: ${res.statusCode})`);
        backend.healthy = false;
        backend.failCount = (backend.failCount || 0) + 1;
      }

      res.resume(); // Consume response data
    });

    req.on('error', (err) => {
      console.error(`[HealthChecker] Backend error: ${url}`, err.message);
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
    });

    req.on('timeout', () => {
      console.error(`[HealthChecker] Backend timeout: ${url}`);
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
      req.destroy();
    });

    req.end();
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
      interval: this.config.healthCheckInterval,
      timeout: this.config.healthCheckTimeout
    };
  }
}

module.exports = HealthChecker;