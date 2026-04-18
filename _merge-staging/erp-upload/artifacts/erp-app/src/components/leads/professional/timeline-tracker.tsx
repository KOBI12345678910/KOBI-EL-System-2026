import { entityCreate } from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRecord {
  id?: string;
  sales_status?: string;
  lifecycle_stage?: string;
  owner_user_id?: string;
  sla_status?: string;
  sla_deadline?: string;
  priority?: string;
  urgency?: string;
  estimated_value?: number;
  probability_to_close?: number;
  created_date?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Track field change                                                 */
/* ------------------------------------------------------------------ */

export async function trackFieldChange(
  leadId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "field_changed",
    field_name: fieldName,
    old_value: String(oldValue),
    new_value: String(newValue),
    description: `\u05E9\u05D3\u05D4 ${fieldName} \u05E9\u05D5\u05E0\u05D4`,
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track status change                                                */
/* ------------------------------------------------------------------ */

export async function trackStatusChange(
  leadId: string,
  oldStatus: string,
  newStatus: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "status_changed",
    field_name: "sales_status",
    old_value: oldStatus,
    new_value: newStatus,
    description: `\u05E1\u05D8\u05D8\u05D5\u05E1 \u05E9\u05D5\u05E0\u05D4 \u05DE-${oldStatus} \u05DC-${newStatus}`,
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track stage change                                                 */
/* ------------------------------------------------------------------ */

export async function trackStageChange(
  leadId: string,
  oldStage: string,
  newStage: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "stage_changed",
    field_name: "lifecycle_stage",
    old_value: oldStage,
    new_value: newStage,
    description: `\u05E9\u05DC\u05D1 \u05E9\u05D5\u05E0\u05D4 \u05DE-${oldStage} \u05DC-${newStage}`,
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track owner change                                                 */
/* ------------------------------------------------------------------ */

export async function trackOwnerChange(
  leadId: string,
  oldOwner: string | undefined,
  newOwner: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "owner_changed",
    field_name: "owner_user_id",
    old_value: oldOwner || "\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05D9\u05DA",
    new_value: newOwner,
    description: `\u05D0\u05D7\u05E8\u05D0\u05D9 \u05E9\u05D5\u05E0\u05D4 \u05DC-${newOwner}`,
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track automation execution                                         */
/* ------------------------------------------------------------------ */

export async function trackAutomationExecution(
  leadId: string,
  ruleName: string,
  actions: unknown[],
  actor = "System"
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "automation_executed",
    description: `\u05D1\u05D5\u05E6\u05E2 \u05DB\u05DC\u05DC \u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D4: ${ruleName}`,
    metadata: { rule_name: ruleName, actions_performed: actions },
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track SLA breach                                                   */
/* ------------------------------------------------------------------ */

export async function trackSLABreach(leadId: string, slaType: string, deadline: string) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "sla_breach",
    description: `\u05D7\u05E8\u05D9\u05D2\u05EA SLA: ${slaType}`,
    metadata: { sla_type: slaType, deadline, breach_time: new Date().toISOString() },
    performed_by: "System",
  });
}

/* ------------------------------------------------------------------ */
/*  Track AI action                                                    */
/* ------------------------------------------------------------------ */

export async function trackAIAction(leadId: string, actionType: string, details: unknown) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "ai_action",
    description: `\u05E4\u05E2\u05D5\u05DC\u05EA AI: ${actionType}`,
    metadata: { action_type: actionType, details },
    performed_by: "AI",
  });
}

/* ------------------------------------------------------------------ */
/*  Track note creation                                                */
/* ------------------------------------------------------------------ */

export async function trackNoteAdded(
  leadId: string,
  noteText: string,
  category: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "note_added",
    description: `\u05E0\u05D5\u05E1\u05E4\u05D4 \u05D4\u05E2\u05E8\u05D4: ${noteText.substring(0, 50)}...`,
    metadata: { category, note_preview: noteText.substring(0, 100) },
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track document upload                                              */
/* ------------------------------------------------------------------ */

export async function trackDocumentUpload(
  leadId: string,
  fileName: string,
  tag: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "document_uploaded",
    description: `\u05D4\u05D5\u05E2\u05DC\u05D4 \u05DE\u05E1\u05DE\u05DA: ${fileName}`,
    metadata: { file_name: fileName, tag },
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Track task creation                                                */
/* ------------------------------------------------------------------ */

export async function trackTaskCreated(
  leadId: string,
  taskTitle: string,
  dueDate: string,
  actor: string
) {
  await entityCreate<Record<string, unknown>>("lead-events", {
    lead_id: leadId,
    event_type: "task_created",
    description: `\u05E0\u05D5\u05E6\u05E8\u05D4 \u05DE\u05E9\u05D9\u05DE\u05D4: ${taskTitle}`,
    metadata: { task_title: taskTitle, due_date: dueDate },
    performed_by: actor,
  });
}

/* ------------------------------------------------------------------ */
/*  Auto-track lead update                                             */
/* ------------------------------------------------------------------ */

export async function autoTrackLeadUpdate(
  leadId: string,
  oldLead: LeadRecord,
  newLead: LeadRecord,
  actor: string
): Promise<string[]> {
  const changes: string[] = [];

  if (oldLead.sales_status !== newLead.sales_status) {
    await trackStatusChange(leadId, oldLead.sales_status!, newLead.sales_status!, actor);
    changes.push("sales_status");
  }

  if (oldLead.lifecycle_stage !== newLead.lifecycle_stage) {
    await trackStageChange(leadId, oldLead.lifecycle_stage!, newLead.lifecycle_stage!, actor);
    changes.push("lifecycle_stage");
  }

  if (oldLead.owner_user_id !== newLead.owner_user_id) {
    await trackOwnerChange(leadId, oldLead.owner_user_id, newLead.owner_user_id!, actor);
    changes.push("owner_user_id");
  }

  if (oldLead.sla_status !== "breached" && newLead.sla_status === "breached") {
    await trackSLABreach(leadId, "response_time", newLead.sla_deadline || "");
    changes.push("sla_breach");
  }

  const fieldsToTrack: (keyof LeadRecord)[] = [
    "priority",
    "urgency",
    "estimated_value",
    "probability_to_close",
  ];
  for (const field of fieldsToTrack) {
    if (oldLead[field] !== newLead[field]) {
      await trackFieldChange(leadId, field as string, oldLead[field], newLead[field], actor);
      changes.push(field as string);
    }
  }

  return changes;
}
