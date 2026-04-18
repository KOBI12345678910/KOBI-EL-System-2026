import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityStatusesTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { resolveUserPermissions } from "../lib/permission-engine";

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
  groupName?: string;
  relatedEntityId?: number;
  relatedDisplayField?: string;
  relationType?: string;
}

const CUSTOMER_EXTRA_FIELDS: FieldDef[] = [
  { name: "פילוח לקוח", slug: "customer_segment", fieldKey: "customer_segment", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["פרטי", "מוסדי", "אדריכלים-מעצבים"], sortOrder: 50, groupName: "CRM" },
  { name: "אסטרטגיית שירות", slug: "service_strategy", fieldKey: "service_strategy", fieldType: "single_select", showInList: false, showInForm: true, showInDetail: true, options: ["סטנדרטי", "פרימיום", "VIP"], sortOrder: 51, groupName: "CRM" },
  { name: "מקור ליד", slug: "lead_source", fieldKey: "lead_source", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["אתר", "טלפון", "הפניה", "פייסבוק", "גוגל", "תערוכה", "סוכן שטח", "אחר"], sortOrder: 52, groupName: "CRM" },
  { name: "שלב במשפך", slug: "funnel_stage", fieldKey: "funnel_stage", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["ליד חדש", "נוצר קשר", "מוסמך", "הצעה נשלחה", "משא ומתן", "לקוח פעיל"], sortOrder: 53, groupName: "CRM" },
  { name: "היסטוריית קשר", slug: "contact_history", fieldKey: "contact_history", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 54, groupName: "CRM" },
  { name: "שווי מצטבר (LTV)", slug: "lifetime_value", fieldKey: "lifetime_value", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 55, groupName: "CRM", settings: { suffix: "₪", format: "currency" } },
  { name: "דירוג סיכון", slug: "risk_level", fieldKey: "risk_level", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["low", "medium", "high", "critical"], sortOrder: 56, groupName: "CRM" },
  { name: "יתרת חוב פתוח", slug: "outstanding_balance", fieldKey: "outstanding_balance", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 57, groupName: "CRM", settings: { suffix: "₪", format: "currency" } },
  { name: "תנאי תשלום", slug: "payment_terms", fieldKey: "payment_terms", fieldType: "single_select", showInList: false, showInForm: true, showInDetail: true, options: ["מזומן", "שוטף 30", "שוטף 60", "שוטף 90", "שוטף +30"], sortOrder: 58, groupName: "CRM" },
  { name: "תאריך קשר אחרון", slug: "last_contact_date", fieldKey: "last_contact_date", fieldType: "date", showInList: false, showInForm: true, showInDetail: true, sortOrder: 59, groupName: "CRM" },
  { name: "סוכן מטפל", slug: "assigned_agent", fieldKey: "assigned_agent", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 60, groupName: "CRM" },
];

const QUOTE_EXTRA_FIELDS: FieldDef[] = [
  { name: "פריטי הצעה (JSON)", slug: "line_items", fieldKey: "line_items", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 50, groupName: "פריטים", settings: { isJson: true, hint: "מערך פריטים: [{description, quantity, unit_price, discount, total}]" } },
  { name: "סה״כ לפני מע״מ", slug: "subtotal", fieldKey: "subtotal", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 51, groupName: "סיכום", settings: { suffix: "₪", format: "currency" } },
  { name: "מע״מ", slug: "vat_amount", fieldKey: "vat_amount", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 52, groupName: "סיכום", settings: { suffix: "₪" } },
  { name: "סה״כ כולל מע״מ", slug: "total_amount", fieldKey: "total_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 53, groupName: "סיכום", settings: { suffix: "₪", format: "currency" } },
  { name: "מרווח גולמי %", slug: "margin_percent", fieldKey: "margin_percent", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 54, groupName: "סיכום", settings: { suffix: "%" } },
  { name: "עלות חומרים", slug: "material_cost", fieldKey: "material_cost", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 55, groupName: "עלויות", settings: { suffix: "₪" } },
  { name: "עלות עבודה", slug: "labor_cost", fieldKey: "labor_cost", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 56, groupName: "עלויות", settings: { suffix: "₪" } },
  { name: "מחירון בסיס", slug: "price_list_ref", fieldKey: "price_list_ref", fieldType: "text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 57, groupName: "תמחור" },
  { name: "סטטוס אישור", slug: "approval_status", fieldKey: "approval_status", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["ממתין", "מאושר ע״י מנהל", "נדחה", "בתוקף"], sortOrder: 58, groupName: "אישור" },
  { name: "מאושר ע״י", slug: "approved_by", fieldKey: "approved_by", fieldType: "text", showInList: false, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 59, groupName: "אישור" },
  { name: "תאריך אישור", slug: "approval_date", fieldKey: "approval_date", fieldType: "date", showInList: false, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 60, groupName: "אישור" },
  { name: "חתימה דיגיטלית", slug: "digital_signature", fieldKey: "digital_signature", fieldType: "text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 61, groupName: "אישור", settings: { hint: "שם החותם / קישור לחתימה" } },
  { name: "תוקף הצעה", slug: "valid_until", fieldKey: "valid_until", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 62, groupName: "אישור" },
  { name: "הצעה פגת תוקף", slug: "is_expired", fieldKey: "is_expired", fieldType: "formula", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 63, groupName: "אישור", formulaExpression: "valid_until && new Date(valid_until) < new Date() ? 'כן' : 'לא'" },
];

const INVOICE_EXTRA_FIELDS: FieldDef[] = [
  { name: "פריטים (JSON)", slug: "line_items", fieldKey: "line_items", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 50, groupName: "פריטים", settings: { isJson: true } },
  { name: "סה״כ חשבונית", slug: "total_amount", fieldKey: "total_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 51, groupName: "סיכום", settings: { suffix: "₪", format: "currency" } },
  { name: "סכום ששולם", slug: "paid_amount", fieldKey: "paid_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 52, groupName: "תשלום", settings: { suffix: "₪", format: "currency" } },
  { name: "יתרה לתשלום", slug: "balance_due", fieldKey: "balance_due", fieldType: "number", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 53, groupName: "תשלום", formulaExpression: "(total_amount || 0) - (paid_amount || 0)", settings: { suffix: "₪" } },
  { name: "תנאי תשלום", slug: "payment_terms", fieldKey: "payment_terms", fieldType: "single_select", showInList: false, showInForm: true, showInDetail: true, options: ["מזומן", "שוטף 30", "שוטף 60", "שוטף 90"], sortOrder: 54, groupName: "תשלום" },
  { name: "תאריך פירעון", slug: "due_date", fieldKey: "due_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 55, groupName: "תשלום" },
  { name: "גיול (ימים)", slug: "aging_days", fieldKey: "aging_days", fieldType: "formula", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 56, groupName: "תשלום", formulaExpression: "due_date ? Math.max(0, Math.floor((new Date() - new Date(due_date)) / 86400000)) : 0" },
  { name: "תשלומים חלקיים", slug: "partial_payments", fieldKey: "partial_payments", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 57, groupName: "תשלום", settings: { isJson: true, hint: "[{date, amount, method, reference}]" } },
  { name: "זיכוי מקושר", slug: "credit_note_ref", fieldKey: "credit_note_ref", fieldType: "text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 58, groupName: "תשלום" },
  { name: "סטטוס תשלום", slug: "payment_status", fieldKey: "payment_status", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["לא שולם", "חלקי", "שולם", "באיחור", "נמחל"], sortOrder: 59, groupName: "תשלום" },
];

const FIELD_AGENT_FIELDS: FieldDef[] = [
  { name: "שם סוכן", slug: "name", fieldKey: "name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "טלפון", slug: "phone", fieldKey: "phone", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "אימייל", slug: "email", fieldKey: "email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "אזור פעילות", slug: "region", fieldKey: "region", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "קו רוחב", slug: "lat", fieldKey: "lat", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 4, groupName: "מיקום" },
  { name: "קו אורך", slug: "lng", fieldKey: "lng", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 5, groupName: "מיקום" },
  { name: "מיקום אחרון (תאריך)", slug: "last_location_date", fieldKey: "last_location_date", fieldType: "date", showInList: false, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6, groupName: "מיקום" },
  { name: "יעד ביקורים יומי", slug: "daily_target", fieldKey: "daily_target", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "סה״כ ביקורים", slug: "total_visits", fieldKey: "total_visits", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 8 },
  { name: "הצעות שנוצרו", slug: "quotes_generated", fieldKey: "quotes_generated", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
  { name: "עסקאות שנסגרו", slug: "deals_closed", fieldKey: "deals_closed", fieldType: "number", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 10 },
  { name: "שיעור המרה (%)", slug: "conversion_rate", fieldKey: "conversion_rate", fieldType: "formula", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 11, formulaExpression: "total_visits > 0 ? Math.round((deals_closed / total_visits) * 100) : 0" },
  { name: "יומן ביקורים (JSON)", slug: "visit_log", fieldKey: "visit_log", fieldType: "long_text", showInList: false, showInForm: false, showInDetail: true, sortOrder: 12, settings: { isJson: true, hint: "[{date, location, customer, notes}]" } },
  { name: "דוח יומי", slug: "daily_report", fieldKey: "daily_report", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 13 },
  { name: "סף התראת המרה (%)", slug: "conversion_alert_threshold", fieldKey: "conversion_alert_threshold", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 14, settings: { hint: "אחוז מינימלי — מתחתיו תישלח התראה" } },
];

const LEAD_FIELDS: FieldDef[] = [
  { name: "שם", slug: "name", fieldKey: "name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "טלפון", slug: "phone", fieldKey: "phone", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "אימייל", slug: "email", fieldKey: "email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "מקור", slug: "source", fieldKey: "source", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["אתר", "טלפון", "הפניה", "פייסבוק", "גוגל", "תערוכה", "סוכן שטח", "אחר"], sortOrder: 3 },
  { name: "שווי משוער", slug: "estimated_value", fieldKey: "estimated_value", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4, settings: { suffix: "₪" } },
  { name: "סוכן מטפל", slug: "assigned_agent", fieldKey: "assigned_agent", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תאריך קשר אחרון", slug: "last_contact_date", fieldKey: "last_contact_date", fieldType: "date", showInList: false, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "סיבת אובדן", slug: "loss_reason", fieldKey: "loss_reason", fieldType: "text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "קישור להקלטת שיחה", slug: "call_recording_ref", fieldKey: "call_recording_ref", fieldType: "url", showInList: false, showInForm: true, showInDetail: true, sortOrder: 9, settings: { hint: "קישור להקלטה" } },
  { name: "סף התראת המרה (%)", slug: "conversion_alert_threshold", fieldKey: "conversion_alert_threshold", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 10, settings: { hint: "סף מינימלי — אם ההמרה יורדת מתחתיו, תישלח התראה" } },
];

const PRICE_LIST_FIELDS: FieldDef[] = [
  { name: "שם מחירון", slug: "name", fieldKey: "name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג פרויקט", slug: "project_type", fieldKey: "project_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["מגורים", "מסחרי", "מוסדי", "שיפוץ"], sortOrder: 1 },
  { name: "קטגוריה", slug: "category", fieldKey: "category", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "עלות חומרים", slug: "material_cost", fieldKey: "material_cost", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3, settings: { suffix: "₪" } },
  { name: "תעריף שעתי עבודה", slug: "labor_rate", fieldKey: "labor_rate", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4, settings: { suffix: "₪/שעה" } },
  { name: "שעות עבודה", slug: "labor_hours", fieldKey: "labor_hours", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תקורה (%)", slug: "overhead_percent", fieldKey: "overhead_percent", fieldType: "number", showInList: false, showInForm: true, showInDetail: true, sortOrder: 6, settings: { suffix: "%" } },
  { name: "מרווח יעד (%)", slug: "target_margin", fieldKey: "target_margin", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7, settings: { suffix: "%" } },
  { name: "מרווח בפועל (%)", slug: "margin_percent", fieldKey: "margin_percent", fieldType: "formula", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 8, formulaExpression: "material_cost && labor_rate && labor_hours ? Math.round(((material_cost + labor_rate * labor_hours) * (1 + (overhead_percent || 0) / 100) * ((target_margin || 200) / 100) - (material_cost + labor_rate * labor_hours) * (1 + (overhead_percent || 0) / 100)) / ((material_cost + labor_rate * labor_hours) * (1 + (overhead_percent || 0) / 100) * ((target_margin || 200) / 100)) * 100) : 0" },
  { name: "מחיר מכירה מחושב", slug: "selling_price", fieldKey: "selling_price", fieldType: "formula", isCalculated: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9, formulaExpression: "((material_cost || 0) + ((labor_rate || 0) * (labor_hours || 0))) * (1 + ((overhead_percent || 0) / 100)) * ((target_margin || 200) / 100)" },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "תאריך עדכון מחירון", slug: "price_date", fieldKey: "price_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
];

const COLLECTION_ACTION_FIELDS: FieldDef[] = [
  { name: "לקוח", slug: "customer_name", fieldKey: "customer_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג פעולה", slug: "action_type", fieldKey: "action_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["תזכורת ידידותית", "שיחת מעקב", "מכתב התראה", "הפסקת אספקה", "העברה לגבייה"], sortOrder: 1 },
  { name: "סכום חוב", slug: "debt_amount", fieldKey: "debt_amount", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2, settings: { suffix: "₪" } },
  { name: "תאריך פעולה", slug: "action_date", fieldKey: "action_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תאריך פעולה הבא", slug: "next_action_date", fieldKey: "next_action_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "תוצאה", slug: "result", fieldKey: "result", fieldType: "long_text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "מטפל", slug: "handler", fieldKey: "handler", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "דירוג סיכון לקוח", slug: "customer_risk", fieldKey: "customer_risk", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["low", "medium", "high", "critical"], sortOrder: 7 },
  { name: "כלל הסלמה", slug: "escalation_rule", fieldKey: "escalation_rule", fieldType: "text", showInList: false, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "סטטוס תזכורת", slug: "reminder_status", fieldKey: "reminder_status", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["לא נשלח", "נשלח", "נתקבל", "ללא מענה"], sortOrder: 9 },
];

async function ensureField(entityId: number, field: FieldDef) {
  const [existing] = await db.select().from(entityFieldsTable)
    .where(and(eq(entityFieldsTable.entityId, entityId), eq(entityFieldsTable.slug, field.slug)));
  if (existing) return existing;

  const [created] = await db.insert(entityFieldsTable).values({
    entityId,
    name: field.name,
    slug: field.slug,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    isRequired: field.isRequired ?? false,
    isUnique: field.isUnique ?? false,
    isReadOnly: field.isReadOnly ?? false,
    isCalculated: field.isCalculated ?? false,
    isSearchable: field.isSearchable ?? false,
    showInList: field.showInList ?? true,
    showInForm: field.showInForm ?? true,
    showInDetail: field.showInDetail ?? true,
    sortOrder: field.sortOrder,
    settings: field.settings ?? {},
    options: field.options ? field.options.map(o => ({ label: o, value: o })) : [],
    fieldWidth: (field.fieldWidth ?? "full") as "full" | "half" | "third",
    formulaExpression: field.formulaExpression ?? null,
    groupName: field.groupName ?? null,
    relatedEntityId: field.relatedEntityId ?? null,
    relatedDisplayField: field.relatedDisplayField ?? null,
    relationType: field.relationType ?? null,
  }).returning();
  return created;
}

async function ensureEntity(moduleId: number, name: string, slug: string, namePlural: string, icon: string, entityType: string) {
  const [existing] = await db.select().from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, slug));
  if (existing) return existing;

  const [created] = await db.insert(moduleEntitiesTable).values({
    moduleId,
    name,
    namePlural,
    slug,
    icon,
    entityType: entityType as "master" | "transaction" | "child",
    hasStatus: true,
    hasCategories: false,
    hasAttachments: true,
    hasNotes: true,
    hasOwner: true,
    hasAudit: true,
  }).returning();
  return created;
}

async function ensureStatus(entityId: number, name: string, slug: string, color: string, sortOrder: number) {
  const [existing] = await db.select().from(entityStatusesTable)
    .where(and(eq(entityStatusesTable.entityId, entityId), eq(entityStatusesTable.slug, slug)));
  if (existing) return existing;

  const [created] = await db.insert(entityStatusesTable).values({
    entityId, name, slug, color, sortOrder, isDefault: sortOrder === 0,
  }).returning();
  return created;
}

async function ensureModule(name: string, slug: string, icon: string) {
  const [existing] = await db.select().from(platformModulesTable)
    .where(eq(platformModulesTable.slug, slug));
  if (existing) return existing;

  const [created] = await db.insert(platformModulesTable).values({
    name, slug, icon, status: "published",
  }).returning();
  return created;
}

async function seedAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  const userId = String((result.user as { id: number }).id || "");
  if (userId) {
    req.permissions = await resolveUserPermissions(userId);
  }
  if (!req.permissions || (!req.permissions.isSuperAdmin && !req.permissions.builderAccess)) {
    res.status(403).json({ error: "נדרשת הרשאת מנהל מערכת" }); return;
  }
  next();
}

export async function runCrmSeed(): Promise<string[]> {
  const results: string[] = [];

  const crmModule = await ensureModule("CRM מתקדם", "crm-advanced", "Users");
  results.push(`Module: ${crmModule.name} (id=${crmModule.id})`);

  for (const field of CUSTOMER_EXTRA_FIELDS) {
    await ensureField(1, field);
  }
  results.push(`Customer entity (1) enriched with ${CUSTOMER_EXTRA_FIELDS.length} CRM fields`);

  for (const field of QUOTE_EXTRA_FIELDS) {
    await ensureField(26, field);
  }
  results.push(`Quotes entity (26) enriched with ${QUOTE_EXTRA_FIELDS.length} fields`);

  for (const field of INVOICE_EXTRA_FIELDS) {
    await ensureField(28, field);
  }
  results.push(`Invoices entity (28) enriched with ${INVOICE_EXTRA_FIELDS.length} fields`);

  const agentEntity = await ensureEntity(crmModule.id, "סוכן שטח", "field-agents", "סוכני שטח", "MapPin", "master");
  for (const field of FIELD_AGENT_FIELDS) {
    await ensureField(agentEntity.id, field);
  }
  await ensureStatus(agentEntity.id, "פעיל", "active", "green", 0);
  await ensureStatus(agentEntity.id, "לא פעיל", "inactive", "gray", 1);
  results.push(`Field agents entity (id=${agentEntity.id}) with ${FIELD_AGENT_FIELDS.length} fields`);

  const leadEntity = await ensureEntity(crmModule.id, "ליד", "leads", "לידים", "Lightbulb", "transaction");
  for (const field of LEAD_FIELDS) {
    await ensureField(leadEntity.id, field);
  }
  await ensureStatus(leadEntity.id, "חדש", "new", "blue", 0);
  await ensureStatus(leadEntity.id, "נוצר קשר", "contacted", "cyan", 1);
  await ensureStatus(leadEntity.id, "מוסמך", "qualified", "purple", 2);
  await ensureStatus(leadEntity.id, "הצעה נשלחה", "proposal", "amber", 3);
  await ensureStatus(leadEntity.id, "הומר", "converted", "green", 4);
  await ensureStatus(leadEntity.id, "אבוד", "lost", "red", 5);
  results.push(`Leads entity (id=${leadEntity.id}) with ${LEAD_FIELDS.length} fields`);

  const priceListEntity = await ensureEntity(crmModule.id, "מחירון", "price-lists", "מחירונים", "DollarSign", "master");
  for (const field of PRICE_LIST_FIELDS) {
    await ensureField(priceListEntity.id, field);
  }
  await ensureStatus(priceListEntity.id, "פעיל", "active", "green", 0);
  await ensureStatus(priceListEntity.id, "טיוטה", "draft", "gray", 1);
  await ensureStatus(priceListEntity.id, "לא פעיל", "inactive", "red", 2);
  results.push(`Price lists entity (id=${priceListEntity.id}) with ${PRICE_LIST_FIELDS.length} fields`);

  const collectionEntity = await ensureEntity(crmModule.id, "פעולת גבייה", "collection-actions", "פעולות גבייה", "Shield", "transaction");
  for (const field of COLLECTION_ACTION_FIELDS) {
    await ensureField(collectionEntity.id, field);
  }
  await ensureStatus(collectionEntity.id, "חדש", "new", "blue", 0);
  await ensureStatus(collectionEntity.id, "בתהליך", "in_progress", "amber", 1);
  await ensureStatus(collectionEntity.id, "הושלם", "completed", "green", 2);
  await ensureStatus(collectionEntity.id, "הועבר לגבייה", "escalated", "red", 3);
  results.push(`Collection actions entity (id=${collectionEntity.id}) with ${COLLECTION_ACTION_FIELDS.length} fields`);

  return results;
}

router.post("/platform/crm/seed", seedAuth, async (_req, res) => {
  try {
    const results = await runCrmSeed();
    res.json({ success: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    res.status(500).json({ error: message });
  }
});

export default router;
