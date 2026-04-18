-- ============================================================
-- FILE: supabase/migrations/00017_app_menu.sql
-- Dynamic sidebar menu backed by Supabase
-- ============================================================

create table if not exists public.app_menu (
  id          bigserial    primary key,
  label       text         not null,
  route       text,
  icon        text,
  parent_id   bigint       references public.app_menu(id) on delete cascade,
  order_index integer      default 0,
  required_permission text,
  is_visible  boolean      default true,
  created_at  timestamptz  default now()
);

comment on table public.app_menu is 'Dynamic sidebar menu tree — fetched by the frontend at boot';
comment on column public.app_menu.required_permission is 'Permission slug required to see this item (null = visible to all authenticated users)';

-- Index for tree-walk queries
create index if not exists idx_app_menu_parent on public.app_menu(parent_id);
create index if not exists idx_app_menu_order  on public.app_menu(order_index);

-- ── RLS: authenticated users can read, only admins can write ──
alter table public.app_menu enable row level security;

create policy "app_menu_read"  on public.app_menu for select using (true);
create policy "app_menu_admin" on public.app_menu for all    using (
  auth.jwt() ->> 'role' = 'admin'
);

-- ── Seed data: top-level control rooms + children ──

-- Top-level control rooms
insert into public.app_menu (id, label, route, icon, order_index) values
  (1, 'תפעול',  '/operations',  '⚙️', 1),
  (2, 'רכש',    '/procurement', '📦', 2),
  (3, 'כח אדם', '/workforce',   '👥', 3);

-- Operations children
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('לקוחות',        '/customers',   '🏢', 1, 1),
  ('פרויקטים',      '/projects',    '📋', 1, 2),
  ('הזמנות עבודה',  '/work-orders', '🔧', 1, 3);

-- Procurement children
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ספקים',               '/suppliers',  '🏭', 2, 1),
  ('בקשות הצעת מחיר',     '/rfqs',       '📝', 2, 2),
  ('הזמנות רכש',          '/pos',        '🛒', 2, 3);

-- Workforce children
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('עובדים',    '/employees',  '👤', 3, 1),
  ('שכר',       '/payroll',    '💰', 3, 2),
  ('נוכחות',    '/attendance', '🕐', 3, 3);

-- Reset sequence to avoid conflicts with future inserts
select setval('app_menu_id_seq', (select max(id) from public.app_menu));
