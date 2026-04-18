import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

export async function searchForSolution(params: {
  query: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n🔍 Searching: ${params.query.slice(0, 60)}...`);

  const response = await callLLM({
    system: `You are a coding assistant with web search. Search for the most up-to-date solution.
Provide a clear, actionable answer with code examples.`,
    messages: [{ role: "user", content: params.query }],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
  });

  const answer = extractTextContent(response.content);
  return { success: true, output: answer };
}

export async function searchDocs(params: {
  technology: string;
  topic: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n📚 Searching docs: ${params.technology} — ${params.topic}`);

  const response = await callLLM({
    system: `Search for the latest documentation and best practices. Provide specific, actionable code.`,
    messages: [{ role: "user", content: `${params.technology} documentation: ${params.topic}. Give me the latest working code example.` }],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
  });

  return { success: true, output: extractTextContent(response.content) };
}

export async function searchForPackage(params: {
  need: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n📦 Finding package: ${params.need.slice(0, 60)}...`);

  const response = await callLLM({
    system: `Find the best npm package for the described need. Compare options and recommend the best one.
Respond with JSON: { "recommended": "package-name", "alternatives": ["alt1", "alt2"], "installCommand": "npm install ...", "example": "code example" }`,
    messages: [{ role: "user", content: `Find best npm package for: ${params.need}` }],
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
  });

  const text = extractTextContent(response.content);
  const parsed = extractJSON(text);

  if (parsed?.recommended) {
    const lines = [
      `## Package Recommendation`,
      ``,
      `**Recommended**: \`${parsed.recommended}\``,
      `**Install**: \`${parsed.installCommand}\``,
      parsed.alternatives?.length ? `**Alternatives**: ${parsed.alternatives.join(", ")}` : "",
      ``,
      `### Example:`,
      `\`\`\``,
      parsed.example || "",
      `\`\`\``,
    ].filter(Boolean);
    return { success: true, output: lines.join("\n") };
  }

  return { success: true, output: text };
}

export const WEB_SEARCH_BUILD_TOOLS = [
  {
    name: "search_for_solution",
    description: "חיפוש פתרון באינטרנט — מוצא תשובות, קוד, תיעוד עדכני",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "שאלה או בעיה לחיפוש" },
      },
      required: ["query"] as string[],
    },
  },
  {
    name: "search_docs",
    description: "חיפוש תיעוד טכנולוגיה — דוגמאות קוד עדכניות ו-best practices",
    input_schema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "שם הטכנולוגיה (React, Express, etc.)" },
        topic: { type: "string", description: "נושא ספציפי" },
      },
      required: ["technology", "topic"] as string[],
    },
  },
  {
    name: "search_for_package",
    description: "מציאת חבילת npm מתאימה — השוואה, המלצה, דוגמת קוד",
    input_schema: {
      type: "object" as const,
      properties: {
        need: { type: "string", description: "מה צריך — תיאור הצורך" },
      },
      required: ["need"] as string[],
    },
  },
];
