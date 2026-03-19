# Performance Metrics and Token Counting

This document describes the performance metrics tracking, token counting behavior, and statistics available in the LLM Balancer.

---

## Overview

The LLM Balancer tracks comprehensive performance metrics for each backend, including:

- **Time Metrics**: Total time, prompt processing time, generation time, network latency
- **Token Metrics**: Prompt tokens, completion tokens, non-cached prompt tokens
- **Rate Metrics**: Tokens per second for total, prompt, and generation
- **Cache Statistics**: Prompt cache hits, misses, and evictions

---

## Token Counting Behavior

### Streaming vs Non-Streaming

The behavior for tracking completion tokens differs significantly between streaming and non-streaming modes:

| Metric | Streaming | Non-Streaming |
|--------|-----------|---------------|
| **Completion Tokens** | Counted from response chunks OR backend usage | Only from backend usage |
| **Generation Time** | Measured accurately | Cannot measure (backend is black box) |
| **Prompt Processing Time** | Measured (time to first chunk) | Cannot measure |
| **Network Latency** | Measured (time to first header / 2) | Not reliable |

### Streaming Token Counting

For streaming requests, the balancer uses a **three-tier fallback** to ensure completion tokens are always counted:

#### Tier 1: Backend Usage Object (Most Accurate)
If the backend includes `usage` in the streaming response (some OpenAI-compatible APIs):
```json
{
  "usage": {
    "completion_tokens": 150,
    "prompt_tokens": 50,
    "prompt_tokens_details": {
      "cached_tokens": 10
    }
  }
}
```

**Zero-Fallback Fix**: If the backend reports `completion_tokens: 0` but chunks were received, fall back to chunk counting (backends sometimes report incorrectly).

#### Tier 2: Chunk-Based Token Counting (Generalized)
For any SSE format, extract text from **all delta fields**:
```javascript
// Generalized extraction from any SSE format
const delta = msg.choices?.[0]?.delta || msg.delta || null;
for (const key in delta) {
  // Skip metadata fields (role, type), count all text fields
  if (!['role', 'type'].includes(key) && typeof delta[key] === 'string') {
    content += delta[key];
  }
}
```

This handles:
- **OpenAI format**: `choices[0].delta.content`
- **Anthropic/Gemini format**: `delta.thinking`, `delta.content`
- **Custom formats**: Any `delta.*` fields containing text

#### Tier 3: Chunk Count (Fallback)
If no token counting succeeds, fall back to SSE chunk count (each chunk ≈ 1 token).

### Non-Streaming Token Counting

For non-streaming requests, the backend is a **black box**:
- **Completion Tokens**: Only from backend's `usage.completion_tokens`
- **Generation Time**: Cannot measure (backend internals unknown)
- **Null Handling**: `avgGenerationTimeMs` and `avgPromptProcessingTimeMs` are `null`

**Example Non-Streaming Response:**
```json
{
  "timeStats": {
    "avgTotalTimeMs": 28363.4,
    "avgNetworkLatencyMs": 567.4,
    "avgPromptProcessingTimeMs": null,  // Cannot measure
    "avgGenerationTimeMs": null         // Cannot measure
  },
  "tokenStats": {
    "avgPromptTokens": 121275.6,
    "avgCompletionTokens": 157.2,       // Only if backend provides usage
    "avgNonCachedPromptTokens": 121275.6
  }
}
```

---

## Time Metrics

### Streaming Time Metrics

| Metric | Definition | How Measured |
|--------|------------|--------------|
| `avgTotalTimeMs` | Full round-trip time | `fullResponseTime - requestSentTime` |
| `avgPromptProcessingTimeMs` | Time to first token | `firstChunkTimeMs - requestSentTime` |
| `avgGenerationTimeMs` | Time to generate ALL tokens | Corrected from observed: `observed × n/(n-1)` |
| `avgNetworkLatencyMs` | Network RTT | `timeToFirstHeader / 2` |

**Generation Time Correction:**
The observed generation time measures tokens #2 through #n (n-1 tokens). To get the time for ALL n tokens:
```javascript
completeGenerationTime = observedGeneration × completionTokens / (completionTokens - 1)
```

### Non-Streaming Time Metrics

Only `avgTotalTimeMs` is measurable. Other timing metrics are `null` because the backend buffers the response internally.

---

## Token Statistics

### Token Fields

| Field | Description | Streaming | Non-Streaming |
|-------|-------------|-----------|---------------|
| `avgPromptTokens` | Input tokens | ✅ From usage OR request counting | ✅ From backend usage |
| `avgNonCachedPromptTokens` | Non-cached prompt tokens | ✅ `prompt - cached` | ✅ `prompt - cached` |
| `avgCompletionTokens` | Output tokens | ✅ From chunks OR usage | ✅ From backend usage only |
| `avgTotalTokens` | Total tokens | ✅ `prompt + completion` | ✅ `prompt + completion` |

### Non-Cached Prompt Tokens

```javascript
nonCachedPromptTokens = max(0, totalPromptTokens - cachedTokens)
```

This tracks actual cost when KV cache is reused.

---

## Rate Metrics

Rate metrics are computed from time and token data:

| Metric | Formula |
|--------|---------|
| `totalRate` | `totalTokens / totalTime` |
| `promptRate` | `promptTokens / promptProcessingTime` |
| `nonCachedPromptRate` | `nonCachedPromptTokens / promptProcessingTime` |
| `generationRate` | `completionTokens / generationTime` |

**Example:**
```json
{
  "rateStats": {
    "totalRate": {
      "count": 5,
      "avgTokensPerSecond": 4327.4
    },
    "promptRate": {
      "count": 5,
      "avgTokensPerSecond": 4700.3
    },
    "generationRate": {
      "count": 5,
      "avgTokensPerSecond": 71.1
    }
  }
}
```

---

## Statistics Endpoints

| Endpoint | Description | Requires |
|----------|-------------|----------|
| `/stats` | Complete system statistics | None |
| `/backends` | Backend health and utilization | None |
| `/debug/stats` | Performance + cache stats | Debug mode (`debug: true`) |

### Example Response Structure

```json
{
  "balancer": {
    "totalBackends": 3,
    "healthyBackends": 3,
    "backends": [
      {
        "url": "http://backend:11434",
        "requestCount": 4,
        "performanceStats": {
          "requestCount": 4,
          "timeStats": {
            "avgTotalTimeMs": 18630.25,
            "avgNetworkLatencyMs": 141.375,
            "avgPromptProcessingTimeMs": 11570.25,
            "avgGenerationTimeMs": 7090.27
          },
          "tokenStats": {
            "avgPromptTokens": 88745,
            "avgNonCachedPromptTokens": 88745,
            "avgCompletionTokens": 185.25,
            "avgTotalTokens": 88930.25
          },
          "rateStats": {
            "totalRate": {
              "count": 4,
              "avgTokensPerSecond": 4523.1
            },
            "generationRate": {
              "count": 4,
              "avgTokensPerSecond": 25.4
            }
          }
        },
        "promptCacheStats": {
          "hits": 0,
          "misses": 4,
          "evictions": 0,
          "similarityMatches": 0,
          "idMatches": 0,
          "size": 1,
          "maxSize": 5
        }
      }
    ]
  }
}
```

---

## Debug Logging

When debug mode is enabled, streaming token counting produces detailed logs:

```
[Gateway][req-0001] Chunk 10, so far 12 completion tokens counted
[Gateway][req-0001] Chunk 20, so far 34 completion tokens counted
[Gateway][req-0001] Usage found in stream: prompt=114176, completion=null, cached=0
[Gateway][req-0001] Final completionTokens: 77 (from backend=null, chunkCount=77)
[Gateway][req-0001] Streaming stats updated: 114176 prompt tokens, 77 completion tokens, nonCached=114176
```

---

## Related Documentation

- [System Architecture](docs/developer/ARCHITECTURE.md) - High-level architecture
- [Data Flow](docs/developer/DATA_FLOW.md) - Request processing details
- [Prompt Cache](docs/components/balancer/PROMPT_CACHE.md) - KV cache behavior
- [API Endpoints](docs/api/ENDPOINTS.md) - All API routes
