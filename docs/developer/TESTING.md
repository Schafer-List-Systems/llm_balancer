# Testing Guide

This document covers the testing architecture, how to run tests, and guidelines for writing tests.

---

## Overview

The LLM Balancer uses a comprehensive test suite covering:
- **Unit Tests**: Individual component testing
- **Integration Tests**: Component interaction testing
- **Regression Tests**: Preventing previously fixed bugs

---

## Test Structure

```
llm-balancer/tests/unit/
├── balancer.test.js           # Balancer class tests
├── health-check.test.js       # Health checker tests
├── backend.test.js            # Backend class tests
├── config.test.js             # Configuration tests
└── ...
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test -- balancer.test.js
npm test -- health-check.test.js
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Watch Mode

```bash
npm test -- --watch
```

---

## Test Categories

### Unit Tests

Test individual components in isolation.

**Examples**:
- Balancer selection algorithm
- Health check response parsing
- BackendInfo capability detection

### Integration Tests

Test component interactions.

**Examples**:
- Request routing through balancer
- Health check triggering backend updates
- Queue processing flow

### Regression Tests

Prevent previously fixed bugs.

**Examples**:
- Concurrency count integrity
- Queue timeout handling
- Error handling scenarios

---

## Writing Tests

### Test Structure

```javascript
describe('Balancer Class', () => {
  let balancer

  beforeEach(() => {
    balancer = new Balancer({
      backends: [
        new Backend({ url: 'http://host1:11434', priority: 100 }),
        new Backend({ url: 'http://host2:11434', priority: 50 })
      ]
    })
  })

  describe('getNextBackend()', () => {
    it('should select highest priority backend', () => {
      const backend = balancer.getNextBackend()
      expect(backend.url).toBe('http://host1:11434')
    })

    it('should skip unhealthy backends', () => {
      balancer.backends[0].healthy = false
      const backend = balancer.getNextBackend()
      expect(backend.url).toBe('http://host2:11434')
    })
  })
})
```

### Test Guidelines

1. **Single Responsibility**: Each test should verify one behavior
2. **Independent Tests**: Tests should not depend on each other
3. **Clear Names**: Test names should describe expected behavior
4. **Arrange-Act-Assert**: Follow AAA pattern
5. **Mock External Dependencies**: Use mocks for network calls

---

## Test Coverage Areas

### Configuration Tests

- Parse backend URLs
- Validate priority configuration
- Validate concurrency configuration
- Handle missing defaults

### Balancer Tests

- Backend selection by priority
- FIFO queue ordering
- Queue timeout handling
- Queue full rejection
- Concurrency count management
- Backend failure handling

### Health Check Tests

- Successful health check response
- Failed health check response
- Model extraction from response
- Recovery detection

### Backend Tests

- Capability detection
- API type detection
- Model list extraction
- Endpoint detection

---

## Mocking and Test Doubles

### Mock Backend

```javascript
const mockBackend = {
  url: 'http://mock:11434',
  healthy: true,
  priority: 100,
  maxConcurrency: 5,
  activeRequestCount: 0,
  getApiTypes: () => ['openai'],
  getModels: () => ['test-model']
}
```

### Mock Health Checker

```javascript
const mockHealthChecker = {
  check: jest.fn().mockResolvedValue(true),
  getEndpoint: () => '/api/tags'
}
```

---

## Common Test Patterns

### Test Priority Selection

```javascript
it('should select highest priority backend', () => {
  const highPriority = new Backend({ url: 'http://high:11434', priority: 100 })
  const lowPriority = new Backend({ url: 'http://low:11434', priority: 10 })

  const balancer = new Balancer({ backends: [highPriority, lowPriority] })
  const selected = balancer.getNextBackend()

  expect(selected.url).toBe('http://high:11434')
})
```

### Test Queue Processing

```javascript
it('should process queued requests in FIFO order', async () => {
  // Mark all backends as busy
  balancer.backends.forEach(b => {
    b.activeRequestCount = b.maxConcurrency
    b.healthy = true
  })

  // Queue multiple requests
  const promises = [
    balancer.queueRequest({}),
    balancer.queueRequest({}),
    balancer.queueRequest({})
  ]

  // Release one backend
  balancer.backends[0].activeRequestCount = 0
  balancer.notifyBackendAvailable(balancer.backends[0])

  // First request should get the released backend
  const first = await promises[0]
  expect(first.url).toBe('http://host1:11434')
})
```

### Test Concurrency Count

```javascript
it('should maintain correct activeRequestCount', async () => {
  const backend = balancer.backends[0]
  expect(backend.activeRequestCount).toBe(0)

  const backend1 = await balancer.queueRequest({})
  expect(backend1.activeRequestCount).toBe(1)

  const backend2 = await balancer.queueRequest({})
  expect(backend2.activeRequestCount).toBe(1)

  // Release backends
  releaseBackend(balancer, backend1)
  releaseBackend(balancer, backend2)

  expect(backend1.activeRequestCount).toBe(0)
  expect(backend2.activeRequestCount).toBe(0)
})
```

---

## Test Environment Setup

### Environment Variables

```bash
# For tests requiring specific config
export BACKENDS="http://host1:11434,http://host2:11434"
export LB_PORT=3001
export DEBUG=true
```

### Test Database

For integration tests that need persistent state, use an in-memory database or temporary files.

---

## Debugging Tests

### Enable Verbose Output

```bash
npm test -- --verbose
```

### Run Single Test

```bash
npm test -- -t "should select highest priority backend"
```

### Debug with Node Inspector

```bash
node --inspect node_modules/.bin/jest --testNamePattern="your test"
```

---

## Test Results

### Passing Tests

```
PASS tests/unit/balancer.test.js
  Balancer Class
    ✓ should select highest priority backend (5ms)
    ✓ should skip unhealthy backends (3ms)
    ✓ should queue request when no backend available (2ms)
    ✓ should process queued requests in FIFO order (4ms)

Test Suites: 1 passed, 1 total
Tests:       84 passed, 84 total
```

### Failing Tests

```
FAIL tests/unit/balancer.test.js
  Balancer Class
    ✓ should select highest priority backend (5ms)
    ✗ should maintain correct activeRequestCount (12ms)

  ● Balancer Class › should maintain correct activeRequestCount

    expect(received).toBe(expected)

    Expected: 0
    Received: 1

      245 |   releaseBackend(balancer, backend1)
      246 |
    > 247 |   expect(backend1.activeRequestCount).toBe(0)
          |                                       ^

```

---

## Test Coverage Report

```
Statement   | Branch  | Function  | Lines
---------------------------------------------
95.2%      | 92.1%   | 94.8%    | 96.1%
```

---

## Adding New Tests

### When Adding Features

1. Write tests first (TDD approach)
2. Implement feature to pass tests
3. Update documentation

### Test Checklist

- [ ] Unit test for new function
- [ ] Integration test for new feature
- [ ] Edge case tests
- [ ] Error handling tests
- [ ] Regression tests if fixing bugs

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md#system-architecture) - Architecture overview
- [Class Hierarchy](CLASSES.md#class-hierarchy) - Class documentation
- [Data Flow](DATA_FLOW.md#data-flow) - Request processing details
