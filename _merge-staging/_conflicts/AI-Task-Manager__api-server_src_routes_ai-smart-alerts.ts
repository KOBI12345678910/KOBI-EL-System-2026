import { Router, type IRouter } from "express";
import { db, backgroundPool } from "@workspace/db";
import { aiRecommendationsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

interface AlertData {
  category: string;
  title: string;
  description: string;
  confidence: string;
  metadata: Record<string, any>;
}

async function safeQuery(query: string): Promise<any[]> {
  try {
    const r = await db.execute(sql.raw(query));
    return r.rows || [];
  } catch { return []; }
}

async function safeQueryBg(query: string): Promise<any[]> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const r = await client.query(query);
    return r.rows || [];
  } catch { return []; } finally { client?.release(); }
}

async function analyzeBusinessData(queryFn: (q: string) => Promise<any[]> = safeQuery): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const overdueAP = await queryFn(`
    SELECT COUNT(*) as count, COALESCE(SUM(CAST(balance_due AS numeric)), 0) as total
    FROM accounts_payable
    WHERE status NOT IN ('paid', 'cancelled')
      AND due_date IS NOT NULL
      AND due_date < NOW()
      AND CAST(balance_due AS numeric) > 0
  `);
  if (overdueAP.length > 0 && Number(overdueAP[0].count) > 0) {
    alerts.push({
      category: "finance",
      title: `${overdueAP[0].count} חשבוניות ספקים באיחור`,
      description: `נמצאו ${overdueAP[0].count} חשבוניות תשלום לספקים שעברו את תאריך הפירעון. סכום כולל: ₪${Number(overdueAP[0].total).toLocaleString()}`,
      confidence: "0.95",
      metadata: { count: overdueAP[0].count, totalAmount: overdueAP[0].total, type: "overdue_payables" },
    });
  }

  const overdueAR = await queryFn(`
    SELECT COUNT(*) as count, COALESCE(SUM(CAST(balance_due AS numeric)), 0) as total
    FROM accounts_receivable
    WHERE status NOT IN ('paid', 'cancelled', 'closed')
      AND due_date IS NOT NULL
      AND due_date < NOW()
      AND CAST(balance_due AS numeric) > 0
  `);
  if (overdueAR.length > 0 && Number(overdueAR[0].count) > 0) {
    alerts.push({
      category: "finance",
      title: `${overdueAR[0].count} חשבוניות לקוחות לא שולמו`,
      description: `${overdueAR[0].count} חשבוניות לקוחות שעברו את מועד התשלום. סכום לגבייה: ₪${Number(overdueAR[0].total).toLocaleString()}`,
      confidence: "0.93",
      metadata: { count: overdueAR[0].count, totalAmount: overdueAR[0].total, type: "overdue_receivables" },
    });
  }

  const lowStock = await queryFn(`
    SELECT COUNT(*) as count, array_agg(material_name ORDER BY CAST(current_stock AS numeric) ASC) as materials
    FROM raw_materials
    WHERE current_stock IS NOT NULL
      AND reorder_point IS NOT NULL
      AND status IN ('פעיל', 'active')
      AND CAST(current_stock AS numeric) <= CAST(reorder_point AS numeric)
  `);
  if (lowStock.length > 0 && Number(lowStock[0].count) > 0) {
    const materialsList = (lowStock[0].materials || []).slice(0, 5).join(", ");
    alerts.push({
      category: "inventory",
      title: `${lowStock[0].count} חומרי גלם מתחת לנקודת הזמנה`,
      description: `מלאי נמוך בחומרים: ${materialsList}${Number(lowStock[0].count) > 5 ? ` ועוד ${Number(lowStock[0].count) - 5}` : ""}. יש להזמין מספקים בהקדם.`,
      confidence: "0.97",
      metadata: { count: lowStock[0].count, materials: lowStock[0].materials?.slice(0, 10), type: "low_stock" },
    });
  }

  const pendingPO = await queryFn(`
    SELECT COUNT(*) as count, COALESCE(SUM(CAST(total_amount AS numeric)), 0) as total
    FROM purchase_orders
    WHERE status IN ('draft', 'pending', 'sent')
      AND created_at < NOW() - INTERVAL '7 days'
  `);
  if (pendingPO.length > 0 && Number(pendingPO[0].count) > 0) {
    alerts.push({
      category: "procurement",
      title: `${pendingPO[0].count} הזמנות רכש ממתינות מעל שבוע`,
      description: `ישנן ${pendingPO[0].count} הזמנות רכש שנפתחו לפני יותר מ-7 ימים ועדיין לא אושרו. סכום כולל: ₪${Number(pendingPO[0].total).toLocaleString()}`,
      confidence: "0.88",
      metadata: { count: pendingPO[0].count, totalAmount: pendingPO[0].total, type: "pending_purchase_orders" },
    });
  }

  const salesThisMonth = await queryFn(`
    SELECT COALESCE(SUM(CAST(total_amount AS numeric)), 0) as total, COUNT(*) as count
    FROM sales_orders
    WHERE created_at >= date_trunc('month', NOW())
      AND status NOT IN ('cancelled', 'rejected')
  `);
  const salesLastMonth = await queryFn(`
    SELECT COALESCE(SUM(CAST(total_amount AS numeric)), 0) as total, COUNT(*) as count
    FROM sales_orders
    WHERE created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
      AND created_at < date_trunc('month', NOW())
      AND status NOT IN ('cancelled', 'rejected')
  `);
  if (salesThisMonth.length > 0 && salesLastMonth.length > 0) {
    const thisTotal = Number(salesThisMonth[0].total);
    const lastTotal = Number(salesLastMonth[0].total);
    if (lastTotal > 0) {
      const change = ((thisTotal - lastTotal) / lastTotal) * 100;
      if (change < -15) {
        alerts.push({
          category: "sales",
          title: `ירידה של ${Math.abs(change).toFixed(1)}% במכירות החודש`,
          description: `מכירות החודש עומדות על ₪${thisTotal.toLocaleString()} לעומת ₪${lastTotal.toLocaleString()} בחודש שעבר — ירידה של ${Math.abs(change).toFixed(1)}%.`,
          confidence: "0.82",
          metadata: { thisMonth: thisTotal, lastMonth: lastTotal, changePercent: change, type: "sales_decline" },
        });
      }
    }
  }

  const pendingQuotes = await queryFn(`
    SELECT COUNT(*) as count
    FROM price_quotes
    WHERE status IN ('draft', 'sent')
      AND valid_until IS NOT NULL
      AND valid_until < NOW() + INTERVAL '3 days'
      AND valid_until > NOW()
  `);
  if (pendingQuotes.length > 0 && Number(pendingQuotes[0].count) > 0) {
    alerts.push({
      category: "sales",
      title: `${pendingQuotes[0].count} הצעות מחיר פגות תוקף בקרוב`,
      description: `${pendingQuotes[0].count} הצעות מחיר שנשלחו ללקוחות יפגו תוקפן תוך 3 ימים. מומלץ לעקוב ולזרז החלטה.`,
      confidence: "0.85",
      metadata: { count: pendingQuotes[0].count, type: "expiring_quotes" },
    });
  }

  const staleSuppliers = await queryFn(`
    SELECT COUNT(*) as count
    FROM suppliers
    WHERE status IN ('פעיל', 'active')
      AND last_order_date IS NOT NULL
      AND last_order_date < NOW() - INTERVAL '90 days'
  `);
  if (staleSuppliers.length > 0 && Number(staleSuppliers[0].count) > 0) {
    alerts.push({
      category: "procurement",
      title: `${staleSuppliers[0].count} ספקים פעילים ללא הזמנות ב-90 יום`,
      description: `${staleSuppliers[0].count} ספקים מסומנים כפעילים אך לא הוזמן מהם דבר ב-3 חודשים האחרונים.`,
      confidence: "0.75",
      metadata: { count: staleSuppliers[0].count, type: "inactive_suppliers" },
    });
  }

  return alerts;
}

router.post("/ai-smart-alerts/run", async (req, res) => {
  try {
    const alerts = await analyzeBusinessData();

    if (alerts.length === 0) {
      return res.json({ message: "לא נמצאו חריגות. המערכת תקינה.", count: 0, recommendations: [] });
    }

    const created = [];
    for (const alert of alerts) {
      try {
        const [rec] = await db.insert(aiRecommendationsTable).values({
          title: alert.title,
          description: alert.description,
          category: alert.category,
          confidence: alert.confidence,
          status: "pending",
          isApplied: false,
          metadata: JSON.stringify(alert.metadata),
        }).returning();
        created.push(rec);
      } catch (insertErr: any) {
        console.error("Failed to insert recommendation:", insertErr.message);
      }
    }

    res.json({
      message: `נוצרו ${created.length} התראות חכמות`,
      count: created.length,
      recommendations: created,
    });
  } catch (err: any) {
    console.error("Smart alerts error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/ai-smart-alerts/analyze", async (req, res) => {
  try {
    const alerts = await analyzeBusinessData();
    res.json({
      count: alerts.length,
      alerts,
    });
  } catch (err: any) {
    console.error("Smart alerts analyze error:", err);
    res.status(500).json({ message: err.message });
  }
});

let _alertIntervalHandle: ReturnType<typeof setInterval> | null = null;

export function startSmartAlertsJob(intervalMs = 6 * 60 * 60 * 1000) {
  if (_alertIntervalHandle) clearInterval(_alertIntervalHandle);
  _alertIntervalHandle = setInterval(async () => {
    try {
      const alerts = await analyzeBusinessData(safeQueryBg);
      let client: import("pg").PoolClient | undefined;
      try {
        client = await backgroundPool.connect();
        for (const alert of alerts) {
          await client.query(
            `INSERT INTO ai_recommendations (title, description, category, confidence, status, is_applied, metadata)
             VALUES ($1, $2, $3, $4, 'pending', false, $5)`,
            [alert.title, alert.description, alert.category, alert.confidence, JSON.stringify(alert.metadata)]
          );
        }
      } finally {
        client?.release();
      }
      if (alerts.length > 0) {
        console.log(`[SmartAlerts] Created ${alerts.length} new recommendations`);
      }
    } catch (err: any) {
      console.error("[SmartAlerts] Job error:", err.message);
    }
  }, intervalMs);
  console.log(`[SmartAlerts] Periodic job started (every ${intervalMs / 1000 / 60}m)`);
}

export default router;
