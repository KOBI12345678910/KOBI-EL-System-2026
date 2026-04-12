/**
 * Profiler — Unit Tests
 * Agent X88 (AG-X88) — written 2026-04-11
 *
 * Run with:  node --test test/profiler/profiler.test.js
 *
 * Covers:
 *   - CPU profile for a tight loop
 *   - Heap snapshot capture
 *   - mark() / measure()
 *   - flameGraph() → SVG validity
 *   - topFunctions() ranking by self-time
 *   - httpMiddleware() token enforcement (no token, wrong token, right token)
 *   - saveProfile() / loadProfile() round-trip
 *   - compareProfiles() diff report
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { Profiler, _internal } = require('../../src/profiler/profiler.js');

// ─── Utilities ─────────────────────────────────────────────────────────
function tightLoop(iterations) {
  // Intentionally CPU-bound. Do real work so V8 actually samples us.
  let x = 0;
  for (let i = 0; i < iterations; i += 1) {
    x += Math.sqrt(i) * Math.sin(i) + Math.cos(i / 7);
    if ((i & 1023) === 0) {
      x -= Math.log(i + 1);
    }
  }
  return x;
}

function busyFor(ms) {
  const end = Date.now() + ms;
  let n = 0;
  while (Date.now() < end) {
    n += tightLoop(5000);
  }
  return n;
}

const tmpDir = path.join(os.tmpdir(), 'onyx-profiler-test-' + Date.now());
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) { /* noop */ }

// ═══════════════════════════════════════════════════════════════════════
//                                 Tests
// ═══════════════════════════════════════════════════════════════════════

test('Profiler: constructs with defaults', () => {
  const p = new Profiler({ outDir: tmpDir });
  assert.equal(typeof p.startCPUProfile, 'function');
  assert.equal(typeof p.stopCPUProfile, 'function');
  assert.equal(typeof p.captureHeapSnapshot, 'function');
  assert.equal(typeof p.mark, 'function');
  assert.equal(typeof p.measure, 'function');
  assert.equal(typeof p.flameGraph, 'function');
  assert.equal(typeof p.topFunctions, 'function');
  assert.equal(typeof p.compareProfiles, 'function');
  assert.equal(typeof p.httpMiddleware, 'function');
  assert.equal(typeof p.saveProfile, 'function');
  assert.equal(typeof p.loadProfile, 'function');
});

test('Profiler: parseDuration helper', () => {
  const { parseDuration } = _internal;
  assert.equal(parseDuration('10s'), 10000);
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('2m'), 120000);
  assert.equal(parseDuration('250'), 250);
  assert.equal(parseDuration(undefined, 42), 42);
  assert.equal(parseDuration('bogus', 7), 7);
});

test('Profiler: safeEqual constant-time compare', () => {
  const { safeEqual } = _internal;
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false); // different length
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual(null, null), true);
});

test('Profiler: escapeXml handles special chars', () => {
  const { escapeXml } = _internal;
  assert.equal(escapeXml('<a href="x">&x\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;x&apos;&lt;/a&gt;');
});

test('Profiler: CPU profile for a tight loop', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('tight-loop');
  // Burn enough CPU so we get multiple samples.
  busyFor(200);
  const profile = await p.stopCPUProfile();

  assert.ok(profile, 'profile returned');
  assert.ok(Array.isArray(profile.nodes), 'has nodes[]');
  assert.ok(profile.nodes.length > 0, 'has at least one node');
  assert.ok(Array.isArray(profile.samples), 'has samples[]');
  assert.ok(Array.isArray(profile.timeDeltas), 'has timeDeltas[]');
  assert.equal(profile.samples.length, profile.timeDeltas.length,
    'samples and deltas match');
  assert.ok(profile._meta, 'has meta');
  assert.equal(profile._meta.name, 'tight-loop');
  assert.ok(profile._meta.wallMs >= 190, 'wall time ~= busy duration');
  assert.ok(profile._meta.node, 'node version recorded');
});

test('Profiler: cannot start two CPU profiles at once', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('first');
  await assert.rejects(() => p.startCPUProfile('second'),
    /already in progress/);
  await p.stopCPUProfile();
});

test('Profiler: stopCPUProfile without start throws', () => {
  const p = new Profiler({ outDir: tmpDir });
  assert.throws(() => p.stopCPUProfile(), /no CPU profile/);
});

test('Profiler: heap snapshot round-trip', async () => {
  const p = new Profiler({ outDir: tmpDir });
  const win = p.startHeapSnapshot();
  assert.ok(win.startedAt, 'window started');
  const snap = await p.captureHeapSnapshot();
  assert.equal(typeof snap, 'string', 'snapshot returned as string');
  assert.ok(snap.length > 1000, 'non-trivial size');
  // Should be valid JSON and contain the standard V8 header.
  const parsed = JSON.parse(snap);
  assert.ok(parsed.snapshot, 'has snapshot key');
  assert.ok(parsed.snapshot.meta, 'has meta');
  assert.ok(Array.isArray(parsed.nodes), 'has nodes array');
});

test('Profiler: mark & measure', () => {
  const p = new Profiler({ outDir: tmpDir });
  p.mark('a-start');
  // Do something measurable.
  tightLoop(50000);
  p.mark('a-end');
  const m = p.measure('a-span', 'a-start', 'a-end');
  assert.ok(m, 'measure entry returned');
  assert.equal(m.name, 'a-span');
  assert.ok(m.duration >= 0, 'duration >= 0');
  assert.ok(typeof m.startTime === 'number', 'startTime is number');

  const allMarks = p.getMarks();
  assert.ok('a-start' in allMarks && 'a-end' in allMarks);
});

test('Profiler: mark requires string', () => {
  const p = new Profiler({ outDir: tmpDir });
  assert.throws(() => p.mark(''), /mark name required/);
  assert.throws(() => p.mark(null), /mark name required/);
});

test('Profiler: topFunctions ranks by self-time, has file:line', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('top-fn');
  busyFor(200);
  const profile = await p.stopCPUProfile();

  const top = p.topFunctions(profile, 15);
  assert.ok(Array.isArray(top), 'returns array');
  assert.ok(top.length > 0, 'non-empty');
  assert.ok(top.length <= 15, 'respects limit');
  // Descending by selfMs
  for (let i = 1; i < top.length; i += 1) {
    assert.ok(top[i - 1].selfMs >= top[i].selfMs,
      'entry ' + i + ' descending: ' + top[i - 1].selfMs + ' >= ' + top[i].selfMs);
  }
  // Each row has the fields we advertise
  for (const row of top) {
    assert.equal(typeof row.rank, 'number');
    assert.equal(typeof row.functionName, 'string');
    assert.equal(typeof row.file, 'string');
    assert.equal(typeof row.line, 'number');
    assert.equal(typeof row.selfMs, 'number');
    assert.equal(typeof row.totalMs, 'number');
  }
});

test('Profiler: topFunctions honours n', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('n-test');
  busyFor(150);
  const profile = await p.stopCPUProfile();
  const three = p.topFunctions(profile, 3);
  assert.ok(three.length <= 3);
});

test('Profiler: flameGraph produces valid SVG', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('flame');
  busyFor(200);
  const profile = await p.stopCPUProfile();
  const svg = p.flameGraph(profile);

  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<?xml'), 'xml prolog');
  assert.ok(svg.includes('<svg '), 'svg root tag');
  assert.ok(svg.includes('</svg>'), 'closing svg');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'),
    'declares svg namespace');
  // Bilingual title must appear
  assert.ok(svg.includes('Flame Graph'), 'english title');
  assert.ok(svg.includes('להבות'), 'hebrew title');
  // At least one rect for a frame
  assert.ok(svg.includes('<rect'), 'has rects');
  // No control-char / unescaped angle leaks in the body attributes
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(svg),
    'no illegal control chars');
});

test('Profiler: flameGraph custom width', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('flame-w');
  busyFor(150);
  const profile = await p.stopCPUProfile();
  const svg = p.flameGraph(profile, { width: 600 });
  assert.ok(svg.includes('width="600"'));
});

test('Profiler: compareProfiles produces diff', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('A');
  busyFor(150);
  const a = await p.stopCPUProfile();

  await p.startCPUProfile('B');
  busyFor(250);
  const b = await p.stopCPUProfile();

  const diff = p.compareProfiles(a, b);
  assert.ok(diff);
  assert.ok(Array.isArray(diff.regressions));
  assert.ok(Array.isArray(diff.improvements));
  assert.equal(typeof diff.unchanged, 'number');
  assert.ok(diff.summary);
  assert.equal(diff.summary.aName, 'A');
  assert.equal(diff.summary.bName, 'B');
  assert.ok(diff.summary.bWallMs > diff.summary.aWallMs);
});

test('Profiler: saveProfile / loadProfile round-trip (.cpuprofile)', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('save');
  busyFor(120);
  const profile = await p.stopCPUProfile();

  const abs = p.saveProfile('save-test.cpuprofile', profile);
  assert.ok(fs.existsSync(abs), 'file exists');
  const loaded = p.loadProfile(abs);
  assert.ok(loaded && Array.isArray(loaded.nodes), 'loaded object ok');
  assert.equal(loaded._meta.name, 'save');
});

test('Profiler: saveProfile / loadProfile SVG round-trip', async () => {
  const p = new Profiler({ outDir: tmpDir });
  await p.startCPUProfile('svgsave');
  busyFor(120);
  const profile = await p.stopCPUProfile();
  const svg = p.flameGraph(profile);
  const abs = p.saveProfile('flame.svg', svg);
  assert.ok(fs.existsSync(abs));
  const loaded = p.loadProfile(abs);
  assert.equal(typeof loaded, 'string');
  assert.ok(loaded.includes('<svg '));
});

test('Profiler: startTracing / stopTracing does not throw', () => {
  const p = new Profiler({ outDir: tmpDir });
  const started = p.startTracing(['node.perf']);
  assert.ok(started);
  const stopped = p.stopTracing();
  assert.ok(stopped);
  assert.ok('ok' in stopped);
});

// ─── HTTP middleware / token check ─────────────────────────────────────
function makeFakeApp() {
  const routes = new Map();
  return {
    get(p, h) { routes.set(p, h); },
    _handle(p, req) {
      return new Promise((resolve) => {
        const h = routes.get(p);
        if (!h) return resolve({ status: 404 });
        const res = {
          statusCode: 200,
          headers: {},
          body: '',
          setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
          end(b) { this.body = b || ''; resolve({
            status: this.statusCode,
            headers: this.headers,
            body: this.body,
          }); },
        };
        try {
          const maybe = h(req, res);
          if (maybe && typeof maybe.then === 'function') {
            maybe.catch((err) => resolve({ status: 500, err }));
          }
        } catch (err) {
          resolve({ status: 500, err });
        }
      });
    },
  };
}

test('httpMiddleware: refuses when no token configured', async () => {
  const p = new Profiler({ outDir: tmpDir });
  p.token = null;
  const app = makeFakeApp();
  p.httpMiddleware(app);
  const res = await app._handle('/debug/profile',
    { query: { token: 'anything' } });
  assert.equal(res.status, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'profiler_disabled');
});

test('httpMiddleware: refuses when token missing', async () => {
  const p = new Profiler({ outDir: tmpDir, token: 'hunter2' });
  const app = makeFakeApp();
  p.httpMiddleware(app);
  const res = await app._handle('/debug/profile', { query: {} });
  assert.equal(res.status, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'bad_token');
});

test('httpMiddleware: refuses when token wrong', async () => {
  const p = new Profiler({ outDir: tmpDir, token: 'hunter2' });
  const app = makeFakeApp();
  p.httpMiddleware(app);
  const res = await app._handle('/debug/profile',
    { query: { token: 'guess' } });
  assert.equal(res.status, 401);
});

test('httpMiddleware: accepts valid token and returns cpuprofile (top format)', async () => {
  const p = new Profiler({ outDir: tmpDir, token: 'hunter2' });
  const app = makeFakeApp();
  p.httpMiddleware(app);
  const res = await app._handle('/debug/profile',
    { query: { token: 'hunter2', duration: '100ms', format: 'top', n: '5' } });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.ok(body.top && Array.isArray(body.top));
  assert.ok(body.top.length <= 5);
  assert.ok(body.title.includes('Top Functions'));
});

test('httpMiddleware: valid token returns SVG flamegraph', async () => {
  const p = new Profiler({ outDir: tmpDir, token: 'hunter2' });
  const app = makeFakeApp();
  p.httpMiddleware(app);
  const res = await app._handle('/debug/profile',
    { query: { token: 'hunter2', duration: '100ms', format: 'svg' } });
  assert.equal(res.status, 200);
  assert.ok(String(res.headers['content-type'] || '').includes('svg'));
  assert.ok(res.body.startsWith('<?xml'));
  assert.ok(res.body.includes('<svg '));
});
