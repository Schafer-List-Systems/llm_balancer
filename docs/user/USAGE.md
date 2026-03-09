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

```bash
# Single backend
OLLAMA_BACKENDS="http://localhost:11434"

# Multiple backends
OLLAMA_BACKENDS="http://host1:11434,http://host2:11434,http://host3:11434"
```

### Priority-Based Load Balancing

Configure priority levels for each backend to prioritize specific servers:

#### Index-Based Priority

```bash
# Backend 0 - Priority 100 (highest)
OLLAMA_BACKENDS="http://fast-server:11434,http://medium-server:11434,http://slow-server:11434"
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

### Concurrency-Based Load Limiting

Configure maximum parallel requests per backend:

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

### Health Check Configuration

```bash
# Health check interval (default: 30 seconds)
HEALTH_CHECK_INTERVAL=30000

# Health check timeout (default: 5 seconds)
HEALTH_CHECK_TIMEOUT=5000
```

### Queue Configuration

```bash
# Maximum queue size (default: 100)
MAX_QUEUE_SIZE=100

# Queue timeout (default: 30 seconds)
QUEUE_TIMEOUT=30000
```

### Payload Size

```bash
# Maximum request payload size in bytes
# 50MB = 52428800
# 100MB = 104857600
# 200MB = 209715200
MAX_PAYLOAD_SIZE=104857600
```

### Shutdown Timeout

```bash
# Time to wait for in-flight requests before force exit (default: 60 seconds)
SHUTDOWN_TIMEOUT=120000
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

```bash
# Primary high-performance server
OLLAMA_BACKENDS="http://gpu-server:11434,http://cpu-server:11434"
BACKEND_PRIORITY_0=100
BACKEND_PRIORITY_1=10
```

Requests will always prefer the GPU server. When it's busy or unavailable, requests fall back to the CPU server.

### Scenario 2: Load Distribution

```bash
# Three servers with different capacities
OLLAMA_BACKENDS="http://fast-1:11434,http://fast-2:11434,http://slow-1:11434"
BACKEND_CONCURRENCY_0=10
BACKEND_CONCURRENCY_1=10
BACKEND_CONCURRENCY_2=5
```

Fast servers handle more concurrent requests. The slow server is used as a backup when fast servers are at capacity.

### Scenario 3: Cost Optimization

```bash
# Mix of expensive and cheap backends
OLLAMA_BACKENDS="http://premium-1:11434,http://standard-1:11434,http://economy-1:11434"
BACKEND_PRIORITY_0=100
BACKEND_PRIORITY_1=50
BACKEND_PRIORITY_2=0
```

Premium backends are used first. Economy backends are only used when premium and standard are unavailable.

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

- [Installation Guide](INSTALLATION.md) - Installation options
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [API Reference](../api/ENDPOINTS.md) - Complete API documentation
