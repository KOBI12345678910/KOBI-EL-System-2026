import { pool } from "@workspace/db";
import { VAT_RATE } from "../../constants";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import ExcelJS from "exceljs";
import { importData, handleSchedulerTool, handleTriggerTool, getAgentStatus } from "../../lib/super-ai-agent";
import { saveMemory } from "./memory";

const ROOT = join(process.cwd(), "../..");

interface CacheEntry { result: string; expiresAt: number; }
const schemaCache = new Map<string, CacheEntry>();
const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000;

const sqlQueryCache = new Map<string, CacheEntry>();
const SQL_CACHE_TTL_MS = 5 * 60 * 1000;
const SQL_CACHE_MAX_SIZE = 200;

const sessionSchemaCache = new Map<string, { result: string; setAt: number }>();
const SESSION_SCHEMA_CACHE_TTL_MS = 60 * 60 * 1000;

function getSchemaCacheKey(table?: string): string {
  return table ? `table:${table}` : "all_tables";
}

function getSchemaFromCache(table?: string): string | null {
  const key = getSchemaCacheKey(table);
  const entry = schemaCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    schemaCache.delete(key);
    return null;
  }
  return entry.result;
}

function setSchemaCache(table: string | undefined, result: string): void {
  const key = getSchemaCacheKey(table);
  schemaCache.set(key, { result, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS });
}

function getSqlCacheKey(query: string, params?: string[]): string {
  return `${query.trim().toLowerCase()}|${(params || []).join(",")}`;
}

function getSqlFromCache(query: string, params?: string[]): string | null {
  const key = getSqlCacheKey(query, params);
  const entry = sqlQueryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sqlQueryCache.delete(key);
    return null;
  }
  sqlQueryCache.delete(key);
  sqlQueryCache.set(key, entry);
  console.log(`[KobiCache] SQL cache hit: ${query.slice(0, 80)}`);
  return entry.result;
}

function setSqlCache(query: string, params: string[] | undefined, result: string): void {
  const key = getSqlCacheKey(query, params);
  if (sqlQueryCache.has(key)) {
    sqlQueryCache.delete(key);
  }
  if (sqlQueryCache.size >= SQL_CACHE_MAX_SIZE) {
    const lruKey = sqlQueryCache.keys().next().value;
    if (lruKey) sqlQueryCache.delete(lruKey);
  }
  sqlQueryCache.set(key, { result, expiresAt: Date.now() + SQL_CACHE_TTL_MS });
}

function invalidateSqlCache(): void {
  sqlQueryCache.clear();
}

export function combineSqlQueries(queries: Array<{ alias: string; query: string }>): string {
  const selectClauses = queries.map(({ alias, query }) => {
    const trimmed = query.trim().replace(/;$/, "");
    const upper = trimmed.toUpperCase();
    const hasMultipleColumns = /SELECT\s+[^*].+,/.test(upper.replace(/\s+/g, " "));
    const hasLimit1 = /LIMIT\s+1(\s|$)/i.test(trimmed);
    if (hasMultipleColumns && !hasLimit1) {
      throw new Error(`combineSqlQueries: שאילתה "${alias}" עשויה להחזיר מספר עמודות. השתמש רק בשאילתות סקלריות (עמודה אחת, שורה אחת). הוסף LIMIT 1 או השתמש ב-COUNT / MAX / MIN / SUM / AVG.`);
    }
    return `(${trimmed}) AS ${alias}`;
  });
  return `SELECT ${selectClauses.join(", ")}`;
}

let _saveMemoryContext: { userId: string; sessionId?: number } | null = null;

export function setSaveMemoryContext(userId: string, sessionId?: number): void {
  _saveMemoryContext = { userId, sessionId };
}

function safePath(p: string): string {
  const clean = p.replace(/\.\./g, "").replace(/\/\//g, "/");
  const resolved = join(ROOT, clean);
  if (!resolved.startsWith(ROOT)) throw new Error("נתיב לא מורשה");
  return resolved;
}

export async function executeTool(name: string, input: any): Promise<{ result: string; error?: string }> {
  try {
    switch (name) {
      case "read_file": return readFile(input);
      case "write_file": return writeFileTool(input);
      case "edit_file": return editFile(input);
      case "delete_file": return deleteFile(input);
      case "list_files": return listFiles(input);
      case "search_files": return searchFiles(input);
      case "run_sql": return await runSQL(input);
      case "run_command": return runCommand(input);
      case "manage_module": return await manageModule(input);
      case "manage_menu": return await manageMenu(input);
      case "system_health": return await systemHealth(input);
      case "create_page": return await createPage(input);
      case "create_api_route": return await createApiRoute(input);
      case "create_table": return await createTable(input);
      case "data_operations": return await dataOperations(input);
      case "analyze_code": return analyzeCode(input);
      case "api_test": return await apiTest(input);
      case "add_field": return await addField(input);
      case "stream_data": return await streamData(input);
      case "db_schema": return await dbSchema(input);
      case "task_queue": return await taskQueue(input);
      case "erp_query": return await erpQuery(input);
      case "financial_calc": return await financialCalc(input);
      case "user_management": return await userManagement(input);
      case "report_generator": return await reportGenerator(input);
      case "notification_send": return await notificationSend(input);
      case "data_validator": return await dataValidator(input);
      case "bulk_update": return await bulkUpdate(input);
      case "erp_insights": return await erpInsights(input);
      case "customer_service": return await customerService(input);
      case "inventory_check": return await inventoryCheck(input);
      case "backup_restore": return await backupRestore(input);
      case "workflow_trigger": return await workflowTrigger(input);
      case "smart_fix": return await smartFix(input);
      case "deploy_check": return await deployCheck(input);
      case "export_report": return await exportReport(input);
      case "import_data": return await importData(input);
      case "scheduler": return await handleSchedulerTool(input);
      case "automation_trigger": return await handleTriggerTool(input);
      case "agent_status": return { result: JSON.stringify(await getAgentStatus(), null, 2) };
      case "build_feature": return await buildFeature(input);
      case "package_manager": return packageManager(input);
      case "git_ops": return gitOps(input);
      case "analyze_image": return await analyzeImage(input);
      case "show_map": return showMap(input);
      case "save_memory": return await saveMemoryTool(input);
      default: return { result: "", error: `כלי לא מוכר: ${name}` };
    }
  } catch (e: any) {
    return { result: "", error: e.message || String(e) };
  }
}

function readFile(input: { path: string; offset?: number; limit?: number }): { result: string } {
  const fullPath = safePath(input.path);
  if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${input.path}`);
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");
  const offset = (input.offset || 1) - 1;
  const limit = input.limit || 200;
  const slice = lines.slice(offset, offset + limit);
  const numbered = slice.map((line, i) => `${offset + i + 1}: ${line}`).join("\n");
  return { result: `[${input.path}] (${lines.length} שורות, מציג ${offset + 1}-${Math.min(offset + limit, lines.length)}):\n${numbered}` };
}

function writeFileTool(input: { path: string; content: string }): { result: string } {
  const fullPath = safePath(input.path);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, input.content, "utf-8");
  const lineCount = input.content.split("\n").length;
  return { result: `✅ קובץ נכתב: ${input.path} (${lineCount} שורות, ${input.content.length} תווים)` };
}

function editFile(input: { path: string; old_text: string; new_text: string }): { result: string } {
  const fullPath = safePath(input.path);
  if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${input.path}`);
  const content = readFileSync(fullPath, "utf-8");
  const count = content.split(input.old_text).length - 1;
  if (count === 0) throw new Error("הטקסט המקורי לא נמצא בקובץ — וודא שאתה מעתיק בדיוק כולל רווחים");
  if (count > 1) throw new Error(`הטקסט נמצא ${count} פעמים — צריך להיות ייחודי. הוסף שורות הקשר`);
  const newContent = content.replace(input.old_text, input.new_text);
  writeFileSync(fullPath, newContent, "utf-8");
  return { result: `✅ קובץ עודכן: ${input.path}` };
}

function deleteFile(input: { path: string }): { result: string } {
  const fullPath = safePath(input.path);
  if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${input.path}`);
  unlinkSync(fullPath);
  return { result: `✅ קובץ נמחק: ${input.path}` };
}

function listFiles(input: { path?: string; recursive?: boolean; pattern?: string }): { result: string } {
  const dir = safePath(input.path || ".");
  if (!existsSync(dir)) throw new Error(`תיקייה לא נמצאה: ${input.path}`);
  const items: string[] = [];
  function scan(d: string, depth: number) {
    if (depth > 4 || items.length > 150) return;
    try {
      const entries = readdirSync(d);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === ".git") continue;
        const full = join(d, entry);
        try {
          const stat = statSync(full);
          const rel = full.replace(ROOT + "/", "");
          if (input.pattern) {
            const regex = new RegExp(input.pattern.replace(/\*/g, ".*").replace(/\?/g, "."), "i");
            if (!regex.test(entry)) {
              if (stat.isDirectory() && input.recursive) scan(full, depth + 1);
              continue;
            }
          }
          items.push(`${stat.isDirectory() ? "📁" : "📄"} ${rel}${stat.isDirectory() ? "/" : ""}`);
          if (stat.isDirectory() && input.recursive) scan(full, depth + 1);
        } catch {}
      }
    } catch {}
  }
  scan(dir, 0);
  return { result: items.length > 0 ? items.join("\n") : "תיקייה ריקה" };
}

function searchFiles(input: { pattern: string; path?: string; file_pattern?: string; max_results?: number }): { result: string } {
  const searchPath = input.path ? safePath(input.path) : ROOT;
  const max = input.max_results || 30;
  try {
    const globArg = input.file_pattern ? `--glob '${input.file_pattern}'` : "--glob '!node_modules' --glob '!dist' --glob '!.git'";
    const escaped = input.pattern.replace(/'/g, "'\\''");
    const cmd = `rg -n --max-count ${max} ${globArg} '${escaped}' '${searchPath}' 2>/dev/null | head -${max * 3}`;
    const output = execSync(cmd, { timeout: 15000, maxBuffer: 200000 }).toString().trim();
    if (!output) return { result: "לא נמצאו תוצאות" };
    return { result: output.replace(new RegExp(ROOT + "/", "g"), "") };
  } catch {
    return { result: "לא נמצאו תוצאות" };
  }
}

async function runSQL(input: { query: string; params?: string[] }): Promise<{ result: string }> {
  const q = input.query.trim();
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)/i.test(q);
  if (/^\s*(DROP\s+(DATABASE|SCHEMA)|TRUNCATE\s+\w+\s*;?\s*$)/i.test(q)) {
    throw new Error("פעולה מסוכנת מדי! DROP DATABASE/SCHEMA/TRUNCATE ללא WHERE חסום.");
  }

  if (isWrite) {
    invalidateSqlCache();
    const result = await pool.query(q, input.params || []);
    return { result: `✅ בוצע — ${result.rowCount} שורות הושפעו` };
  }

  const cached = getSqlFromCache(q, input.params);
  if (cached) {
    return { result: `[cache] ${cached}` };
  }

  const hasSubquery = /\(\s*SELECT/i.test(q);
  const needsLimit = !/LIMIT/i.test(q) && !hasSubquery && /^\s*SELECT/i.test(q);
  const limitedQ = needsLimit ? `${q} LIMIT 100` : q;
  const result = await pool.query(limitedQ, input.params || []);
  const rows = result.rows;
  if (rows.length === 0) {
    setSqlCache(q, input.params, "אין תוצאות");
    return { result: "אין תוצאות" };
  }
  const headers = Object.keys(rows[0]);
  let formatted: string;
  if (rows.length <= 30) {
    const table = [
      headers.join(" | "),
      headers.map(() => "---").join(" | "),
      ...rows.map(r => headers.map(h => {
        const v = r[h];
        if (v === null) return "NULL";
        if (typeof v === "object") return JSON.stringify(v).slice(0, 50);
        return String(v).slice(0, 60);
      }).join(" | ")),
    ].join("\n");
    formatted = `${rows.length} תוצאות:\n${table}`;
  } else {
    formatted = `${rows.length} תוצאות:\n${JSON.stringify(rows.slice(0, 30), null, 2)}\n...(ועוד ${rows.length - 30})`;
  }
  setSqlCache(q, input.params, formatted);
  return { result: formatted };
}

function runCommand(input: { command: string; timeout_ms?: number; cwd?: string }): { result: string } {
  const cmd = input.command.trim();
  const blocked = ["rm -rf /", "shutdown", "reboot", "mkfs", "dd if=", ":(){", "fork bomb"];
  if (blocked.some(b => cmd.toLowerCase().includes(b))) throw new Error("פקודה חסומה מסיבות אבטחה");
  const cwd = input.cwd ? safePath(input.cwd) : ROOT;
  try {
    const output = execSync(cmd, {
      timeout: input.timeout_ms || 30000,
      maxBuffer: 500000,
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
    }).toString().trim();
    return { result: output.slice(0, 8000) || "(הושלם ללא פלט)" };
  } catch (e: any) {
    const stderr = e.stderr?.toString?.()?.slice(0, 3000) || "";
    const stdout = e.stdout?.toString?.()?.slice(0, 3000) || "";
    return { result: `❌ exit ${e.status}:\n${stderr || stdout || e.message}` };
  }
}

async function manageModule(input: any): Promise<{ result: string }> {
  const { action } = input;
  switch (action) {
    case "list_modules": {
      const r = await pool.query("SELECT id, name, label, slug, icon, is_active, sort_order FROM platform_modules ORDER BY sort_order");
      return { result: `${r.rows.length} מודולים:\n${r.rows.map((m: any) => `[${m.id}] ${m.label} (${m.slug}) ${m.is_active ? "✅" : "❌"}`).join("\n")}` };
    }
    case "list_entities": {
      const filter = input.module_name ? `WHERE pm.name ILIKE '%${input.module_name}%' OR pm.label ILIKE '%${input.module_name}%'` : "";
      const r = await pool.query(`SELECT me.id, me.name, me.label, me.slug, me.icon, pm.label as module FROM module_entities me JOIN platform_modules pm ON me.module_id = pm.id ${filter} ORDER BY pm.sort_order, me.sort_order LIMIT 200`);
      return { result: `${r.rows.length} ישויות:\n${r.rows.map((e: any) => `[${e.id}] ${e.label} (${e.slug}) — ${e.module}`).join("\n")}` };
    }
    case "list_fields": {
      if (!input.entity_id) throw new Error("entity_id נדרש");
      const r = await pool.query("SELECT id, name, label, field_type, is_required, show_in_list, show_in_form, sort_order FROM entity_fields WHERE entity_id = $1 ORDER BY sort_order", [input.entity_id]);
      return { result: `${r.rows.length} שדות:\n${r.rows.map((f: any) => `[${f.id}] ${f.label} (${f.name}: ${f.field_type}) ${f.is_required ? "חובה" : ""}`).join("\n")}` };
    }
    case "create_module": {
      const d = input.entity_data || {};
      const name = d.name || d.label;
      const r = await pool.query(
        "INSERT INTO platform_modules (name, label, slug, icon, description, is_active, sort_order) VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id, label",
        [name, d.label || name, d.slug || name?.toLowerCase().replace(/\s+/g, "-"), d.icon || "Box", d.description || "", d.sortOrder || 100]
      );
      return { result: `✅ מודול נוצר: [${r.rows[0].id}] ${r.rows[0].label}` };
    }
    case "create_entity": {
      const d = input.entity_data || {};
      let moduleId = input.module_id || d.module_id;
      if (!moduleId && input.module_name) {
        const m = await pool.query("SELECT id FROM platform_modules WHERE name ILIKE $1 OR label ILIKE $1 LIMIT 1", [`%${input.module_name}%`]);
        if (m.rows.length === 0) throw new Error(`מודול "${input.module_name}" לא נמצא`);
        moduleId = m.rows[0].id;
      }
      if (!moduleId) throw new Error("module_id או module_name נדרש");
      const name = d.name || d.label;
      const r = await pool.query(
        "INSERT INTO module_entities (module_id, name, label, slug, icon, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, label",
        [moduleId, name, d.label || name, d.slug || name?.toLowerCase().replace(/\s+/g, "-"), d.icon || "File", d.sortOrder || 100]
      );
      return { result: `✅ ישות נוצרה: [${r.rows[0].id}] ${r.rows[0].label}` };
    }
    case "create_field": {
      const d = input.field_data || {};
      const entityId = input.entity_id;
      if (!entityId) throw new Error("entity_id נדרש");
      const r = await pool.query(
        "INSERT INTO entity_fields (entity_id, name, label, field_type, is_required, show_in_list, show_in_form, sort_order, options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, label",
        [entityId, d.name, d.label || d.name, d.fieldType || "text", d.isRequired || false, d.showInList !== false, d.showInForm !== false, d.sortOrder || 100, d.options ? JSON.stringify(d.options) : null]
      );
      return { result: `✅ שדה נוצר: [${r.rows[0].id}] ${r.rows[0].label}` };
    }
    case "delete_entity": {
      if (!input.entity_id) throw new Error("entity_id נדרש");
      await pool.query("DELETE FROM entity_fields WHERE entity_id = $1", [input.entity_id]);
      await pool.query("DELETE FROM module_entities WHERE id = $1", [input.entity_id]);
      return { result: `✅ ישות ${input.entity_id} נמחקה (עם כל השדות)` };
    }
    case "delete_field": {
      if (!input.field_id) throw new Error("field_id נדרש");
      await pool.query("DELETE FROM entity_fields WHERE id = $1", [input.field_id]);
      return { result: `✅ שדה ${input.field_id} נמחק` };
    }
    case "update_entity": {
      const d = input.entity_data || {};
      if (!input.entity_id) throw new Error("entity_id נדרש");
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(d)) {
        sets.push(`${k} = $${idx}`);
        vals.push(v);
        idx++;
      }
      vals.push(input.entity_id);
      await pool.query(`UPDATE module_entities SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      return { result: `✅ ישות ${input.entity_id} עודכנה` };
    }
    case "update_field": {
      const d = input.field_data || {};
      if (!input.field_id) throw new Error("field_id נדרש");
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(d)) {
        sets.push(`${k} = $${idx}`);
        vals.push(v);
        idx++;
      }
      vals.push(input.field_id);
      await pool.query(`UPDATE entity_fields SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      return { result: `✅ שדה ${input.field_id} עודכן` };
    }
    default:
      return { result: `פעולה ${action} לא ממומשת` };
  }
}

async function manageMenu(input: any): Promise<{ result: string }> {
  const { action, menu_data, item_id } = input;
  switch (action) {
    case "list": {
      const r = await pool.query("SELECT id, label, label_he, path, section, icon, sort_order, is_active FROM menu_items ORDER BY section, sort_order");
      return { result: `${r.rows.length} פריטים:\n${r.rows.map((m: any) => `[${m.id}] ${m.label_he || m.label} → ${m.path} (${m.section}) ${m.is_active ? "✅" : "❌"}`).join("\n")}` };
    }
    case "create": {
      if (!menu_data) throw new Error("menu_data נדרש");
      const r = await pool.query(
        "INSERT INTO menu_items (label, label_he, path, section, icon, sort_order, is_active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, label_he",
        [menu_data.label || menu_data.labelHe, menu_data.labelHe || menu_data.label, menu_data.path, menu_data.section || "modules", menu_data.icon || "Box", menu_data.sortOrder || 100]
      );
      return { result: `✅ פריט תפריט נוצר: [${r.rows[0].id}] ${r.rows[0].label_he}` };
    }
    case "update": {
      if (!item_id || !menu_data) throw new Error("item_id + menu_data נדרשים");
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(menu_data)) {
        const col = k === "labelHe" ? "label_he" : k === "sortOrder" ? "sort_order" : k === "isActive" ? "is_active" : k;
        sets.push(`${col} = $${idx}`);
        vals.push(v);
        idx++;
      }
      vals.push(item_id);
      await pool.query(`UPDATE menu_items SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      return { result: `✅ פריט ${item_id} עודכן` };
    }
    case "delete": {
      if (!item_id) throw new Error("item_id נדרש");
      await pool.query("DELETE FROM menu_items WHERE id = $1", [item_id]);
      return { result: `✅ פריט ${item_id} נמחק` };
    }
    default:
      return { result: `פעולת תפריט ${action} לא ממומשת` };
  }
}

let lastHealthResult: { result: string; at: number } | null = null;
const HEALTH_CACHE_TTL_MS = 30 * 1000;

async function systemHealth(input: any): Promise<{ result: string }> {
  const check = input.check || "full";

  if (check === "full" && lastHealthResult && (Date.now() - lastHealthResult.at) < HEALTH_CACHE_TTL_MS) {
    return { result: `[cache 30s] ${lastHealthResult.result}` };
  }

  const parts: string[] = [];

  if (check === "full" || check === "database") {
    const start = Date.now();
    const r = await pool.query("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'");
    const latency = Date.now() - start;
    parts.push(`📊 **מסד נתונים**: ${latency}ms latency, ${r.rows[0].cnt} טבלאות`);
  }

  if (check === "full" || check === "server") {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    parts.push(`🖥️ **שרת**: uptime ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m, RAM ${Math.round(mem.heapUsed / 1048576)}MB/${Math.round(mem.heapTotal / 1048576)}MB`);
  }

  if (check === "full" || check === "memory") {
    const mem = process.memoryUsage();
    parts.push(`💾 **זיכרון**: heap ${Math.round(mem.heapUsed / 1048576)}MB, rss ${Math.round(mem.rss / 1048576)}MB, external ${Math.round(mem.external / 1048576)}MB`);
  }

  if (check === "full" || check === "tables") {
    const r = await pool.query(`
      SELECT t.table_name, 
        (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as columns
      FROM information_schema.tables t 
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    if (check === "tables") {
      const tables = r.rows.map((t: any) => `${t.table_name} (${t.columns} עמודות)`);
      parts.push(`📋 **${r.rows.length} טבלאות**:\n${tables.join("\n")}`);
    } else {
      parts.push(`📋 **טבלאות**: ${r.rows.length} טבלאות פעילות`);
    }
  }

  if (check === "routes") {
    try {
      const output = execSync(`ls -1 ${ROOT}/artifacts/api-server/src/routes/*.ts 2>/dev/null | wc -l`, { timeout: 5000 }).toString().trim();
      parts.push(`🛣️ **Routes**: ${output} קבצי route`);
    } catch { parts.push("🛣️ **Routes**: לא זמין"); }
  }

  if (check === "disk") {
    try {
      const output = execSync("df -h / | tail -1", { timeout: 5000 }).toString().trim();
      parts.push(`💿 **דיסק**: ${output}`);
    } catch { parts.push("💿 **דיסק**: לא זמין"); }
  }

  if (check === "logs") {
    try {
      const output = execSync("tail -30 /tmp/logs/*.log 2>/dev/null || echo 'אין לוגים זמינים'", { timeout: 5000 }).toString();
      parts.push(`📋 **לוגים**:\n${output.slice(0, 3000)}`);
    } catch { parts.push("📋 **לוגים**: לא זמינים"); }
  }

  if (check === "full") {
    try {
      const users = await pool.query("SELECT count(*) as cnt FROM users WHERE is_active = true");
      const modules = await pool.query("SELECT count(*) as cnt FROM platform_modules WHERE is_active = true");
      parts.push(`👥 **משתמשים פעילים**: ${users.rows[0].cnt}`);
      parts.push(`📦 **מודולים פעילים**: ${modules.rows[0].cnt}`);
    } catch {}
    try {
      const output = execSync("df -h / | tail -1 | awk '{print $5}'", { timeout: 5000 }).toString().trim();
      parts.push(`💿 **דיסק**: ${output} בשימוש`);
    } catch {}
  }

  const finalResult = parts.join("\n\n") || "בדיקה הושלמה";
  if (check === "full") {
    lastHealthResult = { result: finalResult, at: Date.now() };
  }
  return { result: finalResult };
}

async function createPage(input: any): Promise<{ result: string }> {
  const { page_path, title, section, icon, content, file_path } = input;
  const pagePath = page_path.startsWith("/") ? page_path : `/${page_path}`;
  const filePath = file_path || `artifacts/erp-app/src/pages${pagePath}.tsx`;
  const componentName = pagePath.split("/").pop()!.replace(/-([a-z])/g, (_: any, c: string) => c.toUpperCase()).replace(/^./, (c: string) => c.toUpperCase()) + "Page";
  const lazyName = componentName;

  const pageContent = content || `export default function ${componentName}() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">${title}</h1>
      </div>
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
        <p className="text-gray-400">תוכן הדף כאן</p>
      </div>
    </div>
  );
}
`;

  const fullPath = safePath(filePath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, pageContent, "utf-8");

  const appTsxPath = safePath("artifacts/erp-app/src/App.tsx");
  let appContent = readFileSync(appTsxPath, "utf-8");

  const importLine = `const ${lazyName} = lazy(() => import("@/pages${pagePath}"));`;
  if (!appContent.includes(importLine)) {
    const insertPoint = appContent.indexOf("\nconst AISalesAssistantPage");
    if (insertPoint > -1) {
      appContent = appContent.slice(0, insertPoint) + `\n${importLine}` + appContent.slice(insertPoint);
    }
  }

  const routeLine = `          <Route path="${pagePath}" component={${lazyName}} />`;
  if (!appContent.includes(`path="${pagePath}"`)) {
    const kimiRouteIdx = appContent.indexOf('<Route path="/ai-engine/kimi-terminal"');
    if (kimiRouteIdx > -1) {
      const lineEnd = appContent.indexOf("\n", kimiRouteIdx);
      appContent = appContent.slice(0, lineEnd + 1) + routeLine + "\n" + appContent.slice(lineEnd + 1);
    }
  }
  writeFileSync(appTsxPath, appContent, "utf-8");

  if (section) {
    const layoutPath = safePath("artifacts/erp-app/src/components/layout.tsx");
    let layoutContent = readFileSync(layoutPath, "utf-8");
    const menuItem = `  { href: "${pagePath}", label: "${title}", icon: ${icon || "FileText"}, section: "${section}" },`;
    const insertAfter = 'section: "קובי AI" },';
    if (!layoutContent.includes(`href: "${pagePath}"`)) {
      const idx = layoutContent.indexOf(insertAfter);
      if (idx > -1) {
        const endIdx = idx + insertAfter.length;
        layoutContent = layoutContent.slice(0, endIdx) + "\n" + menuItem + layoutContent.slice(endIdx);
      }
    }
    writeFileSync(layoutPath, layoutContent, "utf-8");
  }

  const results = [`✅ דף נוצר: ${filePath}`, `✅ Route נרשם: ${pagePath}`, section ? `✅ תפריט עודכן: ${title} (${section})` : ""].filter(Boolean);
  return { result: results.join("\n") };
}

async function createApiRoute(input: any): Promise<{ result: string }> {
  const { route_prefix, file_name, table_name, endpoints } = input;
  const prefix = route_prefix.startsWith("/") ? route_prefix : `/${route_prefix}`;

  let routeContent = `import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();
`;

  if (table_name) {
    routeContent += `
router.get("${prefix}", async (_req, res) => {
  const result = await pool.query("SELECT * FROM ${table_name} ORDER BY id DESC LIMIT 200");
  res.json(result.rows);
});

router.get("${prefix}/:id", async (req, res) => {
  const id = String(req.params.id);
  const result = await pool.query("SELECT * FROM ${table_name} WHERE id = $1", [id]);
  if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא" }); return; }
  res.json(result.rows[0]);
});

router.post("${prefix}", async (req, res) => {
  const data = req.body;
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = keys.map((_, i) => \`$\${i + 1}\`).join(", ");
  const result = await pool.query(\`INSERT INTO ${table_name} (\${keys.join(", ")}) VALUES (\${placeholders}) RETURNING *\`, vals);
  res.status(201).json(result.rows[0]);
});

router.put("${prefix}/:id", async (req, res) => {
  const id = String(req.params.id);
  const data = req.body;
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const sets = keys.map((k, i) => \`\${k} = $\${i + 1}\`).join(", ");
  vals.push(id);
  const result = await pool.query(\`UPDATE ${table_name} SET \${sets} WHERE id = $\${vals.length} RETURNING *\`, vals);
  res.json(result.rows[0]);
});

router.delete("${prefix}/:id", async (req, res) => {
  const id = String(req.params.id);
  await pool.query("DELETE FROM ${table_name} WHERE id = $1", [id]);
  res.json({ success: true });
});
`;
  }

  if (endpoints && endpoints.length > 0) {
    for (const ep of endpoints) {
      routeContent += `
router.${ep.method || "get"}("${prefix}${ep.path || ""}", async (req, res) => {
  // ${ep.description || "TODO"}
  res.json({ message: "${ep.description || "OK"}" });
});
`;
    }
  }

  routeContent += `\nexport default router;\n`;

  const routePath = `artifacts/api-server/src/routes/${file_name}.ts`;
  writeFileSync(safePath(routePath), routeContent, "utf-8");

  const indexPath = safePath("artifacts/api-server/src/routes/index.ts");
  let indexContent = readFileSync(indexPath, "utf-8");
  const camelName = file_name.replace(/-([a-z])/g, (_: any, c: string) => c.toUpperCase()) + "Router";
  const importLine = `import ${camelName} from "./${file_name}";`;
  const useLine = `router.use(${camelName});`;

  if (!indexContent.includes(importLine)) {
    const lastImport = indexContent.lastIndexOf("import ");
    const nextNl = indexContent.indexOf("\n", lastImport);
    indexContent = indexContent.slice(0, nextNl + 1) + importLine + "\n" + indexContent.slice(nextNl + 1);
  }
  if (!indexContent.includes(useLine)) {
    const exportIdx = indexContent.indexOf("export default");
    indexContent = indexContent.slice(0, exportIdx) + useLine + "\n\n" + indexContent.slice(exportIdx);
  }
  writeFileSync(indexPath, indexContent, "utf-8");

  return { result: `✅ Route נוצר: ${routePath}\n✅ נרשם ב-index.ts: ${prefix}\n✅ ${table_name ? "CRUD מלא" : (endpoints?.length || 0) + " endpoints"}` };
}

async function createTable(input: any): Promise<{ result: string }> {
  const { table_name, columns, indexes } = input;
  if (!table_name || !columns?.length) throw new Error("table_name + columns נדרשים");

  const existing = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [table_name]);
  if (existing.rows.length > 0) throw new Error(`טבלה ${table_name} כבר קיימת`);

  const colDefs = columns.map((c: any) => {
    let def = `${c.name} ${c.type || "TEXT"}`;
    if (c.primary_key) def += " PRIMARY KEY";
    if (c.nullable === false && !c.primary_key) def += " NOT NULL";
    if (c.default_value !== undefined) def += ` DEFAULT ${c.default_value}`;
    if (c.references) def += ` REFERENCES ${c.references}`;
    return def;
  });

  const sql = `CREATE TABLE ${table_name} (\n  ${colDefs.join(",\n  ")}\n);`;
  await pool.query(sql);

  if (indexes?.length) {
    for (const idx of indexes) {
      const idxName = `idx_${table_name}_${idx.replace(/,\s*/g, "_")}`;
      await pool.query(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${table_name} (${idx})`);
    }
  }

  return { result: `✅ טבלה ${table_name} נוצרה עם ${columns.length} עמודות${indexes?.length ? ` + ${indexes.length} אינדקסים` : ""}` };
}

async function dataOperations(input: any): Promise<{ result: string }> {
  const { action, table_name } = input;
  switch (action) {
    case "count_rows": {
      if (!table_name) throw new Error("table_name נדרש");
      const r = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      return { result: `📊 ${table_name}: ${r.rows[0].cnt} רשומות` };
    }
    case "table_stats": {
      if (!table_name) throw new Error("table_name נדרש");
      const cols = await pool.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [table_name]);
      const count = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      return { result: `📊 **${table_name}** — ${count.rows[0].cnt} רשומות, ${cols.rows.length} עמודות:\n${cols.rows.map((c: any) => `  ${c.column_name}: ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? ` DEFAULT ${c.column_default}` : ""}`).join("\n")}` };
    }
    case "sample_data": {
      if (!table_name) throw new Error("table_name נדרש");
      const limit = input.limit || 5;
      const r = await pool.query(`SELECT * FROM ${table_name} LIMIT ${limit}`);
      if (r.rows.length === 0) return { result: `${table_name}: טבלה ריקה` };
      return { result: `📊 ${table_name} (${r.rows.length} דוגמאות):\n${JSON.stringify(r.rows, null, 2).slice(0, 4000)}` };
    }
    case "bulk_insert": {
      if (!table_name || !input.data?.length) throw new Error("table_name + data נדרשים");
      const data = input.data;
      const keys = Object.keys(data[0]);
      let inserted = 0;
      for (const row of data) {
        const vals = keys.map(k => row[k]);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        await pool.query(`INSERT INTO ${table_name} (${keys.join(", ")}) VALUES (${placeholders})`, vals);
        inserted++;
      }
      return { result: `✅ ${inserted} רשומות הוכנסו ל-${table_name}` };
    }
    case "seed_data": {
      if (!table_name) throw new Error("table_name נדרש");
      const count = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      return { result: `${table_name} contains ${count.rows[0].cnt} rows. Use bulk_insert to add data.` };
    }
    case "truncate": {
      if (!table_name) throw new Error("table_name נדרש");
      await pool.query(`TRUNCATE TABLE ${table_name} RESTART IDENTITY CASCADE`);
      return { result: `✅ ${table_name} נוקה (TRUNCATE)` };
    }
    default:
      return { result: `פעולה ${action} לא ממומשת` };
  }
}

function analyzeCode(input: any): { result: string } {
  const { action, path, pattern } = input;
  switch (action) {
    case "typescript_check": {
      const target = path || "artifacts/api-server";
      try {
        const output = execSync(`cd ${safePath(target)} && npx tsc --noEmit 2>&1 | head -50`, { timeout: 30000, maxBuffer: 300000 }).toString();
        return { result: output || "✅ אין שגיאות TypeScript" };
      } catch (e: any) {
        return { result: e.stdout?.toString?.()?.slice(0, 4000) || e.message };
      }
    }
    case "find_errors": {
      try {
        const searchPath = path ? safePath(path) : ROOT;
        const output = execSync(`rg -n "console\\.error|throw new Error|catch\\s*\\(" --glob '*.ts' --glob '*.tsx' '${searchPath}' 2>/dev/null | head -30`, { timeout: 10000 }).toString();
        return { result: output.replace(new RegExp(ROOT + "/", "g"), "") || "לא נמצאו שגיאות" };
      } catch { return { result: "לא נמצאו שגיאות" }; }
    }
    case "find_duplicates": {
      try {
        const searchPath = path ? safePath(path) : ROOT;
        const output = execSync(`rg -c "${pattern || "function"}" --glob '*.ts' --glob '*.tsx' '${searchPath}' 2>/dev/null | sort -t: -k2 -nr | head -20`, { timeout: 10000 }).toString();
        return { result: output.replace(new RegExp(ROOT + "/", "g"), "") || "לא נמצאו כפילויות" };
      } catch { return { result: "לא נמצאו כפילויות" }; }
    }
    case "count_lines": {
      const target = path || ".";
      try {
        const output = execSync(`find ${safePath(target)} -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | tail -1`, { timeout: 10000 }).toString();
        return { result: `📊 סה"כ שורות קוד: ${output.trim()}` };
      } catch { return { result: "לא ניתן לספור" }; }
    }
    case "find_todos": {
      try {
        const searchPath = path ? safePath(path) : ROOT;
        const output = execSync(`rg -n "TODO|FIXME|HACK|XXX" --glob '*.ts' --glob '*.tsx' '${searchPath}' 2>/dev/null | head -30`, { timeout: 10000 }).toString();
        return { result: output.replace(new RegExp(ROOT + "/", "g"), "") || "לא נמצאו TODO" };
      } catch { return { result: "לא נמצאו TODO" }; }
    }
    case "check_imports": {
      try {
        const searchPath = path ? safePath(path) : ROOT;
        const output = execSync(`rg -n "from ['\"]\\.\\./" --glob '*.ts' --glob '*.tsx' '${searchPath}' 2>/dev/null | head -30`, { timeout: 10000 }).toString();
        return { result: output.replace(new RegExp(ROOT + "/", "g"), "") || "אין imports יחסיים" };
      } catch { return { result: "אין imports יחסיים" }; }
    }
    default:
      return { result: `ניתוח ${action} לא ממומש` };
  }
}

async function apiTest(input: any): Promise<{ result: string }> {
  const { method, path, body, headers: customHeaders } = input;
  const selfPort = process.env.PORT || "8080";
  const url = `http://localhost:${selfPort}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const token = await getAuthToken();
    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    };

    const start = Date.now();
    const response = await fetch(url, {
      method: method || "GET",
      headers: fetchHeaders,
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const latency = Date.now() - start;
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    const preview = typeof parsed === "object" ? JSON.stringify(parsed, null, 2).slice(0, 3000) : String(parsed).slice(0, 3000);
    return { result: `${response.status} ${response.statusText} (${latency}ms)\n${preview}` };
  } catch (e: any) {
    return { result: `❌ ${e.message}` };
  }
}

async function addField(input: { table: string; field_name: string; field_type: string; nullable?: boolean; default_value?: string }): Promise<{ result: string }> {
  const { table, field_name, field_type, nullable, default_value } = input;
  if (!table || !field_name || !field_type) throw new Error("table, field_name, field_type נדרשים");

  const existing = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [table, field_name]
  );
  if (existing.rows.length > 0) return { result: `⚠️ עמודה ${field_name} כבר קיימת ב-${table}` };

  let ddl = `ALTER TABLE ${table} ADD COLUMN ${field_name} ${field_type}`;
  if (nullable === false) ddl += " NOT NULL";
  if (default_value !== undefined) ddl += ` DEFAULT ${default_value}`;

  await pool.query(ddl);
  return { result: `✅ עמודה ${field_name} (${field_type}) נוספה ל-${table}` };
}

async function streamData(input: { source_query: string; target_table: string; transform?: string; batch_size?: number }): Promise<{ result: string }> {
  const { source_query, target_table, transform, batch_size } = input;
  if (!source_query || !target_table) throw new Error("source_query + target_table נדרשים");

  const clean = source_query.trim().toUpperCase();
  if (!clean.startsWith("SELECT") && !clean.startsWith("WITH")) throw new Error("source_query חייב להתחיל ב-SELECT");

  const sourceResult = await pool.query(source_query);
  let rows = sourceResult.rows;

  if (rows.length === 0) return { result: "אין שורות להעברה" };

  if (transform) {
    try {
      const fn = new Function("row", `return (${transform})(row)`);
      rows = rows.map((row: any) => fn(row));
    } catch (e: any) {
      return { result: `❌ שגיאה בטרנספורמציה: ${e.message}` };
    }
  }

  const BATCH = batch_size || 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cols = Object.keys(batch[0]);
    for (const row of batch) {
      const vals = cols.map(c => row[c]);
      const placeholders = cols.map((_, j) => `$${j + 1}`).join(", ");
      try {
        await pool.query(`INSERT INTO ${target_table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
        inserted++;
      } catch {}
    }
  }

  return { result: `✅ הועברו ${inserted}/${rows.length} שורות → ${target_table}` };
}

async function dbSchema(input: { table?: string; details?: boolean; session_id?: string }): Promise<{ result: string }> {
  const sessionKey = input.session_id
    ? `sess:${input.session_id}:${input.table || "all"}`
    : null;

  if (sessionKey) {
    const sessEntry = sessionSchemaCache.get(sessionKey);
    if (sessEntry && (Date.now() - sessEntry.setAt) < SESSION_SCHEMA_CACHE_TTL_MS) {
      console.log(`[KobiCache] db_schema session-cache hit: ${sessionKey}`);
      return { result: `[session-cache] ${sessEntry.result}` };
    }
  }

  const cached = getSchemaFromCache(input.table);
  if (cached) {
    console.log(`[KobiCache] db_schema cache hit: ${input.table || "all"}`);
    return { result: `[cache] ${cached}` };
  }

  if (input.table) {
    const cols = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
      [input.table]
    );
    if (cols.rows.length === 0) return { result: `טבלה ${input.table} לא נמצאה` };

    const count = await pool.query(`SELECT count(*) as cnt FROM ${input.table}`);
    const indexes = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`,
      [input.table]
    );
    const fks = await pool.query(
      `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
      [input.table]
    );

    let output = `📋 **${input.table}** — ${count.rows[0].cnt} רשומות, ${cols.rows.length} עמודות\n\n`;
    output += cols.rows.map((c: any) => {
      let type = c.data_type;
      if (c.character_maximum_length) type += `(${c.character_maximum_length})`;
      return `  ${c.column_name}: ${type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? ` DEFAULT ${c.column_default}` : ""}`;
    }).join("\n");

    if (indexes.rows.length > 0) {
      output += `\n\n📇 אינדקסים:\n${indexes.rows.map((i: any) => `  ${i.indexname}`).join("\n")}`;
    }
    if (fks.rows.length > 0) {
      output += `\n\n🔗 מפתחות זרים:\n${fks.rows.map((f: any) => `  ${f.column_name} → ${f.foreign_table}(${f.foreign_column})`).join("\n")}`;
    }

    setSchemaCache(input.table, output);
    if (sessionKey) sessionSchemaCache.set(sessionKey, { result: output, setAt: Date.now() });
    return { result: output };
  }

  const tables = await pool.query(
    `SELECT t.table_name,
      (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as columns
     FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name`
  );

  const output = `📋 **${tables.rows.length} טבלאות**:\n${tables.rows.map((t: any) => `  ${t.table_name} (${t.columns} עמודות)`).join("\n")}`;
  setSchemaCache(undefined, output);
  if (sessionKey) sessionSchemaCache.set(sessionKey, { result: output, setAt: Date.now() });
  return { result: output };
}

async function saveMemoryTool(input: { category: string; key: string; value: string; importance?: number }): Promise<{ result: string }> {
  if (!_saveMemoryContext) {
    return { result: "⚠️ שמירת זיכרון לא זמינה — אין הקשר משתמש" };
  }
  await saveMemory(
    _saveMemoryContext.userId,
    input.category,
    input.key,
    input.value,
    input.importance || 7,
    _saveMemoryContext.sessionId
  );
  return { result: `✅ זיכרון נשמר: [${input.category}] ${input.key} = ${input.value}` };
}

async function taskQueue(input: { action: string; title?: string; description?: string; task_id?: number; progress?: number; result?: string }): Promise<{ result: string }> {
  const { action, title, description, task_id, progress, result: taskResult } = input;

  switch (action) {
    case "create": {
      if (!title) throw new Error("title נדרש");
      const r = await pool.query(
        "INSERT INTO kobi_tasks (title, description, status, progress) VALUES ($1, $2, 'pending', 0) RETURNING id, title",
        [title, description || ""]
      );
      return { result: `✅ משימה נוצרה: [${r.rows[0].id}] ${r.rows[0].title}` };
    }
    case "start": {
      if (!task_id) throw new Error("task_id נדרש");
      await pool.query("UPDATE kobi_tasks SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1", [task_id]);
      return { result: `🚀 משימה ${task_id} התחילה` };
    }
    case "update_progress": {
      if (!task_id) throw new Error("task_id נדרש");
      await pool.query("UPDATE kobi_tasks SET progress = $1, updated_at = NOW() WHERE id = $2", [progress || 0, task_id]);
      return { result: `📊 משימה ${task_id}: ${progress}%` };
    }
    case "complete": {
      if (!task_id) throw new Error("task_id נדרש");
      await pool.query(
        "UPDATE kobi_tasks SET status = 'completed', progress = 100, result = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2",
        [taskResult || "הושלם", task_id]
      );
      return { result: `✅ משימה ${task_id} הושלמה` };
    }
    case "fail": {
      if (!task_id) throw new Error("task_id נדרש");
      await pool.query(
        "UPDATE kobi_tasks SET status = 'failed', result = $1, updated_at = NOW() WHERE id = $2",
        [taskResult || "נכשל", task_id]
      );
      return { result: `❌ משימה ${task_id} נכשלה: ${taskResult}` };
    }
    case "list": {
      const r = await pool.query("SELECT id, title, status, progress, created_at FROM kobi_tasks ORDER BY created_at DESC LIMIT 20");
      if (r.rows.length === 0) return { result: "אין משימות" };
      return { result: `📋 ${r.rows.length} משימות:\n${r.rows.map((t: any) => `  [${t.id}] ${t.status === "completed" ? "✅" : t.status === "running" ? "🚀" : t.status === "failed" ? "❌" : "⏳"} ${t.title} (${t.progress}%)`).join("\n")}` };
    }
    default:
      return { result: `פעולת task queue ${action} לא ממומשת` };
  }
}

async function erpQuery(input: { domain: string; action: string; filters?: any; limit?: number; id?: number }): Promise<{ result: string }> {
  const { domain, action, filters, limit: queryLimit, id } = input;
  const lim = queryLimit || 20;

  const domainQueries: Record<string, Record<string, string>> = {
    customers: {
      list: `SELECT c.id, c.name, c.customer_number, c.phone, c.email, c.city, c.is_active, c.credit_limit_cents, c.balance_cents FROM customers c WHERE c.is_active = true ORDER BY c.name LIMIT ${lim}`,
      search: `SELECT id, name, customer_number, phone, email, city, balance_cents FROM customers WHERE (name ILIKE $1 OR customer_number ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) LIMIT ${lim}`,
      get: `SELECT * FROM customers WHERE id = $1`,
      stats: `SELECT count(*) as total, count(*) FILTER (WHERE is_active) as active, coalesce(sum(balance_cents),0) as total_balance, coalesce(avg(balance_cents),0) as avg_balance FROM customers`,
      top_debtors: `SELECT id, name, balance_cents FROM customers WHERE balance_cents > 0 ORDER BY balance_cents DESC LIMIT ${lim}`,
    },
    orders: {
      list: `SELECT so.id, so.order_number, c.name as customer, so.status, so.total_amount_cents, so.order_date FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id ORDER BY so.order_date DESC LIMIT ${lim}`,
      by_status: `SELECT status, count(*) as cnt, coalesce(sum(total_amount_cents),0) as total FROM sales_orders GROUP BY status ORDER BY cnt DESC`,
      get: `SELECT so.*, c.name as customer_name FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id WHERE so.id = $1`,
      recent: `SELECT so.id, so.order_number, c.name as customer, so.status, so.total_amount_cents, so.order_date FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id ORDER BY so.created_at DESC LIMIT ${lim}`,
      items: `SELECT soi.*, p.name as product_name FROM sales_order_items soi LEFT JOIN products p ON soi.product_id = p.id WHERE soi.sales_order_id = $1`,
    },
    products: {
      list: `SELECT id, name, sku, category, unit_price_cents, stock_quantity, is_active FROM products WHERE is_active = true ORDER BY name LIMIT ${lim}`,
      search: `SELECT id, name, sku, category, unit_price_cents, stock_quantity FROM products WHERE (name ILIKE $1 OR sku ILIKE $1) LIMIT ${lim}`,
      get: `SELECT * FROM products WHERE id = $1`,
      low_stock: `SELECT id, name, sku, stock_quantity, min_stock_level FROM products WHERE stock_quantity <= coalesce(min_stock_level, 5) AND is_active = true ORDER BY stock_quantity LIMIT ${lim}`,
      stats: `SELECT count(*) as total, count(*) FILTER (WHERE is_active) as active, coalesce(sum(stock_quantity),0) as total_stock, count(*) FILTER (WHERE stock_quantity <= coalesce(min_stock_level, 5) AND is_active) as low_stock FROM products`,
    },
    suppliers: {
      list: `SELECT id, name, supplier_number, phone, email, city, is_active FROM suppliers WHERE is_active = true ORDER BY name LIMIT ${lim}`,
      search: `SELECT id, name, supplier_number, phone, email FROM suppliers WHERE (name ILIKE $1 OR supplier_number ILIKE $1) LIMIT ${lim}`,
      get: `SELECT * FROM suppliers WHERE id = $1`,
    },
    employees: {
      list: `SELECT e.id, e.first_name, e.last_name, e.employee_number, d.name as department, e.job_title, e.is_active FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.is_active = true ORDER BY e.last_name LIMIT ${lim}`,
      search: `SELECT e.id, e.first_name, e.last_name, e.employee_number, e.job_title FROM employees e WHERE (e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.employee_number ILIKE $1) LIMIT ${lim}`,
      get: `SELECT e.*, d.name as department_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = $1`,
      stats: `SELECT count(*) as total, count(*) FILTER (WHERE is_active) as active FROM employees`,
      by_department: `SELECT d.name as department, count(*) as cnt FROM employees e JOIN departments d ON e.department_id = d.id WHERE e.is_active = true GROUP BY d.name ORDER BY cnt DESC`,
    },
    invoices: {
      list: `SELECT ci.id, ci.invoice_number, c.name as customer, ci.status, ci.total_amount_cents, ci.invoice_date, ci.due_date FROM customer_invoices ci LEFT JOIN customers c ON ci.customer_id = c.id ORDER BY ci.invoice_date DESC LIMIT ${lim}`,
      overdue: `SELECT ci.id, ci.invoice_number, c.name as customer, ci.total_amount_cents, ci.due_date FROM customer_invoices ci LEFT JOIN customers c ON ci.customer_id = c.id WHERE ci.status != 'paid' AND ci.due_date < NOW() ORDER BY ci.due_date LIMIT ${lim}`,
      get: `SELECT ci.*, c.name as customer_name FROM customer_invoices ci LEFT JOIN customers c ON ci.customer_id = c.id WHERE ci.id = $1`,
      stats: `SELECT status, count(*) as cnt, coalesce(sum(total_amount_cents),0) as total FROM customer_invoices GROUP BY status`,
    },
    purchase_orders: {
      list: `SELECT po.id, po.order_number, s.name as supplier, po.status, po.total_amount_cents, po.order_date FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id ORDER BY po.order_date DESC LIMIT ${lim}`,
      get: `SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = $1`,
    },
    production: {
      list: `SELECT id, work_order_number, product_name, status, quantity, start_date, end_date FROM production_work_orders ORDER BY created_at DESC LIMIT ${lim}`,
      active: `SELECT id, work_order_number, product_name, status, quantity, start_date FROM production_work_orders WHERE status IN ('in_progress', 'pending', 'planned') ORDER BY start_date LIMIT ${lim}`,
      get: `SELECT * FROM production_work_orders WHERE id = $1`,
    },
    crm: {
      leads: `SELECT id, company_name, contact_name, status, source, estimated_value_cents, created_at FROM crm_leads ORDER BY created_at DESC LIMIT ${lim}`,
      opportunities: `SELECT id, title, stage, probability, expected_revenue_cents, expected_close_date FROM crm_opportunities ORDER BY expected_close_date LIMIT ${lim}`,
      pipeline: `SELECT stage, count(*) as cnt, coalesce(sum(expected_revenue_cents),0) as total_value FROM crm_opportunities GROUP BY stage ORDER BY total_value DESC`,
    },
  };

  const domainQ = domainQueries[domain];
  if (!domainQ) {
    const available = Object.keys(domainQueries).join(", ");
    return { result: `תחום "${domain}" לא מוכר. תחומים זמינים: ${available}` };
  }

  const queryKey = action || "list";
  const sql = domainQ[queryKey];
  if (!sql) {
    const available = Object.keys(domainQ).join(", ");
    return { result: `פעולה "${queryKey}" לא זמינה ל-${domain}. פעולות: ${available}` };
  }

  try {
    let params: any[] = [];
    if (queryKey === "search" && filters?.search) {
      params = [`%${filters.search}%`];
    } else if (queryKey === "get" || queryKey === "items") {
      params = [id];
    }
    const result = await pool.query(sql, params);
    if (result.rows.length === 0) return { result: `אין תוצאות ב-${domain}/${queryKey}` };

    const headers = Object.keys(result.rows[0]);
    const table = [
      headers.join(" | "),
      headers.map(() => "---").join(" | "),
      ...result.rows.slice(0, 30).map((r: any) => headers.map(h => {
        const v = r[h];
        if (v === null) return "-";
        if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
        const s = String(v);
        if (h.endsWith("_cents")) return `${(Number(v) / 100).toLocaleString("he-IL")} ₪`;
        return s.slice(0, 50);
      }).join(" | ")),
    ].join("\n");

    return { result: `📊 **${domain}/${queryKey}** (${result.rows.length} תוצאות):\n${table}` };
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      return { result: `⚠️ טבלה של ${domain} לא קיימת עדיין. צור אותה עם create_table.` };
    }
    return { result: `❌ שגיאה: ${e.message}` };
  }
}

async function financialCalc(input: { action: string; amount_cents?: number; rate?: number; months?: number; table_name?: string; date_from?: string; date_to?: string }): Promise<{ result: string }> {
  const { action, amount_cents, rate, months, date_from, date_to } = input;

  switch (action) {
    case "vat_calc": {
      if (!amount_cents) throw new Error("amount_cents נדרש");
      const vat = Math.round(amount_cents * VAT_RATE);
      const total = amount_cents + vat;
      const amtNis = (amount_cents / 100).toLocaleString("he-IL");
      const vatNis = (vat / 100).toLocaleString("he-IL");
      const totalNis = (total / 100).toLocaleString("he-IL");
      return { result: `🧮 **חישוב מע"מ 17%**:\nסכום: ${amtNis} ₪\nמע"מ: ${vatNis} ₪\nסה"כ כולל מע"מ: ${totalNis} ₪` };
    }
    case "vat_extract": {
      if (!amount_cents) throw new Error("amount_cents נדרש");
      const base = Math.round(amount_cents / (1 + VAT_RATE));
      const vat = amount_cents - base;
      return { result: `🧮 **הפרדת מע"מ**:\nסה"כ כולל: ${(amount_cents / 100).toLocaleString("he-IL")} ₪\nבסיס: ${(base / 100).toLocaleString("he-IL")} ₪\nמע"מ: ${(vat / 100).toLocaleString("he-IL")} ₪` };
    }
    case "currency_convert": {
      if (!amount_cents) throw new Error("amount_cents נדרש");
      const exchangeRate = rate || 3.6;
      const converted = Math.round(amount_cents / exchangeRate);
      return { result: `💱 ${(amount_cents / 100).toLocaleString("he-IL")} ₪ = ${(converted / 100).toLocaleString("en-US")} $ (שער ${exchangeRate})` };
    }
    case "margin_calc": {
      if (!amount_cents || !rate) throw new Error("amount_cents (מחיר מכירה) + rate (עלות %) נדרשים");
      const costCents = Math.round(amount_cents * (rate / 100));
      const profitCents = amount_cents - costCents;
      const marginPct = ((profitCents / amount_cents) * 100).toFixed(1);
      return { result: `📊 **ניתוח רווחיות**:\nמחיר מכירה: ${(amount_cents / 100).toLocaleString("he-IL")} ₪\nעלות: ${(costCents / 100).toLocaleString("he-IL")} ₪\nרווח גולמי: ${(profitCents / 100).toLocaleString("he-IL")} ₪ (${marginPct}%)` };
    }
    case "loan_calc": {
      if (!amount_cents || !rate || !months) throw new Error("amount_cents, rate (שנתי %), months נדרשים");
      const monthlyRate = (rate / 100) / 12;
      const payment = Math.round(amount_cents * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1));
      const totalPayment = payment * months;
      const totalInterest = totalPayment - amount_cents;
      return { result: `🏦 **חישוב הלוואה**:\nסכום: ${(amount_cents / 100).toLocaleString("he-IL")} ₪\nריבית: ${rate}% שנתי\nתקופה: ${months} חודשים\nהחזר חודשי: ${(payment / 100).toLocaleString("he-IL")} ₪\nסה"כ ריבית: ${(totalInterest / 100).toLocaleString("he-IL")} ₪\nסה"כ לתשלום: ${(totalPayment / 100).toLocaleString("he-IL")} ₪` };
    }
    case "aging_report": {
      try {
        const r = await pool.query(`
          SELECT 
            count(*) FILTER (WHERE due_date >= NOW()) as current_cnt,
            coalesce(sum(total_amount_cents) FILTER (WHERE due_date >= NOW()), 0) as current_amount,
            count(*) FILTER (WHERE due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days') as overdue_30,
            coalesce(sum(total_amount_cents) FILTER (WHERE due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days'), 0) as overdue_30_amount,
            count(*) FILTER (WHERE due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days') as overdue_60,
            coalesce(sum(total_amount_cents) FILTER (WHERE due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days'), 0) as overdue_60_amount,
            count(*) FILTER (WHERE due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days') as overdue_90,
            coalesce(sum(total_amount_cents) FILTER (WHERE due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days'), 0) as overdue_90_amount,
            count(*) FILTER (WHERE due_date < NOW() - INTERVAL '90 days') as overdue_90plus,
            coalesce(sum(total_amount_cents) FILTER (WHERE due_date < NOW() - INTERVAL '90 days'), 0) as overdue_90plus_amount
          FROM customer_invoices WHERE status != 'paid'
        `);
        const d = r.rows[0];
        const fmt = (c: number) => (c / 100).toLocaleString("he-IL");
        return { result: `📊 **דוח גיול חובות**:\n\n| תקופה | חשבוניות | סכום |\n|---|---|---|\n| שוטף | ${d.current_cnt} | ${fmt(d.current_amount)} ₪ |\n| 1-30 ימים | ${d.overdue_30} | ${fmt(d.overdue_30_amount)} ₪ |\n| 31-60 ימים | ${d.overdue_60} | ${fmt(d.overdue_60_amount)} ₪ |\n| 61-90 ימים | ${d.overdue_90} | ${fmt(d.overdue_90_amount)} ₪ |\n| 90+ ימים | ${d.overdue_90plus} | ${fmt(d.overdue_90plus_amount)} ₪ |` };
      } catch (e: any) {
        return { result: `⚠️ דוח גיול: ${e.message}` };
      }
    }
    case "revenue_summary": {
      try {
        const from = date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
        const to = date_to || new Date().toISOString().slice(0, 10);
        const r = await pool.query(`
          SELECT 
            to_char(date_trunc('month', order_date), 'YYYY-MM') as month,
            count(*) as orders,
            coalesce(sum(total_amount_cents), 0) as revenue
          FROM sales_orders 
          WHERE order_date BETWEEN $1 AND $2
          GROUP BY date_trunc('month', order_date) 
          ORDER BY month
        `, [from, to]);
        if (r.rows.length === 0) return { result: "אין נתוני הכנסות בתקופה" };
        const fmt = (c: number) => (c / 100).toLocaleString("he-IL");
        const total = r.rows.reduce((s: number, row: any) => s + Number(row.revenue), 0);
        let output = `📊 **סיכום הכנסות ${from} עד ${to}**:\n\n| חודש | הזמנות | הכנסה |\n|---|---|---|\n`;
        output += r.rows.map((row: any) => `| ${row.month} | ${row.orders} | ${fmt(row.revenue)} ₪ |`).join("\n");
        output += `\n\n**סה"כ: ${fmt(total)} ₪**`;
        return { result: output };
      } catch (e: any) {
        return { result: `⚠️ סיכום הכנסות: ${e.message}` };
      }
    }
    case "expense_summary": {
      try {
        const from = date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
        const to = date_to || new Date().toISOString().slice(0, 10);
        const r = await pool.query(`
          SELECT 
            to_char(date_trunc('month', order_date), 'YYYY-MM') as month,
            count(*) as orders,
            coalesce(sum(total_amount_cents), 0) as expenses
          FROM purchase_orders 
          WHERE order_date BETWEEN $1 AND $2
          GROUP BY date_trunc('month', order_date) 
          ORDER BY month
        `, [from, to]);
        if (r.rows.length === 0) return { result: "אין נתוני הוצאות בתקופה" };
        const fmt = (c: number) => (c / 100).toLocaleString("he-IL");
        const total = r.rows.reduce((s: number, row: any) => s + Number(row.expenses), 0);
        let output = `📊 **סיכום הוצאות ${from} עד ${to}**:\n\n| חודש | הזמנות | הוצאה |\n|---|---|---|\n`;
        output += r.rows.map((row: any) => `| ${row.month} | ${row.orders} | ${fmt(row.expenses)} ₪ |`).join("\n");
        output += `\n\n**סה"כ: ${fmt(total)} ₪**`;
        return { result: output };
      } catch (e: any) {
        return { result: `⚠️ סיכום הוצאות: ${e.message}` };
      }
    }
    default:
      return { result: `חישוב "${action}" לא מוכר. פעולות: vat_calc, vat_extract, currency_convert, margin_calc, loan_calc, aging_report, revenue_summary, expense_summary` };
  }
}

async function userManagement(input: { action: string; user_id?: number; data?: any; search?: string }): Promise<{ result: string }> {
  const { action, user_id, data, search } = input;

  switch (action) {
    case "list": {
      const r = await pool.query("SELECT id, username, full_name, full_name_he, email, department, job_title, is_active, role, last_login FROM users ORDER BY id LIMIT 100");
      return { result: `👥 ${r.rows.length} משתמשים:\n${r.rows.map((u: any) => `  [${u.id}] ${u.full_name_he || u.full_name || u.username} — ${u.department || "-"} ${u.is_active ? "✅" : "❌"} (${u.role || "user"})`).join("\n")}` };
    }
    case "search": {
      if (!search) throw new Error("search נדרש");
      const r = await pool.query("SELECT id, username, full_name, full_name_he, email, department, job_title, is_active FROM users WHERE username ILIKE $1 OR full_name ILIKE $1 OR full_name_he ILIKE $1 OR email ILIKE $1 LIMIT 20", [`%${search}%`]);
      return { result: `${r.rows.length} תוצאות:\n${r.rows.map((u: any) => `  [${u.id}] ${u.full_name_he || u.username} — ${u.email || ""} (${u.department || ""})`).join("\n")}` };
    }
    case "get": {
      if (!user_id) throw new Error("user_id נדרש");
      const r = await pool.query("SELECT * FROM users WHERE id = $1", [user_id]);
      if (r.rows.length === 0) return { result: `משתמש ${user_id} לא נמצא` };
      const u = r.rows[0];
      return { result: `👤 **${u.full_name_he || u.username}**\nID: ${u.id}\nשם: ${u.full_name}\nאימייל: ${u.email || "-"}\nמחלקה: ${u.department || "-"}\nתפקיד: ${u.job_title || "-"}\nהרשאה: ${u.role || "user"}\nפעיל: ${u.is_active ? "כן" : "לא"}\nכניסה אחרונה: ${u.last_login || "אף פעם"}` };
    }
    case "create": {
      if (!data?.username) throw new Error("data.username נדרש");
      const r = await pool.query(
        `INSERT INTO users (username, full_name, full_name_he, email, department, job_title, role, is_active, password_hash) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'pending') RETURNING id, username`,
        [data.username, data.full_name || data.username, data.full_name_he || "", data.email || "", data.department || "", data.job_title || "", data.role || "user"]
      );
      return { result: `✅ משתמש נוצר: [${r.rows[0].id}] ${r.rows[0].username}` };
    }
    case "update": {
      if (!user_id || !data) throw new Error("user_id + data נדרשים");
      const allowed = ["full_name", "full_name_he", "email", "department", "job_title", "role", "is_active"];
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(data)) {
        if (allowed.includes(k)) {
          sets.push(`${k} = $${idx++}`);
          vals.push(v);
        }
      }
      if (sets.length === 0) return { result: "אין שדות לעדכון" };
      vals.push(user_id);
      await pool.query(`UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${idx}`, vals);
      return { result: `✅ משתמש ${user_id} עודכן` };
    }
    case "deactivate": {
      if (!user_id) throw new Error("user_id נדרש");
      await pool.query("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1", [user_id]);
      return { result: `✅ משתמש ${user_id} הושבת` };
    }
    case "activate": {
      if (!user_id) throw new Error("user_id נדרש");
      await pool.query("UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1", [user_id]);
      return { result: `✅ משתמש ${user_id} הופעל` };
    }
    case "stats": {
      const r = await pool.query(`
        SELECT 
          count(*) as total,
          count(*) FILTER (WHERE is_active) as active,
          count(*) FILTER (WHERE NOT is_active) as inactive,
          count(DISTINCT department) FILTER (WHERE department IS NOT NULL AND department != '') as departments,
          count(DISTINCT role) FILTER (WHERE role IS NOT NULL) as roles
        FROM users
      `);
      const d = r.rows[0];
      return { result: `👥 **סטטיסטיקות משתמשים**:\nסה"כ: ${d.total}\nפעילים: ${d.active}\nלא פעילים: ${d.inactive}\nמחלקות: ${d.departments}\nתפקידי הרשאה: ${d.roles}` };
    }
    default:
      return { result: `פעולת משתמשים "${action}" לא מוכרת. פעולות: list, search, get, create, update, activate, deactivate, stats` };
  }
}

async function reportGenerator(input: { report_type: string; table_name?: string; group_by?: string; aggregate?: string; where?: string; order_by?: string; limit?: number }): Promise<{ result: string }> {
  const { report_type, table_name, group_by, aggregate, where, order_by, limit: reportLimit } = input;
  const lim = reportLimit || 50;

  switch (report_type) {
    case "group_summary": {
      if (!table_name || !group_by) throw new Error("table_name + group_by נדרשים");
      const aggCol = aggregate || "count(*) as count";
      const whereClause = where ? `WHERE ${where}` : "";
      const orderClause = order_by || `${group_by} ASC`;
      const r = await pool.query(`SELECT ${group_by}, ${aggCol} FROM ${table_name} ${whereClause} GROUP BY ${group_by} ORDER BY ${orderClause} LIMIT ${lim}`);
      if (r.rows.length === 0) return { result: "אין תוצאות" };
      const headers = Object.keys(r.rows[0]);
      const table = [headers.join(" | "), headers.map(() => "---").join(" | "), ...r.rows.map((row: any) => headers.map(h => formatReportVal(row[h], h)).join(" | "))].join("\n");
      return { result: `📊 **דוח קיבוץ — ${table_name}** (${r.rows.length} קבוצות):\n${table}` };
    }
    case "top_n": {
      if (!table_name || !order_by) throw new Error("table_name + order_by נדרשים");
      const cols = aggregate || "*";
      const whereClause = where ? `WHERE ${where}` : "";
      const r = await pool.query(`SELECT ${cols} FROM ${table_name} ${whereClause} ORDER BY ${order_by} DESC LIMIT ${lim}`);
      if (r.rows.length === 0) return { result: "אין תוצאות" };
      const headers = Object.keys(r.rows[0]);
      const table = [headers.join(" | "), headers.map(() => "---").join(" | "), ...r.rows.map((row: any) => headers.map(h => formatReportVal(row[h], h)).join(" | "))].join("\n");
      return { result: `📊 **טופ ${r.rows.length} — ${table_name}**:\n${table}` };
    }
    case "time_series": {
      if (!table_name || !group_by) throw new Error("table_name + group_by (date column) נדרשים");
      const aggCol = aggregate || "count(*) as count";
      const whereClause = where ? `WHERE ${where}` : "";
      const r = await pool.query(`SELECT to_char(date_trunc('month', ${group_by}), 'YYYY-MM') as period, ${aggCol} FROM ${table_name} ${whereClause} GROUP BY date_trunc('month', ${group_by}) ORDER BY period LIMIT ${lim}`);
      if (r.rows.length === 0) return { result: "אין נתוני זמן" };
      const headers = Object.keys(r.rows[0]);
      const table = [headers.join(" | "), headers.map(() => "---").join(" | "), ...r.rows.map((row: any) => headers.map(h => formatReportVal(row[h], h)).join(" | "))].join("\n");
      return { result: `📊 **מגמות זמן — ${table_name}**:\n${table}` };
    }
    case "cross_table": {
      if (!table_name) throw new Error("table_name נדרש");
      const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [table_name]);
      const count = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      const sample = await pool.query(`SELECT * FROM ${table_name} LIMIT 3`);
      let output = `📋 **${table_name}** — ${count.rows[0].cnt} רשומות, ${cols.rows.length} עמודות\n\n`;
      output += `**עמודות:**\n${cols.rows.map((c: any) => `  ${c.column_name}: ${c.data_type}`).join("\n")}\n\n`;
      if (sample.rows.length > 0) output += `**דוגמה:**\n${JSON.stringify(sample.rows[0], null, 2).slice(0, 1000)}`;
      return { result: output };
    }
    default:
      return { result: `סוג דוח "${report_type}" לא מוכר. סוגים: group_summary, top_n, time_series, cross_table` };
  }
}

function formatReportVal(v: any, header: string): string {
  if (v === null || v === undefined) return "-";
  if (header.endsWith("_cents")) return `${(Number(v) / 100).toLocaleString("he-IL")} ₪`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
  return String(v).slice(0, 50);
}

async function notificationSend(input: { action: string; user_id?: number; title?: string; message?: string; type?: string; priority?: string; all_users?: boolean; channel?: string; to?: string; subject?: string; template?: string }): Promise<{ result: string }> {
  const { action, user_id, title, message, type, priority, all_users, channel, to, subject, template } = input;

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title VARCHAR(255) NOT NULL,
      message TEXT DEFAULT '',
      type VARCHAR(50) DEFAULT 'info',
      priority VARCHAR(20) DEFAULT 'normal',
      channel VARCHAR(30) DEFAULT 'internal',
      recipient VARCHAR(255),
      status VARCHAR(30) DEFAULT 'sent',
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  } catch {}

  switch (action) {
    case "send": {
      if (!title) throw new Error("title נדרש");
      const ch = channel || "internal";

      if (ch === "email") {
        const recipient = to || "";
        if (!recipient) throw new Error("to (כתובת email) נדרש לערוץ email");
        await pool.query(
          "INSERT INTO notifications (user_id, title, message, type, priority, channel, recipient, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [user_id || null, subject || title, message || "", type || "email", priority || "normal", "email", recipient, "queued"]
        );
        return { result: `📧 Email בתור לשליחה ל-${recipient}: "${subject || title}"\n💡 הגדר SMTP_HOST, SMTP_USER, SMTP_PASS להפעלת שליחה בפועל` };
      }

      if (ch === "sms") {
        const recipient = to || "";
        if (!recipient) throw new Error("to (מספר טלפון) נדרש לערוץ SMS");
        await pool.query(
          "INSERT INTO notifications (user_id, title, message, type, priority, channel, recipient, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [user_id || null, title, message || "", type || "sms", priority || "normal", "sms", recipient, "queued"]
        );
        return { result: `📱 SMS בתור לשליחה ל-${recipient}: "${message || title}"\n💡 הגדר SMS_API_KEY להפעלת שליחה בפועל` };
      }

      if (ch === "whatsapp") {
        const recipient = to || "";
        if (!recipient) throw new Error("to (מספר WhatsApp) נדרש");
        await pool.query(
          "INSERT INTO notifications (user_id, title, message, type, priority, channel, recipient, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [user_id || null, title, message || "", type || "whatsapp", priority || "normal", "whatsapp", recipient, "queued"]
        );
        return { result: `💬 WhatsApp בתור לשליחה ל-${recipient}: "${message || title}"\n💡 הגדר WHATSAPP_API_TOKEN להפעלת שליחה בפועל` };
      }

      if (all_users) {
        const users = await pool.query("SELECT id FROM users WHERE is_active = true");
        for (const u of users.rows) {
          await pool.query("INSERT INTO notifications (user_id, title, message, type, priority, channel) VALUES ($1, $2, $3, $4, $5, $6)",
            [u.id, title, message || "", type || "info", priority || "normal", "internal"]);
        }
        return { result: `✅ התראה פנימית נשלחה ל-${users.rows.length} משתמשים: "${title}"` };
      }
      if (!user_id) throw new Error("user_id או all_users נדרש");
      await pool.query("INSERT INTO notifications (user_id, title, message, type, priority, channel) VALUES ($1, $2, $3, $4, $5, $6)",
        [user_id, title, message || "", type || "info", priority || "normal", "internal"]);
      return { result: `✅ התראה פנימית נשלחה למשתמש ${user_id}: "${title}"` };
    }
    case "list": {
      const uid = user_id || 1;
      const r = await pool.query("SELECT id, title, message, type, priority, channel, recipient, is_read, created_at FROM notifications WHERE user_id = $1 OR recipient IS NOT NULL ORDER BY created_at DESC LIMIT 20", [uid]);
      return { result: `🔔 ${r.rows.length} התראות:\n${r.rows.map((n: any) => {
        const chIcon = n.channel === "email" ? "📧" : n.channel === "sms" ? "📱" : n.channel === "whatsapp" ? "💬" : n.is_read ? "📭" : "📬";
        return `  [${n.id}] ${chIcon} ${n.title} (${n.channel || "internal"}/${n.priority})`;
      }).join("\n")}` };
    }
    case "mark_read": {
      if (user_id) {
        await pool.query("UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read", [user_id]);
        return { result: `✅ כל ההתראות סומנו כנקראו` };
      }
      return { result: "user_id נדרש" };
    }
    default:
      return { result: `פעולת התראות "${action}" לא מוכרת. פעולות: send, list, mark_read\nערוצים: internal, email, sms, whatsapp` };
  }
}

async function dataValidator(input: { action: string; table_name?: string; column?: string; fix?: boolean }): Promise<{ result: string }> {
  const { action, table_name, column, fix } = input;

  switch (action) {
    case "find_nulls": {
      if (!table_name || !column) throw new Error("table_name + column נדרשים");
      const r = await pool.query(`SELECT count(*) as cnt FROM ${table_name} WHERE ${column} IS NULL`);
      const total = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      return { result: `📊 ${table_name}.${column}: ${r.rows[0].cnt}/${total.rows[0].cnt} ערכי NULL (${((r.rows[0].cnt / Math.max(total.rows[0].cnt, 1)) * 100).toFixed(1)}%)` };
    }
    case "find_duplicates": {
      if (!table_name || !column) throw new Error("table_name + column נדרשים");
      const r = await pool.query(`SELECT ${column}, count(*) as cnt FROM ${table_name} WHERE ${column} IS NOT NULL GROUP BY ${column} HAVING count(*) > 1 ORDER BY cnt DESC LIMIT 20`);
      if (r.rows.length === 0) return { result: `✅ אין כפילויות ב-${table_name}.${column}` };
      return { result: `⚠️ ${r.rows.length} ערכים כפולים ב-${table_name}.${column}:\n${r.rows.map((d: any) => `  "${d[column]}" — ${d.cnt} פעמים`).join("\n")}` };
    }
    case "check_fk_integrity": {
      if (!table_name) throw new Error("table_name נדרש");
      const fks = await pool.query(`
        SELECT kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
      `, [table_name]);
      if (fks.rows.length === 0) return { result: `אין FK ב-${table_name}` };
      const problems: string[] = [];
      for (const fk of fks.rows) {
        const orphans = await pool.query(`
          SELECT count(*) as cnt FROM ${table_name} t 
          WHERE t.${fk.column_name} IS NOT NULL 
          AND NOT EXISTS (SELECT 1 FROM ${fk.ref_table} r WHERE r.${fk.ref_column} = t.${fk.column_name})
        `);
        if (Number(orphans.rows[0].cnt) > 0) {
          problems.push(`⚠️ ${fk.column_name} → ${fk.ref_table}: ${orphans.rows[0].cnt} רשומות יתומות`);
        }
      }
      return { result: problems.length > 0 ? `בעיות שנמצאו:\n${problems.join("\n")}` : `✅ כל ה-FK ב-${table_name} תקינים` };
    }
    case "check_empty_strings": {
      if (!table_name) throw new Error("table_name נדרש");
      const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('text', 'character varying') ORDER BY ordinal_position", [table_name]);
      const issues: string[] = [];
      for (const c of cols.rows) {
        const r = await pool.query(`SELECT count(*) as cnt FROM ${table_name} WHERE ${c.column_name} = ''`);
        if (Number(r.rows[0].cnt) > 0) issues.push(`  ${c.column_name}: ${r.rows[0].cnt} ריקים`);
      }
      return { result: issues.length > 0 ? `⚠️ שדות ריקים ב-${table_name}:\n${issues.join("\n")}` : `✅ אין שדות ריקים ב-${table_name}` };
    }
    case "full_audit": {
      if (!table_name) throw new Error("table_name נדרש");
      const count = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [table_name]);
      const issues: string[] = [];
      for (const c of cols.rows) {
        if (c.is_nullable === "YES") {
          const nulls = await pool.query(`SELECT count(*) as cnt FROM ${table_name} WHERE ${c.column_name} IS NULL`);
          if (Number(nulls.rows[0].cnt) > 0) {
            const pct = ((Number(nulls.rows[0].cnt) / Math.max(Number(count.rows[0].cnt), 1)) * 100).toFixed(1);
            if (Number(pct) > 10) issues.push(`  ${c.column_name}: ${nulls.rows[0].cnt} NULLs (${pct}%)`);
          }
        }
      }
      return { result: `📋 **ביקורת ${table_name}** — ${count.rows[0].cnt} רשומות, ${cols.rows.length} עמודות\n${issues.length > 0 ? `\n⚠️ בעיות:\n${issues.join("\n")}` : "\n✅ הכל תקין"}` };
    }
    default:
      return { result: `פעולת אימות "${action}" לא מוכרת. פעולות: find_nulls, find_duplicates, check_fk_integrity, check_empty_strings, full_audit` };
  }
}

async function bulkUpdate(input: { table_name: string; set: Record<string, any>; where: string; preview?: boolean }): Promise<{ result: string }> {
  const { table_name, set, where, preview } = input;
  if (!table_name || !set || !where) throw new Error("table_name + set + where נדרשים");

  if (where.trim().toLowerCase() === "true" || where.trim() === "1=1") throw new Error("עדכון המוני ללא WHERE מספיק ספציפי חסום מסיבות אבטחה");

  const countR = await pool.query(`SELECT count(*) as cnt FROM ${table_name} WHERE ${where}`);
  const affected = Number(countR.rows[0].cnt);

  if (preview) {
    const sample = await pool.query(`SELECT * FROM ${table_name} WHERE ${where} LIMIT 5`);
    return { result: `📋 תצוגה מקדימה: ${affected} רשומות ישפיעו\nדוגמה:\n${JSON.stringify(sample.rows.slice(0, 3), null, 2).slice(0, 2000)}\n\nשנויים: ${JSON.stringify(set)}` };
  }

  if (affected > 5000) throw new Error(`${affected} רשומות — יותר מדי. צמצם את ה-WHERE`);

  const keys = Object.keys(set);
  const vals = Object.values(set);
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const result = await pool.query(`UPDATE ${table_name} SET ${setClauses} WHERE ${where}`, vals);

  return { result: `✅ ${result.rowCount} רשומות עודכנו ב-${table_name}` };
}

async function erpInsights(input: { insight: string; period?: string }): Promise<{ result: string }> {
  const { insight, period } = input;
  const from = period || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  switch (insight) {
    case "business_overview": {
      const parts: string[] = ["📊 **סקירה עסקית כללית**\n"];
      try {
        const customers = await pool.query("SELECT count(*) as cnt FROM customers WHERE is_active = true");
        parts.push(`👥 לקוחות פעילים: ${customers.rows[0].cnt}`);
      } catch {}
      try {
        const products = await pool.query("SELECT count(*) as cnt FROM products WHERE is_active = true");
        parts.push(`📦 מוצרים פעילים: ${products.rows[0].cnt}`);
      } catch {}
      try {
        const orders = await pool.query(`SELECT count(*) as cnt, coalesce(sum(total_amount_cents),0) as total FROM sales_orders WHERE order_date >= $1`, [from]);
        parts.push(`📝 הזמנות (חודש אחרון): ${orders.rows[0].cnt} — ${(Number(orders.rows[0].total) / 100).toLocaleString("he-IL")} ₪`);
      } catch {}
      try {
        const suppliers = await pool.query("SELECT count(*) as cnt FROM suppliers WHERE is_active = true");
        parts.push(`🏭 ספקים פעילים: ${suppliers.rows[0].cnt}`);
      } catch {}
      try {
        const employees = await pool.query("SELECT count(*) as cnt FROM employees WHERE is_active = true");
        parts.push(`👷 עובדים פעילים: ${employees.rows[0].cnt}`);
      } catch {}
      try {
        const invoices = await pool.query("SELECT count(*) as cnt, coalesce(sum(total_amount_cents),0) as total FROM customer_invoices WHERE status != 'paid'");
        parts.push(`📑 חשבוניות פתוחות: ${invoices.rows[0].cnt} — ${(Number(invoices.rows[0].total) / 100).toLocaleString("he-IL")} ₪`);
      } catch {}
      return { result: parts.join("\n") };
    }
    case "sales_trends": {
      try {
        const r = await pool.query(`
          SELECT to_char(date_trunc('week', order_date), 'YYYY-MM-DD') as week,
            count(*) as orders, coalesce(sum(total_amount_cents),0) as revenue
          FROM sales_orders WHERE order_date >= $1
          GROUP BY date_trunc('week', order_date) ORDER BY week
        `, [from]);
        if (r.rows.length === 0) return { result: "אין נתוני מכירות" };
        let output = "📈 **מגמות מכירות (שבועי)**:\n\n| שבוע | הזמנות | הכנסה |\n|---|---|---|\n";
        output += r.rows.map((row: any) => `| ${row.week} | ${row.orders} | ${(Number(row.revenue) / 100).toLocaleString("he-IL")} ₪ |`).join("\n");
        return { result: output };
      } catch (e: any) { return { result: `⚠️ ${e.message}` }; }
    }
    case "top_customers": {
      try {
        const r = await pool.query(`
          SELECT c.name, count(so.id) as orders, coalesce(sum(so.total_amount_cents),0) as total
          FROM customers c JOIN sales_orders so ON c.id = so.customer_id
          WHERE so.order_date >= $1
          GROUP BY c.id, c.name ORDER BY total DESC LIMIT 10
        `, [from]);
        if (r.rows.length === 0) return { result: "אין לקוחות עם הזמנות" };
        let output = "🏆 **טופ 10 לקוחות**:\n\n| # | לקוח | הזמנות | סכום |\n|---|---|---|---|\n";
        output += r.rows.map((row: any, i: number) => `| ${i + 1} | ${row.name} | ${row.orders} | ${(Number(row.total) / 100).toLocaleString("he-IL")} ₪ |`).join("\n");
        return { result: output };
      } catch (e: any) { return { result: `⚠️ ${e.message}` }; }
    }
    case "top_products": {
      try {
        const r = await pool.query(`
          SELECT p.name, count(soi.id) as times_ordered, coalesce(sum(soi.quantity),0) as total_qty,
            coalesce(sum(soi.total_price_cents),0) as revenue
          FROM products p JOIN sales_order_items soi ON p.id = soi.product_id
          JOIN sales_orders so ON soi.sales_order_id = so.id
          WHERE so.order_date >= $1
          GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 10
        `, [from]);
        if (r.rows.length === 0) return { result: "אין נתוני מוצרים" };
        let output = "🏆 **טופ 10 מוצרים**:\n\n| # | מוצר | הזמנות | כמות | הכנסה |\n|---|---|---|---|---|\n";
        output += r.rows.map((row: any, i: number) => `| ${i + 1} | ${row.name} | ${row.times_ordered} | ${row.total_qty} | ${(Number(row.revenue) / 100).toLocaleString("he-IL")} ₪ |`).join("\n");
        return { result: output };
      } catch (e: any) { return { result: `⚠️ ${e.message}` }; }
    }
    case "cash_flow": {
      try {
        const income = await pool.query(`SELECT coalesce(sum(total_amount_cents),0) as total FROM customer_invoices WHERE status = 'paid' AND invoice_date >= $1`, [from]);
        const expenses = await pool.query(`SELECT coalesce(sum(total_amount_cents),0) as total FROM purchase_orders WHERE status IN ('received','completed') AND order_date >= $1`, [from]);
        const inc = Number(income.rows[0].total);
        const exp = Number(expenses.rows[0].total);
        const net = inc - exp;
        return { result: `💰 **תזרים מזומנים** (מ-${from}):\n\nהכנסות: ${(inc / 100).toLocaleString("he-IL")} ₪\nהוצאות: ${(exp / 100).toLocaleString("he-IL")} ₪\n**נטו: ${(net / 100).toLocaleString("he-IL")} ₪** ${net >= 0 ? "✅" : "⚠️"}` };
      } catch (e: any) { return { result: `⚠️ ${e.message}` }; }
    }
    case "data_quality": {
      const issues: string[] = [];
      const tables = ["customers", "products", "suppliers", "employees", "sales_orders"];
      for (const t of tables) {
        try {
          const count = await pool.query(`SELECT count(*) as cnt FROM ${t}`);
          issues.push(`  ${t}: ${count.rows[0].cnt} רשומות`);
        } catch {
          issues.push(`  ${t}: ⚠️ לא קיים`);
        }
      }
      return { result: `📊 **סקירת איכות נתונים**:\n${issues.join("\n")}` };
    }
    default:
      return { result: `תובנה "${insight}" לא מוכרת. תובנות: business_overview, sales_trends, top_customers, top_products, cash_flow, data_quality` };
  }
}

async function customerService(input: { action: string; search?: string; customer_id?: number; order_id?: number; note?: string }): Promise<{ result: string }> {
  const { action, search, customer_id, order_id, note } = input;

  switch (action) {
    case "lookup": {
      if (!search) throw new Error("search נדרש");
      const r = await pool.query(`
        SELECT c.id, c.name, c.customer_number, c.phone, c.email, c.city, c.balance_cents,
          (SELECT count(*) FROM sales_orders so WHERE so.customer_id = c.id) as total_orders,
          (SELECT coalesce(sum(total_amount_cents),0) FROM sales_orders so WHERE so.customer_id = c.id) as total_spent
        FROM customers c 
        WHERE c.name ILIKE $1 OR c.customer_number ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1
        LIMIT 5
      `, [`%${search}%`]);
      if (r.rows.length === 0) return { result: `לא נמצא לקוח: "${search}"` };
      return { result: r.rows.map((c: any) => `👤 **${c.name}** [${c.id}]\nמספר: ${c.customer_number || "-"}\nטלפון: ${c.phone || "-"}\nאימייל: ${c.email || "-"}\nעיר: ${c.city || "-"}\nיתרה: ${(Number(c.balance_cents) / 100).toLocaleString("he-IL")} ₪\nהזמנות: ${c.total_orders}\nסה"כ רכש: ${(Number(c.total_spent) / 100).toLocaleString("he-IL")} ₪`).join("\n\n---\n\n") };
    }
    case "order_status": {
      if (order_id) {
        const orderIdNum = Number(order_id);
        if (!orderIdNum || !Number.isFinite(orderIdNum) || orderIdNum < 1 || orderIdNum === 99999 || orderIdNum > 999999) return { result: `מזהה הזמנה לא תקין: ${order_id}` };
        const r = await pool.query(`
          SELECT so.*, c.name as customer_name 
          FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id 
          WHERE so.id = $1
        `, [orderIdNum]);
        if (r.rows.length === 0) {
          console.warn(`[kobi/tools] הזמנה ${orderIdNum} לא נמצאה`);
          return { result: `הזמנה ${orderIdNum} לא נמצאה` };
        }
        const o = r.rows[0];
        const items = await pool.query(`
          SELECT soi.*, p.name as product_name 
          FROM sales_order_items soi LEFT JOIN products p ON soi.product_id = p.id 
          WHERE soi.sales_order_id = $1
        `, [order_id]);
        let output = `📦 **הזמנה #${o.order_number || o.id}**\nלקוח: ${o.customer_name || "-"}\nסטטוס: ${o.status}\nתאריך: ${o.order_date || "-"}\nסכום: ${(Number(o.total_amount_cents) / 100).toLocaleString("he-IL")} ₪`;
        if (items.rows.length > 0) {
          output += `\n\nפריטים:\n${items.rows.map((i: any) => `  • ${i.product_name || "מוצר"} × ${i.quantity} — ${(Number(i.total_price_cents || 0) / 100).toLocaleString("he-IL")} ₪`).join("\n")}`;
        }
        return { result: output };
      }
      if (customer_id) {
        const r = await pool.query("SELECT id, order_number, status, total_amount_cents, order_date FROM sales_orders WHERE customer_id = $1 ORDER BY order_date DESC LIMIT 10", [customer_id]);
        return { result: `📋 הזמנות לקוח ${customer_id}:\n${r.rows.map((o: any) => `  [${o.id}] #${o.order_number || "-"} — ${o.status} — ${(Number(o.total_amount_cents) / 100).toLocaleString("he-IL")} ₪ (${o.order_date || "-"})`).join("\n")}` };
      }
      return { result: "נדרש order_id או customer_id" };
    }
    case "add_note": {
      if (!customer_id || !note) throw new Error("customer_id + note נדרשים");
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS customer_notes (
          id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, note TEXT NOT NULL,
          created_by VARCHAR(100) DEFAULT 'kobi', created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
      } catch {}
      await pool.query("INSERT INTO customer_notes (customer_id, note) VALUES ($1, $2)", [customer_id, note]);
      return { result: `✅ הערה נוספה ללקוח ${customer_id}: "${note.slice(0, 100)}"` };
    }
    case "history": {
      if (!customer_id) throw new Error("customer_id נדרש");
      const orders = await pool.query("SELECT id, order_number, status, total_amount_cents, order_date FROM sales_orders WHERE customer_id = $1 ORDER BY order_date DESC LIMIT 20", [customer_id]);
      const invoices = await pool.query("SELECT id, invoice_number, status, total_amount_cents, invoice_date FROM customer_invoices WHERE customer_id = $1 ORDER BY invoice_date DESC LIMIT 20", [customer_id]);
      let output = `📋 **היסטוריית לקוח ${customer_id}**\n\n`;
      output += `**הזמנות (${orders.rows.length}):**\n${orders.rows.map((o: any) => `  [${o.id}] #${o.order_number || "-"} ${o.status} ${(Number(o.total_amount_cents) / 100).toLocaleString("he-IL")} ₪`).join("\n") || "  אין"}\n\n`;
      output += `**חשבוניות (${invoices.rows.length}):**\n${invoices.rows.map((i: any) => `  [${i.id}] #${i.invoice_number || "-"} ${i.status} ${(Number(i.total_amount_cents) / 100).toLocaleString("he-IL")} ₪`).join("\n") || "  אין"}`;
      return { result: output };
    }
    default:
      return { result: `פעולת שרות "${action}" לא מוכרת. פעולות: lookup, order_status, add_note, history` };
  }
}

async function inventoryCheck(input: { action: string; product_id?: number; warehouse_id?: number; search?: string; threshold?: number }): Promise<{ result: string }> {
  const { action, product_id, warehouse_id, search, threshold } = input;

  switch (action) {
    case "stock_level": {
      if (product_id) {
        const r = await pool.query("SELECT id, name, sku, stock_quantity, min_stock_level, unit_price_cents FROM products WHERE id = $1", [product_id]);
        if (r.rows.length === 0) return { result: `מוצר ${product_id} לא נמצא` };
        const p = r.rows[0];
        const status = Number(p.stock_quantity) <= Number(p.min_stock_level || 5) ? "⚠️ מלאי נמוך" : "✅ תקין";
        return { result: `📦 **${p.name}** (${p.sku || "-"})\nמלאי: ${p.stock_quantity} יחידות\nמינימום: ${p.min_stock_level || 5}\nסטטוס: ${status}\nמחיר: ${(Number(p.unit_price_cents) / 100).toLocaleString("he-IL")} ₪` };
      }
      if (search) {
        const r = await pool.query("SELECT id, name, sku, stock_quantity, min_stock_level FROM products WHERE (name ILIKE $1 OR sku ILIKE $1) AND is_active = true LIMIT 20", [`%${search}%`]);
        return { result: `📦 ${r.rows.length} מוצרים:\n${r.rows.map((p: any) => `  [${p.id}] ${p.name} — ${p.stock_quantity} יח' ${Number(p.stock_quantity) <= Number(p.min_stock_level || 5) ? "⚠️" : "✅"}`).join("\n")}` };
      }
      return { result: "נדרש product_id או search" };
    }
    case "low_stock": {
      const thresh = threshold || 5;
      const r = await pool.query(`
        SELECT id, name, sku, stock_quantity, min_stock_level, unit_price_cents
        FROM products 
        WHERE stock_quantity <= coalesce(min_stock_level, $1) AND is_active = true
        ORDER BY stock_quantity ASC LIMIT 30
      `, [thresh]);
      if (r.rows.length === 0) return { result: "✅ אין מוצרים במלאי נמוך" };
      return { result: `⚠️ **${r.rows.length} מוצרים במלאי נמוך**:\n\n| מוצר | מק"ט | מלאי | מינימום |\n|---|---|---|---|\n${r.rows.map((p: any) => `| ${p.name} | ${p.sku || "-"} | ${p.stock_quantity} | ${p.min_stock_level || thresh} |`).join("\n")}` };
    }
    case "movements": {
      try {
        const filter = product_id ? "WHERE sm.product_id = $1" : "";
        const params = product_id ? [product_id] : [];
        const r = await pool.query(`
          SELECT sm.id, p.name as product, sm.movement_type, sm.quantity, sm.reference_number, sm.created_at
          FROM stock_movements sm LEFT JOIN products p ON sm.product_id = p.id
          ${filter} ORDER BY sm.created_at DESC LIMIT 20
        `, params);
        if (r.rows.length === 0) return { result: "אין תנועות מלאי" };
        return { result: `📋 **תנועות מלאי** (${r.rows.length}):\n${r.rows.map((m: any) => `  ${m.movement_type === "in" ? "📥" : "📤"} ${m.product} — ${m.quantity} יח' (${m.reference_number || "-"}) ${new Date(m.created_at).toLocaleDateString("he-IL")}`).join("\n")}` };
      } catch (e: any) {
        return { result: `⚠️ תנועות מלאי: ${e.message}` };
      }
    }
    case "valuation": {
      try {
        const r = await pool.query(`
          SELECT 
            count(*) as total_products,
            coalesce(sum(stock_quantity),0) as total_units,
            coalesce(sum(stock_quantity * unit_price_cents),0) as total_value
          FROM products WHERE is_active = true
        `);
        const d = r.rows[0];
        return { result: `💰 **שווי מלאי**:\nמוצרים: ${d.total_products}\nיחידות: ${Number(d.total_units).toLocaleString("he-IL")}\nשווי: ${(Number(d.total_value) / 100).toLocaleString("he-IL")} ₪` };
      } catch (e: any) {
        return { result: `⚠️ ${e.message}` };
      }
    }
    case "summary": {
      try {
        const total = await pool.query("SELECT count(*) as cnt FROM products WHERE is_active = true");
        const low = await pool.query("SELECT count(*) as cnt FROM products WHERE stock_quantity <= coalesce(min_stock_level, 5) AND is_active = true");
        const zero = await pool.query("SELECT count(*) as cnt FROM products WHERE stock_quantity = 0 AND is_active = true");
        return { result: `📊 **סיכום מלאי**:\nמוצרים פעילים: ${total.rows[0].cnt}\nמלאי נמוך: ${low.rows[0].cnt} ⚠️\nאזל מהמלאי: ${zero.rows[0].cnt} 🔴` };
      } catch (e: any) {
        return { result: `⚠️ ${e.message}` };
      }
    }
    default:
      return { result: `פעולת מלאי "${action}" לא מוכרת. פעולות: stock_level, low_stock, movements, valuation, summary` };
  }
}

async function backupRestore(input: { action: string; table_name: string; backup_name?: string }): Promise<{ result: string }> {
  const { action, table_name, backup_name } = input;
  const safeName = table_name.replace(/[^a-zA-Z0-9_]/g, "");
  const bkName = backup_name || `${safeName}_backup_${Date.now()}`;

  switch (action) {
    case "backup": {
      const exists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [table_name]);
      if (exists.rows.length === 0) throw new Error(`טבלה ${table_name} לא קיימת`);
      await pool.query(`CREATE TABLE ${bkName} AS SELECT * FROM ${table_name}`);
      const count = await pool.query(`SELECT count(*) as cnt FROM ${bkName}`);
      return { result: `✅ גיבוי נוצר: ${bkName} (${count.rows[0].cnt} רשומות)` };
    }
    case "restore": {
      if (!backup_name) throw new Error("backup_name נדרש");
      const exists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [backup_name]);
      if (exists.rows.length === 0) throw new Error(`גיבוי ${backup_name} לא קיים`);
      await pool.query(`TRUNCATE TABLE ${table_name}`);
      await pool.query(`INSERT INTO ${table_name} SELECT * FROM ${backup_name}`);
      const count = await pool.query(`SELECT count(*) as cnt FROM ${table_name}`);
      return { result: `✅ שחזור מ-${backup_name} → ${table_name} (${count.rows[0].cnt} רשומות)` };
    }
    case "list_backups": {
      const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%_backup_%' ORDER BY table_name");
      if (r.rows.length === 0) return { result: "אין גיבויים" };
      return { result: `📋 ${r.rows.length} גיבויים:\n${r.rows.map((t: any) => `  ${t.table_name}`).join("\n")}` };
    }
    case "delete_backup": {
      if (!backup_name) throw new Error("backup_name נדרש");
      await pool.query(`DROP TABLE IF EXISTS ${backup_name}`);
      return { result: `✅ גיבוי ${backup_name} נמחק` };
    }
    default:
      return { result: `פעולה "${action}" לא מוכרת. פעולות: backup, restore, list_backups, delete_backup` };
  }
}

async function workflowTrigger(input: { action: string; workflow_type?: string; entity_id?: number; data?: any }): Promise<{ result: string }> {
  const { action, workflow_type, entity_id, data } = input;

  switch (action) {
    case "order_to_invoice": {
      if (!entity_id) throw new Error("entity_id (order id) נדרש");
      const orderId = Number(entity_id);
      if (!Number.isFinite(orderId) || orderId < 1 || orderId === 99999 || orderId > 999999) throw new Error(`מזהה הזמנה לא תקין: ${entity_id}`);
      const order = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [orderId]);
      if (order.rows.length === 0) {
        console.warn(`[kobi/tools] הזמנה ${orderId} לא נמצאה`);
        throw new Error(`הזמנה ${orderId} לא נמצאה`);
      }
      const o = order.rows[0];
      try {
        const inv = await pool.query(`
          INSERT INTO customer_invoices (customer_id, invoice_number, status, total_amount_cents, vat_amount_cents, invoice_date, due_date, sales_order_id)
          VALUES ($1, $2, 'draft', $3, $4, NOW(), NOW() + INTERVAL '30 days', $5) RETURNING id, invoice_number
        `, [o.customer_id, `INV-${Date.now()}`, o.total_amount_cents, Math.round(Number(o.total_amount_cents) * VAT_RATE), entity_id]);
        await pool.query("UPDATE sales_orders SET status = 'invoiced' WHERE id = $1", [entity_id]);
        return { result: `✅ חשבונית נוצרה: [${inv.rows[0].id}] ${inv.rows[0].invoice_number}\nהזמנה ${entity_id} עודכנה ל-invoiced` };
      } catch (e: any) {
        return { result: `⚠️ ${e.message}` };
      }
    }
    case "approve_order": {
      if (!entity_id) throw new Error("entity_id (order id) נדרש");
      await pool.query("UPDATE sales_orders SET status = 'approved', updated_at = NOW() WHERE id = $1", [entity_id]);
      return { result: `✅ הזמנה ${entity_id} אושרה` };
    }
    case "close_order": {
      if (!entity_id) throw new Error("entity_id (order id) נדרש");
      await pool.query("UPDATE sales_orders SET status = 'completed', updated_at = NOW() WHERE id = $1", [entity_id]);
      return { result: `✅ הזמנה ${entity_id} נסגרה` };
    }
    case "receive_goods": {
      if (!entity_id) throw new Error("entity_id (PO id) נדרש");
      const po = await pool.query("SELECT * FROM purchase_orders WHERE id = $1", [entity_id]);
      if (po.rows.length === 0) throw new Error(`הזמנת רכש ${entity_id} לא נמצאה`);
      await pool.query("UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = $1", [entity_id]);
      try {
        const items = await pool.query("SELECT product_id, quantity FROM purchase_order_items WHERE purchase_order_id = $1", [entity_id]);
        for (const item of items.rows) {
          await pool.query("UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2", [item.quantity, item.product_id]);
        }
        return { result: `✅ הזמנת רכש ${entity_id} התקבלה\nמלאי עודכן עבור ${items.rows.length} מוצרים` };
      } catch (e: any) {
        return { result: `✅ הזמנת רכש ${entity_id} סומנה כהתקבלה (עדכון מלאי: ${e.message})` };
      }
    }
    case "update_stock": {
      if (!entity_id || !data?.quantity) throw new Error("entity_id (product_id) + data.quantity נדרשים");
      const direction = data.direction || "in";
      if (direction === "in") {
        await pool.query("UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2", [data.quantity, entity_id]);
      } else {
        await pool.query("UPDATE products SET stock_quantity = GREATEST(stock_quantity - $1, 0), updated_at = NOW() WHERE id = $2", [data.quantity, entity_id]);
      }
      try {
        await pool.query("INSERT INTO stock_movements (product_id, movement_type, quantity, reference_number) VALUES ($1, $2, $3, $4)",
          [entity_id, direction, data.quantity, data.reference || `KOBI-${Date.now()}`]);
      } catch {}
      return { result: `✅ מלאי מוצר ${entity_id} עודכן: ${direction === "in" ? "+" : "-"}${data.quantity}` };
    }
    case "list_workflows": {
      return { result: `📋 **תהליכי עבודה זמינים**:\n\n1. **order_to_invoice** — הפיכת הזמנה לחשבונית\n2. **approve_order** — אישור הזמנה\n3. **close_order** — סגירת הזמנה\n4. **receive_goods** — קבלת סחורה + עדכון מלאי\n5. **update_stock** — עדכון מלאי ידני` };
    }
    default:
      return { result: `תהליך "${action}" לא מוכר. הרץ list_workflows לראות תהליכים זמינים.` };
  }
}

async function smartFix(input: { target: string; description?: string }): Promise<{ result: string }> {
  const { target, description } = input;

  switch (target) {
    case "broken_routes": {
      try {
        const indexPath = safePath("artifacts/api-server/src/routes/index.ts");
        const indexContent = readFileSync(indexPath, "utf-8");
        const imports = indexContent.match(/import\s+\w+\s+from\s+"\.\/([^"]+)"/g) || [];
        const broken: string[] = [];
        for (const imp of imports) {
          const match = imp.match(/from "\.\/([^"]+)"/);
          if (match) {
            const filePath = `artifacts/api-server/src/routes/${match[1]}.ts`;
            if (!existsSync(safePath(filePath))) broken.push(filePath);
          }
        }
        return { result: broken.length > 0 ? `⚠️ ${broken.length} routes שבורים:\n${broken.join("\n")}` : "✅ כל ה-routes תקינים" };
      } catch (e: any) { return { result: `❌ ${e.message}` }; }
    }
    case "missing_tables": {
      try {
        const routesDir = safePath("artifacts/api-server/src/routes");
        const output = execSync(`rg "FROM\\s+(\\w+)" --glob '*.ts' '${routesDir}' -o 2>/dev/null | sort -u | head -50`, { timeout: 10000 }).toString();
        const tableNames = [...new Set(output.match(/FROM\s+(\w+)/gi)?.map(m => m.replace(/FROM\s+/i, "")) || [])];
        const missing: string[] = [];
        for (const t of tableNames) {
          if (["information_schema", "pg_indexes", "pg_stat", "dual"].includes(t.toLowerCase())) continue;
          try {
            const exists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1", [t.toLowerCase()]);
            if (exists.rows.length === 0) missing.push(t);
          } catch {}
        }
        return { result: missing.length > 0 ? `⚠️ ${missing.length} טבלאות חסרות:\n${missing.join("\n")}` : "✅ כל הטבלאות קיימות" };
      } catch (e: any) { return { result: `❌ ${e.message}` }; }
    }
    case "null_required_fields": {
      try {
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT 30");
        const issues: string[] = [];
        for (const t of tables.rows) {
          const reqCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL AND column_name != 'id' LIMIT 5", [t.table_name]);
          for (const c of reqCols.rows) {
            try {
              const nulls = await pool.query(`SELECT count(*) as cnt FROM ${t.table_name} WHERE ${c.column_name} IS NULL`);
              if (Number(nulls.rows[0].cnt) > 0) issues.push(`  ${t.table_name}.${c.column_name}: ${nulls.rows[0].cnt} NULLs`);
            } catch {}
          }
        }
        return { result: issues.length > 0 ? `⚠️ שדות חובה עם NULL:\n${issues.join("\n")}` : "✅ אין בעיות" };
      } catch (e: any) { return { result: `❌ ${e.message}` }; }
    }
    default:
      return { result: `יעד "${target}" לא מוכר. יעדים: broken_routes, missing_tables, null_required_fields` };
  }
}

async function deployCheck(input: { check?: string }): Promise<{ result: string }> {
  const check = input.check || "full";
  const parts: string[] = [];

  if (check === "full" || check === "api") {
    try {
      const start = Date.now();
      const r = await fetch(`http://localhost:${process.env.PORT || "8080"}/api/health`, { signal: AbortSignal.timeout(5000) });
      parts.push(`🌐 API: ${r.status} (${Date.now() - start}ms)`);
    } catch (e: any) {
      parts.push(`🌐 API: ❌ ${e.message}`);
    }
  }

  if (check === "full" || check === "db") {
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      parts.push(`📊 DB: ✅ (${Date.now() - start}ms)`);
    } catch (e: any) {
      parts.push(`📊 DB: ❌ ${e.message}`);
    }
  }

  if (check === "full" || check === "tables") {
    const tables = await pool.query("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'");
    parts.push(`📋 טבלאות: ${tables.rows[0].cnt}`);
  }

  if (check === "full" || check === "errors") {
    try {
      const output = execSync(`cd ${ROOT}/artifacts/api-server && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`, { timeout: 30000 }).toString().trim();
      parts.push(`🐛 שגיאות TS: ${output}`);
    } catch (e: any) {
      parts.push(`🐛 TS check: ${e.stdout?.toString?.()?.trim() || "N/A"}`);
    }
  }

  if (check === "full") {
    const mem = process.memoryUsage();
    parts.push(`💾 RAM: ${Math.round(mem.heapUsed / 1048576)}MB / ${Math.round(mem.heapTotal / 1048576)}MB`);
    parts.push(`⏱️ Uptime: ${Math.floor(process.uptime() / 60)} דקות`);
  }

  return { result: `🚀 **בדיקת מוכנות**:\n${parts.join("\n")}` };
}

async function exportReport(input: { format: string; query?: string; table_name?: string; title?: string; columns?: string[]; where?: string; file_name?: string }): Promise<{ result: string }> {
  const { format, query, table_name, title, columns, where, file_name } = input;
  const exportDir = join(ROOT, "artifacts/erp-app/public/exports");
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });

  let sql = query;
  if (!sql && table_name) {
    const cols = columns?.length ? columns.join(", ") : "*";
    const whereClause = where ? ` WHERE ${where}` : "";
    sql = `SELECT ${cols} FROM ${table_name}${whereClause} ORDER BY id DESC LIMIT 5000`;
  }
  if (!sql) throw new Error("query או table_name נדרש");

  const result = await pool.query(sql);
  if (result.rows.length === 0) return { result: "אין נתונים לייצוא" };

  const rows = result.rows;
  const headers = Object.keys(rows[0]);
  const reportTitle = title || table_name || "report";
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const baseName = file_name || `${reportTitle}_${timestamp}`;

  switch (format) {
    case "csv": {
      const bom = "\uFEFF";
      const csvRows = [
        headers.join(","),
        ...rows.map(r => headers.map(h => {
          const v = r[h];
          if (v === null) return "";
          const s = String(v);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
          return s;
        }).join(","))
      ];
      const csvContent = bom + csvRows.join("\n");
      const filePath = join(exportDir, `${baseName}.csv`);
      writeFileSync(filePath, csvContent, "utf-8");
      return { result: `✅ CSV נוצר: /exports/${baseName}.csv\n📊 ${rows.length} שורות, ${headers.length} עמודות\nעמודות: ${headers.join(", ")}` };
    }
    case "excel":
    case "xlsx": {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(reportTitle.slice(0, 31));
      worksheet.columns = headers.map(h => {
        const maxLen = Math.max(h.length, ...rows.slice(0, 50).map(r => String(r[h] ?? "").length));
        return { width: Math.min(maxLen + 2, 40) };
      });
      worksheet.addRow(headers);
      rows.forEach(r => {
        const values = headers.map(h => {
          const v = r[h];
          return h.endsWith("_cents") && typeof v === "number" ? v / 100 : v;
        });
        worksheet.addRow(values);
      });
      const filePath = join(exportDir, `${baseName}.xlsx`);
      await workbook.xlsx.writeFile(filePath);
      return { result: `✅ Excel נוצר: /exports/${baseName}.xlsx\n📊 ${rows.length} שורות, ${headers.length} עמודות\nעמודות: ${headers.join(", ")}` };
    }
    case "json": {
      const filePath = join(exportDir, `${baseName}.json`);
      writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
      return { result: `✅ JSON נוצר: /exports/${baseName}.json\n📊 ${rows.length} רשומות` };
    }
    default:
      return { result: `פורמט "${format}" לא נתמך. פורמטים: csv, excel/xlsx, json` };
  }
}

async function analyzeImage(input: { file_path: string; question?: string }): Promise<{ result: string }> {
  const { file_path, question } = input;
  const fullPath = safePath(file_path);
  if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${file_path}`);

  const data = readFileSync(fullPath);
  const base64 = data.toString("base64");
  const ext = file_path.toLowerCase().split(".").pop() || "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  };
  const mediaType = mimeMap[ext] || "image/jpeg";

  const providers = [
    ...(process.env.ANTHROPIC_API_KEY ? [{ key: process.env.ANTHROPIC_API_KEY, url: "https://api.anthropic.com", model: "claude-sonnet-4-20250514" }] : []),
    ...(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ? [{ key: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY, url: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL, model: "claude-sonnet-4-6" }] : []),
  ];
  if (providers.length === 0) throw new Error("ANTHROPIC_API_KEY לא מוגדר");

  const prompt = question || "תאר בפירוט מה יש בתמונה הזו. אם זה מסמך — חלץ את הטקסט. אם זה מוצר — תאר אותו. אם זה שרטוט/תכנית — תאר את המבנה.";

  let response: Response | null = null;
  for (const provider of providers) {
    response = await fetch(`${provider.url}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) break;
    const errText = await response.text();
    if (errText.includes("credit balance") || errText.includes("billing") || errText.includes("UNSUPPORTED_MODEL")) {
      console.log(`[Kobi Vision] Provider failed, trying next...`);
      continue;
    }
    throw new Error(`שגיאת Claude Vision: ${response.status} — ${errText.slice(0, 200)}`);
  }

  if (!response || !response.ok) {
    throw new Error("כל ספקי ה-AI נכשלו");
  }

  const result: any = await response.json();
  const text = result.content?.map((b: any) => b.text || "").join("") || "";
  return { result: `📸 **ניתוח תמונה**: ${file_path}\n\n${text}` };
}

async function buildFeature(input: {
  feature_name: string;
  table_name?: string;
  columns?: { name: string; type: string; required?: boolean }[];
  page_path?: string;
  page_title?: string;
  section?: string;
  api_prefix?: string;
  with_crud?: boolean;
  with_page?: boolean;
  with_api?: boolean;
  with_menu?: boolean;
}): Promise<{ result: string }> {
  const { feature_name, table_name, columns, page_path, page_title, section, api_prefix, with_crud, with_page, with_api, with_menu } = input;
  const results: string[] = [];
  const tbl = table_name || feature_name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const prefix = api_prefix || `/${tbl.replace(/_/g, "-")}`;
  const pagePath = page_path || `/${tbl.replace(/_/g, "-")}`;
  const title = page_title || feature_name;

  if (with_crud !== false && columns && columns.length > 0) {
    const colDefs = columns.map(c => {
      let def = `${c.name} ${c.type}`;
      if (c.required) def += " NOT NULL";
      return def;
    }).join(",\n      ");

    await pool.query(`CREATE TABLE IF NOT EXISTS ${tbl} (
      id SERIAL PRIMARY KEY,
      ${colDefs},
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    results.push(`✅ טבלה "${tbl}" נוצרה עם ${columns.length} עמודות`);
  }

  if (with_api !== false) {
    const apiResult = await createApiRoute({ route_prefix: prefix, file_name: tbl, table_name: tbl });
    results.push(apiResult.result);
  }

  if (with_page !== false) {
    const cols = columns || [];
    const fieldsJsx = cols.map(c => {
      return `              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">${c.name}</label>
                <input
                  type="${c.type.includes("INT") || c.type.includes("NUMERIC") ? "number" : "text"}"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="${c.name}"
                  value={form.${c.name} || ""}
                  onChange={e => setForm({...form, ${c.name}: e.target.value})}
                />
              </div>`;
    }).join("\n");

    const colHeaders = cols.map(c => `                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">${c.name}</th>`).join("\n");
    const colCells = cols.map(c => `                <td className="px-4 py-3 text-sm text-gray-300">{item.${c.name}}</td>`).join("\n");

    const componentName = tbl.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("") + "Page";

    const pageContent = `import { useState, useEffect } from "react";
import { authFetch } from "../../lib/utils";

export default function ${componentName}() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api${prefix}");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? "/api${prefix}/" + editId : "/api${prefix}";
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({}); setEditId(null); setShowForm(false); load();
  };

  const remove = async (id: number) => {
    await authFetch("/api${prefix}/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">${title}</h1>
        <button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          {showForm ? "סגור" : "+ חדש"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
${fieldsJsx}
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">ביטול</button>
            <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">{editId ? "עדכן" : "שמור"}</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">טוען...</div> : (
          <table className="w-full">
            <thead className="bg-gray-800/60 border-b border-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">#</th>
${colHeaders}
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
${colCells}
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); }} className="px-2 py-1 text-xs bg-yellow-600/20 text-yellow-400 rounded">עריכה</button>
                      <button onClick={() => remove(item.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded">מחיקה</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
`;

    const pageResult = await createPage({
      page_path: pagePath,
      title,
      section: with_menu !== false ? (section || feature_name) : undefined,
      content: pageContent,
    });
    results.push(pageResult.result);
  }

  return { result: `🚀 **פיצ'ר "${feature_name}" נבנה!**\n${results.join("\n")}\n\n📍 דף: ${pagePath}\n🔗 API: /api${prefix}\n💾 טבלה: ${tbl}` };
}

function packageManager(input: { action: string; packages?: string[]; workspace?: string }): { result: string } {
  const { action, packages, workspace } = input;
  const ws = workspace || "@workspace/api-server";

  switch (action) {
    case "install": {
      if (!packages || packages.length === 0) throw new Error("packages נדרש");
      const pkgList = packages.join(" ");
      try {
        const output = execSync(`cd ${ROOT} && pnpm --filter ${ws} add ${pkgList} 2>&1`, { timeout: 60000 }).toString();
        return { result: `✅ חבילות הותקנו ב-${ws}: ${pkgList}\n${output.slice(-200)}` };
      } catch (e: any) {
        return { result: `❌ שגיאה בהתקנה: ${e.message}` };
      }
    }
    case "install_dev": {
      if (!packages || packages.length === 0) throw new Error("packages נדרש");
      const pkgList = packages.join(" ");
      try {
        const output = execSync(`cd ${ROOT} && pnpm --filter ${ws} add -D ${pkgList} 2>&1`, { timeout: 60000 }).toString();
        return { result: `✅ חבילות dev הותקנו ב-${ws}: ${pkgList}\n${output.slice(-200)}` };
      } catch (e: any) {
        return { result: `❌ שגיאה: ${e.message}` };
      }
    }
    case "remove": {
      if (!packages || packages.length === 0) throw new Error("packages נדרש");
      const pkgList = packages.join(" ");
      try {
        execSync(`cd ${ROOT} && pnpm --filter ${ws} remove ${pkgList} 2>&1`, { timeout: 60000 });
        return { result: `✅ חבילות הוסרו: ${pkgList}` };
      } catch (e: any) {
        return { result: `❌ שגיאה: ${e.message}` };
      }
    }
    case "list": {
      try {
        const output = execSync(`cd ${ROOT} && pnpm --filter ${ws} list --depth 0 2>&1`, { timeout: 30000 }).toString();
        return { result: `📦 חבילות ב-${ws}:\n${output.slice(0, 3000)}` };
      } catch (e: any) {
        return { result: `❌ שגיאה: ${e.message}` };
      }
    }
    default:
      return { result: `פעולה "${action}" לא מוכרת. פעולות: install, install_dev, remove, list` };
  }
}

function gitOps(input: { action: string; message?: string; files?: string[] }): { result: string } {
  const { action, message, files } = input;

  switch (action) {
    case "status": {
      const output = execSync("cd " + ROOT + " && git status --short 2>&1", { timeout: 10000 }).toString();
      return { result: `📋 Git Status:\n${output || "(נקי)"}` };
    }
    case "diff": {
      const output = execSync("cd " + ROOT + " && git diff --stat 2>&1", { timeout: 10000 }).toString();
      return { result: `📊 Git Diff:\n${output || "(אין שינויים)"}` };
    }
    case "log": {
      const output = execSync("cd " + ROOT + " && git log --oneline -20 2>&1", { timeout: 10000 }).toString();
      return { result: `📜 Git Log (אחרון 20):\n${output}` };
    }
    case "add": {
      const fileList = files?.join(" ") || ".";
      execSync(`cd ${ROOT} && git add ${fileList} 2>&1`, { timeout: 10000 });
      return { result: `✅ קבצים נוספו ל-staging: ${fileList}` };
    }
    case "commit": {
      if (!message) throw new Error("message נדרש");
      execSync(`cd ${ROOT} && git add -A && git commit -m "${message.replace(/"/g, '\\"')}" 2>&1`, { timeout: 15000 });
      return { result: `✅ Commit: "${message}"` };
    }
    default:
      return { result: `פעולה "${action}" לא מוכרת. פעולות: status, diff, log, add, commit` };
  }
}

function showMap(input: { markers: Array<{ lat: number; lng: number; label: string; type?: string; color?: string; info?: string }>; center?: { lat: number; lng: number }; zoom?: number; title?: string }): { result: string; _mapData?: any } {
  const { markers, center, zoom, title } = input;
  if (!markers || !Array.isArray(markers) || markers.length === 0) {
    throw new Error("markers נדרש — רשימה של נקודות עם lat, lng, label");
  }
  const validMarkers = markers.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && m.label);
  if (validMarkers.length === 0) throw new Error("אין markers תקינים — כל marker צריך lat, lng, label");

  const mapCenter = center || {
    lat: validMarkers.reduce((s, m) => s + m.lat, 0) / validMarkers.length,
    lng: validMarkers.reduce((s, m) => s + m.lng, 0) / validMarkers.length,
  };

  const mapData = {
    markers: validMarkers,
    center: mapCenter,
    zoom: zoom || 10,
    title: title || "מפה",
  };

  return {
    result: `✅ מפה "${title || "מפה"}" מוכנה עם ${validMarkers.length} נקודות`,
    _mapData: mapData,
  };
}

let _cachedToken: string | null = null;
let _tokenExpiry = 0;
async function getAuthToken(): Promise<string | null> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  try {
    const kobiUser = process.env.KOBI_SERVICE_USER;
    const kobiPass = process.env.KOBI_SERVICE_PASS;
    if (!kobiUser || !kobiPass) {
      if (process.env.NODE_ENV === "production") {
        console.error("[kobi] KOBI_SERVICE_USER and KOBI_SERVICE_PASS must be set in production");
        return null;
      }
    }
    const r = await fetch(`http://localhost:${process.env.PORT || "8080"}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: kobiUser || "admin", password: kobiPass || "admin123" }),
    });
    const data = await r.json() as any;
    _cachedToken = data.token || null;
    _tokenExpiry = Date.now() + 3600000;
    return _cachedToken;
  } catch { return null; }
}
