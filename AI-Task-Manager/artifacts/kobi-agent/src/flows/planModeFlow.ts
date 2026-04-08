import { callLLM } from "../llm/client";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "modified" | "completed";
  estimatedTokens: number;
  dependencies: string[];
  reason?: string;
}

export interface Plan {
  id: string;
  task: string;
  status: "draft" | "approved" | "executing" | "completed" | "failed";
  tasks: PlanTask[];
  questions: string[];
  createdAt: Date;
  updatedAt: Date;
}

let currentPlan: Plan | null = null;

export async function createPlan(params: { task: string }): Promise<{ success: boolean; output: string; plan?: Plan }> {
  console.log("\n📝 יוצר תוכנית...");

  const response = await callLLM({
    system: `You are a project planner. Break down the task into subtasks. Return JSON:
{
  "tasks": [{ "id": "t1", "title": "...", "description": "...", "estimatedTokens": 5000, "dependencies": [] }],
  "questions": ["any clarifying questions"]
}`,
    messages: [{ role: "user", content: `Plan this task: ${params.task}` }],
    maxTokens: 4000,
  });

  let parsed: any = { tasks: [], questions: [] };
  try {
    const text = typeof response.content === "string" ? response.content :
      Array.isArray(response.content) ? response.content.map((b: any) => b.text || "").join("") : String(response.content);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {}

  currentPlan = {
    id: `plan-${Date.now()}`,
    task: params.task,
    status: "draft",
    tasks: (parsed.tasks || []).map((t: any) => ({
      ...t,
      status: "pending" as const,
    })),
    questions: parsed.questions || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const lines = [
    `📝 תוכנית: ${currentPlan.task}`,
    `  סטטוס: ${currentPlan.status}`,
    `  משימות: ${currentPlan.tasks.length}`,
    ...currentPlan.tasks.map((t, i) => `    ${i + 1}. ${t.title} (~${t.estimatedTokens} tokens)`),
  ];
  if (currentPlan.questions.length > 0) {
    lines.push(`  שאלות:`);
    currentPlan.questions.forEach((q) => lines.push(`    ❓ ${q}`));
  }

  return { success: true, output: lines.join("\n"), plan: currentPlan };
}

export async function getPlan(params: {}): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "❌ אין תוכנית פעילה" };

  const lines = [
    `📝 תוכנית: ${currentPlan.task}`,
    `  סטטוס: ${currentPlan.status}`,
    `  משימות:`,
    ...currentPlan.tasks.map((t) => {
      const icon = t.status === "approved" ? "✅" : t.status === "rejected" ? "❌" : t.status === "completed" ? "✔️" : "⏳";
      return `    ${icon} ${t.id}: ${t.title} [${t.status}]`;
    }),
  ];

  return { success: true, output: lines.join("\n") };
}

export async function approvePlanTask(params: { taskId?: string }): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "❌ אין תוכנית פעילה" };

  if (params.taskId) {
    const task = currentPlan.tasks.find((t) => t.id === params.taskId);
    if (!task) return { success: false, output: `❌ משימה ${params.taskId} לא נמצאה` };
    task.status = "approved";
    return { success: true, output: `✅ משימה ${params.taskId} אושרה` };
  }

  currentPlan.tasks.forEach((t) => { if (t.status === "pending") t.status = "approved"; });
  currentPlan.status = "approved";
  return { success: true, output: `✅ כל המשימות אושרו — תוכנית מוכנה לביצוע` };
}

export async function rejectPlanTask(params: { taskId: string; reason?: string }): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "❌ אין תוכנית פעילה" };
  const task = currentPlan.tasks.find((t) => t.id === params.taskId);
  if (!task) return { success: false, output: `❌ משימה ${params.taskId} לא נמצאה` };
  task.status = "rejected";
  task.reason = params.reason;
  return { success: true, output: `❌ משימה ${params.taskId} נדחתה${params.reason ? `: ${params.reason}` : ""}` };
}

export async function modifyPlanTask(params: { taskId: string; changes: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "❌ אין תוכנית פעילה" };
  const task = currentPlan.tasks.find((t) => t.id === params.taskId);
  if (!task) return { success: false, output: `❌ משימה ${params.taskId} לא נמצאה` };
  Object.assign(task, params.changes, { status: "modified" });
  return { success: true, output: `✏️ משימה ${params.taskId} עודכנה` };
}

export const PLAN_MODE_TOOLS = [
  {
    name: "create_plan",
    description: "יצירת תוכנית עבודה — פירוק משימה למשימות משנה עם הערכות",
    input_schema: {
      type: "object" as const,
      properties: { task: { type: "string" as const, description: "תיאור המשימה" } },
      required: ["task"] as string[],
    },
  },
  {
    name: "get_plan",
    description: "הצגת תוכנית העבודה הנוכחית",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "approve_plan_task",
    description: "אישור משימה בתוכנית (או כל המשימות)",
    input_schema: {
      type: "object" as const,
      properties: { taskId: { type: "string" as const, description: "ID משימה (ריק = אישור הכל)" } },
      required: [] as string[],
    },
  },
  {
    name: "reject_plan_task",
    description: "דחיית משימה בתוכנית",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        reason: { type: "string" as const },
      },
      required: ["taskId"] as string[],
    },
  },
  {
    name: "modify_plan_task",
    description: "עדכון משימה בתוכנית",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        changes: { type: "object" as const },
      },
      required: ["taskId", "changes"] as string[],
    },
  },
];
