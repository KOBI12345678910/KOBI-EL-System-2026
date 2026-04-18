import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
  platformWorkflowsTable,
  entityStatusesTable,
  systemMenuItemsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

interface DependencyNode {
  id: string;
  type: string;
  name: string;
  dbId: number;
}

interface DependencyEdge {
  from: string;
  to: string;
  relationship: string;
}

const queryWarnings: string[] = [];

async function safeQuery<T>(query: Promise<T[]>, tableName: string): Promise<T[]> {
  try {
    return await query;
  } catch (err: any) {
    queryWarnings.push(`Failed to query ${tableName}: ${err?.message || "unknown error"}`);
    return [];
  }
}

router.get("/claude/dependencies/graph", async (_req, res) => {
  queryWarnings.length = 0;
  const modules = await safeQuery(db.select().from(platformModulesTable), "platform_modules");
  const entities = await safeQuery(db.select().from(moduleEntitiesTable), "module_entities");
  const fields = await safeQuery(db.select().from(entityFieldsTable), "entity_fields");
  const relations = await safeQuery(db.select().from(entityRelationsTable), "entity_relations");
  const forms = await safeQuery(db.select().from(formDefinitionsTable), "form_definitions");
  const views = await safeQuery(db.select().from(viewDefinitionsTable), "view_definitions");
  const actions = await safeQuery(db.select().from(actionDefinitionsTable), "action_definitions");
  const workflows = await safeQuery(db.select().from(platformWorkflowsTable), "platform_workflows");
  const statuses = await safeQuery(db.select().from(entityStatusesTable), "entity_statuses");
  const menus = await safeQuery(db.select().from(systemMenuItemsTable), "system_menu_items");

  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  for (const m of modules) {
    nodes.push({ id: `module:${m.id}`, type: "module", name: m.name, dbId: m.id });
  }

  for (const e of entities) {
    nodes.push({ id: `entity:${e.id}`, type: "entity", name: e.name, dbId: e.id });
    edges.push({ from: `module:${e.moduleId}`, to: `entity:${e.id}`, relationship: "contains" });
    if (e.parentEntityId) {
      edges.push({ from: `entity:${e.parentEntityId}`, to: `entity:${e.id}`, relationship: "parent_of" });
    }
  }

  for (const f of fields) {
    nodes.push({ id: `field:${f.id}`, type: "field", name: f.name, dbId: f.id });
    edges.push({ from: `entity:${f.entityId}`, to: `field:${f.id}`, relationship: "has_field" });
    if (f.relatedEntityId) {
      edges.push({ from: `field:${f.id}`, to: `entity:${f.relatedEntityId}`, relationship: "references" });
    }
  }

  for (const r of relations) {
    edges.push({ from: `entity:${r.sourceEntityId}`, to: `entity:${r.targetEntityId}`, relationship: `relation:${r.relationType}` });
  }

  for (const f of forms) {
    nodes.push({ id: `form:${f.id}`, type: "form", name: f.name, dbId: f.id });
    edges.push({ from: `entity:${f.entityId}`, to: `form:${f.id}`, relationship: "has_form" });
  }

  for (const v of views) {
    nodes.push({ id: `view:${v.id}`, type: "view", name: v.name, dbId: v.id });
    edges.push({ from: `entity:${v.entityId}`, to: `view:${v.id}`, relationship: "has_view" });
  }

  for (const a of actions) {
    nodes.push({ id: `action:${a.id}`, type: "action", name: a.name, dbId: a.id });
    edges.push({ from: `entity:${a.entityId}`, to: `action:${a.id}`, relationship: "has_action" });
  }

  for (const w of workflows) {
    nodes.push({ id: `workflow:${w.id}`, type: "workflow", name: w.name, dbId: w.id });
    if (w.moduleId) {
      edges.push({ from: `module:${w.moduleId}`, to: `workflow:${w.id}`, relationship: "has_workflow" });
    }
  }

  for (const s of statuses) {
    nodes.push({ id: `status:${s.id}`, type: "status", name: s.name, dbId: s.id });
    edges.push({ from: `entity:${s.entityId}`, to: `status:${s.id}`, relationship: "has_status" });
  }

  for (const mi of menus) {
    nodes.push({ id: `menu:${mi.id}`, type: "menu_item", name: mi.label, dbId: mi.id });
    if (mi.moduleId) {
      edges.push({ from: `module:${mi.moduleId}`, to: `menu:${mi.id}`, relationship: "has_menu" });
    }
    if (mi.entityId) {
      edges.push({ from: `entity:${mi.entityId}`, to: `menu:${mi.id}`, relationship: "has_menu" });
    }
  }

  res.json({
    nodes,
    edges,
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType: nodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {} as Record<string, number>),
    },
    ...(queryWarnings.length > 0 ? { warnings: [...queryWarnings] } : {}),
  });
});

router.get("/claude/dependencies/entity/:entityId", async (req, res) => {
  const entityId = parseInt(req.params.entityId, 10);
  if (isNaN(entityId)) {
    res.status(400).json({ error: "Invalid entityId" });
    return;
  }

  const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId));
  if (!entity) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entityId));
  const outRels = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entityId));
  const inRels = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.targetEntityId, entityId));
  const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entityId));
  const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entityId));
  const actions = await db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, entityId));
  const entity0 = entity;
  const workflows = await db.select().from(platformWorkflowsTable).where(eq(platformWorkflowsTable.moduleId, entity0.moduleId));
  const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entityId));

  const referencingFields = fields.filter((f) => f.relatedEntityId);

  const dependsOn: string[] = [];
  const dependedBy: string[] = [];

  for (const f of referencingFields) {
    dependsOn.push(`entity:${f.relatedEntityId}`);
  }
  for (const r of outRels) {
    dependsOn.push(`entity:${r.targetEntityId}`);
  }
  for (const r of inRels) {
    dependedBy.push(`entity:${r.sourceEntityId}`);
  }

  const allFields = await db.select().from(entityFieldsTable);
  for (const f of allFields) {
    if (f.relatedEntityId === entityId && f.entityId !== entityId) {
      dependedBy.push(`entity:${f.entityId}`);
    }
  }

  res.json({
    entity: { id: entity.id, name: entity.name, moduleId: entity.moduleId },
    directDependencies: {
      fields: fields.length,
      forms: forms.length,
      views: views.length,
      actions: actions.length,
      workflows: workflows.length,
      statuses: statuses.length,
      outgoingRelations: outRels.length,
      incomingRelations: inRels.length,
    },
    dependsOn: [...new Set(dependsOn)],
    dependedBy: [...new Set(dependedBy)],
    cascadeDeleteRisk: inRels.filter((r) => r.cascadeDelete).length > 0,
  });
});

router.get("/claude/dependencies/module/:moduleId", async (req, res) => {
  const moduleId = parseInt(req.params.moduleId, 10);
  if (isNaN(moduleId)) {
    res.status(400).json({ error: "Invalid moduleId" });
    return;
  }

  const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId));
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId));
  const entityIds = new Set(entities.map((e) => e.id));

  const allRelations = await db.select().from(entityRelationsTable);
  const crossModuleRelations = allRelations.filter(
    (r) => (entityIds.has(r.sourceEntityId) && !entityIds.has(r.targetEntityId)) || (!entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId))
  );

  const externalEntityIds = new Set<number>();
  for (const r of crossModuleRelations) {
    if (!entityIds.has(r.sourceEntityId)) externalEntityIds.add(r.sourceEntityId);
    if (!entityIds.has(r.targetEntityId)) externalEntityIds.add(r.targetEntityId);
  }

  const externalEntities = await Promise.all(
    [...externalEntityIds].map(async (id) => {
      const [e] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
      return e;
    })
  );

  const externalModuleIds = new Set(externalEntities.filter(Boolean).map((e) => e!.moduleId));

  res.json({
    module: { id: mod.id, name: mod.name, slug: mod.slug },
    internalEntities: entities.length,
    crossModuleDependencies: {
      relations: crossModuleRelations.length,
      externalEntities: externalEntityIds.size,
      externalModules: [...externalModuleIds],
    },
    isIsolated: crossModuleRelations.length === 0,
  });
});

export default router;
