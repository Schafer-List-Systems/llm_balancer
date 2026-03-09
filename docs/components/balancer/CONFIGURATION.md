# Balancer Configuration

Configuration options specific to the balancer component.

## Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BACKENDS` | None | Comma-separated backend URLs |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N |
| `BACKEND_CONCURRENCY_N` | 1 | Max concurrency for backend at index N |

### Balancer Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LB_PORT` | 3001 | Server port |
| `MAX_QUEUE_SIZE` | 100 | Maximum queue size |
| `QUEUE_TIMEOUT` | 30000 | Queue timeout (ms) |
| `MAX_RETRIES` | 3 | Maximum retry attempts |

### Health Check Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_CHECK_INTERVAL` | 30000 | Health check interval (ms) |
| `HEALTH_CHECK_TIMEOUT` | 5000 | Health check timeout (ms) |

### System Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PAYLOAD_SIZE` | 52428800 | Maximum request payload (bytes) |
| `SHUTDOWN_TIMEOUT` | 60000 | Graceful shutdown timeout (ms) |
| `DEBUG` | false | Enable debug mode |

## Priority Configuration

### Index-Based Priority

```bash
# Backend 0 - Priority 100
BACKEND_PRIORITY_0=100

# Backend 1 - Priority 50
BACKEND_PRIORITY_1=50

# Backend 2 - Priority 0
BACKEND_PRIORITY_2=0
```

### Priority Behavior

- Higher numbers = higher priority
- Backends are selected in priority order
- Immediate fallback to lower priority when higher priority backends are at capacity

## Concurrency Configuration

### Index-Based Concurrency

```bash
# Backend 0 - Allow 5 concurrent requests
BACKEND_CONCURRENCY_0=5

# Backend 1 - Allow 2 concurrent requests
BACKEND_CONCURRENCY_1=2
```

### Concurrency Behavior

- Limits max parallel requests per backend
- Utilization = `activeRequestCount / maxConcurrency * 100`
- Backends at capacity trigger fallback to other backends

## Queue Configuration

### Queue Settings

```bash
# Maximum requests that can be queued
MAX_QUEUE_SIZE=100

# Timeout for queued requests (ms)
QUEUE_TIMEOUT=30000
```

### Queue Behavior

- Requests are queued when all backends are busy
- FIFO ordering within queue
- Requests rejected if queue is full or timeout expires

## Example Configuration

### Development

```bash
OLLAMA_BACKENDS="http://localhost:11434"
LB_PORT=3001
HEALTH_CHECK_INTERVAL=10000
DEBUG=true
```

### Production

```bash
OLLAMA_BACKENDS="http://fast-1:11434,http://fast-2:11434,http://slow-1:11434"
BACKEND_PRIORITY_0=100
BACKEND_PRIORITY_1=100
BACKEND_PRIORITY_2=10
BACKEND_CONCURRENCY_0=10
BACKEND_CONCURRENCY_1=10
BACKEND_CONCURRENCY_2=5
LB_PORT=3001
HEALTH_CHECK_INTERVAL=30000
MAX_QUEUE_SIZE=200
```

## Related Documentation

- [Usage Guide](../../user/USAGE.md) - Complete usage guide
- [Installation](../../user/INSTALLATION.md) - Installation options
- [Troubleshooting](../../user/TROUBLESHOOTING.md) - Common issues
