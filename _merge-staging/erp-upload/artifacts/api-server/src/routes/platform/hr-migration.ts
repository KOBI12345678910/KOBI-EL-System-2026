import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityStatusesTable,
  entityCategoriesTable,
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
  showInList?: boolean;
  showInForm?: boolean;
  showInDetail?: boolean;
  sortOrder: number;
  settings?: Record<string, unknown>;
  options?: string[];
  fieldWidth?: string;
  formulaExpression?: string;
}

const EMPLOYEE_FIELDS: FieldDef[] = [
  { name: "מספר עובד", slug: "employee_number", fieldKey: "employee_number", fieldType: "auto_number", isRequired: true, isUnique: true, showInList: true, showInForm: false, showInDetail: true, isReadOnly: true, settings: { prefix: "EMP-", padding: 4, startValue: 1, incrementBy: 1 }, sortOrder: 0 },
  { name: "שם מלא", slug: "full_name", fieldKey: "full_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "שם פרטי", slug: "first_name", fieldKey: "first_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "שם משפחה", slug: "last_name", fieldKey: "last_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "שם באנגלית", slug: "full_name_en", fieldKey: "full_name_en", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "תעודת זהות", slug: "id_number", fieldKey: "id_number", fieldType: "text", isRequired: true, isUnique: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תאריך לידה", slug: "birth_date", fieldKey: "birth_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "מגדר", slug: "gender", fieldKey: "gender", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["male", "female", "other"], sortOrder: 7 },
  { name: "מצב משפחתי", slug: "marital_status", fieldKey: "marital_status", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["רווק/ה", "נשוי/אה", "גרוש/ה", "אלמן/ה"], sortOrder: 8 },
  { name: "מספר ילדים", slug: "children_count", fieldKey: "children_count", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "טלפון", slug: "phone", fieldKey: "phone", fieldType: "phone", showInList: true, showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "טלפון נוסף", slug: "phone2", fieldKey: "phone2", fieldType: "phone", showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "אימייל", slug: "email", fieldKey: "email", fieldType: "email", showInList: true, showInForm: true, showInDetail: true, sortOrder: 12 },
  { name: "כתובת", slug: "address", fieldKey: "address", fieldType: "address", showInForm: true, showInDetail: true, sortOrder: 13 },
  { name: "עיר", slug: "city", fieldKey: "city", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 14 },
  { name: "מיקוד", slug: "zip_code", fieldKey: "zip_code", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 15 },
  { name: "מחלקה", slug: "department", fieldKey: "department", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["ייצור", "מכירות", "הנהלה", "כספים", "לוגיסטיקה", "שירות", "הנדסה", "IT", "משאבי אנוש", "שיווק"], sortOrder: 16 },
  { name: "תפקיד", slug: "job_title", fieldKey: "job_title", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 17 },
  { name: "מנהל ישיר", slug: "manager_name", fieldKey: "manager_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 18 },
  { name: "סניף", slug: "branch", fieldKey: "branch", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 19 },
  { name: "קו ייצור", slug: "production_line", fieldKey: "production_line", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 20 },
  { name: "סוג העסקה", slug: "employment_type", fieldKey: "employment_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["full_time", "part_time", "contractor", "temporary", "intern"], sortOrder: 21 },
  { name: "תאריך תחילת עבודה", slug: "hire_date", fieldKey: "hire_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 22 },
  { name: "סוג חוזה", slug: "contract_type", fieldKey: "contract_type", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["אישי", "קיבוצי", "קבלן", "זמני"], sortOrder: 23 },
  { name: "תקופת ניסיון (חודשים)", slug: "probation_period", fieldKey: "probation_period", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 24 },
  { name: "סיום ניסיון", slug: "probation_end_date", fieldKey: "probation_end_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 25 },
  { name: "היקף משרה (%)", slug: "work_percentage", fieldKey: "work_percentage", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 100 }, sortOrder: 26 },
  { name: "ימי עבודה בשבוע", slug: "work_days_per_week", fieldKey: "work_days_per_week", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 1, max: 7 }, sortOrder: 27 },
  { name: "שעות שבועיות", slug: "weekly_hours", fieldKey: "weekly_hours", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 28 },
  { name: "שכר בסיס", slug: "base_salary", fieldKey: "base_salary", fieldType: "currency", isRequired: true, showInList: true, showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 29 },
  { name: "שעות נוספות חודשיות", slug: "overtime_hours", fieldKey: "overtime_hours", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 30 },
  { name: "בונוס", slug: "bonus", fieldKey: "bonus", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 31 },
  { name: "עמלות", slug: "commission", fieldKey: "commission", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 32 },
  { name: "קצובת נסיעות", slug: "travel_allowance", fieldKey: "travel_allowance", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 33 },
  { name: "קצובת טלפון", slug: "phone_allowance", fieldKey: "phone_allowance", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 34 },
  { name: "שווי רכב", slug: "car_value", fieldKey: "car_value", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 35 },
  { name: "בנק", slug: "bank_name", fieldKey: "bank_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 36 },
  { name: "מספר בנק", slug: "bank_number", fieldKey: "bank_number", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 37 },
  { name: "סניף בנק", slug: "bank_branch", fieldKey: "bank_branch", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 38 },
  { name: "מספר חשבון", slug: "bank_account", fieldKey: "bank_account", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 39 },
  { name: "קופת פנסיה", slug: "pension_fund", fieldKey: "pension_fund", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 40 },
  { name: "הפרשת עובד (%)", slug: "pension_employee_pct", fieldKey: "pension_employee_pct", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 100 }, sortOrder: 41 },
  { name: "הפרשת מעסיק (%)", slug: "pension_employer_pct", fieldKey: "pension_employer_pct", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 100 }, sortOrder: 42 },
  { name: "קרן השתלמות", slug: "training_fund", fieldKey: "training_fund", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 43 },
  { name: "ביטוח מנהלים", slug: "managers_insurance", fieldKey: "managers_insurance", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 44 },
  { name: "ימי חופשה שנתיים", slug: "annual_vacation_days", fieldKey: "annual_vacation_days", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 45 },
  { name: "ימי מחלה צבורים", slug: "sick_days_balance", fieldKey: "sick_days_balance", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 46 },
  { name: "ימי חופשה נותרים", slug: "vacation_days_remaining", fieldKey: "vacation_days_remaining", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 47 },
  { name: "הכנסה חודשית מעובד", slug: "monthly_revenue", fieldKey: "monthly_revenue", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 48 },
  { name: "פרויקטים שהושלמו", slug: "projects_completed", fieldKey: "projects_completed", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 49 },
  { name: "שביעות רצון לקוחות", slug: "client_satisfaction", fieldKey: "client_satisfaction", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 5 }, sortOrder: 50 },
  { name: "ציון הערכה אחרון", slug: "last_review_score", fieldKey: "last_review_score", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 51 },
  { name: "תאריך הערכה אחרון", slug: "last_review_date", fieldKey: "last_review_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 52 },
  { name: "איש קשר חירום - שם", slug: "emergency_contact_name", fieldKey: "emergency_contact_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 53 },
  { name: "איש קשר חירום - טלפון", slug: "emergency_contact_phone", fieldKey: "emergency_contact_phone", fieldType: "phone", showInForm: true, showInDetail: true, sortOrder: 54 },
  { name: "איש קשר חירום - קרבה", slug: "emergency_contact_relation", fieldKey: "emergency_contact_relation", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 55 },
  { name: "חוזה חתום", slug: "contract_signed", fieldKey: "contract_signed", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 56 },
  { name: "טופס 101 הוגש", slug: "form_101_submitted", fieldKey: "form_101_submitted", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 57 },
  { name: "תאריך טופס 101", slug: "form_101_date", fieldKey: "form_101_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 58 },
  { name: "מודל תשלום", slug: "payment_model", fieldKey: "payment_model", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["per_meter", "percentage", "fixed", "hourly"], sortOrder: 59 },
  { name: "תעריף", slug: "rate", fieldKey: "rate", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 60 },
  { name: "יחידות שהושלמו", slug: "units_completed", fieldKey: "units_completed", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 61 },
  { name: "ערך פרויקט", slug: "project_value", fieldKey: "project_value", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 62 },
  { name: "אחוז תעריף", slug: "percentage_rate", fieldKey: "percentage_rate", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 63 },
  { name: "התמחות", slug: "specialty", fieldKey: "specialty", fieldType: "text", showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 64 },
  { name: "קבלן", slug: "is_contractor", fieldKey: "is_contractor", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 65 },
  { name: "סוג ביטוח בריאות", slug: "health_insurance_type", fieldKey: "health_insurance_type", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["בסיסי", "כסף", "זהב", "פלטינום", "ללא"], sortOrder: 66 },
  { name: "אחוז קרן השתלמות", slug: "training_fund_pct", fieldKey: "training_fund_pct", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 10 }, sortOrder: 67 },
  { name: "יצרן רכב", slug: "car_make", fieldKey: "car_make", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 68 },
  { name: "דגם רכב", slug: "car_model", fieldKey: "car_model", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 69 },
  { name: "קצובת ארוחות", slug: "meal_allowance", fieldKey: "meal_allowance", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 70 },
];

const ATTENDANCE_FIELDS: FieldDef[] = [
  { name: "עובד", slug: "employee_id", fieldKey: "employee_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שם עובד", slug: "employee_name", fieldKey: "employee_name", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תאריך", slug: "date", fieldKey: "date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "סוג", slug: "type", fieldKey: "type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["present", "absent", "late", "sick_leave", "vacation", "military", "holiday"], sortOrder: 3 },
  { name: "שעת כניסה", slug: "check_in", fieldKey: "check_in", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "שעת יציאה", slug: "check_out", fieldKey: "check_out", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "סה\"כ שעות", slug: "total_hours", fieldKey: "total_hours", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "שעות נוספות", slug: "overtime_hours", fieldKey: "overtime_hours", fieldType: "number", showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "אושר ע\"י", slug: "approved_by", fieldKey: "approved_by", fieldType: "text", showInDetail: true, sortOrder: 9 },
  { name: "סטטוס אישור", slug: "approval_status", fieldKey: "approval_status", fieldType: "single_select", showInList: true, showInDetail: true, options: ["pending", "approved", "rejected"], sortOrder: 10 },
  { name: "GPS כניסה - קו רוחב", slug: "checkin_lat", fieldKey: "checkin_lat", fieldType: "number", showInDetail: true, sortOrder: 11 },
  { name: "GPS כניסה - קו אורך", slug: "checkin_lng", fieldKey: "checkin_lng", fieldType: "number", showInDetail: true, sortOrder: 12 },
  { name: "GPS יציאה - קו רוחב", slug: "checkout_lat", fieldKey: "checkout_lat", fieldType: "number", showInDetail: true, sortOrder: 13 },
  { name: "GPS יציאה - קו אורך", slug: "checkout_lng", fieldKey: "checkout_lng", fieldType: "number", showInDetail: true, sortOrder: 14 },
  { name: "כתובת כניסה", slug: "checkin_address", fieldKey: "checkin_address", fieldType: "text", showInDetail: true, sortOrder: 15 },
  { name: "כתובת יציאה", slug: "checkout_address", fieldKey: "checkout_address", fieldType: "text", showInDetail: true, sortOrder: 16 },
];

const SHIFT_FIELDS: FieldDef[] = [
  { name: "עובד", slug: "employee_id", fieldKey: "employee_id", fieldType: "relation", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שם עובד", slug: "employee_name", fieldKey: "employee_name", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "תאריך משמרת", slug: "shift_date", fieldKey: "shift_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "שם משמרת", slug: "shift_name", fieldKey: "shift_name", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 3 },
  { name: "תבנית", slug: "template_name", fieldKey: "template_name", fieldType: "text", showInForm: true, showInDetail: true, sortOrder: 4 },
  { name: "סוג משמרת", slug: "shift_type", fieldKey: "shift_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["morning", "afternoon", "evening", "night", "full_day"], sortOrder: 5 },
  { name: "שעת התחלה", slug: "start_time", fieldKey: "start_time", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "שעת סיום", slug: "end_time", fieldKey: "end_time", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "תוספת שכר (%)", slug: "pay_premium_pct", fieldKey: "pay_premium_pct", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 9 },
];

const PAYROLL_RUN_FIELDS: FieldDef[] = [
  { name: "חודש", slug: "month", fieldKey: "month", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 0 },
  { name: "שנה", slug: "year", fieldKey: "year", fieldType: "number", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 1 },
  { name: "תקופה", slug: "period", fieldKey: "period", fieldType: "text", isRequired: true, isUnique: true, showInList: true, showInDetail: true, isReadOnly: true, sortOrder: 2 },
  { name: "סטטוס", slug: "run_status", fieldKey: "run_status", fieldType: "single_select", isRequired: true, showInList: true, showInDetail: true, options: ["draft", "calculated", "approved", "paid", "cancelled"], sortOrder: 3 },
  { name: "מספר עובדים", slug: "employee_count", fieldKey: "employee_count", fieldType: "number", showInList: true, showInDetail: true, isReadOnly: true, sortOrder: 4 },
  { name: "סה\"כ ברוטו", slug: "total_gross", fieldKey: "total_gross", fieldType: "currency", showInList: true, showInDetail: true, isReadOnly: true, settings: { currency: "ILS" }, sortOrder: 5 },
  { name: "סה\"כ ניכויים", slug: "total_deductions", fieldKey: "total_deductions", fieldType: "currency", showInList: true, showInDetail: true, isReadOnly: true, settings: { currency: "ILS" }, sortOrder: 6 },
  { name: "סה\"כ נטו", slug: "total_net", fieldKey: "total_net", fieldType: "currency", showInList: true, showInDetail: true, isReadOnly: true, settings: { currency: "ILS" }, sortOrder: 7 },
  { name: "עלות מעסיק כוללת", slug: "total_employer_cost", fieldKey: "total_employer_cost", fieldType: "currency", showInList: true, showInDetail: true, isReadOnly: true, settings: { currency: "ILS" }, sortOrder: 8 },
  { name: "הורץ ע\"י", slug: "run_by", fieldKey: "run_by", fieldType: "text", showInDetail: true, isReadOnly: true, sortOrder: 9 },
  { name: "תאריך חישוב", slug: "calculated_at", fieldKey: "calculated_at", fieldType: "date", showInList: true, showInDetail: true, isReadOnly: true, sortOrder: 10 },
  { name: "אושר ע\"י", slug: "approved_by", fieldKey: "approved_by", fieldType: "text", showInDetail: true, sortOrder: 11 },
  { name: "תאריך אישור", slug: "approved_at", fieldKey: "approved_at", fieldType: "date", showInDetail: true, sortOrder: 12 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 13 },
];

const PAYSLIP_FIELDS: FieldDef[] = [
  { name: "ריצת שכר", slug: "payroll_run_id", fieldKey: "payroll_run_id", fieldType: "relation", isRequired: true, showInList: true, showInDetail: true, sortOrder: 0 },
  { name: "עובד", slug: "employee_id", fieldKey: "employee_id", fieldType: "relation", isRequired: true, showInList: true, showInDetail: true, sortOrder: 1 },
  { name: "שם עובד", slug: "employee_name", fieldKey: "employee_name", fieldType: "text", showInList: true, showInDetail: true, isSearchable: true, sortOrder: 2 },
  { name: "מחלקה", slug: "department", fieldKey: "department", fieldType: "text", showInList: true, showInDetail: true, sortOrder: 3 },
  { name: "תפקיד", slug: "job_title", fieldKey: "job_title", fieldType: "text", showInDetail: true, sortOrder: 4 },
  { name: "תקופה", slug: "period", fieldKey: "period", fieldType: "text", isRequired: true, showInList: true, showInDetail: true, sortOrder: 5 },
  { name: "שכר בסיס", slug: "base_salary", fieldKey: "base_salary", fieldType: "currency", showInList: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 6 },
  { name: "שעות נוספות", slug: "overtime_hours", fieldKey: "overtime_hours", fieldType: "number", showInDetail: true, sortOrder: 7 },
  { name: "תשלום שעות נוספות", slug: "overtime_pay", fieldKey: "overtime_pay", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 8 },
  { name: "בונוס", slug: "bonus", fieldKey: "bonus", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 9 },
  { name: "עמלות", slug: "commission", fieldKey: "commission", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 10 },
  { name: "שכר ברוטו", slug: "gross_salary", fieldKey: "gross_salary", fieldType: "currency", showInList: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 11 },
  { name: "מס הכנסה", slug: "income_tax", fieldKey: "income_tax", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 12 },
  { name: "ביטוח לאומי", slug: "national_insurance", fieldKey: "national_insurance", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 13 },
  { name: "ביטוח בריאות", slug: "health_insurance", fieldKey: "health_insurance", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 14 },
  { name: "הפרשת פנסיה עובד", slug: "pension_employee", fieldKey: "pension_employee", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 15 },
  { name: "סה\"כ ניכויים", slug: "total_deductions", fieldKey: "total_deductions", fieldType: "currency", showInList: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 16 },
  { name: "שכר נטו", slug: "net_salary", fieldKey: "net_salary", fieldType: "currency", showInList: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 17 },
  { name: "הפרשת פנסיה מעסיק", slug: "pension_employer", fieldKey: "pension_employer", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 18 },
  { name: "הפרשת פיצויים", slug: "severance_contrib", fieldKey: "severance_contrib", fieldType: "currency", showInDetail: true, settings: { currency: "ILS" }, sortOrder: 19 },
  { name: "עלות מעסיק כוללת", slug: "total_employer_cost", fieldKey: "total_employer_cost", fieldType: "currency", showInList: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 20 },
];

const CONTRACTOR_AGREEMENT_FIELDS: FieldDef[] = [
  { name: "קבלן", slug: "contractor_id", fieldKey: "contractor_id", fieldType: "relation", isRequired: true, showInList: true, showInDetail: true, sortOrder: 0 },
  { name: "שם קבלן", slug: "contractor_name", fieldKey: "contractor_name", fieldType: "text", showInList: true, showInDetail: true, isSearchable: true, sortOrder: 1 },
  { name: "התמחות", slug: "specialty", fieldKey: "specialty", fieldType: "text", showInList: true, showInForm: true, showInDetail: true, sortOrder: 2 },
  { name: "מודל תשלום", slug: "payment_model", fieldKey: "payment_model", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["per_meter", "percentage", "fixed", "hourly"], sortOrder: 3 },
  { name: "תעריף", slug: "rate", fieldKey: "rate", fieldType: "currency", isRequired: true, showInList: true, showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 4 },
  { name: "אחוז תעריף", slug: "percentage_rate", fieldKey: "percentage_rate", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "תאריך התחלה", slug: "start_date", fieldKey: "start_date", fieldType: "date", isRequired: true, showInList: true, showInForm: true, showInDetail: true, sortOrder: 6 },
  { name: "תאריך סיום", slug: "end_date", fieldKey: "end_date", fieldType: "date", showInForm: true, showInDetail: true, sortOrder: 7 },
  { name: "יעד מרווח (%)", slug: "target_margin", fieldKey: "target_margin", fieldType: "number", showInForm: true, showInDetail: true, settings: { min: 0, max: 100 }, sortOrder: 8 },
  { name: "תיאור עבודה", slug: "work_description", fieldKey: "work_description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "תנאי תשלום", slug: "payment_terms", fieldKey: "payment_terms", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["מזומן", "שוטף 30", "שוטף 60", "שוטף +30"], sortOrder: 10 },
  { name: "הערות", slug: "notes", fieldKey: "notes", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 11 },
];

const SALARY_COMPONENT_FIELDS: FieldDef[] = [
  { name: "שם רכיב", slug: "component_name", fieldKey: "component_name", fieldType: "text", isRequired: true, showInList: true, showInForm: true, showInDetail: true, isSearchable: true, sortOrder: 0 },
  { name: "סוג רכיב", slug: "component_type", fieldKey: "component_type", fieldType: "single_select", isRequired: true, showInList: true, showInForm: true, showInDetail: true, options: ["earning", "deduction", "employer_contrib"], sortOrder: 1 },
  { name: "קטגוריה", slug: "category", fieldKey: "category", fieldType: "single_select", showInList: true, showInForm: true, showInDetail: true, options: ["base", "overtime", "bonus", "commission", "allowance", "tax", "social", "pension", "health", "other"], sortOrder: 2 },
  { name: "שיטת חישוב", slug: "calculation_method", fieldKey: "calculation_method", fieldType: "single_select", isRequired: true, showInForm: true, showInDetail: true, options: ["fixed", "percentage", "tiered", "formula"], sortOrder: 3 },
  { name: "ערך קבוע", slug: "fixed_amount", fieldKey: "fixed_amount", fieldType: "currency", showInForm: true, showInDetail: true, settings: { currency: "ILS" }, sortOrder: 4 },
  { name: "אחוז", slug: "percentage_value", fieldKey: "percentage_value", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 5 },
  { name: "בסיס חישוב", slug: "calculation_base", fieldKey: "calculation_base", fieldType: "single_select", showInForm: true, showInDetail: true, options: ["gross", "base", "net", "custom"], sortOrder: 6 },
  { name: "מדרגות", slug: "tiers", fieldKey: "tiers", fieldType: "json", showInDetail: true, sortOrder: 7 },
  { name: "חל על כולם", slug: "applies_to_all", fieldKey: "applies_to_all", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 8 },
  { name: "סדר חישוב", slug: "calc_order", fieldKey: "calc_order", fieldType: "number", showInForm: true, showInDetail: true, sortOrder: 9 },
  { name: "חובה", slug: "is_mandatory", fieldKey: "is_mandatory", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 10 },
  { name: "חייב במס", slug: "is_taxable", fieldKey: "is_taxable", fieldType: "boolean", showInForm: true, showInDetail: true, sortOrder: 11 },
  { name: "תיאור", slug: "description", fieldKey: "description", fieldType: "long_text", showInForm: true, showInDetail: true, sortOrder: 12 },
];

const EMPLOYEE_STATUSES = [
  { name: "פעיל", slug: "active", color: "green", isDefault: true, sortOrder: 0 },
  { name: "ניסיון", slug: "probation", color: "blue", sortOrder: 1 },
  { name: "בחופשה", slug: "on_leave", color: "yellow", sortOrder: 2 },
  { name: "מושעה", slug: "suspended", color: "orange", sortOrder: 3 },
  { name: "סיום העסקה", slug: "terminated", color: "red", sortOrder: 4 },
  { name: "טיוטה", slug: "draft", color: "slate", sortOrder: 5 },
];

const EMPLOYEE_CATEGORIES = [
  { name: "ייצור", slug: "production", color: "blue", sortOrder: 0 },
  { name: "מכירות", slug: "sales", color: "green", sortOrder: 1 },
  { name: "הנהלה", slug: "management", color: "purple", sortOrder: 2 },
  { name: "כספים", slug: "finance", color: "emerald", sortOrder: 3 },
  { name: "לוגיסטיקה", slug: "logistics", color: "orange", sortOrder: 4 },
  { name: "שירות", slug: "service", color: "cyan", sortOrder: 5 },
  { name: "הנדסה", slug: "engineering", color: "indigo", sortOrder: 6 },
  { name: "קבלנים", slug: "contractors", color: "rose", sortOrder: 7 },
];

const PAYROLL_RUN_STATUSES = [
  { name: "טיוטה", slug: "draft", color: "slate", isDefault: true, sortOrder: 0 },
  { name: "חושב", slug: "calculated", color: "blue", sortOrder: 1 },
  { name: "מאושר", slug: "approved", color: "green", sortOrder: 2 },
  { name: "שולם", slug: "paid", color: "emerald", sortOrder: 3 },
  { name: "מבוטל", slug: "cancelled", color: "red", sortOrder: 4 },
];

interface NewEntityDef {
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
  statuses?: typeof PAYROLL_RUN_STATUSES;
}

const NEW_ENTITIES: NewEntityDef[] = [
  {
    name: "ריצת שכר", nameHe: "ריצת שכר", nameEn: "Payroll Run",
    namePlural: "ריצות שכר", slug: "payroll_run", entityKey: "payroll_run",
    tableName: "payroll_runs", description: "ריצת חישוב שכר חודשי",
    icon: "Calculator", primaryDisplayField: "period", sortOrder: 4,
    fields: PAYROLL_RUN_FIELDS, statuses: PAYROLL_RUN_STATUSES,
  },
  {
    name: "תלוש שכר", nameHe: "תלוש שכר", nameEn: "Payslip",
    namePlural: "תלושי שכר", slug: "payslip", entityKey: "payslip",
    tableName: "payslips", description: "תלוש שכר חודשי לעובד",
    icon: "FileText", primaryDisplayField: "employee_name", sortOrder: 5,
    fields: PAYSLIP_FIELDS,
  },
  {
    name: "הסכם קבלן", nameHe: "הסכם קבלן", nameEn: "Contractor Agreement",
    namePlural: "הסכמי קבלנים", slug: "contractor_agreement", entityKey: "contractor_agreement",
    tableName: "contractor_agreements", description: "הסכם עבודה עם קבלן",
    icon: "Briefcase", primaryDisplayField: "contractor_name", sortOrder: 6,
    fields: CONTRACTOR_AGREEMENT_FIELDS,
  },
  {
    name: "רכיב שכר", nameHe: "רכיב שכר", nameEn: "Salary Component",
    namePlural: "רכיבי שכר", slug: "salary_component", entityKey: "salary_component",
    tableName: "salary_components", description: "רכיב שכר להגדרת חישובי שכר",
    icon: "Layers", primaryDisplayField: "component_name", sortOrder: 7,
    fields: SALARY_COMPONENT_FIELDS,
  },
];

async function ensureFieldsForEntity(entityId: number, fields: FieldDef[]) {
  const existingFields = await db.select().from(entityFieldsTable)
    .where(eq(entityFieldsTable.entityId, entityId));

  const existingSlugs = new Set(existingFields.map(f => f.slug));
  let added = 0;

  for (const fieldDef of fields) {
    if (existingSlugs.has(fieldDef.slug)) continue;
    try {
      await db.insert(entityFieldsTable).values({
        entityId,
        name: fieldDef.name,
        slug: fieldDef.slug,
        fieldKey: fieldDef.fieldKey,
        fieldType: fieldDef.fieldType,
        isRequired: fieldDef.isRequired || false,
        isUnique: fieldDef.isUnique || false,
        isReadOnly: fieldDef.isReadOnly || false,
        isCalculated: fieldDef.isCalculated || false,
        isSearchable: fieldDef.isSearchable || false,
        showInList: fieldDef.showInList || false,
        showInForm: fieldDef.showInForm !== false,
        showInDetail: fieldDef.showInDetail !== false,
        sortOrder: fieldDef.sortOrder,
        settings: fieldDef.settings || {},
        options: fieldDef.options || [],
        fieldWidth: fieldDef.fieldWidth || "full",
        formulaExpression: fieldDef.formulaExpression || null,
      });
      added++;
    } catch (err) {
      console.error(`Failed to add field ${fieldDef.slug} to entity ${entityId}:`, err);
    }
  }
  return added;
}

async function ensureStatuses(entityId: number, statuses: typeof EMPLOYEE_STATUSES) {
  const existing = await db.select().from(entityStatusesTable)
    .where(eq(entityStatusesTable.entityId, entityId));
  if (existing.length > 0) return 0;

  let added = 0;
  for (const status of statuses) {
    try {
      await db.insert(entityStatusesTable).values({
        entityId,
        name: status.name,
        slug: status.slug,
        color: status.color,
        isDefault: status.isDefault || false,
        sortOrder: status.sortOrder,
      });
      added++;
    } catch (err) {
      console.error(`Failed to add status ${status.slug}:`, err);
    }
  }
  return added;
}

async function ensureCategories(entityId: number, categories: typeof EMPLOYEE_CATEGORIES) {
  const existing = await db.select().from(entityCategoriesTable)
    .where(eq(entityCategoriesTable.entityId, entityId));
  if (existing.length > 0) return 0;

  let added = 0;
  for (const cat of categories) {
    try {
      await db.insert(entityCategoriesTable).values({
        entityId,
        name: cat.name,
        slug: cat.slug,
        color: cat.color,
        sortOrder: cat.sortOrder,
      });
      added++;
    } catch (err) {
      console.error(`Failed to add category ${cat.slug}:`, err);
    }
  }
  return added;
}

router.post("/platform/migrate/hr", requireSuperAdmin, async (_req, res) => {
  try {
    const results: Record<string, unknown> = {};

    const [hrModule] = await db.select().from(platformModulesTable)
      .where(eq(platformModulesTable.id, 8));

    if (!hrModule) {
      res.status(404).json({ error: "HR module (id=8) not found" });
      return;
    }

    const [empEntity] = await db.select().from(moduleEntitiesTable)
      .where(and(eq(moduleEntitiesTable.id, 34), eq(moduleEntitiesTable.moduleId, 8)));
    if (empEntity) {
      const fieldsAdded = await ensureFieldsForEntity(34, EMPLOYEE_FIELDS);
      const statusesAdded = await ensureStatuses(34, EMPLOYEE_STATUSES);
      const categoriesAdded = await ensureCategories(34, EMPLOYEE_CATEGORIES);
      results.employees = { entityId: 34, fieldsAdded, statusesAdded, categoriesAdded };
    } else {
      results.employees = { error: "Entity 34 not found" };
    }

    const [attEntity] = await db.select().from(moduleEntitiesTable)
      .where(and(eq(moduleEntitiesTable.id, 35), eq(moduleEntitiesTable.moduleId, 8)));
    if (attEntity) {
      const fieldsAdded = await ensureFieldsForEntity(35, ATTENDANCE_FIELDS);
      results.attendance = { entityId: 35, fieldsAdded };
    } else {
      results.attendance = { error: "Entity 35 not found" };
    }

    const [shiftEntity] = await db.select().from(moduleEntitiesTable)
      .where(and(eq(moduleEntitiesTable.id, 36), eq(moduleEntitiesTable.moduleId, 8)));
    if (shiftEntity) {
      const fieldsAdded = await ensureFieldsForEntity(36, SHIFT_FIELDS);
      results.shifts = { entityId: 36, fieldsAdded };
    } else {
      results.shifts = { error: "Entity 36 not found" };
    }

    for (const def of NEW_ENTITIES) {
      let [entity] = await db.select().from(moduleEntitiesTable)
        .where(and(eq(moduleEntitiesTable.slug, def.slug), eq(moduleEntitiesTable.moduleId, 8)));

      if (!entity) {
        [entity] = await db.insert(moduleEntitiesTable).values({
          moduleId: 8,
          name: def.name,
          nameHe: def.nameHe,
          nameEn: def.nameEn,
          namePlural: def.namePlural,
          slug: def.slug,
          entityKey: def.entityKey,
          tableName: def.tableName,
          description: def.description,
          icon: def.icon,
          entityType: "primary",
          primaryDisplayField: def.primaryDisplayField,
          hasStatus: true,
          hasAudit: true,
          sortOrder: def.sortOrder,
        }).returning();
      }

      const fieldsAdded = await ensureFieldsForEntity(entity.id, def.fields);
      let statusesAdded = 0;
      if (def.statuses) {
        statusesAdded = await ensureStatuses(entity.id, def.statuses);
      }
      results[def.slug] = { entityId: entity.id, fieldsAdded, statusesAdded };
    }

    res.json({ message: "HR migration completed", results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("HR migration failed:", message);
    res.status(500).json({ error: message });
  }
});

export default router;
