/**
 * Round-robin load balancer
 * Distributes requests among healthy backends
 */

class Balancer {
  constructor(backends, maxQueueSize = 100, queueTimeout = 30000, debug = false, debugRequestHistorySize = 100) {
    this.backends = backends;
    this.currentIndex = 0;
    this.requestCount = new Map();
    this.healthCheckCount = new Map();

    // Queue management
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.queues = new Map(); // Single global queue (priority 0)

    // Debug configuration
    this.debug = debug;
    this.debugRequestHistorySize = debugRequestHistorySize;
    this.debugRequests = []; // Array to store request metadata including content
  }

  /**

  /**
   * Get queue statistics for the single global queue
   */
  getQueueStats(priority) {
    const queue = this.queues.get(0);
    const now = Date.now();

    if (!queue) {
      return {
        priority: priority || 0,
        depth: 0,
        maxQueueSize: this.maxQueueSize,
        queueTimeout: this.queueTimeout,
        oldestRequestAge: 0,
        isFull: false
      };
    }

    return {
      priority: priority || 0,
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
    return [this.getQueueStats()];
  }

  /**
   * Get a backend for a request, with optional queuing
   * If immediate=false, will queue the request if no backend is immediately available
   * @param {number} priority - Priority tier to use (undefined = use all tiers)
   * @param {boolean} immediate - If true, return immediately even if no backend available
   * @returns {Object|null|Promise} Backend or null, or Promise that resolves to backend
   */
  getBackend(priority, immediate = false) {
    if (!immediate) {
      // Use queuing
      return this.queueRequest(priority);
    }

    // Synchronous selection (existing behavior)
    return this.getNextBackend();
  }

  /**
   * Queue a request until a backend becomes available
   * @param {number} priority - Optional: priority level (used for backend selection only)
   * @returns {Promise<Object|null>} Resolves to backend or null if all backends unhealthy
   */
  async queueRequest(priority) {
    // Try to get backend immediately (when at least one backend is available)
    const immediateBackend = this._getHighestPriorityBackend();
    if (immediateBackend) {
      // Mark as busy immediately to prevent concurrent requests getting same backend
      immediateBackend.busy = true;
      // Increment request count for this backend
      immediateBackend.requestCount = (immediateBackend.requestCount || 0) + 1;
      this.requestCount.set(immediateBackend.url,
        (this.requestCount.get(immediateBackend.url) || 0) + 1);
      return immediateBackend;
    }

    // All backends are busy/unhealthy, queue for single global queue
    return this._queueForPriorityTier(priority);
  }

  /**
   * Notify that a backend is available (called when a backend becomes idle)
   * This will wake up queued requests from the single global queue
   * @param {number} priority - The priority tier that became available (used for logging only)
   */
  notifyBackendAvailable(priority) {
    const queue = this.queues.get(0);
    if (!queue || queue.length === 0) return;

    console.log(`[Balancer] Backend available, processing ${queue.length} queued request(s) for priority ${priority}`);

    // Process all pending requests from the single queue
    while (queue.length > 0) {
      const request = queue[0];
      clearTimeout(request.timeout);

      const backendIndex = this.getNextBackendIndex(priority);
      const backend = this.backends[backendIndex];

      if (backend && !backend.busy) {
        queue.shift();  // Remove from queue
        console.log(`[Balancer] Assigned queued request to backend ${backend.id} (${backend.url})`);
        request.resolve({
          backend: {
            id: backend.id,
            url: backend.url,
            priority: backend.priority
          },
          backendIndex
        });
      } else {
        // No available backend, stop processing for now
        break;
      }
    }
  }

  /**
   * Queue a request for a specific priority tier
   * All requests now go into a single global queue
   */
  _queueForPriorityTier(priority) {
    // Check if any healthy backends exist before queuing
    if (!this.hasAvailableBackends()) {
      return Promise.reject(new Error('No healthy backends available'));
    }

    return new Promise((resolve, reject) => {
      if (!this.queues.has(0)) {
        this.queues.set(0, []);
      }
      const queue = this.queues.get(0);

      if (queue.length >= this.maxQueueSize) {
        reject(new Error('Queue is full'));
        return;
      }

      const request = {
        priority,
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
   * Get the highest priority available backend
   * ALWAYS returns the highest priority healthy backend (no round-robin)
   * @returns {Object|null} Highest priority backend or null if no healthy backends
   */
  _getHighestPriorityBackend() {
    const backend = this._getSortedAvailableBackends()[0];
    return backend || null;
  }

  /**
   * Get the index of the highest priority backend
   * Returns the index in the original backend array
   * Always returns the highest priority healthy backend
   * @param {number} priority - Priority level (unused, kept for compatibility)
   * @returns {number|null} Index of highest priority backend or null
   */
  getNextBackendIndex(priority) {
    const backend = this._getSortedAvailableBackends()[0];
    return backend ? this.backends.indexOf(backend) : null;
  }

  /**
   * Helper method to get sorted available backends
   * @returns {Array} Sorted array of available backends (highest priority first)
   */
  _getSortedAvailableBackends() {
    const availableBackends = this.backends.filter(b => b.healthy && !b.busy);
    if (availableBackends.length === 0) {
      return [];
    }

    // Sort by priority (descending) to find highest priority
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
   * Higher priority backends are selected first
   * Uses round-robin across ALL backends (not within tiers)
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    const totalBackends = this.backends.length;
    if (totalBackends === 0) {
      return null;
    }

    // Sort ALL backends by priority (descending), then by original order
    const sortedBackends = [...this.backends].sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;  // Higher priority first
      }
      return this.backends.indexOf(a) - this.backends.indexOf(b);  // Original order as tiebreaker
    });

    // Get next backend using round-robin across ALL sorted backends
    let attempts = 0;
    let backend;

    while (attempts < totalBackends) {
      backend = sortedBackends[this.currentIndex % totalBackends];

      if (backend.healthy && !backend.busy) {
        backend.requestCount = (backend.requestCount || 0) + 1;
        this.requestCount.set(backend.url,
          (this.requestCount.get(backend.url) || 0) + 1
        );

        this.currentIndex = (this.currentIndex + 1) % totalBackends;
        return backend;
      }

      // Backend is unhealthy or busy, try next
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
      backend.busy = false;  // Reset busy state when backend is marked healthy
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
    console.log(`[DEBUG] Request tracked:`, metadata);
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
    console.log('[DEBUG] Request history cleared');
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
      queueSize: this.queues.get(0)?.length || 0,
      currentIndex: this.currentIndex,
      requestHistorySize: this.debugRequestHistorySize
    };
  }
}

module.exports = Balancer;
