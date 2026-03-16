# Usage Guide

This guide covers how to configure and use the LLM Balancer.

## Basic Usage

### Starting the Balancer

```bash
cd llm-balancer
npm start
```

The load balancer will start on port 3001 (default).

### Accessing the Dashboard

1. Start the frontend:
   ```bash
   cd frontend
   npm run dev:build
   npm start
   ```

2. Open http://localhost:3080 in your browser

### Checking Health

```bash
curl http://localhost:3001/health
```

### Getting Statistics

```bash
# Per-backend statistics
curl http://localhost:3001/backends

# Complete system statistics
curl http://localhost:3001/stats
```

---

## Configuration

### Backend URLs

Configure your Ollama backend URLs:

#### JSON Configuration (Recommended)

```json
{
  "backends": [
    {
      "url": "http://localhost:11434",
      "name": "Backend 1",
      "priority": 1,
      "maxConcurrency": 10
    }
  ]
}
```

#### Multiple Backends

```json
{
  "backends": [
    {
      "url": "http://host1:11434",
      "name": "Host 1",
      "priority": 10,
      "maxConcurrency": 5
    },
    {
      "url": "http://host2:11434",
      "name": "Host 2",
      "priority": 5,
      "maxConcurrency": 3
    },
    {
      "url": "http://host3:11434",
      "name": "Host 3",
      "priority": 0,
      "maxConcurrency": 2
    }
  ]
}
```

#### Environment Variables (Legacy)

```bash
# Single backend
BACKENDS="http://localhost:11434"

# Multiple backends
BACKENDS="http://host1:11434,http://host2:11434,http://host3:11434"
```

### Priority-Based Load Balancing

Configure priority levels for each backend to prioritize specific servers:

#### JSON Configuration

```json
{
  "backends": [
    {
      "url": "http://fast-server:11434",
      "name": "Fast Server",
      "priority": 100,
      "maxConcurrency": 10
    },
    {
      "url": "http://medium-server:11434",
      "name": "Medium Server",
      "priority": 50,
      "maxConcurrency": 5
    },
    {
      "url": "http://slow-server:11434",
      "name": "Slow Server",
      "priority": 0,
      "maxConcurrency": 2
    }
  ]
}
```

#### Environment Variables (Legacy)

```bash
# Backend 0 - Priority 100 (highest)
BACKENDS="http://fast-server:11434,http://medium-server:11434,http://slow-server:11434"
BACKEND_PRIORITY_0=100

# Backend 1 - Priority 50 (medium)
BACKEND_PRIORITY_1=50

# Backend 2 - Priority 0 (lowest)
BACKEND_PRIORITY_2=0
```

**Priority values can be any integer:** Higher numbers indicate higher priority. Negative values are also supported.

#### How Priority Works

1. Backends are grouped by priority level
2. Priority tiers are sorted from highest to lowest
3. Requests are first routed to the highest priority tier
4. If no backend is available in a tier, immediately fall back to the next lower tier

---

### Concurrency-Based Load Limiting

Configure maximum parallel requests per backend:

#### JSON Configuration

```json
{
  "backends": [
    {
      "url": "http://fast-server:11434",
      "name": "Fast Server",
      "priority": 100,
      "maxConcurrency": 10
    },
    {
      "url": "http://slow-server:11434",
      "name": "Slow Server",
      "priority": 10,
      "maxConcurrency": 3
    }
  ]
}
```

#### Environment Variables (Legacy)

```bash
# Fast server - allow 5 concurrent requests
BACKEND_CONCURRENCY_0=5

# Slower server - allow only 2 concurrent requests
BACKEND_CONCURRENCY_1=2
```

**How Concurrency Works:**

- The balancer tracks `activeRequestCount` per backend
- New requests are only assigned when `activeRequestCount < maxConcurrency`
- When a backend reaches its limit, requests are queued or fall back to other backends
- Utilization percentage is calculated as: `activeRequestCount / maxConcurrency * 100`

---

### Health Check Configuration

#### JSON Configuration

```json
{
  "healthCheck": {
    "interval": 120000,
    "timeout": 5000
  }
}
```

#### Environment Variables (Legacy)

```bash
# Health check interval (default: 30 seconds)
HEALTH_CHECK_INTERVAL=30000

# Health check timeout (default: 5 seconds)
HEALTH_CHECK_TIMEOUT=5000
```

---

### Queue Configuration

#### JSON Configuration

```json
{
  "queue": {
    "timeout": 60000
  },
  "maxQueueSize": 200
}
```

#### Environment Variables (Legacy)

```bash
# Maximum queue size (default: 100)
MAX_QUEUE_SIZE=100

# Queue timeout (default: 30 seconds)
QUEUE_TIMEOUT=30000
```

---

### Request Timeout

#### JSON Configuration

```json
{
  "request": {
    "timeout": 600000
  }
}
```

Sets the maximum time to wait for a backend response (10 minutes in this example).

---

### Payload Size

#### JSON Configuration

```json
{
  "maxPayloadSize": 104857600
}
```

#### Environment Variables (Legacy)

```bash
# Maximum request payload size in bytes
# 50MB = 52428800
# 100MB = 104857600
# 200MB = 209715200
MAX_PAYLOAD_SIZE=104857600
```

---

### Shutdown Timeout

#### JSON Configuration

```json
{
  "shutdownTimeout": 120000
}
```

#### Environment Variables (Legacy)

```bash
# Time to wait for in-flight requests before force exit (default: 60 seconds)
SHUTDOWN_TIMEOUT=120000
```

---

### Debug Mode

#### JSON Configuration

```json
{
  "debug": {
    "enabled": true,
    "requestHistorySize": 200
  }
}
```

#### Environment Variables (Legacy)

```bash
DEBUG=true
DEBUG_REQUEST_HISTORY_SIZE=200
```

---

### Prompt Cache Configuration

#### JSON Configuration

```json
{
  "prompt": {
    "cache": {
      "maxSize": 10,
      "similarityThreshold": 0.9
    }
  }
}
```

#### Environment Variables (Legacy)

```bash
MAX_PROMPT_CACHE_SIZE=10
PROMPT_CACHE_SIMILARITY_THRESHOLD=0.9
```

---

### Model Matching with Regular Expressions

The balancer supports flexible model name matching using regular expressions. This is particularly useful when different backends provide models with different naming conventions (e.g., `llama3` vs `llama-3`, `qwen2.5` vs `qwen-2.5`).

#### How Model Matching Works

By default, the balancer uses **exact string matching** for model names. When you request a specific model, only backends that have an exact match are considered. With regex patterns, you can specify flexible matching criteria using comma-separated patterns:

```bash
# Request any llama3 variant OR qwen2.5 variant
"model": "llama3,qwen2.5"

# Use regex patterns for broader matching
"model": "^llama.*|^qwen.*"

# Wildcard to match any available model
"model": ".*"
```

#### Pattern Precedence Rules

Patterns are evaluated in **order of precedence** (first pattern = highest priority):

1. The balancer evaluates patterns from left to right
2. For each pattern, it checks ALL healthy backends before moving to the next pattern
3. The first pattern that matches any backend wins, regardless of backend priority
4. Only if no backends match a pattern does it proceed to the next one

**Example:** Requesting `"llama3,qwen2.5"`:
- First, check all backends for models matching `llama3`
- If found, route to that backend (even if qwen2.5 backend has higher priority)
- Only if no llama3 match is found, try matching `qwen2.5`

#### Regex Pattern Syntax

The balancer uses standard JavaScript regular expressions:

| Pattern | Description | Example Match |
|---------|-------------|---------------|
| `exact` | Exact model name match | `llama3` → only "llama3" |
| `.*` | Wildcard (any characters) | `.*` → any model name |
| `^prefix.*` | Starts with prefix (for prompt caching) | `^llama.*` → llama3, llama-3-8b, Llama-2 |
| `.*suffix$` | Ends with suffix | `.*70B$` → llama-3-70b, mistral-7b-70B |
| `pattern1\|pattern2` | Alternation (OR) | `llama.*\|^qwen.*` → any llama OR qwen models |

#### Practical Scenarios

**Scenario 1: Handling Different Naming Conventions**

Different backends may use different naming for the same model family:
- Backend A has: `Llama-3-70B`, `Mistral-7B-v0.3`
- Backend B has: `llama3`, `mistral`

Use flexible patterns to match all variants:

```bash
# Match both naming styles for llama and mistral
"model": "llama.*|^Llama.*,mistral.*|^Mistral.*"
```

**Scenario 2: Primary and Fallback Models**

Specify preferred models with fallback options:

```javascript
// Prefer llama3 variants, fall back to qwen if no llama available
{
  "model": "^llama.*",
  "messages": [...]
}
```

If no backend has a model matching `^llama.*`, the balancer can try additional patterns.

**Scenario 3: Catch-All for Any Available Model**

When you don't care which specific model is used, just want any available one:

```javascript
{
  "model": ".*",
  "messages": [...]
}
// Routes to highest priority backend with any model
```

#### Request Body Handling

When a regex pattern matches a backend's model, the balancer **automatically replaces** the requested model string with the actual model name from that backend:

**Request:**
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

#### Invalid Pattern Handling

If an invalid regex pattern is provided, the balancer:
1. Logs a warning with the error message
2. Skips that pattern and tries the next one
3. Continues until a valid match is found or all patterns are exhausted

**Example:**
```bash
# Invalid pattern (unclosed bracket) - will be skipped gracefully
"model": "[invalid,llama3"
# Falls back to matching "llama3" as exact string
```

---

## API Usage

### Anthropic API (Messages)

```bash
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

### Ollama API (Generate)

```bash
curl http://localhost:3001/api/generate \
  -d '{"model": "llama2", "prompt": "Hello, world!"}'
```

### Ollama API (Chat)

```bash
curl -X POST http://localhost:3001/api/chat \
  -d '{
    "model": "llama2",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### List Models

```bash
curl http://localhost:3001/api/tags
```

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/v1/messages*` | GET, POST, PUT, DELETE | Anthropic API format |
| `/api/*` | GET, POST, PUT, DELETE | Ollama API format |
| `/models*` | GET, POST, PUT, DELETE | Model list endpoint |
| `/health` | GET | Health check |
| `/stats` | GET | Detailed statistics |
| `/backends` | GET | Backend list |
| `/` | GET | Service info |

---

## Example Scenarios

### Scenario 1: Primary and Backup Backends

```json
{
  "backends": [
    {
      "url": "http://gpu-server:11434",
      "name": "GPU Server",
      "priority": 100,
      "maxConcurrency": 10
    },
    {
      "url": "http://cpu-server:11434",
      "name": "CPU Server",
      "priority": 10,
      "maxConcurrency": 5
    }
  ]
}
```

Requests will always prefer the GPU server. When it's busy or unavailable, requests fall back to the CPU server.

### Scenario 2: Load Distribution

```json
{
  "backends": [
    {
      "url": "http://fast-1:11434",
      "name": "Fast Server 1",
      "priority": 50,
      "maxConcurrency": 10
    },
    {
      "url": "http://fast-2:11434",
      "name": "Fast Server 2",
      "priority": 50,
      "maxConcurrency": 10
    },
    {
      "url": "http://slow-1:11434",
      "name": "Slow Server",
      "priority": 10,
      "maxConcurrency": 5
    }
  ]
}
```

Fast servers handle more concurrent requests. The slow server is used as a backup when fast servers are at capacity.

### Scenario 3: Cost Optimization

```json
{
  "backends": [
    {
      "url": "http://premium-1:11434",
      "name": "Premium Server",
      "priority": 100,
      "maxConcurrency": 5
    },
    {
      "url": "http://standard-1:11434",
      "name": "Standard Server",
      "priority": 50,
      "maxConcurrency": 10
    },
    {
      "url": "http://economy-1:11434",
      "name": "Economy Server",
      "priority": 0,
      "maxConcurrency": 15
    }
  ]
}
```

Premium backends are used first. Economy backends are only used when premium and standard are unavailable.

### Scenario 4: Complete Configuration

```json
{
  "version": "0.0.1",
  "port": 3001,
  "backends": [
    {
      "url": "http://gpu-server:11434",
      "name": "Primary GPU",
      "priority": 100,
      "maxConcurrency": 10
    },
    {
      "url": "http://cpu-server:11434",
      "name": "Backup CPU",
      "priority": 10,
      "maxConcurrency": 5
    }
  ],
  "healthCheck": {
    "interval": 60000,
    "timeout": 5000
  },
  "queue": {
    "timeout": 120000
  },
  "request": {
    "timeout": 600000
  },
  "maxRetries": 3,
  "maxPayloadSize": 104857600,
  "maxQueueSize": 200,
  "debug": {
    "enabled": false,
    "requestHistorySize": 100
  },
  "prompt": {
    "cache": {
      "maxSize": 5,
      "similarityThreshold": 0.85
    }
  }
}
```

---

## Monitoring

### Real-Time Health Status

```bash
# Watch health status
watch -n 5 'curl -s http://localhost:3001/health | jq'
```

### Backend Utilization

```bash
# Check utilization percentage
curl http://localhost:3001/backends | jq '.backends[] | {url, utilizationPercent}'
```

### Queue Status

```bash
# Check queue statistics
curl http://localhost:3001/stats | jq '.queueStats'
```

---

## Debug Mode

Enable debug mode for detailed request tracking:

```bash
DEBUG=true npm start
```

### Debug Endpoints

```bash
# Debug statistics
curl http://localhost:3001/debug/stats

# Recent requests
curl http://localhost:3001/debug/requests/recent?n=10

# Filter by backend
curl http://localhost:3001/debug/requests/backend/backend1?limit=10

# Clear history
curl -X POST http://localhost:3001/debug/clear
```

---

## Graceful Shutdown

The balancer handles SIGINT and SIGTERM signals:

1. Stops health checking immediately
2. Rejects queued requests with retry message
3. Waits for in-flight requests to complete
4. Forces exit after `SHUTDOWN_TIMEOUT` if still pending

```bash
# Send SIGTERM
kill -TERM <pid>

# Or use Ctrl+C
```

---

## Next Steps

- [Installation Guide](INSTALLATION.md#getting-started) - Installation options
- [Troubleshooting](TROUBLESHOOTING.md#common-issues) - Common issues
- [API Reference](../api/ENDPOINTS.md#api-reference) - Complete API documentation
