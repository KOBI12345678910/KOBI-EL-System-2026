# DOMAIN — finance

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `finance` |
| Evidence | `B-E013` `B-E015` VAT_18_UPDATE.md DISCOVERY §D |

## 1. domain_checklist

### expected_models (24)
invoices, invoice_lines, payments, payment_allocations, receipts, expenses, expense_categories (planned), cashflow_entries, budget_entries, gl_transactions, tax_records, vat_records, tax_exports, annual_tax_reports, fx_rates, bank_files, bank_matches, collection_cases, collection_actions, dunning_campaigns, dunning_steps, reconciliation_exceptions, reminder_schedules, consolidation_entries, costing_entries, profitability_snapshots (planned), invoice_items (alias→invoice_lines)

### required_pages
InvoicesList, Invoice360, PaymentsList, Payment360 (NEW/mapped), ReceiptsList, ExpensesList, CashflowPage, BudgetPage, GLLedgerPage, TaxRecordsList, VATRecordsList (18% updated), TaxExportsList, BankFilesList, BankReconciliationPage, CollectionsPage, CollectionCaseDetail, DunningCampaignsPage, FxRatesPage, ProfitabilityDashboard, Finance360 (MISSING — cross-entity finance summary)

### required_forms
NewInvoice (+lines), ReceivePayment, LogReceipt, LogExpense, GenerateTaxExport, ImportBankFile, MatchBankTransaction, OpenCollectionCase, RunDunningCampaign, EditFxRate

### required_routes
`/invoices`, `/invoice/:id`, `/payments`, `/payment/:id`, `/receipts`, `/expenses`, `/cashflow`, `/budget`, `/gl`, `/tax-records`, `/vat-records`, `/tax-exports`, `/bank-files`, `/bank-reconciliation`, `/collections`, `/collection/:id`, `/dunning`, `/fx-rates`, `/finance-360`

### required_reports
ar_aging_report, ap_aging_report, vat_18_report, annual_tax_report, cashflow_forecast_report, budget_variance_report, project_profitability_report, gl_trial_balance_report, customer_collection_performance_report

### required_dashboards
FinanceControlRoom, CashflowDashboard, ARDashboard, APDashboard, TaxComplianceDashboard, ProfitabilityDashboard

### required_flows
- invoice → payment → GL state machine
- dunning → collection → write-off flow
- bank-file → match → reconcile flow
- VAT 18% period-close flow (post VAT_18_UPDATE)

### critical_relations
- invoices 1—* invoice_lines; invoices 1—* payments; invoices 1—* payment_allocations
- payments 1—* payment_allocations (split across invoices)
- collection_cases 1—* collection_actions; dunning_campaigns 1—* dunning_steps
- bank_files 1—* bank_matches
- all invoices/payments/receipts/expenses → gl_transactions

### completion_gate
- **Invoice360** MUST include invoice_lines surface
- **Payment360** MUST exist or be explicitly mapped
- gl_transactions needs surface OR explicit internal decision
- collections + dunning need UI + API + permissions

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables finance.* | 24 |
| Registry models | 2 full + 22 partial |
| API routers | 27 |
| Pages | 60 |
| Menu entries | 60 |
| Dashboards | 2 connected + 1 broken |
| Reports | 4 connected + 5 hidden |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | invoice_items(alias→invoice_lines), expense_categories, profitability_snapshots |
| **ghost tables (big cluster)** | invoice_lines, gl_transactions, payment_allocations, vat_records, tax_records, tax_exports, annual_tax_reports, bank_files, bank_matches, budget_entries, collection_actions, collection_cases, consolidation_entries, costing_entries, dunning_campaigns, dunning_steps, fx_rates, reconciliation_exceptions, reminder_schedules |
| **broken** | Invoice360 missing lines; Payment360 absent; Finance360 absent |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | wire invoice_lines into Invoice360; create Payment360; create Finance360 shell |
| build_now | wire collections + dunning UI; wire bank reconciliation page; wire GL ledger page |
| internal_only | consolidation_entries, fx_rates (auto-sourced), reminder_schedules (automation) |
| postpone | advanced budget v2 |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/24 tables verified; pending Phase 11.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 30 |
| business_readiness | blocked |
| gate_status | blocked — 3 360 pages missing |
| red rows | 15 |
