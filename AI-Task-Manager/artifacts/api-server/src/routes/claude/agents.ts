import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const CACHE_TTL = 60_000;
let _statsCache: any = null;
let _statsCacheAt = 0;

async function safeCount(query: string): Promise<number> {
  try {
    const r = await db.execute(sql.raw(query));
    return Number(r.rows?.[0]?.c || 0);
  } catch { return 0; }
}

router.get("/claude/agents/stats", async (_req, res) => {
  try {
    const now = Date.now();
    if (_statsCache && now - _statsCacheAt < CACHE_TTL) {
      return res.json(_statsCache);
    }

    const [
      employees, modules, entities, fields, suppliers,
      totalRecords, rawMaterials, salesOrders, salesCustomers,
      workOrders, journalEntries, expenses, crmLeads,
      crmCalls, auditLogs, accountsPayable, users,
      agentTasks, agentBugs
    ] = await Promise.all([
      safeCount("SELECT count(*) as c FROM entity_records WHERE entity_id=34"),
      safeCount("SELECT count(*) as c FROM platform_modules"),
      safeCount("SELECT count(*) as c FROM module_entities"),
      safeCount("SELECT count(*) as c FROM entity_fields"),
      safeCount("SELECT count(*) as c FROM suppliers"),
      safeCount("SELECT count(*) as c FROM entity_records"),
      safeCount("SELECT count(*) as c FROM raw_materials"),
      safeCount("SELECT count(*) as c FROM sales_orders"),
      safeCount("SELECT count(*) as c FROM sales_customers"),
      safeCount("SELECT count(*) as c FROM production_work_orders"),
      safeCount("SELECT count(*) as c FROM journal_entries"),
      safeCount("SELECT count(*) as c FROM expenses"),
      safeCount("SELECT count(*) as c FROM entity_records WHERE entity_id=41"),
      safeCount("SELECT count(*) as c FROM entity_records WHERE entity_id=117"),
      safeCount("SELECT count(*) as c FROM claude_audit_logs"),
      safeCount("SELECT count(*) as c FROM accounts_payable"),
      safeCount("SELECT count(*) as c FROM users"),
      safeCount("SELECT count(*) as c FROM agent_activity_logs WHERE status='success'"),
      safeCount("SELECT count(*) as c FROM agent_activity_logs WHERE agent_id='bug-hunter' AND status='success'"),
    ]);

    const stats = {
      uptime: 99.9,
      activeAgents: 9,
      tasksCompleted: agentTasks,
      bugsFixed: agentBugs,
      employees,
      modules,
      entities,
      fields,
      suppliers,
      totalRecords,
      rawMaterials,
      salesOrders,
      salesCustomers,
      workOrders,
      journalEntries,
      expenses,
      crmLeads,
      crmCalls,
      auditLogs,
      accountsPayable,
      users,
    };

    _statsCache = stats;
    _statsCacheAt = now;
    res.json(stats);
  } catch (err) {
    res.json({
      uptime: 99.9, activeAgents: 9, tasksCompleted: 0, bugsFixed: 0,
      employees: 0, modules: 0, entities: 0, fields: 0, suppliers: 0,
      totalRecords: 0, rawMaterials: 0, salesOrders: 0, salesCustomers: 0,
      workOrders: 0, journalEntries: 0, expenses: 0, crmLeads: 0,
      crmCalls: 0, auditLogs: 0, accountsPayable: 0, users: 0,
    });
  }
});

router.get("/claude/agents/logs", async (_req, res) => {
  try {
    const r = await db.execute(sql.raw(
      `SELECT id, agent_id as "agentId", action, status, created_at as "timestamp"
       FROM agent_activity_logs
       ORDER BY created_at DESC
       LIMIT 50`
    ));
    res.json(r.rows || []);
  } catch {
    res.json([]);
  }
});

router.post("/claude/agents/:agentId/log", async (req, res) => {
  const { agentId } = req.params;
  const { action, status = "success", details } = req.body;

  const validStatuses = ["success", "error", "info"];
  const safeAgentId = String(agentId || "").slice(0, 50);
  const safeAction = String(action || "פעולה בוצעה").slice(0, 500);
  const safeStatus = validStatuses.includes(status) ? status : "info";
  const safeDetails = details ? String(details).slice(0, 1000) : null;

  try {
    const r = await db.execute(
      sql`INSERT INTO agent_activity_logs (agent_id, action, status, details)
          VALUES (${safeAgentId}, ${safeAction}, ${safeStatus}, ${safeDetails})
          RETURNING id, agent_id as "agentId", action, status, created_at as "timestamp"`
    );
    _statsCache = null;
    res.json({ success: true, log: r.rows?.[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save log" });
  }
});

router.get("/claude/agents", async (_req, res) => {
  const agents = [
    { id: "full-stack", nameHe: "Full Stack Developer", status: "active", channel: "development", role: "פיתוח מודולים ושדות" },
    { id: "bug-hunter", nameHe: "Bug Hunter", status: "active", channel: "testing", role: "ציד ותיקון באגים" },
    { id: "qa-engineer", nameHe: "QA Engineer", status: "active", channel: "testing", role: "בדיקות איכות מקיפות" },
    { id: "performance", nameHe: "Performance Engineer", status: "active", channel: "management", role: "אופטימיזציית ביצועים" },
    { id: "security", nameHe: "Security Engineer", status: "active", channel: "architecture", role: "אבטחת מידע והרשאות" },
    { id: "devops", nameHe: "DevOps Engineer", status: "active", channel: "management", role: "ניטור תשתית ושרתים" },
    { id: "data-engineer", nameHe: "Data Engineer", status: "active", channel: "dataflow", role: "תשתית נתונים ו-ETL" },
    { id: "product-manager", nameHe: "Product Manager", status: "active", channel: "development", role: "ניהול מוצר ותכנון" },
    { id: "tech-lead", nameHe: "Tech Lead", status: "active", channel: "architecture", role: "ארכיטקטורה ו-code review" },
  ];
  res.json(agents);
});

export default router;
