/**
 * CRM Follow-up Engine
 * - Event-triggered: listens to EventBus for entity events and fires matching rules
 * - Inaction scanner: runs every 6h to find leads/customers with no contact for N days,
 *   respecting the configured inaction_event subtype (no_order, quote_not_responded, etc.)
 * - Durable delayed execution: delays stored in crm_followup_executions (status='pending'),
 *   a periodic worker picks up and executes pending items after their scheduled_at time
 * - Deduplication: skips if rule+entity already sent within 24h
 * - Conversion attribution: execution records store rule_id + template_id for analytics linkage
 */

import { backgroundPool } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { drizzle as makeDrizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { eventBus } from "./event-bus";
import type { RecordEvent } from "./event-bus";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { sendGmailMessage } from "./gmail-service";
import { sendSmsMessage } from "./sms-service";
import { logger } from "./logger";

const INACTION_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PENDING_WORKER_INTERVAL_MS = 15 * 60 * 1000; // check pending queue every 15 min

const bgDb = makeDrizzle(backgroundPool, { schema });

async function pgExecute(query: ReturnType<typeof sql>): Promise<{ rows: any[] }> {
  return bgDb.execute(query) as Promise<{ rows: any[] }>;
}

// ── Merge fields ──────────────────────────────────────────────────────────────

function applyMergeFields(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}|\[(\w+)\]/g, (match, p1, p2) => {
    const key = (p1 || p2) as string;
    return vars[key] || vars[key.toLowerCase()] || match;
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getActiveConnectionId(serviceType: string): Promise<number | null> {
  try {
    const rows = await pgExecute(
      sql`SELECT id FROM integration_connections WHERE service_type = ${serviceType} AND is_active = TRUE LIMIT 1`
    );
    return (rows.rows as any[])[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function alreadySentRecently(ruleId: number, entityType: string, entityId: number): Promise<boolean> {
  try {
    const rows = await pgExecute(sql`
      SELECT 1 FROM crm_followup_executions
      WHERE rule_id = ${ruleId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
        AND status = 'sent'
        AND executed_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `);
    return (rows.rows as any[]).length > 0;
  } catch {
    return false;
  }
}

async function getTemplateById(templateId: number): Promise<{ body_he: string; subject?: string; wa_template_name?: string } | null> {
  try {
    const rows = await pgExecute(sql`SELECT * FROM crm_comm_templates WHERE id = ${templateId}`);
    return (rows.rows as any[])[0] ?? null;
  } catch {
    return null;
  }
}

// Backfill contact data from DB when only an ID is available (e.g., from payment/order events)
async function enrichEntityContact(entityType: string, entityId: number, entity: Record<string, unknown>): Promise<{ phone: string | null; email: string | null; name: string | null }> {
  const hasPhone = !!(entity.phone || entity.whatsapp || entity.mobile);
  const hasEmail = !!entity.email;
  const hasName = !!(entity.name || entity.first_name);

  if (hasPhone && hasEmail && hasName) {
    return {
      phone: (entity.phone || entity.whatsapp || entity.mobile) as string,
      email: entity.email as string,
      name: entity.name ? String(entity.name) : `${entity.first_name || ""} ${entity.last_name || ""}`.trim(),
    };
  }

  // Fetch missing contact data from DB
  try {
    if (entityType === "lead") {
      const rows = await pgExecute(sql`SELECT first_name, last_name, phone, whatsapp, email FROM crm_leads WHERE id = ${entityId} LIMIT 1`);
      const row = (rows.rows as any[])[0];
      if (row) {
        return {
          phone: row.phone || row.whatsapp || null,
          email: row.email || null,
          name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || null,
        };
      }
    } else if (entityType === "customer") {
      const rows = await pgExecute(sql`SELECT name, phone, mobile, email FROM customers WHERE id = ${entityId} LIMIT 1`);
      const row = (rows.rows as any[])[0];
      if (row) {
        return {
          phone: row.phone || row.mobile || null,
          email: row.email || null,
          name: row.name || null,
        };
      }
    }
  } catch {
    // fall through
  }

  return {
    phone: (entity.phone || entity.whatsapp || entity.mobile) as string | null ?? null,
    email: (entity.email as string | null) ?? null,
    name: entity.name ? String(entity.name) : `${entity.first_name || ""} ${entity.last_name || ""}`.trim() || null,
  };
}

// ── Execution dispatch ────────────────────────────────────────────────────────

async function dispatchExecution(execId: number, rule: Record<string, unknown>, entityType: string, entityId: number, entityName: string | null, phone: string | null, email: string | null): Promise<void> {
  let template: { body_he: string; subject?: string; wa_template_name?: string } | null = null;
  if (rule.template_id) {
    template = await getTemplateById(rule.template_id as number);
  }

  const mergeVars: Record<string, string> = {
    name: entityName || "",
    customerName: entityName || "",
    phone: phone || "",
    email: email || "",
  };

  // Language-aware template resolution: prefer entity locale, fallback to Hebrew
  const entityLocale = (rule.language as string | undefined) || "he";
  const templateBody = template
    ? (entityLocale === "en" && (template as any).body_en ? (template as any).body_en : template.body_he)
    : (rule.custom_message as string) || "";
  const messageText = applyMergeFields(templateBody, mergeVars);

  let success = false;
  let errorMsg: string | undefined;

  try {
    const actionType = rule.action_type as string;
    if (actionType === "whatsapp" && phone) {
      const connId = await getActiveConnectionId("whatsapp");
      if (connId) {
        const result = await sendWhatsAppMessage({ connectionId: connId, to: phone, message: messageText, entityType, entityId, entityName: entityName ?? undefined, templateName: template?.wa_template_name });
        success = result.success;
        errorMsg = result.error;
      } else {
        errorMsg = "No active WhatsApp connection";
      }
    } else if (actionType === "email" && email) {
      const connId = await getActiveConnectionId("gmail");
      if (connId) {
        const result = await sendGmailMessage({ connectionId: connId, to: email, subject: template?.subject || "עדכון מהמערכת", body: messageText, entityType, entityId, entityName: entityName ?? undefined });
        success = result.success;
        errorMsg = result.error;
      } else {
        errorMsg = "No active Gmail connection";
      }
    } else if (actionType === "sms" && phone) {
      const connId = await getActiveConnectionId("sms");
      if (connId) {
        const result = await sendSmsMessage({ connectionId: connId, to: phone, message: messageText, entityType, entityId, entityName: entityName ?? undefined });
        success = result.success;
        errorMsg = result.error;
      } else {
        errorMsg = "No active SMS connection";
      }
    } else {
      errorMsg = `No valid contact for action_type=${actionType}`;
    }
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  await pgExecute(sql`
    UPDATE crm_followup_executions
    SET status = ${success ? "sent" : "failed"}, executed_at = NOW(),
        metadata = ${JSON.stringify({ error: errorMsg, dispatchedAt: new Date().toISOString() })}
    WHERE id = ${execId}
  `).catch((e) => logger.error("[CrmFollowupEngine] update execution error", { error: String(e) }));

  if (success) {
    await pgExecute(sql`
      UPDATE crm_followup_rules SET run_count = run_count + 1, last_run_at = NOW() WHERE id = ${rule.id as number}
    `).catch(() => {});
    logger.info("[CrmFollowupEngine] Dispatched", { ruleId: rule.id, execId, entityType, entityId, channel: rule.action_type });
  } else {
    logger.warn("[CrmFollowupEngine] Dispatch failed", { ruleId: rule.id, execId, entityType, entityId, error: errorMsg });
  }
}

// Enqueue: write to DB (status='pending'|'sent'), execute immediately or defer
async function enqueueRule(
  rule: Record<string, unknown>,
  entityType: string,
  entityId: number,
  entityName: string | null,
  phone: string | null,
  email: string | null
): Promise<void> {
  if (!rule.is_active) return;

  if (await alreadySentRecently(rule.id as number, entityType, entityId)) {
    logger.info("[CrmFollowupEngine] Skipping — dedup 24h", { ruleId: rule.id, entityId });
    return;
  }

  const delayHours = Number(rule.delay_hours ?? 0);
  const scheduledAt = delayHours > 0
    ? new Date(Date.now() + delayHours * 3600 * 1000)
    : new Date();

  const status = delayHours > 0 ? "pending" : "executing";

  // Store execution record (durable scheduling — survives restarts)
  let execId: number;
  try {
    const inserted = await pgExecute(sql`
      INSERT INTO crm_followup_executions
        (rule_id, entity_type, entity_id, entity_name, channel, status, scheduled_at, metadata)
      VALUES
        (${rule.id as number}, ${entityType}, ${entityId}, ${entityName ?? null},
         ${rule.action_type as string}, ${status}, ${scheduledAt.toISOString()},
         ${JSON.stringify({ phone, email, templateId: rule.template_id ?? null })})
      RETURNING id
    `);
    execId = (inserted.rows as any[])[0]?.id;
    if (!execId) return;
  } catch (e) {
    logger.error("[CrmFollowupEngine] enqueueRule insert error", { error: String(e) });
    return;
  }

  if (delayHours === 0) {
    await dispatchExecution(execId, rule, entityType, entityId, entityName, phone, email);
  }
  // Otherwise the pending worker will pick it up when scheduled_at is reached
}

// ── Pending queue worker (durable delayed execution) ──────────────────────────

async function processPendingQueue(): Promise<void> {
  try {
    const rows = await pgExecute(sql`
      SELECT e.*, r.action_type, r.template_id, r.custom_message, r.is_active, r.delay_hours,
             r.id as rule_id_col
      FROM crm_followup_executions e
      JOIN crm_followup_rules r ON r.id = e.rule_id
      WHERE e.status = 'pending'
        AND e.scheduled_at <= NOW()
      ORDER BY e.scheduled_at ASC
      LIMIT 50
    `);
    const pending = rows.rows as any[];
    if (pending.length === 0) return;

    logger.info("[CrmFollowupEngine] Processing pending queue", { count: pending.length });

    for (const exec of pending) {
      // Mark as executing to prevent double-pickup
      // Atomic claim: only dispatch if we successfully transitioned pending→executing
      const claimed = await pgExecute(sql`
        UPDATE crm_followup_executions SET status = 'executing'
        WHERE id = ${exec.id} AND status = 'pending'
        RETURNING id
      `);
      if ((claimed.rows as any[]).length === 0) continue; // another instance already claimed it

      const meta = exec.metadata as Record<string, unknown> | null;
      // Backfill contact data from DB in case the pending exec was enqueued with partial data
      const contact = await enrichEntityContact(exec.entity_type, exec.entity_id, {
        id: exec.entity_id,
        phone: meta?.phone as string | undefined,
        email: meta?.email as string | undefined,
      });

      const ruleRecord: Record<string, unknown> = {
        id: exec.rule_id,
        action_type: exec.action_type,
        template_id: exec.template_id,
        custom_message: exec.custom_message,
        is_active: exec.is_active,
      };

      await dispatchExecution(exec.id, ruleRecord, exec.entity_type, exec.entity_id, exec.entity_name || contact.name, contact.phone, contact.email);
    }
  } catch (e) {
    logger.error("[CrmFollowupEngine] processPendingQueue error", { error: String(e) });
  }
}

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleFollowupEvent(triggerEvent: string, entityType: string, entity: Record<string, unknown>): Promise<void> {
  try {
    const rows = await pgExecute(sql`
      SELECT * FROM crm_followup_rules
      WHERE is_active = TRUE
        AND trigger_type = 'event'
        AND trigger_event = ${triggerEvent}
        AND (trigger_entity = ${entityType} OR trigger_entity = 'both')
      ORDER BY priority ASC
    `);
    const rules = rows.rows as any[];

    for (const rule of rules) {
      const entityId = Number(entity.id);
      if (!entityId) continue;
      // Always enrich contact data from DB to handle cases where caller only has the entity ID
      const contact = await enrichEntityContact(entityType, entityId, entity);
      await enqueueRule(rule as Record<string, unknown>, entityType, entityId, contact.name, contact.phone, contact.email);
    }
  } catch (e) {
    logger.error("[CrmFollowupEngine] handleFollowupEvent error", { triggerEvent, entityType, error: String(e) });
  }
}

// ── Event bus subscription ────────────────────────────────────────────────────

function registerEventListeners(): void {
  // Map status_changed events to follow-up trigger events
  eventBus.on("record.status_changed", (event: RecordEvent) => {
    void (async () => {
      try {
        const entityType = (event.data?.entity_type || event.data?.entityType) as string | undefined;
        if (!entityType || !event.data) return;

        const newStatus = event.status;
        if (entityType === "lead") {
          if (newStatus === "converted")  await handleFollowupEvent("lead_converted",   "lead",     event.data);
          else if (newStatus === "lost")  await handleFollowupEvent("lead_lost",        "lead",     event.data);
          else if (newStatus === "contacted") await handleFollowupEvent("lead_created", "lead",     event.data);
        } else if (entityType === "customer") {
          if (newStatus === "order_confirmed")  await handleFollowupEvent("order_placed",      "customer", event.data);
          else if (newStatus === "paid")        await handleFollowupEvent("payment_received",  "customer", event.data);
          else if (newStatus === "quote_sent")  await handleFollowupEvent("quote_sent",        "customer", event.data);
          else if (newStatus === "overdue")     await handleFollowupEvent("invoice_overdue",   "customer", event.data);
          else if (newStatus === "shipped")     await handleFollowupEvent("delivery_shipped",  "customer", event.data);
        }
      } catch (e) {
        logger.error("[CrmFollowupEngine] event bus handler error", { error: String(e) });
      }
    })();
  });

  eventBus.on("record.created", (event: RecordEvent) => {
    void (async () => {
      try {
        const entityType = event.data?.entity_type as string | undefined;
        if (entityType === "lead" && event.data) await handleFollowupEvent("lead_created", "lead", event.data);
      } catch (e) {
        logger.error("[CrmFollowupEngine] record.created handler error", { error: String(e) });
      }
    })();
  });
}

// ── Inaction scanner (respects trigger_event subtype) ────────────────────────

const INACTION_SQL_MAP: Record<string, { leadSql?: string; customerSql?: string }> = {
  no_order: {
    leadSql: `
      SELECT l.id, CONCAT(l.first_name, ' ', l.last_name) as name, l.phone, l.whatsapp, l.email
      FROM crm_leads l
      WHERE l.status NOT IN ('converted','lost')
        AND NOT EXISTS (
          SELECT 1 FROM sales_orders so
          WHERE so.lead_id = l.id AND so.created_at > NOW() - INTERVAL '1 day' * $days
        )`,
    customerSql: `
      SELECT c.id, c.name, c.phone, c.mobile, c.email
      FROM customers c WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM sales_orders so
          WHERE so.customer_id = c.id AND so.created_at > NOW() - INTERVAL '1 day' * $days
        )`,
  },
  quote_not_responded: {
    leadSql: `
      SELECT DISTINCT l.id, CONCAT(l.first_name, ' ', l.last_name) as name, l.phone, l.whatsapp, l.email
      FROM crm_leads l
      JOIN quotes q ON q.lead_id = l.id
      WHERE q.status = 'sent'
        AND q.created_at < NOW() - INTERVAL '1 day' * $days
        AND l.status NOT IN ('converted','lost')`,
    customerSql: `
      SELECT DISTINCT c.id, c.name, c.phone, c.mobile, c.email
      FROM customers c
      JOIN quotes q ON q.customer_id = c.id
      WHERE q.status = 'sent'
        AND q.created_at < NOW() - INTERVAL '1 day' * $days
        AND c.status = 'active'`,
  },
  lead_stale: {
    leadSql: `
      SELECT l.id, CONCAT(l.first_name, ' ', l.last_name) as name, l.phone, l.whatsapp, l.email
      FROM crm_leads l
      WHERE l.status NOT IN ('converted','lost')
        AND (l.last_activity_at IS NULL OR l.last_activity_at < NOW() - INTERVAL '1 day' * $days)`,
  },
  no_contact: {
    leadSql: `
      SELECT l.id, CONCAT(l.first_name, ' ', l.last_name) as name, l.phone, l.whatsapp, l.email
      FROM crm_leads l
      WHERE l.status NOT IN ('converted','lost')
        AND NOT EXISTS (
          SELECT 1 FROM integration_messages im
          WHERE im.entity_type = 'lead' AND im.entity_id = l.id
            AND im.direction IN ('outbound','outgoing')
            AND im.created_at > NOW() - INTERVAL '1 day' * $days
        )`,
    customerSql: `
      SELECT c.id, c.name, c.phone, c.mobile, c.email
      FROM customers c WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM integration_messages im
          WHERE im.entity_type = 'customer' AND im.entity_id = c.id
            AND im.direction IN ('outbound','outgoing')
            AND im.created_at > NOW() - INTERVAL '1 day' * $days
        )`,
  },
};

async function runInactionScan(): Promise<void> {
  logger.info("[CrmFollowupEngine] Starting inaction scan");
  let rulesProcessed = 0;

  try {
    const rows = await pgExecute(sql`
      SELECT * FROM crm_followup_rules
      WHERE is_active = TRUE AND trigger_type = 'inaction' AND inaction_days IS NOT NULL
      ORDER BY priority ASC
    `);
    const rules = rows.rows as any[];

    for (const rule of rules) {
      rulesProcessed++;
      const days = Number(rule.inaction_days);
      const inactionEvent = (rule.trigger_event as string) || "no_contact";
      const sqlDef = INACTION_SQL_MAP[inactionEvent] || INACTION_SQL_MAP["no_contact"];

      const entityTypes: Array<"lead" | "customer"> = rule.trigger_entity === "customer"
        ? ["customer"]
        : rule.trigger_entity === "both" ? ["lead", "customer"] : ["lead"];

      for (const entityType of entityTypes) {
        const rawSql = entityType === "lead" ? sqlDef.leadSql : sqlDef.customerSql;
        if (!rawSql) continue;

        const querySql = rawSql.replace(/\$days/g, String(days)) + " LIMIT 100";
        try {
          const entityRows = await pgExecute(sql.raw(querySql));
          const entities = entityRows.rows as any[];

          logger.info("[CrmFollowupEngine] Inaction candidates", {
            ruleId: rule.id, inactionEvent, entityType, days, count: entities.length,
          });

          for (const entity of entities) {
            const phone = entity.phone || entity.whatsapp || entity.mobile || null;
            const email = entity.email || null;
            await enqueueRule(rule as Record<string, unknown>, entityType, entity.id, entity.name || null, phone, email);
          }
        } catch (e) {
          logger.error("[CrmFollowupEngine] Inaction SQL error", { ruleId: rule.id, entityType, error: String(e) });
        }
      }
    }
  } catch (e) {
    logger.error("[CrmFollowupEngine] runInactionScan error", { error: String(e) });
  }

  logger.info("[CrmFollowupEngine] Inaction scan complete", { rulesProcessed });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fireCrmFollowupEvent(
  triggerEvent: string,
  entityType: string,
  entity: {
    id: number;
    name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    whatsapp?: string;
    mobile?: string;
    email?: string;
    [key: string]: unknown;
  }
): Promise<void> {
  await handleFollowupEvent(triggerEvent, entityType, entity as Record<string, unknown>);
}

// ── Startup ───────────────────────────────────────────────────────────────────

let engineStarted = false;

export function startCrmFollowupEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  registerEventListeners();

  // Durable pending queue worker (picks up delayed executions that survived restarts)
  setTimeout(() => {
    processPendingQueue().catch((e) => logger.error("[CrmFollowupEngine] pending worker error", { error: String(e) }));
    setInterval(() => {
      processPendingQueue().catch((e) => logger.error("[CrmFollowupEngine] pending worker error", { error: String(e) }));
    }, PENDING_WORKER_INTERVAL_MS);
  }, 10000); // 10s after startup

  // Inaction scanner
  setTimeout(() => {
    runInactionScan().catch((e) => logger.error("[CrmFollowupEngine] inaction scan error", { error: String(e) }));
  }, 60000); // 60s after startup

  setInterval(() => {
    runInactionScan().catch((e) => logger.error("[CrmFollowupEngine] inaction scan error", { error: String(e) }));
  }, INACTION_SCAN_INTERVAL_MS);

  logger.info("[CrmFollowupEngine] Started — event listeners registered, inaction scan every 6h, pending worker every 15min");
}
