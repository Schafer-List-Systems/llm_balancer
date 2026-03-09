/**
 * Backend capability detector
 * Discovers API type and available models for each backend on startup
 */

const http = require('http');
const { URL } = require('url');

function getTimestamp() {
  return new Date().toISOString();
}

class CapabilityDetector {
  constructor(timeout = 5000) {
    this.timeout = timeout;
    // Priority order: try OpenAI-compatible first, then Anthropic, Google, Ollama
    // OpenAI-compatible includes: OpenAI, Mistral, Groq, Cohere (grouped together)
    this.apiOrder = [
      // OpenAI-compatible APIs (Mistral, Groq, Cohere grouped here)
      { type: 'openai', endpoint: '/v1/models', formatKey: 'data', method: 'GET' },
      // Anthropic - check messages endpoint first, then chat/completions
      // Note: Anthropic endpoints require POST requests
      { type: 'anthropic', endpoint: '/v1/messages', formatKey: null, method: 'POST' },
      { type: 'anthropic', endpoint: '/v1/chat/completions', formatKey: 'data', method: 'POST' },
      // Google Gemini
      { type: 'google', endpoint: '/v1beta/models', formatKey: 'models', method: 'GET' },
      // Ollama
      { type: 'ollama', endpoint: '/api/tags', formatKey: 'models', method: 'GET' }
    ];
  }

  /**
   * Detect capabilities for a single backend URL
   * @param {string} url - Backend URL (http://host:port)
   * @returns {Promise<Object>} Capability info with apiTypes array and models by API type
   */
  async detect(url) {
    console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Starting capability detection`);

    const detectedApis = [];
    const allModels = {};
    const allEndpoints = {};

    for (const apiConfig of this.apiOrder) {
      try {
        const result = await this.checkAPI(url, apiConfig);
        if (result.healthy) {
          // Avoid duplicate API types (e.g., anthropic via /v1/messages and /v1/chat/completions)
          if (!detectedApis.includes(result.apiType)) {
            detectedApis.push(result.apiType);
            console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Detected ${result.apiType} API`);
          }
          allEndpoints[result.apiType] = apiConfig.endpoint;
          if (result.models && result.models.length > 0) {
            allModels[result.apiType] = result.models;
          }
        } else if (apiConfig.type === 'ollama' && this.shouldFallbackToOpenAI(result)) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Ollama check failed, trying OpenAI fallback`);
          continue;
        }
      } catch (err) {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url}: Error checking ${apiConfig.type} API:`, err.message);
        if (apiConfig.type === 'ollama') {
          continue; // Try OpenAI on Ollama error
        }
      }
    }

    if (detectedApis.length === 0) {
      console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url}: All API types failed`);
      return {
        apiTypes: [],
        models: {},
        endpoints: {},
        error: 'All API checks failed'
      };
    }

    return {
      apiTypes: detectedApis,
      models: allModels,
      endpoints: allEndpoints,
      detectedAt: new Date().toISOString()
    };
  }

  /**
   * Check a specific API endpoint on the backend
   * @param {string} url - Backend URL
   * @param {Object} apiConfig - API configuration
   * @returns {Promise<Object>} Health and model result
   */
  async checkAPI(url, apiConfig) {
    const parsedUrl = new URL(url);

    return new Promise((resolve) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 11434,
        path: apiConfig.endpoint,
        method: apiConfig.method || 'GET',
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          const result = this.parseResponse(res, body, apiConfig, url);
          resolve(result);
        });
        res.resume();
      });

      req.on('error', (err) => {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url} [${apiConfig.type}]: Connection error:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: apiConfig.type, models: [] });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url} [${apiConfig.type}]: Timeout`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: apiConfig.type, models: [] });
      });

      // Add POST body for Anthropic endpoints to avoid 415 errors
      if (apiConfig.method === 'POST') {
        const postBody = JSON.stringify({ model: 'test', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Content-Length', Buffer.byteLength(postBody));
        req.write(postBody);
      }

      req.end();
    });
  }

  /**
   * Parse response and extract models based on API format
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Object} apiConfig - API configuration
   * @param {string} backendUrl - Backend URL for logging context
   * @returns {Object} Parsed result with health status and models array
   */
  parseResponse(res, body, apiConfig, backendUrl) {
    try {
      const data = JSON.parse(body);

      // Handle endpoints without model lists (e.g., /v1/messages)
      const formatKey = apiConfig.formatKey;
      if (formatKey === null) {
        // For endpoints like /v1/messages, only 2xx means API is available
        // 400 = validation error (API exists but params wrong), 404 = endpoint doesn't exist
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} available`);
          return {
            healthy: true,
            apiType: apiConfig.type,
            models: [],
            statusCode: res.statusCode
          };
        }
        // 400 validation error means endpoint exists but needs proper params
        if (res.statusCode === 400 && data.error) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} available (validation error)`);
          return {
            healthy: true,
            apiType: apiConfig.type,
            models: [],
            statusCode: res.statusCode
          };
        }
        // 404 or other errors mean endpoint doesn't exist
        return {
          healthy: false,
          error: res.statusCode === 404 ? 'Endpoint not found' : 'Endpoint error',
          apiType: apiConfig.type,
          statusCode: res.statusCode,
          models: []
        };
      }

      // Extract models based on format key ('models' for Ollama, 'data' for OpenAI)
      if (data[formatKey] && Array.isArray(data[formatKey])) {
        const models = data[formatKey].map(m => {
          if (typeof m === 'string') return m;
          if (m && typeof m.name === 'string') return m.name;
          if (m && typeof m.id === 'string') return m.id;
          console.warn(`CapabilityDetector: Invalid model entry for ${apiConfig.type}:`, m);
          return null;
        }).filter(Boolean);

        console.log(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: Found ${models.length} model(s) via ${apiConfig.endpoint}`);

        return {
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          apiType: apiConfig.type,
          models: models,
          statusCode: res.statusCode
        };
      } else {
        // Check for error responses even with 200 status (proxy behavior)
        if (data.error) {
          console.warn(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} not available (error: ${data.error})`);
          return {
            healthy: false,
            error: data.error,
            apiType: apiConfig.type,
            statusCode: res.statusCode,
            models: []
          };
        }
        // For /chat/completions, 2xx means API available, 400 means endpoint exists but needs params
        // 404 means endpoint doesn't exist
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} available`);
          return {
            healthy: true,
            apiType: apiConfig.type,
            models: [],
            statusCode: res.statusCode
          };
        }
        if (res.statusCode === 400 && data.error) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} available (validation error)`);
          return {
            healthy: true,
            apiType: apiConfig.type,
            models: [],
            statusCode: res.statusCode
          };
        }
        // 404 or other errors mean endpoint doesn't exist
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: ${apiConfig.endpoint} not available (status ${res.statusCode})`);
        return {
          healthy: false,
          error: res.statusCode === 404 ? 'Endpoint not found' : 'Endpoint error',
          apiType: apiConfig.type,
          statusCode: res.statusCode,
          models: []
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [CapabilityDetector] ${backendUrl} [${apiConfig.type}]: Failed to parse response:`, e.message);
      return {
        healthy: false,
        error: `Parse error: ${e.message}`,
        apiType: apiConfig.type,
        statusCode: res.statusCode,
        models: []
      };
    }
  }

  /**
   * Determine if we should fallback from Ollama to OpenAI format
   * @param {Object} result - Previous API check result
   * @returns {boolean} True if fallback is recommended
   */
  shouldFallbackToOpenAI(result) {
    // Fallback on 404 or error response body (not connection errors)
    return result.apiType === 'ollama' &&
      (result.statusCode === 404 ||
       (result.error && !result.error.includes('Connection') &&
        !result.error.includes('refused')));
  }

  /**
   * Detect capabilities for multiple backends in parallel
   * @param {Array<string>} urls - Array of backend URLs
   * @returns {Promise<Object>} Map of URL to capability info
   */
  async detectAll(urls) {
    const results = await Promise.allSettled(
      urls.map(url => this.detect(url))
    );

    const capabilities = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        capabilities[urls[index]] = result.value;
      } else {
        capabilities[urls[index]] = {
          apiTypes: [],
          models: {},
          endpoints: {},
          error: result.reason.message
        };
      }
    });

    return capabilities;
  }
}

module.exports = CapabilityDetector;
