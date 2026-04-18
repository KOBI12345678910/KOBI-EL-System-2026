const fs = require('fs');
const cat = JSON.parse(fs.readFileSync('_audit_tmp/_categorized.json', 'utf8'));
const hidden12 = JSON.parse(fs.readFileSync('_audit_tmp/_hidden.json', 'utf8'));
const dead = JSON.parse(fs.readFileSync('_audit_tmp/_orphans_dead_v3.json', 'utf8'));
const cross = JSON.parse(fs.readFileSync('_audit_tmp/_cross.json', 'utf8'));
const db = JSON.parse(fs.readFileSync('_audit_tmp/_scan_db.json', 'utf8'));

const hidApi = cat.filter(c => c.category === 'has_api_route_no_db');
const hidFe = cat.filter(c => c.category === 'has_fe_call_no_db');
const truly = cat.filter(c => c.category === 'truly_absent');

const total_hidden = hidden12.length + hidApi.length + hidFe.length;
const total_truly = truly.length;
const total_registry_missing = 105;
const hiddenPct = Math.round(total_hidden / total_registry_missing * 100);
const trulyPct = 100 - hiddenPct;

let md = '';
md += '# Discovery + Recovery Mapping\n';
md += 'Generated: ' + new Date().toISOString() + '\n';
md += 'Method: pure read-only scan of C:\\Users\\kobi\\Projects\\techno-kol-uzi-2026, zero modifications\n\n';

md += '## Executive Summary\n';
md += '- total_registry_models: 342 (from _master-registry/models_registry.json)\n';
md += '- total_db_tables: ' + db.tables.length + ' (from supabase/migrations/*.sql)\n';
md += '- total_db_views: ' + db.views.length + '\n';
md += '- total_db_functions (RPCs): ' + db.funcs.length + '\n';
md += '- total_fk_references: ' + db.fks.length + '\n';
md += '- total_hidden_models_found: ' + total_hidden + '\n';
md += '- total_registry_missing_models: ' + total_registry_missing + '\n';
md += '- total_duplicates: ' + cross.dupes.length + '\n';
md += '- total_schema_mismatches: ' + cross.schemaMismatches.length + '\n';
md += '- total_dead_orphan_tables: ' + dead.length + '\n';
md += '- total_unused_rpc_functions: 127 (of 128 created — literal-name strings never referenced in api-server source; may be called via migrations or dynamic RPC names)\n';
md += '- total_unmounted_route_files: 3 (dashboard, fin-router, saved-places)\n';
md += '- **How much of "missing" is actually hidden-but-existing: ' + hiddenPct + '%**\n';
md += '- **How much is truly absent: ' + trulyPct + '%**\n\n';

md += '## The Hypothesis Answer\n';
md += 'The user was **partially right**. Of 105 registry models with no matching DB table, ' + total_hidden + ' (' + hiddenPct + '%) physically exist in the repo — ';
md += '12 as tables in the wrong schema, ' + hidApi.length + ' as implemented API routes without a backing table, ';
md += 'and ' + hidFe.length + ' as front-end API calls without a backing table. The remaining ' + total_truly + ' (' + trulyPct + '%) are truly absent.\n\n';
md += 'However, the bigger discovery is the **119 dead orphan tables** that exist in the DB and registry but have no FK-in and are not referenced in API SQL — the inverse problem: data structures exist but are disconnected from the working system. ';
md += 'Combining both directions, roughly half of the registry surface area is shadow infrastructure (present but unwired). ';
md += 'The user\'s hypothesis was right in spirit: a meaningful share of "missing" models are hiding in plain sight. But 75 of 105 missing registry entries (71%) still need to be built from scratch.\n\n';

md += '## Top 20 Recovery Wins\n\n';
md += '| # | entity | where found | what is missing | complexity |\n';
md += '|---|---|---|---|---|\n';
const wins = [
  ['customers', 'commercial.customers, public.customers (DB)', 'registry says crm.customers — fix registry reference', 'low'],
  ['opportunities', 'commercial.opportunities, crm.opportunities (DB)', 'registry says sales.opportunities — pick canonical schema', 'low'],
  ['quotes', 'commercial.quotes (DB)', 'registry says sales.quotes — update table_name', 'low'],
  ['approvals', 'procurement.approvals (DB)', 'registry says sales.approvals — rename registry pointer', 'low'],
  ['projects', 'execution.projects (DB)', 'registry says projects.projects — update schema', 'low'],
  ['project_phases', 'execution.project_phases (DB)', 'registry says projects.project_phases — fix schema', 'low'],
  ['employees', 'workforce.employees, public.employees (DB)', 'registry says hr_workforce.employees — collapse duplicate', 'low'],
  ['documents', 'docs.documents (DB)', 'registry says documents.documents — rename pointer', 'low'],
  ['document_versions', 'docs.document_versions (DB)', 'registry says documents.document_versions — fix', 'low'],
  ['signatures', 'execution.signatures (DB)', 'registry says documents.signatures — fix schema', 'low'],
  ['attachments', 'docs.attachments (DB)', 'registry says documents.attachments — fix', 'low'],
  ['forecast_models', 'intelligence.forecast_models (DB)', 'registry says analytics.forecast_models — rename', 'low'],
  ['contacts', 'api-server/src/routes/supplier-details.ts, suppliers.ts', 'no DB table — add crm.contacts migration + wire routes', 'medium'],
  ['activities', 'api-server/src/routes/crm-ultimate.ts', 'no DB table — map to commercial.crm_activities existing', 'low'],
  ['milestones', 'api-server/src/routes/projects-module.ts, route-aliases.ts', 'create projects.milestones table', 'medium'],
  ['items', 'api-server/src/routes/delivery-returns.ts, finance-enterprise.ts', 'map to inventory.inventory_items (public) or create alias', 'low'],
  ['users', 'api-server/src/routes/audit-log.ts, auth.ts, chat.ts', 'create governance.users view over auth.users', 'low'],
  ['templates', 'api-server/src/routes/contract-templates.ts, ai-prompt-templates.ts', 'create documents.templates table', 'medium'],
  ['drawings', 'erp-app/src/pages/engineering/drawing-management', 'create engineering.drawings table', 'medium'],
  ['dashboardRouter', 'api-server/src/routes/index.ts (imported not mounted)', 'add router.use(\'/dashboard\', dashboardRouter)', 'low']
];
wins.forEach((w, i) => { md += '| ' + (i + 1) + ' | ' + w[0] + ' | ' + w[1] + ' | ' + w[2] + ' | ' + w[3] + ' |\n'; });
md += '\n';

md += '## Top 20 Critical Missing (truly absent)\n\n';
md += '| # | model | expected_table | evidence | priority |\n';
md += '|---|---|---|---|---|\n';
const top20 = [
  ['lead_sources', 'crm.lead_sources', 'none', 'P1_crm_core'],
  ['communication_logs', 'crm.communication_logs', 'none', 'P1_crm_core'],
  ['customer_segments', 'crm.customer_segments', 'none', 'P2_crm_analytics'],
  ['quote_items', 'sales.quote_items', 'none', 'P0_sales_required'],
  ['pricing_rules', 'sales.pricing_rules', 'none', 'P1_sales'],
  ['discounts', 'sales.discounts', 'none', 'P1_sales'],
  ['sales_orders', 'sales.sales_orders', 'none', 'P0_order_flow'],
  ['sales_pipeline', 'sales.sales_pipeline', 'none', 'P1_pipeline'],
  ['purchase_requests', 'procurement.purchase_requests', 'none', 'P0_procurement'],
  ['purchase_order_items', 'procurement.purchase_order_items', 'none', 'P0_procurement'],
  ['goods_receipts', 'procurement.goods_receipts', 'none', 'P0_procurement'],
  ['stock_balances', 'inventory.stock_balances', 'none', 'P0_inventory'],
  ['stock_movements', 'inventory.stock_movements', 'none', 'P0_inventory'],
  ['batch_lots', 'inventory.batch_lots', 'none', 'P1_inventory'],
  ['production_orders', 'production.production_orders', 'none', 'P0_production'],
  ['work_centers', 'production.work_centers', 'none', 'P0_production'],
  ['bom_headers', 'engineering.bom_headers', 'none', 'P0_engineering'],
  ['bom_items', 'engineering.bom_items', 'none', 'P0_engineering'],
  ['service_tickets', 'service.service_tickets', 'none', 'P0_service'],
  ['sla_rules', 'service.sla_rules', 'none', 'P1_service']
];
top20.forEach((s, i) => { md += '| ' + (i + 1) + ' | ' + s[0] + ' | ' + s[1] + ' | ' + s[2] + ' | ' + s[3] + ' |\n'; });
md += '\n';

md += '## A. hidden_existing_models (' + total_hidden + ')\n\n';
md += '### A.1 Wrong-schema (12) — table exists at different schema than registry claims\n\n';
md += '| model | registry_expects | db_found_at | confidence |\n|---|---|---|---|\n';
hidden12.forEach(h => { md += '| ' + h.model + ' | ' + h.registry_expects + ' | ' + h.db_has.join(', ') + ' | high |\n'; });
md += '\n';
md += '### A.2 Has API route, no DB table (14)\n\n';
md += '| model | expected_table | api_files | confidence |\n|---|---|---|---|\n';
hidApi.forEach(h => { md += '| ' + h.name + ' | ' + h.expected + ' | ' + (h.api_files || []).join(', ') + ' | medium |\n'; });
md += '\n';
md += '### A.3 Has FE page/call, no DB table (4)\n\n';
md += '| model | expected_table | fe_calls | confidence |\n|---|---|---|---|\n';
hidFe.forEach(h => { md += '| ' + h.name + ' | ' + h.expected + ' | ' + (h.fe_calls || []).join(', ') + ' | medium |\n'; });
md += '\n';

md += '## B. registry_models_without_real_data (' + total_registry_missing + ' total)\n';
md += 'Registry models where database.table_name points to a table that does NOT exist in any migration.\n\n';
md += '| # | model | expected_table | domain | category |\n|---|---|---|---|---|\n';
cat.forEach((c, i) => { md += '| ' + (i + 1) + ' | ' + c.name + ' | ' + (c.expected || '(none)') + ' | ' + (c.domain || '-') + ' | ' + c.category + ' |\n'; });
md += '\n';

md += '## C. duplicate_models_different_names (' + cross.dupes.length + ')\n\n';
md += '| logical_entity | versions_found | suggested_canonical |\n|---|---|---|\n';
cross.dupes.forEach(d => {
  const tables = d.entries.map(e => e.table).join(' / ');
  const canonical = d.entries.find(e => !/^public\./.test(e.table || ''))?.table || d.entries[0].table;
  md += '| ' + d.name + ' | ' + tables + ' | ' + canonical + ' |\n';
});
md += '\n';

md += '## D. orphan_real_tables (dead, no FK-in, not referenced in API SQL) — ' + dead.length + '\n';
md += 'These tables exist in DB migrations and appear in the registry, but no FK points to them and the api-server source never references their literal name. They are effectively unreachable.\n\n';
md += '| # | table |\n|---|---|\n';
dead.forEach((t, i) => { md += '| ' + (i + 1) + ' | ' + t + ' |\n'; });
md += '\n';

md += '## E. unused_but_existing_data_structures\n\n';
md += '### E.1 Unmounted route files (imported in routes/index.ts but never mounted)\n\n';
md += '| name | type | file | risk_if_removed |\n|---|---|---|---|\n';
md += '| dashboardRouter | api_route | api-server/src/routes/dashboard.ts | low — multiple dashboard-* routers exist |\n';
md += '| finRouterRouter | api_route | api-server/src/routes/fin-router.ts | low — many fin-* routers exist |\n';
md += '| savedPlacesRouter | api_route | api-server/src/routes/saved-places.ts | medium — check if UI uses /api/saved-places |\n\n';
md += '### E.2 Dead RPC functions (127 of 128 created)\n';
md += 'Literal-string names never appear in api-server source code. They may be invoked via migrations only or via dynamic RPC names — manual review required.\n';
md += 'Sample names: ' + db.funcs.slice(0, 30).join(', ') + '\n\n';

md += '## F. mismatched_schema_usage (' + cross.schemaMismatches.length + ')\n\n';
md += '| wrong_reference | correct_reference | registry_location |\n|---|---|---|\n';
cross.schemaMismatches.forEach(x => { md += '| ' + x.registry_table + ' | ' + x.db_found_at.join(' or ') + ' | _master-registry/models_registry.json (model_name_en=' + x.model + ') |\n'; });
md += '\n';

md += '## G. lost_connections (sample)\n';
md += 'Pipeline entity-map declares 144 links between 16 entities. Sampling relationships declared at wiring-spec level where the target is missing, duplicated, or unwired:\n\n';
md += '| model_a | model_b | expected_relationship | evidence |\n|---|---|---|---|\n';
md += '| lead | sales_opportunity | can_create (onyx-procurement/src/pipeline/entity-map.js:22) | target table sales.opportunities missing; exists as commercial.opportunities |\n';
md += '| customer | contract | has_many (wiring-spec.js:48) | registry says documents.contracts but DB has procurement.contracts |\n';
md += '| project | work_order | has_many (wiring-spec.js:54) | registry says projects.projects; DB has execution.projects — FK wiring uncertain |\n';
md += '| employee | payroll | has_many (wiring-spec.js:59) | workforce.employees exists; hr_workforce.payroll in registry missing |\n';
md += '| po | supplier_invoice | has_many (wiring-spec.js:52) | procurement.supplier_invoices exists but orphan (0 FK-in) |\n';
md += '| quote | quote_line | has_many (wiring-spec.js:50) | commercial.quote_lines exists as orphan (no FK-in) |\n';
md += '| project | material_request | has_many (wiring-spec.js:54) | inventory.material_request_lines orphan, no parent header table referenced |\n';
md += '| work_order | work_order_task | has_many (wiring-spec.js:55) | execution.work_order_tasks is orphan, no FK-in |\n';
md += '| invoice | invoice_line | implicit (registry) | finance.invoice_lines is orphan (no FK-in) |\n';
md += '| payroll | wage_slip | has_many (wiring-spec.js:61) | workforce.wage_slips is orphan (no FK-in) |\n';
md += '\n';

md += '## H. recovery_candidates (sorted by complexity)\n\n';
md += '### H.1 LOW complexity (registry pointer fix, zero DB change) — 12 entries\n\n';
md += '| entity | where_found | what_is_missing_to_activate |\n|---|---|---|\n';
hidden12.forEach(h => { md += '| ' + h.model + ' | DB=' + h.db_has[0] + ' | update registry.database.table_name to ' + h.db_has[0] + ' |\n'; });
md += '\n';

md += '### H.2 MEDIUM complexity (API route exists, add DB table) — 14 entries\n\n';
md += '| entity | where_found | what_is_missing_to_activate |\n|---|---|---|\n';
hidApi.forEach(h => { md += '| ' + h.name + ' | API routes: ' + (h.api_files || []).join(',') + ' | create migration for ' + h.expected + ', then FK-wire |\n'; });
md += '\n';

md += '### H.3 MEDIUM complexity (FE page exists, add DB + route) — 4 entries\n\n';
md += '| entity | where_found | what_is_missing_to_activate |\n|---|---|---|\n';
hidFe.forEach(h => { md += '| ' + h.name + ' | FE paths: ' + (h.fe_calls || []).join(',') + ' | create migration, create route file, mount in routes/index.ts |\n'; });
md += '\n';

md += '### H.4 HIGH complexity (truly absent — 75 entries, must build DB+API+FE+registry)\n';
md += 'See Section B for the full list filtered where category=truly_absent.\n\n';

md += '### H.5 ORPHAN RECOVERY (reverse direction — 119 dead tables that could be reactivated)\n';
md += 'DB has 119 tables with no FK-in and zero code references. Many are high-value subsystems that just need API routes + FE pages to come online. Examples:\n';
md += '- finance.gl_transactions, finance.vat_records, finance.invoice_lines, finance.payment_allocations (core finance disconnected)\n';
md += '- intelligence.* (13 AI tables — forecast_models, ai_insights, anomaly_feedback, trend_signals, etc. — all dead)\n';
md += '- workforce.wage_slips, workforce.pension_records, workforce.attendance, workforce.hr_profiles (HR core disconnected)\n';
md += '- governance.webhook_deliveries, governance.event_deliveries, governance.sla_timers, governance.state_history (platform plumbing dead)\n';
md += '- execution.work_order_tasks, execution.task_comments, execution.delivery_events, execution.project_blockers (project detail tables unused)\n';
md += '- inventory.inventory_receipts, inventory.inventory_issues, inventory.inventory_transfers, inventory.barcode_scans (warehouse ops dead)\n';
md += '- procurement.warranty_cases, procurement.rfq_comparison_snapshots, procurement.supplier_scorecards (procurement tail dead)\n';
md += 'See Section D for the full list of 119 tables.\n\n';

md += '## Appendix: raw data sources\n';
md += '- supabase/migrations/*.sql — 42 files (237 tables, 17 views, 128 RPCs, 382 FK edges)\n';
md += '- api-server/src/routes/*.ts — 335 files including index.ts (4,909 endpoints across 328 mounted routers)\n';
md += '- api-server/src/routes/index.ts — 858 lines; 331 imports, 328 mounts, 3 unmounted\n';
md += '- onyx-procurement/src/pipeline/entity-map.js — 16 entities, 144 declared links\n';
md += '- onyx-procurement/src/pipeline/wiring-spec.js — ENTITY_RELATIONSHIPS for 22 entities\n';
md += '- _master-registry/models_registry.json — 342 model entries\n';
md += '- lib-client/api-zod/src/generated/api.ts — 4,175-line Zod schema (generated from OpenAPI)\n';
md += '- erp-app/src/pages — 109 top-level page files, 1,651 FE source files, 1,362 distinct /api/ paths referenced\n';
md += '\n';
md += '### Cross-reference index files produced during scan (in _audit_tmp/)\n';
md += '- _scan_db.json (DB tables/views/RPCs/FKs per migration)\n';
md += '- _scan_api.json (API routes + endpoints per file)\n';
md += '- _cross.json (registry vs DB cross-reference)\n';
md += '- _categorized.json (105 missing models classified)\n';
md += '- _hidden.json (12 schema-mismatched)\n';
md += '- _orphans_dead_v3.json (119 truly dead tables)\n';
md += '- _fe.json (FE API call inventory)\n';
md += '- _rpcs.json (RPC usage analysis)\n';
md += '- _unmounted.json (unmounted routers)\n';

fs.writeFileSync('_master-registry/DISCOVERY_RECOVERY_MAP.md', md);
console.log('WROTE _master-registry/DISCOVERY_RECOVERY_MAP.md size=', md.length);
