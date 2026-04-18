-- CONSOLIDATION NOTES — created 2026-04-18
-- The following tables are defined in MULTIPLE migrations.
-- CANONICAL (first definition) is authoritative.
-- REDUNDANT (later definition) is a `create table if not exists` that has no effect at runtime.
-- Do NOT drop — data may depend on either. Consolidate in Phase 11 deployment.

-- governance.roles            — CANONICAL: 00000_master_schema.sql:71  — REDUNDANT: 00019_security_rls_core.sql:11
-- governance.permissions      — CANONICAL: 00000_master_schema.sql:82  — REDUNDANT: 00019_security_rls_core.sql:21
-- governance.role_permissions — CANONICAL: 00000_master_schema.sql:95  — REDUNDANT: 00019_security_rls_core.sql:31
-- governance.user_roles       — CANONICAL: 00000_master_schema.sql:104 — REDUNDANT: 00019_security_rls_core.sql:39
-- analytics.dashboard_widgets — CANONICAL: 00010:391                    — REDUNDANT: 00021:16

select 'Duplicate table definitions documented. See comments in this migration.' as consolidation_note;
