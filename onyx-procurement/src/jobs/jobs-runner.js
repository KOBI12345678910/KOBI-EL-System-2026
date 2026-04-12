/**
 * ONYX JOBS — Runner (process worker + Express routes)
 * ─────────────────────────────────────────────────────
 * Agent-77 / Scheduled Jobs Framework
 *
 * Purpose:
 *   The runner is the glue between the low-level scheduler, the registry,
 *   and the outside world. It exposes:
 *
 *     - bootstrap(opts)                 — build a scheduler instance,
 *                                         register default jobs, wire
 *                                         persistence, return the instance.
 *
 *     - registerAdminRoutes(app, run)   — mount the 4 admin endpoints on
 *                                         an Express app.
 *
 *     - runAsWorker(opts)               — IMPORTANT: only called when this
 *                                         file is executed directly via
 *                                         `node src/jobs/jobs-runner.js`.
 *                                         Wires stdout logger, registers
 *                                         default jobs, and starts ticking.
 *                                         Never called by `require`.
 *
 *   Admin endpoints (all mounted under /api/admin/jobs):
 *     GET    /api/admin/jobs             → list + status
 *     GET    /api/admin/jobs/:id         → details + history
 *     POST   /api/admin/jobs/:id/run-now → fire the handler immediately
 *     POST   /api/admin/jobs/:id/pause   → stop future scheduled runs
 *     POST   /api/admin/jobs/:id/resume  → (bonus) revert the pause
 *
 *   NOTE: importing this module has ZERO side effects. It never starts the
 *   scheduler unless you explicitly call bootstrap().start() or run it as
 *   a worker. server.js may wire routes without actually ticking.
 */

'use strict';

const { createScheduler } = require('./scheduler');
const { createJsonlPersistence } = require('./persistence');
const registry = require('./jobs-registry');

// ─────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────────

/**
 * Build a scheduler instance with persistence + default jobs wired up.
 *
 * @param {object} opts
 * @param {object=} opts.logger           pino-style logger
 * @param {string=} opts.persistenceFile  override jsonl path
 * @param {number=} opts.jitterMs         default jitter across jobs
 * @param {boolean=} opts.registerDefaults  default true
 * @param {Array=} opts.extraJobs         additional JobDefinitions
 * @param {Function=} opts.onFailure      async ({id, hook, error}) => void
 */
function bootstrap(opts = {}) {
  const logger = opts.logger || defaultLogger();
  const persistence = createJsonlPersistence({ file: opts.persistenceFile });
  const scheduler = createScheduler({
    jitterMs: Number.isFinite(opts.jitterMs) ? opts.jitterMs : 10_000,
    persistence,
    logger,
    onFailure: opts.onFailure || null,
  });

  if (opts.registerDefaults !== false) {
    const defaults = registry.registerDefaults();
    for (const job of defaults) {
      try {
        scheduler.register(job);
      } catch (err) {
        logger.error(
          { id: job.id, err: err && err.message },
          'jobs-runner.register.default_failed'
        );
      }
    }
  }

  if (Array.isArray(opts.extraJobs)) {
    for (const job of opts.extraJobs) {
      try {
        scheduler.register(job);
      } catch (err) {
        logger.error(
          { id: job && job.id, err: err && err.message },
          'jobs-runner.register.extra_failed'
        );
      }
    }
  }

  return { scheduler, persistence, logger };
}

// ─────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────

/**
 * Mount GET/POST admin endpoints on an existing Express app.
 *
 * @param {import('express').Express} app
 * @param {ReturnType<typeof bootstrap>} runner
 */
function registerAdminRoutes(app, runner) {
  if (!app || typeof app.get !== 'function') {
    throw new TypeError('registerAdminRoutes: expected an Express app');
  }
  if (!runner || !runner.scheduler) {
    throw new TypeError('registerAdminRoutes: expected a bootstrap() runner');
  }
  const { scheduler, persistence } = runner;

  // GET /api/admin/jobs — list + status
  app.get('/api/admin/jobs', (_req, res) => {
    try {
      const items = scheduler.list();
      res.json({
        ok: true,
        count: items.length,
        jobs: items,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/admin/jobs/:id — details + history
  app.get('/api/admin/jobs/:id', async (req, res) => {
    try {
      const info = scheduler.get(req.params.id);
      if (!info) return res.status(404).json({ ok: false, error: 'job not found' });
      let history = [];
      if (persistence && typeof persistence.readHistory === 'function') {
        history = await persistence.readHistory(req.params.id, 100);
      }
      res.json({
        ok: true,
        job: info,
        history,
        persistenceFile: persistence ? persistence.file : null,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/jobs/:id/run-now
  app.post('/api/admin/jobs/:id/run-now', async (req, res) => {
    try {
      const info = scheduler.get(req.params.id);
      if (!info) return res.status(404).json({ ok: false, error: 'job not found' });
      // Fire and forget — return immediately; the handler writes to jsonl
      // and the admin can re-GET the job to see the result.
      scheduler.runNow(req.params.id).catch(() => {});
      res.json({ ok: true, triggered: req.params.id, at: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/jobs/:id/pause
  app.post('/api/admin/jobs/:id/pause', (req, res) => {
    try {
      const ok = scheduler.pause(req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: 'job not found' });
      res.json({ ok: true, paused: req.params.id });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/jobs/:id/resume (bonus — symmetrical to pause)
  app.post('/api/admin/jobs/:id/resume', (req, res) => {
    try {
      const ok = scheduler.resume(req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: 'job not found' });
      res.json({ ok: true, resumed: req.params.id });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────
// STANDALONE WORKER MODE
// ─────────────────────────────────────────────────────────────────
//
// When this file is run directly (node src/jobs/jobs-runner.js), we spin
// up a scheduler with a stdout-friendly logger and begin ticking. We also
// wire SIGINT/SIGTERM to stop() so the process exits cleanly.
//

function defaultLogger() {
  const ts = () => new Date().toISOString();
  return {
    info:  (obj, msg) => console.log(`[${ts()}] info  ${msg || ''} ${fmt(obj)}`),
    warn:  (obj, msg) => console.warn(`[${ts()}] warn  ${msg || ''} ${fmt(obj)}`),
    error: (obj, msg) => console.error(`[${ts()}] error ${msg || ''} ${fmt(obj)}`),
    debug: (obj, msg) => {
      if (process.env.ONYX_JOBS_DEBUG) {
        console.log(`[${ts()}] debug ${msg || ''} ${fmt(obj)}`);
      }
    },
  };
}

function fmt(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  try { return JSON.stringify(obj); } catch (_) { return String(obj); }
}

function runAsWorker(opts = {}) {
  const runner = bootstrap(opts);
  runner.scheduler.start();
  const stop = signal => {
    runner.logger.info({ signal }, 'jobs-runner.shutdown');
    runner.scheduler.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  return runner;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

module.exports = {
  bootstrap,
  registerAdminRoutes,
  runAsWorker,
  defaultLogger,
};

// CLI entry — only when this file is the main module.
if (require.main === module) {
  runAsWorker();
}
