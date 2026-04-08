/**
 * ML Engine - מנוע למידת מכונה לבינה עסקית
 *
 * מודולים:
 * 1. חיזוי ביקוש (Time-Series) - Exponential Smoothing + Trend Detection
 * 2. אופטימיזציית תמחור דינמי - Price Elasticity
 * 3. חיזוי נטישת לקוחות - Weighted Scoring Model
 * 4. חיזוי תזרים מזומנים - Moving Average + Trend
 * 5. חיזוי פגמי איכות - Multi-factor Risk Model
 * 6. מנוע המלצות - Collaborative Filtering (פשוט)
 * 7. טבלת קאש לתחזיות - ml_predictions
 *
 * כל החישובים מבוצעים במתמטיקה טהורה ב-TypeScript, ללא ספריות ML חיצוניות.
 */

import { pool } from "@workspace/db";

// ============================================================================
// סוגי נתונים (Types)
// ============================================================================

/** תוצאת חיזוי ביקוש חודשי */
export interface DemandForecast {
  month: string;          // פורמט YYYY-MM
  predicted: number;      // כמות צפויה
  lower_bound: number;    // גבול תחתון (רווח סמך)
  upper_bound: number;    // גבול עליון
  confidence: number;     // רמת ביטחון 0-1
}

/** תוצאת אופטימיזציית תמחור */
export interface PriceOptimization {
  currentPrice: number;
  suggestedPrice: number;
  expectedRevenueLift: number;  // אחוז שיפור צפוי בהכנסות
  elasticity: number;           // גמישות מחיר
  demandAtCurrent: number;
  demandAtSuggested: number;
}

/** תוצאת חיזוי נטישה */
export interface ChurnPrediction {
  customerId: string;
  customerName: string;
  churnRisk: number;        // 0-1, כאשר 1 = סיכון גבוה ביותר
  factors: ChurnFactor[];
  recommendation: string;
}

export interface ChurnFactor {
  name: string;
  value: number;
  weight: number;
  impact: number;   // תרומה לציון הכולל
  description: string;
}

/** תוצאת חיזוי תזרים מזומנים */
export interface CashflowForecast {
  month: string;
  projected_inflow: number;
  projected_outflow: number;
  projected_balance: number;
  confidence: number;
}

/** תוצאת חיזוי פגמים */
export interface DefectPrediction {
  machineId: string;
  machineName: string;
  defectProbability: number;  // 0-1
  topRiskFactors: DefectFactor[];
  recommendation: string;
}

export interface DefectFactor {
  name: string;
  value: number;
  threshold: number;
  riskContribution: number;
  description: string;
}

/** תוצאת המלצה על מוצר */
export interface ProductRecommendation {
  productId: string;
  productName: string;
  score: number;      // 0-1
  reason: string;
}

/** רשומת תחזית שמורה ב-DB */
export interface MLPredictionRecord {
  id: string;
  model_type: string;
  entity_type: string;
  entity_id: string;
  prediction: any;
  confidence: number;
  factors: any;
  created_at: Date;
  expires_at: Date;
}

// ============================================================================
// פונקציות עזר מתמטיות
// ============================================================================

/** ממוצע של מערך מספרים */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** סטיית תקן */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** רגרסיה ליניארית פשוטה - מחזירה slope ו-intercept */
function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };

  // x = אינדקס (0, 1, 2, ...), y = ערך
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: mean(values), r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // חישוב R² - מקדם הקביעה
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - yMean) ** 2;
    ssRes += (values[i] - (intercept + slope * i)) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/** החלקה מעריכית פשוטה (Simple Exponential Smoothing) */
function exponentialSmoothing(data: number[], alpha: number): number[] {
  if (data.length === 0) return [];
  const smoothed: number[] = [data[0]]; // הערך הראשון כבסיס
  for (let i = 1; i < data.length; i++) {
    smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
  }
  return smoothed;
}

/** החלקה מעריכית כפולה (Double Exponential Smoothing / Holt) - כוללת מגמה */
function holtSmoothing(
  data: number[],
  alpha: number = 0.3,
  beta: number = 0.1
): { level: number; trend: number; fitted: number[] } {
  if (data.length === 0) return { level: 0, trend: 0, fitted: [] };
  if (data.length === 1) return { level: data[0], trend: 0, fitted: [data[0]] };

  // אתחול
  let level = data[0];
  let trend = data[1] - data[0];
  const fitted: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level + trend);
  }

  return { level, trend, fitted };
}

/** ממוצע נע (Moving Average) */
function movingAverage(data: number[], window: number): number[] {
  if (data.length === 0 || window <= 0) return [];
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    result.push(mean(slice));
  }
  return result;
}

/** חישוב אחוזון z-score לרווח סמך */
function zScore(confidence: number): number {
  // ערכי z נפוצים לרווחי סמך
  const zMap: Record<number, number> = {
    0.80: 1.282,
    0.85: 1.440,
    0.90: 1.645,
    0.95: 1.960,
    0.99: 2.576,
  };
  // מציאת הערך הקרוב ביותר
  const closest = Object.keys(zMap)
    .map(Number)
    .reduce((prev, curr) => (Math.abs(curr - confidence) < Math.abs(prev - confidence) ? curr : prev));
  return zMap[closest] || 1.96;
}

/** חיתוך ערך לטווח */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** פורמט חודש מ-Date */
function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** הוספת חודשים ל-Date */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// ============================================================================
// 7. טבלת ml_predictions - יצירה ומנגנון קאש
// ============================================================================

/** יצירת טבלת ml_predictions אם לא קיימת */
export async function ensureMLPredictionsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      prediction JSONB NOT NULL DEFAULT '{}',
      confidence NUMERIC(5,4) DEFAULT 0,
      factors JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
    );

    -- אינדקסים לחיפוש מהיר של תחזיות שמורות
    CREATE INDEX IF NOT EXISTS idx_ml_pred_model_entity
      ON ml_predictions(model_type, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ml_pred_expires
      ON ml_predictions(expires_at);
  `);
}

/** שמירת תחזית בקאש */
async function cachePrediction(
  modelType: string,
  entityType: string,
  entityId: string,
  prediction: any,
  confidence: number,
  factors: any,
  ttlHours: number = 24
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO ml_predictions (model_type, entity_type, entity_id, prediction, confidence, factors, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' hours')::INTERVAL)
     RETURNING id`,
    [modelType, entityType, entityId, JSON.stringify(prediction), confidence, JSON.stringify(factors), String(ttlHours)]
  );
  return rows[0]?.id;
}

/** קריאת תחזית מהקאש (אם עדיין תקפה) */
async function getCachedPrediction(
  modelType: string,
  entityType: string,
  entityId: string
): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT prediction, confidence, factors, created_at
     FROM ml_predictions
     WHERE model_type = $1 AND entity_type = $2 AND entity_id = $3
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [modelType, entityType, entityId]
  );
  return rows[0] ?? null;
}

/** ניקוי תחזיות שפג תוקפן */
export async function cleanExpiredPredictions(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM ml_predictions WHERE expires_at < NOW()`
  );
  return rowCount ?? 0;
}

// ============================================================================
// 1. חיזוי ביקוש (Demand Forecasting)
// ============================================================================

/**
 * חיזוי ביקוש עתידי למוצר על בסיס נתוני מכירות היסטוריים.
 * משתמש ב-Holt Double Exponential Smoothing לזיהוי מגמה + רווח סמך.
 *
 * @param productId - מזהה המוצר
 * @param historicalMonths - מספר חודשים היסטוריים לניתוח (ברירת מחדל: 12)
 * @param forecastMonths - מספר חודשים לחיזוי קדימה (ברירת מחדל: 6)
 * @returns מערך תחזיות חודשיות עם רווחי סמך
 */
export async function forecastDemand(
  productId: string,
  historicalMonths: number = 12,
  forecastMonths: number = 6
): Promise<DemandForecast[]> {
  // בדיקת קאש קיים
  const cached = await getCachedPrediction("demand_forecast", "product", productId);
  if (cached) return cached.prediction;

  // שליפת נתוני מכירות חודשיים מה-DB
  const { rows: salesData } = await pool.query(
    `SELECT
       DATE_TRUNC('month', o.created_at) AS month,
       COALESCE(SUM(oi.quantity), 0)::int AS total_quantity
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.product_id = $1
       AND o.created_at >= NOW() - ($2 || ' months')::INTERVAL
       AND o.status NOT IN ('cancelled', 'refunded')
     GROUP BY DATE_TRUNC('month', o.created_at)
     ORDER BY month ASC`,
    [productId, String(historicalMonths)]
  );

  // אם אין מספיק נתונים, נחזיר תחזית אפסית עם ביטחון נמוך
  if (salesData.length < 3) {
    const avgQty = salesData.length > 0 ? mean(salesData.map((r: any) => Number(r.total_quantity))) : 0;
    const now = new Date();
    const forecasts: DemandForecast[] = [];
    for (let i = 1; i <= forecastMonths; i++) {
      const forecastDate = addMonths(now, i);
      forecasts.push({
        month: formatMonth(forecastDate),
        predicted: Math.round(avgQty),
        lower_bound: 0,
        upper_bound: Math.round(avgQty * 2),
        confidence: 0.3, // ביטחון נמוך - מעט נתונים
      });
    }
    await cachePrediction("demand_forecast", "product", productId, forecasts, 0.3, { method: "insufficient_data", dataPoints: salesData.length }, 12);
    return forecasts;
  }

  // מיצוי ערכי כמות
  const quantities: number[] = salesData.map((r: any) => Number(r.total_quantity));

  // החלקה מעריכית כפולה (Holt) - זיהוי רמה ומגמה
  const alpha = 0.3; // פרמטר החלקה לרמה
  const beta = 0.1;  // פרמטר החלקה למגמה
  const { level, trend, fitted } = holtSmoothing(quantities, alpha, beta);

  // חישוב שגיאת החיזוי (RMSE) על הנתונים ההיסטוריים
  let squaredErrors = 0;
  for (let i = 1; i < quantities.length; i++) {
    squaredErrors += (quantities[i] - fitted[i]) ** 2;
  }
  const rmse = Math.sqrt(squaredErrors / Math.max(1, quantities.length - 1));

  // חישוב סטיית תקן של השאריות (residuals)
  const residuals = quantities.map((q, i) => q - fitted[i]);
  const residualStd = stdDev(residuals);

  // זיהוי עונתיות פשוטה (אם יש מספיק נתונים)
  let seasonalFactors: number[] = new Array(12).fill(1.0);
  if (quantities.length >= 12) {
    const avgAll = mean(quantities);
    // חישוב גורם עונתי לכל חודש
    const monthlyBuckets: number[][] = Array.from({ length: 12 }, () => []);
    salesData.forEach((r: any, i: number) => {
      const monthIdx = new Date(r.month).getMonth();
      monthlyBuckets[monthIdx].push(quantities[i]);
    });
    seasonalFactors = monthlyBuckets.map((bucket) => {
      if (bucket.length === 0) return 1.0;
      return avgAll > 0 ? mean(bucket) / avgAll : 1.0;
    });
  }

  // יצירת תחזיות
  const now = new Date();
  const forecasts: DemandForecast[] = [];
  const z95 = zScore(0.95);

  for (let i = 1; i <= forecastMonths; i++) {
    const forecastDate = addMonths(now, i);
    const monthIdx = forecastDate.getMonth();

    // תחזית בסיסית: רמה + מגמה * מספר צעדים
    let predicted = (level + trend * i) * seasonalFactors[monthIdx];
    predicted = Math.max(0, Math.round(predicted)); // לא יכול להיות שלילי

    // רווח סמך מתרחב ככל שמתרחקים מהנתונים
    const forecastStd = residualStd * Math.sqrt(1 + i * 0.15);
    const margin = z95 * forecastStd;

    // ביטחון יורד ככל שמחזים רחוק יותר
    const confidence = clamp(0.95 - i * 0.05, 0.5, 0.95);

    forecasts.push({
      month: formatMonth(forecastDate),
      predicted,
      lower_bound: Math.max(0, Math.round(predicted - margin)),
      upper_bound: Math.round(predicted + margin),
      confidence,
    });
  }

  // שמירה בקאש
  await cachePrediction(
    "demand_forecast", "product", productId,
    forecasts,
    forecasts.length > 0 ? mean(forecasts.map((f) => f.confidence)) : 0,
    { method: "holt_exponential_smoothing", alpha, beta, rmse, dataPoints: quantities.length, trend },
    24
  );

  return forecasts;
}

// ============================================================================
// 2. אופטימיזציית תמחור דינמי (Dynamic Pricing Optimization)
// ============================================================================

/**
 * אופטימיזציית מחיר למוצר על בסיס ניתוח גמישות מחיר.
 * מנתח את הקשר בין שינויי מחיר לנפח מכירות.
 *
 * @param productId - מזהה המוצר
 * @returns המלצת מחיר אופטימלית
 */
export async function optimizePrice(productId: string): Promise<PriceOptimization> {
  // בדיקת קאש
  const cached = await getCachedPrediction("price_optimization", "product", productId);
  if (cached) return cached.prediction;

  // שליפת נתוני מחיר ומכירות לאורך זמן
  const { rows: priceHistory } = await pool.query(
    `SELECT
       oi.unit_price AS price,
       SUM(oi.quantity)::int AS quantity_sold,
       DATE_TRUNC('week', o.created_at) AS period
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.product_id = $1
       AND o.created_at >= NOW() - INTERVAL '6 months'
       AND o.status NOT IN ('cancelled', 'refunded')
     GROUP BY oi.unit_price, DATE_TRUNC('week', o.created_at)
     ORDER BY period ASC`,
    [productId]
  );

  // שליפת מחיר נוכחי ומלאי
  const { rows: productInfo } = await pool.query(
    `SELECT
       p.price AS current_price,
       COALESCE(p.cost_price, p.price * 0.6) AS cost_price,
       COALESCE(inv.quantity_on_hand, 0) AS stock_level
     FROM products p
     LEFT JOIN inventory inv ON inv.product_id = p.id
     WHERE p.id = $1
     LIMIT 1`,
    [productId]
  );

  const currentPrice = Number(productInfo[0]?.current_price ?? 0);
  const costPrice = Number(productInfo[0]?.cost_price ?? currentPrice * 0.6);
  const stockLevel = Number(productInfo[0]?.stock_level ?? 0);

  if (currentPrice === 0 || priceHistory.length < 2) {
    // אין מספיק נתונים לחישוב
    const result: PriceOptimization = {
      currentPrice,
      suggestedPrice: currentPrice,
      expectedRevenueLift: 0,
      elasticity: -1, // ברירת מחדל: גמישות יחידתית
      demandAtCurrent: priceHistory.length > 0 ? mean(priceHistory.map((r: any) => Number(r.quantity_sold))) : 0,
      demandAtSuggested: priceHistory.length > 0 ? mean(priceHistory.map((r: any) => Number(r.quantity_sold))) : 0,
    };
    return result;
  }

  // חישוב גמישות מחיר (Price Elasticity of Demand)
  // E = (% שינוי בכמות) / (% שינוי במחיר)
  const prices: number[] = priceHistory.map((r: any) => Number(r.price));
  const quantities: number[] = priceHistory.map((r: any) => Number(r.quantity_sold));

  // שימוש ברגרסיה log-log לחישוב גמישות
  // ln(Q) = a + E * ln(P)
  const logPrices = prices.map((p) => Math.log(Math.max(p, 0.01)));
  const logQuantities = quantities.map((q) => Math.log(Math.max(q, 0.01)));

  // רגרסיה ליניארית על הלוגריתמים
  const n = logPrices.length;
  let sumLP = 0, sumLQ = 0, sumLPLQ = 0, sumLP2 = 0;
  for (let i = 0; i < n; i++) {
    sumLP += logPrices[i];
    sumLQ += logQuantities[i];
    sumLPLQ += logPrices[i] * logQuantities[i];
    sumLP2 += logPrices[i] ** 2;
  }
  const denom = n * sumLP2 - sumLP * sumLP;
  // גמישות = slope של הרגרסיה הלוגריתמית
  let elasticity = denom !== 0 ? (n * sumLPLQ - sumLP * sumLQ) / denom : -1;

  // גמישות צפויה להיות שלילית (מחיר עולה -> ביקוש יורד)
  if (elasticity > 0) elasticity = -elasticity;
  elasticity = clamp(elasticity, -5, -0.1); // הגבלת טווח סביר

  // ביקוש ממוצע במחיר נוכחי
  const avgDemand = mean(quantities);

  // מציאת מחיר אופטימלי שממקסם רווח
  // רווח = (P - C) * Q(P)
  // Q(P) = Q0 * (P/P0)^E  (מודל גמישות קבועה)
  // dProfit/dP = 0 => P_optimal = C * E / (E + 1)
  let optimalPrice: number;
  if (elasticity < -1) {
    // גמישות גבוהה: נוסחת אופטימום
    optimalPrice = costPrice * elasticity / (elasticity + 1);
  } else {
    // גמישות נמוכה: ניתן להעלות מחיר
    optimalPrice = currentPrice * 1.1; // העלאה של 10%
  }

  // התאמה למלאי - אם מלאי גבוה, נוריד מחיר; אם נמוך, נעלה
  const avgMonthlyDemand = avgDemand * 4; // הערכת ביקוש חודשי מנתונים שבועיים
  const monthsOfStock = avgMonthlyDemand > 0 ? stockLevel / avgMonthlyDemand : 999;

  if (monthsOfStock > 6) {
    // מלאי עודף - לחץ להוריד מחיר
    optimalPrice *= 0.92;
  } else if (monthsOfStock < 1) {
    // מחסור - ניתן להעלות
    optimalPrice *= 1.08;
  }

  // הגבלת שינוי מחיר מקסימלי של 25%
  const suggestedPrice = clamp(
    Math.round(optimalPrice * 100) / 100,
    currentPrice * 0.75,
    currentPrice * 1.25
  );

  // חישוב ביקוש צפוי במחיר החדש
  const demandAtSuggested = avgDemand * Math.pow(suggestedPrice / currentPrice, elasticity);

  // חישוב שיפור צפוי בהכנסות
  const currentRevenue = currentPrice * avgDemand;
  const suggestedRevenue = suggestedPrice * demandAtSuggested;
  const revenueLift = currentRevenue > 0 ? ((suggestedRevenue - currentRevenue) / currentRevenue) * 100 : 0;

  const result: PriceOptimization = {
    currentPrice,
    suggestedPrice,
    expectedRevenueLift: Math.round(revenueLift * 100) / 100,
    elasticity: Math.round(elasticity * 1000) / 1000,
    demandAtCurrent: Math.round(avgDemand * 100) / 100,
    demandAtSuggested: Math.round(demandAtSuggested * 100) / 100,
  };

  // שמירה בקאש
  await cachePrediction(
    "price_optimization", "product", productId,
    result,
    0.7,
    { elasticity, costPrice, stockLevel, monthsOfStock, dataPoints: priceHistory.length },
    12
  );

  return result;
}

// ============================================================================
// 3. חיזוי נטישת לקוחות (Customer Churn Prediction)
// ============================================================================

/**
 * חיזוי סיכון נטישה ללקוחות.
 * משתמש במודל ציון משוקלל על בסיס מספר גורמים.
 *
 * @param customerId - מזהה לקוח ספציפי (אופציונלי - אם לא ניתן, מנתח את כל הלקוחות)
 * @returns מערך תחזיות נטישה
 */
export async function predictChurn(customerId?: string): Promise<ChurnPrediction[]> {
  // בדיקת קאש ללקוח ספציפי
  if (customerId) {
    const cached = await getCachedPrediction("churn_prediction", "customer", customerId);
    if (cached) return [cached.prediction];
  }

  // שליפת נתוני לקוחות מה-DB
  const customerFilter = customerId ? `AND c.id = $1` : "";
  const params = customerId ? [customerId] : [];

  const { rows: customerData } = await pool.query(
    `SELECT
       c.id AS customer_id,
       c.name AS customer_name,

       -- ימים מאז ההזמנה האחרונה
       COALESCE(EXTRACT(DAY FROM NOW() - MAX(o.created_at)), 365)::int AS days_since_last_order,

       -- מספר הזמנות בסה"כ
       COUNT(DISTINCT o.id)::int AS total_orders,

       -- מספר הזמנות ב-3 חודשים אחרונים
       COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '3 months' THEN o.id END)::int AS recent_orders,

       -- מספר הזמנות ב-3 חודשים שלפני כן (3-6 חודשים)
       COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '6 months'
             AND o.created_at < NOW() - INTERVAL '3 months' THEN o.id END)::int AS prev_period_orders,

       -- ממוצע ערך הזמנה אחרון לעומת כללי
       COALESCE(AVG(CASE WHEN o.created_at >= NOW() - INTERVAL '3 months' THEN o.total_amount END), 0)::numeric AS recent_avg_value,
       COALESCE(AVG(o.total_amount), 0)::numeric AS overall_avg_value,

       -- מספר תלונות / סטטוס "complaint"
       COUNT(DISTINCT CASE WHEN o.status IN ('complaint', 'disputed', 'returned') THEN o.id END)::int AS complaint_count,

       -- עיכובי תשלום (הזמנות עם סטטוס overdue)
       COUNT(DISTINCT CASE WHEN o.payment_status IN ('overdue', 'late', 'pending')
             AND o.created_at < NOW() - INTERVAL '30 days' THEN o.id END)::int AS payment_delays,

       -- תאריך יצירת הלקוח
       c.created_at AS customer_since

     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled'
     WHERE 1=1 ${customerFilter}
     GROUP BY c.id, c.name, c.created_at
     HAVING COUNT(DISTINCT o.id) > 0
     ORDER BY MAX(o.created_at) ASC NULLS FIRST`,
    params
  );

  // משקולות הגורמים - ניתן לכוונן
  const WEIGHTS = {
    days_since_last_order: 0.30,    // הגורם החזק ביותר
    order_frequency_decline: 0.25,   // ירידה בתדירות
    avg_order_value_trend: 0.15,     // מגמת ערך הזמנה
    complaint_count: 0.15,           // תלונות
    payment_delays: 0.15,            // עיכובי תשלום
  };

  const predictions: ChurnPrediction[] = [];

  for (const row of customerData) {
    const factors: ChurnFactor[] = [];

    // === גורם 1: ימים מאז ההזמנה האחרונה ===
    // נורמליזציה: 0-30 ימים = נמוך, 30-90 = בינוני, 90+ = גבוה
    const daysSince = Number(row.days_since_last_order);
    let daysScore: number;
    if (daysSince <= 30) daysScore = daysSince / 90;     // 0 - 0.33
    else if (daysSince <= 90) daysScore = 0.33 + (daysSince - 30) / 90; // 0.33 - 1.0
    else daysScore = clamp(0.7 + (daysSince - 90) / 300, 0.7, 1.0);    // 0.7 - 1.0

    factors.push({
      name: "days_since_last_order",
      value: daysSince,
      weight: WEIGHTS.days_since_last_order,
      impact: daysScore * WEIGHTS.days_since_last_order,
      description: `${daysSince} ימים מאז ההזמנה האחרונה`,
    });

    // === גורם 2: ירידה בתדירות הזמנות ===
    const recentOrders = Number(row.recent_orders);
    const prevOrders = Number(row.prev_period_orders);
    let freqDeclineScore: number;
    if (prevOrders === 0 && recentOrders === 0) {
      freqDeclineScore = 0.8; // אין פעילות כלל
    } else if (prevOrders === 0) {
      freqDeclineScore = 0.1; // לקוח חדש
    } else {
      const declineRate = 1 - (recentOrders / prevOrders);
      freqDeclineScore = clamp(declineRate, 0, 1);
    }

    factors.push({
      name: "order_frequency_decline",
      value: freqDeclineScore,
      weight: WEIGHTS.order_frequency_decline,
      impact: freqDeclineScore * WEIGHTS.order_frequency_decline,
      description: `הזמנות אחרונות: ${recentOrders}, תקופה קודמת: ${prevOrders}`,
    });

    // === גורם 3: מגמת ערך הזמנה ===
    const recentAvg = Number(row.recent_avg_value);
    const overallAvg = Number(row.overall_avg_value);
    let valueTrendScore: number;
    if (overallAvg === 0) {
      valueTrendScore = 0.5;
    } else {
      const valueChange = (recentAvg - overallAvg) / overallAvg;
      // ירידה בערך ההזמנה = סיכון גבוה יותר
      valueTrendScore = clamp(-valueChange, 0, 1);
    }

    factors.push({
      name: "avg_order_value_trend",
      value: recentAvg,
      weight: WEIGHTS.avg_order_value_trend,
      impact: valueTrendScore * WEIGHTS.avg_order_value_trend,
      description: `ממוצע אחרון: ${recentAvg.toFixed(0)}, כללי: ${overallAvg.toFixed(0)}`,
    });

    // === גורם 4: מספר תלונות ===
    const complaints = Number(row.complaint_count);
    const totalOrders = Number(row.total_orders);
    const complaintRate = totalOrders > 0 ? complaints / totalOrders : 0;
    const complaintScore = clamp(complaintRate * 5, 0, 1); // כל 20% תלונות = ציון 1.0

    factors.push({
      name: "complaint_count",
      value: complaints,
      weight: WEIGHTS.complaint_count,
      impact: complaintScore * WEIGHTS.complaint_count,
      description: `${complaints} תלונות מתוך ${totalOrders} הזמנות`,
    });

    // === גורם 5: עיכובי תשלום ===
    const delays = Number(row.payment_delays);
    const delayScore = clamp(delays * 0.25, 0, 1); // כל עיכוב מוסיף 0.25

    factors.push({
      name: "payment_delays",
      value: delays,
      weight: WEIGHTS.payment_delays,
      impact: delayScore * WEIGHTS.payment_delays,
      description: `${delays} עיכובי תשלום`,
    });

    // חישוב ציון נטישה כולל (סכום משוקלל)
    const churnRisk = clamp(
      factors.reduce((sum, f) => sum + f.impact, 0),
      0,
      1
    );

    // יצירת המלצה על בסיס רמת הסיכון
    let recommendation: string;
    if (churnRisk >= 0.7) {
      recommendation = "סיכון נטישה גבוה מאוד - יש ליצור קשר אישי מיידי, להציע הנחה ייחודית או תוכנית נאמנות";
    } else if (churnRisk >= 0.5) {
      recommendation = "סיכון נטישה בינוני-גבוה - מומלץ לשלוח מבצע ממוקד ולבדוק שביעות רצון";
    } else if (churnRisk >= 0.3) {
      recommendation = "סיכון נטישה בינוני - לשלוח תוכן רלוונטי ולשמור על קשר קבוע";
    } else {
      recommendation = "סיכון נטישה נמוך - להמשיך בפעילות שוטפת, לקוח פעיל ומרוצה";
    }

    const prediction: ChurnPrediction = {
      customerId: row.customer_id,
      customerName: row.customer_name ?? "ללא שם",
      churnRisk: Math.round(churnRisk * 1000) / 1000,
      factors: factors.sort((a, b) => b.impact - a.impact), // מיון לפי השפעה
      recommendation,
    };

    predictions.push(prediction);

    // שמירה בקאש ללקוח ספציפי
    if (customerId) {
      await cachePrediction(
        "churn_prediction", "customer", row.customer_id,
        prediction, 1 - churnRisk,
        { weights: WEIGHTS, totalOrders, daysSince },
        48
      );
    }
  }

  // מיון לפי סיכון נטישה (גבוה ביותר קודם)
  predictions.sort((a, b) => b.churnRisk - a.churnRisk);

  return predictions;
}

// ============================================================================
// 4. חיזוי תזרים מזומנים (Cash Flow Forecasting)
// ============================================================================

/**
 * חיזוי תזרים מזומנים עתידי על בסיס נתונים היסטוריים.
 * מנתח הכנסות, הוצאות, חייבים, זכאים ודפוסים עונתיים.
 *
 * @param months - מספר חודשים לחיזוי (ברירת מחדל: 6)
 * @returns מערך תחזיות תזרים חודשיות
 */
export async function forecastCashflow(months: number = 6): Promise<CashflowForecast[]> {
  // בדיקת קאש
  const cached = await getCachedPrediction("cashflow_forecast", "company", "global");
  if (cached) return cached.prediction;

  // שליפת הכנסות חודשיות (12 חודשים אחרונים)
  const { rows: inflowData } = await pool.query(
    `SELECT
       DATE_TRUNC('month', created_at) AS month,
       COALESCE(SUM(total_amount), 0)::numeric AS total_inflow
     FROM orders
     WHERE status NOT IN ('cancelled', 'refunded')
       AND created_at >= NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month ASC`
  );

  // שליפת הוצאות חודשיות
  const { rows: outflowData } = await pool.query(
    `SELECT
       DATE_TRUNC('month', created_at) AS month,
       COALESCE(SUM(amount), 0)::numeric AS total_outflow
     FROM expenses
     WHERE created_at >= NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month ASC`
  );

  // שליפת יתרת חייבים (AR) - כסף שעוד צריך להגיע
  const { rows: arData } = await pool.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN payment_status IN ('pending', 'overdue', 'partial') THEN total_amount - COALESCE(paid_amount, 0)
         ELSE 0
       END
     ), 0)::numeric AS ar_balance
     FROM invoices
     WHERE status != 'cancelled'`
  );

  // שליפת יתרת זכאים (AP) - כסף שצריך לשלם
  const { rows: apData } = await pool.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN payment_status IN ('pending', 'overdue', 'partial') THEN amount - COALESCE(paid_amount, 0)
         ELSE 0
       END
     ), 0)::numeric AS ap_balance
     FROM bills
     WHERE status != 'cancelled'`
  );

  const arBalance = Number(arData[0]?.ar_balance ?? 0);
  const apBalance = Number(apData[0]?.ap_balance ?? 0);

  // מיצוי ערכים
  const inflowValues = inflowData.map((r: any) => Number(r.total_inflow));
  const outflowValues = outflowData.map((r: any) => Number(r.total_outflow));

  // ממוצע נע + מגמה להכנסות
  const inflowSmooth = inflowValues.length >= 3
    ? holtSmoothing(inflowValues, 0.3, 0.1)
    : { level: mean(inflowValues), trend: 0, fitted: inflowValues };

  // ממוצע נע + מגמה להוצאות
  const outflowSmooth = outflowValues.length >= 3
    ? holtSmoothing(outflowValues, 0.3, 0.1)
    : { level: mean(outflowValues), trend: 0, fitted: outflowValues };

  // סטיית תקן לרווח סמך
  const inflowStd = stdDev(inflowValues);
  const outflowStd = stdDev(outflowValues);

  // חישוב גורמי עונתיות
  const inflowSeasonal = new Array(12).fill(1.0);
  const outflowSeasonal = new Array(12).fill(1.0);
  if (inflowValues.length >= 6) {
    const avgInflow = mean(inflowValues);
    inflowData.forEach((r: any, i: number) => {
      const mi = new Date(r.month).getMonth();
      if (avgInflow > 0) inflowSeasonal[mi] = inflowValues[i] / avgInflow;
    });
  }

  // תחזיות
  const now = new Date();
  let runningBalance = arBalance - apBalance; // יתרת פתיחה נטו
  const forecasts: CashflowForecast[] = [];

  for (let i = 1; i <= months; i++) {
    const forecastDate = addMonths(now, i);
    const monthIdx = forecastDate.getMonth();

    // תחזית הכנסות: רמה + מגמה, מותאמת לעונתיות
    let projectedInflow = (inflowSmooth.level + inflowSmooth.trend * i) * inflowSeasonal[monthIdx];
    projectedInflow = Math.max(0, projectedInflow);

    // בחודש הראשון, מוסיפים חלק מה-AR שצפוי להגבות
    if (i === 1) {
      projectedInflow += arBalance * 0.6; // 60% מהחייבים צפויים להגבות בחודש הקרוב
    } else if (i === 2) {
      projectedInflow += arBalance * 0.25;
    }

    // תחזית הוצאות: רמה + מגמה
    let projectedOutflow = (outflowSmooth.level + outflowSmooth.trend * i) * outflowSeasonal[monthIdx];
    projectedOutflow = Math.max(0, projectedOutflow);

    // בחודש הראשון, מוסיפים AP שצריך לשלם
    if (i === 1) {
      projectedOutflow += apBalance * 0.7;
    } else if (i === 2) {
      projectedOutflow += apBalance * 0.2;
    }

    runningBalance += projectedInflow - projectedOutflow;

    // ביטחון יורד עם הזמן
    const confidence = clamp(0.9 - (i - 1) * 0.07, 0.45, 0.9);

    forecasts.push({
      month: formatMonth(forecastDate),
      projected_inflow: Math.round(projectedInflow * 100) / 100,
      projected_outflow: Math.round(projectedOutflow * 100) / 100,
      projected_balance: Math.round(runningBalance * 100) / 100,
      confidence,
    });
  }

  // שמירה בקאש
  await cachePrediction(
    "cashflow_forecast", "company", "global",
    forecasts,
    forecasts.length > 0 ? mean(forecasts.map((f) => f.confidence)) : 0,
    {
      arBalance, apBalance,
      inflowTrend: inflowSmooth.trend,
      outflowTrend: outflowSmooth.trend,
      inflowDataPoints: inflowValues.length,
      outflowDataPoints: outflowValues.length,
    },
    12
  );

  return forecasts;
}

// ============================================================================
// 5. חיזוי פגמי איכות (Quality Defect Prediction)
// ============================================================================

/**
 * חיזוי הסתברות לפגמים בייצור על בסיס מספר גורמי סיכון.
 * מנתח גיל מכונה, תחזוקה, היסטוריית פגמים, ופרמטרים תפעוליים.
 *
 * @param machineId - מזהה מכונה ספציפית (אופציונלי)
 * @returns מערך תחזיות פגמים למכונות
 */
export async function predictDefects(machineId?: string): Promise<DefectPrediction[]> {
  // בדיקת קאש
  if (machineId) {
    const cached = await getCachedPrediction("defect_prediction", "machine", machineId);
    if (cached) return [cached.prediction];
  }

  const machineFilter = machineId ? `AND m.id = $1` : "";
  const params = machineId ? [machineId] : [];

  // שליפת נתוני מכונות ופגמים
  const { rows: machineData } = await pool.query(
    `SELECT
       m.id AS machine_id,
       m.name AS machine_name,

       -- גיל המכונה בימים
       COALESCE(EXTRACT(DAY FROM NOW() - m.installed_at), 365)::int AS machine_age_days,

       -- שעות מאז תחזוקה אחרונה
       COALESCE(
         EXTRACT(EPOCH FROM NOW() - (
           SELECT MAX(completed_at) FROM maintenance_logs WHERE machine_id = m.id
         )) / 3600,
         1000
       )::int AS hours_since_maintenance,

       -- מרווח תחזוקה מומלץ (שעות)
       COALESCE(m.maintenance_interval_hours, 500) AS maintenance_interval,

       -- שיעור פגמים אחרון (30 יום)
       COALESCE(
         (SELECT COUNT(*)::numeric FROM defect_reports
          WHERE machine_id = m.id AND created_at >= NOW() - INTERVAL '30 days'),
         0
       ) AS recent_defects_30d,

       -- סה"כ יחידות שיוצרו ב-30 יום
       COALESCE(
         (SELECT SUM(quantity_produced)::numeric FROM production_runs
          WHERE machine_id = m.id AND created_at >= NOW() - INTERVAL '30 days'),
         1
       ) AS recent_production_30d,

       -- שיעור פגמים היסטורי (90 יום)
       COALESCE(
         (SELECT COUNT(*)::numeric FROM defect_reports
          WHERE machine_id = m.id AND created_at >= NOW() - INTERVAL '90 days'),
         0
       ) AS defects_90d,

       -- סה"כ יחידות ב-90 יום
       COALESCE(
         (SELECT SUM(quantity_produced)::numeric FROM production_runs
          WHERE machine_id = m.id AND created_at >= NOW() - INTERVAL '90 days'),
         1
       ) AS production_90d,

       -- טמפרטורה אחרונה (אם קיים חיישן)
       (SELECT value::numeric FROM sensor_readings
        WHERE machine_id = m.id AND sensor_type = 'temperature'
        ORDER BY created_at DESC LIMIT 1) AS last_temperature,

       -- טמפרטורה תקינה
       COALESCE(m.normal_temperature, 60) AS normal_temperature,

       -- ניסיון המפעיל (חודשים)
       COALESCE(
         (SELECT EXTRACT(MONTH FROM AGE(NOW(), u.created_at))::int
          FROM users u
          WHERE u.id = m.current_operator_id),
         12
       ) AS operator_experience_months

     FROM machines m
     WHERE m.status = 'active' ${machineFilter}
     ORDER BY m.name`,
    params
  );

  // משקולות לגורמי סיכון
  const RISK_WEIGHTS = {
    machine_age: 0.10,
    maintenance_overdue: 0.30,
    recent_defect_rate: 0.25,
    defect_trend: 0.15,
    temperature_deviation: 0.10,
    operator_experience: 0.10,
  };

  const predictions: DefectPrediction[] = [];

  for (const row of machineData) {
    const riskFactors: DefectFactor[] = [];

    // === גורם 1: גיל המכונה ===
    const ageYears = Number(row.machine_age_days) / 365;
    // מכונות ישנות יותר = סיכון גבוה יותר (עקומת Bathtub)
    const ageRisk = clamp(ageYears / 10, 0, 1); // 10 שנים = סיכון מקסימלי

    riskFactors.push({
      name: "machine_age",
      value: Number(row.machine_age_days),
      threshold: 3650, // 10 שנים
      riskContribution: ageRisk * RISK_WEIGHTS.machine_age,
      description: `גיל מכונה: ${ageYears.toFixed(1)} שנים`,
    });

    // === גורם 2: שעות מאז תחזוקה ===
    const hoursSinceMaint = Number(row.hours_since_maintenance);
    const maintInterval = Number(row.maintenance_interval);
    const maintRatio = hoursSinceMaint / Math.max(maintInterval, 1);
    // אם עבר את מרווח התחזוקה, הסיכון עולה באופן מעריכי
    const maintRisk = clamp(
      maintRatio > 1 ? 0.5 + 0.5 * (1 - Math.exp(-(maintRatio - 1))) : maintRatio * 0.5,
      0, 1
    );

    riskFactors.push({
      name: "maintenance_overdue",
      value: hoursSinceMaint,
      threshold: maintInterval,
      riskContribution: maintRisk * RISK_WEIGHTS.maintenance_overdue,
      description: `${hoursSinceMaint} שעות מאז תחזוקה (מרווח מומלץ: ${maintInterval})`,
    });

    // === גורם 3: שיעור פגמים אחרון ===
    const recentDefects = Number(row.recent_defects_30d);
    const recentProduction = Number(row.recent_production_30d);
    const recentDefectRate = recentProduction > 0 ? recentDefects / recentProduction : 0;
    // שיעור פגמים מעל 2% = סיכון גבוה
    const defectRateRisk = clamp(recentDefectRate / 0.02, 0, 1);

    riskFactors.push({
      name: "recent_defect_rate",
      value: recentDefectRate,
      threshold: 0.02, // 2% סף התראה
      riskContribution: defectRateRisk * RISK_WEIGHTS.recent_defect_rate,
      description: `שיעור פגמים (30 יום): ${(recentDefectRate * 100).toFixed(2)}%`,
    });

    // === גורם 4: מגמת פגמים (30 יום vs 90 יום) ===
    const defects90 = Number(row.defects_90d);
    const production90 = Number(row.production_90d);
    const historicDefectRate = production90 > 0 ? defects90 / production90 : 0;
    let trendRisk: number;
    if (historicDefectRate === 0) {
      trendRisk = recentDefectRate > 0 ? 0.8 : 0; // פגמים חדשים = מדאיג
    } else {
      const rateChange = (recentDefectRate - historicDefectRate) / historicDefectRate;
      trendRisk = clamp(rateChange, 0, 1); // רק עלייה = סיכון
    }

    riskFactors.push({
      name: "defect_trend",
      value: recentDefectRate - historicDefectRate,
      threshold: 0,
      riskContribution: trendRisk * RISK_WEIGHTS.defect_trend,
      description: `מגמת פגמים: ${recentDefectRate > historicDefectRate ? "עלייה" : "ירידה/יציבות"}`,
    });

    // === גורם 5: סטייה מטמפרטורה תקינה ===
    const lastTemp = row.last_temperature ? Number(row.last_temperature) : null;
    const normalTemp = Number(row.normal_temperature);
    let tempRisk = 0;
    if (lastTemp !== null) {
      const tempDeviation = Math.abs(lastTemp - normalTemp) / normalTemp;
      // סטייה של 20% ומעלה = סיכון גבוה
      tempRisk = clamp(tempDeviation / 0.2, 0, 1);
    }

    riskFactors.push({
      name: "temperature_deviation",
      value: lastTemp ?? normalTemp,
      threshold: normalTemp,
      riskContribution: tempRisk * RISK_WEIGHTS.temperature_deviation,
      description: lastTemp !== null
        ? `טמפרטורה: ${lastTemp}° (תקין: ${normalTemp}°)`
        : "אין נתוני טמפרטורה",
    });

    // === גורם 6: ניסיון מפעיל ===
    const operatorMonths = Number(row.operator_experience_months);
    // מפעיל עם פחות מ-6 חודשי ניסיון = סיכון גבוה יותר
    const operatorRisk = clamp(1 - operatorMonths / 12, 0, 1);

    riskFactors.push({
      name: "operator_experience",
      value: operatorMonths,
      threshold: 12, // 12 חודשים כינוי "מנוסה"
      riskContribution: operatorRisk * RISK_WEIGHTS.operator_experience,
      description: `ניסיון מפעיל: ${operatorMonths} חודשים`,
    });

    // חישוב הסתברות פגם כוללת
    const defectProbability = clamp(
      riskFactors.reduce((sum, f) => sum + f.riskContribution, 0),
      0, 1
    );

    // מיון גורמי סיכון לפי תרומה
    riskFactors.sort((a, b) => b.riskContribution - a.riskContribution);

    // יצירת המלצה
    let recommendation: string;
    if (defectProbability >= 0.7) {
      recommendation = "סיכון גבוה מאוד - מומלץ לעצור ייצור ולבצע תחזוקה מונעת מיידית";
    } else if (defectProbability >= 0.5) {
      recommendation = "סיכון גבוה - לתכנן תחזוקה בהקדם ולהגביר בדיקות איכות";
    } else if (defectProbability >= 0.3) {
      recommendation = "סיכון בינוני - לעקוב אחר מדדי האיכות ולוודא תחזוקה בזמן";
    } else {
      recommendation = "סיכון נמוך - המכונה במצב תקין, להמשיך בתחזוקה שוטפת";
    }

    const prediction: DefectPrediction = {
      machineId: row.machine_id,
      machineName: row.machine_name ?? "ללא שם",
      defectProbability: Math.round(defectProbability * 1000) / 1000,
      topRiskFactors: riskFactors.slice(0, 3), // 3 גורמים מובילים
      recommendation,
    };

    predictions.push(prediction);

    // שמירה בקאש
    if (machineId) {
      await cachePrediction(
        "defect_prediction", "machine", row.machine_id,
        prediction, 1 - defectProbability,
        { weights: RISK_WEIGHTS, allFactors: riskFactors },
        8 // קאש קצר יותר - נתוני איכות משתנים מהר
      );
    }
  }

  // מיון לפי הסתברות פגם (גבוה ביותר קודם)
  predictions.sort((a, b) => b.defectProbability - a.defectProbability);

  return predictions;
}

// ============================================================================
// 6. מנוע המלצות (Recommendation Engine)
// ============================================================================

/**
 * המלצות מוצרים ללקוח על בסיס סינון שיתופי (Collaborative Filtering) פשוט.
 * מנתח היסטוריית רכישות, דמיון ללקוחות אחרים, וזיקה בין מוצרים.
 *
 * @param customerId - מזהה הלקוח
 * @returns מערך המלצות מוצרים ממוינות לפי ציון
 */
export async function recommendProducts(customerId: string): Promise<ProductRecommendation[]> {
  // בדיקת קאש
  const cached = await getCachedPrediction("product_recommendation", "customer", customerId);
  if (cached) return cached.prediction;

  // שלב 1: שליפת המוצרים שהלקוח כבר קנה
  const { rows: purchasedProducts } = await pool.query(
    `SELECT DISTINCT oi.product_id
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.customer_id = $1 AND o.status NOT IN ('cancelled', 'refunded')`,
    [customerId]
  );
  const purchasedSet = new Set(purchasedProducts.map((r: any) => r.product_id));

  // שלב 2: סינון שיתופי - מציאת לקוחות דומים (שקנו מוצרים זהים)
  const { rows: similarCustomerProducts } = await pool.query(
    `WITH customer_products AS (
       SELECT DISTINCT oi.product_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1 AND o.status NOT IN ('cancelled', 'refunded')
     ),
     similar_customers AS (
       SELECT o.customer_id, COUNT(DISTINCT oi.product_id)::int AS common_products
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.product_id IN (SELECT product_id FROM customer_products)
         AND o.customer_id != $1
         AND o.status NOT IN ('cancelled', 'refunded')
       GROUP BY o.customer_id
       HAVING COUNT(DISTINCT oi.product_id) >= 2
       ORDER BY common_products DESC
       LIMIT 50
     )
     SELECT
       oi.product_id,
       p.name AS product_name,
       COUNT(DISTINCT o.customer_id)::int AS bought_by_similar,
       sc.common_products AS similarity_score,
       AVG(oi.quantity)::numeric AS avg_quantity
     FROM similar_customers sc
     JOIN orders o ON o.customer_id = sc.customer_id AND o.status NOT IN ('cancelled', 'refunded')
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE oi.product_id NOT IN (SELECT product_id FROM customer_products)
       AND p.status = 'active'
     GROUP BY oi.product_id, p.name, sc.common_products
     ORDER BY bought_by_similar DESC, sc.common_products DESC
     LIMIT 30`,
    [customerId]
  );

  // שלב 3: זיקה בין מוצרים (Product Affinity) - מוצרים שנקנים יחד
  const { rows: affinityProducts } = await pool.query(
    `WITH customer_products AS (
       SELECT DISTINCT oi.product_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1 AND o.status NOT IN ('cancelled', 'refunded')
     )
     SELECT
       oi2.product_id,
       p.name AS product_name,
       COUNT(DISTINCT o.id)::int AS co_purchase_count
     FROM customer_products cp
     JOIN order_items oi1 ON oi1.product_id = cp.product_id
     JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != cp.product_id
     JOIN orders o ON o.id = oi1.order_id AND o.status NOT IN ('cancelled', 'refunded')
     JOIN products p ON p.id = oi2.product_id AND p.status = 'active'
     WHERE oi2.product_id NOT IN (SELECT product_id FROM customer_products)
     GROUP BY oi2.product_id, p.name
     ORDER BY co_purchase_count DESC
     LIMIT 20`,
    [customerId]
  );

  // שלב 4: מוצרים פופולריים (Fallback) - אם אין מספיק המלצות
  const { rows: popularProducts } = await pool.query(
    `SELECT
       oi.product_id,
       p.name AS product_name,
       COUNT(DISTINCT o.id)::int AS order_count,
       SUM(oi.quantity)::int AS total_sold
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id AND p.status = 'active'
     WHERE o.created_at >= NOW() - INTERVAL '3 months'
       AND o.status NOT IN ('cancelled', 'refunded')
     GROUP BY oi.product_id, p.name
     ORDER BY order_count DESC
     LIMIT 20`
  );

  // שלב 5: חישוב ציונים משולבים
  const scoreMap = new Map<string, { name: string; score: number; reasons: string[] }>();

  // ציון מלקוחות דומים (משקל: 0.5)
  const maxSimilar = similarCustomerProducts.length > 0
    ? Math.max(...similarCustomerProducts.map((r: any) => Number(r.bought_by_similar)))
    : 1;

  for (const row of similarCustomerProducts) {
    const pid = row.product_id;
    if (purchasedSet.has(pid)) continue;

    const normalizedScore = Number(row.bought_by_similar) / maxSimilar;
    const existing = scoreMap.get(pid) ?? { name: row.product_name, score: 0, reasons: [] };
    existing.score += normalizedScore * 0.5;
    existing.reasons.push(`נרכש על ידי ${row.bought_by_similar} לקוחות דומים`);
    scoreMap.set(pid, existing);
  }

  // ציון מזיקה (משקל: 0.35)
  const maxAffinity = affinityProducts.length > 0
    ? Math.max(...affinityProducts.map((r: any) => Number(r.co_purchase_count)))
    : 1;

  for (const row of affinityProducts) {
    const pid = row.product_id;
    if (purchasedSet.has(pid)) continue;

    const normalizedScore = Number(row.co_purchase_count) / maxAffinity;
    const existing = scoreMap.get(pid) ?? { name: row.product_name, score: 0, reasons: [] };
    existing.score += normalizedScore * 0.35;
    existing.reasons.push(`נרכש ${row.co_purchase_count} פעמים יחד עם מוצרים שקנית`);
    scoreMap.set(pid, existing);
  }

  // ציון פופולריות (משקל: 0.15)
  const maxPopular = popularProducts.length > 0
    ? Math.max(...popularProducts.map((r: any) => Number(r.order_count)))
    : 1;

  for (const row of popularProducts) {
    const pid = row.product_id;
    if (purchasedSet.has(pid)) continue;

    const normalizedScore = Number(row.order_count) / maxPopular;
    const existing = scoreMap.get(pid) ?? { name: row.product_name, score: 0, reasons: [] };
    existing.score += normalizedScore * 0.15;
    existing.reasons.push("מוצר פופולרי");
    scoreMap.set(pid, existing);
  }

  // מיון לפי ציון ובחירת המלצות מובילות
  const recommendations: ProductRecommendation[] = Array.from(scoreMap.entries())
    .map(([productId, data]) => ({
      productId,
      productName: data.name ?? "ללא שם",
      score: Math.round(clamp(data.score, 0, 1) * 1000) / 1000,
      reason: data.reasons.slice(0, 2).join("; "), // עד 2 סיבות
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // עד 10 המלצות

  // שמירה בקאש
  await cachePrediction(
    "product_recommendation", "customer", customerId,
    recommendations,
    recommendations.length > 0 ? mean(recommendations.map((r) => r.score)) : 0,
    {
      purchasedCount: purchasedSet.size,
      similarCustomerMatches: similarCustomerProducts.length,
      affinityMatches: affinityProducts.length,
    },
    24
  );

  return recommendations;
}

// ============================================================================
// פונקציות ניהול וסטטיסטיקה
// ============================================================================

/** קבלת סטטיסטיקות על התחזיות השמורות */
export async function getMLStats(): Promise<{
  totalPredictions: number;
  byModelType: Record<string, number>;
  activePredictions: number;
  expiredPredictions: number;
  avgConfidence: number;
}> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE expires_at > NOW())::int AS active,
      COUNT(*) FILTER (WHERE expires_at <= NOW())::int AS expired,
      COALESCE(AVG(confidence), 0)::numeric AS avg_confidence
    FROM ml_predictions
  `);

  const { rows: byType } = await pool.query(`
    SELECT model_type, COUNT(*)::int AS cnt
    FROM ml_predictions
    WHERE expires_at > NOW()
    GROUP BY model_type
  `);

  const byModelType: Record<string, number> = {};
  for (const r of byType) {
    byModelType[r.model_type] = r.cnt;
  }

  return {
    totalPredictions: Number(rows[0]?.total ?? 0),
    byModelType,
    activePredictions: Number(rows[0]?.active ?? 0),
    expiredPredictions: Number(rows[0]?.expired ?? 0),
    avgConfidence: Math.round(Number(rows[0]?.avg_confidence ?? 0) * 1000) / 1000,
  };
}

/** ביטול (invalidation) של תחזיות ספציפיות - למשל כשנתונים משתנים */
export async function invalidatePredictions(
  modelType?: string,
  entityType?: string,
  entityId?: string
): Promise<number> {
  let query = `UPDATE ml_predictions SET expires_at = NOW() WHERE expires_at > NOW()`;
  const params: string[] = [];
  let idx = 1;

  if (modelType) {
    query += ` AND model_type = $${idx++}`;
    params.push(modelType);
  }
  if (entityType) {
    query += ` AND entity_type = $${idx++}`;
    params.push(entityType);
  }
  if (entityId) {
    query += ` AND entity_id = $${idx++}`;
    params.push(entityId);
  }

  const { rowCount } = await pool.query(query, params);
  return rowCount ?? 0;
}

/** הפעלת כל המודלים של ML בבת אחת (לשימוש בתזמון לילי) */
export async function runAllModels(): Promise<{
  demandForecasts: number;
  priceOptimizations: number;
  churnPredictions: number;
  cashflowGenerated: boolean;
  defectPredictions: number;
}> {
  // ניקוי תחזיות ישנות
  await cleanExpiredPredictions();

  // חיזוי ביקוש למוצרים מובילים
  const { rows: topProducts } = await pool.query(
    `SELECT DISTINCT oi.product_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= NOW() - INTERVAL '3 months'
       AND o.status NOT IN ('cancelled', 'refunded')
     GROUP BY oi.product_id
     ORDER BY SUM(oi.quantity) DESC
     LIMIT 50`
  );

  let demandForecasts = 0;
  let priceOptimizations = 0;
  for (const { product_id } of topProducts) {
    try {
      await forecastDemand(product_id, 12, 6);
      demandForecasts++;
    } catch (_e) { /* ממשיכים גם אם מוצר אחד נכשל */ }
    try {
      await optimizePrice(product_id);
      priceOptimizations++;
    } catch (_e) { /* ממשיכים */ }
  }

  // חיזוי נטישה לכל הלקוחות
  let churnPredictions = 0;
  try {
    const churnResults = await predictChurn();
    churnPredictions = churnResults.length;
  } catch (_e) { /* ממשיכים */ }

  // חיזוי תזרים מזומנים
  let cashflowGenerated = false;
  try {
    await forecastCashflow(6);
    cashflowGenerated = true;
  } catch (_e) { /* ממשיכים */ }

  // חיזוי פגמים לכל המכונות
  let defectPredictions = 0;
  try {
    const defectResults = await predictDefects();
    defectPredictions = defectResults.length;
  } catch (_e) { /* ממשיכים */ }

  return {
    demandForecasts,
    priceOptimizations,
    churnPredictions,
    cashflowGenerated,
    defectPredictions,
  };
}
