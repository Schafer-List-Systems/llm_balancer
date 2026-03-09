/**
 * OpenAI-compatible API health checker implementation
 * Uses /v1/models endpoint to check health and discover models
 *
 * ★ Insight ─────────────────────────────────────────────────────
 * API-Centric Design: This handles OpenAI-compatible APIs (OpenAI,
 * Groq, LiteLLM with OpenAI mode, etc.). It's not tied to any
 * specific proxy - only the API contract matters.
 *
 * Primary API Selection: When a backend supports multiple APIs,
 * we choose the first supported API as primary. For OpenAI APIs,
 * this health checker is assigned and uses /v1/models.
 *
 * BackendInfo Integration: Uses backend.backendInfo.endpoints.openai
 * to get the correct endpoint path discovered at startup.
 * ──────────────────────────────────────────────────────────────────
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class OpenAIHealthCheck extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
    // Default OpenAI-compatible endpoint - will be overridden by backendInfo.endpoints
    this.healthEndpoint = '/v1/models';
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'openai' (covers OpenAI-compatible APIs)
   */
  getApiType() {
    return 'openai';
  }

  /**
   * Check OpenAI-compatible backend health via /v1/models endpoint
   * Uses backendInfo to get correct endpoint and port
   * @param {Backend} backend - Backend instance with url and backendInfo
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [OpenAIHealthCheck] ${url}: Health check`);

    // Use BackendInfo endpoint if available, otherwise use default
    const endpoint = backend.backendInfo?.endpoints?.openai || this.healthEndpoint;

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: endpoint,
      method: 'GET',
      timeout: this.timeout
    };

    return new Promise((resolve) => {
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
        console.warn(`[${getTimestamp()}] [OpenAIHealthCheck] Error checking ${url}:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: 'openai' });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [OpenAIHealthCheck] Timeout checking ${url}`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: 'openai' });
      });

      req.end();
    });
  }

  /**
   * Handle HTTP response and extract health status + models
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Backend} backend - Backend instance to update
   * @returns {Object} Health result with models array
   */
  handleResponse(res, body, backend) {
    try {
      const data = JSON.parse(body);

      // OpenAI format: { data: [{id: "...", ...}, ...] }
      if (data.data && Array.isArray(data.data)) {
        const models = data.data.map(m => m.id || m);
        console.log(`[${getTimestamp()}] [OpenAIHealthCheck] ${backend.url}: Healthy, found ${models.length} model(s):`, models);

        // Update backendInfo with models
        if (!backend.backendInfo) {
          backend.backendInfo = {
            url: backend.url,
            healthy: true,
            apis: {},
            models: {},
            endpoints: {},
            detectedAt: new Date().toISOString()
          };
        }

        backend.backendInfo.healthy = true;
        backend.backendInfo.apis.openai = {
          supported: true,
          modelListEndpoint: '/v1/models',
          chatEndpoint: '/v1/chat/completions',
          models: models
        };
        backend.backendInfo.models.openai = models;

        return {
          healthy: true,
          apiType: 'openai',
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [OpenAIHealthCheck] ${backend.url}: Unexpected OpenAI response format. Body:`, body);
        return {
          healthy: false,
          error: 'Unexpected response format',
          apiType: 'openai',
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [OpenAIHealthCheck] ${backend.url}: Failed to parse OpenAI response:`, e.message);
      return {
        healthy: false,
        error: e.message,
        apiType: 'openai',
        statusCode: res.statusCode
      };
    }
  }

  /**
   * Get health-specific metadata for OpenAI backends
   * @param {Backend} backend - Backend instance
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.backendInfo?.models?.openai) {
      return null;
    }

    return {
      apiType: 'openai',
      endpoint: '/v1/models',
      modelCount: backend.backendInfo.models.openai.length,
      models: backend.backendInfo.models.openai
    };
  }
}

module.exports = OpenAIHealthCheck;
