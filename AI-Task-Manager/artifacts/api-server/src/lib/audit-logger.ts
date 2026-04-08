import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

interface AuditEntry {
  tableName: string;
  recordId?: number;
  action: "INSERT" | "UPDATE" | "DELETE" | "VIEW" | "EXPORT";
  userId?: number;
  userName?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  module?: string;
  description?: string;
}

const TABLE_NAMES_HE: Record<string, string> = {
  employees: "עובדים",
  suppliers: "ספקים",
  sales_customers: "לקוחות",
  products: "מוצרים",
  raw_materials: "חומרי גלם",
  purchase_orders: "הזמנות רכש",
  sales_orders: "הזמנות מכירה",
  work_orders: "הוראות עבודה",
  fixed_assets: "רכוש קבוע",
  customer_invoices: "חשבוניות לקוח",
  supplier_invoices: "חשבוניות ספק",
  price_quotes: "הצעות מחיר",
  projects: "פרויקטים",
  inventory_transactions: "תנועות מלאי",
  bank_accounts: "חשבונות בנק",
  expense_claims: "תביעות הוצאות",
  quality_inspections: "בדיקות איכות",
  maintenance_orders: "הוראות תחזוקה",
  budgets: "תקציבים",
  leave_requests: "בקשות חופשה",
  attendance_records: "נוכחות",
  payroll_records: "משכורות",
  training_records: "הכשרות",
  recruitment_records: "גיוס",
  shift_assignments: "משמרות",
  onboarding_tasks: "קליטת עובדים",
  support_tickets: "פניות תמיכה",
  standing_orders: "הוראות קבע",
  compliance_certificates: "תעודות תאימות",
  safety_incidents: "אירועי בטיחות",
  contractors: "קבלנים",
  bom_headers: "עץ מוצר",
  accounts_receivable: "חייבים",
  accounts_payable: "זכאים",
  general_ledger: "ספר חשבונות",
  chart_of_accounts: "תרשים חשבונות",
  journal_entries: "פקודות יומן",
  petty_cash: "קופה קטנה",
  letters_of_credit: "מכתבי אשראי",
  import_orders: "הזמנות יבוא",
  customs_clearances: "שחרור מכס",
  shipment_tracking: "מעקב משלוחים",
  crm_leads: "לידים",
  crm_opportunities: "הזדמנויות",
  competitors: "מתחרים",
  users: "משתמשים",
  roles: "תפקידים",
  permissions: "הרשאות",
};

export function getTableNameHe(table: string): string {
  return TABLE_NAMES_HE[table] || table;
}

function getChangedFields(oldVals: any, newVals: any): string[] {
  if (!oldVals || !newVals) return [];
  const changed: string[] = [];
  for (const key of Object.keys(newVals)) {
    if (key === "updated_at" || key === "created_at") continue;
    if (JSON.stringify(oldVals[key]) !== JSON.stringify(newVals[key])) {
      changed.push(key);
    }
  }
  return changed;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const changedFields = entry.action === "UPDATE"
      ? getChangedFields(entry.oldValues, entry.newValues)
      : [];

    const cfArray = changedFields.length > 0 ? `{${changedFields.join(",")}}` : null;

    await db.execute(sql`
      INSERT INTO audit_log (table_name, record_id, action, user_id, user_name, old_values, new_values, changed_fields, ip_address, user_agent, module, description)
      VALUES (${entry.tableName}, ${entry.recordId || null}, ${entry.action}, ${entry.userId || null}, ${entry.userName || null}, ${entry.oldValues ? JSON.stringify(entry.oldValues) : null}::jsonb, ${entry.newValues ? JSON.stringify(entry.newValues) : null}::jsonb, ${cfArray}::text[], ${entry.ipAddress || null}, ${entry.userAgent || null}, ${entry.module || null}, ${entry.description || null})
    `);
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export function extractUserInfo(req: any): { userId?: number; userName?: string; ipAddress?: string; userAgent?: string } {
  return {
    userId: req.user?.id || req.userId,
    userName: req.user?.fullNameHe || req.user?.fullName || req.user?.username,
    ipAddress: (req.headers?.["x-forwarded-for"] as string)?.split(",")[0] || req.socket?.remoteAddress,
    userAgent: req.headers?.["user-agent"],
  };
}

export async function auditCreate(req: any, tableName: string, recordId: number, newValues: any, module?: string) {
  const user = extractUserInfo(req);
  await logAudit({
    tableName, recordId, action: "INSERT", ...user, newValues, module,
    description: `נוצר רשומה חדשה ב${getTableNameHe(tableName)}`,
  });
}

export async function auditUpdate(req: any, tableName: string, recordId: number, oldValues: any, newValues: any, module?: string) {
  const user = extractUserInfo(req);
  const changed = getChangedFields(oldValues, newValues);
  if (changed.length === 0) return;
  await logAudit({
    tableName, recordId, action: "UPDATE", ...user, oldValues, newValues, module,
    description: `עודכנו ${changed.length} שדות ב${getTableNameHe(tableName)}: ${changed.join(", ")}`,
  });
}

export async function auditDelete(req: any, tableName: string, recordId: number, oldValues: any, module?: string) {
  const user = extractUserInfo(req);
  await logAudit({
    tableName, recordId, action: "DELETE", ...user, oldValues, module,
    description: `נמחקה רשומה מ${getTableNameHe(tableName)}`,
  });
}

export async function getRecordHistory(tableName: string, recordId: number) {
  const result = await db.execute(sql`SELECT * FROM audit_log WHERE table_name = ${tableName} AND record_id = ${recordId} ORDER BY created_at DESC`);
  return result.rows;
}
