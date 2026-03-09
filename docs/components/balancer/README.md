# Balancer Component

The core load balancer component that distributes requests across multiple Ollama backend servers.

## Overview

The balancer provides:
- Priority-based load balancing
- Health checking and automatic failover
- Concurrency-based load limiting
- Request queuing
- Multi-API support detection

## Features

- **FIFO Queueing**: Requests are queued when all backends are busy
- **Priority Selection**: Higher priority backends are selected first
- **Concurrency Limiting**: Configurable max parallel requests per backend
- **Health Monitoring**: Automatic detection of unhealthy backends
- **Multi-API Support**: Auto-detects OpenAI, Anthropic, Google, and Ollama APIs

## Documentation

- [Configuration](CONFIGURATION.md) - Balancer-specific configuration
- [API](API.md) - Balancer API details
- [Usage](../../user/USAGE.md) - How to use the balancer

## Quick Start

```bash
cd llm-balancer
npm install
npm start
```

## Architecture

See [System Architecture](../../../docs/developer/ARCHITECTURE.md) for detailed architecture.
