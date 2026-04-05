/**
 * Test: maxInputTokens Filter Should Apply to Busy Cache-Hit Backends
 *
 * This test verifies that when all cache-hit backends are filtered out by
 * maxInputTokens, the request should fall through to standard availability
 * selection rather than being sent to a backend that cannot handle the prompt.
 */

const { BackendSelector } = require('../../backend-selector');

/**
 * Create a mock backend with cache behavior
 */
const createMockBackend = (url, healthy, priority, models, maxConcurrency = 1, cacheData = {}, maxInputTokens = undefined) => ({
  url,
  healthy,
  priority: priority || 0,
  activeRequestCount: 0,
  maxConcurrency,
  maxInputTokens,
  getApiTypes: () => ['openai'],
  getModels: () => models || [],
  findCacheMatch: (prompt, model) => {
    if (cacheData[prompt] && cacheData[prompt].model === model) {
      return {
        entry: cacheData[prompt],
        similarity: cacheData[prompt].similarity,
        matchType: 'similarity'
      };
    }
    return null;
  }
});

describe('BackendSelector - maxInputTokens with Busy Cache-Hit Backends', () => {
  let selector;

  beforeEach(() => {
    // Disable cache-hit threshold for tests (set to 0 to always enforce cache hits)
    const config = {
      prompt: {
        cache: {
          minHitThreshold: 0
        }
      }
    };
    selector = new BackendSelector(config);
  });

  describe('selectBackendWithCache() - maxInputTokens should filter busy cache-hit backends', () => {
    it('should return "busy" status when all cache-hit backends are filtered by token limit', () => {
      /**
       * Scenario:
       * - All backends have cache hit
       * - All backends are busy (activeRequestCount = 1)
       * - All backends have maxInputTokens=20000
       * - Request is 43000 tokens (exceeds all backends' limits)
       *
       * Expected: All backends filtered and busy → return 'busy' status
       *           (request will stay in queue until a backend becomes available)
       *
       * Behavior: Since no backend can handle the prompt OR is available,
       *           we correctly return 'busy' instead of 'none'
       */
      const backends = [
        createMockBackend('http://backend1:11434', true, 10, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.95 }
        }, 20000),
        createMockBackend('http://backend2:11434', true, 5, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.90 }
        }, 20000),
        createMockBackend('http://backend3:11434', true, 20, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.85 }
        }, 20000)
      ];

      // Mark all cache-hit backends as busy
      backends.forEach(b => b.activeRequestCount = 1);

      const promptTokens = 43000;
      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'qwen' },
        'large prompt text',
        promptTokens
      );

      // All cache-hit backends filtered AND all busy
      // Should return 'busy' status - request stays in queue
      expect(result.status).toBe('busy');
    });

    it('should filter backend with maxInputTokens when all cache hits are busy', () => {
      /**
       * Scenario:
       * - Backend 1 has cache hit, priority 20, maxInputTokens=20000, busy
       * - Backend 2 has cache hit, priority 10, no limit, busy
       * - Request is 43000 tokens
       *
       * Expected: Backend 1 should be filtered, Backend 2 should be selected (no limit)
       */
      const backends = [
        createMockBackend('http://backend3:11434', true, 20, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.95 }
        }, 20000),
        createMockBackend('http://backend1:11434', true, 10, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.90 }
        }, undefined)
      ];

      // Mark both as busy
      backends.forEach(b => b.activeRequestCount = 1);

      const promptTokens = 43000;
      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'qwen' },
        'large prompt text',
        promptTokens
      );

      // Backend 1 should be filtered out due to maxInputTokens
      // Backend 2 should be selected (no limit)
      expect(result.status).toBe('busy');
      expect(result.backend.url).toBe('http://backend1:11434');
    });

    it('should select available backend without cache hit when all cache-hit backends are filtered', () => {
      /**
       * Scenario:
       * - Backends 1 & 2 have cache hit, both filtered by maxInputTokens=20000, both busy
       * - Backend 3 has no cache hit, no limit, available
       * - Request is 43000 tokens
       *
       * Expected: Cache-hit backends filtered and busy, so fall through to standard
       *           selection which picks available backend 3
       */
      const backends = [
        createMockBackend('http://backend1:11434', true, 1, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.95 }
        }, 20000),
        createMockBackend('http://backend2:11434', true, 2, ['qwen'], 1, {
          'large prompt text': { model: 'qwen', similarity: 0.90 }
        }, 20000),
        createMockBackend('http://backend3:11434', true, 3, ['qwen'], 1, {}, undefined)
      ];

      // Mark cache-hit backends as busy
      backends[0].activeRequestCount = 1;
      backends[1].activeRequestCount = 1;

      const promptTokens = 43000;
      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'qwen' },
        'large prompt text',
        promptTokens
      );

      // Cache-hit backends filtered, backend 3 available - should select it
      expect(result.status).toBe('found');
      expect(result.backend.url).toBe('http://backend3:11434');
    });
  });
});
