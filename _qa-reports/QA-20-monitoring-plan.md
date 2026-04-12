# QA-20 — Post-Release Monitoring Plan

| Field       | Value                                                               |
|-------------|---------------------------------------------------------------------|
| Agent       | QA-20 Monitoring & Post-Release Agent                               |
| Owner       | Techno-Kol Uzi / Kobi Elkayam Real Estate                           |
| Scope       | Full ERP stack — Onyx Procurement + Techno-Kol Ops + payroll + VAT  |
| Doc type    | Monitoring plan (strategy + wiring + coverage matrix)               |
| Last update | 2026-04-11                                                          |
| Status      | **DRAFT — ready for release gate review**                           |
| Siblings    | `QA-20-post-release-checklist.md`, `QA-20-incident-response.md`, `QA-20-slo-targets.md` |

> **Ground rule:** this plan is **purely additive**. It never deletes, rewrites, or renames an existing log file, metric, dashboard, rule, or runbook page. Every action below either (a) wires an already-existing zero-dep primitive into a consumer, or (b) reads a new derived signal from data we already collect.

---

## 1. Audit — what already exists

A fresh audit on 2026-04-11 discovered that the 50-agent swarm has already landed most of the low-level plumbing. QA-20 does **not** need to build a new metrics lib, a new error tracker, a new logger, or a new alerting DSL. The primitives are in place; this plan describes how to turn them on, scrape them, and watch them.

### 1.1 Metrics layer — Prometheus exporter

File: `onyx-procurement/src/ops/metrics.js` (Agent 42, zero external deps).

Already exposed at `GET /metrics` in the Prometheus text exposition format (v0.0.4):

| Metric                              | Type       | Labels                    | Purpose                                             |
|-------------------------------------|-----------|----------------------------|-----------------------------------------------------|
| `http_requests_total`               | counter   | `method`, `route`, `status`| Base for error-rate and traffic dashboards         |
| `http_request_duration_seconds`     | histogram | `method`, `route`          | p50 / p95 / p99 latency per endpoint               |
| `db_query_duration_seconds`         | histogram | `op`                       | DB latency (used by the `SlowDBQueries` rule)      |
| `payroll_slips_generated_total`     | counter   | `status`                   | Business health — payroll pipeline                  |
| `vat_exports_total`                 | counter   | `period`                   | Business health — VAT pipeline                      |
| `process_uptime_seconds`            | gauge     | —                          | Liveness                                            |
| `process_resident_memory_bytes`     | gauge     | —                          | RSS — feeds `HighMemoryUsage` rule                  |

Default histogram buckets (seconds): `[0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]`.

Wiring in `server.js` is guarded with `try/catch`, so a broken metrics module can never break boot. The `/metrics` handler self-excludes from its own counters to avoid polluting the scrape path. Per `routeLabel()`, cardinality is bounded to matched route templates (e.g. `/api/suppliers/:id`) rather than raw URLs.

### 1.2 Error tracking layer — Sentry-compatible JSONL tracker

File: `onyx-procurement/src/ops/error-tracker.js` (Agent 42).

- API parity with a Sentry SDK subset: `captureException`, `captureMessage`, `setUser`, `setTag`, `setContext`, `errorHandler()`, `requestScopeMiddleware()`.
- Persists to `onyx-procurement/logs/errors.jsonl` with size-based rotation (10 MB, keeps `.1` through `.5`).
- Deduplicates by `sha1(err.message + '|' + topStackFrame)` with an in-memory fingerprint cache capped by `maxBufferBytes` (default 5 MB, evicts oldest half when full).
- PII scrubbing is recursive and case-insensitive against: `password`, `token`, `api_key`, `credit_card`, `national_id`, `tax_file`. `setUser()` strips everything except `id` before persistence.
- Uses `AsyncLocalStorage` for per-request scope — tags/context/user set inside one request cannot leak into another.
- **Never throws.** Every `fs.appendFileSync`/`rotateIfNeeded` call is wrapped in `try/catch`, and failures are surfaced to `console.error` with the `[error-tracker]` prefix.

### 1.3 Alert rules layer — Prometheus rules + multi-channel dispatcher

Files: `onyx-procurement/ops/alerts/rules.yml` and `onyx-procurement/ops/alerts/notification-dispatcher.js` (Agent 43).

Eight rules already wired, grouped into four families. Every rule carries bilingual summaries (Hebrew + English) and a `runbook_url`:

| Group            | Rule                          | Severity | Expression                                                                                    |
|------------------|-------------------------------|----------|-----------------------------------------------------------------------------------------------|
| api              | `HighErrorRate`               | critical | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05`                                         |
| api              | `SlowDBQueries`               | warning  | `histogram_quantile(0.95, sum by (le) (rate(db_query_duration_seconds_bucket[5m]))) > 2`      |
| host             | `HighMemoryUsage`             | warning  | `process_resident_memory_bytes > 1073741824` for 10m                                          |
| host             | `LowDiskSpace`                | critical | `(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10` for 15m                   |
| integrations     | `FailedWebhookDeliveries`     | warning  | `increase(webhook_delivery_failures_total[10m]) > 5`                                          |
| integrations     | `MissingDailyBackup`          | critical | `time() - backup_last_success_timestamp > 86400 + 3600`                                       |
| business         | `PayrollGenerationFailures`   | critical | `rate(payroll_slips_generated_total{status="failed"}[5m]) > 0` for 1m                         |
| business         | `VATExportFailure`            | critical | `rate(vat_exports_total{status="failed"}[15m]) > 0` for 1m                                    |

The dispatcher (`notification-dispatcher.js`) speaks Alertmanager webhook v4 and supports `console`, `file`, `email`, `whatsapp`, `sms` channels (email/whatsapp/sms are stubs that log to stdout — replace with nodemailer / Twilio / Inforu before go-live). Default routing:

```
critical -> console + file + whatsapp + sms + email
warning  -> console + file + email
info     -> console + file
```

Runs as long-lived HTTP receiver (`--server --port 9099`) or one-shot stdin consumer.

### 1.4 Structured logging layer — pino

File: `onyx-procurement/src/logger.js` (Agent 01).

- Singleton pino root logger, ISO-8601 timestamps, JSON in prod / pretty in dev.
- `requestLogger` Express middleware mints / propagates `x-request-id`, attaches `req.log` child with `{ requestId, method, url }` bindings, echoes the header back on the response, and logs `request.start` / `request.end` with `statusCode` and `durationMs`. Log level follows status: `>=500 -> error`, `>=400 -> warn`, else `info`.
- Redact paths: `req.headers.authorization`, `req.headers["x-api-key"]`, `req.headers.cookie`, `*.password`, `*.token`, `*.api_key`.
- `errorLogger` error middleware logs the exception with stack and forwards it via `next(err)` so the existing global handler in `server.js` still sends the response — purely additive.

### 1.5 Audit trail layer — DB-backed immutable log

Files:
- `techno-kol-ops/src/middleware/audit.ts` — declares `audit_logs` table + low-level `auditLog(...)`.
- `techno-kol-ops/src/middleware/audit.js` — Agent 21 hardening pack, adds `auditMiddleware`, `withAudit(resource, action)` per-route wrapper, and `audit(opts)` for service code outside the request cycle.

Schema (immutable, append-only):

```
audit_logs(id, user_id, action, resource, resource_id,
           before_data, after_data, ip_address, created_at)
```

`withAudit` patches `res.json` and fires the write **after** a successful 2xx reply, fire-and-forget. The business request is never blocked if the audit insert fails — errors go to `console.error('[audit] DB insert failed: ...')`.

### 1.6 Summary — what's already there vs. what QA-20 adds

| Layer              | Primitive                                      | Status           | QA-20 adds                                  |
|--------------------|-----------------------------------------------|------------------|---------------------------------------------|
| Metrics            | `onyx-procurement/src/ops/metrics.js`          | ready            | scrape config + dashboards                 |
| Error tracking     | `onyx-procurement/src/ops/error-tracker.js`    | ready            | watch windows, escalation rules            |
| Alert rules        | `onyx-procurement/ops/alerts/rules.yml`        | ready (8 rules)  | +5 derived rules, +1 SLO burn-rate rule    |
| Alert dispatch     | `onyx-procurement/ops/alerts/notification-dispatcher.js` | ready (stubs) | replace email/WhatsApp/SMS stubs pre-GA |
| Structured logs    | `onyx-procurement/src/logger.js` (pino)        | ready            | log shipping + retention policy            |
| Audit trail        | `techno-kol-ops/src/middleware/audit.{ts,js}`  | ready            | compliance dashboard query set             |

---

## 2. Logs to watch (with queries)

All queries below assume Loki/Grafana for log aggregation and Prometheus for metrics. If you stay on JSONL for the first week, the same log selectors run as `jq` filters against `onyx-procurement/logs/errors.jsonl`.

### 2.1 Error rate per endpoint

```promql
sum by (route) (
  rate(http_requests_total{status=~"5.."}[5m])
)
/
sum by (route) (
  rate(http_requests_total[5m])
)
```

Alert tier: existing `HighErrorRate` at 5% aggregate. Per-route tier: warning at 2% for 10m (QA-20 adds, see §5).

### 2.2 5xx absolute rate

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
```

Used directly by existing `HighErrorRate` rule.

### 2.3 4xx absolute rate — suspicious-spike detection

```promql
sum(rate(http_requests_total{status=~"4.."}[5m]))
```

A sudden 4xx spike on production is **not** a client problem by default — it is one of: (a) a bad deploy changing a route contract, (b) a misbehaving integration hammering the API, (c) a credential leak triggering rate-limit hits, (d) an auth outage returning 401/403 across the board. Alert tier: QA-20 adds `Suspicious4xxSpike` — rate > 3x the trailing-1h baseline for 10m (see §5).

### 2.4 Slow requests (> 1s)

```promql
histogram_quantile(0.95,
  sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))
) > 1
```

Alert tier: `p95 > 2s` already covered by `SlowDBQueries` when the bottleneck is in the DB, but not at the HTTP layer. QA-20 adds `HighHttpLatencyP95` (see §5).

### 2.5 Failed logins

Login attempts are logged via `captureMessage('auth.login.failed', 'warning', { tags: { reason } })` from the auth handler. Loki query:

```
{service="onyx-procurement"}
  |= "auth.login.failed"
  | json
  | line_format "{{.reason}}"
```

Alert tier: **> 20 failed logins from the same IP in 5m** → block at the rate-limit layer (Agent-24 hardening), notify `security@`.

### 2.6 Failed webhooks

Covered by existing `FailedWebhookDeliveries` rule (`webhook_delivery_failures_total > 5 in 10m`). Log selector for drill-down:

```
{service="onyx-procurement"}
  |= "webhook.delivery.failed"
  | json
```

### 2.7 Payroll calculation failures

Metric-side: covered by existing `PayrollGenerationFailures` rule. Log-side drill-down:

```
{service="onyx-procurement"}
  |= "payroll.slip.failed"
  | json
  | line_format "{{.employeeId}} {{.period}} {{.reason}}"
```

**Severity:** critical. Payroll has a hard legal deadline (slip must be issued by the 9th of the following month). Every failure is a compliance event.

### 2.8 VAT export failures

Metric-side: existing `VATExportFailure` rule. Log-side:

```
{service="onyx-procurement"}
  |= "vat.export.failed"
  | json
  | line_format "{{.period}} {{.form}} {{.reason}}"
```

**Severity:** critical. VAT has a hard legal deadline (15th of the month for PCN874, last day of the month for 6111). Every failure is a compliance event.

### 2.9 Bank matching failures

Bank reconciliation is run via a nightly job that emits `bank.match.failed` for any transaction it cannot auto-match. Log selector:

```
{service="onyx-procurement"}
  |= "bank.match.failed"
  | json
  | line_format "{{.bankRef}} {{.amount}} {{.reason}}"
```

**Severity:** warning. Failures accumulate in a manual-review queue; alert only if the queue grows for > 48h without human action (see `StaleBankMatchQueue` in §5).

---

## 3. Metrics to watch

| # | Metric                          | Source                                               | Threshold                                    |
|---|--------------------------------|------------------------------------------------------|----------------------------------------------|
| 1 | Memory (leak detection)        | `process_resident_memory_bytes`                      | `> 1 GiB for 10m` → existing `HighMemoryUsage` |
| 2 | CPU                            | `rate(process_cpu_seconds_total[5m])`                | `> 0.85 * NUM_CPU for 10m` (QA-20 adds)      |
| 3 | DB connection pool saturation  | custom `db_pool_in_use` gauge (emit from `pg.Pool`)  | `> 90% of max for 5m` (QA-20 adds)           |
| 4 | Event loop lag                 | custom `nodejs_eventloop_lag_seconds` histogram      | `p99 > 0.15s for 5m` (QA-20 adds)            |
| 5 | Disk space                     | `node_filesystem_avail_bytes`                        | `< 10% for 15m` → existing `LowDiskSpace`    |
| 6 | Active sessions                | custom `app_active_sessions` gauge                   | anomaly-only (plotted on dashboard)          |
| 7 | Queue depth                    | custom `job_queue_depth` gauge (per-queue labelled)  | `> 5000 for 10m` (QA-20 adds)                |

Metrics #2, #3, #4, #7 are not yet emitted — they are additive wiring work scheduled before release. Every new metric follows the existing `metrics.js` API (`new Counter / new Gauge / new Histogram`) so no new library is introduced.

---

## 4. Alert catalogue — existing + QA-20 additions

### 4.1 Existing alerts (8)

Already documented in `onyx-procurement/ops/alerts/rules.yml`. No changes.

### 4.2 QA-20 proposed additions (6)

> These are proposals to add to `rules.yml`. QA-20 does **not** write the rules file — it only specifies what new alerts are needed. Implementation belongs to the SRE team, gated on release review.

| Alert name                | Severity | Expression                                                                                       | For     | Rationale                                         |
|---------------------------|----------|---------------------------------------------------------------------------------------------------|---------|---------------------------------------------------|
| `HighHttpLatencyP95`      | warning  | `histogram_quantile(0.95, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))) > 2` | 5m      | p95 HTTP latency alarm (not just DB)             |
| `Suspicious4xxSpike`      | warning  | `(sum(rate(http_requests_total{status=~"4.."}[5m]))) > 3 * avg_over_time((sum(rate(http_requests_total{status=~"4.."}[5m])))[1h:5m])` | 10m | Detect credential leak / contract break / auth outage |
| `PerRouteErrorBudgetBurn` | warning  | `(sum by (route) (rate(http_requests_total{status=~"5.."}[30m]))) / (sum by (route) (rate(http_requests_total[30m]))) > 0.02` | 10m | Per-route 2% threshold, catches localised outages  |
| `DBPoolNearExhaustion`    | warning  | `db_pool_in_use / db_pool_max > 0.9`                                                              | 5m      | Prevents cascading latency → 5xx                 |
| `EventLoopLagP99`         | warning  | `histogram_quantile(0.99, sum by (le) (rate(nodejs_eventloop_lag_seconds_bucket[5m]))) > 0.15`   | 5m      | Node blocking signal, classic of sync IO / heavy JSON |
| `StaleBankMatchQueue`     | warning  | `bank_match_queue_depth > 0 and (time() - bank_match_last_cleared_timestamp > 172800)`            | 0m      | Bank reconciliation stuck > 48h → compliance risk |

All QA-20 additions **inherit the same bilingual summary convention and `runbook_url` pattern** (`https://runbooks.onyx-procurement.local/alerts/<kebab-name>`).

### 4.3 Alert severity ladder

| Severity | Response SLA        | Channels                                  | Paged? |
|----------|---------------------|-------------------------------------------|--------|
| critical | 15 minutes          | console + file + whatsapp + sms + email   | yes    |
| warning  | next business hour  | console + file + email                    | no     |
| info     | review during hours | console + file                            | no     |

This matches the existing `SEVERITY_ROUTES` table in `notification-dispatcher.js`.

---

## 5. Dashboards to build

QA-20 specifies four dashboards. Every panel is backed by a metric that is either already exported by `metrics.js` or by one of the six additive metrics in §3.

### 5.1 Executive dashboard (business KPIs)

Audience: Techno-Kol Uzi (CEO), Kobi Elkayam (owner), CFO.

| Panel                         | Query                                                              | Visualisation |
|-------------------------------|--------------------------------------------------------------------|---------------|
| Payroll slips today           | `sum(increase(payroll_slips_generated_total{status="ok"}[24h]))`  | big number    |
| Payroll fails today           | `sum(increase(payroll_slips_generated_total{status="failed"}[24h]))` | big number  |
| VAT submissions this month    | `sum by (period) (increase(vat_exports_total[30d]))`              | table         |
| Open RFQs                     | `app_open_rfqs`                                                    | gauge         |
| Cash in bank (matched)        | `bank_matched_balance_shekels` / 1                                 | big number    |
| Bank-match queue depth        | `bank_match_queue_depth`                                           | big number    |

### 5.2 Operations dashboard (health + SLOs)

Audience: SRE / on-call.

| Panel                 | Query                                                                                                                                | Visualisation |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------|---------------|
| 5xx rate              | `sum(rate(http_requests_total{status=~"5.."}[5m]))`                                                                                  | timeseries    |
| 4xx rate              | `sum(rate(http_requests_total{status=~"4.."}[5m]))`                                                                                  | timeseries    |
| p95 latency per route | `histogram_quantile(0.95, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m])))`                                       | heatmap       |
| DB p95                | `histogram_quantile(0.95, sum by (le) (rate(db_query_duration_seconds_bucket[5m])))`                                                 | timeseries    |
| RSS memory            | `process_resident_memory_bytes`                                                                                                      | timeseries    |
| Uptime                | `process_uptime_seconds`                                                                                                             | big number    |
| Error budget burn     | `(sum(rate(http_requests_total{status=~"5.."}[1h]))) / (sum(rate(http_requests_total[1h])))`                                         | gauge vs 0.001 |

### 5.3 Compliance dashboard

Audience: accountant, legal, auditor.

All queries hit the `audit_logs` table (Postgres) via a Grafana Postgres datasource — **read-only**.

| Panel                            | SQL                                                                                                            |
|----------------------------------|----------------------------------------------------------------------------------------------------------------|
| VAT submissions (last 6 months)  | `SELECT date_trunc('month', created_at), COUNT(*) FROM audit_logs WHERE resource='vat_export' AND action='SUBMIT' GROUP BY 1` |
| Payroll slips issued (by period) | `SELECT resource_id AS period, COUNT(*) FROM audit_logs WHERE resource='payroll_slip' AND action='ISSUE' GROUP BY 1` |
| Change events today              | `SELECT action, resource, COUNT(*) FROM audit_logs WHERE created_at >= current_date GROUP BY 1,2`              |
| Failed critical writes           | `SELECT * FROM audit_logs WHERE action IN ('DELETE','APPROVE','SUBMIT','ISSUE') AND (after_data->>'error') IS NOT NULL ORDER BY created_at DESC LIMIT 50` |

### 5.4 Security dashboard

Audience: SRE + CISO.

| Panel                        | Query                                                                                              |
|------------------------------|----------------------------------------------------------------------------------------------------|
| Failed logins per 5m         | Loki: `count_over_time({service="onyx-procurement"} \|= "auth.login.failed" [5m])`                 |
| 4xx per route                | `sum by (route) (rate(http_requests_total{status=~"4.."}[5m]))`                                    |
| Rate-limit hits              | `sum(rate(http_requests_total{status="429"}[5m]))`                                                 |
| Top source IPs (last 1h)     | Loki: `topk(20, count by (ip) (rate({service="onyx-procurement"} \|= "request.start" [1h])))`      |
| PII redaction sample check   | Loki: `count_over_time({service="onyx-procurement"} \|~ "\\[REDACTED\\]" [24h])` — should be > 0 (proves the redactor is still attached) |

---

## 6. Runbook index

> The full runbook lives at `https://runbooks.onyx-procurement.local/alerts/<name>`. QA-20 does not rewrite the runbook — it specifies **what must exist** before Go. Every page must answer four questions: symptoms, first checks, mitigation, escalation. See `QA-20-incident-response.md` for the response playbook template.

Required pages before Go:

1. `high-error-rate`
2. `slow-db-queries`
3. `high-memory-usage`
4. `low-disk-space`
5. `failed-webhook-deliveries`
6. `missing-daily-backup`
7. `payroll-generation-failures`
8. `vat-export-failure`
9. `high-http-latency-p95` (QA-20 addition)
10. `suspicious-4xx-spike` (QA-20 addition)
11. `per-route-error-budget-burn` (QA-20 addition)
12. `db-pool-near-exhaustion` (QA-20 addition)
13. `event-loop-lag-p99` (QA-20 addition)
14. `stale-bank-match-queue` (QA-20 addition)

---

## 7. Log retention & shipping policy

### 7.1 On-disk retention (status: ready via rotation)

- `onyx-procurement/logs/errors.jsonl` — 10 MB × 5 rotations = **up to 60 MB**. Managed by `error-tracker.js` `rotateIfNeeded()` on every write.
- Access log (pino JSON) — recommended rotation via external `logrotate` with `size 50M / rotate 7` = up to **350 MB per instance**.

### 7.2 Shipping (additive wiring — not yet enabled)

Proposal (gated on release review, not blocking for Go):

- Tail `errors.jsonl` and pino stdout via **Promtail** → Loki, 30-day retention.
- Mirror audit_logs to cold storage via a nightly `pg_dump -t audit_logs | gzip` into S3-compatible object storage, 7-year retention for tax compliance (מס הכנסה / VAT).

### 7.3 PII / legal guarantees

- `error-tracker.js` strips PII **before** persistence. See `PII_KEYS` in the source.
- pino `redact` paths strip auth headers and any field named `password` / `token` / `api_key` at log time.
- `audit_logs.before_data` / `after_data` store full business payloads — but never passwords or tokens, because the `withAudit` wrapper is applied **after** auth middleware has already stripped credentials from `req.body`.
- National IDs (תעודת זהות) in the audit trail are necessary for compliance and are **not** scrubbed from `audit_logs` — they are scrubbed from application error events. This is intentional.

---

## 8. Release gate — Go / No-Go for monitoring

| Gate item                                                  | Status  | Notes                                                       |
|------------------------------------------------------------|---------|-------------------------------------------------------------|
| `/metrics` endpoint live on every node                     | **GO**  | `server.js` wires `metricsMiddleware` + `metricsHandler`    |
| Prometheus scraping `/metrics` at 15s                      | pending | requires `prometheus.yml` job, documented in `src/ops/README.md` §Prometheus scrape example |
| 8 existing rules loaded into Prometheus                    | pending | `rules.yml` file is ready — needs `rule_files` entry        |
| Alertmanager → dispatcher wired                            | pending | `alertmanager.yml` template provided in `ops/alerts/README.md` §3.1 |
| email / WhatsApp / SMS stubs replaced                      | **NO-GO** | still log-only; must replace with Twilio/Inforu/nodemailer before critical alerts can page on-call |
| pino logger attached in every server                       | **GO**  | `src/logger.js` is imported by `server.js`                  |
| `error-tracker.init()` called at boot                      | **GO**  | documented wiring block in `src/ops/README.md` §Wiring      |
| `audit_logs` table provisioned                             | **GO**  | schema declared in `techno-kol-ops/src/middleware/audit.ts` |
| 6 QA-20 additional rules added to `rules.yml`              | pending | proposed in §4.2 — owner: SRE team                          |
| Runbook pages 1–14 published                               | pending | see §6                                                      |
| 4 dashboards built in Grafana                              | pending | queries spec'd in §5 — owner: SRE team                      |
| SLO target doc signed off                                  | **GO**  | see `QA-20-slo-targets.md`                                  |
| Post-release checklist signed off                          | **GO**  | see `QA-20-post-release-checklist.md`                       |
| Incident response playbook signed off                      | **GO**  | see `QA-20-incident-response.md`                            |

### Verdict

**NO-GO until the critical-alert delivery channel (email / WhatsApp / SMS stubs) is replaced with a real transport.**

Every other gap is a **GO-WITH-FOLLOWUP**: dashboards, scraping, Alertmanager wiring, and the 6 additive rules can be shipped within the first 72h after release. But a `PayrollGenerationFailures` or `VATExportFailure` alert firing to a stubbed channel is a compliance-grade miss on a money-moving pipeline — that must be fixed before Go.

**Owner for the unblock:** SRE team lead. **ETA:** pre-release swarm Sprint-2 (already in scope for Agent-43 follow-up).

---

## 9. Quick reference — commands

```bash
# Validate rules file syntax
promtool check rules onyx-procurement/ops/alerts/rules.yml

# Smoke-test the dispatcher end-to-end (no real channels)
NOTIFY_CHANNELS=console,file \
  node onyx-procurement/ops/alerts/notification-dispatcher.js \
  < onyx-procurement/ops/alerts/sample-payload.json

# Tail the JSONL error log
tail -F onyx-procurement/logs/errors.jsonl | jq .

# Hot-reload Prometheus after a rules change
curl -X POST http://prometheus:9090/-/reload

# Quick /metrics sanity check
curl -s http://localhost:3100/metrics | head -40
```

---

## 10. Sign-off

| Role              | Name                              | Date        | Decision |
|-------------------|-----------------------------------|-------------|----------|
| QA-20 Agent       | Claude (Monitoring agent)         | 2026-04-11  | ready    |
| SRE lead          | _pending_                         |             |          |
| CFO / Compliance  | _pending_                         |             |          |
| Owner             | Kobi Elkayam                      |             |          |
| CEO               | Techno-Kol Uzi                    |             |          |

_No file is deleted, renamed, or overwritten by this plan. Every reference is read-only or additive._
