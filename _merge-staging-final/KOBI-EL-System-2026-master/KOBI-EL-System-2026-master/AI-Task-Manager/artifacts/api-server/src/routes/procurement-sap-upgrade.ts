import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const q = async (query: any) => { try { const r = await db.execute(query); return r.rows; } catch(e) { console.error("[Procurement-SAP]", e); return []; } };

function clean(d: any) {
  const o = { ...d };
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  delete o.id; delete o.created_at; delete o.updated_at;
  return o;
}

// ======================== TABLE INIT ========================

async function ensureProcurementSapTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_evaluation (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER,
      vendor_name VARCHAR(255),
      evaluation_period VARCHAR(100),
      overall_score NUMERIC(5,2),
      quality_score NUMERIC(5,2),
      delivery_score NUMERIC(5,2),
      price_score NUMERIC(5,2),
      service_score NUMERIC(5,2),
      compliance_score NUMERIC(5,2),
      evaluator VARCHAR(255),
      evaluation_date DATE,
      strengths TEXT,
      weaknesses TEXT,
      action_items TEXT,
      recommendation VARCHAR(30) DEFAULT 'approved' CHECK (recommendation IN ('preferred','approved','conditional','blacklisted')),
      status VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_requisitions (
      id SERIAL PRIMARY KEY,
      req_number VARCHAR(50),
      requested_by VARCHAR(255),
      department VARCHAR(255),
      urgency VARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
      material_id INTEGER,
      material_name VARCHAR(255),
      quantity NUMERIC(15,3),
      unit VARCHAR(30),
      estimated_cost NUMERIC(15,2),
      currency VARCHAR(10) DEFAULT 'ILS',
      required_date DATE,
      purpose TEXT,
      budget_code VARCHAR(100),
      cost_center VARCHAR(100),
      approval_status VARCHAR(30) DEFAULT 'draft' CHECK (approval_status IN ('draft','pending','approved','rejected','cancelled')),
      approved_by VARCHAR(255),
      approved_at TIMESTAMPTZ,
      converted_to_po INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rfq_management (
      id SERIAL PRIMARY KEY,
      rfq_number VARCHAR(50),
      title VARCHAR(500),
      description TEXT,
      category VARCHAR(255),
      items JSONB DEFAULT '[]',
      invited_vendors JSONB DEFAULT '[]',
      submission_deadline DATE,
      evaluation_criteria JSONB,
      budget_estimate NUMERIC(15,2),
      currency VARCHAR(10) DEFAULT 'ILS',
      responses_count INTEGER DEFAULT 0,
      awarded_vendor_id INTEGER,
      awarded_vendor_name VARCHAR(255),
      award_amount NUMERIC(15,2),
      status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','published','closed','evaluated','awarded','cancelled')),
      created_by VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS goods_receipt_inspections (
      id SERIAL PRIMARY KEY,
      inspection_number VARCHAR(50),
      goods_receipt_id INTEGER,
      po_number VARCHAR(50),
      vendor_name VARCHAR(255),
      inspection_date DATE,
      inspector VARCHAR(255),
      material_name VARCHAR(255),
      quantity_received NUMERIC(15,3),
      quantity_accepted NUMERIC(15,3),
      quantity_rejected NUMERIC(15,3),
      rejection_reason TEXT,
      quality_score INTEGER,
      meets_specs BOOLEAN DEFAULT true,
      certificate_received BOOLEAN DEFAULT false,
      certificate_number VARCHAR(100),
      photos JSONB DEFAULT '[]',
      corrective_action TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','partial')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS procurement_contracts (
      id SERIAL PRIMARY KEY,
      contract_number VARCHAR(50),
      vendor_id INTEGER,
      vendor_name VARCHAR(255),
      contract_type VARCHAR(30) DEFAULT 'framework' CHECK (contract_type IN ('framework','blanket','spot','annual')),
      category VARCHAR(255),
      start_date DATE,
      end_date DATE,
      total_value NUMERIC(15,2),
      consumed_value NUMERIC(15,2) DEFAULT 0,
      remaining_value NUMERIC(15,2),
      currency VARCHAR(10) DEFAULT 'ILS',
      payment_terms VARCHAR(255),
      delivery_terms VARCHAR(255),
      penalty_terms TEXT,
      auto_renew BOOLEAN DEFAULT false,
      notice_days INTEGER DEFAULT 30,
      status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','active','expired','terminated')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_price_lists (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER,
      vendor_name VARCHAR(255),
      material_id INTEGER,
      material_name VARCHAR(255),
      unit_price NUMERIC(15,4),
      currency VARCHAR(10) DEFAULT 'ILS',
      min_quantity NUMERIC(15,3) DEFAULT 1,
      lead_time_days INTEGER,
      effective_from DATE,
      effective_to DATE,
      discount_percent NUMERIC(5,2) DEFAULT 0,
      notes VARCHAR(500),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("[Procurement-SAP] All 6 tables ensured.");
}

// ======================== POST /init ========================

router.post("/procurement-sap/init", async (_req: Request, res: Response) => {
  try {
    await ensureProcurementSapTables();
    res.json({ success: true, message: "All procurement SAP tables created/verified." });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== GENERIC CRUD ========================

const tables = [
  { route: "vendor-evaluation", table: "vendor_evaluation", label: "VendorEvaluation" },
  { route: "purchase-requisitions", table: "purchase_requisitions", label: "PurchaseRequisition" },
  { route: "rfq-management", table: "rfq_management", label: "RFQ" },
  { route: "goods-receipt-inspections", table: "goods_receipt_inspections", label: "GoodsReceiptInspection" },
  { route: "procurement-contracts", table: "procurement_contracts", label: "ProcurementContract" },
  { route: "vendor-price-lists", table: "vendor_price_lists", label: "VendorPriceList" },
];

for (const t of tables) {
  // GET all
  router.get(`/procurement-sap/${t.route}`, async (_req: Request, res: Response) => {
    const rows = await q(sql.raw(`SELECT * FROM ${t.table} ORDER BY created_at DESC`));
    res.json(rows);
  });

  // GET by id
  router.get(`/procurement-sap/${t.route}/:id`, async (req: Request, res: Response) => {
    const rows = await q(sql.raw(`SELECT * FROM ${t.table} WHERE id = ${Number(req.params.id)}`));
    res.json(rows[0] || null);
  });

  // POST create
  router.post(`/procurement-sap/${t.route}`, async (req: Request, res: Response) => {
    try {
      const d = clean(req.body);
      const keys = Object.keys(d);
      if (keys.length === 0) return res.status(400).json({ error: "No data provided" });
      const cols = keys.join(", ");
      const placeholders = keys.map((_k, i) => `$${i + 1}`).join(", ");
      const vals = keys.map(k => {
        const v = d[k];
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return v;
      });
      const result = await db.execute(sql.raw(
        `INSERT INTO ${t.table} (${cols}) VALUES (${placeholders}) RETURNING *`,
        vals
      ));
      res.json({ success: true, record: (result.rows as any[])[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT update
  router.put(`/procurement-sap/${t.route}/:id`, async (req: Request, res: Response) => {
    try {
      const d = clean(req.body);
      const id = Number(req.params.id);
      const keys = Object.keys(d);
      if (keys.length === 0) return res.status(400).json({ error: "No data provided" });
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const vals = keys.map(k => {
        const v = d[k];
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return v;
      });
      vals.push(id as any);
      await db.execute(sql.raw(
        `UPDATE ${t.table} SET ${setClauses}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
        vals
      ));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE
  router.delete(`/procurement-sap/${t.route}/:id`, async (req: Request, res: Response) => {
    try {
      await db.execute(sql.raw(`DELETE FROM ${t.table} WHERE id = ${Number(req.params.id)}`));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}

// ======================== SPECIAL: VENDOR SCORECARD ========================

router.get("/procurement-sap/vendor-scorecard", async (_req: Request, res: Response) => {
  try {
    const scorecard = await q(sql`
      SELECT
        vendor_id,
        vendor_name,
        COUNT(*) as evaluations_count,
        ROUND(AVG(overall_score)::numeric, 2) as avg_overall,
        ROUND(AVG(quality_score)::numeric, 2) as avg_quality,
        ROUND(AVG(delivery_score)::numeric, 2) as avg_delivery,
        ROUND(AVG(price_score)::numeric, 2) as avg_price,
        ROUND(AVG(service_score)::numeric, 2) as avg_service,
        ROUND(AVG(compliance_score)::numeric, 2) as avg_compliance,
        MAX(evaluation_date) as last_evaluation,
        MODE() WITHIN GROUP (ORDER BY recommendation) as most_common_recommendation
      FROM vendor_evaluation
      WHERE vendor_id IS NOT NULL
      GROUP BY vendor_id, vendor_name
      ORDER BY avg_overall DESC
    `);

    const contractStats = await q(sql`
      SELECT
        vendor_id,
        COUNT(*) as active_contracts,
        COALESCE(SUM(total_value), 0) as total_contract_value,
        COALESCE(SUM(consumed_value), 0) as total_consumed
      FROM procurement_contracts
      WHERE status = 'active'
      GROUP BY vendor_id
    `);

    const inspectionStats = await q(sql`
      SELECT
        vendor_name,
        COUNT(*) as total_inspections,
        COUNT(*) FILTER (WHERE status = 'passed') as passed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        ROUND(AVG(quality_score)::numeric, 1) as avg_inspection_score,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'passed')::numeric / COUNT(*) * 100, 1)
          ELSE 0 END as pass_rate
      FROM goods_receipt_inspections
      GROUP BY vendor_name
    `);

    const contractMap: Record<number, any> = {};
    for (const c of contractStats as any[]) contractMap[c.vendor_id] = c;

    const inspMap: Record<string, any> = {};
    for (const i of inspectionStats as any[]) inspMap[i.vendor_name] = i;

    const result = (scorecard as any[]).map(v => ({
      ...v,
      contracts: contractMap[v.vendor_id] || { active_contracts: 0, total_contract_value: 0, total_consumed: 0 },
      inspections: inspMap[v.vendor_name] || { total_inspections: 0, passed: 0, failed: 0, pass_rate: 0 },
    }));

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SPECIAL: SPEND ANALYSIS ========================

router.get("/procurement-sap/spend-analysis", async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "12m";
    let interval = "12 months";
    if (period === "3m") interval = "3 months";
    else if (period === "6m") interval = "6 months";
    else if (period === "1y") interval = "12 months";
    else if (period === "2y") interval = "24 months";

    const byVendor = await q(sql.raw(`
      SELECT
        vendor_name,
        COUNT(*) as contract_count,
        COALESCE(SUM(total_value), 0) as total_spend,
        COALESCE(SUM(consumed_value), 0) as consumed_spend,
        ROUND(AVG(total_value)::numeric, 2) as avg_contract_value
      FROM procurement_contracts
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY vendor_name
      ORDER BY total_spend DESC
    `));

    const byCategory = await q(sql.raw(`
      SELECT
        category,
        COUNT(*) as contract_count,
        COALESCE(SUM(total_value), 0) as total_spend,
        COALESCE(SUM(consumed_value), 0) as consumed_spend
      FROM procurement_contracts
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY category
      ORDER BY total_spend DESC
    `));

    const byMonth = await q(sql.raw(`
      SELECT
        TO_CHAR(start_date, 'YYYY-MM') as month,
        COUNT(*) as contracts,
        COALESCE(SUM(total_value), 0) as total_value
      FROM procurement_contracts
      WHERE start_date >= NOW() - INTERVAL '${interval}'
      GROUP BY month
      ORDER BY month
    `));

    const reqByDept = await q(sql.raw(`
      SELECT
        department,
        COUNT(*) as requisitions,
        COALESCE(SUM(estimated_cost), 0) as total_estimated_cost,
        COUNT(*) FILTER (WHERE approval_status = 'approved') as approved,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE approval_status = 'pending') as pending
      FROM purchase_requisitions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY department
      ORDER BY total_estimated_cost DESC
    `));

    const summary = await q(sql.raw(`
      SELECT
        COALESCE(SUM(total_value), 0) as total_spend,
        COALESCE(SUM(consumed_value), 0) as consumed,
        COUNT(*) as total_contracts,
        COUNT(DISTINCT vendor_name) as unique_vendors,
        COUNT(DISTINCT category) as unique_categories
      FROM procurement_contracts
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `));

    res.json({
      period,
      summary: (summary as any[])[0] || {},
      by_vendor: byVendor,
      by_category: byCategory,
      by_month: byMonth,
      requisitions_by_department: reqByDept,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SPECIAL: RFQ EVALUATE ========================

router.post("/procurement-sap/rfq-evaluate", async (req: Request, res: Response) => {
  try {
    const { rfq_id, responses } = req.body;
    if (!rfq_id || !responses || !Array.isArray(responses)) {
      return res.status(400).json({ error: "rfq_id and responses[] required" });
    }

    const rfqRows = await q(sql`SELECT * FROM rfq_management WHERE id = ${Number(rfq_id)}`);
    const rfq = (rfqRows as any[])[0];
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });

    const criteria = rfq.evaluation_criteria || {};
    const weights: Record<string, number> = {
      price: criteria.price_weight || 40,
      quality: criteria.quality_weight || 30,
      delivery: criteria.delivery_weight || 20,
      service: criteria.service_weight || 10,
    };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    const evaluated = responses.map((r: any) => {
      const priceScore = r.price_score || 0;
      const qualityScore = r.quality_score || 0;
      const deliveryScore = r.delivery_score || 0;
      const serviceScore = r.service_score || 0;

      const weightedScore = (
        (priceScore * weights.price) +
        (qualityScore * weights.quality) +
        (deliveryScore * weights.delivery) +
        (serviceScore * weights.service)
      ) / totalWeight;

      return {
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        quoted_amount: r.quoted_amount || 0,
        price_score: priceScore,
        quality_score: qualityScore,
        delivery_score: deliveryScore,
        service_score: serviceScore,
        weighted_score: Math.round(weightedScore * 100) / 100,
        notes: r.notes || null,
      };
    });

    evaluated.sort((a: any, b: any) => b.weighted_score - a.weighted_score);

    const winner = evaluated[0];

    await db.execute(sql`
      UPDATE rfq_management
      SET status = 'evaluated',
          responses_count = ${responses.length},
          awarded_vendor_id = ${winner.vendor_id},
          awarded_vendor_name = ${winner.vendor_name},
          award_amount = ${winner.quoted_amount},
          updated_at = NOW()
      WHERE id = ${Number(rfq_id)}
    `);

    res.json({
      success: true,
      rfq_id,
      evaluation_weights: weights,
      ranked_responses: evaluated,
      recommended_vendor: winner,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SPECIAL: CONTRACT ALERTS ========================

router.get("/procurement-sap/contract-alerts", async (_req: Request, res: Response) => {
  try {
    const expiringSoon = await q(sql`
      SELECT *,
        (end_date - CURRENT_DATE) as days_until_expiry
      FROM procurement_contracts
      WHERE status = 'active'
        AND end_date IS NOT NULL
        AND end_date <= CURRENT_DATE + INTERVAL '60 days'
      ORDER BY end_date ASC
    `);

    const overConsumed = await q(sql`
      SELECT *,
        CASE WHEN total_value > 0 THEN ROUND((consumed_value / total_value * 100)::numeric, 1) ELSE 0 END as consumption_pct
      FROM procurement_contracts
      WHERE status = 'active'
        AND consumed_value > total_value * 0.8
      ORDER BY consumed_value DESC
    `);

    const expired = await q(sql`
      SELECT *
      FROM procurement_contracts
      WHERE status = 'active'
        AND end_date < CURRENT_DATE
      ORDER BY end_date ASC
    `);

    const autoRenew = await q(sql`
      SELECT *,
        (end_date - CURRENT_DATE) as days_until_expiry
      FROM procurement_contracts
      WHERE status = 'active'
        AND auto_renew = true
        AND end_date IS NOT NULL
        AND end_date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY end_date ASC
    `);

    const pendingReqs = await q(sql`
      SELECT *,
        (required_date - CURRENT_DATE) as days_until_needed
      FROM purchase_requisitions
      WHERE approval_status = 'pending'
        AND required_date IS NOT NULL
        AND required_date <= CURRENT_DATE + INTERVAL '14 days'
      ORDER BY required_date ASC
    `);

    const openRfqs = await q(sql`
      SELECT *,
        (submission_deadline - CURRENT_DATE) as days_until_deadline
      FROM rfq_management
      WHERE status = 'published'
        AND submission_deadline IS NOT NULL
        AND submission_deadline <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY submission_deadline ASC
    `);

    res.json({
      expiring_soon: expiringSoon,
      over_consumed: overConsumed,
      already_expired: expired,
      auto_renew_pending: autoRenew,
      urgent_requisitions: pendingReqs,
      rfq_deadlines: openRfqs,
      summary: {
        expiring_soon_count: (expiringSoon as any[]).length,
        over_consumed_count: (overConsumed as any[]).length,
        expired_count: (expired as any[]).length,
        auto_renew_count: (autoRenew as any[]).length,
        urgent_reqs_count: (pendingReqs as any[]).length,
        rfq_deadline_count: (openRfqs as any[]).length,
        total_alerts: (expiringSoon as any[]).length + (overConsumed as any[]).length +
          (expired as any[]).length + (autoRenew as any[]).length +
          (pendingReqs as any[]).length + (openRfqs as any[]).length,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SPECIAL: PRICE COMPARISON ========================

router.get("/procurement-sap/price-comparison", async (req: Request, res: Response) => {
  try {
    const materialId = req.query.material_id ? Number(req.query.material_id) : null;
    const materialName = (req.query.material_name as string) || null;

    if (!materialId && !materialName) {
      return res.status(400).json({ error: "material_id or material_name required" });
    }

    let condition = "";
    if (materialId) condition = `material_id = ${materialId}`;
    else if (materialName) condition = `LOWER(material_name) LIKE LOWER('%${materialName!.replace(/'/g, "''")}%')`;

    const prices = await q(sql.raw(`
      SELECT *
      FROM vendor_price_lists
      WHERE ${condition}
        AND status = 'active'
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY unit_price ASC
    `));

    const vendorScores: Record<number, any> = {};
    const vendorIds = [...new Set((prices as any[]).map(p => p.vendor_id).filter(Boolean))];
    if (vendorIds.length > 0) {
      const evalRows = await q(sql.raw(`
        SELECT vendor_id, ROUND(AVG(overall_score)::numeric, 2) as avg_score,
          ROUND(AVG(quality_score)::numeric, 2) as avg_quality,
          ROUND(AVG(delivery_score)::numeric, 2) as avg_delivery
        FROM vendor_evaluation
        WHERE vendor_id IN (${vendorIds.join(",")})
        GROUP BY vendor_id
      `));
      for (const ev of evalRows as any[]) vendorScores[ev.vendor_id] = ev;
    }

    const compared = (prices as any[]).map((p: any, idx: number) => {
      const bestPrice = (prices as any[])[0]?.unit_price || p.unit_price;
      const priceDiffPct = bestPrice > 0
        ? Math.round(((p.unit_price - bestPrice) / bestPrice) * 10000) / 100
        : 0;

      return {
        rank: idx + 1,
        ...p,
        price_diff_from_best_pct: priceDiffPct,
        effective_price: Math.round(p.unit_price * (1 - (p.discount_percent || 0) / 100) * 100) / 100,
        vendor_scores: vendorScores[p.vendor_id] || null,
      };
    });

    const summary = {
      material_id: materialId,
      material_name: materialName || (compared[0]?.material_name ?? null),
      vendors_count: compared.length,
      lowest_price: compared[0]?.unit_price || 0,
      highest_price: compared[compared.length - 1]?.unit_price || 0,
      avg_price: compared.length > 0
        ? Math.round(compared.reduce((s: number, c: any) => s + Number(c.unit_price), 0) / compared.length * 100) / 100
        : 0,
      best_value_vendor: compared[0]?.vendor_name || null,
    };

    res.json({ summary, prices: compared });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
