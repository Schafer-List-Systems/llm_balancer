/**
 * Token counting utilities using tiktoken
 * tiktoken is an open-source tokenizer maintained by OpenAI
 * Provides accurate token counting across most LLM models
 */

const tiktoken = require('tiktoken');

/**
 * Valid encoding names that can be used directly with tiktoken.get_encoding()
 */
const VALID_ENCODINGS = ['cl100k_base', 'p50k_base', 'r50k_base', 'p50k_edit', 'o200k_base'];

/**
 * Get a tokenizer encoder for a specific name
 * Accepts either model names (e.g., 'gpt-4') or encoding names (e.g., 'cl100k_base')
 * @param {string} [name='gpt-4'] - Model name or encoding name
 * @returns {Object} tiktoken encoder instance
 */
function getModelEncoder(name = 'gpt-4') {
  // If it's a valid encoding name, use get_encoding directly
  if (VALID_ENCODINGS.includes(name)) {
    return tiktoken.get_encoding(name);
  }

  // Otherwise treat it as a model name and use encoding_for_model
  // This works for both actual model names like 'gpt-4' and common variants
  try {
    return tiktoken.encoding_for_model(name);
  } catch (e) {
    // If the model name is invalid, fall back to cl100k_base encoding
    return tiktoken.get_encoding('cl100k_base');
  }
}

/**
 * Count tokens in a string using tiktoken
 * @param {string} text - Input text to count
 * @param {string} [modelName='cl100k_base'] - Model name or encoding name to determine encoding
 * @returns {number} Token count
 */
function countTokens(text, modelName = 'cl100k_base') {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const encoder = getModelEncoder(modelName);
  const tokenCount = encoder.encode(text).length;
  encoder.free();

  return tokenCount;
}

/**
 * Count tokens for multiple text inputs
 * @param {string[]} texts - Array of text strings to count
 * @param {string} [modelName='cl100k_base'] - Model name or encoding name to determine encoding
 * @returns {Object} Object with total count and per-text counts
 */
function countTokensBatch(texts, modelName = 'cl100k_base') {
  if (!Array.isArray(texts) || texts.length === 0) {
    return { total: 0, counts: [] };
  }

  const counts = texts.map(text => countTokens(text, modelName));
  const total = counts.reduce((sum, count) => sum + count, 0);

  return { total, counts };
}

/**
 * Format tokens for display (with K suffix for thousands)
 * @param {number} tokenCount - Token count to format
 * @returns {string} Formatted token count (e.g., "15K", "1,234")
 */
function formatTokenCount(tokenCount) {
  if (tokenCount >= 10000) {
    return `${(tokenCount / 1000).toFixed(1)}K`;
  }
  return tokenCount.toString();
}

module.exports = {
  countTokens,
  countTokensBatch,
  formatTokenCount,
  getModelEncoder
};