/**
 * Backend Selector Module
 * Encapsulates backend selection logic with support for:
 * - Health-based filtering
 * - Availability (concurrency) checking
 * - Model-based filtering (exact match, extensible for regex/lists)
 * - Priority-based sorting and selection
 */

/**
 * ModelMatcher class - handles model matching logic
 * Designed to be extensible for future features like regex or lists
 */
class ModelMatcher {
  /**
   * Check if a backend supports the requested models
   * @param {string|string[]} requestedModels - Single model string or array of model strings
   * @param {string[]} availableModels - Array of models provided by the backend
   * @returns {boolean} True if at least one requested model is supported
   */
  static matches(requestedModels, availableModels) {
    // Normalize to arrays for consistent handling
    const requestList = Array.isArray(requestedModels) ? requestedModels : [requestedModels];
    const backendList = Array.isArray(availableModels) ? availableModels : [];

    // Phase 1: Exact string matching (current implementation)
    // Returns true if ANY requested model matches ANY backend model exactly
    for (const requested of requestList) {
      if (!requested || typeof requested !== 'string') continue;
      if (backendList.includes(requested)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find which requested models are supported by the backend
   * @param {string|string[]} requestedModels - Single model string or array
   * @param {string[]} availableModels - Array of models provided by the backend
   * @returns {string[]} Array of matching model names
   */
  static findMatches(requestedModels, availableModels) {
    const requestList = Array.isArray(requestedModels) ? requestedModels : [requestedModels];
    const backendList = Array.isArray(availableModels) ? availableModels : [];

    const matches = [];
    for (const requested of requestList) {
      if (!requested || typeof requested !== 'string') continue;
      if (backendList.includes(requested)) {
        matches.push(requested);
      }
    }
    return matches;
  }
}

/**
 * BackendSelector class - handles backend selection with multiple criteria
 */
class BackendSelector {
  constructor() {
    // Selection strategies - can be configured per request type if needed
    this.strategy = 'priority'; // 'priority', 'round-robin', etc. (future extension)
  }

  /**
   * Select a backend based on multiple criteria:
   * 1. Health status (must be healthy)
   * 2. Availability (activeRequestCount < maxConcurrency)
   * 3. Model support (optional - filters by requested models)
   * 4. Priority sorting (highest priority first)
   *
   * @param {Array} backends - Array of backend objects
   * @param {Object} options - Selection options
   * @param {string|string[]} [options.models] - Requested model(s) to filter by
   * @returns {Object|null} Selected backend or null if none available
   */
  selectBackend(backends, options = {}) {
    const { models } = options;

    // Step 1: Filter by health and availability
    let candidates = this._filterByHealthAndAvailability(backends);

    // Step 2: Filter by model support (if models specified)
    if (models && models.length > 0) {
      candidates = this._filterByModel(candidates, models);
    }

    // Step 3: Sort by priority and select best candidate
    return this._selectByPriority(candidates);
  }

  /**
   * Get all available backends sorted by priority (no model filtering)
   * Used for general stats and health checks where model matching isn't needed
   * @param {Array} backends - Array of backend objects
   * @returns {Object[]} Sorted array of available backends
   */
  getAvailableBackends(backends) {
    const candidates = this._filterByHealthAndAvailability(backends);
    return this._sortCandidates(candidates);
  }

  /**
   * Check if any backend supports the requested models and is available
   * @param {Array} backends - Array of backend objects
   * @param {string|string[]} models - Requested model(s)
   * @returns {boolean} True if at least one suitable backend exists
   */
  hasAvailableBackend(backends, models) {
    const candidates = this._filterByHealthAndAvailability(backends);

    if (models && models.length > 0) {
      return this._filterByModel(candidates, models).length > 0;
    }

    return candidates.length > 0;
  }

  /**
   * Get statistics about model availability across backends
   * @param {Array} backends - Array of backend objects
   * @returns {Object} Statistics object
   */
  getModelAvailabilityStats(backends) {
    const stats = {
      totalBackends: backends.length,
      healthyBackends: 0,
      modelsPerBackend: {},
      healthyModels: new Set()
    };

    for (const backend of backends) {
      if (!backend.healthy) continue;

      stats.healthyBackends++;

      const apiTypes = backend.getApiTypes();
      const backendModels = apiTypes.length > 0 ? backend.getModels(apiTypes[0]) : [];
      stats.modelsPerBackend[backend.url] = backendModels;

      for (const model of backendModels) {
        stats.healthyModels.add(model);
      }
    }

    stats.uniqueHealthyModels = Array.from(stats.healthyModels);
    return stats;
  }

  /**
   * Private: Filter backends by health and availability
   */
  _filterByHealthAndAvailability(backends) {
    return backends.filter(b =>
      b.healthy === true &&
      (b.activeRequestCount || 0) < (b.maxConcurrency || 1)
    );
  }

  /**
   * Private: Filter candidates by model support
   */
  _filterByModel(candidates, models) {
    if (!models) return candidates;

    // Normalize to array - check explicitly for string type since strings are iterable
    const modelList = typeof models === 'string' ? [models] : Array.isArray(models) ? models : [models];

    return candidates.filter(backend => {
      const apiTypes = backend.getApiTypes();
      const backendModels = apiTypes.length > 0 ? backend.getModels(apiTypes[0]) : [];
      return ModelMatcher.matches(modelList, backendModels);
    });
  }

  /**
   * Private: Sort candidates by priority (descending), then by index for stability
   * Returns the full sorted array (used by getAvailableBackends)
   */
  _sortCandidates(candidates) {
    if (candidates.length === 0) return [];

    // Sort by priority (descending), then by original array index for stability
    const sorted = [...candidates].sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      // Tie-breaker: maintain original order from backends array
      return this._getIndex(a, candidates) - this._getIndex(b, candidates);
    });

    return sorted;
  }

  /**
   * Private: Select best backend by priority from candidates
   */
  _selectByPriority(candidates) {
    const sorted = this._sortCandidates(candidates);
    return sorted[0] || null;
  }

  /**
   * Helper to get index of element in array (for tie-breaking)
   */
  _getIndex(element, array) {
    return array.indexOf(element);
  }
}

module.exports = {
  BackendSelector,
  ModelMatcher
};
