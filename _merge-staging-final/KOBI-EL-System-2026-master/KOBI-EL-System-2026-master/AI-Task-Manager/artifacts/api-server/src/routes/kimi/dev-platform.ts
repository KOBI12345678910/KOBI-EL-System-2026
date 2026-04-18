import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";
import { loginUser } from "../../lib/auth";

const router = Router();
const WORKSPACE = process.cwd().replace(/\/artifacts\/api-server$/, "");

let _systemToken: string | null = null;
let _systemTokenExpiry = 0;

async function getSystemAdminToken(): Promise<string> {
  const now = Date.now();
  if (_systemToken && now < _systemTokenExpiry) return _systemToken;

  const IS_PROD = process.env.NODE_ENV === "production";
  const candidates: Array<{ username: string; password: string }> = [];
  if (process.env.KIMI_SYSTEM_USERNAME && process.env.KIMI_SYSTEM_PASSWORD) {
    candidates.push({ username: process.env.KIMI_SYSTEM_USERNAME, password: process.env.KIMI_SYSTEM_PASSWORD });
  }
  if (IS_PROD && candidates.length === 0) {
    throw new Error("[kimi] KIMI_SYSTEM_USERNAME and KIMI_SYSTEM_PASSWORD must be set in production");
  }
  if (!IS_PROD) {
    candidates.push(
      { username: "admin", password: "admin123" },
      { username: "kobie4kayam", password: "admin123" }
    );
  }

  for (const cred of candidates) {
    const result = await loginUser(cred.username, cred.password);
    if (result.token) {
      _systemToken = `Bearer ${result.token}`;
      _systemTokenExpiry = now + 60 * 60 * 1000;
      return _systemToken;
    }
  }

  throw new Error("מערכת Kimi2 אינה יכולה להתחבר: לא ניתן לאמת חשבון מערכת");
}

router.get("/kimi/dev/file-tree", async (req: Request, res: Response) => {
  try {
    const rootDir = req.query.path as string || "";
    const baseDir = path.resolve(WORKSPACE, rootDir);
    if (!baseDir.startsWith(WORKSPACE + path.sep) && baseDir !== WORKSPACE) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist" && e.name !== ".git")
      .map(e => ({
        name: e.name,
        path: path.join(rootDir, e.name),
        type: e.isDirectory() ? "directory" : "file",
        extension: e.isFile() ? path.extname(e.name).slice(1) : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ items, currentPath: rootDir });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/file", async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: "path required" }); return; }
    const fullPath = path.resolve(WORKSPACE, filePath);
    if (!fullPath.startsWith(WORKSPACE + path.sep) && fullPath !== WORKSPACE) { res.status(403).json({ error: "Access denied" }); return; }
    if (!fs.existsSync(fullPath)) { res.status(404).json({ error: "File not found" }); return; }
    const stat = fs.statSync(fullPath);
    if (stat.size > 1024 * 1024) { res.status(413).json({ error: "File too large (>1MB)" }); return; }
    const content = fs.readFileSync(fullPath, "utf-8");
    const ext = path.extname(filePath).slice(1);
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
      json: "json", css: "css", html: "html", sql: "sql", md: "markdown", py: "python",
      sh: "shell", yaml: "yaml", yml: "yaml", toml: "toml", env: "plaintext",
    };
    res.json({ content, language: langMap[ext] || "plaintext", path: filePath, size: stat.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/kimi/dev/file", async (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) { res.status(400).json({ error: "path and content required" }); return; }
    const fullPath = path.resolve(WORKSPACE, filePath);
    if (!fullPath.startsWith(WORKSPACE + path.sep) && fullPath !== WORKSPACE) { res.status(403).json({ error: "Access denied" }); return; }
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/kimi/dev/file", async (req: Request, res: Response) => {
  try {
    const { path: filePath, content, type } = req.body;
    if (!filePath) { res.status(400).json({ error: "path required" }); return; }
    const fullPath = path.resolve(WORKSPACE, filePath);
    if (!fullPath.startsWith(WORKSPACE + path.sep) && fullPath !== WORKSPACE) { res.status(403).json({ error: "Access denied" }); return; }
    if (type === "directory") {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content || "", "utf-8");
    }
    res.json({ success: true, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/kimi/dev/terminal", async (req: Request, res: Response) => {
  try {
    const { command } = req.body;
    if (!command) { res.status(400).json({ error: "command required" }); return; }
    const blocked = ["rm -rf /", "shutdown", "reboot", "mkfs", "dd if="];
    if (blocked.some(b => command.includes(b))) {
      res.status(403).json({ error: "Command blocked for safety" });
      return;
    }
    const result = childProcess.execSync(command, {
      cwd: WORKSPACE,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: process.env.PATH },
      encoding: "utf-8",
    });
    res.json({ output: result, exitCode: 0 });
  } catch (err: any) {
    res.json({ output: err.stdout || "" + (err.stderr || err.message), exitCode: err.status || 1 });
  }
});

router.post("/kimi/dev/sql", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }
    const lowerQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
    const firstWord = lowerQuery.replace(/^\(/, "").trim().split(/\s/)[0];
    const allowedStarts = ["select", "with", "explain", "show"];
    if (!allowedStarts.includes(firstWord)) {
      res.status(403).json({ error: "Only read-only queries (SELECT, WITH, EXPLAIN) are allowed" });
      return;
    }
    if (lowerQuery.includes("information_schema") || lowerQuery.includes("[blocked]")) {
      const result = await db.execute(sql`SELECT table_name, 
        (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
        FROM information_schema.tables t WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
      res.json({ rows: result.rows || [], rowCount: (result as any).rowCount || (result.rows || []).length });
      return;
    }
    const result = await db.execute(sql.raw(query));
    res.json({ rows: result.rows || result, rowCount: (result as any).rowCount || (result.rows || []).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/db-tables", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT table_name, 
        (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    res.json({ tables: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/db-schema/:table", async (req: Request, res: Response) => {
  try {
    const { table } = req.params;
    const cols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position
    `);
    const count = await db.execute(sql.raw(`SELECT count(*) as count FROM "${table}"`));
    res.json({ columns: cols.rows, rowCount: (count.rows[0] as any)?.count || 0, table });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/system-health", async (_req: Request, res: Response) => {
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - dbStart;

    const tableCount = await db.execute(sql`SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`);
    const totalRecords = await db.execute(sql`
      SELECT schemaname, relname as table_name, n_live_tup as row_count 
      FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20
    `);

    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      status: "healthy",
      database: { latencyMs: dbLatency, tableCount: (tableCount.rows[0] as any)?.count || 0 },
      server: {
        uptimeSeconds: Math.round(uptime),
        memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        maxMemoryMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      topTables: totalRecords.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

router.get("/kimi/dev/api-routes", async (_req: Request, res: Response) => {
  try {
    const routesFile = path.join(WORKSPACE, "artifacts/api-server/src/routes/index.ts");
    const content = fs.readFileSync(routesFile, "utf-8");
    const routePattern = /app\.use\(["']([^"']+)["']/g;
    const routes: string[] = [];
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      routes.push(match[1]);
    }
    const pages = fs.readdirSync(path.join(WORKSPACE, "artifacts/erp-app/src/pages"), { recursive: true, withFileTypes: false })
      .filter((f: any) => typeof f === "string" && (f.endsWith(".tsx") || f.endsWith(".ts")))
      .map((f: any) => String(f));
    res.json({ apiRoutes: routes, frontendPages: pages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/route-health", async (req: Request, res: Response) => {
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
    const testRoutes = [
      "/api/products", "/api/production-work-orders",
      "/api/projects-module", "/api/field-measurements", "/api/hr/employees",
      "/api/suppliers", "/api/raw-materials",
      "/api/sales/orders", "/api/chart-of-accounts",
      "/api/finance/trial-balance", "/api/kimi/status",
    ];
    const token = req.headers.authorization;
    const results = await Promise.all(
      testRoutes.map(async (route) => {
        try {
          const start = Date.now();
          const r = await fetch(`${baseUrl}${route}`, { headers: { Authorization: token || "" }, signal: AbortSignal.timeout(5000) });
          return { route, status: r.status, latencyMs: Date.now() - start, ok: r.ok };
        } catch (err: any) {
          return { route, status: 0, latencyMs: 0, ok: false, error: err.message };
        }
      })
    );
    res.json({ results, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/git-log", async (_req: Request, res: Response) => {
  try {
    const log = childProcess.execSync(
      'git log --oneline --all --graph --decorate -40',
      { cwd: WORKSPACE, timeout: 10000, encoding: "utf-8", maxBuffer: 512 * 1024 }
    );
    const branches = childProcess.execSync(
      'git branch -a --format="%(refname:short)|%(objectname:short)|%(creatordate:relative)"',
      { cwd: WORKSPACE, timeout: 5000, encoding: "utf-8" }
    );
    const status = childProcess.execSync(
      'git status --porcelain',
      { cwd: WORKSPACE, timeout: 5000, encoding: "utf-8" }
    );
    res.json({
      log: log.trim(),
      branches: branches.trim().split("\n").filter(Boolean).map(b => {
        const [name, hash, date] = b.split("|");
        return { name, hash, date };
      }),
      changedFiles: status.trim().split("\n").filter(Boolean).map(l => ({
        status: l.slice(0, 2).trim(),
        path: l.slice(3),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/git-diff", async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string || "";
    let diff: string;
    if (filePath) {
      const resolved = path.resolve(WORKSPACE, filePath);
      if (!resolved.startsWith(WORKSPACE + path.sep) && resolved !== WORKSPACE) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      diff = childProcess.execFileSync("git", ["diff", "--", filePath], {
        cwd: WORKSPACE, timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024,
      });
    } else {
      diff = childProcess.execFileSync("git", ["diff"], {
        cwd: WORKSPACE, timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024,
      });
    }
    res.json({ diff: diff || "(no changes)" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/route-health-full", async (req: Request, res: Response) => {
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
    const token = req.headers.authorization;
    const allRoutes = [
      "/api/products", "/api/production-work-orders",
      "/api/projects-module", "/api/field-measurements", "/api/hr/employees",
      "/api/suppliers", "/api/raw-materials",
      "/api/sales/orders", "/api/crm/leads",
      "/api/chart-of-accounts", "/api/finance/trial-balance",
      "/api/finance/income", "/api/finance/expenses",
      "/api/audit-log", "/api/global-search",
      "/api/ai-models", "/api/ai-queries", "/api/ai-recommendations",
      "/api/kimi/status", "/api/kimi/agents",
      "/api/kimi/dev/system-health", "/api/kimi/dev/db-tables",
    ];
    const results = await Promise.all(
      allRoutes.map(async (route) => {
        const cat = route.includes("/finance") ? "Finance" :
          route.includes("/ai-") || route.includes("/ai/") ? "AI" :
          route.includes("/kimi") ? "Kimi" : "Core";
        try {
          const start = Date.now();
          const r = await fetch(`${baseUrl}${route}`, {
            headers: { Authorization: token || "" },
            signal: AbortSignal.timeout(5000),
          });
          return { route, status: r.status, latencyMs: Date.now() - start, ok: r.ok, category: cat };
        } catch (err: any) {
          return { route, status: 0, latencyMs: 0, ok: false, error: err.message, category: cat };
        }
      })
    );
    const total = results.length;
    const passed = results.filter(r => r.ok).length;
    const failed = total - passed;
    const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);
    res.json({
      results,
      summary: { total, passed, failed, avgLatency, score: Math.round((passed / total) * 100) },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/data-flow", async (_req: Request, res: Response) => {
  try {
    const flows = [
      { from: "מכירות", to: "חשבונות", type: "הזמנות → חשבוניות", status: "active", table: "sales_orders → invoices" },
      { from: "מכירות", to: "מלאי", type: "הזמנות → שריון מלאי", status: "active", table: "sales_orders → inventory_items" },
      { from: "רכש", to: "מלאי", type: "קבלות → עדכון מלאי", status: "active", table: "purchase_orders → inventory_items" },
      { from: "רכש", to: "חשבונות", type: "הזמנות רכש → חשבוניות ספקים", status: "active", table: "purchase_orders → invoices" },
      { from: "ייצור", to: "מלאי", type: "פקודות עבודה → צריכת חומרים", status: "active", table: "production_work_orders → raw_materials" },
      { from: "ייצור", to: "חשבונות", type: "עלויות ייצור → הנהלת חשבונות", status: "active", table: "production_work_orders → general_ledger" },
      { from: "משאבי אנוש", to: "חשבונות", type: "שכר → הנהלת חשבונות", status: "planned", table: "employees → general_ledger" },
      { from: "מלאי", to: "רכש", type: "נקודת הזמנה → דרישות רכש", status: "active", table: "inventory_items → purchase_orders" },
      { from: "CRM", to: "מכירות", type: "לידים → הזמנות", status: "active", table: "customers → sales_orders" },
      { from: "פרויקטים", to: "חשבונות", type: "עלויות פרויקט → הנהלת חשבונות", status: "active", table: "projects → general_ledger" },
    ];
    const stats: Record<string, number> = {};
    for (const f of flows) {
      stats[f.from] = (stats[f.from] || 0) + 1;
      stats[f.to] = (stats[f.to] || 0) + 1;
    }
    res.json({ flows, departmentStats: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const actionHistory: Array<{ timestamp: string; actionType: string; params: any; success: boolean; result?: any; error?: string; durationMs: number }> = [];

async function resolveEntityByName(token: string | undefined): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const resp = await fetch(`${baseUrl}/platform/entities`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    const entities = await resp.json();
    const arr = Array.isArray(entities) ? entities : [];
    for (const e of arr) {
      map.set(String(e.id), e.id);
      if (e.name) map.set(e.name.toLowerCase(), e.id);
      if (e.nameHe) map.set(e.nameHe.toLowerCase(), e.id);
      if (e.slug) map.set(e.slug.toLowerCase(), e.id);
    }
  } catch {}
  return map;
}

async function resolveModuleByName(token: string | undefined): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const resp = await fetch(`${baseUrl}/platform/modules`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    const modules = await resp.json();
    const arr = Array.isArray(modules) ? modules : (modules.modules || []);
    for (const m of arr) {
      map.set(String(m.id), m.id);
      if (m.name) map.set(m.name.toLowerCase(), m.id);
      if (m.slug) map.set(m.slug.toLowerCase(), m.id);
    }
  } catch {}
  return map;
}

async function autoResolveId(val: any, resolver: Map<string, number>): Promise<number> {
  if (typeof val === "number") return val;
  const str = String(val).toLowerCase().trim();
  const resolved = resolver.get(str);
  if (resolved) return resolved;
  for (const [key, id] of resolver.entries()) {
    if (key.includes(str) || str.includes(key)) return id;
  }
  const plural = str.endsWith("s") ? str.slice(0, -1) : str + "s";
  const resolvedPlural = resolver.get(plural);
  if (resolvedPlural) return resolvedPlural;
  for (const [key, id] of resolver.entries()) {
    if (key.includes(plural) || plural.includes(key)) return id;
  }
  const available = [...new Set(resolver.values())].slice(0, 10).map(id => {
    for (const [k, v] of resolver.entries()) { if (v === id && isNaN(Number(k))) return `${k}[${v}]`; }
    return String(id);
  });
  throw new Error(`לא נמצא: "${val}". דוגמאות: ${available.join(", ")}`);
}

function generateSuggestions(actionType: string, params: any, result: any): string[] {
  const s: string[] = [];
  switch (actionType) {
    case "create_entity":
      s.push("הוסף שדות לישות (create_field)", "צור רשומת דוגמה (create_record)", "סיכום הישות (entity_summary)");
      break;
    case "create_field":
      s.push("הוסף שדה נוסף (create_field)", "כל שדות הישות (list_entity_fields)", "בדוק תקינות (validate_entity)");
      break;
    case "create_record":
      s.push("צור רשומה נוספת (create_record)", "חפש רשומות (search_records)", "ייצוא נתונים (export_data)");
      break;
    case "update_record":
      s.push("קרא את הרשומה (get_record)", "חפש רשומות (search_records)");
      break;
    case "delete_record":
      s.push("ספור רשומות (count_records)", "חפש רשומות (search_records)");
      break;
    case "get_record":
      s.push("עדכן רשומה (update_record)", "שכפל רשומה (clone_record)", "ייצוא (export_data)");
      break;
    case "clone_record":
      s.push("עדכן את העותק (update_record)", "חפש רשומות (search_records)");
      break;
    case "create_module":
      s.push("צור ישות ראשונה (create_entity)", "רשימת מודולים (list_modules)");
      break;
    case "list_entities":
      s.push("שדות ישות (list_entity_fields)", "סיכום ישות (entity_summary)", "מבנה טבלה (describe_table)");
      break;
    case "list_entity_fields":
      s.push("הוסף שדה (create_field)", "חפש רשומות (search_records)", "בדוק תקינות (validate_entity)");
      break;
    case "list_modules":
      s.push("רשימת ישויות (list_entities)", "צור מודול (create_module)");
      break;
    case "describe_table":
      s.push("שאילתת SELECT (sql_read)", "רשימת טבלאות (list_tables)", "אינדקסים (db_indexes)");
      break;
    case "search_records":
      s.push("צור רשומה (create_record)", "ספור רשומות (count_records)", "ייצוא (export_data)", "שאילתה מתקדמת (sql_read)");
      if (Array.isArray(result) && result.length > 0) s.push("עדכן רשומה (update_record)");
      break;
    case "count_records":
      s.push("חפש רשומות (search_records)", "ייצוא נתונים (export_data)", "סיכום ישות (entity_summary)", "ספירה מדויקת (sql_read)");
      break;
    case "bulk_create_records":
      s.push("ספור רשומות (count_records)", "חפש רשומות (search_records)", "ייצוא (export_data)");
      break;
    case "bulk_update_records":
      s.push("חפש רשומות (search_records)", "בדוק תקינות (validate_entity)");
      break;
    case "bulk_delete_records":
      s.push("ספור רשומות (count_records)", "חפש רשומות (search_records)");
      break;
    case "sql_read":
    case "sql_write":
      s.push("שאילתה נוספת (sql_read)", "מבנה טבלה (describe_table)", "סטטיסטיקת טבלאות (table_stats)");
      break;
    case "list_tables":
      s.push("מבנה טבלה (describe_table)", "סטטיסטיקה (table_stats)", "גודל DB (db_size)");
      break;
    case "table_stats":
      s.push("מבנה טבלה ספציפית (describe_table)", "גודל DB (db_size)", "אינדקסים (db_indexes)");
      break;
    case "db_size":
      s.push("סטטיסטיקת טבלאות (table_stats)", "מצב מערכת (system_stats)");
      break;
    case "db_indexes":
      s.push("מבנה טבלה (describe_table)", "שאילתת SQL (sql_read)");
      break;
    case "find_entity":
      s.push("סיכום ישות (entity_summary)", "שדות ישות (list_entity_fields)");
      break;
    case "entity_summary":
      s.push("חפש רשומות (search_records)", "בדוק תקינות (validate_entity)", "ייצוא (export_data)");
      break;
    case "validate_entity":
      s.push("תקן שדות (update_field)", "סיכום ישות (entity_summary)", "הוסף שדה (create_field)");
      break;
    case "compare_entities":
      s.push("סיכום ישות 1 (entity_summary)", "סיכום ישות 2 (entity_summary)");
      break;
    case "export_data":
      s.push("חפש רשומות (search_records)", "ספור רשומות (count_records)");
      break;
    case "system_stats":
      s.push("גודל DB (db_size)", "סטטיסטיקת טבלאות (table_stats)", "בדיקת בריאות API (api_call)");
      break;
    case "api_call":
      s.push("קריאת API נוספת (api_call)", "שאילתת SQL (sql_read)");
      break;
    case "list_menu_items":
      s.push("מחק פריט מהתפריט (delete_menu_item)", "עדכן פריט (update_menu_item)", "צור פריט חדש (create_menu_item)");
      break;
    case "delete_menu_item":
      s.push("הצג את התפריט העדכני (list_menu_items)", "צור פריט חדש (create_menu_item)");
      break;
    case "create_menu_item":
    case "update_menu_item":
      s.push("הצג את התפריט (list_menu_items)", "מחק פריט (delete_menu_item)");
      break;
    case "global_search":
      s.push("חפש באישות ספציפית (search_records)", "סיכום ישות (entity_summary)", "שאילתה ישירה (sql_read)");
      break;
    case "read_file":
      s.push("ערוך את הקובץ (edit_file)", "חפש בקוד (search_code)", "מידע על קובץ (file_info)");
      break;
    case "write_file":
      s.push("קרא את הקובץ (read_file)", "רשימת קבצים (list_files)");
      break;
    case "edit_file":
      s.push("קרא את הקובץ לאימות (read_file)", "חפש בקוד (search_code)");
      break;
    case "delete_file":
      s.push("רשימת קבצים (list_files)");
      break;
    case "list_files":
      s.push("קרא קובץ (read_file)", "חפש בקוד (search_code)", "צור תיקייה (create_directory)");
      break;
    case "search_code":
      s.push("קרא קובץ שנמצא (read_file)", "ערוך קובץ (edit_file)");
      break;
    case "run_command":
      s.push("הרץ פקודה נוספת (run_command)", "רשימת קבצים (list_files)");
      break;
    case "create_directory":
      s.push("צור קובץ (write_file)", "רשימת קבצים (list_files)");
      break;
    case "file_info":
      s.push("קרא את הקובץ (read_file)", "ערוך את הקובץ (edit_file)");
      break;
    case "git_status":
      s.push("הצג שינויים (git_diff)", "היסטוריה (git_log)");
      break;
    case "git_log":
      s.push("סטטוס (git_status)", "שינויים (git_diff)");
      break;
    case "git_diff":
      s.push("סטטוס (git_status)", "היסטוריה (git_log)");
      break;
    case "install_package":
      s.push("הרץ פקודה (run_command)", "הפעל מחדש (restart_server)");
      break;
    case "restart_server":
      s.push("מצב מערכת (system_stats)", "בדיקת ביצועים (performance_check)");
      break;
    case "duplicate_entity":
      s.push("הוסף שדות (create_field)", "סיכום הישות החדשה (entity_summary)");
      break;
    case "entity_relations":
      s.push("סיכום ישות (entity_summary)", "השווה ישויות (compare_entities)");
      break;
    case "schema_export":
      s.push("בדוק תקינות (validate_entity)", "רשימת ישויות (list_entities)");
      break;
    case "transfer_records":
      s.push("ספור רשומות ביעד (count_records)", "חפש ביעד (search_records)", "בדוק תקינות (validate_entity)");
      break;
    case "field_stats":
      s.push("סטטיסטיקת שדה אחר (field_stats)", "בדוק תקינות (validate_entity)", "ייצוא נתונים (export_data)");
      break;
    case "audit_log":
      s.push("יומן שינויים לטבלה אחרת (audit_log)", "חפש רשומות (search_records)", "מצב מערכת (system_stats)");
      break;
    case "performance_check":
      s.push("גודל DB (db_size)", "סטטיסטיקת טבלאות (table_stats)", "דוח איכות נתונים (data_quality_report)");
      break;
    case "data_quality_report":
      s.push("בדוק תקינות ישות ספציפית (validate_entity)", "בדיקת ביצועים (performance_check)", "הצעות חכמות (smart_suggest)");
      break;
    case "smart_suggest":
      s.push("בצע את ההצעה הראשונה", "דוח איכות (data_quality_report)", "בדיקת ביצועים (performance_check)");
      break;
    case "company_report":
      s.push("דוח כספי (financial_summary)", "דוח HR (hr_summary)", "דוח מלאי (inventory_summary)", "דוח ייצור (production_summary)");
      break;
    case "financial_summary":
      s.push("דוח מכירות (sales_summary)", "דוח רכש (purchasing_summary)", "דוח חברה כולל (company_report)");
      break;
    case "hr_summary":
      s.push("דוח חברה (company_report)", "מצב ייצור (production_summary)");
      break;
    case "inventory_summary":
      s.push("דוח ייצור (production_summary)", "דוח רכש (purchasing_summary)");
      break;
    case "production_summary":
      s.push("דוח מלאי (inventory_summary)", "דוח מכירות (sales_summary)");
      break;
    case "sales_summary":
      s.push("CRM Pipeline (crm_pipeline)", "דוח כספי (financial_summary)");
      break;
    case "purchasing_summary":
      s.push("דוח מלאי (inventory_summary)", "דוח כספי (financial_summary)");
      break;
    case "crm_pipeline":
      s.push("דוח מכירות (sales_summary)", "דוח חברה (company_report)");
      break;
    case "agent_health_check":
      s.push("דוח Workflows (workflow_report)", "דוח חברה (company_report)");
      break;
    case "workflow_report":
      s.push("בדיקת סוכנים (agent_health_check)", "מצב מערכת (system_stats)");
      break;
    case "validate_all_entities":
      s.push("דוח איכות (data_quality_report)", "בדוק ישות ספציפית (validate_entity)");
      break;
    case "api_documentation":
      s.push("חפש בקוד (search_code)", "רשימת קבצים (list_files)");
      break;
    case "backup_check":
      s.push("גודל DB (db_size)", "סטטיסטיקת טבלאות (table_stats)");
      break;
    case "module_coverage":
      s.push("רשימת מודולים (list_modules)", "רשימת ישויות (list_entities)");
      break;
    case "recent_activity":
      s.push("יומן שינויים (audit_log)", "דוח חברה (company_report)");
      break;
  }
  return s;
}

router.post("/kimi/dev/execute-action", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { actionType, params = {} } = req.body;
    if (!actionType) {
      res.status(400).json({ success: false, error: "actionType is required" });
      return;
    }

    const systemToken = await getSystemAdminToken();
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: systemToken,
    };

    const toSlugLocal = (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      return slug || `item_${Date.now()}`;
    };

    const internalFetch = async (method: string, fPath: string, body?: any, retries = 2) => {
      const timeoutMs = method === "GET" || method === "DELETE" ? 10000 : 20000;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const resp = await fetch(`${baseUrl}${fPath}`, {
            method,
            headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (resp.status === 204) return { success: true };
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            if ((resp.status === 502 || resp.status === 503 || resp.status === 504) && attempt < retries) {
              lastError = new Error(data.message || data.error || `HTTP ${resp.status}`);
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            throw new Error(data.message || data.error || `HTTP ${resp.status}`);
          }
          return data;
        } catch (err: any) {
          if (err.name === "AbortError" && attempt < retries) {
            lastError = new Error("Request timeout");
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          if (attempt < retries && (err.message?.includes("ECONNREFUSED") || err.message?.includes("fetch failed"))) {
            lastError = err;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error("Request failed after retries");
    };

    let entityMap: Map<string, number> | null = null;
    let moduleMap: Map<string, number> | null = null;

    const getEntityMap = async () => {
      if (!entityMap) entityMap = await resolveEntityByName(systemToken);
      return entityMap;
    };
    const getModuleMap = async () => {
      if (!moduleMap) moduleMap = await resolveModuleByName(systemToken);
      return moduleMap;
    };

    let result: any;
    let resolvedInfo: Record<string, any> = {};

    switch (actionType) {
      case "sql_write": {
        const { query, queryParts } = params;
        let finalQuery = "";
        if (queryParts && Array.isArray(queryParts)) {
          finalQuery = queryParts.join(" ");
        } else if (query && typeof query === "string") {
          finalQuery = query;
        }
        if (!finalQuery) {
          throw new Error("query or queryParts is required");
        }
        const lower = finalQuery.trim().toLowerCase();
        const firstWord = lower.split(/\s+/)[0];
        if (!["insert", "update", "delete", "alter", "create"].includes(firstWord)) {
          throw new Error(`פעולת SQL לא מותרת: ${firstWord}. רק INSERT/UPDATE/DELETE/ALTER/CREATE`);
        }
        if (["drop table", "drop database", "truncate", "drop schema"].some(d => lower.includes(d))) {
          throw new Error("פעולה מסוכנת חסומה");
        }
        const dbResult = await db.execute(sql.raw(finalQuery));
        result = { executed: true, rowCount: (dbResult as any).rowCount ?? (dbResult as any).rows?.length ?? 0, rows: (dbResult as any).rows || [] };
        break;
      }
      case "create_record": {
        let { entityId, entityName, data: recordData } = params;
        if (!entityId && entityName) {
          entityId = await autoResolveId(entityName, await getEntityMap());
          resolvedInfo.resolvedEntityId = entityId;
        }
        if (!entityId || !recordData) throw new Error("entityId/entityName and data are required");
        try {
          result = await internalFetch("POST", `/platform/entities/${entityId}/records`, { data: recordData });
        } catch (createErr: any) {
          let schemaHint = "";
          try {
            const fields = await internalFetch("GET", `/platform/entities/${entityId}/fields`);
            if (Array.isArray(fields) && fields.length > 0) {
              const required = fields.filter((f: any) => f.isRequired).map((f: any) => f.slug);
              const optional = fields.filter((f: any) => !f.isRequired).map((f: any) => f.slug);
              schemaHint = `\n\nשדות זמינים בישות:\n- חובה: ${required.length ? required.join(", ") : "אין"}\n- אופציונלי: ${optional.slice(0, 20).join(", ")}`;
            }
          } catch {}
          throw new Error(`${createErr.message}${schemaHint}`);
        }
        break;
      }
      case "update_record": {
        let { entityId, entityName, recordId, data: updateData, status: updateStatus } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!recordId) throw new Error("recordId is required");
        if (!updateData && !updateStatus) throw new Error("data or status is required");
        const updateBody: any = {};
        if (updateData) updateBody.data = updateData;
        if (updateStatus) updateBody.status = updateStatus;
        try {
          result = await internalFetch("PUT", `/platform/records/${recordId}`, updateBody);
        } catch (updateErr: any) {
          if (updateErr.message?.includes("404") || updateErr.message?.toLowerCase().includes("not found")) {
            let candidateInfo = "";
            if (entityId) {
              try {
                const candidates = await internalFetch("GET", `/platform/entities/${entityId}/records?limit=5`);
                const recs = Array.isArray(candidates) ? candidates : (candidates.records || candidates.data || []);
                if (recs.length > 0) {
                  const ids = recs.map((r: any) => r.id).filter(Boolean).join(", ");
                  candidateInfo = ` רשומות קיימות (5 אחרונות): [${ids}]`;
                }
              } catch {}
            }
            const searchHint = entityId ? ` השתמש ב-search_records עם entityId=${entityId} כדי למצוא את ה-ID המספרי הנכון.` : " השתמש ב-search_records כדי למצוא את ה-ID המספרי הנכון.";
            throw new Error(`רשומה #${recordId} לא נמצאה.${searchHint}${candidateInfo}`);
          }
          throw updateErr;
        }
        break;
      }
      case "delete_record": {
        let { entityId, entityName, recordId } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!recordId) throw new Error("recordId is required");
        try {
          await internalFetch("DELETE", `/platform/records/${recordId}`);
          result = { deleted: true, recordId, message: `רשומה ${recordId} נמחקה בהצלחה` };
        } catch (delErr: any) {
          if (delErr.message?.includes("404") || delErr.message?.toLowerCase().includes("not found")) {
            let candidateInfo = "";
            if (entityId) {
              try {
                const candidates = await internalFetch("GET", `/platform/entities/${entityId}/records?limit=5`);
                const recs = Array.isArray(candidates) ? candidates : (candidates.records || candidates.data || []);
                if (recs.length > 0) {
                  const ids = recs.map((r: any) => r.id).filter(Boolean).join(", ");
                  candidateInfo = ` רשומות קיימות (5 אחרונות): [${ids}]`;
                }
              } catch {}
            }
            const searchHint = entityId ? ` השתמש ב-search_records עם entityId=${entityId} כדי למצוא את ה-ID המספרי הנכון.` : " השתמש ב-search_records כדי למצוא את ה-ID המספרי הנכון.";
            throw new Error(`רשומה #${recordId} לא נמצאה.${searchHint}${candidateInfo}`);
          }
          throw delErr;
        }
        break;
      }
      case "create_entity": {
        let { moduleId, moduleName, entityData } = params;
        if (!moduleId && moduleName) {
          moduleId = await autoResolveId(moduleName, await getModuleMap());
          resolvedInfo.resolvedModuleId = moduleId;
        }
        if (!moduleId || !entityData) throw new Error("moduleId/moduleName and entityData are required");
        if (entityData.name && !entityData.slug) entityData.slug = toSlugLocal(entityData.name);
        if (entityData.name && !entityData.namePlural) entityData.namePlural = entityData.name + "s";
        result = await internalFetch("POST", `/platform/modules/${moduleId}/entities`, entityData);
        break;
      }
      case "update_entity": {
        let { entityId, entityName, entityData } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId || !entityData) throw new Error("entityId/entityName and entityData are required");
        result = await internalFetch("PUT", `/platform/entities/${entityId}`, entityData);
        resolvedInfo.resolvedEntityId = entityId;
        break;
      }
      case "create_field": {
        let { entityId, entityName, fieldData } = params;
        if (!entityId && entityName) {
          entityId = await autoResolveId(entityName, await getEntityMap());
          resolvedInfo.resolvedEntityId = entityId;
        }
        if (!entityId || !fieldData) throw new Error("entityId/entityName and fieldData are required");
        if (fieldData.name && !fieldData.slug) fieldData.slug = toSlugLocal(fieldData.name);
        result = await internalFetch("POST", `/platform/entities/${entityId}/fields`, fieldData);
        break;
      }
      case "update_field": {
        let { entityId, entityName, fieldId, fieldData } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId || !fieldId || !fieldData) throw new Error("entityId, fieldId, and fieldData are required");
        result = await internalFetch("PUT", `/platform/entities/${entityId}/fields/${fieldId}`, fieldData);
        break;
      }
      case "api_call": {
        const { method = "GET", path: apiPath, body } = params;
        if (!apiPath) throw new Error("path is required");
        result = await internalFetch(method, apiPath, body);
        break;
      }
      case "create_module": {
        const { moduleData } = params;
        if (!moduleData) throw new Error("moduleData is required");
        if (moduleData.name && !moduleData.slug) moduleData.slug = toSlugLocal(moduleData.name);
        result = await internalFetch("POST", "/platform/modules", moduleData);
        break;
      }
      case "list_entities": {
        const raw = await internalFetch("GET", "/platform/entities");
        const arr = Array.isArray(raw) ? raw : [];
        result = arr.map((e: any) => ({ id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, entityType: e.entityType }));
        break;
      }
      case "list_entity_fields": {
        let { entityId, entityName } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId) throw new Error("entityId or entityName is required");
        result = await internalFetch("GET", `/platform/entities/${entityId}/fields`);
        break;
      }
      case "list_modules": {
        result = await internalFetch("GET", "/platform/modules");
        break;
      }
      case "search_records": {
        let { entityId, entityName, search, limit: lim = 20, filterField, filterValue, filters, status: filterStatus, sortBy, sortDir } = params;
        if (!entityId && entityName) {
          try {
            entityId = await autoResolveId(entityName, await getEntityMap());
          } catch {
            const safeName = String(entityName).replace(/[^a-zA-Z0-9_]/g, "");
            if (safeName) {
              try {
                let q = `SELECT * FROM "${safeName}"`;
                if (search) {
                  const safeSrch = search.replace(/'/g, "''");
                  q += ` WHERE CAST(row_to_json("${safeName}".*) AS text) ILIKE '%${safeSrch}%'`;
                }
                q += ` LIMIT ${Number(lim) || 20}`;
                const directResult = await db.execute(sql.raw(q));
                result = { table: safeName, records: directResult.rows || [], count: (directResult.rows || []).length };
                break;
              } catch (dbErr: any) {
                throw new Error(`לא נמצאה ישות "${entityName}" ולא טבלה "${safeName}". השתמש ב-list_tables או sql_read.`);
              }
            }
          }
        }
        if (!entityId) throw new Error("entityId or entityName is required");
        const qParts: string[] = [`limit=${lim}`];
        if (search) qParts.push(`search=${encodeURIComponent(search)}`);
        if (filterField) qParts.push(`filterField=${encodeURIComponent(filterField)}`);
        if (filterValue !== undefined && filterValue !== null) qParts.push(`filterValue=${encodeURIComponent(String(filterValue))}`);
        if (filters) qParts.push(`filters=${encodeURIComponent(typeof filters === "string" ? filters : JSON.stringify(filters))}`);
        if (filterStatus) qParts.push(`status=${encodeURIComponent(filterStatus)}`);
        if (sortBy) qParts.push(`sortBy=${encodeURIComponent(sortBy)}`);
        if (sortDir) qParts.push(`sortDir=${encodeURIComponent(sortDir)}`);
        result = await internalFetch("GET", `/platform/entities/${entityId}/records?${qParts.join("&")}`);
        break;
      }
      case "bulk_create_records": {
        let { entityId, entityName, records } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId || !Array.isArray(records)) throw new Error("entityId and records array required");
        const results: any[] = [];
        for (const rec of records) {
          try {
            const r = await internalFetch("POST", `/platform/entities/${entityId}/records`, { data: rec });
            results.push({ success: true, id: r.id });
          } catch (e: any) { results.push({ success: false, error: e.message }); }
        }
        result = { created: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, details: results };
        break;
      }
      case "describe_table": {
        const { tableName } = params;
        if (!tableName) throw new Error("tableName is required");
        const safe = tableName.replace(/[^a-zA-Z0-9_]/g, "");
        const [colsResult, countResult, sampleResult] = await Promise.all([
          db.execute(sql.raw(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${safe}' ORDER BY ordinal_position`)),
          db.execute(sql.raw(`SELECT count(*) as total FROM "${safe}"`)).catch(() => ({ rows: [{ total: 0 }] })),
          db.execute(sql.raw(`SELECT * FROM "${safe}" LIMIT 3`)).catch(() => ({ rows: [] })),
        ]);
        result = {
          table: safe,
          columns: (colsResult.rows || []).map((c: any) => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === "YES", default: c.column_default })),
          totalRows: (countResult.rows as any[])[0]?.total || 0,
          sampleRows: (sampleResult.rows || []).slice(0, 3),
        };
        break;
      }
      case "count_records": {
        let { entityId, entityName } = params;
        if (!entityId && entityName) {
          try {
            entityId = await autoResolveId(entityName, await getEntityMap());
          } catch {
            const safeName = String(entityName).replace(/[^a-zA-Z0-9_]/g, "");
            if (safeName) {
              try {
                const directCount = await db.execute(sql.raw(`SELECT count(*) as total FROM "${safeName}"`));
                result = { table: safeName, count: Number((directCount.rows as any[])[0]?.total || 0) };
                break;
              } catch (dbErr: any) {
                throw new Error(`לא נמצאה ישות "${entityName}" במערכת הישויות, וגם לא נמצאה טבלה "${safeName}" ב-DB. השתמש ב-sql_read או list_tables לחפש.`);
              }
            }
          }
        }
        if (!entityId) throw new Error("entityId or entityName required");
        const raw = await internalFetch("GET", `/platform/entities/${entityId}/records?limit=1`);
        const arr = Array.isArray(raw) ? raw : (raw.data || raw.records || raw.items || []);
        result = { entityId, count: raw.total || raw.count || arr.length };
        break;
      }
      case "get_record": {
        let { entityId, entityName, recordId } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!recordId) throw new Error("recordId required");
        result = await internalFetch("GET", `/platform/records/${recordId}`);
        break;
      }
      case "clone_record": {
        let { entityId, entityName, recordId } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!recordId) throw new Error("recordId required");
        const original = await internalFetch("GET", `/platform/records/${recordId}`);
        const cloneData = { ...(original.data || original) };
        delete cloneData.id; delete cloneData.created_at; delete cloneData.updated_at;
        const cloneEntityId = entityId || original.entityId;
        if (!cloneEntityId) throw new Error("entityId required for cloning");
        result = await internalFetch("POST", `/platform/entities/${cloneEntityId}/records`, { data: cloneData });
        result._clonedFrom = recordId;
        break;
      }
      case "sql_read": {
        const { query: readQuery } = params;
        if (!readQuery) throw new Error("query is required");
        const lowerQ = readQuery.trim().toLowerCase();
        if (!lowerQ.startsWith("select") && !lowerQ.startsWith("with") && !lowerQ.startsWith("explain")) {
          throw new Error("sql_read allows only SELECT/WITH/EXPLAIN queries");
        }
        const readResult = await db.execute(sql.raw(readQuery));
        result = { rows: (readResult.rows || []).slice(0, 100), rowCount: (readResult.rows || []).length };
        break;
      }
      case "bulk_update_records": {
        let { entityId, entityName, updates } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!Array.isArray(updates)) throw new Error("updates[] required (each: {recordId, data})");
        const bulkResults: any[] = [];
        for (const u of updates) {
          try {
            const updatePayload: any = {};
            if (u.data) updatePayload.data = u.data;
            if (u.status) updatePayload.status = u.status;
            const r = await internalFetch("PUT", `/platform/records/${u.recordId}`, updatePayload);
            bulkResults.push({ success: true, recordId: u.recordId });
          } catch (e: any) { bulkResults.push({ success: false, recordId: u.recordId, error: e.message }); }
        }
        result = { updated: bulkResults.filter(r => r.success).length, failed: bulkResults.filter(r => !r.success).length, details: bulkResults };
        break;
      }
      case "bulk_delete_records": {
        let { entityId, entityName, recordIds } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!Array.isArray(recordIds)) throw new Error("recordIds[] required");
        const delResults: any[] = [];
        for (const rid of recordIds) {
          try {
            await internalFetch("DELETE", `/platform/records/${rid}`);
            delResults.push({ success: true, recordId: rid });
          } catch (e: any) { delResults.push({ success: false, recordId: rid, error: e.message }); }
        }
        result = { deleted: delResults.filter(r => r.success).length, failed: delResults.filter(r => !r.success).length, details: delResults };
        break;
      }
      case "list_tables": {
        const tablesRes = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
        result = (tablesRes.rows || []).map((r: any) => r.tablename);
        break;
      }
      case "table_stats": {
        const statsRes = await db.execute(sql`SELECT relname as table_name, n_live_tup as row_count, pg_size_pretty(pg_total_relation_size(relid)) as size FROM pg_stat_user_tables ORDER BY n_live_tup DESC`);
        result = (statsRes.rows || []);
        break;
      }
      case "db_size": {
        const sizeRes = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size, current_database() as db_name`);
        const tableCountRes = await db.execute(sql`SELECT count(*) as cnt FROM pg_stat_user_tables`);
        const rowCountRes = await db.execute(sql`SELECT coalesce(sum(n_live_tup),0) as total FROM pg_stat_user_tables`);
        result = { ...((sizeRes.rows as any[])[0] || {}), tableCount: Number((tableCountRes.rows as any[])[0]?.cnt || 0), totalRows: Number((rowCountRes.rows as any[])[0]?.total || 0) };
        break;
      }
      case "find_entity": {
        const { search: searchTerm } = params;
        if (!searchTerm) throw new Error("search term required");
        const allEntities = await internalFetch("GET", "/platform/entities");
        const arr = Array.isArray(allEntities) ? allEntities : [];
        const lower = searchTerm.toLowerCase();
        result = arr.filter((e: any) => (e.name || "").toLowerCase().includes(lower) || (e.nameHe || "").toLowerCase().includes(lower) || (e.slug || "").toLowerCase().includes(lower))
          .map((e: any) => ({ id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, entityType: e.entityType }));
        break;
      }
      case "entity_summary": {
        let { entityId, entityName } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId) throw new Error("entityId or entityName required");
        const [entityInfo, fieldsInfo, recordsInfo] = await Promise.all([
          internalFetch("GET", `/platform/entities`).then((all: any) => (Array.isArray(all) ? all : []).find((e: any) => e.id === entityId)),
          internalFetch("GET", `/platform/entities/${entityId}/fields`),
          internalFetch("GET", `/platform/entities/${entityId}/records?limit=5`),
        ]);
        const fields = Array.isArray(fieldsInfo) ? fieldsInfo : [];
        const records = Array.isArray(recordsInfo) ? recordsInfo : (recordsInfo.data || recordsInfo.records || []);
        result = {
          entity: { id: entityId, name: entityInfo?.name, nameHe: entityInfo?.nameHe, slug: entityInfo?.slug, type: entityInfo?.entityType },
          fieldCount: fields.length,
          fields: fields.slice(0, 20).map((f: any) => ({ id: f.id, name: f.name, slug: f.slug, type: f.fieldType, required: f.isRequired })),
          sampleRecords: records.slice(0, 3),
          totalRecords: recordsInfo?.total || records.length,
        };
        break;
      }
      case "export_data": {
        let { entityId, entityName, format = "json", limit: expLimit = 500 } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId) throw new Error("entityId or entityName required");
        const raw = await internalFetch("GET", `/platform/entities/${entityId}/records?limit=${Math.min(expLimit, 5000)}`);
        const records = Array.isArray(raw) ? raw : (raw.data || raw.records || raw.items || []);
        const flatRecords = records.map((r: any) => {
          const d = r.data || r;
          return { id: r.id, status: r.status, ...d, createdAt: r.createdAt, updatedAt: r.updatedAt };
        });
        if (format === "csv" && flatRecords.length > 0) {
          const allKeys = new Set<string>();
          flatRecords.forEach((r: any) => Object.keys(r).forEach(k => allKeys.add(k)));
          const headers2 = Array.from(allKeys);
          const BOM = "\uFEFF";
          const csvRows = [headers2.join(","), ...flatRecords.map((r: any) => headers2.map(h => {
            const v = r[h];
            if (v === null || v === undefined) return '""';
            const s = typeof v === "object" ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          }).join(","))];
          result = { format: "csv", rowCount: flatRecords.length, csv: BOM + csvRows.join("\n"), encoding: "utf-8-bom" };
        } else {
          result = { format: "json", rowCount: flatRecords.length, data: flatRecords };
        }
        break;
      }
      case "validate_entity": {
        let { entityId, entityName } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId) throw new Error("entityId or entityName required");
        const [fields2, records2] = await Promise.all([
          internalFetch("GET", `/platform/entities/${entityId}/fields`),
          internalFetch("GET", `/platform/entities/${entityId}/records?limit=50`),
        ]);
        const fieldArr = Array.isArray(fields2) ? fields2 : [];
        const recArr = Array.isArray(records2) ? records2 : (records2.data || []);
        const issues: string[] = [];
        if (fieldArr.length === 0) issues.push("אין שדות מוגדרים");
        if (recArr.length === 0) issues.push("אין רשומות");
        const requiredFields = fieldArr.filter((f: any) => f.isRequired);
        const fieldTypeMap: Record<string, string> = {};
        for (const f of fieldArr) fieldTypeMap[f.slug] = f.fieldType;
        let emptyCount = 0;
        for (const rec of recArr) {
          const d = rec.data || rec;
          for (const rf of requiredFields) {
            const val = d[rf.slug];
            if (val === null || val === undefined || val === "") {
              emptyCount++;
              if (issues.length < 20) issues.push(`רשומה ${rec.id}: שדה חובה "${rf.name}" ריק`);
            }
          }
        }
        const warnings: string[] = [];
        const fieldTypes = fieldArr.map((f: any) => f.fieldType);
        if (!fieldTypes.includes("date") && !fieldTypes.includes("datetime")) warnings.push("אין שדה תאריך — מומלץ להוסיף");
        if (fieldArr.length < 3) warnings.push("פחות מ-3 שדות — ישות לא שלמה");
        if (recArr.length > 0 && emptyCount > recArr.length * requiredFields.length * 0.3) warnings.push("יותר מ-30% שדות חובה ריקים");
        result = { entityId, valid: issues.length === 0, issueCount: issues.length, issues: issues.slice(0, 30), warnings, fieldCount: fieldArr.length, recordCount: recArr.length, requiredFieldCount: requiredFields.length, fieldTypes: [...new Set(fieldTypes)] };
        break;
      }
      case "compare_entities": {
        const { entity1, entity2 } = params;
        if (!entity1 || !entity2) throw new Error("entity1 and entity2 required (names or IDs)");
        const eMap = await getEntityMap();
        const id1 = await autoResolveId(entity1, eMap);
        const id2 = await autoResolveId(entity2, eMap);
        const [f1, f2] = await Promise.all([
          internalFetch("GET", `/platform/entities/${id1}/fields`),
          internalFetch("GET", `/platform/entities/${id2}/fields`),
        ]);
        const fields1 = (Array.isArray(f1) ? f1 : []).map((f: any) => f.slug);
        const fields2b = (Array.isArray(f2) ? f2 : []).map((f: any) => f.slug);
        const common = fields1.filter((s: string) => fields2b.includes(s));
        const only1 = fields1.filter((s: string) => !fields2b.includes(s));
        const only2 = fields2b.filter((s: string) => !fields1.includes(s));
        result = { entity1: { id: id1, fieldCount: fields1.length }, entity2: { id: id2, fieldCount: fields2b.length }, commonFields: common, onlyInEntity1: only1, onlyInEntity2: only2 };
        break;
      }
      case "db_indexes": {
        const { tableName: idxTable } = params;
        const q = idxTable
          ? sql.raw(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${idxTable.replace(/[^a-zA-Z0-9_]/g, "")}' ORDER BY indexname`)
          : sql.raw(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname LIMIT 100`);
        const idxRes = await db.execute(q);
        result = idxRes.rows || [];
        break;
      }
      case "system_stats": {
        const mem = process.memoryUsage();
        const [connRes, sizeRes2] = await Promise.all([
          db.execute(sql`SELECT count(*) as active FROM pg_stat_activity WHERE state = 'active'`),
          db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
        ]);
        result = {
          uptime: Math.round(process.uptime()),
          uptimeHuman: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
          memory: { heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024), heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024), rssMB: Math.round(mem.rss / 1024 / 1024) },
          db: { activeConnections: Number((connRes.rows as any[])[0]?.active || 0), size: (sizeRes2.rows as any[])[0]?.size },
          nodeVersion: process.version,
          platform: process.platform,
          actionsExecuted: actionHistory.length,
        };
        break;
      }
      case "global_search": {
        const { query: searchQuery, limit: searchLimit = 5 } = params;
        if (!searchQuery) throw new Error("query is required");
        const allEntities = await internalFetch("GET", "/platform/entities");
        const entityArr = Array.isArray(allEntities) ? allEntities : [];
        const searchResults: any[] = [];
        for (const ent of entityArr.slice(0, 20)) {
          try {
            const records = await internalFetch("GET", `/platform/entities/${ent.id}/records?search=${encodeURIComponent(searchQuery)}&limit=${searchLimit}`);
            const recs = Array.isArray(records) ? records : (records.data || records.records || []);
            if (recs.length > 0) {
              searchResults.push({ entityId: ent.id, entityName: ent.nameHe || ent.name, slug: ent.slug, matchCount: recs.length, records: recs.slice(0, 3) });
            }
          } catch {}
        }
        result = { query: searchQuery, totalMatches: searchResults.reduce((s, r) => s + r.matchCount, 0), entitiesSearched: Math.min(entityArr.length, 20), matches: searchResults };
        break;
      }
      case "duplicate_entity": {
        let { sourceEntityId, sourceEntityName, newName, newNameHe, targetModuleId, targetModuleName } = params;
        if (!sourceEntityId && sourceEntityName) sourceEntityId = await autoResolveId(sourceEntityName, await getEntityMap());
        if (!targetModuleId && targetModuleName) targetModuleId = await autoResolveId(targetModuleName, await getModuleMap());
        if (!sourceEntityId || !newName) throw new Error("sourceEntityName and newName required");
        const sourceFields = await internalFetch("GET", `/platform/entities/${sourceEntityId}/fields`);
        const sourceEntity = (await internalFetch("GET", "/platform/entities")).find((e: any) => e.id === sourceEntityId);
        if (!targetModuleId && sourceEntity?.moduleId) targetModuleId = sourceEntity.moduleId;
        if (!targetModuleId) throw new Error("targetModuleId or targetModuleName required");
        const newEntity = await internalFetch("POST", `/platform/modules/${targetModuleId}/entities`, {
          name: newName, nameHe: newNameHe || newName, slug: newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
          entityType: sourceEntity?.entityType || "data",
        });
        const fieldArr = Array.isArray(sourceFields) ? sourceFields : [];
        let copiedFields = 0;
        for (const f of fieldArr) {
          try {
            await internalFetch("POST", `/platform/entities/${newEntity.id}/fields`, {
              name: f.name, slug: f.slug, fieldType: f.fieldType, isRequired: f.isRequired, description: f.description, options: f.options,
            });
            copiedFields++;
          } catch {}
        }
        result = { newEntityId: newEntity.id, newName, copiedFields, originalFields: fieldArr.length };
        break;
      }
      case "entity_relations": {
        let { entityId, entityName } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId) throw new Error("entityId or entityName required");
        const fields3 = await internalFetch("GET", `/platform/entities/${entityId}/fields`);
        const fieldArr2 = Array.isArray(fields3) ? fields3 : [];
        const relations = fieldArr2.filter((f: any) => f.fieldType === "relation").map((f: any) => ({
          fieldName: f.name, fieldSlug: f.slug, relatedEntityId: f.options?.relatedEntityId, relationType: f.options?.relationType || "many_to_one",
        }));
        const allEntities2 = await internalFetch("GET", "/platform/entities");
        const reverseRelations: any[] = [];
        for (const ent of (Array.isArray(allEntities2) ? allEntities2 : [])) {
          if (ent.id === entityId) continue;
          try {
            const eFields = await internalFetch("GET", `/platform/entities/${ent.id}/fields`);
            const eFieldArr = Array.isArray(eFields) ? eFields : [];
            for (const f of eFieldArr) {
              if (f.fieldType === "relation" && f.options?.relatedEntityId === entityId) {
                reverseRelations.push({ fromEntity: ent.nameHe || ent.name, fromEntityId: ent.id, fieldName: f.name });
              }
            }
          } catch {}
        }
        result = { entityId, outgoing: relations, incoming: reverseRelations, totalRelations: relations.length + reverseRelations.length };
        break;
      }
      case "schema_export": {
        const allE = await internalFetch("GET", "/platform/entities");
        const allM = await internalFetch("GET", "/platform/modules");
        const entities3 = Array.isArray(allE) ? allE : [];
        const modules3 = Array.isArray(allM) ? allM : (allM.modules || []);
        const schema: any = { exportedAt: new Date().toISOString(), modules: [], entities: [] };
        schema.modules = modules3.map((m: any) => ({ id: m.id, name: m.name, slug: m.slug, icon: m.icon, color: m.color }));
        for (const e of entities3.slice(0, 30)) {
          try {
            const fields4 = await internalFetch("GET", `/platform/entities/${e.id}/fields`);
            schema.entities.push({
              id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, entityType: e.entityType, moduleId: e.moduleId,
              fields: (Array.isArray(fields4) ? fields4 : []).map((f: any) => ({ name: f.name, slug: f.slug, fieldType: f.fieldType, isRequired: f.isRequired })),
            });
          } catch {}
        }
        result = { moduleCount: schema.modules.length, entityCount: schema.entities.length, schema };
        break;
      }
      case "transfer_records": {
        let { sourceEntityId, sourceEntityName, targetEntityId, targetEntityName, recordIds, fieldMapping } = params;
        if (!sourceEntityId && sourceEntityName) sourceEntityId = await autoResolveId(sourceEntityName, await getEntityMap());
        if (!targetEntityId && targetEntityName) targetEntityId = await autoResolveId(targetEntityName, await getEntityMap());
        if (!sourceEntityId || !targetEntityId || !Array.isArray(recordIds)) throw new Error("sourceEntityName, targetEntityName, recordIds[] required");
        const transferred: any[] = [];
        for (const rid of recordIds) {
          try {
            const rec = await internalFetch("GET", `/platform/records/${rid}`);
            if (rec.entityId && rec.entityId !== sourceEntityId) {
              transferred.push({ sourceId: rid, success: false, error: `Record belongs to entity ${rec.entityId}, not ${sourceEntityId}` });
              continue;
            }
            let mapped = { ...(rec.data || rec) };
            delete mapped.id; delete mapped.created_at; delete mapped.updated_at;
            if (fieldMapping) {
              const newMapped: any = {};
              for (const [from, to] of Object.entries(fieldMapping)) { newMapped[to as string] = mapped[from]; }
              mapped = newMapped;
            }
            const created = await internalFetch("POST", `/platform/entities/${targetEntityId}/records`, { data: mapped });
            transferred.push({ sourceId: rid, newId: created.id, success: true });
          } catch (e: any) { transferred.push({ sourceId: rid, success: false, error: e.message }); }
        }
        result = { transferred: transferred.filter(t => t.success).length, failed: transferred.filter(t => !t.success).length, details: transferred };
        break;
      }
      case "field_stats": {
        let { entityId, entityName, fieldSlug } = params;
        if (!entityId && entityName) entityId = await autoResolveId(entityName, await getEntityMap());
        if (!entityId || !fieldSlug) throw new Error("entityName and fieldSlug required");
        const records4 = await internalFetch("GET", `/platform/entities/${entityId}/records?limit=200`);
        const recs = Array.isArray(records4) ? records4 : (records4.data || records4.records || []);
        const values = recs.map((r: any) => (r.data || r)[fieldSlug]).filter((v: any) => v !== null && v !== undefined && v !== "");
        const uniqueValues = [...new Set(values.map(String))];
        const numericValues = values.filter((v: any) => !isNaN(Number(v))).map(Number);
        const stats: any = { total: recs.length, filled: values.length, empty: recs.length - values.length, fillRate: `${Math.round((values.length / Math.max(recs.length, 1)) * 100)}%`, uniqueCount: uniqueValues.length };
        if (numericValues.length > 0) {
          stats.min = Math.min(...numericValues);
          stats.max = Math.max(...numericValues);
          stats.avg = Math.round(numericValues.reduce((s, v) => s + v, 0) / numericValues.length * 100) / 100;
          stats.sum = numericValues.reduce((s, v) => s + v, 0);
        }
        if (uniqueValues.length <= 20) {
          const freq: Record<string, number> = {};
          values.forEach((v: any) => { freq[String(v)] = (freq[String(v)] || 0) + 1; });
          stats.distribution = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([val, count]) => ({ value: val, count }));
        }
        result = stats;
        break;
      }
      case "audit_log": {
        const { tableName: auditTable, limit: auditLimit = 20 } = params;
        const auditQ = auditTable
          ? sql.raw(`SELECT id, operation, table_name, record_id, changed_by, changes, created_at FROM audit_log WHERE table_name = '${auditTable.replace(/[^a-zA-Z0-9_]/g, "")}' ORDER BY created_at DESC LIMIT ${Math.min(Number(auditLimit), 50)}`)
          : sql.raw(`SELECT id, operation, table_name, record_id, changed_by, changes, created_at FROM audit_log ORDER BY created_at DESC LIMIT ${Math.min(Number(auditLimit), 50)}`);
        try {
          const auditRes = await db.execute(auditQ);
          result = { entries: auditRes.rows || [], count: (auditRes.rows || []).length };
        } catch (e: any) {
          result = { entries: [], count: 0, note: "audit_log table may not exist" };
        }
        break;
      }
      case "performance_check": {
        const perfStart = Date.now();
        const [connTest, readTest, writeTest] = await Promise.all([
          (async () => { const s = Date.now(); await db.execute(sql`SELECT 1`); return Date.now() - s; })(),
          (async () => { const s = Date.now(); await db.execute(sql`SELECT count(*) FROM pg_stat_user_tables`); return Date.now() - s; })(),
          (async () => { const s = Date.now(); await db.execute(sql`SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 5`); return Date.now() - s; })(),
        ]);
        const token2 = req.headers.authorization;
        const apiStart = Date.now();
        await fetch(`http://localhost:${process.env.PORT || 8080}/api/platform/entities`, {
          headers: { ...(token2 ? { Authorization: token2 } : {}) }, signal: AbortSignal.timeout(5000),
        });
        const apiLatency = Date.now() - apiStart;
        const score = connTest < 10 && readTest < 20 && apiLatency < 100 ? "excellent" : connTest < 50 && readTest < 100 ? "good" : "needs_attention";
        result = {
          score,
          db: { connectionMs: connTest, readMs: readTest, complexQueryMs: writeTest },
          api: { latencyMs: apiLatency },
          totalMs: Date.now() - perfStart,
          recommendations: score === "excellent" ? ["ביצועים מצוינים!"] : score === "good" ? ["ביצועים טובים, שקול אינדקסים"] : ["ביצועים דורשים תשומת לב — בדוק אינדקסים וshared_buffers"],
        };
        break;
      }
      case "data_quality_report": {
        const allE2 = await internalFetch("GET", "/platform/entities");
        const entities4 = (Array.isArray(allE2) ? allE2 : []).slice(0, 15);
        const report: any[] = [];
        for (const ent of entities4) {
          try {
            const [fields5, recs5] = await Promise.all([
              internalFetch("GET", `/platform/entities/${ent.id}/fields`),
              internalFetch("GET", `/platform/entities/${ent.id}/records?limit=50`),
            ]);
            const fieldArr5 = Array.isArray(fields5) ? fields5 : [];
            const recArr5 = Array.isArray(recs5) ? recs5 : (recs5.data || []);
            const requiredFields5 = fieldArr5.filter((f: any) => f.isRequired);
            let missingRequired = 0;
            for (const rec of recArr5) {
              const d5 = rec.data || rec;
              for (const rf of requiredFields5) {
                const v5 = d5[rf.slug];
                if (v5 === null || v5 === undefined || v5 === "") missingRequired++;
              }
            }
            report.push({
              entityId: ent.id, name: ent.nameHe || ent.name,
              recordCount: recArr5.length, fieldCount: fieldArr5.length,
              missingRequired,
              qualityScore: recArr5.length === 0 ? 0 : Math.round((1 - missingRequired / Math.max(recArr5.length * requiredFields5.length, 1)) * 100),
            });
          } catch {}
        }
        const avgScore = report.length > 0 ? Math.round(report.reduce((s, r) => s + r.qualityScore, 0) / report.length) : 0;
        result = { overallScore: avgScore, entitiesChecked: report.length, details: report.sort((a, b) => a.qualityScore - b.qualityScore) };
        break;
      }
      case "smart_suggest": {
        const { context: suggestContext } = params;
        const allE3 = await internalFetch("GET", "/platform/entities");
        const entities5 = (Array.isArray(allE3) ? allE3 : []).slice(0, 20);
        const emptyEntities = [];
        const populatedEntities = [];
        for (const ent of entities5) {
          try {
            const recs = await internalFetch("GET", `/platform/entities/${ent.id}/records?limit=1`);
            const recArr = Array.isArray(recs) ? recs : (recs.data || []);
            if (recArr.length === 0) emptyEntities.push(ent.nameHe || ent.name);
            else populatedEntities.push(ent.nameHe || ent.name);
          } catch {}
        }
        const suggestions2: string[] = [];
        if (emptyEntities.length > 0) suggestions2.push(`הוסף נתונים ל: ${emptyEntities.slice(0, 3).join(", ")}`);
        suggestions2.push("בדוק איכות נתונים (data_quality_report)");
        suggestions2.push("ייצא סכמה מלאה (schema_export)");
        suggestions2.push("בדוק ביצועים (performance_check)");
        if (populatedEntities.length > 0) suggestions2.push(`ייצא נתונים מ: ${populatedEntities[0]} (export_data)`);
        result = { suggestions: suggestions2, emptyEntities: emptyEntities.length, populatedEntities: populatedEntities.length };
        break;
      }
      case "list_menu_items": {
        const allItems = await internalFetch("GET", "/platform/menu-items");
        const items = Array.isArray(allItems) ? allItems : [];
        result = items.map((m: any) => ({ id: m.id, label: m.label, labelHe: m.labelHe, section: m.section, path: m.path, icon: m.icon, parentId: m.parentId, isActive: m.isActive }));
        break;
      }
      case "delete_menu_item": {
        const { id, label, labelHe } = params;
        if (id) {
          await internalFetch("DELETE", `/platform/menu-items/${id}`);
          result = { deleted: true, id, message: `פריט תפריט ${id} נמחק בהצלחה` };
        } else if (label || labelHe) {
          const searchTerm = (label || labelHe || "").toLowerCase();
          const allMenuItems = await internalFetch("GET", "/platform/menu-items");
          const arr = Array.isArray(allMenuItems) ? allMenuItems : [];
          const matches = arr.filter((m: any) =>
            (m.label && m.label.toLowerCase().includes(searchTerm)) ||
            (m.labelHe && m.labelHe.toLowerCase().includes(searchTerm)) ||
            (m.labelEn && m.labelEn.toLowerCase().includes(searchTerm)) ||
            (m.section && m.section.toLowerCase().includes(searchTerm))
          );
          if (matches.length === 0) throw new Error(`לא נמצא פריט תפריט עם השם "${label || labelHe}"`);
          const deletedIds: number[] = [];
          for (const m of matches) {
            await internalFetch("DELETE", `/platform/menu-items/${m.id}`);
            deletedIds.push(m.id);
          }
          const sectionItems = arr.filter((m: any) => matches.some((match: any) => match.section && m.section === match.section && !matches.find((mm: any) => mm.id === m.id)));
          for (const s of sectionItems) {
            await internalFetch("DELETE", `/platform/menu-items/${s.id}`);
            deletedIds.push(s.id);
          }
          result = { deleted: true, count: deletedIds.length, deletedIds, message: `${deletedIds.length} פריטי תפריט נמחקו בהצלחה (כולל פריטים בסקציה)` };
        } else {
          throw new Error("id או label/labelHe נדרשים");
        }
        break;
      }
      case "create_menu_item": {
        const { menuData } = params;
        if (!menuData) throw new Error("menuData נדרש (label, path, section, icon, sortOrder?)");
        result = await internalFetch("POST", "/platform/menu-items", menuData);
        break;
      }
      case "update_menu_item": {
        const { id: menuId, label: menuLabel, menuData: updateData } = params;
        if (!updateData) throw new Error("menuData נדרש לעדכון");
        if (menuId) {
          result = await internalFetch("PUT", `/platform/menu-items/${menuId}`, updateData);
        } else if (menuLabel) {
          const searchTerm2 = menuLabel.toLowerCase();
          const allMenuItems2 = await internalFetch("GET", "/platform/menu-items");
          const arr2 = Array.isArray(allMenuItems2) ? allMenuItems2 : [];
          const match = arr2.find((m: any) =>
            (m.label && m.label.toLowerCase().includes(searchTerm2)) ||
            (m.labelHe && m.labelHe.toLowerCase().includes(searchTerm2))
          );
          if (!match) throw new Error(`לא נמצא פריט תפריט עם השם "${menuLabel}"`);
          result = await internalFetch("PUT", `/platform/menu-items/${match.id}`, updateData);
        } else {
          throw new Error("id או label נדרשים");
        }
        break;
      }
      case "read_file": {
        const { path: rfPath, offset, limit: rfLimit } = params;
        if (!rfPath) throw new Error("path נדרש");
        const rfFull = path.resolve(WORKSPACE, rfPath);
        if (!rfFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה — חוץ מתיקיית הפרויקט");
        if (!fs.existsSync(rfFull)) throw new Error(`קובץ לא נמצא: ${rfPath}`);
        const stat = fs.statSync(rfFull);
        if (stat.isDirectory()) throw new Error("זה תיקייה, לא קובץ. השתמש ב-list_files");
        if (stat.size > 2 * 1024 * 1024) throw new Error("קובץ גדול מדי (>2MB)");
        const content = fs.readFileSync(rfFull, "utf-8");
        const lines = content.split("\n");
        const start = Math.max(0, (offset || 1) - 1);
        const end = rfLimit ? start + rfLimit : lines.length;
        const slice = lines.slice(start, end);
        result = { path: rfPath, totalLines: lines.length, fromLine: start + 1, toLine: Math.min(end, lines.length), content: slice.join("\n"), size: stat.size };
        break;
      }
      case "write_file": {
        const { path: wfPath, content: wfContent } = params;
        if (!wfPath) throw new Error("path נדרש");
        if (wfContent === undefined) throw new Error("content נדרש");
        const wfFull = path.resolve(WORKSPACE, wfPath);
        if (!wfFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        const dir = path.dirname(wfFull);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const existed = fs.existsSync(wfFull);
        fs.writeFileSync(wfFull, wfContent, "utf-8");
        result = { path: wfPath, created: !existed, updated: existed, size: Buffer.byteLength(wfContent, "utf-8"), lines: wfContent.split("\n").length };
        break;
      }
      case "edit_file": {
        const { path: efPath, search: efSearch, replace: efReplace, replaceAll } = params;
        if (!efPath || efSearch === undefined || efReplace === undefined) throw new Error("path, search, replace נדרשים");
        const efFull = path.resolve(WORKSPACE, efPath);
        if (!efFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        if (!fs.existsSync(efFull)) throw new Error(`קובץ לא נמצא: ${efPath}`);
        const original = fs.readFileSync(efFull, "utf-8");
        if (!original.includes(efSearch)) throw new Error(`הטקסט לחיפוש לא נמצא בקובץ. אורך הקובץ: ${original.length} תווים, ${original.split("\n").length} שורות`);
        let edited: string;
        let count = 0;
        if (replaceAll) {
          edited = original.split(efSearch).join(efReplace);
          count = original.split(efSearch).length - 1;
        } else {
          edited = original.replace(efSearch, efReplace);
          count = 1;
        }
        fs.writeFileSync(efFull, edited, "utf-8");
        result = { path: efPath, replacements: count, originalSize: original.length, newSize: edited.length };
        break;
      }
      case "delete_file": {
        const { path: dfPath } = params;
        if (!dfPath) throw new Error("path נדרש");
        const dfFull = path.resolve(WORKSPACE, dfPath);
        if (!dfFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        if (!fs.existsSync(dfFull)) throw new Error(`קובץ לא נמצא: ${dfPath}`);
        const dfStat = fs.statSync(dfFull);
        if (dfStat.isDirectory()) {
          fs.rmSync(dfFull, { recursive: true });
          result = { path: dfPath, type: "directory", deleted: true };
        } else {
          fs.unlinkSync(dfFull);
          result = { path: dfPath, type: "file", deleted: true, size: dfStat.size };
        }
        break;
      }
      case "list_files": {
        const { path: lfPath = "", recursive: lfRecursive, glob: lfGlob } = params;
        const lfFull = path.resolve(WORKSPACE, lfPath || "");
        if (!lfFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        if (!fs.existsSync(lfFull)) throw new Error(`תיקייה לא נמצאה: ${lfPath}`);
        const entries = fs.readdirSync(lfFull, { withFileTypes: true });
        const items = entries
          .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist" && e.name !== ".git")
          .map(e => ({
            name: e.name,
            path: path.join(lfPath || "", e.name),
            type: e.isDirectory() ? "directory" : "file",
            size: e.isFile() ? fs.statSync(path.join(lfFull, e.name)).size : undefined,
            extension: e.isFile() ? path.extname(e.name).slice(1) : undefined,
          }))
          .sort((a, b) => { if (a.type !== b.type) return a.type === "directory" ? -1 : 1; return a.name.localeCompare(b.name); });
        if (lfGlob) {
          const pattern = new RegExp(lfGlob.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
          result = items.filter(i => pattern.test(i.name));
        } else {
          result = items;
        }
        break;
      }
      case "search_code": {
        const { query: scQuery, path: scPath = "", filePattern, maxResults = 50 } = params;
        if (!scQuery) throw new Error("query נדרש — מה לחפש?");
        const scDir = path.resolve(WORKSPACE, scPath || "");
        if (!scDir.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        try {
          const grepArgs = ["-r", "-n", "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx", "--include=*.json", "--include=*.css", "--include=*.html", "--include=*.sql", "--include=*.md"];
          if (filePattern) {
            grepArgs.length = 2;
            grepArgs.push(`--include=${filePattern}`);
          }
          grepArgs.push("-l", scQuery, scDir);
          const files = childProcess.execFileSync("grep", grepArgs, { timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024 }).trim().split("\n").filter(Boolean);
          const matches: Array<{ file: string; line: number; content: string }> = [];
          for (const file of files.slice(0, 20)) {
            try {
              const lines = childProcess.execFileSync("grep", ["-n", scQuery, file], { timeout: 5000, encoding: "utf-8", maxBuffer: 512 * 1024 }).trim().split("\n");
              for (const l of lines.slice(0, 5)) {
                const colonIdx = l.indexOf(":");
                if (colonIdx > 0) {
                  matches.push({ file: file.replace(WORKSPACE + "/", ""), line: parseInt(l.slice(0, colonIdx)), content: l.slice(colonIdx + 1).trim().slice(0, 200) });
                }
              }
            } catch {}
            if (matches.length >= maxResults) break;
          }
          result = { query: scQuery, totalFiles: files.length, totalMatches: matches.length, matches: matches.slice(0, maxResults) };
        } catch (e: any) {
          result = { query: scQuery, totalFiles: 0, totalMatches: 0, matches: [], note: "לא נמצאו תוצאות" };
        }
        break;
      }
      case "run_command": {
        const { command, timeout: cmdTimeout = 30000, cwd: cmdCwd } = params;
        if (!command) throw new Error("command נדרש");
        const blocked = ["rm -rf /", "shutdown", "reboot", "mkfs", "dd if=", ":(){ :|:& };:", "> /dev/sda"];
        if (blocked.some(b => command.includes(b))) throw new Error("פקודה חסומה מסיבות בטיחות");
        const execCwd = cmdCwd ? path.resolve(WORKSPACE, cmdCwd) : WORKSPACE;
        if (!execCwd.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        try {
          const output = childProcess.execSync(command, {
            cwd: execCwd, timeout: Math.min(cmdTimeout, 60000), maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, PATH: process.env.PATH }, encoding: "utf-8",
          });
          result = { command, output: output.slice(0, 5000), exitCode: 0, truncated: output.length > 5000 };
        } catch (e: any) {
          result = { command, output: ((e.stdout || "") + "\n" + (e.stderr || e.message)).slice(0, 5000), exitCode: e.status || 1 };
        }
        break;
      }
      case "create_directory": {
        const { path: cdPath } = params;
        if (!cdPath) throw new Error("path נדרש");
        const cdFull = path.resolve(WORKSPACE, cdPath);
        if (!cdFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        const existed = fs.existsSync(cdFull);
        fs.mkdirSync(cdFull, { recursive: true });
        result = { path: cdPath, created: !existed, existed };
        break;
      }
      case "file_info": {
        const { path: fiPath } = params;
        if (!fiPath) throw new Error("path נדרש");
        const fiFull = path.resolve(WORKSPACE, fiPath);
        if (!fiFull.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
        if (!fs.existsSync(fiFull)) throw new Error(`לא נמצא: ${fiPath}`);
        const fiStat = fs.statSync(fiFull);
        result = {
          path: fiPath, type: fiStat.isDirectory() ? "directory" : "file",
          size: fiStat.size, sizeHuman: fiStat.size > 1024 * 1024 ? `${(fiStat.size / 1024 / 1024).toFixed(1)}MB` : fiStat.size > 1024 ? `${(fiStat.size / 1024).toFixed(1)}KB` : `${fiStat.size}B`,
          modified: fiStat.mtime.toISOString(), created: fiStat.birthtime.toISOString(),
          extension: fiStat.isFile() ? path.extname(fiPath).slice(1) : undefined,
          lines: fiStat.isFile() && fiStat.size < 1024 * 1024 ? fs.readFileSync(fiFull, "utf-8").split("\n").length : undefined,
        };
        break;
      }
      case "git_status": {
        const status2 = childProcess.execSync("git status --porcelain", { cwd: WORKSPACE, timeout: 5000, encoding: "utf-8" });
        const branch = childProcess.execSync("git branch --show-current", { cwd: WORKSPACE, timeout: 5000, encoding: "utf-8" }).trim();
        const changes = status2.trim().split("\n").filter(Boolean).map(l => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));
        result = { branch, changedFiles: changes.length, changes, clean: changes.length === 0 };
        break;
      }
      case "git_log": {
        const { limit: glLimit = 20 } = params;
        const log = childProcess.execSync(`git log --oneline --all --graph --decorate -${Math.min(glLimit, 50)}`, { cwd: WORKSPACE, timeout: 10000, encoding: "utf-8" });
        result = { log: log.trim(), entries: log.trim().split("\n").length };
        break;
      }
      case "git_diff": {
        const { path: gdPath, staged } = params;
        const args = staged ? ["diff", "--staged"] : ["diff"];
        if (gdPath) {
          const resolved = path.resolve(WORKSPACE, gdPath);
          if (!resolved.startsWith(WORKSPACE)) throw new Error("גישה נדחתה");
          args.push("--", gdPath);
        }
        const diff = childProcess.execFileSync("git", args, { cwd: WORKSPACE, timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        result = { diff: diff.slice(0, 10000) || "(אין שינויים)", truncated: diff.length > 10000, linesChanged: diff.split("\n").length };
        break;
      }
      case "install_package": {
        const { package: pkgName, dev, workspace: pkgWorkspace } = params;
        if (!pkgName) throw new Error("package נדרש — שם החבילה להתקנה");
        const installArgs = ["pnpm", "add", pkgName];
        if (dev) installArgs.push("-D");
        if (pkgWorkspace) installArgs.push(`--filter`, pkgWorkspace);
        try {
          const output = childProcess.execSync(installArgs.join(" "), { cwd: WORKSPACE, timeout: 60000, encoding: "utf-8", maxBuffer: 2 * 1024 * 1024 });
          result = { package: pkgName, installed: true, dev: !!dev, workspace: pkgWorkspace, output: output.slice(0, 2000) };
        } catch (e: any) {
          throw new Error(`התקנה נכשלה: ${(e.stderr || e.message).slice(0, 500)}`);
        }
        break;
      }
      case "restart_server": {
        const { target = "api" } = params;
        try {
          if (target === "api" || target === "all") {
            childProcess.execSync("kill -HUP $(lsof -t -i:8080) 2>/dev/null || true", { cwd: WORKSPACE, timeout: 5000, encoding: "utf-8" });
          }
          result = { restarted: true, target, message: `שרת ${target} הופעל מחדש` };
        } catch (e: any) {
          result = { restarted: false, error: e.message };
        }
        break;
      }
      case "company_report": {
        const queries = await Promise.allSettled([
          db.execute(sql`SELECT count(*) as c FROM users`),
          db.execute(sql`SELECT count(*) as c FROM customers`),
          db.execute(sql`SELECT count(*) as c FROM suppliers`),
          db.execute(sql`SELECT count(*) as c FROM employees`),
          db.execute(sql`SELECT count(*) as c FROM products`),
          db.execute(sql`SELECT count(*) as c FROM sales_orders`),
          db.execute(sql`SELECT count(*) as c FROM purchase_orders`),
          db.execute(sql`SELECT count(*) as c FROM production_work_orders`),
          db.execute(sql`SELECT count(*) as c FROM raw_materials`),
          db.execute(sql`SELECT count(*) as c FROM customer_invoices`),
          db.execute(sql`SELECT count(*) as c FROM kimi_agents`),
          db.execute(sql`SELECT count(*) as c FROM kimi_conversations`),
          db.execute(sql`SELECT count(*) as c FROM module_entities`),
          db.execute(sql`SELECT count(*) as c FROM entity_records`),
          db.execute(sql`SELECT count(*) as c FROM menu_definitions`),
          db.execute(sql`SELECT count(*) as c FROM chart_of_accounts`),
          db.execute(sql`SELECT count(*) as c FROM projects`),
          db.execute(sql`SELECT count(*) as c FROM crm_leads`),
          db.execute(sql`SELECT count(*) as c FROM warehouses`),
          db.execute(sql`SELECT count(*) as c FROM departments`),
        ]);
        const getCount = (idx: number) => {
          const r = queries[idx];
          return r.status === "fulfilled" ? Number((r.value as any).rows?.[0]?.c || 0) : 0;
        };
        const labels = ["users", "customers", "suppliers", "employees", "products", "salesOrders", "purchaseOrders", "workOrders", "rawMaterials", "invoices", "kimiAgents", "conversations", "entities", "entityRecords", "menuItems", "chartOfAccounts", "projects", "crmLeads", "warehouses", "departments"];
        const counts: Record<string, number> = {};
        labels.forEach((l, i) => counts[l] = getCount(i));
        const mem = process.memoryUsage();
        result = {
          company: "טכנו-כל עוזי",
          timestamp: new Date().toISOString(),
          counts,
          system: {
            uptime: Math.round(process.uptime()),
            memoryMB: Math.round(mem.heapUsed / 1024 / 1024),
          },
          summary: `מצב מערכת: ${counts.users} משתמשים, ${counts.customers} לקוחות, ${counts.suppliers} ספקים, ${counts.employees} עובדים, ${counts.products} מוצרים, ${counts.kimiAgents} סוכני AI, ${counts.entities} ישויות, ${counts.menuItems} פריטי תפריט`,
        };
        break;
      }
      case "validate_all_entities": {
        const allEntVA = await internalFetch("GET", "/platform/entities");
        const entArr = (Array.isArray(allEntVA) ? allEntVA : []).slice(0, 50);
        const vaResults: Array<{ id: string; name: string; valid: boolean; issues: number; recordCount: number }> = [];
        for (const ent of entArr) {
          try {
            const [fields6, recs6] = await Promise.all([
              internalFetch("GET", `/platform/entities/${ent.id}/fields`),
              internalFetch("GET", `/platform/entities/${ent.id}/records?limit=20`),
            ]);
            const fArr = Array.isArray(fields6) ? fields6 : [];
            const rArr = Array.isArray(recs6) ? recs6 : (recs6.data || []);
            const reqF = fArr.filter((f: any) => f.isRequired);
            let issueCount = 0;
            if (fArr.length === 0) issueCount++;
            for (const rec of rArr) {
              const d6 = rec.data || rec;
              for (const rf of reqF) {
                const v6 = d6[rf.slug];
                if (v6 === null || v6 === undefined || v6 === "") issueCount++;
              }
            }
            vaResults.push({ id: ent.id, name: ent.nameHe || ent.name, valid: issueCount === 0, issues: issueCount, recordCount: rArr.length });
          } catch { vaResults.push({ id: ent.id, name: ent.nameHe || ent.name, valid: false, issues: -1, recordCount: 0 }); }
        }
        const validCount = vaResults.filter(r => r.valid).length;
        result = { totalChecked: vaResults.length, valid: validCount, invalid: vaResults.length - validCount, details: vaResults.sort((a, b) => b.issues - a.issues) };
        break;
      }
      case "api_documentation": {
        const { module: apiMod } = params;
        try {
          const routeFiles = childProcess.execSync(
            `find ${WORKSPACE}/artifacts/api-server/src/routes -name "*.ts" | sort`,
            { encoding: "utf-8", timeout: 5000 }
          ).trim().split("\n").filter(Boolean);
          const endpoints: Array<{ file: string; method: string; path: string }> = [];
          for (const rf of routeFiles) {
            if (apiMod && !rf.toLowerCase().includes(apiMod.toLowerCase())) continue;
            try {
              const content = fs.readFileSync(rf, "utf-8");
              const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
              let m;
              while ((m = routeRegex.exec(content)) !== null) {
                endpoints.push({ file: rf.replace(WORKSPACE + "/", ""), method: m[1].toUpperCase(), path: m[2] });
              }
            } catch {}
          }
          result = { totalFiles: routeFiles.length, totalEndpoints: endpoints.length, endpoints: endpoints.slice(0, 200), module: apiMod || "all" };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "agent_health_check": {
        try {
          const agentRes = await db.execute(sql`SELECT id, name, category, is_active FROM kimi_agents ORDER BY category, name LIMIT 200`);
          const agents = (agentRes.rows || []) as any[];
          const active = agents.filter(a => a.is_active);
          const inactive = agents.filter(a => !a.is_active);
          const categories = [...new Set(agents.map(a => a.category).filter(Boolean))];
          const convRes = await db.execute(sql`SELECT count(*) as c FROM kimi_conversations`).catch(() => ({ rows: [{ c: 0 }] }));
          const recentConvs = Number((convRes.rows as any[])?.[0]?.c || 0);
          let recentMsgs = 0;
          try {
            const msgRes = await db.execute(sql`SELECT count(*) as c FROM kimi_messages`);
            recentMsgs = Number((msgRes.rows as any[])?.[0]?.c || 0);
          } catch {}
          result = {
            totalAgents: agents.length,
            active: active.length,
            inactive: inactive.length,
            categories,
            categoryCounts: categories.map(cat => ({ category: cat, count: agents.filter(a => a.category === cat).length })),
            last24h: { conversations: recentConvs, messages: recentMsgs },
            inactiveAgents: inactive.slice(0, 20).map(a => ({ id: a.id, name: a.name, category: a.category })),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "workflow_report": {
        try {
          const wfRes = await db.execute(sql`SELECT id, name, slug, trigger_type, is_active, created_at FROM platform_workflows ORDER BY created_at DESC LIMIT 50`);
          const wiRes = await db.execute(sql`SELECT status, count(*) as c FROM workflow_instances GROUP BY status`).catch(() => ({ rows: [] }));
          const workflows = (wfRes.rows || []) as any[];
          const instanceStats = (wiRes.rows || []) as any[];
          result = {
            totalWorkflows: workflows.length,
            workflows: workflows.slice(0, 30),
            instanceStats,
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "audit_log": {
        const { entityId: auditEntityId, userId: auditUserId, action: auditAction, limit: auditLimit = 50 } = params;
        try {
          let auditQuery = `SELECT id, user_id, action, entity_type, entity_id, details, ip_address, created_at FROM audit_logs WHERE 1=1`;
          if (auditEntityId) auditQuery += ` AND entity_id = '${String(auditEntityId).replace(/'/g, "''")}'`;
          if (auditUserId) auditQuery += ` AND user_id = '${String(auditUserId).replace(/'/g, "''")}'`;
          if (auditAction) auditQuery += ` AND action = '${String(auditAction).replace(/'/g, "''")}'`;
          auditQuery += ` ORDER BY created_at DESC LIMIT ${Math.min(Number(auditLimit), 200)}`;
          const auditRes = await db.execute(sql.raw(auditQuery));
          result = { entries: auditRes.rows || [], count: (auditRes.rows || []).length };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "backup_check": {
        try {
          const dbSizeRes = await db.execute(sql`SELECT pg_database_size(current_database()) as size`);
          const tableCountRes = await db.execute(sql`SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'public'`);
          const bigTablesRes = await db.execute(sql`SELECT relname, n_live_tup as rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10`);
          result = {
            databaseSizeMB: Math.round(Number((dbSizeRes.rows as any[])?.[0]?.size || 0) / 1024 / 1024),
            tableCount: Number((tableCountRes.rows as any[])?.[0]?.c || 0),
            largestTables: bigTablesRes.rows || [],
            timestamp: new Date().toISOString(),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "financial_summary": {
        try {
          const queries2 = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(total_amount), 0) as total FROM customer_invoices`),
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(amount), 0) as total FROM customer_payments`),
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(total_amount), 0) as total FROM supplier_invoices`),
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(amount), 0) as total FROM supplier_payments`),
            db.execute(sql`SELECT count(*) as c FROM chart_of_accounts`),
            db.execute(sql`SELECT count(*) as c FROM journal_entries`),
          ]);
          const getVal = (idx: number) => {
            const r2 = queries2[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows?.[0] : { c: 0, total: 0 };
          };
          result = {
            customerInvoices: { count: Number(getVal(0)?.c || 0), totalAmount: Number(getVal(0)?.total || 0) },
            customerPayments: { count: Number(getVal(1)?.c || 0), totalAmount: Number(getVal(1)?.total || 0) },
            supplierInvoices: { count: Number(getVal(2)?.c || 0), totalAmount: Number(getVal(2)?.total || 0) },
            supplierPayments: { count: Number(getVal(3)?.c || 0), totalAmount: Number(getVal(3)?.total || 0) },
            chartOfAccounts: Number(getVal(4)?.c || 0),
            journalEntries: Number(getVal(5)?.c || 0),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "hr_summary": {
        try {
          const hrQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c FROM employees`),
            db.execute(sql`SELECT count(*) as c FROM departments`),
            db.execute(sql`SELECT count(*) as c FROM attendance_records WHERE date >= CURRENT_DATE - INTERVAL '30 days'`),
            db.execute(sql`SELECT count(*) as c FROM leave_requests WHERE status = 'pending'`),
            db.execute(sql`SELECT count(*) as c FROM payroll_records`),
            db.execute(sql`SELECT department, count(*) as c FROM employees GROUP BY department ORDER BY c DESC LIMIT 10`),
          ]);
          const hrGet = (idx: number) => {
            const r2 = hrQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0 }];
          };
          result = {
            employees: Number(hrGet(0)?.[0]?.c || 0),
            departments: Number(hrGet(1)?.[0]?.c || 0),
            attendanceLast30Days: Number(hrGet(2)?.[0]?.c || 0),
            pendingLeaveRequests: Number(hrGet(3)?.[0]?.c || 0),
            payrollRecords: Number(hrGet(4)?.[0]?.c || 0),
            employeesByDepartment: hrGet(5),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "inventory_summary": {
        try {
          const invQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c FROM raw_materials`),
            db.execute(sql`SELECT count(*) as c FROM products`),
            db.execute(sql`SELECT count(*) as c FROM warehouses`),
            db.execute(sql`SELECT count(*) as c FROM inventory_transactions WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`),
            db.execute(sql`SELECT count(*) as c FROM raw_materials WHERE CAST(current_stock AS numeric) <= CAST(minimum_stock AS numeric) AND minimum_stock IS NOT NULL AND current_stock IS NOT NULL`),
          ]);
          const invGet = (idx: number) => {
            const r2 = invQ[idx];
            return r2.status === "fulfilled" ? Number((r2.value as any).rows?.[0]?.c || 0) : 0;
          };
          result = {
            rawMaterials: invGet(0),
            products: invGet(1),
            warehouses: invGet(2),
            transactionsLast30Days: invGet(3),
            lowStockAlerts: invGet(4),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "production_summary": {
        try {
          const prodQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c FROM production_work_orders`),
            db.execute(sql`SELECT status, count(*) as c FROM production_work_orders GROUP BY status`),
            db.execute(sql`SELECT count(*) as c FROM bom_headers`),
            db.execute(sql`SELECT count(*) as c FROM machines`),
            db.execute(sql`SELECT count(*) as c FROM qc_inspections`),
            db.execute(sql`SELECT count(*) as c FROM production_lines`),
          ]);
          const prodGet = (idx: number) => {
            const r2 = prodQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0 }];
          };
          result = {
            workOrders: Number(prodGet(0)?.[0]?.c || 0),
            workOrdersByStatus: prodGet(1),
            bomHeaders: Number(prodGet(2)?.[0]?.c || 0),
            machines: Number(prodGet(3)?.[0]?.c || 0),
            qcInspections: Number(prodGet(4)?.[0]?.c || 0),
            productionLines: Number(prodGet(5)?.[0]?.c || 0),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "sales_summary": {
        try {
          const salesQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(total_amount), 0) as total FROM sales_orders`),
            db.execute(sql`SELECT status, count(*) as c FROM sales_orders GROUP BY status`),
            db.execute(sql`SELECT count(*) as c FROM customers`),
            db.execute(sql`SELECT count(*) as c FROM crm_leads`),
            db.execute(sql`SELECT count(*) as c FROM crm_opportunities`),
          ]);
          const salesGet = (idx: number) => {
            const r2 = salesQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0, total: 0 }];
          };
          result = {
            salesOrders: { count: Number(salesGet(0)?.[0]?.c || 0), totalAmount: Number(salesGet(0)?.[0]?.total || 0) },
            ordersByStatus: salesGet(1),
            customers: Number(salesGet(2)?.[0]?.c || 0),
            crmLeads: Number(salesGet(3)?.[0]?.c || 0),
            crmOpportunities: Number(salesGet(4)?.[0]?.c || 0),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "purchasing_summary": {
        try {
          const poQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c, COALESCE(sum(total_amount), 0) as total FROM purchase_orders`),
            db.execute(sql`SELECT status, count(*) as c FROM purchase_orders GROUP BY status`),
            db.execute(sql`SELECT count(*) as c FROM suppliers`),
            db.execute(sql`SELECT count(*) as c FROM goods_receipts`),
            db.execute(sql`SELECT count(*) as c FROM purchase_requests`),
          ]);
          const poGet = (idx: number) => {
            const r2 = poQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0, total: 0 }];
          };
          result = {
            purchaseOrders: { count: Number(poGet(0)?.[0]?.c || 0), totalAmount: Number(poGet(0)?.[0]?.total || 0) },
            ordersByStatus: poGet(1),
            suppliers: Number(poGet(2)?.[0]?.c || 0),
            goodsReceipts: Number(poGet(3)?.[0]?.c || 0),
            purchaseRequests: Number(poGet(4)?.[0]?.c || 0),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "crm_pipeline": {
        try {
          const crmQ = await Promise.allSettled([
            db.execute(sql`SELECT count(*) as c FROM crm_leads`),
            db.execute(sql`SELECT status, count(*) as c FROM crm_leads GROUP BY status`),
            db.execute(sql`SELECT count(*) as c FROM crm_opportunities`),
            db.execute(sql`SELECT stage, count(*) as c FROM crm_opportunities GROUP BY stage`),
            db.execute(sql`SELECT count(*) as c FROM customers`),
            db.execute(sql`SELECT source, count(*) as c FROM crm_leads GROUP BY source ORDER BY c DESC LIMIT 10`),
          ]);
          const crmGet = (idx: number) => {
            const r2 = crmQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0 }];
          };
          result = {
            leads: { total: Number(crmGet(0)?.[0]?.c || 0), byStatus: crmGet(1) },
            opportunities: { total: Number(crmGet(2)?.[0]?.c || 0), byStage: crmGet(3) },
            customers: Number(crmGet(4)?.[0]?.c || 0),
            leadSources: crmGet(5),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      case "module_coverage": {
        const covModules = await internalFetch("GET", "/platform/modules");
        const covEntities = await internalFetch("GET", "/platform/entities");
        const modArr = Array.isArray(covModules) ? covModules : (covModules.modules || []);
        const entArrCov = Array.isArray(covEntities) ? covEntities : [];
        let menuCountMap: Record<string, number> = {};
        try {
          const menuRes = await db.execute(sql`SELECT module_id, count(*) as c FROM system_menu_items WHERE module_id IS NOT NULL GROUP BY module_id`);
          for (const r of (menuRes.rows || []) as any[]) {
            menuCountMap[r.module_id] = Number(r.c);
          }
        } catch {}
        const coverage = modArr.map((m: any) => ({
          id: m.id,
          name: m.name,
          entities: entArrCov.filter((e: any) => e.moduleId === m.id).length,
          menuItems: menuCountMap[m.id] || 0,
        }));
        result = {
          totalModules: modArr.length,
          totalEntities: entArrCov.length,
          coverage: coverage.sort((a: any, b: any) => b.entities - a.entities),
        };
        break;
      }
      case "recent_activity": {
        const { hours = 24 } = params;
        const h = Math.min(Number(hours), 168);
        try {
          const actQ = await Promise.allSettled([
            db.execute(sql.raw(`SELECT count(*) as c FROM audit_logs WHERE created_at > NOW() - INTERVAL '${h} hours'`)),
            db.execute(sql.raw(`SELECT count(*) as c FROM entity_records WHERE created_at > NOW() - INTERVAL '${h} hours'`)),
            db.execute(sql.raw(`SELECT count(*) as c FROM kimi_conversations`)),
            db.execute(sql.raw(`SELECT action, count(*) as c FROM audit_logs WHERE created_at > NOW() - INTERVAL '${h} hours' GROUP BY action ORDER BY c DESC LIMIT 10`)),
          ]);
          const actGet = (idx: number) => {
            const r2 = actQ[idx];
            return r2.status === "fulfilled" ? (r2.value as any).rows : [{ c: 0 }];
          };
          result = {
            periodHours: h,
            auditEntries: Number(actGet(0)?.[0]?.c || 0),
            recordsCreated: Number(actGet(1)?.[0]?.c || 0),
            kimiMessages: Number(actGet(2)?.[0]?.c || 0),
            topActions: actGet(3),
          };
        } catch (e: any) {
          result = { error: e.message };
        }
        break;
      }
      default:
        throw new Error(`actionType לא קיים: "${actionType}". 75+ פעולות זמינות:\n**CRUD**: create_record, update_record, delete_record, get_record, clone_record, search_records, count_records, bulk_create/update/delete_records, export_data\n**פלטפורמה**: create/update_entity, create/update_field, create_module, list_modules/entities/entity_fields, find_entity, entity_summary, validate_entity, validate_all_entities, compare_entities, duplicate_entity, entity_relations, module_coverage\n**DB**: describe_table, list_tables, table_stats, db_size, db_indexes, system_stats, backup_check\n**חיפוש**: global_search, schema_export\n**SQL/API**: sql_read (הרצת SELECT חופשי על ה-DB — שימושי לחיפוש וסינון מתקדם), sql_write, api_call\n**תפריט**: list/create/update/delete_menu_item\n**קבצים**: read_file, write_file, edit_file, delete_file, list_files, search_code, create_directory, file_info\n**פקודות**: run_command, install_package, restart_server\n**Git**: git_status, git_log, git_diff\n**דוחות**: company_report, financial_summary, hr_summary, inventory_summary, production_summary, sales_summary, purchasing_summary, crm_pipeline, agent_health_check, workflow_report, audit_log, recent_activity\n**בדיקות**: data_quality_report, performance_check, smart_suggest, api_documentation\n\nלחיפוש וסינון מתקדם: השתמש ב-sql_read עם SELECT שרירותי, או ב-search_records עם filterField/filterValue/filters.`);
    }

    const suggestions = generateSuggestions(actionType, params, result);

    const duration = Date.now() - startTime;
    const entry = { timestamp: new Date().toISOString(), actionType, params, success: true, result, durationMs: duration };
    actionHistory.unshift(entry);
    if (actionHistory.length > 100) actionHistory.length = 100;

    res.json({ success: true, result, resolvedInfo, durationMs: duration, suggestions });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const failedAction = req.body?.actionType;
    actionHistory.unshift({ timestamp: new Date().toISOString(), actionType: failedAction, params: req.body?.params, success: false, error: err.message, durationMs: duration });
    if (actionHistory.length > 100) actionHistory.length = 100;
    const errorSuggestions = generateSuggestions(failedAction, req.body?.params, null);
    const sqlReadActions = ["search_records", "count_records", "global_search", "find_entity", "export_data"];
    if (failedAction && sqlReadActions.includes(failedAction) && !errorSuggestions.some(s => s.includes("sql_read"))) {
      errorSuggestions.push("שאילתה ישירה על ה-DB (sql_read) — מאפשר SELECT חופשי לחיפוש וסינון מתקדם");
    }
    res.status(400).json({ success: false, error: err.message, durationMs: duration, suggestions: errorSuggestions });
  }
});

router.post("/kimi/dev/execute-pipeline", async (req: Request, res: Response) => {
  try {
    const { actions, stopOnError = false, retryFailed = false } = req.body;
    if (!Array.isArray(actions) || actions.length === 0) {
      res.status(400).json({ success: false, error: "actions array is required" });
      return;
    }
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const results: Array<{ step: number; actionType: string; success: boolean; result?: any; error?: string; durationMs: number; retried?: boolean }> = [];
    const pipelineVars: Record<string, any> = {};

    for (let i = 0; i < actions.length; i++) {
      const action = { ...actions[i] };
      if (action.params) {
        const paramStr = JSON.stringify(action.params);
        const resolved = paramStr.replace(/\$\{prev\.(\w+)\}/g, (_, key) => {
          return pipelineVars[key] !== undefined ? String(pipelineVars[key]) : `\${prev.${key}}`;
        });
        action.params = JSON.parse(resolved);
      }

      const executeStep = async () => {
        const start = Date.now();
        const resp = await fetch(`${baseUrl}/kimi/dev/execute-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
          body: JSON.stringify(action),
          signal: AbortSignal.timeout(30000),
        });
        const data = await resp.json();
        return { data, durationMs: Date.now() - start };
      };

      if (action.condition) {
        try {
          const condStr = JSON.stringify(action.condition);
          const resolvedCond = condStr.replace(/\$\{prev\.(\w+)\}/g, (_, key) => {
            return pipelineVars[key] !== undefined ? String(pipelineVars[key]) : "";
          });
          const cond = JSON.parse(resolvedCond);
          const checkVal = pipelineVars[cond.field];
          const shouldSkip = cond.op === "eq" ? checkVal != cond.value :
            cond.op === "gt" ? !(Number(checkVal) > Number(cond.value)) :
            cond.op === "lt" ? !(Number(checkVal) < Number(cond.value)) :
            cond.op === "exists" ? !checkVal : false;
          if (shouldSkip) {
            results.push({ step: i + 1, actionType: action.actionType, success: true, result: { skipped: true, reason: "condition not met" }, durationMs: 0 });
            continue;
          }
        } catch {}
      }

      try {
        let { data, durationMs } = await executeStep();
        let retried = false;
        if (!data.success && retryFailed) {
          await new Promise(r => setTimeout(r, 1000));
          ({ data, durationMs } = await executeStep());
          retried = true;
        }

        if (data.success && data.result) {
          if (data.result.id) pipelineVars.lastId = data.result.id;
          if (data.result.count !== undefined) pipelineVars.lastCount = data.result.count;
          pipelineVars[`step${i + 1}`] = data.result;
        }

        results.push({ step: i + 1, actionType: action.actionType, success: data.success, result: data.result, durationMs, ...(retried ? { retried: true } : {}) });
        if (!data.success && stopOnError) break;
      } catch (e: any) {
        results.push({ step: i + 1, actionType: action.actionType, success: false, error: e.message, durationMs: 0 });
        if (stopOnError) break;
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
    res.json({ success: succeeded === results.length, totalSteps: results.length, succeeded, failed: results.length - succeeded, totalDurationMs: totalDuration, pipelineVars, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/kimi/dev/execute-batch", async (req: Request, res: Response) => {
  try {
    const { actions, parallel = false } = req.body;
    if (!Array.isArray(actions) || actions.length === 0) { res.status(400).json({ success: false, error: "actions[] required" }); return; }
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const startTime = Date.now();

    const executeOne = async (action: any, idx: number) => {
      const s = Date.now();
      try {
        const resp = await fetch(`${baseUrl}/kimi/dev/execute-action`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
          body: JSON.stringify(action), signal: AbortSignal.timeout(30000),
        });
        const data = await resp.json();
        return { index: idx, actionType: action.actionType, success: data.success, result: data.result, error: data.error, durationMs: Date.now() - s };
      } catch (e: any) {
        return { index: idx, actionType: action.actionType, success: false, error: e.message, durationMs: Date.now() - s };
      }
    };

    const results = parallel
      ? await Promise.all(actions.map((a, i) => executeOne(a, i)))
      : await (async () => { const r = []; for (let i = 0; i < actions.length; i++) r.push(await executeOne(actions[i], i)); return r; })();

    const succeeded = results.filter(r => r.success).length;
    res.json({
      success: succeeded === results.length, mode: parallel ? "parallel" : "sequential",
      totalActions: results.length, succeeded, failed: results.length - succeeded,
      totalDurationMs: Date.now() - startTime, results,
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.get("/kimi/dev/action-history", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  res.json({ history: actionHistory.slice(0, limit), total: actionHistory.length });
});

router.get("/kimi/dev/entity-catalog", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const headers: Record<string, string> = { ...(token ? { Authorization: token } : {}) };

    const [entitiesResp, modulesResp] = await Promise.all([
      fetch(`${baseUrl}/platform/entities`, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.json()),
      fetch(`${baseUrl}/platform/modules`, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    ]);

    const entities = (Array.isArray(entitiesResp) ? entitiesResp : []).map((e: any) => ({
      id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, type: e.entityType,
    }));
    const modules = (Array.isArray(modulesResp) ? modulesResp : (modulesResp.modules || [])).map((m: any) => ({
      id: m.id, name: m.name, slug: m.slug,
    }));

    const catalogText = `מודולים (${modules.length}): ${modules.map((m: any) => `${m.name}[${m.id}]`).join(", ")}\n\nישויות (${entities.length}): ${entities.map((e: any) => `${e.nameHe || e.name}[${e.id}/${e.slug}]`).join(", ")}`;

    res.json({ entities, modules, catalogText });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/deep-analysis", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 8080}`;

    const [healthResult, tablesResult, routeResult] = await Promise.all([
      db.execute(sql`SELECT 1`).then(() => ({ ok: true })).catch(() => ({ ok: false })),
      db.execute(sql`SELECT relname, n_live_tup as rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 30`),
      (async () => {
        const routes = [
          "/api/products", "/api/production-work-orders", "/api/hr/employees",
          "/api/suppliers", "/api/raw-materials", "/api/sales/orders",
          "/api/chart-of-accounts", "/api/finance/trial-balance",
          "/api/kimi/status", "/api/kimi/agents",
        ];
        const results = await Promise.all(routes.map(async r => {
          try {
            const start = Date.now();
            const resp = await fetch(`${baseUrl}${r}`, { headers: { Authorization: token || "" }, signal: AbortSignal.timeout(3000) });
            return { route: r, ok: resp.ok, ms: Date.now() - start };
          } catch { return { route: r, ok: false, ms: 0 }; }
        }));
        return results;
      })(),
    ]);

    const mem = process.memoryUsage();
    const tables = (tablesResult.rows || []) as any[];
    const totalRows = tables.reduce((s: number, t: any) => s + Number(t.rows || 0), 0);
    const routeResults = routeResult as any[];
    const avgLatency = Math.round(routeResults.reduce((s, r) => s + r.ms, 0) / routeResults.length);

    const emptyTables = tables.filter((t: any) => Number(t.rows) === 0);
    const bigTables = tables.filter((t: any) => Number(t.rows) > 100);

    const recommendations: string[] = [];
    if (avgLatency > 500) recommendations.push("⚡ זמני תגובה גבוהים — שקול הוספת indexes או caching");
    if (emptyTables.length > 10) recommendations.push(`📋 ${emptyTables.length} טבלאות ריקות — שקול seed data או ניקוי`);
    if (mem.heapUsed > 500 * 1024 * 1024) recommendations.push("🧠 שימוש גבוה בזיכרון — שקול אופטימיזציה");
    if (routeResults.some(r => !r.ok)) recommendations.push("🔴 יש נתיבי API שלא עובדים — בדוק לוגים");
    if (totalRows < 100) recommendations.push("📊 מעט נתונים במערכת — הרץ seed scripts");
    if (recommendations.length === 0) recommendations.push("✅ המערכת במצב מצוין!");

    res.json({
      score: Math.round((routeResults.filter(r => r.ok).length / routeResults.length) * 100),
      dbHealth: healthResult.ok,
      totalTables: tables.length,
      totalRows,
      bigTables: bigTables.map((t: any) => ({ name: t.relname, rows: Number(t.rows) })),
      emptyTablesCount: emptyTables.length,
      apiAvgLatency: avgLatency,
      apiRoutesPassing: routeResults.filter(r => r.ok).length,
      apiRoutesTotal: routeResults.length,
      memoryMB: Math.round(mem.heapUsed / 1024 / 1024),
      uptimeMinutes: Math.round(process.uptime() / 60),
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/kimi/dev/context-snapshot", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
    const headers: Record<string, string> = { ...(token ? { Authorization: token } : {}) };

    const [tablesResult, healthResult, agentsResult, entitiesResult, modulesResult] = await Promise.all([
      db.execute(sql`SELECT relname, n_live_tup as rows FROM pg_stat_user_tables WHERE n_live_tup > 0 ORDER BY n_live_tup DESC LIMIT 15`),
      (async () => {
        const start = Date.now();
        await db.execute(sql`SELECT 1`);
        return { latencyMs: Date.now() - start, uptime: Math.round(process.uptime() / 60) };
      })(),
      db.execute(sql`SELECT count(*) as total FROM kimi_agents WHERE is_active = true`),
      fetch(`${baseUrl}/platform/entities`, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => []),
      fetch(`${baseUrl}/platform/modules`, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => []),
    ]);

    const tables = (tablesResult.rows || []) as any[];
    const tablesSummary = tables.map((t: any) => `${t.relname}(${t.rows})`).join(", ");

    const entities = Array.isArray(entitiesResult) ? entitiesResult : [];
    const modules = Array.isArray(modulesResult) ? modulesResult : (modulesResult.modules || []);

    const entityCatalog = entities.map((e: any) => `${e.nameHe || e.name}[id=${e.id},slug=${e.slug}]`).join(", ");
    const moduleCatalog = modules.map((m: any) => `${m.name}[id=${m.id}]`).join(", ");

    const mem = process.memoryUsage();
    res.json({
      context: `[מצב מערכת] DB: ${healthResult.latencyMs}ms, uptime: ${healthResult.uptime}m, mem: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, ${(agentsResult.rows[0] as any)?.total || 0} סוכנים.
[טבלאות גדולות] ${tablesSummary}
[מודולים(${modules.length})] ${moduleCatalog}
[ישויות(${entities.length})] ${entityCatalog}
[יכולות] 75+ פעולות: CRUD(11 פעולות רשומות כולל bulk+export), פלטפורמה(12 פעולות ישויות/שדות/מודולים), DB(6), חיפוש(global_search/schema_export), SQL/API(3), תפריט(4), קבצים(8), פקודות(3), Git(3), דוחות עסקיים(15: company_report/financial_summary/hr_summary/inventory_summary/production_summary/sales_summary/purchasing_summary/crm_pipeline/agent_health_check/workflow_report/validate_all_entities/api_documentation/backup_check/module_coverage/recent_activity). entityName בעברית → ID אוטומטי! Pipeline v2 עם stopOnError+retryFailed+pipelineVars`,
    });
  } catch (err: any) {
    res.json({ context: "" });
  }
});

const SYSTEM_TABLES_TO_PRESERVE = new Set([
  'users', 'user_sessions',
  'platform_modules', 'module_entities', 'entity_fields', 'entity_categories', 'entity_relations', 'entity_statuses',
  'system_menu_items', 'system_categories', 'system_buttons', 'system_dashboard_pages', 'system_dashboard_widgets',
  'system_detail_pages', 'system_detail_sections', 'system_form_fields', 'system_form_sections',
  'system_permissions', 'system_publish_logs', 'system_settings', 'system_status_sets', 'system_status_values',
  'system_templates', 'system_validations', 'system_versions', 'system_view_columns',
  'platform_roles', 'role_assignments', 'role_permissions',
  'platform_workflows', 'platform_automations', 'platform_widgets',
  'kimi_agents',
  'form_definitions', 'view_definitions', 'detail_definitions', 'action_definitions', 'report_definitions',
  'validation_rules', 'status_transitions',
  'auto_number_counters',
  'notification_preferences', 'notification_routing_rules',
  'ai_api_keys', 'ai_providers', 'ai_prompt_templates', 'ai_permissions', 'ai_models',
  'integration_templates', 'integration_endpoints',
  'material_categories', 'product_categories',
]);

router.post("/kimi/dev/reset-data", async (req: Request, res: Response) => {
  try {
    const allTablesResult = await db.execute(sql.raw(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    ));
    const allTables = (allTablesResult.rows as any[]).map(r => r.tablename);
    const businessTables = allTables.filter(t => !SYSTEM_TABLES_TO_PRESERVE.has(t));

    const truncated: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const table of businessTables) {
      try {
        const countResult = await db.execute(sql.raw(`SELECT count(*) as cnt FROM "${table}"`));
        const cnt = parseInt((countResult.rows[0] as any)?.cnt || '0', 10);
        if (cnt > 0) {
          await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
          truncated.push(`${table} (${cnt})`);
        } else {
          skipped.push(table);
        }
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      res.status(500).json({
        success: false,
        message: `איפוס נכשל חלקית: ${errors.length} שגיאות`,
        truncated,
        errors,
      });
      return;
    }

    const verifyErrors: string[] = [];
    for (const table of businessTables) {
      try {
        const r = await db.execute(sql.raw(`SELECT count(*) as cnt FROM "${table}"`));
        const cnt = parseInt((r.rows[0] as any)?.cnt || '0', 10);
        if (cnt > 0) verifyErrors.push(`${table}: ${cnt} rows remain`);
      } catch {}
    }

    res.json({
      success: verifyErrors.length === 0,
      message: `איפוס הושלם: ${truncated.length} טבלאות נוקו, ${skipped.length} היו ריקות`,
      totalBusinessTables: businessTables.length,
      systemTablesPreserved: SYSTEM_TABLES_TO_PRESERVE.size,
      truncated,
      skippedCount: skipped.length,
      verification: verifyErrors.length === 0
        ? "כל הטבלאות העסקיות ריקות — אימות מלא הצליח"
        : verifyErrors,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
