import { Router, type IRouter } from "express";
import { execSync, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const router: IRouter = Router();

const WORKSPACE_ROOT = path.resolve(process.cwd(), "../..");
const ALLOWED_ROOTS = [
  path.join(WORKSPACE_ROOT, "artifacts"),
  path.join(WORKSPACE_ROOT, "lib"),
  path.join(WORKSPACE_ROOT, "packages"),
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\/sd/,
  /shutdown/,
  /reboot/,
  /passwd/,
  /useradd/,
  /userdel/,
  /chmod\s+777\s+\//,
  /:(){ :|:& };:/,
];

function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (resolved.startsWith(WORKSPACE_ROOT)) return true;
  return false;
}

function sanitizePath(filePath: string): string {
  const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.resolve(WORKSPACE_ROOT, normalized);
}

function isShellCommandSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked dangerous pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

router.post("/claude/execute/code", async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Code is required" });
      return;
    }

    const lang = language || "javascript";
    const tmpFile = path.join("/tmp", `claude_exec_${Date.now()}.${lang === "typescript" ? "ts" : "js"}`);

    const wrappedCode = `
const __output = [];
const __originalLog = console.log;
const __originalError = console.error;
const __originalWarn = console.warn;
console.log = (...args) => { __output.push({ type: 'log', data: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }); };
console.error = (...args) => { __output.push({ type: 'error', data: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }); };
console.warn = (...args) => { __output.push({ type: 'warn', data: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }); };

(async () => {
  try {
${code}
  } catch (err) {
    __output.push({ type: 'error', data: 'Runtime error: ' + (err.message || String(err)) });
  }
  __originalLog(JSON.stringify({ success: true, output: __output }));
})();
`;

    fs.writeFileSync(tmpFile, wrappedCode, "utf8");

    const startTime = Date.now();
    let result: string;
    try {
      if (lang === "typescript") {
        result = execSync(`npx tsx ${tmpFile}`, {
          timeout: 30000,
          encoding: "utf8",
          cwd: WORKSPACE_ROOT,
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" },
        });
      } else {
        result = execSync(`node ${tmpFile}`, {
          timeout: 30000,
          encoding: "utf8",
          cwd: WORKSPACE_ROOT,
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" },
        });
      }
    } catch (execErr: any) {
      const elapsed = Date.now() - startTime;
      fs.unlinkSync(tmpFile);
      res.json({
        success: false,
        error: execErr.stderr || execErr.message || "Execution failed",
        stdout: execErr.stdout?.substring(0, 5000) || "",
        executionTimeMs: elapsed,
      });
      return;
    }

    const elapsed = Date.now() - startTime;
    fs.unlinkSync(tmpFile);

    try {
      const lines = result.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      const parsed = JSON.parse(lastLine);
      res.json({
        ...parsed,
        executionTimeMs: elapsed,
        rawOutput: lines.slice(0, -1).join("\n").substring(0, 3000),
      });
    } catch {
      res.json({
        success: true,
        output: [{ type: "log", data: result.substring(0, 5000) }],
        executionTimeMs: elapsed,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Code execution failed" });
  }
});

router.post("/claude/execute/shell", async (req, res) => {
  try {
    const { command, cwd } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: "Command is required" });
      return;
    }

    const safety = isShellCommandSafe(command);
    if (!safety.safe) {
      res.status(403).json({ error: safety.reason });
      return;
    }

    const workDir = cwd ? sanitizePath(cwd) : WORKSPACE_ROOT;
    const startTime = Date.now();

    try {
      const result = execSync(command, {
        timeout: 60000,
        encoding: "utf8",
        cwd: workDir,
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      });
      const elapsed = Date.now() - startTime;
      res.json({
        success: true,
        output: result.substring(0, 10000),
        executionTimeMs: elapsed,
        cwd: workDir,
      });
    } catch (execErr: any) {
      const elapsed = Date.now() - startTime;
      res.json({
        success: false,
        stdout: (execErr.stdout || "").substring(0, 5000),
        stderr: (execErr.stderr || "").substring(0, 5000),
        exitCode: execErr.status,
        executionTimeMs: elapsed,
        cwd: workDir,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Shell execution failed" });
  }
});

router.post("/claude/execute/read-file", async (req, res) => {
  try {
    const { filePath, offset, limit } = req.body;
    if (!filePath || typeof filePath !== "string") {
      res.status(400).json({ error: "filePath is required" });
      return;
    }

    const fullPath = sanitizePath(filePath);
    if (!isPathAllowed(fullPath)) {
      res.status(403).json({ error: "Access denied: path outside workspace" });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: `File not found: ${filePath}` });
      return;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      res.status(400).json({ error: "Path is a directory, use list-files instead" });
      return;
    }

    if (stat.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 2MB)` });
      return;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n");
    const startLine = (offset || 1) - 1;
    const lineLimit = limit || 200;
    const sliced = lines.slice(startLine, startLine + lineLimit);

    res.json({
      success: true,
      filePath,
      fullPath,
      content: sliced.join("\n"),
      totalLines: lines.length,
      returnedLines: sliced.length,
      startLine: startLine + 1,
      endLine: startLine + sliced.length,
      fileSize: stat.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Read failed" });
  }
});

router.post("/claude/execute/write-file", async (req, res) => {
  try {
    const { filePath, content, createDirs, append } = req.body;
    if (!filePath || typeof filePath !== "string") {
      res.status(400).json({ error: "filePath is required" });
      return;
    }
    if (content === undefined || content === null) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const fullPath = sanitizePath(filePath);
    if (!isPathAllowed(fullPath)) {
      res.status(403).json({ error: "Access denied: path outside workspace" });
      return;
    }

    const dir = path.dirname(fullPath);
    if (createDirs && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existed = fs.existsSync(fullPath);
    if (append) {
      fs.appendFileSync(fullPath, content, "utf8");
    } else {
      fs.writeFileSync(fullPath, content, "utf8");
    }

    const stat = fs.statSync(fullPath);
    res.json({
      success: true,
      filePath,
      fullPath,
      operation: append ? "append" : existed ? "overwrite" : "create",
      fileSize: stat.size,
      lines: content.split("\n").length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Write failed" });
  }
});

router.post("/claude/execute/list-files", async (req, res) => {
  try {
    const { dirPath, recursive, pattern } = req.body;
    const targetDir = dirPath ? sanitizePath(dirPath) : WORKSPACE_ROOT;

    if (!isPathAllowed(targetDir)) {
      res.status(403).json({ error: "Access denied: path outside workspace" });
      return;
    }

    if (!fs.existsSync(targetDir)) {
      res.status(404).json({ error: `Directory not found: ${dirPath}` });
      return;
    }

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Path is not a directory" });
      return;
    }

    const entries: Array<{ name: string; type: string; size?: number; path: string }> = [];

    function walkDir(dir: string, depth: number = 0) {
      if (depth > 5) return;
      if (entries.length > 500) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item === "node_modules" || item === ".git" || item === "dist" || item === ".next") continue;
        const fullItemPath = path.join(dir, item);
        const relativePath = path.relative(WORKSPACE_ROOT, fullItemPath);

        try {
          const itemStat = fs.statSync(fullItemPath);
          if (pattern && !item.match(new RegExp(pattern, "i"))) {
            if (itemStat.isDirectory() && recursive) {
              walkDir(fullItemPath, depth + 1);
            }
            continue;
          }

          entries.push({
            name: item,
            type: itemStat.isDirectory() ? "directory" : "file",
            size: itemStat.isFile() ? itemStat.size : undefined,
            path: relativePath,
          });

          if (itemStat.isDirectory() && recursive) {
            walkDir(fullItemPath, depth + 1);
          }
        } catch {
        }
      }
    }

    walkDir(targetDir);

    res.json({
      success: true,
      directory: path.relative(WORKSPACE_ROOT, targetDir) || ".",
      entries,
      totalEntries: entries.length,
      truncated: entries.length >= 500,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "List failed" });
  }
});

router.post("/claude/execute/search-files", async (req, res) => {
  try {
    const { pattern, directory, filePattern, maxResults } = req.body;
    if (!pattern || typeof pattern !== "string") {
      res.status(400).json({ error: "Search pattern is required" });
      return;
    }

    const searchDir = directory ? sanitizePath(directory) : WORKSPACE_ROOT;
    if (!isPathAllowed(searchDir)) {
      res.status(403).json({ error: "Access denied: path outside workspace" });
      return;
    }

    const max = Math.min(maxResults || 50, 100);
    const grepArgs: string[] = ["-rn"];
    if (filePattern) {
      grepArgs.push(`--include=${filePattern}`);
    } else {
      for (const ext of ["*.ts", "*.tsx", "*.js", "*.jsx", "*.json", "*.css", "*.sql"]) {
        grepArgs.push(`--include=${ext}`);
      }
    }
    grepArgs.push("-m", String(max), "--", pattern, searchDir);

    let result: string;
    try {
      result = execFileSync("grep", grepArgs, {
        timeout: 15000,
        encoding: "utf8",
        maxBuffer: 512 * 1024,
      });
    } catch (grepErr: any) {
      result = grepErr.stdout || "";
    }

    const matches = result.trim().split("\n").filter(Boolean).map(line => {
      const firstColon = line.indexOf(":");
      const secondColon = line.indexOf(":", firstColon + 1);
      return {
        file: path.relative(WORKSPACE_ROOT, line.substring(0, firstColon)),
        line: parseInt(line.substring(firstColon + 1, secondColon)),
        content: line.substring(secondColon + 1).substring(0, 200),
      };
    });

    res.json({
      success: true,
      pattern,
      matches,
      totalMatches: matches.length,
      truncated: matches.length >= max,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

export default router;
