import { db, pool } from "@workspace/db";
import { entityRecordsTable, notificationsTable, statusTransitionsTable, entityStatusesTable, approvalRequestsTable, integrationConnectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { sendSmsMessage } from "./sms-service";
import { sendTelegramMessage } from "./telegram-service";

export interface ActionConfig {
  type: string;
  config: Record<string, any>;
  id?: string;
  label?: string;
}

export interface ActionResult {
  action: string;
  success: boolean;
  error?: string;
  details?: Record<string, any>;
  startedAt?: string;
  completedAt?: string;
  stepIndex?: number;
  paused?: boolean;
}

export interface ActionContext {
  entityId: number;
  recordId: number;
  data: Record<string, any>;
  oldData?: Record<string, any>;
  status?: string | null;
  oldStatus?: string | null;
  workflowId?: number;
  executionLogId?: number;
  stepIndex?: number;
}

export async function executeAction(
  action: ActionConfig,
  context: ActionContext
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  try {
    let result: ActionResult;
    switch (action.type) {
      case "update_field":
        result = await executeUpdateField(action.config, context);
        break;
      case "set_status":
      case "change_status":
        result = await executeSetStatus(action.config, context);
        break;
      case "create_record":
        result = await executeCreateRecord(action.config, context);
        break;
      case "send_notification":
        result = await executeSendNotification(action.config, context);
        break;
      case "call_webhook":
        result = await executeCallWebhook(action.config, context);
        break;
      case "send_email":
        result = await executeSendEmail(action.config, context);
        break;
      case "approval":
        result = await executeApproval(action.config, context);
        break;
      case "wait_delay":
      case "delay":
        result = await executeDelay(action.config, context);
        break;
      case "conditional_branch":
      case "condition_check":
        result = executeConditionalBranch(action.config, context);
        break;
      case "aggregate_children":
        result = await executeAggregateChildren(action.config, context);
        break;
      case "send_channel_message":
        result = await executeSendChannelMessage(action.config, context);
        break;
      default:
        result = { action: action.type, success: false, error: `Unknown action type: ${action.type}` };
    }
    result.startedAt = startedAt;
    result.completedAt = new Date().toISOString();
    result.stepIndex = context.stepIndex;
    return result;
  } catch (err: any) {
    return {
      action: action.type,
      success: false,
      error: err.message,
      startedAt,
      completedAt: new Date().toISOString(),
      stepIndex: context.stepIndex,
    };
  }
}

async function executeUpdateField(
  config: Record<string, any>,
  context: { entityId: number; recordId: number; data: Record<string, any> }
): Promise<ActionResult> {
  const fieldSlug = config.fieldSlug || config.fieldName;
  if (!fieldSlug) return { action: "update_field", success: false, error: "Missing fieldSlug in config" };

  const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, context.recordId));
  if (!existing) return { action: "update_field", success: false, error: "Record not found" };

  const currentData = existing.data as Record<string, any>;
  const value = config.value ?? config.newValue;
  const resolvedValue = resolveTemplateValue(value, context.data);
  const updatedData = { ...currentData, [fieldSlug]: resolvedValue };

  await db.update(entityRecordsTable)
    .set({ data: updatedData, updatedAt: new Date() })
    .where(eq(entityRecordsTable.id, context.recordId));

  return { action: "update_field", success: true, details: { fieldSlug, value: resolvedValue } };
}

async function executeSetStatus(
  config: Record<string, any>,
  context: { entityId: number; recordId: number; data: Record<string, any> }
): Promise<ActionResult> {
  const status = config.status || config.newStatus;
  if (!status) return { action: "set_status", success: false, error: "Missing status in config" };

  const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, context.recordId));
  if (!existing) return { action: "set_status", success: false, error: "Record not found" };

  const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, context.entityId));
  const transitions = await db.select().from(statusTransitionsTable).where(eq(statusTransitionsTable.entityId, context.entityId));

  if (transitions.length > 0) {
    const fromStatusDef = existing.status ? statuses.find(s => s.slug === existing.status) : null;
    const toStatusDef = statuses.find(s => s.slug === status);
    if (toStatusDef) {
      const validTransition = transitions.find(t =>
        (t.fromStatusId === null || t.fromStatusId === fromStatusDef?.id) &&
        t.toStatusId === toStatusDef.id
      );
      if (!validTransition) {
        return { action: "set_status", success: false, error: `Invalid status transition from '${existing.status}' to '${status}'` };
      }

      if (validTransition.conditions) {
        const conditions = validTransition.conditions as any;
        let conditionsList: any[] = [];
        if (Array.isArray(conditions)) conditionsList = conditions;
        else if (conditions.rules && Array.isArray(conditions.rules)) conditionsList = conditions.rules;

        if (conditionsList.length > 0) {
          const recordData = (existing.data as Record<string, any>) || {};
          const met = conditionsList.every((cond: any) => {
            const { field, operator, value } = cond;
            if (!field || !operator) return true;
            const fieldValue = field === "status" ? existing.status : recordData[field];
            return evaluateOperator(fieldValue, operator, value);
          });
          if (!met) {
            const msg = (conditions as any).errorMessage || "Status transition conditions not met";
            return { action: "set_status", success: false, error: msg };
          }
        }
      }
    }
  }

  await db.update(entityRecordsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(entityRecordsTable.id, context.recordId));

  return { action: "set_status", success: true, details: { status, previousStatus: existing.status } };
}

function evaluateOperator(fieldValue: any, operator: string, value: any): boolean {
  switch (operator) {
    case "equals":
    case "eq":
      return String(fieldValue) === String(value);
    case "not_equals":
    case "neq":
      return String(fieldValue) !== String(value);
    case "greater_than":
    case "gt":
      return Number(fieldValue) > Number(value);
    case "less_than":
    case "lt":
      return Number(fieldValue) < Number(value);
    case "gte":
      return Number(fieldValue) >= Number(value);
    case "lte":
      return Number(fieldValue) <= Number(value);
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(String(value));
    case "is_empty":
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    case "is_not_empty":
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    default:
      return true;
  }
}

async function resolveEntitySlug(entitySlug: string, contextEntityId: number): Promise<number | null> {
  const { moduleEntitiesTable } = await import("@workspace/db/schema");
  const [contextEntity] = await db.select({ moduleId: moduleEntitiesTable.moduleId })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.id, contextEntityId));

  if (!contextEntity) return null;

  const [exactMatch] = await db.select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(and(
      eq(moduleEntitiesTable.moduleId, contextEntity.moduleId),
      eq(moduleEntitiesTable.slug, entitySlug),
    ));
  if (exactMatch) return exactMatch.id;

  const [globalExact] = await db.select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, entitySlug));
  return globalExact?.id || null;
}

async function executeCreateRecord(
  config: Record<string, any>,
  context: { entityId: number; data: Record<string, any> }
): Promise<ActionResult> {
  let targetEntityId = config.entityId || null;

  if (!targetEntityId && config.entitySlug) {
    targetEntityId = await resolveEntitySlug(config.entitySlug, context.entityId);
    if (!targetEntityId) {
      return {
        action: "create_record",
        success: false,
        error: `Could not resolve entity slug "${config.entitySlug}" for create_record action`,
      };
    }
  }

  if (!targetEntityId) {
    targetEntityId = context.entityId;
  }

  const recordData: Record<string, any> = {};

  if (config.fieldMappings && typeof config.fieldMappings === "object") {
    for (const [targetField, sourceExpr] of Object.entries(config.fieldMappings)) {
      recordData[targetField] = resolveTemplateValue(sourceExpr, context.data);
    }
  }

  if (config.staticData && typeof config.staticData === "object") {
    Object.assign(recordData, config.staticData);
  }

  const [newRecord] = await db.insert(entityRecordsTable).values({
    entityId: targetEntityId,
    data: recordData,
    status: config.status || "draft",
  }).returning();

  return { action: "create_record", success: true, details: { recordId: newRecord.id, entityId: targetEntityId } };
}

async function executeSendNotification(
  config: Record<string, any>,
  context: { entityId: number; recordId: number; data: Record<string, any> }
): Promise<ActionResult> {
  const { createNotification, createNotificationForAllUsers, createNotificationForRole } = await import("./notification-service");
  const title = resolveTemplateValue(config.title || "Workflow Notification", context.data);
  const message = resolveTemplateValue(config.message || "", context.data);
  const type = config.notificationType || "workflow";

  const params = {
    type,
    title: String(title),
    message: String(message),
    recordId: context.recordId,
    priority: config.priority || "normal",
    category: "workflow" as const,
    actionUrl: config.actionUrl || null,
    metadata: { entityId: context.entityId, source: "workflow" },
  };

  if (config.userId) {
    const notification = await createNotification({ ...params, userId: Number(config.userId) });
    return { action: "send_notification", success: true, details: { notificationId: notification?.id } };
  } else if (config.targetRole) {
    const notifications = await createNotificationForRole(String(config.targetRole), params);
    return { action: "send_notification", success: true, details: { count: notifications.length, role: config.targetRole } };
  } else {
    const notifications = await createNotificationForAllUsers(params);
    return { action: "send_notification", success: true, details: { count: notifications.length } };
  }
}

async function executeSendEmail(
  config: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const to = resolveTemplateValue(config.to || "", context.data);
  const subject = resolveTemplateValue(config.subject || "", context.data);
  const body = resolveTemplateValue(config.body || "", context.data);

  if (!to) return { action: "send_email", success: false, error: "Missing recipient (to) in config" };
  if (!subject) return { action: "send_email", success: false, error: "Missing subject in config" };

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to,
        subject: String(subject),
        html: String(body),
      });

      return { action: "send_email", success: true, details: { to, subject, method: "smtp" } };
    } catch (err: any) {
      return { action: "send_email", success: false, error: `SMTP error: ${err.message}` };
    }
  }

  const { createNotificationForAllUsers: fanOut } = await import("./notification-service");
  await fanOut({
    type: "email",
    title: `Email: ${String(subject)}`,
    message: `To: ${to}\n\n${String(body)}`,
    recordId: context.recordId,
    priority: "normal",
    category: "system",
    metadata: { to, subject, source: "email_fallback" },
  });

  return {
    action: "send_email",
    success: true,
    details: { to, subject, method: "notification_fallback", note: "SMTP not configured — logged as notification" },
  };
}

async function executeApproval(
  config: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const approverRole = config.approverRole || config.approver || null;
  const approverEmail = config.approverEmail || null;

  const [request] = await db.insert(approvalRequestsTable).values({
    workflowId: context.workflowId || null,
    executionLogId: context.executionLogId || null,
    entityId: context.entityId,
    recordId: context.recordId,
    stepIndex: context.stepIndex ?? 0,
    approverRole,
    approverEmail,
    status: "pending",
    pendingActions: config.onApprove || [],
    rejectActions: config.onReject || [],
    context: {
      entityId: context.entityId,
      recordId: context.recordId,
      data: context.data,
      status: context.status,
    },
  }).returning();

  const { createNotificationForAllUsers, createNotificationForRole } = await import("./notification-service");
  const notifyParams = {
    type: "approval_request",
    title: resolveTemplateValue(config.title || "Approval Required", context.data),
    message: resolveTemplateValue(config.message || "A workflow step requires your approval.", context.data),
    recordId: context.recordId,
    priority: "high" as const,
    category: "approval" as const,
    actionUrl: config.actionUrl || `/builder/data/${context.entityId}`,
    metadata: { approvalRequestId: request.id, entityId: context.entityId, source: "workflow" },
  };

  if (approverRole) {
    await createNotificationForRole(String(approverRole), notifyParams);
  } else {
    await createNotificationForAllUsers(notifyParams);
  }

  return {
    action: "approval",
    success: true,
    paused: true,
    details: { approvalRequestId: request.id, approverRole, approverEmail, status: "pending" },
  };
}

async function executeDelay(
  config: Record<string, any>,
  _context: ActionContext
): Promise<ActionResult> {
  const duration = Number(config.duration || 0);
  const unit = config.unit || "minutes";

  if (duration <= 0) {
    return { action: "delay", success: false, error: "Duration must be greater than 0" };
  }

  let delayMs: number;
  switch (unit) {
    case "seconds":
      delayMs = duration * 1000;
      break;
    case "minutes":
      delayMs = duration * 60 * 1000;
      break;
    case "hours":
      delayMs = duration * 60 * 60 * 1000;
      break;
    case "days":
      delayMs = duration * 24 * 60 * 60 * 1000;
      break;
    default:
      delayMs = duration * 60 * 1000;
  }

  const maxDelay = 5 * 60 * 1000;
  const actualDelay = Math.min(delayMs, maxDelay);

  if (actualDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  return {
    action: "delay",
    success: true,
    details: {
      requestedDuration: duration,
      unit,
      requestedMs: delayMs,
      actualDelayMs: actualDelay,
      capped: delayMs > maxDelay,
      resumeAt: new Date(Date.now() + delayMs).toISOString(),
    },
  };
}

function executeConditionalBranch(
  config: Record<string, any>,
  context: ActionContext
): ActionResult {
  const conditions = config.conditions || [];
  const data = context.data || {};
  const statusContext = { status: context.status, oldStatus: context.oldStatus };

  let branchTaken = "else";
  const branchResults: Record<string, boolean> = {};

  if (Array.isArray(conditions)) {
    for (const condition of conditions) {
      const { field, operator, value, branch } = condition;
      if (!field || !operator) continue;

      let fieldValue: any;
      if (field === "status") {
        fieldValue = statusContext.status;
      } else if (field === "oldStatus") {
        fieldValue = statusContext.oldStatus;
      } else {
        fieldValue = data[field];
      }

      const result = evaluateOperator(fieldValue, operator, value);
      const branchName = branch || "if";
      branchResults[branchName] = result;

      if (result && branchTaken === "else") {
        branchTaken = branchName;
      }
    }
  }

  return {
    action: "conditional_branch",
    success: true,
    details: { branchTaken, branchResults, conditions },
  };
}

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
];

function isUrlSafe(urlStr: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { safe: false, reason: "Only http and https protocols are allowed" };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(hostname)) {
      return { safe: false, reason: "Webhook target host is not allowed" };
    }
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
      return { safe: false, reason: "Webhook target must not be a private network address" };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
}

async function executeCallWebhook(
  config: Record<string, any>,
  context: { entityId: number; recordId: number; data: Record<string, any>; status?: string | null }
): Promise<ActionResult> {
  const { url, method = "POST", headers = {} } = config;
  if (!url) return { action: "call_webhook", success: false, error: "Missing url in config" };

  const urlCheck = isUrlSafe(url);
  if (!urlCheck.safe) {
    return { action: "call_webhook", success: false, error: urlCheck.reason };
  }

  const payload = {
    event: "workflow_action",
    entityId: context.entityId,
    recordId: context.recordId,
    data: context.data,
    status: context.status,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(url, {
    method: method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" ? method : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  return {
    action: "call_webhook",
    success: response.ok,
    details: { statusCode: response.status, url },
    ...(response.ok ? {} : { error: `Webhook returned status ${response.status}` }),
  };
}

async function executeAggregateChildren(
  config: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const { childEntityId, parentField, childField, aggregation, linkField } = config;
  if (!childEntityId || !parentField || !childField || !linkField) {
    return { action: "aggregate_children", success: false, error: "Missing required config: childEntityId, parentField, childField, linkField" };
  }

  const children = await db.select().from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, childEntityId));

  const linkedChildren = children.filter(c => {
    const d = c.data as Record<string, any>;
    return d[linkField] === context.recordId;
  });

  let aggregatedValue: number = 0;
  if (aggregation === "sum" || !aggregation) {
    aggregatedValue = linkedChildren.reduce((sum, c) => {
      const d = c.data as Record<string, any>;
      return sum + (Number(d[childField]) || 0);
    }, 0);
  } else if (aggregation === "count") {
    aggregatedValue = linkedChildren.length;
  } else if (aggregation === "avg" && linkedChildren.length > 0) {
    const total = linkedChildren.reduce((sum, c) => {
      const d = c.data as Record<string, any>;
      return sum + (Number(d[childField]) || 0);
    }, 0);
    aggregatedValue = total / linkedChildren.length;
  }

  const [parent] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, context.recordId));
  if (!parent) return { action: "aggregate_children", success: false, error: "Parent record not found" };

  const parentData = parent.data as Record<string, any>;
  const updatedData = { ...parentData, [parentField]: aggregatedValue };

  await db.update(entityRecordsTable)
    .set({ data: updatedData, updatedAt: new Date() })
    .where(eq(entityRecordsTable.id, context.recordId));

  return { action: "aggregate_children", success: true, details: { parentField, aggregatedValue, childCount: linkedChildren.length } };
}

async function executeSendChannelMessage(
  config: Record<string, any>,
  context: { entityId: number; recordId: number; data: Record<string, any> }
): Promise<ActionResult> {
  const channel = (config.channel || "whatsapp") as string;
  const recipient = config.recipient || "";
  const templateId = (config.templateId || "") as string;
  const messageTemplate = (config.message || "") as string;
  const connectionId = config.connectionId ? Number(config.connectionId) : null;

  if (!recipient) {
    return { action: "send_channel_message", success: false, error: "Missing recipient in config" };
  }
  if (!messageTemplate && !templateId) {
    return { action: "send_channel_message", success: false, error: "Must provide message text or templateId" };
  }

  let messageBody = messageTemplate;
  messageBody = messageBody.replace(/\{\{record\.(\w+)\}\}/g, (_: string, key: string) => {
    return context.data[key] !== undefined ? String(context.data[key]) : "";
  });

  let resolvedConnectionId = connectionId;
  if (!resolvedConnectionId) {
    const CHANNEL_SLUGS: Record<string, string[]> = {
      whatsapp: ["whatsapp", "whatsapp-api"],
      sms: ["sms", "twilio", "nexmo", "vonage"],
      telegram: ["telegram", "telegram-bot"],
      email: ["gmail"],
    };
    const slugs = CHANNEL_SLUGS[channel] ?? [channel];
    const conns = await db.select().from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.isActive, true));
    const match = conns.find(c => slugs.includes(c.slug ?? ""));
    if (match) resolvedConnectionId = match.id;
  }

  if (!resolvedConnectionId) {
    const logErr = `No active ${channel} connection configured`;
    try {
      await pool.query(
        `INSERT INTO notification_delivery_log (channel, recipient_phone, status, error_message, metadata, sent_at)
         VALUES ($1,$2,'failed',$3,$4,NOW())`,
        [channel, recipient, logErr, JSON.stringify({ entityId: context.entityId, recordId: context.recordId })]
      );
    } catch (logInsertErr) {
      console.warn("[send_channel_message] Failed to log delivery failure:", logInsertErr instanceof Error ? logInsertErr.message : logInsertErr);
    }
    return { action: "send_channel_message", success: false, error: logErr };
  }

  let sendResult: { success: boolean; messageId?: string | number; error?: string } = { success: false };

  if (channel === "whatsapp") {
    sendResult = await sendWhatsAppMessage({
      connectionId: resolvedConnectionId, to: recipient, message: messageBody,
      entityType: "automation", entityId: context.recordId,
      ...(templateId ? { templateName: templateId } : {}),
    });
  } else if (channel === "sms") {
    sendResult = await sendSmsMessage({
      connectionId: resolvedConnectionId, to: recipient, message: messageBody,
      entityId: context.recordId,
    });
  } else if (channel === "telegram") {
    sendResult = await sendTelegramMessage({
      connectionId: resolvedConnectionId, chatId: recipient, message: messageBody,
    });
  } else {
    sendResult = { success: false, error: `Channel '${channel}' not supported for direct send; use send_email action instead` };
  }

  const logStatus = sendResult.success ? "sent" : "failed";
  try {
    await pool.query(
      `INSERT INTO notification_delivery_log (channel, recipient_phone, status, error_message, external_id, metadata, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [
        channel, recipient, logStatus,
        sendResult.error ?? null,
        sendResult.messageId != null ? String(sendResult.messageId) : null,
        JSON.stringify({ templateId: templateId || null, entityId: context.entityId, recordId: context.recordId }),
      ]
    );
  } catch (logInsertErr) {
    console.warn("[send_channel_message] Failed to log delivery result:", logInsertErr instanceof Error ? logInsertErr.message : logInsertErr);
  }

  if (!sendResult.success) {
    return { action: "send_channel_message", success: false, error: sendResult.error ?? "Send failed" };
  }
  return {
    action: "send_channel_message",
    success: true,
    details: { channel, recipient, templateId: templateId || null, messageId: sendResult.messageId != null ? String(sendResult.messageId) : undefined },
  };
}

export function resolveTemplateValue(value: any, data: Record<string, any>): any {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === "__now__") return new Date().toISOString();
    if (key === "__today__") return new Date().toISOString().split("T")[0];
    if (key === "__timestamp__") return String(Date.now());
    return data[key] !== undefined ? String(data[key]) : "";
  });
}
