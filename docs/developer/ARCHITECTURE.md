# System Architecture

This document describes the system architecture, design patterns, and component interactions.

---

## Overview

The LLM Balancer is built using a modular, interface-based architecture that emphasizes:

- **Separation of Concerns**: Each component has a single, well-defined responsibility
- **Interface-Based Design**: Components interact through abstract interfaces
- **Delegation Pattern**: Backend class delegates health checking to specialized handlers
- **Composability**: Components can be combined and extended easily

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Balancer (Port 3001)                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    API Server (index.js)                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐  │  │
│  │  │ Route Router│ │ Error Handler│ │ Middleware (CORS, Body)     │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  │                                                                       │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  │   Balancer      │◄───│  BackendPool  │    │  Backend        │  │
│  │  │   (balancer.js) │    │(backend-pool) │    │  (Backend.js)   │  │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│  │         │                     │                     │                │
│  │         │                     │                     │                │
│  │         ▼                     ▼                     ▼                │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  │   Request       │    │  BackendInfo    │    │  API-Specific   │  │
│  │  │   Processor     │    │  (capability    │    │  Health         │  │
│  │  │ (request-       │    │   detector)     │    │  Checkers       │  │
│  │  │  processor.js)  │    │                 │    │  (IHealthCheck) │  │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Backend Servers                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ Backend 1       │  │ Backend 2       │  │ Backend 3       │         │
│  │ (OpenAI API)    │  │ (Anthropic API) │  │ (Ollama API)    │         │
│  │ http://host1:   │  │ http://host2:   │  │ http://host3:   │         │
│  │ 11434           │  │ 11434           │  │ 11434           │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

### BackendPool vs BackendSelector Distinction

| Aspect | BackendPool | BackendSelector |
|--------|-------------|-----------------|
| **Responsibility** | Owns the backend collection (source of truth) | Selects the best backend from a list |
| **Returns** | New `BackendPool` instance (filtered collection) | Single `Backend` object (or null) |
| **State** | Stateful (`this._backends`) | Stateless (takes backends as parameter) |
| **Interface** | `filter(criteria)` - unified criteria object | `selectBackend(backends, options)` |
| **Pattern** | Collection pattern (filtered views) | Strategy pattern (selection algorithms) |

**Example Usage:**
```javascript
// BackendPool owns and filters backends
const pool = new BackendPool(backends);
const filteredPool = pool.filter({ healthy: true, models: ['llama3'] });

// BackendSelector picks best backend from filtered list
const candidates = filteredPool.getAll();
const bestBackend = selector.selectBackend(candidates, { models: ['llama3'] });
```

---

## Core Components

### 1. Configuration Module

**File**: `llm-balancer/config.js`

**Responsibilities**:
- Parse environment variables
- Validate configuration values
- Create backend objects with initial state
- Load priority and concurrency settings

**Key Functions**:
```javascript
parseBackendUrls(urls) -> BackendInfo[]
loadConfig() -> ConfigObject
```

---

### 2. BackendPool Class

**File**: `llm-balancer/backend-pool.js`

**Responsibilities**:
- Own the backend collection (source of truth)
- Provide unified filtering interface
- Support immutable filter chaining
- Track pool statistics

**Properties**:
```javascript
{
  _backends: Backend[]  // Private collection (source of truth)
}
```

**Key Methods**:
```javascript
filter(criteria) -> BackendPool  // Returns new filtered pool
healthy() -> BackendPool         // Filter by health
available() -> BackendPool       // Filter by availability
byModel(models) -> BackendPool   // Filter by models
healthyAndAvailable() -> BackendPool  // Combined filter
getAll() -> Backend[]            // Return all backends
some(criteria) -> boolean        // Check if any match
getStats() -> Object             // Pool statistics
add(backend) -> void             // Add backend dynamically
remove(url) -> void              // Remove backend
getByUrl(url) -> Backend         // Find backend by URL
```

**Filter Criteria Object:**
```javascript
{
  healthy: boolean,              // true = only healthy, false = only unhealthy, undefined = any
  available: boolean,            // true = has capacity, false = at max, undefined = any
  models: string[],              // Filter backends supporting these models
  custom: function(backend)      // Custom filter function
}
```

**Usage Examples:**
```javascript
// Simple filters
const healthyPool = pool.filter({ healthy: true });
const availablePool = pool.filter({ available: true });
const modelPool = pool.filter({ models: ['llama3', 'qwen'] });

// Chaining (immutable pattern)
const result = pool
  .filter({ healthy: true })
  .filter({ available: true })
  .filter({ models: ['llama3'] });

// Convenience methods
const healthyAndAvailable = pool.healthyAndAvailable();
const llamaBackends = pool.byModel('llama3');

// Statistics
const stats = pool.getStats();  // { totalBackends, healthyBackends, availableBackends, ... }
```

---

### 3. BackendSelector Class

**File**: `llm-balancer/backend-selector.js`

**Responsibilities**:
- Select the best backend from a list
- Implement priority-based selection algorithm
- Model matching using regex patterns (priority-first matching)
- Health and availability filtering
- Prompt cache hit detection and selection
- Model support validation (distinguishes "busy" from "none")

**Key Methods:**
```javascript
selectBackend(backends, options) -> Backend|null  // Select best backend
getAvailableBackends(backends) -> Backend[]       // Get sorted available backends
hasAvailableBackend(backends, models) -> boolean  // Check if any backend available
hasBackendForModel(backends, models) -> boolean   // Check model support (regardless of availability)
getModelAvailabilityStats(backends) -> Object     // Get model availability stats
selectBackendWithCache(backends, criterion, promptBody) -> ResultObject
```

**Selection Algorithm:**
1. Filter healthy, available backends
2. Sort by priority (descending)
3. Select first available backend
4. If none available, queue request

**selectBackendWithCache() Return Object:**

Returns a status-based result object:

```javascript
{
  status: 'found' | 'busy' | 'none',
  backend: Backend|null,
  actualModel: string|null,
  message: string|null
}
```

**Status Values:**

| Status | Meaning | Queue Behavior |
|--------|---------|----------------|
| `'found'` | Backend found and available | Process immediately |
| `'busy'` | Backend exists for model but all are currently busy | Stay in queue |
| `'none'` | No backend supports this model at all | Reject immediately (queue depth = 0) |

**Example Usage:**

```javascript
const result = selector.selectBackendWithCache(backends, criterion, promptBody);

if (result.status === 'found') {
  // Backend available - process the request
  processRequest(request, result.backend);
} else if (result.status === 'busy') {
  // Backend exists but all busy - stay in queue
  queueRequest(request);
} else if (result.status === 'none') {
  // No backend supports model - reject immediately
  reject(request, new Error(result.message));
}
```

---

### 4. Balancer Class

**File**: `llm-balancer/balancer.js`

**Responsibilities**:
- Priority-based backend selection (delegates to BackendSelector)
- Request queue management
- Backend availability notifications
- Statistics tracking

**Properties:**
```javascript
{
  backendPool: BackendPool,     // Owns backends
  selector: BackendSelector,    // Selection strategy
  queue: Array<QueuedRequest>,  // Pending requests
  maxQueueSize: number,         // Maximum queue size
  queueTimeout: number,         // Queue timeout (ms)
  requestCounts: Map           // Requests per backend
}
```

**Key Methods:**
```javascript
queueRequest(req) -> Promise<Backend>
getNextBackend() -> Backend|null
notifyBackendAvailable(backend) -> void
markFailed(backendUrl) -> void
markHealthy(backendUrl) -> void
getStats() -> BalancerStats
```

---

### 5. Backend Class

**File**: `llm-balancer/backends/Backend.js`

**Responsibilities**:
- Encapsulate backend state and configuration
- Provide capability information
- Delegate health checking

**Properties**:
```javascript
{
  url: string,
  maxConcurrency: number,
  healthy: boolean,
  busy: boolean,
  backendInfo: BackendInfo,
  healthChecker: IHealthCheck
}
```

**Key Methods**:
```javascript
checkHealth() -> Promise<boolean>
getApiTypes() -> string[]
getModels(apiType) -> string[]
getEndpoint(apiType) -> string
supportsApi(apiType) -> boolean
```

---

### 6. BackendInfo Class

**File**: `llm-balancer/backends/BackendInfo.js`

**Responsibilities**:
- Detect API capabilities of backends
- Discover available models
- Track endpoint information

**Detection Order**:
1. OpenAI-compatible (`/v1/models`)
2. Anthropic (`/v1/messages`)
3. Google Gemini (`/v1beta/models`)
4. Ollama (`/api/tags`)

---

### 5. Health Checker

**File**: `llm-balancer/health-check.js`

**Responsibilities**:
- Periodic health monitoring
- Failure detection
- Recovery tracking

**Key Methods**:
```javascript
start() -> void
stop() -> void
checkBackend(backend) -> Promise<boolean>
getStats() -> HealthStats
```

---

### 6. Request Processor

**File**: `llm-balancer/request-processor.js`

**Responsibilities**:
- Forward requests to backends
- Handle streaming responses
- Manage active request counting
- Filter hop-by-hop headers

**Key Functions**:
```javascript
forwardRequest(balancer, backend, req, res) -> void
processRequest(balancer, backend, req, res) -> void
releaseBackend(balancer, backend) -> void
```

---

### 7. API Server

**File**: `llm-balancer/index.js`

**Responsibilities**:
- Expose HTTP endpoints
- Route requests to balancer
- Handle errors and responses
- Manage graceful shutdown

**Endpoints**:
- `/v1/messages*` - Anthropic API
- `/api/*` - Ollama API
- `/models*` - Model list
- `/health` - Health status
- `/stats` - System statistics
- `/backends` - Backend list
- `/debug/*` - Debug endpoints

---

## Interface-Based Design

### IHealthCheck Interface

```javascript
interface IHealthCheck {
  check(backend: Backend): Promise<boolean>
  getEndpoint(): string
}
```

**Implementations**:
- `OllamaHealthCheck` - Checks `/api/tags`
- `OpenAIHealthCheck` - Checks `/v1/models`
- `AnthropicHealthCheck` - Checks `/v1/messages`
- `GoogleHealthCheck` - Checks `/v1beta/models`

### IModelList Interface

```javascript
interface IModelList {
  getModels(apiType: string): string[]
  getEndpoint(apiType: string): string
}
```

---

## Design Patterns

### Delegation Pattern

The Backend class delegates health checking to specialized handlers:

```
Backend.checkHealth()
    └─> healthChecker.check(this)
        └─> Specific API health check
```

**Benefits**:
- Separation of concerns
- Easy to add new API types
- Backend doesn't need to know health check details

### Factory Pattern

Health checkers are created based on primary API type:

```javascript
function createHealthChecker(apiType) {
  switch (apiType) {
    case 'ollama': return new OllamaHealthCheck()
    case 'openai': return new OpenAIHealthCheck()
    case 'anthropic': return new AnthropicHealthCheck()
    case 'google': return new GoogleHealthCheck()
  }
}
```

### Strategy Pattern

Different load balancing strategies can be implemented:

```javascript
interface LoadBalancingStrategy {
  selectBackend(backends: Backend[]): Backend
}

class PriorityStrategy implements LoadBalancingStrategy {
  selectBackend(backends) {
    // Priority-based selection
  }
}

class RoundRobinStrategy implements LoadBalancingStrategy {
  selectBackend(backends) {
    // Round-robin selection
  }
}
```

---

## Data Flow

### Request Processing Flow

```
1. Client Request
   └─> API Server (index.js)
       └─> Route Router
           └─> Balancer.queueRequest()
               ├─> If queue empty + backend available
               │   └─> Return backend immediately
               └─> If queue full or no backend
                   └─> Queue request + return Promise
                       └─> When backend available
                           └─> Resolve Promise with backend
                               └─> Request Processor.forwardRequest()
                                   └─> HTTP request to backend
                                       └─> Response to client
```

### Health Check Flow

```
1. Health Checker Timer
   └─> For each backend
       └─> healthChecker.check(backend)
           └─> HTTP request to API endpoint
               ├─> Success (2xx)
               │   └─> Mark healthy, update models
               └─> Failure (timeout/error)
                   └─> Mark unhealthy, increment failCount
                       └─> balancer.markFailed()
```

---

## State Management

### Backend State Machine

```
         ┌─────────┐
         │ Healthy │
         └────┬────┘
              │ health check fails
              ▼
         ┌──────────┐
         │ Unhealthy│◄──────┐
         └────┬─────┘       │
              │ health       │ health check succeeds
              │ check        │
              ▼              │
         ┌─────────┐        │
         │ Recovered│───────┘
         └─────────┘
```

### Queue State

```
┌─────────────────────────────────────────────────┐
│ Queue                                           │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ Request │ │ Request │ │ Request │ ...        │
│ │   1     │ │   2     │ │   3     │            │
│ └────┬────┘ └────┬────┘ └────┬────┘            │
│      │           │           │                  │
│      ▼           ▼           ▼                  │
│  ┌─────────────────────────────────────┐       │
│  │ Backend Available → Process Queue   │       │
│  └─────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

---

## Concurrency Model

### Active Request Counting

```javascript
// Request starts
backend.activeRequestCount++

// Request completes
backend.activeRequestCount--

// Check availability
if (backend.activeRequestCount < backend.maxConcurrency) {
  // Can accept new request
}
```

### Queue Processing

```javascript
// When backend becomes available
function notifyBackendAvailable(backend) {
  while (queue.length > 0) {
    const nextBackend = getNextBackend()
    if (!nextBackend) break

    const queuedRequest = queue.shift()
    queuedRequest.resolve(nextBackend)
  }
}
```

---

## Error Handling

### Error Hierarchy

```
Error
├─> BalancerError
│   ├─> QueueFullError
│   ├─> NoHealthyBackendsError
│   └─> TimeoutError
├─> BackendError
│   ├─> ConnectionError
│   ├─> TimeoutError
│   └─> HTTPError
└─> ConfigurationError
```

### Error Propagation

```
Client Request
    └─> API Server
        ├─> ConfigurationError → 500
        ├─> NoHealthyBackendsError → 503
        ├─> QueueFullError → 503
        └─> BackendError → 502
```

---

## Scalability Considerations

### Horizontal Scaling

The balancer itself is stateless and can be scaled horizontally:
- Use shared queue (Redis) for multiple balancer instances
- Use consistent hashing for backend assignment

### Backend Scaling

Add more backends without downtime:
- Update `BACKENDS` environment variable
- Restart balancer (graceful shutdown handles in-flight requests)

### Performance Optimization

- Reduce health check frequency for large deployments
- Disable debug mode in production
- Use connection pooling for backend requests

---

## Security Considerations

### Current Security Model

- No authentication required
- CORS enabled for all origins
- Payload size limits configured

### Production Recommendations

- Use reverse proxy with authentication
- Restrict access via firewall
- Enable debug mode only for troubleshooting
- Use HTTPS in production

---

## Future Architecture Enhancements

### Planned Features

1. **Circuit Breaker Pattern**: Prevent cascading failures
2. **Metrics Export**: Prometheus metrics endpoint
3. **Config Reload**: Dynamic configuration without restart
4. **Rate Limiting**: Per-client rate limiting
5. **Request Priority**: Priority-based request queuing

### Potential Refactorings

1. **Plugin System**: Extensible health checkers
2. **Event Bus**: Decoupled component communication
3. **Configuration Schema**: JSON Schema validation

---

## Related Documentation

- [Class Hierarchy](CLASSES.md) - Detailed class documentation
- [Data Flow](DATA_FLOW.md) - Request processing details
- [Testing Guide](TESTING.md) - Testing architecture
- [Debugging Guide](DEBUGGING.md) - Debug features
