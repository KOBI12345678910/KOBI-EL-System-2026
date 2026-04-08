/**
 * מנוע ניהול סיכונים וסימולציית מונטה קרלו
 * ניתוח סיכונים למפעל מתכת - ברזל, אלומיניום, זכוכית
 * כולל סימולציות הכנסות, עלויות חומרי גלם, רווחיות פרויקטים, תזרים מזומנים ושערי חליפין
 * כל החישובים ב-TypeScript טהור ללא ספריות חיצוניות
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

// ===================== טיפוסים =====================

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

interface QueryRow {
  [key: string]: unknown;
}

// פרמטרים לסימולציית מונטה קרלו
interface MonteCarloParams {
  simulation_type: string;
  iterations?: number;
  // פרמטרים למחיר ברזל
  iron_price_current?: number;
  iron_price_std?: number;
  // פרמטרים למחיר אלומיניום
  aluminum_price_current?: number;
  aluminum_price_std?: number;
  // פרמטרים למחיר זכוכית
  glass_price_current?: number;
  glass_price_std?: number;
  // שינויים כלליים (באחוזים)
  iron_price_change?: number;
  aluminum_price_change?: number;
  demand_change?: number;
  exchange_rate?: number;
  exchange_rate_std?: number;
  labor_cost?: number;
  labor_cost_std?: number;
  // הכנסות
  monthly_revenue?: number;
  revenue_std?: number;
  // עלויות
  monthly_costs?: number;
  costs_std?: number;
  // תקופה
  months?: number;
}

// תוצאת סימולציה בודדת
interface SimulationResult {
  iteration: number;
  value: number;
}

// ===================== פונקציות מתמטיות - ללא ספריות חיצוניות =====================

/**
 * יצירת מספר אקראי בהתפלגות נורמלית (Box-Muller Transform)
 * שיטה סטנדרטית ליצירת מספרים בהתפלגות גאוסיאנית
 */
function normalRandom(mean: number, stdDev: number): number {
  let u1 = 0;
  let u2 = 0;
  // מניעת log(0)
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * z;
}

/**
 * חישוב ממוצע
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * חישוב סטיית תקן
 */
function stdDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * חישוב אחוזון (percentile)
 */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * חישוב Value at Risk - ערך בסיכון
 */
function valueAtRisk(values: number[], confidenceLevel: number): number {
  // VaR הוא האחוזון השמאלי - הפסד מקסימלי ברמת ביטחון נתונה
  return percentile(values, 100 - confidenceLevel);
}

// ===================== מנועי סימולציה =====================

/**
 * סימולציית תרחישי הכנסות - מפעל מתכת
 */
function simulateRevenue(params: MonteCarloParams): SimulationResult[] {
  const iterations = params.iterations || 10000;
  const baseRevenue = params.monthly_revenue || 5000000; // הכנסה חודשית בסיס (₪)
  const revenueStd = params.revenue_std || baseRevenue * 0.15; // סטיית תקן 15%
  const demandChange = (params.demand_change || 0) / 100;
  const months = params.months || 12;

  const results: SimulationResult[] = [];
  for (let i = 0; i < iterations; i++) {
    let totalRevenue = 0;
    for (let m = 0; m < months; m++) {
      // הכנסה חודשית עם שונות + מגמת ביקוש
      const monthlyRev = normalRandom(baseRevenue * (1 + demandChange), revenueStd);
      totalRevenue += Math.max(0, monthlyRev);
    }
    results.push({ iteration: i, value: totalRevenue });
  }
  return results;
}

/**
 * סימולציית עלויות חומרי גלם - ברזל, אלומיניום, זכוכית
 */
function simulateMaterialCosts(params: MonteCarloParams): SimulationResult[] {
  const iterations = params.iterations || 10000;

  // מחירי בסיס לטון (בדולר)
  const ironBase = params.iron_price_current || 550;
  const ironStd = params.iron_price_std || ironBase * 0.12;
  const aluminumBase = params.aluminum_price_current || 2400;
  const aluminumStd = params.aluminum_price_std || aluminumBase * 0.15;
  const glassBase = params.glass_price_current || 800;
  const glassStd = params.glass_price_std || glassBase * 0.08;

  // כמויות חודשיות (טון)
  const ironQuantity = 100;
  const aluminumQuantity = 30;
  const glassQuantity = 20;

  // שער חליפין
  const exchangeRate = params.exchange_rate || 3.65;
  const exchangeStd = params.exchange_rate_std || exchangeRate * 0.05;

  const months = params.months || 12;
  const results: SimulationResult[] = [];

  for (let i = 0; i < iterations; i++) {
    let totalCost = 0;
    for (let m = 0; m < months; m++) {
      const ironPrice = Math.max(100, normalRandom(ironBase, ironStd));
      const aluminumPrice = Math.max(500, normalRandom(aluminumBase, aluminumStd));
      const glassPrice = Math.max(200, normalRandom(glassBase, glassStd));
      const rate = Math.max(2.5, normalRandom(exchangeRate, exchangeStd));

      const monthlyCost =
        (ironPrice * ironQuantity + aluminumPrice * aluminumQuantity + glassPrice * glassQuantity) * rate;
      totalCost += monthlyCost;
    }
    results.push({ iteration: i, value: totalCost });
  }
  return results;
}

/**
 * סימולציית רווחיות פרויקט
 */
function simulateProjectProfitability(params: MonteCarloParams): SimulationResult[] {
  const iterations = params.iterations || 10000;
  const baseRevenue = params.monthly_revenue || 5000000;
  const revenueStd = params.revenue_std || baseRevenue * 0.15;
  const baseCosts = params.monthly_costs || 3500000;
  const costsStd = params.costs_std || baseCosts * 0.12;
  const months = params.months || 12;

  const results: SimulationResult[] = [];
  for (let i = 0; i < iterations; i++) {
    let totalProfit = 0;
    for (let m = 0; m < months; m++) {
      const revenue = Math.max(0, normalRandom(baseRevenue, revenueStd));
      const costs = Math.max(0, normalRandom(baseCosts, costsStd));
      totalProfit += revenue - costs;
    }
    results.push({ iteration: i, value: totalProfit });
  }
  return results;
}

/**
 * סימולציית תזרים מזומנים
 */
function simulateCashFlow(params: MonteCarloParams): SimulationResult[] {
  const iterations = params.iterations || 10000;
  const baseRevenue = params.monthly_revenue || 5000000;
  const revenueStd = params.revenue_std || baseRevenue * 0.15;
  const baseCosts = params.monthly_costs || 4000000;
  const costsStd = params.costs_std || baseCosts * 0.10;
  const months = params.months || 12;

  // עיכוב גבייה - חלק מההכנסות נכנס בחודש הבא
  const collectionRate = 0.7; // 70% נגבה באותו חודש
  const results: SimulationResult[] = [];

  for (let i = 0; i < iterations; i++) {
    let cashBalance = 0;
    let deferredIncome = 0;
    let minBalance = Infinity;

    for (let m = 0; m < months; m++) {
      const revenue = Math.max(0, normalRandom(baseRevenue, revenueStd));
      const costs = Math.max(0, normalRandom(baseCosts, costsStd));

      // תזרים: גבייה מיידית + גבייה מחודש קודם - הוצאות
      const cashIn = revenue * collectionRate + deferredIncome;
      deferredIncome = revenue * (1 - collectionRate);
      cashBalance += cashIn - costs;

      if (cashBalance < minBalance) minBalance = cashBalance;
    }
    // הערך הוא היתרה המינימלית (הגרועה ביותר) בתקופה
    results.push({ iteration: i, value: minBalance });
  }
  return results;
}

/**
 * סימולציית השפעת שער חליפין על עלויות יבוא
 */
function simulateExchangeRateImpact(params: MonteCarloParams): SimulationResult[] {
  const iterations = params.iterations || 10000;
  const baseRate = params.exchange_rate || 3.65;
  const rateStd = params.exchange_rate_std || baseRate * 0.08;
  const monthlyImportUSD = 500000; // יבוא חודשי ממוצע בדולר
  const months = params.months || 12;

  const baseAnnualCost = monthlyImportUSD * months * baseRate;
  const results: SimulationResult[] = [];

  for (let i = 0; i < iterations; i++) {
    let totalCost = 0;
    for (let m = 0; m < months; m++) {
      const rate = Math.max(2.5, normalRandom(baseRate, rateStd));
      totalCost += monthlyImportUSD * rate;
    }
    // ההפרש מהעלות הבסיסית - חיובי = עלות יתרה, שלילי = חיסכון
    results.push({ iteration: i, value: totalCost - baseAnnualCost });
  }
  return results;
}

/**
 * בחירת מנוע סימולציה לפי סוג
 */
function runSimulation(params: MonteCarloParams): SimulationResult[] {
  switch (params.simulation_type) {
    case "revenue": return simulateRevenue(params);
    case "material_costs": return simulateMaterialCosts(params);
    case "project_profitability": return simulateProjectProfitability(params);
    case "cash_flow": return simulateCashFlow(params);
    case "exchange_rate": return simulateExchangeRateImpact(params);
    default: return simulateRevenue(params);
  }
}

/**
 * ניתוח תוצאות סימולציה
 */
function analyzeResults(results: SimulationResult[]) {
  const values = results.map((r) => r.value);

  const expected = mean(values);
  const std = stdDeviation(values);
  const var95 = valueAtRisk(values, 95);
  const var99 = valueAtRisk(values, 99);
  const sorted = [...values].sort((a, b) => a - b);
  const bestCase = sorted[sorted.length - 1];
  const worstCase = sorted[0];
  const median = percentile(values, 50);

  // היסטוגרמה - חלוקה ל-20 bins
  const binCount = 20;
  const range = bestCase - worstCase;
  const binSize = range / binCount;
  const histogram = Array.from({ length: binCount }, (_, i) => {
    const binStart = worstCase + i * binSize;
    const binEnd = binStart + binSize;
    const count = values.filter((v) => v >= binStart && (i === binCount - 1 ? v <= binEnd : v < binEnd)).length;
    return {
      range_start: binStart,
      range_end: binEnd,
      count,
      frequency: (count / values.length * 100).toFixed(2),
    };
  });

  // הסתברות להפסד
  const lossProb = values.filter((v) => v < 0).length / values.length * 100;

  return {
    expected_value: Number(expected.toFixed(2)),
    std_deviation: Number(std.toFixed(2)),
    var_95: Number(var95.toFixed(2)),
    var_99: Number(var99.toFixed(2)),
    best_case: Number(bestCase.toFixed(2)),
    worst_case: Number(worstCase.toFixed(2)),
    median: Number(median.toFixed(2)),
    confidence_interval: {
      ci_90: { lower: Number(percentile(values, 5).toFixed(2)), upper: Number(percentile(values, 95).toFixed(2)) },
      ci_95: { lower: Number(percentile(values, 2.5).toFixed(2)), upper: Number(percentile(values, 97.5).toFixed(2)) },
      ci_99: { lower: Number(percentile(values, 0.5).toFixed(2)), upper: Number(percentile(values, 99.5).toFixed(2)) },
    },
    loss_probability: Number(lossProb.toFixed(2)),
    histogram,
  };
}

// ===================== ראוטר =====================

const router = Router();

// ===================== אימות =====================

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  next();
}

router.use("/risk-monte-carlo", requireAuth as (req: Request, res: Response, next: NextFunction) => void);

// ===================== שאילתה בטוחה =====================

async function safeQuery(query: string): Promise<QueryRow[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return (result.rows || []) as QueryRow[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("שגיאת שאילתת סיכונים:", message);
    return [];
  }
}

// ===================== אתחול טבלאות =====================

router.post("/risk-monte-carlo/init", async (_req: Request, res: Response) => {
  try {
    // רישום סיכונים חברתי
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS risk_register_company (
        id SERIAL PRIMARY KEY,
        risk_id VARCHAR(50) UNIQUE NOT NULL,
        risk_name VARCHAR(255),
        risk_name_he VARCHAR(255),
        category VARCHAR(100),
        subcategory VARCHAR(100),
        description TEXT,
        probability NUMERIC(5,2),
        impact_score INTEGER,
        risk_score NUMERIC(5,2),
        financial_impact NUMERIC(15,2),
        mitigation_strategy TEXT,
        contingency_plan TEXT,
        owner VARCHAR(255),
        review_date DATE,
        status VARCHAR(50) DEFAULT 'active',
        trend VARCHAR(20) DEFAULT 'stable',
        last_incident DATE,
        incident_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // סימולציות מונטה קרלו
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS monte_carlo_simulations (
        id SERIAL PRIMARY KEY,
        simulation_name VARCHAR(255),
        simulation_type VARCHAR(100),
        parameters JSONB DEFAULT '{}',
        iterations INTEGER DEFAULT 10000,
        results JSONB DEFAULT '{}',
        expected_value NUMERIC(15,2),
        std_deviation NUMERIC(15,2),
        var_95 NUMERIC(15,2),
        var_99 NUMERIC(15,2),
        best_case NUMERIC(15,2),
        worst_case NUMERIC(15,2),
        confidence_interval JSONB,
        recommendations JSONB DEFAULT '[]',
        run_by VARCHAR(255),
        run_at TIMESTAMPTZ DEFAULT NOW(),
        duration_ms INTEGER,
        status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // ניתוחי תרחישים
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS scenario_analyses (
        id SERIAL PRIMARY KEY,
        scenario_name VARCHAR(255),
        scenario_name_he VARCHAR(255),
        scenario_type VARCHAR(100),
        base_assumptions JSONB DEFAULT '{}',
        variables JSONB DEFAULT '[]',
        outcomes JSONB DEFAULT '[]',
        probability NUMERIC(5,2),
        impact_on_revenue NUMERIC(15,2),
        impact_on_profit NUMERIC(15,2),
        impact_on_cashflow NUMERIC(15,2),
        recommended_actions JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'active',
        created_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // אינדקסים
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_risk_register_category ON risk_register_company(category)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_risk_register_status ON risk_register_company(status)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_risk_register_score ON risk_register_company(risk_score DESC)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_monte_carlo_type ON monte_carlo_simulations(simulation_type)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_scenario_type ON scenario_analyses(scenario_type)`));

    // נתוני seed - סיכונים ראשוניים למפעל מתכת
    const seedRisks = [
      { risk_id: "RSK-MAT-001", name: "Iron Price Surge", name_he: "זינוק מחיר ברזל", category: "market", subcategory: "commodity_price", probability: 35, impact: 4, financial_impact: 2000000 },
      { risk_id: "RSK-MAT-002", name: "Aluminum Price Volatility", name_he: "תנודות מחיר אלומיניום", category: "market", subcategory: "commodity_price", probability: 40, impact: 3, financial_impact: 1500000 },
      { risk_id: "RSK-MAT-003", name: "Glass Supply Shortage", name_he: "מחסור באספקת זכוכית", category: "supply_chain", subcategory: "supply_disruption", probability: 20, impact: 4, financial_impact: 800000 },
      { risk_id: "RSK-FX-001", name: "USD/ILS Exchange Rate", name_he: "שער חליפין דולר/שקל", category: "financial", subcategory: "currency", probability: 50, impact: 3, financial_impact: 1200000 },
      { risk_id: "RSK-FX-002", name: "EUR/ILS Exchange Rate", name_he: "שער חליפין יורו/שקל", category: "financial", subcategory: "currency", probability: 45, impact: 2, financial_impact: 600000 },
      { risk_id: "RSK-OPS-001", name: "Production Line Failure", name_he: "תקלה בקו ייצור", category: "operational", subcategory: "equipment", probability: 15, impact: 5, financial_impact: 3000000 },
      { risk_id: "RSK-OPS-002", name: "Quality Control Failure", name_he: "כשל בקרת איכות", category: "operational", subcategory: "quality", probability: 10, impact: 4, financial_impact: 1000000 },
      { risk_id: "RSK-SUP-001", name: "Shipping Delay", name_he: "עיכוב במשלוח ימי", category: "supply_chain", subcategory: "logistics", probability: 30, impact: 3, financial_impact: 500000 },
      { risk_id: "RSK-SUP-002", name: "Port Congestion Ashdod", name_he: "עומס בנמל אשדוד", category: "supply_chain", subcategory: "logistics", probability: 25, impact: 2, financial_impact: 300000 },
      { risk_id: "RSK-REG-001", name: "Environmental Regulation", name_he: "רגולציה סביבתית חדשה", category: "regulatory", subcategory: "environment", probability: 20, impact: 3, financial_impact: 800000 },
      { risk_id: "RSK-REG-002", name: "Import Duty Changes", name_he: "שינוי מכסי יבוא", category: "regulatory", subcategory: "trade_policy", probability: 15, impact: 3, financial_impact: 700000 },
      { risk_id: "RSK-HR-001", name: "Key Personnel Departure", name_he: "עזיבת עובד מפתח", category: "human_resources", subcategory: "retention", probability: 20, impact: 3, financial_impact: 500000 },
      { risk_id: "RSK-MKT-001", name: "Demand Drop", name_he: "ירידה בביקוש", category: "market", subcategory: "demand", probability: 25, impact: 4, financial_impact: 2500000 },
      { risk_id: "RSK-CYB-001", name: "Cyber Attack", name_he: "מתקפת סייבר", category: "technology", subcategory: "cybersecurity", probability: 10, impact: 5, financial_impact: 2000000 },
      { risk_id: "RSK-GEO-001", name: "Geopolitical Disruption", name_he: "אירוע גיאופוליטי", category: "geopolitical", subcategory: "conflict", probability: 30, impact: 5, financial_impact: 5000000 },
    ];

    for (const r of seedRisks) {
      const riskScore = (r.probability / 100) * r.impact;
      await safeQuery(`
        INSERT INTO risk_register_company (risk_id, risk_name, risk_name_he, category, subcategory, probability, impact_score, risk_score, financial_impact, status)
        VALUES ('${r.risk_id}', '${r.name}', '${r.name_he}', '${r.category}', '${r.subcategory}', ${r.probability}, ${r.impact}, ${riskScore.toFixed(2)}, ${r.financial_impact}, 'active')
        ON CONFLICT (risk_id) DO NOTHING
      `);
    }

    res.json({
      success: true,
      message: "טבלאות ניהול סיכונים ומונטה קרלו אותחלו בהצלחה",
      tables: ["risk_register_company", "monte_carlo_simulations", "scenario_analyses"],
      seed_risks: seedRisks.length,
      simulation_types: ["revenue", "material_costs", "project_profitability", "cash_flow", "exchange_rate"],
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה באתחול טבלאות סיכונים" });
  }
});

// ===================== CRUD רישום סיכונים =====================

// רשימת סיכונים
router.get("/risk-monte-carlo/risks", async (req: Request, res: Response) => {
  try {
    const { category, status, min_score, page = "1", limit = "50" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE 1=1";
    if (category) where += ` AND category = '${category}'`;
    if (status) where += ` AND status = '${status}'`;
    if (min_score) where += ` AND risk_score >= ${Number(min_score)}`;

    const countRows = await safeQuery(`SELECT COUNT(*) as total FROM risk_register_company ${where}`);
    const total = Number(countRows[0]?.total || 0);

    const rows = await safeQuery(`
      SELECT * FROM risk_register_company ${where}
      ORDER BY risk_score DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    res.json({
      risks: rows,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת סיכונים" });
  }
});

// סיכון בודד
router.get("/risk-monte-carlo/risks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await safeQuery(`SELECT * FROM risk_register_company WHERE id = ${Number(id)}`);
    if (!rows.length) { res.status(404).json({ error: "סיכון לא נמצא" }); return; }
    res.json({ risk: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת סיכון" });
  }
});

// יצירת סיכון
router.post("/risk-monte-carlo/risks", async (req: AuthRequest, res: Response) => {
  try {
    const {
      risk_id, risk_name, risk_name_he, category, subcategory,
      description, probability, impact_score, financial_impact,
      mitigation_strategy, contingency_plan, owner, review_date, notes,
    } = req.body;

    const prob = Number(probability) || 0;
    const impact = Number(impact_score) || 1;
    const risk_score = (prob / 100) * impact;

    const rows = await safeQuery(`
      INSERT INTO risk_register_company (
        risk_id, risk_name, risk_name_he, category, subcategory,
        description, probability, impact_score, risk_score, financial_impact,
        mitigation_strategy, contingency_plan, owner, review_date, notes
      ) VALUES (
        '${risk_id}', '${risk_name || ''}', '${risk_name_he || ''}', '${category || ''}', '${subcategory || ''}',
        '${description || ''}', ${prob}, ${impact}, ${risk_score.toFixed(2)}, ${Number(financial_impact) || 0},
        '${mitigation_strategy || ''}', '${contingency_plan || ''}', '${owner || ''}',
        ${review_date ? `'${review_date}'` : 'NULL'}, '${notes || ''}'
      ) RETURNING *
    `);

    res.json({ success: true, message: "סיכון נוסף לרישום", risk: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת סיכון" });
  }
});

// עדכון סיכון
router.put("/risk-monte-carlo/risks/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    // חישוב מחדש של ציון סיכון אם השתנו הסתברות או השפעה
    if (fields.probability !== undefined || fields.impact_score !== undefined) {
      const current = await safeQuery(`SELECT * FROM risk_register_company WHERE id = ${Number(id)}`);
      if (current.length) {
        const prob = Number(fields.probability ?? current[0].probability) || 0;
        const impact = Number(fields.impact_score ?? current[0].impact_score) || 1;
        fields.risk_score = ((prob / 100) * impact).toFixed(2);
      }
    }

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "object") {
        setClauses.push(`${key} = '${JSON.stringify(value)}'`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }
    setClauses.push("updated_at = NOW()");

    const rows = await safeQuery(`UPDATE risk_register_company SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "סיכון לא נמצא" }); return; }

    res.json({ success: true, message: "סיכון עודכן בהצלחה", risk: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון סיכון" });
  }
});

// ===================== CRUD סימולציות =====================

// רשימת סימולציות
router.get("/risk-monte-carlo/simulations", async (req: Request, res: Response) => {
  try {
    const { simulation_type, page = "1", limit = "20" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE 1=1";
    if (simulation_type) where += ` AND simulation_type = '${simulation_type}'`;

    const rows = await safeQuery(`
      SELECT id, simulation_name, simulation_type, iterations,
        expected_value, std_deviation, var_95, var_99, best_case, worst_case,
        run_by, run_at, duration_ms, status, created_at
      FROM monte_carlo_simulations ${where}
      ORDER BY created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    res.json({ simulations: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת סימולציות" });
  }
});

// סימולציה בודדת עם תוצאות מלאות
router.get("/risk-monte-carlo/simulations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await safeQuery(`SELECT * FROM monte_carlo_simulations WHERE id = ${Number(id)}`);
    if (!rows.length) { res.status(404).json({ error: "סימולציה לא נמצאה" }); return; }
    res.json({ simulation: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת סימולציה" });
  }
});

// ===================== CRUD תרחישים =====================

// רשימת תרחישים
router.get("/risk-monte-carlo/scenarios", async (req: Request, res: Response) => {
  try {
    const { scenario_type, status } = req.query;
    let where = "WHERE 1=1";
    if (scenario_type) where += ` AND scenario_type = '${scenario_type}'`;
    if (status) where += ` AND status = '${status}'`;

    const rows = await safeQuery(`SELECT * FROM scenario_analyses ${where} ORDER BY created_at DESC`);
    res.json({ scenarios: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת תרחישים" });
  }
});

// יצירת תרחיש
router.post("/risk-monte-carlo/scenarios", async (req: Request, res: Response) => {
  try {
    const {
      scenario_name, scenario_name_he, scenario_type, base_assumptions,
      variables, outcomes, probability, impact_on_revenue, impact_on_profit,
      impact_on_cashflow, recommended_actions, created_by, notes,
    } = req.body;

    const rows = await safeQuery(`
      INSERT INTO scenario_analyses (
        scenario_name, scenario_name_he, scenario_type, base_assumptions,
        variables, outcomes, probability, impact_on_revenue, impact_on_profit,
        impact_on_cashflow, recommended_actions, created_by, notes
      ) VALUES (
        '${scenario_name || ''}', '${scenario_name_he || ''}', '${scenario_type || 'custom'}',
        '${JSON.stringify(base_assumptions || {})}', '${JSON.stringify(variables || [])}',
        '${JSON.stringify(outcomes || [])}', ${Number(probability) || 0},
        ${Number(impact_on_revenue) || 0}, ${Number(impact_on_profit) || 0}, ${Number(impact_on_cashflow) || 0},
        '${JSON.stringify(recommended_actions || [])}', '${created_by || ''}', '${notes || ''}'
      ) RETURNING *
    `);

    res.json({ success: true, message: "תרחיש נוצר בהצלחה", scenario: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת תרחיש" });
  }
});

// עדכון תרחיש
router.put("/risk-monte-carlo/scenarios/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "object") {
        setClauses.push(`${key} = '${JSON.stringify(value)}'`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }
    setClauses.push("updated_at = NOW()");

    const rows = await safeQuery(`UPDATE scenario_analyses SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "תרחיש לא נמצא" }); return; }

    res.json({ success: true, message: "תרחיש עודכן", scenario: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון תרחיש" });
  }
});

// ===================== הרצת סימולציית מונטה קרלו =====================

router.post("/risk-monte-carlo/run-monte-carlo", async (req: AuthRequest, res: Response) => {
  try {
    const params: MonteCarloParams = req.body;
    const iterations = Math.min(Math.max(params.iterations || 10000, 100), 50000);
    params.iterations = iterations;

    const startTime = Date.now();

    // הרצת הסימולציה
    const rawResults = runSimulation(params);
    const analysis = analyzeResults(rawResults);
    const durationMs = Date.now() - startTime;

    // יצירת המלצות אוטומטיות
    const recommendations: string[] = [];
    if (analysis.loss_probability > 30) {
      recommendations.push("הסתברות להפסד גבוהה - יש לשקול גידור סיכונים");
    }
    if (analysis.std_deviation > analysis.expected_value * 0.3) {
      recommendations.push("שונות גבוהה מאוד - מומלץ לפזר סיכונים");
    }
    if (analysis.var_95 < 0 && params.simulation_type === "cash_flow") {
      recommendations.push("VaR 95% שלילי - סיכון תזרימי משמעותי, נדרש קו אשראי");
    }
    if (params.simulation_type === "exchange_rate" && analysis.var_95 > 500000) {
      recommendations.push("חשיפה מטבעית משמעותית - לשקול עסקאות פורוורד");
    }
    if (params.simulation_type === "material_costs" && analysis.std_deviation > analysis.expected_value * 0.1) {
      recommendations.push("תנודתיות גבוהה בעלויות חומרי גלם - לשקול חוזים ארוכי טווח");
    }

    // שמירה למסד נתונים
    const simulationName = `${params.simulation_type}_${new Date().toISOString().slice(0, 10)}`;
    const savedRows = await safeQuery(`
      INSERT INTO monte_carlo_simulations (
        simulation_name, simulation_type, parameters, iterations,
        results, expected_value, std_deviation, var_95, var_99,
        best_case, worst_case, confidence_interval, recommendations,
        run_by, duration_ms, status
      ) VALUES (
        '${simulationName}', '${params.simulation_type}', '${JSON.stringify(params)}', ${iterations},
        '${JSON.stringify({ histogram: analysis.histogram, loss_probability: analysis.loss_probability })}',
        ${analysis.expected_value}, ${analysis.std_deviation}, ${analysis.var_95}, ${analysis.var_99},
        ${analysis.best_case}, ${analysis.worst_case},
        '${JSON.stringify(analysis.confidence_interval)}',
        '${JSON.stringify(recommendations)}',
        '${(req as AuthRequest).user?.username || 'system'}', ${durationMs}, 'completed'
      ) RETURNING id
    `);

    res.json({
      success: true,
      simulation_id: savedRows[0]?.id,
      simulation_type: params.simulation_type,
      iterations,
      duration_ms: durationMs,
      analysis: {
        expected_value: analysis.expected_value,
        std_deviation: analysis.std_deviation,
        median: analysis.median,
        var_95: analysis.var_95,
        var_99: analysis.var_99,
        best_case: analysis.best_case,
        worst_case: analysis.worst_case,
        loss_probability: analysis.loss_probability,
        confidence_interval: analysis.confidence_interval,
      },
      histogram: analysis.histogram,
      recommendations,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהרצת סימולציית מונטה קרלו" });
  }
});

// ===================== לוח בקרה סיכונים =====================

router.get("/risk-monte-carlo/risk-dashboard", async (_req: Request, res: Response) => {
  try {
    // סיכונים לפי קטגוריה
    const byCategory = await safeQuery(`
      SELECT category,
        COUNT(*) as count,
        AVG(risk_score) as avg_score,
        MAX(risk_score) as max_score,
        SUM(financial_impact) as total_financial_impact,
        COUNT(*) FILTER (WHERE risk_score >= 3) as high_risks
      FROM risk_register_company
      WHERE status = 'active'
      GROUP BY category
      ORDER BY avg_score DESC
    `);

    // 10 הסיכונים הגבוהים ביותר
    const topRisks = await safeQuery(`
      SELECT risk_id, risk_name, risk_name_he, category, probability,
        impact_score, risk_score, financial_impact, trend, status
      FROM risk_register_company
      WHERE status = 'active'
      ORDER BY risk_score DESC
      LIMIT 10
    `);

    // סיכום כללי
    const summary = await safeQuery(`
      SELECT
        COUNT(*) as total_risks,
        COUNT(*) FILTER (WHERE status = 'active') as active_risks,
        COUNT(*) FILTER (WHERE risk_score >= 4) as critical_risks,
        COUNT(*) FILTER (WHERE risk_score >= 3 AND risk_score < 4) as high_risks,
        COUNT(*) FILTER (WHERE risk_score >= 2 AND risk_score < 3) as medium_risks,
        COUNT(*) FILTER (WHERE risk_score < 2) as low_risks,
        SUM(financial_impact) FILTER (WHERE status = 'active') as total_financial_exposure,
        AVG(risk_score) FILTER (WHERE status = 'active') as avg_risk_score,
        COUNT(*) FILTER (WHERE trend = 'increasing') as increasing_risks,
        COUNT(*) FILTER (WHERE trend = 'decreasing') as decreasing_risks
      FROM risk_register_company
    `);

    // מגמות - סיכונים שהשתנו לאחרונה
    const trends = await safeQuery(`
      SELECT risk_id, risk_name_he, category, risk_score, trend, updated_at
      FROM risk_register_company
      WHERE status = 'active' AND trend != 'stable'
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    // סימולציות אחרונות
    const recentSimulations = await safeQuery(`
      SELECT id, simulation_name, simulation_type, expected_value, var_95, run_at
      FROM monte_carlo_simulations
      ORDER BY run_at DESC
      LIMIT 5
    `);

    res.json({
      summary: summary[0] || {},
      by_category: byCategory,
      top_risks: topRisks,
      trends,
      recent_simulations: recentSimulations,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בטעינת לוח בקרה סיכונים" });
  }
});

// ===================== מטריצת סיכונים 5x5 =====================

router.get("/risk-monte-carlo/risk-matrix", async (_req: Request, res: Response) => {
  try {
    // שליפת כל הסיכונים הפעילים
    const risks = await safeQuery(`
      SELECT risk_id, risk_name, risk_name_he, category,
        probability, impact_score, risk_score, financial_impact
      FROM risk_register_company
      WHERE status = 'active'
      ORDER BY risk_score DESC
    `);

    // בניית מטריצה 5x5 - הסתברות (ציר Y) vs השפעה (ציר X)
    // הסתברות: 1=נמוכה מאוד (0-20%), 2=נמוכה (20-40%), 3=בינונית (40-60%), 4=גבוהה (60-80%), 5=גבוהה מאוד (80-100%)
    // השפעה: 1-5

    const matrix: Record<string, QueryRow[]> = {};
    for (let probLevel = 1; probLevel <= 5; probLevel++) {
      for (let impactLevel = 1; impactLevel <= 5; impactLevel++) {
        matrix[`${probLevel}_${impactLevel}`] = [];
      }
    }

    for (const risk of risks) {
      const prob = Number(risk.probability) || 0;
      const impact = Number(risk.impact_score) || 1;

      // המרת הסתברות לרמה 1-5
      let probLevel: number;
      if (prob <= 20) probLevel = 1;
      else if (prob <= 40) probLevel = 2;
      else if (prob <= 60) probLevel = 3;
      else if (prob <= 80) probLevel = 4;
      else probLevel = 5;

      const impactLevel = Math.min(5, Math.max(1, impact));
      const key = `${probLevel}_${impactLevel}`;
      if (matrix[key]) {
        matrix[key].push(risk);
      }
    }

    // חלוקה לאזורי סיכון
    const zones = {
      critical: [] as QueryRow[],  // אדום - 4x4 ומעלה
      high: [] as QueryRow[],      // כתום - 3x3 עד 4x3
      medium: [] as QueryRow[],    // צהוב - 2x2 עד 3x2
      low: [] as QueryRow[],       // ירוק - 1x1 עד 2x1
    };

    for (const risk of risks) {
      const score = Number(risk.risk_score) || 0;
      if (score >= 4) zones.critical.push(risk);
      else if (score >= 3) zones.high.push(risk);
      else if (score >= 2) zones.medium.push(risk);
      else zones.low.push(risk);
    }

    res.json({
      matrix,
      zones,
      total_risks: risks.length,
      labels: {
        probability_levels: [
          { level: 1, range: "0-20%", label_he: "נמוכה מאוד" },
          { level: 2, range: "20-40%", label_he: "נמוכה" },
          { level: 3, range: "40-60%", label_he: "בינונית" },
          { level: 4, range: "60-80%", label_he: "גבוהה" },
          { level: 5, range: "80-100%", label_he: "גבוהה מאוד" },
        ],
        impact_levels: [
          { level: 1, label_he: "זניח" },
          { level: 2, label_he: "קטן" },
          { level: 3, label_he: "בינוני" },
          { level: 4, label_he: "משמעותי" },
          { level: 5, label_he: "קריטי" },
        ],
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת מטריצת סיכונים" });
  }
});

// ===================== ניתוח תרחיש (What-If) =====================

router.post("/risk-monte-carlo/scenario-analysis", async (req: AuthRequest, res: Response) => {
  try {
    const {
      scenario_name, scenario_name_he, scenario_type,
      iron_price_change = 0, aluminum_price_change = 0, glass_price_change = 0,
      demand_change = 0, exchange_rate_change = 0, labor_cost_change = 0,
      base_monthly_revenue = 5000000, base_monthly_costs = 3500000,
      months = 12,
    } = req.body;

    // חישוב השפעה על הכנסות
    const revenueImpact = base_monthly_revenue * months * (demand_change / 100);

    // חישוב השפעה על עלויות חומרי גלם (30% מההוצאות)
    const materialCostsBase = base_monthly_costs * 0.3 * months;
    const avgMaterialChange = (iron_price_change * 0.5 + aluminum_price_change * 0.3 + glass_price_change * 0.2) / 100;
    const materialCostImpact = materialCostsBase * avgMaterialChange;

    // חישוב השפעה על עלויות עבודה (35% מההוצאות)
    const laborBase = base_monthly_costs * 0.35 * months;
    const laborImpact = laborBase * (labor_cost_change / 100);

    // חישוב השפעה על עלויות יבוא (שער חליפין)
    const importBase = materialCostsBase;
    const exchangeImpact = importBase * (exchange_rate_change / 100);

    // סה"כ השפעה
    const totalCostImpact = materialCostImpact + laborImpact + exchangeImpact;
    const profitImpact = revenueImpact - totalCostImpact;

    // תזרים - הנחת עיכוב גבייה
    const cashflowImpact = profitImpact * 0.85; // 85% מושפע ישירות על התזרים

    // שמירת התרחיש
    const savedRows = await safeQuery(`
      INSERT INTO scenario_analyses (
        scenario_name, scenario_name_he, scenario_type, base_assumptions,
        variables, outcomes, probability,
        impact_on_revenue, impact_on_profit, impact_on_cashflow,
        recommended_actions, created_by
      ) VALUES (
        '${scenario_name || 'ניתוח תרחיש'}', '${scenario_name_he || scenario_name || ''}', '${scenario_type || 'what_if'}',
        '${JSON.stringify({ base_monthly_revenue, base_monthly_costs, months })}',
        '${JSON.stringify({
          iron_price_change, aluminum_price_change, glass_price_change,
          demand_change, exchange_rate_change, labor_cost_change,
        })}',
        '${JSON.stringify({
          revenue_impact: revenueImpact,
          material_cost_impact: materialCostImpact,
          labor_impact: laborImpact,
          exchange_impact: exchangeImpact,
          total_cost_impact: totalCostImpact,
          profit_impact: profitImpact,
          cashflow_impact: cashflowImpact,
        })}',
        50,
        ${revenueImpact}, ${profitImpact}, ${cashflowImpact},
        '${JSON.stringify([])}',
        '${(req as AuthRequest).user?.username || 'system'}'
      ) RETURNING *
    `);

    // המלצות אוטומטיות
    const recommendations: string[] = [];
    if (profitImpact < -1000000) recommendations.push("השפעה שלילית משמעותית על הרווח - נדרש תכנית חירום");
    if (materialCostImpact > 500000) recommendations.push("עליית עלויות חומרי גלם - לשקול ספקים חלופיים או חוזים ארוכי טווח");
    if (exchangeImpact > 300000) recommendations.push("חשיפה מטבעית - לשקול גידור באמצעות פורוורד");
    if (demand_change < -10) recommendations.push("ירידת ביקוש - להגביר שיווק ולגוון מוצרים");
    if (labor_cost_change > 5) recommendations.push("עלויות עבודה עולות - לשקול אוטומציה");

    res.json({
      success: true,
      scenario_id: savedRows[0]?.id,
      scenario_name: scenario_name || "ניתוח תרחיש",
      variables: {
        iron_price_change: `${iron_price_change}%`,
        aluminum_price_change: `${aluminum_price_change}%`,
        glass_price_change: `${glass_price_change}%`,
        demand_change: `${demand_change}%`,
        exchange_rate_change: `${exchange_rate_change}%`,
        labor_cost_change: `${labor_cost_change}%`,
      },
      impact: {
        revenue_impact: Number(revenueImpact.toFixed(2)),
        material_cost_impact: Number(materialCostImpact.toFixed(2)),
        labor_impact: Number(laborImpact.toFixed(2)),
        exchange_impact: Number(exchangeImpact.toFixed(2)),
        total_cost_impact: Number(totalCostImpact.toFixed(2)),
        profit_impact: Number(profitImpact.toFixed(2)),
        cashflow_impact: Number(cashflowImpact.toFixed(2)),
      },
      recommendations,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בניתוח תרחיש" });
  }
});

// ===================== דוח VaR - ערך בסיכון =====================

router.get("/risk-monte-carlo/var-report", async (req: Request, res: Response) => {
  try {
    const { months = "12" } = req.query;

    // הרצת סימולציות VaR לכל סוג סיכון
    const varResults: Record<string, unknown> = {};

    // VaR הכנסות
    const revenueResults = runSimulation({ simulation_type: "revenue", iterations: 5000, months: Number(months) });
    const revenueAnalysis = analyzeResults(revenueResults);
    varResults.revenue = {
      expected_value: revenueAnalysis.expected_value,
      var_95: revenueAnalysis.var_95,
      var_99: revenueAnalysis.var_99,
      worst_case: revenueAnalysis.worst_case,
      loss_probability: revenueAnalysis.loss_probability,
    };

    // VaR עלויות חומרי גלם
    const materialResults = runSimulation({ simulation_type: "material_costs", iterations: 5000, months: Number(months) });
    const materialAnalysis = analyzeResults(materialResults);
    varResults.material_costs = {
      expected_value: materialAnalysis.expected_value,
      var_95: materialAnalysis.var_95,
      var_99: materialAnalysis.var_99,
      worst_case: materialAnalysis.worst_case,
    };

    // VaR תזרים מזומנים
    const cashResults = runSimulation({ simulation_type: "cash_flow", iterations: 5000, months: Number(months) });
    const cashAnalysis = analyzeResults(cashResults);
    varResults.cash_flow = {
      expected_value: cashAnalysis.expected_value,
      var_95: cashAnalysis.var_95,
      var_99: cashAnalysis.var_99,
      worst_case: cashAnalysis.worst_case,
      loss_probability: cashAnalysis.loss_probability,
    };

    // VaR שער חליפין
    const fxResults = runSimulation({ simulation_type: "exchange_rate", iterations: 5000, months: Number(months) });
    const fxAnalysis = analyzeResults(fxResults);
    varResults.exchange_rate = {
      expected_value: fxAnalysis.expected_value,
      var_95: fxAnalysis.var_95,
      var_99: fxAnalysis.var_99,
      worst_case: fxAnalysis.worst_case,
    };

    // חשיפה כוללת מרישום הסיכונים
    const totalExposure = await safeQuery(`
      SELECT
        SUM(financial_impact) as total_exposure,
        SUM(financial_impact * probability / 100) as expected_loss,
        MAX(financial_impact) as max_single_risk
      FROM risk_register_company
      WHERE status = 'active'
    `);

    res.json({
      report_date: new Date().toISOString(),
      horizon_months: Number(months),
      iterations_per_simulation: 5000,
      var_by_category: varResults,
      risk_register_exposure: totalExposure[0] || {},
      summary_he: {
        title: "דוח ערך בסיכון (VaR)",
        description: `ניתוח סיכון ל-${months} חודשים קדימה`,
        methodology: "סימולציית מונטה קרלו עם התפלגות נורמלית",
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהפקת דוח VaR" });
  }
});

// ===================== מבחן קיצון (Stress Test) =====================

router.post("/risk-monte-carlo/stress-test", async (req: AuthRequest, res: Response) => {
  try {
    const {
      base_monthly_revenue = 5000000,
      base_monthly_costs = 3500000,
      months = 12,
    } = req.body;

    // תרחישי קיצון מוגדרים מראש למפעל מתכת
    const stressScenarios = [
      {
        name: "Pandemic-like Shutdown",
        name_he: "סגר כללי (מגפה)",
        demand_change: -40,
        iron_price_change: -15,
        exchange_rate_change: 10,
        labor_cost_change: 5,
        probability: 5,
      },
      {
        name: "Commodity Price Spike",
        name_he: "זינוק מחירי חומרי גלם",
        demand_change: -5,
        iron_price_change: 50,
        aluminum_price_change: 40,
        glass_price_change: 30,
        exchange_rate_change: 5,
        labor_cost_change: 0,
        probability: 10,
      },
      {
        name: "Currency Crisis",
        name_he: "משבר מטבע - פיחות חד",
        demand_change: -10,
        iron_price_change: 5,
        exchange_rate_change: 30,
        labor_cost_change: 10,
        probability: 8,
      },
      {
        name: "Regional Conflict Escalation",
        name_he: "הסלמה ביטחונית באזור",
        demand_change: -30,
        iron_price_change: 20,
        exchange_rate_change: 15,
        labor_cost_change: 5,
        probability: 15,
      },
      {
        name: "Major Client Loss",
        name_he: "אובדן לקוח מרכזי",
        demand_change: -25,
        iron_price_change: 0,
        exchange_rate_change: 0,
        labor_cost_change: 0,
        probability: 12,
      },
      {
        name: "Supply Chain Collapse",
        name_he: "קריסת שרשרת אספקה",
        demand_change: -15,
        iron_price_change: 30,
        aluminum_price_change: 35,
        glass_price_change: 25,
        exchange_rate_change: 10,
        labor_cost_change: 0,
        probability: 7,
      },
    ];

    const results = stressScenarios.map((scenario) => {
      const annualRevenue = base_monthly_revenue * months;
      const annualCosts = base_monthly_costs * months;
      const baseProfit = annualRevenue - annualCosts;

      // חישוב השפעה
      const revenueHit = annualRevenue * ((scenario.demand_change || 0) / 100);
      const materialBase = annualCosts * 0.3;
      const avgMaterialHit = materialBase * (
        ((scenario.iron_price_change || 0) * 0.5 +
         (scenario.aluminum_price_change || 0) * 0.3 +
         (scenario.glass_price_change || 0) * 0.2) / 100
      );
      const laborHit = annualCosts * 0.35 * ((scenario.labor_cost_change || 0) / 100);
      const fxHit = materialBase * ((scenario.exchange_rate_change || 0) / 100);

      const totalCostIncrease = avgMaterialHit + laborHit + fxHit;
      const stressedProfit = baseProfit + revenueHit - totalCostIncrease;
      const profitChange = stressedProfit - baseProfit;

      return {
        scenario: scenario.name,
        scenario_he: scenario.name_he,
        probability: scenario.probability,
        base_profit: Number(baseProfit.toFixed(2)),
        stressed_profit: Number(stressedProfit.toFixed(2)),
        profit_change: Number(profitChange.toFixed(2)),
        profit_change_pct: Number(((profitChange / baseProfit) * 100).toFixed(2)),
        revenue_impact: Number(revenueHit.toFixed(2)),
        cost_impact: Number(totalCostIncrease.toFixed(2)),
        survives: stressedProfit > 0,
        severity: stressedProfit < 0 ? "קריטי" : profitChange < -baseProfit * 0.5 ? "חמור" : profitChange < -baseProfit * 0.2 ? "בינוני" : "קל",
      };
    });

    // סיכום מבחן קיצון
    const failedScenarios = results.filter((r) => !r.survives);
    const avgImpact = mean(results.map((r) => r.profit_change_pct));
    const worstScenario = results.reduce((worst, r) => r.profit_change < worst.profit_change ? r : worst, results[0]);

    res.json({
      success: true,
      base_assumptions: {
        monthly_revenue: base_monthly_revenue,
        monthly_costs: base_monthly_costs,
        months,
        base_annual_profit: (base_monthly_revenue - base_monthly_costs) * months,
      },
      stress_results: results,
      summary: {
        scenarios_tested: results.length,
        scenarios_survived: results.length - failedScenarios.length,
        scenarios_failed: failedScenarios.length,
        avg_profit_impact_pct: Number(avgImpact.toFixed(2)),
        worst_scenario: worstScenario.scenario_he,
        worst_profit_change: worstScenario.profit_change,
        resilience_score_he: failedScenarios.length === 0
          ? "חוסן גבוה - העסק שורד את כל תרחישי הקיצון"
          : failedScenarios.length <= 2
            ? "חוסן בינוני - יש תרחישים שעלולים לאיים"
            : "חוסן נמוך - נדרשות פעולות מיידיות",
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה במבחן קיצון" });
  }
});

// ===================== מגמות סיכונים לאורך זמן =====================

router.get("/risk-monte-carlo/risk-trends", async (req: Request, res: Response) => {
  try {
    const { months = "12", category } = req.query;

    let where = `WHERE updated_at >= CURRENT_DATE - INTERVAL '${Number(months)} months'`;
    if (category) where += ` AND category = '${category}'`;

    // מגמות לפי סיכון
    const riskTrends = await safeQuery(`
      SELECT risk_id, risk_name_he, category, risk_score, probability,
        impact_score, financial_impact, trend, incident_count,
        last_incident, updated_at
      FROM risk_register_company
      ${where}
      ORDER BY risk_score DESC
    `);

    // סיכום מגמות לפי קטגוריה
    const categoryTrends = await safeQuery(`
      SELECT category,
        AVG(risk_score) as avg_score,
        SUM(financial_impact) as total_exposure,
        COUNT(*) FILTER (WHERE trend = 'increasing') as increasing,
        COUNT(*) FILTER (WHERE trend = 'stable') as stable,
        COUNT(*) FILTER (WHERE trend = 'decreasing') as decreasing,
        SUM(incident_count) as total_incidents
      FROM risk_register_company
      WHERE status = 'active'
      GROUP BY category
      ORDER BY avg_score DESC
    `);

    // סימולציות היסטוריות לזיהוי מגמת סיכון כללי
    const historicalSimulations = await safeQuery(`
      SELECT simulation_type,
        TO_CHAR(run_at, 'YYYY-MM') as month,
        AVG(expected_value) as avg_expected,
        AVG(var_95) as avg_var95,
        AVG(std_deviation) as avg_std
      FROM monte_carlo_simulations
      WHERE run_at >= CURRENT_DATE - INTERVAL '${Number(months)} months'
      GROUP BY simulation_type, TO_CHAR(run_at, 'YYYY-MM')
      ORDER BY month
    `);

    res.json({
      risk_trends: riskTrends,
      category_trends: categoryTrends,
      historical_simulations: historicalSimulations,
      analysis_period_months: Number(months),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בניתוח מגמות סיכונים" });
  }
});

export default router;
