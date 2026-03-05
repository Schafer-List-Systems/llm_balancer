# LLM Balancer Requirements Specification

## 1. Overview

This document specifies the complete behavior of the LLM Balancer system, a load balancer for distributing requests across multiple Ollama API servers with health checking and automatic failover capabilities.

### 1.1 System Purpose

The LLM Balancer provides:
- Priority-based load balancing across multiple backend Ollama instances
- Health monitoring with automatic failure detection and recovery
- Request queuing when all backends are busy
- Support for both Anthropic API format (`/v1/messages*`) and Ollama API format (`/api/*`)
- Comprehensive statistics and debugging endpoints

### 1.2 Architecture Overview

The system consists of five core components:
1. **Configuration Module** - Loads and validates environment variables
2. **Balancer Class** - Priority-based request routing with FIFO queueing
3. **Health Checker** - Periodic backend health monitoring
4. **Request Processor** - HTTP proxy for forwarding requests to backends
5. **API Server** - Express server exposing routes and endpoints

---

## 2. Configuration Requirements

### 2.1 Environment Variables

All configuration must be loaded from environment variables with the following structure:

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `OLLAMA_BACKENDS` | String | Yes | None | Comma-separated list of backend URLs (e.g., `"http://localhost:11434,http://localhost:11435"`) |
| `LB_PORT` | Integer | No | 3001 | Server port to listen on |
| `HEALTH_CHECK_INTERVAL` | Integer | No | 30000 | Health check interval in milliseconds |
| `HEALTH_CHECK_TIMEOUT` | Integer | No | 5000 | Health check request timeout in milliseconds |
| `MAX_RETRIES` | Integer | No | 3 | Maximum retry attempts per failed request |
| `MAX_PAYLOAD_SIZE` | String | No | `52428800` | Maximum request payload size (e.g., `"10mb"`, `"52428800"`) |
| `MAX_QUEUE_SIZE` | Integer | No | 100 | Maximum number of requests that can be queued |
| `QUEUE_TIMEOUT` | Integer | No | 30000 | Request timeout in queue before rejection (ms) |
| `DEBUG` | Boolean | No | `false` | Enable debug request tracking mode |
| `DEBUG_REQUEST_HISTORY_SIZE` | Integer | No | 100 | Maximum number of requests to track in debug history |

### 2.2 Backend Object Structure

Each backend parsed from `OLLAMA_BACKENDS` must have the following properties:

```javascript
{
  url: string,      // Full URL including protocol and port (e.g., "http://localhost:11434")
  priority: number, // Priority level 0-10, higher = preferred (default: 1)
  healthy: boolean, // Current health status (initially true if reachable, false otherwise)
  busy: boolean,    // Whether backend is currently handling a request (initially false)
  requestCount: number, // Total requests handled (initially 0)
  errorCount: number,   // Total errors encountered (initially 0)
  failCount: number,    // Consecutive failures for health tracking (initially 0)
  models: array       // List of available models from /api/tags response
}
```

### 2.3 Priority Configuration Methods

Backends can be assigned priorities using two methods:

**Method 1 - Index-based priority:**
- `BACKEND_PRIORITY_0` = "http://localhost:11434" -> sets priority for first backend
- `BACKEND_PRIORITY_1` = "http://localhost:11435" -> sets priority for second backend

**Method 2 - URL-based priority:**
- `BACKEND_PRIORITY_http://localhost:11434` = "5" -> sets explicit priority for specific URL

URL-based takes precedence over index-based. If neither is specified, default priority is 1.

### 2.4 Configuration Validation

The system must validate:
- At least one backend URL must be provided in `OLLAMA_BACKENDS`
- All URLs must be valid HTTP/HTTPS URLs
- Priority values must be integers between 0 and 10 (inclusive)
- Port must be a valid port number (1-65535)
- Health check interval and timeout must be positive integers
- Max queue size must be at least 1
- Queue timeout must be at least 1 millisecond

---

## 3. Load Balancer Requirements

### 3.1 Backend Selection Algorithm

When a request arrives, the balancer must select a backend using this algorithm:

**Priority 1 - Immediate Assignment (when queue is empty):**
1. Filter all backends to find those that are both `healthy === true` AND `busy === false`
2. Sort available backends by priority in descending order (highest first)
3. Within same priority, maintain insertion order (first defined = higher preference)
4. Select the first backend from sorted list
5. Mark selected backend as `busy = true`
6. Increment `requestCount` for selected backend

**Priority 2 - Queue Assignment (when queue is not empty or no immediate backend):**
1. If queue length >= `maxQueueSize`, reject with error "Queue is full"
2. Create a queued request object containing:
   - Promise resolve function
   - Promise reject function
   - Timestamp of when request was queued (`Date.now()`)
   - Timeout ID for queue timeout
3. Add to end of queue array
4. Increment `queued` counter in request counts

### 3.2 Queue Processing

When a backend becomes available (via `notifyBackendAvailable()`):

1. While queue is not empty:
   a. Peek at first queued request (FIFO order)
   b. Clear the request's timeout
   c. Call `getNextBackend()` to find an available backend
   d. If no backend available, stop processing and wait for next notification
   e. Mark selected backend as busy
   f. Increment request count
   g. Remove request from queue (shift)
   h. Resolve the promise with the assigned backend

### 3.3 Busy State Management

**Marking Backend Busy:**
- Set `busy = true` immediately when backend is assigned to a request
- This prevents other requests from selecting the same backend concurrently

**Clearing Busy State:**
- Set `busy = false` when request completes successfully or fails
- Call `notifyBackendAvailable()` to wake queued requests
- If no backends are available, all backends that were busy should have their `busy` state cleared after a timeout (30 seconds)

### 3.4 Queue Statistics

The balancer must track and report:
```javascript
{
  depth: number,           // Current queue length
  maxQueueSize: number,    // Maximum allowed queue size
  queueTimeout: number,    // Timeout for queued requests (ms)
  oldestRequestAge: number,// Age of oldest request in queue (ms), 0 if empty
  isFull: boolean          // true if depth >= maxQueueSize
}
```

### 3.5 Balancer Statistics

The balancer must provide comprehensive statistics:
```javascript
{
  totalBackends: number,           // Total configured backends
  healthyBackends: number,         // Count of healthy backends
  unhealthyBackends: number,       // Count of unhealthy backends
  backends: array,                 // Per-backend details:
    [
      {
        url: string,
        healthy: boolean,
        failCount: number,
        requestCount: number,
        errorCount: number,
        models: array
      }
    ],
  requestCounts: object            // Map of url -> count (includes "queued" key)
}
```

---

## 4. Health Check Requirements

### 4.1 Health Check Endpoint

Health checks must use the Ollama `/api/tags` endpoint:
- Method: `GET`
- Path: `/api/tags`
- Expected response: JSON with `{"models": [...]}` structure

### 4.2 Health Check Interval

- Default interval: 30000ms (30 seconds)
- Configurable via `HEALTH_CHECK_INTERVAL` environment variable
- Must be a positive integer
- Health checks run continuously on this schedule while server is running

### 4.3 Health Check Timeout

- Default timeout: 5000ms (5 seconds)
- Configurable via `HEALTH_CHECK_TIMEOUT` environment variable
- Requests exceeding this time are considered failed

### 4.4 Health Status Determination

**Backend marked HEALTHY when:**
- `/api/tags` returns HTTP status 200-299
- Response body is valid JSON with expected structure

**Backend marked UNHEALTHY when:**
- Request times out (exceeds `healthCheckTimeout`)
- Network error occurs during request
- HTTP status code indicates failure (outside 200-299 range)
- Response cannot be parsed as JSON

### 4.5 Backend Recovery

When a previously unhealthy backend responds successfully to health check:
1. Set `healthy = true` on the backend object
2. Reset `failCount = 0`
3. Log recovery event with timestamp
4. If backend was busy, mark it as available for queued requests

### 4.6 Model Discovery

On successful health check response containing models array:
- Extract model names from response JSON
- Update `backend.models` with discovered models
- Models are accessible via `/stats` and `/backends` endpoints

---

## 5. API Server Requirements

### 5.1 Supported Routes

| Route | Method | Description | Queuing Support |
|-------|--------|-------------|-----------------|
| `/v1/messages*` | GET, POST, PUT, DELETE | Anthropic API format | Yes |
| `/api/*` | GET, POST, PUT, DELETE | Ollama API format | Yes |
| `/models*` | GET, POST, PUT, DELETE | Model list endpoint | Yes |
| `/` | GET | Service info | No |
| `/health` | GET | Health check with backends | No |
| `/stats` | GET | Detailed statistics | No |
| `/backends` | GET | Backend list | No |
| `/queue/stats` | GET | Queue statistics | No |
| `/queue/stats/:priority` | GET | Per-priority queue stats | No |
| `/queue/list/:priority` | GET | Per-priority queue contents | No |
| `/backend/current` | GET | Current backend info | No |
| `/debug/stats` | GET | Debug statistics | No |
| `/debug/requests` | GET | Full debug history | No |
| `/debug/requests/recent` | GET | Last N requests | No |
| `/debug/requests/backend/:id` | GET | Filtered by backend ID | No |
| `/debug/clear` | POST | Clear debug history | No |
| `/health/:backendUrl` | GET | Manual health check | No |

### 5.2 Request Routing Behavior

**For queued routes (`/v1/messages*`, `/api/*`, `/models*`):**

1. Call `balancer.queueRequest()` to get backend assignment
2. If no backend available, return 503 with error response containing:
   ```javascript
   {
     error: 'Service Unavailable',
     message: 'No backends configured or all backends unhealthy',
     stats: balancer.getStats(),
     queueStats: balancer.getAllQueueStats()
   }
   ```
3. Track debug request with metadata (route, method, priority, backendId)
4. Forward request to assigned backend via `processRequest()`

### 5.3 Response Formats

**Health Endpoint (`/health`):**
```javascript
{
  status: 'ok',
  timestamp: string,           // ISO format timestamp
  port: number,                // Server port from config
  maxPayloadSize: number,      // Configured max payload in bytes
  maxPayloadSizeMB: number,    // Max payload in megabytes
  healthyBackends: number,     // Count of healthy backends
  totalBackends: number,       // Total configured backends
  backends: array,             // Per-backend health details
  hasHealthyBackends: boolean, // true if any backend is healthy
  busyBackends: number,        // Count of currently busy backends
  idleBackends: number         // Count of currently idle backends
}
```

**Stats Endpoint (`/stats`):**
```javascript
{
  balancer: object,            // From balancer.getStats()
  healthCheck: object,         // From healthChecker.getStats()
  config: {
    healthCheckInterval: number,
    healthCheckTimeout: number,
    maxRetries: number,
    maxPayloadSize: string,
    maxPayloadSizeMB: number,
    maxQueueSize: number,
    queueTimeout: number
  },
  busyBackends: number,
  idleBackends: number,
  backendDetails: array,       // Per-backend detailed stats
  queueStats: object           // From balancer.getAllQueueStats()
}
```

**Backend List (`/backends`):**
```javascript
{
  backends: [
    {
      url: string,
      priority: number,
      healthy: boolean,
      busy: boolean,
      failCount: number,
      requestCount: number,
      errorCount: number,
      models: array
    }
  ]
}
```

**Queue Stats (`/queue/stats`):**
```javascript
{
  maxQueueSize: number,
  queueTimeout: number,
  queues: object               // From balancer.getAllQueueStats()
}
```

### 5.4 Error Handling

**404 Not Found:**
- Any route not matching defined patterns returns:
```javascript
{
  error: 'Not Found',
  message: 'Route not found. Use /health to check status.'
}
```

**502 Bad Gateway:**
- Returned when backend request fails with:
```javascript
{
  error: 'Bad Gateway',
  message: 'Backend unavailable',
  backend: string              // Backend URL that failed
}
```

**503 Service Unavailable:**
- Returned when no backends are available or queue is full

**500 Internal Server Error:**
- Returned for unhandled exceptions with:
```javascript
{
  error: 'Internal Server Error',
  message: string              // Error message from exception
}
```

### 5.5 CORS Headers

All responses must include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

OPTIONS requests must return HTTP 200.

---

## 6. Request Processing Requirements

### 6.1 Proxy Behavior

When forwarding requests to backends:

**Request Construction:**
- Parse backend URL to extract protocol, hostname, port
- Construct target URL from request path and query parameters
- Copy all request headers except hop-by-hop headers (see below)
- Include request body if present

**Hop-by-Hop Headers:**
These headers must be removed before forwarding:
- `connection`
- `keep-alive`
- `transfer-encoding`
- `te`
- `trailer`
- `upgrade`

**Response Handling:**
- Copy response headers to client, excluding hop-by-hop headers
- Stream response body chunks directly to client
- Handle JSON parsing for debug tracking

### 6.2 Streaming Support

Requests with `content-type: application/json; charset=utf-8` and content including "stream" are handled as streaming requests:

**Streaming Response Path:**
1. Set appropriate response headers
2. Pipe proxy response directly to client
3. Do not buffer entire response
4. Backend remains marked busy until stream completes or errors

### 6.3 Non-Streaming Requests

Non-streaming responses are buffered:
1. Collect all response chunks
2. Parse as JSON for debug tracking
3. Send complete response to client
4. Release backend after response sent

### 6.4 Request Body Handling

**Buffer bodies:**
- For raw content types, preserve original buffer
- Convert to string for debug logging using UTF-8 encoding

**JSON objects:**
- Stringify object bodies before forwarding
- Use `JSON.stringify()` for consistent formatting

**String bodies:**
- Forward as-is without modification

---

## 7. Debug Mode Requirements

### 7.1 Enabling Debug Mode

Debug mode is enabled via:
- `DEBUG=true` environment variable (case-insensitive boolean parsing)

When disabled, all debug tracking functions return empty results immediately.

### 7.2 Request Tracking

Each tracked request must include:
```javascript
{
  id: number,                    // Sequential ID (1-based, incrementing)
  timestamp: number,             // Unix timestamp (Date.now())
  route: string,                 // Request path/route
  method: string,                // HTTP method
  priority: number,              // Backend priority
  backendId: string,             // Backend URL or identifier
  backendUrl: string,            // Full backend URL
  requestContent: object|null,   // Request body (stringified JSON or raw)
  responseContent: object|null   // Response data with metadata
}
```

### 7.3 Debug History Management

**Storage:**
- Store requests in array (FIFO order - newest first via unshift)
- Maximum size controlled by `DEBUG_REQUEST_HISTORY_SIZE` (default: 100)
- When limit exceeded, remove oldest entries (slice from end)

**Retrieval:**
- `getDebugRequestHistory()` - Return full copy of history array
- `getDebugRequestsFiltered(backendId?, limit?)` - Filtered results with optional backend ID filter and result count limit

### 7.4 Debug Statistics

```javascript
{
  enabled: boolean,              // false if debug mode disabled
  totalRequests: number,         // Total tracked requests (when enabled)
  queueSize: number,             // Current queue length
  requestHistorySize: number     // Configured maximum history size
}
```

### 7.5 Debug Clearing

POST to `/debug/clear` clears all debug history:
- Set `this.debugRequests = []`
- Log clear event with timestamp (only if debug enabled)

---

## 8. Error Handling Requirements

### 8.1 Queue Timeout

Each queued request has an associated timeout:
- Default: 30000ms (configurable via `QUEUE_TIMEOUT`)
- When timeout fires, reject the promise with `Error('Request timeout')`
- Clear timeout when request is assigned to a backend or rejected for any reason

### 8.2 Queue Full Scenario

When queue reaches maximum capacity (`maxQueueSize`):
- Reject new queue requests immediately
- Error message: `"Queue is full"`
- Do not add to queue array
- This prevents unbounded memory growth

### 8.3 No Healthy Backends

When `queueRequest()` is called but no healthy backends exist:
- Immediately reject with `Error('No healthy backends available')`
- Do not attempt to queue the request
- Check occurs before any queuing logic

### 8.4 Backend Failure Handling

When a backend request fails (network error, timeout, HTTP error):

1. Call `balancer.markFailed(backendUrl)`:
   - Set `healthy = false` on backend object
   - Clear `busy = false` to allow retry
   - Increment `failCount`
   - Increment `errorCount`
   - Record health check count in internal Map

2. Return 502 Bad Gateway response to client

3. Call `notifyBackendAvailable()` since busy state was cleared

### 8.5 Server Errors

**Port Already In Use:**
- Listen error with code `EADDRINUSE` triggers:
  - Log error message with timestamp
  - Exit process with code 1

**General Server Errors:**
- Log all errors with ISO timestamp format
- Include component tag (e.g., `[Balancer]`, `[Gateway]`)

### 8.6 Graceful Shutdown

Handle shutdown signals:
- **SIGINT** and **SIGTERM**:
  1. Log "Shutting down gracefully..." message
  2. Stop health checker
  3. Close HTTP server (wait for existing connections)
  4. Log "Server closed" message
  5. Exit process with code 0

---

## 9. Concurrency Requirements

### 9.1 Concurrent Request Handling

**Single Global Queue:**
- All priority tiers share one queue array
- FIFO ordering maintained within single queue
- `notifyBackendAvailable()` processes all pending requests until no backends available

**Backend Exclusivity:**
- A backend marked as busy cannot be selected by concurrent requests
- Busy state prevents race conditions where multiple requests get same backend
- Backend remains busy until request completes or timeout fires

### 9.2 Promise Resolution Order

When `notifyBackendAvailable()` processes queue:
1. Requests resolved in FIFO order (queue.shift())
2. Each resolution assigns a different backend if available
3. If no backends available, remaining requests stay queued
4. Timeout handling must not interfere with concurrent processing

---

## 10. Integration Test Derivation

The following test categories can be derived from these requirements:

### 10.1 Configuration Tests
- Parse valid backend URLs from comma-separated string
- Validate URL format (http/https protocol)
- Apply index-based priority configuration
- Apply URL-based priority configuration
- Handle missing priority (default to 1)
- Validate port range (1-65535)
- Validate positive integers for intervals/timeouts
- Parse boolean DEBUG value (case-insensitive)

### 10.2 Load Balancer Tests
- Select highest priority healthy backend
- Fallback to lower priority when higher busy/unhealthy
- Maintain insertion order within same priority
- Mark selected backend as busy
- Increment request count on selection
- Queue request when no immediate backend available
- Timeout handling for queued requests (30s default)
- Reject when queue is full (maxQueueSize reached)
- Resolve queued request when backend becomes available
- FIFO order preservation in queue processing

### 10.3 Health Check Tests
- Call /api/tags endpoint on schedule
- Respect HEALTH_CHECK_INTERVAL setting
- Apply HEALTH_CHECK_TIMEOUT to requests
- Mark unhealthy on timeout/error/failure status
- Recover healthy backends on successful response
- Extract and store model list from response

### 10.4 API Server Tests
- Route /v1/messages* to balancer queue
- Route /api/* to balancer queue
- Route /models* to balancer queue
- Return 503 when no backends available
- Include stats in error responses
- Health endpoint returns correct field names
- Stats endpoint includes all config values
- Backend list shows busy/idle status

### 10.5 Request Processing Tests
- Forward request with correct method/path/headers
- Remove hop-by-hop headers from forwarded request
- Stream response for streaming content types
- Buffer response for non-streaming content types
- Handle JSON and raw body formats
- Track request in debug history when enabled

### 10.6 Debug Mode Tests
- Enable/disable via DEBUG environment variable
- Track route, method, priority, backend info
- Store request and response content
- Limit history to configured size (FIFO eviction)
- Filter by backend ID
- Limit result count on filtered queries
- Clear all history via POST /debug/clear

### 10.7 Edge Case Tests
- Empty backends list handling
- Single backend scenario
- All backends unhealthy scenario
- Queue with zero timeout
- Zero priority backends
- Maximum priority (99+) backends
- Concurrent queue requests with single backend
- Mixed busy/unhealthy states

### 10.8 Integration Tests
- Load real backends from environment
- End-to-end request through balancer to backend
- Health check interval verification
- Busy state timeout behavior
- Queue processing across multiple priorities

---

## 11. Verification Criteria

A complete implementation must satisfy all requirements above and pass tests derived from each section. The test suite should cover:
- Every configuration option with valid and invalid values
- Every load balancer algorithm step
- Every health check condition (healthy, unhealthy, recovery)
- Every API endpoint with correct response format
- Every error scenario with appropriate status codes
- Debug mode enabled and disabled behavior
- Concurrency edge cases
