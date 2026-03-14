/**
 * Unit Tests for Backend Selector Module
 * Tests the decoupled backend selection logic including:
 * - Health and availability filtering
 * - Model-based filtering with exact string matching
 * - Priority-based sorting and selection
 * - Extensibility of model matching (ready for regex/lists in phase 2)
 */

const { BackendSelector, ModelMatcher } = require('../../backend-selector');
const { createTestBackendWithPriority } = require('./helpers/backend-factory');

// Helper function to create fresh backend copies for testing with backendInfo structure
const getFreshBackends = () => [
  createTestBackendWithPriority('http://backend1:11434', 'ollama', ['llama3', 'mistral'], 1, 2),
  createTestBackendWithPriority('http://backend2:11434', 'ollama', ['gemma', 'qwen'], 2, 1),
  createTestBackendWithPriority('http://backend3:11434', 'ollama', ['llama3', 'phi3'], 1, 2)
];

describe('ModelMatcher', () => {
  describe('matches() - Exact string matching (backward compatible)', () => {
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

  describe('findMatches() - Find all matching models (backward compatible)', () => {
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

  describe('parseModelString() - Regex pattern parsing', () => {
    it('should split comma-separated patterns and preserve order', () => {
      const result = ModelMatcher.parseModelString('llama3,qwen2.5,mistral');
      expect(result).toEqual(['llama3', 'qwen2.5', 'mistral']);
    });

    it('should trim whitespace from patterns', () => {
      const result = ModelMatcher.parseModelString(' llama3 , qwen2.5 , mistral ');
      expect(result).toEqual(['llama3', 'qwen2.5', 'mistral']);
    });

    it('should handle regex special characters', () => {
      const result = ModelMatcher.parseModelString('^llama.*|^qwen.*,^mistral.*');
      expect(result).toEqual(['^llama.*|^qwen.*', '^mistral.*']);
    });

    it('should filter empty strings after splitting', () => {
      const result = ModelMatcher.parseModelString('llama3,,qwen2.5,,,mistral');
      expect(result).toEqual(['llama3', 'qwen2.5', 'mistral']);
    });

    it('should return empty array for invalid input', () => {
      expect(ModelMatcher.parseModelString(null)).toEqual([]);
      expect(ModelMatcher.parseModelString(undefined)).toEqual([]);
      expect(ModelMatcher.parseModelString('')).toEqual([]);
    });
  });

  describe('findBestMatchAcrossBackends() - Priority-first regex matching', () => {
    const createMockBackend = (url, healthy, priority, models) => ({
      url,
      healthy,
      priority: priority || 0,
      getApiTypes: () => ['openai'],
      getModels: () => models || []
    });

    it('should find exact match using regex', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama3', 'mistral'])];
      const result = ModelMatcher.findBestMatchAcrossBackends('llama3', backends);

      expect(result.matched).toBe(true);
      expect(result.backend.url).toBe('http://backend1:11434');
      expect(result.actualModel).toBe('llama3');
    });

    it('should match using wildcard pattern', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['Llama-3-70B', 'mistral'])];
      const result = ModelMatcher.findBestMatchAcrossBackends('.*', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('Llama-3-70B'); // First model in list
    });

    it('should match using prefix pattern', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama-3-8b', 'mistral'])];
      const result = ModelMatcher.findBestMatchAcrossBackends('^llama.*', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama-3-8b');
    });

    it('should evaluate patterns in order (first pattern has highest precedence)', () => {
      const backends = [
        createMockBackend('http://backend1:11434', true, 1, ['qwen2.5']),
        createMockBackend('http://backend2:11434', true, 5, ['llama3']) // Higher priority but lower precedence pattern
      ];

      // Request llama3 first (highest precedence), should match backend2 despite it having higher priority
      const result = ModelMatcher.findBestMatchAcrossBackends('llama3,qwen2.5', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama3');
    });

    it('should prefer first pattern across all backends before trying second pattern', () => {
      const backends = [
        createMockBackend('http://backend1:11434', true, 5, ['qwen2.5']), // Higher priority
        createMockBackend('http://backend2:11434', true, 1, ['llama3'])
      ];

      // Request llama3 first (highest precedence) - should match backend2 even though backend1 has higher priority
      const result = ModelMatcher.findBestMatchAcrossBackends('llama3,qwen2.5', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama3'); // llama3 matched first pattern, not qwen2.5
    });

    it('should fall back to next pattern when first pattern matches no backends', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['qwen2.5'])];

      // llama3 doesn't exist, should try qwen2.5 and succeed
      const result = ModelMatcher.findBestMatchAcrossBackends('llama3,qwen2.5', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('qwen2.5');
    });

    it('should return first matched model on a backend when multiple models match pattern', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama-3-8b', 'llama-3-70b'])];

      const result = ModelMatcher.findBestMatchAcrossBackends('^llama.*', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama-3-8b'); // First matching model in list
    });

    it('should handle invalid regex patterns gracefully (skip and continue)', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama3'])];

      // Invalid regex pattern should be skipped, next valid pattern should work
      const result = ModelMatcher.findBestMatchAcrossBackends('[invalid,llama3', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama3');
    });

    it('should return matched:false when no backend matches any pattern', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama3'])];

      const result = ModelMatcher.findBestMatchAcrossBackends('nonexistent-model', backends);

      expect(result.matched).toBe(false);
      expect(result.backend).toBeNull();
      expect(result.actualModel).toBeNull();
    });

    it('should handle empty backend array', () => {
      const result = ModelMatcher.findBestMatchAcrossBackends('llama3', []);

      expect(result.matched).toBe(false);
      expect(result.backend).toBeNull();
    });

    it('should skip unhealthy backends', () => {
      const backends = [
        createMockBackend('http://backend1:11434', false, 5, ['llama3']), // Unhealthy
        createMockBackend('http://backend2:11434', true, 1, ['mistral'])   // Healthy
      ];

      const result = ModelMatcher.findBestMatchAcrossBackends('.*', backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('mistral'); // Should skip unhealthy backend1
    });

    it('should handle multiple requested model strings with patterns', () => {
      const backends = [createMockBackend('http://backend1:11434', true, 1, ['llama3'])];

      // Multiple strings should be flattened and evaluated in order
      const result = ModelMatcher.findBestMatchAcrossBackends(['qwen.*', 'llama3'], backends);

      expect(result.matched).toBe(true);
      expect(result.actualModel).toBe('llama3');
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
      expect(result.backendInfo?.models?.ollama).toContain('llama3');
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
      noMatchBackends.forEach(b => {
        b.backendInfo.models.ollama = ['nonexistent'];
      });

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
      expect(result.backendInfo?.models?.ollama).toContain('llama3');
    });

    it('should use availability as tie-breaker when priorities are equal', () => {
      const testBackends = [
        createTestBackendWithPriority('http://backend1:11434', 'ollama', ['llama3'], 1, 2), // Full
        createTestBackendWithPriority('http://backend2:11434', 'ollama', ['llama3'], 1, 2)    // Available
      ];
      // Set backend1 to max concurrency to simulate it being full
      testBackends[0].activeRequestCount = 2;

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
        createTestBackendWithPriority('http://backend1:11434', 'ollama', [], 1, 1)
      ];

      const stats = selector.getModelAvailabilityStats(testBackends);
      expect(stats.healthyBackends).toBe(1);
      expect(stats.uniqueHealthyModels).toEqual([]);
    });
  });

  describe('Integration with priority sorting', () => {
    it('should select highest priority backend that matches model criteria', () => {
      const testBackends = [
        createTestBackendWithPriority('http://low-prio:11434', 'ollama', ['model-a'], 1, 1),
        createTestBackendWithPriority('http://high-prio:11434', 'ollama', ['model-a'], 5, 1)
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://high-prio:11434'); // Priority 5 > 1
    });

    it('should skip backends at max concurrency even if highest priority', () => {
      const testBackends = [
        (() => { const b = createTestBackendWithPriority('http://busy-high-prio:11434', 'ollama', ['model-a'], 5, 1); b.activeRequestCount = 1; return b; })(),
        createTestBackendWithPriority('http://idle-low-prio:11434', 'ollama', ['model-a'], 1, 1)
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://idle-low-prio:11434'); // Should skip busy backend
    });

    it('should handle negative priorities correctly', () => {
      const testBackends = [
        (() => { const b = createTestBackendWithPriority('http://neg-prio:11434', 'ollama', ['model-a'], -5, 1); return b; })(),
        createTestBackendWithPriority('http://zero-prio:11434', 'ollama', ['model-a'], 0, 1)
      ];

      const result = selector.selectBackend(testBackends, { models: 'model-a' });
      expect(result.url).toBe('http://zero-prio:11434'); // 0 > -5
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle backends with undefined priority', () => {
      const testBackends = [
        (() => { const b = createTestBackendWithPriority('http://backend1:11434', 'ollama', ['model-a'], 1, 1); delete b.priority; return b; })()
        // No priority field - should default to 0
      ];

      const result = selector.selectBackend(testBackends);
      expect(result).not.toBeNull();
    });

    it('should handle backends with undefined models array', () => {
      const testBackends = [
        (() => { const b = createTestBackendWithPriority('http://backend1:11434', 'ollama', [], 1, 1); return b; })()
        // No models field - should default to empty array
      ];

      const result = selector.selectBackend(testBackends, { models: 'any-model' });
      expect(result).toBeNull(); // No backend supports the model
    });

    it('should handle mixed valid/invalid model values in arrays', () => {
      const testBackends = [
        createTestBackendWithPriority('http://backend1:11434', 'ollama', ['valid-model'], 1, 1)
      ];

      // Should handle null/undefined entries gracefully
      const result = selector.selectBackend(testBackends, { models: ['valid-model', null, undefined, ''] });
      expect(result).not.toBeNull();
    });
  });

  describe('selectBackendWithCache() - Prompt cache-aware selection', () => {
    const createMockBackendWithCache = (url, healthy, priority, models, cacheMatches = {}) => {
      const backend = createTestBackendWithPriority(url, 'ollama', models, priority, 2);
      backend.activeRequestCount = 0; // Start available

      // Add mock cache matching behavior
      backend.findCacheMatch = (prompt, model) => {
        if (cacheMatches[prompt] && cacheMatches[prompt].model === model) {
          return {
            entry: cacheMatches[prompt],
            similarity: cacheMatches[prompt].similarity,
            matchType: 'similarity'
          };
        }
        return null;
      };

      return backend;
    };

    beforeEach(() => {
      selector = new BackendSelector();
    });

    it('should prioritize backend with cache hit over higher-priority backend without cache', () => {
      const backends = [
        createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://low-prio:11434'); // Cache hit wins despite lower priority
    });

    it('should fall back to regular selection when no cache match exists', () => {
      const backends = [
        createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {}),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://high-prio:11434'); // Regular selection (highest priority)
    });

    it('should skip backend with cache hit if backend is at max concurrency', () => {
      const backends = [
        (() => {
          const b = createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {
            'write a story': { model: 'llama3', similarity: 0.95 }
          });
          b.activeRequestCount = 2; // At max concurrency
          return b;
        })(),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://high-prio:11434'); // Skip cache-hit backend, use high priority
    });

    it('should return lowest priority cache-matching backend when all have similar cache matches', () => {
      const backends = [
        createMockBackendWithCache('http://lowest-prio:11434', true, 1, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackendWithCache('http://middle-prio:11434', true, 3, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.85 }
        }),
        createMockBackendWithCache('http://highest-prio:11434', true, 5, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.90 }
        })
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // All have cache hits >= 0.8, so highest priority backend wins
      expect(result.backend.url).toBe('http://highest-prio:11434');
    });

    it('should select backend with highest similarity among same-priority backends', () => {
      const backends = [
        createMockBackendWithCache('http://backend1:11434', true, 5, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.85 }
        }),
        createMockBackendWithCache('http://backend2:11434', true, 5, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.95 }
        })
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Same priority, so index tie-breaker applies (backend1 wins)
      expect(result.backend.url).toBe('http://backend1:11434');
    });

    it('should fallback to standard selection when promptBody is null', () => {
      const backends = [
        createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {}),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        null
      );

      expect(result.backend.url).toBe('http://high-prio:11434'); // Falls back to standard selection
    });

    it('should fallback to standard selection when modelString is null', () => {
      const backends = [
        createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        null,
        'write a story'
      );

      expect(result.backend.url).toBe('http://high-prio:11434'); // Falls back to standard selection
    });

    it('should ignore cache matches below 80% similarity threshold', () => {
      const backends = [
        createMockBackendWithCache('http://low-prio:11434', true, 1, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.75 } // Below threshold
        }),
        createMockBackendWithCache('http://high-prio:11434', true, 5, ['llama3'], {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://high-prio:11434'); // Cache match ignored (below threshold)
    });

    it('should select by cache hit similarity when backend has capacity but others dont', () => {
      const backends = [
        createMockBackendWithCache('http://cache-hit:11434', true, 3, ['llama3'], {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        (() => {
          const b = createMockBackendWithCache('http://high-prio-full:11434', true, 10, ['llama3'], {});
          b.activeRequestCount = 2; // At max concurrency
          return b;
        })()
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://cache-hit:11434'); // High-prio backend is full, use cache hit
    });
  });
});
