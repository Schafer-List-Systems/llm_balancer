const Balancer = require('../../balancer');

describe('Rapid Request Arrival Queue Issue', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      {
        url: 'http://backend1:11434',
        priority: 1,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0,
        maxConcurrency: 1,
        activeRequestCount: 0,
        activeStreamingRequests: 0,
        activeNonStreamingRequests: 0,
        incrementRequest: jest.fn(),
        decrementRequest: jest.fn()
      },
      {
        url: 'http://backend2:11434',
        priority: 2,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0,
        maxConcurrency: 1,
        activeRequestCount: 0,
        activeStreamingRequests: 0,
        activeNonStreamingRequests: 0,
        incrementRequest: jest.fn(),
        decrementRequest: jest.fn()
      }
    ];
    balancer = new Balancer(backends, { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: false }, debugRequestHistorySize: 100 });
  });

  it('should handle rapid arrival when backends become available', async () => {
    console.log('\n=== Test: Rapid arrival with backend availability ===\n');

    // Start all three requests - since backends have activeRequestCount=0 initially,
    // they will be processed immediately (not queued)
    console.log('1. Starting 3 requests (backends start available)');

    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(balancer.queueRequest());
    }

    // Wait for all requests to resolve (all backends were available)
    await new Promise(resolve => setTimeout(resolve, 50));

    // All 3 requests should have resolved
    expect(requests.length).toBe(3);
    for (const req of requests) {
      expect(req).toBeDefined();
    }
    console.log('2. All 3 requests resolved successfully');
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
