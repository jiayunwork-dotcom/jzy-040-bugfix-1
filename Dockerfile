# Single-process Hagen-Poiseuille service on Node.js 20 Alpine.
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Compile TypeScript -> dist/
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime image: only production deps + compiled output ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies from the lockfile.
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node

# Lightweight container healthcheck against the status endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
