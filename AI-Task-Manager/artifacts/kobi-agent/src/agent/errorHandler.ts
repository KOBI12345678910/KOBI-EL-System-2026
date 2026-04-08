import { callLLM } from "../llm/client";
import { fillPrompt, ERROR_FIX_PROMPT } from "../llm/prompts";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile, editFile } from "../tools/fileTool";
import { runCommand } from "../tools/terminalTool";
import { installPackage } from "../tools/packageTool";
import { AgentMemory } from "./memory";
import type { Step } from "./planner";
import type { ExecutionResult } from "./executor";

export interface ErrorFix {
  analysis: string;
  fix: {
    type: "edit_file" | "run_command" | "install_package" | "create_file";
    details: any;
  };
  explanation: string;
}

export interface ErrorAnalysis {
  diagnosis: string;
  fixSteps: Step[];
  canContinue: boolean;
}

const memory = new AgentMemory(process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace");

export async function analyzeError(
  failedStep: Step,
  result: ExecutionResult,
  previousSteps: ExecutionResult[],
): Promise<ErrorAnalysis> {
  const quickFix = tryQuickFix(result.error || "");
  if (quickFix) {
    return {
      diagnosis: quickFix.description,
      fixSteps: [{
        id: `fix_${failedStep.id}_quick`,
        action: "run_command",
        params: { command: quickFix.command },
        description: quickFix.description,
        depends_on: [],
      }],
      canContinue: true,
    };
  }

  let fileContent = "";
  if (failedStep.params?.path) {
    const readResult = await readFile({ path: failedStep.params.path });
    if (readResult.success) fileContent = readResult.output || "";
  }

  const context = memory.getProjectContext();

  try {
    const response = await callLLM({
      system: "You are an expert debugger. Analyze errors and provide precise fixes.",
      messages: [{
        role: "user",
        content: fillPrompt(ERROR_FIX_PROMPT, {
          FILE_CONTENT: fileContent || "N/A",
          ERROR: result.error || "Unknown error",
          COMMAND: `${failedStep.action}: ${JSON.stringify(failedStep.params)}`,
          CONTEXT: context,
        }),
      }],
    });

    const text = extractTextContent(response.content);
    const fix = extractJSON(text) as ErrorFix | null;

    if (!fix || !fix.fix) {
      return {
        diagnosis: `Error in step ${failedStep.id}: ${result.error}`,
        fixSteps: [],
        canContinue: true,
      };
    }

    const fixStep: Step = {
      id: `fix_${failedStep.id}_1`,
      action: fix.fix.type,
      params: fix.fix.details || {},
      description: fix.explanation || "Fix",
      depends_on: [],
    };

    return {
      diagnosis: fix.analysis,
      fixSteps: [fixStep],
      canContinue: true,
    };
  } catch (e: any) {
    return {
      diagnosis: `Error analysis failed: ${e.message}`,
      fixSteps: [],
      canContinue: true,
    };
  }
}

export async function analyzeAndFix(params: {
  error: string;
  command?: string;
  filePath?: string;
  stepDescription: string;
  taskId: string;
  attempt: number;
}): Promise<{ success: boolean; output: string }> {
  const quickFix = tryQuickFix(params.error);
  if (quickFix) {
    const result = await runCommand({ command: quickFix.command!, timeout: 120000 });
    if (result.success) return { success: true, output: result.stdout };
  }

  let fileContent = "";
  if (params.filePath) {
    const readResult = await readFile({ path: params.filePath });
    if (readResult.success) fileContent = readResult.output || "";
  }

  const context = memory.getProjectContext();
  const response = await callLLM({
    system: "You are an expert debugger. Analyze errors and provide precise fixes.",
    messages: [{
      role: "user",
      content: fillPrompt(ERROR_FIX_PROMPT, {
        FILE_CONTENT: fileContent || "N/A",
        ERROR: params.error,
        COMMAND: params.command || "N/A",
        CONTEXT: context,
      }),
    }],
  });

  const text = extractTextContent(response.content);
  const fix = extractJSON(text) as ErrorFix | null;

  if (!fix || !fix.fix) {
    return { success: false, output: "No fix found" };
  }

  return applyFix(fix, params.taskId);
}

function tryQuickFix(error: string): { type: string; command?: string; description: string } | null {
  const lowerError = error.toLowerCase();

  if (lowerError.includes("cannot find module") || lowerError.includes("module not found")) {
    const moduleMatch = error.match(/Cannot find module '([^']+)'/);
    if (moduleMatch) {
      const mod = moduleMatch[1].startsWith(".") ? null : moduleMatch[1].split("/")[0];
      if (mod) {
        return { type: "install", command: `pnpm add ${mod}`, description: `Install missing module: ${mod}` };
      }
    }
  }

  if (lowerError.includes("ts") && lowerError.includes("type") && lowerError.includes("@types/")) {
    const typeMatch = error.match(/@types\/([^\s'"]+)/);
    if (typeMatch) {
      return { type: "install", command: `pnpm add -D @types/${typeMatch[1]}`, description: `Install types: @types/${typeMatch[1]}` };
    }
  }

  if (lowerError.includes("permission denied") || lowerError.includes("eacces")) {
    return { type: "command", command: "chmod -R 755 .", description: "Fix file permissions" };
  }

  if (lowerError.includes("eaddrinuse") || lowerError.includes("address already in use")) {
    const portMatch = error.match(/port\s*:?\s*(\d+)/i) || error.match(/:(\d+)/);
    if (portMatch) {
      return { type: "command", command: `kill -9 $(lsof -t -i:${portMatch[1]}) 2>/dev/null; echo "Port freed"`, description: `Kill process on port ${portMatch[1]}` };
    }
  }

  if (lowerError.includes("node_modules") || lowerError.includes("peer dep")) {
    return { type: "command", command: "rm -rf node_modules && pnpm install", description: "Clean reinstall node_modules" };
  }

  if (lowerError.includes("no module named")) {
    const modMatch = error.match(/No module named '([^']+)'/);
    if (modMatch) {
      return { type: "command", command: `pip install ${modMatch[1]}`, description: `Install Python module: ${modMatch[1]}` };
    }
  }

  return null;
}

async function applyFix(fix: ErrorFix, taskId: string): Promise<{ success: boolean; output: string }> {
  switch (fix.fix.type) {
    case "edit_file": {
      const result = await editFile({ path: fix.fix.details.path, changes: fix.fix.details.changes });
      memory.addError(taskId, 0, fix.analysis, fix.explanation);
      return { success: result.success, output: result.output || result.error || "" };
    }
    case "run_command": {
      const result = await runCommand({ command: fix.fix.details.command, timeout: 120000 });
      return { success: result.success, output: result.stdout + result.stderr };
    }
    case "install_package": {
      const packages = fix.fix.details.packages || [fix.fix.details.package];
      const result = await installPackage({ packages, dev: fix.fix.details.dev });
      return { success: result.success, output: result.output || result.error || "" };
    }
    case "create_file": {
      const result = await writeFile({ path: fix.fix.details.path, content: fix.fix.details.content });
      return { success: result.success, output: result.output || result.error || "" };
    }
    default:
      return { success: false, output: `Unknown fix type: ${fix.fix.type}` };
  }
}

export function isRetryable(error: string): boolean {
  const retryable = [
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND",
    "timeout", "rate limit", "429", "503", "502",
  ];
  return retryable.some(r => error.toLowerCase().includes(r.toLowerCase()));
}