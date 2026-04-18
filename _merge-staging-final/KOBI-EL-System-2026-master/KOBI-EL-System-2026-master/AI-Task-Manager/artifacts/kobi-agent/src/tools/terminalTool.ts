import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import treeKill from "tree-kill";

export interface TerminalResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed?: boolean;
}

const ROOT = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";
const DEFAULT_TIMEOUT = 60000;
const MAX_OUTPUT = 20000;

const BLOCKED_COMMANDS = [
  "rm -rf /", "rm -rf /*", "mkfs", "dd if=", ":(){", "fork",
  "chmod -R 777 /", "shutdown", "reboot", "halt", "init 0",
];

const runningProcesses = new Map<string, ChildProcess>();

export async function runCommand(params: {
  command: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}): Promise<TerminalResult> {
  if (BLOCKED_COMMANDS.some(b => params.command.includes(b))) {
    return { success: false, exitCode: -1, stdout: "", stderr: "Blocked command for safety", duration: 0 };
  }

  const startTime = Date.now();
  const cwd = params.cwd ? path.resolve(ROOT, params.cwd) : ROOT;
  const timeout = Math.min(params.timeout || DEFAULT_TIMEOUT, 120000);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const proc = spawn("bash", ["-c", params.command], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", ...params.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      killed = true;
      if (proc.pid) {
        treeKill(proc.pid, "SIGKILL");
      }
    }, timeout);

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.substring(0, MAX_OUTPUT) + "\n...[truncated]";
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.substring(0, MAX_OUTPUT) + "\n...[truncated]";
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        exitCode: code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTime,
        killed,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

export async function startBackground(params: {
  id: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}): Promise<{ success: boolean; pid?: number }> {
  if (BLOCKED_COMMANDS.some(b => params.command.includes(b))) {
    return { success: false };
  }

  const cwd = params.cwd ? path.resolve(ROOT, params.cwd) : ROOT;

  const proc = spawn("bash", ["-c", params.command], {
    cwd,
    env: { ...process.env, ...params.env },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  runningProcesses.set(params.id, proc);
  return { success: true, pid: proc.pid };
}

export async function stopBackground(params: { id: string }): Promise<{ success: boolean }> {
  const proc = runningProcesses.get(params.id);
  if (proc && proc.pid) {
    return new Promise((resolve) => {
      treeKill(proc.pid!, "SIGKILL", (err) => {
        runningProcesses.delete(params.id);
        resolve({ success: !err });
      });
    });
  }
  return { success: false };
}

export function stopAll() {
  for (const [id, proc] of runningProcesses) {
    if (proc.pid) {
      treeKill(proc.pid, "SIGKILL");
    }
  }
  runningProcesses.clear();
}

export const TERMINAL_TOOLS = [
  {
    name: "run_command",
    description: "Run a shell command. Returns stdout/stderr, exit code, and duration.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to run" },
        timeout: { type: "number", description: "Timeout in ms (default: 60000, max: 120000)" },
        cwd: { type: "string", description: "Working directory (relative to workspace)" },
      },
      required: ["command"],
    },
  },
  {
    name: "start_background",
    description: "Start a background process (e.g., dev server). Returns PID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Unique process identifier" },
        command: { type: "string", description: "Shell command to run" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["id", "command"],
    },
  },
  {
    name: "stop_background",
    description: "Stop a running background process by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Process identifier to stop" },
      },
      required: ["id"],
    },
  },
];