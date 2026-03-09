# Class Hierarchy

This document describes the class structure, interfaces, and data structures.

---

## Class Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core Classes                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Backend    │    │   Balancer   │    │  BackendInfo │              │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘              │
│         │                   │                   │                       │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ IHealthCheck │    │ IModelList   │    │ HealthChecker│              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Classes

### Backend Class

**File**: `llm-balancer/backends/Backend.js`

**Purpose**: Encapsulates all backend functionality including state, capability information, and health checking.

**Properties**:
```javascript
{
  // Core properties
  url: string,              // Backend server URL
  maxConcurrency: number,   // Maximum concurrent requests
  healthy: boolean,         // Current health status
  busy: boolean,            // Whether handling active requests

  // Capability information
  backendInfo: BackendInfo, // API detection results

  // Health checking
  healthChecker: IHealthCheck // Assigned based on primary API
}
```

**Methods**:
| Method | Returns | Description |
|--------|---------|-------------|
| `checkHealth()` | `Promise<boolean>` | Check health via delegated health checker |
| `getApiTypes()` | `string[]` | Return supported API types |
| `getModels(apiType)` | `string[]` | Return models for API type |
| `getEndpoint(apiType)` | `string` | Return endpoint for API type |
| `supportsApi(apiType)` | `boolean` | Check if API is supported |
| `getUtilization()` | `number` | Return utilization percentage |

**Example**:
```javascript
const backend = new Backend({
  url: 'http://host1:11434',
  maxConcurrency: 5,
  priority: 100
});

await backend.checkHealth();
console.log(backend.getApiTypes()); // ['openai', 'ollama']
console.log(backend.getModels('openai')); // ['llama2', 'mistral']
```

---

### BackendInfo Class

**File**: `llm-balancer/backends/BackendInfo.js`

**Purpose**: Collects and stores capability detection results for a backend.

**Properties**:
```javascript
{
  url: string,                      // Backend URL
  healthy: boolean,                 // Health status
  apis: Object,                     // API capabilities by type
  models: Object,                   // Models by API type
  endpoints: Object,                // Endpoints by API type
  detectedAt: string                // Detection timestamp
}
```

**API Capabilities Structure**:
```javascript
apis: {
  openai: {
    supported: boolean,
    modelListEndpoint: string|null,
    chatEndpoint: string,
    models: string[]
  },
  anthropic: {
    supported: boolean,
    modelListEndpoint: null,
    chatEndpoint: string,
    models: string[]
  },
  ollama: {
    supported: boolean,
    modelListEndpoint: string,
    chatEndpoint: string,
    models: string[]
  }
}
```

**Methods**:
| Method | Returns | Description |
|--------|---------|-------------|
| `getInfo(url)` | `Promise<BackendInfo>` | Collect info for single backend |
| `getInfoAll(urls)` | `Promise<Object>` | Collect info for multiple backends |
| `probe(url, probeConfig)` | `Promise<Object>` | Execute single probe |
| `extractModels(body, jsonPath)` | `string[]` | Extract models from response |
| `getChatEndpoint(apiType)` | `string` | Get chat endpoint |

**Probe Configuration**:
```javascript
{
  apiType: 'openai',
  endpoint: '/v1/models',
  method: 'GET',
  jsonPath: 'data',
  hasModels: true
}
```

---

### Balancer Class

**File**: `llm-balancer/balancer.js`

**Purpose**: Manages request routing, queueing, and backend selection.

**Properties**:
```javascript
{
  backends: Backend[],              // Configured backends
  queue: Array<QueuedRequest>,      // Pending requests
  maxQueueSize: number,             // Maximum queue size
  queueTimeout: number,             // Queue timeout (ms)
  requestCounts: Map<string, number> // Requests per backend
}
```

**QueuedRequest Structure**:
```javascript
{
  resolve: Function,                // Promise resolve
  reject: Function,                 // Promise reject
  timestamp: number,                // Queue timestamp
  timeoutId: number|null            // Timeout ID
}
```

**Methods**:
| Method | Returns | Description |
|--------|---------|-------------|
| `queueRequest(req)` | `Promise<Backend>` | Queue or assign backend |
| `getNextBackend()` | `Backend|null` | Get next available backend |
| `notifyBackendAvailable(backend)` | `void` | Process queued requests |
| `markFailed(backendUrl)` | `void` | Mark backend as failed |
| `markHealthy(backendUrl)` | `void` | Mark backend as healthy |
| `getStats()` | `BalancerStats` | Get balancer statistics |
| `getAllQueueStats()` | `QueueStats` | Get queue statistics |
| `getQueueStatsByPriority()` | `Object` | Get per-priority queue stats |

**Selection Algorithm**:
```javascript
function selectBackend() {
  // 1. Filter healthy, available backends
  const available = backends.filter(b => b.healthy && !b.overloaded)

  // 2. Sort by priority (descending)
  available.sort((a, b) => b.priority - a.priority)

  // 3. Select first available
  return available.length > 0 ? available[0] : null
}
```

---

## Interface Classes

### IHealthCheck Interface

**File**: `llm-balancer/interfaces/IHealthCheck.js`

**Purpose**: Defines the contract for health check implementations.

**Methods**:
```javascript
interface IHealthCheck {
  /**
   * Check health of a backend
   * @param {Backend} backend - Backend to check
   * @returns {Promise<boolean>} - Health status
   */
  check(backend: Backend): Promise<boolean>

  /**
   * Get the API endpoint for health checks
   * @returns {string} - Endpoint path
   */
  getEndpoint(): string
}
```

**Implementations**:
- `OllamaHealthCheck` - Checks `/api/tags`
- `OpenAIHealthCheck` - Checks `/v1/models`
- `AnthropicHealthCheck` - Checks `/v1/messages`
- `GoogleHealthCheck` - Checks `/v1beta/models`

---

### IModelList Interface

**File**: `llm-balancer/interfaces/IModelList.js`

**Purpose**: Defines the contract for model list providers.

**Methods**:
```javascript
interface IModelList {
  /**
   * Get models for an API type
   * @param {string} apiType - API type identifier
   * @returns {string[]} - Array of model names
   */
  getModels(apiType: string): string[]

  /**
   * Get endpoint for an API type
   * @param {string} apiType - API type identifier
   * @returns {string} - Endpoint path
   */
  getEndpoint(apiType: string): string
}
```

---

## Health Check Implementations

### OllamaHealthCheck

**File**: `llm-balancer/interfaces/implementations/OllamaHealthCheck.js`

**Endpoint**: `/api/tags`

**Response Validation**:
```javascript
{
  models: [
    {
      name: string,
      model: string,
      modified_at: string,
      size: number,
      digest: string
    }
  ]
}
```

---

### OpenAIHealthCheck

**File**: `llm-balancer/interfaces/implementations/OpenAIHealthCheck.js`

**Endpoint**: `/v1/models`

**Response Validation**:
```javascript
{
  data: [
    {
      id: string,
      object: string,
      owned_by: string
    }
  ]
}
```

---

### AnthropicHealthCheck

**File**: `llm-balancer/interfaces/implementations/AnthropicHealthCheck.js`

**Endpoint**: `/v1/messages`

**Response Validation**:
- Returns 400 (validation error) = API supported
- Returns 401/403 = API supported (auth required)
- Returns 404 = API not supported

---

### GoogleHealthCheck

**File**: `llm-balancer/interfaces/implementations/GoogleHealthCheck.js`

**Endpoint**: `/v1beta/models`

**Response Validation**:
```javascript
{
  models: [
    {
      name: string,
      displayName: string,
      description: string
    }
  ]
}
```

---

## Data Structures

### BalancerStats

```javascript
{
  totalBackends: number,
  healthyBackends: number,
  unhealthyBackends: number,
  backends: Array<{
    url: string,
    healthy: boolean,
    failCount: number,
    requestCount: number,
    errorCount: number,
    models: string[]
  }>,
  requestCounts: {
    [url: string]: number,
    queued: number
  }
}
```

### QueueStats

```javascript
{
  maxQueueSize: number,
  queueTimeout: number,
  queues: {
    [priority: string]: {
      depth: number,
      oldestRequestAge: number,
      isFull: boolean
    }
  }
}
```

### HealthStats

```javascript
{
  totalBackends: number,
  healthyBackends: number,
  unhealthyBackends: number,
  interval: number,
  timeout: number
}
```

---

## Configuration Objects

### ConfigObject

```javascript
{
  backends: Array<{
    url: string,
    priority: number,
    maxConcurrency: number
  }>,
  lbPort: number,
  healthCheckInterval: number,
  healthCheckTimeout: number,
  maxRetries: number,
  maxPayloadSize: number,
  maxQueueSize: number,
  queueTimeout: number,
  shutdownTimeout: number,
  debug: boolean
}
```

---

## Request/Response Objects

### DebugRequest

```javascript
{
  id: number,
  timestamp: number,
  route: string,
  method: string,
  priority: number,
  backendId: string,
  backendUrl: string,
  requestContent: Object|null,
  responseContent: Object|null
}
```

### HealthResponse

```javascript
{
  status: string,
  timestamp: string,
  port: number,
  maxPayloadSize: number,
  maxPayloadSizeMB: number,
  healthyBackends: number,
  totalBackends: number,
  hasHealthyBackends: boolean,
  busyBackends: number,
  idleBackends: number,
  overloadedBackends: number,
  availableBackends: number,
  backends: Array<BackendHealth>
}
```

---

## Error Classes

### BalancerError

```javascript
class BalancerError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}
```

### QueueFullError

```javascript
class QueueFullError extends BalancerError {
  constructor() {
    super('Queue is full', 'QUEUE_FULL')
  }
}
```

### NoHealthyBackendsError

```javascript
class NoHealthyBackendsError extends BalancerError {
  constructor() {
    super('No healthy backends available', 'NO_HEALTHY_BACKENDS')
  }
}
```

---

## Module Exports

### Backend Module

```javascript
module.exports = {
  Backend,
  BackendInfo
}
```

### Interfaces Module

```javascript
module.exports = {
  IHealthCheck,
  IModelList,
  OllamaHealthCheck,
  OpenAIHealthCheck,
  AnthropicHealthCheck,
  GoogleHealthCheck
}
```

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - High-level architecture
- [Data Flow](DATA_FLOW.md) - Request processing details
- [Testing Guide](TESTING.md) - Testing classes and interfaces
