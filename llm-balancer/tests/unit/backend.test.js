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
