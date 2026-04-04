/**
 * Test for maxInputTokens configuration enforcement bug
 *
 * Bug: getNextBackendForModelWithMatch() completely ignores maxInputTokens
 * configuration, allowing backends to be selected even when their configured
 * limit is lower than the prompt size.
 *
 * REAL-WORLD SCENARIO:
 * AIbox backend configured with maxInputTokens=20000 receives 90000 token prompts.
 * The buggy code forwards these oversized prompts to the backend anyway.
 */

const Backend = require('../../backends/Backend');
const { BackendSelector } = require('../../backend-selector');
const Balancer = require('../../balancer');

describe('maxInputTokens Enforcement Bug', () => {
  describe('Bug: getNextBackendForModelWithMatch ignores maxInputTokens', () => {
    test('FAILS: selects backend even when maxInputTokens is lower than required prompt', () => {
      // REAL-WORLD: AIbox has maxInputTokens=20000 in config
      // but the system is forwarding 90000 token prompts to it

      const backend = new Backend('http://aibox:1234', 1);
      backend.healthy = true;
      backend.maxInputTokens = 20000; // Config: max 20k tokens
      backend.priority = 20;

      backend.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['qwen'] },
        endpoints: { openai: '/v1/models' },
        detectedAt: new Date().toISOString()
      };

      const balancer = new Balancer([backend]);

      // The BUG: getNextBackendForModelWithMatch does NOT accept or check promptTokens
      // It returns the backend regardless of maxInputTokens
      const result = balancer.getNextBackendForModelWithMatch(['qwen']);

      // FAILS: The bug causes this backend to be selected
      // The backend has maxInputTokens=20000 but the code doesn't check it
      expect(result.backend).toBeNull();
      expect(result.actualModel).toBeNull();
    });

    test('FAILS: selects backend when ALL backends have insufficient maxInputTokens', () => {
      const backend1 = new Backend('http://backend1:11434', 1);
      backend1.healthy = true;
      backend1.maxInputTokens = 1000;
      backend1.priority = 20;

      backend1.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['qwen'] },
        endpoints: { openai: '/v1/models' },
        detectedAt: new Date().toISOString()
      };

      const backend2 = new Backend('http://backend2:11434', 1);
      backend2.healthy = true;
      backend2.maxInputTokens = 1500;
      backend2.priority = 10;

      backend2.backendInfo = {
        apis: { openai: { supported: true } },
        models: { openai: ['qwen'] },
        endpoints: { openai: '/v1/models' },
        detectedAt: new Date().toISOString()
      };

      const balancer = new Balancer([backend1, backend2]);

      // The BUG: getNextBackendForModelWithMatch doesn't check maxInputTokens
      // It returns backend1 (higher priority) even though 1000 < 2000 and 1500 < 2000
      const result = balancer.getNextBackendForModelWithMatch(['qwen']);

      // FAILS: The bug causes backend1 to be selected
      // Correct: should return null because no backend can handle the required tokens
      expect(result.backend).toBeNull();
      expect(result.actualModel).toBeNull();
    });
  });

  describe('BackendSelector._filterByMaxInputTokens - correct filter', () => {
    test('filters out backends with insufficient maxInputTokens', () => {
      const selector = new BackendSelector();

      const backend1 = new Backend('http://backend1:11434', 1);
      backend1.healthy = true;
      backend1.maxInputTokens = 1000;

      const backend2 = new Backend('http://backend2:11434', 1);
      backend2.healthy = true;
      backend2.maxInputTokens = 10000;

      const filtered = selector._filterByMaxInputTokens([backend1, backend2], 2000);

      expect(filtered.length).toBe(1);
      expect(filtered[0].url).toBe('http://backend2:11434');
    });

    test('filters out ALL backends when prompt exceeds ALL limits', () => {
      const selector = new BackendSelector();

      const backend1 = new Backend('http://backend1:11434', 1);
      backend1.healthy = true;
      backend1.maxInputTokens = 1000;

      const backend2 = new Backend('http://backend2:11434', 1);
      backend2.healthy = true;
      backend2.maxInputTokens = 1500;

      const filtered = selector._filterByMaxInputTokens([backend1, backend2], 2000);

      expect(filtered.length).toBe(0);
    });
  });
});
