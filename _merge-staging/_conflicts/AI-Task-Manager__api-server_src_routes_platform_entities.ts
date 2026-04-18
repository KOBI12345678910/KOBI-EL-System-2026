import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { moduleEntitiesTable, entityFieldsTable, entityStatusesTable } from "@workspace/db/schema";
import { eq, and, asc, ne, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireBuilderAccess } from "../../lib/permission-middleware";
import { invalidateEntityModuleMapping, invalidateEntityFields } from "../../lib/metadata-cache";

const router: IRouter = Router();

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return slug || `entity_${Date.now()}`;
}

const CreateEntityBody = z.object({
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  namePlural: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  entityKey: z.string().optional(),
  tableName: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  entityType: z.enum(["master", "transaction", "child", "reference", "log", "system", "document", "analytics"]).optional(),
  primaryDisplayField: z.string().optional(),
  parentEntityId: z.number().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  hasStatus: z.boolean().optional(),
  hasCategories: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  hasNotes: z.boolean().optional(),
  hasOwner: z.boolean().optional(),
  hasNumbering: z.boolean().optional(),
  hasCreatedUpdated: z.boolean().optional(),
  hasSoftDelete: z.boolean().optional(),
  hasAudit: z.boolean().optional(),
});

const UpdateEntityBody = CreateEntityBody.partial().extend({
  isActive: z.boolean().optional(),
});

router.get("/platform/entities", async (req: any, res) => {
  if (!req.permissions) return res.status(401).json({ message: "Authentication required" });
  try {
    const entities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      nameHe: moduleEntitiesTable.nameHe,
      nameEn: moduleEntitiesTable.nameEn,
      namePlural: moduleEntitiesTable.namePlural,
      slug: moduleEntitiesTable.slug,
      entityType: moduleEntitiesTable.entityType,
      isActive: moduleEntitiesTable.isActive,
      sortOrder: moduleEntitiesTable.sortOrder,
    }).from(moduleEntitiesTable)
      .where(ne(moduleEntitiesTable.isActive, false))
      .orderBy(asc(moduleEntitiesTable.sortOrder));
    res.json(entities);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/slug-map", async (req, res) => {
  try {
    const entities = await Promise.race([
      db.select({
        id: moduleEntitiesTable.id,
        slug: moduleEntitiesTable.slug,
      }).from(moduleEntitiesTable),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), 8000)
      ),
    ]);
    const map: Record<string, number> = {};
    for (const e of entities) {
      map[e.slug] = e.id;
    }
    res.json(map);
  } catch (err: any) {
    const isTimeout = err.message?.includes("timeout");
    res.status(isTimeout ? 504 : 500).json({ message: err.message });
  }
});

router.get("/platform/modules/:moduleId/entities", async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const entities = await Promise.race([
      db.select().from(moduleEntitiesTable)
        .where(eq(moduleEntitiesTable.moduleId, moduleId))
        .orderBy(asc(moduleEntitiesTable.sortOrder)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), 8000)
      ),
    ]);
    res.json(entities);
  } catch (err: any) {
    const isTimeout = err.message?.includes("timeout");
    res.status(isTimeout ? 504 : 500).json({ message: err.message });
  }
});

router.post("/platform/modules/:moduleId/entities", requireBuilderAccess, async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const rawBody = { ...req.body };
    if (rawBody.name && !rawBody.slug) rawBody.slug = toSlug(rawBody.name);
    if (rawBody.name && !rawBody.namePlural) rawBody.namePlural = rawBody.name + "s";
    const body = CreateEntityBody.parse(rawBody);
    if (body.entityKey === "") body.entityKey = undefined;
    if (body.tableName === "") body.tableName = undefined;
    if (body.entityKey) {
      const [existing] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.entityKey, body.entityKey));
      if (existing) return res.status(409).json({ message: `entity_key '${body.entityKey}' already exists` });
    }
    if (body.tableName) {
      const [existing] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.tableName, body.tableName));
      if (existing) return res.status(409).json({ message: `table_name '${body.tableName}' already exists` });
    }
    const [entity] = await db.insert(moduleEntitiesTable).values({ ...body, moduleId }).returning();
    invalidateEntityModuleMapping(entity.id);
    res.status(201).json(entity);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated: entity_key or table_name already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/entities/reorder", requireBuilderAccess, async (req, res) => {
  try {
    const { items, moduleId } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items array required" });
    if (items.length === 0) return res.json({ success: true });
    const ids: number[] = items.map((i: any) => Number(i.id));
    if (moduleId) {
      const entities = await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)
        .where(and(eq(moduleEntitiesTable.moduleId, Number(moduleId)), inArray(moduleEntitiesTable.id, ids)));
      if (entities.length !== ids.length) return res.status(400).json({ message: "Some entities do not belong to the specified module" });
    }
    const whenClauses = items.map((i: any) => sql`WHEN ${Number(i.id)} THEN ${Number(i.sortOrder)}`);
    await db.update(moduleEntitiesTable)
      .set({
        sortOrder: sql`CASE id ${sql.join(whenClauses, sql` `)} END`,
        updatedAt: new Date(),
      })
      .where(inArray(moduleEntitiesTable.id, ids));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[entity], fields, statuses] = await Promise.all([
      db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id)),
      db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, id)).orderBy(asc(entityFieldsTable.sortOrder)),
      db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, id)).orderBy(asc(entityStatusesTable.sortOrder)),
    ]);
    if (!entity) return res.status(404).json({ message: "Entity not found" });
    res.json({ ...entity, fields, statuses });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/entities/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateEntityBody.parse(req.body);
    if (body.entityKey === "") body.entityKey = undefined;
    if (body.tableName === "") body.tableName = undefined;
    if (body.entityKey) {
      const [existing] = await db.select().from(moduleEntitiesTable).where(and(eq(moduleEntitiesTable.entityKey, body.entityKey), ne(moduleEntitiesTable.id, id)));
      if (existing) return res.status(409).json({ message: `entity_key '${body.entityKey}' already exists` });
    }
    if (body.tableName) {
      const [existing] = await db.select().from(moduleEntitiesTable).where(and(eq(moduleEntitiesTable.tableName, body.tableName), ne(moduleEntitiesTable.id, id)));
      if (existing) return res.status(409).json({ message: `table_name '${body.tableName}' already exists` });
    }
    const [entity] = await db.update(moduleEntitiesTable).set({ ...body, updatedAt: new Date() }).where(eq(moduleEntitiesTable.id, id)).returning();
    if (!entity) return res.status(404).json({ message: "Entity not found" });
    invalidateEntityModuleMapping(id);
    res.json(entity);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated" });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:id/clone", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [original] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
    if (!original) return res.status(404).json({ message: "Entity not found" });

    const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, id)).orderBy(asc(entityFieldsTable.sortOrder));
    const timestamp = Date.now();

    const result = await db.transaction(async (tx) => {
      const [newEntity] = await tx.insert(moduleEntitiesTable).values({
        moduleId: original.moduleId,
        name: `${original.name} (עותק)`,
        nameHe: original.nameHe ? `${original.nameHe} (עותק)` : null,
        nameEn: original.nameEn ? `${original.nameEn} (Copy)` : null,
        namePlural: `${original.namePlural} (עותק)`,
        slug: `${original.slug}-copy-${timestamp}`,
        entityKey: original.entityKey ? `${original.entityKey}-copy-${timestamp}` : undefined,
        tableName: original.tableName ? `${original.tableName}_copy_${timestamp}` : undefined,
        description: original.description,
        icon: original.icon,
        entityType: original.entityType,
        primaryDisplayField: original.primaryDisplayField,
        settings: original.settings,
        sortOrder: original.sortOrder + 1,
        hasStatus: original.hasStatus,
        hasCategories: original.hasCategories,
        hasAttachments: original.hasAttachments,
        hasNotes: original.hasNotes,
        hasOwner: original.hasOwner,
        hasNumbering: original.hasNumbering,
        hasCreatedUpdated: original.hasCreatedUpdated,
        hasSoftDelete: original.hasSoftDelete,
        hasAudit: original.hasAudit,
      }).returning();

      if (fields.length > 0) {
        await tx.insert(entityFieldsTable).values(
          fields.map(field => ({
            entityId: newEntity.id,
            name: field.name,
            nameHe: field.nameHe,
            nameEn: field.nameEn,
            slug: field.slug,
            fieldKey: field.fieldKey ? `${field.fieldKey}-${timestamp}` : null,
            fieldType: field.fieldType,
            groupName: field.groupName,
            description: field.description,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            isUnique: field.isUnique,
            isSearchable: field.isSearchable,
            isSortable: field.isSortable,
            isFilterable: field.isFilterable,
            isReadOnly: field.isReadOnly,
            isSystemField: field.isSystemField,
            isCalculated: field.isCalculated,
            formulaExpression: field.formulaExpression,
            showInList: field.showInList,
            showInForm: field.showInForm,
            showInDetail: field.showInDetail,
            defaultValue: field.defaultValue,
            validationRules: field.validationRules,
            displayRules: field.displayRules,
            options: field.options,
            optionsJson: field.optionsJson,
            relatedEntityId: field.relatedEntityId,
            relatedDisplayField: field.relatedDisplayField,
            relationType: field.relationType,
            sortOrder: field.sortOrder,
            fieldWidth: field.fieldWidth,
            settings: field.settings,
            minValue: field.minValue,
            maxValue: field.maxValue,
            maxLength: field.maxLength,
            sectionKey: field.sectionKey,
            tabKey: field.tabKey,
          }))
        );
      }

      const newFields = await tx.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, newEntity.id)).orderBy(asc(entityFieldsTable.sortOrder));
      return { ...newEntity, fields: newFields };
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/entities/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
    invalidateEntityModuleMapping(id);
    invalidateEntityFields(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
