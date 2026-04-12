/**
 * ONYX Queue Worker
 *
 * Usage:
 *   const { Worker } = require('./src/queue/worker');
 *   const w = new Worker('pdf-generation', { concurrency: 2, jobTimeoutMs: 60_000 });
 *   w.register('wage-slip', async (payload, ctx) => { ... });
 *   w.start();
 *   process.on('SIGTERM', () => w.stop());
 *
 * Features:
 *   - Handler registration per job-type
 *   - Single or concurrent N jobs
 *   - Per-job timeout
 *   - Error handling with retry (delegated to queue.fail)
 *   - Graceful shutdown (await current jobs)
 *   - Idle polling (tunable)
 */

'use strict';

const { EventEmitter } = require('node:events');
const { openQueue } = require('./queue');

const DEFAULT_POLL_MS = 500;
const DEFAULT_JOB_TIMEOUT_MS = 60_000;
const DEFAULT_CONCURRENCY = 1;

class Worker extends EventEmitter {
  /**
   * @param {string} queueName
   * @param {object} [opts]
   * @param {number} [opts.concurrency=1]
   * @param {number} [opts.pollMs=500]
   * @param {number} [opts.jobTimeoutMs=60000]
   * @param {object} [opts.queueOpts]      forwarded to openQueue
   * @param {object} [opts.logger]         optional { info, warn, error }
   */
  constructor(queueName, opts = {}) {
    super();
    this.queueName = queueName;
    this.queue = openQueue(queueName, opts.queueOpts || {});
    this.concurrency = Math.max(1, opts.concurrency || DEFAULT_CONCURRENCY);
    this.pollMs = opts.pollMs || DEFAULT_POLL_MS;
    this.jobTimeoutMs = opts.jobTimeoutMs || DEFAULT_JOB_TIMEOUT_MS;
    this.logger = opts.logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    this.handlers = new Map();   // type -> async fn(payload, ctx)
    this.running = false;
    this.activeJobs = new Set(); // Set<Promise>
    this._pollTimer = null;
    this._shuttingDown = false;
  }

  /**
   * Register a handler for a job type.
   * Handler signature: async (payload, ctx) => resultOrVoid
   * ctx: { jobId, attempts, type, queueName, log }
   */
  register(type, handler) {
    if (!type || typeof type !== 'string') {
      throw new Error('ONYX worker: register() requires string type');
    }
    if (typeof handler !== 'function') {
      throw new Error('ONYX worker: register() requires function handler');
    }
    this.handlers.set(type, handler);
    return this;
  }

  /** Start polling and processing jobs. Non-blocking. */
  start() {
    if (this.running) return this;
    this.running = true;
    this._shuttingDown = false;
    this.emit('started');
    this.logger.info?.({ queue: this.queueName }, 'ONYX worker: started');
    this._tick();
    return this;
  }

  /**
   * Stop the worker. Returns a promise that resolves once all in-flight jobs
   * finish. New claims are blocked as soon as this is called.
   */
  async stop() {
    if (!this.running) return;
    this._shuttingDown = true;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    this.logger.info?.(
      { queue: this.queueName, active: this.activeJobs.size },
      'ONYX worker: stopping (graceful shutdown)'
    );
    // wait for active jobs
    while (this.activeJobs.size > 0) {
      await Promise.race([...this.activeJobs]);
    }
    this.running = false;
    this.emit('stopped');
    this.logger.info?.({ queue: this.queueName }, 'ONYX worker: stopped');
  }

  // ── internal polling loop ─────────────────────────────────────────────────
  _scheduleNext(delayMs) {
    if (this._shuttingDown) return;
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = setTimeout(() => this._tick(), delayMs);
    if (typeof this._pollTimer.unref === 'function') this._pollTimer.unref();
  }

  _tick() {
    if (this._shuttingDown) return;

    // Fill up to concurrency
    while (this.activeJobs.size < this.concurrency) {
      const job = this.queue.claim();
      if (!job) break;
      const p = this._runJob(job)
        .catch((err) => {
          // defensive: _runJob should never throw
          this.logger.error?.({ err }, 'ONYX worker: unexpected error');
        })
        .finally(() => {
          this.activeJobs.delete(p);
          if (!this._shuttingDown) this._scheduleNext(0); // try to pick up more
        });
      this.activeJobs.add(p);
    }

    // Nothing to do? poll again later
    if (this.activeJobs.size < this.concurrency) {
      this._scheduleNext(this.pollMs);
    }
  }

  async _runJob(job) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const msg = `no handler registered for type=${job.type}`;
      this.queue.fail(job.id, msg);
      this.emit('job:failed', { job, error: msg });
      return;
    }
    const ctx = {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      queueName: this.queueName,
      log: this.logger,
    };
    this.emit('job:started', { job });
    const started = Date.now();

    try {
      const result = await this._withTimeout(handler(job.payload, ctx), this.jobTimeoutMs, job);
      this.queue.ack(job.id);
      const elapsed = Date.now() - started;
      this.emit('job:completed', { job, elapsed, result });
      this.logger.info?.({ jobId: job.id, type: job.type, elapsedMs: elapsed }, 'ONYX worker: job ok');
    } catch (err) {
      const elapsed = Date.now() - started;
      const msg = err && err.message ? err.message : String(err);
      this.queue.fail(job.id, msg);
      this.emit('job:failed', { job, error: msg, elapsed });
      this.logger.warn?.(
        { jobId: job.id, type: job.type, elapsedMs: elapsed, err: msg },
        'ONYX worker: job failed'
      );
    }
  }

  _withTimeout(promise, ms, job) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`job timeout after ${ms}ms (id=${job.id}, type=${job.type})`));
      }, ms);
      if (typeof timer.unref === 'function') timer.unref();
      Promise.resolve(promise).then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }
}

/**
 * Convenience: create + start a worker with handlers.
 * @example
 *   createWorker('pdf-generation', { concurrency: 2 }, {
 *     'wage-slip': async (p) => { ... },
 *   });
 */
function createWorker(queueName, opts, handlers = {}) {
  const w = new Worker(queueName, opts);
  for (const [type, fn] of Object.entries(handlers)) {
    w.register(type, fn);
  }
  w.start();
  return w;
}

// ─── known queue types (registry) ──────────────────────────────────────────
//
// These are the canonical queue-name constants. Workers using these names
// get consistent visibility timeouts + max attempts tuned for their workload.
const QUEUE_TYPES = {
  'pdf-generation':  { visibilityMs: 120_000, maxAttempts: 3 },  // PDFs for wage slips, invoices, reports
  'email-sending':   { visibilityMs: 60_000,  maxAttempts: 5 },  // transactional email
  'bank-matching':   { visibilityMs: 300_000, maxAttempts: 3 },  // match bank transactions after upload
  'legacy-import':   { visibilityMs: 1_800_000, maxAttempts: 2 },// long-running CSV/XLS imports
  'report-generation':{ visibilityMs: 600_000, maxAttempts: 2 }, // heavy aggregation reports
  'webhook-delivery':{ visibilityMs: 30_000,  maxAttempts: 5 },  // external webhook callbacks
  'file-cleanup':    { visibilityMs: 60_000,  maxAttempts: 3 },  // purge old files
};

module.exports = {
  Worker,
  createWorker,
  QUEUE_TYPES,
};
