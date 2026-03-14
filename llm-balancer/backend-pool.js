/**
 * BackendPool - Manages the backend collection and provides unified filtering
 *
 * Architecture:
 * - Owns the source of truth for backends
 * - Provides a single unified filter() function for all backend selection needs
 * - Returns filtered pools that can be chained (immutable pattern)
 * - Enables separation of concerns: BackendPool owns data, Balancer owns queueing
 */

const { ModelMatcher } = require('./backend-selector');

/**
 * BackendPool class
 */
class BackendPool {
  /**
   * Create a new BackendPool
   * @param {Array} backends - Array of backend objects (source of truth)
   */
  constructor(backends) {
    this._backends = backends;
  }

  /**
   * Return the complete backend array (read-only view)
   * @returns {Array} All backends
   */
  getAll() {
    return this._backends;
  }

  /**
   * Main filtering function - unified interface for all backend selection
   * Returns a new BackendPool instance with filtered backends (immutable)
   *
   * Criteria object structure:
   * {
   *   healthy: boolean,           // true = only healthy, false = only unhealthy, undefined = any
   *   available: boolean,         // true = has capacity, false = at max, undefined = any
   *   models: string[],           // Filter backends supporting any of these models
   *   custom: function(backend)   // Custom filter function returning boolean
   * }
   *
   * @param {Object} criteria - Filter criteria object
   * @returns {BackendPool} New BackendPool with filtered backends
   */
  filter(criteria = {}) {
    const { healthy, available, models, custom } = criteria;

    let filtered = [...this._backends];

    // Apply health filter
    if (healthy !== undefined) {
      filtered = filtered.filter(b => b.healthy === healthy);
    }

    // Apply availability (concurrency) filter
    if (available !== undefined) {
      if (available) {
        // Has capacity: activeRequestCount < maxConcurrency
        filtered = filtered.filter(b => (b.activeRequestCount || 0) < (b.maxConcurrency || 1));
      } else {
        // At max: activeRequestCount >= maxConcurrency
        filtered = filtered.filter(b => (b.activeRequestCount || 0) >= (b.maxConcurrency || 1));
      }
    }

    // Apply model filter
    if (models && models.length > 0) {
      filtered = filtered.filter(backend => {
        if (!backend.getApiTypes || !backend.getModels) return false;

        const apiTypes = backend.getApiTypes();
        for (const apiType of apiTypes) {
          const backendModels = backend.getModels(apiType);
          if (ModelMatcher.matches(models, backendModels)) {
            return true;
          }
        }
        return false;
      });
    }

    // Apply custom filter
    if (custom && typeof custom === 'function') {
      filtered = filtered.filter(custom);
    }

    // Return new BackendPool with filtered results (immutable pattern)
    return new BackendPool(filtered);
  }

  /**
   * Convenience: Get only healthy backends
   * @returns {BackendPool} Filtered pool
   */
  healthy() {
    return this.filter({ healthy: true });
  }

  /**
   * Convenience: Get only available backends (have capacity)
   * @returns {BackendPool} Filtered pool
   */
  available() {
    return this.filter({ available: true });
  }

  /**
   * Convenience: Get backends supporting specified models
   * @param {string|string[]} models - Model(s) to filter by
   * @returns {BackendPool} Filtered pool
   */
  byModel(models) {
    return this.filter({ models: Array.isArray(models) ? models : [models] });
  }

  /**
   * Get backends that are healthy and available
   * @returns {BackendPool} Filtered pool
   */
  healthyAndAvailable() {
    return this.filter({ healthy: true, available: true });
  }

  /**
   * Check if any backends match the criteria
   * @param {Object} criteria - Filter criteria
   * @returns {boolean} True if at least one backend matches
   */
  some(criteria = {}) {
    return this.filter(criteria).getAll().length > 0;
  }

  /**
   * Get statistics about the pool
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      totalBackends: this._backends.length,
      healthyBackends: this._backends.filter(b => b.healthy).length,
      unhealthyBackends: this._backends.filter(b => !b.healthy).length,
      availableBackends: this._backends.filter(b => (b.activeRequestCount || 0) < (b.maxConcurrency || 1)).length,
      busyBackends: this._backends.filter(b => (b.activeRequestCount || 0) >= (b.maxConcurrency || 1)).length
    };
  }

  /**
   * Add a backend to the pool
   * @param {Object} backend - Backend object to add
   */
  add(backend) {
    this._backends.push(backend);
  }

  /**
   * Remove a backend by URL
   * @param {string} url - URL of backend to remove
   * @returns {boolean} True if backend was removed
   */
  remove(url) {
    const index = this._backends.findIndex(b => b.url === url);
    if (index !== -1) {
      this._backends.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a backend by URL
   * @param {string} url - Backend URL
   * @returns {Object|null} Backend object or null
   */
  getByUrl(url) {
    return this._backends.find(b => b.url === url) || null;
  }
}

module.exports = BackendPool;
