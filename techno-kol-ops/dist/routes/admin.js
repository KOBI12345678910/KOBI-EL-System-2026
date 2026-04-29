"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushAuditEntry = pushAuditEntry;
/**
 * Admin Routes — /api/admin/*
 * Requires authentication + admin role (enforced at mount in index.ts)
 */
const express_1 = require("express");
const router = (0, express_1.Router)();
const users = [
    { id: '1', fullName: 'קובי אלגרבלי', username: 'kobi', email: 'kobi@company.co.il', role: 'admin', status: 'active', lastLogin: new Date().toISOString(), createdAt: '2026-01-01T00:00:00Z' },
    { id: '2', fullName: 'עוזי לוי', username: 'uzi', email: 'uzi@company.co.il', role: 'manager', status: 'active', lastLogin: new Date(Date.now() - 3600000).toISOString(), createdAt: '2026-01-05T00:00:00Z' },
    { id: '3', fullName: 'רונית כהן', username: 'ronit', email: 'ronit@company.co.il', role: 'accountant', status: 'active', lastLogin: new Date(Date.now() - 86400000).toISOString(), createdAt: '2026-01-10T00:00:00Z' },
    { id: '4', fullName: 'דני מזרחי', username: 'dani', email: 'dani@company.co.il', role: 'field_worker', status: 'active', lastLogin: null, createdAt: '2026-02-01T00:00:00Z' },
    { id: '5', fullName: 'שרה גולן', username: 'sara', email: 'sara@company.co.il', role: 'viewer', status: 'inactive', lastLogin: new Date(Date.now() - 604800000).toISOString(), createdAt: '2026-02-15T00:00:00Z' },
];
const auditLog = [
    { id: '1', timestamp: new Date().toISOString(), user: 'kobi', action: 'login', entityType: 'session', entityId: 'sess-001' },
    { id: '2', timestamp: new Date(Date.now() - 300000).toISOString(), user: 'kobi', action: 'update', entityType: 'employee', entityId: 'emp-42' },
    { id: '3', timestamp: new Date(Date.now() - 600000).toISOString(), user: 'uzi', action: 'create', entityType: 'project', entityId: 'proj-7' },
    { id: '4', timestamp: new Date(Date.now() - 900000).toISOString(), user: 'ronit', action: 'login', entityType: 'session', entityId: 'sess-002' },
    { id: '5', timestamp: new Date(Date.now() - 1200000).toISOString(), user: 'kobi', action: 'delete', entityType: 'supplier', entityId: 'sup-3' },
    { id: '6', timestamp: new Date(Date.now() - 1800000).toISOString(), user: 'uzi', action: 'update', entityType: 'finance', entityId: 'fin-12' },
    { id: '7', timestamp: new Date(Date.now() - 3600000).toISOString(), user: 'dani', action: 'login', entityType: 'session', entityId: 'sess-003' },
    { id: '8', timestamp: new Date(Date.now() - 7200000).toISOString(), user: 'ronit', action: 'create', entityType: 'invoice', entityId: 'inv-99' },
];
/* Helper to push an audit entry (exported for use by other routes) */
function pushAuditEntry(entry) {
    auditLog.unshift({ ...entry, id: String(Date.now()) });
    if (auditLog.length > 100)
        auditLog.length = 100;
}
/* ─── GET /api/admin/users ─────────────────────────────── */
router.get('/users', (_req, res) => {
    res.json(users);
});
/* ─── POST /api/admin/users ────────────────────────────── */
router.post('/users', (req, res) => {
    const { fullName, username, email, role, tempPassword } = req.body;
    if (!fullName || !username || !email) {
        return res.status(400).json({ error: 'fullName, username and email are required' });
    }
    if (users.some(u => u.username === username)) {
        return res.status(409).json({ error: 'Username already exists' });
    }
    const newUser = {
        id: String(Date.now()),
        fullName,
        username,
        email,
        role: role || 'viewer',
        status: 'active',
        lastLogin: null,
        createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    pushAuditEntry({ timestamp: new Date().toISOString(), user: req.user?.username || 'system', action: 'create', entityType: 'user', entityId: newUser.id });
    res.status(201).json(newUser);
});
/* ─── PUT /api/admin/users/:id ─────────────────────────── */
router.put('/users/:id', (req, res) => {
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1)
        return res.status(404).json({ error: 'User not found' });
    const { fullName, email, role, status } = req.body;
    if (fullName)
        users[idx].fullName = fullName;
    if (email)
        users[idx].email = email;
    if (role)
        users[idx].role = role;
    if (status)
        users[idx].status = status;
    pushAuditEntry({ timestamp: new Date().toISOString(), user: req.user?.username || 'system', action: 'update', entityType: 'user', entityId: req.params.id });
    res.json(users[idx]);
});
/* ─── DELETE /api/admin/users/:id (deactivate) ─────────── */
router.delete('/users/:id', (req, res) => {
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1)
        return res.status(404).json({ error: 'User not found' });
    users[idx].status = 'inactive';
    pushAuditEntry({ timestamp: new Date().toISOString(), user: req.user?.username || 'system', action: 'delete', entityType: 'user', entityId: req.params.id });
    res.json({ ok: true, id: req.params.id });
});
/* ─── GET /api/admin/audit-log ─────────────────────────── */
router.get('/audit-log', (_req, res) => {
    res.json(auditLog.slice(0, 100));
});
/* ─── GET /api/admin/stats ─────────────────────────────── */
router.get('/stats', (_req, res) => {
    const total = users.length;
    const active = users.filter(u => u.status === 'active').length;
    const admins = users.filter(u => u.role === 'admin').length;
    const oneDayAgo = Date.now() - 86400000;
    const loginsToday = auditLog.filter(e => e.action === 'login' && new Date(e.timestamp).getTime() > oneDayAgo).length;
    res.json({
        users: { total, active, admins },
        sessions: { active: loginsToday },
        database: { status: 'connected', migrations: 34 },
        services: { procurement: 'up', ai: 'up', payroll: 'up' },
    });
});
exports.default = router;
