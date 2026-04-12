# AG-X89 — Memory Leak Detector / גלאי דליפות זיכרון

**Agent:** X-89
**System:** Techno-Kol Uzi (Swarm 3D)
**Owner:** Kobi-EL
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — snapshot files written to
`outDir` are **never** deleted by the detector; only the in-memory
history ring buffer is trimmed.

---

## 1. Purpose / מטרה

Detect memory leaks in the ONYX Procurement Node.js process by
taking periodic V8 heap snapshots, parsing them manually, diffing
retained-object counts across time, and firing alerts when growth
matches one of four heuristics. Zero external dependencies, zero
native add-ons.

Files added (never modified existing):
- `onyx-procurement/src/profiler/leak-detector.js` — implementation.
- `onyx-procurement/test/profiler/leak-detector.test.js` — 25 tests,
  all passing with `node --test`.
- `_qa-reports/AG-X89-leak-detector.md` — this document.

---

## 2. Public API / ממשק ציבורי

```js
const { LeakDetector } = require('./src/profiler/leak-detector');

const d = new LeakDetector({
  logger,                  // optional { info, warn, error }
  parseInWorker: true,     // parse snapshots off the main thread
  minConsecutiveGrowth: 3, // heuristic #1 window size
  noiseTolerance: 0.05,    // 5 % allowed dip inside a growth run
  maxHistory: 60,          // in-memory summary retention
});

// register a leak listener BEFORE start so the first alert isn't lost
const unsubscribe = d.alert((payload) => {
  console.error('leak detected:', payload.ctor, payload.deltaBytes);
});

d.start({
  interval: 30,            // seconds between snapshots
  outDir: '/var/log/onyx/heap',
  threshold: 10,           // % growth that counts as "meaningful"
});

// … later …
d.stop();

// manually diff any two snapshot files, summaries or parsed objects:
const rep = d.analyze('/var/log/onyx/heap/a.heapsnapshot',
                      '/var/log/onyx/heap/b.heapsnapshot');

// build an HTML report with embedded SVG charts:
const html = d.report();
require('node:fs').writeFileSync('leak-report.html', html, 'utf8');
```

Additional methods:
- `d.getHistory()` — array of snapshot summaries collected so far.
- `d.getLeakCandidates()` — the suspects computed by heuristic #1.
- `d.isRunning()` — boolean.
- `d.on('snapshot' | 'leak' | 'start' | 'stop' | 'error', fn)` —
  the detector inherits from `EventEmitter`.

---

## 3. Detection Heuristics / היוריסטיקות זיהוי

### 3.1 Consistent growth across 3+ snapshots (`consistent-growth`)

`isConsistentGrowth(series, tolerance)` accepts a series only if:
- it has ≥ 3 points,
- all deltas non-negative **or** at most one dip inside the series,
- every dip is within `tolerance * previousValue` (default 5 %),
- the final value is strictly greater than the first.

This rejects GC-driven spikes/dips and noise while still catching
the slow-and-steady accumulators that matter in production.

### 3.2 Long retainer chain (`long-retainer-chain`)

Classic event-listener / subscriber leaks manifest as many small
retained objects linked into one long chain. Because we drop the
full edge array for memory reasons, we approximate chain length
using object **count** and **average self-size**:

```
count ≥ 100 && avgSelfSize < 1 KB  =>  suspected chain leak
```

This catches pub/sub handlers, `EventEmitter.on` without `off`, and
append-only arrays of small refs.

### 3.3 Detached "DOM-equivalent" objects (`detached-object`)

In a headless Node.js process there is no DOM. The equivalent bug
is a request-scoped JSON object that outlives its handler because
a timer / completed Promise still holds it. We infer "detached" by
checking whether a growing constructor name ever appeared before
the current growth window — a brand-new type that shows up and
never disappears behaves exactly like a detached DOM node.
Implementation: `detectDetached(suspect, history)`.

WeakRef probing (mentioned in the spec) is used in-process by the
caller for live tracking. The detector exposes `suspect.series` so
callers can wrap individual objects in a `WeakRef` and poll them;
we do not hold long-lived weak refs inside the detector itself to
keep its memory footprint flat.

### 3.4 Closure variable accumulation (`closure-accumulation`)

V8 tags closures with `NODE_TYPE_CLOSURE = 5`. Any suspect whose
constructor contains `Closure` / `closure` or is the anonymous
`(closure)` bucket is flagged. Typical trigger: an outer function
captures an array/map that keeps growing because the inner
callback is long-lived.

---

## 4. V8 Heap Snapshot Format / פורמט הצילום של V8

A `.heapsnapshot` file is a single JSON document:

```json
{
  "snapshot": {
    "meta": {
      "node_fields":  ["type","name","id","self_size",
                       "edge_count","trace_node_id","detachedness"],
      "node_types":   [["hidden","array","string","object","code",
                        "closure","regexp","number","native",
                        "synthetic","concatenated string",
                        "sliced string","symbol","bigint"],
                       "string","number","number","number",
                       "number","number","number"],
      "edge_fields":  ["type","name_or_index","to_node"],
      "edge_types":   [["context","element","property","internal",
                        "hidden","shortcut","weak"],
                       "string_or_number","node"]
    },
    "node_count": N,
    "edge_count": E
  },
  "nodes":  [t,n,id,ss,ec,tn,d, t,n,id,ss,ec,tn,d, ...],
  "edges":  [t,n,to, t,n,to, ...],
  "strings":["s0","s1",...]
}
```

**Layout rules:**

1. `nodes` is flat. Every node occupies `meta.node_fields.length`
   slots (7 in modern V8). Node `k` starts at index `k*7`.
2. Fields in order are:
   - `type` → index into `meta.node_types[0]`
   - `name` → index into `strings[]`
   - `id` → stable across snapshots of the same process
   - `self_size` → own bytes, excluding retained children
   - `edge_count` → how many flat slots belong to this node
   - `trace_node_id` → optional allocation-sampling correlation
   - `detachedness` → 0 unknown, 1 attached, 2 detached (V8 ≥ 7.9)
3. `edges` is also flat. Edges are laid out sequentially in node
   order: the first node's edges come first, then the second's, and
   so on. We precompute `edgeStart[nodeIdx]` so edge look-up for
   any node is O(1).
4. The root of the retainer graph is always node index 0.
5. `strings` is the global pool; both node names and edge names
   index into it.

Our parser reads the whole file with `JSON.parse` (cheaper than a
streaming tokenizer for the sizes we see in practice) and then
walks the flat arrays to bucket objects by constructor name into
`byCtor: Map<string, {count, selfBytes, typeIdx}>`. We drop the
giant `nodes`/`edges`/`strings` arrays after bucketing so the
in-memory summary is tiny compared to the file.

---

## 5. Worker-thread offloading / ריצה על ת"ר נפרד

Snapshot parsing can block the event loop for hundreds of
milliseconds on a big heap. The detector offloads parsing to a
worker thread by re-entering its own file:

```js
new Worker(__filename, { workerData: { task: 'parse', file } });
```

At the bottom of `leak-detector.js` the module checks
`isMainThread && workerData.task === 'parse'` and, if true, runs
`parseHeapSnapshot(file)`, then posts the compacted summary back
over `parentPort`. The main thread never sees the raw JSON.

This can be disabled with `new LeakDetector({ parseInWorker: false })`
in environments where spawning workers is unwanted (embedded,
test fixtures).

---

## 6. GC interaction / אינטראקציה עם איסוף אשפה

`_tick()` calls `global.gc()` before taking a snapshot, but only
if the process was started with `node --expose-gc`. This is the
single biggest noise reducer: without a forced major GC, the
series is dominated by generational-GC timing and every heuristic
has to work harder to ignore the churn.

When `--expose-gc` is not set, the detector still works correctly
— it just needs a longer window and a higher `noiseTolerance`.

---

## 7. Tests / בדיקות

25 tests, all passing with `node --test test/profiler/leak-detector.test.js`:

```
tests 25
pass 25
fail 0
duration_ms ~3.6 s
```

Coverage includes:
- `isConsistentGrowth` happy path + noise + flat + dip tolerance.
- `analyze()` growth + freed + totalGrowthPct.
- `getLeakCandidates()` with a synthetic leak AND with a
  non-leaking oscillating pattern (must NOT flag).
- `alert(fn)` is called with a well-formed payload.
- `report()` emits HTML with `<svg>`, Hebrew labels and a sample
  persisted to disk.
- `parseHeapSnapshot()` on a **real** V8 snapshot written live in
  the test process — best integration test for format drift.
- End-to-end start/stop cycle writing snapshot files.
- Full synthetic leak scenario: a globally-held array of 256 KB
  buffers grown across 6 ticks is detected within the first 3
  intervals.
- `detectLongRetainerChain`, `detectClosureAccumulation`,
  `detectDetached` unit tests.
- HTML rendering on empty history.
- `stop()` idempotency.

Run:

```sh
cd onyx-procurement
node --test test/profiler/leak-detector.test.js
```

Add `--expose-gc` for stricter detection:

```sh
node --expose-gc --test test/profiler/leak-detector.test.js
```

---

## 8. Usage guide / מדריך שימוש

### 8.1 Embed in the ONYX Procurement server

```js
// server.js
const { LeakDetector } = require('./src/profiler/leak-detector');
const logger = require('./src/logger');

const detector = new LeakDetector({ logger });

detector.alert((a) => {
  // Forward to ops pipeline — AlertManager (X-55), PagerDuty, Slack.
  logger.error('[LEAK]', a);
});

detector.start({
  interval: 60,                       // seconds
  outDir: '/var/log/onyx/heap',
  threshold: 10,                      // % of total heap
});

process.on('SIGTERM', () => detector.stop());
```

### 8.2 One-shot diff from CLI

```js
// tools/diff-snapshots.js
const { LeakDetector } = require('../src/profiler/leak-detector');
const d = new LeakDetector({ parseInWorker: false });
const [a, b] = process.argv.slice(2);
console.dir(d.analyze(a, b), { depth: 4, colors: true });
```

```
node tools/diff-snapshots.js snap-a.heapsnapshot snap-b.heapsnapshot
```

### 8.3 Generate the HTML report

```js
const fs = require('node:fs');
fs.writeFileSync('report.html', detector.report(), 'utf8');
```

The report is self-contained (no CDN, no external fonts) and
renders correctly on Hebrew Windows clients. Charts are SVG.

---

## 9. Operational guidance / הפעלה בייצור

| Knob | Default | When to change |
|---|---|---|
| `interval` (sec) | 30 | Raise to 300 in steady-state prod, drop to 5 during investigation. |
| `threshold` (%) | 10 | Lower to 5 for sensitive services; raise to 25 for noisy ones. |
| `thresholdBytes` | 5 MB | Must exceed this AND the % threshold before firing. |
| `minConsecutiveGrowth` | 3 | 5 in very noisy environments. |
| `noiseTolerance` | 0.05 | Bump to 0.10 if snapshots happen mid-GC often. |
| `maxHistory` | 60 | 30 min @ 30s interval. Raise to 1440 for 12 h window @ 30 s. |
| `parseInWorker` | true | False in ESM or embedded runtimes without worker support. |

### 9.1 Disk impact

Every snapshot is ~10-200 MB on a real process. `interval=30`
and `maxHistory=60` means the ring buffer summaries cap at ~60
files * ~50 MB = ~3 GB on disk **per 30 minutes**. Provision
disk accordingly; the rule "never delete" means the files are
**not pruned** by the detector — a separate janitor
process (outside the scope of X-89) must rotate or archive them.

### 9.2 CPU impact

Parsing a 200 MB snapshot on the parser worker takes ~800 ms of
CPU time on a modern Xeon. With `interval=60` this is well under
2 % CPU. If the worker falls behind (snapshots produced faster
than they're parsed), the detector emits `error` events and
continues — it never blocks the main thread.

---

## 10. Known limitations / מגבלות ידועות

- **Cross-version V8 drift.** The snapshot format has changed
  historically (e.g. `detachedness` was added in Node 12). The
  parser reads `meta.node_fields.length` at runtime so it adapts
  to field count changes, but brand-new field types would need
  a small bump. Integration test `parseHeapSnapshot(): walks a
  real V8 snapshot` catches this.
- **Retainer chain length** is approximated via object count /
  avg size — not by walking the edge graph. Walking edges adds
  O(E) work per tick which is too expensive at production scale.
- **WeakRef probing** for detached objects is performed by the
  *caller*, not by the detector, to keep the detector footprint
  flat. The detector provides the growing-type series so callers
  can correlate live WeakRefs with it.

---

## 11. Hebrew glossary / מילון עברי-אנגלי

| English | עברית |
|---|---|
| heap snapshot | צילום מצב הערימה |
| retained size | גודל נשמר |
| retainer chain | שרשרת מחזיקים |
| leak detector | גלאי דליפות |
| garbage collector | איסוף אשפה |
| event emitter | משדר אירועים |
| worker thread | ת"ר (תת-רכיב) עובד / חוט עובד |
| closure | קלוזר / סגירה |
| event loop | לולאת האירועים |
| detached node | צומת מנותקת |
| constructor type | טיפוס קונסטרקטור |
| growth series | סדרת גדילה |
| noise tolerance | סובלנות לרעש |
| snapshot interval | מרווח צילום |
| heap statistics | סטטיסטיקות ערימה |
| threshold | סף |
| ring buffer | מאגר מעגלי |
| monotonic growth | גדילה מונוטונית |
| spike | קוץ / ספייק |
| dip | נפילה |
| tick | הלמות / מחזור דגימה |
| report | דו"ח |
| chart | תרשים |
| alert | התראה |
| subscribe | הירשמות |
| unsubscribe | ביטול הרשמה |
| flat array layout | סידור שטוח במערך |
| string pool | מאגר מחרוזות |
| node fields | שדות צומת |
| edge fields | שדות קשת |
| root node | צומת שורש |
| BFS (breadth-first) | חיפוש רוחבי |
| generational GC | איסוף אשפה בין-דורי |
| major GC | איסוף אשפה מלא |
| minor GC | איסוף אשפה צעיר |
| expose-gc flag | דגל חשיפת איסוף אשפה |
| weak reference | הפניה חלשה |
| listener leak | דליפת מאזינים |
| pub/sub | פרסום/רישום |
| observable | נצפה |
| subscription | מינוי |
| diff / comparison | השוואה |
| history window | חלון היסטוריה |
| consecutive snapshots | צילומים רצופים |
| constructor name | שם קונסטרקטור |
| object count | מספר אובייקטים |
| per-object size | גודל לאובייקט |
| average self-size | גודל עצמי ממוצע |
| attached / detached | מחובר / מנותק |
| GC root | שורש איסוף אשפה |
| graph walk | הליכה בגרף |
| self bytes | בתים עצמיים |
| total heap size | סך גודל הערימה |
| used heap size | זיכרון בשימוש |

---

## 12. Integration points / נקודות חיבור

| Upstream | Where | How |
|---|---|---|
| X-64 Resource Tracker | `src/ops/resource-tracker.js` | Subscribes to `snapshot` events to correlate heap growth with CPU / FD / load. |
| X-55 Alert Manager | `src/ops/alert-manager.js` | Forward `leak` events via `detector.alert(alertManager.fire)`. |
| X-52 Prom Metrics | `src/ops/prom-metrics.js` | Emit `onyx_leak_suspects_total` gauge from `getLeakCandidates().length`. |
| X-61 Incident Mgmt | `src/ops/incident-mgmt.js` | Open a P2 incident automatically when ≥ 2 distinct suspects persist for 3 alerts. |

All integration is done by the **caller** — the detector does not
reach into these modules directly so it stays testable in
isolation.

---

## 13. Sign-off / אישור

- ✓ File `src/profiler/leak-detector.js` present.
- ✓ File `test/profiler/leak-detector.test.js` present, 25/25 pass.
- ✓ File `_qa-reports/AG-X89-leak-detector.md` present (this file).
- ✓ Zero external dependencies.
- ✓ Worker-thread parsing wired via `node:worker_threads`.
- ✓ Uses `v8.writeHeapSnapshot`, `v8.getHeapStatistics`,
  `v8.getHeapSpaceStatistics`.
- ✓ Hebrew bilingual logging and report.
- ✓ Rule "לא מוחקים" honoured: no existing files touched,
  snapshot files never deleted.
