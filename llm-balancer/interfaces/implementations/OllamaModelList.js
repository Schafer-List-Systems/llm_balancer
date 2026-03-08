/**
 * Ollama API model list implementation
 * Extracts models from /api/tags response format
 */

const IModelList = require('../IModelList');

class OllamaModelList extends IModelList {
  /**
   * Get the API type this interface handles
   * @returns {string} 'ollama'
   */
  getApiType() {
    return 'ollama';
  }

  /**
   * Get the endpoint path for listing models in Ollama format
   * @returns {string} '/api/tags'
   */
  getModelEndpoint() {
    return '/api/tags';
  }

  /**
   * Parse Ollama response body into model name array
   * Format: { models: [{name: "model-name"}, ...] } or { models: ["model-name", ...] }
   * @param {Object} data - Parsed JSON response
   * @returns {Array<string>} Array of model names
   */
  parseModels(data) {
    if (!data || !data.models) {
      console.warn('OllamaModelList: No models field in response');
      return [];
    }

    if (!Array.isArray(data.models)) {
      console.warn('OllamaModelList: models is not an array', data.models);
      return [];
    }

    // Handle both object format {name: "..."} and string format "..."
    return data.models.map(m => {
      if (typeof m === 'string') return m;
      if (m && typeof m.name === 'string') return m.name;
      console.warn('OllamaModelList: Invalid model entry:', m);
      return null;
    }).filter(Boolean); // Remove null/undefined entries
  }
}

module.exports = OllamaModelList;
