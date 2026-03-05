require('dotenv').config({ path: __dirname + '/../.env' });
const Balancer = require('../../balancer');
const config = require('../../config');

/**
 * Simple Integration Tests using actual backends from environment
 */

async function runIntegrationTests() {
  console.log('='.repeat(80));
  console.log('INTEGRATION TESTS WITH REAL BACKENDS');
  console.log('='.repeat(80));

  // Load actual backends from environment
  console.log('\n1. Loading backends from environment...');
  const backends = config.loadConfig().backends;
  console.log(`   Found ${backends.length} backend(s) configured:`);
  backends.forEach((b, i) => {
    console.log(`   [${i + 1}] ${b.url} (priority: ${b.priority}, healthy: ${b.healthy})`);
  });

  // Test 1: Backend Loading
  console.log('\n2. Testing backend loading...');
  if (backends.length === 0) {
    console.log('   ❌ FAIL: No backends found');
    return false;
  }
  console.log('   ✓ PASS: Backends loaded successfully');

  // Test 2: Backend Properties
  console.log('\n3. Testing backend properties...');
  backends.forEach(backend => {
    if (!backend.url || !backend.priority || typeof backend.healthy !== 'boolean' ||
        typeof backend.busy !== 'boolean' || typeof backend.requestCount !== 'number' ||
        typeof backend.errorCount !== 'number' || typeof backend.failCount !== 'number') {
      console.log('   ❌ FAIL: Backend missing required properties');
      return false;
    }
    console.log(`   ✓ PASS: Backend ${backend.url} has all required properties`);
  });

  // Test 3: Queue Request
  console.log('\n4. Testing queueRequest()...');
  try {
    const balancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));
    const backend = await balancer.queueRequest();
    if (!backend || !backend.url) {
      console.log('   ❌ FAIL: queueRequest() returned invalid backend');
      return false;
    }
    console.log(`   ✓ PASS: queueRequest() returned ${backend.url}`);
  } catch (err) {
    console.log(`   ❌ FAIL: queueRequest() threw error: ${err.message}`);
    return false;
  }

  // Test 4: Get Stats
  console.log('\n5. Testing getStats()...');
  try {
    const balancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));
    const stats = balancer.getStats();
    if (!stats || !stats.totalBackends || !stats.backends) {
      console.log('   ❌ FAIL: getStats() returned invalid stats');
      return false;
    }
    console.log(`   ✓ PASS: getStats() returned valid data`);
    console.log(`      - Total backends: ${stats.totalBackends}`);
    console.log(`      - Healthy backends: ${stats.healthyBackends}`);
  } catch (err) {
    console.log(`   ❌ FAIL: getStats() threw error: ${err.message}`);
    return false;
  }

  // Test 5: Queue Statistics
  console.log('\n6. Testing queue statistics...');
  try {
    const balancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));
    const queueStats = balancer.getQueueStats();
    if (!queueStats || queueStats.depth === undefined || queueStats.maxQueueSize === undefined) {
      console.log('   ❌ FAIL: getQueueStats() returned invalid data');
      return false;
    }
    console.log(`   ✓ PASS: getQueueStats() returned valid data`);
    console.log(`      - Queue depth: ${queueStats.depth}`);
    console.log(`      - Max queue size: ${queueStats.maxQueueSize}`);
  } catch (err) {
    console.log(`   ❌ FAIL: getQueueStats() threw error: ${err.message}`);
    return false;
  }

  // Test 6: Multiple Requests
  console.log('\n7. Testing multiple requests...');
  try {
    const balancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));

    // Queue 3 requests
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(balancer.queueRequest());
    }

    const results = await Promise.allSettled(requests);
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;

    if (fulfilled === 0) {
      console.log('   ❌ FAIL: None of the requests succeeded');
      return false;
    }

    console.log(`   ✓ PASS: ${fulfilled} out of 3 requests succeeded`);
  } catch (err) {
    console.log(`   ❌ FAIL: Multiple requests test threw error: ${err.message}`);
    return false;
  }

  // Test 7: Backend Health
  console.log('\n8. Testing backend health...');
  try {
    const healthBalancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));
    if (!healthBalancer.hasHealthyBackends()) {
      console.log('   ❌ FAIL: No healthy backends found');
      return false;
    }
    console.log(`   ✓ PASS: Found ${healthBalancer.hasHealthyBackends()} healthy backends`);
  } catch (err) {
    console.log(`   ❌ FAIL: Health check threw error: ${err.message}`);
    return false;
  }

  // Test 8: All Queue Stats
  console.log('\n9. Testing getAllQueueStats()...');
  try {
    const balancer = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));
    const allStats = balancer.getAllQueueStats();

    if (!Array.isArray(allStats) || allStats.length === 0) {
      console.log('   ❌ FAIL: getAllQueueStats() returned invalid data');
      return false;
    }

    console.log(`   ✓ PASS: getAllQueueStats() returned data for ${allStats.length} backends`);
  } catch (err) {
    console.log(`   ❌ FAIL: getAllQueueStats() threw error: ${err.message}`);
    return false;
  }

  // Test 9: Backend Statistics
  console.log('\n10. Testing request count tracking...');
  try {
    const balancer10 = new Balancer(backends.map(b => ({...b, busy: false, requestCount: 0, errorCount: 0})));

    // Make one request
    const backend = await balancer10.queueRequest();

    const stats = balancer10.getStats();

    console.log(`      DEBUG: stats.requestCounts =`, JSON.stringify(stats.requestCounts, null, 2));

    const backendUrl = backend.url;

    if (!backendUrl) {
      console.log('   ❌ FAIL: backend.url is undefined');
      return false;
    }

    if (!stats.requestCounts[backendUrl]) {
      console.log(`   ❌ FAIL: backendUrl ${backendUrl} not found in requestCounts`);
      console.log(`      Available keys:`, Object.keys(stats.requestCounts));
      return false;
    }

    if (stats.requestCounts[backendUrl] !== 1) {
      console.log(`   ❌ FAIL: Request count is ${stats.requestCounts[backendUrl]}, expected 1`);
      return false;
    }

    console.log(`   ✓ PASS: Request count tracking works correctly`);
    console.log(`      - Backend: ${backendUrl}`);
    console.log(`      - Requests: ${stats.requestCounts[backendUrl]}`);
  } catch (err) {
    console.log(`   ❌ FAIL: Request count tracking threw error: ${err.message}`);
    return false;
  }

  // Test 10: Priority Handling
  console.log('\n11. Testing priority handling...');
  try {
    const highPriorityBalancer = new Balancer(
      backends.map(b => ({...b, priority: 99, busy: false, requestCount: 0, errorCount: 0}))
    );

    const backend = await highPriorityBalancer.queueRequest();

    if (!backend || backend.priority !== 99) {
      console.log('   ❌ FAIL: Priority not handled correctly');
      return false;
    }

    console.log(`   ✓ PASS: Priority handling works correctly`);
    console.log(`      - Backend: ${backend.url}`);
    console.log(`      - Priority: ${backend.priority}`);
  } catch (err) {
    console.log(`   ❌ FAIL: Priority handling threw error: ${err.message}`);
    return false;
  }

  // Test 11: Empty Backends
  console.log('\n12. Testing empty backends scenario...');
  try {
    const emptyBalancer = new Balancer([]);

    if (emptyBalancer.getNextBackend() !== null) {
      console.log('   ❌ FAIL: Empty backends should return null');
      return false;
    }

    console.log(`   ✓ PASS: Empty backends handled correctly`);
  } catch (err) {
    console.log(`   ❌ FAIL: Empty backends test threw error: ${err.message}`);
    return false;
  }

  // Test 12: Environment Configuration
  console.log('\n13. Testing environment configuration...');
  try {
    const envConfig = config.loadConfig();
    const requiredKeys = ['port', 'backends', 'healthCheckInterval', 'healthCheckTimeout', 'maxRetries'];

    for (const key of requiredKeys) {
      if (envConfig[key] === undefined) {
        console.log(`   ❌ FAIL: Missing required config key: ${key}`);
        return false;
      }
    }

    console.log(`   ✓ PASS: All required config keys present`);
    console.log(`      - Port: ${envConfig.port}`);
    console.log(`      - Health check interval: ${envConfig.healthCheckInterval}ms`);
    console.log(`      - Health check timeout: ${envConfig.healthCheckTimeout}ms`);
  } catch (err) {
    console.log(`   ❌ FAIL: Environment config test threw error: ${err.message}`);
    return false;
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ ALL INTEGRATION TESTS PASSED!');
  console.log('='.repeat(80));

  return true;
}

// Run tests
runIntegrationTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });