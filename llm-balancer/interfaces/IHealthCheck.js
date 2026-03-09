/**
 * Abstract interface for backend health checking
 * Implementations know how to check specific API types (Ollama, OpenAI, Anthropic, Google)
 *
 * Pattern: Health checkers receive Backend instances and use backend.backendInfo
 * to determine the correct endpoint and port for health checks.
 *
 * The Backend class contains:
 * - url: Backend URL
 * - backendInfo: Capability detection results (from BackendInfo)
 * - healthChecker: Assigned health checker based on primary API
 *
 * Health checkers delegate to backend.checkHealth() which calls healthChecker.check(this)
 */

class IHealthCheck {
  /**
   * Check backend health using API-specific endpoint from backendInfo
   * Receives Backend instance and uses backend.backendInfo.endpoints for correct endpoint
   * @param {Backend} backend - Backend instance with url and backendInfo properties
   * @returns {Promise<Object>} Health status result with healthy, models, apiType fields
   */
  async check(backend) {
    throw new Error('check() must be implemented by subclass');
  }

  /**
   * Get the API type this interface handles
   * @returns {string} API type identifier (e.g., 'ollama', 'openai', 'anthropic', 'google')
   */
  getApiType() {
    throw new Error('getApiType() must be implemented by subclass');
  }

  /**
   * Check if this interface can handle the given backend
   * @param {Backend} backend - Backend instance
   * @returns {boolean} True if backend supports this API type
   */
  canHandle(backend) {
    return backend.supportsApi(this.getApiType());
  }

  /**
   * Get health-specific metadata (optional override)
   * @param {Backend} backend - Backend instance
   * @returns {Object|null} Metadata or null if not applicable
   */
  getHealthMetadata(backend) {
    return null;
  }
}

module.exports = IHealthCheck;
