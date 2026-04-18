-- ============================================================
-- FILE: supabase/migrations/038_enterprise_seed_data.sql
-- ENTERPRISE SEED DATA
-- ============================================================

insert into crm.leads (
  lead_number, source_channel, full_name, company_name, phone, email, city, lead_status, score, estimated_value
)
values
  ('LEAD-2026-0001', 'website', 'Avi Cohen', 'Cohen Villas', '050-1111111', 'avi@example.com', 'Tel Aviv', 'Qualified', 81.5, 120000),
  ('LEAD-2026-0002', 'whatsapp', 'Dana Levi', 'Levi Projects', '050-2222222', 'dana@example.com', 'Haifa', 'New', 66.2, 75000)
on conflict (lead_number) do nothing;

insert into crm.opportunities (
  opportunity_number, lead_id, stage, probability_percent, expected_close_date, opportunity_value, state
)
select
  'OPP-2026-0001',
  l.id,
  'Proposal',
  65,
  current_date + 21,
  120000,
  'Open'
from crm.leads l
where l.lead_number = 'LEAD-2026-0001'
on conflict (opportunity_number) do nothing;

insert into service.tickets (
  ticket_number, title, description, severity, priority, state
)
values
  ('TCK-2026-0001', 'Gate motor issue', 'Customer reports motor intermittently stops', 'high', 'high', 'Open'),
  ('TCK-2026-0002', 'Glass alignment request', 'Need alignment check after installation', 'medium', 'normal', 'Open')
on conflict (ticket_number) do nothing;

insert into quality.inspection_plans (
  plan_code, plan_name, scope_type, checklist_payload, active, version
)
values
  ('QPLAN-WO-CLOSE', 'Work Order Closing QA', 'WorkOrder', '[{"code":"visual_finish"},{"code":"dimensions"},{"code":"signoff"}]'::jsonb, true, 1)
on conflict (plan_code) do nothing;

insert into compliance.policies (
  policy_code, policy_name, category, policy_text, active, effective_from, version
)
values
  ('POL-SEC-001', 'Security Policy', 'security', 'Standard internal security policy', true, current_date, 1),
  ('POL-HR-001', 'Employee Conduct Policy', 'hr', 'Employee conduct and workplace expectations', true, current_date, 1)
on conflict (policy_code) do nothing;

insert into treasury.bank_accounts (
  account_number_masked, bank_name, branch_name, currency, account_type, current_balance, active, owner_company_name
)
values
  ('***1234', 'Bank Leumi', 'Ramat Gan', 'ILS', 'checking', 850000, true, 'Techno Kol Uzi Ltd')
on conflict do nothing;

insert into planning.capacity_calendars (
  calendar_code, calendar_name, work_center_code, capacity_unit, active
)
values
  ('CAP-FAB-001', 'Fabrication Main Calendar', 'FAB_MAIN', 'hours', true),
  ('CAP-INST-001', 'Installation Main Calendar', 'INST_MAIN', 'hours', true)
on conflict (calendar_code) do nothing;

insert into maintenance.assets (
  asset_number, asset_name, asset_type, serial_number, location_name, operational_status, criticality
)
values
  ('AST-2026-0001', 'Laser Cutter A', 'machine', 'LZR-0001', 'Factory Floor 1', 'Active', 'high'),
  ('AST-2026-0002', 'Powder Coating Oven', 'machine', 'OVN-0001', 'Factory Floor 2', 'Active', 'high')
on conflict (asset_number) do nothing;

insert into pricing.rule_sets (
  ruleset_code, ruleset_name, category, active, version, rules_payload
)
values
  ('PRICE-BASE-001', 'Base Pricing Rules', 'projects', true, 1, '[{"type":"markup","value":0.22},{"type":"discount_limit","value":0.10}]'::jsonb)
on conflict (ruleset_code) do nothing;

insert into routing.route_registry (
  route_key, route_path, route_title, component_name, required_permission, icon_name, active, sort_order
)
values
  ('crm_leads', '/crm/leads', 'CRM Leads', 'CRMLeadsPage', 'customers.read', 'ContactRound', true, 200),
  ('service_tickets', '/service/tickets', 'Service Tickets', 'ServiceTicketsPage', 'projects.read', 'Wrench', true, 210),
  ('document_intelligence_center', '/document-intelligence', 'Document Intelligence Center', 'DocumentIntelligenceCenter', 'control_room.executive', 'FileText', true, 220)
on conflict (route_key) do nothing;
