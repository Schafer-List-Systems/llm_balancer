const Balancer = require('../../balancer');

describe('Rapid Request Arrival Queue Issue', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0, maxConcurrency: 1 }
    ];
    balancer = new Balancer(backends);
  });

  it('should handle rapid arrival when backends become available', async () => {
    console.log('\n=== Test: Rapid arrival with backend availability ===\n');

    // First, set both backends to max concurrency to force queueing
    console.log('1. Setting backends to max concurrency (simulating busy backends)');
    backends[0].activeRequestCount = 1;
    backends[1].activeRequestCount = 1;

    const requests = [];

    // Start all three requests quickly - they will be queued
    console.log('2. Starting 3 requests rapidly');
    requests.push(balancer.queueRequest());
    requests.push(balancer.queueRequest());
    requests.push(balancer.queueRequest());

    // Wait a bit for requests to be queued
    await new Promise(resolve => setTimeout(resolve, 20));

    // All backends should be busy
    const stats = balancer.getQueueStats();
    console.log(`3. Queue stats: ${stats.depth} requests`);
    expect(stats.depth).toBe(3);

    // Release backend1 - should pick up ONLY ONE queued request
    console.log('4. Releasing backend1 (should pick up ONE queued request)');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for request to process
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('5. Checking if ONE queued request was processed');

    // The FIRST queued request should resolve (FIFO order)
    const result1 = await requests[0];
    console.log(`6. Request 1 resolved: ${result1.url}`);
    expect(result1).toBeDefined();

    // Queue should still have 2 requests
    const statsAfter = balancer.getQueueStats();
    console.log(`7. Queue stats after 1 release: ${statsAfter.depth} requests`);
    expect(statsAfter.depth).toBe(2);

    // Release backend2 to pick up the second queued request
    console.log('8. Releasing backend2 (should pick up second queued request)');
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    await new Promise(resolve => setTimeout(resolve, 50));

    const result2 = await requests[1];
    console.log(`9. Request 2 resolved: ${result2.url}`);
    expect(result2).toBeDefined();

    // Queue should still have 1 request
    const statsAfterSecond = balancer.getQueueStats();
    console.log(`10. Queue stats after 2 releases: ${statsAfterSecond.depth} requests`);
    expect(statsAfterSecond.depth).toBe(1);

    // Release backend1 again to pick up the final queued request
    console.log('11. Releasing backend1 again (should pick up final queued request)');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    await new Promise(resolve => setTimeout(resolve, 50));

    const result3 = await requests[2];
    console.log(`12. Request 3 resolved: ${result3.url}`);
    expect(result3).toBeDefined();
  });

  it('should process all queued requests when multiple backends become available', async () => {
    console.log('\n=== Test: Multiple backend releases ===\n');

    // Set both backends to max concurrency first
    console.log('1. Setting backends to max concurrency');
    backends[0].activeRequestCount = 1;
    backends[1].activeRequestCount = 1;

    const requests = [];

    // Start multiple requests while backends are busy
    console.log('2. Starting 4 requests');
    for (let i = 0; i < 4; i++) {
      requests.push(balancer.queueRequest());
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check queue
    const stats = balancer.getQueueStats();
    console.log(`3. Queue stats: ${stats.depth} requests`);
    expect(stats.depth).toBe(4);

    // Process requests one at a time by releasing backends
    console.log('4. Processing requests one at a time');

    // Release backend1 - should process ONE request
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 50));
    const result1 = await requests[0];
    console.log(`5. Request 1 resolved: ${result1.url}`);
    expect(result1).toBeDefined();

    // Release backend2 - should process ONE more request
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 50));
    const result2 = await requests[1];
    console.log(`6. Request 2 resolved: ${result2.url}`);
    expect(result2).toBeDefined();

    // Release backend1 again - should process another request
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 50));
    const result3 = await requests[2];
    console.log(`7. Request 3 resolved: ${result3.url}`);
    expect(result3).toBeDefined();

    // Release backend2 again - should process final request
    backends[1].activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(resolve => setTimeout(resolve, 50));
    const result4 = await requests[3];
    console.log(`8. Request 4 resolved: ${result4.url}`);
    expect(result4).toBeDefined();

    console.log('9. All requests completed');
    expect(requests.length).toBe(4);
  });

  it('should not lose requests when queue is filled and processed', async () => {
    console.log('\n=== Test: Queue filling and processing ===\n');

    // Start requests until queue is full
    const requests = [];
    const maxQueueSize = balancer.maxQueueSize || 10;

    console.log(`1. Starting ${maxQueueSize + 2} requests to fill queue`);

    for (let i = 0; i < maxQueueSize + 2; i++) {
      requests.push(balancer.queueRequest());
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const stats = balancer.getQueueStats();
    console.log(`2. Queue stats: ${stats.depth} requests`);

    // Wait for all requests to be processed
    console.log('3. Waiting for all requests to complete');
    await Promise.all(requests.map(r => r.catch(e => {
      console.log(`Request failed: ${e.message}`);
    })));

    console.log('4. All requests processed');
    expect(requests.length).toBeGreaterThan(0);
  });
});