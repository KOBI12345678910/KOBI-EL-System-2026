import express from 'express';
import cors from 'cors';
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

dotenv.config();

const app = express();
const server = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── AUTH ─────────────────────────────────────
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
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

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

// ─── HEALTH CHECK ─────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

// ─── WEBSOCKET + ALERT ENGINE + AUTONOMOUS ENGINE ─────────────────
initWebSocket(server);
startAlertEngine();
startAutonomousEngine();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`TECHNO-KOL OPS running on port ${PORT}`);
});

export default app;
