import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { documentTemplatesTable, generatedDocumentsTable, entityRecordsTable, entityFieldsTable, moduleEntitiesTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const TemplateBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  documentType: z.string().optional(),
  entityId: z.number().optional(),
  templateContent: z.string().optional(),
  headerContent: z.string().optional(),
  footerContent: z.string().optional(),
  placeholders: z.array(z.object({ key: z.string(), label: z.string().optional(), defaultValue: z.string().optional() })).optional(),
  styles: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  pageSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sampleData: z.record(z.string(), z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/document-templates", async (_req, res) => {
  try {
    const templates = await db.select().from(documentTemplatesTable).orderBy(desc(documentTemplatesTable.createdAt));
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/document-templates", async (req, res) => {
  try {
    const body = TemplateBody.parse(req.body);
    const [template] = await db.insert(documentTemplatesTable).values(body).returning();
    res.status(201).json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/document-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [template] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/document-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = TemplateBody.partial().parse(req.body);
    const [template] = await db.update(documentTemplatesTable).set({ ...body, updatedAt: new Date() }).where(eq(documentTemplatesTable.id, id)).returning();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/document-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/document-templates/:id/generate", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [template] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });

    let data = req.body.data || {};
    const recordId = req.body.recordId;

    if (recordId && template.entityId) {
      const [record] = await db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.id, Number(recordId)));
      if (record && record.entityId !== template.entityId) {
        return res.status(400).json({ message: "Record does not belong to the template's entity" });
      }
      if (record) {
        const recordData = (record.data as Record<string, any>) || {};
        const fields = await db.select().from(entityFieldsTable)
          .where(eq(entityFieldsTable.entityId, template.entityId))
          .orderBy(asc(entityFieldsTable.sortOrder));

        const mergedData: Record<string, string> = {};
        for (const [k, v] of Object.entries(recordData)) {
          mergedData[k] = String(v ?? "");
        }
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined && v !== null && String(v) !== "") {
            mergedData[k] = String(v);
          }
        }
        data = mergedData;
        data["_record_id"] = String(record.id);
        data["_status"] = record.status || "";
        data["_created_at"] = String(record.createdAt || "");
        data["_updated_at"] = String(record.updatedAt || "");

        for (const field of fields) {
          if (recordData[field.slug] !== undefined) {
            data[field.name] = String(recordData[field.slug]);
          }
        }

        const [entity] = await db.select().from(moduleEntitiesTable)
          .where(eq(moduleEntitiesTable.id, template.entityId));
        if (entity) {
          for (const [k, v] of Object.entries(recordData)) {
            data[`${entity.slug}.${k}`] = String(v ?? "");
          }
        }
      }
    }

    let html = template.templateContent || "";
    for (const [key, value] of Object.entries(data)) {
      const escaped = String(value ?? "");
      html = html.replace(new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, "g"), escaped);
    }

    html = html.replace(/\{\{[^}]+\}\}/g, "");

    const pageSettings = (template.pageSettings as Record<string, string>) || {};
    const styles = (template.styles as Record<string, string>) || {};

    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>${template.name}</title>
  <style>
    @page {
      size: ${pageSettings.size || "A4"};
      margin: ${pageSettings.margin || "20mm"};
    }
    body {
      font-family: ${styles.fontFamily || "Arial, sans-serif"};
      font-size: ${styles.fontSize || "14px"};
      color: ${styles.color || "#333"};
      direction: rtl;
      padding: 40px;
      line-height: 1.6;
    }
    .header { margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
    .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; }
    th { background: #f5f5f5; font-weight: bold; }
    ${styles.css || ""}
  </style>
</head>
<body>
  ${template.headerContent ? `<div class="header">${template.headerContent}</div>` : ""}
  <div class="content">${html}</div>
  ${template.footerContent ? `<div class="footer">${template.footerContent}</div>` : ""}
</body>
</html>`;

    const [doc] = await db.insert(generatedDocumentsTable).values({
      templateId: id,
      recordId: recordId ? Number(recordId) : null,
      documentNumber: `DOC-${Date.now()}`,
      generatedHtml: fullHtml,
      data,
      status: "generated",
    }).returning();

    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/generated-documents", async (req, res) => {
  try {
    const templateId = req.query.templateId ? Number(req.query.templateId) : undefined;
    let query = db.select().from(generatedDocumentsTable).$dynamic();
    if (templateId) {
      query = query.where(eq(generatedDocumentsTable.templateId, templateId));
    }
    const docs = await query.orderBy(desc(generatedDocumentsTable.createdAt));
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/generated-documents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [doc] = await db.select().from(generatedDocumentsTable).where(eq(generatedDocumentsTable.id, id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/generated-documents/:id/html", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [doc] = await db.select().from(generatedDocumentsTable).where(eq(generatedDocumentsTable.id, id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(doc.generatedHtml || "");
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
