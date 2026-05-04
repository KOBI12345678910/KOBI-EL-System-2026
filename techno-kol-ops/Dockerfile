FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@9 && pnpm install --prod --frozen-lockfile || npm install --production
COPY . .
ENV NODE_ENV=production
ENV PORT=3200
EXPOSE 3200
CMD ["node", "dist/index.js"]
