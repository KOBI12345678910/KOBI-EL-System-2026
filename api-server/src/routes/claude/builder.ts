import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  statusTransitionsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
  detailDefinitionsTable,
  entityCategoriesTable,
  platformWidgetsTable,
  platformWorkflowsTable,
  systemTemplatesTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
  systemButtonsTable,
  systemStatusSetsTable,
  systemStatusValuesTable,
  claudeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, and, ne, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { validateFormulaExpression } from "../../lib/formula-engine";

const router: IRouter = Router();

async function logBuilderAction(action: string, targetType: string, targetId: number | null, input: any, result: any, status: "success" | "error" = "success", statusCode?: number, startTime?: number) {
  try {
    await db.insert(claudeAuditLogsTable).values({
      actionType: `builder_${action}`,
      caller: "claude-builder",
      targetApi: `/claude/builder/${targetType}`,
      httpMethod: action === "create" ? "POST" : "PUT",
      httpPath: `/claude/builder/${targetType}${targetId ? `/${targetId}` : ""}`,
      inputSummary: JSON.stringify(input).substring(0, 500),
      outputSummary: JSON.stringify(result).substring(0, 500),
      status,
      statusCode: statusCode ?? (status === "success" ? (action === "create" ? 201 : 200) : 400),
      responseTimeMs: startTime ? Date.now() - startTime : 0,
    });
  } catch (err) {
    console.error("Failed to log builder action:", err);
  }
}

const CreateModuleBody = z.object({
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().min(1),
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

const CreateEntityBody = z.object({
  moduleId: z.number(),
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  namePlural: z.string().min(1),
  slug: z.string().min(1),
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

const CreateFieldBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  nameHe: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().min(1),
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

const CreateRelationBody = z.object({
  sourceEntityId: z.number(),
  targetEntityId: z.number(),
  relationType: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
  sourceFieldSlug: z.string().optional(),
  targetFieldSlug: z.string().optional(),
  label: z.string().min(1),
  reverseLabel: z.string().optional(),
  cascadeDelete: z.boolean().optional(),
  sortOrder: z.number().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateFormBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  formType: z.enum(["create", "edit", "quick_create", "wizard"]).optional(),
  sections: z.array(z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isDefault: z.boolean().optional(),
});

const CreateViewBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  viewType: z.string().optional(),
  isDefault: z.boolean().optional(),
  columns: z.array(z.any()).optional(),
  filters: z.array(z.any()).optional(),
  sorting: z.array(z.any()).optional(),
  grouping: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateStatusBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
  isDefault: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateCategoryBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.number().nullable().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateStatusSetBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  isDefault: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateActionBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  actionType: z.enum(["page", "row", "bulk", "header", "contextual"]),
  handlerType: z.enum(["create", "update", "delete", "duplicate", "status_change", "workflow", "modal", "navigate", "export", "import", "print", "custom"]),
  icon: z.string().optional(),
  color: z.string().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  handlerConfig: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

const CreateButtonBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  buttonType: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  actionType: z.string().optional(),
  actionConfig: z.record(z.string(), z.any()).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

const CreateDetailBody = z.object({
  entityId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  sections: z.array(z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isDefault: z.boolean().optional(),
  showRelatedRecords: z.boolean().optional(),
});

const CreateWidgetBody = z.object({
  moduleId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  widgetType: z.string().optional(),
  entityId: z.number().optional(),
  config: z.record(z.string(), z.any()).optional(),
  position: z.number().optional(),
  isActive: z.boolean().optional(),
});

const CreateWorkflowBody = z.object({
  moduleId: z.number(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  actions: z.array(z.any()).optional(),
  conditions: z.array(z.any()).optional(),
  isActive: z.boolean().optional(),
});

const CreateTemplateBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  templateType: z.string().min(1),
  entityId: z.number().optional(),
  moduleId: z.number().optional(),
  content: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateDashboardWidgetBody = z.object({
  dashboardId: z.number(),
  widgetType: z.string().min(1),
  title: z.string().min(1),
  entityId: z.number().nullable().optional(),
  config: z.record(z.string(), z.any()).optional(),
  position: z.number().int().optional(),
  size: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.post("/claude/builder/modules", async (req, res) => {
  try {
    const body = CreateModuleBody.parse(req.body);
    if (body.moduleKey === "") body.moduleKey = undefined;
    if (body.moduleKey) {
      const [existing] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.moduleKey, body.moduleKey));
      if (existing) return res.status(409).json({ message: `module_key '${body.moduleKey}' already exists` });
    }
    const [mod] = await db.insert(platformModulesTable).values(body).returning();
    await logBuilderAction("create", "modules", mod.id, body, mod);
    res.status(201).json(mod);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated: slug or module_key already exists" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/modules/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateModuleBody.partial().extend({ status: z.enum(["draft", "published", "archived"]).optional() }).parse(req.body);
    if (body.moduleKey === "") body.moduleKey = undefined;
    if (body.moduleKey) {
      const [existing] = await db.select().from(platformModulesTable).where(and(eq(platformModulesTable.moduleKey, body.moduleKey), ne(platformModulesTable.id, id)));
      if (existing) return res.status(409).json({ message: `module_key '${body.moduleKey}' already exists` });
    }
    const [mod] = await db.update(platformModulesTable).set({ ...body, updatedAt: new Date() }).where(eq(platformModulesTable.id, id)).returning();
    if (!mod) return res.status(404).json({ message: "Module not found" });
    await logBuilderAction("update", "modules", id, body, mod);
    res.json(mod);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/entities", async (req, res) => {
  try {
    const body = CreateEntityBody.parse(req.body);
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
    const [entity] = await db.insert(moduleEntitiesTable).values(body).returning();
    await logBuilderAction("create", "entities", entity.id, body, entity);
    res.status(201).json(entity);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated: entity_key or table_name already exists" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/entities/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateEntityBody.partial().parse(req.body);
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
    await logBuilderAction("update", "entities", id, body, entity);
    res.json(entity);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Unique constraint violated" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/fields", async (req, res) => {
  const startTime = Date.now();
  try {
    const body = CreateFieldBody.parse(req.body);
    if (body.fieldKey === "") body.fieldKey = undefined;
    if (body.fieldKey) {
      const [existing] = await db.select().from(entityFieldsTable).where(and(eq(entityFieldsTable.entityId, body.entityId), eq(entityFieldsTable.fieldKey, body.fieldKey)));
      if (existing) return res.status(409).json({ message: `field_key '${body.fieldKey}' already exists for this entity` });
    }

    if ((body.fieldType === "formula" || body.fieldType === "computed") && body.formulaExpression) {
      const siblingFields = await db.select().from(entityFieldsTable)
        .where(eq(entityFieldsTable.entityId, body.entityId))
        .orderBy(asc(entityFieldsTable.sortOrder));
      const validationError = validateFormulaExpression(
        body.formulaExpression,
        siblingFields.map(f => ({ slug: f.slug, fieldType: f.fieldType })),
        body.slug,
      );
      if (validationError) {
        await logBuilderAction("create", "fields", null, body, { error: validationError.message }, "error", 400, startTime);
        return res.status(400).json({ message: `Formula validation failed: ${validationError.message}`, formulaError: validationError });
      }
    }

    if (body.fieldType === "auto_number") {
      body.isReadOnly = true;
      body.showInForm = body.showInForm ?? false;
    }

    if (body.fieldType === "sub_table" && !body.settings) {
      body.settings = { columns: [] };
    }

    const [field] = await db.insert(entityFieldsTable).values(body).returning();
    await logBuilderAction("create", "fields", field.id, body, field, "success", 201, startTime);
    res.status(201).json(field);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Duplicate field_key for this entity" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/fields/:id", async (req, res) => {
  const startTime = Date.now();
  try {
    const id = Number(req.params.id);
    const body = CreateFieldBody.partial().parse(req.body);
    if (body.fieldKey === "") body.fieldKey = undefined;

    const [currentField] = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.id, id));
    if (!currentField) return res.status(404).json({ message: "Field not found" });

    if (body.fieldKey) {
      const [existing] = await db.select().from(entityFieldsTable).where(and(eq(entityFieldsTable.entityId, currentField.entityId), eq(entityFieldsTable.fieldKey, body.fieldKey), ne(entityFieldsTable.id, id)));
      if (existing) return res.status(409).json({ message: `field_key '${body.fieldKey}' already exists for this entity` });
    }

    const effectiveFieldType = body.fieldType || currentField.fieldType;
    const effectiveFormula = body.formulaExpression !== undefined ? body.formulaExpression : currentField.formulaExpression;

    if ((effectiveFieldType === "formula" || effectiveFieldType === "computed") && effectiveFormula) {
      const siblingFields = await db.select().from(entityFieldsTable)
        .where(eq(entityFieldsTable.entityId, currentField.entityId))
        .orderBy(asc(entityFieldsTable.sortOrder));
      const validationError = validateFormulaExpression(
        effectiveFormula,
        siblingFields.map(f => ({ slug: f.slug, fieldType: f.fieldType })),
        body.slug || currentField.slug,
      );
      if (validationError) {
        await logBuilderAction("update", "fields", id, body, { error: validationError.message }, "error", 400, startTime);
        return res.status(400).json({ message: `Formula validation failed: ${validationError.message}`, formulaError: validationError });
      }
    }

    if (body.fieldType === "auto_number") {
      body.isReadOnly = true;
    }

    const [field] = await db.update(entityFieldsTable).set({ ...body, updatedAt: new Date() }).where(eq(entityFieldsTable.id, id)).returning();
    if (!field) return res.status(404).json({ message: "Field not found" });
    await logBuilderAction("update", "fields", id, body, field, "success", 200, startTime);
    res.json(field);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    if (err?.code === "23505") return res.status(409).json({ message: "Duplicate field_key for this entity" });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/relations", async (req, res) => {
  try {
    const body = CreateRelationBody.parse(req.body);
    const [rel] = await db.insert(entityRelationsTable).values(body).returning();
    await logBuilderAction("create", "relations", rel.id, body, rel);
    res.status(201).json(rel);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/relations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateRelationBody.partial().parse(req.body);
    const [rel] = await db.update(entityRelationsTable).set(body).where(eq(entityRelationsTable.id, id)).returning();
    if (!rel) return res.status(404).json({ message: "Relation not found" });
    await logBuilderAction("update", "relations", id, body, rel);
    res.json(rel);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/forms", async (req, res) => {
  try {
    const body = CreateFormBody.parse(req.body);
    const [form] = await db.insert(formDefinitionsTable).values(body).returning();
    await logBuilderAction("create", "forms", form.id, body, form);
    res.status(201).json(form);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateFormBody.partial().parse(req.body);
    const [form] = await db.update(formDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(formDefinitionsTable.id, id)).returning();
    if (!form) return res.status(404).json({ message: "Form not found" });
    await logBuilderAction("update", "forms", id, body, form);
    res.json(form);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/views", async (req, res) => {
  try {
    const body = CreateViewBody.parse(req.body);
    const [view] = await db.insert(viewDefinitionsTable).values(body).returning();
    await logBuilderAction("create", "views", view.id, body, view);
    res.status(201).json(view);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/views/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateViewBody.partial().parse(req.body);
    const [view] = await db.update(viewDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(viewDefinitionsTable.id, id)).returning();
    if (!view) return res.status(404).json({ message: "View not found" });
    await logBuilderAction("update", "views", id, body, view);
    res.json(view);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/statuses", async (req, res) => {
  try {
    const body = CreateStatusBody.parse(req.body);
    const [status] = await db.insert(entityStatusesTable).values(body).returning();
    await logBuilderAction("create", "statuses", status.id, body, status);
    res.status(201).json(status);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/statuses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateStatusBody.partial().parse(req.body);
    const [status] = await db.update(entityStatusesTable).set(body).where(eq(entityStatusesTable.id, id)).returning();
    if (!status) return res.status(404).json({ message: "Status not found" });
    await logBuilderAction("update", "statuses", id, body, status);
    res.json(status);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/categories", async (req, res) => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    const [category] = await db.insert(entityCategoriesTable).values(body).returning();
    await logBuilderAction("create", "categories", category.id, body, category);
    res.status(201).json(category);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateCategoryBody.partial().parse(req.body);
    const [existing] = await db.select().from(entityCategoriesTable).where(eq(entityCategoriesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category not found" });
    const [category] = await db.update(entityCategoriesTable).set(body).where(eq(entityCategoriesTable.id, id)).returning();
    await logBuilderAction("update", "categories", id, body, category);
    res.json(category);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/status-sets", async (req, res) => {
  try {
    const body = CreateStatusSetBody.parse(req.body);
    const [statusSet] = await db.insert(systemStatusSetsTable).values(body).returning();
    await logBuilderAction("create", "status-sets", statusSet.id, body, statusSet);
    res.status(201).json(statusSet);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/status-sets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateStatusSetBody.partial().parse(req.body);
    const [statusSet] = await db.update(systemStatusSetsTable).set(body).where(eq(systemStatusSetsTable.id, id)).returning();
    if (!statusSet) return res.status(404).json({ message: "Status set not found" });
    await logBuilderAction("update", "status-sets", id, body, statusSet);
    res.json(statusSet);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/actions", async (req, res) => {
  try {
    const body = CreateActionBody.parse(req.body);
    const [action] = await db.insert(actionDefinitionsTable).values(body).returning();
    await logBuilderAction("create", "actions", action.id, body, action);
    res.status(201).json(action);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/actions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateActionBody.partial().parse(req.body);
    const [action] = await db.update(actionDefinitionsTable).set(body).where(eq(actionDefinitionsTable.id, id)).returning();
    if (!action) return res.status(404).json({ message: "Action not found" });
    await logBuilderAction("update", "actions", id, body, action);
    res.json(action);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/buttons", async (req, res) => {
  try {
    const body = CreateButtonBody.parse(req.body);
    const [button] = await db.insert(systemButtonsTable).values(body).returning();
    await logBuilderAction("create", "buttons", button.id, body, button);
    res.status(201).json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/buttons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateButtonBody.partial().parse(req.body);
    const [button] = await db.update(systemButtonsTable).set(body).where(eq(systemButtonsTable.id, id)).returning();
    if (!button) return res.status(404).json({ message: "Button not found" });
    await logBuilderAction("update", "buttons", id, body, button);
    res.json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/details", async (req, res) => {
  try {
    const body = CreateDetailBody.parse(req.body);
    const [detail] = await db.insert(detailDefinitionsTable).values(body).returning();
    await logBuilderAction("create", "details", detail.id, body, detail);
    res.status(201).json(detail);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/details/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateDetailBody.partial().parse(req.body);
    const [detail] = await db.update(detailDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(detailDefinitionsTable.id, id)).returning();
    if (!detail) return res.status(404).json({ message: "Detail definition not found" });
    await logBuilderAction("update", "details", id, body, detail);
    res.json(detail);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/widgets", async (req, res) => {
  try {
    const body = CreateWidgetBody.parse(req.body);
    const [widget] = await db.insert(platformWidgetsTable).values(body).returning();
    await logBuilderAction("create", "widgets", widget.id, body, widget);
    res.status(201).json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/widgets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateWidgetBody.partial().parse(req.body);
    const [widget] = await db.update(platformWidgetsTable).set({ ...body, updatedAt: new Date() }).where(eq(platformWidgetsTable.id, id)).returning();
    if (!widget) return res.status(404).json({ message: "Widget not found" });
    await logBuilderAction("update", "widgets", id, body, widget);
    res.json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/workflows", async (req, res) => {
  try {
    const body = CreateWorkflowBody.parse(req.body);
    const [workflow] = await db.insert(platformWorkflowsTable).values(body).returning();
    await logBuilderAction("create", "workflows", workflow.id, body, workflow);
    res.status(201).json(workflow);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/workflows/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateWorkflowBody.partial().parse(req.body);
    const [workflow] = await db.update(platformWorkflowsTable).set({ ...body, updatedAt: new Date() }).where(eq(platformWorkflowsTable.id, id)).returning();
    if (!workflow) return res.status(404).json({ message: "Workflow not found" });
    await logBuilderAction("update", "workflows", id, body, workflow);
    res.json(workflow);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/templates", async (req, res) => {
  try {
    const body = CreateTemplateBody.parse(req.body);
    const [template] = await db.insert(systemTemplatesTable).values(body).returning();
    await logBuilderAction("create", "templates", template.id, body, template);
    res.status(201).json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateTemplateBody.partial().parse(req.body);
    const [template] = await db.update(systemTemplatesTable).set({ ...body, updatedAt: new Date() }).where(eq(systemTemplatesTable.id, id)).returning();
    if (!template) return res.status(404).json({ message: "Template not found" });
    await logBuilderAction("update", "templates", id, body, template);
    res.json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/dashboard-widgets", async (req, res) => {
  try {
    const body = CreateDashboardWidgetBody.parse(req.body);
    const [widget] = await db.insert(systemDashboardWidgetsTable).values(body).returning();
    await logBuilderAction("create", "dashboard-widgets", widget.id, body, widget);
    res.status(201).json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/claude/builder/dashboard-widgets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateDashboardWidgetBody.partial().parse(req.body);
    const [widget] = await db.update(systemDashboardWidgetsTable).set(body).where(eq(systemDashboardWidgetsTable.id, id)).returning();
    if (!widget) return res.status(404).json({ message: "Dashboard widget not found" });
    await logBuilderAction("update", "dashboard-widgets", id, body, widget);
    res.json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/builder/transitions", async (req, res) => {
  try {
    const body = z.object({
      entityId: z.number(),
      fromStatusId: z.number().nullable().optional(),
      toStatusId: z.number(),
      label: z.string().min(1),
      icon: z.string().optional(),
      conditions: z.record(z.string(), z.any()).optional(),
      settings: z.record(z.string(), z.any()).optional(),
    }).parse(req.body);
    const [transition] = await db.insert(statusTransitionsTable).values(body).returning();
    await logBuilderAction("create", "transitions", transition.id, body, transition);
    res.status(201).json(transition);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    console.error("Builder error:", err); res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
