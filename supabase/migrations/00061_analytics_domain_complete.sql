-- ============================================================
-- FILE: supabase/migrations/00061_analytics_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Analytics Domain Complete
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing analytics.* tables (dashboard_boards,
--      dashboard_widgets, dashboard_board_widgets, user_dashboard_boards,
--      dashboard_definitions, kpi_snapshots, read_model_invalidations,
--      rm_executive_summary, rm_operations_summary, rm_procurement_summary,
--      rm_finance_summary, rm_workforce_summary, rm_ai_summary,
--      custom_metrics) — add canonical audit columns where missing.
--   2. CREATE MISSING tables:
--        analytics.kpi_definitions     (canonical KPI registry)
--        analytics.report_definitions  (report registry)
--        analytics.report_runs         (queued + complete report runs)
--        analytics.drilldown_paths     (cross-entity drilldown map)
--   3. Status lifecycles via CHECK:
--        report_run.status ∈ (queued, running, complete, failed)
--        read_model_invalidation.status ∈ (pending, processed, skipped)
--   4. Indexes on FK + status + snapshot_date.
--   5. RLS enabled + 3 policies per NEW table
--        (select_authenticated / insert_authenticated / update_authenticated).
--   6. Seed kpi_definitions canonical rows.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ensure analytics schema exists + helper trigger
-- ──────────────────────────────────────────────────────────────

create schema if not exists analytics;

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'analytics' and p.proname = 'set_updated_at'
  ) then
    execute $fn$
      create function analytics.set_updated_at() returns trigger as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$ language plpgsql;
    $fn$;
  end if;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART B: ALTER existing analytics tables — canonical audit cols
-- ──────────────────────────────────────────────────────────────

alter table if exists analytics.dashboard_definitions
  add column if not exists is_active   boolean      not null default true,
  add column if not exists is_deleted  boolean      not null default false,
  add column if not exists record_code text,
  add column if not exists notes       text,
  add column if not exists metadata    jsonb        not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz  not null default now(),
  add column if not exists updated_at  timestamptz  not null default now();

alter table if exists analytics.dashboard_widgets
  add column if not exists is_deleted  boolean      not null default false,
  add column if not exists record_code text,
  add column if not exists notes       text,
  add column if not exists metadata    jsonb        not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint;

alter table if exists analytics.dashboard_boards
  add column if not exists is_deleted  boolean      not null default false,
  add column if not exists record_code text,
  add column if not exists notes       text,
  add column if not exists metadata    jsonb        not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint;

alter table if exists analytics.dashboard_board_widgets
  add column if not exists is_deleted  boolean      not null default false,
  add column if not exists metadata    jsonb        not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint;

alter table if exists analytics.user_dashboard_boards
  add column if not exists is_active   boolean      not null default true,
  add column if not exists metadata    jsonb        not null default '{}'::jsonb;

alter table if exists analytics.kpi_snapshots
  add column if not exists is_deleted   boolean     not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb       not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists created_at   timestamptz not null default now();

alter table if exists analytics.read_model_invalidations
  add column if not exists is_deleted   boolean     not null default false,
  add column if not exists metadata     jsonb       not null default '{}'::jsonb,
  add column if not exists status       text        not null default 'pending',
  add column if not exists processed_at timestamptz,
  add column if not exists error_message text,
  add column if not exists retry_count  integer     not null default 0,
  add column if not exists created_at   timestamptz not null default now();

do $$
begin
  -- Add CHECK on read_model_invalidations.status if column now exists and constraint missing
  if exists (select 1 from information_schema.columns
             where table_schema='analytics' and table_name='read_model_invalidations' and column_name='status')
  and not exists (select 1 from pg_constraint
                  where conname = 'read_model_invalidations_status_chk') then
    alter table analytics.read_model_invalidations
      add constraint read_model_invalidations_status_chk
      check (status in ('pending','processed','skipped'));
  end if;
end$$;

alter table if exists analytics.rm_executive_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.rm_operations_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.rm_procurement_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.rm_finance_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.rm_workforce_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.rm_ai_summary
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata  jsonb not null default '{}'::jsonb;

alter table if exists analytics.custom_metrics
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists notes       text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

-- ──────────────────────────────────────────────────────────────
-- PART C: CREATE MISSING tables
-- ──────────────────────────────────────────────────────────────

-- kpi_definitions — canonical KPI registry
create table if not exists analytics.kpi_definitions (
  id                  uuid primary key default gen_random_uuid(),
  kpi_name            text not null unique,
  kpi_label_he        text,
  formula_jsonb       jsonb not null default '{}'::jsonb,
  unit                text,
  target_value        numeric(20,4),
  comparison_type     text not null default 'higher_is_better'
    check (comparison_type in ('higher_is_better','lower_is_better','within_range','exact_match')),
  data_source_table   text,
  data_source_query   text,
  refresh_cron        text,
  category            text,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_by          bigint,
  updated_by          bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_kpi_definitions_active
  on analytics.kpi_definitions (is_active, kpi_name)
  where coalesce(is_deleted,false) = false;
create index if not exists idx_kpi_definitions_category
  on analytics.kpi_definitions (category);

-- report_definitions — registry of reports
create table if not exists analytics.report_definitions (
  id                  uuid primary key default gen_random_uuid(),
  report_code         text not null unique,
  report_name         text not null,
  report_label_he     text,
  description         text,
  category            text,
  query_template      text,
  parameters_schema   jsonb not null default '{}'::jsonb,
  output_format       text not null default 'table'
    check (output_format in ('table','csv','pdf','json','xlsx')),
  source_table        text,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_by          bigint,
  updated_by          bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_report_definitions_active
  on analytics.report_definitions (is_active, report_code)
  where coalesce(is_deleted,false) = false;
create index if not exists idx_report_definitions_category
  on analytics.report_definitions (category);

-- report_runs — each enqueued / completed run
create table if not exists analytics.report_runs (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references analytics.report_definitions(id) on delete cascade,
  status              text not null default 'queued'
    check (status in ('queued','running','complete','failed')),
  parameters          jsonb not null default '{}'::jsonb,
  output_uri          text,
  row_count           bigint,
  error_message       text,
  requested_by        bigint,
  started_at          timestamptz,
  finished_at         timestamptz,
  duration_ms         integer,
  is_deleted          boolean not null default false,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_report_runs_report
  on analytics.report_runs (report_id, created_at desc);
create index if not exists idx_report_runs_status
  on analytics.report_runs (status, created_at desc)
  where status in ('queued','running','failed');

-- drilldown_paths — cross-entity drilldown map
create table if not exists analytics.drilldown_paths (
  id                  uuid primary key default gen_random_uuid(),
  path_code           text not null unique,
  path_label_he       text,
  from_entity         text not null,
  to_entity           text not null,
  link_field          text,
  filter_template     jsonb not null default '{}'::jsonb,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_by          bigint,
  updated_by          bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_drilldown_paths_from_to
  on analytics.drilldown_paths (from_entity, to_entity);

-- ──────────────────────────────────────────────────────────────
-- PART D: hot-path indexes on existing tables
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='analytics' and table_name='kpi_snapshots' and column_name='snapshot_date') then
    execute 'create index if not exists idx_kpi_snapshots_kpi_date
             on analytics.kpi_snapshots (kpi_name, snapshot_date desc)';
    execute 'create index if not exists idx_kpi_snapshots_date
             on analytics.kpi_snapshots (snapshot_date desc)';
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='analytics' and table_name='read_model_invalidations' and column_name='status') then
    execute 'create index if not exists idx_read_model_invalidations_status
             on analytics.read_model_invalidations (status, created_at)
             where status in (''pending'',''skipped'')';
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='analytics' and table_name='dashboard_board_widgets') then
    execute 'create index if not exists idx_dashboard_board_widgets_board
             on analytics.dashboard_board_widgets (board_id, order_index)';
  end if;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART E: Triggers — analytics.set_updated_at() on canonical tables
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'kpi_definitions','report_definitions','report_runs','drilldown_paths',
    'dashboard_definitions','custom_metrics'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='analytics' and table_name=t)
    and not exists (
      select 1 from pg_trigger tg
      join pg_class c on tg.tgrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      where n.nspname='analytics' and c.relname=t and tg.tgname='set_updated_at_trg'
    ) then
      execute format(
        'create trigger set_updated_at_trg before update on analytics.%I
         for each row execute function analytics.set_updated_at()',
        t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — enable on NEW tables with 3 baseline policies each
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'kpi_definitions','report_definitions','report_runs','drilldown_paths'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='analytics' and table_name=t) then
      execute format('alter table analytics.%I enable row level security', t);
      execute format('drop policy if exists %I_select_auth on analytics.%I', t, t);
      execute format('drop policy if exists %I_insert_auth on analytics.%I', t, t);
      execute format('drop policy if exists %I_update_auth on analytics.%I', t, t);

      execute format(
        'create policy %I_select_auth on analytics.%I for select using (true)',
        t, t
      );
      execute format(
        'create policy %I_insert_auth on analytics.%I for insert with check (true)',
        t, t
      );
      execute format(
        'create policy %I_update_auth on analytics.%I for update using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART G: Seed kpi_definitions canonical rows
-- ──────────────────────────────────────────────────────────────

insert into analytics.kpi_definitions
  (kpi_name, kpi_label_he, unit, target_value, comparison_type, data_source_table, category, formula_jsonb)
values
  ('revenue_mtd',       'הכנסות מתחילת החודש', 'ILS', 500000, 'higher_is_better', 'finance.invoices',
   'finance',  '{"agg":"sum","field":"total_amount","where":"issue_date >= date_trunc(''month'', now())"}'::jsonb),
  ('expenses_mtd',      'הוצאות מתחילת החודש', 'ILS', 300000, 'lower_is_better',  'finance.expenses',
   'finance',  '{"agg":"sum","field":"amount","where":"incurred_at >= date_trunc(''month'', now())"}'::jsonb),
  ('gross_profit_mtd',  'רווח גולמי מתחילת החודש', 'ILS', 200000, 'higher_is_better', null,
   'finance',  '{"formula":"revenue_mtd - expenses_mtd"}'::jsonb),
  ('headcount',         'כוח אדם פעיל', 'persons', null, 'within_range', 'workforce.employees',
   'workforce','{"agg":"count","field":"id","where":"is_active = true"}'::jsonb),
  ('open_invoices',     'חשבוניות פתוחות', 'count', null, 'lower_is_better', 'finance.invoices',
   'finance',  '{"agg":"count","field":"id","where":"status in (''sent'',''overdue'')"}'::jsonb),
  ('overdue_invoices',  'חשבוניות באיחור', 'count', null, 'lower_is_better', 'finance.invoices',
   'finance',  '{"agg":"count","field":"id","where":"status = ''overdue''"}'::jsonb),
  ('inventory_value',   'שווי מלאי', 'ILS', null, 'within_range', 'inventory.stock_levels',
   'inventory','{"agg":"sum","field":"quantity * unit_cost"}'::jsonb)
on conflict (kpi_name) do nothing;

-- ==============================================================
-- END 00061_analytics_domain_complete.sql
-- ==============================================================
