# Frame Art Cloud Server — production Dockerfile
#
# Multi-stage build:
# 1. Install dependencies (cached layer)
# 2. Run server with tsx (TypeScript runtime)
#
# Usage:
#   docker build -t frame-art-cloud apps/cloud
#   docker run -p 3847:3847 --env-file apps/cloud/.env frame-art-cloud

FROM node:22-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# --- Install dependencies (cached unless package files change) ---
FROM base AS deps

# Copy workspace config and package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/cloud/package.json apps/cloud/
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/providers/package.json packages/providers/
COPY packages/rendering/package.json packages/rendering/
COPY packages/tv/package.json packages/tv/
COPY packages/health/package.json packages/health/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# --- Build stage ---
FROM base AS runner

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/cloud/node_modules ./apps/cloud/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY apps/cloud/ apps/cloud/

# Create data directory for SQLite and images
RUN mkdir -p data/images

# Production defaults
ENV NODE_ENV=production
ENV PORT=3847
ENV DATABASE_URL=file:../../data/cloud.db

EXPOSE 3847

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3847/api/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run with tsx (TypeScript runtime, negligible overhead)
CMD ["pnpm", "--filter", "@frame/cloud", "start"]
