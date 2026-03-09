/**
 * Test helper factory for creating Backend instances
 * Provides consistent backend setup for unit tests
 */

const Backend = require('../../../backends/Backend');
const OllamaHealthCheck = require('../../../interfaces/implementations/OllamaHealthCheck');
const OpenAIHealthCheck = require('../../../interfaces/implementations/OpenAIHealthCheck');
const AnthropicHealthCheck = require('../../../interfaces/implementations/AnthropicHealthCheck');
const GoogleHealthCheck = require('../../../interfaces/implementations/GoogleHealthCheck');

/**
 * Create a test Backend instance with proper backendInfo and healthChecker
 * @param {string} url - Backend URL
 * @param {string} apiType - API type (ollama, openai, anthropic, google)
 * @param {string[]} models - Array of model names
 * @param {number} maxConcurrency - Max concurrency (default: 10)
 * @param {number} healthCheckTimeout - Health check timeout (default: 5000)
 * @returns {Backend} Configured Backend instance
 */
function createTestBackend(url, apiType = 'ollama', models = ['model1'], maxConcurrency = 10, healthCheckTimeout = 5000) {
  const backend = new Backend(url, maxConcurrency);

  // Set activeRequestCount to 0 by default (no active requests)
  backend.activeRequestCount = 0;

  // Determine health endpoint based on API type
  const healthEndpoint = getHealthEndpoint(apiType);
  const chatEndpoint = getChatEndpoint(apiType);

  // Create backendInfo structure
  backend.backendInfo = {
    url,
    healthy: true,
    apis: {
      [apiType]: {
        supported: true,
        modelListEndpoint: healthEndpoint,
        chatEndpoint,
        models
      }
    },
    models: { [apiType]: models },
    endpoints: { [apiType]: healthEndpoint },
    detectedAt: new Date().toISOString()
  };

  // Set backend.healthy to match backendInfo.healthy
  // This is required because backend-selector.js checks backend.healthy directly
  backend.healthy = true;

  // Assign appropriate health checker
  backend.healthChecker = getHealthChecker(apiType, healthCheckTimeout);

  return backend;
}

/**
 * Create a test Backend instance with priority for testing backend-selector
 * @param {string} url - Backend URL
 * @param {string} apiType - API type (ollama, openai, anthropic, google)
 * @param {string[]} models - Array of model names
 * @param {number} priority - Backend priority (default: 1)
 * @param {number} maxConcurrency - Max concurrency (default: 10)
 * @param {number} healthCheckTimeout - Health check timeout (default: 5000)
 * @returns {Backend} Configured Backend instance with priority
 */
function createTestBackendWithPriority(url, apiType = 'ollama', models = ['model1'], priority = 1, maxConcurrency = 10, healthCheckTimeout = 5000) {
  const backend = createTestBackend(url, apiType, models, maxConcurrency, healthCheckTimeout);
  backend.priority = priority;
  return backend;
}

/**
 * Create multiple test Backend instances
 * @param {Array} backendsConfig - Array of config objects with url, apiType, models
 * @param {number} maxConcurrency - Default max concurrency
 * @param {number} healthCheckTimeout - Default health check timeout
 * @returns {Backend[]} Array of configured Backend instances
 */
function createTestBackends(backendsConfig, maxConcurrency = 10, healthCheckTimeout = 5000) {
  return backendsConfig.map(config =>
    createTestBackend(
      config.url,
      config.apiType || 'ollama',
      config.models || ['model1'],
      config.maxConcurrency || maxConcurrency,
      healthCheckTimeout
    )
  );
}

/**
 * Get the health endpoint for an API type
 * @param {string} apiType - API type
 * @returns {string} Health endpoint path
 */
function getHealthEndpoint(apiType) {
  const endpoints = {
    ollama: '/api/tags',
    openai: '/v1/models',
    groq: '/openai/v1/models',
    anthropic: null, // Anthropic doesn't have a model list endpoint
    google: '/v1beta/models'
  };
  return endpoints[apiType] || '/v1/models';
}

/**
 * Get the chat endpoint for an API type
 * @param {string} apiType - API type
 * @returns {string} Chat endpoint path
 */
function getChatEndpoint(apiType) {
  const endpoints = {
    ollama: '/api/generate',
    openai: '/v1/chat/completions',
    groq: '/openai/v1/chat/completions',
    anthropic: '/v1/messages',
    google: '/v1beta/models/{model}:generateContent'
  };
  return endpoints[apiType] || '/v1/chat/completions';
}

/**
 * Get the appropriate health checker for an API type
 * @param {string} apiType - API type
 * @param {number} timeout - Timeout in ms
 * @returns {Object} Health checker instance
 */
function getHealthChecker(apiType, timeout) {
  const checkers = {
    ollama: new OllamaHealthCheck(timeout),
    openai: new OpenAIHealthCheck(timeout),
    groq: new OpenAIHealthCheck(timeout), // Groq uses OpenAI-compatible health check
    anthropic: new AnthropicHealthCheck(timeout),
    google: new GoogleHealthCheck(timeout)
  };
  return checkers[apiType] || new OpenAIHealthCheck(timeout);
}

/**
 * Create a backend with multiple API types
 * @param {string} url - Backend URL
 * @param {Object} apiTypesConfig - Object mapping API type to { models: string[] }
 * @param {number} maxConcurrency - Max concurrency
 * @param {number} healthCheckTimeout - Health check timeout
 * @returns {Backend} Configured Backend instance with multiple APIs
 */
function createMultiApiBackend(url, apiTypesConfig = {}, maxConcurrency = 10, healthCheckTimeout = 5000) {
  const backend = new Backend(url, maxConcurrency);

  const apis = {};
  const models = {};
  const endpoints = {};

  for (const [apiType, config] of Object.entries(apiTypesConfig)) {
    const healthEndpoint = getHealthEndpoint(apiType);
    const chatEndpoint = getChatEndpoint(apiType);

    apis[apiType] = {
      supported: true,
      modelListEndpoint: healthEndpoint,
      chatEndpoint,
      models: config.models || []
    };
    models[apiType] = config.models || [];
    if (healthEndpoint) {
      endpoints[apiType] = healthEndpoint;
    }
  }

  backend.backendInfo = {
    url,
    healthy: true,
    apis,
    models,
    endpoints,
    detectedAt: new Date().toISOString()
  };

  // Assign health checker for the first API type (primary)
  const primaryApiType = Object.keys(apiTypesConfig)[0];
  backend.healthChecker = getHealthChecker(primaryApiType, healthCheckTimeout);

  return backend;
}

/**
 * Create an unhealthy backend (for testing failure scenarios)
 * @param {string} url - Backend URL
 * @param {string} apiType - API type
 * @param {string[]} models - Array of model names
 * @param {number} maxConcurrency - Max concurrency
 * @returns {Backend} Unhealthy Backend instance
 */
function createUnhealthyBackend(url, apiType = 'ollama', models = ['model1'], maxConcurrency = 10) {
  const backend = new Backend(url, maxConcurrency);

  backend.backendInfo = {
    url,
    healthy: false,
    apis: {
      [apiType]: {
        supported: false,
        modelListEndpoint: getHealthEndpoint(apiType),
        chatEndpoint: getChatEndpoint(apiType),
        models: []
      }
    },
    models: { [apiType]: [] },
    endpoints: { [apiType]: getHealthEndpoint(apiType) },
    detectedAt: new Date().toISOString(),
    error: 'Connection refused'
  };

  backend.healthChecker = getHealthChecker(apiType, 5000);
  backend.healthy = false;
  backend.failCount = 1;

  return backend;
}

module.exports = {
  createTestBackend,
  createTestBackendWithPriority,
  createTestBackends,
  createMultiApiBackend,
  createUnhealthyBackend,
  getHealthEndpoint,
  getChatEndpoint,
  getHealthChecker
};