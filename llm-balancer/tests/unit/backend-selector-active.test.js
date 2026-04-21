const { BackendSelector } = require('../../backend-selector');
const BackendPool = require('../../backend-pool');

function createBackend(attrs) {
  return {
    url: attrs.url || 'http://test',
    name: attrs.name || 'Test',
    healthy: attrs.healthy !== false,
    active: attrs.active !== undefined ? attrs.active : true,
    priority: attrs.priority || 1,
    maxConcurrency: attrs.maxConcurrency || 1,
    activeRequestCount: attrs.activeRequestCount || 0,
    maxInputTokens: attrs.maxInputTokens,
    getApiTypes: () => attrs.apiTypes || ['openai'],
    getModels: () => attrs.models || ['test-model'],
    supportsApi: () => true,
  };
}

function createSelector(config = {}) {
  const merged = {
    prompt: { cache: { minHitThreshold: 15000 } },
    ...config
  };
  return new BackendSelector(merged);
}

describe('BackendSelector with active filter', () => {
  describe('_filterByHealthAndAvailability', () => {
    it('excludes inactive backends', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: true }),
        createBackend({ url: 'http://b', healthy: true, active: false }),
      ];
      const result = selector._filterByHealthAndAvailability(backends);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('http://a');
    });

    it('includes inactive+unhealthy backends if healthy===true but active===false', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: false }),
      ];
      const result = selector._filterByHealthAndAvailability(backends);
      expect(result).toHaveLength(0);
    });
  });

  describe('_filterByHealth', () => {
    it('excludes inactive backends even if healthy', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: true }),
        createBackend({ url: 'http://b', healthy: true, active: false }),
      ];
      const result = selector._filterByHealth(backends);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('http://a');
    });
  });

  describe('selectBackend', () => {
    it('never selects an inactive backend', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', active: true, priority: 1 }),
        createBackend({ url: 'http://b', active: false, priority: 10 }),
      ];
      const result = selector.selectBackend(backends);
      expect(result).not.toBeNull();
      expect(result.url).toBe('http://a');
    });

    it('selects inactive backend when all are inactive (no healthy backends but at least one available)', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', active: false, healthy: true, priority: 5 }),
      ];
      const result = selector.selectBackend(backends);
      expect(result).toBeNull();
    });
  });

  describe('selectBackendWithCache', () => {
    it('returns "none" when only inactive backends support the model', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: false, models: ['llama3'] }),
      ];
      const result = selector.selectBackendWithCache(backends, { modelString: 'llama3' }, 'test prompt', 100);
      expect(result.status).toBe('none');
    });

    it('selects active backend when inactive one also exists', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: true, priority: 1, models: ['llama3'] }),
        createBackend({ url: 'http://b', healthy: true, active: false, priority: 10, models: ['llama3'] }),
      ];
      const result = selector.selectBackendWithCache(backends, { modelString: 'llama3' }, 'test prompt', 100);
      expect(result.status).toBe('found');
      expect(result.backend.url).toBe('http://a');
    });
  });

  describe('getNextBackendForModelWithMatch (via balancer)', () => {
    it('does not select inactive backends for Ollama fast-path', () => {
      const selector = createSelector();
      const backends = [
        createBackend({ url: 'http://a', healthy: true, active: true, priority: 1, models: ['llama3'] }),
        createBackend({ url: 'http://b', healthy: true, active: false, priority: 5, models: ['llama3'] }),
      ];
      const result = selector._selectBackendByPriorityFirst(backends, 'llama3');
      expect(result.url).toBe('http://a');
    });
  });
});

describe('BackendPool with active filter', () => {
  it('filter({ active: false }) returns only inactive backends', () => {
    const pool = new BackendPool([
      createBackend({ url: 'http://a', active: true }),
      createBackend({ url: 'http://b', active: false }),
    ]);
    const result = pool.filter({ active: false }).getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('http://b');
  });

  it('active() convenience returns only active backends', () => {
    const pool = new BackendPool([
      createBackend({ url: 'http://a', active: true }),
      createBackend({ url: 'http://b', active: false }),
    ]);
    const result = pool.active().getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('http://a');
  });

  it('filter({ healthy: true, active: true }) chains correctly', () => {
    const pool = new BackendPool([
      createBackend({ url: 'http://a', healthy: true, active: true }),
      createBackend({ url: 'http://b', healthy: true, active: false }),
      createBackend({ url: 'http://c', healthy: false, active: true }),
    ]);
    const result = pool.filter({ healthy: true, active: true }).getAll();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('http://a');
  });
});
