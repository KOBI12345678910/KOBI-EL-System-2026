import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  statusTransitionsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
  detailDefinitionsTable,
  entityCategoriesTable,
  systemButtonsTable,
  systemMenuItemsTable,
  systemPermissionsTable,
  claudeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

type RepairType =
  | "fix_broken_reference"
  | "disable_broken_config"
  | "regenerate_missing_form"
  | "regenerate_missing_view"
  | "regenerate_missing_detail"
  | "fix_relation_binding"
  | "repair_menu_binding"
  | "repair_ordering"
  | "repair_default_status"
  | "repair_missing_permissions"
  | "delete_orphan";

interface RepairDiagnosis {
  id: string;
  objectType: string;
  objectId: number;
  objectName: string;
  problem: string;
  severity: string;
}

interface RepairProposal {
  diagnosisId: string;
  repairType: RepairType;
  description: string;
  actions: RepairAction[];
  safe: boolean;
  reversible: boolean;
}

interface RepairAction {
  operation: "insert" | "update" | "delete";
  table: string;
  targetId: number | null;
  changes: Record<string, any>;
}

interface RepairResult {
  proposalId: string;
  status: "applied" | "failed";
  actionsExecuted: number;
  details: string[];
}

const repairStore = new Map<string, {
  diagnoses: RepairDiagnosis[];
  proposals: RepairProposal[];
  validatedProposalIds: Set<string>;
  results: RepairResult[];
  createdAt: number;
}>();

function generateId() {
  return `repair_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function logRepairAction(actionType: string, path: string, input: any, result: any, status: "success" | "error" = "success") {
  try {
    await db.insert(claudeAuditLogsTable).values({
      actionType: `repair_${actionType}`,
      caller: "claude-repair",
      targetApi: path,
      httpMethod: "POST",
      httpPath: path,
      inputSummary: JSON.stringify(input).substring(0, 500),
      outputSummary: JSON.stringify(result).substring(0, 500),
      status,
      statusCode: status === "success" ? 200 : 400,
      responseTimeMs: 0,
    });
  } catch (err) {
    console.error("Failed to log repair action:", err);
  }
}

const DiagnoseBody = z.object({
  scope: z.enum(["full", "modules", "entities", "fields", "relations", "forms", "views", "actions", "statuses", "details", "buttons", "menus", "permissions"]).optional().default("full"),
  entityId: z.number().optional(),
  moduleId: z.number().optional(),
});

router.post("/claude/repair/diagnose", async (req, res) => {
  try {
    const body = DiagnoseBody.parse(req.body);
    const sessionId = generateId();
    const diagnoses: RepairDiagnosis[] = [];

    const entities = await db.select().from(moduleEntitiesTable);
    const entityIds = entities.map(e => e.id);
    const moduleIds = (await db.select({ id: platformModulesTable.id }).from(platformModulesTable)).map(m => m.id);

    if (body.scope === "full" || body.scope === "entities") {
      for (const entity of entities) {
        if (body.entityId && entity.id !== body.entityId) continue;
        if (!moduleIds.includes(entity.moduleId)) {
          diagnoses.push({ id: generateId(), objectType: "entity", objectId: entity.id, objectName: entity.name, problem: `References non-existent module ID ${entity.moduleId}`, severity: "error" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "fields") {
      const fields = await db.select().from(entityFieldsTable);
      for (const field of fields) {
        if (body.entityId && field.entityId !== body.entityId) continue;
        if (!entityIds.includes(field.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "field", objectId: field.id, objectName: field.name, problem: `Orphaned field — entity ID ${field.entityId} does not exist`, severity: "error" });
        }
        if (field.relatedEntityId && !entityIds.includes(field.relatedEntityId)) {
          diagnoses.push({ id: generateId(), objectType: "field", objectId: field.id, objectName: field.name, problem: `Broken relation — related entity ID ${field.relatedEntityId} does not exist`, severity: "warning" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "relations") {
      const relations = await db.select().from(entityRelationsTable);
      for (const rel of relations) {
        if (!entityIds.includes(rel.sourceEntityId)) {
          diagnoses.push({ id: generateId(), objectType: "relation", objectId: rel.id, objectName: rel.label, problem: `Source entity ID ${rel.sourceEntityId} does not exist`, severity: "error" });
        }
        if (!entityIds.includes(rel.targetEntityId)) {
          diagnoses.push({ id: generateId(), objectType: "relation", objectId: rel.id, objectName: rel.label, problem: `Target entity ID ${rel.targetEntityId} does not exist`, severity: "error" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "forms") {
      const forms = await db.select().from(formDefinitionsTable);
      const formEntityIds = new Set(forms.map(f => f.entityId));
      for (const form of forms) {
        if (body.entityId && form.entityId !== body.entityId) continue;
        if (!entityIds.includes(form.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "form", objectId: form.id, objectName: form.name, problem: `Orphaned form — entity ID ${form.entityId} does not exist`, severity: "error" });
        }
      }
      for (const entity of entities) {
        if (body.entityId && entity.id !== body.entityId) continue;
        if (!formEntityIds.has(entity.id)) {
          diagnoses.push({ id: generateId(), objectType: "entity", objectId: entity.id, objectName: entity.name, problem: `Missing default form — entity has no form definition`, severity: "warning" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "views") {
      const views = await db.select().from(viewDefinitionsTable);
      const viewEntityIds = new Set(views.map(v => v.entityId));
      for (const view of views) {
        if (body.entityId && view.entityId !== body.entityId) continue;
        if (!entityIds.includes(view.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "view", objectId: view.id, objectName: view.name, problem: `Orphaned view — entity ID ${view.entityId} does not exist`, severity: "error" });
        }
      }
      for (const entity of entities) {
        if (body.entityId && entity.id !== body.entityId) continue;
        if (!viewEntityIds.has(entity.id)) {
          diagnoses.push({ id: generateId(), objectType: "entity", objectId: entity.id, objectName: entity.name, problem: `Missing default view — entity has no view definition`, severity: "warning" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "actions") {
      const actions = await db.select().from(actionDefinitionsTable);
      for (const action of actions) {
        if (body.entityId && action.entityId !== body.entityId) continue;
        if (!entityIds.includes(action.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "action", objectId: action.id, objectName: action.name, problem: `Orphaned action — entity ID ${action.entityId} does not exist`, severity: "error" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "statuses") {
      const statuses = await db.select().from(entityStatusesTable);
      const statusIds = statuses.map(s => s.id);
      for (const status of statuses) {
        if (body.entityId && status.entityId !== body.entityId) continue;
        if (!entityIds.includes(status.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "status", objectId: status.id, objectName: status.name, problem: `Orphaned status — entity ID ${status.entityId} does not exist`, severity: "error" });
        }
      }

      for (const entity of entities) {
        if (body.entityId && entity.id !== body.entityId) continue;
        if (entity.hasStatus) {
          const entStatuses = statuses.filter(s => s.entityId === entity.id);
          if (entStatuses.length > 0 && !entStatuses.some(s => s.isDefault)) {
            diagnoses.push({ id: generateId(), objectType: "entity", objectId: entity.id, objectName: entity.name, problem: "Has statuses but none marked as default", severity: "warning" });
          }
        }
      }

      const transitions = await db.select().from(statusTransitionsTable);
      for (const t of transitions) {
        if (t.fromStatusId && !statusIds.includes(t.fromStatusId)) {
          diagnoses.push({ id: generateId(), objectType: "transition", objectId: t.id, objectName: t.label, problem: `From-status ID ${t.fromStatusId} does not exist`, severity: "error" });
        }
        if (!statusIds.includes(t.toStatusId)) {
          diagnoses.push({ id: generateId(), objectType: "transition", objectId: t.id, objectName: t.label, problem: `To-status ID ${t.toStatusId} does not exist`, severity: "error" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "details") {
      const details = await db.select().from(detailDefinitionsTable);
      for (const detail of details) {
        if (body.entityId && detail.entityId !== body.entityId) continue;
        if (!entityIds.includes(detail.entityId)) {
          diagnoses.push({ id: generateId(), objectType: "detail", objectId: detail.id, objectName: detail.name, problem: `Orphaned detail page — entity ID ${detail.entityId} does not exist`, severity: "error" });
        }
      }
    }

    if (body.scope === "full" || body.scope === "buttons") {
      try {
        const buttons = await db.select().from(systemButtonsTable);
        for (const button of buttons) {
          if (body.entityId && button.entityId !== body.entityId) continue;
          if (!entityIds.includes(button.entityId)) {
            diagnoses.push({ id: generateId(), objectType: "button", objectId: button.id, objectName: button.name, problem: `Orphaned button — entity ID ${button.entityId} does not exist`, severity: "error" });
          }
        }
      } catch (_e) { /* table may not be synced */ }
    }

    if (body.scope === "full" || body.scope === "menus") {
      try {
        const menuItems = await db.select().from(systemMenuItemsTable);
        for (const item of menuItems) {
          if (item.moduleId && !moduleIds.includes(item.moduleId)) {
            diagnoses.push({ id: generateId(), objectType: "menu_item", objectId: item.id, objectName: item.label, problem: `References non-existent module ID ${item.moduleId}`, severity: "warning" });
          }
          if (item.entityId && !entityIds.includes(item.entityId)) {
            diagnoses.push({ id: generateId(), objectType: "menu_item", objectId: item.id, objectName: item.label, problem: `References non-existent entity ID ${item.entityId}`, severity: "warning" });
          }
        }
      } catch (_e) { /* table may not be synced */ }
    }

    if (body.scope === "full" || body.scope === "permissions") {
      try {
        const permissions = await db.select().from(systemPermissionsTable);
        for (const perm of permissions) {
          if (perm.entityId && !entityIds.includes(perm.entityId)) {
            diagnoses.push({ id: generateId(), objectType: "permission", objectId: perm.id, objectName: `${perm.role}:${perm.action}`, problem: `References non-existent entity ID ${perm.entityId}`, severity: "warning" });
          }
        }
      } catch (_e) { /* table may not be synced */ }
    }

    repairStore.set(sessionId, {
      diagnoses,
      proposals: [],
      validatedProposalIds: new Set(),
      results: [],
      createdAt: Date.now(),
    });

    const result = {
      sessionId,
      scope: body.scope,
      totalDiagnoses: diagnoses.length,
      diagnoses,
    };

    await logRepairAction("diagnose", "/claude/repair/diagnose", body, { sessionId, total: diagnoses.length });
    res.json(result);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Repair diagnose error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

const ProposeBody = z.object({
  sessionId: z.string().min(1),
  diagnosisIds: z.array(z.string()).optional(),
});

router.post("/claude/repair/propose", async (req, res) => {
  try {
    const body = ProposeBody.parse(req.body);
    const session = repairStore.get(body.sessionId);
    if (!session) return res.status(404).json({ message: "Repair session not found" });

    const targetDiagnoses = body.diagnosisIds
      ? session.diagnoses.filter(d => body.diagnosisIds!.includes(d.id))
      : session.diagnoses;

    if (targetDiagnoses.length === 0) {
      return res.status(400).json({ message: "No matching diagnoses found" });
    }

    const proposals: RepairProposal[] = [];

    for (const diagnosis of targetDiagnoses) {
      const proposalId = generateId();
      let repairType: RepairType;
      let description: string;
      let actions: RepairAction[] = [];
      let safe = true;
      let reversible = true;

      if (diagnosis.problem.includes("Orphaned") || diagnosis.problem.includes("does not exist")) {
        if (diagnosis.objectType === "entity" && diagnosis.problem.includes("module")) {
          repairType = "fix_broken_reference";
          description = `Deactivate entity '${diagnosis.objectName}' with broken module reference`;
          actions = [{ operation: "update", table: "module_entities", targetId: diagnosis.objectId, changes: { isActive: false } }];
        } else if (["field", "form", "view", "action", "status", "detail", "button", "transition"].includes(diagnosis.objectType)) {
          repairType = "delete_orphan";
          description = `Delete orphaned ${diagnosis.objectType} '${diagnosis.objectName}'`;
          const tableMap: Record<string, string> = {
            field: "entity_fields",
            form: "form_definitions",
            view: "view_definitions",
            action: "action_definitions",
            status: "entity_statuses",
            detail: "detail_definitions",
            button: "system_buttons",
            transition: "status_transitions",
          };
          actions = [{ operation: "delete", table: tableMap[diagnosis.objectType] || diagnosis.objectType, targetId: diagnosis.objectId, changes: {} }];
          reversible = false;
        } else if (diagnosis.objectType === "relation") {
          repairType = "delete_orphan";
          description = `Delete orphaned relation '${diagnosis.objectName}'`;
          actions = [{ operation: "delete", table: "entity_relations", targetId: diagnosis.objectId, changes: {} }];
          reversible = false;
        } else if (diagnosis.objectType === "menu_item") {
          repairType = "repair_menu_binding";
          description = `Disable menu item '${diagnosis.objectName}' with broken reference`;
          actions = [{ operation: "update", table: "system_menu_items", targetId: diagnosis.objectId, changes: { isActive: false } }];
        } else if (diagnosis.objectType === "permission") {
          repairType = "delete_orphan";
          description = `Delete permission '${diagnosis.objectName}' with broken entity reference`;
          actions = [{ operation: "delete", table: "system_permissions", targetId: diagnosis.objectId, changes: {} }];
          reversible = false;
        } else {
          repairType = "disable_broken_config";
          description = `Disable broken ${diagnosis.objectType} '${diagnosis.objectName}'`;
          actions = [];
          safe = false;
        }
      } else if (diagnosis.problem.includes("none marked as default")) {
        repairType = "repair_default_status";
        description = `Set first status of entity '${diagnosis.objectName}' as default`;
        actions = [{ operation: "update", table: "entity_statuses", targetId: null, changes: { isDefault: true, note: "Will update first status by sort_order for this entity" } }];
      } else if (diagnosis.problem.includes("Broken relation")) {
        repairType = "fix_relation_binding";
        description = `Clear broken relatedEntityId on field '${diagnosis.objectName}'`;
        actions = [{ operation: "update", table: "entity_fields", targetId: diagnosis.objectId, changes: { relatedEntityId: null, relatedDisplayField: null, relationType: null } }];
      } else if (diagnosis.problem.includes("Missing default form")) {
        repairType = "regenerate_missing_form";
        description = `Create default form for entity '${diagnosis.objectName}'`;
        actions = [{
          operation: "insert",
          table: "form_definitions",
          targetId: null,
          changes: {
            entityId: diagnosis.objectId,
            name: `טופס ברירת מחדל — ${diagnosis.objectName}`,
            slug: "default",
            formType: "create",
            isDefault: true,
            sections: [],
          },
        }];
      } else if (diagnosis.problem.includes("Missing default view")) {
        repairType = "regenerate_missing_view";
        description = `Create default view for entity '${diagnosis.objectName}'`;
        actions = [{
          operation: "insert",
          table: "view_definitions",
          targetId: null,
          changes: {
            entityId: diagnosis.objectId,
            name: `תצוגת ברירת מחדל — ${diagnosis.objectName}`,
            slug: "default",
            viewType: "table",
            isDefault: true,
            columns: [],
            filters: [],
            sorting: [],
          },
        }];
      } else {
        repairType = "disable_broken_config";
        description = `Disable broken ${diagnosis.objectType} '${diagnosis.objectName}'`;
        actions = [];
        safe = false;
      }

      proposals.push({ diagnosisId: diagnosis.id, repairType, description, actions, safe, reversible });
      session.proposals.push({ diagnosisId: diagnosis.id, repairType, description, actions, safe, reversible });
    }

    const result = {
      sessionId: body.sessionId,
      totalProposals: proposals.length,
      safeCount: proposals.filter(p => p.safe).length,
      unsafeCount: proposals.filter(p => !p.safe).length,
      proposals,
    };

    await logRepairAction("propose", "/claude/repair/propose", body, { sessionId: body.sessionId, total: proposals.length });
    res.json(result);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Repair propose error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

const ValidateBody = z.object({
  sessionId: z.string().min(1),
  diagnosisIds: z.array(z.string()).optional(),
});

router.post("/claude/repair/validate", async (req, res) => {
  try {
    const body = ValidateBody.parse(req.body);
    const session = repairStore.get(body.sessionId);
    if (!session) return res.status(404).json({ message: "Repair session not found" });

    const targetProposals = body.diagnosisIds
      ? session.proposals.filter(p => body.diagnosisIds!.includes(p.diagnosisId))
      : session.proposals;

    if (targetProposals.length === 0) {
      return res.status(400).json({ message: "No proposals to validate" });
    }

    const validationResults = targetProposals.map((proposal, idx) => {
      const valid = proposal.safe && proposal.actions.length > 0;
      if (valid) {
        session.validatedProposalIds.add(proposal.diagnosisId);
      }
      return {
        diagnosisId: proposal.diagnosisId,
        repairType: proposal.repairType,
        valid,
        reason: !proposal.safe
          ? "Proposal is marked as unsafe — manual intervention required"
          : proposal.actions.length === 0
          ? "No repair actions defined"
          : "Proposal validated successfully",
      };
    });

    const result = {
      sessionId: body.sessionId,
      totalValidated: validationResults.filter(v => v.valid).length,
      totalRejected: validationResults.filter(v => !v.valid).length,
      validations: validationResults,
    };

    await logRepairAction("validate", "/claude/repair/validate", body, result);
    res.json(result);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Repair validate error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

const ApplyBody = z.object({
  sessionId: z.string().min(1),
  diagnosisIds: z.array(z.string()).optional(),
});

async function executeInsertAction(
  action: RepairAction,
  proposal: RepairProposal,
  session: { diagnoses: RepairDiagnosis[] }
): Promise<{ success: boolean; message: string }> {
  const changes = action.changes;

  if (action.table === "form_definitions") {
    const [inserted] = await db.insert(formDefinitionsTable).values({
      entityId: changes.entityId,
      name: changes.name || "טופס ברירת מחדל",
      slug: changes.slug || "default",
      formType: changes.formType || "create",
      isDefault: changes.isDefault !== undefined ? changes.isDefault : true,
      sections: changes.sections || [],
    }).returning({ id: formDefinitionsTable.id });
    return { success: true, message: `Inserted form_definitions ID ${inserted.id} for entity ${changes.entityId}` };
  }

  if (action.table === "view_definitions") {
    const [inserted] = await db.insert(viewDefinitionsTable).values({
      entityId: changes.entityId,
      name: changes.name || "תצוגת ברירת מחדל",
      slug: changes.slug || "default",
      viewType: changes.viewType || "table",
      isDefault: changes.isDefault !== undefined ? changes.isDefault : true,
      columns: changes.columns || [],
      filters: changes.filters || [],
      sorting: changes.sorting || [],
    }).returning({ id: viewDefinitionsTable.id });
    return { success: true, message: `Inserted view_definitions ID ${inserted.id} for entity ${changes.entityId}` };
  }

  if (action.table === "detail_definitions") {
    const [inserted] = await db.insert(detailDefinitionsTable).values({
      entityId: changes.entityId,
      name: changes.name || "דף פרטים ברירת מחדל",
      slug: changes.slug || "default",
      isDefault: changes.isDefault !== undefined ? changes.isDefault : true,
      sections: changes.sections || [],
      showRelatedRecords: changes.showRelatedRecords !== undefined ? changes.showRelatedRecords : true,
    }).returning({ id: detailDefinitionsTable.id });
    return { success: true, message: `Inserted detail_definitions ID ${inserted.id} for entity ${changes.entityId}` };
  }

  if (action.table === "system_permissions") {
    const [inserted] = await db.insert(systemPermissionsTable).values({
      role: changes.role || "user",
      entityId: changes.entityId || null,
      action: changes.action || "read",
      isAllowed: changes.isAllowed !== undefined ? changes.isAllowed : true,
    }).returning({ id: systemPermissionsTable.id });
    return { success: true, message: `Inserted system_permissions ID ${inserted.id} (role=${changes.role}, action=${changes.action})` };
  }

  if (action.table === "entity_statuses") {
    const [inserted] = await db.insert(entityStatusesTable).values({
      entityId: changes.entityId,
      name: changes.name || "פעיל",
      slug: changes.slug || "active",
      color: changes.color || "blue",
      isDefault: changes.isDefault !== undefined ? changes.isDefault : true,
      sortOrder: changes.sortOrder || 0,
    }).returning({ id: entityStatusesTable.id });
    return { success: true, message: `Inserted entity_statuses ID ${inserted.id} for entity ${changes.entityId}` };
  }

  return { success: false, message: `Insert not supported for table: ${action.table}` };
}

const tableDeleteMap: Record<string, any> = {
  entity_fields: entityFieldsTable,
  form_definitions: formDefinitionsTable,
  view_definitions: viewDefinitionsTable,
  action_definitions: actionDefinitionsTable,
  entity_statuses: entityStatusesTable,
  detail_definitions: detailDefinitionsTable,
  system_buttons: systemButtonsTable,
  entity_relations: entityRelationsTable,
  status_transitions: statusTransitionsTable,
  system_permissions: systemPermissionsTable,
};

const tableUpdateMap: Record<string, any> = {
  ...tableDeleteMap,
  module_entities: moduleEntitiesTable,
  system_menu_items: systemMenuItemsTable,
  platform_modules: platformModulesTable,
};

router.post("/claude/repair/apply", async (req, res) => {
  try {
    const body = ApplyBody.parse(req.body);
    const session = repairStore.get(body.sessionId);
    if (!session) return res.status(404).json({ message: "Repair session not found" });

    const targetProposals = body.diagnosisIds
      ? session.proposals.filter(p => body.diagnosisIds!.includes(p.diagnosisId))
      : session.proposals;

    const unvalidated = targetProposals.filter(p => !session.validatedProposalIds.has(p.diagnosisId));
    if (unvalidated.length > 0) {
      return res.status(400).json({
        message: "Some proposals have not been validated",
        unvalidatedCount: unvalidated.length,
        unvalidatedIds: unvalidated.map(p => p.diagnosisId),
      });
    }

    const results: RepairResult[] = [];
    let totalApplied = 0;
    let totalFailed = 0;

    for (const proposal of targetProposals) {
      const details: string[] = [];
      let actionsExecuted = 0;
      let failed = false;

      for (const action of proposal.actions) {
        try {
          if (action.operation === "delete" && action.targetId) {
            const table = tableDeleteMap[action.table];
            if (table) {
              await db.delete(table).where(eq(table.id, action.targetId));
              details.push(`Deleted ${action.table} ID ${action.targetId}`);
              actionsExecuted++;
            } else {
              details.push(`Unknown table: ${action.table}`);
              failed = true;
            }
          } else if (action.operation === "update" && action.targetId) {
            const table = tableUpdateMap[action.table];
            if (table) {
              const { note, ...updateData } = action.changes;
              await db.update(table).set(updateData).where(eq(table.id, action.targetId));
              details.push(`Updated ${action.table} ID ${action.targetId}`);
              actionsExecuted++;
            } else {
              details.push(`Unknown table: ${action.table}`);
              failed = true;
            }
          } else if (action.operation === "update" && !action.targetId && proposal.repairType === "repair_default_status") {
            const diagnosis = session.diagnoses.find(d => d.id === proposal.diagnosisId);
            if (diagnosis) {
              const [firstStatus] = await db.select().from(entityStatusesTable)
                .where(eq(entityStatusesTable.entityId, diagnosis.objectId))
                .orderBy(asc(entityStatusesTable.sortOrder))
                .limit(1);
              if (firstStatus) {
                await db.update(entityStatusesTable).set({ isDefault: true }).where(eq(entityStatusesTable.id, firstStatus.id));
                details.push(`Set status '${firstStatus.name}' (ID ${firstStatus.id}) as default for entity ID ${diagnosis.objectId}`);
                actionsExecuted++;
              } else {
                details.push(`No statuses found for entity ID ${diagnosis.objectId}`);
                failed = true;
              }
            }
          } else if (action.operation === "insert") {
            const insertResult = await executeInsertAction(action, proposal, session);
            if (insertResult.success) {
              details.push(insertResult.message);
              actionsExecuted++;
            } else {
              details.push(insertResult.message);
              failed = true;
            }
          }
        } catch (actionErr: any) {
          details.push(`Error executing ${action.operation} on ${action.table}: ${actionErr.message}`);
          failed = true;
        }
      }

      const result: RepairResult = {
        proposalId: proposal.diagnosisId,
        status: failed ? "failed" : "applied",
        actionsExecuted,
        details,
      };
      results.push(result);
      session.results.push(result);

      if (failed) totalFailed++;
      else totalApplied++;
    }

    const response = {
      sessionId: body.sessionId,
      totalApplied,
      totalFailed,
      results,
    };

    await logRepairAction("apply", "/claude/repair/apply", body, { sessionId: body.sessionId, applied: totalApplied, failed: totalFailed });
    res.json(response);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Repair apply error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/repair/session/:sessionId", async (req, res) => {
  try {
    const session = repairStore.get(req.params.sessionId);
    if (!session) return res.status(404).json({ message: "Repair session not found" });

    res.json({
      sessionId: req.params.sessionId,
      createdAt: new Date(session.createdAt).toISOString(),
      totalDiagnoses: session.diagnoses.length,
      totalProposals: session.proposals.length,
      totalValidated: session.validatedProposalIds.size,
      totalResults: session.results.length,
      diagnoses: session.diagnoses,
      proposals: session.proposals,
      results: session.results,
    });
  } catch (err: any) {
    console.error("Repair session error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

setInterval(() => {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, session] of repairStore.entries()) {
    if (now - session.createdAt > oneHour) {
      repairStore.delete(id);
    }
  }
}, 10 * 60 * 1000);

export default router;
