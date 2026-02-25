# LLM Balancer & API Gateway

A load balancer for Ollama API servers with health checking and automatic failover, plus a simple gateway for single-server setups.

## Features

### Load Balancer (v2.0)
- ✅ Round-robin load balancing across multiple Ollama backends
- ✅ Automatic health checking with recovery
- ✅ Automatic failover when backends become unhealthy
- ✅ Streaming and non-streaming request support
- ✅ Health check endpoint with backend status
- ✅ Detailed statistics and monitoring
- ✅ Graceful shutdown handling

### Simple Gateway (v1.0)
- ✅ Forwards Anthropic API requests to Ollama server
- ✅ Forwards Ollama API requests to Ollama server
- ✅ Supports streaming responses
- ✅ Handles headers and authentication
- ✅ Simple and lightweight

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

Set the Ollama server URL in an environment variable:

```bash
# Default: http://host1:11434
export OLLAMA_BASE_URL=http://host1:11434
```

Or you can modify the default in `index.js`:

```javascript
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host1:11434';
```

## Usage

### Start the server

```bash
npm start
```

Or with the port configuration:

```bash
PORT=3000 npm start
```

### Check health

```bash
curl http://localhost:3000/health
```

## API Routes

| Route | Description | Example |
|-------|-------------|---------|
| `/v1/messages*` | Anthropic API messages endpoint | `POST /v1/messages` |
| `/api/*` | Ollama API routes | `GET /api/generate`, `POST /api/chat` |
| `/models*` | Model list endpoint | `GET /models` |
| `/health` | Health check | `GET /health` |
| `/` | Service info | `GET /` |

## Example Usage

### Anthropic API (Messages)

```bash
curl -X POST http://localhost:3000/v1/messages \
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
curl http://localhost:3000/api/generate \
  -d '{"model": "llama2", "prompt": "Hello, world!"}'
```

### Ollama API (Chat)

```bash
curl -X POST http://localhost:3000/api/chat \
  -d '{
    "model": "llama2",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### List Models

```bash
curl http://localhost:3000/api/tags
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OLLAMA_BASE_URL` | `http://host1:11434` | Target Ollama server URL |

## Architecture

```
Client → Gateway (localhost:3000) → Ollama Server (host1:11434)
```

The gateway routes requests based on the endpoint path:
- `/v1/messages*` → Anthropic API format
- `/api/*` → Ollama API format
- All other paths → Ollama server

## Troubleshooting

### Ensure Ollama server is running

```bash
ollama serve
```

### Test connectivity

```bash
curl http://host1:11434/api/tags
```

### Check logs

The gateway logs errors to the console. Watch for connection issues or authentication errors.

---

## Load Balancer (v2.0)

A load balancer for Ollama API servers with health checking and automatic failover.

### Quick Start

```bash
cd llm-balancer
npm install
cp .env.example .env
# Edit .env with your backend URLs
npm start
```

### Key Features

- Multiple backend support with automatic health checking
- Round-robin request distribution
- Automatic failover when backends fail
- Detailed health and statistics endpoints

### Configuration

See [`llm-balancer/README.md`](llm-balancer/README.md) for detailed configuration options.

### Health Check

```bash
curl http://localhost:3001/health
```

### Statistics

```bash
curl http://localhost:3001/stats
```

### API Routes

| Route | Description |
|-------|-------------|
| `/v1/messages*` | Anthropic API messages endpoint |
| `/api/*` | Ollama API routes |
| `/models*` | Model list endpoint |
| `/health` | Health check |
| `/stats` | Detailed statistics |
| `/backend/current` | Current backend info |
| `/health/:backendUrl` | Manual health check |

---

## Project Structure

```
llm-balancer/
├── index.js                      # Simple gateway (single backend)
├── llm-balancer/                 # Load balancer (multiple backends)
│   ├── index.js                  # Load balancer server
│   ├── config.js                 # Configuration loader
│   ├── balancer.js               # Round-robin balancer
│   ├── health-check.js           # Health checker
│   ├── package.json
│   ├── .env.example
│   └── README.md
└── README.md                     # This file
```

## Installation

Both services use the same dependencies:

```bash
# Install dependencies
npm install
```

## Which one should I use?

- **Use the simple gateway** if you have a single Ollama server
- **Use the load balancer** if you have multiple Ollama servers and want automatic failover and load distribution

## Environment Variables

### For Simple Gateway

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OLLAMA_BASE_URL` | `http://host1:11434` | Target Ollama server URL |

### For Load Balancer

See `llm-balancer/.env.example` for all available options.

## Troubleshooting

### Ensure Ollama server(s) are running

```bash
# Check backend connectivity
curl http://host1:11434/api/tags
curl http://host2:11434/api/tags
```