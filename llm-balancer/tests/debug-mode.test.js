/**
 * Comprehensive tests for debug mode functionality
 * Verifies request tracking, history management, and filtering
 */

const Balancer = require('../balancer');

describe('Debug Mode', () => {
  let backends;
  let balancerDisabled;
  let balancerEnabled;

  beforeEach(() => {
    backends = [
      { url: 'http://backend1:11434', priority: 1, healthy: true, busy: false, requestCount: 0, errorCount: 0 },
      { url: 'http://backend2:11434', priority: 2, healthy: true, busy: false, requestCount: 0, errorCount: 0 }
    ];

    // Create balancer with debug disabled (default)
    balancerDisabled = new Balancer(backends, 100, 30000, false);

    // Create balancer with debug enabled
    balancerEnabled = new Balancer(backends, 100, 30000, true, 50);
  });

  describe('Debug Mode Initialization', () => {
    it('should disable tracking when debug is false', () => {
      expect(balancerDisabled.debug).toBe(false);
    });

    it('should enable tracking when debug is true', () => {
      expect(balancerEnabled.debug).toBe(true);
    });

    it('should initialize empty request history', () => {
      const history = balancerEnabled.getDebugRequestHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should return empty array when debug is disabled', () => {
      const history = balancerDisabled.getDebugRequestHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should respect debug request history size limit', () => {
      const limitedBalancer = new Balancer(backends, 100, 30000, true, 5);
      expect(limitedBalancer.debugRequestHistorySize).toBe(5);
    });
  });

  describe('trackDebugRequest', () => {
    it('should not track when debug is disabled', () => {
      const metadata = {
        route: '/v1/messages',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      balancerDisabled.trackDebugRequest(metadata);
      const history = balancerDisabled.getDebugRequestHistory();
      expect(history.length).toBe(0);
    });

    it('should track request metadata when debug is enabled', () => {
      const metadata = {
        route: '/v1/messages',
        method: 'POST',
        priority: 2,
        backendId: 'http://backend2:11434',
        backendUrl: 'http://backend2:11434'
      };

      balancerEnabled.trackDebugRequest(metadata);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history.length).toBe(1);
      expect(history[0].route).toBe('/v1/messages');
      expect(history[0].method).toBe('POST');
      expect(history[0].priority).toBe(2);
      expect(history[0].backendId).toBe('http://backend2:11434');
    });

    it('should include timestamp in tracked request', () => {
      const metadata = {
        route: '/api/generate',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      balancerEnabled.trackDebugRequest(metadata);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history[0].timestamp).toBeDefined();
      expect(typeof history[0].timestamp).toBe('number');
    });

    it('should assign sequential ID to requests', () => {
      const metadata1 = {
        route: '/v1/messages',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      const metadata2 = {
        route: '/v1/messages',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend2:11434',
        backendUrl: 'http://backend2:11434'
      };

      balancerEnabled.trackDebugRequest(metadata1);
      balancerEnabled.trackDebugRequest(metadata2);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history[0].id).toBe(2);
      expect(history[1].id).toBe(1);
    });

    it('should include request content when provided', () => {
      const metadata = {
        route: '/v1/messages',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      const requestData = { model: 'llama2', messages: [], stream: false };

      balancerEnabled.trackDebugRequest(metadata, requestData);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history[0].requestContent).toEqual(requestData);
    });

    it('should include response content when provided', () => {
      const metadata = {
        route: '/v1/messages',
        method: 'POST',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      const responseData = { data: 'test response', contentType: 'application/json', statusCode: 200 };

      balancerEnabled.trackDebugRequest(metadata, null, responseData);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history[0].responseContent).toEqual(responseData);
    });

    it('should add new requests to the front of the array', () => {
      // Track first request
      balancerEnabled.trackDebugRequest({
        route: '/first',
        method: 'GET',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      });

      // Track second request
      balancerEnabled.trackDebugRequest({
        route: '/second',
        method: 'GET',
        priority: 1,
        backendId: 'http://backend2:11434',
        backendUrl: 'http://backend2:11434'
      });

      const history = balancerEnabled.getDebugRequestHistory();

      // Most recent should be first (unshift behavior)
      expect(history[0].route).toBe('/second');
      expect(history[1].route).toBe('/first');
    });
  });

  describe('Debug History Size Limit', () => {
    it('should limit history to configured size', () => {
      const smallHistoryBalancer = new Balancer(backends, 100, 30000, true, 3);

      // Track more requests than the limit
      for (let i = 0; i < 5; i++) {
        smallHistoryBalancer.trackDebugRequest({
          route: `/request${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      const history = smallHistoryBalancer.getDebugRequestHistory();
      expect(history.length).toBe(3); // Should only keep last 3
    });

    it('should remove oldest entries when limit exceeded', () => {
      const limitedBalancer = new Balancer(backends, 100, 30000, true, 2);

      // Track requests
      limitedBalancer.trackDebugRequest({ route: '/first', method: 'GET', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });
      limitedBalancer.trackDebugRequest({ route: '/second', method: 'GET', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });
      limitedBalancer.trackDebugRequest({ route: '/third', method: 'GET', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });

      const history = limitedBalancer.getDebugRequestHistory();
      expect(history.length).toBe(2);
      // Should have kept the last two
      expect(history[0].route).toBe('/third');
      expect(history[1].route).toBe('/second');
    });

    it('should maintain FIFO order with newest first', () => {
      const limitedBalancer = new Balancer(backends, 100, 30000, true, 5);

      for (let i = 0; i < 10; i++) {
        limitedBalancer.trackDebugRequest({
          route: `/request${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      const history = limitedBalancer.getDebugRequestHistory();
      expect(history.length).toBe(5);
      // Most recent (9) should be first, oldest kept (5) should be last
      expect(history[0].route).toBe('/request9');
      expect(history[4].route).toBe('/request5');
    });
  });

  describe('getDebugRequestsFiltered', () => {
    it('should return all requests when no filter specified', () => {
      // Track multiple requests for different backends
      balancerEnabled.trackDebugRequest({ route: '/req1', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });
      balancerEnabled.trackDebugRequest({ route: '/req2', method: 'POST', priority: 1, backendId: 'http://backend2:11434', backendUrl: 'http://backend2:11434' });
      balancerEnabled.trackDebugRequest({ route: '/req3', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });

      const allRequests = balancerEnabled.getDebugRequestsFiltered();
      expect(allRequests.length).toBe(3);
    });

    it('should filter by backend ID when specified', () => {
      // Track requests for different backends
      balancerEnabled.trackDebugRequest({ route: '/req1', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });
      balancerEnabled.trackDebugRequest({ route: '/req2', method: 'POST', priority: 1, backendId: 'http://backend2:11434', backendUrl: 'http://backend2:11434' });
      balancerEnabled.trackDebugRequest({ route: '/req3', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });

      const filtered = balancerEnabled.getDebugRequestsFiltered('http://backend1:11434');
      expect(filtered.length).toBe(2);
      filtered.forEach(req => expect(req.backendId).toBe('http://backend1:11434'));
    });

    it('should apply limit to filtered results', () => {
      // Track multiple requests for same backend
      for (let i = 0; i < 5; i++) {
        balancerEnabled.trackDebugRequest({
          route: `/req${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      const limited = balancerEnabled.getDebugRequestsFiltered('http://backend1:11434', 2);
      expect(limited.length).toBe(2);
    });

    it('should return empty array when no matching backend ID', () => {
      balancerEnabled.trackDebugRequest({ route: '/req1', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });

      const filtered = balancerEnabled.getDebugRequestsFiltered('http://nonexistent:11434');
      expect(filtered.length).toBe(0);
    });

    it('should return empty array when debug is disabled', () => {
      const history = balancerDisabled.getDebugRequestsFiltered();
      expect(history.length).toBe(0);
    });

    it('should filter and limit together correctly', () => {
      // Track 10 requests for backend1, 5 for backend2
      for (let i = 0; i < 10; i++) {
        balancerEnabled.trackDebugRequest({
          route: `/backend1/req${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      for (let i = 0; i < 5; i++) {
        balancerEnabled.trackDebugRequest({
          route: `/backend2/req${i}`,
          method: 'POST',
          priority: 2,
          backendId: 'http://backend2:11434',
          backendUrl: 'http://backend2:11434'
        });
      }

      const filtered = balancerEnabled.getDebugRequestsFiltered('http://backend2:11434', 3);
      expect(filtered.length).toBe(3);
    });
  });

  describe('getDebugStats', () => {
    it('should return enabled:false when debug is disabled', () => {
      const stats = balancerDisabled.getDebugStats();
      expect(stats.enabled).toBe(false);
    });

    it('should return correct stats when debug is enabled', () => {
      // Track a few requests first
      for (let i = 0; i < 3; i++) {
        balancerEnabled.trackDebugRequest({
          route: `/req${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      const stats = balancerEnabled.getDebugStats();
      expect(stats.enabled).toBe(true);
      expect(stats.totalRequests).toBe(3);
      expect(typeof stats.queueSize).toBe('number');
      expect(stats.requestHistorySize).toBe(50); // Default from constructor
    });

    it('should return totalRequests matching history length', () => {
      balancerEnabled.trackDebugRequest({ route: '/req1', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });
      balancerEnabled.trackDebugRequest({ route: '/req2', method: 'POST', priority: 1, backendId: 'http://backend1:11434', backendUrl: 'http://backend1:11434' });

      const stats = balancerEnabled.getDebugStats();
      expect(stats.totalRequests).toBe(2);
    });
  });

  describe('clearDebugRequestHistory', () => {
    it('should clear all tracked requests when debug is enabled', () => {
      // Track some requests
      for (let i = 0; i < 5; i++) {
        balancerEnabled.trackDebugRequest({
          route: `/req${i}`,
          method: 'POST',
          priority: 1,
          backendId: 'http://backend1:11434',
          backendUrl: 'http://backend1:11434'
        });
      }

      expect(balancerEnabled.getDebugRequestHistory().length).toBe(5);

      balancerEnabled.clearDebugRequestHistory();

      const history = balancerEnabled.getDebugRequestHistory();
      expect(history.length).toBe(0);
    });

    it('should be no-op when debug is disabled', () => {
      // Should not throw
      expect(() => {
        balancerDisabled.clearDebugRequestHistory();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tracking request with undefined content', () => {
      const metadata = {
        route: '/test',
        method: 'GET',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      // Should not throw with null/undefined content
      expect(() => {
        balancerEnabled.trackDebugRequest(metadata, undefined, undefined);
      }).not.toThrow();

      const history = balancerEnabled.getDebugRequestHistory();
      // Note: default parameter converts undefined to null
      expect(history[0].requestContent).toBe(null);
      expect(history[0].responseContent).toBe(null);
    });

    it('should handle tracking request with null content', () => {
      const metadata = {
        route: '/test',
        method: 'GET',
        priority: 1,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      expect(() => {
        balancerEnabled.trackDebugRequest(metadata, null, null);
      }).not.toThrow();
    });

    it('should handle tracking with complex request/response objects', () => {
      const metadata = {
        route: '/v1/messages',
        method: 'POST',
        priority: 2,
        backendId: 'http://backend1:11434',
        backendUrl: 'http://backend1:11434'
      };

      const complexRequest = {
        model: 'llama2',
        messages: [
          { role: 'user', content: 'Hello, world!' },
          { role: 'assistant', content: 'Hi there!' }
        ],
        stream: false,
        options: { temperature: 0.7, max_tokens: -1 }
      };

      const complexResponse = {
        model: 'llama2',
        message: { role: 'assistant', content: 'Hello! How can I help you today?' },
        done: true,
        total_duration: 1234567890,
        load_duration: 123456,
        prompt_eval_count: 5,
        eval_count: 12,
        eval_duration: 1234000000
      };

      balancerEnabled.trackDebugRequest(metadata, complexRequest, complexResponse);
      const history = balancerEnabled.getDebugRequestHistory();

      expect(history[0].requestContent).toEqual(complexRequest);
      expect(history[0].responseContent).toEqual(complexResponse);
    });
  });
});
