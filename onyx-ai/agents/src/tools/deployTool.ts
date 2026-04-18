import { runCommand } from "./terminalTool";
import { writeFile, readFile } from "./fileTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

export interface DeployResult {
  success: boolean;
  url?: string;
  output: string;
  error?: string;
  platform: string;
}

export async function detectProjectType(): Promise<{
  type: string;
  framework: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
}> {
  const hasFile = (f: string) => fs.existsSync(path.join(WORKSPACE_DIR, f));

  if (hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts")) {
    return { type: "node", framework: "nextjs", buildCommand: "npm run build", startCommand: "npm start", outputDir: ".next" };
  }
  if (hasFile("nuxt.config.ts") || hasFile("nuxt.config.js")) {
    return { type: "node", framework: "nuxt", buildCommand: "npm run build", startCommand: "npm run preview", outputDir: ".output" };
  }
  if (hasFile("vite.config.ts") || hasFile("vite.config.js")) {
    return { type: "static", framework: "vite", buildCommand: "npm run build", startCommand: "npx serve dist", outputDir: "dist" };
  }
  if (hasFile("angular.json")) {
    return { type: "static", framework: "angular", buildCommand: "npm run build", startCommand: "npx serve dist", outputDir: "dist" };
  }
  if (hasFile("svelte.config.js")) {
    return { type: "node", framework: "svelte", buildCommand: "npm run build", startCommand: "npm run preview", outputDir: "build" };
  }
  if (hasFile("remix.config.js") || hasFile("remix.config.ts")) {
    return { type: "node", framework: "remix", buildCommand: "npm run build", startCommand: "npm start", outputDir: "build" };
  }
  if (hasFile("astro.config.mjs") || hasFile("astro.config.ts")) {
    return { type: "static", framework: "astro", buildCommand: "npm run build", startCommand: "npx serve dist", outputDir: "dist" };
  }
  if (hasFile("requirements.txt") || hasFile("pyproject.toml")) {
    const checkDep = (dep: string) => {
      try { return fs.readFileSync(path.join(WORKSPACE_DIR, "requirements.txt"), "utf-8").toLowerCase().includes(dep); } catch { return false; }
    };
    if (checkDep("django")) return { type: "python", framework: "django", buildCommand: "python manage.py collectstatic --noinput", startCommand: "gunicorn config.wsgi", outputDir: "staticfiles" };
    if (checkDep("fastapi")) return { type: "python", framework: "fastapi", buildCommand: "echo 'no build'", startCommand: "uvicorn main:app --host 0.0.0.0 --port 8000", outputDir: "." };
    if (checkDep("flask")) return { type: "python", framework: "flask", buildCommand: "echo 'no build'", startCommand: "gunicorn app:app", outputDir: "." };
    return { type: "python", framework: "python", buildCommand: "echo 'no build'", startCommand: "python main.py", outputDir: "." };
  }
  if (hasFile("go.mod")) {
    return { type: "go", framework: "go", buildCommand: "go build -o server .", startCommand: "./server", outputDir: "." };
  }
  if (hasFile("Cargo.toml")) {
    return { type: "rust", framework: "rust", buildCommand: "cargo build --release", startCommand: "./target/release/*", outputDir: "target/release" };
  }
  if (hasFile("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, "package.json"), "utf-8"));
      if (pkg.dependencies?.express) return { type: "node", framework: "express", buildCommand: pkg.scripts?.build ? "npm run build" : "echo 'no build'", startCommand: "npm start", outputDir: "dist" };
      return { type: "node", framework: "node", buildCommand: pkg.scripts?.build ? "npm run build" : "echo 'no build'", startCommand: "npm start", outputDir: "dist" };
    } catch {}
  }
  return { type: "static", framework: "html", buildCommand: "echo 'no build'", startCommand: "npx serve .", outputDir: "." };
}

export async function generateDockerfile(): Promise<{ success: boolean; output: string }> {
  const project = await detectProjectType();
  let dockerfile = "";

  switch (project.type) {
    case "node":
      dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN ${project.buildCommand}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/${project.outputDir} ./${project.outputDir}
COPY --from=builder /app/public ./public 2>/dev/null || true
EXPOSE 3000
CMD ${JSON.stringify(project.startCommand.split(" "))}`;
      break;
    case "static":
      dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN ${project.buildCommand}

FROM nginx:alpine
COPY --from=builder /app/${project.outputDir} /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;
      break;
    case "python":
      dockerfile = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
${project.buildCommand !== "echo 'no build'" ? `RUN ${project.buildCommand}` : ""}
EXPOSE 8000
CMD ${JSON.stringify(project.startCommand.split(" "))}`;
      break;
    case "go":
      dockerfile = `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]`;
      break;
    case "rust":
      dockerfile = `FROM rust:1.75 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/app /usr/local/bin/app
EXPOSE 8080
CMD ["app"]`;
      break;
  }

  const result = await writeFile({ path: "Dockerfile", content: dockerfile });
  return { success: result.success, output: `Generated Dockerfile for ${project.framework} (${project.type})` };
}

export async function generateDockerCompose(params: {
  db?: "postgres" | "mysql" | "mongodb" | "redis";
  cache?: boolean;
}): Promise<{ success: boolean; output: string }> {
  let compose = `version: '3.8'\n\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - NODE_ENV=production\n`;

  if (params.db) compose += `    depends_on:\n      - db\n`;
  compose += `    restart: unless-stopped\n\n`;

  if (params.db === "postgres") {
    compose += `  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_USER: \${DB_USER:-postgres}\n      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres}\n      POSTGRES_DB: \${DB_NAME:-app}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n\n`;
  } else if (params.db === "mysql") {
    compose += `  db:\n    image: mysql:8\n    environment:\n      MYSQL_ROOT_PASSWORD: \${DB_PASSWORD:-root}\n      MYSQL_DATABASE: \${DB_NAME:-app}\n    volumes:\n      - mysqldata:/var/lib/mysql\n    ports:\n      - "3306:3306"\n\n`;
  } else if (params.db === "mongodb") {
    compose += `  db:\n    image: mongo:7\n    volumes:\n      - mongodata:/data/db\n    ports:\n      - "27017:27017"\n\n`;
  }

  if (params.cache || params.db === "redis") {
    compose += `  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n\n`;
  }

  compose += `volumes:\n`;
  if (params.db === "postgres") compose += `  pgdata:\n`;
  if (params.db === "mysql") compose += `  mysqldata:\n`;
  if (params.db === "mongodb") compose += `  mongodata:\n`;

  const result = await writeFile({ path: "docker-compose.yml", content: compose });
  return { success: result.success, output: "Generated docker-compose.yml" };
}

export async function deployDocker(params: { tag?: string } = {}): Promise<DeployResult> {
  const tag = params.tag || "latest";
  await generateDockerfile();

  const buildResult = await runCommand({ command: `docker build -t kobi-app:${tag} .`, timeout: 300000 });
  if (!buildResult.success) {
    return { success: false, output: buildResult.stderr, error: buildResult.stderr, platform: "docker" };
  }

  const runResult = await runCommand({ command: `docker run -d -p 3000:3000 --name kobi-app kobi-app:${tag}`, timeout: 30000 });
  return { success: runResult.success, url: "http://localhost:3000", output: runResult.stdout, platform: "docker" };
}

export async function generateCICD(params: { platform: "github" | "gitlab" }): Promise<{ success: boolean; output: string }> {
  const project = await detectProjectType();

  if (params.platform === "github") {
    const workflow = `name: CI/CD Pipeline

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run lint || true

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: ${project.buildCommand}
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: ${project.outputDir}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: build
          path: ${project.outputDir}
      - name: Deploy
        run: echo "Deploy step - configure for your platform"
`;
    const result = await writeFile({ path: ".github/workflows/ci.yml", content: workflow });
    return { success: result.success, output: "Generated GitHub Actions CI/CD pipeline" };
  }

  if (params.platform === "gitlab") {
    const pipeline = `stages:
  - test
  - build
  - deploy

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - npm test
    - npm run lint || true
  cache:
    paths:
      - node_modules/

build:
  stage: build
  image: node:20-alpine
  script:
    - npm ci
    - ${project.buildCommand}
  artifacts:
    paths:
      - ${project.outputDir}/
  only:
    - main

deploy:
  stage: deploy
  script:
    - echo "Deploy step"
  only:
    - main
  environment:
    name: production
`;
    const result = await writeFile({ path: ".gitlab-ci.yml", content: pipeline });
    return { success: result.success, output: "Generated GitLab CI/CD pipeline" };
  }

  return { success: false, output: "Unsupported platform" };
}

export async function generateNginxConfig(params: {
  serverName?: string;
  ssl?: boolean;
  proxy?: boolean;
  port?: number;
}): Promise<{ success: boolean; output: string }> {
  const port = params.port || 3000;
  const serverName = params.serverName || "localhost";

  let config = `server {
    listen 80;
    server_name ${serverName};
`;

  if (params.ssl) {
    config += `
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    if ($scheme != "https") {
        return 301 https://$host$request_uri;
    }
`;
  }

  if (params.proxy) {
    config += `
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
`;
  } else {
    config += `
    root /usr/share/nginx/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
`;
  }

  config += `
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
}
`;

  const result = await writeFile({ path: "nginx.conf", content: config });
  return { success: result.success, output: `Generated nginx.conf for ${serverName}` };
}

export const DEPLOY_TOOLS = [
  {
    name: "detect_project_type",
    description: "Detect the project type, framework, and recommended build/start commands",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "generate_dockerfile",
    description: "Generate a Dockerfile optimized for the detected project type",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "generate_docker_compose",
    description: "Generate a docker-compose.yml with optional database and cache services",
    input_schema: {
      type: "object" as const,
      properties: {
        db: { type: "string", enum: ["postgres", "mysql", "mongodb", "redis"], description: "Database service to include" },
        cache: { type: "boolean", description: "Include Redis cache" },
      },
      required: [] as string[],
    },
  },
  {
    name: "deploy_docker",
    description: "Build and run the project in a Docker container",
    input_schema: {
      type: "object" as const,
      properties: { tag: { type: "string", description: "Docker image tag" } },
      required: [] as string[],
    },
  },
  {
    name: "generate_cicd",
    description: "Generate CI/CD pipeline configuration (GitHub Actions or GitLab CI)",
    input_schema: {
      type: "object" as const,
      properties: { platform: { type: "string", enum: ["github", "gitlab"] } },
      required: ["platform"] as string[],
    },
  },
  {
    name: "generate_nginx_config",
    description: "Generate nginx configuration for serving or proxying the application",
    input_schema: {
      type: "object" as const,
      properties: {
        serverName: { type: "string" },
        ssl: { type: "boolean" },
        proxy: { type: "boolean" },
        port: { type: "number" },
      },
      required: [] as string[],
    },
  },
];