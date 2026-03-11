/**
 * Backend class - Encapsulates all backend functionality
 * Contains state, BackendInfo (capability detection), and health checker
 * Follows the delegation pattern for health checking
 */

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
    this._performanceStats = {
      requestCount: 0,
      nonStreamingRates: [],
      streamingPromptRates: [],
      streamingGenerationRates: []
    };

    // Timing-only tracking for APIs that don't include usage in streaming responses
    this._timingStats = {
      streamingRequestCount: 0,
      firstChunkTimes: [],   // For API types like vLLM without usage in stream
      totalCompletionTimes: []
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
   * Compute arithmetic mean of an array of numbers
   * @param {number[]} arr - Array of rates
   * @returns {number} Average value or 0 if empty
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
   * Calculates tokens/second for this request and stores the rate
   * @param {number} promptTokens - Number of prompt tokens used
   * @param {number} completionTokens - Number of completion tokens generated
   * @param {number} responseTimeMs - Total response time in milliseconds
   */
  updateNonStreamingStats(promptTokens, completionTokens, responseTimeMs) {
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);

    // Calculate tokens per second for this request
    const responseTimeSeconds = responseTimeMs / 1000;
    // Avoid division by zero - if response time is 0, use a minimum of 1ms
    const effectiveResponseTimeSeconds = Math.max(responseTimeSeconds, 0.001);
    const rate = totalTokens / effectiveResponseTimeSeconds;

    // Store the per-request rate
    this._performanceStats.nonStreamingRates.push(rate);
    this._performanceStats.requestCount++;
  }

  /**
   * Update streaming performance statistics
   * Calculates prompt processing rate and generation rate separately
   * @param {number} promptTokens - Number of prompt tokens used
   * @param {number} completionTokens - Number of completion tokens generated
   * @param {number} firstChunkTimeMs - Time to receive first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Total time until response completed in milliseconds
   */
  updateStreamingStats(promptTokens, completionTokens, firstChunkTimeMs, totalCompletionTimeMs) {
    promptTokens = promptTokens || 0;
    completionTokens = completionTokens || 0;
    firstChunkTimeMs = firstChunkTimeMs || 0;
    totalCompletionTimeMs = totalCompletionTimeMs || 0;

    // Only track if we have valid token counts (some APIs don't include usage in streaming)
    if (promptTokens === 0 && completionTokens === 0) {
      return; // Skip tracking, no token data available
    }

    // Calculate prompt processing rate (tokens/second to first chunk)
    const promptProcessingSeconds = firstChunkTimeMs / 1000;
    const promptRate = promptTokens / promptProcessingSeconds;

    // Calculate generation rate (completion tokens/second during streaming)
    const generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs;
    const generationSeconds = generationTimeMs / 1000;
    const generationRate = completionTokens / generationSeconds;

    // Store the per-request rates
    this._performanceStats.streamingPromptRates.push(promptRate);
    this._performanceStats.streamingGenerationRates.push(generationRate);
    this._performanceStats.requestCount++;
  }

  /**
   * Update timing-only stats for APIs that don't include usage in streaming responses
   * @param {number} firstChunkTimeMs - Time to first chunk in milliseconds
   * @param {number} totalCompletionTimeMs - Total completion time in milliseconds
   */
  updateStreamingTimingStats(firstChunkTimeMs, totalCompletionTimeMs) {
    this._timingStats.streamingRequestCount++;
    this._timingStats.firstChunkTimes.push(firstChunkTimeMs);
    this._timingStats.totalCompletionTimes.push(totalCompletionTimeMs);
  }

  /**
   * Get current performance statistics with computed averages
   * @returns {{requestCount: number, nonStreamingStats: {count: number, avgTokensPerSecond: number}, streamingStats: {promptProcessingRate: {count: number, avgTokensPerSecond: number}, generationRate: {count: number, avgTokensPerSecond: number}}}} Statistics object
   */
  getPerformanceStats() {
    return {
      requestCount: this._performanceStats.requestCount,
      nonStreamingStats: {
        count: this._performanceStats.nonStreamingRates.length,
        avgTokensPerSecond: this._computeAverage(this._performanceStats.nonStreamingRates)
      },
      streamingStats: {
        promptProcessingRate: {
          count: this._performanceStats.streamingPromptRates.length,
          avgTokensPerSecond: this._computeAverage(this._performanceStats.streamingPromptRates)
        },
        generationRate: {
          count: this._performanceStats.streamingGenerationRates.length,
          avgTokensPerSecond: this._computeAverage(this._performanceStats.streamingGenerationRates)
        }
      },
      // Include timing-only stats for APIs without usage in streaming (e.g., vLLM)
      timingStats: {
        streamingRequestCount: this._timingStats.streamingRequestCount,
        avgFirstChunkTimeMs: this._computeAverage(this._timingStats.firstChunkTimes),
        avgTotalCompletionTimeMs: this._computeAverage(this._timingStats.totalCompletionTimes)
      }
    };
  }
}

module.exports = Backend;
