# syntax=docker/dockerfile:1.6
# ═══════════════════════════════════════════════════════════════════════════
# ONYX AI — Node 20 + TypeScript autonomous agent platform
# Multi-stage: deps -> build -> runtime
# ═══════════════════════════════════════════════════════════════════════════
# Source : src/index.ts (TypeScript)
# Build  : tsc -> dist/
# Port   : 3300 (override of in-source default via env)
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────── STAGE 1: deps (full) ───────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache tini curl python3 make g++ \
 && ln -sf python3 /usr/bin/python

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

# package.json declares prebuild=rimraf dist and build=tsc
RUN npx rimraf dist && npx tsc

# Trim to production deps for final image
RUN npm prune --omit=dev

# ───────────────────────── STAGE 3: runtime ───────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini curl

ENV NODE_ENV=production \
    PORT=3300 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

RUN addgroup -g 10003 -S onyxai && \
    adduser  -u 10003 -S onyxai -G onyxai

COPY --from=build --chown=onyxai:onyxai /app/node_modules ./node_modules
COPY --from=build --chown=onyxai:onyxai /app/dist ./dist
COPY --from=build --chown=onyxai:onyxai /app/package.json ./package.json

# Preserve static data/knowledge resources if present
COPY --from=build --chown=onyxai:onyxai /app/data ./data

RUN mkdir -p /app/logs /app/data && chown -R onyxai:onyxai /app/logs /app/data

USER onyxai

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3300/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
