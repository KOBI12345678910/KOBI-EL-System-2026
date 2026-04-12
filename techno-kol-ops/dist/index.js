"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
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
// ── v2.0 Foundry Layer ──
const brain_1 = __importDefault(require("./routes/brain"));
const ontology_2 = __importDefault(require("./routes/ontology"));
const aip_1 = require("./routes/aip");
const signatures_1 = __importDefault(require("./routes/signatures"));
const brainEngine_1 = require("./ai/brainEngine");
const apolloEngine_1 = require("./apollo/apolloEngine");
const eventBus_1 = require("./realtime/eventBus");
Object.defineProperty(exports, "eventBus", { enumerable: true, get: function () { return eventBus_1.eventBus; } });
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
// ─── AUTH ─────────────────────────────────────
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
        const token = jsonwebtoken_1.default.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
    }
    catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});
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
// ─── WEBSOCKET + ALERT ENGINE + AUTONOMOUS ENGINE ─────────────────
(0, websocket_1.initWebSocket)(server);
(0, alertEngine_1.startAlertEngine)();
(0, autonomousEngine_1.startAutonomousEngine)();
// ─── v2.0 BRAIN + EVENT BUS + APOLLO ─────────────────
(0, eventBus_1.initEventBus)();
brainEngine_1.brainEngine.boot().catch(err => console.error('[BRAIN] Boot error:', err));
setInterval(() => apolloEngine_1.apolloEngine.healthCheck().catch(() => { }), 60000);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`TECHNO-KOL OPS v2.0 — Foundry Edition running on port ${PORT}`);
    console.log(`[FOUNDRY] Brain Engine + Event Bus + Apollo + AIP + Ontology — ALL ONLINE`);
});
exports.default = app;
