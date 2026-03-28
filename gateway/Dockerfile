FROM node:20-slim

WORKDIR /app/gateway

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci || npm install

# Copy the entire gateway source
COPY . .

# Build TypeScript
RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
