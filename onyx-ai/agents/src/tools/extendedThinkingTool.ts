import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

interface ThinkingResult {
  reasoning: string;
  plan: string[];
  risks: string[];
  alternatives: string[];
  confidence: number;
  decision: string;
}

export async function deepThink(params: {
  problem: string;
  context?: string;
  budgetTokens?: number;
}): Promise<{ success: boolean; output: string; result: ThinkingResult | null }> {
  console.log("\n🧠 חשיבה מעמיקה...");

  const budget = params.budgetTokens || 10000;

  const response = await callLLM({
    system: `You are a senior architect with extended thinking capability.
Think deeply about this problem. Use chain-of-thought reasoning.
Consider: edge cases, scalability, security, performance, maintainability, user experience.

Structure your thinking:
1. Understand the problem fully
2. Consider multiple approaches
3. Evaluate trade-offs
4. Identify risks and mitigations
5. Choose the best approach with reasoning

Respond with JSON:
{
  "reasoning": "detailed step-by-step reasoning (be thorough)",
  "plan": ["ordered steps to implement"],
  "risks": ["potential risks"],
  "alternatives": ["alternative approaches considered"],
  "confidence": 0.0-1.0,
  "decision": "final decision with justification"
}`,
    messages: [{
      role: "user",
      content: `${params.context ? `Context:\n${params.context}\n\n` : ""}Problem: ${params.problem}`,
    }],
    maxTokens: budget,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed) return { success: false, output: "נכשל בחשיבה מעמיקה", result: null };

  const result: ThinkingResult = {
    reasoning: parsed.reasoning || "",
    plan: parsed.plan || [],
    risks: parsed.risks || [],
    alternatives: parsed.alternatives || [],
    confidence: parsed.confidence || 0,
    decision: parsed.decision || "",
  };

  const lines = [
    `🧠 חשיבה מעמיקה — ביטחון: ${Math.round(result.confidence * 100)}%`,
    `\nהחלטה: ${result.decision}`,
    `\nנימוק: ${result.reasoning.slice(0, 500)}${result.reasoning.length > 500 ? "..." : ""}`,
    `\nתוכנית (${result.plan.length} צעדים):`,
    ...result.plan.map((s, i) => `  ${i + 1}. ${s}`),
    `\nסיכונים: ${result.risks.join(" | ")}`,
    `\nחלופות שנשקלו: ${result.alternatives.join(" | ")}`,
  ];

  return { success: true, output: lines.join("\n"), result };
}

export async function architectReview(params: {
  code: string;
  filePath: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🏗️ סקירת ארכיטקטורה...");

  const response = await callLLM({
    system: `You are a principal architect reviewing code. Provide:
1. Architecture quality score (1-10)
2. SOLID principles compliance
3. Design pattern suggestions
4. Security vulnerabilities
5. Performance bottlenecks
6. Scalability concerns
7. Specific refactoring suggestions with code

Be thorough and actionable. Hebrew output.`,
    messages: [{ role: "user", content: `Review ${params.filePath}:\n\`\`\`\n${params.code.slice(0, 6000)}\n\`\`\`` }],
    maxTokens: 4096,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function debugWithReasoning(params: {
  error: string;
  code: string;
  stackTrace?: string;
}): Promise<{ success: boolean; output: string; fix?: string }> {
  console.log("\n🔬 דיבוג עם חשיבה מעמיקה...");

  const response = await callLLM({
    system: `You are a debugging expert. Use systematic reasoning:
1. Parse the error message
2. Identify the root cause (not just the symptom)
3. Trace the execution path
4. Consider related side effects
5. Provide the exact fix

Respond with JSON:
{
  "rootCause": "the actual root cause",
  "reasoning": "step by step debug process",
  "fix": "exact code fix",
  "prevention": "how to prevent this in the future"
}`,
    messages: [{
      role: "user",
      content: `Error: ${params.error}\n${params.stackTrace ? `Stack: ${params.stackTrace}\n` : ""}Code:\n\`\`\`\n${params.code.slice(0, 4000)}\n\`\`\``,
    }],
    maxTokens: 4096,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed) return { success: false, output: "נכשל בדיבוג" };

  return {
    success: true,
    output: `🔬 שורש הבעיה: ${parsed.rootCause}\n\nנימוק: ${parsed.reasoning}\n\nמניעה: ${parsed.prevention}`,
    fix: parsed.fix,
  };
}

export const EXTENDED_THINKING_TOOLS = [
  {
    name: "deep_think",
    description: "חשיבה מעמיקה — ניתוח בעיה מכל הזוויות, סיכונים, חלופות, תוכנית מפורטת",
    input_schema: {
      type: "object" as const,
      properties: {
        problem: { type: "string", description: "תיאור הבעיה/משימה" },
        context: { type: "string", description: "הקשר נוסף" },
        budgetTokens: { type: "number", description: "תקציב טוקנים לחשיבה (ברירת מחדל: 10000)" },
      },
      required: ["problem"] as string[],
    },
  },
  {
    name: "architect_review",
    description: "סקירת ארכיטקטורה — SOLID, design patterns, security, performance, scalability",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "הקוד לסקירה" },
        filePath: { type: "string", description: "נתיב הקובץ" },
      },
      required: ["code", "filePath"] as string[],
    },
  },
  {
    name: "debug_with_reasoning",
    description: "דיבוג מתקדם — חשיבה שיטתית, זיהוי שורש הבעיה, תיקון מדויק",
    input_schema: {
      type: "object" as const,
      properties: {
        error: { type: "string", description: "הודעת השגיאה" },
        code: { type: "string", description: "הקוד הבעייתי" },
        stackTrace: { type: "string", description: "Stack trace" },
      },
      required: ["error", "code"] as string[],
    },
  },
];
