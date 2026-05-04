"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const dotenv_1 = __importDefault(require("dotenv"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connection_1 = require("./db/connection");
const websocket_1 = require("./realtime/websocket");
const alertEngine_1 = require("./realtime/alertEngine");
const autonomousEngine_1 = require("./realtime/autonomousEngine");
const ontology_1 = require("./services/ontology");
const workOrders_1 = __importDefault(require("./routes/workOrders"));
const employees_1 = __importDefault(require("./routes/employees"));
const materials_1 = __importDefault(require("./routes/materials"));
const clients_1 = __importDefault(require("./routes/clients"));
const suppliers_1 = __importDefault(require("./routes/suppliers"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const attendance_1 = __importDefault(require("./routes/attendance"));
const financials_1 = __importDefault(require("./routes/financials"));
const gps_1 = __importDefault(require("./routes/gps"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const messages_1 = __importDefault(require("./routes/messages"));
const leads_1 = __importDefault(require("./routes/leads"));
const reports_1 = __importDefault(require("./routes/reports"));
const pipeline_1 = __importDefault(require("./routes/pipeline"));
const intelligence_1 = __importDefault(require("./routes/intelligence"));
const supplyChain_1 = __importDefault(require("./routes/supplyChain"));
const notifications_1 = __importDefault(require("./routes/notifications"));
// ── v2.0 Foundry Layer ──
const brain_1 = __importDefault(require("./routes/brain"));
const ontology_2 = __importDefault(require("./routes/ontology"));
const aip_1 = require("./routes/aip");
const signatures_1 = __importDefault(require("./routes/signatures"));
const admin_1 = __importDefault(require("./routes/admin"));
const brainEngine_1 = require("./ai/brainEngine");
const apolloEngine_1 = require("./apollo/apolloEngine");
const eventBus_1 = require("./realtime/eventBus");
Object.defineProperty(exports, "eventBus", { enumerable: true, get: function () { return eventBus_1.eventBus; } });
// ── v2.1 Cross-Service Bridges (BUG-07 fix) ──
const procurement_bridge_1 = require("./bridges/procurement-bridge");
const ai_bridge_1 = require("./bridges/ai-bridge");
dotenv_1.default.config();
// ── BUG-SEC-008: Validate JWT_SECRET on startup ──
// Production: fail-closed. Development: auto-generate dev secret + warn.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'undefined') {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET is not set in production.');
        console.error('  Set a real secret:  openssl rand -hex 32');
        process.exit(1);
    }
    // Dev fallback: ephemeral in-memory secret, logged as warning
    const crypto = require('crypto');
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  JWT_SECRET not set — using ephemeral dev secret. Set a real one in .env for stable sessions.');
}
// ── Security Middleware (BUG-SEC-003 fix) ──
const { helmetMw, corsMw, apiRateLimit, loginRateLimit } = require('./middleware/security.js');
const app = (0, express_1.default)();
app.set('trust proxy', true); // Cloud Run proxy support
const server = (0, http_1.createServer)(app);
// BUG-SEC-003: Replace wide-open CORS with env-based allowlist, add helmet & rate limiting
app.use(helmetMw);
app.use(corsMw);
app.use(express_1.default.json());
app.use('/api/', apiRateLimit);
//  ROOT ROUTE (Cloud Run health) 
app.get("/", (_req, res) => {
    res.json({ service: "techno-kol-ops", version: "2.0", status: "running" });
});
// ─── AUTH ─────────────────────────────────────
app.use('/api/auth/login', loginRateLimit);
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const { rows } = await (0, connection_1.query)(`SELECT * FROM users WHERE username = $1 AND is_active = true`, [username]);
        if (!rows[0])
            return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcryptjs_1.default.compare(password, rows[0].password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Invalid credentials' });
        await (0, connection_1.query)(`UPDATE users SET last_login = NOW() WHERE id = $1`, [rows[0].id]);
        const token = jsonwebtoken_1.default.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });
        res.json({ token, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
    }
    catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});
// ── BUG-SEC-006: Global auth on all /api/ routes (except auth & health) ──
const auth_1 = require("./middleware/auth");
app.use('/api/ontology', auth_1.authenticate);
app.use('/api/work-orders', auth_1.authenticate);
app.use('/api/employees', auth_1.authenticate);
app.use('/api/materials', auth_1.authenticate);
app.use('/api/clients', auth_1.authenticate);
app.use('/api/suppliers', auth_1.authenticate);
app.use('/api/alerts', auth_1.authenticate);
app.use('/api/attendance', auth_1.authenticate);
app.use('/api/financials', auth_1.authenticate);
app.use('/api/gps', auth_1.authenticate);
app.use('/api/tasks', auth_1.authenticate);
app.use('/api/messages', auth_1.authenticate);
app.use('/api/leads', auth_1.authenticate);
app.use('/api/reports', auth_1.authenticate);
app.use('/api/pipeline', auth_1.authenticate);
app.use('/api/intelligence', auth_1.authenticate);
app.use('/api/supply-chain', auth_1.authenticate);
app.use('/api/brain', auth_1.authenticate);
app.use('/api/aip', auth_1.authenticate);
app.use('/api/signatures', auth_1.authenticate);
app.use('/api/notifications', auth_1.authenticate);
app.use('/api/admin', auth_1.authenticate, auth_1.requireAdmin, admin_1.default);
// ─── ONTOLOGY SNAPSHOT ───────────────────────
app.get('/api/ontology/snapshot', async (req, res) => {
    try {
        const snapshot = await (0, ontology_1.getFactorySnapshot)();
        res.json(snapshot);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to get snapshot' });
    }
});
// ─── ROUTES ──────────────────────────────────
app.use('/api/work-orders', workOrders_1.default);
app.use('/api/employees', employees_1.default);
app.use('/api/materials', materials_1.default);
app.use('/api/clients', clients_1.default);
app.use('/api/suppliers', suppliers_1.default);
app.use('/api/alerts', alerts_1.default);
app.use('/api/attendance', attendance_1.default);
app.use('/api/financials', financials_1.default);
app.use('/api/gps', gps_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/leads', leads_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/pipeline', pipeline_1.default);
app.use('/api/intelligence', intelligence_1.default);
app.use('/api/supply-chain', supplyChain_1.default);
// ── v2.0 Foundry Routes ──
app.use('/api/brain', brain_1.default);
app.use('/api/ontology', ontology_2.default);
app.use('/api/aip', aip_1.aipRouter);
app.use('/api/signatures', signatures_1.default);
app.use('/api/notifications', notifications_1.default);
// ─── HEALTH CHECK ─────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        await connection_1.pool.query('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
    catch {
        res.status(500).json({ status: 'error' });
    }
});
// ─── KUBERNETES-STYLE PROBES (Agent 41) ──────────────
// /healthz → always 200 + metadata
// /livez   → always 200 (alive signal)
// /readyz  → 200 if DB responds within 2s, else 503
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgAg41 = require('../package.json');
const SERVICE_NAME_AG41 = pkgAg41.name;
const SERVICE_VERSION_AG41 = pkgAg41.version;
app.get('/healthz', (_req, res) => {
    res.status(200).json({
        ok: true,
        service: SERVICE_NAME_AG41,
        version: SERVICE_VERSION_AG41,
        uptime: process.uptime(),
    });
});
app.get('/livez', (_req, res) => {
    res.status(200).json({ alive: true });
});
app.get('/readyz', async (_req, res) => {
    const DB_TIMEOUT_MS = 2000;
    let timer;
    try {
        const dbPing = connection_1.pool.query('SELECT 1');
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('db_timeout_2s')), DB_TIMEOUT_MS);
        });
        await Promise.race([dbPing, timeout]);
        if (timer)
            clearTimeout(timer);
        return res.status(200).json({ ready: true, service: SERVICE_NAME_AG41 });
    }
    catch (err) {
        if (timer)
            clearTimeout(timer);
        const reason = (err && err.message) ? err.message : 'db_unreachable';
        return res.status(503).json({ ready: false, reason });
    }
});
// ─── CROSS-SERVICE BRIDGE ENDPOINTS (BUG-07 fix) ─────────────────
// Expose bridge health so monitoring / QA can confirm wiring exists
app.get('/api/bridges/health', async (_req, res) => {
    const procClient = (0, procurement_bridge_1.getDefaultProcurementClient)();
    const aiClient = (0, ai_bridge_1.getDefaultAiClient)();
    const [procOk, aiOk] = await Promise.all([
        procClient.healthCheck().catch(() => false),
        aiClient.healthCheck().catch(() => false),
    ]);
    const allOk = procOk && aiOk;
    res.status(allOk ? 200 : 207).json({
        status: allOk ? 'all_connected' : 'partial',
        bridges: {
            procurement: { healthy: procOk, url: process.env.ONYX_PROCUREMENT_URL || 'http://localhost:3100' },
            ai: { healthy: aiOk, url: process.env.ONYX_AI_URL || 'http://localhost:3300' },
        },
        timestamp: new Date().toISOString(),
    });
});
// Proxy: fetch purchase orders from procurement for project context
app.get('/api/bridges/procurement/purchase-orders', async (req, res) => {
    try {
        const client = (0, procurement_bridge_1.getDefaultProcurementClient)();
        const data = await client.getPurchaseOrders({
            status: req.query.status,
            project_id: req.query.project_id,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });
        if (!data)
            return res.status(502).json({ error: 'procurement_unreachable' });
        res.json({ orders: data });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'bridge_error' });
    }
});
// Proxy: fetch AI insights for operational entities
app.get('/api/bridges/ai/insights', async (req, res) => {
    try {
        const client = (0, ai_bridge_1.getDefaultAiClient)();
        const data = await client.getInsights({
            entity_type: req.query.entity_type,
            entity_id: req.query.entity_id,
            category: req.query.category,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });
        if (!data)
            return res.status(502).json({ error: 'ai_unreachable' });
        res.json({ insights: data });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'bridge_error' });
    }
});
// ─── WEBSOCKET + ALERT ENGINE + AUTONOMOUS ENGINE ─────────────────
(0, websocket_1.initWebSocket)(server);
(0, alertEngine_1.startAlertEngine)();
(0, autonomousEngine_1.startAutonomousEngine)();
// ─── PERIODIC SNAPSHOT BROADCAST (every 30s) ──────────────────────
// Broadcasts current system snapshot to all connected WS clients so
// dashboards update in real-time without polling.
setInterval(async () => {
    try {
        const snapshot = await (0, ontology_1.getFactorySnapshot)();
        (0, websocket_1.broadcastToAll)('snapshot_update', snapshot);
    }
    catch { /* ignore — never crash the server */ }
}, 30000);
// ─── v2.0 BRAIN + EVENT BUS + APOLLO ─────────────────
(0, eventBus_1.initEventBus)();
brainEngine_1.brainEngine.boot().catch(err => console.error('[BRAIN] Boot error:', err));
setInterval(() => apolloEngine_1.apolloEngine.healthCheck().catch(() => { }), 60000);
const PORT = process.env.PORT || 3200;
server.listen(PORT, () => {
    console.log(`TECHNO-KOL OPS v2.0 — Foundry Edition running on port ${PORT}`);
    console.log(`[FOUNDRY] Brain Engine + Event Bus + Apollo + AIP + Ontology — ALL ONLINE`);
});
exports.default = app;
