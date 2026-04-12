'use strict';

/**
 * print-queue.js
 * ------------------------------------------------------------
 * Zero-dependency print queue manager for Onyx Procurement.
 *
 * Responsibilities:
 *   - Accept print jobs of any kind (ipp / thermal / zpl / text / pdf).
 *   - Enforce a priority ordering (urgent > high > normal > low).
 *   - Track job lifecycle (queued -> sending -> done | failed | stored).
 *   - Implement an offline fallback: if a printer is unreachable we
 *     persist the job in-memory (optionally on disk) and retry once the
 *     printer comes back.
 *   - Emit events so UI layers can react.
 *   - Provide `print(destination, content)` smart router that picks the
 *     right backend based on destination.type or content type.
 *
 * No external dependencies — uses Node's `events`, `fs`, `path`, `crypto`.
 *
 * Author: Agent 85 — Onyx Procurement Printing stack
 * ------------------------------------------------------------
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ipp = require('./ipp-client');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY = Object.freeze({
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
});

const STATUS = Object.freeze({
  QUEUED: 'queued',
  SENDING: 'sending',
  DONE: 'done',
  FAILED: 'failed',
  STORED_OFFLINE: 'stored_offline',
  CANCELED: 'canceled',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() { return Date.now(); }

function genId() {
  // e.g. pq_1712846519123_1a2b3c
  return 'pq_' + now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function priorityValue(p) {
  if (typeof p === 'number') return p;
  const k = String(p || 'normal').toLowerCase();
  return PRIORITY[k] != null ? PRIORITY[k] : PRIORITY.normal;
}

function isPrinterOfflineError(err) {
  if (!err) return false;
  const c = err.code || '';
  return c === 'IPP_PRINTER_OFFLINE' ||
         c === 'IPP_NETWORK_ERROR' ||
         c === 'IPP_TIMEOUT' ||
         c === 'IPP_HTTP_ERROR';
}

function isRetryablePrinterCondition(err) {
  if (!err) return false;
  const c = err.code || '';
  // Stuck-job-style conditions may clear on their own.
  return c === 'IPP_OUT_OF_PAPER' ||
         c === 'IPP_OUT_OF_TONER' ||
         c === 'IPP_COVER_OPEN' ||
         c === 'IPP_PAPER_JAM' ||
         c === 'IPP_OUTPUT_FULL';
}

// Attempt to require the other printer backends without hard-crashing when
// they are not yet present in the tree. All three are optional: the queue
// still works for IPP-only workloads without them.
function tryRequire(rel) {
  try {
    return require(rel);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PrintQueue
// ---------------------------------------------------------------------------

class PrintQueue extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = Object.assign({
      concurrency: 1,
      maxAttempts: 5,
      retryDelayMs: 1000,
      retryBackoff: 2,
      maxRetryDelayMs: 5 * 60 * 1000,
      offlineRescanIntervalMs: 30 * 1000,
      persistPath: null, // optional file path for durable queue
      ippClient: ipp,    // injectable for tests
      thermal: tryRequire('./thermal-printer'),
      zpl: tryRequire('./zpl-printer'),
      now,               // injectable clock
    }, opts);

    /** @type {Map<string, object>} */
    this._jobs = new Map();
    /** @type {string[]} */
    this._queue = [];
    this._inflight = 0;
    this._offlineWatch = null;
    this._stopped = false;

    if (this.opts.persistPath) {
      try { this._loadFromDisk(); } catch (e) { this.emit('persist_error', e); }
    }
    this._startOfflineWatcher();
  }

  // ----- public API -----

  /**
   * Enqueue a print job.
   *
   * @param {object} job
   * @param {object} job.destination - { type, ip?, host?, port?, path? }
   * @param {Buffer|string} job.content
   * @param {string} [job.contentType] - 'application/pdf' | 'text/plain' | ...
   * @param {string} [job.priority='normal']
   * @param {string} [job.jobName]
   * @param {object} [job.options] - passed to backend (duplex, copies, ...)
   * @param {object} [job.metadata]
   */
  enqueue(job) {
    if (!job || !job.destination) {
      throw new Error('print-queue: job.destination is required');
    }
    const id = job.id || genId();
    const entry = {
      id,
      destination: job.destination,
      content: job.content,
      contentType: job.contentType,
      priority: priorityValue(job.priority),
      priorityLabel: typeof job.priority === 'string' ? job.priority : 'normal',
      jobName: job.jobName || id,
      options: Object.assign({}, job.options || {}),
      metadata: Object.assign({}, job.metadata || {}),
      status: STATUS.QUEUED,
      attempts: 0,
      lastError: null,
      createdAt: this.opts.now(),
      updatedAt: this.opts.now(),
      nextAttemptAt: this.opts.now(),
      result: null,
    };
    this._jobs.set(id, entry);
    this._insertSorted(id);
    this._persist();
    this.emit('enqueued', this._safeJob(entry));
    this._schedulePump();
    return id;
  }

  _schedulePump() {
    if (this._pumpScheduled) return;
    this._pumpScheduled = true;
    // Defer to let a burst of enqueue() calls settle before dispatching — this
    // is what makes priority ordering work when jobs arrive back-to-back.
    const fire = () => {
      this._pumpScheduled = false;
      this._pump();
    };
    if (typeof setImmediate === 'function') setImmediate(fire);
    else Promise.resolve().then(fire);
  }

  /** Cancel a job. If it's already been sent it will be removed from the queue
   *  only; a printer-side cancel requires the backend. */
  cancel(id) {
    const job = this._jobs.get(id);
    if (!job) return false;
    if (job.status === STATUS.DONE) return false;
    job.status = STATUS.CANCELED;
    job.updatedAt = this.opts.now();
    const idx = this._queue.indexOf(id);
    if (idx >= 0) this._queue.splice(idx, 1);
    this._persist();
    this.emit('canceled', this._safeJob(job));
    return true;
  }

  get(id) {
    const j = this._jobs.get(id);
    return j ? this._safeJob(j) : null;
  }

  list(filter = {}) {
    const out = [];
    for (const j of this._jobs.values()) {
      if (filter.status && j.status !== filter.status) continue;
      out.push(this._safeJob(j));
    }
    return out;
  }

  stats() {
    const s = { total: 0, queued: 0, sending: 0, done: 0, failed: 0, stored_offline: 0, canceled: 0 };
    for (const j of this._jobs.values()) {
      s.total++;
      s[j.status] = (s[j.status] || 0) + 1;
    }
    s.inflight = this._inflight;
    s.pending = this._queue.length;
    return s;
  }

  clearDone() {
    let n = 0;
    for (const [id, j] of this._jobs) {
      if (j.status === STATUS.DONE || j.status === STATUS.CANCELED) {
        this._jobs.delete(id);
        n++;
      }
    }
    this._persist();
    return n;
  }

  stop() {
    this._stopped = true;
    if (this._offlineWatch) clearInterval(this._offlineWatch);
    this._offlineWatch = null;
  }

  /**
   * Smart `print(destination, content, opts)` — the primary entrypoint that
   * the rest of the app uses. It picks the right backend based on the
   * destination type or falls back to content sniffing, then enqueues.
   *
   * Returns the queued job id immediately. Listen to 'done'/'failed' to
   * observe completion, or `await queue.waitFor(id)`.
   */
  print(destination, content, opts = {}) {
    const dest = typeof destination === 'string'
      ? { type: guessTypeFromString(destination), ip: destination }
      : Object.assign({}, destination);

    if (!dest.type) {
      dest.type = inferDestinationType(dest, content, opts);
    }
    const contentType = opts.contentType || inferContentType(content, dest.type);
    return this.enqueue({
      destination: dest,
      content,
      contentType,
      priority: opts.priority || 'normal',
      jobName: opts.jobName,
      options: opts,
      metadata: opts.metadata,
    });
  }

  /**
   * Await a job until it reaches a terminal state.
   */
  waitFor(id, { timeoutMs = 60000 } = {}) {
    return new Promise((resolve, reject) => {
      const existing = this._jobs.get(id);
      if (!existing) return reject(new Error('unknown job ' + id));
      if (isTerminal(existing.status)) return resolve(this._safeJob(existing));
      const timer = setTimeout(() => {
        this.off('done', onDone);
        this.off('failed', onFail);
        this.off('canceled', onFail);
        reject(new Error('waitFor timeout for ' + id));
      }, timeoutMs);
      const onDone = (j) => {
        if (j.id !== id) return;
        clearTimeout(timer);
        this.off('done', onDone);
        this.off('failed', onFail);
        this.off('canceled', onFail);
        resolve(j);
      };
      const onFail = (j) => {
        if (j.id !== id) return;
        clearTimeout(timer);
        this.off('done', onDone);
        this.off('failed', onFail);
        this.off('canceled', onFail);
        resolve(j); // resolve with the failed job rather than reject — caller can read .status
      };
      this.on('done', onDone);
      this.on('failed', onFail);
      this.on('canceled', onFail);
    });
  }

  // ----- internals -----

  _insertSorted(id) {
    const job = this._jobs.get(id);
    if (!job) return;
    // Keep the queue ordered by (priority asc, createdAt asc, nextAttemptAt asc).
    const arr = this._queue;
    let inserted = false;
    for (let i = 0; i < arr.length; i++) {
      const other = this._jobs.get(arr[i]);
      if (!other) continue;
      if (job.priority < other.priority ||
          (job.priority === other.priority && job.nextAttemptAt < other.nextAttemptAt) ||
          (job.priority === other.priority && job.nextAttemptAt === other.nextAttemptAt && job.createdAt < other.createdAt)) {
        arr.splice(i, 0, id);
        inserted = true;
        break;
      }
    }
    if (!inserted) arr.push(id);
  }

  _pump() {
    if (this._stopped) return;
    while (this._inflight < this.opts.concurrency && this._queue.length > 0) {
      const nowT = this.opts.now();
      const idx = this._queue.findIndex((id) => {
        const j = this._jobs.get(id);
        return j && j.status === STATUS.QUEUED && j.nextAttemptAt <= nowT;
      });
      if (idx < 0) break;
      const id = this._queue.splice(idx, 1)[0];
      const job = this._jobs.get(id);
      if (!job) continue;
      this._inflight++;
      this._sendJob(job).finally(() => {
        this._inflight--;
        this._schedulePump();
      });
    }
  }

  async _sendJob(job) {
    job.status = STATUS.SENDING;
    job.attempts++;
    job.updatedAt = this.opts.now();
    this.emit('sending', this._safeJob(job));
    try {
      const result = await this._dispatch(job);
      job.result = result;
      job.status = STATUS.DONE;
      job.updatedAt = this.opts.now();
      this._persist();
      this.emit('done', this._safeJob(job));
    } catch (err) {
      job.lastError = { code: err.code || 'UNKNOWN', message: err.message, name: err.name };
      job.updatedAt = this.opts.now();

      const offline = isPrinterOfflineError(err);
      const retryable = offline || isRetryablePrinterCondition(err);

      if (offline) {
        // Store-and-forward: stop retrying aggressively; watcher will kick it.
        job.status = STATUS.STORED_OFFLINE;
        this._persist();
        this.emit('stored_offline', this._safeJob(job));
        return;
      }

      if (retryable && job.attempts < this.opts.maxAttempts) {
        const delay = Math.min(
          this.opts.retryDelayMs * Math.pow(this.opts.retryBackoff, job.attempts - 1),
          this.opts.maxRetryDelayMs
        );
        job.status = STATUS.QUEUED;
        job.nextAttemptAt = this.opts.now() + delay;
        this._insertSorted(job.id);
        this._persist();
        this.emit('retry', Object.assign(this._safeJob(job), { delay }));
        return;
      }

      job.status = STATUS.FAILED;
      this._persist();
      this.emit('failed', this._safeJob(job));
    }
  }

  async _dispatch(job) {
    const t = String(job.destination.type || '').toLowerCase();
    switch (t) {
      case 'ipp':
      case 'office':
      case 'laser':
      case 'inkjet': {
        return await this._dispatchIpp(job);
      }
      case 'thermal':
      case 'receipt': {
        return await this._dispatchThermal(job);
      }
      case 'zpl':
      case 'label': {
        return await this._dispatchZpl(job);
      }
      case 'raw':
      case 'text': {
        return await this._dispatchRawText(job);
      }
      default:
        throw new Error(`print-queue: unknown destination type '${t}'`);
    }
  }

  async _dispatchIpp(job) {
    const ippc = this.opts.ippClient;
    const dest = job.destination;
    const ip = dest.ip || dest.host;
    if (!ip) throw new Error('print-queue: IPP destination requires ip/host');
    const opts = Object.assign({
      jobName: job.jobName,
      port: dest.port,
      path: dest.path,
    }, job.options || {});
    const ct = (job.contentType || '').toLowerCase();
    if (ct.indexOf('pdf') >= 0 || (Buffer.isBuffer(job.content) && looksLikePdf(job.content))) {
      const buf = Buffer.isBuffer(job.content) ? job.content : Buffer.from(job.content);
      return await ippc.printPdf(ip, buf, opts);
    }
    if (ct.indexOf('text') >= 0 || typeof job.content === 'string') {
      return await ippc.printRawText(ip, String(job.content), opts);
    }
    // Binary blob of unknown type — send as octet-stream via submitJob.
    const buf = Buffer.isBuffer(job.content) ? job.content : Buffer.from(String(job.content));
    return await ippc.printPdf(ip, buf, Object.assign({ format: 'application/octet-stream' }, opts));
  }

  async _dispatchThermal(job) {
    const backend = this.opts.thermal;
    if (!backend) throw new Error('print-queue: thermal backend not available');
    // Support a few plausible APIs without locking us in.
    if (typeof backend.print === 'function') {
      return await backend.print(job.destination, job.content, job.options);
    }
    if (typeof backend.printReceipt === 'function') {
      return await backend.printReceipt(job.destination, job.content, job.options);
    }
    if (typeof backend.send === 'function') {
      return await backend.send(job.destination, job.content, job.options);
    }
    throw new Error('print-queue: thermal backend has no callable print method');
  }

  async _dispatchZpl(job) {
    const backend = this.opts.zpl;
    if (!backend) throw new Error('print-queue: zpl backend not available');
    const zplPayload = typeof job.content === 'string' ? job.content : job.content.toString('utf8');
    if (typeof backend.print === 'function') {
      return await backend.print(job.destination, zplPayload, job.options);
    }
    if (typeof backend.printZpl === 'function') {
      return await backend.printZpl(job.destination, zplPayload, job.options);
    }
    if (typeof backend.sendLabel === 'function') {
      return await backend.sendLabel(job.destination, zplPayload, job.options);
    }
    throw new Error('print-queue: zpl backend has no callable print method');
  }

  async _dispatchRawText(job) {
    const ippc = this.opts.ippClient;
    const ip = job.destination.ip || job.destination.host;
    if (ip) return await ippc.printRawText(ip, String(job.content), job.options || {});
    throw new Error('print-queue: raw/text requires an ip/host destination');
  }

  _startOfflineWatcher() {
    if (this.opts.offlineRescanIntervalMs <= 0) return;
    this._offlineWatch = setInterval(() => {
      if (this._stopped) return;
      const toRequeue = [];
      for (const j of this._jobs.values()) {
        if (j.status === STATUS.STORED_OFFLINE) toRequeue.push(j);
      }
      if (toRequeue.length === 0) return;
      this.emit('offline_rescan', { count: toRequeue.length });
      for (const j of toRequeue) {
        j.status = STATUS.QUEUED;
        j.nextAttemptAt = this.opts.now();
        j.attempts = Math.max(0, j.attempts - 1); // give it a fresh shot
        this._insertSorted(j.id);
      }
      this._schedulePump();
    }, this.opts.offlineRescanIntervalMs);
    if (this._offlineWatch && typeof this._offlineWatch.unref === 'function') {
      this._offlineWatch.unref();
    }
  }

  _safeJob(job) {
    // Strip heavy payloads from emitted events; attach a content-length hint.
    const contentLength = job.content == null
      ? 0
      : Buffer.isBuffer(job.content) ? job.content.length : Buffer.byteLength(String(job.content));
    return {
      id: job.id,
      destination: job.destination,
      contentType: job.contentType,
      contentLength,
      priority: job.priority,
      priorityLabel: job.priorityLabel,
      jobName: job.jobName,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError,
      result: job.result,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      nextAttemptAt: job.nextAttemptAt,
      metadata: job.metadata,
    };
  }

  // ----- persistence (optional) -----

  _persist() {
    const p = this.opts.persistPath;
    if (!p) return;
    try {
      const snapshot = [];
      for (const j of this._jobs.values()) {
        // Don't persist huge binary payloads by default — callers can override.
        const persistable = {
          id: j.id,
          destination: j.destination,
          contentType: j.contentType,
          content: Buffer.isBuffer(j.content)
            ? { __buf: true, base64: j.content.toString('base64') }
            : j.content,
          priority: j.priority,
          priorityLabel: j.priorityLabel,
          jobName: j.jobName,
          options: j.options,
          metadata: j.metadata,
          status: j.status,
          attempts: j.attempts,
          lastError: j.lastError,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          nextAttemptAt: j.nextAttemptAt,
        };
        snapshot.push(persistable);
      }
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(snapshot), 'utf8');
    } catch (e) {
      this.emit('persist_error', e);
    }
  }

  _loadFromDisk() {
    const p = this.opts.persistPath;
    if (!p || !fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw) return;
    const arr = JSON.parse(raw);
    for (const s of arr) {
      const job = Object.assign({}, s);
      if (s.content && s.content.__buf) {
        job.content = Buffer.from(s.content.base64, 'base64');
      }
      this._jobs.set(job.id, job);
      if (!isTerminal(job.status)) {
        if (job.status === STATUS.SENDING) job.status = STATUS.QUEUED;
        this._insertSorted(job.id);
      }
    }
  }
}

function isTerminal(status) {
  return status === STATUS.DONE || status === STATUS.FAILED || status === STATUS.CANCELED;
}

// ---------------------------------------------------------------------------
// Inference helpers for the smart `print()` router
// ---------------------------------------------------------------------------

function looksLikePdf(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 &&
         buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
}

function looksLikeZpl(content) {
  if (typeof content !== 'string') return false;
  const s = content.trimStart();
  return s.startsWith('^XA') || s.includes('^XA') && s.includes('^XZ');
}

function looksLikeEscPos(content) {
  if (!Buffer.isBuffer(content)) return false;
  // Many ESC/POS commands begin with 0x1B (ESC) or 0x1D (GS).
  return content.length > 0 && (content[0] === 0x1B || content[0] === 0x1D);
}

function inferContentType(content, destType) {
  if (Buffer.isBuffer(content)) {
    if (looksLikePdf(content)) return 'application/pdf';
    if (looksLikeEscPos(content)) return 'application/vnd.escpos';
    return 'application/octet-stream';
  }
  if (typeof content === 'string') {
    if (looksLikeZpl(content)) return 'application/zpl';
    return 'text/plain';
  }
  return destType === 'zpl' || destType === 'label' ? 'application/zpl' : 'application/octet-stream';
}

function inferDestinationType(dest, content, opts) {
  // Explicit hints win.
  if (opts && opts.type) return opts.type;
  if (dest.kind) return dest.kind;
  // Known destination attributes.
  if (dest.protocol === 'zpl' || dest.model === 'zebra') return 'zpl';
  if (dest.protocol === 'escpos' || dest.model === 'epson-tm') return 'thermal';
  // Content-based sniffing.
  if (looksLikeZpl(content)) return 'zpl';
  if (looksLikeEscPos(content)) return 'thermal';
  if (looksLikePdf(content)) return 'ipp';
  // Default: IPP office printer.
  return 'ipp';
}

function guessTypeFromString(s) {
  // Caller passed a bare ip — assume IPP.
  if (typeof s === 'string' && /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(s)) return 'ipp';
  return 'ipp';
}

// ---------------------------------------------------------------------------
// Singleton convenience
// ---------------------------------------------------------------------------

let _defaultQueue = null;
function getDefaultQueue(opts) {
  if (!_defaultQueue) _defaultQueue = new PrintQueue(opts);
  return _defaultQueue;
}

function print(destination, content, opts) {
  return getDefaultQueue().print(destination, content, opts);
}

module.exports = {
  PrintQueue,
  PRIORITY,
  STATUS,
  getDefaultQueue,
  print,
  // exposed for tests / callers that want to build their own sniffing
  _inferDestinationType: inferDestinationType,
  _inferContentType: inferContentType,
  _looksLikePdf: looksLikePdf,
  _looksLikeZpl: looksLikeZpl,
  _looksLikeEscPos: looksLikeEscPos,
};
