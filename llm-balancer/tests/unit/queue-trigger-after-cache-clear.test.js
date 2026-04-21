/**
 * Tests for triggerQueueProcessing() method
 * Verifies that queue processing can be triggered from external callers
 * Used after cache operations to re-evaluate queued requests
 */

const Balancer = require('../../balancer');
const Backend = require('../../backends/Backend');

describe('triggerQueueProcessing', () => {
  let balancer;
  let mockBackend;

  beforeEach(() => {
    mockBackend = new Backend('http://mock-backend:11434', 2);
    mockBackend.state = 'healthy';
    mockBackend.supportedModels = ['test-model', 'unknown-model'];
    balancer = new Balancer([mockBackend], { maxQueueSize: 10, queue: { timeout: 300000 }, debug: { enabled: true }, debugRequestHistorySize: 100 });

    // Mock the selector to return appropriate status based on model
    balancer.selector.selectBackendWithCache = jest.fn().mockImplementation((backends, criterion, promptBody) => {
      if (criterion?.modelString === 'unknown-model') {
        return {
          status: 'none',
          backend: null,
          actualModel: null,
          message: 'No backend supports this model'
        };
      }
      if (criterion?.modelString === 'busy-model') {
        return {
          status: 'busy',
          backend: null,
          actualModel: 'busy-model',
          message: 'All backends supporting this model are currently busy'
        };
      }
      return {
        status: 'found',
        backend: mockBackend,
        actualModel: 'test-model',
        message: null
      };
    });

    // Mock triggerRequestProcessing to track when it's called but not actually process
    balancer.triggerRequestProcessing = jest.fn();
  });

  afterEach(() => {
    // Clean up any pending timeouts
    Object.values(balancer.timedOutRequests || {}).forEach(clearTimeout);
    jest.clearAllMocks();
  });

  describe('triggerQueueProcessing()', () => {
    it('should return false when queue is empty', () => {
      const result = balancer.triggerQueueProcessing();
      expect(result).toBe(false);
    });

    it('should return false when queue has requests but none can be processed (model not supported)', () => {
      // Add a request to queue with a model that backend doesn't support
      const request = {
        internalRequestId: 'test-1',
        criterion: { modelString: 'unknown-model' },
        timedOut: false,
        reject: jest.fn()
      };
      balancer.queue.push(request);
      balancer.requestCount.set('queued', 1);

      const initialLength = balancer.queue.length;
      const result = balancer.triggerQueueProcessing();

      // Request should not be processed (model not supported) - it should be rejected and removed
      expect(result).toBe(false);
      // Request is removed from queue because it cannot be processed (status='none')
      expect(balancer.queue.length).toBe(0);
      expect(balancer.requestCount.get('queued')).toBe(0);
    });

    it('should return true when a request is successfully processed', () => {
      // Add a valid request to queue with properly mocked req object
      const mockReq = {
        is: jest.fn().mockReturnValue(false),
        body: { model: 'test-model', prompt: 'test' }
      };
      const request = {
        internalRequestId: 'test-1',
        criterion: { modelString: 'test-model' },
        requestData: { req: mockReq },
        reject: jest.fn(),
        resolve: jest.fn(),
        timeout: null
      };
      balancer.queue.push(request);
      balancer.requestCount.set('queued', 1);

      const initialLength = balancer.queue.length;
      const result = balancer.triggerQueueProcessing();

      expect(result).toBe(true);
      expect(balancer.queue.length).toBe(initialLength - 1);
      expect(balancer.requestCount.get('queued')).toBe(0);
      expect(balancer.triggerRequestProcessing).toHaveBeenCalled();
    });

    it('should safely handle null/undefined queue', () => {
      // Simulate edge case where queue might be null
      const originalQueue = balancer.queue;
      balancer.queue = null;

      expect(() => balancer.triggerQueueProcessing()).not.toThrow();
      expect(balancer.triggerQueueProcessing()).toBe(false);

      balancer.queue = originalQueue;
    });

    it('should process ALL eligible requests per call', () => {
      // Add multiple requests to queue
      for (let i = 0; i < 3; i++) {
        balancer.queue.push({
          internalRequestId: `test-${i}`,
          criterion: { modelString: 'test-model' },
          requestData: { req: { is: jest.fn().mockReturnValue(false), body: { model: 'test-model' } } },
          reject: jest.fn(),
          resolve: jest.fn(),
          timeout: null
        });
      }
      balancer.requestCount.set('queued', 3);

      const result = balancer.triggerQueueProcessing();

      // Should process ALL 3 requests (new behavior after fix)
      expect(balancer.queue.length).toBe(0);
      expect(balancer.triggerRequestProcessing).toHaveBeenCalledTimes(3);
    });

    it('should handle timed out requests correctly', () => {
      // Add a timed out request
      const timedOutRequest = {
        internalRequestId: 'timed-out',
        criterion: { modelString: 'unknown-model' },
        timedOut: true,
        reject: jest.fn()
      };
      balancer.queue.push(timedOutRequest);
      balancer.requestCount.set('queued', 1);

      const initialLength = balancer.queue.length;
      const result = balancer.triggerQueueProcessing();

      // Timed out request should be removed but not "processed"
      expect(result).toBe(false);
      expect(balancer.queue.length).toBe(initialLength - 1);
    });

    it('should keep requests in queue when all backends are busy (status=busy)', () => {
      // Add a request where all backends are busy - should NOT be removed from queue
      const busyRequest = {
        internalRequestId: 'busy-test',
        criterion: { modelString: 'busy-model' },
        timedOut: false,
        reject: jest.fn()
      };
      balancer.queue.push(busyRequest);
      balancer.requestCount.set('queued', 1);

      const initialLength = balancer.queue.length;
      const result = balancer.triggerQueueProcessing();

      // No request should be processed
      expect(result).toBe(false);
      // Request should STAY in queue (not be removed)
      expect(balancer.queue.length).toBe(initialLength);
      expect(balancer.requestCount.get('queued')).toBe(1);
    });
  });
});
