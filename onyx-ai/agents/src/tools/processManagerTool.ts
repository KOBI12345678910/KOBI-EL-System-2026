import { runCommand } from "./terminalTool";
import { execSync, spawn, ChildProcess } from "child_process";

interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  status: "running" | "stopped" | "errored" | "restarting";
  pid?: number;
  restarts: number;
  maxRestarts: number;
  uptime: number;
  startedAt?: string;
  stoppedAt?: string;
  lastError?: string;
  env?: Record<string, string>;
  cwd?: string;
  autoRestart: boolean;
  memory?: number;
  cpu?: number;
}

const processes = new Map<string, ManagedProcess & { child?: ChildProcess }>();
let monitorTimer: ReturnType<typeof setInterval> | null = null;

function ensureMonitor() {
  if (monitorTimer) return;
  monitorTimer = setInterval(async () => {
    for (const [id, proc] of processes) {
      if (proc.status !== "running" || !proc.pid) continue;
      try {
        process.kill(proc.pid, 0);
      } catch {
        proc.status = "errored";
        if (proc.autoRestart && proc.restarts < proc.maxRestarts) {
          await restartProcess({ id });
        }
      }
      if (proc.pid) {
        try {
          const out = execSync(`ps -p ${proc.pid} -o %cpu,%mem --no-headers 2>/dev/null`, { timeout: 3000 }).toString().trim();
          const parts = out.split(/\s+/);
          proc.cpu = parseFloat(parts[0]) || 0;
          proc.memory = parseFloat(parts[1]) || 0;
        } catch {}
      }
    }
  }, 5000);
}

export async function startProcess(params: { name: string; command: string; env?: Record<string, string>; cwd?: string; autoRestart?: boolean; maxRestarts?: number }): Promise<{ success: boolean; output: string }> {
  const id = `proc_${params.name}_${Date.now()}`;
  const proc: ManagedProcess & { child?: ChildProcess } = {
    id, name: params.name, command: params.command, status: "running",
    restarts: 0, maxRestarts: params.maxRestarts || 10, uptime: 0,
    startedAt: new Date().toISOString(), env: params.env, cwd: params.cwd,
    autoRestart: params.autoRestart !== false,
  };

  try {
    const child = spawn("sh", ["-c", params.command], {
      cwd: params.cwd, env: { ...process.env, ...params.env }, detached: true, stdio: "pipe",
    });
    proc.pid = child.pid;
    proc.child = child;
    child.stderr?.on("data", (data: Buffer) => { proc.lastError = data.toString().trim(); });
    child.on("exit", () => { if (proc.status === "running") proc.status = "errored"; });
    child.unref();
  } catch (e: any) {
    return { success: false, output: `Failed to start: ${e.message}` };
  }

  processes.set(id, proc);
  ensureMonitor();
  return { success: true, output: `Started "${params.name}" (${id})\nPID: ${proc.pid}\nCommand: ${params.command}` };
}

export async function stopProcess(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const proc = processes.get(params.id);
  if (!proc) return { success: false, output: `Process ${params.id} not found` };
  proc.autoRestart = false;
  if (proc.child) { try { proc.child.kill("SIGTERM"); } catch {} }
  else if (proc.pid) { try { process.kill(proc.pid, "SIGTERM"); } catch {} }
  proc.status = "stopped";
  proc.stoppedAt = new Date().toISOString();
  return { success: true, output: `Stopped "${proc.name}"` };
}

export async function restartProcess(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const proc = processes.get(params.id);
  if (!proc) return { success: false, output: `Process ${params.id} not found` };
  proc.status = "restarting";
  if (proc.child) { try { proc.child.kill("SIGTERM"); } catch {} }
  else if (proc.pid) { try { process.kill(proc.pid, "SIGTERM"); } catch {} }
  await new Promise(r => setTimeout(r, 1000));

  try {
    const child = spawn("sh", ["-c", proc.command], {
      cwd: proc.cwd, env: { ...process.env, ...proc.env }, detached: true, stdio: "pipe",
    });
    proc.pid = child.pid;
    proc.child = child;
    proc.status = "running";
    proc.restarts++;
    proc.startedAt = new Date().toISOString();
    child.stderr?.on("data", (data: Buffer) => { proc.lastError = data.toString().trim(); });
    child.on("exit", () => { if (proc.status === "running") proc.status = "errored"; });
    child.unref();
  } catch (e: any) {
    proc.status = "errored";
    return { success: false, output: `Restart failed: ${e.message}` };
  }

  return { success: true, output: `Restarted "${proc.name}" (restart #${proc.restarts})` };
}

export async function stopAllProcesses(): Promise<{ success: boolean; output: string }> {
  let count = 0;
  for (const [id] of processes) { await stopProcess({ id }); count++; }
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
  return { success: true, output: `Stopped ${count} processes` };
}

export async function listProcesses(): Promise<{ success: boolean; output: string }> {
  const all = Array.from(processes.values());
  if (!all.length) return { success: true, output: "No managed processes" };
  return { success: true, output: all.map(p => {
    const uptime = p.startedAt ? Math.round((Date.now() - new Date(p.startedAt).getTime()) / 1000) : 0;
    return `[${p.status.toUpperCase()}] ${p.id}: ${p.name}\n  Command: ${p.command}\n  PID: ${p.pid || "N/A"} | Uptime: ${uptime}s | Restarts: ${p.restarts}/${p.maxRestarts}${p.cpu !== undefined ? ` | CPU: ${p.cpu}%` : ""}${p.memory !== undefined ? ` | MEM: ${p.memory}%` : ""}${p.lastError ? `\n  Last Error: ${p.lastError.slice(0, 200)}` : ""}`;
  }).join("\n\n") };
}

export async function getProcessInfo(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const proc = processes.get(params.id);
  if (!proc) return { success: false, output: `Process ${params.id} not found` };
  return { success: true, output: JSON.stringify({ id: proc.id, name: proc.name, command: proc.command, status: proc.status, pid: proc.pid, restarts: proc.restarts, maxRestarts: proc.maxRestarts, startedAt: proc.startedAt, stoppedAt: proc.stoppedAt, autoRestart: proc.autoRestart, lastError: proc.lastError, cpu: proc.cpu, memory: proc.memory }, null, 2) };
}

export async function getProcessByName(params: { name: string }): Promise<{ success: boolean; output: string }> {
  const proc = Array.from(processes.values()).find(p => p.name === params.name);
  if (!proc) return { success: false, output: `No process named "${params.name}"` };
  return getProcessInfo({ id: proc.id });
}

export const PROCESS_MANAGER_TOOLS = [
  { name: "start_process", description: "Start a managed background process with auto-restart and monitoring", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Process name" }, command: { type: "string", description: "Shell command" }, env: { type: "object", description: "Environment variables" }, cwd: { type: "string", description: "Working directory" }, autoRestart: { type: "boolean", description: "Auto-restart on crash (default true)" }, maxRestarts: { type: "number", description: "Max restart attempts (default 10)" } }, required: ["name", "command"] as string[] } },
  { name: "stop_process", description: "Stop a managed process", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "restart_process", description: "Restart a managed process", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "stop_all_processes", description: "Stop all managed processes", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "list_processes", description: "List all managed processes with status, PID, uptime, CPU/memory", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_process_info", description: "Get detailed info about a specific process by ID", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "get_process_by_name", description: "Find a managed process by name", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
];