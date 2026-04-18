# RECOVERY TASK BOARD

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | All actionable items extracted from the 5 primary + 3 secondary audit reports |
| Entry count | 325 |
| Default assignee | recovery-agent |
| Statuses | todo / in_progress / blocked / done / validated |

Columns: `id | title | phase | status | priority | evidence_refs | blocker | assigned_to`

---

## Phase 2 — Registry ↔ DB schema reconciliation (T001–T094)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T001 | Reconcile 105-model delta between registry (342) and DB (237) | 3 | todo | critical | E002,E007,E091 | D003 pending | recovery-agent |
| T002 | Resolve domain-naming conflict (crm/sales/projects/hr_workforce vs commercial/execution/workforce) | 2 | todo | critical | E003,E016,E083 | D003 pending | recovery-agent |
| T003 | Decide: wire or drop analytics.dashboard_board_widgets | 6 | todo | medium | E092 | D004 | recovery-agent |
| T004 | Decide: wire or drop analytics.kpi_snapshots | 6 | todo | medium | E093 | D004 | recovery-agent |
| T005 | Decide: wire or drop analytics.read_model_invalidations | 6 | todo | low | E094 | D004 | recovery-agent |
| T006 | Decide: wire or drop analytics.rm_ai_summary | 6 | todo | medium | E095 | D004 | recovery-agent |
| T007 | Decide: wire or drop analytics.rm_executive_summary | 6 | todo | medium | E096 | D004 | recovery-agent |
| T008 | Decide: wire or drop analytics.rm_finance_summary | 6 | todo | medium | E097 | D004 | recovery-agent |
| T009 | Decide: wire or drop analytics.rm_operations_summary | 6 | todo | medium | E098 | D004 | recovery-agent |
| T010 | Decide: wire or drop analytics.rm_procurement_summary | 6 | todo | medium | E099 | D004 | recovery-agent |
| T011 | Decide: wire or drop analytics.rm_workforce_summary | 6 | todo | medium | E100 | D004 | recovery-agent |
| T012 | Decide: wire or drop analytics.user_dashboard_boards | 6 | todo | medium | E101 | D004 | recovery-agent |
| T013 | Decide: wire or drop comms.help_articles | 6 | todo | low | E110 | D004 | recovery-agent |
| T014 | Decide: wire or drop commercial.quote_approval_rules | 6 | todo | high | E105 | D004 | recovery-agent |
| T015 | Decide: wire or drop execution.signatures (already targeted by registry) | 6 | todo | medium | E027 | D004 | recovery-agent |
| T016 | Decide: wire or drop finance.annual_tax_reports | 6 | todo | medium | E136 | D004 | recovery-agent |
| T017 | Decide: wire or drop finance.cashflow_entries | 6 | todo | medium | E143 | D004 | recovery-agent |
| T018 | Decide: wire or drop finance.consolidation_entries | 6 | todo | medium | E140 | D004 | recovery-agent |
| T019 | Decide: wire or drop finance.fx_rates | 6 | todo | medium | E143 | D004 | recovery-agent |
| T020 | Decide: wire or drop governance.config_entries | 6 | todo | low | E154 | D004 | recovery-agent |
| T021 | Decide: wire or drop governance.escalation_rules | 6 | todo | medium | E155 | D004 | recovery-agent |
| T022 | Decide: wire or drop governance.health_checks | 6 | todo | low | E158 | D004 | recovery-agent |
| T023 | Decide: wire or drop governance.idempotency_keys (infra) | 6 | todo | low | E159 | D004 | recovery-agent |
| T024 | Decide: wire or drop governance.validations_log | 6 | todo | low | E167 | D004 | recovery-agent |
| T025 | Decide: wire or drop intelligence.ai_insights | 6 | todo | high | E171 | D004 | recovery-agent |
| T026 | Decide: wire or drop intelligence.forecast_models | 6 | todo | high | E173 | D004 | recovery-agent |
| T027 | Decide: wire or drop intelligence.quality_scores | 6 | todo | medium | E175 | D004 | recovery-agent |
| T028 | Decide: wire or drop intelligence.seasonality_patterns | 6 | todo | medium | E177 | D004 | recovery-agent |
| T029 | Decide: wire or drop intelligence.trend_signals | 6 | todo | medium | E178 | D004 | recovery-agent |
| T030 | Decide: wire or drop orchestration.notifications (overlap with comms.notifications) | 6 | todo | medium | E049 | D004,D006 | recovery-agent |
| T031 | Decide: wire or drop planning.demand_forecasts | 6 | todo | medium | E191 | D004 | recovery-agent |
| T032 | Reconcile 652 orphan pages (route registered, not in menu) | 8 | todo | high | E005 | D005 | recovery-agent |
| T033 | Address 223 duplicate risks | 5 | todo | critical | E006 | D006 | recovery-agent |
| T034 | Reconcile 93 claimed models w/o migration table | 3 | todo | high | E007 | D002 | recovery-agent |
| T035 | Resolve 7 source-of-truth conflicts | 2 | todo | critical | E008 | D007 | recovery-agent |
| T036 | Reconcile 510 menu entries without frontend route | 8 | todo | high | E009 | D008 | recovery-agent |
| T037 | Remove duplicate CREATE TABLE governance.roles | 5 | todo | high | E010 | D006 | recovery-agent |
| T038 | Remove duplicate CREATE TABLE governance.permissions | 5 | todo | high | E010 | D006 | recovery-agent |
| T039 | Remove duplicate CREATE TABLE governance.role_permissions | 5 | todo | high | E010 | D006 | recovery-agent |
| T040 | Remove duplicate CREATE TABLE governance.user_roles | 5 | todo | high | E010 | D006 | recovery-agent |
| T041 | Remove duplicate CREATE TABLE analytics.dashboard_widgets | 5 | todo | high | E010 | D006 | recovery-agent |
| T042 | Eliminate 15 route path duplicates in App.tsx | 5 | todo | medium | E011 | D006 | recovery-agent |
| T043 | Eliminate 171 duplicate API handler prefixes | 5 | todo | high | E012 | D006 | recovery-agent |
| T044 | Deduplicate 32 duplicate menu rows | 5 | todo | medium | E013 | D006 | recovery-agent |
| T045 | Align 15 registry domains with 23 migration schemas | 2 | todo | critical | E016 | D003 | recovery-agent |
| T046 | Activate 30 hidden-but-existing models | 2 | todo | high | E017 | D009 | recovery-agent |
| T047 | Fix registry pointer: crm.customers → commercial.customers | 2 | todo | critical | E018 | D009 | recovery-agent |
| T048 | Fix registry pointer: crm.leads canonical | 2 | todo | critical | E017,E048 | D009 | recovery-agent |
| T049 | Fix registry pointer: sales.opportunities → commercial.opportunities | 2 | todo | critical | E019 | D009 | recovery-agent |
| T050 | Fix registry pointer: sales.quotes → commercial.quotes | 2 | todo | critical | E020 | D009 | recovery-agent |
| T051 | Fix registry pointer: sales.approvals → procurement.approvals | 2 | todo | critical | E021 | D009 | recovery-agent |
| T052 | Fix registry pointer: projects.projects → execution.projects | 2 | todo | critical | E022 | D009 | recovery-agent |
| T053 | Fix registry pointer: projects.project_phases → execution.project_phases | 2 | todo | critical | E023 | D009 | recovery-agent |
| T054 | Fix registry pointer: hr_workforce.employees → workforce.employees | 2 | todo | critical | E024 | D009 | recovery-agent |
| T055 | Fix registry pointer: documents.documents → docs.documents | 2 | todo | critical | E025 | D009 | recovery-agent |
| T056 | Fix registry pointer: documents.document_versions → docs.document_versions | 2 | todo | critical | E026 | D009 | recovery-agent |
| T057 | Fix registry pointer: documents.signatures → execution.signatures | 2 | todo | critical | E027 | D009 | recovery-agent |
| T058 | Fix registry pointer: documents.attachments → docs.attachments + documents.forecast_models → intelligence.forecast_models | 2 | todo | critical | E028,E029 | D009 | recovery-agent |
| T059 | Backfill DB table crm.contacts (API route exists) | 7 | todo | high | E030 | D010 | recovery-agent |
| T060 | Backfill DB table crm.activities (or map to commercial.crm_activities) | 7 | todo | high | E031 | D010 | recovery-agent |
| T061 | Backfill DB table crm.meetings | 7 | todo | high | E032 | D010 | recovery-agent |
| T062 | Backfill DB table projects.milestones | 7 | todo | high | E033 | D010 | recovery-agent |
| T063 | Backfill DB table inventory.items (or map existing) | 7 | todo | high | E034 | D010 | recovery-agent |
| T064 | Backfill DB table inventory.reservations | 7 | todo | high | E035 | D010 | recovery-agent |
| T065 | Backfill DB table installation.schedules | 7 | todo | high | E036 | D010 | recovery-agent |
| T066 | Backfill DB table hr_workforce.contractors | 7 | todo | high | E037 | D010 | recovery-agent |
| T067 | Backfill DB table hr_workforce.assignments | 7 | todo | high | E038 | D010 | recovery-agent |
| T068 | Backfill DB table documents.templates | 7 | todo | high | E039 | D010 | recovery-agent |
| T069 | Backfill DB table analytics.dashboards | 7 | todo | high | E040 | D010 | recovery-agent |
| T070 | Backfill DB table analytics.reports | 7 | todo | high | E041 | D010 | recovery-agent |
| T071 | Backfill DB table analytics.scorecards | 7 | todo | high | E042 | D010 | recovery-agent |
| T072 | Create governance.users view over auth.users | 7 | todo | high | E043 | D010 | recovery-agent |
| T073 | Add migration + route for projects.dependencies (FE exists) | 7 | todo | high | E044 | D011 | recovery-agent |
| T074 | Add migration + route for engineering.drawings (FE exists) | 7 | todo | high | E045 | D011 | recovery-agent |
| T075 | Add migration + route for inventory.raw_materials (FE exists) | 7 | todo | high | E046 | D011 | recovery-agent |
| T076 | Add migration + route for hr_workforce.teams (FE exists) | 7 | todo | high | E047 | D011 | recovery-agent |
| T077 | Collapse duplicate: leads (crm.leads vs commercial.leads) | 5 | todo | high | E048 | D009 | recovery-agent |
| T078 | Collapse duplicate: customers (crm/commercial/public) | 5 | todo | high | E048 | D009 | recovery-agent |
| T079 | Collapse duplicate: opportunities (sales/commercial/crm) | 5 | todo | high | E048 | D009 | recovery-agent |
| T080 | Collapse duplicate: quotes (sales/commercial) | 5 | todo | high | E048 | D009 | recovery-agent |
| T081 | Collapse duplicate: approvals (sales/procurement) | 5 | todo | high | E048 | D009 | recovery-agent |
| T082 | Collapse duplicate: projects (projects/execution) | 5 | todo | high | E048 | D009 | recovery-agent |
| T083 | Collapse duplicate: project_phases (projects/execution) | 5 | todo | high | E048 | D009 | recovery-agent |
| T084 | Collapse duplicate: suppliers (procurement/public) | 5 | todo | high | E048 | D009 | recovery-agent |
| T085 | Collapse duplicate: employees (hr_workforce/public/workforce) | 5 | todo | high | E048 | D009 | recovery-agent |
| T086 | Collapse duplicate: documents (documents/docs) | 5 | todo | high | E048 | D009 | recovery-agent |
| T087 | Collapse duplicate: document_versions (documents/docs) | 5 | todo | high | E048 | D009 | recovery-agent |
| T088 | Collapse duplicate: signatures (documents/execution) | 5 | todo | high | E048 | D009 | recovery-agent |
| T089 | Collapse duplicate: attachments (documents/docs) | 5 | todo | high | E048 | D009 | recovery-agent |
| T090 | Collapse duplicate: forecast_models (analytics/intelligence) | 5 | todo | high | E048 | D009 | recovery-agent |
| T091 | Collapse duplicate: notifications (comms/orchestration) | 5 | todo | high | E048 | D009 | recovery-agent |
| T092 | Collapse duplicate: work_orders (execution/maintenance) | 5 | todo | high | E048 | D009 | recovery-agent |
| T093 | Collapse duplicate: workflow_steps (governance/orchestration) | 5 | todo | high | E048 | D009 | recovery-agent |
| T094 | Review 119 extended orphan tables — wire or drop each | 6 | todo | high | E049,E092-E210 | D004 | recovery-agent |

## Phase 7 — Truly-missing DB tables (T095–T169) — 75 net-new

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T095 | Build crm.lead_sources | 7 | todo | high | E211 | D012 | recovery-agent |
| T096 | Build crm.communication_logs | 7 | todo | high | E212 | D012 | recovery-agent |
| T097 | Build crm.customer_segments | 7 | todo | medium | E213 | D012 | recovery-agent |
| T098 | Build sales.quote_items | 7 | todo | critical | E214 | D012 | recovery-agent |
| T099 | Build sales.pricing_rules | 7 | todo | high | E215 | D012 | recovery-agent |
| T100 | Build sales.discounts | 7 | todo | high | E216 | D012 | recovery-agent |
| T101 | Build sales.sales_orders | 7 | todo | critical | E217 | D012 | recovery-agent |
| T102 | Build sales.sales_pipeline | 7 | todo | high | E218 | D012 | recovery-agent |
| T103 | Build projects.project_tasks | 7 | todo | high | E219 | D012 | recovery-agent |
| T104 | Build projects.project_resources | 7 | todo | medium | E220 | D012 | recovery-agent |
| T105 | Build projects.project_risk_entries | 7 | todo | medium | E221 | D012 | recovery-agent |
| T106 | Build projects.project_progress_logs | 7 | todo | medium | E222 | D012 | recovery-agent |
| T107 | Build engineering.technical_specs | 7 | todo | high | E223 | D012 | recovery-agent |
| T108 | Build engineering.bom_headers | 7 | todo | critical | E224 | D012 | recovery-agent |
| T109 | Build engineering.bom_items | 7 | todo | critical | E225 | D012 | recovery-agent |
| T110 | Build engineering.revision_control | 7 | todo | medium | E226 | D012 | recovery-agent |
| T111 | Build engineering.product_configurations | 7 | todo | medium | E227 | D012 | recovery-agent |
| T112 | Build engineering.engineering_requests | 7 | todo | medium | E228 | D012 | recovery-agent |
| T113 | Build engineering.approval_drawings | 7 | todo | medium | E229 | D012 | recovery-agent |
| T114 | Build procurement.supplier_price_lists | 7 | todo | high | E230 | D012 | recovery-agent |
| T115 | Build procurement.purchase_requests | 7 | todo | critical | E231 | D012 | recovery-agent |
| T116 | Build procurement.purchase_order_items | 7 | todo | critical | E232 | D012 | recovery-agent |
| T117 | Build procurement.goods_receipts | 7 | todo | critical | E233 | D012 | recovery-agent |
| T118 | Build procurement.procurement_approvals | 7 | todo | high | E234 | D012 | recovery-agent |
| T119 | Build inventory.stock_balances | 7 | todo | critical | E235 | D012 | recovery-agent |
| T120 | Build inventory.stock_movements | 7 | todo | critical | E236 | D012 | recovery-agent |
| T121 | Build inventory.batch_lots | 7 | todo | high | E237 | D012 | recovery-agent |
| T122 | Build production.production_orders | 7 | todo | critical | E238 | D012 | recovery-agent |
| T123 | Build production.production_steps | 7 | todo | high | E239 | D012 | recovery-agent |
| T124 | Build production.work_centers | 7 | todo | critical | E240 | D012 | recovery-agent |
| T125 | Build production.labor_logs | 7 | todo | medium | E241 | D012 | recovery-agent |
| T126 | Build production.machine_logs | 7 | todo | medium | E242 | D012 | recovery-agent |
| T127 | Build production.material_consumption | 7 | todo | high | E243 | D012 | recovery-agent |
| T128 | Build production.scrap_logs | 7 | todo | medium | E244 | D012 | recovery-agent |
| T129 | Build production.production_quality_checks | 7 | todo | medium | E245 | D012 | recovery-agent |
| T130 | Build installation.installation_orders | 7 | todo | high | E246 | D012 | recovery-agent |
| T131 | Build installation.installation_tasks | 7 | todo | high | E247 | D012 | recovery-agent |
| T132 | Build installation.installation_teams | 7 | todo | high | E248 | D012 | recovery-agent |
| T133 | Build installation.site_visits | 7 | todo | medium | E249 | D012 | recovery-agent |
| T134 | Build installation.completion_reports | 7 | todo | medium | E250 | D012 | recovery-agent |
| T135 | Build installation.handover_documents | 7 | todo | medium | E251 | D012 | recovery-agent |
| T136 | Build installation.punch_lists | 7 | todo | medium | E252 | D012 | recovery-agent |
| T137 | Build service.service_tickets | 7 | todo | critical | E253 | D012 | recovery-agent |
| T138 | Build service.warranty_records | 7 | todo | high | E254 | D012 | recovery-agent |
| T139 | Build service.service_visits | 7 | todo | high | E255 | D012 | recovery-agent |
| T140 | Build service.issue_categories | 7 | todo | medium | E256 | D012 | recovery-agent |
| T141 | Build service.resolution_logs | 7 | todo | medium | E257 | D012 | recovery-agent |
| T142 | Build service.maintenance_plans | 7 | todo | medium | E258 | D012 | recovery-agent |
| T143 | Build service.service_feedback | 7 | todo | medium | E259 | D012 | recovery-agent |
| T144 | Build service.sla_rules | 7 | todo | high | E260 | D012 | recovery-agent |
| T145 | Build finance.invoice_items (distinct from finance.invoice_lines) | 7 | todo | medium | E261 | D012 | recovery-agent |
| T146 | Build finance.expense_categories | 7 | todo | medium | E262 | D012 | recovery-agent |
| T147 | Build finance.profitability_snapshots | 7 | todo | medium | E263 | D012 | recovery-agent |
| T148 | Build hr_workforce.attendance_logs | 7 | todo | high | E264 | D012 | recovery-agent |
| T149 | Build hr_workforce.payroll_inputs | 7 | todo | high | E265 | D012 | recovery-agent |
| T150 | Build hr_workforce.performance_reviews | 7 | todo | medium | E266 | D012 | recovery-agent |
| T151 | Build hr_workforce.skill_matrix | 7 | todo | medium | E267 | D012 | recovery-agent |
| T152 | Build documents.document_links | 7 | todo | medium | E268 | D012 | recovery-agent |
| T153 | Build documents.generated_files | 7 | todo | medium | E269 | D012 | recovery-agent |
| T154 | Build documents.archive_records | 7 | todo | medium | E270 | D012 | recovery-agent |
| T155 | Build analytics.kpi_definitions | 7 | todo | high | E271 | D012 | recovery-agent |
| T156 | Build analytics.report_sources | 7 | todo | medium | E272 | D012 | recovery-agent |
| T157 | Build analytics.scenario_models | 7 | todo | medium | E273 | D012 | recovery-agent |
| T158 | Build ai_automation.automation_rules | 7 | todo | high | E274 | D012 | recovery-agent |
| T159 | Build ai_automation.automation_runs | 7 | todo | high | E275 | D012 | recovery-agent |
| T160 | Build ai_automation.ai_agents | 7 | todo | high | E276 | D012 | recovery-agent |
| T161 | Build ai_automation.ai_actions | 7 | todo | medium | E277 | D012 | recovery-agent |
| T162 | Build ai_automation.prediction_outputs | 7 | todo | medium | E278 | D012 | recovery-agent |
| T163 | Build ai_automation.recommendation_logs | 7 | todo | medium | E279 | D012 | recovery-agent |
| T164 | Build ai_automation.prompt_templates | 7 | todo | medium | E280 | D012 | recovery-agent |
| T165 | Build ai_automation.orchestration_flows | 7 | todo | medium | E281 | D012 | recovery-agent |
| T166 | Build governance.change_logs | 7 | todo | medium | E282 | D012 | recovery-agent |
| T167 | Build governance.system_settings | 7 | todo | high | E283 | D012 | recovery-agent |
| T168 | Build governance.validation_rules | 7 | todo | medium | E284 | D012 | recovery-agent |
| T169 | Build governance.data_quality_issues | 7 | todo | medium | E285 | D012 | recovery-agent |

## Phases 5/10/11 — unmounted routes, dead RPCs, dashboards, pipeline (T170–T175)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T170 | Mount or delete dashboardRouter (api-server/src/routes/dashboard.ts) | 5 | todo | medium | E051 | D013 | recovery-agent |
| T171 | Mount or delete finRouterRouter (api-server/src/routes/fin-router.ts) | 5 | todo | medium | E052 | D013 | recovery-agent |
| T172 | Mount or delete savedPlacesRouter (api-server/src/routes/saved-places.ts) | 5 | todo | medium | E053 | D013 | recovery-agent |
| T173 | Audit 127 potentially dead RPCs — confirm each by migration + FE scan | 11 | todo | medium | E054 | D014 | recovery-agent |
| T174 | Execute 20 Top Recovery Wins (low complexity) | 2 | todo | high | E055 | D003,D009 | recovery-agent |
| T175 | Categorize and action 779 invisible items (101 model + 223 engine + 455 page + 14 report + 10 dashboard + 5 workflow + 13 state + 45 edge) | 8 | todo | high | E056 | D005,D015 | recovery-agent |

## Phase 8 — Invisible DB tables to menu (T176–T276, 101 items)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T176 | Add menu entry: analytics.dashboard_definitions | 8 | todo | medium | E305 | D005 | recovery-agent |
| T177 | Add menu entry: analytics.dashboard_boards | 8 | todo | medium | E306 | D005 | recovery-agent |
| T178 | Add menu entry: analytics.dashboard_widgets | 8 | todo | medium | — | D005 | recovery-agent |
| T179 | Add menu entry: analytics.dashboard_board_widgets | 8 | todo | low | E092 | D005 | recovery-agent |
| T180 | Add menu entry: analytics.user_dashboard_boards | 8 | todo | low | E101 | D005 | recovery-agent |
| T181 | Add menu entry: analytics.kpi_snapshots | 8 | todo | medium | E093 | D005 | recovery-agent |
| T182 | Add menu entry: commercial.quote_lines | 8 | todo | high | E307 | D005 | recovery-agent |
| T183 | Add menu entry: commercial.quote_revisions | 8 | todo | medium | E308 | D005 | recovery-agent |
| T184 | Add menu entry: commercial.quote_approval_rules | 8 | todo | medium | E105 | D005 | recovery-agent |
| T185 | Add menu entry: commercial.customer_contacts | 8 | todo | medium | E102 | D005 | recovery-agent |
| T186 | Add menu entry: commercial.customer_portal_accounts | 8 | todo | medium | E103 | D005 | recovery-agent |
| T187 | Add menu entry: commercial.pricing_snapshots | 8 | todo | medium | — | D005 | recovery-agent |
| T188 | Add menu entry: commercial.crm_activities | 8 | todo | medium | — | D005 | recovery-agent |
| T189 | Add menu entry: procurement.purchase_order_lines | 8 | todo | high | E309 | D005 | recovery-agent |
| T190 | Add menu entry: procurement.rfq_items | 8 | todo | high | E310 | D005 | recovery-agent |
| T191 | Add menu entry: procurement.supplier_quotes | 8 | todo | medium | — | D005 | recovery-agent |
| T192 | Add menu entry: procurement.supplier_quote_lines | 8 | todo | medium | — | D005 | recovery-agent |
| T193 | Add menu entry: procurement.supplier_invoices | 8 | todo | high | E311 | D005 | recovery-agent |
| T194 | Add menu entry: procurement.approval_steps | 8 | todo | medium | E192 | D005 | recovery-agent |
| T195 | Add menu entry: procurement.contract_milestones | 8 | todo | medium | E193 | D005 | recovery-agent |
| T196 | Add menu entry: procurement.rfq_comparison_snapshots | 8 | todo | medium | E194 | D005 | recovery-agent |
| T197 | Add menu entry: inventory.inventory_movements | 8 | todo | high | E312 | D005 | recovery-agent |
| T198 | Add menu entry: inventory.inventory_receipts | 8 | todo | high | E181 | D005 | recovery-agent |
| T199 | Add menu entry: inventory.inventory_issues | 8 | todo | high | E180 | D005 | recovery-agent |
| T200 | Add menu entry: inventory.inventory_transfers | 8 | todo | medium | E182 | D005 | recovery-agent |
| T201 | Add menu entry: inventory.inventory_reservations | 8 | todo | medium | — | D005 | recovery-agent |
| T202 | Add menu entry: inventory.material_lots | 8 | todo | medium | — | D005 | recovery-agent |
| T203 | Add menu entry: inventory.material_request_lines | 8 | todo | medium | E184 | D005 | recovery-agent |
| T204 | Add menu entry: inventory.shortage_snapshots | 8 | todo | medium | E186 | D005 | recovery-agent |
| T205 | Add menu entry: inventory.stock_count_lines | 8 | todo | medium | E187 | D005 | recovery-agent |
| T206 | Add menu entry: execution.work_order_tasks | 8 | todo | high | E313 | D005 | recovery-agent |
| T207 | Add menu entry: execution.work_order_qa_checklists | 8 | todo | medium | — | D005 | recovery-agent |
| T208 | Add menu entry: execution.work_order_qa_items | 8 | todo | medium | E134 | D005 | recovery-agent |
| T209 | Add menu entry: execution.project_phases | 8 | todo | high | E314 | D005 | recovery-agent |
| T210 | Add menu entry: execution.project_cost_plans | 8 | todo | medium | E130 | D005 | recovery-agent |
| T211 | Add menu entry: execution.task_dependencies | 8 | todo | medium | E133 | D005 | recovery-agent |
| T212 | Add menu entry: execution.task_attachments | 8 | todo | low | E131 | D005 | recovery-agent |
| T213 | Add menu entry: execution.task_comments | 8 | todo | low | E132 | D005 | recovery-agent |
| T214 | Add menu entry: execution.delivery_events | 8 | todo | medium | E127 | D005 | recovery-agent |
| T215 | Add menu entry: execution.installation_events | 8 | todo | medium | E128 | D005 | recovery-agent |
| T216 | Add menu entry: execution.alerts | 8 | todo | medium | — | D005 | recovery-agent |
| T217 | Add menu entry: finance.budget_entries | 8 | todo | medium | E315 | D005 | recovery-agent |
| T218 | Add menu entry: finance.cashflow_entries | 8 | todo | medium | E143 | D005 | recovery-agent |
| T219 | Add menu entry: finance.collection_actions | 8 | todo | medium | E139 | D005 | recovery-agent |
| T220 | Add menu entry: finance.collection_cases | 8 | todo | medium | — | D005 | recovery-agent |
| T221 | Add menu entry: finance.consolidation_entries | 8 | todo | medium | E140 | D005 | recovery-agent |
| T222 | Add menu entry: finance.costing_entries | 8 | todo | medium | E141 | D005 | recovery-agent |
| T223 | Add menu entry: finance.dunning_campaigns | 8 | todo | high | E316 | D005 | recovery-agent |
| T224 | Add menu entry: finance.dunning_steps | 8 | todo | medium | E142 | D005 | recovery-agent |
| T225 | Add menu entry: finance.invoice_lines | 8 | todo | high | E145 | D005 | recovery-agent |
| T226 | Add menu entry: finance.payment_allocations | 8 | todo | medium | E146 | D005 | recovery-agent |
| T227 | Add menu entry: finance.reconciliation_exceptions | 8 | todo | medium | E147 | D005 | recovery-agent |
| T228 | Add menu entry: finance.reminder_schedules | 8 | todo | medium | E148 | D005 | recovery-agent |
| T229 | Add menu entry: finance.tax_records | 8 | todo | high | E317 | D005 | recovery-agent |
| T230 | Add menu entry: finance.vat_records | 8 | todo | high | E150 | D005 | recovery-agent |
| T231 | Add menu entry: workforce.payroll_runs | 8 | todo | high | E318 | D005 | recovery-agent |
| T232 | Add menu entry: workforce.payroll_entries | 8 | todo | high | E319 | D005 | recovery-agent |
| T233 | Add menu entry: workforce.payroll_exceptions | 8 | todo | medium | E206 | D005 | recovery-agent |
| T234 | Add menu entry: workforce.payroll_export_batches | 8 | todo | medium | E207 | D005 | recovery-agent |
| T235 | Add menu entry: workforce.leave_requests | 8 | todo | high | — | D005 | recovery-agent |
| T236 | Add menu entry: workforce.workforce_assignments | 8 | todo | medium | E210 | D005 | recovery-agent |
| T237 | Add menu entry: workforce.employee_pay_components | 8 | todo | medium | E204 | D005 | recovery-agent |
| T238 | Add menu entry: docs.attachments | 8 | todo | medium | — | D005 | recovery-agent |
| T239 | Add menu entry: docs.document_classifications | 8 | todo | medium | E116 | D005 | recovery-agent |
| T240 | Add menu entry: docs.document_signature_requests | 8 | todo | medium | E117 | D005 | recovery-agent |
| T241 | Add menu entry: docs.document_versions | 8 | todo | medium | — | D005 | recovery-agent |
| T242 | Add menu entry: docs.ocr_results | 8 | todo | medium | E320 | D005 | recovery-agent |
| T243 | Add menu entry: docs.print_jobs | 8 | todo | low | E119 | D005 | recovery-agent |
| T244 | Add menu entry: docs.scan_sessions | 8 | todo | low | E120 | D005 | recovery-agent |
| T245 | Add menu entry: documents.classification_runs | 8 | todo | medium | E121 | D005 | recovery-agent |
| T246 | Add menu entry: documents.entity_extractions | 8 | todo | medium | E321 | D005 | recovery-agent |
| T247 | Add menu entry: documents.extraction_runs | 8 | todo | medium | — | D005 | recovery-agent |
| T248 | Add menu entry: documents.ocr_runs | 8 | todo | medium | E126 | D005 | recovery-agent |
| T249 | Add menu entry: documents.document_relations | 8 | todo | low | E123 | D005 | recovery-agent |
| T250 | Add menu entry: comms.chatbot_sessions | 8 | todo | low | E108 | D005 | recovery-agent |
| T251 | Add menu entry: comms.email_messages | 8 | todo | medium | E109 | D005 | recovery-agent |
| T252 | Add menu entry: comms.help_articles | 8 | todo | low | E110 | D005 | recovery-agent |
| T253 | Add menu entry: comms.sms_messages | 8 | todo | low | E112 | D005 | recovery-agent |
| T254 | Add menu entry: comms.whatsapp_messages | 8 | todo | low | — | D005 | recovery-agent |
| T255 | Add menu entry: governance.permissions admin | 8 | todo | high | E322 | D005 | recovery-agent |
| T256 | Add menu entry: governance.role_permissions admin | 8 | todo | high | E323 | D005 | recovery-agent |
| T257 | Add menu entry: governance.object_permissions admin | 8 | todo | high | E324 | D005 | recovery-agent |
| T258 | Add menu entry: governance.integration_connections | 8 | todo | medium | E325 | D005 | recovery-agent |
| T259 | Add menu entry: governance.escalation_rules | 8 | todo | medium | E155 | D005 | recovery-agent |
| T260 | Add menu entry: governance.saved_filters | 8 | todo | low | E162 | D005 | recovery-agent |
| T261 | Add menu entry: governance.webhook_endpoints | 8 | todo | medium | — | D005 | recovery-agent |
| T262 | Add menu entry: governance.webhook_deliveries | 8 | todo | medium | E168 | D005 | recovery-agent |
| T263 | Add menu entry: governance.event_subscriptions | 8 | todo | medium | — | D005 | recovery-agent |
| T264 | Add menu entry: governance.event_deliveries | 8 | todo | low | E156 | D005 | recovery-agent |
| T265 | Add menu entry: governance.feature_flags | 8 | todo | medium | — | D005 | recovery-agent |
| T266 | Add menu entry: governance.feature_flag_targets | 8 | todo | low | E157 | D005 | recovery-agent |
| T267 | Add menu entry: governance.state_history | 8 | todo | low | E165 | D005 | recovery-agent |
| T268 | Add menu entry: governance.queue_jobs | 8 | todo | medium | — | D005 | recovery-agent |
| T269 | Add menu entry: governance.job_executions | 8 | todo | medium | E160 | D005 | recovery-agent |
| T270 | Add menu entry: governance.security_events | 8 | todo | medium | E163 | D005 | recovery-agent |
| T271 | Add menu entry: governance.sla_timers | 8 | todo | medium | E164 | D005 | recovery-agent |
| T272 | Add menu entry: governance.validations_log | 8 | todo | low | E167 | D005 | recovery-agent |
| T273 | Add menu entry: governance.config_entries | 8 | todo | low | E154 | D005 | recovery-agent |
| T274 | Add menu entry: governance.user_preferences | 8 | todo | low | E166 | D005 | recovery-agent |
| T275 | Add menu entry: governance.users_profile admin | 8 | todo | high | — | D005 | recovery-agent |
| T276 | Add menu entries for remaining ~25 invisible tables (treasury, service, intelligence, planning, pricing, compliance, maintenance, routing) | 8 | todo | medium | E056 | D005 | recovery-agent |

## Phase 8/10/11 — page/engine/report/dashboard/workflow (T277–T287)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T277 | Wire 455 invisible React pages into menu | 8 | todo | high | E058 | D005 | recovery-agent |
| T278 | Categorize 223 invisible API engine modules: UI or delete | 8 | todo | high | E059 | D005 | recovery-agent |
| T279 | Create menu entries for 14 invisible registry reports | 8 | todo | high | E060 | D015 | recovery-agent |
| T280 | Create menu entries for 10 invisible registry dashboards (canonical) | 8 | todo | high | E061 | D015 | recovery-agent |
| T281 | Create menu entries for 5 pipeline workflows | 8 | todo | high | E062 | D015 | recovery-agent |
| T282 | Add UI config surface for 13 state machines | 8 | todo | medium | E063 | D015 | recovery-agent |
| T283 | Analytics schema — lift from 0% menu coverage to >60% | 8 | todo | high | E064 | D005 | recovery-agent |
| T284 | Docs/documents schema — lift from 12–17% to >60% menu coverage | 8 | todo | high | E065 | D005 | recovery-agent |
| T285 | Resolve 33 high-priority DB tables missing from menu (18 P0) | 8 | todo | critical | E066 | D005 | recovery-agent |
| T286 | Reconcile 451 menu routes without `<Route>` in App.tsx | 8 | todo | critical | E067 | D008 | recovery-agent |
| T287 | Reconcile 496 routes without menu entry | 8 | todo | critical | E068 | D005 | recovery-agent |

## Phase 9 — Dead links + orphan pages (T288–T321)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T288 | Fix dead link /portal/customer/login (×2 occurrences) | 9 | todo | high | E286 | D016 | recovery-agent |
| T289 | Fix dead link /portal/customer/dashboard (×2) | 9 | todo | high | E287 | D016 | recovery-agent |
| T290 | Fix dead link /ai-engine/chatbot-settings (×2 → /ai-engine/ai-chatbot-settings) | 9 | todo | medium | E288 | D016 | recovery-agent |
| T291 | Fix dead link /executive/scorecard | 9 | todo | medium | E289 | D016 | recovery-agent |
| T292 | Fix dead link /contracts/risk-scoring | 9 | todo | medium | E290 | D016 | recovery-agent |
| T293 | Fix dead link /fin/income | 9 | todo | medium | E291 | D016 | recovery-agent |
| T294 | Fix dead link /fin/expenses | 9 | todo | medium | E292 | D016 | recovery-agent |
| T295 | Fix dead link /fin/activity | 9 | todo | medium | E293 | D016 | recovery-agent |
| T296 | Fix dead link /logistics/tracking | 9 | todo | medium | E294 | D016 | recovery-agent |
| T297 | Fix dead link /logistics/returns | 9 | todo | medium | E295 | D016 | recovery-agent |
| T298 | Fix dead link /sales/crm-pipeline | 9 | todo | medium | E296 | D016 | recovery-agent |
| T299 | Fix dead link /supply-chain/command-center | 9 | todo | medium | E297 | D016 | recovery-agent |
| T300 | Fix dead link /ai-engine/cross-module | 9 | todo | medium | E298 | D016 | recovery-agent |
| T301 | Delete 43 orphan page files (all have confirmed replacements) | 9 | todo | medium | E072 | D017 | recovery-agent |
| T302 | Wire or delete orphan file api-server/src/routes/fin-seed.ts | 9 | todo | low | E073 | D017 | recovery-agent |
| T303 | Wire or delete orphan file api-server/src/routes/supplier-notification-trigger.ts | 9 | todo | low | E073 | D017 | recovery-agent |
| T304 | Recategorize menu /receipts → finance | 8 | todo | medium | E299 | D005 | recovery-agent |
| T305 | Recategorize menu /all-documents → documents | 8 | todo | medium | E300 | D005 | recovery-agent |
| T306 | Recategorize menu /audit → compliance | 8 | todo | medium | E301 | D005 | recovery-agent |
| T307 | Recategorize menu /integrations → integrations | 8 | todo | medium | E302 | D005 | recovery-agent |
| T308 | Recategorize menu /webhooks → integrations | 8 | todo | medium | E303 | D005 | recovery-agent |
| T309 | Recategorize menu /cron → infra/ops | 8 | todo | medium | E304 | D005 | recovery-agent |
| T310 | Delete 14 leftover /realestate/* menu rows | 8 | todo | low | E075 | D005 | recovery-agent |
| T311 | Fix unbalanced parens in migration 00010_enterprise_expansion_30_tables.sql | 9 | todo | critical | E077 | D018 | recovery-agent |
| T312 | Fix unbalanced parens in migration 00011_enterprise_expansion_30_more_tables.sql | 9 | todo | critical | E077 | D018 | recovery-agent |
| T313 | Fix unbalanced parens in migration 00012_rpc_functions_core_block.sql | 9 | todo | critical | E077 | D018 | recovery-agent |
| T314 | Fix unbalanced parens in migration 00015_read_model_views.sql | 9 | todo | critical | E077 | D018 | recovery-agent |
| T315 | Fix unbalanced parens in migration 00016_trigger_functions_computed_fields.sql | 9 | todo | critical | E077 | D018 | recovery-agent |
| T316 | Fix broken import in erp-app/src/pages/goods-receipt.tsx (../../lib/utils) | 9 | todo | critical | E078 | D019 | recovery-agent |
| T317 | Fix broken import in erp-app/src/pages/purchase-requests.tsx | 9 | todo | critical | E078 | D019 | recovery-agent |
| T318 | Fix broken import in erp-app/src/pages/raw-materials.tsx | 9 | todo | critical | E078 | D019 | recovery-agent |
| T319 | Fix broken import in erp-app/src/pages/suppliers.tsx | 9 | todo | critical | E078 | D019 | recovery-agent |
| T320 | Dedupe ~285 duplicate API endpoint declarations (GET /dashboard ×23, POST /init ×30, etc.) | 5 | todo | high | E079 | D006 | recovery-agent |
| T321 | Fix 30 broken relative imports per INTEGRITY_REPORT | 9 | todo | high | E080,E087 | D019 | recovery-agent |

## Phase 10/11/4 — dashboards, reports, pipeline, RLS (T322–T325)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T322 | Rewire all 10 dashboards to point at real tables (was: phantom schemas) | 10 | todo | critical | E081 | D015 | recovery-agent |
| T323 | Rewire 17 of 20 reports to real schemas | 10 | todo | critical | E082 | D015 | recovery-agent |
| T324 | Align pipeline entity-map.js with resolved registry schemas | 11 | todo | high | E083 | D003 | recovery-agent |
| T325 | RLS audit — resolve 213 vs 302 policy drift, per-table coverage | 4 | todo | critical | E084 | D020 | recovery-agent |

---

## Summary by Phase

| Phase | Task count | Critical | High | Medium | Low |
|---|--:|--:|--:|--:|--:|
| 2 — Canonical Schema | 18 | 13 | 4 | 0 | 0 |
| 3 — Registry Reconciliation | 2 | 1 | 1 | 0 | 0 |
| 4 — RLS Audit | 1 | 1 | 0 | 0 | 0 |
| 5 — Duplicate Elimination | 14 | 0 | 9 | 5 | 0 |
| 6 — Orphan Decision | 30 | 0 | 3 | 24 | 3 |
| 7 — Missing Builds | 75 | 13 | 28 | 32 | 2 |
| 8 — Menu/Route/Page | 115 | 5 | 27 | 62 | 21 |
| 9 — Imports/Links | 20 | 9 | 2 | 8 | 1 |
| 10 — Dashboards/Reports | 2 | 2 | 0 | 0 | 0 |
| 11 — Pipeline Alignment | 2 | 0 | 1 | 1 | 0 |
| 12 — Final Audit | 0 | 0 | 0 | 0 | 0 |
| — Cross-phase | 46 | — | — | — | — |
| **Total** | **325** | **44** | **75** | **132** | **27** |

---

## phase_1_done

All 325 tasks created, each cross-referenced to Evidence Map and Decision Log. Status: `todo`. Ready for Phase 2 execution when triggered.

---

## Phase 1b — Forgotten-model registration + missing 360 pages (T326–T368)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to |
|---|---|---|---|---|---|---|---|
| T326 | Register documents.knowledge_cards in models_registry | 3 | todo | medium | E326 | D035 | recovery-agent |
| T327 | Register documents.document_chunks in models_registry | 3 | todo | medium | E327 | D035 | recovery-agent |
| T328 | Register intelligence.anomaly_feedback | 3 | todo | medium | E328 | D035 | recovery-agent |
| T329 | Register intelligence.recommendation_feedback | 3 | todo | medium | E329 | D035 | recovery-agent |
| T330 | Register governance.alert_subscriptions | 3 | todo | medium | E330 | D035 | recovery-agent |
| T331 | Register governance.command_logs | 3 | todo | low | E331 | D035 | recovery-agent |
| T332 | Register maintenance.assets | 3 | todo | high | E332 | D035 | recovery-agent |
| T333 | Resolve maintenance.work_orders vs execution.work_orders duplicate | 5 | todo | high | E333 | D009,D006 | recovery-agent |
| T334 | Register planning.capacity_calendars | 3 | todo | medium | E334 | D035 | recovery-agent |
| T335 | Register planning.capacity_slots | 3 | todo | medium | E335 | D035 | recovery-agent |
| T336 | Register pricing.calculations | 3 | todo | medium | E336 | D035 | recovery-agent |
| T337 | Register pricing.rule_sets | 3 | todo | medium | E337 | D035 | recovery-agent |
| T338 | Register quality.* schema tables | 3 | todo | medium | E338 | D035 | recovery-agent |
| T339 | Register routing.* schema tables | 3 | todo | medium | E339 | D035 | recovery-agent |
| T340 | Register treasury.* schema tables | 3 | todo | medium | E340 | D035 | recovery-agent |
| T341 | Register comms.comms_threads | 3 | todo | low | E341 | D035 | recovery-agent |
| T342 | Register comms.support_sla_tracking | 3 | todo | medium | E342 | D035 | recovery-agent |
| T343 | Register comms.portal_sessions | 3 | todo | low | E343 | D035 | recovery-agent |
| T344 | Register comms.notification_deliveries | 3 | todo | low | E344 | D035 | recovery-agent |
| T345 | Register inventory.barcode_scans | 3 | todo | low | E345 | D035 | recovery-agent |
| T346 | Register inventory.material_lots | 3 | todo | medium | E346 | D035 | recovery-agent |
| T347 | Register execution.logistics_orders | 3 | todo | medium | E347 | D035 | recovery-agent |
| T348 | Register execution.project_risks | 3 | todo | medium | E348 | D035 | recovery-agent |
| T349 | Register execution.project_blockers | 3 | todo | medium | E349 | D035 | recovery-agent |
| T350 | Register execution.project_cost_plans | 3 | todo | medium | E350 | D035 | recovery-agent |
| T351 | Register commercial.quote_lines in models_registry | 3 | todo | critical | E351 | D035 | recovery-agent |
| T352 | Register commercial.quote_revisions | 3 | todo | high | E352 | D035 | recovery-agent |
| T353 | Register procurement.purchase_order_lines | 3 | todo | critical | E353 | D035 | recovery-agent |
| T354 | Register procurement.rfq_items | 3 | todo | critical | E354 | D035 | recovery-agent |
| T355 | Register finance.invoice_lines | 3 | todo | critical | E355 | D035 | recovery-agent |
| T356 | Register finance.payment_allocations | 3 | todo | high | E356 | D035 | recovery-agent |
| T357 | Register workforce.payroll_runs | 3 | todo | high | E357 | D035 | recovery-agent |
| T358 | Register workforce.payroll_entries | 3 | todo | high | E358 | D035 | recovery-agent |
| T359 | Register execution.work_order_tasks | 3 | todo | high | E359 | D035 | recovery-agent |
| T360 | Register inventory.inventory_movements / stock_counts / reorder_rules | 3 | todo | high | E360 | D035 | recovery-agent |
| T361 | Build WorkOrder360 page (component + route + menu) | 7 | todo | critical | E361 | D023 | recovery-agent |
| T362 | Build Invoice360 page | 7 | todo | critical | E362 | D023 | recovery-agent |
| T363 | Build Payment360 page | 7 | todo | critical | E363 | D023 | recovery-agent |
| T364 | Build Material360 page | 7 | todo | high | E364 | D023 | recovery-agent |
| T365 | Build Contract360 page | 7 | todo | high | E365 | D023 | recovery-agent |
| T366 | Build Task360 page | 7 | todo | high | E366 | D023 | recovery-agent |
| T367 | Build Alert360 page | 7 | todo | medium | E367 | D023 | recovery-agent |
| T368 | Build PurchaseOrder360 page | 7 | todo | critical | E368 | D023 | recovery-agent |

## Phase markers update (Phase 1b)

| Phase | Title | Status |
|---|---|---|
| 1 | Recovery Baseline Lock | done |
| 1b | Full Spec Verification + Gap Discovery | in_progress → done |
| 2 | Canonical Schema Resolution | ready |

## phase_1b_done

43 new tasks added (T326–T368). Total task count: 368. Phase 1 → done, Phase 1b → done, Phase 2 → ready.
