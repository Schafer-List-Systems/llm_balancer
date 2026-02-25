const express = require('express');
const http = require('http');
const { URL } = require('url');

const app = express();
const port = process.env.PORT || 3000;

// Target Ollama server
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://10.0.0.1:11434';

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Middleware to parse raw bodies for streaming
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// Helper function to get body as buffer/string
function getRequestBody(req) {
  if (req.is('raw')) {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return req.body || '';
}

// Helper function to forward requests
function forwardRequest(req, res) {
  const targetUrl = new URL(req.url, OLLAMA_BASE_URL);

  // Copy request headers
  const headers = { ...req.headers };

  // Remove hop-by-hop headers
  const hopByHop = [
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade'
  ];

  hopByHop.forEach(header => delete headers[header.toLowerCase()]);

  // Handle streaming response
  if (req.is('raw') && headers['content-type']?.includes('stream')) {
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Copy response headers
      Object.keys(proxyRes.headers).forEach(header => {
        // Don't transfer hop-by-hop headers back
        if (!hopByHop.includes(header.toLowerCase())) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      // Handle streaming response
      if (proxyRes.headers['content-type']?.includes('stream')) {
        proxyRes.pipe(res);
      } else {
        let data = '';
        proxyRes.on('data', chunk => {
          if (Buffer.isBuffer(chunk)) {
            data += chunk.toString();
          } else {
            data += chunk;
          }
        });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            res.json(parsed);
          } catch (e) {
            res.send(data);
          }
        });
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      res.status(502).json({
        error: 'Bad Gateway',
        message: err.message
      });
    });

    const body = getRequestBody(req);
    if (Buffer.isBuffer(body)) {
      req.pipe(proxyReq);
    } else {
      proxyReq.write(body);
      proxyReq.end();
    }
  } else {
    // Handle non-streaming request
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: headers
    };

    http.request(options, (proxyRes) => {
      let data = '';

      proxyRes.on('data', chunk => {
        if (Buffer.isBuffer(chunk)) {
          data += chunk.toString();
        } else {
          data += chunk;
        }
      });

      proxyRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(proxyRes.statusCode).json(parsed);
        } catch (e) {
          res.status(proxyRes.statusCode).send(data);
        }
      });
    })
    .on('error', (err) => {
      console.error('Proxy request error:', err);
      res.status(502).json({
        error: 'Bad Gateway',
        message: err.message
      });
    })
    .end(getRequestBody(req));
  }
}

// Route: Anthropic API routes
app.all('/v1/messages*', forwardRequest);

// Route: Ollama API routes
app.all('/api/*', forwardRequest);

// Route: Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ollama_server: OLLAMA_BASE_URL,
    timestamp: new Date().toISOString()
  });
});

// Route: List models (for both APIs)
app.all('/models*', forwardRequest);

// Route: Root - show info
app.get('/', (req, res) => {
  res.json({
    service: 'Ollama API Gateway',
    version: '1.0.0',
    status: 'running',
    ollama_server: OLLAMA_BASE_URL,
    routes: {
      anthropic_api: '/v1/messages*',
      ollama_api: '/api/*',
      health: '/health',
      models: '/models*'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Route not found. Use /health to check status.'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`Ollama API Gateway running at http://localhost:${port}`);
  console.log(`Forwarding to: ${OLLAMA_BASE_URL}`);
  console.log(`Anthropic API routes: /v1/messages*`);
  console.log(`Ollama API routes: /api/*`);
  console.log(`Health check: /health`);
});