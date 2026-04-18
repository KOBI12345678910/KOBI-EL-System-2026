import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_periods (
      id SERIAL PRIMARY KEY,
      period VARCHAR(10) NOT NULL,
      vat_rate REAL DEFAULT 18,
      income_tax_advance NUMERIC(14,2) DEFAULT 0,
      social_security NUMERIC(14,2) DEFAULT 0,
      total_vat_input NUMERIC(14,2) DEFAULT 0,
      total_vat_output NUMERIC(14,2) DEFAULT 0,
      net_vat NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','calculated','filed','paid')),
      due_date DATE,
      filed_at TIMESTAMP,
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tax_transactions (
      id SERIAL PRIMARY KEY,
      period_id INTEGER REFERENCES tax_periods(id),
      transaction_type VARCHAR(20) CHECK (transaction_type IN ('sale','purchase','expense','import')),
      document_type VARCHAR(20) CHECK (document_type IN ('invoice','receipt','credit_note')),
      document_number VARCHAR(100),
      entity_name VARCHAR(200),
      amount_before_vat NUMERIC(14,2) DEFAULT 0,
      vat_amount NUMERIC(14,2) DEFAULT 0,
      total_amount NUMERIC(14,2) DEFAULT 0,
      withholding_tax NUMERIC(14,2) DEFAULT 0,
      date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tax_reports (
      id SERIAL PRIMARY KEY,
      period_id INTEGER REFERENCES tax_periods(id),
      report_type VARCHAR(30) CHECK (report_type IN ('vat_856','income_tax_advance','social_security','annual')),
      generated_data JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','final','submitted')),
      generated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withholding_tax_records (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name VARCHAR(200),
      certificate_number VARCHAR(100),
      rate REAL DEFAULT 0,
      valid_from DATE,
      valid_to DATE,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureTables().catch(e => console.error("tax ensureTables:", e.message));

const VAT_RATE = 18; // Israeli VAT

// ═══════════════════════════════════════════════════════════════════════════════
// TAX PERIODS CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/tax/periods", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tax_transactions WHERE period_id = p.id) as transaction_count,
        (SELECT COUNT(*) FROM tax_reports WHERE period_id = p.id) as report_count
      FROM tax_periods p ORDER BY p.period DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/tax/periods/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM tax_periods WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/tax/periods", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO tax_periods (period, vat_rate, income_tax_advance, social_security, total_vat_input, total_vat_output, net_vat, status, due_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.period, b.vat_rate || VAT_RATE, b.income_tax_advance || 0, b.social_security || 0,
       b.total_vat_input || 0, b.total_vat_output || 0, b.net_vat || 0,
       b.status || 'open', b.due_date]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/tax/periods/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE tax_periods SET period=$1, vat_rate=$2, income_tax_advance=$3, social_security=$4,
        total_vat_input=$5, total_vat_output=$6, net_vat=$7, status=$8, due_date=$9,
        filed_at=$10, paid_at=$11
      WHERE id=$12 RETURNING *`,
      [b.period, b.vat_rate, b.income_tax_advance, b.social_security,
       b.total_vat_input, b.total_vat_output, b.net_vat, b.status, b.due_date,
       b.filed_at, b.paid_at, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/tax/periods/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tax_transactions WHERE period_id = $1", [req.params.id]);
    await pool.query("DELETE FROM tax_reports WHERE period_id = $1", [req.params.id]);
    await pool.query("DELETE FROM tax_periods WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Calculate period
router.post("/tax/calculate-period/:periodId", async (req, res) => {
  try {
    const pid = req.params.periodId;

    // Sum sales = VAT output
    const { rows: salesRows } = await pool.query(`
      SELECT COALESCE(SUM(vat_amount), 0) as vat_output,
             COALESCE(SUM(amount_before_vat), 0) as sales_total
      FROM tax_transactions
      WHERE period_id = $1 AND transaction_type = 'sale'`, [pid]);

    // Sum purchases + expenses = VAT input
    const { rows: purchaseRows } = await pool.query(`
      SELECT COALESCE(SUM(vat_amount), 0) as vat_input,
             COALESCE(SUM(amount_before_vat), 0) as purchase_total
      FROM tax_transactions
      WHERE period_id = $1 AND transaction_type IN ('purchase','expense','import')`, [pid]);

    // Sum withholding tax
    const { rows: whRows } = await pool.query(`
      SELECT COALESCE(SUM(withholding_tax), 0) as wh_total
      FROM tax_transactions WHERE period_id = $1`, [pid]);

    const vatOutput = parseFloat(salesRows[0]?.vat_output || "0");
    const vatInput = parseFloat(purchaseRows[0]?.vat_input || "0");
    const netVat = vatOutput - vatInput;

    // Update period
    const { rows } = await pool.query(`
      UPDATE tax_periods SET
        total_vat_output = $1, total_vat_input = $2, net_vat = $3, status = 'calculated'
      WHERE id = $4 RETURNING *`,
      [vatOutput, vatInput, netVat, pid]);

    if (!rows[0]) return res.status(404).json({ message: "Period not found" });

    res.json({
      ...rows[0],
      sales_total: parseFloat(salesRows[0]?.sales_total || "0"),
      purchase_total: parseFloat(purchaseRows[0]?.purchase_total || "0"),
      withholding_total: parseFloat(whRows[0]?.wh_total || "0"),
      vat_to_pay: netVat > 0 ? netVat : 0,
      vat_to_refund: netVat < 0 ? Math.abs(netVat) : 0,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAX TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/tax/transactions/:periodId", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM tax_transactions WHERE period_id = $1 ORDER BY date DESC`, [req.params.periodId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/tax/transactions", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, p.period
      FROM tax_transactions t
      LEFT JOIN tax_periods p ON t.period_id = p.id
      ORDER BY t.date DESC LIMIT 500`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/tax/transactions", async (req, res) => {
  try {
    const b = req.body;
    // Auto-calculate VAT if not provided
    const beforeVat = parseFloat(b.amount_before_vat) || 0;
    const vatAmt = b.vat_amount != null ? parseFloat(b.vat_amount) : beforeVat * (VAT_RATE / 100);
    const total = b.total_amount != null ? parseFloat(b.total_amount) : beforeVat + vatAmt;

    const { rows } = await pool.query(`
      INSERT INTO tax_transactions (period_id, transaction_type, document_type, document_number,
        entity_name, amount_before_vat, vat_amount, total_amount, withholding_tax, date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.period_id, b.transaction_type, b.document_type, b.document_number,
       b.entity_name, beforeVat, vatAmt, total, b.withholding_tax || 0, b.date]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/tax/transactions/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE tax_transactions SET period_id=$1, transaction_type=$2, document_type=$3,
        document_number=$4, entity_name=$5, amount_before_vat=$6, vat_amount=$7,
        total_amount=$8, withholding_tax=$9, date=$10
      WHERE id=$11 RETURNING *`,
      [b.period_id, b.transaction_type, b.document_type, b.document_number,
       b.entity_name, b.amount_before_vat, b.vat_amount, b.total_amount,
       b.withholding_tax, b.date, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/tax/transactions/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tax_transactions WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAX REPORTS
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/tax/reports", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, p.period
      FROM tax_reports r LEFT JOIN tax_periods p ON r.period_id = p.id
      ORDER BY r.generated_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/tax/file-report/:periodId", async (req, res) => {
  try {
    const pid = req.params.periodId;
    const reportType = req.body.report_type || 'vat_856';

    // Get period data
    const { rows: [period] } = await pool.query("SELECT * FROM tax_periods WHERE id = $1", [pid]);
    if (!period) return res.status(404).json({ message: "Period not found" });

    // Get transactions for the period
    const { rows: txns } = await pool.query("SELECT * FROM tax_transactions WHERE period_id = $1", [pid]);

    const reportData = {
      period: period.period,
      vat_rate: period.vat_rate,
      total_vat_output: period.total_vat_output,
      total_vat_input: period.total_vat_input,
      net_vat: period.net_vat,
      income_tax_advance: period.income_tax_advance,
      social_security: period.social_security,
      transaction_count: txns.length,
      sales_count: txns.filter((t: any) => t.transaction_type === 'sale').length,
      purchase_count: txns.filter((t: any) => t.transaction_type === 'purchase').length,
      generated_at: new Date().toISOString(),
    };

    const { rows } = await pool.query(`
      INSERT INTO tax_reports (period_id, report_type, generated_data, status)
      VALUES ($1,$2,$3,$4) RETURNING *`,
      [pid, reportType, JSON.stringify(reportData), 'draft']);

    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WITHHOLDING TAX CERTIFICATES
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/tax/withholding-certificates", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM withholding_tax_records ORDER BY valid_to DESC NULLS LAST");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/tax/withholding-certificates", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO withholding_tax_records (supplier_id, supplier_name, certificate_number, rate, valid_from, valid_to, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.supplier_id, b.supplier_name, b.certificate_number, b.rate, b.valid_from, b.valid_to, b.status || 'active']);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/tax/withholding-certificates/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE withholding_tax_records SET supplier_id=$1, supplier_name=$2, certificate_number=$3,
        rate=$4, valid_from=$5, valid_to=$6, status=$7
      WHERE id=$8 RETURNING *`,
      [b.supplier_id, b.supplier_name, b.certificate_number, b.rate, b.valid_from, b.valid_to, b.status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/tax/withholding-certificates/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM withholding_tax_records WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGATIONS & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/tax/obligations", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, period, status, due_date, net_vat, income_tax_advance, social_security,
        (COALESCE(net_vat,0) + COALESCE(income_tax_advance,0) + COALESCE(social_security,0)) as total_obligation
      FROM tax_periods
      WHERE status IN ('open','calculated') AND due_date IS NOT NULL
      ORDER BY due_date ASC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/tax/dashboard", async (_req, res) => {
  try {
    const [periodsRes, currentRes, upcomingRes, whRes, annualRes] = await Promise.all([
      pool.query("SELECT COUNT(*) as cnt, status FROM tax_periods GROUP BY status"),
      pool.query(`SELECT * FROM tax_periods WHERE period = TO_CHAR(CURRENT_DATE, 'YYYY-MM') LIMIT 1`),
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN net_vat > 0 THEN net_vat ELSE 0 END), 0) as vat_due,
                         COALESCE(SUM(income_tax_advance), 0) as income_tax_due,
                         COALESCE(SUM(social_security), 0) as ss_due
                  FROM tax_periods WHERE status IN ('open','calculated') AND due_date <= CURRENT_DATE + INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'expired') as expired
                  FROM withholding_tax_records`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN net_vat > 0 THEN net_vat ELSE 0 END), 0) as annual_vat_paid,
                         COALESCE(SUM(income_tax_advance), 0) as annual_income_tax,
                         COALESCE(SUM(social_security), 0) as annual_ss
                  FROM tax_periods WHERE period LIKE $1 AND status IN ('calculated','filed','paid')`,
                  [new Date().getFullYear() + '%']),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of periodsRes.rows) byStatus[r.status] = parseInt(r.cnt);

    res.json({
      current_period: currentRes.rows[0] || null,
      periods_by_status: byStatus,
      upcoming_obligations: {
        count: parseInt(upcomingRes.rows[0]?.cnt || "0"),
        vat_due: parseFloat(upcomingRes.rows[0]?.vat_due || "0"),
        income_tax_due: parseFloat(upcomingRes.rows[0]?.income_tax_due || "0"),
        social_security_due: parseFloat(upcomingRes.rows[0]?.ss_due || "0"),
        total: parseFloat(upcomingRes.rows[0]?.vat_due || "0") +
               parseFloat(upcomingRes.rows[0]?.income_tax_due || "0") +
               parseFloat(upcomingRes.rows[0]?.ss_due || "0"),
      },
      withholding_certificates: {
        total: parseInt(whRes.rows[0]?.total || "0"),
        expired: parseInt(whRes.rows[0]?.expired || "0"),
      },
      annual_summary: {
        vat_paid: parseFloat(annualRes.rows[0]?.annual_vat_paid || "0"),
        income_tax: parseFloat(annualRes.rows[0]?.annual_income_tax || "0"),
        social_security: parseFloat(annualRes.rows[0]?.annual_ss || "0"),
      },
      vat_rate: VAT_RATE,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
