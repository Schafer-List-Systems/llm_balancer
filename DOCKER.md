# Docker Setup

This setup uses Docker and Docker Compose to run the LLM Balancer and Frontend with clear service naming.

## Services

### llm-balancer (Backend)
- **Port**: 3001
- **Container name**: `llm-balancer-backend`
- **Function**: Manages load balancing and health checks for Ollama backends

### llm-balancer-frontend (Frontend)
- **Port**: 3080
- **Container name**: `llm-balancer-frontend`
- **Function**: Dashboard for monitoring the balancer

## Quick Start

### Build and Run (Docker)
```bash
# Build and start all services
npm run start:docker

# Or use docker compose directly
docker compose up --build
```

### Stop (Docker)
```bash
# Stop all services
npm run stop:docker

# Or use docker compose directly
docker compose down
```

### Restart (Docker)
```bash
# Restart all services
npm run restart:docker

# Or use docker compose directly
docker compose restart
```

## Accessing the Dashboard

Once the containers are running:
- Frontend: http://localhost:3080
- Backend API: http://localhost:3001

## Troubleshooting

### Check container status
```bash
docker compose ps
```

### View logs
```bash
# All logs
docker compose logs -f

# Specific service logs
docker compose logs -f llm-balancer
docker compose logs -f llm-balancer-frontend
```

### Rebuild containers
```bash
# Rebuild and restart
docker compose up -d --build
```

### Manual Docker commands
```bash
# Build only
docker compose build

# Run without detaching
docker compose up

# Stop without removing volumes
docker compose stop

# Remove containers (keep volumes)
docker compose down
```

## Configuration

The `.env` file in the `frontend/` directory contains:
- `API_BASE_URL`: Points to the Docker service name (not localhost)
- `FRONTEND_PORT`: Port for the frontend server

### Adding Ollama Backends

Edit the `docker-compose.yml` file and update the `OLLAMA_BACKENDS` environment variable:
```yaml
environment:
  - OLLAMA_BACKENDS=http://your-backend-1:11434,http://your-backend-2:11434
```

## Benefits of Docker Setup

1. **Clear naming**: Services have distinct container names
2. **Process isolation**: No confusion between frontend and backend processes
3. **Automatic restart**: Services restart automatically if they crash
4. **Easy cleanup**: No orphaned processes to manage
5. **Port separation**: Each service uses its own port
6. **Health checks**: Services monitor each other's health
