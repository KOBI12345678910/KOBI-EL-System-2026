import { runCommand, startBackground } from "./terminalTool";
import { checkUrl } from "./browserTool";
import { startWatcher, stopAllWatchers as unwatchAll } from "./watcherTool";

export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
  fix: () => Promise<boolean>;
  interval: number;
  consecutiveFailures: number;
  maxRetries: number;
}

export interface HealthStatus {
  name: string;
  healthy: boolean;
  lastCheck: string;
  lastError?: string;
  failures: number;
  autoFixed: number;
}

const healthChecks: Map<string, HealthCheck & { timer?: ReturnType<typeof setInterval> }> = new Map();
const statuses: Map<string, HealthStatus> = new Map();
let isMonitoring = false;
let logFn: (msg: string) => void = console.log;
let alertFn: (alert: { severity: string; message: string }) => void = () => {};

function registerCheck(check: HealthCheck): void {
  healthChecks.set(check.name, check);
  statuses.set(check.name, {
    name: check.name,
    healthy: true,
    lastCheck: new Date().toISOString(),
    failures: 0,
    autoFixed: 0,
  });
}

async function runCheck(name: string): Promise<void> {
  const check = healthChecks.get(name);
  const status = statuses.get(name);
  if (!check || !status) return;

  try {
    const healthy = await check.check();
    status.lastCheck = new Date().toISOString();

    if (healthy) {
      if (!status.healthy) logFn(`✅ [${name}] Recovered`);
      status.healthy = true;
      status.failures = 0;
      return;
    }

    status.failures++;
    status.healthy = false;
    logFn(`⚠️ [${name}] Failed (${status.failures}/${check.maxRetries})`);

    if (status.failures >= check.consecutiveFailures && status.failures <= check.maxRetries) {
      logFn(`🔧 [${name}] Attempting auto-fix...`);
      alertFn({ severity: "warning", message: `${name} unhealthy, attempting fix` });

      try {
        const fixed = await check.fix();
        if (fixed) {
          status.autoFixed++;
          logFn(`✅ [${name}] Auto-fixed successfully`);
          alertFn({ severity: "info", message: `${name} auto-fixed` });
          await new Promise(r => setTimeout(r, 2000));
          const verifyHealthy = await check.check();
          status.healthy = verifyHealthy;
          if (verifyHealthy) status.failures = 0;
        } else {
          logFn(`❌ [${name}] Auto-fix failed`);
        }
      } catch (err: any) {
        logFn(`❌ [${name}] Fix error: ${err.message}`);
      }
    }

    if (status.failures > check.maxRetries) {
      alertFn({ severity: "critical", message: `${name} failed ${status.failures} times and could not be auto-fixed` });
    }
  } catch (err: any) {
    status.lastError = err.message;
    status.healthy = false;
  }
}

function registerDefaultChecks(): void {
  registerCheck({
    name: "dev-server",
    interval: 10000,
    consecutiveFailures: 3,
    maxRetries: 5,
    check: async () => {
      const result = await checkUrl({ url: "http://localhost:3000" });
      return result.success;
    },
    fix: async () => {
      await runCommand({ command: "kill -9 $(lsof -t -i:3000) 2>/dev/null" });
      await new Promise(r => setTimeout(r, 1000));
      await startBackground({ id: "dev-server-heal", command: "npm run dev" });
      await new Promise(r => setTimeout(r, 5000));
      const result = await checkUrl({ url: "http://localhost:3000" });
      return result.success;
    },
  });

  registerCheck({
    name: "disk-space",
    interval: 60000,
    consecutiveFailures: 1,
    maxRetries: 3,
    check: async () => {
      const result = await runCommand({ command: "df / | tail -1 | awk '{print $5}' | tr -d '%'" });
      const usage = parseInt(result.output?.trim() || "0");
      return usage < 90;
    },
    fix: async () => {
      await runCommand({ command: "rm -rf /tmp/* 2>/dev/null; npm cache clean --force 2>/dev/null; find . -name '*.log' -size +10M -delete 2>/dev/null" });
      return true;
    },
  });

  registerCheck({
    name: "memory",
    interval: 30000,
    consecutiveFailures: 2,
    maxRetries: 3,
    check: async () => {
      const mem = process.memoryUsage();
      const usedMB = mem.heapUsed / 1024 / 1024;
      return usedMB < 512;
    },
    fix: async () => {
      if (global.gc) global.gc();
      return true;
    },
  });

  registerCheck({
    name: "node-modules",
    interval: 120000,
    consecutiveFailures: 1,
    maxRetries: 2,
    check: async () => {
      const result = await runCommand({ command: "npm ls --depth=0 2>&1 | grep 'MISSING\\|ERR' | wc -l" });
      const errors = parseInt(result.output?.trim() || "0");
      return errors === 0;
    },
    fix: async () => {
      const result = await runCommand({ command: "npm install", timeout: 120000 });
      return result.success;
    },
  });

  registerCheck({
    name: "typescript",
    interval: 60000,
    consecutiveFailures: 2,
    maxRetries: 3,
    check: async () => {
      const result = await runCommand({ command: "npx tsc --noEmit 2>&1 | grep 'error TS' | wc -l", timeout: 30000 });
      return parseInt(result.output?.trim() || "0") === 0;
    },
    fix: async () => {
      return false;
    },
  });
}

export async function startSelfHealing(params: { onLog?: (msg: string) => void; onAlert?: (alert: { severity: string; message: string }) => void }): Promise<{ success: boolean; output: string }> {
  if (isMonitoring) return { success: true, output: "Self-healing monitor already running" };
  isMonitoring = true;
  if (params.onLog) logFn = params.onLog;
  if (params.onAlert) alertFn = params.onAlert;

  logFn("🏥 Self-Healing Monitor started");
  registerDefaultChecks();

  for (const [name, check] of healthChecks) {
    const timer = setInterval(async () => { await runCheck(name); }, check.interval);
    check.timer = timer;
  }

  return { success: true, output: `Self-healing started with ${healthChecks.size} health checks: ${Array.from(healthChecks.keys()).join(", ")}` };
}

export async function stopSelfHealing(): Promise<{ success: boolean; output: string }> {
  isMonitoring = false;
  for (const [, check] of healthChecks) {
    if (check.timer) clearInterval(check.timer);
  }
  logFn("🏥 Self-Healing Monitor stopped");
  return { success: true, output: "Self-healing monitor stopped" };
}

export async function getSelfHealStatus(): Promise<{ success: boolean; output: string; statuses?: HealthStatus[] }> {
  const all = Array.from(statuses.values());
  const healthy = all.filter(s => s.healthy).length;
  const output = all.map(s => `${s.healthy ? "✅" : "❌"} ${s.name}: ${s.healthy ? "healthy" : "UNHEALTHY"} (failures: ${s.failures}, auto-fixed: ${s.autoFixed})`).join("\n");
  return { success: true, output: `Health Status (${healthy}/${all.length} healthy):\n${output || "No checks registered"}`, statuses: all };
}

export async function runAllChecksNow(): Promise<{ success: boolean; output: string; statuses?: HealthStatus[] }> {
  for (const name of healthChecks.keys()) {
    await runCheck(name);
  }
  return getSelfHealStatus();
}

export async function addHealthCheck(params: { name: string; checkCommand: string; fixCommand: string; interval?: number }): Promise<{ success: boolean; output: string }> {
  registerCheck({
    name: params.name,
    interval: params.interval || 30000,
    consecutiveFailures: 2,
    maxRetries: 3,
    check: async () => {
      const result = await runCommand({ command: params.checkCommand, timeout: 10000 });
      return result.success;
    },
    fix: async () => {
      const result = await runCommand({ command: params.fixCommand, timeout: 30000 });
      return result.success;
    },
  });
  return { success: true, output: `Health check '${params.name}' registered` };
}

export const SELF_HEAL_TOOLS = [
  { name: "start_self_healing", description: "Start self-healing monitor with automatic health checks (dev-server, disk, memory, node-modules, typescript)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "stop_self_healing", description: "Stop the self-healing monitor", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_self_heal_status", description: "Get current health status of all monitored checks", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "run_all_checks_now", description: "Run all health checks immediately and return results", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "add_health_check", description: "Add a custom health check with shell commands for check and fix", input_schema: { type: "object" as const, properties: { name: { type: "string" }, checkCommand: { type: "string", description: "Shell command that succeeds (exit 0) when healthy" }, fixCommand: { type: "string", description: "Shell command to fix the issue" }, interval: { type: "number", description: "Check interval in ms (default 30000)" } }, required: ["name", "checkCommand", "fixCommand"] as string[] } },
];