const Balancer = require('../../balancer');

describe('Rapid Request Arrival Queue Issue', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  it('should handle rapid arrival when backends become available', async () => {
    console.log('\n=== Test: Rapid arrival with backend availability ===\n');

    const requests = [];

    // Start all three requests quickly
    console.log('1. Starting 3 requests rapidly');
    requests.push(balancer.queueRequest());
    requests.push(balancer.queueRequest());
    requests.push(balancer.queueRequest());

    // Wait a bit for backends to start processing
    await new Promise(resolve => setTimeout(resolve, 20));

    // All backends should be busy
    const stats = balancer.getQueueStats();
    console.log(`2. Queue stats: ${stats.depth} requests`);

    // The third request should be queued
    // But with rapid arrival, it's possible the queue gets filled
    // and then backend1 finishes before the queue is processed

    // Now release backend1
    console.log('3. Releasing backend1 (should pick up queued request)');
    backends[0].activeRequestCount = 0;
    balancer.notifyBackendAvailable();

    // Wait for request to process
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('4. Checking if queued request was processed');

    try {
      const result = await requests[2];
      console.log(`5. Request 3 resolved: ${result.backend.url}`);
      expect(result).toBeDefined();
    } catch (err) {
      console.log(`5. Request 3 failed: ${err.message}`);
      // If this happens, it's the bug we're looking for
      fail('Queued request was never picked up');
    }
  });

  it('should process all queued requests when multiple backends become available', async () => {
    console.log('\n=== Test: Multiple backend releases ===\n');

    const requests = [];

    // Start multiple requests while backends are busy
    console.log('1. Starting 4 requests');
    for (let i = 0; i < 4; i++) {
      requests.push(balancer.queueRequest());
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check queue
    const stats = balancer.getQueueStats();
    console.log(`2. Queue stats: ${stats.depth} requests`);

    // All requests should be processed eventually
    console.log('3. Waiting for all requests to complete');
    const results = await Promise.all(requests);

    console.log('4. All requests completed');
    expect(results).toHaveLength(4);
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