/**
 * Round-robin load balancer
 * Distributes requests among healthy backends
 */

class Balancer {
  constructor(backends) {
    this.backends = backends;
    this.currentIndex = 0;
    this.requestCount = new Map();
    this.healthCheckCount = new Map();
  }

  /**
   * Get the next backend, prioritizing idle backends
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    const totalBackends = this.backends.length;
    if (totalBackends === 0) {
      return null;
    }

    // Priority 1: Find an idle, healthy backend
    const idleBackend = this.backends.find(b => b.healthy && !b.busy);
    if (idleBackend) {
      idleBackend.requestCount = (idleBackend.requestCount || 0) + 1;
      this.requestCount.set(idleBackend.url,
        (this.requestCount.get(idleBackend.url) || 0) + 1
      );
      return idleBackend;
    }

    // Priority 2: Fallback to round-robin across all healthy backends
    let attempts = 0;
    let backend;

    while (attempts < totalBackends) {
      backend = this.backends[this.currentIndex];

      if (backend && backend.healthy) {
        backend.requestCount = (backend.requestCount || 0) + 1;
        this.requestCount.set(backend.url,
          (this.requestCount.get(backend.url) || 0) + 1
        );

        this.currentIndex = (this.currentIndex + 1) % totalBackends;
        return backend;
      }

      this.currentIndex = (this.currentIndex + 1) % totalBackends;
      attempts++;
    }

    return null;
  }

  /**
   * Mark a backend as failed
   * @param {string} backendUrl - URL of the backend to mark as failed
   */
  markFailed(backendUrl) {
    const backend = this.backends.find(b => b.url === backendUrl);
    if (backend) {
      backend.healthy = false;
      backend.failCount = (backend.failCount || 0) + 1;
      backend.errorCount = (backend.errorCount || 0) + 1;
      this.healthCheckCount.set(backendUrl, (this.healthCheckCount.get(backendUrl) || 0) + 1);
      console.error(`[Balancer] Backend marked as unhealthy: ${backendUrl}`);
    }
  }

  /**
   * Mark a backend as healthy
   * @param {string} backendUrl - URL of the backend to mark as healthy
   */
  markHealthy(backendUrl) {
    const backend = this.backends.find(b => b.url === backendUrl);
    if (backend) {
      backend.healthy = true;
      backend.failCount = 0;
      console.log(`[Balancer] Backend recovered: ${backendUrl}`);
    }
  }

  /**
   * Check if any healthy backends exist
   * @returns {boolean} True if there are healthy backends
   */
  hasAvailableBackends() {
    return this.backends.some(b => b.healthy);
  }

  /**
   * Get load balancer statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const healthyBackends = this.backends.filter(b => b.healthy);
    const unhealthyBackends = this.backends.filter(b => !b.healthy);

    return {
      totalBackends: this.backends.length,
      healthyBackends: healthyBackends.length,
      unhealthyBackends: unhealthyBackends.length,
      backends: this.backends.map(b => ({
        url: b.url,
        healthy: b.healthy,
        failCount: b.failCount || 0,
        requestCount: b.requestCount || 0,
        errorCount: b.errorCount || 0,
        models: b.models || []
      })),
      requestCounts: Object.fromEntries(this.requestCount)
    };
  }

  /**
   * Get current index (for debugging/testing)
   * @returns {number} Current round-robin index
   */
  getCurrentIndex() {
    return this.currentIndex;
  }
}

module.exports = Balancer;