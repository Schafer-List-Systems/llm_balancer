# Troubleshooting Guide

This guide covers common issues and their solutions.

---

## Backend Not Responding

### Symptom
All backends show as unhealthy in the health check.

### Causes and Solutions

**1. Ollama servers not running**
```bash
# Check if Ollama servers are responding
curl http://host1:11434/api/tags
curl http://host2:11434/api/tags

# Start Ollama server
ollama serve
```

**2. Incorrect backend URLs**
```bash
# Verify URLs in .env file
cat llm-balancer/.env | grep OLLAMA_BACKENDS

# Test connectivity directly
curl http://correct-host:11434/api/tags
```

**3. Network connectivity issues**
```bash
# Check network connectivity
ping host1
telnet host1 11434

# For Docker environments, use service names
curl http://llm-backend-1:11434/api/tags
```

---

## Port Already in Use

### Symptom
Error: `EADDRINUSE: address already in use ::?:3001`

### Solution

```bash
# Use a different port
LB_PORT=3002 npm start

# Or find and kill the process using the port
lsof -i :3001
kill -9 <pid>
```

---

## Dashboard Not Accessible

### Symptom
Frontend dashboard shows connection error or doesn't load.

### Causes and Solutions

**1. Backend not running**
```bash
# Check backend health
curl http://localhost:3001/health

# Ensure backend is running on configured port
```

**2. Incorrect API_BASE_URL**
```bash
# Check frontend .env file
cat frontend/.env | grep API_BASE_URL

# Update if incorrect
API_BASE_URL=http://localhost:3001
```

**3. Browser cache issues**
```bash
# Clear browser cache and reload
# Or use incognito/private mode
```

**4. Frontend build issues**
```bash
# Rebuild frontend
cd frontend
npm run build
npm start
```

---

## Payload Size Errors

### Symptom
Error: `Request entity too large` or similar.

### Solution

Increase the maximum payload size:

```bash
# In llm-balancer/.env
MAX_PAYLOAD_SIZE=104857600  # 100MB

# Or for larger payloads
MAX_PAYLOAD_SIZE=209715200  # 200MB
```

Restart the server after changing the value.

---

## All Backends Unhealthy

### Symptom
Health check shows 0 healthy backends.

### Causes and Solutions

**1. Health check timeout too short**
```bash
# Increase health check timeout
HEALTH_CHECK_TIMEOUT=10000  # 10 seconds

# Or increase interval
HEALTH_CHECK_INTERVAL=60000  # 60 seconds
```

**2. Backends recovering slowly**
```bash
# Check detailed stats
curl http://localhost:3001/stats | jq '.backendDetails[] | {url, healthy, failCount}'

# Manually trigger health check
curl http://localhost:3001/health/http://host1:11434
```

**3. Network latency**
```bash
# Check network latency to backends
time curl http://host1:11434/api/tags
```

---

## Queue Full Errors

### Symptom
Error: `Queue is full` or requests being rejected.

### Solution

```bash
# Increase queue size
MAX_QUEUE_SIZE=200

# Or decrease queue timeout
QUEUE_TIMEOUT=15000  # 15 seconds

# Add more backends to reduce load
```

---

## High Latency

### Symptom
Requests taking longer than expected.

### Causes and Solutions

**1. Backends at capacity**
```bash
# Check utilization
curl http://localhost:3001/backends | jq '.backends[] | {url, activeRequestCount, maxConcurrency, utilizationPercent}'

# Increase concurrency limits
BACKEND_CONCURRENCY_0=10
BACKEND_CONCURRENCY_1=10
```

**2. Network issues**
```bash
# Check network latency
ping host1
traceroute host1
```

**3. Backend performance**
```bash
# Test backend directly (bypassing balancer)
curl http://host1:11434/api/generate -d '{"model": "llama2", "prompt": "Test"}'
```

---

## Debug Mode Issues

### Symptom
Debug endpoints not returning expected data.

### Solutions

**1. Debug mode not enabled**
```bash
# Enable debug mode
DEBUG=true npm start

# Or in .env file
DEBUG=true
```

**2. Debug history cleared**
```bash
# Check debug stats
curl http://localhost:3001/debug/stats

# View recent requests
curl http://localhost:3001/debug/requests/recent?n=20
```

**3. Requests not being tracked**
```bash
# Ensure requests are going through tracked routes
# Only /v1/messages*, /api/*, /models* are tracked

# Test with a tracked route
curl http://localhost:3001/api/tags
```

---

## Docker-Specific Issues

### Symptom
Containers not starting or communicating.

### Solutions

**1. Check container status**
```bash
docker compose ps
```

**2. View logs**
```bash
# All logs
docker compose logs -f

# Specific service
docker compose logs -f llm-balancer
docker compose logs -f llm-balancer-frontend
```

**3. Rebuild containers**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

**4. Network issues**
```bash
# Check Docker network
docker network ls
docker network inspect llm_balancer_default

# Test container communication
docker exec -it llm-balancer-backend curl http://llm-balancer-frontend:3080
```

---

## API Detection Issues

### Symptom
Backends not showing detected API types.

### Solutions

**1. Check startup logs**
```bash
# View startup logs for API detection
docker compose logs llm-balancer | grep -i "api\|detect"
```

**2. Verify backend endpoints**
```bash
# Test API endpoints directly
curl http://host1:11434/v1/models
curl http://host1:11434/api/tags
```

**3. Check backend compatibility**
```bash
# Some backends may not support all APIs
# Check which APIs your backend supports
curl http://host1:11434/api/tags
```

---

## Performance Issues

### Symptom
Slow response times or high CPU usage.

### Solutions

**1. Reduce health check frequency**
```bash
HEALTH_CHECK_INTERVAL=60000  # 60 seconds
```

**2. Disable debug mode in production**
```bash
DEBUG=false
```

**3. Adjust concurrency limits**
```bash
# Reduce max concurrency if backends are overwhelmed
BACKEND_CONCURRENCY_0=3
```

---

## Getting More Help

### Enable Verbose Logging

```bash
# Check system logs
journalctl -u llm-balancer -f

# Or view container logs
docker compose logs -f
```

### Check Documentation

- [Installation Guide](INSTALLATION.md) - Installation options
- [Usage Guide](USAGE.md) - Configuration and usage
- [API Reference](../api/ENDPOINTS.md) - API documentation
- [Developer Debugging](../developer/DEBUGGING.md) - Developer debugging guide

### Debug Endpoints

```bash
# System statistics
curl http://localhost:3001/stats

# Backend details
curl http://localhost:3001/backends

# Health status
curl http://localhost:3001/health
```

---

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `EADDRINUSE` | Port already in use | Use different port or kill existing process |
| `Queue is full` | Max queue size reached | Increase MAX_QUEUE_SIZE or add backends |
| `Request entity too large` | Payload exceeds limit | Increase MAX_PAYLOAD_SIZE |
| `No healthy backends` | All backends unhealthy | Check backend URLs and network connectivity |
| `Connection refused` | Backend not accessible | Verify backend is running and accessible |
