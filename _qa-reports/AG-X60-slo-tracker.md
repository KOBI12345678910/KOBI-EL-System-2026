# AG-X60 — SLO / SLI Tracker with Error Budgets
**Agent:** X-60 | **Swarm:** 3D | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 33/33 tests green

---

## 1. Scope

Zero-dependency, Google-SRE-flavoured Service Level Objective engine for the
Techno-Kol Uzi / Onyx Procurement mega-ERP. It formalises the SLO/SLI/error-budget
vocabulary already informally present in `_qa-reports/QA-20-slo-targets.md` and
turns those documented targets into **live, queryable objects** with:

- budget math (consumed / remaining / eta-to-exhaustion),
- burn-rate queries across arbitrary lookback windows,
- the canonical Google SRE multi-window multi-burn-rate alert recipe,
- a client-facing dashboard feed with bilingual labels,
- a deploy-freeze policy hook for CI/CD,
- historical attainment reports for executive review.

The tracker speaks the vocabulary:

| Term              | Meaning                                                              |
|-------------------|----------------------------------------------------------------------|
| **SLI**           | *Measurement.* A ratio `good / total` over time-bucketed events.     |
| **SLO**           | *Target.* `SLI >= target` over a rolling window (7d / 30d / 90d).    |
| **SLA**           | *Legal agreement.* Not enforced here — the tracker emits evidence.  |
| **Error budget**  | `1 - SLO.target`. Failure allowance for the window.                  |
| **Burn rate**     | Observed-failure-rate / allowed-failure-rate. `1.0` = on-pace.       |

Delivered files
- `onyx-procurement/src/ops/slo-tracker.js` — the library (917 LOC)
- `test/payroll/slo-tracker.test.js` — 33 unit tests, zero external deps
- `_qa-reports/AG-X60-slo-tracker.md` — this report

RULES respected
- **Zero dependencies** — the library has no `require()` at all; tests use only
  `node:path` for cross-platform path resolution.
- **Hebrew bilingual** — every SLI / SLO / status tier / burn rule carries both
  `label_he` and `label_en` fields; the dashboard returns a bilingual title
  and each row includes bilingual status strings.
- **Never deletes** — recorded samples are append-only; the rolling window is
  implemented as a binary-search start pointer, not a dequeue. Historical
  attainment reports can still reach back to samples that have "aged out" of
  the live window.

---

## 2. Public API

```js
const slo = require('./src/ops/slo-tracker.js');

// ── 1. Definition ────────────────────────────────────────────
const sliId = slo.defineSLI('api_availability', null, null, {
  label_he: 'זמינות ה-API',
  label_en: 'API availability',
  description: '1 - (5xx / total) of HTTP responses',
});

const sloId = slo.defineSLO(
  'api_availability_30d', sliId,
  0.999,               // target
  '30d',               // window: '7d' | '30d' | '90d' | Nd | Nh | ms
  { label_he: 'זמינות 99.9% ל-30 יום', label_en: 'API availability 99.9% over 30d' }
);

// ── 2. Recording ─────────────────────────────────────────────
slo.record(sliId, { good: 999, total: 1000 });              // now
slo.record(sliId, { good: 0, total: 10, timestamp: 1710 }); // historical

// ── 3. Live state ────────────────────────────────────────────
slo.currentBudget(sloId);
// → { consumed_pct, remaining_pct, eta_exhaustion,
//     allowed_bad, observed_bad, good, total,
//     status: {key, label_he, label_en}, target, windowMs, windowKey }

slo.burnRate(sloId, 60 * 60 * 1000);   // burn rate over last hour

// ── 4. Alerting (Google SRE multi-burn) ──────────────────────
slo.evaluateMultiBurnAlerts(sloId);    // → [alerts fired]
slo.alertIfFastBurn(sloId, 14.4);      // single-rule convenience
slo.onAlert((alert) => sendPagerDuty(alert));
slo.onBudgetExhaustion((sloId) => freezeDeploys());

// ── 5. Deploy freeze policy hook ─────────────────────────────
if (slo.isDeployFrozen()) {
  // CI skips the deploy stage
}
slo.freezePolicy(false);              // disable globally (testing only)
slo.unfreeze('SLO-0001');             // thaw one SLO after a post-mortem

// ── 6. Historical attainment (for exec review) ───────────────
slo.attainment(sloId, {
  from: Date.now() - 28 * 86400_000,
  to: Date.now(),
  bucketMs: 6 * 3600_000,   // 6-hour buckets
});
// → { buckets: [{from,to,good,total,attainment,met}], overall, met_buckets, total_buckets }

// ── 7. Dashboard ─────────────────────────────────────────────
slo.dashboard();
// → { generatedAt, total, frozen, healthy, at_risk, exhausted,
//     rows: [{id,name,label_he,label_en,status,...,burn_1h,burn_6h,eta_exhaustion}],
//     title_he, title_en }

// ── 8. Seeded defaults ───────────────────────────────────────
slo.seedDefaultSLOs();
// Installs: apiAvailability, apiLatency, wageSlip, pdfLatency, taxExport, dbLatency
```

---

## 3. Seeded SLOs (defaults for the mega-ERP)

| Seed name          | SLI                                          | Target  | Window | Owner          |
|--------------------|----------------------------------------------|---------|--------|----------------|
| `apiAvailability`  | HTTP non-5xx / total                         | 99.9%   | 30d    | sre            |
| `apiLatency`       | Requests with p95 ≤ 500 ms                   | 99%     | 30d    | sre            |
| `wageSlip`         | Wage slip generation success                 | 99.9%   | 30d    | finance-ops    |
| `pdfLatency`       | PDF renders with p95 ≤ 3 s                   | 95%     | 30d    | sre            |
| `taxExport`        | Tax Authority export success                 | 99%     | 30d    | finance-ops    |
| `dbLatency`        | DB queries with p99 ≤ 100 ms                 | 99%     | 7d     | sre            |

All six SLOs carry bilingual Hebrew/English labels and map cleanly onto the
SLI sources already exported by `onyx-procurement/src/ops/metrics.js`:
`http_requests_total`, `http_request_duration_seconds`,
`payroll_slips_generated_total`, and `db_query_duration_seconds`.

Callers bridging real metrics to the tracker should record aggregated
`{good, total}` pairs on each scrape interval (e.g. once a minute). A 30-day
rolling window at 1-minute granularity is ~43k samples — trivially in-memory.

---

## 4. Status tiers

Status is derived from `remaining_pct` with an exhaustion short-circuit:

| Remaining budget | Status tier | `label_he` | `label_en`  |
|------------------|-------------|------------|-------------|
| ≥ 50%            | `healthy`   | תקין       | Healthy     |
| 25% – 50%        | `watch`     | במעקב      | Watching    |
| 10% – 25%        | `at_risk`   | בסיכון     | At risk     |
|  0% – 10%        | `burning`   | בוער       | Burning     |
| exhausted        | `exhausted` | מוצה       | Exhausted   |

The `exhausted` tier is the priority state: once `consumed_pct ≥ 1`, the
tracker reports `exhausted` regardless of the clamp on `remaining_pct`.

---

## 5. Alert recipe (Google SRE multi-window multi-burn-rate)

Implemented by `evaluateMultiBurnAlerts(sloId)`:

| Rule id    | Lookback | Budget burn | Severity | Deploy freeze? |
|------------|----------|-------------|----------|----------------|
| `fast_1h`  | 1 hour   | 2% of 30d   | page     | no             |
| `fast_6h`  | 6 hours  | 5% of 30d   | page     | no             |
| `slow_3d`  | 3 days   | 10% of 30d  | ticket   | **yes**        |

The rule trip condition is derived from the burn fraction and the SLO window:
a rule with `budgetBurn = 0.02` over a 1-hour lookback trips when
`burnRate(slo, 1h) >= 0.02 / (1h / windowMs)`. For the default 30-day window
that resolves to a burn rate of 14.4× allowed.

Each alert object has the shape:
```js
{
  id, slo_id, rule, burn_rate, threshold, severity,
  label_he, label_en, firedAt,
}
```

Listeners attached via `onAlert()` receive every alert (fast- and slow-burn).
Full budget exhaustion fires `onBudgetExhaustion()` exactly once per SLO —
the signal is re-armed by `unfreeze()` or `freezePolicy(false)`.

---

## 6. Test coverage — 33 cases, all green

| # | Area                              | Cases |
|---|-----------------------------------|-------|
| 1 | SLI/SLO definition + validation   | 6     |
| 2 | `record()` + ordering + guards    | 5     |
| 3 | `currentBudget` math + status     | 5     |
| 4 | `burnRate` math + guards          | 4     |
| 5 | Alerts (single + multi-burn)      | 4     |
| 6 | Deploy-freeze policy + listeners  | 3     |
| 7 | Historical attainment             | 2     |
| 8 | Dashboard composition + bilingual | 1     |
| 9 | Rolling window advance            | 1     |
| 10 | Seed SLOs — 6 canonical targets  | 1     |
| 11 | BURN_RULES catalog               | 1     |

```
Total: 33   Passed: 33   Failed: 0
All tests passed.
```

Run with:
```
node test/payroll/slo-tracker.test.js
```

The suite uses a deterministic injected clock via `slo._setNow(clock.now)`
and resets global state with `slo._resetForTests()` between environments,
so the tests are independent and order-insensitive.

---

## 7. Integration notes

### 7.1 Wiring into metrics.js
A follow-up integration (not in this ticket) would register a cron-style
poller that, every minute, aggregates `http_requests_total` into a
`{good, total}` pair and calls `slo.record(apiAvailabilitySliId, …)`. Same
for the four other metric-backed seeds.

### 7.2 Wiring into CI
```js
const slo = require('./onyx-procurement/src/ops/slo-tracker');
if (slo.isDeployFrozen()) {
  console.error('Deploy frozen: SLO budget exhausted');
  process.exit(42);
}
```

### 7.3 Wiring into the alert manager
```js
slo.onAlert((alert) => {
  // Forward to pino + Prometheus alertmanager webhook
  logger.error({ alert }, 'SLO burn alert');
  alertManager.fire(alert);
});
```

### 7.4 Wiring into the client dashboard
```js
app.get('/api/ops/slo', (_req, res) => res.json(slo.dashboard()));
```

The dashboard response includes bilingual titles and per-row status
labels, ready to render against either Hebrew or English locale.

---

## 8. Design decisions worth calling out

1. **Append-only samples, not a ring buffer.** The spec mandates "never
   delete," which rules out evicting aged-out samples. Instead the rolling
   window is a binary-search start pointer. Memory is bounded by the caller's
   recording cadence: at 1 sample/minute, a 90-day window is ~130k entries of
   ~50 bytes each = ~6 MB. Acceptable.

2. **`consumed_pct` can exceed 1.** `remaining_pct` is clamped to `[0, 1]`, but
   the raw `consumed_pct` surfaces how *over* budget a team is. Reports and
   post-mortems use this to quantify the miss.

3. **`eta_exhaustion` is a linear extrapolation.** The prediction uses the
   recent 1-hour failure rate (or the whole window if shorter), not a fancy
   time-series model, because the whole point is an *early warning*, not a
   precise estimate. When the on-call is paged at 2% in 1h, they have time to
   diagnose before the actual number matters.

4. **Listener errors are swallowed.** Alert and exhaustion listeners are
   untrusted: a throwing listener must not bring down budget accounting or
   suppress later alerts.

5. **`freezePolicy(false)` re-arms exhaustion.** After an incident, the
   post-mortem step is usually `slo.unfreeze('SLO-xxxx')`. Turning the whole
   freeze policy off is reserved for test environments.

6. **Status tier boundaries match QA-20.** `QA-20-slo-targets.md` §4 already
   documents release-risk bands at 50% / 25% / 10% remaining; the tracker's
   tiers snap to those same cut-offs.

---

## 9. Future work (out of scope)

- **Per-route SLOs.** `QA-20` open question #1 — a tighter target for
  `/api/payroll/*` and `/api/vat/*`. The current SLI model already supports
  it (define a separate SLI per route filter); only metric plumbing is
  missing.
- **Persistence.** Samples live only in-memory. A restart loses history.
  The obvious next step is to snapshot `state.slis` + `state.alerts` into
  `logs/slo-state.jsonl` on a timer, and rehydrate on boot.
- **Prometheus export.** Expose `slo_budget_remaining_ratio{slo="…"}` and
  `slo_burn_rate{slo="…",window="1h"}` as gauges on `/metrics`.
- **Alert deduplication.** Currently every call to `evaluateMultiBurnAlerts()`
  fires a fresh alert if the rule is still tripping. A "silence window" per
  rule would be the right next step.

---

## 10. Sign-off

| Role              | Name                         | Date        | Decision |
|-------------------|------------------------------|-------------|----------|
| Agent             | X-60 (Swarm 3D)              | 2026-04-11  | ready    |
| QA                | node test/payroll/slo-tracker.test.js | 2026-04-11 | 33/33 green |
| SRE lead          |                              |             |          |
| Owner             | Kobi Elkayam                 |             |          |

_SLOs are a promise the platform makes, not a promise the users make.
This tracker is the scoreboard — not the scorekeeper._
