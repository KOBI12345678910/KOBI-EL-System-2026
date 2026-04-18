import { Router, type IRouter } from "express";
import { KOBI_SYSTEM_PROMPT, KOBI_TOOLS_SCHEMA } from "./system-prompt";
import { executeTool, setSaveMemoryContext } from "./tools";
import { pool } from "@workspace/db";
import { writeAuditLog } from "../../lib/ai-audit";
import { getProjectMemory, getRecentMessages, saveMessage, autoExtractMemory, getSessionContext, saveMemory, updateSessionContext } from "./memory";
import multer from "multer";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join, extname, dirname } from "path";

const router: IRouter = Router();

const MAX_TOOL_LOOPS_NORMAL = 15;
const MAX_TOOL_LOOPS_HEAVY = 30;

const HEAVY_TASK_KEYWORDS_CHAT = ["בדיקת מערכת", "דשבורד", "dashboard", "KPI", "ניתוח מלא", "full check", "system check", "ניתוח", "דוח מלא", "בנה דשבורד", "build dashboard", "סיכום מלא", "full report"];

function getToolBudget(messages: any[]): number {
  const lastMsg = messages[messages.length - 1]?.content || "";
  const text = typeof lastMsg === "string" ? lastMsg : JSON.stringify(lastMsg);
  const lower = text.toLowerCase();
  const isHeavy = HEAVY_TASK_KEYWORDS_CHAT.some(kw => lower.includes(kw.toLowerCase()));
  return isHeavy ? MAX_TOOL_LOOPS_HEAVY : MAX_TOOL_LOOPS_NORMAL;
}

const MIN_TOOL_CALL_DELAY_MS = 80;
const RATE_LIMIT_COOLDOWN_MS = 10000;
let lastClaudeCallTime = 0;
let consecutiveRateLimits = 0;

async function throttledSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const baseDelay = consecutiveRateLimits > 0
    ? MIN_TOOL_CALL_DELAY_MS + (consecutiveRateLimits * 2000)
    : MIN_TOOL_CALL_DELAY_MS;
  const elapsed = now - lastClaudeCallTime;
  if (elapsed < baseDelay) {
    await throttledSleep(baseDelay - elapsed);
  }
  lastClaudeCallTime = Date.now();
}

async function fetchClaudeWithRetry(
  url: string,
  options: RequestInit,
  res: any,
  maxRetries = 5
): Promise<Response> {
  const backoffs = [1000, 2000, 5000, 10000, 20000];
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffs[attempt - 1] || 45000;
      res.write(`data: ${JSON.stringify({ retrying: true, attempt, maxRetries, delay_ms: delay })}\n\n`);
      await throttledSleep(delay);
    }
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1);
        return response;
      }
      const status = response.status;
      if ((status === 429 || status === 502 || status === 503 || status === 529) && attempt < maxRetries) {
        if (status === 429) consecutiveRateLimits++;
        const retryAfterHeader = response.headers.get("retry-after");
        const baseWait = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : backoffs[attempt] || 45000;
        const jitter = Math.random() * 2000;
        const waitMs = baseWait + jitter + (status === 429 ? RATE_LIMIT_COOLDOWN_MS : 0);
        res.write(`data: ${JSON.stringify({ retrying: true, attempt: attempt + 1, maxRetries, delay_ms: Math.round(waitMs), reason: status })}\n\n`);
        await throttledSleep(waitMs);
        lastClaudeCallTime = 0;
        continue;
      }
      return response;
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = backoffs[attempt] || 45000;
        res.write(`data: ${JSON.stringify({ retrying: true, attempt: attempt + 1, maxRetries, delay_ms: delay, reason: "network_error" })}\n\n`);
        await throttledSleep(delay);
        continue;
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

const KOBI_UPLOADS_DIR = join(process.cwd(), "uploads", "kobi");
if (!existsSync(KOBI_UPLOADS_DIR)) mkdirSync(KOBI_UPLOADS_DIR, { recursive: true });

const kobiUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, KOBI_UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `img_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
  },
});

router.post("/kobi/upload", kobiUpload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "לא הועלה קובץ תמונה" });
    return;
  }
  const filePath = req.file.path;
  const data = readFileSync(filePath);
  const base64 = data.toString("base64");
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  };
  const ext = extname(req.file.originalname).toLowerCase();
  const mediaType = mimeMap[ext] || "image/jpeg";

  res.json({
    success: true,
    file_path: filePath,
    file_name: req.file.filename,
    media_type: mediaType,
    base64,
    size: req.file.size,
  });
});

function buildClaudeContent(msg: any): any {
  if (typeof msg.content === "string" && !msg.images?.length) {
    return msg.content;
  }

  const blocks: any[] = [];

  if (msg.images && Array.isArray(msg.images)) {
    for (const img of msg.images) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type || "image/jpeg",
          data: img.base64,
        },
      });
    }
  }

  const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  if (text) {
    blocks.push({ type: "text", text });
  }

  return blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks;
}

interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

function getAnthropicConfigs(): AnthropicConfig[] {
  const configs: AnthropicConfig[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      label: "Anthropic Direct",
    });
  }
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
    configs.push({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseUrl: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      model: "claude-sonnet-4-6",
      label: "Replit Proxy",
    });
  }
  if (configs.length === 0) {
    configs.push({ apiKey: "", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514", label: "None" });
  }
  return configs;
}

let activeConfigIndex = 0;

function getActiveConfig(): AnthropicConfig {
  const configs = getAnthropicConfigs();
  return configs[Math.min(activeConfigIndex, configs.length - 1)];
}

function switchToNextConfig(): AnthropicConfig | null {
  const configs = getAnthropicConfigs();
  activeConfigIndex++;
  if (activeConfigIndex < configs.length) {
    console.log(`[Kobi] Switching to ${configs[activeConfigIndex].label}`);
    return configs[activeConfigIndex];
  }
  activeConfigIndex = configs.length - 1;
  return null;
}

async function getAutoContext(userId: string, sessionId?: number): Promise<string> {
  const promises: Promise<string>[] = [
    pool.query(`
      SELECT 
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as tables,
        (SELECT count(*) FROM users WHERE is_active = true) as active_users,
        (SELECT count(*) FROM platform_modules WHERE is_active = true) as active_modules
    `).then(r => {
      const s = r.rows[0];
      return `\n[מערכת: ${s.tables} טבלאות, ${s.active_users} משתמשים, ${s.active_modules} מודולים]`;
    }).catch(() => ""),
    getProjectMemory(userId).then(m => m || "").catch(() => ""),
  ];
  if (sessionId) {
    promises.push(getSessionContext(sessionId).then(c => c || "").catch(() => ""));
  }
  const results = await Promise.all(promises);
  return results.join("");
}

router.post("/kobi/sessions", async (req, res) => {
  const userId = (req as any).userId || "";
  const { title, agent_type } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO kobi_sessions (user_id, title, agent_type) VALUES ($1, $2, $3) RETURNING *",
      [userId, title || "שיחה חדשה", agent_type || "general"]
    );
    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/kobi/sessions", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const result = await pool.query(
      `SELECT id, title, status, agent_type, total_messages, total_tool_calls, pinned, created_at, updated_at 
       FROM kobi_sessions WHERE user_id = $1 AND status != 'deleted' 
       ORDER BY pinned DESC, updated_at DESC LIMIT 100`,
      [userId]
    );
    res.json({ sessions: result.rows });
  } catch {
    res.json({ sessions: [] });
  }
});

router.put("/kobi/sessions/:id", async (req, res) => {
  const id = String(req.params.id);
  const { title, status, pinned } = req.body;
  try {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (pinned !== undefined) { sets.push(`pinned = $${idx++}`); vals.push(pinned); }
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE kobi_sessions SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/kobi/sessions/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    await pool.query("UPDATE kobi_sessions SET status = 'deleted', updated_at = NOW() WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/kobi/sessions/:id/messages", async (req, res) => {
  const id = String(req.params.id);
  try {
    const result = await pool.query(
      `SELECT id, role, content, tool_calls, tool_results, response_time_ms, tool_loops, created_at 
       FROM kobi_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 500`,
      [id]
    );
    res.json({ messages: result.rows });
  } catch {
    res.json({ messages: [] });
  }
});

router.get("/kobi/memory", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const result = await pool.query(
      "SELECT id, category, key, value, importance, created_at, updated_at FROM kobi_memory WHERE user_id = $1 ORDER BY category, importance DESC",
      [userId]
    );
    res.json({ memories: result.rows });
  } catch {
    res.json({ memories: [] });
  }
});

router.delete("/kobi/memory/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    await pool.query("DELETE FROM kobi_memory WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/kobi/tasks", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const result = await pool.query(
      "SELECT * FROM kobi_tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId]
    );
    res.json({ tasks: result.rows });
  } catch {
    res.json({ tasks: [] });
  }
});

router.get("/kobi/files", (req, res) => {
  const reqPath = (req.query.path as string) || ".";
  const ROOT = join(process.cwd(), "../..");
  const clean = reqPath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullPath = join(ROOT, clean);
  if (!fullPath.startsWith(ROOT)) {
    res.status(403).json({ error: "נתיב לא מורשה" });
    return;
  }
  if (!existsSync(fullPath)) {
    res.status(404).json({ error: "תיקייה לא נמצאה" });
    return;
  }
  try {
    const entries = readdirSync(fullPath);
    const items = entries
      .filter(e => !e.startsWith(".") && e !== "node_modules" && e !== "dist" && e !== ".git")
      .map(entry => {
        const fp = join(fullPath, entry);
        try {
          const stat = statSync(fp);
          return {
            name: entry,
            path: join(clean, entry).replace(/\\/g, "/"),
            isDir: stat.isDirectory(),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ path: clean, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/kobi/files/read", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "path נדרש" });
    return;
  }
  const ROOT = join(process.cwd(), "../..");
  const clean = filePath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullPath = join(ROOT, clean);
  if (!fullPath.startsWith(ROOT)) {
    res.status(403).json({ error: "נתיב לא מורשה" });
    return;
  }
  const basename = clean.split("/").pop() || "";
  const BLOCKED_PATTERNS = [".env", ".secret", ".key", ".pem", ".cert", "id_rsa", ".npmrc", ".netrc"];
  if (basename.startsWith(".") || BLOCKED_PATTERNS.some(p => basename.includes(p))) {
    res.status(403).json({ error: "קובץ מוגן — לא ניתן לקרוא קבצים רגישים" });
    return;
  }
  if (!existsSync(fullPath)) {
    res.status(404).json({ error: "קובץ לא נמצא" });
    return;
  }
  try {
    const stat = statSync(fullPath);
    if (stat.size > 500000) {
      res.status(413).json({ error: "קובץ גדול מדי (>500KB)" });
      return;
    }
    const content = readFileSync(fullPath, "utf-8");
    const ext = extname(fullPath).slice(1);
    res.json({ path: clean, content, extension: ext, lines: content.split("\n").length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/kobi/files/save", (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof content !== "string") {
    res.status(400).json({ error: "path ו-content נדרשים" });
    return;
  }
  const ROOT = join(process.cwd(), "../..");
  const clean = filePath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullPath = join(ROOT, clean);
  if (!fullPath.startsWith(ROOT)) {
    res.status(403).json({ error: "נתיב לא מורשה" });
    return;
  }
  const basename = clean.split("/").pop() || "";
  const BLOCKED_PATTERNS = [".env", ".secret", ".key", ".pem", ".cert", "id_rsa", ".npmrc", ".netrc"];
  if (BLOCKED_PATTERNS.some(p => basename.includes(p))) {
    res.status(403).json({ error: "קובץ מוגן — לא ניתן לכתוב" });
    return;
  }
  try {
    writeFileSync(fullPath, content, "utf-8");
    res.json({ success: true, path: clean, size: Buffer.byteLength(content, "utf-8") });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/kobi/files/create", (req, res) => {
  const { path: filePath, isDir } = req.body;
  if (!filePath) { res.status(400).json({ error: "path נדרש" }); return; }
  const ROOT = join(process.cwd(), "../..");
  const clean = filePath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullPath = join(ROOT, clean);
  if (!fullPath.startsWith(ROOT)) { res.status(403).json({ error: "נתיב לא מורשה" }); return; }
  try {
    if (isDir) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, "", "utf-8");
    }
    res.json({ success: true, path: clean, isDir: !!isDir });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/kobi/files/rename", (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) { res.status(400).json({ error: "oldPath ו-newPath נדרשים" }); return; }
  const ROOT = join(process.cwd(), "../..");
  const cleanOld = oldPath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const cleanNew = newPath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullOld = join(ROOT, cleanOld);
  const fullNew = join(ROOT, cleanNew);
  if (!fullOld.startsWith(ROOT) || !fullNew.startsWith(ROOT)) { res.status(403).json({ error: "נתיב לא מורשה" }); return; }
  if (!existsSync(fullOld)) { res.status(404).json({ error: "הקובץ לא נמצא" }); return; }
  try {
    renameSync(fullOld, fullNew);
    res.json({ success: true, oldPath: cleanOld, newPath: cleanNew });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/kobi/files/delete", (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) { res.status(400).json({ error: "path נדרש" }); return; }
  const ROOT = join(process.cwd(), "../..");
  const clean = filePath.replace(/\.\./g, "").replace(/\/\//g, "/");
  const fullPath = join(ROOT, clean);
  if (!fullPath.startsWith(ROOT)) { res.status(403).json({ error: "נתיב לא מורשה" }); return; }
  const PROTECTED = ["artifacts", "packages", "lib", "node_modules", ".git", "package.json", "pnpm-workspace.yaml"];
  if (PROTECTED.includes(clean) || PROTECTED.includes(clean.split("/")[0]?.split("/")[0] || "")) {
    const parts = clean.split("/");
    if (parts.length <= 1 && PROTECTED.includes(parts[0])) {
      res.status(403).json({ error: "לא ניתן למחוק תיקייה מוגנת ברמה העליונה" }); return;
    }
  }
  try {
    const stat = statSync(fullPath);
    if (stat.isDirectory()) { rmSync(fullPath, { recursive: true, force: true }); }
    else { unlinkSync(fullPath); }
    res.json({ success: true, path: clean });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/kobi/terminal", (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "פקודה נדרשת" });
    return;
  }
  const BLOCKED = ["rm -rf /", "mkfs", "dd if=", ":(){", "shutdown", "reboot", "halt", "poweroff"];
  if (BLOCKED.some(b => command.includes(b))) {
    res.status(403).json({ error: "פקודה חסומה מטעמי אבטחה" });
    return;
  }
  const ROOT = join(process.cwd(), "../..");
  try {
    const output = execSync(command, {
      cwd: ROOT,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
      env: { ...process.env, PATH: process.env.PATH },
    });
    res.json({ output: output || "בוצע בהצלחה" });
  } catch (e: any) {
    const stderr = e.stderr || e.message || "שגיאה בביצוע הפקודה";
    const stdout = e.stdout || "";
    res.json({ output: stdout ? `${stdout}\n${stderr}` : stderr });
  }
});

router.get("/kobi/git/status", (_req, res) => {
  const ROOT = join(process.cwd(), "../..");
  try {
    const branch = execSync("git branch --show-current 2>/dev/null || echo main", { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const statusRaw = execSync("git status --porcelain 2>/dev/null || echo ''", { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const files = statusRaw ? statusRaw.split("\n").map(line => {
      const status = line.substring(0, 2).trim();
      const filePath = line.substring(3);
      let statusLabel = "שונה";
      if (status === "??" || status === "A") statusLabel = "חדש";
      else if (status === "D") statusLabel = "נמחק";
      else if (status === "R") statusLabel = "הועבר";
      else if (status === "M" || status === "MM") statusLabel = "שונה";
      return { path: filePath, status, statusLabel };
    }) : [];
    const logRaw = execSync("git log --oneline -20 2>/dev/null || echo ''", { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const commits = logRaw ? logRaw.split("\n").map(line => {
      const spaceIdx = line.indexOf(" ");
      return { hash: line.substring(0, spaceIdx), message: line.substring(spaceIdx + 1) };
    }) : [];
    const branchesRaw = execSync("git branch -a 2>/dev/null || echo main", { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const branches = branchesRaw.split("\n").map(b => b.replace("*", "").trim()).filter(Boolean);
    res.json({ data: { branch, files, commits, branches } });
  } catch (e: any) {
    res.json({ data: { branch: "main", files: [], commits: [], branches: ["main"], error: e.message } });
  }
});

router.post("/kobi/git/action", (req, res) => {
  const ROOT = join(process.cwd(), "../..");
  const { action, message, files } = req.body;
  try {
    let output = "";
    switch (action) {
      case "add":
        if (files && Array.isArray(files)) {
          output = execSync(`git add ${files.map((f: string) => `"${f}"`).join(" ")}`, { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        } else {
          output = execSync("git add -A", { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        }
        break;
      case "commit":
        const msg = message || "עדכון מ-קובי IDE";
        execSync("git add -A", { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        output = execSync(`git commit -m "${msg}"`, { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        break;
      case "diff":
        if (files && files[0]) {
          output = execSync(`git diff -- "${files[0]}" 2>/dev/null; git diff --cached -- "${files[0]}" 2>/dev/null`, { cwd: ROOT, encoding: "utf-8", timeout: 10000 }) || "אין שינויים";
        } else {
          output = execSync("git diff 2>/dev/null; git diff --cached 2>/dev/null", { cwd: ROOT, encoding: "utf-8", timeout: 10000 }) || "אין שינויים";
        }
        break;
      case "stash":
        output = execSync("git stash", { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        break;
      case "stash-pop":
        output = execSync("git stash pop", { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        break;
      case "reset":
        if (files && files[0]) {
          output = execSync(`git checkout -- "${files[0]}"`, { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        } else {
          output = execSync("git checkout -- .", { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        }
        break;
      case "checkout":
        if (files && files[0]) {
          output = execSync(`git checkout "${files[0]}"`, { cwd: ROOT, encoding: "utf-8", timeout: 10000 });
        }
        break;
      case "push":
        output = execSync("git push 2>&1 || echo 'Push failed or no remote'", { cwd: ROOT, encoding: "utf-8", timeout: 30000 });
        break;
      default:
        res.status(400).json({ error: "פעולה לא ידועה" });
        return;
    }
    res.json({ output: output || "בוצע בהצלחה" });
  } catch (e: any) {
    res.json({ output: e.stderr || e.stdout || e.message || "שגיאה" });
  }
});

router.post("/kobi/chat/stream", async (req, res) => {
  let config = getActiveConfig();
  if (!config.apiKey) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY לא מוגדר" });
    return;
  }

  const { messages, sessionId } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages נדרש" });
    return;
  }

  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
  const maxImagesPerMsg = 5;
  const maxImageSizeBytes = 10 * 1024 * 1024;
  for (const m of messages) {
    if (m.images && Array.isArray(m.images)) {
      if (m.images.length > maxImagesPerMsg) {
        res.status(400).json({ error: `מקסימום ${maxImagesPerMsg} תמונות בהודעה` });
        return;
      }
      for (const img of m.images) {
        if (!img.media_type || !allowedImageTypes.includes(img.media_type)) {
          res.status(400).json({ error: `סוג תמונה לא נתמך: ${img.media_type || "unknown"}` });
          return;
        }
        if (!img.base64 || typeof img.base64 !== "string") {
          res.status(400).json({ error: "base64 חסר בתמונה" });
          return;
        }
        const sizeEstimate = Math.ceil(img.base64.length * 0.75);
        if (sizeEstimate > maxImageSizeBytes) {
          res.status(400).json({ error: "תמונה גדולה מדי (מקסימום 10MB)" });
          return;
        }
      }
    }
  }

  const userId = (req as any).userId || "";

  let activeSessionId = sessionId ? Number(sessionId) : null;
  if (!activeSessionId) {
    try {
      const lastMsg = messages[messages.length - 1]?.content || "";
      const title = typeof lastMsg === "string" ? lastMsg.slice(0, 60) : "שיחה חדשה";
      const r = await pool.query(
        "INSERT INTO kobi_sessions (user_id, title) VALUES ($1, $2) RETURNING id",
        [userId, title]
      );
      activeSessionId = r.rows[0].id;
    } catch {
      activeSessionId = null;
    }
  }

  setSaveMemoryContext(userId, activeSessionId || undefined);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (activeSessionId) {
    res.write(`data: ${JSON.stringify({ session_id: activeSessionId })}\n\n`);
  }

  const startTime = Date.now();

  try {
    const [autoContext, recentMsgs] = await Promise.all([
      getAutoContext(userId, activeSessionId || undefined),
      (activeSessionId && messages.length === 1) ? getRecentMessages(activeSessionId, 10) : Promise.resolve([]),
    ]);
    const systemPrompt = KOBI_SYSTEM_PROMPT + autoContext;

    const historyMessages: any[] = recentMsgs.map((m: any) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, 4000) : JSON.stringify(m.content).slice(0, 4000),
    }));

    const currentMessages = messages.map((m: any) => ({
      role: m.role,
      content: buildClaudeContent(m),
    }));

    const claudeMessages: any[] = [...historyMessages, ...currentMessages];

    if (activeSessionId) {
      const userContent = messages[messages.length - 1]?.content || "";
      saveMessage(activeSessionId, "user", typeof userContent === "string" ? userContent : JSON.stringify(userContent)).catch(() => {});
    }

    let toolLoop = 0;
    let finalContent = "";
    let totalToolCalls = 0;
    const allToolActions: any[] = [];
    const toolBudget = getToolBudget(messages);
    const isHeavyRequest = toolBudget === MAX_TOOL_LOOPS_HEAVY;

    const makeTaskPhases = () => [
      { phase: 1, name: "איסוף נתונים", status: "pending", toolsUsed: [] as string[], startedAt: 0, completedAt: 0 },
      { phase: 2, name: "ניתוח ועיבוד", status: "pending", toolsUsed: [] as string[], startedAt: 0, completedAt: 0 },
      { phase: 3, name: "הצגת תוצאות", status: "pending", toolsUsed: [] as string[], startedAt: 0, completedAt: 0 },
    ];

    let taskPhases: ReturnType<typeof makeTaskPhases> | null = isHeavyRequest ? makeTaskPhases() : null;
    let currentPhaseIndex = 0;
    const BUDGET_PRESSURE_THRESHOLD = Math.max(5, Math.floor(toolBudget * 0.4));

    if (isHeavyRequest && taskPhases) {
      res.write(`data: ${JSON.stringify({ phases_started: true, phases: taskPhases.map(p => p.name), total_budget: toolBudget })}\n\n`);
    }

    while (toolLoop < toolBudget) {
      toolLoop++;

      if (!taskPhases && toolLoop >= BUDGET_PRESSURE_THRESHOLD) {
        taskPhases = makeTaskPhases();
        currentPhaseIndex = 1;
        taskPhases[0].status = "completed";
        taskPhases[0].completedAt = Date.now();
        taskPhases[1].status = "running";
        taskPhases[1].startedAt = Date.now();
        res.write(`data: ${JSON.stringify({ phases_started: true, phases: taskPhases.map(p => p.name), total_budget: toolBudget, triggered_by: "budget_pressure" })}\n\n`);
        res.write(`data: ${JSON.stringify({ phase_start: 2, phase_name: taskPhases[1].name })}\n\n`);
      }

      if (taskPhases) {
        const expectedPhase = Math.min(Math.floor((toolLoop - 1) / Math.ceil(toolBudget / taskPhases.length)), taskPhases.length - 1);
        if (expectedPhase !== currentPhaseIndex) {
          if (taskPhases[currentPhaseIndex]) {
            taskPhases[currentPhaseIndex].status = "completed";
            taskPhases[currentPhaseIndex].completedAt = Date.now();
            const phaseResult = `פאזה ${taskPhases[currentPhaseIndex].phase} הושלמה: ${taskPhases[currentPhaseIndex].toolsUsed.join(", ")}`;
            res.write(`data: ${JSON.stringify({ phase_complete: taskPhases[currentPhaseIndex].phase, phase_name: taskPhases[currentPhaseIndex].name, tools_used: taskPhases[currentPhaseIndex].toolsUsed })}\n\n`);
            if (activeSessionId && userId) {
              await saveMemory(userId, "פאזות משימה", `פאזה ${taskPhases[currentPhaseIndex].phase}`, phaseResult, 4, activeSessionId).catch(() => {});
            }
          }
          currentPhaseIndex = expectedPhase;
          if (taskPhases[currentPhaseIndex]) {
            taskPhases[currentPhaseIndex].status = "running";
            taskPhases[currentPhaseIndex].startedAt = Date.now();
            res.write(`data: ${JSON.stringify({ phase_start: taskPhases[currentPhaseIndex].phase, phase_name: taskPhases[currentPhaseIndex].name })}\n\n`);
          }
        } else if (toolLoop === 1 && taskPhases[0]) {
          taskPhases[0].status = "running";
          taskPhases[0].startedAt = Date.now();
          res.write(`data: ${JSON.stringify({ phase_start: 1, phase_name: taskPhases[0].name })}\n\n`);
        }
      }

      await waitForRateLimit();

      const remaining = toolBudget - toolLoop;
      let budgetHint = "";
      if (remaining <= 3 && toolLoop > 1) {
        budgetHint = `\n\n⚠️ [מערכת: נותרו ${remaining} סבבי כלים. סכם את התוצאות וסיים. אם יש עוד עבודה — תן תשובה חלקית עם רשימת המשך.]`;
      } else if (remaining <= 8 && toolLoop > 3) {
        budgetHint = `\n\n[מערכת: נותרו ${remaining} סבבי כלים מתוך ${toolBudget}. אחד שאילתות SQL ככל האפשר.]`;
      }

      const smartMaxTokens = toolLoop === 1 && !isHeavyRequest ? 4096 : 8192;
      const claudeRequestBody = {
        model: config.model,
        max_tokens: smartMaxTokens,
        temperature: 0.3,
        system: systemPrompt + budgetHint,
        messages: claudeMessages,
        tools: KOBI_TOOLS_SCHEMA,
        stream: true,
      };

      let response = await fetchClaudeWithRetry(
        `${config.baseUrl}/v1/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(claudeRequestBody),
          signal: AbortSignal.timeout(180_000),
        },
        res
      );

      if (!response.ok) {
        const errText = await response.text();
        const isBillingError = errText.includes("credit balance") || errText.includes("billing") || errText.includes("rate_limit") || errText.includes("overloaded") || errText.includes("UNSUPPORTED_MODEL");
        if (isBillingError) {
          const nextConfig = switchToNextConfig();
          if (nextConfig) {
            console.log(`[Kobi] ${config.label} failed (${response.status}), switching to ${nextConfig.label}`);
            config = nextConfig;
            await waitForRateLimit();
            response = await fetchClaudeWithRetry(
              `${config.baseUrl}/v1/messages`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": config.apiKey,
                  "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({ ...claudeRequestBody, model: config.model }),
                signal: AbortSignal.timeout(180_000),
              },
              res
            );
            if (!response.ok) {
              const errText2 = await response.text();
              console.error(`[Kobi] ${config.label} also failed: ${errText2.slice(0, 500)}`);
              res.write(`data: ${JSON.stringify({ error: `שגיאת Claude (${response.status}): ${errText2.slice(0, 200)}` })}\n\n`);
              res.end();
              return;
            }
          } else {
            console.error(`[Kobi] All providers failed: ${errText.slice(0, 500)}`);
            res.write(`data: ${JSON.stringify({ error: `שגיאת Claude (${response.status}): ${errText.slice(0, 200)}` })}\n\n`);
            res.end();
            return;
          }
        } else {
          console.error(`[Kobi] Claude API error ${response.status}: ${errText.slice(0, 500)}`);
          res.write(`data: ${JSON.stringify({ error: `שגיאת Claude (${response.status}): ${errText.slice(0, 200)}` })}\n\n`);
          res.end();
          return;
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentText = "";
      let toolUseBlocks: Array<{ id: string; name: string; input: any }> = [];
      let currentToolId = "";
      let currentToolName = "";
      let currentToolInput = "";
      let stopReason = "";
      let inToolUse = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data) continue;
          try {
            const event = JSON.parse(data);

            if (event.type === "content_block_start") {
              if (event.content_block?.type === "tool_use") {
                inToolUse = true;
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = "";
                res.write(`data: ${JSON.stringify({ tool_start: currentToolName, tool_id: currentToolId })}\n\n`);
              }
            }

            if (event.type === "content_block_delta") {
              if (event.delta?.type === "text_delta" && event.delta?.text) {
                currentText += event.delta.text;
                res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
              }
              if (event.delta?.type === "input_json_delta" && event.delta?.partial_json) {
                currentToolInput += event.delta.partial_json;
              }
            }

            if (event.type === "content_block_stop" && inToolUse) {
              try {
                const parsedInput = JSON.parse(currentToolInput || "{}");
                toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
              } catch {
                toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: {} });
              }
              inToolUse = false;
            }

            if (event.type === "message_delta" && event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          } catch {}
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6).trim());
            if (event.delta?.type === "text_delta") currentText += event.delta.text || "";
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          } catch {}
        }
      }

      if (currentText) finalContent += currentText;

      if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
        const assistantContent: any[] = [];
        if (currentText) assistantContent.push({ type: "text", text: currentText });
        for (const tb of toolUseBlocks) {
          assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input: tb.input });
        }
        claudeMessages.push({ role: "assistant", content: assistantContent });

        const toolResults: any[] = [];
        for (const tb of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({ tool_executing: tb.name, tool_input: tb.input })}\n\n`);
          totalToolCalls++;

          if (taskPhases && taskPhases[currentPhaseIndex]) {
            taskPhases[currentPhaseIndex].toolsUsed.push(tb.name);
          }

          const toolStart = Date.now();
          const toolInput = tb.name === "db_schema" && activeSessionId
            ? { ...tb.input, session_id: String(activeSessionId) }
            : tb.input;
          const result = await executeTool(tb.name, toolInput);
          const toolTime = Date.now() - toolStart;
          const resultText = result.error ? `❌ שגיאה: ${result.error}` : result.result;
          const truncatedResult = resultText.slice(0, 3000);
          res.write(`data: ${JSON.stringify({ tool_result: tb.name, result: truncatedResult, success: !result.error, time_ms: toolTime })}\n\n`);

          if (!result.error && (tb.name === "write_file" || tb.name === "edit_file")) {
            res.write(`data: ${JSON.stringify({ file_changed: tb.input.path, action: tb.name })}\n\n`);
          }
          if (!result.error && tb.name === "run_command") {
            res.write(`data: ${JSON.stringify({ command_output: tb.input.command, output: truncatedResult })}\n\n`);
          }
          if (!result.error && tb.name === "run_sql") {
            res.write(`data: ${JSON.stringify({ command_output: `SQL: ${(tb.input.query || "").slice(0, 100)}`, output: truncatedResult })}\n\n`);
          }
          if (!result.error && tb.name === "create_page") {
            const pagePath = tb.input.page_path?.startsWith("/") ? tb.input.page_path : `/${tb.input.page_path || ""}`;
            res.write(`data: ${JSON.stringify({ preview_url: pagePath })}\n\n`);
          }
          if (!result.error && tb.name === "show_map" && (result as any)._mapData) {
            res.write(`data: ${JSON.stringify({ map_data: (result as any)._mapData })}\n\n`);
          }

          allToolActions.push({ name: tb.name, input: tb.input, result: truncatedResult, success: !result.error, time_ms: toolTime });

          toolResults.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: resultText.slice(0, 8000),
          });
        }
        claudeMessages.push({ role: "user", content: toolResults });

        currentText = "";
        toolUseBlocks = [];
        continue;
      }

      break;
    }

    const responseTimeMs = Date.now() - startTime;

    if (taskPhases && taskPhases[currentPhaseIndex]) {
      const lastPhase = taskPhases[currentPhaseIndex];
      if (lastPhase.status === "running") {
        const budgetExhausted = toolLoop >= toolBudget;
        lastPhase.status = budgetExhausted ? "partial" : "completed";
        lastPhase.completedAt = Date.now();
      }
    }

    let deliveredContent = finalContent;
    const budgetExhausted = toolLoop >= toolBudget;
    if (budgetExhausted && taskPhases) {
      const completedPhases = taskPhases.filter(p => p.status === "completed").map(p => p.name);
      const pendingPhases = taskPhases.filter(p => p.status === "pending").map(p => p.name);
      const partialPhases = taskPhases.filter(p => p.status === "partial").map(p => p.name);
      const remaining = [...pendingPhases, ...partialPhases];
      const continueHint = remaining.length > 0
        ? `\n\n[נדרש המשך — כתוב "המשך" להמשיך. שלבים שנותרו: ${remaining.join(", ")}. הושלמו: ${completedPhases.join(", ")}.]`
        : `\n\n[⚠️ תקציב הכלים נגמר. הושלמו: ${completedPhases.join(", ")}.]`;
      deliveredContent = (finalContent.trim() || "בוצע חלקית") + continueHint;
    }

    if (taskPhases && activeSessionId && userId) {
      const phaseSummary = taskPhases.map(p => `פאזה ${p.phase} (${p.name}): ${p.status}`).join(", ");
      await saveMemory(userId, "פאזות משימה", "סיכום", phaseSummary, 4, activeSessionId).catch(() => {});
      const phasesJson = JSON.stringify(taskPhases);
      await updateSessionContext(activeSessionId, `[task_phases]: ${phasesJson.slice(0, 500)}`).catch(() => {});
      res.write(`data: ${JSON.stringify({ phases_done: true, phases: taskPhases })}\n\n`);
    }

    console.log(`[Kobi] Session#${activeSessionId} done ${responseTimeMs}ms, ${toolLoop} loops, ${totalToolCalls} tools, ${deliveredContent.length} chars`);

    if (activeSessionId) {
      await saveMessage(activeSessionId, "assistant", deliveredContent.slice(0, 10000), allToolActions, [], responseTimeMs, toolLoop);

      try {
        await pool.query(
          "UPDATE kobi_sessions SET total_tool_calls = total_tool_calls + $1, updated_at = NOW() WHERE id = $2",
          [totalToolCalls, activeSessionId]
        );
      } catch {}

      const userMsg = messages[messages.length - 1]?.content || "";
      await autoExtractMemory(userId, typeof userMsg === "string" ? userMsg : "", deliveredContent, activeSessionId);
    }

    try {
      await pool.query(
        "INSERT INTO kobi_chat_logs (user_id, user_message, assistant_response, tool_loops, response_time_ms, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
        [userId, (messages[messages.length - 1]?.content || "").slice(0, 500), deliveredContent.slice(0, 5000), toolLoop, responseTimeMs]
      );
    } catch {}

    const lastUserMsg = messages?.[messages.length - 1]?.content || "";
    writeAuditLog({
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      taskType: "reasoning",
      inputSummary: typeof lastUserMsg === "string" ? lastUserMsg : JSON.stringify(lastUserMsg),
      outputSummary: deliveredContent,
      latencyMs: responseTimeMs,
      statusCode: 200,
      actionTaken: totalToolCalls > 0 ? `${totalToolCalls} כלים הופעלו` : undefined,
      userId: userId?.toString(),
      sessionId: activeSessionId?.toString(),
    }).catch(() => {});

    res.write(`data: ${JSON.stringify({ done: true, fullContent: deliveredContent, responseTimeMs, toolLoops: toolLoop, totalToolCalls, session_id: activeSessionId, phases: taskPhases || undefined })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error(`[Kobi] Error:`, error.message);
    if (!res.headersSent) {
      res.status(502).json({ error: error.message || "שגיאת קובי" });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

router.get("/kobi/status", async (_req, res) => {
  const configured = !!getActiveConfig().apiKey;
  let dbStatus = "unknown";
  try {
    const s = Date.now();
    await pool.query("SELECT 1");
    dbStatus = `${Date.now() - s}ms`;
  } catch { dbStatus = "error"; }

  res.json({
    configured,
    provider: "anthropic",
    name: "קובי (Claude)",
    model: "claude-sonnet-4-20250514",
    dbLatency: dbStatus,
    maxToolLoops: `${MAX_TOOL_LOOPS_NORMAL} (normal) / ${MAX_TOOL_LOOPS_HEAVY} (heavy)`,
    features: ["multi-session", "long-term-memory", "auto-context", "sql-cache", "rate-limit-mgmt", "retry-with-backoff", "tool-budget", "phased-execution", "task-queue", "data-flows", "44-tools", "vision", "erp-queries", "financial-calc", "bi-insights", "customer-service", "inventory", "workflows", "build-feature", "package-manager", "git-ops"],
    totalTools: 44,
    toolCategories: {
      files: 6,
      database: 6,
      building: 4,
      infrastructure: 5,
      business: 8,
      security: 6,
      devAgent: 3,
      vision: 1,
    },
  });
});

router.get("/kobi/history", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const result = await pool.query(
      "SELECT id, user_message, assistant_response, tool_loops, response_time_ms, created_at FROM kobi_chat_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId]
    );
    res.json({ history: result.rows });
  } catch {
    res.json({ history: [] });
  }
});

router.get("/super-agent/history", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const sessions = await pool.query(
      `SELECT s.id, s.title, s.status, s.agent_type, s.total_messages, s.total_tool_calls, s.pinned, s.created_at, s.updated_at
       FROM kobi_sessions s WHERE s.user_id = $1 AND s.status != 'deleted' 
       ORDER BY s.pinned DESC, s.updated_at DESC LIMIT 100`,
      [userId]
    );
    const logs = await pool.query(
      "SELECT id, user_message, assistant_response, tool_loops, response_time_ms, created_at FROM kobi_chat_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId]
    );
    res.json({ sessions: sessions.rows, history: logs.rows, total_tools: 44 });
  } catch {
    res.json({ sessions: [], history: [], total_tools: 44 });
  }
});

export default router;
