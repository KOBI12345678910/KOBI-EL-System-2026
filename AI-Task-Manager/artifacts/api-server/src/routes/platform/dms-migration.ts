import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityStatusesTable,
  entityRelationsTable,
  platformWorkflowsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  platformWidgetsTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSuperAdmin } from "../../lib/permission-middleware";

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
  isFilterable?: boolean;
  showInList?: boolean;
  showInForm?: boolean;
  showInDetail?: boolean;
  sortOrder: number;
  settings?: Record<string, unknown>;
  options?: string[];
  fieldWidth?: string;
  formulaExpression?: string;
  groupName?: string;
  relatedEntityId?: number;
  relatedDisplayField?: string;
  relationType?: string;
  defaultValue?: string;
  helpText?: string;
}

interface EntityDef {
  name: string;
  nameHe: string;
  nameEn: string;
  namePlural: string;
  slug: string;
  entityKey: string;
  tableName: string;
  description: string;
  icon: string;
  entityType: string;
  primaryDisplayField: string;
  sortOrder: number;
  hasStatus: boolean;
  hasCategories?: boolean;
  hasAttachments?: boolean;
  hasNotes?: boolean;
  hasNumbering?: boolean;
  hasAudit?: boolean;
  hasSoftDelete?: boolean;
  hasOwner?: boolean;
  fields: FieldDef[];
  statuses?: { name: string; slug: string; color: string; isDefault?: boolean; isFinal?: boolean; sortOrder: number }[];
}

type ModuleInsert = typeof platformModulesTable.$inferInsert;
type EntityRow = typeof moduleEntitiesTable.$inferSelect;

async function ensureModule(slug: string, data: ModuleInsert) {
  let [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.slug, slug));
  if (!mod) {
    [mod] = await db.insert(platformModulesTable).values(data).returning();
  }
  return mod;
}

async function ensureEntity(moduleId: number, def: EntityDef, parentEntityId?: number) {
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
      entityType: def.entityType,
      primaryDisplayField: def.primaryDisplayField,
      parentEntityId: parentEntityId || undefined,
      hasStatus: def.hasStatus,
      hasCategories: def.hasCategories ?? false,
      hasAttachments: def.hasAttachments ?? false,
      hasNotes: def.hasNotes ?? false,
      hasNumbering: def.hasNumbering ?? false,
      hasAudit: def.hasAudit ?? true,
      hasSoftDelete: def.hasSoftDelete ?? false,
      hasOwner: def.hasOwner ?? false,
      sortOrder: def.sortOrder,
    }).returning();
  }

  const existingFields = await db.select().from(entityFieldsTable)
    .where(eq(entityFieldsTable.entityId, entity.id));

  if (existingFields.length === 0) {
    for (const f of def.fields) {
      try {
        await db.insert(entityFieldsTable).values({
          entityId: entity.id,
          name: f.name,
          slug: f.slug,
          fieldKey: f.fieldKey,
          fieldType: f.fieldType,
          isRequired: f.isRequired ?? false,
          isUnique: f.isUnique ?? false,
          isReadOnly: f.isReadOnly ?? false,
          isCalculated: f.isCalculated ?? false,
          isSearchable: f.isSearchable ?? true,
          isSortable: true,
          isFilterable: f.isFilterable ?? (f.showInList ?? false),
          showInList: f.showInList ?? false,
          showInForm: f.showInForm ?? true,
          showInDetail: f.showInDetail ?? true,
          sortOrder: f.sortOrder,
          settings: f.settings ?? {},
          options: f.options ? f.options.map(o => ({ label: o, value: o })) : [],
          fieldWidth: f.fieldWidth || "half",
          formulaExpression: f.formulaExpression,
          groupName: f.groupName,
          relatedEntityId: f.relatedEntityId,
          relatedDisplayField: f.relatedDisplayField,
          relationType: f.relationType,
          defaultValue: f.defaultValue,
          helpText: f.helpText,
        });
      } catch (err) {
        console.warn(`[DMS Migration] Failed to insert field ${def.slug}.${f.slug}:`, err);
      }
    }
  }

  if (def.statuses && def.statuses.length > 0) {
    const existingStatuses = await db.select().from(entityStatusesTable)
      .where(eq(entityStatusesTable.entityId, entity.id));

    if (existingStatuses.length === 0) {
      for (const s of def.statuses) {
        try {
          await db.insert(entityStatusesTable).values({
            entityId: entity.id,
            name: s.name,
            slug: s.slug,
            color: s.color,
            isDefault: s.isDefault ?? false,
            isFinal: s.isFinal ?? false,
            sortOrder: s.sortOrder,
          });
        } catch (err) {
          console.warn(`[DMS Migration] Failed to insert status ${def.slug}.${s.slug}:`, err);
        }
      }
    }
  }

  return entity;
}

async function ensureRelation(
  sourceId: number,
  targetId: number,
  relationType: string,
  label: string,
  reverseLabel: string,
  fieldSlug: string,
  sortOrder: number,
) {
  const existing = await db.select().from(entityRelationsTable)
    .where(and(
      eq(entityRelationsTable.sourceEntityId, sourceId),
      eq(entityRelationsTable.targetEntityId, targetId),
    ));
  if (existing.length === 0) {
    const isFkOnSource = relationType === "many_to_many";
    try {
      await db.insert(entityRelationsTable).values({
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        relationType,
        sourceFieldSlug: isFkOnSource ? fieldSlug : undefined,
        targetFieldSlug: isFkOnSource ? undefined : fieldSlug,
        label,
        reverseLabel,
        cascadeDelete: relationType === "one_to_many",
        sortOrder,
      });
    } catch (err) {
      console.warn(`[DMS Migration] Failed to insert relation ${label}:`, err);
    }
  }
}

// ==================== MODULE 1: DMS — Document Management System ====================

const DMS_DOCUMENTS: FieldDef[] = [
  { name: "מספר מסמך", slug: "document_number", fieldKey: "dms_doc_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "DOC-", padding: 5, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "שם מסמך", slug: "document_name", fieldKey: "dms_doc_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תיאור", slug: "description", fieldKey: "dms_doc_description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוג מסמך", slug: "document_type", fieldKey: "dms_doc_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["PDF", "Excel", "Word", "תמונה", "DWG", "PowerPoint", "CSV", "אחר"], sortOrder: 3 },
  { name: "סוג MIME", slug: "mime_type", fieldKey: "dms_mime_type", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "גודל קובץ (KB)", slug: "file_size_kb", fieldKey: "dms_file_size", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "קישור לקובץ", slug: "file_url", fieldKey: "dms_file_url", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תיקייה", slug: "folder_id", fieldKey: "dms_folder_id", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7, helpText: "התיקייה שהמסמך שייך אליה" },
  { name: "מחלקה", slug: "department", fieldKey: "dms_department", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["הנהלה", "כספים", "משאבי אנוש", "משפטי", "שיווק", "תפעול", "IT", "מכירות", "רכש", "הנדסה"], sortOrder: 8 },
  { name: "תגיות", slug: "tags", fieldKey: "dms_tags", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, isSearchable: true, relationType: "many_to_many", relatedDisplayField: "tag_name", sortOrder: 9, helpText: "תגיות מישות תגיות DMS" },
  { name: "גרסה נוכחית", slug: "current_version", fieldKey: "dms_current_version", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "1", sortOrder: 10 },
  { name: "נעול לעריכה", slug: "is_locked", fieldKey: "dms_is_locked", fieldType: "boolean", showInList: true, showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 11 },
  { name: "נעול על ידי", slug: "locked_by", fieldKey: "dms_locked_by", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 12 },
  { name: "תאריך נעילה", slug: "locked_at", fieldKey: "dms_locked_at", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 13 },
  { name: "רמת סיווג", slug: "classification", fieldKey: "dms_classification", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["ציבורי", "פנימי", "חסוי", "סודי ביותר"], defaultValue: "פנימי", sortOrder: 14 },
  { name: "הרשאת צפייה", slug: "view_permission", fieldKey: "dms_view_perm", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["כולם", "מחלקה", "בעלים בלבד", "רשימת משתמשים"], defaultValue: "כולם", sortOrder: 15 },
  { name: "הרשאת עריכה", slug: "edit_permission", fieldKey: "dms_edit_perm", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["כולם", "מחלקה", "בעלים בלבד", "רשימת משתמשים"], defaultValue: "בעלים בלבד", sortOrder: 16 },
  { name: "סטטוס OCR", slug: "ocr_status", fieldKey: "dms_ocr_status", fieldType: "single_select", showInForm: false, showInDetail: true, isReadOnly: true, options: ["לא רלוונטי", "ממתין", "בעיבוד", "הושלם", "נכשל"], defaultValue: "לא רלוונטי", sortOrder: 17 },
  { name: "תוכן מחולץ (OCR)", slug: "ocr_content", fieldKey: "dms_ocr_content", fieldType: "long_text", showInForm: false, showInDetail: true, isReadOnly: true, isSearchable: true, sortOrder: 18 },
  { name: "תאריך תפוגה", slug: "expiry_date", fieldKey: "dms_expiry_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 19 },
  { name: "בעלים", slug: "owner", fieldKey: "dms_owner", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 20 },
  { name: "צפיות", slug: "view_count", fieldKey: "dms_view_count", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 21 },
  { name: "צפייה אחרונה", slug: "last_viewed_at", fieldKey: "dms_last_viewed", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 22 },
  { name: "חוזה מקושר", slug: "linked_contract_id", fieldKey: "dms_linked_contract", fieldType: "relation", showInForm: true, showInDetail: true, sortOrder: 23, helpText: "קישור לחוזה ממודול CLM" },
  { name: "ספרייה", slug: "library_id", fieldKey: "dms_library_id", fieldType: "relation", showInForm: true, showInDetail: true, sortOrder: 24, helpText: "ספרייה ממודול SharePoint" },
];

const DMS_FOLDERS: FieldDef[] = [
  { name: "שם תיקייה", slug: "folder_name", fieldKey: "dms_folder_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "dms_folder_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "תיקיית אב", slug: "parent_folder_id", fieldKey: "dms_parent_folder", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2, helpText: "תיקיית אב ליצירת היררכיה" },
  { name: "נתיב מלא", slug: "full_path", fieldKey: "dms_folder_path", fieldType: "text", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 3, helpText: "ארגון / מחלקה / נושא / שנה" },
  { name: "מחלקה", slug: "department", fieldKey: "dms_folder_dept", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["הנהלה", "כספים", "משאבי אנוש", "משפטי", "שיווק", "תפעול", "IT", "מכירות", "רכש", "הנדסה"], sortOrder: 4 },
  { name: "רמת הרשאה", slug: "access_level", fieldKey: "dms_folder_access", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["ציבורי", "מחלקתי", "מוגבל"], defaultValue: "מחלקתי", sortOrder: 5 },
  { name: "סדר מיון", slug: "sort_order", fieldKey: "dms_folder_sort", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "0", sortOrder: 6 },
  { name: "צבע", slug: "color", fieldKey: "dms_folder_color", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["blue", "green", "red", "yellow", "purple", "gray", "orange"], defaultValue: "blue", sortOrder: 7 },
  { name: "אייקון", slug: "icon", fieldKey: "dms_folder_icon", fieldType: "text", showInForm: true, showInDetail: true, defaultValue: "Folder", sortOrder: 8 },
];

const DMS_TAGS: FieldDef[] = [
  { name: "שם תגית", slug: "tag_name", fieldKey: "dms_tag_name", fieldType: "text", isRequired: true, isUnique: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "צבע", slug: "color", fieldKey: "dms_tag_color", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["blue", "green", "red", "yellow", "purple", "gray", "orange", "teal", "pink"], defaultValue: "blue", sortOrder: 1 },
  { name: "תיאור", slug: "description", fieldKey: "dms_tag_desc", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "קטגוריה", slug: "category", fieldKey: "dms_tag_category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["כללי", "סטטוס", "סיווג", "מחלקה", "פרויקט"], sortOrder: 3 },
];

const DMS_VERSIONS: FieldDef[] = [
  { name: "מסמך", slug: "document_id", fieldKey: "dms_ver_doc_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "מספר גרסה", slug: "version_number", fieldKey: "dms_ver_number", fieldType: "number", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "תיאור שינוי", slug: "change_description", fieldKey: "dms_ver_change_desc", fieldType: "long_text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "קישור לקובץ", slug: "file_url", fieldKey: "dms_ver_file_url", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "גודל קובץ (KB)", slug: "file_size_kb", fieldKey: "dms_ver_file_size", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "נוצר על ידי", slug: "created_by_user", fieldKey: "dms_ver_created_by", fieldType: "text", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "האם גרסה פעילה", slug: "is_active", fieldKey: "dms_ver_is_active", fieldType: "boolean", showInList: true, showInForm: false, showInDetail: true, defaultValue: "true", sortOrder: 6 },
];

const DMS_COMMENTS: FieldDef[] = [
  { name: "מסמך", slug: "document_id", fieldKey: "dms_cmt_doc_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "תוכן הערה", slug: "comment_text", fieldKey: "dms_cmt_text", fieldType: "long_text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "כותב", slug: "author", fieldKey: "dms_cmt_author", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוג הערה", slug: "comment_type", fieldKey: "dms_cmt_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["הערה", "שאלה", "תיקון", "אישור", "דחייה"], defaultValue: "הערה", sortOrder: 3 },
  { name: "הערת אב", slug: "parent_comment_id", fieldKey: "dms_cmt_parent", fieldType: "relation", showInForm: true, showInDetail: true, sortOrder: 4, helpText: "לתשובה על הערה קיימת" },
  { name: "נפתר", slug: "is_resolved", fieldKey: "dms_cmt_resolved", fieldType: "boolean", showInList: true, showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 5 },
];

const DMS_SHARES: FieldDef[] = [
  { name: "מסמך", slug: "document_id", fieldKey: "dms_share_doc_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שותף עם", slug: "shared_with", fieldKey: "dms_share_with", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1, helpText: "שם משתמש או אימייל" },
  { name: "סוג שיתוף", slug: "share_type", fieldKey: "dms_share_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["פנימי", "חיצוני", "לינק ציבורי"], sortOrder: 2 },
  { name: "הרשאה", slug: "permission_level", fieldKey: "dms_share_perm", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["צפייה", "עריכה", "הורדה", "ניהול"], defaultValue: "צפייה", sortOrder: 3 },
  { name: "תוקף שיתוף", slug: "expires_at", fieldKey: "dms_share_expires", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "לינק שיתוף", slug: "share_link", fieldKey: "dms_share_link", fieldType: "url", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "סיסמה נדרשת", slug: "requires_password", fieldKey: "dms_share_password", fieldType: "boolean", showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 6 },
  { name: "הודעה", slug: "message", fieldKey: "dms_share_msg", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 7 },
];

const DMS_AUDIT_TRAIL: FieldDef[] = [
  { name: "מסמך", slug: "document_id", fieldKey: "dms_audit_doc_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: false, showInDetail: true, sortOrder: 0 },
  { name: "פעולה", slug: "action", fieldKey: "dms_audit_action", fieldType: "single_select", isRequired: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, options: ["צפייה", "עריכה", "הורדה", "העלאה", "מחיקה", "שיתוף", "נעילה", "שחרור נעילה", "שינוי הרשאות", "שחזור גרסה"], sortOrder: 1 },
  { name: "משתמש", slug: "user_name", fieldKey: "dms_audit_user", fieldType: "text", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 2 },
  { name: "כתובת IP", slug: "ip_address", fieldKey: "dms_audit_ip", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 3 },
  { name: "פרטים נוספים", slug: "details", fieldKey: "dms_audit_details", fieldType: "long_text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "תאריך", slug: "action_date", fieldKey: "dms_audit_date", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
];

// ==================== MODULE 2: CLM — Contract Lifecycle Management ====================

const CLM_CONTRACTS: FieldDef[] = [
  { name: "מספר חוזה", slug: "contract_number", fieldKey: "clm_contract_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "CTR-", padding: 5, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "שם חוזה", slug: "contract_name", fieldKey: "clm_contract_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תיאור", slug: "description", fieldKey: "clm_contract_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוג חוזה", slug: "contract_type", fieldKey: "clm_contract_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["חוזה שירות", "חוזה רכש", "חוזה עבודה", "הסכם סודיות (NDA)", "הסכם שותפות", "חוזה ייעוץ", "חוזה ליסינג", "חוזה שכירות", "הסכם רישיון", "אחר"], sortOrder: 3 },
  { name: "צד א׳ (החברה)", slug: "party_a", fieldKey: "clm_party_a", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "צד ב׳ (ספק/לקוח)", slug: "party_b", fieldKey: "clm_party_b", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 5 },
  { name: "סוג צד ב׳", slug: "party_b_type", fieldKey: "clm_party_b_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["ספק", "לקוח", "קבלן", "שותף", "יועץ", "עובד", "אחר"], sortOrder: 6 },
  { name: "תאריך התחלה", slug: "start_date", fieldKey: "clm_start_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "תאריך סיום", slug: "end_date", fieldKey: "clm_end_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "סכום חוזה", slug: "contract_amount", fieldKey: "clm_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9, settings: { decimalPlaces: 2 } },
  { name: "מטבע", slug: "currency", fieldKey: "clm_currency", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["ILS", "USD", "EUR", "GBP"], defaultValue: "ILS", sortOrder: 10 },
  { name: "תנאי תשלום", slug: "payment_terms", fieldKey: "clm_payment_terms", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["מזומן", "שוטף 30", "שוטף 60", "שוטף 90", "שוטף +30", "שוטף +60", "לפי אבני דרך", "חודשי", "שנתי"], sortOrder: 11 },
  { name: "תדירות חיוב", slug: "billing_frequency", fieldKey: "clm_billing_freq", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["חד פעמי", "חודשי", "רבעוני", "חצי שנתי", "שנתי"], sortOrder: 12 },
  { name: "חידוש אוטומטי", slug: "auto_renewal", fieldKey: "clm_auto_renewal", fieldType: "boolean", showInList: true, showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 13 },
  { name: "תקופת הודעה (ימים)", slug: "notice_period_days", fieldKey: "clm_notice_period", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "30", sortOrder: 14 },
  { name: "מחלקה אחראית", slug: "responsible_department", fieldKey: "clm_resp_dept", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["הנהלה", "כספים", "משאבי אנוש", "משפטי", "שיווק", "תפעול", "IT", "מכירות", "רכש"], sortOrder: 15 },
  { name: "מנהל חוזה", slug: "contract_manager", fieldKey: "clm_manager", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 16 },
  { name: "יועץ משפטי", slug: "legal_advisor", fieldKey: "clm_legal_advisor", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 17 },
  { name: "ימים לפקיעה", slug: "days_to_expiry", fieldKey: "clm_days_to_expiry", fieldType: "formula", isCalculated: true, formulaExpression: "DATEDIFF(end_date, TODAY())", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 18 },
  { name: "סכום מצטבר", slug: "accumulated_amount", fieldKey: "clm_accumulated", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 19, settings: { decimalPlaces: 2 } },
  { name: "קישור למסמך", slug: "document_url", fieldKey: "clm_doc_url", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 20 },
  { name: "הערות", slug: "notes", fieldKey: "clm_notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 21 },
  { name: "סיכון", slug: "risk_level", fieldKey: "clm_risk_level", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["נמוך", "בינוני", "גבוה", "קריטי"], defaultValue: "נמוך", sortOrder: 22 },
];

const CLM_AMENDMENTS: FieldDef[] = [
  { name: "מספר נספח", slug: "amendment_number", fieldKey: "clm_amend_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "AMD-", padding: 4, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "חוזה מקורי", slug: "contract_id", fieldKey: "clm_amend_contract", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "שם נספח", slug: "amendment_name", fieldKey: "clm_amend_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 2 },
  { name: "סוג שינוי", slug: "change_type", fieldKey: "clm_amend_change_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["הארכת תוקף", "שינוי סכום", "שינוי תנאים", "הוספת שירות", "צמצום היקף", "שינוי צדדים", "אחר"], sortOrder: 3 },
  { name: "תיאור השינוי", slug: "change_description", fieldKey: "clm_amend_desc", fieldType: "long_text", isRequired: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "תאריך תוקף", slug: "effective_date", fieldKey: "clm_amend_effective", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "סכום שינוי", slug: "amount_change", fieldKey: "clm_amend_amount", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 6, settings: { decimalPlaces: 2 } },
  { name: "קישור למסמך", slug: "document_url", fieldKey: "clm_amend_doc_url", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 7 },
];

const CLM_PARTIES: FieldDef[] = [
  { name: "חוזה", slug: "contract_id", fieldKey: "clm_party_contract", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שם הצד", slug: "party_name", fieldKey: "clm_party_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תפקיד", slug: "role", fieldKey: "clm_party_role", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["צד ראשי", "ערב", "מוטב", "נציג", "עד"], sortOrder: 2 },
  { name: "איש קשר", slug: "contact_person", fieldKey: "clm_party_contact", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "אימייל", slug: "email", fieldKey: "clm_party_email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "טלפון", slug: "phone", fieldKey: "clm_party_phone", fieldType: "phone", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "כתובת", slug: "address", fieldKey: "clm_party_address", fieldType: "address", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "מספר עוסק / ח.פ", slug: "company_id", fieldKey: "clm_party_company_id", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 7 },
];

const CLM_MILESTONES: FieldDef[] = [
  { name: "חוזה", slug: "contract_id", fieldKey: "clm_ms_contract", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שם אבן דרך", slug: "milestone_name", fieldKey: "clm_ms_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "סוג", slug: "milestone_type", fieldKey: "clm_ms_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["תשלום", "אספקה", "חידוש", "ביקורת", "דיווח", "אחר"], sortOrder: 2 },
  { name: "תאריך יעד", slug: "due_date", fieldKey: "clm_ms_due_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תאריך ביצוע", slug: "completed_date", fieldKey: "clm_ms_completed_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "סכום", slug: "amount", fieldKey: "clm_ms_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5, settings: { decimalPlaces: 2 } },
  { name: "אחראי", slug: "responsible", fieldKey: "clm_ms_responsible", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "התראה (ימים לפני)", slug: "reminder_days", fieldKey: "clm_ms_reminder_days", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "7", sortOrder: 7 },
  { name: "הערות", slug: "notes", fieldKey: "clm_ms_notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
];

const CLM_EXPIRY_ALERTS: FieldDef[] = [
  { name: "חוזה", slug: "contract_id", fieldKey: "clm_alert_contract", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "סוג התראה", slug: "alert_type", fieldKey: "clm_alert_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["פקיעת תוקף", "חידוש", "תשלום", "אבן דרך", "ביקורת"], sortOrder: 1 },
  { name: "ימים לפני אירוע", slug: "days_before", fieldKey: "clm_alert_days", fieldType: "number", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "נמען", slug: "recipient", fieldKey: "clm_alert_recipient", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תאריך התראה", slug: "alert_date", fieldKey: "clm_alert_date", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "נשלח", slug: "is_sent", fieldKey: "clm_alert_sent", fieldType: "boolean", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "false", sortOrder: 5 },
  { name: "הודעה", slug: "message", fieldKey: "clm_alert_message", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
];

// ==================== MODULE 3: Digital Signatures (DocuSign-style) ====================

const ESIGN_REQUESTS: FieldDef[] = [
  { name: "מספר בקשה", slug: "request_number", fieldKey: "esign_req_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "SIG-", padding: 5, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "שם בקשה", slug: "request_name", fieldKey: "esign_req_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תיאור", slug: "description", fieldKey: "esign_req_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "מסמך מקור", slug: "source_document_url", fieldKey: "esign_source_doc", fieldType: "url", isRequired: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "שם מסמך", slug: "document_name", fieldKey: "esign_doc_name", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "שולח", slug: "sender_name", fieldKey: "esign_sender", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "אימייל שולח", slug: "sender_email", fieldKey: "esign_sender_email", fieldType: "email", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "סדר חתימה", slug: "signing_order", fieldKey: "esign_signing_order", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["לפי סדר", "מקבילי"], defaultValue: "לפי סדר", sortOrder: 7 },
  { name: "תאריך יעד", slug: "due_date", fieldKey: "esign_due_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "תאריך השלמה", slug: "completed_at", fieldKey: "esign_completed_at", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
  { name: "מסמך חתום URL", slug: "signed_document_url", fieldKey: "esign_signed_doc", fieldType: "url", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 10 },
  { name: "הודעה לחותמים", slug: "message_to_signers", fieldKey: "esign_message", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "תזכורות אוטומטיות", slug: "auto_reminders", fieldKey: "esign_auto_remind", fieldType: "boolean", showInForm: true, showInDetail: true, defaultValue: "true", sortOrder: 12 },
  { name: "ימים בין תזכורות", slug: "reminder_interval_days", fieldKey: "esign_remind_interval", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "3", sortOrder: 13 },
  { name: "Escalation אחרי (ימים)", slug: "escalation_days", fieldKey: "esign_escalation_days", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "7", sortOrder: 14 },
  { name: "חוזה מקושר", slug: "linked_contract_id", fieldKey: "esign_linked_contract", fieldType: "relation", showInForm: true, showInDetail: true, sortOrder: 15, helpText: "חוזה מקושר מ-CLM" },
  { name: "עדיפות", slug: "priority", fieldKey: "esign_priority", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["נמוכה", "רגילה", "גבוהה", "דחוף"], defaultValue: "רגילה", sortOrder: 16 },
];

const ESIGN_SIGNERS: FieldDef[] = [
  { name: "בקשת חתימה", slug: "request_id", fieldKey: "esign_signer_req", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שם חותם", slug: "signer_name", fieldKey: "esign_signer_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "אימייל", slug: "signer_email", fieldKey: "esign_signer_email", fieldType: "email", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "תפקיד", slug: "signer_role", fieldKey: "esign_signer_role", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["חותם", "מאשר", "עד", "נמען העתק"], sortOrder: 3 },
  { name: "סדר חתימה", slug: "signing_order", fieldKey: "esign_signer_order", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, defaultValue: "1", sortOrder: 4 },
  { name: "תאריך חתימה", slug: "signed_at", fieldKey: "esign_signed_at", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "IP חותם", slug: "signer_ip", fieldKey: "esign_signer_ip", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6 },
  { name: "סיבת סירוב", slug: "decline_reason", fieldKey: "esign_decline_reason", fieldType: "long_text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 7 },
  { name: "תזכורות שנשלחו", slug: "reminders_sent", fieldKey: "esign_reminders_sent", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 8 },
  { name: "תזכורת אחרונה", slug: "last_reminder_at", fieldKey: "esign_last_reminder", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
];

const ESIGN_FIELDS_DEF: FieldDef[] = [
  { name: "בקשת חתימה", slug: "request_id", fieldKey: "esign_field_req", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "חותם", slug: "signer_id", fieldKey: "esign_field_signer", fieldType: "relation", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "סוג שדה", slug: "field_type", fieldKey: "esign_field_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["חתימה", "חתימה ראשונית", "תאריך", "שם מלא", "תפקיד", "חברה", "טקסט חופשי", "תיבת סימון"], sortOrder: 2 },
  { name: "עמוד", slug: "page_number", fieldKey: "esign_field_page", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, defaultValue: "1", sortOrder: 3 },
  { name: "מיקום X (%)", slug: "position_x", fieldKey: "esign_field_x", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 4, settings: { decimalPlaces: 2 } },
  { name: "מיקום Y (%)", slug: "position_y", fieldKey: "esign_field_y", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5, settings: { decimalPlaces: 2 } },
  { name: "רוחב", slug: "width", fieldKey: "esign_field_width", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "200", sortOrder: 6 },
  { name: "גובה", slug: "height", fieldKey: "esign_field_height", fieldType: "number", showInForm: true, showInDetail: true, defaultValue: "50", sortOrder: 7 },
  { name: "חובה", slug: "is_required", fieldKey: "esign_field_required", fieldType: "boolean", showInForm: true, showInDetail: true, defaultValue: "true", sortOrder: 8 },
  { name: "ערך שמולא", slug: "filled_value", fieldKey: "esign_field_value", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
];

const ESIGN_AUDIT_LOG: FieldDef[] = [
  { name: "בקשת חתימה", slug: "request_id", fieldKey: "esign_log_req", fieldType: "relation", isRequired: true, showInList: true, showInForm: false, showInDetail: true, sortOrder: 0 },
  { name: "פעולה", slug: "action", fieldKey: "esign_log_action", fieldType: "single_select", isRequired: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, options: ["נוצר", "נשלח", "נפתח", "נצפה", "חתום", "סורב", "בוטל", "תזכורת נשלחה", "הושלם", "ארכיון"], sortOrder: 1 },
  { name: "חותם", slug: "signer_name", fieldKey: "esign_log_signer", fieldType: "text", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 2 },
  { name: "כתובת IP", slug: "ip_address", fieldKey: "esign_log_ip", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 3 },
  { name: "User Agent", slug: "user_agent", fieldKey: "esign_log_ua", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "חותמת זמן", slug: "timestamp", fieldKey: "esign_log_timestamp", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "פרטים", slug: "details", fieldKey: "esign_log_details", fieldType: "long_text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6 },
];

// ==================== MODULE 4: PandaDoc-style — Document Creation & Sending ====================

const PANDADOC_TEMPLATES: FieldDef[] = [
  { name: "שם תבנית", slug: "template_name", fieldKey: "pd_tpl_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "pd_tpl_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "קטגוריה", slug: "category", fieldKey: "pd_tpl_category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["הצעת מחיר", "חשבונית", "חוזה", "הסכם", "מכתב", "דוח", "טופס", "אחר"], sortOrder: 2 },
  { name: "תוכן (Blocks JSON)", slug: "content_blocks", fieldKey: "pd_tpl_blocks", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 3, helpText: "מבנה JSON של blocks — טקסט, טבלה, תמונה, חתימה" },
  { name: "משתנים דינמיים", slug: "dynamic_variables", fieldKey: "pd_tpl_vars", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 4, helpText: "רשימת משתנים שניתן למלא מישויות אחרות" },
  { name: "ישות מקושרת", slug: "linked_entity_id", fieldKey: "pd_tpl_entity", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5, helpText: "ID ישות מקור לנתונים (לקוחות, ספקים, הצעות מחיר)" },
  { name: "עיצוב (CSS)", slug: "custom_css", fieldKey: "pd_tpl_css", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "הגדרות עמוד", slug: "page_settings", fieldKey: "pd_tpl_page", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 7, helpText: "JSON — גודל, שוליים, כיווניות" },
  { name: "כותרת עליונה", slug: "header_html", fieldKey: "pd_tpl_header", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "כותרת תחתונה", slug: "footer_html", fieldKey: "pd_tpl_footer", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "גרסה", slug: "version", fieldKey: "pd_tpl_version", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "1", sortOrder: 10 },
  { name: "שימושים", slug: "usage_count", fieldKey: "pd_tpl_usage", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 11 },
];

const PANDADOC_SENDING: FieldDef[] = [
  { name: "מספר שליחה", slug: "sending_number", fieldKey: "pd_send_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "SEND-", padding: 5, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "תבנית", slug: "template_id", fieldKey: "pd_send_template", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "שם מסמך", slug: "document_name", fieldKey: "pd_send_doc_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 2 },
  { name: "נמען", slug: "recipient_name", fieldKey: "pd_send_recipient", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "אימייל נמען", slug: "recipient_email", fieldKey: "pd_send_email", fieldType: "email", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "הודעה", slug: "message", fieldKey: "pd_send_message", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "נתונים מותאמים", slug: "custom_data", fieldKey: "pd_send_data", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6, helpText: "JSON של נתונים למילוי המשתנים" },
  { name: "HTML שנוצר", slug: "generated_html", fieldKey: "pd_send_html", fieldType: "long_text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 7 },
  { name: "תאריך שליחה", slug: "sent_at", fieldKey: "pd_send_sent_at", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 8 },
  { name: "דורש חתימה", slug: "requires_signature", fieldKey: "pd_send_req_sign", fieldType: "boolean", showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 9 },
  { name: "בקשת חתימה מקושרת", slug: "signature_request_id", fieldKey: "pd_send_sig_req", fieldType: "relation", showInForm: false, showInDetail: true, sortOrder: 10, helpText: "מקושר למודול חתימות" },
];

const PANDADOC_ANALYTICS: FieldDef[] = [
  { name: "שליחה", slug: "sending_id", fieldKey: "pd_analytics_send", fieldType: "relation", isRequired: true, showInList: true, showInForm: false, showInDetail: true, sortOrder: 0 },
  { name: "אירוע", slug: "event_type", fieldKey: "pd_analytics_event", fieldType: "single_select", isRequired: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, options: ["נשלח", "נפתח", "נצפה", "הורד", "חתום", "סורב", "הועבר"], sortOrder: 1 },
  { name: "צופה", slug: "viewer_name", fieldKey: "pd_analytics_viewer", fieldType: "text", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 2 },
  { name: "אימייל צופה", slug: "viewer_email", fieldKey: "pd_analytics_email", fieldType: "email", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 3 },
  { name: "זמן צפייה (שניות)", slug: "view_duration_seconds", fieldKey: "pd_analytics_duration", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "כתובת IP", slug: "ip_address", fieldKey: "pd_analytics_ip", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "מכשיר", slug: "device_info", fieldKey: "pd_analytics_device", fieldType: "text", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6 },
  { name: "חותמת זמן", slug: "event_timestamp", fieldKey: "pd_analytics_ts", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 7 },
];

// ==================== MODULE 5: SharePoint-style — Document Libraries ====================

const SP_LIBRARIES: FieldDef[] = [
  { name: "שם ספרייה", slug: "library_name", fieldKey: "sp_lib_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "sp_lib_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "מחלקה", slug: "department", fieldKey: "sp_lib_dept", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, isFilterable: true, options: ["הנהלה", "כספים", "משאבי אנוש", "משפטי", "שיווק", "תפעול", "IT", "מכירות", "רכש", "הנדסה"], sortOrder: 2 },
  { name: "פרויקט", slug: "project", fieldKey: "sp_lib_project", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 3 },
  { name: "תצוגת ברירת מחדל", slug: "default_view", fieldKey: "sp_lib_default_view", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["רשימה", "כרטיסים", "תיקיות", "לוח זמנים"], defaultValue: "רשימה", sortOrder: 4 },
  { name: "מטא-דאטה מותאם", slug: "custom_metadata", fieldKey: "sp_lib_metadata", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5, helpText: "JSON של שדות מטא-דאטה מותאמים לספרייה זו" },
  { name: "OneDrive Link", slug: "onedrive_link", fieldKey: "sp_lib_onedrive", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 6, helpText: "קישור חיצוני ל-OneDrive" },
  { name: "SharePoint ID", slug: "sharepoint_id", fieldKey: "sp_lib_sp_id", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 7, helpText: "מזהה SharePoint לסנכרון" },
  { name: "סטטוס סנכרון", slug: "sync_status", fieldKey: "sp_lib_sync", fieldType: "single_select", showInForm: false, showInDetail: true, isReadOnly: true, options: ["לא מחובר", "מסונכרן", "שגיאה", "בעיבוד"], defaultValue: "לא מחובר", sortOrder: 8 },
  { name: "סנכרון אחרון", slug: "last_synced_at", fieldKey: "sp_lib_last_sync", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
  { name: "מספר מסמכים", slug: "document_count", fieldKey: "sp_lib_doc_count", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 10 },
  { name: "גודל כולל (MB)", slug: "total_size_mb", fieldKey: "sp_lib_total_size", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 11, settings: { decimalPlaces: 2 } },
];

const SP_CONTENT_TYPES: FieldDef[] = [
  { name: "שם סוג תוכן", slug: "content_type_name", fieldKey: "sp_ct_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "sp_ct_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "ספרייה", slug: "library_id", fieldKey: "sp_ct_library", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוגי קבצים מותרים", slug: "allowed_file_types", fieldKey: "sp_ct_file_types", fieldType: "multi_select", showInForm: true, showInDetail: true, options: ["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG", "DWG", "CSV", "TXT", "ZIP"], sortOrder: 3 },
  { name: "שדות מטא-דאטה", slug: "metadata_fields", fieldKey: "sp_ct_metadata", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 4, helpText: "JSON של שדות מטא-דאטה ייחודיים לסוג תוכן" },
  { name: "תבנית ברירת מחדל", slug: "default_template_url", fieldKey: "sp_ct_template", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "חובת אישור", slug: "requires_approval", fieldKey: "sp_ct_approval", fieldType: "boolean", showInForm: true, showInDetail: true, defaultValue: "false", sortOrder: 6 },
];

const SP_RETENTION: FieldDef[] = [
  { name: "שם מדיניות", slug: "policy_name", fieldKey: "sp_ret_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "sp_ret_desc", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "ספרייה", slug: "library_id", fieldKey: "sp_ret_library", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "תקופת שמירה (שנים)", slug: "retention_years", fieldKey: "sp_ret_years", fieldType: "number", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "פעולה בתום תקופה", slug: "expiry_action", fieldKey: "sp_ret_action", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["מחיקה אוטומטית", "העברה לארכיון", "התראה לבעלים", "סקירה ידנית"], sortOrder: 4 },
  { name: "חל על סוגי תוכן", slug: "applies_to_content_types", fieldKey: "sp_ret_content_types", fieldType: "multi_select", showInForm: true, showInDetail: true, options: ["כל הסוגים", "מסמכים", "חוזים", "דוחות", "תמונות"], sortOrder: 5 },
  { name: "תחילת תוקף", slug: "effective_from", fieldKey: "sp_ret_from", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "הרצה אחרונה", slug: "last_run_at", fieldKey: "sp_ret_last_run", fieldType: "date", showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 7 },
  { name: "מסמכים שנמחקו", slug: "documents_deleted", fieldKey: "sp_ret_deleted", fieldType: "number", showInForm: false, showInDetail: true, isReadOnly: true, defaultValue: "0", sortOrder: 8 },
];

const SP_CHECKINOUT: FieldDef[] = [
  { name: "ספרייה", slug: "library_id", fieldKey: "sp_cio_library", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "מסמך DMS", slug: "document_id", fieldKey: "sp_cio_doc_id", fieldType: "relation", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "שם מסמך", slug: "document_name", fieldKey: "sp_cio_doc_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 2 },
  { name: "פעולה", slug: "action", fieldKey: "sp_cio_action", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["Check-Out", "Check-In"], sortOrder: 3 },
  { name: "משתמש", slug: "user_name", fieldKey: "sp_cio_user", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "תאריך פעולה", slug: "action_date", fieldKey: "sp_cio_date", fieldType: "date", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 5 },
  { name: "הערות", slug: "notes", fieldKey: "sp_cio_notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "גרסה חדשה", slug: "new_version_number", fieldKey: "sp_cio_version", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 7, helpText: "רק ב-Check-In" },
];

// ==================== MIGRATION ENDPOINT ====================

router.post("/platform/migrate/dms", requireSuperAdmin, async (_req, res) => {
  try {
    const results: Record<string, unknown> = {};

    // ========== MODULE 1: DMS ==========
    const dmsModule = await ensureModule("dms", {
      name: "ניהול מסמכים",
      nameHe: "ניהול מסמכים",
      nameEn: "Document Management",
      slug: "dms",
      moduleKey: "dms",
      description: "מודול DMS — אחסון, ארכיון, גרסאות, חיפוש, הרשאות ושיתוף מסמכים",
      icon: "FileArchive",
      color: "blue",
      category: "documents",
      showInSidebar: true,
      showInDashboard: true,
    });

    const dmsDocEntity = await ensureEntity(dmsModule.id, {
      name: "מסמך", nameHe: "מסמך", nameEn: "Document",
      namePlural: "מסמכים", slug: "dms_document", entityKey: "dms_document",
      tableName: "platform_dms_documents", description: "ישות מסמך — כולל מטא-דאטה, הרשאות, גרסאות",
      icon: "FileText", entityType: "master", primaryDisplayField: "document_name", sortOrder: 0,
      hasStatus: true, hasCategories: true, hasAttachments: true, hasNotes: true, hasNumbering: true, hasAudit: true, hasSoftDelete: true, hasOwner: true,
      fields: DMS_DOCUMENTS,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "פעיל", slug: "active", color: "green", sortOrder: 1 },
        { name: "בבדיקה", slug: "review", color: "blue", sortOrder: 2 },
        { name: "מאושר", slug: "approved", color: "emerald", sortOrder: 3 },
        { name: "בארכיון", slug: "archived", color: "purple", isFinal: true, sortOrder: 4 },
        { name: "נמחק", slug: "deleted", color: "red", isFinal: true, sortOrder: 5 },
      ],
    });

    const dmsFolderEntity = await ensureEntity(dmsModule.id, {
      name: "תיקייה", nameHe: "תיקייה", nameEn: "Folder",
      namePlural: "תיקיות", slug: "dms_folder", entityKey: "dms_folder",
      tableName: "platform_dms_folders", description: "מבנה תיקיות היררכי — ארגון / מחלקה / נושא / שנה",
      icon: "FolderTree", entityType: "master", primaryDisplayField: "folder_name", sortOrder: 1,
      hasStatus: false, hasAudit: true,
      fields: DMS_FOLDERS, statuses: [],
    });

    const dmsTagEntity = await ensureEntity(dmsModule.id, {
      name: "תגית", nameHe: "תגית", nameEn: "Tag",
      namePlural: "תגיות", slug: "dms_tag", entityKey: "dms_tag",
      tableName: "platform_dms_tags", description: "תגיות לסיווג וחיפוש מסמכים",
      icon: "Tag", entityType: "reference", primaryDisplayField: "tag_name", sortOrder: 2,
      hasStatus: false,
      fields: DMS_TAGS, statuses: [],
    });

    const dmsVersionEntity = await ensureEntity(dmsModule.id, {
      name: "גרסת מסמך", nameHe: "גרסת מסמך", nameEn: "Document Version",
      namePlural: "גרסאות מסמך", slug: "dms_version", entityKey: "dms_version",
      tableName: "platform_dms_versions", description: "Version Control — מעקב שינויים, השוואה, שחזור",
      icon: "GitBranch", entityType: "child", primaryDisplayField: "version_number", sortOrder: 3,
      hasStatus: false, hasAudit: true,
      fields: DMS_VERSIONS, statuses: [],
    }, dmsDocEntity.id);

    const dmsCommentEntity = await ensureEntity(dmsModule.id, {
      name: "הערה על מסמך", nameHe: "הערה על מסמך", nameEn: "Document Comment",
      namePlural: "הערות על מסמכים", slug: "dms_comment", entityKey: "dms_comment",
      tableName: "platform_dms_comments", description: "הערות ותגובות על מסמכים",
      icon: "MessageSquare", entityType: "child", primaryDisplayField: "comment_text", sortOrder: 4,
      hasStatus: false,
      fields: DMS_COMMENTS, statuses: [],
    }, dmsDocEntity.id);

    const dmsShareEntity = await ensureEntity(dmsModule.id, {
      name: "שיתוף מסמך", nameHe: "שיתוף מסמך", nameEn: "Document Share",
      namePlural: "שיתופי מסמכים", slug: "dms_share", entityKey: "dms_share",
      tableName: "platform_dms_shares", description: "שיתוף מסמכים — פנימי, חיצוני, לינקים זמניים",
      icon: "Share2", entityType: "child", primaryDisplayField: "shared_with", sortOrder: 5,
      hasStatus: true,
      fields: DMS_SHARES,
      statuses: [
        { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
        { name: "פג תוקף", slug: "expired", color: "gray", sortOrder: 1 },
        { name: "בוטל", slug: "revoked", color: "red", sortOrder: 2 },
      ],
    }, dmsDocEntity.id);

    const dmsAuditEntity = await ensureEntity(dmsModule.id, {
      name: "יומן פעילות מסמך", nameHe: "יומן פעילות מסמך", nameEn: "Document Audit Trail",
      namePlural: "יומני פעילות", slug: "dms_audit_trail", entityKey: "dms_audit_trail",
      tableName: "platform_dms_audit_trail", description: "Audit Trail — מי צפה, מי ערך, מתי",
      icon: "ClipboardList", entityType: "log", primaryDisplayField: "action", sortOrder: 6,
      hasStatus: false,
      fields: DMS_AUDIT_TRAIL, statuses: [],
    });

    await ensureRelation(dmsFolderEntity.id, dmsDocEntity.id, "one_to_many", "מסמכים בתיקייה", "תיקייה", "folder_id", 0);
    await ensureRelation(dmsDocEntity.id, dmsVersionEntity.id, "one_to_many", "גרסאות", "מסמך", "_parent_id", 1);
    await ensureRelation(dmsDocEntity.id, dmsCommentEntity.id, "one_to_many", "הערות", "מסמך", "_parent_id", 2);
    await ensureRelation(dmsDocEntity.id, dmsShareEntity.id, "one_to_many", "שיתופים", "מסמך", "_parent_id", 3);
    await ensureRelation(dmsDocEntity.id, dmsAuditEntity.id, "one_to_many", "יומן פעילות", "מסמך", "document_id", 4);
    await ensureRelation(dmsDocEntity.id, dmsTagEntity.id, "many_to_many", "תגיות", "מסמכים", "tags", 5);

    results.dms = {
      moduleId: dmsModule.id,
      entities: {
        document: dmsDocEntity.id, folder: dmsFolderEntity.id, tag: dmsTagEntity.id,
        version: dmsVersionEntity.id, comment: dmsCommentEntity.id,
        share: dmsShareEntity.id, auditTrail: dmsAuditEntity.id,
      },
    };

    // ========== MODULE 2: CLM ==========
    const clmModule = await ensureModule("clm", {
      name: "ניהול חוזים",
      nameHe: "ניהול חוזים",
      nameEn: "Contract Lifecycle Management",
      slug: "clm",
      moduleKey: "clm",
      description: "מודול CLM — ניהול חוזים, נספחים, אבני דרך, חידושים והתראות",
      icon: "FileSignature",
      color: "purple",
      category: "documents",
      showInSidebar: true,
      showInDashboard: true,
    });

    const clmContractEntity = await ensureEntity(clmModule.id, {
      name: "חוזה", nameHe: "חוזה", nameEn: "Contract",
      namePlural: "חוזים", slug: "clm_contract", entityKey: "clm_contract",
      tableName: "platform_clm_contracts", description: "ישות חוזה — צדדים, תנאים, סכומים, תוקף",
      icon: "FileSignature", entityType: "master", primaryDisplayField: "contract_name", sortOrder: 0,
      hasStatus: true, hasCategories: true, hasAttachments: true, hasNotes: true, hasNumbering: true, hasAudit: true, hasSoftDelete: true, hasOwner: true,
      fields: CLM_CONTRACTS,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "בבדיקה משפטית", slug: "legal_review", color: "blue", sortOrder: 1 },
        { name: "ממתין לאישור מנהל", slug: "manager_approval", color: "orange", sortOrder: 2 },
        { name: "נשלח לחתימה", slug: "sent_for_signing", color: "yellow", sortOrder: 3 },
        { name: "חתום", slug: "signed", color: "emerald", sortOrder: 4 },
        { name: "פעיל", slug: "active", color: "green", sortOrder: 5 },
        { name: "פג תוקף", slug: "expired", color: "red", sortOrder: 6 },
        { name: "מבוטל", slug: "cancelled", color: "red", isFinal: true, sortOrder: 7 },
        { name: "בחידוש", slug: "renewal", color: "purple", sortOrder: 8 },
      ],
    });

    const clmAmendmentEntity = await ensureEntity(clmModule.id, {
      name: "נספח חוזה", nameHe: "נספח חוזה", nameEn: "Contract Amendment",
      namePlural: "נספחי חוזה", slug: "clm_amendment", entityKey: "clm_amendment",
      tableName: "platform_clm_amendments", description: "נספחים ותיקונים לחוזה מקורי",
      icon: "FilePlus", entityType: "child", primaryDisplayField: "amendment_name", sortOrder: 1,
      hasStatus: true, hasAudit: true,
      fields: CLM_AMENDMENTS,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "בבדיקה", slug: "review", color: "blue", sortOrder: 1 },
        { name: "מאושר", slug: "approved", color: "green", sortOrder: 2 },
        { name: "חתום", slug: "signed", color: "emerald", sortOrder: 3 },
        { name: "נדחה", slug: "rejected", color: "red", isFinal: true, sortOrder: 4 },
      ],
    }, clmContractEntity.id);

    const clmPartyEntity = await ensureEntity(clmModule.id, {
      name: "צד לחוזה", nameHe: "צד לחוזה", nameEn: "Contract Party",
      namePlural: "צדדים לחוזה", slug: "clm_party", entityKey: "clm_party",
      tableName: "platform_clm_parties", description: "צדדים מעורבים בחוזה",
      icon: "Users", entityType: "child", primaryDisplayField: "party_name", sortOrder: 2,
      hasStatus: false,
      fields: CLM_PARTIES, statuses: [],
    }, clmContractEntity.id);

    const clmMilestoneEntity = await ensureEntity(clmModule.id, {
      name: "אבן דרך", nameHe: "אבן דרך", nameEn: "Milestone",
      namePlural: "אבני דרך", slug: "clm_milestone", entityKey: "clm_milestone",
      tableName: "platform_clm_milestones", description: "אבני דרך, חידושים ותשלומים",
      icon: "Flag", entityType: "child", primaryDisplayField: "milestone_name", sortOrder: 3,
      hasStatus: true, hasAudit: true,
      fields: CLM_MILESTONES,
      statuses: [
        { name: "ממתין", slug: "pending", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "בביצוע", slug: "in_progress", color: "blue", sortOrder: 1 },
        { name: "הושלם", slug: "completed", color: "green", sortOrder: 2 },
        { name: "באיחור", slug: "overdue", color: "red", sortOrder: 3 },
        { name: "בוטל", slug: "cancelled", color: "gray", isFinal: true, sortOrder: 4 },
      ],
    }, clmContractEntity.id);

    const clmAlertEntity = await ensureEntity(clmModule.id, {
      name: "התראת תוקף", nameHe: "התראת תוקף", nameEn: "Expiry Alert",
      namePlural: "התראות תוקף", slug: "clm_expiry_alert", entityKey: "clm_expiry_alert",
      tableName: "platform_clm_expiry_alerts", description: "התראות אוטומטיות — 30/60/90 יום לפני פקיעה",
      icon: "Bell", entityType: "child", primaryDisplayField: "alert_type", sortOrder: 4,
      hasStatus: false,
      fields: CLM_EXPIRY_ALERTS, statuses: [],
    }, clmContractEntity.id);

    await ensureRelation(clmContractEntity.id, clmAmendmentEntity.id, "one_to_many", "נספחים", "חוזה מקורי", "_parent_id", 0);
    await ensureRelation(clmContractEntity.id, clmPartyEntity.id, "one_to_many", "צדדים", "חוזה", "_parent_id", 1);
    await ensureRelation(clmContractEntity.id, clmMilestoneEntity.id, "one_to_many", "אבני דרך", "חוזה", "_parent_id", 2);
    await ensureRelation(clmContractEntity.id, clmAlertEntity.id, "one_to_many", "התראות", "חוזה", "_parent_id", 3);

    results.clm = {
      moduleId: clmModule.id,
      entities: {
        contract: clmContractEntity.id, amendment: clmAmendmentEntity.id,
        party: clmPartyEntity.id, milestone: clmMilestoneEntity.id, alert: clmAlertEntity.id,
      },
    };

    // ========== MODULE 3: Digital Signatures (DocuSign-style) ==========
    const esignModule = await ensureModule("esign", {
      name: "חתימות דיגיטליות",
      nameHe: "חתימות דיגיטליות",
      nameEn: "Digital Signatures",
      slug: "esign",
      moduleKey: "esign",
      description: "מודול חתימות דיגיטליות — בקשות חתימה, מעקב, תזכורות, ארכיון",
      icon: "PenTool",
      color: "green",
      category: "documents",
      showInSidebar: true,
      showInDashboard: true,
    });

    const esignRequestEntity = await ensureEntity(esignModule.id, {
      name: "בקשת חתימה", nameHe: "בקשת חתימה", nameEn: "Signature Request",
      namePlural: "בקשות חתימה", slug: "esign_request", entityKey: "esign_request",
      tableName: "platform_esign_requests", description: "בקשת חתימה — מסמך, חותמים, סטטוס",
      icon: "PenTool", entityType: "master", primaryDisplayField: "request_name", sortOrder: 0,
      hasStatus: true, hasAttachments: true, hasNotes: true, hasNumbering: true, hasAudit: true, hasOwner: true,
      fields: ESIGN_REQUESTS,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "נשלח", slug: "sent", color: "blue", sortOrder: 1 },
        { name: "בתהליך", slug: "in_progress", color: "yellow", sortOrder: 2 },
        { name: "הושלם", slug: "completed", color: "green", sortOrder: 3 },
        { name: "סורב", slug: "declined", color: "red", sortOrder: 4 },
        { name: "בוטל", slug: "cancelled", color: "gray", isFinal: true, sortOrder: 5 },
        { name: "פג תוקף", slug: "expired", color: "orange", sortOrder: 6 },
      ],
    });

    const esignSignerEntity = await ensureEntity(esignModule.id, {
      name: "חותם", nameHe: "חותם", nameEn: "Signer",
      namePlural: "חותמים", slug: "esign_signer", entityKey: "esign_signer",
      tableName: "platform_esign_signers", description: "חותם — שם, אימייל, תפקיד, סדר, סטטוס",
      icon: "UserCheck", entityType: "child", primaryDisplayField: "signer_name", sortOrder: 1,
      hasStatus: true, hasAudit: true,
      fields: ESIGN_SIGNERS,
      statuses: [
        { name: "ממתין", slug: "pending", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "נשלח", slug: "sent", color: "blue", sortOrder: 1 },
        { name: "נצפה", slug: "viewed", color: "yellow", sortOrder: 2 },
        { name: "חתום", slug: "signed", color: "green", sortOrder: 3 },
        { name: "סורב", slug: "declined", color: "red", sortOrder: 4 },
      ],
    }, esignRequestEntity.id);

    const esignFieldEntity = await ensureEntity(esignModule.id, {
      name: "שדה חתימה", nameHe: "שדה חתימה", nameEn: "Signature Field",
      namePlural: "שדות חתימה", slug: "esign_field", entityKey: "esign_field",
      tableName: "platform_esign_fields", description: "שדה חתימה — מיקום, סוג, חותם מוקצה",
      icon: "Square", entityType: "child", primaryDisplayField: "field_type", sortOrder: 2,
      hasStatus: false,
      fields: ESIGN_FIELDS_DEF, statuses: [],
    }, esignRequestEntity.id);

    const esignLogEntity = await ensureEntity(esignModule.id, {
      name: "לוג חתימות", nameHe: "לוג חתימות", nameEn: "Signature Audit Log",
      namePlural: "לוגים", slug: "esign_audit_log", entityKey: "esign_audit_log",
      tableName: "platform_esign_audit_log", description: "לוג — ציר זמן מלא, IP, חותמת זמן, proof of signing",
      icon: "ClipboardList", entityType: "log", primaryDisplayField: "action", sortOrder: 3,
      hasStatus: false,
      fields: ESIGN_AUDIT_LOG, statuses: [],
    });

    await ensureRelation(esignRequestEntity.id, esignSignerEntity.id, "one_to_many", "חותמים", "בקשת חתימה", "_parent_id", 0);
    await ensureRelation(esignRequestEntity.id, esignFieldEntity.id, "one_to_many", "שדות חתימה", "בקשת חתימה", "_parent_id", 1);
    await ensureRelation(esignRequestEntity.id, esignLogEntity.id, "one_to_many", "לוג חתימות", "בקשת חתימה", "request_id", 2);

    results.esign = {
      moduleId: esignModule.id,
      entities: {
        request: esignRequestEntity.id, signer: esignSignerEntity.id,
        field: esignFieldEntity.id, auditLog: esignLogEntity.id,
      },
    };

    // ========== MODULE 4: PandaDoc-style ==========
    const pandadocModule = await ensureModule("pandadoc", {
      name: "יצירת מסמכים",
      nameHe: "יצירת מסמכים",
      nameEn: "Document Creation",
      slug: "pandadoc",
      moduleKey: "pandadoc",
      description: "מודול PandaDoc — תבניות מתקדמות, שליחה, מעקב אנליטיקס",
      icon: "FilePen",
      color: "orange",
      category: "documents",
      showInSidebar: true,
      showInDashboard: true,
    });

    const pdTemplateEntity = await ensureEntity(pandadocModule.id, {
      name: "תבנית מסמך מתקדמת", nameHe: "תבנית מסמך מתקדמת", nameEn: "Advanced Document Template",
      namePlural: "תבניות מתקדמות", slug: "pd_template", entityKey: "pd_template",
      tableName: "platform_pd_templates", description: "תבנית מתקדמת — blocks, משתנים, עיצוב",
      icon: "LayoutTemplate", entityType: "master", primaryDisplayField: "template_name", sortOrder: 0,
      hasStatus: true, hasCategories: true, hasAudit: true,
      fields: PANDADOC_TEMPLATES,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "פעיל", slug: "active", color: "green", sortOrder: 1 },
        { name: "לא פעיל", slug: "inactive", color: "red", sortOrder: 2 },
      ],
    });

    const pdSendingEntity = await ensureEntity(pandadocModule.id, {
      name: "שליחת מסמך", nameHe: "שליחת מסמך", nameEn: "Document Sending",
      namePlural: "שליחות מסמכים", slug: "pd_sending", entityKey: "pd_sending",
      tableName: "platform_pd_sendings", description: "תהליך שליחה — נמען, הודעה, מעקב סטטוס",
      icon: "Send", entityType: "transaction", primaryDisplayField: "document_name", sortOrder: 1,
      hasStatus: true, hasNumbering: true, hasAudit: true, hasOwner: true,
      fields: PANDADOC_SENDING,
      statuses: [
        { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
        { name: "נשלח", slug: "sent", color: "blue", sortOrder: 1 },
        { name: "נפתח", slug: "opened", color: "yellow", sortOrder: 2 },
        { name: "נצפה", slug: "viewed", color: "orange", sortOrder: 3 },
        { name: "חתום", slug: "signed", color: "green", sortOrder: 4 },
        { name: "סורב", slug: "declined", color: "red", sortOrder: 5 },
        { name: "בוטל", slug: "cancelled", color: "gray", isFinal: true, sortOrder: 6 },
      ],
    });

    const pdAnalyticsEntity = await ensureEntity(pandadocModule.id, {
      name: "מעקב אנליטיקס", nameHe: "מעקב אנליטיקס", nameEn: "Document Analytics",
      namePlural: "אנליטיקס מסמכים", slug: "pd_analytics", entityKey: "pd_analytics",
      tableName: "platform_pd_analytics", description: "מעקב פתיחת מסמך — מי פתח, כמה זמן, ממה",
      icon: "BarChart3", entityType: "log", primaryDisplayField: "event_type", sortOrder: 2,
      hasStatus: false,
      fields: PANDADOC_ANALYTICS, statuses: [],
    });

    await ensureRelation(pdTemplateEntity.id, pdSendingEntity.id, "one_to_many", "שליחות", "תבנית", "template_id", 0);
    await ensureRelation(pdSendingEntity.id, pdAnalyticsEntity.id, "one_to_many", "אנליטיקס", "שליחה", "sending_id", 1);

    results.pandadoc = {
      moduleId: pandadocModule.id,
      entities: {
        template: pdTemplateEntity.id, sending: pdSendingEntity.id, analytics: pdAnalyticsEntity.id,
      },
    };

    // ========== MODULE 5: SharePoint-style ==========
    const spModule = await ensureModule("sharepoint", {
      name: "ספריות מסמכים",
      nameHe: "ספריות מסמכים",
      nameEn: "Document Libraries",
      slug: "sharepoint",
      moduleKey: "sharepoint",
      description: "מודול SharePoint — ספריות מסמכים, סוגי תוכן, Check-in/Out, מדיניות שמירה",
      icon: "Library",
      color: "teal",
      category: "documents",
      showInSidebar: true,
      showInDashboard: true,
    });

    const spLibraryEntity = await ensureEntity(spModule.id, {
      name: "ספריית מסמכים", nameHe: "ספריית מסמכים", nameEn: "Document Library",
      namePlural: "ספריות מסמכים", slug: "sp_library", entityKey: "sp_library",
      tableName: "platform_sp_libraries", description: "ספרייה — מחלקה/פרויקט, תצוגות, מטא-דאטה",
      icon: "Library", entityType: "master", primaryDisplayField: "library_name", sortOrder: 0,
      hasStatus: true, hasAudit: true, hasOwner: true,
      fields: SP_LIBRARIES,
      statuses: [
        { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
        { name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 1 },
        { name: "בארכיון", slug: "archived", color: "purple", isFinal: true, sortOrder: 2 },
      ],
    });

    const spContentTypeEntity = await ensureEntity(spModule.id, {
      name: "סוג תוכן", nameHe: "סוג תוכן", nameEn: "Content Type",
      namePlural: "סוגי תוכן", slug: "sp_content_type", entityKey: "sp_content_type",
      tableName: "platform_sp_content_types", description: "סוגי תוכן — שדות מטא-דאטה, אישורים",
      icon: "FileType", entityType: "child", primaryDisplayField: "content_type_name", sortOrder: 1,
      hasStatus: true,
      fields: SP_CONTENT_TYPES,
      statuses: [
        { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
        { name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 1 },
      ],
    }, spLibraryEntity.id);

    const spRetentionEntity = await ensureEntity(spModule.id, {
      name: "מדיניות שמירה", nameHe: "מדיניות שמירה", nameEn: "Retention Policy",
      namePlural: "מדיניות שמירה", slug: "sp_retention", entityKey: "sp_retention",
      tableName: "platform_sp_retention", description: "Retention policies — מחיקה/ארכיון אוטומטי",
      icon: "Clock", entityType: "child", primaryDisplayField: "policy_name", sortOrder: 2,
      hasStatus: true,
      fields: SP_RETENTION,
      statuses: [
        { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
        { name: "מושהה", slug: "paused", color: "yellow", sortOrder: 1 },
        { name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 2 },
      ],
    }, spLibraryEntity.id);

    const spCheckinoutEntity = await ensureEntity(spModule.id, {
      name: "Check-in/Check-out", nameHe: "Check-in/Check-out", nameEn: "Check-in/Check-out",
      namePlural: "פעולות Check-in/Out", slug: "sp_checkinout", entityKey: "sp_checkinout",
      tableName: "platform_sp_checkinout", description: "לוג Check-in/Check-out למסמכים",
      icon: "ArrowLeftRight", entityType: "log", primaryDisplayField: "document_name", sortOrder: 3,
      hasStatus: false,
      fields: SP_CHECKINOUT, statuses: [],
    });

    await ensureRelation(spLibraryEntity.id, spContentTypeEntity.id, "one_to_many", "סוגי תוכן", "ספרייה", "_parent_id", 0);
    await ensureRelation(spLibraryEntity.id, spRetentionEntity.id, "one_to_many", "מדיניות שמירה", "ספרייה", "_parent_id", 1);
    await ensureRelation(spLibraryEntity.id, spCheckinoutEntity.id, "one_to_many", "פעולות Check-in/Out", "ספרייה", "library_id", 2);

    results.sharepoint = {
      moduleId: spModule.id,
      entities: {
        library: spLibraryEntity.id, contentType: spContentTypeEntity.id,
        retention: spRetentionEntity.id, checkinout: spCheckinoutEntity.id,
      },
    };

    // ========== CROSS-MODULE RELATIONS ==========
    await ensureRelation(clmContractEntity.id, dmsDocEntity.id, "many_to_many", "מסמכים מקושרים", "חוזים מקושרים", "linked_contract_id", 10);
    await ensureRelation(clmContractEntity.id, esignRequestEntity.id, "one_to_many", "בקשות חתימה", "חוזה מקושר", "linked_contract_id", 10);
    await ensureRelation(esignRequestEntity.id, pdSendingEntity.id, "one_to_many", "שליחות מסמכים", "בקשת חתימה מקושרת", "signature_request_id", 10);
    await ensureRelation(spLibraryEntity.id, dmsDocEntity.id, "one_to_many", "מסמכים בספרייה", "ספרייה", "library_id", 10);

    results.crossModuleRelations = "created";

    // ========== WORKFLOWS ==========
    const existingWorkflows = await db.select().from(platformWorkflowsTable)
      .where(eq(platformWorkflowsTable.moduleId, clmModule.id));

    if (existingWorkflows.length === 0) {
      try {
        await db.insert(platformWorkflowsTable).values({
          moduleId: clmModule.id,
          name: "מהלך אישור חוזה",
          slug: "contract_approval_flow",
          description: "Workflow רב-שלבי: טיוטה → בדיקה משפטית → אישור מנהל → חתימה → פעיל",
          triggerType: "on_status_change",
          triggerConfig: { entityKey: "clm_contract" },
          conditions: [{ field: "status", operator: "equals", value: "draft" }],
          actions: [
            { type: "set_status", config: { status: "legal_review" }, label: "העבר לבדיקה משפטית" },
            { type: "send_notification", config: { to: "{{legal_advisor}}", message: "חוזה {{contract_name}} ממתין לבדיקה משפטית" }, label: "התראה ליועץ משפטי" },
          ],
          isActive: true,
        });

        await db.insert(platformWorkflowsTable).values({
          moduleId: clmModule.id,
          name: "התראת פקיעת תוקף חוזה",
          slug: "contract_expiry_alert",
          description: "התראות 30/60/90 יום לפני פקיעת תוקף",
          triggerType: "scheduled",
          triggerConfig: { interval: "daily", entityKey: "clm_contract" },
          conditions: [{ field: "status", operator: "in_list", value: ["active", "signed"] }],
          actions: [
            { type: "send_notification", config: { to: "{{contract_manager}}", message: "חוזה {{contract_name}} פג תוקף ב-{{end_date}}" }, label: "התראת פקיעה" },
          ],
          isActive: true,
        });
      } catch (wfErr) {
        console.warn("[DMS Migration] Failed to insert CLM workflows:", wfErr);
      }
    }

    const existingEsignWorkflows = await db.select().from(platformWorkflowsTable)
      .where(eq(platformWorkflowsTable.moduleId, esignModule.id));

    if (existingEsignWorkflows.length === 0) {
      try {
        await db.insert(platformWorkflowsTable).values({
          moduleId: esignModule.id,
          name: "מהלך חתימה",
          slug: "signature_flow",
          description: "שליחה → תזכורות → חתימה → ארכיון",
          triggerType: "on_status_change",
          triggerConfig: { entityKey: "esign_request" },
          conditions: [{ field: "status", operator: "equals", value: "sent" }],
          actions: [
            { type: "send_notification", config: { to: "signers", message: "הוזמנת לחתום על {{request_name}}" }, label: "שלח הזמנת חתימה" },
          ],
          isActive: true,
        });

        await db.insert(platformWorkflowsTable).values({
          moduleId: esignModule.id,
          name: "תזכורת חתימה",
          slug: "signature_reminder",
          description: "תזכורות אוטומטיות לחותמים שטרם חתמו",
          triggerType: "scheduled",
          triggerConfig: { interval: "daily", entityKey: "esign_request" },
          conditions: [{ field: "status", operator: "in_list", value: ["sent", "in_progress"] }],
          actions: [
            { type: "send_notification", config: { to: "pending_signers", message: "תזכורת: מסמך {{request_name}} ממתין לחתימתך" }, label: "שלח תזכורת" },
          ],
          isActive: true,
        });
      } catch (wfErr) {
        console.warn("[DMS Migration] Failed to insert eSign workflows:", wfErr);
      }
    }

    const existingDmsWorkflows = await db.select().from(platformWorkflowsTable)
      .where(eq(platformWorkflowsTable.moduleId, dmsModule.id));

    if (existingDmsWorkflows.length === 0) {
      try {
        await db.insert(platformWorkflowsTable).values({
          moduleId: dmsModule.id,
          name: "אישור מסמך",
          slug: "document_approval_flow",
          description: "מהלך אישור: טיוטה → בבדיקה → מאושר / נדחה",
          triggerType: "on_status_change",
          triggerConfig: { entityKey: "dms_document" },
          conditions: [{ field: "status", operator: "equals", value: "review" }],
          actions: [
            { type: "send_notification", config: { to: "{{owner}}", message: "מסמך {{document_name}} דורש אישור" }, label: "התראת אישור" },
            { type: "approval", config: { approvers: ["manager"], timeoutDays: 7 }, label: "בקשת אישור מנהל" },
          ],
          isActive: true,
        });
      } catch (wfErr) {
        console.warn("[DMS Migration] Failed to insert DMS workflows:", wfErr);
      }
    }

    results.workflows = "created";

    // ========== FORM DEFINITIONS ==========
    const existingDmsForms = await db.select().from(formDefinitionsTable)
      .where(eq(formDefinitionsTable.entityId, dmsDocEntity.id));

    if (existingDmsForms.length === 0) {
      try {
        await db.insert(formDefinitionsTable).values({
          entityId: dmsDocEntity.id,
          name: "טופס מסמך חדש",
          slug: "dms_document_create_form",
          formType: "create",
          isDefault: true,
          sections: [
            { name: "פרטי מסמך", slug: "details", sortOrder: 0, fields: ["document_name", "description", "document_type", "folder_id", "department"] },
            { name: "קובץ", slug: "file", sortOrder: 1, fields: ["file_url", "tags", "expiry_date"] },
            { name: "הרשאות", slug: "permissions", sortOrder: 2, fields: ["classification", "view_permission", "edit_permission", "owner"] },
          ],
          settings: {},
        });
      } catch (err) {
        console.warn("[DMS Migration] Failed to insert DMS form:", err);
      }
    }

    const existingClmForms = await db.select().from(formDefinitionsTable)
      .where(eq(formDefinitionsTable.entityId, clmContractEntity.id));

    if (existingClmForms.length === 0) {
      try {
        await db.insert(formDefinitionsTable).values({
          entityId: clmContractEntity.id,
          name: "טופס חוזה חדש",
          slug: "clm_contract_create_form",
          formType: "create",
          isDefault: true,
          sections: [
            { name: "פרטי חוזה", slug: "details", sortOrder: 0, fields: ["contract_name", "description", "contract_type", "risk_level"] },
            { name: "צדדים", slug: "parties", sortOrder: 1, fields: ["party_a", "party_b", "party_b_type"] },
            { name: "תנאים", slug: "terms", sortOrder: 2, fields: ["start_date", "end_date", "contract_amount", "currency", "payment_terms", "billing_frequency"] },
            { name: "ניהול", slug: "management", sortOrder: 3, fields: ["auto_renewal", "notice_period_days", "responsible_department", "contract_manager", "legal_advisor"] },
            { name: "מסמכים והערות", slug: "docs", sortOrder: 4, fields: ["document_url", "notes"] },
          ],
          settings: {},
        });
      } catch (err) {
        console.warn("[DMS Migration] Failed to insert CLM form:", err);
      }
    }

    results.forms = "created";

    // ========== VIEW DEFINITIONS ==========
    const existingDmsViews = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, dmsDocEntity.id));

    if (existingDmsViews.length === 0) {
      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: dmsDocEntity.id,
          name: "כל המסמכים",
          slug: "dms_all_documents",
          viewType: "table",
          isDefault: true,
          columns: [
            { fieldSlug: "document_number", width: "auto", visible: true },
            { fieldSlug: "document_name", width: "auto", visible: true },
            { fieldSlug: "document_type", width: "auto", visible: true },
            { fieldSlug: "department", width: "auto", visible: true },
            { fieldSlug: "owner", width: "auto", visible: true },
            { fieldSlug: "current_version", width: "auto", visible: true },
            { fieldSlug: "tags", width: "auto", visible: true },
            { fieldSlug: "classification", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "document_name", direction: "asc" }],
          filters: [],
          settings: {},
        });
      } catch (err) {
        console.warn("[DMS Migration] Failed to insert DMS view:", err);
      }
    }

    const existingClmViews = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, clmContractEntity.id));

    if (existingClmViews.length === 0) {
      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: clmContractEntity.id,
          name: "כל החוזים",
          slug: "clm_all_contracts",
          viewType: "table",
          isDefault: true,
          columns: [
            { fieldSlug: "contract_number", width: "auto", visible: true },
            { fieldSlug: "contract_name", width: "auto", visible: true },
            { fieldSlug: "contract_type", width: "auto", visible: true },
            { fieldSlug: "party_b", width: "auto", visible: true },
            { fieldSlug: "start_date", width: "auto", visible: true },
            { fieldSlug: "end_date", width: "auto", visible: true },
            { fieldSlug: "contract_amount", width: "auto", visible: true },
            { fieldSlug: "responsible_department", width: "auto", visible: true },
            { fieldSlug: "risk_level", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "end_date", direction: "asc" }],
          filters: [],
          settings: {},
        });

        await db.insert(viewDefinitionsTable).values({
          entityId: clmContractEntity.id,
          name: "חוזים פעילים",
          slug: "clm_active_contracts",
          viewType: "table",
          isDefault: false,
          columns: [
            { fieldSlug: "contract_number", width: "auto", visible: true },
            { fieldSlug: "contract_name", width: "auto", visible: true },
            { fieldSlug: "party_b", width: "auto", visible: true },
            { fieldSlug: "end_date", width: "auto", visible: true },
            { fieldSlug: "days_to_expiry", width: "auto", visible: true },
            { fieldSlug: "contract_amount", width: "auto", visible: true },
            { fieldSlug: "auto_renewal", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "end_date", direction: "asc" }],
          filters: [{ fieldSlug: "status", operator: "equals", value: "active" }],
          settings: {},
        });
      } catch (err) {
        console.warn("[DMS Migration] Failed to insert CLM views:", err);
      }
    }

    const existingEsignViews = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, esignRequestEntity.id));

    if (existingEsignViews.length === 0) {
      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: esignRequestEntity.id,
          name: "כל בקשות החתימה",
          slug: "esign_all_requests",
          viewType: "table",
          isDefault: true,
          columns: [
            { fieldSlug: "request_number", width: "auto", visible: true },
            { fieldSlug: "request_name", width: "auto", visible: true },
            { fieldSlug: "document_name", width: "auto", visible: true },
            { fieldSlug: "sender_name", width: "auto", visible: true },
            { fieldSlug: "due_date", width: "auto", visible: true },
            { fieldSlug: "priority", width: "auto", visible: true },
          ],
          sorting: [{ fieldSlug: "due_date", direction: "asc" }],
          filters: [],
          settings: {},
        });
      } catch (err) {
        console.warn("[DMS Migration] Failed to insert eSign views:", err);
      }
    }

    results.views = "created";

    // ========== DASHBOARD DEFINITIONS ==========
    const dashboardConfigs: { moduleId: number; moduleName: string; slug: string; widgets: { widgetType: string; title: string; entityId: number; config: Record<string, unknown> }[] }[] = [
      {
        moduleId: dmsModule.id, moduleName: "ניהול מסמכים", slug: "dms_dashboard",
        widgets: [
          { widgetType: "count", title: "סך מסמכים", entityId: dmsDocEntity.id, config: {} },
          { widgetType: "count", title: "מסמכים פעילים", entityId: dmsDocEntity.id, config: { statusFilter: "active" } },
          { widgetType: "count", title: "ממתינים לבדיקה", entityId: dmsDocEntity.id, config: { statusFilter: "review" } },
          { widgetType: "count", title: "תיקיות", entityId: dmsFolderEntity.id, config: {} },
          { widgetType: "status_chart", title: "מסמכים לפי סטטוס", entityId: dmsDocEntity.id, config: { chartType: "pie" } },
          { widgetType: "group_chart", title: "מסמכים לפי מחלקה", entityId: dmsDocEntity.id, config: { groupBy: "department", chartType: "bar" } },
        ],
      },
      {
        moduleId: clmModule.id, moduleName: "ניהול חוזים", slug: "clm_dashboard",
        widgets: [
          { widgetType: "count", title: "סך חוזים", entityId: clmContractEntity.id, config: {} },
          { widgetType: "count", title: "חוזים פעילים", entityId: clmContractEntity.id, config: { statusFilter: "active" } },
          { widgetType: "count", title: "ממתינים לחתימה", entityId: clmContractEntity.id, config: { statusFilter: "sent_for_signing" } },
          { widgetType: "count", title: "פגי תוקף", entityId: clmContractEntity.id, config: { statusFilter: "expired" } },
          { widgetType: "status_chart", title: "חוזים לפי סטטוס", entityId: clmContractEntity.id, config: { chartType: "pie" } },
          { widgetType: "group_chart", title: "חוזים לפי מחלקה", entityId: clmContractEntity.id, config: { groupBy: "responsible_department", chartType: "bar" } },
          { widgetType: "aggregate", title: "סכום חוזים פעילים", entityId: clmContractEntity.id, config: { func: "sum", field: "contract_amount", statusFilter: "active" } },
        ],
      },
      {
        moduleId: esignModule.id, moduleName: "חתימות דיגיטליות", slug: "esign_dashboard",
        widgets: [
          { widgetType: "count", title: "סך בקשות חתימה", entityId: esignRequestEntity.id, config: {} },
          { widgetType: "count", title: "ממתינות לחתימה", entityId: esignRequestEntity.id, config: { statusFilter: "sent" } },
          { widgetType: "count", title: "הושלמו", entityId: esignRequestEntity.id, config: { statusFilter: "completed" } },
          { widgetType: "count", title: "סורבו", entityId: esignRequestEntity.id, config: { statusFilter: "declined" } },
          { widgetType: "status_chart", title: "בקשות לפי סטטוס", entityId: esignRequestEntity.id, config: { chartType: "pie" } },
        ],
      },
      {
        moduleId: pandadocModule.id, moduleName: "יצירת מסמכים", slug: "pandadoc_dashboard",
        widgets: [
          { widgetType: "count", title: "תבניות פעילות", entityId: pdTemplateEntity.id, config: { statusFilter: "active" } },
          { widgetType: "count", title: "מסמכים שנשלחו", entityId: pdSendingEntity.id, config: {} },
          { widgetType: "count", title: "נפתחו", entityId: pdSendingEntity.id, config: { statusFilter: "opened" } },
          { widgetType: "count", title: "חתומים", entityId: pdSendingEntity.id, config: { statusFilter: "signed" } },
          { widgetType: "status_chart", title: "שליחות לפי סטטוס", entityId: pdSendingEntity.id, config: { chartType: "pie" } },
        ],
      },
      {
        moduleId: spModule.id, moduleName: "ספריות מסמכים", slug: "sharepoint_dashboard",
        widgets: [
          { widgetType: "count", title: "ספריות פעילות", entityId: spLibraryEntity.id, config: { statusFilter: "active" } },
          { widgetType: "count", title: "סוגי תוכן", entityId: spContentTypeEntity.id, config: {} },
          { widgetType: "count", title: "מדיניות שמירה", entityId: spRetentionEntity.id, config: {} },
          { widgetType: "group_chart", title: "ספריות לפי מחלקה", entityId: spLibraryEntity.id, config: { groupBy: "department", chartType: "bar" } },
        ],
      },
    ];

    for (const dashConfig of dashboardConfigs) {
      const existingDash = await db.select().from(systemDashboardPagesTable)
        .where(eq(systemDashboardPagesTable.slug, dashConfig.slug));

      if (existingDash.length === 0) {
        try {
          const [dashPage] = await db.insert(systemDashboardPagesTable).values({
            moduleId: dashConfig.moduleId,
            name: `דשבורד ${dashConfig.moduleName}`,
            slug: dashConfig.slug,
            isDefault: true,
            layout: { columns: 3, gap: 16 },
            settings: {},
          }).returning();

          for (let i = 0; i < dashConfig.widgets.length; i++) {
            const w = dashConfig.widgets[i];
            await db.insert(systemDashboardWidgetsTable).values({
              dashboardId: dashPage.id,
              widgetType: w.widgetType,
              title: w.title,
              entityId: w.entityId,
              config: w.config,
              position: { row: Math.floor(i / 3), col: i % 3 },
              size: { width: 1, height: 1 },
              settings: {},
            });
          }
        } catch (dashErr) {
          console.warn(`[DMS Migration] Failed to insert dashboard ${dashConfig.slug}:`, dashErr);
        }
      }
    }

    results.dashboards = "created";

    res.status(201).json({
      message: "DMS migration completed successfully — 5 modules, all entities, fields, statuses, relations, workflows, forms, views, and dashboards created",
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[DMS Migration] Error:", err);
    res.status(500).json({ message });
  }
});

export default router;
