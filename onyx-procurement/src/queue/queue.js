/**
 * ONYX Queue — persistent FIFO/priority queue (zero-dep, built from scratch)
 *
 * Intended for DEV / SMALL-SCALE use only. NOT a replacement for Redis/BullMQ
 * in production — no clustering, no cross-host locking, no streaming. For
 * multi-host production workloads, route jobs through Redis + BullMQ instead.
 *
 * Storage model
 * ─────────────
 *   data/queue/<name>.jsonl           — append-only log of job events
 *   data/queue/<name>.state.json      — compacted current state (periodic)
 *   data/queue/<name>.lock            — lock file (atomic O_EXCL)
 *   data/queue/<name>.dead.jsonl      — dead letter queue (append-only)
 *
 * Each line in <name>.jsonl is one of:
 *   {"op":"add","job":{...}}
 *   {"op":"claim","id":...,"at":...,"visibleUntil":...}
 *   {"op":"ack","id":...}
 *   {"op":"fail","id":...,"error":"..."}
 *   {"op":"dead","id":...,"error":"..."}
 *
 * On startup the queue replays the log into an in-memory structure, then
 * every N ops or N seconds compacts it into state.json + truncates the log.
 *
 * Priority levels:  'high' | 'normal' | 'low'  (mapped to 0|1|2)
 *
 * File locking:
 *   Atomic via fs.openSync(..., 'wx')  (O_EXCL). If lock exists, retry with
 *   exponential backoff up to ~3s. A stale-lock sweep unlinks locks older
 *   than STALE_LOCK_MS.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

// ─── constants ─────────────────────────────────────────────────────────────
const PRIORITY_HIGH = 0;
const PRIORITY_NORMAL = 1;
const PRIORITY_LOW = 2;

const PRIORITY_MAP = {
  high: PRIORITY_HIGH,
  normal: PRIORITY_NORMAL,
  low: PRIORITY_LOW,
  0: PRIORITY_HIGH,
  1: PRIORITY_NORMAL,
  2: PRIORITY_LOW,
};

const DEFAULT_VISIBILITY_MS = 30_000;     // 30s
const DEFAULT_MAX_ATTEMPTS = 3;
const LOCK_RETRY_MAX_MS = 3_000;
const STALE_LOCK_MS = 60_000;             // consider lock stale after 60s
const COMPACT_EVERY_OPS = 200;            // auto-compact cadence

// ─── helpers ───────────────────────────────────────────────────────────────
function genId() {
  return (
    Date.now().toString(36) +
    '-' +
    crypto.randomBytes(6).toString('hex')
  );
}

function nowMs() {
  return Date.now();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizePriority(p) {
  if (p == null) return PRIORITY_NORMAL;
  const v = PRIORITY_MAP[p];
  return v == null ? PRIORITY_NORMAL : v;
}

function sleepSync(ms) {
  // micro sleep for lock retry — we use a busy-ish wait on small durations
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
}

// ─── file lock (O_EXCL) ────────────────────────────────────────────────────
function acquireLock(lockPath) {
  const deadline = Date.now() + LOCK_RETRY_MAX_MS;
  let backoff = 5;
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // stale-lock sweep
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
          try { fs.unlinkSync(lockPath); } catch { /* race */ }
          continue;
        }
      } catch { /* lock vanished — retry */ }
      if (Date.now() > deadline) {
        throw new Error(`ONYX queue: could not acquire lock ${lockPath} within ${LOCK_RETRY_MAX_MS}ms`);
      }
      sleepSync(backoff);
      backoff = Math.min(backoff * 2, 100);
    }
  }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
}

function withLock(lockPath, fn) {
  acquireLock(lockPath);
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}

// ─── Queue class ───────────────────────────────────────────────────────────
class Queue extends EventEmitter {
  /**
   * @param {string} name
   * @param {object} [opts]
   * @param {string} [opts.dataDir]         root data dir (default: ./data/queue)
   * @param {number} [opts.visibilityMs]    visibility timeout per job
   * @param {number} [opts.maxAttempts]     default max attempts per job
   */
  constructor(name, opts = {}) {
    super();
    if (!name || !/^[a-z0-9_-]+$/i.test(name)) {
      throw new Error('ONYX queue: name must match /^[a-z0-9_-]+$/i');
    }
    this.name = name;
    this.dataDir = opts.dataDir || path.join(process.cwd(), 'data', 'queue');
    this.visibilityMs = opts.visibilityMs || DEFAULT_VISIBILITY_MS;
    this.maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;

    this.logPath = path.join(this.dataDir, `${name}.jsonl`);
    this.statePath = path.join(this.dataDir, `${name}.state.json`);
    this.lockPath = path.join(this.dataDir, `${name}.lock`);
    this.deadPath = path.join(this.dataDir, `${name}.dead.jsonl`);

    // in-memory state
    // jobs: Map<id, job>
    //   job = { id, type, payload, priority, status, createdAt, runAt,
    //           visibleUntil, attempts, maxAttempts, lastError, completedAt }
    //   status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead'
    this.jobs = new Map();
    this.opsSinceCompact = 0;

    ensureDir(this.dataDir);
    this._replay();
  }

  // ── replay log to rebuild in-memory state ────────────────────────────────
  _replay() {
    // load compacted state
    if (fs.existsSync(this.statePath)) {
      try {
        const raw = fs.readFileSync(this.statePath, 'utf8');
        const obj = JSON.parse(raw);
        if (obj && Array.isArray(obj.jobs)) {
          for (const j of obj.jobs) this.jobs.set(j.id, j);
        }
      } catch (err) {
        this.emit('error', new Error(`ONYX queue: corrupt state.json (${err.message}) — continuing from log only`));
      }
    }
    // replay log
    if (fs.existsSync(this.logPath)) {
      const raw = fs.readFileSync(this.logPath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        this._applyOp(entry, /*persist=*/false);
      }
    }
  }

  _applyOp(entry, persist) {
    switch (entry.op) {
      case 'add': {
        const j = entry.job;
        this.jobs.set(j.id, j);
        break;
      }
      case 'claim': {
        const j = this.jobs.get(entry.id);
        if (j) {
          j.status = 'processing';
          j.visibleUntil = entry.visibleUntil;
          j.attempts = (j.attempts || 0) + 1;
        }
        break;
      }
      case 'ack': {
        const j = this.jobs.get(entry.id);
        if (j) {
          j.status = 'completed';
          j.completedAt = entry.at || nowMs();
        }
        break;
      }
      case 'fail': {
        const j = this.jobs.get(entry.id);
        if (j) {
          j.status = 'pending';
          j.lastError = entry.error || null;
          j.runAt = entry.runAt || nowMs();
          j.visibleUntil = null;
        }
        break;
      }
      case 'dead': {
        const j = this.jobs.get(entry.id);
        if (j) {
          j.status = 'dead';
          j.lastError = entry.error || j.lastError;
          j.completedAt = entry.at || nowMs();
        }
        break;
      }
      case 'remove': {
        this.jobs.delete(entry.id);
        break;
      }
      default:
        break;
    }
    if (persist) {
      this._append(entry);
      this.opsSinceCompact++;
      if (this.opsSinceCompact >= COMPACT_EVERY_OPS) this.compact();
    }
  }

  _append(entry) {
    fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
  }

  // ── public API ───────────────────────────────────────────────────────────

  /**
   * Add a job to the queue.
   * @param {string} type              job type, e.g. 'pdf-generation'
   * @param {object} payload           arbitrary JSON-serializable payload
   * @param {object} [opts]
   * @param {string|number} [opts.priority='normal']
   * @param {number}        [opts.delay=0]         ms before job becomes runnable
   * @param {number}        [opts.runAt]           absolute ts (overrides delay)
   * @param {number}        [opts.maxAttempts]
   * @returns {object} the created job
   */
  add(type, payload, opts = {}) {
    if (!type || typeof type !== 'string') {
      throw new Error('ONYX queue: add() requires a string type');
    }
    const job = {
      id: genId(),
      type,
      payload: payload == null ? {} : payload,
      priority: normalizePriority(opts.priority),
      status: 'pending',
      createdAt: nowMs(),
      runAt: opts.runAt != null ? opts.runAt : nowMs() + (opts.delay || 0),
      visibleUntil: null,
      attempts: 0,
      maxAttempts: opts.maxAttempts || this.maxAttempts,
      lastError: null,
      completedAt: null,
    };
    withLock(this.lockPath, () => {
      this._applyOp({ op: 'add', job }, /*persist=*/true);
    });
    this.emit('added', job);
    return job;
  }

  /**
   * Claim the next runnable job.  Returns null if none available.
   * The job becomes invisible for visibilityMs; if not ack'd/failed by then,
   * a subsequent claim() will re-deliver it.
   */
  claim() {
    let chosen = null;
    withLock(this.lockPath, () => {
      // 1) reclaim expired processing jobs
      const now = nowMs();
      for (const j of this.jobs.values()) {
        if (j.status === 'processing' && j.visibleUntil != null && j.visibleUntil <= now) {
          // visibility timeout elapsed — mark as pending again (but count as a fail)
          if (j.attempts >= j.maxAttempts) {
            this._applyOp({ op: 'dead', id: j.id, at: now, error: 'visibility_timeout' }, true);
            this._writeDead(j);
          } else {
            this._applyOp({ op: 'fail', id: j.id, error: 'visibility_timeout', runAt: now }, true);
          }
        }
      }
      // 2) pick next pending job: priority asc, runAt asc, createdAt asc
      let best = null;
      for (const j of this.jobs.values()) {
        if (j.status !== 'pending') continue;
        if (j.runAt > now) continue;
        if (
          best == null ||
          j.priority < best.priority ||
          (j.priority === best.priority && j.runAt < best.runAt) ||
          (j.priority === best.priority && j.runAt === best.runAt && j.createdAt < best.createdAt)
        ) {
          best = j;
        }
      }
      if (best) {
        const visibleUntil = now + this.visibilityMs;
        this._applyOp({ op: 'claim', id: best.id, at: now, visibleUntil }, true);
        chosen = { ...best, visibleUntil, status: 'processing', attempts: best.attempts };
      }
    });
    return chosen;
  }

  /** Mark a claimed job as successfully completed. */
  ack(id) {
    withLock(this.lockPath, () => {
      const j = this.jobs.get(id);
      if (!j) return;
      this._applyOp({ op: 'ack', id, at: nowMs() }, true);
    });
    this.emit('completed', this.jobs.get(id));
  }

  /**
   * Mark a claimed job as failed. If attempts >= maxAttempts, job is moved
   * to the dead letter queue. Otherwise it is re-queued (with exponential
   * backoff).
   */
  fail(id, errorMessage) {
    const errStr = errorMessage ? String(errorMessage).slice(0, 2000) : 'unknown_error';
    let deadJob = null;
    withLock(this.lockPath, () => {
      const j = this.jobs.get(id);
      if (!j) return;
      if (j.attempts >= j.maxAttempts) {
        this._applyOp({ op: 'dead', id, at: nowMs(), error: errStr }, true);
        deadJob = { ...j, lastError: errStr };
        this._writeDead(deadJob);
      } else {
        // exponential backoff: 2^attempts seconds, capped 5 min
        const backoffMs = Math.min(Math.pow(2, j.attempts) * 1000, 300_000);
        this._applyOp({ op: 'fail', id, error: errStr, runAt: nowMs() + backoffMs }, true);
      }
    });
    if (deadJob) this.emit('dead', deadJob);
    else this.emit('failed', this.jobs.get(id));
  }

  _writeDead(job) {
    fs.appendFileSync(this.deadPath, JSON.stringify({ at: nowMs(), job }) + '\n');
  }

  /** List jobs by status (or all). */
  list({ status, limit = 100 } = {}) {
    const out = [];
    for (const j of this.jobs.values()) {
      if (status && j.status !== status) continue;
      out.push(j);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Get counts. */
  stats() {
    const s = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0, total: 0 };
    const now = nowMs();
    for (const j of this.jobs.values()) {
      s.total++;
      if (j.status === 'pending') s.pending++;
      else if (j.status === 'processing') {
        if (j.visibleUntil != null && j.visibleUntil <= now) s.pending++;
        else s.processing++;
      } else if (j.status === 'completed') s.completed++;
      else if (j.status === 'dead') s.dead++;
      else if (j.status === 'failed') s.failed++;
    }
    return s;
  }

  /** Re-queue all failed/dead jobs. */
  retryAll() {
    let count = 0;
    withLock(this.lockPath, () => {
      const now = nowMs();
      for (const j of this.jobs.values()) {
        if (j.status === 'dead' || j.status === 'failed') {
          j.status = 'pending';
          j.attempts = 0;
          j.lastError = null;
          j.runAt = now;
          j.visibleUntil = null;
          this._append({ op: 'add', job: j });
          count++;
        }
      }
      this.opsSinceCompact += count;
    });
    if (count) this.emit('retried', count);
    return count;
  }

  /**
   * Clear the dead letter queue (destructive — requires explicit confirm).
   * Returns number of dead jobs removed.
   * Rule #1 of ONYX: we don't delete by default. Pass {confirm:true} to proceed.
   */
  clearDeadLetter({ confirm = false } = {}) {
    if (!confirm) {
      throw new Error('ONYX queue: clearDeadLetter requires {confirm:true}');
    }
    let count = 0;
    withLock(this.lockPath, () => {
      for (const j of Array.from(this.jobs.values())) {
        if (j.status === 'dead') {
          this.jobs.delete(j.id);
          this._append({ op: 'remove', id: j.id });
          count++;
        }
      }
      // archive the dead.jsonl file to .dead.jsonl.<ts> so we never truly lose it
      if (fs.existsSync(this.deadPath)) {
        const archive = `${this.deadPath}.${nowMs()}`;
        try { fs.renameSync(this.deadPath, archive); } catch { /* ignore */ }
      }
      this.opsSinceCompact += count;
    });
    this.emit('dead-cleared', count);
    return count;
  }

  /** Compact log -> state.json, truncate log. */
  compact() {
    withLock(this.lockPath, () => {
      const snapshot = { jobs: Array.from(this.jobs.values()) };
      fs.writeFileSync(this.statePath + '.tmp', JSON.stringify(snapshot));
      fs.renameSync(this.statePath + '.tmp', this.statePath);
      try { fs.writeFileSync(this.logPath, ''); } catch { /* ignore */ }
      this.opsSinceCompact = 0;
    });
    this.emit('compacted');
  }

  /** Return a snapshot of a job by id. */
  get(id) {
    const j = this.jobs.get(id);
    return j ? { ...j } : null;
  }

  /** Close the queue (no-op today — placeholder for future resources). */
  close() {
    this.removeAllListeners();
  }
}

// ─── module helpers ────────────────────────────────────────────────────────

const _queueCache = new Map();

/**
 * Get or open a queue by name. Subsequent calls with the same name + dataDir
 * return the same Queue instance (so add() and claim() share state).
 */
function openQueue(name, opts = {}) {
  const dataDir = opts.dataDir || path.join(process.cwd(), 'data', 'queue');
  const key = `${dataDir}::${name}`;
  let q = _queueCache.get(key);
  if (!q) {
    q = new Queue(name, { ...opts, dataDir });
    _queueCache.set(key, q);
  }
  return q;
}

/** Reset cache — test-only. */
function _resetForTests() {
  for (const q of _queueCache.values()) q.close();
  _queueCache.clear();
}

module.exports = {
  Queue,
  openQueue,
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  PRIORITY_LOW,
  _resetForTests,
};
