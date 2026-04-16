-- ============================================================
-- FILE: supabase/migrations/00021_dashboard_tables.sql
-- Dashboard Widgets Engine — boards, widgets, board_widgets, user preferences
-- ============================================================

create table if not exists analytics.dashboard_boards (
  id bigserial primary key,
  board_code text not null unique,
  board_name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics.dashboard_widgets (
  id bigserial primary key,
  widget_code text not null unique,
  widget_name text not null,
  data_source_type text not null,
  data_source_ref text,
  default_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics.dashboard_board_widgets (
  id bigserial primary key,
  board_id bigint not null references analytics.dashboard_boards(id) on delete cascade,
  widget_id bigint not null references analytics.dashboard_widgets(id) on delete cascade,
  title text not null,
  width_units integer not null default 4,
  height_units integer not null default 2,
  order_index integer not null default 0,
  config_payload jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(board_id, widget_id)
);

create table if not exists analytics.user_dashboard_boards (
  id bigserial primary key,
  user_id bigint not null references governance.users_profile(id) on delete cascade,
  board_id bigint not null references analytics.dashboard_boards(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, board_id)
);

create trigger trg_dashboard_boards_updated_at
before update on analytics.dashboard_boards
for each row execute function governance.set_updated_at();

create trigger trg_dashboard_widgets_updated_at
before update on analytics.dashboard_widgets
for each row execute function governance.set_updated_at();

create trigger trg_dashboard_board_widgets_updated_at
before update on analytics.dashboard_board_widgets
for each row execute function governance.set_updated_at();

-- ── Seed: boards ──

insert into analytics.dashboard_boards (board_code, board_name, description)
values
  ('executive_main', 'Executive Main Board', 'Executive KPI and risk board'),
  ('operations_main', 'Operations Main Board', 'Operations live board'),
  ('procurement_main', 'Procurement Main Board', 'Procurement live board'),
  ('workforce_main', 'Workforce Main Board', 'Workforce live board'),
  ('ai_main', 'AI Main Board', 'AI live board')
on conflict (board_code) do nothing;

-- ── Seed: widgets ──

insert into analytics.dashboard_widgets (widget_code, widget_name, data_source_type, data_source_ref)
values
  ('executive_total_revenue', 'Executive Total Revenue', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('finance_overdue_amount', 'Finance Overdue Amount', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('procurement_pending_approvals', 'Procurement Pending Approvals', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('operations_delayed_work_orders', 'Operations Delayed Work Orders', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('workforce_missing_attendance', 'Workforce Missing Attendance', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('ai_unhealthy_agents', 'AI Unhealthy Agents', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('recommendation_queue', 'Recommendation Queue', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('operational_alerts_feed', 'Operational Alerts Feed', 'rpc', 'analytics.get_dashboard_widget_data'),
  ('procurement_overdue_pos_feed', 'Procurement Overdue PO Feed', 'rpc', 'analytics.get_dashboard_widget_data')
on conflict (widget_code) do nothing;

-- ── Seed: executive board widget layout ──

insert into analytics.dashboard_board_widgets (board_id, widget_id, title, width_units, height_units, order_index)
select b.id, w.id, 'Total Revenue', 3, 2, 1
from analytics.dashboard_boards b, analytics.dashboard_widgets w
where b.board_code = 'executive_main' and w.widget_code = 'executive_total_revenue'
on conflict do nothing;

insert into analytics.dashboard_board_widgets (board_id, widget_id, title, width_units, height_units, order_index)
select b.id, w.id, 'Overdue Amount', 3, 2, 2
from analytics.dashboard_boards b, analytics.dashboard_widgets w
where b.board_code = 'executive_main' and w.widget_code = 'finance_overdue_amount'
on conflict do nothing;

insert into analytics.dashboard_board_widgets (board_id, widget_id, title, width_units, height_units, order_index)
select b.id, w.id, 'Pending Approvals', 3, 2, 3
from analytics.dashboard_boards b, analytics.dashboard_widgets w
where b.board_code = 'executive_main' and w.widget_code = 'procurement_pending_approvals'
on conflict do nothing;

insert into analytics.dashboard_board_widgets (board_id, widget_id, title, width_units, height_units, order_index)
select b.id, w.id, 'Recommendation Queue', 6, 4, 4
from analytics.dashboard_boards b, analytics.dashboard_widgets w
where b.board_code = 'executive_main' and w.widget_code = 'recommendation_queue'
on conflict do nothing;
