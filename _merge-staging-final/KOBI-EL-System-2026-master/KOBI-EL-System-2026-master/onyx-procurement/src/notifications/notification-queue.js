/**
 * Unified Notification Service — FIFO Queue
 * ────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Persistent FIFO queue with:
 *   • JSONL append-only storage (data/notification-queue.jsonl)
 *   • Exponential retry schedule: 1s, 5s, 30s, 2m, 10m, 1h
 *   • Dead-letter queue after >6 attempts (data/notification-dlq.jsonl)
 *   • Batching — tryDrain() pulls up to 10 jobs per pass
 *   • Crash-safe: state rebuilt by replaying the JSONL on load()
 *   • Zero external deps — only `fs`, `path`, `crypto`
 *
 * Design notes:
 *   - The log is append-only. Status transitions (enqueue / ack / retry / dlq)
 *     are written as new JSONL rows; the canonical in-memory view is rebuilt
 *     from the log.
 *   - A compaction step (compact()) rewrites the log to only the jobs that
 *     are still pending — safe to call while idle.
 *   - The queue is single-process. Multi-process consumers need external
 *     coordination (not the job of v1).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ───────────────────────────────────────────────────────────────
// Retry schedule — index = attempt count (0 = first try, no delay)
// ───────────────────────────────────────────────────────────────
const RETRY_DELAYS_MS = Object.freeze([
  0,            // attempt 1 (initial, no delay)
  1_000,        // attempt 2 — after 1s
  5_000,        // attempt 3 — after 5s
  30_000,       // attempt 4 — after 30s
  120_000,      // attempt 5 — after 2 min
  600_000,      // attempt 6 — after 10 min
  3_600_000,    // attempt 7 — after 1 hour  (last attempt)
]);

const MAX_ATTEMPTS = 6;       // max RETRIES, not counting the first try → total 7 deliveries
const BATCH_SIZE    = 10;

// Record kinds in the JSONL log
const KIND = Object.freeze({
  ENQUEUE: 'enqueue',
  ACK:     'ack',      // successfully delivered
  RETRY:   'retry',    // scheduled for another attempt
  DLQ:     'dlq',      // moved to dead-letter
});

// ───────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────

function now() { return Date.now(); }

function genId() {
  return 'n_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch (_) { return null; }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ───────────────────────────────────────────────────────────────
// NotificationQueue class
// ───────────────────────────────────────────────────────────────

class NotificationQueue {
  /**
   * @param {object} [opts]
   * @param {string} [opts.logPath]  JSONL path for live queue
   * @param {string} [opts.dlqPath]  JSONL path for dead-letter queue
   * @param {number} [opts.batchSize]
   * @param {number[]} [opts.retryDelaysMs]
   * @param {number} [opts.maxAttempts]
   * @param {function} [opts.logger]
   */
  constructor(opts = {}) {
    this.logPath      = opts.logPath      || path.join(process.cwd(), 'data', 'notification-queue.jsonl');
    this.dlqPath      = opts.dlqPath      || path.join(process.cwd(), 'data', 'notification-dlq.jsonl');
    this.batchSize    = opts.batchSize    || BATCH_SIZE;
    this.retryDelays  = opts.retryDelaysMs || RETRY_DELAYS_MS.slice();
    this.maxAttempts  = opts.maxAttempts  || MAX_ATTEMPTS;
    this.logger       = opts.logger       || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };

    // id → job object { id, payload, attempts, nextAttemptAt, enqueuedAt, status }
    this.jobs = new Map();

    ensureDir(this.logPath);
    ensureDir(this.dlqPath);
    this.load();
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  /**
   * load — rebuild in-memory jobs map from JSONL log.
   * Crash-safe: replays every record; last record wins.
   */
  load() {
    this.jobs.clear();
    if (!fs.existsSync(this.logPath)) return;
    let raw;
    try { raw = fs.readFileSync(this.logPath, 'utf8'); } catch (_) { return; }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const rec = safeJsonParse(line);
      if (!rec || !rec.kind || !rec.id) continue;
      this._applyRecord(rec);
    }
  }

  /**
   * _applyRecord — update in-memory state from a persisted record.
   * Pure (no IO).
   */
  _applyRecord(rec) {
    switch (rec.kind) {
      case KIND.ENQUEUE: {
        this.jobs.set(rec.id, {
          id:            rec.id,
          payload:       rec.payload,
          attempts:      0,
          nextAttemptAt: rec.ts,
          enqueuedAt:    rec.ts,
          status:        'pending',
          lastError:     null,
        });
        break;
      }
      case KIND.ACK: {
        this.jobs.delete(rec.id);
        break;
      }
      case KIND.RETRY: {
        const job = this.jobs.get(rec.id);
        if (job) {
          job.attempts      = rec.attempts;
          job.nextAttemptAt = rec.nextAttemptAt;
          job.lastError     = rec.error || null;
          job.status        = 'pending';
        }
        break;
      }
      case KIND.DLQ: {
        this.jobs.delete(rec.id);
        break;
      }
    }
  }

  _append(rec) {
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(rec) + '\n', 'utf8');
    } catch (err) {
      this.logger.error('[notification-queue] appendFileSync failed', err && err.message);
    }
  }

  _appendDlq(rec) {
    try {
      fs.appendFileSync(this.dlqPath, JSON.stringify(rec) + '\n', 'utf8');
    } catch (err) {
      this.logger.error('[notification-queue] DLQ append failed', err && err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  /**
   * enqueue — add a new job. Returns the job id.
   * The payload is opaque to the queue; the consumer decides its shape.
   */
  enqueue(payload) {
    const id = genId();
    const ts = now();
    const rec = { kind: KIND.ENQUEUE, id, ts, payload };
    this._append(rec);
    this._applyRecord(rec);
    this.logger.debug('[notification-queue] enqueued', id);
    return id;
  }

  /**
   * peekDueBatch — return up to batchSize jobs that are due (nextAttemptAt ≤ now)
   * without removing them. Use tryDrain() for the full "take-and-mark" lifecycle.
   */
  peekDueBatch(limit) {
    const cap = Math.min(limit || this.batchSize, this.batchSize);
    const t = now();
    const due = [];
    for (const job of this.jobs.values()) {
      if (job.status !== 'pending') continue;
      if (job.nextAttemptAt <= t) {
        due.push(job);
        if (due.length >= cap) break;
      }
    }
    return due;
  }

  /**
   * ack — mark a job as successfully delivered. Removes it from the queue.
   */
  ack(id) {
    if (!this.jobs.has(id)) return false;
    const rec = { kind: KIND.ACK, id, ts: now() };
    this._append(rec);
    this._applyRecord(rec);
    return true;
  }

  /**
   * fail — mark a job as failed. If attempts < maxAttempts, it is rescheduled
   * with exponential backoff. Otherwise it is moved to the DLQ.
   * Returns 'retry' | 'dlq' | 'unknown'.
   */
  fail(id, error) {
    const job = this.jobs.get(id);
    if (!job) return 'unknown';
    const nextAttempts = job.attempts + 1;
    const errMsg = error && error.message ? error.message : (typeof error === 'string' ? error : 'unknown');

    if (nextAttempts > this.maxAttempts) {
      // Dead-letter
      this._appendDlq({
        kind:       KIND.DLQ,
        id:         job.id,
        ts:         now(),
        payload:    job.payload,
        attempts:   nextAttempts,
        lastError:  errMsg,
        enqueuedAt: job.enqueuedAt,
      });
      const rec = { kind: KIND.DLQ, id: job.id, ts: now(), error: errMsg };
      this._append(rec);
      this._applyRecord(rec);
      this.logger.warn('[notification-queue] moved to DLQ', job.id, errMsg);
      return 'dlq';
    }

    const delayIdx = Math.min(nextAttempts, this.retryDelays.length - 1);
    const delayMs  = this.retryDelays[delayIdx];
    const nextAttemptAt = now() + delayMs;
    const rec = {
      kind:          KIND.RETRY,
      id:            job.id,
      ts:            now(),
      attempts:      nextAttempts,
      nextAttemptAt,
      error:         errMsg,
    };
    this._append(rec);
    this._applyRecord(rec);
    this.logger.debug('[notification-queue] retry scheduled', job.id, 'in', delayMs, 'ms');
    return 'retry';
  }

  /**
   * tryDrain — pull up to batchSize due jobs and hand them to the `handler`
   * function, which must return a Promise<{ ok: boolean, error?: Error }>.
   *
   * Jobs are processed in parallel within a batch. Return shape is a summary
   * useful for tests and /metrics.
   */
  async tryDrain(handler, limit) {
    const batch = this.peekDueBatch(limit);
    if (batch.length === 0) return { processed: 0, acked: 0, retried: 0, dlq: 0 };

    let acked = 0, retried = 0, dlq = 0;
    await Promise.all(batch.map(async (job) => {
      let result;
      try {
        result = await handler(job);
      } catch (err) {
        result = { ok: false, error: err };
      }
      if (result && result.ok) {
        this.ack(job.id);
        acked++;
      } else {
        const outcome = this.fail(job.id, result && result.error);
        if (outcome === 'dlq') dlq++; else if (outcome === 'retry') retried++;
      }
    }));

    return { processed: batch.length, acked, retried, dlq };
  }

  /**
   * stats — quick snapshot for monitoring.
   */
  stats() {
    const t = now();
    let pending = 0, due = 0;
    for (const j of this.jobs.values()) {
      if (j.status !== 'pending') continue;
      pending++;
      if (j.nextAttemptAt <= t) due++;
    }
    return {
      pending,
      due,
      batchSize: this.batchSize,
      retryDelaysMs: this.retryDelays.slice(),
      maxAttempts: this.maxAttempts,
    };
  }

  /**
   * list — enumerate all currently-tracked jobs (cloned). Useful for admin UI.
   */
  list() {
    const out = [];
    for (const j of this.jobs.values()) {
      out.push({
        id: j.id,
        attempts: j.attempts,
        nextAttemptAt: j.nextAttemptAt,
        enqueuedAt: j.enqueuedAt,
        status: j.status,
        lastError: j.lastError,
        payload: j.payload,
      });
    }
    return out;
  }

  /**
   * dlqList — read the dead-letter JSONL file and return parsed records.
   */
  dlqList() {
    if (!fs.existsSync(this.dlqPath)) return [];
    let raw;
    try { raw = fs.readFileSync(this.dlqPath, 'utf8'); } catch (_) { return []; }
    return raw.split(/\r?\n/).filter(Boolean).map(safeJsonParse).filter(Boolean);
  }

  /**
   * compact — rewrite the log to contain only current pending jobs.
   * Safe to run while handlers are idle. Returns { before, after }.
   */
  compact() {
    const before = (fs.existsSync(this.logPath) ? fs.statSync(this.logPath).size : 0);
    const tmp = this.logPath + '.tmp';
    const lines = [];
    const t = now();
    for (const j of this.jobs.values()) {
      if (j.status !== 'pending') continue;
      // synthesize: enqueue + optional retry state
      lines.push(JSON.stringify({ kind: KIND.ENQUEUE, id: j.id, ts: j.enqueuedAt, payload: j.payload }));
      if (j.attempts > 0 || j.nextAttemptAt !== j.enqueuedAt) {
        lines.push(JSON.stringify({
          kind: KIND.RETRY, id: j.id, ts: t,
          attempts: j.attempts, nextAttemptAt: j.nextAttemptAt, error: j.lastError,
        }));
      }
    }
    fs.writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
    fs.renameSync(tmp, this.logPath);
    const after = fs.statSync(this.logPath).size;
    return { before, after };
  }

  /**
   * clear — drop every in-memory job AND truncate the persisted log.
   * Intended for tests / hard reset only.
   */
  clear() {
    this.jobs.clear();
    try { fs.writeFileSync(this.logPath, '', 'utf8'); } catch (_) { /* noop */ }
  }
}

module.exports = {
  NotificationQueue,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
  BATCH_SIZE,
  KIND,
};
