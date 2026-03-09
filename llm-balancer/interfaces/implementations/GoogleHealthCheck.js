/**
 * Google API health checker implementation
 * Uses /v1beta/models endpoint to check health and discover models
 *
 * ★ Insight ─────────────────────────────────────────────────────
 * Google Vertex AI Format: Google uses /v1beta/models endpoint with
 * a 'models' array (not 'data' like OpenAI). Each model has 'name'
 * field instead of 'id'.
 *
 * API-Centric Design: This handles Google Vertex AI API specifically,
 * not any proxy. It queries the Google endpoint regardless of which
 * proxy serves it.
 * ──────────────────────────────────────────────────────────────────
 */

const http = require('http');
const { URL } = require('url');
const IHealthCheck = require('../IHealthCheck');

function getTimestamp() {
  return new Date().toISOString();
}

class GoogleHealthCheck extends IHealthCheck {
  constructor(timeout = 5000) {
    super();
    this.timeout = timeout;
    this.healthEndpoint = '/v1beta/models';
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'google'
   */
  getApiType() {
    return 'google';
  }

  /**
   * Check Google backend health via /v1beta/models endpoint
   * Uses backendInfo to get correct endpoint and port
   * @param {Backend} backend - Backend instance with url and backendInfo
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [GoogleHealthCheck] ${url}: Health check`);

    const endpoint = backend.backendInfo?.endpoints?.google || this.healthEndpoint;

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
        console.warn(`[${getTimestamp()}] [GoogleHealthCheck] Error checking ${url}:`, err.message);
        resolve({ healthy: false, error: err.message, apiType: 'google' });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [GoogleHealthCheck] Timeout checking ${url}`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout', apiType: 'google' });
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

      // Google format: { models: [{name: "...", ...}, ...] }
      if (data.models && Array.isArray(data.models)) {
        const models = data.models.map(m => m.name || m);
        console.log(`[${getTimestamp()}] [GoogleHealthCheck] ${backend.url}: Healthy, found ${models.length} model(s):`, models);

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
        backend.backendInfo.apis.google = {
          supported: true,
          modelListEndpoint: '/v1beta/models',
          chatEndpoint: '/v1beta/models/{model}:generateContent',
          models: models
        };
        backend.backendInfo.models.google = models;

        return {
          healthy: true,
          apiType: 'google',
          models: models,
          statusCode: res.statusCode
        };
      } else {
        console.warn(`[${getTimestamp()}] [GoogleHealthCheck] ${backend.url}: Unexpected Google response format. Body:`, body);
        return {
          healthy: false,
          error: 'Unexpected response format',
          apiType: 'google',
          statusCode: res.statusCode
        };
      }
    } catch (e) {
      console.warn(`[${getTimestamp()}] [GoogleHealthCheck] ${backend.url}: Failed to parse Google response:`, e.message);
      return {
        healthy: false,
        error: e.message,
        apiType: 'google',
        statusCode: res.statusCode
      };
    }
  }

  /**
   * Get health-specific metadata for Google backends
   * @param {Backend} backend - Backend instance
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.backendInfo?.models?.google) {
      return null;
    }

    return {
      apiType: 'google',
      endpoint: '/v1beta/models',
      modelCount: backend.backendInfo.models.google.length,
      models: backend.backendInfo.models.google
    };
  }
}

module.exports = GoogleHealthCheck;
