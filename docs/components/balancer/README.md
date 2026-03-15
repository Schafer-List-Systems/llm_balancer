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
- **Model Validation**: Requests for unsupported models are rejected immediately (queue depth stays at 0)

## Documentation

- [Configuration](CONFIGURATION.md#configuration) - Balancer-specific configuration
- [API](API.md#api-reference) - Balancer API details
- [Queue Processing](QUEUE_PROCESSING.md#queue-processing) - Queue processing flow and behavior
- [Usage](../../user/USAGE.md#configuration) - How to use the balancer

## Quick Start

```bash
cd llm-balancer
npm install
npm start
```

## Architecture

See [System Architecture](../../../docs/developer/ARCHITECTURE.md#system-architecture) for detailed architecture.
