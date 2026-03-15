# Request/Response Formats

This document describes the data structures and formats used in API requests and responses.

---

## Backend Data Structures

### Backend Object

Represents a single backend server.

```json
{
  "url": "http://host1:11434",
  "priority": 100,
  "maxConcurrency": 5,
  "healthy": true,
  "busy": false,
  "overloaded": false,
  "available": true,
  "activeRequestCount": 2,
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
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Backend server URL |
| `priority` | number | Priority level (higher = preferred) |
| `maxConcurrency` | number | Maximum concurrent requests |
| `healthy` | boolean | Whether backend is healthy |
| `busy` | boolean | Whether backend has active requests |
| `overloaded` | boolean | Whether backend is at max concurrency |
| `available` | boolean | Whether backend can accept more requests |
| `activeRequestCount` | number | Current number of active requests |
| `utilizationPercent` | number | Utilization percentage (0-100) |
| `requestCount` | number | Total requests handled |
| `errorCount` | number | Total errors encountered |
| `failCount` | number | Consecutive health check failures |
| `models` | string[] | Available model names |
| `apiTypes` | string[] | Supported API types |
| `endpoints` | object | API endpoints by type |

---

### BackendInfo Object

Capability detection results for a backend.

```json
{
  "url": "http://host1:11434",
  "healthy": true,
  "apis": {
    "openai": {
      "supported": true,
      "modelListEndpoint": "/v1/models",
      "chatEndpoint": "/v1/chat/completions",
      "models": ["qwen/qwen3.5-35b-a3b", "llama2"]
    },
    "anthropic": {
      "supported": true,
      "modelListEndpoint": null,
      "chatEndpoint": "/v1/messages",
      "models": []
    },
    "ollama": {
      "supported": true,
      "modelListEndpoint": "/api/tags",
      "chatEndpoint": "/api/generate",
      "models": ["llama2", "mistral"]
    }
  },
  "models": {
    "openai": ["qwen/qwen3.5-35b-a3b", "llama2"],
    "anthropic": [],
    "ollama": ["llama2", "mistral"]
  },
  "endpoints": {
    "openai": "/v1/models",
    "anthropic": "/v1/messages",
    "ollama": "/api/tags"
  },
  "detectedAt": "2026-03-09T12:00:00.000Z"
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Backend URL |
| `healthy` | boolean | Health status |
| `apis` | object | API capabilities by type |
| `models` | object | Models by API type |
| `endpoints` | object | Endpoints by API type |
| `detectedAt` | string | Detection timestamp |

---

## Health Check Responses

### Health Status Response

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
    }
  ]
}
```

---

## Statistics Responses

### Full Statistics Response

```json
{
  "balancer": {
    "totalBackends": 3,
    "healthyBackends": 2,
    "unhealthyBackends": 1,
    "backends": [...],
    "requestCounts": {
      "http://host1:11434": 42,
      "http://host2:11434": 38,
      "queued": 0
    }
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

### Queue Statistics

```json
{
  "maxQueueSize": 100,
  "queueTimeout": 30000,
  "queues": {
    "0": {
      "depth": 0,
      "oldestRequestAge": 0,
      "isFull": false
    },
    "1": {
      "depth": 2,
      "oldestRequestAge": 5000,
      "isFull": false
    }
  }
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `maxQueueSize` | number | Maximum queue size |
| `queueTimeout` | number | Queue timeout in ms |
| `queues` | object | Per-priority queue stats |

---

## Debug Request Object

Tracked request in debug history.

```json
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
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  },
  "responseContent": {
    "data": "{\"model\":\"llama2\",\"response\":\"Hello! How can I help?\"}",
    "contentType": "application/json",
    "statusCode": 200
  }
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Sequential request ID |
| `timestamp` | number | Unix timestamp |
| `route` | string | Request path |
| `method` | string | HTTP method |
| `priority` | number | Backend priority |
| `backendId` | string | Backend identifier |
| `backendUrl` | string | Backend URL |
| `requestContent` | object | Request body |
| `responseContent` | object | Response data |

---

## Request Formats

### Anthropic API Message Request

```json
{
  "model": "llama2",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello, world!"}
  ]
}
```

### Ollama API Generate Request

```json
{
  "model": "llama2",
  "prompt": "Hello, world!",
  "stream": false,
  "options": {
    "temperature": 0.7,
    "top_p": 0.9
  }
}
```

### Ollama API Chat Request

```json
{
  "model": "llama2",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false
}
```

---

### Model Matching with Regex Patterns

The balancer supports flexible model name matching using regular expressions in the `model` field. This allows requests to match models across backends with different naming conventions.

#### Regex Pattern Format

Specify one or more regex patterns as comma-separated values:

**Single Exact Match (backward compatible):**
```json
{
  "model": "llama3",
  "messages": [...]
}
// Routes only to backends with exact "llama3" model
```

**Multiple Patterns with Precedence:**
```json
{
  "model": "llama3,qwen2.5,mistral",
  "messages": [...]
}
// First tries to match "llama3", then "qwen2.5", then "mistral"
// Pattern order determines precedence (first = highest priority)
```

**Regular Expression Patterns:**
```json
{
  "model": "^llama.*|^qwen.*",
  "messages": [...]
}
// Matches any model starting with "llama" OR "qwen"
// First matching pattern wins across all backends
```

**Wildcard for Any Model:**
```json
{
  "model": ".*",
  "messages": [...]
}
// Routes to highest priority available backend with any model
```

#### Model Name Replacement Behavior

When a regex pattern matches a backend's model, the balancer **automatically replaces** the requested pattern with the actual model name before forwarding:

**Request Sent to Balancer:**
```json
{
  "model": "^llama.*",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**Forwarded to Backend (if llama-3-8b matched):**
```json
{
  "model": "llama-3-8b",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

This ensures the backend receives a valid model name it actually supports.

#### Array Model Fields

When `model` is an array, patterns are evaluated in order:

**Request:**
```json
{
  "model": ["llama3", "qwen2.5"],
  "messages": [...]
}
```

The balancer evaluates both patterns and routes to the first backend that matches either pattern (prioritizing llama3). The forwarded request will have the actual matched model name in place of the pattern.

---

## Response Formats

### Anthropic API Message Response

```json
{
  "id": "msg_123",
  "model": "llama2",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "role": "assistant",
  "stop_reason": "end_of_turn",
  "stop_sequence": null
}
```

### Ollama API Generate Response

```json
{
  "model": "llama2",
  "response": "Hello! How can I help you today?",
  "done": true,
  "context": [1, 2, 3],
  "total_duration": 1234567,
  "load_duration": 123456,
  "prompt_eval_count": 10,
  "prompt_eval_duration": 100000,
  "eval_count": 20,
  "eval_duration": 1000000
}
```

### Ollama API Chat Response

```json
{
  "model": "llama2",
  "created_at": "2026-03-09T12:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you today?"
  },
  "done": true
}
```

### Ollama API Tags Response (Model List)

```json
{
  "models": [
    {
      "name": "llama2",
      "model": "llama2",
      "modified_at": "2026-03-09T12:00:00.000Z",
      "size": 1234567890,
      "digest": "sha256:abc123",
      "details": {
        "format": "gguf",
        "family": "llama",
        "families": null,
        "parameter_size": "3B",
        "quantization_level": "Q4_0"
      }
    }
  ]
}
```

### OpenAI API Models Response

```json
{
  "data": [
    {
      "id": "llama2",
      "object": "model",
      "owned_by": "organization-owner"
    }
  ]
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

## Query Parameters

### Recent Requests

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `n` | number | 10 | Number of recent requests |

### Backend-Specific Requests

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Maximum requests to return |

---

## Content Types

| Content Type | Usage |
|--------------|-------|
| `application/json` | API requests and responses |
| `text/event-stream` | Streaming responses |

---

## Next Steps

- [Integration Guide](INTEGRATION.md#integration-guide) - Integration examples
- [API Endpoints](ENDPOINTS.md#api-reference) - Complete API reference
