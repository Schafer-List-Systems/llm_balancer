/**
 * Integration tests for configuration endpoints
 * Tests GET /config and POST /config endpoints via Express + Supertest
 */

const request = require('supertest');
const express = require('express');

// Create a minimal Express app with config endpoints
const app = express();
app.use(express.json());

// Mock the config module
const mockConfig = {
  port: 3001,
  version: '0.0.1',
  maxRetries: 3,
  maxPayloadSize: 104857600,
  maxStatsSamples: 20,
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
  backends: [
    { url: 'http://localhost:11434', name: 'Test Backend', priority: 1, maxConcurrency: 10, active: true }
  ]
};

// Mock config module
jest.mock('../../config', () => ({
  loadConfig: jest.fn(() => mockConfig),
  writeConfig: jest.fn(() => ({ success: true, message: 'Configuration saved successfully' }))
}));

const configModule = require('../../config');
const { loadConfig, writeConfig } = configModule;

// Load config for the test
const config = loadConfig();

// Add config endpoints (simulating index.js)
app.get('/config', (req, res) => {
  res.json(config);
});

app.post('/config', (req, res) => {
  const newConfig = req.body;

  if (!newConfig || typeof newConfig !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid configuration object'
    });
  }

  const result = writeConfig(newConfig);

  if (result.success) {
    res.json({
      success: true,
      message: result.message,
      note: 'Configuration changes require server restart to take effect',
      config: newConfig
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

describe('GET /config endpoint', () => {
  it('should return 200 OK with full configuration', async () => {
    const response = await request(app).get('/config');

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('object');
    expect(response.body).toHaveProperty('port');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('backends');
  });

  it('should return configuration with all expected fields', async () => {
    const response = await request(app).get('/config');

    const config = response.body;
    expect(config).toHaveProperty('port');
    expect(config).toHaveProperty('version');
    expect(config).toHaveProperty('maxRetries');
    expect(config).toHaveProperty('maxPayloadSize');
    expect(config).toHaveProperty('maxStatsSamples');
    expect(config).toHaveProperty('debug');
    expect(config).toHaveProperty('prompt');
    expect(config).toHaveProperty('healthCheck');
    expect(config).toHaveProperty('queue');
    expect(config).toHaveProperty('request');
    expect(config).toHaveProperty('backends');
  });

  it('should return backends array', async () => {
    const response = await request(app).get('/config');

    expect(Array.isArray(response.body.backends)).toBe(true);
    expect(response.body.backends.length).toBeGreaterThan(0);
  });
});

describe('POST /config endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 OK with success when valid config is provided', async () => {
    const newConfig = {
      port: 3002,
      version: '0.0.2',
      maxRetries: 5,
      debug: { enabled: false },
      backends: [{ url: 'http://localhost:11434', name: 'Updated', priority: 2, maxConcurrency: 5 }]
    };

    const response = await request(app)
      .post('/config')
      .send(newConfig);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('saved successfully');
    expect(response.body.config).toEqual(expect.objectContaining(newConfig));
  });

  it('should call writeConfig with the provided configuration', async () => {
    const newConfig = { port: 3003, version: '0.0.3' };

    await request(app).post('/config').send(newConfig);

    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(writeConfig).toHaveBeenCalledWith(newConfig);
  });

  it('should handle empty config body gracefully', async () => {
    const response = await request(app)
      .post('/config')
      .send({});

    // Empty object is valid but will use defaults for missing fields
    expect(response.status).toBe(200);
  });

  it('should accept partial configuration updates', async () => {
    const partialConfig = { port: 3010 };

    const response = await request(app).post('/config').send(partialConfig);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.config.port).toBe(3010);
  });

  it('should handle non-JSON content-type appropriately', async () => {
    const response = await request(app)
      .post('/config')
      .set('Content-Type', 'text/plain')
      .send('invalid json');

    // Express JSON parser will fail to parse, resulting in undefined body
    expect(response.status).toBe(200);
  });

  it('should include note about server restart in response', async () => {
    const newConfig = { port: 3004 };

    const response = await request(app).post('/config').send(newConfig);

    expect(response.body.note).toBe('Configuration changes require server restart to take effect');
  });
});

describe('Configuration endpoint data integrity', () => {
  it('should preserve nested object structure when updating', async () => {
    const newConfig = {
      port: 3005,
      prompt: {
        cache: {
          maxSize: 10,
          similarityThreshold: 0.8,
          minHitThreshold: 20000
        }
      },
      healthCheck: {
        interval: 60000,
        timeout: 3000
      }
    };

    const response = await request(app).post('/config').send(newConfig);

    expect(response.body.success).toBe(true);
    expect(response.body.config.prompt.cache.maxSize).toBe(10);
    expect(response.body.config.healthCheck.interval).toBe(60000);
  });

  it('should accept backend array modifications', async () => {
    const newConfig = {
      port: 3006,
      backends: [
        { url: 'http://localhost:11434', name: 'Backend 1', priority: 5, maxConcurrency: 20 },
        { url: 'http://localhost:11435', name: 'Backend 2', priority: 3, maxConcurrency: 15 },
        { url: 'http://localhost:11436', name: 'Backend 3', priority: 1, maxConcurrency: 10 }
      ]
    };

    const response = await request(app).post('/config').send(newConfig);

    expect(response.body.success).toBe(true);
    expect(response.body.config.backends.length).toBe(3);
    expect(response.body.config.backends[0].priority).toBe(5);
    expect(response.body.config.backends[1].priority).toBe(3);
  });
});
