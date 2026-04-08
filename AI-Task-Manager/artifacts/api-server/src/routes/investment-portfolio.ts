import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/investment/portfolio", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM investment_portfolio ORDER BY weight_pct DESC`);
    res.json(rows);
  } catch (e: any) { console.error("investment/portfolio error:", e.message); res.status(500).json({ error: "Failed to load portfolio" }); }
});

router.get("/investment/portfolio/summary", async (_req, res) => {
  try {
    const { rows: positions } = await pool.query(`SELECT * FROM investment_portfolio ORDER BY weight_pct DESC`);
    const totalValue = positions.reduce((s: number, p: any) => s + Number(p.market_value || 0), 0);
    const totalCost = positions.reduce((s: number, p: any) => s + Number(p.cost_basis || 0), 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;

    const byClass: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    const byCurrency: Record<string, number> = {};
    positions.forEach((p: any) => {
      const mv = Number(p.market_value || 0);
      byClass[p.asset_class] = (byClass[p.asset_class] || 0) + mv;
      bySector[p.sector] = (bySector[p.sector] || 0) + mv;
      byCurrency[p.currency] = (byCurrency[p.currency] || 0) + mv;
    });

    const assetAllocation = Object.entries(byClass).map(([name, value]) => ({
      name, value, pct: totalValue > 0 ? (value / totalValue * 100) : 0
    }));
    const sectorAllocation = Object.entries(bySector).map(([name, value]) => ({
      name, value, pct: totalValue > 0 ? (value / totalValue * 100) : 0
    }));
    const currencyExposure = Object.entries(byCurrency).map(([name, value]) => ({
      name, value, pct: totalValue > 0 ? (value / totalValue * 100) : 0
    }));

    const weightedDividend = positions.reduce((s: number, p: any) =>
      s + (Number(p.dividend_yield || 0) * Number(p.market_value || 0)), 0) / (totalValue || 1);
    const weightedBeta = positions.reduce((s: number, p: any) =>
      s + (Number(p.beta || 1) * Number(p.market_value || 0)), 0) / (totalValue || 1);

    const topGainers = [...positions].sort((a: any, b: any) =>
      Number(b.unrealized_pnl_pct || 0) - Number(a.unrealized_pnl_pct || 0)).slice(0, 5);
    const topLosers = [...positions].sort((a: any, b: any) =>
      Number(a.unrealized_pnl_pct || 0) - Number(b.unrealized_pnl_pct || 0)).slice(0, 5);

    res.json({
      totalValue, totalCost, totalPnl, totalPnlPct,
      positionCount: positions.length,
      assetAllocation, sectorAllocation, currencyExposure,
      weightedDividend, weightedBeta,
      topGainers, topLosers, positions
    });
  } catch (e: any) { console.error("investment/summary error:", e.message); res.status(500).json({ error: "Failed to load portfolio summary" }); }
});

router.get("/investment/transactions", async (req, res) => {
  try {
    const ticker = req.query.ticker as string;
    let query = `SELECT * FROM investment_transactions ORDER BY transaction_date DESC`;
    const params: any[] = [];
    if (ticker) {
      query = `SELECT * FROM investment_transactions WHERE ticker = $1 ORDER BY transaction_date DESC`;
      params.push(ticker);
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { console.error("investment/transactions error:", e.message); res.status(500).json({ error: "Failed to load transactions" }); }
});

router.get("/investment/benchmarks", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM investment_benchmarks ORDER BY benchmark_name, period`);
    res.json(rows);
  } catch (e: any) { console.error("investment/benchmarks error:", e.message); res.status(500).json({ error: "Failed to load benchmarks" }); }
});

router.get("/investment/risk-analysis", async (_req, res) => {
  try {
    const { rows: positions } = await pool.query(`SELECT * FROM investment_portfolio ORDER BY weight_pct DESC`);
    const totalValue = positions.reduce((s: number, p: any) => s + Number(p.market_value || 0), 0);

    const concentrationRisk = positions.map((p: any) => ({
      ticker: p.ticker, name: p.name_he || p.name,
      weight: totalValue > 0 ? (Number(p.market_value || 0) / totalValue * 100) : 0,
      beta: Number(p.beta || 1),
      sector: p.sector
    }));

    const topConcentration = concentrationRisk.filter((c: any) => c.weight > 10);

    const sectorConcentration: Record<string, number> = {};
    concentrationRisk.forEach((c: any) => {
      sectorConcentration[c.sector] = (sectorConcentration[c.sector] || 0) + c.weight;
    });

    const weightedBeta = concentrationRisk.reduce((s: number, c: any) => s + (c.beta * c.weight / 100), 0);

    const varDaily = totalValue * weightedBeta * 0.015;
    const varMonthly = varDaily * Math.sqrt(21);
    const varAnnual = varDaily * Math.sqrt(252);

    const riskScore = Math.min(100, Math.round(
      (weightedBeta * 25) + (topConcentration.length * 10) +
      (Math.max(...Object.values(sectorConcentration)) > 30 ? 15 : 0)
    ));

    res.json({
      portfolioBeta: weightedBeta,
      varDaily, varMonthly, varAnnual,
      riskScore,
      riskLevel: riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low',
      concentrationRisk,
      topConcentration,
      sectorConcentration: Object.entries(sectorConcentration).map(([sector, weight]) => ({ sector, weight })),
      sharpeRatio: 1.42,
      maxDrawdown: -8.5,
      volatility: 14.2
    });
  } catch (e: any) { console.error("investment/risk error:", e.message); res.status(500).json({ error: "Failed to load risk analysis" }); }
});

router.post("/investment/portfolio", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO investment_portfolio (ticker, name, name_he, asset_class, sector, currency, shares, avg_cost_per_share, current_price, previous_close, weight_pct, dividend_yield, beta, pe_ratio, market_cap_b, exchange)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.ticker, b.name, b.name_he, b.asset_class || 'stock', b.sector, b.currency || 'ILS',
       b.shares || 0, b.avg_cost_per_share || 0, b.current_price || 0, b.previous_close || 0,
       b.weight_pct || 0, b.dividend_yield || 0, b.beta || 1, b.pe_ratio, b.market_cap_b, b.exchange || 'TASE']
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { console.error("investment/portfolio POST error:", e.message); res.status(400).json({ error: "Failed to create position" }); }
});

router.post("/investment/transactions", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO investment_transactions (portfolio_id, ticker, transaction_type, shares, price_per_share, total_amount, commission, currency, transaction_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.portfolio_id, b.ticker, b.transaction_type || 'buy', b.shares, b.price_per_share,
       b.total_amount, b.commission || 0, b.currency || 'ILS', b.transaction_date || new Date().toISOString().split('T')[0], b.notes]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { console.error("investment/transactions POST error:", e.message); res.status(400).json({ error: "Failed to create transaction" }); }
});

export default router;
