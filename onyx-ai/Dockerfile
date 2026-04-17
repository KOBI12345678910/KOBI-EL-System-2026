FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
ENV NODE_ENV=production PORT=3300
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 CMD node -e "require('http').get('http://localhost:3300/livez', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
COPY --from=build /app/entrypoint.js ./entrypoint.js
CMD ["node", "entrypoint.js"]
