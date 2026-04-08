import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { emailTemplatesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/email-templates", async (req, res) => {
  try {
    const templates = await db
      .select()
      .from(emailTemplatesTable)
      .orderBy(desc(emailTemplatesTable.createdAt));
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/email-templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [template] = await db
      .select()
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/email-templates", async (req, res) => {
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { name, category, subject, bodyHtml, bodyText, isRtl, variables, attachmentConfig } = req.body;
    if (!name || !subject || !bodyHtml) {
      return res.status(400).json({ message: "name, subject, and bodyHtml are required" });
    }
    const [template] = await db
      .insert(emailTemplatesTable)
      .values({
        name,
        category: category || "system",
        subject,
        bodyHtml,
        bodyText: bodyText || null,
        isRtl: isRtl !== false,
        variables: variables || [],
        attachmentConfig: attachmentConfig || null,
      })
      .returning();
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/email-templates/:id", async (req, res) => {
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const id = Number(req.params.id);
    const { name, category, subject, bodyHtml, bodyText, isRtl, variables, attachmentConfig, isActive } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (subject !== undefined) updates.subject = subject;
    if (bodyHtml !== undefined) updates.bodyHtml = bodyHtml;
    if (bodyText !== undefined) updates.bodyText = bodyText;
    if (isRtl !== undefined) updates.isRtl = isRtl;
    if (variables !== undefined) updates.variables = variables;
    if (attachmentConfig !== undefined) updates.attachmentConfig = attachmentConfig;
    if (isActive !== undefined) updates.isActive = isActive;

    const [template] = await db
      .update(emailTemplatesTable)
      .set(updates as any)
      .where(eq(emailTemplatesTable.id, id))
      .returning();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/email-templates/:id", async (req, res) => {
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const id = Number(req.params.id);
    await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/email-templates/:id/preview", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { variables: vars = {} } = req.body;
    const [template] = await db
      .select()
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, id));
    if (!template) return res.status(404).json({ message: "Template not found" });

    let subject = template.subject;
    let bodyHtml = template.bodyHtml;

    for (const [key, value] of Object.entries(vars)) {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      subject = subject.replace(placeholder, String(value));
      bodyHtml = bodyHtml.replace(placeholder, String(value));
    }

    res.json({ subject, bodyHtml, isRtl: template.isRtl });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
