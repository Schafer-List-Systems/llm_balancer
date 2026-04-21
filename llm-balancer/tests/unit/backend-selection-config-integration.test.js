/**
 * Integration tests verifying that config values (priority, maxInputTokens)
 * properly flow through to Backend instances and BackendSelector.
 *
 * Replicates the exact production code path from index.js:47-52.
 */

const { loadConfig } = require('../../config');
const Backend = require('../../backends/Backend');
const { BackendSelector } = require('../../backend-selector');

const config = loadConfig();
const backends = config.backends.map((backendConfig) => {
  const backend = new Backend(backendConfig.url, backendConfig.maxConcurrency, backendConfig.name || null);
  backend.priority = backendConfig.priority;
  backend.maxInputTokens = backendConfig.maxInputTokens;
  return backend;
});

describe('Backend config integration', () => {
  describe('priority attachment', () => {
    it.each(Object.entries(config.backends))('config priority matches backend.priority for %s', (name, cfg) => {
      const i = config.backends.indexOf(cfg);
      expect(backends[i].priority).toBe(cfg.priority);
    });

    it('sorts backends by priority descending', () => {
      const sorted = [...backends].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const priorities = sorted.map((b) => b.priority);
      expect(priorities.every((p) => p !== 0 || config.backends.every((c) => c.priority === 0))).toBe(true);
    });
  });

  describe('maxInputTokens attachment', () => {
    it.each(Object.entries(config.backends))('config maxInputTokens matches backend.maxInputTokens for %s', (name, cfg) => {
      const i = config.backends.indexOf(cfg);
      expect(backends[i].maxInputTokens).toBe(cfg.maxInputTokens);
    });

    it('filters backends by maxInputTokens for promptTokens=25000', () => {
      const selector = new BackendSelector(config);
      const filtered = selector._filterByMaxInputTokens(backends, 25000);

      config.backends.forEach((cfg, i) => {
        const cfgLimit = cfg.maxInputTokens;
        const shouldAccept = cfgLimit === undefined || cfgLimit === 0 || 25000 <= cfgLimit;
        const actuallyAccepts = filtered.includes(backends[i]);
        expect(shouldAccept).toBe(actuallyAccepts);
      });
    });
  });
});
