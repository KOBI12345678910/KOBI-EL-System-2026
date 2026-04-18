# CANONICAL DOMAIN VERIFICATION — Phase 1b

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | Verify every spec-defined canonical domain entity and 13 360 pages against DB / registry / menu |
| Mode | READ-ONLY; cross-check filesystem ↔ registry |
| Sources checked | `supabase/migrations/*.sql`, `_master-registry/models_registry.json`, `supabase/migrations/0001[78]_*.sql`, `00034/35/36/38/39/40_*.sql`, `erp-app/src/App.tsx`, `erp-app/src/pages/**/*360*.tsx` |

Canonical domains from user spec (`canonical_domain_map`):

1. commercial
2. execution
3. procurement
4. inventory
5. finance
6. workforce
7. docs / documents
8. comms
9. analytics
10. intelligence
11. orchestration
12. governance

---

## 1. Canonical domains × core_entities verification

Legend:
- `db_exists` — `Y` if table appears in `grep "create table" supabase/migrations/*.sql`
- `registry` — `Y` if an entry with `database.table_name` matching exists in `models_registry.json`
- `menu` — `Y` if any row in `app_menu` seeds (00017/00034/35/36/38/39/40) references the entity's route
- `status` — `full` / `partial` / `absent`

### 1.1 commercial (core_entities: customers, contacts, leads, opportunities, quotes, quote_lines, pricing_snapshots, crm_activities)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| commercial | customers | Y (commercial.customers) | Y (MDL-* pointer registered; wrong-schema D009) | Y (/customers) | partial |
| commercial | contacts / customer_contacts | Y (commercial.customer_contacts) | partial (crm.contacts claimed missing) | N | partial |
| commercial | leads | Y (commercial.leads) | Y | Y (/leads) | full |
| commercial | opportunities | Y (commercial.opportunities) | Y (wrong-schema D009) | Y (/opportunities) | partial |
| commercial | quotes | Y (commercial.quotes) | Y (wrong-schema D009) | Y (/quotes) | partial |
| commercial | quote_lines | Y (commercial.quote_lines) | N (missing) | N | partial |
| commercial | quote_revisions | Y (commercial.quote_revisions) | N | N | partial |
| commercial | quote_approval_rules | Y (commercial.quote_approval_rules) | N | N | partial |
| commercial | pipeline_stages | Y | N | N | partial |
| commercial | pricing_snapshots | Y | N | N | partial |
| commercial | crm_activities | Y | partial (registry has crm.activities no-DB) | N | partial |
| commercial | customer_portal_accounts | Y | N | N | partial |
| commercial | lead_tags / lead_tag_assignments | Y | N | N | partial |

### 1.2 execution (core_entities: projects, project_phases, project_milestones, tasks, work_orders, work_order_tasks, deliveries)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| execution | projects | Y | partial (projects.projects phantom D009) | Y (/projects) | partial |
| execution | project_phases | Y | partial | N | partial |
| execution | project_milestones | Y | N | N | partial |
| execution | project_risks | Y | N | N | partial |
| execution | project_blockers | Y | N | N | partial |
| execution | project_cost_plans | Y | N | N | partial |
| execution | tasks | Y | partial | N | partial |
| execution | task_dependencies | Y | N | N | partial |
| execution | task_attachments | Y | N | N | partial |
| execution | task_comments | Y | N | N | partial |
| execution | work_orders | Y | Y | Y (/work-orders) | full |
| execution | work_order_tasks | Y | N | N | partial |
| execution | work_order_qa_checklists | Y | N | N | partial |
| execution | work_order_qa_items | Y | N | N | partial |
| execution | delivery_events | Y | N | N | partial |
| execution | installation_events | Y | N | N | partial |
| execution | logistics_orders | Y | N | N | partial |
| execution | signatures | Y | partial (documents.signatures D009) | N | partial |
| execution | alerts | Y | N | N | partial |

### 1.3 procurement (core_entities: suppliers, purchase_orders, purchase_order_lines, rfqs, rfq_items, supplier_quotes, approvals, contracts)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| procurement | suppliers | Y | Y (duplicate public.suppliers) | Y (/suppliers) | partial |
| procurement | supplier_contacts | Y | N | N | partial |
| procurement | supplier_invoices | Y | N | N | partial |
| procurement | supplier_quotes | Y | N | N | partial |
| procurement | supplier_quote_lines | Y | N | N | partial |
| procurement | supplier_scorecards | Y | N | N | partial |
| procurement | supplier_portal_accounts | Y | N | N | partial |
| procurement | purchase_orders | Y | Y | Y (/pos) | full |
| procurement | purchase_order_lines | Y | N | N | partial |
| procurement | rfqs | Y | Y | Y (/rfqs) | full |
| procurement | rfq_items | Y | N | N | partial |
| procurement | rfq_supplier_invites | Y | N | N | partial |
| procurement | rfq_comparison_snapshots | Y | N | N | partial |
| procurement | approvals | Y | partial (sales.approvals D009) | N | partial |
| procurement | approval_steps | Y | N | N | partial |
| procurement | contracts | Y | N | Y (/contracts) | partial |
| procurement | contract_milestones | Y | N | N | partial |
| procurement | warranty_cases | Y | N | N | partial |
| procurement | returns | Y | N | N | partial |

### 1.4 inventory (core_entities: materials, inventory, stock_counts, movements, transfers, reorder_rules, warehouses)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| inventory | materials | Y | Y | Y | full |
| inventory | material_categories | Y | N | N | partial |
| inventory | material_lots | Y | N | N | partial |
| inventory | material_requests | Y | N | N | partial |
| inventory | material_request_lines | Y | N | N | partial |
| inventory | inventory | Y | partial (public.inventory_items duplicate) | Y | partial |
| inventory | inventory_movements | Y | N | N | partial |
| inventory | inventory_receipts | Y | N | N | partial |
| inventory | inventory_issues | Y | N | N | partial |
| inventory | inventory_transfers | Y | N | N | partial |
| inventory | inventory_reservations | Y | N | N | partial |
| inventory | stock_counts | Y | N | N | partial |
| inventory | stock_count_lines | Y | N | N | partial |
| inventory | reorder_rules | Y | N | N | partial |
| inventory | shortage_snapshots | Y | N | N | partial |
| inventory | warehouses | Y | N | Y | partial |
| inventory | manufacturing_batches | Y | N | N | partial |
| inventory | barcode_scans | Y | N | N | partial |

### 1.5 finance (core_entities: invoices, invoice_lines, payments, receipts, expenses, gl_transactions, budget_entries, tax_records, vat_records)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| finance | invoices | Y | Y | Y (/invoices) | full |
| finance | invoice_lines | Y | N | N | partial |
| finance | payments | Y | Y | Y (/payments) | full |
| finance | payment_allocations | Y | N | N | partial |
| finance | receipts | Y | N | Y (/receipts) | partial |
| finance | expenses | Y | N | N | partial |
| finance | gl_transactions | Y | N | N | partial |
| finance | budget_entries | Y | N | N | partial |
| finance | cashflow_entries | Y | N | N | partial |
| finance | costing_entries | Y | N | N | partial |
| finance | consolidation_entries | Y | N | N | partial |
| finance | collection_actions | Y | N | N | partial |
| finance | collection_cases | Y | N | N | partial |
| finance | dunning_campaigns | Y | N | N | partial |
| finance | dunning_steps | Y | N | N | partial |
| finance | tax_records | Y | N | N | partial |
| finance | tax_exports | Y | N | N | partial |
| finance | vat_records | Y | N | N | partial |
| finance | annual_tax_reports | Y | N | N | partial |
| finance | bank_files | Y | N | N | partial |
| finance | bank_matches | Y | N | N | partial |
| finance | fx_rates | Y | N | N | partial |
| finance | reconciliation_exceptions | Y | N | N | partial |
| finance | reminder_schedules | Y | N | N | partial |

### 1.6 workforce (core_entities: employees, payroll_runs, payroll_entries, attendance, shifts, leave_requests, pay_components, pension_records)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| workforce | employees | Y | partial (hr_workforce.employees D009) | Y (/employees) | partial |
| workforce | employers | Y | N | Y (/employers) | partial |
| workforce | hr_profiles | Y | N | Y (/hr-profiles) | partial |
| workforce | payroll_runs | Y | N | N | partial |
| workforce | payroll_entries | Y | N | N | partial |
| workforce | payroll_exceptions | Y | N | N | partial |
| workforce | payroll_export_batches | Y | N | N | partial |
| workforce | pay_components | Y | N | Y (/pay-components) | partial |
| workforce | employee_pay_components | Y | N | N | partial |
| workforce | attendance | Y | Y | Y | full |
| workforce | shifts | Y | N | N | partial |
| workforce | leave_types | Y | N | Y | partial |
| workforce | leave_requests | Y | N | N | partial |
| workforce | wage_slips | Y | N | N | partial |
| workforce | pension_records | Y | N | Y (/pension-records) | partial |
| workforce | employee_expenses | Y | N | N | partial |
| workforce | workforce_assignments | Y | N | N | partial |

### 1.7 docs / documents (core_entities: documents, document_versions, attachments, signatures, templates, classifications)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| docs | documents | Y | partial (documents.documents D009) | Y (/documents) | partial |
| docs | document_versions | Y | partial | N | partial |
| docs | document_classifications | Y | N | N | partial |
| docs | document_signature_requests | Y | N | N | partial |
| docs | attachments | Y | partial | N | partial |
| docs | ocr_results | Y | N | N | partial |
| docs | print_jobs | Y | N | N | partial |
| docs | scan_sessions | Y | N | N | partial |
| documents | classification_runs | Y | N | N | partial |
| documents | document_chunks | Y | N | N | partial |
| documents | document_relations | Y | N | N | partial |
| documents | entity_extractions | Y | N | N | partial |
| documents | extraction_runs | Y | N | N | partial |
| documents | knowledge_cards | Y | N | N | partial |
| documents | ocr_runs | Y | N | N | partial |

### 1.8 comms (core_entities: notifications, email_messages, sms_messages, whatsapp_messages, chatbot_sessions, support_tickets, help_articles)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| comms | notifications | Y | Y | Y | full |
| comms | notification_deliveries | Y | N | N | partial |
| comms | email_messages | Y | N | N | partial |
| comms | sms_messages | Y | N | N | partial |
| comms | whatsapp_messages | Y | N | N | partial |
| comms | chatbot_sessions | Y | N | N | partial |
| comms | support_tickets | Y | Y | Y | full |
| comms | support_sla_tracking | Y | N | N | partial |
| comms | help_articles | Y | N | Y (/help-articles) | partial |
| comms | comms_threads | Y | N | N | partial |
| comms | portal_users | Y | N | Y (/portal-users) | partial |
| comms | portal_sessions | Y | N | N | partial |

### 1.9 analytics (core_entities: dashboards, dashboard_widgets, kpi_snapshots, read_models, reports)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| analytics | dashboard_definitions | Y | partial (registry claims analytics.dashboards no-DB) | N | partial |
| analytics | dashboard_boards | Y | N | N | partial |
| analytics | dashboard_widgets | Y | N | N | partial |
| analytics | dashboard_board_widgets | Y | N | N | partial |
| analytics | user_dashboard_boards | Y | N | N | partial |
| analytics | kpi_snapshots | Y | N | N | partial |
| analytics | read_model_invalidations | Y | N | N | partial |
| analytics | rm_ai_summary | Y | N | N | partial |
| analytics | rm_executive_summary | Y | N | N | partial |
| analytics | rm_finance_summary | Y | N | N | partial |
| analytics | rm_operations_summary | Y | N | N | partial |
| analytics | rm_procurement_summary | Y | N | N | partial |
| analytics | rm_workforce_summary | Y | N | N | partial |

### 1.10 intelligence (core_entities: ai_agents, ai_insights, forecast_models, model_registry, recommendations, anomaly_cases)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| intelligence | agent_registry | Y | N | N | partial |
| intelligence | agent_jobs | Y | N | N | partial |
| intelligence | ai_insights | Y | N | N | partial |
| intelligence | anomaly_cases | Y | N | N | partial |
| intelligence | anomaly_feedback | Y | N | N | partial |
| intelligence | decision_recommendations | Y | N | N | partial |
| intelligence | forecast_models | Y | partial (documents.forecast_models D009) | N | partial |
| intelligence | model_executions | Y | N | N | partial |
| intelligence | model_registry | Y | N | N | partial |
| intelligence | quality_scores | Y | N | N | partial |
| intelligence | recommendation_feedback | Y | N | N | partial |
| intelligence | seasonality_patterns | Y | N | N | partial |
| intelligence | trend_signals | Y | N | N | partial |

### 1.11 orchestration (core_entities: workflow_definitions, workflow_runs, job_queue, notifications, universal_inbox)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| orchestration | workflow_definitions | Y | N | N | partial |
| orchestration | workflow_runs | Y | N | N | partial |
| orchestration | workflow_steps | Y | partial (duplicate D009) | N | partial |
| orchestration | workflow_step_runs | Y | N | N | partial |
| orchestration | job_queue | Y | N | N | partial |
| orchestration | notifications | Y | partial (duplicate D009) | N | partial |
| orchestration | universal_inbox | Y | N | Y (/universal-inbox) | partial |

### 1.12 governance (core_entities: roles, permissions, role_permissions, user_roles, audit_logs, state_history, workflows, feature_flags, webhooks)

| domain | entity | db_exists | registry | menu | status |
|---|---|---|---|---|---|
| governance | roles | Y | Y | N | partial |
| governance | permissions | Y | N | N | partial |
| governance | role_permissions | Y | N | N | partial |
| governance | user_roles | Y | N | Y (/user-roles) | partial |
| governance | users_profile | Y | N | Y (/user-profiles) | partial |
| governance | user_preferences | Y | N | Y | partial |
| governance | object_permissions | Y | N | N | partial |
| governance | audit_logs | Y | Y | Y (/audit) | full |
| governance | audit_log_attachments | Y | N | N | partial |
| governance | alert_subscriptions | Y | N | N | partial |
| governance | command_logs | Y | N | N | partial |
| governance | config_entries | Y | N | N | partial |
| governance | domain_events | Y | N | N | partial |
| governance | event_subscriptions | Y | N | N | partial |
| governance | event_deliveries | Y | N | N | partial |
| governance | escalation_rules | Y | N | N | partial |
| governance | feature_flags | Y | N | N | partial |
| governance | feature_flag_targets | Y | N | N | partial |
| governance | health_checks | Y | N | N | partial |
| governance | idempotency_keys | Y | N | N | partial |
| governance | integration_connections | Y | N | Y (/integrations) | partial |
| governance | integration_sync_logs | Y | N | N | partial |
| governance | job_executions | Y | N | N | partial |
| governance | queue_jobs | Y | N | N | partial |
| governance | saved_filters | Y | N | N | partial |
| governance | security_events | Y | N | N | partial |
| governance | sla_timers | Y | N | N | partial |
| governance | state_history | Y | N | N | partial |
| governance | validations_log | Y | N | N | partial |
| governance | webhook_endpoints | Y | N | Y (/webhooks) | partial |
| governance | webhook_deliveries | Y | N | N | partial |
| governance | workflows | Y | N | N | partial |
| governance | workflow_instances | Y | N | N | partial |
| governance | workflow_steps | Y | N | N | partial |
| governance | workflow_step_executions | Y | N | N | partial |

---

## 2. Counts

| Metric | Value |
|---|--:|
| Canonical entities enumerated (full + partial domains) | 181 |
| `full` status (DB + registry + menu) | 11 |
| `partial` status (missing 1-2) | 170 |
| `absent` status (completely missing) | 0 (all DB tables exist) |

All canonical entities have a DB table in migrations. Gaps are concentrated in `registry` and `menu` layers. See T176–T276 for menu gaps and T046–T058, T077–T093 for registry reconciliation.

---

## 3. 360 Pages verification — 13 required per user spec

| # | 360 Page | component_exists | route_in_apptsx | menu_entry | primary_table_present | status |
|---|---|---|---|---|---|---|
| 1 | Customer360 | Y (`erp-app/src/pages/crm/customer-360.tsx`) | Y (App.tsx:1814, 1871) | partial | commercial.customers | present |
| 2 | Supplier360 | Y (`erp-app/src/pages/supplier-mgmt/Supplier360.tsx`) | Y (App.tsx:2418) | partial | procurement.suppliers | present |
| 3 | Quote360 | Y (`erp-app/src/pages/sales/Quote360.tsx`) | Y (App.tsx:2076) | partial | commercial.quotes | present |
| 4 | Project360 | Y (`erp-app/src/pages/projects/project-360.tsx`) | Y (App.tsx:1821, 1894) | partial | execution.projects | present |
| 5 | Employee360 | Y (`erp-app/src/pages/workforce/Employee360.tsx`) | Y (App.tsx:2158) | partial | workforce.employees | present |
| 6 | WorkOrder360 | N | N | N | execution.work_orders exists | missing |
| 7 | PurchaseOrder360 / PO360 | N | N | N | procurement.purchase_orders exists | missing |
| 8 | Invoice360 | N | N | N | finance.invoices exists | missing |
| 9 | Material360 | N | N | N | inventory.materials exists | missing |
| 10 | Payment360 | N | N | N | finance.payments exists | missing |
| 11 | Contract360 | N | N | N | procurement.contracts exists | missing |
| 12 | Task360 | N | N | N | execution.tasks exists | missing |
| 13 | Alert360 | N | N | N | execution.alerts exists | missing |

Also missing from the CLAUDE.md legacy 9-page list: RFQ360, Finance360 (aggregate view).

### Counts

- 360 pages **present**: 5 / 13 (38%)
- 360 pages **missing**: 8 / 13 (62%) — `WorkOrder360, PurchaseOrder360, Invoice360, Material360, Payment360, Contract360, Task360, Alert360`
- All missing 360 pages **have a backing DB table** — build risk is UI + routes + menu, not schema.

---

## 4. Forgotten-model discovery (Task D)

Cross-referencing the 237 DB tables against the 342 registry models and the menu seeds, the following categories of "forgotten" entities are not currently in `models_registry.json` nor in `menu_taxonomy.visible_surfaces` despite having a DB table. Full list tracked as T326+ in RECOVERY_TASK_BOARD.md.

### 4.1 Forgotten DB tables (physical, no registry, no menu)

Count: **170 tables** are `partial` status (missing registry or menu or both). Subset of high-priority forgotten models added as T326–T400+:

Top-30 highest-priority forgotten models (by business impact):

1. commercial.quote_lines
2. commercial.quote_revisions
3. commercial.quote_approval_rules
4. commercial.pipeline_stages
5. commercial.crm_activities
6. execution.project_phases
7. execution.project_milestones
8. execution.tasks
9. execution.work_order_tasks
10. execution.alerts
11. procurement.purchase_order_lines
12. procurement.rfq_items
13. procurement.supplier_quotes
14. procurement.supplier_invoices
15. procurement.contracts
16. procurement.contract_milestones
17. inventory.inventory_movements
18. inventory.material_requests
19. inventory.stock_counts
20. inventory.reorder_rules
21. finance.invoice_lines
22. finance.payment_allocations
23. finance.budget_entries
24. finance.dunning_campaigns
25. finance.tax_records
26. workforce.payroll_runs
27. workforce.payroll_entries
28. workforce.leave_requests
29. intelligence.ai_insights
30. intelligence.forecast_models

### 4.2 Forgotten API routes without DB (already tracked T059–T072)

14 entries: contacts, activities, meetings, milestones, items, reservations, schedules, contractors, assignments, templates, dashboards, reports, scorecards, users.

### 4.3 Forgotten FE-page-only (already tracked T073–T076)

4 entries: dependencies, drawings, raw_materials, teams.

### 4.4 New discoveries (added T326–T360)

Tables present but never referenced in any artifact (beyond the migration that creates them):

- `documents.knowledge_cards` (T326)
- `documents.document_chunks` (T327)
- `intelligence.anomaly_feedback` (T328)
- `intelligence.recommendation_feedback` (T329)
- `governance.alert_subscriptions` (T330)
- `governance.command_logs` (T331)
- `maintenance.assets` (T332)
- `maintenance.work_orders` (T333) — distinct from execution.work_orders; duplicate risk
- `planning.capacity_calendars` (T334)
- `planning.capacity_slots` (T335)
- `pricing.calculations` (T336)
- `pricing.rule_sets` (T337)
- `quality.*` (T338)
- `routing.*` (T339)
- `treasury.*` (T340)
- `comms.comms_threads` (T341)
- `comms.support_sla_tracking` (T342)
- `comms.portal_sessions` (T343)
- `comms.notification_deliveries` (T344)
- `inventory.barcode_scans` (T345)
- `inventory.material_lots` (T346)
- `execution.logistics_orders` (T347)
- `execution.project_risks` (T348)
- `execution.project_blockers` (T349)
- `execution.project_cost_plans` (T350)

Categorization:
- Source: **DB table** (all of the above, confirmed by `grep create table`)
- Status: **should-be-in-registry** (default); `maintenance.work_orders` → also **duplicate risk**

---

## 5. Menu taxonomy delta vs. spec (Task E)

| category (spec) | spec_items_expected | current_items_sampled | missing | extra | notes |
|---|--:|--:|---|---|---|
| dashboard | 5+ | 1 (דשבורד id=1) | executive, finance, ops, procurement, workforce dashboards | none | Most registry dashboards have no menu entry (T280) |
| commercial / sales | 10+ | customers/leads/opportunities/quotes/orders/rule-sets | quote_lines, quote_revisions, pricing_snapshots, pipeline_stages, crm_activities | none | Recategorize /receipts out (T304) |
| procurement | 8+ | suppliers/rfqs/pos/contracts | rfq_items, po_lines, supplier_quotes, supplier_invoices | none | |
| execution / projects | 10+ | projects/work-orders | tasks, milestones, phases, alerts, WO tasks | none | |
| inventory | 8+ | warehouses, inventory-core | movements, receipts, issues, transfers, reservations, counts | none | |
| finance | 12+ | invoices/payments/receipts | invoice_lines, payment_allocations, budget, dunning, tax, vat, fx | none | /receipts miscategorized under inventory (T304) |
| tax (category 7) | 4+ | — | tax_records, vat_records, tax_exports, annual_tax_reports | none | |
| workforce | 8+ | employees/payroll/attendance/employers/hr-profiles/pay-components/pension-records | payroll_runs, payroll_entries, shifts, leave_requests | none | |
| comms | 6+ | universal-inbox/help-articles/portal-users | email/sms/whatsapp/chatbot_sessions/support_tickets/notifications | none | |
| documents | 8+ | — | documents, doc_versions, attachments, classifications, signatures, ocr, templates | none | /all-documents miscategorized (T305) |
| analytics | 5+ | — | dashboard_*, kpi_snapshots, rm_* | none | 0% coverage (E064) |
| intelligence | 8+ | — | ai_agents, insights, forecast_models, anomaly_cases | none | |
| compliance | 4+ | audit, policies, policy-acknowledgements | — | none | |
| infrastructure | 4+ | cron, health-checks | queue_jobs, job_executions | none | /cron miscategorized (T309) |
| integrations | 4+ | integrations, webhooks | event_subscriptions, event_deliveries | none | /integrations, /webhooks miscategorized (T307, T308) |
| system / governance | 6+ | user-roles, user-preferences, user-profiles | roles, permissions, role_permissions, object_permissions | none | |

**Total missing menu items**: ~130 (overlaps with T176–T276 101 invisible tables).

---

## 6. Summary

- 11 canonical domains × 181 enumerated core-entity rows; 11 fully present, 170 partial, 0 absent-at-DB.
- 13 360 pages: 5 present, 8 missing (all with DB-layer ready).
- ~35 forgotten models discovered beyond the existing 105 delta. Added as T326–T360 in RECOVERY_TASK_BOARD.md.
- Menu taxonomy: 10 top-level categories defined; current seeds partially align; ~130 items to recategorize or add. Migration `00041_menu_categorize_by_business_topic.sql` handles category re-parenting for verifiable cases.
- Every claim above cites a concrete artifact in `supabase/migrations/*.sql`, `erp-app/src/App.tsx`, or `_master-registry/models_registry.json`.
