/**
 * GL Accounts (Chart of Accounts) API
 *
 * SAP-like chart of accounts management:
 * - Account categories: ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE
 * - Account groups for hierarchy
 * - Posting control (isPostingAllowed)
 * - Trial balance integration
 */
import { Router, Request, Response } from "express";
import { db } from "@db";
import { generalLedgerTable } from "@db/schema";
import { eq, desc, and, sql, like, or } from "drizzle-orm";

const router = Router();

// ═══════════════════════════════════════════════════════════════
// LIST — Get all GL accounts
// ═══════════════════════════════════════════════════════════════
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, search, active } = req.query;
    const conditions: any[] = [];

    if (category) conditions.push(eq(generalLedgerTable.category, String(category)));
    if (search) {
      conditions.push(or(
        like(generalLedgerTable.accountNo, `%${search}%`),
        like(generalLedgerTable.name, `%${search}%`),
        like(generalLedgerTable.nameHe, `%${search}%`)
      ));
    }

    let query = db.select().from(generalLedgerTable);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const accounts = await (query as any).orderBy(generalLedgerTable.accountNo);
    res.json({ data: accounts, total: accounts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET BY ID
// ═══════════════════════════════════════════════════════════════
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const [account] = await db
      .select()
      .from(generalLedgerTable)
      .where(eq(generalLedgerTable.id, Number(req.params.id)));

    if (!account) {
      return res.status(404).json({ error: "GL Account not found" });
    }

    res.json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATE — New GL account
// ═══════════════════════════════════════════════════════════════
router.post("/", async (req: Request, res: Response) => {
  try {
    const { accountNo, name, nameHe, category, parentAccountNo, isPostingAllowed, description } = req.body;

    if (!accountNo || !name || !category) {
      return res.status(400).json({ error: "accountNo, name, and category are required" });
    }

    const validCategories = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COGS", "EXPENSE"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` });
    }

    const [account] = await db
      .insert(generalLedgerTable)
      .values({
        accountNo,
        name,
        nameHe: nameHe || name,
        category,
        parentAccountNo,
        isPostingAllowed: isPostingAllowed !== false,
        description,
      })
      .returning();

    res.status(201).json(account);
  } catch (error: any) {
    if (error.message?.includes("unique")) {
      return res.status(409).json({ error: "Account number already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE — Edit GL account (only if no posted entries)
// ═══════════════════════════════════════════════════════════════
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const [account] = await db
      .select()
      .from(generalLedgerTable)
      .where(eq(generalLedgerTable.id, Number(req.params.id)));

    if (!account) {
      return res.status(404).json({ error: "GL Account not found" });
    }

    const { name, nameHe, category, parentAccountNo, isPostingAllowed, description } = req.body;

    const [updated] = await db
      .update(generalLedgerTable)
      .set({
        name: name ?? account.name,
        nameHe: nameHe ?? account.nameHe,
        category: category ?? account.category,
        parentAccountNo: parentAccountNo ?? account.parentAccountNo,
        isPostingAllowed: isPostingAllowed ?? account.isPostingAllowed,
        description: description ?? account.description,
      })
      .where(eq(generalLedgerTable.id, Number(req.params.id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEED — Initialize standard Israeli chart of accounts
// ═══════════════════════════════════════════════════════════════
router.post("/seed", async (req: Request, res: Response) => {
  try {
    const standardAccounts = [
      // Assets — נכסים
      { accountNo: "100100", name: "Bank Account", nameHe: "חשבון בנק", category: "ASSET" },
      { accountNo: "110100", name: "Accounts Receivable", nameHe: "חייבים", category: "ASSET" },
      { accountNo: "120100", name: "Prepaid Expenses", nameHe: "הוצאות מראש", category: "ASSET" },
      { accountNo: "130100", name: "Inventory — Raw Materials", nameHe: "מלאי — חומרי גלם", category: "ASSET" },
      { accountNo: "130200", name: "Inventory — Finished Goods", nameHe: "מלאי — מוצרים מוגמרים", category: "ASSET" },
      { accountNo: "130300", name: "Inventory — WIP", nameHe: "מלאי — עבודה בתהליך", category: "ASSET" },
      { accountNo: "150100", name: "Fixed Assets", nameHe: "רכוש קבוע", category: "ASSET" },
      { accountNo: "155100", name: "Accumulated Depreciation", nameHe: "פחת מצטבר", category: "ASSET" },

      // Liabilities — התחייבויות
      { accountNo: "220100", name: "Accounts Payable", nameHe: "זכאים", category: "LIABILITY" },
      { accountNo: "230100", name: "VAT Payable", nameHe: 'מע"מ עסקאות', category: "LIABILITY" },
      { accountNo: "230200", name: "VAT Receivable", nameHe: 'מע"מ תשומות', category: "LIABILITY" },
      { accountNo: "240100", name: "Accrued Expenses", nameHe: "הוצאות לשלם", category: "LIABILITY" },
      { accountNo: "250100", name: "Employee Benefits Payable", nameHe: "התחייבויות לעובדים", category: "LIABILITY" },
      { accountNo: "260100", name: "Tax Payable", nameHe: "מס הכנסה לשלם", category: "LIABILITY" },

      // Equity — הון עצמי
      { accountNo: "300100", name: "Share Capital", nameHe: "הון מניות", category: "EQUITY" },
      { accountNo: "310100", name: "Retained Earnings", nameHe: "עודפים", category: "EQUITY" },

      // Revenue — הכנסות
      { accountNo: "400100", name: "Sales Revenue", nameHe: "הכנסות ממכירות", category: "REVENUE" },
      { accountNo: "400200", name: "Service Revenue", nameHe: "הכנסות משירותים", category: "REVENUE" },
      { accountNo: "400300", name: "Project Revenue", nameHe: "הכנסות מפרויקטים", category: "REVENUE" },
      { accountNo: "410100", name: "Other Income", nameHe: "הכנסות אחרות", category: "REVENUE" },

      // COGS — עלות המכר
      { accountNo: "500100", name: "COGS — Materials", nameHe: "עלות חומרים", category: "COGS" },
      { accountNo: "500200", name: "COGS — Labor", nameHe: "עלות עבודה", category: "COGS" },
      { accountNo: "500300", name: "COGS — Overhead", nameHe: "עלות עקיפה", category: "COGS" },
      { accountNo: "500400", name: "COGS — Subcontractors", nameHe: "עלות קבלני משנה", category: "COGS" },

      // Expenses — הוצאות
      { accountNo: "600100", name: "Production Overhead", nameHe: "הוצאות ייצור", category: "EXPENSE" },
      { accountNo: "610100", name: "Salaries & Wages", nameHe: "שכר עבודה", category: "EXPENSE" },
      { accountNo: "620100", name: "Rent & Utilities", nameHe: "שכירות וארנונה", category: "EXPENSE" },
      { accountNo: "630100", name: "Insurance", nameHe: "ביטוח", category: "EXPENSE" },
      { accountNo: "640100", name: "Depreciation", nameHe: "פחת", category: "EXPENSE" },
      { accountNo: "650100", name: "Transportation", nameHe: "הובלות", category: "EXPENSE" },
      { accountNo: "700100", name: "Admin Expenses", nameHe: "הוצאות הנהלה", category: "EXPENSE" },
      { accountNo: "700200", name: "Selling Expenses", nameHe: "הוצאות מכירה", category: "EXPENSE" },
      { accountNo: "800100", name: "Finance Expenses", nameHe: "הוצאות מימון", category: "EXPENSE" },
      { accountNo: "900100", name: "Tax Expense", nameHe: "הוצאות מס", category: "EXPENSE" },
    ];

    let created = 0;
    let skipped = 0;

    for (const acc of standardAccounts) {
      try {
        await db.insert(generalLedgerTable).values({
          ...acc,
          isPostingAllowed: true,
        });
        created++;
      } catch {
        skipped++;
      }
    }

    res.json({ message: `Seeded ${created} accounts, skipped ${skipped} (already exist)`, total: standardAccounts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNT BALANCE — Get balance for specific account
// ═══════════════════════════════════════════════════════════════
router.get("/:accountNo/balance", async (req: Request, res: Response) => {
  try {
    const { accountNo } = req.params;
    const { dateFrom, dateTo } = req.query;

    const result = await db.execute(sql`
      SELECT
        ${accountNo} as account_no,
        COALESCE(SUM(CAST(jl.debit AS NUMERIC)), 0) as total_debit,
        COALESCE(SUM(CAST(jl.credit AS NUMERIC)), 0) as total_credit,
        COALESCE(SUM(CAST(jl.debit AS NUMERIC)), 0) - COALESCE(SUM(CAST(jl.credit AS NUMERIC)), 0) as balance,
        COUNT(*) as transaction_count
      FROM journal_entry_lines jl
      INNER JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE je.status = 'POSTED' AND jl.gl_account_no = ${accountNo}
      ${dateFrom ? sql`AND je.posting_date >= ${String(dateFrom)}` : sql``}
      ${dateTo ? sql`AND je.posting_date <= ${String(dateTo)}` : sql``}
    `);

    res.json(result.rows?.[0] || result[0] || { balance: 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
