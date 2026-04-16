-- =========================================================
-- Migration 004: RLS Helper Functions v2
-- TechnoKol Uzi ERP 2026
--
-- Upgrades the governance.* access-check functions to the
-- full entity-access model with object-level permissions,
-- portal user support, and cascading read checks.
-- =========================================================

-- SEARCH PATH SAFETY
create or replace function governance._safe_set_search_path()
returns void language plpgsql security definer as $$
begin
  perform set_config('search_path',
    'governance,commercial,procurement,execution,inventory,workforce,finance,docs,comms,intelligence,analytics,public',
    true);
end; $$;

-- CURRENT USER HELPERS
create or replace function governance.current_auth_user_id()
returns uuid language sql stable as $$
  select auth.uid();
$$;

create or replace function governance.current_user_profile_id()
returns bigint language sql stable security definer
set search_path = governance, public as $$
  select up.id from governance.users_profile up
  where up.auth_user_id = auth.uid() and up.deleted_at is null limit 1;
$$;

create or replace function governance.current_portal_user_id()
returns bigint language sql stable security definer
set search_path = comms, public as $$
  select pu.id from comms.portal_users pu
  where pu.auth_user_id = auth.uid() and pu.status = 'active' limit 1;
$$;

create or replace function governance.current_user_has_role(p_role_code text)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select exists (
    select 1 from governance.user_roles ur
    join governance.roles r on r.id = ur.role_id
    where ur.user_id = governance.current_user_profile_id()
      and r.role_code = p_role_code
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function governance.current_user_has_any_role(p_role_codes text[])
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select exists (
    select 1 from governance.user_roles ur
    join governance.roles r on r.id = ur.role_id
    where ur.user_id = governance.current_user_profile_id()
      and r.role_code = any(p_role_codes)
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function governance.current_user_has_permission(p_permission_code text)
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select exists (
    select 1 from governance.user_roles ur
    join governance.role_permissions rp on rp.role_id = ur.role_id
    join governance.permissions p on p.id = rp.permission_id
    where ur.user_id = governance.current_user_profile_id()
      and p.permission_code = p_permission_code
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function governance.current_user_is_admin()
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_role(array['admin','super_admin','platform_admin']);
$$;

create or replace function governance.current_user_is_executive()
returns boolean language sql stable security definer
set search_path = governance, public as $$
  select governance.current_user_has_any_role(array['executive','ceo','cfo','coo']);
$$;

-- OBJECT-LEVEL PERMISSIONS
create or replace function governance.current_user_has_object_permission(
  p_entity_type text, p_entity_id bigint, p_permission_code text
) returns boolean language sql stable security definer
set search_path = governance, public as $$
  select exists (
    select 1 from governance.object_permissions op
    where op.entity_type = p_entity_type and op.entity_id = p_entity_id
      and op.subject_type = 'user'
      and op.subject_id = governance.current_user_profile_id()
      and op.permission_code = p_permission_code
      and op.granted = true
      and (op.expires_at is null or op.expires_at > now())
  )
  or exists (
    select 1 from governance.object_permissions op
    join governance.user_roles ur on op.subject_type = 'role' and op.subject_id = ur.role_id
    where op.entity_type = p_entity_type and op.entity_id = p_entity_id
      and ur.user_id = governance.current_user_profile_id()
      and op.permission_code = p_permission_code
      and op.granted = true
      and (op.expires_at is null or op.expires_at > now())
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

-- ENTITY ACCESS CHECKS
create or replace function governance.can_read_customer(p_customer_id bigint)
returns boolean language sql stable security definer
set search_path = governance, commercial, execution, finance, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_is_executive()
    or governance.current_user_has_any_role(array[
       'finance','finance_manager','sales','sales_manager',
       'ops','ops_manager','procurement','procurement_manager'])
    or governance.current_user_has_object_permission('Customer', p_customer_id, 'customers.read');
$$;

create or replace function governance.can_write_customer(p_customer_id bigint)
returns boolean language sql stable security definer
set search_path = governance, commercial, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['sales_manager','finance_manager'])
    or governance.current_user_has_object_permission('Customer', p_customer_id, 'customers.update');
$$;

create or replace function governance.can_read_supplier(p_supplier_id bigint)
returns boolean language sql stable security definer
set search_path = governance, procurement, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_is_executive()
    or governance.current_user_has_any_role(array['procurement','procurement_manager','finance','finance_manager'])
    or governance.current_user_has_object_permission('Supplier', p_supplier_id, 'suppliers.read');
$$;

create or replace function governance.can_write_supplier(p_supplier_id bigint)
returns boolean language sql stable security definer
set search_path = governance, procurement, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['procurement_manager'])
    or governance.current_user_has_object_permission('Supplier', p_supplier_id, 'suppliers.update');
$$;

create or replace function governance.can_read_project(p_project_id bigint)
returns boolean language sql stable security definer
set search_path = governance, execution, workforce, finance, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_is_executive()
    or governance.current_user_has_any_role(array['ops','ops_manager','finance','finance_manager'])
    or exists (
      select 1 from workforce.workforce_assignments wa
      join workforce.employees e on e.id = wa.employee_id
      join governance.users_profile up on up.email = e.email
      where wa.project_id = p_project_id and wa.state = 'Active'
        and up.id = governance.current_user_profile_id()
    )
    or governance.current_user_has_object_permission('Project', p_project_id, 'projects.read');
$$;

create or replace function governance.can_write_project(p_project_id bigint)
returns boolean language sql stable security definer
set search_path = governance, execution, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['ops_manager'])
    or exists (
      select 1 from execution.projects p
      where p.id = p_project_id and p.owner_user_id = governance.current_user_profile_id()
    )
    or governance.current_user_has_object_permission('Project', p_project_id, 'projects.update');
$$;

create or replace function governance.can_read_work_order(p_work_order_id bigint)
returns boolean language sql stable security definer
set search_path = governance, execution, workforce, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_is_executive()
    or governance.current_user_has_any_role(array['ops','ops_manager','finance','finance_manager'])
    or exists (
      select 1 from workforce.workforce_assignments wa
      join workforce.employees e on e.id = wa.employee_id
      join governance.users_profile up on up.email = e.email
      where wa.work_order_id = p_work_order_id and wa.state = 'Active'
        and up.id = governance.current_user_profile_id()
    )
    or governance.current_user_has_object_permission('WorkOrder', p_work_order_id, 'workorders.read');
$$;

create or replace function governance.can_read_employee(p_employee_id bigint)
returns boolean language sql stable security definer
set search_path = governance, workforce, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['payroll','payroll_manager','hr','hr_manager'])
    or exists (
      select 1 from workforce.employees e
      join governance.users_profile up on up.email = e.email
      where e.id = p_employee_id and up.id = governance.current_user_profile_id()
    )
    or governance.current_user_has_object_permission('Employee', p_employee_id, 'employees.read');
$$;

create or replace function governance.can_write_employee(p_employee_id bigint)
returns boolean language sql stable security definer
set search_path = governance, workforce, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['payroll_manager','hr_manager'])
    or governance.current_user_has_object_permission('Employee', p_employee_id, 'employees.update');
$$;

create or replace function governance.can_read_invoice(p_invoice_id bigint)
returns boolean language sql stable security definer
set search_path = governance, finance, execution, commercial, comms, public as $$
  select governance.current_user_is_admin()
    or governance.current_user_is_executive()
    or governance.current_user_has_any_role(array['finance','finance_manager'])
    or exists (
      select 1 from finance.invoices i
      where i.id = p_invoice_id and i.project_id is not null
        and governance.can_read_project(i.project_id)
    )
    or exists (
      select 1 from finance.invoices i
      join comms.portal_users pu on pu.customer_id = i.customer_id
      where i.id = p_invoice_id
        and pu.id = governance.current_portal_user_id()
        and pu.portal_type = 'customer' and pu.status = 'active'
    )
    or governance.current_user_has_object_permission('Invoice', p_invoice_id, 'invoices.read');
$$;

create or replace function governance.can_read_document(p_document_id bigint)
returns boolean language plpgsql stable security definer
set search_path = governance, docs, public as $$
declare v_entity_type text; v_entity_id bigint;
begin
  if governance.current_user_is_admin() then return true; end if;
  select d.parent_entity_type, d.parent_entity_id into v_entity_type, v_entity_id
    from docs.documents d where d.id = p_document_id;
  if v_entity_type is not null and v_entity_id is not null then
    return governance.can_read_parent_entity(v_entity_type, v_entity_id);
  end if;
  select a.entity_type, a.entity_id into v_entity_type, v_entity_id
    from docs.attachments a where a.document_id = p_document_id limit 1;
  if v_entity_type is not null and v_entity_id is not null then
    return governance.can_read_parent_entity(v_entity_type, v_entity_id);
  end if;
  return false;
end; $$;

-- PARENT ENTITY DISPATCHERS
create or replace function governance.can_read_parent_entity(p_entity_type text, p_entity_id bigint)
returns boolean language plpgsql stable security definer
set search_path = governance, public as $$
begin
  case p_entity_type
    when 'Customer'   then return governance.can_read_customer(p_entity_id);
    when 'Supplier'   then return governance.can_read_supplier(p_entity_id);
    when 'Project'    then return governance.can_read_project(p_entity_id);
    when 'WorkOrder'  then return governance.can_read_work_order(p_entity_id);
    when 'Employee'   then return governance.can_read_employee(p_entity_id);
    when 'Invoice'    then return governance.can_read_invoice(p_entity_id);
    else return governance.current_user_is_admin();
  end case;
end; $$;

create or replace function governance.can_write_parent_entity(p_entity_type text, p_entity_id bigint)
returns boolean language plpgsql stable security definer
set search_path = governance, public as $$
begin
  case p_entity_type
    when 'Customer'  then return governance.can_write_customer(p_entity_id);
    when 'Supplier'  then return governance.can_write_supplier(p_entity_id);
    when 'Project'   then return governance.can_write_project(p_entity_id);
    when 'Employee'  then return governance.can_write_employee(p_entity_id);
    else return governance.current_user_is_admin();
  end case;
end; $$;
