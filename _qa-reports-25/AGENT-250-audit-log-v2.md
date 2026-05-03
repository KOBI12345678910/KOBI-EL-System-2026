# AGENT-250 - Canonical Audit Log v2 (DB BUILD #5)

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Date:** 2026-04-29
**Author:** Agent 250 (per Agent 153 - `supabase/types.ts` AuditLog drift)
**Migration written:** `supabase/migrations/00088_audit_log_v2.sql`
**Status:** READY FOR REVIEW. Idempotent, append-only, hash-chained.

---

## 1. Why this migration exists

Agent 153 (`AGENT-153-types-ts.md` line 52) flagged the `AuditLog`
interface in `supabase/types.ts` as having **zero field overlap** with
the canonical `governance.audit_logs` SQL table:

| Layer | Fields used |
|---|---|
| TS `AuditLog` (`supabase/types.ts` L95-106) | `id`, `user_id`, `event_type`, `entity_type`, `entity_id`, `old_data`, `new_data`, `ip_address`, `user_agent`, `created_at` |
| SQL `governance.audit_logs` (`00000_master_schema.sql` L133-148) | `entity_type`, `entity_id`, `action_name`, `old_values`, `new_values`, `performed_by_user_id`, `source_service`, `source_module`, `source_page`, `correlation_id`, `performed_at` |
| TS `AuditEntry` writer (`supabase/functions/_shared/audit.ts`) | `entityType`, `entityId`, `actionName`, `oldValues`, `newValues`, `sourceService`, `sourceModule`, `sourcePage`, `performedByUserId`, `correlationId` |

Three audit shapes coexisted:

1. The Edge Function writer used `action_name / old_values / new_values`.
2. The TS reader expected `event_type / old_data / new_data`.
3. The Drizzle schema in `_merge-incoming/.../lib/db/src/schema/audit-log.ts`
   defined yet a fourth column set (`action / resource_type / resource_id /
   metadata / ip_address / user_agent`).

`public.gl_audit_trail` was a fourth, finance-only audit channel that
duplicated this work for GL journal entries.

The migration unifies all four sources on a single canonical table with
mirrored aliases so neither layer needs to change at the edges.

---

## 2. What the migration creates

### A. `governance.audit_log_v2` (canonical table)

**TS-shape (canonical names) columns:**
`event_type`, `entity_type`, `entity_id`, `entity_public_id`,
`old_data` (jsonb), `new_data` (jsonb), `ip_address` (inet),
`user_agent` (text), `user_id` (bigint).

**Architectural columns (kept for legacy writers + RPCs):**
`action_name`, `old_values`, `new_values`, `performed_by_user_id`,
`source_service`, `source_module`, `source_page`, `correlation_id`,
`request_id`, `session_id`.

**Identity + scope:**
`id` (bigserial PK), `public_id` (uuid), `tenant_id` (uuid, nullable for
platform events).

**Timing:**
`performed_at`, `created_at`.

**Hash chain:**
`chain_seq` (bigint, per-tenant monotonic),
`prev_row_hash` (bytea), `row_hash` (bytea, sha256 of canonical payload).

CHECK constraint on `event_type` restricts to:
`INSERT, UPDATE, DELETE, VIEW, EXPORT, LOGIN, LOGOUT, STATE_CHANGE,
APPROVE, REJECT, EXECUTE, ERROR`.

### B. `governance.audit_chain_head` (chain heads)

One row per tenant (NULL tenant stored as nil-uuid). Tracks `last_seq` and
`last_hash` for O(1) chain extension.

### C. Triggers

| Trigger | When | Purpose |
|---|---|---|
| `trg_audit_log_v2_before_insert` | BEFORE INSERT | Mirrors TS<->architectural columns; allocates `chain_seq`; computes `row_hash = sha256(prev_row_hash || canonical_payload)`; updates `audit_chain_head` under row-lock. |
| `trg_audit_log_v2_no_update` | BEFORE UPDATE | Raises `insufficient_privilege`. Append-only enforcement. |
| `trg_audit_log_v2_no_delete` | BEFORE DELETE | Same. Disabled only inside `governance.purge_audit_log()` for retention sweeps. |

### D. Backfill

D1 — `governance.audit_logs` rows are copied row-for-row, using
`action_name -> event_type` and `old_values/new_values -> old_data/new_data`.
Performed_at is preserved. Existing-row guard prevents double-copy on re-run.

D2 — `public.gl_audit_trail` is folded in via dynamic SQL that adapts to
whichever column variant exists in the deployed schema (`before_json` /
`old_data` / `payload`, `after_json` / `new_data`, `entry_id` /
`journal_entry_id`, `tenant_id` if present). Tagged
`source_service='finance', source_module='gl_audit_trail'`.

### E. Compatibility view

`governance.audit_logs` (the table) is renamed to `audit_logs_legacy`,
then re-created as a **view** over `audit_log_v2` exposing the legacy
column set. Effect: every existing reader (the 7 RPCs in
`00002_secure_rpc_functions.sql` and the Customer360/Supplier360 functions
that select from `governance.audit_logs`) keeps working without code
changes. New writers should target `audit_log_v2` directly.

### F. RLS

| Policy | Role | Predicate |
|---|---|---|
| `audit_log_v2_select` | authenticated | `current_user_is_admin() OR current_user_is_executive()` |
| `audit_log_v2_insert_service` | service_role | `WITH CHECK (true)` |
| `audit_chain_head_select` | authenticated | `current_user_is_admin()` |
| `audit_chain_head_write_service` | service_role | `USING (true) WITH CHECK (true)` |

App writes always flow through service_role-backed RPCs/Edge Functions, so
direct INSERT from `authenticated` is correctly blocked.

### G. Indexes

```
idx_audit_log_v2_entity         (entity_type, entity_id, performed_at desc)
idx_audit_log_v2_performed_at   (performed_at desc)
idx_audit_log_v2_tenant         (tenant_id, performed_at desc) where tenant_id is not null
idx_audit_log_v2_correlation    (correlation_id) where correlation_id is not null
idx_audit_log_v2_event_type     (event_type, performed_at desc)
idx_audit_log_v2_user           (user_id, performed_at desc) where user_id is not null
ux_audit_log_v2_tenant_seq      UNIQUE (coalesce(tenant_id,nil), chain_seq)
```

The unique chain index is what guarantees the hash chain is monotonically
appendable per tenant — the `BEFORE INSERT` trigger acquires a row lock on
`audit_chain_head` during seq allocation, so concurrent inserters cannot
race into the same `chain_seq`.

### H. 7-year retention

- `governance.audit_log_retention_policy` (table) holds the policy row;
  default `retention_years = 7`. Constraint `between 1 and 30`.
  Aligned with Israeli accounting/tax baselines (חוק החברות + תקנות מס
  הכנסה). Health-record long-tail is handled separately on
  `health.medical_records.retention_class` (see `00077_health_domain.sql`).
- `governance.purge_audit_log()` — SECURITY DEFINER. Computes
  `cutoff = now() - retention_years*1y`, temporarily disables the
  `no_delete` trigger, deletes older rows, re-enables the trigger, and
  emits a synthetic `EXECUTE/audit_log/retention` event into the chain so
  the gap is provable in the chain itself. Returns `(purged_count, cutoff)`.
- pg_cron schedule `audit_log_v2_purge` runs `30 02 01 * *` (monthly,
  02:30 UTC on the 1st). Falls back to no-op if `pg_cron` is not present;
  in that case the deployer schedules it externally.

### I. `governance.verify_audit_chain(p_tenant uuid)`

Walks the chain for one tenant in `chain_seq` order, recomputing each
`row_hash`. Returns `(ok bool, total_rows bigint, first_break_id bigint,
expected_hash_hex text, found_hash_hex text)`. First mismatch returns the
offending row id and both hashes; otherwise `ok=true` with the chain head
hash. SECURITY DEFINER, granted to service_role only.

---

## 3. How writers reach the table

| Writer | Today | After 00088 |
|---|---|---|
| `supabase/functions/_shared/audit.ts` (Edge Functions) | `governance.audit_logs` | View targets `audit_log_v2`; INSERT through view rewrites to base table. No code change. |
| `00002_secure_rpc_functions.sql` RPCs (line 86+) | `governance.audit_logs` (INSERT) | Same as above. No code change. |
| `governance.audit_logs` 7 reader RPCs | SELECT same view | Continue working unchanged. |
| `_merge-incoming/.../audit-logger.ts` Drizzle code | `audit_log` (untyped) | Targeted in follow-up Agent 251 — switch import to `audit_log_v2`; map `action -> event_type`. |
| `public.gl_audit_trail` writer | direct INSERT into `gl_audit_trail` | Phase 1: keep writing there; backfill picks up new rows next migration cycle. Phase 2 (Agent 251): re-target writer to `audit_log_v2` with `source_module='gl_audit_trail'` and drop `gl_audit_trail`. |

The view-over-base-table pattern means Phase 1 of the cutover is
zero-touch for application code.

---

## 4. Backfill behaviour

```sql
-- D1 sample row count check
select count(*) from governance.audit_logs_legacy;
select count(*) from governance.audit_log_v2 where source_module = 'audit_logs';

-- D2 sample row count check (only if gl_audit_trail exists)
select count(*) from public.gl_audit_trail;
select count(*) from governance.audit_log_v2 where source_module = 'gl_audit_trail';
```

The migration is idempotent on D1 by the `not exists` join on
`(performed_at, entity_type, entity_id, action_name)`. D2 is dynamic SQL
that runs once; re-runs would duplicate rows from `gl_audit_trail`, so
re-runners should `truncate governance.audit_log_v2` first or filter by
`source_module='gl_audit_trail'` on a custom `not exists`.

---

## 5. Verification queries

```sql
-- 1. Schema shape matches TS interface
\d governance.audit_log_v2
-- expect columns: event_type, entity_type, entity_id, old_data, new_data,
--                 ip_address, user_agent, action_name, source_service,
--                 correlation_id, plus chain_seq, prev_row_hash, row_hash.

-- 2. Mirror trigger keeps both worlds in sync
insert into governance.audit_log_v2 (event_type, entity_type, entity_id,
                                     old_data, new_data, source_service,
                                     source_module)
values ('UPDATE','customer',1,
        jsonb_build_object('balance',100),
        jsonb_build_object('balance',150),
        'commercial','customer-360');

select event_type, action_name,
       old_data, old_values,
       new_data, new_values,
       user_id, performed_by_user_id
  from governance.audit_log_v2
 order by id desc limit 1;
-- All paired columns must be equal.

-- 3. Hash chain integrity
select * from governance.verify_audit_chain(null);
-- expect ok=true.

-- 4. Append-only enforcement
update governance.audit_log_v2 set new_data = '{}'::jsonb where id = 1;
-- expect: ERROR  audit_log_v2 is append-only (operation UPDATE)
delete from governance.audit_log_v2 where id = 1;
-- expect: ERROR  audit_log_v2 is append-only (operation DELETE)

-- 5. Retention purge dry run
select * from governance.audit_log_retention_policy;
-- bump cutoff to a recent date for testing:
update governance.audit_log_retention_policy set retention_years = 1;
select * from governance.purge_audit_log();
-- restore:
update governance.audit_log_retention_policy set retention_years = 7;

-- 6. Chain after purge still verifies
select * from governance.verify_audit_chain(null);
-- ok=true; the synthetic EXECUTE/retention row is in the chain.

-- 7. Compatibility view still serves legacy callers
select count(*) from governance.audit_logs;
-- equals count from audit_log_v2.

-- 8. RLS
set role authenticated;
select count(*) from governance.audit_log_v2;
-- only admin/executive sessions return rows; others get 0.
reset role;
```

---

## 6. Tamper-detection model

Per-tenant chain. For row N:

```
canonical_payload = utf8(
  tenant_id || '|' ||
  chain_seq || '|' ||
  hex(prev_row_hash) || '|' ||
  event_type || '|' ||
  entity_type || '|' ||
  entity_id || '|' ||
  user_id || '|' ||
  source_service || '|' ||
  source_module || '|' ||
  correlation_id || '|' ||
  old_data::text || '|' ||
  new_data::text || '|' ||
  performed_at::text
)

row_hash = sha256( prev_row_hash || canonical_payload )
```

Properties:

- **Append-only:** UPDATE and DELETE on `audit_log_v2` raise
  `insufficient_privilege` via triggers. Even superuser INSERTs route
  through the BEFORE INSERT trigger that allocates the next chain seq.
- **Concurrency-safe:** `BEFORE INSERT` does
  `select ... for update` on `audit_chain_head(tenant_id)`, so two
  parallel inserters serialize on the head row. The unique index
  `(tenant_id, chain_seq)` is a belt-and-braces guarantee.
- **Detectable tampering:** any post-hoc edit to a row's payload columns,
  re-ordering, or deletion (other than via `purge_audit_log()`) breaks
  `row_hash` and is reported by `verify_audit_chain()` as
  `first_break_id`.
- **Provable purge gaps:** `purge_audit_log()` writes a synthetic
  `EXECUTE/audit_log/retention` event with `{purged_rows, cutoff,
  retention_years}` so post-purge chain still verifies and the gap is
  on-record.

The chain is **per-tenant** rather than global so multi-tenant deploys do
not serialize their entire audit-write load on a single head row.

---

## 7. Roll-back plan

Pure additive at the table level. To undo:

```sql
drop function if exists governance.verify_audit_chain(uuid);
drop function if exists governance.purge_audit_log();
drop view     if exists governance.audit_logs;
alter table   governance.audit_logs_legacy rename to audit_logs;
drop table    if exists governance.audit_chain_head;
drop table    if exists governance.audit_log_v2 cascade;
drop table    if exists governance.audit_log_retention_policy;
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule('audit_log_v2_purge')
       from cron.job where jobname='audit_log_v2_purge';
  end if;
exception when undefined_table then null; end $$;
```

`gl_audit_trail` is left untouched throughout — backfill is read-only
against it.

---

## 8. Severity / impact

| Dimension | Rating |
|---|---|
| Drift fix (TS vs SQL) | **Critical** — closes Agent 153 finding #2 |
| Tamper detection | **High** — none existed; now per-tenant hash chain |
| Compliance | **High** — 7-year retention is enforced and provable |
| Blast radius | **Low** — view preserves legacy callers; writers untouched |
| Migration cost | **Low** — single file, idempotent, no schema-wide locks (only audit_logs+chain head) |

---

## 9. Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00088_audit_log_v2.sql` (new, full SQL)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00000_master_schema.sql` (L133-148, prior `governance.audit_logs` definition — now backed by view)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00002_secure_rpc_functions.sql` (existing RPCs that read/write the legacy table — unchanged, served by compatibility view)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00007_performance_indexes.sql` (legacy indexes superseded by Section G)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\functions\_shared\audit.ts` (Edge Function writer — no change needed)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\types.ts` (L95-106, the `AuditLog` interface this migration aligns to)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-153-types-ts.md` (source audit, L52 the AuditLog drift row)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-213-tenant-migration.md` (multi-tenant context — `audit_log_v2.tenant_id` integrates here)

## 10. Follow-ups (not in this migration)

1. **Agent 251** — re-target the `_merge-incoming/.../audit-logger.ts`
   Drizzle writer at `audit_log_v2` and decommission `public.gl_audit_trail`
   (writer + table) once a 30-day quiet period proves no orphan callers.
2. **Agent 252** — regenerate `supabase/types.ts` with `supabase gen types`
   so the `Database` generic actually carries `Tables<'governance.audit_log_v2'>`,
   per Agent 153 recommendation #1.
3. **CI drift check** — fail PR if `audit_log_v2` columns are added without a
   matching update to the AuditLog TS shape and `verify_audit_chain` payload
   ordering (the canonical_payload string in both the trigger and the verifier
   must stay byte-for-byte identical).
