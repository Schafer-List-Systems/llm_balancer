/**
 * Priority-based load balancer with FIFO queueing
 * Distributes requests among healthy backends by priority, then queues waiting requests
 *
 * Architecture:
 * - BackendPool owns the backend collection and provides unified filtering
 * - Balancer owns queueing and request routing logic
 * - This separation of concerns enables independent evolution of pool management and queueing
 */

const BackendPool = require('./backend-pool');
const { BackendSelector, ModelMatcher } = require('./backend-selector');

// Helper function to get formatted timestamp
function getTimestamp() {
  return new Date().toISOString();
}

class Balancer {
  constructor(backends, maxQueueSize = 100, queueTimeout = 30000, debug = false, debugRequestHistorySize = 100) {
    // BackendPool owns the backend collection (source of truth)
    this.backendPool = new BackendPool(backends);
    this.requestCount = new Map();
    this.healthCheckCount = new Map();

    // Queue management
    this.maxQueueSize = maxQueueSize;
    this.queueTimeout = queueTimeout;
    this.queue = []; // Single global queue

    // Debug configuration
    this.debug = debug;
    this.debugRequestHistorySize = debugRequestHistorySize;

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
    console.log(`[${getTimestamp()}] [Balancer] queueRequest() called, queue length: ${this.queue.length}, backends at max concurrency: ${this.backendPool.getAll().filter(b => b.activeRequestCount >= b.maxConcurrency).length}`);

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
   * Queue a request with request data attached
   * This is used when requests need to be queued and the request data needs to be preserved
   * @param {Object} requestData - Object containing req, res, config, matchedModel
   * @returns {Promise} Promise that resolves when a backend is available
   */
  async queueRequestWithRequestData(requestData) {
    // Check if any healthy backends exist before queuing
    if (!this.hasHealthyBackends()) {
        console.log(`[${getTimestamp()}] [Balancer] No healthy backends available`);
        throw new Error('No healthy backends available');
    }

    // If queue is empty, try to get immediate backend
    if (this.queue.length === 0) {
        const backend = this.getNextBackend();
        if (backend) {
            // Store requestData in the backend for later use
            backend.pendingRequestData = requestData;
            console.log(`[${getTimestamp()}] [Balancer] Direct assignment to backend ${backend.url}`);
            return Promise.resolve(backend);
        } else {
            console.log(`[${getTimestamp()}] [Balancer] No available backend found, queuing request`);
            // Fall through to queueing logic
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
            }, this.queueTimeout),
            requestData: requestData
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
    const backends = this.backendPool.getAll();
    const backend = this.selector.getAvailableBackends(backends)[0];
    return backend ? backends.indexOf(backend) : null;
  }

  /**
   * Get the next backend with priority-based selection
   * Higher priority backends are selected first (FIFO within same priority)
   * Priority can be any integer (positive, negative, or zero)
   * @returns {Object|null} Next backend or null if all are unhealthy
   */
  getNextBackend() {
    return this.selector.selectBackend(this.backendPool.getAll());
  }

  /**
   * Get the next backend filtered by model support
   * Uses BackendSelector with model matching to find suitable backends
   * @param {string|string[]} models - Model(s) required for the request
   * @returns {Object|null} Next backend supporting the model or null if none available
   */
  getNextBackendForModel(models) {
    return this.selector.selectBackend(this.backendPool.getAll(), { models });
  }

  /**
   * Get the next backend with regex model matching and return matched model info
   * Uses priority-first regex matching to find suitable backends
   * @param {string|string[]} models - Model(s) required for the request (can include comma-separated regex patterns)
   * @returns {{backend: Object|null, actualModel: string|null}} Backend and matched actual model name or null if none available
   */
  getNextBackendForModelWithMatch(models) {
    const candidates = this.selector._filterByHealthAndAvailability(this.backendPool.getAll());

    // Use priority-first regex matching
    const result = ModelMatcher.findBestMatchAcrossBackends(models, candidates);

    return {
      backend: result.backend || null,
      actualModel: result.actualModel || null
    };
  }

  /**
   * Process queued requests - tries to forward as many as possible
   * @param {Object} request - The queued request object (must contain body with prompt/model/id)
   */
  processQueueWhenBackendAvailable() {
    const queue = this.queue;

    if (!queue || queue.length === 0) {
      return;
    }

    const request = queue[0];

    // Skip timed-out requests
    if (request.timedOut) {
      queue.splice(0, 1);
      this.requestCount.set('queued', (this.requestCount.get('queued') || 0) - 1);
      return;
    }

    // Try to get a backend for this request
    const backend = this.getNextBackend();

    if (backend) {
      // Backend found - forward this request
      if (request.timeout) {
        clearTimeout(request.timeout);
        request.timeout = null;
      }

      // Remove from queue and resolve
      queue.splice(0, 1);
      this.requestCount.set('queued', (this.requestCount.get('queued') || 0) - 1);

      // Trigger the actual request processing
      // Note: requestData may be null for simple queueRequest() calls
      this.triggerRequestProcessing(request, backend, null);
    }
  }

  /**
   * Trigger actual request processing for a queued request
   * This is called after backend selection
   * @param {Object} request - The queued request with requestData (or backend with pendingRequestData)
   * @param {Object} backend - Selected backend
   * @param {Object} requestData - Optional requestData (can be null for simple queueRequest calls)
   */
  triggerRequestProcessing(request, backend, requestData = null) {
    // Handle both cases:
    // 1. Direct backend assignment: requestData is in backend.pendingRequestData
    // 2. Queue processing: requestData is in request.requestData or passed as parameter
    if (backend.pendingRequestData) {
      requestData = backend.pendingRequestData;
      delete backend.pendingRequestData;
    } else if (!requestData && request.requestData) {
      requestData = request.requestData;
    }

    // If no requestData and no request data, just resolve with backend
    if (!requestData && (!request.req || !request.res)) {
      // Simple queue request - just resolve with backend
      if (request.resolve) {
        request.resolve(backend);
      }
      return;
    }

    if (!requestData) {
      console.error(`[${this._getTimestamp()}] [Balancer] No requestData found for request processing`);
      if (request.reject) {
        request.reject(new Error('No requestData found'));
      }
      return;
    }

    const { req, res, config, matchedModel } = requestData;

    // Call the request processor directly
    try {
      const { processRequest, releaseBackend } = require('./request-processor');

      // Note: activeRequestCount is incremented in processRequest, not here
      // This ensures the count is only incremented once per request

      processRequest(this, backend, req, res, () => {
        // Request completed callback
        // Backend will decrement activeRequestCount and notify queue
      }, config, matchedModel);
    } catch (error) {
      console.error(`[${this._getTimestamp()}] [Balancer] Failed to process request:`, error);
      // Release backend if it was already assigned (activeRequestCount was incremented)
      releaseBackend(this, backend);
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
    return this.selector.getAvailableBackends(this.backendPool.getAll());
  }

  /**
   * Mark a backend as failed
   * @param {string} backendUrl - URL of the backend to mark as failed
   */
  markFailed(backendUrl) {
    const backends = this.backendPool.getAll();
    const backend = backends.find(b => b.url === backendUrl);
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
    const backends = this.backendPool.getAll();
    const backend = backends.find(b => b.url === backendUrl);
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
    return this.backendPool.some({ healthy: true });
  }

  /**
   * Check if any backend supports the requested models and is available
   * @param {string|string[]} models - Model(s) to check for
   * @returns {boolean} True if at least one suitable backend exists
   */
  hasBackendForModel(models) {
    return this.selector.hasAvailableBackend(this.backendPool.getAll(), models);
  }

  /**
   * Get statistics about model availability across backends
   * @returns {Object} Statistics object with model information
   */
  getModelAvailabilityStats() {
    return this.selector.getModelAvailabilityStats(this.backendPool.getAll());
  }

  /**
   * Get load balancer statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const backends = this.backendPool.getAll();
    const healthyBackends = backends.filter(b => b.healthy);
    const unhealthyBackends = backends.filter(b => !b.healthy);

    return {
      totalBackends: backends.length,
      healthyBackends: healthyBackends.length,
      unhealthyBackends: unhealthyBackends.length,
      backends: backends.map(b => ({
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
    const backends = this.backendPool.getAll();
    const backend = backends.find(b => b.url === backendUrl);
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
    const backends = this.backendPool.getAll();
    const backend = backends.find(b => b.url === backendUrl);
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
   * Get debug statistics with backend performance metrics
   * @returns {Object} Debug statistics
   */
  getDebugStats() {
    if (!this.debug) return { enabled: false };

    const backends = this.backendPool.getAll();
    const backendStats = backends.map(b => ({
      url: b.url,
      requestCount: b.requestCount || 0,
      performanceStats: b.getPerformanceStats(),
      promptCacheStats: b.getPromptCacheStats()
    }));

    return {
      enabled: true,
      queueSize: this.queue.length,
      backendStats: backendStats
    };
  }
}

module.exports = Balancer;
