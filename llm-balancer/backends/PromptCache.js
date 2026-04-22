/**
 * PromptCache - LRU cache with token-prefix matching
 *
 * Architecture:
 * - Maintains LRU list where entries[0] = most recently accessed
 * - Uses tiktoken tokenization for exact token-level comparison
 * - Priority 1: ID-based exact lookup (no computation)
 * - Priority 2: Token-by-token prefix matching for cache hits
 */

const { getModelEncoder } = require('../utils/token-utils');

/**
 * PromptCacheEntry - Individual cached prompt entry
 */
class PromptCacheEntry {
  constructor(prompt, model, tokens, lastAccessed, id = null) {
    if (typeof prompt === 'object' && prompt !== null && !Array.isArray(prompt)) {
      this.prompt = prompt;
      this.model = prompt.model || model;
    } else {
      this.prompt = prompt;
      this.model = model;
    }

    this.tokens = tokens;       // Tokenized token array
    this.lastAccessed = lastAccessed || Date.now();
    this.id = id;
    this.hitCount = 0;
  }

  /**
   * Get debug data for this cache entry (used by getPromptCacheStats)
   * @returns {object} Debug information about the entry
   */
  getDebugData() {
    if (typeof this.prompt === 'object' && this.prompt !== null && !Array.isArray(this.prompt)) {
      return {
        model: this.prompt.model || this.model,
        streaming: this.prompt.streaming || false,
        prompt: typeof this.prompt.prompt === 'string' ? this.prompt.prompt.substring(0, 500) : 'N/A',
        timestamp: this.prompt.timestamp || this.lastAccessed,
        lastAccessed: this.lastAccessed,
        hitCount: this.hitCount
      };
    }

    return {
      model: this.model,
      streaming: false,
      prompt: typeof this.prompt === 'string' ? this.prompt.substring(0, 500) : 'N/A',
      timestamp: this.lastAccessed,
      lastAccessed: this.lastAccessed,
      hitCount: this.hitCount
    };
  }
}

/**
 * PromptCache - LRU cache with token-prefix matching
 *
 * @class
 */
class PromptCache {
  /**
   * Create a new PromptCache
   * @param {number} maxSize - Maximum number of prompts to cache
   * @param {number} minPrefixLength - Minimum consecutive matching tokens to consider a cache hit
   */
  constructor(maxSize, minPrefixLength) {
    this.maxSize = maxSize;
    this.minPrefixLength = minPrefixLength;
    this.entries = [];        // LRU list (index 0 = most recent)
    this.byId = new Map();    // ID -> entry mapping for fast lookup
    this._encoder = null;     // tiktoken encoder (lazy init)
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      idMatches: 0,
      prefixMatches: 0
    };
  }

  /**
   * Tokenize text using tiktoken (cl100k_base encoding)
   * @param {string} text - Text to tokenize
   * @returns {string[]} Token array
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    if (!this._encoder) {
      this._encoder = getModelEncoder('cl100k_base');
    }
    return this._encoder.encode(text);
  }

  /**
   * Find the length of the matching token prefix between two token arrays
   * @param {string[]} a - First token array
   * @param {string[]} b - Second token array
   * @returns {number} Number of consecutive matching tokens from the start
   */
  prefixLength(a, b) {
    let len = 0;
    const max = Math.min(a.length, b.length);
    while (len < max && a[len] === b[len]) {
      len++;
    }
    return len;
  }

  /**
   * Move entry to front of LRU list (most recently used)
   * @param {PromptCacheEntry} entry - Entry to move
   */
  moveToFront(entry) {
    const idx = this.entries.indexOf(entry);
    if (idx > 0) {
      this.entries.splice(idx, 1);
      this.entries.unshift(entry);
    }
    entry.lastAccessed = Date.now();
  }

  /**
   * Find best matching cached prompt for given text+model+id
   *
   * Priority lookup:
   * 1. If ID provided: exact match by ID (no computation)
   * 2. If no ID: tokenize query and find best prefix match
   *
   * Returns { entry, similarity, matchType } or null
   * On hit: moves entry to front of LRU list
   *
   * @param {string} prompt - Prompt body to match
   * @param {string} model - Model name
   * @param {string|null} id - Optional response ID
   * @returns {{ entry: PromptCacheEntry, similarity: number, matchType: string }|null}
   */
  findBestMatch(prompt, model, id = null) {
    const debugInfo = id ? `ID:${id.substring(0,8)}...` : `prefix-match:${model}`;
    console.debug(`[PromptCache] Lookup starting - ${debugInfo} (entries: ${this.entries.length})`);

    // Priority 1: ID-based lookup (no computation needed)
    if (id) {
      const entry = this.byId.get(id);
      if (entry && entry.model === model) {
        const idx = this.entries.indexOf(entry);
        if (idx > 0) {
          this.entries.splice(idx, 1);
          this.entries.unshift(entry);
        }
        entry.lastAccessed = Date.now();
        entry.hitCount++;
        this.stats.hits++;
        this.stats.idMatches++;
        console.debug(`[PromptCache] HIT (id-match) - model:${model}, hitCount:${entry.hitCount}`);
        return { entry, similarity: 1.0, matchType: 'id' };
      }
      this.stats.misses++;
      console.debug(`[PromptCache] MISS (id-not-found) - model:${model}`);
      return null;
    }

    // Priority 2: Token-prefix matching
    const queryTokens = this.tokenize(prompt + '|' + model);

    let bestEntry = null;
    let bestPrefixLen = -1;
    let bestIdx = Infinity;

    for (let idx = 0; idx < this.entries.length; idx++) {
      const entry = this.entries[idx];
      if (entry.model !== model) continue;
      const prefixLen = this.prefixLength(queryTokens, entry.tokens);
      if (prefixLen >= this.minPrefixLength && (prefixLen > bestPrefixLen || (prefixLen === bestPrefixLen && idx < bestIdx))) {
        bestPrefixLen = prefixLen;
        bestEntry = entry;
        bestIdx = idx;
        console.debug(`[PromptCache] New best prefix match - model:${model}, prefixLen:${prefixLen}`);
      }
    }

    if (bestEntry) {
      const idx = this.entries.indexOf(bestEntry);
      if (idx > 0) {
        this.entries.splice(idx, 1);
        this.entries.unshift(bestEntry);
      }
      bestEntry.lastAccessed = Date.now();
      bestEntry.hitCount++;
      this.stats.hits++;
      this.stats.prefixMatches++;

      const similarity = bestPrefixLen / bestEntry.tokens.length;
      console.debug(`[PromptCache] HIT (prefix-match) - model:${model}, prefixLen:${bestPrefixLen}, similarity:${similarity.toFixed(3)}, hitCount:${bestEntry.hitCount}`);
      return { entry: bestEntry, similarity, matchType: 'prefix' };
    }

    this.stats.misses++;
    console.debug(`[PromptCache] MISS (no-prefix-match) - model:${model}`);
    return null;
  }

  /**
   * Add or extend a prompt in cache
   *
   * Priority:
   * 1. If ID provided: check if ID exists (exact match) or create new entry
   * 2. If no ID: check for full-prefix match (>99% of cached prompt), otherwise add new
   *
   * @param {string} prompt - Full prompt body string
   * @param {string} model - Model name
   * @param {string|null} id - Optional backend response ID
   */
  addOrUpdate(prompt, model, id = null) {
    console.debug(`[PromptCache] AddOrUpdate starting - model:${model}, id:${id || 'none'}, currentSize:${this.entries.length}`);

    // Priority 1: ID-based - check if this ID already exists
    if (id && this.byId.has(id)) {
      const entry = this.byId.get(id);
      console.debug(`[PromptCache] ID exists - updating entry (hitCount:${entry.hitCount})`);
      entry.prompt = prompt;
      entry.tokens = this.tokenize(prompt + '|' + model);
      entry.id = id;
      this.moveToFront(entry);
      return;
    }

    // Priority 2: Check for near-exact prefix match (prompt extension, >99% overlap)
    // BPE tokenization boundary shifts mean exact 100% prefix match is rarely achievable
    // when appending different suffix text. >99% means most KV cache is still useful.
    const newTokens = this.tokenize(prompt + '|' + model);

    for (const entry of this.entries) {
      if (entry.model !== model) continue;
      const prefixLen = this.prefixLength(newTokens, entry.tokens);
      if (prefixLen >= entry.tokens.length * 0.99) {
        console.debug(`[PromptCache] Near-exact match found (prefixLen:${prefixLen}/${entry.tokens.length}) - extending entry`);
        entry.prompt = prompt;
        entry.tokens = newTokens;
        if (id) entry.id = id;
        this.moveToFront(entry);
        return;
      }
    }

    // New entry - add to front, evict LRU if at capacity
    console.debug(`[PromptCache] Adding new entry - model:${model}`);
    const entry = new PromptCacheEntry(prompt, model, newTokens, Date.now(), id);

    if (this.entries.length >= this.maxSize) {
      const evicted = this.entries.pop();
      if (evicted.id) this.byId.delete(evicted.id);
      this.stats.evictions++;
      console.debug(`[PromptCache] LRU eviction - evicted entry (size:${this.entries.length} -> ${this.maxSize})`);
    }

    this.entries.unshift(entry);
    if (id) this.byId.set(id, entry);
    console.debug(`[PromptCache] Entry added successfully - new size:${this.entries.length}`);
  }

  /**
   * Get current cache statistics
   * @returns {{ hits: number, misses: number, evictions: number, idMatches: number, prefixMatches: number, size: number, maxSize: number }}
   */
  getStats() {
    return {
      ...this.stats,
      size: this.entries.length,
      maxSize: this.maxSize
    };
  }

  /**
   * Clear all entries from the cache
   * Resets stats and removes all cached prompts
   */
  clear() {
    console.debug(`[PromptCache] Clearing cache - size:${this.entries.length}`);
    this.entries = [];
    this.byId.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      idMatches: 0,
      prefixMatches: 0
    };
    console.debug(`[PromptCache] Cache cleared successfully`);
  }
}

module.exports = { PromptCache, PromptCacheEntry };
