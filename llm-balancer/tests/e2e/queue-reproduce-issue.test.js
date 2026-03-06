const Balancer = require('../../balancer');

describe('Queue Request Issue Reproduction', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends, { debug: true });
  });

  it('should process queued requests when backend becomes available', async () => {
    console.log('\n=== Test: Queue request issue reproduction ===\n');

    // Start first request - will be queued
    console.log('1. Starting first request (will be queued)');
    const request1Promise = balancer.queueRequest();

    // Wait a bit, then start second request
    await new Promise(resolve => setTimeout(resolve, 10));

    console.log('2. Starting second request (will be queued)');
    const request2Promise = balancer.queueRequest();

    // Check queue state
    const stats = balancer.getQueueStats();
    console.log(`3. Queue stats: ${stats.depth} requests queued`);

    // Wait for first backend to finish
    await new Promise(resolve => setTimeout(resolve, 100));

    // Release backend1
    console.log('4. Releasing backend1 (now busy=false)');
    const backend1 = backends[0];
    backend1.activeRequestCount = 0;

    // Notify that backend is available
    balancer.notifyBackendAvailable();
    console.log('5. Notified backend available');

    // Wait for request1 to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const request1Result = await request1Promise;
    console.log(`6. Request1 resolved: ${request1Result.backend.url}`);

    // Check if request2 was also processed
    const statsAfter = balancer.getQueueStats();
    console.log(`7. Queue stats after: ${statsAfter.depth} requests queued`);

    try {
      const request2Result = await request2Promise;
      console.log(`8. Request2 resolved: ${request2Result.backend.url}`);
      expect(statsAfter.depth).toBe(0);
    } catch (err) {
      console.log(`8. Request2 failed: ${err.message}`);
      console.log(`9. Queue still has ${statsAfter.depth} requests`);
      fail('Request2 should have been processed');
    }
  });

  it('should not lose queued requests when multiple requests arrive', async () => {
    console.log('\n=== Test: Multiple queued requests ===\n');

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
    console.log(`1. Queue stats after 3 requests: ${stats.depth} requests`);

    // All three requests should be queued
    expect(stats.depth).toBe(3);

    // Release backend1
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    console.log('2. Backend1 released and notified');

    // Wait for first request to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check if request1 was processed
    try {
      const result = await request1Promise;
      console.log(`3. Request1 resolved: ${result.backend.url}`);
    } catch (err) {
      fail('Request1 should have been processed');
    }

    // Release backend2
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    console.log('4. Backend2 released and notified');

    // Wait for second request to resolve
    try {
      const result = await request3Promise;
      console.log(`5. Request3 resolved: ${result.backend.url}`);
    } catch (err) {
      fail('Request3 should have been processed');
    }

    // Check if third request was processed
    const statsAfter = balancer.getQueueStats();
    console.log(`6. Queue stats after 2 releases: ${statsAfter.depth} requests`);

    try {
      const result = await request4Promise;
      console.log(`7. Request4 resolved: ${result.backend.url}`);
      expect(statsAfter.depth).toBe(0);
    } catch (err) {
      fail(`Request4 should have been processed. Error: ${err.message}`);
    }
  });
});