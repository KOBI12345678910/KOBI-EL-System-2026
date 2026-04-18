-- ============================================================
-- FILE: supabase/migrations/00019_security_rls_core.sql
-- TECHNOKOL UZI ERP 2026
-- RLS + SECURITY LAYER
-- ============================================================

-- ============================================================
-- SECTION 1: ROLE / PERMISSION MODEL
-- ============================================================

create table if not exists governance.roles (
  id bigserial primary key,
  role_code text not null unique,
  role_name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.permissions (
  id bigserial primary key,
  permission_code text not null unique,
  permission_name text not null,
  module_name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.role_permissions (
  id bigserial primary key,
  role_id bigint not null references governance.roles(id) on delete cascade,
  permission_id bigint not null references governance.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(role_id, permission_id)
);

create table if not exists governance.user_roles (
  id bigserial primary key,
  user_id bigint not null references governance.users_profile(id) on delete cascade,
  role_id bigint not null references governance.roles(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by_user_id bigint references governance.users_profile(id),
  unique(user_id, role_id)
);

create index if not exists idx_user_roles_user_id_active
  on governance.user_roles(user_id, active);

create index if not exists idx_role_permissions_role_id
  on governance.role_permissions(role_id);

create trigger trg_governance_roles_updated_at
before update on governance.roles
for each row execute function governance.set_updated_at();

create trigger trg_governance_permissions_updated_at
before update on governance.permissions
for each row execute function governance.set_updated_at();

-- ============================================================
-- SECTION 2: DEFAULT ROLES
-- ============================================================

insert into governance.roles (role_code, role_name, description, is_system)
values
  ('admin', 'Administrator', 'Full system administrator', true),
  ('executive', 'Executive', 'Executive / CEO dashboard access', true),
  ('finance_manager', 'Finance Manager', 'Finance manager access', true),
  ('finance', 'Finance Analyst', 'Finance operations access', true),
  ('procurement_manager', 'Procurement Manager', 'Procurement manager access', true),
  ('procurement', 'Procurement Analyst', 'Procurement operations access', true),
  ('ops_manager', 'Operations Manager', 'Operations manager access', true),
  ('ops', 'Operations User', 'Operations execution access', true),
  ('hr_manager', 'HR Manager', 'HR manager access', true),
  ('hr', 'HR User', 'Workforce operations access', true),
  ('payroll_manager', 'Payroll Manager', 'Payroll manager access', true),
  ('payroll', 'Payroll User', 'Payroll operations access', true),
  ('sales_manager', 'Sales Manager', 'Commercial sales manager', true),
  ('sales', 'Sales User', 'Commercial sales access', true)
on conflict (role_code) do nothing;

-- ============================================================
-- SECTION 3: DEFAULT PERMISSIONS
-- ============================================================

insert into governance.permissions (permission_code, permission_name, module_name, description)
values
  ('customers.read', 'Read customers', 'customers', 'Read customer records'),
  ('customers.update', 'Update customers', 'customers', 'Update customer records'),
  ('quotes.read', 'Read quotes', 'quotes', 'Read quote records'),
  ('quotes.send', 'Send quotes', 'quotes', 'Send quotes'),
  ('quotes.reject', 'Reject quotes', 'quotes', 'Reject quotes'),
  ('quotes.convert_to_project', 'Convert quote to project', 'quotes', 'Convert approved quote to project'),
  ('projects.read', 'Read projects', 'projects', 'Read projects'),
  ('projects.create', 'Create projects', 'projects', 'Create projects'),
  ('projects.update', 'Update projects', 'projects', 'Update projects'),
  ('workorders.read', 'Read work orders', 'work_orders', 'Read work orders'),
  ('workorders.create', 'Create work orders', 'work_orders', 'Create work orders'),
  ('workorders.update', 'Update work orders', 'work_orders', 'Update work orders'),
  ('workorders.start', 'Start work orders', 'work_orders', 'Start work orders'),
  ('workorders.complete', 'Complete work orders', 'work_orders', 'Complete work orders'),
  ('rfq.read', 'Read RFQ', 'rfq', 'Read RFQ'),
  ('rfq.send', 'Send RFQ', 'rfq', 'Send RFQ'),
  ('rfq.approve', 'Approve RFQ', 'rfq', 'Approve RFQ'),
  ('rfq.convert_to_po', 'Convert RFQ to PO', 'rfq', 'Convert RFQ to PO'),
  ('po.read', 'Read PO', 'po', 'Read PO'),
  ('po.request_approval', 'Request PO approval', 'po', 'Request PO approval'),
  ('po.approve', 'Approve PO', 'po', 'Approve PO'),
  ('po.send', 'Send PO', 'po', 'Send PO'),
  ('suppliers.read', 'Read suppliers', 'suppliers', 'Read suppliers'),
  ('suppliers.update', 'Update suppliers', 'suppliers', 'Update suppliers'),
  ('finance.read', 'Read finance', 'finance', 'Read finance area'),
  ('invoices.issue', 'Issue invoices', 'finance', 'Issue invoices'),
  ('payments.create', 'Register payment', 'finance', 'Register customer payments'),
  ('attendance.read', 'Read attendance', 'attendance', 'Read attendance'),
  ('attendance.approve', 'Approve attendance', 'attendance', 'Approve attendance'),
  ('employees.read', 'Read employees', 'employees', 'Read employee records'),
  ('employees.update', 'Update employees', 'employees', 'Update employee records'),
  ('payroll.read', 'Read payroll', 'payroll', 'Read payroll data'),
  ('payroll.run', 'Run payroll', 'payroll', 'Run payroll'),
  ('control_room.executive', 'Executive control room', 'analytics', 'Access executive control room'),
  ('control_room.operations', 'Operations control room', 'analytics', 'Access operations control room'),
  ('control_room.procurement', 'Procurement control room', 'analytics', 'Access procurement control room'),
  ('control_room.workforce', 'Workforce control room', 'analytics', 'Access workforce control room')
on conflict (permission_code) do nothing;

-- ============================================================
-- SECTION 4: DEFAULT ROLE-PERMISSION MAPPINGS
-- ============================================================

-- Admin gets everything
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
cross join governance.permissions p
where r.role_code = 'admin'
on conflict do nothing;

-- Executive gets all reads + control rooms
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'customers.read','quotes.read','projects.read','workorders.read',
  'rfq.read','po.read','suppliers.read','finance.read','employees.read','payroll.read',
  'control_room.executive','control_room.operations','control_room.procurement','control_room.workforce'
)
where r.role_code = 'executive'
on conflict do nothing;

-- Finance
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'finance.read','invoices.issue','payments.create',
  'customers.read','quotes.read','projects.read','control_room.executive'
)
where r.role_code in ('finance_manager','finance')
on conflict do nothing;

-- Procurement
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'rfq.read','rfq.send','rfq.approve','rfq.convert_to_po',
  'po.read','po.request_approval','po.approve','po.send',
  'suppliers.read','suppliers.update','projects.read','control_room.procurement'
)
where r.role_code in ('procurement_manager','procurement')
on conflict do nothing;

-- Operations
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'projects.read','projects.update',
  'workorders.read','workorders.create','workorders.update','workorders.start','workorders.complete',
  'attendance.read','control_room.operations'
)
where r.role_code in ('ops_manager','ops')
on conflict do nothing;

-- HR / Payroll
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'employees.read','employees.update',
  'attendance.read','attendance.approve',
  'payroll.read','payroll.run','control_room.workforce'
)
where r.role_code in ('hr_manager','hr','payroll_manager','payroll')
on conflict do nothing;

-- Sales
insert into governance.role_permissions (role_id, permission_id)
select r.id, p.id
from governance.roles r
join governance.permissions p on p.permission_code in (
  'customers.read','customers.update',
  'quotes.read','quotes.send','quotes.reject','quotes.convert_to_project',
  'projects.read','projects.create'
)
where r.role_code in ('sales_manager','sales')
on conflict do nothing;

-- ============================================================
-- SECTION 5: SECURITY HELPER FUNCTIONS
-- ============================================================

create or replace function governance.current_user_profile_id()
returns bigint language sql stable security definer
set search_path = governance, public as $$
  select up.id from governance.users_profile up
  where up.auth_user_id = auth.uid() limit 1
$$;

create or replace function governance.current_user_is_admin()
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select exists (
    select 1 from governance.user_roles ur
    join governance.roles r on r.id = ur.role_id
    where ur.user_id = governance.current_user_profile_id()
      and ur.active = true and r.role_code = 'admin'
  )
$$;

create or replace function governance.current_user_has_permission(p_permission_code text)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_is_admin() or exists (
    select 1 from governance.user_roles ur
    join governance.role_permissions rp on rp.role_id = ur.role_id
    join governance.permissions p on p.id = rp.permission_id
    where ur.user_id = governance.current_user_profile_id()
      and ur.active = true and p.permission_code = p_permission_code
  )
$$;

create or replace function governance.current_user_has_any_permission(p_permission_codes text[])
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_is_admin() or exists (
    select 1 from governance.user_roles ur
    join governance.role_permissions rp on rp.role_id = ur.role_id
    join governance.permissions p on p.id = rp.permission_id
    where ur.user_id = governance.current_user_profile_id()
      and ur.active = true and p.permission_code = any(p_permission_codes)
  )
$$;

-- ============================================================
-- SECTION 6: DOMAIN READ HELPERS
-- ============================================================

create or replace function governance.can_read_customer(p_customer_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array[
    'customers.read','quotes.read','projects.read','finance.read'
  ])
$$;

create or replace function governance.can_read_project(p_project_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array[
    'projects.read','workorders.read','finance.read'
  ])
$$;

create or replace function governance.can_read_employee(p_employee_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array[
    'employees.read','attendance.read','payroll.read'
  ]) or governance.current_user_profile_id() = p_employee_id
$$;

create or replace function governance.can_read_supplier(p_supplier_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array[
    'suppliers.read','rfq.read','po.read'
  ])
$$;

create or replace function governance.can_read_work_order(p_work_order_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array['workorders.read','projects.read'])
$$;

create or replace function governance.can_read_quote(p_quote_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array['quotes.read','customers.read','projects.read'])
$$;

create or replace function governance.can_read_rfq(p_rfq_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array['rfq.read','po.read','suppliers.read'])
$$;

create or replace function governance.can_read_po(p_po_id bigint)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_permission(array['po.read','rfq.read','suppliers.read','finance.read'])
$$;

-- ============================================================
-- SECTION 7: MENU PERMISSION UPGRADE
-- ============================================================

update public.app_menu set required_permission = 'control_room.operations' where route = '/operations';
update public.app_menu set required_permission = 'control_room.procurement' where route = '/procurement';
update public.app_menu set required_permission = 'control_room.workforce' where route = '/workforce';
update public.app_menu set required_permission = 'customers.read' where route = '/customers';
update public.app_menu set required_permission = 'projects.read' where route = '/projects';
update public.app_menu set required_permission = 'workorders.read' where route = '/work-orders';
update public.app_menu set required_permission = 'rfq.read' where route = '/rfqs';
update public.app_menu set required_permission = 'po.read' where route = '/pos';
