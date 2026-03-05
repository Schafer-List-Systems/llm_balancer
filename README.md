# LLM Balancer

A load balancer for Ollama API servers with health checking and automatic failover.

## Features

### Load Balancer (v2.0)
- ✅ **FIFO queueing** for request distribution
- ✅ Automatic health checking with recovery
- ✅ Automatic failover when backends become unhealthy
- ✅ **Priority-based selection** (prioritizes high-priority backends)
- ✅ **Immediate fallback** to lower priority tiers when higher priority backends are busy
- ✅ **Idle backend tracking** to prevent overloading
- ✅ Streaming and non-streaming request support
- ✅ Health check endpoint with backend status
- ✅ Detailed statistics and monitoring
- ✅ Graceful shutdown handling

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
BACKEND_PRIORITY_0=100  # High priority for first backend (highest number = highest priority)
BACKEND_PRIORITY_1=50   # Medium priority for second backend
BACKEND_PRIORITY_2=0    # Low priority for third backend
```

**Priority values can be any integer:** Higher numbers indicate higher priority. Negative values are also supported. The load balancer will always try to use high-priority backends first.

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
- **Busy state** (whether backend is handling a request)
- Idle state (available for new requests)
- Request count
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
      "busy": true,
      "requestCount": 42,
      "errorCount": 1,
      "models": ["llama2", "mistral"]
    },
    {
      "url": "http://host2:11434",
      "healthy": true,
      "busy": false,
      "requestCount": 38,
      "errorCount": 0,
      "models": ["llama2", "gemma"]
    }
  ]
}
```

#### Busy State Information

The load balancer tracks the busy state of each backend:
- **Busy**: Backend is currently handling a request (30-second timeout applies)
- **Idle**: Backend is available and ready to handle new requests

When multiple backends are available, the balancer prioritizes **idle backends** to distribute load more evenly and prevent overloading individual servers.

Check total busy and idle backends:
```bash
# Via health endpoint
curl http://localhost:3001/health | grep -E "busyBackends|idleBackends"

# Via stats endpoint
curl http://localhost:3001/stats | grep -E "busyBackends|idleBackends"
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
| `BACKEND_PRIORITY_0` | 1 | Priority for first backend (any integer, higher = higher priority) |
| `BACKEND_PRIORITY_1` | 1 | Priority for second backend |
| `BACKEND_PRIORITY_2` | 1 | Priority for third backend |
| `SHUTDOWN_TIMEOUT` | 60000ms | Graceful shutdown timeout (time to wait for in-flight requests before force exit) |

## Architecture

```
Client → Load Balancer (localhost:3001) → Multiple Ollama Servers (host1, host2, ...)
```

The load balancer:
- **Prioritizes high-priority backends** for better performance and cost optimization
- **Uses FIFO queueing** to handle concurrent requests
- **Immediately falls back to lower priority tiers** when higher priority backends are busy
- Tracks and prioritizes idle backends to distribute load more evenly
- Skips unhealthy backends during selection
- Automatically recovers healthy backends after recovery interval
- Handles both Anthropic and Ollama API formats
- Tracks busy state of each backend with 30-second timeout for stuck requests

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
