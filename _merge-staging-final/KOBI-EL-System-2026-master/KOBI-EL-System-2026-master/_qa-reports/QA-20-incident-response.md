# QA-20 — Incident Response Playbook

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Agent       | QA-20 Monitoring & Post-Release Agent                        |
| Owner       | Techno-Kol Uzi / Kobi Elkayam Real Estate                    |
| Doc type    | Incident response playbook (runbook of runbooks)             |
| Scope       | Onyx Procurement + Techno-Kol Ops + payroll + VAT            |
| Last update | 2026-04-11                                                   |
| Related     | `QA-20-monitoring-plan.md`, `QA-20-post-release-checklist.md`, `QA-20-slo-targets.md` |

> **Rule:** this playbook never deletes data, never skips audit, never force-pushes. Every mitigation below is either (a) a **read** against an existing metric/log, (b) a **restart** of a stateless process, (c) a **rollback** to the previous tagged release, or (d) a **block** at the rate-limit / WAF layer. No step rewrites business data.

---

## 0. Glossary

| Term        | Meaning                                                               |
|-------------|-----------------------------------------------------------------------|
| SEV-1       | Money-moving pipeline down (payroll, VAT, bank match) **or** full API outage. Response SLA: **15 min**. |
| SEV-2       | Partial outage, critical alert firing, but money-movers still running. Response SLA: **1h**. |
| SEV-3       | Warning alert, no immediate business impact. Response SLA: **next business hour**. |
| SEV-4       | Info alert, routine review. No SLA.                                   |
| IC          | Incident Commander — the one person driving the response.            |
| OC-1 / OC-2 | Primary / secondary on-call.                                         |
| MTTR        | Mean time to recover (wall-clock from first alert to `status: resolved`). |
| Rollback tag| The immediately-preceding released tag that was known-good.          |

---

## 1. Roles during an incident

One person is the **Incident Commander** (IC) at any given time. The IC:

1. **Declares severity.**
2. **Owns the timeline.** Writes a running log to the incident channel with UTC + IST timestamps.
3. **Is the single source of truth for mitigation status.** No one else tells the customer or the CEO anything until the IC says so.
4. **Hands off explicitly** if fatigue / off-shift / conflict of interest requires it.

Default IC assignment:

- SEV-1 → primary on-call (OC-1) starts as IC, escalates to SRE lead within 10 minutes.
- SEV-2 → OC-1 is IC until the incident is mitigated.
- SEV-3 → OC-1 is IC, may downgrade to "track in backlog" after 30 min if no customer impact.
- SEV-4 → no IC. Logged as a ticket.

---

## 2. Alert → action map

Every row below is tied to a rule in `onyx-procurement/ops/alerts/rules.yml` (existing) or a QA-20 proposal (§4.2 of the monitoring plan).

### 2.1 `HighErrorRate` — 5xx rate > 5% for 2m (existing, critical)

**Severity classification:** SEV-1 if the whole API is down, SEV-2 if only one route.

1. **Triage (first 60 seconds):**
   - Open the Operations dashboard. Check `sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))` — is the spike localised to one route or global?
   - Check `process_uptime_seconds` — if it just reset to `< 60`, a crash loop is possible.
   - Tail `onyx-procurement/logs/errors.jsonl` and look at the **newest distinct fingerprint**. That one line tells you the error signature.
     ```bash
     tail -n 20 onyx-procurement/logs/errors.jsonl | jq -r '.timestamp + " " + .fingerprint + " " + .message' | tail
     ```

2. **Mitigate:**
   - **Global** → immediate rollback to the previous tag (see §5). No debugging on production during a SEV-1.
   - **One route** → temporarily disable that route at the reverse-proxy or feature-flag layer, if such a toggle exists. Never edit code live on production.
   - **Crash loop** → `systemctl restart onyx-procurement` (or container equivalent). If the restart loop continues after 2 attempts, roll back.

3. **Verify:**
   - 5xx rate drops below 1% within 2 minutes.
   - `/healthz` returns 200 on 10 consecutive probes.
   - No new error fingerprints in the last minute.

4. **Post-mortem required.** Root-cause within 48h, write-up within 7d.

### 2.2 `SlowDBQueries` — DB p95 > 2s for 5m (existing, warning)

**Severity:** SEV-2 if customers are blocked, SEV-3 otherwise.

1. **Triage:**
   - Is this a Supabase-side issue or an Onyx-side issue? Check the Supabase status page.
   - Check `db_pool_in_use` (if wired). Near-exhaustion signals a lock/backlog problem.
   - Pull the pg slow-query log for the last 5 minutes.

2. **Mitigate:**
   - **Supabase-side** → read §2.8 (Supabase down) and treat as SEV-1.
   - **Missing index / bad query** → short-term: kill the offending long-running queries with `SELECT pg_cancel_backend(pid)` **only if** you can identify the specific PID and it belongs to a background job, never a user transaction. Long-term: add the missing index in a **new migration**.
   - **Lock contention** → identify the blocker via `pg_locks`, contact the owner of the transaction.

3. **Verify:** DB p95 drops below 500ms within 5 minutes.

### 2.3 `HighMemoryUsage` — RSS > 1 GiB for 10m (existing, warning)

**Severity:** SEV-2 if approaching OOM (>2 GiB), SEV-3 at 1–1.5 GiB.

1. **Triage:**
   - Is the growth linear (leak) or sawtooth (GC pressure)?
   - Which process is the culprit? `ps aux | grep node` on the host.
   - Check `nodejs_eventloop_lag_seconds` (if wired). High lag + high RSS = heap pressure.

2. **Mitigate:**
   - **Linear leak** → graceful restart with `pm2 gracefulReload` or rolling container restart. Do **not** kill abruptly during business hours.
   - **Sawtooth / GC** → bump `--max-old-space-size` for the next release (never live on production), monitor.

3. **Verify:** RSS drops below 500 MB after restart and stays there for 30 min.

### 2.4 `LowDiskSpace` — < 10% free for 15m (existing, critical)

**Severity:** SEV-1 if writes will fail imminently, SEV-2 otherwise.

1. **Triage:**
   - `df -h` — which mount? (logs? DB? WAL? object storage?)
   - `du -sh /path/*` — what's the biggest offender?

2. **Mitigate:**
   - **Log flood** → the error-tracker rotation is 10 MB × 5 = 60 MB, so it's almost never errors.jsonl. It's usually pino-stdout if the log shipper is down. Restart the log shipper.
   - **DB WAL** → check Supabase-side; this is a cloud-vendor problem.
   - **Temp files** → clean `/tmp` older than 24h. **Never** touch `/var/log/journal` or `backup/` without a second engineer confirming.

3. **Verify:** Free space returns above 25% and the alert auto-resolves.

### 2.5 `FailedWebhookDeliveries` — > 5 failed in 10m (existing, warning)

**Severity:** SEV-3 normally, SEV-2 if the failing webhook is financial (bank, payment provider, Tax Authority).

1. **Triage:**
   - Look at the dead-letter queue (DLQ). What's the distribution of failure reasons?
   - Is the destination down (503 / connection refused) or is our payload rejected (400 / 422)?

2. **Mitigate:**
   - **Destination down** → enable the retry backoff, then wait for the destination to come back.
   - **Payload rejected** → we shipped a bad payload. File a ticket, check if rollback of the recent release fixes it.
   - **Credential issue (401)** → rotate the integration secret via the secrets manager, **never commit the new secret to git**.

3. **Verify:** DLQ stops growing, then drains.

### 2.6 `MissingDailyBackup` — > 25h since last success (existing, critical)

**Severity:** SEV-1.

1. **Triage:**
   - Check the backup scheduler logs.
   - Is the backup **destination** reachable (object storage credentials, network)?

2. **Mitigate:**
   - Trigger a manual backup immediately:
     ```bash
     pg_dump "$DATABASE_URL" | gzip > backups/manual-$(date +%Y%m%dT%H%M%S).sql.gz
     ```
   - Verify the dump is non-empty and parseable.
   - Upload to the offsite destination.
   - Fix the scheduler, then confirm tomorrow's run by watching `backup_last_success_timestamp` increment.

3. **Verify:** The metric reflects the manual backup within 5 minutes (`time() - backup_last_success_timestamp < 300`).

### 2.7 `PayrollGenerationFailures` — any failed slip (existing, critical, **hard legal deadline**)

**Severity:** SEV-1. **This is a money-moving pipeline with a legal deadline (9th of the following month).**

1. **Triage:**
   - Look at the failed slip(s): `jq 'select(.message | test("payroll.slip.failed"))' onyx-procurement/logs/errors.jsonl | tail`
   - Is it a specific employee's data (master-data issue) or a template/code issue (affects all)?

2. **Mitigate:**
   - **Master-data issue (one employee)** → fix the employee record via the HR UI. Re-run the slip generation for that employee only. **Never** hand-edit a slip PDF — the audit trail would be broken.
   - **Template / code issue (all employees)** → immediate rollback to the previous tag. The 9th-of-the-month deadline is non-negotiable.
   - **Tax Authority API down** → retry with backoff. If it's still down 6h before deadline, escalate to the CFO + Techno-Kol Uzi.

3. **Verify:**
   - Run a smoke slip for one employee and confirm it renders correctly.
   - Confirm the `audit_logs` entry with `resource='payroll_slip' AND action='ISSUE'` exists for the remediated slip.

4. **Post-mortem:** **Always required.** Payroll failures have regulatory implications.

### 2.8 `VATExportFailure` — any failed export (existing, critical, **hard legal deadline**)

**Severity:** SEV-1. **PCN874 deadline: 15th of the month. Form 6111 deadline: last day of the month.**

1. **Triage:**
   - Which period? Which form (PCN874 / 6111)?
   - Does the rollup in the DB show the right totals? `SELECT * FROM vat_period_rollup WHERE period = '2026-Q1'`
   - Is the Tax Authority submission endpoint reachable?

2. **Mitigate:**
   - **Rollup wrong** → do **not** edit the rollup table directly. Re-run the aggregation job. If it still produces wrong totals, roll back the recent release.
   - **Submission endpoint down** → fall back to the manual upload at the Tax Authority portal. The accountant has the credentials, not the engineer. **Do not store those credentials in the repo.**
   - **File format rejected** → validate against the Tax Authority's schema. Usually a schema regression from a recent release → rollback.

3. **Verify:** Successful submission acknowledgement from the Tax Authority. `audit_logs` row with `resource='vat_export' AND action='SUBMIT'`.

4. **Post-mortem:** **Always required.**

### 2.9 Supabase / DB appears "too quiet" (no panic signal, but Supabase is down)

**This is the silent-failure case.** A healthy DB drives `db_query_duration_seconds_count` to increment at a steady rate. If that counter stops climbing while HTTP traffic continues, the application has lost its DB connection and is silently serving cached / stale data — or failing in a way that doesn't trip `HighErrorRate`.

**Detection:**

```promql
# The DB counter should grow at roughly the rate of HTTP requests.
# Alert if DB count delta is ~0 while HTTP count is still climbing.
increase(db_query_duration_seconds_count[5m]) == 0
and
increase(http_requests_total[5m]) > 10
```

This is a **proposed QA-20 rule** (`SilentDBStall`, warning, QA-20 addition) because the existing rules only fire on explicit failure.

**Severity:** SEV-1. This is more dangerous than an explicit outage because users think things are working.

**Triage:**
1. Hit the Supabase status page.
2. Try a direct `psql $DATABASE_URL -c 'SELECT 1'` from the app host.
3. If the direct psql works but the app is stalled, the pool is stuck — graceful restart.

**Mitigate:**
- **Supabase down** → flip the app into **read-only / maintenance mode** (display a banner, disable writes). Wait for Supabase to recover. Do **not** attempt failover unless an official standby is wired.
- **Pool stuck** → graceful restart.

**Verify:** `db_query_duration_seconds_count` climbs again. Write-path smoke test passes.

### 2.10 `Suspicious4xxSpike` (QA-20 proposed)

**Severity:** SEV-3, escalates to SEV-2 if a credential leak is suspected.

1. **Triage:**
   - Per-route breakdown of the 4xx spike.
   - Per-IP breakdown — is it one client hammering, or distributed?
   - Status code mix — 401/403 points at auth, 429 at rate-limit, 400/422 at payload.

2. **Mitigate:**
   - **One IP, 401/403** → block at the rate-limit layer for 1h (it's either a credential leak or a scanner).
   - **Many IPs, 400** → a recent release broke a contract — check the deploy diff, consider rollback.
   - **429 flood** → rate limit is doing its job; if the flood is legitimate traffic, widen the limit in a new release (never live-edit).

3. **Verify:** 4xx rate returns to baseline within 15 minutes.

### 2.11 Other alerts

Every other rule in `rules.yml` follows the same template:
1. Read the existing `runbook_url` → follow the steps.
2. If the runbook page does not exist yet, the IC drafts a skeleton during the incident itself and files a follow-up to publish it within 7d. Never leave a fired alert without a runbook.

---

## 3. Incident log template

Every SEV-1 and SEV-2 must produce an incident log. Copy this to `_qa-reports/incidents/INC-YYYYMMDD-<short>.md` and fill in.

```markdown
# INC-YYYYMMDD-<short> — <one-line title>

| Field          | Value                           |
|----------------|---------------------------------|
| Severity       | SEV-1 / SEV-2 / SEV-3 / SEV-4   |
| Detected at    | <UTC> / <IST>                   |
| Resolved at    | <UTC> / <IST>                   |
| Duration       | <HH:MM>                         |
| IC             | <name>                          |
| Responders     | <names>                         |
| Customer impact| <text>                          |
| Money impact   | <text, if any>                  |
| Compliance?    | yes / no                        |

## Timeline

- HH:MM — alert fired (`<alert name>`)
- HH:MM — IC acknowledged, severity declared
- HH:MM — first hypothesis
- HH:MM — mitigation attempt 1: <what>
- HH:MM — verification: <what>
- HH:MM — all-clear

## Root cause

<text>

## Mitigation

<text>

## What worked

<text>

## What didn't

<text>

## Action items

- [ ] <owner>: <item> (target: <date>)
- [ ] <owner>: <item> (target: <date>)
```

---

## 4. Post-mortem rules

1. **Blameless.** The point is system improvement, not finger-pointing.
2. **Required for:** every SEV-1, every SEV-2 that affects money or data, every compliance-relevant event.
3. **Owner:** the IC.
4. **Deadline:** draft within 48h, published within 7d.
5. **Outcome:** every post-mortem produces **at least one action item** (a threshold change, a new rule, a runbook update, a test, a refactor). An incident that produces zero action items is suspicious — it usually means the root cause was not actually found.

---

## 5. Rollback procedure

Rollback is the **safest mitigation for a bad release**. The rule is: **roll back first, debug second.**

### 5.1 Preconditions

- The rollback tag must be known **before** the release goes out (fill in `QA-20-post-release-checklist.md` §0 before Go).
- The rollback tag must be a known-good release — usually the immediately-preceding one.
- The database schema must be **backwards-compatible** with the rollback tag. The release rule is: migrations are additive only, drops happen in the release **after** the code stops using the column. This guarantees rollback safety for one release step.

### 5.2 Steps

1. **Announce.** IC posts `ROLLBACK INITIATED — <tag> → <rollback-tag>` to the incident channel.
2. **Checkout.**
   ```bash
   git fetch --tags
   git checkout <rollback-tag>
   ```
3. **Build.** Use the identical build pipeline as the forward release — do **not** build from a local machine.
4. **Deploy.** Use the identical deploy pipeline.
5. **Verify.** Run the T+0 smoke block from `QA-20-post-release-checklist.md` §1.
6. **Announce.** IC posts `ROLLBACK COMPLETE, <rollback-tag> LIVE`.

### 5.3 Anti-patterns (do **not** do these)

- **Do not** `git reset --hard` on a production branch.
- **Do not** `git push --force`.
- **Do not** skip CI / hooks during a rollback.
- **Do not** hand-edit files on the production host.
- **Do not** partially roll back (one service but not another) unless the services are explicitly decoupled and versioned independently.
- **Do not** roll back the database schema in the same step as the code — schema rollback needs its own review.

### 5.4 Forward-fix alternative

If rollback is not safe (e.g. the database schema would be incompatible because it is more than one release step behind), the only remaining option is a **forward fix**: a brand-new release that reverts the problem commit on top of `main` and re-ships. Treat this like any other release — code review, CI, staged rollout. **Never** skip review during an incident.

---

## 6. Communication matrix

| Audience       | When                             | Channel                    | Template                                              |
|----------------|----------------------------------|----------------------------|-------------------------------------------------------|
| On-call team   | instantly                        | WhatsApp / SMS / Slack     | alert payload + `runbook_url`                         |
| SRE lead       | SEV-1 ack, SEV-2 at +30 min      | direct call                | "SEV-X incident, I'm IC, <1-line summary>"            |
| CFO            | SEV-1 that touches money, always | direct call                | "Incident affecting <payroll/VAT/bank>, details in channel" |
| Techno-Kol Uzi | SEV-1, SEV-2 on money, at +30 min | direct call                | "Know about this, action is being taken, ETA <time>"  |
| Customers      | SEV-1, SEV-2 at +15 min          | status page / WhatsApp     | "We are experiencing <X>. Next update in <Y> minutes." |
| Auditors       | only after resolution            | email (never during)       | post-mortem doc                                        |

**Golden rule:** the IC, and only the IC, talks to customers and the CEO during an incident. Everyone else focuses on mitigation.

---

## 7. Escalation matrix

```
OC-1 (primary)
  │
  ├─ 10 min no ack ──> OC-2 (secondary)
  │                      │
  │                      └─ 10 min no ack ──> SRE lead
  │
  ├─ SEV-1 declared ─────> SRE lead immediately
  │
  └─ money pipeline ─────> CFO + Techno-Kol Uzi (owner)
```

---

## 8. What QA-20 explicitly does **not** cover

- **Legal response** to a breach. That is the CISO + legal counsel.
- **Tax Authority communication** for missed deadlines. That is the CFO + accountant.
- **Credential rotation** for compromised secrets. That is SRE + security, following the secrets-management runbook (not in this repo).
- **Restore from backup** to a point-in-time. That is the DBA runbook.

If any of those are needed mid-incident, the IC escalates and **hands off** — they are not in QA-20's scope.

---

## 9. Sign-off

| Role              | Name                         | Date        | Decision |
|-------------------|------------------------------|-------------|----------|
| QA-20 Agent       | Claude (Monitoring agent)    | 2026-04-11  | ready    |
| SRE lead          |                              |             |          |
| CISO              |                              |             |          |
| CFO               |                              |             |          |
| Owner             | Kobi Elkayam                 |             |          |
| CEO               | Techno-Kol Uzi               |             |          |

_This playbook never touches business data. Every mitigation is a read, a restart, a rollback, or a block._
