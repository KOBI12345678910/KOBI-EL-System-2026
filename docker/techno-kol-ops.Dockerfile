# syntax=docker/dockerfile:1.6
# ═══════════════════════════════════════════════════════════════════════════
# TECHNO-KOL OPS — Node 20 + TypeScript
# Multi-stage: deps -> build -> runtime
# ═══════════════════════════════════════════════════════════════════════════
# Source : src/index.ts (TypeScript)
# Build  : tsc -> dist/
# Port   : 3200
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────── STAGE 1: deps (full) ───────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache tini curl

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# ───────────────────────── STAGE 2: build ─────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript -> dist/
RUN npx tsc

# Prune to production-only deps for slim runtime image
RUN npm prune --omit=dev

# ───────────────────────── STAGE 3: runtime ───────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini curl

ENV NODE_ENV=production \
    PORT=3200 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Non-root user
RUN addgroup -g 10002 -S tkops && \
    adduser  -u 10002 -S tkops -G tkops

# Pruned production deps + compiled output + package.json
COPY --from=build --chown=tkops:tkops /app/node_modules ./node_modules
COPY --from=build --chown=tkops:tkops /app/dist ./dist
COPY --from=build --chown=tkops:tkops /app/package.json ./package.json

# Ship SQL schemas/seeds alongside the runtime for migrations & seeding
COPY --from=build --chown=tkops:tkops /app/src/db ./src/db

RUN mkdir -p /app/logs && chown -R tkops:tkops /app/logs

USER tkops

EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3200/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
