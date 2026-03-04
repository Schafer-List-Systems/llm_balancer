# LLM Balancer - Quick Start Guide

## Setup

1. Install dependencies:
```bash
cd llm-balancer
npm install
```

2. Configure backends:
```bash
cp .env.example .env
# Edit .env with your backend URLs
```

Example `.env`:
```bash
OLLAMA_BACKENDS=http://host1:11434,http://host2:11434
LB_PORT=3001
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
MAX_PAYLOAD_SIZE=104857600
```

Common `MAX_PAYLOAD_SIZE` values:
- 50MB = 52428800
- 100MB = 104857600
- 200MB = 209715200

3. Start the server:
```bash
npm start
```

## Testing

Check health:
```bash
curl http://localhost:3001/health
```

View statistics:
```bash
curl http://localhost:3001/stats
```

Test API:
```bash
# List models
curl http://localhost:3001/api/tags

# Generate response
curl http://localhost:3001/api/generate \
  -d '{"model": "llama2", "prompt": "Hello!"}'
```

## Features

- ✅ **FIFO queueing** for request distribution
- ✅ Automatic health checking every 30 seconds
- ✅ Automatic failover when backends fail
- ✅ Graceful shutdown handling
- ✅ Detailed health and statistics endpoints

## Architecture

```
Client → Load Balancer (Port 3001) → Backend 1 → Ollama Server
                           ↓
                           → Backend 2 → Ollama Server
                           ↓
                           → Backend 3 → Ollama Server
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Health check |
| `/stats` | Detailed statistics |
| `/api/*` | Ollama API routes |
| `/v1/messages*` | Anthropic API routes |
| `/backend/current` | Current backend info |
| `/health/:backendUrl` | Manual health check |

## Monitoring

The load balancer automatically:
1. Health checks all backends every 30 seconds
2. Marks unhealthy backends as failed
3. Skips unhealthy backends during selection
4. Recovers backends when they become healthy again

View real-time health status:
```bash
watch -n 5 'curl -s http://localhost:3001/health | jq'
```

## Troubleshooting

**Port already in use?**
```bash
LB_PORT=3002 npm start
```

**Backend not responding?**
```bash
# Check health of specific backend
curl http://localhost:3001/health/http://host1:11434

# Check detailed stats
curl http://localhost:3001/stats
```

**All backends unhealthy?**
```bash
# Check backend connectivity
curl http://host1:11434/api/tags
curl http://host2:11434/api/tags

# Manually trigger health check
curl http://localhost:3001/health/http://host1:11434
```

## Notes

- Backends are health checked using the `/api/tags` endpoint
- Each backend has a failCount that increments on consecutive failures
- Failed backends are automatically recovered when health checks pass
- Server gracefully handles SIGINT (Ctrl+C) and SIGTERM signals