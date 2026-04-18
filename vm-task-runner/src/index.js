/**
 * VM Task Runner — Techno-Kol Uzi ERP 2026
 *
 * Role: Scheduled job executor & workflow orchestrator.
 *
 * Responsibilities:
 *  - Run cron-scheduled tasks (daily reports, VAT period triggers, payroll close, etc.)
 *  - Execute queued workflow steps from the Master Flow (see src/pipeline/*)
 *  - Call into the other 4 services via their HTTP APIs
 *  - Emit events consumed by ONYX_AI (intelligence layer)
 *
 * Port: 3400 (health + admin endpoints)
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const pino = require('pino');

const { registerJobs } = require('./jobs');
const { initQueue, startWorker } = require('./queue');
const { getHealth } = require('./health');

const PORT = process.env.VM_TASK_RUNNER_PORT || 3400;
const SERVICE_NAME = 'vm-task-runner';

const logger = pino({
  name: SERVICE_NAME,
  level: process.env.LOG_LEVEL || 'info',
});

async function main() {
  logger.info({ service: SERVICE_NAME, port: PORT }, 'starting');

  // --- HTTP admin/health API ---
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const h = await getHealth();
    res.status(h.ok ? 200 : 503).json(h);
  });

  app.get('/jobs', (_req, res) => {
    res.json({ jobs: registerJobs.registered || [] });
  });

  app.post('/jobs/:name/trigger', async (req, res) => {
    try {
      const result = await registerJobs.trigger(req.params.name, req.body || {});
      res.json({ ok: true, result });
    } catch (err) {
      logger.error({ err }, 'job trigger failed');
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'http listening');
  });

  // --- Cron jobs ---
  registerJobs.init({ cron, logger });

  // --- Queue worker (Redis-backed) ---
  try {
    await initQueue({ logger });
    startWorker({ logger });
  } catch (err) {
    logger.warn({ err: err.message }, 'queue not available — running cron-only mode');
  }

  logger.info('vm-task-runner ready');
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down');
  process.exit(0);
});
