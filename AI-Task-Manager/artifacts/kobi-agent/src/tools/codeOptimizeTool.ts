import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile, listFiles } from "./fileTool";
import { searchCode, findAndReplace } from "./searchTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function analyzeAndOptimize(params: {
  targets?: string;
  autoApply?: boolean;
  types?: string;
}): Promise<{ success: boolean; output: string; optimizations: any[] }> {
  console.log("\n⚡ מנתח ומייעל קוד...");

  let files: string[] = [];
  if (params.targets) {
    files = params.targets.split(",").map(f => f.trim());
  } else {
    const listResult = await listFiles({ path: `${WORKSPACE}/src`, recursive: true });
    if (listResult.output) {
      files = listResult.output.split("\n")
        .filter(f => f.endsWith(".ts") || f.endsWith(".tsx"))
        .slice(0, 20);
    }
  }

  const optimizations: any[] = [];

  for (const file of files) {
    const content = await readFile({ path: file });
    if (!content.success || !content.output || content.output.length < 200) continue;

    const response = await callLLM({
      system: `You are a performance optimization expert. Analyze code and find optimizations.
Focus on:
- React: memo, useMemo, useCallback, lazy loading, code splitting
- Queries: N+1, missing indexes, unnecessary fetches
- Bundle: tree-shaking, dynamic imports, dead code
- Memory: leaks, unnecessary closures, large objects
- Network: batching, caching, compression

Respond with JSON:
{
  "optimizations": [
    {
      "type": "performance|bundle|memory|query|render|network|security",
      "description": "what to optimize",
      "impact": "high|medium|low",
      "before": "the code to replace (exact match)",
      "after": "optimized replacement code"
    }
  ]
}
Only include optimizations where you're confident the change is correct.`,
      messages: [{ role: "user", content: `Optimize ${file}:\n\`\`\`\n${content.output.slice(0, 4000)}\n\`\`\`` }],
    });

    const parsed = extractJSON(extractTextContent(response.content));
    if (!parsed?.optimizations) continue;

    for (const opt of parsed.optimizations) {
      const optimization = { file, ...opt, applied: false };

      if (params.autoApply && content.output.includes(opt.before)) {
        const newContent = content.output.replace(opt.before, opt.after);
        await writeFile({ path: file, content: newContent });
        optimization.applied = true;
      }

      optimizations.push(optimization);
    }
  }

  const applied = optimizations.filter(o => o.applied).length;
  const lines = optimizations.map(o => {
    const icon = o.impact === "high" ? "🔴" : o.impact === "medium" ? "🟡" : "🟢";
    const status = o.applied ? "✅" : "⏳";
    return `${icon} ${status} [${o.type}] ${o.file}: ${o.description}`;
  });

  return {
    success: true,
    output: `נמצאו ${optimizations.length} אופטימיזציות (${applied} הוחלו):\n${lines.join("\n")}`,
    optimizations,
  };
}

export async function quickOptimize(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n⚡ אופטימיזציה מהירה...");
  const changes: string[] = [];
  let count = 0;

  const consoleLogs = await findAndReplace({
    searchText: "console.log(",
    replaceText: "// console.log(",
    filePattern: `${WORKSPACE}/src/**/*.{ts,tsx}`,
    dryRun: false,
  });
  if (consoleLogs.success && consoleLogs.results && consoleLogs.results.length > 0) {
    count++;
    changes.push("הוסרו console.log מקוד ייצור");
  }

  const imgSearch = await searchCode({ pattern: "<img ", filePattern: `${WORKSPACE}/**/*.tsx` });
  if (imgSearch.success && imgSearch.results) {
    const resultStr = typeof imgSearch.results === "string" ? imgSearch.results : JSON.stringify(imgSearch.results);
    const imgFiles = resultStr.split("\n").filter(Boolean);
    for (const line of imgFiles.slice(0, 10)) {
      const filePath = line.split(":")[0];
      if (!filePath) continue;
      const content = await readFile({ path: filePath });
      if (content.success && content.output && !content.output.includes('loading="lazy"')) {
        const updated = content.output.replace(/<img\s/g, '<img loading="lazy" ');
        if (updated !== content.output) {
          await writeFile({ path: filePath, content: updated });
          count++;
          changes.push(`lazy loading הוסף ל-${filePath}`);
        }
      }
    }
  }

  return {
    success: true,
    output: changes.length > 0
      ? `אופטימיזציה מהירה — ${count} שינויים:\n${changes.join("\n")}`
      : "לא נמצאו אופטימיזציות מהירות להחלה",
  };
}

export const CODE_OPTIMIZE_TOOLS = [
  {
    name: "analyze_and_optimize",
    description: "ניתוח קוד מעמיק ואופטימיזציה — performance, bundle, memory, queries, render, network, security",
    input_schema: {
      type: "object" as const,
      properties: {
        targets: { type: "string", description: "קבצים לניתוח (מופרדים בפסיק, אופציונלי)" },
        autoApply: { type: "boolean", description: "להחיל שינויים אוטומטית (ברירת מחדל: false)" },
        types: { type: "string", description: "סוגי אופטימיזציה (מופרדים בפסיק)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "quick_optimize",
    description: "אופטימיזציה מהירה ובטוחה — הסרת console.log, lazy loading לתמונות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
