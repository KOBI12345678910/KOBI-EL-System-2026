import { runCommand } from "./terminalTool";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  lastError?: string;
  timeout: number;
}

interface CronLogEntry {
  jobId: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

const jobs = new Map<string, CronJob & { timer?: ReturnType<typeof setInterval> }>();
const cronLogs: CronLogEntry[] = [];
const MAX_LOGS = 1000;

function parseScheduleToMs(schedule: string): number {
  const match = schedule.match(/every\s+(\d+)\s*(s|sec|m|min|h|hour|d|day)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("s")) return value * 1000;
    if (unit.startsWith("m")) return value * 60 * 1000;
    if (unit.startsWith("h")) return value * 60 * 60 * 1000;
    if (unit.startsWith("d")) return value * 24 * 60 * 60 * 1000;
  }
  const cronMatch = schedule.match(/^\*\/(\d+)\s/);
  if (cronMatch) return parseInt(cronMatch[1]) * 60 * 1000;
  return 60000;
}

async function executeJob(job: CronJob & { timer?: ReturnType<typeof setInterval> }): Promise<CronLogEntry> {
  const startTime = Date.now();
  try {
    const result = await runCommand({ command: job.command, timeout: job.timeout });
    job.lastRun = new Date().toISOString();
    job.runCount++;
    const intervalMs = parseScheduleToMs(job.schedule);
    job.nextRun = new Date(Date.now() + intervalMs).toISOString();

    const entry: CronLogEntry = { jobId: job.id, startedAt: new Date(startTime).toISOString(), completedAt: new Date().toISOString(), success: result.success, output: (result.output || "").slice(0, 500), duration: Date.now() - startTime };
    if (!result.success) { entry.error = result.output; job.lastError = result.output; } else { job.lastError = undefined; }
    cronLogs.push(entry);
    if (cronLogs.length > MAX_LOGS) cronLogs.shift();
    return entry;
  } catch (err: any) {
    job.lastError = err.message;
    const entry: CronLogEntry = { jobId: job.id, startedAt: new Date(startTime).toISOString(), completedAt: new Date().toISOString(), success: false, error: err.message, duration: Date.now() - startTime };
    cronLogs.push(entry);
    return entry;
  }
}

function scheduleJob(job: CronJob & { timer?: ReturnType<typeof setInterval> }): void {
  const intervalMs = parseScheduleToMs(job.schedule);
  if (intervalMs <= 0) return;
  job.nextRun = new Date(Date.now() + intervalMs).toISOString();
  job.timer = setInterval(async () => { if (job.enabled) await executeJob(job); }, intervalMs);
}

export async function registerCronJob(params: { name: string; schedule: string; command: string; enabled?: boolean; timeout?: number }): Promise<{ success: boolean; output: string }> {
  const id = `cron_${Date.now()}`;
  const job: CronJob & { timer?: ReturnType<typeof setInterval> } = { id, name: params.name, schedule: params.schedule, command: params.command, enabled: params.enabled !== false, runCount: 0, timeout: params.timeout || 60000 };
  jobs.set(id, job);
  if (job.enabled) scheduleJob(job);
  return { success: true, output: `Registered cron job "${params.name}" (${id})\nSchedule: ${params.schedule}\nCommand: ${params.command}\nEnabled: ${job.enabled}` };
}

export async function enableCronJob(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  const job = jobs.get(params.jobId);
  if (!job) return { success: false, output: `Job ${params.jobId} not found` };
  job.enabled = true;
  scheduleJob(job);
  return { success: true, output: `Enabled job "${job.name}"` };
}

export async function disableCronJob(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  const job = jobs.get(params.jobId);
  if (!job) return { success: false, output: `Job ${params.jobId} not found` };
  job.enabled = false;
  if (job.timer) clearInterval(job.timer);
  return { success: true, output: `Disabled job "${job.name}"` };
}

export async function runCronNow(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  const job = jobs.get(params.jobId);
  if (!job) return { success: false, output: `Job ${params.jobId} not found` };
  const entry = await executeJob(job);
  return { success: entry.success, output: `Ran "${job.name}" in ${entry.duration}ms\n${entry.success ? "Success" : "Failed"}: ${entry.output || entry.error || ""}` };
}

export async function removeCronJob(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  const job = jobs.get(params.jobId);
  if (!job) return { success: false, output: `Job ${params.jobId} not found` };
  if (job.timer) clearInterval(job.timer);
  jobs.delete(params.jobId);
  return { success: true, output: `Removed job "${job.name}"` };
}

export async function listCronJobs(): Promise<{ success: boolean; output: string }> {
  const all = Array.from(jobs.values()).map(({ timer, ...j }) => j);
  if (!all.length) return { success: true, output: "No cron jobs registered" };
  return { success: true, output: all.map(j => `[${j.enabled ? "ON" : "OFF"}] ${j.id}: ${j.name}\n  Schedule: ${j.schedule} | Runs: ${j.runCount} | Last: ${j.lastRun || "never"}${j.lastError ? `\n  Last Error: ${j.lastError}` : ""}`).join("\n\n") };
}

export async function getCronLogs(params: { jobId?: string; limit?: number }): Promise<{ success: boolean; output: string }> {
  let results = cronLogs;
  if (params.jobId) results = results.filter(l => l.jobId === params.jobId);
  const limited = results.slice(-(params.limit || 50));
  if (!limited.length) return { success: true, output: "No cron logs" };
  return { success: true, output: limited.map(l => `[${l.success ? "OK" : "FAIL"}] ${l.jobId} @ ${l.startedAt} (${l.duration}ms)${l.error ? ` - ${l.error}` : ""}`).join("\n") };
}

export async function stopAllCronJobs(): Promise<{ success: boolean; output: string }> {
  let count = 0;
  for (const [, job] of jobs) { if (job.timer) { clearInterval(job.timer); count++; } }
  return { success: true, output: `Stopped ${count} cron timers` };
}

export const CRON_TOOLS = [
  { name: "register_cron_job", description: "Register a scheduled cron job. Schedule format: 'every 5m', 'every 1h', 'every 30s', '*/5 * * * *'", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Job name" }, schedule: { type: "string", description: "Schedule: 'every 5m', 'every 1h', '*/10 * * * *'" }, command: { type: "string", description: "Shell command to execute" }, enabled: { type: "boolean", description: "Start enabled (default true)" }, timeout: { type: "number", description: "Timeout in ms (default 60000)" } }, required: ["name", "schedule", "command"] as string[] } },
  { name: "enable_cron_job", description: "Enable a disabled cron job", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "disable_cron_job", description: "Disable (pause) a cron job", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "run_cron_now", description: "Manually trigger a cron job immediately", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "remove_cron_job", description: "Remove a cron job permanently", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "list_cron_jobs", description: "List all registered cron jobs with status", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_cron_logs", description: "Get execution history for cron jobs", input_schema: { type: "object" as const, properties: { jobId: { type: "string", description: "Filter by job ID" }, limit: { type: "number", description: "Max entries (default 50)" } }, required: [] as string[] } },
  { name: "stop_all_cron_jobs", description: "Stop all running cron timers", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];