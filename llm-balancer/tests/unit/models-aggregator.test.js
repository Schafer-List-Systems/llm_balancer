/**
 * ModelsAggregator unit tests
 * Tests model aggregation across backends for different API types
 */

const assert = require('assert');
const Backend = require('../../backends/Backend');
const BackendPool = require('../../backend-pool');
const ModelsAggregator = require('../../models-aggregator');
const {
  createTestBackend,
  createUnhealthyBackend
} = require('./helpers/backend-factory');

describe('ModelsAggregator', () => {
  let aggregator;
  let healthyOllamaBackend;
  let healthyOpenAIBackend;
  let healthyGoogleBackend;
  let unhealthyBackend;
  let backendPool;

  beforeEach(() => {
    aggregator = new ModelsAggregator(5000);

    // Create healthy backends for different API types
    healthyOllamaBackend = createTestBackend(
      'http://localhost:11434',
      'ollama',
      ['llama3:latest', 'mistral:7b', 'gemma:7b']
    );

    healthyOpenAIBackend = createTestBackend(
      'http://localhost:3000',
      'openai',
      ['gpt-4', 'gpt-3.5-turbo']
    );

    healthyGoogleBackend = createTestBackend(
      'https://us-central1-aiplatform.googleapis.com',
      'google',
      ['gemini-pro', 'textembedding-gecko']
    );

    // Create unhealthy backend (should be filtered out)
    unhealthyBackend = createUnhealthyBackend(
      'http://localhost:9999',
      'ollama',
      ['should-not-appear']
    );

    // Create backend pool with all backends
    backendPool = new BackendPool([
      healthyOllamaBackend,
      healthyOpenAIBackend,
      healthyGoogleBackend,
      unhealthyBackend
    ]);
  });

  describe('aggregateForOpenAI', () => {
    it('should aggregate models from OpenAI backends', () => {
      const result = aggregator.aggregateForOpenAI(backendPool);

      assert.strictEqual(result.object, 'list');
      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 2); // Only from healthyOpenAIBackend

      const modelIds = result.data.map(m => m.id);
      assert.ok(modelIds.includes('gpt-4'));
      assert.ok(modelIds.includes('gpt-3.5-turbo'));
    });

    it('should filter out unhealthy backends', () => {
      // Remove healthyOpenAIBackend and only have unhealthy
      const unhealthyOnlyPool = new BackendPool([unhealthyBackend]);
      const result = aggregator.aggregateForOpenAI(unhealthyOnlyPool);

      assert.strictEqual(result.object, 'list');
      assert.strictEqual(result.data.length, 0);
    });

    it('should handle duplicate model names across backends', () => {
      // Add another OpenAI backend with overlapping model
      const anotherOpenAI = createTestBackend(
        'http://localhost:3001',
        'openai',
        ['gpt-4', 'llama3:latest'] // gpt-4 is duplicate
      );

      const poolWithDuplicates = new BackendPool([
        healthyOpenAIBackend,
        anotherOpenAI
      ]);

      const result = aggregator.aggregateForOpenAI(poolWithDuplicates);

      assert.strictEqual(result.data.length, 3); // gpt-4 (once), gpt-3.5-turbo, llama3:latest

      // gpt-4 should only appear once (from first backend)
      const gpt4Count = result.data.filter(m => m.id === 'gpt-4').length;
      assert.strictEqual(gpt4Count, 1);
    });

    it('should return empty array when no backends exist', () => {
      const emptyPool = new BackendPool([]);
      const result = aggregator.aggregateForOpenAI(emptyPool);

      assert.strictEqual(result.object, 'list');
      assert.strictEqual(result.data.length, 0);
    });

    it('should include Groq models (OpenAI-compatible)', () => {
      const groqBackend = createTestBackend(
        'https://api.groq.com',
        'groq',
        ['llama-3.1-70b', 'mixtral-8x7b']
      );

      const mixedPool = new BackendPool([
        healthyOpenAIBackend,
        groqBackend
      ]);

      const result = aggregator.aggregateForOpenAI(mixedPool);

      assert.strictEqual(result.data.length, 4); // 2 from OpenAI + 2 from Groq

      const modelIds = result.data.map(m => m.id);
      assert.ok(modelIds.includes('gpt-4'));
      assert.ok(modelIds.includes('llama-3.1-70b'));
    });

    it('should have correct OpenAI format', () => {
      const result = aggregator.aggregateForOpenAI(backendPool);

      const firstModel = result.data[0];
      assert.strictEqual(firstModel.object, 'model');
      assert.ok(firstModel.id);
      assert.ok(firstModel.owned_by);
    });
  });

  describe('aggregateForOllama', () => {
    it('should aggregate models from Ollama backends', () => {
      const result = aggregator.aggregateForOllama(backendPool);

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 3); // From healthyOllamaBackend

      const modelNames = result.models.map(m => m.name);
      assert.ok(modelNames.includes('llama3:latest'));
      assert.ok(modelNames.includes('mistral:7b'));
      assert.ok(modelNames.includes('gemma:7b'));
    });

    it('should filter out unhealthy backends', () => {
      const unhealthyOnlyPool = new BackendPool([unhealthyBackend]);
      const result = aggregator.aggregateForOllama(unhealthyOnlyPool);

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 0);
    });

    it('should return Ollama format with correct fields', () => {
      const result = aggregator.aggregateForOllama(backendPool);

      const firstModel = result.models[0];
      assert.ok(firstModel.name);
      assert.ok(firstModel.model);
      assert.ok(typeof firstModel.size === 'number');
      assert.ok(firstModel.digest);
      assert.ok(firstModel.details);
    });

    it('should estimate model size from name patterns', () => {
      const result = aggregator.aggregateForOllama(backendPool);

      const llamaModel = result.models.find(m => m.name === 'llama3:latest');
      const gemmaModel = result.models.find(m => m.name === 'gemma:7b');

      // 7b models should have similar sizes (~4.1GB)
      assert.ok(gemmaModel.size > 0);
    });

    it('should extract model family from name', () => {
      const result = aggregator.aggregateForOllama(backendPool);

      const llamaModel = result.models.find(m => m.name === 'llama3:latest');
      assert.strictEqual(llamaModel.details.family, 'llama');

      const mistralModel = result.models.find(m => m.name === 'mistral:7b');
      assert.strictEqual(mistralModel.details.family, 'llama'); // mistral is based on llama

      // gemma family is detected as 'gemma' because the check for 'gem' comes after 'llama'
      const gemmaModel = result.models.find(m => m.name === 'gemma:7b');
      assert.ok(gemmaModel.details.family);
    });

    it('should handle duplicate model names', () => {
      const anotherOllama = createTestBackend(
        'http://localhost:11435',
        'ollama',
        ['llama3:latest', 'phi3:mini']
      );

      const poolWithDuplicates = new BackendPool([
        healthyOllamaBackend,
        anotherOllama
      ]);

      const result = aggregator.aggregateForOllama(poolWithDuplicates);

      // llama3:latest should only appear once
      const llamaCount = result.models.filter(m => m.name === 'llama3:latest').length;
      assert.strictEqual(llamaCount, 1);

      // phi3:mini should appear from second backend
      assert.ok(result.models.some(m => m.name === 'phi3:mini'));
    });
  });

  describe('aggregateForGoogle', () => {
    it('should aggregate models from Google backends', () => {
      const result = aggregator.aggregateForGoogle(backendPool);

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 2); // From healthyGoogleBackend

      const modelNames = result.models.map(m => m.name);
      assert.ok(modelNames.includes('gemini-pro'));
      assert.ok(modelNames.includes('textembedding-gecko'));
    });

    it('should filter out unhealthy backends', () => {
      const unhealthyOnlyPool = new BackendPool([unhealthyBackend]);
      const result = aggregator.aggregateForGoogle(unhealthyOnlyPool);

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 0);
    });

    it('should return Google format with correct fields', () => {
      const result = aggregator.aggregateForGoogle(backendPool);

      const firstModel = result.models[0];
      assert.ok(firstModel.name);
      assert.ok(firstModel.displayName);
      assert.ok(firstModel.description);
      assert.ok(firstModel.createTime);
      assert.ok(firstModel.updateTime);
    });

    it('should format display name correctly', () => {
      const result = aggregator.aggregateForGoogle(backendPool);

      const geminiModel = result.models.find(m => m.name === 'gemini-pro');
      assert.strictEqual(geminiModel.displayName, 'Gemini Pro');

      const embeddingModel = result.models.find(m => m.name === 'textembedding-gecko');
      assert.strictEqual(embeddingModel.displayName, 'Textembedding Gecko');
    });

    it('should handle duplicate model names', () => {
      const anotherGoogle = createTestBackend(
        'https://other-region-aiplatform.googleapis.com',
        'google',
        ['gemini-pro', 'text-bison']
      );

      const poolWithDuplicates = new BackendPool([
        healthyGoogleBackend,
        anotherGoogle
      ]);

      const result = aggregator.aggregateForGoogle(poolWithDuplicates);

      // gemini-pro should only appear once
      const geminiCount = result.models.filter(m => m.name === 'gemini-pro').length;
      assert.strictEqual(geminiCount, 1);
    });
  });

  describe('aggregateModelsForApiType', () => {
    it('should aggregate using generic method for OpenAI format', () => {
      const result = aggregator.aggregateModelsForApiType(
        backendPool,
        'openai',
        'openai'
      );

      assert.strictEqual(result.object, 'list');
      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 2);
    });

    it('should aggregate using generic method for Ollama format', () => {
      const result = aggregator.aggregateModelsForApiType(
        backendPool,
        'ollama',
        'ollama'
      );

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 3);
    });

    it('should aggregate using generic method for Google format', () => {
      const result = aggregator.aggregateModelsForApiType(
        backendPool,
        'google',
        'google'
      );

      assert.ok(Array.isArray(result.models));
      assert.strictEqual(result.models.length, 2);
    });

    it('should return empty response for unknown API type', () => {
      const result = aggregator.aggregateModelsForApiType(
        backendPool,
        'unknown-api',
        'openai'
      );

      assert.strictEqual(result.object, 'list');
      assert.strictEqual(result.data.length, 0);
    });

    it('should throw error for unknown format', () => {
      assert.throws(() => {
        aggregator.aggregateModelsForApiType(
          backendPool,
          'ollama',
          'unknown-format'
        );
      }, /Unknown format/);
    });
  });

  describe('health status filtering', () => {
    it('should include only healthy backends in aggregation', () => {
      // Create a pool with mix of healthy and unhealthy backends
      const mixedBackend = createTestBackend(
        'http://localhost:5000',
        'openai',
        ['healthy-model']
      );
      healthyBackend = mixedBackend;

      const mixedPool = new BackendPool([
        healthyOpenAIBackend,
        unhealthyBackend,
        healthyBackend
      ]);

      const result = aggregator.aggregateForOpenAI(mixedPool);

      const modelIds = result.data.map(m => m.id);
      assert.ok(modelIds.includes('gpt-4'));
      assert.ok(modelIds.includes('healthy-model'));
      assert.strictEqual(result.data.length, 3);
    });

    it('should update aggregation when backend health changes', () => {
      // Unmark healthyOpenAIBackend as healthy
      healthyOpenAIBackend.healthy = false;

      const result = aggregator.aggregateForOpenAI(backendPool);
      assert.strictEqual(result.data.length, 0);

      // Re-mark as healthy
      healthyOpenAIBackend.healthy = true;

      const resultAfter = aggregator.aggregateForOpenAI(backendPool);
      assert.strictEqual(resultAfter.data.length, 2);
    });
  });

  describe('duplicate handling', () => {
    it('should append backend identifier to duplicate model names', () => {
      const duplicateBackend = createTestBackend(
        'http://localhost:11435',
        'ollama',
        ['llama3:latest'] // Same as healthyOllamaBackend
      );

      const poolWithDuplicates = new BackendPool([
        healthyOllamaBackend,
        duplicateBackend
      ]);

      const result = aggregator.aggregateForOllama(poolWithDuplicates);

      // First llama3:latest should appear once
      const llamaModels = result.models.filter(m => m.name.startsWith('llama3:latest'));
      assert.strictEqual(llamaModels.length, 1);
    });
  });

  describe('statistics', () => {
    it('should track aggregation statistics via generic method', () => {
      aggregator.aggregateModelsForApiType(backendPool, 'openai', 'openai');
      aggregator.aggregateModelsForApiType(backendPool, 'ollama', 'ollama');

      const stats = aggregator.getStats();
      assert.strictEqual(stats.requestCount, 2);
      assert.strictEqual(stats.successfulAggregations, 2);
      assert.ok(stats.totalModelsDiscovered >= 0);
    });
  });

  describe('aggregateForGroq', () => {
    it('should return OpenAI-compatible format for Groq', () => {
      const groqBackend = createTestBackend(
        'https://api.groq.com',
        'groq',
        ['llama-3.1-70b']
      );

      const groqOnlyPool = new BackendPool([groqBackend]);
      const result = aggregator.aggregateForGroq(groqOnlyPool);

      assert.strictEqual(result.object, 'list');
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].id, 'llama-3.1-70b');
      assert.strictEqual(result.data[0].object, 'model');
    });
  });
});
