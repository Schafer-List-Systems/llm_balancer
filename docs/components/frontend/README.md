# Frontend Component

A responsive dashboard for monitoring and managing the LLM Balancer.

## Overview

The frontend provides:
- Real-time monitoring of all backends
- Health status overview
- Per-backend detailed information
- Statistics dashboard
- Automatic data refresh

## Features

- **Real-Time Monitoring**: Automatic updates every 5 seconds
- **Backend Overview**: Total, healthy, unhealthy, busy, available counts
- **Individual Backend Status**: Detailed view of each backend
- **Statistics Dashboard**: System-wide metrics
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Manual Refresh**: Option to manually refresh data

## Documentation

- [Configuration](CONFIGURATION.md) - Frontend configuration
- [Customization](CUSTOMIZATION.md) - How to customize the dashboard

## Quick Start

```bash
cd frontend
npm install
cp .env.example .env
npm run dev:build
npm start
```

Dashboard available at http://localhost:3080

## Architecture

See [System Architecture](../../../docs/developer/ARCHITECTURE.md) for details.
