"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const pipeline_1 = require("../services/pipeline");
const connection_1 = require("../db/connection");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET כל הפרוייקטים
router.get('/', async (req, res) => {
    try {
        const projects = await pipeline_1.pipelineService.getAllProjects(req.query);
        res.json(projects);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET פרוייקט בודד מלא
router.get('/:id', async (req, res) => {
    try {
        const project = await pipeline_1.pipelineService.getProject(req.params.id);
        res.json(project);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// POST פרוייקט חדש (עסקה נסגרה)
router.post('/', async (req, res) => {
    try {
        const { client_id, order_id, title, description, address, lat, lng, total_price, advance_paid, project_manager_id, contractor_id, installer_id, driver_id } = req.body;
        const projectNumber = `TK-P-${Date.now().toString().slice(-4)}`;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO projects
        (project_number, client_id, order_id, title, description, address,
         lat, lng, total_price, advance_paid, current_stage,
         project_manager_id, contractor_id, installer_id, driver_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'deal_closed',$11,$12,$13,$14)
      RETURNING *
    `, [projectNumber, client_id, order_id, title, description, address,
            lat, lng, total_price, advance_paid,
            project_manager_id, contractor_id, installer_id, driver_id]);
        const project = rows[0];
        // לוג אירוע פתיחה
        await (0, connection_1.query)(`
      INSERT INTO pipeline_events (project_id, stage, action, performed_by, performed_by_role, notes)
      VALUES ($1, 'deal_closed', 'approved', $2, 'manager', 'פרוייקט נפתח במערכת')
    `, [project.id, req.user?.id]);
        // הפעל מנוע אוטומטי — תאם מדידה
        await pipeline_1.pipelineService.triggerNextStage({ ...project, client_name: '', client_phone: '' }, 'measurement_scheduled');
        res.status(201).json(project);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PUT קדם שלב (אישור)
router.put('/:id/advance', async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, notes, photos, signature, lat, lng } = req.body;
        const result = await pipeline_1.pipelineService.advanceStage(id, stage, req.user?.id || '', req.user?.role || 'employee', { notes, photos, signature, lat, lng });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PUT דחה שלב
router.put('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, reason } = req.body;
        await (0, connection_1.query)(`
      INSERT INTO pipeline_events
        (project_id, stage, action, performed_by, performed_by_role, notes)
      VALUES ($1, $2, 'rejected', $3, $4, $5)
    `, [id, stage, req.user?.id, req.user?.role, reason]);
        await (0, connection_1.query)(`
      UPDATE approvals SET status = 'rejected', rejected_reason = $3
      WHERE project_id = $1 AND stage = $2 AND status = 'pending'
    `, [id, stage, reason]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET approvals לעובד (לאפליקציה)
router.get('/approvals/mine', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT a.*, p.title as project_title, p.address, p.project_number,
        c.name as client_name
      FROM approvals a
      JOIN projects p ON a.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE a.required_from_employee = $1 AND a.status = 'pending'
      ORDER BY a.deadline ASC
    `, [req.user?.id]);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── CLIENT PORTAL (ללא auth — עם טוקן)
router.get('/client/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { rows } = await (0, connection_1.query)(`
      SELECT ct.*, p.title, p.address, p.total_price, p.balance_due,
        c.name as client_name
      FROM client_tokens ct
      JOIN projects p ON ct.project_id = p.id
      JOIN clients c ON ct.client_id = c.id
      WHERE ct.token = $1 AND ct.expires_at > NOW()
    `, [token]);
        if (!rows[0])
            return res.status(404).json({ error: 'Link expired or invalid' });
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST לקוח חתם על חוזה
router.post('/client/:token/sign', async (req, res) => {
    try {
        const { token } = req.params;
        const { signature } = req.body;
        const { rows } = await (0, connection_1.query)(`
      UPDATE client_tokens SET used_at = NOW()
      WHERE token = $1 AND purpose = 'sign_contract' AND used_at IS NULL
      RETURNING project_id, client_id
    `, [token]);
        if (!rows[0])
            return res.status(400).json({ error: 'Already used or expired' });
        const { project_id } = rows[0];
        await (0, connection_1.query)(`UPDATE projects SET contract_signed_at = NOW() WHERE id = $1`, [project_id]);
        await (0, connection_1.query)(`
      INSERT INTO pipeline_events (project_id, stage, action, performed_by_role, notes, signature)
      VALUES ($1, 'contract_signed', 'approved', 'client', 'לקוח חתם דיגיטלית', $2)
    `, [project_id, signature]);
        await pipeline_1.pipelineService.advanceStage(project_id, 'contract_sent', 'client', 'client', { notes: 'חתימה דיגיטלית' });
        res.json({ success: true, message: 'החוזה נחתם בהצלחה!' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST לקוח מילא סקר
router.post('/client/:token/survey', async (req, res) => {
    try {
        const { token } = req.params;
        const { q1, q2, q3, q4, q5, free_text } = req.body;
        const { rows } = await (0, connection_1.query)(`
      UPDATE client_tokens SET used_at = NOW()
      WHERE token = $1 AND purpose = 'survey'
      RETURNING project_id, client_id
    `, [token]);
        if (!rows[0])
            return res.status(400).json({ error: 'Invalid' });
        await (0, connection_1.query)(`
      INSERT INTO survey_responses (project_id, client_id, q1_overall, q2_quality, q3_timeliness, q4_communication, q5_would_recommend, free_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [rows[0].project_id, rows[0].client_id, q1, q2, q3, q4, q5 === 'yes', free_text]);
        const avg = Math.round((q1 + q2 + q3 + q4) / 4);
        await (0, connection_1.query)(`UPDATE projects SET survey_score = $2, survey_feedback = $3 WHERE id = $1`, [rows[0].project_id, avg, free_text]);
        res.json({ success: true, message: 'תודה על המשוב! 🙏' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
