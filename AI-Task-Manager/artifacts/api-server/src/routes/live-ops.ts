import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { addSSEClient, getLiveOpsHistory, getLiveOpsClientCount, emitLiveOpsEvent } from "../lib/sse-manager";

const router = Router();

let liveOpsSnapshotCache: { data: unknown; ts: number } | null = null;
const LIVE_OPS_CACHE_TTL_MS = 15_000;

function requireAuth(req: Request, res: Response): number | null {
  const uid = (req as any).userId;
  if (!uid) {
    res.status(401).json({ message: "נדרשת התחברות" });
    return null;
  }
  return Number(uid);
}

router.get("/live-ops/stream", (req: Request, res: Response) => {
  const authUserId = requireAuth(req, res);
  if (!authUserId) return;
  addSSEClient(authUserId, res, ["live-ops"]);
});

router.get("/live-ops/history", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Live-ops history request timed out" });
    }
  }, 5000);
  try {
    const events = getLiveOpsHistory(100);
    const connectedClients = getLiveOpsClientCount();
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.json({ events, connectedClients });
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

router.get("/live-ops/snapshot", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    if (liveOpsSnapshotCache && Date.now() - liveOpsSnapshotCache.ts < LIVE_OPS_CACHE_TTL_MS) {
      res.set("X-Cache", "HIT");
      return res.json(liveOpsSnapshotCache.data);
    }

    const q = (sql: string) => pool.query(sql).catch(() => ({ rows: [] }));
    const n = (v: any) => Number(v || 0);

    const [prodWo, recentSales, recentExpenses, inventoryAlerts, recentActivity, activeUsers] = await Promise.all([
      q(`SELECT
          COUNT(*) as total,
          COUNT(*) FILTER(WHERE status='completed') as completed,
          COUNT(*) FILTER(WHERE status='in_progress') as in_progress,
          COUNT(*) FILTER(WHERE status='planned') as planned,
          COUNT(*) FILTER(WHERE status NOT IN ('completed','cancelled') AND planned_end IS NOT NULL AND planned_end < NOW()) as overdue
        FROM production_work_orders`),
      q(`SELECT id, order_number, customer_name, total_amount, status, created_at
        FROM sales_orders WHERE created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC LIMIT 10`),
      q(`SELECT id, description, amount, category, created_at
        FROM expenses WHERE created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC LIMIT 10`),
      q(`SELECT id, material_name, current_stock, minimum_stock
        FROM raw_materials
        WHERE minimum_stock IS NOT NULL AND minimum_stock > 0 AND COALESCE(current_stock,0) <= minimum_stock
        ORDER BY current_stock ASC LIMIT 10`),
      q(`SELECT id, action, entity_type, entity_id, details, created_at, user_id
        FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC LIMIT 20`),
      q(`SELECT COUNT(DISTINCT user_id) as cnt FROM audit_logs WHERE created_at > NOW() - INTERVAL '30 minutes'`),
    ]);

    const production = {
      total: n(prodWo.rows[0]?.total),
      completed: n(prodWo.rows[0]?.completed),
      inProgress: n(prodWo.rows[0]?.in_progress),
      planned: n(prodWo.rows[0]?.planned),
      overdue: n(prodWo.rows[0]?.overdue),
      efficiency: n(prodWo.rows[0]?.total) > 0 ? Math.round((n(prodWo.rows[0]?.completed) / n(prodWo.rows[0]?.total)) * 100) : 0,
    };

    const sales = recentSales.rows.map((r: any) => ({
      id: r.id,
      orderNumber: r.order_number,
      customer: r.customer_name,
      amount: n(r.total_amount),
      status: r.status,
      time: r.created_at,
    }));

    const finance = recentExpenses.rows.map((r: any) => ({
      id: r.id,
      description: r.description,
      amount: n(r.amount),
      category: r.category,
      time: r.created_at,
    }));

    const inventory = inventoryAlerts.rows.map((r: any) => ({
      id: r.id,
      name: r.material_name,
      current: n(r.current_stock),
      minimum: n(r.minimum_stock),
      severity: n(r.current_stock) === 0 ? "critical" : "warning",
    }));

    const users = {
      activeCount: n(activeUsers.rows[0]?.cnt),
      recentActions: recentActivity.rows.slice(0, 10).map((r: any) => ({
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        details: r.details,
        time: r.created_at,
        userId: r.user_id,
      })),
    };

    const alerts: Array<{ id: string; severity: string; title: string; description: string; category: string }> = [];

    if (production.overdue > 0) {
      alerts.push({
        id: "prod-overdue",
        severity: production.overdue > 3 ? "critical" : "warning",
        title: `${production.overdue} פקודות עבודה באיחור`,
        description: "פקודות ייצור שעברו את מועד הסיום המתוכנן",
        category: "production",
      });
    }

    for (const item of inventory) {
      alerts.push({
        id: `inv-${item.id}`,
        severity: item.severity,
        title: `מלאי נמוך: ${item.name}`,
        description: `מלאי: ${item.current} / מינימום: ${item.minimum}`,
        category: "inventory",
      });
    }

    const payload = {
      timestamp: new Date().toISOString(),
      production,
      sales,
      finance,
      inventory,
      users,
      alerts,
      connectedClients: getLiveOpsClientCount(),
      history: getLiveOpsHistory(50),
    };

    liveOpsSnapshotCache = { data: payload, ts: Date.now() };
    res.set("X-Cache", "MISS");
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/live-ops/test-event", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { category = "alerts", severity = "info", title, description } = req.body;
  emitLiveOpsEvent({
    category,
    severity,
    title: title || "אירוע בדיקה",
    description: description || "אירוע בדיקה מהמערכת",
    module: category,
  });
  res.json({ ok: true });
});

export default router;
