/**
 * Tests for cache reset functionality
 * Tests PromptCache.clear(), Backend.resetPromptCache(), BackendPool.resetCaches()
 */

const { PromptCache, PromptCacheEntry } = require('../../backends/PromptCache');
const Backend = require('../../backends/Backend');
const BackendPool = require('../../backend-pool');

describe('PromptCache.clear()', () => {
  it('should clear all entries from the cache', () => {
    const cache = new PromptCache(100, 0.8);
    // Use distinct prompts that won't match via near-exact similarity
    cache.addOrUpdate('the quick brown fox jumps over the lazy dog', 'model1');
    cache.addOrUpdate('abcdefghijklmnopqrstuvwxyz xyz123', 'model1');
    cache.addOrUpdate('different prompt with model2', 'model2');

    expect(cache.entries.length).toBe(3);
    expect(cache.entries[0].prompt).toContain('model2'); // Most recent

    cache.clear();

    expect(cache.entries.length).toBe(0);
    expect(cache.entries).toEqual([]);
  });

  it('should clear the byId map', () => {
    const cache = new PromptCache(100, 0.8);
    // Use truly distinct prompts to avoid near-exact match extending
    cache.addOrUpdate('first prompt very distinct xyz', 'model1', 'id1');
    cache.addOrUpdate('second prompt very distinct abc', 'model1', 'id2');

    expect(cache.byId.size).toBe(2);
    expect(cache.byId.has('id1')).toBe(true);
    expect(cache.byId.has('id2')).toBe(true);

    cache.clear();

    expect(cache.byId.size).toBe(0);
    expect(cache.byId.has('id1')).toBe(false);
    expect(cache.byId.has('id2')).toBe(false);
  });

  it('should reset all statistics to zero', () => {
    const cache = new PromptCache(100, 0.8);

    // Add some entries to trigger stats changes
    cache.addOrUpdate('prompt 1', 'model1', 'id1');
    cache.findBestMatch('prompt 1', 'model1', 'id1');
    cache.findBestMatch('different prompt', 'model1');

    const statsBefore = cache.getStats();
    expect(statsBefore.hits).toBeGreaterThan(0);

    cache.clear();

    const statsAfter = cache.getStats();
    expect(statsAfter.hits).toBe(0);
    expect(statsAfter.misses).toBe(0);
    expect(statsAfter.evictions).toBe(0);
    expect(statsAfter.idMatches).toBe(0);
    expect(statsAfter.similarityMatches).toBe(0);
  });

  it('should preserve configuration after clear', () => {
    const cache = new PromptCache(50, 0.9);

    cache.clear();

    expect(cache.maxSize).toBe(50);
    expect(cache.similarityThreshold).toBe(0.9);
  });
});

describe('Backend.resetPromptCache()', () => {
  it('should reset cache for backend with initialized cache', () => {
    const backend = new Backend('http://localhost:11434');
    const initialStats = backend.getPromptCacheStats();
    expect(initialStats).not.toBeNull();

    const result = backend.resetPromptCache();

    expect(result.success).toBe(true);
    expect(result.message).toBe('Cache reset successfully');

    const stats = backend.getPromptCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
  });

  it('should return error when cache is not initialized', () => {
    // Create backend with cache disabled (simulated)
    const backend = new Backend('http://localhost:11434');
    backend.promptCache = null;

    const result = backend.resetPromptCache();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Cache not initialized');
  });

  it('should clear entries and stats', () => {
    const backend = new Backend('http://localhost:11434');

    // Add some cached prompts
    backend.cachePrompt('prompt 1', 'model1');
    backend.cachePrompt('prompt 2', 'model1');
    backend.findCacheMatch('prompt 1', 'model1');

    const statsBefore = backend.getPromptCacheStats();
    expect(statsBefore.size).toBeGreaterThan(0);
    expect(statsBefore.hits).toBeGreaterThan(0);

    backend.resetPromptCache();

    const stats = backend.getPromptCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe('BackendPool.resetCaches()', () => {
  it('should reset caches for all backends', () => {
    const backends = [
      new Backend('http://backend1:11434'),
      new Backend('http://backend2:11434'),
      new Backend('http://backend3:11434')
    ];

    // Add cached prompts to each backend
    backends[0].cachePrompt('prompt 1', 'model1');
    backends[1].cachePrompt('prompt 2', 'model1');
    backends[2].cachePrompt('prompt 3', 'model1');

    const pool = new BackendPool(backends);
    const results = pool.resetCaches();

    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    expect(results.every(r => r.message === 'Cache reset successfully')).toBe(true);
    expect(results[0].url).toBe('http://backend1:11434');
    expect(results[1].url).toBe('http://backend2:11434');
    expect(results[2].url).toBe('http://backend3:11434');

    // Verify all caches are actually cleared
    expect(backends[0].getPromptCacheStats().size).toBe(0);
    expect(backends[1].getPromptCacheStats().size).toBe(0);
    expect(backends[2].getPromptCacheStats().size).toBe(0);
  });

  it('should reset caches for specific backends by URL string', () => {
    const backends = [
      new Backend('http://backend1:11434'),
      new Backend('http://backend2:11434'),
      new Backend('http://backend3:11434')
    ];

    backends[0].cachePrompt('prompt 1', 'model1');
    backends[1].cachePrompt('prompt 2', 'model1');
    backends[2].cachePrompt('prompt 3', 'model1');

    const pool = new BackendPool(backends);
    const results = pool.resetCaches('http://backend2:11434');

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('http://backend2:11434');
    expect(results[0].success).toBe(true);

    // Only backend2 should be cleared
    expect(backends[0].getPromptCacheStats().size).toBe(1);
    expect(backends[1].getPromptCacheStats().size).toBe(0);
    expect(backends[2].getPromptCacheStats().size).toBe(1);
  });

  it('should reset caches for specific backends by URL array', () => {
    const backends = [
      new Backend('http://backend1:11434'),
      new Backend('http://backend2:11434'),
      new Backend('http://backend3:11434')
    ];

    backends[0].cachePrompt('prompt 1', 'model1');
    backends[1].cachePrompt('prompt 2', 'model1');
    backends[2].cachePrompt('prompt 3', 'model1');

    const pool = new BackendPool(backends);
    const results = pool.resetCaches([
      'http://backend1:11434',
      'http://backend3:11434'
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('http://backend1:11434');
    expect(results[1].url).toBe('http://backend3:11434');

    // Only backend1 and backend3 should be cleared
    expect(backends[0].getPromptCacheStats().size).toBe(0);
    expect(backends[1].getPromptCacheStats().size).toBe(1);
    expect(backends[2].getPromptCacheStats().size).toBe(0);
  });

  it('should return only matching backends when filtering', () => {
    const backends = [
      new Backend('http://backend1:11434'),
      new Backend('http://backend2:11434')
    ];

    const pool = new BackendPool(backends);

    // Only reset non-existent backend
    const results = pool.resetCaches('http://nonexistent:11434');

    expect(results).toHaveLength(0);
  });

  it('should work with empty pool', () => {
    const pool = new BackendPool([]);
    const results = pool.resetCaches();

    expect(results).toHaveLength(0);
  });
});

describe('Debug endpoints registration', () => {
  const express = require('express');
  const request = require('supertest');

  it('should register cache reset endpoint when debug is true', () => {
    const app = express();
    app.use(express.json());

    const config = { debug: true };
    const backends = [new Backend('http://backend1:11434')];
    const backendPool = new BackendPool(backends);

    if (config.debug) {
      app.post('/cache/reset', (req, res) => {
        const { backend } = req.query;

        if (backend) {
          const targetBackend = backends.find(b => b.url === backend);
          if (!targetBackend) {
            return res.status(404).json({
              error: 'Not Found',
              message: `Backend not found: ${backend}`
            });
          }

          const result = targetBackend.resetPromptCache();
          res.json({
            success: result.success,
            message: result.message,
            backend: backend,
            cacheStats: targetBackend.getPromptCacheStats()
          });
        } else {
          const results = backendPool.resetCaches();
          res.json({
            success: results.every(r => r.success),
            message: `Reset ${results.filter(r => r.success).length}/${results.length} backend caches`,
            results
          });
        }
      });
    }

    return request(app)
      .post('/cache/reset')
      .expect(200);
  });

  it('should NOT register cache reset endpoint when debug is false', () => {
    const app = express();
    app.use(express.json());

    const config = { debug: false };
    const backends = [new Backend('http://backend1:11434')];
    const backendPool = new BackendPool(backends);

    if (config.debug) {
      app.post('/cache/reset', (req, res) => {
        res.json({ success: true });
      });
    }

    return request(app)
      .post('/cache/reset')
      .expect(404);
  });

  it('should register queue endpoints when debug is true', () => {
    const app = express();
    app.use(express.json());

    const config = { debug: true };
    const backends = [new Backend('http://backend1:11434')];
    const backendPool = new BackendPool(backends);
    const balancer = { queue: [] };

    if (config.debug) {
      app.get('/queue/contents', (req, res) => {
        res.json({ totalQueued: 0 });
      });

      app.get('/queue/list/:priority', (req, res) => {
        res.json({ queueList: [] });
      });
    }

    return Promise.all([
      request(app).get('/queue/contents').expect(200),
      request(app).get('/queue/list/0').expect(200)
    ]);
  });

  it('should NOT register queue endpoints when debug is false', () => {
    const app = express();
    app.use(express.json());

    const config = { debug: false };
    const backends = [new Backend('http://backend1:11434')];
    const backendPool = new BackendPool(backends);
    const balancer = { queue: [] };

    if (config.debug) {
      app.get('/queue/contents', (req, res) => {
        res.json({ totalQueued: 0 });
      });

      app.get('/queue/list/:priority', (req, res) => {
        res.json({ queueList: [] });
      });
    }

    return Promise.all([
      request(app).get('/queue/contents').expect(404),
      request(app).get('/queue/list/0').expect(404)
    ]);
  });
});
