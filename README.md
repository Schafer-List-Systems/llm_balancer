# LLM Balancer

A load balancer for Ollama API servers with health checking and automatic failover.

## Features

### Load Balancer (v2.0)
- ✅ **FIFO queueing** for request distribution
- ✅ Automatic health checking with recovery
- ✅ Automatic failover when backends become unhealthy
- ✅ **Priority-based selection** (prioritizes high-priority backends)
- ✅ **Concurrency-based load limiting** (configurable max parallel requests per backend)
- ✅ **Immediate fallback** to lower priority tiers when higher priority backends are at capacity
- ✅ **Utilization tracking** to prevent overloading individual servers
- ✅ Streaming and non-streaming request support
- ✅ Health check endpoint with backend status
- ✅ Detailed statistics and monitoring
- ✅ Graceful shutdown handling

### API Capability Detection (v2.2)
- ✅ **Automatic API type detection** - discovers which API each backend serves (OpenAI, Anthropic, Google Gemini, Ollama)
- ✅ **Multi-API support** - detects and displays **all** APIs a backend supports (e.g., LiteLLM can serve both OpenAI and Anthropic)
- ✅ **Model discovery on startup** - pre-populates available models before requests begin
- ✅ **Interface-based architecture** - components interact through abstract interfaces for extensibility
- ✅ **Comprehensive probing** - tries all API endpoints and collects successful detections
- ✅ **Frontend API badges** - backend cards display all detected API types with color-coded badges

### Dashboard (v1.0)
- ✅ Real-time monitoring of all backends
- ✅ Health status overview (healthy, unhealthy, busy, idle)
- ✅ Per-backend detailed information
- ✅ Automatic data refresh every 5 seconds
- ✅ Manual refresh option
- ✅ Responsive design for all devices
- ✅ Statistics dashboard

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

Set the Ollama server URLs in an environment variable:

```bash
# Multiple backends (comma-separated)
export OLLAMA_BACKENDS="http://host1:11434,http://host2:11434"
```

Or use a `.env` file in the `llm-balancer` directory:

```bash
cd llm-balancer
OLLAMA_BACKENDS="http://host1:11434,http://host2:11434"
```

### Priority-Based Load Balancing

Configure priority levels for each backend to prioritize specific servers:

**Using index-based priority:**

```bash
cd llm-balancer
OLLAMA_BACKENDS="http://high-priority:11434,http://medium-priority:11434,http://low-priority:11434"
BACKEND_PRIORITY_0=100  # High priority for first backend (index 0)
BACKEND_PRIORITY_1=50   # Medium priority for second backend (index 1)
BACKEND_PRIORITY_2=0    # Low priority for third backend (index 2)
```

**Priority values can be any integer:** Higher numbers indicate higher priority. Negative values are also supported. The load balancer will always try to use high-priority backends first. Use `BACKEND_PRIORITY_N` where N is the zero-based index of your backend in the `OLLAMA_BACKENDS` list.

### Concurrency-Based Load Limiting

Configure maximum parallel requests per backend to prevent overloading:

**Using index-based concurrency:**

```bash
cd llm-balancer
OLLAMA_BACKENDS="http://fast-server:11434,http://slower-server:11434"
BACKEND_CONCURRENCY_0=5   # Allow 5 concurrent requests to fast server (index 0)
BACKEND_CONCURRENCY_1=2   # Allow only 2 concurrent requests to slower server (index 1)
```

**Concurrency values can be any positive integer:** Higher numbers allow more parallel requests. The load balancer will track active request count per backend and only assign new requests when `activeRequestCount < maxConcurrency`. Use `BACKEND_CONCURRENCY_N` where N is the zero-based index of your backend in the `OLLAMA_BACKENDS` list.

## Usage

### Start the Backend Server

```bash
cd llm-balancer
npm start
```

The load balancer will start on port 3001.

### Start the Dashboard

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Copy and configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` to configure the dashboard:
```env
FRONTEND_PORT=3080
API_BASE_URL=http://localhost:3001
REFRESH_INTERVAL=5000
```

4. Build and start the dashboard:
```bash
npm run dev:build
npm start
```

The dashboard will be available at http://localhost:3080

### Check health

```bash
curl http://localhost:3001/health
```

### Get backend statistics

```bash
# Get detailed statistics for all backends
curl http://localhost:3001/backends

# Get complete system statistics
curl http://localhost:3001/stats
```

## API Routes

| Route | Description | Example |
|-------|-------------|---------|
| `/v1/messages*` | API messages endpoint (Anthropic-compatible) | `POST /v1/messages` |
| `/api/*` | Ollama API routes | `GET /api/generate`, `POST /api/chat` |
| `/models*` | Model list endpoint | `GET /models` |
| `/health` | Health check | `GET /health` |
| `/backends` | Backend statistics (per-backend info with priority) | `GET /backends` |
| `/stats` | Complete system statistics | `GET /stats` |
| `/` | Service info | `GET /` |

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

### Get Backend Statistics

```bash
curl http://localhost:3001/backends
```

Returns per-backend statistics including:
- URL and health status
- **API type** (detected API: OpenAI, Anthropic, Gemini, or Ollama)
- **Active request count** (current concurrent requests)
- **Max concurrency** (configured limit for parallel requests)
- **Utilization percentage** (`activeRequestCount / maxConcurrency * 100`)
- Request count (total requests handled)
- Error count
- Failure count
- Available models

Example response:
```json
{
  "backends": [
    {
      "url": "http://host1:11434",
      "healthy": true,
      "apiType": "openai",
      "activeRequestCount": 2,
      "maxConcurrency": 5,
      "utilizationPercent": 40,
      "requestCount": 42,
      "errorCount": 1,
      "models": ["llama2", "mistral"]
    },
    {
      "url": "http://host2:11434",
      "healthy": true,
      "apiType": "ollama",
      "activeRequestCount": 0,
      "maxConcurrency": 3,
      "utilizationPercent": 0,
      "requestCount": 38,
      "errorCount": 0,
      "models": ["llama2", "gemma"]
    }
  ]
}
```

#### Concurrency-Based Load Tracking

The load balancer tracks concurrent requests per backend:
- **activeRequestCount**: Number of currently in-flight requests
- **maxConcurrency**: Configurable maximum (default: 1)
- **utilizationPercent**: Current utilization as percentage of max concurrency

When multiple backends are available, the balancer selects based on priority and availability (backends not at their concurrency limit). New requests are queued when all high-priority backends have reached their `maxConcurrency` threshold.

Check total overloaded and available backends:
```bash
# Via health endpoint - overloaded = at max concurrency, available = below limit
curl http://localhost:3001/health | grep -E "overloadedBackends|availableBackends"

# Via stats endpoint
curl http://localhost:3001/stats | grep -E "overloadedBackends|availableBackends"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BACKENDS` | `http://host1:11434` | Comma-separated list of backend URLs |
| `LB_PORT` | 3001 | Server port |
| `HEALTH_CHECK_INTERVAL` | 30000ms | Health check interval (30 seconds) |
| `HEALTH_CHECK_TIMEOUT` | 5000ms | Health check timeout (5 seconds) |
| `MAX_RETRIES` | 3 | Maximum retry attempts per request |
| `MAX_PAYLOAD_SIZE` | 52428800 (50MB) | Maximum request payload size |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N (any integer, higher = higher priority; e.g., BACKEND_PRIORITY_0 for first backend, BACKEND_PRIORITY_1 for second, etc.) |
| `BACKEND_CONCURRENCY_N` | 1 | Maximum concurrent requests for backend at index N (positive integer; e.g., BACKEND_CONCURRENCY_0=5 allows 5 parallel requests to first backend) |
| `SHUTDOWN_TIMEOUT` | 60000ms | Graceful shutdown timeout (time to wait for in-flight requests before force exit) |

## Architecture

```
Client → Load Balancer (localhost:3001) → Multiple Ollama Servers (host1, host2, ...)
```

### Interface-Based Design

The load balancer uses an **interface pattern** to decouple components from specific API implementations:

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

**Key benefits:**
- **Extensibility**: Add new API types by creating new interface implementations without modifying existing components
- **Transparency**: Backend capabilities are explicitly declared (`backend.capabilities.apiType`, `backend.capabilities.models`)
- **Testability**: Mock interfaces for unit tests without starting real backends
- **Visual Feedback**: Frontend displays detected API type with color-coded badges on backend cards

### Startup Flow

1. **Capability Detection Phase** - On startup, the system probes each backend to detect:
   - API type (OpenAI-compatible, Anthropic, Google Gemini, or Ollama)
   - Available models
   - Supported endpoints

**Detection Order:**
1. OpenAI-compatible (`/v1/models`) - groups OpenAI, Mistral, Groq, Cohere
2. Anthropic (`/v1/messages`, `/chat/completions`)
3. Google Gemini (`/v1beta/models`)
4. Ollama (`/api/tags`)

The system stops at the first successful match. Each backend displays its detected API type as a color-coded badge in the frontend dashboard.

2. **Health Check Phase** - Periodic health checks continue using the detected interface

3. **Request Routing** - Backend selector queries `backend.capabilities.models` for model matching

The load balancer:
- **Prioritizes high-priority backends** for better performance and cost optimization
- **Uses FIFO queueing** to handle concurrent requests
- **Immediately falls back to lower priority tiers** when higher priority backends are at capacity (max concurrency reached)
- Tracks active request count per backend with configurable `maxConcurrency` limit
- Skips backends that have reached their concurrency limit during selection
- Automatically recovers healthy backends after recovery interval
- **Auto-detects API types** (OpenAI, Anthropic, Gemini, Ollama) on startup
- **Reports utilization percentage** (`activeRequestCount / maxConcurrency * 100`) for each backend

## Troubleshooting

### Ensure Ollama server(s) are running

```bash
# Start Ollama server
ollama serve

# Or run in a specific directory
cd /path/to/ollama && ./ollama serve
```

### Ensure the backend is running

```bash
# Check if load balancer is running
curl http://localhost:3001/health

# Should return something like:
# {"healthy":true,"healthyBackends":2,"totalBackends":2,...}
```

### Ensure the dashboard is accessible

1. Check that the backend is running on the configured port (default: 3001)
2. Check that the frontend is running on the configured port (default: 3080)
3. Check the browser console for JavaScript errors
4. Clear browser cache and reload the page
5. Verify API_BASE_URL in the frontend `.env` matches the backend port

### Test connectivity

```bash
# Check if Ollama server is responding
curl http://host1:11434/api/tags
curl http://host2:11434/api/tags
```

---

## Project Structure

```
llm-balancer/
├── llm-balancer/                 # Backend load balancer
│   ├── index.js                  # Load balancer server
│   ├── balancer.js               # Priority-based balancer with FIFO queue
│   ├── health-check.js           # Health checker
│   ├── config.js                 # Configuration loader
│   ├── package.json
│   ├── .env.example
│   └── README.md
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
│   ├── package.json              # Dependencies
│   ├── webpack.config.js         # Webpack configuration
│   └── README.md                 # Frontend documentation
├── IMPLEMENTATION.md             # Implementation details
├── QUICKSTART.md                 # Quick start guide
└── README.md                     # This file
```

## Installation

```bash
# Install dependencies
npm install
```

## Which one should I use?

- **Use the load balancer** if you have one or more Ollama servers and want automatic failover and load distribution

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the `llm-balancer` directory:
   ```bash
   cd llm-balancer
   cp .env.example .env
   ```

3. Edit `.env` with your backend URLs:
   ```
   OLLAMA_BACKENDS="http://host1:11434,http://host2:11434"
   LB_PORT=3001
   ```

4. Start the load balancer:
   ```bash
   npm start
   ```

# Bugs and TODOs

- [] The frontend shows 3 available even when 1 of the three configured backends is unhealthy. What does available actually mean? if it just counts the number of connected backends, it's redundant, because the cards below show how many are connected. i think busy should be the number of backends having at least one active job while available is those still being able to process at least one more concurrent job.
- The backend http://10.0.0.5:8000 works, but it does not support all APIs (it is a vllm backend. which APIs does it support?). I think, on startup, we should check, which API is supported. however, /models is an endpoint of all of the APIs. could this be used for health checking. But then, we should not only print the available API endpoints in the backend cards, but also extend the BackendSelector to filter the backends regarding suitable API (matching with the request).
