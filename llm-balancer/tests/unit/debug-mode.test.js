/**
 * Comprehensive tests for debug mode functionality
 * Verifies prompt cache statistics and backend performance metrics
 */

const Balancer = require('../../balancer');

describe('Debug Mode', () => {
  let backends;
  let balancerDisabled;
  let balancerEnabled;

  beforeEach(() => {
    // Helper to create mock backend with getPerformanceStats and getPromptCacheStats
    const createMockBackend = (url, priority = 1) => ({
      url,
      priority,
      healthy: true,
      busy: false,
      requestCount: 0,
      errorCount: 0,
      getPerformanceStats: () => ({
        requestCount: 0,
        timeStats: { avgTotalTimeMs: 0, avgPromptProcessingTimeMs: 0, avgGenerationTimeMs: 0 },
        tokenStats: { avgPromptTokens: null, avgCompletionTokens: null, avgTotalTokens: null },
        rateStats: { totalRate: null, promptRate: null, generationRate: null }
      }),
      getPromptCacheStats: () => ({
        hits: 0,
        misses: 0,
        evictions: 0,
        idMatches: 0,
        similarityMatches: 0,
        size: 0,
        maxSize: 5,
        cachedPrompts: []
      })
    });

    backends = [
      createMockBackend('http://backend1:11434', 1),
      createMockBackend('http://backend2:11434', 2)
    ];

    // Create balancer with debug disabled (default)
    balancerDisabled = new Balancer(backends, 100, 30000, false);

    // Create balancer with debug enabled
    balancerEnabled = new Balancer(backends, 100, 30000, true, 50);
  });

  describe('Debug Mode Initialization', () => {
    it('should disable tracking when debug is false', () => {
      expect(balancerDisabled.debug).toBe(false);
    });

    it('should enable tracking when debug is true', () => {
      expect(balancerEnabled.debug).toBe(true);
    });

    it('should have queue tracking enabled', () => {
      expect(balancerEnabled.queue).toBeDefined();
      expect(Array.isArray(balancerEnabled.queue)).toBe(true);
    });
  });

  describe('getDebugStats', () => {
    it('should return enabled:false when debug is disabled', () => {
      const stats = balancerDisabled.getDebugStats();
      expect(stats.enabled).toBe(false);
    });

    it('should return enabled:true when debug is enabled', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats.enabled).toBe(true);
    });

    it('should include queueSize in stats when debug is enabled', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(typeof stats.queueSize).toBe('number');
    });

    it('should include backendStats in stats when debug is enabled', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats.backendStats).toBeDefined();
      expect(Array.isArray(stats.backendStats)).toBe(true);
      expect(stats.backendStats.length).toBe(2); // Two mock backends
    });

    it('should include performanceStats for each backend', () => {
      const stats = balancerEnabled.getDebugStats();
      stats.backendStats.forEach(backend => {
        expect(backend.performanceStats).toBeDefined();
        expect(backend.performanceStats.requestCount).toBeDefined();
        expect(backend.performanceStats.timeStats).toBeDefined();
        expect(backend.performanceStats.tokenStats).toBeDefined();
        expect(backend.performanceStats.rateStats).toBeDefined();
      });
    });

    it('should include promptCacheStats for each backend', () => {
      const stats = balancerEnabled.getDebugStats();
      stats.backendStats.forEach(backend => {
        expect(backend.promptCacheStats).toBeDefined();
        expect(backend.promptCacheStats.hits).toBeDefined();
        expect(backend.promptCacheStats.misses).toBeDefined();
        expect(backend.promptCacheStats.evictions).toBeDefined();
        expect(backend.promptCacheStats.size).toBeDefined();
        expect(backend.promptCacheStats.maxSize).toBeDefined();
      });
    });

    it('should include url for each backend in stats', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats.backendStats[0].url).toBe('http://backend1:11434');
      expect(stats.backendStats[1].url).toBe('http://backend2:11434');
    });

    it('should include requestCount for each backend in stats', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats.backendStats[0].requestCount).toBeDefined();
      expect(stats.backendStats[1].requestCount).toBeDefined();
    });
  });

  describe('Debug Stats Structure', () => {
    it('should have correct top-level structure when debug enabled', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('backendStats');
    });

    it('should have correct backendStats structure when debug enabled', () => {
      const stats = balancerEnabled.getDebugStats();
      const backend = stats.backendStats[0];
      expect(backend).toHaveProperty('url');
      expect(backend).toHaveProperty('requestCount');
      expect(backend).toHaveProperty('performanceStats');
      expect(backend).toHaveProperty('promptCacheStats');
    });

    it('should have correct performanceStats structure', () => {
      const stats = balancerEnabled.getDebugStats();
      const perfStats = stats.backendStats[0].performanceStats;
      expect(perfStats).toHaveProperty('requestCount');
      expect(perfStats).toHaveProperty('timeStats');
      expect(perfStats).toHaveProperty('tokenStats');
      expect(perfStats).toHaveProperty('rateStats');
    });

    it('should have correct promptCacheStats structure', () => {
      const stats = balancerEnabled.getDebugStats();
      const cacheStats = stats.backendStats[0].promptCacheStats;
      expect(cacheStats).toHaveProperty('hits');
      expect(cacheStats).toHaveProperty('misses');
      expect(cacheStats).toHaveProperty('evictions');
      expect(cacheStats).toHaveProperty('idMatches');
      expect(cacheStats).toHaveProperty('similarityMatches');
      expect(cacheStats).toHaveProperty('size');
      expect(cacheStats).toHaveProperty('maxSize');
      expect(cacheStats).toHaveProperty('cachedPrompts');
    });

    it('should have correct timeStats structure', () => {
      const stats = balancerEnabled.getDebugStats();
      const timeStats = stats.backendStats[0].performanceStats.timeStats;
      expect(timeStats).toHaveProperty('avgTotalTimeMs');
      expect(timeStats).toHaveProperty('avgPromptProcessingTimeMs');
      expect(timeStats).toHaveProperty('avgGenerationTimeMs');
    });

    it('should have correct tokenStats structure', () => {
      const stats = balancerEnabled.getDebugStats();
      const tokenStats = stats.backendStats[0].performanceStats.tokenStats;
      expect(tokenStats).toHaveProperty('avgPromptTokens');
      expect(tokenStats).toHaveProperty('avgCompletionTokens');
      expect(tokenStats).toHaveProperty('avgTotalTokens');
    });

    it('should have correct rateStats structure', () => {
      const stats = balancerEnabled.getDebugStats();
      const rateStats = stats.backendStats[0].performanceStats.rateStats;
      expect(rateStats).toHaveProperty('totalRate');
      expect(rateStats).toHaveProperty('promptRate');
      expect(rateStats).toHaveProperty('generationRate');
    });
  });

  describe('Queue Stats in Debug Mode', () => {
    it('should return queueSize: 0 when queue is empty', () => {
      const stats = balancerEnabled.getDebugStats();
      expect(stats.queueSize).toBe(0);
    });

    it('should return queueSize matching actual queue length', () => {
      balancerEnabled.queue.push({ request: 'test' });
      const stats = balancerEnabled.getDebugStats();
      expect(stats.queueSize).toBe(1);
    });

    it('should update queueSize when items are added/removed', () => {
      balancerEnabled.queue.push({ request: 'test1' });
      balancerEnabled.queue.push({ request: 'test2' });
      let stats = balancerEnabled.getDebugStats();
      expect(stats.queueSize).toBe(2);

      balancerEnabled.queue.pop();
      stats = balancerEnabled.getDebugStats();
      expect(stats.queueSize).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty backend list when debug enabled', () => {
      const emptyBalancer = new Balancer([], 100, 30000, true);
      const stats = emptyBalancer.getDebugStats();
      expect(stats.enabled).toBe(true);
      expect(stats.backendStats).toEqual([]);
      expect(typeof stats.queueSize).toBe('number');
    });

    it('should handle undefined values in stats gracefully', () => {
      const mockBackend = {
        url: 'http://test:11434',
        healthy: true,
        requestCount: undefined,
        getPerformanceStats: () => null,
        getPromptCacheStats: () => null
      };
      const balancer = new Balancer([mockBackend], 100, 30000, true);
      expect(() => balancer.getDebugStats()).not.toThrow();
    });
  });
});
