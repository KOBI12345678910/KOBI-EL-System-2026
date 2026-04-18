import { db, backgroundPool, withRetry } from "@workspace/db";
import {
  platformWorkflowsTable,
  platformAutomationsTable,
  automationExecutionLogsTable,
  moduleEntitiesTable,
  entityRecordsTable,
  approvalRequestsTable,
  notificationsTable,
  workflowStepsTable,
  workflowTransitionsTable,
  workflowInstancesTable,
  workflowStepLogsTable,
} from "@workspace/db/schema";
import * as schema from "@workspace/db/schema";
import { drizzle as makeDrizzle } from "drizzle-orm/node-postgres";
import { eq, and, lte, sql, asc, desc } from "drizzle-orm";
import { eventBus, type RecordEvent, type RecordEventType } from "./event-bus";
import { executeAction, type ActionConfig, type ActionResult, type ActionContext } from "./action-executors";
import { computePaymentComparison, extractComparisonInputFromData } from "./contractor-decision";
import { initializeCrossModuleSync } from "./cross-module-sync";
import { initBusinessRulesEngine } from "./business-rules-engine";

const bgDb = makeDrizzle(backgroundPool, { schema });

const eventToTriggerType: Record<string, string> = {
  "record.created": "on_create",
  "record.updated": "on_update",
  "record.deleted": "on_delete",
  "record.status_changed": "on_status_change",
};

function evaluateConditions(conditions: any[], data: Record<string, any>, context: Record<string, any> = {}): boolean {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const { field, operator, value } = condition;
    if (!field || !operator) return true;

    let fieldValue: any;
    if (field.startsWith("status")) {
      fieldValue = context.status;
    } else if (field.startsWith("oldStatus")) {
      fieldValue = context.oldStatus;
    } else {
      fieldValue = data[field];
    }

    switch (operator) {
      case "equals":
      case "eq":
        return String(fieldValue) === String(value);
      case "not_equals":
      case "neq":
        return String(fieldValue) !== String(value);
      case "contains":
        return typeof fieldValue === "string" && fieldValue.includes(String(value));
      case "not_contains":
        return typeof fieldValue === "string" && !fieldValue.includes(String(value));
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
      case "in":
        return Array.isArray(value) && value.includes(fieldValue);
      case "not_in":
        return Array.isArray(value) && !value.includes(fieldValue);
      case "is_empty":
        return fieldValue === undefined || fieldValue === null || fieldValue === "";
      case "is_not_empty":
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
      case "is_true":
        return fieldValue === true || fieldValue === "true";
      case "is_false":
        return fieldValue === false || fieldValue === "false" || !fieldValue;
      default:
        return true;
    }
  });
}

async function getEntityModuleId(entityId: number): Promise<number | null> {
  const [entity] = await db.select({ moduleId: moduleEntitiesTable.moduleId })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.id, entityId));
  return entity?.moduleId ?? null;
}

interface StepLog extends ActionResult {
  stepIndex: number;
  branchPath?: string;
}

const MAX_WORKFLOW_DEPTH = 10;
const WORKFLOW_ACTION_TIMEOUT_MS = 30_000;

async function executeActionWithTimeout(action: ActionConfig, context: ActionContext): Promise<ActionResult> {
  return Promise.race([
    executeAction(action, context),
    new Promise<ActionResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Action '${action.type}' timed out after ${WORKFLOW_ACTION_TIMEOUT_MS}ms`)), WORKFLOW_ACTION_TIMEOUT_MS)
    ),
  ]);
}

async function executeWorkflowActions(
  actions: ActionConfig[],
  baseContext: ActionContext,
  workflowId?: number,
  _depth = 0
): Promise<{ stepsExecuted: StepLog[]; overallStatus: string; errorMessage: string | null }> {
  if (_depth > MAX_WORKFLOW_DEPTH) {
    console.error(`[WorkflowEngine] Max recursion depth (${MAX_WORKFLOW_DEPTH}) exceeded — aborting branch execution`);
    return { stepsExecuted: [], overallStatus: "failed", errorMessage: `Max action nesting depth (${MAX_WORKFLOW_DEPTH}) exceeded` };
  }

  const stepsExecuted: StepLog[] = [];
  let overallStatus = "completed";
  let errorMessage: string | null = null;

  const executionLogId = baseContext.executionLogId;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const stepContext: ActionContext = {
      ...baseContext,
      workflowId,
      executionLogId,
      stepIndex: i,
    };

    if (action.type === "conditional_branch" || action.type === "condition_check") {
      const branchResult = await executeActionWithTimeout(action, stepContext);
      const stepLog: StepLog = { ...branchResult, stepIndex: i };
      stepsExecuted.push(stepLog);

      if (!branchResult.success) {
        overallStatus = "failed";
        errorMessage = branchResult.error || "Branch evaluation failed";
        break;
      }

      const branchTaken = branchResult.details?.branchTaken || "else";
      const branchConfig = action.config;

      let branchActions: ActionConfig[] = [];
      if (branchTaken === "if" && branchConfig.ifActions) {
        branchActions = branchConfig.ifActions;
      } else if (branchConfig.elseActions) {
        branchActions = branchConfig.elseActions;
      }

      if (branchActions.length > 0) {
        const branchResult2 = await executeWorkflowActions(branchActions, baseContext, workflowId, _depth + 1);
        for (const step of branchResult2.stepsExecuted) {
          stepsExecuted.push({ ...step, branchPath: `${branchTaken}` });
        }
        if (branchResult2.overallStatus === "failed") {
          overallStatus = "failed";
          errorMessage = branchResult2.errorMessage;
          break;
        }
        if (branchResult2.overallStatus === "paused") {
          overallStatus = "paused";
          break;
        }
      }
      continue;
    }

    if (action.type === "approval") {
      const remainingActions = actions.slice(i + 1);
      const result = await executeActionWithTimeout(action, stepContext);
      const stepLog: StepLog = { ...result, stepIndex: i };
      stepsExecuted.push(stepLog);

      if (result.paused && result.details?.approvalRequestId) {
        await db.update(approvalRequestsTable)
          .set({
            pendingActions: [
              ...(action.config.onApprove || []),
              ...remainingActions,
            ],
            rejectActions: action.config.onReject || [],
          })
          .where(eq(approvalRequestsTable.id, result.details.approvalRequestId));
        overallStatus = "paused";
        break;
      }

      if (!result.success) {
        overallStatus = "failed";
        errorMessage = result.error || "Action failed";
        break;
      }
      continue;
    }

    let result: ActionResult;
    try {
      result = await executeActionWithTimeout(action, stepContext);
    } catch (actionErr: unknown) {
      const msg = actionErr instanceof Error ? actionErr.message : String(actionErr);
      console.error(`[WorkflowEngine] Action '${action.type}' at step ${i} failed:`, msg);
      result = { action: action.type, success: false, error: msg };
    }
    const stepLog: StepLog = { ...result, stepIndex: i };
    stepsExecuted.push(stepLog);

    if (result.paused) {
      overallStatus = "paused";
      break;
    }

    if (!result.success) {
      overallStatus = "failed";
      errorMessage = result.error || "Action failed";
      break;
    }
  }

  return { stepsExecuted, overallStatus, errorMessage };
}

async function processWorkflows(event: RecordEvent): Promise<void> {
  const expectedTriggerType = eventToTriggerType[event.type];
  if (!expectedTriggerType) return;

  const moduleId = await getEntityModuleId(event.entityId);
  if (!moduleId) return;

  const workflows = await db.select().from(platformWorkflowsTable)
    .where(and(
      eq(platformWorkflowsTable.moduleId, moduleId),
      eq(platformWorkflowsTable.isActive, true),
      eq(platformWorkflowsTable.triggerType, expectedTriggerType),
    ));

  for (const workflow of workflows) {
    const triggerConfig = workflow.triggerConfig as Record<string, any> | null;
    if (triggerConfig?.entityId && triggerConfig.entityId !== event.entityId) continue;

    const conditions = workflow.conditions as any[];
    const conditionContext = { status: event.status, oldStatus: event.oldStatus };
    if (!evaluateConditions(conditions, event.data, conditionContext)) continue;

    const actions = workflow.actions as ActionConfig[];
    if (!actions || actions.length === 0) continue;

    const startedAt = new Date();

    const [logEntry] = await db.insert(automationExecutionLogsTable).values({
      workflowId: workflow.id,
      executionType: "workflow",
      entityId: event.entityId,
      triggerEvent: event.type,
      triggerRecordId: event.recordId,
      status: "running",
      stepsExecuted: [],
      result: { workflowName: workflow.name },
      startedAt,
    }).returning();

    const baseContext: ActionContext = {
      entityId: event.entityId,
      recordId: event.recordId,
      data: event.data,
      oldData: event.oldData,
      status: event.status,
      oldStatus: event.oldStatus,
      workflowId: workflow.id,
      executionLogId: logEntry.id,
    };

    const { stepsExecuted, overallStatus, errorMessage } = await executeWorkflowActions(actions, baseContext, workflow.id);

    await db.update(automationExecutionLogsTable)
      .set({
        status: overallStatus,
        stepsExecuted,
        errorMessage,
        completedAt: overallStatus !== "paused" ? new Date() : null,
      })
      .where(eq(automationExecutionLogsTable.id, logEntry.id));
  }
}

async function processAutomations(event: RecordEvent): Promise<void> {
  const expectedTriggerType = eventToTriggerType[event.type];
  if (!expectedTriggerType) return;

  const moduleId = await getEntityModuleId(event.entityId);
  if (!moduleId) return;

  const automations = await db.select().from(platformAutomationsTable)
    .where(and(
      eq(platformAutomationsTable.moduleId, moduleId),
      eq(platformAutomationsTable.isActive, true),
      eq(platformAutomationsTable.triggerType, expectedTriggerType),
    ));

  for (const automation of automations) {
    if (automation.triggerEntityId && automation.triggerEntityId !== event.entityId) continue;

    const triggerConfig = automation.triggerConfig as Record<string, any> | null;
    if (triggerConfig?.entityId && triggerConfig.entityId !== event.entityId) continue;

    const conditions = automation.conditions as any[];
    const conditionContext = { status: event.status, oldStatus: event.oldStatus };
    if (!evaluateConditions(conditions, event.data, conditionContext)) continue;

    const actions = automation.actions as ActionConfig[];
    if (!actions || actions.length === 0) continue;

    const startedAt = new Date();

    const [logEntry] = await db.insert(automationExecutionLogsTable).values({
      automationId: automation.id,
      executionType: "automation",
      entityId: event.entityId,
      triggerEvent: event.type,
      triggerRecordId: event.recordId,
      status: "running",
      stepsExecuted: [],
      result: { automationName: automation.name },
      startedAt,
    }).returning();

    const baseContext: ActionContext = {
      entityId: event.entityId,
      recordId: event.recordId,
      data: event.data,
      oldData: event.oldData,
      status: event.status,
      oldStatus: event.oldStatus,
      executionLogId: logEntry.id,
    };

    const { stepsExecuted, overallStatus, errorMessage } = await executeWorkflowActions(actions, baseContext);

    await db.update(automationExecutionLogsTable)
      .set({
        status: overallStatus,
        stepsExecuted,
        errorMessage,
        completedAt: overallStatus !== "paused" ? new Date() : null,
      })
      .where(eq(automationExecutionLogsTable.id, logEntry.id));

    await db.update(platformAutomationsTable)
      .set({
        lastRunAt: new Date(),
        runCount: automation.runCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(platformAutomationsTable.id, automation.id))
      .catch(() => {});
  }
}

const SCHEDULE_FREQUENCY_MINUTES: Record<string, number> = {
  hourly: 60,
  daily: 24 * 60,
  weekly: 7 * 24 * 60,
  monthly: 30 * 24 * 60,
};

function shouldRunSchedule(triggerConfig: Record<string, any>): boolean {
  const { intervalMinutes, cronExpression, lastRunAt, scheduleFrequency, scheduleTime } = triggerConfig;

  if (intervalMinutes) {
    const intervalMs = Number(intervalMinutes) * 60 * 1000;
    const lastRun = lastRunAt ? new Date(lastRunAt).getTime() : 0;
    return Date.now() - lastRun >= intervalMs;
  }

  if (scheduleFrequency) {
    const freqMinutes = SCHEDULE_FREQUENCY_MINUTES[scheduleFrequency as string] ?? 24 * 60;
    const intervalMs = freqMinutes * 60 * 1000;
    const lastRun = lastRunAt ? new Date(lastRunAt).getTime() : 0;
    if (Date.now() - lastRun < intervalMs) return false;
    if (scheduleTime && scheduleFrequency !== "hourly") {
      const [targetH, targetM] = (scheduleTime as string).split(":").map(Number);
      const now = new Date();
      const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();
      const targetTotalMinutes = (Number.isNaN(targetH) ? 8 : targetH) * 60 + (Number.isNaN(targetM) ? 0 : targetM);
      const WINDOW_MINUTES = 4;
      return Math.abs(nowTotalMinutes - targetTotalMinutes) <= WINDOW_MINUTES;
    }
    return true;
  }

  if (cronExpression) {
    return parseCronShouldRun(cronExpression);
  }

  return false;
}

function parseCronShouldRun(cronExpr: string): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const now = new Date();
  const [minuteExpr, hourExpr, dayExpr, monthExpr, dowExpr] = parts;

  const matchField = (expr: string, value: number): boolean => {
    if (expr === "*") return true;
    if (expr.includes(",")) return expr.split(",").some(e => matchField(e.trim(), value));
    if (expr.includes("/")) {
      const [, stepStr] = expr.split("/");
      const step = Number(stepStr);
      return step > 0 && value % step === 0;
    }
    if (expr.includes("-")) {
      const [min, max] = expr.split("-").map(Number);
      return value >= min && value <= max;
    }
    return Number(expr) === value;
  };

  return (
    matchField(minuteExpr, now.getMinutes()) &&
    matchField(hourExpr, now.getHours()) &&
    matchField(dayExpr, now.getDate()) &&
    matchField(monthExpr, now.getMonth() + 1) &&
    matchField(dowExpr, now.getDay())
  );
}

let schedulerRunning = false;

async function processScheduledWorkflows(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const scheduledWorkflows = await withRetry(
      () => bgDb.select().from(platformWorkflowsTable)
        .where(and(
          eq(platformWorkflowsTable.isActive, true),
          eq(platformWorkflowsTable.triggerType, "scheduled"),
        )),
      { label: "processScheduledWorkflows:fetch", maxAttempts: 2, baseDelayMs: 500 }
    );

    for (const workflow of scheduledWorkflows) {
      const triggerConfig = workflow.triggerConfig as Record<string, any>;
      if (!shouldRunSchedule(triggerConfig)) continue;

      const actions = workflow.actions as ActionConfig[];
      if (!actions || actions.length === 0) continue;

      const targetEntityId = triggerConfig.entityId;
      let records: any[] = [];

      if (targetEntityId) {
        const queryConditions = triggerConfig.recordFilter || [];
        let query = bgDb.select().from(entityRecordsTable)
          .where(eq(entityRecordsTable.entityId, Number(targetEntityId)));

        records = await query;

        if (queryConditions.length > 0) {
          records = records.filter((record: any) => {
            const recordData = (record.data as Record<string, any>) || {};
            return evaluateConditions(queryConditions, recordData, { status: record.status });
          });
        }
      } else {
        records = [{ id: 0, entityId: 0, data: {}, status: null }];
      }

      for (const record of records) {
        const startedAt = new Date();

        const [logEntry] = await bgDb.insert(automationExecutionLogsTable).values({
          workflowId: workflow.id,
          executionType: "scheduled",
          entityId: record.entityId || null,
          triggerEvent: "scheduled",
          triggerRecordId: record.id || null,
          status: "running",
          stepsExecuted: [],
          result: { workflowName: workflow.name, scheduledRun: true },
          startedAt,
        }).returning();

        const baseContext: ActionContext = {
          entityId: record.entityId || 0,
          recordId: record.id || 0,
          data: (record.data as Record<string, any>) || {},
          status: record.status,
          workflowId: workflow.id,
          executionLogId: logEntry.id,
        };

        const { stepsExecuted, overallStatus, errorMessage } = await executeWorkflowActions(actions, baseContext, workflow.id);

        await bgDb.update(automationExecutionLogsTable)
          .set({
            status: overallStatus,
            stepsExecuted,
            errorMessage,
            completedAt: overallStatus !== "paused" ? new Date() : null,
          })
          .where(eq(automationExecutionLogsTable.id, logEntry.id));
      }

      await bgDb.update(platformWorkflowsTable)
        .set({
          triggerConfig: { ...triggerConfig, lastRunAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(platformWorkflowsTable.id, workflow.id));
    }
  } catch (err) {
    console.error("[WorkflowEngine] Error processing scheduled workflows:", err);
  } finally {
    schedulerRunning = false;
  }
}

async function processScheduledAutomations(): Promise<void> {
  try {
    const scheduledAutomations = await withRetry(
      () => bgDb.select().from(platformAutomationsTable)
        .where(and(
          eq(platformAutomationsTable.isActive, true),
          eq(platformAutomationsTable.triggerType, "on_schedule"),
        )),
      { label: "processScheduledAutomations:fetch", maxAttempts: 2, baseDelayMs: 500 }
    );

    for (const automation of scheduledAutomations) {
      try {
        const triggerConfig = automation.triggerConfig as Record<string, any> | null ?? {};
        if (!shouldRunSchedule(triggerConfig)) continue;

        const actions = automation.actions as ActionConfig[];
        if (!actions || actions.length === 0) continue;

        const startedAt = new Date();
        const [logEntry] = await bgDb.insert(automationExecutionLogsTable).values({
          automationId: automation.id,
          executionType: "scheduled",
          entityId: automation.triggerEntityId || null,
          triggerEvent: "on_schedule",
          triggerRecordId: null,
          status: "running",
          stepsExecuted: [],
          result: { automationName: automation.name, scheduledRun: true },
          startedAt,
        }).returning();

        const baseContext: ActionContext = {
          entityId: automation.triggerEntityId || 0,
          recordId: 0,
          data: {},
          status: null,
          executionLogId: logEntry.id,
        };

        const { stepsExecuted, overallStatus, errorMessage } = await executeWorkflowActions(actions, baseContext);

        await bgDb.update(automationExecutionLogsTable)
          .set({
            status: overallStatus,
            stepsExecuted,
            errorMessage,
            completedAt: overallStatus !== "paused" ? new Date() : null,
          })
          .where(eq(automationExecutionLogsTable.id, logEntry.id));

        const nowIso = new Date().toISOString();
        await bgDb.update(platformAutomationsTable)
          .set({
            lastRunAt: nowIso as any,
            runCount: sql`${platformAutomationsTable.runCount} + 1`,
            triggerConfig: { ...triggerConfig, lastRunAt: nowIso },
            updatedAt: new Date(),
          })
          .where(eq(platformAutomationsTable.id, automation.id));
      } catch (automationErr) {
        console.error(`[WorkflowEngine] Failed scheduled automation #${automation.id} (${automation.name}):`, automationErr);
      }
    }
  } catch (err) {
    console.error("[WorkflowEngine] Error processing scheduled automations:", err);
  }
}

async function processMeetingReminders(): Promise<void> {
  try {
    const [meetingEntity] = await withRetry(
      () => bgDb.select({ id: moduleEntitiesTable.id })
        .from(moduleEntitiesTable)
        .where(eq(moduleEntitiesTable.slug, "meeting")),
      { label: "processMeetingReminders:fetchEntity", maxAttempts: 2, baseDelayMs: 500 }
    );

    if (!meetingEntity) return;

    const now = new Date();
    const upcoming = await bgDb.select({
      id: entityRecordsTable.id,
      entityId: entityRecordsTable.entityId,
      data: entityRecordsTable.data,
      status: entityRecordsTable.status,
    }).from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, meetingEntity.id),
        sql`${entityRecordsTable.status} IN ('planned', 'confirmed')`,
      ));

    for (const record of upcoming) {
      const data = record.data as Record<string, any>;
      if (!data.start_datetime) continue;

      const startTime = new Date(data.start_datetime).getTime();
      const reminderSent = data.reminder_sent || "no";
      const diffMs = startTime - now.getTime();

      const is24hWindow = diffMs > 23.5 * 60 * 60 * 1000 && diffMs <= 24.5 * 60 * 60 * 1000;
      const is1hWindow = diffMs > 0.5 * 60 * 60 * 1000 && diffMs <= 1.5 * 60 * 60 * 1000;

      if (is24hWindow && reminderSent === "no") {
        await createMeetingReminderNotification(meetingEntity.id, record, data, "24h");
      } else if (is1hWindow && (reminderSent === "no" || reminderSent === "24h")) {
        await createMeetingReminderNotification(meetingEntity.id, record, data, reminderSent === "24h" ? "both" : "1h");
      }
    }
  } catch (err) {
    console.error("[WorkflowEngine] Meeting reminders processing error:", err);
  }
}

async function createMeetingReminderNotification(entityId: number, record: any, data: Record<string, any>, stage: string) {
  const { notificationsTable } = await import("@workspace/db/schema");
  const startDate = data.start_datetime
    ? new Date(data.start_datetime).toLocaleString("he-IL", { dateStyle: "full", timeStyle: "short" })
    : "";
  const label = stage === "1h" || stage === "both" ? "שעה" : "24 שעות";

  await bgDb.update(entityRecordsTable)
    .set({
      data: { ...data, reminder_sent: stage },
      updatedAt: new Date(),
    })
    .where(eq(entityRecordsTable.id, record.id));

  await bgDb.insert(notificationsTable).values({
    type: "meeting_reminder",
    title: `⏰ תזכורת פגישה (${label} לפני)`,
    message: `פגישה "${data.title}" מתחילה ב-${startDate}`,
    recordId: record.id,
  });

  if (data.participant_email) {
    try {
      await executeAction(
        {
          type: "send_email",
          config: {
            to: data.participant_email,
            subject: `⏰ תזכורת: ${data.title} - ${startDate}`,
            body: `<div dir="rtl"><h2>תזכורת פגישה</h2><p>פגישה <strong>${data.title}</strong> מתחילה בעוד ${label}.</p><p>🕐 ${startDate}</p>${data.location ? `<p>📍 ${data.location}</p>` : ""}${data.video_link ? `<p>🔗 <a href="${data.video_link}">${data.video_link}</a></p>` : ""}</div>`,
          },
        },
        { entityId, recordId: record.id, data },
      );
    } catch (emailErr) {
      console.error(`[WorkflowEngine] Failed to send reminder email for meeting #${record.id}:`, emailErr);
    }
  }

  if (data.participant_phone) {
    try {
      const { sendMeetingWhatsAppReminder } = await import("../routes/platform/meetings-utils");
      await sendMeetingWhatsAppReminder(data.participant_phone, data, label, startDate);
    } catch (waErr) {
      console.error(`[WorkflowEngine] Failed to send reminder WhatsApp for meeting #${record.id}:`, waErr);
    }
  }

  console.log(`[WorkflowEngine] Meeting reminder sent for meeting #${record.id} (${stage})`);
}

async function processWorkflowInstances(event: RecordEvent): Promise<void> {
  const triggerType = eventToTriggerType[event.type];
  if (!triggerType) return;

  try {
    const entity = event.entityId
      ? await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, event.entityId)).then(r => r[0])
      : null;

    if (!entity) return;

    const autoStartTriggers = ["on_create", "on_update", "on_status_change"];
    if (autoStartTriggers.includes(triggerType)) {
      const workflows = await db.select().from(platformWorkflowsTable)
        .where(and(
          eq(platformWorkflowsTable.moduleId, entity.moduleId),
          eq(platformWorkflowsTable.isActive, true),
          eq(platformWorkflowsTable.triggerType, triggerType),
        ));

      for (const workflow of workflows) {
        const triggerConfig = (workflow.triggerConfig as Record<string, any>) || {};
        if (triggerConfig.entityId && triggerConfig.entityId !== event.entityId) continue;

        const steps = await db.select().from(workflowStepsTable)
          .where(eq(workflowStepsTable.workflowId, workflow.id))
          .orderBy(asc(workflowStepsTable.sortOrder));

        if (steps.length === 0) continue;

        if (triggerType !== "on_create") {
          const existing = await db.select({ id: workflowInstancesTable.id })
            .from(workflowInstancesTable)
            .where(and(
              eq(workflowInstancesTable.workflowId, workflow.id),
              eq(workflowInstancesTable.recordId, event.recordId),
              eq(workflowInstancesTable.status, "active"),
            ))
            .limit(1);
          if (existing.length > 0) continue;
        }

        const startStep = steps.find(s => s.isStart) || steps[0];

        const [instance] = await db.insert(workflowInstancesTable).values({
          workflowId: workflow.id,
          entityId: event.entityId,
          recordId: event.recordId,
          currentStepId: startStep.id,
          status: "active",
          startedBy: "system",
          context: { triggerEvent: event.type, data: event.data },
        }).returning();

        await db.insert(workflowStepLogsTable).values({
          instanceId: instance.id,
          stepId: startStep.id,
          action: "entered",
          performedBy: "system",
          status: "active",
          data: { trigger: event.type, recordId: event.recordId },
        });

        console.log(`[WorkflowEngine] Auto-started instance #${instance.id} for workflow "${workflow.name}" on record #${event.recordId}`);
      }
    }

    if (triggerType === "on_status_change" && event.status) {
      const activeInstances = await db.select({
        instance: workflowInstancesTable,
        workflow: platformWorkflowsTable,
      }).from(workflowInstancesTable)
        .innerJoin(platformWorkflowsTable, eq(workflowInstancesTable.workflowId, platformWorkflowsTable.id))
        .where(and(
          eq(workflowInstancesTable.recordId, event.recordId),
          eq(workflowInstancesTable.status, "active"),
        ));

      for (const { instance, workflow } of activeInstances) {
        if (!instance.currentStepId) continue;

        const currentStep = await db.select().from(workflowStepsTable)
          .where(eq(workflowStepsTable.id, instance.currentStepId))
          .then(r => r[0]);

        if (!currentStep) continue;

        const transitions = await db.select().from(workflowTransitionsTable)
          .where(eq(workflowTransitionsTable.fromStepId, instance.currentStepId))
          .orderBy(asc(workflowTransitionsTable.sortOrder));

        for (const transition of transitions) {
          const conditions = (transition.conditions as any[]) || [];
          if (conditions.length > 0) {
            const match = evaluateConditions(conditions, event.data || {}, { status: event.status, oldStatus: event.oldStatus });
            if (!match) continue;
          }

          const [toStep] = await db.select().from(workflowStepsTable)
            .where(eq(workflowStepsTable.id, transition.toStepId));

          if (!toStep) continue;

          await db.insert(workflowStepLogsTable).values({
            instanceId: instance.id,
            stepId: instance.currentStepId,
            action: "completed",
            performedBy: "system",
            status: "completed",
            data: { trigger: "status_change", status: event.status },
          });

          const newStatus = toStep.isEnd ? "completed" : "active";

          await db.update(workflowInstancesTable)
            .set({
              currentStepId: toStep.id,
              status: newStatus,
              completedAt: newStatus === "completed" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(workflowInstancesTable.id, instance.id));

          await db.insert(workflowStepLogsTable).values({
            instanceId: instance.id,
            stepId: toStep.id,
            action: newStatus === "completed" ? "completed" : "entered",
            performedBy: "system",
            status: newStatus,
            data: { auto: true, trigger: "status_change" },
          });

          console.log(`[WorkflowEngine] Auto-advanced instance #${instance.id} to step "${toStep.name}" on status change`);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[WorkflowEngine] Error processing workflow instances:", err);
  }
}

let scheduledInterval: ReturnType<typeof setInterval> | null = null;

let initialized = false;

export function initializeWorkflowEngine(): void {
  if (initialized) {
    console.warn("[WorkflowEngine] Already initialized, skipping duplicate registration");
    return;
  }
  initialized = true;

  initBusinessRulesEngine();

  const eventTypes: RecordEventType[] = [
    "record.created",
    "record.updated",
    "record.deleted",
    "record.status_changed",
  ];

  for (const eventType of eventTypes) {
    eventBus.on(eventType, async (event: RecordEvent) => {
      try {
        await Promise.all([
          processWorkflows(event),
          processAutomations(event),
          processWorkflowInstances(event),
        ]);
      } catch (err) {
        console.error(`[WorkflowEngine] Error processing ${eventType}:`, err);
      }
    });
  }

  let scheduledRunning = false;
  scheduledInterval = setInterval(async () => {
    if (scheduledRunning) return;
    scheduledRunning = true;
    try {
      await processScheduledWorkflows();
    } catch (err: any) {
      if (!err?.message?.includes('Connection terminated')) {
        console.error("[WorkflowEngine] Scheduled check error:", err?.message || err);
      }
    }
    try {
      await processScheduledAutomations();
    } catch (err: any) {
      if (!err?.message?.includes('Connection terminated')) {
        console.error("[WorkflowEngine] Scheduled automations error:", err?.message || err);
      }
    }
    try {
      await processMeetingReminders();
    } catch (err: any) {
      if (!err?.message?.includes('Connection terminated')) {
        console.error("[WorkflowEngine] Meeting reminders error:", err?.message || err);
      }
    }
    scheduledRunning = false;
  }, 120_000);

  setTimeout(() => {
    processScheduledWorkflows().catch(() => {});
    processScheduledAutomations().catch(() => {});
    processMeetingReminders().catch(() => {});
  }, 15_000);

  eventBus.on("record.created", async (event: RecordEvent) => {
    if (event.entityId === 26) {
      try {
        await processContractorDecisionOnQuote(event);
      } catch (err) {
        console.error("[WorkflowEngine] Error processing contractor decision on quote:", err);
      }
    }
  });

  eventBus.on("record.status_changed", async (event: RecordEvent) => {
    if (event.entityId === 28 && (event.status === "approved" || event.status === "completed" || event.status === "paid")) {
      try {
        await processContractorDecisionOnDealClose(event);
      } catch (err) {
        console.error("[WorkflowEngine] Error processing contractor decision on deal close:", err);
      }
    }
  });

  initializeCrossModuleSync();

  console.log("[WorkflowEngine] Initialized - listening for record lifecycle events + scheduled triggers + contractor decision model + cross-module sync");
}

export function stopScheduledWorkflows(): void {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
    scheduledInterval = null;
  }
}

export async function resumeWorkflowAfterApproval(
  approvalRequestId: number,
  approved: boolean,
  approvedBy?: string,
  comments?: string
): Promise<void> {
  const [request] = await db.update(approvalRequestsTable)
    .set({
      status: approved ? "approved" : "rejected",
      approvedBy: approvedBy || null,
      comments: comments || null,
      resolvedAt: new Date(),
    })
    .where(and(
      eq(approvalRequestsTable.id, approvalRequestId),
      eq(approvalRequestsTable.status, "pending"),
    ))
    .returning();

  if (!request) {
    throw new Error("Approval request not found or already resolved");
  }

  const postActions = approved
    ? (request.pendingActions as ActionConfig[])
    : (request.rejectActions as ActionConfig[]);

  const ctx = request.context as Record<string, any>;

  if (postActions && postActions.length > 0) {
    const baseContext: ActionContext = {
      entityId: ctx.entityId || request.entityId || 0,
      recordId: ctx.recordId || request.recordId || 0,
      data: ctx.data || {},
      status: ctx.status,
      workflowId: request.workflowId || undefined,
      executionLogId: request.executionLogId || undefined,
    };

    const { stepsExecuted, overallStatus, errorMessage } = await executeWorkflowActions(postActions, baseContext, request.workflowId || undefined);

    if (request.executionLogId) {
      const [existingLog] = await db.select().from(automationExecutionLogsTable)
        .where(eq(automationExecutionLogsTable.id, request.executionLogId));

      if (existingLog) {
        const previousSteps = (existingLog.stepsExecuted as StepLog[]) || [];
        await db.update(automationExecutionLogsTable)
          .set({
            status: overallStatus,
            stepsExecuted: [
              ...previousSteps,
              {
                action: "approval",
                success: true,
                stepIndex: request.stepIndex,
                details: {
                  decision: approved ? "approved" : "rejected",
                  approvedBy,
                  comments,
                  approvalRequestId,
                },
                startedAt: request.createdAt?.toISOString(),
                completedAt: new Date().toISOString(),
              },
              ...stepsExecuted,
            ],
            errorMessage,
            completedAt: overallStatus !== "paused" ? new Date() : null,
          })
          .where(eq(automationExecutionLogsTable.id, request.executionLogId));
      }
    }
  } else {
    if (request.executionLogId) {
      const [existingLog] = await db.select().from(automationExecutionLogsTable)
        .where(eq(automationExecutionLogsTable.id, request.executionLogId));

      if (existingLog) {
        const previousSteps = (existingLog.stepsExecuted as StepLog[]) || [];
        await db.update(automationExecutionLogsTable)
          .set({
            status: approved ? "completed" : "rejected",
            stepsExecuted: [
              ...previousSteps,
              {
                action: "approval",
                success: true,
                stepIndex: request.stepIndex,
                details: {
                  decision: approved ? "approved" : "rejected",
                  approvedBy,
                  comments,
                  approvalRequestId,
                },
                startedAt: request.createdAt?.toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            completedAt: new Date(),
          })
          .where(eq(automationExecutionLogsTable.id, request.executionLogId));
      }
    }
  }
}

async function persistDecisionToRecord(recordId: number, comparisonResult: ReturnType<typeof computePaymentComparison>, chosenMethod?: string): Promise<void> {
  const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, recordId));
  if (!existing) return;

  const currentData = (existing.data as Record<string, any>) || {};
  const recommendationHe = comparisonResult.recommendation === "percent" ? "אחוזים" : comparisonResult.recommendation === "sqm" ? "מ״ר" : "שווה";
  const updatedData = {
    ...currentData,
    contractor_decision_amount_ex_vat: comparisonResult.amountExVat,
    contractor_decision_cost_by_percent: comparisonResult.costByPercent,
    contractor_decision_cost_by_sqm: comparisonResult.costBySqm,
    contractor_decision_savings: comparisonResult.savings,
    contractor_decision_recommendation: comparisonResult.recommendation,
    contractor_decision_recommendation_he: recommendationHe,
    contractor_decision_calculated_at: new Date().toISOString(),
    ...(chosenMethod ? { contractor_decision_chosen_method: chosenMethod } : {}),
  };

  await db.update(entityRecordsTable)
    .set({ data: updatedData, updatedAt: new Date() })
    .where(eq(entityRecordsTable.id, recordId));
}

async function processContractorDecisionOnQuote(event: RecordEvent): Promise<void> {
  const input = extractComparisonInputFromData(event.data);
  if (!input) return;

  const result = computePaymentComparison(input);
  const recommendationHe = result.recommendation === "percent" ? "אחוזים" : result.recommendation === "sqm" ? "מ״ר" : "שווה";
  const customerName = event.data.customer_name || event.data.name || "";
  const fmtILS = (n: number) => `₪${n.toLocaleString("he-IL")}`;

  await persistDecisionToRecord(event.recordId, result);

  await db.insert(notificationsTable).values({
    type: "contractor_decision",
    title: `המלצת תשלום קבלן — הצעת מחיר #${event.recordId}`,
    message: `${customerName ? customerName + " | " : ""}סכום ללא מע״מ: ${fmtILS(result.amountExVat)} | לפי אחוז: ${fmtILS(result.costByPercent)} | לפי מ״ר: ${fmtILS(result.costBySqm)} | המלצה: ${recommendationHe} (חיסכון: ${fmtILS(result.savings)})`,
    recordId: event.recordId,
  });
}

async function processContractorDecisionOnDealClose(event: RecordEvent): Promise<void> {
  const input = extractComparisonInputFromData(event.data);
  if (!input) return;

  const result = computePaymentComparison(input);
  const recommendationHe = result.recommendation === "percent" ? "אחוזים" : result.recommendation === "sqm" ? "מ״ר" : "שווה";
  const customerName = event.data.customer_name || event.data.name || "";
  const projectName = event.data.project_name || event.data.description || "";
  const chosenMethod = event.data.payment_method_chosen || event.data.contractor_payment_method || recommendationHe;
  const fmtILS = (n: number) => `₪${n.toLocaleString("he-IL")}`;

  await persistDecisionToRecord(event.recordId, result, chosenMethod);

  await db.insert(notificationsTable).values({
    type: "contractor_decision_deal",
    title: `סיכום תשלום קבלן — עסקה #${event.recordId} נסגרה`,
    message: `${customerName ? customerName + " | " : ""}${projectName ? projectName + " | " : ""}שיטת תשלום: ${chosenMethod} | חיסכון: ${fmtILS(result.savings)} | לפי אחוז: ${fmtILS(result.costByPercent)} | לפי מ״ר: ${fmtILS(result.costBySqm)}`,
    recordId: event.recordId,
  });
}

export { evaluateConditions };
