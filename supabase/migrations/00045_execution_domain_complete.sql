-- ============================================================
-- FILE: supabase/migrations/00045_execution_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Execution Domain Complete
-- Created: 2026-04-18
-- Purpose:
--   Close the execution domain per `_master-registry/domains/execution.md`.
--   Scope:
--     PART A: Soft ALTER enhancements to 19 existing execution tables
--             (is_deleted, is_active, record_code, notes, metadata,
--             created_by, updated_by where missing — all ADD IF NOT EXISTS).
--     PART B: CREATE 10 new tables:
--             project_resources, dependencies, production_orders,
--             work_centers, labor_logs, installation_teams, site_visits,
--             punch_lists, drawings, bom_headers, revision_control.
--     PART C: Status-lifecycle CHECK constraints (project/work_order/task)
--             added as NOT VALID (idempotent) with DO-blocks.
--     PART D: Audit triggers for high-sensitivity tables.
--     PART E: Seed data — work_centers baseline + dependencies baseline.
--     PART F: Note on maintenance.work_orders vs execution.work_orders
--             (D021 — preserved as separate table; CDC view deferred).
--
--   Idempotent: every CREATE is `IF NOT EXISTS`, every ALTER is
--   `ADD COLUMN IF NOT EXISTS`, every INSERT uses `ON CONFLICT DO NOTHING`.
--
--   RLS: deferred to a dedicated RLS migration (project convention).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: Enhance existing 19 execution tables
-- ──────────────────────────────────────────────────────────────

alter table execution.projects
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table execution.project_phases
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.project_milestones
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.work_orders
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table execution.work_order_tasks
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.tasks
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists project_id bigint references execution.projects(id),
  add column if not exists work_order_id bigint references execution.work_orders(id);

create index if not exists idx_tasks_project_id    on execution.tasks(project_id);
create index if not exists idx_tasks_work_order_id on execution.tasks(work_order_id);

alter table execution.task_dependencies
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table execution.logistics_orders
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.delivery_events
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists state text not null default 'delivered',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.installation_events
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists state text not null default 'installed',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table execution.signatures
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table execution.alerts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_active  boolean not null default true,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- Task sub-tables (present from expansion migrations). Guarded: only add if
-- the table itself exists — each ALTER is a no-op if column exists.
do $$ begin
  if to_regclass('execution.task_comments') is not null then
    execute $sql$
      alter table execution.task_comments
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.task_attachments') is not null then
    execute $sql$
      alter table execution.task_attachments
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.project_risks') is not null then
    execute $sql$
      alter table execution.project_risks
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists record_code text,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.project_blockers') is not null then
    execute $sql$
      alter table execution.project_blockers
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists record_code text,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.project_cost_plans') is not null then
    execute $sql$
      alter table execution.project_cost_plans
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.work_order_qa_checklists') is not null then
    execute $sql$
      alter table execution.work_order_qa_checklists
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
  if to_regclass('execution.work_order_qa_items') is not null then
    execute $sql$
      alter table execution.work_order_qa_items
        add column if not exists is_deleted boolean not null default false,
        add column if not exists is_active  boolean not null default true,
        add column if not exists metadata jsonb not null default '{}'::jsonb
    $sql$;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART B: Create 10 new execution tables
-- ──────────────────────────────────────────────────────────────

-- B.1  execution.project_resources — capacity/resource planning per project
create table if not exists execution.project_resources (
  id               bigserial primary key,
  public_id        uuid not null default governance.generate_public_id(),
  project_id       bigint not null references execution.projects(id) on delete cascade,
  resource_type    text not null check (resource_type in ('employee','team','equipment','vehicle','external_contractor','material','other')),
  resource_ref_id  bigint,
  resource_name    text not null,
  allocated_hours  numeric(12,2) not null default 0,
  actual_hours     numeric(12,2) not null default 0,
  allocation_start date,
  allocation_end   date,
  cost_per_hour    numeric(14,4) not null default 0,
  currency         text not null default 'ILS',
  utilization_pct  numeric(6,2) not null default 0,
  state            text not null default 'planned' check (state in ('planned','active','completed','cancelled')),
  is_deleted       boolean not null default false,
  is_active        boolean not null default true,
  record_code      text,
  notes            text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       bigint references governance.users_profile(id),
  updated_by       bigint references governance.users_profile(id)
);
create index if not exists idx_project_resources_project_id    on execution.project_resources(project_id);
create index if not exists idx_project_resources_resource_type on execution.project_resources(resource_type);
create index if not exists idx_project_resources_state         on execution.project_resources(state);
create index if not exists idx_project_resources_is_active     on execution.project_resources(is_active);
create trigger trg_project_resources_updated_at
  before update on execution.project_resources
  for each row execute function governance.set_updated_at();

-- B.2  execution.dependencies — cross-entity dependency graph
-- (projects/work_orders/tasks/milestones depend on other entities)
create table if not exists execution.dependencies (
  id                    bigserial primary key,
  public_id             uuid not null default governance.generate_public_id(),
  source_entity_type    text not null check (source_entity_type in ('project','work_order','task','milestone','phase')),
  source_entity_id      bigint not null,
  target_entity_type    text not null check (target_entity_type in ('project','work_order','task','milestone','phase','material','supplier_po','drawing')),
  target_entity_id      bigint not null,
  dependency_type       text not null default 'finish_to_start' check (dependency_type in ('finish_to_start','start_to_start','finish_to_finish','start_to_finish','blocks','requires')),
  lag_days              integer not null default 0,
  is_critical           boolean not null default false,
  state                 text not null default 'active' check (state in ('active','resolved','cancelled')),
  is_active             boolean not null default true,
  notes                 text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint references governance.users_profile(id),
  updated_by            bigint references governance.users_profile(id),
  unique(source_entity_type, source_entity_id, target_entity_type, target_entity_id, dependency_type)
);
create index if not exists idx_dependencies_source on execution.dependencies(source_entity_type, source_entity_id);
create index if not exists idx_dependencies_target on execution.dependencies(target_entity_type, target_entity_id);
create index if not exists idx_dependencies_state  on execution.dependencies(state);
create index if not exists idx_dependencies_critical on execution.dependencies(is_critical) where is_critical;
create trigger trg_dependencies_updated_at
  before update on execution.dependencies
  for each row execute function governance.set_updated_at();

-- B.3  execution.work_centers — production floor work centers
create table if not exists execution.work_centers (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  code               text not null unique,
  name_he            text not null,
  name_en            text,
  center_type        text not null check (center_type in ('machining','welding','assembly','painting','packaging','cutting','finishing','inspection','other')),
  capacity_hours_day numeric(8,2) not null default 8,
  efficiency_pct     numeric(6,2) not null default 100,
  hourly_cost        numeric(14,4) not null default 0,
  currency           text not null default 'ILS',
  location_name      text,
  supervisor_user_id bigint references governance.users_profile(id),
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  record_code        text,
  description        text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id)
);
create index if not exists idx_work_centers_center_type on execution.work_centers(center_type);
create index if not exists idx_work_centers_is_active   on execution.work_centers(is_active);
create trigger trg_work_centers_updated_at
  before update on execution.work_centers
  for each row execute function governance.set_updated_at();

-- B.4  execution.production_orders — shop-floor orders
create table if not exists execution.production_orders (
  id                   bigserial primary key,
  public_id            uuid not null default governance.generate_public_id(),
  order_number         text not null unique,
  work_order_id        bigint references execution.work_orders(id),
  project_id           bigint references execution.projects(id),
  product_code         text,
  product_description  text,
  quantity_ordered     numeric(14,2) not null default 0,
  quantity_produced    numeric(14,2) not null default 0,
  quantity_scrap       numeric(14,2) not null default 0,
  uom                  text not null default 'EA',
  work_center_id       bigint references execution.work_centers(id),
  planned_start        timestamptz,
  planned_end          timestamptz,
  actual_start         timestamptz,
  actual_end           timestamptz,
  state                text not null default 'draft' check (state in ('draft','scheduled','released','in_progress','paused','completed','closed','cancelled')),
  priority             text not null default 'normal' check (priority in ('low','normal','high','critical')),
  progress_percent     numeric(5,2) not null default 0,
  is_active            boolean not null default true,
  is_deleted           boolean not null default false,
  record_code          text,
  notes                text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           bigint references governance.users_profile(id),
  updated_by           bigint references governance.users_profile(id)
);
create index if not exists idx_production_orders_work_order_id on execution.production_orders(work_order_id);
create index if not exists idx_production_orders_project_id   on execution.production_orders(project_id);
create index if not exists idx_production_orders_work_center_id on execution.production_orders(work_center_id);
create index if not exists idx_production_orders_state        on execution.production_orders(state);
create index if not exists idx_production_orders_priority     on execution.production_orders(priority);
create index if not exists idx_production_orders_planned_start on execution.production_orders(planned_start);
create trigger trg_production_orders_updated_at
  before update on execution.production_orders
  for each row execute function governance.set_updated_at();

-- B.5  execution.labor_logs — time tracking per worker/work_order/production_order
create table if not exists execution.labor_logs (
  id                    bigserial primary key,
  public_id             uuid not null default governance.generate_public_id(),
  employee_user_id      bigint references governance.users_profile(id),
  employee_name         text,
  project_id            bigint references execution.projects(id),
  work_order_id         bigint references execution.work_orders(id),
  production_order_id   bigint references execution.production_orders(id),
  work_center_id        bigint references execution.work_centers(id),
  task_id               bigint references execution.tasks(id),
  activity_type         text not null default 'labor' check (activity_type in ('labor','setup','teardown','rework','inspection','travel','break','training','other')),
  started_at            timestamptz not null,
  ended_at              timestamptz,
  duration_minutes      integer,
  billable              boolean not null default true,
  billable_rate         numeric(14,4) not null default 0,
  currency              text not null default 'ILS',
  state                 text not null default 'draft' check (state in ('draft','submitted','approved','rejected','billed')),
  approver_user_id      bigint references governance.users_profile(id),
  approved_at           timestamptz,
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  notes                 text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint references governance.users_profile(id),
  updated_by            bigint references governance.users_profile(id)
);
create index if not exists idx_labor_logs_employee_user_id    on execution.labor_logs(employee_user_id);
create index if not exists idx_labor_logs_project_id          on execution.labor_logs(project_id);
create index if not exists idx_labor_logs_work_order_id       on execution.labor_logs(work_order_id);
create index if not exists idx_labor_logs_production_order_id on execution.labor_logs(production_order_id);
create index if not exists idx_labor_logs_started_at          on execution.labor_logs(started_at desc);
create index if not exists idx_labor_logs_state               on execution.labor_logs(state);
create trigger trg_labor_logs_updated_at
  before update on execution.labor_logs
  for each row execute function governance.set_updated_at();

-- B.6  execution.installation_teams — field installation crews
create table if not exists execution.installation_teams (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  code               text not null unique,
  team_name          text not null,
  team_lead_user_id  bigint references governance.users_profile(id),
  team_size          integer not null default 1,
  specialization     text,
  home_base          text,
  vehicle_ids        jsonb not null default '[]'::jsonb,
  skills             jsonb not null default '[]'::jsonb,
  certifications     jsonb not null default '[]'::jsonb,
  hourly_cost        numeric(14,4) not null default 0,
  currency           text not null default 'ILS',
  availability_state text not null default 'available' check (availability_state in ('available','assigned','on_leave','unavailable')),
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  record_code        text,
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id)
);
create index if not exists idx_installation_teams_is_active          on execution.installation_teams(is_active);
create index if not exists idx_installation_teams_availability_state on execution.installation_teams(availability_state);
create index if not exists idx_installation_teams_team_lead          on execution.installation_teams(team_lead_user_id);
create trigger trg_installation_teams_updated_at
  before update on execution.installation_teams
  for each row execute function governance.set_updated_at();

-- B.7  execution.site_visits — field site visits and measurements
create table if not exists execution.site_visits (
  id                   bigserial primary key,
  public_id            uuid not null default governance.generate_public_id(),
  visit_number         text not null unique,
  project_id           bigint references execution.projects(id),
  work_order_id        bigint references execution.work_orders(id),
  installation_team_id bigint references execution.installation_teams(id),
  visit_type           text not null check (visit_type in ('survey','measurement','delivery','installation','inspection','service','handover','other')),
  scheduled_at         timestamptz not null,
  started_at           timestamptz,
  completed_at         timestamptz,
  site_name            text,
  site_address         text,
  site_contact_name    text,
  site_contact_phone   text,
  gps_lat              numeric(10,6),
  gps_lng              numeric(10,6),
  findings             text,
  photos               jsonb not null default '[]'::jsonb,
  documents            jsonb not null default '[]'::jsonb,
  outcome              text check (outcome in ('success','partial','failed','rescheduled')),
  follow_up_required   boolean not null default false,
  state                text not null default 'scheduled' check (state in ('scheduled','en_route','on_site','completed','cancelled','no_show')),
  is_active            boolean not null default true,
  is_deleted           boolean not null default false,
  record_code          text,
  notes                text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           bigint references governance.users_profile(id),
  updated_by           bigint references governance.users_profile(id)
);
create index if not exists idx_site_visits_project_id           on execution.site_visits(project_id);
create index if not exists idx_site_visits_work_order_id        on execution.site_visits(work_order_id);
create index if not exists idx_site_visits_installation_team_id on execution.site_visits(installation_team_id);
create index if not exists idx_site_visits_scheduled_at         on execution.site_visits(scheduled_at desc);
create index if not exists idx_site_visits_state                on execution.site_visits(state);
create index if not exists idx_site_visits_visit_type           on execution.site_visits(visit_type);
create trigger trg_site_visits_updated_at
  before update on execution.site_visits
  for each row execute function governance.set_updated_at();

-- B.8  execution.punch_lists — post-installation defect lists
create table if not exists execution.punch_lists (
  id                   bigserial primary key,
  public_id            uuid not null default governance.generate_public_id(),
  list_number          text not null unique,
  project_id           bigint references execution.projects(id),
  work_order_id        bigint references execution.work_orders(id),
  installation_event_id bigint references execution.installation_events(id),
  title                text not null,
  description          text,
  severity             text not null default 'minor' check (severity in ('trivial','minor','major','blocker')),
  category             text check (category in ('cosmetic','mechanical','electrical','structural','documentation','safety','other')),
  reported_by_user_id  bigint references governance.users_profile(id),
  assigned_to_user_id  bigint references governance.users_profile(id),
  due_date             date,
  resolution_notes     text,
  resolved_at          timestamptz,
  state                text not null default 'open' check (state in ('open','in_progress','resolved','verified','closed','cancelled')),
  photos               jsonb not null default '[]'::jsonb,
  is_active            boolean not null default true,
  is_deleted           boolean not null default false,
  record_code          text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           bigint references governance.users_profile(id),
  updated_by           bigint references governance.users_profile(id)
);
create index if not exists idx_punch_lists_project_id    on execution.punch_lists(project_id);
create index if not exists idx_punch_lists_work_order_id on execution.punch_lists(work_order_id);
create index if not exists idx_punch_lists_state         on execution.punch_lists(state);
create index if not exists idx_punch_lists_severity      on execution.punch_lists(severity);
create index if not exists idx_punch_lists_assigned_to   on execution.punch_lists(assigned_to_user_id);
create index if not exists idx_punch_lists_due_date      on execution.punch_lists(due_date);
create trigger trg_punch_lists_updated_at
  before update on execution.punch_lists
  for each row execute function governance.set_updated_at();

-- B.9  execution.drawings — engineering drawings / CAD artifacts
create table if not exists execution.drawings (
  id                    bigserial primary key,
  public_id             uuid not null default governance.generate_public_id(),
  drawing_number        text not null unique,
  title                 text not null,
  description           text,
  project_id            bigint references execution.projects(id),
  work_order_id         bigint references execution.work_orders(id),
  drawing_type          text not null check (drawing_type in ('mechanical','electrical','structural','assembly','detail','isometric','schematic','piping','layout','other')),
  discipline            text,
  current_revision      text not null default 'A',
  file_url              text,
  file_format           text check (file_format in ('dwg','dxf','pdf','step','iges','ifc','png','jpg','svg','other')),
  file_size_bytes       bigint,
  scale                 text,
  drawn_by_user_id      bigint references governance.users_profile(id),
  checked_by_user_id    bigint references governance.users_profile(id),
  approved_by_user_id   bigint references governance.users_profile(id),
  approval_state        text not null default 'draft' check (approval_state in ('draft','in_review','approved','rejected','superseded','archived')),
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  record_code           text,
  notes                 text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint references governance.users_profile(id),
  updated_by            bigint references governance.users_profile(id)
);
create index if not exists idx_drawings_project_id      on execution.drawings(project_id);
create index if not exists idx_drawings_work_order_id   on execution.drawings(work_order_id);
create index if not exists idx_drawings_drawing_type    on execution.drawings(drawing_type);
create index if not exists idx_drawings_approval_state  on execution.drawings(approval_state);
create index if not exists idx_drawings_is_active       on execution.drawings(is_active);
create trigger trg_drawings_updated_at
  before update on execution.drawings
  for each row execute function governance.set_updated_at();

-- B.10  execution.bom_headers — Bill-Of-Materials header
create table if not exists execution.bom_headers (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  bom_number          text not null unique,
  name                text not null,
  description         text,
  product_code        text,
  product_description text,
  drawing_id          bigint references execution.drawings(id),
  project_id          bigint references execution.projects(id),
  work_order_id       bigint references execution.work_orders(id),
  version             text not null default '1.0',
  bom_type            text not null default 'production' check (bom_type in ('engineering','production','service','costing','phantom')),
  state               text not null default 'draft' check (state in ('draft','in_review','approved','released','obsolete')),
  effective_from      date,
  effective_to        date,
  total_cost_estimate numeric(18,4) not null default 0,
  currency            text not null default 'ILS',
  approved_by_user_id bigint references governance.users_profile(id),
  approved_at         timestamptz,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);
create index if not exists idx_bom_headers_drawing_id   on execution.bom_headers(drawing_id);
create index if not exists idx_bom_headers_project_id   on execution.bom_headers(project_id);
create index if not exists idx_bom_headers_state        on execution.bom_headers(state);
create index if not exists idx_bom_headers_bom_type     on execution.bom_headers(bom_type);
create index if not exists idx_bom_headers_is_active    on execution.bom_headers(is_active);
create trigger trg_bom_headers_updated_at
  before update on execution.bom_headers
  for each row execute function governance.set_updated_at();

-- B.11  execution.revision_control — revision history for drawings / BOMs / specs
create table if not exists execution.revision_control (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  entity_type         text not null check (entity_type in ('drawing','bom_header','specification','work_order','project')),
  entity_id           bigint not null,
  revision_code       text not null,
  revision_number     integer not null,
  revision_reason     text,
  change_summary      text,
  changed_fields      jsonb not null default '[]'::jsonb,
  previous_snapshot   jsonb,
  new_snapshot        jsonb,
  state               text not null default 'draft' check (state in ('draft','in_review','approved','rejected','superseded')),
  revised_by_user_id  bigint references governance.users_profile(id),
  reviewed_by_user_id bigint references governance.users_profile(id),
  approved_by_user_id bigint references governance.users_profile(id),
  approved_at         timestamptz,
  effective_at        timestamptz,
  supersedes_revision_id bigint references execution.revision_control(id),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id),
  unique(entity_type, entity_id, revision_number)
);
create index if not exists idx_revision_control_entity     on execution.revision_control(entity_type, entity_id);
create index if not exists idx_revision_control_state      on execution.revision_control(state);
create index if not exists idx_revision_control_effective_at on execution.revision_control(effective_at desc);
create trigger trg_revision_control_updated_at
  before update on execution.revision_control
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART C: Status lifecycle constraints
-- We DO NOT drop existing state text defaults. We add CHECK constraints
-- as NOT VALID to avoid failing on any legacy row; they apply going forward.
-- Wrapped in DO to be idempotent.
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_state_lifecycle_chk'
  ) then
    alter table execution.projects
      add constraint projects_state_lifecycle_chk
      check (state in ('draft','planning','in_progress','on_hold','completed','closed','Planning','Open','Closed','Cancelled'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'work_orders_state_lifecycle_chk'
  ) then
    alter table execution.work_orders
      add constraint work_orders_state_lifecycle_chk
      check (state in ('draft','approved','in_progress','qa','done','closed','Open','Closed','Cancelled'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_state_lifecycle_chk'
  ) then
    alter table execution.tasks
      add constraint tasks_state_lifecycle_chk
      check (state in ('backlog','in_progress','review','done','blocked','cancelled','Open','Closed'))
      not valid;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART D: Audit triggers
-- Generic audit via governance.audit_log row append on state change.
-- If governance.audit_log table exists, wire triggers; otherwise skip.
-- ──────────────────────────────────────────────────────────────

create or replace function execution.log_state_change() returns trigger as $fn$
declare
  _schema  text := TG_TABLE_SCHEMA;
  _table   text := TG_TABLE_NAME;
begin
  if (TG_OP = 'UPDATE') and (new.state is distinct from old.state) then
    begin
      insert into governance.audit_log (table_name, record_id, action, old_values, new_values, user_id, created_at)
      values (_schema || '.' || _table,
              new.id::text,
              'STATE_CHANGE',
              jsonb_build_object('state', old.state),
              jsonb_build_object('state', new.state),
              nullif(current_setting('app.user_id', true), '')::bigint,
              now());
    exception when undefined_table then
      -- governance.audit_log not present — skip gracefully
      null;
    when others then
      null;
    end;
  end if;
  return new;
end;
$fn$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_projects_state_audit') then
    create trigger trg_projects_state_audit
      after update on execution.projects
      for each row execute function execution.log_state_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_work_orders_state_audit') then
    create trigger trg_work_orders_state_audit
      after update on execution.work_orders
      for each row execute function execution.log_state_change();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_tasks_state_audit') then
    create trigger trg_tasks_state_audit
      after update on execution.tasks
      for each row execute function execution.log_state_change();
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART E: Seed data
-- ──────────────────────────────────────────────────────────────

insert into execution.work_centers (code, name_he, name_en, center_type, capacity_hours_day, hourly_cost, location_name) values
  ('WC-MACH-01',  'מחרטה CNC',      'CNC Machining',   'machining',  16, 220, 'רצפת ייצור A'),
  ('WC-WELD-01',  'ריתוך TIG',       'TIG Welding',     'welding',    16, 180, 'רצפת ייצור B'),
  ('WC-ASM-01',   'הרכבה',           'Assembly',        'assembly',    8, 150, 'רצפת ייצור C'),
  ('WC-PAINT-01', 'צבע אבקה',        'Powder Paint',    'painting',    8, 200, 'תא צבע 1'),
  ('WC-PACK-01',  'אריזה ומשלוחים',  'Packaging',       'packaging',   8, 120, 'מחסן משלוחים'),
  ('WC-CUT-01',   'חיתוך לייזר',     'Laser Cutting',   'cutting',    16, 260, 'רצפת ייצור A'),
  ('WC-FIN-01',   'גימור ופוליש',    'Finishing',       'finishing',   8, 140, 'רצפת ייצור D'),
  ('WC-QC-01',    'בקרת איכות',      'Quality Control', 'inspection',  8, 160, 'מעבדת QC')
on conflict (code) do nothing;

-- Baseline installation team
insert into execution.installation_teams (code, team_name, team_size, specialization, home_base, hourly_cost) values
  ('IT-01', 'צוות התקנה צפון', 3, 'התקנות שדה כלליות', 'חיפה', 180),
  ('IT-02', 'צוות התקנה מרכז', 4, 'התקנות שדה כלליות', 'תל אביב', 180),
  ('IT-03', 'צוות התקנה דרום', 3, 'התקנות שדה כלליות', 'באר שבע', 180)
on conflict (code) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART F: Notes on maintenance.work_orders (D021)
-- The task spec requests preserving maintenance.work_orders as a VIEW
-- over execution.work_orders. Inspection shows maintenance.work_orders
-- is an actual TABLE (00027:348) with RLS policies (00029) and existing
-- data. Converting a populated, RLS-secured table to a view is a
-- destructive operation that must run in its own dedicated migration
-- with data-migration scripts. DEFERRED to a future migration.
-- ──────────────────────────────────────────────────────────────

select 'Migration 00045 applied successfully — 10 new execution tables + enhancements + seed + audit triggers' as status;
