/**
 * PromptCache - LRU cache with fingerprint-based similarity matching
 *
 * Architecture:
 * - Maintains LRU list where entries[0] = most recently accessed
 * - Uses FNV-1a 64-bit hash fingerprints for efficient token-level comparison
 * - Priority 1: ID-based exact lookup (no computation)
 * - Priority 2: Fallback to fingerprint cosine similarity
 */

// Maximum tokens to include in fingerprint for similarity comparison
// Configurable via MAX_FINGERPRINT_TOKENS environment variable, defaults to 200
const MAX_FINGERPRINT_TOKENS = parseInt(process.env.MAX_FINGERPRINT_TOKENS) || 200;
// Fixed fingerprint array size (64 elements) for efficient cosine similarity computation
const MAX_FINGERPRINT_SIZE = 64;

/**
 * FNV-1a 64-bit hash function - excellent for string hashing
 * Uses prime 2^64 - 2^32 + 99539007241331 (0x100000001b3)
 * Offset basis: 14695981039346656037 (0xcbf29ce484222325)
 */
function fnv1a64(str) {
  let hash = 0xcbf29ce484222325;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x100000001b3);
  }
  return hash >>> 0;
}

/**
 * PromptCacheEntry - Individual cached prompt entry
 * Supports both string format (legacy) and object format (with metadata)
 */
class PromptCacheEntry {
  constructor(prompt, model, fingerprint, lastAccessed, id = null) {
    // Handle both string format (legacy) and object format (with metadata)
    if (typeof prompt === 'object' && prompt !== null) {
      this.prompt = prompt; // Object format: { model, streaming, prompt, timestamp, ... }
      this.model = prompt.model || model; // Use object's model if available
    } else {
      this.prompt = prompt; // String format (legacy)
      this.model = model;
    }

    this.fingerprint = fingerprint; // Fixed-size hash array (64 elements)
    this.lastAccessed = lastAccessed || Date.now(); // Timestamp for LRU ordering
    this.id = id;                // Optional backend response ID (future)
    this.hitCount = 0;           // Number of times this was cached
  }

  /**
   * Get formatted prompt data for debugging/output
   * Returns structured object with metadata if available
   */
  getDebugData() {
    if (typeof this.prompt === 'object' && this.prompt !== null && !Array.isArray(this.prompt)) {
      // Object format - return with metadata
      return {
        model: this.prompt.model || this.model,
        streaming: this.prompt.streaming || false,
        prompt: typeof this.prompt.prompt === 'string' ? this.prompt.prompt.substring(0, 500) : 'N/A',
        timestamp: this.prompt.timestamp || this.lastAccessed,
        lastAccessed: this.lastAccessed,
        hitCount: this.hitCount
      };
    }

    // String format (legacy) - return as object with simplified structure
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
 * PromptCache - LRU cache with fingerprint-based similarity matching
 *
 * @class
 */
class PromptCache {
  /**
   * Create a new PromptCache
   * @param {number} maxSize - Maximum number of prompts to cache
   * @param {number} similarityThreshold - Minimum similarity for cache match (0-1)
   */
  constructor(maxSize, similarityThreshold) {
    this.maxSize = maxSize;
    this.similarityThreshold = similarityThreshold;
    this.entries = [];        // LRU list (index 0 = most recent)
    this.byId = new Map();    // ID -> entry mapping for fast lookup
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      idMatches: 0,
      similarityMatches: 0
    };
  }

  /**
   * Compute token-level fingerprint for a prompt+model composite key
   * - Normalizes: lowercase, collapse whitespace
   * - Tokenizes: split on word boundaries
   * - Hashes: FNV-1a 64-bit per token
   * - Truncates: first MAX_FINGERPRINT_TOKENS tokens
   * - Pads: to fixed MAX_FINGERPRINT_SIZE-element array
   *
   * @param {string} text - Prompt text to fingerprint
   * @returns {number[]} Fixed-size hash array (64 elements)
   */
  fingerprint(text) {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const tokens = normalized.match(/\w+/g) || [];
    const hashes = tokens.slice(0, MAX_FINGERPRINT_TOKENS).map(t => fnv1a64(t));
    while (hashes.length < MAX_FINGERPRINT_SIZE) hashes.push(0);
    return hashes.slice(0, MAX_FINGERPRINT_SIZE);
  }

  /**
   * Compute cosine similarity between two 64-element hash arrays
   * Returns value in range [0, 1] where 1 = identical
   *
   * @param {number[]} fp1 - First fingerprint array
   * @param {number[]} fp2 - Second fingerprint array
   * @returns {number} Cosine similarity (0-1)
   */
  cosineSimilarity(fp1, fp2) {
    let dot = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < MAX_FINGERPRINT_SIZE; i++) {
      const v1 = fp1[i], v2 = fp2[i];
      dot += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }
    const denom = Math.sqrt(mag1) * Math.sqrt(mag2);
    return denom === 0 ? 0 : dot / denom;
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
   * 1. If ID provided: exact match by ID (no similarity computation)
   * 2. If no ID: compute similarity on fingerprints
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
    const debugInfo = id ? `ID:${id.substring(0,8)}...` : `similarity:${model}`;
    console.debug(`[PromptCache] Lookup starting - ${debugInfo} (entries: ${this.entries.length})`);

    // Priority 1: ID-based lookup (no computation needed)
    if (id) {
      const entry = this.byId.get(id);
      if (entry && entry.model === model) {
        // Move to front (LRU update)
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

    // Priority 2: Fallback to similarity-based matching
    const fp = this.fingerprint(prompt + '|' + model);
    console.debug(`[PromptCache] Fingerprint computed - model:${model}, entries to check:${this.entries.length}`);

    let bestEntry = null;
    let bestSim = -1;

    for (const entry of this.entries) {
      if (entry.model !== model) continue;
      const sim = this.cosineSimilarity(fp, entry.fingerprint);
      console.debug(`[PromptCache] Similarity check - model:${entry.model}, similarity:${sim.toFixed(4)}, threshold:${this.similarityThreshold}`);
      if (sim > bestSim && sim >= this.similarityThreshold) {
        bestSim = sim;
        bestEntry = entry;
        console.debug(`[PromptCache] New best match found - similarity:${bestSim.toFixed(4)}`);
      }
    }

    if (bestEntry) {
      // Move to front (LRU update)
      const idx = this.entries.indexOf(bestEntry);
      if (idx > 0) {
        this.entries.splice(idx, 1);
        this.entries.unshift(bestEntry);
      }
      bestEntry.lastAccessed = Date.now();
      bestEntry.hitCount++;
      this.stats.hits++;
      this.stats.similarityMatches++;
      console.debug(`[PromptCache] HIT (similarity-match) - model:${model}, similarity:${bestSim.toFixed(4)}, hitCount:${bestEntry.hitCount}`);
    } else {
      this.stats.misses++;
      console.debug(`[PromptCache] MISS (no-similarity-match) - model:${model}, bestSim:${bestSim.toFixed(4)}`);
    }

    return bestEntry ? { entry: bestEntry, similarity: bestSim, matchType: 'similarity' } : null;
  }

  /**
   * Add or extend a prompt in cache
   *
   * Priority:
   * 1. If ID provided: check if ID exists (exact match) or create new entry
   * 2. If no ID: check for near-exact match by similarity (>0.99), otherwise add new
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
      entry.id = id;
      this.moveToFront(entry);
      return;
    }

    // Priority 2: Check for near-exact match by similarity (extension case)
    const fp = this.fingerprint(prompt + '|' + model);

    // Look for very high similarity match (>0.99)
    for (const entry of this.entries) {
      if (entry.model !== model) continue;
      const sim = this.cosineSimilarity(fp, entry.fingerprint);
      if (sim > 0.99) {
        console.debug(`[PromptCache] Near-exact match found (similarity:${sim.toFixed(4)}) - extending entry`);
        // Extend existing entry (prefix continuation)
        entry.prompt = prompt;
        if (id) entry.id = id;
        this.moveToFront(entry);
        return;
      }
    }

    // New entry - add to front, evict LRU if at capacity
    console.debug(`[PromptCache] Adding new entry - model:${model}`);
    const entry = new PromptCacheEntry(prompt, model, fp, Date.now(), id);

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
   * @returns {{ hits: number, misses: number, evictions: number, idMatches: number, similarityMatches: number, size: number, maxSize: number }}
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
      similarityMatches: 0
    };
    console.debug(`[PromptCache] Cache cleared successfully`);
  }
}

module.exports = { PromptCache, PromptCacheEntry, fnv1a64 };
