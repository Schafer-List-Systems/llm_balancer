require('dotenv').config();

const config = {
  port: parseInt(process.env.FRONTEND_PORT) || 3080,
  backendPort: process.env.BACKEND_PORT || '3001',
  apiBaseUrl: process.env.API_BASE_URL,
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000,
};

module.exports = config;