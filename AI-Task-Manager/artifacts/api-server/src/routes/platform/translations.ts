import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformTranslationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";

const router: IRouter = Router();

router.get("/platform/translations", async (req, res) => {
  try {
    const { localeCode, namespace } = req.query;
    let query = db.select().from(platformTranslationsTable);
    const conditions = [];
    if (localeCode) conditions.push(eq(platformTranslationsTable.localeCode, String(localeCode)));
    if (namespace) conditions.push(eq(platformTranslationsTable.namespace, String(namespace)));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const translations = await query.orderBy(platformTranslationsTable.namespace, platformTranslationsTable.key);
    res.json(translations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/translations", requireSuperAdmin, async (req, res) => {
  try {
    const { localeCode, namespace, key, value } = req.body;
    if (!localeCode || !key || !value) {
      return res.status(400).json({ message: "localeCode, key, and value are required" });
    }
    const [translation] = await db.insert(platformTranslationsTable).values({
      localeCode,
      namespace: namespace || "common",
      key,
      value,
    }).returning();
    res.status(201).json(translation);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/translations/bulk", requireSuperAdmin, async (req, res) => {
  try {
    const { translations } = req.body;
    if (!Array.isArray(translations) || translations.length === 0) {
      return res.status(400).json({ message: "translations array is required" });
    }
    const inserted = await db.insert(platformTranslationsTable)
      .values(translations.map((t: any) => ({
        localeCode: t.localeCode,
        namespace: t.namespace || "common",
        key: t.key,
        value: t.value,
      })))
      .returning();
    res.status(201).json(inserted);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/translations/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { value, namespace } = req.body;
    const [translation] = await db.update(platformTranslationsTable)
      .set({
        ...(value !== undefined && { value }),
        ...(namespace !== undefined && { namespace }),
        updatedAt: new Date(),
      })
      .where(eq(platformTranslationsTable.id, id))
      .returning();
    if (!translation) return res.status(404).json({ message: "Translation not found" });
    res.json(translation);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/translations/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(platformTranslationsTable).where(eq(platformTranslationsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
