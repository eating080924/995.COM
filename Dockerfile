# Stage 1: Build the application
FROM node:20-slim AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies for building
RUN npm ci

# Copy project source files and configuration
COPY . .

# Build the frontend (Vite) and backend server (esbuild)
RUN npm run build

# Stage 2: Production runtime environment
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy build artifacts and configuration from builder stage
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/firebase-applet-config.json ./firebase-applet-config.json

# Switch to non-root user for security
USER node

# Expose Cloud Run default port
EXPOSE 8080

# Start production server
CMD ["node", "dist/server.cjs"]
