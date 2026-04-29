const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');

describe('Debug Test', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    console.log('Before each - creating balancer');
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