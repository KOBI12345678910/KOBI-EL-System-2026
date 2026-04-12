# syntax=docker/dockerfile:1.6
# ═══════════════════════════════════════════════════════════════════════════
# ONYX PROCUREMENT — Node 20 + Express
# Multi-stage build: deps -> runtime
# ═══════════════════════════════════════════════════════════════════════════
# Entry: server.js (pure JS, no build step)
# Port : 3100
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────── STAGE 1: deps ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install OS deps needed by native modules (pdfkit/bwip-js fonts, etc.)
RUN apk add --no-cache \
    tini \
    curl \
    dumb-init \
    fontconfig \
    ttf-dejavu \
    cairo \
    jpeg \
    pango \
    giflib

COPY package.json package-lock.json* ./

# Prefer npm ci when lockfile exists, fallback to install
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

# ───────────────────────── STAGE 2: runtime ───────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Runtime OS deps
RUN apk add --no-cache \
    tini \
    curl \
    fontconfig \
    ttf-dejavu \
    cairo \
    jpeg \
    pango \
    giflib

ENV NODE_ENV=production \
    PORT=3100 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Non-root user
RUN addgroup -g 10001 -S onyx && \
    adduser  -u 10001 -S onyx -G onyx

# Copy production node_modules from deps stage
COPY --from=deps --chown=onyx:onyx /app/node_modules ./node_modules

# Copy source
COPY --chown=onyx:onyx . .

# Ensure runtime directories exist & are writable
RUN mkdir -p /app/data /app/logs /app/data/backups && \
    chown -R onyx:onyx /app/data /app/logs

USER onyx

EXPOSE 3100

# Container-level healthcheck (belt-and-braces with compose healthcheck)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3100/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
