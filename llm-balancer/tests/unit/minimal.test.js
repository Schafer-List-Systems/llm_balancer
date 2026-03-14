const Balancer = require('../../balancer');

describe('Minimal Test', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  it('should initialize with backends', () => {
    expect(balancer.backendPool.getAll().length).toBe(2);
  });

  it('should track queue statistics', () => {
    const stats = balancer.getQueueStats();
    expect(stats.depth).toBe(0);
  });
});