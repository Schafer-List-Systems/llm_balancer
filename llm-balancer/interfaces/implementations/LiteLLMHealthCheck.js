/**
 * LiteLLM/OpenAI API health checker implementation
 * Uses /v1/models endpoint to check health and discover models
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class LiteLLMHealthCheck extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'litellm' or 'openai' (compatible formats)
   */
  getApiType() {
    return 'litellm';
  }

  /**
   * Check LiteLLM/OpenAI backend health via /v1/models endpoint
   * @param {Object} backend - Backend object with url property
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    const parsedUrl = new URL(url);

    return new Promise((resolve) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 11434,
        path: '/v1/models',
        method: 'GET',
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          const result = this.handleResponse(res, body, backend);
          resolve(result);
        });
        res.resume();
      });

      req.on('error', (err) => {
        console.warn(`[${getTimestamp()}] [LiteLLMHealthCheck] Error checking ${url}:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: 'litellm' });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [LiteLLMHealthCheck] Timeout checking ${url}`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: 'litellm' });
      });

      req.end();
    });
  }

  /**
   * Handle HTTP response and extract health status + models
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Object} backend - Backend object to update
   * @returns {Object} Health result with models array
   */
  handleResponse(res, body, backend) {
    try {
      const data = JSON.parse(body);

      // LiteLLM/OpenAI format: { data: [{id: "...", ...}, ...] }
      if (data.data && Array.isArray(data.data)) {
        const models = data.data.map(m => m.id || m);
        console.log(`[${getTimestamp()}] [LiteLLMHealthCheck] ${backend.url}: Healthy, found ${models.length} model(s):`, models);

        // Update backend capabilities
        if (!backend.capabilities) {
          backend.capabilities = {};
        }
        backend.capabilities.models = models;

        return {
          healthy: true,
          apiType: 'litellm',
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [LiteLLMHealthCheck] ${backend.url}: Unexpected LiteLLM response format. Body:`, body);
        return {
          healthy: false,
          error: 'Unexpected response format',
          apiType: 'litellm',
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [LiteLLMHealthCheck] ${backend.url}: Failed to parse LiteLLM response:`, e.message);
      return {
        healthy: false,
        error: e.message,
        apiType: 'litellm',
        statusCode: res.statusCode
      };
    }
  }

  /**
   * Get health-specific metadata for LiteLLM backends
   * @param {Object} backend - Backend object
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.capabilities?.models) {
      return null;
    }

    return {
      apiType: 'litellm',
      endpoint: '/v1/models',
      modelCount: backend.capabilities.models.length,
      models: backend.capabilities.models
    };
  }
}

module.exports = LiteLLMHealthCheck;
