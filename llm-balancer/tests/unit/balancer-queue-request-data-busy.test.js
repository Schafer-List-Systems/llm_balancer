const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');
const { createTestBackendWithPriority } = require('./helpers/backend-factory');

describe('Balancer queueRequestWithRequestData increments activeRequestCount', () => {
  let backends;
  let balancer;
  let httpRequestSpy;

  beforeEach(() => {
    backends = [
      createTestBackendWithPriority('http://backend1:11434', 'openai', ['test'], 1, 10),
      createTestBackendWithPriority('http://backend2:11434', 'openai', ['test'], 2, 10)
    ];
    balancer = new Balancer(backends, {
      maxQueueSize: 100,
      queue: { timeout: 30000 },
      debug: { enabled: false },
      debugRequestHistorySize: 100
    });

    // Mock http.request to prevent actual network calls
    // The test exercises the REAL production code path;
    // mocks are only scaffolding to avoid network dependencies.
    const http = require('http');
    httpRequestSpy = jest.spyOn(http, 'request').mockImplementation(() => {
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        destroy: jest.fn()
      };
      return mockReq;
    });
  });

  afterEach(() => {
    if (balancer.queue) {
      for (const req of balancer.queue) {
        if (req.timeout) clearTimeout(req.timeout);
        if (req.reject) req.reject(new Error('test cleanup'));
      }
      balancer.queue.length = 0;
    }
    httpRequestSpy.mockRestore();
  });

  /**
   * Test that queueRequestWithRequestData resolves the Promise when a backend is found.
   * This tests the REAL production code path:
   *   queueRequestWithRequestData → processQueueWhenBackendAvailable → triggerRequestProcessing → processRequest
   *
   * Mocks are only used as scaffolding for Express req/res objects and network calls
   * that the real code expects.
   *
   * Bug being tested: queueRequestWithRequestData creates a Promise with resolve/reject,
   * but processQueueWhenBackendAvailable calls triggerRequestProcessing without calling resolve(),
   * so the Promise never resolves and the Express route's await hangs forever.
   * This means processRequest (which increments activeRequestCount) runs, but the
   * increment never gets reported to the frontend because the release path is broken.
   */
  it('should resolve the Promise returned by queueRequestWithRequestData', async () => {
    const mockReq = {
      connection: { remoteAddress: '127.0.0.1' },
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      is: () => false
    };
    const mockRes = { headersSent: false };
    const criterion = { modelString: 'test', apiType: 'openai' };
    // Proper config matching what request-processor expects
    const mockConfig = { request: { timeout: 5000 } };

    const promise = balancer.queueRequestWithRequestData({
      req: mockReq,
      res: mockRes,
      config: mockConfig,
      criterion
    });

    // This should resolve with a backend
    const result = await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('queueRequestWithRequestData timed out')), 3000)
      )
    ]);

    // Promise should resolve with a backend
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Backend);
    expect(result.url).toBeDefined();
  }, 5000);

  /**
   * Test that activeRequestCount is incremented when request goes through the queue.
   * The real processRequest calls incrementNonStreamingRequest which bumps activeRequestCount.
   */
  it('should increment backend.activeRequestCount when backend is selected via queueRequestWithRequestData', async () => {
    const backend0 = backends[0];
    const initialActiveCount = backend0.activeRequestCount;

    const mockReq = {
      connection: { remoteAddress: '127.0.0.1' },
      url: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      is: () => false
    };
    const mockRes = { headersSent: false };
    const criterion = { modelString: 'test', apiType: 'openai' };
    const mockConfig = { request: { timeout: 5000 } };

    const promise = balancer.queueRequestWithRequestData({
      req: mockReq,
      res: mockRes,
      config: mockConfig,
      criterion
    });

    await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('queueRequestWithRequestData timed out')), 3000)
      )
    ]);

    // At least one backend should have activeRequestCount incremented
    const anyIncremented = backends.some(b => b.activeRequestCount > initialActiveCount);
    expect(anyIncremented).toBe(true);
  }, 5000);
});
