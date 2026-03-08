/**
 * Ollama API health checker implementation
 * Uses /api/tags endpoint to check health and discover models
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class OllamaHealthCheck extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'ollama'
   */
  getApiType() {
    return 'ollama';
  }

  /**
   * Check Ollama backend health via /api/tags endpoint
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
        path: '/api/tags',
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
        console.warn(`[${getTimestamp()}] [OllamaHealthCheck] Error checking ${url}:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: 'ollama' });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [OllamaHealthCheck] Timeout checking ${url}`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: 'ollama' });
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

      // Ollama format: { models: [{name: "..."}, ...] }
      if (data.models && Array.isArray(data.models)) {
        const models = data.models.map(m => m.name || m);
        console.log(`[${getTimestamp()}] [OllamaHealthCheck] ${backend.url}: Healthy, found ${models.length} model(s):`, models);

        // Update backend capabilities
        if (!backend.capabilities) {
          backend.capabilities = {};
        }
        backend.capabilities.models = models;

        return {
          healthy: true,
          apiType: 'ollama',
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [OllamaHealthCheck] ${backend.url}: Unexpected Ollama response format. Body:`, body);
        return {
          healthy: false,
          error: 'Unexpected response format',
          apiType: 'ollama',
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [OllamaHealthCheck] ${backend.url}: Failed to parse Ollama response:`, e.message);
      return {
        healthy: false,
        error: e.message,
        apiType: 'ollama',
        statusCode: res.statusCode
      };
    }
  }

  /**
   * Get health-specific metadata for Ollama backends
   * @param {Object} backend - Backend object
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.capabilities?.models) {
      return null;
    }

    return {
      apiType: 'ollama',
      endpoint: '/api/tags',
      modelCount: backend.capabilities.models.length,
      models: backend.capabilities.models
    };
  }
}

module.exports = OllamaHealthCheck;
