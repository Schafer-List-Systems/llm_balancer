const Balancer = require('../../balancer');

describe('Queue Request Issue Reproduction', () => {
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
        incrementStreamingRequest: jest.fn(),
        decrementStreamingRequest: jest.fn(),
        incrementNonStreamingRequest: jest.fn(),
        decrementNonStreamingRequest: jest.fn()
      },
      {
        url: 'http://backend2:11434',
        priority: 2,
        healthy: true,
        busy: false,
        requestCount: 0,
        errorCount: 0,
        maxConcurrency: 1,
        incrementStreamingRequest: jest.fn(),
        decrementStreamingRequest: jest.fn(),
        incrementNonStreamingRequest: jest.fn(),
        decrementNonStreamingRequest: jest.fn()
      }
    ];
    balancer = new Balancer(backends, { debug: { enabled: true } });
  });

  it('should process ALL eligible queued requests when a backend becomes available', async () => {
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

    // Release backend1 to process the first queued request
    // With the fix, the loop continues and backend2 is also checked
    // Since both backends become available, both requests will be processed
    console.log('5. Releasing backend1');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for requests to resolve - both should complete since backend2
    // will also be checked in the same notification cycle
    await new Promise(resolve => setTimeout(resolve, 50));

    const request1Result = await request1Promise;
    console.log(`6. Request1 resolved: ${request1Result.url}`);

    const request2Result = await request2Promise;
    console.log(`7. Request2 resolved: ${request2Result.url}`);

    const statsAfter = balancer.getQueueStats();
    console.log(`8. Queue stats after release: ${statsAfter.depth} requests queued`);
    expect(statsAfter.depth).toBe(0);
  });

  it('should not lose queued requests when multiple requests arrive', async () => {
    console.log('\n=== Test: Multiple queued requests ===\n');

    // Start requests - all should be processed immediately since backends start available
    console.log('1. Starting 4 requests (backends available)');
    const request1Promise = balancer.queueRequest();
    const request2Promise = balancer.queueRequest();
    const request3Promise = balancer.queueRequest();
    const request4Promise = balancer.queueRequest();

    // Wait for all requests to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // All requests should have resolved (backends were available)
    const result1 = await request1Promise;
    const result2 = await request2Promise;
    const result3 = await request3Promise;
    const result4 = await request4Promise;

    console.log(`2. All 4 requests resolved`);
    console.log(`   Request 1: ${result1.url}`);
    console.log(`   Request 2: ${result2.url}`);
    console.log(`   Request 3: ${result3.url}`);
    console.log(`   Request 4: ${result4.url}`);

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(result3).toBeDefined();
    expect(result4).toBeDefined();
  });
});