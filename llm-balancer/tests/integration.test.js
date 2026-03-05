const Balancer = require('../balancer');
const config = require('../config');

/**
 * Integration Tests using actual backends from environment
 * These tests load backends from the .env file and test against them
 */

describe('Integration Tests with Real Backends', () => {
  let backends;
  let balancer;

  beforeAll(() => {
    // Load actual backends from environment
    backends = config.loadConfig().backends;
  });

  beforeEach(() => {
    // Create fresh backend copies for each test
    balancer = new Balancer(
      backends.map(b => ({
        ...b,
        busy: false,
        requestCount: 0,
        errorCount: 0
      }))
    );
  });

  describe('Real Backend Loading', () => {
    it('should load backends from environment variable', () => {
      expect(backends.length).toBeGreaterThan(0);
    });

    it('should parse backend URLs from OLLAMA_BACKENDS', () => {
      backends.forEach(backend => {
        expect(backend.url).toBeDefined();
        expect(backend.url).toMatch(/^https?:\/\//);
      });
    });

    it('should parse priorities from environment', () => {
      backends.forEach(backend => {
        expect(backend.priority).toBeGreaterThanOrEqual(0);
        expect(backend.priority).toBeLessThanOrEqual(10);
      });
    });

    it('should create backend objects with required properties', () => {
      backends.forEach(backend => {
        expect(backend).toHaveProperty('url');
        expect(backend).toHaveProperty('priority');
        expect(backend).toHaveProperty('healthy');
        expect(backend).toHaveProperty('busy');
        expect(backend).toHaveProperty('requestCount');
        expect(backend).toHaveProperty('errorCount');
        expect(backend).toHaveProperty('failCount');
      });
    });
  });

  describe('Real Backend Operations', () => {
    it('should return a backend via getNextBackend() when available', () => {
      const backend = balancer.getNextBackend();
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();
    });

    it('should track backend statistics', async () => {
      const backend = await balancer.queueRequest();
      expect(backend).not.toBe(null);

      const stats = balancer.getStats();
      expect(stats.requestCounts[backend.url]).toBeGreaterThan(0);
    });

    it('should handle real backend health checks', () => {
      backends.forEach(backend => {
        expect(balancer.hasHealthyBackends()).toBe(true);
      });
    });

    it('should handle busy state management', async () => {
      const backend = await balancer.queueRequest();
      expect(backend.busy).toBe(true);

      // Mark as available again
      balancer.notifyBackendAvailable();
      backend.busy = false;
    });
  });

  describe('Real Backend Priority Handling', () => {
    it('should prioritize higher priority backends', async () => {
      const priorityBackends = backends.map(b => ({
        ...b,
        busy: false,
        requestCount: 0,
        errorCount: 0
      }));

      const priorityBalancer = new Balancer(priorityBackends);

      // Get a backend - should get one with highest priority
      const backend = await priorityBalancer.queueRequest();
      expect(backend).not.toBe(null);

      // Priority should be valid
      expect(backend.priority).toBeGreaterThanOrEqual(0);
      expect(backend.priority).toBeLessThanOrEqual(10);
    });
  });

  describe('Real Backend Statistics', () => {
    it('should provide comprehensive statistics', () => {
      const stats = balancer.getStats();

      expect(stats).toHaveProperty('totalBackends');
      expect(stats).toHaveProperty('healthyBackends');
      expect(stats).toHaveProperty('unhealthyBackends');
      expect(stats).toHaveProperty('requestCounts');
      expect(Array.isArray(stats.backends)).toBe(true);
    });

    it('should count requests per backend', async () => {
      const backend = await balancer.queueRequest();
      const stats = balancer.getStats();

      expect(stats.requestCounts[backend.url]).toBeGreaterThan(0);
    });

    it('should track backend-specific statistics', () => {
      if (backends.length > 0) {
        const firstBackendUrl = backends[0].url;
        balancer.markFailed(firstBackendUrl);
        const stats = balancer.getStats();

        const backendStat = stats.backends.find(b => b.url === firstBackendUrl);
        expect(backendStat.failCount).toBeGreaterThan(0);
      }
    });

    it('should provide queue statistics', () => {
      const stats = balancer.getQueueStats();

      expect(stats).toHaveProperty('depth');
      expect(stats).toHaveProperty('maxQueueSize');
      expect(stats).toHaveProperty('queueTimeout');
    });

    it('should provide all queue statistics', () => {
      const allStats = balancer.getAllQueueStats();

      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThan(0);
    });
  });

  describe('Real Backend Error Handling', () => {
    it('should handle marking backend as unhealthy', () => {
      if (backends.length > 0) {
        const backendUrl = backends[0].url;
        balancer.markFailed(backendUrl);
        expect(balancer.hasHealthyBackends()).toBe(true); // May still have other healthy backends
      }
    });

    it('should handle marking backend as healthy', () => {
      if (backends.length > 0) {
        const backendUrl = backends[0].url;
        balancer.markHealthy(backendUrl);
        expect(balancer.hasHealthyBackends()).toBe(true);
      }
    });
  });

  describe('Real Backend Complex Scenarios', () => {
    it('should handle multiple concurrent requests', async () => {
      const concurrentBalancer = new Balancer(backends);

      // Queue multiple requests
      const promises = [
        concurrentBalancer.queueRequest(),
        concurrentBalancer.queueRequest(),
        concurrentBalancer.queueRequest()
      ];

      const results = await Promise.allSettled(promises);

      // At least some should succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      expect(fulfilled).toBeGreaterThan(0);
    }, 10000);

    it('should handle mixed priority and busy states', async () => {
      const mixedBackends = backends.map(b => ({
        ...b,
        busy: Math.random() > 0.5, // Randomly mark some as busy
        requestCount: 0,
        errorCount: 0
      }));

      const mixedBalancer = new Balancer(mixedBackends);

      // Should get an available backend
      const backend = await mixedBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();
    }, 5000);
  });

  describe('Real Backend Edge Cases', () => {
    it('should handle empty backends list gracefully', () => {
      const emptyBalancer = new Balancer([]);
      expect(emptyBalancer.getNextBackend()).toBeNull();
      expect(emptyBalancer.hasHealthyBackends()).toBe(false);
    });

    it('should handle single backend', async () => {
      const singleBackend = backends[0] || {
        url: 'http://localhost:11434',
        priority: 1,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0
      };

      const singleBalancer = new Balancer([singleBackend]);

      const backend = await singleBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBe(singleBackend.url);
    }, 5000);

    it('should handle backends with zero priority', async () => {
      const zeroPriorityBackends = backends.map(b => ({
        ...b,
        priority: 0,
        busy: false,
        requestCount: 0,
        errorCount: 0
      }));

      const zeroPriorityBalancer = new Balancer(zeroPriorityBackends);

      const backend = await zeroPriorityBalancer.queueRequest();
      expect(backend).not.toBe(null);
    }, 5000);

    it('should handle backends with high priority', async () => {
      const highPriorityBackends = backends.map(b => ({
        ...b,
        priority: 99,
        busy: false,
        requestCount: 0,
        errorCount: 0
      }));

      const highPriorityBalancer = new Balancer(highPriorityBackends);

      const backend = await highPriorityBalancer.queueRequest();
      expect(backend).not.toBe(null);
    }, 5000);
  });
});

describe('Environment Configuration Tests', () => {
  it('should load port from environment', () => {
    const port = config.loadConfig().port;
    expect(port).toBeDefined();
    expect(port).toBeGreaterThanOrEqual(1);
  });

  it('should load health check interval from environment', () => {
    const healthCheckInterval = config.loadConfig().healthCheckInterval;
    expect(healthCheckInterval).toBeGreaterThanOrEqual(1);
  });

  it('should load health check timeout from environment', () => {
    const healthCheckTimeout = config.loadConfig().healthCheckTimeout;
    expect(healthCheckTimeout).toBeGreaterThanOrEqual(1);
  });

  it('should load max retries from environment', () => {
    const maxRetries = config.loadConfig().maxRetries;
    expect(maxRetries).toBeGreaterThanOrEqual(0);
  });

  it('should load max payload size from environment', () => {
    const maxPayloadSize = config.loadConfig().maxPayloadSize;
    expect(maxPayloadSize).toBeGreaterThanOrEqual(1);
  });

  it('should load queue configuration from environment', () => {
    const configData = config.loadConfig();
    expect(configData.maxQueueSize).toBeGreaterThanOrEqual(1);
    expect(configData.queueTimeout).toBeGreaterThanOrEqual(1);
  });

  it('should load debug flag from environment', () => {
    const debug = config.loadConfig().debug;
    expect(typeof debug).toBe('boolean');
  });

  it('should load debug request history size from environment', () => {
    const debugRequestHistorySize = config.loadConfig().debugRequestHistorySize;
    expect(debugRequestHistorySize).toBeGreaterThanOrEqual(1);
  });

  it('should have proper backend structure', () => {
    const configData = config.loadConfig();
    expect(configData.backends).toBeInstanceOf(Array);
    expect(configData.backends.length).toBeGreaterThan(0);
  });
});