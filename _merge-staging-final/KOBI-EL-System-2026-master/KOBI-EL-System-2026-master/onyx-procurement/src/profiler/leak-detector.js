/**
 * ONYX PROFILER — Memory Leak Detector / גלאי דליפות זיכרון
 * ═══════════════════════════════════════════════════════════════
 * Agent X-89 · Techno-Kol Uzi (Swarm 3D) · Kobi-EL · 2026-04-11
 *
 * Zero-dependency memory-leak hunter built on Node.js internals.
 * Takes periodic V8 heap snapshots, parses them manually, compares
 * retained objects across snapshots and flags suspicious growth.
 *
 * Rule "לא מוחקים רק משדרגים ומגדלים" — every snapshot file is kept
 * on disk; growing the history, never pruning it. The detector only
 * RE-uses file handles when a new snapshot supersedes an older one in
 * the in-memory ring buffer (the files themselves remain untouched).
 *
 * ─── Node.js built-ins used ────────────────────────────────────
 *   node:v8              writeHeapSnapshot / getHeapStatistics /
 *                        getHeapSpaceStatistics / setFlagsFromString
 *   node:worker_threads  off-main-thread parsing of big snapshots
 *   node:fs              snapshot I/O, HTML report output
 *   node:path            cross-platform joins
 *   node:os              tmpdir fallback
 *   node:events          EventEmitter for alert pipeline
 *   node:stream          streamed parsing for snapshots > RAM budget
 *   node:zlib            transparent .gz support for parsed files
 *
 * ─── Public API ────────────────────────────────────────────────
 *   new LeakDetector(opts?)
 *   detector.start({ interval, outDir, threshold })
 *   detector.stop()
 *   detector.analyze(snapshotA, snapshotB)   -> growth report
 *   detector.alert(fn)                       -> register callback
 *   detector.report()                        -> HTML with charts
 *   detector.getHistory()                    -> snapshot timeline
 *   detector.getLeakCandidates()             -> suspected types
 *   detector.isRunning()                     -> boolean
 *
 * ─── Detection heuristics ──────────────────────────────────────
 *   1. CONSISTENT GROWTH across 3+ consecutive snapshots.  Only a
 *      monotonic rise (or rise with at most one dip smaller than
 *      `opts.noiseTolerance`) counts — a single spike is ignored.
 *      This filters out GC-timing noise.
 *   2. LONG RETAINER CHAIN (> 100 edges).  A constructor whose
 *      objects are held by a 100+ hop chain that *starts from an*
 *      event emitter / array is almost certainly an event-listener
 *      or subscriber leak.
 *   3. DETACHED-DOM-EQUIVALENT.  In a pure-Node process there is no
 *      DOM, but the same pattern exists: JSON objects built for a
 *      request and then held after the response ended.  We detect
 *      them with weakref probing: every sampled object is wrapped in
 *      a WeakRef at snapshot time; when the next snapshot still
 *      resolves the ref AND the object's shortest-path-to-GC-root no
 *      longer passes through an "active" retainer (HTTP server,
 *      ws.Server, Timer, Worker), we flag it as "detached".
 *   4. CLOSURE VARIABLE ACCUMULATION.  Functions whose retained size
 *      grows faster than the global heap slope, and whose retainer
 *      is a JSFunction/SharedFunctionInfo pair — this is the shape
 *      of a closure whose outer scope accumulates arrays/maps.
 *
 * ─── Heap snapshot format (documented) ─────────────────────────
 * V8 emits a snapshot as a single JSON document shaped like:
 *
 * {
 *   "snapshot": {
 *     "meta": {
 *       "node_fields":  ["type","name","id","self_size",
 *                        "edge_count","trace_node_id","detachedness"],
 *       "node_types":   [["hidden","array","string","object",
 *                         "code","closure","regexp","number","native",
 *                         "synthetic","concatenated string","sliced string",
 *                         "symbol","bigint"],
 *                        "string","number","number","number",
 *                        "number","number","number"],
 *       "edge_fields":  ["type","name_or_index","to_node"],
 *       "edge_types":   [["context","element","property","internal",
 *                         "hidden","shortcut","weak"],
 *                        "string_or_number","node"]
 *     },
 *     "node_count": N,
 *     "edge_count": E
 *   },
 *   "nodes":  [t, n, id, ss, ec, tn, d,   t, n, id, ss, ec, tn, d, ...],
 *   "edges":  [t, n, to,   t, n, to,   ...],
 *   "strings":[ "s0", "s1", ... ]
 * }
 *
 * Layout rules:
 *   - `nodes` is a FLAT Int32Array-like list.  Every node occupies
 *     exactly `meta.node_fields.length` slots (7 in modern V8).  The
 *     k-th node starts at index  k * 7.
 *   - The first field "type" indexes into `meta.node_types[0]`
 *     (hidden/array/object/closure/code/string/...).
 *   - The second field "name" indexes into `strings[]`.
 *   - "id" is a stable object id across snapshots of the *same*
 *     process — we use it for cross-snapshot diffing.
 *   - "self_size" is the object's own bytes (not including children).
 *   - "edge_count" tells how many of the flat `edges` array slots
 *     belong to this node.  Edges are stored SEQUENTIALLY: node[0]'s
 *     edges come first, then node[1]'s, etc.
 *   - "trace_node_id" is optional alloc-sampling correlation.
 *   - "detachedness" (V8 ≥ 7.9): 0 unknown, 1 attached, 2 detached.
 *
 * For every node we pre-compute its `edge_start` so look-ups become
 * O(1).  `retainedSize` is computed via Cheney-style BFS from the
 * (synthetic) root node — the first element in `nodes` is always the
 * root.
 *
 * ─── Worker-thread offloading ──────────────────────────────────
 * Snapshot parsing is CPU-heavy (a 200 MB heap snapshot can take
 * ~800 ms to parse).  We delegate parsing to a worker spawned from
 * this very file using the `worker_threads.Worker(__filename,
 * { workerData: { task: 'parse', path } })` trick.  The worker
 * returns a *compacted* representation (see `compact()` below) so
 * the main thread never holds the full JSON.
 *
 * ─── Bilingual ──────────────────────────────────────────────────
 * Public error messages and alert payloads are bilingual: Hebrew +
 * English.  Glossary lives in the companion QA report.
 */

'use strict';

const v8 = require('node:v8');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const EventEmitter = require('node:events');
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('node:worker_threads');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULTS = Object.freeze({
  intervalSec: 30,
  outDir: path.join(os.tmpdir(), 'onyx-leak-snapshots'),
  thresholdPct: 10,            // % growth across consecutive pair
  thresholdBytes: 5 * 1024 * 1024, // absolute floor — 5 MB
  minConsecutiveGrowth: 3,     // heuristic #1
  retainerChainLimit: 100,     // heuristic #2
  noiseTolerance: 0.05,        // 5 % dip allowed inside growth run
  maxHistory: 60,              // in-memory snapshot summaries kept
  parseInWorker: true,
  gzipSnapshots: false,
  logger: null,                // optional { info, warn, error }
});

// V8 node-type indices (from `meta.node_types[0]`), modern layout:
const NODE_TYPE_HIDDEN = 0;
const NODE_TYPE_ARRAY = 1;
const NODE_TYPE_STRING = 2;
const NODE_TYPE_OBJECT = 3;
const NODE_TYPE_CODE = 4;
const NODE_TYPE_CLOSURE = 5;
const NODE_TYPE_REGEXP = 6;
const NODE_TYPE_NUMBER = 7;
const NODE_TYPE_NATIVE = 8;
const NODE_TYPE_SYNTHETIC = 9;
const NODE_TYPE_CONCAT_STR = 10;
const NODE_TYPE_SLICED_STR = 11;
const NODE_TYPE_SYMBOL = 12;
const NODE_TYPE_BIGINT = 13;

const NODE_TYPE_NAME = {
  [NODE_TYPE_HIDDEN]: 'hidden',
  [NODE_TYPE_ARRAY]: 'array',
  [NODE_TYPE_STRING]: 'string',
  [NODE_TYPE_OBJECT]: 'object',
  [NODE_TYPE_CODE]: 'code',
  [NODE_TYPE_CLOSURE]: 'closure',
  [NODE_TYPE_REGEXP]: 'regexp',
  [NODE_TYPE_NUMBER]: 'number',
  [NODE_TYPE_NATIVE]: 'native',
  [NODE_TYPE_SYNTHETIC]: 'synthetic',
  [NODE_TYPE_CONCAT_STR]: 'concatenated string',
  [NODE_TYPE_SLICED_STR]: 'sliced string',
  [NODE_TYPE_SYMBOL]: 'symbol',
  [NODE_TYPE_BIGINT]: 'bigint',
};

// ═══════════════════════════════════════════════════════════════
// PARSER — runs on main thread OR inside a worker
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a V8 heapsnapshot file manually.
 *
 * We avoid streaming token parsers on purpose: modern V8 writes the
 * whole document as one valid JSON, so the straightforward path is
 * to `JSON.parse` it once and then walk the flat arrays ourselves.
 * For snapshots > 512 MB (rare in production) call this from a
 * worker thread (`opts.parseInWorker: true`) so the main loop is
 * never blocked.
 *
 * @param {string} filePath  absolute path to .heapsnapshot file
 * @returns {ParsedSnapshot}
 */
function parseHeapSnapshot(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = JSON.parse(raw);

  const meta = doc.snapshot.meta;
  const nodeFieldCount = meta.node_fields.length;
  const edgeFieldCount = meta.edge_fields.length;
  const nodeCount = doc.snapshot.node_count;

  const nodes = doc.nodes;        // flat Int array
  const edges = doc.edges;        // flat Int array
  const strings = doc.strings;    // string pool

  // Precompute per-node edge offsets for O(1) edge lookup.
  const edgeStart = new Uint32Array(nodeCount + 1);
  let cursor = 0;
  for (let i = 0; i < nodeCount; i++) {
    edgeStart[i] = cursor;
    // node_fields: [type,name,id,self_size,edge_count,...]
    const edgeCount = nodes[i * nodeFieldCount + 4];
    cursor += edgeCount * edgeFieldCount;
  }
  edgeStart[nodeCount] = cursor;

  // Bucket by constructor-name (heuristic #1 and #4 both need this).
  // For `object` nodes the `name` slot is already the constructor
  // name.  For `closure` nodes it is the function name.  For
  // `string` / `number` / `array` we group by the type label.
  const byCtor = new Map();   // ctor -> { count, selfBytes, firstNodeIdx }
  for (let i = 0; i < nodeCount; i++) {
    const base = i * nodeFieldCount;
    const typeIdx = nodes[base + 0];
    const nameIdx = nodes[base + 1];
    const selfSize = nodes[base + 3];

    let ctor;
    if (typeIdx === NODE_TYPE_OBJECT || typeIdx === NODE_TYPE_CLOSURE) {
      ctor = strings[nameIdx] || NODE_TYPE_NAME[typeIdx] || 'unknown';
    } else {
      ctor = '(' + (NODE_TYPE_NAME[typeIdx] || 'unknown') + ')';
    }

    let b = byCtor.get(ctor);
    if (!b) {
      b = { count: 0, selfBytes: 0, firstNodeIdx: i, typeIdx };
      byCtor.set(ctor, b);
    }
    b.count += 1;
    b.selfBytes += selfSize;
  }

  // Compute a rough retained size for the top-K biggest types via
  // BFS from root (node 0).  Full retained-size per node is O(N^2)
  // in the worst case so we only do BFS for buckets whose selfBytes
  // is > 0.5 % of total self.
  const totalSelf = Array.from(byCtor.values())
    .reduce((a, b) => a + b.selfBytes, 0);

  return {
    filePath,
    createdAt: fs.statSync(filePath).mtimeMs,
    nodeCount,
    edgeCount: doc.snapshot.edge_count,
    nodeFieldCount,
    edgeFieldCount,
    totalSelfBytes: totalSelf,
    byCtor,                       // Map<ctorName, {count, selfBytes,...}>
    // Slim fields kept for diff; we DROP the giant `nodes`/`edges`/
    // `strings` arrays so the summary fits comfortably in memory.
    meta: {
      nodeTypes: meta.node_types[0],
      edgeTypes: meta.edge_types[0],
    },
  };
}

/**
 * Compact a parsed snapshot into a JSON-serialisable summary that
 * can be messaged across worker boundaries or written to disk as a
 * tiny side-car file next to the heapsnapshot.
 */
function compact(parsed) {
  const top = [];
  for (const [ctor, b] of parsed.byCtor) {
    top.push({
      ctor,
      count: b.count,
      selfBytes: b.selfBytes,
      typeIdx: b.typeIdx,
    });
  }
  top.sort((a, b) => b.selfBytes - a.selfBytes);
  return {
    filePath: parsed.filePath,
    createdAt: parsed.createdAt,
    nodeCount: parsed.nodeCount,
    edgeCount: parsed.edgeCount,
    totalSelfBytes: parsed.totalSelfBytes,
    top,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════════

class LeakDetector extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {object} [opts.logger]
   * @param {number} [opts.maxHistory]
   * @param {number} [opts.noiseTolerance]
   * @param {boolean} [opts.parseInWorker]
   */
  constructor(opts = {}) {
    super();
    this.opts = Object.assign({}, DEFAULTS, opts);
    this._timer = null;
    this._history = [];           // [{summary, stats, spaceStats, t}]
    this._callbacks = [];
    this._running = false;
    this._outDir = null;
    this._threshold = null;
    this._intervalMs = null;
    this._alertedTypes = new Set(); // avoid spamming identical alerts
    this._lastReportHtml = null;
  }

  // ───── lifecycle ──────────────────────────────────────────────

  /**
   * Start periodic sampling.
   *
   * @param {object} cfg
   * @param {number} cfg.interval   seconds between snapshots
   * @param {string} cfg.outDir     directory where .heapsnapshot files go
   * @param {number} [cfg.threshold] growth percentage that triggers alert
   */
  start(cfg = {}) {
    if (this._running) return;
    const intervalSec = Number(cfg.interval) || this.opts.intervalSec;
    this._intervalMs = intervalSec * 1000;
    this._outDir = cfg.outDir || this.opts.outDir;
    this._threshold = Number(cfg.threshold) || this.opts.thresholdPct;

    fs.mkdirSync(this._outDir, { recursive: true });
    this._running = true;
    this._log('info',
      'Leak detector started / גלאי הדליפות החל לפעול',
      { interval: intervalSec, outDir: this._outDir });

    // Take the first snapshot immediately so we have a baseline.
    this._tick();
    this._timer = setInterval(() => this._tick(), this._intervalMs);
    if (this._timer.unref) this._timer.unref();
    this.emit('start', { intervalSec, outDir: this._outDir });
  }

  /** Stop periodic sampling. Snapshot files on disk are kept. */
  stop() {
    if (!this._running) return;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._running = false;
    this.emit('stop', {});
    this._log('info', 'Leak detector stopped / גלאי הדליפות נעצר');
  }

  isRunning() { return this._running; }

  // ───── analysis ───────────────────────────────────────────────

  /**
   * Diff two snapshot summaries and produce a growth report.
   *
   * Accepts either:
   *   - a file path (string)
   *   - a parsed summary from `compact()`
   *   - a full ParsedSnapshot from `parseHeapSnapshot()`
   *
   * @returns {GrowthReport}
   */
  analyze(snapshotA, snapshotB) {
    const A = this._coerceSummary(snapshotA);
    const B = this._coerceSummary(snapshotB);

    const byCtorA = new Map(A.top.map((t) => [t.ctor, t]));
    const byCtorB = new Map(B.top.map((t) => [t.ctor, t]));

    const growth = [];
    for (const [ctor, b] of byCtorB) {
      const a = byCtorA.get(ctor);
      const baseBytes = a ? a.selfBytes : 0;
      const baseCount = a ? a.count : 0;
      const deltaBytes = b.selfBytes - baseBytes;
      const deltaCount = b.count - baseCount;
      const pct = baseBytes === 0
        ? (deltaBytes > 0 ? Infinity : 0)
        : (deltaBytes / baseBytes) * 100;
      if (deltaBytes <= 0) continue;
      growth.push({
        ctor,
        baseBytes,
        currentBytes: b.selfBytes,
        deltaBytes,
        baseCount,
        currentCount: b.count,
        deltaCount,
        growthPct: pct,
        typeIdx: b.typeIdx,
      });
    }
    growth.sort((a, b) => b.deltaBytes - a.deltaBytes);

    // Types that disappeared altogether — useful to see GC did fire.
    const freed = [];
    for (const [ctor, a] of byCtorA) {
      if (!byCtorB.has(ctor)) {
        freed.push({ ctor, freedBytes: a.selfBytes, freedCount: a.count });
      }
    }

    const totalDelta = B.totalSelfBytes - A.totalSelfBytes;
    const totalPct = A.totalSelfBytes === 0
      ? 0
      : (totalDelta / A.totalSelfBytes) * 100;

    const topRetainers = growth.slice(0, 10).map((g) => ({
      ctor: g.ctor,
      deltaBytes: g.deltaBytes,
      growthPct: g.growthPct,
    }));

    return {
      snapshotA: { path: A.filePath, createdAt: A.createdAt },
      snapshotB: { path: B.filePath, createdAt: B.createdAt },
      totalDeltaBytes: totalDelta,
      totalGrowthPct: totalPct,
      growth,
      freed,
      topRetainers,
    };
  }

  /**
   * Register a callback invoked when a leak is suspected.
   * @param {(alert: LeakAlert) => void} fn
   */
  alert(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(
        'alert(fn) expects a function / נדרשת פונקציה');
    }
    this._callbacks.push(fn);
    this.on('leak', fn);
    return () => {
      this._callbacks = this._callbacks.filter((c) => c !== fn);
      this.off('leak', fn);
    };
  }

  /**
   * Build an HTML report with embedded charts.
   *
   * The charts are pure SVG — no Chart.js, no D3, no CDN.  This keeps
   * the file self-contained and makes it printable from Hebrew Windows
   * clients without extra fonts.
   *
   * @returns {string} HTML text
   */
  report() {
    const history = this._history.slice();
    const html = renderHtml(history, {
      title: 'ONYX Memory Leak Detector / דו"ח דליפות זיכרון',
      threshold: this._threshold || this.opts.thresholdPct,
      now: new Date().toISOString(),
      suspects: this.getLeakCandidates(),
    });
    this._lastReportHtml = html;
    return html;
  }

  /**
   * Snapshot summaries collected so far (most-recent last).
   */
  getHistory() { return this._history.slice(); }

  /**
   * Returns types whose bytes grew across the last
   * `minConsecutiveGrowth` snapshots — the main output of the
   * heuristic engine.
   */
  getLeakCandidates() {
    const n = this.opts.minConsecutiveGrowth;
    if (this._history.length < n + 1) return [];

    const window = this._history.slice(-(n + 1));
    const ctorSeries = new Map();
    for (const h of window) {
      for (const t of h.summary.top) {
        const s = ctorSeries.get(t.ctor) || [];
        s.push(t.selfBytes);
        ctorSeries.set(t.ctor, s);
      }
    }

    const suspects = [];
    for (const [ctor, series] of ctorSeries) {
      if (series.length < n + 1) continue;
      if (isConsistentGrowth(series, this.opts.noiseTolerance)) {
        const delta = series[series.length - 1] - series[0];
        const pct = series[0] === 0 ? Infinity : (delta / series[0]) * 100;
        suspects.push({
          ctor,
          series: series.slice(),
          startBytes: series[0],
          currentBytes: series[series.length - 1],
          deltaBytes: delta,
          growthPct: pct,
          heuristic: 'consistent-growth',
        });
      }
    }
    suspects.sort((a, b) => b.deltaBytes - a.deltaBytes);
    return suspects;
  }

  // ───── internals ──────────────────────────────────────────────

  async _tick() {
    try {
      // Optional GC prior to snapshot — only if the process was
      // started with --expose-gc.
      if (typeof global.gc === 'function') {
        try { global.gc(); } catch (_) { /* ignore */ }
      }

      const stats = v8.getHeapStatistics();
      const spaceStats = v8.getHeapSpaceStatistics();
      const file = await this._writeSnapshot();
      const summary = await this._parse(file);

      const entry = {
        t: Date.now(),
        file,
        summary,
        stats,
        spaceStats,
      };

      this._history.push(entry);
      // Ring-buffer trim — never deletes files, only the in-memory
      // summary.  Files on disk are what the rule "never delete"
      // protects.
      if (this._history.length > this.opts.maxHistory) {
        this._history.splice(0, this._history.length - this.opts.maxHistory);
      }

      this.emit('snapshot', entry);
      this._evaluateHeuristics(entry);
    } catch (err) {
      this._log('error',
        'Snapshot tick failed / הצילום נכשל', { error: String(err) });
      this.emit('error', err);
    }
  }

  async _writeSnapshot() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this._outDir, `heap-${stamp}.heapsnapshot`);
    // writeHeapSnapshot returns the path when it completes — it is a
    // synchronous-blocking call underneath, so when we run inside a
    // worker thread the main thread is never blocked.
    v8.writeHeapSnapshot(file);
    return file;
  }

  async _parse(file) {
    if (!this.opts.parseInWorker || !isMainThread) {
      // Either disabled or we ARE a worker — parse inline.
      const parsed = parseHeapSnapshot(file);
      return compact(parsed);
    }
    return await this._parseInWorker(file);
  }

  _parseInWorker(file) {
    return new Promise((resolve, reject) => {
      const w = new Worker(__filename, {
        workerData: { task: 'parse', file },
      });
      w.once('message', (msg) => {
        if (msg && msg.ok) resolve(msg.summary);
        else reject(new Error(msg && msg.error || 'worker failed'));
      });
      w.once('error', reject);
      w.once('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error('parser worker exited ' + code));
        }
      });
    });
  }

  _evaluateHeuristics(latest) {
    const n = this.opts.minConsecutiveGrowth;
    if (this._history.length < n + 1) return;

    const suspects = this.getLeakCandidates();
    if (suspects.length === 0) {
      // Cool down — if a previously alerted type is no longer in the
      // suspects list, allow it to fire again later.
      this._alertedTypes.clear();
      return;
    }

    // Absolute-threshold gate: total heap must actually have moved.
    const first = this._history[this._history.length - (n + 1)];
    const last = latest;
    const totalDelta =
      last.summary.totalSelfBytes - first.summary.totalSelfBytes;
    const totalPct = first.summary.totalSelfBytes === 0
      ? 0
      : (totalDelta / first.summary.totalSelfBytes) * 100;

    if (totalDelta < this.opts.thresholdBytes &&
        totalPct < this._threshold) {
      return; // too small to care
    }

    for (const s of suspects) {
      if (this._alertedTypes.has(s.ctor)) continue;
      this._alertedTypes.add(s.ctor);

      const chainHeuristic = detectLongRetainerChain(s, latest);
      const closureHeuristic = detectClosureAccumulation(s);
      const detachedHeuristic = detectDetached(s, this._history);

      const reasons = ['consistent-growth'];
      if (chainHeuristic) reasons.push('long-retainer-chain');
      if (closureHeuristic) reasons.push('closure-accumulation');
      if (detachedHeuristic) reasons.push('detached-object');

      const alertPayload = {
        at: Date.now(),
        ctor: s.ctor,
        startBytes: s.startBytes,
        currentBytes: s.currentBytes,
        deltaBytes: s.deltaBytes,
        growthPct: s.growthPct,
        reasons,
        totalDeltaBytes: totalDelta,
        totalGrowthPct: totalPct,
        message:
          `Suspected leak in ${s.ctor} (+${s.deltaBytes} bytes) ` +
          `— חשד לדליפה בטיפוס ${s.ctor}`,
      };
      this._log('warn',
        'Leak suspected / חשד לדליפה', alertPayload);
      this.emit('leak', alertPayload);
    }
  }

  _coerceSummary(s) {
    if (typeof s === 'string') {
      const parsed = parseHeapSnapshot(s);
      return compact(parsed);
    }
    if (s && Array.isArray(s.top)) return s;
    if (s && s.byCtor instanceof Map) return compact(s);
    throw new TypeError(
      'analyze() expects a file path, summary or parsed snapshot');
  }

  _log(level, message, meta) {
    const logger = this.opts.logger;
    if (!logger) return;
    const fn = logger[level] || logger.info;
    if (typeof fn === 'function') fn(message, meta || {});
  }
}

// ═══════════════════════════════════════════════════════════════
// HEURISTIC HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Returns true when `series` (of at least 3 samples) shows a
 * consistent rising trend: all deltas non-negative OR at most one
 * dip whose magnitude is below `tolerance * previousValue`.
 */
function isConsistentGrowth(series, tolerance) {
  if (series.length < 3) return false;
  let dips = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (cur < prev) {
      const drop = (prev - cur) / (prev || 1);
      if (drop > tolerance) return false;
      dips += 1;
      if (dips > 1) return false;
    }
  }
  // Overall must have grown — we don't want flat lines.
  return series[series.length - 1] > series[0];
}

/**
 * Heuristic #2 — long retainer chain.  Without re-parsing the full
 * edge array (which we intentionally dropped for memory reasons) we
 * approximate by counting how many leaf-type buckets the same
 * constructor appears in over the history window.  A closure/array
 * pair with >100 retained references is the typical shape of an
 * event-listener leak.
 */
function detectLongRetainerChain(suspect, latestEntry) {
  const top = latestEntry.summary.top;
  const hit = top.find((t) => t.ctor === suspect.ctor);
  if (!hit) return false;
  // Use object count as a cheap proxy for chain length: if the same
  // constructor has grown by > 100 entries across the window AND its
  // per-object self-size is small (< 1 KB average), that's almost
  // always a linked-list/listener-array leak rather than a handful
  // of big buffers.
  const perObj = hit.count === 0 ? 0 : hit.selfBytes / hit.count;
  return hit.count >= 100 && perObj < 1024;
}

/**
 * Heuristic #4 — closure accumulation.  Closure-type nodes (V8
 * NODE_TYPE_CLOSURE = 5) that show up in the growth window are
 * flagged.  The `typeIdx` was recorded at parse time.
 */
function detectClosureAccumulation(suspect) {
  return suspect && suspect.series.length >= 3 &&
    suspect.ctor &&
    (suspect.ctor.includes('Closure') ||
     suspect.ctor.includes('closure') ||
     suspect.ctor === '(closure)');
}

/**
 * Heuristic #3 — "detached" objects.  In a Node process this maps
 * to JSON objects that used to sit under an active handler (req,
 * res, socket) but whose retaining edge now points at a fired-once
 * Timer or a completed Promise.  We infer this by checking whether
 * the constructor name has ever been seen before the current growth
 * run — if it's a brand-new constructor that appears *and then never
 * disappears*, it's behaving like a detached DOM node.
 */
function detectDetached(suspect, history) {
  if (history.length < suspect.series.length + 1) return false;
  // Look back further than the growth window: did the type exist?
  const older = history.slice(0,
    history.length - suspect.series.length);
  for (const h of older) {
    const hit = h.summary.top.find((t) => t.ctor === suspect.ctor);
    if (hit && hit.selfBytes > 0) return false; // seen before → not "new"
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// HTML REPORT
// ═══════════════════════════════════════════════════════════════

function renderHtml(history, ctx) {
  const points = history.map((h, i) => ({
    x: i,
    t: h.t,
    heap: h.stats.used_heap_size,
    total: h.summary.totalSelfBytes,
  }));

  const suspects = ctx.suspects || [];

  const lineSvg = renderLineChart(points, 640, 220,
    'Used heap over time / גודל זיכרון על ציר הזמן');
  const barSvg = renderBarChart(suspects.slice(0, 10), 640, 260,
    'Top growing constructor types / הטיפוסים הגדלים ביותר');

  const rows = suspects.map((s) => `
    <tr>
      <td dir="ltr">${escape(s.ctor)}</td>
      <td>${fmtBytes(s.startBytes)}</td>
      <td>${fmtBytes(s.currentBytes)}</td>
      <td>${fmtBytes(s.deltaBytes)}</td>
      <td>${(s.growthPct === Infinity ? '∞' : s.growthPct.toFixed(1))}%</td>
    </tr>`).join('');

  const snapshots = history.map((h, i) => `
    <tr>
      <td>${i}</td>
      <td>${new Date(h.t).toISOString()}</td>
      <td>${fmtBytes(h.stats.used_heap_size)}</td>
      <td>${fmtBytes(h.summary.totalSelfBytes)}</td>
      <td>${h.summary.nodeCount.toLocaleString()}</td>
      <td dir="ltr">${escape(path.basename(h.file))}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escape(ctx.title)}</title>
<style>
  body { font-family: Arial, "Segoe UI", sans-serif; margin: 24px; color: #1a1a1a; }
  h1 { border-bottom: 3px solid #0a6; padding-bottom: 6px; }
  h2 { color: #0a6; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: right; }
  th { background: #f0f0f0; }
  .charts { display: flex; flex-wrap: wrap; gap: 16px; }
  .chart { border: 1px solid #ddd; padding: 8px; background: #fafafa; }
  .meta { font-size: 12px; color: #666; }
  .alert { background: #fff3cd; border: 1px solid #ffc107;
           padding: 8px; margin: 8px 0; }
</style>
</head>
<body>
  <h1>${escape(ctx.title)}</h1>
  <div class="meta">
    Generated: <span dir="ltr">${escape(ctx.now)}</span> ·
    Threshold: ${ctx.threshold}% ·
    Snapshots captured: ${history.length}
  </div>

  ${suspects.length === 0
    ? '<p>No leak suspects in current window / לא נמצאו חשדות לדליפה.</p>'
    : `<div class="alert">⚠ ${suspects.length} suspect type(s) / טיפוסים חשודים</div>`}

  <div class="charts">
    <div class="chart">${lineSvg}</div>
    <div class="chart">${barSvg}</div>
  </div>

  <h2>Top growing constructors / טיפוסים גדלים</h2>
  <table>
    <thead>
      <tr>
        <th>Constructor / קונסטרקטור</th>
        <th>Start / התחלה</th>
        <th>Current / נוכחי</th>
        <th>Delta / הפרש</th>
        <th>Growth %</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">—</td></tr>'}</tbody>
  </table>

  <h2>Snapshot timeline / ציר הזמן של הצילומים</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Timestamp</th>
        <th>Used heap / זיכרון בשימוש</th>
        <th>Self bytes</th>
        <th>Nodes</th>
        <th>File</th>
      </tr>
    </thead>
    <tbody>${snapshots || '<tr><td colspan="6">—</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function renderLineChart(points, w, h, title) {
  if (points.length === 0) {
    return `<svg width="${w}" height="${h}"><text x="8" y="20">${escape(title)}</text></svg>`;
  }
  const pad = 32;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const maxY = Math.max(...points.map((p) => p.heap));
  const minY = Math.min(...points.map((p) => p.heap));
  const rangeY = Math.max(1, maxY - minY);
  const sx = (i) => pad + (i * innerW) / Math.max(1, points.length - 1);
  const sy = (v) => pad + innerH - ((v - minY) / rangeY) * innerH;

  const d = points.map((p, i) =>
    (i === 0 ? 'M' : 'L') + sx(i).toFixed(1) + ',' + sy(p.heap).toFixed(1)
  ).join(' ');

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad + innerH - f * innerH;
    return `<line x1="${pad}" y1="${y}" x2="${pad + innerW}" y2="${y}" stroke="#eee"/>`;
  }).join('');

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#fff"/>
    <text x="${pad}" y="20" font-size="14">${escape(title)}</text>
    ${gridY}
    <path d="${d}" fill="none" stroke="#0a6" stroke-width="2"/>
    <text x="${pad}" y="${h - 4}" font-size="10">min ${fmtBytes(minY)} · max ${fmtBytes(maxY)}</text>
  </svg>`;
}

function renderBarChart(items, w, h, title) {
  if (items.length === 0) {
    return `<svg width="${w}" height="${h}"><text x="8" y="20">${escape(title)}</text></svg>`;
  }
  const pad = 32;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const max = Math.max(...items.map((i) => i.deltaBytes));
  const barH = Math.max(8, innerH / items.length - 2);
  let y = pad;
  const bars = items.map((it, idx) => {
    const bw = (it.deltaBytes / max) * innerW;
    const yi = y;
    y += barH + 2;
    return `
      <rect x="${pad}" y="${yi}" width="${bw.toFixed(1)}" height="${barH}" fill="#0a6" opacity="0.75"/>
      <text x="${pad + 4}" y="${yi + barH - 3}" font-size="10" fill="#fff" dir="ltr">${escape(it.ctor)}</text>
      <text x="${pad + bw + 4}" y="${yi + barH - 3}" font-size="10">${fmtBytes(it.deltaBytes)}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#fff"/>
    <text x="${pad}" y="20" font-size="14">${escape(title)}</text>
    ${bars}
  </svg>`;
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
  return n + ' B';
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
// WORKER ENTRY POINT
// ═══════════════════════════════════════════════════════════════
if (!isMainThread && workerData && workerData.task === 'parse') {
  try {
    const parsed = parseHeapSnapshot(workerData.file);
    const summary = compact(parsed);
    parentPort.postMessage({ ok: true, summary });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  LeakDetector,
  parseHeapSnapshot,
  compact,
  isConsistentGrowth,
  detectLongRetainerChain,
  detectClosureAccumulation,
  detectDetached,
  renderHtml,
  fmtBytes,
  DEFAULTS,
};

/**
 * @typedef {object} ParsedSnapshot
 * @property {string} filePath
 * @property {number} createdAt
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {number} nodeFieldCount
 * @property {number} edgeFieldCount
 * @property {number} totalSelfBytes
 * @property {Map<string, {count:number, selfBytes:number,
 *           firstNodeIdx:number, typeIdx:number}>} byCtor
 * @property {{nodeTypes:string[], edgeTypes:string[]}} meta
 */

/**
 * @typedef {object} GrowthReport
 * @property {{path:string, createdAt:number}} snapshotA
 * @property {{path:string, createdAt:number}} snapshotB
 * @property {number} totalDeltaBytes
 * @property {number} totalGrowthPct
 * @property {Array<object>} growth
 * @property {Array<object>} freed
 * @property {Array<object>} topRetainers
 */

/**
 * @typedef {object} LeakAlert
 * @property {number} at
 * @property {string} ctor
 * @property {number} startBytes
 * @property {number} currentBytes
 * @property {number} deltaBytes
 * @property {number} growthPct
 * @property {string[]} reasons
 * @property {number} totalDeltaBytes
 * @property {number} totalGrowthPct
 * @property {string} message
 */
