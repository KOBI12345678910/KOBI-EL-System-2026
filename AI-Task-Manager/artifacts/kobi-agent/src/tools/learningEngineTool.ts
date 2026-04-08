import { readFile, writeFile, createDirectory } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";
const MEMORY_FILE = `${WORKSPACE}/.kobi/learning.json`;

interface LearningEntry {
  id: string;
  type: "success" | "failure" | "pattern" | "preference" | "shortcut";
  category: string;
  description: string;
  context: string;
  solution?: string;
  frequency: number;
  lastUsed: number;
  confidence: number;
}

let learnings: LearningEntry[] = [];
let loaded = false;

async function loadLearnings() {
  if (loaded) return;
  try {
    const result = await readFile({ path: MEMORY_FILE });
    if (result.success && result.output) {
      learnings = JSON.parse(result.output);
    }
  } catch {}
  loaded = true;
}

async function saveLearnings() {
  await createDirectory({ path: `${WORKSPACE}/.kobi` });
  await writeFile({ path: MEMORY_FILE, content: JSON.stringify(learnings, null, 2) });
}

export async function learnFromSuccess(params: {
  category: string;
  description: string;
  context: string;
  solution: string;
}): Promise<{ success: boolean; output: string }> {
  await loadLearnings();

  const existing = learnings.find(l =>
    l.category === params.category && l.description === params.description
  );

  if (existing) {
    existing.frequency++;
    existing.lastUsed = Date.now();
    existing.confidence = Math.min(1, existing.confidence + 0.1);
    if (params.solution) existing.solution = params.solution;
  } else {
    learnings.push({
      id: `learn_${Date.now()}`,
      type: "success",
      category: params.category,
      description: params.description,
      context: params.context,
      solution: params.solution,
      frequency: 1,
      lastUsed: Date.now(),
      confidence: 0.7,
    });
  }

  await saveLearnings();
  return { success: true, output: `למדתי: ${params.description} (${params.category})` };
}

export async function learnFromFailure(params: {
  category: string;
  description: string;
  error: string;
  whatWorked: string;
}): Promise<{ success: boolean; output: string }> {
  await loadLearnings();

  learnings.push({
    id: `learn_${Date.now()}`,
    type: "failure",
    category: params.category,
    description: `❌ ${params.description}: ${params.error}`,
    context: params.error,
    solution: params.whatWorked,
    frequency: 1,
    lastUsed: Date.now(),
    confidence: 0.8,
  });

  await saveLearnings();
  return { success: true, output: `למדתי מכישלון: ${params.description} → פתרון: ${params.whatWorked}` };
}

export async function recallLearnings(params: {
  category?: string;
  query?: string;
}): Promise<{ success: boolean; output: string; learnings: LearningEntry[] }> {
  await loadLearnings();

  let relevant = learnings;
  if (params.category) relevant = relevant.filter(l => l.category === params.category);
  if (params.query) {
    const q = params.query.toLowerCase();
    relevant = relevant.filter(l =>
      l.description.toLowerCase().includes(q) ||
      l.context.toLowerCase().includes(q) ||
      (l.solution && l.solution.toLowerCase().includes(q))
    );
  }

  relevant.sort((a, b) => (b.confidence * b.frequency) - (a.confidence * a.frequency));
  const top = relevant.slice(0, 20);

  if (top.length === 0) return { success: true, output: "אין למידה רלוונטית", learnings: [] };

  const lines = top.map(l => {
    const icon = l.type === "success" ? "✅" : l.type === "failure" ? "❌" : "📌";
    return `${icon} [${l.category}] ${l.description} (ביטחון: ${Math.round(l.confidence * 100)}%, שכיחות: ${l.frequency})${l.solution ? `\n   → ${l.solution}` : ""}`;
  });

  return { success: true, output: `🧠 למידה רלוונטית (${top.length}):\n${lines.join("\n")}`, learnings: top };
}

export async function addPattern(params: {
  name: string;
  pattern: string;
  example: string;
}): Promise<{ success: boolean; output: string }> {
  await loadLearnings();

  learnings.push({
    id: `pattern_${Date.now()}`,
    type: "pattern",
    category: "patterns",
    description: params.name,
    context: params.pattern,
    solution: params.example,
    frequency: 1,
    lastUsed: Date.now(),
    confidence: 0.9,
  });

  await saveLearnings();
  return { success: true, output: `דפוס נשמר: ${params.name}` };
}

export async function addPreference(params: {
  key: string;
  value: string;
}): Promise<{ success: boolean; output: string }> {
  await loadLearnings();

  const existing = learnings.find(l => l.type === "preference" && l.description === params.key);
  if (existing) {
    existing.context = params.value;
    existing.lastUsed = Date.now();
  } else {
    learnings.push({
      id: `pref_${Date.now()}`,
      type: "preference",
      category: "preferences",
      description: params.key,
      context: params.value,
      frequency: 1,
      lastUsed: Date.now(),
      confidence: 1,
    });
  }

  await saveLearnings();
  return { success: true, output: `העדפה נשמרה: ${params.key} = ${params.value}` };
}

export async function getLearningStats(params: {}): Promise<{ success: boolean; output: string }> {
  await loadLearnings();

  const byType = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const l of learnings) {
    byType.set(l.type, (byType.get(l.type) || 0) + 1);
    byCategory.set(l.category, (byCategory.get(l.category) || 0) + 1);
  }

  const lines = [
    `🧠 למידה: ${learnings.length} רשומות`,
    `\nלפי סוג:`,
    ...Array.from(byType.entries()).map(([t, c]) => `  ${t}: ${c}`),
    `\nלפי קטגוריה:`,
    ...Array.from(byCategory.entries()).map(([c, n]) => `  ${c}: ${n}`),
  ];

  return { success: true, output: lines.join("\n") };
}

export const LEARNING_ENGINE_TOOLS = [
  {
    name: "learn_from_success",
    description: "למידה מהצלחה — שמירת פתרון שעבד לשימוש עתידי",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "קטגוריה (react, api, db, deploy...)" },
        description: { type: "string", description: "מה הצליח" },
        context: { type: "string", description: "באיזה הקשר" },
        solution: { type: "string", description: "הפתרון שעבד" },
      },
      required: ["category", "description", "context", "solution"] as string[],
    },
  },
  {
    name: "learn_from_failure",
    description: "למידה מכישלון — שמירת מה לא עבד + מה כן עבד",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string" }, description: { type: "string" },
        error: { type: "string" }, whatWorked: { type: "string" },
      },
      required: ["category", "description", "error", "whatWorked"] as string[],
    },
  },
  {
    name: "recall_learnings",
    description: "שליפת למידה — מה למדתי על נושא/קטגוריה מסוימת",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "סינון לפי קטגוריה" },
        query: { type: "string", description: "חיפוש חופשי" },
      },
      required: [] as string[],
    },
  },
  {
    name: "add_pattern",
    description: "שמירת דפוס קוד — pattern שחוזר על עצמו",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" }, pattern: { type: "string" }, example: { type: "string" },
      },
      required: ["name", "pattern", "example"] as string[],
    },
  },
  {
    name: "add_preference",
    description: "שמירת העדפת משתמש — סגנון, כלים, שפה, מבנה",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string" }, value: { type: "string" },
      },
      required: ["key", "value"] as string[],
    },
  },
  {
    name: "get_learning_stats",
    description: "סטטיסטיקות למידה — כמה למדתי, לפי סוג וקטגוריה",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
