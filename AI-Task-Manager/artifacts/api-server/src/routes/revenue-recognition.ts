/**
 * Revenue Recognition Module - ASC 606 / IFRS 15 Compliant
 * TechnoKoluzi ERP - Enterprise Revenue Recognition Engine
 *
 * Implements the 5-step model:
 *   Step 1: Identify the contract with a customer
 *   Step 2: Identify performance obligations
 *   Step 3: Determine the transaction price
 *   Step 4: Allocate the transaction price
 *   Step 5: Recognize revenue when/as obligations are satisfied
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const s = (v: any) => (v !== null && v !== undefined && v !== "") ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => (v !== null && v !== undefined && v !== "") ? Number(v) : "NULL";
const safeRows = (r: any) => r?.rows || [];

async function q(query: string, params?: any[]) {
  try {
    const r = params ? await pool.query(query, params) : await pool.query(query);
    return r.rows || [];
  } catch (e: any) {
    console.error("RevRec query error:", e.message, "\nQuery:", query.slice(0, 300));
    throw e;
  }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(
    `SELECT "${col}" FROM ${table} WHERE "${col}" LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`
  );
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
//  Auto-create tables on module load
// ---------------------------------------------------------------------------
(async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rev_rec_contracts (
        id                    SERIAL PRIMARY KEY,
        contract_number       VARCHAR(50) UNIQUE NOT NULL,
        customer_id           VARCHAR(100),
        customer_name         VARCHAR(255),
        contract_name         VARCHAR(500) NOT NULL,
        description           TEXT,
        contract_value        NUMERIC(18,2) NOT NULL DEFAULT 0,
        currency              VARCHAR(10) DEFAULT 'ILS',
        start_date            DATE NOT NULL,
        end_date              DATE,
        signing_date          DATE,
        recognition_method    VARCHAR(50) NOT NULL DEFAULT 'over_time',
        status                VARCHAR(50) NOT NULL DEFAULT 'draft',
        recognized_amount     NUMERIC(18,2) DEFAULT 0,
        deferred_amount       NUMERIC(18,2) DEFAULT 0,
        unbilled_amount       NUMERIC(18,2) DEFAULT 0,
        billed_amount         NUMERIC(18,2) DEFAULT 0,
        standalone_selling_prices JSONB DEFAULT '[]',
        variable_consideration JSONB DEFAULT '{}',
        constraint_applied    BOOLEAN DEFAULT false,
        modification_type     VARCHAR(50),
        modification_date     DATE,
        cost_center           VARCHAR(100),
        project_id            VARCHAR(100),
        department            VARCHAR(100),
        account_manager       VARCHAR(255),
        approval_status       VARCHAR(50) DEFAULT 'pending',
        approved_by           VARCHAR(255),
        approved_date         TIMESTAMP,
        notes                 TEXT,
        tags                  VARCHAR(500),
        created_by            VARCHAR(255),
        created_at            TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rev_rec_obligations (
        id                    SERIAL PRIMARY KEY,
        contract_id           INTEGER REFERENCES rev_rec_contracts(id) ON DELETE CASCADE,
        obligation_number     VARCHAR(50) UNIQUE NOT NULL,
        description           VARCHAR(500) NOT NULL,
        obligation_type       VARCHAR(50) NOT NULL DEFAULT 'performance',
        standalone_price      NUMERIC(18,2) NOT NULL DEFAULT 0,
        allocated_price       NUMERIC(18,2) DEFAULT 0,
        recognized_amount     NUMERIC(18,2) DEFAULT 0,
        recognition_method    VARCHAR(50) NOT NULL DEFAULT 'over_time',
        satisfaction_method   VARCHAR(50) DEFAULT 'output',
        progress_measure      VARCHAR(50) DEFAULT 'time_elapsed',
        progress_pct          NUMERIC(5,2) DEFAULT 0,
        start_date            DATE,
        end_date              DATE,
        completion_date       DATE,
        milestone_name        VARCHAR(255),
        milestone_criteria    TEXT,
        is_distinct           BOOLEAN DEFAULT true,
        is_series             BOOLEAN DEFAULT false,
        status                VARCHAR(50) DEFAULT 'pending',
        cost_to_complete      NUMERIC(18,2) DEFAULT 0,
        cost_incurred         NUMERIC(18,2) DEFAULT 0,
        notes                 TEXT,
        created_at            TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rev_rec_schedules (
        id                    SERIAL PRIMARY KEY,
        contract_id           INTEGER REFERENCES rev_rec_contracts(id) ON DELETE CASCADE,
        obligation_id         INTEGER REFERENCES rev_rec_obligations(id) ON DELETE SET NULL,
        schedule_number       VARCHAR(50),
        period_start          DATE NOT NULL,
        period_end            DATE NOT NULL,
        fiscal_year           INTEGER,
        fiscal_month          INTEGER,
        fiscal_quarter        INTEGER,
        scheduled_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
        recognized_amount     NUMERIC(18,2) DEFAULT 0,
        cumulative_recognized NUMERIC(18,2) DEFAULT 0,
        deferred_amount       NUMERIC(18,2) DEFAULT 0,
        recognition_method    VARCHAR(50),
        recognition_date      DATE,
        status                VARCHAR(50) DEFAULT 'scheduled',
        is_posted             BOOLEAN DEFAULT false,
        posted_date           TIMESTAMP,
        journal_entry_id      INTEGER,
        notes                 TEXT,
        created_at            TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rev_rec_journal_entries (
        id                    SERIAL PRIMARY KEY,
        entry_number          VARCHAR(50) UNIQUE NOT NULL,
        contract_id           INTEGER REFERENCES rev_rec_contracts(id) ON DELETE SET NULL,
        obligation_id         INTEGER REFERENCES rev_rec_obligations(id) ON DELETE SET NULL,
        schedule_id           INTEGER REFERENCES rev_rec_schedules(id) ON DELETE SET NULL,
        entry_date            DATE NOT NULL,
        posting_date          DATE,
        fiscal_year           INTEGER,
        fiscal_month          INTEGER,
        description           VARCHAR(500),
        debit_account         VARCHAR(100) NOT NULL,
        debit_account_name    VARCHAR(255),
        credit_account        VARCHAR(100) NOT NULL,
        credit_account_name   VARCHAR(255),
        amount                NUMERIC(18,2) NOT NULL,
        currency              VARCHAR(10) DEFAULT 'ILS',
        entry_type            VARCHAR(50) DEFAULT 'recognition',
        reversal_of           INTEGER,
        is_reversed           BOOLEAN DEFAULT false,
        status                VARCHAR(50) DEFAULT 'draft',
        approved_by           VARCHAR(255),
        approved_date         TIMESTAMP,
        posted_by             VARCHAR(255),
        posted_date           TIMESTAMP,
        created_by            VARCHAR(255),
        created_at            TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_rrc_status ON rev_rec_contracts(status);
      CREATE INDEX IF NOT EXISTS idx_rrc_customer ON rev_rec_contracts(customer_id);
      CREATE INDEX IF NOT EXISTS idx_rrc_dates ON rev_rec_contracts(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_rro_contract ON rev_rec_obligations(contract_id);
      CREATE INDEX IF NOT EXISTS idx_rrs_contract ON rev_rec_schedules(contract_id);
      CREATE INDEX IF NOT EXISTS idx_rrs_period ON rev_rec_schedules(period_start, period_end);
      CREATE INDEX IF NOT EXISTS idx_rrj_contract ON rev_rec_journal_entries(contract_id);
      CREATE INDEX IF NOT EXISTS idx_rrj_date ON rev_rec_journal_entries(entry_date);
    `);
    console.log("[RevRec] Tables initialized successfully");
  } catch (e: any) {
    console.error("[RevRec] Table init error:", e.message);
  }
})();

// ===================================================================
//  CONTRACTS CRUD
// ===================================================================

// GET all contracts
router.get("/revenue-recognition/contracts", async (_req: Request, res: Response) => {
  try {
    const { status, customer_id, from_date, to_date, search } = _req.query as any;
    let where = "WHERE 1=1";
    if (status && status !== "all") where += ` AND c.status = '${String(status).replace(/'/g, "")}'`;
    if (customer_id) where += ` AND c.customer_id = '${String(customer_id).replace(/'/g, "")}'`;
    if (from_date) where += ` AND c.start_date >= '${String(from_date).replace(/'/g, "")}'`;
    if (to_date) where += ` AND c.end_date <= '${String(to_date).replace(/'/g, "")}'`;
    if (search) {
      const term = String(search).replace(/'/g, "''");
      where += ` AND (c.contract_name ILIKE '%${term}%' OR c.customer_name ILIKE '%${term}%' OR c.contract_number ILIKE '%${term}%')`;
    }

    const rows = await q(`
      SELECT c.*,
        COALESCE(ob.obligation_count, 0) AS obligation_count,
        COALESCE(ob.total_allocated, 0) AS total_allocated,
        COALESCE(ob.total_ob_recognized, 0) AS total_ob_recognized,
        COALESCE(sc.schedule_count, 0) AS schedule_count,
        COALESCE(sc.total_scheduled, 0) AS total_scheduled,
        COALESCE(je.journal_count, 0) AS journal_count
      FROM rev_rec_contracts c
      LEFT JOIN (
        SELECT contract_id,
          COUNT(*) AS obligation_count,
          SUM(allocated_price) AS total_allocated,
          SUM(recognized_amount) AS total_ob_recognized
        FROM rev_rec_obligations
        GROUP BY contract_id
      ) ob ON ob.contract_id = c.id
      LEFT JOIN (
        SELECT contract_id,
          COUNT(*) AS schedule_count,
          SUM(scheduled_amount) AS total_scheduled
        FROM rev_rec_schedules
        GROUP BY contract_id
      ) sc ON sc.contract_id = c.id
      LEFT JOIN (
        SELECT contract_id,
          COUNT(*) AS journal_count
        FROM rev_rec_journal_entries
        GROUP BY contract_id
      ) je ON je.contract_id = c.id
      ${where}
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET single contract with full details
router.get("/revenue-recognition/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contracts = await q(`SELECT * FROM rev_rec_contracts WHERE id = $1`, [id]);
    if (!contracts.length) { res.status(404).json({ error: "חוזה לא נמצא" }); return; }
    const obligations = await q(`SELECT * FROM rev_rec_obligations WHERE contract_id = $1 ORDER BY id`, [id]);
    const schedules = await q(`SELECT * FROM rev_rec_schedules WHERE contract_id = $1 ORDER BY period_start`, [id]);
    const entries = await q(`SELECT * FROM rev_rec_journal_entries WHERE contract_id = $1 ORDER BY entry_date DESC`, [id]);
    res.json({ ...contracts[0], obligations, schedules, journal_entries: entries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST create contract
router.post("/revenue-recognition/contracts", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const contractNum = await nextNum("RRC-", "rev_rec_contracts", "contract_number");
    const user = (req as any).user;

    const deferredAmount = Number(d.contract_value || 0) - Number(d.recognized_amount || 0);

    const result = await q(`
      INSERT INTO rev_rec_contracts (
        contract_number, customer_id, customer_name, contract_name, description,
        contract_value, currency, start_date, end_date, signing_date,
        recognition_method, status,
        recognized_amount, deferred_amount, unbilled_amount, billed_amount,
        variable_consideration, constraint_applied,
        cost_center, project_id, department, account_manager,
        notes, tags, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12,
        $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25
      ) RETURNING *
    `, [
      contractNum,
      d.customer_id || null,
      d.customer_name || null,
      d.contract_name || "חוזה חדש",
      d.description || null,
      d.contract_value || 0,
      d.currency || "ILS",
      d.start_date || new Date().toISOString().slice(0, 10),
      d.end_date || null,
      d.signing_date || null,
      d.recognition_method || "over_time",
      d.status || "draft",
      d.recognized_amount || 0,
      deferredAmount,
      d.unbilled_amount || 0,
      d.billed_amount || 0,
      JSON.stringify(d.variable_consideration || {}),
      d.constraint_applied || false,
      d.cost_center || null,
      d.project_id || null,
      d.department || null,
      d.account_manager || null,
      d.notes || null,
      d.tags || null,
      user?.fullName || user?.username || null,
    ]);
    res.json(result[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update contract
router.put("/revenue-recognition/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const deferredAmount = Number(d.contract_value || 0) - Number(d.recognized_amount || 0);

    const result = await q(`
      UPDATE rev_rec_contracts SET
        customer_id = COALESCE($1, customer_id),
        customer_name = COALESCE($2, customer_name),
        contract_name = COALESCE($3, contract_name),
        description = $4,
        contract_value = COALESCE($5, contract_value),
        currency = COALESCE($6, currency),
        start_date = COALESCE($7, start_date),
        end_date = $8,
        signing_date = $9,
        recognition_method = COALESCE($10, recognition_method),
        status = COALESCE($11, status),
        recognized_amount = COALESCE($12, recognized_amount),
        deferred_amount = $13,
        unbilled_amount = COALESCE($14, unbilled_amount),
        billed_amount = COALESCE($15, billed_amount),
        variable_consideration = $16,
        constraint_applied = $17,
        cost_center = $18,
        project_id = $19,
        department = $20,
        account_manager = $21,
        notes = $22,
        tags = $23,
        updated_at = NOW()
      WHERE id = $24
      RETURNING *
    `, [
      d.customer_id, d.customer_name, d.contract_name, d.description ?? null,
      d.contract_value, d.currency, d.start_date, d.end_date || null,
      d.signing_date || null, d.recognition_method, d.status,
      d.recognized_amount, deferredAmount,
      d.unbilled_amount, d.billed_amount,
      JSON.stringify(d.variable_consideration || {}),
      d.constraint_applied ?? false,
      d.cost_center || null, d.project_id || null,
      d.department || null, d.account_manager || null,
      d.notes || null, d.tags || null,
      id,
    ]);
    if (!result.length) { res.status(404).json({ error: "חוזה לא נמצא" }); return; }
    res.json(result[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE contract
router.delete("/revenue-recognition/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await q(`DELETE FROM rev_rec_contracts WHERE id = $1 RETURNING id`, [id]);
    if (!result.length) { res.status(404).json({ error: "חוזה לא נמצא" }); return; }
    res.json({ success: true, deleted: id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  PERFORMANCE OBLIGATIONS
// ===================================================================

// GET obligations (optionally filtered by contract_id)
router.get("/revenue-recognition/performance-obligations", async (req: Request, res: Response) => {
  try {
    const { contract_id } = req.query;
    let where = "";
    const params: any[] = [];
    if (contract_id) {
      where = "WHERE o.contract_id = $1";
      params.push(contract_id);
    }
    const rows = await q(`
      SELECT o.*, c.contract_number, c.contract_name, c.customer_name
      FROM rev_rec_obligations o
      LEFT JOIN rev_rec_contracts c ON c.id = o.contract_id
      ${where}
      ORDER BY o.contract_id, o.id
    `, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST create obligation
router.post("/revenue-recognition/performance-obligations", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    if (!d.contract_id) { res.status(400).json({ error: "נדרש מזהה חוזה" }); return; }
    const obNum = await nextNum("OBL-", "rev_rec_obligations", "obligation_number");

    const result = await q(`
      INSERT INTO rev_rec_obligations (
        contract_id, obligation_number, description, obligation_type,
        standalone_price, allocated_price, recognized_amount,
        recognition_method, satisfaction_method, progress_measure, progress_pct,
        start_date, end_date, milestone_name, milestone_criteria,
        is_distinct, is_series, status,
        cost_to_complete, cost_incurred, notes
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21
      ) RETURNING *
    `, [
      d.contract_id, obNum, d.description || "", d.obligation_type || "performance",
      d.standalone_price || 0, d.allocated_price || 0, d.recognized_amount || 0,
      d.recognition_method || "over_time", d.satisfaction_method || "output",
      d.progress_measure || "time_elapsed", d.progress_pct || 0,
      d.start_date || null, d.end_date || null,
      d.milestone_name || null, d.milestone_criteria || null,
      d.is_distinct ?? true, d.is_series ?? false, d.status || "pending",
      d.cost_to_complete || 0, d.cost_incurred || 0, d.notes || null,
    ]);

    // Recalculate contract totals after adding obligation
    await recalcContractFromObligations(d.contract_id);

    res.json(result[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update obligation
router.put("/revenue-recognition/performance-obligations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const result = await q(`
      UPDATE rev_rec_obligations SET
        description = COALESCE($1, description),
        obligation_type = COALESCE($2, obligation_type),
        standalone_price = COALESCE($3, standalone_price),
        allocated_price = COALESCE($4, allocated_price),
        recognized_amount = COALESCE($5, recognized_amount),
        recognition_method = COALESCE($6, recognition_method),
        satisfaction_method = COALESCE($7, satisfaction_method),
        progress_measure = COALESCE($8, progress_measure),
        progress_pct = COALESCE($9, progress_pct),
        start_date = $10, end_date = $11,
        completion_date = $12,
        milestone_name = $13, milestone_criteria = $14,
        is_distinct = COALESCE($15, is_distinct),
        is_series = COALESCE($16, is_series),
        status = COALESCE($17, status),
        cost_to_complete = COALESCE($18, cost_to_complete),
        cost_incurred = COALESCE($19, cost_incurred),
        notes = $20,
        updated_at = NOW()
      WHERE id = $21 RETURNING *
    `, [
      d.description, d.obligation_type,
      d.standalone_price, d.allocated_price, d.recognized_amount,
      d.recognition_method, d.satisfaction_method, d.progress_measure, d.progress_pct,
      d.start_date || null, d.end_date || null, d.completion_date || null,
      d.milestone_name || null, d.milestone_criteria || null,
      d.is_distinct, d.is_series, d.status,
      d.cost_to_complete, d.cost_incurred, d.notes || null,
      id,
    ]);
    if (!result.length) { res.status(404).json({ error: "התחייבות ביצוע לא נמצאה" }); return; }

    // Recalculate contract
    if (result[0].contract_id) await recalcContractFromObligations(result[0].contract_id);

    res.json(result[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE obligation
router.delete("/revenue-recognition/performance-obligations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await q(`DELETE FROM rev_rec_obligations WHERE id = $1 RETURNING contract_id`, [id]);
    if (!rows.length) { res.status(404).json({ error: "התחייבות לא נמצאה" }); return; }
    if (rows[0].contract_id) await recalcContractFromObligations(rows[0].contract_id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  REVENUE RECOGNITION CALCULATION ENGINE (ASC 606 Step 5)
// ===================================================================

router.post("/revenue-recognition/calculate", async (req: Request, res: Response) => {
  try {
    const { contract_id, as_of_date } = req.body;
    if (!contract_id) { res.status(400).json({ error: "נדרש מזהה חוזה" }); return; }

    const contracts = await q(`SELECT * FROM rev_rec_contracts WHERE id = $1`, [contract_id]);
    if (!contracts.length) { res.status(404).json({ error: "חוזה לא נמצא" }); return; }
    const contract = contracts[0] as any;

    const obligations = await q(
      `SELECT * FROM rev_rec_obligations WHERE contract_id = $1 ORDER BY id`, [contract_id]
    );

    const asOf = as_of_date ? new Date(as_of_date) : new Date();
    const scheduleEntries: any[] = [];
    const journalEntries: any[] = [];
    let totalRecognized = 0;

    // Step 4: Allocate transaction price (relative standalone selling price method)
    const totalStandalone = obligations.reduce((s: number, o: any) => s + Number(o.standalone_price || 0), 0);

    for (const ob of obligations as any[]) {
      const standaloneRatio = totalStandalone > 0 ? Number(ob.standalone_price || 0) / totalStandalone : (1 / obligations.length);
      const allocatedPrice = Number(contract.contract_value) * standaloneRatio;

      // Update allocated price on obligation
      await q(`UPDATE rev_rec_obligations SET allocated_price = $1 WHERE id = $2`, [allocatedPrice, ob.id]);

      // Step 5: Calculate recognition based on method
      let recognizedAmount = 0;

      if (ob.recognition_method === "point_in_time") {
        // Recognize 100% when obligation is completed
        if (ob.status === "completed" || ob.completion_date) {
          recognizedAmount = allocatedPrice;
        }
      } else if (ob.recognition_method === "milestone") {
        // Recognize based on milestone progress percentage
        recognizedAmount = allocatedPrice * (Number(ob.progress_pct || 0) / 100);
      } else {
        // Over time: straight-line or input/output method
        const obStart = ob.start_date ? new Date(ob.start_date) : new Date(contract.start_date);
        const obEnd = ob.end_date ? new Date(ob.end_date) : (contract.end_date ? new Date(contract.end_date) : asOf);
        const totalDays = Math.max((obEnd.getTime() - obStart.getTime()) / (1000 * 60 * 60 * 24), 1);
        const elapsedDays = Math.max(Math.min((asOf.getTime() - obStart.getTime()) / (1000 * 60 * 60 * 24), totalDays), 0);

        if (ob.progress_measure === "cost_to_cost" && Number(ob.cost_to_complete) > 0) {
          // Input method: cost-to-cost
          const totalCost = Number(ob.cost_incurred || 0) + Number(ob.cost_to_complete || 0);
          const costRatio = totalCost > 0 ? Number(ob.cost_incurred || 0) / totalCost : 0;
          recognizedAmount = allocatedPrice * costRatio;
        } else {
          // Time-elapsed (straight-line)
          recognizedAmount = allocatedPrice * (elapsedDays / totalDays);
        }
      }

      recognizedAmount = Math.round(recognizedAmount * 100) / 100;
      totalRecognized += recognizedAmount;

      // Update obligation recognized amount
      await q(`UPDATE rev_rec_obligations SET recognized_amount = $1, progress_pct = $2, updated_at = NOW() WHERE id = $3`, [
        recognizedAmount,
        allocatedPrice > 0 ? Math.round((recognizedAmount / allocatedPrice) * 10000) / 100 : 0,
        ob.id,
      ]);

      // Generate monthly schedule lines
      const obStart = ob.start_date ? new Date(ob.start_date) : new Date(contract.start_date);
      const obEnd = ob.end_date ? new Date(ob.end_date) : (contract.end_date ? new Date(contract.end_date) : asOf);
      const months = monthsBetween(obStart, obEnd);

      // Delete existing schedule for this obligation, then regenerate
      await q(`DELETE FROM rev_rec_schedules WHERE obligation_id = $1`, [ob.id]);

      let cumulative = 0;
      for (const m of months) {
        let monthAmount = 0;
        if (ob.recognition_method === "point_in_time") {
          if (ob.completion_date && new Date(ob.completion_date).getMonth() === m.month && new Date(ob.completion_date).getFullYear() === m.year) {
            monthAmount = allocatedPrice;
          }
        } else if (ob.recognition_method === "milestone") {
          // Distribute evenly across months up to current progress
          monthAmount = (allocatedPrice * (Number(ob.progress_pct || 0) / 100)) / months.length;
        } else {
          monthAmount = allocatedPrice / months.length;
        }
        monthAmount = Math.round(monthAmount * 100) / 100;
        cumulative += monthAmount;
        const isRecognized = new Date(m.year, m.month + 1, 0) <= asOf;

        const schedNum = `SCH-${contract.contract_number}-${ob.id}-${m.year}${String(m.month + 1).padStart(2, "0")}`;
        const schedResult = await q(`
          INSERT INTO rev_rec_schedules (
            contract_id, obligation_id, schedule_number,
            period_start, period_end, fiscal_year, fiscal_month, fiscal_quarter,
            scheduled_amount, recognized_amount, cumulative_recognized,
            deferred_amount, recognition_method, recognition_date, status, is_posted
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          RETURNING *
        `, [
          contract_id, ob.id, schedNum,
          `${m.year}-${String(m.month + 1).padStart(2, "0")}-01`,
          `${m.year}-${String(m.month + 1).padStart(2, "0")}-${new Date(m.year, m.month + 1, 0).getDate()}`,
          m.year, m.month + 1, Math.ceil((m.month + 1) / 3),
          monthAmount, isRecognized ? monthAmount : 0, isRecognized ? cumulative : cumulative - monthAmount,
          isRecognized ? 0 : monthAmount,
          ob.recognition_method,
          isRecognized ? `${m.year}-${String(m.month + 1).padStart(2, "0")}-${new Date(m.year, m.month + 1, 0).getDate()}` : null,
          isRecognized ? "recognized" : "scheduled",
          false,
        ]);
        scheduleEntries.push(schedResult[0]);

        // Generate journal entry for recognized months
        if (isRecognized && monthAmount > 0) {
          const jeNum = await nextNum("JE-RR-", "rev_rec_journal_entries", "entry_number");
          const jeResult = await q(`
            INSERT INTO rev_rec_journal_entries (
              entry_number, contract_id, obligation_id, schedule_id,
              entry_date, fiscal_year, fiscal_month,
              description,
              debit_account, debit_account_name,
              credit_account, credit_account_name,
              amount, currency, entry_type, status, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING *
          `, [
            jeNum, contract_id, ob.id, schedResult[0]?.id,
            `${m.year}-${String(m.month + 1).padStart(2, "0")}-${new Date(m.year, m.month + 1, 0).getDate()}`,
            m.year, m.month + 1,
            `הכרה בהכנסה - ${contract.contract_name} - ${ob.description}`,
            "1310", "הכנסות נדחות",    // Debit: Deferred Revenue
            "4010", "הכנסות ממכירות",   // Credit: Revenue
            monthAmount, contract.currency || "ILS",
            "recognition", "posted",
            (req as any).user?.fullName || "מערכת",
          ]);
          journalEntries.push(jeResult[0]);

          // Link journal entry to schedule
          await q(`UPDATE rev_rec_schedules SET journal_entry_id = $1, is_posted = true, posted_date = NOW() WHERE id = $2`,
            [jeResult[0]?.id, schedResult[0]?.id]);
        }
      }
    }

    // Update contract totals
    totalRecognized = Math.round(totalRecognized * 100) / 100;
    const contractValue = Number(contract.contract_value);
    await q(`
      UPDATE rev_rec_contracts SET
        recognized_amount = $1,
        deferred_amount = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [totalRecognized, contractValue - totalRecognized, contract_id]);

    res.json({
      success: true,
      contract_id,
      contract_value: contractValue,
      total_recognized: totalRecognized,
      total_deferred: contractValue - totalRecognized,
      obligations_processed: obligations.length,
      schedule_lines_created: scheduleEntries.length,
      journal_entries_created: journalEntries.length,
      schedules: scheduleEntries,
      journal_entries: journalEntries,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  RECOGNITION SCHEDULES
// ===================================================================

router.get("/revenue-recognition/schedules", async (req: Request, res: Response) => {
  try {
    const { contract_id, fiscal_year, fiscal_quarter, status } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let pIdx = 1;
    if (contract_id) { where += ` AND s.contract_id = $${pIdx++}`; params.push(contract_id); }
    if (fiscal_year) { where += ` AND s.fiscal_year = $${pIdx++}`; params.push(fiscal_year); }
    if (fiscal_quarter) { where += ` AND s.fiscal_quarter = $${pIdx++}`; params.push(fiscal_quarter); }
    if (status && status !== "all") { where += ` AND s.status = $${pIdx++}`; params.push(status); }

    const rows = await q(`
      SELECT s.*, c.contract_number, c.contract_name, c.customer_name,
             o.description as obligation_description
      FROM rev_rec_schedules s
      LEFT JOIN rev_rec_contracts c ON c.id = s.contract_id
      LEFT JOIN rev_rec_obligations o ON o.id = s.obligation_id
      ${where}
      ORDER BY s.period_start, s.contract_id
    `, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  JOURNAL ENTRIES
// ===================================================================

router.get("/revenue-recognition/journal-entries", async (req: Request, res: Response) => {
  try {
    const { contract_id, fiscal_year, fiscal_month, entry_type, status } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let pIdx = 1;
    if (contract_id) { where += ` AND j.contract_id = $${pIdx++}`; params.push(contract_id); }
    if (fiscal_year) { where += ` AND j.fiscal_year = $${pIdx++}`; params.push(fiscal_year); }
    if (fiscal_month) { where += ` AND j.fiscal_month = $${pIdx++}`; params.push(fiscal_month); }
    if (entry_type) { where += ` AND j.entry_type = $${pIdx++}`; params.push(entry_type); }
    if (status && status !== "all") { where += ` AND j.status = $${pIdx++}`; params.push(status); }

    const rows = await q(`
      SELECT j.*, c.contract_number, c.contract_name, c.customer_name
      FROM rev_rec_journal_entries j
      LEFT JOIN rev_rec_contracts c ON c.id = j.contract_id
      ${where}
      ORDER BY j.entry_date DESC, j.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  DASHBOARD / ANALYTICS
// ===================================================================

router.get("/revenue-recognition/dashboard", async (_req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // KPI summary
    const summaryRows = await q(`
      SELECT
        COUNT(*) as total_contracts,
        COUNT(*) FILTER (WHERE status = 'active') as active_contracts,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_contracts,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_contracts,
        COALESCE(SUM(contract_value), 0) as total_contract_value,
        COALESCE(SUM(recognized_amount), 0) as total_recognized,
        COALESCE(SUM(deferred_amount), 0) as total_deferred,
        COALESCE(SUM(billed_amount), 0) as total_billed,
        COALESCE(SUM(unbilled_amount), 0) as total_unbilled,
        COALESCE(AVG(CASE WHEN contract_value > 0
          THEN (recognized_amount / contract_value) * 100 ELSE 0 END), 0) as avg_recognition_pct
      FROM rev_rec_contracts
    `);

    // Monthly recognized trend (current year)
    const monthlyTrend = await q(`
      SELECT
        fiscal_month,
        SUM(recognized_amount) as recognized,
        SUM(scheduled_amount) as scheduled,
        SUM(deferred_amount) as deferred
      FROM rev_rec_schedules
      WHERE fiscal_year = $1
      GROUP BY fiscal_month
      ORDER BY fiscal_month
    `, [currentYear]);

    // Quarterly summary
    const quarterlySummary = await q(`
      SELECT
        fiscal_quarter,
        SUM(recognized_amount) as recognized,
        SUM(scheduled_amount) as scheduled,
        COUNT(DISTINCT contract_id) as contracts
      FROM rev_rec_schedules
      WHERE fiscal_year = $1
      GROUP BY fiscal_quarter
      ORDER BY fiscal_quarter
    `, [currentYear]);

    // By recognition method
    const byMethod = await q(`
      SELECT
        recognition_method,
        COUNT(*) as count,
        SUM(contract_value) as total_value,
        SUM(recognized_amount) as recognized,
        SUM(deferred_amount) as deferred
      FROM rev_rec_contracts
      GROUP BY recognition_method
    `);

    // Top customers
    const topCustomers = await q(`
      SELECT
        customer_name,
        COUNT(*) as contracts,
        SUM(contract_value) as total_value,
        SUM(recognized_amount) as recognized,
        SUM(deferred_amount) as deferred
      FROM rev_rec_contracts
      WHERE customer_name IS NOT NULL
      GROUP BY customer_name
      ORDER BY SUM(contract_value) DESC
      LIMIT 10
    `);

    // Upcoming recognitions (next 3 months)
    const upcoming = await q(`
      SELECT s.*, c.contract_number, c.contract_name, c.customer_name
      FROM rev_rec_schedules s
      LEFT JOIN rev_rec_contracts c ON c.id = s.contract_id
      WHERE s.status = 'scheduled'
        AND s.period_start >= CURRENT_DATE
        AND s.period_start < CURRENT_DATE + INTERVAL '90 days'
      ORDER BY s.period_start
      LIMIT 20
    `);

    // Recent journal entries
    const recentEntries = await q(`
      SELECT j.*, c.contract_number, c.customer_name
      FROM rev_rec_journal_entries j
      LEFT JOIN rev_rec_contracts c ON c.id = j.contract_id
      ORDER BY j.created_at DESC
      LIMIT 10
    `);

    // Contracts expiring soon
    const expiringSoon = await q(`
      SELECT *
      FROM rev_rec_contracts
      WHERE status = 'active'
        AND end_date IS NOT NULL
        AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
      ORDER BY end_date
    `);

    res.json({
      summary: summaryRows[0] || {},
      monthly_trend: monthlyTrend,
      quarterly_summary: quarterlySummary,
      by_method: byMethod,
      top_customers: topCustomers,
      upcoming_recognitions: upcoming,
      recent_journal_entries: recentEntries,
      expiring_contracts: expiringSoon,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
//  HELPERS
// ===================================================================

async function recalcContractFromObligations(contractId: number) {
  const rows = await q(`
    SELECT
      COALESCE(SUM(allocated_price), 0) as total_allocated,
      COALESCE(SUM(recognized_amount), 0) as total_recognized
    FROM rev_rec_obligations WHERE contract_id = $1
  `, [contractId]);
  const totals = rows[0] as any;
  const contract = (await q(`SELECT contract_value FROM rev_rec_contracts WHERE id = $1`, [contractId]))[0] as any;
  const contractValue = Number(contract?.contract_value || 0);
  const recognized = Number(totals?.total_recognized || 0);
  await q(`
    UPDATE rev_rec_contracts SET
      recognized_amount = $1,
      deferred_amount = $2,
      updated_at = NOW()
    WHERE id = $3
  `, [recognized, contractValue - recognized, contractId]);
}

function monthsBetween(start: Date, end: Date): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endDate = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= endDate) {
    result.push({ year: current.getFullYear(), month: current.getMonth() });
    current.setMonth(current.getMonth() + 1);
  }
  if (result.length === 0) {
    result.push({ year: start.getFullYear(), month: start.getMonth() });
  }
  return result;
}

export default router;
