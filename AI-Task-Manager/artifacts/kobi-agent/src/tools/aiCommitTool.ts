import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { runCommand } from "./terminalTool";

export async function generateCommitMessage(params: { staged?: boolean }): Promise<{ success: boolean; output: string }> {
  const diff = await runCommand({ command: params.staged !== false ? "git diff --cached --stat && git diff --cached" : "git diff --stat && git diff", timeout: 10000 });
  if (!diff.stdout?.trim()) return { success: false, output: "No changes to commit" };

  const response = await callLLM({
    system: `You are a git commit message expert. Generate a conventional commit message from the diff.
Format: <type>(<scope>): <subject>\n\n<body>
Types: feat, fix, refactor, docs, style, test, chore, perf, ci
Keep subject under 72 chars. Body explains WHY not WHAT. Hebrew comments are OK but commit in English.
Respond with ONLY the commit message.`,
    messages: [{ role: "user", content: `Generate commit message:\n${diff.stdout.slice(0, 6000)}` }],
    maxTokens: 500,
  });

  const msg = extractTextContent(response.content).trim();
  return { success: true, output: msg };
}

export async function autoCommit(params: { message?: string }): Promise<{ success: boolean; output: string }> {
  let msg = params.message;
  if (!msg) {
    await runCommand({ command: "git add -A", timeout: 5000 });
    const result = await generateCommitMessage({ staged: true });
    if (!result.success) return result;
    msg = result.output;
  }
  const commitResult = await runCommand({ command: `git commit -m "${msg!.replace(/"/g, '\\"')}"`, timeout: 10000 });
  return { success: commitResult.success, output: `Committed: ${msg}\n${commitResult.stdout}` };
}

export async function generateChangelog(params: { from?: string; to?: string }): Promise<{ success: boolean; output: string }> {
  const range = params.from ? `${params.from}..${params.to || "HEAD"}` : "--oneline -50";
  const log = await runCommand({ command: `git log ${range} --pretty=format:"%h %s"`, timeout: 5000 });
  if (!log.stdout?.trim()) return { success: false, output: "No commits found" };

  const response = await callLLM({
    system: "Generate a CHANGELOG.md section from git commits. Group by: Added, Changed, Fixed, Removed. Use markdown. Respond with ONLY the changelog content.",
    messages: [{ role: "user", content: `Commits:\n${log.stdout}` }],
    maxTokens: 2000,
  });

  return { success: true, output: extractTextContent(response.content) };
}

export const AI_COMMIT_TOOLS = [
  { name: "generate_commit_message", description: "AI-generate a conventional commit message from staged/unstaged changes", input_schema: { type: "object" as const, properties: { staged: { type: "boolean", description: "Use staged changes only (default true)" } }, required: [] as string[] } },
  { name: "auto_commit", description: "Stage all changes and commit with AI-generated message", input_schema: { type: "object" as const, properties: { message: { type: "string", description: "Custom message (auto-generates if empty)" } }, required: [] as string[] } },
  { name: "ai_generate_changelog", description: "Generate CHANGELOG from git history using AI", input_schema: { type: "object" as const, properties: { from: { type: "string", description: "Start commit/tag" }, to: { type: "string", description: "End commit (default HEAD)" } }, required: [] as string[] } },
];