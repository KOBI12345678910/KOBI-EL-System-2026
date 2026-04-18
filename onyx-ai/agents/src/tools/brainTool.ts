import { callLLM } from "../llm/client";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";
const PERSIST_PATH = path.join(WORKSPACE, ".agent", "brain.json");

interface Decision {
  what: string;
  why: string;
  when: Date;
  context: string;
}

interface LearnedPattern {
  pattern: string;
  solution: string;
  confidence: number;
  usedCount: number;
}

interface ErrorRecord {
  error: string;
  fix: string;
  file?: string;
}

const decisions: Decision[] = [];
const learnedPatterns: LearnedPattern[] = [];
const errorHistory: ErrorRecord[] = [];
const fileKnowledge = new Map<string, { summary: string; lastRead: Date }>();
const sessionContext: string[] = [];
let sessionGoal = "";
const conversationHistory: Array<{ role: string; content: string }> = [];

const QUALITY_RULES = [
  "Every function must have proper TypeScript types",
  "Every API route must validate input and return proper error responses",
  "Every async operation must have try/catch error handling",
  "Every React component must handle: loading, error, and empty states",
  "Database queries must use parameterized queries",
  "All user input must be validated before processing",
  "Every file must be complete and working — no stubs or TODOs",
  "Imports: external → internal → relative",
  "Never use `any` type — define proper interfaces",
];

function loadBrain(): void {
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const data = JSON.parse(fs.readFileSync(PERSIST_PATH, "utf-8"));
      decisions.push(...(data.decisions || []));
      learnedPatterns.push(...(data.learnedPatterns || []));
      errorHistory.push(...(data.errorHistory || []));
      if (data.fileKnowledge) {
        for (const [k, v] of Object.entries(data.fileKnowledge)) {
          fileKnowledge.set(k, v as any);
        }
      }
    }
  } catch {}
}

function saveBrain(): void {
  try {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = {
      decisions: decisions.slice(-50),
      learnedPatterns: learnedPatterns.slice(-50),
      errorHistory: errorHistory.slice(-100),
      fileKnowledge: Object.fromEntries(fileKnowledge),
      savedAt: new Date(),
    };
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

loadBrain();

function buildSystemPrompt(task: string, additionalContext?: string): string {
  const sections: string[] = [];

  sections.push(`You are Kobi Agent — an expert AI software engineer with deep knowledge of:
- Full-stack development (TypeScript, React, Node.js, PostgreSQL, Redis)
- System architecture (microservices, monolith, serverless, event-driven)
- DevOps (Docker, Kubernetes, CI/CD, cloud platforms)
- Security (OWASP, auth, encryption, input validation)
- Performance (caching, indexing, lazy loading, code splitting)
- Testing (unit, integration, e2e, TDD)
- Database design (normalization, indexing, migrations, ORM)

You write production-quality code. Every file you create should be complete, typed, and handle errors properly.`);

  sections.push(`QUALITY RULES — ALWAYS FOLLOW:\n${QUALITY_RULES.map(r => `- ${r}`).join("\n")}`);

  if (learnedPatterns.length > 0) {
    const topPatterns = learnedPatterns
      .sort((a, b) => b.confidence * b.usedCount - a.confidence * a.usedCount)
      .slice(0, 10);
    sections.push(`LEARNED PATTERNS:\n${topPatterns.map(p => `- ${p.pattern} → ${p.solution}`).join("\n")}`);
  }

  if (errorHistory.length > 0) {
    const recent = errorHistory.slice(-10);
    sections.push(`KNOWN ERRORS (avoid):\n${recent.map(e => `- ${e.error} → Fix: ${e.fix}`).join("\n")}`);
  }

  if (decisions.length > 0) {
    const recent = decisions.slice(-10);
    sections.push(`PREVIOUS DECISIONS:\n${recent.map(d => `- ${d.what}: ${d.why}`).join("\n")}`);
  }

  const relevantFiles = getRelevantFileKnowledge(task);
  if (relevantFiles.length > 0) {
    sections.push(`FILE KNOWLEDGE:\n${relevantFiles.map(f => `- ${f.path}: ${f.summary}`).join("\n")}`);
  }

  if (sessionContext.length > 0) {
    sections.push(`SESSION CONTEXT:\n${sessionContext.slice(-10).join("\n")}`);
  }

  if (additionalContext) {
    sections.push(`ADDITIONAL CONTEXT:\n${additionalContext}`);
  }

  return sections.join("\n\n");
}

function getRelevantFileKnowledge(task: string): Array<{ path: string; summary: string }> {
  const taskLower = task.toLowerCase();
  const results: Array<{ path: string; summary: string; score: number }> = [];

  for (const [filePath, info] of fileKnowledge) {
    let score = 0;
    const fileName = filePath.split("/").pop() || "";
    if (taskLower.includes(fileName.toLowerCase())) score += 5;
    if (taskLower.includes(filePath.toLowerCase())) score += 10;
    const summaryWords = info.summary.toLowerCase().split(/\s+/);
    const taskWords = taskLower.split(/\s+/);
    for (const tw of taskWords) {
      if (summaryWords.some(sw => sw.includes(tw))) score += 1;
    }
    if (score > 0) results.push({ path: filePath, summary: info.summary, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function learnFromResponse(task: string, response: string): void {
  const fileRefs = response.match(/`([a-zA-Z0-9_/.-]+\.[a-zA-Z]+)`/g);
  if (fileRefs) {
    for (const ref of fileRefs) {
      const filePath = ref.replace(/`/g, "");
      const lines = response.split("\n");
      const refLine = lines.findIndex(l => l.includes(filePath));
      if (refLine >= 0) {
        const summary = lines.slice(Math.max(0, refLine - 1), refLine + 2).join(" ").slice(0, 100);
        fileKnowledge.set(filePath, { summary, lastRead: new Date() });
      }
    }
  }

  const decisionPatterns = [/(?:I'll use|using|chose|going with)\s+(.+?)(?:\s+because|\s+for|\.)/gi];
  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      decisions.push({ what: match[1].slice(0, 100), why: "auto-detected", when: new Date(), context: task.slice(0, 50) });
    }
  }
  if (decisions.length > 50) decisions.splice(0, decisions.length - 40);
  if (Math.random() < 0.2) saveBrain();
}

export async function brainThink(params: {
  task: string;
  context?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🧠 Brain — חושב...");

  const systemPrompt = buildSystemPrompt(params.task, params.context);

  const relevantHistory = conversationHistory.slice(-6).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content.length > 500 ? m.content.slice(0, 400) + "\n... [truncated]" : m.content,
  }));

  const messages = [...relevantHistory, { role: "user" as const, content: params.task }];

  const result = await callLLM({ system: systemPrompt, messages, maxTokens: 8192 });

  const text = typeof result.content === "string" ? result.content :
    Array.isArray(result.content) ? result.content.map((b: any) => b.text || "").join("") : String(result.content);

  learnFromResponse(params.task, text);
  conversationHistory.push({ role: "user", content: params.task }, { role: "assistant", content: text.slice(0, 1000) });
  if (conversationHistory.length > 40) conversationHistory.splice(0, conversationHistory.length - 30);

  return { success: true, output: text };
}

export async function brainRememberError(params: { error: string; fix: string; file?: string }): Promise<{ success: boolean; output: string }> {
  const exists = errorHistory.some(e => e.error === params.error.slice(0, 100));
  if (!exists) {
    errorHistory.push({ error: params.error.slice(0, 200), fix: params.fix.slice(0, 200), file: params.file });
  }
  if (errorHistory.length > 100) errorHistory.splice(0, errorHistory.length - 80);
  return { success: true, output: `🧠 שגיאה נשמרה: ${params.error.slice(0, 60)} → ${params.fix.slice(0, 60)}` };
}

export async function brainRememberDecision(params: { what: string; why: string; context?: string }): Promise<{ success: boolean; output: string }> {
  decisions.push({ what: params.what, why: params.why, when: new Date(), context: params.context || "" });
  return { success: true, output: `🧠 החלטה נשמרה: ${params.what}` };
}

export async function brainLearnPattern(params: { pattern: string; solution: string; confidence?: number }): Promise<{ success: boolean; output: string }> {
  const existing = learnedPatterns.find(p => p.pattern === params.pattern);
  if (existing) {
    existing.usedCount++;
    existing.confidence = Math.min(1, existing.confidence + 0.1);
    existing.solution = params.solution;
  } else {
    learnedPatterns.push({ pattern: params.pattern, solution: params.solution, confidence: params.confidence || 0.8, usedCount: 1 });
  }
  return { success: true, output: `🧠 דפוס נלמד: ${params.pattern} → ${params.solution}` };
}

export async function brainSetSessionGoal(params: { goal: string }): Promise<{ success: boolean; output: string }> {
  sessionGoal = params.goal;
  sessionContext.push(`Session goal: ${params.goal}`);
  return { success: true, output: `🎯 מטרת סשן: ${params.goal}` };
}

export async function brainAddContext(params: { context: string }): Promise<{ success: boolean; output: string }> {
  sessionContext.push(params.context);
  if (sessionContext.length > 30) sessionContext.splice(0, sessionContext.length - 20);
  return { success: true, output: `🧠 הקשר נוסף: ${params.context.slice(0, 60)}` };
}

export async function brainRememberFile(params: { path: string; summary: string }): Promise<{ success: boolean; output: string }> {
  fileKnowledge.set(params.path, { summary: params.summary, lastRead: new Date() });
  return { success: true, output: `📄 ידע על קובץ: ${params.path} — ${params.summary.slice(0, 60)}` };
}

export async function brainGetStats(params: {}): Promise<{ success: boolean; output: string }> {
  const lines = [
    `🧠 Brain Stats:`,
    `  החלטות: ${decisions.length}`,
    `  דפוסים נלמדים: ${learnedPatterns.length}`,
    `  שגיאות ידועות: ${errorHistory.length}`,
    `  קבצים מוכרים: ${fileKnowledge.size}`,
    `  היסטוריית שיחה: ${conversationHistory.length} הודעות`,
    `  הקשר סשן: ${sessionContext.length} פריטים`,
    `  מטרת סשן: ${sessionGoal || "לא הוגדרה"}`,
  ];
  if (learnedPatterns.length > 0) {
    lines.push(`  Top דפוסים:`);
    learnedPatterns.sort((a, b) => b.usedCount - a.usedCount).slice(0, 5).forEach(p => {
      lines.push(`    ${p.pattern} (×${p.usedCount}, ${Math.round(p.confidence * 100)}%)`);
    });
  }
  return { success: true, output: lines.join("\n") };
}

export async function brainSave(params: {}): Promise<{ success: boolean; output: string }> {
  saveBrain();
  return { success: true, output: `💾 Brain נשמר — ${decisions.length} החלטות, ${learnedPatterns.length} דפוסים, ${errorHistory.length} שגיאות` };
}

export async function brainReset(params: { full?: boolean }): Promise<{ success: boolean; output: string }> {
  conversationHistory.length = 0;
  sessionContext.length = 0;
  sessionGoal = "";

  if (params.full) {
    decisions.length = 0;
    learnedPatterns.length = 0;
    errorHistory.length = 0;
    fileKnowledge.clear();
    saveBrain();
    return { success: true, output: "🧠 Brain אופס לחלוטין — כל הזיכרון נמחק" };
  }

  return { success: true, output: "🧠 סשן אופס — זיכרון ארוך-טווח נשמר" };
}

export const BRAIN_TOOLS = [
  {
    name: "brain_think",
    description: "חשיבה עמוקה — שולח משימה למוח עם כל ההקשר, הדפוסים, והזיכרון",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string" as const, description: "המשימה לחשיבה" },
        context: { type: "string" as const, description: "הקשר נוסף" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "brain_remember_error",
    description: "שמירת שגיאה ותיקון — המוח ילמד להימנע ממנה",
    input_schema: {
      type: "object" as const,
      properties: {
        error: { type: "string" as const },
        fix: { type: "string" as const },
        file: { type: "string" as const },
      },
      required: ["error", "fix"] as string[],
    },
  },
  {
    name: "brain_remember_decision",
    description: "שמירת החלטה — לשמירה על עקביות",
    input_schema: {
      type: "object" as const,
      properties: {
        what: { type: "string" as const },
        why: { type: "string" as const },
        context: { type: "string" as const },
      },
      required: ["what", "why"] as string[],
    },
  },
  {
    name: "brain_learn_pattern",
    description: "לימוד דפוס חדש — בעיה ופתרון",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string" as const, description: "תיאור הבעיה/דפוס" },
        solution: { type: "string" as const, description: "הפתרון" },
        confidence: { type: "number" as const, description: "רמת ביטחון (0-1)" },
      },
      required: ["pattern", "solution"] as string[],
    },
  },
  {
    name: "brain_set_session_goal",
    description: "קביעת מטרת הסשן — המוח ישמור הקשר",
    input_schema: {
      type: "object" as const,
      properties: { goal: { type: "string" as const } },
      required: ["goal"] as string[],
    },
  },
  {
    name: "brain_add_context",
    description: "הוספת הקשר לסשן — המוח ישתמש בזה בחשיבה",
    input_schema: {
      type: "object" as const,
      properties: { context: { type: "string" as const } },
      required: ["context"] as string[],
    },
  },
  {
    name: "brain_remember_file",
    description: "שמירת ידע על קובץ — סיכום ומיקום",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const },
        summary: { type: "string" as const },
      },
      required: ["path", "summary"] as string[],
    },
  },
  {
    name: "brain_get_stats",
    description: "סטטיסטיקות המוח — החלטות, דפוסים, שגיאות, ידע",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "brain_save",
    description: "שמירת המוח לדיסק — persist לאורך סשנים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "brain_reset",
    description: "איפוס המוח — סשן או מלא",
    input_schema: {
      type: "object" as const,
      properties: { full: { type: "boolean" as const, description: "איפוס מלא כולל זיכרון ארוך-טווח" } },
      required: [] as string[],
    },
  },
];
