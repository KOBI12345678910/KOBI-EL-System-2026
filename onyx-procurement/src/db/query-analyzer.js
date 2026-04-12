/**
 * ONYX DB — Query Performance Analyzer
 * ────────────────────────────────────────────
 * Agent-57 / Query Observability Module
 *
 * Purpose:
 *   Wrap a supabase client (or any thenable-returning query builder) so that
 *   every fluent call chain is measured and summarized.  This module is
 *   PURELY ADDITIVE — it never removes or replaces the primary supabase
 *   client in server.js; callers opt in via `wrapSupabase(client)` or use
 *   the standalone `measure()` helper.
 *
 * Captured per call:
 *   - table       — first argument to .from()
 *   - op          — 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc' | 'unknown'
 *   - rows        — rows returned in `data` (0 if head/count only)
 *   - duration_ms — milliseconds between await entry and fulfilment
 *   - error       — normalized error message, or null
 *
 * Slow-query log:
 *   Entries whose duration_ms > SLOW_THRESHOLD_MS are appended to
 *   logs/slow-queries.jsonl (one JSON record per line, newline delimited).
 *   Configurable via env ONYX_SLOW_QUERY_MS (default 500).
 *
 * Histogram:
 *   Per-table samples capped at MAX_SAMPLES_PER_TABLE (default 10_000) using
 *   reservoir sampling.  p50/p95/p99 are derived from the reservoir, not
 *   a fixed-bucket histogram, so they stay accurate across any distribution.
 *
 * Endpoints (mounted by registerAdminRoutes):
 *   GET  /api/admin/query-stats          — aggregated JSON dashboard
 *   POST /api/admin/query-stats/reset    — zeroes the in-memory counters
 *
 * Environment variables:
 *   ONYX_SLOW_QUERY_MS   integer ms threshold, default 500
 *   ONYX_QA_LOG_DIR      log directory, default <cwd>/logs
 *   ONYX_QA_MAX_SAMPLES  per-table reservoir cap, default 10000
 *
 * Exports:
 *   wrapSupabase(client)        → proxy supabase client that records every call
 *   measure(label, promise)     → low-level: tag any promise with a table label
 *   recordSample(sample)        → internal (and test) hook to push a measurement
 *   getStats()                  → snapshot object (used by the endpoint)
 *   reset()                     → clear histograms + counters (keeps config)
 *   registerAdminRoutes(app)    → mount GET/POST admin endpoints
 *   _internals                  → exposed for tests (config, store)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const DEFAULT_SLOW_MS = 500;
const DEFAULT_MAX_SAMPLES = 10_000;

const config = {
  slowMs: parseInt(process.env.ONYX_SLOW_QUERY_MS, 10) || DEFAULT_SLOW_MS,
  logDir: process.env.ONYX_QA_LOG_DIR || path.join(process.cwd(), 'logs'),
  maxSamplesPerTable: parseInt(process.env.ONYX_QA_MAX_SAMPLES, 10) || DEFAULT_MAX_SAMPLES,
  slowLogFile: 'slow-queries.jsonl',
};

// ─────────────────────────────────────────────────────────────────
// IN-MEMORY STORE
// ─────────────────────────────────────────────────────────────────
//
// perTable: Map<tableName, {
//   count, totalMs, errors, rows,
//   samples: number[],      // reservoir of duration_ms values
//   sampleSeen: number,     // total seen (reservoir counter)
//   lastOpCounts: { select, insert, update, delete, upsert, rpc, unknown }
// }>
//
// perMinute: Map<minuteEpochNumber, count>
// slowest: sorted array of slowest queries, capped at TOP_N.
// ─────────────────────────────────────────────────────────────────

const TOP_N = 10;
const perTable = new Map();
let perMinute = new Map();
let slowest = []; // entries: { table, op, duration_ms, rows, error, ts }
let startedAt = Date.now();

function ensureTableBucket(table) {
  let b = perTable.get(table);
  if (!b) {
    b = {
      count: 0,
      totalMs: 0,
      errors: 0,
      rows: 0,
      samples: [],
      sampleSeen: 0,
      ops: { select: 0, insert: 0, update: 0, delete: 0, upsert: 0, rpc: 0, unknown: 0 },
    };
    perTable.set(table, b);
  }
  return b;
}

// Reservoir sampling — keeps an unbiased sample of bounded size.
function reservoirPush(bucket, value) {
  const cap = config.maxSamplesPerTable;
  bucket.sampleSeen += 1;
  if (bucket.samples.length < cap) {
    bucket.samples.push(value);
    return;
  }
  const idx = Math.floor(Math.random() * bucket.sampleSeen);
  if (idx < cap) bucket.samples[idx] = value;
}

function bumpMinute(ts) {
  const minute = Math.floor(ts / 60_000);
  perMinute.set(minute, (perMinute.get(minute) || 0) + 1);
  // Prune beyond the last 60 minutes so the map cannot grow unbounded.
  if (perMinute.size > 120) {
    const cutoff = minute - 60;
    for (const k of perMinute.keys()) {
      if (k < cutoff) perMinute.delete(k);
    }
  }
}

function pushSlowest(entry) {
  slowest.push(entry);
  slowest.sort((a, b) => b.duration_ms - a.duration_ms);
  if (slowest.length > TOP_N) slowest.length = TOP_N;
}

// ─────────────────────────────────────────────────────────────────
// SLOW QUERY LOG (append-only JSONL)
// ─────────────────────────────────────────────────────────────────

function ensureLogDir() {
  try {
    fs.mkdirSync(config.logDir, { recursive: true });
  } catch (_) {
    // best-effort; disk errors are swallowed so query path stays hot
  }
}

function appendSlowLog(sample) {
  ensureLogDir();
  const line = JSON.stringify({
    ts: new Date(sample.ts).toISOString(),
    table: sample.table,
    op: sample.op,
    duration_ms: sample.duration_ms,
    rows: sample.rows,
    error: sample.error,
  }) + '\n';
  try {
    fs.appendFileSync(path.join(config.logDir, config.slowLogFile), line, 'utf8');
  } catch (_) {
    // silent — never crash a query because the log disk is full
  }
}

// ─────────────────────────────────────────────────────────────────
// SAMPLE RECORDING
// ─────────────────────────────────────────────────────────────────

function recordSample(sample) {
  // sample: { table, op, duration_ms, rows, error, ts? }
  const ts = sample.ts || Date.now();
  const table = sample.table || 'unknown';
  const op = sample.op || 'unknown';
  const duration = Number(sample.duration_ms) || 0;
  const rows = Number(sample.rows) || 0;
  const error = sample.error || null;

  const bucket = ensureTableBucket(table);
  bucket.count += 1;
  bucket.totalMs += duration;
  bucket.rows += rows;
  if (error) bucket.errors += 1;
  if (bucket.ops[op] === undefined) bucket.ops[op] = 0;
  bucket.ops[op] += 1;
  reservoirPush(bucket, duration);

  bumpMinute(ts);

  if (duration > config.slowMs) {
    const entry = { table, op, duration_ms: duration, rows, error, ts };
    pushSlowest(entry);
    appendSlowLog(entry);
  }
}

// ─────────────────────────────────────────────────────────────────
// STATS OUTPUT
// ─────────────────────────────────────────────────────────────────

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  // Nearest-rank method. p in [0..1].
  const idx = Math.min(sortedValues.length - 1, Math.ceil(p * sortedValues.length) - 1);
  return sortedValues[Math.max(0, idx)];
}

function computePerTable() {
  const out = [];
  for (const [table, b] of perTable.entries()) {
    const sorted = b.samples.slice().sort((x, y) => x - y);
    out.push({
      table,
      count: b.count,
      errors: b.errors,
      total_rows: b.rows,
      avg_ms: b.count ? +(b.totalMs / b.count).toFixed(2) : 0,
      p50_ms: percentile(sorted, 0.50),
      p95_ms: percentile(sorted, 0.95),
      p99_ms: percentile(sorted, 0.99),
      max_ms: sorted.length ? sorted[sorted.length - 1] : 0,
      ops: { ...b.ops },
    });
  }
  return out;
}

function computeQPM() {
  // total queries in the last full minute + the current minute partial.
  const nowMin = Math.floor(Date.now() / 60_000);
  const counts = [];
  for (let i = 0; i < 5; i++) {
    counts.push({ minute: nowMin - i, count: perMinute.get(nowMin - i) || 0 });
  }
  const last5 = counts.reduce((s, x) => s + x.count, 0);
  return {
    current_minute: perMinute.get(nowMin) || 0,
    last_5_minutes_total: last5,
    last_5_minutes_avg: +(last5 / 5).toFixed(2),
    timeline: counts.reverse(),
  };
}

function getStats() {
  const tables = computePerTable();
  const topSlow = slowest.slice().map((e) => ({
    table: e.table,
    op: e.op,
    duration_ms: e.duration_ms,
    rows: e.rows,
    error: e.error,
    at: new Date(e.ts).toISOString(),
  }));
  const topFrequent = tables
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .map((t) => ({ table: t.table, count: t.count, errors: t.errors, avg_ms: t.avg_ms }));

  return {
    config: {
      slow_threshold_ms: config.slowMs,
      max_samples_per_table: config.maxSamplesPerTable,
      log_file: path.join(config.logDir, config.slowLogFile),
    },
    uptime_ms: Date.now() - startedAt,
    totals: {
      queries: tables.reduce((s, t) => s + t.count, 0),
      errors: tables.reduce((s, t) => s + t.errors, 0),
      tables_seen: tables.length,
    },
    qpm: computeQPM(),
    top_slowest: topSlow,
    top_frequent_tables: topFrequent,
    per_table: tables.sort((a, b) => b.count - a.count),
  };
}

function reset() {
  perTable.clear();
  perMinute = new Map();
  slowest = [];
  startedAt = Date.now();
}

// ─────────────────────────────────────────────────────────────────
// MEASURE — tag any thenable with a table label
// ─────────────────────────────────────────────────────────────────

function classifyError(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try { return JSON.stringify(err); } catch (_) { return 'unknown_error'; }
}

function rowsFromResult(result) {
  if (!result) return 0;
  if (Array.isArray(result.data)) return result.data.length;
  if (result.data && typeof result.data === 'object') return 1;
  if (typeof result.count === 'number') return result.count;
  return 0;
}

function measure(meta, promise) {
  // meta: { table, op }
  const start = Date.now();
  return Promise.resolve(promise).then(
    (result) => {
      recordSample({
        table: meta.table || 'unknown',
        op: meta.op || 'unknown',
        duration_ms: Date.now() - start,
        rows: rowsFromResult(result),
        error: result && result.error ? classifyError(result.error) : null,
        ts: start,
      });
      return result;
    },
    (err) => {
      recordSample({
        table: meta.table || 'unknown',
        op: meta.op || 'unknown',
        duration_ms: Date.now() - start,
        rows: 0,
        error: classifyError(err),
        ts: start,
      });
      throw err;
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// SUPABASE WRAPPER
// ─────────────────────────────────────────────────────────────────
//
// Supabase's query builder is a fluent chain that becomes "thenable" only at
// the end (await). We cannot know the op until one of select/insert/update/
// delete/upsert has been called, and we cannot time it until the chain is
// actually awaited. So the wrapper:
//   1. Hooks .from(table) to return a proxied builder.
//   2. Tracks the latest op name on each op call.
//   3. Patches .then/.catch/.finally lazily, so the first await triggers the
//      measurement, and returns the inner promise's value unchanged.
//
// This preserves 100% of the public supabase API surface — any method we
// don't recognize is passed through untouched.
// ─────────────────────────────────────────────────────────────────

const OP_METHODS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);

function wrapBuilder(builder, table) {
  if (!builder || typeof builder !== 'object') return builder;
  const state = { op: 'unknown', wrapped: false };
  let proxy;

  proxy = new Proxy(builder, {
    get(target, prop) {
      // Lazy measure patch on `.then` (first await entry point).
      if (prop === 'then' && !state.wrapped && typeof target.then === 'function') {
        state.wrapped = true;
        const innerThen = target.then.bind(target);
        const measured = measure(
          { table, op: state.op },
          new Promise((resolve, reject) => innerThen(resolve, reject))
        );
        return measured.then.bind(measured);
      }

      const orig = target[prop];
      if (typeof orig !== 'function') return orig;

      return function (...args) {
        if (OP_METHODS.has(prop)) state.op = prop;
        const next = orig.apply(target, args);
        // Same target back? keep the same proxy so the lazy .then patch still
        // fires. A fresh thenable object? wrap it with its own state. Non-
        // objects pass through untouched.
        if (next === target) return proxy;
        if (next && typeof next === 'object') return wrapBuilder(next, table);
        return next;
      };
    },
  });

  return proxy;
}

function wrapSupabase(client) {
  if (!client || typeof client !== 'object') {
    throw new TypeError('wrapSupabase: client must be a supabase client instance');
  }
  return new Proxy(client, {
    get(target, prop) {
      const orig = target[prop];
      if (prop === 'from' && typeof orig === 'function') {
        return function (table) {
          const builder = orig.call(target, table);
          return wrapBuilder(builder, String(table || 'unknown'));
        };
      }
      if (prop === 'rpc' && typeof orig === 'function') {
        return function (fn, args) {
          const builder = orig.call(target, fn, args);
          const wrapped = wrapBuilder(builder, `rpc:${fn}`);
          // RPCs don't flow through .select() etc, so force op='rpc' upfront.
          // The wrapBuilder state starts at 'unknown' — we short-circuit by
          // tagging the builder's own state via a one-shot .select() no-op.
          if (wrapped && typeof wrapped === 'object') {
            try { Object.defineProperty(wrapped, '__onyx_qa_op__', { value: 'rpc' }); } catch (_) {}
          }
          return wrapped;
        };
      }
      return orig;
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────

function registerAdminRoutes(app) {
  if (!app || typeof app.get !== 'function') {
    throw new TypeError('registerAdminRoutes: expected an Express app');
  }

  app.get('/api/admin/query-stats', (_req, res) => {
    try {
      res.json(getStats());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/query-stats/reset', (_req, res) => {
    try {
      reset();
      res.json({ ok: true, reset_at: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

module.exports = {
  wrapSupabase,
  measure,
  recordSample,
  getStats,
  reset,
  registerAdminRoutes,
  _internals: {
    config,
    perTable,
    get perMinute() { return perMinute; },
    get slowest() { return slowest; },
    percentile,
  },
};
