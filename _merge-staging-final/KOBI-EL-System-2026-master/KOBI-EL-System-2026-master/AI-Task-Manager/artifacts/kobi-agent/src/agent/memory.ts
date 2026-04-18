import * as fs from "fs";
import * as path from "path";
import { pool } from "@workspace/db";

export interface FileInfo {
  path: string;
  language: string;
  size: number;
  lastModified: Date;
  summary?: string;
}

export interface StepResult {
  stepId: number | string;
  type?: string;
  action?: string;
  description?: string;
  status: "success" | "failed" | "skipped" | "pending" | "running" | "completed";
  output?: string;
  result?: any;
  error?: string;
  duration?: number;
  filesChanged?: string[];
  startTime?: number;
  endTime?: number;
}

export interface TaskMemory {
  taskId: string;
  task: string;
  plan: any;
  currentStep: number;
  stepResults: StepResult[];
  projectFiles: Map<string, FileInfo>;
  errors: Array<{ step: number; error: string; fix?: string }>;
  conversationHistory: Array<{ role: string; content: string }>;
  startTime: Date;
  status: "planning" | "executing" | "fixing" | "verifying" | "completed" | "failed";
}

export interface AgentContext {
  sessionId: string;
  taskId: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  steps: StepResult[];
  currentStep: number;
  status: "planning" | "executing" | "fixing" | "completed" | "failed";
  startTime: number;
  metadata: Record<string, any>;
}

export class AgentMemory {
  private tasks: Map<string, TaskMemory> = new Map();
  private globalContext: {
    projectType?: string;
    framework?: string;
    language?: string;
    packageManager?: string;
    structure: string[];
  } = { structure: [] };

  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  createTask(taskId: string, task: string): TaskMemory {
    const memory: TaskMemory = {
      taskId,
      task,
      plan: null,
      currentStep: 0,
      stepResults: [],
      projectFiles: new Map(),
      errors: [],
      conversationHistory: [],
      startTime: new Date(),
      status: "planning",
    };
    this.tasks.set(taskId, memory);
    return memory;
  }

  getTask(taskId: string): TaskMemory | undefined {
    return this.tasks.get(taskId);
  }

  updateTaskStatus(taskId: string, status: TaskMemory["status"]) {
    const task = this.tasks.get(taskId);
    if (task) task.status = status;
  }

  addStepResult(taskId: string, result: StepResult) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stepResults.push(result);
      task.currentStep = Number(result.stepId) + 1;
    }
  }

  addError(taskId: string, step: number, error: string, fix?: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.errors.push({ step, error, fix });
    }
  }

  scanWorkspace(): FileInfo[] {
    const files: FileInfo[] = [];
    const scan = (dir: string, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "__pycache__") continue;

          if (entry.isDirectory()) {
            scan(fullPath, depth + 1);
          } else {
            const ext = path.extname(entry.name).slice(1);
            const stat = fs.statSync(fullPath);
            const info: FileInfo = {
              path: path.relative(this.workspaceDir, fullPath),
              language: this.detectLanguage(ext),
              size: stat.size,
              lastModified: stat.mtime,
            };
            files.push(info);
          }
        }
      } catch {}
    };
    scan(this.workspaceDir);
    return files;
  }

  getProjectContext(): string {
    const files = this.scanWorkspace();
    const structure = files.map((f) => `  ${f.path} (${f.language}, ${f.size}b)`).join("\n");

    let context = `Project Directory: ${this.workspaceDir}\n`;
    context += `Files (${files.length}):\n${structure}\n`;

    const hasPackageJson = files.some((f) => f.path === "package.json");
    const hasRequirements = files.some((f) => f.path === "requirements.txt");
    const hasCargo = files.some((f) => f.path === "Cargo.toml");
    const hasGoMod = files.some((f) => f.path === "go.mod");

    if (hasPackageJson) {
      context += `\nProject Type: Node.js/JavaScript\n`;
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(this.workspaceDir, "package.json"), "utf-8")
        );
        context += `Package: ${pkg.name || "unnamed"}\n`;
        context += `Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}\n`;
        context += `DevDeps: ${Object.keys(pkg.devDependencies || {}).join(", ")}\n`;
        if (pkg.scripts) {
          context += `Scripts: ${Object.keys(pkg.scripts).join(", ")}\n`;
        }
      } catch {}
    } else if (hasRequirements) {
      context += `\nProject Type: Python\n`;
    } else if (hasCargo) {
      context += `\nProject Type: Rust\n`;
    } else if (hasGoMod) {
      context += `\nProject Type: Go\n`;
    }

    return context;
  }

  getTaskSummary(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) return "No task found";

    const completed = task.stepResults.filter((r) => r.status === "success").length;
    const failed = task.stepResults.filter((r) => r.status === "failed").length;
    const total = task.plan?.steps?.length || 0;

    return `Task: ${task.task}
Status: ${task.status}
Progress: ${completed}/${total} steps (${failed} failed)
Errors: ${task.errors.length}
Duration: ${(Date.now() - task.startTime.getTime()) / 1000}s`;
  }

  private detectLanguage(ext: string): string {
    const map: Record<string, string> = {
      ts: "typescript", tsx: "typescript-react", js: "javascript",
      jsx: "javascript-react", py: "python", rs: "rust", go: "go",
      java: "java", cpp: "cpp", c: "c", cs: "csharp", rb: "ruby",
      php: "php", swift: "swift", kt: "kotlin", sql: "sql",
      html: "html", css: "css", scss: "scss", json: "json",
      yaml: "yaml", yml: "yaml", md: "markdown", sh: "shell",
      bash: "shell", dockerfile: "dockerfile", toml: "toml",
      xml: "xml", svg: "svg", graphql: "graphql", prisma: "prisma",
    };
    return map[ext.toLowerCase()] || ext || "unknown";
  }
}

const sessions = new Map<string, AgentContext>();

export function createSession(taskId: string): AgentContext {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ctx: AgentContext = {
    sessionId,
    taskId,
    messages: [],
    steps: [],
    currentStep: 0,
    status: "planning",
    startTime: Date.now(),
    metadata: {},
  };
  sessions.set(sessionId, ctx);
  return ctx;
}

export function getSession(sessionId: string): AgentContext | undefined {
  return sessions.get(sessionId);
}

export function updateSession(sessionId: string, updates: Partial<AgentContext>): void {
  const ctx = sessions.get(sessionId);
  if (ctx) Object.assign(ctx, updates);
}

export function addMessage(sessionId: string, role: string, content: string): void {
  const ctx = sessions.get(sessionId);
  if (ctx) ctx.messages.push({ role, content, timestamp: Date.now() });
}

export function addStepResult(sessionId: string, step: StepResult): void {
  const ctx = sessions.get(sessionId);
  if (ctx) ctx.steps.push(step);
}

export function listSessions(): AgentContext[] {
  return Array.from(sessions.values()).sort((a, b) => b.startTime - a.startTime);
}

export async function saveSessionToDB(ctx: AgentContext): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO kobi_sessions (session_id, task_description, status, steps_total, steps_completed, steps_failed, duration_ms, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         status = $3, steps_completed = $5, steps_failed = $6, duration_ms = $7, updated_at = NOW()`,
      [
        ctx.sessionId,
        ctx.messages[0]?.content || ctx.taskId,
        ctx.status,
        ctx.steps.length,
        ctx.steps.filter(s => s.status === "completed" || s.status === "success").length,
        ctx.steps.filter(s => s.status === "failed").length,
        Date.now() - ctx.startTime,
      ]
    );
  } catch {}
}

export async function loadMemory(key: string): Promise<string | null> {
  try {
    const r = await pool.query("SELECT value FROM kobi_memory WHERE key = $1 LIMIT 1", [key]);
    return r.rows[0]?.value || null;
  } catch { return null; }
}

export async function saveMemory(key: string, value: string, category?: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO kobi_memory (user_id, category, key, value, importance, created_at, updated_at)
       VALUES (1, $1, $2, $3, 5, NOW(), NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [category || "general", key, value]
    );
  } catch {}
}