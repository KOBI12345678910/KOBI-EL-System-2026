FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile || npm install
COPY . .
RUN pnpm build || npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production PORT=3200
EXPOSE 3200
CMD ["node", "dist/index.js"]
