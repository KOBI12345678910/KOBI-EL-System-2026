import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

interface SearchResult {
  type: string;
  title: string;
  description?: string;
  href: string;
  icon: string;
  id: number | string;
  category?: string;
}

interface TableConfig {
  table: string;
  label: string;
  icon: string;
  href: string;
  searchCols: string[];
  titleExpr: string;
  descCols: string[];
  orderBy?: string;
}

const TABLES: TableConfig[] = [
  { table: "sales_customers", label: "לקוחות", icon: "users", href: "/customers", searchCols: ["name","contact_person","phone","email"], titleExpr: "name", descCols: ["contact_person","phone","email","category"] },
  { table: "customers", label: "לקוחות (כללי)", icon: "users", href: "/customers", searchCols: ["name","contact_person","phone","email"], titleExpr: "name", descCols: ["contact_person","phone","email","status"] },
  { table: "suppliers", label: "ספקים", icon: "truck", href: "/suppliers", searchCols: ["supplier_name","contact_person","phone","email"], titleExpr: "supplier_name", descCols: ["contact_person","phone","email","status"] },
  { table: "foreign_suppliers", label: "ספקים זרים", icon: "globe", href: "/suppliers/foreign", searchCols: ["company_name","contact_person","phone","email"], titleExpr: "company_name", descCols: ["contact_person","phone","email","status"] },
  { table: "employees", label: "עובדים", icon: "user", href: "/hr", searchCols: ["first_name","last_name","employee_number","phone","email"], titleExpr: "first_name || ' ' || last_name", descCols: ["employee_number","phone","email","status"] },
  { table: "contractors", label: "קבלני משנה", icon: "hard-hat", href: "/hr/contractors", searchCols: ["phone","email"], titleExpr: "COALESCE(phone,'')", descCols: ["email","status"] },
  { table: "products", label: "מוצרים", icon: "box", href: "/products", searchCols: ["product_name","sku","description","supplier_name"], titleExpr: "product_name", descCols: ["sku","status","supplier_name"] },
  { table: "raw_materials", label: "חומרי גלם", icon: "package", href: "/raw-materials", searchCols: ["sku","category","description"], titleExpr: "COALESCE(sku,category)", descCols: ["category","sku","status"] },
  { table: "product_categories", label: "קטגוריות מוצרים", icon: "tag", href: "/products/categories", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "material_categories", label: "קטגוריות חומרים", icon: "tag", href: "/raw-materials/categories", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "sales_orders", label: "הזמנות מכירה", icon: "shopping-cart", href: "/sales/orders", searchCols: ["order_number","customer_name","po_number","status"], titleExpr: "'הזמנה ' || COALESCE(order_number, '#' || id)", descCols: ["customer_name","status","po_number"], orderBy: "created_at DESC" },
  { table: "sales_order_lines", label: "שורות הזמנות מכירה", icon: "list", href: "/sales/orders", searchCols: ["product_name","description"], titleExpr: "COALESCE(product_name,'')", descCols: ["description"] },
  { table: "sales_quotations", label: "הצעות מחיר (מכירות)", icon: "file-text", href: "/sales/quotations", searchCols: ["quote_number","customer_name","status"], titleExpr: "'הצעת מחיר ' || COALESCE(quote_number,'')", descCols: ["customer_name","status"], orderBy: "created_at DESC" },
  { table: "sales_quotation_lines", label: "שורות הצעות מחיר", icon: "list", href: "/sales/quotations", searchCols: ["product_name","description"], titleExpr: "COALESCE(product_name,'')", descCols: ["description"] },
  { table: "sales_invoices", label: "חשבוניות מכירה", icon: "file-text", href: "/sales/invoices", searchCols: ["invoice_number","customer_name","status"], titleExpr: "'חשבונית ' || COALESCE(invoice_number,'')", descCols: ["customer_name","status"], orderBy: "created_at DESC" },
  { table: "sales_invoice_lines", label: "שורות חשבוניות מכירה", icon: "list", href: "/sales/invoices", searchCols: ["product_name","description"], titleExpr: "COALESCE(product_name,'')", descCols: ["description"] },
  { table: "sales_price_lists", label: "מחירונים", icon: "list", href: "/sales/price-lists", searchCols: ["name","status"], titleExpr: "name", descCols: ["status"] },
  { table: "sales_price_list_items", label: "פריטי מחירון", icon: "tag", href: "/sales/price-lists", searchCols: ["product_name","sku"], titleExpr: "COALESCE(product_name,'')", descCols: ["sku"] },
  { table: "sales_collection_cases", label: "תיקי גבייה", icon: "folder", href: "/sales/collections", searchCols: ["customer_name","status"], titleExpr: "COALESCE(customer_name,'')", descCols: ["status"] },
  { table: "customer_invoices", label: "חשבוניות לקוח", icon: "file-text", href: "/finance/invoices", searchCols: ["invoice_number","customer_name","contact_name","po_number","status"], titleExpr: "'חשבונית ' || COALESCE(invoice_number,'')", descCols: ["customer_name","status"], orderBy: "created_at DESC" },
  { table: "customer_payments", label: "תשלומי לקוחות", icon: "credit-card", href: "/finance/customer-payments", searchCols: ["customer_name","invoice_number","status"], titleExpr: "'תשלום ' || COALESCE(customer_name,'')", descCols: ["invoice_number","status"] },
  { table: "customer_refunds", label: "זיכויי לקוחות", icon: "rotate-ccw", href: "/finance/customer-refunds", searchCols: ["customer_name","invoice_number","status"], titleExpr: "'זיכוי ' || COALESCE(customer_name,'')", descCols: ["invoice_number","status"] },
  { table: "credit_notes", label: "הודעות זיכוי", icon: "file-minus", href: "/finance/credit-notes", searchCols: ["customer_name","status"], titleExpr: "'זיכוי ' || COALESCE(customer_name,'')", descCols: ["status"] },
  { table: "purchase_orders", label: "הזמנות רכש", icon: "clipboard", href: "/purchase-orders", searchCols: ["order_number","status"], titleExpr: "'הזמנת רכש ' || COALESCE(order_number,'')", descCols: ["status"], orderBy: "created_at DESC" },
  { table: "purchase_requests", label: "דרישות רכש", icon: "clipboard-list", href: "/purchase-requests", searchCols: ["title","status"], titleExpr: "COALESCE(title,'')", descCols: ["status"], orderBy: "created_at DESC" },
  { table: "price_quotes", label: "הצעות מחיר (רכש)", icon: "receipt", href: "/price-quotes", searchCols: ["quote_number","supplier_name","contact_person","status"], titleExpr: "'הצעת מחיר ' || COALESCE(quote_number,'')", descCols: ["supplier_name","status"], orderBy: "created_at DESC" },
  { table: "supplier_invoices", label: "חשבוניות ספק", icon: "file-text", href: "/finance/supplier-invoices", searchCols: ["invoice_number","supplier_name","po_number","status"], titleExpr: "'חשבונית ספק ' || COALESCE(invoice_number,'')", descCols: ["supplier_name","status"], orderBy: "created_at DESC" },
  { table: "supplier_payments", label: "תשלומי ספקים", icon: "credit-card", href: "/finance/supplier-payments", searchCols: ["supplier_name","invoice_number","status"], titleExpr: "'תשלום ספק ' || COALESCE(supplier_name,'')", descCols: ["invoice_number","status"] },
  { table: "supplier_credit_notes", label: "זיכויי ספקים", icon: "file-minus", href: "/finance/supplier-credit-notes", searchCols: ["supplier_name","invoice_number","status"], titleExpr: "'זיכוי ספק ' || COALESCE(supplier_name,'')", descCols: ["invoice_number","status"] },
  { table: "supplier_contacts", label: "אנשי קשר ספקים", icon: "phone", href: "/suppliers", searchCols: ["contact_name","phone","email"], titleExpr: "COALESCE(contact_name,'')", descCols: ["phone","email"] },
  { table: "supplier_contracts", label: "חוזי ספקים", icon: "file-text", href: "/suppliers/contracts", searchCols: ["title","description","contact_person","status"], titleExpr: "COALESCE(title,'')", descCols: ["contact_person","status"] },
  { table: "projects", label: "פרויקטים", icon: "folder", href: "/projects", searchCols: ["project_number","customer_name","status","description"], titleExpr: "COALESCE(project_number,'') || ' ' || COALESCE(customer_name,'')", descCols: ["status","description"], orderBy: "created_at DESC" },
  { table: "project_milestones", label: "אבני דרך פרויקט", icon: "flag", href: "/projects", searchCols: ["title","description","status"], titleExpr: "COALESCE(title,'')", descCols: ["description","status"] },
  { table: "project_analyses", label: "ניתוחי פרויקטים", icon: "bar-chart-2", href: "/projects/analyses", searchCols: ["customer_name","status","description"], titleExpr: "COALESCE(customer_name,'')", descCols: ["status","description"] },
  { table: "work_orders", label: "הוראות עבודה", icon: "wrench", href: "/production/work-orders", searchCols: ["order_number","title","description","customer_name","product_name","status"], titleExpr: "'הוראת עבודה ' || COALESCE(order_number, '#' || id)", descCols: ["customer_name","product_name","status"], orderBy: "created_at DESC" },
  { table: "production_work_orders", label: "הוראות ייצור", icon: "settings", href: "/production/work-orders", searchCols: ["order_number","product_name","customer_name","status"], titleExpr: "'הוראת ייצור ' || COALESCE(order_number,'')", descCols: ["product_name","customer_name","status"], orderBy: "created_at DESC" },
  { table: "bom_headers", label: "עצי מוצר (BOM)", icon: "layers", href: "/production/bom", searchCols: ["name","product_name","description","customer_name","status"], titleExpr: "COALESCE(name,product_name)", descCols: ["product_name","status","category"] },
  { table: "maintenance_orders", label: "הוראות תחזוקה", icon: "tool", href: "/production/maintenance", searchCols: ["order_number","title","description","status"], titleExpr: "'תחזוקה ' || COALESCE(order_number,title)", descCols: ["description","status"] },
  { table: "quality_inspections", label: "בדיקות איכות", icon: "check-circle", href: "/production/quality", searchCols: ["product_name","supplier_name","customer_name"], titleExpr: "'בדיקת איכות ' || COALESCE(product_name,'')", descCols: ["supplier_name","customer_name"] },
  { table: "crm_leads", label: "לידים", icon: "target", href: "/crm/leads", searchCols: ["first_name","last_name","phone","email","source","status"], titleExpr: "COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')", descCols: ["email","phone","source","status"], orderBy: "created_at DESC" },
  { table: "crm_opportunities", label: "הזדמנויות", icon: "trending-up", href: "/crm/opportunities", searchCols: ["name","customer_name","contact_name","email","phone"], titleExpr: "COALESCE(name,customer_name)", descCols: ["customer_name","contact_name","source"] },
  { table: "crm_collections", label: "גביות CRM", icon: "dollar-sign", href: "/crm/collections", searchCols: ["customer_name","invoice_number","phone","email","status"], titleExpr: "'גבייה ' || COALESCE(customer_name,'')", descCols: ["invoice_number","status","phone"] },
  { table: "crm_automations", label: "אוטומציות CRM", icon: "zap", href: "/crm/automations", searchCols: ["name","description","category"], titleExpr: "name", descCols: ["description","category"] },
  { table: "crm_field_agents", label: "סוכני שטח", icon: "map-pin", href: "/crm/field-agents", searchCols: ["phone","email","status"], titleExpr: "COALESCE(phone,email)", descCols: ["email","status"] },
  { table: "competitors", label: "מתחרים", icon: "shield", href: "/crm/competitors", searchCols: ["name","contact_person","phone","email"], titleExpr: "name", descCols: ["contact_person","phone","email"] },
  { table: "accounts_receivable", label: "חייבים", icon: "arrow-up-right", href: "/finance/ar", searchCols: ["invoice_number","customer_name","description","order_number","status"], titleExpr: "'חוב ' || COALESCE(invoice_number,'')", descCols: ["customer_name","status","description"], orderBy: "created_at DESC" },
  { table: "accounts_payable", label: "זכאים", icon: "arrow-down-left", href: "/finance/ap", searchCols: ["invoice_number","supplier_name","description","status"], titleExpr: "'חוב ספק ' || COALESCE(invoice_number,'')", descCols: ["supplier_name","status","description"], orderBy: "created_at DESC" },
  { table: "ar_dunning_letters", label: "מכתבי התראה", icon: "alert-triangle", href: "/finance/ar/dunning", searchCols: ["customer_name","status"], titleExpr: "'התראה ' || COALESCE(customer_name,'')", descCols: ["status"] },
  { table: "chart_of_accounts", label: "תכנית חשבונות", icon: "book-open", href: "/finance/chart-of-accounts", searchCols: ["account_number","account_name","description","status"], titleExpr: "COALESCE(account_number,'') || ' - ' || COALESCE(account_name,'')", descCols: ["description","status"] },
  { table: "general_ledger", label: "ספר חשבונות ראשי", icon: "book", href: "/finance/general-ledger", searchCols: ["account_number","account_name","description","status"], titleExpr: "COALESCE(account_number,'') || ' ' || COALESCE(account_name,'')", descCols: ["description","status"] },
  { table: "journal_entries", label: "פקודות יומן", icon: "edit-3", href: "/finance/journal-entries", searchCols: ["description","status"], titleExpr: "'פקודת יומן #' || id", descCols: ["description","status"], orderBy: "created_at DESC" },
  { table: "journal_entry_lines", label: "שורות פקודות יומן", icon: "list", href: "/finance/journal-entries", searchCols: ["account_number","account_name","description"], titleExpr: "COALESCE(account_number,'') || ' ' || COALESCE(account_name,'')", descCols: ["description"] },
  { table: "journal_transactions", label: "תנועות יומן", icon: "repeat", href: "/finance/journal-transactions", searchCols: ["account_number","account_name","description","status"], titleExpr: "COALESCE(account_number,'') || ' ' || COALESCE(account_name,'')", descCols: ["description","status"] },
  { table: "financial_accounts", label: "חשבונות פיננסיים", icon: "landmark", href: "/finance/accounts", searchCols: ["account_number","account_name","description"], titleExpr: "COALESCE(account_number,'') || ' - ' || COALESCE(account_name,'')", descCols: ["description"] },
  { table: "financial_transactions", label: "תנועות פיננסיות", icon: "activity", href: "/finance/transactions", searchCols: ["description","category","status"], titleExpr: "'תנועה #' || id", descCols: ["description","category","status"] },
  { table: "bank_accounts", label: "חשבונות בנק", icon: "landmark", href: "/finance/bank-accounts", searchCols: ["account_number","contact_person"], titleExpr: "'חשבון ' || COALESCE(account_number,'')", descCols: ["contact_person"] },
  { table: "bank_reconciliations", label: "התאמות בנק", icon: "check-square", href: "/finance/bank-reconciliations", searchCols: ["status"], titleExpr: "'התאמת בנק #' || id", descCols: ["status"] },
  { table: "budgets", label: "תקציבים", icon: "pie-chart", href: "/finance/budgets", searchCols: ["budget_name","category","status"], titleExpr: "COALESCE(budget_name,'')", descCols: ["category","status"] },
  { table: "fixed_assets", label: "רכוש קבוע", icon: "hard-drive", href: "/finance/fixed-assets", searchCols: ["asset_name","category","description","supplier_name","invoice_number","status"], titleExpr: "COALESCE(asset_name,'')", descCols: ["category","status","supplier_name"] },
  { table: "depreciation_schedules", label: "לוחות פחת", icon: "trending-down", href: "/finance/depreciation", searchCols: ["asset_name","status"], titleExpr: "'פחת ' || COALESCE(asset_name,'')", descCols: ["status"] },
  { table: "adjusting_entries", label: "פקודות תיאום", icon: "sliders", href: "/finance/adjusting-entries", searchCols: ["account_number","account_name","description","status"], titleExpr: "COALESCE(account_name,description)", descCols: ["account_number","status"] },
  { table: "audit_controls", label: "בקרות ביקורת", icon: "shield", href: "/finance/audit-controls", searchCols: ["account_number","account_name","status"], titleExpr: "COALESCE(account_name,'')", descCols: ["account_number","status"] },
  { table: "cash_flow_records", label: "תזרים מזומנים", icon: "trending-up", href: "/finance/cash-flow", searchCols: ["description","customer_name","supplier_name","category","status"], titleExpr: "COALESCE(description,'')", descCols: ["customer_name","supplier_name","category","status"] },
  { table: "credit_card_transactions", label: "כרטיסי אשראי", icon: "credit-card", href: "/finance/credit-cards", searchCols: ["customer_name","description","source","status"], titleExpr: "'עסקת אשראי ' || COALESCE(customer_name,'')", descCols: ["description","status"] },
  { table: "deferred_expenses", label: "הוצאות נדחות", icon: "clock", href: "/finance/deferred-expenses", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
  { table: "deferred_revenue", label: "הכנסות נדחות", icon: "clock", href: "/finance/deferred-revenue", searchCols: ["customer_name","description","status"], titleExpr: "COALESCE(customer_name,description)", descCols: ["description","status"] },
  { table: "expenses", label: "הוצאות", icon: "minus-circle", href: "/finance/expenses", searchCols: ["category","description","status"], titleExpr: "COALESCE(category || ': ' || description, description, category)", descCols: ["status"] },
  { table: "expense_claims", label: "תביעות הוצאות", icon: "file-text", href: "/finance/expense-claims", searchCols: ["description","status","category"], titleExpr: "COALESCE(description,'')", descCols: ["category","status"], orderBy: "created_at DESC" },
  { table: "income_documents", label: "מסמכי הכנסה", icon: "file-plus", href: "/finance/income-documents", searchCols: ["document_number","customer_name","description","status"], titleExpr: "'מסמך ' || COALESCE(document_number,'')", descCols: ["customer_name","status"] },
  { table: "payments", label: "תשלומים", icon: "dollar-sign", href: "/finance/payments", searchCols: ["description","status"], titleExpr: "'תשלום #' || id", descCols: ["description","status"] },
  { table: "petty_cash", label: "קופה קטנה", icon: "inbox", href: "/finance/petty-cash", searchCols: ["category","description","status"], titleExpr: "COALESCE(category || ': ' || description, description)", descCols: ["status"] },
  { table: "tax_records", label: "רשומות מס", icon: "file-text", href: "/finance/tax-records", searchCols: ["status"], titleExpr: "'רשומת מס #' || id", descCols: ["status"] },
  { table: "withholding_tax", label: "ניכוי מס במקור", icon: "percent", href: "/finance/withholding-tax", searchCols: ["invoice_number","status"], titleExpr: "'ניכוי מס ' || COALESCE(invoice_number,'')", descCols: ["status"] },
  { table: "exchange_rates", label: "שערי חליפין", icon: "refresh-cw", href: "/finance/exchange-rates", searchCols: ["source","status"], titleExpr: "'שער חליפין #' || id", descCols: ["source","status"] },
  { table: "currency_exposures", label: "חשיפות מטבע", icon: "globe", href: "/finance/currency-exposures", searchCols: ["category","status"], titleExpr: "COALESCE(category,'')", descCols: ["status"] },
  { table: "reconciliation_items", label: "פריטי התאמה", icon: "check-square", href: "/finance/reconciliation", searchCols: ["description","category","source"], titleExpr: "COALESCE(description,'')", descCols: ["category","source"] },
  { table: "import_orders", label: "הזמנות יבוא", icon: "download", href: "/import/orders", searchCols: ["order_number","supplier_name","contact_person","status"], titleExpr: "'הזמנת יבוא ' || COALESCE(order_number,'')", descCols: ["supplier_name","status"], orderBy: "created_at DESC" },
  { table: "import_cost_calculations", label: "חישובי עלות יבוא", icon: "calculator", href: "/import/costs", searchCols: ["product_name","status"], titleExpr: "COALESCE(product_name,'')", descCols: ["status"] },
  { table: "customs_clearances", label: "עמילות מכס", icon: "shield", href: "/import/customs", searchCols: ["supplier_name","status"], titleExpr: "'עמילות ' || COALESCE(supplier_name,'')", descCols: ["status"] },
  { table: "shipment_tracking", label: "מעקב משלוחים", icon: "navigation", href: "/import/shipments", searchCols: ["supplier_name","status"], titleExpr: "'משלוח ' || COALESCE(supplier_name,'')", descCols: ["status"] },
  { table: "letters_of_credit", label: "מכתבי אשראי", icon: "file-text", href: "/import/lc", searchCols: ["status"], titleExpr: "'מכתב אשראי #' || id", descCols: ["status"] },
  { table: "leave_requests", label: "בקשות חופשה", icon: "calendar", href: "/hr/leave-requests", searchCols: ["status"], titleExpr: "'בקשת חופשה #' || id", descCols: ["status"], orderBy: "created_at DESC" },
  { table: "attendance_records", label: "נוכחות", icon: "clock", href: "/hr/attendance", searchCols: ["status"], titleExpr: "'נוכחות #' || id", descCols: ["status"] },
  { table: "benefit_plans", label: "תוכניות הטבות", icon: "gift", href: "/hr/benefits", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
  { table: "training_records", label: "הדרכות", icon: "book-open", href: "/hr/training", searchCols: ["category","description","status"], titleExpr: "COALESCE(description,'')", descCols: ["category","status"] },
  { table: "performance_reviews", label: "הערכות ביצועים", icon: "award", href: "/hr/performance", searchCols: ["status"], titleExpr: "'הערכת ביצועים #' || id", descCols: ["status"] },
  { table: "recruitment_records", label: "גיוס", icon: "user-plus", href: "/hr/recruitment", searchCols: ["description","source","status"], titleExpr: "COALESCE(description,'')", descCols: ["source","status"] },
  { table: "onboarding_tasks", label: "משימות קליטה", icon: "clipboard-check", href: "/hr/onboarding", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
  { table: "hr_meetings", label: "ישיבות HR", icon: "users", href: "/hr/meetings", searchCols: ["title","status"], titleExpr: "COALESCE(title,'')", descCols: ["status"] },
  { table: "safety_incidents", label: "אירועי בטיחות", icon: "alert-circle", href: "/hr/safety", searchCols: ["title","description","status"], titleExpr: "COALESCE(title,'')", descCols: ["description","status"] },
  { table: "calendar_events", label: "אירועי יומן", icon: "calendar", href: "/calendar", searchCols: ["title","description"], titleExpr: "COALESCE(title,'')", descCols: ["description"] },
  { table: "approval_requests", label: "בקשות אישור", icon: "check-circle", href: "/approvals", searchCols: ["title","description","status"], titleExpr: "COALESCE(title,'')", descCols: ["description","status"], orderBy: "created_at DESC" },
  { table: "support_tickets", label: "פניות שירות", icon: "headphones", href: "/support/tickets", searchCols: ["ticket_number","customer_name","description","product_name","order_number","status"], titleExpr: "'פנייה ' || COALESCE(ticket_number,'#' || id)", descCols: ["customer_name","status","category"], orderBy: "created_at DESC" },
  { table: "controlled_documents", label: "מסמכים מבוקרים", icon: "file-check", href: "/documents/controlled", searchCols: ["document_number","title","description","category","status"], titleExpr: "COALESCE(title,document_number)", descCols: ["document_number","category","status"] },
  { table: "document_files", label: "קבצי מסמכים", icon: "file", href: "/documents/files", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "document_folders", label: "תיקיות מסמכים", icon: "folder", href: "/documents/folders", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "document_templates", label: "תבניות מסמכים", icon: "file-text", href: "/documents/templates", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "generated_documents", label: "מסמכים שנוצרו", icon: "printer", href: "/documents/generated", searchCols: ["document_number","status"], titleExpr: "'מסמך ' || COALESCE(document_number,'')", descCols: ["status"] },
  { table: "compliance_certificates", label: "תעודות תאימות", icon: "award", href: "/compliance/certificates", searchCols: ["document_number","product_name","category","status"], titleExpr: "COALESCE(product_name,document_number)", descCols: ["document_number","category","status"] },
  { table: "standing_orders", label: "הוראות קבע", icon: "repeat", href: "/finance/standing-orders", searchCols: ["customer_name","description","order_number","supplier_name","category","status"], titleExpr: "'הוראת קבע ' || COALESCE(customer_name,supplier_name)", descCols: ["description","status"] },
  { table: "strategic_goals", label: "יעדים אסטרטגיים", icon: "flag", href: "/strategy/goals", searchCols: ["title","description","category","status"], titleExpr: "COALESCE(title,'')", descCols: ["description","category","status"] },
  { table: "swot_items", label: "ניתוח SWOT", icon: "grid", href: "/strategy/swot", searchCols: ["title","description"], titleExpr: "COALESCE(title,'')", descCols: ["description"] },
  { table: "report_definitions", label: "הגדרות דוחות", icon: "bar-chart", href: "/reports", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "routing_rules", label: "כללי ניתוב", icon: "git-branch", href: "/settings/routing", searchCols: ["name","description"], titleExpr: "name", descCols: ["description"] },
  { table: "cost_centers", label: "מרכזי עלות", icon: "target", href: "/finance/cost-centers", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
  { table: "accounting_inventory", label: "מלאי חשבונאי", icon: "database", href: "/finance/inventory", searchCols: ["category","status"], titleExpr: "'מלאי ' || COALESCE(category,'')", descCols: ["status"] },
  { table: "aging_snapshots", label: "גיול חובות", icon: "clock", href: "/finance/aging", searchCols: ["contact_name"], titleExpr: "COALESCE(contact_name,'')", descCols: [] },
  { table: "contractor_work_log", label: "יומן קבלנים", icon: "clipboard", href: "/hr/contractor-log", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
  { table: "working_files", label: "תיקי עבודה", icon: "folder", href: "/working-files", searchCols: ["description","status"], titleExpr: "COALESCE(description,'')", descCols: ["status"] },
];

function buildSearchQuery(t: TableConfig, searchTerm: string, limit: number): ReturnType<typeof sql> {
  const whereClauses = t.searchCols.map(c => `COALESCE(${c},'') ILIKE '${searchTerm.replace(/'/g, "''")}'`).join(" OR ");
  const descSelect = t.descCols.map(c => `COALESCE(${c}::text,'') as "${c}"`).join(", ");
  const orderClause = t.orderBy || "id DESC";
  const query = `SELECT id, (${t.titleExpr}) as _title${descSelect ? ', ' + descSelect : ''} FROM "${t.table}" WHERE ${whereClauses} ORDER BY ${orderClause} LIMIT ${limit}`;
  return sql.raw(query);
}

router.get("/global-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.json({ results: [], query: q, categories: {} });
    }

    const searchTerm = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const limit = 5;

    const searches = await Promise.allSettled(
      TABLES.map(t => {
        const whereClauses = t.searchCols.map(c => sql.raw(`COALESCE("${c}"::text,'') ILIKE`)).map((prefix, i) => sql`${prefix} ${searchTerm}`);
        const whereExpr = whereClauses.reduce((acc, cur, i) => i === 0 ? cur : sql`${acc} OR ${cur}`);
        const orderClause = t.orderBy || "id DESC";
        return db.execute(sql`SELECT id, (${sql.raw(t.titleExpr)}) as _title FROM ${sql.raw(`"${t.table}"`)} WHERE ${whereExpr} ORDER BY ${sql.raw(orderClause)} LIMIT ${limit}`);
      })
    );

    const results: SearchResult[] = [];
    const categories: Record<string, number> = {};

    searches.forEach((result, idx) => {
      const t = TABLES[idx];
      if (result.status === "fulfilled") {
        const rows = Array.isArray(result.value) ? result.value : (result.value as { rows?: unknown[] }).rows || [];
        categories[t.label] = rows.length;
        for (const row of rows as Record<string, unknown>[]) {
          const titleVal = String(row._title || row.id || "").trim();
          results.push({
            type: t.table,
            title: titleVal || `${t.label} #${row.id}`,
            description: t.label,
            href: `${t.href}/${row.id}`,
            icon: t.icon,
            id: row.id as number,
            category: t.label,
          });
        }
      }
    });

    const filteredCategories: Record<string, number> = {};
    for (const [k, v] of Object.entries(categories)) {
      if (v > 0) filteredCategories[k] = v;
    }

    res.json({ results, query: q, total: results.length, categories: filteredCategories, tablesSearched: TABLES.length });
  } catch (err) {
    console.error("[global-search] error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
