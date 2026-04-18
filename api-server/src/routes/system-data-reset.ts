import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { validateSession } from "../lib/auth";

const router = Router();

interface AuthRequest extends Request {
  user?: Record<string, unknown>;
}

async function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  const isSuperAdmin = result.user.isSuperAdmin === true;
  const username = String(result.user.username || "");
  if (!isSuperAdmin && username !== "admin") {
    res.status(403).json({ error: "נדרשת הרשאת מנהל מערכת" });
    return;
  }
  next();
}

const SYSTEM_TABLES_TO_KEEP = new Set([
  "platform_modules",
  "chat_channels",
  "document_folders",
  "kimi_agents",
  "unit_conversions",
  "roles",
  "drizzle.__drizzle_migrations",
  "session",
]);

const BUSINESS_DATA_TABLES = [
  "chat_read_receipts",
  "chat_messages",
  "chat_direct_conversations",
  "chat_channel_members",
  "delivery_note_items",
  "quote_items",
  "bom_items",
  "sales_order_items",
  "project_tasks",
  "delivery_notes",
  "inventory_transactions",
  "inventory_alerts",
  "machine_maintenance",
  "attendance_records",
  "payroll_records",
  "leave_requests",
  "training_records",
  "employee_certifications",
  "performance_reviews",
  "safety_incidents",
  "risk_assessments",
  "crm_activities",
  "calendar_events",
  "cash_flow_records",
  "credit_notes",
  "checks",
  "adjusting_entries",
  "general_ledger",
  "revenues",
  "accounts_receivable",
  "accounts_payable",
  "financial_transactions",
  "customer_invoices",
  "purchase_requisitions",
  "purchase_orders",
  "quality_inspections",
  "budgets",
  "fixed_assets",
  "contracts",
  "leads",
  "alerts",
  "documents",
  "projects_module",
  "projects",
  "bom_headers",
  "quotes",
  "sales_orders",
  "work_orders",
  "machines",
  "equipment",
  "production_lines",
  "warehouse_locations",
  "warehouses",
  "stock_ledger",
  "stock_positions",
  "lot_traceability",
  "demand_forecasts",
  "reorder_suggestions",
  "notifications",
  "crm_automation_history",
  "crm_automations",
  "vmi_replenishment_orders",
  "vmi_items",
  "vmi_suppliers",
  "supplier_payments",
  "supplier_invoices",
  "supplier_credit_notes",
  "customer_refunds",
  "customer_payments",
  "journal_transactions",
  "ai_responses",
  "ai_queries",
  "ai_logs",
  "ai_usage_logs",
  "claude_chat_messages",
  "claude_chat_conversations",
  "claude_sessions",
  "claude_audit_logs",
  "claude_governance_logs",
  "claude_connection_tests",
  "entity_records",
  "raw_materials",
  "sales_customers",
  "customers",
  "suppliers",
  "employees",
  "products",
  "production_work_orders",
  "price_quote_items",
  "price_quotes",
  "server_health_logs",
  "user_sessions",
  "approval_requests",
  "approval_chain_instances",
  "approval_level_votes",
  "approval_chain_levels",
  "approval_chains",
  "approval_delegations",
  "approval_routing_rules",
  "bank_accounts",
  "expenses",
  "audit_log",
  "audit_logs",
];

router.post(
  "/system/clear-all-data",
  requireSuperAdmin as (req: Request, res: Response, next: NextFunction) => void,
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    const results: string[] = [];
    const errors: string[] = [];
    const skipped: string[] = [];
    const adminUserId = Number((req as AuthRequest).user?.id || 0);

    try {
      await client.query("BEGIN");

      for (const table of BUSINESS_DATA_TABLES) {
        try {
          const checkResult = await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
            [table]
          );
          if (!checkResult.rows[0]?.exists) {
            skipped.push(table);
            continue;
          }

          const countBefore = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
          const count = parseInt(countBefore.rows[0]?.cnt || "0", 10);

          if (count > 0) {
            try {
              await client.query(`DELETE FROM "${table}"`);
            } catch {
              await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
            }
            results.push(`${table}: ${count} records deleted`);
          } else {
            skipped.push(`${table} (empty)`);
          }
        } catch (e: any) {
          errors.push(`${table}: ${e.message}`);
        }
      }

      if (adminUserId) {
        const userCount = await client.query(
          `SELECT COUNT(*) as cnt FROM users WHERE id != $1`,
          [adminUserId]
        );
        const nonAdminCount = parseInt(userCount.rows[0]?.cnt || "0", 10);
        if (nonAdminCount > 0) {
          await client.query(`DELETE FROM users WHERE id != $1`, [adminUserId]);
          results.push(`users: ${nonAdminCount} non-admin users deleted (kept current admin id=${adminUserId})`);
        }
      }

      if (errors.length > 0) {
        await client.query("ROLLBACK");
        res.status(500).json({
          success: false,
          message: "Data reset failed — rolled back all changes.",
          errors,
          attempted: results,
        });
      } else {
        await client.query("COMMIT");
        res.json({
          success: true,
          message: "All business data cleared. System is ready for real data entry.",
          cleared: results,
          skipped,
        });
      }
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, error: e.message });
    } finally {
      client.release();
    }
  }
);

router.get(
  "/system/data-summary",
  requireSuperAdmin as (req: Request, res: Response, next: NextFunction) => void,
  async (_req, res) => {
    const client = await pool.connect();
    const summary: Record<string, number> = {};

    try {
      for (const table of BUSINESS_DATA_TABLES) {
        try {
          const checkResult = await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
            [table]
          );
          if (!checkResult.rows[0]?.exists) continue;

          const result = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
          const count = parseInt(result.rows[0]?.cnt || "0", 10);
          if (count > 0) {
            summary[table] = count;
          }
        } catch {
        }
      }

      res.json({
        success: true,
        totalTables: Object.keys(summary).length,
        totalRecords: Object.values(summary).reduce((a, b) => a + b, 0),
        tables: summary,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    } finally {
      client.release();
    }
  }
);

export default router;
