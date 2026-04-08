import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { templateDefinitionsTable, entityRecordsTable, entityFieldsTable, moduleEntitiesTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const TemplateBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  entityId: z.number().optional(),
  category: z.string().optional(),
  templateContent: z.string().optional(),
  variables: z.array(z.object({ key: z.string(), label: z.string().optional(), defaultValue: z.string().optional() })).optional(),
  styles: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/content-templates", async (_req, res) => {
  try {
    const templates = await db.select().from(templateDefinitionsTable)
      .orderBy(desc(templateDefinitionsTable.createdAt));
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/content-templates", async (req, res) => {
  try {
    const body = TemplateBody.parse(req.body);
    const [template] = await db.insert(templateDefinitionsTable).values(body).returning();
    res.status(201).json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/content-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [template] = await db.select().from(templateDefinitionsTable)
      .where(eq(templateDefinitionsTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/content-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = TemplateBody.partial().parse(req.body);
    const [template] = await db.update(templateDefinitionsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(templateDefinitionsTable.id, id))
      .returning();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/content-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(templateDefinitionsTable).where(eq(templateDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/content-templates/:id/preview", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [template] = await db.select().from(templateDefinitionsTable)
      .where(eq(templateDefinitionsTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });

    let data: Record<string, any> = req.body.data || {};
    const recordId = req.body.recordId;

    if (recordId && template.entityId) {
      const [record] = await db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.id, Number(recordId)));
      if (record && record.entityId === template.entityId) {
        const recordData = (record.data as Record<string, any>) || {};
        const fields = await db.select().from(entityFieldsTable)
          .where(eq(entityFieldsTable.entityId, template.entityId))
          .orderBy(asc(entityFieldsTable.sortOrder));

        data = { ...recordData, ...data };
        data["_record_id"] = record.id;
        data["_status"] = record.status;
        data["_created_at"] = record.createdAt;
        data["_updated_at"] = record.updatedAt;

        for (const field of fields) {
          if (recordData[field.slug] !== undefined) {
            data[field.name] = recordData[field.slug];
            if (field.nameHe) data[field.nameHe] = recordData[field.slug];
          }
        }
      }
    } else if (template.entityId && !recordId) {
      const records = await db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, template.entityId))
        .limit(1);
      if (records.length > 0) {
        const record = records[0];
        const recordData = (record.data as Record<string, any>) || {};
        const fields = await db.select().from(entityFieldsTable)
          .where(eq(entityFieldsTable.entityId, template.entityId))
          .orderBy(asc(entityFieldsTable.sortOrder));

        data = { ...recordData, ...data };
        data["_record_id"] = record.id;
        data["_status"] = record.status;

        for (const field of fields) {
          if (recordData[field.slug] !== undefined) {
            data[field.name] = recordData[field.slug];
            if (field.nameHe) data[field.nameHe] = recordData[field.slug];
          }
        }
      }
    }

    let html = template.templateContent || "";

    for (const [key, value] of Object.entries(data)) {
      const escaped = String(value ?? "");
      html = html.replace(
        new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
        escaped
      );
    }

    if (template.entityId) {
      const [entity] = await db.select().from(moduleEntitiesTable)
        .where(eq(moduleEntitiesTable.id, template.entityId));
      if (entity) {
        for (const [key, value] of Object.entries(data)) {
          const namespacedKey = `${entity.slug}.${key}`;
          const escaped = String(value ?? "");
          html = html.replace(
            new RegExp(`\\{\\{\\s*${namespacedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
            escaped
          );
        }
      }
    }

    const styles = (template.styles as Record<string, string>) || {};
    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>${template.name}</title>
  <style>
    body {
      font-family: ${styles.fontFamily || "Arial, sans-serif"};
      font-size: ${styles.fontSize || "14px"};
      color: ${styles.color || "#333"};
      direction: rtl;
      padding: 40px;
      line-height: 1.6;
    }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; }
    th { background: #f5f5f5; font-weight: bold; }
    ${styles.css || ""}
  </style>
</head>
<body>${html}</body>
</html>`;

    res.json({ html: fullHtml, data, unreplacedVars: (html.match(/\{\{[^}]+\}\}/g) || []) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
