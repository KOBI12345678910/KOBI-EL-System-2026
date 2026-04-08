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
  systemStatusSetsTable,
  systemStatusValuesTable,
  claudeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, asc, sql, count, inArray, isNull } from "drizzle-orm";

const router: IRouter = Router();

type Severity = "error" | "warning" | "info";

interface DiagnosticIssue {
  severity: Severity;
  category: string;
  objectType: string;
  objectId: number | null;
  objectName: string;
  message: string;
  suggestion: string;
}

interface DiagnosticReport {
  runAt: string;
  durationMs: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  infos: number;
  issues: DiagnosticIssue[];
}

async function logDiagnosticAction(actionType: string, path: string, result: any) {
  try {
    await db.insert(claudeAuditLogsTable).values({
      actionType: `diagnostics_${actionType}`,
      caller: "claude-diagnostics",
      targetApi: path,
      httpMethod: "GET",
      httpPath: path,
      inputSummary: "{}",
      outputSummary: JSON.stringify({ totalIssues: result.totalIssues, errors: result.errors, warnings: result.warnings }).substring(0, 500),
      status: "success",
      statusCode: 200,
      responseTimeMs: result.durationMs,
    });
  } catch (err) {
    console.error("Failed to log diagnostic action:", err);
  }
}

async function checkBrokenMetadata(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];

  const entities = await db.select().from(moduleEntitiesTable);
  const moduleIds = (await db.select({ id: platformModulesTable.id }).from(platformModulesTable)).map(m => m.id);

  for (const entity of entities) {
    if (!moduleIds.includes(entity.moduleId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "entity",
        objectId: entity.id,
        objectName: entity.name,
        message: `Entity references non-existent module ID ${entity.moduleId}`,
        suggestion: "Reassign entity to a valid module or delete it",
      });
    }
    if (entity.parentEntityId) {
      const parentExists = entities.some(e => e.id === entity.parentEntityId);
      if (!parentExists) {
        issues.push({
          severity: "error",
          category: "broken_reference",
          objectType: "entity",
          objectId: entity.id,
          objectName: entity.name,
          message: `Entity references non-existent parent entity ID ${entity.parentEntityId}`,
          suggestion: "Clear parentEntityId or set to a valid entity",
        });
      }
    }
  }

  const modules = await db.select().from(platformModulesTable);
  for (const mod of modules) {
    if (mod.parentModuleId) {
      const parentExists = modules.some(m => m.id === mod.parentModuleId);
      if (!parentExists) {
        issues.push({
          severity: "error",
          category: "broken_reference",
          objectType: "module",
          objectId: mod.id,
          objectName: mod.name,
          message: `Module references non-existent parent module ID ${mod.parentModuleId}`,
          suggestion: "Clear parentModuleId or set to a valid module",
        });
      }
    }
  }

  return issues;
}

async function checkMissingRelationTargets(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const relations = await db.select().from(entityRelationsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const rel of relations) {
    if (!entityIds.includes(rel.sourceEntityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "relation",
        objectId: rel.id,
        objectName: rel.label,
        message: `Relation references non-existent source entity ID ${rel.sourceEntityId}`,
        suggestion: "Delete this relation or fix the source entity reference",
      });
    }
    if (!entityIds.includes(rel.targetEntityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "relation",
        objectId: rel.id,
        objectName: rel.label,
        message: `Relation references non-existent target entity ID ${rel.targetEntityId}`,
        suggestion: "Delete this relation or fix the target entity reference",
      });
    }
  }

  return issues;
}

async function checkMissingRequiredFields(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const modules = await db.select().from(platformModulesTable);
  const entities = await db.select().from(moduleEntitiesTable);

  for (const mod of modules) {
    if (!mod.name || mod.name.trim() === "") {
      issues.push({ severity: "error", category: "missing_required", objectType: "module", objectId: mod.id, objectName: `module#${mod.id}`, message: "Module is missing required 'name' field", suggestion: "Set a name for this module" });
    }
    if (!mod.slug || mod.slug.trim() === "") {
      issues.push({ severity: "error", category: "missing_required", objectType: "module", objectId: mod.id, objectName: mod.name || `module#${mod.id}`, message: "Module is missing required 'slug' field", suggestion: "Set a slug for this module" });
    }
  }

  for (const entity of entities) {
    if (!entity.name || entity.name.trim() === "") {
      issues.push({ severity: "error", category: "missing_required", objectType: "entity", objectId: entity.id, objectName: `entity#${entity.id}`, message: "Entity is missing required 'name' field", suggestion: "Set a name for this entity" });
    }
    if (!entity.slug || entity.slug.trim() === "") {
      issues.push({ severity: "error", category: "missing_required", objectType: "entity", objectId: entity.id, objectName: entity.name || `entity#${entity.id}`, message: "Entity is missing required 'slug' field", suggestion: "Set a slug for this entity" });
    }
  }

  return issues;
}

async function checkFieldIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const fields = await db.select().from(entityFieldsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const field of fields) {
    if (!entityIds.includes(field.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "field",
        objectId: field.id,
        objectName: field.name,
        message: `Field references non-existent entity ID ${field.entityId}`,
        suggestion: "Delete this orphaned field",
      });
    }
    if (field.relatedEntityId && !entityIds.includes(field.relatedEntityId)) {
      issues.push({
        severity: "warning",
        category: "broken_reference",
        objectType: "field",
        objectId: field.id,
        objectName: field.name,
        message: `Field references non-existent related entity ID ${field.relatedEntityId}`,
        suggestion: "Clear relatedEntityId or set to a valid entity",
      });
    }
    if (field.fieldType === "select" || field.fieldType === "multiselect") {
      const opts = field.options as any;
      if (!opts || (Array.isArray(opts) && opts.length === 0)) {
        issues.push({
          severity: "warning",
          category: "invalid_config",
          objectType: "field",
          objectId: field.id,
          objectName: field.name,
          message: `${field.fieldType} field has no options defined`,
          suggestion: "Add options for this select/multiselect field",
        });
      }
    }
  }

  return issues;
}

async function checkFormIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const forms = await db.select().from(formDefinitionsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const form of forms) {
    if (!entityIds.includes(form.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "form",
        objectId: form.id,
        objectName: form.name,
        message: `Form references non-existent entity ID ${form.entityId}`,
        suggestion: "Delete this orphaned form definition",
      });
    }
  }

  return issues;
}

async function checkViewIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const views = await db.select().from(viewDefinitionsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const view of views) {
    if (!entityIds.includes(view.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "view",
        objectId: view.id,
        objectName: view.name,
        message: `View references non-existent entity ID ${view.entityId}`,
        suggestion: "Delete this orphaned view definition",
      });
    }
  }

  return issues;
}

async function checkActionIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const actions = await db.select().from(actionDefinitionsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const action of actions) {
    if (!entityIds.includes(action.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "action",
        objectId: action.id,
        objectName: action.name,
        message: `Action references non-existent entity ID ${action.entityId}`,
        suggestion: "Delete this orphaned action definition",
      });
    }
  }

  return issues;
}

async function checkStatusIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const statuses = await db.select().from(entityStatusesTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);
  const statusIds = statuses.map(s => s.id);

  for (const status of statuses) {
    if (!entityIds.includes(status.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "status",
        objectId: status.id,
        objectName: status.name,
        message: `Status references non-existent entity ID ${status.entityId}`,
        suggestion: "Delete this orphaned status",
      });
    }
  }

  const transitions = await db.select().from(statusTransitionsTable);
  for (const t of transitions) {
    if (t.fromStatusId && !statusIds.includes(t.fromStatusId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "transition",
        objectId: t.id,
        objectName: t.label,
        message: `Transition references non-existent from_status ID ${t.fromStatusId}`,
        suggestion: "Delete or fix this transition",
      });
    }
    if (!statusIds.includes(t.toStatusId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "transition",
        objectId: t.id,
        objectName: t.label,
        message: `Transition references non-existent to_status ID ${t.toStatusId}`,
        suggestion: "Delete or fix this transition",
      });
    }
  }

  const entities = await db.select().from(moduleEntitiesTable);
  for (const entity of entities) {
    if (entity.hasStatus) {
      const entityStatuses = statuses.filter(s => s.entityId === entity.id);
      if (entityStatuses.length === 0) {
        issues.push({
          severity: "warning",
          category: "invalid_config",
          objectType: "entity",
          objectId: entity.id,
          objectName: entity.name,
          message: "Entity has hasStatus=true but no statuses defined",
          suggestion: "Add statuses or set hasStatus to false",
        });
      } else {
        const hasDefault = entityStatuses.some(s => s.isDefault);
        if (!hasDefault) {
          issues.push({
            severity: "warning",
            category: "invalid_config",
            objectType: "entity",
            objectId: entity.id,
            objectName: entity.name,
            message: "Entity has statuses but none is marked as default",
            suggestion: "Mark one status as isDefault=true",
          });
        }
      }
    }
  }

  return issues;
}

async function checkDetailIntegrity(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const details = await db.select().from(detailDefinitionsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const detail of details) {
    if (!entityIds.includes(detail.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "detail",
        objectId: detail.id,
        objectName: detail.name,
        message: `Detail page references non-existent entity ID ${detail.entityId}`,
        suggestion: "Delete this orphaned detail definition",
      });
    }
  }

  return issues;
}

async function checkButtonBindings(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const buttons = await db.select().from(systemButtonsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const button of buttons) {
    if (!entityIds.includes(button.entityId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        objectType: "button",
        objectId: button.id,
        objectName: button.name,
        message: `Button references non-existent entity ID ${button.entityId}`,
        suggestion: "Delete this orphaned button",
      });
    }
  }

  return issues;
}

async function checkMenuItems(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const menuItems = await db.select().from(systemMenuItemsTable);
  const moduleIds = (await db.select({ id: platformModulesTable.id }).from(platformModulesTable)).map(m => m.id);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const item of menuItems) {
    if (item.moduleId && !moduleIds.includes(item.moduleId)) {
      issues.push({
        severity: "warning",
        category: "orphan",
        objectType: "menu_item",
        objectId: item.id,
        objectName: item.label,
        message: `Menu item references non-existent module ID ${item.moduleId}`,
        suggestion: "Delete or reassign this menu item",
      });
    }
    if (item.entityId && !entityIds.includes(item.entityId)) {
      issues.push({
        severity: "warning",
        category: "orphan",
        objectType: "menu_item",
        objectId: item.id,
        objectName: item.label,
        message: `Menu item references non-existent entity ID ${item.entityId}`,
        suggestion: "Delete or reassign this menu item",
      });
    }
  }

  return issues;
}

async function checkPermissionGaps(): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const permissions = await db.select().from(systemPermissionsTable);
  const entityIds = (await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map(e => e.id);

  for (const perm of permissions) {
    if (perm.entityId && !entityIds.includes(perm.entityId)) {
      issues.push({
        severity: "warning",
        category: "broken_reference",
        objectType: "permission",
        objectId: perm.id,
        objectName: `${perm.role}:${perm.action}`,
        message: `Permission references non-existent entity ID ${perm.entityId}`,
        suggestion: "Delete or reassign this permission",
      });
    }
  }

  return issues;
}

function buildReport(startTime: number, allIssues: DiagnosticIssue[]): DiagnosticReport {
  const durationMs = Date.now() - startTime;
  return {
    runAt: new Date().toISOString(),
    durationMs,
    totalIssues: allIssues.length,
    errors: allIssues.filter(i => i.severity === "error").length,
    warnings: allIssues.filter(i => i.severity === "warning").length,
    infos: allIssues.filter(i => i.severity === "info").length,
    issues: allIssues,
  };
}

router.get("/claude/diagnostics/full", async (_req, res) => {
  try {
    const startTime = Date.now();
    const allIssues: DiagnosticIssue[] = [];

    const checkFns = [
      checkBrokenMetadata,
      checkMissingRelationTargets,
      checkMissingRequiredFields,
      checkFieldIntegrity,
      checkFormIntegrity,
      checkViewIntegrity,
      checkActionIntegrity,
      checkStatusIntegrity,
      checkDetailIntegrity,
      checkButtonBindings,
      checkMenuItems,
      checkPermissionGaps,
    ];

    const checks = await Promise.allSettled(checkFns.map(fn => fn()));

    for (const result of checks) {
      if (result.status === "fulfilled") {
        allIssues.push(...result.value);
      }
    }

    const report = buildReport(startTime, allIssues);
    await logDiagnosticAction("full_scan", "/claude/diagnostics/full", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/modules", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkBrokenMetadata();
    const moduleIssues = issues.filter(i => i.objectType === "module");
    const report = buildReport(startTime, moduleIssues);
    await logDiagnosticAction("modules_scan", "/claude/diagnostics/modules", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/entities", async (_req, res) => {
  try {
    const startTime = Date.now();
    const [brokenMeta, missingFields, statusIssues] = await Promise.all([
      checkBrokenMetadata(),
      checkMissingRequiredFields(),
      checkStatusIntegrity(),
    ]);
    const allIssues = [...brokenMeta, ...missingFields, ...statusIssues].filter(
      i => i.objectType === "entity"
    );
    const report = buildReport(startTime, allIssues);
    await logDiagnosticAction("entities_scan", "/claude/diagnostics/entities", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/fields", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkFieldIntegrity();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("fields_scan", "/claude/diagnostics/fields", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/relations", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkMissingRelationTargets();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("relations_scan", "/claude/diagnostics/relations", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/forms", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkFormIntegrity();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("forms_scan", "/claude/diagnostics/forms", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/views", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkViewIntegrity();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("views_scan", "/claude/diagnostics/views", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/actions", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkActionIntegrity();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("actions_scan", "/claude/diagnostics/actions", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/statuses", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkStatusIntegrity();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("statuses_scan", "/claude/diagnostics/statuses", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/diagnostics/permissions", async (_req, res) => {
  try {
    const startTime = Date.now();
    const issues = await checkPermissionGaps();
    const report = buildReport(startTime, issues);
    await logDiagnosticAction("permissions_scan", "/claude/diagnostics/permissions", report);
    res.json(report);
  } catch (err: any) {
    console.error("Diagnostics error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
