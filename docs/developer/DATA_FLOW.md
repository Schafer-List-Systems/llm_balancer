# Data Flow

This document describes the request flow, data processing workflow, and state transitions.

---

## Overview

The LLM Balancer processes requests through several stages:

1. **Request Reception** - API server receives HTTP request
2. **Route Classification** - Determine if request should be queued
3. **Backend Selection** - Select appropriate backend
4. **Request Forwarding** - Forward request to backend
5. **Response Handling** - Return response to client

---

## System Architecture Overview

```mermaid
flowchart TB
    subgraph ExternalClients["External Clients"]
        Client["Client Application<br/>(LLM Request)"]
    end

    subgraph LB["LLM Balancer Gateway"]
        Express["Express Middleware<br/>JSON/Body Parsing"]

        subgraph Routes["API Routes"]
            Chat["/v1/chat/completions*"]
            Messages["/v1/messages*"]
            Ollama["/api/*"]
            Models["/models*"]
        end

        subgraph Core["Core Components"]
            Balancer["Balancer<br/>(FIFO Queuing)"]
            BackendSelector["BackendSelector<br/>(Selection Logic)"]
            BackendPool["BackendPool<br/>(Data Ownership)"]
        end
    end

    subgraph Backends["Backend Collection"]
        Backend1["Backend 1<br/>(Priority 1)"]
        Backend2["Backend 2<br/>(Priority 2)"]
        Backend3["Backend 3<br/>(Priority 3)"]
    end

    subgraph Health["Health Monitoring"]
        HealthChecker["HealthChecker<br/>(Periodic Checks)"]
        BackendInfo["BackendInfo<br/>(Capability Detection)"]
    end

    Client -->|HTTP Request| Express
    Express --> Routes
    Routes --> Balancer
    Balancer --> BackendSelector
    BackendSelector --> BackendPool
    BackendPool --> Backend1
    BackendPool --> Backend2
    BackendPool --> Backend3

    Backend1 <-->|Proxy Request| Backend2
    Backend2 <-->|Proxy Request| Backend3
    Backend3 <-->|Proxy Request| Backend1

    HealthChecker --> Backend1
    HealthChecker --> Backend2
    HealthChecker --> Backend3

    BackendInfo -.->|Startup Discovery| Backend1
    BackendInfo -.->|Startup Discovery| Backend2
    BackendInfo -.->|Startup Discovery| Backend3

    style Balancer fill:#e1f5fe
    style BackendSelector fill:#e1f5fe
    style BackendPool fill:#e8f5e9
    style HealthChecker fill:#fff3e0
    style BackendInfo fill:#fff3e0
    style Backend1 fill:#f3e5f5
    style Backend2 fill:#f3e5f5
    style Backend3 fill:#f3e5f5
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

## Startup Phase Flow

```mermaid
sequenceDiagram
    participant Main as main.js
    participant Config as config.js
    participant BackendInfo as BackendInfo
    participant Backend as Backend
    participant HealthChecker as HealthChecker
    participant BackendPool as BackendPool

    Note over Main,Config: Phase 1: Configuration Loading
    Main->>Config: loadConfig()
    Config-->>Main: config object with backend URLs

    Note over Main,Backend: Phase 2: Backend Initialization
    Main->>Main: Create Backend instances from config
    Main->>Backend: new Backend(url, maxConcurrency)

    Note over Main,BackendInfo: Phase 3: Capability Detection
    Main->>BackendInfo: getInfoAll(urls)

    par Parallel Detection for each Backend
        BackendInfo->>BackendInfo: Probe /api/tags (Ollama)
        BackendInfo->>BackendInfo: Probe /v1/models (OpenAI)
        BackendInfo->>BackendInfo: Probe /v1beta/models (Google)
        BackendInfo->>BackendInfo: Probe /v1/messages (Anthropic)
    end

    BackendInfo-->>Main: backendInfoMap with API types & models
    Main->>Backend: backend.backendInfo = backendInfoMap[url]

    Note over Main,Backend: Phase 4: Health Checker Assignment
    Main->>Backend: Get primary API type
    Main->>Backend: Assign API-specific health checker
    Backend->>Backend: backend.healthChecker = <API-specific checker>

    Note over Main,BackendPool: Phase 5: Pool Initialization
    Main->>BackendPool: new BackendPool(backends)
    BackendPool-->>Main: pool with all backends

    Note over Main,HealthChecker: Phase 6: Start Health Checking
    Main->>HealthChecker: healthChecker.start()
    HealthChecker->>HealthChecker: checkAll() (immediate)
    HealthChecker->>HealthChecker: Interval-based checks

    Note over Backend: Each Backend now contains
    Note over Backend: - url, priority, maxConcurrency
    Note over Backend: - healthChecker (delegated)
    Note over Backend: - backendInfo (discovery data)
```

---

## Detailed Request Flow

### Request Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant Routes
    participant Balancer
    participant BackendSelector
    participant BackendPool
    participant Backend
    participant RequestProcessor
    participant RequestQueue

    Client->>Routes: HTTP POST /v1/chat/completions
    Routes->>Balancer: extractModelsFromRequest()

    Note over Balancer,BackendPool: Backend Selection

    Balancer->>BackendPool: getAll()
    BackendPool-->>Balancer: all backends

    Balancer->>BackendSelector: selectBackend(backends, {models})
    BackendSelector->>BackendSelector: _filterByHealthAndAvailability()
    BackendSelector->>BackendSelector: ModelMatcher.findBestMatchAcrossBackends()
    BackendSelector-->>Balancer: backend + matchedModel

    alt Backend Available Immediately
        Balancer-->>Routes: backend (direct assignment)
    else No Backend Available
        Balancer->>RequestQueue: queueRequestWithRequestData()
        Balancer-->>Routes: backend (after queue processing)
    end

    Routes->>RequestProcessor: forwardRequest(req, res, backend, matchedModel)
    RequestProcessor->>RequestProcessor: processRequest()

    Note over RequestProcessor: Increment activeRequestCount

    RequestProcessor->>Backend: activeRequestCount++
    RequestProcessor->>Backend: requestCount++

    RequestProcessor->>RequestProcessor: Prepare proxy request
    Note over RequestProcessor: - Replace model field if matchedModel
    Note over RequestProcessor: - Remove hop-by-hop headers

    alt isStreaming == true
        RequestProcessor->>Backend: http.request()
        Backend-->>RequestProcessor: stream response chunks
        RequestProcessor->>RequestProcessor: Parse streaming stats
        RequestProcessor->>RequestProcessor: extractTokenCounts from chunks
    else isStreaming == false
        RequestProcessor->>Backend: http.request()
        Backend-->>RequestProcessor: full response
        RequestProcessor->>RequestProcessor: extractTokenCounts from response
    end

    RequestProcessor->>RequestProcessor: Update backend performance stats
    RequestProcessor->>Backend: updateStreamingStats() or updateNonStreamingStats()

    RequestProcessor->>Backend: cachePrompt()  // Cache for KV reuse
    RequestProcessor->>Backend: releaseBackend()
    Backend->>RequestProcessor: activeRequestCount--

    RequestProcessor->>Balancer: notifyBackendAvailable() if available

    Balancer->>Balancer: processQueueWhenBackendAvailable()
    Balancer->>Balancer: Forward next queued request if any

    RequestProcessor-->>Client: Final response
```

### Queue Processing with Selection Criteria

When requests are queued, each request is assigned a **selection criterion** object that captures what backends can serve it:

```javascript
{
  modelString: 'llama3',     // The matched model
  apiType: 'openai'          // The primary API type
}
```

The criterion is created when the request arrives and stored with the queued request.

When a backend becomes available, `processQueueWhenBackendAvailable()` iterates through the queue:
1. Checks each request's criterion
2. Uses `findBackendForCriterion()` to find a matching backend
3. **Skips requests** where no backend matches the criterion
4. **Processes requests** where a suitable backend exists

This allows requests to be processed out of FIFO order when earlier requests have no suitable backends.

**Example Scenario:**
```
Queue: [Request ModelA, Request ModelB]
Backend1: Has ModelA, busy
Backend2: Has ModelB, available

Result: Request ModelB is processed on Backend2
        Request ModelA remains queued until Backend1 is free
```

---

### Criterion-Based Backend Selection

The `findBackendForCriterion()` method uses BackendPool filtering:

```javascript
// Criterion-based selection flow
function findBackendForCriterion(criterion) {
  // Step 1: Get healthy backends
  let candidates = backendPool.filter({ healthy: true }).getAll()

  // Step 2: Filter by API type if specified
  if (criterion.apiType) {
    candidates = candidates.filter(b => b.supportsApi(criterion.apiType))
  }

  // Step 3: Match models using regex
  if (criterion.modelString) {
    const result = ModelMatcher.findBestMatchAcrossBackends(
      criterion.modelString, candidates
    )
    return result.backend || null
  }

  // Step 4: Fallback to priority selection
  return selectBackend(candidates)
}
```

---

### Backend Selection Algorithm

The backend selection follows these steps:

1. **Filter by Health and Availability**: Only healthy backends with available concurrency are considered
2. **Model Matching**: If models are specified, use priority-first regex matching to find backends that support the requested models
3. **Sort by Priority**: Among matching backends, sort by priority (descending)
4. **Select Best Candidate**: Return the highest priority available backend

```javascript
// Simplified selection flow
function selectBackend(backends, options = {}) {
  // Step 1: Filter by health and availability
  let candidates = filterByHealthAndAvailability(backends)

  // Step 2: Model matching if needed
  if (options.models) {
    return selectByPriorityFirst(candidates, options.models)
  }

  // Step 3: Sort by priority and select best
  return selectByPriority(candidates)
}
```

---

### BackendPool Filter Interface

BackendPool provides a unified filter interface:

```javascript
// Filter criteria object
{
  healthy: boolean,           // true = only healthy, false = only unhealthy
  available: boolean,         // true = has capacity, false = at max
  models: string[],           // Filter backends supporting these models
  custom: function(backend)   // Custom filter function
}

// Usage examples
const healthyPool = pool.filter({ healthy: true });
const availablePool = pool.filter({ available: true });
const modelPool = pool.filter({ models: ['llama3', 'qwen'] });
const combinedPool = pool.filter({ healthy: true, available: true });

// Chaining (immutable pattern)
const result = pool
  .filter({ healthy: true })
  .filter({ available: true })
  .filter({ models: ['llama3'] });
```

---

## Queue Processing Flow

```mermaid
sequenceDiagram
    participant Balancer
    participant BackendPool
    participant RequestQueue
    participant Backend1
    participant Backend2
    participant Backend3

    Note over Balancer: Initial State

    alt No Queue
        Balancer->>BackendPool: getAll()
        BackendPool-->>Balancer: all backends
        Balancer->>BackendSelector: Select backend
        BackendSelector-->>Balancer: Return backend
    else Queue Not Empty
        Balancer->>RequestQueue: Push request
        RequestQueue->>RequestQueue: Add to end of queue
    end

    Note over RequestQueue: Queue: [req1, req2, req3]

    Balancer->>Backend1: Process request
    Backend1->>Backend1: activeRequestCount++
    Backend1-->>Balancer: Processing...

    alt Backend at max concurrency
        Balancer->>Backend2: Try next backend
        Backend2-->>Balancer: No available
        Balancer->>Backend3: Try next backend
        Backend3-->>Balancer: No available
        Balancer->>RequestQueue: Queue request
    else Backend available
        Backend1-->>Balancer: Completed
        Backend1->>Balancer: releaseBackend()
        Backend1->>Balancer: activeRequestCount--
    end

    Balancer->>Balancer: notifyBackendAvailable()
    Balancer->>RequestQueue: Check queue head

    RequestQueue-->>Balancer: Return req2

    alt Queue has requests
        Balancer->>Backend1: Process next request
        Balancer->>Backend2: Process next request (if idle)
        Balancer->>Backend3: Process next request (if idle)
    else Queue empty
        Balancer->>Balancer: No action
    end

    Note over Backend1,Backend3: Maintain FIFO order
    Note over RequestQueue: Only one global queue
```

---

## Health Check Flow

```mermaid
flowchart TD
    Start[HealthChecker Start] --> Initialize[Initial checkAll]

    Initialize --> CheckEach{For Each Backend}

    subgraph HealthCheckCycle ["Health Check Cycle"]
        CheckEach --> CheckBackend[Check Backend Health]

        CheckBackend --> CallCheckHealth{backend.checkHealth}
        CallCheckHealth --> Delegate[Delegate to healthChecker.check]

        subgraph APISpecificHealth ["API-Specific Health Checkers"]
            Delegate --> CheckType{API Type?}
            CheckType -->|Ollama| OllamaCheck[OllamaHealthCheck Probe /api/tags]
            CheckType -->|OpenAI/Groq| OpenAICheck[OpenAIHealthCheck Probe /v1/models]
            CheckType -->|Anthropic| AnthropicCheck[AnthropicHealthCheck Probe /v1/messages]
            CheckType -->|Google| GoogleCheck[GoogleHealthCheck Probe /v1beta/models]
        end

        OllamaCheck --> ParseResult{Result?}
        OpenAICheck --> ParseResult
        AnthropicCheck --> ParseResult
        GoogleCheck --> ParseResult

        ParseResult -->|Healthy| MarkHealthy[backend.healthy = true backend.failCount = 0]
        ParseResult -->|Unhealthy| MarkUnhealthy[backend.healthy = false backend.failCount++]

        MarkHealthy --> LogHealthy[Log: healthy + models]
        MarkUnhealthy --> LogUnhealthy[Log: unhealthy + error]
    end

    LogHealthy --> CheckNext{More Backends?}
    LogUnhealthy --> CheckNext

    CheckNext -->|Yes| CheckEach
    CheckNext -->|No| NextInterval[Wait: healthCheckInterval]

    NextInterval --> Loop{Interval End?}
    Loop -->|Yes| Start
    Loop -->|No| Loop
```

---

## Component Interaction Diagram

```mermaid
graph TB
    subgraph EntryPoints["Entry Points"]
        Routes["Routes<br/>Express Handlers"]
    end

    subgraph BalancerCore["Balancer Core"]
        Balancer["Balancer"]
        BackendSelector["BackendSelector<br/>(Selection)"]
        BackendPool["BackendPool<br/>(Data Ownership)"]
        ModelMatcher["ModelMatcher"]
    end

    subgraph BackendEntities["Backend Entities"]
        Backend["Backend"]
        BackendInfo["BackendInfo"]
        HealthCheckerMain["HealthChecker"]
        APIHealthCheckers["API Health Checkers"]
        PromptCache["PromptCache<br/>KV Cache"]
    end

    subgraph RequestFlow["Request Flow"]
        RequestProcessor["RequestProcessor"]
        ProxyRequests["Proxy Requests"]
    end

    subgraph StatsFlow["Statistics & Monitoring"]
        PerformanceStats["Performance Stats"]
        DebugStats["Debug Stats"]
        QueueStats["Queue Stats"]
        PromptCacheStats["Prompt Cache Stats"]
    end

    Routes --> Balancer
    Balancer --> BackendSelector
    BackendSelector --> ModelMatcher

    Balancer --> BackendPool
    BackendPool --> Backend : contains (multiple)
    BackendSelector --> BackendPool : operates on

    Backend --> BackendInfo
    Backend --> APIHealthCheckers

    Backend --> RequestProcessor
    RequestProcessor --> ProxyRequests

    Backend --> PerformanceStats
    Backend --> PromptCache
    Balancer --> DebugStats
    Balancer --> QueueStats
    Backend --> PromptCacheStats

    Backend -.->|delegates to| APIHealthCheckers
    Backend --> PromptCache[caches/prompts]

    style Balancer fill:#e1f5fe
    style Backend fill:#f3e5f5
    style BackendSelector fill:#e1f5fe
    style BackendPool fill:#e8f5e9
    style RequestProcessor fill:#fff3e0
    style HealthCheckerMain fill:#fff3e0
    style APIHealthCheckers fill:#f1f8e9
    style PromptCache fill:#e8f5e9
    style PromptCacheStats fill:#e8f5e9
```

---

## Data Model Diagram

```mermaid
classDiagram
    class BackendPool {
        +Array _backends  // Private, source of truth
        +filter(criteria)  // Returns new BackendPool
        +healthy()  // Convenience filter
        +available()  // Convenience filter
        +byModel(models)  // Convenience filter
        +healthyAndAvailable()  // Combined filter
        +getAll()  // Returns all backends
        +some(criteria)  // Check if any match
        +getStats()  // Pool statistics
        +add(backend)  // Add backend
        +remove(url)  // Remove backend
        +getByUrl(url)  // Find backend
    }

    class BackendSelector {
        +selectBackend(backends, options)  // Returns single Backend
        +getAvailableBackends(backends)  // Returns sorted array
        +hasAvailableBackend(backends, models)
        +getModelAvailabilityStats(backends)
        +_filterByHealthAndAvailability(backends)
        +_sortCandidates(candidates)
        +_selectByPriority(candidates)
    }

    class ModelMatcher {
        +matches(requested, available)
        +findMatches(requested, available)
        +parseModelString(modelString)
        +findBestMatchAcrossBackends(models, backends)
    }

    class Backend {
        +string url
        +int priority
        +bool healthy
        +int failCount
        +int activeRequestCount
        +int requestCount
        +int errorCount
        +int maxConcurrency
        +BackendInfo backendInfo
        +PromptCache promptCache
        +HealthChecker healthChecker
        +checkHealth()
        +getApiTypes()
        +getModels()
        +getPerformanceStats()
        +cachePrompt()
        +findCacheMatch()
        +getPromptCacheStats()
    }

    class PromptCache {
        +int maxSize
        +float similarityThreshold
        +Entry[] entries  // LRU list, front = MRU
        +Map idMap  // ID -> entry mapping
        +Stats stats
        +fingerprint(text)
        +cosineSimilarity(fp1, fp2)
        +findBestMatch(prompt, model, id)
        +addOrUpdate(prompt, model, id)
        +getStats()
    }

    class PromptCacheEntry {
        +string prompt
        +string model
        +int[] fingerprint  // 64-element hash array
        +date lastAccessed
        +string id  // Optional backend response ID
        +int hitCount
    }

    class BackendInfo {
        +string url
        +bool healthy
        +Object apis
        +Object models
        +Object endpoints
        +date detectedAt
        +probe()
        +getInfo()
    }

    class HealthChecker {
        +Backend[] backends
        +Config config
        +intervalId
        +start()
        +stop()
        +checkAll()
        +checkBackend()
    }

    class Balancer {
        +BackendPool backendPool  // Owns backends
        +BackendSelector selector  // Selection strategy
        +int maxQueueSize
        +int queueTimeout
        +Request[] queue
        +queueRequest()
        +getNextBackend()
        +processQueueWhenBackendAvailable()
        +getStats()
        +hasHealthyBackends()
    }

    class RequestProcessor {
        +processRequest()
        +releaseBackend()
        +handleStreamingRequest()
        +handleNonStreamingRequest()
        +extractModelsFromRequest()
        +extractTokenCounts()
    }

    BackendPool --> Backend : contains (multiple)
    BackendPool --> BackendPool : filter() returns new
    BackendSelector --> BackendPool : operates on getAll()
    Balancer --> BackendPool : owns
    Balancer --> BackendSelector : uses

    Backend --> BackendInfo : composition
    Backend --> HealthChecker : delegation
    Backend --> PromptCache : owns
    Backend --> RequestProcessor : delegates to
    RequestProcessor --> Backend : updates stats
```

---

## Request Lifecycle Timeline

```mermaid
timeline
    title Request Processing Timeline
    section Request Arrival
        0ms : Client sends request
        1ms : Express middleware processes
        2ms : Route handler extracts models
    section Backend Selection
        3ms : Balancer calls BackendSelector
        4ms : BackendSelector filters by health/availability
        5ms : ModelMatcher regex matching
        6ms : BackendSelector sorts by priority
        7ms : Return selected backend
    section Request Processing
        8ms : RequestProcessor increments counters
        9ms : Prepare proxy headers
        10ms : Send to backend
        15ms : Backend receives request
    section Response
        20ms : Backend processes prompt
        25ms : First chunk returned (firstChunkTimeMs)
        30-5000ms : Streaming response chunks
        5001ms : Full response complete (totalTimeMs)
    section Completion
        5002ms : Update performance stats
        5003ms : Release backend
        5004ms : Notify queue (if applicable)
        5005ms : Response to client
```

---

## Key Architectural Patterns

**`★ Insight ───────────────────────────────────────────`**

1. **Delegation Pattern**: `Backend.checkHealth()` delegates to `healthChecker.check()` - each backend has an API-specific health checker assigned at startup
2. **Composition over Duplication**: `BackendInfo` (capability detection results) is composed into `Backend` rather than duplicated
3. **Priority-First Model Matching**: When multiple backends match a model pattern, the highest priority healthy backend wins
4. **Single Global Queue**: All queued requests use one FIFO queue, processed when any backend becomes available
5. **Collection Pattern**: `BackendPool` owns data and provides filtered views
6. **Strategy Pattern**: `BackendSelector` encapsulates selection algorithms independently of data ownership

**─────────────────────────────────────────────────────**

---

## Prompt Cache System

### Overview

The prompt cache enables KV cache reuse by storing prompts per backend. When similar prompts are detected, backends can reuse cached KV prefixes, significantly reducing generation time.

### Architecture

```mermaid
classDiagram
    class PromptCache {
        +int maxSize
        +float similarityThreshold
        +Entry[] entries  // LRU list, front = MRU
        +Map idMap  // ID -> entry mapping
        +Stats stats
        +fingerprint(text)
        +cosineSimilarity(fp1, fp2)
        +findBestMatch(prompt, model, id)
        +addOrUpdate(prompt, model, id)
        +getStats()
    }

    class PromptCacheEntry {
        +string prompt
        +string model
        +int[] fingerprint  // 64-element hash array
        +date lastAccessed
        +string id  // Optional backend response ID
        +int hitCount
    }

    PromptCache --> PromptCacheEntry : contains
    Backend --> PromptCache : owns
```

### Cache Strategy

1. **Fingerprint Computation**: Token-level FNV-1a 64-bit hash of prompt+model composite key
2. **Similarity Matching**: Cosine similarity on fingerprint arrays (threshold: 0.85)
3. **LRU Eviction**: Most recently used entries stay in cache, oldest evicted first
4. **Model Isolation**: Each model has separate cache entries (composite key: prompt+model)

### Priority Lookup

1. **ID-based**: If backend provides response ID, use instant O(1) lookup
2. **Fingerprint-based**: Compute cosine similarity on fingerprints (O(64))

### Cache Statistics

```json
{
  "hits": 0,
  "misses": 0,
  "evictions": 0,
  "idMatches": 0,
  "similarityMatches": 0,
  "size": 5,
  "maxSize": 5,
  "cachedPrompts": [
    {
      "model": "qwen/qwen3.5-35b-a3b",
      "prompt": "{...}",
      "lastAccessed": 1773455665362,
      "hitCount": 0
    }
  ]
}
```

### Request Flow with Cache

```mermaid
sequenceDiagram
    participant RequestProcessor
    participant Backend
    participant PromptCache

    Note over RequestProcessor: After request completes

    RequestProcessor->>Backend: cachePrompt(requestBody, matchedModel)
    Backend->>PromptCache: addOrUpdate(prompt, model, id)

    alt Cache full
        PromptCache->>PromptCache: Evict LRU entry
        PromptCache-->>Backend: Entry evicted
    end

    PromptCache->>PromptCache: Add/update entry at front
    PromptCache-->>Backend: Entry cached

    Backend-->>RequestProcessor: Done
```

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - High-level architecture
- [Class Hierarchy](CLASSES.md) - Class documentation
- [Testing Guide](TESTING.md) - Testing data flows
- [Debugging Guide](DEBUGGING.md) - Debug features and troubleshooting