import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityStatusesTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
  platformAutomationsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireBuilderAccess } from "../../lib/permission-middleware";

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
  description?: string;
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
  primaryDisplayField: string;
  sortOrder: number;
  hasStatus: boolean;
  fields: FieldDef[];
  statuses?: { name: string; slug: string; color: string; isDefault?: boolean; sortOrder: number }[];
}

interface ModuleDef {
  name: string;
  nameHe: string;
  nameEn: string;
  slug: string;
  moduleKey: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  sortOrder: number;
  entities: EntityDef[];
}

const GOALS_FIELDS: FieldDef[] = [
  { name: "שם היעד", slug: "goal_name", fieldKey: "goal_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "מחלקה", slug: "department", fieldKey: "department", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["הנהלה", "ייצור", "מכירות", "שיווק", "כספים", "משאבי אנוש", "לוגיסטיקה", "רכש", "פיתוח"], sortOrder: 2 },
  { name: "KPI מדד", slug: "kpi_name", fieldKey: "kpi_name", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "ערך יעד", slug: "target_value", fieldKey: "target_value", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "ערך נוכחי", slug: "current_value", fieldKey: "current_value", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "יחידת מדידה", slug: "unit", fieldKey: "unit", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["₪", "%", "יחידות", "לקוחות", "ימים", "שעות"], sortOrder: 6 },
  { name: "אחוז התקדמות", slug: "progress_pct", fieldKey: "progress_pct", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND((current_value / target_value) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 7 },
  { name: "תאריך התחלה", slug: "start_date", fieldKey: "start_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "תאריך יעד", slug: "target_date", fieldKey: "target_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "אחראי", slug: "responsible_person", fieldKey: "responsible_person", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "עדיפות", slug: "priority", fieldKey: "priority", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["קריטי", "גבוה", "בינוני", "נמוך"], sortOrder: 11 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 12 },
];

const STRATEGY_PLAN_FIELDS: FieldDef[] = [
  { name: "שם התוכנית", slug: "plan_name", fieldKey: "plan_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "תחום", slug: "domain", fieldKey: "domain", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["צמיחה", "חדשנות", "יעילות תפעולית", "חדירה לשוק", "גיוון", "מיתוג"], sortOrder: 2 },
  { name: "אבן דרך 1", slug: "milestone_1", fieldKey: "milestone_1", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תאריך אבן דרך 1", slug: "milestone_1_date", fieldKey: "milestone_1_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "אבן דרך 2", slug: "milestone_2", fieldKey: "milestone_2", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תאריך אבן דרך 2", slug: "milestone_2_date", fieldKey: "milestone_2_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "אבן דרך 3", slug: "milestone_3", fieldKey: "milestone_3", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "תאריך אבן דרך 3", slug: "milestone_3_date", fieldKey: "milestone_3_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "תקציב מתוכנן", slug: "planned_budget", fieldKey: "planned_budget", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "תקציב בפועל", slug: "actual_budget", fieldKey: "actual_budget", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "אחראי", slug: "owner", fieldKey: "owner", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 12 },
];

const MARKET_ENTRY_FIELDS: FieldDef[] = [
  { name: "שם התוכנית", slug: "plan_name", fieldKey: "plan_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "שוק יעד", slug: "target_market", fieldKey: "target_market", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "מדינה/אזור", slug: "country_region", fieldKey: "country_region", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוג חדירה", slug: "entry_type", fieldKey: "entry_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["ייצוא ישיר", "מפיץ מקומי", "שותפות אסטרטגית", "הקמת סניף", "רכישה", "זכיינות"], sortOrder: 3 },
  { name: "מיצוב מותג", slug: "brand_positioning", fieldKey: "brand_positioning", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "יתרונות תחרותיים", slug: "competitive_advantages", fieldKey: "competitive_advantages", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "גודל שוק משוער", slug: "estimated_market_size", fieldKey: "estimated_market_size", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תקציב נדרש", slug: "required_budget", fieldKey: "required_budget", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "לוח זמנים", slug: "timeline", fieldKey: "timeline", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "תאריך כניסה צפוי", slug: "expected_entry_date", fieldKey: "expected_entry_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "סיכונים", slug: "risks", fieldKey: "risks", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 11 },
];

const COMPETITOR_FIELDS: FieldDef[] = [
  { name: "שם מתחרה", slug: "competitor_name", fieldKey: "competitor_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "אתר אינטרנט", slug: "website", fieldKey: "website", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "תחום פעילות", slug: "business_area", fieldKey: "business_area", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "מוצרים עיקריים", slug: "main_products", fieldKey: "main_products", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "טווח מחירים", slug: "price_range", fieldKey: "price_range", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "נתח שוק משוער (%)", slug: "market_share", fieldKey: "market_share", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "חוזקות", slug: "strengths", fieldKey: "strengths", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "חולשות", slug: "weaknesses", fieldKey: "weaknesses", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "איומים", slug: "threats", fieldKey: "threats", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "הזדמנויות", slug: "opportunities", fieldKey: "opportunities", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "הערכה כללית", slug: "overall_rating", fieldKey: "overall_rating", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["איום גבוה", "איום בינוני", "איום נמוך", "לא משמעותי"], sortOrder: 10 },
  { name: "רמת איום", slug: "threat_level", fieldKey: "threat_level", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["high", "medium", "low"], sortOrder: 11 },
  { name: "נתח שוק (%)", slug: "market_share_pct", fieldKey: "market_share_pct", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 12 },
  { name: "יתרון תחרותי שלנו", slug: "our_advantage", fieldKey: "our_advantage", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 13, description: "תיאור היתרון התחרותי של החברה מול מתחרה זה" },
  { name: "ציון מיצוב (1-10)", slug: "positioning_score", fieldKey: "positioning_score", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 14, description: "ציון מיצוב המתחרה ביחס לחברה (1=חלש, 10=חזק)" },
  { name: "מקור מידע", slug: "info_source", fieldKey: "info_source", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 15 },
  { name: "תאריך עדכון אחרון", slug: "last_updated", fieldKey: "last_updated", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 16 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 17 },
];

const MARKET_TREND_FIELDS: FieldDef[] = [
  { name: "שם מגמה", slug: "trend_name", fieldKey: "trend_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "קטגוריה", slug: "category", fieldKey: "category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["טכנולוגיה", "רגולציה", "צרכנות", "כלכלה", "דמוגרפיה", "סביבה"], sortOrder: 2 },
  { name: "השפעה על החברה", slug: "impact_level", fieldKey: "impact_level", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["גבוהה מאוד", "גבוהה", "בינונית", "נמוכה"], sortOrder: 3 },
  { name: "כיוון מגמה", slug: "trend_direction", fieldKey: "trend_direction", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["עולה", "יורד", "יציב", "לא ברור"], sortOrder: 4 },
  { name: "פעולות נדרשות", slug: "required_actions", fieldKey: "required_actions", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "מקור מידע", slug: "source", fieldKey: "source", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תאריך זיהוי", slug: "identified_date", fieldKey: "identified_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
];

const CAMPAIGN_FIELDS: FieldDef[] = [
  { name: "שם קמפיין", slug: "campaign_name", fieldKey: "campaign_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "ערוץ", slug: "channel", fieldKey: "channel", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["פייסבוק", "אינסטגרם", "גוגל", "לינקדאין", "אימייל", "SMS", "טלפון", "אתר", "יוטיוב", "טיקטוק", "WhatsApp", "אחר"], sortOrder: 2 },
  { name: "קהל יעד", slug: "target_audience", fieldKey: "target_audience", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תקציב", slug: "budget", fieldKey: "budget", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "הוצאה בפועל", slug: "actual_spend", fieldKey: "actual_spend", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תאריך התחלה", slug: "start_date", fieldKey: "start_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תאריך סיום", slug: "end_date", fieldKey: "end_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "לידים שהתקבלו", slug: "leads_count", fieldKey: "leads_count", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "המרות", slug: "conversions", fieldKey: "conversions", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "הכנסות מהקמפיין", slug: "revenue", fieldKey: "revenue", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "ROI (%)", slug: "roi", fieldKey: "roi", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND(((revenue - actual_spend) / actual_spend) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 11 },
  { name: "אחראי", slug: "manager", fieldKey: "manager", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 12 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 13 },
];

const CONTENT_CALENDAR_FIELDS: FieldDef[] = [
  { name: "כותרת תוכן", slug: "content_title", fieldKey: "content_title", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג תוכן", slug: "content_type", fieldKey: "content_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["פוסט", "סטורי", "מאמר", "וידאו", "ניוזלטר", "באנר", "מודעה", "אינפוגרפיקה"], sortOrder: 1 },
  { name: "ערוץ", slug: "channel", fieldKey: "channel", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["פייסבוק", "אינסטגרם", "לינקדאין", "אתר/בלוג", "אימייל", "יוטיוב", "טיקטוק"], sortOrder: 2 },
  { name: "תאריך פרסום מתוכנן", slug: "planned_date", fieldKey: "planned_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "שעת פרסום", slug: "publish_time", fieldKey: "publish_time", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "תוכן/טקסט", slug: "content_text", fieldKey: "content_text", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "קישור לקריאייטיב", slug: "creative_link", fieldKey: "creative_link", fieldType: "url", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "אחראי", slug: "assignee", fieldKey: "assignee", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
];

const LEAD_SOURCE_FIELDS: FieldDef[] = [
  { name: "שם מקור", slug: "source_name", fieldKey: "source_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "ערוץ", slug: "channel", fieldKey: "channel", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["פייסבוק", "גוגל", "לינקדאין", "אתר", "הפניה", "טלפון", "תערוכה", "אחר"], sortOrder: 1 },
  { name: "לידים שהתקבלו", slug: "total_leads", fieldKey: "total_leads", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "לידים שהומרו", slug: "converted_leads", fieldKey: "converted_leads", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "שיעור המרה (%)", slug: "conversion_rate", fieldKey: "conversion_rate", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND((converted_leads / total_leads) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "עלות כוללת", slug: "total_cost", fieldKey: "total_cost", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "עלות לליד", slug: "cost_per_lead", fieldKey: "cost_per_lead", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND(total_cost / total_leads, 0)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6 },
  { name: "הכנסות שנוצרו", slug: "revenue_generated", fieldKey: "revenue_generated", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "ROI", slug: "roi", fieldKey: "roi", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND(((revenue_generated - total_cost) / total_cost) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 8 },
  { name: "תקופה", slug: "period", fieldKey: "period", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 10 },
];

const COST_ANALYSIS_FIELDS: FieldDef[] = [
  { name: "קטגוריית הוצאה", slug: "expense_category", fieldKey: "expense_category", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["חומרי גלם", "עבודה", "אנרגיה", "לוגיסטיקה", "שיווק", "תחזוקה", "שכירות", "ביטוח", "תקשורת", "מקצועי", "אחר"], sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "סכום חודשי נוכחי", slug: "current_monthly", fieldKey: "current_monthly", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סכום חודשי קודם", slug: "previous_monthly", fieldKey: "previous_monthly", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "שינוי (%)", slug: "change_pct", fieldKey: "change_pct", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND(((current_monthly - previous_monthly) / previous_monthly) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "בנצ'מרק שוק", slug: "market_benchmark", fieldKey: "market_benchmark", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "חריגה מבנצ'מרק", slug: "benchmark_deviation", fieldKey: "benchmark_deviation", fieldType: "formula", isCalculated: true, formulaExpression: "current_monthly - market_benchmark", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 6 },
  { name: "הזדמנות חיסכון", slug: "saving_opportunity", fieldKey: "saving_opportunity", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "חיסכון פוטנציאלי", slug: "potential_saving", fieldKey: "potential_saving", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "חיסכון שהושג", slug: "achieved_saving", fieldKey: "achieved_saving", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "אחראי", slug: "responsible", fieldKey: "responsible", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "תאריך בדיקה", slug: "review_date", fieldKey: "review_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 12 },
];

const CRISIS_SCENARIO_FIELDS: FieldDef[] = [
  { name: "שם התרחיש", slug: "scenario_name", fieldKey: "scenario_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג משבר", slug: "crisis_type", fieldKey: "crisis_type", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["מאקרו - קריסת שוק", "מאקרו - שיבוש אספקה", "מאקרו - רגולציה", "מאקרו - מגיפה", "מאקרו - מלחמה/ביטחון", "מיקרו - תקלת ציוד", "מיקרו - עזיבת עובד מפתח", "מיקרו - תביעה משפטית", "מיקרו - אובדן לקוח מרכזי", "מיקרו - בעיית איכות", "מיקרו - דליפת מידע"], sortOrder: 1 },
  { name: "רמת סיכון", slug: "risk_level", fieldKey: "risk_level", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["קריטי", "גבוה", "בינוני", "נמוך"], sortOrder: 2 },
  { name: "הסתברות", slug: "probability", fieldKey: "probability", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["גבוהה מאוד", "גבוהה", "בינונית", "נמוכה", "נמוכה מאוד"], sortOrder: 3 },
  { name: "השפעה פוטנציאלית", slug: "potential_impact", fieldKey: "potential_impact", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "הערכת נזק כספי", slug: "financial_impact", fieldKey: "financial_impact", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תוכנית תגובה", slug: "response_plan", fieldKey: "response_plan", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "צ'קליסט פעולות", slug: "action_checklist", fieldKey: "action_checklist", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "נוהל אסקלציה", slug: "escalation_procedure", fieldKey: "escalation_procedure", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "אחראי ראשי", slug: "primary_owner", fieldKey: "primary_owner", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "צוות תגובה", slug: "response_team", fieldKey: "response_team", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "תאריך עדכון אחרון", slug: "last_review_date", fieldKey: "last_review_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "תאריך תרגול אחרון", slug: "last_drill_date", fieldKey: "last_drill_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 12 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 13 },
];

const PRODUCT_DEV_FIELDS: FieldDef[] = [
  { name: "שם המוצר", slug: "product_name", fieldKey: "product_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "קטגוריה", slug: "category", fieldKey: "category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["מוצר חדש", "שיפור מוצר קיים", "הרחבת קו", "מוצר מותאם לקוח"], sortOrder: 2 },
  { name: "שלב פיתוח", slug: "dev_stage", fieldKey: "dev_stage", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["רעיון", "מחקר", "עיצוב", "אב-טיפוס", "בדיקות", "ייצור ניסיוני", "מוכן להשקה", "בשוק"], sortOrder: 3 },
  { name: "ביקוש שוק", slug: "market_demand", fieldKey: "market_demand", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["גבוה מאוד", "גבוה", "בינוני", "נמוך", "לא ידוע"], sortOrder: 4 },
  { name: "הכנסה צפויה שנתית", slug: "projected_annual_revenue", fieldKey: "projected_annual_revenue", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "עלות פיתוח", slug: "dev_cost", fieldKey: "dev_cost", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "עלות ייצור ליחידה", slug: "unit_production_cost", fieldKey: "unit_production_cost", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "מחיר מכירה מוצע", slug: "proposed_price", fieldKey: "proposed_price", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "מרווח צפוי (%)", slug: "projected_margin", fieldKey: "projected_margin", fieldType: "formula", isCalculated: true, formulaExpression: "ROUND(((proposed_price - unit_production_cost) / proposed_price) * 100, 1)", showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, sortOrder: 9 },
  { name: "תאריך השקה צפוי", slug: "expected_launch_date", fieldKey: "expected_launch_date", fieldType: "date", showInList: true, showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "אחראי פיתוח", slug: "dev_lead", fieldKey: "dev_lead", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 12 },
];

const MODULE_DEFINITIONS: ModuleDef[] = [
  {
    name: "יעדים ואסטרטגיה",
    nameHe: "יעדים ואסטרטגיה",
    nameEn: "Goals & Strategy",
    slug: "strategy",
    moduleKey: "strategy",
    description: "ניהול יעדים אסטרטגיים, תוכניות פעולה ומעקב KPI",
    icon: "Target",
    color: "violet",
    category: "אסטרטגיה",
    sortOrder: 50,
    entities: [
      {
        name: "יעד אסטרטגי",
        nameHe: "יעד אסטרטגי",
        nameEn: "Strategic Goal",
        namePlural: "יעדים אסטרטגיים",
        slug: "strategic_goal",
        entityKey: "strategic_goal",
        tableName: "platform_strategic_goals",
        description: "יעדים אסטרטגיים עם מדדי KPI ומעקב התקדמות",
        icon: "Target",
        primaryDisplayField: "goal_name",
        sortOrder: 0,
        hasStatus: true,
        fields: GOALS_FIELDS,
        statuses: [
          { name: "תכנון", slug: "planning", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "בביצוע", slug: "in_progress", color: "orange", sortOrder: 1 },
          { name: "על המסלול", slug: "on_track", color: "green", sortOrder: 2 },
          { name: "בסיכון", slug: "at_risk", color: "red", sortOrder: 3 },
          { name: "הושלם", slug: "completed", color: "emerald", sortOrder: 4 },
          { name: "מבוטל", slug: "cancelled", color: "gray", sortOrder: 5 },
        ],
      },
      {
        name: "תוכנית אסטרטגית",
        nameHe: "תוכנית אסטרטגית",
        nameEn: "Strategy Plan",
        namePlural: "תוכניות אסטרטגיות",
        slug: "strategy_plan",
        entityKey: "strategy_plan",
        tableName: "platform_strategy_plans",
        description: "תוכניות אסטרטגיות עם אבני דרך וציר זמן",
        icon: "Map",
        primaryDisplayField: "plan_name",
        sortOrder: 1,
        hasStatus: true,
        fields: STRATEGY_PLAN_FIELDS,
        statuses: [
          { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
          { name: "מאושר", slug: "approved", color: "blue", sortOrder: 1 },
          { name: "בביצוע", slug: "active", color: "green", sortOrder: 2 },
          { name: "הושלם", slug: "completed", color: "emerald", sortOrder: 3 },
        ],
      },
      {
        name: "תוכנית כניסה לשוק",
        nameHe: "תוכנית כניסה לשוק",
        nameEn: "Market Entry Plan",
        namePlural: "תוכניות כניסה לשוק",
        slug: "market_entry_plan",
        entityKey: "market_entry_plan",
        tableName: "platform_market_entry_plans",
        description: "תוכניות להתרחבות בינלאומית ומיצוב מותג",
        icon: "Globe",
        primaryDisplayField: "plan_name",
        sortOrder: 2,
        hasStatus: true,
        fields: MARKET_ENTRY_FIELDS,
        statuses: [
          { name: "מחקר", slug: "research", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "תכנון", slug: "planning", color: "orange", sortOrder: 1 },
          { name: "ביצוע", slug: "execution", color: "green", sortOrder: 2 },
          { name: "פעיל", slug: "active", color: "emerald", sortOrder: 3 },
          { name: "מושהה", slug: "paused", color: "gray", sortOrder: 4 },
        ],
      },
    ],
  },
  {
    name: "ניתוח שוק ומתחרים",
    nameHe: "ניתוח שוק ומתחרים",
    nameEn: "Market & Competitor Analysis",
    slug: "market-analysis",
    moduleKey: "market_analysis",
    description: "ניתוח מתחרים, מגמות שוק ומיצוב החברה",
    icon: "TrendingUp",
    color: "cyan",
    category: "אסטרטגיה",
    sortOrder: 51,
    entities: [
      {
        name: "פרופיל מתחרה",
        nameHe: "פרופיל מתחרה",
        nameEn: "Competitor Profile",
        namePlural: "פרופילי מתחרים",
        slug: "competitor_profile",
        entityKey: "competitor_profile",
        tableName: "platform_competitor_profiles",
        description: "פרופילים של מתחרים עם ניתוח SWOT, מחירים ונתח שוק",
        icon: "Users",
        primaryDisplayField: "competitor_name",
        sortOrder: 0,
        hasStatus: true,
        fields: COMPETITOR_FIELDS,
        statuses: [
          { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
          { name: "חדש", slug: "new", color: "blue", sortOrder: 1 },
          { name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 2 },
        ],
      },
      {
        name: "מגמת שוק",
        nameHe: "מגמת שוק",
        nameEn: "Market Trend",
        namePlural: "מגמות שוק",
        slug: "market_trend",
        entityKey: "market_trend",
        tableName: "platform_market_trends",
        description: "מעקב אחר מגמות שוק והשפעתן על החברה",
        icon: "Activity",
        primaryDisplayField: "trend_name",
        sortOrder: 1,
        hasStatus: true,
        fields: MARKET_TREND_FIELDS,
        statuses: [
          { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
          { name: "במעקב", slug: "monitoring", color: "blue", sortOrder: 1 },
          { name: "לא רלוונטי", slug: "irrelevant", color: "gray", sortOrder: 2 },
        ],
      },
    ],
  },
  {
    name: "שיווק",
    nameHe: "שיווק",
    nameEn: "Marketing",
    slug: "marketing",
    moduleKey: "marketing",
    description: "ניהול קמפיינים, לוח שנה תוכן וניתוח מקורות לידים",
    icon: "Megaphone",
    color: "pink",
    category: "שיווק ומכירות",
    sortOrder: 52,
    entities: [
      {
        name: "קמפיין שיווקי",
        nameHe: "קמפיין שיווקי",
        nameEn: "Marketing Campaign",
        namePlural: "קמפיינים שיווקיים",
        slug: "marketing_campaign",
        entityKey: "marketing_campaign",
        tableName: "platform_marketing_campaigns",
        description: "קמפיינים שיווקיים עם מעקב תקציב, לידים ו-ROI",
        icon: "Megaphone",
        primaryDisplayField: "campaign_name",
        sortOrder: 0,
        hasStatus: true,
        fields: CAMPAIGN_FIELDS,
        statuses: [
          { name: "תכנון", slug: "planning", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "פעיל", slug: "active", color: "green", sortOrder: 1 },
          { name: "מושהה", slug: "paused", color: "orange", sortOrder: 2 },
          { name: "הסתיים", slug: "completed", color: "emerald", sortOrder: 3 },
          { name: "מבוטל", slug: "cancelled", color: "gray", sortOrder: 4 },
        ],
      },
      {
        name: "לוח שנה תוכן",
        nameHe: "לוח שנה תוכן",
        nameEn: "Content Calendar",
        namePlural: "לוח שנה תוכן",
        slug: "content_calendar",
        entityKey: "content_calendar",
        tableName: "platform_content_calendar",
        description: "תכנון ומעקב פרסומי תוכן בכל הערוצים",
        icon: "CalendarDays",
        primaryDisplayField: "content_title",
        sortOrder: 1,
        hasStatus: true,
        fields: CONTENT_CALENDAR_FIELDS,
        statuses: [
          { name: "מתוכנן", slug: "planned", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "בהכנה", slug: "in_preparation", color: "orange", sortOrder: 1 },
          { name: "מאושר", slug: "approved", color: "green", sortOrder: 2 },
          { name: "פורסם", slug: "published", color: "emerald", sortOrder: 3 },
          { name: "בוטל", slug: "cancelled", color: "gray", sortOrder: 4 },
        ],
      },
      {
        name: "מקור לידים",
        nameHe: "מקור לידים",
        nameEn: "Lead Source",
        namePlural: "מקורות לידים",
        slug: "lead_source",
        entityKey: "lead_source",
        tableName: "platform_lead_sources",
        description: "ניתוח ROI לפי מקור ליד וערוץ שיווקי",
        icon: "BarChart3",
        primaryDisplayField: "source_name",
        sortOrder: 2,
        hasStatus: true,
        fields: LEAD_SOURCE_FIELDS,
        statuses: [
          { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
          { name: "לא פעיל", slug: "inactive", color: "gray", sortOrder: 1 },
        ],
      },
    ],
  },
  {
    name: "הוזלת עלויות",
    nameHe: "הוזלת עלויות",
    nameEn: "Cost Reduction",
    slug: "cost-reduction",
    moduleKey: "cost_reduction",
    description: "ניתוח הוצאות, זיהוי הזדמנויות חיסכון ומעקב חסכונות",
    icon: "TrendingDown",
    color: "amber",
    category: "כספים",
    sortOrder: 53,
    entities: [
      {
        name: "ניתוח עלות",
        nameHe: "ניתוח עלות",
        nameEn: "Cost Analysis",
        namePlural: "ניתוחי עלויות",
        slug: "cost_analysis",
        entityKey: "cost_analysis",
        tableName: "platform_cost_analyses",
        description: "מעקב הוצאות, השוואה לבנצ'מרק וזיהוי הזדמנויות חיסכון",
        icon: "TrendingDown",
        primaryDisplayField: "description",
        sortOrder: 0,
        hasStatus: true,
        fields: COST_ANALYSIS_FIELDS,
        statuses: [
          { name: "בבדיקה", slug: "reviewing", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "זוהתה הזדמנות", slug: "opportunity_found", color: "orange", sortOrder: 1 },
          { name: "בביצוע", slug: "in_progress", color: "green", sortOrder: 2 },
          { name: "חיסכון הושג", slug: "saving_achieved", color: "emerald", sortOrder: 3 },
          { name: "לא רלוונטי", slug: "not_relevant", color: "gray", sortOrder: 4 },
        ],
      },
    ],
  },
  {
    name: "ניהול משברים",
    nameHe: "ניהול משברים",
    nameEn: "Crisis Management",
    slug: "crisis-management",
    moduleKey: "crisis_management",
    description: "תכנון תרחישי משבר, תוכניות תגובה ונהלי אסקלציה",
    icon: "ShieldAlert",
    color: "red",
    category: "אסטרטגיה",
    sortOrder: 54,
    entities: [
      {
        name: "תרחיש משבר",
        nameHe: "תרחיש משבר",
        nameEn: "Crisis Scenario",
        namePlural: "תרחישי משבר",
        slug: "crisis_scenario",
        entityKey: "crisis_scenario",
        tableName: "platform_crisis_scenarios",
        description: "תרחישי משבר מאקרו ומיקרו עם תוכניות תגובה",
        icon: "ShieldAlert",
        primaryDisplayField: "scenario_name",
        sortOrder: 0,
        hasStatus: true,
        fields: CRISIS_SCENARIO_FIELDS,
        statuses: [
          { name: "טיוטה", slug: "draft", color: "gray", isDefault: true, sortOrder: 0 },
          { name: "מאושר", slug: "approved", color: "blue", sortOrder: 1 },
          { name: "פעיל", slug: "active", color: "green", sortOrder: 2 },
          { name: "מופעל", slug: "triggered", color: "red", sortOrder: 3 },
          { name: "טופל", slug: "resolved", color: "emerald", sortOrder: 4 },
        ],
      },
    ],
  },
  {
    name: "פיתוח מוצרים",
    nameHe: "פיתוח מוצרים",
    nameEn: "Product Development",
    slug: "product-development",
    moduleKey: "product_development",
    description: "ניהול צינור פיתוח מוצרים, מחקר שוק ותכנון השקות",
    icon: "Lightbulb",
    color: "emerald",
    category: "אסטרטגיה",
    sortOrder: 55,
    entities: [
      {
        name: "מוצר בפיתוח",
        nameHe: "מוצר בפיתוח",
        nameEn: "Product Concept",
        namePlural: "מוצרים בפיתוח",
        slug: "product_concept",
        entityKey: "product_concept",
        tableName: "platform_product_concepts",
        description: "ניהול קונספטים של מוצרים חדשים עם שלבי R&D",
        icon: "Lightbulb",
        primaryDisplayField: "product_name",
        sortOrder: 0,
        hasStatus: true,
        fields: PRODUCT_DEV_FIELDS,
        statuses: [
          { name: "רעיון", slug: "idea", color: "blue", isDefault: true, sortOrder: 0 },
          { name: "מחקר", slug: "research", color: "cyan", sortOrder: 1 },
          { name: "עיצוב", slug: "design", color: "purple", sortOrder: 2 },
          { name: "אב-טיפוס", slug: "prototype", color: "orange", sortOrder: 3 },
          { name: "בדיקות", slug: "testing", color: "yellow", sortOrder: 4 },
          { name: "מוכן להשקה", slug: "ready_to_launch", color: "green", sortOrder: 5 },
          { name: "בשוק", slug: "in_market", color: "emerald", sortOrder: 6 },
          { name: "בוטל", slug: "cancelled", color: "gray", sortOrder: 7 },
        ],
      },
    ],
  },
];

async function ensureModule(moduleDef: ModuleDef): Promise<{ moduleId: number; entityIds: Record<string, number> }> {
  let [mod] = await db.select().from(platformModulesTable)
    .where(eq(platformModulesTable.slug, moduleDef.slug));

  if (!mod) {
    [mod] = await db.insert(platformModulesTable).values({
      name: moduleDef.name,
      nameHe: moduleDef.nameHe,
      nameEn: moduleDef.nameEn,
      slug: moduleDef.slug,
      moduleKey: moduleDef.moduleKey,
      description: moduleDef.description,
      icon: moduleDef.icon,
      color: moduleDef.color,
      category: moduleDef.category,
      sortOrder: moduleDef.sortOrder,
      showInSidebar: true,
      showInDashboard: true,
      status: "published",
    }).returning();
  } else {
    [mod] = await db.update(platformModulesTable)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(platformModulesTable.id, mod.id))
      .returning();
  }

  const entityIds: Record<string, number> = {};

  for (const entityDef of moduleDef.entities) {
    let [entity] = await db.select().from(moduleEntitiesTable)
      .where(and(
        eq(moduleEntitiesTable.slug, entityDef.slug),
        eq(moduleEntitiesTable.moduleId, mod.id),
      ));

    if (!entity) {
      [entity] = await db.insert(moduleEntitiesTable).values({
        moduleId: mod.id,
        name: entityDef.name,
        nameHe: entityDef.nameHe,
        nameEn: entityDef.nameEn,
        namePlural: entityDef.namePlural,
        slug: entityDef.slug,
        entityKey: entityDef.entityKey,
        tableName: entityDef.tableName,
        description: entityDef.description,
        icon: entityDef.icon,
        entityType: "master",
        primaryDisplayField: entityDef.primaryDisplayField,
        hasStatus: entityDef.hasStatus,
        hasAudit: true,
        hasAttachments: true,
        hasNotes: true,
        sortOrder: entityDef.sortOrder,
      }).returning();
    }

    entityIds[entityDef.slug] = entity.id;

    const existingFields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, entity.id));

    const existingFieldSlugs = new Set(existingFields.map(f => f.slug));

    for (const fieldDef of entityDef.fields) {
      if (existingFieldSlugs.has(fieldDef.slug)) continue;
      try {
        await db.insert(entityFieldsTable).values({
          entityId: entity.id,
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
        console.warn(`[Strategy Migration] Failed to insert field ${entityDef.slug}.${fieldDef.slug}:`, fieldErr);
      }
    }

    if (entityDef.statuses && entityDef.statuses.length > 0) {
      const existingStatuses = await db.select().from(entityStatusesTable)
        .where(eq(entityStatusesTable.entityId, entity.id));

      if (existingStatuses.length === 0) {
        try {
          await db.insert(entityStatusesTable).values(
            entityDef.statuses.map(s => ({
              entityId: entity.id,
              name: s.name,
              slug: s.slug,
              color: s.color,
              isDefault: s.isDefault ?? false,
              sortOrder: s.sortOrder,
            }))
          );
        } catch (statusErr) {
          console.warn(`[Strategy Migration] Failed to insert statuses for ${entityDef.slug}:`, statusErr);
        }
      }
    }

    const existingForms = await db.select().from(formDefinitionsTable)
      .where(eq(formDefinitionsTable.entityId, entity.id));

    if (existingForms.length === 0) {
      const formFields = entityDef.fields.filter(f => f.showInForm).map(f => f.slug);
      try {
        await db.insert(formDefinitionsTable).values({
          entityId: entity.id,
          name: `טופס ${entityDef.name}`,
          slug: `${entityDef.slug}_form`,
          formType: "create",
          isDefault: true,
          sections: [
            { name: "פרטים", slug: "details", sortOrder: 0, fields: formFields },
          ],
          settings: {},
        });
      } catch (formErr) {
        console.warn(`[Strategy Migration] Failed to insert form for ${entityDef.slug}:`, formErr);
      }
    }

    const existingViews = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, entity.id));

    if (existingViews.length === 0) {
      const listColumns = entityDef.fields.filter(f => f.showInList).map(f => ({
        fieldSlug: f.slug, width: "auto", visible: true,
      }));
      try {
        await db.insert(viewDefinitionsTable).values({
          entityId: entity.id,
          name: "תצוגת רשימה",
          slug: `${entityDef.slug}_list`,
          viewType: "table",
          isDefault: true,
          columns: listColumns,
          sorting: [{ fieldSlug: entityDef.primaryDisplayField, direction: "asc" }],
          filters: [],
          settings: {},
        });
      } catch (viewErr) {
        console.warn(`[Strategy Migration] Failed to insert view for ${entityDef.slug}:`, viewErr);
      }
    }
  }

  return { moduleId: mod.id, entityIds };
}

interface DashboardDef {
  name: string;
  slug: string;
  moduleSlug: string;
  widgets: {
    widgetType: string;
    title: string;
    entitySlug: string;
    config: Record<string, unknown>;
  }[];
}

const DASHBOARD_DEFINITIONS: DashboardDef[] = [
  {
    name: "דשבורד אסטרטגיה",
    slug: "strategy_dashboard",
    moduleSlug: "strategy",
    widgets: [
      { widgetType: "kpi_card", title: "יעדים פעילים", entitySlug: "strategic_goal", config: { aggregation: "count", statusFilter: "in_progress", label: "יעדים בביצוע" } },
      { widgetType: "kpi_card", title: "יעדים שהושלמו", entitySlug: "strategic_goal", config: { aggregation: "count", statusFilter: "completed", label: "יעדים שהושלמו" } },
      { widgetType: "kpi_card", title: "תוכניות פעילות", entitySlug: "strategy_plan", config: { aggregation: "count", statusFilter: "active", label: "תוכניות בביצוע" } },
      { widgetType: "chart_pie", title: "יעדים לפי מחלקה", entitySlug: "strategic_goal", config: { groupByField: "department", aggregation: "count" } },
      { widgetType: "chart_bar", title: "יעדים לפי סטטוס", entitySlug: "strategic_goal", config: { groupByField: "_status", aggregation: "count" } },
      { widgetType: "data_table", title: "יעדים בסיכון", entitySlug: "strategic_goal", config: { limit: 5, statusFilter: "at_risk" } },
    ],
  },
  {
    name: "דשבורד ניתוח שוק",
    slug: "market_analysis_dashboard",
    moduleSlug: "market-analysis",
    widgets: [
      { widgetType: "kpi_card", title: "מתחרים פעילים", entitySlug: "competitor_profile", config: { aggregation: "count", statusFilter: "active", label: "מתחרים פעילים" } },
      { widgetType: "kpi_card", title: "מגמות שוק", entitySlug: "market_trend", config: { aggregation: "count", label: "מגמות במעקב" } },
      { widgetType: "chart_pie", title: "מתחרים לפי הערכה", entitySlug: "competitor_profile", config: { groupByField: "overall_rating", aggregation: "count" } },
      { widgetType: "chart_bar", title: "מיצוב מתחרים מול החברה", entitySlug: "competitor_profile", config: { groupByField: "competitor_name", aggregation: "avg", valueField: "positioning_score", label: "ציון מיצוב ממוצע" } },
      { widgetType: "chart_bar", title: "נתח שוק - מתחרים", entitySlug: "competitor_profile", config: { groupByField: "competitor_name", aggregation: "sum", valueField: "market_share_pct", label: "נתח שוק (%)" } },
      { widgetType: "chart_bar", title: "מגמות לפי השפעה", entitySlug: "market_trend", config: { groupByField: "impact_level", aggregation: "count" } },
      { widgetType: "data_table", title: "מתחרים עיקריים", entitySlug: "competitor_profile", config: { limit: 10 } },
    ],
  },
  {
    name: "דשבורד שיווק",
    slug: "marketing_dashboard",
    moduleSlug: "marketing",
    widgets: [
      { widgetType: "kpi_card", title: "קמפיינים פעילים", entitySlug: "marketing_campaign", config: { aggregation: "count", statusFilter: "active", label: "קמפיינים פעילים" } },
      { widgetType: "kpi_card", title: "סה\"כ תקציב", entitySlug: "marketing_campaign", config: { aggregation: "sum", fieldSlug: "budget", label: "תקציב שיווק" } },
      { widgetType: "kpi_card", title: "לידים שהתקבלו", entitySlug: "marketing_campaign", config: { aggregation: "sum", fieldSlug: "leads_count", label: "סה\"כ לידים" } },
      { widgetType: "kpi_card", title: "הכנסות מקמפיינים", entitySlug: "marketing_campaign", config: { aggregation: "sum", fieldSlug: "revenue", label: "הכנסות" } },
      { widgetType: "chart_bar", title: "קמפיינים לפי ערוץ", entitySlug: "marketing_campaign", config: { groupByField: "channel", aggregation: "count" } },
      { widgetType: "chart_pie", title: "ROI לפי מקור ליד", entitySlug: "lead_source", config: { groupByField: "channel", aggregation: "sum", valueField: "revenue_generated" } },
      { widgetType: "data_table", title: "קמפיינים אחרונים", entitySlug: "marketing_campaign", config: { limit: 10 } },
    ],
  },
  {
    name: "דשבורד הוזלת עלויות",
    slug: "cost_reduction_dashboard",
    moduleSlug: "cost-reduction",
    widgets: [
      { widgetType: "kpi_card", title: "הזדמנויות חיסכון", entitySlug: "cost_analysis", config: { aggregation: "count", statusFilter: "opportunity_found", label: "הזדמנויות" } },
      { widgetType: "kpi_card", title: "חיסכון פוטנציאלי", entitySlug: "cost_analysis", config: { aggregation: "sum", fieldSlug: "potential_saving", label: "חיסכון פוטנציאלי ₪" } },
      { widgetType: "kpi_card", title: "חיסכון שהושג", entitySlug: "cost_analysis", config: { aggregation: "sum", fieldSlug: "achieved_saving", label: "חיסכון בפועל ₪" } },
      { widgetType: "chart_pie", title: "הוצאות לפי קטגוריה", entitySlug: "cost_analysis", config: { groupByField: "expense_category", aggregation: "sum", valueField: "current_monthly" } },
      { widgetType: "chart_bar", title: "סטטוס ניתוחי עלויות", entitySlug: "cost_analysis", config: { groupByField: "_status", aggregation: "count" } },
      { widgetType: "data_table", title: "חריגות מבנצ'מרק", entitySlug: "cost_analysis", config: { limit: 10 } },
    ],
  },
  {
    name: "דשבורד ניהול משברים",
    slug: "crisis_management_dashboard",
    moduleSlug: "crisis-management",
    widgets: [
      { widgetType: "kpi_card", title: "תרחישים מוכנים", entitySlug: "crisis_scenario", config: { aggregation: "count", statusFilter: "approved", label: "תרחישים מאושרים" } },
      { widgetType: "kpi_card", title: "תרחישים מופעלים", entitySlug: "crisis_scenario", config: { aggregation: "count", statusFilter: "triggered", label: "משברים פעילים" } },
      { widgetType: "chart_pie", title: "תרחישים לפי סוג", entitySlug: "crisis_scenario", config: { groupByField: "crisis_type", aggregation: "count" } },
      { widgetType: "chart_bar", title: "תרחישים לפי רמת סיכון", entitySlug: "crisis_scenario", config: { groupByField: "risk_level", aggregation: "count" } },
      { widgetType: "data_table", title: "כל התרחישים", entitySlug: "crisis_scenario", config: { limit: 10 } },
    ],
  },
  {
    name: "דשבורד פיתוח מוצרים",
    slug: "product_dev_dashboard",
    moduleSlug: "product-development",
    widgets: [
      { widgetType: "kpi_card", title: "מוצרים בפיתוח", entitySlug: "product_concept", config: { aggregation: "count", label: "סה\"כ מוצרים" } },
      { widgetType: "kpi_card", title: "הכנסה צפויה", entitySlug: "product_concept", config: { aggregation: "sum", fieldSlug: "projected_annual_revenue", label: "הכנסה שנתית צפויה ₪" } },
      { widgetType: "chart_pie", title: "מוצרים לפי שלב", entitySlug: "product_concept", config: { groupByField: "_status", aggregation: "count" } },
      { widgetType: "chart_bar", title: "מוצרים לפי ביקוש שוק", entitySlug: "product_concept", config: { groupByField: "market_demand", aggregation: "count" } },
      { widgetType: "data_table", title: "צינור פיתוח", entitySlug: "product_concept", config: { limit: 10 } },
    ],
  },
];

async function ensureDashboards(moduleResults: Record<string, { moduleId: number; entityIds: Record<string, number> }>) {
  for (const dashDef of DASHBOARD_DEFINITIONS) {
    const moduleResult = moduleResults[dashDef.moduleSlug];
    if (!moduleResult) continue;

    try {
      let pageId: number;

      const [existing] = await db.select().from(systemDashboardPagesTable)
        .where(eq(systemDashboardPagesTable.slug, dashDef.slug));

      if (existing) {
        pageId = existing.id;
      } else {
        const [page] = await db.insert(systemDashboardPagesTable).values({
          name: dashDef.name,
          slug: dashDef.slug,
          moduleId: moduleResult.moduleId,
          isDefault: false,
          layout: { columns: 12 },
          settings: {},
        }).returning();
        pageId = page.id;
      }

      const existingWidgets = await db.select().from(systemDashboardWidgetsTable)
        .where(eq(systemDashboardWidgetsTable.dashboardId, pageId));

      if (existingWidgets.length > 0) continue;

      for (let idx = 0; idx < dashDef.widgets.length; idx++) {
        const widgetDef = dashDef.widgets[idx];
        const entityId = moduleResult.entityIds[widgetDef.entitySlug];
        if (!entityId) continue;

        const sizeLabel = widgetDef.widgetType === "data_table" ? "full" : widgetDef.widgetType === "kpi_card" ? "small" : "medium";
        await db.insert(systemDashboardWidgetsTable).values({
          dashboardId: pageId,
          widgetType: widgetDef.widgetType,
          title: widgetDef.title,
          entityId,
          config: widgetDef.config,
          position: idx,
          size: sizeLabel,
          settings: {},
        });
      }
    } catch (dashErr) {
      console.error(`[Strategy Migration] Failed to create dashboard ${dashDef.slug}:`, dashErr);
      throw dashErr;
    }
  }
}

async function ensureAutomations(moduleResults: Record<string, { moduleId: number; entityIds: Record<string, number> }>) {
  const costReductionModule = moduleResults["cost-reduction"];
  if (costReductionModule) {
    const costAnalysisEntityId = costReductionModule.entityIds["cost_analysis"];
    if (costAnalysisEntityId) {
      const automationSlug = "cost_exceed_benchmark_alert";
      const [existing] = await db.select().from(platformAutomationsTable)
        .where(eq(platformAutomationsTable.slug, automationSlug));

      if (!existing) {
        await db.insert(platformAutomationsTable).values({
          moduleId: costReductionModule.moduleId,
          name: "התראה על חריגת עלות מבנצ'מרק",
          slug: automationSlug,
          description: "שולח התראה כאשר עלות חודשית חורגת מהבנצ'מרק בשוק",
          triggerType: "on_update",
          triggerEntityId: costAnalysisEntityId,
          triggerConfig: {},
          conditions: [
            { field: "benchmark_deviation", operator: "greater_than", value: 0 },
          ],
          actions: [
            {
              type: "send_notification",
              config: {
                title: "חריגת עלות מבנצ'מרק",
                message: "ניתוח עלות '{{description}}' - העלות החודשית ({{current_monthly}} ₪) חורגת מהבנצ'מרק בשוק ({{market_benchmark}} ₪). סטיית בנצ'מרק: {{benchmark_deviation}}",
                severity: "warning",
              },
            },
            {
              type: "set_status",
              config: {
                statusSlug: "opportunity_found",
              },
            },
          ],
          isActive: true,
        });
      }
    }
  }

  const marketAnalysisModule = moduleResults["market-analysis"];
  if (marketAnalysisModule) {
    const competitorEntityId = marketAnalysisModule.entityIds["competitor_profile"];
    if (competitorEntityId) {
      const automationSlug = "competitor_threat_alert";
      const [existing] = await db.select().from(platformAutomationsTable)
        .where(eq(platformAutomationsTable.slug, automationSlug));

      if (!existing) {
        await db.insert(platformAutomationsTable).values({
          moduleId: marketAnalysisModule.moduleId,
          name: "התראה על מתחרה מאיים",
          slug: automationSlug,
          description: "שולח התראה כאשר מתחרה מדורג כאיום גבוה",
          triggerType: "on_update",
          triggerEntityId: competitorEntityId,
          triggerConfig: {},
          conditions: [
            { field: "threat_level", operator: "equals", value: "high" },
          ],
          actions: [
            {
              type: "send_notification",
              config: {
                title: "מתחרה מאיים - דורש תשומת לב",
                message: "המתחרה '{{competitor_name}}' דורג כאיום גבוה. נתח שוק: {{market_share_pct}}%, הערכה כוללת: {{overall_rating}}",
                severity: "warning",
              },
            },
          ],
          isActive: true,
        });
      }
    }
  }
}

router.post("/platform/migrate/strategy-modules", requireBuilderAccess, async (_req, res) => {
  try {
    const moduleResults: Record<string, { moduleId: number; entityIds: Record<string, number> }> = {};

    for (const moduleDef of MODULE_DEFINITIONS) {
      moduleResults[moduleDef.slug] = await ensureModule(moduleDef);
    }

    await ensureDashboards(moduleResults);
    await ensureAutomations(moduleResults);

    res.json({
      success: true,
      message: "Strategy, marketing, and analysis modules created successfully",
      modules: moduleResults,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Strategy Migration] Error:", err);
    res.status(500).json({ message });
  }
});

export default router;
