# Integration Guide

This guide covers integrating applications with the LLM Balancer API.

---

## Overview

The LLM Balancer provides a unified API endpoint that routes requests to multiple backend Ollama servers. This makes it easy to integrate with any application that supports Ollama, Anthropic, or OpenAI-compatible APIs.

---

## Basic Integration

### Using cURL

```bash
# Make a request through the balancer
curl -X POST http://localhost:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

### Using Python Requests

```python
import requests

response = requests.post(
    "http://localhost:3001/v1/messages",
    json={
        "model": "llama2",
        "max_tokens": 1024,
        "messages": [
            {"role": "user", "content": "Hello, world!"}
        ]
    }
)

print(response.json())
```

### Using Node.js Fetch

```javascript
const response = await fetch('http://localhost:3001/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama2',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Hello, world!' }
    ]
  })
});

const data = await response.json();
console.log(data);
```

---

## Using the Ollama Python Client

```python
from ollama import chat

# Point to the balancer instead of direct backend
response = chat(
    model='llama2',
    messages=[
        {'role': 'user', 'content': 'Hello, world!'}
    ],
    host='http://localhost:3001'  # Use balancer URL
)

print(response['message']['content'])
```

---

## Using the Anthropic Client

```python
from anthropic import Anthropic

# Configure to use the balancer
client = Anthropic(
    base_url='http://localhost:3001',
    api_key='not-required'  # No auth required
)

message = client.messages.create(
    model="llama2",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ]
)

print(message.content[0].text)
```

---

## Using the OpenAI Client

```python
from openai import OpenAI

# Configure to use the balancer
client = OpenAI(
    base_url='http://localhost:3001',
    api_key='not-required'
)

response = client.chat.completions.create(
    model="llama2",
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ]
)

print(response.choices[0].message.content)
```

---

## Streaming Support

### Streaming with Python Requests

```python
import requests

response = requests.post(
    "http://localhost:3001/api/chat",
    json={
        "model": "llama2",
        "messages": [
            {"role": "user", "content": "Hello!"}
        ],
        "stream": True
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))
```

### Streaming with Node.js

```javascript
const response = await fetch('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama2',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```

---

## Error Handling

### Handling 503 Service Unavailable

```python
import requests
from requests.exceptions import RequestException

try:
    response = requests.post(
        "http://localhost:3001/v1/messages",
        json={
            "model": "llama2",
            "messages": [{"role": "user", "content": "Hello"}]
        },
        timeout=30
    )
    response.raise_for_status()
    print(response.json())

except requests.exceptions.HTTPError as e:
    if e.response.status_code == 503:
        print("Service unavailable - all backends may be busy")
    elif e.response.status_code == 502:
        print("Backend error - some backends may be unhealthy")
    else:
        print(f"HTTP error: {e}")

except RequestException as e:
    print(f"Request failed: {e}")
```

### Handling Errors in Node.js

```javascript
try {
  const response = await fetch('http://localhost:3001/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama2',
      messages: [{ role: 'user', content: 'Hello' }]
    }),
    timeout: 30000
  });

  if (!response.ok) {
    if (response.status === 503) {
      console.log('Service unavailable - all backends may be busy');
    } else if (response.status === 502) {
      console.log('Backend error - some backends may be unhealthy');
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  console.log(data);

} catch (error) {
  console.error('Request failed:', error.message);
}
```

---

## Health Check Integration

### Checking Health Before Making Requests

```python
import requests

def check_health(url='http://localhost:3001/health'):
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except RequestException:
        return None

health = check_health()
if health and health.get('healthyBackends', 0) > 0:
    print(f"Healthy backends: {health['healthyBackends']}")
    # Proceed with request
else:
    print("No healthy backends available")
```

### Monitoring Backend Utilization

```python
def get_backend_stats(url='http://localhost:3001/backends'):
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except RequestException:
        return None

stats = get_backend_stats()
for backend in stats.get('backends', []):
    print(f"{backend['url']}: {backend['utilizationPercent']}% utilized")
```

---

## Batch Processing

### Processing Multiple Requests

```python
import requests
import concurrent.futures

def make_request(payload):
    response = requests.post(
        "http://localhost:3001/v1/messages",
        json=payload,
        timeout=60
    )
    return response.json()

# Batch of requests
requests_batch = [
    {"model": "llama2", "messages": [{"role": "user", "content": f"Question {i}"}]}
    for i in range(10)
]

# Process concurrently
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(make_request, requests_batch))

for result in results:
    print(result)
```

---

## Retry Logic

### Implementing Exponential Backoff

```python
import requests
import time

def request_with_retry(url, payload, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.post(
                url,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 503 and attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.random()
                time.sleep(wait_time)
                continue
            raise

result = request_with_retry(
    "http://localhost:3001/v1/messages",
    {"model": "llama2", "messages": [{"role": "user", "content": "Hello"}]}
)
```

---

## Configuration Examples

### Production Configuration

```python
import os
from dotenv import load_dotenv

load_dotenv()

BALANCER_URL = os.getenv('LLM_BALANCER_URL', 'http://localhost:3001')
DEFAULT_MODEL = os.getenv('LLM_MODEL', 'llama2')
MAX_RETRIES = int(os.getenv('LLM_MAX_RETRIES', '3'))

def create_client():
    return Anthropic(
        base_url=BALANCER_URL,
        api_key='not-required'
    )

client = create_client()
```

### Development Configuration

```bash
# .env
LLM_BALANCER_URL=http://localhost:3001
LLM_MODEL=llama2
LLM_MAX_RETRIES=3
LLM_TIMEOUT=30
```

---

## Best Practices

### 1. Use Connection Pooling

```python
from requests import Session

session = Session()
session.headers.update({'Content-Type': 'application/json'})

response = session.post(
    "http://localhost:3001/v1/messages",
    json={"model": "llama2", "messages": [...]}
)
```

### 2. Set Appropriate Timeouts

```python
# Reasonable timeout for LLM requests
timeout = (3.0, 60.0)  # (connect, read)

response = requests.post(
    url,
    json=payload,
    timeout=timeout
)
```

### 3. Handle Streaming Properly

```python
# For streaming, use iter_lines() not iter_content()
for line in response.iter_lines():
    if line:
        process_line(line)
```

### 4. Log Request Metrics

```python
import time

start_time = time.time()
response = requests.post(url, json=payload)
duration = time.time() - start_time

print(f"Request took {duration:.2f}s")
```

---

## Next Steps

- [API Endpoints](ENDPOINTS.md) - Complete API reference
- [Request/Response Formats](REQUEST_RESPONSE.md) - Data structures
- [Usage Guide](../user/USAGE.md) - Configuration and usage
