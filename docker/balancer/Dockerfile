FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY llm-balancer/package*.json ./
RUN npm ci

# Copy all files
COPY llm-balancer/ ./

# Expose the backend port
EXPOSE 3001

# Start the balancer
CMD ["node", "index.js"]