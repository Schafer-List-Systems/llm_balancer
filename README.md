# LLM Balancer

A load balancer for Ollama API servers with health checking and automatic failover.

## Features

### Load Balancer (v2.0)
- ✅ Round-robin load balancing across multiple Ollama backends
- ✅ Automatic health checking with recovery
- ✅ Automatic failover when backends become unhealthy
- ✅ **Smart request routing with idle backend prioritization**
- ✅ Streaming and non-streaming request support
- ✅ Health check endpoint with backend status
- ✅ Detailed statistics and monitoring
- ✅ Graceful shutdown handling

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

## Usage

### Start the server

```bash
npm start
```

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
| `/v1/messages*` | Anthropic API messages endpoint | `POST /v1/messages` |
| `/api/*` | Ollama API routes | `GET /api/generate`, `POST /api/chat` |
| `/models*` | Model list endpoint | `GET /models` |
| `/health` | Health check | `GET /health` |
| `/backends` | Backend statistics (per-backend info) | `GET /backends` |
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

## Architecture

```
Client → Load Balancer (localhost:3001) → Multiple Ollama Servers (host1, host2, ...)
```

The load balancer:
- Distributes requests across all healthy backends using round-robin
- **Prioritizes idle backends to distribute load more evenly**
- Skips unhealthy backends in the round-robin cycle
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
├── index.js                      # Load balancer server
├── config.js                     # Configuration loader
├── balancer.js                   # Round-robin balancer
├── health-check.js               # Health checker
├── package.json
├── .env.example
└── README.md
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