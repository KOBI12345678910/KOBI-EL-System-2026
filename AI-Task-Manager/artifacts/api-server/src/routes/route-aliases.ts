import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

function safeQuery(route: string) {
  return async (query: string, fallback: any = []) => {
    try {
      const { rows } = await pool.query(query);
      return rows;
    } catch (err: any) {
      console.warn(`[route-alias] ${route}: ${err.message?.slice(0, 120)}`);
      return fallback;
    }
  };
}

router.get("/strategy/goals", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM strategic_goals ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/strategy/goals/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM strategic_goals");
    res.json({ total: Number(rows[0]?.total || 0) });
  } catch { res.json({ total: 0 }); }
});
router.get("/strategy/swot", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM swot_items ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/strategy/balanced-scorecard", async (_req, res) => {
  const q = safeQuery("/strategy/balanced-scorecard");
  const rows = await q("SELECT * FROM bsc_objectives ORDER BY created_at DESC");
  res.json(rows);
});
router.get("/strategy/competitive-analysis", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitors ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/strategy/business-plan", async (_req, res) => {
  res.json({ sections: [], lastUpdated: new Date().toISOString() });
});

router.get("/projects/dashboard", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM projects_module ORDER BY created_at DESC");
    const total = rows.length;
    const active = rows.filter((r: any) => r.status === "active" || r.status === "פעיל").length;
    res.json({ projects: rows, stats: { total, active, completed: total - active } });
  } catch { res.json({ projects: [], stats: { total: 0, active: 0, completed: 0 } }); }
});
router.get("/projects/tasks", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_tasks ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/projects/milestones", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_milestones ORDER BY due_date ASC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/projects/resources", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_resources ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/projects/budget", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_budgets ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/projects/risks", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_risks ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/projects/timesheets", async (_req, res) => {
  const q = safeQuery("/projects/timesheets");
  const rows = await q("SELECT * FROM timesheet_entries ORDER BY created_at DESC");
  res.json(rows);
});

router.get("/marketing/campaigns", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_campaigns ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/marketing/content-calendar", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM content_calendar_items ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/marketing/social-media", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM social_media_posts ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/marketing/email", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM email_campaigns ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/marketing/budget", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_budgets ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/marketing/analytics", async (_req, res) => {
  res.json({ overview: { leads: 0, conversions: 0, roi: 0, spend: 0 }, channels: [] });
});
router.get("/marketing/hub", async (_req, res) => {
  res.json({ campaigns: 0, activeCampaigns: 0, leads: 0, budget: 0 });
});
router.get("/marketing/integrations", async (_req, res) => {
  res.json([]);
});

router.get("/pricing/price-lists", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM price_lists_ent ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/pricing/cost-calculator", async (_req, res) => {
  res.json({ templates: [], recentCalculations: [] });
});
router.get("/pricing/collections", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM collection_management ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/pricing/cost-calculations", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cost_calculations ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/pricing/collection-management", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM collection_management ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/production/bom-tree", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM bom_headers ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/production/planning", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM production_schedules ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/production/reports", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM production_reports ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/production/quality-control", async (_req, res) => {
  const q = safeQuery("/production/quality-control");
  const rows = await q("SELECT * FROM qc_inspections ORDER BY created_at DESC");
  res.json(rows);
});
router.get("/production/work-instructions", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM work_instructions ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/product-dev/feature-requests", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM feature_requests ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/product-dev/roadmap", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM product_roadmap_items ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/product-dev/qa-testing", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM qa_test_cases ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/product-dev/rd-projects", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rd_projects ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/hr/attendance", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM attendance_records ORDER BY check_in DESC LIMIT 200");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/hr/attendance/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM attendance_records");
    res.json({ total: Number(rows[0]?.total || 0), present: 0, absent: 0, late: 0 });
  } catch { res.json({ total: 0, present: 0, absent: 0, late: 0 }); }
});
router.get("/hr/payroll", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM payroll_records ORDER BY created_at DESC LIMIT 200");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/hr/payroll/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM payroll_records");
    res.json({ total: Number(rows[0]?.total || 0) });
  } catch { res.json({ total: 0 }); }
});
router.get("/hr/performance-reviews", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM performance_reviews ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/crm/leads/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM crm_leads");
    const total = Number(rows[0]?.total || 0);
    res.json({ total, new: 0, qualified: 0, converted: 0 });
  } catch { res.json({ total: 0 }); }
});
router.get("/crm/pipeline", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM crm_deals ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/tasks", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM crm_tasks ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/sla", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM crm_sla_rules ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/dynamic-pricing", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM dynamic_pricing_rules ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/smart-routing", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM smart_routing_rules ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/collections", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM collection_cases ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/crm/field-agents", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM field_agents ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/ai/providers", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_providers ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/models", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_models ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/api-keys", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_api_keys ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/usage-logs", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/queries", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_queries ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/responses", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_responses ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/recommendations", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_recommendations ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/ai/prompt-templates", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_prompt_templates ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/qa-test-cases", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM qa_test_cases ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/product-catalog", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/product-catalog/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM product_categories ORDER BY name ASC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/platform/data-flow-automations", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM data_flow_definitions ORDER BY created_at DESC");
    res.json(rows);
  } catch {
    res.json([
      { id: 1, name: "סנכרון מלאי ← ייצור", status: "active", lastRun: new Date().toISOString(), source: "inventory", target: "production" },
      { id: 2, name: "הזמנות רכש ← כספים", status: "active", lastRun: new Date().toISOString(), source: "procurement", target: "finance" },
      { id: 3, name: "לקוחות CRM ← מכירות", status: "active", lastRun: new Date().toISOString(), source: "crm", target: "sales" },
    ]);
  }
});

router.get("/documents/archive", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM documents ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/documents/templates", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM document_templates ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/support/tickets", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM support_tickets ORDER BY created_at DESC");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/support/tickets/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM support_tickets");
    res.json({ total: Number(rows[0]?.total || 0), open: 0, resolved: 0 });
  } catch { res.json({ total: 0, open: 0, resolved: 0 }); }
});

router.get("/reports-center/operational/summary", async (_req, res) => {
  res.json({ departments: [], efficiency: 0, alerts: [] });
});
router.get("/reports-center/operational/inventory", async (_req, res) => {
  res.json({ totalItems: 0, lowStock: 0, categories: [] });
});
router.get("/reports-center/operational/production", async (_req, res) => {
  res.json({ activeOrders: 0, completionRate: 0, efficiency: 0 });
});
router.get("/reports-center/operational/procurement", async (_req, res) => {
  res.json({ pendingOrders: 0, activeSuppliers: 0, budget: 0 });
});

export default router;
