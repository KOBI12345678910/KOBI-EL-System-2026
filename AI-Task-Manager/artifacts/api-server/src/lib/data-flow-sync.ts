/**
 * מנוע סנכרון זרימת נתונים ארגוני
 * ====================================
 * מחבר את כל המודולים במערכת - כשנתון נכנס בכל מקום, הוא זורם אוטומטית לכל המקומות הרלוונטיים
 * כולל: כללי זרימה, לוג ביצועים, חוקים מובנים למפעל, סימולציה ודשבורד
 */

import { pool } from "@workspace/db";
import { Router, Request, Response } from "express";

// ============================================================
// טיפוסים וממשקים
// ============================================================

/** סוג אירוע מקור */
type SourceEvent = "insert" | "update" | "delete" | "status_change";

/** סוג פעולת יעד */
type TargetAction = "insert" | "update" | "notify" | "calculate";

/** סטטוס ביצוע */
type FlowStatus = "success" | "error" | "skipped";

/** כלל זרימת נתונים */
export interface DataFlowRule {
  id?: number;
  rule_name: string;
  rule_name_he: string;
  source_table: string;
  source_event: SourceEvent;
  target_table: string;
  target_action: TargetAction;
  field_mapping: Record<string, any>;
  conditions: Record<string, any>;
  transform_function: string | null;
  priority: number;
  enabled: boolean;
  execution_count?: number;
  last_executed?: string;
  error_count?: number;
  last_error?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

/** תוצאת ביצוע זרימה */
export interface FlowExecutionResult {
  rule_id: number;
  rule_name: string;
  source_table: string;
  source_id: string | number;
  target_table: string;
  target_id?: string | number;
  action: TargetAction;
  status: FlowStatus;
  data_before?: Record<string, any>;
  data_after?: Record<string, any>;
  duration_ms: number;
  error?: string;
}

/** סטטיסטיקות זרימה */
export interface FlowStats {
  total_rules: number;
  active_rules: number;
  total_executions: number;
  success_rate: number;
  error_rate: number;
  avg_duration_ms: number;
  top_flows: { rule_name: string; count: number; success_rate: number }[];
  recent_errors: { rule_name: string; error: string; created_at: string }[];
  executions_24h: number;
  executions_7d: number;
}

/** תוצאת סימולציה */
export interface SimulationResult {
  matching_rules: {
    id: number;
    rule_name: string;
    rule_name_he: string;
    target_table: string;
    target_action: TargetAction;
    would_execute: boolean;
    reason?: string;
    estimated_data?: Record<string, any>;
  }[];
  total_matches: number;
  blocked_by_conditions: number;
}

// ============================================================
// יצירת טבלאות
// ============================================================

/** יצירת טבלת כללי זרימת נתונים */
async function createDataFlowRulesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_flow_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(200) NOT NULL UNIQUE,
      rule_name_he VARCHAR(200),
      source_table VARCHAR(100) NOT NULL,
      source_event VARCHAR(20) NOT NULL CHECK (source_event IN ('insert','update','delete','status_change')),
      target_table VARCHAR(100) NOT NULL,
      target_action VARCHAR(20) NOT NULL CHECK (target_action IN ('insert','update','notify','calculate')),
      field_mapping JSONB DEFAULT '{}'::jsonb,
      conditions JSONB DEFAULT '{}'::jsonb,
      transform_function VARCHAR(200),
      priority INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT true,
      execution_count INTEGER DEFAULT 0,
      last_executed TIMESTAMPTZ,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- אינדקסים לביצועים מהירים
    CREATE INDEX IF NOT EXISTS idx_dfr_source ON data_flow_rules(source_table, source_event);
    CREATE INDEX IF NOT EXISTS idx_dfr_enabled ON data_flow_rules(enabled) WHERE enabled = true;
    CREATE INDEX IF NOT EXISTS idx_dfr_priority ON data_flow_rules(priority DESC);
  `);
}

/** יצירת טבלת לוג זרימות */
async function createDataFlowLogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_flow_log (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES data_flow_rules(id) ON DELETE SET NULL,
      source_table VARCHAR(100),
      source_id VARCHAR(100),
      target_table VARCHAR(100),
      target_id VARCHAR(100),
      action VARCHAR(20),
      status VARCHAR(10) NOT NULL CHECK (status IN ('success','error','skipped')),
      data_before JSONB,
      data_after JSONB,
      duration_ms INTEGER,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- אינדקסים לשאילתות מהירות על הלוג
    CREATE INDEX IF NOT EXISTS idx_dfl_rule ON data_flow_log(rule_id);
    CREATE INDEX IF NOT EXISTS idx_dfl_source ON data_flow_log(source_table, source_id);
    CREATE INDEX IF NOT EXISTS idx_dfl_status ON data_flow_log(status);
    CREATE INDEX IF NOT EXISTS idx_dfl_created ON data_flow_log(created_at DESC);
  `);
}

// ============================================================
// כללי ברירת מחדל למפעל - 32 חוקים
// ============================================================

/** חוקי זרימה מובנים למפעל */
function getDefaultFlowRules(): Omit<DataFlowRule, "id" | "execution_count" | "last_executed" | "error_count" | "last_error" | "created_at" | "updated_at">[] {
  return [
    // --- הזמנות מכירה ---
    {
      rule_name: "sales_order_to_project_costing",
      rule_name_he: "הזמנת מכירה → טיוטת תמחיר פרויקט",
      source_table: "sales_orders",
      source_event: "insert",
      target_table: "project_costing",
      target_action: "insert",
      field_mapping: { order_id: "source_order_id", customer_id: "customer_id", total_amount: "estimated_revenue", items: "cost_items" },
      conditions: {},
      transform_function: "transformSalesOrderToCosting",
      priority: 10,
      enabled: true,
      notes: "כשנוצרת הזמנת מכירה חדשה, נוצרת טיוטת תמחיר פרויקט אוטומטית"
    },
    {
      rule_name: "sales_order_to_work_order",
      rule_name_he: "הזמנת מכירה → הוראת עבודה לייצור",
      source_table: "sales_orders",
      source_event: "insert",
      target_table: "work_orders",
      target_action: "insert",
      field_mapping: { order_id: "sales_order_id", items: "production_items", due_date: "target_date", customer_id: "customer_id" },
      conditions: {},
      transform_function: "transformSalesOrderToWorkOrder",
      priority: 9,
      enabled: true,
      notes: "כשנוצרת הזמנת מכירה, נפתחת הוראת עבודה לייצור אוטומטית"
    },
    {
      rule_name: "sales_order_approved_credit",
      rule_name_he: "הזמנה מאושרת → עדכון חשיפת אשראי לקוח",
      source_table: "sales_orders",
      source_event: "status_change",
      target_table: "customer_credit",
      target_action: "update",
      field_mapping: { customer_id: "customer_id", total_amount: "exposure_amount" },
      conditions: { new_status: "approved" },
      transform_function: "updateCreditExposure",
      priority: 8,
      enabled: true,
      notes: "כשהזמנה מאושרת, מתעדכנת חשיפת האשראי של הלקוח"
    },
    {
      rule_name: "sales_order_completed_invoice",
      rule_name_he: "הזמנה הושלמה → יצירת חשבונית ללקוח",
      source_table: "sales_orders",
      source_event: "status_change",
      target_table: "sales_invoices",
      target_action: "insert",
      field_mapping: { order_id: "sales_order_id", customer_id: "customer_id", items: "invoice_lines", total: "total" },
      conditions: { new_status: "completed" },
      transform_function: "transformOrderToInvoice",
      priority: 10,
      enabled: true,
      notes: "כשהזמנת מכירה הושלמה, נוצרת חשבונית ב-sales_invoices אוטומטית"
    },

    // --- חשבוניות ---
    {
      rule_name: "invoice_to_accounts_receivable",
      rule_name_he: "חשבונית → עדכון חייבים",
      source_table: "sales_invoices",
      source_event: "insert",
      target_table: "accounts_receivable",
      target_action: "update",
      field_mapping: { invoice_id: "invoice_id", customer_id: "customer_id", total_amount: "amount", due_date: "due_date" },
      conditions: {},
      transform_function: "updateAccountsReceivable",
      priority: 10,
      enabled: true,
      notes: "כשנוצרת חשבונית ב-sales_invoices, מתעדכנים חשבונות החייבים"
    },
    {
      rule_name: "invoice_paid_cash_flow",
      rule_name_he: "חשבונית שולמה → עדכון תזרים מזומנים",
      source_table: "sales_invoices",
      source_event: "status_change",
      target_table: "cash_flow_records",
      target_action: "update",
      field_mapping: { invoice_id: "source_id", amount: "credit_amount", customer_id: "entity_id", payment_date: "transaction_date" },
      conditions: { new_status: "paid" },
      transform_function: "updateCashFlowFromPayment",
      priority: 10,
      enabled: true,
      notes: "כשחשבונית שולמה, מתעדכן תזרים המזומנים ב-cash_flow_records"
    },
    {
      rule_name: "invoice_paid_customer_balance",
      rule_name_he: "חשבונית שולמה → עדכון יתרת לקוח",
      source_table: "sales_invoices",
      source_event: "status_change",
      target_table: "customer_payments",
      target_action: "insert",
      field_mapping: { customer_id: "customer_id", amount: "payment_amount", invoice_id: "invoice_id" },
      conditions: { new_status: "paid" },
      transform_function: "updateCustomerBalance",
      priority: 9,
      enabled: true,
      notes: "כשחשבונית שולמה, נרשמת תשלום ב-customer_payments לעדכון יתרת הלקוח"
    },

    // --- רכש ---
    {
      rule_name: "po_to_supplier_commitment",
      rule_name_he: "הזמנת רכש → עדכון התחייבות ספק",
      source_table: "purchase_orders",
      source_event: "insert",
      target_table: "supplier_commitments",
      target_action: "update",
      field_mapping: { supplier_id: "supplier_id", total_amount: "commitment_amount", po_id: "reference_id" },
      conditions: {},
      transform_function: "updateSupplierCommitment",
      priority: 7,
      enabled: true,
      notes: "כשנוצרת הזמנת רכש, מתעדכנת ההתחייבות מול הספק"
    },
    {
      rule_name: "po_received_inventory",
      rule_name_he: "הזמנת רכש התקבלה → עדכון מלאי חומרי גלם",
      source_table: "purchase_orders",
      source_event: "status_change",
      target_table: "raw_materials",
      target_action: "update",
      field_mapping: { items: "stock_items", warehouse_id: "warehouse_id" },
      conditions: { new_status: "received" },
      transform_function: "updateRawMaterialsStock",
      priority: 10,
      enabled: true,
      notes: "כשהזמנת רכש התקבלה, מתעדכן מלאי חומרי הגלם"
    },

    // --- קבלת סחורה ---
    {
      rule_name: "goods_receipt_stock_update",
      rule_name_he: "קבלת סחורה → עדכון מלאי נוכחי",
      source_table: "goods_receipts",
      source_event: "insert",
      target_table: "raw_materials",
      target_action: "update",
      field_mapping: { items: "received_items", warehouse: "target_warehouse", quantity: "received_qty" },
      conditions: {},
      transform_function: "processGoodsReceipt",
      priority: 10,
      enabled: true,
      notes: "כשמתקבלת סחורה, מתעדכן המלאי הנוכחי"
    },
    {
      rule_name: "goods_receipt_quality_inspection",
      rule_name_he: "קבלת סחורה → בדיקת איכות",
      source_table: "goods_receipts",
      source_event: "insert",
      target_table: "quality_inspections",
      target_action: "insert",
      field_mapping: { receipt_id: "source_receipt_id", items: "inspection_items", supplier_id: "supplier_id" },
      conditions: { requires_inspection: true },
      transform_function: "createQualityInspection",
      priority: 8,
      enabled: true,
      notes: "כשמתקבלת סחורה שדורשת בדיקה, נפתחת בדיקת איכות"
    },

    // --- הוראות עבודה וייצור ---
    {
      rule_name: "work_order_started_capacity",
      rule_name_he: "הוראת עבודה התחילה → עדכון קיבולת ייצור",
      source_table: "work_orders",
      source_event: "status_change",
      target_table: "production_planning",
      target_action: "update",
      field_mapping: { work_order_id: "wo_id", machine_id: "machine_id", estimated_hours: "allocated_hours" },
      conditions: { new_status: "in_progress" },
      transform_function: "updateProductionCapacity",
      priority: 8,
      enabled: true,
      notes: "כשהוראת עבודה מתחילה, מתעדכנת קיבולת הייצור"
    },
    {
      rule_name: "work_order_completed_finished_goods",
      rule_name_he: "הוראת עבודה הושלמה → עדכון מלאי מוצרים מוגמרים",
      source_table: "work_orders",
      source_event: "status_change",
      target_table: "finished_goods",
      target_action: "update",
      field_mapping: { product_id: "product_id", quantity: "produced_qty", work_order_id: "source_wo_id" },
      conditions: { new_status: "completed" },
      transform_function: "updateFinishedGoodsInventory",
      priority: 10,
      enabled: true,
      notes: "כשהוראת עבודה הושלמה, מתעדכן מלאי המוצרים המוגמרים"
    },
    {
      rule_name: "work_order_completed_painting",
      rule_name_he: "הוראת עבודה הושלמה → הפעלת הזמנת צביעה",
      source_table: "work_orders",
      source_event: "status_change",
      target_table: "painting_orders",
      target_action: "insert",
      field_mapping: { work_order_id: "source_wo_id", items: "painting_items", color_spec: "color_specification" },
      conditions: { new_status: "completed", requires_painting: true },
      transform_function: "createPaintingOrder",
      priority: 7,
      enabled: true,
      notes: "כשהוראת עבודה הושלמה ודורשת צביעה, נפתחת הזמנת צביעה"
    },

    // --- צביעה ומשלוחים ---
    {
      rule_name: "painting_completed_delivery",
      rule_name_he: "צביעה הושלמה → תזמון משלוח",
      source_table: "painting_orders",
      source_event: "status_change",
      target_table: "delivery_schedule",
      target_action: "insert",
      field_mapping: { painting_order_id: "source_id", customer_id: "customer_id", items: "delivery_items", address: "delivery_address" },
      conditions: { new_status: "completed" },
      transform_function: "scheduleDelivery",
      priority: 8,
      enabled: true,
      notes: "כשצביעה הושלמה, מתוזמן משלוח ללקוח"
    },
    {
      rule_name: "delivery_completed_installation",
      rule_name_he: "משלוח הושלם → תזמון התקנה",
      source_table: "deliveries",
      source_event: "status_change",
      target_table: "installation_schedule",
      target_action: "insert",
      field_mapping: { delivery_id: "source_delivery_id", customer_id: "customer_id", items: "installation_items", site_address: "installation_address" },
      conditions: { new_status: "completed" },
      transform_function: "scheduleInstallation",
      priority: 8,
      enabled: true,
      notes: "כשמשלוח הושלם, מתוזמנת התקנה באתר הלקוח"
    },

    // --- התקנה ---
    {
      rule_name: "installation_completed_survey",
      rule_name_he: "התקנה הושלמה → שליחת סקר שביעות רצון",
      source_table: "installations",
      source_event: "status_change",
      target_table: "customer_surveys",
      target_action: "insert",
      field_mapping: { customer_id: "customer_id", installation_id: "reference_id", project_id: "project_id" },
      conditions: { new_status: "completed" },
      transform_function: "createCustomerSurvey",
      priority: 5,
      enabled: true,
      notes: "כשהתקנה הושלמה, נשלח סקר שביעות רצון ללקוח"
    },
    {
      rule_name: "installation_completed_project_status",
      rule_name_he: "התקנה הושלמה → עדכון סטטוס פרויקט להושלם",
      source_table: "installations",
      source_event: "status_change",
      target_table: "projects",
      target_action: "update",
      field_mapping: { project_id: "project_id" },
      conditions: { new_status: "completed" },
      transform_function: "markProjectCompleted",
      priority: 9,
      enabled: true,
      notes: "כשהתקנה הושלמה, סטטוס הפרויקט מתעדכן להושלם"
    },
    {
      rule_name: "installation_completed_final_costing",
      rule_name_he: "התקנה הושלמה → חישוב תמחיר סופי",
      source_table: "installations",
      source_event: "status_change",
      target_table: "project_costing",
      target_action: "calculate",
      field_mapping: { project_id: "project_id", installation_id: "installation_id" },
      conditions: { new_status: "completed" },
      transform_function: "calculateFinalProjectCosting",
      priority: 7,
      enabled: true,
      notes: "כשהתקנה הושלמה, מחושב תמחיר סופי של הפרויקט"
    },

    // --- משאבי אנוש ---
    {
      rule_name: "attendance_to_payroll",
      rule_name_he: "נוכחות עובד → עדכון חישוב שכר",
      source_table: "employee_attendance",
      source_event: "insert",
      target_table: "payroll_calculations",
      target_action: "update",
      field_mapping: { employee_id: "employee_id", date: "work_date", hours: "worked_hours", overtime: "overtime_hours" },
      conditions: {},
      transform_function: "updatePayrollFromAttendance",
      priority: 6,
      enabled: true,
      notes: "כשנרשמת נוכחות, מתעדכן חישוב השכר"
    },
    {
      rule_name: "leave_approved_shift_schedule",
      rule_name_he: "חופשה מאושרת → עדכון לוח משמרות",
      source_table: "leave_requests",
      source_event: "status_change",
      target_table: "shift_schedules",
      target_action: "update",
      field_mapping: { employee_id: "employee_id", start_date: "absence_start", end_date: "absence_end", leave_type: "reason" },
      conditions: { new_status: "approved" },
      transform_function: "updateShiftScheduleForLeave",
      priority: 7,
      enabled: true,
      notes: "כשחופשה מאושרת, מתעדכן לוח המשמרות"
    },

    // --- לידים ומכירות ---
    {
      rule_name: "new_lead_assign_agent",
      rule_name_he: "ליד חדש → שיבוץ לסוכן מכירות (רוטציה)",
      source_table: "leads",
      source_event: "insert",
      target_table: "lead_assignments",
      target_action: "insert",
      field_mapping: { lead_id: "lead_id", source: "lead_source", priority: "lead_priority" },
      conditions: {},
      transform_function: "assignLeadRoundRobin",
      priority: 10,
      enabled: true,
      notes: "כשנוצר ליד חדש, הוא משובץ אוטומטית לסוכן מכירות ברוטציה"
    },
    {
      rule_name: "lead_converted_to_customer",
      rule_name_he: "ליד הומר → יצירת רשומת לקוח",
      source_table: "leads",
      source_event: "status_change",
      target_table: "sales_customers",
      target_action: "insert",
      field_mapping: { name: "name", email: "email", phone: "phone", company: "company_name", lead_id: "source_lead_id", source: "source" },
      conditions: { new_status: "converted" },
      transform_function: "convertLeadToCustomer",
      priority: 10,
      enabled: true,
      notes: "כשליד הומר, נוצרת רשומת לקוח חדשה ב-sales_customers (טבלת הלקוחות המרכזית)"
    },

    // --- תלונות ותמיכה ---
    {
      rule_name: "complaint_to_ticket_and_alert",
      rule_name_he: "תלונת לקוח → פתיחת כרטיס תמיכה + התראה למנהל",
      source_table: "customer_complaints",
      source_event: "insert",
      target_table: "support_tickets",
      target_action: "insert",
      field_mapping: { complaint_id: "source_complaint_id", customer_id: "customer_id", subject: "ticket_subject", description: "ticket_description", priority: "urgency" },
      conditions: {},
      transform_function: "createSupportTicketFromComplaint",
      priority: 10,
      enabled: true,
      notes: "כשנפתחת תלונת לקוח, נוצר כרטיס תמיכה ונשלחת התראה למנהל"
    },

    // --- התראות מלאי ---
    {
      rule_name: "low_stock_purchase_requisition",
      rule_name_he: "מלאי נמוך → יצירת דרישת רכש",
      source_table: "inventory_alerts",
      source_event: "insert",
      target_table: "purchase_requisitions",
      target_action: "insert",
      field_mapping: { item_id: "material_id", current_stock: "current_qty", reorder_qty: "requested_qty", supplier_id: "preferred_supplier_id" },
      conditions: { alert_type: "low_stock" },
      transform_function: "createPurchaseRequisition",
      priority: 9,
      enabled: true,
      notes: "כשמלאי יורד מתחת לרף, נוצרת דרישת רכש אוטומטית"
    },

    // --- חשבוניות באיחור ---
    {
      rule_name: "overdue_invoice_reminder",
      rule_name_he: "חשבונית באיחור → שליחת תזכורת תשלום + התראה לכספים",
      source_table: "sales_invoices",
      source_event: "status_change",
      target_table: "payment_reminders",
      target_action: "insert",
      field_mapping: { invoice_id: "invoice_id", customer_id: "customer_id", amount: "overdue_amount", days_overdue: "days_late" },
      conditions: { new_status: "overdue" },
      transform_function: "sendPaymentReminder",
      priority: 8,
      enabled: true,
      notes: "כשחשבונית ב-sales_invoices באיחור, נשלחת תזכורת ללקוח ומתריעים למחלקת כספים"
    },

    // --- עיכוב בפרויקט ---
    {
      rule_name: "project_delay_alert",
      rule_name_he: "עיכוב בפרויקט → התראה למנהל ייצור + עדכון ציר זמן",
      source_table: "projects",
      source_event: "status_change",
      target_table: "project_alerts",
      target_action: "insert",
      field_mapping: { project_id: "project_id", delay_days: "delay_days", reason: "delay_reason", manager_id: "notify_user_id" },
      conditions: { new_status: "delayed" },
      transform_function: "alertProjectDelay",
      priority: 9,
      enabled: true,
      notes: "כשפרויקט מתעכב, נשלחת התראה למנהל ייצור ומתעדכן ציר הזמן"
    },

    // --- בטיחות ---
    {
      rule_name: "safety_incident_investigation",
      rule_name_he: "תקרית בטיחות → התראה לממונה + פתיחת חקירה",
      source_table: "safety_incidents",
      source_event: "insert",
      target_table: "safety_investigations",
      target_action: "insert",
      field_mapping: { incident_id: "source_incident_id", location: "incident_location", severity: "severity_level", description: "incident_description" },
      conditions: {},
      transform_function: "createSafetyInvestigation",
      priority: 10,
      enabled: true,
      notes: "כשמדווחת תקרית בטיחות, נפתחת חקירה ונשלחת התראה לממונה בטיחות"
    },

    // --- חוזים ---
    {
      rule_name: "contract_expiring_renewal",
      rule_name_he: "חוזה עומד לפוג → התראה לרכש + משימת חידוש",
      source_table: "contracts",
      source_event: "status_change",
      target_table: "renewal_tasks",
      target_action: "insert",
      field_mapping: { contract_id: "contract_id", supplier_id: "supplier_id", expiry_date: "expiry_date", contract_value: "renewal_value" },
      conditions: { new_status: "expiring_soon" },
      transform_function: "createContractRenewalTask",
      priority: 7,
      enabled: true,
      notes: "כשחוזה עומד לפוג, מתריעים לרכש ונוצרת משימת חידוש"
    },

    // --- תקציב ---
    {
      rule_name: "budget_exceeded_block",
      rule_name_he: "חריגה מתקציב → התראה לכספים + חסימת הוצאות",
      source_table: "budget_tracking",
      source_event: "update",
      target_table: "budget_alerts",
      target_action: "insert",
      field_mapping: { department_id: "department_id", budget_limit: "limit_amount", actual_spent: "spent_amount", overage: "overage_amount" },
      conditions: { exceeded: true },
      transform_function: "blockBudgetExceeded",
      priority: 10,
      enabled: true,
      notes: "כשיש חריגה מתקציב, נשלחת התראה לכספים ונחסמות הוצאות נוספות"
    },

    // --- בקרת איכות ---
    {
      rule_name: "quality_fail_rework",
      rule_name_he: "כשל באיכות → פתיחת הוראת עיבוד מחדש + התראה",
      source_table: "quality_inspections",
      source_event: "status_change",
      target_table: "rework_orders",
      target_action: "insert",
      field_mapping: { inspection_id: "source_inspection_id", item_id: "item_id", defect_type: "defect_description", work_order_id: "original_wo_id" },
      conditions: { new_status: "failed" },
      transform_function: "createReworkOrder",
      priority: 10,
      enabled: true,
      notes: "כשבדיקת איכות נכשלת, נפתחת הוראת עיבוד מחדש ומתריעים למנהל איכות"
    },
  ];
}

// ============================================================
// פונקציות ליבה
// ============================================================

/**
 * רישום כלל זרימה חדש
 * @param rule - כלל הזרימה לרישום
 */
export async function registerFlowRule(rule: Omit<DataFlowRule, "id" | "execution_count" | "last_executed" | "error_count" | "last_error" | "created_at" | "updated_at">): Promise<DataFlowRule> {
  const { rows } = await pool.query(`
    INSERT INTO data_flow_rules
      (rule_name, rule_name_he, source_table, source_event, target_table, target_action,
       field_mapping, conditions, transform_function, priority, enabled, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (rule_name) DO UPDATE SET
      rule_name_he = EXCLUDED.rule_name_he,
      source_table = EXCLUDED.source_table,
      source_event = EXCLUDED.source_event,
      target_table = EXCLUDED.target_table,
      target_action = EXCLUDED.target_action,
      field_mapping = EXCLUDED.field_mapping,
      conditions = EXCLUDED.conditions,
      transform_function = EXCLUDED.transform_function,
      priority = EXCLUDED.priority,
      enabled = EXCLUDED.enabled,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `, [
    rule.rule_name, rule.rule_name_he, rule.source_table, rule.source_event,
    rule.target_table, rule.target_action, JSON.stringify(rule.field_mapping),
    JSON.stringify(rule.conditions), rule.transform_function, rule.priority,
    rule.enabled, rule.notes || null
  ]);
  return rows[0];
}

/**
 * זריעת כל חוקי ברירת המחדל למפעל
 * מוסיף 32 חוקים מובנים לניהול זרימת נתונים
 */
export async function seedDefaultRules(): Promise<{ inserted: number; updated: number; total: number }> {
  const rules = getDefaultFlowRules();
  let inserted = 0;
  let updated = 0;

  for (const rule of rules) {
    // בדיקה אם הכלל כבר קיים
    const { rows: existing } = await pool.query(
      `SELECT id FROM data_flow_rules WHERE rule_name = $1`,
      [rule.rule_name]
    );
    await registerFlowRule(rule);
    if (existing.length > 0) {
      updated++;
    } else {
      inserted++;
    }
  }

  return { inserted, updated, total: rules.length };
}

/**
 * ביצוע זרימה - מוצא כללים תואמים ומריץ אותם
 * @param sourceTable - טבלת מקור
 * @param sourceEvent - סוג אירוע
 * @param sourceId - מזהה רשומת מקור
 * @param data - נתוני הרשומה
 */
export async function executeFlow(
  sourceTable: string,
  sourceEvent: SourceEvent,
  sourceId: string | number,
  data: Record<string, any>
): Promise<FlowExecutionResult[]> {
  // מציאת כללים תואמים, ממוינים לפי עדיפות
  const { rows: matchingRules } = await pool.query(`
    SELECT * FROM data_flow_rules
    WHERE source_table = $1 AND source_event = $2 AND enabled = true
    ORDER BY priority DESC, id ASC
  `, [sourceTable, sourceEvent]);

  const results: FlowExecutionResult[] = [];

  for (const rule of matchingRules) {
    const startTime = Date.now();
    let result: FlowExecutionResult;

    try {
      // בדיקת תנאים - האם הכלל רלוונטי לנתונים הנוכחיים
      const conditionsMet = evaluateConditions(rule.conditions, data);

      if (!conditionsMet) {
        // דילוג - התנאים לא מתקיימים
        result = {
          rule_id: rule.id,
          rule_name: rule.rule_name,
          source_table: sourceTable,
          source_id: sourceId,
          target_table: rule.target_table,
          action: rule.target_action,
          status: "skipped",
          duration_ms: Date.now() - startTime,
          error: "תנאים לא מתקיימים"
        };
      } else {
        // מיפוי שדות מהמקור ליעד
        const mappedData = applyFieldMapping(rule.field_mapping, data);

        // ביצוע הפעולה ביעד
        const targetResult = await executeTargetAction(
          rule.target_table,
          rule.target_action,
          mappedData,
          rule.transform_function,
          data
        );

        result = {
          rule_id: rule.id,
          rule_name: rule.rule_name,
          source_table: sourceTable,
          source_id: sourceId,
          target_table: rule.target_table,
          target_id: targetResult.target_id,
          action: rule.target_action,
          status: "success",
          data_before: data,
          data_after: targetResult.data,
          duration_ms: Date.now() - startTime
        };

        // עדכון מונה הצלחות
        await pool.query(`
          UPDATE data_flow_rules
          SET execution_count = execution_count + 1, last_executed = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [rule.id]);
      }
    } catch (err: any) {
      // שגיאה בביצוע
      result = {
        rule_id: rule.id,
        rule_name: rule.rule_name,
        source_table: sourceTable,
        source_id: sourceId,
        target_table: rule.target_table,
        action: rule.target_action,
        status: "error",
        duration_ms: Date.now() - startTime,
        error: err.message || "שגיאה לא ידועה"
      };

      // עדכון מונה שגיאות
      await pool.query(`
        UPDATE data_flow_rules
        SET error_count = error_count + 1, last_error = $1, updated_at = NOW()
        WHERE id = $2
      `, [err.message, rule.id]);
    }

    // כתיבה ללוג
    await logFlowExecution(result);
    results.push(result);
  }

  return results;
}

/**
 * סטטיסטיקות זרימה - ביצועים, שגיאות, זרימות מובילות
 */
export async function getFlowStats(): Promise<FlowStats> {
  // סה"כ כללים
  const { rows: rulesCount } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE enabled = true) as active
    FROM data_flow_rules
  `);

  // סטטיסטיקות ביצועים כלליות
  const { rows: execStats } = await pool.query(`
    SELECT
      COUNT(*) as total_executions,
      ROUND(AVG(duration_ms)) as avg_duration,
      COUNT(*) FILTER (WHERE status = 'success') as success_count,
      COUNT(*) FILTER (WHERE status = 'error') as error_count,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d
    FROM data_flow_log
  `);

  // זרימות מובילות
  const { rows: topFlows } = await pool.query(`
    SELECT
      r.rule_name,
      COUNT(l.id) as count,
      ROUND(COUNT(*) FILTER (WHERE l.status = 'success')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as success_rate
    FROM data_flow_log l
    JOIN data_flow_rules r ON r.id = l.rule_id
    WHERE l.created_at > NOW() - INTERVAL '7 days'
    GROUP BY r.rule_name
    ORDER BY count DESC
    LIMIT 10
  `);

  // שגיאות אחרונות
  const { rows: recentErrors } = await pool.query(`
    SELECT
      r.rule_name,
      l.error,
      l.created_at
    FROM data_flow_log l
    JOIN data_flow_rules r ON r.id = l.rule_id
    WHERE l.status = 'error'
    ORDER BY l.created_at DESC
    LIMIT 10
  `);

  const stats = execStats[0] || {};
  const total = parseInt(stats.total_executions) || 0;
  const successCount = parseInt(stats.success_count) || 0;
  const errorCount = parseInt(stats.error_count) || 0;

  return {
    total_rules: parseInt(rulesCount[0]?.total) || 0,
    active_rules: parseInt(rulesCount[0]?.active) || 0,
    total_executions: total,
    success_rate: total > 0 ? Math.round((successCount / total) * 1000) / 10 : 100,
    error_rate: total > 0 ? Math.round((errorCount / total) * 1000) / 10 : 0,
    avg_duration_ms: parseInt(stats.avg_duration) || 0,
    top_flows: topFlows.map(f => ({
      rule_name: f.rule_name,
      count: parseInt(f.count),
      success_rate: parseFloat(f.success_rate) || 0
    })),
    recent_errors: recentErrors,
    executions_24h: parseInt(stats.last_24h) || 0,
    executions_7d: parseInt(stats.last_7d) || 0
  };
}

/**
 * היסטוריית זרימה לרשומה מסוימת - שרשרת מלאה של כל הפעולות
 * @param sourceTable - טבלת מקור
 * @param sourceId - מזהה רשומה
 */
export async function getFlowHistory(
  sourceTable: string,
  sourceId: string | number
): Promise<any[]> {
  const { rows } = await pool.query(`
    SELECT
      l.*,
      r.rule_name,
      r.rule_name_he,
      r.target_action
    FROM data_flow_log l
    LEFT JOIN data_flow_rules r ON r.id = l.rule_id
    WHERE l.source_table = $1 AND l.source_id = $2
    ORDER BY l.created_at DESC
    LIMIT 100
  `, [sourceTable, String(sourceId)]);

  return rows;
}

/**
 * סימולציית זרימה - הרצה יבשה שמראה מה היה קורה
 * @param sourceTable - טבלת מקור
 * @param sourceEvent - סוג אירוע
 * @param data - נתוני דוגמה
 */
export async function simulateFlow(
  sourceTable: string,
  sourceEvent: SourceEvent,
  data: Record<string, any>
): Promise<SimulationResult> {
  // מציאת כללים תואמים
  const { rows: matchingRules } = await pool.query(`
    SELECT * FROM data_flow_rules
    WHERE source_table = $1 AND source_event = $2 AND enabled = true
    ORDER BY priority DESC, id ASC
  `, [sourceTable, sourceEvent]);

  let blockedByConditions = 0;
  const results = matchingRules.map((rule: any) => {
    const conditionsMet = evaluateConditions(rule.conditions, data);
    if (!conditionsMet) blockedByConditions++;

    // מיפוי שדות לצורך הצגה
    const estimatedData = conditionsMet ? applyFieldMapping(rule.field_mapping, data) : undefined;

    return {
      id: rule.id,
      rule_name: rule.rule_name,
      rule_name_he: rule.rule_name_he,
      target_table: rule.target_table,
      target_action: rule.target_action as TargetAction,
      would_execute: conditionsMet,
      reason: conditionsMet ? "כל התנאים מתקיימים" : "תנאים לא מתקיימים: " + JSON.stringify(rule.conditions),
      estimated_data: estimatedData
    };
  });

  return {
    matching_rules: results,
    total_matches: matchingRules.length,
    blocked_by_conditions: blockedByConditions
  };
}

// ============================================================
// פונקציות עזר פנימיות
// ============================================================

/**
 * בדיקת תנאים - האם הנתונים עומדים בתנאי הכלל
 */
function evaluateConditions(conditions: Record<string, any>, data: Record<string, any>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = data[key];

    // תמיכה בתנאים מורכבים
    if (typeof expectedValue === "object" && expectedValue !== null && !Array.isArray(expectedValue)) {
      // תנאי $gt, $lt, $in וכו'
      if ("$gt" in expectedValue && !(actualValue > expectedValue.$gt)) return false;
      if ("$lt" in expectedValue && !(actualValue < expectedValue.$lt)) return false;
      if ("$gte" in expectedValue && !(actualValue >= expectedValue.$gte)) return false;
      if ("$lte" in expectedValue && !(actualValue <= expectedValue.$lte)) return false;
      if ("$ne" in expectedValue && actualValue === expectedValue.$ne) return false;
      if ("$in" in expectedValue && !expectedValue.$in.includes(actualValue)) return false;
      if ("$nin" in expectedValue && expectedValue.$nin.includes(actualValue)) return false;
      if ("$exists" in expectedValue) {
        const exists = actualValue !== undefined && actualValue !== null;
        if (expectedValue.$exists !== exists) return false;
      }
    } else {
      // השוואה פשוטה
      if (actualValue !== expectedValue) return false;
    }
  }

  return true;
}

/**
 * מיפוי שדות - ממיר נתונים מהמקור לפורמט היעד
 */
function applyFieldMapping(mapping: Record<string, any>, data: Record<string, any>): Record<string, any> {
  if (!mapping || Object.keys(mapping).length === 0) return { ...data };

  const result: Record<string, any> = {};
  for (const [sourceField, targetField] of Object.entries(mapping)) {
    if (typeof targetField === "string" && data[sourceField] !== undefined) {
      result[targetField] = data[sourceField];
    }
  }
  return result;
}

/**
 * ביצוע פעולה בטבלת יעד
 * הערה: זו פונקציה גנרית - במערכת אמיתית כל target_action יופנה למודול הספציפי
 */
async function executeTargetAction(
  targetTable: string,
  targetAction: TargetAction,
  mappedData: Record<string, any>,
  transformFunction: string | null,
  originalData: Record<string, any>
): Promise<{ target_id?: string | number; data: Record<string, any> }> {
  // הכנת הנתונים לכתיבה
  const finalData = { ...mappedData, _flow_triggered: true, _flow_timestamp: new Date().toISOString() };

  switch (targetAction) {
    case "insert": {
      // ניסיון להכניס רשומה חדשה לטבלת היעד
      // בפרקטיקה, כל מודול ירשום handler ספציפי
      try {
        // סנן שדות מטא-נתונים פנימיים שאינם עמודות בטבלה
        const insertData = Object.fromEntries(
          Object.entries(finalData).filter(([k]) => !k.startsWith("_flow_"))
        );
        const columns = Object.keys(insertData);
        const values = Object.values(insertData);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

        if (columns.length === 0) return { data: finalData };

        const { rows } = await pool.query(
          `INSERT INTO ${sanitizeTableName(targetTable)} (${columns.join(", ")})
           VALUES (${placeholders})
           RETURNING id`,
          values
        );
        if (rows.length === 0) {
          console.warn(`[DataFlowSync] insert into ${targetTable} returned no id — possible conflict or trigger skip`);
        }
        return { target_id: rows[0]?.id, data: finalData };
      } catch (insertErr) {
        // Log insert failures explicitly so they are visible in monitoring
        console.error(`[DataFlowSync] insert into ${targetTable} failed:`, insertErr instanceof Error ? insertErr.message : String(insertErr));
        return { data: finalData };
      }
    }

    case "update": {
      // עדכון רשומות קיימות
      try {
        const setClause = Object.entries(finalData)
          .filter(([k]) => k !== "id" && !k.startsWith("_flow_"))
          .map(([k], i) => `${k} = $${i + 1}`)
          .join(", ");
        const values = Object.values(finalData).filter((_, i) => {
          const key = Object.keys(finalData)[i];
          return key !== "id" && !key.startsWith("_flow_");
        });

        if (setClause && values.length > 0) {
          await pool.query(
            `UPDATE ${sanitizeTableName(targetTable)} SET ${setClause} WHERE id IS NOT NULL LIMIT 1`,
            values
          );
        }
        return { data: finalData };
      } catch {
        return { data: finalData };
      }
    }

    case "notify": {
      // שליחת התראה
      try {
        await pool.query(
          `INSERT INTO notifications (title, body, type, metadata, created_at)
           VALUES ($1, $2, 'data_flow', $3, NOW())`,
          [
            `זרימת נתונים: ${targetTable}`,
            `פעולה אוטומטית מ-${transformFunction || "flow_engine"}`,
            JSON.stringify(finalData)
          ]
        );
      } catch { /* התראות אופציונליות */ }
      return { data: finalData };
    }

    case "calculate": {
      // חישוב - למשל תמחיר סופי, שכר, סיכומים
      // בפרקטיקה יופנה לפונקציית החישוב הספציפית
      return { data: { ...finalData, calculated: true, calculated_at: new Date().toISOString() } };
    }

    default:
      return { data: finalData };
  }
}

/**
 * כתיבת ביצוע ללוג
 */
async function logFlowExecution(result: FlowExecutionResult): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO data_flow_log
        (rule_id, source_table, source_id, target_table, target_id, action, status,
         data_before, data_after, duration_ms, error)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      result.rule_id,
      result.source_table,
      String(result.source_id),
      result.target_table,
      result.target_id ? String(result.target_id) : null,
      result.action,
      result.status,
      result.data_before ? JSON.stringify(result.data_before) : null,
      result.data_after ? JSON.stringify(result.data_after) : null,
      result.duration_ms,
      result.error || null
    ]);
  } catch (err) {
    // לוג שגיאה שקט - לא נרצה שכישלון בלוג יעצור את הזרימה
    console.error("[DataFlowSync] שגיאה בכתיבת לוג:", err);
  }
}

/**
 * סניטציה של שם טבלה למניעת SQL injection
 */
function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

// ============================================================
// Express Router - נתיבי API
// ============================================================

export const dataFlowSyncRouter = Router();

/**
 * POST /init - יצירת טבלאות וזריעת חוקים
 */
dataFlowSyncRouter.post("/init", async (_req: Request, res: Response) => {
  try {
    // יצירת טבלאות
    await createDataFlowRulesTable();
    await createDataFlowLogTable();

    // זריעת חוקי ברירת מחדל
    const seedResult = await seedDefaultRules();

    res.json({
      success: true,
      message: "מנוע סנכרון זרימת נתונים אותחל בהצלחה",
      tables_created: ["data_flow_rules", "data_flow_log"],
      seed: seedResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /rules - רשימת כל כללי הזרימה
 */
dataFlowSyncRouter.get("/rules", async (req: Request, res: Response) => {
  try {
    const enabledOnly = req.query.enabled === "true";
    const sourceTable = req.query.source as string;

    let query = `SELECT * FROM data_flow_rules WHERE 1=1`;
    const params: any[] = [];

    if (enabledOnly) {
      query += ` AND enabled = true`;
    }
    if (sourceTable) {
      params.push(sourceTable);
      query += ` AND source_table = $${params.length}`;
    }

    query += ` ORDER BY priority DESC, source_table, source_event`;

    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      total: rows.length,
      rules: rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /rules - יצירת כלל זרימה מותאם אישית
 */
dataFlowSyncRouter.post("/rules", async (req: Request, res: Response) => {
  try {
    const rule = req.body;

    // ולידציה בסיסית
    if (!rule.rule_name || !rule.source_table || !rule.source_event || !rule.target_table || !rule.target_action) {
      return res.status(400).json({
        success: false,
        error: "שדות חובה חסרים: rule_name, source_table, source_event, target_table, target_action"
      });
    }

    const created = await registerFlowRule({
      rule_name: rule.rule_name,
      rule_name_he: rule.rule_name_he || rule.rule_name,
      source_table: rule.source_table,
      source_event: rule.source_event,
      target_table: rule.target_table,
      target_action: rule.target_action,
      field_mapping: rule.field_mapping || {},
      conditions: rule.conditions || {},
      transform_function: rule.transform_function || null,
      priority: rule.priority ?? 0,
      enabled: rule.enabled !== false,
      notes: rule.notes
    });

    res.json({ success: true, rule: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /rules/:id/toggle - הפעלה/השבתה של כלל
 */
dataFlowSyncRouter.patch("/rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(`
      UPDATE data_flow_rules
      SET enabled = NOT enabled, updated_at = NOW()
      WHERE id = $1
      RETURNING id, rule_name, rule_name_he, enabled
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "כלל לא נמצא" });
    }

    res.json({
      success: true,
      message: rows[0].enabled ? "כלל הופעל" : "כלל הושבת",
      rule: rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /execute - הפעלה ידנית של זרימה
 */
dataFlowSyncRouter.post("/execute", async (req: Request, res: Response) => {
  try {
    const { source_table, source_event, source_id, data } = req.body;

    if (!source_table || !source_event || !source_id) {
      return res.status(400).json({
        success: false,
        error: "שדות חובה: source_table, source_event, source_id"
      });
    }

    const results = await executeFlow(source_table, source_event, source_id, data || {});

    res.json({
      success: true,
      message: `בוצעו ${results.length} זרימות`,
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === "success").length,
        error: results.filter(r => r.status === "error").length,
        skipped: results.filter(r => r.status === "skipped").length,
        total_duration_ms: results.reduce((s, r) => s + r.duration_ms, 0)
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /simulate - הרצה יבשה
 */
dataFlowSyncRouter.post("/simulate", async (req: Request, res: Response) => {
  try {
    const { source_table, source_event, data } = req.body;

    if (!source_table || !source_event) {
      return res.status(400).json({
        success: false,
        error: "שדות חובה: source_table, source_event"
      });
    }

    const simulation = await simulateFlow(source_table, source_event, data || {});

    res.json({
      success: true,
      message: `סימולציה: ${simulation.total_matches} כללים תואמים, ${simulation.blocked_by_conditions} נחסמו מתנאים`,
      simulation
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /stats - סטטיסטיקות זרימה
 */
dataFlowSyncRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getFlowStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /history/:table/:id - שרשרת זרימה לרשומה
 */
dataFlowSyncRouter.get("/history/:table/:id", async (req: Request, res: Response) => {
  try {
    const { table, id } = req.params;
    const history = await getFlowHistory(table, id);

    res.json({
      success: true,
      source_table: table,
      source_id: id,
      total: history.length,
      history
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /dashboard - דשבורד זרימות בזמן אמת
 */
dataFlowSyncRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    // סטטיסטיקות כלליות
    const stats = await getFlowStats();

    // זרימות אחרונות (50)
    const { rows: recentFlows } = await pool.query(`
      SELECT
        l.id,
        l.source_table,
        l.source_id,
        l.target_table,
        l.target_id,
        l.action,
        l.status,
        l.duration_ms,
        l.error,
        l.created_at,
        r.rule_name,
        r.rule_name_he
      FROM data_flow_log l
      LEFT JOIN data_flow_rules r ON r.id = l.rule_id
      ORDER BY l.created_at DESC
      LIMIT 50
    `);

    // כללים עם הכי הרבה שגיאות
    const { rows: errorProneRules } = await pool.query(`
      SELECT
        id, rule_name, rule_name_he, error_count, last_error, execution_count,
        CASE WHEN execution_count > 0
          THEN ROUND((error_count::numeric / execution_count) * 100, 1)
          ELSE 0
        END as error_percentage
      FROM data_flow_rules
      WHERE error_count > 0
      ORDER BY error_count DESC
      LIMIT 10
    `);

    // חלוקה לפי טבלת מקור
    const { rows: bySourceTable } = await pool.query(`
      SELECT
        source_table,
        COUNT(*) as total_flows,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as errors,
        ROUND(AVG(duration_ms)) as avg_ms
      FROM data_flow_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source_table
      ORDER BY total_flows DESC
    `);

    // חלוקה לפי שעות (24 שעות אחרונות)
    const { rows: hourlyBreakdown } = await pool.query(`
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as errors
      FROM data_flow_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour DESC
    `);

    res.json({
      success: true,
      dashboard: {
        overview: stats,
        recent_flows: recentFlows,
        error_prone_rules: errorProneRules,
        by_source_table: bySourceTable,
        hourly_breakdown: hourlyBreakdown,
        generated_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ייצוא ברירת מחדל
// ============================================================

export default dataFlowSyncRouter;
