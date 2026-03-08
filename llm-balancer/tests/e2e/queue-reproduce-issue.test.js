const Balancer = require('../../balancer');

describe('Queue Request Issue Reproduction', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 }
    ];
    balancer = new Balancer(backends, { debug: true });
  });

  it('should process queued requests when backend becomes available', async () => {
    console.log('\n=== Test: Queue request issue reproduction ===\n');

    // First, set both backends to max concurrency to simulate them being busy
    // This is the key - backends must be at max concurrency BEFORE queueRequest() is called
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1; // backend1 at max
    backends[1].activeRequestCount = 1; // backend2 at max

    // Start first request - will be queued because both backends are busy
    console.log('2. Starting first request (should be queued)');
    const request1Promise = balancer.queueRequest();

    // Wait a bit, then start second request
    await new Promise(resolve => setTimeout(resolve, 10));

    console.log('3. Starting second request (should be queued)');
    const request2Promise = balancer.queueRequest();

    // Check queue state - both requests should be queued
    const stats = balancer.getQueueStats();
    console.log(`4. Queue stats: ${stats.depth} requests queued`);

    expect(stats.depth).toBe(2);

    // Release backend1 to process ONLY first queued request
    console.log('5. Releasing backend1');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for request1 to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const request1Result = await request1Promise;
    console.log(`6. Request1 resolved: ${request1Result.url}`);

    // Check that request2 is still queued (only ONE request should be processed per notify)
    const statsAfter = balancer.getQueueStats();
    console.log(`7. Queue stats after 1 release: ${statsAfter.depth} requests queued`);
    expect(statsAfter.depth).toBe(1);

    // Release backend2 to process the second queued request
    console.log('8. Releasing backend2');
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    const request2Result = await request2Promise;
    console.log(`9. Request2 resolved: ${request2Result.url}`);

    const finalStats = balancer.getQueueStats();
    console.log(`10. Final queue stats: ${finalStats.depth} requests queued`);
    expect(finalStats.depth).toBe(0);
  });

  it('should not lose queued requests when multiple requests arrive', async () => {
    console.log('\n=== Test: Multiple queued requests ===\n');

    // First, set both backends to max concurrency to simulate them being busy
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1; // backend1 at max
    backends[1].activeRequestCount = 1; // backend2 at max

    // Start first request - will be queued
    const request1Promise = balancer.queueRequest();

    // Wait, then start second request
    await new Promise(resolve => setTimeout(resolve, 5));

    // Start third request - all backends are busy
    const request3Promise = balancer.queueRequest();

    // Wait, then try to start fourth request - queue is not full yet
    await new Promise(resolve => setTimeout(resolve, 5));
    const request4Promise = balancer.queueRequest();

    const stats = balancer.getQueueStats();
    console.log(`2. Queue stats after 3 requests: ${stats.depth} requests`);

    // All three requests should be queued
    expect(stats.depth).toBe(3);

    // Release backend1 - should process ONLY ONE request
    console.log('3. Releasing backend1');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for first request to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check if request1 was processed
    try {
      const result = await request1Promise;
      console.log(`4. Request1 resolved: ${result.url}`);
    } catch (err) {
      throw new Error('Request1 should have been processed');
    }

    // Verify queue still has 2 requests (only 1 was processed)
    const statsAfterFirst = balancer.getQueueStats();
    console.log(`5. Queue stats after 1 release: ${statsAfterFirst.depth} requests`);
    expect(statsAfterFirst.depth).toBe(2);

    // Release backend2 - should process ONE more request
    console.log('6. Releasing backend2');
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for second request to resolve
    try {
      const result = await request3Promise;
      console.log(`7. Request3 resolved: ${result.url}`);
    } catch (err) {
      throw new Error('Request3 should have been processed');
    }

    // Verify queue still has 1 request
    const statsAfterSecond = balancer.getQueueStats();
    console.log(`8. Queue stats after 2 releases: ${statsAfterSecond.depth} requests`);
    expect(statsAfterSecond.depth).toBe(1);

    // Release backend1 again to process the final request
    console.log('9. Releasing backend1 again');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    try {
      const result = await request4Promise;
      console.log(`10. Request4 resolved: ${result.url}`);
      const finalStats = balancer.getQueueStats();
      console.log(`11. Final queue stats: ${finalStats.depth} requests`);
      expect(finalStats.depth).toBe(0);
    } catch (err) {
      throw new Error(`Request4 should have been processed. Error: ${err.message}`);
    }
  });
});