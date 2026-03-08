/**
 * Abstract interface for listing backend models
 * Implementations know how to query and parse model lists from specific API types
 */

class IModelList {
  /**
   * Query backend for available models
   * @param {Object} backend - Backend object with url property
   * @returns {Promise<Array<string>>} Array of model names/ids
   */
  async listModels(backend) {
    throw new Error('listModels() must be implemented by subclass');
  }

  /**
   * Get the API type this interface handles
   * @returns {string} API type identifier
   */
  getApiType() {
    throw new Error('getApiType() must be implemented by subclass');
  }

  /**
   * Parse raw response body into model name array
   * @param {Object} data - Parsed JSON response
   * @returns {Array<string>} Array of model names/ids
   */
  parseModels(data) {
    throw new Error('parseModels() must be implemented by subclass');
  }

  /**
   * Get the endpoint path for listing models
   * @returns {string} Endpoint path (e.g., '/api/tags' or '/v1/models')
   */
  getModelEndpoint() {
    throw new Error('getModelEndpoint() must be implemented by subclass');
  }
}

module.exports = IModelList;
