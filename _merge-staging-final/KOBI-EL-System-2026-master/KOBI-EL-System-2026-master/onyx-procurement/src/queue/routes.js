/**
 * ONYX Queue HTTP routes
 *
 * Mount in server.js:
 *   const queueRoutes = require('./src/queue/routes');
 *   app.use('/api/queue', queueRoutes);
 *
 * Routes:
 *   GET    /api/queue/:name/stats           — counts by status
 *   GET    /api/queue/:name/jobs?status=    — list jobs (filter by status)
 *   POST   /api/queue/:name/retry-all       — re-queue failed + dead jobs
 *   DELETE /api/queue/:name/dead-letter     — clear DLQ (requires confirm=true)
 *   POST   /api/queue/:name/add             — enqueue a job (dev helper)
 *
 * Allowed queue names are whitelisted against QUEUE_TYPES to prevent
 * arbitrary file creation via name injection.
 */

'use strict';

const express = require('express');
const { openQueue } = require('./queue');
const { QUEUE_TYPES } = require('./worker');

const router = express.Router();

const ALLOWED = new Set(Object.keys(QUEUE_TYPES));

function requireValidName(req, res, next) {
  const { name } = req.params;
  if (!ALLOWED.has(name)) {
    return res.status(404).json({
      error: 'unknown_queue',
      message: `queue '${name}' is not registered`,
      available: Array.from(ALLOWED),
    });
  }
  next();
}

function getQueue(name) {
  const opts = QUEUE_TYPES[name] || {};
  return openQueue(name, opts);
}

// GET /api/queue/:name/stats
router.get('/:name/stats', requireValidName, (req, res) => {
  try {
    const q = getQueue(req.params.name);
    const stats = q.stats();
    res.json({ queue: req.params.name, stats });
  } catch (err) {
    res.status(500).json({ error: 'queue_error', message: err.message });
  }
});

// GET /api/queue/:name/jobs?status=pending|processing|failed|dead|completed&limit=100
router.get('/:name/jobs', requireValidName, (req, res) => {
  try {
    const q = getQueue(req.params.name);
    const status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const jobs = q.list({ status, limit });
    // strip huge payloads by default unless ?full=1
    const full = req.query.full === '1';
    const out = full
      ? jobs
      : jobs.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          priority: j.priority,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          createdAt: j.createdAt,
          runAt: j.runAt,
          visibleUntil: j.visibleUntil,
          lastError: j.lastError,
          completedAt: j.completedAt,
        }));
    res.json({ queue: req.params.name, count: out.length, jobs: out });
  } catch (err) {
    res.status(500).json({ error: 'queue_error', message: err.message });
  }
});

// POST /api/queue/:name/retry-all
router.post('/:name/retry-all', requireValidName, (req, res) => {
  try {
    const q = getQueue(req.params.name);
    const count = q.retryAll();
    res.json({ queue: req.params.name, retried: count });
  } catch (err) {
    res.status(500).json({ error: 'queue_error', message: err.message });
  }
});

// DELETE /api/queue/:name/dead-letter
// Requires ?confirm=true or body { confirm: true } to actually clear.
// The archived dead.jsonl is kept on disk — we never truly lose data.
router.delete('/:name/dead-letter', requireValidName, (req, res) => {
  const confirm = req.query.confirm === 'true' || (req.body && req.body.confirm === true);
  if (!confirm) {
    return res.status(400).json({
      error: 'confirm_required',
      message: 'pass ?confirm=true (or body.confirm=true) to clear the dead letter queue',
    });
  }
  try {
    const q = getQueue(req.params.name);
    const count = q.clearDeadLetter({ confirm: true });
    res.json({ queue: req.params.name, cleared: count });
  } catch (err) {
    res.status(500).json({ error: 'queue_error', message: err.message });
  }
});

// POST /api/queue/:name/add — dev helper to enqueue a job over HTTP
//   body: { type, payload, priority, delay }
router.post('/:name/add', requireValidName, (req, res) => {
  try {
    const q = getQueue(req.params.name);
    const { type, payload, priority, delay, maxAttempts } = req.body || {};
    if (!type) return res.status(400).json({ error: 'type_required' });
    const job = q.add(type, payload || {}, { priority, delay, maxAttempts });
    res.status(201).json({ queue: req.params.name, job });
  } catch (err) {
    res.status(500).json({ error: 'queue_error', message: err.message });
  }
});

module.exports = router;
