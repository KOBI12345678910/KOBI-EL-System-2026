-- ============================================================
-- FILE: supabase/migrations/00013_seed_role_permission_mapping.sql
-- TECHNOKOL UZI ERP 2026
-- Role ↔ Permission mapping seed
-- ============================================================

-- Helper: insert mapping only if both role and permission exist
do $$
declare
  v_role_id bigint;
  v_perm_id bigint;
begin
  -- ==============================
  -- ADMIN — full access
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'admin';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    on conflict do nothing;
  end if;

  -- ==============================
  -- EXECUTIVE — read everything + approvals
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'executive';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.action in ('read', 'approve')
    on conflict do nothing;
  end if;

  -- ==============================
  -- SALES
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'sales';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'customers.read', 'customers.create', 'customers.update',
      'quotes.read', 'quotes.create', 'quotes.update', 'quotes.send',
      'projects.read',
      'invoices.read',
      'documents.read', 'documents.create',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- SALES MANAGER — sales + approve + convert
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'sales_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'customers.read', 'customers.create', 'customers.update',
      'quotes.read', 'quotes.create', 'quotes.update', 'quotes.send',
      'quotes.approve', 'quotes.reject', 'quotes.convert_to_project',
      'projects.read', 'projects.create',
      'invoices.read',
      'documents.read', 'documents.create', 'documents.update',
      'ai.read', 'ai.acknowledge'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- PROCUREMENT
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'procurement';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'suppliers.read', 'suppliers.create', 'suppliers.update',
      'rfq.read', 'rfq.create', 'rfq.send',
      'po.read', 'po.create', 'po.request_approval', 'po.send', 'po.receive',
      'documents.read', 'documents.create',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- PROCUREMENT MANAGER
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'procurement_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'suppliers.read', 'suppliers.create', 'suppliers.update', 'suppliers.block',
      'rfq.read', 'rfq.create', 'rfq.send', 'rfq.approve', 'rfq.reject', 'rfq.convert_to_po',
      'po.read', 'po.create', 'po.request_approval', 'po.approve', 'po.send', 'po.receive',
      'documents.read', 'documents.create', 'documents.update',
      'ai.read', 'ai.acknowledge'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- OPS
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'ops';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'projects.read', 'projects.update',
      'workorders.read', 'workorders.create', 'workorders.assign',
      'workorders.start', 'workorders.update', 'workorders.complete',
      'documents.read', 'documents.create',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- OPS MANAGER
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'ops_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'projects.read', 'projects.create', 'projects.update', 'projects.change_state',
      'projects.create_work_order', 'projects.request_materials', 'projects.create_invoice',
      'workorders.read', 'workorders.create', 'workorders.assign',
      'workorders.start', 'workorders.update', 'workorders.complete',
      'customers.read',
      'suppliers.read',
      'invoices.read',
      'documents.read', 'documents.create', 'documents.update',
      'ai.read', 'ai.acknowledge', 'ai.create_task'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- FINANCE
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'finance';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'invoices.read', 'invoices.create', 'invoices.issue',
      'payments.read', 'payments.create', 'payments.update', 'payments.reconcile',
      'customers.read',
      'projects.read',
      'documents.read', 'documents.create',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- FINANCE MANAGER
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'finance_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'invoices.read', 'invoices.create', 'invoices.issue',
      'payments.read', 'payments.create', 'payments.update', 'payments.reconcile',
      'customers.read', 'customers.update',
      'suppliers.read',
      'projects.read',
      'po.read',
      'documents.read', 'documents.create', 'documents.update',
      'ai.read', 'ai.acknowledge', 'ai.create_task'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- HR
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'hr';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'employees.read', 'employees.create', 'employees.update',
      'attendance.create', 'attendance.update',
      'documents.read', 'documents.create',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- HR MANAGER
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'hr_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'employees.read', 'employees.create', 'employees.update',
      'attendance.create', 'attendance.update', 'attendance.approve',
      'documents.read', 'documents.create', 'documents.update',
      'ai.read', 'ai.acknowledge'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- PAYROLL
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'payroll';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'employees.read',
      'attendance.create', 'attendance.update',
      'payroll.create',
      'documents.read',
      'ai.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- PAYROLL MANAGER
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'payroll_manager';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'employees.read', 'employees.update',
      'attendance.create', 'attendance.update', 'attendance.approve',
      'payroll.create', 'payroll.approve', 'payroll.export',
      'documents.read', 'documents.create',
      'ai.read', 'ai.acknowledge'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- AI ANALYST
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'ai_analyst';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    where p.permission_code in (
      'ai.read', 'ai.acknowledge', 'ai.create_task', 'ai.convert_anomaly_to_alert',
      'customers.read', 'suppliers.read', 'projects.read',
      'invoices.read', 'payments.read', 'employees.read',
      'documents.read'
    )
    on conflict do nothing;
  end if;

  -- ==============================
  -- PLATFORM ADMIN — same as admin
  -- ==============================
  select id into v_role_id from governance.roles where role_code = 'platform_admin';
  if v_role_id is not null then
    insert into governance.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from governance.permissions p
    on conflict do nothing;
  end if;

end;
$$;
