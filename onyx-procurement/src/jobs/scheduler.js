/**
 * ONYX JOBS — Cron-like Scheduler (zero dependencies)
 * ───────────────────────────────────────────────────
 * Agent-77 / Scheduled Jobs Framework
 *
 * Purpose:
 *   A from-scratch cron-style scheduler built on a single shared ticker.
 *   NO external deps: no node-cron, no cron-parser, nothing. Pure Node.
 *   The module is PURELY ADDITIVE — importing it has no side effects until
 *   you call start().  Nothing in this file ever deletes anything on disk.
 *
 * Features:
 *   - POSIX-compatible cron expression parser (5 fields):
 *         minute hour day-of-month month day-of-week
 *     with support for:
 *         *        → any value
 *         a,b,c    → list
 *         a-b      → range
 *         * /n      → every-n-th (starting at first legal value)
 *         a-b/n    → ranged step
 *         day-of-week: 0-6 (0=Sun)   /   1-7 also accepted (7=Sun)
 *         month:        1-12
 *   - Per-minute ticker (single shared setTimeout loop, self-rescheduling to
 *     align with wall-clock minute boundary — never drifts).
 *   - Per-job jitter: configurable ± jitter window in ms, so several jobs
 *     scheduled for the same minute fan out instead of hammering the host.
 *   - Missed-run catch-up: on start(), the scheduler reads
 *     data/job-runs.jsonl (via persistence), finds each registered job's last
 *     successful run, and for any registered job whose latest scheduled tick
 *     is strictly later than that lastRun, emits a single "catch-up" run.
 *     The catch-up is opt-out per job via runMissedOnStartup: false.
 *   - Safe re-entry: if the previous invocation of a job is still running
 *     when the next tick arrives, the new tick is skipped and counted as
 *     `overlapped` (no queueing).
 *   - Pause / resume per job (in-memory), and per-job "paused" runtime flag.
 *
 * What this module deliberately does NOT do:
 *   - It does not spawn child processes.
 *   - It does not mutate files outside data/ and logs/ (via persistence).
 *   - It does not handle DST edges "cleverly" — a duplicate or skipped minute
 *     on DST transition is accepted; persistence de-dupes catch-up runs.
 *
 * Public API:
 *   const sched = createScheduler({ now, jitterMs, persistence, logger });
 *   sched.register(jobDef);
 *   sched.unregister(id);           // safe no-op if missing
 *   sched.list();                   // array of { id, cron, nextRunAt, ... }
 *   sched.get(id);                  // single entry or null
 *   sched.pause(id);                // stop future ticks until resume()
 *   sched.resume(id);
 *   sched.runNow(id);               // manual trigger, bypasses cron
 *   sched.start();                  // begin ticking
 *   sched.stop();                   // clear the shared timer (keeps state)
 *   sched.parseCron(expr);          // helper; throws on bad expression
 *   sched.computeNextRun(expr, from)
 *   sched.matches(expr, date)
 *
 * Pure helpers (also exported for unit tests):
 *   parseCronExpression(expr)
 *   cronMatches(parsed, date)
 *   computeNextRun(parsed, fromDate)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const FIELD_BOUNDS = [
  { name: 'minute',       min: 0, max: 59 },
  { name: 'hour',         min: 0, max: 23 },
  { name: 'dayOfMonth',   min: 1, max: 31 },
  { name: 'month',        min: 1, max: 12 },
  { name: 'dayOfWeek',    min: 0, max: 7  }, // 0 and 7 both mean Sunday
];

const DEFAULT_JITTER_MS = 0;
const MAX_NEXT_RUN_SCAN_YEARS = 4;

// ─────────────────────────────────────────────────────────────────
// CRON PARSER
// ─────────────────────────────────────────────────────────────────
//
// parseCronExpression('* /15 * * * *') throws on the wrong arity;
// the 5-field POSIX form is accepted. A parsed expression is an array of 5
// Sets (of integers). Day-of-week 7 is normalised to 0 at parse time.
//

/**
 * Parse a 5-field cron expression into an array of Set<number>.
 *
 * @param {string} expr
 * @returns {{ raw: string, fields: Array<Set<number>> }}
 */
function parseCronExpression(expr) {
  if (typeof expr !== 'string') {
    throw new TypeError('cron expression must be a string');
  }
  const trimmed = expr.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new Error('cron expression is empty');
  }
  const parts = trimmed.split(' ');
  if (parts.length !== 5) {
    throw new Error(
      `cron expression must have exactly 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}: "${expr}"`
    );
  }

  const fields = parts.map((part, idx) => parseField(part, FIELD_BOUNDS[idx], idx));
  // Normalise day-of-week: allow 7 to mean Sunday (0)
  const dow = fields[4];
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }

  return { raw: trimmed, fields };
}

function parseField(raw, bounds, fieldIdx) {
  const set = new Set();
  const segments = raw.split(',');
  for (const seg of segments) {
    addSegment(seg, bounds, set, fieldIdx);
  }
  if (set.size === 0) {
    throw new Error(`cron field ${bounds.name} produced no values: "${raw}"`);
  }
  return set;
}

function addSegment(seg, bounds, set, fieldIdx) {
  // Split step first:  a-b/n, * /n
  let rangePart = seg;
  let step = 1;
  const slashIdx = seg.indexOf('/');
  if (slashIdx !== -1) {
    rangePart = seg.slice(0, slashIdx);
    const stepStr = seg.slice(slashIdx + 1);
    step = parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step < 1) {
      throw new Error(`cron ${bounds.name}: invalid step "${stepStr}" in "${seg}"`);
    }
  }

  let start, end;
  if (rangePart === '*') {
    start = bounds.min;
    end = bounds.max;
  } else if (rangePart.includes('-')) {
    const [a, b] = rangePart.split('-');
    start = parseInt(a, 10);
    end = parseInt(b, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(`cron ${bounds.name}: invalid range "${rangePart}"`);
    }
  } else {
    start = parseInt(rangePart, 10);
    if (!Number.isFinite(start)) {
      throw new Error(`cron ${bounds.name}: invalid value "${rangePart}"`);
    }
    // If no explicit step, only this one value
    end = slashIdx === -1 ? start : bounds.max;
  }

  // Normalise day-of-week 7→0 before bound check
  const effMin = fieldIdx === 4 ? 0 : bounds.min;
  const effMax = fieldIdx === 4 ? 7 : bounds.max;

  if (start < effMin || start > effMax) {
    throw new Error(`cron ${bounds.name}: value ${start} out of range ${bounds.min}-${bounds.max}`);
  }
  if (end < effMin || end > effMax) {
    throw new Error(`cron ${bounds.name}: value ${end} out of range ${bounds.min}-${bounds.max}`);
  }
  if (end < start) {
    throw new Error(`cron ${bounds.name}: range end ${end} < start ${start}`);
  }

  for (let v = start; v <= end; v += step) {
    set.add(fieldIdx === 4 && v === 7 ? 0 : v);
  }
}

/**
 * Test whether a given Date matches a parsed cron expression.
 *
 * @param {{fields: Array<Set<number>>}} parsed
 * @param {Date} date
 * @returns {boolean}
 */
function cronMatches(parsed, date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const [minutes, hours, dom, month, dow] = parsed.fields;
  const m = date.getMinutes();
  const h = date.getHours();
  const d = date.getDate();
  const mo = date.getMonth() + 1;
  const w = date.getDay(); // 0-6

  if (!minutes.has(m)) return false;
  if (!hours.has(h)) return false;
  if (!month.has(mo)) return false;

  // POSIX semantics: when BOTH day-of-month and day-of-week are restricted
  // (neither is a full wildcard), a match in EITHER counts. When only one is
  // restricted, that one must match; the unrestricted one is always true.
  const domUnrestricted = isFullField(dom, FIELD_BOUNDS[2]);
  const dowUnrestricted = isFullField(dow, { ...FIELD_BOUNDS[4], min: 0, max: 6 });

  const domOk = dom.has(d);
  const dowOk = dow.has(w);

  if (domUnrestricted && dowUnrestricted) return true;
  if (domUnrestricted) return dowOk;
  if (dowUnrestricted) return domOk;
  return domOk || dowOk;
}

function isFullField(set, bounds) {
  for (let v = bounds.min; v <= bounds.max; v++) {
    if (!set.has(v)) return false;
  }
  return true;
}

/**
 * Given a parsed cron expression and a starting Date, return the next Date
 * (>= from + 1 minute) at which the expression matches, or null if none
 * within MAX_NEXT_RUN_SCAN_YEARS.
 *
 * @param {{fields: Array<Set<number>>}} parsed
 * @param {Date} from
 * @returns {Date|null}
 */
function computeNextRun(parsed, from) {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
    throw new TypeError('computeNextRun: "from" must be a valid Date');
  }
  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + MAX_NEXT_RUN_SCAN_YEARS);

  // Start at the next whole minute
  const probe = new Date(from.getTime());
  probe.setSeconds(0, 0);
  probe.setMinutes(probe.getMinutes() + 1);

  while (probe < limit) {
    if (cronMatches(parsed, probe)) return probe;
    probe.setMinutes(probe.getMinutes() + 1);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────────
//
// createScheduler() returns an isolated instance. All state lives on the
// returned object — no module-level globals — so tests can create many
// instances without leaking timers.
//

function defaultNoopLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

/**
 * @typedef JobDefinition
 * @property {string}   id
 * @property {string}   cron
 * @property {Function} handler          async (ctx) => void
 * @property {number=}  timeout          ms, optional
 * @property {number=}  retries          number of retry attempts on throw
 * @property {number=}  retryDelayMs     delay between retries
 * @property {string=}  onFailure        symbolic hook name, e.g. 'notify-admin'
 * @property {boolean=} runMissedOnStartup  default true
 * @property {number=}  jitterMs            per-job jitter override
 * @property {string=}  description
 * @property {string=}  category         e.g. 'backup' | 'tax' | 'ops'
 */

function createScheduler(opts = {}) {
  const now = opts.now || (() => new Date());
  const baseJitterMs = Number.isFinite(opts.jitterMs) ? opts.jitterMs : DEFAULT_JITTER_MS;
  const persistence = opts.persistence || null;
  const logger = opts.logger || defaultNoopLogger();
  const onFailureHook = typeof opts.onFailure === 'function' ? opts.onFailure : null;

  /** @type {Map<string, {
   *   def: JobDefinition,
   *   parsed: {fields:Array<Set<number>>},
   *   nextRunAt: Date|null,
   *   lastRunAt: Date|null,
   *   lastStatus: 'success'|'failure'|'running'|'skipped'|null,
   *   lastDurationMs: number|null,
   *   lastError: string|null,
   *   running: boolean,
   *   paused: boolean,
   *   totalRuns: number,
   *   successRuns: number,
   *   failureRuns: number,
   *   overlapped: number,
   *   history: Array<{at:string,status:string,durationMs:number|null,error:string|null,mode:string}>,
   * }>} */
  const jobs = new Map();

  let tickTimer = null;
  let running = false;

  // ── registration ───────────────────────────────────────────────
  function register(def) {
    if (!def || typeof def !== 'object') {
      throw new TypeError('register: job definition is required');
    }
    const { id, cron, handler } = def;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('register: job.id must be a non-empty string');
    }
    if (typeof cron !== 'string' || !cron.trim()) {
      throw new Error(`register(${id}): job.cron must be a non-empty string`);
    }
    if (typeof handler !== 'function') {
      throw new Error(`register(${id}): job.handler must be a function`);
    }
    if (jobs.has(id)) {
      throw new Error(`register: duplicate job id "${id}"`);
    }
    const parsed = parseCronExpression(cron);
    const entry = {
      def: { runMissedOnStartup: true, retries: 0, retryDelayMs: 1000, ...def },
      parsed,
      nextRunAt: computeNextRun(parsed, now()),
      lastRunAt: null,
      lastStatus: null,
      lastDurationMs: null,
      lastError: null,
      running: false,
      paused: false,
      totalRuns: 0,
      successRuns: 0,
      failureRuns: 0,
      overlapped: 0,
      history: [],
    };
    jobs.set(id, entry);
    logger.debug({ id, cron, nextRunAt: entry.nextRunAt }, 'scheduler.register');
    return entry;
  }

  function unregister(id) {
    return jobs.delete(id);
  }

  function list() {
    return Array.from(jobs.values()).map(serializeEntry);
  }

  function get(id) {
    const e = jobs.get(id);
    return e ? serializeEntry(e) : null;
  }

  function serializeEntry(e) {
    return {
      id: e.def.id,
      cron: e.def.cron,
      description: e.def.description || null,
      category: e.def.category || null,
      timeoutMs: e.def.timeout || null,
      retries: e.def.retries || 0,
      onFailure: e.def.onFailure || null,
      paused: e.paused,
      running: e.running,
      nextRunAt: e.nextRunAt ? e.nextRunAt.toISOString() : null,
      lastRunAt: e.lastRunAt ? e.lastRunAt.toISOString() : null,
      lastStatus: e.lastStatus,
      lastDurationMs: e.lastDurationMs,
      lastError: e.lastError,
      totalRuns: e.totalRuns,
      successRuns: e.successRuns,
      failureRuns: e.failureRuns,
      overlapped: e.overlapped,
      recentHistory: e.history.slice(-10),
    };
  }

  function pause(id) {
    const e = jobs.get(id);
    if (!e) return false;
    e.paused = true;
    logger.info({ id }, 'scheduler.pause');
    return true;
  }

  function resume(id) {
    const e = jobs.get(id);
    if (!e) return false;
    e.paused = false;
    e.nextRunAt = computeNextRun(e.parsed, now());
    logger.info({ id }, 'scheduler.resume');
    return true;
  }

  // ── tick loop ──────────────────────────────────────────────────
  function start() {
    if (running) return;
    running = true;
    logger.info('scheduler.start');
    // Optional catch-up of missed runs using persistence
    catchUpMissed().catch(err =>
      logger.error({ err: err && err.message }, 'scheduler.catchUp.error')
    );
    scheduleNextTick();
  }

  function stop() {
    running = false;
    if (tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
    logger.info('scheduler.stop');
  }

  function scheduleNextTick() {
    if (!running) return;
    const current = now();
    // Align to the next minute boundary (seconds=0, ms=0)
    const next = new Date(current.getTime());
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    const delay = Math.max(0, next.getTime() - current.getTime());
    tickTimer = setTimeout(() => {
      tick().catch(err =>
        logger.error({ err: err && err.message }, 'scheduler.tick.error')
      );
      scheduleNextTick();
    }, delay);
    // Unref so the timer doesn't hold the process open during tests
    if (tickTimer && typeof tickTimer.unref === 'function') tickTimer.unref();
  }

  async function tick() {
    const wallclock = now();
    for (const entry of jobs.values()) {
      if (entry.paused) continue;
      if (!entry.nextRunAt) continue;
      if (wallclock.getTime() >= entry.nextRunAt.getTime()) {
        // schedule this job with optional per-job jitter
        const jitter = pickJitter(entry);
        if (jitter > 0) {
          const t = setTimeout(() => runJob(entry, 'scheduled').catch(() => {}), jitter);
          if (t && typeof t.unref === 'function') t.unref();
        } else {
          runJob(entry, 'scheduled').catch(() => {});
        }
        // compute the NEXT nextRunAt immediately so overlapping ticks don't double-fire
        entry.nextRunAt = computeNextRun(entry.parsed, wallclock);
      }
    }
  }

  function pickJitter(entry) {
    const j = Number.isFinite(entry.def.jitterMs) ? entry.def.jitterMs : baseJitterMs;
    if (j <= 0) return 0;
    return Math.floor(Math.random() * j);
  }

  // ── run job with timeout/retries ──────────────────────────────
  async function runJob(entry, mode) {
    if (entry.running) {
      entry.overlapped += 1;
      entry.lastStatus = 'skipped';
      logger.warn({ id: entry.def.id }, 'scheduler.overlap_skip');
      appendRun(entry, {
        at: now().toISOString(),
        status: 'skipped',
        durationMs: null,
        error: 'previous run still in progress',
        mode,
      });
      return { status: 'skipped' };
    }
    entry.running = true;
    entry.totalRuns += 1;
    const started = now();
    entry.lastRunAt = started;
    entry.lastStatus = 'running';

    const maxAttempts = 1 + (entry.def.retries || 0);
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await withTimeout(
          entry.def.handler({
            id: entry.def.id,
            scheduledAt: started,
            attempt,
            logger,
          }),
          entry.def.timeout
        );
        const finished = now();
        const durationMs = finished.getTime() - started.getTime();
        entry.running = false;
        entry.lastStatus = 'success';
        entry.lastDurationMs = durationMs;
        entry.lastError = null;
        entry.successRuns += 1;
        appendRun(entry, {
          at: finished.toISOString(),
          status: 'success',
          durationMs,
          error: null,
          mode,
        });
        logger.info(
          { id: entry.def.id, durationMs, attempt, mode },
          'scheduler.run.success'
        );
        return { status: 'success', durationMs };
      } catch (err) {
        lastError = (err && err.message) || String(err);
        logger.warn(
          { id: entry.def.id, attempt, maxAttempts, err: lastError },
          'scheduler.run.attempt_failed'
        );
        if (attempt < maxAttempts) {
          await sleep(entry.def.retryDelayMs || 1000);
        }
      }
    }

    const finished = now();
    const durationMs = finished.getTime() - started.getTime();
    entry.running = false;
    entry.lastStatus = 'failure';
    entry.lastDurationMs = durationMs;
    entry.lastError = lastError;
    entry.failureRuns += 1;
    appendRun(entry, {
      at: finished.toISOString(),
      status: 'failure',
      durationMs,
      error: lastError,
      mode,
    });
    logger.error(
      { id: entry.def.id, durationMs, err: lastError, mode },
      'scheduler.run.failure'
    );
    if (onFailureHook && entry.def.onFailure) {
      try {
        await onFailureHook({ id: entry.def.id, hook: entry.def.onFailure, error: lastError });
      } catch (hookErr) {
        logger.error(
          { id: entry.def.id, err: hookErr && hookErr.message },
          'scheduler.onFailure.hook_error'
        );
      }
    }
    return { status: 'failure', error: lastError, durationMs };
  }

  function appendRun(entry, record) {
    entry.history.push(record);
    if (entry.history.length > 50) entry.history.shift();
    if (persistence && typeof persistence.writeRun === 'function') {
      try {
        persistence.writeRun({ jobId: entry.def.id, ...record });
      } catch (err) {
        logger.error(
          { id: entry.def.id, err: err && err.message },
          'scheduler.persistence.write_error'
        );
      }
    }
  }

  async function runNow(id) {
    const entry = jobs.get(id);
    if (!entry) throw new Error(`runNow: unknown job id "${id}"`);
    return runJob(entry, 'manual');
  }

  // ── catch-up missed runs (gracefully handle restart) ──────────
  async function catchUpMissed() {
    if (!persistence || typeof persistence.readLastRuns !== 'function') return;
    let lastRuns;
    try {
      lastRuns = await persistence.readLastRuns();
    } catch (err) {
      logger.warn({ err: err && err.message }, 'scheduler.catchUp.read_error');
      return;
    }
    if (!lastRuns || typeof lastRuns !== 'object') return;
    const wallclock = now();
    for (const entry of jobs.values()) {
      if (entry.paused) continue;
      if (entry.def.runMissedOnStartup === false) continue;
      const last = lastRuns[entry.def.id];
      const lastMs = last && last.at ? new Date(last.at).getTime() : null;
      // What was the most recent scheduled tick strictly before "now"?
      const prevScheduled = computePrevRun(entry.parsed, wallclock);
      if (!prevScheduled) continue;
      // If we never ran it, or we last ran before the most recent scheduled
      // tick, fire a catch-up run (marked mode='catchup'). A single run —
      // we do not try to "replay" every missed tick.
      if (lastMs === null || lastMs < prevScheduled.getTime()) {
        logger.info(
          { id: entry.def.id, lastRunAt: last ? last.at : null, prevScheduled },
          'scheduler.catchUp.fire'
        );
        // Fire-and-forget — tick() will keep running
        runJob(entry, 'catchup').catch(() => {});
      }
    }
  }

  // ── expose helpers ─────────────────────────────────────────────
  return {
    register,
    unregister,
    list,
    get,
    pause,
    resume,
    runNow,
    start,
    stop,
    parseCron: parseCronExpression,
    computeNextRun: (expr, from) => computeNextRun(parseCronExpression(expr), from || now()),
    matches: (expr, date) => cronMatches(parseCronExpression(expr), date),
    _tick: tick,
    _jobs: jobs,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    if (t && typeof t.unref === 'function') t.unref();
  });
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`job timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (t && typeof t.unref === 'function') t.unref();
    Promise.resolve(promise).then(
      val => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(val);
      },
      err => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

/**
 * Walk backwards from `from` (exclusive) looking for the most recent minute
 * that matches the parsed expression. Used only for catch-up on startup;
 * caps at MAX_NEXT_RUN_SCAN_YEARS to keep it bounded.
 */
function computePrevRun(parsed, from) {
  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() - MAX_NEXT_RUN_SCAN_YEARS);
  const probe = new Date(from.getTime());
  probe.setSeconds(0, 0);
  probe.setMinutes(probe.getMinutes() - 1);
  while (probe > limit) {
    if (cronMatches(parsed, probe)) return probe;
    probe.setMinutes(probe.getMinutes() - 1);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

module.exports = {
  createScheduler,
  parseCronExpression,
  cronMatches,
  computeNextRun,
  computePrevRun,
  _internal: { FIELD_BOUNDS, withTimeout, sleep },
};
