/**
 * Backend class - Encapsulates all backend functionality
 * Contains state, BackendInfo (capability detection), and health checker
 * Follows the delegation pattern for health checking
 */

class Backend {
  constructor(url, maxConcurrency = 10) {
    this.url = url;
    this.maxConcurrency = maxConcurrency;
    this.healthy = false;
    this.failCount = 0;
    this.activeRequestCount = 0;
    this.requestCount = 0;
    this.errorCount = 0;

    // BackendInfo will be attached after capability detection
    // This follows composition over duplication - BackendInfo is attached directly
    this.backendInfo = null;

    // Health checker will be assigned based on primary API type
    // This enables API-specific health checking via delegation
    this.healthChecker = null;
  }

  /**
   * Check backend health using assigned health checker
   * Delegates to healthChecker.check(this) - follows delegation pattern
   * @returns {Promise<Object>} Health status result
   * @throws {Error} If no health checker is assigned
   */
  async checkHealth() {
    if (!this.healthChecker) {
      throw new Error('No health checker assigned to backend');
    }
    return this.healthChecker.check(this);
  }

  /**
   * Get supported API types from BackendInfo
   * @returns {string[]} Array of API types (e.g., ['ollama', 'openai'])
   */
  getApiTypes() {
    return this.backendInfo?.apis
      ? Object.keys(this.backendInfo.apis).filter(api => this.backendInfo.apis[api].supported)
      : [];
  }

  /**
   * Get models for a specific API type
   * @param {string} apiType - API type (e.g., 'ollama', 'openai')
   * @returns {string[]} Array of model names
   */
  getModels(apiType) {
    return this.backendInfo?.models?.[apiType] || [];
  }

  /**
   * Get all models from all supported API types
   * @returns {Object} Map of API type to model array
   */
  getAllModels() {
    return this.backendInfo?.models || {};
  }

  /**
   * Get endpoint for a specific API type
   * @param {string} apiType - API type
   * @returns {string|null} Endpoint path or null
   */
  getEndpoint(apiType) {
    return this.backendInfo?.endpoints?.[apiType] || null;
  }

  /**
   * Get all endpoints from BackendInfo
   * @returns {Object} Map of API type to endpoint path
   */
  getAllEndpoints() {
    return this.backendInfo?.endpoints || {};
  }

  /**
   * Get the primary API type (first supported API)
   * Used for health checker assignment
   * @returns {string|null} Primary API type or null
   */
  getPrimaryApiType() {
    const apiTypes = this.getApiTypes();
    return apiTypes.length > 0 ? apiTypes[0] : null;
  }

  /**
   * Check if backend supports a specific API type
   * @param {string} apiType - API type to check
   * @returns {boolean} True if API is supported
   */
  supportsApi(apiType) {
    return this.backendInfo?.apis?.[apiType]?.supported === true;
  }

  /**
   * Check if backend supports any of the given API types
   * @param {string[]} apiTypes - Array of API types to check
   * @returns {boolean} True if any API is supported
   */
  supportsAnyApi(apiTypes) {
    return apiTypes.some(api => this.supportsApi(api));
  }

  /**
   * Increment request count
   */
  incrementRequestCount() {
    this.requestCount++;
  }

  /**
   * Increment error count
   */
  incrementErrorCount() {
    this.errorCount++;
  }

  /**
   * Get health status summary
   * @returns {Object} Health status summary
   */
  getHealthSummary() {
    return {
      url: this.url,
      healthy: this.healthy,
      failCount: this.failCount,
      activeRequestCount: this.activeRequestCount,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      apiTypes: this.getApiTypes(),
      primaryApiType: this.getPrimaryApiType()
    };
  }
}

module.exports = Backend;
