# LLM Balancer

A load balancer for LLM servers with health checking and automatic failover. Supports OpenAI, Anthropic, Google Gemini, and Ollama APIs.

## Overview

The LLM Balancer provides priority-based load balancing across multiple backend LLM servers with:

- **Multi-API Support**: Auto-detects OpenAI, Anthropic, Google Gemini, and Ollama APIs
- **Priority-Based Selection**: Configurable priority levels for backend servers
- **Flexible Model Matching**: Regex patterns for matching models across backends with different naming conventions
- **Concurrency Limiting**: Configurable max parallel requests per backend
- **Health Monitoring**: Automatic failure detection and recovery
- **Request Queuing**: FIFO queueing when backends are at capacity
- **Real-Time Monitoring**: Dashboard for tracking backend status and statistics

## Documentation

**New to the LLM Balancer?** Start here:

1. **[DOCUMENTATION_GUIDE.md](DOCUMENTATION_GUIDE.md)** - Find documentation by your role:
   - **User**: Installation, configuration, usage, troubleshooting
   - **API User**: API reference, request/response formats, integration
   - **Developer**: Architecture, data flow, classes, testing, contributing

2. **[docs/OVERVIEW.md](docs/OVERVIEW.md)** - System architecture and high-level design

3. **[docs/developer/DATA_FLOW.md](docs/developer/DATA_FLOW.md)** - Interactive data flow diagrams showing request processing, health checks, and component interactions

4. **[docs/user/INSTALLATION.md](docs/user/INSTALLATION.md)** - Installation options (Docker, manual, development)

5. **[docs/user/USAGE.md](docs/user/USAGE.md)** - Complete usage guide with configuration examples

For quick reference, see the sections below.

## Quick Start

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

The LLM Balancer supports two configuration methods:

#### Method 1: JSON Configuration (Recommended)

Create a `config.json` file in the `llm-balancer` directory:

```bash
cd llm-balancer
cp config.example.json config.json
```

Edit `config.json` with your settings:

```json
{
  "port": 3001,
  "backends": [
    {
      "url": "http://host1:11434",
      "name": "Backend 1",
      "priority": 10,
      "maxConcurrency": 1
    },
    {
      "url": "http://host2:11434",
      "name": "Backend 2",
      "priority": 5,
      "maxConcurrency": 1
    }
  ],
  "healthCheck": {
    "interval": 120000,
    "timeout": 5000
  },
  "queue": {
    "timeout": 900000
  },
  "maxRetries": 3,
  "maxPayloadSize": 104857600,
  "debug": true
}
```

#### Method 2: Environment Variables (Legacy)

Create a `.env` file in the `llm-balancer` directory:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
BACKENDS="http://host1:11434,http://host2:11434"
LB_PORT=3001
```

**Note:** JSON configuration takes precedence over environment variables.

### Start the Server

```bash
# Start the backend load balancer
cd llm-balancer
npm start

# Start the frontend dashboard
cd frontend
npm run dev:build
npm start
```

The load balancer will be available at http://localhost:3001 and the dashboard at http://localhost:3080.

## Features

### Load Balancer (v2.0)
- FIFO queueing for request distribution
- Automatic health checking with recovery
- Automatic failover when backends become unhealthy
- Priority-based selection (prioritizes high-priority backends)
- Concurrency-based load limiting (configurable max parallel requests per backend)
- Immediate fallback to lower priority tiers when higher priority backends are at capacity
- Utilization tracking to prevent overloading individual servers
- Streaming and non-streaming request support
- Health check endpoint with backend status
- Detailed statistics and monitoring
- Graceful shutdown handling

### API-Centric Health Check Architecture (v2.3)
- Backend class - encapsulates all backend functionality (state, BackendInfo, health checker)
- Delegation pattern - `backend.checkHealth()` delegates to `healthChecker.check(this)`
- API-specific health checkers - `OllamaHealthCheck`, `OpenAIHealthCheck`, `AnthropicHealthCheck`, `GoogleHealthCheck`
- Primary API selection - when a backend supports multiple APIs, the first supported API is chosen as primary
- BackendInfo attachment - capability detection results are attached directly to Backend instances
- Correct endpoint/port usage - health checkers use `backend.backendInfo.endpoints` to query the correct API endpoint
- Multi-API support - detects and displays all APIs a backend supports
- Model discovery on startup - pre-populates available models before requests begin
- Interface-based architecture - components interact through abstract interfaces for extensibility
- Comprehensive probing - tries all API endpoints and collects successful detections
- Frontend API badges - backend cards display all detected API types with color-coded badges

### Dashboard (v1.0)
- Real-time monitoring of all backends
- Health status overview (healthy, unhealthy, busy, idle)
- Per-backend detailed information
- Automatic data refresh every 5 seconds
- Manual refresh option
- Responsive design for all devices
- Statistics dashboard

## API Routes

| Route | Description | Example |
|-------|-------------|---------|
| `/v1/messages*` | API messages endpoint (Anthropic-compatible) | `POST /v1/messages` |
| `/api/*` | Ollama API routes | `GET /api/generate`, `POST /api/chat` |
| `/models*` | Model list endpoint (routes to backend) | `GET /models` |
| `/v1/models` | **Aggregated models** (OpenAI/Groq backends) | `GET /v1/models` |
| `/openai/v1/models` | **Aggregated Groq models** | `GET /openai/v1/models` |
| `/v1beta/models` | **Aggregated Google models** | `GET /v1beta/models` |
| `/api/tags` | **Aggregated Ollama models** | `GET /api/tags` |
| `/health` | Health check | `GET /health` |
| `/backends` | Backend statistics | `GET /backends` |
| `/stats` | Complete system statistics | `GET /stats` |
| `/queue/stats` | Queue statistics (debug mode) | `GET /queue/stats` |
| `/queue/contents` | View queued requests (debug mode) | `GET /queue/contents` |
| `/cache/reset` | Reset prompt caches (debug mode) | `POST /cache/reset` |
| `/` | Service info | `GET /` |

**Note**: The new model listing endpoints (starting with `/v1/models`, `/v1beta/models`, etc.) aggregate models from all healthy backends of a specific API type, whereas `/models*` routes requests to a single backend.

## Example Usage

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

### Check Health

```bash
curl http://localhost:3001/health
```

### List Models (Aggregated)

```bash
# OpenAI-compatible models (from OpenAI and Groq backends)
curl http://localhost:3001/v1/models

# Ollama models (from Ollama backends)
curl http://localhost:3001/api/tags

# Google Vertex AI models (from Google backends)
curl http://localhost:3001/v1beta/models

# Groq-compatible models
curl http://localhost:3001/openai/v1/models
```

### Get Backend Statistics

```bash
curl http://localhost:3001/backends
```

### Reset Prompt Caches (Debug Mode)

```bash
# Reset all backend caches
curl -X POST http://localhost:3001/cache/reset

# Reset specific backend cache
curl -X POST "http://localhost:3001/cache/reset?backend=http://localhost:11434"
```

### View Queue Contents (Debug Mode)

```bash
# View all queued requests
curl http://localhost:3001/queue/contents

# View queue statistics
curl http://localhost:3001/queue/stats
```

## Prompt Cache Behavior

The LLM Balancer uses fingerprint-based prompt caching to enable KV cache reuse. Understanding cache behavior is important for optimization:

### Sequential vs Concurrent Requests

- **Sequential requests** (wait for first to complete): Guaranteed cache hit, same backend serves both requests
- **Concurrent requests** (both arrive before first completes): May have cache misses, different backends may serve each request

This impacts KV cache benefits - sequential requests maximize cache reuse potential.

### Cache Statistics

View cache statistics per backend:

```bash
curl http://localhost:3001/stats
```

Look for `promptCacheStats` in the response:
- `hits`: Successful cache matches
- `misses`: Cache lookups with no match
- `size`: Number of cached prompts
- `similarityMatches`: Similarity-based cache hits
- `idMatches`: ID-based exact matches

### Cache Configuration

Configure cache behavior:

```json
{
  "prompt": {
    "cache": {
      "maxSize": 5,
      "similarityThreshold": 0.85
    }
  }
}
```

## Configuration Options

### JSON Configuration File (`config.json`)

All configuration options are available in the JSON config file:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | "0.0.0" | Application version |
| `port` | number | 3001 | Server port |
| `backends` | array | See below | Array of backend configurations |
| `healthCheck.interval` | number | 120000 | Health check interval (ms) |
| `healthCheck.timeout` | number | 5000 | Health check timeout (ms) |
| `queue.timeout` | number | 30000 | Queue request timeout (ms) |
| `request.timeout` | number | 300000 | Request timeout (ms) |
| `maxRetries` | number | 3 | Maximum retry attempts |
| `maxPayloadSize` | number | 52428800 | Max payload size (bytes) |
| `maxPayloadSizeMB` | number | 50 | Max payload size (MB, calculated) |
| `maxQueueSize` | number | 100 | Maximum queue size |
| `maxStatsSamples` | number | 20 | Maximum stats samples |
| `shutdownTimeout` | number | 60000 | Shutdown timeout (ms) |
| `debug.enabled` | boolean | false | Enable debug mode |
| `debug.requestHistorySize` | number | 100 | Request history size |
| `prompt.cache.maxSize` | number | 5 | Prompt cache max size |
| `prompt.cache.similarityThreshold` | number | 0.85 | Cache similarity threshold |

### Backend Configuration

Each backend in the `backends` array can have:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | Required | Backend URL (e.g., "http://localhost:11434") |
| `name` | string | "Backend N" | Human-readable name |
| `priority` | number | 1 | Priority level (higher = preferred) |
| `maxConcurrency` | number | 10 | Max parallel requests |

### Environment Variables (Legacy)

For backward compatibility, environment variables are supported. They have lower priority than `config.json`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKENDS` | None | Comma-separated backend URLs (required) |
| `LB_PORT` | 3001 | Server port |
| `VERSION` | "0.0.0" | Application version |
| `MAX_RETRIES` | 3 | Maximum retry attempts |
| `MAX_PAYLOAD_SIZE` | 52428800 | Max payload size in bytes |
| `MAX_STATS_SAMPLES` | 20 | Maximum stats samples |
| `MAX_QUEUE_SIZE` | 100 | Maximum queue size |
| `SHUTDOWN_TIMEOUT` | 60000 | Shutdown timeout (ms) |
| `DEBUG` | false | Enable debug mode (`true`/`false`) |
| `DEBUG_REQUEST_HISTORY_SIZE` | 100 | Request history size |
| `HEALTH_CHECK_INTERVAL` | 120000 | Health check interval (ms) |
| `HEALTH_CHECK_TIMEOUT` | 5000 | Health check timeout (ms) |
| `QUEUE_TIMEOUT` | 30000 | Queue timeout (ms) |
| `REQUEST_TIMEOUT` | 300000 | Request timeout (ms) |
| `MAX_PROMPT_CACHE_SIZE` | 5 | Prompt cache max size |
| `PROMPT_CACHE_SIMILARITY_THRESHOLD` | 0.85 | Cache similarity threshold |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N |
| `BACKEND_CONCURRENCY_N` | 1 | Max concurrency for backend at index N |

**Note:** Index N is 0-based (BACKEND_PRIORITY_0 for the first backend).

## API Reference

For complete API documentation, see **[docs/api/ENDPOINTS.md](docs/api/ENDPOINTS.md)**.

Quick reference for common endpoints:

| Route | Description |
|-------|-------------|
| `/v1/messages*` | Anthropic API format |
| `/api/*` | Ollama API format |
| `/models*` | Model list endpoint |
| `/health` | Health check |
| `/backends` | Backend statistics |
| `/stats` | System statistics |

## Project Structure

```
llm_balancer/
├── llm-balancer/                 # Backend load balancer
│   ├── index.js                  # Load balancer server
│   ├── balancer.js               # Priority-based balancer with FIFO queue
│   ├── health-check.js           # Health checker
│   ├── request-processor.js      # Request forwarding logic
│   ├── config.js                 # Configuration loader
│   ├── backends/                 # Backend-related classes
│   ├── interfaces/               # Interface definitions
│   └── tests/unit/               # Unit tests
├── frontend/                     # Dashboard frontend
│   ├── public/                   # Static assets
│   ├── config.js                 # Frontend configuration
│   └── index.js                  # Express server
├── docker/                       # Docker configuration
│   ├── balancer/
│   │   └── Dockerfile
│   └── docker-compose.yml
├── docs/                         # Documentation
│   ├── OVERVIEW.md
│   ├── user/
│   ├── api/
│   ├── developer/
│   └── components/
├── README.md                     # This file
├── DOCUMENTATION_GUIDE.md        # Documentation navigation
└── CLAUDE.md                     # Project instructions
```

## Troubleshooting

For common issues and solutions, see [docs/user/TROUBLESHOOTING.md](docs/user/TROUBLESHOOTING.md).

### Ensure backend servers are running

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

## License

MIT
