const Balancer = require('../../balancer');

describe('Notify Backend Available Queue Issue - Integration', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    // Use mock backends for testing - no real backend required
    backends = [
      { url: 'http://mock1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 },
      { url: 'http://mock2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 }
    ];
    balancer = new Balancer(backends);
  });

  it('should process queued requests when backend becomes available', async () => {
    console.log('\n=== Integration Test: Queue should be picked up ===\n');

    // Set both backends to max concurrency to simulate them being busy
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1;
    backends[1].activeRequestCount = 1;

    // Request 1 - will be queued
    console.log('2. Starting request 1 (should be queued)');
    const request1 = balancer.queueRequest();

    // Release backend2 to process the first queued request
    console.log('3. Releasing backend2');
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    await new Promise(resolve => setTimeout(resolve, 50));
    const result1 = await request1;
    console.log(`4. Request 1 completed on: ${result1.url}`);

    // Set backend2 back to max concurrency
    backends[1].activeRequestCount = 1;

    // Request 2 - will be queued
    console.log('5. Starting request 2 (should be queued)');
    const request2 = balancer.queueRequest();

    // Release backend1 to process the second queued request
    console.log('6. Releasing backend1');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    await new Promise(resolve => setTimeout(resolve, 50));
    const result2 = await request2;
    console.log(`7. Request 2 completed on: ${result2.url}`);

    // Set both backends to max concurrency again
    backends[0].activeRequestCount = 1;
    backends[1].activeRequestCount = 1;

    // Request 3 should be queued
    console.log('8. Starting request 3 (should be queued)');
    const request3 = balancer.queueRequest();

    // Check queue state
    const stats = balancer.getQueueStats();
    console.log(`9. Queue has ${stats.depth} request`);
    expect(stats.depth).toBe(1);

    // Wait for request3 to complete (this will happen when a backend becomes available)
    console.log('10. Waiting for request 3 to complete...');

    // Release backend2
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    await new Promise(resolve => setTimeout(resolve, 50));
    const result3 = await request3;
    console.log(`11. Request 3 completed on: ${result3.url}`);

    // Queue should be empty
    const statsAfter = balancer.getQueueStats();
    console.log(`12. Queue has ${statsAfter.depth} request`);
    expect(statsAfter.depth).toBe(0);
  });

  it('should process multiple queued requests', async () => {
    console.log('\n=== Integration Test: Multiple queued requests ===\n');

    // Set both backends to max concurrency
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1;
    backends[1].activeRequestCount = 1;

    // Make 4 requests sequentially
    console.log('2. Starting request 1');
    const request1 = balancer.queueRequest();

    console.log('3. Starting request 2');
    const request2 = balancer.queueRequest();

    console.log('4. Starting request 3');
    const request3 = balancer.queueRequest();

    console.log('5. Starting request 4');
    const request4 = balancer.queueRequest();

    // Check queue state
    const stats = balancer.getQueueStats();
    console.log(`6. Queue has ${stats.depth} requests`);
    expect(stats.depth).toBe(4);

    // Release backends one at a time to process queued requests one at a time
    console.log('7. Releasing backends one at a time to process queue');

    // Release backend1 - should process ONE request
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Release backend2 - should process ONE more request
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Release backend1 again - should process another request
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Release backend2 again - should process final request
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Wait for all requests to complete
    const results = await Promise.all([request1, request2, request3, request4]);
    results.forEach((res, i) => {
      console.log(`   Request ${i + 1} completed on: ${res.url}`);
    });

    // All requests should be processed
    expect(results).toHaveLength(4);

    // Check stats
    const finalStats = balancer.getQueueStats();
    console.log(`8. Queue has ${finalStats.depth} request`);
    expect(finalStats.depth).toBe(0);
  });
});