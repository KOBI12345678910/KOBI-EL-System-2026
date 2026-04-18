import { db } from "@workspace/db";
import { platformModulesTable, moduleEntitiesTable, entityFieldsTable, entityStatusesTable, entityRelationsTable, platformWorkflowsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

async function fieldExists(entityId: number, slug: string): Promise<boolean> {
  const [existing] = await db.select({ id: entityFieldsTable.id })
    .from(entityFieldsTable)
    .where(and(eq(entityFieldsTable.entityId, entityId), eq(entityFieldsTable.slug, slug)));
  return !!existing;
}

async function statusExists(entityId: number, slug: string): Promise<boolean> {
  const [existing] = await db.select({ id: entityStatusesTable.id })
    .from(entityStatusesTable)
    .where(and(eq(entityStatusesTable.entityId, entityId), eq(entityStatusesTable.slug, slug)));
  return !!existing;
}

async function ensureFields(entityId: number, fields: Array<{
  name: string; slug: string; fieldType: string; sortOrder: number;
  showInList?: boolean; showInForm?: boolean; isRequired?: boolean;
  groupName?: string; placeholder?: string; options?: any[];
  fieldWidth?: string; helpText?: string; defaultValue?: string;
  relatedEntityId?: number; relatedDisplayField?: string; relationType?: string;
  isSearchable?: boolean; isFilterable?: boolean; isSortable?: boolean;
}>) {
  for (const f of fields) {
    if (await fieldExists(entityId, f.slug)) continue;
    try {
      await db.insert(entityFieldsTable).values({
        entityId,
        name: f.name,
        slug: f.slug,
        fieldType: f.fieldType,
        sortOrder: f.sortOrder,
        showInList: f.showInList ?? true,
        showInForm: f.showInForm ?? true,
        isRequired: f.isRequired ?? false,
        groupName: f.groupName,
        placeholder: f.placeholder,
        options: f.options || [],
        fieldWidth: f.fieldWidth || "full",
        helpText: f.helpText,
        defaultValue: f.defaultValue,
        relatedEntityId: f.relatedEntityId,
        relatedDisplayField: f.relatedDisplayField,
        relationType: f.relationType,
        isSearchable: f.isSearchable ?? true,
        isFilterable: f.isFilterable ?? false,
        isSortable: f.isSortable ?? true,
      });
    } catch (err: any) {
      console.error(`[seed] Failed to insert field "${f.slug}" for entity ${entityId}: ${err.message}`);
    }
  }
}

async function ensureStatuses(entityId: number, statuses: Array<{
  name: string; slug: string; color: string; sortOrder: number;
  isDefault?: boolean; isFinal?: boolean;
}>) {
  for (const s of statuses) {
    if (await statusExists(entityId, s.slug)) continue;
    try {
      await db.insert(entityStatusesTable).values({
        entityId,
        name: s.name,
        slug: s.slug,
        color: s.color,
        sortOrder: s.sortOrder,
        isDefault: s.isDefault ?? false,
        isFinal: s.isFinal ?? false,
      });
    } catch (err: any) {
      console.error(`[seed] Failed to insert status "${s.slug}" for entity ${entityId}: ${err.message}`);
    }
  }
}

async function ensureInlineChildRelation(
  parentEntityId: number,
  childEntityId: number,
  label: string,
  reverseLabel: string,
  targetFieldSlug: string,
  sortOrder: number,
  settings?: Record<string, any>,
) {
  const existing = await db.select().from(entityRelationsTable)
    .where(and(
      eq(entityRelationsTable.sourceEntityId, parentEntityId),
      eq(entityRelationsTable.targetEntityId, childEntityId),
    ));
  if (existing.length > 0) {
    if (settings) {
      await db.update(entityRelationsTable)
        .set({ settings })
        .where(eq(entityRelationsTable.id, existing[0].id));
    }
    return;
  }
  try {
    await db.insert(entityRelationsTable).values({
      sourceEntityId: parentEntityId,
      targetEntityId: childEntityId,
      relationType: "inline_child",
      targetFieldSlug,
      label,
      reverseLabel,
      cascadeDelete: true,
      sortOrder,
      settings: settings || {},
    });
  } catch (err: any) {
    console.error(`[seed] Failed to insert inline_child relation ${parentEntityId} -> ${childEntityId}: ${err.message}`);
  }
}

async function ensureModule(data: {
  name: string; slug: string; nameHe?: string; nameEn?: string;
  description?: string; icon?: string; color?: string; category?: string;
  sortOrder?: number;
}): Promise<number> {
  const [existing] = await db.select().from(platformModulesTable)
    .where(eq(platformModulesTable.slug, data.slug));
  if (existing) return existing.id;
  const [mod] = await db.insert(platformModulesTable).values({
    name: data.name,
    slug: data.slug,
    nameHe: data.nameHe,
    nameEn: data.nameEn,
    description: data.description || "",
    icon: data.icon || "Box",
    color: data.color || "blue",
    category: data.category || "כללי",
    sortOrder: data.sortOrder || 0,
    status: "active",
  }).returning();
  return mod.id;
}

async function ensureEntity(moduleId: number, data: {
  name: string; namePlural: string; slug: string; description?: string;
  icon?: string; entityType?: string; hasStatus?: boolean;
  hasCategories?: boolean; hasAttachments?: boolean; hasNotes?: boolean;
  hasAudit?: boolean; sortOrder?: number;
}): Promise<number> {
  const [existing] = await db.select().from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, data.slug));
  if (existing) {
    if (!existing.hasStatus && data.hasStatus) {
      await db.update(moduleEntitiesTable).set({ hasStatus: true }).where(eq(moduleEntitiesTable.id, existing.id));
    }
    return existing.id;
  }
  const [ent] = await db.insert(moduleEntitiesTable).values({
    moduleId,
    name: data.name,
    namePlural: data.namePlural,
    slug: data.slug,
    description: data.description || "",
    icon: data.icon || "FileText",
    entityType: data.entityType || "master",
    hasStatus: data.hasStatus ?? false,
    hasCategories: data.hasCategories ?? false,
    hasAttachments: data.hasAttachments ?? true,
    hasNotes: data.hasNotes ?? true,
    hasAudit: data.hasAudit ?? true,
    sortOrder: data.sortOrder || 0,
    isActive: true,
  }).returning();
  return ent.id;
}

export async function seedAllModules() {
  console.log("[seed] Starting modules & entities seeding...");

  await seedProductionEntities();
  await seedInstallationEnrichment();
  await seedMeasurementsEntity();
  await seedImportOperations();
  await seedDocumentSignatures();
  await seedProjectWorkPlans();
  await seedSupplierOpportunities();
  await seedApprovalsControl();
  await seedFieldMeasurementsModule();
  await seedMeetingsCalendar();
  await seedPurchaseInventoryEntities();

  await seedFinanceModule();

  await seedCrmMissingEntities();
  await seedFinanceMissingEntities();
  await seedHrMissingEntities();
  await seedProcurementMissingEntities();
  await seedProductionMissingEntities();

  await seedAccountingNewEntities();

  await repairRelationFields();

  await seedEmptyEntities();

  console.log("[seed] All modules & entities seeded successfully.");
}

async function seedMeetingsCalendar() {
  console.log("[seed] Creating Meetings Calendar module...");

  const moduleId = await ensureModule({
    name: "יומן פגישות",
    slug: "meetings",
    nameHe: "יומן פגישות",
    nameEn: "Meetings Calendar",
    description: "ניהול פגישות, תזכורות, ולוח שנה — כולל שליחת הזמנות ב-WhatsApp ומייל",
    icon: "CalendarDays",
    color: "#8B5CF6",
    category: "CRM",
    sortOrder: 10,
  });

  const entityId = await ensureEntity(moduleId, {
    name: "פגישה",
    namePlural: "פגישות",
    slug: "meeting",
    description: "ניהול פגישות עם לקוחות, ספקים ואנשי צוות",
    icon: "CalendarDays",
    entityType: "transaction",
    hasStatus: true,
    hasCategories: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(entityId, [
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פגישה", showInList: true, isSearchable: true },
    { name: "תאריך ושעת התחלה", slug: "start_datetime", fieldType: "datetime", sortOrder: 2, isRequired: true, groupName: "פרטי פגישה", showInList: true, isFilterable: true },
    { name: "תאריך ושעת סיום", slug: "end_datetime", fieldType: "datetime", sortOrder: 3, groupName: "פרטי פגישה", showInList: true },
    { name: "משתתפים", slug: "participants", fieldType: "textarea", sortOrder: 4, groupName: "פרטי פגישה", helpText: "שמות המשתתפים, מופרדים בפסיקים", showInList: true },
    { name: "טלפון משתתף", slug: "participant_phone", fieldType: "text", sortOrder: 5, groupName: "פרטי פגישה", helpText: "מספר טלפון ליצירת קשר / שליחת WhatsApp" },
    { name: "אימייל משתתף", slug: "participant_email", fieldType: "text", sortOrder: 6, groupName: "פרטי פגישה", helpText: "כתובת אימייל לשליחת הזמנה" },
    { name: "מיקום", slug: "location", fieldType: "text", sortOrder: 7, groupName: "פרטי פגישה", showInList: true },
    { name: "קישור לשיחת וידאו", slug: "video_link", fieldType: "text", sortOrder: 8, groupName: "פרטי פגישה", helpText: "קישור ל-Zoom, Google Meet, Teams וכו׳" },
    { name: "נושא", slug: "subject", fieldType: "text", sortOrder: 9, groupName: "תוכן", showInList: true },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 10, groupName: "תוכן" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 11, groupName: "תוכן" },
    { name: "קטגוריה", slug: "meeting_category", fieldType: "select", sortOrder: 12, groupName: "סיווג", isFilterable: true, options: [
      { label: "פגישת לקוח", value: "client" },
      { label: "פגישת ספק", value: "supplier" },
      { label: "פגישת צוות", value: "team" },
      { label: "פגישת הנהלה", value: "management" },
      { label: "אחר", value: "other" },
    ]},
    { name: "תזכורת נשלחה", slug: "reminder_sent", fieldType: "select", sortOrder: 13, groupName: "תזכורות", showInList: false, options: [
      { label: "לא", value: "no" },
      { label: "24 שעות לפני", value: "24h" },
      { label: "שעה לפני", value: "1h" },
      { label: "שניהם", value: "both" },
    ]},
    { name: "הזמנה נשלחה ב-WhatsApp", slug: "whatsapp_sent", fieldType: "select", sortOrder: 14, groupName: "תזכורות", options: [
      { label: "לא", value: "no" },
      { label: "כן", value: "yes" },
    ]},
    { name: "הזמנה נשלחה במייל", slug: "email_sent", fieldType: "select", sortOrder: 15, groupName: "תזכורות", options: [
      { label: "לא", value: "no" },
      { label: "כן", value: "yes" },
    ]},
  ]);

  await ensureStatuses(entityId, [
    { name: "מתוכננת", slug: "planned", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "אושרה", slug: "confirmed", color: "#8B5CF6", sortOrder: 1 },
    { name: "בוצעה", slug: "completed", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "בוטלה", slug: "cancelled", color: "#EF4444", sortOrder: 3, isFinal: true },
    { name: "נדחתה", slug: "postponed", color: "#F59E0B", sortOrder: 4 },
  ]);
}

async function repairRelationFields() {
  const repairs: Array<{ entitySlug: string; fieldSlug: string; targetEntitySlug: string }> = [
    { entitySlug: "measurement", fieldSlug: "work_order_ref", targetEntitySlug: "work-order" },
    { entitySlug: "work-plan", fieldSlug: "customer_ref", targetEntitySlug: "customer" },
    { entitySlug: "work-plan", fieldSlug: "related_quote_ref", targetEntitySlug: "quote" },
    { entitySlug: "work-plan", fieldSlug: "related_work_order_ref", targetEntitySlug: "work-order" },
    { entitySlug: "approval-request", fieldSlug: "related_project_ref", targetEntitySlug: "work-plan" },
    { entitySlug: "approval-request", fieldSlug: "related_quote_ref", targetEntitySlug: "quote" },
    { entitySlug: "approval-request", fieldSlug: "related_work_order_ref", targetEntitySlug: "work-order" },
    { entitySlug: "field-measurement", fieldSlug: "work_order_ref", targetEntitySlug: "work-order" },
    { entitySlug: "field-measurement", fieldSlug: "customer_ref", targetEntitySlug: "customer" },
    { entitySlug: "production-work-instructions", fieldSlug: "field_measurement_ref", targetEntitySlug: "field-measurement" },
    { entitySlug: "field-work-instructions", fieldSlug: "field_measurement_ref", targetEntitySlug: "field-measurement" },
    { entitySlug: "import-order", fieldSlug: "foreign_supplier_ref", targetEntitySlug: "foreign-supplier" },
    { entitySlug: "import-order", fieldSlug: "shipment_ref", targetEntitySlug: "shipment-tracking" },
    { entitySlug: "shipment-tracking", fieldSlug: "import_order_ref", targetEntitySlug: "import-order" },
    { entitySlug: "customs-clearance", fieldSlug: "shipment_ref", targetEntitySlug: "shipment-tracking" },
    { entitySlug: "landed-cost", fieldSlug: "import_order_ref", targetEntitySlug: "import-order" },
    { entitySlug: "import-document", fieldSlug: "import_order_ref", targetEntitySlug: "import-order" },
    { entitySlug: "import-document", fieldSlug: "supplier_ref", targetEntitySlug: "foreign-supplier" },
    { entitySlug: "letter-of-credit", fieldSlug: "import_order_ref", targetEntitySlug: "import-order" },
    { entitySlug: "letter-of-credit", fieldSlug: "supplier_ref", targetEntitySlug: "foreign-supplier" },
    { entitySlug: "import-insurance", fieldSlug: "shipment_ref", targetEntitySlug: "shipment-tracking" },
  ];

  for (const r of repairs) {
    const entityId = await getEntityIdBySlug(r.entitySlug);
    const targetId = await getEntityIdBySlug(r.targetEntitySlug);
    if (!entityId || !targetId) continue;

    await db.update(entityFieldsTable)
      .set({ relatedEntityId: targetId, fieldType: "relation" })
      .where(and(
        eq(entityFieldsTable.entityId, entityId),
        eq(entityFieldsTable.slug, r.fieldSlug),
        sql`(${entityFieldsTable.relatedEntityId} IS NULL OR ${entityFieldsTable.relatedEntityId} != ${targetId})`
      ));
  }
}

async function getEntityIdBySlug(slug: string): Promise<number | null> {
  const [entity] = await db.select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, slug));
  return entity?.id ?? null;
}

async function getModuleIdBySlug(slug: string): Promise<number | null> {
  const [mod] = await db.select({ id: platformModulesTable.id })
    .from(platformModulesTable)
    .where(eq(platformModulesTable.slug, slug));
  return mod?.id ?? null;
}

async function seedProductionEntities() {
  console.log("[seed] Enriching Production entities...");

  const workOrderId = await getEntityIdBySlug("work-order");
  const bomId = await getEntityIdBySlug("bom");
  const prodLineId = await getEntityIdBySlug("production-line");
  const qcId = await getEntityIdBySlug("quality-control");

  if (!workOrderId || !bomId || !prodLineId || !qcId) {
    console.warn("[seed] Production entities not found, skipping enrichment");
    return;
  }

  for (const id of [workOrderId, bomId, prodLineId, qcId]) {
    await db.update(moduleEntitiesTable).set({ hasStatus: true }).where(eq(moduleEntitiesTable.id, id));
  }

  await ensureFields(workOrderId, [
    { name: "מספר הזמנה", slug: "order_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הזמנה" },
    { name: "שם מוצר", slug: "product_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי הזמנה" },
    { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "פרטי הזמנה" },
    { name: "יחידת מידה", slug: "unit", fieldType: "select", sortOrder: 4, groupName: "פרטי הזמנה", options: [
      { label: "יחידה", value: "unit" }, { label: "מטר", value: "meter" }, { label: "ק\"ג", value: "kg" }, { label: "ליטר", value: "liter" }
    ]},
    { name: "לקוח", slug: "customer_name", fieldType: "text", sortOrder: 5, groupName: "פרטי הזמנה" },
    { name: "קו ייצור", slug: "production_line", fieldType: "select", sortOrder: 6, groupName: "תכנון", options: [
      { label: "קו A", value: "line_a" }, { label: "קו B", value: "line_b" }, { label: "קו C", value: "line_c" }
    ]},
    { name: "תאריך תחילה", slug: "start_date", fieldType: "date", sortOrder: 7, groupName: "תכנון" },
    { name: "תאריך יעד", slug: "due_date", fieldType: "date", sortOrder: 8, isRequired: true, groupName: "תכנון" },
    { name: "תאריך סיום בפועל", slug: "actual_end_date", fieldType: "date", sortOrder: 9, groupName: "תכנון" },
    { name: "עדיפות", slug: "priority", fieldType: "select", sortOrder: 10, groupName: "תכנון", isFilterable: true, options: [
      { label: "נמוכה", value: "low" }, { label: "רגילה", value: "normal" }, { label: "גבוהה", value: "high" }, { label: "דחופה", value: "urgent" }
    ]},
    { name: "אחראי", slug: "assigned_to", fieldType: "text", sortOrder: 11, groupName: "תכנון" },
    { name: "חומרים נדרשים", slug: "materials_required", fieldType: "textarea", sortOrder: 12, groupName: "חומרים", helpText: "רשום חומרי גלם נדרשים, כמויות" },
    { name: "עלות חומרים", slug: "materials_cost", fieldType: "number", sortOrder: 13, groupName: "חומרים" },
    { name: "עלות עבודה", slug: "labor_cost", fieldType: "number", sortOrder: 14, groupName: "עלויות" },
    { name: "עלות כוללת", slug: "total_cost", fieldType: "number", sortOrder: 15, groupName: "עלויות" },
    { name: "הערות ייצור", slug: "production_notes", fieldType: "textarea", sortOrder: 16, groupName: "כללי" },
    { name: "הוראות עבודה", slug: "work_instructions", fieldType: "textarea", sortOrder: 17, groupName: "כללי", helpText: "שלבי ייצור והוראות מיוחדות" },
    { name: "אחוז התקדמות", slug: "progress_percent", fieldType: "number", sortOrder: 18, groupName: "מעקב" },
  ]);

  await ensureStatuses(workOrderId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מתוכננת", slug: "planned", color: "#3B82F6", sortOrder: 1 },
    { name: "בייצור", slug: "in_production", color: "#F59E0B", sortOrder: 2 },
    { name: "בבקרת איכות", slug: "in_qc", color: "#8B5CF6", sortOrder: 3 },
    { name: "הושלמה", slug: "completed", color: "#22C55E", sortOrder: 4, isFinal: true },
    { name: "בהמתנה", slug: "on_hold", color: "#EF4444", sortOrder: 5 },
    { name: "בוטלה", slug: "cancelled", color: "#9CA3AF", sortOrder: 6, isFinal: true },
  ]);

  await ensureFields(bomId, [
    { name: "מק\"ט מוצר", slug: "product_code", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מוצר" },
    { name: "שם מוצר", slug: "product_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי מוצר" },
    { name: "גרסה", slug: "version", fieldType: "text", sortOrder: 3, groupName: "פרטי מוצר", defaultValue: "1.0" },
    { name: "רמת BOM", slug: "bom_level", fieldType: "select", sortOrder: 4, groupName: "מבנה", options: [
      { label: "ראשי", value: "top" }, { label: "תת-הרכבה", value: "sub" }, { label: "רכיב", value: "component" }
    ]},
    { name: "רכיב אב", slug: "parent_item", fieldType: "text", sortOrder: 5, groupName: "מבנה" },
    { name: "רכיבים (JSON)", slug: "components_json", fieldType: "textarea", sortOrder: 6, groupName: "מבנה", helpText: "רשימת רכיבים ותת-הרכבות" },
    { name: "כמות ליחידה", slug: "quantity_per_unit", fieldType: "number", sortOrder: 7, groupName: "כמויות" },
    { name: "יחידת מידה", slug: "unit", fieldType: "select", sortOrder: 8, groupName: "כמויות", options: [
      { label: "יחידה", value: "unit" }, { label: "מטר", value: "meter" }, { label: "ק\"ג", value: "kg" }
    ]},
    { name: "עלות חומרים", slug: "material_cost", fieldType: "number", sortOrder: 9, groupName: "עלויות" },
    { name: "עלות עבודה", slug: "labor_cost", fieldType: "number", sortOrder: 10, groupName: "עלויות" },
    { name: "עלות כוללת מצטברת", slug: "rolled_up_cost", fieldType: "number", sortOrder: 11, groupName: "עלויות", helpText: "עלות כוללת כולל תת-הרכבות" },
    { name: "ספק מועדף", slug: "preferred_supplier", fieldType: "text", sortOrder: 12, groupName: "אספקה" },
    { name: "זמן אספקה (ימים)", slug: "lead_time_days", fieldType: "number", sortOrder: 13, groupName: "אספקה" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 14, groupName: "כללי" },
  ]);

  await ensureStatuses(bomId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 1 },
    { name: "לא פעיל", slug: "inactive", color: "#9CA3AF", sortOrder: 2 },
    { name: "בבדיקה", slug: "under_review", color: "#F59E0B", sortOrder: 3 },
  ]);

  await ensureFields(prodLineId, [
    { name: "שם קו", slug: "line_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי קו" },
    { name: "קוד קו", slug: "line_code", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי קו" },
    { name: "מיקום", slug: "location", fieldType: "text", sortOrder: 3, groupName: "פרטי קו" },
    { name: "סוג ייצור", slug: "production_type", fieldType: "select", sortOrder: 4, groupName: "פרטי קו", options: [
      { label: "אלומיניום", value: "aluminum" }, { label: "פלדה", value: "steel" }, { label: "עץ", value: "wood" }, { label: "משולב", value: "mixed" }
    ]},
    { name: "קיבולת יומית", slug: "daily_capacity", fieldType: "number", sortOrder: 5, groupName: "קיבולת", helpText: "מספר יחידות ביום" },
    { name: "קיבולת שבועית", slug: "weekly_capacity", fieldType: "number", sortOrder: 6, groupName: "קיבולת" },
    { name: "ניצולת נוכחית (%)", slug: "utilization_percent", fieldType: "number", sortOrder: 7, groupName: "קיבולת" },
    { name: "מכונות", slug: "machines", fieldType: "textarea", sortOrder: 8, groupName: "ציוד", helpText: "רשימת מכונות ותחנות עבודה" },
    { name: "עובדים משוייכים", slug: "assigned_workers", fieldType: "number", sortOrder: 9, groupName: "כוח אדם" },
    { name: "ראש צוות", slug: "team_leader", fieldType: "text", sortOrder: 10, groupName: "כוח אדם" },
    { name: "תאריך תחזוקה הבא", slug: "next_maintenance_date", fieldType: "date", sortOrder: 11, groupName: "תחזוקה" },
    { name: "הערות תחזוקה", slug: "maintenance_notes", fieldType: "textarea", sortOrder: 12, groupName: "תחזוקה" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 13, groupName: "כללי" },
  ]);

  await ensureStatuses(prodLineId, [
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 0, isDefault: true },
    { name: "בתחזוקה", slug: "maintenance", color: "#F59E0B", sortOrder: 1 },
    { name: "מושבת", slug: "offline", color: "#EF4444", sortOrder: 2 },
    { name: "לא פעיל", slug: "inactive", color: "#9CA3AF", sortOrder: 3 },
  ]);

  await ensureFields(qcId, [
    { name: "מספר בדיקה", slug: "inspection_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי בדיקה" },
    { name: "הזמנת עבודה", slug: "work_order_ref", fieldType: "text", sortOrder: 2, groupName: "פרטי בדיקה" },
    { name: "שם מוצר", slug: "product_name", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי בדיקה" },
    { name: "מק\"ט", slug: "product_code", fieldType: "text", sortOrder: 4, groupName: "פרטי בדיקה" },
    { name: "סוג בדיקה", slug: "inspection_type", fieldType: "select", sortOrder: 5, groupName: "בדיקה", isFilterable: true, options: [
      { label: "בדיקת כניסה", value: "incoming" }, { label: "בדיקת תהליך", value: "in_process" },
      { label: "בדיקה סופית", value: "final" }, { label: "בדיקת לקוח", value: "customer" }
    ]},
    { name: "תאריך בדיקה", slug: "inspection_date", fieldType: "date", sortOrder: 6, groupName: "בדיקה" },
    { name: "בודק", slug: "inspector_name", fieldType: "text", sortOrder: 7, groupName: "בדיקה" },
    { name: "תוצאה", slug: "result", fieldType: "select", sortOrder: 8, groupName: "תוצאות", isFilterable: true, options: [
      { label: "עבר", value: "pass" }, { label: "נכשל", value: "fail" }, { label: "עבר עם הערות", value: "pass_with_notes" }
    ]},
    { name: "רשימת בדיקות", slug: "checklist_items", fieldType: "textarea", sortOrder: 9, groupName: "תוצאות", helpText: "רשימת פריטים לבדיקה ותוצאות" },
    { name: "מידות נמדדו", slug: "measured_dimensions", fieldType: "textarea", sortOrder: 10, groupName: "תוצאות" },
    { name: "סטיות שנמצאו", slug: "deviations", fieldType: "textarea", sortOrder: 11, groupName: "פגמים" },
    { name: "סוג פגם", slug: "defect_type", fieldType: "select", sortOrder: 12, groupName: "פגמים", options: [
      { label: "ויזואלי", value: "visual" }, { label: "מידתי", value: "dimensional" },
      { label: "פונקציונלי", value: "functional" }, { label: "חומר", value: "material" }
    ]},
    { name: "חומרת פגם", slug: "defect_severity", fieldType: "select", sortOrder: 13, groupName: "פגמים", options: [
      { label: "קל", value: "minor" }, { label: "בינוני", value: "moderate" }, { label: "חמור", value: "critical" }
    ]},
    { name: "פעולה מתקנת", slug: "corrective_action", fieldType: "textarea", sortOrder: 14, groupName: "פגמים" },
    { name: "כמות שנבדקה", slug: "quantity_inspected", fieldType: "number", sortOrder: 15, groupName: "כמויות" },
    { name: "כמות שעברה", slug: "quantity_passed", fieldType: "number", sortOrder: 16, groupName: "כמויות" },
    { name: "כמות שנפסלה", slug: "quantity_rejected", fieldType: "number", sortOrder: 17, groupName: "כמויות" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 18, groupName: "כללי" },
  ]);

  await ensureStatuses(qcId, [
    { name: "ממתינה", slug: "pending", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בבדיקה", slug: "in_inspection", color: "#3B82F6", sortOrder: 1 },
    { name: "עברה", slug: "passed", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "נכשלה", slug: "failed", color: "#EF4444", sortOrder: 3 },
    { name: "בטיפול", slug: "rework", color: "#F59E0B", sortOrder: 4 },
  ]);
}

async function seedInstallationEnrichment() {
  console.log("[seed] Enriching Installation entities...");

  const installerId = await getEntityIdBySlug("installer");
  const installationId = await getEntityIdBySlug("installation");

  if (!installerId || !installationId) {
    console.warn("[seed] Installer/Installation entities not found, skipping enrichment");
    return;
  }

  await ensureFields(installerId, [
    { name: "הסמכות", slug: "certifications", fieldType: "textarea", sortOrder: 12, groupName: "כישורים", helpText: "רשימת הסמכות והשתלמויות" },
    { name: "אזור פעילות", slug: "service_area", fieldType: "text", sortOrder: 13, groupName: "כישורים" },
    { name: "סוגי התקנה", slug: "installation_types", fieldType: "textarea", sortOrder: 14, groupName: "כישורים", helpText: "סוגי התקנות שהמתקין מוסמך לבצע" },
    { name: "מסמכי ביטוח", slug: "insurance_docs", fieldType: "text", sortOrder: 15, groupName: "מסמכים" },
    { name: "תוקף ביטוח", slug: "insurance_expiry", fieldType: "date", sortOrder: 16, groupName: "מסמכים" },
    { name: "התקנות שבוצעו", slug: "total_installations", fieldType: "number", sortOrder: 17, groupName: "ביצועים" },
    { name: "דירוג ממוצע", slug: "avg_rating", fieldType: "number", sortOrder: 18, groupName: "ביצועים" },
  ]);

  await ensureFields(installationId, [
    { name: "מדידות", slug: "measurements_data", fieldType: "textarea", sortOrder: 17, groupName: "מדידות", helpText: "נתוני מדידות מהשטח" },
    { name: "חתימת לקוח", slug: "customer_signature", fieldType: "text", sortOrder: 18, groupName: "חתימות", helpText: "שם החותם מטעם הלקוח" },
    { name: "תאריך חתימה", slug: "signature_date", fieldType: "date", sortOrder: 19, groupName: "חתימות" },
    { name: "אישור לקוח", slug: "customer_approved", fieldType: "select", sortOrder: 20, groupName: "חתימות", options: [
      { label: "ממתין", value: "pending" }, { label: "אושר", value: "approved" }, { label: "נדחה", value: "rejected" }
    ]},
    { name: "תמונות לפני", slug: "before_photos", fieldType: "text", sortOrder: 21, groupName: "תיעוד" },
    { name: "תמונות אחרי", slug: "after_photos", fieldType: "text", sortOrder: 22, groupName: "תיעוד" },
    { name: "הערות מדידה", slug: "measurement_notes", fieldType: "textarea", sortOrder: 23, groupName: "מדידות" },
    { name: "הזמנת עבודה קשורה", slug: "work_order_ref", fieldType: "text", sortOrder: 24, groupName: "קישורים" },
  ]);
}

async function seedMeasurementsEntity() {
  console.log("[seed] Creating Measurements entity...");
  const moduleId = await getModuleIdBySlug("installers");
  if (!moduleId) {
    console.warn("[seed] Installers module not found, skipping Measurements");
    return;
  }

  const entityId = await ensureEntity(moduleId, {
    name: "מדידה",
    namePlural: "מדידות",
    slug: "measurement",
    description: "ניהול מדידות פרויקטים — מידות, תמונות ואישורים",
    icon: "Ruler",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 3,
  });

  await ensureFields(entityId, [
    { name: "מספר מדידה", slug: "measurement_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטים" },
    { name: "פרויקט", slug: "project_name", fieldType: "text", sortOrder: 2, groupName: "פרטים" },
    { name: "לקוח", slug: "customer_name", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטים" },
    { name: "כתובת", slug: "site_address", fieldType: "text", sortOrder: 4, groupName: "פרטים" },
    { name: "תאריך מדידה", slug: "measurement_date", fieldType: "date", sortOrder: 5, isRequired: true, groupName: "פרטים" },
    { name: "מודד", slug: "measured_by", fieldType: "text", sortOrder: 6, groupName: "פרטים" },
    { name: "סוג מדידה", slug: "measurement_type", fieldType: "select", sortOrder: 7, groupName: "מדידות", options: [
      { label: "מדידה ראשונית", value: "initial" }, { label: "מדידת אימות", value: "verification" },
      { label: "מדידה סופית", value: "final" }
    ]},
    { name: "רוחב (מ\"מ)", slug: "width_mm", fieldType: "number", sortOrder: 8, groupName: "מידות" },
    { name: "גובה (מ\"מ)", slug: "height_mm", fieldType: "number", sortOrder: 9, groupName: "מידות" },
    { name: "עומק (מ\"מ)", slug: "depth_mm", fieldType: "number", sortOrder: 10, groupName: "מידות" },
    { name: "מידות נוספות", slug: "additional_dimensions", fieldType: "textarea", sortOrder: 11, groupName: "מידות" },
    { name: "הפניה לתמונות", slug: "photo_references", fieldType: "text", sortOrder: 12, groupName: "תיעוד" },
    { name: "הערות שטח", slug: "site_notes", fieldType: "textarea", sortOrder: 13, groupName: "תיעוד" },
    { name: "אישור לקוח", slug: "customer_confirmed", fieldType: "select", sortOrder: 14, groupName: "אישורים", options: [
      { label: "ממתין", value: "pending" }, { label: "אושר", value: "confirmed" }, { label: "נדחה", value: "rejected" }
    ]},
    { name: "שם מאשר", slug: "confirmed_by", fieldType: "text", sortOrder: 15, groupName: "אישורים" },
    { name: "תאריך אישור", slug: "confirmation_date", fieldType: "date", sortOrder: 16, groupName: "אישורים" },
    { name: "הועבר לייצור", slug: "transferred_to_production", fieldType: "select", sortOrder: 17, groupName: "מעקב", options: [
      { label: "לא", value: "no" }, { label: "כן", value: "yes" }
    ]},
    { name: "הזמנת עבודה", slug: "work_order_ref", fieldType: "relation", sortOrder: 18, groupName: "מעקב",
      relatedEntityId: await getEntityIdBySlug("work-order") || undefined,
      relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "תאריך העברה לייצור", slug: "transfer_date", fieldType: "date", sortOrder: 19, groupName: "מעקב", helpText: "תאריך בו הועברו המדידות לייצור" },
  ]);

  await ensureStatuses(entityId, [
    { name: "חדשה", slug: "new", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בביצוע", slug: "in_progress", color: "#3B82F6", sortOrder: 1 },
    { name: "ממתינה לאישור", slug: "pending_approval", color: "#F59E0B", sortOrder: 2 },
    { name: "אושרה", slug: "approved", color: "#22C55E", sortOrder: 3 },
    { name: "הועברה לייצור", slug: "transferred", color: "#8B5CF6", sortOrder: 4, isFinal: true },
  ]);
}

async function seedImportOperations() {
  console.log("[seed] Creating Import Operations module...");

  const moduleId = await ensureModule({
    name: "יבוא",
    slug: "imports",
    nameHe: "יבוא",
    nameEn: "Import Operations",
    description: "ניהול פעולות יבוא — הזמנות, ספקי חו\"ל, מעקב משלוחים, מכס, עלויות נחיתה, מסמכים, L/C, ביטוח",
    icon: "Ship",
    color: "#0EA5E9",
    category: "רכש וספקים",
    sortOrder: 8,
  });

  await db.update(platformModulesTable)
    .set({ category: "רכש וספקים" })
    .where(eq(platformModulesTable.slug, "imports"));

  const importOrderId = await ensureEntity(moduleId, {
    name: "הזמנת יבוא",
    namePlural: "הזמנות יבוא",
    slug: "import-order",
    description: "מעקב הזמנות יבוא מספקים בחו\"ל",
    icon: "Ship",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(importOrderId, [
    { name: "מספר הזמנת יבוא", slug: "import_order_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הזמנה" },
    { name: "ספק חו\"ל", slug: "foreign_supplier_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי הזמנה",
      relatedEntityId: await getEntityIdBySlug("foreign-supplier") || undefined,
      relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "מדינת מקור", slug: "origin_country", fieldType: "text", sortOrder: 3, groupName: "פרטי הזמנה" },
    { name: "תיאור סחורה", slug: "goods_description", fieldType: "textarea", sortOrder: 4, groupName: "פרטי הזמנה" },
    { name: "תנאי סחר (Incoterms)", slug: "incoterms", fieldType: "select", sortOrder: 5, groupName: "פרטי הזמנה", options: [
      { label: "EXW", value: "EXW" }, { label: "FOB", value: "FOB" }, { label: "CIF", value: "CIF" },
      { label: "CFR", value: "CFR" }, { label: "DDP", value: "DDP" }, { label: "DAP", value: "DAP" },
      { label: "FCA", value: "FCA" }, { label: "CPT", value: "CPT" }, { label: "CIP", value: "CIP" }
    ]},
    { name: "סיווג מכס (HS Code)", slug: "hs_code", fieldType: "text", sortOrder: 6, groupName: "פרטי הזמנה", helpText: "קוד סיווג מכס בינלאומי" },
    { name: "תאריך הזמנה", slug: "order_date", fieldType: "date", sortOrder: 7, groupName: "תאריכים" },
    { name: "תאריך שילוח צפוי", slug: "expected_ship_date", fieldType: "date", sortOrder: 8, groupName: "תאריכים" },
    { name: "תאריך הגעה צפוי", slug: "expected_arrival_date", fieldType: "date", sortOrder: 9, groupName: "תאריכים" },
    { name: "תאריך הגעה בפועל", slug: "actual_arrival_date", fieldType: "date", sortOrder: 10, groupName: "תאריכים" },
    { name: "שיטת שילוח", slug: "shipping_method", fieldType: "select", sortOrder: 11, groupName: "שילוח", options: [
      { label: "ים", value: "sea" }, { label: "אוויר", value: "air" }, { label: "יבשה", value: "land" }, { label: "משולב", value: "combined" }
    ]},
    { name: "מספר מכולה", slug: "container_number", fieldType: "text", sortOrder: 12, groupName: "שילוח" },
    { name: "סוג מכולה", slug: "container_type", fieldType: "select", sortOrder: 13, groupName: "שילוח", options: [
      { label: "20'", value: "20ft" }, { label: "40'", value: "40ft" }, { label: "40' HC", value: "40ft_hc" }, { label: "חלקי", value: "lcl" }
    ]},
    { name: "שם חברת שילוח", slug: "shipping_company", fieldType: "text", sortOrder: 14, groupName: "שילוח" },
    { name: "מספר B/L", slug: "bill_of_lading", fieldType: "text", sortOrder: 15, groupName: "מסמכי מכס" },
    { name: "מספר רשימון", slug: "customs_declaration", fieldType: "text", sortOrder: 16, groupName: "מסמכי מכס" },
    { name: "עמיל מכס", slug: "customs_broker", fieldType: "text", sortOrder: 17, groupName: "מסמכי מכס" },
    { name: "ערך FOB", slug: "fob_value", fieldType: "number", sortOrder: 18, groupName: "עלויות" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 19, groupName: "עלויות", options: [
      { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CNY", value: "CNY" }, { label: "ILS", value: "ILS" }
    ]},
    { name: "עלות הובלה", slug: "freight_cost", fieldType: "number", sortOrder: 20, groupName: "עלויות" },
    { name: "עלות ביטוח", slug: "insurance_cost", fieldType: "number", sortOrder: 21, groupName: "עלויות" },
    { name: "מכס", slug: "customs_duty", fieldType: "number", sortOrder: 22, groupName: "עלויות" },
    { name: "מס קנייה", slug: "purchase_tax", fieldType: "number", sortOrder: 23, groupName: "עלויות" },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 24, groupName: "עלויות" },
    { name: "עלות נחיתה כוללת", slug: "landed_cost", fieldType: "number", sortOrder: 25, groupName: "עלויות", helpText: "חישוב: FOB + הובלה + ביטוח + מכס + מס קנייה" },
    { name: "משלוח", slug: "shipment_ref", fieldType: "relation", sortOrder: 26, groupName: "שילוח",
      relatedEntityId: await getEntityIdBySlug("shipment-tracking") || undefined,
      relatedDisplayField: "shipment_number", relationType: "many_to_one" },
    { name: "נמל יעד", slug: "destination_port", fieldType: "text", sortOrder: 27, groupName: "שילוח" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 28, groupName: "כללי" },
  ]);

  await ensureStatuses(importOrderId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "הוזמן", slug: "ordered", color: "#3B82F6", sortOrder: 1 },
    { name: "בייצור אצל ספק", slug: "in_production", color: "#8B5CF6", sortOrder: 2 },
    { name: "נשלח", slug: "shipped", color: "#F59E0B", sortOrder: 3 },
    { name: "במכס", slug: "in_customs", color: "#EC4899", sortOrder: 4 },
    { name: "שוחרר", slug: "cleared", color: "#10B981", sortOrder: 5 },
    { name: "התקבל", slug: "received", color: "#22C55E", sortOrder: 6, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 7, isFinal: true },
  ]);

  const foreignSupplierId = await ensureEntity(moduleId, {
    name: "ספק חו\"ל",
    namePlural: "ספקי חו\"ל",
    slug: "foreign-supplier",
    description: "ניהול ספקים בינלאומיים — פרטי קשר, תנאי סחר, מטבע, דירוג",
    icon: "Globe",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 2,
  });

  await ensureFields(foreignSupplierId, [
    { name: "שם ספק", slug: "supplier_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי ספק" },
    { name: "מדינה", slug: "country", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי ספק" },
    { name: "עיר", slug: "city", fieldType: "text", sortOrder: 3, groupName: "פרטי ספק" },
    { name: "כתובת", slug: "address", fieldType: "textarea", sortOrder: 4, groupName: "פרטי ספק" },
    { name: "איש קשר", slug: "contact_person", fieldType: "text", sortOrder: 5, groupName: "פרטי קשר" },
    { name: "טלפון", slug: "phone", fieldType: "text", sortOrder: 6, groupName: "פרטי קשר" },
    { name: "מייל", slug: "email", fieldType: "text", sortOrder: 7, groupName: "פרטי קשר" },
    { name: "אתר אינטרנט", slug: "website", fieldType: "text", sortOrder: 8, groupName: "פרטי קשר" },
    { name: "מטבע ברירת מחדל", slug: "default_currency", fieldType: "select", sortOrder: 9, groupName: "תנאי סחר", options: [
      { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CNY", value: "CNY" }, { label: "ILS", value: "ILS" }
    ]},
    { name: "תנאי סחר (Incoterms)", slug: "incoterms", fieldType: "select", sortOrder: 10, groupName: "תנאי סחר", options: [
      { label: "EXW", value: "EXW" }, { label: "FOB", value: "FOB" }, { label: "CIF", value: "CIF" },
      { label: "CFR", value: "CFR" }, { label: "DDP", value: "DDP" }, { label: "DAP", value: "DAP" },
      { label: "FCA", value: "FCA" }, { label: "CPT", value: "CPT" }, { label: "CIP", value: "CIP" }
    ]},
    { name: "תנאי תשלום", slug: "payment_terms", fieldType: "select", sortOrder: 11, groupName: "תנאי סחר", options: [
      { label: "מראש", value: "prepaid" }, { label: "שוטף + 30", value: "net30" }, { label: "שוטף + 60", value: "net60" },
      { label: "שוטף + 90", value: "net90" }, { label: "L/C", value: "lc" }, { label: "T/T", value: "tt" }
    ]},
    { name: "דירוג ספק", slug: "supplier_rating", fieldType: "select", sortOrder: 12, groupName: "תנאי סחר", options: [
      { label: "A - מצוין", value: "A" }, { label: "B - טוב", value: "B" }, { label: "C - בינוני", value: "C" }, { label: "D - חלש", value: "D" }
    ]},
    { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 13, groupName: "כללי" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 14, groupName: "כללי" },
  ]);

  await ensureStatuses(foreignSupplierId, [
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 0, isDefault: true },
    { name: "מושהה", slug: "suspended", color: "#F59E0B", sortOrder: 1 },
    { name: "מבוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const shipmentTrackingId = await ensureEntity(moduleId, {
    name: "מעקב משלוחים",
    namePlural: "מעקב משלוחים",
    slug: "shipment-tracking",
    description: "מעקב משלוחי יבוא — מכולות, B/L, נמלים, ETA, סטטוס",
    icon: "Ship",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 3,
  });

  await ensureFields(shipmentTrackingId, [
    { name: "מספר משלוח", slug: "shipment_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי משלוח" },
    { name: "הזמנת יבוא", slug: "import_order_ref", fieldType: "relation", sortOrder: 2, groupName: "פרטי משלוח",
      relatedEntityId: importOrderId, relatedDisplayField: "import_order_number", relationType: "many_to_one" },
    { name: "שיטת שילוח", slug: "shipping_method", fieldType: "select", sortOrder: 3, groupName: "שילוח", options: [
      { label: "ים", value: "sea" }, { label: "אוויר", value: "air" }, { label: "יבשה", value: "land" }, { label: "משולב", value: "combined" }
    ]},
    { name: "מספר מכולה", slug: "container_number", fieldType: "text", sortOrder: 4, groupName: "שילוח" },
    { name: "סוג מכולה", slug: "container_type", fieldType: "select", sortOrder: 5, groupName: "שילוח", options: [
      { label: "20'", value: "20ft" }, { label: "40'", value: "40ft" }, { label: "40' HC", value: "40ft_hc" }, { label: "חלקי (LCL)", value: "lcl" }
    ]},
    { name: "מספר B/L", slug: "bill_of_lading", fieldType: "text", sortOrder: 6, groupName: "שילוח" },
    { name: "חברת שילוח", slug: "shipping_company", fieldType: "text", sortOrder: 7, groupName: "שילוח" },
    { name: "נמל מוצא", slug: "origin_port", fieldType: "text", sortOrder: 8, groupName: "נמלים" },
    { name: "נמל יעד", slug: "destination_port", fieldType: "text", sortOrder: 9, groupName: "נמלים" },
    { name: "ETD (תאריך יציאה צפוי)", slug: "etd", fieldType: "date", sortOrder: 10, groupName: "תאריכים" },
    { name: "ETA (תאריך הגעה צפוי)", slug: "eta", fieldType: "date", sortOrder: 11, groupName: "תאריכים" },
    { name: "תאריך הגעה בפועל", slug: "actual_arrival_date", fieldType: "date", sortOrder: 12, groupName: "תאריכים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 13, groupName: "כללי" },
  ]);

  await ensureStatuses(shipmentTrackingId, [
    { name: "ממתין", slug: "pending", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נשלח", slug: "shipped", color: "#3B82F6", sortOrder: 1 },
    { name: "בדרך", slug: "in_transit", color: "#F59E0B", sortOrder: 2 },
    { name: "בנמל", slug: "at_port", color: "#8B5CF6", sortOrder: 3 },
    { name: "שוחרר", slug: "cleared", color: "#10B981", sortOrder: 4 },
    { name: "התקבל", slug: "received", color: "#22C55E", sortOrder: 5, isFinal: true },
  ]);

  const customsClearanceId = await ensureEntity(moduleId, {
    name: "שחרור מכס",
    namePlural: "שחרורי מכס",
    slug: "customs-clearance",
    description: "ניהול רשימוני מכס, עמיל מכס, סיווג, היטלים ואישורי תקן",
    icon: "FileCheck",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 4,
  });

  await ensureFields(customsClearanceId, [
    { name: "מספר רשימון", slug: "declaration_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי רשימון" },
    { name: "משלוח", slug: "shipment_ref", fieldType: "relation", sortOrder: 2, groupName: "פרטי רשימון",
      relatedEntityId: shipmentTrackingId, relatedDisplayField: "shipment_number", relationType: "many_to_one" },
    { name: "עמיל מכס", slug: "customs_broker", fieldType: "text", sortOrder: 3, groupName: "פרטי רשימון" },
    { name: "סיווג מכס (HS Code)", slug: "hs_code", fieldType: "text", sortOrder: 4, groupName: "פרטי רשימון", helpText: "קוד סיווג מכס בינלאומי" },
    { name: "שיעור מכס (%)", slug: "customs_rate", fieldType: "number", sortOrder: 5, groupName: "עלויות מכס" },
    { name: "מכס", slug: "customs_duty", fieldType: "number", sortOrder: 6, groupName: "עלויות מכס" },
    { name: "מס קנייה", slug: "purchase_tax", fieldType: "number", sortOrder: 7, groupName: "עלויות מכס" },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 8, groupName: "עלויות מכס" },
    { name: "אגרות נוספות", slug: "additional_fees", fieldType: "number", sortOrder: 9, groupName: "עלויות מכס" },
    { name: "תאריך הגשה", slug: "submission_date", fieldType: "date", sortOrder: 10, groupName: "תאריכים" },
    { name: "תאריך שחרור", slug: "clearance_date", fieldType: "date", sortOrder: 11, groupName: "תאריכים" },
    { name: "אישורי תקן", slug: "standard_approvals", fieldType: "textarea", sortOrder: 12, groupName: "אישורים", helpText: "פירוט אישורי תקן נדרשים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 13, groupName: "כללי" },
  ]);

  await ensureStatuses(customsClearanceId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "הוגש", slug: "submitted", color: "#3B82F6", sortOrder: 1 },
    { name: "בבדיקה", slug: "under_review", color: "#F59E0B", sortOrder: 2 },
    { name: "אושר", slug: "approved", color: "#8B5CF6", sortOrder: 3 },
    { name: "שוחרר", slug: "cleared", color: "#22C55E", sortOrder: 4, isFinal: true },
    { name: "עוכב", slug: "delayed", color: "#EF4444", sortOrder: 5 },
  ]);

  const landedCostId = await ensureEntity(moduleId, {
    name: "עלויות נחיתה",
    namePlural: "עלויות נחיתה",
    slug: "landed-cost",
    description: "חישוב עלות נחיתה מלאה — FOB, CIF, הובלה, ביטוח, מכס, מס קנייה, אגרות",
    icon: "Calculator",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 5,
  });

  await ensureFields(landedCostId, [
    { name: "הזמנת יבוא", slug: "import_order_ref", fieldType: "relation", sortOrder: 1, groupName: "קישור",
      relatedEntityId: importOrderId, relatedDisplayField: "import_order_number", relationType: "many_to_one" },
    { name: "ערך FOB", slug: "fob_value", fieldType: "number", sortOrder: 2, groupName: "עלויות" },
    { name: "ערך CIF", slug: "cif_value", fieldType: "number", sortOrder: 3, groupName: "עלויות" },
    { name: "עלות הובלה", slug: "freight_cost", fieldType: "number", sortOrder: 4, groupName: "עלויות" },
    { name: "עלות ביטוח", slug: "insurance_cost", fieldType: "number", sortOrder: 5, groupName: "עלויות" },
    { name: "מכס", slug: "customs_duty", fieldType: "number", sortOrder: 6, groupName: "עלויות" },
    { name: "מס קנייה", slug: "purchase_tax", fieldType: "number", sortOrder: 7, groupName: "עלויות" },
    { name: "אגרות", slug: "fees", fieldType: "number", sortOrder: 8, groupName: "עלויות" },
    { name: "עלות אחסנה", slug: "storage_cost", fieldType: "number", sortOrder: 9, groupName: "עלויות נוספות" },
    { name: "עלות הובלה פנימית", slug: "inland_transport_cost", fieldType: "number", sortOrder: 10, groupName: "עלויות נוספות" },
    { name: "עלות נחיתה כוללת", slug: "total_landed_cost", fieldType: "number", sortOrder: 11, groupName: "סיכום", helpText: "סך כל עלויות הנחיתה" },
    { name: "שער חליפין", slug: "exchange_rate", fieldType: "number", sortOrder: 12, groupName: "סיכום" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 13, groupName: "סיכום", options: [
      { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CNY", value: "CNY" }, { label: "ILS", value: "ILS" }
    ]},
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 14, groupName: "כללי" },
  ]);

  await ensureStatuses(landedCostId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בחישוב", slug: "calculating", color: "#3B82F6", sortOrder: 1 },
    { name: "סופי", slug: "finalized", color: "#22C55E", sortOrder: 2, isFinal: true },
  ]);

  const importDocumentId = await ensureEntity(moduleId, {
    name: "מסמך יבוא",
    namePlural: "מסמכי יבוא",
    slug: "import-document",
    description: "ניהול מסמכי יבוא — חשבונות ספק, רשימות אריזה, תעודות מקור, L/C",
    icon: "FileText",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 6,
  });

  await ensureFields(importDocumentId, [
    { name: "סוג מסמך", slug: "document_type", fieldType: "select", sortOrder: 1, isRequired: true, groupName: "פרטי מסמך", options: [
      { label: "Commercial Invoice", value: "commercial_invoice" }, { label: "Packing List", value: "packing_list" },
      { label: "Certificate of Origin", value: "certificate_of_origin" }, { label: "L/C", value: "lc" },
      { label: "Insurance", value: "insurance" }, { label: "תעודת תקן", value: "standard_cert" }, { label: "אחר", value: "other" }
    ]},
    { name: "הזמנת יבוא", slug: "import_order_ref", fieldType: "relation", sortOrder: 2, groupName: "קישורים",
      relatedEntityId: importOrderId, relatedDisplayField: "import_order_number", relationType: "many_to_one" },
    { name: "מספר מסמך", slug: "document_number", fieldType: "text", sortOrder: 3, groupName: "פרטי מסמך" },
    { name: "תאריך מסמך", slug: "document_date", fieldType: "date", sortOrder: 4, groupName: "פרטי מסמך" },
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 5, groupName: "קישורים",
      relatedEntityId: foreignSupplierId, relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 6, groupName: "פיננסי" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 7, groupName: "פיננסי", options: [
      { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CNY", value: "CNY" }, { label: "ILS", value: "ILS" }
    ]},
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  await ensureStatuses(importDocumentId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "התקבל", slug: "received", color: "#3B82F6", sortOrder: 1 },
    { name: "אושר", slug: "approved", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 3, isFinal: true },
  ]);

  const lcId = await ensureEntity(moduleId, {
    name: "אשראי דוקומנטרי (L/C)",
    namePlural: "אשראי דוקומנטרי (L/C)",
    slug: "letter-of-credit",
    description: "ניהול מכתבי אשראי דוקומנטרי — בנק פותח, בנק מודיע, תוקף, סכום, תנאים",
    icon: "CreditCard",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 7,
  });

  await ensureFields(lcId, [
    { name: "מספר L/C", slug: "lc_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי L/C" },
    { name: "הזמנת יבוא", slug: "import_order_ref", fieldType: "relation", sortOrder: 2, groupName: "קישורים",
      relatedEntityId: importOrderId, relatedDisplayField: "import_order_number", relationType: "many_to_one" },
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 3, groupName: "קישורים",
      relatedEntityId: foreignSupplierId, relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "בנק פותח", slug: "issuing_bank", fieldType: "text", sortOrder: 4, groupName: "פרטי בנק" },
    { name: "בנק מודיע", slug: "advising_bank", fieldType: "text", sortOrder: 5, groupName: "פרטי בנק" },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 6, groupName: "פיננסי" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 7, groupName: "פיננסי", options: [
      { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CNY", value: "CNY" }, { label: "ILS", value: "ILS" }
    ]},
    { name: "תאריך פתיחה", slug: "opening_date", fieldType: "date", sortOrder: 8, groupName: "תאריכים" },
    { name: "תאריך תוקף", slug: "expiry_date", fieldType: "date", sortOrder: 9, groupName: "תאריכים" },
    { name: "תנאים", slug: "conditions", fieldType: "textarea", sortOrder: 10, groupName: "תנאים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 11, groupName: "כללי" },
  ]);

  await ensureStatuses(lcId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נפתח", slug: "opened", color: "#3B82F6", sortOrder: 1 },
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 2 },
    { name: "בוצע", slug: "fulfilled", color: "#10B981", sortOrder: 3, isFinal: true },
    { name: "פג תוקף", slug: "expired", color: "#F59E0B", sortOrder: 4, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 5, isFinal: true },
  ]);

  const importInsuranceId = await ensureEntity(moduleId, {
    name: "ביטוח משלוחי יבוא",
    namePlural: "ביטוח משלוחי יבוא",
    slug: "import-insurance",
    description: "ניהול פוליסות ביטוח ימי/אווירי — כיסויים, פרמיות, תביעות",
    icon: "Shield",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 8,
  });

  await ensureFields(importInsuranceId, [
    { name: "מספר פוליסה", slug: "policy_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פוליסה" },
    { name: "משלוח", slug: "shipment_ref", fieldType: "relation", sortOrder: 2, groupName: "קישורים",
      relatedEntityId: shipmentTrackingId, relatedDisplayField: "shipment_number", relationType: "many_to_one" },
    { name: "חברת ביטוח", slug: "insurance_company", fieldType: "text", sortOrder: 3, groupName: "פרטי פוליסה" },
    { name: "סוג כיסוי", slug: "coverage_type", fieldType: "select", sortOrder: 4, groupName: "פרטי פוליסה", options: [
      { label: "All Risks", value: "all_risks" }, { label: "FPA", value: "fpa" },
      { label: "WA", value: "wa" }, { label: "ICC(A)", value: "icc_a" },
      { label: "ICC(B)", value: "icc_b" }, { label: "ICC(C)", value: "icc_c" }
    ]},
    { name: "סכום מבוטח", slug: "insured_amount", fieldType: "number", sortOrder: 5, groupName: "פיננסי" },
    { name: "פרמיה", slug: "premium", fieldType: "number", sortOrder: 6, groupName: "פיננסי" },
    { name: "תאריך תחילה", slug: "start_date", fieldType: "date", sortOrder: 7, groupName: "תאריכים" },
    { name: "תאריך סיום", slug: "end_date", fieldType: "date", sortOrder: 8, groupName: "תאריכים" },
    { name: "תביעות", slug: "claims", fieldType: "textarea", sortOrder: 9, groupName: "תביעות", helpText: "פירוט תביעות קיימות" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "כללי" },
  ]);

  await ensureStatuses(importInsuranceId, [
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 0, isDefault: true },
    { name: "פג תוקף", slug: "expired", color: "#F59E0B", sortOrder: 1, isFinal: true },
    { name: "תביעה פתוחה", slug: "claim_open", color: "#EF4444", sortOrder: 2 },
  ]);
}

async function seedDocumentSignatures() {
  console.log("[seed] Enriching Documents & Signatures entity...");

  const contractId = await getEntityIdBySlug("contract");
  if (!contractId) {
    console.warn("[seed] Contract entity not found, skipping Document enrichment");
    return;
  }

  await ensureFields(contractId, [
    { name: "סוג מסמך", slug: "document_category", fieldType: "select", sortOrder: 16, groupName: "סיווג", options: [
      { label: "חוזה", value: "contract" }, { label: "הסכם", value: "agreement" },
      { label: "אישור", value: "approval" }, { label: "ערבות", value: "guarantee" },
      { label: "ייפוי כוח", value: "power_of_attorney" }
    ]},
    { name: "גרסה", slug: "version_number", fieldType: "number", sortOrder: 17, groupName: "ניהול גרסאות", defaultValue: "1" },
    { name: "גרסה קודמת (מספר חוזה)", slug: "previous_version_ref", fieldType: "text", sortOrder: 18, groupName: "ניהול גרסאות" },
    { name: "חתימת ספק", slug: "supplier_signature", fieldType: "text", sortOrder: 19, groupName: "חתימות דיגיטליות" },
    { name: "תאריך חתימת ספק", slug: "supplier_signed_date", fieldType: "date", sortOrder: 20, groupName: "חתימות דיגיטליות" },
    { name: "חתימת קבלן", slug: "contractor_signature", fieldType: "text", sortOrder: 21, groupName: "חתימות דיגיטליות" },
    { name: "תאריך חתימת קבלן", slug: "contractor_signed_date", fieldType: "date", sortOrder: 22, groupName: "חתימות דיגיטליות" },
    { name: "חתימת לקוח", slug: "customer_signature", fieldType: "text", sortOrder: 23, groupName: "חתימות דיגיטליות" },
    { name: "תאריך חתימת לקוח", slug: "customer_signed_date", fieldType: "date", sortOrder: 24, groupName: "חתימות דיגיטליות" },
    { name: "חתימת מנהל", slug: "manager_signature", fieldType: "text", sortOrder: 25, groupName: "חתימות דיגיטליות" },
    { name: "תאריך חתימת מנהל", slug: "manager_signed_date", fieldType: "date", sortOrder: 26, groupName: "חתימות דיגיטליות" },
    { name: "תאריך תפוגה", slug: "expiry_date", fieldType: "date", sortOrder: 27, groupName: "תוקף" },
    { name: "תזכורת חידוש", slug: "renewal_reminder_date", fieldType: "date", sortOrder: 28, groupName: "תוקף" },
    { name: "ערך חוזי", slug: "contract_value", fieldType: "number", sortOrder: 29, groupName: "כספי" },
  ]);

  await ensureStatuses(contractId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נשלח לחתימה", slug: "sent_for_signing", color: "#3B82F6", sortOrder: 1 },
    { name: "חתום חלקית", slug: "partially_signed", color: "#F59E0B", sortOrder: 2 },
    { name: "חתום", slug: "signed", color: "#22C55E", sortOrder: 3 },
    { name: "פעיל", slug: "active", color: "#8B5CF6", sortOrder: 4 },
    { name: "פג תוקף", slug: "expired", color: "#EF4444", sortOrder: 5, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 6, isFinal: true },
    { name: "בארכיון", slug: "archived", color: "#6B7280", sortOrder: 7, isFinal: true },
  ]);
}

async function seedApprovalsControl() {
  console.log("[seed] Creating Approvals & Control module...");

  const moduleId = await ensureModule({
    name: "אישורים ובקרה",
    slug: "approvals",
    nameHe: "אישורים ובקרה",
    nameEn: "Approvals & Control",
    description: "ניהול אישורים, בקרת מדידות, אישור הצעות מחיר ומניעת הונאה",
    icon: "ShieldCheck",
    color: "#7C3AED",
    category: "ניהול",
    sortOrder: 9,
  });

  const entityId = await ensureEntity(moduleId, {
    name: "בקשת אישור",
    namePlural: "בקשות אישור",
    slug: "approval-request",
    description: "ניהול בקשות אישור, השוואת מדידות ושרשרת אישורים",
    icon: "ClipboardCheck",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(entityId, [
    { name: "מספר בקשה", slug: "request_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי בקשה" },
    { name: "סוג בקשה", slug: "request_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי בקשה", isFilterable: true, options: [
      { label: "אישור הצעת מחיר", value: "quote_approval" },
      { label: "אישור מדידות", value: "measurement_approval" },
      { label: "אישור פרויקט", value: "project_approval" },
      { label: "אישור רכש", value: "purchase_approval" },
      { label: "אישור התקנה", value: "installation_approval" },
      { label: "אישור חריגה", value: "exception_approval" },
    ]},
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי בקשה" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 4, groupName: "פרטי בקשה" },
    { name: "פרויקט קשור", slug: "related_project_ref", fieldType: "relation", sortOrder: 5, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("work-plan") || undefined,
      relatedDisplayField: "project_name", relationType: "many_to_one" },
    { name: "הצעת מחיר קשורה", slug: "related_quote_ref", fieldType: "relation", sortOrder: 6, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("quote") || undefined,
      relatedDisplayField: "quote_number", relationType: "many_to_one" },
    { name: "הזמנת עבודה קשורה", slug: "related_work_order_ref", fieldType: "relation", sortOrder: 7, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("work-order") || undefined,
      relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "מגיש הבקשה", slug: "requester", fieldType: "text", sortOrder: 8, groupName: "שרשרת אישור" },
    { name: "תאריך הגשה", slug: "submitted_date", fieldType: "date", sortOrder: 9, groupName: "שרשרת אישור" },
    { name: "מאשר שלב 1", slug: "approver_1", fieldType: "text", sortOrder: 10, groupName: "שרשרת אישור" },
    { name: "החלטת שלב 1", slug: "decision_1", fieldType: "select", sortOrder: 11, groupName: "שרשרת אישור", options: [
      { label: "ממתין", value: "pending" }, { label: "אושר", value: "approved" }, { label: "נדחה", value: "rejected" }
    ]},
    { name: "תאריך החלטה 1", slug: "decision_1_date", fieldType: "date", sortOrder: 12, groupName: "שרשרת אישור" },
    { name: "מאשר שלב 2", slug: "approver_2", fieldType: "text", sortOrder: 13, groupName: "שרשרת אישור" },
    { name: "החלטת שלב 2", slug: "decision_2", fieldType: "select", sortOrder: 14, groupName: "שרשרת אישור", options: [
      { label: "ממתין", value: "pending" }, { label: "אושר", value: "approved" }, { label: "נדחה", value: "rejected" }
    ]},
    { name: "תאריך החלטה 2", slug: "decision_2_date", fieldType: "date", sortOrder: 15, groupName: "שרשרת אישור" },
    { name: "מדידת סוכן", slug: "agent_measurement", fieldType: "textarea", sortOrder: 16, groupName: "השוואת מדידות", helpText: "מדידות שנלקחו ע\"י סוכן החברה" },
    { name: "מדידת מודד", slug: "surveyor_measurement", fieldType: "textarea", sortOrder: 17, groupName: "השוואת מדידות", helpText: "מדידות שנלקחו ע\"י מודד מוסמך" },
    { name: "סטייה במדידות", slug: "measurement_deviation", fieldType: "textarea", sortOrder: 18, groupName: "השוואת מדידות" },
    { name: "רשימת בדיקות", slug: "review_checklist", fieldType: "textarea", sortOrder: 19, groupName: "בקרה", helpText: "רשימת בדיקות לסקירת הצעת מחיר" },
    { name: "דגלי הונאה", slug: "fraud_flags", fieldType: "textarea", sortOrder: 20, groupName: "בקרה", helpText: "חשדות או ממצאים חריגים" },
    { name: "עדיפות", slug: "priority", fieldType: "select", sortOrder: 21, groupName: "פרטי בקשה", options: [
      { label: "נמוכה", value: "low" }, { label: "רגילה", value: "normal" }, { label: "גבוהה", value: "high" }, { label: "דחופה", value: "urgent" }
    ]},
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 22, groupName: "כספי" },
    { name: "הערות סופיות", slug: "final_notes", fieldType: "textarea", sortOrder: 23, groupName: "כללי" },
  ]);

  await ensureStatuses(entityId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "הוגשה", slug: "submitted", color: "#3B82F6", sortOrder: 1 },
    { name: "בבדיקה", slug: "under_review", color: "#F59E0B", sortOrder: 2 },
    { name: "אושרה חלקית", slug: "partially_approved", color: "#8B5CF6", sortOrder: 3 },
    { name: "אושרה", slug: "approved", color: "#22C55E", sortOrder: 4, isFinal: true },
    { name: "נדחתה", slug: "rejected", color: "#EF4444", sortOrder: 5, isFinal: true },
    { name: "הוחזרה לתיקון", slug: "returned", color: "#EC4899", sortOrder: 6 },
  ]);
}

async function seedSupplierOpportunities() {
  console.log("[seed] Creating Supplier Opportunities entity...");
  const moduleId = await getModuleIdBySlug("procurement");
  if (!moduleId) {
    console.warn("[seed] Procurement module not found, skipping Supplier Opportunities");
    return;
  }

  const entityId = await ensureEntity(moduleId, {
    name: "הזדמנות רכש",
    namePlural: "הזדמנויות רכש",
    slug: "supplier-opportunity",
    description: "מעקב אחר הזדמנויות מיוחדות מספקים — הנחות כמותיות, מחירים עונתיים",
    icon: "TrendingDown",
    entityType: "transaction",
    hasStatus: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 10,
  });

  await ensureFields(entityId, [
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטים" },
    { name: "ספק", slug: "supplier_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטים" },
    { name: "סוג הזדמנות", slug: "opportunity_type", fieldType: "select", sortOrder: 3, groupName: "פרטים", isFilterable: true, options: [
      { label: "הנחת כמות", value: "bulk_discount" }, { label: "מבצע עונתי", value: "seasonal" },
      { label: "ירידת מחיר", value: "price_drop" }, { label: "מלאי עודף", value: "overstock" },
      { label: "סגירת דגם", value: "clearance" }
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 4, groupName: "פרטים" },
    { name: "מוצרים/חומרים", slug: "products", fieldType: "textarea", sortOrder: 5, groupName: "פרטים" },
    { name: "מחיר רגיל", slug: "regular_price", fieldType: "number", sortOrder: 6, groupName: "מחירים" },
    { name: "מחיר מוצע", slug: "offered_price", fieldType: "number", sortOrder: 7, groupName: "מחירים" },
    { name: "אחוז הנחה", slug: "discount_percent", fieldType: "number", sortOrder: 8, groupName: "מחירים" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 9, groupName: "מחירים", options: [
      { label: "₪ ILS", value: "ILS" }, { label: "$ USD", value: "USD" }, { label: "€ EUR", value: "EUR" }
    ]},
    { name: "כמות מינימלית", slug: "minimum_quantity", fieldType: "number", sortOrder: 10, groupName: "תנאים" },
    { name: "תוקף מ", slug: "valid_from", fieldType: "date", sortOrder: 11, groupName: "תנאים" },
    { name: "תוקף עד", slug: "valid_until", fieldType: "date", sortOrder: 12, groupName: "תנאים" },
    { name: "סף התראה", slug: "price_threshold", fieldType: "number", sortOrder: 13, groupName: "התראות", helpText: "התרע כשמחיר יורד מתחת לסף" },
    { name: "עדיפות", slug: "priority", fieldType: "select", sortOrder: 14, groupName: "פרטים", options: [
      { label: "נמוכה", value: "low" }, { label: "רגילה", value: "normal" }, { label: "גבוהה", value: "high" }
    ]},
    { name: "חיסכון מוערך", slug: "estimated_savings", fieldType: "number", sortOrder: 15, groupName: "מחירים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 16, groupName: "כללי" },
  ]);

  await ensureStatuses(entityId, [
    { name: "חדשה", slug: "new", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "בבדיקה", slug: "evaluating", color: "#F59E0B", sortOrder: 1 },
    { name: "אושרה", slug: "approved", color: "#22C55E", sortOrder: 2 },
    { name: "נוצלה", slug: "utilized", color: "#10B981", sortOrder: 3, isFinal: true },
    { name: "פג תוקף", slug: "expired", color: "#9CA3AF", sortOrder: 4, isFinal: true },
    { name: "נדחתה", slug: "rejected", color: "#EF4444", sortOrder: 5, isFinal: true },
  ]);
}

async function seedProjectWorkPlans() {
  console.log("[seed] Creating Project Work Plans module...");

  const moduleId = await ensureModule({
    name: "פרויקטים",
    slug: "projects",
    nameHe: "פרויקטים",
    nameEn: "Projects",
    description: "ניהול פרויקטים — תוכניות עבודה, משימות, צוותים ומעקב התקדמות",
    icon: "FolderKanban",
    color: "#059669",
    category: "ניהול",
    sortOrder: 7,
  });

  const entityId = await ensureEntity(moduleId, {
    name: "תוכנית עבודה",
    namePlural: "תוכניות עבודה",
    slug: "work-plan",
    description: "תוכנית עבודה לפרויקט — משימות, חומרים, צוותים ולוח זמנים",
    icon: "ClipboardList",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(entityId, [
    { name: "מספר פרויקט", slug: "project_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פרויקט" },
    { name: "שם פרויקט", slug: "project_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פרויקט" },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 3, isRequired: true, groupName: "פרטי פרויקט",
      relatedEntityId: await getEntityIdBySlug("customer") || undefined,
      relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "כתובת ביצוע", slug: "site_address", fieldType: "text", sortOrder: 4, groupName: "פרטי פרויקט" },
    { name: "סוג פרויקט", slug: "project_type", fieldType: "select", sortOrder: 5, groupName: "פרטי פרויקט", isFilterable: true, options: [
      { label: "התקנה חדשה", value: "new_installation" }, { label: "שיפוץ", value: "renovation" },
      { label: "תיקון", value: "repair" }, { label: "תחזוקה", value: "maintenance" },
      { label: "פרויקט מיוחד", value: "special" }
    ]},
    { name: "היקף פרויקט", slug: "scope", fieldType: "textarea", sortOrder: 6, groupName: "היקף" },
    { name: "תאריך התחלה", slug: "start_date", fieldType: "date", sortOrder: 7, groupName: "לוח זמנים" },
    { name: "תאריך יעד", slug: "target_date", fieldType: "date", sortOrder: 8, groupName: "לוח זמנים" },
    { name: "תאריך סיום בפועל", slug: "actual_end_date", fieldType: "date", sortOrder: 9, groupName: "לוח זמנים" },
    { name: "פירוט משימות", slug: "task_breakdown", fieldType: "textarea", sortOrder: 10, groupName: "משימות", helpText: "פירוט שלבי העבודה ומשימות" },
    { name: "אבני דרך", slug: "milestones", fieldType: "textarea", sortOrder: 11, groupName: "משימות", helpText: "אבני דרך עיקריות ותאריכים" },
    { name: "נתוני מדידה", slug: "measurement_data", fieldType: "textarea", sortOrder: 12, groupName: "מדידות" },
    { name: "הוראות התקנה", slug: "installation_instructions", fieldType: "textarea", sortOrder: 13, groupName: "מדידות" },
    { name: "שרטוטים", slug: "drawings_ref", fieldType: "text", sortOrder: 14, groupName: "מדידות", helpText: "הפניה לשרטוטי התקנה" },
    { name: "רשימת חומרים", slug: "material_list", fieldType: "textarea", sortOrder: 15, groupName: "חומרים" },
    { name: "עלות חומרים מוערכת", slug: "estimated_material_cost", fieldType: "number", sortOrder: 16, groupName: "עלויות" },
    { name: "עלות עבודה מוערכת", slug: "estimated_labor_cost", fieldType: "number", sortOrder: 17, groupName: "עלויות" },
    { name: "תקציב כולל", slug: "total_budget", fieldType: "number", sortOrder: 18, groupName: "עלויות" },
    { name: "עלות בפועל", slug: "actual_cost", fieldType: "number", sortOrder: 19, groupName: "עלויות" },
    { name: "צוות מבצע", slug: "team_members", fieldType: "textarea", sortOrder: 20, groupName: "צוות" },
    { name: "מנהל פרויקט", slug: "project_manager", fieldType: "text", sortOrder: 21, groupName: "צוות" },
    { name: "הצעת מחיר קשורה", slug: "related_quote_ref", fieldType: "relation", sortOrder: 22, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("quote") || undefined,
      relatedDisplayField: "quote_number", relationType: "many_to_one" },
    { name: "הזמנת עבודה קשורה", slug: "related_work_order_ref", fieldType: "relation", sortOrder: 23, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("work-order") || undefined,
      relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "אחוז התקדמות", slug: "progress_percent", fieldType: "number", sortOrder: 24, groupName: "מעקב" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 25, groupName: "כללי" },
  ]);

  await ensureStatuses(entityId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מתוכנן", slug: "planned", color: "#3B82F6", sortOrder: 1 },
    { name: "בביצוע", slug: "in_progress", color: "#F59E0B", sortOrder: 2 },
    { name: "בבדיקה", slug: "review", color: "#8B5CF6", sortOrder: 3 },
    { name: "הושלם", slug: "completed", color: "#22C55E", sortOrder: 4, isFinal: true },
    { name: "מושהה", slug: "on_hold", color: "#EF4444", sortOrder: 5 },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 6, isFinal: true },
  ]);
}

async function seedFieldMeasurementsModule() {
  console.log("[seed] Creating Field Measurements module...");

  const moduleId = await ensureModule({
    name: "מדידות שטח",
    slug: "field-measurements",
    nameHe: "מדידות שטח",
    nameEn: "Field Measurements",
    description: "ניהול מדידות שטח, הוראות עבודה לייצור והוראות עבודה למתקינים",
    icon: "Ruler",
    color: "#6366F1",
    category: "תפעול",
    sortOrder: 10,
  });

  const fieldMeasurementId = await ensureEntity(moduleId, {
    name: "מדידת שטח",
    namePlural: "מדידות שטח",
    slug: "field-measurement",
    description: "ניהול מדידות שטח — מידות, תמונות, אישורים וקישור לפרויקטים",
    icon: "Ruler",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(fieldMeasurementId, [
    { name: "מספר מדידה", slug: "measurement_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מדידה" },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי מדידה",
      relatedEntityId: await getEntityIdBySlug("customer") || undefined,
      relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "כתובת", slug: "site_address", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי מדידה" },
    { name: "תאריך מדידה", slug: "measurement_date", fieldType: "date", sortOrder: 4, isRequired: true, groupName: "פרטי מדידה" },
    { name: "מודד", slug: "measured_by", fieldType: "text", sortOrder: 5, isRequired: true, groupName: "פרטי מדידה" },
    { name: "סוג מדידה", slug: "measurement_type", fieldType: "select", sortOrder: 6, groupName: "פרטי מדידה", isFilterable: true, options: [
      { label: "ראשונית", value: "initial" }, { label: "אימות", value: "verification" }, { label: "סופית", value: "final" }
    ]},
    { name: "רוחב (מ\"מ)", slug: "width_mm", fieldType: "number", sortOrder: 7, groupName: "מידות" },
    { name: "גובה (מ\"מ)", slug: "height_mm", fieldType: "number", sortOrder: 8, groupName: "מידות" },
    { name: "עומק (מ\"מ)", slug: "depth_mm", fieldType: "number", sortOrder: 9, groupName: "מידות" },
    { name: "אלכסון (מ\"מ)", slug: "diagonal_mm", fieldType: "number", sortOrder: 10, groupName: "מידות" },
    { name: "הערות שטח", slug: "site_notes", fieldType: "textarea", sortOrder: 11, groupName: "תיעוד" },
    { name: "תמונות", slug: "photo_references", fieldType: "text", sortOrder: 12, groupName: "תיעוד", helpText: "קישורים או הפניות לתמונות מהשטח" },
    { name: "סטטוס אישור", slug: "approval_status", fieldType: "select", sortOrder: 13, groupName: "אישורים", isFilterable: true, options: [
      { label: "ממתין", value: "pending" }, { label: "אושר", value: "approved" }, { label: "נדחה", value: "rejected" }
    ]},
    { name: "שם מאשר", slug: "approved_by", fieldType: "text", sortOrder: 14, groupName: "אישורים" },
    { name: "תאריך אישור", slug: "approval_date", fieldType: "date", sortOrder: 15, groupName: "אישורים" },
    { name: "קישור לפרויקט/הזמנת עבודה", slug: "work_order_ref", fieldType: "relation", sortOrder: 16, groupName: "קישורים",
      relatedEntityId: await getEntityIdBySlug("work-order") || undefined,
      relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "הערות נוספות", slug: "additional_notes", fieldType: "textarea", sortOrder: 17, groupName: "כללי" },
  ]);

  await ensureStatuses(fieldMeasurementId, [
    { name: "חדשה", slug: "new", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בביצוע", slug: "in_progress", color: "#3B82F6", sortOrder: 1 },
    { name: "ממתינה לאישור", slug: "pending_approval", color: "#F59E0B", sortOrder: 2 },
    { name: "אושרה", slug: "approved", color: "#22C55E", sortOrder: 3 },
    { name: "הועברה לייצור", slug: "transferred_to_production", color: "#8B5CF6", sortOrder: 4, isFinal: true },
  ]);

  const prodInstructionsId = await ensureEntity(moduleId, {
    name: "הוראות עבודה לייצור",
    namePlural: "הוראות עבודה לייצור",
    slug: "production-work-instructions",
    description: "מסמכי הנחיות ייצור מבוססי מדידות שטח",
    icon: "FileText",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 2,
  });

  await ensureFields(prodInstructionsId, [
    { name: "מספר הוראה", slug: "instruction_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הוראה" },
    { name: "שם מוצר/פרויקט", slug: "product_project_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי הוראה" },
    { name: "מדידת שטח מקושרת", slug: "field_measurement_ref", fieldType: "relation", sortOrder: 3, groupName: "פרטי הוראה",
      relatedEntityId: fieldMeasurementId || undefined,
      relatedDisplayField: "measurement_number", relationType: "many_to_one" },
    { name: "חומרי גלם נדרשים", slug: "raw_materials", fieldType: "textarea", sortOrder: 4, groupName: "חומרים", helpText: "רשימת חומרי גלם וכמויות נדרשות" },
    { name: "שלבי ייצור", slug: "production_steps", fieldType: "textarea", sortOrder: 5, groupName: "תהליך ייצור", helpText: "פירוט שלבי הייצור לפי סדר" },
    { name: "תרשימים/שרטוטים", slug: "drawings", fieldType: "text", sortOrder: 6, groupName: "תהליך ייצור", helpText: "הפניות לתרשימים ושרטוטים טכניים" },
    { name: "הערות מיוחדות", slug: "special_notes", fieldType: "textarea", sortOrder: 7, groupName: "תהליך ייצור" },
    { name: "רוחב ייצור (מ\"מ)", slug: "prod_width_mm", fieldType: "number", sortOrder: 8, groupName: "מידות ייצור" },
    { name: "גובה ייצור (מ\"מ)", slug: "prod_height_mm", fieldType: "number", sortOrder: 9, groupName: "מידות ייצור" },
    { name: "עומק ייצור (מ\"מ)", slug: "prod_depth_mm", fieldType: "number", sortOrder: 10, groupName: "מידות ייצור" },
    { name: "מידות נוספות", slug: "additional_dimensions", fieldType: "textarea", sortOrder: 11, groupName: "מידות ייצור" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 12, groupName: "כללי" },
  ]);

  await ensureStatuses(prodInstructionsId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בבדיקה", slug: "under_review", color: "#F59E0B", sortOrder: 1 },
    { name: "מאושרת", slug: "approved", color: "#22C55E", sortOrder: 2 },
    { name: "בייצור", slug: "in_production", color: "#3B82F6", sortOrder: 3 },
    { name: "הושלמה", slug: "completed", color: "#8B5CF6", sortOrder: 4, isFinal: true },
  ]);

  const fieldInstructionsId = await ensureEntity(moduleId, {
    name: "הוראות עבודה למתקינים שטח",
    namePlural: "הוראות עבודה למתקינים שטח",
    slug: "field-work-instructions",
    description: "מסמכי הנחיות למתקינים לביצוע בשטח",
    icon: "ClipboardList",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 3,
  });

  await ensureFields(fieldInstructionsId, [
    { name: "מספר הוראה", slug: "instruction_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הוראה" },
    { name: "מדידת שטח מקושרת", slug: "field_measurement_ref", fieldType: "relation", sortOrder: 2, groupName: "פרטי הוראה",
      relatedEntityId: fieldMeasurementId || undefined,
      relatedDisplayField: "measurement_number", relationType: "many_to_one" },
    { name: "כתובת התקנה", slug: "installation_address", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי התקנה" },
    { name: "צוות מתקינים", slug: "installation_team", fieldType: "textarea", sortOrder: 4, groupName: "פרטי התקנה", helpText: "שמות ותפקידי חברי הצוות" },
    { name: "כלים נדרשים", slug: "required_tools", fieldType: "textarea", sortOrder: 5, groupName: "ציוד", helpText: "רשימת כלים וציוד נדרש להתקנה" },
    { name: "שלבי התקנה", slug: "installation_steps", fieldType: "textarea", sortOrder: 6, groupName: "תהליך התקנה", helpText: "פירוט שלבי ההתקנה לפי סדר" },
    { name: "הנחיות בטיחות", slug: "safety_instructions", fieldType: "textarea", sortOrder: 7, groupName: "בטיחות", helpText: "הנחיות בטיחות והוראות זהירות" },
    { name: "חומרים לשטח", slug: "field_materials", fieldType: "textarea", sortOrder: 8, groupName: "ציוד", helpText: "חומרים שיש להביא לשטח" },
    { name: "תאריך התקנה מתוכנן", slug: "planned_installation_date", fieldType: "date", sortOrder: 9, groupName: "לוח זמנים" },
    { name: "תאריך התקנה בפועל", slug: "actual_installation_date", fieldType: "date", sortOrder: 10, groupName: "לוח זמנים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 11, groupName: "כללי" },
  ]);

  await ensureStatuses(fieldInstructionsId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מתוזמנת", slug: "scheduled", color: "#3B82F6", sortOrder: 1 },
    { name: "בביצוע", slug: "in_progress", color: "#F59E0B", sortOrder: 2 },
    { name: "הושלמה", slug: "completed", color: "#22C55E", sortOrder: 3 },
    { name: "אושרה ע\"י לקוח", slug: "customer_approved", color: "#8B5CF6", sortOrder: 4, isFinal: true },
  ]);
}

async function seedFinanceModule() {
  console.log("[seed] Creating Finance module...");

  const moduleId = await ensureModule({
    name: "כספים",
    slug: "finance",
    nameHe: "כספים",
    nameEn: "Finance",
    description: "ניהול כספים — חובות, חייבים, הוצאות, תשלומים, תקציבים, חשבונות בנק, פרויקטים ותנועות כספיות",
    icon: "DollarSign",
    color: "#F59E0B",
    category: "כספים",
    sortOrder: 5,
  });

  const apId = await ensureEntity(moduleId, {
    name: "חשבון ספק",
    namePlural: "חובות לספקים",
    slug: "accounts-payable",
    description: "ניהול חשבוניות ספקים ותשלומים",
    icon: "Receipt",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 1,
  });

  await ensureFields(apId, [
    { name: "מספר חשבונית", slug: "invoice_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חשבונית", showInList: true, isSearchable: true },
    { name: "שם ספק", slug: "supplier_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי חשבונית", showInList: true, isSearchable: true },
    { name: "מזהה ספק", slug: "supplier_id", fieldType: "text", sortOrder: 3, groupName: "פרטי חשבונית", showInList: false },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "סכום ששולם", slug: "paid_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: true, defaultValue: "0" },
    { name: "יתרה לתשלום", slug: "balance_due", fieldType: "number", sortOrder: 6, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 7, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תאריך חשבונית", slug: "invoice_date", fieldType: "date", sortOrder: 8, groupName: "תאריכים", showInList: false },
    { name: "תאריך לתשלום", slug: "due_date", fieldType: "date", sortOrder: 9, isRequired: true, groupName: "תאריכים", showInList: true, isFilterable: true },
    { name: "תנאי תשלום", slug: "payment_terms", fieldType: "text", sortOrder: 10, groupName: "תאריכים", placeholder: "שוטף+30" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 11, groupName: "פרטים", showInList: false },
    { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 12, groupName: "פרטים", showInList: true, isFilterable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 13, groupName: "פרטים", showInList: false },
  ]);

  await ensureStatuses(apId, [
    { name: "פתוח", slug: "open", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "חלקי", slug: "partial", color: "#F59E0B", sortOrder: 1 },
    { name: "שולם", slug: "paid", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "באיחור", slug: "overdue", color: "#EF4444", sortOrder: 3 },
    { name: "בוטל", slug: "cancelled", color: "#6B7280", sortOrder: 4, isFinal: true },
  ]);

  const arId = await ensureEntity(moduleId, {
    name: "חשבון חייב",
    namePlural: "חייבים",
    slug: "accounts-receivable",
    description: "ניהול חייבים — מי חייב לחברה כסף",
    icon: "TrendingUp",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 2,
  });

  await ensureFields(arId, [
    { name: "מספר חשבונית", slug: "invoice_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חשבונית", showInList: true, isSearchable: true },
    { name: "שם לקוח", slug: "customer_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי חשבונית", showInList: true, isSearchable: true },
    { name: "מזהה לקוח", slug: "customer_id", fieldType: "text", sortOrder: 3, groupName: "פרטי חשבונית", showInList: false },
    { name: "טלפון לקוח", slug: "customer_phone", fieldType: "text", sortOrder: 4, groupName: "פרטי חשבונית", showInList: false },
    { name: "אימייל לקוח", slug: "customer_email", fieldType: "text", sortOrder: 5, groupName: "פרטי חשבונית", showInList: false },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 6, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "סכום ששולם", slug: "paid_amount", fieldType: "number", sortOrder: 7, groupName: "סכומים", showInList: true, defaultValue: "0" },
    { name: "יתרה לגביה", slug: "balance_due", fieldType: "number", sortOrder: 8, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 9, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תאריך חשבונית", slug: "invoice_date", fieldType: "date", sortOrder: 10, groupName: "תאריכים", showInList: false },
    { name: "תאריך לתשלום", slug: "due_date", fieldType: "date", sortOrder: 11, isRequired: true, groupName: "תאריכים", showInList: true, isFilterable: true },
    { name: "תנאי תשלום", slug: "payment_terms", fieldType: "text", sortOrder: 12, groupName: "תאריכים", placeholder: "שוטף+30" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 13, groupName: "פרטים", showInList: false },
    { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 14, groupName: "פרטים", showInList: true, isFilterable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 15, groupName: "פרטים", showInList: false },
  ]);

  await ensureStatuses(arId, [
    { name: "פתוח", slug: "open", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "חלקי", slug: "partial", color: "#F59E0B", sortOrder: 1 },
    { name: "שולם", slug: "paid", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "באיחור", slug: "overdue", color: "#EF4444", sortOrder: 3 },
    { name: "בוטל", slug: "cancelled", color: "#6B7280", sortOrder: 4, isFinal: true },
    { name: "נמחק", slug: "written_off", color: "#9CA3AF", sortOrder: 5, isFinal: true },
  ]);

  const expId = await ensureEntity(moduleId, {
    name: "הוצאה",
    namePlural: "הוצאות",
    slug: "finance-expenses",
    description: "ניהול הוצאות החברה",
    icon: "Receipt",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 3,
  });

  await ensureFields(expId, [
    { name: "תאריך הוצאה", slug: "expense_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isFilterable: true },
    { name: "קטגוריה", slug: "category", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isFilterable: true, options: [
      { label: "מימון משכנתא", value: "מימון משכנתא" }, { label: "דלק", value: "דלק" }, { label: "חשמל ומים", value: "חשמל ומים" },
      { label: "שכירות", value: "שכירות" }, { label: "ביטוח", value: "ביטוח" }, { label: "תחזוקה", value: "תחזוקה" },
      { label: "חומרי גלם", value: "חומרי גלם" }, { label: "שכר עבודה", value: "שכר עבודה" }, { label: "הובלה", value: "הובלה" },
      { label: "שיווק", value: "שיווק" }, { label: "ציוד", value: "ציוד" }, { label: "מיסים", value: "מיסים" }, { label: "אחר", value: "אחר" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 3, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isSearchable: true },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: false },
    { name: "אמצעי תשלום", slug: "payment_method", fieldType: "select", sortOrder: 6, groupName: "תשלום", showInList: true, defaultValue: "bank_transfer", options: [
      { label: "העברה בנקאית", value: "bank_transfer" }, { label: "סליקת אשראי חיצונית", value: "credit_card_external" },
      { label: "מזומן", value: "cash" }, { label: "שיק", value: "check" }, { label: "כרטיס אשראי", value: "credit_card" },
    ]},
    { name: "שם ספק", slug: "vendor_name", fieldType: "text", sortOrder: 7, groupName: "ספק", showInList: true, isSearchable: true },
    { name: "מספר קבלה", slug: "receipt_number", fieldType: "text", sortOrder: 8, groupName: "ספק", showInList: false },
    { name: "מחלקה", slug: "department", fieldType: "text", sortOrder: 9, groupName: "סיווג", showInList: false, isFilterable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "פרטים", showInList: false },
    { name: "קובץ מצורף", slug: "file_url", fieldType: "text", sortOrder: 11, groupName: "קבצים", showInList: false, showInForm: false },
    { name: "שם קובץ", slug: "file_name", fieldType: "text", sortOrder: 12, groupName: "קבצים", showInList: false, showInForm: false },
  ]);

  await ensureStatuses(expId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#3B82F6", sortOrder: 1 },
    { name: "שולם", slug: "paid", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#6B7280", sortOrder: 4, isFinal: true },
  ]);

  const payId = await ensureEntity(moduleId, {
    name: "תשלום",
    namePlural: "תשלומים",
    slug: "finance-payments",
    description: "ניהול תשלומים נכנסים ויוצאים",
    icon: "Banknote",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 4,
  });

  await ensureFields(payId, [
    { name: "תאריך תשלום", slug: "payment_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי תשלום", showInList: true, isFilterable: true },
    { name: "סוג תשלום", slug: "payment_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי תשלום", showInList: true, isFilterable: true, options: [
      { label: "תשלום יוצא", value: "outgoing" }, { label: "תשלום נכנס", value: "incoming" },
    ]},
    { name: "אמצעי תשלום", slug: "payment_method", fieldType: "select", sortOrder: 3, groupName: "פרטי תשלום", showInList: true, defaultValue: "bank_transfer", options: [
      { label: "העברה בנקאית", value: "bank_transfer" }, { label: "צ'ק", value: "check" },
      { label: "מזומן", value: "cash" }, { label: "כרטיס אשראי", value: "credit_card" }, { label: "אחר", value: "other" },
    ]},
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 5, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 6, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "אסמכתא", slug: "reference_number", fieldType: "text", sortOrder: 7, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "מספר צ'ק", slug: "check_number", fieldType: "text", sortOrder: 8, groupName: "פרטים", showInList: false },
  ]);

  await ensureStatuses(payId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "בוצע", slug: "completed", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
    { name: "חזר", slug: "bounced", color: "#DC2626", sortOrder: 3 },
  ]);

  const budId = await ensureEntity(moduleId, {
    name: "תקציב",
    namePlural: "תקציבים",
    slug: "finance-budgets",
    description: "ניהול תקציבים שנתיים וחודשיים",
    icon: "PiggyBank",
    entityType: "master",
    hasStatus: false,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 5,
  });

  await ensureFields(budId, [
    { name: "שם התקציב", slug: "budget_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי תקציב", showInList: true, isSearchable: true },
    { name: "שנה", slug: "fiscal_year", fieldType: "number", sortOrder: 2, isRequired: true, groupName: "תקופה", showInList: true, isFilterable: true },
    { name: "חודש", slug: "fiscal_month", fieldType: "select", sortOrder: 3, groupName: "תקופה", showInList: true, options: [
      { label: "ינואר", value: "1" }, { label: "פברואר", value: "2" }, { label: "מרץ", value: "3" },
      { label: "אפריל", value: "4" }, { label: "מאי", value: "5" }, { label: "יוני", value: "6" },
      { label: "יולי", value: "7" }, { label: "אוגוסט", value: "8" }, { label: "ספטמבר", value: "9" },
      { label: "אוקטובר", value: "10" }, { label: "נובמבר", value: "11" }, { label: "דצמבר", value: "12" },
    ]},
    { name: "קטגוריה", slug: "category", fieldType: "select", sortOrder: 4, groupName: "סיווג", showInList: true, isFilterable: true, options: [
      { label: "חומרי גלם", value: "חומרי גלם" }, { label: "שכר עבודה", value: "שכר עבודה" },
      { label: "שכירות", value: "שכירות" }, { label: "חשמל ומים", value: "חשמל ומים" },
      { label: "ביטוח", value: "ביטוח" }, { label: "תחזוקה", value: "תחזוקה" },
      { label: "ציוד", value: "ציוד" }, { label: "שיווק", value: "שיווק" },
      { label: "הובלה", value: "הובלה" }, { label: "אחר", value: "אחר" },
    ]},
    { name: "מחלקה", slug: "department", fieldType: "select", sortOrder: 5, groupName: "סיווג", showInList: true, isFilterable: true, options: [
      { label: "ייצור", value: "ייצור" }, { label: "רכש", value: "רכש" }, { label: "מכירות", value: "מכירות" },
      { label: "הנהלה", value: "הנהלה" }, { label: "תחזוקה", value: "תחזוקה" }, { label: "הובלה", value: "הובלה" },
      { label: "שיווק", value: "שיווק" }, { label: "כללי", value: "כללי" },
    ]},
    { name: "סכום מתוקצב", slug: "budgeted_amount", fieldType: "number", sortOrder: 6, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "סכום בפועל", slug: "actual_amount", fieldType: "number", sortOrder: 7, groupName: "סכומים", showInList: true, defaultValue: "0" },
    { name: "סטייה", slug: "variance", fieldType: "number", sortOrder: 8, groupName: "סכומים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "פרטים", showInList: false },
  ]);

  const bankId = await ensureEntity(moduleId, {
    name: "חשבון בנק",
    namePlural: "חשבונות בנק",
    slug: "finance-bank-accounts",
    description: "ניהול חשבונות בנק ויתרות",
    icon: "Landmark",
    entityType: "master",
    hasStatus: false,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 6,
  });

  await ensureFields(bankId, [
    { name: "שם הבנק", slug: "bank_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
    { name: "מספר סניף", slug: "branch_number", fieldType: "text", sortOrder: 2, groupName: "פרטי חשבון", showInList: true },
    { name: "מספר חשבון", slug: "account_number", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
    { name: "סוג חשבון", slug: "account_type", fieldType: "select", sortOrder: 4, groupName: "פרטי חשבון", showInList: true, isFilterable: true, defaultValue: "checking", options: [
      { label: "עו\"ש", value: "checking" }, { label: "חיסכון", value: "savings" },
      { label: "אשראי", value: "credit" }, { label: "פיקדון", value: "deposit" },
    ]},
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 5, groupName: "פרטי חשבון", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "יתרה נוכחית", slug: "current_balance", fieldType: "number", sortOrder: 6, groupName: "יתרות", showInList: true },
    { name: "יתרה זמינה", slug: "available_balance", fieldType: "number", sortOrder: 7, groupName: "יתרות", showInList: true },
    { name: "מסגרת אשראי", slug: "credit_limit", fieldType: "number", sortOrder: 8, groupName: "יתרות", showInList: false },
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 9, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
  ]);

  const projId = await ensureEntity(moduleId, {
    name: "פרויקט כספי",
    namePlural: "פרויקטים כספיים",
    slug: "finance-projects",
    description: "ניתוח רווחיות פרויקטים",
    icon: "FolderKanban",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 7,
  });

  await ensureFields(projId, [
    { name: "מספר פרויקט", slug: "project_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
    { name: "שם פרויקט", slug: "project_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
    { name: "לקוח", slug: "customer_name", fieldType: "text", sortOrder: 3, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
    { name: "מנהל פרויקט", slug: "manager_name", fieldType: "text", sortOrder: 4, groupName: "פרטי פרויקט", showInList: false },
    { name: "מחלקה", slug: "department", fieldType: "text", sortOrder: 5, groupName: "פרטי פרויקט", showInList: false, isFilterable: true },
    { name: "תאריך התחלה", slug: "start_date", fieldType: "date", sortOrder: 6, groupName: "תאריכים", showInList: true },
    { name: "תאריך סיום", slug: "end_date", fieldType: "date", sortOrder: 7, groupName: "תאריכים", showInList: true },
    { name: "הכנסות צפויות", slug: "estimated_revenue", fieldType: "number", sortOrder: 8, groupName: "כספים", showInList: true },
    { name: "עלויות צפויות", slug: "estimated_cost", fieldType: "number", sortOrder: 9, groupName: "כספים", showInList: false },
    { name: "הכנסות בפועל", slug: "actual_revenue", fieldType: "number", sortOrder: 10, groupName: "כספים", showInList: true },
    { name: "עלויות בפועל", slug: "actual_cost", fieldType: "number", sortOrder: 11, groupName: "כספים", showInList: true },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 12, groupName: "פרטים", showInList: false },
  ]);

  await ensureStatuses(projId, [
    { name: "בתכנון", slug: "planning", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 1 },
    { name: "מושהה", slug: "on_hold", color: "#F59E0B", sortOrder: 2 },
    { name: "הושלם", slug: "completed", color: "#3B82F6", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 4, isFinal: true },
  ]);

  const txId = await ensureEntity(moduleId, {
    name: "תנועה כספית",
    namePlural: "תנועות כספיות",
    slug: "financial-transactions",
    description: "ניהול תנועות כספיות — הכנסות, הוצאות, העברות",
    icon: "ArrowLeftRight",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 8,
  });

  await ensureFields(txId, [
    { name: "תאריך תנועה", slug: "transaction_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי תנועה", showInList: true, isFilterable: true },
    { name: "סוג תנועה", slug: "transaction_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי תנועה", showInList: true, isFilterable: true, options: [
      { label: "הכנסה", value: "income" }, { label: "הוצאה", value: "expense" },
      { label: "העברה", value: "transfer" }, { label: "התאמה", value: "adjustment" }, { label: "פקודת יומן", value: "journal" },
    ]},
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 4, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 5, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 6, groupName: "פרטים", showInList: true, isFilterable: true },
  ]);

  await ensureStatuses(txId, [
    { name: "טיוטה", slug: "draft", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "רשום", slug: "posted", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "מבוטל", slug: "voided", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  await seedFinanceDashboardPage(moduleId, apId, arId, expId, bankId);
  await seedFinanceReportDefinitions(apId, arId, expId, bankId, projId);
  await autoMigrateFinanceData();

  console.log("[seed] Finance module seeded successfully.");
}

async function seedPurchaseInventoryEntities() {
  console.log("[seed] Creating Purchase & Inventory entities...");

  const moduleId = await getModuleIdBySlug("procurement");
  if (!moduleId) {
    console.warn("[seed] Procurement module not found, skipping Purchase & Inventory entities");
    return;
  }

  const supplierEntityId = await getEntityIdBySlug("supplier");

  const purchaseRequestId = await ensureEntity(moduleId, {
    name: "דרישת רכש",
    namePlural: "דרישות רכש",
    slug: "purchase-request",
    description: "ניהול דרישות רכש ובקשות הזמנה",
    icon: "ClipboardList",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 2,
  });

  await ensureFields(purchaseRequestId, [
    { name: "מספר דרישה", slug: "request_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי דרישה", showInList: true, isSearchable: true },
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי דרישה", showInList: true, isSearchable: true },
    { name: "מבקש", slug: "requester_name", fieldType: "text", sortOrder: 3, groupName: "פרטי דרישה", showInList: true },
    { name: "מחלקה", slug: "department", fieldType: "select", sortOrder: 4, groupName: "פרטי דרישה", showInList: true, isFilterable: true, options: [
      { label: "רכש", value: "רכש" }, { label: "ייצור", value: "ייצור" }, { label: "הנדסה", value: "הנדסה" },
      { label: "תחזוקה", value: "תחזוקה" }, { label: "מחסן", value: "מחסן" }, { label: "הנהלה", value: "הנהלה" },
    ]},
    { name: "עדיפות", slug: "priority", fieldType: "select", sortOrder: 5, groupName: "פרטי דרישה", showInList: true, isFilterable: true, options: [
      { label: "נמוך", value: "נמוך" }, { label: "רגיל", value: "רגיל" }, { label: "גבוה", value: "גבוה" }, { label: "דחוף", value: "דחוף" },
    ], defaultValue: "רגיל" },
    { name: "סכום משוער", slug: "total_estimated", fieldType: "number", sortOrder: 6, groupName: "כספי", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 7, groupName: "כספי", options: [
      { label: "₪ ILS", value: "ILS" }, { label: "$ USD", value: "USD" }, { label: "€ EUR", value: "EUR" },
    ], defaultValue: "ILS" },
    { name: "נדרש עד", slug: "needed_by", fieldType: "date", sortOrder: 8, groupName: "לוח זמנים" },
    { name: "מאשר", slug: "approved_by", fieldType: "text", sortOrder: 9, groupName: "אישורים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "כללי" },
  ]);

  await ensureStatuses(purchaseRequestId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "ממתין לאישור", slug: "pending_approval", color: "#F59E0B", sortOrder: 1 },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 2 },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 3, isFinal: true },
    { name: "בוצע", slug: "fulfilled", color: "#3B82F6", sortOrder: 4, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 5, isFinal: true },
  ]);

  const purchaseRequestItemId = await ensureEntity(moduleId, {
    name: "שורת דרישת רכש",
    namePlural: "שורות דרישת רכש",
    slug: "purchase-request-item",
    description: "פריטים בדרישת רכש",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    sortOrder: 3,
  });

  await ensureFields(purchaseRequestItemId, [
    { name: "דרישת רכש", slug: "parent_request_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: purchaseRequestId, relatedDisplayField: "request_number", relationType: "many_to_one" },
    { name: "תיאור פריט", slug: "item_description", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פריט", showInList: true },
    { name: "חומר מקטלוג", slug: "material_ref", fieldType: "text", sortOrder: 3, groupName: "פרטי פריט" },
    { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "פרטי פריט", showInList: true, defaultValue: "1" },
    { name: "יחידה", slug: "unit", fieldType: "select", sortOrder: 5, groupName: "פרטי פריט", showInList: true, options: [
      { label: "יחידה", value: "יחידה" }, { label: "מ\"ר", value: "מ\"ר" }, { label: "מ\"א", value: "מ\"א" },
      { label: "ק״ג", value: "ק״ג" }, { label: "טון", value: "טון" }, { label: "ליטר", value: "ליטר" },
      { label: "קרטון", value: "קרטון" }, { label: "חבילה", value: "חבילה" }, { label: "פלטה", value: "פלטה" },
    ], defaultValue: "יחידה" },
    { name: "מחיר משוער", slug: "estimated_price", fieldType: "number", sortOrder: 6, groupName: "כספי", showInList: true },
    { name: "ספק מועדף", slug: "preferred_supplier", fieldType: "text", sortOrder: 7, groupName: "אספקה" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const purchaseOrderId = await ensureEntity(moduleId, {
    name: "הזמנת רכש",
    namePlural: "הזמנות רכש",
    slug: "purchase-order",
    description: "ניהול הזמנות רכש לספקים",
    icon: "ShoppingCart",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 4,
  });

  await ensureFields(purchaseOrderId, [
    { name: "מספר הזמנה", slug: "order_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הזמנה", showInList: true, isSearchable: true },
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי הזמנה", showInList: true,
      relatedEntityId: supplierEntityId || undefined, relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "דרישת רכש מקושרת", slug: "request_ref", fieldType: "relation", sortOrder: 3, groupName: "פרטי הזמנה",
      relatedEntityId: purchaseRequestId, relatedDisplayField: "request_number", relationType: "many_to_one" },
    { name: "תאריך הזמנה", slug: "order_date", fieldType: "date", sortOrder: 4, groupName: "תאריכים", showInList: true },
    { name: "אספקה צפויה", slug: "expected_delivery", fieldType: "date", sortOrder: 5, groupName: "תאריכים", showInList: true },
    { name: "סכום כולל", slug: "total_amount", fieldType: "number", sortOrder: 6, groupName: "כספי", showInList: true, helpText: "סה\"כ = סכום שורות הזמנה (quantity × unit_price)" },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 7, groupName: "כספי", options: [
      { label: "₪ ILS", value: "ILS" }, { label: "$ USD", value: "USD" }, { label: "€ EUR", value: "EUR" },
    ], defaultValue: "ILS" },
    { name: "תנאי תשלום", slug: "payment_terms", fieldType: "text", sortOrder: 8, groupName: "כספי", placeholder: "שוטף 30" },
    { name: "כתובת משלוח", slug: "shipping_address", fieldType: "text", sortOrder: 9, groupName: "משלוח" },
    { name: "מאשר", slug: "approved_by", fieldType: "text", sortOrder: 10, groupName: "אישורים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 11, groupName: "כללי" },
  ]);

  await ensureStatuses(purchaseOrderId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "ממתין לאישור", slug: "pending_approval", color: "#F59E0B", sortOrder: 1 },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 2 },
    { name: "נשלח לספק", slug: "sent_to_supplier", color: "#3B82F6", sortOrder: 3 },
    { name: "בהזמנה", slug: "ordered", color: "#6366F1", sortOrder: 4 },
    { name: "התקבל חלקית", slug: "partially_received", color: "#8B5CF6", sortOrder: 5 },
    { name: "התקבל במלואו", slug: "fully_received", color: "#14B8A6", sortOrder: 6, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 7, isFinal: true },
  ]);

  const purchaseOrderItemId = await ensureEntity(moduleId, {
    name: "שורת הזמנת רכש",
    namePlural: "שורות הזמנת רכש",
    slug: "purchase-order-item",
    description: "פריטים בהזמנת רכש",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    sortOrder: 5,
  });

  await ensureFields(purchaseOrderItemId, [
    { name: "הזמנת רכש", slug: "parent_order_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: purchaseOrderId, relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "תיאור פריט", slug: "item_description", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פריט", showInList: true },
    { name: "חומר מקטלוג", slug: "material_ref", fieldType: "text", sortOrder: 3, groupName: "פרטי פריט" },
    { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "פרטי פריט", showInList: true, defaultValue: "1" },
    { name: "יחידה", slug: "unit", fieldType: "select", sortOrder: 5, groupName: "פרטי פריט", showInList: true, options: [
      { label: "יחידה", value: "יחידה" }, { label: "מ\"ר", value: "מ\"ר" }, { label: "מ\"א", value: "מ\"א" },
      { label: "ק״ג", value: "ק״ג" }, { label: "טון", value: "טון" }, { label: "ליטר", value: "ליטר" },
      { label: "קרטון", value: "קרטון" }, { label: "חבילה", value: "חבילה" }, { label: "פלטה", value: "פלטה" },
    ], defaultValue: "יחידה" },
    { name: "מחיר ליחידה", slug: "unit_price", fieldType: "number", sortOrder: 6, isRequired: true, groupName: "כספי", showInList: true },
    { name: "סה״כ שורה", slug: "total_price", fieldType: "formula", sortOrder: 7, groupName: "כספי", showInList: true, isCalculated: true, formulaExpression: "quantity * unit_price", isReadOnly: true },
    { name: "כמות שהתקבלה", slug: "received_quantity", fieldType: "number", sortOrder: 8, groupName: "קבלה" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  const goodsReceiptId = await ensureEntity(moduleId, {
    name: "קבלת סחורה",
    namePlural: "קבלות סחורה",
    slug: "goods-receipt",
    description: "ניהול קבלות סחורה ובדיקת איכות",
    icon: "PackageCheck",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 6,
  });

  await ensureFields(goodsReceiptId, [
    { name: "מספר קבלה", slug: "receipt_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי קבלה", showInList: true, isSearchable: true },
    { name: "הזמנת רכש", slug: "order_ref", fieldType: "relation", sortOrder: 2, groupName: "פרטי קבלה", showInList: true,
      relatedEntityId: purchaseOrderId, relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 3, isRequired: true, groupName: "פרטי קבלה", showInList: true,
      relatedEntityId: supplierEntityId || undefined, relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "תאריך קבלה", slug: "receipt_date", fieldType: "date", sortOrder: 4, groupName: "פרטי קבלה", showInList: true },
    { name: "מקבל", slug: "received_by", fieldType: "text", sortOrder: 5, groupName: "פרטי קבלה", showInList: true },
    { name: "מיקום מחסן", slug: "warehouse_location", fieldType: "text", sortOrder: 6, groupName: "מחסן", showInList: true, placeholder: "מדף A-01" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
  ]);

  await ensureStatuses(goodsReceiptId, [
    { name: "חדש", slug: "new", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "בבדיקה", slug: "inspection", color: "#F59E0B", sortOrder: 1 },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 2 },
    { name: "התקבל", slug: "received", color: "#14B8A6", sortOrder: 3, isFinal: true },
    { name: "נדחה חלקית", slug: "partially_rejected", color: "#EF4444", sortOrder: 4 },
  ]);

  const goodsReceiptItemId = await ensureEntity(moduleId, {
    name: "שורת קבלת סחורה",
    namePlural: "שורות קבלת סחורה",
    slug: "goods-receipt-item",
    description: "פריטים בקבלת סחורה",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    sortOrder: 7,
  });

  await ensureFields(goodsReceiptItemId, [
    { name: "קבלת סחורה", slug: "parent_receipt_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: goodsReceiptId, relatedDisplayField: "receipt_number", relationType: "many_to_one" },
    { name: "תיאור פריט", slug: "item_description", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פריט", showInList: true },
    { name: "חומר", slug: "material_ref", fieldType: "text", sortOrder: 3, groupName: "פרטי פריט" },
    { name: "כמות צפויה", slug: "expected_quantity", fieldType: "number", sortOrder: 4, groupName: "כמויות", showInList: true },
    { name: "כמות שהתקבלה", slug: "received_quantity", fieldType: "number", sortOrder: 5, isRequired: true, groupName: "כמויות", showInList: true },
    { name: "יחידה", slug: "unit", fieldType: "select", sortOrder: 6, groupName: "כמויות", options: [
      { label: "יחידה", value: "יחידה" }, { label: "מ\"ר", value: "מ\"ר" }, { label: "מ\"א", value: "מ\"א" },
      { label: "ק״ג", value: "ק״ג" }, { label: "טון", value: "טון" }, { label: "ליטר", value: "ליטר" },
    ], defaultValue: "יחידה" },
    { name: "סטטוס איכות", slug: "quality_status", fieldType: "select", sortOrder: 7, groupName: "איכות", showInList: true, options: [
      { label: "תקין", value: "תקין" }, { label: "פגום חלקית", value: "פגום חלקית" },
      { label: "פגום", value: "פגום" }, { label: "דרוש בדיקה", value: "דרוש בדיקה" },
    ], defaultValue: "תקין" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const rawMaterialId = await ensureEntity(moduleId, {
    name: "חומר גלם",
    namePlural: "חומרי גלם",
    slug: "raw-material-procurement",
    description: "קטלוג חומרי גלם — ניהול מלאי ומחירים",
    icon: "Boxes",
    entityType: "master",
    hasStatus: true,
    hasCategories: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 8,
  });

  await ensureFields(rawMaterialId, [
    { name: "מספר חומר", slug: "material_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חומר", showInList: true, isSearchable: true },
    { name: "שם חומר", slug: "material_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי חומר", showInList: true, isSearchable: true },
    { name: "קטגוריה", slug: "category", fieldType: "select", sortOrder: 3, groupName: "פרטי חומר", showInList: true, isFilterable: true, options: [
      { label: "ברזל", value: "ברזל" }, { label: "אלומיניום", value: "אלומיניום" }, { label: "זכוכית", value: "זכוכית" },
      { label: "נירוסטה", value: "נירוסטה" }, { label: "פרזול", value: "פרזול" }, { label: "צבע", value: "צבע" },
      { label: "אביזרים", value: "אביזרים" }, { label: "חומרי גלם", value: "חומרי גלם" }, { label: "כללי", value: "כללי" },
    ], defaultValue: "כללי" },
    { name: "תת-קטגוריה", slug: "sub_category", fieldType: "text", sortOrder: 4, groupName: "פרטי חומר" },
    { name: "יחידת מידה", slug: "unit", fieldType: "select", sortOrder: 5, groupName: "פרטי חומר", showInList: true, options: [
      { label: "יחידה", value: "יחידה" }, { label: "מטר", value: "מטר" }, { label: "ק״ג", value: "ק״ג" },
      { label: "טון", value: "טון" }, { label: "ליטר", value: "ליטר" }, { label: "מ״ר", value: "מ״ר" },
      { label: "מ״ק", value: "מ״ק" }, { label: "חבילה", value: "חבילה" }, { label: "גליל", value: "גליל" },
      { label: "קרטון", value: "קרטון" },
    ], defaultValue: "יחידה" },
    { name: "דרגת חומר", slug: "material_grade", fieldType: "text", sortOrder: 6, groupName: "פרטי חומר", placeholder: "A36, 6061-T6..." },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 7, groupName: "פרטי חומר" },
    { name: "מחיר תקני", slug: "standard_price", fieldType: "number", sortOrder: 8, groupName: "מחירים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 9, groupName: "מחירים", options: [
      { label: "₪ ILS", value: "ILS" }, { label: "$ USD", value: "USD" }, { label: "€ EUR", value: "EUR" },
    ], defaultValue: "ILS" },
    { name: "מלאי נוכחי", slug: "current_stock", fieldType: "number", sortOrder: 10, groupName: "מלאי", showInList: true },
    { name: "מלאי מינימום", slug: "minimum_stock", fieldType: "number", sortOrder: 11, groupName: "מלאי" },
    { name: "נקודת הזמנה", slug: "reorder_point", fieldType: "number", sortOrder: 12, groupName: "מלאי" },
    { name: "משקל ליחידה", slug: "weight_per_unit", fieldType: "number", sortOrder: 13, groupName: "מפרט" },
    { name: "מידות", slug: "dimensions", fieldType: "text", sortOrder: 14, groupName: "מפרט", placeholder: "100x50x3 מ״מ" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 15, groupName: "כללי" },
  ]);

  await ensureStatuses(rawMaterialId, [
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 0, isDefault: true },
    { name: "לא פעיל", slug: "inactive", color: "#EF4444", sortOrder: 1, isFinal: true },
  ]);

  await ensureEntity(moduleId, {
    name: "חומר גלם במלאי",
    namePlural: "חומרי גלם במלאי",
    slug: "raw-material-inventory",
    description: "מעקב מלאי חומרי גלם — כמויות, מיקומים ותנועות",
    icon: "Boxes",
    entityType: "master",
    hasStatus: true,
    sortOrder: 9,
  });

  const rawMatInvId = await getEntityIdBySlug("raw-material-inventory");
  if (rawMatInvId) {
    await ensureFields(rawMatInvId, [
      { name: "חומר", slug: "material_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטי מלאי", showInList: true,
        relatedEntityId: rawMaterialId, relatedDisplayField: "material_name", relationType: "many_to_one" },
      { name: "מיקום מחסן", slug: "warehouse_location", fieldType: "text", sortOrder: 2, groupName: "פרטי מלאי", showInList: true },
      { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "כמויות", showInList: true },
      { name: "יחידה", slug: "unit", fieldType: "text", sortOrder: 4, groupName: "כמויות", showInList: true },
      { name: "אצווה", slug: "batch_number", fieldType: "text", sortOrder: 5, groupName: "מעקב" },
      { name: "תאריך כניסה", slug: "entry_date", fieldType: "date", sortOrder: 6, groupName: "מעקב", showInList: true },
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
    ]);

    await ensureStatuses(rawMatInvId, [
      { name: "זמין", slug: "available", color: "#22C55E", sortOrder: 0, isDefault: true },
      { name: "שמור", slug: "reserved", color: "#F59E0B", sortOrder: 1 },
      { name: "חסום", slug: "blocked", color: "#EF4444", sortOrder: 2 },
    ]);
  }

  const inventoryTransactionId = await ensureEntity(moduleId, {
    name: "תנועת מלאי",
    namePlural: "תנועות מלאי",
    slug: "inventory-transaction",
    description: "מעקב תנועות מלאי — כניסות, יציאות, העברות",
    icon: "ArrowLeftRight",
    entityType: "transaction",
    hasStatus: false,
    hasAudit: true,
    sortOrder: 10,
  });

  await ensureFields(inventoryTransactionId, [
    { name: "חומר", slug: "material_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטי תנועה", showInList: true,
      relatedEntityId: rawMaterialId, relatedDisplayField: "material_name", relationType: "many_to_one" },
    { name: "סוג תנועה", slug: "transaction_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי תנועה", showInList: true, isFilterable: true, options: [
      { label: "כניסה", value: "כניסה" }, { label: "יציאה", value: "יציאה" }, { label: "העברה", value: "העברה" },
      { label: "התאמה", value: "התאמה" }, { label: "החזרה", value: "החזרה" },
    ]},
    { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "פרטי תנועה", showInList: true },
    { name: "סוג הפניה", slug: "reference_type", fieldType: "select", sortOrder: 4, groupName: "הפניה", options: [
      { label: "קבלת סחורה", value: "goods_receipt" }, { label: "הזמנת ייצור", value: "work_order" },
      { label: "ספירת מלאי", value: "stock_count" }, { label: "אחר", value: "other" },
    ]},
    { name: "מזהה הפניה", slug: "reference_id", fieldType: "text", sortOrder: 5, groupName: "הפניה" },
    { name: "מיקום מחסן", slug: "warehouse_location", fieldType: "text", sortOrder: 6, groupName: "מחסן", showInList: true },
    { name: "מבצע", slug: "performed_by", fieldType: "text", sortOrder: 7, groupName: "ביצוע", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const priceHistoryId = await ensureEntity(moduleId, {
    name: "היסטוריית מחירים",
    namePlural: "היסטוריית מחירים",
    slug: "price-history",
    description: "מעקב אחר מחירי ספקים והשוואות",
    icon: "TrendingUp",
    entityType: "transaction",
    hasStatus: false,
    hasAudit: true,
    sortOrder: 11,
  });

  await ensureFields(priceHistoryId, [
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true,
      relatedEntityId: supplierEntityId || undefined, relatedDisplayField: "supplier_name", relationType: "many_to_one" },
    { name: "חומר", slug: "material_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטים", showInList: true,
      relatedEntityId: rawMaterialId, relatedDisplayField: "material_name", relationType: "many_to_one" },
    { name: "מחיר", slug: "price", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "מחירים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 4, groupName: "מחירים", options: [
      { label: "₪ ILS", value: "ILS" }, { label: "$ USD", value: "USD" }, { label: "€ EUR", value: "EUR" },
    ], defaultValue: "ILS" },
    { name: "תוקף מ-", slug: "valid_from", fieldType: "date", sortOrder: 5, groupName: "תוקף", showInList: true },
    { name: "תוקף עד", slug: "valid_until", fieldType: "date", sortOrder: 6, groupName: "תוקף", showInList: true },
    { name: "שם מחירון", slug: "price_list_name", fieldType: "text", sortOrder: 7, groupName: "מחירים" },
    { name: "% הנחה", slug: "discount_percentage", fieldType: "number", sortOrder: 8, groupName: "מחירים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  const purchaseApprovalId = await ensureEntity(moduleId, {
    name: "אישור רכש",
    namePlural: "אישורי רכש",
    slug: "purchase-approval",
    description: "מעקב אישורי דרישות רכש — רמות אישור, סטטוס ותגובות",
    icon: "CheckCircle",
    entityType: "transaction",
    hasStatus: true,
    hasAudit: true,
    sortOrder: 12,
  });

  await ensureFields(purchaseApprovalId, [
    { name: "דרישת רכש", slug: "request_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור", showInList: true,
      relatedEntityId: purchaseRequestId, relatedDisplayField: "request_number", relationType: "many_to_one" },
    { name: "מאשר", slug: "approver_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "אישור", showInList: true, isSearchable: true },
    { name: "רמת אישור", slug: "approval_level", fieldType: "number", sortOrder: 3, groupName: "אישור", showInList: true, defaultValue: "1" },
    { name: "הערות", slug: "comments", fieldType: "textarea", sortOrder: 4, groupName: "אישור" },
    { name: "תאריך אישור", slug: "approved_at", fieldType: "date", sortOrder: 5, groupName: "אישור", showInList: true },
  ]);

  await ensureStatuses(purchaseApprovalId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  await ensureInlineChildRelation(
    purchaseRequestId, purchaseRequestItemId,
    "שורות דרישה", "דרישת רכש", "parent_request_ref", 1
  );
  await ensureInlineChildRelation(
    purchaseRequestId, purchaseApprovalId,
    "אישורים", "דרישת רכש", "request_ref", 2
  );
  await ensureInlineChildRelation(
    purchaseOrderId, purchaseOrderItemId,
    "שורות הזמנה", "הזמנת רכש", "parent_order_ref", 1,
    {
      aggregations: [
        { function: "SUM", sourceField: "total_price", targetField: "total_amount" },
      ],
    }
  );
  await ensureInlineChildRelation(
    goodsReceiptId, goodsReceiptItemId,
    "שורות קבלה", "קבלת סחורה", "parent_receipt_ref", 1
  );

  await ensureWorkflow(moduleId, {
    name: "אישור דרישת רכש",
    slug: "purchase-request-approval",
    description: "תהליך אישור דרישות רכש — שינוי סטטוס לממתין לאישור מפעיל בקשת אישור",
    triggerType: "on_status_change",
    triggerConfig: {
      entityId: purchaseRequestId,
    },
    conditions: [
      { field: "oldStatus", operator: "equals", value: "draft" },
      { field: "status", operator: "equals", value: "pending_approval" },
    ],
    actions: [
      {
        type: "approval",
        config: {
          approverRole: "procurement_manager",
          title: "אישור דרישת רכש",
          message: "דרישת רכש ממתינה לאישורך",
          onApprove: [
            { type: "change_status", config: { targetStatus: "approved" } },
          ],
          onReject: [
            { type: "change_status", config: { targetStatus: "rejected" } },
          ],
        },
      },
    ],
  });

  console.log("[seed] Purchase & Inventory entities created successfully.");
}

async function seedCrmMissingEntities() {
  console.log("[seed] Adding missing CRM entities & fields...");

  let crmModuleId = await getModuleIdBySlug("crm-advanced");
  if (!crmModuleId) {
    crmModuleId = await ensureModule({
      name: "CRM מתקדם",
      slug: "crm-advanced",
      nameHe: "CRM מתקדם",
      nameEn: "Advanced CRM",
      description: "ניהול לקוחות, אנשי קשר, פעילויות, משלוחים והחזרות",
      icon: "Users",
      color: "#3B82F6",
      category: "CRM",
      sortOrder: 2,
    });
  }

  const customerEntityId = await getEntityIdBySlug("customer");

  if (customerEntityId) {
    await ensureFields(customerEntityId, [
      { name: "מספר עוסק מורשה", slug: "tax_id", fieldType: "text", sortOrder: 70, groupName: "פרטי מס", helpText: "מספר עוסק מורשה/פטור" },
      { name: "מספר ח.פ.", slug: "company_registration", fieldType: "text", sortOrder: 71, groupName: "פרטי מס", helpText: "מספר חברה ברשם החברות" },
      { name: "סיווג מס", slug: "tax_classification", fieldType: "select", sortOrder: 72, groupName: "פרטי מס", isFilterable: true, options: [
        { label: "עוסק מורשה", value: "authorized_dealer" },
        { label: "עוסק פטור", value: "exempt_dealer" },
        { label: 'מלכ"ר', value: "non_profit" },
        { label: "חברה בע\"מ", value: "ltd_company" },
      ]},
      { name: "כתובת חיוב", slug: "billing_address", fieldType: "textarea", sortOrder: 73, groupName: "כתובות" },
      { name: "כתובת משלוח", slug: "shipping_address", fieldType: "textarea", sortOrder: 74, groupName: "כתובות" },
      { name: "תנאי אשראי", slug: "credit_terms", fieldType: "select", sortOrder: 75, groupName: "כספי", options: [
        { label: "מזומן", value: "cash" },
        { label: "שוטף + 30", value: "net30" },
        { label: "שוטף + 60", value: "net60" },
        { label: "שוטף + 90", value: "net90" },
      ]},
      { name: "אתר אינטרנט", slug: "website_url", fieldType: "text", sortOrder: 76, groupName: "פרטי קשר" },
      { name: "הערות פנימיות", slug: "internal_notes", fieldType: "textarea", sortOrder: 77, groupName: "פנימי", showInList: false },
    ]);
  }

  const contactPersonId = await ensureEntity(crmModuleId, {
    name: "איש קשר",
    namePlural: "אנשי קשר",
    slug: "contact-person",
    description: "אנשי קשר של לקוחות — שם, תפקיד, טלפון, אימייל",
    icon: "User",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 20,
  });

  await ensureFields(contactPersonId, [
    { name: "שם מלא", slug: "full_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי איש קשר", showInList: true, isSearchable: true },
    { name: "תפקיד", slug: "job_title", fieldType: "text", sortOrder: 2, groupName: "פרטי איש קשר", showInList: true },
    { name: "טלפון", slug: "phone", fieldType: "text", sortOrder: 3, groupName: "פרטי קשר", showInList: true },
    { name: "טלפון נייד", slug: "mobile", fieldType: "text", sortOrder: 4, groupName: "פרטי קשר", showInList: true },
    { name: "אימייל", slug: "email", fieldType: "text", sortOrder: 5, groupName: "פרטי קשר", showInList: true, isSearchable: true },
    { name: "מחלקה", slug: "department", fieldType: "text", sortOrder: 6, groupName: "פרטי איש קשר" },
    { name: "איש קשר ראשי", slug: "is_primary", fieldType: "select", sortOrder: 7, groupName: "פרטי איש קשר", showInList: true, options: [
      { label: "כן", value: "yes" }, { label: "לא", value: "no" },
    ], defaultValue: "no" },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 8, groupName: "קישור", isRequired: true,
      relatedEntityId: customerEntityId || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  if (customerEntityId) {
    await ensureInlineChildRelation(
      customerEntityId, contactPersonId,
      "אנשי קשר", "לקוח", "customer_ref", 10
    );
  }

  const crmActivityId = await ensureEntity(crmModuleId, {
    name: "פעילות CRM",
    namePlural: "פעילויות CRM",
    slug: "crm-activity",
    description: "יומן פעילויות CRM — שיחות, פגישות, אימיילים, משימות",
    icon: "Activity",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 21,
  });

  await ensureFields(crmActivityId, [
    { name: "סוג פעילות", slug: "activity_type", fieldType: "select", sortOrder: 1, isRequired: true, groupName: "פרטי פעילות", showInList: true, isFilterable: true, options: [
      { label: "שיחה טלפונית", value: "call" },
      { label: "פגישה", value: "meeting" },
      { label: "אימייל", value: "email" },
      { label: "משימה", value: "task" },
      { label: "הודעת WhatsApp", value: "whatsapp" },
    ]},
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פעילות", showInList: true, isSearchable: true },
    { name: "תאריך", slug: "activity_date", fieldType: "datetime", sortOrder: 3, isRequired: true, groupName: "פרטי פעילות", showInList: true, isFilterable: true },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 4, groupName: "קישור",
      relatedEntityId: customerEntityId || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "ליד", slug: "lead_ref", fieldType: "relation", sortOrder: 5, groupName: "קישור",
      relatedEntityId: await getEntityIdBySlug("lead") || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "אחראי", slug: "assigned_to", fieldType: "text", sortOrder: 6, groupName: "פרטי פעילות", showInList: true },
    { name: "תזכורת", slug: "reminder_date", fieldType: "datetime", sortOrder: 7, groupName: "תזכורות" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 8, groupName: "פרטים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(crmActivityId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "בוצע", slug: "completed", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const deliveryNoteId = await ensureEntity(crmModuleId, {
    name: "תעודת משלוח",
    namePlural: "תעודות משלוח",
    slug: "delivery-note",
    description: "תעודות משלוח יוצאות ללקוחות",
    icon: "Truck",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 22,
  });

  await ensureFields(deliveryNoteId, [
    { name: "מספר תעודה", slug: "note_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי תעודה", showInList: true, isSearchable: true },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי תעודה", showInList: true,
      relatedEntityId: customerEntityId || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "כתובת משלוח", slug: "shipping_address", fieldType: "textarea", sortOrder: 3, groupName: "משלוח" },
    { name: "תאריך משלוח", slug: "delivery_date", fieldType: "date", sortOrder: 4, isRequired: true, groupName: "משלוח", showInList: true, isFilterable: true },
    { name: "נהג/שליח", slug: "driver_name", fieldType: "text", sortOrder: 5, groupName: "משלוח", showInList: true },
    { name: "חתימת מקבל", slug: "receiver_signature", fieldType: "text", sortOrder: 6, groupName: "קבלה", helpText: "שם החותם על קבלת הסחורה" },
    { name: "תאריך קבלה", slug: "received_date", fieldType: "date", sortOrder: 7, groupName: "קבלה" },
    { name: "הזמנת מכירה", slug: "sales_order_ref", fieldType: "relation", sortOrder: 8, groupName: "קישור",
      relatedEntityId: await getEntityIdBySlug("sales-order") || undefined, relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(deliveryNoteId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נשלח", slug: "shipped", color: "#3B82F6", sortOrder: 1 },
    { name: "נמסר", slug: "delivered", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "נמסר חלקית", slug: "partial", color: "#F59E0B", sortOrder: 3 },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 4, isFinal: true },
  ]);

  const deliveryNoteItemId = await ensureEntity(crmModuleId, {
    name: "שורת תעודת משלוח",
    namePlural: "שורות תעודת משלוח",
    slug: "delivery-note-item",
    description: "שורות פריטים בתעודת משלוח",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 24,
  });

  await ensureFields(deliveryNoteItemId, [
    { name: "תעודת משלוח", slug: "parent_delivery_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: deliveryNoteId, relatedDisplayField: "note_number", relationType: "many_to_one" },
    { name: "תיאור פריט", slug: "item_description", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פריט", showInList: true },
    { name: 'מק"ט', slug: "sku", fieldType: "text", sortOrder: 3, groupName: "פרטי פריט", showInList: true },
    { name: "כמות", slug: "quantity", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "פרטי פריט", showInList: true, defaultValue: "1" },
    { name: "יחידה", slug: "unit", fieldType: "text", sortOrder: 5, groupName: "פרטי פריט", showInList: true, defaultValue: "יחידה" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 6, groupName: "כללי" },
  ]);

  await ensureInlineChildRelation(
    deliveryNoteId, deliveryNoteItemId,
    "שורות משלוח", "תעודת משלוח", "parent_delivery_ref", 1
  );

  const rmaId = await ensureEntity(crmModuleId, {
    name: "החזרת מכירה",
    namePlural: "החזרות מכירה",
    slug: "sales-return",
    description: "ניהול החזרות סחורה מלקוחות (RMA)",
    icon: "RotateCcw",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 23,
  });

  await ensureFields(rmaId, [
    { name: "מספר החזרה", slug: "return_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי החזרה", showInList: true, isSearchable: true },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי החזרה", showInList: true,
      relatedEntityId: customerEntityId || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "חשבונית מקורית", slug: "original_invoice_ref", fieldType: "relation", sortOrder: 3, groupName: "קישור",
      relatedEntityId: await getEntityIdBySlug("invoice") || undefined, relatedDisplayField: "invoice_number", relationType: "many_to_one" },
    { name: "פריטים מוחזרים", slug: "returned_items", fieldType: "textarea", sortOrder: 4, groupName: "פריטים", helpText: "פירוט הפריטים המוחזרים וכמויות" },
    { name: "סיבת החזרה", slug: "return_reason", fieldType: "select", sortOrder: 5, isRequired: true, groupName: "פרטי החזרה", showInList: true, isFilterable: true, options: [
      { label: "פגם בייצור", value: "defect" },
      { label: "אי התאמה", value: "mismatch" },
      { label: "נזק במשלוח", value: "shipping_damage" },
      { label: "שינוי דעת לקוח", value: "customer_change" },
      { label: "הזמנה שגויה", value: "wrong_order" },
      { label: "אחר", value: "other" },
    ]},
    { name: "סכום זיכוי", slug: "credit_amount", fieldType: "number", sortOrder: 6, groupName: "כספי", showInList: true },
    { name: "תאריך החזרה", slug: "return_date", fieldType: "date", sortOrder: 7, groupName: "פרטי החזרה", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  await ensureStatuses(rmaId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "אושר", slug: "approved", color: "#3B82F6", sortOrder: 1 },
    { name: "התקבל", slug: "received", color: "#8B5CF6", sortOrder: 2 },
    { name: "בוצע זיכוי", slug: "credited", color: "#22C55E", sortOrder: 3, isFinal: true },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 4, isFinal: true },
  ]);

  console.log("[seed] CRM missing entities & fields created successfully.");
}

async function seedFinanceMissingEntities() {
  console.log("[seed] Adding missing Finance entities & fields...");

  let financeModuleId = await getModuleIdBySlug("finance");
  if (!financeModuleId) {
    financeModuleId = await ensureModule({
      name: "כספים",
      slug: "finance",
      nameHe: "כספים",
      nameEn: "Finance",
      description: "ניהול כספים — חובות, חייבים, הוצאות, תשלומים, תקציבים",
      icon: "DollarSign",
      color: "#F59E0B",
      category: "כספים",
      sortOrder: 5,
    });
  }

  const chartOfAccountsId = await ensureEntity(financeModuleId, {
    name: "חשבון",
    namePlural: "מפתח חשבונות",
    slug: "chart-of-accounts",
    description: "מפתח חשבונות — עץ חשבונות הנהלת חשבונות",
    icon: "FolderTree",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 10,
  });

  await ensureFields(chartOfAccountsId, [
    { name: "מספר חשבון", slug: "account_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
    { name: "שם חשבון", slug: "account_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
    { name: "סוג חשבון", slug: "account_type", fieldType: "select", sortOrder: 3, isRequired: true, groupName: "פרטי חשבון", showInList: true, isFilterable: true, options: [
      { label: "נכס", value: "asset" },
      { label: "התחייבות", value: "liability" },
      { label: "הון", value: "equity" },
      { label: "הכנסה", value: "revenue" },
      { label: "הוצאה", value: "expense" },
    ]},
    { name: "חשבון אב", slug: "parent_account_ref", fieldType: "relation", sortOrder: 4, groupName: "מבנה",
      relatedEntityId: chartOfAccountsId, relatedDisplayField: "account_name", relationType: "many_to_one", helpText: "חשבון אב (להיררכיה)" },
    { name: "רמה", slug: "level", fieldType: "number", sortOrder: 5, groupName: "מבנה", defaultValue: "1" },
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 6, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
    { name: "מטבע ברירת מחדל", slug: "default_currency", fieldType: "select", sortOrder: 7, groupName: "פרטי חשבון", defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const journalEntryId = await ensureEntity(financeModuleId, {
    name: "פקודת יומן",
    namePlural: "פקודות יומן",
    slug: "journal-entry",
    description: "פקודות יומן חשבונאיות — חובה וזכות",
    icon: "FileText",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 11,
  });

  await ensureFields(journalEntryId, [
    { name: "מספר פקודה", slug: "entry_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פקודה", showInList: true, isSearchable: true },
    { name: "תאריך", slug: "entry_date", fieldType: "date", sortOrder: 2, isRequired: true, groupName: "פרטי פקודה", showInList: true, isFilterable: true },
    { name: "תיאור", slug: "description", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי פקודה", showInList: true, isSearchable: true },
    { name: "אסמכתא", slug: "reference", fieldType: "text", sortOrder: 4, groupName: "פרטי פקודה", showInList: true },
    { name: "סכום חובה כולל", slug: "total_debit", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: true },
    { name: "סכום זכות כולל", slug: "total_credit", fieldType: "number", sortOrder: 6, groupName: "סכומים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
  ]);

  await ensureStatuses(journalEntryId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "מבוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const journalEntryLineId = await ensureEntity(financeModuleId, {
    name: "שורת פקודת יומן",
    namePlural: "שורות פקודת יומן",
    slug: "journal-entry-line",
    description: "שורות חובה וזכות בפקודת יומן",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 15,
  });

  await ensureFields(journalEntryLineId, [
    { name: "פקודת יומן", slug: "parent_entry_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: journalEntryId, relatedDisplayField: "entry_number", relationType: "many_to_one" },
    { name: "חשבון", slug: "account_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי שורה", showInList: true,
      relatedEntityId: chartOfAccountsId, relatedDisplayField: "account_name", relationType: "many_to_one" },
    { name: "חובה", slug: "debit_amount", fieldType: "number", sortOrder: 3, groupName: "סכומים", showInList: true, defaultValue: "0" },
    { name: "זכות", slug: "credit_amount", fieldType: "number", sortOrder: 4, groupName: "סכומים", showInList: true, defaultValue: "0" },
    { name: "תיאור", slug: "line_description", fieldType: "text", sortOrder: 5, groupName: "פרטי שורה", showInList: true },
    { name: "אסמכתא", slug: "reference", fieldType: "text", sortOrder: 6, groupName: "פרטי שורה" },
  ]);

  await ensureInlineChildRelation(
    journalEntryId, journalEntryLineId,
    "שורות פקודה", "פקודת יומן", "parent_entry_ref", 1,
    {
      aggregations: [
        { function: "SUM", sourceField: "debit_amount", targetField: "total_debit" },
        { function: "SUM", sourceField: "credit_amount", targetField: "total_credit" },
      ],
    }
  );

  const creditNoteId = await ensureEntity(financeModuleId, {
    name: "הודעת זיכוי",
    namePlural: "הודעות זיכוי",
    slug: "credit-note",
    description: "הודעות זיכוי ללקוחות",
    icon: "Receipt",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 12,
  });

  await ensureFields(creditNoteId, [
    { name: "מספר זיכוי", slug: "credit_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי זיכוי", showInList: true, isSearchable: true },
    { name: "לקוח", slug: "customer_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי זיכוי", showInList: true,
      relatedEntityId: await getEntityIdBySlug("customer") || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "חשבונית מקושרת", slug: "invoice_ref", fieldType: "relation", sortOrder: 3, groupName: "קישור",
      relatedEntityId: await getEntityIdBySlug("invoice") || undefined, relatedDisplayField: "invoice_number", relationType: "many_to_one" },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים" },
    { name: "סכום כולל מע\"מ", slug: "total_amount", fieldType: "number", sortOrder: 6, groupName: "סכומים", showInList: true },
    { name: "סיבת זיכוי", slug: "reason", fieldType: "textarea", sortOrder: 7, groupName: "פרטים", showInList: true },
    { name: "תאריך", slug: "credit_date", fieldType: "date", sortOrder: 8, isRequired: true, groupName: "פרטים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(creditNoteId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "מבוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const debitNoteId = await ensureEntity(financeModuleId, {
    name: "הודעת חיוב",
    namePlural: "הודעות חיוב",
    slug: "debit-note",
    description: "הודעות חיוב לספקים",
    icon: "Receipt",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 13,
  });

  await ensureFields(debitNoteId, [
    { name: "מספר חיוב", slug: "debit_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חיוב", showInList: true, isSearchable: true },
    { name: "ספק", slug: "supplier_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי חיוב", showInList: true,
      relatedEntityId: await getEntityIdBySlug("supplier") || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 4, groupName: "סכומים" },
    { name: "סכום כולל מע\"מ", slug: "total_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: true },
    { name: "סיבת חיוב", slug: "reason", fieldType: "textarea", sortOrder: 6, groupName: "פרטים", showInList: true },
    { name: "תאריך", slug: "debit_date", fieldType: "date", sortOrder: 7, isRequired: true, groupName: "פרטים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  await ensureStatuses(debitNoteId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "מבוטל", slug: "cancelled", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const expenseEntityId = await getEntityIdBySlug("finance-expenses");
  if (expenseEntityId) {
    await ensureFields(expenseEntityId, [
      { name: "פרויקט משויך", slug: "project_ref", fieldType: "text", sortOrder: 20, groupName: "סיווג נוסף" },
      { name: "מרכז עלות", slug: "cost_center", fieldType: "text", sortOrder: 21, groupName: "סיווג נוסף" },
      { name: "ניתן לניכוי מס", slug: "tax_deductible", fieldType: "select", sortOrder: 22, groupName: "מס", options: [
        { label: "כן", value: "yes" }, { label: "לא", value: "no" }, { label: "חלקי", value: "partial" },
      ]},
      { name: "אחוז מע\"מ", slug: "vat_percent", fieldType: "number", sortOrder: 23, groupName: "מס", defaultValue: "18" },
      { name: "סוג מס", slug: "tax_type", fieldType: "select", sortOrder: 24, groupName: "מס", options: [
        { label: "תשומות", value: "input_tax" },
        { label: 'מע"מ 0', value: "zero_vat" },
        { label: "פטור", value: "exempt" },
      ]},
    ]);
  }

  const companySettingsId = await ensureEntity(financeModuleId, {
    name: "הגדרות חברה",
    namePlural: "הגדרות חברה",
    slug: "company-settings",
    description: "הגדרות חברה כספיות — שם, מספר עוסק, שנת כספים, מע\"מ",
    icon: "Settings",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 14,
  });

  await ensureFields(companySettingsId, [
    { name: "שם חברה", slug: "company_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חברה", showInList: true },
    { name: "מספר עוסק", slug: "tax_id", fieldType: "text", sortOrder: 2, groupName: "פרטי חברה", showInList: true },
    { name: "מספר ח.פ.", slug: "company_registration", fieldType: "text", sortOrder: 3, groupName: "פרטי חברה" },
    { name: "כתובת", slug: "address", fieldType: "textarea", sortOrder: 4, groupName: "פרטי חברה" },
    { name: "שנת כספים (התחלה)", slug: "fiscal_year_start", fieldType: "select", sortOrder: 5, groupName: "הגדרות כספיות", defaultValue: "1", options: [
      { label: "ינואר", value: "1" }, { label: "אפריל", value: "4" }, { label: "יולי", value: "7" }, { label: "אוקטובר", value: "10" },
    ]},
    { name: "אחוז מע\"מ ברירת מחדל", slug: "default_vat", fieldType: "number", sortOrder: 6, groupName: "הגדרות כספיות", defaultValue: "18" },
    { name: "מטבע ברירת מחדל", slug: "default_currency", fieldType: "select", sortOrder: 7, groupName: "הגדרות כספיות", defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תנאי תשלום ברירת מחדל", slug: "default_payment_terms", fieldType: "select", sortOrder: 8, groupName: "הגדרות כספיות", options: [
      { label: "מזומן", value: "cash" },
      { label: "שוטף + 30", value: "net30" },
      { label: "שוטף + 60", value: "net60" },
      { label: "שוטף + 90", value: "net90" },
    ]},
  ]);

  console.log("[seed] Finance missing entities & fields created successfully.");
}

async function seedHrMissingEntities() {
  console.log("[seed] Adding missing HR entities & fields...");

  let hrModuleId = await getModuleIdBySlug("hr");
  if (!hrModuleId) {
    hrModuleId = await ensureModule({
      name: "משאבי אנוש",
      slug: "hr",
      nameHe: "משאבי אנוש",
      nameEn: "Human Resources",
      description: "ניהול עובדים, חופשות, הכשרות ומסמכים",
      icon: "Users",
      color: "#8B5CF6",
      category: "משאבי אנוש",
      sortOrder: 6,
    });
  }

  const employeeEntityId = await getEntityIdBySlug("employee");

  if (employeeEntityId) {
    await ensureFields(employeeEntityId, [
      { name: "מספר רישיון נהיגה", slug: "drivers_license", fieldType: "text", sortOrder: 80, groupName: "מסמכים" },
      { name: "תוקף רישיון נהיגה", slug: "drivers_license_expiry", fieldType: "date", sortOrder: 81, groupName: "מסמכים" },
      { name: "גודל חולצה", slug: "shirt_size", fieldType: "select", sortOrder: 82, groupName: "פרטים נוספים", options: [
        { label: "XS", value: "xs" }, { label: "S", value: "s" }, { label: "M", value: "m" },
        { label: "L", value: "l" }, { label: "XL", value: "xl" }, { label: "XXL", value: "xxl" },
        { label: "3XL", value: "3xl" },
      ]},
      { name: "שפות", slug: "languages", fieldType: "text", sortOrder: 83, groupName: "פרטים נוספים", helpText: "שפות מופרדות בפסיקים" },
      { name: "השכלה", slug: "education", fieldType: "select", sortOrder: 84, groupName: "פרטים נוספים", options: [
        { label: "תיכונית", value: "high_school" },
        { label: "תעודה מקצועית", value: "vocational" },
        { label: "תואר ראשון", value: "bachelor" },
        { label: "תואר שני", value: "master" },
        { label: "דוקטורט", value: "phd" },
      ]},
      { name: "מספר ילדים", slug: "children_count", fieldType: "number", sortOrder: 85, groupName: "נקודות זיכוי", helpText: "לחישוב נקודות זיכוי מס" },
      { name: "נקודות זיכוי מס", slug: "tax_credit_points", fieldType: "number", sortOrder: 86, groupName: "נקודות זיכוי" },
    ]);
  }

  const leaveRequestId = await ensureEntity(hrModuleId, {
    name: "בקשת חופשה",
    namePlural: "בקשות חופשה",
    slug: "leave-request",
    description: "ניהול בקשות חופשה ומחלה של עובדים",
    icon: "Calendar",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 10,
  });

  await ensureFields(leaveRequestId, [
    { name: "עובד", slug: "employee_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטי בקשה", showInList: true,
      relatedEntityId: employeeEntityId || undefined, relatedDisplayField: "first_name", relationType: "many_to_one" },
    { name: "סוג חופשה", slug: "leave_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי בקשה", showInList: true, isFilterable: true, options: [
      { label: "חופשה שנתית", value: "annual" },
      { label: "מחלה", value: "sick" },
      { label: "אישית", value: "personal" },
      { label: "ללא תשלום", value: "unpaid" },
      { label: "מילואים", value: "military_reserve" },
      { label: "לידה/הורות", value: "parental" },
      { label: "אבל", value: "bereavement" },
    ]},
    { name: "מתאריך", slug: "start_date", fieldType: "date", sortOrder: 3, isRequired: true, groupName: "תקופה", showInList: true },
    { name: "עד תאריך", slug: "end_date", fieldType: "date", sortOrder: 4, isRequired: true, groupName: "תקופה", showInList: true },
    { name: "מספר ימים", slug: "days_count", fieldType: "number", sortOrder: 5, groupName: "תקופה", showInList: true },
    { name: "מאשר", slug: "approver_name", fieldType: "text", sortOrder: 6, groupName: "אישור", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
  ]);

  await ensureStatuses(leaveRequestId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "נדחה", slug: "rejected", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const trainingId = await ensureEntity(hrModuleId, {
    name: "הכשרה/תעודה",
    namePlural: "הכשרות ותעודות",
    slug: "training-certification",
    description: "ניהול הכשרות ותעודות של עובדים",
    icon: "Award",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 11,
  });

  await ensureFields(trainingId, [
    { name: "עובד", slug: "employee_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true,
      relatedEntityId: employeeEntityId || undefined, relatedDisplayField: "first_name", relationType: "many_to_one" },
    { name: "שם הכשרה/תעודה", slug: "training_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "מוסד", slug: "institution", fieldType: "text", sortOrder: 3, groupName: "פרטים", showInList: true },
    { name: "תאריך קבלה", slug: "issue_date", fieldType: "date", sortOrder: 4, groupName: "תקופה", showInList: true },
    { name: "תאריך תפוגה", slug: "expiry_date", fieldType: "date", sortOrder: 5, groupName: "תקופה", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 6, groupName: "כללי" },
  ]);

  await ensureStatuses(trainingId, [
    { name: "בתהליך", slug: "in_progress", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "בתוקף", slug: "valid", color: "#22C55E", sortOrder: 1 },
    { name: "פג תוקף", slug: "expired", color: "#EF4444", sortOrder: 2, isFinal: true },
  ]);

  const employeeDocId = await ensureEntity(hrModuleId, {
    name: "מסמך עובד",
    namePlural: "מסמכי עובדים",
    slug: "employee-document",
    description: "ניהול מסמכי עובדים — חוזים, טפסים, אישורים",
    icon: "FileText",
    entityType: "transaction",
    hasStatus: false,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 12,
  });

  await ensureFields(employeeDocId, [
    { name: "עובד", slug: "employee_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true,
      relatedEntityId: employeeEntityId || undefined, relatedDisplayField: "first_name", relationType: "many_to_one" },
    { name: "סוג מסמך", slug: "document_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטים", showInList: true, isFilterable: true, options: [
      { label: "חוזה עבודה", value: "contract" },
      { label: "תעודת זהות", value: "id_card" },
      { label: "טופס 101", value: "form_101" },
      { label: "אישור מחלה", value: "sick_note" },
      { label: "אישור לימודים", value: "education_cert" },
      { label: "אישור משטרה", value: "police_clearance" },
      { label: "אחר", value: "other" },
    ]},
    { name: "שם קובץ", slug: "file_name", fieldType: "text", sortOrder: 3, groupName: "פרטים", showInList: true },
    { name: "תאריך העלאה", slug: "upload_date", fieldType: "date", sortOrder: 4, groupName: "תאריכים", showInList: true },
    { name: "תאריך תפוגה", slug: "expiry_date", fieldType: "date", sortOrder: 5, groupName: "תאריכים", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 6, groupName: "כללי" },
  ]);

  console.log("[seed] HR missing entities & fields created successfully.");
}

async function seedProcurementMissingEntities() {
  console.log("[seed] Adding missing Procurement & Inventory entities...");

  let procModuleId = await getModuleIdBySlug("procurement");
  if (!procModuleId) {
    procModuleId = await ensureModule({
      name: "רכש ומלאי",
      slug: "procurement",
      nameHe: "רכש ומלאי",
      nameEn: "Procurement & Inventory",
      description: "ניהול רכש, ספקים, מלאי והזמנות",
      icon: "ShoppingCart",
      color: "#10B981",
      category: "תפעול",
      sortOrder: 3,
    });
  }

  const rfqId = await ensureEntity(procModuleId, {
    name: "בקשת הצעת מחיר",
    namePlural: "בקשות הצעות מחיר",
    slug: "rfq",
    description: "בקשות הצעות מחיר מספקים (RFQ)",
    icon: "FileBarChart",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 15,
  });

  await ensureFields(rfqId, [
    { name: "מספר RFQ", slug: "rfq_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "כותרת", slug: "title", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "ספקים מוזמנים", slug: "invited_suppliers", fieldType: "textarea", sortOrder: 3, groupName: "ספקים", helpText: "שמות ספקים מופרדים בפסיקים" },
    { name: "פריטים", slug: "items_description", fieldType: "textarea", sortOrder: 4, groupName: "פריטים", helpText: "פירוט פריטים וכמויות נדרשים" },
    { name: "תאריך סגירה", slug: "closing_date", fieldType: "date", sortOrder: 5, groupName: "תאריכים", showInList: true },
    { name: "הצעות שהתקבלו", slug: "received_quotes_count", fieldType: "number", sortOrder: 6, groupName: "הצעות", showInList: true },
    { name: "ספק נבחר", slug: "selected_supplier", fieldType: "text", sortOrder: 7, groupName: "הצעות", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  await ensureStatuses(rfqId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נשלח", slug: "sent", color: "#3B82F6", sortOrder: 1 },
    { name: "התקבלו הצעות", slug: "quotes_received", color: "#8B5CF6", sortOrder: 2 },
    { name: "נבחר ספק", slug: "awarded", color: "#22C55E", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 4, isFinal: true },
  ]);

  const supplierContractId = await ensureEntity(procModuleId, {
    name: "חוזה ספק",
    namePlural: "חוזי ספקים",
    slug: "supplier-contract",
    description: "ניהול חוזים מול ספקים",
    icon: "FileText",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 16,
  });

  await ensureFields(supplierContractId, [
    { name: "ספק", slug: "supplier_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חוזה", showInList: true, isSearchable: true },
    { name: "סוג חוזה", slug: "contract_type", fieldType: "select", sortOrder: 2, groupName: "פרטי חוזה", showInList: true, isFilterable: true, options: [
      { label: "שנתי", value: "annual" },
      { label: "חד-פעמי", value: "one_time" },
      { label: "מסגרת", value: "framework" },
      { label: "שירות", value: "service" },
    ]},
    { name: "תאריך תחילה", slug: "start_date", fieldType: "date", sortOrder: 3, groupName: "תקופה", showInList: true },
    { name: "תאריך סיום", slug: "end_date", fieldType: "date", sortOrder: 4, groupName: "תקופה", showInList: true },
    { name: "תנאי תשלום", slug: "payment_terms", fieldType: "text", sortOrder: 5, groupName: "תנאים" },
    { name: "SLA", slug: "sla_terms", fieldType: "textarea", sortOrder: 6, groupName: "תנאים" },
    { name: "ערך חוזה", slug: "contract_value", fieldType: "number", sortOrder: 7, groupName: "כספי", showInList: true },
    { name: "תנאים מיוחדים", slug: "special_terms", fieldType: "textarea", sortOrder: 8, groupName: "תנאים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(supplierContractId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 1 },
    { name: "פג תוקף", slug: "expired", color: "#F59E0B", sortOrder: 2, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 3, isFinal: true },
  ]);

  const rawMaterialEntityId = await getEntityIdBySlug("raw-material-inventory");
  if (rawMaterialEntityId) {
    await ensureFields(rawMaterialEntityId, [
      { name: "ברקוד", slug: "barcode", fieldType: "text", sortOrder: 30, groupName: "זיהוי" },
      { name: "קוד QR", slug: "qr_code", fieldType: "text", sortOrder: 31, groupName: "זיהוי" },
      { name: "יצרן", slug: "manufacturer", fieldType: "text", sortOrder: 32, groupName: "יצרן" },
      { name: 'מק"ט יצרן', slug: "manufacturer_part_number", fieldType: "text", sortOrder: 33, groupName: "יצרן" },
      { name: "משקל אריזה", slug: "package_weight", fieldType: "number", sortOrder: 34, groupName: "מידות אריזה" },
      { name: "מדף/תא במחסן", slug: "shelf_location", fieldType: "text", sortOrder: 35, groupName: "מיקום", helpText: "מיקום מדויק במחסן (שורה-מדף-תא)" },
      { name: "תמונת פריט", slug: "item_image_url", fieldType: "text", sortOrder: 36, groupName: "מידע נוסף", helpText: "קישור לתמונת הפריט" },
      { name: "פריט חלופי", slug: "alternative_item", fieldType: "text", sortOrder: 37, groupName: "מידע נוסף", helpText: "מק\"ט פריט חלופי" },
      { name: "מנוהל בסידרה/אצווה", slug: "is_serialized", fieldType: "select", sortOrder: 38, groupName: "מעקב", options: [
        { label: "לא", value: "no" }, { label: "סידרה (Serial)", value: "serial" }, { label: "אצווה (Batch)", value: "batch" },
      ]},
    ]);
  }

  const stockCountId = await ensureEntity(procModuleId, {
    name: "ספירת מלאי",
    namePlural: "ספירות מלאי",
    slug: "stock-count",
    description: "ניהול ספירות מלאי — מלאה, מחזורית, דגימה",
    icon: "ClipboardList",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 17,
  });

  await ensureFields(stockCountId, [
    { name: "מספר ספירה", slug: "count_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי ספירה", showInList: true, isSearchable: true },
    { name: "תאריך ספירה", slug: "count_date", fieldType: "date", sortOrder: 2, isRequired: true, groupName: "פרטי ספירה", showInList: true },
    { name: "סופר", slug: "counted_by", fieldType: "text", sortOrder: 3, groupName: "פרטי ספירה", showInList: true },
    { name: "סוג ספירה", slug: "count_type", fieldType: "select", sortOrder: 4, groupName: "פרטי ספירה", showInList: true, isFilterable: true, options: [
      { label: "מלאה", value: "full" },
      { label: "מחזורית", value: "cycle" },
      { label: "דגימה", value: "sample" },
    ]},
    { name: "מחסן", slug: "warehouse", fieldType: "text", sortOrder: 5, groupName: "פרטי ספירה", showInList: true },
    { name: "סה\"כ הפרשים", slug: "total_variance", fieldType: "number", sortOrder: 6, groupName: "סיכום", showInList: true },
    { name: "מאשר", slug: "approved_by", fieldType: "text", sortOrder: 7, groupName: "אישור" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  await ensureStatuses(stockCountId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "בספירה", slug: "counting", color: "#3B82F6", sortOrder: 1 },
    { name: "ממתין לאישור", slug: "pending_approval", color: "#F59E0B", sortOrder: 2 },
    { name: "מאושר", slug: "approved", color: "#22C55E", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#EF4444", sortOrder: 4, isFinal: true },
  ]);

  const stockCountLineId = await ensureEntity(procModuleId, {
    name: "שורת ספירת מלאי",
    namePlural: "שורות ספירת מלאי",
    slug: "stock-count-line",
    description: "שורות ספירת מלאי — פריט, כמות ספורה, כמות מערכת, הפרש",
    icon: "List",
    entityType: "transaction",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 18,
  });

  await ensureFields(stockCountLineId, [
    { name: "ספירת מלאי", slug: "parent_count_ref", fieldType: "relation", sortOrder: 1, isRequired: true, groupName: "קישור",
      relatedEntityId: stockCountId, relatedDisplayField: "count_number", relationType: "many_to_one" },
    { name: "פריט", slug: "item_ref", fieldType: "relation", sortOrder: 2, isRequired: true, groupName: "פרטי שורה", showInList: true,
      relatedEntityId: rawMaterialEntityId || undefined, relatedDisplayField: "name", relationType: "many_to_one" },
    { name: "מיקום", slug: "location", fieldType: "text", sortOrder: 3, groupName: "פרטי שורה", showInList: true },
    { name: "כמות מערכת", slug: "system_quantity", fieldType: "number", sortOrder: 4, groupName: "כמויות", showInList: true },
    { name: "כמות ספורה", slug: "counted_quantity", fieldType: "number", sortOrder: 5, isRequired: true, groupName: "כמויות", showInList: true },
    { name: "הפרש", slug: "variance", fieldType: "number", sortOrder: 6, groupName: "כמויות", showInList: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
  ]);

  await ensureInlineChildRelation(
    stockCountId, stockCountLineId,
    "שורות ספירה", "ספירת מלאי", "parent_count_ref", 1,
    {
      aggregations: [
        { function: "SUM", sourceField: "variance", targetField: "total_variance" },
      ],
    }
  );

  console.log("[seed] Procurement & Inventory missing entities created successfully.");
}

async function seedProductionMissingEntities() {
  console.log("[seed] Adding missing Production entities...");

  let prodModuleId = await getModuleIdBySlug("production");
  if (!prodModuleId) {
    prodModuleId = await ensureModule({
      name: "ייצור",
      slug: "production",
      nameHe: "ייצור",
      nameEn: "Production",
      description: "ניהול ייצור — הזמנות עבודה, קווי ייצור, בקרת איכות, מכונות ואי-התאמות",
      icon: "Factory",
      color: "#F59E0B",
      category: "תפעול",
      sortOrder: 4,
    });
  }

  const equipmentId = await ensureEntity(prodModuleId, {
    name: "מכונה/ציוד",
    namePlural: "מכונות וציוד",
    slug: "equipment",
    description: "רישום מכונות וציוד — מספר סידורי, תחזוקה, סטטוס",
    icon: "Cpu",
    entityType: "master",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 10,
  });

  await ensureFields(equipmentId, [
    { name: "שם מכונה", slug: "machine_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מכונה", showInList: true, isSearchable: true },
    { name: "מספר סידורי", slug: "serial_number", fieldType: "text", sortOrder: 2, groupName: "פרטי מכונה", showInList: true, isSearchable: true },
    { name: "סוג ציוד", slug: "equipment_type", fieldType: "text", sortOrder: 3, groupName: "פרטי מכונה", showInList: true, isFilterable: true },
    { name: "מיקום", slug: "location", fieldType: "text", sortOrder: 4, groupName: "פרטי מכונה", showInList: true },
    { name: "תאריך רכישה", slug: "purchase_date", fieldType: "date", sortOrder: 5, groupName: "רכישה" },
    { name: "ספק", slug: "supplier_name", fieldType: "text", sortOrder: 6, groupName: "רכישה" },
    { name: "תאריך תחזוקה אחרון", slug: "last_maintenance_date", fieldType: "date", sortOrder: 7, groupName: "תחזוקה", showInList: true },
    { name: "תאריך תחזוקה הבא", slug: "next_maintenance_date", fieldType: "date", sortOrder: 8, groupName: "תחזוקה", showInList: true },
    { name: "שעות פעילות", slug: "operating_hours", fieldType: "number", sortOrder: 9, groupName: "שימוש" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "כללי" },
  ]);

  await ensureStatuses(equipmentId, [
    { name: "פעיל", slug: "active", color: "#22C55E", sortOrder: 0, isDefault: true },
    { name: "בתחזוקה", slug: "maintenance", color: "#F59E0B", sortOrder: 1 },
    { name: "מושבת", slug: "disabled", color: "#EF4444", sortOrder: 2 },
    { name: "לא פעיל", slug: "inactive", color: "#9CA3AF", sortOrder: 3, isFinal: true },
  ]);

  const ncrId = await ensureEntity(prodModuleId, {
    name: "אי-התאמה",
    namePlural: "אי-התאמות",
    slug: "ncr",
    description: "דוחות אי-התאמה (NCR) — פגמים, פעולות מתקנות",
    icon: "AlertTriangle",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 11,
  });

  await ensureFields(ncrId, [
    { name: "מספר NCR", slug: "ncr_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי אי-התאמה", showInList: true, isSearchable: true },
    { name: "הזמנת עבודה", slug: "work_order_ref", fieldType: "relation", sortOrder: 2, groupName: "קישור",
      relatedEntityId: await getEntityIdBySlug("work-order") || undefined, relatedDisplayField: "order_number", relationType: "many_to_one" },
    { name: "סוג פגם", slug: "defect_type", fieldType: "select", sortOrder: 3, isRequired: true, groupName: "פרטי אי-התאמה", showInList: true, isFilterable: true, options: [
      { label: "מידות שגויות", value: "dimension" },
      { label: "פגם חזותי", value: "visual" },
      { label: "פגם חומר", value: "material" },
      { label: "פגם תפקודי", value: "functional" },
      { label: "אריזה", value: "packaging" },
      { label: "אחר", value: "other" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 4, isRequired: true, groupName: "פרטי אי-התאמה", showInList: true },
    { name: "חומרה", slug: "severity", fieldType: "select", sortOrder: 5, isRequired: true, groupName: "פרטי אי-התאמה", showInList: true, isFilterable: true, options: [
      { label: "נמוכה", value: "low" },
      { label: "בינונית", value: "medium" },
      { label: "גבוהה", value: "high" },
      { label: "קריטית", value: "critical" },
    ]},
    { name: "פעולה מתקנת", slug: "corrective_action", fieldType: "textarea", sortOrder: 6, groupName: "טיפול" },
    { name: "אחראי", slug: "assigned_to", fieldType: "text", sortOrder: 7, groupName: "טיפול", showInList: true },
    { name: "תאריך זיהוי", slug: "identified_date", fieldType: "date", sortOrder: 8, groupName: "תאריכים", showInList: true },
    { name: "תאריך סגירה", slug: "closed_date", fieldType: "date", sortOrder: 9, groupName: "תאריכים" },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "כללי" },
  ]);

  await ensureStatuses(ncrId, [
    { name: "פתוח", slug: "open", color: "#EF4444", sortOrder: 0, isDefault: true },
    { name: "בטיפול", slug: "in_progress", color: "#F59E0B", sortOrder: 1 },
    { name: "סגור", slug: "closed", color: "#22C55E", sortOrder: 2, isFinal: true },
  ]);

  console.log("[seed] Production missing entities created successfully.");
}

async function ensureWorkflow(moduleId: number, def: {
  name: string; slug: string; description?: string;
  triggerType: string; triggerConfig: any; conditions: any[]; actions: any[];
}) {
  const [existing] = await db.select({ id: platformWorkflowsTable.id })
    .from(platformWorkflowsTable)
    .where(and(
      eq(platformWorkflowsTable.moduleId, moduleId),
      eq(platformWorkflowsTable.slug, def.slug),
    ));
  if (existing) return;
  try {
    await db.insert(platformWorkflowsTable).values({
      moduleId,
      name: def.name,
      slug: def.slug,
      description: def.description,
      triggerType: def.triggerType,
      triggerConfig: def.triggerConfig,
      conditions: def.conditions,
      actions: def.actions,
      isActive: true,
    });
  } catch (err: any) {
    console.error(`[seed] Failed to insert workflow "${def.slug}": ${err.message}`);
  }
}

async function seedFinanceDashboardPage(moduleId: number, apId: number, arId: number, expId: number, bankAcctId: number) {
  const { systemDashboardPagesTable, systemDashboardWidgetsTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");

  const existing = await db.select().from(systemDashboardPagesTable).where(eq(systemDashboardPagesTable.slug, "finance-dashboard"));
  if (existing.length > 0) {
    const pageId = existing[0].id;
    const existingWidgets = await db.select().from(systemDashboardWidgetsTable).where(eq(systemDashboardWidgetsTable.dashboardId, pageId));
    if (existingWidgets.length > 0 && existingWidgets.some((w: any) => w.config?.field && !w.config?.fieldSlug)) {
      for (const ew of existingWidgets) {
        await db.delete(systemDashboardWidgetsTable).where(eq(systemDashboardWidgetsTable.id, ew.id));
      }
    } else {
      return;
    }
    const widgets = [
      { widgetType: "kpi_card", title: "סה\"כ חובות לספקים", entityId: apId, config: { aggregation: "sum", fieldSlug: "balance_due", format: "currency", color: "red" }, position: 0, size: "small" },
      { widgetType: "kpi_card", title: "סה\"כ חייבים", entityId: arId, config: { aggregation: "sum", fieldSlug: "balance_due", format: "currency", color: "blue" }, position: 1, size: "small" },
      { widgetType: "kpi_card", title: "הוצאות החודש", entityId: expId, config: { aggregation: "sum", fieldSlug: "amount", format: "currency", color: "orange" }, position: 2, size: "small" },
      { widgetType: "kpi_card", title: "יתרה בבנק", entityId: bankAcctId, config: { aggregation: "sum", fieldSlug: "current_balance", format: "currency", color: "green" }, position: 3, size: "small" },
      { widgetType: "chart_bar", title: "חובות לפי סטטוס", entityId: apId, config: { aggregation: "sum", groupByField: "_status", valueField: "balance_due" }, position: 4, size: "large" },
      { widgetType: "data_table", title: "חשבוניות ספקים אחרונות", entityId: apId, config: { columns: ["invoice_number", "supplier_name", "amount", "balance_due", "due_date", "status"], limit: 10 }, position: 5, size: "large" },
      { widgetType: "data_table", title: "חייבים אחרונים", entityId: arId, config: { columns: ["invoice_number", "customer_name", "amount", "balance_due", "due_date", "status"], limit: 10 }, position: 6, size: "large" },
    ];
    for (const w of widgets) {
      await db.insert(systemDashboardWidgetsTable).values({ dashboardId: pageId, ...w });
    }
    return;
  }

  const [page] = await db.insert(systemDashboardPagesTable).values({
    moduleId,
    name: "דשבורד כספים",
    slug: "finance-dashboard",
    isDefault: true,
    layout: { columns: 4, gap: 16 },
    settings: { refreshInterval: 30000 },
  }).returning();

  const widgets = [
    { widgetType: "kpi_card", title: "סה\"כ חובות לספקים", entityId: apId, config: { aggregation: "sum", fieldSlug: "balance_due", format: "currency", color: "red" }, position: 0, size: "small" },
    { widgetType: "kpi_card", title: "סה\"כ חייבים", entityId: arId, config: { aggregation: "sum", fieldSlug: "balance_due", format: "currency", color: "blue" }, position: 1, size: "small" },
    { widgetType: "kpi_card", title: "הוצאות החודש", entityId: expId, config: { aggregation: "sum", fieldSlug: "amount", format: "currency", color: "orange" }, position: 2, size: "small" },
    { widgetType: "kpi_card", title: "יתרה בבנק", entityId: bankAcctId, config: { aggregation: "sum", fieldSlug: "current_balance", format: "currency", color: "green" }, position: 3, size: "small" },
    { widgetType: "chart_bar", title: "חובות לפי סטטוס", entityId: apId, config: { aggregation: "sum", groupByField: "_status", valueField: "balance_due" }, position: 4, size: "large" },
    { widgetType: "data_table", title: "חשבוניות ספקים אחרונות", entityId: apId, config: { columns: ["invoice_number", "supplier_name", "amount", "balance_due", "due_date", "status"], limit: 10 }, position: 5, size: "large" },
    { widgetType: "data_table", title: "חייבים אחרונים", entityId: arId, config: { columns: ["invoice_number", "customer_name", "amount", "balance_due", "due_date", "status"], limit: 10 }, position: 6, size: "large" },
  ];

  for (const w of widgets) {
    await db.insert(systemDashboardWidgetsTable).values({ dashboardId: page.id, ...w });
  }
}

async function autoMigrateFinanceData() {
  try {
    const { moduleEntitiesTable, entityRecordsTable } = await import("@workspace/db/schema");
    const { eq, sql: sqlDrizzle } = await import("drizzle-orm");

    const ENTITY_FIELD_MAP: Record<string, { table: string; fieldMap?: Record<string, string>; statusMap?: Record<string, string> }> = {
      "accounts-payable": { table: "accounts_payable" },
      "accounts-receivable": { table: "accounts_receivable" },
      "finance-expenses": { table: "expenses", fieldMap: { date: "expense_date", vendor: "vendor_name" } },
      "finance-payments": { table: "payments" },
      "finance-budgets": { table: "budgets" },
      "finance-bank-accounts": { table: "bank_accounts", fieldMap: { name: "bank_name", balance: "current_balance" } },
      "finance-projects": { table: "projects", fieldMap: { name: "project_name", client_name: "customer_name", manager: "manager_name", revenue: "actual_revenue", cost: "actual_cost" } },
      "financial-transactions": { table: "financial_transactions" },
    };

    for (const [entitySlug, config] of Object.entries(ENTITY_FIELD_MAP)) {
      const [entity] = await db.select().from(moduleEntitiesTable)
        .where(eq(moduleEntitiesTable.slug, entitySlug));
      if (!entity) continue;

      const existingRecords = await db.select({ count: sqlDrizzle<number>`count(*)::int` })
        .from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, entity.id));
      if ((existingRecords[0]?.count || 0) > 0) continue;

      let rows: any[] = [];
      try {
        const result = await db.execute(sqlDrizzle.raw(`SELECT * FROM ${config.table} ORDER BY id`));
        rows = (result.rows || []) as any[];
      } catch { continue; }

      if (rows.length === 0) continue;

      const fieldMap = config.fieldMap || {};
      let migrated = 0;
      for (const row of rows) {
        const data: Record<string, any> = { _legacy_id: row.id };
        for (const [key, value] of Object.entries(row)) {
          if (key === "id" || key === "created_at" || key === "updated_at" || key === "tenant_id") continue;
          if (value !== null && value !== undefined) {
            const mappedKey = fieldMap[key] || key;
            data[mappedKey] = value;
          }
        }
        const statusMap = config.statusMap || {};
        const rawStatus = row.status || null;
        const mappedStatus = rawStatus && statusMap[rawStatus] ? statusMap[rawStatus] : rawStatus;
        try {
          await db.insert(entityRecordsTable).values({
            entityId: entity.id,
            data,
            status: mappedStatus,
          });
          migrated++;
        } catch { }
      }
      if (migrated > 0) console.log(`[seed] Auto-migrated ${migrated} ${entitySlug} records to entity_records`);
    }
  } catch (err: any) {
    console.error("[seed] Auto-migration error:", err.message);
  }
}

async function seedFinanceReportDefinitions(apId: number, arId: number, expId: number, bankId: number, projId: number) {
  const { reportDefinitionsTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");

  async function ensureReport(values: any) {
    const existing = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.slug, values.slug));
    if (existing.length > 0) return;
    await db.insert(reportDefinitionsTable).values(values);
  }

  await ensureReport({
    name: "דוח חובות ספקים",
    slug: "finance-ap-report",
    description: "דוח מפורט של חובות לספקים",
    entityId: apId,
    columns: [
      { field: "invoice_number", label: "מס' חשבונית" },
      { field: "supplier_name", label: "שם ספק" },
      { field: "amount", label: "סכום" },
      { field: "paid_amount", label: "שולם" },
      { field: "balance_due", label: "יתרה" },
      { field: "due_date", label: "תאריך לתשלום" },
    ],
    aggregations: [
      { field: "amount", type: "sum", label: "סה\"כ חובות" },
      { field: "balance_due", type: "sum", label: "סה\"כ יתרה" },
    ],
    grouping: [],
    filters: [{ field: "status", operator: "not_equals", value: "cancelled" }],
    sorting: [{ field: "due_date", direction: "asc" }],
    displayType: "table",
    chartConfig: {},
    isActive: true,
  });

  await ensureReport({
    name: "דוח חייבים",
    slug: "finance-ar-report",
    description: "דוח מפורט של חייבים",
    entityId: arId,
    columns: [
      { field: "invoice_number", label: "מס' חשבונית" },
      { field: "customer_name", label: "שם לקוח" },
      { field: "amount", label: "סכום" },
      { field: "paid_amount", label: "שולם" },
      { field: "balance_due", label: "יתרה" },
      { field: "due_date", label: "תאריך לתשלום" },
    ],
    aggregations: [
      { field: "amount", type: "sum", label: "סה\"כ חייבים" },
      { field: "balance_due", type: "sum", label: "סה\"כ יתרה" },
    ],
    grouping: [],
    filters: [{ field: "status", operator: "not_equals", value: "cancelled" }],
    sorting: [{ field: "due_date", direction: "asc" }],
    displayType: "table",
    chartConfig: {},
    isActive: true,
  });

  await ensureReport({
    name: "דוח הוצאות",
    slug: "finance-expenses-report",
    description: "דוח הוצאות לפי קטגוריות",
    entityId: expId,
    columns: [
      { field: "expense_date", label: "תאריך" },
      { field: "category", label: "קטגוריה" },
      { field: "vendor_name", label: "ספק" },
      { field: "amount", label: "סכום" },
      { field: "payment_method", label: "אמצעי תשלום" },
    ],
    aggregations: [
      { field: "amount", type: "sum", label: "סה\"כ הוצאות" },
    ],
    grouping: [{ field: "category" }],
    filters: [{ field: "status", operator: "not_equals", value: "cancelled" }],
    sorting: [{ field: "expense_date", direction: "desc" }],
    displayType: "table",
    chartConfig: {},
    isActive: true,
  });

  await ensureReport({
    name: "דוח חשבונות בנק",
    slug: "finance-bank-accounts",
    description: "דוח יתרות ופרטי חשבונות בנק",
    entityId: bankId,
    columns: [
      { field: "bank_name", label: "שם בנק" },
      { field: "account_number", label: "מספר חשבון" },
      { field: "account_type", label: "סוג חשבון" },
      { field: "current_balance", label: "יתרה נוכחית" },
      { field: "available_balance", label: "יתרה זמינה" },
    ],
    aggregations: [
      { field: "current_balance", type: "sum", label: "סה\"כ יתרות" },
    ],
    grouping: [],
    filters: [],
    sorting: [{ field: "bank_name", direction: "asc" }],
    displayType: "table",
    chartConfig: {},
    isActive: true,
  });

  await ensureReport({
    name: "דוח פרויקטים כספיים",
    slug: "finance-projects",
    description: "ניתוח רווחיות פרויקטים",
    entityId: projId,
    columns: [
      { field: "project_name", label: "שם פרויקט" },
      { field: "customer_name", label: "לקוח" },
      { field: "actual_revenue", label: "הכנסות בפועל" },
      { field: "actual_cost", label: "עלויות בפועל" },
    ],
    aggregations: [
      { field: "actual_revenue", type: "sum", label: "סה\"כ הכנסות" },
      { field: "actual_cost", type: "sum", label: "סה\"כ עלויות" },
    ],
    grouping: [],
    filters: [{ field: "status", operator: "not_equals", value: "cancelled" }],
    sorting: [{ field: "project_name", direction: "asc" }],
    displayType: "table",
    chartConfig: {},
    isActive: true,
  });
}

async function seedEmptyEntities() {
  console.log("[seed] Seeding fields for 11 empty entities...");

  const expenseId = await getEntityIdBySlug("expense");
  if (expenseId) {
    await ensureFields(expenseId, [
      { name: "תאריך הוצאה", slug: "expense_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isFilterable: true },
      { name: "קטגוריה", slug: "category", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isFilterable: true, options: [
        { label: "מימון משכנתא", value: "מימון משכנתא" }, { label: "דלק", value: "דלק" }, { label: "חשמל ומים", value: "חשמל ומים" },
        { label: "שכירות", value: "שכירות" }, { label: "ביטוח", value: "ביטוח" }, { label: "תחזוקה", value: "תחזוקה" },
        { label: "חומרי גלם", value: "חומרי גלם" }, { label: "שכר עבודה", value: "שכר עבודה" }, { label: "הובלה", value: "הובלה" },
        { label: "שיווק", value: "שיווק" }, { label: "ציוד", value: "ציוד" }, { label: "מיסים", value: "מיסים" }, { label: "אחר", value: "אחר" },
      ]},
      { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 3, isRequired: true, groupName: "פרטי הוצאה", showInList: true, isSearchable: true },
      { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
      { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: false },
      { name: "אמצעי תשלום", slug: "payment_method", fieldType: "select", sortOrder: 6, groupName: "תשלום", showInList: true, defaultValue: "bank_transfer", options: [
        { label: "העברה בנקאית", value: "bank_transfer" }, { label: "סליקת אשראי חיצונית", value: "credit_card_external" },
        { label: "מזומן", value: "cash" }, { label: "שיק", value: "check" }, { label: "כרטיס אשראי", value: "credit_card" },
      ]},
      { name: "שם ספק", slug: "vendor_name", fieldType: "text", sortOrder: 7, groupName: "ספק", showInList: true, isSearchable: true },
      { name: "מספר קבלה", slug: "receipt_number", fieldType: "text", sortOrder: 8, groupName: "ספק", showInList: false },
      { name: "מחלקה", slug: "department", fieldType: "text", sortOrder: 9, groupName: "סיווג", showInList: false, isFilterable: true },
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "פרטים", showInList: false },
      { name: "קובץ מצורף", slug: "file_url", fieldType: "text", sortOrder: 11, groupName: "קבצים", showInList: false, showInForm: false },
      { name: "שם קובץ", slug: "file_name", fieldType: "text", sortOrder: 12, groupName: "קבצים", showInList: false, showInForm: false },
    ]);
  }

  const paymentId = await getEntityIdBySlug("payment");
  if (paymentId) {
    await ensureFields(paymentId, [
      { name: "תאריך תשלום", slug: "payment_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי תשלום", showInList: true, isFilterable: true },
      { name: "סוג תשלום", slug: "payment_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי תשלום", showInList: true, isFilterable: true, options: [
        { label: "תשלום יוצא", value: "outgoing" }, { label: "תשלום נכנס", value: "incoming" },
      ]},
      { name: "אמצעי תשלום", slug: "payment_method", fieldType: "select", sortOrder: 3, groupName: "פרטי תשלום", showInList: true, defaultValue: "bank_transfer", options: [
        { label: "העברה בנקאית", value: "bank_transfer" }, { label: "צ'ק", value: "check" },
        { label: "מזומן", value: "cash" }, { label: "כרטיס אשראי", value: "credit_card" }, { label: "אחר", value: "other" },
      ]},
      { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "סכומים", showInList: true },
      { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 5, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
        { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
      ]},
      { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 6, groupName: "פרטים", showInList: true, isSearchable: true },
      { name: "אסמכתא", slug: "reference_number", fieldType: "text", sortOrder: 7, groupName: "פרטים", showInList: true, isSearchable: true },
      { name: "מספר צ'ק", slug: "check_number", fieldType: "text", sortOrder: 8, groupName: "פרטים", showInList: false },
    ]);
  }

  const budgetId = await getEntityIdBySlug("budget");
  if (budgetId) {
    await ensureFields(budgetId, [
      { name: "שם התקציב", slug: "budget_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי תקציב", showInList: true, isSearchable: true },
      { name: "שנה", slug: "fiscal_year", fieldType: "number", sortOrder: 2, isRequired: true, groupName: "תקופה", showInList: true, isFilterable: true },
      { name: "חודש", slug: "fiscal_month", fieldType: "select", sortOrder: 3, groupName: "תקופה", showInList: true, options: [
        { label: "ינואר", value: "1" }, { label: "פברואר", value: "2" }, { label: "מרץ", value: "3" },
        { label: "אפריל", value: "4" }, { label: "מאי", value: "5" }, { label: "יוני", value: "6" },
        { label: "יולי", value: "7" }, { label: "אוגוסט", value: "8" }, { label: "ספטמבר", value: "9" },
        { label: "אוקטובר", value: "10" }, { label: "נובמבר", value: "11" }, { label: "דצמבר", value: "12" },
      ]},
      { name: "קטגוריה", slug: "category", fieldType: "select", sortOrder: 4, groupName: "סיווג", showInList: true, isFilterable: true, options: [
        { label: "חומרי גלם", value: "חומרי גלם" }, { label: "שכר עבודה", value: "שכר עבודה" },
        { label: "שכירות", value: "שכירות" }, { label: "חשמל ומים", value: "חשמל ומים" },
        { label: "ביטוח", value: "ביטוח" }, { label: "תחזוקה", value: "תחזוקה" },
        { label: "ציוד", value: "ציוד" }, { label: "שיווק", value: "שיווק" },
        { label: "הובלה", value: "הובלה" }, { label: "אחר", value: "אחר" },
      ]},
      { name: "מחלקה", slug: "department", fieldType: "select", sortOrder: 5, groupName: "סיווג", showInList: true, isFilterable: true, options: [
        { label: "ייצור", value: "ייצור" }, { label: "רכש", value: "רכש" }, { label: "מכירות", value: "מכירות" },
        { label: "הנהלה", value: "הנהלה" }, { label: "תחזוקה", value: "תחזוקה" }, { label: "הובלה", value: "הובלה" },
        { label: "שיווק", value: "שיווק" }, { label: "כללי", value: "כללי" },
      ]},
      { name: "סכום מתוקצב", slug: "budgeted_amount", fieldType: "number", sortOrder: 6, isRequired: true, groupName: "סכומים", showInList: true },
      { name: "סכום בפועל", slug: "actual_amount", fieldType: "number", sortOrder: 7, groupName: "סכומים", showInList: true, defaultValue: "0" },
      { name: "סטייה", slug: "variance", fieldType: "number", sortOrder: 8, groupName: "סכומים", showInList: true },
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "פרטים", showInList: false },
    ]);
  }

  const bankAccountId = await getEntityIdBySlug("bank-account");
  if (bankAccountId) {
    await ensureFields(bankAccountId, [
      { name: "שם הבנק", slug: "bank_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
      { name: "מספר סניף", slug: "branch_number", fieldType: "text", sortOrder: 2, groupName: "פרטי חשבון", showInList: true },
      { name: "מספר חשבון", slug: "account_number", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי חשבון", showInList: true, isSearchable: true },
      { name: "סוג חשבון", slug: "account_type", fieldType: "select", sortOrder: 4, groupName: "פרטי חשבון", showInList: true, isFilterable: true, defaultValue: "checking", options: [
        { label: "עו\"ש", value: "checking" }, { label: "חיסכון", value: "savings" },
        { label: "אשראי", value: "credit" }, { label: "פיקדון", value: "deposit" },
      ]},
      { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 5, groupName: "פרטי חשבון", showInList: false, defaultValue: "ILS", options: [
        { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
      ]},
      { name: "יתרה נוכחית", slug: "current_balance", fieldType: "number", sortOrder: 6, groupName: "יתרות", showInList: true },
      { name: "יתרה זמינה", slug: "available_balance", fieldType: "number", sortOrder: 7, groupName: "יתרות", showInList: true },
      { name: "מסגרת אשראי", slug: "credit_limit", fieldType: "number", sortOrder: 8, groupName: "יתרות", showInList: false },
      { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 9, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
        { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
      ]},
    ]);
  }

  const projectId = await getEntityIdBySlug("project");
  if (projectId) {
    await ensureFields(projectId, [
      { name: "מספר פרויקט", slug: "project_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
      { name: "שם פרויקט", slug: "project_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
      { name: "לקוח", slug: "customer_name", fieldType: "text", sortOrder: 3, groupName: "פרטי פרויקט", showInList: true, isSearchable: true },
      { name: "מנהל פרויקט", slug: "manager_name", fieldType: "text", sortOrder: 4, groupName: "פרטי פרויקט", showInList: false },
      { name: "מחלקה", slug: "department", fieldType: "text", sortOrder: 5, groupName: "פרטי פרויקט", showInList: false, isFilterable: true },
      { name: "תאריך התחלה", slug: "start_date", fieldType: "date", sortOrder: 6, groupName: "תאריכים", showInList: true },
      { name: "תאריך סיום", slug: "end_date", fieldType: "date", sortOrder: 7, groupName: "תאריכים", showInList: true },
      { name: "הכנסות צפויות", slug: "estimated_revenue", fieldType: "number", sortOrder: 8, groupName: "כספים", showInList: true },
      { name: "עלויות צפויות", slug: "estimated_cost", fieldType: "number", sortOrder: 9, groupName: "כספים", showInList: false },
      { name: "הכנסות בפועל", slug: "actual_revenue", fieldType: "number", sortOrder: 10, groupName: "כספים", showInList: true },
      { name: "עלויות בפועל", slug: "actual_cost", fieldType: "number", sortOrder: 11, groupName: "כספים", showInList: true },
      { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 12, groupName: "פרטים", showInList: false },
    ]);
  }

  const financialTransactionId = await getEntityIdBySlug("financial-transaction");
  if (financialTransactionId) {
    await ensureFields(financialTransactionId, [
      { name: "תאריך תנועה", slug: "transaction_date", fieldType: "date", sortOrder: 1, isRequired: true, groupName: "פרטי תנועה", showInList: true, isFilterable: true },
      { name: "סוג תנועה", slug: "transaction_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי תנועה", showInList: true, isFilterable: true, options: [
        { label: "הכנסה", value: "income" }, { label: "הוצאה", value: "expense" },
        { label: "העברה", value: "transfer" }, { label: "התאמה", value: "adjustment" }, { label: "פקודת יומן", value: "journal" },
      ]},
      { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "סכומים", showInList: true },
      { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 4, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
        { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
      ]},
      { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 5, groupName: "פרטים", showInList: true, isSearchable: true },
      { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 6, groupName: "פרטים", showInList: true, isFilterable: true },
    ]);
  }

  const salesOrderId = await getEntityIdBySlug("sales-order");
  if (salesOrderId) {
    const customerId = await getEntityIdBySlug("customer") || await getEntityIdBySlug("crm-customer");
    await ensureFields(salesOrderId, [
      { name: "מספר הזמנה", slug: "order_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי הזמנה", showInList: true, isSearchable: true },
      { name: "לקוח", slug: "customer_ref", fieldType: customerId ? "relation" : "text", sortOrder: 2, isRequired: true, groupName: "פרטי הזמנה", showInList: true,
        ...(customerId ? { relatedEntityId: customerId, relatedDisplayField: "name", relationType: "many_to_one" } : {}) },
      { name: "תאריך הזמנה", slug: "order_date", fieldType: "date", sortOrder: 3, isRequired: true, groupName: "פרטי הזמנה", showInList: true, isFilterable: true },
      { name: "תנאי תשלום", slug: "payment_terms", fieldType: "text", sortOrder: 4, groupName: "תנאים", showInList: false, placeholder: "שוטף+30" },
      { name: "סה\"כ", slug: "total_amount", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: true },
      { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 6, groupName: "סכומים", showInList: false },
      { name: "הנחה", slug: "discount_amount", fieldType: "number", sortOrder: 7, groupName: "סכומים", showInList: false },
      { name: "סטטוס משלוח", slug: "delivery_status", fieldType: "select", sortOrder: 8, groupName: "משלוח", showInList: true, isFilterable: true, options: [
        { label: "ממתין", value: "pending" }, { label: "בהכנה", value: "preparing" },
        { label: "נשלח", value: "shipped" }, { label: "נמסר", value: "delivered" }, { label: "בוטל", value: "cancelled" },
      ]},
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "פרטים", showInList: false },
    ]);
  }

  const attendanceId = await getEntityIdBySlug("attendance");
  if (attendanceId) {
    const employeeId = await getEntityIdBySlug("employee");
    await ensureFields(attendanceId, [
      { name: "עובד", slug: "employee_ref", fieldType: employeeId ? "relation" : "text", sortOrder: 1, isRequired: true, groupName: "פרטי נוכחות", showInList: true,
        ...(employeeId ? { relatedEntityId: employeeId, relatedDisplayField: "first_name", relationType: "many_to_one" } : {}) },
      { name: "תאריך", slug: "attendance_date", fieldType: "date", sortOrder: 2, isRequired: true, groupName: "פרטי נוכחות", showInList: true, isFilterable: true },
      { name: "שעת כניסה", slug: "check_in_time", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי נוכחות", showInList: true, placeholder: "08:00" },
      { name: "שעת יציאה", slug: "check_out_time", fieldType: "text", sortOrder: 4, groupName: "פרטי נוכחות", showInList: true, placeholder: "17:00" },
      { name: "סה\"כ שעות", slug: "total_hours", fieldType: "number", sortOrder: 5, groupName: "פרטי נוכחות", showInList: true },
      { name: "סוג נוכחות", slug: "attendance_type", fieldType: "select", sortOrder: 6, groupName: "פרטי נוכחות", showInList: true, isFilterable: true, defaultValue: "regular", options: [
        { label: "רגיל", value: "regular" }, { label: "שעות נוספות", value: "overtime" }, { label: "חג", value: "holiday" },
      ]},
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "פרטים", showInList: false },
    ]);
  }

  const shiftId = await getEntityIdBySlug("shift");
  if (shiftId) {
    const employeeId = await getEntityIdBySlug("employee");
    await ensureFields(shiftId, [
      { name: "שם משמרת", slug: "shift_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי משמרת", showInList: true, isSearchable: true },
      { name: "שעת התחלה", slug: "start_time", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי משמרת", showInList: true, placeholder: "07:00" },
      { name: "שעת סיום", slug: "end_time", fieldType: "text", sortOrder: 3, isRequired: true, groupName: "פרטי משמרת", showInList: true, placeholder: "15:00" },
      { name: "עובד", slug: "employee_ref", fieldType: employeeId ? "relation" : "text", sortOrder: 4, groupName: "פרטי משמרת", showInList: true,
        ...(employeeId ? { relatedEntityId: employeeId, relatedDisplayField: "first_name", relationType: "many_to_one" } : {}) },
      { name: "תאריך", slug: "shift_date", fieldType: "date", sortOrder: 5, isRequired: true, groupName: "פרטי משמרת", showInList: true, isFilterable: true },
      { name: "סוג משמרת", slug: "shift_type", fieldType: "select", sortOrder: 6, groupName: "פרטי משמרת", showInList: true, isFilterable: true, defaultValue: "morning", options: [
        { label: "בוקר", value: "morning" }, { label: "ערב", value: "evening" }, { label: "לילה", value: "night" },
      ]},
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "פרטים", showInList: false },
    ]);
  }

  const finishedProductId = await getEntityIdBySlug("finished-product");
  if (finishedProductId) {
    await ensureFields(finishedProductId, [
      { name: "מק\"ט", slug: "sku", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מוצר", showInList: true, isSearchable: true },
      { name: "שם מוצר", slug: "product_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי מוצר", showInList: true, isSearchable: true },
      { name: "קטגוריה", slug: "category", fieldType: "text", sortOrder: 3, groupName: "פרטי מוצר", showInList: true, isFilterable: true },
      { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 4, groupName: "פרטי מוצר", showInList: false },
      { name: "יחידת מידה", slug: "unit_of_measure", fieldType: "select", sortOrder: 5, groupName: "פרטי מוצר", showInList: true, defaultValue: "יחידה", options: [
        { label: "יחידה", value: "יחידה" }, { label: "קילוגרם", value: "קילוגרם" }, { label: "ליטר", value: "ליטר" },
        { label: "מטר", value: "מטר" }, { label: "מ\"ר", value: "מ\"ר" }, { label: "תיבה", value: "תיבה" },
      ]},
      { name: "מחיר מכירה", slug: "sale_price", fieldType: "number", sortOrder: 6, groupName: "כספי", showInList: true },
      { name: "מלאי נוכחי", slug: "current_stock", fieldType: "number", sortOrder: 7, groupName: "מלאי", showInList: true, defaultValue: "0" },
      { name: "מלאי מינימום", slug: "min_stock", fieldType: "number", sortOrder: 8, groupName: "מלאי", showInList: true, defaultValue: "0" },
      { name: "משקל (ק\"ג)", slug: "weight_kg", fieldType: "number", sortOrder: 9, groupName: "מידות", showInList: false },
      { name: "מידות", slug: "dimensions", fieldType: "text", sortOrder: 10, groupName: "מידות", showInList: false, placeholder: "אורך x רוחב x גובה" },
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 11, groupName: "פרטים", showInList: false },
    ]);
  }

  const warehouseId = await getEntityIdBySlug("warehouse");
  if (warehouseId) {
    await ensureFields(warehouseId, [
      { name: "שם מחסן", slug: "warehouse_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מחסן", showInList: true, isSearchable: true },
      { name: "קוד מחסן", slug: "warehouse_code", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי מחסן", showInList: true, isSearchable: true },
      { name: "כתובת", slug: "address", fieldType: "textarea", sortOrder: 3, groupName: "פרטי מחסן", showInList: false },
      { name: "סוג מחסן", slug: "warehouse_type", fieldType: "select", sortOrder: 4, groupName: "פרטי מחסן", showInList: true, isFilterable: true, defaultValue: "main", options: [
        { label: "ראשי", value: "main" }, { label: "משני", value: "secondary" }, { label: "חיצוני", value: "external" },
      ]},
      { name: "מנהל מחסן", slug: "manager_name", fieldType: "text", sortOrder: 5, groupName: "פרטי מחסן", showInList: true },
      { name: "קיבולת", slug: "capacity", fieldType: "number", sortOrder: 6, groupName: "פרטי מחסן", showInList: false },
      { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 7, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
        { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
      ]},
      { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "פרטים", showInList: false },
    ]);
  }

  console.log("[seed] Empty entities seeded successfully.");
}

async function seedAccountingNewEntities() {
  console.log("[seed] Adding 15 new accounting entities...");

  let financeModuleId = await getModuleIdBySlug("finance");
  if (!financeModuleId) {
    financeModuleId = await ensureModule({
      name: "כספים",
      slug: "finance",
      nameHe: "כספים",
      nameEn: "Finance",
      description: "ניהול כספים — חובות, חייבים, הוצאות, תשלומים, תקציבים",
      icon: "DollarSign",
      color: "#F59E0B",
      category: "כספים",
      sortOrder: 5,
    });
  }

  const taxesId = await ensureEntity(financeModuleId, {
    name: "מס",
    namePlural: "מיסים",
    slug: "accounting-tax",
    description: "ניהול שיעורי מס — מע\"מ, מס הכנסה ועוד",
    icon: "Percent",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 30,
  });

  await ensureFields(taxesId, [
    { name: "שם המס", slug: "tax_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מס", showInList: true, isSearchable: true },
    { name: "סוג מס", slug: "tax_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי מס", showInList: true, isFilterable: true, options: [
      { label: "מע\"מ", value: "vat" }, { label: "מס הכנסה", value: "income_tax" },
      { label: "ניכוי במקור", value: "withholding" }, { label: "מס שכר", value: "payroll_tax" },
      { label: "מכס", value: "customs" }, { label: "אחר", value: "other" },
    ]},
    { name: "שיעור מס (%)", slug: "tax_rate", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "פרטי מס", showInList: true, defaultValue: "18" },
    { name: "קוד מס", slug: "tax_code", fieldType: "text", sortOrder: 4, groupName: "פרטי מס", showInList: true, isSearchable: true },
    { name: "קבוצת מס", slug: "tax_group", fieldType: "text", sortOrder: 5, groupName: "פרטי מס", showInList: false },
    { name: "חשבון מס (חובה)", slug: "tax_account_debit", fieldType: "text", sortOrder: 6, groupName: "חשבונות", helpText: "מספר חשבון חיוב מס" },
    { name: "חשבון מס (זכות)", slug: "tax_account_credit", fieldType: "text", sortOrder: 7, groupName: "חשבונות", helpText: "מספר חשבון זיכוי מס" },
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 8, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  const journalsId = await ensureEntity(financeModuleId, {
    name: "יומן",
    namePlural: "יומנים",
    slug: "accounting-journal",
    description: "ניהול יומני הנהלת חשבונות",
    icon: "BookOpen",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 31,
  });

  await ensureFields(journalsId, [
    { name: "שם היומן", slug: "journal_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי יומן", showInList: true, isSearchable: true },
    { name: "קוד יומן", slug: "journal_code", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי יומן", showInList: true, isSearchable: true },
    { name: "סוג יומן", slug: "journal_type", fieldType: "select", sortOrder: 3, isRequired: true, groupName: "פרטי יומן", showInList: true, isFilterable: true, options: [
      { label: "מכירות", value: "sale" }, { label: "רכישות", value: "purchase" },
      { label: "מזומן", value: "cash" }, { label: "בנק", value: "bank" },
      { label: "כללי", value: "general" }, { label: "מצב נכסים", value: "situation" },
    ]},
    { name: "חשבון ברירת מחדל", slug: "default_account", fieldType: "text", sortOrder: 4, groupName: "פרטי יומן", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 5, groupName: "פרטי יומן", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "מספור אוטומטי", slug: "auto_numbering", fieldType: "select", sortOrder: 6, groupName: "הגדרות", defaultValue: "true", options: [
      { label: "כן", value: "true" }, { label: "לא", value: "false" },
    ]},
    { name: "תקופת נעילה", slug: "lock_date", fieldType: "date", sortOrder: 7, groupName: "הגדרות", helpText: "לא יתאפשרו רשומות לפני תאריך זה" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const currenciesId = await ensureEntity(financeModuleId, {
    name: "מטבע",
    namePlural: "מטבעות",
    slug: "accounting-currency",
    description: "ניהול מטבעות וקורס חליפין",
    icon: "Globe",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 32,
  });

  await ensureFields(currenciesId, [
    { name: "שם מטבע", slug: "currency_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מטבע", showInList: true, isSearchable: true },
    { name: "קוד מטבע", slug: "currency_code", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי מטבע", showInList: true, isSearchable: true },
    { name: "סמל", slug: "currency_symbol", fieldType: "text", sortOrder: 3, groupName: "פרטי מטבע", showInList: true },
    { name: "שער יציג", slug: "exchange_rate", fieldType: "number", sortOrder: 4, isRequired: true, groupName: "קורס חליפין", showInList: true, defaultValue: "1" },
    { name: "תאריך עדכון קורס", slug: "rate_updated_at", fieldType: "date", sortOrder: 5, groupName: "קורס חליפין", showInList: true },
    { name: "מטבע בסיס", slug: "is_base_currency", fieldType: "select", sortOrder: 6, groupName: "הגדרות", showInList: true, defaultValue: "false", options: [
      { label: "כן", value: "true" }, { label: "לא", value: "false" },
    ]},
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 7, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
  ]);

  const fiscalPositionsId = await ensureEntity(financeModuleId, {
    name: "מעמד פיסקלי",
    namePlural: "מעמדות פיסקליים",
    slug: "fiscal-position",
    description: "מיפוי מיסים לפי מדינה/לקוח — מעמד פיסקלי",
    icon: "MapPin",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 33,
  });

  await ensureFields(fiscalPositionsId, [
    { name: "שם המעמד", slug: "position_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "מדינה", slug: "country", fieldType: "text", sortOrder: 2, groupName: "פרטים", showInList: true, isFilterable: true },
    { name: "מדינת הספקה", slug: "country_state", fieldType: "text", sortOrder: 3, groupName: "פרטים", showInList: false },
    { name: "מיפוי מסים", slug: "tax_mapping", fieldType: "textarea", sortOrder: 4, groupName: "מיפוי", helpText: "מיפוי מסים — מקור: יעד" },
    { name: "מיפוי חשבונות", slug: "account_mapping", fieldType: "textarea", sortOrder: 5, groupName: "מיפוי", helpText: "מיפוי חשבונות — מקור: יעד" },
    { name: "זיהוי אוטומטי", slug: "auto_apply", fieldType: "select", sortOrder: 6, groupName: "הגדרות", defaultValue: "false", options: [
      { label: "כן", value: "true" }, { label: "לא", value: "false" },
    ]},
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 7, groupName: "כללי" },
  ]);

  const journalGroupsId = await ensureEntity(financeModuleId, {
    name: "קבוצת יומנים",
    namePlural: "קבוצות יומנים",
    slug: "journal-group",
    description: "קיבוץ יומנים לקבוצות להצגה ממוקדת",
    icon: "Layers",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 34,
  });

  await ensureFields(journalGroupsId, [
    { name: "שם הקבוצה", slug: "group_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי קבוצה", showInList: true, isSearchable: true },
    { name: "יומנים", slug: "journal_codes", fieldType: "textarea", sortOrder: 2, groupName: "פרטי קבוצה", helpText: "קודי יומנים מופרדים בפסיקים" },
    { name: "סדר הצגה", slug: "sort_order", fieldType: "number", sortOrder: 3, groupName: "פרטי קבוצה", showInList: true, defaultValue: "0" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 4, groupName: "כללי" },
  ]);

  const checksId = await ensureEntity(financeModuleId, {
    name: "שיק",
    namePlural: "שיקים",
    slug: "accounting-check",
    description: "ניהול שיקים — שיקים נכנסים ויוצאים",
    icon: "FileText",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 35,
  });

  await ensureFields(checksId, [
    { name: "מספר שיק", slug: "check_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי שיק", showInList: true, isSearchable: true },
    { name: "סוג שיק", slug: "check_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי שיק", showInList: true, isFilterable: true, options: [
      { label: "שיק נכנס", value: "incoming" }, { label: "שיק יוצא", value: "outgoing" },
    ]},
    { name: "שם בנק", slug: "bank_name", fieldType: "text", sortOrder: 3, groupName: "פרטי שיק", showInList: true },
    { name: "מספר חשבון", slug: "bank_account_number", fieldType: "text", sortOrder: 4, groupName: "פרטי שיק", showInList: false },
    { name: "תאריך שיק", slug: "check_date", fieldType: "date", sortOrder: 5, isRequired: true, groupName: "תאריכים", showInList: true, isFilterable: true },
    { name: "תאריך פירעון", slug: "due_date", fieldType: "date", sortOrder: 6, groupName: "תאריכים", showInList: true },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 7, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 8, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "שם נמען/מוציא", slug: "payee_name", fieldType: "text", sortOrder: 9, groupName: "צדדים", showInList: true, isSearchable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 10, groupName: "כללי" },
  ]);

  await ensureStatuses(checksId, [
    { name: "פתוח", slug: "open", color: "#3B82F6", sortOrder: 0, isDefault: true },
    { name: "הופקד", slug: "deposited", color: "#8B5CF6", sortOrder: 1 },
    { name: "כובד", slug: "cleared", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "חזר", slug: "bounced", color: "#EF4444", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 4, isFinal: true },
  ]);

  const depreciationModelsId = await ensureEntity(financeModuleId, {
    name: "מודל פחת",
    namePlural: "מודלי פחת",
    slug: "depreciation-model",
    description: "מודלי פחת לרכוש קבוע — שיטת חישוב ותקופות",
    icon: "TrendingDown",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 36,
  });

  await ensureFields(depreciationModelsId, [
    { name: "שם המודל", slug: "model_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי מודל", showInList: true, isSearchable: true },
    { name: "שיטת פחת", slug: "depreciation_method", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי מודל", showInList: true, isFilterable: true, options: [
      { label: "קו ישר", value: "straight_line" }, { label: "יתרה פוחתת", value: "declining_balance" },
      { label: "יחידות ייצור", value: "units_of_production" }, { label: "סכום ספרות שנים", value: "sum_of_years" },
    ]},
    { name: "אחוז פחת שנתי (%)", slug: "annual_depreciation_rate", fieldType: "number", sortOrder: 3, groupName: "פרטי מודל", showInList: true },
    { name: "אורך חיים (שנים)", slug: "useful_life_years", fieldType: "number", sortOrder: 4, groupName: "פרטי מודל", showInList: true },
    { name: "ערך שייר", slug: "salvage_value", fieldType: "number", sortOrder: 5, groupName: "חשבונות", showInList: false },
    { name: "חשבון פחת", slug: "depreciation_account", fieldType: "text", sortOrder: 6, groupName: "חשבונות" },
    { name: "חשבון הוצאות פחת", slug: "expense_account", fieldType: "text", sortOrder: 7, groupName: "חשבונות" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const billingId = await ensureEntity(financeModuleId, {
    name: "חיוב",
    namePlural: "חיובים",
    slug: "accounting-billing",
    description: "ניהול חיובים ולקוחות לחיוב",
    icon: "Receipt",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: true,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 37,
  });

  await ensureFields(billingId, [
    { name: "מספר חיוב", slug: "billing_number", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי חיוב", showInList: true, isSearchable: true },
    { name: "לקוח", slug: "customer_name", fieldType: "text", sortOrder: 2, isRequired: true, groupName: "פרטי חיוב", showInList: true, isSearchable: true },
    { name: "תאריך חיוב", slug: "billing_date", fieldType: "date", sortOrder: 3, isRequired: true, groupName: "תאריכים", showInList: true, isFilterable: true },
    { name: "תאריך לתשלום", slug: "due_date", fieldType: "date", sortOrder: 4, groupName: "תאריכים", showInList: true },
    { name: "סכום לפני מע\"מ", slug: "amount_before_tax", fieldType: "number", sortOrder: 5, groupName: "סכומים", showInList: true },
    { name: "מע\"מ", slug: "vat_amount", fieldType: "number", sortOrder: 6, groupName: "סכומים", showInList: false },
    { name: "סכום כולל", slug: "total_amount", fieldType: "number", sortOrder: 7, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "תיאור שירות", slug: "service_description", fieldType: "textarea", sortOrder: 8, groupName: "פרטים", showInList: false, isSearchable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(billingId, [
    { name: "טיוטה", slug: "draft", color: "#6B7280", sortOrder: 0, isDefault: true },
    { name: "נשלח", slug: "sent", color: "#3B82F6", sortOrder: 1 },
    { name: "שולם", slug: "paid", color: "#22C55E", sortOrder: 2, isFinal: true },
    { name: "באיחור", slug: "overdue", color: "#EF4444", sortOrder: 3 },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 4, isFinal: true },
  ]);

  const paymentTermsId = await ensureEntity(financeModuleId, {
    name: "תנאי תשלום",
    namePlural: "תנאי תשלום",
    slug: "payment-terms",
    description: "ניהול תנאי תשלום — מזומן, שוטף + X ימים",
    icon: "Calendar",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 38,
  });

  await ensureFields(paymentTermsId, [
    { name: "שם תנאי תשלום", slug: "terms_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי תנאי", showInList: true, isSearchable: true },
    { name: "ימי תשלום", slug: "payment_days", fieldType: "number", sortOrder: 2, groupName: "פרטי תנאי", showInList: true, defaultValue: "30", helpText: "מספר ימים לתשלום מיום החשבונית" },
    { name: "סוג תנאי", slug: "term_type", fieldType: "select", sortOrder: 3, groupName: "פרטי תנאי", showInList: true, isFilterable: true, defaultValue: "net", options: [
      { label: "נטו (N ימים)", value: "net" }, { label: "שוטף + N", value: "eom_plus" },
      { label: "מזומן", value: "cash" }, { label: "מראש", value: "prepaid" }, { label: "לאחר קבלת סחורה", value: "cod" },
    ]},
    { name: "הנחת תשלום מוקדם (%)", slug: "early_payment_discount", fieldType: "number", sortOrder: 4, groupName: "הנחות", defaultValue: "0" },
    { name: "ימי הנחה מוקדם", slug: "discount_days", fieldType: "number", sortOrder: 5, groupName: "הנחות", defaultValue: "0" },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 6, groupName: "כללי" },
  ]);

  const analyticLevelsId = await ensureEntity(financeModuleId, {
    name: "רמת מעקב אנליטי",
    namePlural: "רמות מעקב",
    slug: "analytic-tracking-level",
    description: "רמות מעקב אנליטי — מרכזי עלות, מחלקות, פרויקטים",
    icon: "BarChart3",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 39,
  });

  await ensureFields(analyticLevelsId, [
    { name: "שם הרמה", slug: "level_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי רמה", showInList: true, isSearchable: true },
    { name: "קוד", slug: "level_code", fieldType: "text", sortOrder: 2, groupName: "פרטי רמה", showInList: true, isSearchable: true },
    { name: "סוג", slug: "level_type", fieldType: "select", sortOrder: 3, groupName: "פרטי רמה", showInList: true, isFilterable: true, options: [
      { label: "מרכז עלות", value: "cost_center" }, { label: "מחלקה", value: "department" },
      { label: "פרויקט", value: "project" }, { label: "מוצר", value: "product" }, { label: "אחר", value: "other" },
    ]},
    { name: "רמת אב", slug: "parent_level", fieldType: "text", sortOrder: 4, groupName: "היררכיה", showInList: false },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 5, groupName: "כללי" },
  ]);

  const productCategoriesId = await ensureEntity(financeModuleId, {
    name: "קטגורית מוצר (הנה\"ח)",
    namePlural: "קטגוריות מוצרים",
    slug: "accounting-product-category",
    description: "קטגוריות מוצרים לצורכי הנהלת חשבונות",
    icon: "FolderTree",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 40,
  });

  await ensureFields(productCategoriesId, [
    { name: "שם קטגוריה", slug: "category_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי קטגוריה", showInList: true, isSearchable: true },
    { name: "קטגורית אב", slug: "parent_category", fieldType: "text", sortOrder: 2, groupName: "היררכיה", showInList: false },
    { name: "חשבון הכנסות", slug: "income_account", fieldType: "text", sortOrder: 3, groupName: "חשבונות", showInList: true },
    { name: "חשבון הוצאות", slug: "expense_account", fieldType: "text", sortOrder: 4, groupName: "חשבונות", showInList: true },
    { name: "חשבון מלאי", slug: "inventory_account", fieldType: "text", sortOrder: 5, groupName: "חשבונות", showInList: false },
    { name: "מס קנייה", slug: "purchase_tax", fieldType: "text", sortOrder: 6, groupName: "מסים", showInList: false },
    { name: "מס מכירה", slug: "sale_tax", fieldType: "text", sortOrder: 7, groupName: "מסים", showInList: false },
    { name: "תיאור", slug: "description", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const onlinePaymentsId = await ensureEntity(financeModuleId, {
    name: "תשלום מקוון",
    namePlural: "תשלומים מקוונים",
    slug: "online-payment",
    description: "ניהול תשלומים מקוונים — עסקאות אשראי ופינטק",
    icon: "CreditCard",
    entityType: "transaction",
    hasStatus: true,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 41,
  });

  await ensureFields(onlinePaymentsId, [
    { name: "מזהה עסקה", slug: "transaction_id", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי עסקה", showInList: true, isSearchable: true },
    { name: "ספק תשלום", slug: "provider_name", fieldType: "text", sortOrder: 2, groupName: "פרטי עסקה", showInList: true, isFilterable: true },
    { name: "סכום", slug: "amount", fieldType: "number", sortOrder: 3, isRequired: true, groupName: "סכומים", showInList: true },
    { name: "מטבע", slug: "currency", fieldType: "select", sortOrder: 4, groupName: "סכומים", showInList: false, defaultValue: "ILS", options: [
      { label: "₪ שקל", value: "ILS" }, { label: "$ דולר", value: "USD" }, { label: "€ יורו", value: "EUR" },
    ]},
    { name: "תאריך עסקה", slug: "payment_date", fieldType: "date", sortOrder: 5, isRequired: true, groupName: "תאריכים", showInList: true, isFilterable: true },
    { name: "סוג כרטיס", slug: "card_type", fieldType: "select", sortOrder: 6, groupName: "אמצעי תשלום", showInList: true, isFilterable: true, options: [
      { label: "ויזה", value: "visa" }, { label: "מאסטרקארד", value: "mastercard" },
      { label: "אמריקן אקספרס", value: "amex" }, { label: "ביט", value: "bit" },
      { label: "פייפאל", value: "paypal" }, { label: "אחר", value: "other" },
    ]},
    { name: "4 ספרות אחרונות", slug: "card_last_4", fieldType: "text", sortOrder: 7, groupName: "אמצעי תשלום", showInList: false },
    { name: "לקוח/משלם", slug: "payer_name", fieldType: "text", sortOrder: 8, groupName: "פרטי עסקה", showInList: true, isSearchable: true },
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 9, groupName: "כללי" },
  ]);

  await ensureStatuses(onlinePaymentsId, [
    { name: "ממתין", slug: "pending", color: "#F59E0B", sortOrder: 0, isDefault: true },
    { name: "הצליח", slug: "succeeded", color: "#22C55E", sortOrder: 1, isFinal: true },
    { name: "נכשל", slug: "failed", color: "#EF4444", sortOrder: 2, isFinal: true },
    { name: "הוחזר", slug: "refunded", color: "#8B5CF6", sortOrder: 3, isFinal: true },
    { name: "בוטל", slug: "cancelled", color: "#9CA3AF", sortOrder: 4, isFinal: true },
  ]);

  const paymentProvidersId = await ensureEntity(financeModuleId, {
    name: "ספק תשלום מקוון",
    namePlural: "ספקי תשלום מקוון",
    slug: "online-payment-provider",
    description: "ניהול ספקי שירותי תשלום — חיבורים ומפתחות API",
    icon: "Plug",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: true,
    hasAudit: true,
    sortOrder: 42,
  });

  await ensureFields(paymentProvidersId, [
    { name: "שם ספק", slug: "provider_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטי ספק", showInList: true, isSearchable: true },
    { name: "סוג ספק", slug: "provider_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטי ספק", showInList: true, isFilterable: true, options: [
      { label: "שב\"א / ישראל", value: "shva" }, { label: "Payplus", value: "payplus" },
      { label: "Tranzila", value: "tranzila" }, { label: "PayPal", value: "paypal" },
      { label: "Stripe", value: "stripe" }, { label: "אחר", value: "other" },
    ]},
    { name: "מזהה מסחר", slug: "merchant_id", fieldType: "text", sortOrder: 3, groupName: "הגדרות API", showInList: false },
    { name: "כתובת Webhook", slug: "webhook_url", fieldType: "text", sortOrder: 4, groupName: "הגדרות API", showInList: false },
    { name: "מצב", slug: "environment", fieldType: "select", sortOrder: 5, groupName: "הגדרות API", showInList: true, defaultValue: "production", options: [
      { label: "ייצור", value: "production" }, { label: "בדיקות", value: "sandbox" },
    ]},
    { name: "מטבעות נתמכים", slug: "supported_currencies", fieldType: "text", sortOrder: 6, groupName: "פרטי ספק", showInList: false, helpText: "מופרדים בפסיקים: ILS,USD,EUR" },
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 7, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
    { name: "הערות", slug: "notes", fieldType: "textarea", sortOrder: 8, groupName: "כללי" },
  ]);

  const paymentMethodsId = await ensureEntity(financeModuleId, {
    name: "אמצעי תשלום",
    namePlural: "אמצעי תשלום",
    slug: "payment-method",
    description: "ניהול אמצעי תשלום — כרטיסי אשראי, העברות בנקאיות, שיקים",
    icon: "Banknote",
    entityType: "master",
    hasStatus: false,
    hasAttachments: false,
    hasNotes: false,
    hasAudit: true,
    sortOrder: 43,
  });

  await ensureFields(paymentMethodsId, [
    { name: "שם אמצעי תשלום", slug: "method_name", fieldType: "text", sortOrder: 1, isRequired: true, groupName: "פרטים", showInList: true, isSearchable: true },
    { name: "סוג", slug: "method_type", fieldType: "select", sortOrder: 2, isRequired: true, groupName: "פרטים", showInList: true, isFilterable: true, options: [
      { label: "כרטיס אשראי", value: "credit_card" }, { label: "העברה בנקאית", value: "bank_transfer" },
      { label: "שיק", value: "check" }, { label: "מזומן", value: "cash" },
      { label: "ביט", value: "bit" }, { label: "פייפאל", value: "paypal" }, { label: "אחר", value: "other" },
    ]},
    { name: "ספק תשלום", slug: "provider_name", fieldType: "text", sortOrder: 3, groupName: "פרטים", showInList: true },
    { name: "חשבון בנק מקושר", slug: "linked_bank_account", fieldType: "text", sortOrder: 4, groupName: "פרטים", showInList: false },
    { name: "עמלה (%)", slug: "fee_percent", fieldType: "number", sortOrder: 5, groupName: "עמלות", showInList: false, defaultValue: "0" },
    { name: "עמלה קבועה", slug: "fee_fixed", fieldType: "number", sortOrder: 6, groupName: "עמלות", showInList: false, defaultValue: "0" },
    { name: "פעיל", slug: "is_active", fieldType: "select", sortOrder: 7, groupName: "סטטוס", showInList: true, defaultValue: "true", options: [
      { label: "פעיל", value: "true" }, { label: "לא פעיל", value: "false" },
    ]},
  ]);

  console.log("[seed] 15 new accounting entities created successfully.");
}
