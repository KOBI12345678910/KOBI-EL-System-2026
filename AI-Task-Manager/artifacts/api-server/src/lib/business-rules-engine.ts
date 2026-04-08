import { db } from "@workspace/db";
import { businessRulesTable, businessRuleAuditLogTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { eventBus, type RecordEvent, type RecordEventType } from "./event-bus";

const MAX_CONDITION_DEPTH = 20;

function evaluateConditionGroup(group: any, data: Record<string, any>, context: Record<string, any> = {}, _depth = 0): boolean {
  if (!group) return true;
  if (_depth > MAX_CONDITION_DEPTH) {
    console.warn("[BusinessRulesEngine] Max condition group depth exceeded — treating as pass");
    return true;
  }

  if (Array.isArray(group)) {
    return group.every(c => evaluateSingleCondition(c, data, context));
  }

  const { logic = "AND", rules = [], groups = [] } = group;

  const allConditions = [
    ...rules.map((r: any) => evaluateSingleCondition(r, data, context)),
    ...groups.map((g: any) => evaluateConditionGroup(g, data, context, _depth + 1)),
  ];

  if (allConditions.length === 0) return true;

  if (logic === "OR") {
    return allConditions.some(Boolean);
  }
  return allConditions.every(Boolean);
}

function evaluateSingleCondition(condition: any, data: Record<string, any>, context: Record<string, any>): boolean {
  const { field, operator, value } = condition;
  if (!field || !operator) return true;

  let fieldValue: any;
  if (field === "status") fieldValue = context.status;
  else if (field === "oldStatus") fieldValue = context.oldStatus;
  else fieldValue = data[field];

  switch (operator) {
    case "equals": case "eq": return String(fieldValue) === String(value);
    case "not_equals": case "neq": return String(fieldValue) !== String(value);
    case "contains": return typeof fieldValue === "string" && fieldValue.includes(String(value));
    case "not_contains": return typeof fieldValue === "string" && !fieldValue.includes(String(value));
    case "gt": case "greater_than": return Number(fieldValue) > Number(value);
    case "lt": case "less_than": return Number(fieldValue) < Number(value);
    case "gte": return Number(fieldValue) >= Number(value);
    case "lte": return Number(fieldValue) <= Number(value);
    case "is_empty": return fieldValue === undefined || fieldValue === null || fieldValue === "";
    case "is_not_empty": return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    case "is_true": return fieldValue === true || fieldValue === "true";
    case "is_false": return fieldValue === false || fieldValue === "false" || !fieldValue;
    case "in": return Array.isArray(value) && value.includes(fieldValue);
    case "not_in": return Array.isArray(value) && !value.includes(fieldValue);
    case "regex": try { return new RegExp(String(value)).test(String(fieldValue)); } catch { return false; }
    default: return true;
  }
}

export interface RuleEvaluationResult {
  ruleId: number;
  ruleName: string;
  passed: boolean;
  action: string;
  message?: string;
}

export interface BusinessRulesEvaluationResult {
  blocked: boolean;
  warnings: string[];
  requiresApproval: boolean;
  results: RuleEvaluationResult[];
}

const eventToTrigger: Record<string, string> = {
  "record.created": "on_create",
  "record.updated": "on_update",
  "record.deleted": "on_delete",
  "record.status_changed": "on_status_change",
};

export async function evaluateBusinessRules(
  entityId: number,
  event: string,
  data: Record<string, any>,
  context: { status?: string | null; oldStatus?: string | null; recordId?: number } = {}
): Promise<BusinessRulesEvaluationResult> {
  const triggerType = eventToTrigger[event] || event;

  const rules = await db.select().from(businessRulesTable)
    .where(and(
      eq(businessRulesTable.isActive, true),
    ))
    .orderBy(asc(businessRulesTable.priority));

  const applicableRules = rules.filter(rule => {
    if (rule.entityId && rule.entityId !== entityId) return false;
    const triggerEvents = rule.triggerEvents as string[];
    if (!triggerEvents.includes(triggerType)) return false;
    return true;
  });

  const result: BusinessRulesEvaluationResult = {
    blocked: false,
    warnings: [],
    requiresApproval: false,
    results: [],
  };

  for (const rule of applicableRules) {
    const conditions = rule.conditions as any;
    const ctx = { status: context.status, oldStatus: context.oldStatus };
    const conditionMet = evaluateConditionGroup(conditions, data, ctx);

    const evalResult: RuleEvaluationResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      passed: !conditionMet,
      action: rule.enforcementAction,
    };

    if (conditionMet) {
      const config = rule.enforcementConfig as Record<string, any>;
      const message = config.message || rule.description || rule.name;

      evalResult.passed = false;
      evalResult.message = message;

      if (rule.enforcementAction === "block") {
        result.blocked = true;
      } else if (rule.enforcementAction === "warn") {
        result.warnings.push(message);
      } else if (rule.enforcementAction === "require_approval") {
        result.requiresApproval = true;
      }
    }

    result.results.push(evalResult);

    await db.insert(businessRuleAuditLogTable).values({
      ruleId: rule.id,
      entityId,
      recordId: context.recordId ?? null,
      triggerEvent: triggerType,
      result: conditionMet ? "triggered" : "passed",
      details: {
        conditionMet,
        action: rule.enforcementAction,
        data: Object.keys(data),
      },
    }).catch(() => {});
  }

  return result;
}

async function onRecordEvent(event: RecordEvent) {
  try {
    await evaluateBusinessRules(
      event.entityId,
      event.type,
      event.data,
      {
        status: event.status,
        oldStatus: event.oldStatus,
        recordId: event.recordId,
      }
    );
  } catch (err) {
    console.error("[BusinessRulesEngine] Error evaluating rules:", err);
  }
}

let initialized = false;
export function initBusinessRulesEngine() {
  if (initialized) return;
  initialized = true;
  eventBus.on("record.*", onRecordEvent);
  console.log("[BusinessRulesEngine] Initialized");
}
