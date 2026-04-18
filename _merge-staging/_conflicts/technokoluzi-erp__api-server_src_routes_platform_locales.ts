import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformLocalesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";

const router: IRouter = Router();

router.get("/platform/locales", async (_req, res) => {
  try {
    const locales = await db.select().from(platformLocalesTable).orderBy(platformLocalesTable.sortOrder);
    res.json(locales);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/locales", requireSuperAdmin, async (req, res) => {
  try {
    const { code, name, nativeName, direction, isDefault, isActive, sortOrder } = req.body;
    if (!code || !name || !nativeName) {
      return res.status(400).json({ message: "code, name, and nativeName are required" });
    }
    if (isDefault) {
      await db.update(platformLocalesTable).set({ isDefault: false });
    }
    const [locale] = await db.insert(platformLocalesTable).values({
      code,
      name,
      nativeName,
      direction: direction || "ltr",
      isDefault: isDefault || false,
      isActive: isActive !== false,
      sortOrder: sortOrder || 0,
    }).returning();
    res.status(201).json(locale);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/locales/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, nativeName, direction, isDefault, isActive, sortOrder } = req.body;
    if (isDefault) {
      await db.update(platformLocalesTable).set({ isDefault: false });
    }
    const [locale] = await db.update(platformLocalesTable)
      .set({
        ...(name !== undefined && { name }),
        ...(nativeName !== undefined && { nativeName }),
        ...(direction !== undefined && { direction }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
      })
      .where(eq(platformLocalesTable.id, id))
      .returning();
    if (!locale) return res.status(404).json({ message: "Locale not found" });
    res.json(locale);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/locales/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [locale] = await db.select().from(platformLocalesTable).where(eq(platformLocalesTable.id, id));
    if (!locale) return res.status(404).json({ message: "Locale not found" });
    if (locale.isDefault) return res.status(400).json({ message: "Cannot delete default locale" });
    await db.delete(platformLocalesTable).where(eq(platformLocalesTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
