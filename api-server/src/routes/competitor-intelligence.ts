import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competitors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      website VARCHAR(500),
      location VARCHAR(300),
      specialties JSONB DEFAULT '[]',
      market_share_pct REAL DEFAULT 0,
      pricing_level VARCHAR(20) CHECK (pricing_level IN ('budget','mid','premium')) DEFAULT 'mid',
      quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5) DEFAULT 3,
      delivery_speed_rating INTEGER CHECK (delivery_speed_rating BETWEEN 1 AND 5) DEFAULT 3,
      strengths TEXT,
      weaknesses TEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competitor_prices (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER REFERENCES competitors(id) ON DELETE CASCADE,
      product_type VARCHAR(200) NOT NULL,
      price_per_meter NUMERIC(12,2) DEFAULT 0,
      price_date DATE DEFAULT CURRENT_DATE,
      source VARCHAR(300),
      verified BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competitor_deals (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER REFERENCES competitors(id) ON DELETE CASCADE,
      customer_name VARCHAR(300),
      deal_type VARCHAR(100),
      estimated_value NUMERIC(15,2) DEFAULT 0,
      our_quote_value NUMERIC(15,2) DEFAULT 0,
      outcome VARCHAR(30) CHECK (outcome IN ('won_by_us','lost_to_them','unknown')) DEFAULT 'unknown',
      loss_reason TEXT,
      deal_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS market_trends (
      id SERIAL PRIMARY KEY,
      metric_name VARCHAR(300) NOT NULL,
      value NUMERIC(15,2) DEFAULT 0,
      period DATE DEFAULT CURRENT_DATE,
      source VARCHAR(300),
      category VARCHAR(30) CHECK (category IN ('pricing','demand','supply','regulation')) DEFAULT 'pricing',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables().catch(e => console.error("competitor-intelligence tables:", e.message));

/* ───── COMPETITORS CRUD ───── */
router.get("/api/competitors", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitors ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/competitors/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitors WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/competitors", async (req: Request, res: Response) => {
  try {
    const { name, website, location, specialties, market_share_pct, pricing_level, quality_rating, delivery_speed_rating, strengths, weaknesses, notes, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO competitors (name, website, location, specialties, market_share_pct, pricing_level, quality_rating, delivery_speed_rating, strengths, weaknesses, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, website, location, JSON.stringify(specialties || []), market_share_pct || 0, pricing_level || 'mid', quality_rating || 3, delivery_speed_rating || 3, strengths, weaknesses, notes, status || 'active']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/competitors/:id", async (req: Request, res: Response) => {
  try {
    const { name, website, location, specialties, market_share_pct, pricing_level, quality_rating, delivery_speed_rating, strengths, weaknesses, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE competitors SET name=$1, website=$2, location=$3, specialties=$4, market_share_pct=$5, pricing_level=$6, quality_rating=$7, delivery_speed_rating=$8, strengths=$9, weaknesses=$10, notes=$11, status=$12 WHERE id=$13 RETURNING *`,
      [name, website, location, JSON.stringify(specialties || []), market_share_pct, pricing_level, quality_rating, delivery_speed_rating, strengths, weaknesses, notes, status, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/competitors/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM competitors WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── COMPETITOR PRICES CRUD ───── */
router.get("/api/competitor-prices", async (req: Request, res: Response) => {
  try {
    const cid = req.query.competitor_id;
    const where = cid ? `WHERE cp.competitor_id = ${Number(cid)}` : "";
    const { rows } = await pool.query(`SELECT cp.*, c.name as competitor_name FROM competitor_prices cp LEFT JOIN competitors c ON c.id = cp.competitor_id ${where} ORDER BY cp.price_date DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/competitor-prices", async (req: Request, res: Response) => {
  try {
    const { competitor_id, product_type, price_per_meter, price_date, source, verified, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO competitor_prices (competitor_id, product_type, price_per_meter, price_date, source, verified, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [competitor_id, product_type, price_per_meter, price_date || new Date(), source, verified || false, notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/competitor-prices/:id", async (req: Request, res: Response) => {
  try {
    const { competitor_id, product_type, price_per_meter, price_date, source, verified, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE competitor_prices SET competitor_id=$1, product_type=$2, price_per_meter=$3, price_date=$4, source=$5, verified=$6, notes=$7 WHERE id=$8 RETURNING *`,
      [competitor_id, product_type, price_per_meter, price_date, source, verified, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/competitor-prices/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM competitor_prices WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── COMPETITOR DEALS CRUD ───── */
router.get("/api/competitor-deals", async (req: Request, res: Response) => {
  try {
    const cid = req.query.competitor_id;
    const where = cid ? `WHERE cd.competitor_id = ${Number(cid)}` : "";
    const { rows } = await pool.query(`SELECT cd.*, c.name as competitor_name FROM competitor_deals cd LEFT JOIN competitors c ON c.id = cd.competitor_id ${where} ORDER BY cd.deal_date DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/competitor-deals", async (req: Request, res: Response) => {
  try {
    const { competitor_id, customer_name, deal_type, estimated_value, our_quote_value, outcome, loss_reason, deal_date } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO competitor_deals (competitor_id, customer_name, deal_type, estimated_value, our_quote_value, outcome, loss_reason, deal_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [competitor_id, customer_name, deal_type, estimated_value, our_quote_value, outcome || 'unknown', loss_reason, deal_date || new Date()]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/competitor-deals/:id", async (req: Request, res: Response) => {
  try {
    const { competitor_id, customer_name, deal_type, estimated_value, our_quote_value, outcome, loss_reason, deal_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE competitor_deals SET competitor_id=$1, customer_name=$2, deal_type=$3, estimated_value=$4, our_quote_value=$5, outcome=$6, loss_reason=$7, deal_date=$8 WHERE id=$9 RETURNING *`,
      [competitor_id, customer_name, deal_type, estimated_value, our_quote_value, outcome, loss_reason, deal_date, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/competitor-deals/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM competitor_deals WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── MARKET TRENDS CRUD ───── */
router.get("/api/market-trends", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM market_trends ORDER BY period DESC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/market-trends", async (req: Request, res: Response) => {
  try {
    const { metric_name, value, period, source, category, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO market_trends (metric_name, value, period, source, category, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [metric_name, value, period || new Date(), source, category || 'pricing', notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/market-trends/:id", async (req: Request, res: Response) => {
  try {
    const { metric_name, value, period, source, category, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE market_trends SET metric_name=$1, value=$2, period=$3, source=$4, category=$5, notes=$6 WHERE id=$7 RETURNING *`,
      [metric_name, value, period, source, category, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/market-trends/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM market_trends WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── ANALYTICS ENDPOINTS ───── */

// Price comparison: our price vs all competitors for a product type
router.get("/api/competitors/price-comparison/:productType", async (req: Request, res: Response) => {
  try {
    const pt = req.params.productType;
    const { rows } = await pool.query(`
      SELECT c.name as competitor_name, c.pricing_level, cp.price_per_meter, cp.price_date, cp.verified
      FROM competitor_prices cp
      JOIN competitors c ON c.id = cp.competitor_id
      WHERE cp.product_type = $1
      AND cp.id IN (SELECT DISTINCT ON (competitor_id) id FROM competitor_prices WHERE product_type = $1 ORDER BY competitor_id, price_date DESC)
      ORDER BY cp.price_per_meter ASC
    `, [pt]);

    // Get our average price (from quotes/invoices if available)
    let ourPrice = 0;
    try {
      const ourRes = await pool.query(`SELECT AVG(price_per_meter) as avg_price FROM competitor_prices WHERE competitor_id IS NULL AND product_type = $1`, [pt]);
      ourPrice = Number(ourRes.rows[0]?.avg_price || 0);
    } catch { /* ignore */ }

    res.json({ product_type: pt, our_price: ourPrice, competitors: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Win/Loss analysis
router.get("/api/competitors/win-loss-analysis", async (_req: Request, res: Response) => {
  try {
    const { rows: summary } = await pool.query(`
      SELECT
        outcome,
        COUNT(*) as count,
        SUM(estimated_value) as total_value,
        AVG(estimated_value) as avg_value
      FROM competitor_deals
      GROUP BY outcome
    `);

    const { rows: byCompetitor } = await pool.query(`
      SELECT
        c.name as competitor_name,
        COUNT(*) FILTER (WHERE cd.outcome = 'won_by_us') as wins,
        COUNT(*) FILTER (WHERE cd.outcome = 'lost_to_them') as losses,
        COUNT(*) FILTER (WHERE cd.outcome = 'unknown') as unknown,
        SUM(cd.estimated_value) FILTER (WHERE cd.outcome = 'lost_to_them') as lost_value,
        SUM(cd.estimated_value) FILTER (WHERE cd.outcome = 'won_by_us') as won_value
      FROM competitor_deals cd
      JOIN competitors c ON c.id = cd.competitor_id
      GROUP BY c.name
      ORDER BY losses DESC
    `);

    const { rows: lossReasons } = await pool.query(`
      SELECT loss_reason, COUNT(*) as count, SUM(estimated_value) as total_value
      FROM competitor_deals
      WHERE outcome = 'lost_to_them' AND loss_reason IS NOT NULL AND loss_reason != ''
      GROUP BY loss_reason ORDER BY count DESC
    `);

    const totalDeals = summary.reduce((s: number, r: any) => s + Number(r.count), 0);
    const wonCount = Number(summary.find((r: any) => r.outcome === 'won_by_us')?.count || 0);
    const winRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0;

    res.json({ summary, byCompetitor, lossReasons, winRate, totalDeals });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Market overview
router.get("/api/competitors/market-overview", async (_req: Request, res: Response) => {
  try {
    const { rows: competitors } = await pool.query(`
      SELECT id, name, market_share_pct, pricing_level, quality_rating, delivery_speed_rating, status
      FROM competitors WHERE status = 'active' ORDER BY market_share_pct DESC
    `);

    const { rows: trends } = await pool.query(`
      SELECT category, metric_name, value, period
      FROM market_trends
      WHERE period >= CURRENT_DATE - INTERVAL '12 months'
      ORDER BY period DESC
    `);

    const { rows: priceTrends } = await pool.query(`
      SELECT product_type, AVG(price_per_meter) as avg_price, COUNT(DISTINCT competitor_id) as num_competitors
      FROM competitor_prices
      WHERE price_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY product_type ORDER BY avg_price DESC
    `);

    res.json({ competitors, trends, priceTrends });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Dashboard
router.get("/api/competitors/dashboard", async (_req: Request, res: Response) => {
  try {
    const { rows: [counts] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM competitors WHERE status = 'active') as active_competitors,
        (SELECT COUNT(*) FROM competitor_deals) as total_deals,
        (SELECT COUNT(*) FROM competitor_deals WHERE outcome = 'won_by_us') as deals_won,
        (SELECT COUNT(*) FROM competitor_deals WHERE outcome = 'lost_to_them') as deals_lost,
        (SELECT SUM(estimated_value) FROM competitor_deals WHERE outcome = 'won_by_us') as won_value,
        (SELECT SUM(estimated_value) FROM competitor_deals WHERE outcome = 'lost_to_them') as lost_value,
        (SELECT COUNT(*) FROM competitor_prices WHERE price_date >= CURRENT_DATE - INTERVAL '30 days') as recent_prices,
        (SELECT COUNT(*) FROM market_trends WHERE period >= CURRENT_DATE - INTERVAL '30 days') as recent_trends
    `);

    const { rows: topCompetitors } = await pool.query(`
      SELECT c.*, COUNT(cd.id) as deal_count
      FROM competitors c
      LEFT JOIN competitor_deals cd ON cd.competitor_id = c.id
      WHERE c.status = 'active'
      GROUP BY c.id ORDER BY deal_count DESC LIMIT 5
    `);

    const { rows: recentDeals } = await pool.query(`
      SELECT cd.*, c.name as competitor_name
      FROM competitor_deals cd
      LEFT JOIN competitors c ON c.id = cd.competitor_id
      ORDER BY cd.deal_date DESC LIMIT 10
    `);

    const totalDeals = Number(counts.total_deals || 0);
    const wonCount = Number(counts.deals_won || 0);
    const winRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0;

    res.json({ ...counts, winRate, topCompetitors, recentDeals });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
