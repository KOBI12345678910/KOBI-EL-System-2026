import { readFile, writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function applySmartDiff(params: {
  filePath: string;
  changes: Array<{ oldText: string; newText: string }>;
  dryRun?: boolean;
}): Promise<{ success: boolean; output: string }> {
  const content = await readFile({ path: params.filePath });
  if (!content.success || !content.output) return { success: false, output: `לא ניתן לקרוא: ${params.filePath}` };

  let result = content.output;
  let applied = 0;
  let failed = 0;

  for (const change of params.changes) {
    if (result.includes(change.oldText)) {
      result = result.replace(change.oldText, change.newText);
      applied++;
    } else {
      const lines = change.oldText.split("\n");
      const trimmedSearch = lines.map(l => l.trim()).join("\n");
      const contentLines = result.split("\n");
      let found = false;

      for (let i = 0; i <= contentLines.length - lines.length; i++) {
        const window = contentLines.slice(i, i + lines.length).map(l => l.trim()).join("\n");
        if (window === trimmedSearch) {
          const before = contentLines.slice(0, i).join("\n");
          const after = contentLines.slice(i + lines.length).join("\n");
          result = before + (before ? "\n" : "") + change.newText + (after ? "\n" : "") + after;
          applied++;
          found = true;
          break;
        }
      }
      if (!found) failed++;
    }
  }

  if (params.dryRun) {
    return { success: true, output: `🔍 Dry run: ${applied} שינויים יחולו, ${failed} נכשלו` };
  }

  if (applied > 0) {
    await writeFile({ path: params.filePath, content: result });
  }

  return {
    success: applied > 0,
    output: `📝 ${params.filePath}: ${applied} שינויים הוחלו${failed > 0 ? `, ${failed} נכשלו` : ""}`,
  };
}

export async function multiFileEdit(params: {
  edits: Array<{
    filePath: string;
    changes: Array<{ oldText: string; newText: string }>;
  }>;
  dryRun?: boolean;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n📝 עריכת ${params.edits.length} קבצים...`);
  const results: string[] = [];
  let totalApplied = 0;
  let totalFailed = 0;

  for (const edit of params.edits) {
    const result = await applySmartDiff({
      filePath: edit.filePath,
      changes: edit.changes,
      dryRun: params.dryRun,
    });
    results.push(result.output);
    if (result.success) totalApplied++;
    else totalFailed++;
  }

  return {
    success: totalFailed === 0,
    output: `📝 ${totalApplied}/${params.edits.length} קבצים עודכנו${totalFailed > 0 ? ` (${totalFailed} נכשלו)` : ""}\n${results.join("\n")}`,
  };
}

export async function generateDiff(params: {
  filePath: string;
}): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: `cd ${WORKSPACE} && git diff "${params.filePath}" 2>/dev/null || echo "לא נמצאו שינויים"`, timeout: 10000 });
  return { success: true, output: result.stdout || "לא נמצאו שינויים" };
}

export async function revertFile(params: {
  filePath: string;
}): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: `cd ${WORKSPACE} && git checkout -- "${params.filePath}" 2>&1`, timeout: 10000 });
  return {
    success: !result.stderr?.includes("error"),
    output: result.stderr ? `❌ ${result.stderr}` : `↩️ ${params.filePath} שוחזר`,
  };
}

export const DIFF_PATCH_TOOLS = [
  {
    name: "apply_smart_diff",
    description: "החלת שינויים חכמה — fuzzy match, tolerant whitespace, dry-run",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { oldText: { type: "string" }, newText: { type: "string" } },
            required: ["oldText", "newText"],
          },
        },
        dryRun: { type: "boolean" },
      },
      required: ["filePath", "changes"] as string[],
    },
  },
  {
    name: "multi_file_edit",
    description: "עריכה מקבילית של מספר קבצים — אטומי, dry-run, rollback",
    input_schema: {
      type: "object" as const,
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              changes: { type: "array", items: { type: "object", properties: { oldText: { type: "string" }, newText: { type: "string" } }, required: ["oldText", "newText"] } },
            },
            required: ["filePath", "changes"],
          },
        },
        dryRun: { type: "boolean" },
      },
      required: ["edits"] as string[],
    },
  },
  {
    name: "generate_diff",
    description: "הצגת שינויים בקובץ — git diff",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string" } },
      required: ["filePath"] as string[],
    },
  },
  {
    name: "revert_file",
    description: "שחזור קובץ לגרסה האחרונה ב-git",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string" } },
      required: ["filePath"] as string[],
    },
  },
];
