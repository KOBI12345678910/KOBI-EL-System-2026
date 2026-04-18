import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
  detailDefinitionsTable,
  entityCategoriesTable,
  systemButtonsTable,
  systemPermissionsTable,
  systemMenuItemsTable,
  systemPublishLogsTable,
  claudeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray, count } from "drizzle-orm";

const router: IRouter = Router();

interface GapItem {
  objectType: string;
  objectId: number;
  objectName: string;
  missing: string[];
}

interface GapReport {
  runAt: string;
  durationMs: number;
  totalGaps: number;
  gaps: GapItem[];
}

async function logGapAction(actionType: string, path: string, result: any) {
  try {
    await db.insert(claudeAuditLogsTable).values({
      actionType: `gaps_${actionType}`,
      caller: "claude-gaps",
      targetApi: path,
      httpMethod: "GET",
      httpPath: path,
      inputSummary: "{}",
      outputSummary: JSON.stringify({ totalGaps: result.totalGaps }).substring(0, 500),
      status: "success",
      statusCode: 200,
      responseTimeMs: result.durationMs,
    });
  } catch (err) {
    console.error("Failed to log gap action:", err);
  }
}

function buildGapReport(startTime: number, gaps: GapItem[]): GapReport {
  return {
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    totalGaps: gaps.length,
    gaps,
  };
}

router.get("/claude/gaps/full", async (_req, res) => {
  try {
    const startTime = Date.now();
    const gaps: GapItem[] = [];

    const modules = await db.select().from(platformModulesTable);
    const entities = await db.select().from(moduleEntitiesTable);
    const entityIds = entities.map(e => e.id);

    let fields: any[] = [];
    let forms: any[] = [];
    let views: any[] = [];
    let actions: any[] = [];
    let details: any[] = [];
    let statuses: any[] = [];
    let permissions: any[] = [];
    let buttons: any[] = [];
    let menuItems: any[] = [];
    let publishLogs: any[] = [];

    if (entityIds.length > 0) {
      const safeQuery = async (fn: () => Promise<any[]>) => { try { return await fn(); } catch (_e) { return []; } };
      [fields, forms, views, actions, details, statuses, permissions, buttons] = await Promise.all([
        safeQuery(() => db.select().from(entityFieldsTable).where(inArray(entityFieldsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(formDefinitionsTable).where(inArray(formDefinitionsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(viewDefinitionsTable).where(inArray(viewDefinitionsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(actionDefinitionsTable).where(inArray(actionDefinitionsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(detailDefinitionsTable).where(inArray(detailDefinitionsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(entityStatusesTable).where(inArray(entityStatusesTable.entityId, entityIds))),
        safeQuery(() => db.select().from(systemPermissionsTable).where(inArray(systemPermissionsTable.entityId, entityIds))),
        safeQuery(() => db.select().from(systemButtonsTable).where(inArray(systemButtonsTable.entityId, entityIds))),
      ]);
    }

    try { menuItems = await db.select().from(systemMenuItemsTable); } catch (_e) { /* table may not be synced */ }
    try { publishLogs = await db.select().from(systemPublishLogsTable); } catch (_e) { /* table may not be synced */ }

    for (const mod of modules) {
      const modEntities = entities.filter(e => e.moduleId === mod.id);
      if (modEntities.length === 0) {
        gaps.push({
          objectType: "module",
          objectId: mod.id,
          objectName: mod.name,
          missing: ["entities"],
        });
      }
    }

    for (const entity of entities) {
      const missing: string[] = [];
      const entFields = fields.filter(f => f.entityId === entity.id);
      const entForms = forms.filter(f => f.entityId === entity.id);
      const entViews = views.filter(v => v.entityId === entity.id);
      const entDetails = details.filter(d => d.entityId === entity.id);
      const entPermissions = permissions.filter(p => p.entityId === entity.id);
      const entStatuses = statuses.filter(s => s.entityId === entity.id);
      const entActions = actions.filter(a => a.entityId === entity.id);
      const entButtons = buttons.filter(b => b.entityId === entity.id);

      if (entFields.length === 0) missing.push("fields");
      if (entForms.length === 0) missing.push("forms");
      if (entViews.length === 0) missing.push("views");
      if (entDetails.length === 0) missing.push("detail_pages");
      if (entPermissions.length === 0) missing.push("permissions");
      if (entity.hasStatus && entStatuses.length === 0) missing.push("statuses");
      if (entActions.length === 0) missing.push("actions");

      if (missing.length > 0) {
        gaps.push({
          objectType: "entity",
          objectId: entity.id,
          objectName: entity.name,
          missing,
        });
      }
    }

    const actionsWithoutButtons = actions.filter(a => {
      const entityButtons = buttons.filter(b => b.entityId === a.entityId);
      return entityButtons.length === 0;
    });
    const seenActionEntities = new Set<number>();
    for (const a of actionsWithoutButtons) {
      if (!seenActionEntities.has(a.entityId)) {
        seenActionEntities.add(a.entityId);
        const entity = entities.find(e => e.id === a.entityId);
        gaps.push({
          objectType: "entity",
          objectId: a.entityId,
          objectName: entity?.name || `entity#${a.entityId}`,
          missing: ["buttons_for_actions"],
        });
      }
    }

    const publishedModuleIds = new Set(publishLogs.map(p => p.moduleId).filter(Boolean));
    for (const mod of modules) {
      if (mod.status === "published" || publishedModuleIds.has(mod.id)) continue;
      const modEntities = entities.filter(e => e.moduleId === mod.id);
      if (modEntities.length > 0) {
        const hasAllConfigs = modEntities.every(e => {
          return (
            forms.some(f => f.entityId === e.id) &&
            views.some(v => v.entityId === e.id)
          );
        });
        if (hasAllConfigs) {
          gaps.push({
            objectType: "module",
            objectId: mod.id,
            objectName: mod.name,
            missing: ["publish"],
          });
        }
      }
    }

    const report = buildGapReport(startTime, gaps);
    await logGapAction("full_scan", "/claude/gaps/full", report);
    res.json(report);
  } catch (err: any) {
    console.error("Gap analysis error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/gaps/modules", async (_req, res) => {
  try {
    const startTime = Date.now();
    const gaps: GapItem[] = [];
    const modules = await db.select().from(platformModulesTable);
    const entities = await db.select().from(moduleEntitiesTable);

    for (const mod of modules) {
      const modEntities = entities.filter(e => e.moduleId === mod.id);
      if (modEntities.length === 0) {
        gaps.push({
          objectType: "module",
          objectId: mod.id,
          objectName: mod.name,
          missing: ["entities"],
        });
      }
    }

    const report = buildGapReport(startTime, gaps);
    await logGapAction("modules_scan", "/claude/gaps/modules", report);
    res.json(report);
  } catch (err: any) {
    console.error("Gap analysis error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/gaps/entities", async (_req, res) => {
  try {
    const startTime = Date.now();
    const gaps: GapItem[] = [];
    const entities = await db.select().from(moduleEntitiesTable);
    const entityIds = entities.map(e => e.id);

    if (entityIds.length === 0) {
      const report = buildGapReport(startTime, gaps);
      await logGapAction("entities_scan", "/claude/gaps/entities", report);
      return res.json(report);
    }

    const [fields, forms, views, details, statuses, permissions] = await Promise.all([
      db.select().from(entityFieldsTable).where(inArray(entityFieldsTable.entityId, entityIds)),
      db.select().from(formDefinitionsTable).where(inArray(formDefinitionsTable.entityId, entityIds)),
      db.select().from(viewDefinitionsTable).where(inArray(viewDefinitionsTable.entityId, entityIds)),
      db.select().from(detailDefinitionsTable).where(inArray(detailDefinitionsTable.entityId, entityIds)),
      db.select().from(entityStatusesTable).where(inArray(entityStatusesTable.entityId, entityIds)),
      db.select().from(systemPermissionsTable).where(inArray(systemPermissionsTable.entityId, entityIds)),
    ]);

    for (const entity of entities) {
      const missing: string[] = [];
      if (!fields.some(f => f.entityId === entity.id)) missing.push("fields");
      if (!forms.some(f => f.entityId === entity.id)) missing.push("forms");
      if (!views.some(v => v.entityId === entity.id)) missing.push("views");
      if (!details.some(d => d.entityId === entity.id)) missing.push("detail_pages");
      if (!permissions.some(p => p.entityId === entity.id)) missing.push("permissions");
      if (entity.hasStatus && !statuses.some(s => s.entityId === entity.id)) missing.push("statuses");

      if (missing.length > 0) {
        gaps.push({
          objectType: "entity",
          objectId: entity.id,
          objectName: entity.name,
          missing,
        });
      }
    }

    const report = buildGapReport(startTime, gaps);
    await logGapAction("entities_scan", "/claude/gaps/entities", report);
    res.json(report);
  } catch (err: any) {
    console.error("Gap analysis error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/gaps/entity/:id", async (req, res) => {
  try {
    const startTime = Date.now();
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid entity ID" });

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    const [fields, forms, views, details, statuses, actions, permissions, buttons] = await Promise.all([
      db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, id)),
      db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, id)),
      db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, id)),
      db.select().from(detailDefinitionsTable).where(eq(detailDefinitionsTable.entityId, id)),
      db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, id)),
      db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, id)),
      db.select().from(systemPermissionsTable).where(eq(systemPermissionsTable.entityId, id)),
      db.select().from(systemButtonsTable).where(eq(systemButtonsTable.entityId, id)),
    ]);

    const missing: string[] = [];
    if (fields.length === 0) missing.push("fields");
    if (forms.length === 0) missing.push("forms");
    if (views.length === 0) missing.push("views");
    if (details.length === 0) missing.push("detail_pages");
    if (permissions.length === 0) missing.push("permissions");
    if (entity.hasStatus && statuses.length === 0) missing.push("statuses");
    if (actions.length === 0) missing.push("actions");
    if (actions.length > 0 && buttons.length === 0) missing.push("buttons_for_actions");

    const existing = {
      fields: fields.length,
      forms: forms.length,
      views: views.length,
      detailPages: details.length,
      statuses: statuses.length,
      actions: actions.length,
      permissions: permissions.length,
      buttons: buttons.length,
    };

    const report = {
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      entity: { id: entity.id, name: entity.name, slug: entity.slug },
      existing,
      missing,
      isComplete: missing.length === 0,
    };

    await logGapAction("entity_detail", `/claude/gaps/entity/${id}`, { totalGaps: missing.length, durationMs: report.durationMs });
    res.json(report);
  } catch (err: any) {
    console.error("Gap analysis error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
