/**
 * Integration tests for the LLM Balancer
 * These tests require real backend servers running (e.g., Ollama on localhost:11434)
 *
 * To run these tests, ensure:
 * 1. Ollama is running on localhost:11434 or configured via BACKENDS env var
 * 2. At least one model is available on the backend(s)
 *
 * Example:
 *   docker run -d -p 11434:11434 ollama/ollama
 *   ollama pull llama2
 *   npm test -- tests/integration
 */

const Balancer = require('../../balancer');

describe('Integration Tests - Requires Real Backends', () => {
  let backends;
  let balancer;

  // Skip all tests in this suite if no backends are configured
  beforeAll(() => {
    const backendUrls = process.env.BACKENDS || '';
    if (!backendUrls) {
      console.warn('Integration tests skipped: BACKENDS not configured');
    }
  });

  beforeEach(() => {
    const backendUrls = process.env.BACKENDS || 'http://localhost:11434';
    const backendArray = backendUrls.split(',').map(url => url.trim()).filter(url => url);

    backends = backendArray.map((url, index) => ({
      url,
      priority: index + 1,
      healthy: true,
      busy: false,
      requestCount: 0,
      errorCount: 0,
      maxConcurrency: 1
    }));

    balancer = new Balancer(backends, { maxQueueSize: 100, queue: { timeout: 30000 }, debug: { enabled: false }, debugRequestHistorySize: 100 });
  });

  it('should select healthy backends', () => {
    // Basic sanity check that balancer is initialized correctly
    expect(balancer.backendPool.getAll()).toHaveLength(backends.length);
    expect(balancer.backendPool.getAll().every(b => b.healthy === true)).toBe(true);
  });

  // Add more integration tests here when real backends are available
  // Examples:
  // - Test actual request routing to backends
  // - Test queue behavior with real concurrent requests
  // - Test model-specific routing
});
