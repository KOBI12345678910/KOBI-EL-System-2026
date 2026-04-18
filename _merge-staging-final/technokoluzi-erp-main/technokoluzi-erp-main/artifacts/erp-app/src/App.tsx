import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useState, useEffect, useCallback, lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { Layout } from "@/components/layout";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { AuthContext } from "@/hooks/use-auth";
import { ErrorBoundary, withPage } from "@/components/ui/unified-states";
import { useToast } from "@/hooks/use-toast";

function lazyPage<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> {
  const Lazy = lazy(factory);
  return withPage<P>(Lazy);
}

const ReceiptsPage = lazyPage(() => import("@/pages/finance/receipts"));

const LoginPage = lazyPage(() => import("@/pages/login"));
const Dashboard = lazyPage(() => import("@/pages/dashboard"));
const BuilderDashboard = lazyPage(() => import("@/pages/builder/builder-dashboard"));
const ModuleEditor = lazyPage(() => import("@/pages/builder/module-editor"));
const EntityEditor = lazyPage(() => import("@/pages/builder/entity-editor"));
const DynamicDataView = lazyPage(() => import("@/pages/builder/dynamic-data-view"));
const BuilderSection = lazyPage(() => import("@/pages/builder/builder-section"));
const MenuBuilderPage = lazyPage(() => import("@/pages/menu-builder"));
const AuditLogPage = lazyPage(() => import("@/pages/audit-log"));
const DashboardBuilderPage = lazyPage(() => import("@/pages/builder/dashboard-builder"));
const TemplateBuilderPage = lazyPage(() => import("@/pages/builder/template-builder"));
const WorkflowBuilderPage = lazyPage(() => import("@/pages/builder/workflow-builder"));
const AutomationBuilderPage = lazyPage(() => import("@/pages/builder/automation-builder"));
const AutomationDashboardPage = lazyPage(() => import("@/pages/builder/automation-dashboard"));
const DataFlowAutomationsPage = lazyPage(() => import("@/pages/platform/data-flow-automations"));
const ReportBuilderPage = lazyPage(() => import("@/pages/report-builder"));
const DocumentBuilderPage = lazyPage(() => import("@/pages/document-builder"));
const IntegrationBuilderPage = lazyPage(() => import("@/pages/integration-builder"));
const IntegrationsHubPage = lazyPage(() => import("@/pages/integrations-hub"));
const IntegrationSettingsPage = lazyPage(() => import("@/pages/integration-settings"));
const AiBuilderPage = lazyPage(() => import("@/pages/ai-builder"));
const FormBuilderPage = lazyPage(() => import("@/pages/builder/form-builder"));
const ViewBuilderPage = lazyPage(() => import("@/pages/builder/view-builder"));
const DetailPageBuilderPage = lazyPage(() => import("@/pages/builder/detail-page-builder"));
const ButtonsBuilderPage = lazyPage(() => import("@/pages/builder/buttons-builder"));
const PermissionsBuilderPage = lazyPage(() => import("@/pages/builder/permissions-builder"));
const VersioningBuilderPage = lazyPage(() => import("@/pages/builder/versioning-builder"));
const ModuleVersionHistory = lazyPage(() => import("@/pages/builder/module-version-history"));
const ToolBuilderPage = lazyPage(() => import("@/pages/builder/tool-builder"));
const ContextBuilderPage = lazyPage(() => import("@/pages/builder/context-builder"));
const WidgetBuilderPage = lazyPage(() => import("@/pages/builder/widget-builder"));
const RawMaterialsPage = lazyPage(() => import("@/pages/modules/raw-materials"));
const FieldMeasurementsPage = lazyPage(() => import("@/pages/production/field-measurements-page"));
const SuppliersPage = lazyPage(() => import("@/pages/modules/suppliers"));
const SupplierCardPage = lazyPage(() => import("@/pages/modules/supplier-card"));
const ProcurementDashboardPage = lazyPage(() => import("@/pages/modules/procurement-dashboard"));
const ImportDashboardPage = lazyPage(() => import("@/pages/modules/import-dashboard"));
const PurchaseOrdersPage = lazyPage(() => import("@/pages/modules/purchase-orders"));
const GoodsReceiptPage = lazyPage(() => import("@/pages/modules/goods-receipt"));
const PurchaseRequestsPage = lazyPage(() => import("@/pages/modules/purchase-requests"));
const PurchaseApprovalsPage = lazyPage(() => import("@/pages/modules/purchase-approvals"));
const PriceQuotesPage = lazyPage(() => import("@/pages/modules/price-quotes"));
const PriceComparisonPage = lazyPage(() => import("@/pages/modules/price-comparison"));
const InventoryManagementPage = lazyPage(() => import("@/pages/modules/inventory-management"));
const SupplierEvaluationsPage = lazyPage(() => import("@/pages/modules/supplier-evaluations"));
const PurchaseReturnsPage = lazyPage(() => import("@/pages/modules/purchase-returns"));
const SupplierContractsPage = lazyPage(() => import("@/pages/modules/supplier-contracts"));
const BudgetTrackingPage = lazyPage(() => import("@/pages/modules/budget-tracking"));
const FinanceBudgetsPage = lazyPage(() => import("@/pages/finance/budgets"));
const ImportOrdersPage = lazyPage(() => import("@/pages/modules/import-orders"));
const CustomsClearancePage = lazyPage(() => import("@/pages/modules/customs-clearance"));
const ShipmentTrackingPage = lazyPage(() => import("@/pages/modules/shipment-tracking"));
const ForeignSuppliersPage = lazyPage(() => import("@/pages/modules/foreign-suppliers"));
const LettersOfCreditPage = lazyPage(() => import("@/pages/modules/letters-of-credit"));
const ImportCostCalculatorPage = lazyPage(() => import("@/pages/modules/import-cost-calculator"));
const ComplianceCertificatesPage = lazyPage(() => import("@/pages/modules/compliance-certificates"));
const ExchangeRatesPage = lazyPage(() => import("@/pages/modules/exchange-rates"));
const ProcurementAIPage = lazyPage(() => import("@/pages/modules/procurement-ai"));
const ProjectAnalysesPage = lazyPage(() => import("@/pages/modules/project-analyses"));
const ProjectAnalysisDetailPage = lazyPage(() => import("@/pages/modules/project-analysis-detail"));
const ClaudeChatPage = lazyPage(() => import("@/pages/modules/claude-chat"));
const HiTechDashboardPage = lazyPage(() => import("@/pages/modules/hi-tech-dashboard"));
const OperationsControlCenterPage = lazyPage(() => import("@/pages/operations-control-center"));
const AISettingsPage = lazyPage(() => import("@/pages/modules/ai-settings"));
const PermissionsPage = lazyPage(() => import("@/pages/permissions"));
const GovernancePage = lazyPage(() => import("@/pages/governance"));
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
const TaxManagementOldPage = lazyPage(() => import("@/pages/finance/tax-management"));
const ApiKeysPage = lazyPage(() => import("@/pages/api-keys"));
const ModelsPage = lazyPage(() => import("@/pages/models"));
const ProvidersPage = lazyPage(() => import("@/pages/providers"));
const QueriesPage = lazyPage(() => import("@/pages/queries"));
const RecommendationsPage = lazyPage(() => import("@/pages/recommendations"));
const ResponsesPage = lazyPage(() => import("@/pages/responses"));
const UsageLogsPage = lazyPage(() => import("@/pages/usage-logs"));
const PromptTemplatesPage = lazyPage(() => import("@/pages/prompt-templates"));
const SettingsHub = lazyPage(() => import("@/pages/settings/settings-hub"));
const HRDashboard = lazyPage(() => import("@/pages/hr/hr-dashboard"));
const EmployeesListPage = lazyPage(() => import("@/pages/hr/employees-list"));
const EmployeePortfolio = lazyPage(() => import("@/pages/hr/employee-portfolio"));
const PayrollPage = lazyPage(() => import("@/pages/hr/payroll"));
const PayrollCenterPage = lazyPage(() => import("@/pages/hr/payroll-center"));
const AttendancePage = lazyPage(() => import("@/pages/hr/attendance"));
const ShiftsPage = lazyPage(() => import("@/pages/hr/shifts"));
const ContractorPaymentsPage = lazyPage(() => import("@/pages/hr/contractor-payments"));
const LeaveManagementPage = lazyPage(() => import("@/pages/hr/leave-management"));
const TrainingPage = lazyPage(() => import("@/pages/hr/training"));
const RecruitmentOldPage = lazyPage(() => import("@/pages/hr/recruitment"));
const PerformanceReviewsPage = lazyPage(() => import("@/pages/hr/performance-reviews"));
const OrgChartPage = lazyPage(() => import("@/pages/hr/org-chart"));
const BenefitsPage = lazyPage(() => import("@/pages/hr/benefits"));
const DepartmentsPage = lazyPage(() => import("@/pages/hr/departments"));
const HRMeetingsPage = lazyPage(() => import("@/pages/hr/hr-meetings"));
const OnboardingPage = lazyPage(() => import("@/pages/hr/onboarding"));
const HRPoliciesPage = lazyPage(() => import("@/pages/hr/policies"));
const PayslipsPage = lazyPage(() => import("@/pages/hr/payslips"));
const BonusesPage = lazyPage(() => import("@/pages/hr/bonuses"));
const EmployerCostPage = lazyPage(() => import("@/pages/hr/employer-cost"));
const OpenPositionsPage = lazyPage(() => import("@/pages/hr/open-positions"));
const CandidatesPage = lazyPage(() => import("@/pages/hr/candidates"));
const InterviewsPage = lazyPage(() => import("@/pages/hr/interviews"));
const HRContractorContractsPage = lazyPage(() => import("@/pages/hr/contractor-contracts"));
const HRContractorInsurancePage = lazyPage(() => import("@/pages/hr/contractor-insurance"));
const HRContractorPaymentsPage = lazyPage(() => import("@/pages/hr/contractor-payments"));
const SupportTicketsPage = lazyPage(() => import("@/pages/support/tickets"));
const SupplierCommunicationsPage = lazyPage(() => import("@/pages/modules/supplier-communications"));
const ProductCatalogPage = lazyPage(() => import("@/pages/modules/product-catalog"));
const QualityControlPage = lazyPage(() => import("@/pages/modules/quality-control"));
const WorkOrdersPage = lazyPage(() => import("@/pages/modules/work-orders"));
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
const MaintenanceManagementPage = lazyPage(() => import("@/pages/modules/maintenance-management"));
const AssetManagementPage = lazyPage(() => import("@/pages/modules/asset-management"));
const DocumentControlPage = lazyPage(() => import("@/pages/modules/document-control"));
const DocumentsPage = lazyPage(() => import("@/pages/modules/documents"));
const SafetyManagementPage = lazyPage(() => import("@/pages/modules/safety-management"));
const CrmDashboard = lazyPage(() => import("@/pages/crm/crm-dashboard"));
const FieldAgentsPage = lazyPage(() => import("@/pages/crm/field-agents"));
const LeadsManagement = lazyPage(() => import("@/pages/crm/leads-management"));
const DynamicPricingPage = lazyPage(() => import("@/pages/crm/dynamic-pricing"));
const CollectionsPage = lazyPage(() => import("@/pages/crm/collections"));
const DailyProfitabilityPage = lazyPage(() => import("@/pages/crm/daily-profitability"));
const SlaManagementPage = lazyPage(() => import("@/pages/crm/sla-management"));
const SmartRoutingPage = lazyPage(() => import("@/pages/crm/smart-routing"));
const CrmAutomationsPage = lazyPage(() => import("@/pages/crm/crm-automations"));
const CrmActivitiesPage = lazyPage(() => import("@/pages/crm/crm-activities"));
const CrmMessagingPage = lazyPage(() => import("@/pages/crm/crm-messaging"));
const ChecksManagementPage = lazyPage(() => import("@/pages/finance/checks-management"));
const CurrenciesManagementPage = lazyPage(() => import("@/pages/finance/currencies-management"));
const RevenuesPage = lazyPage(() => import("@/pages/finance/revenues-page"));
const RevenueRecognitionPage = lazyPage(() => import("@/pages/finance/revenue-recognition"));
const IntercompanyPage = lazyPage(() => import("@/pages/finance/intercompany"));
const EngineeringChangePage = lazyPage(() => import("@/pages/production/engineering-change"));
const SlaManagementSettingsPage = lazyPage(() => import("@/pages/settings/sla-management"));
const WarrantyManagementPage = lazyPage(() => import("@/pages/support/warranty-management"));
const MultiSitePage = lazyPage(() => import("@/pages/settings/multi-site"));
const KnowledgeGraphPage = lazyPage(() => import("@/pages/ai-engine/knowledge-graph"));
const DigitalTwinPage = lazyPage(() => import("@/pages/ai-engine/digital-twin"));
const AgentOrchestrationPage = lazyPage(() => import("@/pages/ai-engine/agent-orchestration"));
const CPQConfiguratorPage = lazyPage(() => import("@/pages/production/cpq-configurator"));
const ThreeWayMatchPage = lazyPage(() => import("@/pages/finance/three-way-match"));
const DispatchPlanningPage = lazyPage(() => import("@/pages/production/dispatch-planning"));
const VariationOrdersPage = lazyPage(() => import("@/pages/projects/variation-orders"));
const FeatureFlagsPage = lazyPage(() => import("@/pages/settings/feature-flags"));
const ImportStagingPage = lazyPage(() => import("@/pages/settings/import-staging"));
const DuplicateResolutionPage = lazyPage(() => import("@/pages/settings/duplicate-resolution"));
const MetricDictionaryPage = lazyPage(() => import("@/pages/reports/metric-dictionary"));
const CutNestingPage = lazyPage(() => import("@/pages/production/cut-nesting"));
const RemnantManagementPage = lazyPage(() => import("@/pages/inventory/remnant-management"));
const PredictiveAnalyticsPage = lazyPage(() => import("@/pages/ai-engine/predictive-analytics"));
const RealtimeCollaborationPage = lazyPage(() => import("@/pages/settings/realtime-collaboration"));
const ESGSustainabilityPage = lazyPage(() => import("@/pages/reports/esg-sustainability"));
const SupplyChainTraceabilityPage = lazyPage(() => import("@/pages/production/supply-chain-traceability"));
const OptimizationLabPage = lazyPage(() => import("@/pages/ai-engine/optimization-lab"));
const IoTSensorHubPage = lazyPage(() => import("@/pages/production/iot-sensor-hub"));
const CustomerExperiencePage = lazyPage(() => import("@/pages/crm/customer-experience"));
const DocumentIntelligencePage = lazyPage(() => import("@/pages/ai-engine/document-intelligence"));
const RiskManagementPage = lazyPage(() => import("@/pages/executive/risk-management"));
const IntelligentNotificationsPage = lazyPage(() => import("@/pages/settings/intelligent-notifications"));
const ProcessMiningPage = lazyPage(() => import("@/pages/ai-engine/process-mining"));
const CapacityPlanningPage = lazyPage(() => import("@/pages/production/capacity-planning"));
const ContractIntelligencePage = lazyPage(() => import("@/pages/crm/contract-intelligence"));
const PerformanceOKRPage = lazyPage(() => import("@/pages/hr/performance-okr"));
const VMIConsignmentPage = lazyPage(() => import("@/pages/procurement/vmi-consignment"));
const SupplyChainWorkflowPage = lazyPage(() => import("@/pages/production/supply-chain-workflow"));
const EmployeeValueAnalysisPage = lazyPage(() => import("@/pages/hr/employee-value-analysis"));
const ProjectCostCalculatorPage = lazyPage(() => import("@/pages/finance/project-cost-calculator"));
const AgentPerformancePage = lazyPage(() => import("@/pages/crm/agent-performance"));
const MeasurementComparisonPage = lazyPage(() => import("@/pages/production/measurement-comparison"));
const InstallationSchedulerPage = lazyPage(() => import("@/pages/installations/installation-scheduler"));
const SmartPayrollPage = lazyPage(() => import("@/pages/hr/smart-payroll"));
const APARControlPage = lazyPage(() => import("@/pages/finance/ap-ar-control"));
const DailyProfitMonitorPage = lazyPage(() => import("@/pages/executive/daily-profit-monitor"));
const CompetitorIntelligencePage = lazyPage(() => import("@/pages/strategy/competitor-intelligence"));
const FinancialStatementsPage = lazyPage(() => import("@/pages/finance/financial-statements"));
const FraudDetectionPage = lazyPage(() => import("@/pages/executive/fraud-detection"));
const WhatsAppHubPage = lazyPage(() => import("@/pages/crm/whatsapp-hub"));
const CallAnalysisPage = lazyPage(() => import("@/pages/crm/call-analysis"));
const DocumentTemplatesPage = lazyPage(() => import("@/pages/documents/document-templates"));
const RecruitmentPage = lazyPage(() => import("@/pages/hr/recruitment"));
const CashflowManagementPage = lazyPage(() => import("@/pages/finance/cashflow-management"));
const TaxManagementPage = lazyPage(() => import("@/pages/finance/tax-management"));
const SocialMarketingPage = lazyPage(() => import("@/pages/marketing/social-marketing"));
const ImportManagementPage = lazyPage(() => import("@/pages/import/import-management"));
const DepartmentManagerPage = lazyPage(() => import("@/pages/settings/department-manager"));
const RawMaterialCatalogPage = lazyPage(() => import("@/pages/inventory/raw-material-catalog"));
const BOMBuilderPage = lazyPage(() => import("@/pages/production/bom-builder"));
const ScrapTrackerPage = lazyPage(() => import("@/pages/production/scrap-tracker"));
const ToolEquipmentPage = lazyPage(() => import("@/pages/production/tool-equipment"));
const ShiftSchedulingPage = lazyPage(() => import("@/pages/hr/shift-scheduling"));
const SafetyIncidentsPage = lazyPage(() => import("@/pages/production/safety-incidents"));
const CustomerPortalPage = lazyPage(() => import("@/pages/portal/customer-portal"));
const SupplierPortalNewPage = lazyPage(() => import("@/pages/portal/supplier-portal-new"));
const MobileFieldOpsPage = lazyPage(() => import("@/pages/mobile/field-operations"));
const AIAgentsDashboardPage = lazyPage(() => import("@/pages/ai-engine/ai-agents-dashboard"));
const AlertTerminalPage = lazyPage(() => import("@/pages/alert-terminal"));
const AnalyticsEnginePage = lazyPage(() => import("@/pages/analytics-engine"));
const InventoryLegacyPage = lazyPage(() => import("@/pages/inventory"));
const KimiTaskChallengesPage = lazyPage(() => import("@/pages/kimi-task-challenges"));
const NotificationRoutingPage = lazyPage(() => import("@/pages/notification-routing"));
const ProcurementLegacyPage = lazyPage(() => import("@/pages/procurement"));
const PurchaseRequisitionsPage = lazyPage(() => import("@/pages/procurement/purchase-requisitions"));
const RfqManagementPage = lazyPage(() => import("@/pages/procurement/rfq-management"));
const ProcStockCountsPage = lazyPage(() => import("@/pages/procurement/stock-counts"));
const ProcStockMovementsPage = lazyPage(() => import("@/pages/procurement/stock-movements"));
const ProductionSafetyPage = lazyPage(() => import("@/pages/production/safety-management"));
const ImportCostCalcPage = lazyPage(() => import("@/pages/import/import-cost-calculator"));
const ImportInsurancePage = lazyPage(() => import("@/pages/import/import-insurance"));
const FinPaymentsPage = lazyPage(() => import("@/pages/finance/payments"));
const NotificationsPage = lazyPage(() => import("@/pages/notifications"));
const NotificationPreferencesPage = lazyPage(() => import("@/pages/notification-preferences"));
const ContractorDecisionPage = lazyPage(() => import("@/pages/crm/contractor-decision"));
const CrmLeadScoringPage = lazyPage(() => import("@/pages/crm/ai/lead-scoring"));
const NextActionPage = lazyPage(() => import("@/pages/crm/ai/next-action"));
const PredictivePage = lazyPage(() => import("@/pages/crm/ai/predictive"));
const AnomalyPage = lazyPage(() => import("@/pages/crm/ai/anomaly"));
const AuditTrailPage = lazyPage(() => import("@/pages/crm/security/audit"));
const RowSecurityPage = lazyPage(() => import("@/pages/crm/security/row-security"));
const EncryptionPage = lazyPage(() => import("@/pages/crm/security/encryption"));
const SSOPage = lazyPage(() => import("@/pages/crm/security/sso"));
const LiveFeedsPage = lazyPage(() => import("@/pages/crm/realtime/feeds"));
const NotificationsMgmtPage = lazyPage(() => import("@/pages/crm/realtime/notifications"));
const TriggersPage = lazyPage(() => import("@/pages/crm/realtime/triggers"));
const SyncPage = lazyPage(() => import("@/pages/crm/realtime/sync"));
const CustomReportsPage = lazyPage(() => import("@/pages/crm/analytics/custom-reports"));
const TrendsPage = lazyPage(() => import("@/pages/crm/analytics/trends"));
const CohortPage = lazyPage(() => import("@/pages/crm/analytics/cohort"));
const FiltersPage = lazyPage(() => import("@/pages/crm/analytics/filters"));
const RestApiPage = lazyPage(() => import("@/pages/crm/integrations/rest-api"));
const MobileSyncPage = lazyPage(() => import("@/pages/crm/integrations/mobile"));
const CloudStoragePage = lazyPage(() => import("@/pages/crm/integrations/cloud"));
const WebhooksPage = lazyPage(() => import("@/pages/crm/integrations/webhooks"));
const EmailSyncPage = lazyPage(() => import("@/pages/crm/email-sync"));
const WhatsAppSMSPage = lazyPage(() => import("@/pages/crm/whatsapp-sms"));
const AIInsightsPage = lazyPage(() => import("@/pages/crm/ai-insights"));
const PredictiveAnalyticsCRMPage = lazyPage(() => import("@/pages/crm/predictive-analytics"));
const LeadQualityPage = lazyPage(() => import("@/pages/crm/lead-quality"));
const RealtimeFeedPage = lazyPage(() => import("@/pages/crm/realtime-feed"));
const AdvancedSearchPage = lazyPage(() => import("@/pages/crm/advanced-search"));
const CollaborationPage = lazyPage(() => import("@/pages/crm/collaboration"));
const MeetingsCalendarPage = lazyPage(() => import("@/pages/meetings/meetings-calendar"));
const ReportsHub = lazyPage(() => import("@/pages/reports/reports-hub"));
const FinancialReports = lazyPage(() => import("@/pages/reports/financial-reports"));
const RiskAnalysis = lazyPage(() => import("@/pages/reports/risk-analysis"));
const KPIDashboard = lazyPage(() => import("@/pages/reports/kpi-dashboard"));
const FunnelAnalysis = lazyPage(() => import("@/pages/reports/funnel-analysis"));
const OperationalReports = lazyPage(() => import("@/pages/reports/operational-reports"));
const BIDashboardPage = lazyPage(() => import("@/pages/reports/bi-dashboard"));
const ModuleView = lazyPage(() => import("@/pages/module-view"));
const ProductRoadmapPage = lazyPage(() => import("@/pages/product-dev/product-roadmap"));
const RDProjectsPage = lazyPage(() => import("@/pages/product-dev/rd-projects"));
const FeatureRequestsPage = lazyPage(() => import("@/pages/product-dev/feature-requests"));
const QATestingPage = lazyPage(() => import("@/pages/product-dev/qa-testing"));
const BomTreePage = lazyPage(() => import("@/pages/production/bom-tree"));
const WorkInstructionsEntPage = lazyPage(() => import("@/pages/production/work-instructions-ent"));
const ProductionPlanningPage = lazyPage(() => import("@/pages/production/production-planning"));
const QualityControlEntPage = lazyPage(() => import("@/pages/production/quality-control-ent"));
const MachineMaintenancePage = lazyPage(() => import("@/pages/production/machine-maintenance"));
const CmmsDashboardPage = lazyPage(() => import("@/pages/production/cmms-dashboard"));
const ProductionReportsPage = lazyPage(() => import("@/pages/production/production-reports"));
const PriceListsEntPage = lazyPage(() => import("@/pages/pricing/price-lists-ent"));
const CostCalculationsPage = lazyPage(() => import("@/pages/pricing/cost-calculations"));
const CollectionManagementPage = lazyPage(() => import("@/pages/pricing/collection-management"));
const PortalLoginPage = lazyPage(() => import("@/pages/portal/portal-login"));
const SupplierPortalPage = lazyPage(() => import("@/pages/portal/supplier-portal"));
const ContractorPortalPage = lazyPage(() => import("@/pages/portal/contractor-portal"));
const EmployeePortalPage = lazyPage(() => import("@/pages/portal/employee-portal"));
const PortalManagementPage = lazyPage(() => import("@/pages/portal/portal-management"));
const BomManagerPage = lazyPage(() => import("@/pages/production/bom-manager"));
const ProductionWorkOrdersPage = lazyPage(() => import("@/pages/production/production-work-orders"));
const QCInspectionsPage = lazyPage(() => import("@/pages/production/qc-inspections"));
const ProductionDashboardPage = lazyPage(() => import("@/pages/production/production-dashboard"));
const MESSystemPage = lazyPage(() => import("@/pages/production/mes-system"));
const SCADASystemPage = lazyPage(() => import("@/pages/production/scada-system"));
const ProductionKanbanPage = lazyPage(() => import("@/pages/production/production-kanban"));
const ProductionGanttPage = lazyPage(() => import("@/pages/production/production-gantt"));
const RoadmapPage = lazyPage(() => import("@/pages/product-dev/roadmap"));
const UserCalendarPage = lazyPage(() => import("@/pages/calendar/user-calendar"));
const WorkforceAnalysisPage = lazyPage(() => import("@/pages/workforce/workforce-analysis"));
// === דפים חדשים - מנועים מתקדמים ===
const WhatsAppAIPage = lazyPage(() => import("@/pages/whatsapp-ai"));
const CustomerServicePage = lazyPage(() => import("@/pages/customer-service"));
const PayrollPage2 = lazyPage(() => import("@/pages/payroll"));
const BomProductsPage = lazyPage(() => import("@/pages/bom-products"));
const LeadScoringPage2 = lazyPage(() => import("@/pages/lead-scoring"));
const ImportManagementOldPage = lazyPage(() => import("@/pages/import-management"));
const RiskManagementOldPage = lazyPage(() => import("@/pages/risk-management"));
const CompanyFinancialsPage = lazyPage(() => import("@/pages/company-financials"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const ProjectsDashboard = lazyPage(() => import("@/pages/projects/projects-dashboard"));
const ProjectTasksPage = lazyPage(() => import("@/pages/projects/project-tasks-page"));
const MilestonesPage = lazyPage(() => import("@/pages/projects/milestones-page"));
const SubcontractorsPage = lazyPage(() => import("@/pages/projects/subcontractors"));
const Kiryati10Page = lazyPage(() => import("@/pages/projects/real-estate/kiryati10"));
const REUnitsPage = lazyPage(() => import("@/pages/projects/real-estate/units"));
const REPermitsPage = lazyPage(() => import("@/pages/projects/real-estate/permits"));
const REContractorsPage = lazyPage(() => import("@/pages/projects/real-estate/contractors"));
const ResourcesPage = lazyPage(() => import("@/pages/projects/resources-page"));
const ProjectBudgetPage = lazyPage(() => import("@/pages/projects/project-budget-page"));
const RiskRegisterPage = lazyPage(() => import("@/pages/projects/risk-register-page"));
const TimesheetsPage = lazyPage(() => import("@/pages/projects/timesheets-page"));
const GoalsPage = lazyPage(() => import("@/pages/strategy/goals-page"));
const SwotPage = lazyPage(() => import("@/pages/strategy/swot-page"));
const StrategicPlanningPage = lazyPage(() => import("@/pages/strategy/planning"));
const MarketAnalysisPage = lazyPage(() => import("@/pages/strategy/market-analysis"));
const OKRsPage = lazyPage(() => import("@/pages/strategy/okrs"));
const SettingsDepartmentsPage = lazyPage(() => import("@/pages/settings/departments"));
const SettingsRolesPage = lazyPage(() => import("@/pages/settings/roles"));
const SettingsTriggersPage = lazyPage(() => import("@/pages/settings/triggers"));
const SettingsWebhooksPage = lazyPage(() => import("@/pages/settings/webhooks"));
const ImportExportPage = lazyPage(() => import("@/pages/settings/import-export"));
const BackupsPage = lazyPage(() => import("@/pages/settings/backups"));
const FacilitiesPage = lazyPage(() => import("@/pages/installations/facilities"));
const InstallationsWorkPage = lazyPage(() => import("@/pages/installations/work"));
const InstallationAssetsPage = lazyPage(() => import("@/pages/installations/assets"));
const InstallationsCalendarPage = lazyPage(() => import("@/pages/installations/calendar"));
const BalancedScorecardPage = lazyPage(() => import("@/pages/strategy/balanced-scorecard-page"));
const CompetitiveAnalysisPage = lazyPage(() => import("@/pages/strategy/competitive-analysis-page"));
const BusinessPlanPage = lazyPage(() => import("@/pages/strategy/business-plan-page"));
const CampaignsPage = lazyPage(() => import("@/pages/marketing/campaigns-page"));
const ContentCalendarPage = lazyPage(() => import("@/pages/marketing/content-calendar-page"));
const SocialMediaPage = lazyPage(() => import("@/pages/marketing/social-media-page"));
const EmailCampaignsPage = lazyPage(() => import("@/pages/marketing/email-campaigns-page"));
const MarketingBudgetPage = lazyPage(() => import("@/pages/marketing/marketing-budget-page"));
const MarketingHubPage = lazyPage(() => import("@/pages/marketing/marketing-hub"));
const MarketingIntegrationsPage = lazyPage(() => import("@/pages/marketing/marketing-integrations"));
const MarketingAnalyticsPage = lazyPage(() => import("@/pages/marketing/marketing-analytics"));
const AIDocumentProcessorPage = lazyPage(() => import("@/pages/modules/ai-document-processor"));
const AIEngineHubPage = lazyPage(() => import("@/pages/ai-engine/ai-engine-hub"));
const LeadScoringPage = lazyPage(() => import("@/pages/ai-engine/lead-scoring"));
const CallNLPAnalysisPage = lazyPage(() => import("@/pages/ai-engine/call-nlp-analysis"));
const PredictiveAnalyticsOldPage = lazyPage(() => import("@/pages/ai-engine/predictive-analytics"));
const AIChatbotSettingsPage = lazyPage(() => import("@/pages/ai-engine/ai-chatbot-settings"));
const KimiTerminalPage = lazyPage(() => import("@/pages/ai-engine/kimi-terminal"));
const KobiTerminalPage = lazyPage(() => import("@/pages/ai-engine/kobi-terminal"));
const KobiIDEPage = lazyPage(() => import("@/pages/ai-engine/kobi-ide"));
const CrossModuleTransactionsPage = lazyPage(() => import("@/pages/ai-engine/cross-module-transactions"));
const SuperAgentDashboardPage = lazyPage(() => import("@/pages/ai-engine/SuperAgentPage"));

// ============================================================
// SAP-Level Upgrade Pages (Wave 1-4)
// ============================================================
// HR SAP
const WorkforcePlanningPage = lazyPage(() => import("@/pages/hr/workforce-planning"));
const SkillsMatrixPage = lazyPage(() => import("@/pages/hr/skills-matrix"));
const EmployeeGoalsPage = lazyPage(() => import("@/pages/hr/employee-goals"));
const HealthSafetyPage = lazyPage(() => import("@/pages/hr/health-safety"));
const HRExpenseClaimsPage = lazyPage(() => import("@/pages/hr/expense-claims"));
// Finance SAP
const ProfitCentersPage = lazyPage(() => import("@/pages/finance/profit-centers"));
const TreasuryManagementPage = lazyPage(() => import("@/pages/finance/treasury-management"));
const PeriodClosePage = lazyPage(() => import("@/pages/finance/period-close"));
const CreditManagementPage = lazyPage(() => import("@/pages/finance/credit-management"));
// Production SAP
const MRPPlanningPage = lazyPage(() => import("@/pages/production/mrp-planning"));
const OEEDashboardPage = lazyPage(() => import("@/pages/production/oee-dashboard"));
const BatchSerialTrackingPage = lazyPage(() => import("@/pages/production/batch-serial-tracking"));
const ToolManagementPage = lazyPage(() => import("@/pages/production/tool-management"));
// CRM Ultimate
const CrmUltimateDashboardPage = lazyPage(() => import("@/pages/crm/crm-ultimate-dashboard"));
const AgentControlTowerPage = lazyPage(() => import("@/pages/crm/agent-control-tower"));
const LeadsUltimatePage = lazyPage(() => import("@/pages/crm/leads-ultimate"));
const LeadProfilePage = lazyPage(() => import("@/pages/crm/lead-profile"));
// CRM SAP
const TerritoryManagementPage = lazyPage(() => import("@/pages/crm/territory-management"));
const CommissionManagementPage = lazyPage(() => import("@/pages/crm/commission-management"));
const ContractManagementPage = lazyPage(() => import("@/pages/crm/contract-management"));
const CampaignAnalyticsPage = lazyPage(() => import("@/pages/crm/campaign-analytics"));
// Procurement SAP
const VendorEvaluationPage = lazyPage(() => import("@/pages/procurement/vendor-evaluation"));
const RfqManagementSAPPage = lazyPage(() => import("@/pages/procurement/rfq-management"));
const SpendAnalysisPage = lazyPage(() => import("@/pages/procurement/spend-analysis"));
// Projects SAP
const EarnedValuePage = lazyPage(() => import("@/pages/projects/earned-value"));
const ResourcePlanningPage = lazyPage(() => import("@/pages/projects/resource-planning"));
const RiskRegisterSAPPage = lazyPage(() => import("@/pages/projects/risk-register"));
// Factory Core
const FactoryDigitalTwinPage = lazyPage(() => import("@/components/3d/factory-digital-twin"));
const VisualWorkflowBuilderPage = lazyPage(() => import("@/pages/builder/visual-workflow-builder"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

function PageLoader() {
  return (
    <div className="space-y-4 p-6 animate-pulse" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="h-8 w-48 bg-muted/50 rounded-lg" />
        <div className="h-6 w-24 bg-muted/40 rounded-full" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-9 w-24 bg-muted/40 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-4 items-center p-3 rounded-xl border border-border bg-card">
            <div className="h-10 w-10 bg-muted/50 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted/50 rounded" />
              <div className="h-3 w-1/2 bg-muted/40 rounded" />
            </div>
            <div className="h-8 w-20 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RedirectToProjectAnalyses() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/project-analyses"); }, [setLocation]);
  return null;
}

function LazyErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 p-8 text-center" dir="rtl">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
        <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground">שגיאה בטעינת הדף</h2>
      <p className="text-sm text-muted-foreground max-w-sm">הדף לא נטען כראוי. ניתן לנסות לרענן או לחזור לדף הקודם.</p>
      <div className="flex gap-3">
        <button onClick={() => window.location.reload()} className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors">
          רענן דף
        </button>
        <button onClick={() => window.history.back()} className="px-5 py-2 border border-border rounded-lg hover:bg-muted text-sm font-medium transition-colors">
          חזור אחורה
        </button>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Layout>
      <ErrorBoundary key={location} fallback={<LazyErrorFallback />}>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={KPIDashboard} />
          <Route path="/operations-control-center" component={OperationsControlCenterPage} />
          <Route path="/executive/war-room" component={WarRoomPage} />
          <Route path="/executive/order-lifecycle" component={OrderLifecyclePage} />
          <Route path="/executive/ceo-dashboard" component={CEODashboardPage} />
          <Route path="/executive/live-ops" component={LiveOpsPage} />
          <Route path="/executive/company-health" component={CompanyHealthPage} />
          <Route path="/executive/kpi-board" component={ExecutiveKPIBoardPage} />
          <Route path="/executive/live-alerts" component={LiveAlertsCenterPage} />
          <Route path="/executive/financial-risk" component={FinancialRiskPage} />
          <Route path="/executive/operational-bottlenecks" component={OperationalBottlenecksPage} />
          <Route path="/executive/delayed-projects" component={DelayedProjectsPage} />
          <Route path="/executive/procurement-risk" component={ProcurementRiskPage} />
          <Route path="/executive/production-efficiency" component={ProductionEfficiencyPage} />
          <Route path="/executive/profitability" component={ProfitabilityDashboardPage} />
          <Route path="/executive/workforce-status" component={WorkforceStatusPage} />
          <Route path="/system/model-catalog" component={ModelCatalogPage} />
          <Route path="/customers"><Redirect to="/sales/customers" /></Route>
          <Route path="/products"><Redirect to="/product-catalog" /></Route>
          <Route path="/projects"><Redirect to="/projects/dashboard" /></Route>
          <Route path="/invoices"><Redirect to="/finance/invoices" /></Route>
          <Route path="/sales-orders"><Redirect to="/sales/orders" /></Route>
          <Route path="/employees"><Redirect to="/hr/employees" /></Route>
          <Route path="/work-orders"><Redirect to="/production/work-orders" /></Route>
          <Route path="/payroll"><Redirect to="/hr/payroll" /></Route>
          <Route path="/attendance"><Redirect to="/hr/attendance" /></Route>
          <Route path="/manufacturing"><Redirect to="/production" /></Route>
          <Route path="/manufacturing/:rest*"><Redirect to="/production" /></Route>
          <Route path="/field-measurements" component={FieldMeasurementsPage} />
          <Route path="/accounting"><Redirect to="/finance/accounting-portal" /></Route>
          <Route path="/blackrock"><Redirect to="/finance/blackrock-2026" /></Route>
          <Route path="/kimi"><Redirect to="/ai-engine/kimi" /></Route>
          <Route path="/kimi2"><Redirect to="/ai-engine/kimi" /></Route>
          <Route path="/platform" component={Dashboard} />
          <Route path="/builder" component={BuilderDashboard} />
          <Route path="/builder/modules" component={BuilderDashboard} />
          <Route path="/builder/module/:id/versions" component={ModuleVersionHistory} />
          <Route path="/builder/module/:id" component={ModuleEditor} />
          <Route path="/builder/entity/:id" component={EntityEditor} />
          <Route path="/builder/data/:entityId" component={DynamicDataView} />
          <Route path="/module/:entityId" component={ModuleView} />
          <Route path="/builder/entities" component={() => <BuilderSection section="entities" />} />
          <Route path="/builder/fields" component={() => <BuilderSection section="fields" />} />
          <Route path="/builder/relations" component={() => <BuilderSection section="relations" />} />
          <Route path="/builder/forms" component={FormBuilderPage} />
          <Route path="/builder/views" component={ViewBuilderPage} />
          <Route path="/builder/details" component={DetailPageBuilderPage} />
          <Route path="/builder/categories" component={() => <BuilderSection section="categories" />} />
          <Route path="/builder/statuses" component={() => <BuilderSection section="statuses" />} />
          <Route path="/builder/buttons" component={ButtonsBuilderPage} />
          <Route path="/builder/actions" component={() => <BuilderSection section="actions" />} />
          <Route path="/builder/validations" component={() => <BuilderSection section="validations" />} />
          <Route path="/builder/permissions" component={PermissionsBuilderPage} />
          <Route path="/builder/menus" component={MenuBuilderPage} />
          <Route path="/builder/dashboards" component={DashboardBuilderPage} />
          <Route path="/builder/widgets" component={WidgetBuilderPage} />
          <Route path="/builder/workflows" component={WorkflowBuilderPage} />
          <Route path="/builder/automations" component={AutomationBuilderPage} />
          <Route path="/builder/automation-dashboard" component={AutomationDashboardPage} />
          <Route path="/platform/data-flow-automations" component={DataFlowAutomationsPage} />
          <Route path="/builder/templates" component={TemplateBuilderPage} />
          <Route path="/builder/tools" component={ToolBuilderPage} />
          <Route path="/builder/contexts" component={ContextBuilderPage} />
          <Route path="/builder/publish" component={VersioningBuilderPage} />
          <Route path="/menu-builder" component={MenuBuilderPage} />
          <Route path="/audit-log" component={AuditLogPage} />
          <Route path="/report-builder" component={ReportBuilderPage} />
          <Route path="/document-builder" component={DocumentBuilderPage} />
          <Route path="/integration-builder" component={IntegrationBuilderPage} />
          <Route path="/integrations-hub" component={IntegrationsHubPage} />
          <Route path="/integrations-hub/:slug" component={IntegrationSettingsPage} />
          <Route path="/ai-builder" component={AiBuilderPage} />
          <Route path="/inventory" component={InventoryManagementPage} />
          <Route path="/production" component={ProductionDashboardPage} />
          <Route path="/suppliers" component={SuppliersPage} />
          <Route path="/suppliers/:id" component={SupplierCardPage} />
          <Route path="/procurement-dashboard" component={ProcurementDashboardPage} />
          <Route path="/import-dashboard" component={ImportDashboardPage} />
          <Route path="/purchase-orders" component={PurchaseOrdersPage} />
          <Route path="/goods-receipt" component={GoodsReceiptPage} />
          <Route path="/purchase-requests" component={PurchaseRequestsPage} />
          <Route path="/purchase-approvals" component={PurchaseApprovalsPage} />
          <Route path="/price-quotes" component={PriceQuotesPage} />
          <Route path="/price-comparison" component={PriceComparisonPage} />
          <Route path="/inventory-management" component={InventoryManagementPage} />
          <Route path="/raw-materials" component={RawMaterialsPage} />
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
          <Route path="/finance/petty-cash" component={PettyCashPage} />
          <Route path="/finance/expense-claims" component={ExpenseClaimsPage} />
          <Route path="/finance/payment-runs" component={PaymentRunsPage} />
          <Route path="/finance/withholding-tax" component={WithholdingTaxPage} />
          <Route path="/finance/general-ledger" component={GeneralLedgerPage} />
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
          <Route path="/production/dashboard" component={ProductionDashboardPage} />
          <Route path="/production/mes" component={MESSystemPage} />
          <Route path="/production/scada" component={SCADASystemPage} />
          <Route path="/production/kanban" component={ProductionKanbanPage} />
          <Route path="/production/gantt" component={ProductionGanttPage} />
          <Route path="/production/quality-control" component={QualityControlPage} />
          <Route path="/production/work-orders" component={ProductionWorkOrdersPage} />
          <Route path="/production/maintenance" component={CmmsDashboardPage} />
          <Route path="/assets" component={AssetManagementPage} />
          <Route path="/document-control" component={DocumentControlPage} />
          <Route path="/documents" component={DocumentsPage} />
          <Route path="/documents/upload" component={AIDocumentProcessorPage} />
          <Route path="/documents/digital-archive" component={DigitalArchivePage} />
          <Route path="/documents/digital-signatures" component={DigitalSignaturesPage} />
          <Route path="/documents/quality-docs" component={QualityDocsPage} />
          <Route path="/documents/checklists" component={ChecklistsPage} />
          <Route path="/documents/system-spec" component={SystemSpecPage} />
          <Route path="/documents/archive-files" component={ArchiveFilesPage} />
          <Route path="/documents/company-report" component={CompanyReportPage} />
          <Route path="/documents/templates" component={TemplatesLibraryPage} />
          <Route path="/safety" component={SafetyManagementPage} />
          <Route path="/safety/procedures" component={SafetyProceduresPage} />
          <Route path="/safety/accident-reports" component={AccidentReportsPage} />
          <Route path="/safety/training" component={SafetyTrainingPage} />
          <Route path="/production/quality-checklists" component={QualityChecklistsPage} />
          <Route path="/production/corrective-actions" component={CorrectiveActionsPage} />
          <Route path="/production/product-design" component={ProductDesignPage} />
          <Route path="/production/product-testing" component={ProductTestingPage} />
          <Route path="/production/prototypes" component={PrototypesPage} />
          <Route path="/production/output-report" component={OutputReportPage} />
          <Route path="/production/efficiency-report" component={EfficiencyReportPage} />
          <Route path="/production/waste-report" component={WasteReportPage} />
          <Route path="/production/cost-report" component={CostReportPage} />
          <Route path="/production/bom-manager" component={BomManagerPage} />
          <Route path="/production/work-orders-mgmt" component={ProductionWorkOrdersPage} />
          <Route path="/production/planning" component={ProductionPlanningPage} />
          <Route path="/production/qc-inspections" component={QCInspectionsPage} />
          <Route path="/production/machine-maintenance" component={MachineMaintenancePage} />
          <Route path="/production/cmms" component={CmmsDashboardPage} />
          <Route path="/production/reports" component={ProductionReportsPage} />
          <Route path="/product-dev/roadmap" component={ProductRoadmapPage} />
          <Route path="/product-dev/rd-projects" component={RDProjectsPage} />
          <Route path="/product-dev/feature-requests" component={FeatureRequestsPage} />
          <Route path="/product-dev/qa-testing" component={QATestingPage} />
          <Route path="/supplier-evaluations" component={SupplierEvaluationsPage} />
          <Route path="/purchase-returns" component={PurchaseReturnsPage} />
          <Route path="/supplier-contracts" component={SupplierContractsPage} />
          <Route path="/budget-tracking" component={BudgetTrackingPage} />
          <Route path="/finance/budgets" component={FinanceBudgetsPage} />
          <Route path="/import-orders" component={ImportOrdersPage} />
          <Route path="/customs-clearance" component={CustomsClearancePage} />
          <Route path="/shipment-tracking" component={ShipmentTrackingPage} />
          <Route path="/foreign-suppliers" component={ForeignSuppliersPage} />
          <Route path="/letters-of-credit" component={LettersOfCreditPage} />
          <Route path="/import-cost-calculator" component={ImportCostCalculatorPage} />
          <Route path="/compliance-certificates" component={ComplianceCertificatesPage} />
          <Route path="/exchange-rates" component={ExchangeRatesPage} />
          <Route path="/procurement-ai" component={ProcurementAIPage} />
          <Route path="/procurement/profitability" component={ProcurementProfitabilityPage} />
          <Route path="/procurement/competitors" component={ProcurementCompetitorsPage} />
          <Route path="/procurement/risk-hedging" component={ProcurementRiskHedgingPage} />
          <Route path="/project-analyses" component={ProjectAnalysesPage} />
          <Route path="/project-analysis/:id" component={ProjectAnalysisDetailPage} />
          <Route path="/claude-chat" component={ClaudeChatPage} />
          <Route path="/hi-tech-dashboard" component={HiTechDashboardPage} />
          <Route path="/ai-settings" component={AISettingsPage} />
          <Route path="/chat" component={ChatPage} />
          <Route path="/permissions" component={PermissionsPage} />
          <Route path="/governance" component={GovernancePage} />
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
          <Route path="/finance/journal-transactions" component={JournalTransactionsPage} />
          <Route path="/finance/journal-report" component={JournalReportPage} />
          <Route path="/finance/audit-control" component={AuditControlPage} />
          <Route path="/finance/working-files" component={WorkingFilesPage} />
          <Route path="/finance/annual-report" component={AnnualReportPage} />
          <Route path="/finance/accounting-inventory" component={AccountingInventoryPage} />
          <Route path="/inventory/expiry-alerts" component={ExpiryAlertsPage} />
          <Route path="/finance/depreciation-schedule" component={DepreciationSchedulePage} />
          <Route path="/finance/loan-analysis" component={LoanAnalysisPage} />
          <Route path="/finance/adjusting-entries" component={AdjustingEntriesPage} />
          <Route path="/finance/deferred-revenue" component={DeferredRevenuePage} />
          <Route path="/finance/deferred-expenses" component={DeferredExpensesPage} />
          <Route path="/finance/registrations" component={RegistrationsPage} />
          <Route path="/finance/change-tracking" component={ChangeTrackingPage} />
          <Route path="/finance/revenue-recognition" component={RevenueRecognitionPage} />
          <Route path="/finance/intercompany" component={IntercompanyPage} />
          <Route path="/production/engineering-change" component={EngineeringChangePage} />
          <Route path="/settings/sla-management" component={SlaManagementSettingsPage} />
          <Route path="/support/warranty-management" component={WarrantyManagementPage} />
          <Route path="/settings/multi-site" component={MultiSitePage} />
          <Route path="/ai-engine/knowledge-graph" component={KnowledgeGraphPage} />
          <Route path="/ai-engine/digital-twin" component={DigitalTwinPage} />
          <Route path="/ai-engine/agent-orchestration" component={AgentOrchestrationPage} />
          <Route path="/production/cpq-configurator" component={CPQConfiguratorPage} />
          <Route path="/finance/three-way-match" component={ThreeWayMatchPage} />
          <Route path="/production/dispatch-planning" component={DispatchPlanningPage} />
          <Route path="/projects/variation-orders" component={VariationOrdersPage} />
          <Route path="/settings/feature-flags" component={FeatureFlagsPage} />
          <Route path="/settings/import-staging" component={ImportStagingPage} />
          <Route path="/settings/duplicate-resolution" component={DuplicateResolutionPage} />
          <Route path="/reports/metric-dictionary" component={MetricDictionaryPage} />
          <Route path="/production/cut-nesting" component={CutNestingPage} />
          <Route path="/inventory/remnant-management" component={RemnantManagementPage} />
          <Route path="/ai-engine/predictive-analytics" component={PredictiveAnalyticsPage} />
          <Route path="/ai-engine/optimization-lab" component={OptimizationLabPage} />
          <Route path="/ai-engine/document-intelligence" component={DocumentIntelligencePage} />
          <Route path="/ai-engine/process-mining" component={ProcessMiningPage} />
          <Route path="/production/supply-chain-traceability" component={SupplyChainTraceabilityPage} />
          <Route path="/production/iot-sensor-hub" component={IoTSensorHubPage} />
          <Route path="/production/capacity-planning" component={CapacityPlanningPage} />
          <Route path="/crm/customer-experience" component={CustomerExperiencePage} />
          <Route path="/crm/contract-intelligence" component={ContractIntelligencePage} />
          <Route path="/executive/risk-management" component={RiskManagementPage} />
          <Route path="/reports/esg-sustainability" component={ESGSustainabilityPage} />
          <Route path="/settings/realtime-collaboration" component={RealtimeCollaborationPage} />
          <Route path="/settings/intelligent-notifications" component={IntelligentNotificationsPage} />
          <Route path="/hr/performance-okr" component={PerformanceOKRPage} />
          <Route path="/procurement/vmi-consignment" component={VMIConsignmentPage} />
          <Route path="/production/supply-chain-workflow" component={SupplyChainWorkflowPage} />
          <Route path="/production/measurement-comparison" component={MeasurementComparisonPage} />
          <Route path="/finance/project-cost-calculator" component={ProjectCostCalculatorPage} />
          <Route path="/crm/agent-performance" component={AgentPerformancePage} />
          <Route path="/hr/employee-value-analysis" component={EmployeeValueAnalysisPage} />
          <Route path="/installations/installation-scheduler" component={InstallationSchedulerPage} />
          <Route path="/hr/smart-payroll" component={SmartPayrollPage} />
          <Route path="/finance/ap-ar-control" component={APARControlPage} />
          <Route path="/finance/financial-statements" component={FinancialStatementsPage} />
          <Route path="/executive/daily-profit-monitor" component={DailyProfitMonitorPage} />
          <Route path="/executive/fraud-detection" component={FraudDetectionPage} />
          <Route path="/strategy/competitor-intelligence" component={CompetitorIntelligencePage} />
          <Route path="/crm/whatsapp-hub" component={WhatsAppHubPage} />
          <Route path="/crm/call-analysis" component={CallAnalysisPage} />
          <Route path="/documents/document-templates" component={DocumentTemplatesPage} />
          <Route path="/hr/recruitment" component={RecruitmentPage} />
          <Route path="/finance/cashflow-management" component={CashflowManagementPage} />
          <Route path="/finance/tax-management" component={TaxManagementPage} />
          <Route path="/marketing/social-marketing" component={SocialMarketingPage} />
          <Route path="/import/import-management" component={ImportManagementPage} />
          <Route path="/settings/department-manager" component={DepartmentManagerPage} />
          <Route path="/inventory/raw-material-catalog" component={RawMaterialCatalogPage} />
          <Route path="/production/bom-builder" component={BOMBuilderPage} />
          <Route path="/production/scrap-tracker" component={ScrapTrackerPage} />
          <Route path="/production/tool-equipment" component={ToolEquipmentPage} />
          <Route path="/production/safety-incidents" component={SafetyIncidentsPage} />
          <Route path="/hr/shift-scheduling" component={ShiftSchedulingPage} />
          <Route path="/portal/customer-portal" component={CustomerPortalPage} />
          <Route path="/portal/supplier-portal-new" component={SupplierPortalNewPage} />
          <Route path="/mobile/field-operations" component={MobileFieldOpsPage} />
          <Route path="/ai-engine/ai-agents" component={AIAgentsDashboardPage} />
          <Route path="/alerts" component={AlertTerminalPage} />
          <Route path="/analytics-engine" component={AnalyticsEnginePage} />
          <Route path="/inventory-legacy" component={InventoryLegacyPage} />
          <Route path="/kimi-challenges" component={KimiTaskChallengesPage} />
          <Route path="/notification-routing" component={NotificationRoutingPage} />
          <Route path="/procurement-legacy" component={ProcurementLegacyPage} />
          <Route path="/hr" component={HRDashboard} />
          <Route path="/hr/employees" component={EmployeesListPage} />
          <Route path="/hr/employees/:id" component={EmployeePortfolio} />
          <Route path="/hr/payroll" component={PayrollPage} />
          <Route path="/hr/payroll-center" component={PayrollCenterPage} />
          <Route path="/hr/employee-value" component={WorkforceAnalysisPage} />
          <Route path="/hr/attendance" component={AttendancePage} />
          <Route path="/hr/shifts" component={ShiftsPage} />
          <Route path="/hr/contractors" component={ContractorPaymentsPage} />
          <Route path="/hr/leave-management" component={LeaveManagementPage} />
          <Route path="/hr/training" component={TrainingPage} />
          <Route path="/hr/recruitment" component={RecruitmentPage} />
          <Route path="/hr/performance-reviews" component={PerformanceReviewsPage} />
          <Route path="/hr/org-chart" component={OrgChartPage} />
          <Route path="/hr/benefits" component={BenefitsPage} />
          <Route path="/hr/departments" component={DepartmentsPage} />
          <Route path="/hr/meetings" component={HRMeetingsPage} />
          <Route path="/hr/onboarding" component={OnboardingPage} />
          <Route path="/hr/policies" component={HRPoliciesPage} />
          <Route path="/hr/payslips" component={PayslipsPage} />
          <Route path="/hr/bonuses" component={BonusesPage} />
          <Route path="/hr/employer-cost" component={EmployerCostPage} />
          <Route path="/hr/open-positions" component={OpenPositionsPage} />
          <Route path="/hr/candidates" component={CandidatesPage} />
          <Route path="/hr/interviews" component={InterviewsPage} />
          <Route path="/hr/contractor-contracts" component={HRContractorContractsPage} />
          <Route path="/hr/contractor-insurance" component={HRContractorInsurancePage} />
          <Route path="/hr/contractor-payments" component={HRContractorPaymentsPage} />
          {/* HR SAP Upgrade */}
          <Route path="/hr/workforce-planning" component={WorkforcePlanningPage} />
          <Route path="/hr/skills-matrix" component={SkillsMatrixPage} />
          <Route path="/hr/goals" component={EmployeeGoalsPage} />
          <Route path="/hr/health-safety" component={HealthSafetyPage} />
          <Route path="/hr/expense-claims-hr" component={HRExpenseClaimsPage} />
          {/* Finance SAP Upgrade */}
          <Route path="/finance/profit-centers" component={ProfitCentersPage} />
          <Route path="/finance/treasury" component={TreasuryManagementPage} />
          <Route path="/finance/period-close" component={PeriodClosePage} />
          <Route path="/finance/credit-management" component={CreditManagementPage} />
          {/* Production SAP Upgrade */}
          <Route path="/production/mrp" component={MRPPlanningPage} />
          <Route path="/production/oee" component={OEEDashboardPage} />
          <Route path="/production/batch-serial" component={BatchSerialTrackingPage} />
          <Route path="/production/tools" component={ToolManagementPage} />
          {/* CRM Ultimate */}
          <Route path="/crm/ultimate" component={CrmUltimateDashboardPage} />
          <Route path="/crm/agent-control" component={AgentControlTowerPage} />
          <Route path="/crm/leads-ultimate" component={LeadsUltimatePage} />
          <Route path="/crm/lead/:id" component={LeadProfilePage} />
          {/* CRM SAP Upgrade */}
          <Route path="/crm/territories" component={TerritoryManagementPage} />
          <Route path="/crm/commissions" component={CommissionManagementPage} />
          <Route path="/crm/contracts" component={ContractManagementPage} />
          <Route path="/crm/campaign-analytics" component={CampaignAnalyticsPage} />
          {/* Procurement SAP Upgrade */}
          <Route path="/procurement/vendor-evaluation" component={VendorEvaluationPage} />
          <Route path="/procurement/rfq-sap" component={RfqManagementSAPPage} />
          <Route path="/procurement/spend-analysis" component={SpendAnalysisPage} />
          {/* Projects SAP Upgrade */}
          <Route path="/projects/earned-value" component={EarnedValuePage} />
          <Route path="/projects/resource-planning" component={ResourcePlanningPage} />
          <Route path="/projects/risk-register-sap" component={RiskRegisterSAPPage} />
          {/* Factory Core */}
          <Route path="/factory/digital-twin" component={FactoryDigitalTwinPage} />
          <Route path="/builder/workflow-visual" component={VisualWorkflowBuilderPage} />
          <Route path="/support/tickets" component={SupportTicketsPage} />
          <Route path="/suppliers/communications" component={SupplierCommunicationsPage} />
          <Route path="/product-catalog" component={ProductCatalogPage} />
          <Route path="/operations/media-library" component={MediaLibraryPage} />
          <Route path="/operations/data-sender" component={DataSenderPage} />
          <Route path="/ai/api-keys" component={ApiKeysPage} />
          <Route path="/ai/models" component={ModelsPage} />
          <Route path="/ai/providers" component={ProvidersPage} />
          <Route path="/ai/queries" component={QueriesPage} />
          <Route path="/ai/recommendations" component={RecommendationsPage} />
          <Route path="/ai/responses" component={ResponsesPage} />
          <Route path="/ai/usage-logs" component={UsageLogsPage} />
          <Route path="/ai/prompt-templates" component={PromptTemplatesPage} />
          <Route path="/sales/customers" component={CustomerManagementPage} />
          <Route path="/sales/customer-portal" component={CustomerPortalPage} />
          <Route path="/sales/orders" component={SalesOrdersPage} />
          <Route path="/sales/quotations" component={QuotationsPage} />
          <Route path="/sales/invoicing" component={SalesInvoicingPage} />
          <Route path="/sales/pipeline" component={CrmPipelinePage} />
          <Route path="/sales/service" component={CustomerServicePage} />
          <Route path="/ai-customer-service" component={AICustomerServicePage} />
          <Route path="/crm" component={CrmDashboard} />
          <Route path="/crm/field-agents" component={FieldAgentsPage} />
          <Route path="/crm/leads" component={LeadsManagement} />
          <Route path="/crm/pricing" component={DynamicPricingPage} />
          <Route path="/crm/collections" component={CollectionsPage} />
          <Route path="/crm/profitability" component={DailyProfitabilityPage} />
          <Route path="/crm/sla" component={SlaManagementPage} />
          <Route path="/crm/smart-routing" component={SmartRoutingPage} />
          <Route path="/crm/automations" component={CrmAutomationsPage} />
          <Route path="/crm/contractor-decision" component={ContractorDecisionPage} />
          <Route path="/crm/ai/lead-scoring" component={CrmLeadScoringPage} />
          <Route path="/crm/ai/next-action" component={NextActionPage} />
          <Route path="/crm/ai/predictive" component={PredictivePage} />
          <Route path="/crm/ai/anomaly" component={AnomalyPage} />
          <Route path="/crm/security/audit" component={AuditTrailPage} />
          <Route path="/crm/security/row-security" component={RowSecurityPage} />
          <Route path="/crm/security/encryption" component={EncryptionPage} />
          <Route path="/crm/security/sso" component={SSOPage} />
          <Route path="/crm/realtime/feeds" component={LiveFeedsPage} />
          <Route path="/crm/realtime/notifications" component={NotificationsMgmtPage} />
          <Route path="/crm/realtime/triggers" component={TriggersPage} />
          <Route path="/crm/realtime/sync" component={SyncPage} />
          <Route path="/crm/analytics/custom-reports" component={CustomReportsPage} />
          <Route path="/crm/analytics/trends" component={TrendsPage} />
          <Route path="/crm/analytics/cohort" component={CohortPage} />
          <Route path="/crm/analytics/filters" component={FiltersPage} />
          <Route path="/crm/integrations/rest-api" component={RestApiPage} />
          <Route path="/crm/integrations/mobile" component={MobileSyncPage} />
          <Route path="/crm/integrations/cloud" component={CloudStoragePage} />
          <Route path="/crm/integrations/webhooks" component={WebhooksPage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/notification-preferences" component={NotificationPreferencesPage} />
          <Route path="/alert-terminal" component={AlertTerminalPage} />
          <Route path="/notification-routing" component={NotificationRoutingPage} />
          <Route path="/crm/email-sync" component={EmailSyncPage} />
          <Route path="/crm/whatsapp-sms" component={WhatsAppSMSPage} />
          <Route path="/crm/ai-insights" component={AIInsightsPage} />
          <Route path="/crm/predictive-analytics" component={PredictiveAnalyticsCRMPage} />
          <Route path="/crm/lead-quality" component={LeadQualityPage} />
          <Route path="/crm/realtime-feed" component={RealtimeFeedPage} />
          <Route path="/crm/advanced-search" component={AdvancedSearchPage} />
          <Route path="/crm/collaboration" component={CollaborationPage} />
          <Route path="/meetings" component={MeetingsCalendarPage} />
          <Route path="/calendar" component={UserCalendarPage} />
          <Route path="/workforce-analysis" component={WorkforceAnalysisPage} />
          <Route path="/analytics" component={AnalyticsEnginePage} />
          <Route path="/reports" component={ReportsHub} />
          <Route path="/reports/financial" component={FinancialReports} />
          <Route path="/reports/financial/customer-vendor-ledger" component={CustomerVendorLedgerPage} />
          <Route path="/reports/financial/customer-aging" component={ReportCustomerAgingPage} />
          <Route path="/reports/financial/vendor-aging" component={ReportVendorAgingPage} />
          <Route path="/reports/financial/fiscal-report" component={ReportFiscalPage} />
          <Route path="/reports/financial/invoice-analysis" component={ReportInvoiceAnalysisPage} />
          <Route path="/reports/financial/analytics" component={FinancialAnalyticsPage} />
          <Route path="/reports/financial/executive-summary" component={ReportExecutiveSummaryPage} />
          <Route path="/reports/financial/vat-report" component={ReportVatPage} />
          <Route path="/reports/risks" component={RiskAnalysis} />
          <Route path="/reports/kpis" component={KPIDashboard} />
          <Route path="/reports/funnel" component={FunnelAnalysis} />
          <Route path="/reports/operational" component={OperationalReports} />
          <Route path="/reports/bi-dashboard" component={BIDashboardPage} />
          <Route path="/settings" component={SettingsHub} />
          <Route path="/settings/departments" component={SettingsDepartmentsPage} />
          <Route path="/settings/roles" component={SettingsRolesPage} />
          <Route path="/settings/triggers" component={SettingsTriggersPage} />
          <Route path="/settings/webhooks" component={SettingsWebhooksPage} />
          <Route path="/settings/import-export" component={ImportExportPage} />
          <Route path="/settings/backups" component={BackupsPage} />
          <Route path="/projects/dashboard" component={ProjectsDashboard} />
          <Route path="/projects/tasks" component={ProjectTasksPage} />
          <Route path="/projects/milestones" component={MilestonesPage} />
          <Route path="/projects/subcontractors" component={SubcontractorsPage} />
          <Route path="/projects/real-estate/kiryati10" component={Kiryati10Page} />
          <Route path="/projects/real-estate/units" component={REUnitsPage} />
          <Route path="/projects/real-estate/permits" component={REPermitsPage} />
          <Route path="/projects/real-estate/contractors" component={REContractorsPage} />
          <Route path="/projects/resources" component={ResourcesPage} />
          <Route path="/projects/budget" component={ProjectBudgetPage} />
          <Route path="/projects/risks" component={RiskRegisterPage} />
          <Route path="/projects/timesheets" component={TimesheetsPage} />
          <Route path="/strategy/goals" component={GoalsPage} />
          <Route path="/strategy/swot" component={SwotPage} />
          <Route path="/strategy/planning" component={StrategicPlanningPage} />
          <Route path="/strategy/market-analysis" component={MarketAnalysisPage} />
          <Route path="/strategy/okrs" component={OKRsPage} />
          <Route path="/installations/facilities" component={FacilitiesPage} />
          <Route path="/installations/work" component={InstallationsWorkPage} />
          <Route path="/installations/assets" component={InstallationAssetsPage} />
          <Route path="/installations/calendar" component={InstallationsCalendarPage} />
          <Route path="/strategy/balanced-scorecard" component={BalancedScorecardPage} />
          <Route path="/strategy/competitive-analysis" component={CompetitiveAnalysisPage} />
          <Route path="/strategy/business-plan" component={BusinessPlanPage} />
          <Route path="/portal-management" component={PortalManagementPage} />
          <Route path="/marketing" component={MarketingHubPage} />
          <Route path="/marketing/hub" component={MarketingHubPage} />
          <Route path="/marketing/integrations" component={MarketingIntegrationsPage} />
          <Route path="/marketing/analytics" component={MarketingAnalyticsPage} />
          <Route path="/marketing/campaigns" component={CampaignsPage} />
          <Route path="/marketing/content-calendar" component={ContentCalendarPage} />
          <Route path="/marketing/social-media" component={SocialMediaPage} />
          <Route path="/marketing/email-campaigns" component={EmailCampaignsPage} />
          <Route path="/marketing/budget" component={MarketingBudgetPage} />
          <Route path="/ai-engine" component={AIEngineHubPage} />
          <Route path="/ai-engine/lead-scoring" component={LeadScoringPage} />
          <Route path="/ai-engine/call-nlp-analysis" component={CallNLPAnalysisPage} />
          <Route path="/ai-engine/call-nlp"><Redirect to="/ai-engine/call-nlp-analysis" /></Route>
          <Route path="/ai-engine/predictive" component={PredictiveAnalyticsPage} />
          <Route path="/ai-engine/ai-chatbot-settings" component={AIChatbotSettingsPage} />
          <Route path="/ai-engine/chatbot"><Redirect to="/ai-engine/ai-chatbot-settings" /></Route>
          <Route path="/ai-engine/kimi-terminal" component={KimiTerminalPage} />
          <Route path="/procurement" component={ProcurementPage} />
          <Route path="/ai-engine/kimi"><Redirect to="/ai-engine/kimi-terminal" /></Route>
          <Route path="/ai-engine/kobi" component={KobiTerminalPage} />
          <Route path="/ai-engine/kobi-ide" component={KobiIDEPage} />
          <Route path="/ai-engine/super-agent" component={KobiTerminalPage} />
          <Route path="/ai-engine/transactions" component={CrossModuleTransactionsPage} />
          <Route path="/ai-engine/super-agent-dashboard" component={SuperAgentDashboardPage} />
          <Route path="/kobi"><Redirect to="/ai-engine/kobi" /></Route>
          <Route path="/ai-ops/sales-assistant" component={AISalesAssistantPage} />
          <Route path="/ai-ops/lead-scoring" component={AILeadScoringProPage} />
          <Route path="/ai-ops/customer-service" component={AICustomerServiceProPage} />
          <Route path="/ai-ops/follow-up" component={AIFollowUpPage} />
          <Route path="/ai-ops/quotation-assistant" component={AIQuotationAssistantPage} />
          <Route path="/ai-ops/procurement-optimizer" component={AIProcurementOptimizerPage} />
          <Route path="/ai-ops/production-insights" component={AIProductionInsightsPage} />
          <Route path="/ai-ops/anomaly-detection" component={AIAnomalyDetectionPage} />
          <Route path="/ai-ops/executive-insights" component={AIExecutiveInsightsPage} />
          <Route path="/ai-engine/kimi-challenges" component={KimiTaskChallengesPage} />
          <Route path="/ai-document-processor" component={AIDocumentProcessorPage} />
          <Route path="/finance/trial-balance" component={TrialBalancePage} />
          <Route path="/finance/analytical-reports" component={AnalyticalReportsPage} />
          <Route path="/finance/consolidated-reports" component={ConsolidatedReportsPage} />
          <Route path="/finance/entity-ledger" component={EntityLedgerPage} />
          <Route path="/finance/supplier-aging" component={SupplierAgingPage} />
          <Route path="/pricing/price-lists-ent" component={PricingPriceListsPage} />
          <Route path="/pricing/price-lists"><Redirect to="/pricing/price-lists-ent" /></Route>
          <Route path="/pricing/cost-calculator" component={PricingCostCalculatorPage} />
          <Route path="/pricing/collection-management" component={CollectionManagementPage} />
          <Route path="/pricing/collections"><Redirect to="/pricing/collection-management" /></Route>
          <Route path="/pricing/cost-calculations" component={CostCalculationsPage} />
          <Route path="/production/bom-tree" component={BomTreePage} />
          <Route path="/production/production-planning" component={ProductionPlanningPage} />
          <Route path="/production/production-reports" component={ProductionReportsPage} />
          <Route path="/production/quality-control-ent" component={QualityControlEntPage} />
          <Route path="/production/work-instructions-ent" component={WorkInstructionsEntPage} />
          <Route path="/fabrication/profiles" component={FabProfilesPage} />
          <Route path="/fabrication/systems" component={FabSystemsPage} />
          <Route path="/fabrication/glass-catalog" component={FabGlassCatalogPage} />
          <Route path="/fabrication/finishes-colors" component={FabFinishesColorsPage} />
          <Route path="/fabrication/accessories" component={FabAccessoriesPage} />
          <Route path="/fabrication/cutting-lists" component={FabCuttingListsPage} />
          <Route path="/fabrication/assembly-orders" component={FabAssemblyOrdersPage} />
          <Route path="/fabrication/welding-orders" component={FabWeldingOrdersPage} />
          <Route path="/fabrication/coating-orders" component={FabCoatingOrdersPage} />
          <Route path="/fabrication/glazing-orders" component={FabGlazingOrdersPage} />
          <Route path="/fabrication/packing-lists" component={FabPackingListsPage} />
          <Route path="/fabrication/transport-orders" component={FabTransportOrdersPage} />
          <Route path="/fabrication/installation-orders" component={FabInstallationOrdersPage} />
          <Route path="/fabrication/service-tickets" component={FabServiceTicketsPage} />
          <Route path="/fabrication/workflow-tracker" component={FabWorkflowTrackerPage} />
          <Route path="/inventory/warehouses" component={WarehousesPage} />
          <Route path="/inventory/stock-movements" component={StockMovementsPage} />
          <Route path="/inventory/stock-counts" component={StockCountsPage} />
          <Route path="/inventory/raw-material-stock" component={RawMaterialStockPage} />
          <Route path="/inventory/finished-goods-stock" component={FinishedGoodsStockPage} />
          <Route path="/inventory/warehouse-locations" component={WarehouseLocationsPage} />
          <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
          <Route path="/sales/delivery-notes" component={DeliveryNotesPage} />
          <Route path="/sales/returns" component={SalesReturnsPage} />
          <Route path="/production/production-lines" component={ProductionLinesPage} />
          <Route path="/production/ncr-reports" component={NCRReportsPage} />
          <Route path="/production/equipment" component={EquipmentManagementPage} />
          <Route path="/production/installers" component={InstallersPage} />
          <Route path="/production/installations" component={InstallationsListPage} />
          <Route path="/documents/contracts" component={ContractsPage} />
          <Route path="/data-flow" component={DataFlowDashboardPage} />

          {/* Spec gap-fill routes */}
          <Route path="/crm/contacts" component={CustomerManagementPage} />
          <Route path="/crm/pipeline" component={CrmPipelinePage} />
          <Route path="/crm/activities" component={CrmActivitiesPage} />
          <Route path="/crm/service" component={CustomerServicePage} />
          <Route path="/crm/meetings" component={HRMeetingsPage} />
          <Route path="/crm/messaging" component={CrmMessagingPage} />
          <Route path="/crm/portal" component={CustomerPortalPage} />
          <Route path="/crm/automation" component={CrmAutomationsPage} />
          <Route path="/crm/real-time" component={LiveFeedsPage} />
          <Route path="/crm/search" component={AdvancedSearchPage} />
          <Route path="/sales/quotes" component={QuotationsPage} />
          <Route path="/sales/invoices" component={SalesInvoicingPage} />
          <Route path="/pricing/cost-calc" component={PricingCostCalculatorPage} />
          <Route path="/pricing/dynamic" component={DynamicPricingPage} />
          <Route path="/pricing/daily-profit" component={DailyProfitabilityPage} />
          <Route path="/production/bom" component={BomManagerPage} />
          <Route path="/production/quality-inspections" component={QCInspectionsPage} />
          <Route path="/production/safety" component={ProductionSafetyPage} />
          <Route path="/installation/installers" component={InstallersPage} />
          <Route path="/installation/field" component={FieldMeasurementsPage} />
          <Route path="/installation/measurements" component={FieldMeasurementsPage} />
          <Route path="/finance/revenues" component={RevenuesPage} />
          <Route path="/finance/payments" component={FinPaymentsPage} />
          <Route path="/finance/checks" component={ChecksManagementPage} />
          <Route path="/finance/currencies" component={CurrenciesManagementPage} />
          <Route path="/hr/leaves" component={LeaveManagementPage} />
          <Route path="/hr/contractor-payments" component={ContractorPaymentsPage} />
          <Route path="/procurement/requisitions" component={PurchaseRequisitionsPage} />
          <Route path="/procurement/rfq" component={RfqManagementPage} />
          <Route path="/procurement/stock-count" component={ProcStockCountsPage} />
          <Route path="/procurement/stock-movements" component={ProcStockMovementsPage} />
          <Route path="/import/cost-calculator" component={ImportCostCalcPage} />
          <Route path="/import/insurance" component={ImportInsurancePage} />

          {/* Navigation redirect fixes — prevent 404 on common broken paths */}
          <Route path="/procurement/suppliers"><Redirect to="/suppliers" /></Route>
          <Route path="/procurement/purchase-orders"><Redirect to="/purchase-orders" /></Route>
          <Route path="/procurement/purchase-requests"><Redirect to="/purchase-requests" /></Route>
          <Route path="/procurement/purchase-approvals"><Redirect to="/purchase-approvals" /></Route>
          <Route path="/procurement/goods-receipt"><Redirect to="/goods-receipt" /></Route>
          <Route path="/procurement/price-quotes"><Redirect to="/price-quotes" /></Route>
          <Route path="/procurement/price-comparison"><Redirect to="/price-comparison" /></Route>
          <Route path="/procurement/inventory-management"><Redirect to="/inventory-management" /></Route>
          <Route path="/procurement/supplier-evaluations"><Redirect to="/supplier-evaluations" /></Route>
          <Route path="/procurement/supplier-contracts"><Redirect to="/supplier-contracts" /></Route>
          <Route path="/procurement/purchase-returns"><Redirect to="/purchase-returns" /></Route>
          <Route path="/crm/leads-management"><Redirect to="/crm/leads" /></Route>
          <Route path="/crm/customers"><Redirect to="/sales/customers" /></Route>
          <Route path="/crm/quotations"><Redirect to="/sales/quotations" /></Route>
          <Route path="/crm/sales-orders"><Redirect to="/sales/orders" /></Route>
          <Route path="/inventory/inventory-dashboard"><Redirect to="/inventory/dashboard" /></Route>
          <Route path="/production/field-measurements"><Redirect to="/installation/measurements" /></Route>
          <Route path="/production/installations-list"><Redirect to="/production/installations" /></Route>
          <Route path="/executive/profitability-dashboard"><Redirect to="/executive/profitability" /></Route>

          {/* === נתיבים חדשים - מנועים מתקדמים === */}
          <Route path="/whatsapp-ai" component={WhatsAppAIPage} />
          <Route path="/customer-service" component={CustomerServicePage} />
          <Route path="/hr/payroll-engine" component={PayrollPage2} />
          <Route path="/production/bom-products" component={BomProductsPage} />
          <Route path="/crm/lead-scoring" component={LeadScoringPage2} />
          <Route path="/import-management" component={ImportManagementPage} />
          <Route path="/risk-management" component={RiskManagementPage} />
          <Route path="/finance/company-financials" component={CompanyFinancialsPage} />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

function PortalRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/portal/login" component={PortalLoginPage} />
        <Route path="/portal/register/:token" component={PortalLoginPage} />
        <Route path="/portal/supplier" component={SupplierPortalPage} />
        <Route path="/portal/contractor" component={ContractorPortalPage} />
        <Route path="/portal/employee" component={EmployeePortalPage} />
        <Route component={PortalLoginPage} />
      </Switch>
    </Suspense>
  );
}

function GlobalErrorHandler() {
  const { toast } = useToast();
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      const msg = event.reason?.message || String(event.reason) || "שגיאה לא צפויה";
      if (
        msg.includes("ResizeObserver") ||
        msg.includes("Script error") ||
        msg.includes("cancelled") ||
        msg.includes("AbortError")
      ) return;
      console.error("[Unhandled rejection]", event.reason);
      toast({
        title: "שגיאת מערכת",
        description: msg.length > 120 ? msg.slice(0, 120) + "..." : msg,
        variant: "destructive",
      });
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, [toast]);
  return null;
}

function App() {
  const isPortalPath = typeof window !== "undefined" && window.location.pathname.startsWith("/portal");

  const [token, setToken] = useState<string | null>(
    isPortalPath ? null : (localStorage.getItem("erp_token") || localStorage.getItem("token"))
  );
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [checking, setChecking] = useState(!isPortalPath);

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const logout = useCallback(() => {
    const activeToken = token || localStorage.getItem("erp_token") || localStorage.getItem("token");
    if (activeToken) {
      fetch(`${apiBase}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem("erp_token");
    localStorage.removeItem("token");
    localStorage.removeItem("erp_user");
    setToken(null);
    setUser(null);
  }, [token, apiBase]);

  useEffect(() => {
    if (isPortalPath) return;
    const activeToken = token || localStorage.getItem("erp_token") || localStorage.getItem("token");
    if (!activeToken) { setChecking(false); return; }
    fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    })
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          localStorage.removeItem("erp_token");
          localStorage.removeItem("token");
          setToken(null);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("erp_user", JSON.stringify(data.user));
        } else {
          localStorage.removeItem("erp_token");
          localStorage.removeItem("token");
          setToken(null);
        }
      })
      .catch(() => {
        const cachedUser = localStorage.getItem("erp_user");
        if (cachedUser) {
          try { setUser(JSON.parse(cachedUser)); } catch { }
        }
      })
      .finally(() => setChecking(false));
  }, [token, isPortalPath, apiBase]);

  function handleLogin(newToken: string, userData: Record<string, unknown>) {
    localStorage.setItem("erp_token", newToken);
    setToken(newToken);
    setUser(userData);
  }

  if (isPortalPath) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmDialogProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <PortalRouter />
            </WouterRouter>
            <Toaster />
            <GlobalErrorHandler />
          </ConfirmDialogProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="space-y-3 w-64 animate-pulse">
          <div className="h-10 bg-slate-800 rounded-xl mx-auto w-40" />
          <div className="h-3 bg-slate-800 rounded w-3/4 mx-auto" />
          <div className="h-3 bg-slate-800 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ErrorBoundary fallback={<LazyErrorFallback />}>
            <Suspense fallback={<PageLoader />}>
              <LoginPage onLogin={handleLogin} />
            </Suspense>
          </ErrorBoundary>
          <Toaster />
          <GlobalErrorHandler />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, token, logout }}>
        <PermissionsProvider>
          <TooltipProvider>
            <ConfirmDialogProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
              <GlobalErrorHandler />
            </ConfirmDialogProvider>
          </TooltipProvider>
        </PermissionsProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
