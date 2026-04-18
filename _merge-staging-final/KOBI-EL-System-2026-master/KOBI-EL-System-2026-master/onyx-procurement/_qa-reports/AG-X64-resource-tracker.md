# Agent-X64 — Resource Usage Tracker / עוקב שימוש במשאבים

**Swarm:** 3D — Techno-Kol Uzi ERP (Kobi mega-ERP)
**Date:** 2026-04-11
**Agent:** X-64
**Status:** PASS — 27/27 tests green
**Language rule:** Hebrew + English bilingual throughout
**Dependency rule:** ZERO external deps — only `node:os`, `node:fs`, `node:path`,
`node:v8`, `node:perf_hooks`, `node:child_process`
**Never-delete rule:** respected — ring buffer evicts oldest only; persistence
to disk is append-only JSONL when `opts.persistPath` is supplied.

---

## 1. Scope / ייעוד

Deliver a real-time, zero-dependency resource-usage sampler that feeds
Prometheus (X-52), the alert manager (X-55), and application logs with
structured CPU/memory/disk/network/FD/process-tree/Node-runtime metrics,
including trend, prediction, leak detection, and top-K process listing.

Powers the Techno-Kol ERP's operational dashboards for the Swarm 3D
factory floor: process health, capacity planning, regression detection
after a release, and hands-off SRE alerting.

---

## 2. Files delivered / קבצים שנוצרו

| Path | Purpose |
| ---- | ------- |
| `onyx-procurement/src/ops/resource-tracker.js` | Sampler + ring buffer + regression engine (single file, 0 deps) |
| `onyx-procurement/test/payroll/resource-tracker.test.js` | 27 unit tests, `node --test` |
| `onyx-procurement/_qa-reports/AG-X64-resource-tracker.md` | This report |

No existing file was modified or removed. `error-tracker.js`, `metrics.js`,
and every other ops module are untouched.

---

## 3. Architecture / ארכיטקטורה

```
resource-tracker.js
├── RingBuffer          bounded, FIFO, O(1) push, chronological toArray()
├── summarize()         min/max/avg/p50/p95/p99 (unbiased quantile interp)
├── linearRegression()  slope, intercept, r² (normalized x-axis)
├── collectCpu()        delta-based utilization across samples
├── collectMemory()     RSS + heap (v8.getHeapStatistics) + usedPct
├── collectDisk()       fs.statfsSync per mount (win32 safe fallback)
├── collectNetwork()    /proc/net/dev on Linux, interface enum elsewhere
├── collectFileDescriptors()
├── collectProcessTree() Linux /proc, macOS ps, Windows wmic (best-effort)
├── collectNodeRuntime() v8 heap + perf_hooks ELU + resourceUsage
├── collectEventLoopLag() perf_hooks.monitorEventLoopDelay histogram
├── getMetricByPath()   dot-path + alias resolver ('cpu' -> cpu.utilizationPct)
└── class ResourceTracker
    ├── on/off/emit                    lightweight pub/sub
    ├── start() / stop()               idempotent, unref'd interval
    ├── sampleOnce()                   synchronous single capture
    ├── current() / history(seconds)
    ├── stats(metric, window)          windowed summary statistics
    ├── trend(metric, window)          rising | falling | flat (r²-gated)
    ├── predict(metric, steps)         linear extrapolation + confidence
    ├── detectLeak(metric, window)     heap-growth-based leak flag
    ├── topK(resource, k)              process tree sorted
    ├── setThreshold(metric, limit, onExceed, opts)
    ├── removeThreshold(id)
    ├── listThresholds()
    ├── _evaluateThresholds(sample)    streak-based sustain check
    ├── _severityFor(metric, v, l)     warning | high | critical
    ├── exportPrometheus()             textual block for /metrics scrape
    ├── exportJSON()                   persistable snapshot
    └── _injectSample() / _clearBuffer() (test hooks)
```

Single module, zero classes exposed outside the exports surface, no I/O
on hot paths beyond the collectors that are opt-in by platform.

---

## 4. Metrics coverage (the 8 groups required)

| Group | Source | Fields |
| ----- | ------ | ------ |
| 1. CPU | `os.cpus()` + delta | `userMs`, `sysMs`, `idleMs`, `niceMs`, `irqMs`, `utilizationPct`, `loadAvg.{1m,5m,15m}`, `perCore[]` |
| 2. Memory | `os`, `process.memoryUsage()`, `v8.getHeapStatistics()` | `totalBytes`, `usedBytes`, `freeBytes`, `availableBytes`, `usedPct`, `rssBytes`, `heapTotalBytes`, `heapUsedBytes`, `heapUsedPct`, `externalBytes`, `arrayBuffersBytes`, `heapSpaces[]` |
| 3. Disk | `fs.statfsSync` per mount | `mount`, `totalBytes`, `usedBytes`, `freeBytes`, `usedPct` |
| 4. Network | `/proc/net/dev` (Linux) + `os.networkInterfaces()` | `totalBytesIn/Out`, `totalErrors`, `totalDrops`, `deltaBytesIn/Out`, per-iface counters |
| 5. FD | `/proc/self/fd` + `/proc/self/limits` | `open`, `max`, `usedPct` |
| 6. Process tree | `/proc/*/status` (Linux), `wmic` (win32), `ps -A` (macOS) | `parentPid`, `count`, `children[{pid,name,rssBytes,cpuPct}]` |
| 7. Node runtime | `v8` + `perf_hooks.eventLoopUtilization` + `monitorEventLoopDelay` | `heap`, `heapSpaces`, `elu`, `eluPct`, `eventLoopLag.{mean,p50,p95,p99,max}Ms` |
| 8. Uptime | `process.uptime`, `os.uptime` | `processSec`, `osSec` |

Every group is read on every `sampleOnce()` tick. The collectors are
platform-aware and degrade gracefully (no throw) when a given proc file
or OS command is unavailable.

---

## 5. Features delivered

| Feature | Implementation |
| ------- | -------------- |
| Periodic sampling (default 5s) | `setInterval(...).unref()` so the tracker never holds the event loop open |
| Ring buffer of last N samples (default 1000) | `RingBuffer` class, O(1) push, chronological readout |
| Threshold alerts with sustained check | `setThreshold(metric, limit, onExceed, {op, sustain})`, `streak` counter, `firing` flag, auto-resolve on recovery |
| Trend detection | `trend()` uses linear regression on normalized x-axis, r² ≥ 0.5 gate, ±0.01%/sec dead-band |
| Prediction | `predict(metric, steps)` returns extrapolated value + r² confidence |
| Leak detection | `detectLeak()` flags when growthPct ≥ heapGrowthPct AND slope > 0 AND r² ≥ 0.5 over `leakWindowSec` |
| Top-K processes | `topK('cpu'|'mem'|'rss', k)` |
| Prometheus export | `exportPrometheus()` returns a text block ready for `/metrics` scrape — headers, TYPE, gauges for cpu/memory/disk/heap/fd/uptime |
| Alert Manager integration | `opts.alertManager.fire(alert)` called on every firing |
| Logger integration | `opts.logger.warn(...)` and `.info(...)` called on fire + resolve |
| Append-only persistence | `opts.persistPath` appends JSONL, never truncates |
| Bilingual errors | every user-facing `Error` has Hebrew + English concatenated |

---

## 6. Default thresholds

Installed automatically unless `opts.installDefaults === false`:

| Metric | Limit | Op | Sustain | Meaning |
| ------ | ----- | -- | ------- | ------- |
| `cpu` | 80 | `>` | 60 samples | >80% CPU sustained 5 min |
| `memory` | 85 | `>` | 1 | >85% memory used (immediate) |
| `disk` | 90 | `>` | 1 | >90% disk used (immediate) |
| `heap` | 85 | `>` | 1 | >85% V8 heap limit |
| `fd` | 80 | `>` | 1 | >80% of max file descriptors |
| `loopLagMs` | 100 | `>` | 6 samples | Event-loop p95 lag >100ms for 30s |

Users can add, replace, or remove any of these via `setThreshold` /
`removeThreshold` at runtime.

---

## 7. Public API surface

```js
const { createTracker } = require('./src/ops/resource-tracker');

const tracker = createTracker({
  intervalMs: 5000,
  bufferSize: 1000,
  mounts: ['/', '/var'],
  logger: console,
  alertManager: { fire: (alert) => sendToPagerDuty(alert) },
  persistPath: './logs/resource-samples.jsonl',
});

tracker.start();

tracker.on('sample', (s) => { /* every tick */ });
tracker.on('alert',  (a) => { /* threshold fired */ });
tracker.on('leak',   (l) => { /* heap leak detected */ });
tracker.on('trend',  (t) => { /* cpu/memory trend update */ });

tracker.setThreshold('cpu', 90, (alert) => escalate(alert), { sustain: 30 });

tracker.current();                   // latest sample
tracker.history(60);                 // last 60 seconds of samples
tracker.stats('cpu', 300);           // p95 etc. over 5 min
tracker.trend('memory.usedPct');     // rising|falling|flat
tracker.predict('memory.usedPct', 12); // 12 steps ahead
tracker.detectLeak('memory.heapUsedBytes', 600);
tracker.topK('mem', 5);

// Prometheus X-52 integration:
app.get('/metrics/resources', (_req, res) => {
  res.type('text/plain').send(tracker.exportPrometheus());
});
```

---

## 8. Integration hooks

- **Prometheus (Agent X-52)** — `exportPrometheus()` emits text
  block compatible with the existing registry in `src/ops/metrics.js`.
  Ten gauges exported: `onyx_cpu_utilization_pct`,
  `onyx_cpu_load_average_1m`, `onyx_memory_used_pct`,
  `onyx_memory_rss_bytes`, `onyx_heap_used_bytes`,
  `onyx_heap_used_pct`, `onyx_disk_used_pct{mount=...}`,
  `onyx_fd_open`, `onyx_fd_max`, `onyx_event_loop_p95_ms`,
  `onyx_uptime_process_seconds`, `onyx_uptime_os_seconds`.
- **Alert Manager (Agent X-55)** — Every firing is forwarded via
  `opts.alertManager.fire(alert)`. The alert object carries a bilingual
  `messageHe` + `messageEn`, `severity`, `metric`, `value`, `limit`,
  `sustain`, `streak`, `ts`.
- **Logs** — `opts.logger.warn` on fire, `opts.logger.info` on
  recovery. Both calls are try/caught so broken loggers never throw
  the sampler.

---

## 9. Algorithms

### 9.1 CPU utilization

Delta-based between two `os.cpus()` snapshots:

```
dBusy = (userʹ+sysʹ+niceʹ+irqʹ) - (user+sys+nice+irq)
dAll  = dBusy + (idleʹ - idle)
util% = dBusy / dAll · 100
```

First sample returns 0% (no previous point). Clamped to [0,100].

### 9.2 Linear regression

Closed-form least-squares:

```
slope      = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
intercept  = (Σy - slope·Σx) / n
r²         = 1 - SSᵣₑₛ / SSₜₒₜ        (0 when SSₜₒₜ == 0)
```

The `trend()` method normalizes x to seconds-since-first-sample before
running regression — raw epoch milliseconds cause catastrophic
cancellation in the `n·Σx² - (Σx)²` denominator because the values all
start with the same 13-digit prefix.

### 9.3 Leak detection

A series is flagged as leaking when **all three** of the following hold
over the configured window:

1. `growthPct = (last - first) / first · 100 >= heapGrowthPct`
   (default 10%)
2. `slope > 0`
3. `r² >= 0.5` (the trend is confident, not noise)

Returns `{ leaking, slope, growthPct, r², first, last, threshold }`
and emits a `'leak'` event when true.

### 9.4 Severity escalation

```
ratio = value / limit
ratio >= 1.20  → 'critical'
ratio >= 1.05  → 'high'
otherwise       → 'warning'
```

---

## 10. Test results

```
$ node --test test/payroll/resource-tracker.test.js
✔ 1. createTracker returns a ResourceTracker with default options
✔ 2. RingBuffer fills, wraps, and returns chronological order
✔ 3. sampleOnce populates CPU/memory/disk/fd/runtime metric groups
✔ 4. current() and history() return latest and windowed samples
✔ 5. stats() summarizes min/max/avg/p95 over a window
✔ 6. linearRegression produces correct slope for y = 2x + 1
✔ 7. trend() returns "rising" for monotonically increasing series
✔ 7b. trend() returns "falling" for decreasing series
✔ 8. predict() extrapolates future value from slope
✔ 9. detectLeak() fires on heap growing monotonically by >10%
✔ 10. detectLeak() does NOT fire on flat heap series
✔ 11. setThreshold fires alert when breached (sustain=1)
✔ 12. sustain=3 requires three consecutive breaches before firing
✔ 13. Threshold onExceed callback is invoked
✔ 14. opts.alertManager.fire is called when a threshold fires
✔ 15. opts.logger.warn is called when a threshold fires
✔ 16. removeThreshold removes it and further breaches do not fire
✔ 17. topK returns children sorted by resource descending
✔ 18. exportPrometheus produces a text block with headers
✔ 19. exportJSON returns a serializable snapshot
✔ 20. default thresholds install 6 thresholds
✔ 21. invalid constructor opts throw bilingual errors
✔ 22. getMetricByPath resolves aliases and dot-paths
✔ 23. start()/stop() are idempotent and do not throw
✔ 24. severity escalates from warning to high to critical
✔ 25. summarize() over empty array returns zeros
✔ 26. bilingual alert messages include Hebrew and English

ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ duration_ms 201
```

**27/27 green.** Above the 15-test minimum requested in the task (+12).

---

## 11. Test-by-area matrix

| Area | Tests covering it |
| ---- | ----------------- |
| Construction / options | 1, 20, 21 |
| Data structures | 2, 25 |
| Sampling | 3, 4 |
| Stats / summaries | 5, 25 |
| Math core | 6 |
| Trend | 7, 7b |
| Prediction | 8 |
| Leak detection | 9, 10 |
| Thresholds | 11, 12, 13, 16, 24 |
| External integrations | 14 (alertManager), 15 (logger) |
| Top-K | 17 |
| Export | 18, 19 |
| Aliases / paths | 22 |
| Lifecycle | 23 |
| Bilingual | 21, 26 |

---

## 12. Platform notes

| Platform | CPU | Mem | Disk | Net counters | FD | Process tree |
| -------- | --- | --- | ---- | ------------ | -- | ------------ |
| Linux | ✓ | ✓ | ✓ (`statfsSync`) | ✓ (`/proc/net/dev`) | ✓ (`/proc/self/fd`, `/proc/self/limits`) | ✓ (`/proc/*/status`) |
| macOS | ✓ | ✓ | ✓ (`statfsSync`) | counters N/A (interfaces only) | partial (getrlimit if present) | ✓ (`ps -A`) |
| Windows | ✓ | ✓ | ✓ (`statfsSync`) | counters N/A (interfaces only) | N/A | ✓ (`wmic process`) |

Where a metric is not available on a platform, the collector returns
sensible zeros rather than throwing, keeping the rest of the sample
intact.

**Test suite was run on Windows 11 Pro 26200.** All 27 tests green
despite the Windows-specific limitations above, proving the degraded
paths produce valid samples.

---

## 13. Safety rules respected

- **Zero external dependencies.** Only `node:*` built-ins. Verified by
  reading the `require()` block of the module — `os`, `fs`, `path`,
  `v8`, `perf_hooks`, `child_process`. No `package.json` additions.
- **Never delete.** Ring buffer evicts the oldest sample only on
  overflow (by design), and the append-only `persistPath` never
  rotates or truncates. Existing files on disk (`metrics.js`,
  `error-tracker.js`) were not touched.
- **Bilingual.** Every user-facing error goes through the `bilErr()`
  helper that concatenates Hebrew and English. Every alert carries
  both `messageHe` and `messageEn`. Verified by test #26.
- **Safe-by-default.** Sampler runs under `try`/`catch` and emits
  `'error'` events rather than throwing. Logger and alert-manager
  calls are wrapped in their own try/catch so a broken sink can never
  break the sampler.
- **Un-refed timers.** `setInterval(...).unref()` prevents the tracker
  from holding the Node.js event loop open at shutdown.

---

## 14. Follow-ups / רעיונות להמשך

- Add macOS FD collector via `lsof -p $$ | wc -l` (opt-in because
  `lsof` is slow).
- Add per-child CPU% on Linux using /proc/$PID/stat jiffies delta.
- Wire `tracker.exportPrometheus()` into the existing
  `src/ops/metrics.js` registry via a dynamic gauge `collectFn`.
- Persist ring-buffer to disk on `stop()` and reload on `start()`.
- Stream samples via EventEmitter for X-51 real-time dashboard.

None of the above are required for X-64 to ship; they are captured here
for the next agent picking up the ops track.

---

## 15. Verdict

**PASS — ready to merge.**
27/27 tests green; zero external dependencies; Hebrew + English
bilingual throughout; never-delete rule respected; all 8 required
metric groups collected; trend / prediction / leak detection working
with r²-gated regression; Prometheus + alert-manager + logger hooks
in place; 6 default thresholds installed as specified.
