import { v4 as uuidv4 } from "uuid";

export interface QueuedTask {
  id: string;
  task: string;
  context?: string;
  priority: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
  dependsOn?: string[];
}

const queue: QueuedTask[] = [];

export async function addTask(params: { task: string; context?: string; priority?: number; dependsOn?: string[] }): Promise<{ success: boolean; output: string; taskId?: string }> {
  const id = uuidv4();
  const queuedTask: QueuedTask = {
    id,
    task: params.task,
    context: params.context,
    priority: params.priority || 0,
    status: "queued",
    createdAt: new Date().toISOString(),
    dependsOn: params.dependsOn,
  };
  queue.push(queuedTask);
  queue.sort((a, b) => b.priority - a.priority);
  return { success: true, output: `Task added: ${id} (priority: ${queuedTask.priority})`, taskId: id };
}

export async function cancelTask(params: { task_id: string }): Promise<{ success: boolean; output: string }> {
  const task = queue.find(t => t.id === params.task_id);
  if (!task) return { success: false, output: `Task not found: ${params.task_id}` };
  if (task.status !== "queued") return { success: false, output: `Task ${params.task_id} is ${task.status}, cannot cancel` };
  task.status = "cancelled";
  return { success: true, output: `Task ${params.task_id} cancelled` };
}

export async function getTaskStatus(params: { task_id: string }): Promise<{ success: boolean; output: string; task?: QueuedTask }> {
  const task = queue.find(t => t.id === params.task_id);
  if (!task) return { success: false, output: `Task not found: ${params.task_id}` };
  return { success: true, output: `${task.id}: ${task.status} - ${task.task}`, task };
}

export async function listTasks(params: { status?: string } = {}): Promise<{ success: boolean; output: string; tasks?: QueuedTask[] }> {
  const filtered = params.status ? queue.filter(t => t.status === params.status) : queue;
  if (filtered.length === 0) return { success: true, output: "No tasks in queue", tasks: [] };
  const lines = filtered.map(t => `[${t.status}] ${t.id}: ${t.task} (priority: ${t.priority})`);
  return { success: true, output: lines.join("\n"), tasks: filtered };
}

export async function getQueueStats(): Promise<{ success: boolean; output: string; stats?: any }> {
  const stats = {
    total: queue.length,
    queued: queue.filter(t => t.status === "queued").length,
    running: queue.filter(t => t.status === "running").length,
    completed: queue.filter(t => t.status === "completed").length,
    failed: queue.filter(t => t.status === "failed").length,
    cancelled: queue.filter(t => t.status === "cancelled").length,
  };
  return { success: true, output: `Total: ${stats.total} | Queued: ${stats.queued} | Running: ${stats.running} | Completed: ${stats.completed} | Failed: ${stats.failed} | Cancelled: ${stats.cancelled}`, stats };
}

export async function clearQueue(): Promise<{ success: boolean; output: string }> {
  const before = queue.length;
  const running = queue.filter(t => t.status === "running");
  queue.length = 0;
  queue.push(...running);
  return { success: true, output: `Cleared ${before - running.length} tasks (kept ${running.length} running)` };
}

export function getNextTask(): QueuedTask | null {
  return queue.find(t => {
    if (t.status !== "queued") return false;
    if (t.dependsOn?.length) {
      return t.dependsOn.every(depId => {
        const dep = queue.find(q => q.id === depId);
        return dep && dep.status === "completed";
      });
    }
    return true;
  }) || null;
}

export function updateTaskStatus(taskId: string, status: QueuedTask["status"], result?: any, error?: string): void {
  const task = queue.find(t => t.id === taskId);
  if (!task) return;
  task.status = status;
  if (status === "running") task.startedAt = new Date().toISOString();
  if (status === "completed" || status === "failed") task.completedAt = new Date().toISOString();
  if (result !== undefined) task.result = result;
  if (error) task.error = error;
}

export const TASK_QUEUE_TOOLS = [
  { name: "add_task", description: "Add a task to the queue with optional priority and dependencies", input_schema: { type: "object" as const, properties: { task: { type: "string" }, context: { type: "string" }, priority: { type: "number" }, dependsOn: { type: "array", items: { type: "string" } } }, required: ["task"] as string[] } },
  { name: "cancel_task", description: "Cancel a queued task by ID", input_schema: { type: "object" as const, properties: { task_id: { type: "string" } }, required: ["task_id"] as string[] } },
  { name: "get_task_status", description: "Get the status of a specific task", input_schema: { type: "object" as const, properties: { task_id: { type: "string" } }, required: ["task_id"] as string[] } },
  { name: "list_tasks", description: "List all tasks in the queue, optionally filtered by status", input_schema: { type: "object" as const, properties: { status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] } }, required: [] as string[] } },
  { name: "get_queue_stats", description: "Get statistics about the task queue", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "clear_queue", description: "Clear all non-running tasks from the queue", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];