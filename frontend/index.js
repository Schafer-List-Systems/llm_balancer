require('dotenv').config();
const express = require('express');
const path = require('path');
const config = require('./config');

const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the frontend server
const server = app.listen(config.port, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`LLM Balancer Frontend running at http://localhost:${config.port}`);
  console.log(`API Base URL: ${config.apiBaseUrl}`);
  console.log(`${'='.repeat(60)}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Frontend] Port ${config.port} is already in use`);
    process.exit(1);
  }
  console.error('[Frontend] Server error:', err);
});

module.exports = app;
