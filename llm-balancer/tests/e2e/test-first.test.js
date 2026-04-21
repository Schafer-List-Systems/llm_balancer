const Balancer = require('../../balancer');

describe('Balancer Constructor', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends, { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: false }, debugRequestHistorySize: 100 });
  });

  it('should initialize with backends', () => {
    expect(balancer.backendPool.getAll().length).toBe(2);
  });
});