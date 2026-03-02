# Backend-Specific Debug Endpoints

## Overview

The backend-specific debug endpoints allow you to filter debug request history by specific backend ID. This is useful for monitoring request distribution, debugging backend-specific issues, and comparing performance between different backends.

## Endpoint: Backend-Specific Debug Requests

### URL Pattern
```
GET /debug/requests/backend/:backendId?limit=10
```

### Parameters

#### URL Parameter
- **backendId** (required): The unique identifier of the backend you want to filter by.
  - Format: string (e.g., "backend1", "backend2", "backend3")
  - Matches the backend ID configured in your `.env` file

#### Query Parameter
- **limit** (optional): Maximum number of requests to return.
  - Type: integer
  - Default: 10
  - Maximum: 100 (recommended to avoid large responses)

### Usage Examples

#### cURL
```bash
# Get last 5 requests for backend1
curl http://localhost:3001/debug/requests/backend/backend1?limit=5

# Get all requests for backend2 (default limit 10)
curl http://localhost:3001/debug/requests/backend/backend2

# Get last 20 requests for backend3
curl http://localhost:3001/debug/requests/backend/backend3?limit=20
```

#### JavaScript (fetch)
```javascript
// Get recent requests for a specific backend
async function getBackendRequests(backendId, limit = 10) {
  const response = await fetch(
    `http://localhost:3001/debug/requests/backend/${backendId}?limit=${limit}`
  );
  const data = await response.json();
  return data;
}

// Usage
getBackendRequests('backend1', 5).then(data => {
  console.log(`Found ${data.count} requests for backend1`);
  data.requests.forEach(req => {
    console.log(`Request ${req.id} at ${new Date(req.timestamp)}`);
  });
});
```

#### Node.js (http)
```javascript
const http = require('http');

function getBackendRequests(backendId, limit = 10) {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/debug/requests/backend/${backendId}?limit=${limit}`,
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Usage
getBackendRequests('backend2', 5)
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
```

### Response Format

The response includes the backend ID, count of filtered requests, limit used, and an array of request objects:

```json
{
  "backendId": "backend1",
  "count": 3,
  "limit": 5,
  "requests": [
    {
      "id": 201,
      "timestamp": 1772433937123,
      "route": "/v1/messages",
      "method": "POST",
      "priority": 10,
      "backendId": "backend1",
      "backendUrl": "http://localhost:11435",
      "requestContent": "{\"model\":\"llama2\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `backendId` | string | The backend ID used for filtering |
| `count` | integer | Number of requests found for this backend |
| `limit` | integer | The limit parameter used in the request |
| `requests` | array | Array of request objects matching the filter |

### Use Cases

1. **Monitor Request Distribution**: See how many requests are being sent to each backend
2. **Debug Backend-Specific Issues**: Isolate issues to a particular backend
3. **Performance Comparison**: Compare response times and success rates across backends
4. **Traffic Analysis**: Analyze which backends handle most of the load

### Error Handling

If no requests are found for the specified backend:

```json
{
  "backendId": "nonexistent-backend",
  "count": 0,
  "limit": 10,
  "requests": []
}
```

If the backend ID is not provided:

```json
{
  "error": "Backend ID is required"
}
```

### Notes

- Requires debug mode to be enabled (set `DEBUG=true` in your `.env` file)
- Request history size is configured via `DEBUG_REQUEST_HISTORY_SIZE` environment variable
- Requests are tracked for all non-streaming API requests
- Streaming responses are not currently tracked
- The response format follows the same structure as the general `/debug/requests` endpoint