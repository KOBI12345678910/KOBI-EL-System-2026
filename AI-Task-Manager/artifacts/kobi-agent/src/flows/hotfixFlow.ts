import { runCommand } from "../tools/terminalTool";
import { createCheckpoint, getTimeline, timeTravelTo } from "../tools/checkpointTool";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile } from "../tools/fileTool";
import { searchCode } from "../tools/searchTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function hotfix(params: {
  issue: string;
}): Promise<{ success: boolean; output: string; branch?: string; changes?: string[]; deployCommand?: string }> {
  const startTime = Date.now();
  const branch = `hotfix/${Date.now()}`;
  const changes: string[] = [];

  console.log(`\n🚨 HOTFIX FLOW: ${params.issue.slice(0, 80)}`);
  console.log("═".repeat(50));

  console.log("\n1️⃣ יצירת branch...");
  await runCommand({ command: `cd ${WORKSPACE} && git stash 2>/dev/null; git checkout -b ${branch} main 2>/dev/null || git checkout -b ${branch}`, timeout: 10000 });

  console.log("2️⃣ checkpoint בטיחות...");
  await createCheckpoint({ trigger: "pre-fix", description: `Before hotfix: ${params.issue.slice(0, 80)}` });

  console.log("3️⃣ אבחון הבעיה...");
  const diagResponse = await callLLM({
    system: `You are a production incident responder. Analyze this issue and provide:
1. Root cause analysis
2. Exact files to modify
3. Minimal fix (smallest change possible)
4. Risk assessment

Return JSON:
{
  "rootCause": "...",
  "filesToModify": [{"path": "...", "oldCode": "...", "newCode": "..."}],
  "risk": "low|medium|high",
  "explanation": "..."
}`,
    messages: [{ role: "user", content: `Production issue: ${params.issue}` }],
    maxTokens: 4096,
  });

  const diagnosis = extractJSON(extractTextContent(diagResponse.content));
  if (!diagnosis || !diagnosis.filesToModify || diagnosis.filesToModify.length === 0) {
    console.log("❌ לא ניתן לתקן אוטומטית. נדרש תיקון ידני.");
    await runCommand({ command: `cd ${WORKSPACE} && git checkout - 2>/dev/null; git branch -D ${branch} 2>/dev/null`, timeout: 10000 });
    return {
      success: false,
      output: `❌ Hotfix נכשל — שורש הבעיה: ${diagnosis?.rootCause || "לא זוהה"}\nנדרש תיקון ידני.`,
    };
  }

  console.log(`   שורש: ${diagnosis.rootCause}`);
  console.log(`   סיכון: ${diagnosis.risk}`);

  console.log("4️⃣ מחיל תיקון מינימלי...");
  let appliedFixes = 0;
  for (const fix of diagnosis.filesToModify) {
    const content = await readFile({ path: `${WORKSPACE}/${fix.path}` });
    if (content.success && content.output && fix.oldCode && fix.newCode) {
      const newContent = content.output.replace(fix.oldCode, fix.newCode);
      if (newContent !== content.output) {
        await writeFile({ path: `${WORKSPACE}/${fix.path}`, content: newContent });
        changes.push(fix.path);
        appliedFixes++;
      }
    }
  }

  if (appliedFixes === 0) {
    console.log("❌ לא הוחלו שינויים");
    await runCommand({ command: `cd ${WORKSPACE} && git checkout - 2>/dev/null; git branch -D ${branch} 2>/dev/null`, timeout: 10000 });
    return { success: false, output: "❌ Hotfix נכשל — לא הצליח להחיל שינויים" };
  }

  console.log("5️⃣ בדיקות קריטיות...");
  const tsc = await runCommand({ command: `cd ${WORKSPACE} && npx tsc --noEmit 2>&1 | head -10`, timeout: 30000 });
  const hasErrors = tsc.stderr?.includes("error") || tsc.stdout?.includes("error TS");

  if (hasErrors) {
    console.log("❌ שגיאות TypeScript — מבטל");
    const timeline = await getTimeline({});
    if (timeline.success) {
      await timeTravelTo({ checkpointId: "pre-fix" });
    }
    await runCommand({ command: `cd ${WORKSPACE} && git checkout -- . 2>/dev/null; git checkout - 2>/dev/null; git branch -D ${branch} 2>/dev/null`, timeout: 10000 });
    return { success: false, output: `❌ Hotfix נכשל בבדיקות TypeScript:\n${tsc.stdout?.slice(0, 300)}` };
  }

  console.log("6️⃣ Commit + Tag...");
  const safeMsg = params.issue.slice(0, 50).replace(/"/g, "'");
  await runCommand({ command: `cd ${WORKSPACE} && git add -A && git commit -m "hotfix: ${safeMsg}"`, timeout: 10000 });
  const tag = `hotfix-${Date.now()}`;
  await runCommand({ command: `cd ${WORKSPACE} && git tag ${tag}`, timeout: 5000 });

  await createCheckpoint({ trigger: "post-fix", description: `After hotfix: ${params.issue.slice(0, 80)}` });

  const deployCommand = `git checkout main && git merge ${branch} --no-ff -m "merge hotfix" && git push origin main --tags && npm run deploy`;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  const output = [
    `✅ HOTFIX מוכן`,
    `   Branch: ${branch}`,
    `   Tag: ${tag}`,
    `   קבצים ששונו: ${changes.length}`,
    `   שורש הבעיה: ${diagnosis.rootCause}`,
    `   סיכון: ${diagnosis.risk}`,
    `   זמן: ${duration}s`,
    `   Deploy: ${deployCommand}`,
  ].join("\n");

  console.log(`\n${output}`);

  return { success: true, output, branch, changes, deployCommand };
}

export async function rollbackHotfix(params: {
  branch: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n🔄 מבטל hotfix: ${params.branch}`);

  await runCommand({ command: `cd ${WORKSPACE} && git checkout main 2>/dev/null; git branch -D ${params.branch} 2>/dev/null`, timeout: 10000 });

  const timeline = await getTimeline({});
  if (timeline.success && timeline.output) {
    const preFix = timeline.output.includes("pre-fix");
    if (preFix) {
      await timeTravelTo({ checkpointId: "pre-fix" });
    }
  }

  return { success: true, output: `🔄 Hotfix ${params.branch} בוטל — שוחזר למצב קודם` };
}

export const HOTFIX_FLOW_TOOLS = [
  {
    name: "hotfix",
    description: "תיקון חירום בייצור — branch, אבחון AI, תיקון מינימלי, בדיקות, commit, tag",
    input_schema: {
      type: "object" as const,
      properties: {
        issue: { type: "string", description: "תיאור הבעיה בייצור" },
      },
      required: ["issue"] as string[],
    },
  },
  {
    name: "rollback_hotfix",
    description: "ביטול hotfix — חזרה למצב קודם",
    input_schema: {
      type: "object" as const,
      properties: {
        branch: { type: "string", description: "שם ה-branch של ה-hotfix" },
      },
      required: ["branch"] as string[],
    },
  },
];
