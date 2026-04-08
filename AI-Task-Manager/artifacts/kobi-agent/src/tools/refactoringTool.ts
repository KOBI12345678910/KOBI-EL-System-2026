import * as fs from "fs";
import * as path from "path";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { runCommand } from "./terminalTool";
import { findFiles } from "./searchTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

export async function renameSymbol(params: { oldName: string; newName: string; filePattern?: string }): Promise<{ success: boolean; output: string }> {
  const pattern = params.filePattern || "*.ts";
  const grep = await runCommand({ command: `grep -rl "${params.oldName}" --include="${pattern}" . 2>/dev/null | head -50`, timeout: 10000 });
  const files = (grep.stdout || "").split("\n").filter(Boolean);
  if (!files.length) return { success: false, output: `"${params.oldName}" not found in ${pattern} files` };

  let changed = 0;
  for (const file of files) {
    const fullPath = path.isAbsolute(file) ? file : path.join(WORKSPACE_DIR, file);
    try {
      let content = fs.readFileSync(fullPath, "utf-8");
      const regex = new RegExp(`\\b${params.oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      const newContent = content.replace(regex, params.newName);
      if (newContent !== content) { fs.writeFileSync(fullPath, newContent); changed++; }
    } catch {}
  }
  return { success: true, output: `Renamed "${params.oldName}" → "${params.newName}" in ${changed} files` };
}

export async function extractFunction(params: { filePath: string; startLine: number; endLine: number; functionName: string }): Promise<{ success: boolean; output: string }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const extracted = lines.slice(params.startLine - 1, params.endLine).join("\n");

    const response = await callLLM({
      system: `Extract the selected code into a new function named "${params.functionName}".
- Detect parameters needed from the surrounding scope
- Add proper TypeScript types
- Replace the original code with a function call
- Return the FULL file content with both the new function and the updated original code
Respond with ONLY the complete file content.`,
      messages: [{ role: "user", content: `File: ${params.filePath}\nExtract lines ${params.startLine}-${params.endLine}:\n\n${content}` }],
      maxTokens: 8192,
    });

    let result = extractTextContent(response.content);
    result = result.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
    fs.writeFileSync(fullPath, result);
    return { success: true, output: `Extracted function "${params.functionName}" from lines ${params.startLine}-${params.endLine}` };
  } catch (e: any) {
    return { success: false, output: `Extract failed: ${e.message}` };
  }
}

export async function moveToFile(params: { sourcePath: string; symbolName: string; targetPath: string }): Promise<{ success: boolean; output: string }> {
  const srcFull = path.isAbsolute(params.sourcePath) ? params.sourcePath : path.join(WORKSPACE_DIR, params.sourcePath);
  const tgtFull = path.isAbsolute(params.targetPath) ? params.targetPath : path.join(WORKSPACE_DIR, params.targetPath);
  try {
    const sourceContent = fs.readFileSync(srcFull, "utf-8");
    const targetContent = fs.existsSync(tgtFull) ? fs.readFileSync(tgtFull, "utf-8") : "";

    const response = await callLLM({
      system: `Move the symbol "${params.symbolName}" from source to target file.
- Remove it from the source file
- Add it to the target file with proper imports
- Update the source file to import from the target file if needed
- Fix all import paths
Return JSON: {"source": "new source content", "target": "new target content"}`,
      messages: [{ role: "user", content: `Source (${params.sourcePath}):\n${sourceContent.slice(0, 5000)}\n\nTarget (${params.targetPath}):\n${targetContent.slice(0, 3000)}` }],
      maxTokens: 8192,
    });

    let result = extractTextContent(response.content);
    result = result.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
    const parsed = JSON.parse(result);
    fs.writeFileSync(srcFull, parsed.source);
    const tgtDir = path.dirname(tgtFull);
    if (!fs.existsSync(tgtDir)) fs.mkdirSync(tgtDir, { recursive: true });
    fs.writeFileSync(tgtFull, parsed.target);
    return { success: true, output: `Moved "${params.symbolName}" from ${params.sourcePath} → ${params.targetPath}` };
  } catch (e: any) {
    return { success: false, output: `Move failed: ${e.message}` };
  }
}

export async function autoImport(params: { filePath: string }): Promise<{ success: boolean; output: string }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const response = await callLLM({
      system: `Analyze the TypeScript/JavaScript file and add all missing imports.
- Detect undefined references that need imports
- Use the correct import paths based on common patterns
- Don't duplicate existing imports
- Return ONLY the complete file content with all imports added`,
      messages: [{ role: "user", content: `Add missing imports to:\n\n${content}` }],
      maxTokens: 8192,
    });

    let result = extractTextContent(response.content);
    result = result.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
    fs.writeFileSync(fullPath, result);
    return { success: true, output: `Auto-imported missing dependencies in ${params.filePath}` };
  } catch (e: any) {
    return { success: false, output: `Auto-import failed: ${e.message}` };
  }
}

export const REFACTORING_TOOLS = [
  { name: "rename_symbol", description: "Rename a variable/function/class across all files (safe word-boundary rename)", input_schema: { type: "object" as const, properties: { oldName: { type: "string" }, newName: { type: "string" }, filePattern: { type: "string", description: "File pattern (default *.ts)" } }, required: ["oldName", "newName"] as string[] } },
  { name: "extract_function", description: "Extract code lines into a new function with AI-detected parameters", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" }, functionName: { type: "string" } }, required: ["filePath", "startLine", "endLine", "functionName"] as string[] } },
  { name: "move_to_file", description: "Move a symbol (function/class/const) from one file to another, updating imports", input_schema: { type: "object" as const, properties: { sourcePath: { type: "string" }, symbolName: { type: "string" }, targetPath: { type: "string" } }, required: ["sourcePath", "symbolName", "targetPath"] as string[] } },
  { name: "auto_import", description: "Automatically add missing imports to a TypeScript/JavaScript file", input_schema: { type: "object" as const, properties: { filePath: { type: "string" } }, required: ["filePath"] as string[] } },
];