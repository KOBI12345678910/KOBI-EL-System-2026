import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformModulesTable, moduleEntitiesTable, entityFieldsTable } from "@workspace/db/schema";
import { eq, asc, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { checkModuleAccess } from "../../lib/permission-engine";
import { requireBuilderAccess } from "../../lib/permission-middleware";
import { getPlatformModules, invalidatePlatformModules, invalidateEntityModuleMapping, invalidateAllEntityModuleMappings } from "../../lib/metadata-cache";

const router: IRouter = Router();

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return slug || `module_${Date.now()}`;
}

const CreateModuleBody = z.object({
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().min(1).optional(),
  moduleKey: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  category: z.string().optional(),
  parentModuleId: z.number().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  isSystem: z.boolean().optional(),
  showInSidebar: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  permissionsScope: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateModuleBody = CreateModuleBody.partial().extend({
  status: z.enum(["draft", "published", "archived"]).optional(),
});

router.get("/platform/modules", async (req, res) => {
  try {
    const modules = await Promise.race([
      getPlatformModules(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getPlatformModules timeout")), 4000)
      ),
    ]);
    const permissions = req.permissions;
    if (permissions && !permissions.isSuperAdmin) {
      const filtered = modules.filter(m => checkModuleAccess(permissions, m.id, "view"));
      return res.json(filtered);
    }
    res.json(modules);
  } catch (err: any) {
    const isTimeout = err.message?.includes("timeout");
    res.status(isTimeout ? 504 : 500).json({ message: err.message });
  }
});

router.post("/platform/modules", requireBuilderAccess, async (req, res) => {
  try {
    const rawBody = { ...req.body };
    if (rawBody.name && !rawBody.slug) rawBody.slug = toSlug(rawBody.name);
    const body = CreateModuleBody.parse(rawBody);
    if (body.moduleKey === "") body.moduleKey = undefined;
    if (body.moduleKey) {
      const [existing] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.moduleKey, body.moduleKey));
      if (existing) return res.status(409).json({ message: `module_key '${body.moduleKey}' already exists` });
    }
    const [mod] = await db.insert(platformModulesTable).values(body).returning();
    invalidatePlatformModules();
    res.status(201).json(mod);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated: slug or module_key already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/modules/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, id));
    if (!mod) return res.status(404).json({ message: "Module not found" });
    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, id)).orderBy(asc(moduleEntitiesTable.sortOrder));
    res.json({ ...mod, entities });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/modules/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateModuleBody.parse(req.body);
    if (body.moduleKey === "") body.moduleKey = undefined;
    if (body.moduleKey) {
      const [existing] = await db.select().from(platformModulesTable).where(and(eq(platformModulesTable.moduleKey, body.moduleKey), ne(platformModulesTable.id, id)));
      if (existing) return res.status(409).json({ message: `module_key '${body.moduleKey}' already exists` });
    }
    const [mod] = await db.update(platformModulesTable).set({ ...body, updatedAt: new Date() }).where(eq(platformModulesTable.id, id)).returning();
    if (!mod) return res.status(404).json({ message: "Module not found" });
    invalidatePlatformModules();
    if (body.slug !== undefined) invalidateAllEntityModuleMappings();
    res.json(mod);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated" });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/modules/:id/publish", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [mod] = await db.update(platformModulesTable).set({ status: "published", updatedAt: new Date() }).where(eq(platformModulesTable.id, id)).returning();
    if (!mod) return res.status(404).json({ message: "Module not found" });
    invalidatePlatformModules();
    res.json(mod);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/modules/check-slug/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    let query = db.select({ id: platformModulesTable.id }).from(platformModulesTable).where(eq(platformModulesTable.slug, slug));
    const results = await query;
    const exists = excludeId ? results.some(r => r.id !== excludeId) : results.length > 0;
    res.json({ exists, slug });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/modules/:id/clone", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [original] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, id));
    if (!original) return res.status(404).json({ message: "Module not found" });

    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, id)).orderBy(asc(moduleEntitiesTable.sortOrder));

    const timestamp = Date.now();
    const newSlug = `${original.slug}-copy-${timestamp}`;
    const newModuleKey = original.moduleKey ? `${original.moduleKey}-copy-${timestamp}` : undefined;

    const result = await db.transaction(async (tx) => {
      const [newModule] = await tx.insert(platformModulesTable).values({
        name: `${original.name} (עותק)`,
        nameHe: original.nameHe ? `${original.nameHe} (עותק)` : null,
        nameEn: original.nameEn ? `${original.nameEn} (Copy)` : null,
        slug: newSlug,
        moduleKey: newModuleKey,
        description: original.description,
        icon: original.icon,
        color: original.color,
        category: original.category,
        parentModuleId: original.parentModuleId,
        status: "draft",
        version: 1,
        settings: original.settings,
        sortOrder: original.sortOrder + 1,
        isSystem: false,
        showInSidebar: original.showInSidebar,
        showInDashboard: original.showInDashboard,
        permissionsScope: original.permissionsScope,
        notes: original.notes,
      }).returning();

      const entityIdMap: Record<number, number> = {};

      for (const entity of entities) {
        const entitySlug = `${entity.slug}-copy-${timestamp}`;
        const entityKey = entity.entityKey ? `${entity.entityKey}-copy-${timestamp}` : undefined;
        const entityTableName = entity.tableName ? `${entity.tableName}_copy_${timestamp}` : undefined;

        const [newEntity] = await tx.insert(moduleEntitiesTable).values({
          moduleId: newModule.id,
          name: entity.name,
          nameHe: entity.nameHe,
          nameEn: entity.nameEn,
          namePlural: entity.namePlural,
          slug: entitySlug,
          entityKey: entityKey,
          tableName: entityTableName,
          description: entity.description,
          icon: entity.icon,
          entityType: entity.entityType,
          primaryDisplayField: entity.primaryDisplayField,
          settings: entity.settings,
          sortOrder: entity.sortOrder,
          hasStatus: entity.hasStatus,
          hasCategories: entity.hasCategories,
          hasAttachments: entity.hasAttachments,
          hasNotes: entity.hasNotes,
          hasOwner: entity.hasOwner,
          hasNumbering: entity.hasNumbering,
          hasCreatedUpdated: entity.hasCreatedUpdated,
          hasSoftDelete: entity.hasSoftDelete,
          hasAudit: entity.hasAudit,
        }).returning();

        entityIdMap[entity.id] = newEntity.id;
      }

      for (const entity of entities) {
        const fields = await tx.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id)).orderBy(asc(entityFieldsTable.sortOrder));
        const newEntityId = entityIdMap[entity.id];

        for (const field of fields) {
          const remappedRelatedEntityId = field.relatedEntityId && entityIdMap[field.relatedEntityId]
            ? entityIdMap[field.relatedEntityId]
            : field.relatedEntityId;

          await tx.insert(entityFieldsTable).values({
            entityId: newEntityId,
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
            relatedEntityId: remappedRelatedEntityId,
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
          });
        }
      }

      const newEntities = await tx.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, newModule.id)).orderBy(asc(moduleEntitiesTable.sortOrder));
      return { ...newModule, entities: newEntities };
    });

    invalidatePlatformModules();
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/modules/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(platformModulesTable).where(eq(platformModulesTable.id, id));
    invalidatePlatformModules();
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
