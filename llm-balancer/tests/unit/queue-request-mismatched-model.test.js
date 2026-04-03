const Balancer = require('../../balancer');
const { createTestBackendWithPriority } = require('./helpers/backend-factory');

describe('Queue Request - Hanging Request Bug', () => {
  /**
   * This test verifies the fix for the hanging request bug:
   * Requests for models that NO backend supports are now rejected immediately
   * instead of staying in the queue forever.
   */
  it('request with non-matching model should be rejected immediately', async () => {
    // Use a real model name from running backends - 'qwen3.5-35b-a3b' is commonly available
    const REALISTIC_MODEL = 'qwen3.5-35b-a3b';
    const NON_MATCHING_MODEL = 'nonexistent-model-that-does-not-exist-xyz123';

    const backend1 = createTestBackendWithPriority('http://backend1:11434', 'openai', [REALISTIC_MODEL], 1, 10);

    const balancer = new Balancer([backend1], 100, 30000, true);

    const requestData = {
      req: { is: () => false, body: { model: NON_MATCHING_MODEL, messages: [] } },
      res: {},
      config: { primaryApiType: 'openai', request: { timeout: 30000 } },
      criterion: { modelString: NON_MATCHING_MODEL, apiType: 'openai' },
      resolve: () => {},
      reject: (err) => { throw err; }  // Propagate rejection as error
    };

    console.log('\n=== NON-MATCHING MODEL TEST ===');
    console.log(`1. Backend available, supports: ${REALISTIC_MODEL}`);
    console.log(`2. Request for: ${NON_MATCHING_MODEL} (NOT supported)`);

    let rejectionError;

    try {
      const promise = balancer.queueRequestWithRequestData(requestData);
      await promise;  // Should never resolve
    } catch (err) {
      rejectionError = err;
      console.log(`3. Request rejected: ${err.message}`);
    }

    // Wait for any async cleanup
    await new Promise(r => setTimeout(r, 50));

    // Queue should be empty (request was rejected and removed)
    console.log(`4. Queue depth: ${balancer.getQueueStats().depth}`);

    // With the fix: request rejected immediately, queue stays empty
    expect(balancer.getQueueStats().depth).toBe(0);
    expect(rejectionError).toBeTruthy();
    // Message now includes the model name: "No backend supports this model: <model>"
    expect(rejectionError.message).toContain('No backend supports this model');

    console.log('\n*** PASS: Request rejected immediately for non-matching model ***');
    console.log('*** FIX VERIFIED: No hanging requests in queue ***');
  });

  /**
   * Test queue processing for busy backends (requests should stay in queue until backend available)
   */
  it('request with valid busy model should stay in queue', async () => {
    const backend1 = createTestBackendWithPriority('http://backend1:11434', 'openai', ['llama-3'], 1, 1);
    const backend2 = createTestBackendWithPriority('http://backend2:11434', 'openai', ['llama-3'], 2, 1);

    // Make both backends busy
    backend1.activeRequestCount = 1;
    backend2.activeRequestCount = 1;

    const balancer = new Balancer([backend1, backend2], 100, 2000, true);

    let requestProcessed = false;

    const requestData = {
      req: { is: () => false, body: { model: 'llama-3', messages: [] } },
      res: {
        headersSent: false,
        status: () => ({ json: () => {} }),
        json: () => {},
        end: () => { requestProcessed = true; }
      },
      config: { primaryApiType: 'openai', request: { timeout: 5000 } },
      criterion: { modelString: 'llama-3', apiType: 'openai' },
      resolve: () => { requestProcessed = true; },
      reject: () => {}
    };

    console.log('\n=== BUSY BACKEND TEST ===');
    console.log('1. Both backends busy (activeRequestCount=1), support llama-3');
    console.log('2. Queue request for llama-3');

    balancer.queueRequestWithRequestData(requestData);
    await new Promise(r => setTimeout(r, 50));

    console.log(`3. Queue depth: ${balancer.getQueueStats().depth}`);
    expect(balancer.getQueueStats().depth).toBe(1);

    // Release backend1
    console.log('4. Releasing backend1...');
    backend1.activeRequestCount = 0;
    balancer.notifyBackendAvailable();
    await new Promise(r => setTimeout(r, 100));

    console.log(`5. Queue depth after release: ${balancer.getQueueStats().depth}`);
    // Request was processed, queue is empty
    expect(balancer.getQueueStats().depth).toBe(0);

    console.log('\n*** PASS: Queue correctly processes requests when backend available ***');
  });
});
