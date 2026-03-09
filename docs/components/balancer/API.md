# Balancer API

API endpoints provided by the balancer component.

## Overview

The balancer exposes several endpoints for:
- Request routing to backends
- Health monitoring
- Statistics and metrics
- Debug information

## Request Routing Endpoints

### `/v1/messages*` - Anthropic API

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes Anthropic-compatible API requests.

**Example**:
```bash
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"Hello"}]}'
```

### `/api/*` - Ollama API

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes Ollama-compatible API requests.

**Sub-endpoints**:
- `/api/generate` - Generate response
- `/api/chat` - Chat completion
- `/api/tags` - List models

### `/models*` - Model List

**Methods**: GET, POST, PUT, DELETE

**Description**: Routes model list requests.

## Health Endpoints

### `GET /health`

**Description**: Returns health status of all backends.

**Response**:
```json
{
  "status": "ok",
  "healthyBackends": 2,
  "totalBackends": 3,
  "busyBackends": 1,
  "idleBackends": 2
}
```

### `GET /health/:backendUrl`

**Description**: Manual health check for specific backend.

**Example**:
```bash
curl http://localhost:3001/health/http://host1:11434
```

### `GET /backends`

**Description**: Returns detailed backend information.

**Response**:
```json
{
  "backends": [
    {
      "url": "http://host1:11434",
      "healthy": true,
      "priority": 100,
      "utilizationPercent": 40,
      "apiTypes": ["openai", "ollama"]
    }
  ]
}
```

## Statistics Endpoints

### `GET /stats`

**Description**: Returns comprehensive system statistics.

**Response**:
```json
{
  "balancer": {...},
  "healthCheck": {...},
  "config": {...},
  "backendDetails": [...],
  "queueStats": {...}
}
```

### `GET /`

**Description**: Returns service information.

**Response**:
```json
{
  "name": "LLM Balancer",
  "version": "2.3",
  "status": "running"
}
```

## Debug Endpoints (When DEBUG=true)

### `GET /debug/stats`

**Description**: Debug statistics.

### `GET /debug/requests`

**Description**: Full request history.

### `GET /debug/requests/recent?n=10`

**Description**: Recent requests.

### `GET /debug/requests/backend/:id?limit=10`

**Description**: Backend-specific requests.

### `POST /debug/clear`

**Description**: Clear debug history.

## Error Responses

### 503 Service Unavailable

```json
{
  "error": "Service Unavailable",
  "message": "No backends configured or all backends unhealthy"
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

## Related Documentation

- [API Reference](../../api/ENDPOINTS.md) - Complete API documentation
- [Request/Response Formats](../../api/REQUEST_RESPONSE.md) - Data structures
- [Usage Guide](../../user/USAGE.md) - Usage examples
