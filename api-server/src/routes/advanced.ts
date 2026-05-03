/**
 * Advanced Analytics Router — `/api/advanced/*`
 *
 * Read-only endpoints used by erp-app `pages/advanced/*.tsx`. Each endpoint
 * pulls live data from the Postgres backend (the production "supabase admin"
 * surrogate is the shared `pool` from `@workspace/db`) and returns a uniform
 * envelope: `{ ok, data, computed_at, source, hint? }`.
 *
 * Defensive contract: a missing table or transient DB error results in
 * `data: []` (or empty graph), NOT a 500. Real 500s only fire on programmer
 * errors. The frontend pages already fall back to mock data when the response
 * is not OK, so empty arrays are an acceptable degraded mode.
 */
import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

type JsonRecord = Record<string, unknown>;

interface Envelope<T> {
  ok: boolean;
  data: T;
  computed_at: string;
  source: string;
  hint?: string;
}

function envelope<T>(data: T, source = "pg", hint?: string): Envelope<T> {
  const env: Envelope<T> = {
    ok: true,
    data,
    computed_at: new Date().toISOString(),
    source,
  };
  if (hint) env.hint = hint;
  return env;
}

function fail(res: Response, status: number, hint: string): void {
  res.status(status).json({
    ok: false,
    data: null,
    computed_at: new Date().toISOString(),
    source: "pg",
    hint,
  });
}

/**
 * Run a SQL query and tolerate "table does not exist" / "column does not
 * exist" errors. Returns [] instead of throwing so a partial schema does not
 * break the whole endpoint.
 */
async function safeQuery<T = JsonRecord>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await pool.query(sql, params as never[]);
    return (result.rows ?? []) as T[];
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    // 42P01 = undefined_table, 42703 = undefined_column, 3F000 = invalid_schema
    if (code === "42P01" || code === "42703" || code === "3F000") {
      return [];
    }
    throw err;
  }
}

function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. /api/advanced/forecasting
//    Last 12 months of sales_orders + quotes; linear regression on next 3.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/forecasting", async (req: Request, res: Response) => {
  try {
    const months = Math.min(36, Math.max(3, Number(req.query.months) || 12));

    const salesRows = await safeQuery<{ month: string; total: string | number }>(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
              COALESCE(SUM(total_amount), SUM(total), 0)::numeric AS total
       FROM sales_orders
       WHERE created_at >= NOW() - INTERVAL '${months} months'
       GROUP BY 1 ORDER BY 1`,
    );

    const quoteRows = await safeQuery<{ month: string; total: string | number }>(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
              COALESCE(SUM(total_amount), 0)::numeric AS total
       FROM quotes
       WHERE created_at >= NOW() - INTERVAL '${months} months'
       GROUP BY 1 ORDER BY 1`,
    );

    const series = salesRows.map((r) => ({
      month: r.month,
      sales: num(r.total),
      quotes: num(quoteRows.find((q) => q.month === r.month)?.total),
    }));

    // Simple ordinary-least-squares linear regression on sales totals.
    const n = series.length;
    let slope = 0;
    let intercept = 0;
    if (n >= 2) {
      const xs = series.map((_, i) => i);
      const ys = series.map((s) => s.sales);
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num1 = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num1 += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) ** 2;
      }
      slope = den === 0 ? 0 : num1 / den;
      intercept = my - slope * mx;
    }

    const forecast: Array<{ month: string; predicted: number }> = [];
    const last = series[n - 1]?.month ?? null;
    for (let k = 1; k <= 3; k++) {
      const predicted = Math.max(0, Math.round(intercept + slope * (n + k - 1)));
      let monthLabel = `+${k}`;
      if (last) {
        const [yy, mm] = last.split("-").map(Number);
        const d = new Date(Date.UTC(yy, (mm ?? 1) - 1 + k, 1));
        monthLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      forecast.push({ month: monthLabel, predicted });
    }

    res.json(envelope({ history: series, forecast, slope, intercept }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(res, 500, `forecasting failed: ${msg}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /api/advanced/digital-twin
//    Node-edge graph from work_orders + machines + recent mfg_ events.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/digital-twin", async (_req: Request, res: Response) => {
  try {
    const workOrders = await safeQuery<{
      id: number;
      status: string;
      machine_id: number | null;
    }>(
      `SELECT id, status, machine_id
       FROM work_orders
       WHERE created_at >= NOW() - INTERVAL '30 days'
       ORDER BY id DESC LIMIT 100`,
    );

    const machines = await safeQuery<{ id: number; name: string; status: string }>(
      `SELECT id, name, COALESCE(status, 'idle') AS status FROM machines ORDER BY id LIMIT 100`,
    );

    const mfgEvents = await safeQuery<{
      id: number;
      event_type: string;
      occurred_at: string;
      machine_id: number | null;
    }>(
      `SELECT id, event_type, occurred_at, machine_id
       FROM mfg_events
       WHERE occurred_at >= NOW() - INTERVAL '24 hours'
       ORDER BY occurred_at DESC LIMIT 200`,
    );

    const nodes: JsonRecord[] = [
      ...machines.map((m) => ({ id: `machine:${m.id}`, type: "machine", label: m.name, status: m.status })),
      ...workOrders.map((w) => ({ id: `wo:${w.id}`, type: "work_order", label: `WO-${w.id}`, status: w.status })),
    ];

    const edges: JsonRecord[] = [];
    for (const w of workOrders) {
      if (w.machine_id != null) {
        edges.push({ from: `wo:${w.id}`, to: `machine:${w.machine_id}`, kind: "runs_on" });
      }
    }
    for (const e of mfgEvents) {
      if (e.machine_id != null) {
        edges.push({ from: `event:${e.id}`, to: `machine:${e.machine_id}`, kind: e.event_type });
      }
    }

    res.json(
      envelope({
        nodes,
        edges,
        recent_events: mfgEvents,
        counts: {
          machines: machines.length,
          work_orders: workOrders.length,
          events_24h: mfgEvents.length,
        },
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(res, 500, `digital-twin failed: ${msg}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /api/advanced/graph-analytics
//    Adjacency list across crm_companies / crm_deals / crm_activities.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/graph-analytics", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 200));

    const companies = await safeQuery<{ id: number; name: string }>(
      `SELECT id, name FROM crm_companies ORDER BY id DESC LIMIT $1`,
      [limit],
    );

    const deals = await safeQuery<{
      id: number;
      title: string;
      company_id: number | null;
      amount: string | number | null;
      stage: string | null;
    }>(
      `SELECT id, title, company_id, amount, stage
       FROM crm_deals ORDER BY id DESC LIMIT $1`,
      [limit],
    );

    const activities = await safeQuery<{
      id: number;
      activity_type: string | null;
      deal_id: number | null;
      company_id: number | null;
    }>(
      `SELECT id, activity_type, deal_id, company_id
       FROM crm_activities ORDER BY id DESC LIMIT $1`,
      [limit],
    );

    const adjacency: Record<string, string[]> = {};
    const link = (from: string, to: string) => {
      if (!adjacency[from]) adjacency[from] = [];
      if (!adjacency[from].includes(to)) adjacency[from].push(to);
    };

    for (const c of companies) adjacency[`company:${c.id}`] = [];
    for (const d of deals) {
      if (d.company_id != null) {
        link(`company:${d.company_id}`, `deal:${d.id}`);
        link(`deal:${d.id}`, `company:${d.company_id}`);
      }
    }
    for (const a of activities) {
      if (a.deal_id != null) link(`deal:${a.deal_id}`, `activity:${a.id}`);
      if (a.company_id != null) link(`company:${a.company_id}`, `activity:${a.id}`);
    }

    res.json(
      envelope({
        adjacency,
        companies,
        deals,
        activities,
        stats: {
          companies: companies.length,
          deals: deals.length,
          activities: activities.length,
          edges: Object.values(adjacency).reduce((s, v) => s + v.length, 0),
        },
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(res, 500, `graph-analytics failed: ${msg}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. /api/advanced/anomaly-detection
//    Z-score outliers on payments amount over the last 90 days.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/anomaly-detection", async (req: Request, res: Response) => {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));

    const rows = await safeQuery<{
      id: number;
      amount: string | number;
      paid_at: string | null;
      payment_method?: string | null;
    }>(
      `SELECT id, amount, paid_at, payment_method
       FROM payments
       WHERE COALESCE(paid_at, created_at) >= NOW() - INTERVAL '${days} days'
       ORDER BY id DESC LIMIT 5000`,
    );

    const amounts = rows.map((r) => num(r.amount)).filter((n) => n > 0);
    const n = amounts.length;
    if (n < 2) {
      return res.json(envelope({ outliers: [], mean: 0, std_dev: 0, sample_size: n }));
    }
    const mean = amounts.reduce((a, b) => a + b, 0) / n;
    const variance = amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    const scored = rows.map((r) => {
      const amt = num(r.amount);
      const z = stdDev === 0 ? 0 : (amt - mean) / stdDev;
      return { ...r, amount: amt, z_score: Math.round(z * 100) / 100 };
    });

    const outliers = scored
      .filter((s) => Math.abs(s.z_score) >= 2)
      .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
      .slice(0, 20);

    res.json(
      envelope({
        outliers,
        mean: Math.round(mean * 100) / 100,
        std_dev: Math.round(stdDev * 100) / 100,
        sample_size: n,
      }),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(res, 500, `anomaly-detection failed: ${msg}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. /api/advanced/nl-query
//    Placeholder. Real NL→SQL lives in onyx-ai. Surface a clear hint when the
//    AI bridge is unreachable so the UI can show the right empty state.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/nl-query", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").slice(0, 500).trim();

  const aiBridgeUrl = process.env.ONYX_AI_URL || process.env.AI_BRIDGE_URL || null;

  const data = {
    query: q,
    interpreted: null,
    sql: null,
    rows: [] as JsonRecord[],
    suggestions: [
      "סך מכירות החודש",
      "10 הספקים הגדולים ביותר",
      "הזמנות שלא שולמו מעל 60 יום",
    ],
    bridge: aiBridgeUrl ? "configured" : "unconfigured",
  };

  if (!aiBridgeUrl) {
    return res.json(envelope(data, "pg", "ai-bridge not configured: set ONYX_AI_URL to enable NL→SQL"));
  }
  if (!q) {
    return res.json(envelope(data, "pg", "missing q param — provide ?q=<question>"));
  }

  // Bridge is configured but we don't proxy in this PR (out of scope).
  res.json(envelope(data, "pg", "ai-bridge handoff not yet implemented in this router"));
});

export default router;
