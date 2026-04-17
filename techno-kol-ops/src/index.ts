import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool, query } from './db/connection';
import { initWebSocket } from './realtime/websocket';
import { startAlertEngine } from './realtime/alertEngine';
import { startAutonomousEngine } from './realtime/autonomousEngine';
import { getFactorySnapshot } from './services/ontology';
import workOrdersRouter from './routes/workOrders';
import employeesRouter from './routes/employees';
import materialsRouter from './routes/materials';
import clientsRouter from './routes/clients';
import suppliersRouter from './routes/suppliers';
import alertsRouter from './routes/alerts';
import attendanceRouter from './routes/attendance';
import financialsRouter from './routes/financials';
import gpsRouter from './routes/gps';
import tasksRouter from './routes/tasks';
import messagesRouter from './routes/messages';
import leadsRouter from './routes/leads';
import reportsRouter from './routes/reports';
import pipelineRouter from './routes/pipeline';
import intelligenceRouter from './routes/intelligence';
import supplyChainRouter from './routes/supplyChain';

import notificationsRouter from './routes/notifications';

// ── v2.0 Foundry Layer ──
import brainRouter from './routes/brain';
import ontologyRouter from './routes/ontology';
import { aipRouter } from './routes/aip';
import signaturesRouter from './routes/signatures';
import { brainEngine } from './ai/brainEngine';
import { apolloEngine } from './apollo/apolloEngine';
import { initEventBus, eventBus } from './realtime/eventBus';

// ── v2.1 Cross-Service Bridges (BUG-07 fix) ──
import { getDefaultProcurementClient } from './bridges/procurement-bridge';
import { getDefaultAiClient } from './bridges/ai-bridge';

dotenv.config();

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
const {
  helmetMw, corsMw, apiRateLimit, loginRateLimit
} = require('./middleware/security.js');

const app = express();
app.set('trust proxy', true); // Cloud Run proxy support
const server = createServer(app);

// BUG-SEC-003: Replace wide-open CORS with env-based allowlist, add helmet & rate limiting
app.use(helmetMw);
app.use(corsMw);
app.use(express.json());
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
    const { rows } = await query(
      `SELECT * FROM users WHERE username = $1 AND is_active = true`, [username]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [rows[0].id]);

    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username, role: rows[0].role },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: '24h' }
    );

    res.json({ token, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── BUG-SEC-006: Global auth on all /api/ routes (except auth & health) ──
import { authenticate } from './middleware/auth';
app.use('/api/ontology', authenticate);
app.use('/api/work-orders', authenticate);
app.use('/api/employees', authenticate);
app.use('/api/materials', authenticate);
app.use('/api/clients', authenticate);
app.use('/api/suppliers', authenticate);
app.use('/api/alerts', authenticate);
app.use('/api/attendance', authenticate);
app.use('/api/financials', authenticate);
app.use('/api/gps', authenticate);
app.use('/api/tasks', authenticate);
app.use('/api/messages', authenticate);
app.use('/api/leads', authenticate);
app.use('/api/reports', authenticate);
app.use('/api/pipeline', authenticate);
app.use('/api/intelligence', authenticate);
app.use('/api/supply-chain', authenticate);
app.use('/api/brain', authenticate);
app.use('/api/aip', authenticate);
app.use('/api/signatures', authenticate);
app.use('/api/notifications', authenticate);

// ─── ONTOLOGY SNAPSHOT ───────────────────────
app.get('/api/ontology/snapshot', async (req, res) => {
  try {
    const snapshot = await getFactorySnapshot();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get snapshot' });
  }
});

// ─── ROUTES ──────────────────────────────────
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/supply-chain', supplyChainRouter);

// ── v2.0 Foundry Routes ──
app.use('/api/brain', brainRouter);
app.use('/api/ontology', ontologyRouter);
app.use('/api/aip', aipRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/notifications', notificationsRouter);

// ─── HEALTH CHECK ─────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

// ─── KUBERNETES-STYLE PROBES (Agent 41) ──────────────
// /healthz → always 200 + metadata
// /livez   → always 200 (alive signal)
// /readyz  → 200 if DB responds within 2s, else 503
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgAg41 = require('../package.json');
const SERVICE_NAME_AG41 = pkgAg41.name as string;
const SERVICE_VERSION_AG41 = pkgAg41.version as string;

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
  let timer: NodeJS.Timeout | undefined;
  try {
    const dbPing = pool.query('SELECT 1');
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('db_timeout_2s')), DB_TIMEOUT_MS);
    });
    await Promise.race([dbPing, timeout]);
    if (timer) clearTimeout(timer);
    return res.status(200).json({ ready: true, service: SERVICE_NAME_AG41 });
  } catch (err: any) {
    if (timer) clearTimeout(timer);
    const reason = (err && err.message) ? err.message : 'db_unreachable';
    return res.status(503).json({ ready: false, reason });
  }
});

// ─── CROSS-SERVICE BRIDGE ENDPOINTS (BUG-07 fix) ─────────────────
// Expose bridge health so monitoring / QA can confirm wiring exists
app.get('/api/bridges/health', async (_req, res) => {
  const procClient = getDefaultProcurementClient();
  const aiClient = getDefaultAiClient();
  const [procOk, aiOk] = await Promise.all([
    procClient.healthCheck().catch(() => false),
    aiClient.healthCheck().catch(() => false),
  ]);
  const allOk = procOk && aiOk;
  res.status(allOk ? 200 : 207).json({
    status: allOk ? 'all_connected' : 'partial',
    bridges: {
      procurement: { healthy: procOk, url: process.env.ONYX_PROCUREMENT_URL || 'http://localhost:3100' },
      ai:          { healthy: aiOk,   url: process.env.ONYX_AI_URL || 'http://localhost:3300' },
    },
    timestamp: new Date().toISOString(),
  });
});

// Proxy: fetch purchase orders from procurement for project context
app.get('/api/bridges/procurement/purchase-orders', async (req, res) => {
  try {
    const client = getDefaultProcurementClient();
    const data = await client.getPurchaseOrders({
      status: req.query.status as string,
      project_id: req.query.project_id as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    if (!data) return res.status(502).json({ error: 'procurement_unreachable' });
    res.json({ orders: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'bridge_error' });
  }
});

// Proxy: fetch AI insights for operational entities
app.get('/api/bridges/ai/insights', async (req, res) => {
  try {
    const client = getDefaultAiClient();
    const data = await client.getInsights({
      entity_type: req.query.entity_type as string,
      entity_id: req.query.entity_id as string,
      category: req.query.category as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    if (!data) return res.status(502).json({ error: 'ai_unreachable' });
    res.json({ insights: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'bridge_error' });
  }
});

// ─── WEBSOCKET + ALERT ENGINE + AUTONOMOUS ENGINE ─────────────────
initWebSocket(server);
startAlertEngine();
startAutonomousEngine();

// ─── v2.0 BRAIN + EVENT BUS + APOLLO ─────────────────
initEventBus();
brainEngine.boot().catch(err => console.error('[BRAIN] Boot error:', err));
setInterval(() => apolloEngine.healthCheck().catch(() => {}), 60000);

export { eventBus };

const PORT = process.env.PORT || 3200;
server.listen(PORT, () => {
  console.log(`TECHNO-KOL OPS v2.0 — Foundry Edition running on port ${PORT}`);
  console.log(`[FOUNDRY] Brain Engine + Event Bus + Apollo + AIP + Ontology — ALL ONLINE`);
});

export default app;
