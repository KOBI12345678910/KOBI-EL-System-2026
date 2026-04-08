import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const router = Router();

const SOFT_DELETE_TABLES: Record<string, { label: string; displayCols: string[] }> = {
  employees: { label: "עובדים", displayCols: ["first_name", "last_name", "full_name", "email", "department", "job_title"] },
  customers: { label: "לקוחות", displayCols: ["customer_name", "customer_number", "email", "phone", "city"] },
  work_orders: { label: "פקודות עבודה", displayCols: ["order_number", "description", "status", "priority"] },
  production_work_orders: { label: "פקודות ייצור", displayCols: ["order_number", "product_name", "status", "priority"] },
  raw_materials: { label: "חומרי גלם/מלאי", displayCols: ["material_name", "material_number", "category", "unit"] },
  price_quotes: { label: "הצעות מחיר", displayCols: ["quote_number", "status", "total_amount", "validity_date"] },
  customer_invoices: { label: "חשבוניות לקוחות", displayCols: ["invoice_number", "customer_name", "total_amount", "status"] },
  supplier_invoices: { label: "חשבוניות ספקים", displayCols: ["invoice_number", "supplier_name", "total_amount", "status"] },
  suppliers: { label: "ספקים", displayCols: ["supplier_name", "supplier_number", "email", "phone", "city"] },
  purchase_orders: { label: "הזמנות רכש", displayCols: ["order_number", "status", "total_amount", "order_date"] },
  sales_orders: { label: "הזמנות מכירה", displayCols: ["order_number", "customer_name", "status", "total_amount"] },
  quotes: { label: "הצעות", displayCols: ["quote_number", "customer_name", "status", "total_amount"] },
  projects: { label: "פרויקטים", displayCols: ["project_name", "project_number", "status", "start_date", "end_date"] },
  inventory_transactions: { label: "תנועות מלאי", displayCols: ["transaction_type", "quantity", "reference_number"] },
};

function requireAdminUser(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId;
  const permissions = (req as any).permissions;
  if (!userId) {
    return res.status(401).json({ error: "נדרשת התחברות" });
  }
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const hasAdminRole = Array.isArray(permissions?.roles) && (
    permissions.roles.includes("admin") ||
    permissions.roles.includes("superAdmin") ||
    permissions.roles.includes("system_admin") ||
    permissions.roles.includes("platform_admin")
  );
  if (!isSuperAdmin && !hasAdminRole) {
    return res.status(403).json({ error: "הגישה לסל המיחזור מותרת למנהל בלבד" });
  }
  return next();
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId;
  const permissions = (req as any).permissions;
  if (!userId || !permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "מחיקה קבועה מותרת רק למנהל מערכת ראשי" });
  }
  return next();
}

async function tableHasDeletedAt(tableName: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='deleted_at' LIMIT 1`,
      [tableName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getTableColumns(tableName: string): Promise<string[]> {
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [tableName]
    );
    return rows.map((r: any) => r.column_name as string);
  } catch {
    return [];
  }
}

function buildDisplayString(row: Record<string, any>, preferredCols: string[], tableCols: string[]): string {
  const parts: string[] = [];
  for (const col of preferredCols) {
    if (tableCols.includes(col) && row[col] != null && String(row[col]).trim()) {
      parts.push(String(row[col]).trim());
    }
  }
  if (parts.length > 0) return parts.join(" - ");
  const fallbackCols = ["name", "number", "title", "code", "description"];
  for (const col of fallbackCols) {
    if (tableCols.includes(col) && row[col] != null && String(row[col]).trim()) {
      return String(row[col]).trim();
    }
  }
  return `#${row.id}`;
}

router.get("/recycle-bin/tables", requireAdminUser, async (_req: Request, res: Response) => {
  const tables = Object.entries(SOFT_DELETE_TABLES).map(([key, meta]) => ({
    table: key,
    label: meta.label,
  }));
  res.json(tables);
});

router.get("/recycle-bin", requireAdminUser, async (req: Request, res: Response) => {
  try {
    const results: any[] = [];

    for (const [tableName, meta] of Object.entries(SOFT_DELETE_TABLES)) {
      const hasCol = await tableHasDeletedAt(tableName);
      if (!hasCol) continue;

      const tableCols = await getTableColumns(tableName);

      try {
        const { rows } = await pool.query(
          `SELECT * FROM ${tableName} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`
        );

        for (const row of rows) {
          const display = buildDisplayString(row, meta.displayCols, tableCols);
          results.push({
            id: row.id,
            table: tableName,
            tableLabel: meta.label,
            display,
            deletedAt: row.deleted_at,
            raw: row,
          });
        }
      } catch (tableErr: any) {
        console.error(`[recycle-bin] Error querying ${tableName}:`, tableErr.message);
      }
    }

    results.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    res.json({ data: results, total: results.length });
  } catch (err: any) {
    console.error("[recycle-bin] GET:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/recycle-bin/:table/:id/restore", requireAdminUser, async (req: Request, res: Response) => {
  try {
    const { table, id } = req.params;
    if (!SOFT_DELETE_TABLES[table]) {
      return res.status(400).json({ error: "טבלה לא תקינה" });
    }
    const hasCol = await tableHasDeletedAt(table);
    if (!hasCol) return res.status(400).json({ error: "טבלה זו אינה תומכת בשחזור" });

    const { rows } = await pool.query(
      `UPDATE ${table} SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "הרשומה לא נמצאה בסל המיחזור" });
    res.json({ success: true, id: rows[0].id });
  } catch (err: any) {
    console.error("[recycle-bin] RESTORE:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/recycle-bin/:table/:id/permanent", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { table, id } = req.params;
    if (!SOFT_DELETE_TABLES[table]) {
      return res.status(400).json({ error: "טבלה לא תקינה" });
    }
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[recycle-bin] PERMANENT DELETE:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
