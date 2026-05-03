# AGENT-260 — Backend Cron Jobs Audit

**Agent:** 260 (BACKEND #5)
**Date:** 2026-04-29
**Scope:** Scheduled jobs — dunning, reminder emails, FX rate sync, mat-view refresh, payslip generation, BL Form 102 monthly, fiscal close.

---

## 1. Executive Summary

| # | Job | Target Cadence | Implementation State | Wired & Running? |
|---|---|---|---|---|
| 1 | Dunning (collections) | Daily 09:00 | Engine exists; **no scheduler entry** | NO |
| 2 | Reminder emails (supplier invoice) | Daily/On-demand | `sendSupplierReminder()` only; **no cron** | NO |
| 3 | FX rate sync (BoI) | Every 20 min, business hours | Two engines exist; one scheduler in stash | PARTIAL (stash only) |
| 4 | Mat-view refresh | Every 5 min | pg_cron schedule in migration | YES (DB-side) |
| 5 | Payslip generation | Monthly day-25 | Reminder-only stub; **no generator job** | NO (reminder only) |
| 6 | BL Form 102 (monthly) | Monthly day-15 | `form-102.js` engine + due-date logic; **no cron entry** | NO |
| 7 | Fiscal close (year-end) | Annual on close | DB function `finance.close_fiscal_year()`; **manual RPC only** | NO (manual) |

**Bottom line:** A robust zero-dep cron framework exists in `onyx-procurement/src/jobs/` (12 default jobs) but the **runner is never bootstrapped** by `onyx-procurement/server.js` or `api-server/src/index.ts`. Of the 7 jobs in scope, **only 1** (mat-view refresh via pg_cron) is actually scheduled in production code.

---

## 2. Inventory of Schedulers

### 2.1 ONYX zero-dep scheduler (Agent-77)
- File: `onyx-procurement/src/jobs/scheduler.js` (~720 LOC)
- Registry: `onyx-procurement/src/jobs/jobs-registry.js` — 12 `DEFAULT_JOBS`
- Runner: `onyx-procurement/src/jobs/jobs-runner.js` (`bootstrap()` + `runAsWorker()`)
- Docs: `onyx-procurement/docs/SCHEDULED_JOBS.md`
- **Status:** Self-contained, well-tested. **Never imported** by `server.js`.
  - `Grep "jobs-runner|registerAdminRoutes" onyx-procurement/server.js` -> 0 hits.
  - `ONYX_JOBS_INLINE` env switch documented but no consumer.

### 2.2 `node-cron` schedulers (techno-kol-ops)
- `techno-kol-ops/src/ai/brainEngine.ts:1262-1306` -- 9 cron entries (1m / 5m / 30m / 1h / 06:30 / 12:00 / 17:00 / Sun 08:00 / 1st-of-month 07:00).
- `techno-kol-ops/src/realtime/autonomousEngine.ts:8+` -- 30s / 5m / 1h / 07:00 weekday.
- These are AI/operational jobs, **not** the finance jobs in scope.

### 2.3 setInterval (api-server)
- `api-server/src/index.ts:65-95` -- memory monitor (60s) + DB backup hourly via `backup-db.sh`.
- `api-server/src/middlewares/request-logger.ts:24` -- log flush.
- `api-server/src/services/server-health-monitor.ts:62` -- health timer.
- `api-server/src/lib/ai-workflow-agent.ts:244` / `routes/ai-smart-alerts.ts:215` -- AI alert poll.
- **None** of the in-scope jobs run here.

### 2.4 pg_cron (Postgres)
- `supabase/migrations/00087_analytics_views.sql:390-421` -- mat-view refresh `*/5 * * * *`.
- **Only** Supabase-side scheduler in repo.

### 2.5 Edge Function (Supabase)
- `supabase/functions/refresh-read-models/index.ts` -- HTTP-triggered refresh of mat views, queue, exec snapshot, overdue invoices. **No schedule binding** in Supabase config visible in repo.

---

## 3. Per-Job Audit

### 3.1 Dunning (Collections)
- **Target schedule:** Daily 09:00 (review aging buckets days 1/7/15/30/45/60).
- **Engine:** `onyx-procurement/src/collections/dunning.js` -- 7-stage state machine, bilingual templates, BoI-prime cap, anti-harassment 72h gate, statute-of-limitations.
- **Public APIs:** `runDunning(asOf)`, `sendReminder()`, `recordPayment()`, `flagDispute()`, `agingReport()`, `writeOff()`.
- **Cron entry:** NONE. No `runDunning` call in `jobs-registry.js` `DEFAULT_JOBS`.
- **Closest hit:** `overdue-invoices-alert` cron `0 9 * * *` writes a reminder JSONL stub (`runOverdueInvoicesAlert`) -- **does not invoke `runDunning`**.
- **Status:** ENGINE-READY / NOT-SCHEDULED.

### 3.2 Reminder Emails
- **Target schedule:** Daily/on-demand for late suppliers.
- **Implementation:** `desktop-tutorial-server/src/services/reminder.service.js` -- `sendSupplierReminder(supplierId, method)`, hooks SMTP via nodemailer, WhatsApp via Graph API.
- **Cron entry:** NONE. The function is callable via API only -- there is no scheduler that walks suppliers and dispatches reminders.
- **Status:** ON-DEMAND ONLY / NOT-SCHEDULED.

### 3.3 FX Rate Sync
- **Target schedule:** Every 20 min during business hours (Sun-Fri 07:00-20:00 IL).
- **Engines:**
  - `onyx-procurement/src/fx/fx-engine.js` -- BoI XML pluggable fetcher, daily cache, IAS-21 rules, 12-currency basket.
  - `onyx-procurement/src/finance/fx-hedging.js` -- hedging layer.
- **Scheduler (stash):** `_merge-incoming/.../api-server/src/lib/fx-scheduler.ts` -- `setInterval` driver gated by `isBusinessHours()` and `FX_REFRESH_*` env. **Lives only in `_merge-incoming/`**; no copy in `api-server/src/lib/` of the active tree.
- **Cron entry:** NONE in active `jobs-registry.js` and not imported by active `api-server/src/index.ts`.
- **Status:** ENGINE-READY / SCHEDULER-IN-STASH / NOT-WIRED in active source tree.

### 3.4 Mat-View Refresh
- **Target schedule:** Every 5 min.
- **Implementation A (DB-side):** `supabase/migrations/00087_analytics_views.sql:406-410` --
  ```sql
  perform cron.schedule(
    'analytics_refresh_dashboard_matviews',
    '*/5 * * * *',
    $job$ select analytics.refresh_dashboard_matviews(); $job$
  );
  ```
  Refreshes 4 matviews: `mv_executive_summary`, `mv_customer_health`, `mv_project_health`, `mv_supplier_performance` (declared in `refresh-read-models/index.ts:13`).
- **Implementation B (Edge):** `supabase/functions/refresh-read-models/index.ts` -- same logic + invalidation queue + `mark_overdue_invoices`. No schedule binding visible.
- **Status:** SCHEDULED via pg_cron (guarded `if exists pg_extension where extname='pg_cron'`); falls back to `raise notice 'pg_cron not installed; scheduling skipped'`. Edge function is HTTP-only.

### 3.5 Payslip / Wage Slip Generation
- **Target schedule:** Monthly day-25 (compute and emit slips before month-end).
- **Cron entry:** `monthly-wage-slip` cron `0 9 25 * *` in `DEFAULT_JOBS`.
- **Handler:** `runMonthlyWageSlip(ctx)` in `jobs-registry.js:121-128` -- writes a **reminder JSONL** at `data/reminders/wage-slip.jsonl`. **Does not actually compute payroll or emit slips.**
- **Engine reality:** No `payslip` / `generatePayslip` function found in `onyx-procurement` or `payroll-autonomous` (only e2e test fixtures `compute-wage-slip.spec.js`). `payroll-autonomous` UI references payslips but the back-end generator is missing.
- **Status:** REMINDER STUB ONLY / NO GENERATOR.

### 3.6 BL Form 102 (Monthly Withholding)
- **Target schedule:** Monthly by day 15 (filing+payment deadline per Bituach Leumi sec. 355).
- **Engine:** `onyx-procurement/src/tax/form-102.js` -- aggregator + `dueDateFor({year,month})` + `submitXML102()` stub for online filing.
- **Cron entry:** NONE. No `monthly-form-102` job in `DEFAULT_JOBS`. `monthly-vat-reminder` (cron `0 9 10 * *`) is for VAT, not Form 102.
- **Status:** ENGINE-READY / NOT-SCHEDULED. Monthly aggregation is invoked only via direct API or test fixtures.

### 3.7 Fiscal Close (Year-End)
- **Target schedule:** Annual; triggered manually after FY-12 lock + checklist completion.
- **DB layer:** `supabase/migrations/00086_year_end_close.sql` (AGENT-248) creates:
  - `finance.fiscal_period_locks`
  - `finance.closing_journal_entries`
  - `finance.tax_provision_log`
  - `finance.fy_close_checklist`
  - `finance.close_fiscal_year(p_year int)` -- verifies 12 monthly periods locked, all checklist `blocks_close=true` rows closed, flips `fiscal_years.status='closed'`, emits closing JE.
- **JS layer:** YEAR_END_CLOSE / TAX_PROVISION primitives flagged PARTIAL by AGENT-163 audit (`_qa-reports-25/AGENT-163-year-end-close.md`, `AGENT-229-year-end-close.md`).
- **Cron entry:** NONE -- intentionally manual (RPC). No `annual-close` cron in `DEFAULT_JOBS`.
- **Closest hit:** `annual-tax-reminder` cron `0 8 1 1 *` writes Jan-1 filing reminder; does not invoke `close_fiscal_year`.
- **Status:** DB-READY / MANUAL-RPC / NOT-CRONNED (acceptable design but undocumented for ops).

---

## 4. Wiring Verdict

| Surface | Cron framework available? | Bootstrapped at startup? |
|---|---|---|
| `onyx-procurement/server.js` | YES (Agent-77 framework) | NO -- no `require('./src/jobs/jobs-runner')` |
| `api-server/src/index.ts` | NO (raw `setInterval`) | partial -- DB backup hourly only |
| `techno-kol-ops/src/index.ts` | YES (`node-cron` direct) | YES -- AI/ops jobs only |
| Supabase pg_cron | YES | YES -- 1 job (`analytics_refresh_dashboard_matviews`) |
| Supabase Edge Functions | -- | `refresh-read-models` deployed but no Supabase schedule binding in repo |

**Effective production coverage of in-scope jobs: 1 of 7** (mat-view refresh).

---

## 5. Gaps & Action Items

| # | Gap | Severity | Fix |
|---|---|---|---|
| G1 | `jobs-runner.js` never bootstrapped | HIGH | Add `require('./src/jobs/jobs-runner').bootstrap({logger}); runner.scheduler.start();` in `onyx-procurement/server.js` (gate on `ONYX_JOBS_INLINE=1`). |
| G2 | `runDunning` not registered as a job | HIGH | Replace `runOverdueInvoicesAlert` reminder-stub with a real handler that calls `dunning.runDunning(new Date())`. |
| G3 | Reminder emails have no cron | MED | Register `daily-supplier-reminders` job that walks `suppliers` with overdue expected invoices and calls `sendSupplierReminder()`. |
| G4 | FX scheduler lives in `_merge-incoming` only | HIGH | Move `fx-scheduler.ts` into `api-server/src/lib/`, import from `index.ts`, gate on `FX_REFRESH_DISABLED` env. |
| G5 | `runMonthlyWageSlip` is a reminder, not a generator | HIGH | Implement `payroll-autonomous` payslip generator and invoke from the cron handler. |
| G6 | No `monthly-form-102` job | HIGH | Add `DEFAULT_JOBS` entry: cron `0 9 14 * *` -> `form-102.aggregate(prevMonth)` + `submitXML102()`. |
| G7 | Fiscal close has no scheduled reminder/checklist sweep | LOW | Optional: add weekly job that emits `fy_close_checklist` open-items report. |
| G8 | No Supabase Edge schedule binding for `refresh-read-models` | MED | Add `supabase/config.toml` schedule or Supabase Cron mapping; otherwise the edge function is dormant. |

---

## 6. Cross-References
- Engine source: `onyx-procurement/src/jobs/scheduler.js`, `jobs-registry.js`, `jobs-runner.js`
- Engine docs: `onyx-procurement/docs/SCHEDULED_JOBS.md`
- Dunning: `onyx-procurement/src/collections/dunning.js`
- FX: `onyx-procurement/src/fx/fx-engine.js`; stashed scheduler `_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/artifacts/api-server/src/lib/fx-scheduler.ts`
- Form 102: `onyx-procurement/src/tax/form-102.js`
- Mat-view refresh: `supabase/migrations/00087_analytics_views.sql`, `supabase/functions/refresh-read-models/index.ts`
- Year-end close: `supabase/migrations/00086_year_end_close.sql`
- Reminder service: `desktop-tutorial-server/src/services/reminder.service.js`
- Prior audits: `_qa-reports-25/AGENT-163-year-end-close.md`, `_qa-reports-25/AGENT-229-year-end-close.md`, `_qa-reports-25/AGENT-134-form-102.md`
- Existing cron QA: `onyx-procurement/QA-AGENT-84-CRON.md`

---

## 7. Risk Assessment
- **Production financial impact:** Without dunning + Form 102 + payslip jobs scheduled, the system depends entirely on manual operator runs. AR aging will not auto-progress, monthly Form 102 filing will not auto-submit (statutory day-15 deadline), and payslips will not generate.
- **Data freshness:** Mat-view refresh works (pg_cron) but only when the Supabase project has `pg_cron` extension enabled; otherwise everything stales silently because of the `if exists` guard.
- **Operational visibility:** The admin endpoints `GET /api/admin/jobs` exist in `jobs-runner.js` but are never mounted -- no UI surfaces "what jobs ran when".

**Recommendation:** Land G1+G4 first (lowest-risk wiring), then G2/G5/G6 (financial automation parity).
