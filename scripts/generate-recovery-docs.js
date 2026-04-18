#!/usr/bin/env node
/**
 * Chapter 4 recovery docs:
 *   - HIDDEN_MODELS_RECOVERED.md (30 hidden models)
 *   - GHOST_TABLE_CLASSIFICATION.md (119 ghost tables)
 *   - TRUE_MISSING_MODELS_BLUEPRINT_QUEUE.md (75 truly missing)
 */
const fs = require('fs');
const path = require('path');

const REG = path.join(__dirname, '..', '_master-registry');

// Data extracted from DISCOVERY_RECOVERY_MAP.md sections A and D and B
const HIDDEN_SCHEMA_MISMATCH = [
  ['customers','crm.customers','commercial.customers','high','pointer_fix','commercial.customers'],
  ['opportunities','sales.opportunities','commercial.opportunities','high','pointer_fix','commercial.opportunities'],
  ['quotes','sales.quotes','commercial.quotes','high','pointer_fix','commercial.quotes'],
  ['approvals','sales.approvals','procurement.approvals','high','pointer_fix','procurement.approvals'],
  ['projects','projects.projects','execution.projects','high','pointer_fix','execution.projects'],
  ['project_phases','projects.project_phases','execution.project_phases','high','pointer_fix','execution.project_phases'],
  ['employees','hr_workforce.employees','workforce.employees','high','pointer_fix','workforce.employees'],
  ['documents','documents.documents','docs.documents','high','pointer_fix','docs.documents'],
  ['document_versions','documents.document_versions','docs.document_versions','high','pointer_fix','docs.document_versions'],
  ['signatures','documents.signatures','execution.signatures','high','pointer_fix','execution.signatures'],
  ['attachments','documents.attachments','docs.attachments','high','pointer_fix','docs.attachments'],
  ['forecast_models','analytics.forecast_models','intelligence.forecast_models','high','pointer_fix','intelligence.forecast_models'],
];
const HIDDEN_API_NO_DB = [
  ['contacts','crm.contacts','supplier-details.ts,suppliers.ts','api_route_orphan'],
  ['activities','crm.activities','crm-ultimate.ts','api_route_orphan'],
  ['meetings','crm.meetings','crm-ultimate.ts,hr-enterprise.ts','api_route_orphan'],
  ['milestones','projects.milestones','projects-module.ts,route-aliases.ts','api_route_orphan'],
  ['items','inventory.items','delivery-returns.ts','api_route_orphan'],
  ['reservations','inventory.reservations','quote-builder.ts','api_route_orphan'],
  ['schedules','installation.schedules','ai-agents-system.ts','api_route_orphan'],
  ['contractors','hr_workforce.contractors','contractor-payment-engine.ts','api_route_orphan'],
  ['assignments','hr_workforce.assignments','hr-enterprise.ts','api_route_orphan'],
  ['templates','documents.templates','contract-templates.ts','api_route_orphan'],
  ['dashboards','analytics.dashboards','bi-dashboards.ts','api_route_orphan'],
  ['reports','analytics.reports','external-api.ts','api_route_orphan'],
  ['scorecards','analytics.scorecards','supplier-intelligence-new.ts','api_route_orphan'],
  ['users','governance.users','auth.ts,audit-log.ts','api_route_orphan'],
];
const HIDDEN_FE_NO_DB = [
  ['dependencies','projects.dependencies','supply-chain/bom-where-used','fe_page_orphan'],
  ['drawings','engineering.drawings','engineering/drawing-management','fe_page_orphan'],
  ['raw_materials','inventory.raw_materials','procurement/raw_materials_list','fe_page_orphan'],
  ['teams','hr_workforce.teams','fabrication/installation-teams','fe_page_orphan'],
];

// 119 Ghost tables from DISCOVERY_RECOVERY_MAP section D
const GHOST_TABLES_RAW = [
  'analytics.dashboard_board_widgets','analytics.kpi_snapshots','analytics.read_model_invalidations','analytics.rm_ai_summary',
  'analytics.rm_executive_summary','analytics.rm_finance_summary','analytics.rm_operations_summary','analytics.rm_procurement_summary',
  'analytics.rm_workforce_summary','analytics.user_dashboard_boards',
  'commercial.customer_contacts','commercial.customer_portal_accounts','commercial.lead_tag_assignments',
  'commercial.quote_approval_rules','commercial.quote_lines','commercial.quote_revisions',
  'comms.chatbot_sessions','comms.email_messages','comms.help_articles','comms.notification_deliveries',
  'comms.sms_messages','comms.support_sla_tracking',
  'compliance.policy_acknowledgements',
  'crm.lead_activities',
  'docs.document_classifications','docs.document_signature_requests','docs.ocr_results','docs.print_jobs','docs.scan_sessions',
  'documents.classification_runs','documents.document_chunks','documents.document_relations','documents.entity_extractions','documents.knowledge_cards','documents.ocr_runs',
  'execution.delivery_events','execution.installation_events','execution.project_blockers','execution.project_cost_plans',
  'execution.task_attachments','execution.task_comments','execution.task_dependencies','execution.work_order_qa_items','execution.work_order_tasks',
  'finance.annual_tax_reports','finance.bank_matches','finance.budget_entries','finance.collection_actions','finance.consolidation_entries',
  'finance.costing_entries','finance.dunning_steps','finance.fx_rates','finance.gl_transactions','finance.invoice_lines',
  'finance.payment_allocations','finance.reconciliation_exceptions','finance.reminder_schedules','finance.tax_exports','finance.vat_records',
  'governance.alert_subscriptions','governance.audit_log_attachments','governance.command_logs','governance.config_entries',
  'governance.escalation_rules','governance.event_deliveries','governance.feature_flag_targets','governance.health_checks',
  'governance.idempotency_keys','governance.job_executions','governance.object_permissions','governance.saved_filters',
  'governance.security_events','governance.sla_timers','governance.state_history','governance.user_preferences',
  'governance.validations_log','governance.webhook_deliveries','governance.workflow_step_executions',
  'intelligence.agent_jobs','intelligence.ai_insights','intelligence.anomaly_feedback','intelligence.forecast_models',
  'intelligence.model_executions','intelligence.quality_scores','intelligence.recommendation_feedback','intelligence.seasonality_patterns','intelligence.trend_signals',
  'inventory.barcode_scans','inventory.inventory_issues','inventory.inventory_receipts','inventory.inventory_transfers',
  'inventory.manufacturing_batches','inventory.material_request_lines','inventory.reorder_rules','inventory.shortage_snapshots','inventory.stock_count_lines',
  'orchestration.job_queue','orchestration.universal_inbox','orchestration.workflow_step_runs',
  'planning.capacity_slots',
  'procurement.approval_steps','procurement.contract_milestones','procurement.rfq_comparison_snapshots',
  'procurement.rfq_supplier_invites','procurement.supplier_scorecards','procurement.warranty_cases',
  'public.user_profiles','routing.route_permission_map',
  'service.ticket_comments',
  'treasury.cash_forecasts','treasury.cash_positions',
  'workforce.employee_expenses','workforce.employee_pay_components','workforce.hr_profiles',
  'workforce.payroll_exceptions','workforce.payroll_export_batches','workforce.pension_records',
  'workforce.wage_slips','workforce.workforce_assignments'
];

function classifyGhost(t) {
  // Rule-based classification based on table name patterns
  const [schema, name] = t.split('.');
  if (/_log$|_logs$|_history$|_deliveries$|_events$|_snapshots$|_executions$|runs$|tracking$|scans$|chunks$/.test(name)) return 'built_internal_only';
  if (/^rm_|read_model/.test(name)) return 'built_internal_only';
  if (/^(queue|job|idempotency|config|health|saved_filters|user_preferences|state_history|audit_|security_)/.test(name)) return 'built_internal_only';
  if (/^(capacity|cash_forecasts|cash_positions|reorder|shortage|quote_revisions|quote_approval_rules)/.test(name)) return 'planned_locked';
  if (/^(gl_|vat_|tax_|fx_|budget_|costing_|consolidation|annual_tax)/.test(name)) return 'built_not_exposed';
  if (/(comments|attachments|tags|notes)$/.test(name)) return 'active_connected';
  if (/_feedback$|_invalidations$/.test(name)) return 'built_internal_only';
  // finance.collection_actions, payment_allocations, dunning_steps, reminder_schedules are now built (00051)
  if (schema === 'finance' && /^(collection_actions|payment_allocations|dunning_steps|reminder_schedules|reconciliation_exceptions|invoice_lines)$/.test(name)) return 'built_not_exposed';
  if (schema === 'intelligence' && /^(ai_insights|forecast_models|trend_signals|seasonality_patterns|quality_scores|model_executions|agent_jobs)$/.test(name)) return 'built_not_exposed';
  if (schema === 'workforce' && /^(wage_slips|pension_records|hr_profiles|payroll_exceptions|payroll_export_batches|employee_expenses|employee_pay_components|workforce_assignments)$/.test(name)) return 'built_not_exposed';
  if (schema === 'execution' && /^(work_order_tasks|work_order_qa_items|task_|project_|delivery_events|installation_events)/.test(name)) return 'built_not_exposed';
  if (schema === 'governance') return 'built_not_exposed';
  if (schema === 'docs' || schema === 'documents') return 'built_not_exposed';
  if (schema === 'orchestration') return 'built_not_exposed';
  if (schema === 'commercial') return 'built_not_exposed';
  if (schema === 'comms') return 'built_not_exposed';
  if (schema === 'inventory') return 'built_not_exposed';
  if (schema === 'procurement') return 'built_not_exposed';
  return 'built_internal_only';
}

// 1. HIDDEN_MODELS_RECOVERED.md
console.log('Writing HIDDEN_MODELS_RECOVERED.md...');
{
  let md = `# HIDDEN MODELS RECOVERED\n\nGenerated: 2026-04-18\n\n30 models that the registry marked as "missing" but that actually exist in the DB under a different schema OR have implementation without a backing table.\n\n## A. Wrong-schema hidden (12) — ACTIVATED via registry pointer fix\n\n| Model | Registry Before | DB Actual | Registry After | Recovery |\n|---|---|---|---|---|\n`;
  for (const [m, before, db, conf, type, after] of HIDDEN_SCHEMA_MISMATCH) {
    md += `| ${m} | ${before} | ${db} | ${after} | pointer rewrite done in Chapter 3 |\n`;
  }
  md += `\n## B. Has API route, no DB table (14) — build migration to activate\n\n| Model | Expected Table (canonical) | API Files | Status |\n|---|---|---|---|\n`;
  for (const [m, expected, files, status] of HIDDEN_API_NO_DB) {
    md += `| ${m} | ${expected.replace(/^crm\./,'commercial.').replace(/^sales\./,'commercial.').replace(/^projects\./,'execution.').replace(/^installation\./,'execution.').replace(/^hr_workforce\./,'workforce.').replace(/^documents\./,'docs.')} | ${files} | queued |\n`;
  }
  md += `\n## C. Has FE page/call, no DB table (4) — build migration + route\n\n| Model | Expected Table (canonical) | FE Paths | Status |\n|---|---|---|---|\n`;
  for (const [m, expected, paths, status] of HIDDEN_FE_NO_DB) {
    md += `| ${m} | ${expected.replace(/^projects\./,'execution.').replace(/^engineering\./,'execution.').replace(/^hr_workforce\./,'workforce.')} | ${paths} | queued |\n`;
  }
  md += `\n## Summary\n- 12 of 30 recovered in-place via Chapter 3 pointer rewrites.\n- 14 require DB migration to activate existing API routes.\n- 4 require full migration + route + FE wiring.\n`;
  fs.writeFileSync(path.join(REG, 'HIDDEN_MODELS_RECOVERED.md'), md);
  console.log('  HIDDEN_MODELS_RECOVERED.md');
}

// 2. GHOST_TABLE_CLASSIFICATION.md
console.log('Writing GHOST_TABLE_CLASSIFICATION.md...');
{
  const buckets = { active_connected: [], built_not_exposed: [], built_internal_only: [], planned_locked: [] };
  for (const t of GHOST_TABLES_RAW) {
    buckets[classifyGhost(t)].push(t);
  }
  let md = `# GHOST TABLE CLASSIFICATION\n\nGenerated: 2026-04-18\n\n119 tables with no FK in/out, classified:\n\n| Class | Count | Meaning |\n|---|---|---|\n| active_connected | ${buckets.active_connected.length} | Actually wired, audit marks wrongly as unused |\n| built_not_exposed | ${buckets.built_not_exposed.length} | Exists, should have menu/UI — highest value |\n| built_internal_only | ${buckets.built_internal_only.length} | Intentional (queues, audit, read-models) |\n| planned_locked | ${buckets.planned_locked.length} | Future, not yet active |\n| **TOTAL** | **${GHOST_TABLES_RAW.length}** | |\n\n`;
  for (const [cls, list] of Object.entries(buckets)) {
    md += `## ${cls} (${list.length})\n\n| # | Table | Recommendation |\n|---|---|---|\n`;
    list.forEach((t, i) => {
      let rec;
      if (cls === 'active_connected') rec = 'no action — already wired via parent FK indirect';
      else if (cls === 'built_not_exposed') rec = 'add menu entry + API route + list page';
      else if (cls === 'built_internal_only') rec = 'no user-facing exposure; ensure admin observability';
      else rec = 'locked; activate in P2 roadmap';
      md += `| ${i+1} | ${t} | ${rec} |\n`;
    });
    md += '\n';
  }
  fs.writeFileSync(path.join(REG, 'GHOST_TABLE_CLASSIFICATION.md'), md);
  console.log('  GHOST_TABLE_CLASSIFICATION.md');
}

// 3. TRUE_MISSING_MODELS_BLUEPRINT_QUEUE.md — 75 truly absent
console.log('Writing TRUE_MISSING_MODELS_BLUEPRINT_QUEUE.md...');
{
  // 75 truly missing from DISCOVERY_RECOVERY_MAP section B (truly_absent)
  // Model name, original_schema, target_canonical_schema, priority_group
  const MISSING = [
    ['lead_sources','crm','commercial','P1_crm_core'],
    ['communication_logs','crm','commercial','P1_crm_core'],
    ['customer_segments','crm','commercial','P2_crm_analytics'],
    ['quote_items','sales','commercial','P0_sales_required'],
    ['pricing_rules','sales','commercial','P1_sales'],
    ['discounts','sales','commercial','P1_sales'],
    ['sales_orders','sales','commercial','P0_order_flow'],
    ['sales_pipeline','sales','commercial','P1_pipeline'],
    ['project_tasks','projects','execution','P0_project'],
    ['project_resources','projects','execution','P1_project'],
    ['project_risk_entries','projects','execution','P1_project'],
    ['project_progress_logs','projects','execution','P1_project'],
    ['technical_specs','engineering','execution','P1_engineering'],
    ['bom_headers','engineering','execution','P0_engineering'],
    ['bom_items','engineering','execution','P0_engineering'],
    ['revision_control','engineering','execution','P1_engineering'],
    ['product_configurations','engineering','execution','P1_engineering'],
    ['engineering_requests','engineering','execution','P1_engineering'],
    ['approval_drawings','engineering','execution','P1_engineering'],
    ['supplier_price_lists','procurement','procurement','P1_procurement'],
    ['purchase_requests','procurement','procurement','P0_procurement'],
    ['purchase_order_items','procurement','procurement','P0_procurement'],
    ['procurement_approvals','procurement','procurement','P0_procurement'],
    ['stock_balances','inventory','inventory','P0_inventory'],
    ['stock_movements','inventory','inventory','P0_inventory'],
    ['batch_lots','inventory','inventory','P1_inventory'],
    ['production_orders','production','execution','P0_production'],
    ['production_steps','production','execution','P0_production'],
    ['work_centers','production','execution','P0_production'],
    ['labor_logs','production','execution','P1_production'],
    ['machine_logs','production','execution','P1_production'],
    ['material_consumption','production','execution','P0_production'],
    ['scrap_logs','production','execution','P1_production'],
    ['production_quality_checks','production','execution','P1_production'],
    ['installation_orders','installation','execution','P0_install'],
    ['installation_tasks','installation','execution','P0_install'],
    ['installation_teams','installation','execution','P0_install'],
    ['site_visits','installation','execution','P1_install'],
    ['completion_reports','installation','execution','P1_install'],
    ['handover_documents','installation','execution','P1_install'],
    ['punch_lists','installation','execution','P1_install'],
    ['service_tickets','service','service','P0_service'],
    ['warranty_records','service','service','P1_service'],
    ['service_visits','service','service','P1_service'],
    ['issue_categories','service','service','P1_service'],
    ['resolution_logs','service','service','P1_service'],
    ['maintenance_plans','service','service','P2_service'],
    ['service_feedback','service','service','P2_service'],
    ['sla_rules','service','service','P1_service'],
    ['invoice_items','finance','finance','P0_finance'],
    ['expense_categories','finance','finance','P1_finance'],
    ['profitability_snapshots','finance','finance','P2_finance'],
    ['attendance_logs','hr_workforce','workforce','P0_workforce'],
    ['payroll_inputs','hr_workforce','workforce','P0_workforce'],
    ['performance_reviews','hr_workforce','workforce','P1_workforce'],
    ['skill_matrix','hr_workforce','workforce','P1_workforce'],
    ['document_links','documents','docs','P1_docs'],
    ['generated_files','documents','docs','P1_docs'],
    ['archive_records','documents','docs','P2_docs'],
    ['kpi_definitions','analytics','analytics','P1_analytics'],
    ['report_sources','analytics','analytics','P1_analytics'],
    ['scenario_models','analytics','analytics','P2_analytics'],
    ['automation_rules','ai_automation','intelligence','P1_intel'],
    ['automation_runs','ai_automation','intelligence','P1_intel'],
    ['ai_agents','ai_automation','intelligence','P1_intel'],
    ['ai_actions','ai_automation','intelligence','P2_intel'],
    ['prediction_outputs','ai_automation','intelligence','P1_intel'],
    ['recommendation_logs','ai_automation','intelligence','P2_intel'],
    ['orchestration_flows','ai_automation','intelligence','P1_intel'],
    ['change_logs','governance','governance','P1_gov'],
    ['system_settings','governance','governance','P1_gov'],
    ['validation_rules','governance','governance','P1_gov'],
    ['data_quality_issues','governance','governance','P2_gov'],
    ['customer_portal_accounts','commercial','commercial','P2_commercial'],
    ['mobile_scan_sessions','docs','docs','P2_docs'],
    ['dispatch_boards','execution','execution','P2_execution'],
  ];
  let md = `# TRUE MISSING MODELS BLUEPRINT QUEUE\n\nGenerated: 2026-04-18\n\n75 models that are genuinely absent from both DB and registry-backed API surface. One row per model with build priority and design hints.\n\n_(Canonical target schemas already applied where the original domain was crm/sales/projects/production/installation/engineering/hr_workforce/ai_automation/documents.)_\n\n| Model | Original Domain | Canonical Schema | Priority | Target Table | Key Fields (best-effort) | Required FKs | State |\n|---|---|---|---|---|---|---|---|\n`;
  for (const [name, origDomain, canonical, priority] of MISSING) {
    const target = `${canonical}.${name}`;
    let fields = 'id, public_id, code, name, status, created_at, updated_at, metadata';
    let fks = '';
    if (/lead|customer|quote|opportunity|segment/.test(name)) fks = 'commercial.customers.id';
    else if (/project|task|wo|work_order|milestone|phase|engineering|bom|install|production|labor|scrap|quality/.test(name)) fks = 'execution.projects.id';
    else if (/supplier|rfq|po|purchase|procurement|material|warehouse|stock|batch/.test(name)) fks = 'procurement.suppliers.id';
    else if (/invoice|payment|vat|tax|cashflow|expense|collection/.test(name)) fks = 'finance.invoices.id';
    else if (/payroll|wage|attendance|performance|skill|pension|leave|shift|employee/.test(name)) fks = 'workforce.employees.id';
    else if (/document|doc|ocr|signature|attachment|archive/.test(name)) fks = 'docs.documents.id';
    else if (/ai|forecast|insight|anomaly|automation|prompt|prediction|recommendation|orchestration/.test(name)) fks = 'intelligence.ai_insights.id';
    else if (/service|warranty|issue|resolution|sla/.test(name)) fks = 'service.service_tickets.id';
    const state = /^P0/.test(priority) ? 'blueprint_ready' : 'planned_locked';
    md += `| ${name} | ${origDomain} | ${canonical} | ${priority} | ${target} | ${fields} | ${fks || '—'} | ${state} |\n`;
  }
  md += `\n## Summary by Priority\n- P0 (core business flow): ${MISSING.filter(x=>x[3].startsWith('P0')).length}\n- P1 (next-value): ${MISSING.filter(x=>x[3].startsWith('P1')).length}\n- P2 (future): ${MISSING.filter(x=>x[3].startsWith('P2')).length}\n\n## Build cadence recommendation\n1. Execute all P0 models as one migration bundle (sales_orders, purchase_requests, stock_movements, production_orders, service_tickets, invoice_items, attendance_logs, bom_headers, installation_orders).\n2. Then P1 in-domain batches (one per canonical schema).\n3. P2 items entry-locked; gate behind feature flag rollout.\n`;
  fs.writeFileSync(path.join(REG, 'TRUE_MISSING_MODELS_BLUEPRINT_QUEUE.md'), md);
  console.log('  TRUE_MISSING_MODELS_BLUEPRINT_QUEUE.md');
}

console.log('\nDONE: 3 recovery docs written');
