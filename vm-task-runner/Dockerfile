FROM node:20-alpine

WORKDIR /app

# Install only this workspace's manifest first, for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV VM_TASK_RUNNER_PORT=3400

EXPOSE 3400

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3400/health || exit 1

CMD ["node", "src/index.js"]
