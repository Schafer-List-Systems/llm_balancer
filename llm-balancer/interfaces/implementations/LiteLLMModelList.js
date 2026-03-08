/**
 * LiteLLM/OpenAI API model list implementation
 * Extracts models from /v1/models response format
 */

const IModelList = require('../IModelList');

class LiteLLMModelList extends IModelList {
  /**
   * Get the API type this interface handles
   * @returns {string} 'litellm' or 'openai' (compatible formats)
   */
  getApiType() {
    return 'litellm';
  }

  /**
   * Get the endpoint path for listing models in OpenAI format
   * @returns {string} '/v1/models'
   */
  getModelEndpoint() {
    return '/v1/models';
  }

  /**
   * Parse LiteLLM/OpenAI response body into model name array
   * Format: { data: [{id: "model-name"}, ...] } or { data: ["model-name", ...] }
   * @param {Object} data - Parsed JSON response
   * @returns {Array<string>} Array of model ids/names
   */
  parseModels(data) {
    if (!data || !data.data) {
      console.warn('LiteLLMModelList: No data field in response');
      return [];
    }

    if (!Array.isArray(data.data)) {
      console.warn('LiteLLMModelList: data is not an array', data.data);
      return [];
    }

    // Handle both object format {id: "..."} and string format "..."
    return data.data.map(m => {
      if (typeof m === 'string') return m;
      if (m && typeof m.id === 'string') return m.id;
      console.warn('LiteLLMModelList: Invalid model entry:', m);
      return null;
    }).filter(Boolean); // Remove null/undefined entries
  }
}

module.exports = LiteLLMModelList;
