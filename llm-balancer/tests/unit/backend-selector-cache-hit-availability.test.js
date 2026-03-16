/**
 * Test: Lower Priority Cache-Hit Should Be Selected When Higher Priority Is Busy
 *
 * Bug Scenario:
 * - Backend1 has cache hit, priority 10, busy
 * - Backend2 has cache hit, priority 20, available
 *
 * Expected: Backend2 should be selected (it has cache hit and is available)
 * Current Bug: Backend1 is selected with status='busy', even though Backend2 is available
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

describe('BackendSelector - Available Cache-Hit When Higher Priority Is Busy', () => {
  let selector;

  beforeEach(() => {
    selector = new BackendSelector();
  });

  describe('selectBackendWithCache() - Should select available cache-hit over busy cache-hit', () => {
    it('should select lower-priority cache-hit backend when higher-priority cache-hit is busy', () => {
      /**
       * Scenario:
       * - Backend1: has cache hit (similarity 95%), priority 10, busy (activeRequestCount=maxConcurrency)
       * - Backend2: has cache hit (similarity 90%), priority 20, available
       *
       * Expected: Backend2 should be selected with status='found'
       *           It has a cache hit and is available, even though lower priority
       *
       * Current Bug: Backend1 is selected with status='busy'
       *              because the code returns the highest priority cache-hit
       *              without checking if other cache-hits are available
       */
      const backends = [
        createMockBackend('http://high-prio-cache:11434', true, 10, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://low-prio-cache:11434', true, 20, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        })
      ];

      // Mark Backend1 as busy (at max concurrency)
      backends[0].activeRequestCount = 1;

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // ASSERTION: Backend2 (available cache-hit) should be selected
      expect(result.backend.url).toBe('http://low-prio-cache:11434');
      expect(result.status).toBe('found'); // Available, not busy
    });

    it('should select any available cache-hit, not just highest priority', () => {
      /**
       * Scenario:
       * - Backend1: has cache hit, priority 1, busy
       * - Backend2: has cache hit, priority 5, available
       * - Backend3: has cache hit, priority 3, available
       *
       * Expected: Backend2 (highest priority among available cache-hits) should be selected
       */
      const backends = [
        createMockBackend('http://cache1:11434', true, 1, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://cache2:11434', true, 5, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        }),
        createMockBackend('http://cache3:11434', true, 3, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.85 }
        })
      ];

      // Mark Backend1 as busy
      backends[0].activeRequestCount = 1;

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Backend2 has highest priority (5) among available cache-hits
      expect(result.backend.url).toBe('http://cache2:11434');
      expect(result.status).toBe('found');
    });

    it('should NOT select busy cache-hit when available cache-hits exist', () => {
      /**
       * Scenario:
       * - Backend1: has cache hit, priority 5, busy
       * - Backend2: has cache hit, priority 3, available
       *
       * Expected: Backend2 should be selected
       *
       * Current Bug: The code may return Backend1 with status='busy'
       *              because it only filters for available cache-hits after
       *              finding cache matches, but then sorts all cache-matches
       *              without re-checking availability
       */
      const backends = [
        createMockBackend('http://busy-cache:11434', true, 5, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://available-cache:11434', true, 3, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        })
      ];

      backends[0].activeRequestCount = 1; // Backend1 is busy

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Backend2 (available cache-hit) should be selected, not Backend1
      expect(result.backend.url).not.toBe('http://busy-cache:11434');
      expect(result.backend.url).toBe('http://available-cache:11434');
      expect(result.status).toBe('found');
    });
  });

  describe('Edge Cases', () => {
    it('should return busy status only when ALL cache-hits are busy', () => {
      /**
       * Scenario:
       * - Backend1: has cache hit, priority 10, busy
       * - Backend2: has cache hit, priority 20, busy
       *
       * Expected: Any cache-hit backend should be selected with status='busy'
       *           because there are NO available cache-hits
       */
      const backends = [
        createMockBackend('http://busy1:11434', true, 10, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://busy2:11434', true, 20, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        })
      ];

      backends[0].activeRequestCount = 1; // Busy
      backends[1].activeRequestCount = 1; // Busy

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Should return a busy backend (both are busy)
      expect(result.status).toBe('busy');
      // Either backend is acceptable since both are busy
      expect(result.backend.url).toMatch(/busy\d/);
    });

    it('should prefer higher priority among available cache-hits', () => {
      /**
       * Scenario:
       * - Backend1: has cache hit, priority 5, available
       * - Backend2: has cache hit, priority 10, available
       *
       * Expected: Backend2 (higher priority) should be selected
       */
      const backends = [
        createMockBackend('http://low-prio:11434', true, 5, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.95 }
        }),
        createMockBackend('http://high-prio:11434', true, 10, ['llama3'], 1, {
          'write a story': { model: 'llama3', similarity: 0.90 }
        })
      ];

      // Both are available

      const result = selector.selectBackendWithCache(
        backends,
        { modelString: 'llama3' },
        'write a story'
      );

      // Backend2 has higher priority (10)
      expect(result.backend.url).toBe('http://high-prio:11434');
      expect(result.status).toBe('found');
    });
  });
});
