import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function clean(body: any) {
  const c = { ...body };
  for (const k of Object.keys(c)) {
    if (c[k] === "") c[k] = null;
  }
  delete c.id;
  delete c.created_at;
  delete c.updated_at;
  return c;
}

const pScore: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
const iScore: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
const legacyP: Record<string, number> = { low: 1, medium: 2, high: 3 };
const legacyI: Record<string, number> = { low: 1, medium: 2, high: 3 };

function calcRiskScore(prob: string, impact: string): number {
  const p = pScore[prob] ?? legacyP[prob] ?? 2;
  const i = iScore[impact] ?? legacyI[impact] ?? 2;
  return p * i;
}

// ===== RISK ASSESSMENTS =====

router.get("/project-risk-assessments", async (req, res) => {
  try {
    const riskId = req.query.riskId ? z.coerce.number().parse(req.query.riskId) : null;
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    let q = "SELECT * FROM project_risk_assessments WHERE 1=1";
    const params: any[] = [];
    if (riskId) { params.push(riskId); q += ` AND risk_id = $${params.length}`; }
    if (projectId) { params.push(projectId); q += ` AND project_id = $${params.length}`; }
    q += " ORDER BY assessed_at DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/project-risk-assessments", async (req, res) => {
  try {
    const b = req.body;
    const score = calcRiskScore(b.probability || "medium", b.impact || "medium");
    const { rows } = await pool.query(
      `INSERT INTO project_risk_assessments (risk_id, project_id, assessed_by, probability, impact, risk_score, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.riskId || b.risk_id, b.projectId || b.project_id, b.assessedBy || b.assessed_by, b.probability || "medium", b.impact || "medium", score, b.notes]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ===== RISK DASHBOARD =====

router.get("/project-risks-dashboard", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    let whereClause = "";
    const params: any[] = [];
    if (projectId) { params.push(projectId); whereClause = ` WHERE project_id = $1`; }

    const { rows: risks } = await pool.query(
      `SELECT * FROM project_risks${whereClause} ORDER BY risk_score DESC NULLS LAST`,
      params
    );

    const totalRisks = risks.length;
    const openRisks = risks.filter((r: any) => r.status === "open").length;
    const highRisks = risks.filter((r: any) => Number(r.risk_score) >= 12).length;
    const avgScore = totalRisks > 0
      ? (risks.reduce((s: number, r: any) => s + Number(r.risk_score || 0), 0) / totalRisks).toFixed(1)
      : "0";

    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    risks.forEach((r: any) => {
      const cat = r.category || "לא מוגדר";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    const top5 = risks.slice(0, 5);

    res.json({
      summary: { totalRisks, openRisks, highRisks, avgScore },
      byCategory: Object.entries(byCategory).map(([name, count]) => ({ name, count })),
      byStatus: Object.entries(byStatus).map(([name, count]) => ({ name, count })),
      topRisks: top5,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== CHANGE ORDERS =====

router.get("/project-change-orders", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    let q = "SELECT * FROM project_change_orders WHERE 1=1";
    const params: any[] = [];
    if (projectId) { params.push(projectId); q += ` AND project_id = $${params.length}`; }
    q += " ORDER BY created_at DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-change-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query("SELECT * FROM project_change_orders WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-change-orders", async (req, res) => {
  try {
    const b = clean(req.body);
    const { rows: cnt } = await pool.query(
      "SELECT COUNT(*) AS c FROM project_change_orders WHERE project_id = $1",
      [b.project_id || b.projectId]
    );
    const num = `CO-${String(Number(cnt[0].c) + 1).padStart(3, "0")}`;
    const projectId = b.project_id || b.projectId;
    const { rows } = await pool.query(
      `INSERT INTO project_change_orders
        (change_number, project_id, title, description, reason, scope_impact, schedule_impact, cost_impact, status, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [num, projectId, b.title, b.description, b.reason, b.scope_impact || b.scopeImpact, b.schedule_impact || b.scheduleImpact || 0, b.cost_impact || b.costImpact || 0, b.status || "draft", b.requested_by || b.requestedBy]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-change-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = clean(req.body);
    const { rows } = await pool.query(
      `UPDATE project_change_orders SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        reason = COALESCE($3, reason),
        scope_impact = COALESCE($4, scope_impact),
        schedule_impact = COALESCE($5, schedule_impact),
        cost_impact = COALESCE($6, cost_impact),
        status = COALESCE($7, status),
        requested_by = COALESCE($8, requested_by),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [b.title, b.description, b.reason, b.scope_impact || b.scopeImpact, b.schedule_impact ?? b.scheduleImpact, b.cost_impact ?? b.costImpact, b.status, b.requested_by || b.requestedBy, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/project-change-orders/:id/approve", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const approvedBy = req.body.approvedBy || req.body.approved_by || "manager";
    const { rows } = await pool.query(
      `UPDATE project_change_orders SET status = 'approved', approved_by = $1, approval_date = CURRENT_DATE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [approvedBy, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const co = rows[0];
    if (co.project_id && co.cost_impact) {
      await pool.query(
        `UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) + $1 WHERE id = $2`,
        [Number(co.cost_impact), co.project_id]
      ).catch(() => {});
    }
    res.json(co);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/project-change-orders/:id/reject", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(
      `UPDATE project_change_orders SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/project-change-orders/:id/submit", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(
      `UPDATE project_change_orders SET status = 'review', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-change-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query("DELETE FROM project_change_orders WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/project-change-orders-summary", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    let q = "SELECT * FROM project_change_orders WHERE 1=1";
    const params: any[] = [];
    if (projectId) { params.push(projectId); q += ` AND project_id = $${params.length}`; }
    const { rows } = await pool.query(q, params);
    const total = rows.length;
    const approved = rows.filter((r: any) => r.status === "approved").length;
    const pending = rows.filter((r: any) => r.status === "review").length;
    const totalCostImpact = rows.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + Number(r.cost_impact || 0), 0);
    const totalScheduleImpact = rows.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + Number(r.schedule_impact || 0), 0);
    res.json({ total, approved, pending, totalCostImpact, totalScheduleImpact });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== PROJECT DOCUMENTS =====

router.get("/project-documents", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    const phase = req.query.phase as string | undefined;
    const search = req.query.search as string | undefined;
    let q = "SELECT * FROM project_documents WHERE 1=1";
    const params: any[] = [];
    if (projectId) { params.push(projectId); q += ` AND project_id = $${params.length}`; }
    if (phase) { params.push(phase); q += ` AND phase = $${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (name ILIKE $${params.length} OR tags ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    q += " ORDER BY created_at DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-documents/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query("SELECT * FROM project_documents WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-documents", async (req, res) => {
  try {
    const b = req.body;
    const projectId = b.project_id || b.projectId;
    const { rows } = await pool.query(
      `INSERT INTO project_documents (project_id, phase, document_type, name, file_path, version, tags, description, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [projectId, b.phase || "planning", b.document_type || b.documentType || "general", b.name, b.file_path || b.filePath, b.version || "1.0", b.tags, b.description, b.uploaded_by || b.uploadedBy || "system"]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-documents/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE project_documents SET
        phase = COALESCE($1, phase),
        document_type = COALESCE($2, document_type),
        name = COALESCE($3, name),
        version = COALESCE($4, version),
        tags = COALESCE($5, tags),
        description = COALESCE($6, description),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [b.phase, b.document_type || b.documentType, b.name, b.version, b.tags, b.description, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-documents/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query("DELETE FROM project_documents WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ===== PROJECT TEMPLATES =====

router.get("/project-templates", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM project_templates ORDER BY created_at DESC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-templates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query("SELECT * FROM project_templates WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-templates", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO project_templates (name, description, project_type, template_data, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.name, b.description, b.project_type || b.projectType || "general", JSON.stringify(b.template_data || b.templateData || {}), b.created_by || b.createdBy || "user"]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-templates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE project_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        project_type = COALESCE($3, project_type),
        template_data = COALESCE($4, template_data),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [b.name, b.description, b.project_type || b.projectType, b.template_data || b.templateData ? JSON.stringify(b.template_data || b.templateData) : null, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-templates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query("DELETE FROM project_templates WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-templates/:id/create-project", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows: tmplRows } = await pool.query("SELECT * FROM project_templates WHERE id = $1", [id]);
    if (!tmplRows.length) return res.status(404).json({ error: "Template not found" });
    const tmpl = tmplRows[0];
    const b = req.body;
    const startDate = b.startDate || b.start_date || new Date().toISOString().slice(0, 10);
    const name = b.name || `פרויקט מ-${tmpl.name}`;
    const { rows: prj } = await pool.query(
      `INSERT INTO projects (project_name, description, project_type, status, start_date)
       VALUES ($1,$2,$3,'planning',$4) RETURNING id`,
      [name, b.description || tmpl.description, tmpl.project_type, startDate]
    ).catch(async () => {
      const { rows: prj2 } = await pool.query(
        `INSERT INTO projects (project_name, description, status, start_date)
         VALUES ($1,$2,'planning',$3) RETURNING id`,
        [name, b.description || tmpl.description, startDate]
      );
      return { rows: prj2 };
    });
    res.status(201).json({ projectId: prj[0]?.id, message: "פרויקט נוצר בהצלחה מתבנית" });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-templates/save-from-project/:projectId", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const b = req.body;
    const { rows: tasks } = await pool.query(
      "SELECT title, duration_days, phase FROM project_tasks WHERE project_id = $1 LIMIT 50",
      [projectId]
    ).catch(() => ({ rows: [] }));
    const { rows: milestones } = await pool.query(
      "SELECT name, phase FROM project_milestones WHERE project_id = $1 LIMIT 20",
      [projectId]
    ).catch(() => ({ rows: [] }));
    const { rows: risks } = await pool.query(
      "SELECT category FROM project_risks WHERE project_id = $1",
      [projectId]
    ).catch(() => ({ rows: [] }));
    const templateData = {
      tasks: tasks.map((t: any) => ({ title: t.title, duration: t.duration_days || 1, phase: t.phase || "execution" })),
      milestones: milestones.map((m: any) => ({ name: m.name, phase: m.phase || "execution" })),
      riskCategories: [...new Set(risks.map((r: any) => r.category).filter(Boolean))],
    };
    const { rows } = await pool.query(
      `INSERT INTO project_templates (name, description, project_type, template_data, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.name || "תבנית חדשה", b.description, b.projectType || "general", JSON.stringify(templateData), b.createdBy || "user"]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
