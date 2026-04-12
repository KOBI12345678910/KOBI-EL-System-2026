# AG-X56 — Health Checks / Liveness / Readiness / Startup

**Agent:** X-56
**Module:** `onyx-procurement/src/ops/health-check.js`
**Tests:** `onyx-procurement/test/payroll/health-check.test.js`
**Project:** Techno-Kol Uzi (Swarm 3D) — Mega ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 42/42 tests passing
**Dependencies:** Zero (stdlib only: `fs`, `os`, `http`, `https`, `url`, `perf_hooks`)
**Bilingual:** Yes (Hebrew / English on every status label + message)

---

## 1. Summary / תקציר

Implemented a Kubernetes-style health-check subsystem for the ONYX Procurement
service. The module exposes four probe endpoints aligned with the standard
k8s contract:

| Endpoint           | Purpose                       | Meaning / משמעות                                |
|--------------------|-------------------------------|--------------------------------------------------|
| `/healthz/live`    | Liveness probe                | האם התהליך חי? / Is the process alive?            |
| `/healthz/ready`   | Readiness probe               | האם המערכת יכולה לקבל תנועה? / Can we serve traffic? |
| `/healthz/startup` | Startup probe                 | האם האתחול הושלם? / Has init completed?           |
| `/healthz`         | Aggregate human dashboard     | דו"ח מפורט / Full detailed report                 |

All responses return 200 for healthy or 503 for unhealthy, JSON body with a
bilingual `label: {en, he, text}` on every entry.

---

## 2. Files Delivered / קבצים שנמסרו

### Created

1. **`onyx-procurement/src/ops/health-check.js`** — 782 LOC
   Core module. Zero external deps.

2. **`onyx-procurement/test/payroll/health-check.test.js`** — 480 LOC
   42 tests covering every export + all built-in checks.

3. **`_qa-reports/AG-X56-health-checks.md`** — this file.

### Untouched

No existing files were modified or deleted (per project rule: *never delete*).

---

## 3. Public API / ממשק ציבורי

### Factory

```js
const { createHealthChecker } = require('./src/ops/health-check');

const checker = createHealthChecker({
  serviceName: 'onyx-procurement',
  version: '2026.1.0',
  environment: 'production',
  logger: console,
});
```

### Registration

```js
checker.registerCheck(name, fn, {
  timeout:   2000,   // ms, default 2 s
  cacheMs:   5000,   // re-use the last result for this long
  retries:   0,      // retry count on failure
  critical:  true,   // must-pass for readiness
  category:  'db',   // grouping tag
  tags:      {},     // free-form metadata
});

checker.unregisterCheck(name);
checker.setCriticalChecks(['db-ping', 'db-write']);
checker.listChecks();
```

### Probes

```js
checker.liveness();                    // sync, lightweight
await checker.readiness();             // runs critical checks
await checker.readiness({ includeAll: true });
checker.startup();
checker.markStartupComplete();
await checker.detailed();              // full human-readable report
```

### Express middlewares

```js
app.get('/healthz/live',    checker.livenessRoute());
app.get('/healthz/ready',   checker.readinessRoute());
app.get('/healthz/startup', checker.startupRoute());
app.get('/healthz',         checker.detailedRoute());

// or one-liner:
checker.mountRoutes(app, '/healthz');

// inflight tracker for graceful shutdown
app.use(checker.trackInflight());
```

### Background refresh

```js
checker.startHealthRefresh(15000);     // tick every 15 s
checker.stopHealthRefresh();
```

### Graceful shutdown

```js
checker.installSignalHandlers({
  drainMs: 10000,
  closers: [
    () => db.close(),
    () => supabase.disconnect(),
    () => server.close(),
  ],
});
// OR manual:
await checker.beginShutdown({ drainMs: 10000, closers: [...] });
```

---

## 4. Built-in Checks / בדיקות מובנות

| Factory              | Category | What it does                                              |
|----------------------|----------|-----------------------------------------------------------|
| `checkProcess()`     | process  | Always OK; returns pid, uptime, node version              |
| `checkMemory(pct)`   | memory   | Warn at (limit-10)%, fail at limit% of system memory      |
| `checkEventLoopLag()`| cpu      | Measures setImmediate lag; warn at half limit, fail at limit |
| `checkDiskSpace(path, minFreePct)` | disk | Uses `fs.statfs` (node ≥18.15); fail below threshold |
| `checkEnvVars([...])`| config   | Fails if any env var missing/empty                        |
| `checkConfig(fn)`    | config   | Wraps a user validator; catches throws                    |
| `checkCertificates(list)` | cert | Warn <30d to expiry, fail if expired                     |
| `checkQueueDepth(fn, threshold)` | queue | Warn at 80 %, fail at 100 %                           |
| `checkBackgroundJobs(map)` | job | Detects stuck / stale jobs                                |
| `checkDbPing(fn)`    | db       | Calls ping fn, reports latency + error                    |
| `checkDbWrite(fn)`   | db       | Probes write capability                                   |
| `checkHttpEndpoint(url, opts)` | external | GETs an HTTP(S) endpoint (tax authority, BOI, etc.) |

All factories return `{ status, category, message: {en, he, text}, details }`.

---

## 5. Status Taxonomy / טקסונומיית סטטוס

| Code       | EN       | HE          | Effect on readiness          |
|------------|----------|-------------|------------------------------|
| `ok`       | OK       | תקין        | ready                        |
| `warn`     | WARN     | אזהרה       | still ready (informational)  |
| `fail`     | FAIL     | כשל         | NOT ready (if critical)      |
| `unknown`  | UNKNOWN  | לא ידוע     | treated as informational     |

Aggregate precedence: `fail > warn > unknown > ok`.

---

## 6. Graceful Shutdown Flow / זרימת כיבוי חינני

1. SIGTERM / SIGINT received → `installSignalHandlers` handler fires.
2. `shuttingDown = true` → next `/healthz/ready` returns 503 immediately
   so the load balancer stops routing traffic.
3. `stopHealthRefresh()` halts background probing.
4. Wait up to `drainMs` (default 10 s) for `inflightRequests` to reach 0.
5. Run `closers[]` sequentially; errors in one closer do not abort the rest.
6. Call `exitFn(0)` (defaults to `process.exit(0)`).

---

## 7. Test Results / תוצאות בדיקה

Command: `node --test test/payroll/health-check.test.js`

```
ℹ tests       42
ℹ suites      0
ℹ pass        42
ℹ fail        0
ℹ cancelled   0
ℹ skipped     0
ℹ todo        0
ℹ duration_ms ~735
```

### Coverage breakdown (42 cases)

| # | Test                                                                       |
|---|----------------------------------------------------------------------------|
| 1 | createHealthChecker returns a HealthChecker with defaults                  |
| 2 | registerCheck stores the check with options                                |
| 3 | registerCheck rejects invalid args                                         |
| 4 | unregisterCheck removes a previously registered check                      |
| 5 | setCriticalChecks marks chosen checks as must-pass                         |
| 6 | liveness() returns OK when not shutting down                               |
| 7 | liveness() returns FAIL when shuttingDown=true                             |
| 8 | startup() reports FAIL until markStartupComplete()                         |
| 9 | readiness() returns OK when no critical checks are registered              |
| 10| readiness() returns FAIL when a critical check fails                       |
| 11| readiness() stays OK if a critical check returns WARN                      |
| 12| detailed() aggregates overall status using precedence                      |
| 13| runCheck enforces per-check timeout                                        |
| 14| runCheck retries up to N times before failing                              |
| 15| runCheck uses cache until cacheMs expires                                  |
| 16| _aggregate: fail > warn > unknown > ok                                     |
| 17| _withTimeout resolves fast path and rejects on timeout                     |
| 18| checkProcess built-in returns OK with pid & uptime                         |
| 19| checkMemory reports usage with numeric percent                             |
| 20| checkEventLoopLag returns OK under a generous limit                        |
| 21| checkEnvVars flags missing variables                                       |
| 22| checkConfig handles valid / invalid / thrown                               |
| 23| checkCertificates warns <30d, fails expired, OK far future                 |
| 24| checkQueueDepth OK/WARN/FAIL across threshold                              |
| 25| checkBackgroundJobs detects stuck jobs                                     |
| 26| checkDbPing reports OK/FAIL based on ping fn                               |
| 27| checkDbWrite fails on false/throw, OK on truthy                            |
| 28| checkHttpEndpoint hits a local HTTP server (OK/500/404/invalid URL)        |
| 29| livenessRoute handler returns 200 OK JSON                                  |
| 30| readinessRoute returns 503 when critical check fails                       |
| 31| detailedRoute returns 200 when all green                                   |
| 32| mountRoutes attaches four routes to an Express-like app                    |
| 33| beginShutdown sets ready=false and drains inflight                         |
| 34| trackInflight middleware increments/decrements counter                     |
| 35| beginShutdown executes provided closers sequentially                       |
| 36| beginShutdown keeps running closers even if one throws                     |
| 37| _bilingual wraps EN+HE with combined text                                  |
| 38| startHealthRefresh triggers runAll at interval                             |
| 39| runAll() runs every registered check and returns array                     |
| 40| detailed() groups results by category with bilingual labels                |
| 41| readiness() ignores unknown critical names without throwing                |
| 42| readiness({includeAll:true}) runs all checks regardless of critical flag   |

All 42 pass. Well above the required 20+.

---

## 8. Wiring Example / דוגמת חיבור

Here is the minimal snippet to wire the checker into the existing server.js:

```js
const express = require('express');
const {
  createHealthChecker,
  checkMemory,
  checkEventLoopLag,
  checkDiskSpace,
  checkEnvVars,
  checkDbPing,
  checkDbWrite,
  checkHttpEndpoint,
} = require('./src/ops/health-check');

const db = require('./src/db/pool');     // existing onyx db module

const checker = createHealthChecker({
  serviceName: 'onyx-procurement',
  version: process.env.SERVICE_VERSION,
  environment: process.env.NODE_ENV,
  logger: console,
});

// Built-ins
checker.registerCheck('process',    () => ({ status: 'ok' }),                   { category: 'process' });
checker.registerCheck('memory',     () => checkMemory(90),                      { category: 'memory' });
checker.registerCheck('event-loop', () => checkEventLoopLag(100),               { category: 'cpu' });
checker.registerCheck('disk',       () => checkDiskSpace(process.cwd(), 10),    { category: 'disk', cacheMs: 30000 });
checker.registerCheck('env-vars',   () => checkEnvVars(['DATABASE_URL','SUPABASE_URL']), { category: 'config' });

// DB
checker.registerCheck('db-ping',
  () => checkDbPing(() => db.query('SELECT 1').then(() => true)),
  { critical: true, category: 'db', timeout: 2000, cacheMs: 5000, retries: 1 });

checker.registerCheck('db-write',
  () => checkDbWrite(() => db.query("INSERT INTO _healthz(ts) VALUES(now()) ON CONFLICT DO NOTHING").then(() => true)),
  { critical: true, category: 'db', timeout: 3000, cacheMs: 10000 });

// Supabase + external APIs
checker.registerCheck('supabase',
  () => checkHttpEndpoint(process.env.SUPABASE_URL + '/rest/v1/', { timeout: 3000, label: 'supabase' }),
  { critical: true, category: 'external', cacheMs: 15000 });

checker.registerCheck('tax-authority',
  () => checkHttpEndpoint('https://www.misim.gov.il/shaam/', { timeout: 5000, label: 'tax-authority' }),
  { critical: false, category: 'external', cacheMs: 60000 });

checker.registerCheck('bank-of-israel',
  () => checkHttpEndpoint('https://www.boi.org.il/', { timeout: 5000, label: 'boi' }),
  { critical: false, category: 'external', cacheMs: 60000 });

// Mark critical set (optional, but explicit)
checker.setCriticalChecks(['db-ping','db-write','supabase']);

// Start periodic refresh so probes are cheap.
checker.startHealthRefresh(15000);

// Mount routes + inflight tracking
const app = express();
app.use(checker.trackInflight());
checker.mountRoutes(app, '/healthz');

// After all init is done:
checker.markStartupComplete();

// Graceful shutdown
checker.installSignalHandlers({
  drainMs: 10000,
  closers: [
    () => new Promise((r) => app.listen && app.listen.close(r)),
    () => db.end(),
  ],
});
```

---

## 9. Compliance Notes / הערות תאימות

- **Zero dependencies.** Only Node stdlib (`fs`, `os`, `http`, `https`, `url`, `perf_hooks`).
- **Never deletes anything.** Registering/unregistering only touches the checker's
  in-memory map.
- **Bilingual.** Every user-facing label includes `{en, he, text}` — text dashboards
  can use the combined `text` field or pick per locale.
- **Production-safe.** Timeouts, retries, per-check caching, request coalescing
  (identical in-flight calls share the same promise), and category-grouped
  reporting avoid hammering downstream deps.
- **K8s-ready.** Liveness returns 200 until explicit shutdown; readiness returns
  503 immediately when `shuttingDown` so the LB drains traffic.

---

## 10. Verification Commands / פקודות אימות

```bash
cd onyx-procurement
node --test test/payroll/health-check.test.js
# → 42 pass, 0 fail, 0 skipped
```

**End of report.**
