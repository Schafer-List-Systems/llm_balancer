/**
 * Backend class - Encapsulates all backend functionality
 * Contains state, BackendInfo (capability detection), and health checker
 * Follows the delegation pattern for health checking
 */

// Maximum number of samples to keep for performance stats calculations
// Configurable via MAX_STATS_SAMPLES environment variable, defaults to 20
const MAX_STATS_SAMPLES = parseInt(process.env.MAX_STATS_SAMPLES) || 20;

class Backend {
  constructor(url, maxConcurrency = 10) {
    this.url = url;
    this.maxConcurrency = maxConcurrency;
    this.healthy = false;
    this.failCount = 0;
    this.activeRequestCount = 0;
    this.requestCount = 0;
    this.errorCount = 0;

    // BackendInfo (discovery data) will be attached after capability detection
    // This follows composition over duplication - BackendInfo is attached directly
    this.backendInfo = null;

    // Performance statistics tracking - stored separately from discovery data
    // Discovery data is a plain object, but we track stats as methods on Backend
    // This structure supports flexible tracking across different API capabilities
    this._performanceStats = {
      requestCount: 0,

      // Time tracking (always available for all request types)
      totalTimeMs: [],              // Full round-trip time: requestSent to fullResponse
      promptProcessingTimeMs: [],   // Time to first chunk/header: firstChunkTime - requestSent
      generationTimeMs: [],         // Token generation time: fullResponse - firstChunk

      // Token counts (when available from backend)
      promptTokens: [],             // Prompt tokens (may be null for some backends)
      completionTokens: [],         // Completion tokens (may be null for some backends)
      totalTokens: [],              // Total tokens (may be null)

      // Computed rates (derived from time and token metrics)
      totalRate: [],                // totalTokens / totalTime (tokens/second)
      promptRate: [],               // promptTokens / promptProcessingTime (tokens/second)
      generationRate: []            // completionTokens / generationTime (tokens/second)
    };

    // Health checker will be assigned based on primary API type
    // This enables API-specific health checking via delegation
    this.healthChecker = null;
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
   * Get health status summary
   * @returns {Object} Health status summary
   */
  getHealthSummary() {
    return {
      url: this.url,
      healthy: this.healthy,
      failCount: this.failCount,
      activeRequestCount: this.activeRequestCount,
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
   * Tracks time metrics (always available) and token counts (when provided by backend)
   * Also computes derived rates only when sufficient data is available
   * @param {number} promptTokens - Number of prompt tokens used (can be null if not available)
   * @param {number} completionTokens - Number of completion tokens generated (can be null)
   * @param {number} totalTimeMs - Total round-trip time in milliseconds (request sent to full response)
   * @param {number} promptProcessingTimeMs - Time to first header/chunk in milliseconds (optional)
   */
  updateNonStreamingStats(promptTokens, completionTokens, totalTimeMs, promptProcessingTimeMs = null) {
    this._performanceStats.requestCount++;

    // Track time metrics (always available)
    this._performanceStats.totalTimeMs.push(totalTimeMs);
    this._limitSamples(this._performanceStats.totalTimeMs);
    if (promptProcessingTimeMs !== null) {
      this._performanceStats.promptProcessingTimeMs.push(promptProcessingTimeMs);
      this._limitSamples(this._performanceStats.promptProcessingTimeMs);
    }

    // Track token counts (only when provided, preserving null for backends without usage)
    if (promptTokens !== undefined && promptTokens !== null) {
      this._performanceStats.promptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.promptTokens);
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
    if (totalTokens > 0 && totalTimeMs > 0) {
      const totalRate = totalTokens / (totalTimeMs / 1000);
      this._performanceStats.totalRate.push(totalRate);
      this._limitSamples(this._performanceStats.totalRate);
    }
    if (promptTokens > 0 && promptProcessingTimeMs !== null && promptProcessingTimeMs > 0) {
      const promptRate = promptTokens / (promptProcessingTimeMs / 1000);
      this._performanceStats.promptRate.push(promptRate);
      this._limitSamples(this._performanceStats.promptRate);
    }
    const generationTimeMs = totalTimeMs - (promptProcessingTimeMs || 0);
    if (completionTokens > 0 && generationTimeMs > 0) {
      const generationRate = completionTokens / (generationTimeMs / 1000);
      this._performanceStats.generationRate.push(generationRate);
      this._limitSamples(this._performanceStats.generationRate);
    }
  }

  /**
   * Update streaming performance statistics
   * Tracks all available metrics including timing (always) and token counts (when available)
   * Computes derived rates only when sufficient data exists
   * @param {number} promptTokens - Number of prompt tokens (can be null if not in response)
   * @param {number} completionTokens - Number of completion tokens (can be null if not in response)
   * @param {number} firstChunkTimeMs - Time from request sent to first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Time from request sent to full response in milliseconds
   */
  updateStreamingStats(promptTokens, completionTokens, firstChunkTimeMs, totalCompletionTimeMs) {
    this._performanceStats.requestCount++;

    // Track time metrics (always available for streaming)
    this._performanceStats.totalTimeMs.push(totalCompletionTimeMs);
    this._limitSamples(this._performanceStats.totalTimeMs);
    this._performanceStats.promptProcessingTimeMs.push(firstChunkTimeMs);
    this._limitSamples(this._performanceStats.promptProcessingTimeMs);

    const generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs;
    this._performanceStats.generationTimeMs.push(generationTimeMs);
    this._limitSamples(this._performanceStats.generationTimeMs);

    // Track token counts (only when provided, allowing null for APIs without usage)
    if (promptTokens !== null && promptTokens !== undefined) {
      this._performanceStats.promptTokens.push(promptTokens);
      this._limitSamples(this._performanceStats.promptTokens);
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
    if (completionTokens > 0 && generationTimeMs > 0) {
      const generationRate = completionTokens / (generationTimeMs / 1000);
      this._performanceStats.generationRate.push(generationRate);
      this._limitSamples(this._performanceStats.generationRate);
    }
  }

  /**
   * Update streaming stats from SSE chunks (for APIs that don't include usage)
   * Uses chunk counting as a fallback for completion tokens (each SSE data chunk ≈ 1 token)
   * Can estimate prompt tokens from request body if available
   * @param {number} estimatedPromptTokens - Estimated prompt tokens from request body (can be null)
   * @param {number} chunkCount - Number of SSE data chunks (each represents 1 completion token)
   * @param {number} firstChunkTimeMs - Time from request sent to first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Time from request sent to full response in milliseconds
   */
  updateStreamingStatsFromChunks(estimatedPromptTokens, chunkCount, firstChunkTimeMs, totalCompletionTimeMs) {
    // Each SSE chunk represents 1 completion token (empirically verified)
    const completionTokens = chunkCount;
    this.updateStreamingStats(
      estimatedPromptTokens,
      completionTokens,
      firstChunkTimeMs,
      totalCompletionTimeMs
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
   * @returns {{requestCount: number, timeStats: {avgTotalTimeMs: number, avgPromptProcessingTimeMs: number, avgGenerationTimeMs: number}, tokenStats: {avgPromptTokens: number|null, avgCompletionTokens: number|null, avgTotalTokens: number|null}, rateStats: {totalRate: {count: number, avgTokensPerSecond: number}|null, promptRate: {count: number, avgTokensPerSecond: number}|null, generationRate: {count: number, avgTokensPerSecond: number}|null}}} Statistics object
   */
  getPerformanceStats() {
    return {
      requestCount: this._performanceStats.requestCount,

      // Time statistics (always available for all request types)
      timeStats: {
        avgTotalTimeMs: this._computeAverage(this._performanceStats.totalTimeMs),
        avgPromptProcessingTimeMs: this._computeAverage(this._performanceStats.promptProcessingTimeMs),
        avgGenerationTimeMs: this._computeAverage(this._performanceStats.generationTimeMs)
      },

      // Token statistics (may be null if never received from backend)
      tokenStats: {
        avgPromptTokens: this._computeAverage(this._performanceStats.promptTokens) || null,
        avgCompletionTokens: this._computeAverage(this._performanceStats.completionTokens) || null,
        avgTotalTokens: this._computeAverage(this._performanceStats.totalTokens) || null
      },

      // Rate statistics (may be null if insufficient data for computation)
      rateStats: {
        totalRate: this._getRateStats(this._performanceStats.totalRate),
        promptRate: this._getRateStats(this._performanceStats.promptRate),
        generationRate: this._getRateStats(this._performanceStats.generationRate)
      }
    };
  }

}

module.exports = Backend;
