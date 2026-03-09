const BackendInfo = require('../../backend-info');

describe('BackendInfo', () => {
  let detector;

  beforeEach(() => {
    detector = new BackendInfo(5000);
  });

  describe('extractModels', () => {
    it('should parse OpenAI /v1/models response correctly', () => {
      const mockBody = {
        data: [
          { id: 'gpt-3.5-turbo' },
          { id: 'gpt-4' }
        ]
      };

      const models = detector.extractModels(mockBody, 'data');

      expect(models).toEqual(['gpt-3.5-turbo', 'gpt-4']);
    });

    it('should parse Ollama /api/tags response correctly', () => {
      const mockBody = {
        models: [
          { name: 'llama2:7b' },
          { name: 'mistral:7b' }
        ]
      };

      const models = detector.extractModels(mockBody, 'models');

      expect(models).toEqual(['llama2:7b', 'mistral:7b']);
    });

    it('should handle string model entries', () => {
      const mockBody = {
        models: ['llama2:7b', 'mistral:7b']
      };

      const models = detector.extractModels(mockBody, 'models');

      expect(models).toEqual(['llama2:7b', 'mistral:7b']);
    });

    it('should handle empty models array', () => {
      const mockBody = { models: [] };

      const models = detector.extractModels(mockBody, 'models');

      expect(models).toEqual([]);
    });

    it('should handle missing jsonPath', () => {
      const mockBody = { unexpected: 'format' };

      const models = detector.extractModels(mockBody, 'models');

      expect(models).toEqual([]);
    });

    it('should handle null jsonPath', () => {
      const mockBody = { data: [{ id: 'test' }] };

      const models = detector.extractModels(mockBody, null);

      expect(models).toEqual([]);
    });
  });

  describe('getChatEndpoint', () => {
    it('should return correct chat endpoint for openai', () => {
      expect(detector.getChatEndpoint('openai')).toBe('/v1/chat/completions');
    });

    it('should return correct chat endpoint for anthropic', () => {
      expect(detector.getChatEndpoint('anthropic')).toBe('/v1/messages');
    });

    it('should return correct chat endpoint for google', () => {
      expect(detector.getChatEndpoint('google')).toBe('/v1beta/models/{model}:generateContent');
    });

    it('should return correct chat endpoint for ollama', () => {
      expect(detector.getChatEndpoint('ollama')).toBe('/api/generate');
    });

    it('should return null for unknown api type', () => {
      expect(detector.getChatEndpoint('unknown')).toBe(null);
    });
  });

  describe('probes', () => {
    it('should have openai model list probe', () => {
      const probe = detector.probes.find(p => p.apiType === 'openai' && p.hasModels);
      expect(probe).toBeDefined();
      expect(probe.endpoint).toBe('/v1/models');
      expect(probe.method).toBe('GET');
    });

    it('should have anthropic chat probe', () => {
      const probe = detector.probes.find(p => p.apiType === 'anthropic' && !p.hasModels);
      expect(probe).toBeDefined();
      expect(probe.endpoint).toBe('/v1/messages');
      expect(probe.method).toBe('POST');
    });

    it('should have google model list probe', () => {
      const probe = detector.probes.find(p => p.apiType === 'google');
      expect(probe).toBeDefined();
      expect(probe.endpoint).toBe('/v1beta/models');
    });

    it('should have ollama model list probe', () => {
      const probe = detector.probes.find(p => p.apiType === 'ollama');
      expect(probe).toBeDefined();
      expect(probe.endpoint).toBe('/api/tags');
    });
  });
});