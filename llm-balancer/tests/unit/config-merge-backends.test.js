/**
 * Regression test for: config merge dropping fields from backends beyond the first one.
 *
 * The deepMergeWithDefaults function merges backend arrays element-by-element with defaults.
 * Since the default only has one backend entry, indices 1+ must fall back to their config.json values
 * rather than producing empty objects.
 */

const fs = require('fs');
const path = require('path');

// Clear any cached config module to ensure fresh load
jest.resetModules();

// Mock fs with a config.json that has multiple backends with different fields
const mockConfigContent = JSON.stringify({
  port: 3001,
  maxRetries: 3,
  maxPayloadSize: 104857600,
  maxStatsSamples: 20,
  backends: [
    { url: 'http://10.0.0.1:11434', name: 'Backend 1', priority: 10, maxConcurrency: 5 },
    { url: 'http://10.0.0.2:11434', name: 'Backend 2', priority: 5, maxConcurrency: 3 },
    { url: 'http://10.0.0.3:11434', name: 'Backend 3', priority: 1, maxConcurrency: 10, maxInputTokens: 32000 }
  ],
  healthCheck: { interval: 120000, timeout: 5000 },
  queue: { timeout: 900000 },
  request: { timeout: 300000 },
  debug: { enabled: false, requestHistorySize: 100 },
  prompt: { cache: { maxSize: 5, similarityThreshold: 0.7, minHitThreshold: 15000 } }
}, null, 2);

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => mockConfigContent)
}));

const { loadConfig } = require('../../config');

describe('Config merge preserves all backend fields', () => {
  it('should not produce empty objects for backends beyond the default entry', () => {
    const config = loadConfig();

    // All three backends should be fully populated — not empty objects
    expect(config.backends).toHaveLength(3);

    // Backend 1: should match config.json values
    expect(config.backends[0]).toEqual({
      url: 'http://10.0.0.1:11434',
      name: 'Backend 1',
      priority: 10,
      maxConcurrency: 5,
      active: true
    });

    // Backend 2: same issue — fields must be preserved
    expect(config.backends[1]).toEqual({
      url: 'http://10.0.0.2:11434',
      name: 'Backend 2',
      priority: 5,
      maxConcurrency: 3,
      active: true
    });

    // Backend 3: fields including maxInputTokens must be preserved
    expect(config.backends[2]).toEqual({
      url: 'http://10.0.0.3:11434',
      name: 'Backend 3',
      priority: 1,
      maxConcurrency: 10,
      maxInputTokens: 32000,
      active: true
    });
  });

  it('should have active field on all backends', () => {
    const config = loadConfig();

    expect(config.backends.every(b => b.active === true)).toBe(true);
  });
});
