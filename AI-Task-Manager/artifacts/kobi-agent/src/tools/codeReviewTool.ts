import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile } from "./fileTool";
import { searchFiles, searchContent } from "./searchTool";

export interface ReviewIssue {
  file: string;
  line?: number;
  severity: "critical" | "warning" | "suggestion" | "info";
  category: string;
  message: string;
  suggestion?: string;
}

export async function reviewFile(params: { file: string }): Promise<{ success: boolean; output: string; review?: any }> {
  const content = await readFile({ path: params.file });
  if (!content.success) return { success: false, output: `Cannot read: ${params.file}` };

  const response = await callLLM({
    system: `You are a senior code reviewer. Review the code for:
1. Bugs and logic errors
2. Security vulnerabilities (SQL injection, XSS, auth issues, exposed secrets)
3. Performance issues (N+1 queries, memory leaks, unnecessary re-renders)
4. Code quality (naming, structure, DRY, SOLID principles)
5. Error handling (missing try/catch, unhandled promises)
6. TypeScript best practices (proper typing, no unnecessary 'any')
7. Testing gaps

Respond ONLY with JSON:
{
  "score": 0-100,
  "issues": [{ "file": "", "line": null, "severity": "critical|warning|suggestion|info", "category": "", "message": "", "suggestion": "" }],
  "summary": "",
  "strengths": ["..."],
  "improvements": ["..."]
}`,
    messages: [{ role: "user", content: `Review this file (${params.file}):\n\n\`\`\`\n${content.output}\n\`\`\`` }],
  });

  const text = extractTextContent(response.content);
  const review = extractJSON(text) || { score: 0, issues: [], summary: "Could not parse review", strengths: [], improvements: [] };
  return { success: true, output: `Score: ${review.score}/100 | ${review.issues?.length || 0} issues\n${review.summary}`, review };
}

export async function reviewProject(params: { max_files?: number } = {}): Promise<{ success: boolean; output: string; result?: any }> {
  const maxFiles = params.max_files || 20;
  const files = await searchFiles({ pattern: "*.ts", maxResults: maxFiles });
  const codeFiles = (files.matches || []).filter((f: string) => /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f) && !f.includes("node_modules")).slice(0, maxFiles);

  const fileReviews: Array<{ file: string; score: number; issueCount: number }> = [];
  const allIssues: ReviewIssue[] = [];

  for (const file of codeFiles) {
    try {
      const result = await reviewFile({ file });
      if (result.review) {
        fileReviews.push({ file, score: result.review.score, issueCount: result.review.issues?.length || 0 });
        if (result.review.issues) allIssues.push(...result.review.issues.map((i: any) => ({ ...i, file })));
      }
    } catch {}
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, suggestion: 2, info: 3 };
  allIssues.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

  const avgScore = fileReviews.length > 0 ? Math.round(fileReviews.reduce((sum, r) => sum + r.score, 0) / fileReviews.length) : 0;
  const criticalCount = allIssues.filter(i => i.severity === "critical").length;

  const result = { overallScore: avgScore, fileReviews, topIssues: allIssues.slice(0, 20), summary: `Reviewed ${fileReviews.length} files. Score: ${avgScore}/100. ${allIssues.length} issues (${criticalCount} critical).` };
  return { success: true, output: result.summary, result };
}

export async function securityScan(): Promise<{ success: boolean; output: string; issues?: ReviewIssue[] }> {
  const patterns = [
    { query: "password", category: "Hardcoded Credentials" },
    { query: "api_key", category: "Exposed API Key" },
    { query: "secret", category: "Exposed Secret" },
    { query: "eval(", category: "Code Injection" },
    { query: "innerHTML", category: "XSS Risk" },
    { query: "dangerouslySetInnerHTML", category: "XSS Risk" },
    { query: "exec(", category: "Command Injection" },
    { query: "console.log", category: "Debug Logging" },
    { query: "TODO", category: "Unfinished Code" },
    { query: "FIXME", category: "Known Bug" },
  ];

  const issues: ReviewIssue[] = [];
  const criticalCategories = ["Hardcoded Credentials", "Exposed API Key", "Exposed Secret", "Code Injection", "Command Injection"];

  for (const pattern of patterns) {
    const results = await searchContent({ query: pattern.query, filePattern: "**/*.{ts,tsx,js,jsx,py}", maxResults: 20 });
    for (const result of (results.matches || [])) {
      if (result.file?.includes("node_modules") || result.file?.includes(".test.") || result.file?.includes(".spec.")) continue;
      issues.push({
        file: result.file,
        line: result.line,
        severity: criticalCategories.includes(pattern.category) ? "critical" : "warning",
        category: pattern.category,
        message: `Found '${pattern.query}' - potential ${pattern.category.toLowerCase()}`,
        suggestion: `Review and secure this usage of ${pattern.query}`,
      });
    }
  }

  const critical = issues.filter(i => i.severity === "critical").length;
  return { success: true, output: `Security scan: ${issues.length} findings (${critical} critical)`, issues };
}

export const CODE_REVIEW_TOOLS = [
  { name: "review_file", description: "AI code review for a single file - checks bugs, security, performance, quality", input_schema: { type: "object" as const, properties: { file: { type: "string" } }, required: ["file"] as string[] } },
  { name: "review_project", description: "AI code review for the entire project - reviews all source files", input_schema: { type: "object" as const, properties: { max_files: { type: "number" } }, required: [] as string[] } },
  { name: "security_scan", description: "Scan codebase for security vulnerabilities (credentials, XSS, injection, etc.)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];