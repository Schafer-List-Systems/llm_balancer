const request = require('supertest');
const app = require('../index');
const Balancer = require('../balancer');

describe('Notify Backend Available Queue Issue - Integration', () => {
  let backends;
  let balancer;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];
    balancer = new Balancer(backends);
  });

  it('should process queued requests when backend becomes available', async () => {
    console.log('\n=== Integration Test: Queue should be picked up ===\n');

    // Request 1 - will use backend2
    console.log('1. Making request 1 (will use backend2)');
    const response1 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test1' })
      .set('anthropic-version', '2023-06-01');

    console.log(`2. Request 1 status: ${response1.status}`);
    console.log(`3. Request 1 used backend: ${response1.body?.metadata?.model}`);

    // Request 2 - will use backend1
    console.log('4. Making request 2 (will use backend1)');
    const response2 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test2' })
      .set('anthropic-version', '2023-06-01');

    console.log(`5. Request 2 status: ${response2.status}`);
    console.log(`6. Request 2 used backend: ${response2.body?.metadata?.model}`);

    // Request 3 should be queued
    console.log('7. Making request 3 (should be queued)');
    const response3 = request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test3' })
      .set('anthropic-version', '2023-06-01');

    await new Promise(resolve => setTimeout(resolve, 50));

    const stats = balancer.getQueueStats();
    console.log(`8. Queue has ${stats.depth} request`);

    expect(stats.depth).toBe(1);

    // Wait for request3 to complete (this will happen when a backend becomes available)
    console.log('9. Waiting for request 3 to complete...');
    await response3;

    console.log(`10. Request 3 status: ${response3.status}`);
    console.log(`11. Request 3 used backend: ${response3.body?.metadata?.model}`);

    // Queue should be empty
    const statsAfter = balancer.getQueueStats();
    console.log(`12. Queue has ${statsAfter.depth} request`);
    expect(statsAfter.depth).toBe(0);
  });

  it('should process multiple queued requests', async () => {
    console.log('\n=== Integration Test: Multiple queued requests ===\n');

    // Make 4 requests sequentially
    console.log('1. Making request 1');
    const response1 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test1' })
      .set('anthropic-version', '2023-06-01');
    console.log(`2. Request 1 status: ${response1.status}`);

    console.log('3. Making request 2');
    const response2 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test2' })
      .set('anthropic-version', '2023-06-01');
    console.log(`4. Request 2 status: ${response2.status}`);

    console.log('5. Making request 3');
    const response3 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test3' })
      .set('anthropic-version', '2023-06-01');
    console.log(`6. Request 3 status: ${response3.status}`);

    console.log('7. Making request 4');
    const response4 = await request(app)
      .post('/v1/messages')
      .send({ role: 'user', content: 'test4' })
      .set('anthropic-version', '2023-06-01');
    console.log(`8. Request 4 status: ${response4.status}`);

    // All requests should complete successfully
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);
    expect(response4.status).toBe(200);

    // Check stats
    const stats = balancer.getQueueStats();
    console.log(`9. Queue has ${stats.depth} request`);
    expect(stats.depth).toBe(0);
  });
});