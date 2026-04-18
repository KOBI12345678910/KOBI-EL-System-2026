import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("ProductDev-Enterprise query error:", e.message); return []; }
}

// ========== PRODUCT ROADMAP ==========
router.get("/product-dev/roadmap", async (_req, res) => {
  res.json(await q(`SELECT * FROM product_roadmap ORDER BY target_date ASC, created_at DESC`));
});

router.get("/product-dev/roadmap/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='מתוכנן') as planned,
    COUNT(*) FILTER (WHERE status='בפיתוח') as in_progress,
    COUNT(*) FILTER (WHERE status='הושלם') as completed,
    COUNT(*) FILTER (WHERE status='מעוכב') as delayed
  FROM product_roadmap`);
  res.json(rows[0] || {});
});

router.post("/product-dev/roadmap", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO product_roadmap (feature_name, description, version, target_date, completed_date, status, priority, assignee, effort, category, dependencies, notes)
    VALUES (${s(d.featureName)}, ${s(d.description)}, ${s(d.version)}, ${d.targetDate ? `'${d.targetDate}'` : 'NULL'}, ${d.completedDate ? `'${d.completedDate}'` : 'NULL'}, ${s(d.status||'מתוכנן')}, ${s(d.priority||'בינוני')}, ${s(d.assignee)}, ${s(d.effort)}, ${s(d.category)}, ${s(d.dependencies)}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/product-dev/roadmap/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.featureName) sets.push(`feature_name=${s(d.featureName)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.version !== undefined) sets.push(`version=${s(d.version)}`);
  if (d.targetDate) sets.push(`target_date='${d.targetDate}'`);
  if (d.completedDate) sets.push(`completed_date='${d.completedDate}'`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.priority) sets.push(`priority=${s(d.priority)}`);
  if (d.assignee !== undefined) sets.push(`assignee=${s(d.assignee)}`);
  if (d.effort !== undefined) sets.push(`effort=${s(d.effort)}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.dependencies !== undefined) sets.push(`dependencies=${s(d.dependencies)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE product_roadmap SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM product_roadmap WHERE id=${req.params.id}`))[0]);
});

router.delete("/product-dev/roadmap/:id", async (req, res) => {
  await q(`DELETE FROM product_roadmap WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== R&D PROJECTS ==========
router.get("/product-dev/rd-projects", async (_req, res) => {
  res.json(await q(`SELECT * FROM rd_projects ORDER BY created_at DESC`));
});

router.get("/product-dev/rd-projects/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='פעיל') as active,
    COALESCE(SUM(budget::float), 0) as total_budget,
    COALESCE(SUM(actual_cost::float), 0) as total_cost,
    COALESCE(AVG(success_rate::float), 0) as avg_success_rate
  FROM rd_projects`);
  res.json(rows[0] || {});
});

router.post("/product-dev/rd-projects", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO rd_projects (project_name, description, project_type, start_date, end_date, budget, actual_cost, status, priority, team_lead, team_size, success_rate, milestones, risks, outcomes, notes)
    VALUES (${s(d.projectName)}, ${s(d.description)}, ${s(d.projectType)}, ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${d.budget||0}, ${d.actualCost||0}, ${s(d.status||'פעיל')}, ${s(d.priority||'בינוני')}, ${s(d.teamLead)}, ${d.teamSize||1}, ${d.successRate||0}, ${s(d.milestones)}, ${s(d.risks)}, ${s(d.outcomes)}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/product-dev/rd-projects/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.projectName) sets.push(`project_name=${s(d.projectName)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.projectType !== undefined) sets.push(`project_type=${s(d.projectType)}`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.budget !== undefined) sets.push(`budget=${d.budget}`);
  if (d.actualCost !== undefined) sets.push(`actual_cost=${d.actualCost}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.priority) sets.push(`priority=${s(d.priority)}`);
  if (d.teamLead !== undefined) sets.push(`team_lead=${s(d.teamLead)}`);
  if (d.teamSize !== undefined) sets.push(`team_size=${d.teamSize}`);
  if (d.successRate !== undefined) sets.push(`success_rate=${d.successRate}`);
  if (d.milestones !== undefined) sets.push(`milestones=${s(d.milestones)}`);
  if (d.risks !== undefined) sets.push(`risks=${s(d.risks)}`);
  if (d.outcomes !== undefined) sets.push(`outcomes=${s(d.outcomes)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE rd_projects SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM rd_projects WHERE id=${req.params.id}`))[0]);
});

router.delete("/product-dev/rd-projects/:id", async (req, res) => {
  await q(`DELETE FROM rd_projects WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== FEATURE REQUESTS ==========
router.get("/product-dev/feature-requests", async (_req, res) => {
  res.json(await q(`SELECT * FROM feature_requests ORDER BY votes DESC, created_at DESC`));
});

router.get("/product-dev/feature-requests/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='חדש' OR status='פתוח') as open_count,
    COUNT(*) FILTER (WHERE status='בטיפול') as in_progress,
    COUNT(*) FILTER (WHERE status='הושלם') as completed,
    (SELECT source FROM feature_requests GROUP BY source ORDER BY COUNT(*) DESC LIMIT 1) as top_source
  FROM feature_requests`);
  res.json(rows[0] || {});
});

router.post("/product-dev/feature-requests", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO feature_requests (title, description, source, requester_name, priority, status, votes, category, assignee, target_version, estimated_effort, notes)
    VALUES (${s(d.title)}, ${s(d.description)}, ${s(d.source)}, ${s(d.requesterName)}, ${s(d.priority||'בינוני')}, ${s(d.status||'חדש')}, ${d.votes||0}, ${s(d.category)}, ${s(d.assignee)}, ${s(d.targetVersion)}, ${s(d.estimatedEffort)}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/product-dev/feature-requests/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.source !== undefined) sets.push(`source=${s(d.source)}`);
  if (d.requesterName !== undefined) sets.push(`requester_name=${s(d.requesterName)}`);
  if (d.priority) sets.push(`priority=${s(d.priority)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.votes !== undefined) sets.push(`votes=${d.votes}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.assignee !== undefined) sets.push(`assignee=${s(d.assignee)}`);
  if (d.targetVersion !== undefined) sets.push(`target_version=${s(d.targetVersion)}`);
  if (d.estimatedEffort !== undefined) sets.push(`estimated_effort=${s(d.estimatedEffort)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE feature_requests SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM feature_requests WHERE id=${req.params.id}`))[0]);
});

router.delete("/product-dev/feature-requests/:id", async (req, res) => {
  await q(`DELETE FROM feature_requests WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== QA TESTING ==========
router.get("/product-dev/qa-testing", async (_req, res) => {
  res.json(await q(`SELECT * FROM qa_testing ORDER BY test_date DESC, created_at DESC`));
});

router.get("/product-dev/qa-testing/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE result='עבר') as passed,
    COUNT(*) FILTER (WHERE result='נכשל') as failed,
    CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE result='עבר')::numeric / COUNT(*)::numeric * 100, 1) ELSE 0 END as pass_rate,
    COALESCE(SUM(bugs_found), 0) as total_bugs,
    COALESCE(SUM(bugs_found) - SUM(bugs_resolved), 0) as open_bugs,
    COALESCE(AVG(coverage::float), 0) as avg_coverage
  FROM qa_testing`);
  res.json(rows[0] || {});
});

router.post("/product-dev/qa-testing", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO qa_testing (test_name, version, test_type, test_suite, tester, test_date, result, bugs_found, bugs_critical, bugs_resolved, coverage, duration, environment, steps, expected_result, actual_result, notes)
    VALUES (${s(d.testName)}, ${s(d.version)}, ${s(d.testType)}, ${s(d.testSuite)}, ${s(d.tester)}, ${d.testDate ? `'${d.testDate}'` : 'NULL'}, ${s(d.result||'ממתין')}, ${d.bugsFound||0}, ${d.bugsCritical||0}, ${d.bugsResolved||0}, ${d.coverage||0}, ${s(d.duration)}, ${s(d.environment)}, ${s(d.steps)}, ${s(d.expectedResult)}, ${s(d.actualResult)}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/product-dev/qa-testing/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.testName) sets.push(`test_name=${s(d.testName)}`);
  if (d.version !== undefined) sets.push(`version=${s(d.version)}`);
  if (d.testType) sets.push(`test_type=${s(d.testType)}`);
  if (d.testSuite !== undefined) sets.push(`test_suite=${s(d.testSuite)}`);
  if (d.tester !== undefined) sets.push(`tester=${s(d.tester)}`);
  if (d.testDate) sets.push(`test_date='${d.testDate}'`);
  if (d.result) sets.push(`result=${s(d.result)}`);
  if (d.bugsFound !== undefined) sets.push(`bugs_found=${d.bugsFound}`);
  if (d.bugsCritical !== undefined) sets.push(`bugs_critical=${d.bugsCritical}`);
  if (d.bugsResolved !== undefined) sets.push(`bugs_resolved=${d.bugsResolved}`);
  if (d.coverage !== undefined) sets.push(`coverage=${d.coverage}`);
  if (d.duration !== undefined) sets.push(`duration=${s(d.duration)}`);
  if (d.environment !== undefined) sets.push(`environment=${s(d.environment)}`);
  if (d.steps !== undefined) sets.push(`steps=${s(d.steps)}`);
  if (d.expectedResult !== undefined) sets.push(`expected_result=${s(d.expectedResult)}`);
  if (d.actualResult !== undefined) sets.push(`actual_result=${s(d.actualResult)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE qa_testing SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM qa_testing WHERE id=${req.params.id}`))[0]);
});

router.delete("/product-dev/qa-testing/:id", async (req, res) => {
  await q(`DELETE FROM qa_testing WHERE id=${req.params.id}`);
  res.json({ success: true });
});

export default router;
