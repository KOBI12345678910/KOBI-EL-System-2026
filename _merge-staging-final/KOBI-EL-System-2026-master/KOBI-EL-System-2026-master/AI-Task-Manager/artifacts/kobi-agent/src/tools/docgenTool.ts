import { readFile, writeFile } from "./fileTool";
import { searchFiles } from "./searchTool";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { runCommand } from "./terminalTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

function gatherProjectInfo(): string {
  let info = "";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, "package.json"), "utf-8"));
    info += `Package: ${pkg.name || "unknown"}\nDescription: ${pkg.description || "N/A"}\nVersion: ${pkg.version || "0.0.0"}\n`;
    info += `Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}\n`;
    info += `Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).join(", ")}\n`;
    info += `Scripts: ${JSON.stringify(pkg.scripts || {})}\n\n`;
  } catch {}

  const listDir = (dir: string, prefix = "", depth = 0): string => {
    if (depth > 3) return "";
    let result = "";
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (["node_modules", ".git", "dist", ".next", ".snapshots", "__pycache__"].includes(entry.name)) continue;
        result += `${prefix}${entry.isDirectory() ? "📁" : "📄"} ${entry.name}\n`;
        if (entry.isDirectory()) result += listDir(path.join(dir, entry.name), prefix + "  ", depth + 1);
      }
    } catch {}
    return result;
  };
  info += `\nProject Structure:\n${listDir(WORKSPACE_DIR)}`;

  try {
    const envExample = fs.readFileSync(path.join(WORKSPACE_DIR, ".env.example"), "utf-8");
    info += `\nEnvironment Variables:\n${envExample}\n`;
  } catch {}

  return info;
}

export async function generateReadme(): Promise<{ success: boolean; output: string }> {
  const context = gatherProjectInfo();
  const response = await callLLM({
    system: `You are a technical writer. Generate a professional README.md based on the project info.
Include: Title, Description, Features, Tech Stack, Getting Started (prerequisites, installation, running),
Project Structure, API docs (if applicable), Environment Variables, Scripts, Contributing, License.
Respond with ONLY the markdown content.`,
    messages: [{ role: "user", content: `Generate README for:\n\n${context}` }],
    maxTokens: 4096,
  });
  const readme = extractTextContent(response.content);
  await writeFile({ path: "README.md", content: readme });
  return { success: true, output: "Generated README.md" };
}

export async function generateApiDocs(params: { routes_dir?: string } = {}): Promise<{ success: boolean; output: string }> {
  const routesDir = params.routes_dir || "src/routes";
  const files = await searchFiles({ pattern: "*.ts", maxResults: 50 });
  const routeFiles = (files.matches || []).filter((f: string) => f.includes("route") || f.includes(routesDir));

  let allRoutes = "";
  for (const file of routeFiles) {
    const content = await readFile({ path: file });
    if (content.success) allRoutes += `\n// File: ${file}\n${content.output}\n`;
  }
  if (!allRoutes) return { success: false, output: "No routes found" };

  const response = await callLLM({
    system: `You are an API documentation expert. Generate comprehensive API documentation in markdown format.
For each endpoint, include: HTTP method, URL, description, request params/body, response format, example.
Respond with ONLY the markdown.`,
    messages: [{ role: "user", content: `Generate API docs from these route files:\n${allRoutes}` }],
    maxTokens: 4096,
  });
  const docs = extractTextContent(response.content);
  await writeFile({ path: "docs/API.md", content: docs });
  return { success: true, output: "Generated docs/API.md" };
}

export async function generateJSDoc(params: { file: string }): Promise<{ success: boolean; output: string }> {
  const content = await readFile({ path: params.file });
  if (!content.success) return { success: false, output: `Cannot read: ${params.file}` };

  const response = await callLLM({
    system: `You are a code documentation expert. Add JSDoc/TSDoc comments to all exported functions,
classes, interfaces, and types. Keep existing comments, add missing ones.
Respond with ONLY the complete file content with added documentation.`,
    messages: [{ role: "user", content: `Add documentation to:\n\n\`\`\`\n${content.output}\n\`\`\`` }],
    maxTokens: 8192,
  });
  let documented = extractTextContent(response.content);
  documented = documented.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  await writeFile({ path: params.file, content: documented });
  return { success: true, output: `Added JSDoc to ${params.file}` };
}

export async function generateChangelog(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: "git log --oneline --no-decorate -50", timeout: 10000 });
  const commits = result.stdout || "";

  const response = await callLLM({
    system: `Generate a CHANGELOG.md from git commits. Group by type: Added, Changed, Fixed, Removed.
Use conventional commit format. Respond with ONLY the markdown.`,
    messages: [{ role: "user", content: `Commits:\n${commits || "No git history. Create initial changelog."}` }],
  });
  const changelog = extractTextContent(response.content);
  await writeFile({ path: "CHANGELOG.md", content: changelog });
  return { success: true, output: "Generated CHANGELOG.md" };
}

export const DOCGEN_TOOLS = [
  { name: "generate_readme", description: "Generate a professional README.md based on project analysis", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_api_docs", description: "Generate API documentation from route files", input_schema: { type: "object" as const, properties: { routes_dir: { type: "string" } }, required: [] as string[] } },
  { name: "generate_jsdoc", description: "Add JSDoc/TSDoc comments to a source file using AI", input_schema: { type: "object" as const, properties: { file: { type: "string" } }, required: ["file"] as string[] } },
  { name: "generate_changelog", description: "Generate CHANGELOG.md from git history", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];