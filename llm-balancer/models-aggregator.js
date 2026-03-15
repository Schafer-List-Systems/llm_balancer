/**
 * ModelsAggregator - Aggregates model listings from multiple backends
 * Provides unified endpoints for discovering available models across all backends
 * filtered by API type and health status.
 */

class ModelsAggregator {
  constructor(timeout = 5000) {
    this.timeout = timeout;

    // API type to model list endpoint mapping
    this.apiTypeEndpoints = {
      openai: '/v1/models',
      google: '/v1beta/models',
      ollama: '/api/tags',
      groq: '/openai/v1/models'
      // anthropic has no model list endpoint (POST only)
    };

    // Performance statistics tracking
    this.stats = {
      requestCount: 0,
      successfulAggregations: 0,
      failedAggregations: 0,
      totalModelsDiscovered: 0
    };
  }

  /**
   * Get aggregated models for a specific API type from healthy backends
   * @param {BackendPool} backendPool - Pool containing backend instances
   * @param {string} apiType - API type to aggregate models for
   * @param {string} format - Output format ('openai', 'ollama', 'google')
   * @returns {Object} Aggregated model listing
   */
  aggregateModelsForApiType(backendPool, apiType, format) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ModelsAggregator] Aggregating models for API type: ${apiType}, format: ${format}`);

    // Step 1: Filter by healthy backends only
    // Only check health status - availability is not required
    // A backend can be busy but healthy and its models should still appear
    const healthyBackends = backendPool.filter({ healthy: true }).getAll();

    if (healthyBackends.length === 0) {
      console.log(`[${timestamp}] [ModelsAggregator] No healthy backends available for ${apiType}`);
      return this._emptyResponse(format);
    }

    // Step 2: Collect models from each healthy backend
    const aggregatedModels = [];
    const modelNames = new Set(); // Track model names for duplicate handling

    for (const backend of healthyBackends) {
      try {
        // Check if backend supports this API type
        if (!backend.supportsApi(apiType)) {
          console.debug(`[${timestamp}] [ModelsAggregator] Backend ${backend.url} doesn't support ${apiType}, skipping`);
          continue;
        }

        // Get models for this API type from backend info
        const models = backend.getModels(apiType);

        if (!models || models.length === 0) {
          console.debug(`[${timestamp}] [ModelsAggregator] Backend ${backend.url} has no models for ${apiType}`);
          continue;
        }

        // Step 3: Transform and add models with backend metadata
        for (const modelName of models) {
          // Handle duplicate model names across backends
          let uniqueName = modelName;
          if (modelNames.has(modelName)) {
            // Append backend identifier to differentiate duplicates
            const backendId = this._getBackendIdentifier(backend);
            uniqueName = `${modelName}@${backendId}`;
            console.debug(`[${timestamp}] [ModelsAggregator] Duplicate model '${modelName}' from ${backend.url}, using '${uniqueName}'`);
          }

          modelNames.add(modelName);
          const backendId = this._getBackendIdentifier(backend);

          // Transform model entry based on format
          const transformedModel = this._transformModel(
            modelName,
            backend,
            apiType,
            format,
            backendId
          );

          aggregatedModels.push(transformedModel);
        }

        console.log(`[${timestamp}] [ModelsAggregator] Found ${models.length} model(s) from ${backend.url}`);
      } catch (error) {
        console.warn(`[${timestamp}] [ModelsAggregator] Error collecting models from ${backend.url}:`, error.message);
        this.stats.failedAggregations++;
      }
    }

    // Step 4: Build final response based on format
    const response = this._buildResponse(aggregatedModels, format);

    // Update statistics
    this.stats.requestCount++;
    this.stats.successfulAggregations++;
    this.stats.totalModelsDiscovered += aggregatedModels.length;

    console.log(`[${timestamp}] [ModelsAggregator] Aggregation complete: ${aggregatedModels.length} models total`);

    return response;
  }

  /**
   * Get backend identifier for duplicate handling
   * @param {Backend} backend - Backend instance
   * @returns {string} Unique identifier for the backend
   */
  _getBackendIdentifier(backend) {
    // Use a hash of the URL for a consistent short identifier
    const urlHash = this._hashString(backend.url);
    return `b${urlHash.substring(0, 6)}`;
  }

  /**
   * Create a simple hash of a string
   * @param {string} str - String to hash
   * @returns {string} Short hash string
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Transform a single model entry based on API type and output format
   * @param {string} modelName - Model name from backend
   * @param {Backend} backend - Backend instance that provided the model
   * @param {string} apiType - API type the model belongs to
   * @param {string} format - Output format
   * @param {string} backendId - Backend identifier
   * @returns {Object} Transformed model entry
   */
  _transformModel(modelName, backend, apiType, format, backendId) {
    switch (format) {
      case 'openai':
        return this._transformToOpenAI(modelName, backendId);
      case 'ollama':
        return this._transformToOllama(modelName, backend, apiType, backendId);
      case 'google':
        return this._transformToGoogle(modelName, backendId);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Transform model to OpenAI format
   * @param {string} modelName - Model name
   * @param {string} backendId - Backend identifier
   * @returns {Object} OpenAI format model entry
   */
  _transformToOpenAI(modelName, backendId) {
    return {
      id: modelName,
      object: 'model',
      owned_by: backendId
    };
  }

  /**
   * Transform model to Ollama format
   * @param {string} modelName - Model name
   * @param {Backend} backend - Backend instance
   * @param {string} apiType - API type
   * @param {string} backendId - Backend identifier
   * @returns {Object} Ollama format model entry
   */
  _transformToOllama(modelName, backend, apiType, backendId) {
    // Generate a deterministic digest from the model name
    const digest = this._hashString(`${backend.url}:${modelName}`).substring(0, 12);

    // Estimate size based on model name pattern (placeholder - real backends provide actual sizes)
    const size = this._estimateModelSize(modelName);

    return {
      name: modelName,
      model: modelName,
      size: size,
      digest: digest,
      details: {
        format: apiType,
        family: this._extractModelFamily(modelName),
        families: [this._extractModelFamily(modelName)],
        parameter_size: this._estimateParameterSize(modelName),
        quantization_level: 'q4_0'
      }
    };
  }

  /**
   * Transform model to Google format
   * @param {string} modelName - Model name
   * @param {string} backendId - Backend identifier
   * @returns {Object} Google format model entry
   */
  _transformToGoogle(modelName, backendId) {
    // Google Vertex AI format
    const displayName = this._formatDisplayName(modelName);

    return {
      name: modelName,
      displayName: displayName,
      description: `Model served via ${backendId}`,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    };
  }

  /**
   * Estimate model size based on model name patterns
   * @param {string} modelName - Model name
   * @returns {number} Estimated size in bytes
   */
  _estimateModelSize(modelName) {
    // Extract size hints from common model naming patterns
    const sizePatterns = {
      '7b': 4100000000,      // ~4GB
      '8b': 4800000000,      // ~4.8GB
      '13b': 7800000000,     // ~7.8GB
      '34b': 20000000000,    // ~20GB
      '70b': 40000000000,    // ~40GB
      '405b': 250000000000   // ~250GB
    };

    const modelNameLower = modelName.toLowerCase();
    for (const [pattern, size] of Object.entries(sizePatterns)) {
      if (modelNameLower.includes(pattern)) {
        return size;
      }
    }

    // Default estimate for unknown models
    return 4100000000; // ~4GB default
  }

  /**
   * Extract model family from model name
   * @param {string} modelName - Model name
   * @returns {string} Model family name
   */
  _extractModelFamily(modelName) {
    const modelNameLower = modelName.toLowerCase();

    if (modelNameLower.includes('llama') || modelNameLower.includes('mistral')) {
      return 'llama';
    }
    if (modelNameLower.includes('gpt')) {
      return 'gpt';
    }
    if (modelNameLower.includes('gemini') || modelNameLower.includes('gem')) {
      return 'gemini';
    }
    if (modelNameLower.includes('phi')) {
      return 'phi';
    }
    if (modelNameLower.includes('qwen')) {
      return 'qwen';
    }

    // Extract first word as family guess
    const parts = modelName.split(':');
    return parts[0] || 'unknown';
  }

  /**
   * Estimate parameter size category from model name
   * @param {string} modelName - Model name
   * @returns {string} Parameter size category
   */
  _estimateParameterSize(modelName) {
    const modelNameLower = modelName.toLowerCase();

    if (modelNameLower.includes('405b')) {
      return '405B';
    }
    if (modelNameLower.includes('70b')) {
      return '70B';
    }
    if (modelNameLower.includes('34b')) {
      return '34B';
    }
    if (modelNameLower.includes('13b') || modelNameLower.includes('8b')) {
      return '7B';
    }
    if (modelNameLower.includes('7b') || modelNameLower.includes('3b') || modelNameLower.includes('2b')) {
      return '3B';
    }

    return 'unknown';
  }

  /**
   * Format display name from model name
   * @param {string} modelName - Model name
   * @returns {string} Formatted display name
   */
  _formatDisplayName(modelName) {
    // Replace underscores and dashes with spaces
    let displayName = modelName.replace(/[_-]/g, ' ');

    // Add spaces before uppercase letters (camelCase)
    displayName = displayName.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Capitalize first letter of each word
    displayName = displayName.replace(/\b\w/g, char => char.toUpperCase());

    return displayName;
  }

  /**
   * Build final response based on format
   * @param {Array} models - Array of transformed model entries
   * @param {string} format - Output format
   * @returns {Object} Final response object
   */
  _buildResponse(models, format) {
    switch (format) {
      case 'openai':
        return {
          object: 'list',
          data: models
        };
      case 'ollama':
        return {
          models: models
        };
      case 'google':
        return {
          models: models
        };
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Get empty response for the given format
   * @param {string} format - Output format
   * @returns {Object} Empty response
   */
  _emptyResponse(format) {
    switch (format) {
      case 'openai':
        return {
          object: 'list',
          data: []
        };
      case 'ollama':
        return {
          models: []
        };
      case 'google':
        return {
          models: []
        };
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Aggregate models for OpenAI format (used for /v1/models)
   * @param {BackendPool} backendPool - Pool containing backend instances
   * @returns {Object} OpenAI format response
   */
  aggregateForOpenAI(backendPool) {
    // Determine which API types should be included in OpenAI format
    // OpenAI-compatible backends: openai, groq
    const apiTypes = ['openai', 'groq'];

    // Collect models from all compatible API types
    const allModels = [];
    const seenModels = new Set();

    for (const apiType of apiTypes) {
      try {
        const healthyBackends = backendPool.filter({ healthy: true }).getAll();

        for (const backend of healthyBackends) {
          if (!backend.supportsApi(apiType)) continue;

          const models = backend.getModels(apiType);
          if (!models || models.length === 0) continue;

          for (const modelName of models) {
            if (!seenModels.has(modelName)) {
              seenModels.add(modelName);
              allModels.push({
                id: modelName,
                object: 'model',
                owned_by: this._getBackendIdentifier(backend)
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[ModelsAggregator] Error in aggregateForOpenAI for ${apiType}:`, error.message);
      }
    }

    return {
      object: 'list',
      data: allModels
    };
  }

  /**
   * Aggregate models for Ollama format (used for /api/tags)
   * @param {BackendPool} backendPool - Pool containing backend instances
   * @returns {Object} Ollama format response
   */
  aggregateForOllama(backendPool) {
    const healthyBackends = backendPool.filter({ healthy: true }).getAll();
    const allModels = [];
    const seenModels = new Set();

    for (const backend of healthyBackends) {
      if (!backend.supportsApi('ollama')) continue;

      const models = backend.getModels('ollama');
      if (!models || models.length === 0) continue;

      for (const modelName of models) {
        if (!seenModels.has(modelName)) {
          seenModels.add(modelName);
          const backendId = this._getBackendIdentifier(backend);
          allModels.push(this._transformToOllama(modelName, backend, 'ollama', backendId));
        }
      }
    }

    return {
      models: allModels
    };
  }

  /**
   * Aggregate models for Google format (used for /v1beta/models)
   * @param {BackendPool} backendPool - Pool containing backend instances
   * @returns {Object} Google format response
   */
  aggregateForGoogle(backendPool) {
    const healthyBackends = backendPool.filter({ healthy: true }).getAll();
    const allModels = [];
    const seenModels = new Set();

    for (const backend of healthyBackends) {
      if (!backend.supportsApi('google')) continue;

      const models = backend.getModels('google');
      if (!models || models.length === 0) continue;

      for (const modelName of models) {
        if (!seenModels.has(modelName)) {
          seenModels.add(modelName);
          const backendId = this._getBackendIdentifier(backend);
          allModels.push(this._transformToGoogle(modelName, backendId));
        }
      }
    }

    return {
      models: allModels
    };
  }

  /**
   * Aggregate models for Groq format (same as OpenAI)
   * @param {BackendPool} backendPool - Pool containing backend instances
   * @returns {Object} OpenAI-compatible response
   */
  aggregateForGroq(backendPool) {
    // Groq uses the same OpenAI-compatible format
    return this.aggregateForOpenAI(backendPool);
  }

  /**
   * Get current performance statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = ModelsAggregator;
