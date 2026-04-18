# AG-X58 — Error Tracker (Sentry-like, self-hosted)

**Agent:** X-58  
**Swarm:** 3D  
**Project:** Techno-Kol Uzi · ONYX Procurement Mega-ERP 2026  
**Author:** Kobi EL  
**Date:** 2026-04-11  
**Status:** DELIVERED — 43/43 new tests pass, 11/11 legacy tests pass, zero external dependencies.

---

## 1. Summary (EN)

Agent X-58 delivers a fully self-hosted, Sentry-compatible error-tracking
subsystem for ONYX. The module lives at
`src/ops/error-tracker.js` and is zero-dep (Node built-ins only:
`fs`, `path`, `crypto`, `async_hooks`).

The existing legacy singleton API (shipped by an earlier swarm) is
**preserved byte-for-byte in behaviour**. A new `createTracker(opts)` factory
is added alongside it, so callers get an isolated instance with its own
ring buffer, issue store, breadcrumb trail, release history, and rate
counters. Both APIs can coexist in the same process.

## 1. סיכום (HE)

סוכן X-58 מספק מערכת מעקב שגיאות מלאה בסגנון Sentry, אך באירוח עצמי
ובאפס תלויות חיצוניות. הקובץ `src/ops/error-tracker.js` משתמש רק ב-
`fs`, `path`, `crypto` ו-`async_hooks` מספריית הליבה של Node.

ה-API הישן שנוצר בגלים קודמים נשמר במלואו; נוספה לצידו פברקית
`createTracker(opts)` שמחזירה אינסטנס מבודד עם Ring Buffer, מאגר issues,
breadcrumbs, היסטוריית releases ומוני rate. שתי הגישות יכולות לחיות
בו-זמנית באותו תהליך.

---

## 2. Files created / modified

| Path | Type | Notes |
|---|---|---|
| `src/ops/error-tracker.js` | EXTENDED | Added `createTracker()` factory and all X-58 features. Legacy singleton API preserved. |
| `test/payroll/error-tracker.test.js` | NEW | 43 unit-test cases (all pass) |
| `_qa-reports/AG-X58-error-tracker.md` | NEW | This report |

No files were deleted. The pre-existing test file `src/ops/error-tracker.test.js`
continues to pass (11/11) without modification.

---

## 3. Feature delivery matrix

| # | Spec requirement | Implemented in | Test |
|---|---|---|---|
| 1 | Capture exceptions with stack trace | `inst.captureException()` / `buildRichEvent()` | #2, #3 |
| 2 | Source map resolution (stub) | `resolveSourceMap()` | #39 |
| 3 | Breadcrumbs (recent actions) | `inst.addBreadcrumb()`, per-scope list | #6, #7, #8 |
| 4 | User context (id, email hash) | `scrubUserRich()` + `hashEmail()` | #9 |
| 5 | Request context (URL, headers sanitized, body sample) | `inst.errorHandler()` + `sanitizeHeaders()` + `sampleBody()` | #12, #13 |
| 6 | Environment context (service, version, env) | `cfg` passed into every `buildRichEvent()` | #14 |
| 7 | Fingerprinting (type + first frame + msg) | `fingerprintFor()` → `exceptionType + firstFrame + message` | #15, #16 |
| 8 | Grouping into issues | `upsertIssue()` → `Map<fingerprint, Issue>` | #17, #18 |
| 9 | Rate of occurrence | `bumpRate()` / `rateFor()` — per-minute, per-hour, per-day | #19 |
| 10 | Release tracking | `inst.markRelease(version, {commit})` | #20, #21 |
| 11 | Slack/email notification on new issues | `cfg.notify(issue, event)` hook, debounced 30 s | #23, #24 |
| 12 | Issue ownership (auto by file path) | `ownerFor(culprit)` + `cfg.ownershipRules` (regex/substring) | #25, #26 |
| 13 | Resolve / unresolve / ignore workflows | `resolveIssue`, `unresolveIssue`, `ignoreIssue`, `assignIssue` | #27, #28 |
| 14 | Release markers | `releases[]` + `listReleases()` | #20 |
| 15 | Regression detection | `upsertIssue()` flips `status` to `regressed` if a resolved issue reappears | #22 |
| 16 | Process-level uncaughtException hook | `installProcessHooks()` | #33 |
| 17 | Process-level unhandledRejection hook | `installProcessHooks()` | #34 |
| 18 | Express `errorHandler()` middleware | `inst.errorHandler()` — responds 500 JSON with HE+EN message | #31, #32, #40 |
| 19 | In-memory ring buffer (1000 events) | `ring[]` with modular head pointer | #4, #35 |
| 20 | JSONL file persistence | `persistLine()` → `errors.jsonl`, `issues.jsonl`, `releases.jsonl` | #36, #37 |
| 21 | Aggregate stats in memory | `inst.getStats()` | #30 |
| 22 | Query API for dashboards | `inst.queryEvents(filter)`, `inst.listIssues(filter)`, `inst.getIssue(id)` | #38 |

Every one of the 15 feature bullets from the task brief is backed by at
least one test. All 22 rows above map to passing cases.

---

## 4. Public API surface

```js
const { createTracker } = require('./src/ops/error-tracker');

const tracker = createTracker({
  service: 'onyx-procurement',
  version: 'onyx@2026.04.11',
  environment: 'production',
  logDir: '/var/log/onyx',
  ringBufferSize: 1000,
  breadcrumbLimit: 100,
  ownershipRules: [
    { pattern: /src[\\/]ops[\\/]/,     owner: 'team-ops' },
    { pattern: /src[\\/]payroll[\\/]/, owner: 'team-payroll' },
    { pattern: 'inventory',            owner: 'team-warehouse' },
  ],
  notify: (issue, event) => {
    // Plug in Slack / email / Teams
    slackPost(`#alerts-onyx`, `New issue ${issue.id}: ${issue.title}`);
  },
  persist: true,
});

// Capture
tracker.captureException(err, { request, user });
tracker.captureMessage('low disk', 'warning', { tags: { host: 'db-01' } });

// Context
tracker.setUser({ id: 'u-42', email: 'kobi@techno-kol.co.il' });
tracker.setTag('tenant', 'acme');
tracker.setContext('db', { version: '16.2' });
tracker.addBreadcrumb({ message: 'POST /orders', category: 'http' });

// Isolated scope
tracker.withScope((scoped) => {
  scoped.setTag('job', 'nightly-rollup');
  scoped.captureException(err);
});

// Issues
tracker.listIssues({ status: 'unresolved', owner: 'team-payroll' });
tracker.getIssue(issueId);
tracker.resolveIssue(issueId, 'kobi');
tracker.assignIssue(issueId, 'team-storage');

// Releases + regression
tracker.markRelease('onyx@2026.05.01', { commit: 'a1b2c3d', notes: 'monthly' });

// Dashboards
tracker.getStats();
tracker.queryEvents({ level: 'error', since: '2026-04-11', limit: 50 });

// Express
app.use(tracker.requestMiddleware());
app.use(tracker.errorHandler()); // responds 500 with {error:{message, message_he, status}}

// Process-level hooks
const uninstall = tracker.installProcessHooks();
// ... on shutdown:
uninstall();
```

---

## 5. Test results

### New suite — `test/payroll/error-tracker.test.js`

```
node --test test/payroll/error-tracker.test.js
...
ℹ tests 43
ℹ suites 0
ℹ pass 43
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~280
```

All 43 cases pass on the first run.

### Legacy suite — `src/ops/error-tracker.test.js`

```
node --test src/ops/error-tracker.test.js
...
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
```

Backward compatibility is intact.

---

## 6. Test catalogue (43 cases)

| # | Case | Area |
|---:|---|---|
| 1 | createTracker exposes all required methods | smoke |
| 2 | captureException returns eventId string | API |
| 3 | exception.type + stack preserved | stack |
| 4 | events land in ring buffer | storage |
| 5 | captureMessage info/warning/error | levels |
| 6 | addBreadcrumb stores recent actions | breadcrumbs |
| 7 | breadcrumb data PII-scrubbed | PII |
| 8 | breadcrumb limit enforced | breadcrumbs |
| 9 | user email hashed, id preserved | PII |
| 10 | setContext + setTag merge into event | context |
| 11 | withScope isolates tag/user | scopes |
| 12 | Express middleware sanitizes headers | PII |
| 13 | Express middleware samples body + scrubs PII | PII |
| 14 | service / version / env embedded | env |
| 15 | same frame → same fingerprint | grouping |
| 16 | different frame → different fingerprint | grouping |
| 17 | events grouped into one issue | grouping |
| 18 | issue has first_seen/last_seen/events_count/status | issue model |
| 19 | rate per_minute/hour/day | rate |
| 20 | markRelease records marker | release |
| 21 | new event tagged with new release | release |
| 22 | resolved issue regresses in new release | regression |
| 23 | notification fires once per new fingerprint (debounced) | notify |
| 24 | notification fires on regression | notify |
| 25 | ownership auto-assign regex | ownership |
| 26 | ownership auto-assign substring | ownership |
| 27 | resolve/unresolve/ignore workflow | workflow |
| 28 | assignIssue override | workflow |
| 29 | listIssues filter by status/owner/release | query |
| 30 | getStats aggregate | dashboards |
| 31 | Express errorHandler responds 500 JSON | Express |
| 32 | errorHandler safe when res is null | resilience |
| 33 | installProcessHooks uncaughtException | process |
| 34 | installProcessHooks unhandledRejection | process |
| 35 | ring buffer evicts oldest beyond capacity | storage |
| 36 | persistence writes events/issues/releases JSONL | persistence |
| 37 | persist:false disables JSONL writes | persistence |
| 38 | queryEvents filters level/fingerprint/release | query |
| 39 | source_map stub returns {resolved, stack, frames} | source maps |
| 40 | Express 500 body has Hebrew bilingual message | HE/EN |
| 41 | captureException(null) returns null | resilience |
| 42 | captureException(string) coerces to Error | resilience |
| 43 | legacy module-level API still exported | backward compat |

---

## 7. Design notes

### Zero deps

The file imports **only** Node built-ins:

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
```

No network client is hard-wired. Transports are supplied by the caller
via `opts.notify(issue, event)`, which is where Slack / email / Teams /
PagerDuty integrations plug in. That keeps this file dependency-free while
still allowing the operator to wire in whichever on-prem alerting stack
the factory uses.

### Safe-by-default

Every entry point is wrapped in a `try { … } catch (inner) { console.error(…); return null; }`
pattern. **The tracker must never break the host application.** Tests #32
and #41 explicitly verify this.

### PII scrubbing

- Keys containing `password`, `token`, `api_key`, `apikey`, `credit_card`,
  `creditcard`, `national_id`, `nationalid`, `tax_file`, `taxfile`,
  `secret`, `authorization`, `cookie`, `set-cookie` are replaced with
  `[REDACTED]` recursively. Hyphens and spaces in key names are
  normalised to underscores before matching.
- Request headers `authorization`, `cookie`, `set-cookie`, `x-api-key`,
  `x-auth-token`, `proxy-authorization` are sanitized.
- Email addresses are SHA-256 hashed (32-char prefix) rather than stored
  raw.
- Body payloads larger than 2 KB are truncated with a `[truncated]`
  marker.

### Fingerprinting

```
sha1( exceptionType + '|' + firstFrame + '|' + message )
```

This matches Sentry's default grouping: errors with the same type, same
top stack frame, and same message cluster into one issue; any of the
three changing spawns a new issue.

### Regression detection

When `upsertIssue` sees a fingerprint that was previously marked
`resolved`, it flips the status to `regressed` and records
`regressed_from = <current release>`. The notification hook fires once
per regression (debounced 30 s).

### Ring buffer

A fixed-size circular array with a single head pointer. O(1) insert,
O(N) read. Default capacity 1000 — configurable via
`ringBufferSize`. Test #35 verifies eviction.

### JSONL persistence

Three files in `opts.logDir`:

- `errors.jsonl`   — every captured event
- `issues.jsonl`   — every issue state change
- `releases.jsonl` — every `markRelease()`

The legacy single-file rotation logic (10 MB, keeps .1..5) is preserved
for the singleton API.

### Hebrew bilingual

The Express `errorHandler()` responds with:

```json
{
  "error": {
    "message": "Internal Server Error",
    "message_he": "שגיאה פנימית בשרת",
    "status": 500
  }
}
```

Test #40 asserts both strings are present.

---

## 8. Zero-dependency proof

```
$ grep -n "^const .* = require" src/ops/error-tracker.js
23:const fs = require('fs');
24:const path = require('path');
25:const crypto = require('crypto');
26:const { AsyncLocalStorage } = require('async_hooks');
```

Only Node built-ins. No `package.json` changes. No npm install required.

---

## 9. Compliance checklist

- [x] Never delete existing code or behaviour
- [x] Hebrew bilingual (Express 500 response, comments)
- [x] Zero external dependencies
- [x] 20+ test cases (delivered 43)
- [x] Real, executable code — not pseudocode
- [x] Report file present at `_qa-reports/AG-X58-error-tracker.md`
- [x] All spec features (1–15) implemented and tested
- [x] Express middleware + process-level hooks wired
- [x] Ring buffer + JSONL persistence + aggregate stats + query API

---

## 10. Deployment notes

To wire this into an ONYX server:

```js
const tracker = require('./src/ops/error-tracker').createTracker({
  service:     'onyx-procurement',
  version:     require('./package.json').version,
  environment: process.env.NODE_ENV || 'production',
  logDir:      process.env.ONYX_LOG_DIR || '/var/log/onyx',
  ownershipRules: [
    { pattern: /src[\\/]payroll/, owner: 'payroll@techno-kol.co.il' },
    { pattern: /src[\\/]ops/,     owner: 'ops@techno-kol.co.il' },
  ],
  notify: (issue, event) => {
    // Slack webhook, SMTP, Teams, whatever the operator uses.
  },
});

tracker.installProcessHooks();

app.use(tracker.requestMiddleware());
// ... routes ...
app.use(tracker.errorHandler()); // LAST middleware
```

On deploy, call `tracker.markRelease(version, { commit: GIT_SHA })`
exactly once per release so the regression detector has a reference point.

---

**End of report — Agent X-58 signing off.**
