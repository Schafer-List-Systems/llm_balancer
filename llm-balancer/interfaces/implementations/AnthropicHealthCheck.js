/**
 * Anthropic API health checker implementation
 * Uses /v1/messages endpoint to check health
 *
 * ★ Insight ─────────────────────────────────────────────────────
 * POST-based Health Check: Unlike Ollama and OpenAI which use
 * GET /v1/models or /api/tags, Anthropic uses POST /v1/messages.
 * This endpoint exists even if the request is invalid (400 response).
 *
 * Health Check Semantics: A 200 or 400 response indicates the API
 * is supported. A 404 indicates the endpoint doesn't exist.
 * ──────────────────────────────────────────────────────────────────
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class AnthropicHealthCheck extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
    this.healthEndpoint = '/v1/messages';
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'anthropic'
   */
  getApiType() {
    return 'anthropic';
  }

  /**
   * Check Anthropic backend health via /v1/messages endpoint
   * Uses backendInfo to get correct endpoint and port
   * @param {Backend} backend - Backend instance with url and backendInfo
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [AnthropicHealthCheck] ${url}: Health check`);

    const endpoint = backend.backendInfo?.endpoints?.anthropic || this.healthEndpoint;

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: endpoint,
      method: 'POST',
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
        console.warn(`[${getTimestamp()}] [AnthropicHealthCheck] Error checking ${url}:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: 'anthropic' });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [AnthropicHealthCheck] Timeout checking ${url}`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: 'anthropic' });
      });

      // POST body for Anthropic health check
      const postBody = JSON.stringify({
        model: 'test',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      });
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(postBody));
      req.write(postBody);

      req.end();
    });
  }

  /**
   * Handle HTTP response and extract health status
   * @param {Object} res - HTTP response object
   * @param {string} body - Response body as string
   * @param {Backend} backend - Backend instance to update
   * @returns {Object} Health result
   */
  handleResponse(res, body, backend) {
    try {
      const data = JSON.parse(body);

      // Anthropic: 200 or 400 means API exists
      // 404 means API doesn't exist
      if (res.statusCode === 200 || res.statusCode === 400) {
        console.log(`[${getTimestamp()}] [AnthropicHealthCheck] ${backend.url}: Healthy (status ${res.statusCode})`);

        // Update backendInfo
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
        backend.backendInfo.apis.anthropic = {
          supported: true,
          modelListEndpoint: null,
          chatEndpoint: '/v1/messages',
          models: []
        };
        backend.backendInfo.models.anthropic = [];

        return {
          healthy: true,
          apiType: 'anthropic',
          models: [],
          statusCode: res.statusCode
        };
      } else if (res.statusCode === 404) {
        console.warn(`[${getTimestamp()}] [AnthropicHealthCheck] ${backend.url}: API not supported (404)`);
        return {
          healthy: false,
          error: 'API not supported (404)',
          apiType: 'anthropic',
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [AnthropicHealthCheck] ${backend.url}: Unexpected status ${res.statusCode}`);
        return {
          healthy: false,
          error: `Unexpected status: ${res.statusCode}`,
          apiType: 'anthropic',
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [AnthropicHealthCheck] ${backend.url}: Failed to parse response:`, e.message);
      return {
        healthy: false,
        error: e.message,
        apiType: 'anthropic',
        statusCode: res.statusCode
      };
    }
  }

  /**
   * Get health-specific metadata for Anthropic backends
   * @param {Backend} backend - Backend instance
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.backendInfo?.apis?.anthropic?.supported) {
      return null;
    }

    return {
      apiType: 'anthropic',
      endpoint: '/v1/messages',
      modelCount: 0,
      models: []
    };
  }
}

module.exports = AnthropicHealthCheck;
