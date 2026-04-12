# syntax=docker/dockerfile:1.6
# ═══════════════════════════════════════════════════════════════════════════
# PAYROLL AUTONOMOUS — Vite (React) SPA served by nginx
# Multi-stage: deps -> build -> runtime (nginx)
# ═══════════════════════════════════════════════════════════════════════════
# Source : src/main.jsx (React)
# Build  : vite build -> dist/
# Port   : 80 (exposed as 5173 from host)
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────── STAGE 1: deps ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# ───────────────────────── STAGE 2: build ─────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx vite build

# ───────────────────────── STAGE 3: runtime (nginx) ───────────────────────
FROM nginx:1.27-alpine AS runtime

# Custom nginx config tuned for SPA + history fallback + healthcheck
RUN rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

# Inline nginx.conf for the SPA (avoids bind-mounting an extra file)
RUN printf '%s\n' \
  'server {' \
  '  listen 80 default_server;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location = /healthz { add_header Content-Type text/plain; return 200 "ok"; }' \
  '  location / { try_files $uri $uri/ /index.html; }' \
  '  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {' \
  '    expires 7d;' \
  '    add_header Cache-Control "public, max-age=604800, immutable";' \
  '  }' \
  '}' > /etc/nginx/conf.d/payroll.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
