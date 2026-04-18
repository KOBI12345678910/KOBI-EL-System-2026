import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/ai-orchestration/audit-logs", async (req, res) => {
  const {
    limit = "50",
    offset = "0",
    provider,
    userId,
    taskType,
    status,
    from,
    to,
    search,
  } = req.query as Record<string, string>;

  try {
    const conditions: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (provider) { conditions.push(`provider = $${idx++}`); vals.push(provider); }
    if (userId) { conditions.push(`user_id = $${idx++}`); vals.push(userId); }
    if (taskType) { conditions.push(`task_type = $${idx++}`); vals.push(taskType); }
    if (status === "success") { conditions.push(`status_code = 200`); }
    if (status === "error") { conditions.push(`status_code != 200`); }
    if (from) { conditions.push(`created_at >= $${idx++}`); vals.push(from); }
    if (to) { conditions.push(`created_at <= $${idx++}`); vals.push(to); }
    if (search) {
      conditions.push(`(input_summary ILIKE $${idx} OR output_summary ILIKE $${idx} OR model ILIKE $${idx})`);
      vals.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitVal = Math.min(parseInt(limit) || 50, 200);
    const offsetVal = parseInt(offset) || 0;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM ai_audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limitVal, offsetVal]
      ),
      pool.query(`SELECT COUNT(*) as total FROM ai_audit_logs ${where}`, vals),
    ]);

    res.json({
      logs: dataResult.rows,
      total: parseInt(countResult.rows[0]?.total || "0"),
      limit: limitVal,
      offset: offsetVal,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/ai-orchestration/audit-logs/analytics", async (_req, res) => {
  try {
    const [byProvider, byTaskType, costStats, recentErrors, dailyUsage] = await Promise.all([
      pool.query(`
        SELECT provider, COUNT(*) as total_requests, 
               SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success_count,
               AVG(latency_ms) as avg_latency_ms,
               SUM(input_tokens) as total_input_tokens,
               SUM(output_tokens) as total_output_tokens,
               SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) as fallback_count
        FROM ai_audit_logs GROUP BY provider ORDER BY total_requests DESC
      `),
      pool.query(`
        SELECT task_type, COUNT(*) as count FROM ai_audit_logs
        WHERE task_type IS NOT NULL GROUP BY task_type ORDER BY count DESC
      `),
      pool.query(`
        SELECT provider, SUM(cost) as total_cost FROM ai_audit_logs WHERE cost IS NOT NULL GROUP BY provider
      `),
      pool.query(`
        SELECT provider, model, error_message, created_at FROM ai_audit_logs
        WHERE status_code != 200 AND status_code IS NOT NULL ORDER BY created_at DESC LIMIT 10
      `),
      pool.query(`
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as requests,
               SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as successes
        FROM ai_audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `),
    ]);

    res.json({
      byProvider: byProvider.rows,
      byTaskType: byTaskType.rows,
      costStats: costStats.rows,
      recentErrors: recentErrors.rows,
      dailyUsage: dailyUsage.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/ai-orchestration/audit-logs/export", async (req, res) => {
  const { from, to, provider } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (from) { conditions.push(`created_at >= $${idx++}`); vals.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); vals.push(to); }
  if (provider) { conditions.push(`provider = $${idx++}`); vals.push(provider); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT id, user_id, provider, model, task_type, input_summary, output_summary, 
              input_tokens, output_tokens, total_tokens, cost, latency_ms, status_code, 
              error_message, action_taken, fallback_used, original_provider, created_at
       FROM ai_audit_logs ${where} ORDER BY created_at DESC LIMIT 5000`,
      vals
    );

    const csvHeader = "id,user_id,provider,model,task_type,input_summary,output_summary,input_tokens,output_tokens,total_tokens,cost,latency_ms,status_code,error_message,action_taken,fallback_used,original_provider,created_at";
    const csvRows = result.rows.map(r =>
      [r.id, r.user_id || "", r.provider, r.model, r.task_type || "",
        `"${(r.input_summary || "").replace(/"/g, '""')}"`,
        `"${(r.output_summary || "").replace(/"/g, '""')}"`,
        r.input_tokens || "", r.output_tokens || "", r.total_tokens || "",
        r.cost || "", r.latency_ms || "", r.status_code || "",
        `"${(r.error_message || "").replace(/"/g, '""')}"`,
        r.action_taken || "", r.fallback_used, r.original_provider || "",
        r.created_at?.toISOString() || ""].join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="ai-audit-log-${Date.now()}.csv"`);
    res.send([csvHeader, ...csvRows].join("\n"));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
