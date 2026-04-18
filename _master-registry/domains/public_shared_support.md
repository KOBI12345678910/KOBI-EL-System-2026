# DOMAIN — public_shared_support

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schemas | `public`, `pricing`, `planning`, `quality`, `routing`, `compliance`, `maintenance`, `service`, `treasury`, `crm` (legacy) |
| Evidence | `_all_tables.txt`, DISCOVERY §B §C §D |
| Role | Aggregator for 11 minor / legacy / platform schemas not part of the 12 canonical domains |

## 1. domain_checklist

### expected_models (30)

- **public**: app_menu, customers (dup), employees (dup), inventory_items (dup), orders, properties, suppliers (dup), user_profiles
- **pricing**: calculations, rule_sets
- **planning**: capacity_calendars, capacity_slots, demand_forecasts
- **quality**: defects, inspection_plans, inspection_runs
- **routing**: menu_nodes, route_permission_map, route_registry
- **compliance**: policies, policy_acknowledgements
- **maintenance**: assets, work_orders (duplicate with execution.work_orders)
- **service**: tickets, ticket_comments (canonical service model — also in comms.support_*)
- **treasury**: bank_accounts, cash_forecasts, cash_positions
- **crm (legacy)**: lead_activities, leads, opportunities (duplicates of commercial.*)

### required_pages
- `/admin/app-menu` (public.app_menu manager)
- `/pricing/calculations`, `/pricing/rule-sets`
- `/planning/capacity`, `/planning/demand-forecasts`
- `/quality/defects`, `/quality/inspections`, `/quality/inspection/:id`
- `/admin/routes` (route_registry), `/admin/menu-nodes`
- `/compliance/policies`, `/compliance/acknowledgements`
- `/maintenance/assets`, `/maintenance/work-orders`
- `/service/tickets`, `/service/ticket/:id`
- `/treasury/bank-accounts`, `/treasury/cash-forecasts`, `/treasury/cash-positions`

### required_forms
NewPricingRule, NewCapacitySlot, NewInspectionPlan, LogDefect, NewPolicy, AcknowledgePolicy, NewAsset, NewMaintenanceWO, NewServiceTicket, NewBankAccount, NewCashForecast

### critical_relations
- pricing.rule_sets → commercial.quotes pricing
- planning.capacity_calendars → execution.work_orders scheduling
- quality.inspection_runs → execution.work_orders QA
- routing.* → governance/users (permission gating)
- maintenance.assets → maintenance.work_orders
- treasury.bank_accounts → finance.payments
- crm.* legacy → canonicalize to commercial.*

### completion_gate
- crm_legacy tables consolidated to commercial.* (preserve but mark deprecated_with_reason)
- maintenance.work_orders vs execution.work_orders — canonical decision (D003)
- public.customers/employees/suppliers duplicates — canonical decision (D009)
- service.tickets vs comms.support_tickets — canonical decision

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables across 10 schemas | 30 |
| Registry models | partial coverage in 5 of 30 |
| API routers | 18 across these schemas |
| Pages | 35 |
| Menu entries | 28 |
| Dashboards | 0 |
| Reports | 0 |

## 3. GAPS

| class | items |
|---|---|
| **duplicates to canonicalize** | public.customers/employees/suppliers/inventory_items; crm.leads/opportunities/lead_activities; maintenance.work_orders; service.tickets/ticket_comments |
| **built_not_exposed** | pricing.calculations, planning.capacity_slots, planning.demand_forecasts, quality.inspection_plans, quality.inspection_runs, quality.defects, compliance.policies, compliance.policy_acknowledgements, treasury.cash_forecasts, treasury.cash_positions, maintenance.assets |
| **built_internal_only** | routing.menu_nodes, routing.route_permission_map, routing.route_registry (nav substrate) |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | canonical decisions (D003 + D009) for every duplicate |
| build_now | quality module surface, compliance page, treasury pages |
| internal_only | routing.*, public.app_menu |
| deprecated_with_reason | crm.* legacy (3 tables); public duplicate tables (6) — preserve via views pointing to canonical |
| remove_from_registry | N/A per ZERO LOSS — use `deprecated_with_reason` |

## 5. DEPLOYMENT

0/30 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 20 |
| business_readiness | partial |
| gate_status | blocked — canonicals undecided |
| red rows | 11 |
