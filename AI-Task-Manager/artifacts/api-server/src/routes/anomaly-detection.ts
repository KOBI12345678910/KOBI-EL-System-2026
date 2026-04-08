import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

interface Anomaly {
  id: string;
  module: string;
  moduleHe: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  value: number | string;
  expected: number | string;
  deviation: number;
  detectedAt: string;
  status: "active" | "acknowledged" | "dismissed";
  suggestedAction: string;
}

const anomalyStore: Map<string, Anomaly> = new Map();
let lastScanTime: Date | null = null;

function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return Math.abs((value - mean) / std);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], avg?: number): number {
  if (arr.length < 2) return 0;
  const m = avg ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
}

function makeId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}`;
}

async function runAnomalyScan(): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  try {
    const salesRows = await db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as day,
        COUNT(*)::int as count,
        COALESCE(SUM(total), 0)::numeric as value
      FROM sales_orders
      WHERE created_at >= NOW() - INTERVAL '60 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day
    `);

    const salesData = (salesRows.rows || []) as Array<{ day: string; count: number; value: number }>;
    if (salesData.length >= 7) {
      const dailyCounts = salesData.map(r => Number(r.count));
      const m = mean(dailyCounts);
      const s = stdDev(dailyCounts, m);
      const recent = dailyCounts.slice(-7);
      for (let i = 0; i < recent.length; i++) {
        const z = zScore(recent[i], m, s);
        if (z > 2.5) {
          const day = salesData[salesData.length - 7 + i];
          const isHigh = recent[i] > m;
          anomalies.push({
            id: makeId("sales", i),
            module: "sales",
            moduleHe: "מכירות",
            severity: z > 3.5 ? "critical" : z > 3 ? "high" : "medium",
            title: isHigh ? "עלייה חריגה בהזמנות" : "ירידה חריגה בהזמנות",
            description: `ב-${day.day} נרשמו ${recent[i]} הזמנות (ממוצע: ${Math.round(m)}, סטיית Z: ${z.toFixed(1)})`,
            value: recent[i],
            expected: Math.round(m),
            deviation: Math.round(z * 10) / 10,
            detectedAt: new Date().toISOString(),
            status: "active",
            suggestedAction: isHigh ? "בדוק גדילת מכירות ווודא שהמלאי מספיק" : "בדוק סיבת הירידה ויצור קשר עם הצוות המסחרי",
          });
        }
      }
    }
  } catch (err) {
    console.error("[Anomaly] Sales scan error:", err);
  }

  try {
    const invRows = await db.execute(sql`
      SELECT name, COALESCE(current_stock, 0)::int as current_stock, 
             COALESCE(reorder_point, 0)::int as reorder_point,
             COALESCE(unit_price, 0)::numeric as unit_price
      FROM raw_materials
      WHERE current_stock IS NOT NULL
      ORDER BY current_stock ASC
      LIMIT 50
    `);

    const items = (invRows.rows || []) as Array<{ name: string; current_stock: number; reorder_point: number; unit_price: number }>;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stock = Number(item.current_stock);
      const reorder = Number(item.reorder_point);
      if (reorder > 0 && stock <= reorder * 0.5) {
        anomalies.push({
          id: makeId("inv-critical", i),
          module: "inventory",
          moduleHe: "מלאי",
          severity: "critical",
          title: "מלאי קריטי",
          description: `${item.name}: מלאי נוכחי ${stock} יחידות — מתחת ל-50% מנקודת ההזמנה מחדש (${reorder})`,
          value: stock,
          expected: reorder,
          deviation: Math.round(((reorder - stock) / reorder) * 100),
          detectedAt: new Date().toISOString(),
          status: "active",
          suggestedAction: "הזמן חומר גלם בדחיפות — מלאי עלול להיגמר",
        });
      } else if (reorder > 0 && stock <= reorder) {
        anomalies.push({
          id: makeId("inv-low", i),
          module: "inventory",
          moduleHe: "מלאי",
          severity: "high",
          title: "מלאי נמוך",
          description: `${item.name}: מלאי נוכחי ${stock} יחידות — מתחת לנקודת ההזמנה מחדש (${reorder})`,
          value: stock,
          expected: reorder,
          deviation: Math.round(((reorder - stock) / reorder) * 100),
          detectedAt: new Date().toISOString(),
          status: "active",
          suggestedAction: "שקול הזמנת חומר גלם",
        });
      }
    }
  } catch (err) {
    console.error("[Anomaly] Inventory scan error:", err);
  }

  try {
    const invoiceRows = await db.execute(sql`
      SELECT COUNT(*)::int as overdue_count, 
             COALESCE(SUM(total_amount), 0)::numeric as overdue_value
      FROM customer_invoices
      WHERE status IN ('באיחור', 'overdue') 
        AND created_at >= NOW() - INTERVAL '90 days'
    `);
    const r = (invoiceRows.rows[0] || {}) as { overdue_count: number; overdue_value: number };
    const overdueCount = Number(r.overdue_count || 0);
    const overdueValue = Number(r.overdue_value || 0);
    if (overdueCount >= 5) {
      anomalies.push({
        id: makeId("finance-overdue", 0),
        module: "finance",
        moduleHe: "כספים",
        severity: overdueCount >= 15 ? "critical" : overdueCount >= 10 ? "high" : "medium",
        title: "חשבוניות באיחור",
        description: `${overdueCount} חשבוניות באיחור בסכום כולל ₪${Math.round(overdueValue).toLocaleString("he-IL")}`,
        value: overdueCount,
        expected: 0,
        deviation: overdueCount,
        detectedAt: new Date().toISOString(),
        status: "active",
        suggestedAction: "שלח תזכורת תשלום ללקוחות ובדוק עם צוות הגבייה",
      });
    }
  } catch (err) {
    console.error("[Anomaly] Finance scan error:", err);
  }

  try {
    const woRows = await db.execute(sql`
      SELECT COUNT(*)::int as critical_count
      FROM work_orders
      WHERE priority IN ('דחוף', 'קריטי', 'urgent', 'critical')
        AND status NOT IN ('הושלם', 'completed', 'cancelled')
        AND created_at >= NOW() - INTERVAL '7 days'
    `);
    const critCount = Number((woRows.rows[0] as any)?.critical_count || 0);
    if (critCount >= 3) {
      anomalies.push({
        id: makeId("production-wo", 0),
        module: "production",
        moduleHe: "ייצור",
        severity: critCount >= 8 ? "critical" : "high",
        title: "הצטברות הוראות עבודה קריטיות",
        description: `${critCount} הוראות עבודה קריטיות/דחופות פתוחות — עשויות לגרום לעיכובים`,
        value: critCount,
        expected: 1,
        deviation: critCount - 1,
        detectedAt: new Date().toISOString(),
        status: "active",
        suggestedAction: "הקצה משאבי ייצור נוספים ועדכן סדר עדיפויות",
      });
    }
  } catch (err) {
    console.error("[Anomaly] Production scan error:", err);
  }

  try {
    const qualityRows = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE result IN ('נכשל', 'failed'))::int as failed,
        COUNT(*)::int as total
      FROM quality_inspections
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const qr = (qualityRows.rows[0] || {}) as { failed: number; total: number };
    const failedCount = Number(qr.failed || 0);
    const totalCount = Number(qr.total || 0);
    if (totalCount > 0 && failedCount / totalCount > 0.15) {
      const failRate = Math.round((failedCount / totalCount) * 100);
      anomalies.push({
        id: makeId("quality", 0),
        module: "quality",
        moduleHe: "איכות",
        severity: failRate > 30 ? "critical" : failRate > 20 ? "high" : "medium",
        title: "שיעור כשל גבוה בבדיקות איכות",
        description: `${failedCount} מתוך ${totalCount} בדיקות נכשלו (${failRate}%) ב-30 ימים האחרונים`,
        value: failRate,
        expected: 5,
        deviation: failRate - 5,
        detectedAt: new Date().toISOString(),
        status: "active",
        suggestedAction: "בדוק תהליכי ייצור ומכונות — ייתכן כשל שיטתי",
      });
    }
  } catch (err) {
    console.error("[Anomaly] Quality scan error:", err);
  }

  try {
    const ticketRows = await db.execute(sql`
      SELECT COUNT(*)::int as open_count
      FROM support_tickets
      WHERE status IN ('פתוח', 'open')
        AND created_at <= NOW() - INTERVAL '72 hours'
    `);
    const openCount = Number((ticketRows.rows[0] as any)?.open_count || 0);
    if (openCount >= 5) {
      anomalies.push({
        id: makeId("support", 0),
        module: "support",
        moduleHe: "תמיכה",
        severity: openCount >= 20 ? "critical" : openCount >= 10 ? "high" : "medium",
        title: "פניות תמיכה פתוחות מעל 72 שעות",
        description: `${openCount} פניות תמיכה פתוחות ללא טיפול מעל 3 ימים`,
        value: openCount,
        expected: 0,
        deviation: openCount,
        detectedAt: new Date().toISOString(),
        status: "active",
        suggestedAction: "הקצה נציגי תמיכה לטיפול בפניות הפתוחות",
      });
    }
  } catch (err) {
    console.error("[Anomaly] Support scan error:", err);
  }

  try {
    const leadRows = await db.execute(sql`
      SELECT COUNT(*)::int as stale_count
      FROM crm_leads
      WHERE status IN ('חדש', 'new')
        AND created_at <= NOW() - INTERVAL '14 days'
    `);
    const staleCount = Number((leadRows.rows[0] as any)?.stale_count || 0);
    if (staleCount >= 5) {
      anomalies.push({
        id: makeId("crm", 0),
        module: "crm",
        moduleHe: "CRM",
        severity: staleCount >= 20 ? "high" : "medium",
        title: "לידים ישנים ללא טיפול",
        description: `${staleCount} לידים חדשים שלא טופלו מעל 14 ימים`,
        value: staleCount,
        expected: 0,
        deviation: staleCount,
        detectedAt: new Date().toISOString(),
        status: "active",
        suggestedAction: "הקצה לידים לנציגי מכירות ועדכן סטטוס",
      });
    }
  } catch (err) {
    console.error("[Anomaly] CRM scan error:", err);
  }

  return anomalies;
}

router.get("/analytics/anomalies", async (req: Request, res: Response) => {
  try {
    const forceRescan = req.query.refresh === "true";
    const shouldRescan = forceRescan || !lastScanTime || Date.now() - lastScanTime.getTime() > 5 * 60 * 1000;

    if (shouldRescan) {
      const freshAnomalies = await runAnomalyScan();
      freshAnomalies.forEach(a => {
        if (!anomalyStore.has(a.id) || forceRescan) {
          anomalyStore.set(a.id, a);
        }
      });
      lastScanTime = new Date();
    }

    const allAnomalies = Array.from(anomalyStore.values());

    const module = req.query.module as string;
    const severity = req.query.severity as string;
    const status = req.query.status as string;

    let filtered = allAnomalies;
    if (module && module !== "all") filtered = filtered.filter(a => a.module === module);
    if (severity && severity !== "all") filtered = filtered.filter(a => a.severity === severity);
    if (status && status !== "all") filtered = filtered.filter(a => a.status === status);

    filtered.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    });

    const stats = {
      total: allAnomalies.length,
      active: allAnomalies.filter(a => a.status === "active").length,
      acknowledged: allAnomalies.filter(a => a.status === "acknowledged").length,
      dismissed: allAnomalies.filter(a => a.status === "dismissed").length,
      critical: allAnomalies.filter(a => a.severity === "critical" && a.status === "active").length,
      high: allAnomalies.filter(a => a.severity === "high" && a.status === "active").length,
      medium: allAnomalies.filter(a => a.severity === "medium" && a.status === "active").length,
      low: allAnomalies.filter(a => a.severity === "low" && a.status === "active").length,
    };

    res.json({
      anomalies: filtered,
      stats,
      lastScanAt: lastScanTime?.toISOString() || null,
    });
  } catch (err: any) {
    console.error("[Anomaly] GET error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/analytics/anomalies/:id/acknowledge", (req: Request, res: Response) => {
  const { id } = req.params;
  const anomaly = anomalyStore.get(id);
  if (!anomaly) {
    res.status(404).json({ error: "חריגה לא נמצאה" });
    return;
  }
  anomaly.status = "acknowledged";
  anomalyStore.set(id, anomaly);
  res.json({ success: true, anomaly });
});

router.post("/analytics/anomalies/:id/dismiss", (req: Request, res: Response) => {
  const { id } = req.params;
  const anomaly = anomalyStore.get(id);
  if (!anomaly) {
    res.status(404).json({ error: "חריגה לא נמצאה" });
    return;
  }
  anomaly.status = "dismissed";
  anomalyStore.set(id, anomaly);
  res.json({ success: true, anomaly });
});

router.post("/analytics/anomalies/scan", async (_req: Request, res: Response) => {
  try {
    const freshAnomalies = await runAnomalyScan();
    freshAnomalies.forEach(a => anomalyStore.set(a.id, a));
    lastScanTime = new Date();
    res.json({ success: true, count: freshAnomalies.length, scannedAt: lastScanTime.toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
