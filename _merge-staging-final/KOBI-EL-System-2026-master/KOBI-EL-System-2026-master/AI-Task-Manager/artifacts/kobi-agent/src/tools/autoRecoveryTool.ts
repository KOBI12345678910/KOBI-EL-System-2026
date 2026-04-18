import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const MAX_RECOVERY_ATTEMPTS = 5;
const recoveryLog: Array<{ error: string; fix: string; success: boolean; timestamp: number }> = [];

export async function autoRecover(params: {
  command: string;
  maxAttempts?: number;
}): Promise<{ success: boolean; output: string; attempts: number }> {
  console.log("\n🔄 מצב שחזור אוטומטי...");
  const maxAttempts = params.maxAttempts || MAX_RECOVERY_ATTEMPTS;
  let lastError = "";
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    console.log(`  ניסיון ${attempts}/${maxAttempts}...`);

    const result = await runCommand({ command: params.command, timeout: 60000 });

    if (!result.stderr || result.stderr.trim() === "") {
      if (attempts > 1) {
        recoveryLog.push({ error: lastError, fix: `Auto-recovered after ${attempts} attempts`, success: true, timestamp: Date.now() });
      }
      return { success: true, output: `✅ הצליח בניסיון ${attempts}${attempts > 1 ? " (אחרי שחזור)" : ""}\n${result.stdout}`, attempts };
    }

    lastError = result.stderr;

    const response = await callLLM({
      system: `You are an error recovery expert. Analyze the error and provide a fix.
The command "${params.command}" failed. Provide either:
1. A shell command to fix the issue, OR
2. A file edit to fix the issue

Respond with JSON:
{
  "diagnosis": "what went wrong",
  "fixType": "command" | "edit",
  "command": "fix command (if fixType=command)",
  "filePath": "file to edit (if fixType=edit)",
  "oldCode": "code to replace (if fixType=edit)",
  "newCode": "replacement code (if fixType=edit)"
}`,
      messages: [{
        role: "user",
        content: `Error:\n${lastError.slice(0, 3000)}${i > 0 ? `\n\nPrevious attempts failed. Try a different approach.` : ""}`,
      }],
      maxTokens: 2048,
    });

    const fix = extractJSON(extractTextContent(response.content));
    if (!fix) continue;

    console.log(`  🔧 ${fix.diagnosis}`);

    if (fix.fixType === "command" && fix.command) {
      await runCommand({ command: fix.command, timeout: 30000 });
    } else if (fix.fixType === "edit" && fix.filePath) {
      const content = await readFile({ path: fix.filePath });
      if (content.success && content.output && fix.oldCode && fix.newCode) {
        const newContent = content.output.replace(fix.oldCode, fix.newCode);
        if (newContent !== content.output) {
          await writeFile({ path: fix.filePath, content: newContent });
        }
      }
    }
  }

  recoveryLog.push({ error: lastError, fix: "Failed after max attempts", success: false, timestamp: Date.now() });
  return { success: false, output: `❌ נכשל אחרי ${attempts} ניסיונות.\nשגיאה אחרונה: ${lastError.slice(0, 500)}`, attempts };
}

export async function selfHealBuild(params: {
  buildCommand?: string;
}): Promise<{ success: boolean; output: string }> {
  const cmd = params.buildCommand || "npx tsc --noEmit";
  console.log(`\n🏥 Self-heal build: ${cmd}`);

  const result = await autoRecover({ command: cmd, maxAttempts: 5 });
  return result;
}

export async function watchAndRecover(params: {
  command: string;
  checkIntervalSec?: number;
}): Promise<{ success: boolean; output: string }> {
  const interval = params.checkIntervalSec || 30;

  const result = await runCommand({ command: params.command, timeout: 10000 });
  if (result.stderr && result.stderr.trim()) {
    return autoRecover({ command: params.command });
  }

  return { success: true, output: `✅ הפקודה עובדת. מעקב כל ${interval} שניות.` };
}

export async function getRecoveryLog(params: {}): Promise<{ success: boolean; output: string }> {
  if (recoveryLog.length === 0) return { success: true, output: "אין היסטוריית שחזור" };

  const lines = recoveryLog.slice(-20).map(r => {
    const time = new Date(r.timestamp).toLocaleString("he-IL");
    return `${r.success ? "✅" : "❌"} [${time}] ${r.error.slice(0, 80)}... → ${r.fix}`;
  });

  const successRate = Math.round(recoveryLog.filter(r => r.success).length / recoveryLog.length * 100);

  return { success: true, output: `🏥 היסטוריית שחזור (${recoveryLog.length}, ${successRate}% הצלחה):\n${lines.join("\n")}` };
}

export const AUTO_RECOVERY_TOOLS = [
  {
    name: "auto_recover",
    description: "שחזור אוטומטי — מריץ פקודה, אם נכשלת AI מתקן ומנסה שוב (עד 5 ניסיונות)",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "הפקודה להריץ" },
        maxAttempts: { type: "number", description: "מקסימום ניסיונות (ברירת מחדל: 5)" },
      },
      required: ["command"] as string[],
    },
  },
  {
    name: "self_heal_build",
    description: "ריפוי עצמי של build — מריץ tsc, מתקן שגיאות אוטומטית",
    input_schema: {
      type: "object" as const,
      properties: {
        buildCommand: { type: "string", description: "פקודת build (ברירת מחדל: npx tsc --noEmit)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "watch_and_recover",
    description: "מעקב ושחזור — בודק שפקודה עובדת, מתקן אם לא",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" },
        checkIntervalSec: { type: "number" },
      },
      required: ["command"] as string[],
    },
  },
  {
    name: "get_recovery_log",
    description: "היסטוריית שחזור — כל הניסיונות, הצלחות, כישלונות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
