import { Router } from "express";
import { pool } from "@workspace/db";
import { crudAll } from "./generic-crud";

const router = Router();

let _allTables: Set<string> | null = null;
async function getAllTables(): Promise<Set<string>> {
  if (_allTables) return _allTables;
  try {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    _allTables = new Set(rows.map((r: any) => r.tablename));
    return _allTables;
  } catch {
    return new Set();
  }
}

function kebabToSnake(s: string): string {
  return s.replace(/-/g, "_");
}

const registered = new Set<string>();

const ENTITY_MAP: Record<string, { table: string; orderBy?: string }> = {
  "accessories-hardware": { table: "accessories_hardware" },
  "accounting-inventory": { table: "accounting_inventory" },
  "accounts-payable": { table: "accounts_payable", orderBy: "created_at DESC NULLS LAST" },
  "accounts-receivable": { table: "accounts_receivable", orderBy: "created_at DESC NULLS LAST" },
  "action-definitions": { table: "action_definitions" },
  "adjusting-entries": { table: "adjusting_entries", orderBy: "entry_date DESC NULLS LAST" },
  "aging-snapshots": { table: "aging_snapshots" },
  "ai-agents": { table: "ai_agents" },
  "ai-models": { table: "ai_models" },
  "ai-providers": { table: "ai_providers" },
  "alerts": { table: "alerts", orderBy: "created_at DESC NULLS LAST" },
  "annual-reports": { table: "annual_reports" },
  "ap-aging-snapshots": { table: "ap_aging_snapshots" },
  "ap-payments": { table: "ap_payments", orderBy: "created_at DESC NULLS LAST" },
  "approval-requests": { table: "approval_requests", orderBy: "created_at DESC NULLS LAST" },
  "approval-workflows": { table: "approval_workflows" },
  "ar-dunning-letters": { table: "ar_dunning_letters" },
  "ar-receipts": { table: "ar_receipts", orderBy: "created_at DESC NULLS LAST" },
  "assembly-orders": { table: "assembly_orders", orderBy: "created_at DESC NULLS LAST" },
  "attendance-records": { table: "attendance_records", orderBy: "date DESC NULLS LAST" },
  "audit-controls": { table: "audit_controls" },
  "bank-accounts": { table: "bank_accounts" },
  "bank-reconciliations": { table: "bank_reconciliations" },
  "benefit-plans": { table: "benefit_plans" },
  "bom-headers": { table: "bom_headers", orderBy: "created_at DESC NULLS LAST" },
  "bom-lines": { table: "bom_lines" },
  "budget-lines": { table: "budget_lines" },
  "budgets": { table: "budgets" },
  "calendar-events": { table: "calendar_events", orderBy: "start_date DESC NULLS LAST" },
  "capacity-planning": { table: "capacity_planning" },
  "cash-flow-records": { table: "cash_flow_records" },
  "cash-registers": { table: "cash_registers" },
  "cash-register-transactions": { table: "cash_register_transactions" },
  "chart-of-accounts": { table: "chart_of_accounts", orderBy: "account_code ASC" },
  "checks": { table: "checks", orderBy: "created_at DESC NULLS LAST" },
  "coating-orders": { table: "coating_orders", orderBy: "created_at DESC NULLS LAST" },
  "collaboration-notes": { table: "collaboration_notes" },
  "collaboration-tasks": { table: "collaboration_tasks" },
  "collection-cases": { table: "collection_cases" },
  "collection-records": { table: "collection_records" },
  "colors": { table: "colors" },
  "competitive-analyses": { table: "competitive_analyses" },
  "competitors": { table: "competitors" },
  "compliance-certificates": { table: "compliance_certificates" },
  "contacts": { table: "contacts", orderBy: "created_at DESC NULLS LAST" },
  "content-calendar": { table: "content_calendar" },
  "contractor-payments": { table: "contractor_payments", orderBy: "created_at DESC NULLS LAST" },
  "contractors": { table: "contractors" },
  "contracts": { table: "contracts", orderBy: "created_at DESC NULLS LAST" },
  "controlled-documents": { table: "controlled_documents" },
  "cost-calculations": { table: "cost_calculations" },
  "cost-centers": { table: "cost_centers" },
  "credit-card-transactions": { table: "credit_card_transactions" },
  "credit-notes": { table: "credit_notes", orderBy: "created_at DESC NULLS LAST" },
  "crm-activities": { table: "crm_activities", orderBy: "created_at DESC NULLS LAST" },
  "crm-automations": { table: "crm_automations" },
  "crm-contacts": { table: "crm_contacts", orderBy: "created_at DESC NULLS LAST" },
  "crm-deals": { table: "crm_deals", orderBy: "created_at DESC NULLS LAST" },
  "crm-leads": { table: "crm_leads", orderBy: "created_at DESC NULLS LAST" },
  "crm-messages": { table: "crm_messages", orderBy: "created_at DESC NULLS LAST" },
  "crm-opportunities": { table: "crm_opportunities", orderBy: "created_at DESC NULLS LAST" },
  "crm-pipeline-stages": { table: "crm_pipeline_stages" },
  "crm-tasks": { table: "crm_tasks", orderBy: "created_at DESC NULLS LAST" },
  "currencies": { table: "currencies", orderBy: "code ASC" },
  "customer-invoices": { table: "customer_invoices", orderBy: "created_at DESC NULLS LAST" },
  "customer-invoice-items": { table: "customer_invoice_items" },
  "customer-payments": { table: "customer_payments", orderBy: "created_at DESC NULLS LAST" },
  "customer-portal-users": { table: "customer_portal_users" },
  "customer-refunds": { table: "customer_refunds" },
  "customers": { table: "customers", orderBy: "created_at DESC NULLS LAST" },
  "customs-clearances": { table: "customs_clearances" },
  "cutting-lists": { table: "cutting_lists", orderBy: "created_at DESC NULLS LAST" },
  "deferred-expenses": { table: "deferred_expenses" },
  "deferred-revenue": { table: "deferred_revenue" },
  "delivery-notes": { table: "delivery_notes", orderBy: "created_at DESC NULLS LAST" },
  "delivery-note-items": { table: "delivery_note_items" },
  "depreciation-schedules": { table: "depreciation_schedules" },
  "documents": { table: "documents", orderBy: "created_at DESC NULLS LAST" },
  "document-files": { table: "document_files" },
  "document-folders": { table: "document_folders" },
  "document-templates": { table: "document_templates" },
  "email-marketing": { table: "email_marketing" },
  "email-sync-accounts": { table: "email_sync_accounts" },
  "employee-benefits": { table: "employee_benefits" },
  "employee-certifications": { table: "employee_certifications", orderBy: "created_at DESC NULLS LAST" },
  "employees": { table: "employees", orderBy: "created_at DESC NULLS LAST" },
  "entity-categories": { table: "entity_categories" },
  "entity-fields": { table: "entity_fields" },
  "entity-records": { table: "entity_records", orderBy: "created_at DESC NULLS LAST" },
  "equipment": { table: "equipment" },
  "equipment-categories": { table: "equipment_categories" },
  "expense-categories": { table: "expense_categories" },
  "expense-upload": { table: "expense_upload", orderBy: "upload_date DESC NULLS LAST" },
  "expenses": { table: "expenses", orderBy: "created_at DESC NULLS LAST" },
  "field-agent-locations": { table: "field_agent_locations" },
  "fixed-assets": { table: "fixed_assets" },
  "general-ledger": { table: "general_ledger", orderBy: "id DESC" },
  "goods-receipts": { table: "goods_receipts", orderBy: "created_at DESC NULLS LAST" },
  "goods-receipt-items": { table: "goods_receipt_items" },
  "import-documents": { table: "import_documents" },
  "installer-work-orders": { table: "installer_work_orders", orderBy: "created_at DESC NULLS LAST" },
  "inventory-alerts": { table: "inventory_alerts" },
  "inventory-transactions": { table: "inventory_transactions", orderBy: "created_at DESC NULLS LAST" },
  "journal-entries": { table: "journal_entries", orderBy: "created_at DESC NULLS LAST" },
  "kpi-definitions": { table: "kpi_definitions" },
  "kpi-targets": { table: "kpi_targets" },
  "leave-requests": { table: "leave_requests", orderBy: "created_at DESC NULLS LAST" },
  "machine-registry": { table: "machine_registry" },
  "maintenance-orders": { table: "maintenance_orders", orderBy: "created_at DESC NULLS LAST" },
  "meetings": { table: "meetings", orderBy: "created_at DESC NULLS LAST" },
  "module-entities": { table: "module_entities" },
  "notifications": { table: "notifications", orderBy: "created_at DESC NULLS LAST" },
  "onboarding-tasks": { table: "onboarding_tasks" },
  "payment-runs": { table: "payment_runs", orderBy: "created_at DESC NULLS LAST" },
  "payment-terms": { table: "payment_terms" },
  "payroll-entries": { table: "payroll_entries", orderBy: "created_at DESC NULLS LAST" },
  "payroll-records": { table: "payroll_records", orderBy: "created_at DESC NULLS LAST" },
  "payroll-runs": { table: "payroll_runs", orderBy: "created_at DESC NULLS LAST" },
  "performance-reviews": { table: "performance_reviews", orderBy: "review_date DESC NULLS LAST" },
  "petty-cash": { table: "petty_cash" },
  "petty-cash-transactions": { table: "petty_cash_transactions", orderBy: "created_at DESC NULLS LAST" },
  "platform-modules": { table: "platform_modules" },
  "platform-roles": { table: "platform_roles" },
  "price-history": { table: "price_history" },
  "price-list-items": { table: "price_list_items" },
  "price-lists": { table: "price_lists" },
  "production-reports": { table: "production_reports" },
  "production-schedules": { table: "production_schedules" },
  "project-tasks": { table: "project_tasks", orderBy: "created_at DESC NULLS LAST" },
  "projects": { table: "projects", orderBy: "created_at DESC NULLS LAST" },
  "purchase-order-items": { table: "purchase_order_items" },
  "purchase-orders": { table: "purchase_orders", orderBy: "created_at DESC NULLS LAST" },
  "purchase-requisitions": { table: "purchase_requisitions", orderBy: "created_at DESC NULLS LAST" },
  "quality-inspections": { table: "quality_inspections", orderBy: "created_at DESC NULLS LAST" },
  "quote-items": { table: "quote_items" },
  "quotes": { table: "quotes", orderBy: "created_at DESC NULLS LAST" },
  "raw-materials": { table: "raw_materials" },
  "recruitment-records": { table: "recruitment_records" },
  "revenues": { table: "revenues", orderBy: "created_at DESC NULLS LAST" },
  "rfqs": { table: "rfqs", orderBy: "created_at DESC NULLS LAST" },
  "risk-assessments": { table: "risk_assessments", orderBy: "created_at DESC NULLS LAST" },
  "role-permissions": { table: "role_permissions" },
  "safety-incidents": { table: "safety_incidents", orderBy: "incident_date DESC NULLS LAST" },
  "sales-invoice-items": { table: "sales_invoice_items" },
  "sales-orders": { table: "sales_orders", orderBy: "created_at DESC NULLS LAST" },
  "sales-return-items": { table: "sales_return_items" },
  "shift-assignments": { table: "shift_assignments" },
  "shift-definitions": { table: "shift_definitions" },
  "site-measurements": { table: "site_measurements" },
  "stock-counts": { table: "stock_counts" },
  "stock-movements": { table: "stock_movements", orderBy: "created_at DESC NULLS LAST" },
  "strategic-goals": { table: "strategic_goals" },
  "supplier-contacts": { table: "supplier_contacts" },
  "suppliers": { table: "suppliers", orderBy: "created_at DESC NULLS LAST" },
  "support-tickets": { table: "support_tickets", orderBy: "created_at DESC NULLS LAST" },
  "system-settings": { table: "system_settings" },
  "tax-records": { table: "tax_records" },
  "timesheet-entries": { table: "timesheet_entries" },
  "training-records": { table: "training_records" },
  "trainings": { table: "trainings" },
  "transport-orders": { table: "transport_orders", orderBy: "created_at DESC NULLS LAST" },
  "users": { table: "users" },
  "vat-reports": { table: "vat_reports" },
  "warehouse-locations": { table: "warehouse_locations" },
  "warehouses": { table: "warehouses" },
  "welding-orders": { table: "welding_orders", orderBy: "created_at DESC NULLS LAST" },
  "withholding-tax": { table: "withholding_tax" },
  "work-instructions": { table: "work_instructions" },
  "work-orders": { table: "work_orders", orderBy: "created_at DESC NULLS LAST" },
};

for (const [path, cfg] of Object.entries(ENTITY_MAP)) {
  crudAll(router, `/${path}`, cfg.table, { orderBy: cfg.orderBy });
  registered.add(cfg.table);
}

router.use(async (req, res, next) => {
  const parts = req.path.split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return next();

  const entitySlug = parts[0];
  const subPath = parts[1];

  if (["auth", "seed-data", "kimi", "platform", "builder-seed", "chat", "upload", "ai"].includes(entitySlug)) {
    return next();
  }

  const tableName = kebabToSnake(entitySlug);

  if (registered.has(tableName)) return next();

  const tables = await getAllTables();
  if (!tables.has(tableName)) return next();

  crudAll(router, `/${entitySlug}`, tableName);
  registered.add(tableName);

  router.handle(req, res, next);
});

export default router;
