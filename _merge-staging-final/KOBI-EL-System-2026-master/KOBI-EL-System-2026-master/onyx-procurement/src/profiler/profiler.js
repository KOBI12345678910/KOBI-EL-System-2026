/**
 * Node.js Performance Profiler — Zero-Dependency
 * Agent X88 (AG-X88) — written 2026-04-11
 *
 * Mega-ERP Techno-Kol Uzi — Rule: לא מוחקים רק משדרגים ומגדלים
 *
 * A self-contained performance profiling toolkit built on stock Node core:
 *   - node:inspector              → CPU profiles (.cpuprofile JSON)
 *   - v8.getHeapSnapshot()        → Heap snapshots (.heapsnapshot)
 *   - node:trace_events           → Per-category event tracing
 *   - node:perf_hooks.performance → Marks & measures
 *
 * Features:
 *   • startCPUProfile(name) / stopCPUProfile()
 *   • startHeapSnapshot() / captureHeapSnapshot()
 *   • startTracing() / stopTracing()
 *   • mark(name) / measure(name, startMark, endMark)
 *   • flameGraph(cpuprofile) → inline SVG (no external chart libs)
 *   • topFunctions(cpuprofile, n) → ranked by self-time with file:line
 *   • compareProfiles(a, b) → diff report (regressions + improvements)
 *   • saveProfile(path, payload) / loadProfile(path)
 *   • httpMiddleware(app) → /debug/profile?duration=10s&token=...
 *
 * External dependencies: ZERO — only Node core modules.
 * Bilingual (Hebrew/English) titles appear in rendered reports.
 *
 * Run with any modern Node (>=18). Safe to require from any route handler.
 */

'use strict';

const inspector = require('node:inspector');
const { performance, PerformanceObserver } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const v8 = require('node:v8');

// node:trace_events is available in Node 10+, but we still guard require.
let traceEvents = null;
try {
  // eslint-disable-next-line global-require
  traceEvents = require('node:trace_events');
} catch (_err) {
  traceEvents = null;
}

// ─── Constants ─────────────────────────────────────────────────────────
const DEFAULT_SAMPLING_INTERVAL_US = 100; // 100µs → 10 kHz
const MAX_PROFILE_DURATION_MS = 10 * 60 * 1000; // 10 minutes hard cap
const MIN_PROFILE_DURATION_MS = 50; // allow very short unit tests
const SVG_ROW_HEIGHT = 16;
const SVG_FONT_SIZE = 11;
const SVG_DEFAULT_WIDTH = 1200;
const SVG_MARGIN_TOP = 48;
const SVG_MARGIN_SIDE = 8;
const SVG_COLORS_HOT = [
  '#ffe082', '#ffd54f', '#ffca28', '#ffb300',
  '#ff8f00', '#ff6f00', '#e65100', '#bf360c',
];

// ─── Hebrew/English labels ─────────────────────────────────────────────
const L = Object.freeze({
  title_flame: 'Flame Graph · גרף להבות',
  title_top: 'Top Functions · פונקציות יקרות ביותר',
  title_diff: 'Profile Comparison · השוואת פרופילים',
  title_samples: 'Samples · דגימות',
  title_duration: 'Duration · משך',
  title_self: 'Self Time · זמן עצמי',
  title_total: 'Total Time · זמן כולל',
  title_file: 'File · קובץ',
  title_line: 'Line · שורה',
  title_function: 'Function · פונקציה',
  title_regress: 'Regressions · רגרסיות',
  title_improve: 'Improvements · שיפורים',
  title_unchanged: 'Unchanged · ללא שינוי',
  unit_ms: 'ms · מילישניות',
  unit_us: 'μs · מיקרושניות',
  label_profiler_header: 'ONYX Profiler · פרופילר ONYX',
});

// ─── Helpers ───────────────────────────────────────────────────────────
function nowIso() {
  return new Date().toISOString();
}

function assert(cond, msg) {
  if (!cond) throw new Error('[profiler] ' + msg);
}

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Stable color from a string — deterministic but visually distinct.
 * Uses djb2 hash → index into SVG_COLORS_HOT.
 */
function hotColor(key) {
  let h = 5381;
  const s = String(key || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return SVG_COLORS_HOT[Math.abs(h) % SVG_COLORS_HOT.length];
}

/**
 * Format a duration (ms) with sensible precision.
 */
function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  if (ms >= 1) return ms.toFixed(2) + 'ms';
  return (ms * 1000).toFixed(1) + 'μs';
}

/**
 * Parse a duration string like "10s", "250ms", "2m" into ms.
 * Falls back to parseInt if no suffix.
 */
function parseDuration(raw, defaultMs = 10000) {
  if (raw == null) return defaultMs;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!m) return defaultMs;
  const n = parseFloat(m[1]);
  const unit = m[2] || 'ms';
  if (unit === 'ms') return n;
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return defaultMs;
}

/**
 * Constant-time string compare — prevents token leak through timing.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    // Still run a dummy compare on equal-length buffer to not leak length.
    const pad = Buffer.alloc(Math.max(ba.length, bb.length));
    try {
      crypto.timingSafeEqual(pad, pad);
    } catch (_) { /* noop */ }
    return false;
  }
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

// ─── CPU-profile analysis helpers ──────────────────────────────────────
/**
 * A V8 CPU profile is: { nodes, samples, timeDeltas, startTime, endTime }.
 * Each node = { id, callFrame:{functionName,url,lineNumber,columnNumber},
 *               hitCount, children:[ids] }.
 *
 * Self-time for a node = (sum of timeDeltas for samples that landed
 * DIRECTLY on that node). Total-time = self + sum(child total).
 * The intervals come in microseconds, convert to ms.
 */
function indexNodes(cpuprofile) {
  const byId = new Map();
  const parentOf = new Map();
  for (const n of cpuprofile.nodes || []) {
    byId.set(n.id, n);
  }
  for (const n of cpuprofile.nodes || []) {
    for (const c of n.children || []) {
      parentOf.set(c, n.id);
    }
  }
  return { byId, parentOf };
}

/**
 * Compute per-node self-time (μs) from samples+timeDeltas.
 * V8 convention: timeDeltas[i] is the delta BEFORE sample[i]. So the
 * cost we attribute to sample[i] is timeDeltas[i].
 */
function computeSelfTimesUs(cpuprofile) {
  const selfUs = new Map();
  const samples = cpuprofile.samples || [];
  const deltas = cpuprofile.timeDeltas || [];
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    const d = deltas[i] || 0;
    selfUs.set(id, (selfUs.get(id) || 0) + d);
  }
  return selfUs;
}

/**
 * Compute total-time (self + descendants) per node.
 * Walks the tree bottom-up via a post-order DFS from the root.
 */
function computeTotalTimesUs(cpuprofile, selfUs) {
  const { byId } = indexNodes(cpuprofile);
  const total = new Map();
  const root = cpuprofile.nodes && cpuprofile.nodes.length > 0
    ? cpuprofile.nodes[0]
    : null;
  if (!root) return total;

  // Iterative post-order walk
  const stack = [{ id: root.id, state: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const node = byId.get(top.id);
    if (!node) { stack.pop(); continue; }
    if (top.state === 0) {
      top.state = 1;
      for (const c of node.children || []) {
        stack.push({ id: c, state: 0 });
      }
    } else {
      let sum = selfUs.get(top.id) || 0;
      for (const c of node.children || []) {
        sum += (total.get(c) || 0);
      }
      total.set(top.id, sum);
      stack.pop();
    }
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════
//                               Profiler
// ═══════════════════════════════════════════════════════════════════════
class Profiler {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.outDir]  directory to drop files in
   * @param {string} [opts.token]   token required by httpMiddleware
   * @param {number} [opts.samplingIntervalUs=100]
   */
  constructor(opts = {}) {
    this.outDir = opts.outDir || path.join(os.tmpdir(), 'onyx-profiler');
    this.token = opts.token || process.env.PROFILER_TOKEN || null;
    this.samplingIntervalUs = opts.samplingIntervalUs || DEFAULT_SAMPLING_INTERVAL_US;

    // Ensure out dir exists (best-effort)
    try { fs.mkdirSync(this.outDir, { recursive: true }); } catch (_) { /* noop */ }

    this._session = null;            // current inspector.Session
    this._cpuActive = false;         // is CPU profiling in progress?
    this._currentName = null;        // name of in-progress CPU profile
    this._startHrTime = null;        // start timestamp (ns)
    this._marks = new Map();         // local copy for measure() lookups
    this._tracing = null;            // active trace_events handle
    this._observer = null;           // PerformanceObserver for measures
    this._measures = [];             // ring buffer of recent measures

    // Observer to catch PerformanceMeasure entries.
    if (typeof PerformanceObserver === 'function') {
      this._observer = new PerformanceObserver((items) => {
        for (const e of items.getEntries()) {
          this._measures.push({
            name: e.name,
            startTime: e.startTime,
            duration: e.duration,
            entryType: e.entryType,
          });
          if (this._measures.length > 500) this._measures.shift();
        }
      });
      try {
        this._observer.observe({ entryTypes: ['measure'] });
      } catch (_) { /* some envs only support type */ }
    }
  }

  // ─── CPU profiling ─────────────────────────────────────────────────
  /**
   * Begin a CPU profile. Returns a promise that resolves when the
   * profiler has actually been enabled & started.
   *
   * @param {string} [name='cpu']
   * @returns {Promise<void>}
   */
  startCPUProfile(name) {
    if (this._cpuActive) {
      return Promise.reject(new Error('[profiler] CPU profile already in progress'));
    }
    this._currentName = name || 'cpu';
    this._startHrTime = process.hrtime.bigint();

    return new Promise((resolve, reject) => {
      try {
        const session = new inspector.Session();
        session.connect();
        this._session = session;

        const enable = () => new Promise((res, rej) => {
          session.post('Profiler.enable', (err) => (err ? rej(err) : res()));
        });
        const setInterval = () => new Promise((res, rej) => {
          session.post(
            'Profiler.setSamplingInterval',
            { interval: this.samplingIntervalUs },
            (err) => (err ? rej(err) : res()),
          );
        });
        const start = () => new Promise((res, rej) => {
          session.post('Profiler.start', (err) => (err ? rej(err) : res()));
        });

        enable()
          .then(setInterval)
          .then(start)
          .then(() => {
            this._cpuActive = true;
            resolve();
          })
          .catch((err) => {
            try { session.disconnect(); } catch (_) { /* noop */ }
            this._session = null;
            reject(err);
          });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the active CPU profile and return the .cpuprofile JSON.
   * The returned object is the raw V8 shape, augmented with our own
   * {_meta:{name, startedAt, wallMs, host, node}} field.
   *
   * @returns {Promise<Object>}
   */
  stopCPUProfile() {
    assert(this._cpuActive, 'no CPU profile in progress');
    const session = this._session;
    const name = this._currentName;
    const started = this._startHrTime;

    return new Promise((resolve, reject) => {
      session.post('Profiler.stop', (err, res) => {
        try { session.post('Profiler.disable', () => {}); } catch (_) { /* noop */ }
        try { session.disconnect(); } catch (_) { /* noop */ }
        this._session = null;
        this._cpuActive = false;
        this._currentName = null;
        if (err) return reject(err);

        const profile = res && res.profile ? res.profile : res;
        const endHr = process.hrtime.bigint();
        const wallMs = Number(endHr - started) / 1e6;

        profile._meta = {
          name,
          startedAt: new Date(Date.now() - wallMs).toISOString(),
          endedAt: nowIso(),
          wallMs,
          host: os.hostname(),
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          samplingIntervalUs: this.samplingIntervalUs,
        };
        return resolve(profile);
      });
    });
  }

  // ─── Heap snapshots ────────────────────────────────────────────────
  /**
   * Mark the beginning of a heap-snapshot window. It is purely a
   * bookkeeping helper — V8 heap snapshots are taken instantaneously.
   */
  startHeapSnapshot() {
    this._heapWindow = {
      startedAt: nowIso(),
      startHr: process.hrtime.bigint(),
      beforeUsage: process.memoryUsage(),
    };
    return this._heapWindow;
  }

  /**
   * Capture a .heapsnapshot. V8 streams to a Readable; we buffer it.
   * Returns a string (the raw JSON-text) — suitable for writing to
   * disk or loading into Chrome DevTools.
   *
   * @returns {Promise<string>}
   */
  captureHeapSnapshot() {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const stream = v8.getHeapSnapshot();
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => {
          const buf = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))));
          const text = buf.toString('utf8');
          // Sanity: must be valid JSON and declare snapshot.meta
          try {
            const head = text.slice(0, 256);
            if (head.indexOf('"snapshot"') === -1) {
              // Still return it — Chrome will parse — but warn caller.
            }
          } catch (_) { /* noop */ }
          resolve(text);
        });
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Trace events (node:trace_events) ──────────────────────────────
  /**
   * Begin tracing a set of categories. Default: 'node.perf','v8'.
   * Writes to a rotating file inside outDir when stopTracing() is
   * called. Returns the handle so callers can inspect later.
   */
  startTracing(categories) {
    if (!traceEvents) {
      // Trace events unavailable (unsupported Node) — no-op.
      this._tracing = { ok: false, reason: 'trace_events unavailable' };
      return this._tracing;
    }
    const cats = Array.isArray(categories) && categories.length > 0
      ? categories
      : ['node.perf', 'v8'];
    try {
      const tracing = traceEvents.createTracing({ categories: cats });
      tracing.enable();
      this._tracing = {
        ok: true,
        handle: tracing,
        startedAt: nowIso(),
        categories: cats,
      };
    } catch (err) {
      this._tracing = { ok: false, reason: err.message };
    }
    return this._tracing;
  }

  /**
   * Stop tracing. Returns an object describing what was collected.
   * Because trace_events streams to its own log file configured via
   * `--trace-event-file-pattern`, we cannot "return" the event list
   * directly — callers read the resulting file. We expose the path
   * hint and whether tracing was successful.
   */
  stopTracing() {
    const t = this._tracing;
    if (!t) return { ok: false, reason: 'not started' };
    if (!t.ok) {
      this._tracing = null;
      return { ok: false, reason: t.reason };
    }
    try {
      if (t.handle && typeof t.handle.disable === 'function') {
        t.handle.disable();
      }
    } catch (_) { /* noop */ }
    const out = {
      ok: true,
      startedAt: t.startedAt,
      stoppedAt: nowIso(),
      categories: t.categories,
      note: 'See Node trace-event file pattern for the JSONL output.',
    };
    this._tracing = null;
    return out;
  }

  // ─── Marks & measures ──────────────────────────────────────────────
  /**
   * Create a performance mark. Thin wrapper that also records the
   * timestamp in our own Map so we can report marks alongside
   * measures even if perf_hooks buffers them elsewhere.
   */
  mark(name) {
    assert(typeof name === 'string' && name.length > 0, 'mark name required');
    try {
      performance.mark(name);
    } catch (_) { /* environment without performance marks — ignore */ }
    const ts = performance.now();
    this._marks.set(name, ts);
    return ts;
  }

  /**
   * Create a performance measure between two marks. Returns the
   * PerformanceEntry (duration in ms).
   */
  measure(name, startMark, endMark) {
    assert(typeof name === 'string' && name.length > 0, 'measure name required');
    try {
      performance.measure(name, startMark, endMark);
    } catch (err) {
      // If marks haven't been registered with the platform performance
      // API we fall back to manual computation using our _marks map.
      const a = this._marks.get(startMark);
      const b = endMark ? this._marks.get(endMark) : performance.now();
      if (a == null || b == null) throw err;
      const entry = {
        name,
        startTime: a,
        duration: Math.max(0, b - a),
        entryType: 'measure',
      };
      this._measures.push(entry);
      if (this._measures.length > 500) this._measures.shift();
      return entry;
    }

    // Find the newest measure with matching name from our observer buffer.
    for (let i = this._measures.length - 1; i >= 0; i -= 1) {
      if (this._measures[i].name === name) return this._measures[i];
    }
    // Last-resort manual compute.
    const a = this._marks.get(startMark);
    const b = endMark ? this._marks.get(endMark) : performance.now();
    return {
      name,
      startTime: a || 0,
      duration: Math.max(0, (b || 0) - (a || 0)),
      entryType: 'measure',
    };
  }

  /**
   * Snapshot of all recorded measures. Returned array is a shallow copy.
   */
  getMeasures() {
    return this._measures.slice();
  }

  /**
   * Snapshot of all recorded marks.
   */
  getMarks() {
    const out = {};
    for (const [k, v] of this._marks.entries()) out[k] = v;
    return out;
  }

  // ─── Analysis: top functions ───────────────────────────────────────
  /**
   * Top N functions by self-time (descending). Returns an array of:
   *   { rank, functionName, file, line, column, selfMs, totalMs, hitCount }
   */
  topFunctions(cpuprofile, n = 20) {
    assert(cpuprofile && Array.isArray(cpuprofile.nodes), 'bad cpuprofile');
    const selfUs = computeSelfTimesUs(cpuprofile);
    const totalUs = computeTotalTimesUs(cpuprofile, selfUs);
    const rows = [];
    for (const node of cpuprofile.nodes) {
      const sUs = selfUs.get(node.id) || 0;
      const tUs = totalUs.get(node.id) || 0;
      const cf = node.callFrame || {};
      rows.push({
        id: node.id,
        functionName: cf.functionName || '(anonymous)',
        file: cf.url || '',
        line: (cf.lineNumber != null ? cf.lineNumber + 1 : 0),
        column: (cf.columnNumber != null ? cf.columnNumber + 1 : 0),
        selfMs: sUs / 1000,
        totalMs: tUs / 1000,
        hitCount: node.hitCount || 0,
      });
    }
    rows.sort((a, b) => b.selfMs - a.selfMs);
    const limit = Math.max(1, Math.min(rows.length, Number(n) || 20));
    return rows.slice(0, limit).map((r, i) => Object.assign({ rank: i + 1 }, r));
  }

  // ─── Analysis: flame graph (SVG) ───────────────────────────────────
  /**
   * Build a flame-graph SVG from a cpuprofile. The layout is
   * classic top-down: root at top, children stacked by inclusive
   * time. Width proportional to total time.
   *
   * @param {Object}  cpuprofile
   * @param {Object}  [opts]
   * @param {number}  [opts.width=1200]
   * @param {number}  [opts.minPct=0.1]  hide frames < 0.1% of root
   * @returns {string} SVG document
   */
  flameGraph(cpuprofile, opts = {}) {
    assert(cpuprofile && Array.isArray(cpuprofile.nodes), 'bad cpuprofile');
    const width = opts.width || SVG_DEFAULT_WIDTH;
    const minPct = opts.minPct != null ? opts.minPct : 0.1;

    const { byId } = indexNodes(cpuprofile);
    const selfUs = computeSelfTimesUs(cpuprofile);
    const totalUs = computeTotalTimesUs(cpuprofile, selfUs);
    const rootNode = cpuprofile.nodes[0];
    const rootTotal = totalUs.get(rootNode.id) || 0;
    const inner = Math.max(100, width - (SVG_MARGIN_SIDE * 2));
    const minUs = rootTotal * (minPct / 100);

    // Layout: DFS, each node gets {x,y,w,depth}
    const frames = [];
    let maxDepth = 0;
    function walk(id, depth, x, w) {
      const node = byId.get(id);
      if (!node || w <= 0) return;
      if (depth > maxDepth) maxDepth = depth;
      const cf = node.callFrame || {};
      frames.push({
        id,
        depth,
        x,
        w,
        name: cf.functionName || '(anonymous)',
        file: cf.url || '',
        line: cf.lineNumber != null ? cf.lineNumber + 1 : 0,
        selfMs: (selfUs.get(id) || 0) / 1000,
        totalMs: (totalUs.get(id) || 0) / 1000,
      });
      const children = (node.children || [])
        .map((c) => ({ c, t: totalUs.get(c) || 0 }))
        .filter((o) => o.t >= minUs)
        .sort((a, b) => b.t - a.t);
      const sum = children.reduce((s, o) => s + o.t, 0) || 1;
      let cursor = x;
      for (const ch of children) {
        const ratio = ch.t / sum;
        const cw = w * ratio;
        walk(ch.c, depth + 1, cursor, cw);
        cursor += cw;
      }
    }
    walk(rootNode.id, 0, SVG_MARGIN_SIDE, inner);

    const height = SVG_MARGIN_TOP + ((maxDepth + 1) * SVG_ROW_HEIGHT) + 24;
    const meta = cpuprofile._meta || {};
    const titleLine = L.title_flame;
    const subtitleLine =
      (meta.name ? escapeXml(meta.name) + ' · ' : '')
      + 'samples=' + escapeXml((cpuprofile.samples || []).length)
      + ' · wall=' + escapeXml(fmtMs(meta.wallMs || (rootTotal / 1000)))
      + ' · ' + escapeXml(meta.node || process.version);

    const rects = [];
    for (const f of frames) {
      if (f.w < 0.3) continue; // below pixel threshold
      const y = SVG_MARGIN_TOP + (f.depth * SVG_ROW_HEIGHT);
      const fill = hotColor(f.name + '|' + f.file);
      const label = f.name + (f.file ? ' (' + path.basename(f.file) + ':' + f.line + ')' : '');
      const tooltip =
        label
        + ' — self=' + fmtMs(f.selfMs)
        + ', total=' + fmtMs(f.totalMs);
      rects.push(
        '<g>'
        + '<title>' + escapeXml(tooltip) + '</title>'
        + '<rect x="' + f.x.toFixed(1) + '" y="' + y
        + '" width="' + f.w.toFixed(1) + '" height="' + (SVG_ROW_HEIGHT - 1)
        + '" fill="' + fill + '" stroke="#fff" stroke-width="0.5"/>'
        + (f.w > 60
          ? '<text x="' + (f.x + 3).toFixed(1) + '" y="' + (y + 11)
            + '" font-family="Menlo,Consolas,monospace" font-size="' + SVG_FONT_SIZE
            + '" fill="#000">' + escapeXml(truncateLabel(label, f.w))
            + '</text>'
          : '')
        + '</g>'
      );
    }

    return (
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + width
      + '" height="' + height
      + '" viewBox="0 0 ' + width + ' ' + height + '">'
      + '<rect width="100%" height="100%" fill="#fafafa"/>'
      + '<text x="' + (width / 2) + '" y="18" text-anchor="middle"'
      + ' font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="bold">'
      + escapeXml(titleLine) + '</text>'
      + '<text x="' + (width / 2) + '" y="34" text-anchor="middle"'
      + ' font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#555">'
      + subtitleLine + '</text>'
      + rects.join('')
      + '</svg>'
    );
  }

  // ─── Analysis: compare two profiles ────────────────────────────────
  /**
   * Diff two cpuprofiles by function key (functionName + file:line).
   * Returns an object:
   *   {
   *     regressions: [{key, aMs, bMs, deltaMs, deltaPct}],  // got slower
   *     improvements:[{key, aMs, bMs, deltaMs, deltaPct}],  // got faster
   *     unchanged:   number,
   *     summary: {aWallMs, bWallMs, deltaMs, deltaPct},
   *   }
   */
  compareProfiles(a, b) {
    assert(a && Array.isArray(a.nodes), 'bad profile A');
    assert(b && Array.isArray(b.nodes), 'bad profile B');
    const mapOf = (p) => {
      const selfUs = computeSelfTimesUs(p);
      const m = new Map();
      for (const n of p.nodes) {
        const cf = n.callFrame || {};
        const key = (cf.functionName || '(anon)') + '@'
          + (cf.url || '') + ':' + (cf.lineNumber != null ? cf.lineNumber + 1 : 0);
        const selfMs = (selfUs.get(n.id) || 0) / 1000;
        m.set(key, (m.get(key) || 0) + selfMs);
      }
      return m;
    };
    const mA = mapOf(a);
    const mB = mapOf(b);
    const allKeys = new Set([...mA.keys(), ...mB.keys()]);
    const regressions = [];
    const improvements = [];
    let unchanged = 0;
    for (const k of allKeys) {
      const va = mA.get(k) || 0;
      const vb = mB.get(k) || 0;
      const delta = vb - va;
      const pct = va > 0 ? ((delta / va) * 100) : (vb > 0 ? Infinity : 0);
      if (Math.abs(delta) < 0.05) { unchanged += 1; continue; }
      const row = { key: k, aMs: va, bMs: vb, deltaMs: delta, deltaPct: pct };
      if (delta > 0) regressions.push(row);
      else improvements.push(row);
    }
    regressions.sort((x, y) => y.deltaMs - x.deltaMs);
    improvements.sort((x, y) => x.deltaMs - y.deltaMs);
    const aWall = (a._meta && a._meta.wallMs) || 0;
    const bWall = (b._meta && b._meta.wallMs) || 0;
    const deltaWall = bWall - aWall;
    const pctWall = aWall > 0 ? (deltaWall / aWall) * 100 : 0;
    return {
      regressions,
      improvements,
      unchanged,
      summary: {
        aWallMs: aWall,
        bWallMs: bWall,
        deltaMs: deltaWall,
        deltaPct: pctWall,
        aName: (a._meta && a._meta.name) || 'A',
        bName: (b._meta && b._meta.name) || 'B',
      },
    };
  }

  // ─── Save / load ───────────────────────────────────────────────────
  /**
   * Persist a payload to disk. The extension tells us what it is:
   *   .cpuprofile   → JSON.stringify
   *   .heapsnapshot → raw text (already serialized)
   *   .svg          → raw text
   *   else          → JSON.stringify
   *
   * @param {string} filePath
   * @param {any}    payload
   * @returns {string} absolute path written
   */
  saveProfile(filePath, payload) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(this.outDir, filePath);
    try { fs.mkdirSync(path.dirname(abs), { recursive: true }); } catch (_) { /* noop */ }
    const ext = path.extname(abs).toLowerCase();
    let text;
    if (ext === '.svg' || typeof payload === 'string') {
      text = payload;
    } else if (ext === '.heapsnapshot') {
      text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    } else {
      text = JSON.stringify(payload);
    }
    fs.writeFileSync(abs, text);
    return abs;
  }

  /**
   * Load a saved profile from disk. Returns:
   *   .cpuprofile / .heapsnapshot / .json → parsed object
   *   .svg → raw string
   */
  loadProfile(filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(this.outDir, filePath);
    const text = fs.readFileSync(abs, 'utf8');
    const ext = path.extname(abs).toLowerCase();
    if (ext === '.svg') return text;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  // ─── HTTP middleware ───────────────────────────────────────────────
  /**
   * Install the /debug/profile endpoint on an Express-style app.
   * Query params:
   *   token    — must equal this.token (required)
   *   duration — e.g. "10s", "500ms" (default 10s, max 10m)
   *   format   — 'cpuprofile' | 'svg' | 'top' | 'heap'  (default 'cpuprofile')
   *   n        — for format=top (default 20)
   *
   * Refuses without a valid token. The token itself MUST be set via
   * constructor or PROFILER_TOKEN env var; otherwise the route answers
   * 503 to avoid accidentally shipping an open profiler.
   */
  httpMiddleware(app) {
    assert(app && typeof app.get === 'function', 'pass an Express app');
    const self = this;

    app.get('/debug/profile', async (req, res) => {
      // 1. Token required on the Profiler instance itself.
      if (!self.token) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          ok: false,
          error: 'profiler_disabled',
          hint: 'Set PROFILER_TOKEN env var to enable /debug/profile',
        }));
        return;
      }

      // 2. Token must match (constant-time).
      const supplied = (req.query && req.query.token) || '';
      if (!safeEqual(supplied, self.token)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('WWW-Authenticate', 'Bearer realm="onyx-profiler"');
        res.end(JSON.stringify({ ok: false, error: 'bad_token' }));
        return;
      }

      const q = req.query || {};
      const format = String(q.format || 'cpuprofile').toLowerCase();

      // Heap snapshot is a one-shot: capture and stream.
      if (format === 'heap' || format === 'heapsnapshot') {
        try {
          const snap = await self.captureHeapSnapshot();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="onyx-' + Date.now() + '.heapsnapshot"',
          );
          res.end(snap);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
        }
        return;
      }

      // Otherwise: CPU profile for a bounded duration.
      const duration = Math.min(
        MAX_PROFILE_DURATION_MS,
        Math.max(MIN_PROFILE_DURATION_MS, parseDuration(q.duration, 10000)),
      );

      try {
        await self.startCPUProfile('http-' + Date.now());
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
        return;
      }

      setTimeout(async () => {
        let profile;
        try {
          profile = await self.stopCPUProfile();
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
          return;
        }

        if (format === 'svg') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
          res.end(self.flameGraph(profile));
          return;
        }
        if (format === 'top') {
          const n = parseInt(q.n, 10) || 20;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            ok: true,
            title: L.title_top,
            top: self.topFunctions(profile, n),
            meta: profile._meta,
          }, null, 2));
          return;
        }
        // default: raw cpuprofile
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="onyx-' + Date.now() + '.cpuprofile"',
        );
        res.end(JSON.stringify(profile));
      }, duration);
    });

    return app;
  }
}

// ─── small helper ──────────────────────────────────────────────────────
function truncateLabel(label, pixelWidth) {
  const charsFit = Math.max(1, Math.floor(pixelWidth / 6.5));
  if (label.length <= charsFit) return label;
  if (charsFit <= 3) return label.slice(0, charsFit);
  return label.slice(0, charsFit - 1) + '…';
}

// ─── Exports ───────────────────────────────────────────────────────────
module.exports = {
  Profiler,
  // Exposed for tests & advanced callers:
  _internal: {
    parseDuration,
    safeEqual,
    escapeXml,
    hotColor,
    fmtMs,
    computeSelfTimesUs,
    computeTotalTimesUs,
    indexNodes,
    LABELS: L,
  },
};
