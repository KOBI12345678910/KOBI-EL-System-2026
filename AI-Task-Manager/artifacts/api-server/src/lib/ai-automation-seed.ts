/**
 * BASH44 AI Automation Seed — 100 Automations + 50 Prompts
 *
 * Covers: Finance, Procurement, Inventory, Production, Projects, Sales, Service, CEO, HR
 * Each automation has: code, name, domain, trigger, agent, prompt, execution mode
 * Each prompt has: code, name, domain, goal, inputs, output schema
 */

// ═══════════════════════════════════════════════════════════════
// 100 AUTOMATIONS
// ═══════════════════════════════════════════════════════════════
export const AUTOMATION_SEED = [
  // ─── Finance (1-15) ───
  { code: "FIN_001", name: "סריקת סיכון תזרים יומית", domain: "finance", entityType: "cashflow", triggerType: "scheduled_daily", agentCode: "FINANCE_AI", promptCode: "FIN_CASHFLOW_001", executionMode: "suggest_only", severity: "high" },
  { code: "FIN_002", name: "התראת חוב לקוח באיחור", domain: "finance", entityType: "ar_invoice", triggerType: "on_overdue", agentCode: "COLLECTIONS_AGENT", promptCode: "FIN_COLLECT_001", executionMode: "create_task", severity: "high" },
  { code: "FIN_003", name: "סריקת חריגות הוצאות", domain: "finance", entityType: "expense", triggerType: "scheduled_hourly", agentCode: "ANOMALY_DETECTOR", promptCode: "FIN_ANOMALY_001", executionMode: "alert", severity: "medium" },
  { code: "FIN_004", name: "חסימת פקודת יומן לא מאוזנת", domain: "finance", entityType: "journal_entry", triggerType: "on_post", agentCode: "AUDIT_GUARD", promptCode: "FIN_BALANCE_001", executionMode: "block_if_invalid", severity: "critical" },
  { code: "FIN_005", name: "התראת שחיקת רווחיות פרויקט", domain: "finance", entityType: "project", triggerType: "on_cost_update", agentCode: "MARGIN_GUARD", promptCode: "FIN_MARGIN_001", executionMode: "alert", severity: "high" },
  { code: "FIN_006", name: "ניתוח סטיית תקציב", domain: "finance", entityType: "budget", triggerType: "on_threshold_breach", agentCode: "FINANCE_AI", promptCode: "FIN_BUDGET_001", executionMode: "suggest_only", severity: "medium" },
  { code: "FIN_007", name: "תחזית תשלומי ספקים", domain: "finance", entityType: "ap_invoice", triggerType: "scheduled_weekly", agentCode: "FINANCE_AI", promptCode: "FIN_PAYMENT_001", executionMode: "draft", severity: "medium" },
  { code: "FIN_008", name: "התאמת בנק אוטומטית", domain: "finance", entityType: "bank_transaction", triggerType: "on_import", agentCode: "FINANCE_AI", promptCode: "FIN_RECON_001", executionMode: "suggest_only", severity: "medium" },
  { code: "FIN_009", name: "סיכום רווח והפסד שבועי", domain: "finance", entityType: "pnl", triggerType: "scheduled_weekly", agentCode: "DASHBOARD_NARRATOR", promptCode: "FIN_PNL_001", executionMode: "generate_report", severity: "low" },
  { code: "FIN_010", name: 'חישוב מע"מ חודשי', domain: "finance", entityType: "tax", triggerType: "scheduled_monthly", agentCode: "FINANCE_AI", promptCode: "FIN_VAT_001", executionMode: "draft", severity: "high" },
  { code: "FIN_011", name: "זיהוי חשבוניות כפולות", domain: "finance", entityType: "ap_invoice", triggerType: "on_create", agentCode: "ANOMALY_DETECTOR", promptCode: "FIN_DUP_001", executionMode: "block_if_invalid", severity: "high" },
  { code: "FIN_012", name: "תחזית תזרים 90 יום", domain: "finance", entityType: "cashflow", triggerType: "scheduled_weekly", agentCode: "FORECAST_AGENT", promptCode: "FIN_FORECAST_001", executionMode: "generate_report", severity: "medium" },
  { code: "FIN_013", name: "התראת חריגה מתקציב מחלקה", domain: "finance", entityType: "department_budget", triggerType: "on_threshold_breach", agentCode: "FINANCE_AI", promptCode: "FIN_DEPT_001", executionMode: "alert", severity: "medium" },
  { code: "FIN_014", name: "סריקת נכסים קבועים לפחת", domain: "finance", entityType: "fixed_asset", triggerType: "scheduled_monthly", agentCode: "FINANCE_AI", promptCode: "FIN_DEPR_001", executionMode: "draft", severity: "low" },
  { code: "FIN_015", name: "עדכון שערי חליפין", domain: "finance", entityType: "exchange_rate", triggerType: "scheduled_daily", agentCode: "FINANCE_AI", promptCode: "FIN_FX_001", executionMode: "execute_if_rule_allows", severity: "low" },

  // ─── Procurement (16-30) ───
  { code: "PROC_001", name: "סריקת מחסור מלאי → דרישת רכש", domain: "procurement", entityType: "item", triggerType: "on_inventory_shortage", agentCode: "PROCUREMENT_AI", promptCode: "PROC_REORDER_001", executionMode: "draft", severity: "high" },
  { code: "PROC_002", name: "המלצת ספק מיטבי", domain: "procurement", entityType: "purchase_requisition", triggerType: "on_approve", agentCode: "PROCUREMENT_AI", promptCode: "PROC_SUPPLIER_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROC_003", name: "השוואת הצעות מחיר", domain: "procurement", entityType: "rfq", triggerType: "on_complete", agentCode: "PROCUREMENT_AI", promptCode: "PROC_COMPARE_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROC_004", name: "התראת עליית מחיר ספק", domain: "procurement", entityType: "price_quote", triggerType: "on_create", agentCode: "ANOMALY_DETECTOR", promptCode: "PROC_PRICE_001", executionMode: "alert", severity: "high" },
  { code: "PROC_005", name: "מעקב Lead Time חריג", domain: "procurement", entityType: "purchase_order", triggerType: "on_overdue", agentCode: "PROCUREMENT_AI", promptCode: "PROC_LEAD_001", executionMode: "alert", severity: "high" },
  { code: "PROC_006", name: "הכנת טיוטת הזמנת רכש", domain: "procurement", entityType: "purchase_requisition", triggerType: "on_approve", agentCode: "PROCUREMENT_AI", promptCode: "PROC_PO_001", executionMode: "draft", severity: "medium" },
  { code: "PROC_007", name: "סריקת שדות חסרים בדרישת רכש", domain: "procurement", entityType: "purchase_requisition", triggerType: "on_create", agentCode: "FIELD_COMPLETION", promptCode: "PROC_FIELDS_001", executionMode: "suggest_only", severity: "low" },
  { code: "PROC_008", name: "תזכורת אישור רכש ממתין", domain: "procurement", entityType: "approval_request", triggerType: "on_overdue", agentCode: "PROCUREMENT_AI", promptCode: "PROC_REMIND_001", executionMode: "send_notification", severity: "medium" },
  { code: "PROC_009", name: "Three-Way Match חריג", domain: "procurement", entityType: "goods_receipt", triggerType: "on_create", agentCode: "AUDIT_GUARD", promptCode: "PROC_MATCH_001", executionMode: "alert", severity: "high" },
  { code: "PROC_010", name: "דירוג ספקים רבעוני", domain: "procurement", entityType: "supplier", triggerType: "scheduled_quarterly", agentCode: "PROCUREMENT_AI", promptCode: "PROC_SCORE_001", executionMode: "generate_report", severity: "medium" },
  { code: "PROC_011", name: "חיסכון עלויות — ניתוח", domain: "procurement", entityType: "purchase_order", triggerType: "scheduled_monthly", agentCode: "PROCUREMENT_AI", promptCode: "PROC_SAVE_001", executionMode: "generate_report", severity: "low" },
  { code: "PROC_012", name: "ספק לא פעיל 90 יום", domain: "procurement", entityType: "supplier", triggerType: "scheduled_weekly", agentCode: "PROCUREMENT_AI", promptCode: "PROC_INACTIVE_001", executionMode: "alert", severity: "low" },
  { code: "PROC_013", name: "מו\"מ אוטומטי מול ספק", domain: "procurement", entityType: "rfq", triggerType: "on_threshold_breach", agentCode: "SUPPLIER_NEGOTIATION", promptCode: "PROC_NEGO_001", executionMode: "draft", severity: "medium" },
  { code: "PROC_014", name: "בדיקת תנאי תשלום ספק", domain: "procurement", entityType: "purchase_order", triggerType: "on_create", agentCode: "PROCUREMENT_AI", promptCode: "PROC_TERMS_001", executionMode: "suggest_only", severity: "low" },
  { code: "PROC_015", name: "סריקת חוזה ספק לפני חידוש", domain: "procurement", entityType: "supplier_contract", triggerType: "on_expiry_approaching", agentCode: "PROCUREMENT_AI", promptCode: "PROC_CONTRACT_001", executionMode: "create_task", severity: "medium" },

  // ─── Inventory (31-45) ───
  { code: "INV_001", name: "סריקת מלאי שלילי", domain: "inventory", entityType: "stock", triggerType: "on_update", agentCode: "INVENTORY_AI", promptCode: "INV_NEGATIVE_001", executionMode: "block_if_invalid", severity: "critical" },
  { code: "INV_002", name: "זיהוי Dead Stock", domain: "inventory", entityType: "stock", triggerType: "scheduled_weekly", agentCode: "INVENTORY_AI", promptCode: "INV_DEAD_001", executionMode: "generate_report", severity: "medium" },
  { code: "INV_003", name: "זיהוי פריטים מהירי תנועה", domain: "inventory", entityType: "stock", triggerType: "scheduled_weekly", agentCode: "INVENTORY_AI", promptCode: "INV_FAST_001", executionMode: "generate_report", severity: "low" },
  { code: "INV_004", name: "המלצת הזמנה מחדש", domain: "inventory", entityType: "item", triggerType: "on_threshold_breach", agentCode: "INVENTORY_AI", promptCode: "INV_REORDER_001", executionMode: "draft", severity: "high" },
  { code: "INV_005", name: "חריגת ספירת מלאי", domain: "inventory", entityType: "cycle_count", triggerType: "on_complete", agentCode: "ANOMALY_DETECTOR", promptCode: "INV_COUNT_001", executionMode: "alert", severity: "high" },
  { code: "INV_006", name: "המלצת העברה בין מחסנים", domain: "inventory", entityType: "stock", triggerType: "on_threshold_breach", agentCode: "INVENTORY_AI", promptCode: "INV_TRANSFER_001", executionMode: "suggest_only", severity: "medium" },
  { code: "INV_007", name: "מעקב שווי מלאי", domain: "inventory", entityType: "inventory_valuation", triggerType: "scheduled_daily", agentCode: "INVENTORY_AI", promptCode: "INV_VALUE_001", executionMode: "generate_report", severity: "medium" },
  { code: "INV_008", name: "חריגת קליטת סחורה מ-PO", domain: "inventory", entityType: "goods_receipt", triggerType: "on_create", agentCode: "AUDIT_GUARD", promptCode: "INV_GRN_001", executionMode: "alert", severity: "high" },
  { code: "INV_009", name: "ספירת מלאי מחזורית — תזמון", domain: "inventory", entityType: "warehouse", triggerType: "scheduled_monthly", agentCode: "SCHEDULING_AGENT", promptCode: "INV_SCHED_001", executionMode: "create_task", severity: "low" },
  { code: "INV_010", name: "פריט ללא תנועה 180 יום", domain: "inventory", entityType: "item", triggerType: "scheduled_monthly", agentCode: "INVENTORY_AI", promptCode: "INV_STALE_001", executionMode: "alert", severity: "low" },
  { code: "INV_011", name: "התראת תפוגה", domain: "inventory", entityType: "lot", triggerType: "on_expiry_approaching", agentCode: "INVENTORY_AI", promptCode: "INV_EXPIRE_001", executionMode: "alert", severity: "high" },
  { code: "INV_012", name: "הזמנה מינימלית חסכונית", domain: "inventory", entityType: "item", triggerType: "on_reorder", agentCode: "INVENTORY_AI", promptCode: "INV_EOQ_001", executionMode: "suggest_only", severity: "low" },
  { code: "INV_013", name: "סנכרון מלאי ב-WMS", domain: "inventory", entityType: "warehouse", triggerType: "scheduled_hourly", agentCode: "INVENTORY_AI", promptCode: "INV_SYNC_001", executionMode: "execute_if_rule_allows", severity: "medium" },
  { code: "INV_014", name: "ABC ניתוח מלאי", domain: "inventory", entityType: "item", triggerType: "scheduled_monthly", agentCode: "INVENTORY_AI", promptCode: "INV_ABC_001", executionMode: "generate_report", severity: "low" },
  { code: "INV_015", name: "חריגת עלות יחידה", domain: "inventory", entityType: "goods_receipt", triggerType: "on_create", agentCode: "ANOMALY_DETECTOR", promptCode: "INV_COST_001", executionMode: "alert", severity: "medium" },

  // ─── Production (46-60) ───
  { code: "PROD_001", name: "בדיקת חומרים לפני שחרור WO", domain: "production", entityType: "work_order", triggerType: "on_release", agentCode: "PRODUCTION_AI", promptCode: "PROD_MATCHECK_001", executionMode: "block_if_invalid", severity: "critical" },
  { code: "PROD_002", name: "צוואר בקבוק בתחנה", domain: "production", entityType: "workstation", triggerType: "on_threshold_breach", agentCode: "PRODUCTION_AI", promptCode: "PROD_BOTTLE_001", executionMode: "alert", severity: "high" },
  { code: "PROD_003", name: "סטיית עבודה בפועל vs תכנון", domain: "production", entityType: "work_order", triggerType: "on_update", agentCode: "PRODUCTION_AI", promptCode: "PROD_LABOR_001", executionMode: "alert", severity: "medium" },
  { code: "PROD_004", name: "עדכון תחזית סיום", domain: "production", entityType: "work_order", triggerType: "on_update", agentCode: "FORECAST_AGENT", promptCode: "PROD_ETA_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROD_005", name: "המלצת סדר עדיפויות ייצור", domain: "production", entityType: "work_order", triggerType: "scheduled_daily", agentCode: "WORK_ORDER_OPTIMIZER", promptCode: "PROD_PRIORITY_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROD_006", name: "פקודת עבודה באיחור", domain: "production", entityType: "work_order", triggerType: "on_overdue", agentCode: "PRODUCTION_AI", promptCode: "PROD_DELAY_001", executionMode: "alert", severity: "high" },
  { code: "PROD_007", name: "תמחיר ייצור — עדכון", domain: "production", entityType: "work_order", triggerType: "on_complete", agentCode: "PRODUCTION_AI", promptCode: "PROD_COST_001", executionMode: "execute_if_rule_allows", severity: "medium" },
  { code: "PROD_008", name: "ניפוק חומרים אוטומטי", domain: "production", entityType: "work_order", triggerType: "on_release", agentCode: "PRODUCTION_AI", promptCode: "PROD_ISSUE_001", executionMode: "draft", severity: "medium" },
  { code: "PROD_009", name: "ניתוח OEE יומי", domain: "production", entityType: "production_line", triggerType: "scheduled_daily", agentCode: "DASHBOARD_NARRATOR", promptCode: "PROD_OEE_001", executionMode: "generate_report", severity: "low" },
  { code: "PROD_010", name: "תחזוקה מונעת — תזכורת", domain: "production", entityType: "machine", triggerType: "on_schedule", agentCode: "SCHEDULING_AGENT", promptCode: "PROD_MAINT_001", executionMode: "create_task", severity: "medium" },
  { code: "PROD_011", name: "פסילת QC → חקירת שורש", domain: "production", entityType: "qc_inspection", triggerType: "on_fail", agentCode: "PRODUCTION_AI", promptCode: "PROD_QC_001", executionMode: "create_task", severity: "high" },
  { code: "PROD_012", name: "BOM חסר רכיבים", domain: "production", entityType: "bom", triggerType: "on_create", agentCode: "FIELD_COMPLETION", promptCode: "PROD_BOM_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROD_013", name: "ניתוח פחת ייצור", domain: "production", entityType: "work_order", triggerType: "scheduled_weekly", agentCode: "PRODUCTION_AI", promptCode: "PROD_SCRAP_001", executionMode: "generate_report", severity: "low" },
  { code: "PROD_014", name: "מעקב בטיחות ייצור", domain: "production", entityType: "safety_incident", triggerType: "on_create", agentCode: "AUDIT_GUARD", promptCode: "PROD_SAFETY_001", executionMode: "escalate", severity: "critical" },
  { code: "PROD_015", name: "סנכרון WO עם פרויקט", domain: "production", entityType: "work_order", triggerType: "on_complete", agentCode: "PRODUCTION_AI", promptCode: "PROD_SYNC_001", executionMode: "execute_if_rule_allows", severity: "medium" },

  // ─── Projects (61-75) ───
  { code: "PROJ_001", name: "שדות חובה חסרים בפרויקט", domain: "projects", entityType: "project", triggerType: "on_save", agentCode: "FIELD_COMPLETION", promptCode: "PROJ_FIELDS_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROJ_002", name: "חריגה מתקציב פרויקט", domain: "projects", entityType: "project", triggerType: "on_threshold_breach", agentCode: "PROJECT_AI", promptCode: "PROJ_BUDGET_001", executionMode: "alert", severity: "high" },
  { code: "PROJ_003", name: "עיכוב אבן דרך", domain: "projects", entityType: "milestone", triggerType: "on_overdue", agentCode: "PROJECT_AI", promptCode: "PROJ_MILE_001", executionMode: "alert", severity: "high" },
  { code: "PROJ_004", name: "ירידת מרווח רווחיות", domain: "projects", entityType: "project", triggerType: "on_cost_update", agentCode: "MARGIN_GUARD", promptCode: "PROJ_MARGIN_001", executionMode: "alert", severity: "high" },
  { code: "PROJ_005", name: "פער BOQ — זיהוי", domain: "projects", entityType: "boq", triggerType: "on_update", agentCode: "PROJECT_AI", promptCode: "PROJ_BOQ_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROJ_006", name: "שינוי הזמנה לא מתועד", domain: "projects", entityType: "change_order", triggerType: "on_missing_data", agentCode: "PROJECT_AI", promptCode: "PROJ_CHANGE_001", executionMode: "create_task", severity: "medium" },
  { code: "PROJ_007", name: "סיכום פרויקט שבועי", domain: "projects", entityType: "project", triggerType: "scheduled_weekly", agentCode: "DASHBOARD_NARRATOR", promptCode: "PROJ_SUMMARY_001", executionMode: "generate_report", severity: "low" },
  { code: "PROJ_008", name: "ניתוח Earned Value", domain: "projects", entityType: "project", triggerType: "scheduled_weekly", agentCode: "PROJECT_AI", promptCode: "PROJ_EV_001", executionMode: "generate_report", severity: "medium" },
  { code: "PROJ_009", name: "זיהוי סיכון חדש", domain: "projects", entityType: "project_risk", triggerType: "on_create", agentCode: "PROJECT_AI", promptCode: "PROJ_RISK_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROJ_010", name: "תזכורת עדכון התקדמות", domain: "projects", entityType: "project", triggerType: "scheduled_weekly", agentCode: "PROJECT_AI", promptCode: "PROJ_PROGRESS_001", executionMode: "send_notification", severity: "low" },
  { code: "PROJ_011", name: "חישוב עלות בפועל vs תקציב", domain: "projects", entityType: "project", triggerType: "on_cost_update", agentCode: "PROJECT_AI", promptCode: "PROJ_ACTUAL_001", executionMode: "execute_if_rule_allows", severity: "medium" },
  { code: "PROJ_012", name: "תחזית סיום פרויקט", domain: "projects", entityType: "project", triggerType: "scheduled_weekly", agentCode: "FORECAST_AGENT", promptCode: "PROJ_FORECAST_001", executionMode: "suggest_only", severity: "medium" },
  { code: "PROJ_013", name: "בדיקת חוזה לקוח תקף", domain: "projects", entityType: "project", triggerType: "on_create", agentCode: "AUDIT_GUARD", promptCode: "PROJ_CONTRACT_001", executionMode: "block_if_invalid", severity: "high" },
  { code: "PROJ_014", name: "ניתוח רווחיות לקוח", domain: "projects", entityType: "customer", triggerType: "scheduled_monthly", agentCode: "PROJECT_AI", promptCode: "PROJ_CUSTPROFIT_001", executionMode: "generate_report", severity: "low" },
  { code: "PROJ_015", name: "אוטו-הקצאת משאבים", domain: "projects", entityType: "project_resource", triggerType: "on_create", agentCode: "SCHEDULING_AGENT", promptCode: "PROJ_RESOURCE_001", executionMode: "suggest_only", severity: "medium" },

  // ─── Sales (76-85) ───
  { code: "SALES_001", name: "ליד תקוע — מעקב", domain: "sales", entityType: "lead", triggerType: "on_overdue", agentCode: "SALES_AI", promptCode: "SALES_STALL_001", executionMode: "create_task", severity: "medium" },
  { code: "SALES_002", name: "טיוטת הצעת מחיר", domain: "sales", entityType: "rfq", triggerType: "on_create", agentCode: "SALES_AI", promptCode: "SALES_QUOTE_001", executionMode: "draft", severity: "medium" },
  { code: "SALES_003", name: "רצפת מחיר — בדיקה", domain: "sales", entityType: "quotation", triggerType: "on_create", agentCode: "PRICING_AGENT", promptCode: "SALES_FLOOR_001", executionMode: "block_if_invalid", severity: "high" },
  { code: "SALES_004", name: "ניקוד לידים", domain: "sales", entityType: "lead", triggerType: "on_update", agentCode: "SALES_AI", promptCode: "SALES_SCORE_001", executionMode: "execute_if_rule_allows", severity: "low" },
  { code: "SALES_005", name: "הזדמנות Upsell", domain: "sales", entityType: "customer", triggerType: "scheduled_weekly", agentCode: "SALES_AI", promptCode: "SALES_UPSELL_001", executionMode: "suggest_only", severity: "low" },
  { code: "SALES_006", name: "סיכום מכירות שבועי", domain: "sales", entityType: "sales_order", triggerType: "scheduled_weekly", agentCode: "DASHBOARD_NARRATOR", promptCode: "SALES_SUMMARY_001", executionMode: "generate_report", severity: "low" },
  { code: "SALES_007", name: "הצעת מחיר ללא תגובה 7 ימים", domain: "sales", entityType: "quotation", triggerType: "on_overdue", agentCode: "SALES_AI", promptCode: "SALES_FOLLOW_001", executionMode: "send_notification", severity: "medium" },
  { code: "SALES_008", name: "בדיקת מרווח הצעת מחיר", domain: "sales", entityType: "quotation", triggerType: "on_create", agentCode: "MARGIN_GUARD", promptCode: "SALES_MARGIN_001", executionMode: "alert", severity: "high" },
  { code: "SALES_009", name: "תחזית מכירות חודשית", domain: "sales", entityType: "sales_order", triggerType: "scheduled_monthly", agentCode: "FORECAST_AGENT", promptCode: "SALES_FORECAST_001", executionMode: "generate_report", severity: "medium" },
  { code: "SALES_010", name: "הזמנת לקוח → בדיקת אשראי", domain: "sales", entityType: "sales_order", triggerType: "on_create", agentCode: "PAYMENT_RISK_AGENT", promptCode: "SALES_CREDIT_001", executionMode: "block_if_invalid", severity: "high" },

  // ─── Service/CRM (86-92) ───
  { code: "SVC_001", name: "ניתוב פנייה חכם", domain: "service", entityType: "ticket", triggerType: "on_create", agentCode: "SERVICE_AI", promptCode: "SVC_ROUTE_001", executionMode: "execute_if_rule_allows", severity: "medium" },
  { code: "SVC_002", name: "סיכום היסטוריית לקוח", domain: "service", entityType: "customer", triggerType: "on_view", agentCode: "CRM_AI", promptCode: "SVC_HISTORY_001", executionMode: "suggest_only", severity: "low" },
  { code: "SVC_003", name: "סיכון נטישת לקוח", domain: "service", entityType: "customer", triggerType: "scheduled_weekly", agentCode: "CRM_AI", promptCode: "SVC_CHURN_001", executionMode: "alert", severity: "high" },
  { code: "SVC_004", name: "טיוטת תגובה לפנייה", domain: "service", entityType: "ticket", triggerType: "on_create", agentCode: "SERVICE_AI", promptCode: "SVC_RESPONSE_001", executionMode: "draft", severity: "medium" },
  { code: "SVC_005", name: "SLA חריגה — הסלמה", domain: "service", entityType: "ticket", triggerType: "on_overdue", agentCode: "SERVICE_AI", promptCode: "SVC_SLA_001", executionMode: "escalate", severity: "high" },
  { code: "SVC_006", name: "NPS ניתוח רבעוני", domain: "service", entityType: "customer", triggerType: "scheduled_quarterly", agentCode: "CRM_AI", promptCode: "SVC_NPS_001", executionMode: "generate_report", severity: "low" },
  { code: "SVC_007", name: "סנטימנט לקוח — ניטור", domain: "service", entityType: "customer", triggerType: "on_update", agentCode: "CRM_AI", promptCode: "SVC_SENTIMENT_001", executionMode: "alert", severity: "medium" },

  // ─── CEO/HR (93-100) ───
  { code: "CEO_001", name: "תדריך מנכ\"ל יומי", domain: "ceo", entityType: "system", triggerType: "scheduled_daily", agentCode: "CEO_AI", promptCode: "CEO_DAILY_001", executionMode: "generate_report", severity: "high" },
  { code: "CEO_002", name: "5 סיכונים מובילים", domain: "ceo", entityType: "system", triggerType: "scheduled_daily", agentCode: "CEO_AI", promptCode: "CEO_RISK_001", executionMode: "generate_report", severity: "high" },
  { code: "CEO_003", name: "שינוי אסטרטגי — המלצה", domain: "ceo", entityType: "kpi", triggerType: "on_threshold_breach", agentCode: "CEO_AI", promptCode: "CEO_STRATEGY_001", executionMode: "suggest_only", severity: "high" },
  { code: "CEO_004", name: "סיכום שבועי הנהלה", domain: "ceo", entityType: "system", triggerType: "scheduled_weekly", agentCode: "CEO_AI", promptCode: "CEO_WEEKLY_001", executionMode: "generate_report", severity: "medium" },
  { code: "HR_001", name: "עובד חדש — onboarding", domain: "hr", entityType: "employee", triggerType: "on_create", agentCode: "HR_AI", promptCode: "HR_ONBOARD_001", executionMode: "create_task", severity: "medium" },
  { code: "HR_002", name: "חריגת שעות עובד", domain: "hr", entityType: "timesheet", triggerType: "on_threshold_breach", agentCode: "HR_AI", promptCode: "HR_OVERTIME_001", executionMode: "alert", severity: "medium" },
  { code: "HR_003", name: "הערכת עובד — תזכורת", domain: "hr", entityType: "performance_review", triggerType: "scheduled_quarterly", agentCode: "HR_AI", promptCode: "HR_REVIEW_001", executionMode: "create_task", severity: "low" },
  { code: "HR_004", name: "ניתוח תחלופת עובדים", domain: "hr", entityType: "employee", triggerType: "scheduled_monthly", agentCode: "HR_AI", promptCode: "HR_TURNOVER_001", executionMode: "generate_report", severity: "medium" },
];

// ═══════════════════════════════════════════════════════════════
// 50 PROMPTS
// ═══════════════════════════════════════════════════════════════
export const PROMPT_SEED = [
  // ─── Finance Prompts (1-10) ───
  { code: "FIN_CASHFLOW_001", name: "ניתוח סיכון תזרים", domain: "finance", goal: "לזהות סיכוני תזרים ב-30/60/90 יום", requiredInputs: ["cash_position", "ap_aging", "ar_aging", "recurring_expenses"], outputFormat: "json" },
  { code: "FIN_COLLECT_001", name: "אסטרטגיית גבייה", domain: "finance", goal: "להמליץ על פעולות גבייה לפי גיל חוב וסיכון לקוח", requiredInputs: ["overdue_invoices", "customer_risk_score", "payment_history"], outputFormat: "json" },
  { code: "FIN_ANOMALY_001", name: "זיהוי חריגת הוצאות", domain: "finance", goal: "לאתר הוצאות חריגות ביחס לממוצע", requiredInputs: ["recent_expenses", "historical_avg", "budget"], outputFormat: "json" },
  { code: "FIN_BALANCE_001", name: "בדיקת איזון פקודת יומן", domain: "finance", goal: "לוודא debit=credit לפני פוסט", requiredInputs: ["journal_lines"], outputFormat: "json" },
  { code: "FIN_MARGIN_001", name: "ניתוח שחיקת רווחיות", domain: "finance", goal: "לזהות ירידה ברווחיות פרויקט/מוצר", requiredInputs: ["revenue", "costs", "budget", "previous_margin"], outputFormat: "json" },
  { code: "FIN_BUDGET_001", name: "ניתוח סטיית תקציב", domain: "finance", goal: "לנתח סטייה מתקציב ולהמליץ תיקון", requiredInputs: ["budget_lines", "actual_lines"], outputFormat: "json" },
  { code: "FIN_PAYMENT_001", name: "תחזית תשלומי ספקים", domain: "finance", goal: "לבנות לוח תשלומים צפוי", requiredInputs: ["open_ap", "payment_terms", "cash_position"], outputFormat: "json" },
  { code: "FIN_RECON_001", name: "התאמת בנק חכמה", domain: "finance", goal: "להתאים תנועות בנק לרשומות מערכת", requiredInputs: ["bank_transactions", "system_transactions"], outputFormat: "json" },
  { code: "FIN_PNL_001", name: "סיכום רווח והפסד", domain: "finance", goal: "לייצר סיכום טקסטואלי של P&L", requiredInputs: ["pnl_data", "previous_period"], outputFormat: "text" },
  { code: "FIN_FORECAST_001", name: "תחזית תזרים 90 יום", domain: "finance", goal: "לחזות תזרים מזומנים ל-90 יום", requiredInputs: ["cash_position", "expected_receipts", "expected_payments", "recurring"], outputFormat: "json" },

  // ─── Procurement Prompts (11-20) ───
  { code: "PROC_REORDER_001", name: "המלצת הזמנה מחדש", domain: "procurement", goal: "לזהות פריטים שצריך להזמין ולהמליץ כמות", requiredInputs: ["stock_levels", "reorder_points", "lead_times", "demand_forecast"], outputFormat: "json" },
  { code: "PROC_SUPPLIER_001", name: "המלצת ספק מיטבי", domain: "procurement", goal: "לדרג ספקים לפי מחיר, איכות, זמן אספקה", requiredInputs: ["approved_suppliers", "price_history", "quality_scores", "lead_times"], outputFormat: "json" },
  { code: "PROC_COMPARE_001", name: "השוואת הצעות מחיר", domain: "procurement", goal: "להשוות הצעות ולהמליץ על הטובה ביותר", requiredInputs: ["rfq_responses", "evaluation_criteria"], outputFormat: "json" },
  { code: "PROC_PRICE_001", name: "זיהוי עליית מחיר", domain: "procurement", goal: "לזהות עליות מחיר חריגות מספקים", requiredInputs: ["new_price", "historical_prices", "market_index"], outputFormat: "json" },
  { code: "PROC_PO_001", name: "הכנת טיוטת PO", domain: "procurement", goal: "ליצור טיוטת הזמנת רכש מדרישה מאושרת", requiredInputs: ["requisition", "best_supplier", "price_agreements"], outputFormat: "json" },
  { code: "PROC_MATCH_001", name: "Three-Way Match", domain: "procurement", goal: "לבדוק התאמה בין PO, GRN וחשבונית ספק", requiredInputs: ["po_lines", "grn_lines", "invoice_lines"], outputFormat: "json" },
  { code: "PROC_SCORE_001", name: "דירוג ספקים", domain: "procurement", goal: "לחשב ציון ספק משוקלל", requiredInputs: ["delivery_performance", "quality_scores", "price_competitiveness", "communication"], outputFormat: "json" },
  { code: "PROC_NEGO_001", name: "טיוטת מו\"מ ספק", domain: "procurement", goal: "להכין טיוטת תנאים לניהול מו\"מ", requiredInputs: ["current_terms", "market_benchmark", "volume_history"], outputFormat: "text" },
  { code: "PROC_FIELDS_001", name: "השלמת שדות דרישת רכש", domain: "procurement", goal: "לזהות שדות חובה חסרים ולהציע ערכים", requiredInputs: ["requisition_fields", "field_rules"], outputFormat: "json" },
  { code: "PROC_CONTRACT_001", name: "ניתוח חוזה ספק", domain: "procurement", goal: "לנתח חוזה ספק לפני חידוש", requiredInputs: ["contract_terms", "performance_history", "market_alternatives"], outputFormat: "json" },

  // ─── Inventory Prompts (21-27) ───
  { code: "INV_NEGATIVE_001", name: "מניעת מלאי שלילי", domain: "inventory", goal: "לבדוק שתנועה לא תיצור מלאי שלילי", requiredInputs: ["current_stock", "requested_qty"], outputFormat: "json" },
  { code: "INV_DEAD_001", name: "זיהוי Dead Stock", domain: "inventory", goal: "לזהות פריטים ללא תנועה ממושכת", requiredInputs: ["stock_balances", "last_movement_dates", "threshold_days"], outputFormat: "json" },
  { code: "INV_REORDER_001", name: "חישוב נקודת הזמנה", domain: "inventory", goal: "לחשב כמות הזמנה אופטימלית", requiredInputs: ["demand_rate", "lead_time", "safety_stock", "order_cost"], outputFormat: "json" },
  { code: "INV_COUNT_001", name: "ניתוח חריגת ספירה", domain: "inventory", goal: "לנתח פער ספירה ולהציע סיבות", requiredInputs: ["counted_qty", "system_qty", "item_history"], outputFormat: "json" },
  { code: "INV_TRANSFER_001", name: "המלצת העברה בין מחסנים", domain: "inventory", goal: "לאזן מלאי בין מחסנים", requiredInputs: ["stock_by_warehouse", "demand_by_warehouse"], outputFormat: "json" },
  { code: "INV_ABC_001", name: "ניתוח ABC", domain: "inventory", goal: "לסווג פריטים לפי שווי צריכה", requiredInputs: ["item_usage_value"], outputFormat: "json" },
  { code: "INV_EOQ_001", name: "חישוב EOQ", domain: "inventory", goal: "לחשב כמות הזמנה כלכלית", requiredInputs: ["annual_demand", "order_cost", "holding_cost"], outputFormat: "json" },

  // ─── Production Prompts (28-34) ───
  { code: "PROD_MATCHECK_001", name: "בדיקת זמינות חומרים", domain: "production", goal: "לוודא כל חומרי BOM זמינים לפני שחרור", requiredInputs: ["bom_lines", "stock_balances", "pending_receipts"], outputFormat: "json" },
  { code: "PROD_BOTTLE_001", name: "זיהוי צוואר בקבוק", domain: "production", goal: "לזהות תחנה מעכבת", requiredInputs: ["workstation_loads", "capacity", "queue_times"], outputFormat: "json" },
  { code: "PROD_LABOR_001", name: "סטיית עבודה", domain: "production", goal: "להשוות שעות בפועל לתכנון", requiredInputs: ["planned_hours", "actual_hours", "wo_details"], outputFormat: "json" },
  { code: "PROD_PRIORITY_001", name: "סדר עדיפויות ייצור", domain: "production", goal: "לדרג פקודות עבודה לפי דחיפות ויעילות", requiredInputs: ["open_work_orders", "due_dates", "material_availability", "machine_availability"], outputFormat: "json" },
  { code: "PROD_OEE_001", name: "ניתוח OEE", domain: "production", goal: "לחשב ולנתח Overall Equipment Effectiveness", requiredInputs: ["availability", "performance", "quality_rates"], outputFormat: "json" },
  { code: "PROD_QC_001", name: "חקירת כשל איכות", domain: "production", goal: "לנתח כשל QC ולהציע שורש בעיה", requiredInputs: ["inspection_data", "defect_type", "process_parameters", "material_lot"], outputFormat: "json" },
  { code: "PROD_BOM_001", name: "השלמת BOM", domain: "production", goal: "לזהות רכיבים חסרים ב-BOM", requiredInputs: ["bom_lines", "item_master", "similar_boms"], outputFormat: "json" },

  // ─── Projects Prompts (35-41) ───
  { code: "PROJ_FIELDS_001", name: "השלמת שדות פרויקט", domain: "projects", goal: "לזהות שדות חובה חסרים בכרטיס פרויקט", requiredInputs: ["project_header", "boq_summary", "customer_record"], outputFormat: "json" },
  { code: "PROJ_BUDGET_001", name: "ניתוח חריגת תקציב", domain: "projects", goal: "לנתח חריגה מתקציב פרויקט", requiredInputs: ["budget_baseline", "actual_costs", "committed_costs"], outputFormat: "json" },
  { code: "PROJ_MARGIN_001", name: "ניתוח רווחיות פרויקט", domain: "projects", goal: "לזהות שחיקת מרווח ולהמליץ", requiredInputs: ["contract_value", "costs", "previous_margin"], outputFormat: "json" },
  { code: "PROJ_SUMMARY_001", name: "סיכום פרויקט שבועי", domain: "projects", goal: "לייצר סיכום טקסטואלי של התקדמות", requiredInputs: ["milestones", "budget_status", "risks", "tasks"], outputFormat: "text" },
  { code: "PROJ_EV_001", name: "Earned Value Analysis", domain: "projects", goal: "לחשב EV, CPI, SPI", requiredInputs: ["planned_value", "earned_value", "actual_cost"], outputFormat: "json" },
  { code: "PROJ_RISK_001", name: "הערכת סיכון פרויקט", domain: "projects", goal: "לדרג סיכון ולהציע תגובה", requiredInputs: ["risk_description", "probability", "impact", "existing_mitigations"], outputFormat: "json" },
  { code: "PROJ_FORECAST_001", name: "תחזית סיום פרויקט", domain: "projects", goal: "לחזות תאריך סיום ועלות סופית", requiredInputs: ["progress_pct", "burn_rate", "remaining_scope"], outputFormat: "json" },

  // ─── Sales Prompts (42-46) ───
  { code: "SALES_QUOTE_001", name: "טיוטת הצעת מחיר", domain: "sales", goal: "לייצר טיוטת הצעת מחיר מותאמת ללקוח", requiredInputs: ["customer_profile", "requested_items", "price_lists", "margin_floor"], outputFormat: "json" },
  { code: "SALES_FLOOR_001", name: "בדיקת רצפת מחיר", domain: "sales", goal: "לוודא מחיר לא יורד מתחת לעלות + מרווח מינימלי", requiredInputs: ["unit_cost", "proposed_price", "min_margin_pct"], outputFormat: "json" },
  { code: "SALES_SCORE_001", name: "ניקוד ליד", domain: "sales", goal: "לחשב ציון הסתברות סגירה", requiredInputs: ["lead_source", "engagement_history", "company_profile", "budget_signal"], outputFormat: "json" },
  { code: "SALES_FORECAST_001", name: "תחזית מכירות", domain: "sales", goal: "לחזות מכירות לחודש הבא", requiredInputs: ["pipeline", "historical_close_rates", "seasonal_factors"], outputFormat: "json" },
  { code: "SALES_CREDIT_001", name: "בדיקת אשראי לקוח", domain: "sales", goal: "להעריך סיכון אשראי לפני הזמנה", requiredInputs: ["customer_balance", "payment_history", "credit_limit", "order_amount"], outputFormat: "json" },

  // ─── CEO/Service Prompts (47-50) ───
  { code: "CEO_DAILY_001", name: "תדריך מנכ\"ל יומי", domain: "ceo", goal: "לייצר תדריך ניהולי קצר ומדויק", requiredInputs: ["top_kpis", "overdue_collections", "critical_alerts", "cash_position", "procurement_risks"], outputFormat: "text" },
  { code: "CEO_WEEKLY_001", name: "סיכום שבועי הנהלה", domain: "ceo", goal: "לייצר סיכום שבועי לצוות הנהלה", requiredInputs: ["weekly_kpis", "project_updates", "financial_summary", "risk_updates"], outputFormat: "text" },
  { code: "SVC_ROUTE_001", name: "ניתוב פנייה חכם", domain: "service", goal: "לנתב פנייה לצוות המתאים ביותר", requiredInputs: ["ticket_subject", "customer_tier", "agent_availability", "historical_routing"], outputFormat: "json" },
  { code: "SVC_CHURN_001", name: "ניתוח סיכון נטישה", domain: "service", goal: "לזהות לקוחות בסיכון נטישה", requiredInputs: ["engagement_frequency", "complaint_history", "revenue_trend", "satisfaction_score"], outputFormat: "json" },
];
