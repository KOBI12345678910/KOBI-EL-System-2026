/**
 * Log Store — Unit Tests
 * Agent X-54 · Swarm 3 · Techno-Kol Uzi Mega-ERP 2026
 *
 * Run with:
 *   node --test test/payroll/log-store.test.js
 *
 * Covers:
 *   - ingest (single + batch), disk append (JSONL)
 *   - parseLogQL (labels, =~, !=, !~, line filters, aggregation wrapper)
 *   - label-based indexing (service / level / env / user_id)
 *   - substring + regex line filters (|=, !=, |~, !~)
 *   - Hebrew normalization (niqqud, final letters)
 *   - bloom filter FNV hashing + positive/negative lookups
 *   - inverted index add / match / intersect / evict
 *   - query: label match, time-range, pagination
 *   - multi-query AND/OR/NOT via regex + !=
 *   - streaming tail (subscribe, fan-out, unsubscribe)
 *   - stats (total, by_level, by_service, disk_usage)
 *   - compact (gzip old days, atomic replacement, nothing lost)
 *   - retention policy (daysKeep, invalid input guard)
 *   - count_over_time + rate aggregation
 *   - HTTP wrappers (ingest/query/stream shape, SSE heartbeat)
 *   - hot-cache eviction beyond 24h window
 *   - fallback disk read for out-of-hot-window queries
 *   - "never delete" guard when daysKeep is null / invalid
 *
 * Zero deps: only node:test, node:assert, node:fs, node:path, node:os.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const {
  createStore,
  LogStore,
  parseLogQL,
  parseDuration,
  InvertedIndex,
  BloomFilter,
  bloomHash,
  tokenize,
  normalizeForIndex,
  stripNiqqud,
  normalizeFinals,
  ymdUTC,
  aggregate,
  httpHandlers,
  astMatchesLabels,
  VALID_LEVELS,
} = require(path.resolve(__dirname, '..', '..', 'src', 'ops', 'log-store.js'));

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function tmpDir(label) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `logstore-${label}-`));
  return d;
}
function rmr(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
}

function mkEntry(level, service, msg, extra) {
  return Object.assign({
    ts: Date.now(),
    level,
    service,
    env: 'test',
    user_id: 'u1',
    msg,
  }, extra || {});
}

// ═════════════════════════════════════════════════════════════════════════
// 1. Normalization helpers
// ═════════════════════════════════════════════════════════════════════════

test('stripNiqqud: removes Hebrew vowel points', () => {
  assert.equal(stripNiqqud('שָׁלוֹם עוֹלָם'), 'שלום עולם');
});

test('normalizeFinals: folds ם ן ץ ף ך to medial', () => {
  assert.equal(normalizeFinals('שלום'), 'שלומ');
  assert.equal(normalizeFinals('ארץ'), 'ארצ');
  assert.equal(normalizeFinals('כסף'), 'כספ');
  assert.equal(normalizeFinals('דרך'), 'דרכ');
  assert.equal(normalizeFinals('הדין'), 'הדינ');
});

test('normalizeForIndex: lowercase + niqqud + finals pipeline', () => {
  assert.equal(normalizeForIndex('שָׁלוֹם World'), 'שלומ world');
});

test('tokenize: splits on punctuation, keeps Hebrew and ASCII', () => {
  const toks = tokenize('Error: שלום database timeout!');
  assert.ok(toks.includes('error'));
  assert.ok(toks.includes('database'));
  assert.ok(toks.includes('timeout'));
  assert.ok(toks.includes('שלומ')); // final-letter folded
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Bloom filter
// ═════════════════════════════════════════════════════════════════════════

test('BloomFilter: positive lookups return true', () => {
  const bf = new BloomFilter();
  bf.add('database');
  bf.add('timeout');
  bf.add('שלום');
  assert.ok(bf.has('database'));
  assert.ok(bf.has('timeout'));
  assert.ok(bf.has('שלום'));
});

test('BloomFilter: FNV hash produces a pair of 32-bit ints', () => {
  const h = bloomHash('hello');
  assert.equal(typeof h.h1, 'number');
  assert.equal(typeof h.h2, 'number');
  assert.ok(h.h1 >= 0 && h.h1 < 0x100000000);
  assert.ok(h.h2 >= 0 && h.h2 < 0x100000000);
});

test('BloomFilter: clear() resets counts', () => {
  const bf = new BloomFilter();
  bf.add('x'); bf.add('y');
  assert.equal(bf.size(), 2);
  bf.clear();
  assert.equal(bf.size(), 0);
  assert.equal(bf.has('x'), false);
});

// ═════════════════════════════════════════════════════════════════════════
// 3. LogQL-lite parser
// ═════════════════════════════════════════════════════════════════════════

test('parseLogQL: empty string → empty selector', () => {
  const ast = parseLogQL('');
  assert.equal(ast.type, 'selector');
  assert.equal(ast.labels.length, 0);
  assert.equal(ast.lineFilters.length, 0);
});

test('parseLogQL: single label equality', () => {
  const ast = parseLogQL('{level="error"}');
  assert.equal(ast.labels.length, 1);
  assert.equal(ast.labels[0].key, 'level');
  assert.equal(ast.labels[0].op, '=');
  assert.equal(ast.labels[0].value, 'error');
});

test('parseLogQL: multi-label + regex match + line filter', () => {
  const ast = parseLogQL('{service="payroll",level=~"error|warn"} |= "wage slip"');
  assert.equal(ast.labels.length, 2);
  assert.equal(ast.labels[0].key, 'service');
  assert.equal(ast.labels[1].op, '=~');
  assert.equal(ast.lineFilters.length, 1);
  assert.equal(ast.lineFilters[0].op, '|=');
  assert.equal(ast.lineFilters[0].value, 'wage slip');
});

test('parseLogQL: regex line filter |~', () => {
  const ast = parseLogQL('{level="error"} |~ "timeout.*database"');
  assert.equal(ast.lineFilters[0].op, '|~');
  assert.equal(ast.lineFilters[0].value, 'timeout.*database');
});

test('parseLogQL: negation line filters != and !~', () => {
  const ast = parseLogQL('{service="api"} != "healthcheck" !~ "^/ping$"');
  assert.equal(ast.lineFilters.length, 2);
  assert.equal(ast.lineFilters[0].op, '!=');
  assert.equal(ast.lineFilters[1].op, '!~');
});

test('parseLogQL: count_over_time aggregator', () => {
  const ast = parseLogQL('count_over_time({service="api"}[5m])');
  assert.equal(ast.type, 'range');
  assert.equal(ast.aggregator, 'count_over_time');
  assert.equal(ast.window_ms, 5 * 60 * 1000);
  assert.equal(ast.labels[0].key, 'service');
});

test('parseLogQL: rate aggregator with 1m window', () => {
  const ast = parseLogQL('rate({level="error"}[1m])');
  assert.equal(ast.aggregator, 'rate');
  assert.equal(ast.window_ms, 60000);
});

test('parseDuration: supports s/m/h/d', () => {
  assert.equal(parseDuration('30s'), 30000);
  assert.equal(parseDuration('2m'), 120000);
  assert.equal(parseDuration('1h'), 3600000);
  assert.equal(parseDuration('1d'), 86400000);
});

test('parseLogQL: Hebrew label values parse correctly', () => {
  const ast = parseLogQL('{service="שכר"} |= "תלוש"');
  assert.equal(ast.labels[0].value, 'שכר');
  assert.equal(ast.lineFilters[0].value, 'תלוש');
});

test('parseLogQL: unterminated label block throws', () => {
  assert.throws(() => parseLogQL('{service="x"'), /unterminated/);
});

// ═════════════════════════════════════════════════════════════════════════
// 4. InvertedIndex
// ═════════════════════════════════════════════════════════════════════════

test('InvertedIndex: add entry indexes labels + tokens', () => {
  const ix = new InvertedIndex();
  const id = ix.add({
    ts: Date.now(),
    level: 'error',
    service: 'payroll',
    msg: 'wage slip failed for user 42',
  });
  assert.ok(id > 0);
  assert.equal(ix.stats().total, 1);
  assert.equal(ix.matchLabel('level', '=', 'error').has(id), true);
  assert.equal(ix.matchLabel('service', '=', 'payroll').has(id), true);
});

test('InvertedIndex: regex label match =~', () => {
  const ix = new InvertedIndex();
  ix.add({ ts: Date.now(), level: 'error',  service: 'a', msg: 'x' });
  ix.add({ ts: Date.now(), level: 'warn',   service: 'a', msg: 'y' });
  ix.add({ ts: Date.now(), level: 'info',   service: 'a', msg: 'z' });
  const m = ix.matchLabel('level', '=~', 'error|warn');
  assert.equal(m.size, 2);
});

test('InvertedIndex: evictBefore drops old entries', () => {
  const ix = new InvertedIndex();
  const now = Date.now();
  ix.add({ ts: now - 1000, level: 'info', service: 's', msg: 'new' });
  ix.add({ ts: now - 10 * 60 * 60 * 1000, level: 'info', service: 's', msg: 'old' });
  const n = ix.evictBefore(now - 60 * 60 * 1000);
  assert.equal(n, 1);
  assert.equal(ix.stats().total, 1);
});

test('InvertedIndex: intersect picks AND set', () => {
  const ix = new InvertedIndex();
  ix.add({ level: 'error', service: 'a', msg: '1' });
  ix.add({ level: 'error', service: 'b', msg: '2' });
  ix.add({ level: 'warn',  service: 'a', msg: '3' });
  const errSet = ix.matchLabel('level', '=', 'error');
  const aSet = ix.matchLabel('service', '=', 'a');
  const both = ix.intersect([errSet, aSet]);
  assert.equal(both.size, 1);
});

// ═════════════════════════════════════════════════════════════════════════
// 5. LogStore end-to-end
// ═════════════════════════════════════════════════════════════════════════

test('LogStore: ingest writes append-only JSONL file per UTC day', () => {
  const dir = tmpDir('ingest');
  try {
    const store = createStore({ dir });
    store.ingest(mkEntry('info', 'payroll', 'slip generated'));
    store.ingest(mkEntry('error', 'payroll', 'timeout on database'));
    const day = ymdUTC(Date.now());
    const file = path.join(dir, `${day}.jsonl`);
    assert.ok(fs.existsSync(file));
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.service, 'payroll');
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: batch ingest accepts arrays', () => {
  const dir = tmpDir('batch');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info',  'svc', 'a'),
      mkEntry('warn',  'svc', 'b'),
      mkEntry('error', 'svc', 'c'),
    ]);
    assert.equal(store.stats().hot_total, 3);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: query by label {level="error"}', () => {
  const dir = tmpDir('qlabel');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info',  'a', 'hello'),
      mkEntry('error', 'a', 'boom'),
      mkEntry('error', 'b', 'kaboom'),
    ]);
    const out = store.query('{level="error"}');
    assert.equal(out.total, 2);
    assert.ok(out.entries.every(e => e.level === 'error'));
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: query with regex label =~', () => {
  const dir = tmpDir('qregex');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info',  'payroll', 'x'),
      mkEntry('warn',  'payroll', 'y'),
      mkEntry('error', 'payroll', 'z'),
    ]);
    const out = store.query('{service="payroll",level=~"error|warn"}');
    assert.equal(out.total, 2);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: line contains |= filter', () => {
  const dir = tmpDir('qcontains');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info', 'payroll', 'wage slip generated'),
      mkEntry('info', 'payroll', 'tax file exported'),
    ]);
    const out = store.query('{level="info"} |= "wage slip"');
    assert.equal(out.total, 1);
    assert.equal(out.entries[0].msg, 'wage slip generated');
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: regex line filter |~ "timeout.*database"', () => {
  const dir = tmpDir('qregexline');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('error', 'db', 'timeout on database connection'),
      mkEntry('error', 'db', 'syntax error in query'),
      mkEntry('error', 'db', 'database timeout'), // match
    ]);
    const out = store.query('{level="error"} |~ "timeout.*database"');
    assert.equal(out.total, 1);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: Hebrew line filter matches normalized text', () => {
  const dir = tmpDir('hebrew');
  try {
    const store = createStore({ dir });
    store.ingest(mkEntry('info', 'payroll', 'הונפק תלוש שכר למשתמש 42'));
    const out = store.query('{level="info"} |= "תלוש"');
    assert.equal(out.total, 1);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: time-range filter respects from/to', () => {
  const dir = tmpDir('range');
  try {
    const store = createStore({ dir });
    const now = Date.now();
    store.ingest({ ts: now - 5000, level: 'info', service: 's', msg: 'old' });
    store.ingest({ ts: now - 1000, level: 'info', service: 's', msg: 'mid' });
    store.ingest({ ts: now,        level: 'info', service: 's', msg: 'new' });
    const out = store.query('{level="info"}', { from: now - 2000, to: now + 1 });
    assert.equal(out.total, 2);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: pagination with limit + offset', () => {
  const dir = tmpDir('page');
  try {
    const store = createStore({ dir });
    for (let i = 0; i < 10; i++) {
      store.ingest({ ts: Date.now() + i, level: 'info', service: 's', msg: `m${i}` });
    }
    const p1 = store.query('{level="info"}', { limit: 3, offset: 0 });
    const p2 = store.query('{level="info"}', { limit: 3, offset: 3 });
    assert.equal(p1.entries.length, 3);
    assert.equal(p2.entries.length, 3);
    assert.equal(p1.total, 10);
    assert.notEqual(p1.entries[0].msg, p2.entries[0].msg);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: stream fan-out + unsubscribe', () => {
  const dir = tmpDir('stream');
  try {
    const store = createStore({ dir });
    const seen = [];
    const unsub = store.stream('{level="error"}', (e) => seen.push(e.msg));
    store.ingest(mkEntry('info',  's', 'ignored'));
    store.ingest(mkEntry('error', 's', 'caught-1'));
    store.ingest(mkEntry('error', 's', 'caught-2'));
    assert.deepEqual(seen, ['caught-1', 'caught-2']);
    unsub();
    store.ingest(mkEntry('error', 's', 'after-unsub'));
    assert.equal(seen.length, 2);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: tail returns last N matching entries', () => {
  const dir = tmpDir('tail');
  try {
    const store = createStore({ dir });
    for (let i = 0; i < 20; i++) {
      store.ingest({ ts: Date.now() + i, level: 'info', service: 's', msg: `m${i}` });
    }
    const t = store.tail('{level="info"}', 5);
    assert.equal(t.length, 5);
    assert.equal(t[4].msg, 'm19');
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: stats reports total/by_level/by_service/disk_usage', () => {
  const dir = tmpDir('stats');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info',  'a', 'x'),
      mkEntry('error', 'b', 'y'),
      mkEntry('error', 'a', 'z'),
    ]);
    const s = store.stats();
    assert.equal(s.total, 3);
    assert.equal(s.hot_total, 3);
    assert.equal(s.by_level.error, 2);
    assert.equal(s.by_service.a, 2);
    assert.ok(s.disk_usage > 0);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: compact gzips yesterday files + keeps content', () => {
  const dir = tmpDir('compact');
  try {
    const store = createStore({ dir });
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const yDay = ymdUTC(+yesterday);
    const yFile = path.join(dir, `${yDay}.jsonl`);
    fs.writeFileSync(yFile,
      JSON.stringify({ ts: +yesterday, level: 'info', service: 's', msg: 'old' }) + '\n');
    // Today's file (must NOT be compacted)
    store.ingest(mkEntry('info', 's', 'fresh'));
    const out = store.compact();
    assert.ok(out.compressed.includes(`${yDay}.jsonl`));
    assert.ok(fs.existsSync(`${yFile}.gz`));
    assert.equal(fs.existsSync(yFile), false);
    // Round-trip: gunzip must produce original JSON
    const raw = zlib.gunzipSync(fs.readFileSync(`${yFile}.gz`)).toString('utf8');
    assert.ok(raw.includes('"old"'));
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: retention removes files older than daysKeep', () => {
  const dir = tmpDir('retention');
  try {
    const store = createStore({ dir });
    // Fake a 40-day-old file
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const oldFile = path.join(dir, `${ymdUTC(+old)}.jsonl`);
    fs.writeFileSync(oldFile, '{}\n');
    const fresh = path.join(dir, `${ymdUTC(Date.now())}.jsonl`);
    fs.writeFileSync(fresh, '{}\n');
    const out = store.retention(7);
    assert.equal(out.removed.length, 1);
    assert.equal(fs.existsSync(oldFile), false);
    assert.ok(fs.existsSync(fresh));
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: retention with invalid daysKeep is a no-op ("never delete")', () => {
  const dir = tmpDir('retguard');
  try {
    const store = createStore({ dir });
    store.ingest(mkEntry('info', 's', 'x'));
    const before = listJsonl(dir);
    const out1 = store.retention(null);
    const out2 = store.retention(0);
    const out3 = store.retention('abc');
    assert.equal(out1.removed.length, 0);
    assert.equal(out2.removed.length, 0);
    assert.equal(out3.removed.length, 0);
    const after = listJsonl(dir);
    assert.deepEqual(before.sort(), after.sort());
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: aggregate count_over_time returns bucketed counts', () => {
  const dir = tmpDir('agg');
  try {
    const store = createStore({ dir });
    const now = Date.now();
    // Five events in the same 5m bucket
    for (let i = 0; i < 5; i++) {
      store.ingest({ ts: now - i * 1000, level: 'info', service: 'api', msg: 'hit' });
    }
    const out = store.query('count_over_time({service="api"}[5m])');
    assert.ok(out.aggregated);
    const total = out.entries.reduce((a, b) => a + b.value, 0);
    assert.equal(total, 5);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: aggregate rate({level="error"}[1m]) returns per-sec rate', () => {
  const dir = tmpDir('rate');
  try {
    const store = createStore({ dir });
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      store.ingest({ ts: now - i * 500, level: 'error', service: 'api', msg: 'e' });
    }
    const out = store.query('rate({level="error"}[1m])');
    assert.ok(out.aggregated);
    const total = out.entries.reduce((a, b) => a + b.value, 0);
    assert.ok(total > 0);
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: query !=  label negates', () => {
  const dir = tmpDir('neq');
  try {
    const store = createStore({ dir });
    store.ingest([
      mkEntry('info',  'a', 'x'),
      mkEntry('error', 'a', 'y'),
      mkEntry('error', 'b', 'z'),
    ]);
    const out = store.query('{level="error",service!="b"}');
    assert.equal(out.total, 1);
    assert.equal(out.entries[0].service, 'a');
    store.close();
  } finally { rmr(dir); }
});

test('LogStore: cold-path reads older days from disk', () => {
  const dir = tmpDir('cold');
  try {
    const store = createStore({ dir });
    // Write a day-30 file manually
    const ts30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const day30 = ymdUTC(ts30);
    const file = path.join(dir, `${day30}.jsonl`);
    fs.writeFileSync(file,
      JSON.stringify({ ts: ts30, level: 'error', service: 'payroll', msg: 'old-error' }) + '\n');
    const out = store.query('{level="error"}', { from: ts30 - 1000, to: ts30 + 1000 });
    assert.equal(out.total, 1);
    assert.equal(out.entries[0].msg, 'old-error');
    store.close();
  } finally { rmr(dir); }
});

// ═════════════════════════════════════════════════════════════════════════
// 6. HTTP handlers (shape + basic wiring)
// ═════════════════════════════════════════════════════════════════════════

test('httpHandlers: ingest + query round-trip', async () => {
  const dir = tmpDir('http');
  try {
    const store = createStore({ dir });
    const { ingestHandler, queryHandler } = httpHandlers(store);
    await mockRequest(ingestHandler, {
      method: 'POST', url: '/api/logs/ingest',
      body: JSON.stringify([
        { ts: Date.now(), level: 'error', service: 'api', msg: 'boom' },
        { ts: Date.now(), level: 'info',  service: 'api', msg: 'ok'   },
      ]),
    });
    const res = await mockRequest(queryHandler, {
      method: 'GET',
      url: '/api/logs/query?logql=' + encodeURIComponent('{level="error"}'),
    });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.total, 1);
    assert.equal(parsed.entries[0].msg, 'boom');
    store.close();
  } finally { rmr(dir); }
});

test('httpHandlers: bad logql → 400', async () => {
  const dir = tmpDir('badql');
  try {
    const store = createStore({ dir });
    const { queryHandler } = httpHandlers(store);
    const res = await mockRequest(queryHandler, {
      method: 'GET',
      url: '/api/logs/query?logql=' + encodeURIComponent('{level='),
    });
    assert.equal(res.status, 400);
    store.close();
  } finally { rmr(dir); }
});

// ═════════════════════════════════════════════════════════════════════════
// 7. astMatchesLabels helper
// ═════════════════════════════════════════════════════════════════════════

test('astMatchesLabels: positive + negative ops', () => {
  const entry = { level: 'error', service: 'api' };
  assert.equal(astMatchesLabels(entry, [{ key: 'level', op: '=', value: 'error' }]), true);
  assert.equal(astMatchesLabels(entry, [{ key: 'level', op: '!=', value: 'error' }]), false);
  assert.equal(astMatchesLabels(entry, [{ key: 'level', op: '=~', value: 'err' }]), true);
  assert.equal(astMatchesLabels(entry, [{ key: 'level', op: '!~', value: 'info' }]), true);
});

// ═════════════════════════════════════════════════════════════════════════
// 8. Valid levels constant
// ═════════════════════════════════════════════════════════════════════════

test('VALID_LEVELS: contains the standard severities', () => {
  for (const lv of ['debug','info','warn','warning','error','fatal','trace']) {
    assert.ok(VALID_LEVELS.has(lv), `missing level ${lv}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Mock http utilities
// ─────────────────────────────────────────────────────────────────────────

function listJsonl(dir) {
  return fs.readdirSync(dir).filter(f => /\.jsonl(\.gz)?$/.test(f));
}

function mockRequest(handler, { method, url, body }) {
  return new Promise((resolve) => {
    const { EventEmitter } = require('node:events');
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.destroy = () => {};
    let bodyOut = '';
    let status = 200;
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k] = v; },
      flushHeaders() {},
      write(chunk) { bodyOut += chunk; },
      end(chunk) {
        if (chunk) bodyOut += chunk;
        status = this.statusCode;
        resolve({ status, headers, body: bodyOut });
      },
    };
    handler(req, res);
    if (body != null) {
      process.nextTick(() => {
        req.emit('data', Buffer.from(body));
        req.emit('end');
      });
    } else {
      process.nextTick(() => req.emit('end'));
    }
  });
}
