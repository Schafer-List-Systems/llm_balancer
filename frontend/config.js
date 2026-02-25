require('dotenv').config();

const config = {
  port: parseInt(process.env.FRONTEND_PORT) || 3080,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000,
};

module.exports = config;