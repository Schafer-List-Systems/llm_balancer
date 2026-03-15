# Queue Processing

This document describes how the balancer processes requests when backends are busy or unavailable.

## Overview

The balancer uses a **status-based backend selection** approach to determine how to handle queued requests:

1. **Found**: Backend is available → Process immediately
2. **Busy**: Backend exists but all are busy → Stay in queue
3. **None**: No backend supports the model → Reject immediately

This ensures that requests for unsupported models never hang in the queue.

## Status-Based Processing Flow

### Step 1: Backend Selection

When a request is ready to be processed, the balancer calls `selectBackendWithCache()`:

```javascript
const result = selector.selectBackendWithCache(backends, criterion, promptBody);
```

The method returns a status object:

```javascript
{
  status: 'found' | 'busy' | 'none',
  backend: Backend|null,
  actualModel: string|null,
  message: string|null
}
```

### Step 2: Process Based on Status

#### Status: `'found'`

**Condition**: A healthy, available backend that supports the requested model was found.

**Action**:
1. Clear the request timeout
2. Log backend selection
3. Trigger request processing to the backend
4. Remove request from queue

**Example Log Output**:
```
[2026-03-15T11:03:06.785Z] [Balancer][req-0001] BACKEND SELECTED: http://backend1:11434
[2026-03-15T11:03:06.785Z] [Balancer][req-0001] Model: llama-3
```

#### Status: `'busy'`

**Condition**: Backends support the model, but all are currently at max concurrency.

**Action**:
1. Keep request in queue
2. Wait for `notifyBackendAvailable()` to be called
3. Re-process when backend becomes available

**Example Log Output**:
```
[2026-03-15T11:03:06.785Z] [Balancer][req-0001] All backends supporting this model are currently busy. Request stays in queue.
```

#### Status: `'none'`

**Condition**: No healthy backend supports the requested model.

**Action**:
1. Reject the request with error message
2. Clear the request timeout
3. Remove request from queue immediately
4. Queue depth stays at 0 (no hanging requests)

**Example Log Output**:
```
[2026-03-15T11:03:06.785Z] [Balancer][req-0001] No backend supports this model. Rejecting request.
```

**Example Error Response**:
```json
{
  "error": "Service Unavailable",
  "message": "No backend supports this model",
  "queueStats": [{
    "depth": 0,
    "maxQueueSize": 100,
    "queueTimeout": 900000,
    "oldestRequestAge": 0,
    "isFull": false
  }]
}
```

## Queue Depth Guarantees

The status-based approach provides the following queue depth guarantees:

| Scenario | Queue Depth |
|----------|-------------|
| All backends healthy and available | 0 (immediate processing) |
| All backends busy | Up to `MAX_QUEUE_SIZE` |
| No backend supports model | Always 0 (immediate rejection) |
| Queue full | 503 error returned |

## Timeout Handling

Each queued request has a timeout that can expire:

```javascript
timeout: setTimeout(() => {
    reject(new Error('Request timeout'));
}, this.queueTimeout)
```

**When timeout expires**:
1. Request is rejected with "Request timeout" error
2. Timeout is cleared
3. Request is removed from queue
4. Queue depth decreases by 1

**Note**: The timeout is only cleared when:
- Backend is found and request is processed
- No backend supports the model (rejected immediately)
- Timeout expires

## Model Validation

The balancer distinguishes between:

1. **Temporary unavailability**: Backend exists but is busy → Stay in queue
2. **Permanent model mismatch**: No backend supports model → Reject immediately

This is determined by `hasBackendForModel()`:

```javascript
// Check if ANY healthy backend supports this model (regardless of availability)
const hasModel = selector.hasBackendForModel(healthyBackends, modelString);

if (!hasModel) {
  return { status: 'none', message: 'No backend supports this model' };
}
```

## Queue Processing Loop

The main processing loop in `processQueueWhenBackendAvailable()`:

```javascript
for (let i = 0; i < queue.length; i++) {
  const request = queue[i];

  // Check if timeout expired
  if (request.timedOut) {
    queue.splice(i, 1);
    continue;
  }

  // Get selection result
  const result = selector.selectBackendWithCache(backends, request.criterion, promptBody);

  if (result.status === 'found') {
    // Process immediately
    triggerRequestProcessing(request, result.backend);
    return; // Only process one request per call
  }

  if (result.status === 'none') {
    // Reject immediately
    clearTimeout(request.timeout);
    queue.splice(i, 1);
    request.reject(new Error(result.message));
    continue; // Try next request
  }

  // status === 'busy' - stay in queue
  // Do nothing, request remains in queue
}
```

## Debugging

### Check Queue Contents

Use the debug endpoint to see what's in the queue:

```bash
curl http://localhost:3001/queue/contents
```

Response format:
```json
{
  "totalQueued": 2,
  "maxQueueSize": 100,
  "queueTimeout": 900000,
  "contents": [
    {
      "index": 0,
      "timestamp": 1773572318825,
      "age": 12345,
      "criterion": { "modelString": "llama-3", "apiType": "openai" },
      "hasRequestData": true,
      "hasTimeout": true,
      "timedOut": false,
      "requestData": {
        "model": "llama-3",
        "apiType": "chat/completions"
      }
    }
  ]
}
```

### Check Queue Stats

```bash
curl http://localhost:3001/stats | jq '.queueStats'
```

Response format:
```json
[
  {
    "depth": 0,
    "maxQueueSize": 100,
    "queueTimeout": 900000,
    "oldestRequestAge": 0,
    "isFull": false
  }
]
```

## Related Documentation

- [Configuration](CONFIGURATION.md#configuration) - Queue configuration options
- [API Reference](API.md#api-reference) - Error responses
- [Architecture](../../developer/ARCHITECTURE.md#system-architecture) - System architecture overview
