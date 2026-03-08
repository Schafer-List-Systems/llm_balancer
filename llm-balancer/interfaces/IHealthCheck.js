/**
 * Abstract interface for backend health checking
 * Implementations know how to check specific API types (Ollama, LiteLLM, OpenAI)
 */

class IHealthCheck {
  /**
   * Check backend health and update its state
   * @param {Object} backend - Backend object with url property
   * @returns {Promise<Object>} Health status result
   */
  async check(backend) {
    throw new Error('check() must be implemented by subclass');
  }

  /**
   * Get the API type this interface handles
   * @returns {string} API type identifier
   */
  getApiType() {
    throw new Error('getApiType() must be implemented by subclass');
  }

  /**
   * Check if this interface can handle the given backend
   * @param {Object} backend - Backend object
   * @returns {boolean} True if compatible
   */
  canHandle(backend) {
    return backend.capabilities?.apiType === this.getApiType();
  }

  /**
   * Get health-specific metadata (optional override)
   * @param {Object} backend - Backend object
   * @returns {Object|null} Metadata or null if not applicable
   */
  getHealthMetadata(backend) {
    return null;
  }
}

module.exports = IHealthCheck;
