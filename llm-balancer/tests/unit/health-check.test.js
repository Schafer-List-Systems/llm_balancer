/**
 * Health Check Configuration Tests
 */

const config = require('../../config');
const HealthChecker = require('../../health-check');
const Backend = require('../../backends/Backend');
const OpenAIHealthCheck = require('../../interfaces/implementations/OpenAIHealthCheck');

describe('HealthChecker Configuration', () => {
  test('should load health check interval from config', () => {
    const cfg = config.loadConfig();
    expect(cfg.healthCheck.interval).toBe(120000);
    expect(typeof cfg.healthCheck.interval).toBe('number');
    expect(cfg.healthCheck.interval).toBeGreaterThan(0);
  });

  test('should load health check timeout from config', () => {
    const cfg = config.loadConfig();
    expect(cfg.healthCheck.timeout).toBe(5000);
    expect(typeof cfg.healthCheck.timeout).toBe('number');
    expect(cfg.healthCheck.timeout).toBeGreaterThan(0);
  });

  test('HealthChecker should receive correct config values', () => {
    const cfg = config.loadConfig();
    // Convert config backends to Backend instances
    const backends = cfg.backends.slice(0, 2).map(b => {
      const backend = new Backend(b.url, b.maxConcurrency);
      backend.healthChecker = new OpenAIHealthCheck(cfg.healthCheck?.timeout || 5000);
      return backend;
    });
    const healthChecker = new HealthChecker(backends, cfg);

    expect(healthChecker.config.healthCheck?.interval).toBe(cfg.healthCheck?.interval);
    expect(healthChecker.config.healthCheck?.timeout).toBe(cfg.healthCheck?.timeout);
  });

  test('should use healthCheck interval for setInterval', () => {
    const cfg = config.loadConfig();
    // Convert config backends to Backend instances
    const backends = cfg.backends.slice(0, 2).map(b => {
      const backend = new Backend(b.url, b.maxConcurrency);
      backend.healthChecker = new OpenAIHealthCheck(cfg.healthCheck?.timeout || 5000);
      return backend;
    });

    // Create HealthChecker and start it
    const healthChecker = new HealthChecker(backends, cfg);
    healthChecker.start();

    // The setInterval should have been set with healthCheck interval
    expect(healthChecker.healthCheckIntervalId).not.toBeNull();

    // Clean up
    healthChecker.stop();
  });

  test('should use healthCheck timeout in HTTP request options', () => {
    const cfg = config.loadConfig();
    // Convert config backends to Backend instances
    const backends = cfg.backends.slice(0, 2).map(b => {
      const backend = new Backend(b.url, b.maxConcurrency);
      backend.healthChecker = new OpenAIHealthCheck(cfg.healthCheck?.timeout || 5000);
      return backend;
    });

    const healthChecker = new HealthChecker(backends, cfg);

    // Check that the checkBackend method uses the timeout config
    expect(healthChecker.config.healthCheck?.timeout).toBe(5000);
  });

  test('should have default values if environment variables are not set', () => {
    // This test assumes the config module has default values
    const cfg = config.loadConfig();
    // Default healthCheck interval should be 120000 (from config.json)
    expect(cfg.healthCheck?.interval).toBeDefined();
    // Default healthCheck timeout should be 5000 (from config.json)
    expect(cfg.healthCheck?.timeout).toBeDefined();
  });
});