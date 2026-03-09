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
            // Non-JSON response, treat as text
            responseBody = { raw: body };
          }

          // Determine success based on status code
          // 2xx = endpoint exists and works
          // 400 = endpoint exists but request params wrong (API supported)
          // 404 = endpoint doesn't exist (API not supported)
          // For POST requests, 404 could also mean "model not found" - we need to handle this
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

        // For POST probes, 2xx or 400 means API is supported
        const isSupported = res.statusCode >= 200 && res.statusCode < 300 || res.statusCode === 400;

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
          if (probe.hasModels) {
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
}

module.exports = BackendInfo;