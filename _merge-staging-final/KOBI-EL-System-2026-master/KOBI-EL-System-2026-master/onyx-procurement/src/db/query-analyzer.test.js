/**
 * ONYX DB — query-analyzer unit tests (node --test)
 *
 * Covers:
 *   - recordSample + getStats basic arithmetic
 *   - p50 / p95 / p99 percentile math on a known distribution
 *   - slow-query jsonl file is written above threshold
 *   - wrapSupabase proxy: op detection, rows, errors
 *   - reset() clears state
 *   - registerAdminRoutes mounts the two endpoints
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the log dir BEFORE requiring the module so config picks it up.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-qa-'));
process.env.ONYX_QA_LOG_DIR = TMP;
process.env.ONYX_SLOW_QUERY_MS = '500';

const qa = require('./query-analyzer');

// ─── MOCK SUPABASE CLIENT ─────────────────────────────────────────
//
// Minimal fluent builder that matches the subset wrapSupabase exercises:
// .from(table).select()/.insert()/.update()/.delete()/.upsert()/.eq()/.limit()
// Awaiting the chain resolves to { data, error } after an adjustable delay.
// ─────────────────────────────────────────────────────────────────
function makeMockSupabase(scripts = {}) {
  // scripts: Map<tableName, { rows, delayMs, error }>
  function builder(table) {
    const state = {
      table,
      op: 'select',
      delay: (scripts[table] && scripts[table].delayMs) || 0,
      rows: (scripts[table] && scripts[table].rows) || [],
      error: (scripts[table] && scripts[table].error) || null,
    };
    const chain = {
      select() { state.op = 'select'; return chain; },
      insert(row) { state.op = 'insert'; state.rows = Array.isArray(row) ? row : [row]; return chain; },
      update() { state.op = 'update'; return chain; },
      delete() { state.op = 'delete'; return chain; },
      upsert() { state.op = 'upsert'; return chain; },
      eq() { return chain; },
      limit() { return chain; },
      order() { return chain; },
      single() { state.rows = state.rows.slice(0, 1); return chain; },
      then(resolve, reject) {
        const result = { data: state.error ? null : state.rows, error: state.error, count: state.rows.length };
        if (state.delay > 0) {
          return new Promise((r) => setTimeout(r, state.delay)).then(() => resolve(result), reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    from: (table) => builder(table),
    rpc: (fn, _args) => builder(`rpc:${fn}`),
  };
}

// ─── helpers ──────────────────────────────────────────────────────

function resetFixture() {
  qa.reset();
  const f = path.join(TMP, 'slow-queries.jsonl');
  try { fs.unlinkSync(f); } catch (_) {}
  // Override the log path on the running module (required because the module
  // computed its logDir at require time before we exported the env override).
  qa._internals.config.logDir = TMP;
  qa._internals.config.slowMs = 500;
}

function readSlowLog() {
  const f = path.join(TMP, 'slow-queries.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ─── tests ────────────────────────────────────────────────────────

test('recordSample increments table counters and totals', () => {
  resetFixture();
  qa.recordSample({ table: 'suppliers', op: 'select', duration_ms: 10, rows: 3 });
  qa.recordSample({ table: 'suppliers', op: 'select', duration_ms: 20, rows: 5 });
  qa.recordSample({ table: 'suppliers', op: 'insert', duration_ms: 40, rows: 1 });
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'suppliers');
  assert.ok(row, 'suppliers bucket exists');
  assert.equal(row.count, 3);
  assert.equal(row.total_rows, 9);
  assert.equal(row.ops.select, 2);
  assert.equal(row.ops.insert, 1);
  assert.equal(row.errors, 0);
});

test('p50 / p95 / p99 computed from reservoir', () => {
  resetFixture();
  // uniform 1..100 — nearest-rank percentiles
  for (let i = 1; i <= 100; i++) {
    qa.recordSample({ table: 'orders', op: 'select', duration_ms: i, rows: 1 });
  }
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'orders');
  assert.equal(row.count, 100);
  assert.equal(row.p50_ms, 50);
  assert.equal(row.p95_ms, 95);
  assert.equal(row.p99_ms, 99);
  assert.equal(row.max_ms, 100);
});

test('slow queries (>500ms) are appended to slow-queries.jsonl', () => {
  resetFixture();
  qa.recordSample({ table: 'rfqs', op: 'select', duration_ms: 120, rows: 2 });   // fast
  qa.recordSample({ table: 'rfqs', op: 'select', duration_ms: 780, rows: 1 });   // slow
  qa.recordSample({ table: 'rfqs', op: 'update', duration_ms: 1500, rows: 1 });  // slow
  const entries = readSlowLog();
  assert.equal(entries.length, 2);
  assert.ok(entries.every((e) => e.duration_ms > 500));
  assert.ok(entries.some((e) => e.duration_ms === 1500));
});

test('top_slowest is capped at 10 and sorted descending', () => {
  resetFixture();
  for (let i = 0; i < 15; i++) {
    qa.recordSample({ table: `t${i}`, op: 'select', duration_ms: 600 + i * 10, rows: 1 });
  }
  const s = qa.getStats();
  assert.equal(s.top_slowest.length, 10);
  for (let i = 0; i < s.top_slowest.length - 1; i++) {
    assert.ok(s.top_slowest[i].duration_ms >= s.top_slowest[i + 1].duration_ms);
  }
});

test('top_frequent_tables is sorted by count desc, length <= 10', () => {
  resetFixture();
  for (let i = 0; i < 12; i++) {
    const table = `tbl${i}`;
    for (let j = 0; j < i + 1; j++) {
      qa.recordSample({ table, op: 'select', duration_ms: 5, rows: 1 });
    }
  }
  const s = qa.getStats();
  assert.ok(s.top_frequent_tables.length <= 10);
  for (let i = 0; i < s.top_frequent_tables.length - 1; i++) {
    assert.ok(s.top_frequent_tables[i].count >= s.top_frequent_tables[i + 1].count);
  }
});

test('errors are captured when sample.error is set', () => {
  resetFixture();
  qa.recordSample({ table: 'x', op: 'select', duration_ms: 1, rows: 0, error: 'boom' });
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'x');
  assert.equal(row.errors, 1);
  assert.equal(s.totals.errors, 1);
});

test('reset() clears tables, slowest, per-minute, uptime', () => {
  resetFixture();
  qa.recordSample({ table: 'a', op: 'select', duration_ms: 800, rows: 1 });
  qa.reset();
  const s = qa.getStats();
  assert.equal(s.totals.queries, 0);
  assert.equal(s.top_slowest.length, 0);
  assert.equal(s.per_table.length, 0);
});

test('wrapSupabase records a select query with row count', async () => {
  resetFixture();
  const mock = makeMockSupabase({
    suppliers: { rows: [{ id: 1 }, { id: 2 }, { id: 3 }], delayMs: 0 },
  });
  const wrapped = qa.wrapSupabase(mock);
  const result = await wrapped.from('suppliers').select('*').eq('active', true);
  assert.equal(result.data.length, 3);
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'suppliers');
  assert.equal(row.count, 1);
  assert.equal(row.total_rows, 3);
  assert.equal(row.ops.select, 1);
});

test('wrapSupabase records an insert query and op=insert', async () => {
  resetFixture();
  const mock = makeMockSupabase();
  const wrapped = qa.wrapSupabase(mock);
  await wrapped.from('purchase_orders').insert({ amount: 100 });
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'purchase_orders');
  assert.equal(row.count, 1);
  assert.equal(row.ops.insert, 1);
});

test('wrapSupabase records errors from supabase result.error', async () => {
  resetFixture();
  const mock = makeMockSupabase({
    broken: { rows: [], error: { message: 'simulated failure' } },
  });
  const wrapped = qa.wrapSupabase(mock);
  const result = await wrapped.from('broken').select('*');
  assert.ok(result.error);
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'broken');
  assert.equal(row.errors, 1);
});

test('wrapSupabase measures delay (slow query path)', async () => {
  resetFixture();
  const mock = makeMockSupabase({
    sluggish: { rows: [{ id: 1 }], delayMs: 550 },
  });
  const wrapped = qa.wrapSupabase(mock);
  await wrapped.from('sluggish').select('*');
  const s = qa.getStats();
  const row = s.per_table.find((r) => r.table === 'sluggish');
  assert.ok(row.avg_ms >= 500, `avg_ms=${row.avg_ms}`);
  const slowLog = readSlowLog();
  assert.ok(slowLog.some((e) => e.table === 'sluggish'));
});

test('registerAdminRoutes mounts GET and POST endpoints', () => {
  resetFixture();
  const mounts = [];
  const fakeApp = {
    get(p, h) { mounts.push(['GET', p, typeof h]); },
    post(p, h) { mounts.push(['POST', p, typeof h]); },
  };
  qa.registerAdminRoutes(fakeApp);
  assert.ok(mounts.some((m) => m[0] === 'GET' && m[1] === '/api/admin/query-stats'));
  assert.ok(mounts.some((m) => m[0] === 'POST' && m[1] === '/api/admin/query-stats/reset'));
});

test('GET handler returns JSON stats, POST handler resets', () => {
  resetFixture();
  qa.recordSample({ table: 'y', op: 'select', duration_ms: 10, rows: 1 });

  let captured = null;
  const fakeRes = {
    json(body) { captured = body; return fakeRes; },
    status(_c) { return fakeRes; },
  };
  let getHandler, postHandler;
  qa.registerAdminRoutes({
    get(_p, h) { getHandler = h; },
    post(_p, h) { postHandler = h; },
  });

  getHandler({}, fakeRes);
  assert.ok(captured && captured.totals && captured.totals.queries === 1);

  captured = null;
  postHandler({}, fakeRes);
  assert.ok(captured && captured.ok === true);
  const after = qa.getStats();
  assert.equal(after.totals.queries, 0);
});

test('qpm.timeline has 5 minute buckets, newest last', () => {
  resetFixture();
  qa.recordSample({ table: 'z', op: 'select', duration_ms: 5, rows: 1 });
  qa.recordSample({ table: 'z', op: 'select', duration_ms: 5, rows: 1 });
  const s = qa.getStats();
  assert.equal(s.qpm.timeline.length, 5);
  assert.ok(s.qpm.current_minute >= 2);
});
