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
 *
 * IMPORTANT: The config loader provides ALL default values.
 * Other code must NOT add fallbacks - config values are guaranteed to exist.
 */

const fs = require('fs');
const path = require('path');

/**
 * Default configuration values
 * These are applied to ensure all config values exist
 */
const DEFAULTS = {
  port: 3001,
  version: '0.0.0',
  maxRetries: 3,
  maxPayloadSize: 50 * 1024 * 1024, // 50MB
  maxStatsSamples: 20,
  maxQueueSize: 100,
  shutdownTimeout: 60000,
  debug: {
    enabled: false,
    requestHistorySize: 100
  },
  prompt: {
    cache: {
      maxSize: 5,
      similarityThreshold: 0.7, // Reduced from 0.85 for testing to allow more cache hits
      minHitThreshold: 15000 // Minimum token count to enforce cache-hit preference
    }
  },
  healthCheck: {
    interval: 120000, // 2 minutes
    timeout: 5000
  },
  queue: {
    timeout: 30000
  },
  request: {
    timeout: 300000 // 5 minutes
  },
  backends: [
    {
      url: 'http://localhost:11434',
      name: 'Backend 1',
      priority: 1,
      maxConcurrency: 10
    }
  ]
};

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
 * Deep merge source into target, where target takes precedence
 * @param {Object} target - Target object (higher precedence)
 * @param {Object} source - Source object
 * @param {Object} defaults - Default values for fallback
 * @returns {Object} Merged object
 */
function deepMergeWithDefaults(target, source, defaults) {
  const result = { ...defaults };

  // Start with defaults, then apply source, then target (target wins)
  for (const key in result) {
    if (target && target.hasOwnProperty(key)) {
      if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
        result[key] = deepMergeWithDefaults(target[key], source && source[key] ? source[key] : {}, defaults[key] || {});
      } else {
        result[key] = target[key];
      }
    } else if (source && source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMergeWithDefaults({}, source[key], defaults[key] || {});
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Merge config.json values with environment variables
 * config.json values take precedence, missing values fall back to env vars
 * Finally, any remaining undefined values are filled with defaults
 * @param {Object} configJson - Parsed config.json
 * @param {Object} env - Process environment variables
 * @returns {Object} Merged configuration with all defaults applied
 */
function mergeConfig(configJson, env) {
  // If no config.json, build entirely from environment variables
  if (!configJson) {
    return buildConfigFromEnv(env);
  }

  // Deep merge: defaults < env vars < config.json
  // config.json has highest priority, env vars provide backward compatibility,
  // and defaults fill any remaining gaps
  const config = deepMergeWithDefaults(configJson, env, DEFAULTS);

  // Calculate derived values
  config.maxPayloadSizeMB = Math.round(config.maxPayloadSize / (1024 * 1024));

  return config;
}

/**
 * Build configuration entirely from environment variables
 * Uses DEFAULTS as base, then overrides with env vars
 * @param {Object} env - Process environment variables
 * @returns {Object} Configuration object with all defaults applied
 */
function buildConfigFromEnv(env) {
  // Build backends from env first
  const backends = buildBackendsFromEnv(env);

  // Start with defaults and override with env vars
  const config = {
    port: env.LB_PORT ? parseInt(env.LB_PORT) : DEFAULTS.port,
    version: env.VERSION || DEFAULTS.version,
    maxRetries: env.MAX_RETRIES ? parseInt(env.MAX_RETRIES) : DEFAULTS.maxRetries,
    maxPayloadSize: env.MAX_PAYLOAD_SIZE ? parseInt(env.MAX_PAYLOAD_SIZE) : DEFAULTS.maxPayloadSize,
    maxStatsSamples: env.MAX_STATS_SAMPLES ? parseInt(env.MAX_STATS_SAMPLES) : DEFAULTS.maxStatsSamples,
    maxQueueSize: env.MAX_QUEUE_SIZE ? parseInt(env.MAX_QUEUE_SIZE) : DEFAULTS.maxQueueSize,
    shutdownTimeout: env.SHUTDOWN_TIMEOUT ? parseInt(env.SHUTDOWN_TIMEOUT) : DEFAULTS.shutdownTimeout,
    debug: {
      enabled: env.DEBUG === 'true',
      requestHistorySize: env.DEBUG_REQUEST_HISTORY_SIZE ? parseInt(env.DEBUG_REQUEST_HISTORY_SIZE) : DEFAULTS.debug.requestHistorySize
    },
    healthCheck: {
      interval: env.HEALTH_CHECK_INTERVAL ? parseInt(env.HEALTH_CHECK_INTERVAL) : DEFAULTS.healthCheck.interval,
      timeout: env.HEALTH_CHECK_TIMEOUT ? parseInt(env.HEALTH_CHECK_TIMEOUT) : DEFAULTS.healthCheck.timeout
    },
    queue: {
      timeout: env.QUEUE_TIMEOUT ? parseInt(env.QUEUE_TIMEOUT) : DEFAULTS.queue.timeout
    },
    request: {
      timeout: env.REQUEST_TIMEOUT ? parseInt(env.REQUEST_TIMEOUT) : DEFAULTS.request.timeout
    },
    prompt: {
      cache: {
        maxSize: env.MAX_PROMPT_CACHE_SIZE ? parseInt(env.MAX_PROMPT_CACHE_SIZE) : DEFAULTS.prompt.cache.maxSize,
        similarityThreshold: env.PROMPT_CACHE_SIMILARITY_THRESHOLD ? parseFloat(env.PROMPT_CACHE_SIMILARITY_THRESHOLD) : DEFAULTS.prompt.cache.similarityThreshold,
        minHitThreshold: env.MIN_PROMPT_CACHE_HIT_TOKENS ? parseInt(env.MIN_PROMPT_CACHE_HIT_TOKENS) : DEFAULTS.prompt.cache.minHitThreshold
      }
    },
    backends
  };

  return config;
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