/**
 * Prefix Matcher Module
 * Handles prefix-based backend selection with caching optimization
 *
 * Core Components:
 * 1. Longest Common Prefix (LCP) algorithm for prefix comparison
 * 2. Request ID matching for exact follow-up requests
 * 3. Priority-based matching: ID match > prefix match
 * 4. Model matching: mandatory before prefix comparison
 *
 * Key Design Decisions:
 * - Model matching is a HARD REQUIREMENT: cache entries are only useful if models match exactly
 * - Global cache limit per backend (not per-model): shared across all models for that backend
 * - Skip behavior: when high-priority match is unavailable, request can stay in queue
 */

/**
 * Calculate the longest common prefix between two strings
 * O(n) time complexity where n is min(str1.length, str2.length)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Length of the longest common prefix
 */
function calculateLongestCommonPrefix(str1, str2) {
  const len2 = Math.min(str1.length, str2.length);

  for (let i = 0; i < len2; i++) {
    if (str1[i] !== str2[i]) {
      return i;
    }
  }

  return len2;
}

/**
 * Extract prompt text from various request formats
 * Handles string, array (chat messages), and object formats
 * @param {string|string[]|Object} prompt - Request prompt in various formats
 * @returns {string} Extracted prompt text
 */
function extractPromptFromRequest(prompt) {
  if (typeof prompt === 'string') {
    return prompt;
  }

  // Handle messages array (chat format)
  if (Array.isArray(prompt) && prompt.length > 0) {
    const lastMessage = prompt[prompt.length - 1];
    return lastMessage?.content || '';
  }

  // Handle object with content field
  if (typeof prompt === 'object' && prompt.content) {
    return prompt.content;
  }

  return '';
}

/**
 * Match backends based on request ID or prompt prefix similarity
 * Priority order:
 * 1. Exact request ID match (highest priority - if incoming request has ID from previous response)
 * 2. Longest common prefix match on prompt text (with mandatory model match)
 *
 * @param {Object} request - Incoming request object with body and optional id field
 * @param {Object[]} backends - Array of backend instances
 * @param {number} minMatchThreshold - Minimum prefix match threshold (configurable, default: 0.8)
 * @param {number} minMatchLength - Minimum absolute match length (configurable, default: 1000)
 * @returns {{backend: Object|null, requestId: string|null, prefixLength: number, matchType: 'id'|'prefix'|null, shouldSkip: boolean, matchPercentage: number, matchLength: number}}
 */
function matchBackendByPrefix(request, backends, minMatchThreshold = 0.8, minMatchLength = 1000) {
  const prompt = request.body?.prompt || request.body?.messages;
  const requestId = request.body?.id;  // Optional ID from previous response (e.g., "chatcmpl-xxx")
  const model = request.body?.model;

  // Step 1: Try exact request ID match first (highest priority)
  // Model matching also applies to ID matches
  if (requestId) {
    for (const backend of backends) {
      if (!backend.healthy || !backend.prefixCache || backend.prefixCache.length === 0) {
        continue;
      }

      // Check if this backend has the exact request ID AND matching model
      const cached = backend.prefixCache.find(entry =>
        entry.id === requestId &&
        (!model || entry.model === model)  // Model must match if specified
      );

      if (cached) {
        console.log(`[PrefixMatcher] Exact ID match: ${requestId} (model: ${cached.model}) -> ${backend.url}`);
        return {
          backend: backend,
          requestId: requestId,
          prefixLength: cached.prompt.length,
          matchType: 'id',
          shouldSkip: false  // ID match is always preferred, don't skip
        };
      }
    }
  }

  // Step 2: Fall back to longest common prefix (LCP) matching on prompt text
  if (!prompt || typeof prompt !== 'string') {
    return {
      backend: null,
      requestId: null,
      prefixLength: 0,
      matchType: null,
      shouldSkip: false,
      matchPercentage: 0,
      matchLength: 0
    };
  }

  const promptText = extractPromptFromRequest(prompt);
  const promptLength = promptText.length;

  if (promptLength === 0) {
    return {
      backend: null,
      requestId: null,
      prefixLength: 0,
      matchType: null,
      shouldSkip: false,
      matchPercentage: 0,
      matchLength: 0
    };
  }

  let bestBackend = null;
  let bestPrefixLength = 0;
  let bestMatchPercentage = 0;
  let shouldSkip = false;

  for (const backend of backends) {
    if (!backend.healthy || !backend.prefixCache || backend.prefixCache.length === 0) {
      continue;
    }

    // Check each cached prefix in this backend
    for (const cached of backend.prefixCache) {
      // CRITICAL: Model MUST match - this is a hard requirement
      // If models don't match, the cache entry is worthless regardless of prefix length
      if (model && cached.model !== model) {
        continue;  // Skip this cache entry entirely
      }

      const prefixLength = calculateLongestCommonPrefix(promptText, cached.prompt);
      const matchPercentage = prefixLength / promptLength;

      // Check if this is a significant match (longer than current best)
      if (prefixLength > bestPrefixLength) {
        bestBackend = backend;
        bestPrefixLength = prefixLength;
        bestMatchPercentage = matchPercentage;
      }
    }
  }

  // Determine if we should skip this request
  // Skip if backend matches well (≥threshold AND ≥minLength) but is unavailable
  // This allows other requests in the queue to be processed, keeping backends busy
  if (bestBackend && bestMatchPercentage >= minMatchThreshold && bestPrefixLength >= minMatchLength) {
    const isUnhealthy = !bestBackend.healthy;
    const isAtConcurrency = (bestBackend.activeRequestCount || 0) >= (bestBackend.maxConcurrency || 1);
    shouldSkip = isUnhealthy || isAtConcurrency;

    if (shouldSkip) {
      console.log(`[PrefixMatcher] High-priority prefix match (${(bestMatchPercentage*100).toFixed(0)}%, ${bestPrefixLength} chars) but backend unavailable - will skip`);
    }
  }

  return {
    backend: bestBackend,
    requestId: null,
    prefixLength: bestPrefixLength,
    matchType: bestPrefixLength > 0 ? 'prefix' : null,
    shouldSkip: shouldSkip,
    matchPercentage: bestMatchPercentage,
    matchLength: bestPrefixLength
  };
}

module.exports = {
  calculateLongestCommonPrefix,
  matchBackendByPrefix,
  extractPromptFromRequest
};
