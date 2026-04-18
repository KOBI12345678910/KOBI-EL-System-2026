import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clm_contracts (
      id SERIAL PRIMARY KEY,
      contract_number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      contract_type TEXT NOT NULL DEFAULT 'ספק',
      stage TEXT NOT NULL DEFAULT 'טיוטה',
      priority TEXT DEFAULT 'רגילה',
      total_value NUMERIC DEFAULT 0,
      currency TEXT DEFAULT 'ILS',
      start_date DATE,
      end_date DATE,
      signed_date DATE,
      auto_renewal BOOLEAN DEFAULT FALSE,
      renewal_period_months INTEGER DEFAULT 12,
      renewal_notice_days INTEGER DEFAULT 30,
      termination_notice_days INTEGER DEFAULT 30,
      payment_terms TEXT,
      payment_frequency TEXT DEFAULT 'חודשי',
      owner_user_id INTEGER,
      owner_name TEXT,
      department TEXT,
      notes TEXT,
      tags TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clm_contract_parties (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES clm_contracts(id) ON DELETE CASCADE,
      party_type TEXT NOT NULL DEFAULT 'צד',
      party_name TEXT NOT NULL,
      contact_person TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      role TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clm_contract_stages (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES clm_contracts(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      changed_by INTEGER,
      changed_by_name TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clm_contract_obligations (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES clm_contracts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      obligation_type TEXT NOT NULL DEFAULT 'כללי',
      responsible_party TEXT,
      due_date DATE,
      amount NUMERIC DEFAULT 0,
      currency TEXT DEFAULT 'ILS',
      status TEXT NOT NULL DEFAULT 'ממתין',
      reminder_days_before INTEGER DEFAULT 7,
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clm_contract_redlines (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES clm_contracts(id) ON DELETE CASCADE,
      clause_ref TEXT,
      original_text TEXT,
      proposed_text TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      proposed_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'ממתין',
      response_text TEXT,
      responded_by TEXT,
      responded_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_clm_contracts_stage ON clm_contracts(stage);
    CREATE INDEX IF NOT EXISTS idx_clm_contracts_type ON clm_contracts(contract_type);
    CREATE INDEX IF NOT EXISTS idx_clm_obligations_contract ON clm_contract_obligations(contract_id);
    CREATE INDEX IF NOT EXISTS idx_clm_obligations_due ON clm_contract_obligations(due_date);
    CREATE INDEX IF NOT EXISTS idx_clm_redlines_contract ON clm_contract_redlines(contract_id);
    CREATE INDEX IF NOT EXISTS idx_clm_stages_contract ON clm_contract_stages(contract_id);
    CREATE INDEX IF NOT EXISTS idx_clm_parties_contract ON clm_contract_parties(contract_id);
  `);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
}

const VALID_STAGES = ["טיוטה", "בדיקה", "משא ומתן", "אישור", "חתימה", "פעיל", "חידוש", "הסתיים", "בוטל"];
const CONTRACT_TYPES = ["ספק", "לקוח", "עובד", "קבלן", "שותפות", "NDA", "SLA", "אחר"];
const OBLIGATION_TYPES = ["תשלום", "אספקה", "ביצוע", "דיווח", "חידוש", "כללי"];

async function generateContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM clm_contracts");
  const num = Number(rows[0].cnt) + 1;
  return `CLM-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/clm/contracts", async (_req, res) => {
  try {
    await init();
    const { rows } = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM clm_contract_obligations WHERE contract_id = c.id) as obligations_count,
        (SELECT COUNT(*) FROM clm_contract_obligations WHERE contract_id = c.id AND status = 'הושלם') as obligations_completed,
        (SELECT COUNT(*) FROM clm_contract_parties WHERE contract_id = c.id) as parties_count,
        (SELECT COUNT(*) FROM clm_contract_redlines WHERE contract_id = c.id AND status = 'ממתין') as pending_redlines
      FROM clm_contracts c ORDER BY c.updated_at DESC
    `);
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/contracts/stats", async (_req, res) => {
  try {
    await init();
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE stage = 'פעיל') as active,
        COUNT(*) FILTER (WHERE stage = 'טיוטה') as draft,
        COUNT(*) FILTER (WHERE stage IN ('בדיקה', 'משא ומתן', 'אישור', 'חתימה')) as in_progress,
        COUNT(*) FILTER (WHERE stage = 'הסתיים' OR stage = 'בוטל') as closed,
        COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date <= CURRENT_DATE + INTERVAL '30 days' AND end_date >= CURRENT_DATE AND stage = 'פעיל') as expiring_soon,
        COALESCE(SUM(total_value) FILTER (WHERE stage = 'פעיל'), 0) as total_active_value,
        COUNT(*) FILTER (WHERE stage = 'חידוש') as in_renewal
      FROM clm_contracts
    `);
    const obligationStats = await pool.query(`
      SELECT
        COUNT(*) as total_obligations,
        COUNT(*) FILTER (WHERE status = 'הושלם') as completed,
        COUNT(*) FILTER (WHERE status = 'ממתין' AND due_date <= CURRENT_DATE + INTERVAL '7 days' AND due_date >= CURRENT_DATE) as due_soon,
        COUNT(*) FILTER (WHERE status = 'ממתין' AND due_date < CURRENT_DATE) as overdue
      FROM clm_contract_obligations
    `);
    res.json({ ...rows[0], ...obligationStats.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/contracts/pipeline", async (_req, res) => {
  try {
    await init();
    const result: Record<string, unknown[]> = {};
    for (const stage of VALID_STAGES) {
      const { rows } = await pool.query(
        `SELECT c.*, (SELECT COUNT(*) FROM clm_contract_parties WHERE contract_id = c.id) as parties_count
         FROM clm_contracts c WHERE c.stage = $1 ORDER BY c.updated_at DESC`,
        [stage]
      );
      result[stage] = rows;
    }
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/contracts/expiring/:days", async (req, res) => {
  try {
    await init();
    const days = parseInt(String(req.params.days)) || 30;
    const { rows } = await pool.query(
      `SELECT * FROM clm_contracts
       WHERE end_date IS NOT NULL
       AND end_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
       AND end_date >= CURRENT_DATE
       AND stage = 'פעיל'
       ORDER BY end_date ASC`,
      [days]
    );
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/contracts/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const { rows } = await pool.query("SELECT * FROM clm_contracts WHERE id = $1", [id]);
    if (rows.length === 0) { res.status(404).json({ message: "חוזה לא נמצא" }); return; }
    const parties = await pool.query("SELECT * FROM clm_contract_parties WHERE contract_id = $1 ORDER BY id", [id]);
    const stages = await pool.query("SELECT * FROM clm_contract_stages WHERE contract_id = $1 ORDER BY created_at", [id]);
    const obligations = await pool.query("SELECT * FROM clm_contract_obligations WHERE contract_id = $1 ORDER BY due_date NULLS LAST", [id]);
    const redlines = await pool.query("SELECT * FROM clm_contract_redlines WHERE contract_id = $1 ORDER BY created_at DESC", [id]);
    res.json({
      ...rows[0],
      parties: parties.rows,
      stages: stages.rows,
      obligations: obligations.rows,
      redlines: redlines.rows,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/contracts", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const contractNumber = b.contract_number || await generateContractNumber();
    const { rows } = await pool.query(
      `INSERT INTO clm_contracts (contract_number, title, description, contract_type, stage, priority,
        total_value, currency, start_date, end_date, auto_renewal, renewal_period_months,
        renewal_notice_days, termination_notice_days, payment_terms, payment_frequency,
        owner_user_id, owner_name, department, notes, tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [contractNumber, b.title, b.description || null, b.contract_type || 'ספק',
       b.stage || 'טיוטה', b.priority || 'רגילה', b.total_value || 0, b.currency || 'ILS',
       b.start_date || null, b.end_date || null, b.auto_renewal || false,
       b.renewal_period_months || 12, b.renewal_notice_days || 30,
       b.termination_notice_days || 30, b.payment_terms || null, b.payment_frequency || 'חודשי',
       b.owner_user_id || null, b.owner_name || null, b.department || null,
       b.notes || null, b.tags || null, b.created_by || null]
    );
    await pool.query(
      `INSERT INTO clm_contract_stages (contract_id, to_stage, changed_by_name, reason)
       VALUES ($1, $2, $3, $4)`,
      [rows[0].id, 'טיוטה', b.owner_name || 'מערכת', 'יצירת חוזה חדש']
    );
    res.status(201).json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.put("/clm/contracts/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE clm_contracts SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        contract_type = COALESCE($3, contract_type),
        priority = COALESCE($4, priority),
        total_value = COALESCE($5, total_value),
        currency = COALESCE($6, currency),
        start_date = COALESCE($7, start_date),
        end_date = COALESCE($8, end_date),
        auto_renewal = COALESCE($9, auto_renewal),
        renewal_period_months = COALESCE($10, renewal_period_months),
        renewal_notice_days = COALESCE($11, renewal_notice_days),
        termination_notice_days = COALESCE($12, termination_notice_days),
        payment_terms = COALESCE($13, payment_terms),
        payment_frequency = COALESCE($14, payment_frequency),
        owner_name = COALESCE($15, owner_name),
        department = COALESCE($16, department),
        notes = COALESCE($17, notes),
        tags = COALESCE($18, tags),
        updated_at = NOW()
       WHERE id = $19 RETURNING *`,
      [b.title, b.description, b.contract_type, b.priority, b.total_value, b.currency,
       b.start_date, b.end_date, b.auto_renewal, b.renewal_period_months,
       b.renewal_notice_days, b.termination_notice_days, b.payment_terms,
       b.payment_frequency, b.owner_name, b.department, b.notes, b.tags, id]
    );
    if (rows.length === 0) { res.status(404).json({ message: "חוזה לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.post("/clm/contracts/:id/advance-stage", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const { to_stage, changed_by_name, reason } = req.body;
    if (!to_stage || !VALID_STAGES.includes(to_stage)) {
      res.status(400).json({ message: "שלב לא תקין" }); return;
    }
    const { rows: current } = await pool.query("SELECT stage FROM clm_contracts WHERE id = $1", [id]);
    if (current.length === 0) { res.status(404).json({ message: "חוזה לא נמצא" }); return; }
    const fromStage = String(current[0].stage);

    const updateFields: string[] = ["stage = $1", "updated_at = NOW()"];
    const params: unknown[] = [to_stage];
    let paramIdx = 2;
    if (to_stage === 'פעיל' && fromStage === 'חתימה') {
      updateFields.push(`signed_date = COALESCE(signed_date, CURRENT_DATE)`);
    }
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE clm_contracts SET ${updateFields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      params
    );
    await pool.query(
      `INSERT INTO clm_contract_stages (contract_id, from_stage, to_stage, changed_by_name, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, fromStage, to_stage, changed_by_name || 'מערכת', reason || null]
    );
    res.json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.delete("/clm/contracts/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const { rowCount } = await pool.query("DELETE FROM clm_contracts WHERE id = $1", [id]);
    if (rowCount === 0) { res.status(404).json({ message: "חוזה לא נמצא" }); return; }
    res.json({ message: "נמחק" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/contracts/:id/obligations", async (req, res) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    const { rows } = await pool.query(
      "SELECT * FROM clm_contract_obligations WHERE contract_id = $1 ORDER BY due_date NULLS LAST", [id]
    );
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/contracts/:id/obligations", async (req, res) => {
  try {
    await init();
    const contractId = parseInt(String(req.params.id));
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clm_contract_obligations (contract_id, title, description, obligation_type,
        responsible_party, due_date, amount, currency, status, reminder_days_before)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [contractId, b.title, b.description || null, b.obligation_type || 'כללי',
       b.responsible_party || null, b.due_date || null, b.amount || 0, b.currency || 'ILS',
       b.status || 'ממתין', b.reminder_days_before || 7]
    );
    res.status(201).json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.put("/clm/obligations/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE clm_contract_obligations SET
        title = COALESCE($1, title), description = COALESCE($2, description),
        obligation_type = COALESCE($3, obligation_type), responsible_party = COALESCE($4, responsible_party),
        due_date = COALESCE($5, due_date), amount = COALESCE($6, amount),
        status = COALESCE($7, status), reminder_days_before = COALESCE($8, reminder_days_before),
        completed_at = CASE WHEN $7 = 'הושלם' THEN NOW() ELSE completed_at END,
        completed_by = CASE WHEN $7 = 'הושלם' THEN COALESCE($9, completed_by) ELSE completed_by END,
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [b.title, b.description, b.obligation_type, b.responsible_party,
       b.due_date, b.amount, b.status, b.reminder_days_before, b.completed_by, id]
    );
    if (rows.length === 0) { res.status(404).json({ message: "התחייבות לא נמצאה" }); return; }
    res.json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.delete("/clm/obligations/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    const { rowCount } = await pool.query("DELETE FROM clm_contract_obligations WHERE id = $1", [id]);
    if (rowCount === 0) { res.status(404).json({ message: "לא נמצא" }); return; }
    res.json({ message: "נמחק" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/obligations/upcoming", async (_req, res) => {
  try {
    await init();
    const { rows } = await pool.query(`
      SELECT o.*, c.title as contract_title, c.contract_number
      FROM clm_contract_obligations o
      JOIN clm_contracts c ON o.contract_id = c.id
      WHERE o.status = 'ממתין' AND o.due_date IS NOT NULL
      AND o.due_date <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY o.due_date ASC
    `);
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/obligations/overdue", async (_req, res) => {
  try {
    await init();
    const { rows } = await pool.query(`
      SELECT o.*, c.title as contract_title, c.contract_number
      FROM clm_contract_obligations o
      JOIN clm_contracts c ON o.contract_id = c.id
      WHERE o.status = 'ממתין' AND o.due_date < CURRENT_DATE
      ORDER BY o.due_date ASC
    `);
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/contracts/:id/parties", async (req, res) => {
  try {
    await init();
    const contractId = parseInt(String(req.params.id));
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clm_contract_parties (contract_id, party_type, party_name, contact_person,
        contact_email, contact_phone, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [contractId, b.party_type || 'צד', b.party_name, b.contact_person || null,
       b.contact_email || null, b.contact_phone || null, b.role || null, b.notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.delete("/clm/parties/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    const { rowCount } = await pool.query("DELETE FROM clm_contract_parties WHERE id = $1", [id]);
    if (rowCount === 0) { res.status(404).json({ message: "לא נמצא" }); return; }
    res.json({ message: "נמחק" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/contracts/:id/redlines", async (req, res) => {
  try {
    await init();
    const contractId = parseInt(String(req.params.id));
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clm_contract_redlines (contract_id, clause_ref, original_text, proposed_text,
        proposed_by, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contractId, b.clause_ref || null, b.original_text || null, b.proposed_text,
       b.proposed_by, b.status || 'ממתין', b.notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.put("/clm/redlines/:id", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE clm_contract_redlines SET
        status = COALESCE($1, status),
        response_text = COALESCE($2, response_text),
        responded_by = COALESCE($3, responded_by),
        responded_at = CASE WHEN $1 IN ('אושר', 'נדחה') THEN NOW() ELSE responded_at END
       WHERE id = $4 RETURNING *`,
      [b.status, b.response_text, b.responded_by, id]
    );
    if (rows.length === 0) { res.status(404).json({ message: "לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.get("/clm/meta", async (_req, res) => {
  try {
    res.json({ stages: VALID_STAGES, contractTypes: CONTRACT_TYPES, obligationTypes: OBLIGATION_TYPES });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.get("/clm/renewals/alerts", async (req, res) => {
  try {
    await init();
    const days = parseInt(String(req.query.days)) || 90;
    const { rows } = await pool.query(`
      SELECT c.*,
        EXTRACT(DAY FROM (c.end_date - CURRENT_DATE)) as days_until_expiry,
        (SELECT COUNT(*) FROM clm_contract_obligations WHERE contract_id = c.id AND status = 'ממתין') as pending_obligations
      FROM clm_contracts c
      WHERE c.end_date IS NOT NULL
        AND c.end_date >= CURRENT_DATE
        AND c.end_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
        AND c.stage = 'פעיל'
      ORDER BY c.end_date ASC
    `, [days]);
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/renewals/process-auto", async (_req, res) => {
  try {
    await init();
    const { rows: autoRenewalContracts } = await pool.query(`
      SELECT * FROM clm_contracts
      WHERE auto_renewal = TRUE
        AND stage = 'פעיל'
        AND end_date IS NOT NULL
        AND end_date <= CURRENT_DATE + (renewal_notice_days || ' days')::INTERVAL
        AND end_date >= CURRENT_DATE
    `);

    const processed: number[] = [];
    for (const contract of autoRenewalContracts) {
      const newEndDate = new Date(contract.end_date);
      newEndDate.setMonth(newEndDate.getMonth() + (contract.renewal_period_months || 12));

      await pool.query(`
        UPDATE clm_contracts
        SET end_date = $1, updated_at = NOW(), notes = COALESCE(notes, '') || $2
        WHERE id = $3
      `, [
        newEndDate.toISOString().split("T")[0],
        `\n[חודש אוטומטית ב-${new Date().toLocaleDateString("he-IL")}]`,
        contract.id,
      ]);

      await pool.query(`
        INSERT INTO clm_contract_stages (contract_id, from_stage, to_stage, changed_by_name, reason)
        VALUES ($1, 'פעיל', 'פעיל', 'מערכת', 'חידוש אוטומטי — תאריך סיום הוארך')
      `, [contract.id]);

      processed.push(contract.id);
    }

    res.json({ processed: processed.length, contractIds: processed });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

router.post("/clm/obligations/:id/complete", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const { completed_by } = req.body;
    const { rows } = await pool.query(`
      UPDATE clm_contract_obligations
      SET status = 'הושלם', completed_at = NOW(), completed_by = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [completed_by || 'מערכת', id]);
    if (rows.length === 0) { res.status(404).json({ message: "לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ message: msg });
  }
});

router.get("/clm/contracts/:id/stage-history", async (req, res): Promise<void> => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ message: "מזהה לא תקין" }); return; }
    const { rows } = await pool.query(
      "SELECT * FROM clm_contract_stages WHERE contract_id = $1 ORDER BY created_at ASC", [id]
    );
    res.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

async function runRenewalCheck() {
  try {
    await init();
    const intervals = [30, 60, 90];
    for (const days of intervals) {
      const { rows } = await pool.query(`
        SELECT id, title, contract_number, end_date, renewal_notice_days, owner_name
        FROM clm_contracts
        WHERE stage = 'פעיל'
          AND end_date IS NOT NULL
          AND end_date = CURRENT_DATE + ($1 || ' days')::INTERVAL::interval
      `, [days]);
      for (const contract of rows) {
        console.info(`[CLM Renewal Alert] Contract ${contract.contract_number} — ${contract.title} expires in ${days} days (${contract.end_date})`);
      }
    }

    const { rows: expiredRows } = await pool.query(`
      SELECT id FROM clm_contracts
      WHERE stage = 'פעיל' AND end_date IS NOT NULL AND end_date < CURRENT_DATE AND auto_renewal = FALSE
    `);
    for (const contract of expiredRows) {
      await pool.query(
        `UPDATE clm_contracts SET stage = 'הסתיים', updated_at = NOW() WHERE id = $1`, [contract.id]
      );
      await pool.query(`
        INSERT INTO clm_contract_stages (contract_id, from_stage, to_stage, changed_by_name, reason)
        VALUES ($1, 'פעיל', 'הסתיים', 'מערכת', 'פג תוקף אוטומטי')
      `, [contract.id]);
    }
  } catch (err) {
    console.error("[CLM] Renewal check error:", err instanceof Error ? err.message : err);
  }
}

const RENEWAL_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
setInterval(runRenewalCheck, RENEWAL_CHECK_INTERVAL);
setTimeout(runRenewalCheck, 30_000);

export default router;
