import { runCommand } from "./terminalTool";

export async function httpRequest(params: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}): Promise<{ success: boolean; output: string; status?: number; headers?: Record<string, string>; body?: string; time?: number }> {
  let curlCmd = `curl -s -w "\\n---HTTP_CODE:%{http_code}---\\n---TIME:%{time_total}---"`;
  curlCmd += ` -X ${params.method.toUpperCase()}`;

  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      curlCmd += ` -H "${key}: ${value}"`;
    }
  }
  if (params.body) {
    curlCmd += ` -H "Content-Type: application/json"`;
    curlCmd += ` -d '${typeof params.body === "string" ? params.body : JSON.stringify(params.body)}'`;
  }
  curlCmd += ` -D - "${params.url}"`;

  const result = await runCommand({ command: curlCmd, timeout: params.timeout || 30000 });
  const output = result.stdout;
  const statusMatch = output.match(/---HTTP_CODE:(\d+)---/);
  const timeMatch = output.match(/---TIME:([\d.]+)---/);

  const headers: Record<string, string> = {};
  const headerSection = output.split("\r\n\r\n")[0] || "";
  for (const line of headerSection.split("\r\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) headers[line.slice(0, colonIdx).trim().toLowerCase()] = line.slice(colonIdx + 1).trim();
  }

  const bodyParts = output.split("\r\n\r\n");
  const body = bodyParts.slice(1).join("\r\n\r\n").replace(/---HTTP_CODE:\d+---/, "").replace(/---TIME:[\d.]+---/, "").trim();
  const status = statusMatch ? parseInt(statusMatch[1]) : 0;
  const time = timeMatch ? parseFloat(timeMatch[1]) * 1000 : 0;

  return { success: status >= 200 && status < 400, output: `${status} ${params.method} ${params.url} (${time.toFixed(0)}ms)\n${body.slice(0, 2000)}`, status, headers, body, time };
}

export async function networkPing(params: { host: string; count?: number }): Promise<{ success: boolean; output: string; avgMs?: number }> {
  const count = params.count || 3;
  const result = await runCommand({ command: `ping -c ${count} -W 3 ${params.host}`, timeout: 15000 });
  const avgMatch = result.stdout.match(/avg[^=]*=\s*[\d.]+\/([\d.]+)/);
  return { success: result.success, output: result.stdout, avgMs: avgMatch ? parseFloat(avgMatch[1]) : 0 };
}

export async function checkDns(params: { domain: string }): Promise<{ success: boolean; output: string; ip?: string }> {
  const result = await runCommand({ command: `dig +short ${params.domain} 2>/dev/null || nslookup ${params.domain} | grep Address | tail -1`, timeout: 5000 });
  const ip = result.stdout.trim().split("\n")[0] || "";
  return { success: !!ip, output: result.stdout, ip };
}

export async function checkSsl(params: { domain: string }): Promise<{ success: boolean; output: string; valid?: boolean; expiry?: string; issuer?: string }> {
  const result = await runCommand({ command: `echo | openssl s_client -servername ${params.domain} -connect ${params.domain}:443 2>/dev/null | openssl x509 -noout -dates -issuer 2>/dev/null`, timeout: 10000 });
  const expiryMatch = result.stdout.match(/notAfter=(.+)/);
  const issuerMatch = result.stdout.match(/issuer=(.+)/);
  return { success: result.success && !!expiryMatch, output: result.stdout, valid: !!expiryMatch, expiry: expiryMatch?.[1], issuer: issuerMatch?.[1] };
}

export const NETWORK_TOOLS = [
  { name: "http_request", description: "Make an HTTP request (GET/POST/PUT/DELETE) with headers and body", input_schema: { type: "object" as const, properties: { method: { type: "string" }, url: { type: "string" }, headers: { type: "object" }, body: { type: "object" }, timeout: { type: "number" } }, required: ["method", "url"] as string[] } },
  { name: "network_ping", description: "Ping a host to check connectivity and latency", input_schema: { type: "object" as const, properties: { host: { type: "string" }, count: { type: "number" } }, required: ["host"] as string[] } },
  { name: "check_dns", description: "Check DNS resolution for a domain", input_schema: { type: "object" as const, properties: { domain: { type: "string" } }, required: ["domain"] as string[] } },
  { name: "check_ssl", description: "Check SSL certificate validity, expiry and issuer", input_schema: { type: "object" as const, properties: { domain: { type: "string" } }, required: ["domain"] as string[] } },
];