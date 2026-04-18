import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile, listFiles, deleteFile, moveFile } from "./fileTool";
import { findFiles, searchCode } from "./searchTool";
import { runCommand } from "./terminalTool";

async function transformCode(system: string, prompt: string): Promise<string> {
  const response = await callLLM({ system, messages: [{ role: "user", content: prompt }], maxTokens: 8192 });
  return extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

export async function migrateFramework(params: { from: string; to: string }): Promise<{ success: boolean; output: string; plan?: any; filesChanged?: string[] }> {
  const filesResult = await findFiles({ pattern: "*.{ts,tsx,js,jsx}" });
  const codeFiles = (filesResult.output || "").split("\n").filter(Boolean).slice(0, 20);

  const sampleCode: Record<string, string> = {};
  for (const file of codeFiles) {
    const content = await readFile({ path: file });
    if (content.success) sampleCode[file] = (content.output || "").slice(0, 1500);
  }

  const planResponse = await callLLM({
    system: `You are a migration expert. Create a detailed migration plan from ${params.from} to ${params.to}.
Respond with JSON:
{
  "steps": [{ "order": 1, "description": "", "type": "config|dependency|code|file_rename|file_delete|file_create", "risk": "low|medium|high", "details": {} }],
  "breakingChanges": [],
  "newDependencies": [],
  "removeDependencies": [],
  "configChanges": [],
  "warnings": []
}`,
    messages: [{ role: "user", content: `Migrate from ${params.from} to ${params.to}:\n\nFiles:\n${codeFiles.join("\n")}\n\nSample code:\n${Object.entries(sampleCode).map(([f, c]) => `--- ${f} ---\n${c}`).join("\n")}` }],
    maxTokens: 4096,
  });

  const plan = extractJSON(extractTextContent(planResponse.content));
  if (!plan) return { success: false, output: "Failed to create migration plan" };

  const filesChanged: string[] = [];
  const warnings: string[] = plan.warnings || [];

  for (const step of plan.steps || []) {
    switch (step.type) {
      case "dependency":
        if (plan.removeDependencies?.length) await runCommand({ command: `npm uninstall ${plan.removeDependencies.join(" ")}`, timeout: 30000 });
        if (plan.newDependencies?.length) await runCommand({ command: `npm install ${plan.newDependencies.join(" ")}`, timeout: 60000 });
        break;
      case "code":
        for (const file of codeFiles) {
          const content = await readFile({ path: file });
          if (!content.success) continue;
          const newCode = await transformCode(`You are migrating code from ${params.from} to ${params.to}. Transform the code, keeping functionality identical. Respond with ONLY the transformed code.`, `Transform this file:\n\n\`\`\`\n${content.output}\n\`\`\``);
          if (newCode !== content.output) { await writeFile({ path: file, content: newCode }); filesChanged.push(file); }
        }
        break;
      case "config":
        if (step.details?.file) {
          const configCode = await transformCode(`Generate the ${params.to} configuration file. Respond with ONLY the code.`, `Generate ${params.to} config. Details: ${JSON.stringify(step.details)}`);
          await writeFile({ path: step.details.file, content: configCode });
          filesChanged.push(step.details.file);
        }
        break;
      case "file_rename":
        if (step.details?.from && step.details?.to) { await moveFile({ source: step.details.from, destination: step.details.to }); filesChanged.push(step.details.to); }
        break;
      case "file_delete":
        if (step.details?.file) await deleteFile({ path: step.details.file });
        break;
    }
  }

  return { success: true, output: `Migration ${params.from} → ${params.to} complete.\nChanged ${filesChanged.length} files.\nWarnings: ${warnings.join(", ") || "none"}`, plan, filesChanged };
}

export async function migrateDatabase(params: { from: "prisma" | "typeorm" | "sequelize" | "raw"; to: "drizzle" | "prisma" }): Promise<{ success: boolean; output: string; filesChanged?: string[] }> {
  const pattern = params.from === "prisma" ? "*.prisma" : "*.ts";
  const filesResult = await findFiles({ pattern });
  const schemaFiles = (filesResult.output || "").split("\n").filter(Boolean);
  const filesChanged: string[] = [];

  for (const file of schemaFiles) {
    const content = await readFile({ path: file });
    if (!content.success) continue;
    const text = content.output || "";
    const isRelevant = text.includes("@Entity") || text.includes("model ") || text.includes("define(") || text.includes("CREATE TABLE") || text.includes("pgTable");
    if (!isRelevant) continue;

    const newCode = await transformCode(`Convert ${params.from} ORM schema/models to ${params.to}. Maintain all fields, relations, constraints, and indexes. Respond with ONLY the code.`, `Convert to ${params.to}:\n\n\`\`\`\n${text}\n\`\`\``);
    const newExt = params.to === "prisma" ? ".prisma" : ".ts";
    const newFile = file.replace(/\.\w+$/, newExt);
    await writeFile({ path: newFile, content: newCode });
    filesChanged.push(newFile);
  }

  return { success: true, output: `Database migration ${params.from} → ${params.to} complete. Changed ${filesChanged.length} files:\n${filesChanged.join("\n")}`, filesChanged };
}

export async function migrateCSS(params: { from: "css" | "scss" | "styled-components" | "css-modules"; to: "tailwind" | "css-modules" | "styled-components" }): Promise<{ success: boolean; output: string; filesChanged?: string[] }> {
  const pattern = params.from === "scss" ? "*.scss" : params.from === "css-modules" ? "*.module.css" : "*.{css,tsx,jsx}";
  const filesResult = await findFiles({ pattern });
  const styleFiles = (filesResult.output || "").split("\n").filter(Boolean).slice(0, 30);
  const filesChanged: string[] = [];

  for (const file of styleFiles) {
    const content = await readFile({ path: file });
    if (!content.success) continue;

    const newCode = await transformCode(`Convert ${params.from} styles to ${params.to}. If converting to Tailwind, apply utility classes directly in JSX/TSX. Respond with ONLY the code.`, `Convert to ${params.to}:\n\n\`\`\`\n${content.output}\n\`\`\``);
    await writeFile({ path: file, content: newCode });
    filesChanged.push(file);
  }

  return { success: true, output: `CSS migration ${params.from} → ${params.to} complete. Changed ${filesChanged.length} files:\n${filesChanged.join("\n")}`, filesChanged };
}

export const MIGRATION_TOOLS = [
  { name: "migrate_framework", description: "Migrate between frameworks (e.g. CRA→Next.js, Express→Fastify, Vue→React): creates plan, updates deps, transforms code, generates configs", input_schema: { type: "object" as const, properties: { from: { type: "string", description: "Source framework (e.g. create-react-app, express, vue)" }, to: { type: "string", description: "Target framework (e.g. next.js, fastify, react)" } }, required: ["from", "to"] as string[] } },
  { name: "migrate_database", description: "Migrate ORM/database layer (Prisma/TypeORM/Sequelize/raw SQL → Drizzle/Prisma)", input_schema: { type: "object" as const, properties: { from: { type: "string", enum: ["prisma", "typeorm", "sequelize", "raw"] }, to: { type: "string", enum: ["drizzle", "prisma"] } }, required: ["from", "to"] as string[] } },
  { name: "migrate_css", description: "Migrate CSS approach (CSS/SCSS/styled-components/CSS Modules → Tailwind/CSS Modules/styled-components)", input_schema: { type: "object" as const, properties: { from: { type: "string", enum: ["css", "scss", "styled-components", "css-modules"] }, to: { type: "string", enum: ["tailwind", "css-modules", "styled-components"] } }, required: ["from", "to"] as string[] } },
];