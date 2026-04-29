/**
 * Unit Tests for Request Processor Timeout Handling
 *
 * These tests verify the unified release mechanism works correctly
 * for both streaming and non-streaming requests.
 */

const Backend = require('../../backends/Backend');
const requestProcessor = require('../../request-processor');

describe('Request Processor Timeout Handling', () => {
  let mockBalancer;
  let backend;

  beforeEach(() => {
    mockBalancer = {
      notifyBackendAvailable: jest.fn(),
      markFailed: jest.fn(),
      trackDebugRequest: jest.fn()
    };

    // Create a fresh backend with maxConcurrency of 2
    backend = new Backend('http://localhost:3000', 2, 'test-backend');
    backend.healthy = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Non-streaming request timeout', () => {
    it('Non-streaming request timeout should properly release backend', () => {
      // Request starts (counter incremented at selection time)
      backend.incrementRequest();

      // Verify request is active
      expect(backend.activeRequestCount).toBe(1);

      // Simulate timeout - release backend
      requestProcessor.releaseBackend(mockBalancer, backend, 'non-streaming');

      // RESULT: Backend should be properly released
      expect(backend.activeRequestCount).toBe(0);
    });
  });

  describe('Streaming request timeout', () => {
    it('Streaming request timeout should properly release backend', () => {
      // Request starts (counter incremented at selection time)
      backend.incrementRequest();

      // Verify request is active
      expect(backend.activeRequestCount).toBe(1);

      // Simulate timeout - release backend
      requestProcessor.releaseBackend(mockBalancer, backend, 'streaming');

      // RESULT: Backend should be properly released
      expect(backend.activeRequestCount).toBe(0);
    });
  });
});
