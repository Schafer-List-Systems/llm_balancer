# Docker Deployment

Production deployment guide for Docker.

## Overview

This guide covers deploying the LLM Balancer using Docker and Docker Compose.

## Prerequisites

- Docker installed
- Docker Compose installed
- At least one Ollama server running

## Deployment Steps

### 1. Configure Environment

Edit the `.env` file in the root directory:

```bash
# Backend URLs
BACKENDS="http://host1:11434,http://host2:11434"

# Server port
LB_PORT=3001

# Health check settings
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000

# Frontend settings
FRONTEND_PORT=3080
API_BASE_URL=http://llm-balancer:3001
```

### 2. Build and Start

```bash
# Build and start all services
docker compose up --build

# Or run in detached mode
docker compose up -d --build
```

### 3. Verify Deployment

```bash
# Check service status
docker compose ps

# Check logs
docker compose logs -f

# Test backend
curl http://localhost:3001/health

# Test frontend
curl http://localhost:3080
```

## Production Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  llm-balancer:
    build: ./docker/balancer
    ports:
      - "3001:3001"
    environment:
      - BACKENDS=${BACKENDS}
      - LB_PORT=3001
      - HEALTH_CHECK_INTERVAL=30000
    restart: unless-stopped
    networks:
      - balancer-network

  llm-balancer-frontend:
    build: ./frontend
    ports:
      - "3080:3080"
    environment:
      - FRONTEND_PORT=3080
      - API_BASE_URL=http://llm-balancer:3001
    depends_on:
      - llm-balancer
    restart: unless-stopped
    networks:
      - balancer-network

networks:
  balancer-network:
    driver: bridge
```

## Deployment Options

### Option 1: Single Server

Deploy both backend and frontend on a single server.

### Option 2: Distributed

Deploy backend and frontend on separate servers.

### Option 3: Kubernetes

For Kubernetes deployment, create:
- Deployments for each service
- Services for networking
- Ingress for external access

## Scaling

### Horizontal Scaling

```bash
# Scale backend to 2 instances
docker compose up -d --scale llm-balancer=2
```

### Load Balancer

Place a reverse proxy (nginx, traefik) in front of multiple balancer instances.

## Monitoring

### View Logs

```bash
# All logs
docker compose logs -f

# Specific service
docker compose logs -f llm-balancer
```

### Resource Usage

```bash
# Container stats
docker stats

# Specific container
docker stats llm-balancer-backend
```

## Backup and Recovery

### Backup Configuration

```bash
# Backup .env file
cp .env .env.backup
```

### Recovery

```bash
# Stop services
docker compose down

# Restore configuration
cp .env.backup .env

# Restart
docker compose up -d
```

## Security Considerations

- Use HTTPS in production
- Restrict access via firewall
- Use strong passwords for any authentication
- Keep Docker images updated

## Related Documentation

- [Installation](../../user/INSTALLATION.md) - Installation options
- [Usage Guide](../../user/USAGE.md) - Usage examples
- [Troubleshooting](../../user/TROUBLESHOOTING.md) - Common issues
