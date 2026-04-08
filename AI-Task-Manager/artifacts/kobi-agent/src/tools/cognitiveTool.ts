import * as fs from "fs";
import * as path from "path";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";
const LEARNING_FILE = path.join(WORKSPACE, ".agent", "learned-lessons.json");
const REASONING_LOG = path.join(WORKSPACE, ".agent", "reasoning-log.json");

interface Lesson {
  id: string;
  task: string;
  mistake: string;
  correction: string;
  principle: string;
  category: string;
  timestamp: string;
  useCount: number;
}

interface ReasoningEntry {
  id: string;
  task: string;
  strategy: string;
  steps: string[];
  result: string;
  durationMs: number;
  timestamp: string;
}

function ensureDir() {
  const dir = path.join(WORKSPACE, ".agent");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadLessons(): Lesson[] {
  try {
    if (fs.existsSync(LEARNING_FILE)) return JSON.parse(fs.readFileSync(LEARNING_FILE, "utf-8"));
  } catch {}
  return [];
}

function saveLessons(lessons: Lesson[]) {
  ensureDir();
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(lessons, null, 2));
}

function loadReasoningLog(): ReasoningEntry[] {
  try {
    if (fs.existsSync(REASONING_LOG)) return JSON.parse(fs.readFileSync(REASONING_LOG, "utf-8"));
  } catch {}
  return [];
}

function saveReasoningLog(log: ReasoningEntry[]) {
  ensureDir();
  fs.writeFileSync(REASONING_LOG, JSON.stringify(log.slice(-200), null, 2));
}

export async function thinkDeep(params: { problem: string; context?: string }): Promise<{ success: boolean; output: string }> {
  const lessons = loadLessons();
  const relevantLessons = lessons
    .filter(l => {
      const lw = l.task.toLowerCase() + " " + l.category.toLowerCase();
      return params.problem.toLowerCase().split(/\s+/).some(w => w.length > 3 && lw.includes(w));
    })
    .slice(0, 5);

  const lessonsText = relevantLessons.length > 0
    ? `\n\nלקחים רלוונטיים מהעבר:\n${relevantLessons.map(l => `- ${l.principle} (מקור: ${l.task})`).join("\n")}`
    : "";

  const startTime = Date.now();
  const response = await callLLM({
    system: `אתה חושב עמוק ומנתח בעיות בצורה מתודית. חשוב בשלבים מובנים:

## שיטת חשיבה:
1. **הבנה** — מה בדיוק הבעיה? מה ידוע ומה לא?
2. **פירוק** — פרק את הבעיה לתת-בעיות
3. **ניתוח** — בחן כל תת-בעיה בנפרד
4. **חלופות** — חשוב על לפחות 3 גישות שונות
5. **הערכה** — יתרונות וחסרונות לכל גישה
6. **סינתזה** — שלב הכל לפתרון אופטימלי
7. **ביקורת** — מה יכול להשתבש? edge cases?
8. **החלטה** — הצג את הפתרון המומלץ עם הנמקה

ענה בעברית. היה מדויק ומפורט.`,
    messages: [{
      role: "user",
      content: `בעיה: ${params.problem}${params.context ? `\n\nהקשר: ${params.context}` : ""}${lessonsText}`,
    }],
    maxTokens: 8192,
  });

  const result = extractTextContent(response.content);
  const duration = Date.now() - startTime;

  const log = loadReasoningLog();
  log.push({
    id: `think_${Date.now()}`,
    task: params.problem.slice(0, 100),
    strategy: "deep_thinking",
    steps: result.split("\n").filter(l => l.startsWith("**") || l.startsWith("- ")).slice(0, 20),
    result: result.slice(0, 500),
    durationMs: duration,
    timestamp: new Date().toISOString(),
  });
  saveReasoningLog(log);

  return { success: true, output: result };
}

export async function analyzeMultipleStrategies(params: { task: string; strategies?: number }): Promise<{ success: boolean; output: string }> {
  const numStrategies = Math.min(params.strategies || 3, 5);

  const response = await callLLM({
    system: `אתה אסטרטג תוכנה מומחה. חשוב על מספר גישות שונות לפתרון בעיה ודרג אותן.

לכל אסטרטגיה ציין:
- **שם** — שם תמציתי
- **גישה** — תיאור הגישה
- **צעדים** — רשימת צעדים מפורטת
- **יתרונות** — למה גישה זו טובה
- **חסרונות** — סיכונים ובעיות
- **זמן** — הערכת זמן
- **סיבוכיות** — O(n), קושי טכני
- **ציון** — 1-10

בסוף — המלצה ברורה עם הנמקה.
ענה בעברית.`,
    messages: [{
      role: "user",
      content: `משימה: ${params.task}\n\nהצע ${numStrategies} אסטרטגיות שונות לפתרון.`,
    }],
    maxTokens: 8192,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function selfReflect(params: { action: string; result: string; expected?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `אתה מבצע רפלקציה עצמית על פעולות AI. בחן בביקורתיות:

1. **מה עבד** — מה הצליח ולמה
2. **מה לא עבד** — מה נכשל ולמה
3. **מה חסר** — מה שכחתי או פספסתי
4. **שיפורים** — מה לעשות אחרת בפעם הבאה
5. **לקח** — כלל אצבע חדש שלמדתי
6. **ציון עצמי** — 1-10 עם הנמקה

היה כנה וביקורתי. ענה בעברית.`,
    messages: [{
      role: "user",
      content: `פעולה שבוצעה: ${params.action}\n\nתוצאה: ${params.result}${params.expected ? `\n\nתוצאה צפויה: ${params.expected}` : ""}`,
    }],
    maxTokens: 4096,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function learnFromMistake(params: { task: string; mistake: string; correction: string; category?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: "נסח עיקרון קצר (משפט אחד) שלומד מטעות. העיקרון צריך להיות כללי ושימושי לעתיד. ענה בעברית. החזר רק את העיקרון.",
    messages: [{
      role: "user",
      content: `משימה: ${params.task}\nטעות: ${params.mistake}\nתיקון: ${params.correction}`,
    }],
    maxTokens: 256,
  });

  const principle = extractTextContent(response.content);
  const lessons = loadLessons();
  const lesson: Lesson = {
    id: `lesson_${Date.now()}`,
    task: params.task,
    mistake: params.mistake,
    correction: params.correction,
    principle,
    category: params.category || "general",
    timestamp: new Date().toISOString(),
    useCount: 0,
  };
  lessons.push(lesson);
  saveLessons(lessons);

  return { success: true, output: `📝 לקח חדש נשמר: ${principle}` };
}

export async function recallLessons(params: { topic?: string; category?: string; limit?: number }): Promise<{ success: boolean; output: string }> {
  const lessons = loadLessons();
  let filtered = lessons;

  if (params.topic) {
    const topicLower = params.topic.toLowerCase();
    filtered = filtered.filter(l =>
      l.task.toLowerCase().includes(topicLower) ||
      l.principle.toLowerCase().includes(topicLower) ||
      l.mistake.toLowerCase().includes(topicLower)
    );
  }

  if (params.category) {
    filtered = filtered.filter(l => l.category === params.category);
  }

  filtered = filtered.slice(-(params.limit || 20));

  if (filtered.length === 0) return { success: true, output: "אין לקחים רלוונטיים" };

  const lines = filtered.map(l => [
    `### ${l.principle}`,
    `- **משימה**: ${l.task}`,
    `- **טעות**: ${l.mistake}`,
    `- **תיקון**: ${l.correction}`,
    `- **קטגוריה**: ${l.category}`,
    `- **נוצר**: ${new Date(l.timestamp).toLocaleDateString("he-IL")}`,
    `- **שימושים**: ${l.useCount}`,
  ].join("\n"));

  return { success: true, output: `## 📚 ${filtered.length} לקחים\n\n${lines.join("\n\n")}` };
}

export async function codeReview360(params: { code: string; language?: string; context?: string }): Promise<{ success: boolean; output: string }> {
  const lang = params.language || "TypeScript";
  const response = await callLLM({
    system: `אתה מבקר קוד ברמה הגבוהה ביותר. בצע סקירת קוד מקיפה מ-360 מעלות:

## 1. נכונות
- האם הקוד עושה מה שהוא אמור?
- Edge cases שחסרים
- באגים פוטנציאליים

## 2. אבטחה
- SQL Injection, XSS, CSRF
- חשיפת מידע רגיש
- בעיות הרשאות

## 3. ביצועים
- זליגת זיכרון
- N+1 queries
- חישובים כבדים מיותרים
- מיתוח ושימוש בקאש

## 4. תחזוקה
- קריאות ושמות משתנים
- DRY / SOLID
- מורכבות ציקלומטית
- חוב טכני

## 5. בדיקות
- כיסוי מקרי קצה
- מה חסר

## 6. ארכיטקטורה
- הפרדת אחריות
- תלויות
- אפשרויות הרחבה

לכל ממצא: חומרה (🔴/🟡/🟢), שורה (אם רלוונטי), הסבר, תיקון מוצע.
ציון כולל 1-10.
ענה בעברית.`,
    messages: [{
      role: "user",
      content: `שפה: ${lang}${params.context ? `\nהקשר: ${params.context}` : ""}\n\nקוד:\n\`\`\`${lang.toLowerCase()}\n${params.code}\n\`\`\``,
    }],
    maxTokens: 8192,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function explainLikeExpert(params: { topic: string; depth?: string }): Promise<{ success: boolean; output: string }> {
  const depth = params.depth || "expert";
  const depthInstructions: Record<string, string> = {
    beginner: "הסבר כאילו הקורא לא מכיר תכנות בכלל. השתמש באנלוגיות יומיומיות.",
    intermediate: "הסבר למפתח עם ניסיון של שנה. כלול דוגמאות קוד פשוטות.",
    expert: "הסבר ברמת עומק גבוהה. כלול פרטי מימוש, trade-offs, ביצועים, ו-edge cases.",
    architect: "הסבר ברמת ארכיטקטורה. כלול השוואת גישות, scalability, ופתרונות enterprise.",
  };

  const response = await callLLM({
    system: `אתה מומחה עולמי. ${depthInstructions[depth] || depthInstructions.expert}

מבנה ההסבר:
1. **תמצית** — משפט אחד שמסכם
2. **למה זה חשוב** — הרקע והצורך
3. **איך זה עובד** — מנגנון פנימי מפורט
4. **דוגמאות** — מעשיות ורלוונטיות
5. **טעויות נפוצות** — ואיך להימנע
6. **מקורות** — לקריאה נוספת
7. **TL;DR** — סיכום ב-3 משפטים

ענה בעברית.`,
    messages: [{ role: "user", content: params.topic }],
    maxTokens: 8192,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function debugWithHypotheses(params: { error: string; code?: string; context?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `אתה דיבאגר מומחה שעובד בשיטת היפותזות:

## שיטה:
1. **תצפית** — מה בדיוק השגיאה אומרת
2. **היפותזות** — הצע 3-5 סיבות אפשריות, מהסבירה ביותר לפחות
3. **בדיקות** — לכל היפותזה, איך לוודא/להפריך אותה
4. **אבחנה** — ההיפותזה הסבירה ביותר ולמה
5. **פתרון** — קוד מדויק לתיקון
6. **מניעה** — איך למנוע בעתיד

ענה בעברית. היה מדויק בניתוח.`,
    messages: [{
      role: "user",
      content: `שגיאה: ${params.error}${params.code ? `\n\nקוד:\n\`\`\`\n${params.code}\n\`\`\`` : ""}${params.context ? `\n\nהקשר: ${params.context}` : ""}`,
    }],
    maxTokens: 8192,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function synthesizeKnowledge(params: { sources: string[]; question: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `אתה מסנתז ידע ממספר מקורות לתשובה אחת מקיפה.

כללים:
- שלב מידע מכל המקורות
- ציין סתירות אם יש
- תן משקל לפי אמינות ורלוונטיות
- הצג תמונה שלמה ומאוזנת
- סכם ב-TL;DR

ענה בעברית.`,
    messages: [{
      role: "user",
      content: `שאלה: ${params.question}\n\nמקורות:\n${params.sources.map((s, i) => `--- מקור ${i + 1} ---\n${s}`).join("\n\n")}`,
    }],
    maxTokens: 8192,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function predictImpact(params: { change: string; codebase?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `אתה חוזה השפעות של שינויים בקוד. לכל שינוי נתח:

## 1. השפעה ישירה
- קבצים שמושפעים
- פונקציות שנשברות/משתנות

## 2. השפעה עקיפה
- אפקט דומינו — מה עלול להישבר
- תלויות שנפגעות

## 3. סיכונים
- regression בדיקות
- ביצועים
- אבטחה

## 4. בדיקות נדרשות
- מה חייבים לבדוק אחרי השינוי

## 5. ציון סיכון
🟢 נמוך | 🟡 בינוני | 🔴 גבוה | 🔥 קריטי

ענה בעברית.`,
    messages: [{
      role: "user",
      content: `שינוי: ${params.change}${params.codebase ? `\n\nהקשר קוד:\n${params.codebase}` : ""}`,
    }],
    maxTokens: 4096,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function getReasoningHistory(params: { limit?: number }): Promise<{ success: boolean; output: string }> {
  const log = loadReasoningLog();
  const entries = log.slice(-(params.limit || 10));
  if (entries.length === 0) return { success: true, output: "אין היסטוריית חשיבה" };

  const lines = entries.map(e => [
    `### ${e.task}`,
    `- **אסטרטגיה**: ${e.strategy}`,
    `- **זמן**: ${e.durationMs}ms`,
    `- **תאריך**: ${new Date(e.timestamp).toLocaleString("he-IL")}`,
    `- **צעדים**: ${e.steps.length}`,
  ].join("\n"));

  return { success: true, output: `## 🧠 היסטוריית חשיבה (${entries.length})\n\n${lines.join("\n\n")}` };
}

export const COGNITIVE_TOOLS = [
  {
    name: "think_deep",
    description: "חשיבה עמוקה ומתודית — פירוק בעיה ל-8 שלבי חשיבה, כולל חלופות וביקורת. משתמש בלקחים מהעבר",
    input_schema: { type: "object" as const, properties: { problem: { type: "string", description: "The problem to think about deeply" }, context: { type: "string", description: "Additional context" } }, required: ["problem"] as string[] },
  },
  {
    name: "analyze_strategies",
    description: "ניתוח ריבוי אסטרטגיות — מייצר 3-5 גישות שונות עם יתרונות/חסרונות וציון",
    input_schema: { type: "object" as const, properties: { task: { type: "string" }, strategies: { type: "number", description: "Number of strategies (2-5, default 3)" } }, required: ["task"] as string[] },
  },
  {
    name: "self_reflect",
    description: "רפלקציה עצמית — ניתוח ביקורתי של פעולה שבוצעה, מה עבד ומה לא, ציון עצמי",
    input_schema: { type: "object" as const, properties: { action: { type: "string" }, result: { type: "string" }, expected: { type: "string" } }, required: ["action", "result"] as string[] },
  },
  {
    name: "learn_from_mistake",
    description: "למידה מטעות — שומר עיקרון חדש לשימוש עתידי. הלקחים זמינים אוטומטית בחשיבה עמוקה",
    input_schema: { type: "object" as const, properties: { task: { type: "string" }, mistake: { type: "string" }, correction: { type: "string" }, category: { type: "string", description: "Category: db, frontend, backend, devops, security, general" } }, required: ["task", "mistake", "correction"] as string[] },
  },
  {
    name: "recall_lessons",
    description: "שליפת לקחים מהעבר — לפי נושא או קטגוריה",
    input_schema: { type: "object" as const, properties: { topic: { type: "string" }, category: { type: "string" }, limit: { type: "number" } }, required: [] as string[] },
  },
  {
    name: "code_review_360",
    description: "סקירת קוד 360° — נכונות, אבטחה, ביצועים, תחזוקה, בדיקות, ארכיטקטורה. ציון 1-10",
    input_schema: { type: "object" as const, properties: { code: { type: "string" }, language: { type: "string" }, context: { type: "string" } }, required: ["code"] as string[] },
  },
  {
    name: "explain_like_expert",
    description: "הסבר מומחה — 4 רמות עומק (beginner/intermediate/expert/architect)",
    input_schema: { type: "object" as const, properties: { topic: { type: "string" }, depth: { type: "string", description: "beginner | intermediate | expert | architect" } }, required: ["topic"] as string[] },
  },
  {
    name: "debug_with_hypotheses",
    description: "דיבאג בשיטת היפותזות — 3-5 סיבות אפשריות, בדיקות לכל אחת, אבחנה ופתרון",
    input_schema: { type: "object" as const, properties: { error: { type: "string" }, code: { type: "string" }, context: { type: "string" } }, required: ["error"] as string[] },
  },
  {
    name: "synthesize_knowledge",
    description: "סינתזת ידע — שילוב מידע ממספר מקורות לתשובה אחת מקיפה",
    input_schema: { type: "object" as const, properties: { sources: { type: "array", items: { type: "string" } }, question: { type: "string" } }, required: ["sources", "question"] as string[] },
  },
  {
    name: "predict_impact",
    description: "חיזוי השפעה — ניתוח השפעה ישירה ועקיפה של שינוי בקוד, ציון סיכון",
    input_schema: { type: "object" as const, properties: { change: { type: "string" }, codebase: { type: "string" } }, required: ["change"] as string[] },
  },
  {
    name: "get_reasoning_history",
    description: "היסטוריית חשיבה — סקירת החלטות וניתוחים שבוצעו",
    input_schema: { type: "object" as const, properties: { limit: { type: "number" } }, required: [] as string[] },
  },
];
