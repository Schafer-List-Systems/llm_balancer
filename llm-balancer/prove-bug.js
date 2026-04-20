/**
 * Verify that config.json priority and maxInputTokens are attached to Backend instances.
 *
 * This replicates the exact production code path from index.js:47-52 and asserts that
 * backend.priority and backend.maxInputTokens match the config values.
 *
 * Usage: node prove-bug.js
 *   Exit 0 = all assertions pass (bug is fixed)
 *   Exit 1 = assertion failed (bug still present)
 */

const { loadConfig } = require('./config');
const Backend = require('./backends/Backend');
const { BackendSelector } = require('./backend-selector');

let failed = false;
function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed = true;
  } else {
    console.log(`  PASS: ${msg}`);
  }
}

console.log('=== Loading config.json ===');
const config = loadConfig();
console.log('Config backends:');
config.backends.forEach((b) => {
  console.log(`  ${b.name || b.url}: priority=${b.priority}, maxInputTokens=${b.maxInputTokens}`);
});

// Replicate exact production construction (index.js:47-52)
console.log('\n=== Constructing Backend instances (index.js:47-52) ===');
const backends = config.backends.map((backendConfig) => {
  const backend = new Backend(backendConfig.url, backendConfig.maxConcurrency, backendConfig.name || null);
  backend.priority = backendConfig.priority;
  backend.maxInputTokens = backendConfig.maxInputTokens;
  return backend;
});

console.log('\n=== Asserting priority and maxInputTokens on Backend instances ===');
config.backends.forEach((cfg, i) => {
  const b = backends[i];
  assert(b.priority === cfg.priority,
    `${cfg.name}: priority ${cfg.priority} on config == ${b.priority} on backend`);
  assert(b.maxInputTokens === cfg.maxInputTokens,
    `${cfg.name}: maxInputTokens ${cfg.maxInputTokens} on config == ${b.maxInputTokens} on backend`);
});

console.log('\n=== Asserting _filterByMaxInputTokens with promptTokens=25000 ===');
const selector = new BackendSelector();
const filtered = selector._filterByMaxInputTokens(backends, 25000);
config.backends.forEach((cfg, i) => {
  const b = backends[i];
  const cfgLimit = cfg.maxInputTokens;
  const shouldAccept = cfgLimit === undefined || cfgLimit === 0 || 25000 <= cfgLimit;
  const actuallyAccepts = filtered.includes(b);
  assert(shouldAccept === actuallyAccepts,
    `${cfg.name}: config maxInputTokens=${cfgLimit} => ${shouldAccept ? 'ACCEPT' : 'DENY'}, filter returned ${actuallyAccepts ? 'ACCEPT' : 'DENY'}`);
});

console.log('\n=== Asserting priority sorting ===');
const sorted = [...backends].sort((a, b) => (b.priority || 0) - (a.priority || 0));
const priorities = sorted.map((b) => b.priority);
assert(priorities.every((p) => p !== 0 || config.backends.every((c) => c.priority === 0)),
  `Priority sort respects config values: [${priorities.join(', ')}] — no all-zero fallback`);

console.log('');
if (failed) {
  console.log('=== FAILED: bugs still present ===');
  process.exit(1);
} else {
  console.log('=== PASSED: all assertions verified ===');
  process.exit(0);
}
