import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

function crud(tableName: string, basePath: string, options?: { idType?: string; orderBy?: string }) {
  const idType = options?.idType || "uuid";
  const orderBy = options?.orderBy || "created_at DESC";

  router.get(basePath, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy} LIMIT 500`);
      res.json(rows);
    } catch (err: any) {
      console.error(`[${tableName}] GET error:`, err.message);
      res.status(500).json({ error: `Failed to fetch ${tableName}` });
    }
  });

  router.get(`${basePath}/:id`, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: `Failed to fetch ${tableName}` });
    }
  });

  router.post(basePath, async (req: Request, res: Response) => {
    try {
      const data = req.body;
      const keys = Object.keys(data).filter(k => k !== "id");
      if (keys.length === 0) return res.status(400).json({ error: "No data provided" });
      const vals = keys.map(k => data[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const cols = keys.map(k => `"${k}"`).join(", ");
      const { rows } = await pool.query(
        `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error(`[${tableName}] POST error:`, err.message);
      res.status(500).json({ error: `Failed to create ${tableName}` });
    }
  });

  router.put(`${basePath}/:id`, async (req: Request, res: Response) => {
    try {
      const data = req.body;
      const keys = Object.keys(data).filter(k => k !== "id" && k !== "created_at");
      if (keys.length === 0) return res.status(400).json({ error: "No data provided" });
      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const vals = [...keys.map(k => data[k]), req.params.id];
      const { rows } = await pool.query(
        `UPDATE ${tableName} SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) {
      console.error(`[${tableName}] PUT error:`, err.message);
      res.status(500).json({ error: `Failed to update ${tableName}` });
    }
  });

  router.delete(`${basePath}/:id`, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `UPDATE ${tableName} SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (!rows[0]) {
        await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [req.params.id]);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to delete from ${tableName}` });
    }
  });
}

crud("crm_activities", "/crm-activities");
crud("meetings", "/meetings");
crud("price_lists", "/price-lists");
crud("price_list_items", "/price-list-items");
crud("collection_records", "/collection-records");
crud("purchase_requisitions", "/purchase-requisitions");
crud("rfqs", "/rfqs");
crud("risk_assessments", "/risk-assessments");
crud("import_documents", "/import-documents");
crud("import_insurance", "/import-insurance");
crud("revenues", "/revenues");
crud("expense_categories", "/expense-categories");
crud("budget_lines", "/budget-lines");
crud("checks", "/checks");
crud("currencies", "/currencies", { orderBy: "code ASC" });
crud("payment_terms", "/payment-terms-config");
crud("petty_cash_transactions", "/petty-cash-transactions");
crud("payroll_runs", "/payroll-runs");
crud("payroll_entries", "/payroll-entries");
crud("shift_definitions", "/shift-definitions");
crud("trainings", "/trainings");
crud("employee_certifications", "/employee-certifications");
crud("contractor_payments", "/contractor-payments");
crud("quality_inspections", "/quality-inspections");
crud("maintenance_orders", "/maintenance-orders");
crud("safety_incidents", "/safety-incidents");
crud("site_measurements", "/site-measurements");
crud("installer_work_orders", "/installer-work-orders");
crud("stock_counts", "/stock-counts");
crud("stock_movements", "/stock-movements");
crud("strategic_goals", "/strategic-goals");
crud("quote_items", "/quote-items");
crud("sales_invoice_items", "/sales-invoice-items");
crud("sales_return_items", "/sales-return-items");
crud("customer_portal_users", "/customer-portal-users");
crud("email_sync_accounts", "/email-sync-accounts");
crud("crm_messaging_log", "/crm-messaging-log");
crud("field_agent_locations", "/field-agent-locations");

crud("budget_departments", "/budget-departments");
crud("payment_reminders", "/payment-reminders");
crud("safety_procedures", "/safety-procedures");
crud("production_ncr", "/production-ncr");
crud("roles_config", "/roles-config");

export default router;
