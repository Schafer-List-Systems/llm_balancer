/**
 * Round-robin load balancer
 * Distributes requests among healthy backends
 */

class Balancer {
  constructor(backends, maxQueueSize = 100, queueTimeout = 30000) {
    this.backends = backends;
    this.currentIndex = 0;
    this.requestCount = new Map();
    this.healthCheckCount = new Map();

    // Queue management
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.queues = new Map(); // priority -> [{ resolve, reject, timestamp }]
    this.initializeQueue(0); // Default priority queue

    // Initialize queues for any non-default priorities in backends
    backends.forEach(backend => {
      const priority = backend.priority || 0;
      if (priority !== 0) {
        this.initializeQueue(priority);
      }
    });
  }

  /**
   * Initialize a queue for a specific priority tier
   */
  initializeQueue(priority) {
    if (!this.queues.has(priority)) {
      this.queues.set(priority, []);
    }
  }

  /**
   * Get queue statistics for a priority tier
   */
  getQueueStats(priority) {
    const queue = this.queues.get(priority) || [];
    const now = Date.now();
    return {
      priority: priority,
      depth: queue.length,
      maxQueueSize: this.maxQueueSize,
      queueTimeout: this.queueTimeout,
      oldestRequestAge: queue.length > 0 ? now - queue[0].timestamp : 0,
      isFull: queue.length >= this.maxQueueSize
    };
  }

  /**
   * Get all queue statistics
   */
  getAllQueueStats() {
    const stats = [];
    this.queues.forEach((queue, priority) => {
      stats.push(this.getQueueStats(priority));
    });
    return stats;
  }

  /**
   * Add a request to the queue for a specific priority tier
   */
  _addToQueue(priority, request) {
    const queue = this.queues.get(priority);
    if (queue.length >= this.maxQueueSize) {
      request.reject(new Error(`Queue overflow for priority ${priority}`));
      return false;
    }

    // Add timeout for queue entry
    const timeoutId = setTimeout(() => {
      const idx = queue.findIndex(r => r.reject === request.reject);
      if (idx !== -1) {
        queue.splice(idx, 1);
        request.reject(new Error(`Queue timeout for priority ${priority}`));
      }
    }, this.queueTimeout);
    request.timeoutId = timeoutId;

    queue.push(request);
    return true;
  }

  /**
   * Get the next request from the queue for a specific priority tier
   */
  _getFromQueue(priority) {
    const queue = this.queues.get(priority);
    if (!queue || queue.length === 0) {
      return null;
    }
    return queue.shift();
  }

  /**
   * Clear a queued request (cancel timeout)
   */
  _clearQueueEntry(request) {
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
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
   * @param {number} priority - Optional: restrict to specific priority tier
   * @returns {Promise<Object|null>} Resolves to backend or null if all tiers exhausted
   */
  async queueRequest(priority) {
    // First, try to get an immediate backend
    const immediateBackend = this._getNextBackendInternal();
    if (immediateBackend) {
      return immediateBackend;
    }

    // No immediate backend available, need to queue
    // If a specific priority was requested, queue for that tier
    if (priority !== undefined) {
      return this._queueForPriorityTier(priority);
    }

    // Otherwise, try all priority tiers with queuing
    return this._queueForAllTiers();
  }

  /**
   * Notify that a backend is available (called when a backend becomes idle)
   * This will wake up queued requests until queue is empty
   * @param {number} priority - The priority tier that became available
   */
  notifyBackendAvailable(priority) {
    this.initializeQueue(priority); // Ensure queue exists

    // Process all queued requests for this priority tier
    while (true) {
      const queuedRequest = this._getFromQueue(priority);
      if (!queuedRequest) {
        break; // Queue is empty
      }

      // Clear the queue timeout
      this._clearQueueEntry(queuedRequest);

      // Try to get a backend now
      const backend = this._getNextBackendInternal();
      if (backend) {
        queuedRequest.resolve(backend);
      } else {
        // No backend available even after notification, reject
        queuedRequest.reject(new Error(`No backend available for priority ${priority}`));
      }
    }
  }

  /**
   * Queue a request for a specific priority tier
   */
  _queueForPriorityTier(priority) {
    return new Promise((resolve, reject) => {
      // First, ensure queue exists for this priority
      this.initializeQueue(priority);

      // Try to get an immediate backend from this tier
      const backend = this._getBackendFromTier(priority);
      if (backend) {
        resolve(backend);
        return;
      }

      // Queue the request
      const queued = this._addToQueue(priority, { resolve, reject, timestamp: Date.now() });
      if (!queued) {
        // Queue was full, rejection already handled in _addToQueue
      }
    });
  }

  /**
   * Queue a request, trying all priority tiers
   */
  _queueForAllTiers() {
    return new Promise((resolve, reject) => {
      // Sort priorities high to low
      const priorities = Array.from(this.queues.keys()).sort((a, b) => b - a);

      if (priorities.length === 0) {
        resolve(null); // No backends at all
        return;
      }

      // Try each tier, queue on first tier with backends
      let queued = false;
      for (const priority of priorities) {
        const tierBackends = this._getHealthyBackendsForPriority(priority);
        if (tierBackends.length === 0) continue;

        // Try to get an immediate backend from this tier
        const backend = this._getBackendFromTier(priority);
        if (backend) {
          resolve(backend);
          return;
        }

        // Queue for this tier
        queued = this._addToQueue(priority, { resolve, reject, timestamp: Date.now() });
        if (queued) {
          break; // Successfully queued
        }
      }

      if (!queued) {
        // All queues full or no backends
        resolve(null);
      }
    });
  }

  /**
   * Get healthy backends for a specific priority tier
   */
  _getHealthyBackendsForPriority(priority) {
    return this.backends.filter(b => b.healthy && (b.priority || 0) === priority);
  }

  /**
   * Get an idle backend from a specific priority tier
   */
  _getBackendFromTier(priority) {
    const tierBackends = this._getHealthyBackendsForPriority(priority);
    if (tierBackends.length === 0) return null;

    let attempts = 0;
    while (attempts < tierBackends.length) {
      const backend = tierBackends[this.currentIndex % tierBackends.length];
      this.currentIndex = (this.currentIndex + 1) % tierBackends.length;

      if (!backend.busy) {
        backend.requestCount = (backend.requestCount || 0) + 1;
        this.requestCount.set(backend.url,
          (this.requestCount.get(backend.url) || 0) + 1
        );
        return backend;
      }
      attempts++;
    }

    return null;
  }

  /**
   * Get next backend without queuing (internal method)
   */
  _getNextBackendInternal() {
    const totalBackends = this.backends.length;
    if (totalBackends === 0) {
      return null;
    }

    // Group backends by priority level
    const priorityTiers = new Map();

    this.backends.forEach(backend => {
      if (!backend.healthy) {
        return;  // Skip unhealthy backends
      }

      const priority = backend.priority || 0;
      if (!priorityTiers.has(priority)) {
        priorityTiers.set(priority, []);
      }
      priorityTiers.get(priority).push(backend);
    });

    // Sort priority tiers from highest to lowest
    const sortedPriorities = Array.from(priorityTiers.keys()).sort((a, b) => b - a);

    // Try each priority tier from highest to lowest
    for (const priority of sortedPriorities) {
      const tierBackends = priorityTiers.get(priority);

      // Select using currentIndex (round-robin across idle backends)
      let attempts = 0;
      let backend;

      while (attempts < tierBackends.length) {
        backend = tierBackends[this.currentIndex % tierBackends.length];

        if (!backend.busy) {
          backend.requestCount = (backend.requestCount || 0) + 1;
          this.requestCount.set(backend.url,
            (this.requestCount.get(backend.url) || 0) + 1
          );

          this.currentIndex = (this.currentIndex + 1) % tierBackends.length;
          return backend;
        }

        // Backend is busy, try next
        this.currentIndex = (this.currentIndex + 1) % tierBackends.length;
        attempts++;
      }

      // No available backend in this tier, continue to next tier
    }

    return null;
  }

  /**
   * Get the next backend with priority-based selection
   * Higher priority backends are selected first, with immediate fallback
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    const totalBackends = this.backends.length;
    if (totalBackends === 0) {
      return null;
    }

    // Group backends by priority level
    const priorityTiers = new Map();

    this.backends.forEach(backend => {
      if (!backend.healthy) {
        return;  // Skip unhealthy backends
      }

      const priority = backend.priority || 0;
      if (!priorityTiers.has(priority)) {
        priorityTiers.set(priority, []);
      }
      priorityTiers.get(priority).push(backend);
    });

    // Sort priority tiers from highest to lowest
    const sortedPriorities = Array.from(priorityTiers.keys()).sort((a, b) => b - a);

    // Try each priority tier from highest to lowest
    for (const priority of sortedPriorities) {
      const tierBackends = priorityTiers.get(priority);

      // Priority 1 within tier: Select using currentIndex (round-robin across idle backends)
      let attempts = 0;
      let backend;

      while (attempts < tierBackends.length) {
        backend = tierBackends[this.currentIndex % tierBackends.length];

        if (!backend.busy) {
          backend.requestCount = (backend.requestCount || 0) + 1;
          this.requestCount.set(backend.url,
            (this.requestCount.get(backend.url) || 0) + 1
          );

          this.currentIndex = (this.currentIndex + 1) % tierBackends.length;
          return backend;
        }

        // Backend is busy, try next
        this.currentIndex = (this.currentIndex + 1) % tierBackends.length;
        attempts++;
      }

      // No available backend in this tier, continue to next tier
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
   * Get current index (for debugging/testing)
   * @returns {number} Current round-robin index
   */
  getCurrentIndex() {
    return this.currentIndex;
  }
}

module.exports = Balancer;