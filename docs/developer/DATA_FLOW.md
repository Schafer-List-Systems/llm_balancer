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
            BackendSelector["BackendSelector"]
        end
    end

    subgraph Backends["Backend Pool"]
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
    style HealthChecker fill:#fff3e0
    style BackendInfo fill:#fff3e0
    style Backend1 fill:#f3e5f5
    style Backend2 fill:#f3e5f5
    style Backend3 fill:#f3e5f5
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

    Note over Main,HealthChecker: Phase 5: Start Health Checking
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
    participant Backend
    participant RequestProcessor
    participant BackendPool

    Client->>Routes: HTTP POST /v1/chat/completions
    Routes->>Balancer: extractModelsFromRequest()

    Note over Balancer: Backend Selection

    Balancer->>BackendSelector: getNextBackendForModelWithMatch(models)
    BackendSelector->>BackendSelector: _filterByHealthAndAvailability()
    BackendSelector->>BackendSelector: ModelMatcher.findBestMatchAcrossBackends()
    BackendSelector-->>Balancer: backend + matchedModel

    alt Backend Available Immediately
        Balancer-->>Routes: backend (direct assignment)
    else No Backend Available
        Balancer->>Balancer: queueRequestWithRequestData()
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
        RequestProcessor->>RequestProcessor: handleStreamingRequest()
        RequestProcessor->>BackendPool: http.request()
        BackendPool-->>RequestProcessor: stream response chunks
        RequestProcessor->>RequestProcessor: Parse streaming stats
        RequestProcessor->>RequestProcessor: extractTokenCounts from chunks
    else isStreaming == false
        RequestProcessor->>RequestProcessor: handleNonStreamingRequest()
        RequestProcessor->>BackendPool: http.request()
        BackendPool-->>RequestProcessor: full response
        RequestProcessor->>RequestProcessor: extractTokenCounts from response
    end

    RequestProcessor->>RequestProcessor: Update backend performance stats
    RequestProcessor->>Backend: updateStreamingStats() or updateNonStreamingStats()

    RequestProcessor->>RequestProcessor: trackDebugRequest()
    RequestProcessor->>Backend: releaseBackend()
    Backend->>RequestProcessor: activeRequestCount--

    RequestProcessor->>Balancer: notifyBackendAvailable() if available

    Balancer->>Balancer: processQueueWhenBackendAvailable()
    Balancer->>Balancer: Forward next queued request if any

    RequestProcessor-->>Client: Final response
```

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

## Queue Processing Flow

```mermaid
sequenceDiagram
    participant Balancer
    participant Queue
    participant Backend1
    participant Backend2
    participant Backend3

    Note over Balancer: Initial State

    alt No Queue
        Balancer->>BackendSelector: Select backend
        BackendSelector-->>Balancer: Return backend
    else Queue Not Empty
        Balancer->>Queue: Push request
        Queue->>Queue: Add to end of queue
    end

    Note over Queue: Queue: [req1, req2, req3]

    Balancer->>Backend1: Process request
    Backend1->>Backend1: activeRequestCount++
    Backend1-->>Balancer: Processing...

    alt Backend at max concurrency
        Balancer->>Backend2: Try next backend
        Backend2-->>Balancer: No available
        Balancer->>Backend3: Try next backend
        Backend3-->>Balancer: No available
        Balancer->>Queue: Queue request
    else Backend available
        Backend1-->>Balancer: Completed
        Backend1->>Balancer: releaseBackend()
        Backend1->>Balancer: activeRequestCount--
    end

    Balancer->>Balancer: notifyBackendAvailable()
    Balancer->>Queue: Check queue head

    Queue-->>Balancer: Return req2

    alt Queue has requests
        Balancer->>Backend1: Process next request
        Balancer->>Backend2: Process next request (if idle)
        Balancer->>Backend3: Process next request (if idle)
    else Queue empty
        Balancer->>Balancer: No action
    end

    Note over Backend1,Backend3: Maintain FIFO order
    Note over Queue: Only one global queue
```

---

## Health Check Flow

```mermaid
flowchart TD
    Start[HealthChecker Start] --> Initialize[Initial checkAll()]

    Initialize --> CheckEach{For Each Backend}

    subgraph HealthCheckCycle["Health Check Cycle"]
        CheckEach --> CheckBackend[Check Backend Health]

        CheckBackend --> CallCheckHealth{backend.checkHealth}
        CallCheckHealth --> Delegate[Delegate to healthChecker.check]

        subgraph APISpecificHealth["API-Specific Health Checkers"]
            Delegate --> CheckType{API Type?}
            CheckType -->|Ollama| OllamaCheck[OllamaHealthCheck<br/>Probe /api/tags]
            CheckType -->|OpenAI/Groq| OpenAICheck[OpenAIHealthCheck<br/>Probe /v1/models]
            CheckType -->|Anthropic| AnthropicCheck[AnthropicHealthCheck<br/>Probe /v1/messages]
            CheckType -->|Google| GoogleCheck[GoogleHealthCheck<br/>Probe /v1beta/models]
        end

        OllamaCheck --> ParseResult{Result?}
        OpenAICheck --> ParseResult
        AnthropicCheck --> ParseResult
        GoogleCheck --> ParseResult

        ParseResult -->|Healthy| MarkHealthy[backend.healthy = true<br/>backend.failCount = 0]
        ParseResult -->|Unhealthy| MarkUnhealthy[backend.healthy = false<br/>backend.failCount++]

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

    style CheckEach fill:#e8f5e9
    style MarkHealthy fill:#c8e6c9
    style MarkUnhealthy fill:#ffcdd2
    style APISpecificHealth fill:#fff3e0
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
        BackendSelector["BackendSelector"]
        ModelMatcher["ModelMatcher"]
    end

    subgraph BackendEntities["Backend Entities"]
        Backend["Backend"]
        BackendInfo["BackendInfo"]
        HealthCheckerMain["HealthChecker"]
        APIHealthCheckers["API Health Checkers"]
    end

    subgraph RequestFlow["Request Flow"]
        RequestProcessor["RequestProcessor"]
        ProxyRequests["Proxy Requests"]
    end

    subgraph StatsFlow["Statistics & Monitoring"]
        PerformanceStats["Performance Stats"]
        DebugStats["Debug Stats"]
        QueueStats["Queue Stats"]
    end

    Routes --> Balancer
    Balancer --> BackendSelector
    BackendSelector --> ModelMatcher

    BackendSelector --> Backend
    Backend --> BackendInfo
    Backend --> APIHealthCheckers

    Backend --> RequestProcessor
    RequestProcessor --> ProxyRequests

    Backend --> PerformanceStats
    Balancer --> DebugStats
    Balancer --> QueueStats

    Backend -.->|delegates to| APIHealthCheckers

    style Balancer fill:#e1f5fe
    style Backend fill:#f3e5f5
    style BackendSelector fill:#e1f5fe
    style RequestProcessor fill:#fff3e0
    style HealthCheckerMain fill:#fff3e0
    style APIHealthCheckers fill:#f1f8e9
```

---

## Data Model Diagram

```mermaid
classDiagram
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
        +HealthChecker healthChecker
        +checkHealth()
        +getApiTypes()
        +getModels()
        +getPerformanceStats()
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
        +Backend[] backends
        +int maxQueueSize
        +int queueTimeout
        +Request[] queue
        +BackendSelector selector
        +queueRequest()
        +getNextBackend()
        +processQueueWhenBackendAvailable()
        +getStats()
    }

    class BackendSelector {
        +selectBackend()
        +getAvailableBackends()
        +_filterByHealthAndAvailability()
        +_sortCandidates()
        +_selectByPriority()
    }

    class ModelMatcher {
        +matches()
        +findMatches()
        +parseModelString()
        +findBestMatchAcrossBackends()
    }

    class RequestProcessor {
        +processRequest()
        +releaseBackend()
        +handleStreamingRequest()
        +handleNonStreamingRequest()
        +extractModelsFromRequest()
        +extractTokenCounts()
    }

    Backend --> BackendInfo : composition
    Backend --> HealthChecker : delegation
    Balancer --> Backend : contains
    Balancer --> BackendSelector : uses
    BackendSelector --> ModelMatcher : uses
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
        4ms : Filter by health/availability
        5ms : Model matching (regex search)
        6ms : Sort by priority
        7ms : Return backend
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

`─────────────────────────────────────────────────────`

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - High-level architecture
- [Class Hierarchy](CLASSES.md) - Class documentation
- [Testing Guide](TESTING.md) - Testing data flows
- [Debugging Guide](DEBUGGING.md) - Debug features and troubleshooting