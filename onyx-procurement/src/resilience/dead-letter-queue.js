/**
 * ONYX — Dead Letter Queue (file-backed, append-only)
 * ═══════════════════════════════════════════════════════════════
 *
 * Stores operations that have failed every retry so a human (or a
 * replay job) can inspect and re-execute them later.
 *
 * Persistence:
 *   data/dlq/<queue>.jsonl        — one JSON object per line, append-only
 *   data/dlq/<queue>.tombstones   — ids that have been deleted (audit)
 *
 * Why JSONL?
 *   - No single-writer truncation/locking race like a JSON object.
 *   - Streamable for very large queues.
 *   - Line-based → trivial `tail -f` / log forwarding.
 *
 * Entry shape:
 *   {
 *     id,           // uuid-ish, unique within a queue
 *     operation,    // string: logical op name ("send-email", "pcn836-post")
 *     inputs,       // payload the worker was called with (JSON-safe)
 *     error,        // { message, stack, name, status }
 *     attempts,     // total tries before giving up
 *     enqueuedAt,   // ISO timestamp first inserted
 *     lastUpdatedAt,// ISO timestamp last touched
 *     deleted: false
 *   }
 *
 * Public API:
 *   createDeadLetterQueue(name, opts?)  → DLQ instance
 *   dlq.add(entry)                      → { id, ... }
 *   dlq.list({ includeDeleted })        → [entry]
 *   dlq.get(id)                         → entry | null
 *   dlq.remove(id, { actor, reason })   → boolean (audit-logged)
 *   dlq.replay(id, runner)              → runner(entry) result
 *   registerAdminRoutes(app, { getQueue, auth })
 *     GET    /api/admin/dlq/:queue
 *     POST   /api/admin/dlq/:queue/replay/:id
 *     DELETE /api/admin/dlq/:queue/:id
 *
 * Notes:
 *   - Zero deps. Uses Node built-ins only (`fs`, `path`, `crypto`).
 *   - Write path uses `fs.appendFileSync` for durability on small writes;
 *     heavy producers should batch or swap for a persistent queue.
 *   - Reads stream the JSONL file and filter out tombstoned ids — deletes
 *     are NEVER destructive; the line stays, we just mark it removed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Default storage root ───────────────────────────────────────
const DEFAULT_ROOT = path.join(process.cwd(), 'data', 'dlq');

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _newId() {
  // 16 random bytes → 32-char hex id. Good enough for a DLQ row id.
  return crypto.randomBytes(16).toString('hex');
}

function _safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (_err) {
    // Fallback: drop anything un-serializable (cyclic, BigInt, etc.)
    return JSON.stringify({
      _stringifyError: true,
      preview: String(obj).slice(0, 500),
    });
  }
}

// ─── Normalize an Error for safe JSON storage ───────────────────
function _serializeError(err) {
  if (!err) return null;
  if (typeof err === 'string') return { message: err };
  return {
    name: err.name || 'Error',
    message: err.message || String(err),
    stack: err.stack || null,
    status: err.status || err.statusCode || null,
    code: err.code || null,
  };
}

// ─── DLQ instance ───────────────────────────────────────────────
class DeadLetterQueue {
  constructor(name, opts = {}) {
    if (!name || typeof name !== 'string' || !/^[\w.-]+$/.test(name)) {
      throw new Error(
        `DeadLetterQueue: invalid queue name '${name}' (use [A-Za-z0-9_.-])`,
      );
    }
    this.name = name;
    this.root = opts.root || DEFAULT_ROOT;
    _ensureDir(this.root);
    this.filePath = path.join(this.root, `${name}.jsonl`);
    this.tombstonePath = path.join(this.root, `${name}.tombstones`);
    this.auditPath = path.join(this.root, `${name}.audit.jsonl`);

    // Touch the files so readers don't have to special-case missing paths.
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '');
    if (!fs.existsSync(this.tombstonePath)) fs.writeFileSync(this.tombstonePath, '');
    if (!fs.existsSync(this.auditPath)) fs.writeFileSync(this.auditPath, '');
  }

  // ─── Write: append a failed op to the queue ──────────────────
  add({ operation, inputs, error, attempts = 1 } = {}) {
    if (!operation) throw new Error('DLQ.add: operation is required');
    const now = new Date().toISOString();
    const entry = {
      id: _newId(),
      operation,
      inputs: inputs == null ? null : inputs,
      error: _serializeError(error),
      attempts: Number(attempts) || 1,
      enqueuedAt: now,
      lastUpdatedAt: now,
      deleted: false,
    };
    fs.appendFileSync(this.filePath, _safeStringify(entry) + '\n');
    return entry;
  }

  // ─── Read: load all lines, honor tombstones ──────────────────
  list({ includeDeleted = false } = {}) {
    const tombs = this._loadTombstones();
    const out = [];
    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw) return out;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (_err) {
        // Corrupt line → skip rather than blow up the listing.
        continue;
      }
      if (!row || !row.id) continue;
      const isDeleted = tombs.has(row.id);
      if (isDeleted && !includeDeleted) continue;
      if (isDeleted) row.deleted = true;
      out.push(row);
    }
    return out;
  }

  get(id) {
    // Scan is O(n) — fine for a DLQ which should stay small.
    // If this file grows beyond a few thousand rows, switch to a
    // persistent queue (Redis / Postgres) — the file is not the
    // primary operational store.
    const rows = this.list({ includeDeleted: true });
    return rows.find((r) => r.id === id) || null;
  }

  // ─── Remove: append to tombstones + audit log ────────────────
  remove(id, meta = {}) {
    const entry = this.get(id);
    if (!entry) return false;
    fs.appendFileSync(this.tombstonePath, id + '\n');
    const audit = {
      at: new Date().toISOString(),
      action: 'remove',
      id,
      actor: meta.actor || 'system',
      reason: meta.reason || null,
      queue: this.name,
      operation: entry.operation,
    };
    fs.appendFileSync(this.auditPath, _safeStringify(audit) + '\n');
    return true;
  }

  // ─── Replay: execute the entry's op via a caller-supplied runner ─
  async replay(id, runner) {
    if (typeof runner !== 'function') {
      throw new TypeError('DLQ.replay: runner must be a function');
    }
    const entry = this.get(id);
    if (!entry) {
      const e = new Error(`DLQ entry '${id}' not found in queue '${this.name}'`);
      e.status = 404;
      throw e;
    }
    if (entry.deleted) {
      const e = new Error(`DLQ entry '${id}' is tombstoned`);
      e.status = 410;
      throw e;
    }
    // Caller decides how to re-dispatch; we just provide the payload.
    const result = await runner(entry);
    const audit = {
      at: new Date().toISOString(),
      action: 'replay',
      id,
      queue: this.name,
      operation: entry.operation,
      ok: true,
    };
    fs.appendFileSync(this.auditPath, _safeStringify(audit) + '\n');
    return result;
  }

  // ─── Helpers ────────────────────────────────────────────────
  _loadTombstones() {
    const raw = fs.readFileSync(this.tombstonePath, 'utf8');
    if (!raw) return new Set();
    return new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean));
  }

  // For tests/ops only — truncates the jsonl file. Not exposed on API.
  _truncate() {
    fs.writeFileSync(this.filePath, '');
    fs.writeFileSync(this.tombstonePath, '');
    fs.writeFileSync(this.auditPath, '');
  }
}

// ─── Factory & process-wide registry ────────────────────────────
const _queues = new Map();
function createDeadLetterQueue(name, opts = {}) {
  const key = `${opts.root || DEFAULT_ROOT}::${name}`;
  if (_queues.has(key)) return _queues.get(key);
  const q = new DeadLetterQueue(name, opts);
  _queues.set(key, q);
  return q;
}
function getDeadLetterQueue(name, opts = {}) {
  return createDeadLetterQueue(name, opts);
}

/**
 * registerAdminRoutes — mount admin API on an Express-style app.
 *
 * @param {import('express').Express|Object} app
 * @param {Object}   [opts]
 * @param {Function} [opts.getQueue]   (name)=>DLQ (default: factory)
 * @param {Function} [opts.replayRunner] (entry)=>Promise<any>   REQUIRED for replay
 * @param {Function} [opts.auth]       (req,res,next) auth middleware (default: noop)
 */
function registerAdminRoutes(app, opts = {}) {
  if (!app || typeof app.get !== 'function') {
    throw new TypeError('registerAdminRoutes: app must expose Express-style get/post/delete');
  }
  const getQueue = opts.getQueue || ((name) => createDeadLetterQueue(name));
  const replayRunner = opts.replayRunner || null;
  const auth = typeof opts.auth === 'function' ? opts.auth : (_req, _res, next) => next();

  app.get('/api/admin/dlq/:queue', auth, (req, res) => {
    try {
      const q = getQueue(req.params.queue);
      const rows = q.list({ includeDeleted: req.query.includeDeleted === '1' });
      res.json({ queue: q.name, count: rows.length, entries: rows });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/dlq/:queue/replay/:id', auth, async (req, res) => {
    if (!replayRunner) {
      return res.status(501).json({
        error: 'No replay runner configured — pass { replayRunner } to registerAdminRoutes',
      });
    }
    try {
      const q = getQueue(req.params.queue);
      const result = await q.replay(req.params.id, replayRunner);
      res.json({ ok: true, id: req.params.id, result });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/admin/dlq/:queue/:id', auth, (req, res) => {
    try {
      const q = getQueue(req.params.queue);
      const actor =
        (req.user && (req.user.email || req.user.id)) ||
        req.headers['x-actor'] ||
        'admin';
      const reason = (req.body && req.body.reason) || req.query.reason || null;
      const ok = q.remove(req.params.id, { actor, reason });
      if (!ok) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true, id: req.params.id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

module.exports = {
  DeadLetterQueue,
  createDeadLetterQueue,
  getDeadLetterQueue,
  registerAdminRoutes,
  DEFAULT_ROOT,
};
