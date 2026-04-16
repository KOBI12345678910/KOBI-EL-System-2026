-- 034_routing_and_ai_rpcs.sql
-- RPCs for routing sync, document intelligence, AI agent console

create or replace function routing.get_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = routing, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'routes_count', coalesce((select count(*) from routing.route_registry), 0),
    'menu_nodes_count', coalesce((select count(*) from routing.menu_nodes), 0),
    'permission_links_count', coalesce((select count(*) from routing.route_permission_map), 0)
  ) into v_payload;
  return v_payload;
end;
$$;

create or replace function routing.run_full_route_menu_permission_sync()
returns jsonb
language plpgsql
security definer
set search_path = routing, governance, public
as $$
declare
  v_route_count integer := 0;
  v_menu_count integer := 0;
  v_perm_count integer := 0;
begin
  insert into routing.route_registry (route_key, route_path, route_title, component_name, required_permission, icon_name, active, sort_order)
  values
    ('executive_control_tower', '/executive', 'Executive Control Tower', 'ExecutiveControlTower', 'control_room.executive', 'LayoutDashboard', true, 10),
    ('operations_control_room', '/operations', 'Operations Control Room', 'OperationsControlRoom', 'control_room.operations', 'Factory', true, 20),
    ('procurement_control_room', '/procurement', 'Procurement Control Room', 'ProcurementControlRoom', 'control_room.procurement', 'Truck', true, 30),
    ('workforce_control_room', '/workforce', 'Workforce Control Room', 'WorkforceControlRoom', 'control_room.workforce', 'Users', true, 40),
    ('finance_control_room', '/finance', 'Finance Control Room', 'FinanceControlRoom', 'finance.read', 'Wallet', true, 50),
    ('ai_control_room', '/ai-control', 'AI Control Room', 'AIControlRoom', 'control_room.executive', 'Bot', true, 60),
    ('command_center', '/command-center', 'Command Center', 'CommandCenter', 'control_room.executive', 'Command', true, 70),
    ('notification_center', '/notification-center', 'Notification Center', 'NotificationCenter', 'control_room.executive', 'Bell', true, 80),
    ('universal_inbox', '/universal-inbox', 'Universal Inbox', 'UniversalInbox', 'control_room.executive', 'Inbox', true, 90),
    ('kpi_engine', '/kpi-engine', 'KPI Engine', 'KPIEngine', 'control_room.executive', 'Activity', true, 100),
    ('alert_rules_center', '/alert-rules', 'Alert Rules Center', 'AlertRulesCenter', 'control_room.executive', 'AlertTriangle', true, 110),
    ('document_intelligence_center', '/document-intelligence', 'Document Intelligence Center', 'DocumentIntelligenceCenter', 'control_room.executive', 'FileText', true, 120),
    ('advanced_ai_agent_console', '/ai-agents', 'Advanced AI Agent Console', 'AdvancedAIAgentConsole', 'control_room.executive', 'Cpu', true, 130),
    ('formula_builder', '/formula-builder', 'Formula Builder', 'FormulaBuilder', 'control_room.executive', 'FunctionSquare', true, 140),
    ('mobile_executive_shell', '/mobile-executive', 'Mobile Executive Shell', 'MobileExecutiveShell', 'control_room.executive', 'Smartphone', true, 150)
  on conflict (route_key) do update set
    route_path = excluded.route_path, route_title = excluded.route_title, component_name = excluded.component_name,
    required_permission = excluded.required_permission, icon_name = excluded.icon_name, active = excluded.active,
    sort_order = excluded.sort_order, updated_at = now();

  select count(*) into v_route_count from routing.route_registry;

  insert into routing.menu_nodes (menu_code, label, route_registry_id, parent_node_id, required_permission, icon_name, sort_order, active)
  select 'main', rr.route_title, rr.id, null, rr.required_permission, rr.icon_name, rr.sort_order, rr.active
  from routing.route_registry rr where rr.active = true
  on conflict (menu_code, label, parent_node_id) do update set
    route_registry_id = excluded.route_registry_id, required_permission = excluded.required_permission,
    icon_name = excluded.icon_name, sort_order = excluded.sort_order, active = excluded.active;

  select count(*) into v_menu_count from routing.menu_nodes;

  insert into routing.route_permission_map (route_registry_id, permission_code)
  select rr.id, rr.required_permission from routing.route_registry rr where rr.required_permission is not null
  on conflict (route_registry_id, permission_code) do nothing;

  select count(*) into v_perm_count from routing.route_permission_map;

  return jsonb_build_object('routes_count', v_route_count, 'menu_nodes_count', v_menu_count, 'permission_links_count', v_perm_count);
end;
$$;

create or replace function analytics.get_document_intelligence_center_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, docs, documents, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin() and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select d.id, d.document_number, d.filename, d.document_type, d.classification_status, d.ocr_status, d.created_at from docs.documents d order by d.created_at desc limit 100) x),
    'ocr_runs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, run_number, document_id, engine_name, state, started_at, finished_at from documents.ocr_runs order by created_at desc limit 100) x),
    'classification_runs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, run_number, document_id, predicted_class, confidence_score, state from documents.classification_runs order by created_at desc limit 100) x),
    'extraction_runs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, run_number, document_id, extractor_name, state from documents.extraction_runs order by created_at desc limit 100) x),
    'knowledge_cards', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, card_number, document_id, title, summary_text, classification, confidence_score, published from documents.knowledge_cards order by created_at desc limit 100) x)
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function analytics.get_advanced_ai_agent_console_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin() and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'agents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select id, agent_code, agent_name, status, last_heartbeat_at, config_payload from intelligence.agent_registry order by agent_code) x),
    'jobs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select aj.id, aj.agent_id, ar.agent_name, aj.job_type, aj.state, aj.created_at, aj.started_at, aj.finished_at, aj.error_message from intelligence.agent_jobs aj left join intelligence.agent_registry ar on ar.id = aj.agent_id order by aj.created_at desc limit 200) x)
  ) into v_payload;

  return v_payload;
end;
$$;
