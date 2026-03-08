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
    // Priority order: try Ollama first, then litellm/openai
    this.apiOrder = [
      { type: 'ollama', endpoint: '/api/tags', formatKey: 'models' },
      { type: 'litellm', endpoint: '/v1/models', formatKey: 'data' }
    ];
  }

  /**
   * Detect capabilities for a single backend URL
   * @param {string} url - Backend URL (http://host:port)
   * @returns {Promise<Object>} Capability info with apiType and models
   */
  async detect(url) {
    console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Starting capability detection`);

    for (const apiConfig of this.apiOrder) {
      try {
        const result = await this.checkAPI(url, apiConfig);
        if (result.healthy && result.models.length > 0) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Detected API type: ${result.apiType}, models:`, result.models);
          return {
            apiType: result.apiType,
            models: result.models,
            endpoints: {
              [result.apiType]: apiConfig.endpoint
            },
            detectedAt: new Date().toISOString()
          };
        } else if (apiConfig.type === 'ollama' && this.shouldFallbackToOpenAI(result)) {
          console.log(`[${getTimestamp()}] [CapabilityDetector] ${url}: Ollama check failed, trying OpenAI fallback`);
          continue;
        }

        // API check failed and no fallback applicable
        return {
          apiType: 'unknown',
          models: [],
          error: result.error || 'API check failed'
        };
      } catch (err) {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url}: Error checking ${apiConfig.type} API:`, err.message);
        if (apiConfig.type === 'ollama') {
          continue; // Try OpenAI on Ollama error
        }
        return {
          apiType: 'unknown',
          models: [],
          error: err.message
        };
      }
    }

    console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url}: All API types failed`);
    return {
      apiType: 'unknown',
      models: [],
      error: 'All API checks failed'
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
        method: 'GET',
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          const result = this.parseResponse(res, body, apiConfig);
          resolve(result);
        });
        res.resume();
      });

      req.on('error', (err) => {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url} (${apiConfig.type}): Connection error:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: apiConfig.type, models: [] });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${url} (${apiConfig.type}): Timeout`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: apiConfig.type, models: [] });
      });

      req.end();
    });
  }

  /**
   * Parse response and extract models based on API format
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Object} apiConfig - API configuration
   * @returns {Object} Parsed result with health status and models array
   */
  parseResponse(res, body, apiConfig) {
    try {
      const data = JSON.parse(body);

      // Extract models based on format key ('models' for Ollama, 'data' for OpenAI)
      const formatKey = apiConfig.formatKey;
      if (data[formatKey] && Array.isArray(data[formatKey])) {
        const models = data[formatKey].map(m => {
          if (typeof m === 'string') return m;
          if (m && typeof m.name === 'string') return m.name;
          if (m && typeof m.id === 'string') return m.id;
          console.warn(`CapabilityDetector: Invalid model entry for ${apiConfig.type}:`, m);
          return null;
        }).filter(Boolean);

        console.log(`[${getTimestamp()}] [CapabilityDetector] ${res.req.path}: Found ${models.length} model(s) via ${apiConfig.type}`);

        return {
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          apiType: apiConfig.type,
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [CapabilityDetector] ${res.req.path}: Unexpected response format for ${apiConfig.type}. Body keys:`, Object.keys(data));

        // If Ollama returned error message, suggest OpenAI fallback
        if (apiConfig.type === 'ollama' && data.error) {
          return {
            healthy: false,
            error: `Ollama error: ${data.error}`,
            apiType: 'ollama',
            statusCode: res.statusCode,
            shouldFallback: true,
            models: []
          };
        }

        return {
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          error: 'Unexpected response format',
          apiType: apiConfig.type,
          statusCode: res.statusCode,
          models: []
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [CapabilityDetector] ${res.req.path}: Failed to parse ${apiConfig.type} response:`, e.message);
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
          apiType: 'unknown',
          models: [],
          error: result.reason.message
        };
      }
    });

    return capabilities;
  }
}

module.exports = CapabilityDetector;
