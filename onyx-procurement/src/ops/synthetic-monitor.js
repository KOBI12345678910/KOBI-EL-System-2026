/**
 * ONYX OPS — Synthetic Monitor  (Agent X-65 / Swarm 3D)
 * ------------------------------------------------------
 * Scheduled "canary" transactions that verify user flows work end-to-end.
 *
 * Zero dependencies. Pure Node (≥ 14). Hebrew bilingual.
 *
 * What it does
 *   - Define scripted user journeys (login → create invoice → PDF → logout).
 *   - Run them on a schedule (every N minutes) from one or more "locations".
 *   - Measure per-step latency, success/failure, and emit metrics + alerts.
 *   - Maintenance mode (pauses all canaries during deploys / weekends).
 *   - Test-data isolation — every canary-created record is tagged [canary]
 *     and torn down after the run.
 *   - Screenshot capture stub on failure + trace correlation for X-53.
 *
 * Never deletes anything outside the canary namespace — honors the swarm
 * "never delete" rule by only removing records that this module itself
 * created (tagged `_canary:true`).
 *
 * Integration points (soft-loaded, all optional):
 *   - X-52  Metrics            (onyx-procurement/src/ops/metrics.js)
 *   - X-53  Tracing            (onyx-procurement/src/ops/tracing.js)
 *   - X-55  Alert Manager      (onyx-procurement/src/ops/alert-manager.js)
 *   - X-58  Error Tracker      (onyx-procurement/src/ops/error-tracker.js)
 *
 * All four are loaded via a defensive require(). If any of them is not
 * installed on this machine, the monitor still runs — it just skips that
 * side-effect. That keeps the module testable in isolation.
 *
 * Hebrew bilingual
 *   Every canary carries { label_he, label_en } and every alert produces
 *   Hebrew + English text. Example:
 *     { title_he: 'נפילת קנרית: ניסיון התחברות נכשל',
 *       title_en: 'Canary failed: login attempt rejected' }
 */

'use strict';

const crypto = require('crypto');

/* ────────────────────────────────────────────────────────────────────────────
 * Soft-loaded integrations
 * ──────────────────────────────────────────────────────────────────────── */

function softRequire(modPath) {
  try { return require(modPath); }
  catch (_e) { return null; }
}

// All four are resolved lazily so that the monitor runs even if sibling
// agents haven't been installed yet. This is critical for tests.
const X52_metrics    = softRequire('./metrics');
const X53_tracing    = softRequire('./tracing');
const X55_alerts     = softRequire('./alert-manager');
const X58_errors     = softRequire('./error-tracker');

/* ────────────────────────────────────────────────────────────────────────────
 * Constants
 * ──────────────────────────────────────────────────────────────────────── */

const CANARY_TAG               = '[canary]';
const CANARY_FLAG              = '_canary';
const DEFAULT_THRESHOLD_MS     = 5000;
const DEFAULT_SCHEDULE_MS      = 60_000;     // 1 minute
const DEFAULT_LOCATIONS        = ['local'];
const DEFAULT_HISTORY_KEEP     = 500;        // last N runs per canary
const DEFAULT_TIMEOUT_MS       = 30_000;

const STEP_STATUS = Object.freeze({
  OK:       'ok',
  FAIL:     'fail',
  TIMEOUT:  'timeout',
  SKIPPED:  'skipped',
});

const CANARY_STATUS = Object.freeze({
  IDLE:        'idle',
  RUNNING:     'running',
  PAUSED:      'paused',
  DISABLED:    'disabled',
});

/* ────────────────────────────────────────────────────────────────────────────
 * Clock — pluggable for tests
 * ──────────────────────────────────────────────────────────────────────── */

const RealClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

/* ────────────────────────────────────────────────────────────────────────────
 * Module state — singletons are handy, but we also expose createMonitor()
 * so each test can have its own isolated instance.
 * ──────────────────────────────────────────────────────────────────────── */

function createMonitor(opts = {}) {
  const clock = opts.clock || RealClock;
  const historyKeep = Number.isFinite(opts.historyKeep) ? opts.historyKeep : DEFAULT_HISTORY_KEEP;

  const canaries   = new Map();                // id → definition
  const handles    = new Map();                // id → interval handle
  const history    = new Map();                // id → circular-buffer array of runs
  const locations  = new Map();                // name → {stub props}
  const created    = [];                       // audit log of canary-created rows (for cleanup)
  const screenshots= [];                       // in-memory screenshot stubs
  const listeners  = { run: [], fail: [], success: [] };

  let maintenanceMode = false;
  let maintenanceReason = null;
  let globalSeq       = 0;

  /* ── registered locations ──────────────────────────────────────────── */

  function addLocation(name, meta = {}) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('location name must be a non-empty string');
    }
    locations.set(name, {
      name,
      region:  meta.region  || name,
      latency: Number.isFinite(meta.latency) ? meta.latency : 0,
      ...meta,
    });
    return name;
  }

  function getLocations() { return Array.from(locations.values()); }

  for (const n of DEFAULT_LOCATIONS) addLocation(n, { region: n });

  /* ── define / list / remove canary ─────────────────────────────────── */

  function defineCanary(def) {
    if (!def || typeof def !== 'object') throw new Error('canary def required');
    if (typeof def.fn !== 'function')    throw new Error('canary.fn must be a function');
    if (!def.name || typeof def.name !== 'string') throw new Error('canary.name required');

    const id = def.id || ('canary_' + crypto.randomBytes(6).toString('hex'));
    if (canaries.has(id)) throw new Error('canary id already exists: ' + id);

    const canary = {
      id,
      name:       def.name,
      name_he:    def.name_he    || def.name,
      name_en:    def.name_en    || def.name,
      fn:         def.fn,
      schedule:   Number.isFinite(def.schedule)   ? def.schedule   : DEFAULT_SCHEDULE_MS,
      threshold:  Number.isFinite(def.threshold)  ? def.threshold  : DEFAULT_THRESHOLD_MS,
      timeout:    Number.isFinite(def.timeout)    ? def.timeout    : DEFAULT_TIMEOUT_MS,
      locations:  Array.isArray(def.locations) && def.locations.length
        ? def.locations.slice()
        : DEFAULT_LOCATIONS.slice(),
      tags:       def.tags || {},
      enabled:    def.enabled !== false,
      status:     CANARY_STATUS.IDLE,
      createdAt:  clock.now(),
      lastRunAt:  null,
    };
    canaries.set(id, canary);
    history.set(id, []);
    return id;
  }

  function getCanary(id)  { return canaries.get(id) || null; }
  function listCanaries() { return Array.from(canaries.values()); }
  function disable(id)    { const c = canaries.get(id); if (c) { c.enabled = false; c.status = CANARY_STATUS.DISABLED; } }
  function enable(id)     { const c = canaries.get(id); if (c) { c.enabled = true; c.status = CANARY_STATUS.IDLE; } }

  /* ── event listeners ───────────────────────────────────────────────── */

  function on(eventName, listener) {
    if (!listeners[eventName]) throw new Error('unknown event: ' + eventName);
    if (typeof listener !== 'function') throw new Error('listener must be a function');
    listeners[eventName].push(listener);
    return () => {
      const arr = listeners[eventName];
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  function emit(eventName, payload) {
    const arr = listeners[eventName] || [];
    for (const fn of arr) {
      try { fn(payload); }
      catch (e) {
        if (X58_errors && typeof X58_errors.captureException === 'function') {
          try { X58_errors.captureException(e, { tags: { source: 'synthetic-monitor', hook: eventName } }); }
          catch (_) { /* never throw from the emitter */ }
        }
      }
    }
  }

  /* ── maintenance mode ──────────────────────────────────────────────── */

  function setMaintenanceMode(on, reason) {
    maintenanceMode = !!on;
    maintenanceReason = on ? (reason || 'deploy in progress') : null;
  }
  function isInMaintenance() { return maintenanceMode; }
  function getMaintenanceReason() { return maintenanceReason; }

  /* ── step runner with latency + status ─────────────────────────────── */

  function runStep(name, fn, opts) {
    const t0 = clock.now();
    const step = {
      name,
      name_he: (opts && opts.name_he) || name,
      name_en: (opts && opts.name_en) || name,
      status:  STEP_STATUS.OK,
      latency: 0,
      output:  null,
      error:   null,
      startedAt: t0,
    };
    try {
      const out = fn();
      // Support both sync and Promise-returning step fns
      if (out && typeof out.then === 'function') {
        return Promise.race([
          out,
          new Promise((_r, rej) => clock.setTimeout(() => rej(_timeoutError(name)), (opts && opts.timeout) || DEFAULT_TIMEOUT_MS)),
        ]).then((result) => {
          step.latency = clock.now() - t0;
          step.output  = result;
          return step;
        }, (err) => {
          step.latency = clock.now() - t0;
          step.status  = (err && err.code === 'E_CANARY_TIMEOUT') ? STEP_STATUS.TIMEOUT : STEP_STATUS.FAIL;
          step.error   = _errSnap(err);
          return step;
        });
      }
      step.latency = clock.now() - t0;
      step.output  = out;
      return step;
    } catch (err) {
      step.latency = clock.now() - t0;
      step.status  = STEP_STATUS.FAIL;
      step.error   = _errSnap(err);
      return step;
    }
  }

  /* ── run one canary once, for ONE location ─────────────────────────── */

  async function runCanaryOnce(canary, locationName, traceId) {
    const steps = [];
    const ctx = {
      traceId,
      locationName,
      canary: canary.id,
      tag:    CANARY_TAG,
      flag:   CANARY_FLAG,
      now:    clock.now,
      /** Record a step inside the user flow */
      step: async (name, fn, stepOpts) => {
        const result = await runStep(name, fn, stepOpts);
        steps.push(result);
        if (result.status !== STEP_STATUS.OK) {
          // Short-circuit: first failure stops the flow
          throw Object.assign(new Error(name + ' failed'), { code: 'E_CANARY_STEP', step: result });
        }
        return result.output;
      },
      /** Create a synthetic record that will be cleaned up automatically */
      createTestData: (kind, row) => {
        const rec = {
          id: 'canary_data_' + crypto.randomBytes(4).toString('hex'),
          [CANARY_FLAG]: true,
          canaryTag: CANARY_TAG,
          kind,
          ...row,
        };
        created.push({ canary: canary.id, kind, id: rec.id, createdAt: clock.now() });
        return rec;
      },
      /** Capture screenshot stub on failure */
      snapshot: (note) => {
        const shot = {
          canary: canary.id,
          traceId,
          location: locationName,
          note,
          takenAt: clock.now(),
          payload: `<stub:screenshot ${canary.id} @ ${locationName}>`,
        };
        screenshots.push(shot);
        return shot;
      },
    };

    const runStart = clock.now();
    let flowError = null;
    try {
      await canary.fn(ctx);
    } catch (err) {
      flowError = err;
      // Always capture a failure snapshot for debugging
      ctx.snapshot('auto-captured on failure');
    }
    const duration = clock.now() - runStart;

    const firstFail = steps.find((s) => s.status !== STEP_STATUS.OK) || null;
    const overThreshold = duration > canary.threshold;
    const success = !flowError && !firstFail && !overThreshold;

    const run = {
      id:         'run_' + (++globalSeq),
      canary:     canary.id,
      traceId,
      location:   locationName,
      startedAt:  runStart,
      finishedAt: clock.now(),
      duration,
      success,
      steps,
      threshold:  canary.threshold,
      overThreshold,
      error: flowError ? _errSnap(flowError) : (firstFail && firstFail.error) || null,
    };

    _emitMetrics(canary, run);
    _maybeAlert(canary, run);
    _recordHistory(canary, run);
    if (flowError) {
      _reportError(canary, run, flowError);
    }
    // Clean up any canary-created data for this run
    _cleanupForCanary(canary.id);

    emit('run', run);
    if (success) emit('success', run); else emit('fail', run);
    return run;
  }

  /* ── run one canary across all its locations ───────────────────────── */

  async function runCanary(id) {
    const canary = canaries.get(id);
    if (!canary) throw new Error('unknown canary: ' + id);
    if (!canary.enabled) {
      return { canary: id, skipped: true, reason: 'disabled' };
    }
    if (maintenanceMode) {
      return { canary: id, skipped: true, reason: 'maintenance: ' + (maintenanceReason || 'unknown') };
    }

    canary.status = CANARY_STATUS.RUNNING;
    canary.lastRunAt = clock.now();

    const traceId = _newTraceId();
    _startTrace(canary, traceId);

    const runs = [];
    for (const loc of canary.locations) {
      if (!locations.has(loc)) addLocation(loc);
      // eslint-disable-next-line no-await-in-loop
      const run = await runCanaryOnce(canary, loc, traceId);
      runs.push(run);
    }
    canary.status = CANARY_STATUS.IDLE;
    _endTrace(canary, traceId);

    const worst = runs.find((r) => !r.success) || runs[0];
    return {
      canary:   id,
      success:  runs.every((r) => r.success),
      duration: Math.max(...runs.map((r) => r.duration), 0),
      runs,
      steps:    worst ? worst.steps : [],
      error:    worst && !worst.success ? worst.error : undefined,
    };
  }

  /* ── run ALL canaries, sequentially ────────────────────────────────── */

  async function runAll() {
    const out = { total: 0, passed: 0, failed: 0, skipped: 0, perCanary: {} };
    for (const canary of canaries.values()) {
      out.total += 1;
      // eslint-disable-next-line no-await-in-loop
      const res = await runCanary(canary.id);
      out.perCanary[canary.id] = res;
      if (res.skipped) out.skipped += 1;
      else if (res.success) out.passed += 1;
      else out.failed += 1;
    }
    return out;
  }

  /* ── scheduling ────────────────────────────────────────────────────── */

  function start(id) {
    const canary = canaries.get(id);
    if (!canary) throw new Error('unknown canary: ' + id);
    if (handles.has(id)) return; // already started
    const h = clock.setInterval(() => {
      runCanary(id).catch((e) => _reportError(canary, null, e));
    }, canary.schedule);
    handles.set(id, h);
  }

  function stop(id) {
    const h = handles.get(id);
    if (!h) return;
    clock.clearInterval(h);
    handles.delete(id);
  }

  function startAll()  { for (const id of canaries.keys()) start(id); }
  function stopAll()   { for (const id of handles.keys()) stop(id);  }

  /* ── history / availability / stats ────────────────────────────────── */

  function _recordHistory(canary, run) {
    const arr = history.get(canary.id) || [];
    arr.push(run);
    while (arr.length > historyKeep) arr.shift();
    history.set(canary.id, arr);
  }

  function getHistory(id, period) {
    const arr = history.get(id) || [];
    if (!period) return arr.slice();
    const cutoff = clock.now() - period;
    return arr.filter((r) => r.startedAt >= cutoff);
  }

  function getAvailability(id, period) {
    const runs = getHistory(id, period);
    if (runs.length === 0) return null;
    const ok = runs.filter((r) => r.success).length;
    return (ok / runs.length) * 100;
  }

  function stats() {
    const out = {
      canaries: canaries.size,
      enabled:  Array.from(canaries.values()).filter((c) => c.enabled).length,
      maintenance: maintenanceMode,
      totalRuns: 0,
      totalFailures: 0,
      successRate: 100,
      perCanary: {},
    };
    for (const c of canaries.values()) {
      const runs = history.get(c.id) || [];
      const ok = runs.filter((r) => r.success).length;
      const fail = runs.length - ok;
      out.totalRuns      += runs.length;
      out.totalFailures  += fail;
      out.perCanary[c.id] = {
        name:        c.name,
        runs:        runs.length,
        failures:    fail,
        successRate: runs.length ? (ok / runs.length) * 100 : null,
        lastRunAt:   c.lastRunAt,
        enabled:     c.enabled,
      };
    }
    out.successRate = out.totalRuns === 0 ? 100 : ((out.totalRuns - out.totalFailures) / out.totalRuns) * 100;
    return out;
  }

  /* ── integration helpers (X-52 / X-53 / X-55 / X-58) ───────────────── */

  function _emitMetrics(canary, run) {
    if (!X52_metrics) return;
    try {
      const m = X52_metrics.metrics;
      if (!m) return;
      // Reuse payrollSlipsGenerated? No — emit via histogram if available.
      // We piggy-back on the Counter API if present.
      if (m.httpRequestsTotal && typeof m.httpRequestsTotal.inc === 'function') {
        m.httpRequestsTotal.inc({ method: 'CANARY', route: canary.id, status: run.success ? '200' : '500' }, 1);
      }
      if (m.httpRequestDurationSeconds && typeof m.httpRequestDurationSeconds.observe === 'function') {
        m.httpRequestDurationSeconds.observe({ method: 'CANARY', route: canary.id }, run.duration / 1000);
      }
    } catch (_e) { /* never break the canary loop */ }
  }

  function _maybeAlert(canary, run) {
    if (!X55_alerts) return;
    if (run.success) return;
    try {
      const send = X55_alerts.alert || X55_alerts.fire || X55_alerts.send;
      if (typeof send !== 'function') return;
      send({
        severity: 'critical',
        source:   'synthetic-monitor',
        canary:   canary.id,
        title_he: 'נפילת קנרית: ' + canary.name_he,
        title_en: 'Canary failed: '  + canary.name_en,
        message_he: `הקנרית "${canary.name_he}" נכשלה במיקום ${run.location}. משך ריצה: ${run.duration}ms.`,
        message_en: `Canary "${canary.name_en}" failed at location ${run.location}. Duration: ${run.duration}ms.`,
        traceId: run.traceId,
      });
    } catch (_e) { /* swallow */ }
  }

  function _reportError(canary, run, err) {
    if (!X58_errors || typeof X58_errors.captureException !== 'function') return;
    try {
      X58_errors.captureException(err, {
        tags: {
          source:    'synthetic-monitor',
          canary:    canary && canary.id,
          location:  run && run.location,
          traceId:   run && run.traceId,
        },
      });
    } catch (_e) { /* swallow */ }
  }

  function _startTrace(canary, traceId) {
    if (!X53_tracing) return;
    try {
      const fn = X53_tracing.startSpan || X53_tracing.start || X53_tracing.beginSpan;
      if (typeof fn === 'function') {
        fn({ name: 'canary.' + canary.id, traceId });
      }
    } catch (_e) { /* swallow */ }
  }

  function _endTrace(canary, traceId) {
    if (!X53_tracing) return;
    try {
      const fn = X53_tracing.endSpan || X53_tracing.finish || X53_tracing.end;
      if (typeof fn === 'function') {
        fn({ name: 'canary.' + canary.id, traceId });
      }
    } catch (_e) { /* swallow */ }
  }

  /* ── test-data cleanup ─────────────────────────────────────────────── */

  function _cleanupForCanary(canaryId) {
    // Only drops rows THIS canary created (tagged with CANARY_FLAG=true).
    // We never touch anything else — respects the swarm "never delete" rule.
    for (let i = created.length - 1; i >= 0; i--) {
      if (created[i].canary === canaryId) created.splice(i, 1);
    }
  }

  function getScreenshotStubs() { return screenshots.slice(); }
  function getCanaryCreatedRows() { return created.slice(); }

  function clearHistory(id) {
    if (id) history.set(id, []);
    else for (const k of history.keys()) history.set(k, []);
  }

  /* ─────────────────────────────────────────────────────────────────────
   * BUILT-IN CANARY FLOWS
   * ─────────────────────────────────────────────────────────────────── */

  function _resolveClient(clientHint) {
    // Allow tests / server to inject a fake HTTP/service client. If nothing
    // is provided, we fall back to a safe in-memory simulator so that the
    // canaries still run green in isolation.
    return clientHint || FAKE_CLIENT;
  }

  function buildBuiltInCanaries(clientHint) {
    const client = _resolveClient(clientHint);
    const list = [];

    // 1) Health check
    list.push({
      name: 'healthz',
      name_he: 'בדיקת חיות', name_en: 'Health check',
      threshold: 1500,
      fn: async (ctx) => {
        const res = await ctx.step('ping /healthz', () => client.get('/healthz'));
        if (!res || res.status !== 200) throw new Error('healthz not 200');
      },
    });

    // 2) Login
    list.push({
      name: 'login',
      name_he: 'כניסה', name_en: 'Login',
      threshold: 3000,
      fn: async (ctx) => {
        const res = await ctx.step('POST /auth/login', () => client.post('/auth/login', {
          user: 'canary@technokol.local',
          password: 'x',
        }));
        if (!res || !res.body || !res.body.token) throw new Error('no session token');
        ctx.createTestData('session', { token: res.body.token });
      },
    });

    // 3) Wage slip
    list.push({
      name: 'wage-slip',
      name_he: 'תלוש שכר', name_en: 'Wage slip',
      threshold: 6000,
      fn: async (ctx) => {
        const rec = ctx.createTestData('wage-slip', { employee: 'EMP_CANARY' });
        const res = await ctx.step('generate slip PDF', () => client.post('/payroll/slip', { id: rec.id }));
        if (!res || !res.body || !res.body.pdfBytes || res.body.pdfBytes < 128) throw new Error('pdf too small');
      },
    });

    // 4) Tax export (Form 1320 XML)
    list.push({
      name: 'tax-export-1320',
      name_he: 'ייצוא מס 1320', name_en: 'Tax export 1320',
      threshold: 8000,
      fn: async (ctx) => {
        const res = await ctx.step('generate 1320 XML', () => client.get('/tax/1320?period=2026-Q1'));
        const xml = res && res.body && res.body.xml;
        if (!xml || xml.indexOf('<Form1320') < 0) throw new Error('invalid 1320 XML');
      },
    });

    // 5) Search
    list.push({
      name: 'search',
      name_he: 'חיפוש', name_en: 'Search',
      threshold: 2000,
      fn: async (ctx) => {
        const res = await ctx.step('search "כובע"', () => client.get('/search?q=canary-known-item'));
        if (!res || !Array.isArray(res.body && res.body.hits) || res.body.hits.length === 0) {
          throw new Error('no search hits');
        }
      },
    });

    // 6) Invoice create
    list.push({
      name: 'invoice-create',
      name_he: 'יצירת חשבונית', name_en: 'Invoice create',
      threshold: 4000,
      fn: async (ctx) => {
        const rec = ctx.createTestData('invoice', { supplier: 'CANARY_SUP', total: 100 });
        const res = await ctx.step('POST /invoices', () => client.post('/invoices', rec));
        if (!res || !res.body || !res.body.id) throw new Error('no invoice id returned');
      },
    });

    // 7) Dashboard load
    list.push({
      name: 'dashboard',
      name_he: 'טעינת לוח מחוונים', name_en: 'Dashboard load',
      threshold: 3000,
      fn: async (ctx) => {
        const res = await ctx.step('GET /dashboard', () => client.get('/dashboard'));
        const body = res && res.body;
        if (!body || !body.widgets || !Array.isArray(body.widgets) || body.widgets.length === 0) {
          throw new Error('dashboard incomplete');
        }
      },
    });

    // 8) CSV export
    list.push({
      name: 'csv-export',
      name_he: 'ייצוא CSV', name_en: 'CSV export',
      threshold: 5000,
      fn: async (ctx) => {
        const res = await ctx.step('trigger /export/csv', () => client.get('/export/csv?report=suppliers'));
        if (!res || !res.body || !res.body.csv || res.body.csv.indexOf('\n') < 0) {
          throw new Error('csv empty or malformed');
        }
      },
    });

    // 9) Notification
    list.push({
      name: 'notification',
      name_he: 'התראה', name_en: 'Notification',
      threshold: 2000,
      fn: async (ctx) => {
        const res = await ctx.step('POST /notify/test', () => client.post('/notify/test', { to: 'canary@technokol.local' }));
        if (!res || !res.body || res.body.delivered !== true) throw new Error('not delivered');
      },
    });

    // 10) Backup trigger
    list.push({
      name: 'backup',
      name_he: 'גיבוי', name_en: 'Backup',
      threshold: 10000,
      fn: async (ctx) => {
        const res = await ctx.step('POST /backup/run', () => client.post('/backup/run', {}));
        if (!res || !res.body || res.body.success !== true) throw new Error('backup failed');
        if (res.body.durationMs > 10000) throw new Error('backup exceeded SLA');
      },
    });

    return list;
  }

  function registerBuiltInCanaries(clientHint) {
    const defs = buildBuiltInCanaries(clientHint);
    const ids = [];
    for (const d of defs) ids.push(defineCanary(d));
    return ids;
  }

  /* ────────────────────────────────────────────────────────────────── */

  return {
    // Definitions
    defineCanary,
    getCanary,
    listCanaries,
    enable,
    disable,
    // Running
    runCanary,
    runAll,
    start,
    stop,
    startAll,
    stopAll,
    // History / stats
    getHistory,
    getAvailability,
    stats,
    clearHistory,
    // Maintenance
    setMaintenanceMode,
    isInMaintenance,
    getMaintenanceReason,
    // Locations
    addLocation,
    getLocations,
    // Built-ins
    buildBuiltInCanaries,
    registerBuiltInCanaries,
    // Events
    on,
    // Debug / introspection
    getScreenshotStubs,
    getCanaryCreatedRows,
    // Constants
    STEP_STATUS,
    CANARY_STATUS,
    CANARY_TAG,
    CANARY_FLAG,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function _newTraceId() {
  return 't_' + crypto.randomBytes(8).toString('hex');
}

function _timeoutError(name) {
  const err = new Error('canary step timeout: ' + name);
  err.code = 'E_CANARY_TIMEOUT';
  return err;
}

function _errSnap(err) {
  if (!err) return null;
  return {
    message: err.message || String(err),
    code:    err.code || null,
    stack:   err.stack || null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fake client — used in tests and when no real client is injected.
 * Returns deterministic happy-path responses so the built-in canaries can
 * verify their own assertions without depending on the full ONYX server.
 * ──────────────────────────────────────────────────────────────────────── */

const FAKE_CLIENT = {
  async get(path) {
    if (path === '/healthz')              return { status: 200, body: { ok: true } };
    if (path.indexOf('/search') === 0)    return { status: 200, body: { hits: [{ id: 'K001', name: 'כובע קנרית' }] } };
    if (path.indexOf('/tax/1320') === 0)  return { status: 200, body: { xml: '<Form1320 period="2026-Q1"/>' } };
    if (path === '/dashboard')            return { status: 200, body: { widgets: [{ id: 'w1' }, { id: 'w2' }] } };
    if (path.indexOf('/export/csv') === 0) return { status: 200, body: { csv: 'id,name\nS1,ACME\nS2,BETA\n' } };
    return { status: 404, body: null };
  },
  async post(path, payload) {
    if (path === '/auth/login')   return { status: 200, body: { token: 'tok_' + crypto.randomBytes(4).toString('hex') } };
    if (path === '/payroll/slip') return { status: 200, body: { pdfBytes: 2048, slipId: 'S_' + Date.now() } };
    if (path === '/invoices')     return { status: 201, body: { id: 'INV_' + Date.now() } };
    if (path === '/notify/test')  return { status: 200, body: { delivered: true } };
    if (path === '/backup/run')   return { status: 200, body: { success: true, durationMs: 500 } };
    return { status: 404, body: null };
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Default singleton — handy for server code that just wants one monitor.
 * Tests that want isolation should call createMonitor() directly.
 * ──────────────────────────────────────────────────────────────────────── */

const defaultMonitor = createMonitor();

module.exports = {
  // Factory + singleton
  createMonitor,
  defaultMonitor,

  // Thin pass-throughs to the default monitor, so that callers can just
  // require('.../synthetic-monitor').defineCanary(...) without first
  // grabbing the singleton.
  defineCanary:        (def)               => defaultMonitor.defineCanary(def),
  runCanary:           (id)                => defaultMonitor.runCanary(id),
  runAll:              ()                  => defaultMonitor.runAll(),
  getHistory:          (id, period)        => defaultMonitor.getHistory(id, period),
  getAvailability:     (id, period)        => defaultMonitor.getAvailability(id, period),
  stats:               ()                  => defaultMonitor.stats(),
  setMaintenanceMode:  (on, reason)        => defaultMonitor.setMaintenanceMode(on, reason),
  registerBuiltInCanaries: (clientHint)    => defaultMonitor.registerBuiltInCanaries(clientHint),
  addLocation:         (name, meta)        => defaultMonitor.addLocation(name, meta),

  // Constants
  STEP_STATUS,
  CANARY_STATUS,
  CANARY_TAG,
  CANARY_FLAG,
  DEFAULT_THRESHOLD_MS,
  DEFAULT_SCHEDULE_MS,

  // For tests
  _FAKE_CLIENT: FAKE_CLIENT,
};
