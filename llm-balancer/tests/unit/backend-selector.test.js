/**
 * Unit Tests for Backend Selector Module
 * Tests the decoupled backend selection logic including:
 * - Health and availability filtering
 * - Model-based filtering with exact string matching
 * - Priority-based sorting and selection
 * - Extensibility of model matching (ready for regex/lists in phase 2)
 */

const { BackendSelector, ModelMatcher } = require('../../backend-selector');

// Helper function to create fresh backend copies for testing
const getFreshBackends = () => JSON.parse(JSON.stringify([
  { url: 'http://backend1:11434', id: 1, priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 2, models: ['llama3', 'mistral'] },
  { url: 'http://backend2:11434', id: 2, priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['gemma', 'qwen'] },
  { url: 'http://backend3:11434', id: 3, priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 2, models: ['llama3', 'phi3'] }
]));

describe('ModelMatcher', () => {
  describe('matches() - Exact string matching', () => {
    it('should return true when requested model exactly matches a backend model', () => {
      const result = ModelMatcher.matches('llama3', ['llama3', 'mistral']);
      expect(result).toBe(true);
    });

    it('should return false when requested model does not match any backend model', () => {
      const result = ModelMatcher.matches('gpt4', ['llama3', 'mistral']);
      expect(result).toBe(false);
    });

    it('should handle array of requested models - return true if any matches', () => {
      const result = ModelMatcher.matches(['gpt4', 'llama3'], ['llama3', 'mistral']);
      expect(result).toBe(true);
    });

    it('should handle array of requested models - return false if none match', () => {
      const result = ModelMatcher.matches(['gpt4', 'claude'], ['llama3', 'mistral']);
      expect(result).toBe(false);
    });

    it('should be case-sensitive for model names', () => {
      const result = ModelMatcher.matches('Llama3', ['llama3', 'mistral']);
      expect(result).toBe(false);
    });

    it('should handle empty backend models array', () => {
      const result = ModelMatcher.matches('llama3', []);
      expect(result).toBe(false);
    });

    it('should handle undefined/invalid model values gracefully', () => {
      const result = ModelMatcher.matches(null, ['llama3']);
      expect(result).toBe(false);

      const result2 = ModelMatcher.matches(undefined, ['llama3']);
      expect(result2).toBe(false);

      const result3 = ModelMatcher.matches('llama3', null);
      expect(result3).toBe(false);
    });
  });

  describe('findMatches() - Find all matching models', () => {
    it('should return array of all matching model names', () => {
      const matches = ModelMatcher.findMatches(['llama3', 'gpt4'], ['llama3', 'mistral']);
      expect(matches).toEqual(['llama3']);
    });

    it('should return multiple matches when applicable', () => {
      const matches = ModelMatcher.findMatches(['llama3', 'mistral', 'gpt4'], ['llama3', 'mistral', 'qwen']);
      expect(matches.sort()).toEqual(['llama3', 'mistral']);
    });

    it('should return empty array when no models match', () => {
      const matches = ModelMatcher.findMatches(['gpt4', 'claude'], ['llama3', 'mistral']);
      expect(matches).toEqual([]);
    });

    it('should handle single string model input', () => {
      const matches = ModelMatcher.findMatches('llama3', ['llama3', 'mistral']);
      expect(matches).toEqual(['llama3']);
    });
  });
});

describe('BackendSelector', () => {
  let selector;
  let backends;

  beforeEach(() => {
    selector = new BackendSelector();
    backends = getFreshBackends();
  });

  describe('selectBackend() - Core selection logic', () => {
    it('should select the highest priority backend when all are available', () => {
      const result = selector.selectBackend(backends);
      expect(result.url).toBe('http://backend2:11434'); // Priority 2
    });

    it('should filter by model and return matching backend', () => {
      const result = selector.selectBackend(backends, { models: 'llama3' });
      expect(result).not.toBeNull();
      expect(result.models).toContain('llama3');
    });

    it('should select highest priority among model-matching backends', () => {
      // llama3 is on backend1 (priority 1) and backend3 (priority 1)
      // Both have same priority, so first in array wins
      const result = selector.selectBackend(backends, { models: 'llama3' });
      expect(result.url).toBe('http://backend1:11434');
    });

    it('should fall back to any available backend when model not found', () => {
      // Remove all backends with the requested model
      const noMatchBackends = getFreshBackends();
      noMatchBackends.forEach(b => b.models = ['nonexistent']);

      const result = selector.selectBackend(noMatchBackends, { models: 'llama3' });
      expect(result).toBeNull(); // No backend matches the model filter
    });

    it('should return null when all backends are unhealthy', () => {
      const unhealthyBackends = getFreshBackends();
      unhealthyBackends.forEach(b => b.healthy = false);

      const result = selector.selectBackend(unhealthyBackends, { models: 'llama3' });
      expect(result).toBeNull();
    });

    it('should return null when all backends are at max concurrency', () => {
      const fullBackends = getFreshBackends();
      fullBackends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      const result = selector.selectBackend(fullBackends, { models: 'llama3' });
      expect(result).toBeNull();
    });

    it('should handle empty backends array', () => {
      const result = selector.selectBackend([]);
      expect(result).toBeNull();
    });

    it('should handle array of requested models - matches if any model is supported', () => {
      const result = selector.selectBackend(backends, { models: ['gpt4', 'qwen'] });
      expect(result).not.toBeNull();
      expect(result.url).toBe('http://backend2:11434'); // Has qwen
    });

    it('should respect model filtering when multiple criteria apply', () => {
      // Backend2 has highest priority (2) but supports gemma/qwen only
      // If we request llama3, should get backend1 or backend3 (priority 1)
      const result = selector.selectBackend(backends, { models: 'llama3' });
      expect(result).not.toBeNull();
      expect(result.models).toContain('llama3');
    });

    it('should use availability as tie-breaker when priorities are equal', () => {
      const testBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 2, maxConcurrency: 2, models: ['llama3'] }, // Full
        { url: 'http://backend2:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 2, models: ['llama3'] }    // Available
      ];

      const result = selector.selectBackend(testBackends, { models: 'llama3' });
      expect(result.url).toBe('http://backend2:11434'); // Should skip full backend1
    });
  });

  describe('getAvailableBackends() - Get all available without model filtering', () => {
    it('should return only healthy backends with available capacity', () => {
      const result = selector.getAvailableBackends(backends);
      expect(result).toHaveLength(3);
      result.forEach(b => {
        expect(b.healthy).toBe(true);
        expect(b.activeRequestCount).toBeLessThan(b.maxConcurrency);
      });
    });

    it('should exclude unhealthy backends', () => {
      const testBackends = getFreshBackends();
      testBackends[0].healthy = false;

      const result = selector.getAvailableBackends(testBackends);
      expect(result.length).toBe(2);
      expect(result[0].url).not.toBe('http://backend1:11434');
    });

    it('should exclude backends at max concurrency', () => {
      const testBackends = getFreshBackends();
      testBackends[0].activeRequestCount = 2; // At maxConcurrency

      const result = selector.getAvailableBackends(testBackends);
      expect(result.length).toBe(2);
    });

    it('should return backends sorted by priority (descending) with index tie-breaker', () => {
      const result = selector.getAvailableBackends(backends);

      // Backend2 has highest priority (2), should be first
      expect(result[0].url).toBe('http://backend2:11434');
      expect(result[0].priority).toBe(2);

      // Backends 1 and 3 both have priority 1, order by array index
      // Backend1 is at index 0, so it comes before backend3 (index 2)
      const remaining = result.slice(1);
      expect([remaining[0].url, remaining[1].url]).toEqual(['http://backend1:11434', 'http://backend3:11434']);
    });
  });

  describe('hasAvailableBackend() - Availability check', () => {
    it('should return true when backend supports requested model and is available', () => {
      const result = selector.hasAvailableBackend(backends, 'llama3');
      expect(result).toBe(true);
    });

    it('should return false when no backend supports the requested model', () => {
      const result = selector.hasAvailableBackend(backends, 'nonexistent-model');
      expect(result).toBe(false);
    });

    it('should return true for any available backend when models not specified', () => {
      const result = selector.hasAvailableBackend(backends, []);
      expect(result).toBe(true);
    });

    it('should return false when all backends are unhealthy', () => {
      const testBackends = getFreshBackends();
      testBackends.forEach(b => b.healthy = false);

      const result = selector.hasAvailableBackend(testBackends, 'llama3');
      expect(result).toBe(false);
    });

    it('should return false when all backends are at max concurrency', () => {
      const testBackends = getFreshBackends();
      testBackends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      const result = selector.hasAvailableBackend(testBackends, 'llama3');
      expect(result).toBe(false);
    });

    it('should handle array of models - true if any model is supported', () => {
      const result = selector.hasAvailableBackend(backends, ['gpt4', 'qwen']);
      expect(result).toBe(true); // qwen is available on backend2
    });
  });

  describe('getModelAvailabilityStats() - Model statistics', () => {
    it('should return accurate counts of backends and models', () => {
      const stats = selector.getModelAvailabilityStats(backends);

      expect(stats.totalBackends).toBe(3);
      expect(stats.healthyBackends).toBe(3);
      expect(Array.isArray(stats.uniqueHealthyModels)).toBe(true);
    });

    it('should exclude unhealthy backends from statistics', () => {
      const testBackends = getFreshBackends();
      testBackends[0].healthy = false;

      const stats = selector.getModelAvailabilityStats(testBackends);
      expect(stats.healthyBackends).toBe(2);
    });

    it('should track which models are available on which backends', () => {
      const stats = selector.getModelAvailabilityStats(backends);

      expect(stats.modelsPerBackend['http://backend1:11434']).toEqual(['llama3', 'mistral']);
      expect(stats.modelsPerBackend['http://backend2:11434']).toEqual(['gemma', 'qwen']);
    });

    it('should handle backends with no models configured', () => {
      const testBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: [] }
      ];

      const stats = selector.getModelAvailabilityStats(testBackends);
      expect(stats.healthyBackends).toBe(1);
      expect(stats.uniqueHealthyModels).toEqual([]);
    });
  });

  describe('Integration with priority sorting', () => {
    it('should select highest priority backend that matches model criteria', () => {
      const testBackends = [
        { url: 'http://low-prio:11434', id: 1, priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] },
        { url: 'http://high-prio:11434', id: 2, priority: 5, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] }
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://high-prio:11434'); // Priority 5 > 1
    });

    it('should skip backends at max concurrency even if highest priority', () => {
      const testBackends = [
        { url: 'http://busy-high-prio:11434', id: 1, priority: 5, healthy: true, activeRequestCount: 1, maxConcurrency: 1, models: ['model-a'] },
        { url: 'http://idle-low-prio:11434', id: 2, priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] }
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://idle-low-prio:11434'); // Should skip busy backend
    });

    it('should handle negative priorities correctly', () => {
      const testBackends = [
        { url: 'http://neg-prio:11434', id: 1, priority: -5, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] },
        { url: 'http://zero-prio:11434', id: 2, priority: 0, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] }
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://zero-prio:11434'); // 0 > -5
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle backends with undefined priority', () => {
      const testBackends = [
        { url: 'http://backend1:11434', healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['model-a'] }
        // No priority field - should default to 0
      ];

      const result = selector.selectBackend(testBackends);
      expect(result).not.toBeNull();
    });

    it('should handle backends with undefined models array', () => {
      const testBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        // No models field - should default to empty array
      ];

      const result = selector.selectBackend(testBackends, { models: 'any-model' });
      expect(result).toBeNull(); // No backend supports the model
    });

    it('should handle mixed valid/invalid model values in arrays', () => {
      const testBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, models: ['valid-model'] }
      ];

      // Should handle null/undefined entries gracefully
      const result = selector.selectBackend(testBackends, { models: ['valid-model', null, undefined, ''] });
      expect(result).not.toBeNull();
    });
  });
});
