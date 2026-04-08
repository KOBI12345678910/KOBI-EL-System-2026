import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import sharp from "sharp";
import {
  claudeChatConversationsTable,
  claudeChatMessagesTable,
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, count, asc, and } from "drizzle-orm";

const router: IRouter = Router();

const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONVERSATIONS_LIST = 50;
const MAX_TOOL_ROUNDS = 6;
const API_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const MAX_TOOL_RESULT_CHARS = 2500;
const FAST_MAX_TOKENS = 8192;
const NORMAL_MAX_TOKENS = 16384;

let _systemContextCache: string | null = null;
let _systemContextCacheAt = 0;
const SYSTEM_CONTEXT_TTL_MS = 900_000;

let _channelContextCache: Record<string, { text: string; at: number }> = {};
const CHANNEL_CTX_TTL_MS = 300_000;

const FAST_MODEL = "claude-haiku-4-5";
const DEFAULT_MODEL_FAST = "claude-sonnet-4-5";
const BUILD_KEYWORDS = /תבנה|בנה|צור|עדכן|מחק|שנה|הוסף|create|build|update|delete|add|write|install|deploy|fix|תקן|שדרג|התקן/i;
const TOOL_KEYWORDS = /טבל|שדות|מודול|ישות|רשומ|דוח|שאילת|SQL|query|module|entity|field|record|table|schema|diagnos|תקן|repair|script|file|shell|code|כתוב|קרא|חפש|סטטוס|status|workflow|automation/i;

const FAST_SYSTEM_PROMPT = `אתה "עוזי AI" — מומחה ERP מפעל מתכת/אלומיניום/זכוכית בעברית. ענה בקצרה, בבהירות ובחוכמה. אל תשתמש בכלים. שם המפעל: טכנו-כל עוזי. מע"מ: 17%. DB: PostgreSQL. FE: React+Vite. BE: Express+TS.`;

function isSimpleQuestion(msg: string, channel: string): boolean {
  if (msg.length > 150) return false;
  if (BUILD_KEYWORDS.test(msg)) return false;
  if (TOOL_KEYWORDS.test(msg)) return false;
  if (["development", "architecture", "automation"].includes(channel)) return false;
  return true;
}

function invalidateSystemContextCache() {
  _systemContextCache = null;
  _systemContextCacheAt = 0;
}

const STATIC_SYSTEM_CONTEXT = `
=== SQL ===
snake_case בלבד. השתמש ב-list_modules/list_entities לגילוי מבנה. טבלאות ליבה: platform_modules, module_entities, entity_fields, entity_statuses, entity_records, system_menu_items, suppliers, users

=== ארכיטקטורה ===
FE: artifacts/erp-app/src/ (React+Vite+Tailwind) | BE: artifacts/api-server/src/ (Express+TS) | DB: PostgreSQL+Drizzle | pnpm monorepo
מע"מ: 17% | אימות: PBKDF2-SHA512/Google OAuth, Bearer token

=== מגבלות ===
אין DOM/browser | אין Email/SMS | אין זיכרון בין שיחות | שינוי קוד דורש restart
`;


async function safeCount(table: string): Promise<number> {
  try {
    const r = await db.execute(sql.raw(`SELECT count(*) as c FROM ${table}`));
    return Number(r.rows?.[0]?.c || 0);
  } catch { return -1; }
}

async function safeQuery(query: string): Promise<any[]> {
  try {
    const r = await db.execute(sql.raw(query));
    return r.rows || [];
  } catch { return []; }
}

async function getSystemContext(): Promise<string> {
  const now = Date.now();
  if (_systemContextCache && now - _systemContextCacheAt < SYSTEM_CONTEXT_TTL_MS) {
    return _systemContextCache;
  }
  try {
    const rows = await safeQuery(`
      SELECT
        (SELECT count(*) FROM suppliers) as suppliers,
        (SELECT count(*) FROM platform_modules) as modules,
        (SELECT count(*) FROM module_entities) as entities,
        (SELECT count(*) FROM entity_fields) as fields,
        (SELECT count(*) FROM users) as users,
        (SELECT count(*) FROM purchase_orders) as orders,
        (SELECT count(*) FROM entity_records) as records
    `);
    const r = rows[0] || {};
    const fmt = (v: unknown) => v == null ? '?' : String(v);

    let ctx = `\n\n=== מערכת: טכנו-כל עוזי / TECHNO-KOL UZI 2026 ===\n`;
    ctx += `ERP מפעל מתכת/אלומיניום/זכוכית — ${fmt(r.modules)} מודולים, ${fmt(r.entities)} ישויות, ${fmt(r.fields)} שדות\n`;
    ctx += `ספקים: ${fmt(r.suppliers)} | הזמנות: ${fmt(r.orders)} | רשומות: ${fmt(r.records)} | משתמשים: ${fmt(r.users)}\n`;
    ctx += STATIC_SYSTEM_CONTEXT;

    _systemContextCache = ctx;
    _systemContextCacheAt = Date.now();
    return ctx;
  } catch (err) {
    return '\n[לא ניתן לטעון נתוני מערכת]\n';
  }
}

async function getChannelSpecificContext(channel: string): Promise<string> {
  const now = Date.now();
  const cached = _channelContextCache[channel];
  if (cached && now - cached.at < CHANNEL_CTX_TTL_MS) return cached.text;

  let ctx = '';
  try {
    if (channel === 'management') {
      const [dbSize, connCount] = await Promise.all([
        safeQuery("SELECT pg_size_pretty(pg_database_size(current_database())) as size"),
        safeQuery("SELECT count(*) as c FROM pg_stat_activity"),
      ]);
      ctx += `\nגודל DB: ${dbSize[0]?.size || 'N/A'} | חיבורים: ${connCount[0]?.c || 0}\n`;
    }
    if (channel === 'dataflow') {
      const lowStock = await safeQuery("SELECT material_name, current_stock, reorder_point FROM raw_materials WHERE current_stock IS NOT NULL AND reorder_point IS NOT NULL AND CAST(current_stock AS numeric) <= CAST(reorder_point AS numeric) LIMIT 10");
      if (lowStock.length > 0) {
        ctx += `\nחומרים במלאי נמוך (${lowStock.length}):\n`;
        for (const m of lowStock.slice(0, 5)) {
          ctx += `  - ${m.material_name}: ${m.current_stock}/${m.reorder_point}\n`;
        }
      }
    }
    if (channel === 'testing') {
      const lastAudit = await safeQuery("SELECT action_type, target_api, status FROM claude_audit_logs ORDER BY created_at DESC LIMIT 3");
      if (lastAudit.length > 0) {
        ctx += `\nלוגי API:\n`;
        for (const l of lastAudit) ctx += `  - ${l.action_type} ${l.target_api} [${l.status}]\n`;
      }
    }
  } catch {}
  _channelContextCache[channel] = { text: ctx, at: now };
  return ctx;
}

const MASTER_BRAIN = `אתה "עוזי AI" — מומחה AI של טכנו-כל עוזי 2026 (ERP מפעל מתכת/אלומיניום/נירוסטה/זכוכית). דבר עברית תמיד. ענה מהר, בדיוק, עם נתונים אמיתיים.
SQL: snake_case. entity_fields→is_system_field. system_menu_items→path. module_entities→name_plural.
FE: artifacts/erp-app/src/pages/ | BE: artifacts/api-server/src/routes/ | pnpm --filter @workspace/<artifact>
צריך מידע→execute_sql | "תבנה"→בצע מיד | "מה המצב?"→סקירה+נתונים | markdown+emoji
`;


const CHANNELS: Record<string, { nameHe: string; systemPrompt: string }> = {
  development: {
    nameHe: "המשך פיתוח",
    systemPrompt: MASTER_BRAIN + `ערוץ: פיתוח. מהנדס Full-Stack. בנה מודולים/ישויות/שדות/דפי React/routes. תהליך: read_file→ערוך→write_file→execute_shell. בצע מיד!`
  },
  management: {
    nameHe: "ניהול מערכת",
    systemPrompt: MASTER_BRAIN + `ערוץ: ניהול מערכת. SysAdmin. השתמש ב-get_system_stats+execute_sql לסקירה. run_diagnostics לאבחון. נטר DB, משתמשים, הרשאות.`
  },
  dataflow: {
    nameHe: "זרימת נתונים",
    systemPrompt: MASTER_BRAIN + `ערוץ: זרימת נתונים. מומחה קשרים ואינטגרציות. בדוק entity_relations. זרימה: ספק→הצעה→הזמנה→קבלה→חשבונית→תשלום.`
  },
  testing: {
    nameHe: "בדיקות ותיקונים",
    systemPrompt: MASTER_BRAIN + `ערוץ: QA ואבחון. חקירה שיטתית: run_diagnostics→בדוק שלמות→execute_sql→תקן→אמת.`
  },
  support: {
    nameHe: "תמיכה ומענה",
    systemPrompt: MASTER_BRAIN + `ערוץ: תמיכה. דבר עברית פשוטה. הוראות שלב-אחרי-שלב. חקור בעיות ב-DB. הצע עזרה נוספת.`
  },
  automation: {
    nameHe: "אוטומציה",
    systemPrompt: MASTER_BRAIN + `ערוץ: אוטומציה. בנה workflows/automations/triggers/status_transitions/validation_rules/notifications. תכנן: trigger→conditions→actions.`
  },
  architecture: {
    nameHe: "ארכיטקטורה ואבטחה",
    systemPrompt: MASTER_BRAIN + `ערוץ: ארכיטקטורה ואבטחה. תכנון מודולים: ישויות+סוגים+שדות+סטטוסים+קשרים+הרשאות. בדוק roles ואבטחה. בצע!`
  },
};

const DEFAULT_MODEL = "claude-sonnet-4-5";

let _anthropicClient: { messages: { create: (params: Record<string, unknown>) => Promise<Record<string, unknown>> } } | null = null;
let _runtimeApiKey: string | null = null;
let _runtimeBaseUrl: string | null = null;

function getEffectiveApiKey(): string | undefined {
  return _runtimeApiKey || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
}

function getEffectiveBaseUrl(): string | undefined {
  return _runtimeBaseUrl || process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
}

async function getAnthropicClient(): Promise<any> {
  const baseURL = getEffectiveBaseUrl();
  const apiKey = getEffectiveApiKey();
  if (!baseURL || !apiKey) {
    throw new Error("Anthropic integration is not configured");
  }
  if (!_anthropicClient) {
    const mod = await import("@workspace/integrations-anthropic-ai");
    _anthropicClient = mod.anthropic;
  }
  return _anthropicClient;
}

function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg.includes("configured") || msg.includes("integration")) return "שירות ה-AI לא זמין כרגע, נסה שוב בעוד רגע";
  if (msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET")) return "הבקשה ארכה יותר מדי זמן. נסה שוב";
  if (msg.includes("429") || msg.includes("rate_limit")) return "יותר מדי בקשות. המתן רגע ונסה שוב";
  if (msg.includes("500") || msg.includes("503") || msg.includes("overloaded")) return "שירות ה-AI עמוס כרגע, נסה שוב בעוד רגע";
  if (msg.includes("Anthropic")) return "שגיאת חיבור ל-Claude AI";
  return "אירעה שגיאה בשרת";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

async function callAnthropicWithRetry(client: any, params: Record<string, unknown>, maxRetries = MAX_RETRIES): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await withTimeout(
        client.messages.create(params),
        API_TIMEOUT_MS,
        "timeout"
      );
      return response;
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err || "");
      const isRetryable = msg.includes("429") || msg.includes("rate_limit") || msg.includes("500") || msg.includes("503") || msg.includes("overloaded") || msg.includes("timeout");
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

const BUILDER_TOOLS: ToolDefinition[] = [
  {
    name: "list_modules",
    description: "List all platform modules in the system. Returns module ID, name, slug, status, and description.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_entities",
    description: "List all entities, optionally filtered by module ID. Returns entity ID, name, slug, moduleId, and type.",
    input_schema: {
      type: "object" as const,
      properties: {
        moduleId: { type: "number", description: "Optional module ID to filter entities" },
      },
      required: [],
    },
  },
  {
    name: "list_fields",
    description: "List all fields for a specific entity. Returns field ID, name, slug, fieldType, and settings.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list fields for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "query_database",
    description: "Run a predefined database query. Available queries: suppliers_list, suppliers_active, suppliers_count, materials_list, materials_low_stock, requests_list, orders_list, receipts_list, db_tables, db_size, modules_list.",
    input_schema: {
      type: "object" as const,
      properties: {
        queryId: {
          type: "string",
          description: "ID of the predefined query to run",
          enum: ["suppliers_list", "suppliers_active", "suppliers_count", "materials_list", "materials_low_stock", "requests_list", "orders_list", "receipts_list", "db_tables", "db_size", "modules_list"],
        },
      },
      required: ["queryId"],
    },
  },
  {
    name: "create_module",
    description: "Create a new platform module in the ERP system. A module is a top-level container for entities (e.g. 'Inventory', 'Sales', 'HR').",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Module name (Hebrew)" },
        slug: { type: "string", description: "URL-friendly identifier (English, lowercase, hyphens)" },
        nameHe: { type: "string", description: "Hebrew display name" },
        nameEn: { type: "string", description: "English display name" },
        description: { type: "string", description: "Module description" },
        icon: { type: "string", description: "Lucide icon name (e.g. 'Package', 'Users')" },
        color: { type: "string", description: "Color code or name" },
        category: { type: "string", description: "Module category" },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "create_entity",
    description: "Create a new entity within a module. An entity represents a data type (e.g. 'Product', 'Customer', 'Invoice').",
    input_schema: {
      type: "object" as const,
      properties: {
        moduleId: { type: "number", description: "Parent module ID" },
        name: { type: "string", description: "Entity name (Hebrew)" },
        namePlural: { type: "string", description: "Plural name (Hebrew)" },
        slug: { type: "string", description: "URL-friendly identifier" },
        nameHe: { type: "string", description: "Hebrew display name" },
        nameEn: { type: "string", description: "English display name" },
        description: { type: "string", description: "Entity description" },
        icon: { type: "string", description: "Lucide icon name" },
        entityType: { type: "string", description: "Type: master, transaction, child, reference, log, system, document, analytics", enum: ["master", "transaction", "child", "reference", "log", "system", "document", "analytics"] },
        hasStatus: { type: "boolean", description: "Enable status workflow" },
        hasCategories: { type: "boolean", description: "Enable categories" },
        hasAttachments: { type: "boolean", description: "Enable file attachments" },
        hasNotes: { type: "boolean", description: "Enable notes" },
        hasNumbering: { type: "boolean", description: "Enable auto-numbering" },
      },
      required: ["moduleId", "name", "namePlural", "slug"],
    },
  },
  {
    name: "create_field",
    description: "Add a field to an entity. Fields define the data columns (e.g. 'name', 'price', 'date').",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Field name (Hebrew)" },
        slug: { type: "string", description: "Field identifier (English)" },
        fieldType: { type: "string", description: "Field type: text, number, decimal, date, datetime, boolean, select, multi_select, email, phone, url, textarea, rich_text, currency, percentage, file, image, relation, formula, auto_number" },
        nameHe: { type: "string", description: "Hebrew label" },
        nameEn: { type: "string", description: "English label" },
        description: { type: "string", description: "Field description" },
        isRequired: { type: "boolean", description: "Is this field required?" },
        isUnique: { type: "boolean", description: "Must values be unique?" },
        isSearchable: { type: "boolean", description: "Include in search?" },
        showInList: { type: "boolean", description: "Show in list/table views?" },
        showInForm: { type: "boolean", description: "Show in forms?" },
        defaultValue: { type: "string", description: "Default value" },
        placeholder: { type: "string", description: "Input placeholder text" },
        options: { type: "array", description: "Options for select/multi_select fields", items: { type: "object" } },
        fieldWidth: { type: "string", description: "Layout width: full, half, third, quarter", enum: ["full", "half", "third", "quarter"] },
      },
      required: ["entityId", "name", "slug", "fieldType"],
    },
  },
  {
    name: "create_relation",
    description: "Create a relationship between two entities (e.g. Order belongs to Customer).",
    input_schema: {
      type: "object" as const,
      properties: {
        sourceEntityId: { type: "number", description: "Source entity ID" },
        targetEntityId: { type: "number", description: "Target entity ID" },
        relationType: { type: "string", description: "Relation type", enum: ["one_to_one", "one_to_many", "many_to_many"] },
        label: { type: "string", description: "Relation label (Hebrew)" },
        reverseLabel: { type: "string", description: "Reverse relation label" },
        cascadeDelete: { type: "boolean", description: "Delete related records on source delete?" },
      },
      required: ["sourceEntityId", "targetEntityId", "relationType", "label"],
    },
  },
  {
    name: "create_form",
    description: "Create a form definition for an entity (create/edit forms).",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Form name" },
        slug: { type: "string", description: "Form identifier" },
        formType: { type: "string", description: "Form type", enum: ["create", "edit", "quick_create", "wizard"] },
        isDefault: { type: "boolean", description: "Is this the default form?" },
        sections: { type: "array", description: "Form sections configuration", items: { type: "object" } },
      },
      required: ["entityId", "name", "slug"],
    },
  },
  {
    name: "create_view",
    description: "Create a list/table view definition for an entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "View name" },
        slug: { type: "string", description: "View identifier" },
        viewType: { type: "string", description: "View type (table, kanban, calendar, gallery)" },
        isDefault: { type: "boolean", description: "Is this the default view?" },
        columns: { type: "array", description: "Column configuration", items: { type: "object" } },
        filters: { type: "array", description: "Default filters", items: { type: "object" } },
        sorting: { type: "array", description: "Default sorting", items: { type: "object" } },
      },
      required: ["entityId", "name", "slug"],
    },
  },
  {
    name: "create_status",
    description: "Add a status to an entity's workflow (e.g. 'Draft', 'Active', 'Closed').",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Status name (Hebrew)" },
        slug: { type: "string", description: "Status identifier" },
        color: { type: "string", description: "Status color (e.g. 'blue', 'green', 'red')" },
        icon: { type: "string", description: "Icon name" },
        sortOrder: { type: "number", description: "Display order" },
        isDefault: { type: "boolean", description: "Is this the initial/default status?" },
        isFinal: { type: "boolean", description: "Is this a final/closed status?" },
      },
      required: ["entityId", "name", "slug"],
    },
  },
  {
    name: "create_action",
    description: "Create an action/button for an entity (e.g. 'Approve', 'Export', 'Send Email').",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Action name (Hebrew)" },
        slug: { type: "string", description: "Action identifier" },
        actionType: { type: "string", description: "Where action appears", enum: ["page", "row", "bulk", "header", "contextual"] },
        handlerType: { type: "string", description: "What the action does", enum: ["create", "update", "delete", "duplicate", "status_change", "workflow", "modal", "navigate", "export", "import", "print", "custom"] },
        icon: { type: "string", description: "Icon name" },
        color: { type: "string", description: "Button color" },
      },
      required: ["entityId", "name", "slug", "actionType", "handlerType"],
    },
  },
  {
    name: "create_detail",
    description: "Create a detail/card page definition for an entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Detail page name" },
        slug: { type: "string", description: "Detail page identifier" },
        isDefault: { type: "boolean", description: "Is this the default detail page?" },
        showRelatedRecords: { type: "boolean", description: "Show related records?" },
        sections: { type: "array", description: "Section configuration", items: { type: "object" } },
      },
      required: ["entityId", "name", "slug"],
    },
  },
  {
    name: "create_category",
    description: "Add a category to an entity for grouping records.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Parent entity ID" },
        name: { type: "string", description: "Category name (Hebrew)" },
        slug: { type: "string", description: "Category identifier" },
        icon: { type: "string", description: "Icon name" },
        color: { type: "string", description: "Category color" },
        sortOrder: { type: "number", description: "Display order" },
      },
      required: ["entityId", "name", "slug"],
    },
  },
  {
    name: "run_diagnostics",
    description: "Run system diagnostics to find broken references, orphaned records, and configuration issues. Returns a list of problems found.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: { type: "string", description: "Diagnostic scope", enum: ["full", "modules", "entities", "fields", "relations", "forms", "views", "actions", "statuses"] },
      },
      required: [],
    },
  },
  {
    name: "apply_repair",
    description: "Repair broken references and orphaned records found by run_diagnostics. Deletes orphaned fields/forms/views/actions/statuses/details that reference non-existent entities, and deactivates entities with broken module references.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: { type: "string", description: "Repair scope — same as diagnostics scope", enum: ["full", "modules", "entities", "fields", "relations", "forms", "views", "actions", "statuses"] },
      },
      required: [],
    },
  },
  {
    name: "update_module",
    description: "Update an existing platform module by ID. Can change name, description, icon, color, category, status.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Module ID to update" },
        name: { type: "string", description: "New module name" },
        slug: { type: "string", description: "New slug" },
        nameHe: { type: "string", description: "New Hebrew name" },
        nameEn: { type: "string", description: "New English name" },
        description: { type: "string", description: "New description" },
        icon: { type: "string", description: "New Lucide icon name" },
        color: { type: "string", description: "New color" },
        category: { type: "string", description: "New category" },
        status: { type: "string", description: "New status", enum: ["draft", "published", "archived"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_module",
    description: "Delete a platform module and all its entities, fields, and related data. WARNING: This is destructive and cannot be undone.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Module ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_entity",
    description: "Update an existing entity by ID. Can change name, description, icon, type, and feature flags.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Entity ID to update" },
        name: { type: "string", description: "New entity name" },
        namePlural: { type: "string", description: "New plural name" },
        slug: { type: "string", description: "New slug" },
        nameHe: { type: "string", description: "Hebrew name" },
        nameEn: { type: "string", description: "English name" },
        description: { type: "string", description: "New description" },
        icon: { type: "string", description: "New Lucide icon" },
        entityType: { type: "string", description: "Entity type", enum: ["master", "transaction", "child", "reference", "log", "system", "document", "analytics"] },
        hasStatus: { type: "boolean", description: "Enable status workflow" },
        hasCategories: { type: "boolean", description: "Enable categories" },
        hasAttachments: { type: "boolean", description: "Enable attachments" },
        hasNotes: { type: "boolean", description: "Enable notes" },
        hasNumbering: { type: "boolean", description: "Enable auto-numbering" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_entity",
    description: "Delete an entity and all its fields, forms, views, statuses, and related data. WARNING: Destructive.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Entity ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_field",
    description: "Update a field's properties — name, type, required, default value, options, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Field ID to update" },
        name: { type: "string", description: "New field name" },
        slug: { type: "string", description: "New field slug" },
        fieldType: { type: "string", description: "New field type" },
        nameHe: { type: "string", description: "Hebrew label" },
        nameEn: { type: "string", description: "English label" },
        description: { type: "string", description: "Field description" },
        isRequired: { type: "boolean", description: "Is required?" },
        isUnique: { type: "boolean", description: "Must be unique?" },
        isSearchable: { type: "boolean", description: "Include in search?" },
        showInList: { type: "boolean", description: "Show in list?" },
        showInForm: { type: "boolean", description: "Show in forms?" },
        defaultValue: { type: "string", description: "Default value" },
        placeholder: { type: "string", description: "Placeholder text" },
        options: { type: "array", description: "Options for select fields", items: { type: "object" } },
        sortOrder: { type: "number", description: "Display order" },
        fieldWidth: { type: "string", description: "Layout width", enum: ["full", "half", "third", "quarter"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_field",
    description: "Delete a field from an entity by field ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Field ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "reorder_fields",
    description: "Reorder fields within an entity by providing an array of field IDs in the desired order.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID" },
        fieldIds: { type: "array", description: "Array of field IDs in desired order", items: { type: "number" } },
      },
      required: ["entityId", "fieldIds"],
    },
  },
  {
    name: "update_relation",
    description: "Update a relation between entities.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Relation ID to update" },
        label: { type: "string", description: "New label" },
        reverseLabel: { type: "string", description: "New reverse label" },
        relationType: { type: "string", description: "New relation type", enum: ["one_to_one", "one_to_many", "many_to_many"] },
        cascadeDelete: { type: "boolean", description: "Cascade delete?" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_relation",
    description: "Delete a relation between entities by relation ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Relation ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_status",
    description: "Update a status definition for an entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Status ID to update" },
        name: { type: "string", description: "New status name" },
        slug: { type: "string", description: "New slug" },
        color: { type: "string", description: "New color" },
        icon: { type: "string", description: "New icon" },
        sortOrder: { type: "number", description: "Display order" },
        isDefault: { type: "boolean", description: "Is default?" },
        isFinal: { type: "boolean", description: "Is final?" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_status",
    description: "Delete a status from an entity by status ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Status ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "reorder_statuses",
    description: "Reorder statuses within an entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID" },
        statusIds: { type: "array", description: "Array of status IDs in desired order", items: { type: "number" } },
      },
      required: ["entityId", "statusIds"],
    },
  },
  {
    name: "execute_sql",
    description: "Execute arbitrary SQL against the PostgreSQL database. Use for SELECT queries to read data, or INSERT/UPDATE/DELETE to modify data. Be careful with destructive operations. IMPORTANT: All column names are snake_case (e.g. module_id, entity_type, table_name, is_active, has_status, supplier_name). NEVER use camelCase or quoted identifiers like \"moduleId\" or \"entityType\" — these will fail.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "SQL query to execute" },
        readonly: { type: "boolean", description: "If true, only allow SELECT queries (safer)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_relations",
    description: "List all relations for a specific entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list relations for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "list_statuses",
    description: "List all statuses for a specific entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list statuses for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "list_forms",
    description: "List all form definitions for a specific entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list forms for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "list_views",
    description: "List all view definitions for a specific entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list views for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "list_actions",
    description: "List all actions/buttons for a specific entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID to list actions for" },
      },
      required: ["entityId"],
    },
  },
  {
    name: "manage_records",
    description: "Create, update, or delete entity records (actual data rows). Use for managing data in any entity.",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "number", description: "Entity ID" },
        operation: { type: "string", description: "Operation to perform", enum: ["create", "update", "delete", "list"] },
        recordId: { type: "number", description: "Record ID (required for update/delete)" },
        data: { type: "object", description: "Record data (for create/update)" },
        limit: { type: "number", description: "Max records to return (for list)" },
        offset: { type: "number", description: "Offset for pagination (for list)" },
      },
      required: ["entityId", "operation"],
    },
  },
  {
    name: "manage_roles",
    description: "Create, update, delete, or list roles for access control.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Operation", enum: ["list", "create", "update", "delete"] },
        id: { type: "number", description: "Role ID (for update/delete)" },
        name: { type: "string", description: "Role name" },
        slug: { type: "string", description: "Role slug" },
        description: { type: "string", description: "Role description" },
        permissions: { type: "object", description: "Permissions object" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_permissions",
    description: "View and update permissions for a role — set which modules/entities/actions a role can access.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Operation", enum: ["get", "set"] },
        roleId: { type: "number", description: "Role ID" },
        permissions: { type: "object", description: "Permissions to set (for 'set' operation)" },
      },
      required: ["operation", "roleId"],
    },
  },
  {
    name: "update_form",
    description: "Update an existing form definition.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Form ID to update" },
        name: { type: "string", description: "New form name" },
        slug: { type: "string", description: "New slug" },
        formType: { type: "string", description: "Form type", enum: ["create", "edit", "quick_create", "wizard"] },
        isDefault: { type: "boolean", description: "Is default?" },
        sections: { type: "array", description: "Form sections", items: { type: "object" } },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_form",
    description: "Delete a form definition by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Form ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_view",
    description: "Update an existing view definition.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "View ID to update" },
        name: { type: "string", description: "New view name" },
        slug: { type: "string", description: "New slug" },
        viewType: { type: "string", description: "View type" },
        isDefault: { type: "boolean", description: "Is default?" },
        columns: { type: "array", description: "Column configuration", items: { type: "object" } },
        filters: { type: "array", description: "Default filters", items: { type: "object" } },
        sorting: { type: "array", description: "Default sorting", items: { type: "object" } },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_view",
    description: "Delete a view definition by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "View ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_action",
    description: "Update an existing action/button definition.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Action ID to update" },
        name: { type: "string", description: "New action name" },
        slug: { type: "string", description: "New slug" },
        actionType: { type: "string", description: "Action type", enum: ["page", "row", "bulk", "header", "contextual"] },
        handlerType: { type: "string", description: "Handler type", enum: ["create", "update", "delete", "duplicate", "status_change", "workflow", "modal", "navigate", "export", "import", "print", "custom"] },
        icon: { type: "string", description: "New icon" },
        color: { type: "string", description: "New color" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_action",
    description: "Delete an action/button definition by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Action ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_table_schema",
    description: "Get the schema/columns of any database table — column names, types, nullable, defaults.",
    input_schema: {
      type: "object" as const,
      properties: {
        tableName: { type: "string", description: "Table name to inspect" },
      },
      required: ["tableName"],
    },
  },
  {
    name: "get_system_stats",
    description: "Get comprehensive system statistics — DB size, connection count, table row counts, disk usage, and platform health.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "manage_users",
    description: "Create, update, delete, or list system users. Manage user accounts, reset passwords, activate/deactivate accounts.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Operation", enum: ["list", "create", "update", "delete", "reset_password"] },
        id: { type: "number", description: "User ID (for update/delete/reset_password)" },
        username: { type: "string", description: "Username (for create)" },
        password: { type: "string", description: "Password (for create/reset_password)" },
        fullName: { type: "string", description: "Full name" },
        email: { type: "string", description: "Email" },
        phone: { type: "string", description: "Phone" },
        department: { type: "string", description: "Department" },
        jobTitle: { type: "string", description: "Job title" },
        isActive: { type: "boolean", description: "Active status" },
        isSuperAdmin: { type: "boolean", description: "Super admin flag" },
      },
      required: ["operation"],
    },
  },
  {
    name: "backup_database",
    description: "Create a logical backup snapshot of key platform tables. Returns row counts and sample data for verification.",
    input_schema: {
      type: "object" as const,
      properties: {
        tables: { type: "array", description: "Specific tables to backup (default: all platform tables)", items: { type: "string" } },
      },
      required: [],
    },
  },
  {
    name: "manage_menu_items",
    description: "CRUD operations on system_menu_items — sidebar navigation items. Use to add, update, delete, or list menu items.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", description: "Operation", enum: ["list", "create", "update", "delete"] },
        id: { type: "number", description: "Menu item ID (for update/delete)" },
        module_id: { type: "number", description: "Module ID" },
        entity_id: { type: "number", description: "Entity ID" },
        parent_id: { type: "number", description: "Parent menu item ID" },
        label: { type: "string", description: "Label (Hebrew)" },
        label_he: { type: "string", description: "Hebrew label" },
        label_en: { type: "string", description: "English label" },
        icon: { type: "string", description: "Icon name" },
        path: { type: "string", description: "Route path" },
        sort_order: { type: "number", description: "Sort order" },
        is_active: { type: "boolean", description: "Is visible" },
        section: { type: "string", description: "Section name" },
        roles: { type: "string", description: "Roles (comma-separated)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_automations",
    description: "CRUD on platform_automations. Columns: module_id, name, slug, description, trigger_type, trigger_entity_id, trigger_config(json), conditions(json), actions(json), is_active.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        module_id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        trigger_type: { type: "string" },
        trigger_entity_id: { type: "number" },
        trigger_config: { type: "object" },
        conditions: { type: "object" },
        actions: { type: "object" },
        is_active: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_workflows",
    description: "CRUD on platform_workflows. Columns: module_id, name, slug, description, trigger_type, trigger_config(json), actions(json), conditions(json), is_active.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        module_id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        trigger_type: { type: "string" },
        trigger_config: { type: "object" },
        actions: { type: "object" },
        conditions: { type: "object" },
        is_active: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_widgets",
    description: "CRUD on platform_widgets. Columns: module_id, name, slug, widget_type, entity_id, config(json), position(json), is_active.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        module_id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        widget_type: { type: "string" },
        entity_id: { type: "number" },
        config: { type: "object" },
        position: { type: "object" },
        is_active: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_document_templates",
    description: "CRUD on document_templates. Columns: name, slug, description, document_type, entity_id, template_content, header_content, footer_content, placeholders(json), styles(json), page_settings(json), sample_data(json), is_active.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        document_type: { type: "string" },
        entity_id: { type: "number" },
        template_content: { type: "string" },
        header_content: { type: "string" },
        footer_content: { type: "string" },
        placeholders: { type: "object" },
        styles: { type: "object" },
        page_settings: { type: "object" },
        sample_data: { type: "object" },
        is_active: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_report_definitions",
    description: "CRUD on report_definitions. Columns: name, slug, description, entity_id, query_config(json), columns(json), aggregations(json), grouping(json), filters(json), sorting(json), calculated_fields(json), display_type, chart_config(json), schedule_config(json), schedule_email, is_active.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        entity_id: { type: "number" },
        query_config: { type: "object" },
        columns: { type: "object" },
        aggregations: { type: "object" },
        grouping: { type: "object" },
        filters: { type: "object" },
        sorting: { type: "object" },
        calculated_fields: { type: "object" },
        display_type: { type: "string" },
        chart_config: { type: "object" },
        schedule_config: { type: "object" },
        schedule_email: { type: "string" },
        is_active: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_validation_rules",
    description: "CRUD on validation_rules. Columns: entity_id, name, rule_type, field_slug, operator, value, error_message, error_message_he, sort_order, is_active, conditions(json).",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        entity_id: { type: "number" },
        name: { type: "string" },
        rule_type: { type: "string" },
        field_slug: { type: "string" },
        operator: { type: "string" },
        value: { type: "string" },
        error_message: { type: "string" },
        error_message_he: { type: "string" },
        sort_order: { type: "number" },
        is_active: { type: "boolean" },
        conditions: { type: "object" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_status_transitions",
    description: "CRUD on status_transitions. Columns: entity_id, from_status_id, to_status_id, label, icon, conditions(json), settings(json).",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        entity_id: { type: "number" },
        from_status_id: { type: "number" },
        to_status_id: { type: "number" },
        label: { type: "string" },
        icon: { type: "string" },
        conditions: { type: "object" },
        settings: { type: "object" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_notifications",
    description: "CRUD on notifications. Columns: type, title, message, module_id, record_id, is_read. Also supports mark_read operation.",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: { type: "string", enum: ["list", "create", "mark_read", "delete"] },
        id: { type: "number" },
        type: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },
        module_id: { type: "number" },
        record_id: { type: "number" },
        is_read: { type: "boolean" },
      },
      required: ["operation"],
    },
  },
  {
    name: "manage_dashboard",
    description: "CRUD on dashboard. target='pages': module_id,name,slug,is_default,layout(json),settings(json). target='widgets': dashboard_id,widget_type,title,entity_id,config(json),position(json),size(json),settings(json).",
    input_schema: {
      type: "object" as const,
      properties: {
        target: { type: "string", enum: ["pages", "widgets"], description: "Manage pages or widgets" },
        operation: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "number" },
        module_id: { type: "number" },
        name: { type: "string" },
        slug: { type: "string" },
        is_default: { type: "boolean" },
        layout: { type: "object" },
        dashboard_id: { type: "number", description: "Dashboard page ID (for widgets)" },
        widget_type: { type: "string" },
        title: { type: "string" },
        entity_id: { type: "number" },
        config: { type: "object" },
        position: { type: "object" },
        size: { type: "object" },
        settings: { type: "object" },
      },
      required: ["target", "operation"],
    },
  },
  {
    name: "execute_code",
    description: "Execute JavaScript or TypeScript code in a sandboxed Node.js environment. Code runs in the project workspace with access to installed packages. Use for data processing, testing logic, generating content, or any computation. Output is captured via console.log/console.error. Max execution time: 30 seconds.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "JavaScript/TypeScript code to execute. Use console.log() for output." },
        language: { type: "string", enum: ["javascript", "typescript"], description: "Language: javascript (default) or typescript" },
      },
      required: ["code"],
    },
  },
  {
    name: "execute_shell",
    description: "Execute a shell command in the project workspace. Use for: npm/pnpm install, git operations, running build commands, checking file systems, running scripts. Max execution time: 60 seconds. Destructive OS commands are blocked.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory (relative to project root). Default: project root." },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read a file from the project filesystem. Returns content with line numbers. Use to inspect existing code, configs, schemas, or any text file. Supports offset/limit for large files.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "File path relative to project root (e.g. 'artifacts/erp-app/src/pages/suppliers.tsx')" },
        offset: { type: "number", description: "Start line (1-indexed). Default: 1" },
        limit: { type: "number", description: "Max lines to return. Default: 200" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file on the project filesystem. Use to create new components, modify existing files, add routes, update configs. Can create parent directories automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: { type: "string", description: "File path relative to project root (e.g. 'artifacts/erp-app/src/pages/new-page.tsx')" },
        content: { type: "string", description: "Full file content to write" },
        createDirs: { type: "boolean", description: "Create parent directories if they don't exist. Default: true" },
        append: { type: "boolean", description: "Append to file instead of overwriting. Default: false" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories in the project. Use to explore the project structure, find files, understand the codebase layout.",
    input_schema: {
      type: "object" as const,
      properties: {
        dirPath: { type: "string", description: "Directory path relative to project root. Default: project root" },
        recursive: { type: "boolean", description: "List recursively (max depth 5). Default: false" },
        pattern: { type: "string", description: "Regex pattern to filter file names (e.g. '\\.tsx$' for TSX files)" },
      },
    },
  },
  {
    name: "search_files",
    description: "Search for text/patterns across project files using grep. Use to find function definitions, imports, usages, or any text pattern in the codebase.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Text or regex pattern to search for" },
        directory: { type: "string", description: "Directory to search in (relative to project root). Default: entire project" },
        filePattern: { type: "string", description: "File glob pattern (e.g. '*.tsx', '*.ts'). Default: all code files" },
        maxResults: { type: "number", description: "Maximum results. Default: 50, max: 100" },
      },
      required: ["pattern"],
    },
  },
];

const CORE_TOOLS = ["list_modules", "list_entities", "list_fields", "execute_sql", "query_database", "get_table_schema"];
const CHANNEL_TOOLS: Record<string, string[]> = {
  development: [...CORE_TOOLS, "create_module", "create_entity", "create_field", "create_status", "create_relation", "create_form", "create_view", "create_action", "create_detail", "create_category", "update_module", "update_entity", "update_field", "update_relation", "update_status", "update_form", "update_view", "update_action", "delete_module", "delete_entity", "delete_field", "delete_relation", "delete_status", "delete_form", "delete_view", "delete_action", "reorder_fields", "reorder_statuses", "manage_menu_items", "manage_records", "read_file", "write_file", "list_files", "search_files", "execute_code", "execute_shell"],
  management: [...CORE_TOOLS, "get_system_stats", "manage_users", "manage_roles", "manage_permissions", "backup_database", "run_diagnostics", "apply_repair", "manage_menu_items"],
  dataflow: [...CORE_TOOLS, "list_relations", "list_statuses", "manage_records", "manage_report_definitions", "manage_document_templates"],
  testing: [...CORE_TOOLS, "run_diagnostics", "apply_repair", "get_system_stats", "list_statuses", "list_relations", "list_forms", "list_views", "list_actions", "read_file", "search_files"],
  support: ["execute_sql", "query_database", "list_modules", "list_entities"],
  automation: [...CORE_TOOLS, "manage_automations", "manage_workflows", "manage_status_transitions", "manage_validation_rules", "manage_notifications", "manage_widgets", "manage_dashboard", "read_file", "write_file", "execute_code", "execute_shell"],
  architecture: [...CORE_TOOLS, "create_module", "create_entity", "create_field", "create_status", "create_relation", "manage_roles", "manage_permissions", "get_system_stats", "read_file", "search_files"],
};

function getToolsForChannel(channel: string): ToolDefinition[] {
  const allowed = CHANNEL_TOOLS[channel];
  if (!allowed) return BUILDER_TOOLS;
  const allowedSet = new Set(allowed);
  return BUILDER_TOOLS.filter(t => allowedSet.has(t.name));
}

const PREDEFINED_QUERIES: Record<string, string> = {
  'suppliers_list': 'SELECT id, supplier_name, status, city, category, phone, email FROM suppliers ORDER BY id',
  'suppliers_active': "SELECT id, supplier_name, city, category FROM suppliers WHERE status IN ('פעיל', 'active') ORDER BY id",
  'suppliers_count': 'SELECT count(*) as total FROM suppliers',
  'materials_list': 'SELECT id, material_name, material_number, category, unit, current_stock, reorder_point, status FROM raw_materials ORDER BY id',
  'materials_low_stock': 'SELECT material_name, current_stock, reorder_point FROM raw_materials WHERE current_stock IS NOT NULL AND reorder_point IS NOT NULL AND CAST(current_stock AS numeric) <= CAST(reorder_point AS numeric)',
  'requests_list': 'SELECT id, request_number, title, status, priority, requester_name, department, total_estimated FROM purchase_requests ORDER BY id DESC LIMIT 20',
  'orders_list': 'SELECT id, order_number, supplier_id, status, total_amount, order_date FROM purchase_orders ORDER BY id DESC LIMIT 20',
  'receipts_list': 'SELECT id, receipt_number, supplier_id, status, receipt_date FROM goods_receipts ORDER BY id DESC LIMIT 20',
  'db_tables': "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  'db_size': 'SELECT pg_size_pretty(pg_database_size(current_database())) as size',
  'modules_list': 'SELECT id, name, slug, description, status FROM platform_modules ORDER BY id',
};

const BUILDER_API_PORT = process.env.PORT || "8080";

async function callBuilderApi(method: string, path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `http://localhost:${BUILDER_API_PORT}/api${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : "Network error";
    return { ok: false, status: 0, data: { error: `Builder API unreachable: ${msg}` } };
  }
  const text = await r.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : { error: "Empty response from builder API" };
  } catch {
    data = { error: `Non-JSON response (${r.status}): ${text.substring(0, 200)}` };
  }
  return { ok: r.ok, status: r.status, data };
}

interface ToolResult {
  success: boolean;
  result: Record<string, unknown>;
  link?: string;
}

async function genericTableCrud(tableName: string, labelHe: string, input: Record<string, unknown>, allowedCols: string[]): Promise<ToolResult> {
  const op = input.operation as string;
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "");

  if (op === "list") {
    const rows = await safeQuery(`SELECT * FROM ${safeTable} ORDER BY id DESC LIMIT 100`);
    return { success: true, result: { items: rows, count: rows.length, table: safeTable } };
  }
  if (op === "create") {
    const cols: string[] = [];
    const vals: string[] = [];
    for (const col of allowedCols) {
      const v = input[col];
      if (v === undefined || v === null) continue;
      cols.push(col);
      if (typeof v === "number") vals.push(String(v));
      else if (typeof v === "boolean") vals.push(v ? "true" : "false");
      else if (typeof v === "object") vals.push(`'${JSON.stringify(v).replace(/'/g, "''")}'`);
      else vals.push(`'${String(v).replace(/'/g, "''")}'`);
    }
    if (cols.length === 0) return { success: false, result: { error: "אין שדות תקינים" } };
    const r = await db.execute(sql.raw(`INSERT INTO ${safeTable} (${cols.join(", ")}) VALUES (${vals.join(", ")}) RETURNING *`));
    return { success: true, result: { message: `${labelHe} נוצר`, item: r.rows?.[0] } };
  }
  if (op === "update") {
    const id = parseInt(String(input.id));
    if (isNaN(id)) return { success: false, result: { error: "נדרש מזהה" } };
    const sets: string[] = [];
    for (const col of allowedCols) {
      const v = input[col];
      if (v === undefined) continue;
      if (v === null) { sets.push(`${col} = NULL`); continue; }
      if (typeof v === "number") sets.push(`${col} = ${v}`);
      else if (typeof v === "boolean") sets.push(`${col} = ${v}`);
      else if (typeof v === "object") sets.push(`${col} = '${JSON.stringify(v).replace(/'/g, "''")}'`);
      else sets.push(`${col} = '${String(v).replace(/'/g, "''")}'`);
    }
    if (sets.length === 0) return { success: false, result: { error: "אין שדות לעדכון" } };
    const r = await db.execute(sql.raw(`UPDATE ${safeTable} SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
    if (!r.rows?.length) return { success: false, result: { error: `${labelHe} לא נמצא` } };
    return { success: true, result: { message: `${labelHe} ${id} עודכן`, item: r.rows[0] } };
  }
  if (op === "delete") {
    const id = parseInt(String(input.id));
    if (isNaN(id)) return { success: false, result: { error: "נדרש מזהה" } };
    await db.execute(sql.raw(`DELETE FROM ${safeTable} WHERE id = ${id}`));
    return { success: true, result: { message: `${labelHe} ${id} נמחק` } };
  }
  return { success: false, result: { error: `פעולה לא מוכרת: ${op}` } };
}

const SCHEMA_MUTATING_TOOLS = new Set([
  "create_module", "update_module", "delete_module",
  "create_entity", "update_entity", "delete_entity",
  "create_field", "update_field", "delete_field", "reorder_fields",
  "create_status", "update_status", "delete_status", "reorder_statuses",
  "create_relation", "update_relation", "delete_relation",
  "create_form", "create_view", "create_action", "create_detail", "create_category",
  "apply_repair",
  "manage_menu_items",
]);

async function executeToolCall(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "list_modules": {
        const modules = await db.select().from(platformModulesTable).orderBy(asc(platformModulesTable.id));
        return { success: true, result: { modules, count: modules.length } };
      }
      case "list_entities": {
        const where = input.moduleId
          ? eq(moduleEntitiesTable.moduleId, input.moduleId as number)
          : undefined;
        const entities = await db.select().from(moduleEntitiesTable)
          .where(where)
          .orderBy(asc(moduleEntitiesTable.id));
        return { success: true, result: { entities, count: entities.length } };
      }
      case "list_fields": {
        const fields = await db.select().from(entityFieldsTable)
          .where(eq(entityFieldsTable.entityId, input.entityId as number))
          .orderBy(asc(entityFieldsTable.sortOrder));
        return { success: true, result: { fields, count: fields.length } };
      }
      case "query_database": {
        const queryTemplate = PREDEFINED_QUERIES[input.queryId as string];
        if (!queryTemplate) return { success: false, result: { error: `Unknown query: ${input.queryId}` } };
        const r = await db.execute(sql.raw(queryTemplate));
        return { success: true, result: { queryId: input.queryId, rows: r.rows || [], rowCount: r.rows?.length || 0 } };
      }
      case "create_module": {
        const resp = await callBuilderApi("POST", "/claude/builder/modules", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const mod = resp.data;
        return { success: true, result: { message: `Module '${mod.name}' created (ID: ${mod.id})`, module: mod }, link: `/builder/module/${mod.id}` };
      }
      case "create_entity": {
        const resp = await callBuilderApi("POST", "/claude/builder/entities", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const entity = resp.data;
        return { success: true, result: { message: `Entity '${entity.name}' created (ID: ${entity.id})`, entity }, link: `/builder/entity/${entity.id}` };
      }
      case "create_field": {
        const resp = await callBuilderApi("POST", "/claude/builder/fields", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const field = resp.data;
        return { success: true, result: { message: `Field '${field.name}' created (ID: ${field.id})`, field }, link: `/builder/entity/${field.entityId}` };
      }
      case "create_relation": {
        const resp = await callBuilderApi("POST", "/claude/builder/relations", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const rel = resp.data;
        return { success: true, result: { message: `Relation '${rel.label}' created (ID: ${rel.id})`, relation: rel } };
      }
      case "create_form": {
        const resp = await callBuilderApi("POST", "/claude/builder/forms", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const form = resp.data;
        return { success: true, result: { message: `Form '${form.name}' created (ID: ${form.id})`, form }, link: `/builder/entity/${form.entityId}` };
      }
      case "create_view": {
        const resp = await callBuilderApi("POST", "/claude/builder/views", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const view = resp.data;
        return { success: true, result: { message: `View '${view.name}' created (ID: ${view.id})`, view }, link: `/builder/entity/${view.entityId}` };
      }
      case "create_status": {
        const resp = await callBuilderApi("POST", "/claude/builder/statuses", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const status = resp.data;
        return { success: true, result: { message: `Status '${status.name}' created (ID: ${status.id})`, status }, link: `/builder/entity/${status.entityId}` };
      }
      case "create_action": {
        const resp = await callBuilderApi("POST", "/claude/builder/actions", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const action = resp.data;
        return { success: true, result: { message: `Action '${action.name}' created (ID: ${action.id})`, action }, link: `/builder/entity/${action.entityId}` };
      }
      case "create_detail": {
        const resp = await callBuilderApi("POST", "/claude/builder/details", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const detail = resp.data;
        return { success: true, result: { message: `Detail page '${detail.name}' created (ID: ${detail.id})`, detail }, link: `/builder/entity/${detail.entityId}` };
      }
      case "create_category": {
        const resp = await callBuilderApi("POST", "/claude/builder/categories", input);
        if (!resp.ok) return { success: false, result: resp.data };
        const cat = resp.data;
        return { success: true, result: { message: `Category '${cat.name}' created (ID: ${cat.id})`, category: cat } };
      }
      case "run_diagnostics": {
        const resp = await callBuilderApi("POST", "/claude/repair/diagnose", { scope: input.scope || "full" });
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: resp.data };
      }
      case "apply_repair": {
        const diagResp = await callBuilderApi("POST", "/claude/repair/diagnose", { scope: input.scope || "full" });
        if (!diagResp.ok) return { success: false, result: diagResp.data };
        const sessionId = diagResp.data.sessionId as string;
        const totalDiagnoses = diagResp.data.totalDiagnoses as number;
        if (totalDiagnoses === 0) {
          return { success: true, result: { message: "No issues found — system is healthy", totalDiagnoses: 0 } };
        }
        const propResp = await callBuilderApi("POST", "/claude/repair/propose", { sessionId });
        if (!propResp.ok) return { success: false, result: propResp.data };
        const valResp = await callBuilderApi("POST", "/claude/repair/validate", { sessionId });
        if (!valResp.ok) return { success: false, result: valResp.data };
        const applyResp = await callBuilderApi("POST", "/claude/repair/apply", { sessionId });
        if (!applyResp.ok) return { success: false, result: applyResp.data };
        return { success: true, result: { message: `Repair completed`, ...applyResp.data } };
      }
      case "update_module": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/modules/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Module ${id} updated`, module: resp.data } };
      }
      case "delete_module": {
        const id = input.id as number;
        const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, id));
        for (const ent of entities) {
          await db.delete(entityFieldsTable).where(eq(entityFieldsTable.entityId, ent.id));
          await db.delete(entityStatusesTable).where(eq(entityStatusesTable.entityId, ent.id));
          await db.delete(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, ent.id));
          await db.delete(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, ent.id));
          await db.delete(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, ent.id));
          await db.delete(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, ent.id));
        }
        await db.delete(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, id));
        await db.delete(platformModulesTable).where(eq(platformModulesTable.id, id));
        return { success: true, result: { message: `Module ${id} and all related data deleted`, deletedEntities: entities.length } };
      }
      case "update_entity": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/entities/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Entity ${id} updated`, entity: resp.data } };
      }
      case "delete_entity": {
        const id = input.id as number;
        await db.delete(entityFieldsTable).where(eq(entityFieldsTable.entityId, id));
        await db.delete(entityStatusesTable).where(eq(entityStatusesTable.entityId, id));
        await db.delete(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, id));
        await db.delete(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, id));
        await db.delete(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, id));
        await db.delete(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, id));
        await db.delete(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
        return { success: true, result: { message: `Entity ${id} and all related data deleted` } };
      }
      case "update_field": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/fields/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Field ${id} updated`, field: resp.data } };
      }
      case "delete_field": {
        const id = input.id as number;
        await db.delete(entityFieldsTable).where(eq(entityFieldsTable.id, id));
        return { success: true, result: { message: `Field ${id} deleted` } };
      }
      case "reorder_fields": {
        const { entityId, fieldIds } = input as { entityId: number; fieldIds: number[] };
        for (let i = 0; i < fieldIds.length; i++) {
          await db.update(entityFieldsTable).set({ sortOrder: i + 1 }).where(
            and(eq(entityFieldsTable.id, fieldIds[i]), eq(entityFieldsTable.entityId, entityId))
          );
        }
        return { success: true, result: { message: `Reordered ${fieldIds.length} fields for entity ${entityId}` } };
      }
      case "update_relation": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/relations/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Relation ${id} updated`, relation: resp.data } };
      }
      case "delete_relation": {
        const id = input.id as number;
        await db.delete(entityRelationsTable).where(eq(entityRelationsTable.id, id));
        return { success: true, result: { message: `Relation ${id} deleted` } };
      }
      case "update_status": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/statuses/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Status ${id} updated`, status: resp.data } };
      }
      case "delete_status": {
        const id = input.id as number;
        await db.delete(entityStatusesTable).where(eq(entityStatusesTable.id, id));
        return { success: true, result: { message: `Status ${id} deleted` } };
      }
      case "reorder_statuses": {
        const { entityId, statusIds } = input as { entityId: number; statusIds: number[] };
        for (let i = 0; i < statusIds.length; i++) {
          await db.update(entityStatusesTable).set({ sortOrder: i + 1 }).where(
            and(eq(entityStatusesTable.id, statusIds[i]), eq(entityStatusesTable.entityId, entityId))
          );
        }
        return { success: true, result: { message: `Reordered ${statusIds.length} statuses for entity ${entityId}` } };
      }
      case "execute_sql": {
        const query = (input.query as string).trim();
        const readonly = input.readonly as boolean | undefined;
        if (readonly && !/^\s*SELECT/i.test(query)) {
          return { success: false, result: { error: "Readonly mode: only SELECT queries allowed" } };
        }
        const dangerousPatterns = /DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE\s+ALL/i;
        if (dangerousPatterns.test(query)) {
          return { success: false, result: { error: "Blocked: extremely destructive SQL not allowed" } };
        }
        const r = await db.execute(sql.raw(query));
        const rows = r.rows || [];
        const rowCount = rows.length;
        return { success: true, result: { query, rows: rows.slice(0, 100), rowCount, truncated: rowCount > 100 } };
      }
      case "list_relations": {
        const entityId = input.entityId as number;
        const relations = await db.select().from(entityRelationsTable)
          .where(eq(entityRelationsTable.sourceEntityId, entityId))
          .orderBy(asc(entityRelationsTable.id));
        return { success: true, result: { relations, count: relations.length } };
      }
      case "list_statuses": {
        const entityId = input.entityId as number;
        const statuses = await db.select().from(entityStatusesTable)
          .where(eq(entityStatusesTable.entityId, entityId))
          .orderBy(asc(entityStatusesTable.sortOrder));
        return { success: true, result: { statuses, count: statuses.length } };
      }
      case "list_forms": {
        const entityId = input.entityId as number;
        const forms = await db.select().from(formDefinitionsTable)
          .where(eq(formDefinitionsTable.entityId, entityId))
          .orderBy(asc(formDefinitionsTable.id));
        return { success: true, result: { forms, count: forms.length } };
      }
      case "list_views": {
        const entityId = input.entityId as number;
        const views = await db.select().from(viewDefinitionsTable)
          .where(eq(viewDefinitionsTable.entityId, entityId))
          .orderBy(asc(viewDefinitionsTable.id));
        return { success: true, result: { views, count: views.length } };
      }
      case "list_actions": {
        const entityId = input.entityId as number;
        const actions = await db.select().from(actionDefinitionsTable)
          .where(eq(actionDefinitionsTable.entityId, entityId))
          .orderBy(asc(actionDefinitionsTable.id));
        return { success: true, result: { actions, count: actions.length } };
      }
      case "manage_records": {
        const entityId = input.entityId as number;
        const op = input.operation as string;
        if (op === "list") {
          const limit = (input.limit as number) || 20;
          const offset = (input.offset as number) || 0;
          const resp = await callBuilderApi("GET", `/platform/entities/${entityId}/records?limit=${limit}&offset=${offset}`, undefined);
          return { success: resp.ok, result: resp.data };
        }
        if (op === "create") {
          const resp = await callBuilderApi("POST", `/platform/entities/${entityId}/records`, { data: input.data });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: "Record created", record: resp.data } };
        }
        if (op === "update") {
          const recordId = input.recordId as number;
          const resp = await callBuilderApi("PUT", `/platform/records/${recordId}`, { data: input.data });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Record ${recordId} updated`, record: resp.data } };
        }
        if (op === "delete") {
          const recordId = input.recordId as number;
          const resp = await callBuilderApi("DELETE", `/platform/records/${recordId}`, undefined);
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Record ${recordId} deleted` } };
        }
        return { success: false, result: { error: `Unknown operation: ${op}` } };
      }
      case "manage_roles": {
        const op = input.operation as string;
        if (op === "list") {
          const resp = await callBuilderApi("GET", "/platform/roles", undefined);
          return { success: resp.ok, result: resp.data };
        }
        if (op === "create") {
          const resp = await callBuilderApi("POST", "/platform/roles", { name: input.name, slug: input.slug, description: input.description, permissions: input.permissions });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: "Role created", role: resp.data } };
        }
        if (op === "update") {
          const resp = await callBuilderApi("PUT", `/platform/roles/${input.id}`, { name: input.name, description: input.description, permissions: input.permissions });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Role ${input.id} updated`, role: resp.data } };
        }
        if (op === "delete") {
          const resp = await callBuilderApi("DELETE", `/platform/roles/${input.id}`, undefined);
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Role ${input.id} deleted` } };
        }
        return { success: false, result: { error: `Unknown operation: ${op}` } };
      }
      case "manage_permissions": {
        const op = input.operation as string;
        const roleId = input.roleId as number;
        if (op === "get") {
          const resp = await callBuilderApi("GET", `/platform/roles/${roleId}`, undefined);
          return { success: resp.ok, result: resp.data };
        }
        if (op === "set") {
          const resp = await callBuilderApi("PUT", `/platform/roles/${roleId}`, { permissions: input.permissions });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Permissions updated for role ${roleId}`, role: resp.data } };
        }
        return { success: false, result: { error: `Unknown operation: ${op}` } };
      }
      case "update_form": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/forms/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Form ${id} updated`, form: resp.data } };
      }
      case "delete_form": {
        const id = input.id as number;
        await db.delete(formDefinitionsTable).where(eq(formDefinitionsTable.id, id));
        return { success: true, result: { message: `Form ${id} deleted` } };
      }
      case "update_view": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/views/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `View ${id} updated`, view: resp.data } };
      }
      case "delete_view": {
        const id = input.id as number;
        await db.delete(viewDefinitionsTable).where(eq(viewDefinitionsTable.id, id));
        return { success: true, result: { message: `View ${id} deleted` } };
      }
      case "update_action": {
        const { id, ...updates } = input;
        const resp = await callBuilderApi("PUT", `/claude/builder/actions/${id}`, updates);
        if (!resp.ok) return { success: false, result: resp.data };
        return { success: true, result: { message: `Action ${id} updated`, action: resp.data } };
      }
      case "delete_action": {
        const id = input.id as number;
        await db.delete(actionDefinitionsTable).where(eq(actionDefinitionsTable.id, id));
        return { success: true, result: { message: `Action ${id} deleted` } };
      }
      case "manage_users": {
        const op = input.operation as string;
        if (op === "list") {
          const users = await safeQuery("SELECT id, username, email, full_name, full_name_he, phone, department, job_title, is_active, is_super_admin, last_login_at, login_count, created_at FROM users ORDER BY id");
          return { success: true, result: { users, count: users.length } };
        }
        if (op === "create") {
          const resp = await callBuilderApi("POST", "/auth/register", {
            username: input.username,
            password: input.password,
            fullName: input.fullName,
            fullNameHe: input.fullName,
            email: input.email,
            phone: input.phone,
            department: input.department,
            jobTitle: input.jobTitle,
          });
          if (!resp.ok) return { success: false, result: resp.data };
          if (input.isSuperAdmin) {
            const uname = String(input.username);
            await db.execute(sql`UPDATE users SET is_super_admin = true WHERE username = ${uname}`);
          }
          return { success: true, result: { message: `User '${input.username}' created`, user: resp.data } };
        }
        if (op === "update") {
          const userId = Number(input.id);
          if (!userId) return { success: false, result: { error: "User ID required" } };
          const updateData: Record<string, any> = {};
          if (input.fullName) updateData.fullName = input.fullName;
          if (input.email !== undefined) updateData.email = input.email;
          if (input.phone !== undefined) updateData.phone = input.phone;
          if (input.department !== undefined) updateData.department = input.department;
          if (input.jobTitle !== undefined) updateData.jobTitle = input.jobTitle;
          if (input.isActive !== undefined) updateData.isActive = input.isActive;
          if (input.isSuperAdmin !== undefined) updateData.isSuperAdmin = input.isSuperAdmin;
          if (Object.keys(updateData).length === 0) return { success: false, result: { error: "No fields to update" } };
          const resp = await callBuilderApi("PUT", `/auth/users/${userId}`, updateData);
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `User ${userId} updated` } };
        }
        if (op === "delete") {
          const userId = Number(input.id);
          if (!userId) return { success: false, result: { error: "User ID required" } };
          await db.execute(sql`DELETE FROM user_sessions WHERE user_id = ${userId}`);
          await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
          return { success: true, result: { message: `User ${userId} deleted` } };
        }
        if (op === "reset_password") {
          const userId = Number(input.id);
          const resp = await callBuilderApi("PUT", `/auth/users/${userId}`, { password: input.password });
          if (!resp.ok) return { success: false, result: resp.data };
          return { success: true, result: { message: `Password reset for user ${userId}` } };
        }
        return { success: false, result: { error: `Unknown operation: ${op}` } };
      }
      case "get_table_schema": {
        const tableName = input.tableName as string;
        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
        const cols = await safeQuery(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${safeName}' ORDER BY ordinal_position`);
        return { success: true, result: { table: safeName, columns: cols, columnCount: cols.length } };
      }
      case "get_system_stats": {
        const dbSize = await safeQuery("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
        const connCount = await safeQuery("SELECT count(*) as c FROM pg_stat_activity");
        const tables = await safeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
        const tableStats: Record<string, number> = {};
        for (const t of tables) {
          const name = t.table_name as string;
          const cnt = await safeCount(name);
          if (cnt > 0) tableStats[name] = cnt;
        }
        return { success: true, result: {
          databaseSize: dbSize[0]?.size,
          activeConnections: connCount[0]?.c,
          totalTables: tables.length,
          tablesWithData: tableStats,
        }};
      }
      case "backup_database": {
        const targetTables = (input.tables as string[]) || ["platform_modules", "module_entities", "entity_fields", "entity_statuses", "entity_relations", "form_definitions", "view_definitions", "action_definitions", "suppliers", "raw_materials", "purchase_requests", "purchase_orders"];
        const snapshot: Record<string, { count: number; sample: unknown[] }> = {};
        for (const t of targetTables) {
          const cnt = await safeCount(t);
          const sample = await safeQuery(`SELECT * FROM ${t.replace(/[^a-zA-Z0-9_]/g, "")} LIMIT 3`);
          snapshot[t] = { count: cnt, sample };
        }
        return { success: true, result: { message: "Backup snapshot created", timestamp: new Date().toISOString(), snapshot } };
      }
      case "manage_menu_items":
        return genericTableCrud("system_menu_items", "פריט תפריט", input, ["module_id","entity_id","parent_id","label","label_he","label_en","icon","path","sort_order","is_active","settings","section","roles"]);
      case "manage_automations":
        return genericTableCrud("platform_automations", "אוטומציה", input, ["module_id","name","slug","description","trigger_type","trigger_entity_id","trigger_config","conditions","actions","is_active"]);
      case "manage_workflows":
        return genericTableCrud("platform_workflows", "workflow", input, ["module_id","name","slug","description","trigger_type","trigger_config","actions","conditions","is_active"]);
      case "manage_widgets":
        return genericTableCrud("platform_widgets", "ווידג'ט", input, ["module_id","name","slug","widget_type","entity_id","config","position","is_active"]);
      case "manage_document_templates":
        return genericTableCrud("document_templates", "תבנית מסמך", input, ["name","slug","description","document_type","entity_id","template_content","header_content","footer_content","placeholders","styles","page_settings","sample_data","is_active"]);
      case "manage_report_definitions":
        return genericTableCrud("report_definitions", "הגדרת דוח", input, ["name","slug","description","entity_id","query_config","columns","aggregations","grouping","filters","sorting","calculated_fields","display_type","chart_config","schedule_config","schedule_email","is_active"]);
      case "manage_validation_rules":
        return genericTableCrud("validation_rules", "חוק ולידציה", input, ["entity_id","name","rule_type","field_slug","operator","value","error_message","error_message_he","sort_order","is_active","conditions"]);
      case "manage_status_transitions":
        return genericTableCrud("status_transitions", "מעבר סטטוס", input, ["entity_id","from_status_id","to_status_id","label","icon","conditions","settings"]);
      case "manage_notifications": {
        const op = input.operation as string;
        if (op === "mark_read") {
          const id = parseInt(String(input.id));
          if (isNaN(id)) return { success: false, result: { error: "נדרש מזהה" } };
          await db.execute(sql.raw(`UPDATE notifications SET is_read = true WHERE id = ${id}`));
          return { success: true, result: { message: `Notification ${id} marked as read` } };
        }
        return genericTableCrud("notifications", "התראה", input, ["type","title","message","module_id","record_id","is_read"]);
      }
      case "manage_dashboard": {
        const target = input.target as string;
        if (target !== "pages" && target !== "widgets") return { success: false, result: { error: "target must be 'pages' or 'widgets'" } };
        const tableName = target === "pages" ? "system_dashboard_pages" : "system_dashboard_widgets";
        const labelHe = target === "pages" ? "דף דשבורד" : "ווידג'ט דשבורד";
        const cols = target === "pages"
          ? ["module_id","name","slug","is_default","layout","settings"]
          : ["dashboard_id","widget_type","title","entity_id","config","position","size","settings"];
        return genericTableCrud(tableName, labelHe, input, cols);
      }
      case "execute_code": {
        const resp = await callBuilderApi("POST", "/claude/execute/code", { code: input.code, language: input.language || "javascript" });
        return { success: resp.ok, result: resp.data };
      }
      case "execute_shell": {
        const resp = await callBuilderApi("POST", "/claude/execute/shell", { command: input.command, cwd: input.cwd });
        return { success: resp.ok, result: resp.data };
      }
      case "read_file": {
        const resp = await callBuilderApi("POST", "/claude/execute/read-file", { filePath: input.filePath, offset: input.offset, limit: input.limit });
        return { success: resp.ok, result: resp.data };
      }
      case "write_file": {
        const resp = await callBuilderApi("POST", "/claude/execute/write-file", { filePath: input.filePath, content: input.content, createDirs: input.createDirs !== false, append: input.append || false });
        return { success: resp.ok, result: resp.data };
      }
      case "list_files": {
        const resp = await callBuilderApi("POST", "/claude/execute/list-files", { dirPath: input.dirPath, recursive: input.recursive, pattern: input.pattern });
        return { success: resp.ok, result: resp.data };
      }
      case "search_files": {
        const resp = await callBuilderApi("POST", "/claude/execute/search-files", { pattern: input.pattern, directory: input.directory, filePattern: input.filePattern, maxResults: input.maxResults });
        return { success: resp.ok, result: resp.data };
      }
      default:
        return { success: false, result: { error: `Unknown tool: ${toolName}` } };
    }
  } catch (err: unknown) {
    const error = err as { code?: string; issues?: unknown[]; message?: string };
    const errMsg = error.code === "23505" ? "Duplicate key — record already exists"
      : error.issues ? `Validation error: ${JSON.stringify(error.issues)}`
      : error.message || "Unknown error";
    return { success: false, result: { error: errMsg } };
  }
}

async function executeToolCallWithCacheInvalidation(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  const result = await executeToolCall(toolName, input);
  if (result.success && SCHEMA_MUTATING_TOOLS.has(toolName)) {
    invalidateSystemContextCache();
  }
  return result;
}

router.get("/claude/chat/channels", (_req, res) => {
  const channels = Object.entries(CHANNELS).map(([key, val]) => ({
    id: key,
    nameHe: val.nameHe,
  }));
  res.json({ channels });
});

router.get("/claude/chat/conversations", async (req, res) => {
  try {
    const channel = req.query.channel as string | undefined;
    if (channel && !CHANNELS[channel]) {
      res.status(400).json({ error: "ערוץ לא חוקי" });
      return;
    }
    const where = channel ? eq(claudeChatConversationsTable.channel, channel) : undefined;
    const convs = await db.select().from(claudeChatConversationsTable)
      .where(where)
      .orderBy(desc(claudeChatConversationsTable.updatedAt))
      .limit(MAX_CONVERSATIONS_LIST);
    res.json(convs);
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post("/claude/chat/conversations", async (req, res) => {
  try {
    const { channel, title } = req.body;
    if (!channel || !CHANNELS[channel]) {
      res.status(400).json({ error: "ערוץ לא חוקי" });
      return;
    }
    const safeTitle = typeof title === "string" ? title.substring(0, 200) : CHANNELS[channel].nameHe;
    const [conv] = await db.insert(claudeChatConversationsTable).values({
      channel,
      title: safeTitle,
      model: DEFAULT_MODEL,
    }).returning();
    res.json(conv);
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.delete("/claude/chat/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "מזהה לא חוקי" }); return; }
    const [conv] = await db.select().from(claudeChatConversationsTable).where(eq(claudeChatConversationsTable.id, id));
    if (!conv) { res.status(404).json({ error: "שיחה לא נמצאה" }); return; }
    await db.delete(claudeChatMessagesTable).where(eq(claudeChatMessagesTable.conversationId, id));
    await db.delete(claudeChatConversationsTable).where(eq(claudeChatConversationsTable.id, id));
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get("/claude/chat/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "מזהה לא חוקי" }); return; }
    const [conv] = await db.select({ id: claudeChatConversationsTable.id }).from(claudeChatConversationsTable).where(eq(claudeChatConversationsTable.id, id));
    if (!conv) { res.status(404).json({ error: "שיחה לא נמצאה" }); return; }
    const msgs = await db.select().from(claudeChatMessagesTable)
      .where(eq(claudeChatMessagesTable.conversationId, id))
      .orderBy(claudeChatMessagesTable.createdAt);
    const transformed = msgs.map(m => {
      if (m.role === "user") {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed?._type === "image_message") {
            return { ...m, content: parsed.text || "", hasImage: true };
          }
        } catch {}
      }
      return m;
    });
    res.json(transformed);
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post("/claude/chat/send", async (req, res) => {
  try {
    const { conversationId, message, channel } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) { res.status(400).json({ error: "הודעה ריקה" }); return; }
    if (!channel || !CHANNELS[channel]) { res.status(400).json({ error: "ערוץ לא חוקי" }); return; }

    const safeMessage = message.substring(0, 10000);
    let convId = conversationId;
    let convChannel = channel;

    if (convId) {
      const id = parseInt(convId);
      if (isNaN(id) || id <= 0) { res.status(400).json({ error: "מזהה שיחה לא חוקי" }); return; }
      const [conv] = await db.select().from(claudeChatConversationsTable).where(eq(claudeChatConversationsTable.id, id));
      if (!conv) { res.status(404).json({ error: "שיחה לא נמצאה" }); return; }
      convId = conv.id;
      convChannel = conv.channel;
    } else {
      const title = safeMessage.length > 50 ? safeMessage.substring(0, 50) + "..." : safeMessage;
      const [conv] = await db.insert(claudeChatConversationsTable).values({ channel, title, model: DEFAULT_MODEL }).returning();
      convId = conv.id;
    }

    await db.insert(claudeChatMessagesTable).values({ conversationId: convId, role: "user", content: safeMessage, channel: convChannel });
    const allMessages = await db.select().from(claudeChatMessagesTable).where(eq(claudeChatMessagesTable.conversationId, convId)).orderBy(claudeChatMessagesTable.createdAt);
    const apiMessages: Array<{ role: "user" | "assistant"; content: string | Record<string, unknown>[] }> = allMessages.slice(-MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const startTime = Date.now();
    const client = await getAnthropicClient();
    const simple = isSimpleQuestion(safeMessage, convChannel);
    let totalInputTokens = 0, totalOutputTokens = 0, finalText = "";
    const toolCalls: Array<{ tool: string; input: Record<string, unknown>; result: Record<string, unknown>; success: boolean; link?: string }> = [];

    if (simple) {
      const response = await callAnthropicWithRetry(client, { model: FAST_MODEL, max_tokens: FAST_MAX_TOKENS, system: FAST_SYSTEM_PROMPT, messages: apiMessages });
      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
      for (const block of response.content) { if (block.type === "text") finalText += block.text; }
    } else {
      const [systemContext, channelContext] = await Promise.all([getSystemContext(), getChannelSpecificContext(convChannel)]);
      const fullSystemPrompt = CHANNELS[convChannel].systemPrompt + systemContext + channelContext;
      const channelTools = getToolsForChannel(convChannel);
      let currentMessages = [...apiMessages];
      let rounds = 0;
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;
        const response = await callAnthropicWithRetry(client, { model: DEFAULT_MODEL, max_tokens: NORMAL_MAX_TOKENS, system: fullSystemPrompt, messages: currentMessages, tools: channelTools });
        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;
        if (response.stop_reason === "tool_use") {
          const assistantContent = response.content;
          currentMessages.push({ role: "assistant", content: assistantContent });
          const toolBlocks = assistantContent.filter((b: any) => b.type === "tool_use");
          const results = await Promise.all(toolBlocks.map((block: any) => executeToolCallWithCacheInvalidation(block.name, block.input as Record<string, unknown>).then(r => ({ block, ...r }))));
          const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
          for (const { block, success, result, link } of results) {
            toolCalls.push({ tool: block.name, input: block.input, result, success, link });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).substring(0, MAX_TOOL_RESULT_CHARS) });
          }
          currentMessages.push({ role: "user", content: toolResults });
        } else {
          for (const block of response.content) { if (block.type === "text") finalText += block.text; }
          break;
        }
      }
    }

    const responseTimeMs = Date.now() - startTime;
    const usedModel = simple ? FAST_MODEL : DEFAULT_MODEL;
    let contentToStore = finalText;
    if (toolCalls.length > 0) {
      contentToStore += "\n\n<!-- TOOL_CALLS:" + JSON.stringify(toolCalls.map(tc => ({ tool: tc.tool, input: tc.input, success: tc.success, resultSummary: tc.result?.message || (tc.success ? "OK" : tc.result?.error || "Failed"), link: tc.link }))) + " -->";
    }
    const [assistantMsg] = await db.insert(claudeChatMessagesTable).values({ conversationId: convId, role: "assistant", content: contentToStore, channel: convChannel, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: usedModel, responseTimeMs }).returning();
    await db.update(claudeChatConversationsTable).set({ totalMessages: allMessages.length + 1, totalInputTokens, totalOutputTokens, updatedAt: new Date() }).where(eq(claudeChatConversationsTable.id, convId));
    res.json({ conversationId: convId, message: assistantMsg, toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({ tool: tc.tool, input: tc.input, success: tc.success, resultSummary: tc.result?.message || (tc.success ? "OK" : tc.result?.error || "Failed"), link: tc.link })) : undefined, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, responseTimeMs });
  } catch (err: unknown) {
    console.error("Chat send error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: safeError(err) });
    }
  }
});

router.post("/claude/chat/send-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let clientDisconnected = false;

  const send = (event: string, data: unknown) => {
    if (clientDisconnected || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clientDisconnected = true;
    }
  };

  heartbeatTimer = setInterval(() => {
    if (clientDisconnected || res.writableEnded) {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      return;
    }
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clientDisconnected = true;
    }
  }, 15000);

  req.on("close", () => {
    clientDisconnected = true;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  });

  try {
    const { conversationId, message, channel, image } = req.body;

    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const hasImage = image && typeof image.data === "string" && typeof image.mediaType === "string"
      && ALLOWED_IMAGE_TYPES.includes(image.mediaType);

    if ((!message || typeof message !== "string" || message.trim().length === 0) && !hasImage) {
      send("error", { error: "הודעה ריקה" });
      res.end();
      return;
    }
    if (!channel || !CHANNELS[channel]) {
      send("error", { error: "ערוץ לא חוקי" });
      res.end();
      return;
    }

    let imageData: string = hasImage ? image.data : "";
    let imageMediaType: string = hasImage ? image.mediaType : "";

    if (hasImage) {
      const rawBuf = Buffer.from(image.data, "base64");
      const TARGET_BYTES = 1 * 1024 * 1024;
      if (rawBuf.length > 5 * 1024 * 1024) {
        send("error", { error: "התמונה גדולה מדי (מקסימום 5MB)" });
        res.end();
        return;
      }
      if (rawBuf.length > TARGET_BYTES) {
        try {
          const compressed = await sharp(rawBuf)
            .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          imageData = compressed.toString("base64");
          imageMediaType = "image/jpeg";
        } catch {
          imageData = image.data;
          imageMediaType = image.mediaType;
        }
      }
    }

    const safeMessage = (message || "").substring(0, 10000);
    let convId = conversationId;
    let convChannel = channel;

    if (convId) {
      const id = parseInt(convId);
      if (isNaN(id) || id <= 0) { send("error", { error: "מזהה שיחה לא חוקי" }); res.end(); return; }
      const [conv] = await db.select({ id: claudeChatConversationsTable.id, channel: claudeChatConversationsTable.channel })
        .from(claudeChatConversationsTable).where(eq(claudeChatConversationsTable.id, id));
      if (!conv) { send("error", { error: "שיחה לא נמצאה" }); res.end(); return; }
      convId = conv.id;
      convChannel = conv.channel;
      send("conversation", { conversationId: convId });
    } else {
      const titleBase = safeMessage.trim() || "שיחה עם תמונה";
      const title = titleBase.length > 50 ? titleBase.substring(0, 50) + "..." : titleBase;
      const [conv] = await db.insert(claudeChatConversationsTable).values({
        channel,
        title,
        model: DEFAULT_MODEL,
      }).returning({ id: claudeChatConversationsTable.id });
      convId = conv.id;
      send("conversation", { conversationId: convId });
    }

    const userContent: Record<string, unknown>[] | string = hasImage
      ? [
          { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageData } },
          ...(safeMessage.trim() ? [{ type: "text", text: safeMessage }] : []),
        ]
      : safeMessage;

    const [userMsg] = await db.insert(claudeChatMessagesTable).values({
      conversationId: convId,
      role: "user",
      content: hasImage ? JSON.stringify({ _type: "image_message", text: safeMessage, hasImage: true }) : safeMessage,
      channel: convChannel,
    }).returning({ id: claudeChatMessagesTable.id });

    if (hasImage && userMsg) {
      send("user_message_id", { userMessageId: userMsg.id });
    }

    const recentMsgsDesc = await db.select({
      id: claudeChatMessagesTable.id,
      role: claudeChatMessagesTable.role,
      content: claudeChatMessagesTable.content,
    }).from(claudeChatMessagesTable)
      .where(eq(claudeChatMessagesTable.conversationId, convId))
      .orderBy(desc(claudeChatMessagesTable.createdAt))
      .limit(MAX_CONTEXT_MESSAGES);

    const contextMessages = recentMsgsDesc.reverse();
    const allMessages = contextMessages;

    const apiMessages: Array<{ role: "user" | "assistant"; content: string | Record<string, unknown>[] }> = contextMessages.map((m, idx) => {
      const isLast = idx === contextMessages.length - 1;
      if (isLast && m.role === "user" && hasImage) {
        return { role: "user" as const, content: userContent as Record<string, unknown>[] };
      }
      try {
        const parsed = JSON.parse(m.content);
        if (parsed?._type === "image_message") {
          return { role: m.role as "user" | "assistant", content: parsed.text || "[תמונה]" };
        }
      } catch {}
      const safeContent = (typeof m.content === "string" && m.content.trim().length > 0) ? m.content : "[תגובת מערכת]";
      return { role: m.role as "user" | "assistant", content: safeContent };
    });

    const startTime = Date.now();
    const client = await getAnthropicClient();
    const simple = !hasImage && isSimpleQuestion(safeMessage, convChannel);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const toolCalls: Array<{ tool: string; input: Record<string, unknown>; result: Record<string, unknown>; success: boolean; link?: string }> = [];
    let currentMessages = [...apiMessages];
    let finalText = "";
    let rounds = 0;

    if (simple) {
      const fastStream = client.messages.stream({
        model: FAST_MODEL,
        max_tokens: FAST_MAX_TOKENS,
        system: FAST_SYSTEM_PROMPT,
        messages: apiMessages,
      }) as AsyncIterable<Record<string, unknown>>;
      for await (const event of fastStream) {
        const evType = event.type as string;
        if (evType === "message_start") {
          const usage = (event.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;
          totalInputTokens += (usage?.input_tokens as number) || 0;
        } else if (evType === "content_block_delta") {
          const delta = event.delta as Record<string, unknown>;
          if (delta.type === "text_delta") {
            const chunk = delta.text as string;
            finalText += chunk;
            send("text", { text: chunk });
          }
        } else if (evType === "message_delta") {
          const usage = event.usage as Record<string, unknown> | undefined;
          totalOutputTokens += (usage?.output_tokens as number) || 0;
        }
      }
    } else {

    const [systemContext, channelContext] = await Promise.all([
      getSystemContext(),
      getChannelSpecificContext(convChannel),
    ]);
    const fullSystemPrompt = CHANNELS[convChannel].systemPrompt + systemContext + channelContext;
    const channelTools = getToolsForChannel(convChannel);

    while (rounds < MAX_TOOL_ROUNDS) {
      if (clientDisconnected) break;
      rounds++;

      let streamAborted = false;
      const sanitizedMessages = currentMessages.map((msg) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          const cleanedContent = (msg.content as Record<string, unknown>[]).filter(
            (b: any) => b.type === "tool_use" || (b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0)
          );
          return { ...msg, content: cleanedContent.length > 0 ? cleanedContent : [{ type: "text", text: "[תגובת מערכת]" }] };
        }
        return msg;
      });
      const params = {
        model: DEFAULT_MODEL,
        max_tokens: NORMAL_MAX_TOKENS,
        system: fullSystemPrompt,
        messages: sanitizedMessages,
        tools: channelTools,
      };

      let stream: AsyncIterable<Record<string, unknown>>;
      let streamAttempt = 0;
      while (true) {
        try {
          stream = client.messages.stream(params) as AsyncIterable<Record<string, unknown>>;
          break;
        } catch (streamErr: unknown) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr || "");
          const isRetryable = msg.includes("429") || msg.includes("rate_limit") || msg.includes("500") || msg.includes("503") || msg.includes("overloaded") || msg.includes("timeout");
          if (!isRetryable || streamAttempt >= MAX_RETRIES) throw streamErr;
          streamAttempt++;
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, streamAttempt - 1), 8000)));
        }
      }

      const assistantBlocks: Record<string, unknown>[] = [];
      let currentToolUse: { id: string; name: string; inputStr: string } | null = null;
      let streamTimedOut = false;
      const streamTimeoutTimer = setTimeout(() => {
        streamTimedOut = true;
        if (typeof (stream as Record<string, unknown>).abort === "function") {
          (stream as unknown as { abort: () => void }).abort();
        }
      }, API_TIMEOUT_MS);

      try {
      for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
        if (clientDisconnected) { streamAborted = true; break; }
        const evType = event.type as string;

        if (evType === "message_start") {
          const usage = (event.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;
          totalInputTokens += (usage?.input_tokens as number) || 0;
        } else if (evType === "content_block_start") {
          const block = event.content_block as Record<string, unknown>;
          if (block.type === "tool_use") {
            currentToolUse = { id: block.id as string, name: block.name as string, inputStr: "" };
          } else if (block.type === "text") {
            currentToolUse = null;
          }
          assistantBlocks.push({ ...block, input: block.type === "tool_use" ? {} : undefined, text: block.type === "text" ? "" : undefined });
        } else if (evType === "content_block_delta") {
          const delta = event.delta as Record<string, unknown>;
          if (delta.type === "text_delta") {
            const chunk = delta.text as string;
            finalText += chunk;
            send("text", { text: chunk });
            const lastBlock = assistantBlocks[assistantBlocks.length - 1];
            if (lastBlock?.type === "text") {
              (lastBlock as Record<string, unknown>).text = ((lastBlock.text as string) || "") + chunk;
            }
          } else if (delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.inputStr += delta.partial_json as string;
          }
        } else if (evType === "content_block_stop") {
          if (currentToolUse) {
            const lastBlock = assistantBlocks[assistantBlocks.length - 1];
            if (lastBlock?.type === "tool_use") {
              try {
                (lastBlock as Record<string, unknown>).input = JSON.parse(currentToolUse.inputStr || "{}");
              } catch {
                (lastBlock as Record<string, unknown>).input = {};
              }
            }
            currentToolUse = null;
          }
        } else if (evType === "message_delta") {
          const delta = event.delta as Record<string, unknown>;
          const usage = event.usage as Record<string, unknown> | undefined;
          totalOutputTokens += (usage?.output_tokens as number) || 0;
          const stopReason = delta.stop_reason as string | undefined;
          if (stopReason === "tool_use") {
            const filteredBlocks = assistantBlocks.filter((b: any) => b.type === "tool_use" || (b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0));
            currentMessages.push({ role: "assistant", content: filteredBlocks });
            const toolBlocks = assistantBlocks.filter((b: any) => b.type === "tool_use");
            for (const block of toolBlocks) {
              send("tool_start", { tool: block.name as string, input: block.input });
            }
            const results = await Promise.all(toolBlocks.map((block: any) =>
              executeToolCallWithCacheInvalidation(block.name as string, block.input as Record<string, unknown>)
                .then(r => ({ block, ...r }))
            ));
            const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
            for (const { block, success, result, link } of results) {
              toolCalls.push({ tool: block.name as string, input: block.input as Record<string, unknown>, result, success, link });
              send("tool_result", {
                tool: block.name as string,
                success,
                resultSummary: (result.message as string | undefined) || (success ? "OK" : (result.error as string | undefined) || "Failed"),
                link,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id as string,
                content: JSON.stringify(result).substring(0, MAX_TOOL_RESULT_CHARS),
              });
            }
            currentMessages.push({ role: "user", content: toolResults });
          } else {
            streamAborted = true;
          }
        }
      }
      } catch (streamIterErr: unknown) {
        clearTimeout(streamTimeoutTimer);
        if (streamTimedOut) throw new Error("timeout");
        throw streamIterErr;
      }
      clearTimeout(streamTimeoutTimer);
      if (streamTimedOut) throw new Error("timeout");

      if (streamAborted || finalText) break;
    }
    } // end else (non-simple)

    const responseTimeMs = Date.now() - startTime;
    const usedModel = simple ? FAST_MODEL : DEFAULT_MODEL;

    if (!finalText && toolCalls.length > 0) {
      const toolSummary = toolCalls.map(tc => `${tc.tool}: ${tc.success ? "✓" : "✗"} ${(tc.result.message as string | undefined) || ""}`).join("\n");
      finalText = `בוצעו ${toolCalls.length} פעולות:\n${toolSummary}`;
      send("text", { text: finalText });
    }

    if (!finalText && !toolCalls.length) {
      finalText = "לא התקבלה תשובה מהמודל. נסה שוב.";
      send("text", { text: finalText });
    }

    let contentToStore = finalText;
    if (toolCalls.length > 0) {
      contentToStore += "\n\n<!-- TOOL_CALLS:" + JSON.stringify(toolCalls.map(tc => ({
        tool: tc.tool,
        input: tc.input,
        success: tc.success,
        resultSummary: (tc.result.message as string | undefined) || (tc.success ? "OK" : (tc.result.error as string | undefined) || "Failed"),
        link: tc.link,
      }))) + " -->";
    }

    const [assistantMsg] = await db.insert(claudeChatMessagesTable).values({
      conversationId: convId,
      role: "assistant",
      content: contentToStore,
      channel: convChannel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      model: usedModel,
      responseTimeMs,
    }).returning();

    const [msgCountResult] = await db.select({ total: count() })
      .from(claudeChatMessagesTable)
      .where(eq(claudeChatMessagesTable.conversationId, convId));

    await db.update(claudeChatConversationsTable)
      .set({
        totalMessages: (msgCountResult?.total || 0) + 1,
        totalInputTokens: totalInputTokens,
        totalOutputTokens: totalOutputTokens,
        updatedAt: new Date(),
      })
      .where(eq(claudeChatConversationsTable.id, convId));

    send("done", {
      conversationId: convId,
      messageId: assistantMsg.id,
      toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
        tool: tc.tool,
        input: tc.input,
        success: tc.success,
        resultSummary: (tc.result.message as string | undefined) || (tc.success ? "OK" : (tc.result.error as string | undefined) || "Failed"),
        link: tc.link,
      })) : undefined,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      responseTimeMs,
    });
  } catch (err: unknown) {
    console.error("Chat stream error:", err);
    const errMsg = err instanceof Error ? err.message : String(err || "");
    let hebrewError = safeError(err);
    if (errMsg.includes("timeout")) hebrewError = "הזמן הקצוב לתשובה עבר. נסה שוב עם שאלה קצרה יותר.";
    else if (errMsg.includes("rate_limit") || errMsg.includes("429")) hebrewError = "יותר מדי בקשות. המתן מספר שניות ונסה שוב.";
    else if (errMsg.includes("overloaded") || errMsg.includes("529")) hebrewError = "שרת Claude עמוס. נסה שוב בעוד דקה.";
    else if (errMsg.includes("empty") || errMsg.includes("text content blocks")) hebrewError = "שגיאה בפורמט ההודעה. נסה שוב.";
    send("error", { error: hebrewError });
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try { if (!res.writableEnded) res.end(); } catch {}
  }
});

router.post("/claude/chat/query", async (req, res) => {
  try {
    const { queryId } = req.body;
    if (!queryId || typeof queryId !== 'string') {
      res.status(400).json({ error: "מזהה שאילתה חסר" });
      return;
    }
    const queryTemplate = PREDEFINED_QUERIES[queryId];
    if (!queryTemplate) {
      res.status(400).json({ error: "שאילתה לא מוכרת", available: Object.keys(PREDEFINED_QUERIES) });
      return;
    }
    const result = await db.execute(sql.raw(queryTemplate));
    res.json({ queryId, rows: result.rows || [], rowCount: result.rows?.length || 0 });
  } catch (err: unknown) {
    res.status(400).json({ error: "שגיאה בביצוע שאילתה" });
  }
});

router.get("/claude/chat/system-context", async (_req, res) => {
  try {
    const ctx = await getSystemContext();
    res.json({ context: ctx, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get("/claude/chat/status", async (_req, res) => {
  try {
    const hasApiKey = !!getEffectiveApiKey();
    const hasBaseUrl = !!getEffectiveBaseUrl();
    const configured = hasApiKey && hasBaseUrl;
    const [convResult] = await db.select({ total: count() }).from(claudeChatConversationsTable);
    const [msgResult] = await db.select({ total: count() }).from(claudeChatMessagesTable);
    const tokenStats = await db.execute(sql.raw(
      `SELECT COALESCE(SUM(CAST(input_tokens AS bigint)), 0) as total_input_tokens, COALESCE(SUM(CAST(output_tokens AS bigint)), 0) as total_output_tokens FROM claude_chat_messages WHERE role = 'assistant'`
    ));
    const tokenRow = tokenStats.rows?.[0] as { total_input_tokens?: string; total_output_tokens?: string } | undefined;
    res.json({
      configured,
      hasApiKey,
      hasBaseUrl,
      provider: "Anthropic",
      providerUrl: getEffectiveBaseUrl() ? "configured" : "not set",
      totalConversations: convResult?.total || 0,
      totalMessages: msgResult?.total || 0,
      totalInputTokens: parseInt(tokenRow?.total_input_tokens || "0", 10),
      totalOutputTokens: parseInt(tokenRow?.total_output_tokens || "0", 10),
      channels: Object.keys(CHANNELS).length,
      model: DEFAULT_MODEL,
      toolsEnabled: true,
      toolCount: BUILDER_TOOLS.length,
      availableTools: BUILDER_TOOLS.map(t => t.name),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeError(err) });
  }
});

const ALLOWED_BASE_URLS = [
  "https://api.anthropic.com",
  "https://anthropic.replit.dev",
];

router.post("/claude/chat/configure", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Configuration override is disabled in production. Use environment variables instead." });
    return;
  }
  const { apiKey, baseUrl } = req.body;
  if (apiKey && typeof apiKey === "string" && apiKey.length > 10) {
    _runtimeApiKey = apiKey;
    _anthropicClient = null;
    if (!getEffectiveBaseUrl()) {
      _runtimeBaseUrl = "https://api.anthropic.com";
    }
  }
  if (baseUrl && typeof baseUrl === "string") {
    const normalized = baseUrl.replace(/\/+$/, "");
    const isAllowed = ALLOWED_BASE_URLS.some(
      allowed => normalized === allowed || normalized.startsWith(allowed + "/")
    );
    if (!isAllowed) {
      res.status(400).json({
        error: "Base URL must be an official Anthropic endpoint",
        allowedUrls: ALLOWED_BASE_URLS,
      });
      return;
    }
    _runtimeBaseUrl = normalized;
    _anthropicClient = null;
  }
  res.json({
    success: true,
    configured: !!getEffectiveApiKey() && !!getEffectiveBaseUrl(),
  });
});

router.post("/claude/chat/test-connection", async (_req, res) => {
  try {
    const client = await getAnthropicClient();
    const startTime = Date.now();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 50,
      messages: [{ role: "user", content: "Respond with only: OK" }],
    });
    const responseTimeMs = Date.now() - startTime;
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    res.json({
      success: true,
      responseTimeMs,
      model: DEFAULT_MODEL,
      response: text.substring(0, 100),
      usage: response.usage,
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: safeError(err),
      details: err?.message?.substring(0, 200),
    });
  }
});

export default router;
