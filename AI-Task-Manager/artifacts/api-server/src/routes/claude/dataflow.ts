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
  platformWidgetsTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
  systemMenuItemsTable,
  entityStatusesTable,
  systemStatusSetsTable,
  systemStatusValuesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/claude/dataflow/entity-paths", async (req, res) => {
  const entityId = req.query.entityId ? parseInt(req.query.entityId as string, 10) : undefined;

  const entities = entityId
    ? await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId))
    : await db.select().from(moduleEntitiesTable);

  const paths = await Promise.all(
    entities.map(async (entity) => {
      const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
      const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
      const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
      const outRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entity.id));
      const inRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.targetEntityId, entity.id));

      return {
        entityId: entity.id,
        entityName: entity.name,
        moduleId: entity.moduleId,
        sourceOfTruth: entity.tableName || entity.slug,
        fieldCount: fields.length,
        formPaths: forms.map((f) => ({ formId: f.id, formName: f.name, formType: f.formType })),
        viewPaths: views.map((v) => ({ viewId: v.id, viewName: v.name, viewType: v.viewType })),
        outgoingRelations: outRelations.map((r) => ({ relationId: r.id, label: r.label, targetEntityId: r.targetEntityId, type: r.relationType })),
        incomingRelations: inRelations.map((r) => ({ relationId: r.id, label: r.reverseLabel || r.label, sourceEntityId: r.sourceEntityId, type: r.relationType })),
      };
    })
  );

  res.json({ paths });
});

router.get("/claude/dataflow/chains", async (req, res) => {
  const entityId = req.query.entityId ? parseInt(req.query.entityId as string, 10) : undefined;

  const entities = entityId
    ? await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId))
    : await db.select().from(moduleEntitiesTable);

  const chains = await Promise.all(
    entities.map(async (entity) => {
      const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
      const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
      const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entity.id));

      const dashWidgets = await db.select().from(systemDashboardWidgetsTable).where(eq(systemDashboardWidgetsTable.entityId, entity.id));

      return {
        entityId: entity.id,
        entityName: entity.name,
        chain: {
          forms: forms.map((f) => f.name),
          entity: entity.name,
          views: views.map((v) => v.name),
          statuses: statuses.map((s) => s.name),
          dashboards: dashWidgets.map((w) => w.title),
        },
      };
    })
  );

  res.json({ chains });
});

router.get("/claude/dataflow/relation-graph", async (_req, res) => {
  const relations = await db.select().from(entityRelationsTable);
  const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable);

  const nodes = entities.map((e) => ({ id: e.id, name: e.name, slug: e.slug, moduleId: e.moduleId }));
  const edges = relations.map((r) => ({
    id: r.id,
    source: r.sourceEntityId,
    target: r.targetEntityId,
    type: r.relationType,
    label: r.label,
    reverseLabel: r.reverseLabel,
    cascadeDelete: r.cascadeDelete,
  }));

  res.json({ nodes, edges });
});

router.get("/claude/dataflow/workflow-connections", async (_req, res) => {
  const workflows = await db.select().from(platformWorkflowsTable);

  const connections = workflows.map((wf) => ({
    workflowId: wf.id,
    workflowName: wf.name,
    moduleId: wf.moduleId,
    triggerType: wf.triggerType,
    isActive: wf.isActive,
  }));

  res.json({ connections });
});

router.get("/claude/dataflow/system-graph", async (_req, res) => {
  const modules = await db.select().from(platformModulesTable);
  const entities = await db.select().from(moduleEntitiesTable);
  const relations = await db.select().from(entityRelationsTable);
  const fields = await db.select().from(entityFieldsTable);
  const forms = await db.select().from(formDefinitionsTable);
  const views = await db.select().from(viewDefinitionsTable);
  const actions = await db.select().from(actionDefinitionsTable);
  const workflows = await db.select().from(platformWorkflowsTable);
  const widgets = await db.select().from(platformWidgetsTable);
  const dashboards = await db.select().from(systemDashboardPagesTable);
  const menus = await db.select().from(systemMenuItemsTable);

  const graph = {
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      entities: entities.filter((e) => e.moduleId === m.id).map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        fieldCount: fields.filter((f) => f.entityId === e.id).length,
        formCount: forms.filter((f) => f.entityId === e.id).length,
        viewCount: views.filter((v) => v.entityId === e.id).length,
        actionCount: actions.filter((a) => a.entityId === e.id).length,
        workflowCount: workflows.filter((w) => w.moduleId === m.id).length,
      })),
    })),
    relations: relations.map((r) => ({
      id: r.id,
      source: r.sourceEntityId,
      target: r.targetEntityId,
      type: r.relationType,
      label: r.label,
    })),
    dashboards: dashboards.map((d) => ({ id: d.id, name: d.name, moduleId: d.moduleId })),
    menus: menus.map((m) => ({ id: m.id, label: m.label, moduleId: m.moduleId, entityId: m.entityId, path: m.path })),
    summary: {
      totalModules: modules.length,
      totalEntities: entities.length,
      totalRelations: relations.length,
      totalFields: fields.length,
      totalForms: forms.length,
      totalViews: views.length,
      totalActions: actions.length,
      totalWorkflows: workflows.length,
      totalWidgets: widgets.length,
      totalDashboards: dashboards.length,
      totalMenuItems: menus.length,
    },
  };

  res.json(graph);
});

export default router;
