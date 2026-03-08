const CapabilityDetector = require('../../capability-detector');

describe('CapabilityDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new CapabilityDetector(5000);
  });

  describe('parseResponse', () => {
    it('should parse Ollama /api/tags response correctly', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({
        models: [
          { name: 'llama2:7b' },
          { name: 'mistral:7b' }
        ]
      });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.healthy).toBe(true);
      expect(result.apiType).toBe('ollama');
      expect(result.models).toEqual(['llama2:7b', 'mistral:7b']);
      expect(result.statusCode).toBe(200);
    });

    it('should parse OpenAI /v1/models response correctly', () => {
      const mockRes = {
        req: { path: '/v1/models' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({
        data: [
          { id: 'gpt-3.5-turbo' },
          { id: 'gpt-4' }
        ]
      });
      const apiConfig = { type: 'openai', formatKey: 'data' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.healthy).toBe(true);
      expect(result.apiType).toBe('openai');
      expect(result.models).toEqual(['gpt-3.5-turbo', 'gpt-4']);
      expect(result.statusCode).toBe(200);
    });

    it('should handle string model entries', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({
        models: ['llama2:7b', 'mistral:7b']
      });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.models).toEqual(['llama2:7b', 'mistral:7b']);
    });

    it('should handle empty models array', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({ models: [] });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.models).toEqual([]);
      expect(result.healthy).toBe(true);
    });

    it('should handle unexpected response format gracefully', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({ unexpected: 'format' });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.healthy).toBe(true);
      expect(result.models).toEqual([]);
      expect(result.error).toBe('Unexpected response format');
    });

    it('should handle Ollama error response', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = JSON.stringify({
        error: 'model "nonexistent" not found'
      });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.error).toBe('Ollama error: model "nonexistent" not found');
      expect(result.shouldFallback).toBe(true);
      expect(result.apiType).toBe('ollama');
    });

    it('should handle malformed JSON', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 200
      };
      const mockBody = 'not json';
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Parse error');
      expect(result.apiType).toBe('ollama');
    });

    it('should handle HTTP error status codes', () => {
      const mockRes = {
        req: { path: '/api/tags' },
        statusCode: 500
      };
      const mockBody = JSON.stringify({ error: 'server error' });
      const apiConfig = { type: 'ollama', formatKey: 'models' };

      const result = detector.parseResponse(mockRes, mockBody, apiConfig);

      expect(result.healthy).toBe(false);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('shouldFallbackToOpenAI', () => {
    it('should recommend fallback for Ollama 404 errors', () => {
      const result = {
        apiType: 'ollama',
        statusCode: 404,
        error: undefined
      };

      expect(detector.shouldFallbackToOpenAI(result)).toBe(true);
    });

    it('should recommend fallback for Ollama error responses', () => {
      const result = {
        apiType: 'ollama',
        statusCode: 200,
        error: 'model not found'
      };

      expect(detector.shouldFallbackToOpenAI(result)).toBe(true);
    });

    it('should not fallback for connection errors', () => {
      const result = {
        apiType: 'ollama',
        statusCode: 200,
        error: 'Connection refused'
      };

      expect(detector.shouldFallbackToOpenAI(result)).toBe(false);
    });

    it('should not fallback for non-Ollama APIs', () => {
      const result = {
        apiType: 'openai',
        statusCode: 404,
        error: 'not found'
      };

      expect(detector.shouldFallbackToOpenAI(result)).toBe(false);
    });
  });
});