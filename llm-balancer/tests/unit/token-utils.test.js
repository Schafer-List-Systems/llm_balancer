/**
 * Unit tests for token counting utilities
 */

const { countTokens, countTokensBatch, formatTokenCount } = require('../../utils/token-utils');

describe('Token Utils', () => {
  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(countTokens(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(countTokens(undefined)).toBe(0);
    });

    it('should return 0 for non-string types', () => {
      expect(countTokens(123)).toBe(0);
      expect(countTokens({})).toBe(0);
      expect(countTokens([])).toBe(0);
    });

    it('should count tokens in a simple string', () => {
      const tokens = countTokens('Hello world');
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle long text consistently', () => {
      const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const tokens = countTokens(longText);
      expect(tokens).toBeGreaterThan(0);

      // Running the same text should produce the same result
      const tokens2 = countTokens(longText);
      expect(tokens).toBe(tokens2);
    });

    it('should handle different models', () => {
      const text = 'Hello world test';

      const gpt4 = countTokens(text, 'gpt-4');
      const davinci = countTokens(text, 'text-davinci-003');

      // Different models may produce different counts
      expect(typeof gpt4).toBe('number');
      expect(typeof davinci).toBe('number');
    });

    it('should count tokens in a realistic prompt', () => {
      const prompt = `You are a helpful assistant. Your task is to answer the following question:

What is the capital of France?

Please provide a concise answer.`;

      const tokens = countTokens(prompt);

      // Verify it returns a reasonable count
      expect(tokens).toBeGreaterThan(20);
      expect(tokens).toBeLessThan(100);
    });

    it('should handle a 15k token threshold test case', () => {
      // Generate text that should be approximately 15k tokens
      // Each sentence is about 10 tokens, so we need ~1500 repetitions
      const repeatedContent = 'The quick brown fox jumps over the lazy dog. '.repeat(1500);
      const tokens = countTokens(repeatedContent);

      expect(tokens).toBeGreaterThan(10000);
      expect(tokens).toBeLessThan(20000);
    });
  });

  describe('countTokensBatch', () => {
    it('should return 0 for empty array', () => {
      const result = countTokensBatch([]);
      expect(result.total).toBe(0);
      expect(result.counts).toEqual([]);
    });

    it('should return 0 for null input', () => {
      const result = countTokensBatch(null);
      expect(result.total).toBe(0);
      expect(result.counts).toEqual([]);
    });

    it('should count tokens for multiple texts', () => {
      const texts = ['Hello world', 'Test message', 'Another text'];
      const result = countTokensBatch(texts);

      expect(result.counts).toHaveLength(3);
      expect(result.counts[0]).toBeGreaterThan(0);
      expect(result.counts[1]).toBeGreaterThan(0);
      expect(result.counts[2]).toBeGreaterThan(0);

      // Total should be sum of individual counts
      expect(result.total).toBe(result.counts.reduce((sum, c) => sum + c, 0));
    });

    it('should handle mixed length texts', () => {
      const texts = [
        'Short',
        'This is a medium length text with more words',
        'A'.repeat(10000)
      ];
      const result = countTokensBatch(texts);

      expect(result.counts).toHaveLength(3);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('formatTokenCount', () => {
    it('should format small numbers without suffix', () => {
      expect(formatTokenCount(1234)).toBe('1234');
      expect(formatTokenCount(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatTokenCount(1000)).toBe('1000');
      expect(formatTokenCount(10000)).toBe('10.0K');
      expect(formatTokenCount(15000)).toBe('15.0K');
      expect(formatTokenCount(25000)).toBe('25.0K');
    });

    it('should format with one decimal place', () => {
      expect(formatTokenCount(12345)).toBe('12.3K');
      expect(formatTokenCount(12500)).toBe('12.5K');
      expect(formatTokenCount(12678)).toBe('12.7K');
    });
  });
});
