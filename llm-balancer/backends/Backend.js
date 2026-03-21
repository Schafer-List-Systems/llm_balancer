/**
 * Backend class - Encapsulates all backend functionality
 * Contains state, BackendInfo (capability detection), and health checker
 * Follows the delegation pattern for health checking
 */

// Maximum number of samples to keep for performance stats calculations
// Configurable via MAX_STATS_SAMPLES environment variable, defaults to 20
const MAX_STATS_SAMPLES = parseInt(process.env.MAX_STATS_SAMPLES) || 20;

// Import PromptCache for KV cache support
const { PromptCache } = require('./PromptCache');

class Backend {
  constructor(url, maxConcurrency = 10) {
    this.url = url;
    this.maxConcurrency = maxConcurrency;
    this.healthy = false;
    this.failCount = 0;
    this.timeoutCount = 0; // Track timeout failures separately
    this.activeRequestCount = 0;
    this.activeStreamingRequests = 0;
    this.activeNonStreamingRequests = 0;
    this.requestCount = 0;
    this.errorCount = 0;

    // BackendInfo (discovery data) will be attached after capability detection
    // This follows composition over duplication - BackendInfo is attached directly
    this.backendInfo = null;

    // Health check tracking
    this.lastCheckTime = null;
    this.lastCheckDuration = null;

    // Performance statistics tracking - stored separately from discovery data
    // Discovery data is a plain object, but we track stats as methods on Backend
    // This structure supports flexible tracking across different API capabilities
    this._performanceStats = {
      requestCount: 0,

      // Time tracking (always available for all request types)
      totalTimeMs: [],                          // Full round-trip time: requestSent to fullResponse
      promptProcessingTimeMs: [],               // Corrected prompt processing time
      generationTimeMs: [],                     // Corrected generation time for ALL n tokens
      networkLatencyMs: [],                     // Network round-trip latency: timeToFirstHeader / 2

      // Token counts (unified: from backend usage OR request-side counting)
      promptTokens: [],                         // Total prompt tokens (from backend or request counting)
      nonCachedPromptTokens: [],                // Non-cached prompt tokens (total - cached)
      completionTokens: [],                     // Completion tokens (from backend or chunk count)
      totalTokens: [],                          // Total tokens

      // Computed rates (derived from time and token metrics)
      totalRate: [],                            // totalTokens / totalTime (tokens/second)
      promptRate: [],                           // promptTokens / promptProcessingTime (tokens/second)
      nonCachedPromptRate: [],                  // nonCachedPromptTokens / promptProcessingTime (tokens/second)
      generationRate: [],                       // completionTokens / generationTime (tokens/second)
      completionRate: []                        // completionTokens / generationTime (tokens/second, same as generationRate)
    };

    // Health checker will be assigned based on primary API type
    // This enables API-specific health checking via delegation
    this.healthChecker = null;

    // PromptCache initialization - config values guaranteed to exist
    const config = require('../config.js').loadConfig();
    this.promptCache = new PromptCache(
      config.prompt.cache.maxSize,
      config.prompt.cache.similarityThreshold
    );
  }

  /**
   * Check backend health using assigned health checker
   * Delegates to healthChecker.check(this) - follows delegation pattern
   * @returns {Promise<Object>} Health status result
   * @throws {Error} If no health checker is assigned
   */
  async checkHealth() {
    if (!this.healthChecker) {
      throw new Error('No health checker assigned to backend');
    }
    return this.healthChecker.check(this);
  }

  /**
   * Get supported API types from BackendInfo
   * @returns {string[]} Array of API types (e.g., ['ollama', 'openai'])
   */
  getApiTypes() {
    return this.backendInfo?.apis
      ? Object.keys(this.backendInfo.apis).filter(api => this.backendInfo.apis[api].supported)
      : [];
  }

  /**
   * Get models for a specific API type
   * @param {string} apiType - API type (e.g., 'ollama', 'openai')
   * @returns {string[]} Array of model names
   */
  getModels(apiType) {
    return this.backendInfo?.models?.[apiType] || [];
  }

  /**
   * Get all models from all supported API types
   * @returns {Object} Map of API type to model array
   */
  getAllModels() {
    return this.backendInfo?.models || {};
  }

  /**
   * Get endpoint for a specific API type
   * @param {string} apiType - API type
   * @returns {string|null} Endpoint path or null
   */
  getEndpoint(apiType) {
    return this.backendInfo?.endpoints?.[apiType] || null;
  }

  /**
   * Get all endpoints from BackendInfo
   * @returns {Object} Map of API type to endpoint path
   */
  getAllEndpoints() {
    return this.backendInfo?.endpoints || {};
  }

  /**
   * Get the primary API type (first supported API)
   * Used for health checker assignment
   * @returns {string|null} Primary API type or null
   */
  getPrimaryApiType() {
    const apiTypes = this.getApiTypes();
    return apiTypes.length > 0 ? apiTypes[0] : null;
  }

  /**
   * Check if backend supports a specific API type
   * @param {string} apiType - API type to check
   * @returns {boolean} True if API is supported
   */
  supportsApi(apiType) {
    return this.backendInfo?.apis?.[apiType]?.supported === true;
  }

  /**
   * Check if backend supports any of the given API types
   * @param {string[]} apiTypes - Array of API types to check
   * @returns {boolean} True if any API is supported
   */
  supportsAnyApi(apiTypes) {
    return apiTypes.some(api => this.supportsApi(api));
  }

  /**
   * Increment request count
   */
  incrementRequestCount() {
    this.requestCount++;
  }

  /**
   * Increment error count
   */
  incrementErrorCount() {
    this.errorCount++;
  }

  /**
   * Increment streaming request count
   * @param {Function} notifyCallback - Callback to notify when transitioning from max concurrency
   */
  incrementStreamingRequest(notifyCallback) {
    this.activeRequestCount++;
    this.activeStreamingRequests++;
    if (this.activeRequestCount >= (this.maxConcurrency || 1) && notifyCallback) {
      notifyCallback();
    }
  }

  /**
   * Decrement streaming request count
   * @param {Function} notifyCallback - Callback to notify when transitioning from max concurrency
   */
  decrementStreamingRequest(notifyCallback) {
    if (this.activeStreamingRequests > 0) {
      this.activeStreamingRequests--;
      this.activeRequestCount--;
      // Notify when transitioning from max to below max
      if (this.activeRequestCount < (this.maxConcurrency || 1)) {
        if (notifyCallback) notifyCallback();
      }
    }
  }

  /**
   * Increment non-streaming request count
   * @param {Function} notifyCallback - Callback to notify when transitioning from max concurrency
   */
  incrementNonStreamingRequest(notifyCallback) {
    this.activeRequestCount++;
    this.activeNonStreamingRequests++;
    if (this.activeRequestCount >= (this.maxConcurrency || 1) && notifyCallback) {
      notifyCallback();
    }
  }

  /**
   * Decrement non-streaming request count
   * @param {Function} notifyCallback - Callback to notify when transitioning from max concurrency
   */
  decrementNonStreamingRequest(notifyCallback) {
    if (this.activeNonStreamingRequests > 0) {
      this.activeNonStreamingRequests--;
      this.activeRequestCount--;
      // Notify when transitioning from max to below max
      if (this.activeRequestCount < (this.maxConcurrency || 1)) {
        if (notifyCallback) notifyCallback();
      }
    }
  }

  /**
   * Check if backend has active streaming requests
   * @returns {boolean} True if has active streaming requests
   */
  hasActiveStreamingRequests() {
    return this.activeStreamingRequests > 0;
  }

  /**
   * Check if backend has active non-streaming requests
   * @returns {boolean} True if has active non-streaming requests
   */
  hasActiveNonStreamingRequests() {
    return this.activeNonStreamingRequests > 0;
  }

  /**
   * Get health status summary
   * @returns {Object} Health status summary
   */
  getHealthSummary() {
    return {
      url: this.url,
      healthy: this.healthy,
      failCount: this.failCount,
      activeRequestCount: this.activeRequestCount,
      activeStreamingRequests: this.activeStreamingRequests,
      activeNonStreamingRequests: this.activeNonStreamingRequests,
      hasStreamingMode: this.activeStreamingRequests > 0,
      hasNonStreamingMode: this.activeNonStreamingRequests > 0,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      apiTypes: this.getApiTypes(),
      primaryApiType: this.getPrimaryApiType()
    };
  }

  /**
   * Limit an array to the maximum number of samples
   * Removes oldest entries (from the beginning of the array) when array exceeds MAX_STATS_SAMPLES
   * @param {any[]} arr - Array to limit
   * @returns {any[]} Limited array
   */
  _limitSamples(arr) {
    if (arr.length > MAX_STATS_SAMPLES) {
      // Remove oldest entries (keep only the most recent MAX_STATS_SAMPLES)
      arr.splice(0, arr.length - MAX_STATS_SAMPLES);
    }
    return arr;
  }

  /**
   * Compute arithmetic mean of an array of numbers
   * Filters out invalid values (Infinity, -Infinity, NaN) before computing average
   * @param {number[]} arr - Array of rates or times
   * @returns {number} Average value or 0 if empty or all invalid
   */
  _computeAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    // Filter out invalid values (Infinity, -Infinity, NaN) before computing average
    const validRates = arr.filter(rate => isFinite(rate));
    if (validRates.length === 0) return 0;
    const sum = validRates.reduce((a, b) => a + b, 0);
    const avg = sum / validRates.length;
    // Debug: Log when computing average from non-empty array
    if (arr.length > 0 && isNaN(avg)) {
      console.error(`[Backend] _computeAverage: arr=${JSON.stringify(arr)}, sum=${sum}, length=${arr.length}`);
    }
    return avg;
  }

  /**
   * Update non-streaming performance statistics
   * For non-streaming requests, the backend is a black box - we cannot measure internal timing.
   * We CAN measure: totalTimeMs, networkLatencyMs, token counts from response
   * We CANNOT know: promptProcessingTime, generationTime (internal to backend)
   * @param {number} promptTokens - Number of prompt tokens (from backend or request counting)
   * @param {number} completionTokens - Number of completion tokens (from backend or chunk count)
   * @param {number} totalTimeMs - Total round-trip time in milliseconds
   * @param {number|null} promptProcessingTimeMs - Prompt processing time (NULL for non-streaming - cannot measure)
   * @param {number|null} networkLatencyMs - Network round-trip latency (timeToFirstHeader / 2)
   * @param {number} nonCachedPromptTokens - Non-cached prompt tokens (optional, defaults to promptTokens if not provided)
   */
  updateNonStreamingStats(promptTokens, completionTokens, totalTimeMs, promptProcessingTimeMs = null, networkLatencyMs = null, nonCachedPromptTokens = null) {
    this._performanceStats.requestCount++;

    // Track totalTimeMs (always available for non-streaming)
    this._performanceStats.totalTimeMs.push(totalTimeMs);
    this._limitSamples(this._performanceStats.totalTimeMs);

    // Only track promptProcessingTimeMs if provided
    // For non-streaming, this is typically NULL because the backend is a black box
    if (promptProcessingTimeMs !== null && promptProcessingTimeMs !== undefined) {
      this._performanceStats.promptProcessingTimeMs.push(promptProcessingTimeMs);
      this._limitSamples(this._performanceStats.promptProcessingTimeMs);
    }

    // Only track networkLatencyMs if provided
    if (networkLatencyMs !== null && networkLatencyMs !== undefined) {
      this._performanceStats.networkLatencyMs.push(networkLatencyMs);
      this._limitSamples(this._performanceStats.networkLatencyMs);
    }

    // Track token counts (unified: backend or request counting - only one source per request)
    if (promptTokens !== undefined && promptTokens !== null) {
      this._performanceStats.promptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.promptTokens);
    }
    // Track non-cached prompt tokens when provided (use promptTokens as default if nonCached not provided)
    if (nonCachedPromptTokens !== undefined && nonCachedPromptTokens !== null) {
      this._performanceStats.nonCachedPromptTokens.push(nonCachedPromptTokens);
      this._limitSamples(this._performanceStats.nonCachedPromptTokens);
    } else if (promptTokens !== undefined && promptTokens !== null) {
      // If non-cached not provided, assume all prompt tokens are non-cached
      this._performanceStats.nonCachedPromptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.nonCachedPromptTokens);
    }
    if (completionTokens !== undefined && completionTokens !== null) {
      this._performanceStats.completionTokens.push(completionTokens);
      this._limitSamples(this._performanceStats.completionTokens);
    }
    // Track total tokens when both components are available
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);
    if (totalTokens > 0) {
      this._performanceStats.totalTokens.push(totalTokens);
      this._limitSamples(this._performanceStats.totalTokens);
    }

    // Compute totalRate (ONLY this is computable for non-streaming with known data)
    if (totalTokens > 0 && totalTimeMs > 0) {
      const totalRate = totalTokens / (totalTimeMs / 1000);
      this._performanceStats.totalRate.push(totalRate);
      this._limitSamples(this._performanceStats.totalRate);
    }

    // DO NOT compute generationTimeMs for non-streaming (cannot measure backend internals)
    // DO NOT compute promptRate (requires promptProcessingTime which is unknown)
    // DO NOT compute nonCachedPromptRate (requires promptProcessingTime which is unknown)
    // DO NOT compute generationRate (requires generationTime which is unknown)
    // DO NOT compute completionRate (requires generationTime which is unknown, same as generationRate)
  }

  /**
   * Update streaming performance statistics
   * Tracks all available metrics including timing (always) and token counts (when available)
   * Computes derived rates only when sufficient data exists
   * @param {number} promptTokens - Number of prompt tokens (from backend or request counting)
   * @param {number} completionTokens - Number of completion tokens (from backend or chunk count)
   * @param {number} firstChunkTimeMs - Time from request sent to first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Time from request sent to full response in milliseconds
   * @param {number} networkLatencyMs - Network round-trip latency in milliseconds (optional)
   * @param {number} correctedGenerationTimeMs - Corrected generation time for ALL n tokens (optional)
   * @param {number} nonCachedPromptTokens - Non-cached prompt tokens (optional, defaults to promptTokens if not provided)
   */
  updateStreamingStats(promptTokens, completionTokens, firstChunkTimeMs, totalCompletionTimeMs, networkLatencyMs = null, correctedGenerationTimeMs = null, nonCachedPromptTokens = null) {
    this._performanceStats.requestCount++;

    // Track time metrics (always available for streaming)
    this._performanceStats.totalTimeMs.push(totalCompletionTimeMs);
    this._limitSamples(this._performanceStats.totalTimeMs);
    this._performanceStats.promptProcessingTimeMs.push(firstChunkTimeMs);
    this._limitSamples(this._performanceStats.promptProcessingTimeMs);

    // Track corrected generation time when provided, otherwise use unadjusted
    if (correctedGenerationTimeMs !== null && correctedGenerationTimeMs !== undefined) {
      this._performanceStats.generationTimeMs.push(correctedGenerationTimeMs);
    } else {
      const generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs;
      this._performanceStats.generationTimeMs.push(generationTimeMs);
    }
    this._limitSamples(this._performanceStats.generationTimeMs);

    // Track network latency when provided
    if (networkLatencyMs !== null && networkLatencyMs !== undefined) {
      this._performanceStats.networkLatencyMs.push(networkLatencyMs);
      this._limitSamples(this._performanceStats.networkLatencyMs);
    }

    // Track token counts (only when provided, allowing null for APIs without usage)
    if (promptTokens !== null && promptTokens !== undefined) {
      this._performanceStats.promptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.promptTokens);
    }
    // Track non-cached prompt tokens when provided (use promptTokens as default if nonCached not provided)
    if (nonCachedPromptTokens !== null && nonCachedPromptTokens !== undefined) {
      this._performanceStats.nonCachedPromptTokens.push(nonCachedPromptTokens);
      this._limitSamples(this._performanceStats.nonCachedPromptTokens);
    } else if (promptTokens !== null && promptTokens !== undefined) {
      // If non-cached not provided, assume all prompt tokens are non-cached
      this._performanceStats.nonCachedPromptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.nonCachedPromptTokens);
    }
    if (completionTokens !== null && completionTokens !== undefined) {
      this._performanceStats.completionTokens.push(completionTokens);
      this._limitSamples(this._performanceStats.completionTokens);
    }
    // Track total tokens when both components are available
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);
    if (totalTokens > 0) {
      this._performanceStats.totalTokens.push(totalTokens);
      this._limitSamples(this._performanceStats.totalTokens);
    }

    // Compute derived rates (only when both numerator and denominator available)
    if (totalTokens > 0 && totalCompletionTimeMs > 0) {
      const totalRate = totalTokens / (totalCompletionTimeMs / 1000);
      this._performanceStats.totalRate.push(totalRate);
      this._limitSamples(this._performanceStats.totalRate);
    }
    if (promptTokens > 0 && firstChunkTimeMs > 0) {
      const promptRate = promptTokens / (firstChunkTimeMs / 1000);
      this._performanceStats.promptRate.push(promptRate);
      this._limitSamples(this._performanceStats.promptRate);
    }
    // Compute non-cached prompt rate
    const actualNonCachedPromptTokens = nonCachedPromptTokens !== null && nonCachedPromptTokens !== undefined
      ? nonCachedPromptTokens
      : (promptTokens !== null && promptTokens !== undefined ? promptTokens : 0);
    if (actualNonCachedPromptTokens > 0 && firstChunkTimeMs > 0) {
      const nonCachedPromptRate = actualNonCachedPromptTokens / (firstChunkTimeMs / 1000);
      this._performanceStats.nonCachedPromptRate.push(nonCachedPromptRate);
      this._limitSamples(this._performanceStats.nonCachedPromptRate);
    }
    // Use corrected generation time for rate calculation when available
    const actualGenerationTime = correctedGenerationTimeMs !== null && correctedGenerationTimeMs !== undefined
      ? correctedGenerationTimeMs
      : totalCompletionTimeMs - firstChunkTimeMs;
    if (completionTokens > 0 && actualGenerationTime > 0) {
      const generationRate = completionTokens / (actualGenerationTime / 1000);
      this._performanceStats.generationRate.push(generationRate);
      this._limitSamples(this._performanceStats.generationRate);
    }
    // Compute completionRate (same formula as generationRate: completionTokens / generationTime)
    if (completionTokens > 0 && actualGenerationTime > 0) {
      const completionRate = completionTokens / (actualGenerationTime / 1000);
      this._performanceStats.completionRate.push(completionRate);
      this._limitSamples(this._performanceStats.completionRate);
    }
  }

  /**
   * Update streaming stats from SSE chunks (for APIs that don't include usage)
   * Uses chunk counting as a fallback for completion tokens (each SSE data chunk ≈ 1 token)
   * Can estimate prompt tokens from request body if available
   * Note: Since this is a fallback for APIs without usage details, we assume all prompt tokens are non-cached
   * @param {number} estimatedPromptTokens - Estimated prompt tokens from request body (can be null)
   * @param {number} chunkCount - Number of SSE data chunks (each represents 1 completion token)
   * @param {number} firstChunkTimeMs - Time from request sent to first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Time from request sent to full response in milliseconds
   */
  updateStreamingStatsFromChunks(estimatedPromptTokens, chunkCount, firstChunkTimeMs, totalCompletionTimeMs) {
    // Each SSE chunk represents 1 completion token (empirically verified)
    const completionTokens = chunkCount;
    // For fallback methods, assume all prompt tokens are non-cached
    const nonCachedPromptTokens = estimatedPromptTokens;
    this.updateStreamingStats(
      estimatedPromptTokens,
      completionTokens,
      firstChunkTimeMs,
      totalCompletionTimeMs,
      null,
      null,
      nonCachedPromptTokens
    );
  }

  /**
   * Get the maximum number of samples used for stats calculations
   * @returns {number} Maximum sample count
   */
  static getMaxSamples() {
    return MAX_STATS_SAMPLES;
  }

  /**
   * Helper method to compute rate statistics from an array of rates
   * Returns structured stats with count and average, or null if insufficient data
   * @param {number[]} rateArray - Array of rates to analyze
   * @returns {{count: number, avgTokensPerSecond: number}|null} Rate statistics or null
   */
  _getRateStats(rateArray) {
    if (!rateArray || rateArray.length === 0) return null;
    const validRates = rateArray.filter(r => isFinite(r));
    if (validRates.length === 0) return null;
    return {
      count: validRates.length,
      avgTokensPerSecond: this._computeAverage(validRates)
    };
  }

  /**
   * Get current performance statistics with computed averages
   * Returns comprehensive stats across all request types and capabilities
   * For non-streaming requests, timeStats.avgPromptProcessingTimeMs and timeStats.avgGenerationTimeMs will be null
   * because these metrics cannot be measured (backend is a black box).
   * @returns {{requestCount: number, timeStats: {avgTotalTimeMs: number, avgPromptProcessingTimeMs: number|null, avgGenerationTimeMs: number|null, avgNetworkLatencyMs: number}, tokenStats: {avgPromptTokens: number|null, avgCompletionTokens: number|null, avgTotalTokens: number|null}, rateStats: {totalRate: {count: number, avgTokensPerSecond: number}|null, promptRate: {count: number, avgTokensPerSecond: number}|null, nonCachedPromptRate: {count: number, avgTokensPerSecond: number}|null, generationRate: {count: number, avgTokensPerSecond: number}|null, completionRate: {count: number, avgTokensPerSecond: number}|null}}} Statistics object
   */
  getPerformanceStats() {
    // Compute averages for time metrics that were tracked
    const avgTotalTimeMs = this._computeAverage(this._performanceStats.totalTimeMs);

    // Return null for networkLatencyMs if no samples were tracked
    // (non-streaming requests don't track this because it's unreliable)
    const hasNetworkLatencyData = this._performanceStats.networkLatencyMs.length > 0;
    const avgNetworkLatencyMs = hasNetworkLatencyData
      ? this._computeAverage(this._performanceStats.networkLatencyMs)
      : null;

    // Return null for promptProcessingTimeMs if no samples were tracked
    // (non-streaming requests don't track this because backend is a black box)
    const hasPromptProcessingData = this._performanceStats.promptProcessingTimeMs.length > 0;
    const avgPromptProcessingTimeMs = hasPromptProcessingData
      ? this._computeAverage(this._performanceStats.promptProcessingTimeMs)
      : null;

    // Return null for generationTimeMs if no samples were tracked
    const hasGenerationTimeData = this._performanceStats.generationTimeMs.length > 0;
    const avgGenerationTimeMs = hasGenerationTimeData
      ? this._computeAverage(this._performanceStats.generationTimeMs)
      : null;

    return {
      requestCount: this._performanceStats.requestCount,

      // Time statistics
      timeStats: {
        avgTotalTimeMs: avgTotalTimeMs,
        avgNetworkLatencyMs: avgNetworkLatencyMs,           // null for non-streaming
        avgPromptProcessingTimeMs: avgPromptProcessingTimeMs, // null for non-streaming
        avgGenerationTimeMs: avgGenerationTimeMs             // null for non-streaming
      },

      // Token statistics (may be null if never received from backend)
      tokenStats: {
        avgPromptTokens: this._computeAverage(this._performanceStats.promptTokens) || null,
        avgNonCachedPromptTokens: this._computeAverage(this._performanceStats.nonCachedPromptTokens) || null,
        avgCompletionTokens: this._computeAverage(this._performanceStats.completionTokens) || null,
        avgTotalTokens: this._computeAverage(this._performanceStats.totalTokens) || null
      },

      // Rate statistics (may be null if insufficient data for computation)
      rateStats: {
        totalRate: this._getRateStats(this._performanceStats.totalRate),
        promptRate: this._getRateStats(this._performanceStats.promptRate),
        nonCachedPromptRate: this._getRateStats(this._performanceStats.nonCachedPromptRate),
        generationRate: this._getRateStats(this._performanceStats.generationRate),
        completionRate: this._getRateStats(this._performanceStats.completionRate)
      }
    };
  }

  /**
   * Get performance statistics with raw sample data for chart visualization
   * Returns same structure as getPerformanceStats() plus rawSamples arrays
   * Raw samples contain individual data points for creating time-series charts
   * @returns {{requestCount: number, timeStats: {avgTotalTimeMs: number, avgPromptProcessingTimeMs: number|null, avgGenerationTimeMs: number|null, avgNetworkLatencyMs: number}, tokenStats: {avgPromptTokens: number|null, avgCompletionTokens: number|null, avgTotalTokens: number|null}, rateStats: {totalRate: {count: number, avgTokensPerSecond: number}|null, promptRate: {count: number, avgTokensPerSecond: number}|null, nonCachedPromptRate: {count: number, avgTokensPerSecond: number}|null, generationRate: {count: number, avgTokensPerSecond: number}|null, completionRate: {count: number, avgTokensPerSecond: number}|null}}, rawSamples: {timeStats: {totalTimeMs: number[], promptProcessingTimeMs: number[], generationTimeMs: number[], networkLatencyMs: number[]}, tokenStats: {promptTokens: number[], completionTokens: number[], totalTokens: number[], nonCachedPromptTokens: number[]}, rateStats: {totalRate: number[], promptRate: number[], nonCachedPromptRate: number[], generationRate: number[], completionRate: number[]}}} Performance stats with raw samples
   */
  getPerformanceStatsWithSamples() {
    const stats = this.getPerformanceStats();

    // Create raw samples for chart visualization
    const rawSamples = {
      timeStats: {
        totalTimeMs: [...this._performanceStats.totalTimeMs],
        promptProcessingTimeMs: [...this._performanceStats.promptProcessingTimeMs],
        generationTimeMs: [...this._performanceStats.generationTimeMs],
        networkLatencyMs: [...this._performanceStats.networkLatencyMs]
      },
      tokenStats: {
        promptTokens: [...this._performanceStats.promptTokens],
        completionTokens: [...this._performanceStats.completionTokens],
        totalTokens: [...this._performanceStats.totalTokens],
        nonCachedPromptTokens: [...this._performanceStats.nonCachedPromptTokens]
      },
      rateStats: {
        totalRate: [...this._performanceStats.totalRate],
        promptRate: [...this._performanceStats.promptRate],
        nonCachedPromptRate: [...this._performanceStats.nonCachedPromptRate],
        generationRate: [...this._performanceStats.generationRate],
        completionRate: [...this._performanceStats.completionRate]
      }
    };

    // Add requestCount to tokenStats for chart alignment
    rawSamples.tokenStats.requestCount = this._performanceStats.requestCount;

    return {
      ...stats,
      rawSamples
    };
  }

  /**
   * Cache a completed request prompt
   * Adds prompt to backend's prompt cache for KV cache reuse
   *
   * @param {string} prompt - Full prompt body that was sent to backend
   * @param {string} model - Model name used for the request
   * @param {string|null} id - Optional backend response ID (if backend provides one)
   */
  cachePrompt(prompt, model, id = null) {
    if (!this.promptCache) {
      console.warn(`[Backend] ${this.url}: Prompt cache not initialized, skipping cachePrompt`);
      return;
    }
    console.debug(`[Backend] ${this.url}: Caching prompt for model: ${model}, id: ${id || 'none'}`);
    this.promptCache.addOrUpdate(prompt, model, id);
  }

  /**
   * Find if a prompt matches any cached entry
   * Looks for cached prompt with similar fingerprint for KV cache reuse
   *
   * @param {string} prompt - Prompt body to match
   * @param {string} model - Model name
   * @param {string|null} id - Optional response ID (if available)
   * @returns {{ entry: PromptCacheEntry, similarity: number, matchType: string }|null}
   *          matchType: 'id' or 'similarity'
   */
  findCacheMatch(prompt, model, id = null) {
    if (!this.promptCache) {
      return null;
    }
    console.debug(`[Backend] ${this.url}: Looking for cache match - model: ${model}, id: ${id || 'none'}`);
    const result = this.promptCache.findBestMatch(prompt, model, id);
    if (result) {
      console.debug(`[Backend] ${this.url}: Cache hit found - similarity: ${result.similarity.toFixed(4)}, type: ${result.matchType}`);
    } else {
      console.debug(`[Backend] ${this.url}: No cache match found`);
    }
    return result;
  }

  /**
   * Get prompt cache statistics for monitoring
   * @returns {{ hits: number, misses: number, evictions: number, idMatches: number, similarityMatches: number, size: number, maxSize: number }}
   */
  getPromptCacheStats() {
    if (!this.promptCache) {
      return null;
    }
    const stats = this.promptCache.getStats();
    // Add cached prompt with metadata for debugging
    stats.cachedPrompts = this.promptCache.entries.map(entry => entry.getDebugData());
    return stats;
  }

  /**
   * Reset the prompt cache for this backend
   * Clears all cached prompts and resets cache statistics
   */
  resetPromptCache() {
    if (!this.promptCache) {
      console.warn(`[Backend] ${this.url}: Prompt cache not initialized`);
      return { success: false, message: 'Cache not initialized' };
    }
    this.promptCache.clear();
    console.info(`[Backend] ${this.url}: Prompt cache reset completed`);
    return { success: true, message: 'Cache reset successfully' };
  }

  /**
   * Reset performance statistics for this backend
   * Clears request counts and all tracking arrays
   */
  resetPerformanceStats() {
    this.requestCount = 0;
    this.errorCount = 0;

    // Reset all performance stats arrays
    this._performanceStats.requestCount = 0;
    this._performanceStats.totalTimeMs = [];
    this._performanceStats.promptProcessingTimeMs = [];
    this._performanceStats.generationTimeMs = [];
    this._performanceStats.networkLatencyMs = [];
    this._performanceStats.promptTokens = [];
    this._performanceStats.nonCachedPromptTokens = [];
    this._performanceStats.completionTokens = [];
    this._performanceStats.totalTokens = [];
    this._performanceStats.totalRate = [];
    this._performanceStats.promptRate = [];
    this._performanceStats.nonCachedPromptRate = [];
    this._performanceStats.generationRate = [];
    this._performanceStats.completionRate = [];

    console.info(`[Backend] ${this.url}: Performance stats reset completed`);
  }
}

module.exports = Backend;
