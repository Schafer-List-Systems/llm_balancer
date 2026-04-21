/**
 * Regression test: HealthChecker.getStats() must include `active` on each backend.
 *
 * The HealthChecker.getStats() method maps backends to stat objects. When a backend
 * has active: false (configured disabled), it must still appear in getStats() with
 * the `active` field set so endpoints can expose it.
 *
 * This tests the real HealthChecker class with mock backend objects - not a mock
 * of HealthChecker itself.
 */

const HealthChecker = require('../../health-check');

const mockConfig = {
  healthCheck: {
    interval: 120000,
    timeout: 5000,
    maxRetries: 1,
    retryDelay: 2000,
    staggerDelay: 500
  }
};

function createMockBackend(cfg) {
  return {
    url: cfg.url || 'http://test',
    name: cfg.name || 'Test',
    priority: cfg.priority || 1,
    active: cfg.active !== undefined ? cfg.active : true,
    maxConcurrency: cfg.maxConcurrency || 1,
    healthy: cfg.healthy !== false,
    activeRequestCount: cfg.activeRequestCount || 0,
    activeStreamingRequests: 0,
    activeNonStreamingRequests: 0,
    failCount: cfg.failCount || 0,
    timeoutCount: cfg.timeoutCount || 0,
    lastCheckTime: null,
    lastCheckDuration: null
  };
}

describe('HealthChecker.getStats includes active field', () => {
  it('must include active field on each backend in stats', () => {
    const backends = [
      createMockBackend({ url: 'http://a', name: 'ActiveBackend', active: true }),
      createMockBackend({ url: 'http://b', name: 'InactiveBackend', active: false })
    ];

    const checker = new HealthChecker(backends, mockConfig);
    const stats = checker.getStats();

    expect(stats.backends).toHaveLength(2);
    expect(stats.backends[0].active).toBeDefined();
    expect(stats.backends[0].active).toBe(true);
    expect(stats.backends[1].active).toBeDefined();
    expect(stats.backends[1].active).toBe(false);
  });

  it('must include name field on each backend in stats', () => {
    const backends = [
      createMockBackend({ url: 'http://a', name: 'NamedBackend' })
    ];

    const checker = new HealthChecker(backends, mockConfig);
    const stats = checker.getStats();

    expect(stats.backends[0].name).toBeDefined();
    expect(stats.backends[0].name).toBe('NamedBackend');
  });
});
