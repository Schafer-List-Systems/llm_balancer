/**
 * Concurrent Streaming Test
 *
 * This test verifies that two concurrent streaming requests to different backends
 * are processed simultaneously, not sequentially.
 *
 * Bug reproduction: The processQueueWhenBackendAvailable() function returns after
 * processing ONE request, even when multiple backends have available capacity.
 */

const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');

describe('Concurrent Streaming Requests', () => {
  let balancer;
  let backend1;
  let backend2;

  beforeEach(() => {
    // Reset any existing state
    jest.clearAllMocks();

    // Create two healthy backends with maxConcurrency = 5
    backend1 = new Backend('http://backend1:11434', 5, 'Backend1');
    backend1.healthy = true;
    backend1.backendInfo = {
      apis: { openai: { supported: true } },
      models: { openai: ['test-model'] },
      endpoints: { openai: '/v1/chat/completions' },
      healthy: true,
      detectedAt: Date.now()
    };

    backend2 = new Backend('http://backend2:11434', 5, 'Backend2');
    backend2.healthy = true;
    backend2.backendInfo = {
      apis: { openai: { supported: true } },
      models: { openai: ['test-model'] },
      endpoints: { openai: '/v1/chat/completions' },
      healthy: true,
      detectedAt: Date.now()
    };

    // Initialize balancer
    balancer = new Balancer([backend1, backend2], { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: true }, debugRequestHistorySize: 100 });
  });

  describe('processQueueWhenBackendAvailable() with different priorities', () => {
    test('should select second highest priority backend when highest is busy', async () => {
      // Setup: 3 backends with different priorities
      const highPriorityBackend = new Backend('http://high:11434', 1, 'High');
      highPriorityBackend.healthy = true;
      highPriorityBackend.priority = 10;
      highPriorityBackend.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['test-model'] },
        endpoints: { openai: '/v1/chat/completions' },
        healthy: true,
        detectedAt: Date.now()
      };

      const mediumPriorityBackend = new Backend('http://medium:11434', 1, 'Medium');
      mediumPriorityBackend.healthy = true;
      mediumPriorityBackend.priority = 5;
      mediumPriorityBackend.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['test-model'] },
        endpoints: { openai: '/v1/chat/completions' },
        healthy: true,
        detectedAt: Date.now()
      };

      const lowPriorityBackend = new Backend('http://low:11434', 1, 'Low');
      lowPriorityBackend.healthy = true;
      lowPriorityBackend.priority = 1;
      lowPriorityBackend.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['test-model'] },
        endpoints: { openai: '/v1/chat/completions' },
        healthy: true,
        detectedAt: Date.now()
      };

      const priorityBalancer = new Balancer([highPriorityBackend, mediumPriorityBackend, lowPriorityBackend], { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: true }, debugRequestHistorySize: 100 });

      // Mark high priority backend at max concurrency (busy)
      highPriorityBackend.activeRequestCount = highPriorityBackend.maxConcurrency;

      const requestsProcessed = [];

      const createMockRequest = (id) => ({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: `req-${id}`,
        timedOut: false,
        timeout: null,
        requestData: {
          req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } },
          res: { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() },
          config: { primaryApiType: 'openai' },
          matchedModel: 'test-model'
        },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      // Mock findCacheMatch to return null
      highPriorityBackend.findCacheMatch = jest.fn().mockReturnValue(null);
      mediumPriorityBackend.findCacheMatch = jest.fn().mockReturnValue(null);
      lowPriorityBackend.findCacheMatch = jest.fn().mockReturnValue(null);

      // Queue 2 requests - both should go to medium priority (high is busy)
      priorityBalancer.queue.push(createMockRequest('X'));
      priorityBalancer.queue.push(createMockRequest('Y'));

      const originalTriggerProcessing = priorityBalancer.triggerRequestProcessing;
      priorityBalancer.triggerRequestProcessing = (request, backend) => {
        requestsProcessed.push({
          requestId: request.internalRequestId,
          backendUrl: backend.url,
          backendPriority: backend.priority
        });
      };

      // Process queue - should select medium priority backend for both requests
      priorityBalancer.processQueueWhenBackendAvailable();

      priorityBalancer.triggerRequestProcessing = originalTriggerProcessing;

      // Verify: both requests should go to medium priority (priority 5), not low (priority 1)
      expect(requestsProcessed.length).toBe(2);
      expect(requestsProcessed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backendUrl: 'http://medium:11434', backendPriority: 5 }),
          expect.objectContaining({ backendUrl: 'http://medium:11434', backendPriority: 5 })
        ])
      );
    });

    test('should select highest priority available backend for queued requests', async () => {
      // Setup: 3 backends with different priorities, all available
      const backends = [
        (() => {
          const b = new Backend('http://h:11434', 1, 'H');
          b.priority = 10;
          b.healthy = true;
          b.backendInfo = {
            apis: { openai: { supported: true } },
            models: { openai: ['test-model'] },
            endpoints: { openai: '/v1/chat/completions' },
            healthy: true,
            detectedAt: Date.now()
          };
          return b;
        })(),
        (() => {
          const b = new Backend('http://m:11434', 1, 'M');
          b.priority = 5;
          b.healthy = true;
          b.backendInfo = {
            apis: { openai: { supported: true } },
            models: { openai: ['test-model'] },
            endpoints: { openai: '/v1/chat/completions' },
            healthy: true,
            detectedAt: Date.now()
          };
          return b;
        })(),
        (() => {
          const b = new Backend('http://l:11434', 1, 'L');
          b.priority = 1;
          b.healthy = true;
          b.backendInfo = {
            apis: { openai: { supported: true } },
            models: { openai: ['test-model'] },
            endpoints: { openai: '/v1/chat/completions' },
            healthy: true,
            detectedAt: Date.now()
          };
          return b;
        })()
      ];

      const testBalancer = new Balancer(backends, { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: true }, debugRequestHistorySize: 100 });

      const requestsProcessed = [];

      const createMockRequest = (id) => ({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: `req-${id}`,
        timedOut: false,
        timeout: null,
        requestData: {
          req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } },
          res: { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() },
          config: { primaryApiType: 'openai' },
          matchedModel: 'test-model'
        },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      backends.forEach(b => b.findCacheMatch = jest.fn().mockReturnValue(null));

      // Queue 3 requests
      testBalancer.queue.push(createMockRequest('A'));
      testBalancer.queue.push(createMockRequest('B'));
      testBalancer.queue.push(createMockRequest('C'));

      const originalTriggerProcessing = testBalancer.triggerRequestProcessing;
      testBalancer.triggerRequestProcessing = (request, backend) => {
        requestsProcessed.push({
          requestId: request.internalRequestId,
          backendUrl: backend.url,
          backendPriority: backend.priority
        });
      };

      // Process queue - should assign to backends by priority order
      testBalancer.processQueueWhenBackendAvailable();

      testBalancer.triggerRequestProcessing = originalTriggerProcessing;

      // Verify: All 3 requests processed to highest priority backend
      // (since triggerRequestProcessing is mocked, activeRequestCount is never incremented)
      expect(requestsProcessed.length).toBe(3);
      expect(requestsProcessed[0].backendUrl).toBe('http://h:11434');   // priority 10 - highest
      expect(requestsProcessed[1].backendUrl).toBe('http://h:11434');   // priority 10 - still available
      expect(requestsProcessed[2].backendUrl).toBe('http://h:11434');   // priority 10 - still available
    });

    test('should process multiple queued requests when backends are available', async () => {
      // Setup: Two queued requests, both backends healthy with available capacity
      const requestsProcessed = [];

      // Create a mock requestData for two requests WITHOUT cache data (simulating fresh requests)
      const createMockRequest = (id) => {
        return {
          resolve: jest.fn(),
          reject: jest.fn(),
          timestamp: Date.now(),
          internalRequestId: `req-${id}`,
          timedOut: false,
          timeout: null,
          requestData: {
            req: {
              is: jest.fn().mockReturnValue(false),
              body: { model: 'test-model', max_tokens: 50, stream: true }
            },
            res: {
              headersSent: false,
              status: jest.fn().mockReturnThis(),
              json: jest.fn()
            },
            config: { primaryApiType: 'openai' },
            matchedModel: 'test-model'
          },
          criterion: { modelString: 'test-model', apiType: 'openai' }
        };
      };

      // Also mock backend findCacheMatch to return null (no cache matches)
      backend1.findCacheMatch = jest.fn().mockReturnValue(null);
      backend2.findCacheMatch = jest.fn().mockReturnValue(null);

      // Queue two requests
      balancer.queue.push(createMockRequest('A'));
      balancer.queue.push(createMockRequest('B'));

      // Track when backend processing is called
      const originalTriggerProcessing = balancer.triggerRequestProcessing;
      balancer.triggerRequestProcessing = (request, backend, requestData) => {
        requestsProcessed.push({
          requestId: request.internalRequestId,
          backendUrl: backend.url
        });
        // Don't actually process, just track
        // Don't increment backend concurrency - we're testing queue processing, not concurrency limits
      };

      // Process queue - this should process BOTH requests (not just one)
      balancer.processQueueWhenBackendAvailable();

      // Restore original method
      balancer.triggerRequestProcessing = originalTriggerProcessing;

      // Assertion: Both requests should be processed (not just one)
      expect(requestsProcessed.length).toBe(2);
      expect(requestsProcessed).toContainEqual(
        expect.objectContaining({ requestId: 'req-A' })
      );
      expect(requestsProcessed).toContainEqual(
        expect.objectContaining({ requestId: 'req-B' })
      );
    });

    test('should process queued requests concurrently when multiple backends available', async () => {
      // Setup: Two backends both healthy, queue has 3 requests
      const requestsProcessed = [];

      const createMockRequest = (id) => ({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: `req-${id}`,
        timedOut: false,
        timeout: null,
        requestData: {
          req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model', max_tokens: 50, stream: true } },
          res: { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() },
          config: { primaryApiType: 'openai' },
          matchedModel: 'test-model'
        },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      // Also mock backend findCacheMatch to return null (no cache matches)
      backend1.findCacheMatch = jest.fn().mockReturnValue(null);
      backend2.findCacheMatch = jest.fn().mockReturnValue(null);

      balancer.queue.push(createMockRequest('1'));
      balancer.queue.push(createMockRequest('2'));
      balancer.queue.push(createMockRequest('3'));

      // Track processed requests
      const originalTriggerProcessing = balancer.triggerRequestProcessing;
      balancer.triggerRequestProcessing = (request, backend, requestData) => {
        requestsProcessed.push({
          requestId: request.internalRequestId,
          backendUrl: backend.url
        });
      };

      // Process queue
      balancer.processQueueWhenBackendAvailable();

      balancer.triggerRequestProcessing = originalTriggerProcessing;

      // With 2 backends and 3 requests:
      // Request 1 should go to backend1
      // Request 2 should go to backend2
      // Request 3 should stay queued (both backends now at 1 active request each)
      // BUT: The bug causes only 1 request to be processed, not 2
      expect(requestsProcessed.length).toBeGreaterThanOrEqual(2);
    });

    test('should decrement queue when requests are processed', () => {
      // Setup: Queue with 2 requests
      // Also mock backend findCacheMatch to return null (no cache matches)
      backend1.findCacheMatch = jest.fn().mockReturnValue(null);
      backend2.findCacheMatch = jest.fn().mockReturnValue(null);

      const originalTriggerProcessing = balancer.triggerRequestProcessing;

      balancer.queue.push({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: 'req-X',
        timedOut: false,
        timeout: null,
        requestData: { req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } }, res: {}, config: {}, matchedModel: 'test-model' },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      balancer.queue.push({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: 'req-Y',
        timedOut: false,
        timeout: null,
        requestData: { req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } }, res: {}, config: {}, matchedModel: 'test-model' },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      let requestsDequeued = 0;

      balancer.triggerRequestProcessing = (request, backend, requestData) => {
        requestsDequeued++;
      };

      // Process queue
      balancer.processQueueWhenBackendAvailable();

      balancer.triggerRequestProcessing = originalTriggerProcessing;

      // Request count should be decremented for processed requests
      // Bug: only 1 request is dequeued, should be 2
      expect(requestsDequeued).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Backend concurrency tracking', () => {
    test('activeRequestCount should properly track total requests regardless of streaming mode', () => {
      // Backend with maxConcurrency = 2
      const backend = new Backend('http://test:11434', 2);
      backend.healthy = true;

      // First streaming request
      backend.incrementStreamingRequest(() => {});
      expect(backend.activeRequestCount).toBe(1);
      expect(backend.activeStreamingRequests).toBe(1);
      expect(backend.activeNonStreamingRequests).toBe(0);

      // Second streaming request (should hit max concurrency)
      let notified = false;
      backend.incrementStreamingRequest(() => { notified = true; });
      expect(backend.activeRequestCount).toBe(2);
      expect(backend.activeStreamingRequests).toBe(2);
      expect(notified).toBe(true);

      // Third request should NOT be able to start (at max concurrency)
      let notified2 = false;
      backend.incrementStreamingRequest(() => { notified2 = true; });
      expect(backend.activeRequestCount).toBe(3);
      expect(backend.activeStreamingRequests).toBe(3);
      // Notification already fired at count 2, so notified2 is still false
      expect(notified2).toBe(false);
    });

    test('streaming and non-streaming requests share the same activeRequestCount', () => {
      const backend = new Backend('http://test:11434', 2);
      backend.healthy = true;

      // Start one streaming request
      backend.incrementStreamingRequest(() => {});
      expect(backend.activeRequestCount).toBe(1);

      // Start one non-streaming request
      backend.incrementNonStreamingRequest(() => {});
      // Both should share the same counter
      expect(backend.activeRequestCount).toBe(2);
      expect(backend.activeStreamingRequests).toBe(1);
      expect(backend.activeNonStreamingRequests).toBe(1);

      // Should be at max concurrency now
      expect(backend.activeRequestCount).toBe(2);
    });
  });

  describe('End-to-end concurrent request simulation', () => {
    test('two backends should handle concurrent requests simultaneously', () => {
      // Create backends
      const b1 = new Backend('http://b1:11434', 5);
      b1.healthy = true;
      b1.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['test-model'] },
        endpoints: { openai: '/v1/chat/completions' },
        healthy: true,
        detectedAt: Date.now()
      };
      const b2 = new Backend('http://b2:11434', 5);
      b2.healthy = true;
      b2.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['test-model'] },
        endpoints: { openai: '/v1/chat/completions' },
        healthy: true,
        detectedAt: Date.now()
      };

      // Create balancer
      const testBalancer = new Balancer([b1, b2], { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: true }, debugRequestHistorySize: 100 });

      // Mock backend findCacheMatch to return null (no cache matches)
      b1.findCacheMatch = jest.fn().mockReturnValue(null);
      b2.findCacheMatch = jest.fn().mockReturnValue(null);

      // Queue 3 requests
      const requestsStarted = [];
      const requestIds = ['req-0001', 'req-0002', 'req-0003'];

      const createRequest = (id) => ({
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: Date.now(),
        internalRequestId: id,
        timedOut: false,
        timeout: null,
        requestData: {
          req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } },
          res: {},
          config: { primaryApiType: 'openai' },
          matchedModel: 'test-model'
        },
        criterion: { modelString: 'test-model', apiType: 'openai' }
      });

      requestIds.forEach(id => testBalancer.queue.push(createRequest(id)));

      // Track which backend handles which request
      const originalTrigger = testBalancer.triggerRequestProcessing;
      testBalancer.triggerRequestProcessing = (request, backend) => {
        requestsStarted.push({
          requestId: request.internalRequestId,
          backend: backend.url
        });
        // Don't actually process
      };

      // Process queue
      testBalancer.processQueueWhenBackendAvailable();

      // Restore
      testBalancer.triggerRequestProcessing = originalTrigger;

      // Expected: All 3 requests should be dequeued and assigned to backends
      // (first 2 go to different backends, 3rd stays queued since backends now at 1)
      // Bug: Only 1 request gets dequeued
      expect(requestsStarted.length).toBeGreaterThanOrEqual(2);
    });
  });
});
