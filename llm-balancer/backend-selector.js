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

  /**
   * Parse a model string into an array of regex patterns
   * Comma-separated values are split and trimmed, preserving order for precedence
   * @param {string} modelString - Model string (e.g., "llama3,qwen2.5,mistral" or "^llama.*|^qwen.*")
   * @returns {string[]} Array of pattern strings in order of precedence
   */
  static parseModelString(modelString) {
    if (!modelString || typeof modelString !== 'string') return [];

    // Split by comma, trim whitespace, filter empty strings
    const patterns = modelString.split(',').map(p => p.trim()).filter(p => p.length > 0);
    return patterns;
  }

  /**
   * Find the best match across all backends using priority-first regex matching
   * Evaluates patterns in order (first pattern = highest precedence)
   * For each pattern, checks ALL backends before moving to next pattern
   * @param {string|string[]} requestedModels - Single model string with comma-separated patterns or array of such strings
   * @param {Object[]} allBackends - Array of backend objects with getApiTypes() and getModels(apiType) methods
   * @returns {{matched: boolean, backend: Object|null, actualModel: string|null, patternIndex: number}}
   */
  static findBestMatchAcrossBackends(requestedModels, allBackends) {
    // Normalize to array - check explicitly for string type since strings are iterable
    const modelList = typeof requestedModels === 'string' ? [requestedModels] : Array.isArray(requestedModels) ? requestedModels : [requestedModels];

    if (modelList.length === 0 || !Array.isArray(allBackends)) {
      return { matched: false, backend: null, actualModel: null, patternIndex: -1 };
    }

    // Flatten all patterns from all requested models in order
    const allPatterns = [];
    for (const model of modelList) {
      if (!model || typeof model !== 'string') continue;
      const patterns = this.parseModelString(model);
      allPatterns.push(...patterns);
    }

    // Evaluate patterns in order (first = highest precedence)
    for (let patternIndex = 0; patternIndex < allPatterns.length; patternIndex++) {
      const pattern = allPatterns[patternIndex];

      try {
        const regex = new RegExp(pattern);

        // Check ALL backends with this pattern before moving to next pattern
        for (const backend of allBackends) {
          if (!backend.healthy || !backend.getApiTypes || !backend.getModels) continue;

          const apiTypes = backend.getApiTypes();
          for (const apiType of apiTypes) {
            const backendModels = backend.getModels(apiType);
            // Find first model on this backend matching the pattern
            for (const modelName of backendModels) {
              if (regex.test(modelName)) {
                return { matched: true, backend, actualModel: modelName, patternIndex };
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Invalid regex pattern "${pattern}":`, e.message);
        continue; // Skip invalid patterns, try next
      }
    }

    return { matched: false, backend: null, actualModel: null, patternIndex: -1 };
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
   * 3. Model support (optional - filters by requested models using priority-first regex matching)
   * 4. Priority sorting (highest priority first among matched backends)
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

    // Step 2: Use priority-first regex matching if models specified
    if (models && models.length > 0) {
      return this._selectBackendByPriorityFirst(candidates, models);
    }

    // Step 3: Sort by priority and select best candidate (no model filtering)
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
   * Uses priority-first regex matching for flexible model name resolution
   * @param {Array} backends - Array of backend objects
   * @param {string|string[]} models - Requested model(s) with optional comma-separated patterns
   * @returns {boolean} True if at least one suitable backend exists
   */
  hasAvailableBackend(backends, models) {
    const candidates = this._filterByHealthAndAvailability(backends);

    if (models && models.length > 0) {
      // Use priority-first matching instead of simple filter
      const result = ModelMatcher.findBestMatchAcrossBackends(models, candidates);
      return result.matched;
    }

    return candidates.length > 0;
  }

  /**
   * Check if any backend supports the requested models (regardless of current availability)
   * This is used to distinguish between:
   * 1. Temporary unavailability (backend exists but is busy) -> stay in queue
   * 2. Permanent model mismatch (no backend supports model) -> reject immediately
   * @param {Array} backends - Array of backend objects
   * @param {string|string[]} models - Requested model(s) with optional comma-separated patterns
   * @returns {boolean} True if at least one healthy backend supports this model
   */
  hasBackendForModel(backends, models) {
    const healthyBackends = this._filterByHealth(backends);

    if (models && models.length > 0) {
      // Use priority-first matching but without availability check
      const result = ModelMatcher.findBestMatchAcrossBackends(models, healthyBackends);
      return result.matched;
    }

    return healthyBackends.length > 0;
  }

  /**
   * Private: Filter backends by health only (not availability)
   */
  _filterByHealth(backends) {
    return backends.filter(b => b.healthy === true);
  }

  /**
   * Select backend with prompt cache consideration
   * Returns a result object with status, backend, actualModel, and message
   * Status can be: 'found', 'busy', or 'none'
   * - 'found': backend found and available to take the request
   * - 'busy': backends support the model but are currently busy
   * - 'none': no backend supports this model at all
   * @param {Array} backends - Array of backend objects
   * @param {Object} criterion - Selection criterion with modelString and apiType
   * @param {string} promptBody - Request body/prompt for cache matching
   * @returns {{ status: string, backend: Object|null, actualModel: string|null, message: string }}
   */
  selectBackendWithCache(backends, criterion, promptBody) {
    // Extract model from criterion
    const modelString = criterion?.modelString;

    // === GROUP 1: REJECTION FILTERS (regardless of health/availability) ===

    // 1.1 Check if ANY backend supports this model (health check only)
    // Check if any healthy backend supports the requested model using priority-first matching
    const healthyBackends = this._filterByHealth(backends);
    if (!healthyBackends.length) {
      return { status: 'none', backend: null, actualModel: modelString, message: 'No healthy backends available' };
    }

    // If no backend supports the model, return 'none' immediately
    const modelMatch = ModelMatcher.findBestMatchAcrossBackends(modelString, healthyBackends);
    if (!modelMatch.matched && modelString) {
      return { status: 'none', backend: null, actualModel: modelString, message: 'No backend supports this model' };
    }

    // === GROUP 2: ACCEPT/QUEUE FILTERS ===

    // 2.1 Handle case where no cache data is available
    if (!promptBody || !modelString) {
      // No cache data, fallback to standard selection based on availability
      const availableBackends = this._filterByHealthAndAvailability(backends);

      // Sort by priority and select highest priority backend
      if (availableBackends.length === 0) {
        return { status: 'busy', backend: null, actualModel: modelString, message: 'All backends are currently busy' };
      }

      // Sort backends by priority (highest first)
      const sorted = [...availableBackends].sort((a, b) => {
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        return availableBackends.indexOf(a) - availableBackends.indexOf(b);
      });

      return { status: 'found', backend: sorted[0], actualModel: modelString, message: null };
    }

    // 2.2 Check for prompt cache matches across ALL healthy backends (even if busy)
    // This is the critical fix: we need to check cache on healthy backends regardless of availability
    const allCacheMatches = [];
    for (const backend of healthyBackends) {
      if (!backend.getApiTypes || !backend.getModels || !backend.findCacheMatch) {
        continue; // Backend doesn't support cache lookup
      }

      const cacheMatch = backend.findCacheMatch(promptBody, modelString, null);
      if (cacheMatch && cacheMatch.similarity >= 0.8) {
        allCacheMatches.push({
          backend,
          similarity: cacheMatch.similarity,
          matchType: cacheMatch.matchType
        });
      }
    }

    // 2.3 If cache matches found, prefer cache-hit backends
    if (allCacheMatches.length > 0) {
      console.debug(`[BackendSelector] ${allCacheMatches.length} backends with prompt cache hits`);

      // Check if any cache-hit backend is available
      const availableCacheHits = allCacheMatches.filter(
        m => (m.backend.activeRequestCount || 0) < (m.backend.maxConcurrency || 1)
      );

      if (availableCacheHits.length > 0) {
        // Sort by priority, select best available cache-hit backend
        availableCacheHits.sort((a, b) => {
          const priorityB = b.backend.priority || 0;
          const priorityA = a.backend.priority || 0;
          if (priorityB !== priorityA) return priorityB - priorityA;

          // Tie-breaker: maintain original order
          const backendsArray = Array.isArray(backends) ? backends : [];
          return backendsArray.indexOf(a.backend) - backendsArray.indexOf(b.backend);
        });

        const selected = availableCacheHits[0];
        console.debug(`[BackendSelector] Selected backend ${selected.backend.url} for prompt cache (similarity: ${selected.similarity.toFixed(3)})`);
        return { status: 'found', backend: selected.backend, actualModel: modelString, message: null };
      }

      // All cache-hit backends are busy - return the highest priority cache-hit backend
      // The caller (Balancer) should queue for this backend
      allCacheMatches.sort((a, b) => {
        const priorityB = b.backend.priority || 0;
        const priorityA = a.backend.priority || 0;
        if (priorityB !== priorityA) return priorityB - priorityA;

        // Tie-breaker: maintain original order
        const backendsArray = Array.isArray(backends) ? backends : [];
        return backendsArray.indexOf(a.backend) - backendsArray.indexOf(b.backend);
      });

      const selected = allCacheMatches[0];
      console.debug(`[BackendSelector] Selected backend ${selected.backend.url} for prompt cache (similarity: ${selected.similarity.toFixed(3)}) - backend is busy, will queue`);
      return { status: 'busy', backend: selected.backend, actualModel: modelString, message: 'Backend with cache hit is busy - queuing for same backend' };
    }

    // 2.4 No cache matches - fallback to availability-based selection
    const availableBackends = this._filterByHealthAndAvailability(backends);

    if (availableBackends.length === 0) {
      return { status: 'busy', backend: null, actualModel: modelString, message: 'All backends supporting this model are currently busy' };
    }

    const backend = this._selectBackendByPriorityFirst(availableBackends, modelString);

    if (backend) {
      return { status: 'found', backend, actualModel: modelString, message: null };
    }

    // No available backend for this model
    return { status: 'busy', backend: null, actualModel: modelString, message: 'All backends supporting this model are currently busy' };
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
   * Private: Select backend using priority-first regex matching across all backends
   * Evaluates patterns in order (first = highest precedence)
   * For each pattern, checks ALL healthy/available backends before moving to next pattern
   * Returns the first match found with highest-priority backend among those matching the same pattern
   */
  _selectBackendByPriorityFirst(candidates, models) {
    // Find best match using priority-first regex matching
    const result = ModelMatcher.findBestMatchAcrossBackends(models, candidates);

    if (!result.matched) {
      return null; // No backend matches any pattern
    }

    // Among backends that matched the same pattern, select by priority
    const matchedPatternIndex = result.patternIndex;
    const patterns = ModelMatcher.parseModelString(typeof models === 'string' ? models : models[0]);
    const targetPattern = patterns[matchedPatternIndex];

    try {
      const regex = new RegExp(targetPattern);

      // Find all backends that match this pattern
      const patternMatches = [];
      for (const backend of candidates) {
        if (!backend.healthy || !backend.getApiTypes || !backend.getModels) continue;

        const apiTypes = backend.getApiTypes();
        for (const apiType of apiTypes) {
          const backendModels = backend.getModels(apiType);
          for (const modelName of backendModels) {
            if (regex.test(modelName)) {
              patternMatches.push({ backend, actualModel: modelName });
              break; // Only need one match per backend
            }
          }
        }
      }

      // Sort by priority and return best
      if (patternMatches.length === 0) return null;

      const sorted = patternMatches.sort((a, b) => {
        const priorityA = a.backend.priority || 0;
        const priorityB = b.backend.priority || 0;
        if (priorityB !== priorityA) return priorityB - priorityA; // Higher priority first

        // Tie-breaker: maintain original order
        return candidates.indexOf(a.backend) - candidates.indexOf(b.backend);
      });

      return sorted[0].backend;
    } catch (e) {
      console.warn(`Invalid regex pattern "${targetPattern}":`, e.message);
      return null;
    }
  }

  /**
   * Private: Filter candidates by model support using exact string matching
   * @deprecated Used only for backward compatibility when no regex patterns detected
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
