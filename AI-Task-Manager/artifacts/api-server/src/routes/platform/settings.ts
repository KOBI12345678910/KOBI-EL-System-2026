import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";

const router: IRouter = Router();

router.get("/platform/settings", async (_req, res) => {
  try {
    const settings = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.category, platformSettingsTable.key);
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/settings/:key", async (req, res) => {
  try {
    const [setting] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, req.params.key));
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    res.json(setting);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/settings", requireSuperAdmin, async (req, res) => {
  try {
    const { key, value, valueJson, category, description, isSystem } = req.body;
    if (!key) return res.status(400).json({ message: "key is required" });
    const [setting] = await db.insert(platformSettingsTable).values({
      key,
      value: value || null,
      valueJson: valueJson || null,
      category: category || "general",
      description: description || null,
      isSystem: isSystem || false,
    }).returning();
    res.status(201).json(setting);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/settings/:key", requireSuperAdmin, async (req, res) => {
  try {
    const { value, valueJson, category, description } = req.body;
    const [setting] = await db.update(platformSettingsTable)
      .set({
        value: value !== undefined ? value : undefined,
        valueJson: valueJson !== undefined ? valueJson : undefined,
        category: category !== undefined ? category : undefined,
        description: description !== undefined ? description : undefined,
        updatedAt: new Date(),
      })
      .where(eq(platformSettingsTable.key, req.params.key))
      .returning();
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    res.json(setting);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/settings/:key", requireSuperAdmin, async (req, res) => {
  try {
    const [setting] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, req.params.key));
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    if (setting.isSystem) return res.status(403).json({ message: "Cannot delete system setting" });
    await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, req.params.key));
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
