import * as fs from "fs";
import * as path from "path";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { runCommand } from "./terminalTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

export async function detectConflicts(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: "git diff --name-only --diff-filter=U", timeout: 5000 });
  const files = (result.stdout || "").split("\n").filter(Boolean);
  if (!files.length) return { success: true, output: "No merge conflicts detected" };
  return { success: true, output: `${files.length} conflicted files:\n${files.map(f => `  - ${f}`).join("\n")}` };
}

export async function resolveConflict(params: { filePath: string; strategy?: string }): Promise<{ success: boolean; output: string }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes("<<<<<<<")) return { success: true, output: `No conflicts in ${params.filePath}` };

    if (params.strategy === "ours") {
      const resolved = content.replace(/<<<<<<< .*\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> .*\n/g, "$1");
      fs.writeFileSync(fullPath, resolved);
      return { success: true, output: `Resolved ${params.filePath} using OURS strategy` };
    }
    if (params.strategy === "theirs") {
      const resolved = content.replace(/<<<<<<< .*\n[\s\S]*?=======\n([\s\S]*?)>>>>>>> .*\n/g, "$1");
      fs.writeFileSync(fullPath, resolved);
      return { success: true, output: `Resolved ${params.filePath} using THEIRS strategy` };
    }

    const response = await callLLM({
      system: `You are a merge conflict resolver. Analyze the conflict markers and produce the best merged result.
Rules:
- Keep both changes when they don't overlap
- Prefer newer/better code when they conflict
- Remove ALL conflict markers (<<<<<<, =======, >>>>>>>)
- Return ONLY the resolved file content, no explanations`,
      messages: [{ role: "user", content: `Resolve conflicts in ${params.filePath}:\n\n${content.slice(0, 8000)}` }],
      maxTokens: 8192,
    });

    let resolved = extractTextContent(response.content);
    resolved = resolved.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
    fs.writeFileSync(fullPath, resolved);
    return { success: true, output: `AI-resolved conflicts in ${params.filePath}` };
  } catch (e: any) {
    return { success: false, output: `Failed: ${e.message}` };
  }
}

export async function resolveAllConflicts(params: { strategy?: string }): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: "git diff --name-only --diff-filter=U", timeout: 5000 });
  const files = (result.stdout || "").split("\n").filter(Boolean);
  if (!files.length) return { success: true, output: "No conflicts to resolve" };

  const results: string[] = [];
  for (const file of files) {
    const r = await resolveConflict({ filePath: file, strategy: params.strategy });
    results.push(`${file}: ${r.success ? "OK" : "FAILED"}`);
    if (r.success) await runCommand({ command: `git add "${file}"`, timeout: 3000 });
  }
  return { success: true, output: `Resolved ${files.length} files:\n${results.join("\n")}` };
}

export const MERGE_CONFLICT_TOOLS = [
  { name: "detect_conflicts", description: "Detect merge conflicts in the current git state", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "resolve_conflict", description: "Resolve merge conflict in a file using AI or strategy (ours/theirs)", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, strategy: { type: "string", enum: ["ai", "ours", "theirs"], description: "Resolution strategy (default: ai)" } }, required: ["filePath"] as string[] } },
  { name: "resolve_all_conflicts", description: "Resolve all merge conflicts at once", input_schema: { type: "object" as const, properties: { strategy: { type: "string", enum: ["ai", "ours", "theirs"] } }, required: [] as string[] } },
];