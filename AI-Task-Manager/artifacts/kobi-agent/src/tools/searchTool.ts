import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { execSync } from "child_process";

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  context: string[];
}

const ROOT = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/build/**", "**/__pycache__/**"];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchCode(params: {
  pattern: string;
  path?: string;
  glob?: string;
  filePattern?: string;
  maxResults?: number;
  caseSensitive?: boolean;
  contextLines?: number;
}): Promise<{ success: boolean; results?: SearchResult[] | string; count?: number; error?: string }> {
  const searchPath = params.path || ROOT;
  const maxResults = params.maxResults || 50;
  const contextLines = params.contextLines || 2;
  const filePattern = params.filePattern || params.glob;

  try {
    let cmd = `rg --no-heading -n --max-count ${maxResults}`;
    if (!params.caseSensitive) cmd += ` -i`;
    if (filePattern) cmd += ` --glob '${filePattern}'`;
    cmd += ` '${params.pattern.replace(/'/g, "'\\''")}' '${searchPath}'`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      cwd: ROOT,
    }).trim();

    const lines = output.split("\n").filter(Boolean);
    return { success: true, results: lines.slice(0, maxResults).join("\n"), count: lines.length };
  } catch (e: any) {
    if (e.status === 1) return { success: true, results: "", count: 0 };

    const results: SearchResult[] = [];
    const flags = params.caseSensitive ? "g" : "gi";
    const regex = new RegExp(escapeRegex(params.pattern), flags);
    const globPattern = filePattern || "**/*";

    const files = await glob(globPattern, {
      cwd: searchPath,
      nodir: true,
      ignore: IGNORE,
      absolute: false,
    });

    for (const file of files) {
      if (results.length >= maxResults) break;
      try {
        const fullPath = path.join(searchPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024) continue;

        const content = fs.readFileSync(fullPath, "utf-8");
        const fileLines = content.split("\n");

        for (let i = 0; i < fileLines.length; i++) {
          if (results.length >= maxResults) break;
          const match = regex.exec(fileLines[i]);
          if (match) {
            const ctxStart = Math.max(0, i - contextLines);
            const ctxEnd = Math.min(fileLines.length - 1, i + contextLines);
            results.push({
              file,
              line: i + 1,
              column: match.index + 1,
              text: fileLines[i].trim(),
              context: fileLines.slice(ctxStart, ctxEnd + 1),
            });
            regex.lastIndex = 0;
          }
        }
      } catch {}
    }

    return { success: true, results, count: results.length };
  }
}

export async function findFiles(params: {
  pattern: string;
  path?: string;
  maxResults?: number;
}): Promise<{ success: boolean; files?: string[]; error?: string }> {
  try {
    const basePath = params.path || ROOT;
    const files = await glob(params.pattern, {
      cwd: basePath,
      ignore: IGNORE,
      nodir: true,
      maxDepth: 8,
    });
    return { success: true, files: files.slice(0, params.maxResults || 100) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function findAndReplace(params: {
  searchText: string;
  replaceText: string;
  filePattern?: string;
  dryRun?: boolean;
}): Promise<{ success: boolean; results?: { file: string; replacements: number }[]; error?: string }> {
  try {
    const results: { file: string; replacements: number }[] = [];
    const pattern = params.filePattern || "**/*";

    const files = await glob(pattern, {
      cwd: ROOT,
      nodir: true,
      ignore: IGNORE,
      absolute: false,
    });

    for (const file of files) {
      try {
        const fullPath = path.join(ROOT, file);
        const content = fs.readFileSync(fullPath, "utf-8");
        const count = content.split(params.searchText).length - 1;

        if (count > 0) {
          if (!params.dryRun) {
            const newContent = content.split(params.searchText).join(params.replaceText);
            fs.writeFileSync(fullPath, newContent, "utf-8");
          }
          results.push({ file, replacements: count });
        }
      } catch {}
    }

    return { success: true, results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export const SEARCH_TOOLS = [
  {
    name: "search_code",
    description: "Search code using regex pattern. Returns matching lines with line numbers and context.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Search pattern (regex)" },
        path: { type: "string", description: "Directory to search in" },
        glob: { type: "string", description: "File filter (e.g., *.ts)" },
        filePattern: { type: "string", description: "File pattern (e.g., **/*.tsx)" },
        maxResults: { type: "number", description: "Max results (default: 50)" },
        caseSensitive: { type: "boolean", description: "Case sensitive search" },
        contextLines: { type: "number", description: "Context lines around match" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "find_files",
    description: "Find files by glob pattern.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g., **/*.tsx)" },
        path: { type: "string", description: "Base directory" },
        maxResults: { type: "number", description: "Max results" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "find_and_replace",
    description: "Find and replace text across multiple files.",
    input_schema: {
      type: "object" as const,
      properties: {
        searchText: { type: "string", description: "Text to find" },
        replaceText: { type: "string", description: "Replacement text" },
        filePattern: { type: "string", description: "File pattern (e.g., **/*.ts)" },
        dryRun: { type: "boolean", description: "Preview without making changes" },
      },
      required: ["searchText", "replaceText"],
    },
  },
];