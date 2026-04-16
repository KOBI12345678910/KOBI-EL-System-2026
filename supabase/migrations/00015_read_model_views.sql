-- ============================================================
-- FILE: supabase/migrations/00015_read_model_views.sql
-- TECHNOKOL UZI ERP 2026
-- Materialized views for dashboards, control rooms, and 360 pages
-- ============================================================

-- ============================================================
-- 1) EXECUTIVE SUMMARY (refreshed daily by cron)
-- ============================================================

create materialized view if not exists analytics.mv_executive_summary as
select
  current_date as snapshot_date,

  coalesce((
    select sum(i.grand_total)
    from finance.invoices i
    where i.state in ('Issued','PartiallyPaid','Paid')
  ), 0) as total_revenue,

  coalesce((
    select count(*)
    from execution.projects p
    where p.state not in ('Closed','Cancelled')
  ), 0) as open_projects_count,

  coalesce((
    select sum(i.balance_due)
    from finance.invoices i
    where i.state = 'Overdue'
  ), 0) as overdue_collections_amount,

  coalesce((
    select count(*)
    from procurement.purchase_orders po
    where po.state = 'PendingApproval'
  ), 0) as procurement_bottlenecks_count,

  coalesce((
    select count(*)
    from workforce.payroll_exceptions pe
    where pe.state = 'Open'
  ), 0) as payroll_risk_count,

  coalesce((
    select count(*)
    from inventory.shortage_snapshots ss
    where ss.snapshot_at > now() - interval '7 days'
  ), 0) as inventory_shortage_count,

  coalesce((
    select count(*)
    from execution.alerts a
    where a.state in ('Open','Acknowledged','Reopened')
  ), 0) as open_alerts_count
;

create unique index if not exists idx_mv_executive_summary_date
  on analytics.mv_executive_summary(snapshot_date);

-- ============================================================
-- 2) CUSTOMER HEALTH (per customer)
-- ============================================================

create materialized view if not exists analytics.mv_customer_health as
select
  c.id as customer_id,
  c.customer_number,
  c.display_name,
  c.status,
  c.risk_level,

  coalesce((
    select count(*)
    from commercial.quotes q
    where q.customer_id = c.id
  ), 0) as total_quotes,

  coalesce((
    select count(*)
    from execution.projects p
    where p.customer_id = c.id
      and p.state not in ('Closed','Cancelled')
  ), 0) as open_projects,

  coalesce((
    select sum(i.balance_due)
    from finance.invoices i
    where i.customer_id = c.id
      and i.state in ('Issued','PartiallyPaid','Overdue')
  ), 0) as open_balance,

  coalesce((
    select sum(i.grand_total)
    from finance.invoices i
    where i.customer_id = c.id
      and i.state in ('Paid','PartiallyPaid','Issued')
  ), 0) as lifetime_revenue,

  coalesce((
    select count(*)
    from finance.invoices i
    where i.customer_id = c.id
      and i.state = 'Overdue'
  ), 0) as overdue_invoices_count,

  coalesce((
    select max(p.payment_date)
    from finance.payments p
    where p.customer_id = c.id
  ), null) as last_payment_date

from commercial.customers c
where c.deleted_at is null
;

create unique index if not exists idx_mv_customer_health_id
  on analytics.mv_customer_health(customer_id);

-- ============================================================
-- 3) PROJECT HEALTH (per project)
-- ============================================================

create materialized view if not exists analytics.mv_project_health as
select
  p.id as project_id,
  p.project_number,
  p.project_name,
  p.customer_id,
  p.state,
  p.progress_percent,
  p.budget_amount,
  p.actual_cost,

  case
    when p.budget_amount > 0
    then round((p.actual_cost / p.budget_amount) * 100, 1)
    else 0
  end as budget_utilization_pct,

  coalesce((
    select count(*)
    from execution.work_orders w
    where w.project_id = p.id
  ), 0) as work_orders_count,

  coalesce((
    select count(*)
    from execution.tasks t
    where t.linked_entity_type = 'Project'
      and t.linked_entity_id = p.id
      and t.state not in ('Completed','Cancelled')
  ), 0) as open_tasks_count,

  coalesce((
    select count(*)
    from execution.project_risks pr
    where pr.project_id = p.id
      and pr.state <> 'Resolved'
  ), 0) as open_risks_count,

  coalesce((
    select count(*)
    from execution.project_blockers pb
    where pb.project_id = p.id
      and pb.state <> 'Resolved'
  ), 0) as open_blockers_count,

  coalesce((
    select sum(i.balance_due)
    from finance.invoices i
    where i.project_id = p.id
  ), 0) as invoice_balance,

  coalesce((
    select count(*)
    from execution.alerts a
    where a.parent_entity_type = 'Project'
      and a.parent_entity_id = p.id
      and a.state in ('Open','Acknowledged')
  ), 0) as open_alerts_count,

  case
    when p.planned_end_date is not null and p.planned_end_date < current_date
      and p.state not in ('Completed','Closed','Cancelled')
    then true else false
  end as is_overdue

from execution.projects p
where p.state not in ('Cancelled')
;

create unique index if not exists idx_mv_project_health_id
  on analytics.mv_project_health(project_id);

-- ============================================================
-- 4) SUPPLIER PERFORMANCE (per supplier)
-- ============================================================

create materialized view if not exists analytics.mv_supplier_performance as
select
  s.id as supplier_id,
  s.supplier_number,
  s.display_name,
  s.status,

  coalesce((
    select count(*)
    from procurement.purchase_orders po
    where po.supplier_id = s.id
  ), 0) as total_pos,

  coalesce((
    select count(*)
    from procurement.purchase_orders po
    where po.supplier_id = s.id
      and po.state not in ('Closed','Cancelled')
  ), 0) as open_pos,

  coalesce((
    select sum(po.grand_total)
    from procurement.purchase_orders po
    where po.supplier_id = s.id
  ), 0) as total_po_value,

  coalesce((
    select sc.overall_score
    from procurement.supplier_scorecards sc
    where sc.supplier_id = s.id
    order by sc.calculated_at desc
    limit 1
  ), null) as latest_score,

  coalesce((
    select count(*)
    from procurement.rfq_supplier_invites rsi
    where rsi.supplier_id = s.id
      and rsi.response_status in ('pending','invited')
  ), 0) as pending_rfqs

from procurement.suppliers s
where s.deleted_at is null
;

create unique index if not exists idx_mv_supplier_performance_id
  on analytics.mv_supplier_performance(supplier_id);

-- ============================================================
-- 5) FINANCE SUMMARY
-- ============================================================

create or replace view analytics.v_finance_summary as
select
  coalesce(sum(case when i.state in ('Issued','PartiallyPaid','Paid') then i.grand_total else 0 end), 0) as total_invoiced,
  coalesce(sum(case when i.state in ('Issued','PartiallyPaid','Overdue') then i.balance_due else 0 end), 0) as total_outstanding,
  coalesce(sum(case when i.state = 'Overdue' then i.balance_due else 0 end), 0) as total_overdue,
  coalesce(sum(case when i.state = 'Paid' then i.grand_total else 0 end), 0) as total_collected,
  count(*) filter (where i.state = 'Draft') as draft_invoices_count,
  count(*) filter (where i.state = 'Issued') as issued_invoices_count,
  count(*) filter (where i.state = 'Overdue') as overdue_invoices_count,
  count(*) filter (where i.state = 'Paid') as paid_invoices_count
from finance.invoices i;

-- ============================================================
-- 6) WORKFORCE SUMMARY
-- ============================================================

create or replace view analytics.v_workforce_summary as
select
  count(*) filter (where e.status = 'Active') as active_employees,
  count(*) filter (where e.status = 'OnLeave') as on_leave_employees,
  count(*) filter (where e.status = 'Terminated') as terminated_employees,
  coalesce((
    select count(*)
    from workforce.leave_requests lr
    where lr.approval_status = 'Pending'
  ), 0) as pending_leave_requests,
  coalesce((
    select count(*)
    from workforce.payroll_exceptions pe
    where pe.state = 'Open'
  ), 0) as open_payroll_exceptions
from workforce.employees e
where e.deleted_at is null;

-- ============================================================
-- 7) INVENTORY SUMMARY
-- ============================================================

create or replace view analytics.v_inventory_summary as
select
  count(distinct m.id) as total_materials,
  coalesce(sum(ml.quantity_on_hand), 0) as total_stock_units,
  coalesce((
    select count(*)
    from inventory.shortage_snapshots ss
    where ss.snapshot_at > now() - interval '24 hours'
  ), 0) as recent_shortages,
  coalesce((
    select count(*)
    from inventory.reorder_rules rr
    where rr.active = true
  ), 0) as active_reorder_rules
from inventory.materials m
left join inventory.material_lots ml on ml.material_id = m.id and ml.status = 'active';

-- ============================================================
-- REFRESH FUNCTIONS
-- ============================================================

create or replace function analytics.refresh_all_materialized_views()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently analytics.mv_executive_summary;
  refresh materialized view concurrently analytics.mv_customer_health;
  refresh materialized view concurrently analytics.mv_project_health;
  refresh materialized view concurrently analytics.mv_supplier_performance;
end;
$$;
