# Frequently Asked Questions

Common questions about the LLM Balancer.

---

## General Questions

### What is the LLM Balancer?

The LLM Balancer is a load balancer for Ollama API servers that provides:
- Priority-based load balancing across multiple backends
- Automatic health checking and failover
- Concurrency-based load limiting
- Multi-API support (OpenAI, Anthropic, Google Gemini, Ollama)
- Real-time monitoring dashboard

### Why use a load balancer for Ollama?

- **High Availability**: Automatic failover when backends fail
- **Load Distribution**: Even distribution of requests across backends
- **Scalability**: Add more backends as needed
- **Priority Control**: Route critical requests to high-performance servers
- **Monitoring**: Real-time visibility into backend health and utilization

### What APIs are supported?

The balancer auto-detects and supports:
- **OpenAI-compatible** - OpenAI, Mistral, Groq, Cohere
- **Anthropic** - Claude API format
- **Google Gemini** - Google's API format
- **Ollama** - Native Ollama API

---

## Installation Questions

### Do I need Docker?

No. You can install manually:
- **Docker**: Recommended for production, isolated environments
- **Manual**: Direct installation on your system
- **Development**: Simplified setup for testing

See [Installation Guide](INSTALLATION.md) for details.

### What are the system requirements?

- Node.js 16.x or later
- npm or yarn
- At least one Ollama server
- Minimum 512MB RAM
- Port 3001 (backend) and 3080 (frontend) available

### Can I run without the frontend?

Yes. The backend load balancer works independently:
```bash
cd llm-balancer
npm start
```

The frontend is optional and provides a monitoring dashboard.

---

## Configuration Questions

### How do I add a new backend?

1. Add the backend URL to `OLLAMA_BACKENDS`:
   ```bash
   OLLAMA_BACKENDS="http://host1:11434,http://host2:11434,http://host3:11434"
   ```

2. Restart the balancer:
   ```bash
   npm restart
   ```

### How do I set backend priorities?

Use index-based priority:
```bash
# Backend 0 gets priority 100
BACKEND_PRIORITY_0=100

# Backend 1 gets priority 50
BACKEND_PRIORITY_1=50

# Backend 2 gets priority 0
BACKEND_PRIORITY_2=0
```

Higher numbers = higher priority.

### What's the difference between priority and concurrency?

- **Priority**: Determines which backends are preferred for request routing
- **Concurrency**: Limits how many requests a backend can handle simultaneously

Example:
```bash
# High-priority backend with high concurrency
BACKEND_PRIORITY_0=100
BACKEND_CONCURRENCY_0=10

# Low-priority backend with low concurrency
BACKEND_PRIORITY_1=0
BACKEND_CONCURRENCY_1=2
```

### Can I use environment variables or .env file?

Both work:
```bash
# Environment variable
OLLAMA_BACKENDS="http://host1:11434" npm start

# .env file
# In llm-balancer/.env
OLLAMA_BACKENDS="http://host1:11434"
```

The .env file is recommended for persistent configuration.

### How do I change the port?

```bash
# Change backend port
LB_PORT=3002 npm start

# Change frontend port
FRONTEND_PORT=3081 npm start
```

---

## Usage Questions

### How does priority-based selection work?

1. Backends are grouped by priority level
2. Requests are first routed to the highest priority tier
3. If no backend is available in that tier, immediately fall back to the next lower tier
4. Within the same tier, backends are selected based on availability and concurrency

### What happens when a backend fails?

1. Health check detects the failure
2. Backend is marked as unhealthy
3. Requests are automatically routed to healthy backends
4. When the backend recovers, it's automatically added back to the pool

### How are requests queued?

When all backends are at capacity:
1. Request is added to the FIFO queue
2. Request waits until a backend becomes available
3. If queue is full, request is rejected
4. If queue timeout expires, request is rejected

### Can I use the balancer with different API formats?

Yes. The balancer automatically routes requests based on the endpoint:
- `/v1/messages*` - Anthropic API format
- `/api/*` - Ollama API format
- `/models*` - Model list endpoint

The balancer forwards requests to the appropriate backend.

---

## Monitoring Questions

### How do I check backend health?

```bash
# Health endpoint
curl http://localhost:3001/health

# Backend details
curl http://localhost:3001/backends

# Full statistics
curl http://localhost:3001/stats
```

### What does "utilization percentage" mean?

Utilization = `(activeRequestCount / maxConcurrency) * 100`

Example:
- `activeRequestCount: 3`
- `maxConcurrency: 5`
- `utilizationPercent: 60%`

### How often are health checks performed?

Default: Every 30 seconds.

Configure with:
```bash
HEALTH_CHECK_INTERVAL=30000  # 30 seconds
```

### Can I see which backend handled a request?

Yes, with debug mode enabled:
```bash
DEBUG=true npm start

# View recent requests
curl http://localhost:3001/debug/requests/recent?n=10
```

---

## Performance Questions

### How many backends can I configure?

There's no hard limit. The balancer can handle:
- Small setups: 2-5 backends
- Medium setups: 5-20 backends
- Large setups: 20+ backends

Performance depends on your system resources.

### What affects performance?

- **Number of backends**: More backends = more health check overhead
- **Health check frequency**: More frequent checks = more network traffic
- **Queue size**: Large queues = higher memory usage
- **Debug mode**: Enabled debug = higher CPU/memory usage

### How do I optimize performance?

```bash
# Reduce health check frequency
HEALTH_CHECK_INTERVAL=60000

# Disable debug mode in production
DEBUG=false

# Adjust concurrency limits
BACKEND_CONCURRENCY_0=10

# Increase payload size if needed
MAX_PAYLOAD_SIZE=104857600
```

---

## Docker Questions

### How do I deploy with Docker?

```bash
# Build and start
docker compose up --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Can I customize the Docker deployment?

Yes, edit `docker-compose.yml`:
```yaml
services:
  llm-balancer:
    environment:
      - OLLAMA_BACKENDS=http://host1:11434,http://host2:11434
```

### How do I update the Docker deployment?

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Troubleshooting Questions

### All backends show as unhealthy

1. Check if Ollama servers are running
2. Verify backend URLs are correct
3. Test connectivity directly: `curl http://host:11434/api/tags`
4. Check network/firewall settings

### Requests are being rejected

1. Check if any backends are healthy
2. Increase queue size: `MAX_QUEUE_SIZE=200`
3. Add more backends
4. Check concurrency limits

### High latency

1. Check backend utilization: `curl http://localhost:3001/backends`
2. Increase concurrency limits
3. Check network latency to backends
4. Test backend performance directly

### Frontend not connecting

1. Verify backend is running
2. Check `API_BASE_URL` in frontend `.env`
3. Clear browser cache
4. Rebuild frontend: `npm run build`

---

## Security Questions

### Is the balancer secure?

- **CORS**: Enabled with `Access-Control-Allow-Origin: *`
- **Payload size**: Configurable limit to prevent large payloads
- **Debug mode**: Should be disabled in production

### Should I enable debug mode in production?

No. Debug mode:
- Exposes request/response content
- Increases memory usage
- Should only be used for troubleshooting

### How do I protect debug endpoints?

1. Disable debug mode in production: `DEBUG=false`
2. Use reverse proxy authentication
3. Restrict access by IP address
4. Use environment-based configuration

---

## Next Steps

- [Installation Guide](INSTALLATION.md) - Installation options
- [Usage Guide](USAGE.md) - Configuration and usage
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [API Reference](../api/ENDPOINTS.md) - API documentation
