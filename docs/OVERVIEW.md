# System Overview

## Introduction

The LLM Balancer is a load balancer for Ollama API servers with health checking and automatic failover capabilities. It provides priority-based load balancing, concurrent request limiting, and comprehensive monitoring.

---

## System Purpose

The LLM Balancer provides:

- **Priority-based load balancing** across multiple backend Ollama instances
- **Health monitoring** with automatic failure detection and recovery
- **Concurrency-based load limiting** to prevent overloading individual servers
- **Automatic failover** when backends become unhealthy
- **Request queuing** when all backends are busy or at capacity
- **Multi-API support** - Auto-detects OpenAI, Anthropic, Google Gemini, and Ollama APIs
- **Comprehensive statistics** and monitoring endpoints
- **Graceful shutdown** handling

---

## Architecture Overview

### High-Level Architecture

```
Client → Load Balancer (localhost:3001) → Multiple Backend Servers
                                              ├── Backend 1 → Ollama Server (API: OpenAI)
                                              ├── Backend 2 → Ollama Server (API: Anthropic)
                                              ├── Backend 3 → Ollama Server (API: Ollama)
                                              └── Backend 4 → Ollama Server (API: Google)
```

### Core Components

The system consists of seven core components:

1. **Configuration Module** ([llm-balancer/config.js](llm-balancer/config.js))
   - Loads and validates environment variables
   - Creates backend objects with health status tracking
   - Parses priority and concurrency configurations

2. **BackendPool Class** ([llm-balancer/backend-pool.js](llm-balancer/backend-pool.js))
   - Owns the backend collection (source of truth)
   - Provides unified filtering interface
   - Supports immutable filter chaining
   - Tracks pool statistics

3. **BackendSelector Class** ([llm-balancer/backend-selector.js](llm-balancer/backend-selector.js))
   - Implements priority-based selection algorithm
   - Performs model matching using regex patterns
   - Filters by health and availability
   - Stateless strategy pattern implementation

4. **Balancer Class** ([llm-balancer/balancer.js](llm-balancer/balancer.js))
   - Priority-based request routing with FIFO queueing
   - Uses BackendPool for data ownership
   - Uses BackendSelector for selection strategy
   - Handles request queuing and backend availability notifications
   - Tracks statistics and queue metrics

5. **Health Checker** ([llm-balancer/health-check.js](llm-balancer/health-check.js))
   - Periodic backend health monitoring
   - API capability detection using [BackendInfo](llm-balancer/backends/BackendInfo.js)
   - Automatic failure detection and recovery
   - Model discovery on startup

6. **Request Processor** ([llm-balancer/request-processor.js](llm-balancer/request-processor.js))
   - HTTP proxy for forwarding requests to backends
   - Handles streaming and non-streaming responses
   - Manages active request counting
   - Implements hop-by-hop header filtering

7. **API Server** ([llm-balancer/index.js](llm-balancer/index.js))
   - Express server exposing routes and endpoints
   - Request routing to balancer
   - Health, stats, and debug endpoints
   - Graceful shutdown handling

### Interface-Based Design

The system uses an interface pattern to decouple components:

```
┌─────────────────┐
│  Request Router │──depends on──▶│ BackendInterface
├─────────────────┤               ├──────────────┬──────────────┐
│ Health Checker  │───────────────│ IHealthCheck │ IModelList   │
├─────────────────┤               ├──────────────┴──────────────┤
│ Backend Selector│───────────────│                           │
└─────────────────┘               ▼                           ▼
                          ┌─────────────────────────────────────────────┐
                          │         MultiAPIChecker (Auto-Detect)       │
                          ├─────────────────────────────────────────────┤
                          │ - OpenAI-compatible (OpenAI, Mistral,       │
                          │   Groq, Cohere) via /v1/models              │
                          │ - Anthropic via /v1/messages, /chat/        │
                          │   completions                               │
                          │ - Google Gemini via /v1beta/models          │
                          │ - Ollama via /api/tags                      │
                          └─────────────────────────────────────────────┘
```

### Backend Class with Delegation Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend Class                            │
├─────────────────────────────────────────────────────────────────┤
│ Properties:                                                      │
│   - url: string                                                  │
│   - maxConcurrency: number                                       │
│   - healthy: boolean                                             │
│   - backendInfo: BackendInfo (capability detection results)     │
│   - healthChecker: IHealthCheck (assigned based on primary API) │
├─────────────────────────────────────────────────────────────────┤
│ Methods:                                                         │
│   - checkHealth() → delegates to healthChecker.check(this)      │
│   - getApiTypes() → returns supported API types                 │
│   - getModels(apiType) → returns models for API type            │
│   - getEndpoint(apiType) → returns endpoint for API type        │
│   - supportsApi(apiType) → checks if API is supported           │
└─────────────────────────────────────────────────────────────────┘
```

### Startup Flow

1. **Capability Detection Phase** - On startup, the system probes each backend to detect:
   - API types (OpenAI-compatible, Anthropic, Google Gemini, Ollama)
   - Available models for each API type
   - Supported endpoints for each API type

2. **Primary API Selection** - When a backend supports multiple APIs, the first supported API is chosen as the primary. This determines which health checker is assigned.

3. **Health Checker Assignment** - Based on the primary API type, the appropriate health checker is assigned:
   - `OllamaHealthCheck` for Ollama API
   - `OpenAIHealthCheck` for OpenAI-compatible API
   - `AnthropicHealthCheck` for Anthropic API
   - `GoogleHealthCheck` for Google API

4. **Health Check Phase** - Periodic health checks use the assigned health checker which queries the correct endpoint discovered at startup.

5. **Request Routing** - Backend selector queries `backend.getModels(apiType)` for model matching

---

## Key Features

### Load Balancing Algorithm

1. **Priority-Based Selection**: Backends are grouped by priority level, sorted from highest to lowest
2. **Concurrency Limiting**: Each backend has a configurable `maxConcurrency` limit
3. **Immediate Fallback**: When higher priority backends are at capacity, immediately fall back to lower priority tiers
4. **FIFO Queueing**: Requests are queued when all backends are busy or at capacity
5. **Health-Aware**: Unhealthy backends are automatically skipped

### API Detection

The system automatically detects which APIs each backend supports:

| API Type | Model List Endpoint | Chat Endpoint |
|----------|--------------------|---------------|
| OpenAI | `/v1/models` | `/v1/chat/completions` |
| Anthropic | N/A | `/v1/messages` |
| Google Gemini | `/v1beta/models` | `/v1beta/models/{model}:generateContent` |
| Ollama | `/api/tags` | `/api/generate` |
| Groq | `/openai/v1/models` | `/openai/v1/chat/completions` |

### Statistics and Monitoring

The system provides comprehensive statistics:

- **Health Endpoint** (`/health`): Backend status, healthy/unhealthy counts, busy/idle counts
- **Stats Endpoint** (`/stats`): Detailed per-backend statistics, queue metrics, configuration
- **Backends Endpoint** (`/backends`): Per-backend info with priority, API types, utilization
- **Debug Endpoints**: Request tracking, history, filtering by backend

---

## Development Workflow

### Project Structure

```
llm_balancer/
├── llm-balancer/                 # Backend load balancer
│   ├── index.js                  # Load balancer server
│   ├── balancer.js               # Priority-based balancer with FIFO queue
│   ├── backend-pool.js           # Backend pool with unified filtering
│   ├── backend-selector.js       # Priority-based selection algorithm
│   ├── health-check.js           # Health checker
│   ├── request-processor.js      # Request forwarding logic
│   ├── config.js                 # Configuration loader
│   ├── package.json
│   ├── .env.example
│   ├── backends/                 # Backend-related classes
│   │   ├── Backend.js            # Backend class with capability info
│   │   ├── BackendInfo.js        # API detection and model discovery
│   │   └── [other backend files]
│   ├── interfaces/               # Interface definitions
│   │   ├── IHealthCheck.js       # Health check interface
│   │   ├── IModelList.js         # Model list interface
│   │   └── implementations/      # API-specific implementations
│   │       ├── OllamaHealthCheck.js
│   │       ├── OpenAIHealthCheck.js
│   │       ├── AnthropicHealthCheck.js
│   │       └── GoogleHealthCheck.js
│   └── tests/unit/               # Unit tests
│       ├── balancer.test.js
│       ├── health-check.test.js
│       └── ...
├── frontend/                     # Dashboard frontend
│   ├── public/
│   │   ├── css/
│   │   │   └── styles.css        # Main stylesheet
│   │   ├── js/
│   │   │   ├── api.js            # API client service
│   │   │   └── dashboard.js      # Main dashboard logic
│   │   └── index.html           # HTML template
│   ├── config.js                 # Frontend configuration
│   ├── index.js                  # Express server
│   ├── package.json
│   └── webpack.config.js         # Webpack configuration
├── docker/                       # Docker configuration
│   ├── balancer/
│   │   └── Dockerfile
│   └── docker-compose.yml        # Docker Compose configuration
├── docs/                         # Documentation
│   ├── OVERVIEW.md               # This file
│   ├── user/
│   ├── api/
│   ├── developer/
│   └── components/
├── legacy/                       # Deprecated documentation
├── README.md                     # Project overview
├── DOCUMENTATION_GUIDE.md        # Documentation navigation
├── CLAUDE.md                     # Project instructions
├── REQUIREMENTS.md               # Requirements specification
└── ARCHITECTURE.md               # Architectural decisions
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- balancer.test.js

# Run tests with coverage
npm test -- --coverage
```

### Debugging

Enable debug mode by setting `DEBUG=true` in your `.env` file:

```bash
DEBUG=true npm start
```

Debug endpoints:
- `GET /debug/stats` - Debug statistics
- `GET /debug/requests` - Full request history
- `GET /debug/requests/recent?n=10` - Recent requests
- `GET /debug/requests/backend/:id` - Filtered by backend
- `POST /debug/clear` - Clear history

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKENDS` | None | Comma-separated list of backend URLs |
| `LB_PORT` | 3001 | Server port |
| `HEALTH_CHECK_INTERVAL` | 30000 | Health check interval (ms) |
| `HEALTH_CHECK_TIMEOUT` | 5000 | Health check timeout (ms) |
| `MAX_RETRIES` | 3 | Maximum retry attempts |
| `MAX_PAYLOAD_SIZE` | 52428800 | Maximum request payload (bytes) |
| `MAX_QUEUE_SIZE` | 100 | Maximum queue size |
| `QUEUE_TIMEOUT` | 30000 | Queue timeout (ms) |
| `SHUTDOWN_TIMEOUT` | 60000 | Graceful shutdown timeout (ms) |
| `DEBUG` | false | Enable debug mode |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N |
| `BACKEND_CONCURRENCY_N` | 1 | Max concurrency for backend at index N |

---

## Related Documentation

- [README.md](../README.md) - Project overview and quick start
- [docs/user/INSTALLATION.md](user/INSTALLATION.md) - Installation instructions
- [docs/user/USAGE.md](user/USAGE.md) - Usage guide
- [docs/developer/ARCHITECTURE.md](developer/ARCHITECTURE.md) - Detailed architecture
- [docs/developer/CLASSES.md](developer/CLASSES.md) - Class hierarchy
- [docs/developer/DATA_FLOW.md](developer/DATA_FLOW.md) - Data flow documentation
- [docs/api/ENDPOINTS.md](api/ENDPOINTS.md) - API reference

---

## Version Information

- **Current Version**: 2.3
- **API Version**: Compatible with Ollama API 0.1.x and later
- **Last Updated**: 2026-03-09
