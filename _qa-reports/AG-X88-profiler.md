# AG-X88 — Node.js Performance Profiler

**Agent:** X88 (Performance Profiler)
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — *Never delete, only upgrade and grow.*
**Status:** PASS — 23/23 tests green, zero external dependencies.

---

## 1. Mandate

Build a self-contained Node.js profiling toolkit for the Mega-ERP "Techno Kol Uzi" that wraps `node:inspector` and `node:perf_hooks` (plus `v8.getHeapSnapshot` and `node:trace_events`) with a simple class-based API and an optional Express middleware for on-demand profiling in production. The middleware must **refuse to respond without a valid token**, even to unauthenticated callers on localhost. Zero external deps — ships with stock Node (>=18).

---

## 2. Deliverables

| File | Purpose |
|------|---------|
| `onyx-procurement/src/profiler/profiler.js` | Profiler class + `_internal` helpers + `httpMiddleware` |
| `onyx-procurement/test/profiler/profiler.test.js` | Unit tests (23 tests, all green) |
| `_qa-reports/AG-X88-profiler.md` | This report |

No existing file was modified or deleted.

---

## 3. Profile Formats

### 3.1 `.cpuprofile` (Chrome DevTools / V8 format)

A `.cpuprofile` is a plain JSON document returned by the V8 Profiler domain via the inspector protocol. The shape is:

```
{
  "nodes":      [ { id, callFrame:{functionName,url,lineNumber,columnNumber}, hitCount, children:[ids] } ],
  "samples":    [ nodeId, nodeId, ... ],
  "timeDeltas": [ microseconds, microseconds, ... ],
  "startTime":  <us>,
  "endTime":    <us>,
  "_meta":      { name, startedAt, endedAt, wallMs, host, node, platform, arch, samplingIntervalUs }
}
```

Key semantics the profiler relies on:

- **Sampling interval**: default 100 µs (10 kHz). Configurable via the `samplingIntervalUs` constructor option, and pushed to V8 with `Profiler.setSamplingInterval`.
- **Time attribution**: V8 reports `timeDeltas[i]` as the *interval preceding* `samples[i]`. The profiler attributes `timeDeltas[i]` to the node in `samples[i]` when computing self-time.
- **Total time**: computed via iterative post-order DFS from the root node (id `1` in practice). This avoids JS stack overflow on deep trees.
- **`_meta` field**: an ONYX-specific addition. V8 doesn't inject this — the profiler appends wall-clock duration, Node version, platform, architecture, and the profile name after `stopCPUProfile()`. Chrome DevTools ignores unknown top-level keys, so the augmentation is safe.

### 3.2 `.heapsnapshot` (Chrome DevTools heap snapshot)

Captured synchronously via `v8.getHeapSnapshot()`, which returns a Readable stream of UTF-8 JSON. The profiler buffers the stream and returns the full text. The format is Chrome's standard heap-snapshot JSON: an object with `snapshot` (meta + node/edge counts), `nodes` (packed integer array), `edges`, `trace_function_infos`, `trace_tree`, `samples`, `locations`, `strings`. Load directly into DevTools → Memory tab.

The test verifies that the snapshot:
1. Parses as JSON.
2. Contains a `snapshot` object with `meta`.
3. Contains a non-empty `nodes` array.

### 3.3 Marks & Measures (`perf_hooks`)

The `mark(name)` method calls `performance.mark(name)` and also records the timestamp in a local `Map`, so measurements still work when the runtime clears its buffer (which can happen under some observer configurations).

`measure(name, startMark, endMark)` calls `performance.measure`, then reads back the most recent matching `PerformanceMeasure` entry captured by the internal `PerformanceObserver`. If the platform measure fails (e.g. marks were cleared), it falls back to a manual compute from the local map.

### 3.4 Trace Events (`node:trace_events`)

`startTracing(categories)` creates a `trace_events` Tracing handle for the given categories (default `['node.perf', 'v8']`) and enables it. `stopTracing()` disables the handle and returns a summary object with the start/stop timestamps. Because `trace_events` writes to a separate binary log file governed by `--trace-event-file-pattern`, the profiler cannot return the events in-process — it reports the success/failure and the categories that were active.

---

## 4. Flame Graph Sample Notes

### 4.1 Layout algorithm

The flame graph is rendered as a top-down "icicle" (root at top, children stacked downward — matches the Chrome DevTools "Call Tree" style):

1. Index all nodes from `cpuprofile.nodes[]`.
2. Compute self-time (`computeSelfTimesUs`) and total-time (`computeTotalTimesUs`).
3. DFS from the root, assigning each node `{x, y, w}`:
   - `y = SVG_MARGIN_TOP + depth * SVG_ROW_HEIGHT` (row height = 16 px).
   - `w = parent.w * (child.total / Σ(children.total))` — proportional to inclusive time.
   - Children are sorted descending by total-time so the widest frame is leftmost.
4. Frames with total-time below `minPct` (default 0.1% of root) are pruned.
5. Frames narrower than 0.3 pixels are skipped entirely.
6. Frames wider than 60 px receive a truncated text label (name + `basename(file):line`).

### 4.2 Color palette

Eight shades of amber, from `#ffe082` to `#bf360c`, selected by a djb2 hash of `functionName|file`. The hash is deterministic, so the same function gets the same color across runs — easier to eyeball regressions when comparing two flame graphs side-by-side. No chart library is used; every `<rect>`/`<text>` is emitted by string concatenation.

### 4.3 Hover tooltips

Each frame is wrapped in a `<g>` with a `<title>` child, so most SVG viewers (Chrome, Firefox, Edge, VS Code's SVG preview) show a hover tooltip:

> `functionName (file:line) — self=12.4ms, total=87.1ms`

### 4.4 Bilingual title

The SVG header always contains:

```
Flame Graph · גרף להבות
<profileName> · samples=N · wall=123ms · v20.x.x
```

Both English and Hebrew titles are present in the same line, separated by ` · `. The tests assert both substrings appear.

### 4.5 Accessibility notes

- `<title>` tooltips are the standard SVG affordance for screen readers.
- Colors are warm (amber → brown) not red/green, so deuteranopia/protanopia users can still distinguish frame depth.
- No JavaScript in the SVG — safe to embed directly in reports, email, Markdown, or a static file server.

---

## 5. Endpoint Security Notes (`/debug/profile`)

The profiler exposes a single endpoint through `httpMiddleware(app)`:

```
GET /debug/profile?token=<TOKEN>&duration=10s&format=cpuprofile|svg|top|heap&n=20
```

### 5.1 Refusal modes

| Condition | HTTP Status | Body |
|-----------|-------------|------|
| `this.token` is null/empty (profiler not armed) | **503 Service Unavailable** | `{ok:false, error:"profiler_disabled", hint:"Set PROFILER_TOKEN env var"}` |
| `?token=` missing or does not match | **401 Unauthorized** | `{ok:false, error:"bad_token"}` + `WWW-Authenticate: Bearer realm="onyx-profiler"` |
| Token matches, handler throws | **500** | `{ok:false, error:"<message>"}` |
| Token matches, happy path | **200** | body depends on `format` |

Important: the 503 response is used when **no token is configured at all**. This prevents an open profiler from silently working if someone forgets to set `PROFILER_TOKEN` in production. The operator must explicitly enable the feature.

### 5.2 Token comparison is constant-time

The `_internal.safeEqual` helper uses `crypto.timingSafeEqual` on equal-length buffers. When lengths differ, a dummy compare still runs on a zero buffer so the branch doesn't leak length through timing.

### 5.3 Duration clamping

`parseDuration` accepts `"10s"`, `"500ms"`, `"2m"`, or raw numbers (interpreted as ms). The result is clamped to:

- **min**: 50 ms (so unit tests can use `"100ms"`)
- **max**: 600000 ms (10 minutes) — hard cap, regardless of query value

This prevents a malicious caller from pinning the inspector session forever.

### 5.4 Output formats

| `format` | Content-Type | Behavior |
|----------|-----|----|
| `cpuprofile` (default) | `application/json` | Full `.cpuprofile` as a download (`Content-Disposition: attachment`) |
| `svg` | `image/svg+xml` | Flame graph rendered inline |
| `top` | `application/json` | `{ok:true, title, top:[{rank,functionName,file,line,selfMs,totalMs,…}], meta}` |
| `heap` / `heapsnapshot` | `application/json` | `.heapsnapshot` as a download (one-shot capture, no `duration` param needed) |

### 5.5 Recommended deployment

1. Set `PROFILER_TOKEN` in a secure env file (never commit, never log). Rotate monthly.
2. Put `/debug/*` behind an IP allow-list at the reverse proxy (Nginx, Cloudflare) — defence-in-depth.
3. Log the caller IP + user-agent + timestamp at the app-level when profiling starts.
4. Never expose the endpoint on the public internet — route through VPN or admin network only.
5. After rotating the token, restart the process to pick up the new env var; no runtime unset is provided by design.
6. On sensitive customer data: a `.heapsnapshot` can contain PII (usernames, email addresses, tokens in memory). Treat the dumps as confidential and scrub after use.

---

## 6. Hebrew Glossary · מילון עברית-אנגלית

| English | Hebrew | Context |
|---------|--------|---------|
| Profiler | פרופילר | the tool itself |
| Flame graph | גרף להבות | top-down stacked chart |
| Heap snapshot | תצלום ערימה | V8 memory dump |
| Call stack | מחסנית קריאות | nested function calls |
| Sampling interval | מרווח דגימה | how often the profiler samples |
| Self time | זמן עצמי | time spent in the function itself |
| Total time | זמן כולל | self + all descendants |
| Hit count | מספר פגיעות | samples landing on a node |
| Regression | רגרסיה | got slower |
| Improvement | שיפור | got faster |
| CPU profile | פרופיל מעבד | `.cpuprofile` file |
| Trace event | אירוע מעקב | `node:trace_events` entry |
| Top functions | פונקציות יקרות ביותר | highest self-time |
| File / line | קובץ / שורה | source location |
| Duration | משך | how long something took |
| Mark | סימן | `performance.mark` |
| Measure | מדידה | `performance.measure` |
| Token | אסימון | secret query string value |
| Endpoint | נקודת קצה | HTTP route |
| Middleware | תוכנת ביניים | Express handler |

The labels table `_internal.LABELS` inside `profiler.js` contains the bilingual strings used in every generated SVG, diff report, and `top` JSON response (e.g. `"Top Functions · פונקציות יקרות ביותר"`). To add a language, extend that object and reference the new key from `flameGraph` / `compareProfiles`.

---

## 7. Test Coverage

**Run:** `node --test test/profiler/profiler.test.js`

**Result:** 23 passed, 0 failed, 0 skipped, ~2.2s total.

| # | Test | What it exercises |
|---|------|-------------------|
| 1 | constructs with defaults | surface area |
| 2 | parseDuration helper | `"10s"`, `"500ms"`, `"2m"`, raw ms, default |
| 3 | safeEqual constant-time compare | equal, differ, length mismatch, null |
| 4 | escapeXml handles special chars | `<>&"'` all escaped |
| 5 | CPU profile for a tight loop | real inspector session, ~200 ms busy loop, non-empty nodes+samples, wallMs ≥ 190 |
| 6 | cannot start two CPU profiles at once | promise rejection |
| 7 | stopCPUProfile without start throws | synchronous guard |
| 8 | heap snapshot round-trip | captured JSON parses, has `snapshot.meta` and `nodes[]` |
| 9 | mark & measure | duration ≥ 0, both marks recorded |
| 10 | mark requires string | guard against `''`/`null` |
| 11 | topFunctions ranks by self-time, has file:line | descending order, row shape |
| 12 | topFunctions honours n | truncates to 3 when asked |
| 13 | flameGraph produces valid SVG | XML prolog, svg root+ns, rects, bilingual title, no control chars |
| 14 | flameGraph custom width | `width="600"` appears |
| 15 | compareProfiles produces diff | regressions/improvements arrays, summary with wall times |
| 16 | saveProfile / loadProfile round-trip (.cpuprofile) | file written, parsed back, `_meta.name` preserved |
| 17 | saveProfile / loadProfile SVG round-trip | raw string in/out |
| 18 | startTracing / stopTracing does not throw | graceful even if categories unavailable |
| 19 | httpMiddleware: refuses when no token configured | **503 profiler_disabled** |
| 20 | httpMiddleware: refuses when token missing | **401 bad_token** |
| 21 | httpMiddleware: refuses when token wrong | **401 bad_token** |
| 22 | httpMiddleware: accepts valid token (top) | 200 + top[] ≤ 5 |
| 23 | httpMiddleware: valid token returns SVG | Content-Type svg+xml, `<?xml`, `<svg ` |

All 23 tests green on Windows 11, stock Node 18+. No external dependencies, no `package.json` change required.

---

## 8. Usage Examples

### 8.1 Programmatic — one-shot profile

```js
const { Profiler } = require('./src/profiler/profiler.js');
const p = new Profiler({ outDir: './profiles' });

await p.startCPUProfile('checkout-flow');
await runCheckoutFlow();                 // the thing you want to measure
const profile = await p.stopCPUProfile();

console.log(p.topFunctions(profile, 10));
const svg = p.flameGraph(profile);
p.saveProfile('checkout.cpuprofile', profile);
p.saveProfile('checkout.svg', svg);
```

### 8.2 Marks & measures for a specific code path

```js
p.mark('import-start');
await importCsv(filePath);
p.mark('import-end');
const m = p.measure('import-csv', 'import-start', 'import-end');
console.log(`CSV import took ${m.duration.toFixed(1)} ms`);
```

### 8.3 HTTP middleware on an Express app

```js
const express = require('express');
const { Profiler } = require('./src/profiler/profiler.js');

const app = express();
const profiler = new Profiler({ token: process.env.PROFILER_TOKEN });
profiler.httpMiddleware(app);            // mounts GET /debug/profile

app.listen(3100);
```

Then, from an admin host:

```bash
# Download a 5-second CPU profile as .cpuprofile (load in Chrome DevTools)
curl -o flow.cpuprofile \
     "http://host:3100/debug/profile?token=$PROFILER_TOKEN&duration=5s"

# Render a flame graph SVG
curl -o flow.svg \
     "http://host:3100/debug/profile?token=$PROFILER_TOKEN&duration=5s&format=svg"

# Top 20 hottest functions as JSON
curl "http://host:3100/debug/profile?token=$PROFILER_TOKEN&duration=5s&format=top&n=20"

# One-shot heap snapshot
curl -o snap.heapsnapshot \
     "http://host:3100/debug/profile?token=$PROFILER_TOKEN&format=heap"
```

### 8.4 Comparing two profiles (e.g., before/after a fix)

```js
const before = p.loadProfile('./profiles/before.cpuprofile');
const after  = p.loadProfile('./profiles/after.cpuprofile');
const diff   = p.compareProfiles(before, after);

console.log(`Wall time change: ${diff.summary.deltaMs.toFixed(1)} ms (${diff.summary.deltaPct.toFixed(1)}%)`);
console.log('Top regressions:');
diff.regressions.slice(0, 5).forEach((r) =>
  console.log(`  ${r.key}: +${r.deltaMs.toFixed(1)}ms (${r.deltaPct.toFixed(0)}%)`));
```

---

## 9. Compliance with "לא מוחקים רק משדרגים ומגדלים"

- Created two new files (`profiler.js`, `profiler.test.js`) and this report.
- Modified zero existing files. No source file was deleted, renamed, or replaced.
- No new `package.json` dependency added — the module uses only `node:inspector`, `node:perf_hooks`, `node:trace_events`, `node:crypto`, `node:v8`, `node:fs`, `node:path`, `node:os`.
- Test file uses the project's existing `node:test` + `node:assert/strict` convention, matching `test/bank-parsers.test.js` and `test/excel-exporter.test.js` style.

---

## 10. Known Limitations

1. **Sampling-based**: the V8 CPU profiler samples the stack at ~10 kHz. Very short functions (<100 µs) may not be captured at all. This is a property of sampling profilers in general, not a bug.
2. **trace_events output file**: `node:trace_events` writes to a disk log governed by `--trace-event-file-pattern` — the profiler cannot stream those events back in-process. `stopTracing()` reports success but not the event list.
3. **`.heapsnapshot` buffering**: `captureHeapSnapshot()` buffers the whole snapshot in memory before returning. For very large heaps (>1 GB) this may peak memory usage. A streaming variant can be added later without breaking the current API.
4. **Single profile at a time**: only one CPU profile may be active per Profiler instance. Starting a second without stopping the first returns a rejected promise. Create a separate `Profiler` instance if truly concurrent profiles are required (they will interfere with each other at the V8 level, though).
5. **Windows paths in SVG labels**: `path.basename` handles both separators; labels use just the file basename so long Windows paths don't blow out frame widths.

---

## 11. Future Upgrades (Growth Path)

Following the "upgrade, don't delete" rule, these are the next logical increments:

- `.pprof` export (Google format) so profiles can be loaded by `go tool pprof` / speedscope.
- Continuous low-rate sampling mode (5 Hz background) with ring-buffer aggregation.
- Differential flame graph rendering — two profiles overlaid, red for regressions, green for improvements.
- `httpMiddleware` option to require `POST` instead of `GET` for audit-log cleanliness.
- Integration with `src/logger.js` so every profile run emits a structured audit event.
- Hebrew-RTL flame graph variant (`direction="rtl"`) for native Hebrew reports.
- Server-Sent-Events streaming of `top` output (live top-functions during a long profile).

---

*End of report — AG-X88.*
