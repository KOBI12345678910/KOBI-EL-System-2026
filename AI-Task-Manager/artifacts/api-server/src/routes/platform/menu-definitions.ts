import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { menuDefinitionsTable, systemMenuItemsTable, platformModulesTable, moduleEntitiesTable } from "@workspace/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";

const router: IRouter = Router();

router.get("/platform/menu-definitions", async (_req, res) => {
  try {
    const definitions = await db.select().from(menuDefinitionsTable).orderBy(menuDefinitionsTable.name);
    res.json(definitions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/menu-definitions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [definition] = await db.select().from(menuDefinitionsTable).where(eq(menuDefinitionsTable.id, id));
    if (!definition) return res.status(404).json({ message: "Menu definition not found" });
    res.json(definition);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/menu-definitions", requireSuperAdmin, async (req, res) => {
  try {
    const { name, nameHe, nameEn, slug, description, isDefault, isActive, settings } = req.body;
    if (!name || !slug) return res.status(400).json({ message: "name and slug are required" });
    if (isDefault) {
      await db.update(menuDefinitionsTable).set({ isDefault: false });
    }
    const [definition] = await db.insert(menuDefinitionsTable).values({
      name, nameHe, nameEn, slug, description,
      isDefault: isDefault || false,
      isActive: isActive !== false,
      settings: settings || {},
    }).returning();
    res.status(201).json(definition);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/menu-definitions/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, nameHe, nameEn, slug, description, isDefault, isActive, settings } = req.body;
    if (isDefault) {
      await db.update(menuDefinitionsTable).set({ isDefault: false });
    }
    const [definition] = await db.update(menuDefinitionsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(nameHe !== undefined && { nameHe }),
        ...(nameEn !== undefined && { nameEn }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
        ...(settings !== undefined && { settings }),
        updatedAt: new Date(),
      })
      .where(eq(menuDefinitionsTable.id, id))
      .returning();
    if (!definition) return res.status(404).json({ message: "Menu definition not found" });
    res.json(definition);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/menu-definitions/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [definition] = await db.select().from(menuDefinitionsTable).where(eq(menuDefinitionsTable.id, id));
    if (!definition) return res.status(404).json({ message: "Menu definition not found" });
    if (definition.isDefault) return res.status(400).json({ message: "Cannot delete default menu definition" });
    await db.delete(menuDefinitionsTable).where(eq(menuDefinitionsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/menu-definitions/auto-generate", requireSuperAdmin, async (_req, res) => {
  try {
    const modules = await db.select().from(platformModulesTable).orderBy(platformModulesTable.sortOrder);
    const entities = await db.select().from(moduleEntitiesTable);
    const existingItems = await db.select().from(systemMenuItemsTable);

    const existingModuleIds = new Set(existingItems.filter(i => i.moduleId && !i.entityId).map(i => i.moduleId));
    const existingEntityIds = new Set(existingItems.filter(i => i.entityId).map(i => i.entityId));

    const maxSortOrder = existingItems.reduce((max, i) => Math.max(max, i.sortOrder), 0);
    let sortOrder = maxSortOrder + 1;

    const newItems: any[] = [];

    for (const mod of modules) {
      if (mod.status !== "published") continue;

      if (!existingModuleIds.has(mod.id)) {
        newItems.push({
          moduleId: mod.id,
          entityId: null,
          parentId: null,
          label: mod.nameHe || mod.name,
          labelHe: mod.nameHe || mod.name,
          labelEn: mod.nameEn || mod.name,
          icon: mod.icon || "Box",
          path: `/${mod.slug}`,
          section: mod.category || "main",
          roles: [],
          sortOrder: sortOrder++,
          isActive: true,
          settings: {},
        });
      }

      const moduleEntities = entities.filter(e => e.moduleId === mod.id);
      for (const entity of moduleEntities) {
        if (!existingEntityIds.has(entity.id)) {
          newItems.push({
            moduleId: mod.id,
            entityId: entity.id,
            parentId: null,
            label: (entity as any).nameHe || entity.name,
            labelHe: (entity as any).nameHe || entity.name,
            labelEn: (entity as any).nameEn || entity.name,
            icon: (entity as any).icon || "FileText",
            path: `/builder/data/${entity.id}`,
            section: mod.category || "main",
            roles: [],
            sortOrder: sortOrder++,
            isActive: true,
            settings: {},
          });
        }
      }
    }

    if (newItems.length > 0) {
      const inserted = await db.insert(systemMenuItemsTable).values(newItems).returning();
      res.json({ message: `נוצרו ${inserted.length} פריטי תפריט חדשים (${existingItems.length} קיימים דולגו)`, items: inserted });
    } else {
      res.json({ message: "כל המודולים כבר קיימים בתפריט — אין פריטים חדשים ליצירה", items: [] });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
