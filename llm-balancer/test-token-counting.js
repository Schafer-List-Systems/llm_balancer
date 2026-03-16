/**
 * Test script for token counting functionality
 * Demonstrates counting tokens in prompts and responses
 */

const { countTokens, formatTokenCount } = require('./utils/token-utils');

console.log('='.repeat(60));
console.log('Token Counting Test');
console.log('='.repeat(60));

// Test 1: Basic token counting
console.log('\n1. Basic Token Counting');
console.log('-'.repeat(40));
const shortPrompt = 'Hello world';
const shortTokens = countTokens(shortPrompt);
console.log(`Prompt: "${shortPrompt}"`);
console.log(`Token count: ${shortTokens} (${formatTokenCount(shortTokens)})`);

// Test 2: Medium prompt (typical chat message)
console.log('\n2. Medium Prompt (Chat Message)');
console.log('-'.repeat(40));
const chatPrompt = `You are a helpful assistant. Answer the following question concisely:

What is the capital of France?

Please provide a one-sentence answer.`;
const chatTokens = countTokens(chatPrompt);
console.log(`Tokens: ${chatTokens} (${formatTokenCount(chatTokens)})`);
console.log(`Status: ${chatTokens < 15000 ? 'Below cache-hit threshold' : 'Above cache-hit threshold'}`);

// Test 3: Long prompt (exceeds 15k threshold)
console.log('\n3. Long Prompt (Exceeds 15k Threshold)');
console.log('-'.repeat(40));
const longRepeats = 'The quick brown fox jumps over the lazy dog. '.repeat(1500);
const longTokens = countTokens(longRepeats);
console.log(`Tokens: ${longTokens} (${formatTokenCount(longTokens)})`);
console.log(`Status: ${longTokens >= 15000 ? 'Above cache-hit threshold - will prefer cache hits' : 'Below cache-hit threshold'}`);

// Test 4: Simulated request/response pair
console.log('\n4. Simulated Request/Response Pair');
console.log('-'.repeat(40));
const requestPrompt = {
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'Can you explain the theory of relativity in simple terms?' }
  ]
};
const requestText = JSON.stringify(requestPrompt);
const requestTokens = countTokens(requestText);

const responseExample = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1234567890,
  model: 'gpt-4',
  choices: [{
    message: {
      role: 'assistant',
      content: 'The theory of relativity, developed by Albert Einstein, consists of two theories: special relativity and general relativity. Special relativity deals with the relationship between space and time for objects moving at constant speeds. It introduced the famous equation E=mc². General relativity extends this to include gravity, describing it as the curvature of spacetime caused by mass and energy.'
    },
    finish_reason: 'stop'
  }],
  usage: {
    prompt_tokens: requestTokens,
    completion_tokens: 78,
    total_tokens: requestTokens + 78
  }
};
const responseTokens = countTokens(JSON.stringify(responseExample));

console.log(`Request tokens: ${requestTokens} (${formatTokenCount(requestTokens)})`);
console.log(`Response tokens: ${responseTokens} (${formatTokenCount(responseTokens)})`);
console.log(`Total tokens: ${requestTokens + responseTokens} (${formatTokenCount(requestTokens + responseTokens)})`);

// Test 5: Token threshold decision logic
console.log('\n5. Token Threshold Decision Logic');
console.log('-'.repeat(40));
const MIN_CACHE_HIT_THRESHOLD = 15000;

function shouldEnforceCacheHit(tokenCount) {
  const belowThreshold = tokenCount < MIN_CACHE_HIT_THRESHOLD;
  if (belowThreshold) {
    console.log(`  Prompt: ${formatTokenCount(tokenCount)} tokens - Use available backend (ignore cache hits)`);
  } else {
    console.log(`  Prompt: ${formatTokenCount(tokenCount)} tokens - Enforce cache hit (prefer cache-hit backend)`);
  }
  return !belowThreshold;
}

const testCases = [
  { name: 'Short query', tokens: 50 },
  { name: 'Standard query', tokens: 500 },
  { name: 'Long context', tokens: 8000 },
  { name: 'Very long context', tokens: 15000 },
  { name: 'Ultra long context', tokens: 32000 }
];

testCases.forEach(test => {
  console.log(`\n  ${test.name}:`);
  shouldEnforceCacheHit(test.tokens);
});

console.log('\n' + '='.repeat(60));
console.log('Token counting test complete!');
console.log('='.repeat(60));
