/**
 * Tests for notifyBackendAvailable() function
 * Verifies the queue processing behavior when backends become available
 */

const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');

describe('notifyBackendAvailable', () => {
  let balancer;

  beforeEach(() => {
    // Create fresh Backend instances for each test
    const backends = [
      (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; b.activeRequestCount = 0; return b; })(),
      (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; b.activeRequestCount = 0; return b; })(),
      (() => { const b = new Backend('http://backend3:11434', 1); b.priority = 1; b.healthy = true; b.activeRequestCount = 0; return b; })()
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
    it('should process ONE queued request when a backend becomes available', async () => {
      const testBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

      // Release ONE backend by setting activeRequestCount to 0
      testBalancer.backends[0].activeRequestCount = 0;

      // Call notify - it will resolve ONLY ONE queued request
      testBalancer.notifyBackendAvailable();

      // Only the first promise should resolve
      const result1 = await promises[0];
      expect(result1).not.toBe(null);

      // Second request should still be queued
      expect(testBalancer.queue.length).toBe(1);

      // Release the second backend to resolve the remaining request
      testBalancer.backends[1].activeRequestCount = 0;
      testBalancer.notifyBackendAvailable();

      const result2 = await promises[1];
      expect(result2).not.toBe(null);
    }, 5000);

    it('should process queued requests one at a time per backend availability', async () => {
      const fifoBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

      // Release ONE backend and call notify - should only process ONE request
      fifoBalancer.backends[0].activeRequestCount = 0;
      fifoBalancer.notifyBackendAvailable();

      const result1 = await promises[0];
      expect(result1).not.toBe(null);
      expect(fifoBalancer.queue.length).toBe(1);

      // Release the second backend to process the remaining request
      fifoBalancer.backends[1].activeRequestCount = 0;
      fifoBalancer.notifyBackendAvailable();

      const result2 = await promises[1];
      expect(result2).not.toBe(null);
    }, 5000);

    it('should clear timeout when resolving queued request', async () => {
      const shortTimeoutBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

    it('should process only ONE request per notifyBackendAvailable call', async () => {
      const testBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

      // Release ONE backend and call notify - should process ONLY ONE request
      testBalancer.backends[0].activeRequestCount = 0;
      testBalancer.notifyBackendAvailable();

      // Only ONE should resolve
      const result1 = await promises[0];
      expect(result1).not.toBe(null);
      expect(testBalancer.queue.length).toBe(4);

      // Release the second backend and call notify again
      testBalancer.backends[1].activeRequestCount = 0;
      testBalancer.notifyBackendAvailable();

      // Now a second request should resolve
      const result2 = await promises[1];
      expect(result2).not.toBe(null);
      expect(testBalancer.queue.length).toBe(3);
    }, 5000);
  });

  describe('Edge Cases', () => {
    it('should handle empty queue gracefully', () => {
      expect(() => {
        balancer.notifyBackendAvailable();
      }).not.toThrow();
    });

    // TODO: This test is no longer applicable. In the new architecture, requestCount
    // is tracked by the Backend class in request-processor.js when a request is
    // actually processed, not during queueRequest(). The Balancer's responsibility
    // is only queue management, not request counting.
    // it('should increment request count for each resolved backend', async () => {
    //   const counterBalancer = new Balancer(
    //     [
    //       (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
    //       (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
    //     ],
    //     100,
    //     30000
    //   );
    //
    //   // Mark all backends at max concurrency to force queueing
    //   counterBalancer.backends.forEach(b => b.activeRequestCount = b.maxConcurrency);
    //
    //   // Queue multiple requests (matching number of backends)
    //   const promises = [];
    //   for (let i = 0; i < 2; i++) {
    //     promises.push(counterBalancer.queueRequest());
    //   }
    //
    //   await new Promise(resolve => setTimeout(resolve, 50));
    //
    //   // Release ONE backend and process ONE request
    //   counterBalancer.backends[0].activeRequestCount = 0;
    //   counterBalancer.notifyBackendAvailable();
    //   await promises[0];
    //
    //   // Release second backend and process second request
    //   counterBalancer.backends[1].activeRequestCount = 0;
    //   counterBalancer.notifyBackendAvailable();
    //   await promises[1];
    //
    //   // Check that request counts were incremented for each backend
    //   const backendTotal = counterBalancer.backends.reduce((sum, b) => sum + (b.requestCount || 0), 0);
    //   expect(backendTotal).toBe(2);
    // }, 5000);

    it('should handle concurrent notifyBackendAvailable calls safely', async () => {
      const concurrentBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

      // Release ONE backend and call notify - should process ONE request
      concurrentBalancer.backends[0].activeRequestCount = 0;
      concurrentBalancer.notifyBackendAvailable();
      await promises[0];

      // Release second backend and call notify again - should process second request
      concurrentBalancer.backends[1].activeRequestCount = 0;
      concurrentBalancer.notifyBackendAvailable();
      await promises[1];

      expect(promises[0]).not.toBe(null);
      expect(promises[1]).not.toBe(null);
    }, 5000);

    it('should handle queue with only one backend available', async () => {
      const limitedBalancer = new Balancer(
        [
          (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
          (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 2; b.healthy = true; return b; })()
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

      // Process requests one at a time by repeatedly releasing and re-marking backend[0]
      // Each cycle: release -> notify (assigns ONE request) -> mark at max concurrency again -> repeat
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
        (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = true; return b; })(),
        (() => { const b = new Backend('http://backend2:11434', 1); b.priority = 5; b.healthy = true; return b; })()
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
        (() => { const b = new Backend('http://backend1:11434', 1); b.priority = 1; b.healthy = false; return b; })()
      ];
      const unhealthyBalancer = new Balancer(backends);

      // No healthy backends at all - queueRequest should reject immediately
      await expect(unhealthyBalancer.queueRequest()).rejects.toThrow('No healthy backends available');
    }, 500);
  });
});
