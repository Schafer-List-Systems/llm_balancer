const Balancer = require('../../balancer');

describe('Debug Test', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    console.log('Before each - creating balancer');
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends);
    console.log('Before each - balancer created');
  });

  it('should test queueRequest', async () => {
    console.log('Test: queueRequest');
    const backend = await balancer.queueRequest();
    console.log('Test: queueRequest completed', backend);
    expect(backend).not.toBe(null);
    expect(backend.url).toBeDefined();
  });
});