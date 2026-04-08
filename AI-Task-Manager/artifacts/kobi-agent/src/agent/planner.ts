import { callLLM } from "../llm/client";
import { PLANNER_PROMPT } from "../llm/prompts";
import { extractJSON, extractTextContent } from "../llm/parser";
import { AgentMemory } from "./memory";

export interface Step {
  id: string;
  action: string;
  params: Record<string, any>;
  description: string;
  depends_on: string[];
}

export interface Plan {
  taskSummary: string;
  steps: Array<{
    id: number;
    type: string;
    description: string;
    details: any;
    dependsOn: number[];
    validation: string;
  }>;
  estimatedDuration: string;
}

const memory = new AgentMemory(process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace");

export async function planTask(taskDescription: string, context?: string): Promise<Step[]> {
  const projectContext = memory.getProjectContext();
  const userMessage = context
    ? `Project context:\n${projectContext}\n\nAdditional context:\n${context}\n\nTask:\n${taskDescription}`
    : `Project context:\n${projectContext}\n\nTask:\n${taskDescription}`;

  const response = await callLLM({
    system: PLANNER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 8192,
  });

  const text = extractTextContent(response.content);
  const parsed = extractJSON(text);

  if (!parsed) {
    return [{
      id: "step_1",
      action: "run_command",
      params: { command: `echo "לא הצלחתי לפרק את המשימה לצעדים"` },
      description: taskDescription,
      depends_on: [],
    }];
  }

  const steps = parsed.steps || parsed;
  if (!Array.isArray(steps)) {
    return [{
      id: "step_1",
      action: "run_command",
      params: { command: `echo "לא הצלחתי לפרק את המשימה לצעדים"` },
      description: taskDescription,
      depends_on: [],
    }];
  }

  return steps.map((s: any, i: number) => ({
    id: String(s.id || `step_${i + 1}`),
    action: s.type || s.action || "run_command",
    params: s.details || s.params || {},
    description: s.description || "",
    depends_on: (s.dependsOn || s.depends_on || []).map(String),
  }));
}

export async function createPlan(task: string, additionalContext?: string): Promise<Plan> {
  const projectContext = memory.getProjectContext();

  const response = await callLLM({
    system: PLANNER_PROMPT,
    messages: [{
      role: "user",
      content: `Project context:\n${projectContext}\n\n${
        additionalContext ? `Additional context:\n${additionalContext}\n\n` : ""
      }Task:\n${task}`,
    }],
    maxTokens: 8192,
  });

  const text = extractTextContent(response.content);
  const plan = extractJSON(text) as Plan;

  if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
    throw new Error("Failed to parse plan from LLM response");
  }

  plan.steps = plan.steps.map((step, i) => ({
    ...step,
    id: i + 1,
  }));

  return plan;
}

export async function revisePlan(
  originalPlan: Plan,
  completedSteps: number[],
  failedStep: { id: number; error: string },
  task: string,
): Promise<Plan> {
  const projectContext = memory.getProjectContext();

  const response = await callLLM({
    system: PLANNER_PROMPT,
    messages: [{
      role: "user",
      content: `The original plan failed at step ${failedStep.id}.

Original task: ${task}
Project context: ${projectContext}

Original plan:
${JSON.stringify(originalPlan, null, 2)}

Completed steps: ${completedSteps.join(", ")}
Failed step: ${failedStep.id} - Error: ${failedStep.error}

Create a REVISED plan that:
1. Keeps completed steps as-is (don't redo them)
2. Fixes the issue that caused the failure
3. Continues from where we left off
4. Adjusts remaining steps if needed`,
    }],
    maxTokens: 8192,
  });

  const text = extractTextContent(response.content);
  const plan = extractJSON(text) as Plan;

  if (!plan || !plan.steps) {
    throw new Error("Failed to parse revised plan");
  }

  return plan;
}