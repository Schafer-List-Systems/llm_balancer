/**
 * Multi-API health checker that tries multiple API formats with fallback
 * Used when backend API type is unknown or for robustness
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class MultiAPIChecker extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
    // Priority order for API detection: Ollama first, then litellm/openai
    this.apiOrder = [
      { type: 'ollama', endpoint: '/api/tags', format: 'models' },
      { type: 'litellm', endpoint: '/v1/models', format: 'data' }
    ];
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'multi' (indicates auto-detection mode)
   */
  getApiType() {
    return 'multi';
  }

  /**
   * Check backend health by trying multiple APIs in priority order
   * First successful API becomes the detected type for this backend
   * @param {Object} backend - Backend object with url property
   * @returns {Promise<Object>} Health status result with detected apiType
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [MultiAPIChecker] ${url}: Starting API detection`);

    for (const apiConfig of this.apiOrder) {
      try {
        const result = await this.checkAPI(url, apiConfig);
        if (result.healthy) {
          console.log(`[${getTimestamp()}] [MultiAPIChecker] ${url}: Detected API type: ${result.apiType}`);

          // Update backend capabilities with detected API and models
          if (!backend.capabilities) {
            backend.capabilities = {};
          }
          backend.capabilities.apiType = result.apiType;
          backend.capabilities.models = result.models || [];
          backend.capabilities.endpoints = {
            [result.apiType]: apiConfig.endpoint
          };

          return result;
        } else if (apiConfig.type === 'ollama' && this.shouldFallbackToOpenAI(result)) {
          // Ollama returned error but not connection refused - try OpenAI format
          console.log(`[${getTimestamp()}] [MultiAPIChecker] ${url}: Ollama failed, trying OpenAI fallback`);
          continue;
        }

        // API check failed and no fallback applicable
        return result;
      } catch (err) {
        console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${url}: Error checking ${apiConfig.type} API:`, err.message);
        if (apiConfig.type === 'ollama') {
          continue; // Try OpenAI on Ollama error
        }
        return { healthy: false, error: err.message, apiType: 'unknown' };
      }
    }

    // All APIs failed
    console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${url}: All API types failed`);
    return {
      healthy: false,
      error: 'All API checks failed',
      apiType: 'unknown'
    };
  }

  /**
   * Check a specific API endpoint
   * @param {string} url - Backend URL
   * @param {Object} apiConfig - API configuration with type and endpoint
   * @returns {Promise<Object>} Health result for this API
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
        console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${url} (${apiConfig.type}): Connection error:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: apiConfig.type });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${url} (${apiConfig.type}): Timeout`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: apiConfig.type });
      });

      req.end();
    });
  }

  /**
   * Parse response and extract models based on API format
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Object} apiConfig - API configuration
   * @returns {Object} Parsed result with health status and models
   */
  parseResponse(res, body, apiConfig) {
    try {
      const data = JSON.parse(body);

      // Extract models based on format key ('models' for Ollama, 'data' for OpenAI)
      const modelsKey = apiConfig.format;
      if (data[modelsKey] && Array.isArray(data[modelsKey])) {
        const models = data[modelsKey].map(m => m.name || m.id || m);
        console.log(`[${getTimestamp()}] [MultiAPIChecker] ${res.req.path}: Found ${models.length} model(s) via ${apiConfig.type}`);

        return {
          healthy: true,
          apiType: apiConfig.type,
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${res.req.path}: Unexpected response format for ${apiConfig.type}. Body keys:`, Object.keys(data));

        // If Ollama returned error message, suggest OpenAI fallback
        if (apiConfig.type === 'ollama' && data.error) {
          return {
            healthy: false,
            error: `Ollama error: ${data.error}`,
            apiType: 'ollama',
            statusCode: res.statusCode,
            shouldFallback: true
          };
        }

        return {
          healthy: false,
          error: 'Unexpected response format',
          apiType: apiConfig.type,
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [MultiAPIChecker] ${url}: Failed to parse ${apiConfig.type} response:`, e.message);
      return {
        healthy: false,
        error: `Parse error: ${e.message}`,
        apiType: apiConfig.type,
        statusCode: res.statusCode
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
   * Get health-specific metadata for detected API
   * @param {Object} backend - Backend object with capabilities
   * @returns {Object|null} Metadata or null if not healthy/unknown
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.capabilities?.apiType || backend.capabilities.apiType === 'unknown') {
      return null;
    }

    const apiType = backend.capabilities.apiType;
    const endpoint = backend.capabilities.endpoints?.[apiType] || this.getEndpointForAPI(apiType);

    return {
      apiType: apiType,
      endpoint: endpoint,
      modelCount: backend.capabilities.models?.length || 0,
      models: backend.capabilities.models || []
    };
  }

  /**
   * Get standard endpoint for an API type
   * @param {string} apiType - API type identifier
   * @returns {string} Default endpoint path
   */
  getEndpointForAPI(apiType) {
    const mapping = {
      ollama: '/api/tags',
      litellm: '/v1/models',
      openai: '/v1/models'
    };
    return mapping[apiType] || '/unknown';
  }
}

module.exports = MultiAPIChecker;
