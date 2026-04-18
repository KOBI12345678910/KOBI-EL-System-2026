-- =========================================================
-- GOVERNED ACTION RPCs + STATE MACHINE CONSTRAINTS
-- Based on: EDGE_FUNCTION_MANIFEST, STATE_MACHINE_RULES,
--           AUDIT_WRITE_STANDARD, READ_MODEL_REFRESH_STRATEGY
-- =========================================================

-- =========================================================
-- SECTION 1: STATE CHECK CONSTRAINTS
-- =========================================================

alter table commercial.quotes
  add constraint chk_quote_state
  check (state in ('Draft','Sent','UnderReview','Approved','Rejected','ConvertedToProject'));

alter table procurement.rfqs
  add constraint chk_rfq_state
  check (state in ('Draft','Sent','QuotesReceived','UnderComparison','Approved','Rejected','ConvertedToPO'));

alter table procurement.purchase_orders
  add constraint chk_po_state
  check (state in ('Draft','PendingApproval','Approved','SentToSupplier','PartiallyReceived','FullyReceived','Closed','Cancelled'));

alter table execution.projects
  add constraint chk_project_state
  check (state in ('Planning','Active','Blocked','Completed','Closed'));

alter table execution.work_orders
  add constraint chk_wo_state
  check (state in ('Open','Assigned','WaitingMaterials','InProgress','QA','Completed','SignedOff','Cancelled'));

alter table finance.invoices
  add constraint chk_invoice_state
  check (state in ('Draft','Issued','PartiallyPaid','Paid','Overdue','Cancelled'));

alter table workforce.attendance
  add constraint chk_attendance_state
  check (state in ('Draft','Submitted','Approved','Rejected'));

alter table workforce.payroll_runs
  add constraint chk_payroll_state
  check (state in ('Draft','Calculated','Approved','Exported','Paid','Cancelled'));

alter table execution.alerts
  add constraint chk_alert_state
  check (state in ('Open','Acknowledged','Resolved','Reopened'));

-- =========================================================
-- SECTION 2: QUOTE APPROVAL RPC
-- =========================================================

create or replace function commercial.rpc_approve_quote(
  p_quote_id bigint,
  p_comments text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_quote commercial.quotes;
  v_corr text;
begin
  if not governance.current_user_has_permission('quote.approve') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: quote.approve';
  end if;

  select * into v_quote from commercial.quotes where id = p_quote_id;
  if v_quote is null then raise exception 'NOT_FOUND: quote'; end if;
  if v_quote.state not in ('Draft','Sent','UnderReview') then
    raise exception 'INVALID_STATE: quote must be Draft/Sent/UnderReview, got %', v_quote.state;
  end if;

  v_corr := gen_random_uuid()::text;

  update commercial.quotes set state = 'Approved', approval_status = 'approved', updated_at = now() where id = p_quote_id;

  perform governance.rpc_write_state_change('quote', p_quote_id, v_quote.state, 'Approved', p_comments, v_corr);
  perform governance.rpc_write_audit('quote', p_quote_id, 'quote.approve', 'onyx-procurement', 'quotes',
    jsonb_build_object('state', v_quote.state), jsonb_build_object('state', 'Approved'), null, v_corr);
  perform governance.rpc_emit_domain_event('quote.approved', 'commercial.quotes', 'onyx-procurement', 'quotes',
    'quote', p_quote_id, jsonb_build_object('customer_id', v_quote.customer_id, 'grand_total', v_quote.grand_total), v_corr);

  return jsonb_build_object('success', true, 'state', 'Approved', 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 3: RFQ APPROVAL RPC
-- =========================================================

create or replace function procurement.rpc_approve_rfq(
  p_rfq_id bigint,
  p_decision text,
  p_winning_supplier_id bigint default null,
  p_comments text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_rfq procurement.rfqs;
  v_new_state text;
  v_corr text;
begin
  if not governance.current_user_has_permission('rfq.approve') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: rfq.approve';
  end if;

  select * into v_rfq from procurement.rfqs where id = p_rfq_id;
  if v_rfq is null then raise exception 'NOT_FOUND: rfq'; end if;
  if v_rfq.state not in ('UnderComparison','QuotesReceived') then
    raise exception 'INVALID_STATE: rfq must be UnderComparison/QuotesReceived, got %', v_rfq.state;
  end if;

  v_corr := gen_random_uuid()::text;

  if p_decision = 'approve' then
    v_new_state := 'Approved';
    update procurement.rfqs set state = 'Approved', approval_status = 'approved',
      winning_supplier_id = p_winning_supplier_id, updated_at = now() where id = p_rfq_id;
  elsif p_decision = 'reject' then
    v_new_state := 'Rejected';
    update procurement.rfqs set state = 'Rejected', approval_status = 'rejected', updated_at = now() where id = p_rfq_id;
  else
    raise exception 'INVALID_DECISION: must be approve or reject';
  end if;

  perform governance.rpc_write_state_change('rfq', p_rfq_id, v_rfq.state, v_new_state, p_comments, v_corr);
  perform governance.rpc_write_audit('rfq', p_rfq_id, 'rfq.' || p_decision, 'onyx-procurement', 'rfqs',
    jsonb_build_object('state', v_rfq.state), jsonb_build_object('state', v_new_state), null, v_corr);
  perform governance.rpc_emit_domain_event('rfq.' || p_decision || 'd', 'procurement.rfqs', 'onyx-procurement', 'rfqs',
    'rfq', p_rfq_id, jsonb_build_object('decision', p_decision, 'winning_supplier_id', p_winning_supplier_id), v_corr);

  return jsonb_build_object('success', true, 'state', v_new_state, 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 4: PO APPROVAL + RECEIVE RPCs
-- =========================================================

create or replace function procurement.rpc_request_po_approval(p_po_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_po procurement.purchase_orders;
  v_corr text;
begin
  if not governance.current_user_has_permission('po.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: po.write';
  end if;

  select * into v_po from procurement.purchase_orders where id = p_po_id;
  if v_po is null then raise exception 'NOT_FOUND: po'; end if;
  if v_po.state != 'Draft' then raise exception 'INVALID_STATE: po must be Draft'; end if;

  v_corr := gen_random_uuid()::text;

  update procurement.purchase_orders set state = 'PendingApproval', approval_status = 'pending', updated_at = now() where id = p_po_id;

  perform governance.rpc_write_state_change('purchase_order', p_po_id, 'Draft', 'PendingApproval', null, v_corr);
  perform governance.rpc_write_audit('purchase_order', p_po_id, 'po.request_approval', 'onyx-procurement', 'pos',
    jsonb_build_object('state', 'Draft'), jsonb_build_object('state', 'PendingApproval'), null, v_corr);

  return jsonb_build_object('success', true, 'state', 'PendingApproval', 'correlation_id', v_corr);
end;
$$;

create or replace function procurement.rpc_approve_po(
  p_po_id bigint,
  p_decision text,
  p_comments text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_po procurement.purchase_orders;
  v_new_state text;
  v_corr text;
begin
  if not governance.current_user_has_permission('po.approve') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: po.approve';
  end if;

  select * into v_po from procurement.purchase_orders where id = p_po_id;
  if v_po is null then raise exception 'NOT_FOUND: po'; end if;
  if v_po.state != 'PendingApproval' then raise exception 'INVALID_STATE: po must be PendingApproval'; end if;

  v_corr := gen_random_uuid()::text;

  if p_decision = 'approve' then
    v_new_state := 'Approved';
  elsif p_decision = 'reject' then
    v_new_state := 'Draft';
  else
    raise exception 'INVALID_DECISION';
  end if;

  update procurement.purchase_orders set state = v_new_state, approval_status = p_decision || 'd', updated_at = now() where id = p_po_id;

  perform governance.rpc_write_state_change('purchase_order', p_po_id, 'PendingApproval', v_new_state, p_comments, v_corr);
  perform governance.rpc_write_audit('purchase_order', p_po_id, 'po.' || p_decision, 'onyx-procurement', 'pos',
    jsonb_build_object('state', 'PendingApproval'), jsonb_build_object('state', v_new_state), null, v_corr);
  perform governance.rpc_emit_domain_event('po.' || p_decision || 'd', 'procurement.pos', 'onyx-procurement', 'pos',
    'purchase_order', p_po_id, jsonb_build_object('supplier_id', v_po.supplier_id, 'grand_total', v_po.grand_total), v_corr);

  return jsonb_build_object('success', true, 'state', v_new_state, 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 5: PROJECT + WORK ORDER STATE RPCs
-- =========================================================

create or replace function execution.rpc_change_project_state(
  p_project_id bigint,
  p_to_state text,
  p_reason text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_project execution.projects;
  v_corr text;
begin
  if not governance.current_user_has_permission('project.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: project.write';
  end if;

  select * into v_project from execution.projects where id = p_project_id;
  if v_project is null then raise exception 'NOT_FOUND: project'; end if;

  v_corr := gen_random_uuid()::text;

  update execution.projects set state = p_to_state, updated_at = now() where id = p_project_id;

  perform governance.rpc_write_state_change('project', p_project_id, v_project.state, p_to_state, p_reason, v_corr);
  perform governance.rpc_write_audit('project', p_project_id, 'project.state_change', 'techno-kol-ops', 'projects',
    jsonb_build_object('state', v_project.state), jsonb_build_object('state', p_to_state), null, v_corr);
  perform governance.rpc_emit_domain_event('project.state_changed', 'execution.projects', 'techno-kol-ops', 'projects',
    'project', p_project_id, jsonb_build_object('from', v_project.state, 'to', p_to_state), v_corr);

  return jsonb_build_object('success', true, 'state', p_to_state, 'correlation_id', v_corr);
end;
$$;

create or replace function execution.rpc_start_work_order(p_wo_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_wo execution.work_orders;
  v_corr text;
begin
  if not governance.current_user_has_permission('workorder.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: workorder.write';
  end if;

  select * into v_wo from execution.work_orders where id = p_wo_id;
  if v_wo is null then raise exception 'NOT_FOUND: work_order'; end if;
  if v_wo.state not in ('Open','Assigned','WaitingMaterials') then
    raise exception 'INVALID_STATE: work_order must be Open/Assigned/WaitingMaterials';
  end if;

  v_corr := gen_random_uuid()::text;

  update execution.work_orders set state = 'InProgress', actual_start_at = now(), updated_at = now() where id = p_wo_id;

  perform governance.rpc_write_state_change('work_order', p_wo_id, v_wo.state, 'InProgress', null, v_corr);
  perform governance.rpc_write_audit('work_order', p_wo_id, 'workorder.start', 'techno-kol-ops', 'work_orders',
    jsonb_build_object('state', v_wo.state), jsonb_build_object('state', 'InProgress'), null, v_corr);
  perform governance.rpc_emit_domain_event('workorder.started', 'execution.work_orders', 'techno-kol-ops', 'work_orders',
    'work_order', p_wo_id, jsonb_build_object('project_id', v_wo.project_id), v_corr);

  return jsonb_build_object('success', true, 'state', 'InProgress', 'correlation_id', v_corr);
end;
$$;

create or replace function execution.rpc_complete_work_order(p_wo_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_wo execution.work_orders;
  v_corr text;
begin
  if not governance.current_user_has_permission('workorder.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: workorder.write';
  end if;

  select * into v_wo from execution.work_orders where id = p_wo_id;
  if v_wo is null then raise exception 'NOT_FOUND: work_order'; end if;
  if v_wo.state not in ('InProgress','QA') then
    raise exception 'INVALID_STATE: work_order must be InProgress/QA';
  end if;

  v_corr := gen_random_uuid()::text;

  update execution.work_orders set state = 'Completed', actual_end_at = now(), progress_percent = 100, updated_at = now() where id = p_wo_id;

  perform governance.rpc_write_state_change('work_order', p_wo_id, v_wo.state, 'Completed', null, v_corr);
  perform governance.rpc_write_audit('work_order', p_wo_id, 'workorder.complete', 'techno-kol-ops', 'work_orders',
    jsonb_build_object('state', v_wo.state), jsonb_build_object('state', 'Completed'), null, v_corr);
  perform governance.rpc_emit_domain_event('workorder.completed', 'execution.work_orders', 'techno-kol-ops', 'work_orders',
    'work_order', p_wo_id, jsonb_build_object('project_id', v_wo.project_id), v_corr);

  return jsonb_build_object('success', true, 'state', 'Completed', 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 6: FINANCE ACTION RPCs
-- =========================================================

create or replace function finance.rpc_issue_invoice(p_invoice_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_inv finance.invoices;
  v_corr text;
begin
  if not governance.current_user_has_permission('invoice.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: invoice.write';
  end if;

  select * into v_inv from finance.invoices where id = p_invoice_id;
  if v_inv is null then raise exception 'NOT_FOUND: invoice'; end if;
  if v_inv.state != 'Draft' then raise exception 'INVALID_STATE: invoice must be Draft'; end if;

  v_corr := gen_random_uuid()::text;

  update finance.invoices set state = 'Issued', issue_date = current_date,
    due_date = current_date + coalesce(30, 30), sent_at = now(), updated_at = now() where id = p_invoice_id;

  perform governance.rpc_write_state_change('invoice', p_invoice_id, 'Draft', 'Issued', null, v_corr);
  perform governance.rpc_write_audit('invoice', p_invoice_id, 'invoice.issue', 'onyx-procurement', 'finance',
    jsonb_build_object('state', 'Draft'), jsonb_build_object('state', 'Issued'), null, v_corr);
  perform governance.rpc_emit_domain_event('invoice.issued', 'finance.invoices', 'onyx-procurement', 'finance',
    'invoice', p_invoice_id, jsonb_build_object('customer_id', v_inv.customer_id, 'grand_total', v_inv.grand_total), v_corr);

  return jsonb_build_object('success', true, 'state', 'Issued', 'correlation_id', v_corr);
end;
$$;

create or replace function finance.rpc_register_payment(
  p_invoice_id bigint,
  p_amount numeric,
  p_payment_method text default 'bank_transfer',
  p_reference text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_inv finance.invoices;
  v_new_state text;
  v_payment_id bigint;
  v_corr text;
begin
  if not governance.current_user_has_permission('payment.write') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: payment.write';
  end if;

  select * into v_inv from finance.invoices where id = p_invoice_id;
  if v_inv is null then raise exception 'NOT_FOUND: invoice'; end if;
  if v_inv.state not in ('Issued','PartiallyPaid','Overdue') then
    raise exception 'INVALID_STATE: invoice must be Issued/PartiallyPaid/Overdue';
  end if;

  v_corr := gen_random_uuid()::text;

  insert into finance.payments (payment_number, invoice_id, customer_id, payment_date, payment_method, amount, reference_number, created_by)
  values ('PAY-' || to_char(now(), 'YYYYMMDD') || '-' || nextval('finance.payments_id_seq'), p_invoice_id, v_inv.customer_id, current_date, p_payment_method, p_amount, p_reference, governance.current_user_profile_id())
  returning id into v_payment_id;

  update finance.invoices set
    paid_total = paid_total + p_amount,
    balance_due = balance_due - p_amount,
    updated_at = now()
  where id = p_invoice_id;

  select * into v_inv from finance.invoices where id = p_invoice_id;
  if v_inv.balance_due <= 0 then v_new_state := 'Paid';
  else v_new_state := 'PartiallyPaid'; end if;

  update finance.invoices set state = v_new_state, updated_at = now() where id = p_invoice_id;

  perform governance.rpc_write_state_change('invoice', p_invoice_id, v_inv.state, v_new_state, null, v_corr);
  perform governance.rpc_write_audit('invoice', p_invoice_id, 'payment.register', 'onyx-procurement', 'finance',
    jsonb_build_object('paid_total_before', v_inv.paid_total - p_amount),
    jsonb_build_object('paid_total_after', v_inv.paid_total, 'payment_amount', p_amount), null, v_corr);
  perform governance.rpc_emit_domain_event('payment.registered', 'finance.payments', 'onyx-procurement', 'finance',
    'invoice', p_invoice_id, jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount), v_corr);

  return jsonb_build_object('success', true, 'payment_id', v_payment_id, 'invoice_state', v_new_state, 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 7: WORKFORCE ACTION RPCs
-- =========================================================

create or replace function workforce.rpc_approve_attendance(
  p_attendance_id bigint,
  p_comments text default null
) returns jsonb
language plpgsql security definer
as $$
declare
  v_att workforce.attendance;
  v_corr text;
begin
  if not governance.current_user_is_payroll_hr() then
    raise exception 'ACCESS_DENIED: attendance.approve';
  end if;

  select * into v_att from workforce.attendance where id = p_attendance_id;
  if v_att is null then raise exception 'NOT_FOUND: attendance'; end if;
  if v_att.state != 'Submitted' then raise exception 'INVALID_STATE: attendance must be Submitted'; end if;

  v_corr := gen_random_uuid()::text;

  update workforce.attendance set state = 'Approved', approval_status = 'approved',
    approved_by_user_id = governance.current_user_profile_id(), approved_at = now(), updated_at = now()
  where id = p_attendance_id;

  perform governance.rpc_write_state_change('attendance', p_attendance_id, 'Submitted', 'Approved', p_comments, v_corr);
  perform governance.rpc_write_audit('attendance', p_attendance_id, 'attendance.approve', 'payroll-autonomous', 'attendance',
    jsonb_build_object('state', 'Submitted'), jsonb_build_object('state', 'Approved'), null, v_corr);

  return jsonb_build_object('success', true, 'state', 'Approved', 'correlation_id', v_corr);
end;
$$;

create or replace function workforce.rpc_approve_payroll_run(p_payroll_run_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_pr workforce.payroll_runs;
  v_corr text;
begin
  if not governance.current_user_has_permission('payroll.approve') and not governance.current_user_is_admin() then
    raise exception 'ACCESS_DENIED: payroll.approve';
  end if;

  select * into v_pr from workforce.payroll_runs where id = p_payroll_run_id;
  if v_pr is null then raise exception 'NOT_FOUND: payroll_run'; end if;
  if v_pr.state != 'Calculated' then raise exception 'INVALID_STATE: payroll must be Calculated'; end if;

  v_corr := gen_random_uuid()::text;

  update workforce.payroll_runs set state = 'Approved', approved_at = now(),
    approved_by = governance.current_user_profile_id(), updated_at = now()
  where id = p_payroll_run_id;

  perform governance.rpc_write_state_change('payroll_run', p_payroll_run_id, 'Calculated', 'Approved', null, v_corr);
  perform governance.rpc_write_audit('payroll_run', p_payroll_run_id, 'payroll.approve', 'payroll-autonomous', 'payroll',
    jsonb_build_object('state', 'Calculated'), jsonb_build_object('state', 'Approved'), null, v_corr);
  perform governance.rpc_emit_domain_event('payroll.approved', 'workforce.payroll', 'payroll-autonomous', 'payroll',
    'payroll_run', p_payroll_run_id, '{}'::jsonb, v_corr);

  return jsonb_build_object('success', true, 'state', 'Approved', 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 8: AI ACTION RPCs
-- =========================================================

create or replace function intelligence.rpc_acknowledge_insight(p_insight_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_insight intelligence.ai_insights;
  v_corr text;
begin
  select * into v_insight from intelligence.ai_insights where id = p_insight_id;
  if v_insight is null then raise exception 'NOT_FOUND: ai_insight'; end if;
  if v_insight.state != 'New' then raise exception 'INVALID_STATE: insight must be New'; end if;

  v_corr := gen_random_uuid()::text;

  update intelligence.ai_insights set state = 'Acknowledged', updated_at = now() where id = p_insight_id;

  perform governance.rpc_write_audit('ai_insight', p_insight_id, 'insight.acknowledge', 'onyx-ai', 'intelligence',
    jsonb_build_object('state', 'New'), jsonb_build_object('state', 'Acknowledged'), null, v_corr);

  return jsonb_build_object('success', true, 'state', 'Acknowledged', 'correlation_id', v_corr);
end;
$$;

create or replace function intelligence.rpc_convert_anomaly_to_alert(p_anomaly_id bigint)
returns jsonb
language plpgsql security definer
as $$
declare
  v_anomaly intelligence.anomaly_cases;
  v_alert_id bigint;
  v_corr text;
begin
  select * into v_anomaly from intelligence.anomaly_cases where id = p_anomaly_id;
  if v_anomaly is null then raise exception 'NOT_FOUND: anomaly'; end if;
  if v_anomaly.state not in ('Open','Investigating') then raise exception 'INVALID_STATE: anomaly must be Open/Investigating'; end if;

  v_corr := gen_random_uuid()::text;

  insert into execution.alerts (alert_number, category, severity, parent_entity_type, parent_entity_id,
    title, description, source_anomaly_case_id, state)
  values (
    'ALR-' || to_char(now(), 'YYYYMMDD') || '-' || nextval('execution.alerts_id_seq'),
    'ai_anomaly', coalesce(v_anomaly.severity, 'medium'),
    v_anomaly.parent_entity_type, v_anomaly.parent_entity_id,
    'AI Anomaly: ' || v_anomaly.anomaly_type,
    v_anomaly.explanation, p_anomaly_id, 'Open'
  ) returning id into v_alert_id;

  update intelligence.anomaly_cases set state = 'Confirmed', updated_at = now() where id = p_anomaly_id;

  perform governance.rpc_write_audit('anomaly_case', p_anomaly_id, 'anomaly.convert_to_alert', 'onyx-ai', 'intelligence',
    jsonb_build_object('state', v_anomaly.state), jsonb_build_object('state', 'Confirmed', 'alert_id', v_alert_id), null, v_corr);
  perform governance.rpc_emit_domain_event('anomaly.converted_to_alert', 'intelligence.anomalies', 'onyx-ai', 'intelligence',
    'anomaly_case', p_anomaly_id, jsonb_build_object('alert_id', v_alert_id), v_corr);

  return jsonb_build_object('success', true, 'alert_id', v_alert_id, 'correlation_id', v_corr);
end;
$$;

-- =========================================================
-- SECTION 9: GRANT EXECUTE
-- =========================================================

grant execute on function commercial.rpc_approve_quote(bigint, text) to authenticated;
grant execute on function procurement.rpc_approve_rfq(bigint, text, bigint, text) to authenticated;
grant execute on function procurement.rpc_request_po_approval(bigint) to authenticated;
grant execute on function procurement.rpc_approve_po(bigint, text, text) to authenticated;
grant execute on function execution.rpc_change_project_state(bigint, text, text) to authenticated;
grant execute on function execution.rpc_start_work_order(bigint) to authenticated;
grant execute on function execution.rpc_complete_work_order(bigint) to authenticated;
grant execute on function finance.rpc_issue_invoice(bigint) to authenticated;
grant execute on function finance.rpc_register_payment(bigint, numeric, text, text) to authenticated;
grant execute on function workforce.rpc_approve_attendance(bigint, text) to authenticated;
grant execute on function workforce.rpc_approve_payroll_run(bigint) to authenticated;
grant execute on function intelligence.rpc_acknowledge_insight(bigint) to authenticated;
grant execute on function intelligence.rpc_convert_anomaly_to_alert(bigint) to authenticated;
