/**
 * Priority-based load balancer with FIFO queueing
 * Distributes requests among healthy backends by priority, then queues waiting requests
 */

// Helper function to get formatted timestamp
function getTimestamp() {
  return new Date().toISOString();
}

class Balancer {
  constructor(backends, maxQueueSize = 100, queueTimeout = 30000, debug = false, debugRequestHistorySize = 100) {
    this.backends = backends;
    this.requestCount = new Map();
    this.healthCheckCount = new Map();

    // Queue management
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.queue = []; // Single global queue

    // Debug configuration
    this.debug = debug;
    this.debugRequestHistorySize = debugRequestHistorySize;
    this.debugRequests = []; // Array to store request metadata including content
  }

  /**

  /**
   * Get queue statistics for the single global queue
   */
  getQueueStats() {
    const queue = this.queue;
    const now = Date.now();

    return {
      depth: queue.length,
      maxQueueSize: this.maxQueueSize,
      queueTimeout: this.queueTimeout,
      oldestRequestAge: queue.length > 0 ? now - queue[0].timestamp : 0,
      isFull: queue.length >= this.maxQueueSize
    };
  }

  /**
   * Get all queue statistics (now single queue)
   */
  getAllQueueStats() {
    // TODO: this function is deprecated. replace all usage by getQueueStats() instead.
    return [this.getQueueStats()];
  }

  /**
   * Queue a request for processing when a backend becomes available
   * If there's no backlog (queue empty), get an immediate backend
   * Otherwise, maintain FIFO by queuing the request
   * @returns {Promise} Promise that resolves when a backend is available
   */
  async queueRequest() {
    console.log(`[${getTimestamp()}] [Balancer] queueRequest() called, queue length: ${this.queue.length}, backends at max concurrency: ${this.backends.filter(b => b.activeRequestCount >= b.maxConcurrency).length}`);

    // Check if any healthy backends exist before queuing
    if (!this.hasHealthyBackends()) {
        console.log(`[${getTimestamp()}] [Balancer] No healthy backends available`);
        return Promise.reject(new Error('No healthy backends available'));
    }

    // If queue is empty, try to get immediate backend
    if (this.queue.length === 0) {
        console.log(`[${getTimestamp()}] [Balancer] Queue empty, trying to get immediate backend`);
        const backend = this.getNextBackend();
        if (backend) {
            // Increment request count for this backend
            // Note: activeRequestCount is incremented in processRequest() after this returns
            backend.requestCount = (backend.requestCount || 0) + 1;
            this.requestCount.set(backend.url,
              (this.requestCount.get(backend.url) || 0) + 1);

            console.log(`[${getTimestamp()}] [Balancer] Direct assignment to backend ${backend.url}`);
            return Promise.resolve(backend);
        } else {
            console.log(`[${getTimestamp()}] [Balancer] No available backend found`);
        }
    }

    return new Promise((resolve, reject) => {
        const queue = this.queue;

        if (queue.length >= this.maxQueueSize) {
            reject(new Error('Queue is full'));
            return;
        }

        const request = {
            resolve,
            reject,
            timestamp: Date.now(),
            timeout: setTimeout(() => {
                reject(new Error('Request timeout'));
            }, this.queueTimeout)
        };

        queue.push(request);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) + 1);
    });
  }

  /**
   * Notify that a backend is available (called when a backend becomes idle)
   * This will wake up queued requests from the single global queue
   */
  notifyBackendAvailable() {
    const queue = this.queue;
    if (!queue || queue.length === 0) return;

    console.log(`[${getTimestamp()}] [Balancer] Backend available, processing ${queue.length} queued request(s)`);

    // Process all pending requests from the single queue
    while (queue.length > 0) {
      const request = queue[0];
      clearTimeout(request.timeout);

      const backend = this.getNextBackend();

      if (backend) {
        // Increment request count for this backend
        // Note: activeRequestCount is incremented in processRequest() after this resolves
        backend.requestCount = (backend.requestCount || 0) + 1;
        this.requestCount.set(backend.url,
          (this.requestCount.get(backend.url) || 0) + 1);

        queue.shift();  // Remove from queue
        console.log(`[${getTimestamp()}] [Balancer] Assigned queued request to backend ${backend.id} (${backend.url})`);
        request.resolve(backend);
      } else {
        // No available backend, stop processing for now
        break;
      }
    }
  }

  /**
   * Get the index of the highest priority backend
   * Returns the index in the original backend array
   * Always returns the highest priority healthy backend
   * @returns {number|null} Index of highest priority backend or null
   */
  getNextBackendIndex() {
    const backend = this._getSortedAvailableBackends()[0];
    return backend ? this.backends.indexOf(backend) : null;
  }

  /**
   * Helper method to get sorted available backends
   * @returns {Array} Sorted array of available backends (highest priority first)
   */
  _getSortedAvailableBackends() {
    const availableBackends = this.backends.filter(
      b => b.healthy && b.activeRequestCount < b.maxConcurrency
    );
    if (availableBackends.length === 0) {
      return [];
    }

    // Sort by priority (descending) to find the highest priority backend
    return [...availableBackends].sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;  // Higher priority first
      }
      return this.backends.indexOf(a) - this.backends.indexOf(b);
    });
  }

  /**
   * Get the next backend with priority-based selection
   * Higher priority backends are selected first (FIFO within same priority)
   * Priority can be any integer (positive, negative, or zero)
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    const sortedBackends = this._getSortedAvailableBackends();

    for (let i = 0; i < sortedBackends.length; i++ ) {
      let backend = sortedBackends[i];

      if (backend.healthy && backend.activeRequestCount < backend.maxConcurrency) {
        return backend;
      }

      // Backend is unhealthy or at max concurrency, try next
      i++;
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
      backend.activeRequestCount = 0; // Also clear active request count so it can be retried
      backend.failCount = (backend.failCount || 0) + 1;
      backend.errorCount = (backend.errorCount || 0) + 1;
      this.healthCheckCount.set(backendUrl, (this.healthCheckCount.get(backendUrl) || 0) + 1);
      console.error(`[${getTimestamp()}] [Balancer] Backend marked as unhealthy: ${backendUrl}`);

      // Also mark as healthy if it becomes active again (for test scenarios)
      // This prevents the backend from being permanently marked as unhealthy
      // The HealthChecker will automatically recover it on next successful check
      if (backend.activeRequestCount > 0) {
        this.markHealthy(backendUrl);
      }
    }
  }

  /**
   * Mark a backend as healthy
   * @param {string} backendUrl - URL of the backend to mark as healthy
   */
  markHealthy(backendUrl) {
    const backend = this.backends.find(b => b.url === backendUrl);
    if (backend && !backend.healthy) {
      // Only mark as healthy if it wasn't already
      backend.healthy = true;
      backend.failCount = 0;
      console.log(`[${getTimestamp()}] [Balancer] Backend recovered: ${backendUrl}`);
    }
  }

  /**
   * Check if any healthy backends exist
   * @returns {boolean} True if there are healthy backends
   */
  hasHealthyBackends() {
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
        activeRequestCount: b.activeRequestCount,
        maxConcurrency: b.maxConcurrency,
        utilizationPercent: Math.round((b.activeRequestCount / b.maxConcurrency) * 100),
        failCount: b.failCount || 0,
        requestCount: b.requestCount || 0,
        errorCount: b.errorCount || 0,
        models: b.models || []
      })),
      requestCounts: Object.fromEntries(this.requestCount)
    };
  }

  /**
   * Add a request to debug tracking
   * @param {Object} metadata - Request metadata
   * @param {Object} requestData - Request data (optional)
   * @param {Object} responseData - Response data (optional)
   */
  trackDebugRequest(metadata, requestData = null, responseData = null) {
    if (!this.debug) return;

    const request = {
      ...metadata,
      timestamp: Date.now(),
      id: this.debugRequests.length + 1,
      requestContent: requestData,
      responseContent: responseData
    };

    // Add to front and limit size
    this.debugRequests.unshift(request);
    if (this.debugRequests.length > this.debugRequestHistorySize) {
      this.debugRequests = this.debugRequests.slice(0, this.debugRequestHistorySize);
    }

    // Log to console if debug is enabled
    console.log(`[${getTimestamp()}] [DEBUG] Request tracked:`, metadata);
  }

  /**
   * Get debug request history
   * @returns {Array} Debug request history
   */
  getDebugRequestHistory() {
    if (!this.debug) return [];
    return [...this.debugRequests];
  }

  /**
   * Get debug requests filtered by backend ID with optional limit
   * @param {string} backendId - Optional backend ID to filter by
   * @param {number} limit - Optional limit on number of requests to return
   * @returns {Array} Filtered debug request history
   */
  getDebugRequestsFiltered(backendId, limit) {
    if (!this.debug) return [];

    let filtered = [...this.debugRequests];

    // Filter by backend ID if specified
    if (backendId) {
      filtered = filtered.filter(req => req.backendId === backendId);
    }

    // Apply limit if specified
    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Clear debug request history
   */
  clearDebugRequestHistory() {
    if (!this.debug) return;
    this.debugRequests = [];
    console.log(`[${getTimestamp()}] [DEBUG] Request history cleared`);
  }

  /**
   * Get debug statistics
   * @returns {Object} Debug statistics
   */
  getDebugStats() {
    if (!this.debug) return { enabled: false };

    return {
      enabled: true,
      totalRequests: this.debugRequests.length,
      queueSize: this.queue.length,
      requestHistorySize: this.debugRequestHistorySize
    };
  }
}

module.exports = Balancer;
