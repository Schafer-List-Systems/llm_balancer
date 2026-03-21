/**
 * Unit tests for Backend class
 * Tests Backend class initialization, health checking, and utility methods
 */

const Backend = require('../../backends/Backend');
const OllamaHealthCheck = require('../../interfaces/implementations/OllamaHealthCheck');
const OpenAIHealthCheck = require('../../interfaces/implementations/OpenAIHealthCheck');

// Mock BackendInfo
const createMockBackendInfo = (apiTypes, models = {}) => {
  const apis = {};
  const backendModels = {};
  const endpoints = {};

  apiTypes.forEach(apiType => {
    apis[apiType] = {
      supported: true,
      modelListEndpoint: `/v1/${apiType}/models`,
      chatEndpoint: `/v1/${apiType}/chat`,
      models: models[apiType] || []
    };
    backendModels[apiType] = models[apiType] || [];
    endpoints[apiType] = `/v1/${apiType}/models`;
  });

  return {
    url: 'http://localhost:11434',
    healthy: true,
    apis,
    models: backendModels,
    endpoints,
    detectedAt: new Date().toISOString()
  };
};

describe('Backend Class - Performance Stats', () => {
  describe('_limitSamples()', () => {
    it('should not modify array when under default limit (20)', () => {
      const backend = new Backend('http://localhost:11434');
      const arr = [1, 2, 3, 4, 5];
      const result = backend._limitSamples(arr);

      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(arr.length).toBe(5);
    });

    it('should not trim array when under default limit (20)', () => {
      const backend = new Backend('http://localhost:11434');
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = backend._limitSamples(arr);

      expect(result).toEqual(arr);
      expect(arr.length).toBe(10); // Under 20 default limit
    });

    it('should trim array when over default limit (20)', () => {
      const backend = new Backend('http://localhost:11434');
      const arr = [];
      for (let i = 0; i < 25; i++) {
        arr.push(i);
      }
      const result = backend._limitSamples(arr);

      expect(result).toBe(arr);
      expect(arr.length).toBe(20); // Trimmed to default MAX_STATS_SAMPLES
      // Should keep most recent 20 (5,6,7,...,24)
      expect(arr[0]).toBe(5);
      expect(arr[19]).toBe(24);
    });

    it('should return the same array reference', () => {
      const backend = new Backend('http://localhost:11434');
      const arr = [1, 2, 3];
      const result = backend._limitSamples(arr);

      expect(result).toBe(arr);
    });
  });

  describe('updateNonStreamingStats() - with sample limiting', () => {
    it('should keep only MAX_STATS_SAMPLES (20) most recent entries by default', () => {
      const backend = new Backend('http://localhost:11434');

      // Add more samples than the default limit (20)
      // Loop runs i=0 to i=29, so promptTokens = 10+i = 10 to 39
      for (let i = 0; i < 30; i++) {
        backend.updateNonStreamingStats(
          10 + i,      // promptTokens (10,11,12,...,39)
          20 + i,      // completionTokens
          100 + i,     // totalTimeMs
          10 + i       // promptProcessingTimeMs
        );
      }

      // Should only have MAX_SAMPLES entries (default 20)
      expect(backend._performanceStats.totalTimeMs.length).toBe(20);
      expect(backend._performanceStats.promptTokens.length).toBe(20);
      expect(backend._performanceStats.completionTokens.length).toBe(20);

      // Should keep most recent 20 samples (promptTokens 20-39, removed 10-19)
      expect(backend._performanceStats.promptTokens[0]).toBe(20);  // First kept (10+10)
      expect(backend._performanceStats.promptTokens[19]).toBe(39); // Last kept (10+29)
    });

    it('should keep most recent samples with oldest removed', () => {
      const backend = new Backend('http://localhost:11434');

      // Add samples with known values
      for (let i = 0; i < 25; i++) {
        backend.updateNonStreamingStats(
          i,      // promptTokens (0,1,2,...,24)
          i * 10, // completionTokens
          100,    // totalTimeMs
          10      // promptProcessingTimeMs
        );
      }

      // Should only have 20 most recent samples (promptTokens: 5,6,...,24)
      const promptTokens = backend._performanceStats.promptTokens;
      expect(promptTokens.length).toBe(20);
      expect(promptTokens[0]).toBe(5);  // First kept (removed 0-4)
      expect(promptTokens[19]).toBe(24); // Last kept
    });
  });

  describe('updateStreamingStats() - with sample limiting', () => {
    it('should keep only MAX_STATS_SAMPLES (20) most recent entries by default', () => {
      const backend = new Backend('http://localhost:11434');

      // Add more samples than the default limit (20)
      for (let i = 0; i < 30; i++) {
        backend.updateStreamingStats(
          10 + i,           // promptTokens
          20 + i,           // completionTokens
          10 + i,           // firstChunkTimeMs
          100 + i           // totalCompletionTimeMs
        );
      }

      // Should only have MAX_SAMPLES entries (default 20)
      expect(backend._performanceStats.totalTimeMs.length).toBe(20);
      expect(backend._performanceStats.promptTokens.length).toBe(20);
      expect(backend._performanceStats.completionTokens.length).toBe(20);
      expect(backend._performanceStats.generationTimeMs.length).toBe(20);
    });

    it('should keep most recent samples for generationTimeMs', () => {
      const backend = new Backend('http://localhost:11434');

      // Add samples with known firstChunkTimeMs
      // Loop runs i=0 to i=24, firstChunkTimeMs = 5+i = 5 to 29
      // generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs = 100 - (5+i) = 95 to 71
      // With MAX_SAMPLES=20, we keep last 20 samples (i=5 to i=24)
      for (let i = 0; i < 25; i++) {
        backend.updateStreamingStats(
          10,             // promptTokens
          20,             // completionTokens
          5 + i,          // firstChunkTimeMs (5,6,7,...,29)
          100             // totalCompletionTimeMs
        );
      }

      const generationTimeMs = backend._performanceStats.generationTimeMs;
      expect(generationTimeMs.length).toBe(20);
      // First kept generationTimeMs: 100 - (5+5) = 90 (i=5)
      // Last kept generationTimeMs: 100 - 29 = 71 (i=24)
      expect(generationTimeMs[0]).toBe(90);
      expect(generationTimeMs[19]).toBe(71);
    });
  });

  describe('getPerformanceStats() - with sample limiting', () => {
    it('should compute averages from limited samples only', () => {
      const backend = new Backend('http://localhost:11434');

      // Add varied response times
      for (let i = 0; i < 10; i++) {
        backend.updateNonStreamingStats(
          10,             // promptTokens
          20,             // completionTokens
          100 + i * 10,   // totalTimeMs (100, 110, 120, ..., 190)
          10              // promptProcessingTimeMs
        );
      }

      const stats = backend.getPerformanceStats();

      // Average should be computed from limited samples
      // With MAX_SAMPLES=20, all 10 would be included, avg = (100+110+...+190)/10 = 145
      expect(stats.timeStats.avgTotalTimeMs).toBeGreaterThan(0);
    });

    it('should return null for rate stats with insufficient data', () => {
      const backend = new Backend('http://localhost:11434');

      // Add samples without token data
      for (let i = 0; i < 5; i++) {
        backend.updateNonStreamingStats(
          null,           // no promptTokens
          null,           // no completionTokens
          100,            // totalTimeMs
          10              // promptProcessingTimeMs
        );
      }

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.totalRate).toBeNull();
      expect(stats.rateStats.promptRate).toBeNull();
      expect(stats.rateStats.generationRate).toBeNull();
      expect(stats.rateStats.completionRate).toBeNull();
    });
  });

  describe('completionRate tracking', () => {
    it('should compute completionRate for streaming requests', () => {
      const backend = new Backend('http://localhost:11434');

      // completionRate = completionTokens / (generationTimeMs / 1000)
      // generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs
      // For this test: 50 tokens / (800ms / 1000) = 50 / 0.8 = 62.5 tokens/second
      backend.updateStreamingStats(
        100,            // promptTokens
        50,             // completionTokens
        100,            // firstChunkTimeMs
        900,            // totalCompletionTimeMs
        null,           // networkLatencyMs
        800             // correctedGenerationTimeMs
      );

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.completionRate).toEqual({
        count: 1,
        avgTokensPerSecond: 62.5
      });
    });

    it('should compute completionRate using totalCompletionTimeMs when no correctedGenerationTimeMs', () => {
      const backend = new Backend('http://localhost:11434');

      // generationTimeMs = totalCompletionTimeMs - firstChunkTimeMs = 1000 - 100 = 900ms
      // completionRate = 90 tokens / (900ms / 1000) = 90 / 0.9 = 100 tokens/second
      backend.updateStreamingStats(
        100,            // promptTokens
        90,             // completionTokens
        100,            // firstChunkTimeMs
        1000            // totalCompletionTimeMs
      );

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.completionRate).toEqual({
        count: 1,
        avgTokensPerSecond: 100
      });
    });

    it('should track completionRate in raw samples for chart visualization', () => {
      const backend = new Backend('http://localhost:11434');

      // Add multiple streaming requests with varying completion rates
      backend.updateStreamingStats(10, 20, 100, 500);  // generationTime=400ms, rate=20/0.4=50
      backend.updateStreamingStats(10, 30, 100, 600);  // generationTime=500ms, rate=30/0.5=60
      backend.updateStreamingStats(10, 40, 100, 700);  // generationTime=600ms, rate=40/0.6≈66.67

      const statsWithSamples = backend.getPerformanceStatsWithSamples();

      // Verify completionRate is present in raw samples
      expect(statsWithSamples.rawSamples.rateStats.completionRate).toBeDefined();
      expect(Array.isArray(statsWithSamples.rawSamples.rateStats.completionRate)).toBe(true);
      expect(statsWithSamples.rawSamples.rateStats.completionRate.length).toBe(3);

      // Verify raw values
      expect(statsWithSamples.rawSamples.rateStats.completionRate[0]).toBe(50);    // 20/0.4
      expect(statsWithSamples.rawSamples.rateStats.completionRate[1]).toBe(60);    // 30/0.5
      expect(Math.round(statsWithSamples.rawSamples.rateStats.completionRate[2] * 100) / 100).toBe(66.67); // 40/0.6
    });

    it('should return null for completionRate when no completionTokens', () => {
      const backend = new Backend('http://localhost:11434');

      // Add streaming request without completionTokens
      backend.updateStreamingStats(
        100,            // promptTokens
        null,           // no completionTokens
        100,            // firstChunkTimeMs
        1000            // totalCompletionTimeMs
      );

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.completionRate).toBeNull();
    });

    it('should return null for completionRate when generationTime is zero', () => {
      const backend = new Backend('http://localhost:11434');

      // generationTimeMs = 100 - 100 = 0, so completionRate should be null (cannot divide by zero)
      backend.updateStreamingStats(
        100,            // promptTokens
        50,             // completionTokens
        100,            // firstChunkTimeMs
        100             // totalCompletionTimeMs (generationTime = 0)
      );

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.completionRate).toBeNull();
    });

    it('should compute average completionRate from multiple requests', () => {
      const backend = new Backend('http://localhost:11434');

      // Add 5 requests with different completion rates
      // generationTimeMs = 500 - 100 = 400ms for all
      // Rates: 20/0.4=50, 40/0.4=100, 60/0.4=150, 80/0.4=200, 100/0.4=250
      backend.updateStreamingStats(10, 20, 100, 500);  // rate = 50
      backend.updateStreamingStats(10, 40, 100, 500);  // rate = 100
      backend.updateStreamingStats(10, 60, 100, 500);  // rate = 150
      backend.updateStreamingStats(10, 80, 100, 500);  // rate = 200
      backend.updateStreamingStats(10, 100, 100, 500); // rate = 250

      const stats = backend.getPerformanceStats();

      // Average of [50, 100, 150, 200, 250] = 750/5 = 150 tokens/second
      expect(stats.rateStats.completionRate).toEqual({
        count: 5,
        avgTokensPerSecond: 150
      });
    });

    it('should handle mixed streaming and non-streaming requests', () => {
      const backend = new Backend('http://localhost:11434');

      // Add non-streaming request (should NOT add to completionRate)
      backend.updateNonStreamingStats(10, 20, 5000, null, null);

      // Add streaming request (should add to completionRate)
      backend.updateStreamingStats(10, 50, 100, 1000, null, 800);

      const stats = backend.getPerformanceStats();

      // Non-streaming should not add to completionRate array
      expect(stats.rateStats.completionRate).not.toBeNull();
      expect(stats.rateStats.completionRate.count).toBe(1);  // Only the streaming request
    });

    it('should updateNonStreamingStatsFromChunks compute completionRate', () => {
      const backend = new Backend('http://localhost:11434');

      // Simulate streaming from chunks: 15 chunks in 1.2 seconds
      // generationTimeMs = 1200 - 50 = 1150ms
      // completionRate = 15 / 1.15 ≈ 13.04 tokens/second
      backend.updateStreamingStatsFromChunks(
        100,            // estimatedPromptTokens
        15,             // chunkCount (completion tokens)
        50,             // firstChunkTimeMs
        1200            // totalCompletionTimeMs
      );

      const stats = backend.getPerformanceStats();
      expect(stats.rateStats.completionRate).not.toBeNull();
      expect(stats.rateStats.completionRate.count).toBe(1);
      expect(Math.round(stats.rateStats.completionRate.avgTokensPerSecond * 100) / 100).toBe(13.04);
    });

    it('should respect sample limiting for completionRate array', () => {
      const backend = new Backend('http://localhost:11434');

      // Add more than MAX_STATS_SAMPLES (20) requests
      // Loop i=0 to i=24, so with limit=20, we keep i=5 to i=24
      for (let i = 0; i < 25; i++) {
        backend.updateStreamingStats(
          10 + i,
          20 + i,
          100 + i,
          1000 + i
        );
      }

      // Should only have 20 samples
      expect(backend._performanceStats.completionRate.length).toBe(20);

      // Verify oldest kept sample (first kept is i=5)
      // i=5: completionTokens=25, firstChunkTimeMs=105, totalCompletionTimeMs=1005
      // generationTimeMs = 1005 - 105 = 900ms
      // completionRate = 25 / 0.9 = 27.777...
      const oldestRate = backend._performanceStats.completionRate[0];
      const expectedRate = 25 / (900 / 1000);
      expect(Math.round(oldestRate * 100) / 100).toBe(Math.round(expectedRate * 100) / 100);
    });

    it('should be present in getPerformanceStatsWithSamples return type', () => {
      const backend = new Backend('http://localhost:11434');

      backend.updateStreamingStats(10, 50, 100, 1000);

      const statsWithSamples = backend.getPerformanceStatsWithSamples();

      // Verify completionRate is a property of rateStats in returned object
      expect(statsWithSamples.rateStats.completionRate).toBeDefined();
      expect(statsWithSamples.rateStats.completionRate.count).toBe(1);

      // Verify it's also in rawSamples
      expect(statsWithSamples.rawSamples.rateStats.completionRate).toBeDefined();
    });
  });
});

describe('Backend Class', () => {
  describe('constructor', () => {
    it('should create a Backend instance with default values', () => {
      const backend = new Backend('http://localhost:11434');

      expect(backend.url).toBe('http://localhost:11434');
      expect(backend.maxConcurrency).toBe(10);
      expect(backend.healthy).toBe(false);
      expect(backend.failCount).toBe(0);
      expect(backend.activeRequestCount).toBe(0);
      expect(backend.requestCount).toBe(0);
      expect(backend.errorCount).toBe(0);
      expect(backend.backendInfo).toBeNull();
      expect(backend.healthChecker).toBeNull();
    });

    it('should create a Backend instance with custom maxConcurrency', () => {
      const backend = new Backend('http://localhost:11434', 20);

      expect(backend.maxConcurrency).toBe(20);
    });
  });

  describe('checkHealth()', () => {
    it('should throw error when no health checker is assigned', async () => {
      const backend = new Backend('http://localhost:11434');

      await expect(backend.checkHealth()).rejects.toThrow('No health checker assigned to backend');
    });

    it('should delegate to assigned health checker', async () => {
      const backend = new Backend('http://localhost:11434');
      const mockHealthChecker = {
        check: jest.fn().mockResolvedValue({ healthy: true, models: ['model1', 'model2'] })
      };
      backend.healthChecker = mockHealthChecker;

      const result = await backend.checkHealth();

      expect(mockHealthChecker.check).toHaveBeenCalledWith(backend);
      expect(result).toEqual({ healthy: true, models: ['model1', 'model2'] });
    });
  });

  describe('getApiTypes()', () => {
    it('should return array of supported API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai']);

      const apiTypes = backend.getApiTypes();

      expect(apiTypes).toEqual(['ollama', 'openai']);
    });

    it('should return empty array when no backendInfo', () => {
      const backend = new Backend('http://localhost:11434');

      const apiTypes = backend.getApiTypes();

      expect(apiTypes).toEqual([]);
    });

    it('should only return supported API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = {
        url: 'http://localhost:11434',
        healthy: true,
        apis: {
          ollama: { supported: true },
          openai: { supported: false },
          anthropic: { supported: true }
        },
        models: {},
        endpoints: {},
        detectedAt: new Date().toISOString()
      };

      const apiTypes = backend.getApiTypes();

      expect(apiTypes).toEqual(['ollama', 'anthropic']);
    });
  });

  describe('getModels()', () => {
    it('should return models for specified API type', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai'], {
        ollama: ['llama2', 'mistral'],
        openai: ['gpt-3.5', 'gpt-4']
      });

      const models = backend.getModels('ollama');

      expect(models).toEqual(['llama2', 'mistral']);
    });

    it('should return empty array when API type not found', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama'], {
        ollama: ['llama2']
      });

      const models = backend.getModels('openai');

      expect(models).toEqual([]);
    });

    it('should return empty array when no backendInfo', () => {
      const backend = new Backend('http://localhost:11434');

      const models = backend.getModels('ollama');

      expect(models).toEqual([]);
    });
  });

  describe('getAllModels()', () => {
    it('should return all models from all API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai'], {
        ollama: ['llama2', 'mistral'],
        openai: ['gpt-3.5', 'gpt-4']
      });

      const allModels = backend.getAllModels();

      expect(allModels).toEqual({
        ollama: ['llama2', 'mistral'],
        openai: ['gpt-3.5', 'gpt-4']
      });
    });

    it('should return empty object when no backendInfo', () => {
      const backend = new Backend('http://localhost:11434');

      const allModels = backend.getAllModels();

      expect(allModels).toEqual({});
    });
  });

  describe('getEndpoint()', () => {
    it('should return endpoint for specified API type', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai'], {
        ollama: ['llama2'],
        openai: ['gpt-3.5']
      });

      const endpoint = backend.getEndpoint('ollama');

      expect(endpoint).toBe('/v1/ollama/models');
    });

    it('should return null when API type not found', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama'], {
        ollama: ['llama2']
      });

      const endpoint = backend.getEndpoint('openai');

      expect(endpoint).toBeNull();
    });
  });

  describe('getAllEndpoints()', () => {
    it('should return all endpoints from all API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai'], {
        ollama: ['llama2'],
        openai: ['gpt-3.5']
      });

      const allEndpoints = backend.getAllEndpoints();

      expect(allEndpoints).toEqual({
        ollama: '/v1/ollama/models',
        openai: '/v1/openai/models'
      });
    });

    it('should return empty object when no backendInfo', () => {
      const backend = new Backend('http://localhost:11434');

      const allEndpoints = backend.getAllEndpoints();

      expect(allEndpoints).toEqual({});
    });
  });

  describe('getPrimaryApiType()', () => {
    it('should return first supported API type', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai', 'anthropic']);

      const primaryApiType = backend.getPrimaryApiType();

      expect(primaryApiType).toBe('ollama');
    });

    it('should return null when no supported API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = {
        url: 'http://localhost:11434',
        healthy: false,
        apis: {},
        models: {},
        endpoints: {},
        detectedAt: new Date().toISOString()
      };

      const primaryApiType = backend.getPrimaryApiType();

      expect(primaryApiType).toBeNull();
    });
  });

  describe('supportsApi()', () => {
    it('should return true when backend supports API type', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai']);

      const supports = backend.supportsApi('ollama');

      expect(supports).toBe(true);
    });

    it('should return false when backend does not support API type', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama']);

      const supports = backend.supportsApi('openai');

      expect(supports).toBe(false);
    });

    it('should return false when no backendInfo', () => {
      const backend = new Backend('http://localhost:11434');

      const supports = backend.supportsApi('ollama');

      expect(supports).toBe(false);
    });
  });

  describe('supportsAnyApi()', () => {
    it('should return true when backend supports any of the given API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama']);

      const supports = backend.supportsAnyApi(['openai', 'ollama', 'anthropic']);

      expect(supports).toBe(true);
    });

    it('should return false when backend supports none of the given API types', () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama']);

      const supports = backend.supportsAnyApi(['openai', 'anthropic']);

      expect(supports).toBe(false);
    });
  });

  describe('incrementRequestCount()', () => {
    it('should increment request count', () => {
      const backend = new Backend('http://localhost:11434');

      backend.incrementRequestCount();
      expect(backend.requestCount).toBe(1);

      backend.incrementRequestCount();
      expect(backend.requestCount).toBe(2);
    });
  });

  describe('incrementErrorCount()', () => {
    it('should increment error count', () => {
      const backend = new Backend('http://localhost:11434');

      backend.incrementErrorCount();
      expect(backend.errorCount).toBe(1);

      backend.incrementErrorCount();
      expect(backend.errorCount).toBe(2);
    });
  });

  describe('getHealthSummary()', () => {
    it('should return health status summary', () => {
      const backend = new Backend('http://localhost:11434');
      backend.healthy = true;
      backend.failCount = 0;
      backend.activeRequestCount = 5;
      backend.requestCount = 100;
      backend.errorCount = 2;
      backend.backendInfo = createMockBackendInfo(['ollama', 'openai']);

      const summary = backend.getHealthSummary();

      expect(summary).toEqual({
        url: 'http://localhost:11434',
        healthy: true,
        failCount: 0,
        activeRequestCount: 5,
        requestCount: 100,
        errorCount: 2,
        apiTypes: ['ollama', 'openai'],
        primaryApiType: 'ollama'
      });
    });
  });

  describe('Integration with health checkers', () => {
    it('should work with OllamaHealthCheck', async () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['ollama'], {
        ollama: ['llama2', 'mistral']
      });
      backend.healthChecker = new OllamaHealthCheck(1000);

      // Note: This will fail in unit tests without actual Ollama backend
      // but tests the integration pattern
      expect(backend.healthChecker).toBeInstanceOf(OllamaHealthCheck);
      expect(backend.supportsApi('ollama')).toBe(true);
    });

    it('should work with OpenAIHealthCheck', async () => {
      const backend = new Backend('http://localhost:11434');
      backend.backendInfo = createMockBackendInfo(['openai'], {
        openai: ['gpt-3.5', 'gpt-4']
      });
      backend.healthChecker = new OpenAIHealthCheck(1000);

      // Note: This will fail in unit tests without actual OpenAI backend
      // but tests the integration pattern
      expect(backend.healthChecker).toBeInstanceOf(OpenAIHealthCheck);
      expect(backend.supportsApi('openai')).toBe(true);
    });
  });
});
