import { eventBus, RecordEvent } from "./event-bus";
import { emitLiveOpsEvent, LiveOpsCategory, LiveOpsSeverity } from "./sse-manager";
import { pool } from "@workspace/db";

const entityCategoryMap: Record<string, LiveOpsCategory> = {};
let entityMapLoaded = false;

async function loadEntityMap() {
  if (entityMapLoaded) return;
  try {
    const { rows } = await pool.query(
      `SELECT me.id, me.slug, me.name, mm.name as module_name
       FROM module_entities me
       LEFT JOIN modules mm ON mm.id = me.module_id`
    );
    for (const r of rows) {
      const slug = (r.slug || "").toLowerCase();
      const moduleName = (r.module_name || "").toLowerCase();
      if (moduleName.includes("ייצור") || moduleName.includes("production") || slug.includes("work-order") || slug.includes("qc") || slug.includes("production")) {
        entityCategoryMap[String(r.id)] = "production";
      } else if (moduleName.includes("מכירות") || moduleName.includes("sales") || slug.includes("sales") || slug.includes("quote") || slug.includes("invoice") || slug.includes("customer") || slug.includes("lead")) {
        entityCategoryMap[String(r.id)] = "sales";
      } else if (moduleName.includes("מלאי") || moduleName.includes("inventory") || moduleName.includes("רכש") || slug.includes("inventory") || slug.includes("raw-material") || slug.includes("warehouse") || slug.includes("purchase")) {
        entityCategoryMap[String(r.id)] = "inventory";
      } else if (moduleName.includes("פיננסי") || moduleName.includes("finance") || moduleName.includes("חשבונאות") || slug.includes("expense") || slug.includes("budget") || slug.includes("payment") || slug.includes("bank")) {
        entityCategoryMap[String(r.id)] = "finance";
      } else {
        entityCategoryMap[String(r.id)] = "alerts";
      }
    }
    entityMapLoaded = true;
  } catch {
    entityMapLoaded = false;
  }
}

function resolveCategory(entityId: number): LiveOpsCategory {
  return entityCategoryMap[String(entityId)] || "alerts";
}

function resolveSeverity(event: RecordEvent): LiveOpsSeverity {
  const status = (event.status || "").toLowerCase();
  if (status.includes("cancel") || status.includes("reject") || status.includes("critical") || status.includes("fail")) return "critical";
  if (status.includes("warn") || status.includes("delay") || status.includes("overdue") || status.includes("hold")) return "warning";
  return "info";
}

const eventTypeLabels: Record<string, string> = {
  "record.created": "נוצר",
  "record.updated": "עודכן",
  "record.deleted": "נמחק",
  "record.status_changed": "שינוי סטטוס",
};

function getRecordTitle(event: RecordEvent): string {
  const d = event.data || {};
  return String(d.name || d.title || d.order_number || d.invoice_number || d.material_name || d.project_name || d.customer_name || d.supplier_name || `#${event.recordId}`);
}

function handleRecordEvent(event: RecordEvent) {
  const category = resolveCategory(event.entityId);
  const severity = resolveSeverity(event);
  const label = eventTypeLabels[event.type] || event.type;
  const title = getRecordTitle(event);

  let description = `${label}: ${title}`;
  if (event.type === "record.status_changed" && event.oldStatus && event.status) {
    description = `${title} — ${event.oldStatus} → ${event.status}`;
  }

  emitLiveOpsEvent({
    category,
    severity,
    title: description,
    description: `${label} | Entity #${event.entityId} | Record #${event.recordId}`,
    module: category,
    metadata: {
      entityId: event.entityId,
      recordId: event.recordId,
      eventType: event.type,
      status: event.status,
    },
  });
}

let lastUserActivityCheck = 0;

async function emitUserActivityEvent() {
  const now = Date.now();
  if (now - lastUserActivityCheck < 60_000) return;
  lastUserActivityCheck = now;

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as active_users, COUNT(*) as actions
       FROM audit_logs WHERE created_at > NOW() - INTERVAL '5 minutes'`
    );
    const activeUsers = Number(rows[0]?.active_users || 0);
    const actions = Number(rows[0]?.actions || 0);

    if (activeUsers > 0) {
      emitLiveOpsEvent({
        category: "users",
        severity: "info",
        title: `${activeUsers} משתמשים פעילים`,
        description: `${actions} פעולות ב-5 דקות אחרונות`,
        module: "users",
        metadata: { activeUsers, actions },
      });
    }
  } catch {}
}

let initialized = false;

export function initLiveOpsBridge() {
  if (initialized) return;
  initialized = true;

  loadEntityMap().then(() => {
    console.log("[LiveOpsBridge] Entity map loaded, categories mapped:", Object.keys(entityCategoryMap).length);
  });

  eventBus.on("record.*", (event: RecordEvent) => {
    try {
      handleRecordEvent(event);
      emitUserActivityEvent();
    } catch (err) {
      console.error("[LiveOpsBridge] Error handling event:", err);
    }
  });

  setInterval(() => {
    emitUserActivityEvent();
  }, 60_000);

  console.log("[LiveOpsBridge] Initialized - bridging event-bus to SSE live-ops");
}
