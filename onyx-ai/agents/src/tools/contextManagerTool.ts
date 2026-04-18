import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, listFiles } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

interface ContextEntry {
  type: "file" | "summary" | "decision" | "error" | "learning";
  content: string;
  tokens: number;
  priority: number;
  timestamp: number;
}

const contextWindow: ContextEntry[] = [];
const MAX_CONTEXT_TOKENS = 100000;
let currentTokens = 0;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function addToContext(params: {
  type: string;
  content: string;
  priority?: number;
}): Promise<{ success: boolean; output: string }> {
  const tokens = estimateTokens(params.content);
  const entry: ContextEntry = {
    type: params.type as ContextEntry["type"],
    content: params.content,
    tokens,
    priority: params.priority || 5,
    timestamp: Date.now(),
  };

  while (currentTokens + tokens > MAX_CONTEXT_TOKENS && contextWindow.length > 0) {
    const lowest = contextWindow.reduce((min, e, i) =>
      e.priority < contextWindow[min].priority ? i : min, 0);
    currentTokens -= contextWindow[lowest].tokens;
    contextWindow.splice(lowest, 1);
  }

  contextWindow.push(entry);
  currentTokens += tokens;

  return {
    success: true,
    output: `הוסף לקונטקסט: ${params.type} (${tokens} טוקנים) | סה"כ: ${currentTokens}/${MAX_CONTEXT_TOKENS}`,
  };
}

export async function compressContext(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📦 דוחס קונטקסט...");

  if (contextWindow.length < 3) return { success: true, output: "אין מספיק קונטקסט לדחיסה" };

  const lowPriority = contextWindow.filter(e => e.priority <= 3);
  if (lowPriority.length === 0) return { success: true, output: "כל הקונטקסט בעדיפות גבוהה" };

  const toCompress = lowPriority.map(e => e.content).join("\n---\n");

  const response = await callLLM({
    system: "Summarize the following context entries into a concise summary. Keep all important details, decisions, and technical specifics. Remove redundancy.",
    messages: [{ role: "user", content: toCompress }],
    maxTokens: 1024,
  });

  const summary = extractTextContent(response.content);
  const summaryTokens = estimateTokens(summary);

  for (const entry of lowPriority) {
    const idx = contextWindow.indexOf(entry);
    if (idx !== -1) {
      currentTokens -= entry.tokens;
      contextWindow.splice(idx, 1);
    }
  }

  contextWindow.push({
    type: "summary",
    content: summary,
    tokens: summaryTokens,
    priority: 6,
    timestamp: Date.now(),
  });
  currentTokens += summaryTokens;

  const saved = lowPriority.reduce((s, e) => s + e.tokens, 0) - summaryTokens;
  return { success: true, output: `דוחס: ${lowPriority.length} entries → סיכום אחד. נחסכו ${saved} טוקנים (${currentTokens}/${MAX_CONTEXT_TOKENS})` };
}

export async function smartFileSelect(params: {
  task: string;
}): Promise<{ success: boolean; output: string; files: string[] }> {
  console.log("\n🎯 בוחר קבצים רלוונטיים...");

  const allFiles = await listFiles({ path: WORKSPACE, recursive: true });
  if (!allFiles.success || !allFiles.output) return { success: false, output: "לא ניתן לסרוק קבצים", files: [] };

  const fileList = allFiles.output.split("\n").filter(f =>
    (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json") || f.endsWith(".css")) &&
    !f.includes("node_modules") && !f.includes(".git")
  ).slice(0, 100);

  const response = await callLLM({
    system: `Given a task and list of files, identify which files are most relevant.
Return JSON: { "files": ["path1", "path2"], "reasoning": "why these files" }
Select 3-10 most relevant files. Be precise.`,
    messages: [{
      role: "user",
      content: `Task: ${params.task}\n\nFiles:\n${fileList.join("\n")}`,
    }],
    maxTokens: 1024,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  const files = parsed?.files || [];

  for (const file of files.slice(0, 5)) {
    const content = await readFile({ path: file });
    if (content.success && content.output) {
      await addToContext({ type: "file", content: `=== ${file} ===\n${content.output.slice(0, 2000)}`, priority: 7 });
    }
  }

  return {
    success: true,
    output: `🎯 ${files.length} קבצים רלוונטיים:\n${files.map((f: string) => `  📄 ${f}`).join("\n")}\n\nסיבה: ${parsed?.reasoning || ""}`,
    files,
  };
}

export async function getContextSummary(params: {}): Promise<{ success: boolean; output: string }> {
  const byType = new Map<string, number>();
  for (const e of contextWindow) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }

  const lines = [
    `📊 קונטקסט: ${currentTokens.toLocaleString()}/${MAX_CONTEXT_TOKENS.toLocaleString()} טוקנים (${Math.round(currentTokens / MAX_CONTEXT_TOKENS * 100)}%)`,
    `רשומות: ${contextWindow.length}`,
    ...Array.from(byType.entries()).map(([type, count]) => `  ${type}: ${count}`),
  ];

  return { success: true, output: lines.join("\n") };
}

export async function clearContext(params: {}): Promise<{ success: boolean; output: string }> {
  const prev = contextWindow.length;
  contextWindow.length = 0;
  currentTokens = 0;
  return { success: true, output: `נוקה קונטקסט: ${prev} רשומות` };
}

export function getFullContext(): string {
  return contextWindow
    .sort((a, b) => b.priority - a.priority)
    .map(e => e.content)
    .join("\n\n");
}

export const CONTEXT_MANAGER_TOOLS = [
  {
    name: "add_to_context",
    description: "הוספה לקונטקסט — קובץ, סיכום, החלטה, שגיאה, למידה",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "file, summary, decision, error, learning" },
        content: { type: "string", description: "התוכן להוסיף" },
        priority: { type: "number", description: "עדיפות 1-10 (גבוה = חשוב יותר)" },
      },
      required: ["type", "content"] as string[],
    },
  },
  {
    name: "compress_context",
    description: "דחיסת קונטקסט — סיכום רשומות בעדיפות נמוכה לחיסכון בטוקנים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "smart_file_select",
    description: "בחירת קבצים חכמה — AI בוחר את הקבצים הרלוונטיים למשימה",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "תיאור המשימה" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "get_context_summary",
    description: "סטטוס קונטקסט — כמה טוקנים בשימוש, חלוקה לפי סוג",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "clear_context",
    description: "ניקוי קונטקסט מלא",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
