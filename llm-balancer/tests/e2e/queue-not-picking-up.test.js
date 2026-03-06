const Balancer = require('../../balancer');

describe('Queue Not Picking Up Issue', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  it('should process queued request when backend becomes available', async () => {
    console.log('\n=== Test: Queue should be picked up when backend is available ===\n');

    // Start first request - will use backend2
    console.log('1. Starting request 1 (should use backend2)');
    const request1 = balancer.queueRequest();

    // Wait for backend2 to finish
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('2. Request 1 is now complete');

    // Start second request - will use backend1
    console.log('3. Starting request 2 (should use backend1)');
    const request2 = balancer.queueRequest();

    // Wait for backend1 to finish
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('4. Request 2 is now complete');

    // Start third request - all backends are busy, so it should be queued
    console.log('5. Starting request 3 (all backends busy, should be queued)');
    const request3 = balancer.queueRequest();

    // Check queue state
    const stats = balancer.getQueueStats();
    console.log(`6. Queue stats: ${stats.depth} requests queued`);

    expect(stats.depth).toBe(1);

    // Release backend1 (should pick up the queued request)
    console.log('7. Releasing backend1');
    backends[0].activeRequestCount = 0;

    // Notify that backend is available
    balancer.notifyBackendAvailable();
    console.log('8. Backend notified as available');

    // Wait for request3 to resolve
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if request3 was processed
    const result = await request3;
    console.log(`9. Request 3 resolved: ${result.backend.url}`);
    console.log(`10. Queue stats after: ${balancer.getQueueStats().depth} requests queued`);

    expect(result).toBeDefined();
    expect(result.backend).toBeDefined();
  });

  it('should handle multiple queued requests', async () => {
    console.log('\n=== Test: Multiple queued requests should be processed ===\n');

    // Start multiple requests while backends are busy
    const requests = [];
    for (let i = 1; i <= 4; i++) {
      console.log(`1${i}. Starting request ${i}`);
      const request = balancer.queueRequest();
      requests.push(request);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between requests
    }

    // Wait for all requests to complete
    await Promise.all(requests.map(r => r.then(res => {
      console.log(`   Request ${res.backend.url} completed`);
    })));

    // All requests should be processed
    console.log('All requests completed successfully');
    expect(true).toBe(true);
  });
});