# Priority-Based Load Balancer

## Overview

The load balancer has been enhanced with priority-based selection to distribute requests among multiple backends according to their priority levels.

## Key Features

1. **Priority-Based Selection**: Backends are grouped by priority level (higher priority = more requests)

2. **Round-Robin within Priority Tier**: When multiple backends share the same priority, they are selected using round-robin to ensure fair distribution

3. **Immediate Fallback**: If all backends in a priority tier are busy, the load balancer immediately falls back to the next lower priority tier

4. **Busy State Tracking**: Backends can be marked as busy, and the load balancer will skip them when selecting backends

## Backend Priority Levels

- **Priority 10**: High-priority backends (e.g., dedicated GPU instances)
- **Priority 5**: Medium-priority backends (e.g., shared GPU instances)
- **Priority 0**: Low-priority backends (e.g., CPU-only instances)

## Implementation Details

### Balancer Class

The `Balancer` class in `llm-balancer/balancer.js` implements the priority-based selection logic:

```javascript
getNextBackend()
```

**Selection Logic:**

1. Group all healthy backends by priority level
2. Sort priority tiers from highest to lowest
3. For each priority tier:
   - Use round-robin (via `currentIndex`) to select idle backends
   - If a backend is busy, skip to the next one
   - If all backends in the tier are busy, fall back to the next tier
4. Return the selected backend or null if no healthy backends are available

**Key Methods:**

- `getNextBackend()`: Selects the next backend based on priority
- `markFailed(backendUrl)`: Marks a backend as unhealthy
- `markHealthy(backendUrl)`: Marks a backend as healthy
- `hasAvailableBackends()`: Checks if any healthy backends exist
- `getStats()`: Returns statistics about backend health and request distribution

## Usage Example

```javascript
const Balancer = require('./llm-balancer/balancer');

const backends = [
  { url: 'http://high-priority:11434', priority: 10, healthy: true, busy: false, requestCount: 0, errorCount: 0, models: [] },
  { url: 'http://medium-priority:11434', priority: 5, healthy: true, busy: false, requestCount: 0, errorCount: 0, models: [] },
];

const balancer = new Balancer(backends);

// Select backend
const backend = balancer.getNextBackend();

// Use the backend
const response = await backend.chat({ model: 'llama3', messages: [...] });

// Mark as failed if needed
if (error) {
  balancer.markFailed(backend.url);
}
```

## Testing

The load balancer has been tested with various scenarios:

1. **Basic Priority Distribution**: Verifies that higher priority backends receive more requests
2. **Priority Fallback with Busy Backend**: Confirms that requests fall back to lower priority tiers when higher priority backends are busy
3. **Round-Robin within Priority Tier**: Ensures fair distribution among backends with the same priority
4. **Priority Fallback Across Tiers**: Tests that requests gracefully fall back through priority tiers

## Benefits

- **Resource Optimization**: Allocates requests to the most capable backends first
- **Fair Distribution**: Ensures even distribution among backends with the same priority
- **Resilience**: Gracefully handles busy or unhealthy backends by falling back to alternatives
- **Monitoring**: Provides statistics for tracking request distribution and backend health