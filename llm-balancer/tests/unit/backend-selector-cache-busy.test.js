/**
 * Test: Cache Hit Should Prioritize Same Backend Even When Busy
 *
 * This test verifies the expected behavior: when a backend has a prompt cache hit
 * for a given request, that backend should be selected even if it's currently busy.
 *
 * Current Bug: The backend is filtered out when busy, causing requests to be
 * distributed to other backends, defeating the purpose of prompt caching.
 *
 * See: backend-selector.js, method selectBackendWithCache()
 */

const { BackendSelector } = require('../../backend-selector');

/**
 * Create a mock backend with cache behavior
 */
const createMockBackend = (url, healthy, priority, models, maxConcurrency = 1, cacheData = {}) => ({
  url,
  healthy,
  priority: priority || 0,
  activeRequestCount: 0,
  maxConcurrency,
  getApiTypes: () => ['openai'],
  getModels: () => models || [],
  /**
   * Mock cache matching
   * Returns cache match if prompt exists in cacheData, otherwise null
   */
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

describe('BackendSelector - Cache Hit with Busy Backend', () => {
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

  describe('selectBackendWithCache() - Priority should be given to cache-hit backends', () => {
    it('should select the cache-hit backend even when it is at max concurrency', () => {
      /**
       * Scenario:
       * - Backend 1 has a cache hit for prompt "write a story" (similarity 0.95)
       * - Backend 1 is currently at max concurrency (busy)
       * - Backend 2 is available but has no cache hit
       *
       * Expected: Backend 1 should be selected (status 'busy') so the request can queue
       *           for the same backend that has the cache hit
       *
       * Current Bug: Backend 1 is filtered out because it's busy, Backend 2 is selected
       */
      const backends = [
        createMockBackend('http://cache-hit:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://available:11434', true, 2, ['llama3'], 1, {})
      ];

      // Mark Backend 1 as busy (at max concurrency)
      backends[0].activeRequestCount = 1;

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // CRITICAL ASSERTION: Backend 1 (cache-hit) should be selected, not Backend 2
      expect(result.backend.url).toBe('http://cache-hit:11434');
      expect(result.status).toBe('busy'); // Backend is busy, but it's the cache-hit one
    });

    it('should queue for cache-hit backend when it is busy, not distribute to other backends', () => {
      /**
       * Scenario:
       * - Multiple backends, only Backend 1 has a cache hit
       * - Backend 1 is busy
       * - All other backends are available but have no cache hit
       *
       * Expected: All requests should target Backend 1 (the cache-hit backend)
       *           and queue until it's available
       *
       * Current Bug: Requests are distributed to available backends (2, 3, 4...)
       */
      const backends = [
        createMockBackend('http://cache-hit:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://available1:11434', true, 5, ['llama3'], 1, {}),
        createMockBackend('http://available2:11434', true, 4, ['llama3'], 1, {}),
        createMockBackend('http://available3:11434', true, 3, ['llama3'], 1, {})
      ];

      // Mark Backend 1 as busy
      backends[0].activeRequestCount = 1;

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // All 10 requests should target Backend 1 (the cache-hit backend)
      // Current bug: Some go to available1, available2, available3
      expect(result.backend.url).toBe('http://cache-hit:11434');
    });

    it('should prefer cache-hit backend over higher-priority backend when cache-hit is available', () => {
      /**
       * Scenario:
       * - Backend 1 has cache hit, priority 1
       * - Backend 2 has no cache hit, priority 5 (higher)
       * - Both are available
       *
       * Expected: Backend 1 should be selected (cache hit wins over priority)
       */
      const backends = [
        createMockBackend('http://cache-hit:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://high-prio:11434', true, 5, ['llama3'], 1, {})
      ];

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://cache-hit:11434');
      expect(result.status).toBe('found');
    });

    it('should select cache-hit backend when it is available, even if other backends have higher priority', () => {
      /**
       * Scenario:
       * - Backend 1 has cache hit, priority 1, available
       * - Backend 2 has no cache hit, priority 5, but busy
       * - Backend 3 has no cache hit, priority 3, available
       *
       * Expected: Backend 1 should be selected (cache hit wins)
       */
      const backends = [
        createMockBackend('http://cache-hit:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://high-prio-busy:11434', true, 5, ['llama3'], 1, {}),
        createMockBackend('http://mid-prio:11434', true, 3, ['llama3'], 1, {})
      ];

      backends[1].activeRequestCount = 1; // Backend 2 is busy

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      expect(result.backend.url).toBe('http://cache-hit:11434');
      expect(result.status).toBe('found');
    });

    it('should handle multiple cache hits across backends - select highest priority available', () => {
      /**
       * Scenario:
       * - Backend 1 has cache hit, priority 1, available
       * - Backend 2 has cache hit, priority 5, available
       * - Backend 3 has cache hit, priority 3, busy
       *
       * Expected: Backend 2 should be selected (highest priority among available cache hits)
       */
      const backends = [
        createMockBackend('http://cache-hit1:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://cache-hit2:11434', true, 5, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        }),
        createMockBackend('http://cache-hit3:11434', true, 3, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.85 }
        })
      ];

      backends[2].activeRequestCount = 1; // Backend 3 is busy

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Backend 2 has highest priority (5) among available cache hits
      expect(result.backend.url).toBe('http://cache-hit2:11434');
      expect(result.status).toBe('found');
    });

    it('should handle the 10-request concurrent scenario - all should target cache-hit backend', () => {
      /**
       * This test reproduces the real-world scenario that was observed:
       * 10 concurrent requests with the same prompt
       *
       * Expected: All 10 requests should target Backend 1 (cache-hit)
       *           and queue until it's available, achieving ~90%+ cache hit rate
       *
       * Current Bug: Requests are distributed across all available backends,
       *              resulting in only ~50% cache hit rate
       */
      const backends = [
        createMockBackend('http://cache-hit:11434', true, 1, ['llama3'], 1, {
          'What is the capital of France?': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://available1:11434', true, 5, ['llama3'], 1, {}),
        createMockBackend('http://available2:11434', true, 4, ['llama3'], 1, {}),
        createMockBackend('http://available3:11434', true, 3, ['llama3'], 1, {}),
        createMockBackend('http://available4:11434', true, 2, ['llama3'], 1, {})
      ];

      // Backend 1 is busy with first request
      backends[0].activeRequestCount = 1;

      // Simulate 10 concurrent requests
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = selector.selectBackendWithCache(
          backends,
          { modelString: 'llama3' },
          'What is the capital of France?'
        );
        results.push(result);
      }

      // ALL 10 requests should target Backend 1 (cache-hit backend)
      // With current bug, some go to available1, available2, etc.
      const cacheHitBackend = backends[0].url;
      const allTargetCacheHit = results.every(r => r.backend.url === cacheHitBackend);

      expect(allTargetCacheHit).toBe(true);
      expect(results.filter(r => r.backend.url === cacheHitBackend).length).toBe(10);
    });
  });

  describe('Integration with Balancer queue', () => {
    it('should queue for cache-hit backend and assign it when available', async () => {
      /**
       * Full integration test:
       * 1. Pre-populate Backend 1 cache
       * 2. Both backends busy initially
       * 3. Request queues for cache-hit backend (backend1)
       * 4. Backend 1 becomes available (activeRequestCount decremented)
       * 5. Request is assigned to Backend 1 (cache hit)
       */
      const Balancer = require('../../balancer');

      // Create backends with cache (using mock backend pattern)
      const backend1 = {
        url: 'http://cache-backend:11434',
        healthy: true,
        priority: 1,
        activeRequestCount: 0,
        maxConcurrency: 1,
        getApiTypes: () => ['openai'],
        getModels: () => ['test-model'],
        /**
         * Mock cache matching
         */
        findCacheMatch: (prompt, model) => {
          if (prompt === 'test prompt' && model === 'test-model') {
            return { entry: {}, similarity: 0.95, matchType: 'similarity' };
          }
          return null;
        }
      };

      const backend2 = {
        url: 'http://other-backend:11434',
        healthy: true,
        priority: 2,
        activeRequestCount: 0,
        maxConcurrency: 1,
        getApiTypes: () => ['openai'],
        getModels: () => ['test-model'],
        findCacheMatch: () => null // No cache
      };

      const balancer = new Balancer([backend1, backend2], { maxQueueSize: 10, queue: { timeout: 5000 }, debug: { enabled: false }, debugRequestHistorySize: 100 });

      // Mark both backends as busy initially
      backend1.activeRequestCount = 1;
      backend2.activeRequestCount = 1;

      // Queue a request - this will queue since both are busy
      const promise = balancer.queueRequest();

      // Verify queue depth increased
      expect(balancer.getQueueStats().depth).toBe(1);

      // Simulate backend1 becoming available (by decrementing activeRequestCount)
      backend1.activeRequestCount = 0;

      // Trigger queue processing - this should find the cache-hit backend
      balancer.notifyBackendAvailable();

      // The promise should resolve with backend1 (cache-hit)
      const assignedBackend = await promise;

      expect(assignedBackend.url).toBe('http://cache-backend:11434');
    });
  });
});