const Balancer = require('../balancer');

describe('Balancer Constructor', () => {
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
    expect(balancer.backends.length).toBe(2);
  });
});