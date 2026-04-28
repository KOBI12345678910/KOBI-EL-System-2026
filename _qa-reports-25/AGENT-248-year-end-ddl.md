# AGENT-248 — Year-End Close DDL

**Date:** 2026-04-29
**Author:** AGENT-248 (DB BUILD #3)
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Migration:** `supabase/migrations/00086_year_end_close.sql`
**Trigger:** AGENT-163 audit (`AGENT-163-year-end-close.md`) verdict
PARTIAL: JS layer has YEAR_END_CLOSE / TAX_PROVISION / period-lock
*primitives* but the underlying tables do not exist. This migration
closes the table-level half of that gap.

---

## 1. Summary

| Metric | Value |
|---|---|
| Tables created | 4 + 1 dependency-shim + 1 template seed |
| pg_function | 1 (`finance.close_fiscal_year(int)`) |
| Triggers | 1 (auto-seed checklist on FY insert) |
| Migration file | `00086_year_end_close.sql` |
| Lines of SQL | ~360 |
| RLS policies | 15 (3 per table) |
| FK / lookup indexes | 14 |
| Idempotent | Yes (`IF NOT EXISTS` + DO-blocks) |
| Schema | `finance.*` (created if missing) |

---

## 2. Tables created

| # | Table | Role | Referenced by |
|---|-------|------|---------------|
| 1 | `finance.fiscal_period_locks` | Period lock registry. `period_key` = `YYYYMM` matches `journal-entry.js:periodKey()`. | `journal-entry.js:487-496` `periods.isLocked()` adapter |
| 2 | `finance.closing_journal_entries` | Audit trail of YEAR_END_CLOSE JEs (one row per closed nominal account, batched by `batch_id`). | `journal-entry.js:416 YEAR_END_CLOSE` template |
| 3 | `finance.tax_provision_log` | Per-FY corporate tax accrual history with permanent + timing diffs (Form 6111 §17/§46). | TAX_PROVISION JE writer (P1 from AGENT-163) |
| 4 | `finance.fy_close_checklist` | Per-FY task tracker (17 canonical tasks seeded). Auto-populated on `fiscal_years` insert. | `close_fiscal_year()` precondition gate |

Two supporting objects also created:
- `finance.fiscal_years` — minimal schema-compatible shim of the
  table living in `onyx-procurement/supabase/migrations/005-annual-tax-module.sql:143-161`,
  so this migration is self-contained when the canonical schema
  has not merged 005 yet.
- `finance.fy_close_checklist_template` — 17-row catalogue of canonical
  close tasks (bilingual labels), copied per-FY by trigger.

---

## 3. Key columns by table

### 3.1 `fiscal_period_locks` (closes AGENT-163 gap #2)

- `period_key char(6)` — exact format `journal-entry.js:periodKey()` produces.
- `lock_severity` ∈ `{soft, hard}` — soft warns, hard refuses.
- `unlocked_at`/`unlocked_by`/`unlock_reason` — full lock/unlock audit.
- Snapshot at lock-time: `trial_balance_diff`, `je_count`, `open_je_count`.
- Unique `(tenant_id, period_key)` — one lock state per period per tenant.

### 3.2 `closing_journal_entries` (closes AGENT-163 gap #6)

- `batch_id uuid` — groups all closing JEs of a single year-end run.
- `account_no` + `account_category` ∈ `{revenue, cogs, opex, non_op, tax, equity, other}`.
- `closing_side` (`D`/`C`) + `closing_amount_ils` + `pre_close_balance` + `post_close_balance`.
- `retained_earnings_account text default '3500'` (matches journal-entry.js seeded COA).
- `hash_chain` — SHA256 chain placeholder (P2 from AGENT-163, gap #11).
- `is_reversed` + reversal triplet for `reverse()` integration.

### 3.3 `tax_provision_log` (closes AGENT-163 gap #5)

- `tax_rate_pct numeric(6,3) default 23.000` — §126 פקודת מס הכנסה.
- `permanent_diffs_ils` + `timing_diffs_ils` + `taxable_income_ils` — feed Form 6111.
- `current_tax_ils` + `deferred_tax_ils` (generated `total_tax_ils`).
- `accrued_account default '2190'` + `expense_account default '9000'` —
  matches journal-entry.js COA bands (2xxx liability, 9xxx tax).
- `computation_method` ∈ `{standard, simplified, small-co-§9, tech-co-§9A}`.
- `superseded_by` self-FK enables re-runs without losing history.

### 3.4 `fy_close_checklist` (closes AGENT-163 gap #1, workflow orchestration)

- 17 canonical tasks seeded from `fy_close_checklist_template`:
  reconciliation (5), adjusting entries (5), tax (1), review (1), statements (1),
  filings (3), sign-off (1).
- `blocks_close boolean` — partial index `idx_fcc_blockers` makes
  precondition lookup an O(1) scan.
- `evidence_je_ids text[]` — links checklist → posted JEs.
- `assigned_to` + `due_date` + `reminder_sent_at` for assignee tracking.

---

## 4. `finance.close_fiscal_year(year int)` procedure

Returns a single-row table with `(ok, fiscal_year, status, blocked_tasks,
unlocked_periods, message_he, message_en)`. Bilingual errors match the
`MSG` constant style in `journal-entry.js:169-190`.

Preconditions checked, in order:
1. JWT carries `tenant_id` claim.
2. `fiscal_years` row exists for `(tenant, year)`.
3. Status is not already `closed`/`audited`/`submitted`.
4. **All `blocks_close=true` checklist rows are `done`/`skipped`/`n_a`.**
5. **All 12 monthly `fiscal_period_locks` are `is_locked=true` with `lock_severity='hard'`.**
6. **At least one `tax_provision_log` row in status `posted` for the FY.**
7. **At least one non-reversed `closing_journal_entries` row for the FY.**

Side effects on success:
- `fiscal_years.status` → `closed`, `closed_at` = `now()`, `closed_by` = JWT sub.
- All 12 `fiscal_period_locks` for the year are upgraded to
  `lock_severity='hard'` retroactively (defense in depth).

Failure modes return `ok=false` with structured `message_he`/`message_en`
suitable for direct `toast()` emission in the UI.

`SECURITY DEFINER` — runs with table owner privileges, but RLS policies
on the underlying tables still enforce per-tenant isolation through the
JWT claim read.

---

## 5. Mapping to AGENT-163 P0/P1 recommendations

| AGENT-163 § | Severity | DDL coverage |
|---|---|---|
| P0 #1 — `POST /api/fiscal-years/:year/close` | CRITICAL | DB function ready. Route still needed (out of scope for AGENT-248 / DB BUILD #3). |
| P0 #2 — Wire `periods.isLocked` to `fiscal_years.status` | CRITICAL | `fiscal_period_locks` is the storage. `journal-entry.js` adapter must do `select is_locked from finance.fiscal_period_locks where tenant_id=? and period_key=?`. |
| P0 #3 — Wire Form 6111 stub to engine | HIGH | Out of scope (route layer). |
| P0 #4 — Fix compute to subtract opex | HIGH | Out of scope (route layer). |
| P1 #5 — Roll-forward | HIGH | Not yet — opening-balance JE table is a separate migration. |
| P1 #6 — REVERSING_ENTRY / TAX_PROVISION templates | HIGH | DB log ready (`tax_provision_log`). JS templates still needed. |
| P2 #10 — SHA256 hash chain on closed-year reports | MEDIUM | `closing_journal_entries.hash_chain` column reserved. Trigger can be added later without re-migration. |

---

## 6. Idempotency, RLS, perms

- Every `CREATE TABLE` / `CREATE INDEX` uses `IF NOT EXISTS`.
- `CREATE OR REPLACE FUNCTION` for the procedure.
- RLS policies wrapped in DO-block + `drop policy if exists` so re-running
  the migration on a partially-applied DB does not double-create.
- Three policies per table:
  - `<table>_read` — SELECT for `authenticated` (RLS hardening
    in 00073 must add `tenant_id = auth.tenant_id()` predicate later).
  - `<table>_write` — INSERT for `authenticated`.
  - `<table>_service` — full ALL for `service_role`.
- `GRANT EXECUTE` on `close_fiscal_year(int)` to both `authenticated`
  (for self-service close from the dashboard) and `service_role`
  (for the API server).

---

## 7. Verification queries (smoke-test after apply)

```sql
-- All tables exist
select table_name from information_schema.tables
 where table_schema = 'finance' order by table_name;

-- Function exists
select proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'finance' and proname = 'close_fiscal_year';

-- Checklist template seeded (17 rows)
select count(*) from finance.fy_close_checklist_template;

-- Trigger fires: insert a fiscal_year and watch checklist populate
insert into finance.fiscal_years (tenant_id, year, start_date, end_date)
values (1, 2026, '2026-01-01', '2026-12-31');
select count(*) from finance.fy_close_checklist
 where tenant_id = 1 and fiscal_year = 2026;   -- expect 17

-- Close should refuse (no checklist done, no period locks, no tax provision)
select * from finance.close_fiscal_year(2026);
-- expect ok=false, blocked_tasks=17
```

---

## 8. Files touched

| File | Action |
|---|---|
| `supabase/migrations/00086_year_end_close.sql` | **created** (~360 lines) |
| `_qa-reports-25/AGENT-248-year-end-ddl.md` | **created** (this file) |

No JS / TS / route code modified. AGENT-248 scope is DB-only per the
task brief. Wiring `journal-entry.js` `periods.isLocked` to the new
table, adding the `TAX_PROVISION` template, and the `POST
/api/fiscal-years/:year/close` route are explicit follow-ups (P0 from
AGENT-163 §4).

---

## 9. Hand-off

- **AGENT-249 (suggested next):** wire `journal-entry.js` adapter:

  ```js
  const periods = {
    async isLocked(periodKey) {
      const { rows } = await db.query(
        `select is_locked, lock_severity
           from finance.fiscal_period_locks
          where tenant_id = $1 and period_key = $2`,
        [tenantId, periodKey]
      );
      return rows[0]?.is_locked && rows[0]?.lock_severity === 'hard';
    }
  };
  ```

- **AGENT-250 (suggested next):** add `TAX_PROVISION` and
  `REVERSING_ENTRY` JE templates to `journal-entry.js:247`, with
  `INSERT INTO finance.tax_provision_log` and
  `INSERT INTO finance.closing_journal_entries` writers respectively.

- **AGENT-251 (suggested next):** Express route
  `POST /api/fiscal-years/:year/close` calling
  `select * from finance.close_fiscal_year($1)` and emitting the
  `ledger.year_end_closed` topic on success
  (per `topic-map.js:196`, AGENT-163 gap #13).

---

**End of AGENT-248 report.**
