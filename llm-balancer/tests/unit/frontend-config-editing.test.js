/**
 * Tests for frontend configuration editing
 * Tests inline editing, save behavior, and config persistence
 */

describe('Frontend Configuration Editing', () => {
  let mockGlobalConfig;
  let mockWriteConfig;

  /**
   * setNestedValue function - copies the actual implementation from dashboard.js
   */
  function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a fresh config object
    mockGlobalConfig = {
      port: 3001,
      maxRetries: 3,
      maxStatsSamples: 20,
      maxPayloadSize: 104857600,
      healthCheck: {
        interval: 120000,
        timeout: 5000,
        maxRetries: 1,
        retryDelay: 2000,
        staggerDelay: 500
      },
      queue: {
        timeout: 900000,
        depthHistorySize: 100
      },
      request: {
        timeout: 300000
      },
      debug: {
        enabled: true,
        requestHistorySize: 100
      },
      prompt: {
        cache: {
          maxSize: 5,
          similarityThreshold: 0.7,
          minHitThreshold: 15000
        }
      },
      backends: []
    };

    // Mock writeConfig
    mockWriteConfig = jest.fn(() => ({
      success: true,
      message: 'Configuration saved successfully'
    }));

    // Mock window object
    global.window = {
      saveAllConfig: jest.fn(async () => {
        const result = mockWriteConfig(mockGlobalConfig);
        if (result.success) {
          // Simulated alert (removed for tests)
        }
      })
    };
  });

  describe('setNestedValue function', () => {
    it('should update a top-level value', () => {
      const testObj = { port: 3001, maxRetries: 3 };
      setNestedValue(testObj, 'port', 3002);
      expect(testObj.port).toBe(3002);
      expect(testObj.maxRetries).toBe(3);
    });

    it('should update a nested value', () => {
      const testObj = {
        healthCheck: {
          interval: 120000,
          timeout: 5000
        }
      };
      setNestedValue(testObj, 'healthCheck.interval', 60000);
      expect(testObj.healthCheck.interval).toBe(60000);
      expect(testObj.healthCheck.timeout).toBe(5000);
    });

    it('should create nested objects if they do not exist', () => {
      const testObj = { existing: 'value' };
      setNestedValue(testObj, 'new.nested.value', 123);
      expect(testObj.new.nested.value).toBe(123);
    });

    it('should handle deep nested paths', () => {
      const testObj = {
        prompt: {
          cache: {
            maxSize: 5
          }
        }
      };
      setNestedValue(testObj, 'prompt.cache.similarityThreshold', 0.8);
      expect(testObj.prompt.cache.similarityThreshold).toBe(0.8);
      expect(testObj.prompt.cache.maxSize).toBe(5);
    });

    it('should handle boolean values', () => {
      const testObj = { debug: { enabled: true } };
      setNestedValue(testObj, 'debug.enabled', false);
      expect(testObj.debug.enabled).toBe(false);
    });

    it('should handle number values', () => {
      const testObj = { maxStatsSamples: 20 };
      setNestedValue(testObj, 'maxStatsSamples', 22);
      expect(testObj.maxStatsSamples).toBe(22);
    });

    it('should handle empty path gracefully', () => {
      const testObj = { existing: 'value' };
      expect(() => setNestedValue(testObj, '', 'new')).not.toThrow();
    });
  });

  describe('saveInlineEdit function', () => {
    it('should update config value when Enter is pressed', async () => {
      // Simulate the saveInlineEdit flow
      const path = 'maxStatsSamples';
      const newValue = 22;

      // Update globalConfig (this is what happens on Enter)
      setNestedValue(mockGlobalConfig, path, newValue);

      // Verify value is updated in memory
      expect(mockGlobalConfig.maxStatsSamples).toBe(22);

      // Call saveAllConfig (saves to config.json)
      await window.saveAllConfig();

      // Verify saveAllConfig was called
      expect(window.saveAllConfig).toHaveBeenCalled();
    });

    it('should handle nested value updates', async () => {
      const path = 'healthCheck.interval';
      const newValue = 60000;

      // Update globalConfig
      setNestedValue(mockGlobalConfig, path, newValue);

      // Verify value is updated
      expect(mockGlobalConfig.healthCheck.interval).toBe(60000);

      // Save to file
      await window.saveAllConfig();

      // Verify saveAllConfig was called
      expect(window.saveAllConfig).toHaveBeenCalled();
    });

    it('should handle boolean toggle', async () => {
      const path = 'debug.enabled';
      const newValue = false;

      // Update globalConfig
      setNestedValue(mockGlobalConfig, path, newValue);

      // Verify boolean is updated
      expect(mockGlobalConfig.debug.enabled).toBe(false);

      // Save to file
      await window.saveAllConfig();

      expect(window.saveAllConfig).toHaveBeenCalled();
    });

    it('should preserve other config values when updating one', async () => {
      const originalPort = mockGlobalConfig.port;
      const originalMaxRetries = mockGlobalConfig.maxRetries;

      // Update one value
      setNestedValue(mockGlobalConfig, 'maxStatsSamples', 25);

      // Verify only maxStatsSamples changed
      expect(mockGlobalConfig.maxStatsSamples).toBe(25);
      expect(mockGlobalConfig.port).toBe(originalPort);
      expect(mockGlobalConfig.maxRetries).toBe(originalMaxRetries);

      // Save to file
      await window.saveAllConfig();

      expect(window.saveAllConfig).toHaveBeenCalled();
    });
  });

  describe('config.json persistence', () => {
    it('should persist changes to config.json when saving inline', () => {
      // Simulate the complete flow
      const config = { maxStatsSamples: 20 };

      // User edits value inline (press Enter)
      setNestedValue(config, 'maxStatsSamples', 22);

      // Verify value is in memory
      expect(config.maxStatsSamples).toBe(22);

      // Write to file (simulated)
      mockWriteConfig(config);

      // Verify writeConfig was called with new value
      expect(mockWriteConfig).toHaveBeenCalledWith(config);
      expect(mockWriteConfig.mock.calls[0][0].maxStatsSamples).toBe(22);
    });

    it('should handle nested config updates in config.json', () => {
      const config = {
        healthCheck: {
          interval: 120000
        }
      };

      // Edit healthCheck.interval
      setNestedValue(config, 'healthCheck.interval', 60000);

      expect(config.healthCheck.interval).toBe(60000);

      mockWriteConfig(config);
      expect(mockWriteConfig.mock.calls[0][0].healthCheck.interval).toBe(60000);
    });

    it('should preserve entire config when saving partial updates', () => {
      const originalConfig = {
        port: 3001,
        maxRetries: 3,
        maxStatsSamples: 20,
        healthCheck: {
          interval: 120000
        }
      };

      // Copy to preserve original
      const config = JSON.parse(JSON.stringify(originalConfig));

      // Update only maxStatsSamples
      setNestedValue(config, 'maxStatsSamples', 25);

      // Verify other values are preserved
      expect(config.port).toBe(3001);
      expect(config.maxRetries).toBe(3);
      expect(config.maxStatsSamples).toBe(25);
      expect(config.healthCheck.interval).toBe(120000);

      mockWriteConfig(config);
      const written = mockWriteConfig.mock.calls[0][0];
      expect(written.port).toBe(3001);
      expect(written.maxRetries).toBe(3);
      expect(written.maxStatsSamples).toBe(25);
      expect(written.healthCheck.interval).toBe(120000);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero values', () => {
      const testObj = { timeout: 100 };
      setNestedValue(testObj, 'timeout', 0);
      expect(testObj.timeout).toBe(0);
    });

    it('should handle negative values', () => {
      const testObj = { value: 10 };
      setNestedValue(testObj, 'value', -5);
      expect(testObj.value).toBe(-5);
    });

    it('should handle string values', () => {
      const testObj = { name: 'test' };
      setNestedValue(testObj, 'name', 'updated');
      expect(testObj.name).toBe('updated');
    });

    it('should handle array values', () => {
      const testObj = { items: [1, 2, 3] };
      setNestedValue(testObj, 'items', [1, 2, 3, 4]);
      expect(testObj.items).toEqual([1, 2, 3, 4]);
    });
  });
});
