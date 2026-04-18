import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cashflow_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      direction VARCHAR(10) CHECK (direction IN ('inbound','outbound')),
      parent_id INTEGER REFERENCES cashflow_categories(id),
      color VARCHAR(30)
    );

    CREATE TABLE IF NOT EXISTS cashflow_entries (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      direction VARCHAR(10) CHECK (direction IN ('inbound','outbound')),
      category_id INTEGER REFERENCES cashflow_categories(id),
      description VARCHAR(400),
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      entity_type VARCHAR(20) DEFAULT 'other' CHECK (entity_type IN ('customer','supplier','employee','tax','bank','other')),
      entity_id INTEGER,
      entity_name VARCHAR(200),
      payment_method VARCHAR(20) DEFAULT 'transfer' CHECK (payment_method IN ('cash','check','transfer','credit_card')),
      reference VARCHAR(200),
      status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned','confirmed','completed')),
      recurring BOOLEAN DEFAULT FALSE,
      recurrence_rule VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cashflow_forecasts (
      id SERIAL PRIMARY KEY,
      period VARCHAR(10) NOT NULL,
      expected_inbound NUMERIC(14,2) DEFAULT 0,
      expected_outbound NUMERIC(14,2) DEFAULT 0,
      opening_balance NUMERIC(14,2) DEFAULT 0,
      closing_balance NUMERIC(14,2) DEFAULT 0,
      risk_level VARCHAR(10) DEFAULT 'safe' CHECK (risk_level IN ('safe','tight','critical')),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(20),
      entity_id INTEGER,
      entity_name VARCHAR(200),
      total_amount NUMERIC(14,2) DEFAULT 0,
      paid_amount NUMERIC(14,2) DEFAULT 0,
      remaining_amount NUMERIC(14,2) DEFAULT 0,
      installments JSONB DEFAULT '[]',
      next_payment_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureTables().catch(e => console.error("cashflow ensureTables:", e.message));

// ═══════════════════════════════════════════════════════════════════════════════
// CASHFLOW ENTRIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/cashflow/entries", async (req, res) => {
  try {
    const { from, to, direction, status } = req.query;
    let q = `SELECT e.*, c.name as category_name, c.color as category_color
             FROM cashflow_entries e LEFT JOIN cashflow_categories c ON e.category_id = c.id WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (from) { q += ` AND e.date >= $${idx++}`; params.push(from); }
    if (to) { q += ` AND e.date <= $${idx++}`; params.push(to); }
    if (direction) { q += ` AND e.direction = $${idx++}`; params.push(direction); }
    if (status) { q += ` AND e.status = $${idx++}`; params.push(status); }
    q += " ORDER BY e.date DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/cashflow/entries/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cashflow_entries WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/cashflow/entries", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO cashflow_entries (date, direction, category_id, description, amount, entity_type, entity_id, entity_name, payment_method, reference, status, recurring, recurrence_rule)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [b.date, b.direction, b.category_id, b.description, b.amount, b.entity_type || 'other',
       b.entity_id, b.entity_name, b.payment_method || 'transfer', b.reference,
       b.status || 'planned', b.recurring || false, b.recurrence_rule]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/cashflow/entries/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE cashflow_entries SET date=$1, direction=$2, category_id=$3, description=$4,
        amount=$5, entity_type=$6, entity_id=$7, entity_name=$8, payment_method=$9,
        reference=$10, status=$11, recurring=$12, recurrence_rule=$13
      WHERE id=$14 RETURNING *`,
      [b.date, b.direction, b.category_id, b.description, b.amount, b.entity_type,
       b.entity_id, b.entity_name, b.payment_method, b.reference,
       b.status, b.recurring, b.recurrence_rule, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/cashflow/entries/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM cashflow_entries WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASHFLOW CATEGORIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/cashflow/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cashflow_categories ORDER BY name");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/cashflow/categories", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO cashflow_categories (name, direction, parent_id, color)
      VALUES ($1,$2,$3,$4) RETURNING *`, [b.name, b.direction, b.parent_id, b.color]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/cashflow/categories/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE cashflow_categories SET name=$1, direction=$2, parent_id=$3, color=$4
      WHERE id=$5 RETURNING *`, [b.name, b.direction, b.parent_id, b.color, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/cashflow/categories/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM cashflow_categories WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASHFLOW FORECASTS CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/cashflow/forecasts", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cashflow_forecasts ORDER BY period");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/cashflow/forecasts", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO cashflow_forecasts (period, expected_inbound, expected_outbound, opening_balance, closing_balance, risk_level, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.period, b.expected_inbound, b.expected_outbound, b.opening_balance, b.closing_balance, b.risk_level || 'safe', b.notes]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/cashflow/forecasts/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE cashflow_forecasts SET period=$1, expected_inbound=$2, expected_outbound=$3,
        opening_balance=$4, closing_balance=$5, risk_level=$6, notes=$7
      WHERE id=$8 RETURNING *`,
      [b.period, b.expected_inbound, b.expected_outbound, b.opening_balance, b.closing_balance,
       b.risk_level, b.notes, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/cashflow/forecasts/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM cashflow_forecasts WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT SCHEDULES CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/cashflow/schedules", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM payment_schedules ORDER BY next_payment_date ASC NULLS LAST");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/cashflow/schedules", async (req, res) => {
  try {
    const b = req.body;
    const remaining = (parseFloat(b.total_amount) || 0) - (parseFloat(b.paid_amount) || 0);
    const { rows } = await pool.query(`
      INSERT INTO payment_schedules (entity_type, entity_id, entity_name, total_amount, paid_amount, remaining_amount, installments, next_payment_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.entity_type, b.entity_id, b.entity_name, b.total_amount, b.paid_amount || 0,
       remaining, JSON.stringify(b.installments || []), b.next_payment_date]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/cashflow/schedules/:id", async (req, res) => {
  try {
    const b = req.body;
    const remaining = (parseFloat(b.total_amount) || 0) - (parseFloat(b.paid_amount) || 0);
    const { rows } = await pool.query(`
      UPDATE payment_schedules SET entity_type=$1, entity_id=$2, entity_name=$3,
        total_amount=$4, paid_amount=$5, remaining_amount=$6, installments=$7, next_payment_date=$8
      WHERE id=$9 RETURNING *`,
      [b.entity_type, b.entity_id, b.entity_name, b.total_amount, b.paid_amount,
       remaining, JSON.stringify(b.installments || []), b.next_payment_date, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/cashflow/schedules/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM payment_schedules WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Weekly forecast (next 13 weeks)
router.get("/cashflow/weekly-forecast", async (_req, res) => {
  try {
    const weeks: any[] = [];
    const { rows: balRow } = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN direction='inbound' AND status='completed' THEN amount ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN direction='outbound' AND status='completed' THEN amount ELSE 0 END), 0) as balance
      FROM cashflow_entries
    `);
    let runningBalance = parseFloat(balRow[0]?.balance || "0");

    for (let w = 0; w < 13; w++) {
      const { rows } = await pool.query(`
        SELECT direction,
          COALESCE(SUM(amount), 0) as total
        FROM cashflow_entries
        WHERE date >= CURRENT_DATE + ($1 * 7) AND date < CURRENT_DATE + (($1 + 1) * 7)
        GROUP BY direction
      `, [w]);

      const inbound = parseFloat(rows.find((r: any) => r.direction === 'inbound')?.total || "0");
      const outbound = parseFloat(rows.find((r: any) => r.direction === 'outbound')?.total || "0");
      const opening = runningBalance;
      runningBalance += inbound - outbound;

      weeks.push({
        week: w + 1,
        start_date: new Date(Date.now() + w * 7 * 86400000).toISOString().split('T')[0],
        inbound, outbound,
        net: inbound - outbound,
        opening_balance: opening,
        closing_balance: runningBalance,
        risk: runningBalance < 0 ? 'critical' : runningBalance < 50000 ? 'tight' : 'safe'
      });
    }
    res.json(weeks);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Monthly forecast (next 12 months)
router.get("/cashflow/monthly-forecast", async (_req, res) => {
  try {
    const months: any[] = [];
    const { rows: balRow } = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN direction='inbound' AND status='completed' THEN amount ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN direction='outbound' AND status='completed' THEN amount ELSE 0 END), 0) as balance
      FROM cashflow_entries
    `);
    let running = parseFloat(balRow[0]?.balance || "0");

    for (let m = 0; m < 12; m++) {
      const { rows } = await pool.query(`
        SELECT direction, COALESCE(SUM(amount), 0) as total
        FROM cashflow_entries
        WHERE date >= (DATE_TRUNC('month', CURRENT_DATE) + ($1 || ' months')::INTERVAL)
          AND date < (DATE_TRUNC('month', CURRENT_DATE) + (($1 + 1) || ' months')::INTERVAL)
        GROUP BY direction
      `, [m]);

      const inb = parseFloat(rows.find((r: any) => r.direction === 'inbound')?.total || "0");
      const outb = parseFloat(rows.find((r: any) => r.direction === 'outbound')?.total || "0");
      const opening = running;
      running += inb - outb;

      const d = new Date();
      d.setMonth(d.getMonth() + m);
      months.push({
        period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        inbound: inb, outbound: outb, net: inb - outb,
        opening_balance: opening, closing_balance: running,
        risk: running < 0 ? 'critical' : running < 100000 ? 'tight' : 'safe'
      });
    }
    res.json(months);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Balance projection
router.get("/cashflow/balance-projection", async (_req, res) => {
  try {
    const { rows: completedBal } = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN amount ELSE -amount END), 0) as balance
      FROM cashflow_entries WHERE status = 'completed'
    `);
    const { rows: planned } = await pool.query(`
      SELECT date, direction, amount FROM cashflow_entries
      WHERE status IN ('planned','confirmed') ORDER BY date
    `);

    let current = parseFloat(completedBal.rows?.[0]?.balance || completedBal[0]?.balance || "0");
    const projections = planned.map((r: any) => {
      current += r.direction === 'inbound' ? parseFloat(r.amount) : -parseFloat(r.amount);
      return { date: r.date, balance: current, direction: r.direction, amount: parseFloat(r.amount) };
    });

    res.json({
      current_balance: parseFloat(completedBal[0]?.balance || "0"),
      projections,
      min_projected: projections.length ? Math.min(...projections.map((p: any) => p.balance)) : current,
      risk: projections.some((p: any) => p.balance < 0) ? 'critical' : 'safe'
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// What-if simulator
router.post("/cashflow/what-if", async (req, res) => {
  try {
    const { delay_days = 0, reduce_inbound_pct = 0, add_outbound = 0 } = req.body;

    const { rows: balRow } = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN direction='inbound' AND status='completed' THEN amount ELSE -amount END), 0) as balance
      FROM cashflow_entries WHERE status = 'completed'
    `);
    let balance = parseFloat(balRow[0]?.balance || "0");

    const { rows: future } = await pool.query(`
      SELECT date, direction, amount FROM cashflow_entries
      WHERE status IN ('planned','confirmed') ORDER BY date
    `);

    const scenario = future.map((r: any) => {
      let amt = parseFloat(r.amount);
      let date = r.date;
      if (r.direction === 'inbound') {
        amt *= (1 - (reduce_inbound_pct / 100));
        if (delay_days > 0) {
          const d = new Date(date);
          d.setDate(d.getDate() + delay_days);
          date = d.toISOString().split('T')[0];
        }
      }
      balance += r.direction === 'inbound' ? amt : -(amt + (r.direction === 'outbound' ? add_outbound : 0));
      return { date, direction: r.direction, amount: amt, balance };
    });

    const minBal = scenario.length ? Math.min(...scenario.map((s: any) => s.balance)) : balance;
    res.json({
      scenario,
      min_balance: minBal,
      days_until_negative: scenario.findIndex((s: any) => s.balance < 0),
      risk: minBal < 0 ? 'critical' : minBal < 50000 ? 'tight' : 'safe'
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Dashboard
router.get("/cashflow/dashboard", async (_req, res) => {
  try {
    const [balRes, thisMonthRes, upcomingRes, schedRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='inbound' AND status='completed' THEN amount ELSE 0 END), 0) as total_in,
                         COALESCE(SUM(CASE WHEN direction='outbound' AND status='completed' THEN amount ELSE 0 END), 0) as total_out
                  FROM cashflow_entries`),
      pool.query(`SELECT direction, COALESCE(SUM(amount), 0) as total
                  FROM cashflow_entries WHERE date >= DATE_TRUNC('month', CURRENT_DATE) AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                  GROUP BY direction`),
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
                  FROM cashflow_entries WHERE status = 'planned' AND date <= CURRENT_DATE + INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(remaining_amount), 0) as total
                  FROM payment_schedules WHERE next_payment_date <= CURRENT_DATE + INTERVAL '30 days'`),
    ]);

    const totalIn = parseFloat(balRes.rows[0]?.total_in || "0");
    const totalOut = parseFloat(balRes.rows[0]?.total_out || "0");
    const monthIn = parseFloat(thisMonthRes.rows.find((r: any) => r.direction === 'inbound')?.total || "0");
    const monthOut = parseFloat(thisMonthRes.rows.find((r: any) => r.direction === 'outbound')?.total || "0");

    res.json({
      current_balance: totalIn - totalOut,
      month_inbound: monthIn,
      month_outbound: monthOut,
      month_net: monthIn - monthOut,
      upcoming_payments_count: parseInt(upcomingRes.rows[0]?.cnt || "0"),
      upcoming_payments_total: parseFloat(upcomingRes.rows[0]?.total || "0"),
      schedules_due_count: parseInt(schedRes.rows[0]?.cnt || "0"),
      schedules_due_total: parseFloat(schedRes.rows[0]?.total || "0"),
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
