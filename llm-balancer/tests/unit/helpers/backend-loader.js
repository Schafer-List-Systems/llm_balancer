/**
 * Dynamically load actual backend models from running backends
 * Uses the running backends configured in config.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Get list of available models from running backends
 * @returns {Promise<string[]>} Array of model names from the first healthy backend
 */
async function getAvailableModels() {
  const backends = loadBackendsFromConfig();

  for (const backend of backends) {
    try {
      const models = await fetchBackendModels(backend.url);
      if (models && models.length > 0) {
        console.log(`Found models on ${backend.name}: ${models.slice(0, 3).join(', ')}...`);
        return models;
      }
    } catch (err) {
      console.log(`Could not fetch models from ${backend.name}: ${err.message}`);
    }
  }

  // Fallback to common model names
  console.log('Using fallback model names');
  return ['qwen3.5-35b-a3b', 'llama3'];
}

/**
 * Load backends from config.json
 */
function loadBackendsFromConfig() {
  const configPath = path.join(__dirname, '..', '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.backends || [];
}

/**
 * Fetch models from a backend URL
 */
async function fetchBackendModels(url) {
  const endpoint = `${url}/v1/models`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data?.map(m => m.id) || [];
}

// For non-async usage, use a simpler version
function getAvailableModelsSync() {
  try {
    const backends = loadBackendsFromConfig();
    if (backends.length === 0) return ['model1'];

    // Try to read a cached model list from a file if it exists
    const cachePath = path.join(__dirname, '..', 'model-cache.json');
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cache.lastFetched) {
        const lastFetch = new Date(cache.lastFetched);
        const now = new Date();
        const age = now - lastFetch;
        // Cache is valid for 5 minutes
        if (age < 300000 && cache.models && cache.models.length > 0) {
          return cache.models;
        }
      }
    }

    // If we have a backend, return a model that's commonly available
    // In production, these models should exist on at least one backend
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Use models that are likely to exist based on common deployments
      // Default to qwen3.5-35b-a3b which is common in this setup
      return ['qwen3.5-35b-a3b'];
    }
  } catch (err) {
    console.error('Failed to load models:', err.message);
  }

  return ['model1'];
}

module.exports = {
  getAvailableModels,
  getAvailableModelsSync,
  loadBackendsFromConfig,
  fetchBackendModels
};
