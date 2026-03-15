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

---

### `GET /api/tags` - Ollama Models (Aggregated)

**Description**: Returns aggregated model listings from all healthy Ollama backends.

**Response**:
```json
{
  "models": [
    {
      "name": "llama3:latest",
      "model": "llama3:latest",
      "size": 4700000000,
      "digest": "abc123def456",
      "details": {
        "format": "ollama",
        "family": "llama",
        "families": ["llama"],
        "parameter_size": "7B",
        "quantization_level": "q4_0"
      }
    },
    {
      "name": "mistral:7b",
      "size": 4100000000,
      "digest": "def456abc789",
      "details": {
        "format": "ollama",
        "family": "llama",
        "families": ["llama"],
        "parameter_size": "7B",
        "quantization_level": "q4_0"
      }
    }
  ]
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Model name |
| `model` | string | Model name (duplicate for compatibility) |
| `size` | number | Estimated model size in bytes |
| `digest` | string | SHA256 digest of the model |
| `details` | object | Model metadata |
| `details.format` | string | API format (e.g., "ollama") |
| `details.family` | string | Model family (e.g., "llama", "gpt", "gemini") |
| `details.parameter_size` | string | Estimated parameter count (e.g., "7B", "70B") |

**Note**: This endpoint aggregates models from all healthy Ollama backends. Duplicate model names across backends are handled by including the model only once (from the first backend).

---

#### `/api/generate` - Generate Response

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

## Model Listing Endpoints (Aggregated)

These endpoints provide aggregated model listings from all healthy backends of a specific API type. Unlike the routed endpoints, these aggregate models across backends and filter by health status.

### `GET /v1/models` - OpenAI-Compatible Models

**Description**: Returns aggregated model listings from all healthy OpenAI and Groq-compatible backends.

**Response**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "llama-3.1-70b",
      "object": "model",
      "owned_by": "bgroqp1a2b3c"
    },
    {
      "id": "gpt-4",
      "object": "model",
      "owned_by": "bopena1b2c3d"
    },
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "owned_by": "bopena1b2c3d"
    }
  ]
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `object` | string | Always "list" |
| `data` | array | Array of model objects |
| `data[].id` | string | Model identifier |
| `data[].object` | string | Always "model" |
| `data[].owned_by` | string | Backend identifier (hash of backend URL) |

**Example**:
```bash
curl http://localhost:3001/v1/models
```

---

### `GET /openai/v1/models` - Groq-Compatible Models

**Description**: Returns aggregated model listings from all healthy Groq backends. Uses the same format as `/v1/models`.

**Response**: Same as `/v1/models`

**Example**:
```bash
curl http://localhost:3001/openai/v1/models
```

---

### `GET /v1beta/models` - Google Vertex AI Models

**Description**: Returns aggregated model listings from all healthy Google Vertex AI backends.

**Response**:
```json
{
  "models": [
    {
      "name": "gemini-pro",
      "displayName": "Gemini Pro",
      "description": "Model served via bgoogle1a2b3c",
      "createTime": "2026-03-15T12:00:00.000Z",
      "updateTime": "2026-03-15T12:00:00.000Z"
    },
    {
      "name": "textembedding-gecko",
      "displayName": "Textembedding Gecko",
      "description": "Model served via bgoogle1a2b3c",
      "createTime": "2026-03-15T12:00:00.000Z",
      "updateTime": "2026-03-15T12:00:00.000Z"
    }
  ]
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `models` | array | Array of model objects |
| `models[].name` | string | Model identifier |
| `models[].displayName` | string | Human-readable display name |
| `models[].description` | string | Description including backend identifier |
| `models[].createTime` | string | ISO timestamp |
| `models[].updateTime` | string | ISO timestamp |

**Example**:
```bash
curl http://localhost:3001/v1beta/models
```

---

### `GET /api/tags` - Ollama Models (Aggregated)

**Description**: Returns aggregated model listings from all healthy Ollama backends.

**Response**:
```json
{
  "models": [
    {
      "name": "llama3:latest",
      "model": "llama3:latest",
      "size": 4700000000,
      "digest": "abc123def456",
      "details": {
        "format": "ollama",
        "family": "llama",
        "families": ["llama"],
        "parameter_size": "7B",
        "quantization_level": "q4_0"
      }
    },
    {
      "name": "mistral:7b",
      "size": 4100000000,
      "digest": "def456abc789",
      "details": {
        "format": "ollama",
        "family": "llama",
        "families": ["llama"],
        "parameter_size": "7B",
        "quantization_level": "q4_0"
      }
    }
  ]
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `models` | array | Array of model objects |
| `models[].name` | string | Model name |
| `models[].model` | string | Model name (duplicate for compatibility) |
| `models[].size` | number | Estimated model size in bytes |
| `models[].digest` | string | SHA256 digest of the model |
| `models[].details` | object | Model metadata |
| `models[].details.format` | string | API format (e.g., "ollama") |
| `models[].details.family` | string | Model family (e.g., "llama", "gpt", "gemini") |
| `models[].details.parameter_size` | string | Estimated parameter count (e.g., "7B", "70B") |

**Example**:
```bash
curl http://localhost:3001/api/tags
```

---

## Aggregation Features

### Health Filtering

All model listing endpoints filter by backend health status:
- Only **healthy** backends are included
- Unhealthy backends are automatically excluded
- Health status is checked at request time

### Duplicate Handling

If multiple backends serve the same model name:
- The model appears **once** (from the first backend in the pool)
- Additional backends with the same model are logged but skipped
- Backend identifier (`owned_by`) distinguishes which backend served each model

### Model Family Detection

Ollama format includes automatic model family detection:
- `llama`: Models based on Llama architecture (Llama, Mistral, Gemma)
- `gpt`: GPT-series models
- `gemini`: Gemini models
- `phi`: Phi models
- `qwen`: Qwen models
- `unknown`: Unrecognized model families

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

- [Request/Response Formats](REQUEST_RESPONSE.md#requestresponse-formats) - Data structures
- [Integration Guide](INTEGRATION.md#integration-guide) - Integration examples
