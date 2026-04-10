# Installation Guide

This guide covers installation options for the LLM Balancer.

## Prerequisites

- Node.js 16.x or later
- npm or yarn package manager
- At least one Ollama server running

---

## Installation Options

### Option 1: Docker (Recommended)

Docker provides isolated environments and simplifies deployment.

#### Prerequisites

- Docker installed
- Docker Compose installed

#### Steps

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd llm_balancer
   ```

2. **Copy the configuration template**:
   ```bash
   cp llm-balancer/config.example.json llm-balancer/config.json
   ```

3. **Edit the `config.json` file** to configure your backends:
   - The file must be writable by the Docker daemon (volume mount requires write access)
   - Adjust backend URLs, priorities, and other settings as needed

4. **Build and start services**:
   ```bash
   docker compose up --build
   ```

5. **Access the services**:
   - Backend API: http://localhost:3001
   - Frontend Dashboard: http://localhost:3080

#### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (clean install)
docker compose down -v
```

#### Viewing Logs

```bash
# All logs
docker compose logs -f

# Specific service
docker compose logs -f llm-balancer
docker compose logs -f llm-balancer-frontend
```

---

### Option 2: Manual Installation

> **⚠️ Untested** - This installation method is not currently tested. Docker installation (Option 1) is recommended.

Install directly on your development or production system.

#### Backend Installation

1. **Navigate to the backend directory**:
   ```bash
   cd llm-balancer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit the `.env` file**:
   ```bash
   # Backend URLs (comma-separated)
   BACKENDS="http://host1:11434,http://host2:11434"

   # Server port (default: 3001)
   LB_PORT=3001

   # Health check settings
   HEALTH_CHECK_INTERVAL=30000
   HEALTH_CHECK_TIMEOUT=5000

   # Priority configuration (optional)
   BACKEND_PRIORITY_0=100
   BACKEND_PRIORITY_1=50

   # Concurrency configuration (optional)
   BACKEND_CONCURRENCY_0=5
   BACKEND_CONCURRENCY_1=2
   ```

5. **Start the backend**:
   ```bash
   npm start
   ```

#### Frontend Installation

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit the `.env` file**:
   ```bash
   FRONTEND_PORT=3080
   API_BASE_URL=http://localhost:3001
   REFRESH_INTERVAL=5000
   ```

5. **Build and start the frontend**:
   ```bash
   npm run dev:build
   npm start
   ```

---

### Option 3: Development Installation

> **⚠️ Untested** - This installation method is not currently tested.

For development and testing purposes.

#### Backend Development

1. **Install dependencies**:
   ```bash
   cd llm-balancer
   npm install
   ```

2. **Set environment variables**:
   ```bash
   export BACKENDS="http://host1:11434,http://host2:11434"
   export LB_PORT=3001
   ```

3. **Start in development mode**:
   ```bash
   npm start
   ```

4. **Enable debug mode** (optional):
   ```bash
   export DEBUG=true
   ```

#### Frontend Development

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Start in development mode**:
   ```bash
   npm run dev:build
   ```

The frontend will rebuild automatically when source files change.

---

## Configuration Reference

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKENDS` | None | Comma-separated list of backend URLs |
| `LB_PORT` | 3001 | Server port |
| `HEALTH_CHECK_INTERVAL` | 30000 | Health check interval (ms) |
| `HEALTH_CHECK_TIMEOUT` | 5000 | Health check timeout (ms) |
| `MAX_RETRIES` | 3 | Maximum retry attempts |
| `MAX_PAYLOAD_SIZE` | 52428800 | Maximum request payload (bytes) |
| `MAX_QUEUE_SIZE` | 100 | Maximum queue size |
| `QUEUE_TIMEOUT` | 30000 | Queue timeout (ms) |
| `SHUTDOWN_TIMEOUT` | 60000 | Graceful shutdown timeout (ms) |
| `DEBUG` | false | Enable debug mode |
| `BACKEND_PRIORITY_N` | 1 | Priority for backend at index N |
| `BACKEND_CONCURRENCY_N` | 1 | Max concurrency for backend at index N |

### Frontend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | 3080 | Frontend server port |
| `API_BASE_URL` | http://localhost:3001 | Backend API URL |
| `REFRESH_INTERVAL` | 5000 | Auto-refresh interval (ms) |

---

## Verification

After installation, verify the setup:

### Check Backend Health

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "healthyBackends": 2,
  "totalBackends": 2,
  ...
}
```

### Check Frontend Access

Open http://localhost:3080 in your browser.

### Test API Endpoint

```bash
curl http://localhost:3001/api/tags
```

---

## Next Steps

- [Usage Guide](USAGE.md#configuration) - Configure and use the balancer
- [Troubleshooting](TROUBLESHOOTING.md#common-issues) - Common issues and solutions
- [API Reference](../api/ENDPOINTS.md#api-reference) - API documentation

---

## Docker-Specific Installation

For Docker-specific deployment details, see [../components/docker/DEPLOYMENT.md#production-deployment](../components/docker/DEPLOYMENT.md#production-deployment).
