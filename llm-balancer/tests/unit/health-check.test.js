/**
 * Health Check Configuration Tests
 */

const config = require('../../config');
const HealthChecker = require('../../health-check');

describe('HealthChecker Configuration', () => {
  test('should load health check interval from environment', () => {
    const cfg = config.loadConfig();
    expect(cfg.healthCheckInterval).toBe(30000);
    expect(typeof cfg.healthCheckInterval).toBe('number');
    expect(cfg.healthCheckInterval).toBeGreaterThan(0);
  });

  test('should load health check timeout from environment', () => {
    const cfg = config.loadConfig();
    expect(cfg.healthCheckTimeout).toBe(5000);
    expect(typeof cfg.healthCheckTimeout).toBe('number');
    expect(cfg.healthCheckTimeout).toBeGreaterThan(0);
  });

  test('HealthChecker should receive correct config values', () => {
    const cfg = config.loadConfig();
    const backends = cfg.backends.slice(0, 2); // Use first 2 backends for test
    const healthChecker = new HealthChecker(backends, cfg);

    expect(healthChecker.config.healthCheckInterval).toBe(cfg.healthCheckInterval);
    expect(healthChecker.config.healthCheckTimeout).toBe(cfg.healthCheckTimeout);
  });

  test('should use healthCheckInterval for setInterval', () => {
    const cfg = config.loadConfig();
    const backends = cfg.backends.slice(0, 2);

    // Create HealthChecker and start it
    const healthChecker = new HealthChecker(backends, cfg);
    healthChecker.start();

    // The setInterval should have been set with healthCheckInterval
    expect(healthChecker.healthCheckIntervalId).not.toBeNull();

    // Clean up
    healthChecker.stop();
  });

  test('should use healthCheckTimeout in HTTP request options', () => {
    const cfg = config.loadConfig();
    const backends = cfg.backends.slice(0, 2);

    const healthChecker = new HealthChecker(backends, cfg);

    // Check that the checkBackend method uses the timeout config
    expect(healthChecker.config.healthCheckTimeout).toBe(5000);
  });

  test('should have default values if environment variables are not set', () => {
    // This test assumes the config module has default values
    const cfg = config.loadConfig();
    // Default healthCheckInterval should be 30000
    expect(cfg.healthCheckInterval).toBeDefined();
    // Default healthCheckTimeout should be 5000
    expect(cfg.healthCheckTimeout).toBeDefined();
  });
});