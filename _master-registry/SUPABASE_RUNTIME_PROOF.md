# SUPABASE RUNTIME PROOF — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Status | **placeholder** — populated in Phase 11 |
| Scope | Per-table / per-view / per-RPC / per-migration runtime verification against the live Supabase project |
| Methods | `mcp__supabase__list_tables`, `mcp__supabase__list_migrations`, `mcp__supabase__list_extensions`, `mcp__supabase__execute_sql` (SELECT count(*) + information_schema spot checks), `mcp__supabase__get_advisors` |
| Lock rule | Phase 11 cannot sign off until every table in `_all_tables.txt` (237) has a live row here |

## Deployment targets

| target | expected_count | verified_count | status |
|---|---:|---:|---|
| Schemas | 23 | 0 | pending |
| Tables | 237 | 0 | pending |
| Views | 15-17 | 0 | pending |
| RPCs | 128-143 | 0 | pending |
| Foreign keys | 382-385 | 0 | pending |
| RLS policies | 213-302 (drift per B-E019) | 0 | pending |
| Supabase migrations | 43 | 0 | pending |
| Edge functions | 45 | 0 | pending |

## Table verification matrix (237 rows)

Template (to be populated Phase 11):

| schema.table | expected_in_migration | deployed | row_count | rls_enabled | policies_count | verified_at | advisor_notes |
|---|---|:--:|---:|:--:|---:|---|---|
| analytics.dashboard_board_widgets | 00024_*.sql | pending | pending | pending | pending | — | — |
| analytics.dashboard_boards | 00024_*.sql | pending | pending | pending | pending | — | — |
| ... 235 more rows ... | | | | | | | |

**Row source**: `_all_tables.txt` provides the exact 237 rows; one row per line. Phase 11 runs `mcp__supabase__list_tables({schemas: [...23...]})` and diffs.

## RPC verification

All 128-143 RPCs must either be confirmed callable (via `mcp__supabase__execute_sql("SELECT proname FROM pg_proc WHERE pronamespace IN (...)")`) or decided as `dead_rpc_candidate` per D014.

## Migration application order

Phase 11 runs `mcp__supabase__list_migrations` and diffs against filesystem `supabase/migrations/*.sql`. Expected: 43 applied. Any `pending` migration on filesystem-but-not-DB is a hard block.

## RLS policy reconciliation

B-E019 notes drift: `[213, 302]` policies. Phase 11:
1. Snapshot current live RLS via `SELECT tablename, policyname FROM pg_policies`.
2. Diff against migrations `00032_rls_*` and subsequent RLS updates.
3. Produce `RLS_DRIFT_REPORT.md` (new Phase 11 artifact).
4. Reconcile every drift row — no orphan live policy, no missing expected policy.

## Advisor pass

`mcp__supabase__get_advisors({type:"security"})` and `mcp__supabase__get_advisors({type:"performance"})` must return 0 critical findings before Phase 15 release lock.

## Exit criteria for Phase 11

- [ ] all 237 tables present in live DB
- [ ] all 43 migrations applied in order
- [ ] RLS drift resolved (report emitted, rows reconciled)
- [ ] 0 critical security advisors
- [ ] `BUILD_FINAL_STATUS.json.deployment_counts.tables_verified_in_supabase == 237`
- [ ] SUPABASE_RUNTIME_PROOF.md populated with timestamps per row

## Rollback plan

If >5 tables fail verification, pause Phase 11 and branch off a remediation task per B-D004 (per-table gate). Do not proceed to Phase 12 until all 237 rows green.
