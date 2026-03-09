# BackendInfo - API Detection and Model Discovery

## Overview

`BackendInfo` is a comprehensive backend information collector that discovers API types, model lists, and endpoints for each backend. It uses a probe-based detection algorithm to automatically identify which APIs a backend supports.

## Purpose

The `BackendInfo` class is designed to:

1. **Detect supported APIs**: Automatically discover which API types (OpenAI, Anthropic, Google, Ollama, etc.) a backend supports
2. **List available models**: Extract model names from each supported API
3. **Identify endpoints**: Track model list and chat endpoints for each API type
4. **Future extensions**: Store performance metrics (prompt processing speed, token generation speed, network bandwidth)

## Class Structure

### Data Structure

```javascript
{
  url: "http://10.0.0.2:4000",
  healthy: true,
  apis: {
    openai: {
      supported: true,
      modelListEndpoint: "/v1/models",
      chatEndpoint: "/v1/chat/completions",
      models: ["qwen/qwen3.5-35b-a3b", "qwen3.5-35b-a3b"]
    },
    anthropic: {
      supported: true,
      modelListEndpoint: null,
      chatEndpoint: "/v1/messages",
      models: []
    }
  },
  models: {
    openai: ["qwen/qwen3.5-35b-a3b", "qwen3.5-35b-a3b"],
    anthropic: []
  },
  endpoints: {
    openai: "/v1/models",
    anthropic: "/v1/messages"
  },
  detectedAt: "2026-03-09T...",
  // Future fields:
  // latency: null,
  // bandwidth: null,
  // promptSpeed: null,
  // generationSpeed: null
}
```

## Probe-Based Detection Algorithm

### How It Works

The detection algorithm uses a `probes` array that defines how to test each API:

```javascript
this.probes = [
  // Model list probes (GET requests that return model arrays)
  {
    apiType: 'openai',
    endpoint: '/v1/models',
    method: 'GET',
    jsonPath: 'data',
    hasModels: true
  },
  {
    apiType: 'google',
    endpoint: '/v1beta/models',
    method: 'GET',
    jsonPath: 'models',
    hasModels: true
  },
  {
    apiType: 'ollama',
    endpoint: '/api/tags',
    method: 'GET',
    jsonPath: 'models',
    hasModels: true
  },
  {
    apiType: 'groq',
    endpoint: '/openai/v1/models',
    method: 'GET',
    jsonPath: 'data',
    hasModels: true
  },

  // Chat/message probes (POST requests, no model list)
  {
    apiType: 'anthropic',
    endpoint: '/v1/messages',
    method: 'POST',
    jsonPath: null,
    hasModels: false
  },
  {
    apiType: 'openai',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    jsonPath: null,
    hasModels: false
  }
];
```

### Probe Configuration

| Field | Description | Example Values |
|-------|-------------|----------------|
| `apiType` | API type identifier | `'openai'`, `'anthropic'`, `'google'`, `'ollama'`, `'groq'` |
| `endpoint` | API endpoint path | `'/v1/models'`, `'/api/tags'` |
| `method` | HTTP method | `'GET'`, `'POST'` |
| `jsonPath` | JSON path for model extraction | `'data'`, `'models'`, `null` |
| `hasModels` | Whether probe returns model list | `true`, `false` |

### Detection Logic

| HTTP Status | Meaning | API Supported? |
|-------------|---------|----------------|
| 2xx | Endpoint exists and works | Yes |
| 400 | Endpoint exists but params wrong | Yes (validation error) |
| 404 | Endpoint doesn't exist | No |

## Key Methods

### `getInfo(url)`

Collect comprehensive information about a single backend.

```javascript
const info = await backendInfo.getInfo('http://10.0.0.2:4000');
```

**Returns**: `Promise<Object>` - Backend information object

### `getInfoAll(urls)`

Collect information about multiple backends in parallel.

```javascript
const infoMap = await backendInfo.getInfoAll([
  'http://10.0.0.2:4000',
  'http://10.0.0.2:8000',
  'http://10.0.0.3:1234'
]);
```

**Parameters**:
- `urls` (Array<string>): Array of backend URLs

**Returns**: `Promise<Object>` - Map of URL to backend information

### `probe(url, probeConfig)`

Execute HTTP request for a single probe.

**Parameters**:
- `url` (string): Backend URL
- `probeConfig` (Object): Probe configuration

**Returns**: `Promise<Object>` - Probe result with success status and data

### `extractModels(body, jsonPath)`

Extract model names from response body using JSON path.

**Parameters**:
- `body` (Object): Parsed JSON response body
- `jsonPath` (string): JSON path key (e.g., `'data'`, `'models'`)

**Returns**: `string[]` - Array of model names

**Example**:
```javascript
const body = { data: [{ id: 'gpt-3.5-turbo' }, { id: 'gpt-4' }] };
const models = detector.extractModels(body, 'data');
// Returns: ['gpt-3.5-turbo', 'gpt-4']
```

### `getChatEndpoint(apiType)`

Get chat endpoint for a given API type.

**Parameters**:
- `apiType` (string): API type identifier

**Returns**: `string` - Chat endpoint path

**Example**:
```javascript
detector.getChatEndpoint('openai');   // '/v1/chat/completions'
detector.getChatEndpoint('anthropic'); // '/v1/messages'
detector.getChatEndpoint('google');    // '/v1beta/models/{model}:generateContent'
detector.getChatEndpoint('ollama');    // '/api/generate'
```

## Supported APIs

| API Type | Model List Endpoint | Chat Endpoint | JSON Path |
|----------|--------------------|---------------|-----------|
| OpenAI | `/v1/models` | `/v1/chat/completions` | `data[].id` |
| Anthropic | N/A | `/v1/messages` | N/A |
| Google Gemini | `/v1beta/models` | `/v1beta/models/{model}:generateContent` | `models[].name` |
| Ollama | `/api/tags` | `/api/generate` | `models[].name` |
| Groq | `/openai/v1/models` | `/openai/v1/chat/completions` | `data[].id` |

## Usage Example

```javascript
const BackendInfo = require('./capability-detector');

const backendInfo = new BackendInfo(5000); // 5 second timeout

// Get info for a single backend
const info = await backendInfo.getInfo('http://10.0.0.2:4000');
console.log(info);

// Get info for multiple backends
const urls = [
  'http://10.0.0.2:4000',
  'http://10.0.0.2:8000',
  'http://10.0.0.3:1234'
];
const allInfo = await backendInfo.getInfoAll(urls);

// Access backend information
for (const [url, info] of Object.entries(allInfo)) {
  console.log(`Backend: ${url}`);
  console.log(`  Healthy: ${info.healthy}`);
  console.log(`  APIs: ${Object.keys(info.apis).join(', ')}`);
  console.log(`  Models:`, info.models);
}
```

## Backward Compatibility

The new structure maintains backward compatibility with existing code:

| Old Format | New Format |
|------------|------------|
| `info.apiTypes` | `Object.keys(info.apis).filter(k => info.apis[k].supported)` |
| `info.models` | `info.models` (organized by API type) |
| `info.endpoints` | `info.endpoints` |

## Future Extensions

The class is designed to be extended with performance metrics:

```javascript
{
  url: "http://10.0.0.2:4000",
  healthy: true,
  apis: { ... },
  models: { ... },
  endpoints: { ... },
  detectedAt: "2026-03-09T...",
  // Future fields:
  latency: 45,              // Network latency in ms
  bandwidth: 12500000,      // Network bandwidth in bytes/sec
  promptSpeed: 120,         // Tokens/second for prompt processing
  generationSpeed: 85       // Tokens/second for response generation
}
```

## Testing

All tests pass (15 tests):

```bash
npm test -- capability-detector.test.js
```

**Test coverage**:
- `extractModels`: 6 tests
- `getChatEndpoint`: 5 tests
- `probes`: 4 tests

## Migration Guide

### From `CapabilityDetector` to `BackendInfo`

1. **Import change**:
   ```javascript
   // Old
   const CapabilityDetector = require('./capability-detector');
   const detector = new CapabilityDetector(timeout);

   // New
   const BackendInfo = require('./capability-detector');
   const backendInfo = new BackendInfo(timeout);
   ```

2. **Method name change**:
   ```javascript
   // Old
   const capabilities = await detector.detect(url);

   // New
   const info = await backendInfo.getInfo(url);
   ```

3. **Data structure change**:
   ```javascript
   // Old
   {
     apiTypes: ['openai', 'anthropic'],
     models: ['model1', 'model2'],
     endpoints: { openai: '/v1/models' }
   }

   // New
   {
     healthy: true,
     apis: {
       openai: { supported: true, models: ['model1'] },
       anthropic: { supported: true, models: [] }
     },
     models: { openai: ['model1'] },
     endpoints: { openai: '/v1/models' }
   }
   ```
