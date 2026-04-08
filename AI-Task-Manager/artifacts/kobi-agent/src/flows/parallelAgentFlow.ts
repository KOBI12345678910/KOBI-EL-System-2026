import { v4 as uuidv4 } from "uuid";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { executeStep, type StepDef, type ExecutionResult } from "../agent/executor";
import { AgentMemory } from "../agent/memory";
import { broadcast } from "../ws/socket";

export type TaskStatus = "draft" | "queued" | "active" | "review" | "ready" | "merged" | "failed";

export interface ParallelTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  agentId: string;
  steps: StepDef[];
  currentStep: number;
  progress: number;
  output: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  dependsOn: string[];
  filesChanged: string[];
}

export interface KanbanBoard {
  columns: Record<TaskStatus, ParallelTask[]>;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
}

const tasksMap = new Map<string, ParallelTask>();
let runningCount = 0;
const MAX_PARALLEL = 4;
const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

function notifyTask(task: ParallelTask) {
  broadcast({ type: "parallel-task", taskId: task.id, status: task.status, progress: task.progress, title: task.title });
}

function getReadyTasks(): ParallelTask[] {
  return Array.from(tasksMap.values()).filter(task => {
    if (task.status !== "queued") return false;
    return task.dependsOn.every(depId => {
      const dep = tasksMap.get(depId);
      return dep && (dep.status === "ready" || dep.status === "merged");
    });
  });
}

function hasUnfinished(): boolean {
  return Array.from(tasksMap.values()).some(t => t.status === "queued" || t.status === "active");
}

async function executeTask(task: ParallelTask): Promise<void> {
  task.status = "active";
  task.startedAt = new Date();
  runningCount++;
  notifyTask(task);

  console.log(`  🏃 [${task.id}] Started: ${task.title}`);

  try {
    for (let i = 0; i < task.steps.length; i++) {
      task.currentStep = i + 1;
      task.progress = Math.round(((i + 1) / task.steps.length) * 100);
      notifyTask(task);

      const result = await executeStep(task.steps[i]);
      task.output += (result.output || "") + "\n";
      if (result.filesChanged) task.filesChanged.push(...result.filesChanged);

      if (!result.success) {
        const retry = await executeStep(task.steps[i]);
        if (!retry.success) {
          throw new Error(result.error || "Step failed");
        }
        task.output += (retry.output || "") + "\n";
        if (retry.filesChanged) task.filesChanged.push(...retry.filesChanged);
      }
    }

    task.status = "ready";
    task.progress = 100;
    console.log(`  ✅ [${task.id}] Complete: ${task.title}`);
  } catch (err: any) {
    task.status = "failed";
    task.error = err.message;
    console.log(`  ❌ [${task.id}] Failed: ${err.message}`);
  }

  task.completedAt = new Date();
  runningCount--;
  notifyTask(task);
}

export async function splitAndExecute(params: {
  task: string;
  maxParallel?: number;
}): Promise<{ success: boolean; output: string; board?: KanbanBoard; tasks?: ParallelTask[] }> {
  const log = console.log;
  const maxP = params.maxParallel || MAX_PARALLEL;

  log("\n🔀 Splitting task into parallel work items...");

  const memory = new AgentMemory(WORKSPACE);
  const context = memory.getProjectContext();

  const response = await callLLM({
    system: `You are a project manager. Break this task into independent sub-tasks that can run in parallel.
Each sub-task should be independently executable with minimal dependencies.

Respond with JSON:
{
  "tasks": [
    {
      "title": "short title",
      "description": "detailed description",
      "category": "backend|frontend|database|auth|design|config|test",
      "dependsOn": [],
      "priority": 1,
      "steps": [
        { "id": 1, "type": "create_file", "description": "what to do", "details": {}, "dependsOn": [], "validation": "" }
      ]
    }
  ],
  "executionStrategy": "description"
}`,
    messages: [{ role: "user", content: `Project:\n${context}\n\nTask: ${params.task}` }],
    maxTokens: 8192,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed?.tasks) return { success: false, output: "Failed to split task into parallel items" };

  const parallelTasks: ParallelTask[] = [];
  for (const t of parsed.tasks) {
    const id = uuidv4().slice(0, 8);
    const pt: ParallelTask = {
      id,
      title: t.title,
      description: t.description,
      status: "queued",
      agentId: `agent_${t.category || "general"}`,
      steps: (t.steps || []).map((s: any, i: number) => ({
        id: i + 1,
        type: s.type || "run_command",
        description: s.description || "",
        details: s.details || {},
        dependsOn: s.dependsOn || [],
        validation: s.validation || "",
      })),
      currentStep: 0,
      progress: 0,
      output: "",
      dependsOn: t.dependsOn || [],
      filesChanged: [],
    };
    tasksMap.set(id, pt);
    parallelTasks.push(pt);
  }

  log(`  Split into ${parallelTasks.length} parallel tasks`);
  log("\n⚡ Executing parallel tasks...");

  while (hasUnfinished()) {
    const ready = getReadyTasks();
    if (ready.length === 0) {
      if (runningCount === 0) break;
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const toStart = ready.slice(0, maxP - runningCount);
    const promises = toStart.map(t => executeTask(t));
    await Promise.race([
      Promise.all(promises),
      new Promise(r => setTimeout(r, 5000)),
    ]);
  }

  const board = getKanbanBoard();
  const allTasks = Array.from(tasksMap.values());
  const completed = allTasks.filter(t => t.status === "ready" || t.status === "merged").length;
  const failedCount = allTasks.filter(t => t.status === "failed").length;

  const summary = [
    `## Parallel Execution Report`,
    ``,
    `**Total**: ${allTasks.length} | **Completed**: ${completed} | **Failed**: ${failedCount}`,
    ``,
    ...allTasks.map(t => {
      const icon = t.status === "ready" ? "✅" : t.status === "failed" ? "❌" : "⏳";
      const dur = t.startedAt && t.completedAt ? `${((t.completedAt.getTime() - t.startedAt.getTime()) / 1000).toFixed(1)}s` : "-";
      return `${icon} **${t.title}** (${t.status}) — ${dur}`;
    }),
  ];

  return { success: failedCount === 0, output: summary.join("\n"), board, tasks: allTasks };
}

export async function addParallelTask(params: {
  title: string;
  description: string;
  agentId?: string;
  dependsOn?: string[];
  steps?: any[];
}): Promise<{ success: boolean; output: string; task?: ParallelTask }> {
  const id = uuidv4().slice(0, 8);
  const pt: ParallelTask = {
    id,
    title: params.title,
    description: params.description,
    status: "draft",
    agentId: params.agentId || "agent_general",
    steps: (params.steps || []).map((s: any, i: number) => ({
      id: i + 1,
      type: s.type || "run_command",
      description: s.description || "",
      details: s.details || {},
      dependsOn: [],
      validation: "",
    })),
    currentStep: 0,
    progress: 0,
    output: "",
    dependsOn: params.dependsOn || [],
    filesChanged: [],
  };
  tasksMap.set(id, pt);
  notifyTask(pt);
  return { success: true, output: `Task ${id} added: ${params.title}`, task: pt };
}

export async function moveParallelTask(params: {
  taskId: string;
  newStatus: string;
}): Promise<{ success: boolean; output: string }> {
  const task = tasksMap.get(params.taskId);
  if (!task) return { success: false, output: `Task ${params.taskId} not found` };
  task.status = params.newStatus as TaskStatus;
  notifyTask(task);
  return { success: true, output: `Task ${params.taskId} moved to ${params.newStatus}` };
}

export async function mergeParallelTasks(params: {}): Promise<{ success: boolean; output: string; conflicts?: string[] }> {
  console.log("\n🔀 Merging completed tasks...");
  const conflicts: string[] = [];

  const fileMap = new Map<string, string[]>();
  for (const [, task] of tasksMap) {
    if (task.status !== "ready") continue;
    for (const file of task.filesChanged) {
      if (!fileMap.has(file)) fileMap.set(file, []);
      fileMap.get(file)!.push(task.id);
    }
  }

  for (const [file, taskIds] of fileMap) {
    if (taskIds.length > 1) {
      conflicts.push(`${file} modified by tasks: ${taskIds.join(", ")}`);
    }
  }

  if (conflicts.length > 0) {
    console.log(`  ⚠️ ${conflicts.length} file conflicts detected`);
  }

  for (const [, task] of tasksMap) {
    if (task.status === "ready") {
      task.status = "merged";
      notifyTask(task);
    }
  }

  return { success: conflicts.length === 0, output: `Merged. ${conflicts.length} conflicts.`, conflicts };
}

function getKanbanBoard(): KanbanBoard {
  const columns: Record<TaskStatus, ParallelTask[]> = {
    draft: [], queued: [], active: [], review: [], ready: [], merged: [], failed: [],
  };
  for (const [, task] of tasksMap) {
    columns[task.status].push(task);
  }
  return {
    columns,
    totalTasks: tasksMap.size,
    activeTasks: columns.active.length,
    completedTasks: columns.ready.length + columns.merged.length,
  };
}

export async function getParallelBoard(params: {}): Promise<{ success: boolean; output: string; board?: KanbanBoard }> {
  const board = getKanbanBoard();
  const lines = [
    `## Kanban Board`,
    ``,
    `**Total**: ${board.totalTasks} | **Active**: ${board.activeTasks} | **Completed**: ${board.completedTasks}`,
    ``,
    ...Object.entries(board.columns)
      .filter(([, tasks]) => tasks.length > 0)
      .map(([status, tasks]) => {
        const header = `### ${status.toUpperCase()} (${tasks.length})`;
        const items = tasks.map(t => `- **${t.title}** [${t.id}] ${t.progress}%`);
        return [header, ...items].join("\n");
      }),
  ];
  return { success: true, output: lines.join("\n"), board };
}

export async function getParallelTask(params: { taskId: string }): Promise<{ success: boolean; output: string; task?: ParallelTask }> {
  const task = tasksMap.get(params.taskId);
  if (!task) return { success: false, output: `Task ${params.taskId} not found` };

  const lines = [
    `## Task: ${task.title}`,
    `**ID**: ${task.id}`,
    `**Status**: ${task.status}`,
    `**Progress**: ${task.progress}%`,
    `**Agent**: ${task.agentId}`,
    task.error ? `**Error**: ${task.error}` : "",
    `**Files Changed**: ${task.filesChanged.length}`,
    `**Steps**: ${task.currentStep}/${task.steps.length}`,
  ].filter(Boolean);

  return { success: true, output: lines.join("\n"), task };
}

export const PARALLEL_AGENT_TOOLS = [
  {
    name: "split_and_execute_parallel",
    description: "פיצול משימה לתתי-משימות מקביליות — AI מחלק, מריץ במקביל עם dependency management",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "המשימה לפיצול" },
        maxParallel: { type: "number", description: "מקסימום משימות מקביליות (ברירת מחדל: 4)" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "add_parallel_task",
    description: "הוספת משימה ידנית ללוח Kanban",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        agentId: { type: "string" },
        dependsOn: { type: "array", items: { type: "string" } },
      },
      required: ["title", "description"] as string[],
    },
  },
  {
    name: "move_parallel_task",
    description: "העברת משימה בלוח Kanban — draft/queued/active/review/ready/merged/failed",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" },
        newStatus: { type: "string" },
      },
      required: ["taskId", "newStatus"] as string[],
    },
  },
  {
    name: "merge_parallel_tasks",
    description: "מיזוג כל המשימות שהושלמו — בדיקת קונפליקטים בקבצים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_parallel_board",
    description: "הצגת לוח Kanban — כל המשימות לפי סטטוס",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_parallel_task_detail",
    description: "פרטי משימה מקבילית ספציפית",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"] as string[],
    },
  },
];
