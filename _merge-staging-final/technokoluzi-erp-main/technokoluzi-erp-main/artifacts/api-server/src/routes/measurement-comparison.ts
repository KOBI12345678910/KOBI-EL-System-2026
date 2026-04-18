import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS measurement_records (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      measured_by_type VARCHAR(20) CHECK (measured_by_type IN ('sales_agent','engineer')),
      measured_by_id INTEGER NOT NULL,
      measured_by_name VARCHAR(200) NOT NULL,
      measurements JSONB DEFAULT '[]',
      total_meters NUMERIC(12,3) DEFAULT 0,
      photos JSONB DEFAULT '[]',
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS measurement_comparisons (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      agent_measurement_id INTEGER REFERENCES measurement_records(id),
      engineer_measurement_id INTEGER REFERENCES measurement_records(id),
      total_discrepancy_m NUMERIC(12,3) DEFAULT 0,
      discrepancy_pct REAL DEFAULT 0,
      items_matched INTEGER DEFAULT 0,
      items_mismatched INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_review')),
      reviewed_by VARCHAR(200),
      review_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS measurement_discrepancies (
      id SERIAL PRIMARY KEY,
      comparison_id INTEGER REFERENCES measurement_comparisons(id) ON DELETE CASCADE,
      item_name VARCHAR(300),
      agent_value NUMERIC(12,3) DEFAULT 0,
      engineer_value NUMERIC(12,3) DEFAULT 0,
      difference NUMERIC(12,3) DEFAULT 0,
      difference_pct REAL DEFAULT 0,
      severity VARCHAR(10) DEFAULT 'ok' CHECK (severity IN ('ok','warning','critical')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() { if (!tablesReady) { await ensureTables(); tablesReady = true; } }

/* ───── SEED DEMO DATA ───── */
async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM measurement_records");
  if (Number(rows[0].cnt) > 0) return;

  const projects = [
    { id: 101, items: [
      { item: "גדר קדמית", length_m: 12.5, width_m: 1.8, height_m: 2.0, quantity: 1, notes: "" },
      { item: "שער חשמלי", length_m: 4.0, width_m: 0, height_m: 2.2, quantity: 1, notes: "דו-כנפי" },
      { item: "מעקה מרפסת", length_m: 8.3, width_m: 0, height_m: 1.05, quantity: 1, notes: "אלומיניום" },
    ]},
    { id: 102, items: [
      { item: "פרגולה", length_m: 6.0, width_m: 4.0, height_m: 2.8, quantity: 1, notes: "" },
      { item: "סורגים חלונות", length_m: 1.2, width_m: 0, height_m: 1.5, quantity: 6, notes: "" },
    ]},
    { id: 103, items: [
      { item: "מסגרת דלת", length_m: 1.0, width_m: 0, height_m: 2.1, quantity: 3, notes: "פלדה" },
      { item: "מדרגות ספירלה", length_m: 3.5, width_m: 1.2, height_m: 3.0, quantity: 1, notes: "" },
      { item: "מעקה בטיחות", length_m: 5.0, width_m: 0, height_m: 1.1, quantity: 1, notes: "" },
    ]},
  ];

  for (const p of projects) {
    // agent measurement (slightly different values)
    const agentItems = p.items.map(i => ({
      ...i,
      length_m: +(i.length_m + (Math.random() - 0.3) * 0.5).toFixed(2),
      height_m: i.height_m ? +(i.height_m + (Math.random() - 0.4) * 0.15).toFixed(2) : 0,
    }));
    const agentTotal = agentItems.reduce((s, i) => s + i.length_m * i.quantity, 0);

    const { rows: ar } = await pool.query(
      `INSERT INTO measurement_records (project_id, measured_by_type, measured_by_id, measured_by_name, measurements, total_meters, status)
       VALUES ($1,'sales_agent',1,'יוסי כהן',$2,$3,'submitted') RETURNING id`,
      [p.id, JSON.stringify(agentItems), agentTotal]
    );

    // engineer measurement (reference values)
    const engTotal = p.items.reduce((s, i) => s + i.length_m * i.quantity, 0);
    const { rows: er } = await pool.query(
      `INSERT INTO measurement_records (project_id, measured_by_type, measured_by_id, measured_by_name, measurements, total_meters, status)
       VALUES ($1,'engineer',10,'מהנדס ראשי',$2,$3,'submitted') RETURNING id`,
      [p.id, JSON.stringify(p.items), engTotal]
    );

    // comparison
    const disc = Math.abs(agentTotal - engTotal);
    const discPct = engTotal > 0 ? (disc / engTotal) * 100 : 0;
    const status = discPct > 5 ? "needs_review" : discPct > 2 ? "needs_review" : "approved";

    const { rows: cr } = await pool.query(
      `INSERT INTO measurement_comparisons (project_id, agent_measurement_id, engineer_measurement_id, total_discrepancy_m, discrepancy_pct, items_matched, items_mismatched, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [p.id, ar[0].id, er[0].id, disc.toFixed(3), discPct.toFixed(1),
       p.items.length, 0, status]
    );

    // item-level discrepancies
    for (let idx = 0; idx < p.items.length; idx++) {
      const eng = p.items[idx];
      const agt = agentItems[idx];
      const diff = Math.abs(agt.length_m - eng.length_m);
      const diffPct = eng.length_m > 0 ? (diff / eng.length_m) * 100 : 0;
      const sev = diffPct > 5 ? "critical" : diffPct > 2 ? "warning" : "ok";
      await pool.query(
        `INSERT INTO measurement_discrepancies (comparison_id, item_name, agent_value, engineer_value, difference, difference_pct, severity)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cr[0].id, eng.item, agt.length_m, eng.length_m, diff.toFixed(3), diffPct.toFixed(1), sev]
      );
    }
  }
}

/* ───── ENDPOINTS ───── */

// POST record measurements
router.post("/measurements/record", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const measurements = b.measurements || [];
    const totalM = measurements.reduce((s: number, i: any) => s + (Number(i.length_m) || 0) * (Number(i.quantity) || 1), 0);
    const { rows } = await pool.query(
      `INSERT INTO measurement_records (project_id, measured_by_type, measured_by_id, measured_by_name, measurements, total_meters, photos, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.project_id, b.measured_by_type, b.measured_by_id, b.measured_by_name,
       JSON.stringify(measurements), totalM, JSON.stringify(b.photos || []), b.status || "submitted"]
    );
    res.json({ data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET measurements for project
router.get("/measurements/project/:projectId", async (req, res) => {
  try {
    await init(); await seedIfEmpty();
    const { rows } = await pool.query(
      `SELECT * FROM measurement_records WHERE project_id=$1 ORDER BY submitted_at DESC`,
      [req.params.projectId]
    );
    const { rows: comparisons } = await pool.query(
      `SELECT * FROM measurement_comparisons WHERE project_id=$1 ORDER BY created_at DESC`,
      [req.params.projectId]
    );
    res.json({ measurements: rows, comparisons });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST auto-compare
router.post("/measurements/compare/:projectId", async (req, res) => {
  try {
    await init();
    const pid = req.params.projectId;
    const { rows: agentRecs } = await pool.query(
      `SELECT * FROM measurement_records WHERE project_id=$1 AND measured_by_type='sales_agent' AND status='submitted' ORDER BY submitted_at DESC LIMIT 1`, [pid]
    );
    const { rows: engRecs } = await pool.query(
      `SELECT * FROM measurement_records WHERE project_id=$1 AND measured_by_type='engineer' AND status='submitted' ORDER BY submitted_at DESC LIMIT 1`, [pid]
    );
    if (!agentRecs[0] || !engRecs[0]) return res.status(400).json({ error: "חסרות מדידות סוכן או מהנדס" });

    const agentItems: any[] = agentRecs[0].measurements || [];
    const engItems: any[] = engRecs[0].measurements || [];

    const disc = Math.abs(Number(agentRecs[0].total_meters) - Number(engRecs[0].total_meters));
    const discPct = Number(engRecs[0].total_meters) > 0 ? (disc / Number(engRecs[0].total_meters)) * 100 : 0;

    let matched = 0, mismatched = 0;
    // Auto status: >5% critical, 2-5% needs_review, <2% approved
    const status = discPct > 5 ? "needs_review" : discPct > 2 ? "needs_review" : "approved";

    const { rows: comp } = await pool.query(
      `INSERT INTO measurement_comparisons (project_id, agent_measurement_id, engineer_measurement_id, total_discrepancy_m, discrepancy_pct, items_matched, items_mismatched, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [pid, agentRecs[0].id, engRecs[0].id, disc.toFixed(3), discPct.toFixed(1), 0, 0, status]
    );

    // compare items
    for (const engItem of engItems) {
      const agentItem = agentItems.find((a: any) => a.item === engItem.item);
      if (agentItem) {
        const diff = Math.abs(Number(agentItem.length_m) - Number(engItem.length_m));
        const diffPct = Number(engItem.length_m) > 0 ? (diff / Number(engItem.length_m)) * 100 : 0;
        const sev = diffPct > 5 ? "critical" : diffPct > 2 ? "warning" : "ok";
        if (sev === "ok") matched++; else mismatched++;
        await pool.query(
          `INSERT INTO measurement_discrepancies (comparison_id, item_name, agent_value, engineer_value, difference, difference_pct, severity)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [comp[0].id, engItem.item, agentItem.length_m, engItem.length_m, diff.toFixed(3), diffPct.toFixed(1), sev]
        );
      } else {
        mismatched++;
        await pool.query(
          `INSERT INTO measurement_discrepancies (comparison_id, item_name, agent_value, engineer_value, difference, difference_pct, severity)
           VALUES ($1,$2,0,$3,$4,100,'critical')`,
          [comp[0].id, engItem.item, engItem.length_m, engItem.length_m]
        );
      }
    }

    await pool.query(`UPDATE measurement_comparisons SET items_matched=$1, items_mismatched=$2 WHERE id=$3`, [matched, mismatched, comp[0].id]);
    comp[0].items_matched = matched;
    comp[0].items_mismatched = mismatched;

    res.json({ data: comp[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET comparison detail
router.get("/measurements/comparison/:comparisonId", async (req, res) => {
  try {
    await init();
    const { rows: comp } = await pool.query(`SELECT * FROM measurement_comparisons WHERE id=$1`, [req.params.comparisonId]);
    if (!comp[0]) return res.status(404).json({ error: "השוואה לא נמצאה" });
    const { rows: discs } = await pool.query(`SELECT * FROM measurement_discrepancies WHERE comparison_id=$1 ORDER BY severity DESC`, [req.params.comparisonId]);
    const { rows: agentRec } = await pool.query(`SELECT * FROM measurement_records WHERE id=$1`, [comp[0].agent_measurement_id]);
    const { rows: engRec } = await pool.query(`SELECT * FROM measurement_records WHERE id=$1`, [comp[0].engineer_measurement_id]);
    res.json({ comparison: comp[0], discrepancies: discs, agentMeasurement: agentRec[0], engineerMeasurement: engRec[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST approve
router.post("/measurements/comparison/:id/approve", async (req, res) => {
  try {
    await init();
    await pool.query(`UPDATE measurement_comparisons SET status='approved', reviewed_by=$1, review_notes=$2 WHERE id=$3`,
      [req.body.reviewed_by || "מנהל", req.body.notes || "", req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST reject
router.post("/measurements/comparison/:id/reject", async (req, res) => {
  try {
    await init();
    await pool.query(`UPDATE measurement_comparisons SET status='rejected', reviewed_by=$1, review_notes=$2 WHERE id=$3`,
      [req.body.reviewed_by || "מנהל", req.body.notes || "", req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET critical discrepancies
router.get("/measurements/discrepancies", async (req, res) => {
  try {
    await init(); await seedIfEmpty();
    const sev = (req.query.severity as string) || "critical";
    const { rows } = await pool.query(
      `SELECT d.*, c.project_id, c.status as comparison_status
       FROM measurement_discrepancies d JOIN measurement_comparisons c ON d.comparison_id=c.id
       WHERE d.severity=$1 ORDER BY d.difference_pct DESC`, [sev]
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET dashboard
router.get("/measurements/dashboard", async (_req, res) => {
  try {
    await init(); await seedIfEmpty();
    const { rows: stats } = await pool.query(`
      SELECT COUNT(*) as total_comparisons,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='needs_review' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
        AVG(discrepancy_pct) as avg_discrepancy
      FROM measurement_comparisons
    `);
    const { rows: critical } = await pool.query(`SELECT COUNT(*) as cnt FROM measurement_discrepancies WHERE severity='critical'`);
    const { rows: recent } = await pool.query(`SELECT * FROM measurement_comparisons ORDER BY created_at DESC LIMIT 10`);
    res.json({ stats: stats[0], criticalCount: Number(critical[0].cnt), recentComparisons: recent });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
