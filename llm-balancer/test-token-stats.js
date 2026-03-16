/**
 * Test script for token counting statistics
 * Demonstrates request-side token counting in backend statistics
 */

const Backend = require('./backends/Backend');

console.log('='.repeat(70));
console.log('Token Statistics Demo - Request-Side Token Counting');
console.log('='.repeat(70));

// Create a backend instance
const backend = new Backend('http://localhost:11434', 10);

console.log('\n1. Non-Streaming Request Statistics');
console.log('-'.repeat(50));

// Simulate a non-streaming request
// Simulating response from backend: prompt_tokens=50, completion_tokens=30
// Simulating request body token count: 45
backend.updateNonStreamingStats(50, 30, 1200, 150, 45);

const stats1 = backend.getPerformanceStats();
console.log('Request:', {
  promptTokens: 50,
  completionTokens: 30,
  totalTimeMs: 1200,
  promptProcessingTimeMs: 150,
  requestTokens: 45
});
console.log('\nPerformance Stats:', JSON.stringify(stats1, null, 2));

// Add another sample
backend.updateNonStreamingStats(60, 40, 1500, 200, 55);
console.log('\n--- After second request ---');
const stats2 = backend.getPerformanceStats();
console.log('Average requestTokens:', stats2.tokenStats.avgRequestTokens);
console.log('Average promptTokens (from backend):', stats2.tokenStats.avgPromptTokens);

console.log('\n2. Streaming Request Statistics');
console.log('-'.repeat(50));

// Create another backend for streaming tests
const backend2 = new Backend('http://localhost:8000', 10);

// Simulate a streaming request
// Simulating response from backend: prompt_tokens=75, completion_tokens=100
// Simulating request body token count: 70
backend2.updateStreamingStats(75, 100, 180, 2500, 70);

const stats3 = backend2.getPerformanceStats();
console.log('Request:', {
  promptTokens: 75,
  completionTokens: 100,
  firstChunkTimeMs: 180,
  totalCompletionTimeMs: 2500,
  requestTokens: 70
});
console.log('\nPerformance Stats:', JSON.stringify(stats3, null, 2));

// Add another streaming sample
backend2.updateStreamingStats(80, 120, 200, 3000, 75);
console.log('\n--- After second streaming request ---');
const stats4 = backend2.getPerformanceStats();
console.log('Average requestTokens:', stats4.tokenStats.avgRequestTokens);
console.log('Average promptTokens (from backend):', stats4.tokenStats.avgPromptTokens);

console.log('\n3. Comparison: Request-Side vs Response-Side Token Counts');
console.log('-'.repeat(50));
console.log('\nRequest tokens are counted from the PROMPT BODY before sending.');
console.log('Prompt tokens from backend come from the RESPONSE usage field.');
console.log('');
console.log('This allows us to:');
console.log('  - Track actual tokens sent to backend');
console.log('  - Compare with tokens reported by backend');
console.log('  - Use request-side tokens for short prompts (fallback)');
console.log('  - Detect discrepancies between client and backend counts');

console.log('\n4. Chunk-Based Fallback (vLLM-style backends without usage)');
console.log('-'.repeat(50));

const backend3 = new Backend('http://localhost:9000', 10);

// When backend doesn't provide usage, we use chunk counting
// But we still have requestTokens from the request body
backend3.updateStreamingStatsFromChunks(50, 80, 100, 1800, 50);

const stats5 = backend3.getPerformanceStats();
console.log('Request:', {
  estimatedPromptTokens: 50,  // From request body
  completionTokens: 80,       // From chunk count
  firstChunkTimeMs: 100,
  totalCompletionTimeMs: 1800
});
console.log('\nPerformance Stats:', JSON.stringify(stats5, null, 2));
console.log('Note: avgRequestTokens provides fallback when backend usage unavailable');

console.log('\n' + '='.repeat(70));
console.log('Demo complete!');
console.log('='.repeat(70));
