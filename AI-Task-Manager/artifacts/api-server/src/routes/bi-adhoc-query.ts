import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { savedAdHocQueriesTable } from "@workspace/db/schema";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/bi/adhoc", requireAuth as any);

const ALLOWED_TABLES: Record<string, { label: string; labelEn: string; columns: { key: string; label: string; type: string }[] }> = {
  income_documents: {
    label: "חשבוניות הכנסה",
    labelEn: "Income Documents",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "invoice_number", label: "מספר חשבונית", type: "text" },
      { key: "customer_name", label: "שם לקוח", type: "text" },
      { key: "amount", label: "סכום", type: "number" },
      { key: "currency", label: "מטבע", type: "text" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "invoice_date", label: "תאריך", type: "date" },
      { key: "due_date", label: "תאריך פירעון", type: "date" },
    ],
  },
  expenses: {
    label: "הוצאות",
    labelEn: "Expenses",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "description", label: "תיאור", type: "text" },
      { key: "category", label: "קטגוריה", type: "text" },
      { key: "amount", label: "סכום", type: "number" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "expense_date", label: "תאריך", type: "date" },
      { key: "supplier_name", label: "ספק", type: "text" },
    ],
  },
  customers: {
    label: "לקוחות",
    labelEn: "Customers",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "name", label: "שם", type: "text" },
      { key: "email", label: "אימייל", type: "text" },
      { key: "phone", label: "טלפון", type: "text" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "created_at", label: "נוצר ב", type: "date" },
    ],
  },
  suppliers: {
    label: "ספקים",
    labelEn: "Suppliers",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "name", label: "שם", type: "text" },
      { key: "email", label: "אימייל", type: "text" },
      { key: "phone", label: "טלפון", type: "text" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "created_at", label: "נוצר ב", type: "date" },
    ],
  },
  employees: {
    label: "עובדים",
    labelEn: "Employees",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "first_name", label: "שם פרטי", type: "text" },
      { key: "last_name", label: "שם משפחה", type: "text" },
      { key: "department", label: "מחלקה", type: "text" },
      { key: "job_title", label: "תפקיד", type: "text" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "base_salary", label: "שכר בסיס", type: "number" },
    ],
  },
  accounts_receivable: {
    label: "חשבונות לגבייה",
    labelEn: "Accounts Receivable",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "customer_name", label: "שם לקוח", type: "text" },
      { key: "balance_due", label: "יתרה לתשלום", type: "number" },
      { key: "paid_amount", label: "סכום שולם", type: "number" },
      { key: "due_date", label: "תאריך פירעון", type: "date" },
      { key: "status", label: "סטטוס", type: "text" },
    ],
  },
  accounts_payable: {
    label: "חשבונות לתשלום",
    labelEn: "Accounts Payable",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "supplier_name", label: "שם ספק", type: "text" },
      { key: "balance_due", label: "יתרה לתשלום", type: "number" },
      { key: "due_date", label: "תאריך פירעון", type: "date" },
      { key: "status", label: "סטטוס", type: "text" },
    ],
  },
  sales_orders: {
    label: "הזמנות מכירה",
    labelEn: "Sales Orders",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "order_number", label: "מספר הזמנה", type: "text" },
      { key: "customer_name", label: "שם לקוח", type: "text" },
      { key: "total", label: "סכום כולל", type: "number" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "created_at", label: "נוצר ב", type: "date" },
    ],
  },
  budgets: {
    label: "תקציבים",
    labelEn: "Budgets",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "budget_name", label: "שם תקציב", type: "text" },
      { key: "category", label: "קטגוריה", type: "text" },
      { key: "department", label: "מחלקה", type: "text" },
      { key: "fiscal_year", label: "שנת כספים", type: "number" },
      { key: "budgeted_amount", label: "תקציב מאושר", type: "number" },
      { key: "actual_amount", label: "ביצוע בפועל", type: "number" },
      { key: "forecast_amount", label: "תחזית", type: "number" },
      { key: "status", label: "סטטוס", type: "text" },
    ],
  },
  projects: {
    label: "פרויקטים",
    labelEn: "Projects",
    columns: [
      { key: "id", label: "מזהה", type: "number" },
      { key: "project_name", label: "שם פרויקט", type: "text" },
      { key: "status", label: "סטטוס", type: "text" },
      { key: "actual_revenue", label: "הכנסות בפועל", type: "number" },
      { key: "actual_cost", label: "עלויות בפועל", type: "number" },
      { key: "start_date", label: "תחילת פרויקט", type: "date" },
      { key: "end_date", label: "סיום פרויקט", type: "date" },
    ],
  },
};

const JOIN_HINTS: { from: string; to: string; fromKey: string; toKey: string; label: string }[] = [
  { from: "income_documents", to: "customers", fromKey: "customer_name", toKey: "name", label: "לקוח" },
  { from: "accounts_receivable", to: "customers", fromKey: "customer_name", toKey: "name", label: "לקוח" },
  { from: "accounts_payable", to: "suppliers", fromKey: "supplier_name", toKey: "name", label: "ספק" },
  { from: "expenses", to: "suppliers", fromKey: "supplier_name", toKey: "name", label: "ספק" },
  { from: "sales_orders", to: "customers", fromKey: "customer_name", toKey: "name", label: "לקוח" },
];

router.get("/bi/adhoc/schema", async (_req: Request, res: Response) => {
  try {
    const entities = Object.entries(ALLOWED_TABLES).map(([key, meta]) => ({
      key,
      label: meta.label,
      labelEn: meta.labelEn,
      columns: meta.columns,
    }));
    res.json({ entities, joinHints: JOIN_HINTS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

function buildQuery(config: {
  tables: string[];
  joins: { fromTable: string; toTable: string; fromKey: string; toKey: string; joinType: string }[];
  columns: { table: string; column: string; alias?: string }[];
  filters: { table: string; column: string; operator: string; value: string }[];
  sorts: { table: string; column: string; direction: string }[];
  limit: number;
  offset: number;
}): string {
  const { tables, joins, columns, filters, sorts, limit, offset } = config;

  const safeTable = (t: string) => {
    const s = sanitizeIdentifier(t);
    if (!ALLOWED_TABLES[s]) throw new Error(`Table not allowed: ${t}`);
    return s;
  };

  const primaryTable = safeTable(tables[0]);
  const selectedCols = columns.length > 0
    ? columns.map(c => {
        const t = safeTable(c.table);
        const col = sanitizeIdentifier(c.column);
        const alias = c.alias ? ` AS "${sanitizeIdentifier(c.alias)}"` : "";
        return `"${t}"."${col}"${alias}`;
      }).join(", ")
    : `"${primaryTable}".*`;

  let q = `SELECT ${selectedCols} FROM "${primaryTable}"`;

  for (const join of joins) {
    const from = safeTable(join.fromTable);
    const to = safeTable(join.toTable);
    const fromKey = sanitizeIdentifier(join.fromKey);
    const toKey = sanitizeIdentifier(join.toKey);
    const jt = join.joinType === "left" ? "LEFT JOIN" : join.joinType === "right" ? "RIGHT JOIN" : "INNER JOIN";
    q += ` ${jt} "${to}" ON "${from}"."${fromKey}" = "${to}"."${toKey}"`;
  }

  if (filters.length > 0) {
    const whereClauses = filters.map(f => {
      const t = safeTable(f.table);
      const col = sanitizeIdentifier(f.column);
      const val = f.value.replace(/'/g, "''");
      switch (f.operator) {
        case "eq": return `"${t}"."${col}" = '${val}'`;
        case "neq": return `"${t}"."${col}" != '${val}'`;
        case "gt": return `"${t}"."${col}" > '${val}'`;
        case "gte": return `"${t}"."${col}" >= '${val}'`;
        case "lt": return `"${t}"."${col}" < '${val}'`;
        case "lte": return `"${t}"."${col}" <= '${val}'`;
        case "like": return `"${t}"."${col}" ILIKE '%${val}%'`;
        case "is_null": return `"${t}"."${col}" IS NULL`;
        case "is_not_null": return `"${t}"."${col}" IS NOT NULL`;
        default: return `"${t}"."${col}" = '${val}'`;
      }
    });
    q += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  if (sorts.length > 0) {
    const orderClauses = sorts.map(s => {
      const t = safeTable(s.table);
      const col = sanitizeIdentifier(s.column);
      const dir = s.direction === "desc" ? "DESC" : "ASC";
      return `"${t}"."${col}" ${dir}`;
    });
    q += ` ORDER BY ${orderClauses.join(", ")}`;
  }

  const safeLimit = Math.min(Math.max(1, parseInt(String(limit)) || 100), 1000);
  const safeOffset = Math.max(0, parseInt(String(offset)) || 0);
  q += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
  return q;
}

router.post("/bi/adhoc/execute", async (req: Request, res: Response) => {
  try {
    const { tables, joins = [], columns = [], filters = [], sorts = [], page = 1, pageSize = 50 } = req.body;
    if (!tables || tables.length === 0) { res.status(400).json({ error: "יש לבחור לפחות טבלה אחת" }); return; }

    const limit = Math.min(parseInt(String(pageSize)) || 50, 1000);
    const offset = (Math.max(1, parseInt(String(page))) - 1) * limit;

    const query = buildQuery({ tables, joins, columns, filters, sorts, limit, offset });

    const countQuery = buildQuery({ tables, joins, columns, filters, sorts, limit: 1, offset: 0 })
      .replace(/^SELECT .+? FROM/, "SELECT COUNT(*) as total FROM")
      .replace(/ LIMIT \d+ OFFSET \d+$/, "");

    const [dataResult, countResult] = await Promise.all([
      Promise.race([
        db.execute(sql.raw(query)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 10000)),
      ]),
      Promise.race([
        db.execute(sql.raw(countQuery)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Count timeout")), 5000)),
      ]).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const rows = (dataResult as any).rows || [];
    const total = Number((countResult as any).rows?.[0]?.total || rows.length);

    res.json({ rows, total, page: parseInt(String(page)), pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/bi/adhoc/saved", async (_req: Request, res: Response) => {
  try {
    const queries = await db.select().from(savedAdHocQueriesTable).orderBy(desc(savedAdHocQueriesTable.updatedAt));
    res.json(queries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/adhoc/saved/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [query] = await db.select().from(savedAdHocQueriesTable).where(eq(savedAdHocQueriesTable.id, id));
    if (!query) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(query);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bi/adhoc/saved", async (req: Request, res: Response) => {
  try {
    const { name, description, selectedTables, joins, selectedColumns, filters, sorts, isPublic } = req.body;
    if (!name) { res.status(400).json({ error: "שם השאילתה חובה" }); return; }
    const [created] = await db.insert(savedAdHocQueriesTable).values({
      name,
      description: description || null,
      queryConfig: { selectedTables, joins, selectedColumns, filters, sorts },
      selectedTables: selectedTables || [],
      joins: joins || [],
      selectedColumns: selectedColumns || [],
      filters: filters || [],
      sorts: sorts || [],
      isPublic: !!isPublic,
      updatedAt: new Date(),
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bi/adhoc/saved/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, selectedTables, joins, selectedColumns, filters, sorts, isPublic } = req.body;
    const [updated] = await db.update(savedAdHocQueriesTable)
      .set({
        name, description,
        queryConfig: { selectedTables, joins, selectedColumns, filters, sorts },
        selectedTables: selectedTables || [],
        joins: joins || [],
        selectedColumns: selectedColumns || [],
        filters: filters || [],
        sorts: sorts || [],
        isPublic: !!isPublic,
        updatedAt: new Date(),
      })
      .where(eq(savedAdHocQueriesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bi/adhoc/saved/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(savedAdHocQueriesTable).where(eq(savedAdHocQueriesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
