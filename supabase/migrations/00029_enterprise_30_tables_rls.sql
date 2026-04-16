-- ============================================================
-- FILE: supabase/migrations/037_enterprise_30_tables_rls.sql
-- RLS FOR 30 ENTERPRISE TABLES
-- ============================================================

-- ============================================================
-- HELPER PERMISSION FUNCTIONS
-- ============================================================

create or replace function governance.can_read_crm()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['sales_manager','sales'])
$$;

create or replace function governance.can_read_service()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['ops_manager','ops','sales_manager','sales'])
$$;

create or replace function governance.can_read_quality()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['ops_manager','ops'])
$$;

create or replace function governance.can_read_compliance()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['hr_manager','hr'])
$$;

create or replace function governance.can_read_treasury()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['finance_manager','finance'])
$$;

create or replace function governance.can_read_planning()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['ops_manager','ops','procurement_manager','procurement'])
$$;

create or replace function governance.can_read_maintenance()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['ops_manager','ops'])
$$;

create or replace function governance.can_read_pricing()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
      or governance.current_user_has_any_role(array['sales_manager','sales','finance_manager','finance'])
$$;

create or replace function governance.can_read_routing_admin()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
$$;

create or replace function governance.can_read_document_intelligence()
returns boolean
language sql
stable
security definer
set search_path = governance, public
as $$
  select governance.current_user_is_admin()
      or governance.current_user_is_executive()
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================

alter table crm.leads enable row level security;
alter table crm.lead_activities enable row level security;
alter table crm.opportunities enable row level security;

alter table service.tickets enable row level security;
alter table service.ticket_comments enable row level security;

alter table quality.inspection_plans enable row level security;
alter table quality.inspection_runs enable row level security;
alter table quality.defects enable row level security;

alter table compliance.policies enable row level security;
alter table compliance.policy_acknowledgements enable row level security;

alter table treasury.bank_accounts enable row level security;
alter table treasury.cash_positions enable row level security;
alter table treasury.cash_forecasts enable row level security;

alter table planning.capacity_calendars enable row level security;
alter table planning.capacity_slots enable row level security;
alter table planning.demand_forecasts enable row level security;

alter table maintenance.assets enable row level security;
alter table maintenance.work_orders enable row level security;

alter table pricing.rule_sets enable row level security;
alter table pricing.calculations enable row level security;

alter table routing.route_registry enable row level security;
alter table routing.menu_nodes enable row level security;
alter table routing.route_permission_map enable row level security;

alter table documents.ocr_runs enable row level security;
alter table documents.classification_runs enable row level security;
alter table documents.extraction_runs enable row level security;
alter table documents.document_chunks enable row level security;
alter table documents.entity_extractions enable row level security;
alter table documents.document_relations enable row level security;
alter table documents.knowledge_cards enable row level security;

-- ============================================================
-- CRM POLICIES
-- ============================================================

create policy crm_leads_select
on crm.leads
for select
using (governance.can_read_crm());

create policy crm_leads_insert
on crm.leads
for insert
with check (governance.can_read_crm());

create policy crm_leads_update
on crm.leads
for update
using (governance.can_read_crm())
with check (governance.can_read_crm());

create policy crm_lead_activities_select
on crm.lead_activities
for select
using (governance.can_read_crm());

create policy crm_lead_activities_insert
on crm.lead_activities
for insert
with check (governance.can_read_crm());

create policy crm_lead_activities_update
on crm.lead_activities
for update
using (governance.can_read_crm())
with check (governance.can_read_crm());

create policy crm_opportunities_select
on crm.opportunities
for select
using (governance.can_read_crm());

create policy crm_opportunities_insert
on crm.opportunities
for insert
with check (governance.can_read_crm());

create policy crm_opportunities_update
on crm.opportunities
for update
using (governance.can_read_crm())
with check (governance.can_read_crm());

-- ============================================================
-- SERVICE POLICIES
-- ============================================================

create policy service_tickets_select
on service.tickets
for select
using (governance.can_read_service());

create policy service_tickets_insert
on service.tickets
for insert
with check (governance.can_read_service());

create policy service_tickets_update
on service.tickets
for update
using (governance.can_read_service())
with check (governance.can_read_service());

create policy service_ticket_comments_select
on service.ticket_comments
for select
using (governance.can_read_service());

create policy service_ticket_comments_insert
on service.ticket_comments
for insert
with check (governance.can_read_service());

create policy service_ticket_comments_update
on service.ticket_comments
for update
using (governance.can_read_service())
with check (governance.can_read_service());

-- ============================================================
-- QUALITY POLICIES
-- ============================================================

create policy quality_inspection_plans_select
on quality.inspection_plans
for select
using (governance.can_read_quality());

create policy quality_inspection_plans_insert
on quality.inspection_plans
for insert
with check (governance.can_read_quality());

create policy quality_inspection_plans_update
on quality.inspection_plans
for update
using (governance.can_read_quality())
with check (governance.can_read_quality());

create policy quality_inspection_runs_select
on quality.inspection_runs
for select
using (governance.can_read_quality());

create policy quality_inspection_runs_insert
on quality.inspection_runs
for insert
with check (governance.can_read_quality());

create policy quality_inspection_runs_update
on quality.inspection_runs
for update
using (governance.can_read_quality())
with check (governance.can_read_quality());

create policy quality_defects_select
on quality.defects
for select
using (governance.can_read_quality());

create policy quality_defects_insert
on quality.defects
for insert
with check (governance.can_read_quality());

create policy quality_defects_update
on quality.defects
for update
using (governance.can_read_quality())
with check (governance.can_read_quality());

-- ============================================================
-- COMPLIANCE POLICIES
-- ============================================================

create policy compliance_policies_select
on compliance.policies
for select
using (governance.can_read_compliance());

create policy compliance_policies_insert
on compliance.policies
for insert
with check (governance.can_read_compliance());

create policy compliance_policies_update
on compliance.policies
for update
using (governance.can_read_compliance())
with check (governance.can_read_compliance());

create policy compliance_policy_acknowledgements_select
on compliance.policy_acknowledgements
for select
using (
  governance.can_read_compliance()
  or user_id = governance.current_user_profile_id()
);

create policy compliance_policy_acknowledgements_insert
on compliance.policy_acknowledgements
for insert
with check (
  governance.can_read_compliance()
  or user_id = governance.current_user_profile_id()
);

-- ============================================================
-- TREASURY POLICIES
-- ============================================================

create policy treasury_bank_accounts_select
on treasury.bank_accounts
for select
using (governance.can_read_treasury());

create policy treasury_bank_accounts_insert
on treasury.bank_accounts
for insert
with check (governance.can_read_treasury());

create policy treasury_bank_accounts_update
on treasury.bank_accounts
for update
using (governance.can_read_treasury())
with check (governance.can_read_treasury());

create policy treasury_cash_positions_select
on treasury.cash_positions
for select
using (governance.can_read_treasury());

create policy treasury_cash_positions_insert
on treasury.cash_positions
for insert
with check (governance.can_read_treasury());

create policy treasury_cash_positions_update
on treasury.cash_positions
for update
using (governance.can_read_treasury())
with check (governance.can_read_treasury());

create policy treasury_cash_forecasts_select
on treasury.cash_forecasts
for select
using (governance.can_read_treasury());

create policy treasury_cash_forecasts_insert
on treasury.cash_forecasts
for insert
with check (governance.can_read_treasury());

create policy treasury_cash_forecasts_update
on treasury.cash_forecasts
for update
using (governance.can_read_treasury())
with check (governance.can_read_treasury());

-- ============================================================
-- PLANNING POLICIES
-- ============================================================

create policy planning_capacity_calendars_select
on planning.capacity_calendars
for select
using (governance.can_read_planning());

create policy planning_capacity_calendars_insert
on planning.capacity_calendars
for insert
with check (governance.can_read_planning());

create policy planning_capacity_calendars_update
on planning.capacity_calendars
for update
using (governance.can_read_planning())
with check (governance.can_read_planning());

create policy planning_capacity_slots_select
on planning.capacity_slots
for select
using (governance.can_read_planning());

create policy planning_capacity_slots_insert
on planning.capacity_slots
for insert
with check (governance.can_read_planning());

create policy planning_capacity_slots_update
on planning.capacity_slots
for update
using (governance.can_read_planning())
with check (governance.can_read_planning());

create policy planning_demand_forecasts_select
on planning.demand_forecasts
for select
using (governance.can_read_planning());

create policy planning_demand_forecasts_insert
on planning.demand_forecasts
for insert
with check (governance.can_read_planning());

create policy planning_demand_forecasts_update
on planning.demand_forecasts
for update
using (governance.can_read_planning())
with check (governance.can_read_planning());

-- ============================================================
-- MAINTENANCE POLICIES
-- ============================================================

create policy maintenance_assets_select
on maintenance.assets
for select
using (governance.can_read_maintenance());

create policy maintenance_assets_insert
on maintenance.assets
for insert
with check (governance.can_read_maintenance());

create policy maintenance_assets_update
on maintenance.assets
for update
using (governance.can_read_maintenance())
with check (governance.can_read_maintenance());

create policy maintenance_work_orders_select
on maintenance.work_orders
for select
using (governance.can_read_maintenance());

create policy maintenance_work_orders_insert
on maintenance.work_orders
for insert
with check (governance.can_read_maintenance());

create policy maintenance_work_orders_update
on maintenance.work_orders
for update
using (governance.can_read_maintenance())
with check (governance.can_read_maintenance());

-- ============================================================
-- PRICING POLICIES
-- ============================================================

create policy pricing_rule_sets_select
on pricing.rule_sets
for select
using (governance.can_read_pricing());

create policy pricing_rule_sets_insert
on pricing.rule_sets
for insert
with check (governance.can_read_pricing());

create policy pricing_rule_sets_update
on pricing.rule_sets
for update
using (governance.can_read_pricing())
with check (governance.can_read_pricing());

create policy pricing_calculations_select
on pricing.calculations
for select
using (governance.can_read_pricing());

create policy pricing_calculations_insert
on pricing.calculations
for insert
with check (governance.can_read_pricing());

create policy pricing_calculations_update
on pricing.calculations
for update
using (governance.can_read_pricing())
with check (governance.can_read_pricing());

-- ============================================================
-- ROUTING POLICIES
-- ============================================================

create policy routing_route_registry_select
on routing.route_registry
for select
using (governance.can_read_routing_admin());

create policy routing_route_registry_insert
on routing.route_registry
for insert
with check (governance.can_read_routing_admin());

create policy routing_route_registry_update
on routing.route_registry
for update
using (governance.can_read_routing_admin())
with check (governance.can_read_routing_admin());

create policy routing_menu_nodes_select
on routing.menu_nodes
for select
using (governance.can_read_routing_admin());

create policy routing_menu_nodes_insert
on routing.menu_nodes
for insert
with check (governance.can_read_routing_admin());

create policy routing_menu_nodes_update
on routing.menu_nodes
for update
using (governance.can_read_routing_admin())
with check (governance.can_read_routing_admin());

create policy routing_route_permission_map_select
on routing.route_permission_map
for select
using (governance.can_read_routing_admin());

create policy routing_route_permission_map_insert
on routing.route_permission_map
for insert
with check (governance.can_read_routing_admin());

create policy routing_route_permission_map_update
on routing.route_permission_map
for update
using (governance.can_read_routing_admin())
with check (governance.can_read_routing_admin());

-- ============================================================
-- DOCUMENT INTELLIGENCE POLICIES
-- ============================================================

create policy documents_ocr_runs_select
on documents.ocr_runs
for select
using (governance.can_read_document_intelligence());

create policy documents_ocr_runs_insert
on documents.ocr_runs
for insert
with check (governance.can_read_document_intelligence());

create policy documents_ocr_runs_update
on documents.ocr_runs
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_classification_runs_select
on documents.classification_runs
for select
using (governance.can_read_document_intelligence());

create policy documents_classification_runs_insert
on documents.classification_runs
for insert
with check (governance.can_read_document_intelligence());

create policy documents_classification_runs_update
on documents.classification_runs
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_extraction_runs_select
on documents.extraction_runs
for select
using (governance.can_read_document_intelligence());

create policy documents_extraction_runs_insert
on documents.extraction_runs
for insert
with check (governance.can_read_document_intelligence());

create policy documents_extraction_runs_update
on documents.extraction_runs
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_document_chunks_select
on documents.document_chunks
for select
using (governance.can_read_document_intelligence());

create policy documents_document_chunks_insert
on documents.document_chunks
for insert
with check (governance.can_read_document_intelligence());

create policy documents_document_chunks_update
on documents.document_chunks
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_entity_extractions_select
on documents.entity_extractions
for select
using (governance.can_read_document_intelligence());

create policy documents_entity_extractions_insert
on documents.entity_extractions
for insert
with check (governance.can_read_document_intelligence());

create policy documents_entity_extractions_update
on documents.entity_extractions
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_document_relations_select
on documents.document_relations
for select
using (governance.can_read_document_intelligence());

create policy documents_document_relations_insert
on documents.document_relations
for insert
with check (governance.can_read_document_intelligence());

create policy documents_document_relations_update
on documents.document_relations
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());

create policy documents_knowledge_cards_select
on documents.knowledge_cards
for select
using (governance.can_read_document_intelligence());

create policy documents_knowledge_cards_insert
on documents.knowledge_cards
for insert
with check (governance.can_read_document_intelligence());

create policy documents_knowledge_cards_update
on documents.knowledge_cards
for update
using (governance.can_read_document_intelligence())
with check (governance.can_read_document_intelligence());
