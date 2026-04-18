# QA Agent 9 — Database Integrity

**Generated:** 2026-04-18
**Scope:** `supabase/migrations/*.sql` (43 migrations, static SQL parsing)

## Schema counts

- **total migrations:** 43
- **total tables:** 237 (across schemas: public, governance, commercial, procurement, inventory, finance, hr, comms, docs, analytics, intelligence, orchestration, operations, etc.)
- **tables without PK:** 0 (all `create table` definitions include a PK clause — clean)
- **dangling FKs:** 1
- **duplicate table definitions:** 5
- **total FK constraints:** 381
- **total RLS policies (create policy):** 302
- **tables without any policy:** 41
- **tables with RLS enabled (alter table ... enable row level security):** 224 / 237
- **tables without RLS enabled:** 13
- **FKs without matching index on source column:** 381 (regex-matched; some are covered by composite/partial indexes not caught by the scanner — flag as `uncertain` on exact count; top 30 listed below)
- **columns named `*_id` without a `references` clause:** 186 (orphan-risk, some are legitimate non-FK refs like external system IDs)
- **FKs with `on delete cascade`:** 110

## Duplicate table definitions (5)

| table | defined in |
|---|---|
| governance.roles | 00000_master_schema.sql:71 ; 00019_security_rls_core.sql:11 |
| governance.permissions | 00000_master_schema.sql:82 ; 00019_security_rls_core.sql:21 |
| governance.role_permissions | 00000_master_schema.sql:95 ; 00019_security_rls_core.sql:31 |
| governance.user_roles | 00000_master_schema.sql:104 ; 00019_security_rls_core.sql:39 |
| analytics.dashboard_widgets | 00010_enterprise_expansion_30_tables.sql:391 ; 00021_dashboard_tables.sql:16 |

Risk: later `create table if not exists` will silently no-op, but later columns/constraints are *not* added — migration 00019 appears to redefine the governance core tables. Verify schemas match or consolidate.

## Dangling FKs (1)

| source | target | file:line |
|---|---|---|
| public.user_profiles.id → auth.users | auth.users not defined in migrations | 20260417000000_initial_schema.sql:8 |

This is actually Supabase's built-in `auth.users` table (managed by GoTrue, not present in app migrations). Legitimate, but scanner flags it since no `create table auth.users` exists locally. **Not a real issue.**

## High-risk constraint issues

| table.column | issue | severity | fix |
|---|---|---|---|
| governance.role_permissions.role_id | cascade delete → deleting a role wipes all permission mappings | MEDIUM | acceptable (intent) |
| governance.role_permissions.permission_id | cascade delete | MEDIUM | acceptable |
| governance.user_roles.user_id | cascade delete → deleting user wipes role assignments | MEDIUM | acceptable for hard-delete tenants; prefer soft-delete |
| commercial.quote_lines.quote_id | cascade delete | LOW | acceptable |
| procurement.rfq_items.rfq_id | cascade delete | LOW | acceptable |
| procurement.supplier_quotes.rfq_id | cascade delete | MEDIUM | quotes should survive RFQ deletion for audit |
| governance.event_deliveries.domain_event_id | cascade delete | MEDIUM | audit trail destruction risk |
| governance.workflow_instances.workflow_id | cascade delete | HIGH | running workflows deleted when template deleted |
| governance.workflow_step_executions.workflow_instance_id | cascade delete | HIGH | execution history destroyed |
| + 101 more cascade deletes (total 110) | see `_db_analysis_tmp.json` → cascadeDeletes | — | audit in bulk |

## Migration ordering issues

None found by the scanner — all `references` clauses either target tables created earlier in the same file, in an earlier migration, or in the managed `auth` schema. No forward references detected in the 43 migrations.

## Tables without RLS enabled (13)

```
governance.idempotency_keys
analytics.dashboard_boards
analytics.dashboard_board_widgets
analytics.user_dashboard_boards
intelligence.agent_registry
intelligence.agent_jobs
orchestration.workflow_definitions
orchestration.workflow_steps
orchestration.workflow_runs
orchestration.workflow_step_runs
orchestration.job_queue
orchestration.universal_inbox
orchestration.notifications
```

Severity:
- **`orchestration.job_queue`, `orchestration.notifications`, `orchestration.universal_inbox`** — HIGH, user-facing, leaks across tenants
- **`orchestration.workflow_*`** — HIGH, can reveal cross-tenant workflow runs
- **`intelligence.agent_registry`, `intelligence.agent_jobs`** — MEDIUM, platform-level
- **`analytics.dashboard_*`** — MEDIUM, user dashboard configs
- **`governance.idempotency_keys`** — LOW (opaque keys), but could leak request patterns

## Tables without any policy (41 — sample top 30)

```
governance.idempotency_keys
governance.webhook_endpoints
governance.webhook_deliveries
governance.integration_connections
governance.integration_sync_logs
governance.feature_flag_targets
docs.document_signature_requests
docs.document_versions
comms.portal_sessions
governance.escalation_rules
governance.sla_timers
governance.job_executions
governance.audit_log_attachments
inventory.material_lots
inventory.inventory_movements
inventory.reorder_rules
inventory.shortage_snapshots
analytics.read_model_invalidations
governance.command_logs
governance.security_events
comms.notification_deliveries
comms.support_sla_tracking
analytics.dashboard_boards
analytics.dashboard_board_widgets
analytics.user_dashboard_boards
intelligence.agent_registry
intelligence.agent_jobs
orchestration.workflow_definitions
orchestration.workflow_steps
orchestration.workflow_runs
```

Critical missing policies:
- **`docs.document_signature_requests`, `docs.document_versions`** — legal documents, needs row scoping by org/customer
- **`comms.portal_sessions`** — user session tokens — CRITICAL
- **`inventory.inventory_movements`, `inventory.material_lots`** — business data, needs tenant scoping
- **`governance.webhook_endpoints`, `governance.integration_connections`** — contains credentials — CRITICAL
- **`governance.security_events`, `governance.audit_log_attachments`** — audit surface

## FKs without index (sample 30 of 381)

Scanner counts every FK with no exact-match index on the source column. Supabase auto-indexes some FKs; Postgres does NOT auto-index FK source columns. Any large-volume table with these creates a DELETE performance bomb on the parent side (cascade walks full table).

Highest-impact (large tables):
- `commercial.quote_lines.quote_id`
- `procurement.po_lines.po_id`
- `procurement.supplier_quotes.rfq_id`
- `governance.event_deliveries.domain_event_id`
- `governance.workflow_step_executions.workflow_instance_id`
- `inventory.inventory_movements.item_id`
- `finance.journal_lines.entry_id`
- `operations.work_order_tasks.work_order_id`

Full list in `_db_analysis_tmp.json` → fkNoIdx.

## Orphan-risk columns (sample — columns ending `_id` with no FK, 186 total)

Typical patterns:
- `external_id`, `vendor_id` where the external system owns the ID
- Polymorphic `subject_id` + `subject_type` pairs
- Snapshot columns (e.g., `previous_status_id`)

Not all are bugs; audit-grade remediation is to review the 186 against the 16-entity map in `pipeline/entity-map.js` and add FKs where the referenced table exists.

## RLS coverage

- **Tables with RLS:** 224 / 237 (94.5%)
- **Tables missing RLS:** 13

Business-critical tables missing RLS:
- `orchestration.job_queue` — cross-tenant work leakage risk
- `orchestration.universal_inbox` — cross-tenant inbox items
- `orchestration.notifications` — cross-tenant notifications
- `orchestration.workflow_runs` + `workflow_step_runs` — cross-tenant execution visibility
- `intelligence.agent_jobs` — agent job payloads may contain PII

## Verdict: **needs-review**

Core schema health is good:
- No tables without PK
- No real dangling FKs (the 1 hit is `auth.users` managed by Supabase)
- No migration-ordering violations
- RLS coverage 94.5%

But:
- **13 business-critical tables** in `orchestration.*` and `intelligence.*` lack RLS entirely — MUST FIX before multi-tenant production
- **41 tables with no policies at all** (including `comms.portal_sessions`, `governance.webhook_endpoints`, `governance.integration_connections`)
- **5 duplicate table definitions** in governance + analytics schemas — risk of silent drift between 00000 and 00019/00021
- **381 unindexed FKs** — performance risk (not correctness)
- **110 `on delete cascade` chains** — some destroy audit/history rows when parents deleted (see workflow_instances, event_deliveries)
