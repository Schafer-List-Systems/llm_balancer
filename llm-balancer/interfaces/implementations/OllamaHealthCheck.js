/**
 * Ollama API health checker implementation
 * Uses /api/tags endpoint to check health and discover models
 *
 * ★ Insight ─────────────────────────────────────────────────────
 * API-Centric Design: This health checker is specific to Ollama API,
 * not to any proxy (Ollama, LiteLLM, etc.). It checks the Ollama
 * endpoint regardless of which proxy serves it.
 *
 * Delegation Pattern: Called via backend.checkHealth() which delegates
 * to healthChecker.check(this), keeping health logic separate from
 * backend state management.
 *
 * BackendInfo Integration: Uses backend.backendInfo.endpoints.ollama
 * to get the correct endpoint path discovered at startup.
 * ──────────────────────────────────────────────────────────────────
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
    // Default Ollama endpoint - will be overridden by backendInfo.endpoints
    this.healthEndpoint = '/api/tags';
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
   * Uses backendInfo to get correct endpoint and port
   * @param {Backend} backend - Backend instance with url and backendInfo
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [OllamaHealthCheck] ${url}: Health check`);

    // ★ Insight ────────────────────────────────────────────────────
    // Use BackendInfo endpoint if available, otherwise use default
    // This ensures we query the correct endpoint discovered at startup
    // rather than assuming /api/tags for all backends
    // ──────────────────────────────────────────────────────────────
    const endpoint = backend.backendInfo?.endpoints?.ollama || this.healthEndpoint;

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      // ★ Insight ───────────────────────────────────────────────────
      // Use URL port, not hardcoded default (11434)
      // BackendInfo detects the actual port from the URL
      // This prevents querying wrong ports for backends on non-standard ports
      // ──────────────────────────────────────────────────────────────
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
   * @param {Backend} backend - Backend instance to update
   * @returns {Object} Health result with models array
   */
  handleResponse(res, body, backend) {
    try {
      const data = JSON.parse(body);

      // Ollama format: { models: [{name: "..."}, ...] }
      if (data.models && Array.isArray(data.models)) {
        const models = data.models.map(m => m.name || m);
        console.log(`[${getTimestamp()}] [OllamaHealthCheck] ${backend.url}: Healthy, found ${models.length} model(s):`, models);

        // Update backendInfo with models (composition over duplication)
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
        backend.backendInfo.apis.ollama = {
          supported: true,
          modelListEndpoint: '/api/tags',
          chatEndpoint: '/api/generate',
          models: models
        };
        backend.backendInfo.models.ollama = models;

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
   * @param {Backend} backend - Backend instance
   * @returns {Object|null} Metadata or null if not healthy
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.backendInfo?.models?.ollama) {
      return null;
    }

    return {
      apiType: 'ollama',
      endpoint: '/api/tags',
      modelCount: backend.backendInfo.models.ollama.length,
      models: backend.backendInfo.models.ollama
    };
  }
}

module.exports = OllamaHealthCheck;
