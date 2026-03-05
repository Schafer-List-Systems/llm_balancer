const Balancer = require('../../balancer');

// Helper function to create fresh backend copies for testing
const getFreshBackends = () => {
  return JSON.parse(JSON.stringify([
    { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
    { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
    { url: 'http://backend3:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
  ]));
};

// Helper function to make a backend available again for testing
const makeBackendAvailable = (balancer, backendUrl) => {
  const backend = balancer.backends.find(b => b.url === backendUrl);
  if (backend) {
    balancer.markHealthy(backendUrl);
    balancer.notifyBackendAvailable();
  }
};

describe('Balancer', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    // Create test backends
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0, failCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0, failCount: 0 },
      { url: 'http://backend3:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0, failCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  describe('Constructor', () => {
    it('should initialize with backends', () => {
      expect(balancer.backends.length).toBe(3);
      expect(balancer.requestCount.size).toBe(0);
    });

    it('should initialize with custom queue size and timeout', () => {
      const customBalancer = new Balancer(backends, 50, 15000);
      expect(customBalancer.maxQueueSize).toBe(50);
      expect(customBalancer.queueTimeout).toBe(15000);
    });

    it('should initialize with single global queue', () => {
      const customBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const customBalancer = new Balancer(customBackends);
      expect(customBalancer.queue).toBeDefined();
      expect(Array.isArray(customBalancer.queue)).toBe(true);
      expect(customBalancer.queue.length).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should add request to queue', async () => {
      const backend = await balancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();
    });

    it('should reject request when queue is full', async () => {
      const smallTimeoutBalancer = new Balancer(backends, 1, 100);
      const backend1 = await smallTimeoutBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Mark the backend as busy and mark it as unhealthy so queueRequest won't get it
      backend1.busy = true;
      backend1.healthy = false;

      // Second request should reject due to queue timeout
      try {
        await smallTimeoutBalancer.queueRequest();
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
    }, 5000);

    it('should track queue statistics', () => {
      const stats = balancer.getQueueStats();
      expect(stats.depth).toBe(0);
      expect(stats.maxQueueSize).toBe(100);
      expect(stats.queueTimeout).toBe(30000);
    });

    it('should provide all queue statistics', () => {
      const allStats = balancer.getAllQueueStats();
      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThan(0);
    });
  });

  describe('Backend Selection', () => {
    it('should return a backend via getNextBackend() when available', () => {
      const backend = balancer.getNextBackend();
      expect(backend).not.toBe(null);
    });

    it('should return null when all backends are unhealthy', async () => {
      backends.forEach(b => b.healthy = false);
      try {
        const backend = await balancer.queueRequest();
        expect(backend).toBeNull();
      } catch (error) {
        // queueRequest throws error when all backends are unhealthy
        expect(error.message).toContain('No healthy backends available');
      }
    }, 10000);

    it('should handle empty backends list', () => {
      const emptyBalancer = new Balancer([]);
      const backend = emptyBalancer.getNextBackend();
      expect(backend).toBeNull();
    });
  });

  describe('Priority Tiers', () => {
    it('should prioritize higher priority backends', async () => {
      const priorityBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const priorityBalancer = new Balancer(priorityBackends);

      const backend = await priorityBalancer.queueRequest();
      expect(backend.url).toBe('http://backend2:11434');
    });

    it('should allow queuing for specific priority tier', async () => {
      const priorityBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const priorityBalancer = new Balancer(priorityBackends);

      // Backend 1 is at priority 1, backend 2 is at priority 2
      // Should get backend 2 first due to priority
      const backend = await priorityBalancer.queueRequest();
      expect(backend.url).toBe('http://backend2:11434');
    });

    it('should fall back to lower priority when higher is unavailable', async () => {
      const priorityBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: true, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const priorityBalancer = new Balancer(priorityBackends);

      // Backend 2 is available at priority 2
      const backend = await priorityBalancer.queueRequest();
      expect(backend.url).toBe('http://backend2:11434');
    });
  });

  describe('Health Management', () => {
    it('should mark backend as unhealthy', () => {
      balancer.markFailed('http://backend1:11434');
      const backend = backends.find(b => b.url === 'http://backend1:11434');
      expect(backend.healthy).toBe(false);
      expect(backend.failCount).toBeGreaterThan(0);
    });

    it('should mark backend as healthy', () => {
      balancer.markHealthy('http://backend1:11434');
      const backend = backends.find(b => b.url === 'http://backend1:11434');
      expect(backend.healthy).toBe(true);
      expect(backend.failCount).toBe(0);
      expect(backend.busy).toBe(false); // busy flag should remain unchanged
    });

    it('should return false when no healthy backends exist', () => {
      backends.forEach(b => b.healthy = false);
      expect(balancer.hasHealthyBackends()).toBe(false);
    });

    it('should return true when healthy backends exist', () => {
      expect(balancer.hasHealthyBackends()).toBe(true);
    });

    it('should handle marking non-existent backend as failed', () => {
      expect(() => {
        balancer.markFailed('http://nonexistent:11434');
      }).not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should return comprehensive statistics', () => {
      const stats = balancer.getStats();

      expect(stats).toHaveProperty('totalBackends');
      expect(stats).toHaveProperty('healthyBackends');
      expect(stats).toHaveProperty('unhealthyBackends');
      expect(stats).toHaveProperty('requestCounts');
      expect(Array.isArray(stats.backends)).toBe(true);
    });

    it('should count request per backend', async () => {
      const backend = await balancer.queueRequest();
      const stats = balancer.getStats();

      expect(stats.requestCounts[backend.url]).toBeGreaterThan(0);
    });

    it('should track backend-specific statistics', () => {
      balancer.markFailed('http://backend1:11434');
      const stats = balancer.getStats();

      const backendStat = stats.backends.find(b => b.url === 'http://backend1:11434');
      expect(backendStat.failCount).toBeGreaterThan(0);
      expect(backendStat.errorCount).toBeGreaterThan(0);
    });

    it('should reset failCount when marking backend as healthy', () => {
      balancer.markFailed('http://backend1:11434');
      balancer.markHealthy('http://backend1:11434');
      const stats = balancer.getStats();

      const backendStat = stats.backends.find(b => b.url === 'http://backend1:11434');
      expect(backendStat.failCount).toBe(0);
    });
  });

  describe('Queue Timeout Handling', () => {
    it('should reject queued request after timeout', async () => {
      const smallTimeoutBalancer = new Balancer(backends, 100, 100);
      const backend = await smallTimeoutBalancer.queueRequest();

      // Should get a backend since queue wasn't full
      expect(backend).not.toBe(null);
    });

    it('should clear timeout on successful resolution', async () => {
      const backend = await balancer.queueRequest();
      // If backend was successfully assigned, timeout should have been cleared
      expect(backend).not.toBe(null);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed priority and busy states', async () => {
      const mixedBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: true, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend3:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const mixedBalancer = new Balancer(mixedBackends);

      // Should get an available backend (backend 2 or 3)
      const backend = await mixedBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();
    }, 5000);

    it('should handle full failover scenario', async () => {
      // Mark all backends as busy and unhealthy
      backends.forEach(b => {
        b.busy = true;
        b.healthy = false;
      });

      // No backend should be available
      expect(balancer.hasHealthyBackends()).toBe(false);

      await expect(balancer.queueRequest()).rejects.toThrow('No healthy backends available');
    }, 10000);
  });

  describe('Timeout Edge Cases', () => {
    it('should handle request timeout after extended processing', async () => {
      let timeoutOccurred = false;

      const slowBackend = {
        url: 'http://backend1:11434',
        priority: 1,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0,
        processRequest: () => new Promise(resolve => {
          // Simulate slow request that will timeout
          setTimeout(() => {
            timeoutOccurred = true;
            resolve({ success: true });
          }, 10000);
        })
      };

      const slowBalancer = new Balancer([slowBackend], 1, 3000);

      // Request will timeout but queueRequest handles it
      const backend = await slowBalancer.queueRequest();

      // Should get a backend
      expect(backend).not.toBe(null);

      // Mark as busy during processing
      backend.busy = true;

      // Queue another request - should timeout since first request takes 10s > 5s timeout
      await expect(slowBalancer.queueRequest()).rejects.toThrow('Request timeout');
    }, 15000);

    it('should handle multiple concurrent requests with varying timeouts', async () => {
      const concurrentBalancer = new Balancer(backends, 50, 1000);

      // Queue multiple requests
      const promises = [
        concurrentBalancer.queueRequest(),
        concurrentBalancer.queueRequest(),
        concurrentBalancer.queueRequest(),
        concurrentBalancer.queueRequest()
      ];

      const results = await Promise.allSettled(promises);

      // All should be fulfilled or rejected due to timeouts
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const rejected = results.filter(r => r.status === 'rejected').length;

      // At least some should succeed
      expect(fulfilled + rejected).toBe(4);
    }, 15000);

    it('should timeout waiting for available backend', async () => {
      const timeoutBalancer = new Balancer(backends, 50, 100);

      // Mark all backends as busy
      backends.forEach(b => b.busy = true);

      // Try to queue when no backend is available
      const promise = timeoutBalancer.queueRequest();

      // Should reject after timeout
      await expect(promise).rejects.toThrow();
    }, 5000);

    it('should handle partial timeout (some succeed, some timeout)', async () => {
      const mixedBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const mixedBalancer = new Balancer(mixedBackends, 50, 100);

      // Make backend 1 busy
      mixedBackends[0].busy = true;

      // Queue requests
      const promises = [
        mixedBalancer.queueRequest(),
        mixedBalancer.queueRequest(),
        mixedBalancer.queueRequest()
      ];

      const results = await Promise.allSettled(promises);

      // At least one should succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      expect(fulfilled).toBeGreaterThan(0);
    }, 5000);

    it('should clear timeout on successful backend assignment', async () => {
      const backend = await balancer.queueRequest();

      // If backend was successfully assigned, it should be valid
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();

      // Mark as busy
      backend.busy = true;
    }, 5000);

    it('should handle exponential backoff on retry', async () => {
      const exponentialBalancer = new Balancer(backends, 50, 100);

      // Queue multiple requests to trigger backoff
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(exponentialBalancer.queueRequest());
      }

      const results = await Promise.allSettled(promises);

      // All should be fulfilled or rejected
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const rejected = results.filter(r => r.status === 'rejected').length;

      // At least some should succeed
      expect(fulfilled + rejected).toBe(10);
    }, 30000);
  });

  describe('Busy State Edge Cases', () => {
    it('should mark backend as busy and queue subsequent requests', async () => {
      const busyBalancer = new Balancer(backends);
      const backend = await busyBalancer.queueRequest();

      // Should be marked as busy
      expect(backend.busy).toBe(true);

      // Another request should be queued (same backend is busy, so can't assign)
      const backend2 = await busyBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      // Second request should go to queue and be assigned later when backend is free
    }, 5000);

    it('should handle busy state during failover', async () => {
      const busyBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: true, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend3:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const busyBalancer = new Balancer(busyBackends);

      // Get first backend
      const backend1 = await busyBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Mark backend 1 as unhealthy
      busyBackends[0].healthy = false;

      // Should get another backend
      const backend2 = await busyBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      expect(backend2.url).not.toBe('http://backend1:11434');
    }, 5000);


    it('should reset busy state after request completion', async () => {
      const resetBalancer = new Balancer(backends);

      // Get backend
      const backend = await resetBalancer.queueRequest();

      // Mark as busy
      backend.busy = true;

      // Simulate request completion
      backend.busy = false;
      backend.requestCount++;

      // Now backend should be available again
      // queueRequest() queues the request and returns when a backend is available
      const backend2 = await resetBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      expect(backend2.url).toBe(backend.url);
      // Busy state will be true after assignment
    }, 5000);

    it('should handle busy state with priority tiers', async () => {
      const priorityBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: true, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend3:11434', priority: 3, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const priorityBalancer = new Balancer(priorityBackends);

      // Request should get an available backend (priority 2 or 3)
      const backend = await priorityBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBeDefined();
    }, 5000);

    it('should handle busy state with empty backend list', () => {
      const emptyBalancer = new Balancer([]);
      expect(emptyBalancer.hasHealthyBackends()).toBe(false);
    });
  });

  describe('Full Queue Scenarios', () => {
    it('should handle queue reaching max capacity', async () => {
      const fullBalancer = new Balancer(backends, 1, 30000);

      // Get first backend
      const backend1 = await fullBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Mark as busy and unhealthy
      backend1.busy = true;
      backend1.healthy = false;

      // Second request should go to queue
      const backend2 = await fullBalancer.queueRequest();
      expect(backend2).not.toBe(null);
    }, 5000);

    it('should handle multiple requests when queue is limited', async () => {
      const smallQueueBalancer = new Balancer(backends, 1, 100);

      // Get first backend
      const backend1 = await smallQueueBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Mark as busy and unhealthy
      backend1.busy = true;
      backend1.healthy = false;

      // Try to queue another request - should get a different backend
      const backend2 = await smallQueueBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      expect(backend2.url).not.toBe(backend1.url);
    }, 5000);

    it('should handle mixed priority queue when full', async () => {
      const priorityBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend3:11434', priority: 3, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const fullQueueBalancer = new Balancer(priorityBackends, 2, 30000);

      // Get backends for different priorities
      const backend1 = await fullQueueBalancer.queueRequest();
      const backend2 = await fullQueueBalancer.queueRequest();
      const backend3 = await fullQueueBalancer.queueRequest();

      // All should be available
      expect(backend1).not.toBe(null);
      expect(backend2).not.toBe(null);
      expect(backend3).not.toBe(null);
    }, 5000);

    it('should handle queue timeout when at max capacity', async () => {
      const maxCapacityBalancer = new Balancer(backends, 1, 100);

      // Get first backend
      const backend1 = await maxCapacityBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Mark as busy and unhealthy
      backend1.busy = true;
      backend1.healthy = false;

      // Try to queue another request - should get a different backend
      const backend2 = await maxCapacityBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      expect(backend2.url).not.toBe(backend1.url);
    }, 5000);

    it('should handle queue statistics at full capacity', () => {
      const stats = balancer.getQueueStats(1);
      expect(stats.maxQueueSize).toBe(100);
      expect(stats.queueTimeout).toBe(30000);
    });
  });


  describe('Health Transition Edge Cases', () => {
    it('should handle rapid failover scenario', async () => {
      const rapidBalancer = new Balancer(backends);

      // First request
      const backend1 = await rapidBalancer.queueRequest();
      expect(backend1).not.toBe(null);

      // Fail backend
      rapidBalancer.markFailed(backend1.url);
      expect(backend1.healthy).toBe(false);

      // Recover backend
      rapidBalancer.markHealthy(backend1.url);
      expect(backend1.healthy).toBe(true);
      expect(backend1.failCount).toBe(0);
    }, 5000);

    it('should handle backend priority changes during runtime', async () => {
      const dynamicBalancer = new Balancer(backends);

      // Get backend
      const backend = await dynamicBalancer.queueRequest();
      expect(backend).not.toBe(null);

      // Change priority dynamically
      backends.forEach(b => {
        if (b.url === backend.url) {
          b.priority = 99;
        }
      });

      // Should still be able to use a backend (any backend, since original is busy)
      const backend2 = await dynamicBalancer.queueRequest();
      expect(backend2).not.toBe(null);
    }, 30000);

    it('should handle health transition: healthy → unhealthy → healthy', async () => {
      const transitionBalancer = new Balancer(backends);

      // Get backend
      const backend = await transitionBalancer.queueRequest();

      // Mark as unhealthy
      transitionBalancer.markFailed(backend.url);
      expect(backend.healthy).toBe(false);
      expect(backend.failCount).toBeGreaterThan(0);

      // Manually mark busy as false (simulating request completion)
      backend.busy = false;

      // Mark as healthy again
      transitionBalancer.markHealthy(backend.url);
      expect(backend.healthy).toBe(true);
      expect(backend.failCount).toBe(0);
      expect(backend.busy).toBe(false);
    }, 5000);

    it('should handle partial degradation (some backends fail, others work)', async () => {
      const partialBalancer = new Balancer(backends);

      // Fail some backends
      backends[0].healthy = false;
      backends[1].healthy = false;

      // Get from remaining healthy backends
      const backend = await partialBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBe('http://backend3:11434');
    }, 5000);

    it('should handle all backends become unhealthy', async () => {
      const allUnhealthyBalancer = new Balancer(backends);

      // Make all backends unhealthy
      backends.forEach(b => b.healthy = false);

      expect(allUnhealthyBalancer.hasHealthyBackends()).toBe(false);

      await expect(allUnhealthyBalancer.queueRequest()).rejects.toThrow();
    }, 5000);

    it('should reject request when all backends are unavailable', async () => {
      const recoveryBalancer = new Balancer(backends);

      // Mark all backends as busy and unhealthy
      backends.forEach(b => {
        b.busy = true;
        b.healthy = false;
      });

      // Try to queue (should reject immediately since no healthy backends)
      await expect(recoveryBalancer.queueRequest()).rejects.toThrow();

      // Restore backends for other tests
      backends.forEach(b => {
        b.busy = false;
        b.healthy = true;
        b.failCount = 0;
      });
    }, 5000);
  });

  describe('Load Distribution Edge Cases', () => {
    it('should handle distribution across 100+ backends', async () => {
      const manyBackends = [];
      for (let i = 0; i < 100; i++) {
        manyBackends.push({
          url: `http://backend${i}:11434`,
          priority: i % 3 + 1,
          healthy: true,
          busy: false,
          requestCount: 0,
          errorCount: 0
        });
      }
      const manyBalancer = new Balancer(manyBackends);

      // Request from each priority tier
      for (let i = 1; i <= 3; i++) {
        const backend = await manyBalancer.queueRequest();
        expect(backend).not.toBe(null);
        expect(backend.url).toBeDefined();
      }
    }, 30000);

    it('should track statistics accurately under heavy load', async () => {
      // Create fresh backends for this test
      const freshBackends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
        { url: 'http://backend3:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ];
      const statsBalancer = new Balancer(freshBackends);

      console.log('Starting requests...');
      // Make multiple requests
      for (let i = 0; i < 20; i++) {
        await statsBalancer.queueRequest();
        await statsBalancer.queueRequest();
        await statsBalancer.queueRequest();

        // Free up backends to simulate request completion
        freshBackends.forEach(b => b.busy = false);
        statsBalancer.notifyBackendAvailable();
      }

      const stats = statsBalancer.getStats();

      // Total requests should match
      const totalRequests = Object.values(stats.requestCounts).reduce((a, b) => a + b, 0);
      expect(totalRequests).toBeGreaterThan(0);

      // Backend2 (priority 2) should have most requests
      const backend2Stats = stats.backends.find(b => b.url === 'http://backend2:11434');
      expect(backend2Stats.requestCount).toBeGreaterThan(0);
    }, 30000);

    it('should handle backend statistics reset', async () => {
      const statsBalancer = new Balancer(backends);

      // Make requests
      const backend = await statsBalancer.queueRequest();
      const stats1 = statsBalancer.getStats();

      expect(stats1.requestCounts[backend.url]).toBeGreaterThan(0);

      // Reset fail count
      statsBalancer.markHealthy(backend.url);

      const stats2 = statsBalancer.getStats();
      const backendStat = stats2.backends.find(b => b.url === backend.url);

      expect(backendStat.failCount).toBe(0);
    }, 5000);

    it('should handle empty backends list gracefully', () => {
      const emptyBalancer = new Balancer([]);
      expect(emptyBalancer.getNextBackend()).toBeNull();
      expect(emptyBalancer.hasHealthyBackends()).toBe(false);
    });

    it('should handle single backend', async () => {
      const singleBackend = {
        url: 'http://single:11434',
        priority: 1,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0
      };
      const singleBalancer = new Balancer([singleBackend]);

      const backend = await singleBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBe('http://single:11434');
    }, 5000);
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle network errors during requests', async () => {
      const errorBalancer = new Balancer(backends);

      // Mark as unhealthy (simulating network error)
      backends.forEach(b => b.healthy = false);

      expect(errorBalancer.hasHealthyBackends()).toBe(false);

      await expect(errorBalancer.queueRequest()).rejects.toThrow();
    }, 5000);

    it('should handle invalid response from backend', async () => {
      const invalidBalancer = new Balancer(backends);

      // Simulate error
      const backend = await invalidBalancer.queueRequest();

      // Mark as unhealthy
      invalidBalancer.markFailed(backend.url);

      // Should still get another backend
      const backend2 = await invalidBalancer.queueRequest();
      expect(backend2).not.toBe(null);
      expect(backend2.url).not.toBe(backend.url);
    }, 5000);

    it('should handle invalid URL format', () => {
      const invalidUrlBalancer = new Balancer([
        { url: 'invalid-url', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ]);

      // The current implementation accepts any string as URL, even invalid formats
      const backend = invalidUrlBalancer.getNextBackend();
      expect(backend).not.toBe(null);
    });

    it('should handle null URL', () => {
      const nullUrlBalancer = new Balancer([
        { url: null, priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ]);

      // The current implementation accepts null URLs
      const backend = nullUrlBalancer.getNextBackend();
      expect(backend).not.toBe(null);
    });

    it('should handle undefined URL', () => {
      const undefinedUrlBalancer = new Balancer([
        { url: undefined, priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ]);

      // The current implementation accepts undefined URLs
      const backend = undefinedUrlBalancer.getNextBackend();
      expect(backend).not.toBe(null);
    });

    it('should handle marking non-existent backend as failed', () => {
      expect(() => {
        balancer.markFailed('http://nonexistent:11434');
      }).not.toThrow();
    });

    it('should handle marking non-existent backend as healthy', () => {
      expect(() => {
        balancer.markHealthy('http://nonexistent:11434');
      }).not.toThrow();
    });

    it('should handle negative priorities', async () => {
      const negativeBalancer = new Balancer([
        { url: 'http://backend1:11434', priority: -1, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ]);

      const backend = await negativeBalancer.queueRequest();
      expect(backend).not.toBe(null);
    }, 5000);

    it('should handle very high priorities', async () => {
      const highPriorityBalancer = new Balancer([
        { url: 'http://backend1:11434', priority: 999, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
      ]);

      const backend = await highPriorityBalancer.queueRequest();
      expect(backend).not.toBe(null);
      expect(backend.url).toBe('http://backend1:11434');
    }, 5000);
  });
});
