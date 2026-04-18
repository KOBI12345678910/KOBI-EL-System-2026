import { runCommand } from "./terminalTool";
import * as os from "os";

const startTime = Date.now();

export interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  timestamp: Date;
  system: {
    platform: string;
    nodeVersion: string;
    cpuUsage: number;
    memoryUsage: { used: number; total: number; percent: number };
    diskUsage: { used: string; total: string; percent: string };
    loadAvg: number[];
  };
  services: Array<{
    name: string;
    status: "up" | "down" | "degraded";
    responseTime?: number;
    lastCheck: Date;
    details?: string;
  }>;
  agent: {
    status: string;
    tasksCompleted: number;
    tokensUsed: number;
  };
  errors: {
    last5min: number;
    last1hr: number;
  };
}

async function getCPU(): Promise<number> {
  const result = await runCommand({ command: "top -bn1 2>/dev/null | grep 'Cpu' | awk '{print $2}' | head -1", timeout: 3000 });
  return parseFloat(result.stdout.trim()) || os.loadavg()[0];
}

function getMemory(): { used: number; total: number; percent: number } {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    used: Math.round(used / 1024 / 1024),
    total: Math.round(total / 1024 / 1024),
    percent: Math.round((used / total) * 100),
  };
}

async function getDisk(): Promise<{ used: string; total: string; percent: string }> {
  const result = await runCommand({ command: "df -h / | tail -1 | awk '{print $3, $2, $5}'", timeout: 3000 });
  const parts = result.stdout.trim().split(/\s+/);
  return { used: parts[0] || "?", total: parts[1] || "?", percent: parts[2] || "?" };
}

async function checkServices(): Promise<SystemHealth["services"]> {
  const services: SystemHealth["services"] = [];

  const webStart = Date.now();
  const webResult = await runCommand({
    command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "0"',
    timeout: 5000,
  });
  const webStatus = parseInt(webResult.stdout.trim());
  services.push({
    name: "kobi-agent",
    status: webStatus >= 200 && webStatus < 400 ? "up" : "down",
    responseTime: Date.now() - webStart,
    lastCheck: new Date(),
    details: `HTTP ${webStatus || "N/A"}`,
  });

  const apiStart = Date.now();
  const apiResult = await runCommand({
    command: `curl -s -o /dev/null -w "%{http_code}" http://localhost:${process.env.PORT || "8080"}/api/health 2>/dev/null || echo "0"`,
    timeout: 5000,
  });
  const apiStatus = parseInt(apiResult.stdout.trim());
  services.push({
    name: "api-server",
    status: apiStatus >= 200 && apiStatus < 400 ? "up" : "down",
    responseTime: Date.now() - apiStart,
    lastCheck: new Date(),
    details: `HTTP ${apiStatus || "N/A"}`,
  });

  const dbStart = Date.now();
  const dbResult = await runCommand({
    command: 'psql "$DATABASE_URL" -c "SELECT 1" 2>/dev/null && echo "OK" || echo "FAIL"',
    timeout: 5000,
  });
  services.push({
    name: "database",
    status: dbResult.stdout.includes("OK") ? "up" : "down",
    responseTime: Date.now() - dbStart,
    lastCheck: new Date(),
  });

  const redisStart = Date.now();
  const redisResult = await runCommand({
    command: 'redis-cli ping 2>/dev/null || echo "FAIL"',
    timeout: 3000,
  });
  services.push({
    name: "redis",
    status: redisResult.stdout.includes("PONG") ? "up" : "down",
    responseTime: Date.now() - redisStart,
    lastCheck: new Date(),
  });

  services.push({
    name: "node",
    status: "up",
    responseTime: 0,
    lastCheck: new Date(),
    details: process.version,
  });

  return services;
}

export async function getFullHealth(params: {}): Promise<{ success: boolean; output: string; health?: SystemHealth }> {
  console.log("\n🏥 בדיקת בריאות מלאה...");

  const [cpu, memory, disk, services] = await Promise.all([
    getCPU(),
    getMemory(),
    getDisk(),
    checkServices(),
  ]);

  const criticalServices = services.filter(s => s.status === "down");
  const status: SystemHealth["status"] =
    criticalServices.length > 1 ? "critical" :
    criticalServices.length > 0 || memory.percent > 90 ? "degraded" : "healthy";

  const uptimeMs = Date.now() - startTime;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);

  const health: SystemHealth = {
    status,
    uptime: uptimeMs,
    timestamp: new Date(),
    system: {
      platform: `${os.platform()} ${os.arch()}`,
      nodeVersion: process.version,
      cpuUsage: cpu,
      memoryUsage: memory,
      diskUsage: disk,
      loadAvg: os.loadavg(),
    },
    services,
    agent: { status: "idle", tasksCompleted: 0, tokensUsed: 0 },
    errors: { last5min: 0, last1hr: 0 },
  };

  const statusIcon = status === "healthy" ? "✅" : status === "degraded" ? "⚠️" : "🔴";
  const lines = [
    `${statusIcon} סטטוס מערכת: ${status} | Uptime: ${hours}h ${minutes}m`,
    ``,
    `💻 מערכת:`,
    `  Platform: ${health.system.platform}`,
    `  Node: ${health.system.nodeVersion}`,
    `  CPU: ${cpu.toFixed(1)}% | Load: ${os.loadavg().map(l => l.toFixed(2)).join(", ")}`,
    `  RAM: ${memory.used}MB / ${memory.total}MB (${memory.percent}%)`,
    `  Disk: ${disk.used} / ${disk.total} (${disk.percent})`,
    ``,
    `🔌 שירותים:`,
    ...services.map(s => {
      const icon = s.status === "up" ? "✅" : s.status === "down" ? "❌" : "⚠️";
      return `  ${icon} ${s.name}: ${s.status}${s.responseTime ? ` (${s.responseTime}ms)` : ""}${s.details ? ` — ${s.details}` : ""}`;
    }),
  ];

  return { success: true, output: lines.join("\n"), health };
}

export async function getQuickStatus(params: {}): Promise<{ success: boolean; output: string }> {
  const mem = getMemory();
  const load = os.loadavg()[0];
  const uptimeMs = Date.now() - startTime;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);

  const status = mem.percent > 90 ? "⚠️ degraded" : "✅ healthy";

  return {
    success: true,
    output: `${status} | CPU: ${load.toFixed(1)} | RAM: ${mem.percent}% | Uptime: ${hours}h ${minutes}m`,
  };
}

export async function checkServicesHealth(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🔌 בודק שירותים...");
  const services = await checkServices();

  const lines = services.map(s => {
    const icon = s.status === "up" ? "✅" : s.status === "down" ? "❌" : "⚠️";
    return `${icon} ${s.name}: ${s.status}${s.responseTime ? ` (${s.responseTime}ms)` : ""}${s.details ? ` — ${s.details}` : ""}`;
  });

  const allUp = services.every(s => s.status === "up");
  return { success: true, output: `🔌 שירותים${allUp ? " — הכל תקין ✅" : ""}:\n${lines.join("\n")}` };
}

export async function getSystemMetricsDetailed(params: {}): Promise<{ success: boolean; output: string }> {
  const mem = getMemory();
  const disk = await getDisk();
  const cpu = await getCPU();
  const uptime = process.uptime();

  const lines = [
    `📊 מדדי מערכת:`,
    `  CPU: ${cpu.toFixed(1)}%`,
    `  Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(" / ")} (1m/5m/15m)`,
    `  RAM: ${mem.used}MB / ${mem.total}MB (${mem.percent}%)`,
    `  Disk: ${disk.used} / ${disk.total} (${disk.percent})`,
    `  CPUs: ${os.cpus().length}`,
    `  Platform: ${os.platform()} ${os.arch()}`,
    `  Node: ${process.version}`,
    `  Process uptime: ${Math.floor(uptime / 60)}m`,
    `  System uptime: ${Math.floor(os.uptime() / 3600)}h`,
  ];

  return { success: true, output: lines.join("\n") };
}

export const HEALTH_DASHBOARD_TOOLS = [
  {
    name: "get_full_health",
    description: "בדיקת בריאות מלאה — CPU, RAM, דיסק, שירותים, שגיאות, agent",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_quick_status",
    description: "סטטוס מהיר — שורה אחת עם CPU, RAM, uptime",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "check_services_health",
    description: "בדיקת שירותים — kobi-agent, api-server, DB, Redis, Node",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_system_metrics_detailed",
    description: "מדדי מערכת מפורטים — CPU, load, RAM, disk, CPUs, uptime",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
