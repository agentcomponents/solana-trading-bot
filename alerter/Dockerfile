# Picker Alert Service
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

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Start alerter
CMD ["npm", "start"]
