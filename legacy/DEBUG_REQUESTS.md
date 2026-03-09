# Debug Requests Documentation

## Overview

The debug requests feature provides detailed information about every request processed by the LLM Balancer. It tracks request metadata, request content, and response content for troubleshooting and monitoring purposes.

## Enabling Debug Mode

To enable debug mode, set the `DEBUG` environment variable to `true`:

```bash
export DEBUG=true
```

Or in your `.env` file:

```env
DEBUG=true
DEBUG_REQUEST_HISTORY_SIZE=100  # Number of requests to keep (default: 100)
```

## What Gets Tracked

When enabled, the following information is tracked for each request:

### Request Metadata
- `id`: Unique request identifier
- `timestamp`: When the request was processed
- `route`: Request path (e.g., `/v1/messages`, `/api/generate`)
- `method`: HTTP method (GET, POST, etc.)
- `priority`: Priority level assigned to the request (0 = normal, higher = higher priority)
- `backendId`: ID of the backend that processed the request
- `backendUrl`: URL of the backend that processed the request

### Request Content
- Captured from the request body (if available)
- Stored as a string or buffer depending on request type

### Response Content
- Response data (parsed JSON or raw text)
- Content-Type header
- HTTP status code (for non-streaming responses)

## Debug Endpoints

### 1. Debug Statistics
```
GET /debug/stats
```

Returns summary statistics about debug request tracking:
- Total requests tracked
- Queue size
- Current index
- Request history size

**Example Response:**
```json
{
  "enabled": true,
  "totalRequests": 100,
  "queueSize": 0,
  "currentIndex": 0,
  "requestHistorySize": 100
}
```

### 2. Debug Request History
```
GET /debug/requests
```

Returns the full debug history with all tracked requests.

**Example Response:**
```json
[
  {
    "route": "/v1/messages",
    "method": "POST",
    "priority": 10,
    "backendId": 1,
    "backendUrl": "http://localhost:11434",
    "timestamp": 1634567890123,
    "id": 1,
    "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}",
    "responseContent": {
      "data": "{\"model\":\"llama2\",\"response\":\"Hello! How can I help you?\"}",
      "contentType": "application/json",
      "statusCode": 200
    }
  }
]
```

### 3. Recent Debug Requests
```
GET /debug/requests/recent?n=10
```

Returns the most recent N requests (default: 10).

**Query Parameters:**
- `n` (optional): Number of requests to return. Defaults to 10.

**Example Response:**
```json
{
  "count": 3,
  "limit": 3,
  "requests": [
    {
      "route": "/v1/messages",
      "method": "POST",
      "priority": 10,
      "backendId": 1,
      "backendUrl": "http://localhost:11434",
      "timestamp": 1772433937112,
      "id": 101,
      "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}",
      "responseContent": {
        "data": "{\"model\":\"llama2\",\"response\":\"Hello! How can I help you?\"}",
        "contentType": "application/json",
        "statusCode": 200
      }
    },
    {
      "route": "/v1/messages",
      "method": "POST",
      "priority": 5,
      "backendId": 2,
      "backendUrl": "http://localhost:11435",
      "timestamp": 1772433936000,
      "id": 102,
      "requestContent": "{\"model\":\"mistral\",\"messages\":[{\"role\":\"user\",\"content\":\"Test\"}]}",
      "responseContent": {
        "data": "{\"model\":\"mistral\",\"response\":\"Response content\"}",
        "contentType": "application/json",
        "statusCode": 200
      }
    }
  ]
}
```

### 4. Backend-Specific Debug Requests
```
GET /debug/requests/backend/:backendId?limit=10
```

Returns debug requests filtered by specific backend ID. Useful for monitoring request distribution, debugging backend-specific issues, and comparing performance between backends.

**URL Parameters:**
- `backendId` (required): ID of the backend to filter by (e.g., "backend1", "backend2")
  - Matches the backend ID configured in your `.env` file

**Query Parameters:**
- `limit` (optional): Number of requests to return. Defaults to 10.
  - Maximum recommended: 100 (to avoid large responses)

**Example Usage:**
```bash
# Get last 5 requests for backend1
curl http://localhost:3001/debug/requests/backend/backend1?limit=5

# Get all requests for backend2 (default limit 10)
curl http://localhost:3001/debug/requests/backend/backend2

# Get last 20 requests for backend3
curl http://localhost:3001/debug/requests/backend/backend3?limit=20
```

**Example Response:**
```json
{
  "backendId": "backend1",
  "count": 3,
  "limit": 5,
  "requests": [
    {
      "id": 201,
      "timestamp": 1772433937123,
      "route": "/v1/messages",
      "method": "POST",
      "priority": 10,
      "backendId": "backend1",
      "backendUrl": "http://localhost:11435",
      "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
    }
  ]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `backendId` | string | The backend ID used for filtering |
| `count` | integer | Number of requests found for this backend |
| `limit` | integer | The limit parameter used in the request |
| `requests` | array | Array of request objects matching the filter |

**Use Cases:**
1. **Monitor Request Distribution**: See how many requests are being sent to each backend
2. **Debug Backend-Specific Issues**: Isolate issues to a particular backend
3. **Performance Comparison**: Compare response times and success rates across backends
4. **Traffic Analysis**: Analyze which backends handle most of the load

**Error Handling:**
- If no requests found: `{ "backendId": "backend", "count": 0, "limit": 10, "requests": [] }`
- If backend ID not provided: `{ "error": "Backend ID is required" }`

**Use Cases for Backend-Specific Debug:**
- Track which backends are handling the majority of requests
- Isolate performance issues to specific backends
- Compare success rates across different backend configurations
- Analyze traffic patterns per backend

### 5. Clear Debug History
```
POST /debug/clear
```

Clears the entire debug request history.

**Example Response:**
```json
{
  "success": true,
  "message": "Debug history cleared"
}
```

## Use Cases

### Troubleshooting Request Failures
Use the debug history to identify why specific requests are failing:
1. Check `responseContent.statusCode` for error responses (e.g., 500, 503)
2. Check `responseContent.data` for error messages
3. Compare `requestContent` to see what was sent
4. Check `backendUrl` to see if a specific backend is problematic

### Monitoring Backend Performance
Track which backends are being used and how often:
1. Use `/debug/requests` and filter by `backendId` or `backendUrl`
2. Use `/debug/requests/backend/:backendId` for backend-specific requests
3. Check `responseContent.statusCode` for success vs failure
4. Look for patterns in successful vs failed requests per backend

**Backend-Specific Debug Example:**
```bash
# Check which backends are handling requests
curl http://localhost:3001/debug/requests/recent?n=20 | jq '.requests | group_by(.backendId) | map({backend: .[0].backendId, count: length})'

# Debug specific backend performance
curl http://localhost:3001/debug/requests/backend/backend1?limit=50 | jq '.requests | group_by(.responseContent.statusCode) | map({status: .[0].responseContent.statusCode, count: length})'
```

### Debugging Queue Behavior
Understand how requests are queued and assigned:
1. Check `priority` levels and how they affect routing
2. Monitor backend assignment by `backendId` and `backendUrl`
3. Track timestamp differences to understand timing

### Inspecting Request/Response Content
Debug complex interactions by examining full request and response:
1. View `requestContent` to see the exact payload sent to the backend
2. View `responseContent.data` to see the backend's response
3. Check `responseContent.contentType` to understand response format (e.g., application/json, text/event-stream)

## Example Workflow

### Enable Debug Mode
```bash
# Set environment variable
export DEBUG=true

# Start the balancer
node index.js
```

### Check Debug Statistics
```bash
curl http://localhost:3001/debug/stats
```

**Example Output:**
```json
{
  "enabled": true,
  "totalRequests": 100,
  "queueSize": 0,
  "currentIndex": 0,
  "requestHistorySize": 100
}
```

### View Recent Requests

```bash
# Last 5 requests
curl http://localhost:3001/debug/requests/recent?n=5
```

**Example Output:**
```json
{
  "count": 2,
  "limit": 2,
  "requests": [
    {
      "route": "/v1/messages",
      "method": "POST",
      "priority": 10,
      "backendId": 1,
      "backendUrl": "http://localhost:11434",
      "timestamp": 1772433937112,
      "id": 101,
      "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}",
      "responseContent": {
        "data": "{\"model\":\"llama2\",\"response\":\"Hello! How can I help you?\"}",
        "contentType": "application/json",
        "statusCode": 200
      }
    },
    {
      "route": "/v1/messages",
      "method": "POST",
      "priority": 5,
      "backendId": 2,
      "backendUrl": "http://localhost:11435",
      "timestamp": 1772433936000,
      "id": 102,
      "requestContent": "{\"model\":\"mistral\",\"messages\":[{\"role\":\"user\",\"content\":\"Test\"}]}",
      "responseContent": {
        "data": "{\"model\":\"mistral\",\"response\":\"Response content\"}",
        "contentType": "application/json",
        "statusCode": 200
      }
    }
  ]
}
```

### View Full Debug History

```bash
curl http://localhost:3001/debug/requests
```

**Example Output:**
```json
[
  {
    "id": 1,
    "timestamp": 1698765400000,
    "route": "/v1/messages",
    "method": "POST",
    "priority": 0,
    "backendId": 1,
    "backendUrl": "http://localhost:11434",
    "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Test message\"}]}",
    "responseContent": "{\"model\":\"llama2\",\"response\":\"Test response\"}",
    "contentType": "application/json",
    "statusCode": 200
  },
  {
    "id": 2,
    "timestamp": 1698765410000,
    "route": "/api/generate",
    "method": "POST",
    "priority": 0,
    "backendId": 2,
    "backendUrl": "http://localhost:11435",
    "requestContent": "{\"model\":\"mistral\",\"prompt\":\"Generate text\",\"stream\":false}",
    "responseContent": "{\"model\":\"mistral\",\"response\":\"Generated text content\"}",
    "contentType": "application/json",
    "statusCode": 200
  }
]
```

### Clear Debug History

```bash
curl -X POST http://localhost:3001/debug/clear
```

**Example Output:**
```json
{
  "success": true,
  "message": "Debug history cleared"
}
```

### Backend-Specific Debug

Monitor and analyze requests by specific backend:

```bash
# Get last 10 requests for a specific backend
curl http://localhost:3001/debug/requests/backend/backend1?limit=10
```

**Example Output:**
```json
{
  "backendId": "backend1",
  "count": 5,
  "limit": 10,
  "requests": [
    {
      "id": 101,
      "timestamp": 1698765400000,
      "route": "/v1/messages",
      "method": "POST",
      "priority": 10,
      "backendId": "backend1",
      "backendUrl": "http://localhost:11435",
      "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Test\"}]}"
    }
  ]
}
```

**Use Cases:**
- Compare performance across multiple backends
- Isolate issues to specific backends
- Track request distribution per backend
- Analyze which backends are handling most traffic

### Troubleshooting with Priority Levels

```bash
# Make a priority 5 request
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"High priority task"}]}' \
  -H 'priority: 5'

# Check which backend handled it
curl http://localhost:3001/debug/requests/recent?n=1 | jq '.requests[0].backendId'

# Check backend 2 specifically
curl http://localhost:3001/debug/requests | jq '.[] | select(.backendId == 2) | {route, priority, timestamp}'
```

**Example Output:**
```bash
$ curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"High priority task"}]}' \
  -H 'priority: 5'

{"model":"llama2","response":"High priority task processed"}
```

```bash
$ curl http://localhost:3001/debug/requests/recent?n=1 | jq '.requests[0].backendId'

2
```

```bash
$ curl http://localhost:3001/debug/requests | jq '.[] | select(.backendId == 2) | {route, priority, timestamp}'

[
  {
    "route": "/v1/messages",
    "priority": 5,
    "timestamp": 1698765432100
  }
]
```

## Performance Considerations

- Debug mode captures request/response content, which can consume memory
- Set `DEBUG_REQUEST_HISTORY_SIZE` appropriately based on your needs
- Use `/debug/requests/recent` instead of `/debug/requests` for large histories
- Clear the history periodically using `/debug/clear` if memory becomes an issue

## Security Note

Debug endpoints expose request/response content in the response body. Ensure these endpoints are protected in production environments or only accessible from trusted networks.

## Limitations

- Only requests that reach the load balancer are tracked
- Requests to other endpoints (not `/v1/messages*`, `/api/*`, `/models*`) are not tracked
- Large request/response payloads may be truncated or impact performance
- Debug history is stored in memory and resets on restart
- Backend-specific tracking requires that the backend ID is properly assigned to each request
