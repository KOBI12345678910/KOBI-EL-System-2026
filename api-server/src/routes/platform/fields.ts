import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityFieldsTable } from "@workspace/db/schema";
import { eq, and, asc, ne, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { validateFormulaExpression } from "../../lib/formula-engine";
import { requireBuilderAccess } from "../../lib/permission-middleware";
import { invalidateEntityFields } from "../../lib/metadata-cache";

const router: IRouter = Router();

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return slug || `field_${Date.now()}`;
}

const CreateFieldBody = z.object({
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().min(1).optional(),
  fieldKey: z.string().optional(),
  fieldType: z.string().min(1),
  groupName: z.string().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  isSortable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  isSystemField: z.boolean().optional(),
  isCalculated: z.boolean().optional(),
  formulaExpression: z.string().optional(),
  showInList: z.boolean().optional(),
  showInForm: z.boolean().optional(),
  showInDetail: z.boolean().optional(),
  defaultValue: z.string().optional(),
  validationRules: z.record(z.string(), z.any()).optional(),
  displayRules: z.record(z.string(), z.any()).optional(),
  options: z.array(z.any()).optional(),
  optionsJson: z.any().optional(),
  relatedEntityId: z.number().optional(),
  relatedDisplayField: z.string().optional(),
  relationType: z.string().optional(),
  sortOrder: z.number().optional(),
  fieldWidth: z.enum(["full", "half", "third", "quarter"]).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  maxLength: z.number().optional(),
  sectionKey: z.string().optional(),
  tabKey: z.string().optional(),
});

const UpdateFieldBody = CreateFieldBody.partial();

router.get("/platform/entities/:entityId/fields", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, entityId))
      .orderBy(asc(entityFieldsTable.sortOrder));
    res.json(fields);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/fields", requireBuilderAccess, async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const rawBody = { ...req.body };
    if (rawBody.name && !rawBody.slug) rawBody.slug = toSlug(rawBody.name);
    const body = CreateFieldBody.parse(rawBody);
    if (body.fieldKey === "") body.fieldKey = undefined;
    if (body.fieldKey) {
      const [existing] = await db.select().from(entityFieldsTable).where(and(eq(entityFieldsTable.entityId, entityId), eq(entityFieldsTable.fieldKey, body.fieldKey)));
      if (existing) return res.status(409).json({ message: `field_key '${body.fieldKey}' already exists for this entity` });
    }

    if (body.formulaExpression && (body.fieldType === "formula" || body.fieldType === "computed" || body.isCalculated)) {
      const existingFields = await db.select().from(entityFieldsTable)
        .where(eq(entityFieldsTable.entityId, entityId));
      const validationError = validateFormulaExpression(
        body.formulaExpression,
        existingFields.map(f => ({ slug: f.slug, fieldType: f.fieldType })),
        body.slug
      );
      if (validationError) {
        return res.status(400).json({ message: `Formula error: ${validationError.message}`, formulaError: validationError });
      }
    }

    const [field] = await db.insert(entityFieldsTable).values({ ...body, entityId }).returning();
    invalidateEntityFields(entityId);
    res.status(201).json(field);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Duplicate field_key for this entity" });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/fields/reorder", requireBuilderAccess, async (req, res) => {
  try {
    const { items, entityId } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "items array required" });
    if (items.length === 0) return res.json({ success: true });
    const ids: number[] = items.map((i: any) => Number(i.id));
    if (entityId) {
      const fieldCheck = await db.select({ id: entityFieldsTable.id }).from(entityFieldsTable)
        .where(and(eq(entityFieldsTable.entityId, Number(entityId)), inArray(entityFieldsTable.id, ids)));
      if (fieldCheck.length !== ids.length) return res.status(400).json({ message: "Some fields do not belong to the specified entity" });
    }
    const whenClauses = items.map((i: any) => sql`WHEN ${Number(i.id)} THEN ${Number(i.sortOrder)}`);
    await db.update(entityFieldsTable)
      .set({
        sortOrder: sql`CASE id ${sql.join(whenClauses, sql` `)} END`,
        updatedAt: new Date(),
      })
      .where(inArray(entityFieldsTable.id, ids));
    if (entityId) invalidateEntityFields(Number(entityId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/fields/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateFieldBody.parse(req.body);
    if (body.fieldKey === "") body.fieldKey = undefined;

    const [currentField] = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.id, id));
    if (!currentField) return res.status(404).json({ message: "Field not found" });

    if (body.fieldKey) {
      const [existing] = await db.select().from(entityFieldsTable).where(and(eq(entityFieldsTable.entityId, currentField.entityId), eq(entityFieldsTable.fieldKey, body.fieldKey), ne(entityFieldsTable.id, id)));
      if (existing) return res.status(409).json({ message: `field_key '${body.fieldKey}' already exists for this entity` });
    }

    const effectiveType = body.fieldType ?? currentField.fieldType;
    const effectiveFormula = body.formulaExpression !== undefined ? body.formulaExpression : currentField.formulaExpression;
    const effectiveCalculated = body.isCalculated !== undefined ? body.isCalculated : currentField.isCalculated;
    const effectiveSlug = body.slug ?? currentField.slug;

    if (effectiveFormula && (effectiveType === "formula" || effectiveType === "computed" || effectiveCalculated)) {
      const existingFields = await db.select().from(entityFieldsTable)
        .where(eq(entityFieldsTable.entityId, currentField.entityId));
      const validationError = validateFormulaExpression(
        effectiveFormula,
        existingFields.map(f => ({ slug: f.slug, fieldType: f.fieldType })),
        effectiveSlug
      );
      if (validationError) {
        return res.status(400).json({ message: `Formula error: ${validationError.message}`, formulaError: validationError });
      }
    }

    const [field] = await db.update(entityFieldsTable).set({ ...body, updatedAt: new Date() }).where(eq(entityFieldsTable.id, id)).returning();
    if (field) invalidateEntityFields(field.entityId);
    res.json(field);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Duplicate field_key for this entity" });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/validate-formula", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const { expression, currentFieldSlug } = req.body;
    if (!expression) return res.status(400).json({ message: "Expression is required" });

    const existingFields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, entityId));

    const validationError = validateFormulaExpression(
      expression,
      existingFields.map(f => ({ slug: f.slug, fieldType: f.fieldType })),
      currentFieldSlug
    );

    if (validationError) {
      return res.json({ valid: false, error: validationError });
    }
    res.json({ valid: true, error: null });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/fields/:id/clone", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [original] = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.id, id));
    if (!original) return res.status(404).json({ message: "Field not found" });

    const timestamp = Date.now();
    const [newField] = await db.insert(entityFieldsTable).values({
      entityId: original.entityId,
      name: `${original.name} (עותק)`,
      nameHe: original.nameHe ? `${original.nameHe} (עותק)` : null,
      nameEn: original.nameEn ? `${original.nameEn} (Copy)` : null,
      slug: `${original.slug}_copy_${timestamp}`,
      fieldKey: original.fieldKey ? `${original.fieldKey}-${timestamp}` : null,
      fieldType: original.fieldType,
      groupName: original.groupName,
      description: original.description,
      placeholder: original.placeholder,
      helpText: original.helpText,
      isRequired: original.isRequired,
      isUnique: false,
      isSearchable: original.isSearchable,
      isSortable: original.isSortable,
      isFilterable: original.isFilterable,
      isReadOnly: original.isReadOnly,
      isSystemField: false,
      isCalculated: original.isCalculated,
      formulaExpression: original.formulaExpression,
      showInList: original.showInList,
      showInForm: original.showInForm,
      showInDetail: original.showInDetail,
      defaultValue: original.defaultValue,
      validationRules: original.validationRules,
      displayRules: original.displayRules,
      options: original.options,
      optionsJson: original.optionsJson,
      relatedEntityId: original.relatedEntityId,
      relatedDisplayField: original.relatedDisplayField,
      relationType: original.relationType,
      sortOrder: original.sortOrder + 1,
      fieldWidth: original.fieldWidth,
      settings: original.settings,
      minValue: original.minValue,
      maxValue: original.maxValue,
      maxLength: original.maxLength,
      sectionKey: original.sectionKey,
      tabKey: original.tabKey,
    }).returning();

    invalidateEntityFields(newField.entityId);
    res.status(201).json(newField);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/fields/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ entityId: entityFieldsTable.entityId }).from(entityFieldsTable).where(eq(entityFieldsTable.id, id));
    await db.delete(entityFieldsTable).where(eq(entityFieldsTable.id, id));
    if (existing) invalidateEntityFields(existing.entityId);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
