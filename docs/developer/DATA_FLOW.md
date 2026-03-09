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

## Request Processing Flow

### High-Level Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  API Server  │────▶│  Balancer   │
└─────────────┘     └──────────────┘     └─────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Backend     │
                                  │  Selection   │
                                  └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Request     │
                                  │  Processor   │
                                  └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Backend     │
                                  │  Server      │
                                  └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  API Server  │
                                  └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │   Client     │
                                  └──────────────┘
```

---

## Detailed Request Flow

### Step 1: Request Reception

```javascript
// index.js - Route handler
app.post('/v1/messages*', async (req, res) => {
  // 1. Parse request
  const body = req.body

  // 2. Get priority from headers (optional)
  const priority = req.headers.priority || 1

  // 3. Queue request
  const backend = await balancer.queueRequest(req)

  // 4. Forward request
  await forwardRequest(backend, req, res)
})
```

**Middleware Processing**:
```
Request → CORS Middleware → Body Parser → Route Router → Handler
```

---

### Step 2: Backend Selection

#### Queue Request Flow

```javascript
async function queueRequest(req) {
  // Check if any healthy backends exist
  if (!hasHealthyBackends()) {
    throw new NoHealthyBackendsError()
  }

  // Try immediate assignment
  const backend = getNextBackend()
  if (backend) {
    backend.activeRequestCount++
    return backend
  }

  // Queue the request
  const queuedRequest = createQueuedRequest()
  queue.push(queuedRequest)

  // Set timeout
  queuedRequest.timeoutId = setTimeout(() => {
    queuedRequest.reject(new TimeoutError())
  }, queueTimeout)

  return queuedRequest.promise
}
```

#### Backend Selection Algorithm

```javascript
function getNextBackend() {
  // 1. Filter healthy, available backends
  const available = backends.filter(b =>
    b.healthy &&
    b.activeRequestCount < b.maxConcurrency
  )

  // 2. Sort by priority (descending)
  available.sort((a, b) => b.priority - a.priority)

  // 3. Select first available
  return available.length > 0 ? available[0] : null
}
```

---

### Step 3: Request Forwarding

#### Forward Request

```javascript
async function forwardRequest(backend, req, res) {
  // Parse backend URL
  const backendUrl = new URL(backend.url)

  // Construct target URL
  const targetUrl = `${backendUrl.protocol}//${backendUrl.host}${req.path}`

  // Forward request
  const response = await fetch(targetUrl, {
    method: req.method,
    headers: filterHeaders(req.headers),
    body: req.body
  })

  // Stream response
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  response.body.pipe(res)
}
```

#### Header Filtering

```javascript
function filterHeaders(headers) {
  const hopByHopHeaders = [
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade'
  ]

  const filtered = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!hopByHopHeaders.includes(key)) {
      filtered[key] = value
    }
  }

  return filtered
}
```

---

### Step 4: Response Handling

#### Streaming Response

```javascript
// For streaming content types
if (isStreamingResponse(req)) {
  // Pipe response directly
  response.body.pipe(res)
} else {
  // Buffer response
  const chunks = []
  for await (const chunk of response.body) {
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks).toString()
  res.send(body)
}
```

#### Debug Tracking

```javascript
function trackDebugRequest(req, backend, response) {
  if (!debugMode) return

  const debugRequest = {
    id: nextRequestId++,
    timestamp: Date.now(),
    route: req.path,
    method: req.method,
    priority: req.headers.priority || 1,
    backendId: backend.url,
    backendUrl: backend.url,
    requestContent: parseRequestContent(req.body),
    responseContent: {
      data: parseResponseContent(response.body),
      contentType: response.headers.get('content-type'),
      statusCode: response.status
    }
  }

  debugHistory.push(debugRequest)
  trimDebugHistory()
}
```

---

## Queue Processing Flow

### Backend Becomes Available

```javascript
function notifyBackendAvailable(backend) {
  // Process queued requests while backends available
  while (queue.length > 0) {
    // Get next available backend
    const nextBackend = getNextBackend()
    if (!nextBackend) break

    // Get next queued request
    const queuedRequest = queue.shift()

    // Clear timeout
    if (queuedRequest.timeoutId) {
      clearTimeout(queuedRequest.timeoutId)
    }

    // Assign backend and resolve promise
    nextBackend.activeRequestCount++
    queuedRequest.resolve(nextBackend)
  }
}
```

### Queue Timeout Handling

```javascript
// When timeout fires
function handleQueueTimeout(queuedRequest) {
  if (queuedRequest.timeoutId) {
    clearTimeout(queuedRequest.timeoutId)
    queuedRequest.reject(new TimeoutError('Request timeout'))
  }
}
```

---

## Health Check Flow

### Periodic Health Check

```javascript
async function runHealthChecks() {
  for (const backend of backends) {
    try {
      const healthy = await healthChecker.check(backend)

      if (healthy) {
        if (!backend.healthy) {
          // Recovery
          backend.healthy = true
          backend.failCount = 0
          notifyBackendAvailable(backend)
        }
      } else {
        // Failure
        if (backend.healthy) {
          backend.healthy = false
          backend.failCount++
          balancer.markFailed(backend.url)
        }
      }
    } catch (error) {
      // Handle check error
      backend.healthy = false
      backend.failCount++
    }
  }
}
```

### Health Check Timer

```javascript
function startHealthChecker() {
  healthTimer = setInterval(() => {
    runHealthChecks()
  }, healthCheckInterval)
}

function stopHealthChecker() {
  if (healthTimer) {
    clearInterval(healthTimer)
  }
}
```

---

## State Transitions

### Backend State Machine

```
                    ┌─────────────────┐
                    │   Initialized   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Healthy       │◄────────────┐
                    └────────┬────────┘             │
                             │                     │
                ┌────────────┴────────────┐         │
                │                         │         │
                ▼                         │         │
         ┌──────────────┐                │         │
         │  Unhealthy   │◄───────────────┘         │
         └──────────────┘                          │
                             │                     │
                             └─────────────────────┘

Transitions:
- Initialized → Healthy: First health check succeeds
- Healthy → Unhealthy: Health check fails
- Unhealthy → Healthy: Health check succeeds (recovery)
```

### Queue State Machine

```
┌─────────────────────────────────────────────────────────┐
│                      Queue                              │
│                                                         │
│  Empty ──────▶ Processing ──────▶ Waiting               │
│     ▲              │                  │                 │
│     │              │                  │                 │
│     └──────────────┴──────────────────┘                 │
│                                                         │
└─────────────────────────────────────────────────────────┘

Transitions:
- Empty → Processing: Request queued
- Processing → Waiting: Waiting for backend
- Waiting → Processing: Backend available
- Processing → Empty: Request assigned
```

---

## Concurrency Management

### Active Request Counting

```javascript
// Request starts
function acquireBackend(backend) {
  backend.activeRequestCount++
  backend.busy = true
}

// Request completes
function releaseBackend(backend) {
  backend.activeRequestCount--

  if (backend.activeRequestCount === 0) {
    backend.busy = false
  }

  // Notify if below max concurrency
  if (backend.activeRequestCount < backend.maxConcurrency) {
    notifyBackendAvailable(backend)
  }
}
```

### Utilization Calculation

```javascript
function getUtilization(backend) {
  return (backend.activeRequestCount / backend.maxConcurrency) * 100
}

function isOverloaded(backend) {
  return backend.activeRequestCount >= backend.maxConcurrency
}

function isAvailable(backend) {
  return backend.activeRequestCount < backend.maxConcurrency
}
```

---

## Error Handling Flow

### Request Error Propagation

```
Client Request
    │
    ▼
API Server
    │
    ├─> ConfigurationError → 500 Internal Server Error
    │
    ├─> NoHealthyBackendsError → 503 Service Unavailable
    │
    ├─> QueueFullError → 503 Service Unavailable
    │
    └─> BackendError → 502 Bad Gateway
```

### Backend Error Handling

```javascript
async function handleBackendError(backend, error) {
  // Mark backend as failed
  backend.healthy = false
  backend.failCount++

  // Clear busy state
  backend.busy = false
  backend.activeRequestCount = 0

  // Notify balancer
  balancer.markFailed(backend.url)

  // Release backend for queued requests
  notifyBackendAvailable(backend)
}
```

---

## Shutdown Flow

### Graceful Shutdown

```javascript
async function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`)

  // 1. Stop health checker
  stopHealthChecker()

  // 2. Reject all queued requests
  for (const queuedRequest of queue) {
    clearTimeout(queuedRequest.timeoutId)
    queuedRequest.reject(new Error('Server shutting down, please retry'))
  }
  queue.length = 0

  // 3. Close HTTP server
  server.close(() => {
    console.log('Server closed. All in-flight requests completed.')
    process.exit(0)
  })

  // 4. Force exit after timeout
  setTimeout(() => {
    console.log('Forcing exit due to pending requests')
    process.exit(1)
  }, shutdownTimeout)
}
```

---

## Startup Flow

### Initialization Sequence

```
1. Load Configuration
   └─> Parse environment variables
       └─> Create backend objects

2. Detect Capabilities
   └─> BackendInfo.getInfoAll(urls)
       └─> For each backend:
           ├─> Probe OpenAI endpoint
           ├─> Probe Anthropic endpoint
           ├─> Probe Google endpoint
           └─> Probe Ollama endpoint

3. Assign Health Checkers
   └─> For each backend:
       ├─> Determine primary API
       └─> Create appropriate health checker

4. Start Health Checker
   └─> Start periodic health checks

5. Start API Server
   └─> Listen on configured port
```

---

## Data Flow Diagrams

### Request Flow Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Request │────▶│ Route   │────▶│ Queue   │────▶│ Backend │
│         │     │ Router  │     │ Request │     │ Select  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                                             │
                                             ▼
                                      ┌─────────┐     ┌─────────┐
                                      │ Process │────▶│ Backend │
                                      │ Request │     │ Server  │
                                      └─────────┘     └─────────┘
                                             │
                                             ▼
                                      ┌─────────┐
                                      │ Response│
                                      └─────────┘
```

### Health Check Flow Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Timer  │────▶│ Health  │────▶│ Probe   │────▶│ Update  │
│         │     │ Checker │     │ Backend │     │ State   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                                              │
                                              ▼
                                      ┌─────────┐
                                      │ Notify  │
                                      │ Balancer│
                                      └─────────┘
```

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - High-level architecture
- [Class Hierarchy](CLASSES.md) - Class documentation
- [Testing Guide](TESTING.md) - Testing data flows
