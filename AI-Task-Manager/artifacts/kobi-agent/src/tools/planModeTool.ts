import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

export interface PlanTask {
  id: number;
  title: string;
  description: string;
  type: "backend" | "frontend" | "database" | "auth" | "design" | "config" | "test" | "deploy";
  status: "pending" | "approved" | "rejected" | "modified" | "completed";
  estimatedMinutes: number;
  dependencies: number[];
  subtasks?: string[];
  userNotes?: string;
}

export interface Plan {
  id: string;
  title: string;
  overview: string;
  tasks: PlanTask[];
  questions: string[];
  assumptions: string[];
  techStack: string[];
  estimatedTotal: string;
  status: "drafting" | "reviewing" | "approved" | "executing" | "completed";
  createdAt: Date;
}

let currentPlan: Plan | null = null;

export async function createPlan(params: {
  task: string;
  context?: string;
}): Promise<{ success: boolean; output: string; plan: Plan | null }> {
  console.log("\n📋 יוצר תוכנית...");

  const response = await callLLM({
    system: `You are a project planner. Create a detailed, interactive plan.
DO NOT start building yet. Only plan.

Rules:
- Break into ordered tasks with clear descriptions
- Identify dependencies between tasks
- Estimate time per task
- List assumptions you're making
- Ask clarifying questions if anything is ambiguous
- Suggest the tech stack

Respond with JSON:
{
  "title": "project title",
  "overview": "2-3 sentence summary",
  "tasks": [
    {
      "id": 1,
      "title": "short title",
      "description": "detailed description",
      "type": "backend|frontend|database|auth|design|config|test|deploy",
      "estimatedMinutes": 5,
      "dependencies": [],
      "subtasks": ["sub-step 1", "sub-step 2"]
    }
  ],
  "questions": ["clarifying questions for the user"],
  "assumptions": ["things you're assuming"],
  "techStack": ["React", "TypeScript", "PostgreSQL"],
  "estimatedTotal": "~30 minutes"
}`,
    messages: [{
      role: "user",
      content: `${params.context ? `Project context:\n${params.context}\n\n` : ""}Task: ${params.task}`,
    }],
    maxTokens: 4096,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed) return { success: false, output: "נכשל ביצירת תוכנית", plan: null };

  const plan: Plan = {
    id: `plan_${Date.now()}`,
    title: parsed.title,
    overview: parsed.overview,
    tasks: (parsed.tasks || []).map((t: any) => ({ ...t, status: "pending" as const })),
    questions: parsed.questions || [],
    assumptions: parsed.assumptions || [],
    techStack: parsed.techStack || [],
    estimatedTotal: parsed.estimatedTotal || "לא ידוע",
    status: "reviewing",
    createdAt: new Date(),
  };

  currentPlan = plan;

  const lines = [
    `📋 תוכנית: ${plan.title}`,
    `סקירה: ${plan.overview}`,
    `\nמשימות (${plan.tasks.length}):`,
    ...plan.tasks.map(t => `  ${t.id}. [${t.type}] ${t.title} (~${t.estimatedMinutes} דק')${t.dependencies.length ? ` ← תלוי ב: ${t.dependencies.join(",")}` : ""}`),
    `\nזמן משוער: ${plan.estimatedTotal}`,
    `טכנולוגיות: ${plan.techStack.join(", ")}`,
  ];
  if (plan.questions.length > 0) lines.push(`\nשאלות: ${plan.questions.join(" | ")}`);
  if (plan.assumptions.length > 0) lines.push(`הנחות: ${plan.assumptions.join(" | ")}`);

  return { success: true, output: lines.join("\n"), plan };
}

export async function approvePlanTask(params: {
  taskId: number;
}): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה" };
  const task = currentPlan.tasks.find(t => t.id === params.taskId);
  if (!task) return { success: false, output: `משימה ${params.taskId} לא נמצאה` };
  task.status = "approved";
  return { success: true, output: `משימה ${params.taskId} (${task.title}) אושרה ✅` };
}

export async function rejectPlanTask(params: {
  taskId: number;
  reason?: string;
}): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה" };
  const task = currentPlan.tasks.find(t => t.id === params.taskId);
  if (!task) return { success: false, output: `משימה ${params.taskId} לא נמצאה` };
  task.status = "rejected";
  if (params.reason) task.userNotes = params.reason;
  return { success: true, output: `משימה ${params.taskId} (${task.title}) נדחתה ❌${params.reason ? ` — ${params.reason}` : ""}` };
}

export async function modifyPlanTask(params: {
  taskId: number;
  title?: string;
  description?: string;
  estimatedMinutes?: number;
}): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה" };
  const task = currentPlan.tasks.find(t => t.id === params.taskId);
  if (!task) return { success: false, output: `משימה ${params.taskId} לא נמצאה` };
  if (params.title) task.title = params.title;
  if (params.description) task.description = params.description;
  if (params.estimatedMinutes) task.estimatedMinutes = params.estimatedMinutes;
  task.status = "modified";
  return { success: true, output: `משימה ${params.taskId} עודכנה ✏️: ${task.title}` };
}

export async function approveAllPlanTasks(params: {}): Promise<{ success: boolean; output: string }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה" };
  let count = 0;
  for (const task of currentPlan.tasks) {
    if (task.status === "pending") { task.status = "approved"; count++; }
  }
  currentPlan.status = "approved";
  return { success: true, output: `אושרו ${count} משימות. התוכנית מוכנה לביצוע! 🚀` };
}

export async function getPlan(params: {}): Promise<{ success: boolean; output: string; plan: Plan | null }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה", plan: null };

  const statusIcons: Record<string, string> = { pending: "⏳", approved: "✅", rejected: "❌", modified: "✏️", completed: "🏁" };
  const lines = [
    `📋 ${currentPlan.title} [${currentPlan.status}]`,
    `${currentPlan.overview}`,
    `\nמשימות:`,
    ...currentPlan.tasks.map(t => `  ${statusIcons[t.status]} ${t.id}. ${t.title} (~${t.estimatedMinutes} דק')`),
    `\nזמן משוער: ${currentPlan.estimatedTotal}`,
    `מוכן לביצוע: ${currentPlan.tasks.every(t => t.status !== "pending") && currentPlan.tasks.length > 0 ? "כן ✅" : "לא — יש משימות בהמתנה"}`,
  ];

  return { success: true, output: lines.join("\n"), plan: currentPlan };
}

export async function getApprovedTasks(params: {}): Promise<{ success: boolean; output: string; tasks: PlanTask[] }> {
  if (!currentPlan) return { success: false, output: "אין תוכנית פעילה", tasks: [] };
  const approved = currentPlan.tasks.filter(t => t.status === "approved" || t.status === "modified");
  const lines = approved.map(t => `${t.id}. [${t.type}] ${t.title} (~${t.estimatedMinutes} דק')`);
  return {
    success: true,
    output: approved.length > 0 ? `משימות מאושרות (${approved.length}):\n${lines.join("\n")}` : "אין משימות מאושרות",
    tasks: approved,
  };
}

export const PLAN_MODE_TOOLS = [
  {
    name: "create_plan",
    description: "יצירת תוכנית פרויקט מפורטת — משימות, תלויות, הערכות זמן, שאלות",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "תיאור הפרויקט/משימה" },
        context: { type: "string", description: "הקשר נוסף (אופציונלי)" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "approve_plan_task",
    description: "אישור משימה בתוכנית",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "number", description: "מזהה המשימה" },
      },
      required: ["taskId"] as string[],
    },
  },
  {
    name: "reject_plan_task",
    description: "דחיית משימה בתוכנית (עם סיבה אופציונלית)",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "number", description: "מזהה המשימה" },
        reason: { type: "string", description: "סיבת הדחייה" },
      },
      required: ["taskId"] as string[],
    },
  },
  {
    name: "modify_plan_task",
    description: "עדכון משימה בתוכנית — שינוי כותרת, תיאור, או הערכת זמן",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "number", description: "מזהה המשימה" },
        title: { type: "string", description: "כותרת חדשה" },
        description: { type: "string", description: "תיאור חדש" },
        estimatedMinutes: { type: "number", description: "הערכת זמן חדשה" },
      },
      required: ["taskId"] as string[],
    },
  },
  {
    name: "approve_all_plan_tasks",
    description: "אישור כל המשימות בתוכנית בבת אחת",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_plan",
    description: "הצגת התוכנית הנוכחית עם סטטוס כל משימה",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_approved_tasks",
    description: "רשימת משימות מאושרות — מוכנות לביצוע",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
