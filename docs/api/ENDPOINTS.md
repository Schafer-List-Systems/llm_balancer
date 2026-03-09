# API Reference

Complete documentation of all API endpoints.

---

## Overview

The LLM Balancer exposes several API endpoints for:
- **Request routing** - Forward requests to backend servers
- **Health monitoring** - Check backend health status
- **Statistics** - Get detailed metrics and statistics
- **Debug** - Request tracking and debugging (when enabled)

---

## Request Routing Endpoints

These endpoints forward requests to backend servers.

### `/v1/messages*` - Anthropic API Format

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes Anthropic-compatible API requests to appropriate backends.

**Examples**:

```bash
# Create message
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

**Request Body**:
```json
{
  "model": "string",           // Model name
  "max_tokens": "number",      // Maximum tokens to generate
  "messages": [                // Message history
    {
      "role": "user|assistant|system",
      "content": "string"
    }
  ]
}
```

---

### `/api/*` - Ollama API Format

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes Ollama-compatible API requests to appropriate backends.

**Sub-endpoints**:

#### `/api/generate` - Generate Response

```bash
curl http://localhost:3001/api/generate \
  -d '{"model": "llama2", "prompt": "Hello, world!"}'
```

#### `/api/chat` - Chat Completion

```bash
curl -X POST http://localhost:3001/api/chat \
  -d '{
    "model": "llama2",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

#### `/api/tags` - List Models

```bash
curl http://localhost:3001/api/tags
```

**Request Body** (for generate):
```json
{
  "model": "string",
  "prompt": "string",
  "stream": "boolean",
  "options": {
    "temperature": "number",
    "top_p": "number"
  }
}
```

---

### `/models*` - Model List Endpoint

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes model list requests to appropriate backends.

**Example**:
```bash
curl http://localhost:3001/models
```

---

## Health and Status Endpoints

### `GET /health` - Health Check

**Description**: Returns health status of all backends.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-03-09T12:00:00.000Z",
  "port": 3001,
  "maxPayloadSize": 52428800,
  "maxPayloadSizeMB": 50,
  "healthyBackends": 2,
  "totalBackends": 3,
  "hasHealthyBackends": true,
  "busyBackends": 1,
  "idleBackends": 2,
  "overloadedBackends": 0,
  "availableBackends": 2,
  "backends": [
    {
      "url": "http://host1:11434",
      "healthy": true,
      "busy": false,
      "overloaded": false,
      "available": true,
      "priority": 100,
      "maxConcurrency": 5,
      "activeRequestCount": 2,
      "utilizationPercent": 40
    },
    {
      "url": "http://host2:11434",
      "healthy": true,
      "busy": false,
      "overloaded": false,
      "available": true,
      "priority": 50,
      "maxConcurrency": 3,
      "activeRequestCount": 0,
      "utilizationPercent": 0
    },
    {
      "url": "http://host3:11434",
      "healthy": false,
      "busy": false,
      "overloaded": false,
      "available": false,
      "priority": 0,
      "maxConcurrency": 2,
      "activeRequestCount": 0,
      "utilizationPercent": 0
    }
  ]
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall status ("ok" or "error") |
| `healthyBackends` | number | Count of healthy backends |
| `totalBackends` | number | Total configured backends |
| `hasHealthyBackends` | boolean | Whether any backends are healthy |
| `busyBackends` | number | Count of backends with active requests |
| `idleBackends` | number | Count of backends without active requests |
| `overloadedBackends` | number | Count of backends at max concurrency |
| `availableBackends` | number | Count of backends below max concurrency |

---

### `GET /health/:backendUrl` - Manual Health Check

**Description**: Triggers an immediate health check for a specific backend.

**Example**:
```bash
curl http://localhost:3001/health/http://host1:11434
```

**Response**:
```json
{
  "healthy": true,
  "url": "http://host1:11434",
  "timestamp": "2026-03-09T12:00:00.000Z"
}
```

---

### `GET /backends` - Backend List

**Description**: Returns detailed information about all backends.

**Response**:
```json
{
  "backends": [
    {
      "url": "http://host1:11434",
      "priority": 100,
      "maxConcurrency": 5,
      "healthy": true,
      "busy": false,
      "overloaded": false,
      "available": true,
      "activeRequestCount": 2,
      "maxConcurrency": 5,
      "utilizationPercent": 40,
      "requestCount": 42,
      "errorCount": 1,
      "failCount": 0,
      "models": ["llama2", "mistral"],
      "apiTypes": ["openai", "ollama"],
      "endpoints": {
        "openai": "/v1/models",
        "ollama": "/api/tags"
      }
    }
  ]
}
```

---

### `GET /stats` - System Statistics

**Description**: Returns comprehensive system statistics.

**Response**:
```json
{
  "balancer": {
    "totalBackends": 3,
    "healthyBackends": 2,
    "unhealthyBackends": 1,
    "backends": [...],
    "requestCounts": {...}
  },
  "healthCheck": {
    "totalBackends": 3,
    "healthyBackends": 2,
    "unhealthyBackends": 1,
    "interval": 30000,
    "timeout": 5000
  },
  "config": {
    "healthCheckInterval": 30000,
    "healthCheckTimeout": 5000,
    "maxRetries": 3,
    "maxPayloadSize": "52428800",
    "maxPayloadSizeMB": 50,
    "maxQueueSize": 100,
    "queueTimeout": 30000
  },
  "busyBackends": 1,
  "idleBackends": 2,
  "overloadedBackends": 0,
  "availableBackends": 2,
  "backendDetails": [...],
  "queueStats": {
    "maxQueueSize": 100,
    "queueTimeout": 30000,
    "queues": {
      "0": {
        "depth": 0,
        "oldestRequestAge": 0,
        "isFull": false
      }
    }
  }
}
```

---

### `GET /` - Service Info

**Description**: Returns basic service information.

**Response**:
```json
{
  "name": "LLM Balancer",
  "version": "2.3",
  "port": 3001,
  "status": "running",
  "timestamp": "2026-03-09T12:00:00.000Z"
}
```

---

## Debug Endpoints (When DEBUG=true)

### `GET /debug/stats` - Debug Statistics

**Description**: Returns debug mode statistics.

**Response**:
```json
{
  "enabled": true,
  "totalRequests": 100,
  "queueSize": 0,
  "requestHistorySize": 100
}
```

---

### `GET /debug/requests` - Full Request History

**Description**: Returns all tracked requests.

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
    "requestContent": {...},
    "responseContent": {...}
  }
]
```

---

### `GET /debug/requests/recent` - Recent Requests

**Description**: Returns the most recent N requests.

**Query Parameters**:
- `n` (optional): Number of requests (default: 10)

**Example**:
```bash
curl http://localhost:3001/debug/requests/recent?n=20
```

**Response**:
```json
{
  "count": 20,
  "limit": 20,
  "requests": [...]
}
```

---

### `GET /debug/requests/backend/:backendId` - Backend-Specific Requests

**Description**: Returns requests filtered by backend.

**URL Parameters**:
- `backendId`: Backend URL to filter by

**Query Parameters**:
- `limit` (optional): Number of requests (default: 10)

**Example**:
```bash
curl http://localhost:3001/debug/requests/backend/http://host1:11434?limit=10
```

**Response**:
```json
{
  "backendId": "http://host1:11434",
  "count": 5,
  "limit": 10,
  "requests": [...]
}
```

---

### `POST /debug/clear` - Clear Debug History

**Description**: Clears all debug request history.

**Response**:
```json
{
  "success": true,
  "message": "Debug history cleared"
}
```

---

## Error Responses

### 404 Not Found

```json
{
  "error": "Not Found",
  "message": "Route not found. Use /health to check status."
}
```

### 502 Bad Gateway

```json
{
  "error": "Bad Gateway",
  "message": "Backend unavailable",
  "backend": "http://host1:11434"
}
```

### 503 Service Unavailable

```json
{
  "error": "Service Unavailable",
  "message": "No backends configured or all backends unhealthy",
  "stats": {...},
  "queueStats": {...}
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "Error message here"
}
```

---

## CORS Headers

All responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Rate Limiting

The balancer implements rate limiting through:
- **Queue size limit** (`MAX_QUEUE_SIZE`)
- **Queue timeout** (`QUEUE_TIMEOUT`)
- **Concurrency limits** (`BACKEND_CONCURRENCY_N`)

---

## Authentication

Currently, the balancer does not implement authentication. For production use, consider:
- Using a reverse proxy with authentication
- Restricting access via firewall rules
- Using environment-based access control

---

## Next Steps

- [Request/Response Formats](REQUEST_RESPONSE.md) - Data structures
- [Integration Guide](INTEGRATION.md) - Integration examples
