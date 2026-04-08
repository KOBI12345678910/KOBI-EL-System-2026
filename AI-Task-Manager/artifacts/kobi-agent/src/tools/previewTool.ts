import { runCommand, startBackground, stopBackground } from "./terminalTool";
import { checkUrl, waitForServer } from "./browserTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

export interface PreviewInfo {
  url: string;
  port: number;
  pid?: number;
  framework: string;
  status: "starting" | "running" | "stopped" | "error";
}

const previews = new Map<string, PreviewInfo>();

function detectFramework(): string {
  const hasFile = (f: string) => fs.existsSync(path.join(WORKSPACE_DIR, f));
  if (hasFile("next.config.js") || hasFile("next.config.mjs")) return "nextjs";
  if (hasFile("vite.config.ts")) return "vite";
  if (hasFile("angular.json")) return "angular";
  if (hasFile("nuxt.config.ts")) return "nuxt";
  if (hasFile("svelte.config.js")) return "svelte";
  if (hasFile("manage.py")) return "django";
  return "unknown";
}

function detectDevCommand(port: number): string {
  const hasFile = (f: string) => fs.existsSync(path.join(WORKSPACE_DIR, f));

  if (hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts"))
    return `npx next dev -p ${port}`;
  if (hasFile("vite.config.ts") || hasFile("vite.config.js"))
    return `npx vite --port ${port} --host`;
  if (hasFile("angular.json"))
    return `npx ng serve --port ${port}`;
  if (hasFile("nuxt.config.ts") || hasFile("nuxt.config.js"))
    return `npx nuxi dev --port ${port}`;
  if (hasFile("svelte.config.js"))
    return `npx vite dev --port ${port}`;

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, "package.json"), "utf-8"));
    if (pkg.scripts?.dev) return `PORT=${port} npm run dev`;
    if (pkg.scripts?.start) return `PORT=${port} npm start`;
  } catch {}

  if (hasFile("requirements.txt")) {
    if (hasFile("manage.py")) return `python manage.py runserver 0.0.0.0:${port}`;
    return `python -m http.server ${port}`;
  }

  if (hasFile("main.go")) return `go run . --port ${port}`;

  return `npx serve -l ${port} .`;
}

async function findFreePort(start = 3001): Promise<number> {
  for (let port = start; port < start + 100; port++) {
    const result = await runCommand({ command: `lsof -ti:${port} 2>/dev/null || echo "free"`, timeout: 3000 });
    if (result.stdout.trim() === "free") return port;
  }
  return start + Math.floor(Math.random() * 1000);
}

export async function startDevServer(params: {
  port?: number;
  command?: string;
  id?: string;
} = {}): Promise<{ success: boolean; output: string; preview?: PreviewInfo }> {
  const port = params.port || await findFreePort();
  const id = params.id || "dev-server";
  const command = params.command || detectDevCommand(port);

  await stopServer({ id });

  const info: PreviewInfo = {
    url: `http://localhost:${port}`,
    port,
    framework: detectFramework(),
    status: "starting",
  };

  previews.set(id, info);

  const bgResult = await startBackground({ id, command, cwd: WORKSPACE_DIR });
  info.pid = bgResult.pid;

  const ready = await waitForServer({ url: `http://localhost:${port}`, timeout: 30000, interval: 500 });

  if (ready.success) {
    info.status = "running";
  } else {
    info.status = "error";
  }

  return {
    success: info.status === "running",
    output: `Dev server ${info.status} at ${info.url} (${info.framework})`,
    preview: info,
  };
}

export async function stopServer(params: { id?: string } = {}): Promise<{ success: boolean; output: string }> {
  const id = params.id || "dev-server";
  const info = previews.get(id);
  if (info) {
    info.status = "stopped";
    previews.delete(id);
  }
  const result = await stopBackground({ id });
  return { success: true, output: `Server ${id} stopped` };
}

export async function restartServer(params: { id?: string } = {}): Promise<{ success: boolean; output: string; preview?: PreviewInfo }> {
  const id = params.id || "dev-server";
  const existing = previews.get(id);
  if (!existing) return { success: false, output: `No server with id ${id} found` };

  await stopServer({ id });
  return startDevServer({ port: existing.port, id });
}

export async function checkServerHealth(params: { id?: string } = {}): Promise<{ success: boolean; output: string; alive?: boolean; status?: number; responseTime?: number }> {
  const id = params.id || "dev-server";
  const info = previews.get(id);
  if (!info) return { success: false, output: `No server with id ${id} found` };

  const start = Date.now();
  const result = await checkUrl({ url: info.url });
  return {
    success: true,
    output: `Server ${id}: ${result.success ? "alive" : "dead"} (${Date.now() - start}ms)`,
    alive: result.success,
    status: result.statusCode,
    responseTime: Date.now() - start,
  };
}

export async function testEndpoints(params: {
  baseUrl: string;
  endpoints: Array<{ method: string; path: string; body?: any; expectedStatus?: number }>;
}): Promise<{ success: boolean; output: string; results?: any[] }> {
  const results = [];

  for (const ep of params.endpoints) {
    const url = `${params.baseUrl}${ep.path}`;
    const start = Date.now();

    const curlCmd = ep.method === "GET"
      ? `curl -s -w "\\n%{http_code}" "${url}"`
      : `curl -s -w "\\n%{http_code}" -X ${ep.method} -H "Content-Type: application/json" ${ep.body ? `-d '${JSON.stringify(ep.body)}'` : ""} "${url}"`;

    const result = await runCommand({ command: curlCmd, timeout: 10000 });
    const lines = result.stdout.split("\n");
    const statusCode = parseInt(lines.pop() || "0");
    const body = lines.join("\n");

    results.push({
      path: ep.path,
      status: statusCode,
      ok: ep.expectedStatus ? statusCode === ep.expectedStatus : statusCode >= 200 && statusCode < 400,
      time: Date.now() - start,
      body: body.slice(0, 500),
    });
  }

  const passed = results.filter(r => r.ok).length;
  return {
    success: passed === results.length,
    output: `${passed}/${results.length} endpoints passed`,
    results,
  };
}

export function getPreview(params: { id?: string } = {}): { success: boolean; output: string; preview?: PreviewInfo } {
  const id = params.id || "dev-server";
  const info = previews.get(id);
  return info
    ? { success: true, output: `Server ${id}: ${info.status} at ${info.url}`, preview: info }
    : { success: false, output: `No server with id ${id}` };
}

export function getAllPreviews(): { success: boolean; output: string; previews: Record<string, PreviewInfo> } {
  const all: Record<string, PreviewInfo> = {};
  for (const [id, info] of previews) all[id] = info;
  return { success: true, output: `${previews.size} active previews`, previews: all };
}

export const PREVIEW_TOOLS = [
  {
    name: "start_dev_server",
    description: "Start a development server with auto-detection of framework and free port",
    input_schema: {
      type: "object" as const,
      properties: {
        port: { type: "number", description: "Port to use (auto-detected if not provided)" },
        command: { type: "string", description: "Custom start command" },
        id: { type: "string", description: "Server identifier (default: dev-server)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "stop_server",
    description: "Stop a running development server",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Server identifier" } },
      required: [] as string[],
    },
  },
  {
    name: "restart_server",
    description: "Restart a development server",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Server identifier" } },
      required: [] as string[],
    },
  },
  {
    name: "check_server_health",
    description: "Check if a development server is alive and responding",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Server identifier" } },
      required: [] as string[],
    },
  },
  {
    name: "test_endpoints",
    description: "Test multiple API endpoints and report results",
    input_schema: {
      type: "object" as const,
      properties: {
        baseUrl: { type: "string", description: "Base URL (e.g. http://localhost:3000)" },
        endpoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              method: { type: "string" },
              path: { type: "string" },
              body: { type: "object" },
              expectedStatus: { type: "number" },
            },
            required: ["method", "path"],
          },
        },
      },
      required: ["baseUrl", "endpoints"] as string[],
    },
  },
  {
    name: "get_all_previews",
    description: "List all active development server previews",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];