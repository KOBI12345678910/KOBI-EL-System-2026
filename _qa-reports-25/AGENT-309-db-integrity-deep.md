# AGENT-309 — Database Integrity Deep Audit

**Project:** Supabase `ponypxhushxeskxgrmha`
**Date:** 2026-04-29
**Live verification:** 245 tables (231 base + 14 views), 172 RLS-on, 59 RLS-off
**Scope:** required fields, FKs, duplicates, orphans, NULLs, cross-table inconsistencies, partial updates, rollback failures.

## Summary statistics (live)

| Metric | Value |
|---|---|
| Total tables (base) | 231 |
| Total views | 14 |
| RLS enabled | 172 |
| RLS disabled | 59 |
| Foreign keys | 284 (255 NO ACTION, 29 CASCADE, 0 RESTRICT, 0 SET NULL) |
| Primary keys | 231 (every base table OK) |
| UNIQUE constraints | 91 |
| CHECK constraints | 789 (mostly NOT NULL only) |
| Triggers in `public` | 9 (covering 8 tables) |
| Sequences | 9 |
| `gen_random_uuid()` defaults | 168 columns |
| `tenant_id` columns NULLABLE | 98 |
| `created_at` NULLABLE | 182 |
| `version` (optimistic-lock) columns | 9 |
| `deleted_at` (soft-delete) columns | **0** |
| Security advisors total | 347 (63 ERROR, 279 WARN, 5 INFO) |

---

## #1 — אין טבלת idempotency_keys (כפילות חמורה ביצירת מסמכים)

**Description:** No `idempotency_keys` table exists. Any double-submit of an order/invoice/payment from the UI or a retried HTTP call against `/api/orchestrator/execute` will create two distinct rows. The wiring spec mandates idempotent action execution but the substrate is absent.
**Steps:** Submit POST `/api/orchestrator/execute` with action `quote.submit`, then retry the same payload after a network hiccup.
**Actual:** Two `quotes` rows are inserted (different UUIDs).
**Expected:** Second call returns the first call's result (idempotency key replay).
**Severity:** **CRITICAL**
**Module:** Orchestrator / All write paths
**Fix:** Create `idempotency_keys (key text PRIMARY KEY, request_hash text, response jsonb, status text, created_at timestamptz, expires_at timestamptz)`, add unique partial index, route every action through it. Migration `00008_idempotency_table.sql` exists in `_imported_pending` but was never applied to production.

## #2 — אין outbox / saga_log (rollback partial failure leaks)

**Description:** No `outbox` and no `saga_log` table. A multi-step business flow (`Order → Project → Procurement → Inventory`) cannot atomically rollback once side-effects fan out (notifications, external POs, AI events). Distributed transactions silently desync.
**Steps:** Trigger `order.confirm`. Step 1 (create project) succeeds; step 2 (allocate inventory) raises; step 3 (notify supplier) is never reached.
**Actual:** Project exists, inventory not reserved, supplier never told. Manual cleanup required.
**Expected:** Outbox-pattern with compensating actions; partial state visible and replayable.
**Severity:** **CRITICAL**
**Module:** workflow-flows / state-machines / orchestrator
**Fix:** Add `outbox (id, aggregate_id, event_type, payload jsonb, status, retries, locked_until, created_at)` + `saga_log (saga_id, step, status, compensation_payload, attempt)`; bridge to a worker that processes/retries.

## #3 — אין audit_log רוחבי (1 בלבד: gl_audit_trail)

**Description:** Only `gl_audit_trail` exists. CLAUDE.md mandates "audit log" on every 360 page; no generic audit table covers `quotes/orders/projects/POs/invoices/payslips`. There is no way to answer "who changed what when" for 99% of entities.
**Steps:** Open Customer360, change customer status from `active` → `blocked`. Check audit history.
**Actual:** No record of the change anywhere.
**Expected:** Row in `audit_log (entity_type, entity_id, actor_id, action, before jsonb, after jsonb, at)`.
**Severity:** **HIGH**
**Module:** Compliance / 360 pages / governance domain
**Fix:** Add unified `audit_log` table + a `pg_trigger` on every owned entity that diffs `OLD/NEW` into `before/after` JSON.

## #4 — 98 טבלאות עם tenant_id שמתיר NULL (Multi-tenant data bleed)

**Description:** 98 columns named `tenant_id` allow NULL — including `ar_invoices`, `ap_invoices`, `crm_companies`, `crm_deals`, `bank_accounts_master`, `bank_transactions`, `ecom_orders`, `ai_sessions`, `ai_messages`. A row with `tenant_id IS NULL` falls outside any RLS predicate of the form `tenant_id = current_tenant()` — visible to none, recoverable only by service_role.
**Steps:** Insert via SQL `INSERT INTO ar_invoices (id, customer_id, invoice_number) VALUES (...)` without tenant_id.
**Actual:** Row succeeds. RLS hides it from every authenticated user. Phantom invoice.
**Expected:** Insert should fail with NOT NULL violation.
**Severity:** **CRITICAL**
**Module:** Tenancy / RLS
**Fix:** `ALTER TABLE <each> ALTER COLUMN tenant_id SET NOT NULL;` after backfilling NULLs from session context. Add a default `current_setting('app.tenant_id')::uuid`.

## #5 — 145 RLS policies עם USING (true) (חשיפה רוחבית)

**Description:** Advisors flag 145 `rls_policy_always_true` issues — policies that pass every row to every authenticated user. RLS is "enabled" on paper but the gate is open. This was introduced in migration `00068_harden_rls_policies_always_true.sql` (intent was to *unblock* development, never reverted).
**Steps:** Authenticate as user A in tenant 1. Query `crm_deals` belonging to tenant 2.
**Actual:** All deals returned cross-tenant.
**Expected:** Only tenant 1 rows returned.
**Severity:** **CRITICAL**
**Module:** Security / RLS
**Fix:** Replace `USING (true)` with `USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)` per table; aided by the `current_tenant()` helper from migration `00004_rls_helper_functions_v2.sql`.

## #6 — 59 טבלאות ב-public ללא RLS כלל

**Description:** 59 tables run with `rowsecurity = false` (e.g. `api_keys`, `webhooks`, `tenant_integrations`, `env_variables`, `feature_flags`, `system_logs`, `email_templates`, `analytics_events`, `error_tracking`, `support_tickets`, `invoices` (legacy), `marketplace_revenue`, `tax_rules`, `compliance_certs`). API/secret tables are publicly readable through any anon JWT in projects exposing PostgREST.
**Steps:** `curl https://ponypxhushxeskxgrmha.supabase.co/rest/v1/api_keys -H "apikey: <anon>"`.
**Actual:** Row dump.
**Expected:** Empty / 401.
**Severity:** **CRITICAL**
**Module:** Security / Infra
**Fix:** Enable RLS on all 59 + add tenant- or role-scoped policies. Migration `00071_remove_dangerous_anon_read_policies.sql` is half-step — also needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.

## #7 — 5 טבלאות platform_* עם RLS על אבל בלי policy (data lockout)

**Description:** `platform_api_keys`, `platform_invoices`, `platform_metrics_global`, `platform_organizations`, `platform_webhooks` have RLS enabled but **zero policies** — silent global lockout. Every `SELECT` returns 0 rows except via service_role.
**Steps:** Front-end loads Global Business Platform Dashboard.
**Actual:** Empty grids; user assumes "no data".
**Expected:** Platform admins see all rows.
**Severity:** **HIGH**
**Module:** Platform / Multi-tenant master
**Fix:** Add explicit `SELECT/INSERT/UPDATE/DELETE` policies for `platform_admin` role.

## #8 — 255 FKs עם NO ACTION (אין הגנת מחיקה)

**Description:** 255/284 FKs are `ON DELETE NO ACTION` (default). Nothing prevents an application-side `DELETE FROM ar_invoices` from leaving `ar_invoice_lines.invoice_id` dangling — *PostgreSQL will error*, but only if the FK is enforced. Combined with missing FK indexes (#10), DELETE on a parent row scans every child table.
**Steps:** `DELETE FROM ar_customers WHERE id = '<X>'` while invoices reference it.
**Actual:** Error 23503 — but the operator now needs manual cascade analysis. With many child relations the app prefers app-side soft state which then drifts.
**Expected:** Clear cascade rules per domain (ON DELETE RESTRICT for finance docs, CASCADE for line-items, SET NULL for soft references).
**Severity:** **HIGH**
**Module:** Schema / DDL
**Fix:** Audit each FK and set `RESTRICT` for masters (customers/vendors/employees), `CASCADE` for child lines (invoice_lines, payment_allocations, order_items), `SET NULL` for cross-cutting refs. Only 29 FKs are CASCADE today — far too few.

## #9 — 80+ FK ללא אינדקס תומך (deletion / scan storm)

**Description:** Live query found ≥80 FK columns without a covering index (sample: `ar_credit_notes.customer_id`, `crm_activities.deal_id`, `crm_deals.company_id`, `hr_employees.manager_id`, `agri_*`, `health_*`, `food_*`, `hotel_*`, `events_*`, `energy_*`). Every parent-row delete or update scans these children sequentially. Concurrent updates cascade-lock the entire child table.
**Steps:** `DELETE FROM crm_companies WHERE id = X;` (with 100k crm_deals).
**Actual:** Seq scan + ACCESS EXCLUSIVE lock; query times out.
**Expected:** Index seek O(log n).
**Severity:** **HIGH**
**Module:** Performance / Schema
**Fix:** `CREATE INDEX CONCURRENTLY ON <child> (<fk_col>);` for every column listed. Migration `00069_performance_fk_indexes_and_dedupe.sql` started this — re-apply and extend to the new 30-table expansions which were added afterwards.

## #10 — אין constraint UNIQUE על מסמכים עסקיים מרכזיים

**Description:** Only `ar_invoices`, `ap_invoices`, `ap_vendors`, `ar_customers`, `hr_employees` carry `(tenant_id, *_number)` uniqueness. **`proc_purchase_orders`** has unique numbers but **without `tenant_id`** — cross-tenant collision possible. **`orders`** has unique number but no tenant. **`order_items`** has neither. No unique on `quotes`, `sales_orders`, `work_orders`, `rfqs`, `grns`, `deliveries`, `contracts`. Re-clicking "Submit Quote" twice ⇒ two quotes, identical number.
**Steps:** Click "שלח הצעה" twice quickly.
**Actual:** Two quote rows with same `quote_number`.
**Expected:** Second insert blocked by unique constraint.
**Severity:** **HIGH**
**Module:** All P0 entities (Quote/Order/PO/RFQ/WO)
**Fix:** `ALTER TABLE proc_purchase_orders ADD CONSTRAINT po_unique_per_tenant UNIQUE (tenant_id, po_number);` for each. Pair with idempotency (#1).

## #11 — אין optimistic-locking / version רוחבי (lost-update silently)

**Description:** Only 9 tables have a `version` column. Two concurrent edits of the same `crm_deal` will both succeed; the last write wins and overwrites the first user's change without warning. No `If-Match` header, no `xmin` capture in 360 page contracts.
**Steps:** User A and B open the same Deal at 14:00:00. A saves at 14:00:30, B saves at 14:00:31.
**Actual:** A's changes silently lost.
**Expected:** B receives 409 Conflict.
**Severity:** **HIGH**
**Module:** All write APIs / 360 pages
**Fix:** Add `version int NOT NULL DEFAULT 1` to all entity tables; trigger increments on `UPDATE`. Server compares `WHERE id=$1 AND version=$2`; on 0 rows ⇒ 409.

## #12 — 0 deleted_at columns (אין soft-delete)

**Description:** No `deleted_at` column anywhere. Every "delete" is hard. Once an order is deleted, history vanishes; recovery requires PITR. UNDO from the UI cannot exist.
**Steps:** Delete an invoice. Open audit; try to restore.
**Actual:** Row gone, FKs may have cascaded, child rows orphaned with previous bug.
**Expected:** Soft-delete, exclude from default queries, restorable.
**Severity:** **HIGH**
**Module:** Schema / Lifecycle / All entities
**Fix:** `ALTER TABLE <each owned entity> ADD COLUMN deleted_at timestamptz;` + RLS policy clause `AND deleted_at IS NULL`.

## #13 — 30+ טבלאות סטטוס ללא CHECK constraint (free-text states)

**Description:** Tables `auto_service_items`, `health_billing`, `legal_time_entries`, `bank_transactions`, `ecom_stores`, `energy_*`, `agri_fields`, `ai_*`, `api_keys`, `crm_contacts.state`, `hr_employees.state`, `ap_vendors.state`, `inv_warehouses.state`, etc. have free `text` status with no CHECK or enum. Typo `"complted"` is happily inserted; state-machine `state-machines.js` cannot trust the value.
**Steps:** `UPDATE auto_service_items SET status = 'compeleted' WHERE id=X;`
**Actual:** Saved, dashboard never moves to "Done" bucket.
**Expected:** CHECK fails — value not in allowed set.
**Severity:** **MEDIUM**
**Module:** state-machines / All workflows
**Fix:** Generate CREATE TYPE enums per state machine in `state-machines.js`; or add `CHECK (status IN ('draft','submitted','approved','rejected','completed','cancelled'))`.

## #14 — שדות כספיים NULL-able ללא DEFAULT (nullable money corruption)

**Description:** 27+ money/quantity columns are nullable with NULL default — `crm_deals.amount`, `food_orders.total`, `health_billing.balance`, `hotel_reservations.total_amount`, `events_tickets.price`, `legal_time_entries.amount`, `marketplace_revenue.amount`, `invoices.amount`, `proc_*.total_amount` (default 0 OK but nullable). Aggregations skip NULL silently → understated revenue.
**Steps:** SUM(amount) FROM crm_deals where some rows have NULL.
**Actual:** Total understated.
**Expected:** Either NOT NULL DEFAULT 0, or COALESCE everywhere.
**Severity:** **HIGH**
**Module:** Finance / BI
**Fix:** `ALTER TABLE … ALTER COLUMN amount SET NOT NULL, SET DEFAULT 0;` after backfill; add CHECK (amount >= 0) on positive-only fields.

## #15 — 20 טבלאות money בלי currency column (mixed-currency silent bug)

**Description:** `ap_invoice_lines`, `ar_invoice_lines`, `ap_payment_allocations`, `ar_receipt_allocations`, `ar_credit_notes`, `auto_service_items`, `ecom_order_items`, `ecom_products`, `energy_bills`, `events_tickets`, `food_*`, `health_billing`, `hotel_reservations`, `legal_time_entries`, `order_items`, `proc_po_lines`, `proc_requisitions`, `re_rent_payments` — money but no `currency` field. Multi-currency tenant sums apples + oranges.
**Steps:** Tenant works in ILS + USD. Total of `ar_invoice_lines.amount` is mixed.
**Actual:** Sum is meaningless.
**Expected:** Each money column travels with `currency text` or with `base_amount` already FX-normalized.
**Severity:** **HIGH**
**Module:** Finance / Analytics
**Fix:** Add `currency text NOT NULL DEFAULT 'ILS'` + `base_amount numeric` (FX-converted) to every money-bearing table; back-populate via `gl_exchange_rates`.

## #16 — 30 טבלאות ללא created_at (audit unidentifiable)

**Description:** Critical entities lack `created_at`: `inventory`, `inv_stock`, `inv_locations`, `gl_account_balances`, `gl_audit_trail` itself, `hotel_rooms`, `hr_attendance`, `hr_payslips`, `events_tickets`, `events_speakers`, `food_*`, `auto_service_items`, `ecom_order_items`, `edu_*`, `energy_readings`, `error_tracking`. Cannot answer "when was this row created", cannot drive incremental sync.
**Steps:** Investigate stock discrepancy.
**Actual:** No timestamp on the stock movement.
**Expected:** `created_at timestamptz NOT NULL DEFAULT now()`.
**Severity:** **MEDIUM**
**Module:** Audit / Replication
**Fix:** Add column + backfill `now()` once.

## #17 — gl_journal_lines: ללא CHECK שמכריח (debit XOR credit)

**Description:** `gl_journal_lines` has `debit_amount` and `credit_amount` both default 0 nullable; nothing prevents both being >0 or both 0. Half-broken entries possible. Furthermore there is no enforcement that for a given `entry_id`, `SUM(debit) = SUM(credit)`.
**Steps:** `INSERT INTO gl_journal_lines (entry_id, line_number, account_id, debit_amount, credit_amount) VALUES (X, 1, Y, 100, 100);`
**Actual:** Accepted; trial balance breaks.
**Expected:** CHECK rejects; deferred-trigger validates entry balance at COMMIT.
**Severity:** **HIGH**
**Module:** GL / Finance core
**Fix:** `ADD CONSTRAINT chk_dr_xor_cr CHECK ((debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0));` + DEFERRED CONSTRAINT TRIGGER on `gl_journal_entries` checking equal sums per entry_id.

## #18 — 14 שדות id שאינם PRIMARY KEY

**Description:** 12 tables have a column named `id` that is not the PK (likely auxiliary IDs from migrations). Confuses ORMs/PostgREST. May be the cause of upsert anomalies.
**Steps:** `INSERT ... ON CONFLICT (id) DO UPDATE` on such table.
**Actual:** No conflict — duplicate row created.
**Expected:** Upsert works on PK.
**Severity:** **MEDIUM**
**Module:** Schema hygiene
**Fix:** Rename auxiliary `id` columns or promote them to PK (where they were intended to be).

## #19 — 43 SECURITY DEFINER functions executable by anon/authenticated

**Description:** 43 RPCs are `SECURITY DEFINER` and `EXECUTE` granted to `anon` (43) **and** `authenticated` (43). Each runs as the function owner — privilege escalation. With 48 having `function_search_path_mutable`, an attacker can shadow `auth.uid()` via `pg_temp` schema injection.
**Steps:** Anon caller invokes a SECURITY DEFINER RPC.
**Actual:** Runs as definer; bypasses RLS. With mutable search_path, lateral hijack possible.
**Expected:** Only callable by service_role; `SET search_path = public, pg_catalog` pinned.
**Severity:** **CRITICAL**
**Module:** RPC security
**Fix:** `REVOKE EXECUTE ... FROM anon, authenticated;` for sensitive RPCs; `ALTER FUNCTION ... SET search_path = public, pg_catalog;` everywhere.

## #20 — 4 sensitive_columns_exposed (PII via PostgREST)

**Description:** Advisor flags 4 instances where columns marked sensitive (likely `email/phone/national_id/iban`) are exposed via PostgREST without column-level grants. Combined with the always-true RLS (#5), full PII export possible.
**Steps:** `GET /rest/v1/hr_employees?select=*` as authenticated user.
**Actual:** All employee PII returned.
**Expected:** Restricted column list per role.
**Severity:** **CRITICAL**
**Module:** Privacy / GDPR
**Fix:** `REVOKE SELECT (national_id, iban, ssn, ...) FROM authenticated;` and serve via masked views.

## #21 — Only 9 triggers in public (no DB-level guards)

**Description:** Only 9 triggers across 8 tables. Cross-row invariants (e.g. `ar_invoices.balance_due = total_amount - paid_amount`, `inv_stock.qty_on_hand = SUM(movements)`, `hr_payslips totals = SUM(components)`) are computed in app code only — easily desync if a developer bypasses the service layer.
**Steps:** Direct SQL `UPDATE ar_invoice_lines SET amount = 0`.
**Actual:** Header `total_amount` not refreshed; balance wrong.
**Expected:** AFTER trigger recomputes header totals.
**Severity:** **HIGH**
**Module:** All header/line tables
**Fix:** Add trigger functions per aggregate (see migration `00016_trigger_functions_computed_fields.sql` — was authored but is partially absent in live DB).

## #22 — 0 רישום של דרישות חובה לעמודות Address / Phone (data quality)

**Description:** No CHECK constraints validate phone/email/IBAN format anywhere (789 CHECKs are 99% NOT NULL only). Garbage phone "0501234" or email "abc" stored. Form-856 / PCN874 / MASAV files derived from this fail at the regulator with 100% rate.
**Steps:** Save customer with `phone = "abc"`.
**Actual:** Saved.
**Expected:** CHECK rejects.
**Severity:** **MEDIUM**
**Module:** Data quality / Israeli compliance
**Fix:** `ADD CONSTRAINT chk_phone CHECK (phone ~ '^[0-9+\-() ]+$' AND length(phone) BETWEEN 7 AND 20);` etc.

---

## Top-priority remediation (do in this order)

1. **Lock down RLS** — replace 145 `USING(true)` policies; enable RLS on the 59 missing; add policies to the 5 platform_* tables. (#5, #6, #7)
2. **NOT NULL on all 98 `tenant_id` columns** + `current_tenant()` default. (#4)
3. **Create `idempotency_keys`, `outbox`, `audit_log`.** Wire orchestrator to them. (#1, #2, #3)
4. **Tighten SECURITY DEFINER RPCs** — revoke anon/authenticated EXECUTE, pin search_path. (#19)
5. **Add UNIQUE (tenant_id, *_number) to all P0 entities** + soft-delete + version. (#10, #11, #12)
6. **Add CHECK constraints** for status, money sign, debit/credit. Add currency column to money tables. (#13, #14, #15, #17)
7. **Index every FK column**, enforce explicit ON DELETE policy per FK, replace 255 NO-ACTION default. (#8, #9)
8. **Generate triggers** for header/line aggregates and `audit_log` writers. (#21)
