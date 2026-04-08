import http from "http";
import https from "https";
import { runCommand } from "./terminalTool";

export async function httpRequest(params: {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const fullUrl = params.url.startsWith("http") ? params.url : `http://localhost:${process.env.PORT || "8080"}${params.url}`;
      const url = new URL(fullUrl);
      const isHttps = url.protocol === "https:";
      const lib = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: params.method || "GET",
        headers: { "Content-Type": "application/json", ...params.headers },
        timeout: 15000,
      };

      const req = lib.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          resolve({
            success: res.statusCode! < 400,
            status: res.statusCode,
            body: data.substring(0, 10000),
          });
        });
      });

      req.on("error", (e) => resolve({ success: false, error: e.message }));
      req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "timeout" }); });

      if (params.body) req.write(params.body);
      req.end();
    } catch (e: any) {
      resolve({ success: false, error: e.message });
    }
  });
}

export async function checkHealth(params: { url?: string }): Promise<{ success: boolean; services?: Record<string, string>; error?: string }> {
  const checks: Record<string, string> = {};

  const apiRes = await httpRequest({ url: params.url || `http://localhost:${process.env.PORT || "8080"}/api/health` });
  checks.api = apiRes.success ? `OK (${apiRes.status})` : `FAIL: ${apiRes.error}`;

  const feRes = await httpRequest({ url: "http://localhost:23023/" });
  checks.frontend = feRes.success ? `OK (${feRes.status})` : `FAIL: ${feRes.error}`;

  return { success: true, services: checks };
}

export async function checkUrl(params: { url: string }): Promise<{ success: boolean; status?: number; ok?: boolean; error?: string }> {
  const result = await runCommand({
    command: `curl -s -o /dev/null -w "%{http_code}" "${params.url}"`,
    timeout: 15000,
  });
  const status = parseInt(result.stdout) || 0;
  return { success: true, status, ok: status >= 200 && status < 400 };
}

export async function fetchPage(params: { url: string }): Promise<{ success: boolean; body?: string; error?: string }> {
  const result = await runCommand({
    command: `curl -s -L "${params.url}" | head -c 10000`,
    timeout: 15000,
  });
  return { success: result.success, body: result.stdout, error: result.stderr || undefined };
}

export async function waitForServer(params: { url: string; maxWait?: number; interval?: number }): Promise<{ success: boolean; ready?: boolean; error?: string }> {
  const maxWait = params.maxWait || 30000;
  const interval = params.interval || 1000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const result = await checkUrl({ url: params.url });
      if (result.ok) return { success: true, ready: true };
    } catch {}
    await new Promise((r) => setTimeout(r, interval));
  }
  return { success: true, ready: false };
}

export const BROWSER_TOOLS = [
  {
    name: "http_request",
    description: "Send an HTTP request — test API endpoints.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL (full or /api/...)" },
        method: { type: "string", description: "GET/POST/PUT/DELETE" },
        body: { type: "string", description: "Request body (JSON)" },
        headers: { type: "object", description: "Additional headers" },
      },
      required: ["url"],
    },
  },
  {
    name: "check_health",
    description: "Check service health (API + Frontend).",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to check" },
      },
    },
  },
  {
    name: "check_url",
    description: "Check if a URL is reachable and get HTTP status code.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to check" },
      },
      required: ["url"],
    },
  },
  {
    name: "fetch_page",
    description: "Fetch page content (first 10KB) from a URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "wait_for_server",
    description: "Wait until a server is ready and responding.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to poll" },
        maxWait: { type: "number", description: "Max wait time in ms (default: 30000)" },
        interval: { type: "number", description: "Poll interval in ms (default: 1000)" },
      },
      required: ["url"],
    },
  },
];