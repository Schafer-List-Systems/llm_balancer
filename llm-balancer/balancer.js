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
const configModule = require('./config');

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

    // Queue history for visualization (tracks depth snapshots)
    this._queueDepthHistory = [];
    this.maxQueueHistory = configModule.loadConfig().queue.depthHistorySize;

    // Debug request ID counter (internal, separate from user-provided IDs)
    this._internalRequestIdCounter = 0;

    // Debug configuration
    this.debug = debug;
    this.debugRequestHistorySize = debugRequestHistorySize;

    // Initialize backend selector for decoupled selection logic
    this.selector = new BackendSelector();
  }

  /**
   * Generate a unique internal request ID for tracking/debugging
   * This is separate from any user-provided IDs in the request body
   * @returns {string} Unique request ID in format "req-NNNN"
   */
  _generateInternalRequestId() {
    this._internalRequestIdCounter++;
    return `req-${String(this._internalRequestIdCounter).padStart(4, '0')}`;
  }

  /**

  /**
   * Get queue statistics for the single global queue
   */
  getQueueStats() {
    const queue = this.queue;
    const now = Date.now();

    // Track queue depth history for visualization
    const currentDepth = queue.length;
    this._queueDepthHistory.push({
      depth: currentDepth,
      timestamp: now
    });

    // Limit history size
    if (this._queueDepthHistory.length > this.maxQueueHistory) {
      this._queueDepthHistory.shift();
    }

    return {
      depth: currentDepth,
      maxQueueSize: this.maxQueueSize,
      queueTimeout: this.queueTimeout,
      oldestRequestAge: queue.length > 0 ? now - queue[0].timestamp : 0,
      isFull: currentDepth >= this.maxQueueSize,
      // Add history for visualization
      depthHistory: [...this._queueDepthHistory]
    };
  }

  /**
   * Get queue depth history for visualization
   * @returns {Array} Array of {depth, timestamp} objects
   */
  getQueueDepthHistory() {
    return [...this._queueDepthHistory];
  }

  /**
   * Get queue contents (debug endpoint support)
   * Returns array of queued requests with their details
   * @returns {Array} Array of queued request info
   */
  getQueueList() {
    const queue = this.queue;
    return queue.map((req, index) => ({
      index,
      timestamp: req.timestamp,
      age: Date.now() - req.timestamp,
      criterion: req.criterion,
      timedOut: req.timedOut || false,
      hasRequestData: !!req.requestData,
      clientIp: req.clientIp || 'unknown',
      requestData: req.requestData ? {
        model: req.requestData.req?.body?.model || req.requestData.matchedModel || null,
        apiType: req.criterion?.apiType || null
      } : null
    }));
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
   * All requests are enqueued first - queue processing handles all backend selection uniformly
   * This ensures every request goes through cache-aware selection via BackendSelector
   * @returns {Promise} Promise that resolves when a backend is available
   */
  async queueRequest() {
    // Check if any healthy backends exist before queuing
    if (!this.hasHealthyBackends()) {
        console.log(`[${getTimestamp()}] [Balancer] No healthy backends available`);
        return Promise.reject(new Error('No healthy backends available'));
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
            // Internal request ID (separate from user-provided IDs)
            internalRequestId: this._generateInternalRequestId(),
            timedOut: false,
            timeout: setTimeout(() => {
                request.timedOut = true;
                console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Request timeout fired, rejecting promise`);
                reject(new Error('Request timeout'));
            }, this.queueTimeout)
        };

        queue.push(request);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) + 1);

        // Debug: Log when request is queued (simple queueRequest without requestData)
        if (this.debug) {
            console.log(`\n[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================`);
            console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] NEW REQUEST (no requestData) queued`);
            console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Queue depth: ${queue.length}`);
            console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================\n`);
        }

        // Try to process queue immediately - this ensures requests are processed as soon as backends are available
        this.processQueueWhenBackendAvailable();
    });
  }

  /**
   * Queue a request with request data attached
   * This is used when requests need to be queued and the request data needs to be preserved
   * @param {Object} requestData - Object containing req, res, config, matchedModel, and criterion
   * @returns {Promise} Promise that resolves when a backend is available
   */
  async queueRequestWithRequestData(requestData) {
    // Check if any healthy backends exist before queuing
    if (!this.hasHealthyBackends()) {
        console.log(`[${getTimestamp()}] [Balancer] No healthy backends available`);
        throw new Error('No healthy backends available');
    }

    // Always enqueue first - queue processing handles all backend selection uniformly
    // This ensures every request goes through cache-aware selection
    return new Promise((resolve, reject) => {
        const queue = this.queue;

        if (queue.length >= this.maxQueueSize) {
            reject(new Error('Queue is full'));
            return;
        }

        // Extract and validate the selection criterion
        const criterion = requestData.criterion || this._createCriterionFromRequestData(requestData);

        const request = {
            resolve,
            reject,
            timestamp: Date.now(),
            // Internal request ID (separate from user-provided IDs)
            internalRequestId: this._generateInternalRequestId(),
            timedOut: false,
            timeout: setTimeout(() => {
                request.timedOut = true;
                console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Request timeout fired, rejecting promise`);
                reject(new Error('Request timeout'));
            }, this.queueTimeout),
            requestData: requestData,
            criterion: criterion,
            clientIp: requestData.req?.connection?.remoteAddress || requestData.req?.socket?.remoteAddress || requestData.req?.ip || 'unknown'
        };

        queue.push(request);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) + 1);

        // Debug: Log when request is queued (with requestData)
        if (this.debug) {
            const model = requestData.req?.body?.model || requestData.matchedModel || 'unknown';
            console.log(`\n[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================`);
            console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] NEW REQUEST: model="${model}"`);
            console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Queue depth: ${queue.length}`);

            if (requestData && requestData.req) {
                const preview = this._getRequestContentPreview(requestData, request.internalRequestId);
                if (preview.firstPreview) {
                    console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] First paragraphs:`);
                    console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ${preview.firstPreview}`);
                }
                if (preview.lastPreview) {
                    console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Last paragraphs:`);
                    console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ${preview.lastPreview}`);
                }
                console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================\n`);
            }
        }

        // Try to process queue immediately - this ensures requests are processed as soon as backends are available
        this.processQueueWhenBackendAvailable();
    });
  }

  /**
   * Create a selection criterion from request data
   * A criterion captures what backends can serve this request
   * @param {Object} requestData - Object containing req, config, matchedModel
   * @returns {Object} Selection criterion with modelString and apiType
   */
  _createCriterionFromRequestData(requestData) {
    const { config, matchedModel } = requestData;

    // If criterion already exists, return it
    if (requestData.criterion) {
      return requestData.criterion;
    }

    // Extract API type from config (primary API type for the route)
    const apiType = config && config.primaryApiType ? config.primaryApiType : null;

    return {
      modelString: matchedModel || null,
      apiType: apiType
    };
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
   * Find a backend that matches the selection criterion
   * Uses BackendPool filtering and model matching to find suitable backends
   * @param {Object} criterion - Selection criterion with modelString and apiType
   * @returns {Object|null} Backend that matches the criterion or null
   */
  findBackendForCriterion(criterion) {
    if (!criterion) {
      return this.getNextBackend();
    }

    const backends = this.backendPool.getAll();

    // Start with healthy backends only
    let candidates = this.backendPool.filter({ healthy: true }).getAll();

    // Filter by API type if specified
    if (criterion.apiType) {
      candidates = candidates.filter(b => b.supportsApi && b.supportsApi(criterion.apiType));
    }

    // Filter by model matching if modelString is specified
    if (criterion.modelString) {
      const result = ModelMatcher.findBestMatchAcrossBackends(
        criterion.modelString,
        candidates
      );
      return result.backend || null;
    }

    // Fallback to priority-based selection
    return this.selector.selectBackend(candidates);
  }

  /**
   * Process queued requests using criterion-based selection with prompt cache awareness
   * Tries to process ONE request per call (maintaining backward compatibility)
   * Uses BackendSelector.selectBackendWithCache to prioritize backends with cache hits
   * If the first request has no suitable backend, skips to next eligible request
   */
  processQueueWhenBackendAvailable() {
    const queue = this.queue;

    if (!queue || queue.length === 0) {
      return;
    }

    // Try to process ONE request
    for (let i = 0; i < queue.length; i++) {
      const request = queue[i];

      // Skip timed-out requests
      if (request.timedOut) {
        queue.splice(i, 1);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) - 1);
        console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Request timed out, removing from queue`);
        // Try next request
        continue;
      }

      // Extract prompt body from request data for cache lookup
      const promptBody = this._extractPromptBody(request);

      // Use selector with cache awareness
      // Returns: { status: 'found'|'busy'|'none', backend, actualModel, message }
      const result = this.selector.selectBackendWithCache(
        this.backendPool.getAll(),
        request.criterion,
        promptBody
      );

      const model = request.criterion?.modelString || 'unknown';

      if (result.status === 'found') {
        // Backend found and available
        if (request.timeout) {
          clearTimeout(request.timeout);
          request.timeout = null;
        }

        // Remove from queue and resolve
        queue.splice(i, 1);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) - 1);

        // Debug: Log successful backend selection
        if (this.debug) {
          console.log(`\n[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================`);
          console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] BACKEND SELECTED: ${result.backend.url}`);
          console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] Model: ${model}`);
          if (request.requestData && request.requestData.req) {
            const preview = this._getRequestContentPreview(request.requestData, request.internalRequestId);
            if (preview.firstPreview) {
              console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] First paragraphs:`);
              console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ${preview.firstPreview}`);
            }
          }
          console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ====================\n`);
        }

        // Trigger the actual request processing
        this.triggerRequestProcessing(request, result.backend, null);
        // Done - only process one request per call
        return;
      }

      if (result.status === 'none') {
        // No backend supports this model - reject immediately
        console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ${result.message || 'No backend supports this model'}. Rejecting request.`);

        // Clear timeout and remove from queue
        if (request.timeout) {
          clearTimeout(request.timeout);
          request.timeout = null;
        }
        queue.splice(i, 1);
        this.requestCount.set('queued', (this.requestCount.get('queued') || 0) - 1);

        // Reject the request
        if (request.reject) {
          request.reject(new Error(result.message || `No backend available for model "${model}".`));
        }
        // Continue to next request (don't return - try to process other queued requests)
        continue;
      }

      // status === 'busy' - backend exists for this model but all are currently busy
      // Request should stay in queue
      console.log(`[${getTimestamp()}] [Balancer][${request.internalRequestId}] ${result.message || 'No backend currently available'}. Request stays in queue.`);
    }
    // No suitable request found - queue remains unchanged
  }

  /**
   * Extract prompt body from queued request for cache matching
   * @param {Object} request - Queued request with requestData
   * @returns {string|null} Prompt body or null
   */
  _extractPromptBody(request) {
    const requestData = request.requestData;
    if (!requestData || !requestData.req) {
      return null;
    }

    const req = requestData.req;
    let promptBody = null;

    // Handle raw body buffer
    if (req.is('raw') && Buffer.isBuffer(req.body)) {
      try {
        const bodyObj = JSON.parse(req.body.toString('utf8'));
        // Extract prompt from different API formats
        if (bodyObj.prompt !== undefined) {
          promptBody = bodyObj.prompt; // Ollama format
        } else if (bodyObj.messages !== undefined) {
          promptBody = JSON.stringify(bodyObj.messages); // OpenAI/Anthropic format
        } else if (bodyObj.content !== undefined) {
          promptBody = bodyObj.content; // Some APIs
        }
      } catch (e) {
        console.warn(`[Balancer] Failed to parse request body for cache lookup:`, e.message);
        return null;
      }
    } else if (req.body && typeof req.body === 'object') {
      const bodyObj = req.body;
      if (bodyObj.prompt !== undefined) {
        promptBody = bodyObj.prompt;
      } else if (bodyObj.messages !== undefined) {
        promptBody = JSON.stringify(bodyObj.messages);
      } else if (bodyObj.content !== undefined) {
        promptBody = bodyObj.content;
      }
    }

    // Normalize promptBody to string if it's an array
    if (Array.isArray(promptBody)) {
      promptBody = JSON.stringify(promptBody);
    }

    return promptBody;
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

    const { req, res, config, requestModel, matchedModel } = requestData;

    // Attach internal request ID to the request object for tracking throughout the lifecycle
    req.internalRequestId = request.internalRequestId;

    // Call the request processor directly
    const { processRequest, releaseBackend } = require('./request-processor');

    try {
      // Note: activeRequestCount is incremented in processRequest, not here
      // This ensures the count is only incremented once per request

      // Use requestModel if available (from index.js), otherwise matchedModel for legacy compatibility
      const modelForProcessing = requestModel || matchedModel;
      processRequest(this, backend, req, res, () => {
        // Request completed callback
        // Backend will decrement activeRequestCount and notify queue
      }, config, modelForProcessing);
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
   * Trigger queue processing from external caller
   * Used after cache operations to re-evaluate queued requests
   * @returns {boolean} True if a request was actually processed (selected for backend), false otherwise
   */
  triggerQueueProcessing() {
    const initialQueueLength = this.queue?.length || 0;
    let requestProcessed = false;

    // Track when a request is actually processed (not just removed from queue)
    const originalTriggerProcessing = this.triggerRequestProcessing;
    this.triggerRequestProcessing = (request, ...args) => {
      requestProcessed = true;
      return originalTriggerProcessing.call(this, request, ...args);
    };

    this.processQueueWhenBackendAvailable();

    // Restore original method
    this.triggerRequestProcessing = originalTriggerProcessing;

    return requestProcessed;
  }

  /**
   * Extract first N paragraphs from text content
   * @param {string} text - Text to extract from
   * @param {number} numParagraphs - Number of paragraphs to extract (default: 2)
   * @returns {string} Extracted paragraphs joined with separator
   */
  _extractFirstParagraphs(text, numParagraphs = 2) {
    if (!text || typeof text !== 'string') return '';

    // Split on double newlines (paragraph breaks) or long sequences of newlines
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    if (paragraphs.length === 0) return '';

    const firstN = paragraphs.slice(0, numParagraphs);
    const snippet = firstN.join('\n\n');

    // Truncate if too long
    const maxLength = 300;
    if (snippet.length <= maxLength) return snippet;

    return snippet.substring(0, maxLength).trim() + '...';
  }

  /**
   * Extract last N paragraphs from text content
   * @param {string} text - Text to extract from
   * @param {number} numParagraphs - Number of paragraphs to extract (default: 2)
   * @returns {string} Extracted paragraphs joined with separator
   */
  _extractLastParagraphs(text, numParagraphs = 2) {
    if (!text || typeof text !== 'string') return '';

    // Split on double newlines (paragraph breaks) or long sequences of newlines
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    if (paragraphs.length === 0) return '';

    const lastN = paragraphs.slice(-numParagraphs);
    return lastN.join('\n\n');
  }

  /**
   * Extract text content from a message object
   * Handles various message formats: simple text, nested content arrays, etc.
   * @param {any} msg - Message object
   * @returns {string} Extracted text content
   */
  _extractMessageText(msg) {
    if (!msg) return '';

    // Simple text case
    if (typeof msg === 'string') {
      return msg;
    }

    // Object with content property
    if (typeof msg === 'object') {
      // Direct text content
      if (typeof msg.content === 'string') {
        return msg.content;
      }

      // Array of content items (OpenAI multimodal format)
      if (Array.isArray(msg.content)) {
        return msg.content
          .map(item => {
            if (typeof item === 'object' && item.text) {
              return item.text;
            }
            if (typeof item === 'string') {
              return item;
            }
            return '';
          })
          .join(' ');
      }

      // Nested text property
      if (msg.text) {
        return msg.text;
      }

      // value property (alternative format)
      if (msg.value) {
        return msg.value;
      }
    }

    // Fallback to JSON string representation (truncated)
    return JSON.stringify(msg).substring(0, 200);
  }

  /**
   * Get a brief preview of request content for debugging
   * Shows first/last paragraphs with internal request ID
   * @param {Object} requestData - Request data containing req body
   * @param {string} internalRequestId - Internal request ID for tracking
   * @returns {Object} Object with firstPreview and lastPreview strings
   */
  _getRequestContentPreview(requestData, internalRequestId) {
    if (!requestData || !requestData.req || !requestData.req.body) {
      return { firstPreview: '', lastPreview: '' };
    }

    const body = requestData.req.body;
    let content = '';

    // Extract content from various API formats
    if (body.prompt !== undefined) {
      content = body.prompt;
    } else if (body.messages !== undefined) {
      // For chat APIs, extract text from messages
      if (Array.isArray(body.messages)) {
        content = body.messages
          .map(msg => this._extractMessageText(msg))
          .join('\n\n');
      } else if (typeof body.messages === 'object') {
        // Single message object
        content = this._extractMessageText(body.messages);
      }
    } else if (body.content !== undefined) {
      content = body.content;
    } else if (body.input !== undefined) {
      content = body.input;
    }

    // Normalize to string
    if (typeof content !== 'string') {
      content = JSON.stringify(content).substring(0, 500);
    }

    return {
      firstPreview: this._extractFirstParagraphs(content),
      lastPreview: this._extractLastParagraphs(content)
    };
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
        activeStreamingRequests: b.activeStreamingRequests || 0,
        activeNonStreamingRequests: b.activeNonStreamingRequests || 0,
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
      name: b.name || null,
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
