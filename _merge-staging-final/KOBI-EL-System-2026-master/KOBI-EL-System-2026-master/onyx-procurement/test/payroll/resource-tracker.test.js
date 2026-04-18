/**
 * Resource Usage Tracker — Unit Tests / בדיקות יחידה
 * Agent X-64 — Swarm 3D — 2026-04-11
 *
 * Run with:   node --test test/payroll/resource-tracker.test.js
 *
 * Covers:
 *   1.  createTracker default options
 *   2.  RingBuffer fills + wraps + toArray chronological
 *   3.  sampleOnce populates every metric group
 *   4.  current()/history() accessors
 *   5.  stats() summarization (min/max/avg/p95/p99)
 *   6.  linearRegression math
 *   7.  trend() returns 'rising' / 'falling' / 'flat'
 *   8.  predict() extrapolates from slope
 *   9.  detectLeak() fires on monotonic heap growth
 *  10.  detectLeak() does NOT fire on flat series
 *  11.  setThreshold() fires alert when breached (sustain=1)
 *  12.  setThreshold() sustain=N requires N consecutive breaches
 *  13.  Threshold with onExceed callback invoked
 *  14.  Alert manager integration (opts.alertManager.fire called)
 *  15.  Logger integration (opts.logger.warn called)
 *  16.  removeThreshold removes it
 *  17.  topK returns sorted children by resource
 *  18.  exportPrometheus returns text block with headers
 *  19.  exportJSON returns serializable snapshot
 *  20.  Defaults install 6 default thresholds
 *  21.  Invalid constructor options throw bilingual errors
 *  22.  getMetricByPath resolves aliases
 *  23.  start()/stop() idempotent
 *  24.  Severity escalates from warning -> high -> critical
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'ops', 'resource-tracker.js'
));

const {
  createTracker,
  ResourceTracker,
  RingBuffer,
  linearRegression,
  summarize,
  getMetricByPath,
  DEFAULT_THRESHOLDS,
} = mod;

// ─── helpers ───────────────────────────────────────────────────

function makeSample(overrides) {
  const base = {
    ts: Date.now(),
    seq: 0,
    cpu: {
      coreCount: 4,
      utilizationPct: 10,
      loadAvg: { '1m': 0.3, '5m': 0.2, '15m': 0.1 },
      totalBusy: 0, totalAll: 0, userMs: 0, sysMs: 0, idleMs: 0, niceMs: 0, irqMs: 0,
      perCore: [],
    },
    memory: {
      totalBytes: 8 * 1024 * 1024 * 1024,
      usedBytes: 4 * 1024 * 1024 * 1024,
      freeBytes: 4 * 1024 * 1024 * 1024,
      availableBytes: 4 * 1024 * 1024 * 1024,
      usedPct: 50,
      rssBytes: 100 * 1024 * 1024,
      heapTotalBytes: 60 * 1024 * 1024,
      heapUsedBytes: 40 * 1024 * 1024,
      heapUsedPct: 20,
      externalBytes: 0,
      arrayBuffersBytes: 0,
    },
    disk: [{ mount: '/', totalBytes: 1e12, usedBytes: 5e11, freeBytes: 5e11, usedPct: 50 }],
    network: { totalBytesIn: 0, totalBytesOut: 0, totalErrors: 0, totalDrops: 0, deltaBytesIn: 0, deltaBytesOut: 0, interfaces: {} },
    fd: { open: 100, max: 1024, usedPct: 9.76 },
    procTree: { parentPid: process.pid, count: 0, children: [] },
    runtime: { heap: null, spaces: null, elu: null, eluPct: 0, resource: null },
    eventLoopLag: { meanMs: 0, maxMs: 0, p95Ms: 0, p99Ms: 0 },
    uptime: { processSec: 10, osSec: 100 },
    platform: process.platform,
    pid: process.pid,
    nodeVersion: process.version,
  };
  // deep-merge top level keys for convenience
  const out = { ...base };
  if (overrides) {
    for (const k of Object.keys(overrides)) {
      if (typeof overrides[k] === 'object' && overrides[k] != null && !Array.isArray(overrides[k])) {
        out[k] = { ...base[k], ...overrides[k] };
      } else {
        out[k] = overrides[k];
      }
    }
  }
  return out;
}

// ─── tests ─────────────────────────────────────────────────────

test('1. createTracker returns a ResourceTracker with default options', () => {
  const tr = createTracker();
  assert.ok(tr instanceof ResourceTracker);
  assert.equal(tr.opts.intervalMs, 5000);
  assert.equal(tr.opts.bufferSize, 1000);
  assert.equal(tr.running, false);
});

test('2. RingBuffer fills, wraps, and returns chronological order', () => {
  const rb = new RingBuffer(3);
  rb.push({ ts: 1 });
  rb.push({ ts: 2 });
  rb.push({ ts: 3 });
  assert.equal(rb.size, 3);
  let arr = rb.toArray();
  assert.deepEqual(arr.map(x => x.ts), [1, 2, 3]);
  rb.push({ ts: 4 });   // evicts ts:1
  rb.push({ ts: 5 });   // evicts ts:2
  arr = rb.toArray();
  assert.deepEqual(arr.map(x => x.ts), [3, 4, 5]);
  assert.equal(rb.last().ts, 5);
});

test('3. sampleOnce populates CPU/memory/disk/fd/runtime metric groups', () => {
  const tr = createTracker({ installDefaults: false });
  const s = tr.sampleOnce();
  assert.ok(s);
  assert.ok(s.cpu && typeof s.cpu.coreCount === 'number');
  assert.ok(s.memory && typeof s.memory.totalBytes === 'number');
  assert.ok(s.memory.rssBytes > 0);
  assert.ok(Array.isArray(s.disk));
  assert.ok(s.fd && typeof s.fd.open === 'number');
  assert.ok(s.runtime);
  assert.ok(s.eventLoopLag);
  assert.ok(s.uptime && typeof s.uptime.processSec === 'number');
  assert.equal(s.pid, process.pid);
});

test('4. current() and history() return latest and windowed samples', () => {
  const tr = createTracker({ installDefaults: false });
  tr._injectSample(makeSample({ ts: Date.now() - 30_000 }));
  tr._injectSample(makeSample({ ts: Date.now() - 10_000 }));
  tr._injectSample(makeSample({ ts: Date.now() }));
  const cur = tr.current();
  assert.ok(cur);
  const recent = tr.history(20); // last 20 seconds
  assert.equal(recent.length, 2);
  const all = tr.history();
  assert.equal(all.length, 3);
});

test('5. stats() summarizes min/max/avg/p95 over a window', () => {
  const tr = createTracker({ installDefaults: false });
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    tr._injectSample(makeSample({
      ts: now - (10 - i) * 1000,
      cpu: { utilizationPct: (i + 1) * 10 }, // 10..100
    }));
  }
  const s = tr.stats('cpu.utilizationPct');
  assert.equal(s.count, 10);
  assert.equal(s.min, 10);
  assert.equal(s.max, 100);
  assert.equal(s.avg, 55);
  assert.ok(s.p95 >= 90);
});

test('6. linearRegression produces correct slope for y = 2x + 1', () => {
  const pts = [];
  for (let x = 0; x < 10; x++) pts.push({ x, y: 2 * x + 1 });
  const { slope, intercept, r2 } = linearRegression(pts);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept - 1) < 1e-9);
  assert.ok(r2 > 0.9999);
});

test('7. trend() returns "rising" for monotonically increasing series', () => {
  const tr = createTracker({ installDefaults: false });
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    tr._injectSample(makeSample({
      ts: now - (20 - i) * 1000,
      cpu: { utilizationPct: 10 + i * 2 },
    }));
  }
  const t = tr.trend('cpu.utilizationPct');
  assert.equal(t.direction, 'rising');
  assert.ok(t.slope > 0);
  assert.ok(t.r2 > 0.9);
});

test('7b. trend() returns "falling" for decreasing series', () => {
  const tr = createTracker({ installDefaults: false });
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    tr._injectSample(makeSample({
      ts: now - (20 - i) * 1000,
      cpu: { utilizationPct: 90 - i * 2 },
    }));
  }
  const t = tr.trend('cpu.utilizationPct');
  assert.equal(t.direction, 'falling');
  assert.ok(t.slope < 0);
});

test('8. predict() extrapolates future value from slope', () => {
  const tr = createTracker({ installDefaults: false });
  for (let i = 0; i < 10; i++) {
    tr._injectSample(makeSample({ cpu: { utilizationPct: i * 5 } })); // 0,5,10..45
  }
  const p = tr.predict('cpu.utilizationPct', 2);
  // slope ≈ 5, last x = 9, predict at x=11 -> ~55
  assert.ok(p.value > 50);
  assert.ok(p.value < 60);
  assert.ok(p.confidence > 0.9);
});

test('9. detectLeak() fires on heap growing monotonically by >10%', () => {
  const tr = createTracker({ installDefaults: false, heapGrowthPct: 10, leakWindowSec: 600 });
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    tr._injectSample(makeSample({
      ts: now - (10 - i) * 1000,
      memory: {
        heapUsedBytes: 40_000_000 * (1 + i * 0.05), // 5% per step -> ~50% total
      },
    }));
  }
  const r = tr.detectLeak('memory.heapUsedBytes', 3600);
  assert.equal(r.leaking, true);
  assert.ok(r.growthPct >= 10);
  assert.ok(r.slope > 0);
});

test('10. detectLeak() does NOT fire on flat heap series', () => {
  const tr = createTracker({ installDefaults: false, heapGrowthPct: 10 });
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    tr._injectSample(makeSample({
      ts: now - (10 - i) * 1000,
      memory: { heapUsedBytes: 40_000_000 }, // constant
    }));
  }
  const r = tr.detectLeak('memory.heapUsedBytes', 3600);
  assert.equal(r.leaking, false);
});

test('11. setThreshold fires alert when breached (sustain=1)', () => {
  const tr = createTracker({ installDefaults: false });
  let fired = null;
  tr.on('alert', (a) => { fired = a; });
  tr.setThreshold('cpu.utilizationPct', 50, null, { op: '>', sustain: 1 });
  tr._injectSample(makeSample({ cpu: { utilizationPct: 75 } }));
  assert.ok(fired);
  assert.equal(fired.metric, 'cpu.utilizationPct');
  assert.equal(fired.value, 75);
  assert.equal(fired.limit, 50);
});

test('12. sustain=3 requires three consecutive breaches before firing', () => {
  const tr = createTracker({ installDefaults: false });
  let count = 0;
  tr.on('alert', () => { count++; });
  tr.setThreshold('memory.usedPct', 80, null, { op: '>', sustain: 3 });
  // First breach
  tr._injectSample(makeSample({ memory: { usedPct: 85 } }));
  assert.equal(count, 0);
  // Second
  tr._injectSample(makeSample({ memory: { usedPct: 86 } }));
  assert.equal(count, 0);
  // Third — should fire now
  tr._injectSample(makeSample({ memory: { usedPct: 87 } }));
  assert.equal(count, 1);
});

test('13. Threshold onExceed callback is invoked', () => {
  const tr = createTracker({ installDefaults: false });
  let cb = null;
  tr.setThreshold('fd.usedPct', 50, (alert) => { cb = alert; }, { op: '>', sustain: 1 });
  tr._injectSample(makeSample({ fd: { open: 800, max: 1024, usedPct: 78 } }));
  assert.ok(cb);
  assert.equal(cb.metric, 'fd.usedPct');
});

test('14. opts.alertManager.fire is called when a threshold fires', () => {
  const fired = [];
  const tr = createTracker({
    installDefaults: false,
    alertManager: { fire: (a) => fired.push(a) },
  });
  tr.setThreshold('cpu.utilizationPct', 70, null, { op: '>', sustain: 1 });
  tr._injectSample(makeSample({ cpu: { utilizationPct: 95 } }));
  assert.equal(fired.length, 1);
  assert.equal(fired[0].metric, 'cpu.utilizationPct');
});

test('15. opts.logger.warn is called when a threshold fires', () => {
  const logs = [];
  const tr = createTracker({
    installDefaults: false,
    logger: { warn: (msg, obj) => logs.push({ msg, obj }), info: () => {} },
  });
  tr.setThreshold('memory.usedPct', 80, null, { op: '>', sustain: 1 });
  tr._injectSample(makeSample({ memory: { usedPct: 90 } }));
  assert.equal(logs.length, 1);
  assert.ok(logs[0].msg.includes('[resource-tracker]'));
  assert.equal(logs[0].obj.metric, 'memory.usedPct');
});

test('16. removeThreshold removes it and further breaches do not fire', () => {
  const tr = createTracker({ installDefaults: false });
  let count = 0;
  tr.on('alert', () => { count++; });
  const id = tr.setThreshold('cpu.utilizationPct', 50, null, { sustain: 1 });
  tr._injectSample(makeSample({ cpu: { utilizationPct: 95 } }));
  assert.equal(count, 1);
  assert.equal(tr.removeThreshold(id), true);
  tr._injectSample(makeSample({ cpu: { utilizationPct: 99 } }));
  assert.equal(count, 1); // unchanged
});

test('17. topK returns children sorted by resource descending', () => {
  const tr = createTracker({ installDefaults: false });
  tr._injectSample(makeSample({
    procTree: {
      parentPid: process.pid,
      count: 3,
      children: [
        { pid: 1, name: 'a', rssBytes: 100, cpuPct: 10 },
        { pid: 2, name: 'b', rssBytes: 500, cpuPct: 5 },
        { pid: 3, name: 'c', rssBytes: 200, cpuPct: 50 },
      ],
    },
  }));
  const byMem = tr.topK('mem', 2);
  assert.equal(byMem.length, 2);
  assert.equal(byMem[0].pid, 2);
  assert.equal(byMem[1].pid, 3);
  const byCpu = tr.topK('cpu', 3);
  assert.equal(byCpu[0].pid, 3);
});

test('18. exportPrometheus produces a text block with headers', () => {
  const tr = createTracker({ installDefaults: false });
  tr._injectSample(makeSample({}));
  const txt = tr.exportPrometheus();
  assert.ok(typeof txt === 'string');
  assert.ok(txt.includes('# HELP onyx_cpu_utilization_pct'));
  assert.ok(txt.includes('# TYPE onyx_cpu_utilization_pct gauge'));
  assert.ok(txt.includes('onyx_memory_used_pct'));
  assert.ok(txt.includes('onyx_heap_used_bytes'));
  assert.ok(txt.includes('onyx_disk_used_pct{mount="/"}'));
});

test('19. exportJSON returns a serializable snapshot', () => {
  const tr = createTracker({ installDefaults: false });
  tr._injectSample(makeSample({}));
  const snap = tr.exportJSON();
  const s = JSON.stringify(snap);
  assert.ok(typeof s === 'string');
  const parsed = JSON.parse(s);
  assert.equal(parsed.running, false);
  assert.equal(parsed.buffer.length, 1);
  assert.ok(parsed.opts);
});

test('20. default thresholds install 6 thresholds (cpu/mem/disk/heap/fd/loopLag)', () => {
  const tr = createTracker();
  const names = tr.listThresholds().map(t => t.metric).sort();
  const expected = Object.keys(DEFAULT_THRESHOLDS).sort();
  assert.equal(names.length, expected.length);
  for (const n of expected) assert.ok(names.includes(n), `missing default threshold for ${n}`);
});

test('21. invalid constructor opts throw bilingual errors', () => {
  assert.throws(() => createTracker({ intervalMs: 10 }), /intervalMs must be >= 100ms/);
  assert.throws(() => createTracker({ bufferSize: 0 }), /bufferSize must be >= 1/);
  const tr = createTracker({ installDefaults: false });
  assert.throws(() => tr.setThreshold('', 50), /metric must be a non-empty string/);
  assert.throws(() => tr.setThreshold('cpu', 'bad'), /limit must be a number/);
  assert.throws(() => tr.on('sample', 'notfn'), /handler must be a function/);
});

test('22. getMetricByPath resolves aliases and dot-paths', () => {
  const s = makeSample({
    cpu: { utilizationPct: 42 },
    memory: { usedPct: 77, heapUsedPct: 33 },
    fd: { usedPct: 55 },
    eventLoopLag: { p95Ms: 120 },
  });
  assert.equal(getMetricByPath(s, 'cpu'), 42);
  assert.equal(getMetricByPath(s, 'memory'), 77);
  assert.equal(getMetricByPath(s, 'heap'), 33);
  assert.equal(getMetricByPath(s, 'fd'), 55);
  assert.equal(getMetricByPath(s, 'loopLagMs'), 120);
  assert.equal(getMetricByPath(s, 'cpu.utilizationPct'), 42);
  assert.equal(getMetricByPath(s, 'memory.totalBytes'), s.memory.totalBytes);
});

test('23. start()/stop() are idempotent and do not throw', () => {
  const tr = createTracker({ intervalMs: 1000, installDefaults: false });
  tr.start();
  assert.equal(tr.running, true);
  tr.start(); // second start should be a no-op
  assert.equal(tr.running, true);
  tr.stop();
  assert.equal(tr.running, false);
  tr.stop(); // second stop no-op
  assert.equal(tr.running, false);
});

test('24. severity escalates from warning to high to critical', () => {
  const tr = createTracker({ installDefaults: false });
  const alerts = [];
  tr.on('alert', a => alerts.push(a));

  tr.setThreshold('cpu.utilizationPct', 50, null, { sustain: 1 });
  // warning: value < 1.05 * limit  (52 < 52.5)
  tr._injectSample(makeSample({ cpu: { utilizationPct: 52 } }));
  // Clear the firing state so the next one fires
  // (reset by sending a below-limit sample)
  tr._injectSample(makeSample({ cpu: { utilizationPct: 10 } }));
  // high: 1.05*50 <= v < 1.2*50  (58)
  tr._injectSample(makeSample({ cpu: { utilizationPct: 58 } }));
  tr._injectSample(makeSample({ cpu: { utilizationPct: 10 } }));
  // critical: v >= 1.2*50  (65)
  tr._injectSample(makeSample({ cpu: { utilizationPct: 65 } }));

  // Filter out any that may have been emitted during the clear step
  const sev = alerts.map(a => a.severity);
  assert.ok(sev.includes('warning'));
  assert.ok(sev.includes('high'));
  assert.ok(sev.includes('critical'));
});

test('25. summarize() over empty array returns zeros', () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  assert.equal(s.min, 0);
  assert.equal(s.max, 0);
  assert.equal(s.avg, 0);
  assert.equal(s.p95, 0);
});

test('26. bilingual alert messages include Hebrew and English', () => {
  const tr = createTracker({ installDefaults: false });
  let fired = null;
  tr.on('alert', a => { fired = a; });
  tr.setThreshold('cpu.utilizationPct', 50, null, { sustain: 1 });
  tr._injectSample(makeSample({ cpu: { utilizationPct: 99 } }));
  assert.ok(fired);
  assert.ok(fired.messageHe && /חריגה/.test(fired.messageHe));
  assert.ok(fired.messageEn && /Threshold breach/.test(fired.messageEn));
});
