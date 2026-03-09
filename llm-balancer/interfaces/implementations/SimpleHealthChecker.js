/**
 * Simple health checker that only checks if a backend is reachable
 * Does NOT perform API detection - that's done once at startup by CapabilityDetector
 * Used during periodic health checks to avoid unnecessary backend load
 */

const http = require('http');
const { URL } = require('url');

function getTimestamp() {
  return new Date().toISOString();
}

class SimpleHealthChecker {
  constructor(timeout = 5000) {
    this.timeout = timeout;
    // Use OpenAI-compatible endpoint as the primary health check
    // Most backends support this and it's fast
    this.healthEndpoint = '/v1/models';
  }

  /**
   * Get the API type this interface handles
   * @returns {string} 'simple' (indicates simple health check mode)
   */
  getApiType() {
    return 'simple';
  }

  /**
   * Check backend health with a simple GET request
   * Does NOT detect APIs - assumes capabilities were already detected at startup
   * @param {Object} backend - Backend object with url property (capabilities should already be set)
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    const url = backend.url;
    console.log(`[${getTimestamp()}] [SimpleHealthChecker] ${url}: Health check`);

    // If capabilities were already detected at startup, use cached endpoint
    const endpoint = backend.capabilities?.endpoints?.openai || this.healthEndpoint;

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 11434,
      path: endpoint,
      method: 'GET',
      timeout: this.timeout
    };

    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            // 2xx status and no error in body means healthy
            if (res.statusCode >= 200 && res.statusCode < 300 && !data.error) {
              console.log(`[${getTimestamp()}] [SimpleHealthChecker] ${url}: Healthy (status ${res.statusCode})`);
              resolve({
                healthy: true,
                statusCode: res.statusCode
              });
            } else {
              console.warn(`[${getTimestamp()}] [SimpleHealthChecker] ${url}: Unhealthy (status ${res.statusCode})`);
              resolve({
                healthy: false,
                error: data.error || `Unexpected status: ${res.statusCode}`,
                statusCode: res.statusCode
              });
            }
          } catch (e) {
            // Non-JSON response - still consider healthy if 2xx
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ healthy: true, statusCode: res.statusCode });
            } else {
              resolve({ healthy: false, error: 'Invalid response', statusCode: res.statusCode });
            }
          }
        });
        res.resume();
      });

      req.on('error', (err) => {
        console.warn(`[${getTimestamp()}] [SimpleHealthChecker] ${url}: Connection error:`, err.message);
        resolve({ healthy: false, error: err.message });
      });

      req.on('timeout', () => {
        console.warn(`[${getTimestamp()}] [SimpleHealthChecker] ${url}: Timeout`);
        req.destroy();
        resolve({ healthy: false, error: 'Timeout' });
      });

      req.end();
    });
  }

  /**
   * Get health-specific metadata for detected API
   * Returns cached capabilities from startup detection
   * @param {Object} backend - Backend object with capabilities
   * @returns {Object|null} Metadata or null if not healthy/unknown
   */
  getHealthMetadata(backend) {
    if (!backend.healthy || !backend.capabilities?.apiTypes || backend.capabilities.apiTypes.length === 0) {
      return null;
    }

    return {
      apiTypes: backend.capabilities.apiTypes,
      models: backend.capabilities.models,
      endpoints: backend.capabilities.endpoints
    };
  }
}

module.exports = SimpleHealthChecker;