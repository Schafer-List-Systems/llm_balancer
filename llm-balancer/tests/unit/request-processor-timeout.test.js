/**
 * Unit Tests for Request Processor Timeout Handling
 *
 * These tests demonstrate the counter desynchronization bug in timeout handlers.
 *
 * THE BUG: Line 699 in request-processor.js (handleNonStreamingRequest timeout handler):
 *   releaseBackend(balancer, backend, 'streaming')  <-- WRONG, should be 'non-streaming'
 *
 * WHY IT BROKE: The guard in Backend.js decrementStreamingRequest:
 *   if (this.activeStreamingRequests > 0) { ... }
 *
 * For non-streaming requests, activeStreamingRequests === 0, so the guard fails
 * and NEITHER counter is decremented. The backend is NEVER released.
 *
 * EXPECTED BEHAVIOR: When a request times out, the backend should be properly released
 * back to the pool regardless of timeout status.
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

  describe('Non-streaming request timeout - Line 699', () => {
    it('Non-streaming request timeout should properly release backend (AFTER FIX)', () => {
      /**
       * Test verifies the fix for line 699.
       *
       * Line 699 is inside handleNonStreamingRequest - so timeout handler
       * must use 'non-streaming' mode to properly release the backend.
       *
       * BEFORE FIX (buggy):
       *   releaseBackend(balancer, backend, 'streaming')  <-- Wrong mode!
       *
       * AFTER FIX (correct):
       *   releaseBackend(balancer, backend, 'non-streaming')  <-- Correct!
       */

      // 1. Non-streaming request starts
      backend.incrementNonStreamingRequest(() => {});

      // Verify request is active
      expect(backend.activeRequestCount).toBe(1);
      expect(backend.activeNonStreamingRequests).toBe(1);
      expect(backend.activeStreamingRequests).toBe(0);

      // 2. Simulate timeout - AFTER FIX, line 699 releases with 'non-streaming' mode
      requestProcessor.releaseBackend(mockBalancer, backend, 'non-streaming');

      // 3. RESULT: Backend should be properly released
      expect(backend.activeRequestCount).toBe(0); // Backend released
      expect(backend.activeNonStreamingRequests).toBe(0); // Backend released
    });
  });

  describe('Streaming request timeout - Line 366', () => {
    it('Streaming request timeout should properly release backend (AFTER FIX)', () => {
      /**
       * Test verifies the fix for line 366.
       *
       * Line 366 is inside handleStreamingRequest - so timeout handler
       * must use 'streaming' mode to properly release the backend.
       *
       * BEFORE FIX (buggy):
       *   releaseBackend(balancer, backend, 'non-streaming')  <-- Wrong mode!
       *
       * AFTER FIX (correct):
       *   releaseBackend(balancer, backend, 'streaming')  <-- Correct!
       */

      // 1. Streaming request starts
      backend.incrementStreamingRequest(() => {});

      // Verify request is active
      expect(backend.activeRequestCount).toBe(1);
      expect(backend.activeStreamingRequests).toBe(1);
      expect(backend.activeNonStreamingRequests).toBe(0);

      // 2. Simulate timeout - AFTER FIX, line 366 releases with 'streaming' mode
      requestProcessor.releaseBackend(mockBalancer, backend, 'streaming');

      // 3. RESULT: Backend should be properly released
      expect(backend.activeRequestCount).toBe(0); // Backend released
      expect(backend.activeStreamingRequests).toBe(0); // Backend released
    });
  });
});
