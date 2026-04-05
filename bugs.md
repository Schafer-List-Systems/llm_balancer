# Bug Report: maxInputTokens Configuration Ignored

## Bug Description
The `maxInputTokens` configuration setting per backend is completely ignored. Requests exceeding the configured token limit are still being forwarded to the backend.

## Expected Behavior
When a backend has `maxInputTokens: 20000` configured, any request with prompt tokens exceeding 20,000 should be rejected before being forwarded to that backend.

## Actual Behavior
Requests with prompt tokens up to ~90,428 (4.5x the configured limit) are being successfully forwarded to and processed by the backend.

## Configuration Values
Backend: AIbox (`http://192.168.12.187:1234`)
```json
{
  "url": "http://192.168.12.187:1234",
  "name": "aibox",
  "priority": 20,
  "maxConcurrency": 1,
  "maxInputTokens": 20000
}
```

## Actual Statistics
- Average prompt tokens: 90,428
- Average non-cached prompt tokens: 37,121
- This is 4.5x the configured `maxInputTokens` limit of 20,000

## Steps to Reproduce
1. Configure a backend with `maxInputTokens: 20000`
2. Send a request with prompt tokens exceeding 20,000
3. Observe that the request is forwarded to the backend instead of being rejected

## Impact
- Configuration setting is useless
- Can cause model failures or errors on backends that have strict token limits
- Undermines configuration-driven constraints

## Root Cause (TBD)
The `maxInputTokens` field is stored in the configuration and backend info, but there is no validation logic in the request processing pipeline to check this limit before forwarding requests.

## Related Code Paths
- `llm-balancer/config.js` - Configuration loading (stores maxInputTokens)
- `llm-balancer/backends/Backend.js` - Backend class (has maxInputTokens property)
- `llm-balancer/request-processor.js` - Request forwarding (missing validation)
- `llm-balancer/backend-selector.js` - Backend selection (missing validation)
