import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityRecordsTable, entityFieldsTable, recordAuditLogTable, recordVersionsTable, validationRulesTable, statusTransitionsTable, entityStatusesTable, entityRelationsTable } from "@workspace/db/schema";
import { eq, and, or, asc, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { computeFormulaFields } from "../../lib/formula-engine";
import { generateAutoNumberFields } from "../../lib/auto-number-engine";
import { eventBus } from "../../lib/event-bus";
import { evaluateConditions } from "../../lib/workflow-engine";
import multer from "multer";
import ExcelJS from "exceljs";
import { checkEntityAccess, filterFieldsForRead, validateWriteFields, resolveDataScopeRules, buildScopeConditions, logPermissionDenied, checkModuleCrudForEntity } from "../../lib/permission-engine";
import { getEntityFields, getEntityStatuses, invalidateEntityFields } from "../../lib/metadata-cache";
import type { Request, Response } from "express";

const router: IRouter = Router();

async function enforceScopeForRecord(
  req: Request,
  recordId: number,
  entityId: number,
  action: string,
): Promise<{ denied: boolean }> {
  if (!req.permissions || req.permissions.isSuperAdmin || !req.userId) {
    return { denied: false };
  }
  const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
  const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
  if (scope.denyAll) {
    await logPermissionDenied(req.userId, `${action}_scope`, entityId, recordId);
    return { denied: true };
  }
  if (scope.conditions.length > 0) {
    const [scoped] = await db.select({ id: entityRecordsTable.id })
      .from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, recordId), or(...scope.conditions)!));
    if (!scoped) {
      await logPermissionDenied(req.userId, `${action}_scope`, entityId, recordId);
      return { denied: true };
    }
  }
  return { denied: false };
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CreateRecordBody = z.object({
  data: z.record(z.string(), z.any()).default({}),
  status: z.string().optional(),
});

const UpdateRecordBody = z.object({
  data: z.record(z.string(), z.any()).optional(),
  status: z.string().optional(),
});

const FilterSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals", "not_equals", "contains", "not_contains", "starts_with",
    "gt", "lt", "gte", "lte", "between",
    "is_empty", "is_not_empty", "in_list"
  ]),
  value: z.any().optional(),
});

const FilterGroupSchema = z.object({
  filters: z.union([z.string(), z.array(FilterSchema)]),
  combinator: z.enum(["and", "or"]).default("and"),
});

function buildFilterCondition(filter: z.infer<typeof FilterSchema>) {
  const jsonField = sql`${entityRecordsTable.data}->>${filter.field}`;

  switch (filter.operator) {
    case "equals":
      return sql`${jsonField} = ${String(filter.value ?? "")}`;
    case "not_equals":
      return sql`(${jsonField} IS NULL OR ${jsonField} != ${String(filter.value ?? "")})`;
    case "contains":
      return sql`${jsonField} ILIKE ${'%' + String(filter.value ?? "") + '%'}`;
    case "not_contains":
      return sql`(${jsonField} IS NULL OR ${jsonField} NOT ILIKE ${'%' + String(filter.value ?? "") + '%'})`;
    case "starts_with":
      return sql`${jsonField} ILIKE ${String(filter.value ?? "") + '%'}`;
    case "gt":
      return sql`(${jsonField})::numeric > ${Number(filter.value)}`;
    case "lt":
      return sql`(${jsonField})::numeric < ${Number(filter.value)}`;
    case "gte":
      return sql`(${jsonField})::numeric >= ${Number(filter.value)}`;
    case "lte":
      return sql`(${jsonField})::numeric <= ${Number(filter.value)}`;
    case "between": {
      const [min, max] = Array.isArray(filter.value) ? filter.value : [0, 0];
      const minStr = String(min ?? "");
      const maxStr = String(max ?? "");
      const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(minStr) || /^\d{4}-\d{2}-\d{2}/.test(maxStr);
      if (looksLikeDate) {
        return sql`${jsonField} >= ${minStr} AND ${jsonField} <= ${maxStr}`;
      }
      return sql`(${jsonField})::numeric BETWEEN ${Number(min)} AND ${Number(max)}`;
    }
    case "is_empty":
      return sql`(${jsonField} IS NULL OR ${jsonField} = '' OR ${jsonField} = 'null' OR ${jsonField} = 'undefined')`;
    case "is_not_empty":
      return sql`(${jsonField} IS NOT NULL AND ${jsonField} != '' AND ${jsonField} != 'null' AND ${jsonField} != 'undefined')`;
    case "in_list": {
      const list = Array.isArray(filter.value) ? filter.value.map(String) : String(filter.value ?? "").split(",").map(s => s.trim());
      if (list.length === 0) return sql`1=1`;
      const placeholders = list.map(v => sql`${v}`);
      return sql`${jsonField} IN (${sql.join(placeholders, sql`, `)})`;
    }
    default:
      return sql`1=1`;
  }
}

function parseFilters(filtersParam: string | undefined): { filters: z.infer<typeof FilterSchema>[]; combinator: "and" | "or" } | null {
  if (!filtersParam) return null;
  try {
    const parsed = JSON.parse(filtersParam);
    if (Array.isArray(parsed)) {
      return { filters: parsed.map(f => FilterSchema.parse(f)), combinator: "and" };
    }
    const group = FilterGroupSchema.parse(parsed);
    if (typeof group.filters === "string") {
      return { filters: JSON.parse(group.filters).map((f: any) => FilterSchema.parse(f)), combinator: group.combinator };
    }
    return { filters: group.filters as z.infer<typeof FilterSchema>[], combinator: group.combinator };
  } catch {
    return null;
  }
}

router.get("/platform/entities/:entityId/records", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "read");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "view");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "read", entityId);
        return res.status(403).json({ message: "Access denied: no read permission" });
      }
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search as string;
    const sortBy = req.query.sortBy as string;
    const sortDir = (req.query.sortDir as string) === "asc" ? "asc" : "desc";
    const statusFilter = req.query.status as string;
    const categoryFilter = req.query.category as string;
    const filtersParam = req.query.filters as string;
    const filterField = req.query.filterField as string;
    const filterValue = req.query.filterValue as string;

    const conditions = [eq(entityRecordsTable.entityId, entityId)];

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        return res.json({ records: [], total: 0, statuses: [] });
      }
      if (scope.conditions.length > 0) {
        conditions.push(or(...scope.conditions)!);
      }
    }

    if (search) {
      conditions.push(sql`${entityRecordsTable.data}::text ILIKE ${'%' + search + '%'}`);
    }
    if (statusFilter) {
      conditions.push(eq(entityRecordsTable.status, statusFilter));
    }
    if (filterField && filterValue) {
      conditions.push(sql`${entityRecordsTable.data}->>${filterField} = ${filterValue}`);
    }

    const filterGroup = parseFilters(filtersParam);
    if (filterGroup && filterGroup.filters.length > 0) {
      const filterConditions = filterGroup.filters.map(buildFilterCondition);
      if (filterGroup.combinator === "or") {
        conditions.push(or(...filterConditions)!);
      } else {
        conditions.push(...filterConditions);
      }
    }

    let baseCondition = and(...conditions);

    if (categoryFilter) {
      const catCondition = sql`${entityRecordsTable.data}->>'_category' = ${categoryFilter}`;
      baseCondition = and(baseCondition, catCondition);
    }

    const orderExpr = sortBy
      ? (sortDir === "asc" ? asc : desc)(sql`${entityRecordsTable.data}->>${sortBy}`)
      : desc(entityRecordsTable.createdAt);

    const relationalResult = await db.execute<{
      id: number;
      entity_id: number;
      data: unknown;
      status: string | null;
      created_by: string | null;
      assigned_to: string | null;
      created_at: Date;
      updated_at: Date;
      total_count: number;
      entity_fields: unknown;
      entity_statuses: unknown;
    }>(sql`
      WITH
        _fields AS (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', f.id,
              'entityId', f.entity_id,
              'name', f.name,
              'nameHe', f.name_he,
              'nameEn', f.name_en,
              'slug', f.slug,
              'fieldKey', f.field_key,
              'fieldType', f.field_type,
              'groupName', f.group_name,
              'description', f.description,
              'placeholder', f.placeholder,
              'helpText', f.help_text,
              'isRequired', f.is_required,
              'isUnique', f.is_unique,
              'isSearchable', f.is_searchable,
              'isSortable', f.is_sortable,
              'isFilterable', f.is_filterable,
              'isReadOnly', f.is_read_only,
              'isSystemField', f.is_system_field,
              'isCalculated', f.is_calculated,
              'formulaExpression', f.formula_expression,
              'showInList', f.show_in_list,
              'showInForm', f.show_in_form,
              'showInDetail', f.show_in_detail,
              'defaultValue', f.default_value,
              'validationRules', f.validation_rules,
              'displayRules', f.display_rules,
              'options', f.options,
              'optionsJson', f.options_json,
              'relatedEntityId', f.related_entity_id,
              'relatedDisplayField', f.related_display_field,
              'relationType', f.relation_type,
              'sortOrder', f.sort_order,
              'fieldWidth', f.field_width,
              'settings', f.settings,
              'minValue', f.min_value,
              'maxValue', f.max_value,
              'maxLength', f.max_length,
              'sectionKey', f.section_key,
              'tabKey', f.tab_key,
              'createdAt', f.created_at,
              'updatedAt', f.updated_at
            ) ORDER BY f.sort_order ASC
          ), '[]'::json) AS v
          FROM entity_fields f WHERE f.entity_id = ${entityId}
        ),
        _statuses AS (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', s.id,
              'entityId', s.entity_id,
              'name', s.name,
              'slug', s.slug,
              'color', s.color,
              'icon', s.icon,
              'sortOrder', s.sort_order,
              'isDefault', s.is_default,
              'isFinal', s.is_final,
              'settings', s.settings,
              'createdAt', s.created_at
            ) ORDER BY s.sort_order ASC
          ), '[]'::json) AS v
          FROM entity_statuses s WHERE s.entity_id = ${entityId}
        )
      SELECT
        entity_records.id,
        entity_records.entity_id,
        entity_records.data,
        entity_records.status,
        entity_records.created_by,
        entity_records.assigned_to,
        entity_records.created_at,
        entity_records.updated_at,
        count(*) OVER()::int AS total_count,
        (SELECT v FROM _fields) AS entity_fields,
        (SELECT v FROM _statuses) AS entity_statuses
      FROM entity_records
      WHERE ${baseCondition}
      ORDER BY ${orderExpr}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const rows = relationalResult.rows;
    const rawRecords = rows.map(row => ({
      id: row.id,
      entityId: row.entity_id,
      data: row.data,
      status: row.status,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      totalCount: row.total_count,
    }));
    const total = rows[0]?.total_count ?? 0;
    const fields: any[] = rows[0]
      ? (rows[0].entity_fields as any[] ?? [])
      : await getEntityFields(entityId);
    const statuses: any[] = rows[0]
      ? (rows[0].entity_statuses as any[] ?? [])
      : await getEntityStatuses(entityId);

    const hasFormulaFields = fields.some(f =>
      (f.fieldType === "formula" || f.fieldType === "computed" || f.isCalculated) && f.formulaExpression
    );

    const enrichedRecords = hasFormulaFields
      ? rawRecords.map(rec => ({
          ...rec,
          data: computeFormulaFields(rec.data as Record<string, any>, fields),
        }))
      : rawRecords;

    const finalRecords = req.permissions
      ? enrichedRecords.map((rec: any) => ({
          ...rec,
          data: filterFieldsForRead(req.permissions!, entityId, rec.data as Record<string, unknown>),
        }))
      : enrichedRecords;

    res.json({ records: finalRecords, total, statuses });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/records/aggregate", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "read");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "view");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "aggregate", entityId);
        return res.status(403).json({ message: "Access denied: no read permission" });
      }
    }

    const { func, field, groupBy, filters: bodyFilters, combinator } = req.body;

    const validFuncs = ["count", "sum", "avg", "min", "max"];
    if (!validFuncs.includes(func)) {
      return res.status(400).json({ message: `Invalid aggregation function. Must be one of: ${validFuncs.join(", ")}` });
    }

    const conditions = [eq(entityRecordsTable.entityId, entityId)];

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        return res.json(groupBy ? { results: [] } : { value: 0 });
      }
      if (scope.conditions.length > 0) {
        conditions.push(or(...scope.conditions)!);
      }
    }

    if (bodyFilters && Array.isArray(bodyFilters) && bodyFilters.length > 0) {
      const filterConditions = bodyFilters.map((f: any) => buildFilterCondition(FilterSchema.parse(f)));
      if (combinator === "or") {
        conditions.push(or(...filterConditions)!);
      } else {
        conditions.push(...filterConditions);
      }
    }

    const whereClause = and(...conditions);

    if (groupBy) {
      const groupByField = sql`${entityRecordsTable.data}->>${groupBy}`;
      let aggExpr;
      switch (func) {
        case "count":
          aggExpr = sql<number>`count(*)::int`;
          break;
        case "sum":
          aggExpr = sql<number>`COALESCE(sum((${entityRecordsTable.data}->>${field})::numeric), 0)`;
          break;
        case "avg":
          aggExpr = sql<number>`COALESCE(avg((${entityRecordsTable.data}->>${field})::numeric), 0)`;
          break;
        case "min":
          aggExpr = sql<number>`min((${entityRecordsTable.data}->>${field})::numeric)`;
          break;
        case "max":
          aggExpr = sql<number>`max((${entityRecordsTable.data}->>${field})::numeric)`;
          break;
      }

      const results = await db.select({
        group: sql<string>`${groupByField}`,
        value: aggExpr!,
      })
        .from(entityRecordsTable)
        .where(whereClause)
        .groupBy(groupByField);

      res.json({ results });
    } else {
      let aggExpr;
      switch (func) {
        case "count":
          aggExpr = sql<number>`count(*)::int`;
          break;
        case "sum":
          aggExpr = sql<number>`COALESCE(sum((${entityRecordsTable.data}->>${field})::numeric), 0)`;
          break;
        case "avg":
          aggExpr = sql<number>`COALESCE(avg((${entityRecordsTable.data}->>${field})::numeric), 0)`;
          break;
        case "min":
          aggExpr = sql<number>`min((${entityRecordsTable.data}->>${field})::numeric)`;
          break;
        case "max":
          aggExpr = sql<number>`max((${entityRecordsTable.data}->>${field})::numeric)`;
          break;
      }

      const [result] = await db.select({ value: aggExpr! })
        .from(entityRecordsTable)
        .where(whereClause);

      res.json({ value: result?.value ?? 0 });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function enforceValidationRules(entityId: number, data: Record<string, any>): Promise<Record<string, string>> {
  const rules = await db.select().from(validationRulesTable)
    .where(and(eq(validationRulesTable.entityId, entityId), eq(validationRulesTable.isActive, true)))
    .orderBy(asc(validationRulesTable.sortOrder));

  const errors: Record<string, string> = {};
  for (const rule of rules) {
    if (!rule.fieldSlug) continue;
    const value = data[rule.fieldSlug];
    let isInvalid = false;

    switch (rule.ruleType) {
      case "required":
        isInvalid = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
        break;
      case "min_length":
        isInvalid = typeof value === "string" && value.length > 0 && value.length < Number(rule.value);
        break;
      case "max_length":
        isInvalid = typeof value === "string" && value.length > Number(rule.value);
        break;
      case "min_value":
        isInvalid = value !== "" && value !== null && value !== undefined && Number(value) < Number(rule.value);
        break;
      case "max_value":
        isInvalid = value !== "" && value !== null && value !== undefined && Number(value) > Number(rule.value);
        break;
      case "regex":
        if (value && typeof value === "string" && rule.value) {
          try { isInvalid = !new RegExp(rule.value).test(value); } catch { /* ignore */ }
        }
        break;
      case "email":
        if (value && typeof value === "string") {
          isInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        }
        break;
      case "url":
        if (value && typeof value === "string") {
          try { new URL(value); } catch { isInvalid = true; }
        }
        break;
      case "numeric_range":
        if (value !== "" && value !== null && value !== undefined && rule.value) {
          const [min, max] = rule.value.split(",").map(Number);
          const num = Number(value);
          isInvalid = num < min || num > max;
        }
        break;
    }

    if (isInvalid && !errors[rule.fieldSlug]) {
      errors[rule.fieldSlug] = rule.errorMessage;
    }
  }
  return errors;
}

async function enforceStatusTransition(entityId: number, fromStatus: string | null, toStatus: string, recordData?: Record<string, any>): Promise<string | null> {
  const [statuses, transitions] = await Promise.all([
    getEntityStatuses(entityId),
    db.select().from(statusTransitionsTable).where(eq(statusTransitionsTable.entityId, entityId)),
  ]);
  if (transitions.length === 0) return null;

  const fromStatusDef = fromStatus ? statuses.find(s => s.slug === fromStatus) : null;
  const toStatusDef = statuses.find(s => s.slug === toStatus);
  if (!toStatusDef) return null;

  const validTransition = transitions.find(t =>
    (t.fromStatusId === null || t.fromStatusId === fromStatusDef?.id) &&
    t.toStatusId === toStatusDef.id
  );

  if (!validTransition) return "Invalid status transition";

  if (validTransition.conditions && recordData) {
    const conditions = validTransition.conditions as any;
    let conditionsList: any[] = [];
    if (Array.isArray(conditions)) {
      conditionsList = conditions;
    } else if (conditions.rules && Array.isArray(conditions.rules)) {
      conditionsList = conditions.rules;
    }

    if (conditionsList.length > 0) {
      const conditionContext = { status: fromStatus, oldStatus: fromStatus };
      if (!evaluateConditions(conditionsList, recordData, conditionContext)) {
        const message = (conditions as any).errorMessage || "Status transition conditions not met";
        return message;
      }
    }
  }

  return null;
}

router.post("/platform/entities/:entityId/records", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "create");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "create");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "create", entityId);
        return res.status(403).json({ message: "Access denied: no create permission" });
      }
    }
    const body = CreateRecordBody.parse(req.body);
    if (req.permissions && body.data) {
      const violations = validateWriteFields(req.permissions, entityId, body.data);
      if (violations.length > 0) {
        return res.status(403).json({ message: `Cannot write to restricted fields: ${violations.join(", ")}`, restrictedFields: violations });
      }
    }

    const fields = await getEntityFields(entityId);

    let processedData = { ...body.data };
    const autoNumberSlugs = fields.filter(f => f.fieldType === "auto_number").map(f => f.slug);
    for (const slug of autoNumberSlugs) {
      delete processedData[slug];
    }
    processedData = await generateAutoNumberFields(entityId, processedData, fields);
    processedData = computeFormulaFields(processedData, fields);

    const validationErrors = await enforceValidationRules(entityId, processedData);
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ message: "Validation failed", errors: validationErrors });
    }

    const recordStatus = body.status || "draft";
    const [record] = await db.insert(entityRecordsTable).values({
      entityId,
      data: processedData,
      status: recordStatus,
      createdBy: req.userId || null,
      assignedTo: (processedData && typeof processedData === "object" && "_assigned_to" in processedData) ? String(processedData._assigned_to) : req.userId || null,
    }).returning();

    await db.insert(recordVersionsTable).values({
      entityId,
      recordId: record.id,
      versionNumber: 1,
      data: body.data,
      status: recordStatus,
    }).catch(() => {});

    await db.insert(recordAuditLogTable).values({
      entityId,
      recordId: record.id,
      action: "create",
      changes: { data: body.data, status: recordStatus },
    }).catch(() => {});

    eventBus.emitRecordEvent({
      type: "record.created",
      entityId,
      recordId: record.id,
      data: processedData,
      status: recordStatus,
      timestamp: new Date(),
    });

    res.status(201).json(record);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/records/bulk/update", async (req, res) => {
  try {
    const { ids, data, status, entityId: reqEntityId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }
    if (!data && status === undefined) {
      return res.status(400).json({ message: "Must provide data or status to update" });
    }

    const recordIds = ids.map(Number);
    const existingRecords = await db.select().from(entityRecordsTable)
      .where(inArray(entityRecordsTable.id, recordIds));

    if (existingRecords.length === 0) {
      return res.status(404).json({ message: "No records found" });
    }

    const bulkEntityId = reqEntityId ? Number(reqEntityId) : existingRecords[0].entityId;
    const mixedEntities = existingRecords.some(r => r.entityId !== bulkEntityId);
    if (mixedEntities) {
      return res.status(400).json({ message: "All records must belong to the same entity" });
    }

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, bulkEntityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, bulkEntityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "bulk_update", bulkEntityId);
        return res.status(403).json({ message: "Access denied: no edit permission" });
      }
    }

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, bulkEntityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        await logPermissionDenied(req.userId, "bulk_update_scope", bulkEntityId);
        return res.status(403).json({ message: "Access denied: records outside your data scope" });
      }
      if (scope.conditions.length > 0) {
        const scopedRecords = await db.select({ id: entityRecordsTable.id })
          .from(entityRecordsTable)
          .where(and(inArray(entityRecordsTable.id, recordIds), or(...scope.conditions)!));
        const scopedIds = new Set(scopedRecords.map(r => r.id));
        const outOfScope = recordIds.filter(id => !scopedIds.has(id));
        if (outOfScope.length > 0) {
          await logPermissionDenied(req.userId, "bulk_update_scope", bulkEntityId);
          return res.status(403).json({ message: `Access denied: ${outOfScope.length} record(s) outside your data scope` });
        }
      }
    }

    const bulkFields = await getEntityFields(bulkEntityId);

    const bulkResults: any[] = [];
    const bulkErrors: any[] = [];

    for (const existing of existingRecords) {
      try {
        let processedData = data ? { ...(existing.data as Record<string, any>), ...data } : undefined;

        if (processedData) {
          const autoNumberSlugs = new Set(bulkFields.filter(f => f.fieldType === "auto_number").map(f => f.slug));
          for (const slug of autoNumberSlugs) {
            delete processedData[slug];
          }
          processedData = computeFormulaFields(processedData, bulkFields);

          const validationErrors = await enforceValidationRules(bulkEntityId, processedData);
          if (Object.keys(validationErrors).length > 0) {
            bulkErrors.push({ id: existing.id, errors: validationErrors });
            continue;
          }
        }

        if (status !== undefined && status !== existing.status) {
          const transitionError = await enforceStatusTransition(bulkEntityId, existing.status, status);
          if (transitionError) {
            bulkErrors.push({ id: existing.id, error: transitionError });
            continue;
          }
        }

        const updates: any = { updatedAt: new Date() };
        if (processedData) updates.data = processedData;
        if (status !== undefined) updates.status = status;

        const [record] = await db.update(entityRecordsTable).set(updates)
          .where(eq(entityRecordsTable.id, existing.id)).returning();
        bulkResults.push(record);

        await db.insert(recordAuditLogTable).values({
          entityId: bulkEntityId,
          recordId: existing.id,
          action: "bulk_update",
          changes: { old: existing.data, new: processedData, oldStatus: existing.status, newStatus: status },
        }).catch(() => {});
      } catch (err: any) {
        bulkErrors.push({ id: existing.id, error: err.message });
      }
    }

    res.json({ updated: bulkResults.length, failed: bulkErrors.length, results: bulkResults, errors: bulkErrors });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/records/bulk/delete", async (req, res) => {
  try {
    const { ids, entityId: reqEntityId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }

    const recordIds = ids.map(Number);
    const existingRecords = await db.select().from(entityRecordsTable)
      .where(inArray(entityRecordsTable.id, recordIds));

    if (reqEntityId) {
      const mixedEntities = existingRecords.some(r => r.entityId !== Number(reqEntityId));
      if (mixedEntities) {
        return res.status(400).json({ message: "All records must belong to the specified entity" });
      }
    }

    if (existingRecords.length > 0) {
      const deleteEntityId = reqEntityId ? Number(reqEntityId) : existingRecords[0].entityId;
      if (req.permissions) {
        const entityAllowed = checkEntityAccess(req.permissions, deleteEntityId, "delete");
        const moduleAllowed = await checkModuleCrudForEntity(req.permissions, deleteEntityId, "delete");
        if (!entityAllowed && !moduleAllowed) {
          await logPermissionDenied(req.userId || "", "bulk_delete", deleteEntityId);
          return res.status(403).json({ message: "Access denied: no delete permission" });
        }
      }

      if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
        const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, deleteEntityId);
        const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
        if (scope.denyAll) {
          await logPermissionDenied(req.userId, "bulk_delete_scope", deleteEntityId);
          return res.status(403).json({ message: "Access denied: records outside your data scope" });
        }
        if (scope.conditions.length > 0) {
          const scopedRecords = await db.select({ id: entityRecordsTable.id })
            .from(entityRecordsTable)
            .where(and(inArray(entityRecordsTable.id, recordIds), or(...scope.conditions)!));
          const scopedIds = new Set(scopedRecords.map(r => r.id));
          const outOfScope = recordIds.filter(id => !scopedIds.has(id));
          if (outOfScope.length > 0) {
            await logPermissionDenied(req.userId, "bulk_delete_scope", deleteEntityId);
            return res.status(403).json({ message: `Access denied: ${outOfScope.length} record(s) outside your data scope` });
          }
        }
      }
    }

    for (const existing of existingRecords) {
      await db.insert(recordAuditLogTable).values({
        entityId: existing.entityId,
        recordId: existing.id,
        action: "bulk_delete",
        changes: { data: existing.data },
      }).catch(() => {});
    }

    await db.delete(entityRecordsTable).where(inArray(entityRecordsTable.id, recordIds));

    res.json({ deleted: existingRecords.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/records/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [record] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!record) return res.status(404).json({ message: "Record not found" });

    const fieldsPromise = getEntityFields(record.entityId);

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, record.entityId, "read");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, record.entityId, "view");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "read", record.entityId, id);
        return res.status(403).json({ message: "Access denied: no read permission" });
      }
    }

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, record.entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        await logPermissionDenied(req.userId, "read_scope", record.entityId, id);
        return res.status(403).json({ message: "Access denied: record outside your data scope" });
      }
      if (scope.conditions.length > 0) {
        const [scoped] = await db.select({ id: entityRecordsTable.id })
          .from(entityRecordsTable)
          .where(and(eq(entityRecordsTable.id, id), or(...scope.conditions)!));
        if (!scoped) {
          await logPermissionDenied(req.userId, "read_scope", record.entityId, id);
          return res.status(403).json({ message: "Access denied: record outside your data scope" });
        }
      }
    }

    const fields = await fieldsPromise;

    const hasFormulaFields = fields.some(f =>
      (f.fieldType === "formula" || f.fieldType === "computed" || f.isCalculated) && f.formulaExpression
    );

    if (hasFormulaFields) {
      record.data = computeFormulaFields(record.data as Record<string, any>, fields);
    }

    if (req.permissions) {
      record.data = filterFieldsForRead(req.permissions, record.entityId, record.data as Record<string, unknown>);
    }

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/records/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateRecordBody.parse(req.body);

    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Record not found" });
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "update", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no edit permission" });
      }
    }

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, existing.entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        await logPermissionDenied(req.userId, "update_scope", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: record outside your data scope" });
      }
      if (scope.conditions.length > 0) {
        const [scoped] = await db.select({ id: entityRecordsTable.id })
          .from(entityRecordsTable)
          .where(and(eq(entityRecordsTable.id, id), or(...scope.conditions)!));
        if (!scoped) {
          await logPermissionDenied(req.userId, "update_scope", existing.entityId, id);
          return res.status(403).json({ message: "Access denied: record outside your data scope" });
        }
      }
    }
    if (req.permissions && body.data) {
      const violations = validateWriteFields(req.permissions, existing.entityId, body.data);
      if (violations.length > 0) {
        return res.status(403).json({ message: `Cannot write to restricted fields: ${violations.join(", ")}`, restrictedFields: violations });
      }
    }

    let processedData = body.data;
    if (processedData) {
      const fields = await getEntityFields(existing.entityId);

      const autoNumberSlugs = new Set(fields.filter(f => f.fieldType === "auto_number").map(f => f.slug));
      for (const slug of autoNumberSlugs) {
        delete processedData[slug];
      }

      const mergedData = { ...(existing.data as Record<string, any>), ...processedData };
      processedData = computeFormulaFields(mergedData, fields);

      const validationErrors = await enforceValidationRules(existing.entityId, processedData);
      if (Object.keys(validationErrors).length > 0) {
        return res.status(400).json({ message: "Validation failed", errors: validationErrors });
      }
    }

    if (body.status !== undefined && body.status !== existing.status) {
      const currentData = processedData || (existing.data as Record<string, any>);
      const transitionError = await enforceStatusTransition(existing.entityId, existing.status, body.status, currentData);
      if (transitionError) {
        return res.status(400).json({ message: transitionError });
      }
    }

    const updates: any = { updatedAt: new Date(), updatedBy: req.userId || null };
    if (processedData) updates.data = processedData;
    if (body.status !== undefined) updates.status = body.status;
    if (body.data?._assigned_to !== undefined) {
      updates.assignedTo = body.data._assigned_to;
    }

    const [record] = await db.update(entityRecordsTable).set(updates).where(eq(entityRecordsTable.id, id)).returning();

    const latestVersion = await db.select({ maxVer: sql<number>`COALESCE(MAX(${recordVersionsTable.versionNumber}), 0)` })
      .from(recordVersionsTable)
      .where(eq(recordVersionsTable.recordId, id));
    const nextVersion = (latestVersion[0]?.maxVer || 0) + 1;

    await db.insert(recordVersionsTable).values({
      entityId: existing.entityId,
      recordId: id,
      versionNumber: nextVersion,
      data: processedData || existing.data,
      status: body.status ?? existing.status,
    }).catch(() => {});

    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId,
      recordId: id,
      action: body.status !== undefined && body.status !== existing.status ? "status_change" : "update",
      changes: { old: existing.data, new: processedData, oldStatus: existing.status, newStatus: body.status, version: nextVersion },
    }).catch(() => {});

    const statusChanged = body.status !== undefined && body.status !== existing.status;
    if (statusChanged) {
      eventBus.emitRecordEvent({
        type: "record.status_changed",
        entityId: existing.entityId,
        recordId: id,
        data: (record.data as Record<string, any>) || {},
        oldData: existing.data as Record<string, any>,
        status: body.status,
        oldStatus: existing.status,
        timestamp: new Date(),
      });
    }

    eventBus.emitRecordEvent({
      type: "record.updated",
      entityId: existing.entityId,
      recordId: id,
      data: (record.data as Record<string, any>) || {},
      oldData: existing.data as Record<string, any>,
      status: record.status,
      oldStatus: existing.status,
      timestamp: new Date(),
    });

    res.json(record);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/records/import", upload.single("file"), async (req: any, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "create");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "create");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "import_create", entityId);
        return res.status(403).json({ message: "Access denied: no create permission" });
      }
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { headers, rows } = await parseSpreadsheetFile(file);
    if (rows.length === 0) {
      return res.status(400).json({ message: "File must have at least a header row and one data row" });
    }

    const fields = await getEntityFields(entityId);

    const mappingParam = req.body?.mapping;
    let columnMapping: Record<number, string> = {};

    if (mappingParam) {
      try {
        columnMapping = JSON.parse(mappingParam);
      } catch { /* ignore */ }
    }

    if (Object.keys(columnMapping).length === 0) {
      headers.forEach((header, idx) => {
        const matchBySlug = fields.find(f => f.slug.toLowerCase() === header.toLowerCase().trim());
        const matchByName = fields.find(f => f.name.toLowerCase() === header.toLowerCase().trim());
        const matchByNameEn = fields.find(f => f.nameEn && f.nameEn.toLowerCase() === header.toLowerCase().trim());
        const match = matchBySlug || matchByName || matchByNameEn;
        if (match) {
          columnMapping[idx] = match.slug;
        }
      });
    }

    if (Object.keys(columnMapping).length === 0) {
      return res.status(400).json({
        message: "Could not map any columns to entity fields",
        headers,
        fields: fields.map(f => ({ slug: f.slug, name: f.name })),
      });
    }

    const defaultStatus = req.body?.status || "draft";
    const created: any[] = [];
    const rowErrors: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i];
      const data: Record<string, any> = {};

      for (const [colIdx, fieldSlug] of Object.entries(columnMapping)) {
        const idx = Number(colIdx);
        if (idx < values.length) {
          const field = fields.find(f => f.slug === fieldSlug);
          data[fieldSlug] = coerceValue(values[idx], field);
        }
      }

      let processedData = { ...data };
      const autoNumberSlugs = fields.filter(f => f.fieldType === "auto_number").map(f => f.slug);
      for (const slug of autoNumberSlugs) {
        delete processedData[slug];
      }

      try {
        processedData = await generateAutoNumberFields(entityId, processedData, fields);
        processedData = computeFormulaFields(processedData, fields);

        const validationErrors = await enforceValidationRules(entityId, processedData);
        if (Object.keys(validationErrors).length > 0) {
          rowErrors.push({ row: i + 2, errors: validationErrors, data });
          continue;
        }

        const importUserId = req.userId || null;
        const [record] = await db.insert(entityRecordsTable).values({
          entityId,
          data: processedData,
          status: defaultStatus,
          createdBy: importUserId,
          assignedTo: importUserId,
        }).returning();

        await db.insert(recordAuditLogTable).values({
          entityId,
          recordId: record.id,
          action: "import",
          performedBy: importUserId,
          changes: { data: processedData, source: "file_import" },
        }).catch(() => {});

        created.push(record);
      } catch (err: any) {
        rowErrors.push({ row: i + 2, error: err.message, data });
      }
    }

    res.json({
      imported: created.length,
      failed: rowErrors.length,
      total: rows.length,
      errors: rowErrors,
      mapping: columnMapping,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/records/import/preview", upload.single("file"), async (req: any, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "create");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "create");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "import_preview", entityId);
        return res.status(403).json({ message: "Access denied: no create permission" });
      }
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { headers, rows } = await parseSpreadsheetFile(file);

    const fields = await getEntityFields(entityId);

    const autoMapping: Record<number, string> = {};

    headers.forEach((header, idx) => {
      const matchBySlug = fields.find(f => f.slug.toLowerCase() === header.toLowerCase().trim());
      const matchByName = fields.find(f => f.name.toLowerCase() === header.toLowerCase().trim());
      const matchByNameEn = fields.find(f => f.nameEn && f.nameEn.toLowerCase() === header.toLowerCase().trim());
      const match = matchBySlug || matchByName || matchByNameEn;
      if (match) {
        autoMapping[idx] = match.slug;
      }
    });

    const previewRows = rows.slice(0, 5);

    res.json({
      headers,
      totalRows: rows.length,
      previewRows,
      autoMapping,
      fields: fields.map(f => ({ slug: f.slug, name: f.name, fieldType: f.fieldType })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function parseSpreadsheetFile(file: { originalname: string; buffer: Buffer }): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = file.originalname.toLowerCase().split(".").pop() || "";
  if (ext === "xlsx" || ext === "xls") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Excel file has no sheets");
    const rawData: string[][] = [];
    worksheet.eachRow(row => {
      rawData.push((row.values as any[]).slice(1).map(v => (v === null || v === undefined ? "" : String(typeof v === "object" && v.text ? v.text : v))));
    });
    if (rawData.length < 1) throw new Error("Spreadsheet is empty");
    const headers = rawData[0].map(String);
    const rows = rawData.slice(1).filter(row => row.some(cell => String(cell).trim() !== "")).map(row => row.map(String));
    return { headers, rows };
  }

  const csvContent = file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = csvContent.split(/\r?\n/).filter((line: string) => line.trim());
  if (lines.length < 1) throw new Error("CSV is empty");
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCSVLine(line));
  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function coerceValue(raw: string, field: any): any {
  if (!field) return raw;
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  switch (field.fieldType) {
    case "number":
    case "decimal":
    case "currency":
    case "percent": {
      const num = Number(trimmed.replace(/[^\d.-]/g, ""));
      return isNaN(num) ? trimmed : num;
    }
    case "boolean":
    case "checkbox":
      return ["true", "1", "yes", "כן", "✓"].includes(trimmed.toLowerCase());
    case "multi_select":
    case "tags":
      return trimmed.split(";").map(s => s.trim()).filter(Boolean);
    default:
      return trimmed;
  }
}

router.put("/platform/records/:id/publish", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Record not found" });

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "publish", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no update permission" });
      }
    }
    const publishScopeCheck = await enforceScopeForRecord(req, id, existing.entityId, "publish");
    if (publishScopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record outside your data scope" });
    }

    if (existing.status !== "published") {
      const recordData = (existing.data as Record<string, any>) || {};
      const transitionError = await enforceStatusTransition(existing.entityId, existing.status, "published", recordData);
      if (transitionError) {
        return res.status(400).json({ message: transitionError });
      }
    }

    const [record] = await db.update(entityRecordsTable)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(entityRecordsTable.id, id))
      .returning();

    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId,
      recordId: id,
      action: "publish",
      changes: { oldStatus: existing.status, newStatus: "published" },
    }).catch(() => {});

    if (existing.status !== "published") {
      eventBus.emitRecordEvent({
        type: "record.status_changed",
        entityId: existing.entityId,
        recordId: id,
        data: (record.data as Record<string, any>) || {},
        status: "published",
        oldStatus: existing.status,
        timestamp: new Date(),
      });
    }

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/records/:id/draft", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Record not found" });

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "draft", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no update permission" });
      }
    }
    const draftScopeCheck = await enforceScopeForRecord(req, id, existing.entityId, "draft");
    if (draftScopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record outside your data scope" });
    }

    if (existing.status !== "draft") {
      const recordData = (existing.data as Record<string, any>) || {};
      const transitionError = await enforceStatusTransition(existing.entityId, existing.status, "draft", recordData);
      if (transitionError) {
        return res.status(400).json({ message: transitionError });
      }
    }

    const [record] = await db.update(entityRecordsTable)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(entityRecordsTable.id, id))
      .returning();

    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId,
      recordId: id,
      action: "unpublish",
      changes: { oldStatus: existing.status, newStatus: "draft" },
    }).catch(() => {});

    if (existing.status !== "draft") {
      eventBus.emitRecordEvent({
        type: "record.status_changed",
        entityId: existing.entityId,
        recordId: id,
        data: (record.data as Record<string, any>) || {},
        status: "draft",
        oldStatus: existing.status,
        timestamp: new Date(),
      });
    }

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/records/:id/versions", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [record] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!record) return res.status(404).json({ message: "Record not found" });
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, record.entityId, "read");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, record.entityId, "view");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "versions", record.entityId, id);
        return res.status(403).json({ message: "Access denied: no read permission" });
      }
    }
    const versionsScopeCheck = await enforceScopeForRecord(req, id, record.entityId, "versions");
    if (versionsScopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record outside your data scope" });
    }
    const versions = await db.select().from(recordVersionsTable)
      .where(eq(recordVersionsTable.recordId, id))
      .orderBy(desc(recordVersionsTable.versionNumber));
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/records/:id/versions/:versionId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [parentRecord] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (parentRecord) {
      if (req.permissions) {
        const entityAllowed = checkEntityAccess(req.permissions, parentRecord.entityId, "read");
        const moduleAllowed = await checkModuleCrudForEntity(req.permissions, parentRecord.entityId, "view");
        if (!entityAllowed && !moduleAllowed) {
          await logPermissionDenied(req.userId || "", "version_get", parentRecord.entityId, id);
          return res.status(403).json({ message: "Access denied: no read permission" });
        }
      }
      const vGetScopeCheck = await enforceScopeForRecord(req, id, parentRecord.entityId, "version_get");
      if (vGetScopeCheck.denied) {
        return res.status(403).json({ message: "Access denied: record outside your data scope" });
      }
    }
    const versionId = Number(req.params.versionId);
    const [version] = await db.select().from(recordVersionsTable)
      .where(and(eq(recordVersionsTable.id, versionId), eq(recordVersionsTable.recordId, id)));
    if (!version) return res.status(404).json({ message: "Version not found" });
    res.json(version);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/records/:id/versions/:versionId/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const versionId = Number(req.params.versionId);

    const [version] = await db.select().from(recordVersionsTable)
      .where(and(eq(recordVersionsTable.id, versionId), eq(recordVersionsTable.recordId, id)));
    if (!version) return res.status(404).json({ message: "Version not found" });

    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Record not found" });

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "restore", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no update permission" });
      }
    }
    const restoreScopeCheck = await enforceScopeForRecord(req, id, existing.entityId, "restore");
    if (restoreScopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record outside your data scope" });
    }

    const [record] = await db.update(entityRecordsTable).set({
      data: version.data,
      status: version.status,
      updatedAt: new Date(),
    }).where(eq(entityRecordsTable.id, id)).returning();

    const latestVersion = await db.select({ maxVer: sql<number>`COALESCE(MAX(${recordVersionsTable.versionNumber}), 0)` })
      .from(recordVersionsTable)
      .where(eq(recordVersionsTable.recordId, id));
    const nextVersion = (latestVersion[0]?.maxVer || 0) + 1;

    await db.insert(recordVersionsTable).values({
      entityId: existing.entityId,
      recordId: id,
      versionNumber: nextVersion,
      data: version.data,
      status: version.status,
    }).catch(() => {});

    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId,
      recordId: id,
      action: "restore",
      changes: { restoredFromVersion: version.versionNumber, newVersion: nextVersion, old: existing.data, new: version.data },
    }).catch(() => {});

    eventBus.emitRecordEvent({
      type: "record.updated",
      entityId: existing.entityId,
      recordId: id,
      data: (record.data as Record<string, any>) || {},
      oldData: existing.data as Record<string, any>,
      status: record.status,
      oldStatus: existing.status,
      timestamp: new Date(),
    });

    if (version.status && version.status !== existing.status) {
      eventBus.emitRecordEvent({
        type: "record.status_changed",
        entityId: existing.entityId,
        recordId: id,
        data: (record.data as Record<string, any>) || {},
        status: version.status,
        oldStatus: existing.status,
        timestamp: new Date(),
      });
    }

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/records/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (existing && req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "delete");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "delete");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "delete", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no delete permission" });
      }
    }
    if (existing) {
      const scopeCheck = await enforceScopeForRecord(req, id, existing.entityId, "delete");
      if (scopeCheck.denied) {
        return res.status(403).json({ message: "Access denied: record outside your data scope" });
      }
      await db.insert(recordAuditLogTable).values({
        entityId: existing.entityId,
        recordId: id,
        action: "delete",
        changes: { data: existing.data },
      }).catch(() => {});

      eventBus.emitRecordEvent({
        type: "record.deleted",
        entityId: existing.entityId,
        recordId: id,
        data: existing.data as Record<string, any>,
        status: existing.status,
        timestamp: new Date(),
      });

      const inlineChildRelations = await db.select().from(entityRelationsTable)
        .where(and(
          eq(entityRelationsTable.sourceEntityId, existing.entityId),
          eq(entityRelationsTable.relationType, "inline_child")
        ));

      for (const rel of inlineChildRelations) {
        if (!rel.cascadeDelete) continue;

        const linkFieldSlug = rel.targetFieldSlug || "_parent_id";
        const childRecords = await db.select().from(entityRecordsTable)
          .where(eq(entityRecordsTable.entityId, rel.targetEntityId));

        const toDelete = childRecords.filter(r => {
          const data = r.data as Record<string, any>;
          return String(data[linkFieldSlug]) === String(id);
        });

        for (const child of toDelete) {
          await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, child.id));
        }
      }
    }
    await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/:entityId/records/export", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, entityId, "read");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, entityId, "view");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "export", entityId);
        return res.status(403).json({ message: "Access denied: no read permission" });
      }
    }

    const format = (req.query.format as string) || "csv";
    const selectedFields = req.query.fields ? (req.query.fields as string).split(",") : null;
    const statusFilter = req.query.status as string;

    const conditions = [eq(entityRecordsTable.entityId, entityId)];

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        await logPermissionDenied(req.userId, "export_scope", entityId);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=export.csv");
        return res.send("\uFEFF");
      }
      if (scope.conditions.length > 0) {
        conditions.push(or(...scope.conditions)!);
      }
    }

    const fields = await getEntityFields(entityId);

    const exportFields = selectedFields
      ? fields.filter(f => selectedFields.includes(f.slug))
      : fields;

    if (statusFilter) {
      conditions.push(eq(entityRecordsTable.status, statusFilter));
    }

    const records = await db.select().from(entityRecordsTable)
      .where(and(...conditions))
      .orderBy(desc(entityRecordsTable.createdAt));

    if (format === "json") {
      const slugs = exportFields.map(f => f.slug);
      const jsonData = records.map(rec => {
        const d = rec.data as Record<string, unknown>;
        const row: Record<string, unknown> = { _id: rec.id, _status: rec.status };
        for (const slug of slugs) {
          row[slug] = d?.[slug] ?? null;
        }
        return row;
      });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=export.json");
      res.send(JSON.stringify(jsonData, null, 2));
    } else {
      const headers = exportFields.map(f => f.name);
      const slugs = exportFields.map(f => f.slug);
      const csvRows = [headers.join(",")];
      for (const rec of records) {
        const d = rec.data as Record<string, unknown>;
        csvRows.push(slugs.map(s => `"${String(d?.[s] ?? "").replace(/"/g, '""')}"`).join(","));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=export.csv");
      res.send("\uFEFF" + csvRows.join("\n"));
    }
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Export failed" });
  }
});

router.put("/platform/records/:id/assign", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { assignedTo } = req.body;

    const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Record not found" });

    if (req.permissions) {
      const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "update");
      const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "edit");
      if (!entityAllowed && !moduleAllowed) {
        await logPermissionDenied(req.userId || "", "reassign", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: no update permission" });
      }
    }

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, existing.entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        await logPermissionDenied(req.userId, "reassign_scope", existing.entityId, id);
        return res.status(403).json({ message: "Access denied: record outside your data scope" });
      }
      if (scope.conditions.length > 0) {
        const [scoped] = await db.select({ id: entityRecordsTable.id })
          .from(entityRecordsTable)
          .where(and(eq(entityRecordsTable.id, id), or(...scope.conditions)!));
        if (!scoped) {
          await logPermissionDenied(req.userId, "reassign_scope", existing.entityId, id);
          return res.status(403).json({ message: "Access denied: record outside your data scope" });
        }
      }
    }

    const [record] = await db.update(entityRecordsTable)
      .set({ assignedTo, updatedAt: new Date(), updatedBy: req.userId || null })
      .where(eq(entityRecordsTable.id, id))
      .returning();

    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId,
      recordId: id,
      action: "reassign",
      performedBy: req.userId || null,
      changes: { oldAssignedTo: existing.assignedTo, newAssignedTo: assignedTo },
    }).catch(() => {});

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
