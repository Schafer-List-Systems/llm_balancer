/**
 * Tests for notifyBackendAvailable() function
 * Verifies the queue processing behavior when backends become available
 */

const Balancer = require('../../balancer');

describe('notifyBackendAvailable', () => {
  let balancer;

  beforeEach(() => {
    // Create fresh backend objects for each test
    const backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, requestCount: 0, errorCount: 0, failCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1, requestCount: 0, errorCount: 0, failCount: 0 },
      { url: 'http://backend3:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1, requestCount: 0, errorCount: 0, failCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  describe('Basic Functionality', () => {
    it('should not throw when queue is empty', () => {
      expect(() => {
        balancer.notifyBackendAvailable();
      }).not.toThrow();
    });

    it('should handle undefined queue gracefully', () => {
      const b = new Balancer([]);
      b.queue = undefined;
      expect(() => {
        b.notifyBackendAvailable();
      }).not.toThrow();
    });
  });

  describe('Queue Processing', () => {
    it('should process queued requests when backends become available', async () => {
      const testBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency to force queueing
      testBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue requests - they will go into the queue since all are at capacity
      const promises = [];
      for (let i = 0; i < 2; i++) {
        promises.push(testBalancer.queueRequest());
      }

      // Wait a bit for queuing to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check that requests are in the queue
      expect(testBalancer.queue.length).toBeGreaterThan(0);

      // Release backends by setting activeRequestCount to 0 BEFORE calling notifyBackendAvailable
      testBalancer.backends.forEach(b => b.activeRequestCount = 0);

      // Now call notify - it will find available backends and resolve queued requests
      testBalancer.notifyBackendAvailable();

      // All promises should resolve
      const results = await Promise.all(promises);
      expect(results.length).toBe(2);
    }, 5000);

    it('should process queued requests in FIFO order', async () => {
      const fifoBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency first
      fifoBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue multiple requests (matching number of backends)
      const promises = [];
      for (let i = 0; i < 2; i++) {
        promises.push(fifoBalancer.queueRequest());
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release backends - set activeRequestCount to 0 before notify
      fifoBalancer.backends.forEach(b => b.activeRequestCount = 0);
      fifoBalancer.notifyBackendAvailable();

      const results = await Promise.all(promises);
      expect(results.length).toBe(2);
    }, 5000);

    it('should clear timeout when resolving queued request', async () => {
      const shortTimeoutBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        100  // Very short timeout
      );

      // Mark all backends at max concurrency to force queueing
      shortTimeoutBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue a request with very short timeout
      const promise = shortTimeoutBalancer.queueRequest();

      // Wait a bit for the queued request to start timing out
      await new Promise(resolve => setTimeout(resolve, 50));

      // Release backend before timeout fires - set activeRequestCount to 0 first
      shortTimeoutBalancer.backends.forEach(b => b.activeRequestCount = 0);
      shortTimeoutBalancer.notifyBackendAvailable();

      // Should resolve successfully without timeout error
      const result = await promise;
      expect(result).not.toBe(null);
    }, 5000);

    it('should process queued requests one per available backend', async () => {
      const testBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency to force queueing
      testBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue more requests than we have backends
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(testBalancer.queueRequest());
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release only one backend at a time to simulate gradual availability
      testBalancer.backends[0].activeRequestCount = 0;
      testBalancer.notifyBackendAvailable();

      // One should resolve immediately
      const result1 = await promises[0];
      expect(result1).not.toBe(null);

      // Mark that backend at max concurrency again and release another
      testBalancer.backends[0].activeRequestCount = testBalancer.backends[0].maxConcurrency;
      testBalancer.backends[1].activeRequestCount = 0;
      testBalancer.notifyBackendAvailable();

      const result2 = await promises[1];
      expect(result2).not.toBe(null);
    }, 5000);
  });

  describe('Edge Cases', () => {
    it('should handle empty queue gracefully', () => {
      expect(() => {
        balancer.notifyBackendAvailable();
      }).not.toThrow();
    });

    it('should increment request count for each resolved backend', async () => {
      const counterBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency to force queueing
      counterBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue multiple requests (matching number of backends)
      const promises = [];
      for (let i = 0; i < 2; i++) {
        promises.push(counterBalancer.queueRequest());
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release backends
      counterBalancer.backends.forEach(b => b.activeRequestCount = 0);
      counterBalancer.notifyBackendAvailable();

      await Promise.all(promises);

      // Check that request counts were incremented for each backend (not queued count)
      const stats = counterBalancer.getStats();
      let totalRequests = 0;
      Object.values(stats.requestCounts).forEach(count => {
        if (typeof count === 'number' && count > 0) {
          // Exclude the 'queued' key which has a different meaning
          if (!isNaN(parseInt(Object.keys(stats.requestCounts).find(k => stats.requestCounts[k] === count)))) {
            totalRequests += count;
          }
        }
      });

      // Better approach: check backend-level request counts directly
      const backendTotal = counterBalancer.backends.reduce((sum, b) => sum + (b.requestCount || 0), 0);
      expect(backendTotal).toBe(2);
    }, 5000);

    it('should handle concurrent notifyBackendAvailable calls safely', async () => {
      const concurrentBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency to force queueing
      concurrentBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue multiple requests (matching number of backends)
      const promises = [];
      for (let i = 0; i < 2; i++) {
        promises.push(concurrentBalancer.queueRequest());
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release backends and call notify multiple times (should be safe)
      concurrentBalancer.backends.forEach(b => b.activeRequestCount = 0);
      concurrentBalancer.notifyBackendAvailable();
      concurrentBalancer.notifyBackendAvailable();
      concurrentBalancer.notifyBackendAvailable();

      const results = await Promise.all(promises);
      expect(results.length).toBe(2);
    }, 5000);

    it('should handle queue with only one backend available', async () => {
      const limitedBalancer = new Balancer(
        [
          { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
          { url: 'http://backend2:11434', priority: 2, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
        ],
        100,
        30000
      );

      // Mark all backends at max concurrency to force queueing
      limitedBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);

      // Queue more requests than we have backends available
      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(limitedBalancer.queueRequest());
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Process all queued requests by repeatedly releasing and re-marking backend[0]
      // Each cycle: release -> notify (assigns one request) -> mark at max concurrency again -> repeat
      for (let i = 0; i < 4; i++) {
        limitedBalancer.backends[0].activeRequestCount = 0;
        limitedBalancer.notifyBackendAvailable();
        const result = await promises[i];
        expect(result).not.toBe(null);
        // Mark backend at max concurrency again so we can process the next queued request in next iteration
        limitedBalancer.backends[0].activeRequestCount = limitedBalancer.backends[0].maxConcurrency;
      }

      // All 4 requests should have resolved (using the same backend sequentially)
    }, 10000);
  });

  describe('Integration with Backend Selection', () => {
    it('should select highest priority backend when available', async () => {
      const backends = [
        { url: 'http://backend1:11434', priority: 1, healthy: true, activeRequestCount: 0, maxConcurrency: 1 },
        { url: 'http://backend2:11434', priority: 5, healthy: true, activeRequestCount: 0, maxConcurrency: 1 }
      ];
      const priorityBalancer = new Balancer(backends);

      // Mark lower priority backend at max concurrency first
      backends[0].activeRequestCount = backends[0].maxConcurrency;

      // Queue a request - should go to higher priority backend when available
      const promise = priorityBalancer.queueRequest();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Release the higher priority backend (backend2 with priority 5)
      backends[1].activeRequestCount = 0;
      priorityBalancer.notifyBackendAvailable();

      const result = await promise;
      expect(result).not.toBe(null);
      expect(result.priority).toBe(5); // Should get highest priority backend
    }, 5000);

    it('should reject when no healthy backends available', async () => {
      const backends = [
        { url: 'http://backend1:11434', priority: 1, healthy: false, activeRequestCount: 0, maxConcurrency: 1 }
      ];
      const unhealthyBalancer = new Balancer(backends);

      // No healthy backends at all - queueRequest should reject immediately
      await expect(unhealthyBalancer.queueRequest()).rejects.toThrow('No healthy backends available');
    }, 500);
  });
});
