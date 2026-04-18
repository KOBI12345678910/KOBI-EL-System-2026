import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_periods (
      id SERIAL PRIMARY KEY,
      period VARCHAR(20) NOT NULL UNIQUE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
      closed_by VARCHAR(200),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS balance_sheet_items (
      id SERIAL PRIMARY KEY,
      period_id INTEGER REFERENCES financial_periods(id) ON DELETE CASCADE,
      category VARCHAR(40) NOT NULL CHECK (category IN ('current_asset','fixed_asset','current_liability','long_term_liability','equity')),
      subcategory VARCHAR(200),
      item_name VARCHAR(300) NOT NULL,
      amount NUMERIC(18,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS income_statement_items (
      id SERIAL PRIMARY KEY,
      period_id INTEGER REFERENCES financial_periods(id) ON DELETE CASCADE,
      category VARCHAR(40) NOT NULL CHECK (category IN ('revenue','cost_of_goods','operating_expense','financial_expense','tax')),
      item_name VARCHAR(300) NOT NULL,
      amount NUMERIC(18,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables().catch(e => console.error("financial-statements tables:", e.message));

/* ───── PERIODS CRUD ───── */
router.get("/api/financial-periods", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM financial_periods ORDER BY start_date DESC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/financial-periods", async (req: Request, res: Response) => {
  try {
    const { period, start_date, end_date, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO financial_periods (period, start_date, end_date, status) VALUES ($1,$2,$3,$4) RETURNING *`,
      [period, start_date, end_date, status || 'open']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/financial-periods/:id", async (req: Request, res: Response) => {
  try {
    const { period, start_date, end_date, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE financial_periods SET period=$1, start_date=$2, end_date=$3, status=$4 WHERE id=$5 RETURNING *`,
      [period, start_date, end_date, status, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/financial-periods/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM financial_periods WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Close period
router.post("/api/financial-statements/close-period/:periodId", async (req: Request, res: Response) => {
  try {
    const { closed_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE financial_periods SET status = 'closed', closed_by = $1, closed_at = NOW() WHERE id = $2 RETURNING *`,
      [closed_by || 'system', req.params.periodId]
    );
    if (!rows.length) return res.status(404).json({ error: "תקופה לא נמצאה" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── BALANCE SHEET ITEMS CRUD ───── */
router.get("/api/balance-sheet-items", async (req: Request, res: Response) => {
  try {
    const pid = req.query.period_id;
    const where = pid ? `WHERE b.period_id = ${Number(pid)}` : "";
    const { rows } = await pool.query(`SELECT b.*, fp.period as period_name FROM balance_sheet_items b LEFT JOIN financial_periods fp ON fp.id = b.period_id ${where} ORDER BY b.category, b.subcategory, b.item_name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/balance-sheet-items", async (req: Request, res: Response) => {
  try {
    const { period_id, category, subcategory, item_name, amount, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO balance_sheet_items (period_id, category, subcategory, item_name, amount, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [period_id, category, subcategory, item_name, amount || 0, notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/balance-sheet-items/:id", async (req: Request, res: Response) => {
  try {
    const { period_id, category, subcategory, item_name, amount, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE balance_sheet_items SET period_id=$1, category=$2, subcategory=$3, item_name=$4, amount=$5, notes=$6 WHERE id=$7 RETURNING *`,
      [period_id, category, subcategory, item_name, amount, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/balance-sheet-items/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM balance_sheet_items WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── INCOME STATEMENT ITEMS CRUD ───── */
router.get("/api/income-statement-items", async (req: Request, res: Response) => {
  try {
    const pid = req.query.period_id;
    const where = pid ? `WHERE i.period_id = ${Number(pid)}` : "";
    const { rows } = await pool.query(`SELECT i.*, fp.period as period_name FROM income_statement_items i LEFT JOIN financial_periods fp ON fp.id = i.period_id ${where} ORDER BY i.category, i.item_name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/income-statement-items", async (req: Request, res: Response) => {
  try {
    const { period_id, category, item_name, amount, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO income_statement_items (period_id, category, item_name, amount, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [period_id, category, item_name, amount || 0, notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/income-statement-items/:id", async (req: Request, res: Response) => {
  try {
    const { period_id, category, item_name, amount, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE income_statement_items SET period_id=$1, category=$2, item_name=$3, amount=$4, notes=$5 WHERE id=$6 RETURNING *`,
      [period_id, category, item_name, amount, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/income-statement-items/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM income_statement_items WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── STRUCTURED REPORTS ───── */

// Balance Sheet by period
router.get("/api/financial-statements/balance-sheet/:period", async (req: Request, res: Response) => {
  try {
    const { rows: periods } = await pool.query("SELECT * FROM financial_periods WHERE period = $1", [req.params.period]);
    if (!periods.length) return res.status(404).json({ error: "תקופה לא נמצאה" });
    const periodId = periods[0].id;

    const { rows: items } = await pool.query("SELECT * FROM balance_sheet_items WHERE period_id = $1 ORDER BY category, subcategory, item_name", [periodId]);

    const groupBy = (cat: string) => items.filter((i: any) => i.category === cat);
    const sumOf = (arr: any[]) => arr.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const currentAssets = groupBy('current_asset');
    const fixedAssets = groupBy('fixed_asset');
    const currentLiabilities = groupBy('current_liability');
    const longTermLiabilities = groupBy('long_term_liability');
    const equity = groupBy('equity');

    const totalAssets = sumOf(currentAssets) + sumOf(fixedAssets);
    const totalLiabilities = sumOf(currentLiabilities) + sumOf(longTermLiabilities);
    const totalEquity = sumOf(equity);

    res.json({
      period: periods[0],
      assets: { current: currentAssets, fixed: fixedAssets, totalAssets },
      liabilities: { current: currentLiabilities, longTerm: longTermLiabilities, totalLiabilities },
      equity,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Income Statement (P&L) by period
router.get("/api/financial-statements/income-statement/:period", async (req: Request, res: Response) => {
  try {
    const { rows: periods } = await pool.query("SELECT * FROM financial_periods WHERE period = $1", [req.params.period]);
    if (!periods.length) return res.status(404).json({ error: "תקופה לא נמצאה" });
    const periodId = periods[0].id;

    const { rows: items } = await pool.query("SELECT * FROM income_statement_items WHERE period_id = $1 ORDER BY category, item_name", [periodId]);

    const groupBy = (cat: string) => items.filter((i: any) => i.category === cat);
    const sumOf = (arr: any[]) => arr.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const revenue = groupBy('revenue');
    const costOfGoods = groupBy('cost_of_goods');
    const operatingExpenses = groupBy('operating_expense');
    const financialExpenses = groupBy('financial_expense');
    const taxes = groupBy('tax');

    const totalRevenue = sumOf(revenue);
    const totalCOGS = sumOf(costOfGoods);
    const grossProfit = totalRevenue - totalCOGS;
    const totalOpex = sumOf(operatingExpenses);
    const operatingProfit = grossProfit - totalOpex;
    const totalFinancial = sumOf(financialExpenses);
    const profitBeforeTax = operatingProfit - totalFinancial;
    const totalTax = sumOf(taxes);
    const netProfit = profitBeforeTax - totalTax;

    res.json({
      period: periods[0],
      revenue, totalRevenue,
      costOfGoods, totalCOGS,
      grossProfit,
      operatingExpenses, totalOpex,
      operatingProfit,
      financialExpenses, totalFinancial,
      profitBeforeTax,
      taxes, totalTax,
      netProfit,
      grossMargin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0',
      operatingMargin: totalRevenue > 0 ? ((operatingProfit / totalRevenue) * 100).toFixed(1) : '0',
      netMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Cash Flow (simplified from income + balance sheet)
router.get("/api/financial-statements/cashflow/:period", async (req: Request, res: Response) => {
  try {
    const { rows: periods } = await pool.query("SELECT * FROM financial_periods WHERE period = $1", [req.params.period]);
    if (!periods.length) return res.status(404).json({ error: "תקופה לא נמצאה" });
    const periodId = periods[0].id;

    const { rows: income } = await pool.query("SELECT category, SUM(amount) as total FROM income_statement_items WHERE period_id = $1 GROUP BY category", [periodId]);
    const { rows: balance } = await pool.query("SELECT category, SUM(amount) as total FROM balance_sheet_items WHERE period_id = $1 GROUP BY category", [periodId]);

    const getIncome = (c: string) => Number(income.find((r: any) => r.category === c)?.total || 0);
    const getBalance = (c: string) => Number(balance.find((r: any) => r.category === c)?.total || 0);

    const netProfit = getIncome('revenue') - getIncome('cost_of_goods') - getIncome('operating_expense') - getIncome('financial_expense') - getIncome('tax');
    const depreciation = getBalance('fixed_asset') * 0.1; // estimate
    const operatingCashFlow = netProfit + depreciation;
    const investingCashFlow = -getBalance('fixed_asset') * 0.05;
    const financingCashFlow = getBalance('long_term_liability') * 0.02;
    const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

    res.json({
      period: periods[0],
      operating: { netProfit, depreciation, total: operatingCashFlow },
      investing: { capitalExpenditure: investingCashFlow, total: investingCashFlow },
      financing: { debtPayments: financingCashFlow, total: financingCashFlow },
      netCashFlow
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Financial Ratios
router.get("/api/financial-statements/ratios/:period", async (req: Request, res: Response) => {
  try {
    const { rows: periods } = await pool.query("SELECT * FROM financial_periods WHERE period = $1", [req.params.period]);
    if (!periods.length) return res.status(404).json({ error: "תקופה לא נמצאה" });
    const periodId = periods[0].id;

    const { rows: bs } = await pool.query("SELECT category, SUM(amount) as total FROM balance_sheet_items WHERE period_id = $1 GROUP BY category", [periodId]);
    const { rows: is_ } = await pool.query("SELECT category, SUM(amount) as total FROM income_statement_items WHERE period_id = $1 GROUP BY category", [periodId]);

    const getBS = (c: string) => Number(bs.find((r: any) => r.category === c)?.total || 0);
    const getIS = (c: string) => Number(is_.find((r: any) => r.category === c)?.total || 0);

    const currentAssets = getBS('current_asset');
    const fixedAssets = getBS('fixed_asset');
    const currentLiabilities = getBS('current_liability');
    const longTermLiabilities = getBS('long_term_liability');
    const equity = getBS('equity');
    const totalAssets = currentAssets + fixedAssets;
    const totalLiabilities = currentLiabilities + longTermLiabilities;
    const revenue = getIS('revenue');
    const netProfit = revenue - getIS('cost_of_goods') - getIS('operating_expense') - getIS('financial_expense') - getIS('tax');

    const safeDiv = (a: number, b: number) => b !== 0 ? Number((a / b).toFixed(2)) : 0;

    res.json({
      period: periods[0],
      ratios: {
        currentRatio: safeDiv(currentAssets, currentLiabilities),
        quickRatio: safeDiv(currentAssets * 0.8, currentLiabilities), // approximation
        debtToEquity: safeDiv(totalLiabilities, equity),
        roe: safeDiv(netProfit, equity) * 100,
        roa: safeDiv(netProfit, totalAssets) * 100,
        grossMargin: safeDiv(revenue - getIS('cost_of_goods'), revenue) * 100,
        netMargin: safeDiv(netProfit, revenue) * 100,
        assetTurnover: safeDiv(revenue, totalAssets),
      }
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Dashboard
router.get("/api/financial-statements/dashboard", async (_req: Request, res: Response) => {
  try {
    const { rows: periods } = await pool.query("SELECT * FROM financial_periods ORDER BY start_date DESC LIMIT 5");
    const { rows: [counts] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM financial_periods) as total_periods,
        (SELECT COUNT(*) FROM financial_periods WHERE status = 'open') as open_periods,
        (SELECT COUNT(*) FROM financial_periods WHERE status = 'closed') as closed_periods,
        (SELECT COUNT(*) FROM balance_sheet_items) as bs_items,
        (SELECT COUNT(*) FROM income_statement_items) as is_items
    `);

    // Latest period summary
    let latestSummary = null;
    if (periods.length) {
      const pid = periods[0].id;
      const { rows: bsTotals } = await pool.query("SELECT category, SUM(amount) as total FROM balance_sheet_items WHERE period_id = $1 GROUP BY category", [pid]);
      const { rows: isTotals } = await pool.query("SELECT category, SUM(amount) as total FROM income_statement_items WHERE period_id = $1 GROUP BY category", [pid]);
      const getBS = (c: string) => Number(bsTotals.find((r: any) => r.category === c)?.total || 0);
      const getIS = (c: string) => Number(isTotals.find((r: any) => r.category === c)?.total || 0);
      const revenue = getIS('revenue');
      const netProfit = revenue - getIS('cost_of_goods') - getIS('operating_expense') - getIS('financial_expense') - getIS('tax');
      latestSummary = {
        period: periods[0].period,
        totalAssets: getBS('current_asset') + getBS('fixed_asset'),
        totalLiabilities: getBS('current_liability') + getBS('long_term_liability'),
        equity: getBS('equity'),
        revenue, netProfit
      };
    }

    res.json({ periods, counts, latestSummary });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
