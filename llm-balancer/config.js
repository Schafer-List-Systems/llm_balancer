/**
 * Configuration module for LLM Balancer
 * Loads configuration from config.json with .env fallback
 *
 * Configuration Priority:
 * 1. config.json values (highest priority)
 * 2. Environment variables (for backward compatibility)
 * 3. Default values
 *
 * This allows easy configuration via JSON while maintaining
 * backward compatibility with existing .env setups.
 */

const fs = require('fs');
const path = require('path');

/**
 * Load configuration from config.json if it exists
 * @returns {Object|null} Parsed config or null if file doesn't exist
 */
function loadConfigJson() {
  const configPath = path.join(__dirname, 'config.json');

  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (err) {
    console.error(`[Config] Failed to load config.json: ${err.message}`);
    console.error('[Config] Falling back to environment variables');
    return null;
  }
}

/**
 * Merge config.json values with environment variables
 * config.json values take precedence, missing values fall back to env vars
 * @param {Object} configJson - Parsed config.json
 * @param {Object} env - Process environment variables
 * @returns {Object} Merged configuration
 */
function mergeConfig(configJson, env) {
  // If no config.json, build entirely from environment variables
  if (!configJson) {
    return buildConfigFromEnv(env);
  }

  // Start with config.json as the base
  const config = { ...configJson };

  // Override with environment variables for any missing values
  // This provides backward compatibility and easy overrides
  if (!config.port && env.LB_PORT) {
    config.port = parseInt(env.LB_PORT);
  }
  if (!config.version && env.VERSION) {
    config.version = env.VERSION;
  }
  if (!config.maxRetries && env.MAX_RETRIES) {
    config.maxRetries = parseInt(env.MAX_RETRIES);
  }
  if (!config.maxPayloadSize && env.MAX_PAYLOAD_SIZE) {
    config.maxPayloadSize = parseInt(env.MAX_PAYLOAD_SIZE);
  }
  if (!config.debug && env.DEBUG !== undefined) {
    config.debug = env.DEBUG === 'true';
  }

  // Build backends array - prefer config.json structure
  // Fall back to BACKENDS env var if not configured
  if (!config.backends && env.BACKENDS) {
    config.backends = buildBackendsFromEnv(env);
  } else if (!config.backends) {
    // Default backend
    config.backends = [{
      url: env.BACKENDS || 'http://localhost:11434',
      name: 'Backend 1'
    }];
  }

  // Process backends to add default names and merge env settings
  config.backends = config.backends.map((backend, index) => {
    // Use configured name or generate default
    const name = backend.name || `Backend ${index + 1}`;
    const url = backend.url;

    // Merge environment variable settings for this backend
    const priorityEnv = env[`BACKEND_PRIORITY_${index}`];
    const priority = backend.priority ?? (priorityEnv ? parseInt(priorityEnv) : 1);

    const concurrencyEnv = env[`BACKEND_CONCURRENCY_${index}`];
    const maxConcurrency = backend.maxConcurrency ?? (concurrencyEnv ? Math.max(1, parseInt(concurrencyEnv)) : 1);

    return {
      ...backend,
      name,
      url,
      priority,
      maxConcurrency
    };
  });

  // Override health check settings from env if not in config.json
  if (!config.healthCheck) {
    config.healthCheck = {};
  }
  if (!config.healthCheck.interval && env.HEALTH_CHECK_INTERVAL) {
    config.healthCheck.interval = parseInt(env.HEALTH_CHECK_INTERVAL);
  }
  if (!config.healthCheck.timeout && env.HEALTH_CHECK_TIMEOUT) {
    config.healthCheck.timeout = parseInt(env.HEALTH_CHECK_TIMEOUT);
  }

  // Override queue settings from env if not in config.json
  if (!config.queue) {
    config.queue = {};
  }
  if (!config.queue.timeout && env.QUEUE_TIMEOUT) {
    config.queue.timeout = parseInt(env.QUEUE_TIMEOUT);
  }

  // Override request settings from env if not in config.json
  if (!config.request) {
    config.request = {};
  }
  if (!config.request.timeout && env.REQUEST_TIMEOUT) {
    config.request.timeout = parseInt(env.REQUEST_TIMEOUT);
  }

  // Override other settings from env if not in config.json
  if (!config.debugRequestHistorySize && env.DEBUG_REQUEST_HISTORY_SIZE) {
    config.debugRequestHistorySize = parseInt(env.DEBUG_REQUEST_HISTORY_SIZE);
  }
  if (!config.maxStatsSamples && env.MAX_STATS_SAMPLES) {
    config.maxStatsSamples = parseInt(env.MAX_STATS_SAMPLES);
  }
  if (!config.maxQueueSize && env.MAX_QUEUE_SIZE) {
    config.maxQueueSize = parseInt(env.MAX_QUEUE_SIZE);
  }
  if (!config.maxPromptCacheSize && env.MAX_PROMPT_CACHE_SIZE) {
    config.maxPromptCacheSize = parseInt(env.MAX_PROMPT_CACHE_SIZE);
  }
  if (!config.promptCacheSimilarityThreshold && env.PROMPT_CACHE_SIMILARITY_THRESHOLD) {
    config.promptCacheSimilarityThreshold = parseFloat(env.PROMPT_CACHE_SIMILARITY_THRESHOLD);
  }
  if (!config.shutdownTimeout && env.SHUTDOWN_TIMEOUT) {
    config.shutdownTimeout = parseInt(env.SHUTDOWN_TIMEOUT);
  }

  // Calculate derived values
  config.maxPayloadSizeMB = Math.round(config.maxPayloadSize / (1024 * 1024));

  return config;
}

/**
 * Build configuration entirely from environment variables
 * @param {Object} env - Process environment variables
 * @returns {Object} Configuration object
 */
function buildConfigFromEnv(env) {
  const backendUrls = env.BACKENDS || 'http://localhost:11434';
  const backendArray = backendUrls.split(',').map(url => url.trim()).filter(url => url);

  return {
    port: parseInt(env.LB_PORT) || 3001,
    version: env.VERSION || '0.0.0',
    maxRetries: parseInt(env.MAX_RETRIES) || 3,
    maxPayloadSize: parseInt(env.MAX_PAYLOAD_SIZE) || 50 * 1024 * 1024,
    debug: env.DEBUG === 'true',
    debugRequestHistorySize: parseInt(env.DEBUG_REQUEST_HISTORY_SIZE) || 100,
    maxStatsSamples: parseInt(env.MAX_STATS_SAMPLES) || 20,
    maxQueueSize: parseInt(env.MAX_QUEUE_SIZE) || 100,
    maxPromptCacheSize: parseInt(env.MAX_PROMPT_CACHE_SIZE) || 5,
    promptCacheSimilarityThreshold: parseFloat(env.PROMPT_CACHE_SIMILARITY_THRESHOLD) || 0.85,
    shutdownTimeout: parseInt(env.SHUTDOWN_TIMEOUT) || 60000,
    healthCheck: {
      interval: parseInt(env.HEALTH_CHECK_INTERVAL) || 30000,
      timeout: parseInt(env.HEALTH_CHECK_TIMEOUT) || 5000
    },
    queue: {
      timeout: parseInt(env.QUEUE_TIMEOUT) || 30000
    },
    request: {
      timeout: parseInt(env.REQUEST_TIMEOUT) || 300000
    },
    backends: buildBackendsFromEnv(env)
  };
}

/**
 * Build backends array from environment variables
 * @param {Object} env - Process environment variables
 * @returns {Array} Array of backend objects
 */
function buildBackendsFromEnv(env) {
  const backendUrls = env.BACKENDS || 'http://localhost:11434';
  const backendArray = backendUrls.split(',').map(url => url.trim()).filter(url => url);

  return backendArray.map((url, index) => {
    const priorityEnv = env[`BACKEND_PRIORITY_${index}`];
    const priority = priorityEnv ? parseInt(priorityEnv) : 1;

    const concurrencyEnv = env[`BACKEND_CONCURRENCY_${index}`];
    const maxConcurrency = concurrencyEnv ? Math.max(1, parseInt(concurrencyEnv)) : 1;

    return {
      url,
      name: `Backend ${index + 1}`,
      priority,
      maxConcurrency
    };
  });
}

/**
 * Main configuration loader
 * Loads from config.json with .env fallback
 * @returns {Object} Final merged configuration
 */
function loadConfig() {
  const configJson = loadConfigJson();
  return mergeConfig(configJson, process.env);
}

module.exports = {
  loadConfig
};