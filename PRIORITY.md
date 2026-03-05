# Priority-Based Backend Selection

## Overview

The load balancer now supports priority-based backend selection, allowing you to configure explicit priority levels for different backends. Higher priority backends are selected first, with immediate fallback to lower priority tiers when higher priority backends are unavailable or busy.

## Configuration

### Environment Variables

Set backend priorities using environment variables in your `.env` file:

#### Method 1: Index-based priority
```bash
# Backend 0 - Priority 1 (highest)
BACKEND_0=http://host1:11434
BACKEND_0_PRIORITY=1

# Backend 1 - Priority 1 (same as backend 0)
BACKEND_1=http://host2:11434
BACKEND_1_PRIORITY=1

# Backend 2 - Priority 2 (medium)
BACKEND_2=http://host3:11434
BACKEND_2_PRIORITY=2

# Backend 3 - Priority 0 (lowest)
BACKEND_3=http://host4:11434
BACKEND_3_PRIORITY=0
```

#### Method 2: URL-based priority
```bash
BACKEND_PRIORITY=http://host1:11434=1
BACKEND_PRIORITY=http://host2:11434=1
BACKEND_PRIORITY=http://host3:11434=2
BACKEND_PRIORITY=http://host4:11434=0
```

#### Combined (priority from index, override with URL)
```bash
BACKEND_0=http://host1:11434
BACKEND_0_PRIORITY=1

BACKEND_1=http://host2:11434
BACKEND_1_PRIORITY=1

# This will use priority 0 instead of 1 from BACKEND_1_PRIORITY
BACKEND_PRIORITY=http://host2:11434=0
```

### Priority Levels

- **Higher numbers = higher priority** (e.g., priority 100 > priority 50 > priority 0 > priority -1)
- **Default priority**: 1 if not specified
- **Priority tiers**: Backends are grouped by their priority level
- **Immediate fallback**: If no backend is available in the current priority tier, the system immediately falls back to the next lower priority tier
- **Any integer value**: Priority can be any positive or negative integer

## Selection Algorithm

The selection algorithm works as follows:

1. **Group backends by priority level** (only healthy backends are considered)
2. **Sort priority tiers** from highest to lowest
3. **For each priority tier**:
   - **Try to find an idle backend first**
   - **If no idle backend, use FIFO queueing** to handle waiting requests
   - **If no backend is available in this tier, immediately move to the next lower priority tier**
4. **Return the selected backend** (marked as busy)

### Selection Priority Order

1. **Idle, healthy backend** in the highest priority tier
2. **FIFO queueing** for waiting requests in the highest priority tier
3. **Immediate fallback** to the next lower priority tier if no backend is available
4. **Repeat** until an available backend is found or all tiers are exhausted

## Examples

### Example 1: Critical and Backup Backends

```bash
# Critical backend (highest priority)
BACKEND_0=http://critical-host:11434
BACKEND_0_PRIORITY=100

# Secondary backend (medium priority)
BACKEND_1=http://secondary-host:11434
BACKEND_1_PRIORITY=50

# Backup backend (lowest priority)
BACKEND_2=http://backup-host:11434
BACKEND_2_PRIORITY=0
```

**Selection behavior:**
- Request 1: `http://critical-host:11434` (priority 10, idle)
- Request 2: `http://critical-host:11434` (priority 10, idle)
- Request 3: `http://critical-host:11434` (priority 10, idle)
- Request 4: `http://critical-host:11434` (priority 10, busy) → **immediate fallback**
- Request 5: `http://secondary-host:11434` (priority 5, idle)
- Request 6: `http://secondary-host:11434` (priority 5, idle)
- Request 7: `http://secondary-host:11434` (priority 5, busy) → **immediate fallback**
- Request 8: `http://backup-host:11434` (priority 0, idle)

### Example 2: Multiple Backends in Same Tier

```bash
# Both have priority 1
BACKEND_0=http://host1:11434
BACKEND_0_PRIORITY=1

BACKEND_1=http://host2:11434
BACKEND_1_PRIORITY=1

BACKEND_2=http://host3:11434
BACKEND_2_PRIORITY=2
```

**Selection behavior:**
- Request 1: `http://host1:11434` (priority 1, idle)
- Request 2: `http://host2:11434` (priority 1, idle)
- Request 3: `http://host1:11434` (priority 1, busy) → **immediate fallback to same tier**
- Request 4: `http://host2:11434` (priority 1, busy) → **immediate fallback to priority 2**
- Request 5: `http://host3:11434` (priority 2, idle)

## API Responses

The API endpoints include priority information in their responses:

### GET /health

```json
{
  "status": "ok",
  "backends": [
    {
      "url": "http://host1:11434",
      "priority": 1,
      "healthy": true,
      "busy": false,
      "requestCount": 5,
      "errorCount": 0
    }
  ]
}
```

### GET /stats

```json
{
  "backendDetails": [
    {
      "url": "http://host1:11434",
      "priority": 1,
      "healthy": true,
      "busy": false,
      "requestCount": 5,
      "errorCount": 0
    }
  ]
}
```

### GET /backends

```json
{
  "backends": [
    {
      "url": "http://host1:11434",
      "priority": 1,
      "healthy": true,
      "busy": false,
      "requestCount": 5,
      "errorCount": 0
    }
  ]
}
```

## Monitoring and Debugging

### Check Backend Priorities

Use the `/backends` endpoint to view all backends and their priorities:

```bash
curl http://localhost:3001/backends
```

### Monitor Selection Behavior

Use the `/backend/current` endpoint to see which backend would be selected next:

```bash
curl http://localhost:3001/backend/current
```

### View Statistics

Use the `/stats` endpoint for detailed statistics including priority information:

```bash
curl http://localhost:3001/stats
```

## Testing Priority-Based Selection

1. **Configure multiple backends** with different priorities in your `.env` file
2. **Start the load balancer**
3. **Send test requests** to verify selection behavior
4. **Monitor busy states** using `/health` or `/stats` endpoints
5. **Verify that higher priority backends are used first**
6. **Confirm immediate fallback** to lower priority when higher priority backends are unavailable

## Benefits

- **Controlled traffic distribution**: Explicit priority levels give you control over backend selection
- **Failover automation**: Automatic fallback to lower priority tiers when higher priority backends are unavailable
- **Cost optimization**: Lower priority backends can be more cost-effective, reducing expenses
- **Performance optimization**: Critical services can have higher priority for better performance
- **Flexibility**: Multiple configurations supported through environment variables

## Limitations

- Priority is only applied when selecting a backend for new requests
- Backends that are unhealthy are excluded from priority selection
- Priority changes require restarting the load balancer
- The system does not automatically change backend priorities based on performance metrics