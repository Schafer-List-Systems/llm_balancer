/**
 * PromptCache Unit Tests
 * Tests for the LRU cache with token-prefix matching
 *
 * NOTE: All prompts must produce >= 50 tokens when tokenized as "prompt|model"
 * to be findable by findBestMatch with the default prefixMinLength of 50.
 * Tiktoken with cl100k_base encodes "a " as 1 token, so "a ".repeat(55) = ~56 tokens.
 */

const { PromptCache, PromptCacheEntry } = require('../../backends/PromptCache');

describe('PromptCache', () => {
  const MAX_SIZE = 5;
  const PREFIX_MIN_LENGTH = 50;

  let cache;

  beforeEach(() => {
    cache = new PromptCache(MAX_SIZE, PREFIX_MIN_LENGTH);
  });

  describe('Constructor', () => {
    it('should initialize with correct parameters', () => {
      expect(cache.maxSize).toBe(MAX_SIZE);
      expect(cache.minPrefixLength).toBe(PREFIX_MIN_LENGTH);
      expect(cache.entries).toEqual([]);
      expect(cache.byId.size).toBe(0);
      expect(cache.stats).toEqual({
        hits: 0,
        misses: 0,
        evictions: 0,
        idMatches: 0,
        prefixMatches: 0
      });
    });

    it('should use default size when maxSize is 0', () => {
      const cache2 = new PromptCache(0, PREFIX_MIN_LENGTH);
      expect(cache2.maxSize).toBe(0);
    });
  });

  describe('Tokenization', () => {
    it('should produce consistent tokenization for same input', () => {
      const t1 = cache.tokenize('hello world test prompt');
      const t2 = cache.tokenize('hello world test prompt');
      expect(t1).toEqual(t2);
    });

    it('should produce different token arrays for different inputs', () => {
      const t1 = cache.tokenize('hello world');
      const t2 = cache.tokenize('hello world different');
      expect(t1).not.toEqual(t2);
    });

    it('should handle empty string', () => {
      const tokens = cache.tokenize('');
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(0);
    });

    it('should handle null', () => {
      const tokens = cache.tokenize(null);
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(0);
    });

    it('should handle very long text', () => {
      const longText = 'a '.repeat(10000) + 'test prompt';
      const tokens = cache.tokenize(longText);
      expect(tokens).toBeInstanceOf(Uint32Array);
      expect(tokens.length).toBeGreaterThan(100);
    });
  });

  describe('Prefix Length', () => {
    it('should return full length for identical token arrays', () => {
      const tokens = cache.tokenize('hello world test');
      expect(cache.prefixLength(tokens, tokens)).toBe(tokens.length);
    });

    it('should return 0 for completely different first tokens', () => {
      const t1 = cache.tokenize('apple banana cherry');
      const t2 = cache.tokenize('dog elephant fox');
      expect(cache.prefixLength(t1, t2)).toBe(0);
    });

    it('should count consecutive matching tokens correctly', () => {
      const t1 = cache.tokenize('the quick brown fox jumps over the lazy dog');
      const t2 = cache.tokenize('the quick brown fox is very fast today');
      const len = cache.prefixLength(t1, t2);
      expect(len).toBeGreaterThan(0);
      expect(len).toBeGreaterThan(3);
    });

    it('should handle empty token arrays', () => {
      expect(cache.prefixLength([], [])).toBe(0);
    });

    it('should stop at the shorter array length', () => {
      const short = cache.tokenize('hello world');
      const long = cache.tokenize('hello world this is a much longer prompt with many more tokens beyond the short one');
      expect(cache.prefixLength(short, long)).toBe(short.length);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when at capacity', () => {
      // Need long enough prefix that BPE boundary stabilizes, then unique suffix
      const prefix = 'token '.repeat(60);
      const prompts = [
        prefix + 'unique one',
        prefix + 'unique two',
        prefix + 'unique three',
        prefix + 'unique four',
        prefix + 'unique five'
      ];

      for (const p of prompts) {
        cache.addOrUpdate(p, 'model1');
      }

      expect(cache.entries.length).toBeLessThanOrEqual(MAX_SIZE);

      cache.findBestMatch(prompts[0], 'model1');

      cache.addOrUpdate(prefix + 'unique six', 'model1');

      expect(cache.entries.length).toBeLessThanOrEqual(MAX_SIZE);
    });

    it('should move accessed entry to front', () => {
      const prefix = 'token '.repeat(60);
      cache.addOrUpdate(prefix + 'alpha entry distinct text', 'model1');
      cache.addOrUpdate(prefix + 'beta entry distinct text', 'model1');
      cache.addOrUpdate(prefix + 'gamma entry distinct text', 'model1');

      // Initial order: [gamma, beta, alpha] (most recent first)
      expect(cache.entries.length).toBe(3);

      cache.findBestMatch(prefix + 'alpha entry distinct text', 'model1');

      // alpha moved to front, gamma and beta keep relative order: [alpha, gamma, beta]
      expect(cache.entries[0].prompt).toContain('alpha');
      expect(cache.entries[1].prompt).toContain('gamma');
      expect(cache.entries[2].prompt).toContain('beta');
    });
  });

  describe('Prefix Matching', () => {
    it('should find exact match with similarity 1.0', () => {
      const prompt = 'token '.repeat(55) + 'exact match test prompt text here';
      cache.addOrUpdate(prompt, 'model1');

      const result = cache.findBestMatch(prompt, 'model1');
      expect(result).toBeDefined();
      expect(result.entry.prompt).toBe(prompt);
      expect(result.similarity).toBeCloseTo(1.0, 2);
      expect(result.matchType).toBe('prefix');
      expect(cache.stats.prefixMatches).toBe(1);
    });

    it('should find prefix match when query extends cached prompt', () => {
      // Very long repeating prefix makes BPE boundary shift negligible relative to total
      const prefix = 'x '.repeat(5000);
      const cached = prefix + 'base text';
      const query = prefix + 'base text extra';

      cache.addOrUpdate(cached, 'model1');

      const result = cache.findBestMatch(query, 'model1');
      expect(result).toBeDefined();
      expect(result.matchType).toBe('prefix');
      expect(result.similarity).toBeCloseTo(1.0, 2);
    });

    it('should find prefix match when prompt diverges late', () => {
      const cached = 'a '.repeat(60) + ' diverge here now';
      const query = 'a '.repeat(60) + ' different ending now';

      cache.addOrUpdate(cached, 'model1');

      const result = cache.findBestMatch(query, 'model1');
      expect(result).toBeDefined();
      expect(result.matchType).toBe('prefix');
      expect(result.similarity).toBeGreaterThan(0.5);
    });

    it('should reject match when prefix is below min length', () => {
      cache.addOrUpdate('aaaaa long cached prompt text that is at least fifty tokens to meet the minimum threshold requirement for caching', 'model1');
      const result = cache.findBestMatch('b different first word after matching prefix that goes on and on and on for a long time beyond the threshold', 'model1');
      expect(result).toBeNull();
    });

    it('should reject match when first token differs', () => {
      cache.addOrUpdate('long matching prefix text that goes on for many tokens at least fifty tokens to be a valid cache hit always', 'model1');
      const result = cache.findBestMatch('totally different starting token here while the rest of the prompt matches the cached prompt exactly now', 'model1');
      expect(result).toBeNull();
    });

    it('should not match different models', () => {
      cache.addOrUpdate('a '.repeat(55) + 'same prefix different model here', 'model1');
      const result = cache.findBestMatch('a '.repeat(55) + 'same prefix different model here', 'model2');
      expect(result).toBeNull();
    });

    it('should increment hits counter', () => {
      const prompt = 'a '.repeat(60) + ' unique suffix abc distinct tracking';
      cache.addOrUpdate(prompt, 'model1');

      cache.findBestMatch(prompt, 'model1');
      cache.findBestMatch(prompt, 'model1');

      expect(cache.stats.hits).toBe(2);
      expect(cache.entries[0].hitCount).toBe(2);
    });

    it('should increment misses counter', () => {
      cache.findBestMatch('a '.repeat(55) + 'no cache hit possible here', 'model1');
      expect(cache.stats.misses).toBe(1);
    });

    it('should prefer the cache entry with best prefix match', () => {
      cache.addOrUpdate('a '.repeat(60) + ' first cached prompt text', 'model1');
      cache.addOrUpdate('a '.repeat(40) + ' shorter prefix match here', 'model1');

      const query = 'a '.repeat(60) + ' query text here today';

      const result = cache.findBestMatch(query, 'model1');
      expect(result).toBeDefined();
      expect(result.entry.prompt).toContain('first');
    });
  });

  describe('ID-Based Lookup', () => {
    it('should find entry by ID with instant exact match', () => {
      const id = 'response-123';
      cache.addOrUpdate('a '.repeat(55) + 'cached id lookup text', 'model1', id);

      const result = cache.findBestMatch('a '.repeat(55) + 'cached id lookup text', 'model1', id);
      expect(result).toBeDefined();
      expect(result.matchType).toBe('id');
      expect(result.similarity).toBe(1.0);
      expect(cache.stats.idMatches).toBe(1);
    });

    it('should return null for non-existent ID', () => {
      const result = cache.findBestMatch('any prompt text here', 'model1', 'non-existent-id');
      expect(result).toBeNull();
      expect(cache.stats.misses).toBe(1);
    });

    it('should prioritize ID match over similarity', () => {
      const id = 'unique-id';
      cache.addOrUpdate('a '.repeat(55) + 'original prompt text', 'model1', id);

      const result = cache.findBestMatch('a '.repeat(55) + 'different text content', 'model1', id);
      expect(result).toBeDefined();
      expect(result.matchType).toBe('id');
      expect(result.entry.prompt).toBe('a '.repeat(55) + 'original prompt text');
    });

    it('should increment idMatches counter', () => {
      const id = 'test-id';
      cache.addOrUpdate('a '.repeat(55) + 'test', 'model1', id);
      cache.findBestMatch('a '.repeat(55) + 'test', 'model1', id);
      expect(cache.stats.idMatches).toBe(1);
    });
  });

  describe('Cache Operations', () => {
    it('should add new prompt to cache', () => {
      cache.addOrUpdate('a '.repeat(55) + 'new prompt text here', 'model1');
      expect(cache.entries.length).toBe(1);
      expect(cache.entries[0].prompt).toBe('a '.repeat(55) + 'new prompt text here');
      expect(cache.entries[0].tokens).toBeInstanceOf(Uint32Array);
    });

    it('should extend existing prompt when full prefix matches', () => {
      // Very long repeating prefix makes BPE boundary shift negligible (<0.1%)
      const prefix = 'x '.repeat(10000);
      const cached = prefix + 'base extension text';
      cache.addOrUpdate(cached, 'model1');

      // prefixLen ≈ cachedLen (BPE shift <0.1%), so prefixLen >= cachedLen * 0.99 triggers extension
      cache.addOrUpdate(prefix + 'base extension text extra', 'model1');

      expect(cache.entries.length).toBe(1);
    });

    it('should add new prompt when prefix is too short', () => {
      cache.addOrUpdate('different first token that breaks prefix matching after many tokens of cached content here', 'model1');
      cache.addOrUpdate('another different token that also breaks prefix matching for a second entry cached here now', 'model1');

      expect(cache.entries.length).toBe(2);
    });

    it('should update prompt when adding with same ID', () => {
      const id = 'my-response';
      cache.addOrUpdate('a '.repeat(55) + 'first prompt', 'model1', id);
      cache.addOrUpdate('a '.repeat(55) + 'updated prompt now', 'model1', id);

      expect(cache.entries.length).toBe(1);
      expect(cache.entries[0].prompt).toBe('a '.repeat(55) + 'updated prompt now');
    });

    it('should track hitCount on entries', () => {
      const prompt = 'a '.repeat(60) + 'unique suffix for hit count tracking purposes';
      cache.addOrUpdate(prompt, 'model1');
      cache.findBestMatch(prompt, 'model1');
      cache.findBestMatch(prompt, 'model1');

      expect(cache.entries[0].hitCount).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      const prompt = 'a '.repeat(60) + ' unique suffix xyz text here stats';
      cache.addOrUpdate(prompt, 'model1');
      cache.findBestMatch(prompt, 'model1');

      const stats = cache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.prefixMatches).toBe(1);
      expect(stats.size).toBeLessThanOrEqual(MAX_SIZE);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.maxSize).toBe(MAX_SIZE);
    });

    it('should handle empty cache', () => {
      const stats = cache.getStats();
      expect(stats).toMatchObject({
        size: 0,
        maxSize: MAX_SIZE,
        hits: 0,
        misses: 0
      });
    });
  });

  describe('PromptCacheEntry', () => {
    it('should create entry with default values', () => {
      const tokens = ['token1', 'token2', 'token3'];
      const entry = new PromptCacheEntry('test', 'model1', tokens);

      expect(entry.prompt).toBe('test');
      expect(entry.model).toBe('model1');
      expect(entry.tokens).toEqual(tokens);
      expect(entry.lastAccessed).toBeDefined();
      expect(entry.id).toBeNull();
      expect(entry.hitCount).toBe(0);
    });

    it('should create entry with custom values', () => {
      const tokens = ['tok1', 'tok2'];
      const customTime = 1234567890;
      const entry = new PromptCacheEntry('test', 'model1', tokens, customTime, 'my-id');

      expect(entry.id).toBe('my-id');
      expect(entry.lastAccessed).toBe(customTime);
    });
  });

  describe('Model Filtering', () => {
    it('should only match entries with same model', () => {
      cache.addOrUpdate('a '.repeat(55) + 'prompt text same prefix model one text', 'model1');
      cache.addOrUpdate('a '.repeat(55) + 'prompt text same prefix model two text', 'model2');
      cache.addOrUpdate('a '.repeat(55) + 'prompt text same prefix model three text', 'model3');

      const result = cache.findBestMatch('a '.repeat(55) + 'prompt text same prefix model two text', 'model2');
      expect(result).toBeDefined();
      expect(result.entry.model).toBe('model2');
    });

    it('should handle multiple models at capacity', () => {
      for (let i = 1; i <= 3; i++) {
        cache.addOrUpdate('a '.repeat(55) + `prompt text same prefix model${i} text here`, `model${i}`);
      }

      cache.addOrUpdate('a '.repeat(55) + 'new prompt text same prefix model one replacement text', 'model1');

      expect(cache.entries.length).toBeLessThanOrEqual(MAX_SIZE);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in prompts', () => {
      const specialPrompt = 'a '.repeat(55) + 'Hello! @#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      cache.addOrUpdate(specialPrompt, 'model1');

      const result = cache.findBestMatch(specialPrompt, 'model1');
      expect(result).toBeDefined();
    });

    it('should handle unicode characters', () => {
      const unicodePrompt = 'a '.repeat(55) + 'Hello 世界 🌍 مرحبا text';
      cache.addOrUpdate(unicodePrompt, 'model1');

      const result = cache.findBestMatch(unicodePrompt, 'model1');
      expect(result).toBeDefined();
    });

    it('should handle very long prompts', () => {
      const longPrompt = ' '.repeat(10000) + 'test prompt';
      cache.addOrUpdate(longPrompt, 'model1');

      expect(cache.entries.length).toBe(1);
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
    });

    it('should handle prompts with only whitespace', () => {
      cache.addOrUpdate('   ', 'model1');

      const result = cache.findBestMatch('   ', 'model1');
      expect(result).toBeDefined();
    });
  });

  describe('Composite Key (prompt + model)', () => {
    it('should treat prompt+model as unique composite key', () => {
      cache.addOrUpdate('a '.repeat(55) + 'composite key testing text model one', 'model1');
      cache.addOrUpdate('a '.repeat(55) + 'composite key testing text model two', 'model2');
      cache.addOrUpdate('a '.repeat(55) + 'composite key testing text model three', 'model3');

      expect(cache.entries.length).toBe(3);

      const result1 = cache.findBestMatch('a '.repeat(55) + 'composite key testing text model one', 'model1');
      expect(result1.entry.model).toBe('model1');
    });
  });
});
