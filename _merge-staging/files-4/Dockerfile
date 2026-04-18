FROM node:20-slim
WORKDIR /app
COPY package-gcloud.json ./package.json
RUN npm install --production
COPY server-gcloud.js ./server-gcloud.js
EXPOSE 8080
CMD ["node", "server-gcloud.js"]
