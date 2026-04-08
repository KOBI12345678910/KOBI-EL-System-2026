import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
  systemFormSectionsTable,
  systemFormFieldsTable,
  systemViewColumnsTable,
} from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod/v4";
import {
  validateModuleForPublish,
  validateEntity,
  detectConflicts,
} from "../../services/claude/validation-engine";

const router: IRouter = Router();

const PreviewModuleBody = z.object({
  moduleId: z.number(),
});

const PreviewEntityBody = z.object({
  entityId: z.number(),
});

const DryRunPublishBody = z.object({
  entityType: z.enum(["module", "entity"]),
  entityId: z.number(),
});

router.post("/claude/preview/module-impact", async (req, res) => {
  try {
    const body = PreviewModuleBody.parse(req.body);

    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.moduleId));
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, body.moduleId));
    const entityIds = entities.map(e => e.id);

    let totalFields = 0;
    let totalViews = 0;
    let totalForms = 0;
    let totalActions = 0;
    let totalRelations = 0;
    let totalStatuses = 0;

    for (const eid of entityIds) {
      const [fc] = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.entityId, eid));
      totalFields += Number(fc.count);
      const [vc] = await db.select({ count: count() }).from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, eid));
      totalViews += Number(vc.count);
      const [fmc] = await db.select({ count: count() }).from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, eid));
      totalForms += Number(fmc.count);
      const [ac] = await db.select({ count: count() }).from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, eid));
      totalActions += Number(ac.count);
      const [rc] = await db.select({ count: count() }).from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, eid));
      totalRelations += Number(rc.count);
      const [sc] = await db.select({ count: count() }).from(entityStatusesTable).where(eq(entityStatusesTable.entityId, eid));
      totalStatuses += Number(sc.count);
    }

    const crossModuleRelations = [];
    for (const eid of entityIds) {
      const rels = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, eid));
      for (const rel of rels) {
        if (!entityIds.includes(rel.targetEntityId)) {
          const [targetEntity] = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, rel.targetEntityId));
          if (targetEntity) {
            crossModuleRelations.push({
              relationId: rel.id,
              sourceEntityId: rel.sourceEntityId,
              targetEntityId: rel.targetEntityId,
              targetEntityName: targetEntity.name,
              targetModuleId: targetEntity.moduleId,
              relationType: rel.relationType,
            });
          }
        }
      }
    }

    const validation = await validateModuleForPublish(body.moduleId);

    res.json({
      module: { id: mod.id, name: mod.name, slug: mod.slug, status: mod.status, version: mod.version },
      scope: {
        entityCount: entities.length,
        totalFields,
        totalViews,
        totalForms,
        totalActions,
        totalRelations,
        totalStatuses,
      },
      entities: entities.map(e => ({ id: e.id, name: e.name, slug: e.slug, entityType: e.entityType })),
      crossModuleDependencies: crossModuleRelations,
      validation,
      impact: {
        willPublish: validation.valid,
        affectedEntities: entities.length,
        crossModuleImpact: crossModuleRelations.length > 0,
        warnings: validation.issues.filter(i => i.severity === "warning").length,
        errors: validation.issues.filter(i => i.severity === "error").length,
      },
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/preview/entity-impact", async (req, res) => {
  try {
    const body = PreviewEntityBody.parse(req.body);

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, body.entityId));
    const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, body.entityId));
    const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, body.entityId));
    const actions = await db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, body.entityId));
    const outgoingRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, body.entityId));
    const incomingRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.targetEntityId, body.entityId));
    const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, body.entityId));

    const lookupFields = fields.filter(f => f.relatedEntityId);
    const dependedByFields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.relatedEntityId, body.entityId));

    const entityIssues = await validateEntity(body.entityId);
    const conflicts = await detectConflicts("entity", body.entityId);

    res.json({
      entity: { id: entity.id, name: entity.name, slug: entity.slug, moduleId: entity.moduleId, entityType: entity.entityType },
      components: {
        fields: fields.map(f => ({ id: f.id, name: f.name, slug: f.slug, fieldType: f.fieldType, isRequired: f.isRequired })),
        views: views.map(v => ({ id: v.id, name: v.name, viewType: v.viewType, isDefault: v.isDefault })),
        forms: forms.map(f => ({ id: f.id, name: f.name, formType: f.formType, isDefault: f.isDefault })),
        actions: actions.map(a => ({ id: a.id, name: a.name })),
        statuses: statuses.map(s => ({ id: s.id, name: s.name, slug: s.slug, color: s.color })),
      },
      dependencies: {
        lookupFields: lookupFields.map(f => ({ fieldId: f.id, fieldName: f.name, targetEntityId: f.relatedEntityId })),
        outgoingRelations: outgoingRelations.map(r => ({ id: r.id, targetEntityId: r.targetEntityId, relationType: r.relationType, label: r.label })),
        incomingRelations: incomingRelations.map(r => ({ id: r.id, sourceEntityId: r.sourceEntityId, relationType: r.relationType, label: r.reverseLabel })),
        dependedByLookups: dependedByFields.map(f => ({ fieldId: f.id, fieldName: f.name, sourceEntityId: f.entityId })),
      },
      validation: {
        valid: entityIssues.filter(i => i.severity === "error").length === 0,
        issues: entityIssues,
      },
      conflicts,
      impact: {
        totalComponents: fields.length + views.length + forms.length + actions.length + statuses.length,
        dependencyCount: lookupFields.length + outgoingRelations.length + incomingRelations.length + dependedByFields.length,
        isDepended: incomingRelations.length > 0 || dependedByFields.length > 0,
      },
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/preview/form-impact", async (req, res) => {
  try {
    const body = z.object({ formId: z.number() }).parse(req.body);

    const [form] = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.id, body.formId));
    if (!form) return res.status(404).json({ message: "Form not found" });

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, form.entityId));
    const allFields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, form.entityId));
    const sections = await db.select().from(systemFormSectionsTable).where(eq(systemFormSectionsTable.formId, body.formId));
    const formFields = await db.select().from(systemFormFieldsTable);

    const sectionIds = sections.map(s => s.id);
    const assignedFormFields = formFields.filter(ff => sectionIds.includes(ff.sectionId));
    const assignedFieldIds = new Set(assignedFormFields.map(ff => ff.fieldId));
    const unassignedFields = allFields.filter(f => !assignedFieldIds.has(f.id) && f.showInForm);

    res.json({
      form: { id: form.id, name: form.name, formType: form.formType, isDefault: form.isDefault },
      entity: entity ? { id: entity.id, name: entity.name, slug: entity.slug } : null,
      sections: sections.map(s => ({
        id: s.id,
        name: s.name,
        fieldCount: assignedFormFields.filter(ff => ff.sectionId === s.id).length,
      })),
      assignedFieldCount: assignedFieldIds.size,
      totalEntityFields: allFields.length,
      unassignedFields: unassignedFields.map(f => ({ id: f.id, name: f.name, slug: f.slug, fieldType: f.fieldType })),
      coverage: allFields.length > 0 ? Math.round((assignedFieldIds.size / allFields.length) * 100) : 0,
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/preview/view-impact", async (req, res) => {
  try {
    const body = z.object({ viewId: z.number() }).parse(req.body);

    const [view] = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.id, body.viewId));
    if (!view) return res.status(404).json({ message: "View not found" });

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, view.entityId));
    const allFields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, view.entityId));
    const viewColumns = await db.select().from(systemViewColumnsTable).where(eq(systemViewColumnsTable.viewId, body.viewId));

    const columnFieldIds = new Set(viewColumns.map(vc => vc.fieldId));
    const unmappedFields = allFields.filter(f => !columnFieldIds.has(f.id) && f.showInList);

    res.json({
      view: { id: view.id, name: view.name, viewType: view.viewType, isDefault: view.isDefault },
      entity: entity ? { id: entity.id, name: entity.name, slug: entity.slug } : null,
      columnCount: viewColumns.length,
      totalEntityFields: allFields.length,
      unmappedFields: unmappedFields.map(f => ({ id: f.id, name: f.name, slug: f.slug, fieldType: f.fieldType })),
      coverage: allFields.length > 0 ? Math.round((columnFieldIds.size / allFields.length) * 100) : 0,
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/preview/dependency-impact", async (req, res) => {
  try {
    const body = PreviewEntityBody.parse(req.body);

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    const outgoingRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, body.entityId));
    const incomingRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.targetEntityId, body.entityId));
    const lookupFieldsOut = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, body.entityId));
    const lookupFieldsIn = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.relatedEntityId, body.entityId));

    const affectedEntityIds = new Set<number>();
    for (const r of outgoingRelations) affectedEntityIds.add(r.targetEntityId);
    for (const r of incomingRelations) affectedEntityIds.add(r.sourceEntityId);
    for (const f of lookupFieldsOut.filter(f => f.relatedEntityId)) affectedEntityIds.add(f.relatedEntityId!);
    for (const f of lookupFieldsIn) affectedEntityIds.add(f.entityId);
    affectedEntityIds.delete(body.entityId);

    const affectedEntities = [];
    for (const id of affectedEntityIds) {
      const [e] = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
      if (e) affectedEntities.push(e);
    }

    const cascadeDeleteRelations = [...outgoingRelations, ...incomingRelations].filter(r => r.cascadeDelete);

    res.json({
      entity: { id: entity.id, name: entity.name, slug: entity.slug },
      affectedEntities,
      cascadeDeleteRisk: cascadeDeleteRelations.map(r => ({
        relationId: r.id,
        relationType: r.relationType,
        sourceEntityId: r.sourceEntityId,
        targetEntityId: r.targetEntityId,
      })),
      totalAffected: affectedEntities.length,
      hasCascadeRisk: cascadeDeleteRelations.length > 0,
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/preview/dry-run-publish", async (req, res) => {
  try {
    const body = DryRunPublishBody.parse(req.body);

    let validation;
    let conflicts;
    let currentState: any = null;
    let projectedState: any = null;

    if (body.entityType === "module") {
      validation = await validateModuleForPublish(body.entityId);
      conflicts = await detectConflicts("module", body.entityId);

      const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.entityId));
      if (!mod) return res.status(404).json({ message: "Module not found" });

      currentState = { status: mod.status, version: mod.version };
      projectedState = { status: "published", version: mod.version + 1 };
    } else {
      const issues = await validateEntity(body.entityId);
      validation = { valid: issues.filter(i => i.severity === "error").length === 0, issues, checkedAt: new Date().toISOString() };
      conflicts = await detectConflicts("entity", body.entityId);

      const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
      if (!entity) return res.status(404).json({ message: "Entity not found" });

      currentState = { name: entity.name, slug: entity.slug, isActive: entity.isActive };
      projectedState = { ...currentState };
    }

    res.json({
      dryRun: true,
      wouldPublish: validation.valid,
      entityType: body.entityType,
      entityId: body.entityId,
      currentState,
      projectedState,
      validation,
      conflicts,
      blockers: validation.issues.filter(i => i.severity === "error"),
      warnings: validation.issues.filter(i => i.severity === "warning"),
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
