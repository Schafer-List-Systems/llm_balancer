# LLM Balancer Implementation Summary

## Overview

Successfully implemented a load balancer for Ollama API servers with health checking and automatic failover capabilities.

## Architecture

### Components

1. **config.js** - Configuration module
   - Parses backend URLs from environment variables
   - Loads configuration settings (port, health check intervals, timeouts, retries)
   - Creates backend objects with health status tracking

2. **balancer.js** - Priority-based load balancer with FIFO queueing
   - Distributes requests across multiple backends by priority
   - Skips unhealthy backends
   - Tracks request counts and health check statistics
   - Provides recovery mechanisms for failed backends

3. **health-check.js** - Health monitoring
   - Periodically checks backend health via `/api/tags` endpoint
   - Automatically marks unhealthy backends
   - Recovers healthy backends
   - Configurable interval and timeout

4. **index.js** - Express application
   - Routes requests to appropriate backend
   - Handles streaming and non-streaming responses
   - Provides health check and statistics endpoints
   - Implements graceful shutdown

5. **package.json** - Dependencies and scripts
   - Express framework for HTTP server
   - npm scripts for running gateway and load balancer

6. **.env.example** - Configuration template
   - Documented environment variables
   - Example configurations

7. **README.md** - Comprehensive documentation
   - Features and usage instructions
   - API reference
   - Troubleshooting guide

8. **QUICKSTART.md** - Quick start guide
   - Setup instructions
   - Testing examples
   - Common troubleshooting scenarios

## Key Features Implemented

✅ **FIFO-based load balancing** - Distributes requests across multiple backends
✅ **Smart request routing with idle backend prioritization** - Routes to idle backends first for better load distribution
✅ **Per-backend busy state tracking** - Each backend tracks if it's handling a request
✅ **30-second timeout for busy state** - Prevents backends from staying stuck in busy state
✅ **Health checking** - Periodic health checks via `/api/tags` endpoint
✅ **Automatic failover** - Skips unhealthy backends during selection
✅ **Backend recovery** - Automatically recovers healthy backends
✅ **Streaming support** - Maintains streaming response capability
✅ **Multiple API formats** - Supports Anthropic and Ollama API formats
✅ **Health endpoints** - `/health` and `/health/:backendUrl`
✅ **Statistics endpoint** - `/stats` with detailed information including busy counts
✅ **Current backend info** - `/backend/current` for debugging
✅ **Graceful shutdown** - Handles SIGINT and SIGTERM signals
✅ **Error handling** - Comprehensive error messages and logging
✅ **Configuration flexibility** - Environment-based configuration
✅ **Documentation** - Complete README and quick start guide

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BACKENDS` | Single URL | Comma-separated list of backend URLs |
| `LB_PORT` | 3001 | Server port |
| `HEALTH_CHECK_INTERVAL` | 30000ms | Health check interval |
| `HEALTH_CHECK_TIMEOUT` | 5000ms | Health check timeout |
| `MAX_RETRIES` | 3 | Maximum retry attempts per request |
| `MAX_PAYLOAD_SIZE` | 52428800 (50MB) | Maximum request payload size in bytes |

## Busy State Tracking

### Overview
Each backend tracks whether it's actively handling a request. The load balancer prioritizes idle backends to distribute load more evenly across all available servers.

### Implementation Details

1. **Backend Configuration** (`config.js`):
   - Each backend object includes `busy: false` property
   - Tracks whether the backend is currently processing a request

2. **Request Routing** (`balancer.js`):
   - **Priority 1**: Selects an idle, healthy backend (`!b.busy`)
   - **Priority 2**: Falls back to lower priority backends when higher priority are busy
   - This ensures better load distribution when backends have varying request loads

3. **Busy State Management** (`index.js`):
   - Marks backend as busy when a request starts
   - Sets 30-second timeout to clear busy state if request hangs
   - Clears timeout and marks backend as idle when request completes
   - Applies to both streaming and non-streaming request paths

4. **Statistics & Monitoring**:
   - `/health` endpoint returns `busyBackends` and `idleBackends` counts
   - `/stats` endpoint provides detailed busy state for each backend
   - `/backends` endpoint shows busy status per backend

### Example Usage

```bash
# Check busy state
curl http://localhost:3001/health
# Returns: { ..., "busyBackends": 1, "idleBackends": 2, ... }

# View detailed backend status with busy state
curl http://localhost:3001/backends
# Returns: { "backends": [{ "url": "...", "healthy": true, "busy": true, ... }] }
```

### Benefits
- **Even load distribution**: Prevents overloading individual backends
- **Automatic recovery**: 30-second timeout prevents stuck busy states
- **Real-time visibility**: Always know which backends are available
- **Better performance**: Routes requests to servers that are ready to handle them

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service information |
| `/health` | GET | Health check with backend status |
| `/stats` | GET | Detailed statistics |
| `/backend/current Remedies` | GET | Current backend info |
| `/health/:backendUrl Remedies` | GET | Manual health check |
| `/v1/messages*` | * | Anthropic API routes |
| `/api/*` | * | Ollama API routes |
| `/models*` | * | Model list endpoint |

## Usage Examples

### Multiple Backends (Load Balancer)

```bash
# Load balancer
cd llm-balancer
OLLAMA_BACKENDS="http://host1:11434,http://host2:11434" LB_PORT=3001 npm start
```

### Testing

```bash
# Check health
curl http://localhost:3001/health

# View statistics
curl http://localhost:3001/stats

# Test API
curl http://localhost:3001/api/tags
```

## Testing Results

All components have been tested and verified:

✅ Health check endpoint works correctly
✅ Statistics endpoint provides detailed information
✅ FIFO-based distribution works as expected
✅ Backend health tracking functions properly
✅ Streaming responses handled correctly
✅ Configuration loading works with environment variables
✅ Graceful shutdown handles signals properly

## Files Created

### Core Implementation
- `/llm-balancer/config.js` - Configuration loader
- `/llm-balancer/balancer.js` - Load balancer logic
- `/llm-balancer/health-check.js` - Health checker
- `/llm-balancer/index.js` - Express application

### Configuration & Documentation
- `/llm-balancer/package.json` - Dependencies
- `/llm-balancer/package-lock.json` - Lock file
- `/llm-balancer/.env.example` - Configuration template
- `/llm-balancer/README.md` - Comprehensive documentation
- `/llm-balancer/QUICKSTART.md` - Quick start guide
- `/llm-balancer/IMPLEMENTATION.md` - This file

## Compatibility

- Maintains compatibility with existing Ollama API format
- Supports both Anthropic and Ollama API request formats
- Compatible with Ollama API version 0.1.x and later
- Uses Express 4.18.2 for HTTP server

## Concurrency Count Management

### Overview
This section explains how `activeRequestCount` is managed across the codebase to prevent bugs related to double-incrementing or count drift.

### Request Flow and Counter Lifecycle

1. **Request arrives** at route handler in `index.js` (e.g., `/v1/messages*`, `/api/*`)
2. **`balancer.queueRequest()` is called**:
   - If queue is empty AND backend available → returns backend immediately
   - Otherwise → queues request, returns Promise that resolves when backend frees up
   - **Important:** Does NOT modify `activeRequestCount`
3. **Backend assigned** to `forwardRequest()` in `index.js`
4. **`processRequest(balancer, backend, req, res)` is called** (`request-processor.js`)
   - **ONLY HERE:** `backend.activeRequestCount++` (line 111)
5. **HTTP request executes** to the backend
6. **Request completes**, `releaseBackend(balancer, backend)` is called (`request-processor.js:91-98`)
   - `backend.activeRequestCount--` (line 93)
   - If count drops below `maxConcurrency`, calls `balancer.notifyBackendAvailable()` to wake queued requests

### Key Rules

| Action | Location | Counter Modified |
|--------|----------|------------------|
| Assign backend | `queueRequest()`, `notifyBackendAvailable()` | `requestCount++` (total served) |
| Start processing | `processRequest()` | `activeRequestCount++` |
| Release backend | `releaseBackend()` | `activeRequestCount--` |

### Why This Design?

The separation ensures **exactly one increment and one decrement per request**. If the balancer also incremented `activeRequestCount` in `queueRequest()` or `notifyBackendAvailable()`, we'd get double-increment:

```
// WRONG (old buggy code):
queueRequest(): backend.activeRequestCount++  // First increment
processRequest(): backend.activeRequestCount++ // Second increment!
releaseBackend(): backend.activeRequestCount-- // Only one decrement!
// Result: count drifts up by 1 per request until backends appear permanently busy
```

The fix: `activeRequestCount` is **only** managed in `request-processor.js`, not in the balancer's queue methods.

### Regression Tests

See `tests/unit/balancer.test.js` → "Concurrency Count Integrity (Regression Tests)" section for tests that verify:
- Correct count after immediate assignment
- Correct count when queuing
- No count drift with rapid sequential requests
- Count integrity after multiple release cycles

## Future Enhancements

Possible improvements for future versions:
1. Additional load balancing algorithms (least-connections, weighted)
2. Custom health check endpoints per backend
3. Request timeout handling
4. Circuit breaker pattern implementation
5. Prometheus metrics export
6. Docker containerization
7. Configuration file support (YAML/JSON)
8. Rate limiting per backend
9. Request/response logging
10. Backend health score calculation

## Conclusion

The LLM Balancer has been successfully implemented with all core features working as expected. The system provides a robust solution for distributing requests across multiple Ollama backends with automatic health checking and failover capabilities.
