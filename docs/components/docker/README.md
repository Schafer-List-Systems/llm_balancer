# Docker Component

Docker and Docker Compose configuration for deploying the LLM Balancer.

## Overview

Docker provides:
- Isolated environments
- Easy deployment
- Consistent development setup
- Simplified dependency management

## Services

### llm-balancer (Backend)

- **Port**: 3001
- **Container**: `llm-balancer-backend`
- **Function**: Load balancer and health checking

### llm-balancer-frontend (Frontend)

- **Port**: 3080
- **Container**: `llm-balancer-frontend`
- **Function**: Monitoring dashboard

## Documentation

- [Deployment](DEPLOYMENT.md#production-deployment) - Production deployment guide

## Quick Start

```bash
# Build and start
docker compose up --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Related Documentation

- [Installation](../../user/INSTALLATION.md#getting-started) - Installation options
- [Usage Guide](../../user/USAGE.md#configuration) - Usage examples
