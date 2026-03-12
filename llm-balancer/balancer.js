/**
 * Priority-based load balancer with FIFO queueing
 * Distributes requests among healthy backends by priority, then queues waiting requests
 */

const { BackendSelector, ModelMatcher } = require('./backend-selector');

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

    // Initialize backend selector for decoupled selection logic
    this.selector = new BackendSelector();
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
            console.log(`[${getTimestamp()}] [Balancer] Direct assignment to backend ${backend.url}`);
            return Promise.resolve(backend);
        } else {
            console.log(`[${getTimestamp()}] [Balancer] No available backend found, queuing request`);
            // Fall through to queueing logic below
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
   * Iterates through the queue and tries to forward as many requests as possible
   * to available backends, keeping the system efficient.
   */

  /**
   * Get the index of the highest priority backend
   * Returns the index in the original backend array
   * Always returns the highest priority healthy backend
   * @returns {number|null} Index of highest priority backend or null
   */
  getNextBackendIndex() {
    const backend = this.selector.getAvailableBackends(this.backends)[0];
    return backend ? this.backends.indexOf(backend) : null;
  }

  /**
   * Get the next backend with priority-based selection
   * Higher priority backends are selected first (FIFO within same priority)
   * Priority can be any integer (positive, negative, or zero)
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    return this.selector.selectBackend(this.backends);
  }

  /**
   * Get the next backend filtered by model support
   * Uses BackendSelector with model matching to find suitable backends
   * @param {string|string[]} models - Model(s) required for the request
   * @returns {Object|null} Next backend supporting the model or null if none available
   */
  getNextBackendForModel(models) {
    return this.selector.selectBackend(this.backends, { models });
  }

  /**
   * Get the next backend with regex model matching and return matched model info
   * Uses priority-first regex matching to find suitable backends
   * @param {string|string[]} models - Model(s) required for the request (can include comma-separated regex patterns)
   * @returns {{backend: Object|null, actualModel: string|null}} Backend and matched actual model name or null if none available
   */
  getNextBackendForModelWithMatch(models) {
    const candidates = this.selector._filterByHealthAndAvailability(this.backends);

    // Use priority-first regex matching
    const result = ModelMatcher.findBestMatchAcrossBackends(models, candidates);

    return {
      backend: result.backend || null,
      actualModel: result.actualModel || null
    };
  }

  /**
   * Select backend for a queued request with prefix-based optimization
   * Tries prefix match first, then falls back to normal selection
   * Does NOT block - always tries to find ANY available backend if high-priority match is unavailable
   *
   * @param {Object} request - The queued request object (must contain body with prompt/model/id)
   * @returns {Object|null} Selected backend or null if none available
   */
  selectBackendForQueuedRequest(request) {
    const prompt = request.body?.prompt || request.body?.messages;
    const model = request.body?.model || null;

    // Step 1: Try prefix-based selection first
    try {
      const prefixResult = this.selector.selectBackendWithPrefix(this.backends, {
        prompt,
        model,
        body: request.body,
        allowSkip: true
      });

      if (prefixResult && prefixResult.backend) {
        // Check if backend is actually available
        if (prefixResult.matchType === 'id') {
          // Exact ID match - always use this backend if exists
          return prefixResult.backend;
        } else if (!prefixResult.shouldSkip) {
          // Prefix match and backend is available
          console.log(`[Balancer] Selected backend for queued request via prefix match: ${prefixResult.matchType} (${prefixResult.matchLength} chars)`);
          return prefixResult.backend;
        }
        // shouldSkip=true means backend unavailable - fall through to normal selection
        console.log(`[Balancer] Prefix match backend unavailable, trying other backends`);
      }
    } catch (error) {
      if (error.message.startsWith('SKIP_REQUEST')) {
        console.log(`[Balancer] High-priority prefix match but backend unavailable, trying other backends`);
        // Fall through to normal selection - don't block
      } else {
        throw error;
      }
    }

    // Step 2: Fall back to normal selection - keep backends busy
    const backend = this.getNextBackend();
    if (backend) {
      console.log(`[Balancer] Selected backend via normal selection (keeping backends busy)`);
      return backend;
    }

    // No backend available at all
    return null;
  }

  /**
   * Process queued requests - tries to forward as many as possible
   * This replaces the old "one request per notification" logic
   * Now we iterate through the queue and forward any request that can be processed
   *
   * Key behavior: When a request should be skipped due to unavailable high-priority backend,
   * we do NOT stop processing - instead we move on and try to forward other requests
   * in the queue to available backends. The goal is to keep backends busy while prefix
   * matches are waiting.
   */
  processQueueWhenBackendAvailable() {
    const queue = this.queue;
    let processedCount = 0;
    let skippedCount = 0;

    console.log(`[${this._getTimestamp()}] [Balancer] Backend available, attempting to process ${queue.length} queued request(s)`);

    // Iterate through queue, trying to forward each request
    // We don't stop at the first one - we try to keep backends busy
    for (let i = 0; i < queue.length; i++) {
      const request = queue[i];

      // Skip timed-out requests
      if (request.timedOut) {
        console.log(`[${this._getTimestamp()}] [Balancer] Skipping timed-out request`);
        queue.splice(i, 1);
        i--;
        continue;
      }

      // Try to select a backend for this request
      const backend = this.selectBackendForQueuedRequest(request);

      if (backend) {
        // Backend found - forward this request
        if (request.timeout) {
          clearTimeout(request.timeout);
          request.timeout = null;
        }

        // Remove from queue and resolve
        queue.splice(i, 1);
        i--;
        processedCount++;

        // Increment backend's active request count (will be decremented on completion)
        backend.activeRequestCount++;

        // Trigger the actual request processing
        this.triggerRequestProcessing(request, backend);

        console.log(`[${this._getTimestamp()}] [Balancer] Forwarded request to backend ${backend.id} (${processedCount} processed)`);
      } else {
        // No backend available for this request
        skippedCount++;
      }
    }

    console.log(`[${this._getTimestamp()}] [Balancer] Queue processing complete: ${processedCount} forwarded, ${skippedCount} skipped`);
  }

  /**
   * Trigger actual request processing for a queued request
   * This is called after backend selection
   * @param {Object} request - The queued request with req/res/config
   * @param {Object} backend - Selected backend
   */
  triggerRequestProcessing(request, backend) {
    // Extract request data
    const { req, res, config } = request;

    // Call the request processor directly
    try {
      const { processRequest } = require('./request-processor');

      processRequest(this, backend, req, res, () => {
        // Request completed callback
        // Backend will decrement activeRequestCount and notify queue
      }, config);
    } catch (error) {
      console.error(`[${this._getTimestamp()}] [Balancer] Failed to process request:`, error);
      if (request.reject) {
        request.reject(error);
      }
    }
  }

  /**
   * Called when a backend becomes available (from releaseBackend)
   * Now iterates through queue instead of processing just one request
   */
  notifyBackendAvailable() {
    console.log(`[${this._getTimestamp()}] [Balancer] Backend became available, processing queue`);
    this.processQueueWhenBackendAvailable();
  }

  /**
   * Helper to get timestamp
   * @returns {string} ISO timestamp
   */
  _getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Get all available backends sorted by priority (no model filtering)
   * @returns {Array} Sorted array of available backends
   */
  getAvailableBackends() {
    return this.selector.getAvailableBackends(this.backends);
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
   * Check if any backend supports the requested models and is available
   * @param {string|string[]} models - Model(s) to check for
   * @returns {boolean} True if at least one suitable backend exists
   */
  hasBackendForModel(models) {
    return this.selector.hasAvailableBackend(this.backends, models);
  }

  /**
   * Get statistics about model availability across backends
   * @returns {Object} Statistics object with model information
   */
  getModelAvailabilityStats() {
    return this.selector.getModelAvailabilityStats(this.backends);
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
   * Testing helper: Simulate a request being processed by a backend
   * This increments activeRequestCount and returns a release function
   * Use this in tests to properly simulate the request lifecycle
   * @param {string} backendUrl - URL of the backend to simulate request on
   * @returns {Function} Release function to call when request completes
   */
  simulateRequestStart(backendUrl) {
    const backend = this.backends.find(b => b.url === backendUrl);
    if (!backend) {
      throw new Error(`Backend not found: ${backendUrl}`);
    }
    if (backend.activeRequestCount >= (backend.maxConcurrency || 1)) {
      throw new Error(`Backend ${backendUrl} is already at max concurrency`);
    }
    backend.activeRequestCount++;
    return () => this.simulateRequestEnd(backendUrl);
  }

  /**
   * Testing helper: Simulate a request completing on a backend
   * This decrements activeRequestCount and notifies the queue
   * @param {string} backendUrl - URL of the backend
   */
  simulateRequestEnd(backendUrl) {
    const backend = this.backends.find(b => b.url === backendUrl);
    if (!backend) {
      throw new Error(`Backend not found: ${backendUrl}`);
    }
    if (backend.activeRequestCount > 0) {
      backend.activeRequestCount--;
      if (backend.activeRequestCount < (backend.maxConcurrency || 1)) {
        this.notifyBackendAvailable();
      }
    }
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
   * Get debug statistics with backend performance metrics
   * @returns {Object} Debug statistics
   */
  getDebugStats() {
    if (!this.debug) return { enabled: false };

    const backendStats = this.backends.map(b => ({
      url: b.url,
      requestCount: b.requestCount || 0,
      performanceStats: b.getPerformanceStats()
    }));

    return {
      enabled: true,
      totalRequests: this.debugRequests.length,
      queueSize: this.queue.length,
      requestHistorySize: this.debugRequestHistorySize,
      backendStats: backendStats
    };
  }
}

module.exports = Balancer;
