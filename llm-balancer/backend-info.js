/**
 * BackendInfo - Comprehensive backend information collector
 * Discovers API types, model lists, and endpoints for each backend
 * Future extensions: prompt processing speed, token generation speed, network bandwidth
 */

const http = require('http');
const { URL } = require('url');

function getTimestamp() {
  return new Date().toISOString();
}

class BackendInfo {
  constructor(timeout = 5000) {
    this.timeout = timeout;

    // Probe definitions for API detection
    // Each probe defines how to test an endpoint and extract model information
    this.probes = [
      // Model list probes (GET requests that return model arrays)
      {
        apiType: 'openai',
        endpoint: '/v1/models',
        method: 'GET',
        jsonPath: 'data',
        hasModels: true
      },
      {
        apiType: 'google',
        endpoint: '/v1beta/models',
        method: 'GET',
        jsonPath: 'models',
        hasModels: true
      },
      {
        apiType: 'ollama',
        endpoint: '/api/tags',
        method: 'GET',
        jsonPath: 'models',
        hasModels: true
      },
      {
        apiType: 'groq',
        endpoint: '/openai/v1/models',
        method: 'GET',
        jsonPath: 'data',
        hasModels: true
      },

      // Chat/message probes (POST requests, no model list)
      {
        apiType: 'anthropic',
        endpoint: '/v1/messages',
        method: 'POST',
        jsonPath: null,
        hasModels: false
      },
      {
        apiType: 'openai',
        endpoint: '/v1/chat/completions',
        method: 'POST',
        jsonPath: null,
        hasModels: false
      }
    ];

    // Store discovered models for use in POST probes
    this.discoveredModels = {};

    // Performance statistics tracking - stores per-request rates, then averages them
    this.stats = {
      requestCount: 0,
      nonStreamingRates: [],      // Array of tokens/second per request
      streamingPromptRates: [],   // Array of prompt tokens/sec per request
      streamingGenerationRates: [] // Array of completion tokens/sec per request
    };
  }

  /**
   * Get chat endpoint for a given API type
   * @param {string} apiType - API type identifier
   * @returns {string} Chat endpoint path
   */
  getChatEndpoint(apiType) {
    const chatEndpoints = {
      openai: '/v1/chat/completions',
      anthropic: '/v1/messages',
      google: '/v1beta/models/{model}:generateContent',
      ollama: '/api/generate',
      groq: '/openai/v1/chat/completions'
    };
    return chatEndpoints[apiType] || null;
  }

  /**
   * Extract model names from response body using JSON path
   * @param {Object} body - Parsed JSON response body
   * @param {string} jsonPath - JSON path key (e.g., 'data', 'models')
   * @returns {string[]} Array of model names
   */
  extractModels(body, jsonPath) {
    if (!jsonPath || !body[jsonPath]) {
      return [];
    }

    const modelsArray = body[jsonPath];
    if (!Array.isArray(modelsArray)) {
      return [];
    }

    return modelsArray
      .map(m => {
        // Handle different model object formats
        if (typeof m === 'string') return m;
        if (m && typeof m.name === 'string') return m.name;
        if (m && typeof m.id === 'string') return m.id;
        console.warn(`BackendInfo: Invalid model entry for ${jsonPath}:`, m);
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Validate response body to distinguish between valid data and error messages
   * @param {Object} body - Parsed JSON response body
   * @param {Object} probe - Probe configuration
   * @param {number} statusCode - HTTP status code
   * @returns {{valid: boolean, reason: string}} Validation result
   */
  validateResponse(body, probe, statusCode) {
    // 500 status code always indicates failure
    if (statusCode === 500) {
      return { valid: false, reason: 'Server error (500)' };
    }

    // For GET model list probes, check for error patterns in body
    if (probe.hasModels) {
      // Check for error response patterns
      if (body.error || body.detail || body.type === 'error') {
        const errorMsg = body.error?.message || body.detail || body.error || 'Error response';
        return { valid: false, reason: `Error response: ${errorMsg}` };
      }

      // For model list endpoints, verify we have actual model data
      if (probe.jsonPath && body[probe.jsonPath]) {
        const modelsArray = body[probe.jsonPath];
        if (!Array.isArray(modelsArray)) {
          return { valid: false, reason: `Invalid format: ${probe.jsonPath} is not an array` };
        }
        if (modelsArray.length === 0) {
          return { valid: false, reason: `${probe.jsonPath} array is empty` };
        }
        // Verify at least one model entry has id or name
        const hasValidModel = modelsArray.some(m => m && (m.id || m.name));
        if (!hasValidModel) {
          return { valid: false, reason: `${probe.jsonPath} array has no valid model entries` };
        }
      }
    }

    // For POST chat probes, 200 or 400 with valid response is success
    if (!probe.hasModels) {
      if (statusCode === 200) {
        // Verify response looks like a valid chat response, not an error
        if (body.error || body.detail || body.type === 'error') {
          return { valid: false, reason: 'Error response in 200 status' };
        }
        // Check for valid chat response indicators
        if (body.id || body.choices || body.content || body.type === 'message') {
          return { valid: true, reason: 'Valid chat response' };
        }
      }
      if (statusCode === 400) {
        return { valid: true, reason: 'Validation error (endpoint exists)' };
      }
    }

    return { valid: true, reason: 'Status code OK' };
  }

  /**
   * Execute a single probe request
   * @param {string} url - Backend URL
   * @param {Object} probe - Probe configuration
   * @returns {Promise<Object>} Probe result with success status and data
   */
  probe(url, probe) {
    const parsedUrl = new URL(url);

    return new Promise((resolve) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: probe.endpoint,
        method: probe.method,
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          let responseBody = null;
          try {
            responseBody = JSON.parse(body);
          } catch (e) {
            // Non-JSON response, treat as text
            responseBody = { raw: body };
          }

          // Validate response body for GET model list probes
          if (probe.hasModels) {
            const validation = this.validateResponse(responseBody, probe, res.statusCode);
            if (!validation.valid) {
              console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: ${validation.reason} - API not supported`);
              resolve({
                success: false,
                statusCode: res.statusCode,
                body: responseBody,
                apiType: probe.apiType,
                validation: validation
              });
              return;
            }
          }

          // Determine success based on status code
          // 2xx = endpoint exists and works
          // 400 = endpoint exists but request params wrong (API supported)
          // 404 = endpoint doesn't exist (API not supported)
          // 500 = server error (API not supported)
          let isSupported = res.statusCode >= 200 && res.statusCode < 300 || res.statusCode === 400;

          // If 404 on POST, try with a real model from discovered models
          if (res.statusCode === 404 && probe.method === 'POST') {
            const models = this.discoveredModels[url] || [];
            if (models.length > 0) {
              console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: 404 on POST, retrying with real model: ${models[0]}`);
              this.probeWithModel(url, probe, models[0], (retryResult) => {
                resolve(retryResult);
              });
              return;
            }
          }

          resolve({
            success: isSupported,
            statusCode: res.statusCode,
            body: responseBody,
            apiType: probe.apiType
          });
        });
        res.resume();
      });

      req.on('error', (err) => {
        console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: Connection error:`, err.message);
        resolve({
          success: false,
          error: err.message,
          apiType: probe.apiType
        });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: Timeout`);
        req.destroy();
        resolve({
          success: false,
          error: 'Timeout',
          apiType: probe.apiType
        });
      });

      // Add POST body for POST requests
      if (probe.method === 'POST') {
        const postBody = JSON.stringify({
          model: 'test',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Content-Length', Buffer.byteLength(postBody));
        req.write(postBody);
      }

      req.end();
    });
  }

  /**
   * Retry POST probe with a real model name
   * @param {string} url - Backend URL
   * @param {Object} probe - Probe configuration
   * @param {string} model - Real model name to use
   * @param {Function} callback - Callback with result
   */
  probeWithModel(url, probe, model, callback) {
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 11434,
      path: probe.endpoint,
      method: probe.method,
      timeout: this.timeout
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk.toString(); });
      res.on('end', () => {
        let responseBody = null;
        try {
          responseBody = JSON.parse(body);
        } catch (e) {
          responseBody = { raw: body };
        }

        // Validate POST response
        const validation = this.validateResponse(responseBody, probe, res.statusCode);
        const isSupported = validation.valid;

        if (!validation.valid) {
          console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: ${validation.reason} - API not supported`);
        }

        callback({
          success: isSupported,
          statusCode: res.statusCode,
          body: responseBody,
          apiType: probe.apiType
        });
      });
      res.resume();
    });

    req.on('error', (err) => {
      console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: Retry connection error:`, err.message);
      callback({
        success: false,
        error: err.message,
        apiType: probe.apiType
      });
    });

    req.on('timeout', () => {
      console.warn(`[${getTimestamp()}] [BackendInfo] ${url} [${probe.apiType}]: Retry timeout`);
      req.destroy();
      callback({
        success: false,
        error: 'Timeout',
        apiType: probe.apiType
      });
    });

    // Add POST body with real model
    const postBody = JSON.stringify({
      model: model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Content-Length', Buffer.byteLength(postBody));
    req.write(postBody);

    req.end();
  }

  /**
   * Collect comprehensive information about a single backend
   * @param {string} url - Backend URL
   * @returns {Promise<Object>} Backend information object
   */
  async getInfo(url) {
    console.log(`[${getTimestamp()}] [BackendInfo] ${url}: Starting backend information collection`);

    const info = {
      url: url,
      healthy: false,
      apis: {},
      models: {},
      endpoints: {},
      detectedAt: null,
      // Future fields for performance metrics:
      // latency: null,
      // bandwidth: null,
      // promptSpeed: null,
      // generationSpeed: null
    };

    // Probe all API endpoints
    for (const probe of this.probes) {
      try {
        const result = await this.probe(url, probe);

        if (result.success) {
          // Track supported API
          if (!info.apis[probe.apiType]) {
            info.apis[probe.apiType] = {
              supported: true,
              modelListEndpoint: probe.hasModels ? probe.endpoint : null,
              chatEndpoint: this.getChatEndpoint(probe.apiType),
              models: []
            };
            console.log(`[${getTimestamp()}] [BackendInfo] ${url}: Detected ${probe.apiType} API`);
          }

          // Track model list endpoint only (for health checks)
          // Chat endpoints are stored separately in info.apis[apiType].chatEndpoint
          if (probe.hasModels && result.success) {
            info.endpoints[probe.apiType] = probe.endpoint;
          }

          // Extract models if this probe provides model list
          if (probe.hasModels && result.body) {
            const models = this.extractModels(result.body, probe.jsonPath);
            info.apis[probe.apiType].models = models;
            info.models[probe.apiType] = models;
            // Store discovered models for use in POST probes
            this.discoveredModels[url] = models;
            console.log(`[${getTimestamp()}] [BackendInfo] ${url}: Found ${models.length} model(s) via ${probe.endpoint}`);
          }
        }
      } catch (err) {
        console.warn(`[${getTimestamp()}] [BackendInfo] ${url}: Error probing ${probe.apiType}:`, err.message);
      }
    }

    // Backend is healthy if at least one API is supported
    info.healthy = Object.keys(info.apis).length > 0;
    info.detectedAt = new Date().toISOString();

    if (!info.healthy) {
      console.warn(`[${getTimestamp()}] [BackendInfo] ${url}: No APIs detected`);
      info.error = 'No APIs detected';
    }

    console.debug(`[${getTimestamp()}] [DEBUG] ${url}: info: ${info}`);
    return info;
  }

  /**
   * Collect information about multiple backends in parallel
   * @param {Array<string>} urls - Array of backend URLs
   * @returns {Promise<Object>} Map of URL to backend information
   */
  async getInfoAll(urls) {
    const results = await Promise.allSettled(
      urls.map(url => this.getInfo(url))
    );

    const backendInfo = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        backendInfo[urls[index]] = result.value;
      } else {
        backendInfo[urls[index]] = {
          url: urls[index],
          healthy: false,
          apis: {},
          models: {},
          endpoints: {},
          error: result.reason.message
        };
      }
    });

    return backendInfo;
  }

  /**
   * Compute arithmetic mean of an array of numbers
   * @param {number[]} arr - Array of rates
   * @returns {number} Average value or 0 if empty
   */
  _computeAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }

  /**
   * Update non-streaming performance statistics
   * Calculates tokens/second for this request and stores the rate
   * @param {number} promptTokens - Number of prompt tokens used
   * @param {number} completionTokens - Number of completion tokens generated
   * @param {number} responseTimeMs - Total response time in milliseconds
   * @returns {number} Per-request tokens/second rate
   */
  updateNonStreamingStats(promptTokens, completionTokens, responseTimeMs) {
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);

    // Calculate tokens per second for this request
    const responseTimeSeconds = responseTimeMs / 1000;
    const rate = totalTokens / responseTimeSeconds;

    // Store the per-request rate
    this.stats.nonStreamingRates.push(rate);
    this.stats.requestCount++;

    return rate;
  }

  /**
   * Update streaming performance statistics
   * Calculates prompt processing rate and generation rate separately
   * @param {number} promptTokens - Number of prompt tokens used
   * @param {number} completionTokens - Number of completion tokens generated
   * @param {number} firstChunkTimeMs - Time to receive first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Total time until response completed in milliseconds
   * @returns {{promptRate: number, generationRate: number}} Per-request rates
   */
  updateStreamingStats(promptTokens, completionTokens, firstChunkTimeMs, totalCompletionTimeMs) {
    promptTokens = promptTokens || 0;
    completionTokens = completionTokens || 0;
    firstChunkTimeMs = firstChunkTimeMs || 0;
    totalCompletionTimeMs = totalCompletionTimeMs || 0;

    // Calculate prompt processing rate (tokens/second to first chunk)
    const promptProcessingSeconds = firstChunkTimeMs / 1000;
    const promptRate = promptTokens / promptProcessingSeconds;

    // Calculate generation rate (completion tokens/second during streaming)
    const generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs;
    const generationSeconds = generationTimeMs / 1000;
    const generationRate = completionTokens / generationSeconds;

    // Store the per-request rates
    this.stats.streamingPromptRates.push(promptRate);
    this.stats.streamingGenerationRates.push(generationRate);
    this.stats.requestCount++;

    return { promptRate, generationRate };
  }

  /**
   * Get current performance statistics with computed averages
   * @returns {{requestCount: number, nonStreamingStats: {count: number, avgTokensPerSecond: number}, streamingStats: {promptProcessingRate: {count: number, avgTokensPerSecond: number}, generationRate: {count: number, avgTokensPerSecond: number}}}} Statistics object
   */
  getStats() {
    return {
      requestCount: this.stats.requestCount,
      nonStreamingStats: {
        count: this.stats.nonStreamingRates.length,
        avgTokensPerSecond: this._computeAverage(this.stats.nonStreamingRates)
      },
      streamingStats: {
        promptProcessingRate: {
          count: this.stats.streamingPromptRates.length,
          avgTokensPerSecond: this._computeAverage(this.stats.streamingPromptRates)
        },
        generationRate: {
          count: this.stats.streamingGenerationRates.length,
          avgTokensPerSecond: this._computeAverage(this.stats.streamingGenerationRates)
        }
      }
    };
  }
}

module.exports = BackendInfo;
