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

### ModelMatcher Class

**File**: `llm-balancer/backend-selector.js`

**Purpose**: Provides flexible model name matching using regular expressions with priority-first evaluation across all backends. Enables routing based on pattern matching rather than exact string matches only.

**Key Features:**
- Parses comma-separated regex patterns preserving order of precedence
- Evaluates patterns globally across all healthy backends before moving to next pattern
- Returns first matched model with backend reference and pattern index
- Gracefully handles invalid regex patterns by skipping them
- Maintains backward compatibility with exact string matching

**Static Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `parseModelString()` | `modelString: string` | `string[]` | Split comma-separated patterns into ordered array |
| `findBestMatchAcrossBackends()` | `requestedModels: string\|string[], allBackends: Backend[]` | `{ matched, backend, actualModel, patternIndex }` | Find best matching model using priority-first regex evaluation |
| `matches()` | `requestList: string\|string[], backendList: string[]` | `boolean` | Check if any requested models match (exact or via regex) |

#### parseModelString(modelString)

Parses a comma-separated model string into an ordered array of patterns.

**Input Examples:**
```javascript
parseModelString('llama3,qwen2.5,mistral')
// Returns: ['llama3', 'qwen2.5', 'mistral']

parseModelString('^llama.*|^qwen.*,^mistral.*')
// Returns: ['^llama.*|^qwen.*', '^mistral.*']  // Alternation preserved within pattern

parseModelString(' llama3 , qwen2.5 ')
// Returns: ['llama3', 'qwen2.5']  // Whitespace trimmed
```

**Behavior:**
- Splits string by comma delimiter
- Trims whitespace from each pattern
- Filters out empty strings
- Preserves order (index = precedence level)
- Returns empty array for invalid input (null, undefined, empty string)

#### findBestMatchAcrossBackends(requestedModels, allBackends)

Core matching algorithm using priority-first evaluation.

**Parameters:**
- `requestedModels`: String or array of strings containing regex patterns
- `allBackends`: Array of backend objects with `.healthy`, `.getApiTypes()`, and `.getModels(apiType)` methods

**Return Value Structure:**
```javascript
{
  matched: boolean,      // true if any pattern matched any backend model
  backend: Backend|null, // The backend object that provided the match (null if no match)
  actualModel: string|null, // The actual model name from backend (null if no match)
  patternIndex: number   // Which pattern index matched (-1 if no match)
}
```

**Priority-First Algorithm:**
```javascript
static findBestMatchAcrossBackends(requestedModels, allBackends) {
  // 1. Normalize input to array of model strings
  const modelList = typeof requestedModels === 'string'
    ? [requestedModels]
    : Array.isArray(requestedModels)
      ? requestedModels
      : [requestedModels];

  if (modelList.length === 0 || !Array.isArray(allBackends)) {
    return { matched: false, backend: null, actualModel: null, patternIndex: -1 };
  }

  // 2. Flatten all patterns from all requested models in order
  const allPatterns = [];
  for (const model of modelList) {
    if (!model || typeof model !== 'string') continue;
    const patterns = this.parseModelString(model);
    allPatterns.push(...patterns);
  }

  // 3. Evaluate patterns in order (first = highest precedence)
  for (let patternIndex = 0; patternIndex < allPatterns.length; patternIndex++) {
    const pattern = allPatterns[patternIndex];

    try {
      const regex = new RegExp(pattern);

      // 4. Check ALL backends with this pattern before moving to next pattern
      for (const backend of allBackends) {
        if (!backend.healthy || !backend.getApiTypes || !backend.getModels) continue;

        const apiTypes = backend.getApiTypes();
        for (const apiType of apiTypes) {
          const backendModels = backend.getModels(apiType);

          // 5. Find first model on this backend matching the pattern
          for (const modelName of backendModels) {
            if (regex.test(modelName)) {
              return {
                matched: true,
                backend,
                actualModel: modelName,
                patternIndex
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Invalid regex pattern "${pattern}":`, e.message);
      continue; // Skip invalid patterns, try next
    }
  }

  return { matched: false, backend: null, actualModel: null, patternIndex: -1 };
}
```

**Key Behavior:**
- **Pattern order overrides backend priority**: If pattern 0 matches any backend, it wins even if a later-pattern-matching backend has higher priority
- **Global evaluation**: All backends are checked against each pattern before moving to the next pattern
- **First match wins**: Returns immediately when first model matching current pattern is found
- **Health filtering**: Only healthy backends with valid methods are considered
- **Graceful error handling**: Invalid regex patterns are logged and skipped

**Example Usage:**
```javascript
const backends = [
  { url: 'http://backend1:11434', healthy: true, priority: 5, getApiTypes: () => ['openai'], getModels: (t) => ['qwen2.5'] },
  { url: 'http://backend2:11434', healthy: true, priority: 10, getApiTypes: () => ['openai'], getModels: (t) => ['llama-3-8b'] }
];

// Request llama first, but qwen backend has higher priority
const result = ModelMatcher.findBestMatchAcrossBackends('llama-.*', backends);
// Returns: { matched: true, backend: <backend2>, actualModel: 'llama-3-8b', patternIndex: 0 }
// Note: llama matched despite qwen backend having higher priority (pattern order wins)

// No match scenario
const result2 = ModelMatcher.findBestMatchAcrossBackends('nonexistent.*', backends);
// Returns: { matched: false, backend: null, actualModel: null, patternIndex: -1 }
```

#### matches(requestList, backendList)

Checks if any requested models match any backend model. Used for quick boolean matching without detailed result.

**Parameters:**
- `requestList`: String or array of request strings (exact names or patterns)
- `backendList`: Array of model names available on the backend

**Returns:** `boolean` - true if at least one requested model matches at least one backend model

**Behavior:**
- For each requested model, checks if it exists in the backend's model list
- Uses exact string matching (backward compatible)
- Returns true if ANY match found, false otherwise

#### Integration with BackendSelector

The `ModelMatcher` class is used by `BackendSelector.selectBackend()` when model filtering is required:

```javascript
// In BackendSelector.selectBackend()
if (options.models) {
  return this._selectBackendByPriorityFirst(candidates, options.models);
}

// _selectBackendByPriorityFirst uses ModelMatcher.findBestMatchAcrossBackends()
static async _selectBackendByPriorityFirst(backends, models) {
  const allPatterns = [];
  for (const model of Array.isArray(models) ? models : [models]) {
    allPatterns.push(...this.parseModelString(model));
  }

  // For each pattern in order...
  for (const pattern of allPatterns) {
    const match = ModelMatcher.findBestMatchAcrossBackends(pattern, backends);
    if (match.matched) {
      return this._getHighestPriorityBackendMatchingPattern(backends, pattern);
    }
  }

  return null;
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
