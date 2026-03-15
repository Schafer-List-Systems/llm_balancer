# Debugging Guide

This document covers debug features, troubleshooting techniques, and development tools.

---

## Overview

The LLM Balancer provides comprehensive debug features for:
- Request tracking and history
- Backend selection debugging
- Queue state inspection
- Health check monitoring

---

## Enabling Debug Mode

### Environment Variable

```bash
export DEBUG=true
```

### .env File

```bash
# In llm-balancer/.env
DEBUG=true
DEBUG_REQUEST_HISTORY_SIZE=100
```

### Command Line

```bash
DEBUG=true npm start
```

---

## Debug Endpoints

### Debug Statistics

**Endpoint**: `GET /debug/stats`

**Response**:
```json
{
  "enabled": true,
  "totalRequests": 100,
  "queueSize": 0,
  "requestHistorySize": 100
}
```

**Use Case**: Quick check if debug mode is enabled and how many requests are tracked.

---

### Full Request History

**Endpoint**: `GET /debug/requests`

**Response**:
```json
[
  {
    "id": 1,
    "timestamp": 1698765400000,
    "route": "/v1/messages",
    "method": "POST",
    "priority": 100,
    "backendId": "http://host1:11434",
    "backendUrl": "http://host1:11434",
    "requestContent": {
      "model": "llama2",
      "messages": [{"role": "user", "content": "Hello"}]
    },
    "responseContent": {
      "data": "{\"model\":\"llama2\",\"response\":\"Hello!\"}",
      "contentType": "application/json",
      "statusCode": 200
    }
  }
]
```

**Use Case**: Review all tracked requests for troubleshooting.

---

### Recent Requests

**Endpoint**: `GET /debug/requests/recent?n=10`

**Query Parameters**:
- `n`: Number of recent requests (default: 10)

**Response**:
```json
{
  "count": 10,
  "limit": 10,
  "requests": [...]
}
```

**Use Case**: Quickly check the most recent requests.

---

### Backend-Specific Requests

**Endpoint**: `GET /debug/requests/backend/:backendId?limit=10`

**URL Parameters**:
- `backendId`: Backend URL to filter by

**Query Parameters**:
- `limit`: Maximum requests to return (default: 10)

**Response**:
```json
{
  "backendId": "http://host1:11434",
  "count": 5,
  "limit": 10,
  "requests": [...]
}
```

**Use Case**: Analyze requests handled by specific backend.

---

### Clear Debug History

**Endpoint**: `POST /debug/clear`

**Response**:
```json
{
  "success": true,
  "message": "Debug history cleared"
}
```

**Use Case**: Clear history to start fresh tracking.

---

## Debugging Scenarios

### Scenario 1: Request Routing Issues

**Problem**: Requests not going to expected backend.

**Debug Steps**:
```bash
# Enable debug mode
DEBUG=true npm start

# Make a request
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"Test"}]}'

# Check which backend handled it
curl http://localhost:3001/debug/requests/recent?n=1 | jq '.requests[0].backendUrl'

# Check all requests to that backend
curl http://localhost:3001/debug/requests/backend/http://host1:11434?limit=20
```

**Analysis**:
- Check `priority` field to see if priority-based selection working
- Check `backendUrl` to verify correct backend selection
- Check `requestContent` to verify request body

---

### Scenario 2: Queue Behavior

**Problem**: Requests being queued unexpectedly.

**Debug Steps**:
```bash
# Check queue statistics
curl http://localhost:3001/stats | jq '.queueStats'

# Check backend utilization
curl http://localhost:3001/backends | jq '.backends[] | {url, activeRequestCount, maxConcurrency}'

# View recent requests to see queuing pattern
curl http://localhost:3001/debug/requests/recent?n=50 | jq '.requests[] | {timestamp, backendUrl}'
```

**Analysis**:
- High `activeRequestCount` indicates backends at capacity
- Check `maxConcurrency` settings
- Look for patterns in request timing

---

### Scenario 3: Backend Health Issues

**Problem**: Backends showing as unhealthy.

**Debug Steps**:
```bash
# Check health status
curl http://localhost:3001/health | jq '.backends[] | {url, healthy, failCount}'

# Check detailed stats
curl http://localhost:3001/stats | jq '.backendDetails[] | {url, healthy, failCount, models}'

# Manually trigger health check
curl http://localhost:3001/health/http://host1:11434

# Check backend directly
curl http://host1:11434/api/tags
```

**Analysis**:
- High `failCount` indicates persistent issues
- Check if backend is actually running
- Verify network connectivity

---

### Scenario 4: API Detection Issues

**Problem**: Backends not showing correct API types.

**Debug Steps**:
```bash
# Check startup logs for API detection
docker compose logs llm-balancer | grep -i "api\|detect"

# Check backend info
curl http://localhost:3001/backends | jq '.backends[] | {url, apiTypes, models}'

# Manually test API endpoints
curl http://host1:11434/v1/models
curl http://host1:11434/api/tags
```

**Analysis**:
- Check if backend supports the expected APIs
- Verify endpoint responses
- Check for API-specific errors

---

### Scenario 5: Concurrency Issues

**Problem**: Backends staying busy or not releasing requests.

**Debug Steps**:
```bash
# Check active request counts
curl http://localhost:3001/stats | jq '.backendDetails[] | {url, activeRequestCount, busy}'

# Check utilization
curl http://localhost:3001/backends | jq '.backends[] | {url, utilizationPercent}'

# View recent request timing
curl http://localhost:3001/debug/requests/recent?n=100 | jq '.requests | group_by(.backendUrl) | map({backend: .[0].backendUrl, count: length, avgTime: (map(.timestamp) | add / length)})'
```

**Analysis**:
- `activeRequestCount` should decrease after request completes
- High utilization indicates backends at capacity
- Long request times may indicate slow backends

---

## Console Debug Output

### Enable Verbose Logging

```bash
# Add to .env
DEBUG=true
```

### Expected Console Output

```
[Config] Loaded configuration
[Config] Backends: 3
[BackendInfo] Detecting capabilities for http://host1:11434
[BackendInfo]   OpenAI: supported, models: [llama2, mistral]
[BackendInfo]   Ollama: supported, models: [llama2]
[BackendInfo] Detection complete for http://host1:11434
[HealthChecker] Starting health checks (interval: 30000ms)
[Server] Listening on port 3001
[HealthChecker] Health check complete: 2 healthy, 1 unhealthy
```

---

## Debugging Tools

### jq for JSON Parsing

```bash
# Pretty print JSON
curl http://localhost:3001/stats | jq

# Extract specific field
curl http://localhost:3001/stats | jq '.balancer.healthyBackends'

# Filter array
curl http://localhost:3001/backends | jq '.backends[] | select(.healthy == true)'
```

### Watch Mode

```bash
# Watch health status
watch -n 2 'curl -s http://localhost:3001/health | jq'

# Watch backend stats
watch -n 2 'curl -s http://localhost:3001/stats | jq .backendDetails[] | {url, activeRequestCount, healthy}'
```

### Docker Logs

```bash
# View all logs
docker compose logs -f

# Filter for specific service
docker compose logs -f llm-balancer

# Filter for errors
docker compose logs -f | grep -i error
```

---

## Common Debug Patterns

### Request Flow Analysis

```bash
# Track request from client to backend
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"Test"}]}'

# Immediately check which backend handled it
curl http://localhost:3001/debug/requests/recent?n=1 | jq '.requests[0]'
```

### Backend Comparison

```bash
# Compare request distribution across backends
curl http://localhost:3001/debug/requests | jq 'group_by(.backendUrl) | map({backend: .[0].backendUrl, count: length})'
```

### Performance Analysis

```bash
# Calculate request timing
curl http://localhost:3001/debug/requests | jq '
  . as $requests |
  $requests |
  group_by(.backendUrl) |
  map({
    backend: .[0].backendUrl,
    count: length,
    avgTimestamp: (map(.timestamp) | add / length)
  })
'
```

---

## Debug Configuration

### Request History Size

```bash
# Default: 100 requests
DEBUG_REQUEST_HISTORY_SIZE=100

# Larger history for extended debugging
DEBUG_REQUEST_HISTORY_SIZE=500
```

### Memory Considerations

Debug mode stores request/response content in memory:
- Large payloads increase memory usage
- Consider reducing history size in production
- Clear history periodically with `/debug/clear`

---

## Security Note

Debug endpoints expose request/response content:
- Disable in production: `DEBUG=false`
- Use reverse proxy authentication
- Restrict access via firewall
- Never expose debug endpoints publicly

---

## Related Documentation

- [API Reference](../api/ENDPOINTS.md#api-reference) - Debug endpoints
- [Testing Guide](TESTING.md#testing-guide) - Test debugging
- [Troubleshooting](../user/TROUBLESHOOTING.md#common-issues) - Common issues
