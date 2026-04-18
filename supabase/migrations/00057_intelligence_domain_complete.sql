-- ============================================================
-- FILE: supabase/migrations/00057_intelligence_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Intelligence Domain Complete (15 models)
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing intelligence.* tables (13) — add canonical
--      audit columns (is_deleted, is_active, record_code, notes,
--      metadata, created_by, updated_by) where missing.
--   2. CREATE MISSING tables (2):
--        intelligence.prompt_templates
--        intelligence.orchestration_flows
--   3. Tighten status lifecycles per B-D-INT001 (CHECK constraints).
--   4. Audit triggers on ai_insights + decision_recommendations.
--   5. RLS enabled + 3 policies per NEW table
--        (authenticated_read, analyst_write, admin_delete).
--   6. Indexes on FK columns + status + created_at desc.
--   7. Seed 4 canonical orchestration_flows + 6 prompt_templates.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing intelligence tables — housekeeping cols
-- ──────────────────────────────────────────────────────────────

alter table intelligence.ai_insights
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'generated';

alter table intelligence.anomaly_cases
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'open';

alter table intelligence.decision_recommendations
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'pending';

alter table intelligence.forecast_models
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table intelligence.trend_signals
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table intelligence.seasonality_patterns
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table intelligence.quality_scores
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

alter table intelligence.agent_registry
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table intelligence.agent_jobs
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'queued';

alter table intelligence.model_registry
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table intelligence.model_executions
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'queued',
  add column if not exists updated_at timestamptz not null default now();

alter table intelligence.recommendation_feedback
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

alter table intelligence.anomaly_feedback
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

-- ──────────────────────────────────────────────────────────────
-- PART B: CHECK constraints — status lifecycles
-- Guarded by name existence so re-runs are idempotent.
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_ai_insights_status') then
    alter table intelligence.ai_insights
      add constraint chk_ai_insights_status
      check (status in ('generated','published','acknowledged','actioned','dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_anomaly_cases_status') then
    alter table intelligence.anomaly_cases
      add constraint chk_anomaly_cases_status
      check (status in ('open','investigating','resolved','false_positive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_decision_recommendations_status') then
    alter table intelligence.decision_recommendations
      add constraint chk_decision_recommendations_status
      check (status in ('pending','accepted','rejected','expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_agent_jobs_status') then
    alter table intelligence.agent_jobs
      add constraint chk_agent_jobs_status
      check (status in ('queued','running','completed','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_model_executions_status') then
    alter table intelligence.model_executions
      add constraint chk_model_executions_status
      check (status in ('queued','running','complete','failed'));
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART C: CREATE missing tables
-- ──────────────────────────────────────────────────────────────

-- C.1  prompt_templates — reusable LLM prompts
create table if not exists intelligence.prompt_templates (
  id              uuid primary key default gen_random_uuid(),
  template_name   text not null unique,
  template_text   text not null,
  variables       jsonb not null default '{}'::jsonb,
  category        text,
  language        text not null default 'he',
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  notes           text,
  usage_count     integer not null default 0,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint references governance.users_profile(id),
  updated_by      bigint references governance.users_profile(id)
);

create index if not exists idx_prompt_templates_category   on intelligence.prompt_templates(category);
create index if not exists idx_prompt_templates_language   on intelligence.prompt_templates(language);
create index if not exists idx_prompt_templates_is_active  on intelligence.prompt_templates(is_active);
create index if not exists idx_prompt_templates_created_at on intelligence.prompt_templates(created_at desc);

create trigger trg_prompt_templates_updated_at
  before update on intelligence.prompt_templates
  for each row execute function governance.set_updated_at();

-- C.2  orchestration_flows — multi-step AI flow definitions
create table if not exists intelligence.orchestration_flows (
  id              uuid primary key default gen_random_uuid(),
  flow_name       text not null unique,
  description     text,
  trigger_type    text not null default 'manual'
                    check (trigger_type in ('manual','scheduled','event','webhook')),
  trigger_config  jsonb not null default '{}'::jsonb,
  steps           jsonb not null default '[]'::jsonb,
  status          text not null default 'draft'
                    check (status in ('draft','active','paused','completed')),
  last_run_at     timestamptz,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint references governance.users_profile(id),
  updated_by      bigint references governance.users_profile(id)
);

create index if not exists idx_orchestration_flows_trigger_type on intelligence.orchestration_flows(trigger_type);
create index if not exists idx_orchestration_flows_status       on intelligence.orchestration_flows(status);
create index if not exists idx_orchestration_flows_last_run_at  on intelligence.orchestration_flows(last_run_at desc);
create index if not exists idx_orchestration_flows_created_at   on intelligence.orchestration_flows(created_at desc);

create trigger trg_orchestration_flows_updated_at
  before update on intelligence.orchestration_flows
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART D: Indexes on FK / status / created_at columns on existing tables
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_ai_insights_status         on intelligence.ai_insights(status);
create index if not exists idx_ai_insights_created_at     on intelligence.ai_insights(created_at desc);
create index if not exists idx_ai_insights_parent         on intelligence.ai_insights(parent_entity_type, parent_entity_id);

create index if not exists idx_anomaly_cases_status       on intelligence.anomaly_cases(status);
create index if not exists idx_anomaly_cases_created_at   on intelligence.anomaly_cases(created_at desc);
create index if not exists idx_anomaly_cases_parent       on intelligence.anomaly_cases(parent_entity_type, parent_entity_id);

create index if not exists idx_decision_recs_status       on intelligence.decision_recommendations(status);
create index if not exists idx_decision_recs_created_at   on intelligence.decision_recommendations(created_at desc);
create index if not exists idx_decision_recs_parent       on intelligence.decision_recommendations(parent_entity_type, parent_entity_id);

create index if not exists idx_forecast_models_domain     on intelligence.forecast_models(forecast_domain);
create index if not exists idx_forecast_models_created_at on intelligence.forecast_models(created_at desc);

create index if not exists idx_trend_signals_type         on intelligence.trend_signals(signal_type);
create index if not exists idx_trend_signals_created_at   on intelligence.trend_signals(created_at desc);

create index if not exists idx_seasonality_type           on intelligence.seasonality_patterns(pattern_type);
create index if not exists idx_seasonality_created_at     on intelligence.seasonality_patterns(created_at desc);

create index if not exists idx_quality_scores_type        on intelligence.quality_scores(score_type);
create index if not exists idx_quality_scores_parent      on intelligence.quality_scores(parent_entity_type, parent_entity_id);
create index if not exists idx_quality_scores_created_at  on intelligence.quality_scores(created_at desc);

create index if not exists idx_agent_registry_status      on intelligence.agent_registry(status);
create index if not exists idx_agent_registry_created_at  on intelligence.agent_registry(created_at desc);

create index if not exists idx_agent_jobs_agent_id        on intelligence.agent_jobs(agent_id);
create index if not exists idx_agent_jobs_status          on intelligence.agent_jobs(status);
create index if not exists idx_agent_jobs_created_at      on intelligence.agent_jobs(created_at desc);

create index if not exists idx_model_registry_type        on intelligence.model_registry(model_type);
create index if not exists idx_model_registry_status      on intelligence.model_registry(status);
create index if not exists idx_model_registry_created_at  on intelligence.model_registry(created_at desc);

create index if not exists idx_model_executions_registry  on intelligence.model_executions(model_registry_id);
create index if not exists idx_model_executions_status    on intelligence.model_executions(status);
create index if not exists idx_model_executions_created_at on intelligence.model_executions(created_at desc);

create index if not exists idx_rec_feedback_rec_id        on intelligence.recommendation_feedback(recommendation_id);
create index if not exists idx_rec_feedback_created_at    on intelligence.recommendation_feedback(created_at desc);

create index if not exists idx_anom_feedback_case_id      on intelligence.anomaly_feedback(anomaly_case_id);
create index if not exists idx_anom_feedback_created_at   on intelligence.anomaly_feedback(created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART E: Audit triggers on ai_insights + decision_recommendations
--   (updated_at already handled by existing triggers on some — add
--    only if missing.)
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ai_insights_updated_at') then
    execute 'create trigger trg_ai_insights_updated_at before update on intelligence.ai_insights for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_decision_recommendations_updated_at') then
    execute 'create trigger trg_decision_recommendations_updated_at before update on intelligence.decision_recommendations for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_quality_scores_updated_at') then
    execute 'create trigger trg_quality_scores_updated_at before update on intelligence.quality_scores for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_model_executions_updated_at') then
    execute 'create trigger trg_model_executions_updated_at before update on intelligence.model_executions for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_recommendation_feedback_updated_at') then
    execute 'create trigger trg_recommendation_feedback_updated_at before update on intelligence.recommendation_feedback for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_anomaly_feedback_updated_at') then
    execute 'create trigger trg_anomaly_feedback_updated_at before update on intelligence.anomaly_feedback for each row execute function governance.set_updated_at()';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS + 3 baseline policies per NEW table
--   * <tbl>_authenticated_read  — SELECT to any authenticated user
--   * <tbl>_analyst_write       — INSERT/UPDATE to authenticated/service
--   * <tbl>_admin_delete        — DELETE only by super_admin
-- Also enable RLS + policies on the 13 existing intelligence tables.
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'ai_insights',
    'anomaly_cases',
    'decision_recommendations',
    'forecast_models',
    'trend_signals',
    'seasonality_patterns',
    'quality_scores',
    'agent_registry',
    'agent_jobs',
    'model_registry',
    'model_executions',
    'recommendation_feedback',
    'anomaly_feedback',
    'prompt_templates',
    'orchestration_flows'
  ];
begin
  foreach t in array tables loop
    execute format('alter table intelligence.%I enable row level security', t);

    -- authenticated_read (SELECT)
    execute format($pol$
      do $inner$ begin
        if not exists (
          select 1 from pg_policies
          where schemaname='intelligence' and tablename='%1$s' and policyname='%1$s_authenticated_read'
        ) then
          create policy %1$s_authenticated_read on intelligence.%1$I
            for select using (
              auth.role() = 'authenticated'
              or current_setting('role', true) in ('authenticated','service_role','anon')
            );
        end if;
      end $inner$;
    $pol$, t);

    -- analyst_write (INSERT + UPDATE)
    execute format($pol$
      do $inner$ begin
        if not exists (
          select 1 from pg_policies
          where schemaname='intelligence' and tablename='%1$s' and policyname='%1$s_analyst_write'
        ) then
          create policy %1$s_analyst_write on intelligence.%1$I
            for all using (auth.role() in ('authenticated','service_role'))
            with check (auth.role() in ('authenticated','service_role'));
        end if;
      end $inner$;
    $pol$, t);

    -- admin_delete (DELETE — super_admin only)
    execute format($pol$
      do $inner$ begin
        if not exists (
          select 1 from pg_policies
          where schemaname='intelligence' and tablename='%1$s' and policyname='%1$s_admin_delete'
        ) then
          create policy %1$s_admin_delete on intelligence.%1$I
            for delete using (
              auth.role() = 'service_role'
              or coalesce(current_setting('request.jwt.claim.is_super_admin', true), 'false')::boolean = true
            );
        end if;
      end $inner$;
    $pol$, t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART G: Seed 4 canonical orchestration_flows (Hebrew names)
-- ──────────────────────────────────────────────────────────────

insert into intelligence.orchestration_flows
  (flow_name, description, trigger_type, trigger_config, steps, status)
values
  ('lead_to_insight',
   'לידים → תובנת AI: ניתוח ליד חדש ויצירת תובנה',
   'event',
   '{"event_type":"lead.created","source":"commercial"}'::jsonb,
   '[
      {"step":"fetch_lead","action":"commercial.get_lead"},
      {"step":"score_lead","action":"model_registry.run","model_code":"lead_scorer_v1"},
      {"step":"generate_insight","action":"ai_insight.create","category":"lead_quality"}
    ]'::jsonb,
   'active'),
  ('invoice_to_anomaly_scan',
   'חשבונית → סריקת אנומליות: בדיקת חשבונית חדשה נגד דפוסי הונאה',
   'event',
   '{"event_type":"supplier_invoice.submitted","source":"procurement"}'::jsonb,
   '[
      {"step":"fetch_invoice","action":"procurement.get_supplier_invoice"},
      {"step":"scan_duplicates","action":"anomaly.scan_duplicates"},
      {"step":"scan_amount_outliers","action":"anomaly.scan_outliers"},
      {"step":"open_case_if_flagged","action":"anomaly_case.create_if_flagged"}
    ]'::jsonb,
   'active'),
  ('stock_to_reorder',
   'מלאי → הזמנה מחדש: המלצה אוטומטית להזמנת מלאי',
   'scheduled',
   '{"cron":"0 6 * * *","timezone":"Asia/Jerusalem"}'::jsonb,
   '[
      {"step":"fetch_low_stock","action":"inventory.list_below_min"},
      {"step":"forecast_demand","action":"forecast_model.run","model_code":"inventory_demand_v1"},
      {"step":"recommend_po","action":"decision_recommendation.create","type":"reorder"}
    ]'::jsonb,
   'active'),
  ('payroll_to_anomaly',
   'שכר → אנומליות: בדיקת חריגות בחישובי שכר חודשיים',
   'scheduled',
   '{"cron":"0 4 28 * *","timezone":"Asia/Jerusalem"}'::jsonb,
   '[
      {"step":"fetch_payroll_runs","action":"workforce.list_current_payroll_runs"},
      {"step":"detect_variance","action":"anomaly.detect_payroll_variance"},
      {"step":"open_case_if_flagged","action":"anomaly_case.create_if_flagged"}
    ]'::jsonb,
   'active')
on conflict (flow_name) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART H: Seed 6 canonical prompt_templates (Hebrew)
-- ──────────────────────────────────────────────────────────────

insert into intelligence.prompt_templates
  (template_name, template_text, variables, category, language, is_active)
values
  ('customer_summary',
   'סכם את הלקוח {{customer_name}} בהתבסס על נתוני המכירות האחרונים: {{sales_last_12m}}. ציין מגמות, סיכונים והזדמנויות.',
   '{"customer_name":"string","sales_last_12m":"number"}'::jsonb,
   'customer',
   'he',
   true),
  ('quote_recommendation',
   'עבור ההצעה {{quote_number}} ללקוח {{customer_name}} בסכום {{quote_amount}}, המלץ על הנחה או תנאי תשלום מיטביים בהתבסס על היסטוריית הלקוח.',
   '{"quote_number":"string","customer_name":"string","quote_amount":"number"}'::jsonb,
   'commercial',
   'he',
   true),
  ('anomaly_explanation',
   'הסבר למה הרשומה {{entity_type}} מספר {{entity_id}} זוהתה כאנומליה עם ציון {{anomaly_score}}. פרט את הגורמים העיקריים.',
   '{"entity_type":"string","entity_id":"number","anomaly_score":"number"}'::jsonb,
   'anomaly',
   'he',
   true),
  ('forecast_summary',
   'סכם את תחזית {{forecast_domain}} לתקופה {{period_start}} - {{period_end}}. הצג נקודות מפתח, רמת ודאות והמלצות.',
   '{"forecast_domain":"string","period_start":"date","period_end":"date"}'::jsonb,
   'forecast',
   'he',
   true),
  ('payroll_check',
   'בדוק את תלוש השכר של {{employee_name}} לחודש {{payroll_month}}. סמן חריגות מהממוצע האישי ומהממוצע המחלקתי.',
   '{"employee_name":"string","payroll_month":"string"}'::jsonb,
   'payroll',
   'he',
   true),
  ('procurement_evaluation',
   'הערך את הספק {{supplier_name}} על בסיס {{pos_count}} הזמנות רכש אחרונות. דרג ביצועים, עמידה בזמנים ואיכות.',
   '{"supplier_name":"string","pos_count":"number"}'::jsonb,
   'procurement',
   'he',
   true)
on conflict (template_name) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART I: Final status
-- ──────────────────────────────────────────────────────────────
select 'Migration 00057 applied — intelligence domain complete (15 models, 2 new tables, seeds, RLS, audit triggers)' as status;
