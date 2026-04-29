const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');

describe('Queue Not Picking Up Issue', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      new Backend('http://backend1:11434', 1),
      new Backend('http://backend2:11434', 1)
    ];
    backends[0].priority = 1;
    backends[1].priority = 2;
    backends[0].healthy = true;
    backends[1].healthy = true;
    backends[0].backendInfo = { apis: { openai: { supported: true } }, models: { openai: ['test-model'] }, endpoints: { openai: '/v1/chat/completions' }, healthy: true, detectedAt: Date.now() };
    backends[1].backendInfo = { apis: { openai: { supported: true } }, models: { openai: ['test-model'] }, endpoints: { openai: '/v1/chat/completions' }, healthy: true, detectedAt: Date.now() };
    balancer = new Balancer(backends, { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: false }, debugRequestHistorySize: 100 });
  });

  it('should process queued request when backend becomes available', async () => {
    console.log('\n=== Test: Queue should be picked up when backend is available ===\n');

    // Set both backends to max concurrency to simulate them being busy
    // This is the key - backends must be at max concurrency BEFORE queueRequest() is called
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1; // backend1 at max
    backends[1].activeRequestCount = 1; // backend2 at max

    // Start first request - will be queued because both backends are busy
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

    // Start second request - will be queued
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
    backends[0].activeRequestCount = 1; // backend1 busy
    backends[1].activeRequestCount = 1; // backend2 busy

    // Start third request - all backends are busy again, so it should be queued
    console.log('8. Starting request 3 (all backends busy, should be queued)');
    const request3 = balancer.queueRequest();

    // Check queue state
    const stats = balancer.getQueueStats();
    console.log(`9. Queue stats: ${stats.depth} requests queued`);

    expect(stats.depth).toBe(1);

    // Release backend1 (should pick up the queued request)
    console.log('10. Releasing backend1');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for request3 to resolve
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if request3 was processed
    const result = await request3;
    console.log(`11. Request 3 resolved: ${result.url}`);
    console.log(`12. Queue stats after: ${balancer.getQueueStats().depth} requests queued`);

    expect(result).toBeDefined();
    expect(result.url).toBeDefined();
  });

  it('should handle multiple queued requests', async () => {
    console.log('\n=== Test: Multiple queued requests should be processed ===\n');

    // Set both backends to max concurrency to simulate them being busy
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1; // backend1 at max
    backends[1].activeRequestCount = 1; // backend2 at max

    // Start multiple requests while backends are busy
    const requests = [];
    for (let i = 1; i <= 4; i++) {
      console.log(`2. Starting request ${i}`);
      const request = balancer.queueRequest();
      requests.push(request);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between requests
    }

    // Release backends one at a time to process queued requests one at a time
    console.log('3. Releasing backends one at a time to process queue');

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
    const results = await Promise.all(requests);
    results.forEach((res, i) => {
      console.log(`   Request ${i + 1} completed on: ${res.url}`);
    });

    // All requests should be processed
    console.log('All requests completed successfully');
    expect(results).toHaveLength(4);
  });
});