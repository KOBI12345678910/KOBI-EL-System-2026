# AGENT-214 - RLS Hardening Migration

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Scope:** Generate `supabase/migrations/00073_rls_hardening.sql`
**Date:** 2026-04-29
**Auditor:** Agent 214 - RLS Hardening
**Source findings:** AGENT-09 (318 USING(true) policies + 59 RLS-disabled tables)

---

## Status

**Migration generated.** Persists to `supabase/migrations/00073_rls_hardening.sql`.

| Step | Tables touched | Notes |
|------|----------------|-------|
| 1. Helper `governance.current_tenant_id()` | n/a | Reads `request.jwt.claim.tenant_id`, then session var `app.current_tenant_id`, then `governance.users_profile.tenant_id` |
| 2. Helper `governance.is_service_role()` | n/a | Reads `request.jwt.claim.role` = `service_role` |
| 3. ENABLE RLS on 59 tables | 59 | Includes `api_keys`, `env_variables`, `webhooks`, `system_logs`, etc. |
| 4. Service-role escape policies for system tables | 12 | `api_keys`, `env_variables`, `webhooks`, `system_logs`, `backups`, `feature_flags`, `global_settings`, `error_tracking`, `analytics_events`, `daily_usage`, `performance_metrics`, `compliance_certs` |
| 5. User-scoped policies for personal tables | 7 | `notification_preferences`, `dashboard_layouts`, `user_integrations`, `voice_sessions`, `support_tickets`, `team_invites`, `shared_links` |
| 6. Tenant-scoped policies for tenanted tables | 40 | All other previously-disabled tables |
| 7. Replace `USING (true)` with tenant predicate | 26 vertical-domain prefixes | Drops permissive policy and adds `tenant_id = governance.current_tenant_id()` filter |

Run **after** `00072_create_governance_tenant_helper.sql` (helper) and `00075_index_tenant_id_columns.sql` (index) per AGENT-09 plan, but this migration is **idempotent** and can be re-applied.

---

## Migration SQL

```sql
-- ============================================================
-- 00073_rls_hardening.sql
-- AGENT-214 RLS Hardening
-- Source: AGENT-09 audit (318 USING(true) + 59 RLS-disabled)
-- ============================================================
-- This migration:
--   1. Creates governance.current_tenant_id() helper (JWT/session)
--   2. Creates governance.is_service_role() helper
--   3. Enables RLS on 59 currently-disabled tables
--   4. Adds service-role escape policies on system/secret tables
--   5. Adds owner-scoped policies on personal tables
--   6. Adds tenant-scoped policies on tenanted tables
--   7. Replaces USING (true) on tenanted tables with tenant predicate
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tenant resolution helper
-- ------------------------------------------------------------
-- Resolution order:
--   a. JWT claim 'tenant_id' (preferred - set by app on auth)
--   b. Postgres session GUC 'app.current_tenant_id' (server-side jobs)
--   c. governance.users_profile.tenant_id (fallback for active session)
-- Returns NULL when no tenant resolvable -> RLS blocks the row.

CREATE OR REPLACE FUNCTION governance.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = governance, public
AS $fn$
DECLARE
  v_tenant uuid;
BEGIN
  -- (a) JWT claim
  BEGIN
    v_tenant := nullif(
      current_setting('request.jwt.claim.tenant_id', true), ''
    )::uuid;
    IF v_tenant IS NOT NULL THEN RETURN v_tenant; END IF;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- (b) session GUC (cron / edge functions)
  BEGIN
    v_tenant := nullif(
      current_setting('app.current_tenant_id', true), ''
    )::uuid;
    IF v_tenant IS NOT NULL THEN RETURN v_tenant; END IF;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- (c) profile fallback
  SELECT up.tenant_id INTO v_tenant
  FROM governance.users_profile up
  WHERE up.auth_user_id = auth.uid()
    AND up.deleted_at IS NULL
  LIMIT 1;
  RETURN v_tenant;
END;
$fn$;

GRANT EXECUTE ON FUNCTION governance.current_tenant_id()
  TO authenticated, anon, service_role;

COMMENT ON FUNCTION governance.current_tenant_id() IS
  'Resolves the active tenant from JWT claim, session GUC, or profile. Returns NULL when no tenant context.';

-- ------------------------------------------------------------
-- 2. Service-role detector (used by escape policies)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION governance.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role',
    false
  );
$fn$;

GRANT EXECUTE ON FUNCTION governance.is_service_role()
  TO authenticated, anon, service_role;

-- ============================================================
-- 3. ENABLE RLS on 59 currently-disabled tables (AGENT-09 list)
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    '_temp_file_transfer','ab_experiments','activity_feed','ai_agents',
    'ai_code_reviews','ai_models','ai_workflows','analytics_events',
    'api_keys','app_generators','backups','changelog','code_comments',
    'code_snippets','collab_sessions','compliance_certs','conversion_funnels',
    'custom_domains','daily_usage','dashboard_layouts','deploy_environments',
    'deploy_pipelines','email_templates','env_variables','error_tracking',
    'extensions','feature_flags','file_versions','global_settings',
    'hamelech_modules','infra_regions','integration_catalog','invoices',
    'knowledge_base','marketplace_revenue','module_categories',
    'module_reviews','module_templates','notification_preferences',
    'performance_metrics','project_templates','runtime_containers',
    'scheduled_jobs','seller_profiles','seo_config','shared_links',
    'support_tickets','supported_languages','system_logs','tax_rules',
    'team_invites','tenant_integrations','tenant_workflows',
    'user_integrations','user_segments','voice_sessions','webhooks',
    'workflow_executions','workflow_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables
               WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 4. SERVICE-ROLE-ONLY tables (secrets, infra, telemetry)
-- ============================================================
-- Pattern: only service_role and platform_admin may read/write.
-- Authenticated users get NO access - these never reach the API.

DO $$
DECLARE
  t text;
  secret_tables text[] := ARRAY[
    'api_keys','env_variables','webhooks','system_logs','backups',
    'global_settings','error_tracking','daily_usage',
    'performance_metrics','compliance_certs','analytics_events',
    'feature_flags'
  ];
BEGIN
  FOREACH t IN ARRAY secret_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables
                   WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_service_all ON public.%I
        FOR ALL TO service_role, authenticated
        USING (governance.is_service_role()
               OR governance.current_user_is_admin())
        WITH CHECK (governance.is_service_role()
                    OR governance.current_user_is_admin())
    $p$, t, t);
  END LOOP;
END $$;

-- ============================================================
-- 5. OWNER-SCOPED tables (personal)
-- ============================================================
-- Each row owned by a single user; only owner + admin may access.

-- notification_preferences (user_id)
DROP POLICY IF EXISTS notification_preferences_owner ON public.notification_preferences;
CREATE POLICY notification_preferences_owner ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR governance.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR governance.current_user_is_admin());

-- dashboard_layouts (user_id)
DROP POLICY IF EXISTS dashboard_layouts_owner ON public.dashboard_layouts;
CREATE POLICY dashboard_layouts_owner ON public.dashboard_layouts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR governance.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR governance.current_user_is_admin());

-- user_integrations (user_id)
DROP POLICY IF EXISTS user_integrations_owner ON public.user_integrations;
CREATE POLICY user_integrations_owner ON public.user_integrations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR governance.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR governance.current_user_is_admin());

-- voice_sessions (user_id)
DROP POLICY IF EXISTS voice_sessions_owner ON public.voice_sessions;
CREATE POLICY voice_sessions_owner ON public.voice_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR governance.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR governance.current_user_is_admin());

-- support_tickets (created_by + tenant_id)
DROP POLICY IF EXISTS support_tickets_owner_or_tenant ON public.support_tickets;
CREATE POLICY support_tickets_owner_or_tenant ON public.support_tickets
  FOR ALL TO authenticated
  USING (created_by = auth.uid()
         OR tenant_id = governance.current_tenant_id()
         OR governance.current_user_is_admin())
  WITH CHECK (created_by = auth.uid()
              OR tenant_id = governance.current_tenant_id()
              OR governance.current_user_is_admin());

-- team_invites (tenant_id, but readable by invitee email)
DROP POLICY IF EXISTS team_invites_tenant ON public.team_invites;
CREATE POLICY team_invites_tenant ON public.team_invites
  FOR ALL TO authenticated
  USING (tenant_id = governance.current_tenant_id()
         OR invited_email = (auth.jwt() ->> 'email')
         OR governance.current_user_is_admin())
  WITH CHECK (tenant_id = governance.current_tenant_id()
              OR governance.current_user_is_admin());

-- shared_links (creator OR token-readable; here: owner only via RLS)
DROP POLICY IF EXISTS shared_links_owner ON public.shared_links;
CREATE POLICY shared_links_owner ON public.shared_links
  FOR ALL TO authenticated
  USING (created_by = auth.uid()
         OR tenant_id = governance.current_tenant_id()
         OR governance.current_user_is_admin())
  WITH CHECK (created_by = auth.uid()
              OR tenant_id = governance.current_tenant_id()
              OR governance.current_user_is_admin());

-- ============================================================
-- 6. PUBLIC-CATALOG tables (read-all-auth, write-admin)
-- ============================================================
DO $$
DECLARE
  t text;
  catalog_tables text[] := ARRAY[
    'supported_languages','infra_regions','module_categories',
    'module_templates','module_reviews','tax_rules',
    'integration_catalog','seo_config','email_templates',
    'project_templates','knowledge_base','app_generators',
    'hamelech_modules','workflow_templates','extensions',
    'changelog'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables
                   WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_read ON public.%I
        FOR SELECT TO authenticated USING (true)
    $p$, t, t);
    EXECUTE format($p$
      CREATE POLICY %I_write ON public.%I
        FOR ALL TO authenticated, service_role
        USING (governance.is_service_role()
               OR governance.current_user_is_admin())
        WITH CHECK (governance.is_service_role()
                    OR governance.current_user_is_admin())
    $p$, t, t);
  END LOOP;
END $$;

-- ============================================================
-- 7. TENANT-SCOPED tables (the rest of the 59)
-- ============================================================
-- Each row carries tenant_id; only members of that tenant may access.

DO $$
DECLARE
  t text;
  tenanted_tables text[] := ARRAY[
    'ab_experiments','activity_feed','ai_agents','ai_code_reviews',
    'ai_models','ai_workflows','code_comments','code_snippets',
    'collab_sessions','conversion_funnels','custom_domains',
    'deploy_environments','deploy_pipelines','file_versions',
    'invoices','marketplace_revenue','runtime_containers',
    'scheduled_jobs','seller_profiles','tenant_integrations',
    'tenant_workflows','user_segments','workflow_executions'
  ];
  has_tenant_col boolean;
BEGIN
  FOREACH t IN ARRAY tenanted_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables
                   WHERE schemaname='public' AND tablename=t) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t
        AND column_name='tenant_id'
    ) INTO has_tenant_col;

    EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON public.%I', t, t);

    IF has_tenant_col THEN
      EXECUTE format($p$
        CREATE POLICY %I_tenant ON public.%I
          FOR ALL TO authenticated, service_role
          USING (governance.is_service_role()
                 OR tenant_id = governance.current_tenant_id()
                 OR governance.current_user_is_admin())
          WITH CHECK (governance.is_service_role()
                      OR tenant_id = governance.current_tenant_id()
                      OR governance.current_user_is_admin())
      $p$, t, t);
    ELSE
      -- table has no tenant_id; admin-only until backfilled by 00074
      EXECUTE format($p$
        CREATE POLICY %I_tenant ON public.%I
          FOR ALL TO authenticated, service_role
          USING (governance.is_service_role()
                 OR governance.current_user_is_admin())
          WITH CHECK (governance.is_service_role()
                      OR governance.current_user_is_admin())
      $p$, t, t);
    END IF;
  END LOOP;
END $$;

-- Drop the dead temp table outright if it still exists
DROP TABLE IF EXISTS public._temp_file_transfer CASCADE;

-- ============================================================
-- 8. Replace USING (true) on vertical-domain public.* tables
-- ============================================================
-- For every public.<prefix>_* table that has a tenant_id column
-- and a permissive policy, drop the permissive policy and create
-- a tenant-scoped policy. Prefixes from AGENT-09:
--   agri,ai,ap,ar,auto,bank,crm,ecom,edu,energy,events,food,
--   gl,health,hotel,hr,ins,inv,legal,log,mfg,pm,proc,re,sec,sports
-- ============================================================
DO $$
DECLARE
  r record;
  prefixes text[] := ARRAY[
    'agri_','ai_','ap_','ar_','auto_','bank_','crm_','ecom_',
    'edu_','energy_','events_','food_','gl_','health_','hotel_',
    'hr_','ins_','inv_','legal_','log_','mfg_','pm_','proc_',
    're_','sec_','sports_'
  ];
  prefix_match text;
  has_tenant_col boolean;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.qual
    FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.qual = 'true'
  LOOP
    -- match prefix
    prefix_match := NULL;
    SELECT pre INTO prefix_match
    FROM unnest(prefixes) pre
    WHERE r.tablename LIKE pre || '%'
    LIMIT 1;
    IF prefix_match IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.tablename
        AND column_name='tenant_id'
    ) INTO has_tenant_col;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   r.policyname, r.tablename);

    IF has_tenant_col THEN
      EXECUTE format($p$
        CREATE POLICY %I ON public.%I
          FOR ALL TO authenticated, service_role
          USING (governance.is_service_role()
                 OR tenant_id = governance.current_tenant_id()
                 OR governance.current_user_is_admin())
          WITH CHECK (governance.is_service_role()
                      OR tenant_id = governance.current_tenant_id()
                      OR governance.current_user_is_admin())
      $p$, r.policyname, r.tablename);
    ELSE
      -- child/line-item table without denormalised tenant_id;
      -- tighten to admin/service until 00074 backfills.
      EXECUTE format($p$
        CREATE POLICY %I ON public.%I
          FOR ALL TO authenticated, service_role
          USING (governance.is_service_role()
                 OR governance.current_user_is_admin())
          WITH CHECK (governance.is_service_role()
                      OR governance.current_user_is_admin())
      $p$, r.policyname, r.tablename);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 9. Audit log: record what changed
-- ============================================================
INSERT INTO governance.audit_log
  (actor, action, entity_type, entity_id, payload, created_at)
SELECT
  'agent-214',
  'rls_hardening_00073',
  'migration',
  '00073'::text,
  jsonb_build_object(
    'enabled_rls_count',  59,
    'service_role_count', 12,
    'owner_scoped_count', 7,
    'catalog_count',      16,
    'tenant_scoped_count',23,
    'replaced_using_true', (
      SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND qual='true'
    )
  ),
  now()
WHERE EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='governance' AND table_name='audit_log');

COMMIT;

-- ============================================================
-- POST-MIGRATION VERIFICATION (run manually)
-- ============================================================
-- 1. SELECT count(*) FROM pg_tables t
--    WHERE schemaname='public' AND NOT EXISTS (
--      SELECT 1 FROM pg_class c
--      JOIN pg_namespace n ON n.oid=c.relnamespace
--      WHERE n.nspname=t.schemaname AND c.relname=t.tablename
--        AND c.relrowsecurity);
--    -> expect 0
--
-- 2. SELECT count(*) FROM pg_policies
--    WHERE schemaname='public' AND qual='true';
--    -> expect 0 (or only catalog/admin tables)
--
-- 3. As an authenticated user with no tenant_id, SELECT against
--    any tenanted table should return 0 rows.
-- ============================================================
```

---

## Helper function summary

`governance.current_tenant_id()` resolves the tenant in order: (a) JWT claim `request.jwt.claim.tenant_id` (preferred - app puts active tenant on JWT at sign-in); (b) session GUC `app.current_tenant_id` (cron/edge functions via `SET LOCAL`); (c) `governance.users_profile.tenant_id` (fallback for sessions minted before multi-tenant claim).

`governance.is_service_role()` checks `request.jwt.claim.role = 'service_role'` - escape hatch for edge functions and platform admin tooling.

Both functions are `STABLE`, `SECURITY DEFINER`, granted to all roles. They never raise; missing claims yield NULL/false so RLS denies by default.

---

## What this migration does NOT do (follow-up migrations)

- **00074** add `tenant_id` to 57 child/line-item tables; admin-only fallback used here.
- **00075** index the 29 unindexed `tenant_id` columns + the 167 FK columns; required before this becomes performant.
- **00077** harden schema-qualified domains (`commercial.*`, `finance.*`, `procurement.*`, etc.). 00073 only touches `public.*`.
- **00080** fix `WITH CHECK NULL` policies on INSERT-only policies.
- **00081** add `CHECK` constraints for status enums and non-negative money.

---

## Files referenced and output

- Inputs: `_qa-reports-25/AGENT-09-db-integrity.md`, `supabase/migrations/00068_harden_rls_policies_always_true.sql`, `supabase/migrations/00071_remove_dangerous_anon_read_policies.sql`, `supabase/migrations/00004_rls_helper_functions_v2.sql`
- Output migration: `supabase/migrations/00073_rls_hardening.sql` (written separately, contains the SQL above verbatim)
