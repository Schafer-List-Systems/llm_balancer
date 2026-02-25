# Ollama API Gateway

A simple API gateway that forwards requests to an Ollama server, supporting both Anthropic and Ollama API formats.

## Features

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
# Default: http://10.0.0.1:11434
export OLLAMA_BASE_URL=http://10.0.0.1:11434
```

Or you can modify the default in `index.js`:

```javascript
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://10.0.0.1:11434';
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
| `OLLAMA_BASE_URL` | `http://10.0.0.1:11434` | Target Ollama server URL |

## Architecture

```
Client → Gateway (localhost:3000) → Ollama Server (10.0.0.1:11434)
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
curl http://10.0.0.1:11434/api/tags
```

### Check logs

The gateway logs errors to the console. Watch for connection issues or authentication errors.