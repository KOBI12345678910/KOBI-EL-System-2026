import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityStatusesTable,
  entityRecordsTable,
  entityCategoriesTable,
  entityRelationsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  detailDefinitionsTable,
  suppliersTable,
  supplierContactsTable,
  supplierDocumentsTable,
  supplierNotesTable,
  supplierPerformanceTable,
  autoNumberCountersTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

interface FieldDef {
  name: string;
  slug: string;
  fieldKey: string;
  fieldType: string;
  isRequired?: boolean;
  isUnique?: boolean;
  isReadOnly?: boolean;
  isCalculated?: boolean;
  isSearchable?: boolean;
  showInList?: boolean;
  showInForm?: boolean;
  showInDetail?: boolean;
  sortOrder: number;
  settings?: Record<string, unknown>;
  options?: string[];
  fieldWidth?: string;
  formulaExpression?: string;
}

const SUPPLIER_FIELDS: FieldDef[] = [
  { name: "מספר ספק", slug: "supplier_number", fieldKey: "supplier_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "SUP-", padding: 4, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "שם ספק", slug: "supplier_name", fieldKey: "supplier_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "איש קשר", slug: "contact_person", fieldKey: "contact_person", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "טלפון", slug: "phone", fieldKey: "phone", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "נייד", slug: "mobile", fieldKey: "mobile", fieldType: "phone", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "אימייל", slug: "email", fieldKey: "email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "כתובת", slug: "address", fieldKey: "address", fieldType: "address", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "עיר", slug: "city", fieldKey: "city", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "קטגוריה", slug: "category", fieldKey: "category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["ברזל", "אלומיניום", "זכוכית", "נירוסטה", "פרזול", "צבע", "אביזרים", "לוגיסטיקה", "עבודות חוץ", "כללי"], sortOrder: 8 },
  { name: "סוג אספקה", slug: "supply_type", fieldKey: "supply_type", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "תנאי תשלום", slug: "payment_terms", fieldKey: "payment_terms", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["מזומן", "שוטף 30", "שוטף 60", "שוטף +30", "העברה בנקאית", "צ'ק"], sortOrder: 10 },
  { name: "זמן אספקה (ימים)", slug: "lead_time_days", fieldKey: "lead_time_days", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "מספר עוסק / ח.פ", slug: "vat_number", fieldKey: "vat_number", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 12 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 13 },
  { name: "תחום פעילות", slug: "activity_field", fieldKey: "activity_field", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 14 },
  { name: "סוגי חומרים", slug: "material_types", fieldKey: "material_types", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 15 },
  { name: "אזור גיאוגרפי", slug: "geographic_area", fieldKey: "geographic_area", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 16 },
  { name: "מטבע", slug: "currency", fieldKey: "currency", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["ILS", "USD", "EUR"], sortOrder: 17 },
  { name: "ימי אשראי", slug: "credit_days", fieldKey: "credit_days", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 18 },
  { name: "הזמנה מינימלית", slug: "minimum_order", fieldKey: "minimum_order", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 19 },
  { name: "זמן אספקה דחוף (ימים)", slug: "urgent_lead_time_days", fieldKey: "urgent_lead_time_days", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 20 },
];

const CONTACT_FIELDS: FieldDef[] = [
  { name: "שם איש קשר", slug: "contact_name", fieldKey: "contact_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תפקיד", slug: "role", fieldKey: "role", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "טלפון", slug: "phone", fieldKey: "phone", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "נייד", slug: "mobile", fieldKey: "mobile", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "אימייל", slug: "email", fieldKey: "email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5 },
];

const DOCUMENT_FIELDS: FieldDef[] = [
  { name: "שם מסמך", slug: "document_name", fieldKey: "document_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג מסמך", slug: "document_type", fieldKey: "document_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["כללי", "חוזה", "הצעת מחיר", "חשבונית", "אישור", "תעודה"], sortOrder: 1 },
  { name: "קישור לקובץ", slug: "file_url", fieldKey: "file_url", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תאריך תפוגה", slug: "expiry_date", fieldKey: "expiry_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
];

const NOTE_FIELDS: FieldDef[] = [
  { name: "תוכן הערה", slug: "note_text", fieldKey: "note_text", fieldType: "long_text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "כותב", slug: "author", fieldKey: "author", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
];

const PERFORMANCE_FIELDS: FieldDef[] = [
  { name: "דירוג איכות", slug: "quality_rating", fieldKey: "quality_rating", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 0, settings: { min: 1, max: 5 } },
  { name: "דירוג זמינות", slug: "availability_rating", fieldKey: "availability_rating", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1, settings: { min: 1, max: 5 } },
  { name: "דירוג מחיר", slug: "price_rating", fieldKey: "price_rating", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2, settings: { min: 1, max: 5 } },
  { name: "דירוג שירות", slug: "service_rating", fieldKey: "service_rating", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3, settings: { min: 1, max: 5 } },
  { name: "דירוג אמינות", slug: "reliability_rating", fieldKey: "reliability_rating", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4, settings: { min: 1, max: 5 } },
  { name: "אחוז איחורים", slug: "delay_percentage", fieldKey: "delay_percentage", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "הערות ביצוע", slug: "performance_notes", fieldKey: "performance_notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תאריך הערכה", slug: "evaluation_date", fieldKey: "evaluation_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "מעריך", slug: "evaluated_by", fieldKey: "evaluated_by", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "ציון ממוצע", slug: "avg_score", fieldKey: "avg_score", fieldType: "formula", isCalculated: true, formulaExpression: "(quality_rating + availability_rating + price_rating + service_rating + reliability_rating) / 5", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
];

const SUPPLIER_CATEGORIES = [
  { name: "ברזל", slug: "iron", color: "gray", sortOrder: 0 },
  { name: "אלומיניום", slug: "aluminum", color: "blue", sortOrder: 1 },
  { name: "זכוכית", slug: "glass", color: "cyan", sortOrder: 2 },
  { name: "נירוסטה", slug: "stainless", color: "zinc", sortOrder: 3 },
  { name: "פרזול", slug: "hardware", color: "orange", sortOrder: 4 },
  { name: "צבע", slug: "paint", color: "purple", sortOrder: 5 },
  { name: "אביזרים", slug: "accessories", color: "teal", sortOrder: 6 },
  { name: "לוגיסטיקה", slug: "logistics", color: "indigo", sortOrder: 7 },
  { name: "עבודות חוץ", slug: "outsourcing", color: "rose", sortOrder: 8 },
  { name: "כללי", slug: "general", color: "slate", sortOrder: 9 },
];

interface ChildEntityDef {
  name: string;
  nameHe: string;
  nameEn: string;
  namePlural: string;
  slug: string;
  entityKey: string;
  tableName: string;
  description: string;
  icon: string;
  primaryDisplayField: string;
  sortOrder: number;
  fields: FieldDef[];
  relationLabel: string;
  reverseLabel: string;
}

const CHILD_ENTITIES: ChildEntityDef[] = [
  {
    name: "איש קשר ספק", nameHe: "איש קשר ספק", nameEn: "Supplier Contact",
    namePlural: "אנשי קשר", slug: "supplier_contact", entityKey: "supplier_contact",
    tableName: "platform_supplier_contacts", description: "אנשי קשר של ספקים",
    icon: "Users", primaryDisplayField: "contact_name", sortOrder: 1,
    fields: CONTACT_FIELDS, relationLabel: "אנשי קשר", reverseLabel: "ספק",
  },
  {
    name: "מסמך ספק", nameHe: "מסמך ספק", nameEn: "Supplier Document",
    namePlural: "מסמכים", slug: "supplier_document", entityKey: "supplier_document",
    tableName: "platform_supplier_documents", description: "מסמכים של ספקים",
    icon: "FileText", primaryDisplayField: "document_name", sortOrder: 2,
    fields: DOCUMENT_FIELDS, relationLabel: "מסמכים", reverseLabel: "ספק",
  },
  {
    name: "הערת ספק", nameHe: "הערת ספק", nameEn: "Supplier Note",
    namePlural: "הערות", slug: "supplier_note", entityKey: "supplier_note",
    tableName: "platform_supplier_notes", description: "הערות ספקים",
    icon: "MessageSquare", primaryDisplayField: "note_text", sortOrder: 3,
    fields: NOTE_FIELDS, relationLabel: "הערות", reverseLabel: "ספק",
  },
  {
    name: "הערכת ביצוע", nameHe: "הערכת ביצוע", nameEn: "Performance Evaluation",
    namePlural: "הערכות ביצוע", slug: "supplier_performance", entityKey: "supplier_performance",
    tableName: "platform_supplier_performance", description: "הערכות ביצוע ספקים",
    icon: "BarChart3", primaryDisplayField: "evaluated_by", sortOrder: 4,
    fields: PERFORMANCE_FIELDS, relationLabel: "הערכות ביצוע", reverseLabel: "ספק",
  },
];

async function ensureChildEntity(
  def: ChildEntityDef,
  moduleId: number,
  parentEntityId: number,
): Promise<{ entity: typeof moduleEntitiesTable.$inferSelect }> {
  let [entity] = await db.select().from(moduleEntitiesTable)
    .where(and(eq(moduleEntitiesTable.slug, def.slug), eq(moduleEntitiesTable.moduleId, moduleId)));

  if (!entity) {
    [entity] = await db.insert(moduleEntitiesTable).values({
      moduleId,
      name: def.name,
      nameHe: def.nameHe,
      nameEn: def.nameEn,
      namePlural: def.namePlural,
      slug: def.slug,
      entityKey: def.entityKey,
      tableName: def.tableName,
      description: def.description,
      icon: def.icon,
      entityType: "child",
      primaryDisplayField: def.primaryDisplayField,
      parentEntityId,
      hasStatus: false,
      hasAudit: true,
      sortOrder: def.sortOrder,
    }).returning();
  }

  const existingFields = await db.select().from(entityFieldsTable)
    .where(eq(entityFieldsTable.entityId, entity.id));

  if (existingFields.length === 0) {
    for (const fieldDef of def.fields) {
      try {
        await db.insert(entityFieldsTable).values({
          entityId: entity.id,
          ...fieldDef,
          isSearchable: true,
          isSortable: true,
          isFilterable: fieldDef.showInList ?? false,
          showInList: fieldDef.showInList ?? false,
          showInForm: fieldDef.showInForm ?? true,
          showInDetail: fieldDef.showInDetail ?? true,
          fieldWidth: "half",
        });
      } catch (fieldErr) {
        console.warn(`[Migration] Failed to insert child field ${def.slug}.${fieldDef.slug}:`, fieldErr);
      }
    }
  }

  const existingRelations = await db.select().from(entityRelationsTable)
    .where(and(
      eq(entityRelationsTable.sourceEntityId, parentEntityId),
      eq(entityRelationsTable.targetEntityId, entity.id),
    ));

  if (existingRelations.length === 0) {
    try {
      await db.insert(entityRelationsTable).values({
        sourceEntityId: parentEntityId,
        targetEntityId: entity.id,
        relationType: "one_to_many",
        targetFieldSlug: "_parent_id",
        label: def.relationLabel,
        reverseLabel: def.reverseLabel,
        cascadeDelete: true,
        sortOrder: def.sortOrder,
      });
    } catch (relErr) {
      console.warn(`[Migration] Failed to insert relation for ${def.slug}:`, relErr);
    }
  }

  return { entity };
}

router.post("/platform/migrate/suppliers", async (req, res) => {
  try {
    let [procurementModule] = await db.select().from(platformModulesTable)
      .where(eq(platformModulesTable.slug, "procurement"));

    if (!procurementModule) {
      [procurementModule] = await db.insert(platformModulesTable).values({
        name: "רכש",
        nameHe: "רכש",
        nameEn: "Procurement",
        slug: "procurement",
        moduleKey: "procurement",
        description: "מודול רכש — ניהול ספקים, הזמנות, מסמכים וביצועים",
        icon: "Truck",
        color: "blue",
        category: "procurement",
        showInSidebar: true,
        showInDashboard: true,
      }).returning();
    }

    let [supplierEntity] = await db.select().from(moduleEntitiesTable)
      .where(and(
        eq(moduleEntitiesTable.slug, "supplier"),
        eq(moduleEntitiesTable.moduleId, procurementModule.id),
      ));

    if (!supplierEntity) {
      [supplierEntity] = await db.insert(moduleEntitiesTable).values({
        moduleId: procurementModule.id,
        name: "ספק",
        nameHe: "ספק",
        nameEn: "Supplier",
        namePlural: "ספקים",
        slug: "supplier",
        entityKey: "supplier",
        tableName: "platform_suppliers",
        description: "ישות ספק מנוהלת דרך הפלטפורמה",
        icon: "Truck",
        entityType: "master",
        primaryDisplayField: "supplier_name",
        hasStatus: true,
        hasCategories: true,
        hasAttachments: true,
        hasNotes: true,
        hasNumbering: true,
        hasAudit: true,
      }).returning();
    }

    const existingFields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, supplierEntity.id));

    if (existingFields.length === 0) {
      for (const fieldDef of SUPPLIER_FIELDS) {
        try {
          await db.insert(entityFieldsTable).values({
            entityId: supplierEntity.id,
            ...fieldDef,
            isSearchable: fieldDef.isSearchable ?? true,
            isSortable: true,
            isFilterable: fieldDef.showInList ?? false,
            showInList: fieldDef.showInList ?? false,
            showInForm: fieldDef.showInForm ?? true,
            showInDetail: fieldDef.showInDetail ?? true,
            fieldWidth: fieldDef.fieldWidth || "half",
          });
        } catch (fieldErr) {
          console.warn(`[Migration] Failed to insert field ${fieldDef.slug}:`, fieldErr);
        }
      }
    }

    const existingStatuses = await db.select().from(entityStatusesTable)
      .where(eq(entityStatusesTable.entityId, supplierEntity.id));

    if (existingStatuses.length === 0) {
      try {
        await db.insert(entityStatusesTable).values([
          { entityId: supplierEntity.id, name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
          { entityId: supplierEntity.id, name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 1 },
          { entityId: supplierEntity.id, name: "מושהה", slug: "suspended", color: "red", sortOrder: 2 },
          { entityId: supplierEntity.id, name: "בבדיקה", slug: "review", color: "blue", sortOrder: 3 },
        ]);
      } catch (statusErr) {
        console.warn("[Migration] Failed to insert statuses:", statusErr);
      }
    }

    const existingCategories = await db.select().from(entityCategoriesTable)
      .where(eq(entityCategoriesTable.entityId, supplierEntity.id));

    if (existingCategories.length === 0) {
      for (const cat of SUPPLIER_CATEGORIES) {
        try {
          await db.insert(entityCategoriesTable).values({
            entityId: supplierEntity.id,
            ...cat,
            isActive: true,
          });
        } catch (catErr) {
          console.warn(`[Migration] Failed to insert category ${cat.slug}:`, catErr);
        }
      }
    }

    const childEntities: Record<string, typeof moduleEntitiesTable.$inferSelect> = {};
    for (const childDef of CHILD_ENTITIES) {
      const result = await ensureChildEntity(childDef, procurementModule.id, supplierEntity.id);
      childEntities[childDef.slug] = result.entity;
    }

    const contactEntity = childEntities["supplier_contact"];
    const documentEntity = childEntities["supplier_document"];
    const noteEntity = childEntities["supplier_note"];
    const performanceEntity = childEntities["supplier_performance"];

    const existingForms = await db.select().from(formDefinitionsTable)
      .where(eq(formDefinitionsTable.entityId, supplierEntity.id));

    if (existingForms.length === 0) {
      try {
        await db.insert(formDefinitionsTable).values({
          entityId: supplierEntity.id,
          name: "טופס ספק ראשי",
          slug: "supplier_main_form",
          formType: "create",
          isDefault: true,
          sections: [
            { name: "פרטים בסיסיים", slug: "basic", sortOrder: 0, fields: ["supplier_name", "supplier_number", "category", "supply_type", "activity_field", "material_types", "vat_number"] },
            { name: "פרטי התקשרות", slug: "contact", sortOrder: 1, fields: ["contact_person", "phone", "mobile", "email", "address", "city", "geographic_area"] },
            { name: "תנאים מסחריים", slug: "commercial", sortOrder: 2, fields: ["payment_terms", "currency", "credit_days", "minimum_order", "lead_time_days", "urgent_lead_time_days"] },
            { name: "הערות", slug: "notes", sortOrder: 3, fields: ["notes"] },
          ],
          settings: {},
        });
      } catch (formErr) {
        console.warn("[Migration] Failed to insert create form:", formErr);
      }

      try {
        await db.insert(formDefinitionsTable).values({
          entityId: supplierEntity.id,
          name: "טופס עריכת ספק",
          slug: "supplier_edit_form",
          formType: "edit",
          isDefault: false,
          sections: [
            { name: "פרטים בסיסיים", slug: "basic", sortOrder: 0, fields: ["supplier_name", "supplier_number", "category", "supply_type", "activity_field", "material_types", "vat_number"] },
            { name: "פרטי התקשרות", slug: "contact", sortOrder: 1, fields: ["contact_person", "phone", "mobile", "email", "address", "city", "geographic_area"] },
            { name: "תנאים מסחריים", slug: "commercial", sortOrder: 2, fields: ["payment_terms", "currency", "credit_days", "minimum_order", "lead_time_days", "urgent_lead_time_days"] },
            { name: "הערות", slug: "notes", sortOrder: 3, fields: ["notes"] },
          ],
          settings: {},
        });
      } catch (formErr) {
        console.warn("[Migration] Failed to insert edit form:", formErr);
      }
    }

    const existingViews = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, supplierEntity.id));

    if (existingViews.length === 0) {
      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: supplierEntity.id,
          name: "תצוגת רשימה",
          slug: "supplier_list_view",
          viewType: "table",
          isDefault: true,
          columns: [
            { fieldSlug: "supplier_number", width: "auto", visible: true },
            { fieldSlug: "supplier_name", width: "auto", visible: true },
            { fieldSlug: "contact_person", width: "auto", visible: true },
            { fieldSlug: "phone", width: "auto", visible: true },
            { fieldSlug: "city", width: "auto", visible: true },
            { fieldSlug: "category", width: "auto", visible: true },
            { fieldSlug: "lead_time_days", width: "auto", visible: true },
            { fieldSlug: "email", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "supplier_name", direction: "asc" }],
          filters: [],
          settings: {},
        });
      } catch (viewErr) {
        console.warn("[Migration] Failed to insert list view:", viewErr);
      }

      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: supplierEntity.id,
          name: "ספקים פעילים",
          slug: "active_suppliers_view",
          viewType: "table",
          isDefault: false,
          columns: [
            { fieldSlug: "supplier_number", width: "auto", visible: true },
            { fieldSlug: "supplier_name", width: "auto", visible: true },
            { fieldSlug: "category", width: "auto", visible: true },
            { fieldSlug: "phone", width: "auto", visible: true },
            { fieldSlug: "city", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "supplier_name", direction: "asc" }],
          filters: [{ fieldSlug: "status", operator: "equals", value: "active" }],
          settings: {},
        });
      } catch (viewErr) {
        console.warn("[Migration] Failed to insert active suppliers view:", viewErr);
      }
    }

    const existingDetails = await db.select().from(detailDefinitionsTable)
      .where(eq(detailDefinitionsTable.entityId, supplierEntity.id));

    if (existingDetails.length === 0) {
      try {
        await db.insert(detailDefinitionsTable).values({
          entityId: supplierEntity.id,
          name: "כרטיס ספק",
          slug: "supplier_detail",
          isDefault: true,
          showRelatedRecords: true,
          sections: [
            { name: "פרטי ספק", slug: "general", sectionType: "fields", sortOrder: 0, fields: ["supplier_number", "supplier_name", "contact_person", "category", "supply_type", "activity_field", "material_types", "vat_number"] },
            { name: "פרטי התקשרות", slug: "contact_info", sectionType: "fields", sortOrder: 1, fields: ["phone", "mobile", "email", "address", "city", "geographic_area"] },
            { name: "תנאים מסחריים", slug: "commercial", sectionType: "fields", sortOrder: 2, fields: ["payment_terms", "currency", "credit_days", "minimum_order", "lead_time_days", "urgent_lead_time_days"] },
            { name: "אנשי קשר", slug: "contacts_rel", sectionType: "related", sortOrder: 3, relatedEntityId: contactEntity.id },
            { name: "מסמכים", slug: "documents_rel", sectionType: "related", sortOrder: 4, relatedEntityId: documentEntity.id },
            { name: "הערות", slug: "notes_rel", sectionType: "related", sortOrder: 5, relatedEntityId: noteEntity.id },
            { name: "הערכות ביצוע", slug: "performance_rel", sectionType: "related", sortOrder: 6, relatedEntityId: performanceEntity.id },
            { name: "הערות כלליות", slug: "general_notes", sectionType: "fields", sortOrder: 7, fields: ["notes"] },
          ],
          settings: {},
        });
      } catch (detailErr) {
        console.warn("[Migration] Failed to insert detail definition:", detailErr);
      }
    }

    const suppliers = await db.select().from(suppliersTable);

    const existingRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, supplierEntity.id));
    const migratedSupplierNumbers = new Set(
      existingRecords
        .map((r) => {
          const data = r.data as Record<string, unknown> | null;
          return data?.supplier_number as string | undefined;
        })
        .filter((v): v is string => !!v)
    );

    const statusMap: Record<string, string> = {
      "פעיל": "active",
      "לא פעיל": "inactive",
      "מושהה": "suspended",
      "בבדיקה": "review",
      "חדש": "review",
    };

    let migratedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ supplierId: number; supplierNumber: string; error: string }> = [];

    for (const sup of suppliers) {
      if (migratedSupplierNumbers.has(sup.supplierNumber)) {
        skippedCount++;
        continue;
      }

      try {
        const data: Record<string, any> = {
          supplier_number: sup.supplierNumber,
          supplier_name: sup.supplierName,
          contact_person: sup.contactPerson,
          phone: sup.phone,
          mobile: sup.mobile,
          email: sup.email,
          address: sup.address,
          city: sup.city,
          category: sup.category,
          supply_type: sup.supplyType,
          payment_terms: sup.paymentTerms,
          lead_time_days: sup.leadTimeDays,
          vat_number: sup.vatNumber,
          notes: sup.notes,
          activity_field: sup.activityField,
          material_types: sup.materialTypes,
          geographic_area: sup.geographicArea,
          currency: sup.currency,
          credit_days: sup.creditDays,
          minimum_order: sup.minimumOrder,
          urgent_lead_time_days: sup.urgentLeadTimeDays,
        };

        const [supplierRecord] = await db.insert(entityRecordsTable).values({
          entityId: supplierEntity.id,
          data,
          status: statusMap[sup.status] || "active",
          createdAt: sup.createdAt,
          updatedAt: sup.updatedAt,
        }).returning();

        const contacts = await db.select().from(supplierContactsTable)
          .where(eq(supplierContactsTable.supplierId, sup.id));
        for (const c of contacts) {
          await db.insert(entityRecordsTable).values({
            entityId: contactEntity.id,
            data: {
              _parent_id: supplierRecord.id,
              contact_name: c.contactName,
              role: c.role,
              phone: c.phone,
              mobile: c.mobile,
              email: c.email,
              notes: c.notes,
            },
            status: "published",
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          });
        }

        const documents = await db.select().from(supplierDocumentsTable)
          .where(eq(supplierDocumentsTable.supplierId, sup.id));
        for (const d of documents) {
          await db.insert(entityRecordsTable).values({
            entityId: documentEntity.id,
            data: {
              _parent_id: supplierRecord.id,
              document_name: d.documentName,
              document_type: d.documentType,
              file_url: d.fileUrl,
              notes: d.notes,
              expiry_date: d.expiryDate,
            },
            status: "published",
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        }

        const notes = await db.select().from(supplierNotesTable)
          .where(eq(supplierNotesTable.supplierId, sup.id));
        for (const n of notes) {
          await db.insert(entityRecordsTable).values({
            entityId: noteEntity.id,
            data: {
              _parent_id: supplierRecord.id,
              note_text: n.noteText,
              author: n.author,
            },
            status: "published",
            createdAt: n.createdAt,
          });
        }

        const perfRecords = await db.select().from(supplierPerformanceTable)
          .where(eq(supplierPerformanceTable.supplierId, sup.id));
        for (const perf of perfRecords) {
          await db.insert(entityRecordsTable).values({
            entityId: performanceEntity.id,
            data: {
              _parent_id: supplierRecord.id,
              quality_rating: perf.qualityRating ? parseFloat(perf.qualityRating) : null,
              availability_rating: perf.availabilityRating ? parseFloat(perf.availabilityRating) : null,
              price_rating: perf.priceRating ? parseFloat(perf.priceRating) : null,
              service_rating: perf.serviceRating ? parseFloat(perf.serviceRating) : null,
              reliability_rating: perf.reliabilityRating ? parseFloat(perf.reliabilityRating) : null,
              delay_percentage: perf.delayPercentage ? parseFloat(perf.delayPercentage) : null,
              performance_notes: perf.performanceNotes,
              evaluation_date: perf.evaluationDate,
              evaluated_by: perf.evaluatedBy,
            },
            status: "published",
            createdAt: perf.createdAt,
            updatedAt: perf.updatedAt,
          });
        }

        migratedCount++;
      } catch (err: any) {
        errors.push({
          supplierId: sup.id,
          supplierNumber: sup.supplierNumber,
          error: err.message,
        });
      }
    }

    if (migratedCount > 0 || skippedCount > 0) {
      const allSupplierNumbers = suppliers.map(s => s.supplierNumber);
      const maxNum = allSupplierNumbers.reduce((max, sn) => {
        const num = parseInt(sn.replace(/\D/g, ""), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);

      if (maxNum > 0) {
        const [existingCounter] = await db.select().from(autoNumberCountersTable)
          .where(and(
            eq(autoNumberCountersTable.entityId, supplierEntity.id),
            eq(autoNumberCountersTable.fieldSlug, "supplier_number"),
          ));

        if (!existingCounter) {
          try {
            await db.insert(autoNumberCountersTable).values({
              entityId: supplierEntity.id,
              fieldSlug: "supplier_number",
              prefix: "SUP-",
              padding: 4,
              currentValue: maxNum,
              startValue: 1,
              incrementBy: 1,
            });
          } catch (counterErr) {
            console.warn("[Migration] Failed to insert auto-number counter:", counterErr);
          }
        }
      }
    }

    const hasErrors = errors.length > 0;
    const allMigrated = errors.length === 0 && (migratedCount + skippedCount) >= suppliers.length;

    res.status(hasErrors ? 207 : 200).json({
      message: allMigrated ? "Migration completed" : hasErrors ? "Migration completed with errors" : "Migration completed",
      moduleId: procurementModule.id,
      entityId: supplierEntity.id,
      childEntities: Object.fromEntries(
        Object.entries(childEntities).map(([k, v]) => [k, v.id])
      ),
      migratedRecords: migratedCount,
      skippedRecords: skippedCount,
      totalLegacy: suppliers.length,
      errors: hasErrors ? errors : undefined,
    });
  } catch (err: any) {
    console.error("Supplier migration error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/migrate/suppliers/status", async (req, res) => {
  try {
    const [procModule] = await db.select().from(platformModulesTable)
      .where(eq(platformModulesTable.slug, "procurement"));

    if (!procModule) {
      return res.json({ migrated: false, entityId: null, recordCount: 0 });
    }

    const [entity] = await db.select().from(moduleEntitiesTable)
      .where(and(
        eq(moduleEntitiesTable.slug, "supplier"),
        eq(moduleEntitiesTable.moduleId, procModule.id),
      ));

    if (!entity) {
      return res.json({ migrated: false, entityId: null, recordCount: 0 });
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, entity.id));
    const recordCount = countResult?.count || 0;

    const existingFields = await db.select({ count: sql<number>`count(*)::int` })
      .from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, entity.id));
    const fieldCount = existingFields[0]?.count || 0;

    const [legacyCountResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(suppliersTable);
    const legacyCount = legacyCountResult?.count || 0;

    const metadataReady = fieldCount > 0;
    const dataMigrated = legacyCount === 0 || recordCount >= legacyCount;
    const isMigrated = metadataReady && dataMigrated;

    res.json({
      migrated: isMigrated,
      entityId: entity.id,
      recordCount,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
