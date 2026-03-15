/**
 * Test to verify the fix for the pending request bug where requests hang in the queue.
 *
 * SCENARIO FROM PRODUCTION:
 * User reported 1 pending request even though all backends were healthy and available.
 * The bug occurred when selectBackendWithCache returned null for a request,
 * causing the request to hang indefinitely in the queue.
 *
 * FIX VERIFIED:
 * Requests for models that NO backend supports are now rejected immediately.
 */

const Balancer = require('../../balancer');

describe('Pending Request Bug (FIXED)', () => {
  it('request for non-existent model is rejected immediately', async () => {
    console.log('\n=== HANGING REQUEST TEST ===\n');

    const backends = [
      {
        url: 'http://backend1:11434',
        priority: 1,
        healthy: true,
        activeRequestCount: 0,
        maxConcurrency: 1,
        getApiTypes: () => ['openai'],
        getModels: () => ['llama-3'],
        findCacheMatch: () => null
      },
      {
        url: 'http://backend2:11434',
        priority: 2,
        healthy: true,
        activeRequestCount: 0,
        maxConcurrency: 1,
        getApiTypes: () => ['openai'],
        getModels: () => ['mistral'],
        findCacheMatch: () => null
      }
    ];

    const balancer = new Balancer(backends, 100, 2000, true);

    // Request for model that doesn't exist on any backend
    const requestData = {
      req: { is: () => false, body: { model: 'gpt-4', messages: [] } },
      res: {},
      config: { primaryApiType: 'openai' },
      criterion: { modelString: 'gpt-4', apiType: 'openai' }
    };

    console.log('1. Backends: backend1=[llama-3], backend2=[mistral]');
    console.log('2. Request model: gpt-4 (NO MATCH!)');
    console.log('3. Queuing request...\n');

    const requestDataWithPromise = {
      ...requestData,
      resolve: () => {},
      reject: (err) => { throw err; }  // Propagate the error immediately
    };

    let rejectionError;

    try {
      const promise = balancer.queueRequestWithRequestData(requestDataWithPromise);
      await promise;  // This should never resolve
    } catch (error) {
      rejectionError = error;
      console.log(`4. Request rejected synchronously: ${error.message}\n`);
    }

    // With the fix: requests for non-existent models are rejected immediately
    // Queue depth should be 0 (no hanging request)
    const depthAfterProcessing = balancer.getQueueStats().depth;
    console.log(`5. Queue depth after rejection: ${depthAfterProcessing}`);
    expect(depthAfterProcessing).toBe(0);

    // The promise should be rejected immediately with "No backend supports this model"
    expect(rejectionError).toBeTruthy();
    expect(rejectionError.message).toBe('No backend supports this model');

    console.log('\n*** BUG FIXED ***');
    console.log('Requests for non-existent models are rejected immediately.');
    console.log('No hanging request in the queue.');
  });

  it('confirms the timedOut flag is never set (root cause)', async () => {
    const backends = [
      {
        url: 'http://backend1:11434',
        priority: 1,
        healthy: true,
        activeRequestCount: 1,  // Busy
        maxConcurrency: 1,
        getApiTypes: () => ['openai'],
        getModels: () => ['test-model'],
        findCacheMatch: () => null
      }
    ];

    const balancer = new Balancer(backends, 100, 1000, true);

    console.log('\n=== TIMEOUT FLAG TEST ===\n');

    const requestData = {
      req: { is: () => false, body: { model: 'test-model', messages: [] } },
      res: {},
      config: { primaryApiType: 'openai' },
      criterion: { modelString: 'test-model', apiType: 'openai' }
    };

    console.log('1. Backend1 is busy, queuing request with 1s timeout');

    const promise = balancer.queueRequestWithRequestData(requestData);
    await new Promise(r => setTimeout(r, 50));

    const queuedRequest = balancer.queue[0];
    console.log(`2. Before timeout - timedOut: ${queuedRequest.timedOut}\n`);

    // Wait for timeout
    try {
      await promise;
    } catch (error) {
      console.log(`3. Request rejected: ${error.message}\n`);
    }

    await new Promise(r => setTimeout(r, 200));

    console.log(`4. After timeout - timedOut: ${queuedRequest.timedOut}`);

    // Trigger cleanup
    balancer.processQueueWhenBackendAvailable();

    console.log(`5. Queue depth after cleanup: ${balancer.getQueueStats().depth}\n`);

    if (!queuedRequest.timedOut) {
      console.log('*** BUG: timedOut flag was never set! ***');
    }

    if (balancer.getQueueStats().depth === 1) {
      throw new Error('Root cause: request still stuck in queue after cleanup');
    }
  });
});
