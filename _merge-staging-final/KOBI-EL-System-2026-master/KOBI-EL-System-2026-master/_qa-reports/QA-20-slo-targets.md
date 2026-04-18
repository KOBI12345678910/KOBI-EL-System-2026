# QA-20 — Service Level Objectives (SLO) Targets

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Agent       | QA-20 Monitoring & Post-Release Agent                        |
| Owner       | Techno-Kol Uzi / Kobi Elkayam Real Estate                    |
| Doc type    | Service Level Objectives — targets, windows, error budgets   |
| Scope       | Onyx Procurement + Techno-Kol Ops + payroll + VAT            |
| Last update | 2026-04-11                                                   |
| Related     | `QA-20-monitoring-plan.md`, `QA-20-post-release-checklist.md`, `QA-20-incident-response.md` |

> **Rule:** these SLOs are promises **the platform makes to its users**, not promises the users make to the platform. They are tight enough to be meaningful, loose enough to be achievable, and short enough to be measurable without a custom stack. Every number below is derived from an already-exported metric in `onyx-procurement/src/ops/metrics.js` or from a log selector against the existing pino / error-tracker pipeline.

---

## 1. SLO philosophy

1. **Every SLO has an SLI (indicator), a target, a window, and a burn-rate policy.**
2. **SLOs are versioned.** Every release may tune them, but never silently. The change must land as an edit to this file and be signed off on by the owner.
3. **The SLO is a ceiling, not a floor.** Meeting the SLO does not mean the system is well — it means it is not failing badly enough to require a response. Engineering priorities should still push for "better than SLO."
4. **Compliance SLOs are not negotiable.** Payroll and VAT targets are **100% / 0 failures**, full stop, because the legal deadline for each is a binary event: either the submission happened on time or the business is in violation.
5. **Error budgets unlock risk.** If a window is well within budget, the team may take on more release risk; if a window is near exhaustion, the team freezes risky releases until the window resets.

---

## 2. SLO catalogue

### 2.1 Availability — API reachability

| Field              | Value                                                                                       |
|--------------------|---------------------------------------------------------------------------------------------|
| SLI                | `1 - (sum(rate(http_requests_total{status=~"5.."}[28d])) / sum(rate(http_requests_total[28d])))` |
| Target             | **99.9%**                                                                                   |
| Window             | Rolling 28-day window                                                                       |
| Error budget       | **0.1% of requests** (≈ 40.32 min of "fully 5xx" over 28 days)                              |
| Measurement source | `http_requests_total` from `metrics.js`                                                     |
| Owner              | SRE                                                                                         |
| Rationale          | 99.9% is the standard "three nines" for an internal-facing ERP. It is aggressive enough to rule out repeated multi-minute outages, but loose enough to absorb one or two bad releases per month without freezing deploys. |

### 2.2 Latency — HTTP request duration

| Field              | Value                                                                                                       |
|--------------------|-------------------------------------------------------------------------------------------------------------|
| SLI                | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[28d])))`                   |
| Target             | **p95 < 500ms**                                                                                             |
| Secondary target   | **p99 < 2s**                                                                                                |
| Window             | Rolling 28-day window, evaluated every 5 minutes                                                            |
| Measurement source | `http_request_duration_seconds` from `metrics.js`                                                           |
| Owner              | SRE                                                                                                          |
| Rationale          | Buckets `[0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]` from `metrics.js` give us 500ms and 2s as exact bucket edges, which means the histogram quantile is precise at those points (no interpolation error). |

### 2.3 Latency — DB queries

| Field              | Value                                                                                       |
|--------------------|---------------------------------------------------------------------------------------------|
| SLI                | `histogram_quantile(0.95, sum by (le) (rate(db_query_duration_seconds_bucket[28d])))`       |
| Target             | **p95 < 250ms**                                                                             |
| Secondary target   | **p99 < 1s**                                                                                |
| Window             | Rolling 28-day window                                                                       |
| Measurement source | `db_query_duration_seconds` from `metrics.js`                                               |
| Owner              | SRE + DB owner                                                                              |
| Rationale          | HTTP p95 is 500ms, so DB p95 must be materially lower for the rest of the request (serialization, middleware, response render) to fit inside 500ms without eating the budget by itself. |

### 2.4 Payroll success rate — **compliance SLO**

| Field              | Value                                                                                        |
|--------------------|----------------------------------------------------------------------------------------------|
| SLI                | `sum(increase(payroll_slips_generated_total{status="failed"}[30d]))`                         |
| Target             | **0 failed slips per calendar month**                                                        |
| Window             | Calendar month (not rolling — it aligns with the 9th-of-month legal deadline)                |
| Measurement source | `payroll_slips_generated_total{status}` from `metrics.js`                                    |
| Owner              | finance-ops + SRE                                                                            |
| Rationale          | The Israeli Income Tax Ordinance requires an employer to hand each employee a payslip no later than the 9th day of the following month. A failed slip that is not remediated before the 9th is a regulatory violation. There is no acceptable failure rate. |
| Burn rule          | Any single failure at any time is a SEV-1 (see `QA-20-incident-response.md` §2.7)            |

### 2.5 VAT export success rate — **compliance SLO**

| Field              | Value                                                                                         |
|--------------------|-----------------------------------------------------------------------------------------------|
| SLI                | `sum(increase(vat_exports_total{status="failed"}[30d]))`                                      |
| Target             | **0 failed exports per reporting period** (monthly for PCN874, annual for 6111)               |
| Window             | Aligned to each period boundary                                                                |
| Measurement source | `vat_exports_total{status}` from `metrics.js`                                                 |
| Owner              | finance-ops + SRE                                                                             |
| Rationale          | PCN874 is due by the 15th of the month. Form 6111 is an annual return. A failed export that is not remediated before the deadline is a regulatory violation. |
| Burn rule          | Any single failure is a SEV-1 (see `QA-20-incident-response.md` §2.8)                          |

### 2.6 Backup SLO

| Field              | Value                                                                                      |
|--------------------|--------------------------------------------------------------------------------------------|
| SLI                | `time() - backup_last_success_timestamp`                                                   |
| Target             | **< 25 hours**                                                                             |
| Window             | Instantaneous (always)                                                                      |
| Measurement source | `backup_last_success_timestamp` gauge (referenced by the existing `MissingDailyBackup` rule)|
| Owner              | SRE + DBA                                                                                   |
| Rationale          | 24 hours is the business requirement; the 1-hour grace matches the existing alert rule. |

### 2.7 Audit trail durability SLO

| Field              | Value                                                                                  |
|--------------------|----------------------------------------------------------------------------------------|
| SLI                | `count('[audit] DB insert failed' log lines over 30d) / count(audit writes over 30d)`  |
| Target             | **< 0.01%** (i.e. < 1 failure in 10,000 writes)                                        |
| Window             | Rolling 30-day window                                                                  |
| Measurement source | pino stderr (`[audit]` prefix) + `audit_logs` row count                                |
| Owner              | compliance + SRE                                                                       |
| Rationale          | `withAudit` is fire-and-forget by design (business request is not blocked on audit write), but the compliance contract is that audit trails are durable. The 0.01% target is loose enough to absorb transient DB hiccups but tight enough that sustained audit loss triggers a response. |

### 2.8 Error budget policy (composite)

| Burn rate             | Trigger                                                                 | Response                                       |
|-----------------------|-------------------------------------------------------------------------|------------------------------------------------|
| **Fast burn (1h)**    | Budget burn of > **2%** in any 1-hour window                            | Page on-call, declare SEV-2 minimum            |
| **Fast burn (6h)**    | Budget burn of > **5%** in any 6-hour window                            | Page on-call, declare SEV-2 minimum            |
| **Slow burn (3d)**    | Budget burn of > **10%** over any rolling 3-day window                   | Notify SRE lead, **release freeze** on risky changes until the burn stops |
| **Budget exhausted**  | 100% of 28-day budget consumed                                          | **Release freeze on all non-fix changes** until budget resets |

The fast-burn thresholds (2% in 1h, 5% in 6h) are the standard Google SRE multi-burn-rate recipe tuned for a 99.9% monthly target. They guarantee that any outage big enough to threaten the monthly budget is detected within an hour.

---

## 3. SLO dashboard panels (Grafana)

Panels expressed as Prometheus expressions. These plug into the "Operations dashboard" specified in `QA-20-monitoring-plan.md` §5.2.

### 3.1 Availability burn gauge

```promql
1 - (
  sum(rate(http_requests_total{status=~"5.."}[28d]))
  /
  sum(rate(http_requests_total[28d]))
)
```

Display as a big number. Green above `0.999`, amber below, red below `0.995`.

### 3.2 Latency p95 timeseries

```promql
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

Horizontal line at `0.5` (the target).

### 3.3 Error budget remaining

```promql
1 - (
  (
    sum(increase(http_requests_total{status=~"5.."}[28d]))
    /
    sum(increase(http_requests_total[28d]))
  )
  /
  0.001
)
```

Display as a percentage gauge. `100%` = fresh budget, `0%` = exhausted.

### 3.4 Fast-burn indicator (1h)

```promql
(
  sum(rate(http_requests_total{status=~"5.."}[1h]))
  /
  sum(rate(http_requests_total[1h]))
) > 0.02
```

Display as a binary status. `1` = fast-burn tripped (page on-call).

### 3.5 Compliance SLO counters

```promql
# Should be 0 (or very close to 0)
sum(increase(payroll_slips_generated_total{status="failed"}[30d]))
sum(increase(vat_exports_total{status="failed"}[30d]))
```

Display as two big numbers. Anything other than `0` is red.

---

## 4. What the SLOs imply about release risk

| Budget remaining    | Release policy                                              |
|---------------------|-------------------------------------------------------------|
| > 50%               | Normal release cadence. Risky changes OK.                   |
| 25–50%              | Normal cadence, but avoid batching multiple risky changes.  |
| 10–25%              | Only low-risk releases (docs, tests, config, small fixes).  |
| < 10%               | **Release freeze on all non-fix changes.**                  |
| Exhausted           | **Full release freeze until the budget resets.** SRE lead approval required for any exception (e.g. compliance hot-fix). |

This policy is the feedback loop that makes SLOs useful. Without it, an SLO is just a number on a dashboard.

---

## 5. What the SLOs do **not** cover

Explicitly out of scope for QA-20. Listed here so nobody assumes they are covered.

- **Third-party uptime.** Supabase, bank APIs, Tax Authority endpoints — their uptime is not ours to promise. When they are down, we surface it honestly in the incident log but it does **not** count against our error budget. (We still alert on it via `SilentDBStall` — see `QA-20-incident-response.md` §2.9.)
- **UI responsiveness on the client.** No SLO here; this is an app-performance target, tracked separately by the frontend team.
- **Mobile network latency.** Out of scope — Onyx is web-first.
- **Cold start after a region failover.** There is no multi-region setup today, so no failover SLO.
- **Data freshness for cached reads.** No SLO — all reads go through the DB unless a cache is explicitly declared, and no such cache is declared in the current architecture.

---

## 6. Review cadence

| Event              | Action                                                                                   |
|--------------------|-------------------------------------------------------------------------------------------|
| **Weekly**         | SRE + QA-20 review last 7 days of SLI values vs. targets. Log in the ops stand-up notes. |
| **Monthly**        | Reset calendar-month compliance SLOs (payroll, VAT). Publish a one-page SLO report.      |
| **Per release**    | Post-release checklist §6 verifies SLO health before blessing the release as stable.    |
| **Quarterly**      | Review the targets themselves. Are they still right? Are they too tight / too loose?    |
| **After incident** | Every SEV-1 post-mortem must include an SLO-impact paragraph.                           |

---

## 7. Open questions (to resolve before the next quarterly review)

1. **Per-route availability SLO** — should we have a tighter target for the `/api/payroll/*` and `/api/vat/*` routes than for the aggregate? Suggests yes (99.99% for money-movers), but requires per-route error budget bookkeeping.
2. **Queue depth as an SLO** — should queue backlogs count against the error budget? Currently not, because a backlog does not return a 5xx to the user. But a sustained backlog is still a real failure.
3. **Read-only mode credit** — when the app is in maintenance / read-only mode (e.g. during a Supabase outage), should write requests count as failures (they return 503) or be excluded from the budget? Suggestion: count them, because a 503 is still a bad user experience. But document the exclusion if we go the other way.
4. **Audit durability SLI source** — the 0.01% target depends on accurate counting of `[audit] DB insert failed` log lines. Do we need a dedicated counter metric (`audit_write_failures_total`) to make it precise instead of parsing logs?

---

## 8. Sign-off

| Role              | Name                         | Date        | Decision |
|-------------------|------------------------------|-------------|----------|
| QA-20 Agent       | Claude (Monitoring agent)    | 2026-04-11  | ready    |
| SRE lead          |                              |             |          |
| CFO               |                              |             |          |
| Compliance        |                              |             |          |
| Owner             | Kobi Elkayam                 |             |          |
| CEO               | Techno-Kol Uzi               |             |          |

_SLOs are a promise the platform makes, not a promise the users make. They are the scorecard for engineering, not a shield for engineering._
