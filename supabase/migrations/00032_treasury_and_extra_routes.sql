-- 00032 Treasury view/RPC + extra route registry entries

create or replace view analytics.v_treasury_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from treasury.bank_accounts where active = true), 0) as bank_accounts_count,
  coalesce((select sum(current_balance) from treasury.bank_accounts where active = true), 0) as total_current_balance,
  coalesce((select count(*) from treasury.cash_forecasts), 0) as forecasts_count,
  coalesce((select count(*) from treasury.bank_accounts where active = true and current_balance < 50000), 0) as low_balance_accounts;

create or replace function analytics.get_treasury_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, treasury, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_treasury() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_treasury_summary v),
    'bank_accounts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, account_number_masked, bank_name, branch_name, currency, account_type, current_balance, active, owner_company_name, created_at, updated_at from treasury.bank_accounts order by bank_name limit 100) x),
    'cash_positions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, bank_account_id, snapshot_date, opening_balance, inflow_amount, outflow_amount, closing_balance from treasury.cash_positions order by snapshot_date desc limit 100) x),
    'forecasts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, forecast_date, bank_account_id, scenario_name, expected_inflow, expected_outflow, projected_closing_balance, confidence_score, created_at, updated_at from treasury.cash_forecasts order by forecast_date asc limit 100) x)
  ) into v_payload;

  return v_payload;
end;
$$;

-- Extra route registry entries
insert into routing.route_registry (route_key, route_path, route_title, component_name, required_permission, icon_name, active, sort_order)
values
  ('crm_control_room', '/crm-control', 'CRM Control Room', 'CRMControlRoom', 'customers.read', 'UsersRound', true, 160),
  ('service_control_room', '/service-control', 'Service Control Room', 'ServiceControlRoom', 'projects.read', 'Wrench', true, 170),
  ('treasury_control_room', '/treasury-control', 'Treasury Control Room', 'TreasuryControlRoom', 'finance.read', 'Landmark', true, 180)
on conflict (route_key) do update set
  route_path = excluded.route_path, route_title = excluded.route_title, component_name = excluded.component_name,
  required_permission = excluded.required_permission, icon_name = excluded.icon_name, active = excluded.active,
  sort_order = excluded.sort_order, updated_at = now();

select routing.run_full_route_menu_permission_sync();
