-- ============================================================
-- FILE: supabase/migrations/00016_trigger_functions_computed_fields.sql
-- TECHNOKOL UZI ERP 2026
-- Auto-computed fields via triggers
-- ============================================================

-- ============================================================
-- 1) PROJECT: auto-recalc actual_cost from work_order line items
-- ============================================================

create or replace function execution.trg_recalc_project_cost()
returns trigger
language plpgsql
security definer
as $$
declare
  v_project_id bigint;
begin
  -- Get project_id from work_order
  if TG_OP = 'DELETE' then
    select project_id into v_project_id
    from execution.work_orders
    where id = OLD.work_order_id;
  else
    select project_id into v_project_id
    from execution.work_orders
    where id = NEW.work_order_id;
  end if;

  if v_project_id is null then return coalesce(NEW, OLD); end if;

  update execution.projects
  set actual_cost = coalesce((
    select sum(woli.line_total)
    from execution.work_order_line_items woli
    join execution.work_orders wo on wo.id = woli.work_order_id
    where wo.project_id = v_project_id
  ), 0),
  updated_at = now()
  where id = v_project_id;

  return coalesce(NEW, OLD);
end;
$$;

-- ============================================================
-- 2) INVOICE: auto-recalc grand_total + balance_due from lines
-- ============================================================

create or replace function finance.trg_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_invoice_id bigint;
  v_subtotal numeric(18,2);
  v_discount numeric(18,2);
  v_tax numeric(18,2);
  v_grand numeric(18,2);
  v_paid numeric(18,2);
begin
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);

  select
    coalesce(sum(il.line_total), 0),
    coalesce(sum(il.discount_amount), 0),
    coalesce(sum(il.tax_amount), 0)
  into v_subtotal, v_discount, v_tax
  from finance.invoice_lines il
  where il.invoice_id = v_invoice_id;

  v_grand := v_subtotal - v_discount + v_tax;

  select coalesce(sum(p.amount), 0) into v_paid
  from finance.payments p
  where p.invoice_id = v_invoice_id
    and p.state = 'Posted';

  update finance.invoices
  set
    subtotal = v_subtotal,
    discount_total = v_discount,
    tax_total = v_tax,
    grand_total = v_grand,
    paid_total = v_paid,
    balance_due = v_grand - v_paid,
    updated_at = now()
  where id = v_invoice_id;

  return coalesce(NEW, OLD);
end;
$$;

-- ============================================================
-- 3) QUOTE: auto-recalc grand_total from lines
-- ============================================================

create or replace function commercial.trg_recalc_quote_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_quote_id bigint;
  v_subtotal numeric(18,2);
  v_discount numeric(18,2);
  v_tax numeric(18,2);
begin
  v_quote_id := coalesce(NEW.quote_id, OLD.quote_id);

  select
    coalesce(sum(ql.line_total), 0),
    coalesce(sum(ql.discount_amount), 0),
    coalesce(sum(ql.tax_amount), 0)
  into v_subtotal, v_discount, v_tax
  from commercial.quote_lines ql
  where ql.quote_id = v_quote_id;

  update commercial.quotes
  set
    subtotal = v_subtotal,
    discount_total = v_discount,
    tax_total = v_tax,
    grand_total = v_subtotal - v_discount + v_tax,
    updated_at = now()
  where id = v_quote_id;

  return coalesce(NEW, OLD);
end;
$$;

-- ============================================================
-- 4) PO: auto-recalc grand_total from lines
-- ============================================================

create or replace function procurement.trg_recalc_po_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_po_id bigint;
  v_subtotal numeric(18,2);
  v_tax numeric(18,2);
begin
  v_po_id := coalesce(NEW.purchase_order_id, OLD.purchase_order_id);

  select
    coalesce(sum(pol.line_total), 0),
    coalesce(sum(pol.tax_amount), 0)
  into v_subtotal, v_tax
  from procurement.po_line_items pol
  where pol.purchase_order_id = v_po_id;

  update procurement.purchase_orders
  set
    subtotal = v_subtotal,
    tax_total = v_tax,
    grand_total = v_subtotal + v_tax,
    updated_at = now()
  where id = v_po_id;

  return coalesce(NEW, OLD);
end;
$$;

-- ============================================================
-- 5) PROJECT RISK: auto-calc overall_score = P × I
-- ============================================================

create or replace function execution.trg_calc_risk_score()
returns trigger
language plpgsql
as $$
begin
  NEW.overall_score := NEW.probability_score * NEW.impact_score;
  return NEW;
end;
$$;

create trigger trg_project_risks_calc_score
before insert or update of probability_score, impact_score
on execution.project_risks
for each row execute function execution.trg_calc_risk_score();

-- ============================================================
-- 6) INVOICE OVERDUE: auto-transition when past due_date
-- (called by daily cron, not a trigger)
-- ============================================================

create or replace function finance.mark_overdue_invoices()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update finance.invoices
  set state = 'Overdue', updated_at = now()
  where state in ('Issued', 'PartiallyPaid')
    and due_date < current_date
    and balance_due > 0;

  get diagnostics v_count = row_count;

  -- Write state history for each
  insert into governance.state_history (
    entity_type, entity_id, from_state, to_state,
    reason, changed_at
  )
  select
    'Invoice', i.id, 'Issued', 'Overdue',
    'Auto-marked overdue by system cron',
    now()
  from finance.invoices i
  where i.state = 'Overdue'
    and i.updated_at >= now() - interval '1 minute';

  return v_count;
end;
$$;

-- ============================================================
-- 7) SLA BREACH: auto-mark breached timers
-- ============================================================

create or replace function governance.mark_breached_sla_timers()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update governance.sla_timers
  set
    state = 'Breached',
    breached_at = now(),
    updated_at = now()
  where state = 'Running'
    and due_at < now()
    and breached_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 8) ATTENDANCE: auto-calc total_hours
-- ============================================================

create or replace function workforce.trg_calc_attendance_hours()
returns trigger
language plpgsql
as $$
begin
  NEW.total_hours := coalesce(NEW.regular_hours, 0) + coalesce(NEW.overtime_hours, 0);
  return NEW;
end;
$$;

-- Apply trigger only if attendance table has total_hours column
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'workforce' and table_name = 'attendance' and column_name = 'total_hours'
  ) then
    execute 'create trigger trg_attendance_calc_hours
      before insert or update of regular_hours, overtime_hours
      on workforce.attendance
      for each row execute function workforce.trg_calc_attendance_hours()';
  end if;
exception when duplicate_object then null;
end;
$$;
