import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const ReceiptsPage = lazyPage(() => import("@/pages/finance/receipts"));
const AccountsPayablePage = lazyPage(() => import("@/pages/finance/accounts-payable"));
const AccountsReceivablePage = lazyPage(() => import("@/pages/finance/accounts-receivable"));
const FinanceDashboard = lazyPage(() => import("@/pages/finance/finance-dashboard"));
const BalanceSheetPage = lazyPage(() => import("@/pages/finance/balance-sheet"));
const IncomePage = lazyPage(() => import("@/pages/finance/income"));
const ExpensesPage = lazyPage(() => import("@/pages/finance/expenses"));
const CreditCardProcessingPage = lazyPage(() => import("@/pages/finance/credit-card-processing"));
const AccountingPortalPage = lazyPage(() => import("@/pages/finance/accounting-portal"));
const ReportsPage = lazyPage(() => import("@/pages/finance/reports"));
const IncomeExpensesReportPage = lazyPage(() => import("@/pages/finance/income-expenses-report"));
const AccountingReportsPage = lazyPage(() => import("@/pages/finance/accounting-reports"));
const DebtorsBalancesPage = lazyPage(() => import("@/pages/finance/debtors-balances"));
const OperationalProfitPage = lazyPage(() => import("@/pages/finance/operational-profit"));
const AccountingSettingsPage = lazyPage(() => import("@/pages/finance/accounting-settings"));
const ExpenseItemsPage = lazyPage(() => import("@/pages/finance/expense-items"));
const ExpenseUploadPage = lazyPage(() => import("@/pages/finance/expense-upload"));
const ExpenseFilingPage = lazyPage(() => import("@/pages/finance/expense-filing"));
const ExpenseFilesPage = lazyPage(() => import("@/pages/finance/expense-files"));
const BlackRockDashboard = lazyPage(() => import("@/pages/finance/blackrock-dashboard"));
const BlackRockMonteCarlo = lazyPage(() => import("@/pages/finance/blackrock-monte-carlo"));
const BlackRockVar = lazyPage(() => import("@/pages/finance/blackrock-var"));
const BlackRockRiskMatrix = lazyPage(() => import("@/pages/finance/blackrock-risk-matrix"));
const BlackRockHedging = lazyPage(() => import("@/pages/finance/blackrock-hedging"));
const BlackRockAI = lazyPage(() => import("@/pages/finance/blackrock-ai"));
const PaymentAnomaliesPage = lazyPage(() => import("@/pages/finance/payment-anomalies"));
const StandingOrdersPage = lazyPage(() => import("@/pages/finance/standing-orders"));
const JournalEntriesPage = lazyPage(() => import("@/pages/finance/financial-transactions"));
const JournalPage = lazyPage(() => import("@/pages/finance/journal"));
const BankReconciliationPage = lazyPage(() => import("@/pages/finance/bank-reconciliation"));
const CashFlowPage = lazyPage(() => import("@/pages/finance/cash-flow"));
const TaxManagementPage = lazyPage(() => import("@/pages/finance/tax-management"));
const IsraeliIntegrationsPage = lazyPage(() => import("@/pages/finance/israeli-integrations"));
const CostCentersPage = lazyPage(() => import("@/pages/finance/cost-centers"));
const InvoicesPage = lazyPage(() => import("@/pages/finance/invoices"));
const CreditNotesPage = lazyPage(() => import("@/pages/finance/credit-notes"));
const CustomerInvoicesPage = lazyPage(() => import("@/pages/finance/customers/invoices"));
const CustomerRefundsPage = lazyPage(() => import("@/pages/finance/customers/refunds"));
const CustomerPaymentsPage = lazyPage(() => import("@/pages/finance/customers/payments"));
const CustomerProductsPage = lazyPage(() => import("@/pages/finance/customers/products"));
const SupplierInvoicesPage = lazyPage(() => import("@/pages/finance/suppliers/invoices"));
const SupplierCreditNotesPage = lazyPage(() => import("@/pages/finance/suppliers/credit-notes"));
const SupplierPaymentsPage = lazyPage(() => import("@/pages/finance/suppliers/payments"));
const SupplierProductsPage = lazyPage(() => import("@/pages/finance/suppliers/products"));
const AgingReportPage = lazyPage(() => import("@/pages/finance/aging-report"));
const ChartOfAccountsPage = lazyPage(() => import("@/pages/finance/chart-of-accounts"));
const PettyCashPage = lazyPage(() => import("@/pages/finance/petty-cash"));
const ExpenseClaimsPage = lazyPage(() => import("@/pages/finance/expense-claims"));
const PaymentRunsPage = lazyPage(() => import("@/pages/finance/payment-runs"));
const WithholdingTaxPage = lazyPage(() => import("@/pages/finance/withholding-tax"));
const GeneralLedgerPage = lazyPage(() => import("@/pages/finance/general-ledger"));
const ExpenseReportsPage = lazyPage(() => import("@/pages/finance/expense-reports"));
const FinanceFixedAssetsPage = lazyPage(() => import("@/pages/finance/finance-fixed-assets"));
const FinancialReportsPage = lazyPage(() => import("@/pages/finance/financial-reports-page"));
const ProfitLossPage = lazyPage(() => import("@/pages/finance/profit-loss-page"));
const FinControlCenterPage = lazyPage(() => import("@/pages/finance/fin-control-center"));
const PaymentTermsPage = lazyPage(() => import("@/pages/finance/payment-terms"));
const DebitNotesPage = lazyPage(() => import("@/pages/finance/debit-notes"));
const RevenueTrackingPage = lazyPage(() => import("@/pages/finance/revenue-tracking"));
const ExpenseBreakdownPage = lazyPage(() => import("@/pages/finance/expense-breakdown"));
const ProjectProfitabilityPage = lazyPage(() => import("@/pages/finance/project-profitability"));
const CustomerProfitabilityPage = lazyPage(() => import("@/pages/finance/customer-profitability"));
const SupplierCostAnalysisPage = lazyPage(() => import("@/pages/finance/supplier-cost-analysis"));
const ProfitCentersPage = lazyPage(() => import("@/pages/finance/profit-centers"));
const CreditManagementPage = lazyPage(() => import("@/pages/finance/credit-management"));
const TreasuryManagementPage = lazyPage(() => import("@/pages/finance/treasury-management"));
const ManagementReportingPage = lazyPage(() => import("@/pages/finance/management-reporting"));
const BudgetVsActualPage = lazyPage(() => import("@/pages/finance/budget-vs-actual"));
const PaymentRemindersPage = lazyPage(() => import("@/pages/finance/payment-reminders"));
const BudgetDepartmentsPage = lazyPage(() => import("@/pages/finance/budget-departments"));
const ReportCustomerAgingPage = lazyPage(() => import("@/pages/reports/financial/report-customer-aging"));
const ReportVendorAgingPage = lazyPage(() => import("@/pages/reports/financial/report-vendor-aging"));
const ReportVatPage = lazyPage(() => import("@/pages/reports/financial/report-vat"));
const ReportFiscalPage = lazyPage(() => import("@/pages/reports/financial/report-fiscal"));
const ReportInvoiceAnalysisPage = lazyPage(() => import("@/pages/reports/financial/report-invoice-analysis"));
const ReportExecutiveSummaryPage = lazyPage(() => import("@/pages/reports/financial/report-executive-summary"));
const CustomerVendorLedgerPage = lazyPage(() => import("@/pages/reports/financial/customer-vendor-ledger"));
const FinancialAnalyticsPage = lazyPage(() => import("@/pages/finance/financial-analytics"));
const FinanceBudgetsPage = lazyPage(() => import("@/pages/finance/budgets"));
const ChecksManagementPage = lazyPage(() => import("@/pages/finance/checks-management"));
const CurrenciesManagementPage = lazyPage(() => import("@/pages/finance/currencies-management"));
const RevenuesPage = lazyPage(() => import("@/pages/finance/revenues-page"));
const FinPaymentsPage = lazyPage(() => import("@/pages/finance/payments"));
const ContractorPaymentDecisionPage = lazyPage(() => import("@/pages/finance/contractor-payment-decision-model"));
const AnalyticalReportsPage = lazyPage(() => import("@/pages/finance/analytical-reports"));
const AnnualReportPage = lazyPage(() => import("@/pages/finance/annual-report"));
const AuditControlPage = lazyPage(() => import("@/pages/finance/audit-control"));
const BudgetTrackingPage = lazyPage(() => import("@/pages/modules/budget-tracking"));
const ChangeTrackingPage = lazyPage(() => import("@/pages/finance/change-tracking"));
const ConsolidatedReportsPage = lazyPage(() => import("@/pages/finance/consolidated-reports"));
const DeferredExpensesPage = lazyPage(() => import("@/pages/finance/deferred-expenses"));
const DeferredRevenuePage = lazyPage(() => import("@/pages/finance/deferred-revenue"));
const DepreciationSchedulePage = lazyPage(() => import("@/pages/finance/depreciation-schedule"));
const EntityLedgerPage = lazyPage(() => import("@/pages/finance/entity-ledger"));
const FinanceControlCenterPage = lazyPage(() => import("@/pages/finance/finance-control-center"));
const FinanceFinancialReportsPage = lazyPage(() => import("@/pages/finance/financial-reports"));
const FinanceFixedAssetsAltPage = lazyPage(() => import("@/pages/finance/fixed-assets"));
const JournalReportPage = lazyPage(() => import("@/pages/finance/journal-report"));
const JournalTransactionsPage = lazyPage(() => import("@/pages/finance/journal-transactions"));
const LoanAnalysisPage = lazyPage(() => import("@/pages/finance/loan-analysis"));
const PeriodClosePage = lazyPage(() => import("@/pages/finance/period-close"));
const BankAccountsPage = lazyPage(() => import("@/pages/finance/bank-accounts"));
const AdjustingEntriesPage = lazyPage(() => import("@/pages/finance/adjusting-entries"));
const AccountingInventoryPage = lazyPage(() => import("@/pages/finance/accounting-inventory"));
const AccountingExportPage = lazyPage(() => import("@/pages/finance/accounting-export"));
const RegistrationsPage = lazyPage(() => import("@/pages/finance/registrations"));
const SupplierAgingPage = lazyPage(() => import("@/pages/finance/supplier-aging"));
const TrialBalancePage = lazyPage(() => import("@/pages/finance/trial-balance"));
const WorkingFilesPage = lazyPage(() => import("@/pages/finance/working-files"));
const RiskManagementPage = lazyPage(() => import("@/pages/risk-management"));

function RedirectToProjectAnalyses() {
  return <Redirect to="/project-analyses" />;
}

export const FinanceRoutes = (

    <>
      <Route path="/finance" component={FinanceDashboard} />
      <Route path="/finance/balance-sheet" component={BalanceSheetPage} />
      <Route path="/finance/projects" component={RedirectToProjectAnalyses} />
      <Route path="/finance/income" component={IncomePage} />
      <Route path="/finance/expenses" component={ExpensesPage} />
      <Route path="/finance/expense-items" component={ExpenseItemsPage} />
      <Route path="/finance/expense-upload" component={ExpenseUploadPage} />
      <Route path="/finance/expense-filing" component={ExpenseFilingPage} />
      <Route path="/finance/expense-files" component={ExpenseFilesPage} />
      <Route path="/finance/blackrock-2026" component={BlackRockDashboard} />
      <Route path="/finance/blackrock-monte-carlo" component={BlackRockMonteCarlo} />
      <Route path="/finance/blackrock-var" component={BlackRockVar} />
      <Route path="/finance/blackrock-risk-matrix" component={BlackRockRiskMatrix} />
      <Route path="/finance/blackrock-hedging" component={BlackRockHedging} />
      <Route path="/finance/blackrock-ai" component={BlackRockAI} />
      <Route path="/finance/payment-anomalies" component={PaymentAnomaliesPage} />
      <Route path="/finance/credit-card-processing" component={CreditCardProcessingPage} />
      <Route path="/finance/accounting-portal" component={AccountingPortalPage} />
      <Route path="/finance/reports" component={ReportsPage} />
      <Route path="/finance/income-expenses-report" component={IncomeExpensesReportPage} />
      <Route path="/finance/accounting-reports" component={AccountingReportsPage} />
      <Route path="/finance/debtors-balances" component={DebtorsBalancesPage} />
      <Route path="/finance/operational-profit" component={OperationalProfitPage} />
      <Route path="/finance/accounting-settings" component={AccountingSettingsPage} />
      <Route path="/finance/settings" component={AccountingSettingsPage} />
      <Route path="/finance/standing-orders" component={StandingOrdersPage} />
      <Route path="/finance/journal" component={JournalPage} />
      <Route path="/finance/journal-entries" component={JournalEntriesPage} />
      <Route path="/finance/bank-reconciliation" component={BankReconciliationPage} />
      <Route path="/finance/cash-flow" component={CashFlowPage} />
      <Route path="/finance/tax-management" component={TaxManagementPage} />
      <Route path="/finance/israeli-integrations" component={IsraeliIntegrationsPage} />
      <Route path="/finance/journal-transactions" component={JournalTransactionsPage} />
      <Route path="/finance/journal-report" component={JournalReportPage} />
      <Route path="/finance/audit-control" component={AuditControlPage} />
      <Route path="/finance/working-files" component={WorkingFilesPage} />
      <Route path="/finance/annual-report" component={AnnualReportPage} />
      <Route path="/finance/accounting-inventory" component={AccountingInventoryPage} />
      <Route path="/finance/accounting-export" component={AccountingExportPage} />
      <Route path="/finance/cost-centers" component={CostCentersPage} />
      <Route path="/finance/invoices" component={InvoicesPage} />
      <Route path="/finance/receipts" component={ReceiptsPage} />
      <Route path="/finance/credit-notes" component={CreditNotesPage} />
      <Route path="/finance/customers/invoices" component={CustomerInvoicesPage} />
      <Route path="/finance/customers/refunds" component={CustomerRefundsPage} />
      <Route path="/finance/customers/payments" component={CustomerPaymentsPage} />
      <Route path="/finance/customers/products" component={CustomerProductsPage} />
      <Route path="/finance/suppliers/invoices" component={SupplierInvoicesPage} />
      <Route path="/finance/suppliers/credit-notes" component={SupplierCreditNotesPage} />
      <Route path="/finance/suppliers/payments" component={SupplierPaymentsPage} />
      <Route path="/finance/suppliers/products" component={SupplierProductsPage} />
      <Route path="/finance/aging-report" component={AgingReportPage} />
      <Route path="/finance/chart-of-accounts" component={ChartOfAccountsPage} />
      <Route path="/finance/contractor-payment-decision" component={ContractorPaymentDecisionPage} />
      <Route path="/finance/petty-cash" component={PettyCashPage} />
      <Route path="/finance/expense-claims" component={ExpenseClaimsPage} />
      <Route path="/finance/payment-runs" component={PaymentRunsPage} />
      <Route path="/finance/withholding-tax" component={WithholdingTaxPage} />
      <Route path="/finance/general-ledger" component={GeneralLedgerPage} />
      <Route path="/finance/accounts-payable" component={AccountsPayablePage} />
      <Route path="/finance/accounts-receivable" component={AccountsReceivablePage} />
      <Route path="/finance/expense-reports" component={ExpenseReportsPage} />
      <Route path="/finance/fixed-assets" component={FinanceFixedAssetsPage} />
      <Route path="/finance/financial-reports" component={FinancialReportsPage} />
      <Route path="/finance/profit-loss" component={ProfitLossPage} />
      <Route path="/finance/control-center" component={FinControlCenterPage} />
      <Route path="/finance/payment-terms" component={PaymentTermsPage} />
      <Route path="/finance/debit-notes" component={DebitNotesPage} />
      <Route path="/finance/revenue-tracking" component={RevenueTrackingPage} />
      <Route path="/finance/expense-breakdown" component={ExpenseBreakdownPage} />
      <Route path="/finance/project-profitability" component={ProjectProfitabilityPage} />
      <Route path="/finance/customer-profitability" component={CustomerProfitabilityPage} />
      <Route path="/finance/supplier-cost-analysis" component={SupplierCostAnalysisPage} />
      <Route path="/finance/profit-centers" component={ProfitCentersPage} />
      <Route path="/finance/credit-management" component={CreditManagementPage} />
      <Route path="/finance/treasury-management" component={TreasuryManagementPage} />
      <Route path="/risk-management" component={RiskManagementPage} />
      <Route path="/finance/management-reporting" component={ManagementReportingPage} />
      <Route path="/finance/budget-vs-actual" component={BudgetVsActualPage} />
      <Route path="/finance/payment-reminders" component={PaymentRemindersPage} />
      <Route path="/finance/budget-departments" component={BudgetDepartmentsPage} />
      <Route path="/finance/customer-vendor-ledger" component={CustomerVendorLedgerPage} />
      <Route path="/finance/customer-aging" component={ReportCustomerAgingPage} />
      <Route path="/finance/vendor-aging" component={ReportVendorAgingPage} />
      <Route path="/finance/vat-report" component={ReportVatPage} />
      <Route path="/finance/fiscal-report" component={ReportFiscalPage} />
      <Route path="/finance/invoice-analysis" component={ReportInvoiceAnalysisPage} />
      <Route path="/finance/analytics" component={FinancialAnalyticsPage} />
      <Route path="/finance/executive-summary" component={ReportExecutiveSummaryPage} />
      <Route path="/finance/trial-balance" component={TrialBalancePage} />
      <Route path="/finance/analytical-reports" component={AnalyticalReportsPage} />
      <Route path="/finance/consolidated-reports" component={ConsolidatedReportsPage} />
      <Route path="/finance/entity-ledger" component={EntityLedgerPage} />
      <Route path="/finance/supplier-aging" component={SupplierAgingPage} />
      <Route path="/finance/revenues" component={RevenuesPage} />
      <Route path="/finance/payments" component={FinPaymentsPage} />
      <Route path="/finance/checks-management" component={ChecksManagementPage} />
      <Route path="/finance/checks" component={ChecksManagementPage} />
      <Route path="/finance/currencies" component={CurrenciesManagementPage} />
      <Route path="/finance/budgets" component={FinanceBudgetsPage} />
      <Route path="/budget-tracking" component={BudgetTrackingPage} />
      <Route path="/finance/bank-accounts" component={BankAccountsPage} />
      <Route path="/finance/period-close" component={PeriodClosePage} />
      <Route path="/finance/finance-control-center" component={FinanceControlCenterPage} />
      <Route path="/finance/financial-reports-alt" component={FinanceFinancialReportsPage} />
      <Route path="/finance/fixed-assets-alt" component={FinanceFixedAssetsAltPage} />
      <Route path="/finance/depreciation-schedule" component={DepreciationSchedulePage} />
      <Route path="/finance/loan-analysis" component={LoanAnalysisPage} />
      <Route path="/finance/adjusting-entries" component={AdjustingEntriesPage} />
      <Route path="/finance/deferred-revenue" component={DeferredRevenuePage} />
      <Route path="/finance/deferred-expenses" component={DeferredExpensesPage} />
      <Route path="/finance/registrations" component={RegistrationsPage} />
      <Route path="/finance/change-tracking" component={ChangeTrackingPage} />
    </>
);
