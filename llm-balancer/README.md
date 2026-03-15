# LLM Balancer

A load balancer for Ollama API servers with health checking and automatic failover.

## Features

- ✅ Round-robin load balancing across multiple Ollama backends
- ✅ Automatic health checking with recovery
- ✅ Automatic failover when backends become unhealthy
- ✅ Streaming and non-streaming request support
- ✅ **API capability detection** - Automatically discovers supported APIs (OpenAI, Anthropic, Google, Ollama) and model lists
- ✅ Health check endpoint with backend status
- ✅ Detailed statistics and monitoring
- ✅ Graceful shutdown handling

## Installation

```bash
cd llm-balancer
npm install
```

## Configuration

Create a `.env` file based on the example:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Port for the load balancer
LB_PORT=3001

# Comma-separated list of backend Ollama server URLs
BACKENDS=http://host1:11434,http://host2:11434

# Health check interval in milliseconds
HEALTH_CHECK_INTERVAL=30000

# Health check timeout in milliseconds
HEALTH_CHECK_TIMEOUT=5000

# Maximum number of retries per request
MAX_RETRIES=3

# Prompt cache configuration
MAX_PROMPT_CACHE_SIZE=5
PROMPT_CACHE_SIMILARITY_THRESHOLD=0.85
```

## Usage

### Start the server

```bash
npm start
```

Or with custom configuration:

```bash
BACKENDS="http://host1:11434,http://host2:11434" LB_PORT=3001 npm start
```

### Check health

```bash
curl http://localhost:3001/health
```

### View statistics

```bash
curl http://localhost:3001/stats
```

## API Routes

| Route | Description | Example |
|-------|-------------|---------|
| `/v1/messages*` | Anthropic API messages endpoint | `POST /v1/messages` |
| `/api/*` | Ollama API routes | `GET /api/generate`, `POST /api/chat` |
| `/models*` | Model list endpoint | `GET /models` |
| `/health` | Health check | `GET /health` |
| `/stats` | Detailed statistics | `GET /stats` |
| `/backend/current` | Current backend info | `GET /backend/current` |
| `/health/:backendUrl` | Manual health check | `GET /health/http://host1:11434` |
| `/` | Service info | `GET /` |

## Example Usage

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

### Check health of specific backend

```bash
curl http://localhost:3001/health/http://host1:11434
```

## Architecture

```
Client → Load Balancer (localhost:3001) → Backend 1 → Ollama Server
           ↓                              → Backend 2 → Ollama Server
           ↓                              → Backend 3 → Ollama Server
```

The load balancer:
1. Distributes requests using round-robin across healthy backends
2. Periodically checks backend health via `/api/tags`
3. Automatically marks unhealthy backends as failed
4. Recovers backends when they become healthy again
5. Returns detailed health and statistics endpoints

## Health Checking

Backends are health checked using the `/api/tags` endpoint:
- **Interval**: Configurable (default: 30 seconds)
- **Timeout**: Configurable (default: 5 seconds)
- **Threshold**: Backend is marked unhealthy after consecutive failures

When a backend fails, requests are automatically redirected to other healthy backends.

## Monitoring

The `/stats` endpoint provides detailed information:

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
    "maxRetries": 3
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LB_PORT` | 3001 | Server port |
| `BACKENDS` | `http://host1:11434` | Comma-separated backend URLs |
| `HEALTH_CHECK_INTERVAL` | 30000 | Health check interval in ms |
| `HEALTH_CHECK_TIMEOUT` | 5000 | Health check timeout in ms |
| `MAX_RETRIES` | 3 | Maximum retry attempts per request |
| `MAX_PAYLOAD_SIZE` | 52428800 (50MB) | Maximum request payload size in bytes |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N (any integer, higher = higher priority; e.g., BACKEND_PRIORITY_0 for first backend, BACKEND_PRIORITY_1 for second, etc.) |
| `SHUTDOWN_TIMEOUT` | 60000 | Graceful shutdown timeout in ms (time to wait for in-flight requests before force exit) |

## Debug Features

For development and troubleshooting, enable debug mode by setting `DEBUG=true` in your `.env` file. The load balancer provides debug endpoints that expose prompt cache statistics instead of request content:

| Route | Description |
|-------|-------------|
| `/debug/stats` | Summary statistics with performance and prompt cache stats per backend |

Enable debug mode by setting `DEBUG=true` in your `.env` file.

The debug stats include per-backend metrics:
- Request counts
- Performance statistics (timing, tokens, rates)
- Prompt cache statistics (hits, misses, evictions, size)

## API Detection

The load balancer automatically detects which APIs each backend supports using a probe-based detection algorithm. See [BACKEND_INFO.md](BACKEND_INFO.md) for detailed documentation.

## Prompt Cache

The load balancer supports prompt cache (KV cache) reuse to reduce compute costs and latency. When a prompt is already cached on a backend, the backend can reuse the previously computed key-value pairs, significantly speeding up response generation. See [docs/components/balancer/PROMPT_CACHE.md](../docs/components/balancer/PROMPT_CACHE.md) for detailed documentation on cache matching, backend selection, and monitoring.

Detected APIs include:
- **OpenAI-compatible** - `/v1/models`, `/v1/chat/completions`
- **Anthropic** - `/v1/messages`
- **Google Gemini** - `/v1beta/models`
- **Ollama** - `/api/tags`, `/api/generate`
- **Groq** - `/openai/v1/models`

## Troubleshooting

### Ensure Ollama servers are running

```bash
# Check each backend
curl http://host1:11434/api/tags
curl http://host2:11434/api/tags
```

### Check load balancer health

```bash
curl http://localhost:3001/health
```

### View detailed statistics

```bash
curl http://localhost:3001/stats
```

### Check logs

The load balancer logs health checks and errors to the console. Watch for:
- Backend health check results
- Failover events
- Request errors

### Payload size errors

If you encounter payload size errors, increase the `MAX_PAYLOAD_SIZE` in your `.env` file:

```bash
# 100MB
MAX_PAYLOAD_SIZE=104857600

# 200MB
MAX_PAYLOAD_SIZE=209715200
```

Restart the server after changing the value.

### Stop the server gracefully

The load balancer handles SIGINT and SIGTERM signals with Option B strategy (graceful drain):
1. Stops health checking immediately
2. Rejects all queued requests with "Server shutting down, please retry" error
3. Waits for in-flight backend requests to complete
4. Forces exit after `SHUTDOWN_TIMEOUT` milliseconds if still pending

```bash
# Stop with Ctrl+C or kill signal
# In-flight requests will be given up to 60 seconds (default) to complete
# Queued requests are rejected immediately with a retry message
```

To customize the shutdown timeout, set `SHUTDOWN_TIMEOUT` in your `.env` file:
```bash
# Wait up to 120 seconds for in-flight requests
SHUTDOWN_TIMEOUT=120000
```

## Compatibility

This load balancer is designed for Ollama API servers (version 0.1.x and later). It maintains compatibility with the original single-backend gateway by providing the same API endpoints.

## License

MIT