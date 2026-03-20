/**
 * Tests for configuration module
 * Tests loadConfig(), writeConfig(), deepMergeWithDefaults(), and configuration merging logic
 */

const fs = require('fs');
const path = require('path');

// Mock fs module before importing config
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  renameSync: jest.fn()
}));

const { loadConfig, writeConfig } = require('../../config');

describe('writeConfig()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when config is valid', () => {
    it('should write configuration to file and return success', () => {
      const mockConfig = {
        port: 3001,
        version: '0.0.1',
        maxRetries: 3,
        backends: [
          { url: 'http://localhost:11434', name: 'Test', priority: 1, maxConcurrency: 10 }
        ]
      };

      fs.writeFileSync.mockReturnValue(undefined);

      const result = writeConfig(mockConfig);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration saved successfully');
      expect(result.error).toBeUndefined();
    });

    it('should write JSON with 2-space indentation', () => {
      const mockConfig = { port: 3001, version: '0.0.1' };

      fs.writeFileSync.mockReturnValue(undefined);
      writeConfig(mockConfig);

      const calledWith = fs.writeFileSync.mock.calls[0][1];
      expect(calledWith).toContain('  "port": 3001');
      expect(calledWith).toContain('  "version": "0.0.1"');
    });
  });

  describe('when config is invalid', () => {
    it('should return failure when config is null', () => {
      const result = writeConfig(null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid configuration object');
    });

    it('should return failure when config is undefined', () => {
      const result = writeConfig(undefined);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid configuration object');
    });

    it('should return failure when config is not an object', () => {
      const result = writeConfig('invalid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid configuration object');
    });

    it('should return failure when config is an array', () => {
      const result = writeConfig([]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid configuration object');
    });

    it('should return failure when fs.writeFileSync throws an error', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const result = writeConfig({ port: 3001 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });
  });
});

describe('loadConfig() integration', () => {
  beforeEach(() => {
    // Clear module cache to ensure fresh load
    jest.resetModules();
  });

  it('should return a config object with all required fields', () => {
    const config = loadConfig();

    expect(config).toBeDefined();
    expect(typeof config).toBe('object');

    // Check required top-level fields
    expect(config).toHaveProperty('port');
    expect(config).toHaveProperty('version');
    expect(config).toHaveProperty('maxRetries');
    expect(config).toHaveProperty('maxPayloadSize');
    expect(config).toHaveProperty('maxStatsSamples');
    expect(config).toHaveProperty('backends');
    expect(config).toHaveProperty('healthCheck');
    expect(config).toHaveProperty('queue');
    expect(config).toHaveProperty('request');
    expect(config).toHaveProperty('debug');
    expect(config).toHaveProperty('prompt');
  });

  it('should have numeric port value', () => {
    const config = loadConfig();

    expect(typeof config.port).toBe('number');
    expect(config.port).toBeGreaterThan(0);
  });

  it('should have string version value', () => {
    const config = loadConfig();

    expect(typeof config.version).toBe('string');
  });

  it('should have array of backends', () => {
    const config = loadConfig();

    expect(Array.isArray(config.backends)).toBe(true);
    expect(config.backends.length).toBeGreaterThan(0);
  });

  it('should have backend objects with required fields', () => {
    const config = loadConfig();

    const backend = config.backends[0];
    expect(backend).toHaveProperty('url');
    expect(backend).toHaveProperty('name');
    expect(backend).toHaveProperty('priority');
    expect(backend).toHaveProperty('maxConcurrency');
  });

  it('should have healthCheck object with required fields', () => {
    const config = loadConfig();

    expect(config.healthCheck).toHaveProperty('interval');
    expect(config.healthCheck).toHaveProperty('timeout');
    expect(typeof config.healthCheck.interval).toBe('number');
  });

  it('should have queue object with required fields', () => {
    const config = loadConfig();

    expect(config.queue).toHaveProperty('timeout');
    expect(typeof config.queue.timeout).toBe('number');
  });

  it('should have request object with required fields', () => {
    const config = loadConfig();

    expect(config.request).toHaveProperty('timeout');
  });

  it('should have debug object with required fields', () => {
    const config = loadConfig();

    expect(config.debug).toHaveProperty('enabled');
    expect(config.debug).toHaveProperty('requestHistorySize');
  });

  it('should have prompt.cache object with required fields', () => {
    const config = loadConfig();

    expect(config.prompt).toHaveProperty('cache');
    expect(config.prompt.cache).toHaveProperty('maxSize');
    expect(config.prompt.cache).toHaveProperty('similarityThreshold');
    expect(config.prompt.cache).toHaveProperty('minHitThreshold');
  });
});
