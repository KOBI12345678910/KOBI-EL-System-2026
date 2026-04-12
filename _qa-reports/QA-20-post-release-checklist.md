# QA-20 — Post-Release Checklist

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Agent       | QA-20 Monitoring & Post-Release Agent                        |
| Owner       | Techno-Kol Uzi / Kobi Elkayam Real Estate                    |
| Doc type    | Post-release checklist (T+0 → T+1 week)                      |
| Scope       | Onyx Procurement + Techno-Kol Ops + payroll + VAT            |
| Last update | 2026-04-11                                                   |
| Related     | `QA-20-monitoring-plan.md`, `QA-20-incident-response.md`, `QA-20-slo-targets.md` |

> **Rule:** this checklist is **read-only against the codebase**. Every item is either (a) a query against an existing metric/log, (b) a visual check on an existing dashboard, or (c) a pager test. Nothing here deletes files, changes thresholds, or rewrites runbooks.

---

## 0. Release window

| Field               | Value                                         |
|---------------------|-----------------------------------------------|
| Release tag         | `______________` (fill in from `git describe`) |
| Release time (UTC)  | `______________`                              |
| Release time (IST)  | `______________`                              |
| Previous tag        | `______________`                              |
| Delta commits       | `______________`                              |
| Release manager     | `______________`                              |
| On-call primary     | `______________`                              |
| On-call secondary   | `______________`                              |
| Rollback tag        | `______________` (must be known before Go)    |

---

## 1. T+0 — Release moment (minute 0 to minute 15)

> Do not step away from the console during this window.

### 1.1 Health ping loop (every 30s for 15 minutes)

- [ ] `curl -fsS http://<host>/healthz` returns **200** on every hit
- [ ] `curl -fsS http://<host>/readyz` returns **200** on every hit
- [ ] `curl -fsS http://<host>/metrics | head -5` returns the `# HELP` banner (confirms `metrics.js` is wired)
- [ ] `/metrics` output contains `http_requests_total` (confirms middleware is attached)
- [ ] `/metrics` output contains `process_uptime_seconds` and the value is `< 60` (fresh restart)
- [ ] `process_resident_memory_bytes` is within 2x of the pre-release baseline

### 1.2 Log sanity (first minute)

- [ ] `tail -F onyx-procurement/logs/errors.jsonl` shows no new entries from the release deploy
- [ ] pino output shows `request.start` / `request.end` for the health pings
- [ ] pino output shows `x-request-id` headers are being minted
- [ ] Redaction check: `tail -100` of pino logs contains **no** raw `password=` / `token=` / `api_key=` strings

### 1.3 Smoke

- [ ] Log in as admin user — UI renders, no console errors
- [ ] Create a dummy RFQ — auto-matches to suppliers, state transitions correctly
- [ ] Read the last audit log row for the dummy RFQ: `SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1` — the row exists, `user_id` is set, `before_data` / `after_data` are non-null
- [ ] Delete the dummy RFQ (if soft-delete is supported — hard-delete is disallowed by policy)

### 1.4 Alert pipeline dry-run

- [ ] Fire a test alert through the dispatcher:
  ```bash
  echo '{"version":"4","status":"firing","alerts":[{"status":"firing","labels":{"alertname":"QA20ReleaseDryRun","severity":"info"},"annotations":{"summary":"QA-20 release dry run"}}]}' \
    | node onyx-procurement/ops/alerts/notification-dispatcher.js
  ```
- [ ] Dispatcher exits with code 0
- [ ] Dry-run line appears in `ops/alerts/alerts.log` with the expected severity/name

---

## 2. T+1h — First hour watch

### 2.1 Metrics deltas vs. baseline

- [ ] 5xx rate: `sum(rate(http_requests_total{status=~"5.."}[5m]))` — within 1.5x of the trailing-24h pre-release baseline
- [ ] 4xx rate: within 1.5x baseline
- [ ] p95 HTTP latency: `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))` — within 1.2x baseline
- [ ] DB p95: within 1.2x baseline
- [ ] RSS memory: stable or decreasing slope
- [ ] No alert in the `critical` severity tier has fired
- [ ] No warning alert has fired **twice** in the same hour

### 2.2 Log shape

- [ ] `errors.jsonl` line count has not grown by more than 2x the trailing-hour baseline
- [ ] No new error **fingerprints** (sha1 of message + top stack frame) — `jq -r .fingerprint onyx-procurement/logs/errors.jsonl | sort -u | wc -l` is stable
- [ ] `request.end` `durationMs` p95 pulled from pino samples matches the `/metrics` p95 (cross-check: the two pipelines are consistent)
- [ ] No log line matches `/\bUNREDACTED\b/i` and no line contains a raw `Bearer `

### 2.3 Business pipelines

- [ ] `payroll_slips_generated_total{status="failed"}` counter **did not move** (delta = 0 for the hour)
- [ ] `vat_exports_total{status="failed"}` counter **did not move**
- [ ] `bank_match_queue_depth` gauge is within 10% of baseline
- [ ] `webhook_delivery_failures_total` counter has not incremented more than 5 in the hour

### 2.4 Runbook reachability

- [ ] At least one runbook page opens from an alert (click the `runbook_url` in the dispatcher output for the T+0 dry-run)

---

## 3. T+6h — First business-hours window

### 3.1 Real-user signals

- [ ] Active session count is within 0.8x–1.5x of the same-weekday-same-hour baseline
- [ ] No spike in `auth.login.failed` rate vs. baseline
- [ ] No spike in 401/403 rate vs. baseline
- [ ] No rate-limit hits beyond the pre-release ambient level
- [ ] At least one successful end-to-end transaction per module: purchase order, receipt, payroll preview, VAT preview, bank import

### 3.2 Dashboard visual pass

- [ ] Executive dashboard — all panels render, no `No data` or `Error` chips
- [ ] Operations dashboard — all panels render, heatmap shows values
- [ ] Compliance dashboard — audit log query returns rows (the release itself should have created some)
- [ ] Security dashboard — the `[REDACTED]` sample-count panel shows a positive number

---

## 4. T+24h — End of day 1

### 4.1 Metric sanity

- [ ] 5xx rate over the 24h window is `< 0.1%` (SLO target — see `QA-20-slo-targets.md`)
- [ ] p95 HTTP latency over 24h is `< 500ms`
- [ ] RSS memory shape is **flat or sawtooth** — not monotonically increasing (leak signal)
- [ ] Error budget burn: `(sum(rate(http_requests_total{status=~"5.."}[24h]))) / (sum(rate(http_requests_total[24h])))` is below the 1-day fast-burn threshold

### 4.2 Log retention behaviour

- [ ] `errors.jsonl` has **rotated at most once** in 24h (if it rotated more, a rule is firing too often — investigate)
- [ ] No log-shipping pipeline has dropped messages (if Loki/Promtail is wired)
- [ ] Audit log row count has grown — `SELECT COUNT(*) FROM audit_logs WHERE created_at >= NOW() - INTERVAL '24h'` is non-zero and matches expected activity

### 4.3 Business checks

- [ ] Any scheduled payroll slip runs for the day completed successfully — check `audit_logs` with `resource='payroll_slip' AND action='ISSUE'` for the last 24h, then cross-check against HR's roster
- [ ] Any scheduled VAT exports for the period completed — check `audit_logs` with `resource='vat_export' AND action='SUBMIT'`
- [ ] Daily backup ran and `backup_last_success_timestamp` is within the last 24h (prevents `MissingDailyBackup` from firing tomorrow)

### 4.4 Post-deploy review

- [ ] Release manager files a `T+24h report` entry (free-form note in the team channel, template below)
- [ ] Any `warning` alert that fired more than 3 times in 24h is opened as a bug and tagged `post-release-noise`

#### T+24h report template

```
Release: <tag>
Deployed at: <timestamp>
SLO status: <met | breached>
5xx rate (24h): <value>
p95 HTTP (24h): <value>
RSS trend: <flat | up | down>
Critical alerts fired: <count>
Warning alerts fired: <count>
Rollback invoked: <yes | no>
Unexpected behaviour: <free text>
```

---

## 5. T+48h — End of day 2

- [ ] No leak signature in `process_resident_memory_bytes` (48h line is flat or bounded)
- [ ] `db_pool_in_use` has not climbed monotonically
- [ ] `bank_match_queue_depth` has been processed at least once (cleared to baseline) — confirms the nightly job ran
- [ ] Error budget burn on the 2-day window is within the multi-day SLO budget
- [ ] No new distinct error fingerprint has been added in the last 12h

---

## 6. T+7d — First week review

### 6.1 SLO scoreboard

- [ ] Availability (`1 - 5xxRate`) over 7d is `>= 99.9%`
- [ ] p95 HTTP latency over 7d is `< 500ms`
- [ ] p99 HTTP latency over 7d is `< 2s`
- [ ] DB p95 over 7d is `< 250ms`
- [ ] Payroll success rate over 7d is `100%` on the `ok` counter, `0` on the `failed` counter
- [ ] VAT export success rate over 7d is `100%` / `0`
- [ ] Backup success rate over 7d is `7 / 7`
- [ ] Audit log write success rate over 7d is `100%` (no `[audit] DB insert failed` lines in stderr)

### 6.2 Noise / toil review

- [ ] List every alert fired in the week. For each: was it a real incident, a config issue, or noise? Noise → propose a threshold tweak in `rules.yml` (never QA-20's call to commit; file a proposal for SRE review).
- [ ] Alerts that fired but did not wake on-call (warning tier) are reviewed in the weekly ops stand-up.
- [ ] Any critical alert that paged on-call more than once in 7d is a **retrospective-required** event.

### 6.3 Security review

- [ ] Top-20 source IPs over 7d are cross-referenced against known office / customer IPs — anything unknown is investigated.
- [ ] Count of `auth.login.failed` over 7d is within 3x baseline.
- [ ] Count of `429` rate-limit hits is within 2x baseline.
- [ ] PII redaction sample check: no `[REDACTED]` count regression compared to pre-release.

### 6.4 Compliance review

- [ ] Every VAT export for the last 7d has a matching `audit_logs` entry (`resource='vat_export' AND action IN ('EXPORT','SUBMIT')`)
- [ ] Every payroll slip issued in the last 7d has a matching `audit_logs` entry (`resource='payroll_slip' AND action='ISSUE'`)
- [ ] No `DELETE` action on a compliance-relevant resource (`audit_logs` query: `SELECT * FROM audit_logs WHERE action='DELETE' AND resource IN ('audit_logs','payroll_slip','vat_export','employee','supplier','invoice') AND created_at >= NOW() - INTERVAL '7 days'` returns an empty set — consistent with the "never delete" rule)

### 6.5 Capacity planning

- [ ] Peak RSS over 7d is documented and compared to the `HighMemoryUsage > 1 GiB` threshold. If it is within 80% of the threshold, file a note to bump it after root-cause investigation.
- [ ] Peak queue depth is documented and compared to the proposed `> 5000` threshold.
- [ ] Peak DB pool in use is documented.

---

## 7. Go / No-Go on post-release monitoring

Sign off on this section at the end of the T+7d review. **All three must be `GO`.**

| Item                                                         | Status       | Notes |
|--------------------------------------------------------------|--------------|-------|
| No SLO breach over the full 7d window                        | GO / NO-GO   |       |
| No critical alert paged on-call more than once               | GO / NO-GO   |       |
| No compliance-relevant `DELETE` in `audit_logs`              | GO / NO-GO   |       |
| No monotonic RSS/CPU/pool/queue climb                        | GO / NO-GO   |       |
| Every business pipeline (payroll, VAT, bank match) ran green | GO / NO-GO   |       |
| Backup ran green every day                                   | GO / NO-GO   |       |

### 7.1 Final release verdict (T+7d)

- [ ] **GO** — release is blessed as stable. Monitoring moves to standard cadence (see `QA-20-slo-targets.md` §Review cadence).
- [ ] **GO-WITH-FOLLOWUP** — stable but one or more follow-up tickets are open. List them below.
- [ ] **NO-GO** — one or more gates above failed. Trigger the rollback procedure in `QA-20-incident-response.md` §Rollback.

#### Follow-up tickets (for `GO-WITH-FOLLOWUP`)

| ID | Title | Severity | Owner | Target |
|----|-------|----------|-------|--------|
|    |       |          |       |        |
|    |       |          |       |        |

---

## 8. Sign-off

| Role              | Name                         | Date        | Decision |
|-------------------|------------------------------|-------------|----------|
| Release manager   |                              |             |          |
| On-call primary   |                              |             |          |
| SRE lead          |                              |             |          |
| QA-20 Agent       | Claude (Monitoring agent)    | 2026-04-11  | template ready |
| Owner             | Kobi Elkayam                 |             |          |
| CEO               | Techno-Kol Uzi               |             |          |

_This checklist is versioned with every release. Do not edit in place — copy to `_qa-reports/releases/<tag>/QA-20-post-release-checklist.md` before filling in._
