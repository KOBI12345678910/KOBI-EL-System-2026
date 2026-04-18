import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logAudit, extractUserInfo, getTableNameHe } from "./audit-logger";

const CRUD_TABLE_MAP: Record<string, string> = {
  "/employees": "employees",
  "/suppliers": "suppliers",
  "/sales-customers": "sales_customers",
  "/customers": "sales_customers",
  "/products": "products",
  "/raw-materials": "raw_materials",
  "/purchase-orders": "purchase_orders",
  "/sales-orders": "sales_orders",
  "/work-orders": "work_orders",
  "/fixed-assets": "fixed_assets",
  "/customer-invoices": "customer_invoices",
  "/supplier-invoices": "supplier_invoices",
  "/price-quotes": "price_quotes",
  "/projects": "projects",
  "/inventory-transactions": "inventory_transactions",
  "/bank-accounts": "bank_accounts",
  "/expense-claims": "expense_claims",
  "/quality-inspections": "quality_inspections",
  "/maintenance-orders": "maintenance_orders",
  "/budgets": "budgets",
  "/leave-requests": "leave_requests",
  "/attendance-records": "attendance_records",
  "/payroll-records": "payroll_records",
  "/training-records": "training_records",
  "/recruitment-records": "recruitment_records",
  "/shift-assignments": "shift_assignments",
  "/onboarding-tasks": "onboarding_tasks",
  "/support-tickets": "support_tickets",
  "/standing-orders": "standing_orders",
  "/compliance-certificates": "compliance_certificates",
  "/safety-incidents": "safety_incidents",
  "/contractors": "contractors",
  "/bom-headers": "bom_headers",
  "/accounts-receivable": "accounts_receivable",
  "/accounts-payable": "accounts_payable",
  "/general-ledger": "general_ledger",
  "/chart-of-accounts": "chart_of_accounts",
  "/journal-entries": "journal_entries",
  "/petty-cash": "petty_cash",
  "/letters-of-credit": "letters_of_credit",
  "/import-orders": "import_orders",
  "/customs-clearances": "customs_clearances",
  "/shipment-tracking": "shipment_tracking",
  "/crm-leads": "crm_leads",
  "/crm/leads": "crm_leads",
  "/crm-opportunities": "crm_opportunities",
  "/crm/opportunities": "crm_opportunities",
  "/competitors": "competitors",
};

function resolveTableFromPath(path: string): string | null {
  const cleanPath = path.replace(/^\/api/, "");
  for (const [route, table] of Object.entries(CRUD_TABLE_MAP)) {
    if (cleanPath.startsWith(route)) {
      return table;
    }
  }
  return null;
}

function extractRecordId(path: string): number | null {
  const match = path.match(/\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

// B-SEC: whitelist of tables allowed for audit SELECTs (prevents SQLi via sql.raw)
const AUDIT_ALLOWED_TABLES: ReadonlySet<string> = new Set(
  Object.values(CRUD_TABLE_MAP)
);

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD") {
    return next();
  }

  const tableName = resolveTableFromPath(req.path);
  if (!tableName) return next();

  const recordId = extractRecordId(req.path);
  const user = extractUserInfo(req);

  const originalJson = res.json.bind(res);

  let action: "INSERT" | "UPDATE" | "DELETE" = "INSERT";
  if (req.method === "PUT" || req.method === "PATCH") action = "UPDATE";
  if (req.method === "DELETE") action = "DELETE";

  // B-SEC: only run pre-read when tableName is in the whitelist AND recordId is a safe integer.
  // resolveTableFromPath already returns whitelisted tables, but this double-check hardens against future map changes.
  const tableIsSafe = AUDIT_ALLOWED_TABLES.has(tableName);
  const recordIdIsSafe = typeof recordId === "number" && Number.isInteger(recordId) && recordId > 0;

  if (action === "UPDATE" && recordIdIsSafe && tableIsSafe) {
    // Parameterized: sql.identifier() for table + bound param for id (prevents SQLi)
    db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE id = ${recordId}`)
      .then(result => {
        const oldValues = result.rows?.[0] || null;
        res.json = function (body: any) {
          logAudit({
            tableName, recordId: recordId || body?.id, action, ...user,
            oldValues, newValues: req.body,
            description: `עודכנה רשומה ב${getTableNameHe(tableName)}`,
          }).catch(() => {});
          return originalJson(body);
        };
        next();
      })
      .catch(() => next());
  } else if (action === "DELETE" && recordIdIsSafe && tableIsSafe) {
    db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE id = ${recordId}`)
      .then(result => {
        const oldValues = result.rows?.[0] || null;
        res.json = function (body: any) {
          logAudit({
            tableName, recordId, action, ...user,
            oldValues,
            description: `נמחקה רשומה מ${getTableNameHe(tableName)}`,
          }).catch(() => {});
          return originalJson(body);
        };
        next();
      })
      .catch(() => next());
  } else {
    res.json = function (body: any) {
      const newId = body?.id || recordId;
      logAudit({
        tableName, recordId: newId, action, ...user,
        newValues: req.body,
        description: `נוצרה רשומה חדשה ב${getTableNameHe(tableName)}`,
      }).catch(() => {});
      return originalJson(body);
    };
    next();
  }
}
