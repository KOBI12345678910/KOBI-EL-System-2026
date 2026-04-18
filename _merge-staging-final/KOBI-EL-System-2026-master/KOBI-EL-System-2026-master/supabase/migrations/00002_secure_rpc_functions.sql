-- =========================================================
-- SECURE RPC FUNCTION MANIFEST
-- All cross-schema reads go through security definer RPCs
-- No raw joins exposed to frontend
-- =========================================================

-- =========================================================
-- SECTION 1: PERMISSION CHECK RPCs
-- =========================================================

create or replace function governance.get_my_permissions()
returns table(permission_code text, domain text, action text, entity_type text)
language sql security definer stable
as $$
  select distinct p.permission_code, p.domain, p.action, p.entity_type
  from governance.user_roles ur
  join governance.role_permissions rp on rp.role_id = ur.role_id
  join governance.permissions p on p.id = rp.permission_id
  where ur.user_id = governance.current_user_profile_id()
    and (ur.expires_at is null or ur.expires_at > now());
$$;

create or replace function governance.get_my_roles()
returns table(role_code text, role_name text)
language sql security definer stable
as $$
  select r.role_code, r.role_name
  from governance.user_roles ur
  join governance.roles r on r.id = ur.role_id
  where ur.user_id = governance.current_user_profile_id()
    and (ur.expires_at is null or ur.expires_at > now());
$$;

create or replace function governance.get_my_profile()
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'profile', row_to_json(up),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('code', r.role_code, 'name', r.role_name))
      from governance.user_roles ur
      join governance.roles r on r.id = ur.role_id
      where ur.user_id = up.id
        and (ur.expires_at is null or ur.expires_at > now())
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.permission_code)
      from governance.user_roles ur
      join governance.role_permissions rp on rp.role_id = ur.role_id
      join governance.permissions p on p.id = rp.permission_id
      where ur.user_id = up.id
        and (ur.expires_at is null or ur.expires_at > now())
    ), '[]'::jsonb)
  ) into v_result
  from governance.users_profile up
  where up.auth_user_id = auth.uid();

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 2: AUDIT + STATE + EVENT WRITE RPCs
-- =========================================================

create or replace function governance.rpc_write_audit(
  p_entity_type text,
  p_entity_id bigint,
  p_action_name text,
  p_source_service text,
  p_source_module text,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_source_page text default null,
  p_correlation_id text default null
) returns bigint
language plpgsql security definer
as $$
declare
  v_id bigint;
begin
  insert into governance.audit_logs
    (entity_type, entity_id, action_name, old_values, new_values,
     performed_by_user_id, source_service, source_module, source_page, correlation_id)
  values
    (p_entity_type, p_entity_id, p_action_name, p_old_values, p_new_values,
     governance.current_user_profile_id(), p_source_service, p_source_module, p_source_page, p_correlation_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function governance.rpc_write_state_change(
  p_entity_type text,
  p_entity_id bigint,
  p_from_state text,
  p_to_state text,
  p_reason text default null,
  p_correlation_id text default null
) returns bigint
language plpgsql security definer
as $$
declare
  v_id bigint;
begin
  insert into governance.state_history
    (entity_type, entity_id, from_state, to_state, changed_by_user_id, reason, correlation_id)
  values
    (p_entity_type, p_entity_id, p_from_state, p_to_state,
     governance.current_user_profile_id(), p_reason, p_correlation_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function governance.rpc_emit_domain_event(
  p_event_name text,
  p_topic_name text,
  p_source_service text,
  p_source_module text,
  p_entity_type text,
  p_entity_id bigint,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null
) returns bigint
language plpgsql security definer
as $$
declare
  v_id bigint;
begin
  insert into governance.domain_events
    (event_name, topic_name, source_service, source_module,
     entity_type, entity_id, payload, correlation_id,
     actor_type, actor_id)
  values
    (p_event_name, p_topic_name, p_source_service, p_source_module,
     p_entity_type, p_entity_id, p_payload, p_correlation_id,
     'user', governance.current_user_profile_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- =========================================================
-- SECTION 3: CUSTOMER 360 RPC
-- =========================================================

create or replace function commercial.rpc_get_customer_360(p_customer_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_sales() or governance.current_user_is_finance()
       or governance.current_user_is_ops() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: customer_360';
  end if;

  select jsonb_build_object(
    'customer', row_to_json(c),
    'quotes', coalesce((
      select jsonb_agg(row_to_json(q) order by q.created_at desc)
      from commercial.quotes q where q.customer_id = p_customer_id
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(row_to_json(p) order by p.created_at desc)
      from execution.projects p where p.customer_id = p_customer_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(row_to_json(i) order by i.created_at desc)
      from finance.invoices i where i.customer_id = p_customer_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(row_to_json(pay) order by pay.created_at desc)
      from finance.payments pay where pay.customer_id = p_customer_id
    ), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(row_to_json(ct) order by ct.effective_date desc)
      from procurement.contracts ct where ct.customer_id = p_customer_id
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(row_to_json(a) order by a.activity_at desc)
      from commercial.crm_activities a
      where a.related_entity_type = 'customer' and a.related_entity_id = p_customer_id
    ), '[]'::jsonb),
    'collection_cases', coalesce((
      select jsonb_agg(row_to_json(cc) order by cc.created_at desc)
      from finance.collection_cases cc where cc.customer_id = p_customer_id
    ), '[]'::jsonb),
    'support_tickets', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc)
      from comms.support_tickets t where t.customer_id = p_customer_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'customer' and d.parent_entity_id = p_customer_id
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_quoted', coalesce((select sum(grand_total) from commercial.quotes where customer_id = p_customer_id and state not in ('Rejected','Expired')), 0),
      'total_invoiced', coalesce((select sum(grand_total) from finance.invoices where customer_id = p_customer_id and state != 'Cancelled'), 0),
      'total_paid', coalesce((select sum(amount) from finance.payments where customer_id = p_customer_id and state = 'Posted'), 0),
      'balance_due', coalesce((select sum(balance_due) from finance.invoices where customer_id = p_customer_id and state not in ('Paid','Cancelled')), 0),
      'active_projects', (select count(*) from execution.projects where customer_id = p_customer_id and state in ('Planning','In Progress','Approved')),
      'open_quotes', (select count(*) from commercial.quotes where customer_id = p_customer_id and state in ('Draft','Sent','Under Review'))
    ),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from (select * from governance.state_history where entity_type = 'customer' and entity_id = p_customer_id order by changed_at desc limit 50) sh
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'customer' and entity_id = p_customer_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from commercial.customers c where c.id = p_customer_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 4: SUPPLIER 360 RPC
-- =========================================================

create or replace function procurement.rpc_get_supplier_360(p_supplier_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_procurement() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: supplier_360';
  end if;

  select jsonb_build_object(
    'supplier', row_to_json(s),
    'purchase_orders', coalesce((
      select jsonb_agg(row_to_json(po) order by po.created_at desc)
      from procurement.purchase_orders po where po.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'rfq_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invite', row_to_json(inv),
        'rfq', (select row_to_json(r) from procurement.rfqs r where r.id = inv.rfq_id)
      ))
      from procurement.rfq_supplier_invites inv where inv.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'supplier_invoices', coalesce((
      select jsonb_agg(row_to_json(si) order by si.created_at desc)
      from procurement.supplier_invoices si where si.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(row_to_json(ct) order by ct.effective_date desc)
      from procurement.contracts ct where ct.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(row_to_json(r) order by r.created_at desc)
      from procurement.returns r where r.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'warranty_cases', coalesce((
      select jsonb_agg(row_to_json(w) order by w.created_at desc)
      from procurement.warranty_cases w where w.supplier_id = p_supplier_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'supplier' and d.parent_entity_id = p_supplier_id
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_po_value', coalesce((select sum(grand_total) from procurement.purchase_orders where supplier_id = p_supplier_id and state != 'Cancelled'), 0),
      'total_invoiced', coalesce((select sum(grand_total) from procurement.supplier_invoices where supplier_id = p_supplier_id), 0),
      'open_po_count', (select count(*) from procurement.purchase_orders where supplier_id = p_supplier_id and state not in ('Received','Closed','Cancelled')),
      'active_contracts', (select count(*) from procurement.contracts where supplier_id = p_supplier_id and state = 'active'),
      'open_returns', (select count(*) from procurement.returns where supplier_id = p_supplier_id and state = 'Open')
    ),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from (select * from governance.state_history where entity_type = 'supplier' and entity_id = p_supplier_id order by changed_at desc limit 50) sh
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'supplier' and entity_id = p_supplier_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from procurement.suppliers s where s.id = p_supplier_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 5: QUOTE 360 RPC
-- =========================================================

create or replace function commercial.rpc_get_quote_360(p_quote_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_sales() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: quote_360';
  end if;

  select jsonb_build_object(
    'quote', row_to_json(q),
    'customer', (select row_to_json(c) from commercial.customers c where c.id = q.customer_id),
    'lines', coalesce((
      select jsonb_agg(row_to_json(ql) order by ql.line_number)
      from commercial.quote_lines ql where ql.quote_id = p_quote_id
    ), '[]'::jsonb),
    'opportunity', (select row_to_json(o) from commercial.opportunities o where o.id = q.opportunity_id),
    'pricing_snapshot', (select row_to_json(ps) from commercial.pricing_snapshots ps where ps.id = q.pricing_snapshot_id),
    'converted_project', (
      select row_to_json(p) from execution.projects p where p.quote_id = p_quote_id limit 1
    ),
    'approvals', coalesce((
      select jsonb_agg(row_to_json(a) order by a.requested_at desc)
      from procurement.approvals a where a.entity_type = 'quote' and a.entity_id = p_quote_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'quote' and d.parent_entity_id = p_quote_id
    ), '[]'::jsonb),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from governance.state_history sh
      where sh.entity_type = 'quote' and sh.entity_id = p_quote_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'quote' and entity_id = p_quote_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from commercial.quotes q where q.id = p_quote_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 6: RFQ 360 RPC
-- =========================================================

create or replace function procurement.rpc_get_rfq_360(p_rfq_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_procurement() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: rfq_360';
  end if;

  select jsonb_build_object(
    'rfq', row_to_json(r),
    'items', coalesce((
      select jsonb_agg(row_to_json(ri) order by ri.line_number)
      from procurement.rfq_items ri where ri.rfq_id = p_rfq_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invite', row_to_json(inv),
        'supplier', (select row_to_json(s) from procurement.suppliers s where s.id = inv.supplier_id)
      ))
      from procurement.rfq_supplier_invites inv where inv.rfq_id = p_rfq_id
    ), '[]'::jsonb),
    'supplier_quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quote', row_to_json(sq),
        'supplier', (select row_to_json(s) from procurement.suppliers s where s.id = sq.supplier_id),
        'lines', coalesce((
          select jsonb_agg(row_to_json(sql2) order by sql2.line_number)
          from procurement.supplier_quote_lines sql2 where sql2.supplier_quote_id = sq.id
        ), '[]'::jsonb)
      ))
      from procurement.supplier_quotes sq where sq.rfq_id = p_rfq_id
    ), '[]'::jsonb),
    'resulting_po', (
      select row_to_json(po) from procurement.purchase_orders po where po.rfq_id = p_rfq_id limit 1
    ),
    'approvals', coalesce((
      select jsonb_agg(row_to_json(a) order by a.requested_at desc)
      from procurement.approvals a where a.entity_type = 'rfq' and a.entity_id = p_rfq_id
    ), '[]'::jsonb),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from governance.state_history sh
      where sh.entity_type = 'rfq' and sh.entity_id = p_rfq_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'rfq' and entity_id = p_rfq_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from procurement.rfqs r where r.id = p_rfq_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 7: PO 360 RPC
-- =========================================================

create or replace function procurement.rpc_get_po_360(p_po_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_procurement() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: po_360';
  end if;

  select jsonb_build_object(
    'purchase_order', row_to_json(po),
    'supplier', (select row_to_json(s) from procurement.suppliers s where s.id = po.supplier_id),
    'lines', coalesce((
      select jsonb_agg(row_to_json(pol) order by pol.line_number)
      from procurement.purchase_order_lines pol where pol.po_id = p_po_id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(row_to_json(ir) order by ir.created_at desc)
      from inventory.inventory_receipts ir where ir.po_id = p_po_id
    ), '[]'::jsonb),
    'supplier_invoices', coalesce((
      select jsonb_agg(row_to_json(si) order by si.created_at desc)
      from procurement.supplier_invoices si where si.po_id = p_po_id
    ), '[]'::jsonb),
    'project', (select row_to_json(pr) from execution.projects pr where pr.id = po.project_id),
    'contract', (select row_to_json(ct) from procurement.contracts ct where ct.id = po.contract_id),
    'approvals', coalesce((
      select jsonb_agg(row_to_json(a) order by a.requested_at desc)
      from procurement.approvals a where a.entity_type = 'po' and a.entity_id = p_po_id
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'po_total', po.grand_total,
      'received_value', coalesce((
        select sum(pol.quantity_received * pol.unit_price)
        from procurement.purchase_order_lines pol where pol.po_id = p_po_id
      ), 0),
      'invoiced', coalesce((select sum(grand_total) from procurement.supplier_invoices where po_id = p_po_id), 0)
    ),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from governance.state_history sh
      where sh.entity_type = 'purchase_order' and sh.entity_id = p_po_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'purchase_order' and entity_id = p_po_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from procurement.purchase_orders po where po.id = p_po_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 8: PROJECT 360 RPC
-- =========================================================

create or replace function execution.rpc_get_project_360(p_project_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_ops() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: project_360';
  end if;

  select jsonb_build_object(
    'project', row_to_json(p),
    'customer', (select row_to_json(c) from commercial.customers c where c.id = p.customer_id),
    'quote', (select row_to_json(q) from commercial.quotes q where q.id = p.quote_id),
    'phases', coalesce((
      select jsonb_agg(row_to_json(ph) order by ph.phase_order)
      from execution.project_phases ph where ph.project_id = p_project_id
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(row_to_json(m) order by m.due_date)
      from execution.project_milestones m where m.project_id = p_project_id
    ), '[]'::jsonb),
    'work_orders', coalesce((
      select jsonb_agg(row_to_json(wo) order by wo.created_at desc)
      from execution.work_orders wo where wo.project_id = p_project_id
    ), '[]'::jsonb),
    'purchase_orders', coalesce((
      select jsonb_agg(row_to_json(po) order by po.created_at desc)
      from procurement.purchase_orders po where po.project_id = p_project_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(row_to_json(i) order by i.created_at desc)
      from finance.invoices i where i.project_id = p_project_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc)
      from execution.tasks t where t.linked_entity_type = 'project' and t.linked_entity_id = p_project_id
    ), '[]'::jsonb),
    'material_requests', coalesce((
      select jsonb_agg(row_to_json(mr) order by mr.created_at desc)
      from inventory.material_requests mr where mr.project_id = p_project_id
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment', row_to_json(wa),
        'employee', (select row_to_json(e) from workforce.employees e where e.id = wa.employee_id)
      ))
      from workforce.workforce_assignments wa where wa.project_id = p_project_id and wa.state = 'Active'
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(row_to_json(a) order by a.created_at desc)
      from execution.alerts a where a.parent_entity_type = 'project' and a.parent_entity_id = p_project_id
    ), '[]'::jsonb),
    'budget', coalesce((
      select jsonb_agg(row_to_json(b))
      from finance.budget_entries b where b.project_id = p_project_id
    ), '[]'::jsonb),
    'costing', coalesce((
      select jsonb_agg(row_to_json(ce) order by ce.cost_date desc)
      from finance.costing_entries ce where ce.project_id = p_project_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'project' and d.parent_entity_id = p_project_id
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'budget', p.budget_amount,
      'actual_cost', p.actual_cost,
      'billed', p.billed_amount,
      'collected', p.collected_amount,
      'variance', p.budget_amount - p.actual_cost,
      'wo_count', (select count(*) from execution.work_orders where project_id = p_project_id),
      'wo_completed', (select count(*) from execution.work_orders where project_id = p_project_id and state in ('Completed','Verified')),
      'open_tasks', (select count(*) from execution.tasks where linked_entity_type = 'project' and linked_entity_id = p_project_id and state in ('Open','In Progress'))
    ),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from (select * from governance.state_history where entity_type = 'project' and entity_id = p_project_id order by changed_at desc limit 50) sh
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(al) order by al.performed_at desc)
      from (select * from governance.audit_logs where entity_type = 'project' and entity_id = p_project_id order by performed_at desc limit 50) al
    ), '[]'::jsonb)
  ) into v_result
  from execution.projects p where p.id = p_project_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 9: WORK ORDER 360 RPC
-- =========================================================

create or replace function execution.rpc_get_work_order_360(p_wo_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
begin
  if not (governance.current_user_is_ops() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: work_order_360';
  end if;

  select jsonb_build_object(
    'work_order', row_to_json(wo),
    'project', (select row_to_json(p) from execution.projects p where p.id = wo.project_id),
    'tasks', coalesce((
      select jsonb_agg(row_to_json(t) order by t.sequence_order)
      from execution.work_order_tasks t where t.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment', row_to_json(wa),
        'employee', (select row_to_json(e) from workforce.employees e where e.id = wa.employee_id)
      ))
      from workforce.workforce_assignments wa where wa.work_order_id = p_wo_id and wa.state = 'Active'
    ), '[]'::jsonb),
    'material_requests', coalesce((
      select jsonb_agg(row_to_json(mr) order by mr.created_at desc)
      from inventory.material_requests mr where mr.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'inventory_issues', coalesce((
      select jsonb_agg(row_to_json(ii) order by ii.created_at desc)
      from inventory.inventory_issues ii where ii.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'delivery_events', coalesce((
      select jsonb_agg(row_to_json(de) order by de.delivered_at desc)
      from execution.delivery_events de where de.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'installation_events', coalesce((
      select jsonb_agg(row_to_json(ie) order by ie.installed_at desc)
      from execution.installation_events ie where ie.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(row_to_json(sig) order by sig.signed_at desc)
      from execution.signatures sig where sig.entity_type = 'work_order' and sig.entity_id = p_wo_id
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(row_to_json(a) order by a.created_at desc)
      from execution.alerts a where a.parent_entity_type = 'work_order' and a.parent_entity_id = p_wo_id
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(row_to_json(att) order by att.work_date desc)
      from workforce.attendance att where att.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'costing', coalesce((
      select jsonb_agg(row_to_json(ce) order by ce.cost_date desc)
      from finance.costing_entries ce where ce.work_order_id = p_wo_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'work_order' and d.parent_entity_id = p_wo_id
    ), '[]'::jsonb),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.changed_at desc)
      from governance.state_history sh
      where sh.entity_type = 'work_order' and sh.entity_id = p_wo_id
    ), '[]'::jsonb)
  ) into v_result
  from execution.work_orders wo where wo.id = p_wo_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 10: FINANCE 360 RPC
-- =========================================================

create or replace function finance.rpc_get_finance_360()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_finance() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: finance_360';
  end if;

  return jsonb_build_object(
    'receivables', jsonb_build_object(
      'total', coalesce((select sum(balance_due) from finance.invoices where state not in ('Paid','Cancelled')), 0),
      'overdue', coalesce((select sum(balance_due) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')), 0),
      'count', (select count(*) from finance.invoices where state not in ('Paid','Cancelled'))
    ),
    'payables', jsonb_build_object(
      'total', coalesce((select sum(grand_total) from procurement.supplier_invoices where state not in ('paid','cancelled')), 0),
      'count', (select count(*) from procurement.supplier_invoices where state not in ('paid','cancelled'))
    ),
    'collections', jsonb_build_object(
      'open_cases', (select count(*) from finance.collection_cases where state not in ('Closed')),
      'total_at_risk', coalesce((select sum(i.balance_due) from finance.collection_cases cc join finance.invoices i on i.id = cc.invoice_id where cc.state not in ('Closed')), 0)
    ),
    'bank', jsonb_build_object(
      'unmatched', (select count(*) from finance.bank_matches where state != 'Matched')
    ),
    'vat', jsonb_build_object(
      'unfiled_count', (select count(*) from finance.vat_records where filed = false)
    ),
    'cashflow', jsonb_build_object(
      'net_30d', coalesce((
        select sum(case when entry_type in ('revenue','collection') then amount else -amount end)
        from finance.cashflow_entries
        where entry_date between current_date and current_date + 30
      ), 0)
    ),
    'recent_invoices', coalesce((
      select jsonb_agg(row_to_json(i) order by i.created_at desc)
      from (select * from finance.invoices order by created_at desc limit 20) i
    ), '[]'::jsonb),
    'recent_payments', coalesce((
      select jsonb_agg(row_to_json(p) order by p.created_at desc)
      from (select * from finance.payments order by created_at desc limit 20) p
    ), '[]'::jsonb)
  );
end;
$$;

-- =========================================================
-- SECTION 11: EMPLOYEE 360 RPC
-- =========================================================

create or replace function workforce.rpc_get_employee_360(p_employee_id bigint)
returns jsonb
language plpgsql security definer stable
as $$
declare
  v_result jsonb;
  v_is_self boolean;
begin
  select exists(
    select 1 from workforce.employees e
    join governance.users_profile up on up.email = e.email
    where e.id = p_employee_id and up.auth_user_id = auth.uid()
  ) into v_is_self;

  if not (v_is_self or governance.current_user_is_payroll_hr() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: employee_360';
  end if;

  select jsonb_build_object(
    'employee', row_to_json(e),
    'employer', (select row_to_json(emp) from workforce.employers emp where emp.id = e.employer_id),
    'hr_profile', (select row_to_json(hr) from workforce.hr_profiles hr where hr.employee_id = p_employee_id),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment', row_to_json(wa),
        'project', (select row_to_json(p) from execution.projects p where p.id = wa.project_id)
      ))
      from workforce.workforce_assignments wa where wa.employee_id = p_employee_id and wa.state = 'Active'
    ), '[]'::jsonb),
    'recent_attendance', coalesce((
      select jsonb_agg(row_to_json(att) order by att.work_date desc)
      from (select * from workforce.attendance where employee_id = p_employee_id order by work_date desc limit 30) att
    ), '[]'::jsonb),
    'recent_payroll', coalesce((
      select jsonb_agg(row_to_json(pe) order by pe.created_at desc)
      from (select * from workforce.payroll_entries where employee_id = p_employee_id order by created_at desc limit 12) pe
    ), '[]'::jsonb),
    'wage_slips', coalesce((
      select jsonb_agg(row_to_json(ws) order by ws.slip_date desc)
      from (select * from workforce.wage_slips where employee_id = p_employee_id order by slip_date desc limit 12) ws
    ), '[]'::jsonb),
    'pension', coalesce((
      select jsonb_agg(row_to_json(pr) order by pr.contribution_date desc)
      from (select * from workforce.pension_records where employee_id = p_employee_id order by contribution_date desc limit 12) pr
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(row_to_json(ex) order by ex.expense_date desc)
      from workforce.employee_expenses ex where ex.employee_id = p_employee_id
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(row_to_json(sh) order by sh.shift_start desc)
      from (select * from workforce.shifts where employee_id = p_employee_id order by shift_start desc limit 30) sh
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(row_to_json(d) order by d.created_at desc)
      from docs.documents d
      where d.parent_entity_type = 'employee' and d.parent_entity_id = p_employee_id
    ), '[]'::jsonb),
    'state_history', coalesce((
      select jsonb_agg(row_to_json(st) order by st.changed_at desc)
      from governance.state_history st
      where st.entity_type = 'employee' and st.entity_id = p_employee_id
    ), '[]'::jsonb)
  ) into v_result
  from workforce.employees e where e.id = p_employee_id;

  return v_result;
end;
$$;

-- =========================================================
-- SECTION 12: CONTROL ROOM RPCs
-- =========================================================

create or replace function analytics.rpc_executive_control_tower()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not governance.current_user_is_executive() then
    raise exception 'ACCESS_DENIED: executive_control_tower';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_executive_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'total_revenue_mtd', coalesce((select sum(grand_total) from finance.invoices where state = 'Paid' and date_trunc('month', issue_date) = date_trunc('month', current_date)), 0),
      'open_projects', (select count(*) from execution.projects where state in ('Planning','In Progress','Approved')),
      'active_quotes', (select count(*) from commercial.quotes where state in ('Draft','Sent','Under Review')),
      'open_pos', (select count(*) from procurement.purchase_orders where state not in ('Received','Closed','Cancelled')),
      'overdue_invoices', (select count(*) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')),
      'overdue_amount', coalesce((select sum(balance_due) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')), 0),
      'active_employees', (select count(*) from workforce.employees where status = 'Active'),
      'open_alerts', (select count(*) from execution.alerts where state in ('Open')),
      'pending_ai_insights', (select count(*) from intelligence.ai_insights where state = 'New')
    )
  );
end;
$$;

create or replace function analytics.rpc_operations_control_room()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_ops() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: operations_control_room';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_operations_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'active_projects', (select count(*) from execution.projects where state = 'In Progress'),
      'open_work_orders', (select count(*) from execution.work_orders where state not in ('Completed','Verified','Cancelled')),
      'overdue_work_orders', (select count(*) from execution.work_orders where required_end_date < current_date and state not in ('Completed','Verified','Cancelled')),
      'open_tasks', (select count(*) from execution.tasks where state in ('Open','In Progress')),
      'overdue_tasks', (select count(*) from execution.tasks where due_date < current_date and state in ('Open','In Progress')),
      'open_alerts', (select count(*) from execution.alerts where state = 'Open'),
      'material_shortages', (select count(*) from inventory.inventory where available_qty <= 0)
    )
  );
end;
$$;

create or replace function analytics.rpc_procurement_control_room()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_procurement() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: procurement_control_room';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_procurement_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'open_rfqs', (select count(*) from procurement.rfqs where state not in ('Awarded','Cancelled')),
      'pending_po_approvals', (select count(*) from procurement.purchase_orders where approval_status = 'pending'),
      'overdue_pos', (select count(*) from procurement.purchase_orders where expected_delivery_date < current_date and state not in ('Received','Closed','Cancelled')),
      'total_open_po_value', coalesce((select sum(grand_total) from procurement.purchase_orders where state not in ('Received','Closed','Cancelled')), 0),
      'pending_supplier_invoices', (select count(*) from procurement.supplier_invoices where state in ('draft','submitted')),
      'active_contracts', (select count(*) from procurement.contracts where state = 'active'),
      'low_stock_items', (select count(*) from inventory.inventory where available_qty <= 0)
    )
  );
end;
$$;

create or replace function analytics.rpc_finance_control_room()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_finance() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: finance_control_room';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_finance_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'ar_total', coalesce((select sum(balance_due) from finance.invoices where state not in ('Paid','Cancelled')), 0),
      'ap_total', coalesce((select sum(grand_total) from procurement.supplier_invoices where state not in ('paid','cancelled')), 0),
      'overdue_ar', coalesce((select sum(balance_due) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')), 0),
      'unmatched_bank', (select count(*) from finance.bank_matches where state != 'Matched'),
      'open_collections', (select count(*) from finance.collection_cases where state not in ('Closed')),
      'unfiled_vat', (select count(*) from finance.vat_records where filed = false),
      'revenue_mtd', coalesce((select sum(grand_total) from finance.invoices where date_trunc('month', issue_date) = date_trunc('month', current_date) and state != 'Cancelled'), 0)
    )
  );
end;
$$;

create or replace function analytics.rpc_workforce_control_room()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_payroll_hr() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: workforce_control_room';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_workforce_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'active_employees', (select count(*) from workforce.employees where status = 'Active'),
      'pending_attendance', (select count(*) from workforce.attendance where approval_status = 'pending'),
      'pending_payroll_runs', (select count(*) from workforce.payroll_runs where state in ('Draft','Calculated')),
      'pending_expenses', (select count(*) from workforce.employee_expenses where approval_status = 'pending'),
      'pending_expenses_amount', coalesce((select sum(amount) from workforce.employee_expenses where approval_status = 'pending'), 0)
    )
  );
end;
$$;

create or replace function analytics.rpc_ai_control_room()
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_admin() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: ai_control_room';
  end if;

  return jsonb_build_object(
    'snapshot', (select row_to_json(r) from analytics.rm_ai_summary r order by snapshot_date desc limit 1),
    'live', jsonb_build_object(
      'new_insights', (select count(*) from intelligence.ai_insights where state = 'New'),
      'open_anomalies', (select count(*) from intelligence.anomaly_cases where state in ('Open','Investigating')),
      'critical_anomalies', (select count(*) from intelligence.anomaly_cases where state in ('Open') and severity = 'critical'),
      'pending_recommendations', (select count(*) from intelligence.decision_recommendations where state = 'New'),
      'active_forecast_models', (select count(*) from intelligence.forecast_models where state = 'Generated')
    )
  );
end;
$$;

-- =========================================================
-- SECTION 13: READ MODEL REFRESH RPC
-- =========================================================

create or replace function analytics.rpc_refresh_all_read_models()
returns void
language plpgsql security definer
as $$
begin
  if not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: refresh_read_models';
  end if;

  -- Executive
  delete from analytics.rm_executive_summary where snapshot_date = current_date;
  insert into analytics.rm_executive_summary (snapshot_date, total_revenue, open_projects_count,
    overdue_collections_amount, open_alerts_count)
  values (
    current_date,
    coalesce((select sum(grand_total) from finance.invoices where state = 'Paid' and date_trunc('month', issue_date) = date_trunc('month', current_date)), 0),
    (select count(*) from execution.projects where state in ('Planning','In Progress','Approved')),
    coalesce((select sum(balance_due) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')), 0),
    (select count(*) from execution.alerts where state = 'Open')
  );

  -- Operations
  delete from analytics.rm_operations_summary where snapshot_date = current_date;
  insert into analytics.rm_operations_summary (snapshot_date, active_work_orders, delayed_work_orders, open_tasks, material_shortages)
  values (
    current_date,
    (select count(*) from execution.work_orders where state not in ('Completed','Verified','Cancelled')),
    (select count(*) from execution.work_orders where required_end_date < current_date and state not in ('Completed','Verified','Cancelled')),
    (select count(*) from execution.tasks where state in ('Open','In Progress')),
    (select count(*) from inventory.inventory where available_qty <= 0)
  );

  -- Procurement
  delete from analytics.rm_procurement_summary where snapshot_date = current_date;
  insert into analytics.rm_procurement_summary (snapshot_date, open_rfqs, pending_approvals, overdue_purchase_orders)
  values (
    current_date,
    (select count(*) from procurement.rfqs where state not in ('Awarded','Cancelled')),
    (select count(*) from procurement.approvals where state = 'pending'),
    (select count(*) from procurement.purchase_orders where expected_delivery_date < current_date and state not in ('Received','Closed','Cancelled'))
  );

  -- Finance
  delete from analytics.rm_finance_summary where snapshot_date = current_date;
  insert into analytics.rm_finance_summary (snapshot_date, ar_total, ap_total, overdue_amount, unreconciled_payments_count)
  values (
    current_date,
    coalesce((select sum(balance_due) from finance.invoices where state not in ('Paid','Cancelled')), 0),
    coalesce((select sum(grand_total) from procurement.supplier_invoices where state not in ('paid','cancelled')), 0),
    coalesce((select sum(balance_due) from finance.invoices where due_date < current_date and state not in ('Paid','Cancelled')), 0),
    (select count(*) from finance.bank_matches where state != 'Matched')
  );

  -- Workforce
  delete from analytics.rm_workforce_summary where snapshot_date = current_date;
  insert into analytics.rm_workforce_summary (snapshot_date, active_employees, missing_attendance_count, payroll_pending_count, pending_reimbursements_amount)
  values (
    current_date,
    (select count(*) from workforce.employees where status = 'Active'),
    (select count(*) from workforce.attendance where approval_status = 'pending'),
    (select count(*) from workforce.payroll_runs where state in ('Draft','Calculated')),
    coalesce((select sum(amount) from workforce.employee_expenses where approval_status = 'pending'), 0)
  );

  -- AI
  delete from analytics.rm_ai_summary where snapshot_date = current_date;
  insert into analytics.rm_ai_summary (snapshot_date, open_anomalies_count, new_insights_count, high_risk_recommendations_count)
  values (
    current_date,
    (select count(*) from intelligence.anomaly_cases where state in ('Open','Investigating')),
    (select count(*) from intelligence.ai_insights where state = 'New'),
    (select count(*) from intelligence.decision_recommendations where state = 'New' and priority in ('high','critical'))
  );
end;
$$;

-- =========================================================
-- SECTION 14: ENTITY LISTING RPCs (paginated, filtered)
-- =========================================================

create or replace function commercial.rpc_list_customers(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_sales() or governance.current_user_is_finance()
       or governance.current_user_is_ops() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: list_customers';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(row_to_json(c))
      from (
        select * from commercial.customers
        where deleted_at is null
          and (p_status is null or status = p_status)
          and (p_search is null or legal_name ilike '%' || p_search || '%' or customer_number ilike '%' || p_search || '%')
        order by created_at desc
        limit p_limit offset p_offset
      ) c
    ), '[]'::jsonb),
    'total', (
      select count(*) from commercial.customers
      where deleted_at is null
        and (p_status is null or status = p_status)
        and (p_search is null or legal_name ilike '%' || p_search || '%' or customer_number ilike '%' || p_search || '%')
    )
  );
end;
$$;

create or replace function procurement.rpc_list_suppliers(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_procurement() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: list_suppliers';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(row_to_json(s))
      from (
        select * from procurement.suppliers
        where deleted_at is null
          and (p_status is null or status = p_status)
          and (p_search is null or legal_name ilike '%' || p_search || '%' or supplier_number ilike '%' || p_search || '%')
        order by created_at desc
        limit p_limit offset p_offset
      ) s
    ), '[]'::jsonb),
    'total', (
      select count(*) from procurement.suppliers
      where deleted_at is null
        and (p_status is null or status = p_status)
        and (p_search is null or legal_name ilike '%' || p_search || '%' or supplier_number ilike '%' || p_search || '%')
    )
  );
end;
$$;

create or replace function execution.rpc_list_projects(
  p_state text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_ops() or governance.current_user_is_finance()
       or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: list_projects';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'project', row_to_json(p),
        'customer_name', (select display_name from commercial.customers where id = p.customer_id)
      ))
      from (
        select * from execution.projects
        where (p_state is null or state = p_state)
          and (p_search is null or project_name ilike '%' || p_search || '%' or project_number ilike '%' || p_search || '%')
        order by created_at desc
        limit p_limit offset p_offset
      ) p
    ), '[]'::jsonb),
    'total', (
      select count(*) from execution.projects
      where (p_state is null or state = p_state)
        and (p_search is null or project_name ilike '%' || p_search || '%' or project_number ilike '%' || p_search || '%')
    )
  );
end;
$$;

create or replace function execution.rpc_list_work_orders(
  p_project_id bigint default null,
  p_state text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable
as $$
begin
  if not (governance.current_user_is_ops() or governance.current_user_is_executive()) then
    raise exception 'ACCESS_DENIED: list_work_orders';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(row_to_json(wo))
      from (
        select * from execution.work_orders
        where (p_project_id is null or project_id = p_project_id)
          and (p_state is null or state = p_state)
        order by created_at desc
        limit p_limit offset p_offset
      ) wo
    ), '[]'::jsonb),
    'total', (
      select count(*) from execution.work_orders
      where (p_project_id is null or project_id = p_project_id)
        and (p_state is null or state = p_state)
    )
  );
end;
$$;

-- =========================================================
-- SECTION 15: GRANT EXECUTE TO authenticated
-- =========================================================

grant execute on function governance.get_my_permissions() to authenticated;
grant execute on function governance.get_my_roles() to authenticated;
grant execute on function governance.get_my_profile() to authenticated;
grant execute on function governance.rpc_write_audit(text, bigint, text, text, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function governance.rpc_write_state_change(text, bigint, text, text, text, text) to authenticated;
grant execute on function governance.rpc_emit_domain_event(text, text, text, text, text, bigint, jsonb, text) to authenticated;

grant execute on function commercial.rpc_get_customer_360(bigint) to authenticated;
grant execute on function commercial.rpc_get_quote_360(bigint) to authenticated;
grant execute on function commercial.rpc_list_customers(text, text, integer, integer) to authenticated;

grant execute on function procurement.rpc_get_supplier_360(bigint) to authenticated;
grant execute on function procurement.rpc_get_rfq_360(bigint) to authenticated;
grant execute on function procurement.rpc_get_po_360(bigint) to authenticated;
grant execute on function procurement.rpc_list_suppliers(text, text, integer, integer) to authenticated;

grant execute on function execution.rpc_get_project_360(bigint) to authenticated;
grant execute on function execution.rpc_get_work_order_360(bigint) to authenticated;
grant execute on function execution.rpc_list_projects(text, text, integer, integer) to authenticated;
grant execute on function execution.rpc_list_work_orders(bigint, text, integer, integer) to authenticated;

grant execute on function finance.rpc_get_finance_360() to authenticated;

grant execute on function workforce.rpc_get_employee_360(bigint) to authenticated;

grant execute on function analytics.rpc_executive_control_tower() to authenticated;
grant execute on function analytics.rpc_operations_control_room() to authenticated;
grant execute on function analytics.rpc_procurement_control_room() to authenticated;
grant execute on function analytics.rpc_finance_control_room() to authenticated;
grant execute on function analytics.rpc_workforce_control_room() to authenticated;
grant execute on function analytics.rpc_ai_control_room() to authenticated;
grant execute on function analytics.rpc_refresh_all_read_models() to authenticated;
