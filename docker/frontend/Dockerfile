FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY frontend/package*.json ./
RUN npm ci

# Copy source files (excluding node_modules via .dockerignore)
COPY frontend/ ./

# Build the frontend (this will use the .env file from frontend/)
ENV NODE_ENV=production
RUN npm run build

# Remove node_modules to reduce image size (not needed for runtime)
RUN npm prune --production

# Expose the frontend port
EXPOSE 3080

# Start the frontend server
CMD ["node", "index.js"]