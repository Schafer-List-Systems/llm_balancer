/**
 * Unit Tests for Non-Streaming Statistics
 *
 * These tests verify that non-streaming statistics are computed correctly:
 * - totalTimeMs and networkLatencyMs should be tracked
 * - promptProcessingTimeMs should NOT be tracked (backend is a black box)
 * - generationTimeMs should NOT be tracked (backend is a black box)
 * - token counts (promptTokens, completionTokens, totalTokens) should be tracked
 * - totalRate should be computed (totalTokens / totalTime)
 * - promptRate, generationRate, and completionRate should NOT be computed (insufficient data)
 */

const http = require('http');
const Backend = require('../../backends/Backend');

describe('Non-Streaming Statistics', () => {
  let mockBackend;

  beforeEach(() => {
    // Create mock backend
    mockBackend = new Backend('http://localhost:3000', 10);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateNonStreamingStats parameters', () => {
    it('should accept null for promptProcessingTimeMs (cannot measure)', () => {
      // Call the actual method with null for promptProcessingTimeMs
      expect(() => {
        Backend.prototype.updateNonStreamingStats.call(mockBackend, 10, 20, 5000, null, null);
      }).not.toThrow();
    });

    it('should accept null for networkLatencyMs (unreliable in non-streaming)', () => {
      // In Node.js non-streaming mode, the entire response is buffered before the
      // 'response' event fires, making timeToFirstHeader meaningless
      expect(() => {
        Backend.prototype.updateNonStreamingStats.call(mockBackend, 10, 20, 5000, null, null);
      }).not.toThrow();
    });
  });

  describe('Backend performance stats structure', () => {
    it('should track totalTimeMs', () => {
      const totalTime = 5000;

      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        totalTime,  // totalTimeMs
        null,   // promptProcessingTimeMs (cannot measure)
        null    // networkLatencyMs (unreliable in non-streaming)
      );

      const stats = mockBackend.getPerformanceStats();
      expect(stats.timeStats.avgTotalTimeMs).toBe(totalTime);
    });

    it('should NOT track networkLatencyMs for non-streaming (unreliable)', () => {
      // In Node.js non-streaming mode, the entire response is buffered before the
      // 'response' event fires, making timeToFirstHeader ≈ totalTime, which is wrong.
      // Therefore, networkLatencyMs should be null for non-streaming.
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs (unreliable in non-streaming)
      );

      const stats = mockBackend.getPerformanceStats();
      expect(stats.timeStats.avgNetworkLatencyMs).toBeNull();
    });

    it('should return null for avgPromptProcessingTimeMs when never tracked', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // When promptProcessingTimeMs is never tracked (null), should return null
      expect(stats.timeStats.avgPromptProcessingTimeMs).toBeNull();
    });

    it('should return null for avgGenerationTimeMs when never tracked', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // generationTimeMs should be null when no data was tracked
      expect(stats.timeStats.avgGenerationTimeMs).toBeNull();
    });
  });

  describe('Token statistics', () => {
    it('should track promptTokens', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      expect(stats.tokenStats.avgPromptTokens).toBe(10);
    });

    it('should track completionTokens', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      expect(stats.tokenStats.avgCompletionTokens).toBe(20);
    });

    it('should track totalTokens', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        5000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      expect(stats.tokenStats.avgTotalTokens).toBe(30);
    });
  });

  describe('Rate statistics', () => {
    it('should compute totalRate (totalTokens / totalTime)', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        1000,  // totalTimeMs (1 second)
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // totalRate = 30 tokens / 1 second = 30 tokens/second
      expect(stats.rateStats.totalRate).toEqual({
        count: 1,
        avgTokensPerSecond: 30
      });
    });

    it('should return null for promptRate (no promptProcessingTime)', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        1000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // promptRate requires promptProcessingTime which is not tracked
      expect(stats.rateStats.promptRate).toBeNull();
    });

    it('should return null for generationRate (no generationTime)', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        1000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // generationRate requires generationTime which is not tracked
      expect(stats.rateStats.generationRate).toBeNull();
    });

    it('should return null for completionRate (no generationTime)', () => {
      mockBackend.updateNonStreamingStats(
        10,    // promptTokens
        20,    // completionTokens
        1000,  // totalTimeMs
        null,  // promptProcessingTimeMs
        null   // networkLatencyMs
      );

      const stats = mockBackend.getPerformanceStats();
      // completionRate requires generationTime which is not tracked (same as generationRate)
      expect(stats.rateStats.completionRate).toBeNull();
    });
  });

  describe('Sample limiting', () => {
    it('should limit samples to MAX_STATS_SAMPLES (20 by default)', () => {
      // Add more than MAX_STATS_SAMPLES samples
      for (let i = 0; i < 25; i++) {
        mockBackend.updateNonStreamingStats(
          10 + i,
          20 + i,
          1000 + i,
          null,
          50
        );
      }

      const stats = mockBackend.getPerformanceStats();
      // Should have exactly 20 samples (MAX_STATS_SAMPLES)
      expect(mockBackend._performanceStats.totalTimeMs.length).toBe(20);
      expect(mockBackend._performanceStats.promptTokens.length).toBe(20);
      expect(mockBackend._performanceStats.completionTokens.length).toBe(20);
      // oldest sample should be index 5 (25 - 20 = 5)
      expect(mockBackend._performanceStats.promptTokens[0]).toBe(15);
      // newest sample should be index 19
      expect(mockBackend._performanceStats.promptTokens[19]).toBe(34);
    });
  });

  describe('Real scenario simulation', () => {
    it('should correctly handle multiple non-streaming requests', () => {
      // Simulate 5 requests with varying times
      for (let i = 0; i < 5; i++) {
        mockBackend.updateNonStreamingStats(
          10 + i * 5,      // promptTokens
          20 + i * 10,     // completionTokens
          1000 + i * 100,  // totalTimeMs
          null,            // promptProcessingTimeMs (cannot measure)
          null             // networkLatencyMs (unreliable in non-streaming)
        );
      }

      const stats = mockBackend.getPerformanceStats();

      // Verify all 5 requests were tracked
      expect(stats.requestCount).toBe(5);

      // Verify token stats (averages)
      // promptTokens: (10+15+20+25+30)/5 = 20
      expect(stats.tokenStats.avgPromptTokens).toBe(20);
      // completionTokens: (20+30+40+50+60)/5 = 40
      expect(stats.tokenStats.avgCompletionTokens).toBe(40);
      // totalTokens: (30+45+60+75+90)/5 = 60
      expect(stats.tokenStats.avgTotalTokens).toBe(60);

      // Verify totalRate is computed
      expect(stats.rateStats.totalRate).not.toBeNull();
      expect(stats.rateStats.totalRate.count).toBe(5);

      // Verify promptRate, generationRate, and completionRate are null (cannot compute)
      expect(stats.rateStats.promptRate).toBeNull();
      expect(stats.rateStats.generationRate).toBeNull();
      expect(stats.rateStats.completionRate).toBeNull();

      // Verify time stats
      expect(stats.timeStats.avgTotalTimeMs).toBe(1200);  // (1000+1100+1200+1300+1400)/5 = 1200

      // Verify that unknown metrics are null
      expect(stats.timeStats.avgNetworkLatencyMs).toBeNull();
      expect(stats.timeStats.avgPromptProcessingTimeMs).toBeNull();
      expect(stats.timeStats.avgGenerationTimeMs).toBeNull();
    });
  });

  describe('Mixed streaming and non-streaming', () => {
    it('should handle both request types correctly', () => {
      // Add a non-streaming request
      mockBackend.updateNonStreamingStats(
        10,
        20,
        1000,
        null,  // no promptProcessingTime
        null   // networkLatency (unreliable in non-streaming)
      );

      // Add a streaming request with full timing data
      mockBackend.updateStreamingStats(
        10,
        20,
        100,   // firstChunkTimeMs
        1000,  // totalCompletionTimeMs
        50,    // networkLatency
        800    // correctedGenerationTimeMs
      );

      const stats = mockBackend.getPerformanceStats();

      // Non-streaming should not add to promptProcessingTimeMs or generationTimeMs
      // Streaming should add to those arrays
      expect(stats.timeStats.avgPromptProcessingTimeMs).not.toBeNull();  // from streaming
      expect(stats.timeStats.avgGenerationTimeMs).not.toBeNull();         // from streaming
    });
  });
});
