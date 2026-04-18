# DOMAIN — commercial

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `commercial` |
| Evidence | `B-E013`, `B-E015`, `B-E016`, `DISCOVERY_RECOVERY_MAP.md` §A §B |

## 1. domain_checklist

### expected_models (18)
customers, customer_contacts, leads, opportunities, quotes, quote_lines, quote_revisions, quote_approval_rules, pricing_snapshots, pipeline_stages, crm_activities, customer_portal_accounts, lead_tags, lead_tag_assignments, lead_sources (planned), customer_segments (planned), sales_orders (planned), pricing_rules (planned)

### required_pages
- CustomersList, Customer360 (primary)
- LeadsList, LeadDetail
- OpportunitiesList, OpportunityDetail
- QuotesList, Quote360 (primary)
- PipelineBoard (kanban over pipeline_stages)
- SalesOrdersList, SalesOrder360 (when sales_orders built)
- CustomerSegmentsList / Builder (planned)
- LeadSourcesList (planned)

### required_forms
NewCustomer, EditCustomer, NewLead, ConvertLeadToOpportunity, NewQuote, QuoteLinesEditor, QuoteRevisionDialog, ApprovalRequestDialog, NewSalesOrder, SegmentBuilder

### required_routes
`/customers`, `/customer/:id`, `/leads`, `/lead/:id`, `/opportunities`, `/opportunity/:id`, `/quotes`, `/quote/:id`, `/pipeline`, `/sales-orders`, `/sales-order/:id`, `/crm/segments`, `/crm/lead-sources`

### required_reports
sales_pipeline_report, quote_win_rate_report, lead_source_attribution_report, customer_lifetime_value_report, segment_performance_report

### required_dashboards
CustomerHealthDashboard, SalesPipelineDashboard, QuoteMarginDashboard, ConversionFunnelDashboard

### required_flows
- sales_to_cash (flow_1 in pipeline/workflow-flows.js)
- quote_to_order (flow_2)
- lead → opportunity → quote → order state machine

### critical_relations
- customers 1—* opportunities; customers 1—* quotes; customers 1—* sales_orders; customers 1—* projects; customers 1—* invoices
- opportunities *—1 pipeline_stages; opportunities 1—1 quotes (optional); opportunities 1—* crm_activities
- quotes 1—* quote_lines; quotes 1—* quote_revisions; quotes *—* quote_approval_rules (by amount threshold)
- leads *—1 lead_sources; leads 1—0..1 customers (converted)

### completion_gate
- Quote360 must include real **commercial.quote_lines** editor
- sales_orders / pricing_rules / customer_segments / lead_sources must have explicit state decision (not `unknown`)
- Canonical pointer: `commercial.quotes` not `sales.quotes` (D009)

## 2. DISCOVERY — actual counts per layer

| layer | count | notes |
|---|---:|---|
| DB tables in schema | 14 (13 commercial + 3 crm_legacy overlap) | from `_all_tables.txt` |
| Registry models | 8 claimed full + 7 partial | models_registry.json |
| API routers touching domain | 22 | crm-*, sales-*, customer-*, quote-*, lead-*, pipeline-*, opportunity-* |
| Pages in App.tsx | 46 | `/customers` subtree + `/crm` + `/sales` + `/leads` + `/quotes` + `/opportunities` |
| Menu entries | 47 | seed migrations 00017/00034-41 |
| Dashboards | 4 registry; 2 connected | |
| Reports | 3 connected + 2 hidden | |
| Flows | 2 of 5 touch domain | |

## 3. GAPS — missing / hidden / broken

| class | items |
|---|---|
| **truly missing (planned_locked)** | lead_sources, communication_logs, customer_segments, quote_items (alias), pricing_rules, discounts, sales_orders, sales_pipeline |
| **wrong-schema (hidden)** | customers (crm→commercial), opportunities (sales→commercial), quotes (sales→commercial) |
| **ghost tables (built_not_exposed)** | quote_lines, quote_revisions, quote_approval_rules, pipeline_stages, pricing_snapshots, customer_portal_accounts, lead_tags, lead_tag_assignments, crm_activities |
| **broken** | 0 runtime pages; 2 opportunities reports hidden; 2 dashboards missing source |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now (Phase 2/3) | fix 3 wrong-schema pointers in registry; expose quote_lines editor surface; decide pipeline_stages page |
| build_now (Phase 7) | lead_sources, customer_segments, sales_orders, pricing_rules, discounts, sales_pipeline, quote_items canonical alias |
| internal_only (decision) | pricing_snapshots (audit snapshots), lead_tag_assignments (link table) |
| postpone | customer_portal_accounts (portal feature postponed to Phase 14) |
| remove_from_registry | **N/A per ZERO LOSS** — all items kept, status=`planned_locked` or `built_internal_only` |

## 5. DEPLOYMENT

| target | count | status |
|---|---:|---|
| tables_verified_in_supabase | 0/14 | pending Phase 11 |
| code_verified_in_github | 0 | pending Phase 12 |

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 42 |
| business_readiness | partial |
| gate_status | blocked — quote_lines editor surface missing |
| red rows in SYSTEM_CONNECTION_MATRIX | 3 (quote_lines, quote_revisions, quote_approval_rules) |
