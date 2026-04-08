import * as fs from "fs";
import * as path from "path";
import { createPatch } from "diff";

export interface FileToolResult {
  success: boolean;
  output?: string;
  error?: string;
  path?: string;
}

export interface EditChange {
  type: "replace" | "insert_after" | "insert_before" | "delete" | "full_replace";
  search?: string;
  replace?: string;
  content?: string;
  line?: number;
}

const ROOT = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

function resolve(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(ROOT, filePath);
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function readFile(params: { path: string; offset?: number; limit?: number }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${params.path}` };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const allLines = content.split("\n");
    const offset = (params.offset || 1) - 1;
    const limit = params.limit || 200;
    const slice = allLines.slice(offset, offset + limit);
    return {
      success: true,
      output: slice.map((l, i) => `${String(offset + i + 1).padStart(5)} │ ${l}`).join("\n"),
      path: params.path,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function writeFile(params: { path: string; content: string }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    ensureDir(fullPath);
    fs.writeFileSync(fullPath, params.content, "utf-8");
    return { success: true, output: `Created: ${params.path}`, path: params.path };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function editFile(params: { path: string; old_string?: string; new_string?: string; changes?: EditChange[] }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${params.path}` };
    }

    let content = fs.readFileSync(fullPath, "utf-8");
    const originalContent = content;

    if (params.changes && params.changes.length > 0) {
      for (const change of params.changes) {
        switch (change.type) {
          case "replace": {
            if (change.search && content.includes(change.search)) {
              content = content.replace(change.search, change.replace || "");
            } else if (change.line) {
              const lines = content.split("\n");
              if (change.line > 0 && change.line <= lines.length) {
                lines[change.line - 1] = change.replace || "";
                content = lines.join("\n");
              }
            }
            break;
          }
          case "insert_after": {
            if (change.search && content.includes(change.search)) {
              content = content.replace(
                change.search,
                change.search + "\n" + (change.content || "")
              );
            } else if (change.line) {
              const lines = content.split("\n");
              lines.splice(change.line, 0, change.content || "");
              content = lines.join("\n");
            }
            break;
          }
          case "insert_before": {
            if (change.search && content.includes(change.search)) {
              content = content.replace(
                change.search,
                (change.content || "") + "\n" + change.search
              );
            } else if (change.line) {
              const lines = content.split("\n");
              lines.splice(change.line - 1, 0, change.content || "");
              content = lines.join("\n");
            }
            break;
          }
          case "delete": {
            if (change.search) {
              content = content.replace(change.search, "");
            } else if (change.line) {
              const lines = content.split("\n");
              lines.splice(change.line - 1, 1);
              content = lines.join("\n");
            }
            break;
          }
          case "full_replace": {
            content = change.content || "";
            break;
          }
        }
      }
    } else if (params.old_string && params.new_string !== undefined) {
      if (!content.includes(params.old_string)) {
        return { success: false, error: "Text not found in file" };
      }
      const count = content.split(params.old_string).length - 1;
      if (count > 1) return { success: false, error: `Text appears ${count} times — need unique text` };
      content = content.replace(params.old_string, params.new_string);
    }

    fs.writeFileSync(fullPath, content, "utf-8");

    const diff = createPatch(params.path, originalContent, content);
    return {
      success: true,
      output: `Edited: ${params.path}\n\nDiff:\n${diff}`,
      path: params.path,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteFile(params: { path: string }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${params.path}` };
    }
    fs.unlinkSync(fullPath);
    return { success: true, output: `Deleted: ${params.path}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function listFiles(params: { path: string; depth?: number; recursive?: boolean }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Directory not found: ${params.path}` };
    }
    const maxDepth = params.depth || 2;
    const entries: string[] = [];

    const list = (dir: string, depth: number, prefix: string) => {
      if (depth > maxDepth) return;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "dist") continue;
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
          entries.push(item.isDirectory() ? `${itemPath}/` : itemPath);
          if (item.isDirectory() && (params.recursive || depth < maxDepth)) {
            list(path.join(dir, item.name), depth + 1, itemPath);
          }
        }
      } catch {}
    };

    list(fullPath, 0, "");
    return { success: true, output: entries.slice(0, 200).join("\n") };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function copyFile(params: { src: string; dest: string }): Promise<FileToolResult> {
  try {
    const srcPath = resolve(params.src);
    const destPath = resolve(params.dest);
    ensureDir(destPath);
    fs.copyFileSync(srcPath, destPath);
    return { success: true, output: `Copied: ${params.src} → ${params.dest}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function moveFile(params: { src: string; dest: string }): Promise<FileToolResult> {
  try {
    const srcPath = resolve(params.src);
    const destPath = resolve(params.dest);
    ensureDir(destPath);
    fs.renameSync(srcPath, destPath);
    return { success: true, output: `Moved: ${params.src} → ${params.dest}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createDirectory(params: { path: string }): Promise<FileToolResult> {
  try {
    const fullPath = resolve(params.path);
    fs.mkdirSync(fullPath, { recursive: true });
    return { success: true, output: `Created directory: ${params.path}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export const FILE_TOOLS = [
  {
    name: "read_file",
    description: "Read a file from the project. Returns content with line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path" },
        offset: { type: "number", description: "Start line (1-indexed)" },
        limit: { type: "number", description: "Number of lines to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create a new file or overwrite an existing one.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "File content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file using search/replace or structured changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path" },
        old_string: { type: "string", description: "Text to find (must be unique)" },
        new_string: { type: "string", description: "Replacement text" },
        changes: {
          type: "array",
          description: "Array of structured edit changes",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["replace", "insert_after", "insert_before", "delete", "full_replace"] },
              search: { type: "string" },
              replace: { type: "string" },
              content: { type: "string" },
              line: { type: "number" },
            },
            required: ["type"],
          },
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "List files in a directory tree.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path" },
        depth: { type: "number", description: "Scan depth (default: 2)" },
        recursive: { type: "boolean", description: "Recursive listing" },
      },
      required: ["path"],
    },
  },
  {
    name: "create_directory",
    description: "Create a directory (recursive).",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
  },
  {
    name: "copy_file",
    description: "Copy a file from source to destination.",
    input_schema: {
      type: "object" as const,
      properties: {
        src: { type: "string", description: "Source path" },
        dest: { type: "string", description: "Destination path" },
      },
      required: ["src", "dest"],
    },
  },
  {
    name: "move_file",
    description: "Move/rename a file.",
    input_schema: {
      type: "object" as const,
      properties: {
        src: { type: "string", description: "Source path" },
        dest: { type: "string", description: "Destination path" },
      },
      required: ["src", "dest"],
    },
  },
];