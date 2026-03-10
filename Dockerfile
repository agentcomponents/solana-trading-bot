# Picker - Solana Trading Bot
FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (will rebuild better-sqlite3 for this platform)
RUN npm install && npm rebuild better-sqlite3

# Copy source code
COPY . .

# Create directories
RUN mkdir -p /app/data /app/logs

# Use tsx directly (no build step needed)
CMD ["npx", "tsx", "src/index.ts", "start:paper"]
