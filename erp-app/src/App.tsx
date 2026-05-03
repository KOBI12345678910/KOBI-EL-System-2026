import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useState, useEffect, useCallback, lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { Layout } from "@/components/layout";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { AuthContext } from "@/hooks/use-auth";
import { ErrorBoundary, withPage } from "@/components/ui/unified-states";
import { useToast } from "@/hooks/use-toast";

// === AUTO-WIRED REACT ROUTES ===
// Generated: 2026-04-18T13:34:26.057Z · Added: 28
const DashboardPage2 = lazy(() => import('./pages/modules/procurement-dashboard'));
const DashboardPage3 = lazy(() => import('./pages/finance/finance-dashboard'));
const DashboardPage4 = lazy(() => import('./pages/hr/hr-dashboard'));
const SettingsPage = lazy(() => import('./pages/hr/hr-settings'));
const DashboardPage5 = lazy(() => import('./pages/dashboard'));
const ScorecardPage = lazy(() => import('./pages/executive/executive-scorecard'));
const PoliciesPage = lazy(() => import('./pages/hr/policies'));
const IntegrationsHubDataPage = lazy(() => import('./pages/integrations-hub-data'));
const SystemSettingsPage = lazy(() => import('./pages/settings/sections/system-settings'));
const OpportunitiesPage2 = lazy(() => import('./pages/sales/opportunities'));
const CrmActivitiesPage2 = lazy(() => import('./pages/crm/crm-activities'));

// === AUTO-WIRED REACT ROUTES ===
// Generated: 2026-04-18T06:26:09.682Z · Added: 629
const DashboardPage = lazy(() => import('./pages/dashboard'));
const CommandCenterPage = lazy(() => import('./pages/command-center/command-center'));
const Customer360Page = lazy(() => import('./pages/crm/customer-360'));
const ContractsPage = lazy(() => import('./pages/documents/contracts'));
// DEDUPED [CustomerPortalPage] path differs; kept lazyPage @L887 — original: const CustomerPortalPage = lazy(() => import('./pages/sales/customer-portal'));
const CrmPipelinePage = lazy(() => import('./pages/sales/crm-pipeline'));
// DEDUPED [SupplierPortalPage] path differs; kept lazyPage @L960 — original: const SupplierPortalPage = lazy(() => import('./pages/procurement/supplier-portal'));
// DEDUPED [SubcontractorsPage] path differs; kept lazyPage @L988 — original: const SubcontractorsPage = lazy(() => import('./pages/projects/subcontractors'));
const ProcurementAnalyticsPage = lazy(() => import('./pages/procurement/procurement-analytics'));
const Project360Page = lazy(() => import('./pages/projects/project-360'));
// DEDUPED [QualityControlPage] path differs; kept lazyPage @L788 — original: const QualityControlPage = lazy(() => import('./pages/procurement/quality-control'));
const WarehousesPage = lazy(() => import('./pages/inventory/warehouses'));
// DEDUPED [ReceiptsPage] path differs; kept lazyPage @L652 — original: const ReceiptsPage = lazy(() => import('./pages/finance/receipts'));
const StockCountsPage = lazy(() => import('./pages/procurement/stock-counts'));
const InventoryAlertsPage = lazy(() => import('./pages/inventory/inventory-alerts'));
const PaymentsPage = lazy(() => import('./pages/finance/suppliers/payments'));
// DEDUPED [ExpensesPage] path differs; kept lazyPage @L723 — original: const ExpensesPage = lazy(() => import('./pages/finance/expenses'));
// DEDUPED [BankReconciliationPage] path differs; kept lazyPage @L746 — original: const BankReconciliationPage = lazy(() => import('./pages/finance/bank-reconciliation'));
// DEDUPED [BalanceSheetPage] path differs; kept lazyPage @L721 — original: const BalanceSheetPage = lazy(() => import('./pages/finance/balance-sheet'));
// DEDUPED [CollectionsPage] path differs; kept lazyPage @L816 — original: const CollectionsPage = lazy(() => import('./pages/crm/collections'));
const VatReportPage = lazy(() => import('./pages/reports/financial/vat-report'));
// DEDUPED [BenefitsPage] path differs; kept lazyPage @L771 — original: const BenefitsPage = lazy(() => import('./pages/hr/benefits'));
// DEDUPED [RecommendationsPage] path differs; kept lazyPage @L753 — original: const RecommendationsPage = lazy(() => import('./pages/recommendations'));
const TicketsPage = lazy(() => import('./pages/support/tickets'));
const AuditPage = lazy(() => import('./pages/crm/security/audit'));
const RolesPage = lazy(() => import('./pages/settings/roles'));
// DEDUPED [FeatureFlagsPage] path differs; kept lazyPage @L839 — original: const FeatureFlagsPage = lazy(() => import('./pages/settings/sections/feature-flags'));
const IntegrationsPage = lazy(() => import('./pages/settings/sections/integrations'));
// DEDUPED [WebhooksPage] path differs; kept lazyPage @L927 — original: const WebhooksPage = lazy(() => import('./pages/settings/webhooks'));
// DEDUPED [LeadScoringPage] path differs; kept lazyPage @L1025 — original: const LeadScoringPage = lazy(() => import('./pages/lead-scoring'));
const SalesForecastPage = lazy(() => import('./pages/sales/sales-forecast'));
// DEDUPED [OnboardingPage] path differs; kept lazyPage @L774 — original: const OnboardingPage = lazy(() => import('./pages/hr/onboarding'));
// DEDUPED [BomManagerPage] path differs; kept lazyPage @L964 — original: const BomManagerPage = lazy(() => import('./pages/production/bom-manager'));
// DEDUPED [CapacityPlanningPage] path differs; kept lazyPage @L856 — original: const CapacityPlanningPage = lazy(() => import('./pages/production/capacity-planning'));
// DEDUPED [ScrapTrackerPage] path differs; kept lazyPage @L883 — original: const ScrapTrackerPage = lazy(() => import('./pages/production/scrap-tracker'));
const RmaPage = lazy(() => import('./pages/customer-service/rma'));
const ReconciliationPage = lazy(() => import('./pages/finance/bank-reconciliation'));
// DEDUPED [PettyCashPage] path differs; kept lazyPage @L803 — original: const PettyCashPage = lazy(() => import('./pages/finance/petty-cash'));
// DEDUPED [FinancialStatementsPage] path differs; kept lazyPage @L870 — original: const FinancialStatementsPage = lazy(() => import('./pages/finance/institutional/financial-statements'));
const AnalyticsPage = lazy(() => import('./pages/hr/hr-analytics'));
const EmailTemplatesPage = lazy(() => import('./pages/notification-settings/email-templates'));
const EmailTemplatesPage2 = lazy(() => import('./pages/notification-settings/email-templates'));
// DEDUPED [NotificationPreferencesPage] path differs; kept lazyPage @L906 — original: const NotificationPreferencesPage = lazy(() => import('./pages/notification-preferences'));
const ExpiryAlertsPage = lazy(() => import('./pages/inventory/expiry-alerts'));
const BalanceSheetPage2 = lazy(() => import('./pages/finance/balance-sheet'));
const FeatureFlagsPage2 = lazy(() => import('./pages/settings/sections/feature-flags'));
const RateLimitsPage = lazy(() => import('./pages/integrations/rate-limits'));
const EventBusPage = lazy(() => import('./pages/integrations/event-bus'));
const EnginePage = lazy(() => import('./pages/platform/workflow-engine'));
const OpportunitiesPage = lazy(() => import('./pages/sales/opportunities'));

// ───────── Execution domain (mega batch 2026-04-18) ─────────
const ExecProjectsListPage = lazy(() => import('./pages/execution/ProjectsListPage'));
const ExecProject360 = lazy(() => import('./pages/execution/Project360'));
const ExecProjectRisksPage = lazy(() => import('./pages/execution/ProjectRisksPage'));
const ExecProjectBlockersPage = lazy(() => import('./pages/execution/ProjectBlockersPage'));
const ExecProjectCostPlansPage = lazy(() => import('./pages/execution/ProjectCostPlansPage'));
const ExecTasksListPage = lazy(() => import('./pages/execution/TasksListPage'));
const ExecTask360 = lazy(() => import('./pages/execution/Task360'));
const ExecWorkOrdersListPage = lazy(() => import('./pages/execution/WorkOrdersListPage'));
const ExecWorkOrder360 = lazy(() => import('./pages/execution/WorkOrder360'));
const ExecWorkOrderTasksPage = lazy(() => import('./pages/execution/WorkOrderTasksPage'));
const ExecDeliveryEventsPage = lazy(() => import('./pages/execution/DeliveryEventsPage'));
const ExecInstallationEventsPage = lazy(() => import('./pages/execution/InstallationEventsPage'));
const ExecMaterialPlanningPage = lazy(() => import('./pages/execution/MaterialPlanningPage'));
const ExecContract360 = lazy(() => import('./pages/execution/Contract360'));
const ExecAlert360 = lazy(() => import('./pages/execution/Alert360'));
const ExecProductionOrdersPage = lazy(() => import('./pages/execution/ProductionOrdersPage'));
const ExecWorkCentersPage = lazy(() => import('./pages/execution/WorkCentersPage'));
const ExecLaborLogsPage = lazy(() => import('./pages/execution/LaborLogsPage'));
const ExecInstallationTeamsPage = lazy(() => import('./pages/execution/InstallationTeamsPage'));
const ExecSiteVisitsPage = lazy(() => import('./pages/execution/SiteVisitsPage'));
const ExecPunchListsPage = lazy(() => import('./pages/execution/PunchListsPage'));
const ExecDrawingsPage = lazy(() => import('./pages/execution/DrawingsPage'));
const ExecBomHeadersPage = lazy(() => import('./pages/execution/BomHeadersPage'));
const ExecRevisionControlPage = lazy(() => import('./pages/execution/RevisionControlPage'));
const SalesDashboardPage = lazy(() => import('./pages/sales/sales-dashboard'));
const SalesAnalyticsPage = lazy(() => import('./pages/sales/sales-analytics'));
const SalesCommissionsPage = lazy(() => import('./pages/sales/sales-commissions'));
const SalesInvoicingPage = lazy(() => import('./pages/sales/sales-invoicing'));
const SalesOrdersPage = lazy(() => import('./pages/sales/sales-orders'));
const SalesReturnsPage = lazy(() => import('./pages/sales/sales-returns'));
const SalesScoringPage = lazy(() => import('./pages/sales/sales-scoring'));
const SalesTerritoriesPage = lazy(() => import('./pages/sales/sales-territories'));
const DealRoomPage = lazy(() => import('./pages/sales/deal-room'));
const Customer360Page2 = lazy(() => import('./pages/crm/customer-360'));
const CrmDashboardPage = lazy(() => import('./pages/crm/crm-dashboard'));
const SegmentationDashboardPage = lazy(() => import('./pages/crm/segmentation-dashboard'));
// DEDUPED [TerritoryManagementPage] path differs; kept lazyPage @L1060 — original: const TerritoryManagementPage = lazy(() => import('./pages/crm/territory-management'));
const BlanketOrdersPage = lazy(() => import('./pages/procurement/blanket-orders'));
const ContractsManagementPage = lazy(() => import('./pages/procurement/contracts-management'));
const DemandPlanningPage = lazy(() => import('./pages/supply-chain/demand-planning'));
const GoodsReceivingPage = lazy(() => import('./pages/procurement/goods-receiving'));
const LandedCostPage = lazy(() => import('./pages/procurement/landed-cost'));
const MakeVsBuyPage = lazy(() => import('./pages/procurement/make-vs-buy'));
const MarketPriceTrackingPage = lazy(() => import('./pages/procurement/market-price-tracking'));
const PoApprovalWorkflowPage = lazy(() => import('./pages/procurement/po-approval-workflow'));
const ProcurementAnalyticsPage2 = lazy(() => import('./pages/procurement/procurement-analytics'));
const ProcurementAutomationPage = lazy(() => import('./pages/procurement/procurement-automation'));
const ProcurementBudgetsPage = lazy(() => import('./pages/procurement/procurement-budgets'));
const ProcurementCommandCenterPage = lazy(() => import('./pages/procurement/procurement-command-center'));
// DEDUPED [PurchaseRequisitionsPage] path differs; kept lazyPage @L897 — original: const PurchaseRequisitionsPage = lazy(() => import('./pages/procurement/purchase-requisitions'));
// DEDUPED [RfqManagementPage] path differs; kept lazyPage @L898 — original: const RfqManagementPage = lazy(() => import('./pages/procurement/rfq-management'));
const SubcontractorManagementPage = lazy(() => import('./pages/procurement/subcontractor-management'));
const ThreeWayMatchingPage = lazy(() => import('./pages/procurement/three-way-matching'));
const ChangeOrdersPagePage = lazy(() => import('./pages/projects/change-orders-page'));
const GanttChartPagePage = lazy(() => import('./pages/projects/gantt-chart-page'));
const PortfolioDashboardPagePage = lazy(() => import('./pages/projects/portfolio-dashboard-page'));
const Project360Page2 = lazy(() => import('./pages/projects/project-360'));
const ProjectAiInsightsPage = lazy(() => import('./pages/projects/project-ai-insights'));
const ProjectBudgetPagePage = lazy(() => import('./pages/projects/project-budget-page'));
const ProjectExecutionPage = lazy(() => import('./pages/projects/project-execution'));
const ProjectFinanceHubPage = lazy(() => import('./pages/projects/project-finance-hub'));
const ProjectInstallationHubPage = lazy(() => import('./pages/projects/project-installation-hub'));
const ProjectProcurementHubPage = lazy(() => import('./pages/projects/project-procurement-hub'));
const ProjectProfitabilityPage = lazy(() => import('./pages/projects/project-profitability'));
const ProjectsCommandCenterPage = lazy(() => import('./pages/projects/projects-command-center'));
const ProjectsDashboardPage = lazy(() => import('./pages/projects/projects-dashboard'));
// DEDUPED [RiskRegisterPage] path differs; kept lazyPage @L995 — original: const RiskRegisterPage = lazy(() => import('./pages/projects/risk-register'));
const MesSystemPage = lazy(() => import('./pages/production/mes-system'));
const MrpPlanningPage = lazy(() => import('./pages/production/mrp-planning'));
const OeeDashboardPage = lazy(() => import('./pages/production/oee-dashboard'));
const ProductionCommandCenterPage = lazy(() => import('./pages/production/production-command-center'));
// DEDUPED [ProductionKanbanPage] path differs; kept lazyPage @L970 — original: const ProductionKanbanPage = lazy(() => import('./pages/production/production-kanban'));
const ShopFloorControlPage = lazy(() => import('./pages/production/shop-floor-control'));
const SmartFactoryDashboardPage = lazy(() => import('./pages/production/smart-factory-dashboard'));
const WorkOrdersListPage = lazy(() => import('./pages/production/work-orders-list'));
const CycleCountsPage = lazy(() => import('./pages/inventory/cycle-counts'));
const DamagedQuarantinePage = lazy(() => import('./pages/inventory/damaged-quarantine'));
const InventoryCommandCenterPage = lazy(() => import('./pages/inventory/inventory-command-center'));
const ReorderIntelligencePage = lazy(() => import('./pages/inventory/reorder-intelligence'));
const ReservationsAllocationsPage = lazy(() => import('./pages/inventory/reservations-allocations'));
const StockValuationAgingPage = lazy(() => import('./pages/inventory/stock-valuation-aging'));
const VmiManagementPage = lazy(() => import('./pages/inventory/vmi-management'));
const WmsBarcodePage = lazy(() => import('./pages/inventory/wms-barcode'));
const WmsCrossDockingPage = lazy(() => import('./pages/inventory/wms-cross-docking'));
const WmsCycleCountingPage = lazy(() => import('./pages/inventory/wms-cycle-counting'));
const WmsLotTraceabilityPage = lazy(() => import('./pages/inventory/wms-lot-traceability'));
const WmsPickPackShipPage = lazy(() => import('./pages/inventory/wms-pick-pack-ship'));
const WmsPutawayRulesPage = lazy(() => import('./pages/inventory/wms-putaway-rules'));
const WmsStockInquiryPage = lazy(() => import('./pages/inventory/wms-stock-inquiry'));
const WmsTransferOrdersPage = lazy(() => import('./pages/inventory/wms-transfer-orders'));
const AccountsPayablePage = lazy(() => import('./pages/finance/accounts-payable'));
const AccountsReceivablePage = lazy(() => import('./pages/finance/accounts-receivable'));
const BankAccountsPage = lazy(() => import('./pages/finance/bank-accounts'));
// DEDUPED [ChecksManagementPage] path differs; kept lazyPage @L823 — original: const ChecksManagementPage = lazy(() => import('./pages/finance/checks-management'));
const CollectionsDashboardPage = lazy(() => import('./pages/finance/collections-dashboard'));
const FinanceControlCenterPage = lazy(() => import('./pages/finance/finance-control-center'));
const AtsRecruitmentPage = lazy(() => import('./pages/hr/ats-recruitment'));
const EmployeeCardPage = lazy(() => import('./pages/hr/employee-card'));
const EmployeeDocumentsPage = lazy(() => import('./pages/hr/employee-documents'));
const EmployeeEquipmentPage = lazy(() => import('./pages/hr/employee-equipment'));
const EmployeeSelfServicePage = lazy(() => import('./pages/hr/employee-self-service'));
// DEDUPED [EmployeesListPage] path differs; kept lazyPage @L759 — original: const EmployeesListPage = lazy(() => import('./pages/hr/employees-list'));
const HrCommandCenterPage = lazy(() => import('./pages/hr/hr-command-center'));
const HrDashboardPage = lazy(() => import('./pages/hr/hr-dashboard'));
const TalentManagementPage = lazy(() => import('./pages/hr/talent-management'));
const ApprovalWorkflowsPage = lazy(() => import('./pages/documents/approval-workflows'));
const DmsCommandCenterPage = lazy(() => import('./pages/documents/dms-command-center'));
const DmsRepositoryPage = lazy(() => import('./pages/documents/dms-repository'));
const DocumentAlertsPage = lazy(() => import('./pages/documents/document-alerts'));
const DocumentAnalyticsPage = lazy(() => import('./pages/documents/document-analytics'));
const DocumentAuditTrailPage = lazy(() => import('./pages/documents/document-audit-trail'));
const DocumentCategoriesPage = lazy(() => import('./pages/documents/document-categories'));
const EntityLinkedDocumentsPage = lazy(() => import('./pages/documents/entity-linked-documents'));
const TemplatesLibraryPage = lazy(() => import('./pages/documents/templates-library'));
const AiAdminSettingsPage = lazy(() => import('./pages/ai-engine/ai-admin-settings'));
const AiAnomalyDetectionPage = lazy(() => import('./pages/ai-engine/ai-anomaly-detection'));
const AiAuditLogPage = lazy(() => import('./pages/ai-engine/ai-audit-log'));
const AiAutomatedReportsPage = lazy(() => import('./pages/ai-engine/ai-automated-reports'));
const AiCustomerServiceProPage = lazy(() => import('./pages/ai-engine/ai-customer-service-pro'));
const AiEngineHubPage = lazy(() => import('./pages/ai-engine/ai-engine-hub'));
const AiExecutiveInsightsPage = lazy(() => import('./pages/ai-engine/ai-executive-insights'));
const AiFollowUpPage = lazy(() => import('./pages/ai-engine/ai-follow-up'));
const AiLeadScoringProPage = lazy(() => import('./pages/ai-engine/ai-lead-scoring-pro'));
const AiProcurementOptimizerPage = lazy(() => import('./pages/ai-engine/ai-procurement-optimizer'));
const AiProductionInsightsPage = lazy(() => import('./pages/ai-engine/ai-production-insights'));
const AiQuotationAssistantPage = lazy(() => import('./pages/ai-engine/ai-quotation-assistant'));
const AiRecommendationEnginePage = lazy(() => import('./pages/ai-engine/ai-recommendation-engine'));
const AiSalesAssistantPage = lazy(() => import('./pages/ai-engine/ai-sales-assistant'));
const NlQueryPage = lazy(() => import('./pages/ai-engine/nl-query'));
const SentimentAnalysisPage = lazy(() => import('./pages/ai-engine/sentiment-analysis'));
const DecisionQueuePage = lazy(() => import('./pages/command-center/decision-queue'));
const ExecutionLogPage = lazy(() => import('./pages/command-center/execution-log'));
const LiveEventStreamPage = lazy(() => import('./pages/command-center/live-event-stream'));
const ProfitIntelligencePage = lazy(() => import('./pages/command-center/profit-intelligence'));
const ObjectExplorerPage = lazy(() => import('./pages/palantir/object-explorer'));
const OntologyManagerPage = lazy(() => import('./pages/palantir/ontology-manager'));
const LinkAnalysisGraphPage = lazy(() => import('./pages/palantir/link-analysis-graph'));
const EhsDashboardPage = lazy(() => import('./pages/ehs/ehs-dashboard'));
const EnvironmentalPermitsPage = lazy(() => import('./pages/ehs/environmental-permits'));
const HazardousMaterialsPage = lazy(() => import('./pages/ehs/hazardous-materials'));
// DEDUPED [SafetyIncidentsPage] path differs; kept lazyPage @L886 — original: const SafetyIncidentsPage = lazy(() => import('./pages/production/safety-incidents'));
const GdprCenterPage = lazy(() => import('./pages/security/gdpr-center'));
const DataRetentionPage = lazy(() => import('./pages/security/data-retention'));
const SecurityDashboardPage = lazy(() => import('./pages/security/security-dashboard'));
const ComplianceReportsPage = lazy(() => import('./pages/security/compliance-reports'));
const FleetManagementPage = lazy(() => import('./pages/logistics/fleet-management'));
const FleetCommandCenterPage = lazy(() => import('./pages/logistics/fleet-command-center'));
const RoutePlanningPage = lazy(() => import('./pages/logistics/route-planning'));
const DriverManagementPage = lazy(() => import('./pages/logistics/driver-management'));
const ShipmentTrackingLivePage = lazy(() => import('./pages/logistics/shipment-tracking-live'));
const VehicleMaintenancePage = lazy(() => import('./pages/logistics/vehicle-maintenance'));
const OeeDashboardPage2 = lazy(() => import('./pages/production/oee-dashboard'));
const OperationsCommandCenterPage = lazy(() => import('./pages/operations/operations-command-center'));
const ShiftHandoverPage = lazy(() => import('./pages/operations/shift-handover'));
const KpiMonitorPage = lazy(() => import('./pages/operations/kpi-monitor'));
const DowntimeTrackingPage = lazy(() => import('./pages/operations/downtime-tracking'));
const WorkflowMonitorPage = lazy(() => import('./pages/operations/workflow-monitor'));
const ApiGatewayPage = lazy(() => import('./pages/integrations/api-gateway'));
const CredentialsVaultPage = lazy(() => import('./pages/integrations/credentials-vault'));
const EventBusPage2 = lazy(() => import('./pages/integrations/event-bus'));
const ExternalConnectorsPage = lazy(() => import('./pages/integrations/external-connectors'));
const IntegrationDashboardPage = lazy(() => import('./pages/integrations/integration-dashboard'));
const McpHubPage = lazy(() => import('./pages/integrations/mcp-hub'));
const SyncJobsPage = lazy(() => import('./pages/integrations/sync-jobs'));
const WebhookGatewayPage = lazy(() => import('./pages/integrations/webhook-gateway'));
const PermissionsMatrixPage = lazy(() => import('./pages/system/permissions-matrix'));
const RolesListPage = lazy(() => import('./pages/system/roles-list'));
const UsersListPage = lazy(() => import('./pages/system/users-list'));
const AccessAuditViewPage = lazy(() => import('./pages/system/access-audit-view'));
const ApprovalPolicyManagementPage = lazy(() => import('./pages/system/approval-policy-management'));
const DataScopeManagementPage = lazy(() => import('./pages/system/data-scope-management'));
const MasterDataPage = lazy(() => import('./pages/platform/master-data'));
const RecycleBinPage = lazy(() => import('./pages/platform/recycle-bin'));
const SlaDashboardPage = lazy(() => import('./pages/platform/sla-dashboard'));
const WorkflowEnginePage = lazy(() => import('./pages/platform/workflow-engine'));
const ApprovalChainsPage = lazy(() => import('./pages/platform/approval-chains'));
const TendersManagementPage = lazy(() => import('./pages/tenders/tenders-management'));
const TenderDashboardPage = lazy(() => import('./pages/tenders/tender-dashboard'));
const TenderSubmissionsPage = lazy(() => import('./pages/tenders/tender-submissions'));
const TenderEvaluationPage = lazy(() => import('./pages/tenders/tender-evaluation'));
const TenderPricingPage = lazy(() => import('./pages/tenders/tender-pricing'));
const TenderDocumentsPage = lazy(() => import('./pages/tenders/tender-documents'));
const BidAnalysisPage = lazy(() => import('./pages/tenders/bid-analysis'));
const TendersCommandCenterPage = lazy(() => import('./pages/tenders/tenders-command-center'));
const QualityDashboardPage = lazy(() => import('./pages/quality/quality-dashboard'));
const CapaPage = lazy(() => import('./pages/quality/capa'));
const ComplaintsPage = lazy(() => import('./pages/quality/complaints'));
const InternalAuditPage = lazy(() => import('./pages/quality/internal-audit'));
const IsoManagementPage = lazy(() => import('./pages/quality/iso-management'));
const MaterialCertsPage = lazy(() => import('./pages/quality/material-certs'));
const QualityManagementSystemPage = lazy(() => import('./pages/quality/quality-management-system'));
const SpcPage = lazy(() => import('./pages/quality/spc'));
const SupplierQualityPage = lazy(() => import('./pages/quality/supplier-quality'));
const TestingLabPage = lazy(() => import('./pages/quality/testing-lab'));
const SlaTrackingPage = lazy(() => import('./pages/support/sla-tracking'));
const SupportCommandCenterPage = lazy(() => import('./pages/support/support-command-center'));
const ServiceCommandCenterPage = lazy(() => import('./pages/service/service-command-center'));
const ServiceContractsPage = lazy(() => import('./pages/service/service-contracts'));
const ServiceWarrantyPage = lazy(() => import('./pages/service/service-warranty'));
const TechnicianManagementPage = lazy(() => import('./pages/service/technician-management'));
const SparePartsPage = lazy(() => import('./pages/service/spare-parts'));
const BalancedScorecardPagePage = lazy(() => import('./pages/strategy/balanced-scorecard-page'));
const BusinessPlanPagePage = lazy(() => import('./pages/strategy/business-plan-page'));
const CompetitiveAnalysisPagePage = lazy(() => import('./pages/strategy/competitive-analysis-page'));
const GoalsPagePage = lazy(() => import('./pages/strategy/goals-page'));
const SwotPagePage = lazy(() => import('./pages/strategy/swot-page'));
const SupplyChainDashboardPage = lazy(() => import('./pages/supply-chain/supply-chain-dashboard'));
const BomCommandCenterPage = lazy(() => import('./pages/supply-chain/bom-command-center'));
const BomWhereUsedPage = lazy(() => import('./pages/supply-chain/bom-where-used'));
const DemandPlanningPage2 = lazy(() => import('./pages/supply-chain/demand-planning'));
const EdiDashboardPage = lazy(() => import('./pages/supply-chain/edi-dashboard'));
const EngineeringChangeOrdersPage = lazy(() => import('./pages/supply-chain/engineering-change-orders'));
const LeadTimeManagementPage = lazy(() => import('./pages/supply-chain/lead-time-management'));
const CustomerPortalDashboardPage = lazy(() => import('./pages/portal/customer-portal-dashboard'));
// DEDUPED [ContractorPortalPage] path differs; kept lazyPage @L961 — original: const ContractorPortalPage = lazy(() => import('./pages/portal/contractor-portal'));
// DEDUPED [EmployeePortalPage] path differs; kept lazyPage @L962 — original: const EmployeePortalPage = lazy(() => import('./pages/portal/employee-portal'));
const SupplierPortalPage2 = lazy(() => import('./pages/procurement/supplier-portal'));
const ReportsHubPage = lazy(() => import('./pages/reports/reports-hub'));
const KpiDashboardPage = lazy(() => import('./pages/reports/kpi-dashboard'));
const FinancialReportsPage = lazy(() => import('./pages/reports/financial-reports'));
const OperationalReportsPage = lazy(() => import('./pages/reports/operational-reports'));
const RiskAnalysisPage = lazy(() => import('./pages/reports/risk-analysis'));
const InstallationCommandCenterPage = lazy(() => import('./pages/installation/installation-command-center'));
const InstallationExecutionPage = lazy(() => import('./pages/installation/installation-execution'));
const InstallationTeamsPage = lazy(() => import('./pages/installation/installation-teams'));
const InstallationSchedulingPage = lazy(() => import('./pages/installation/installation-scheduling'));
const MeasurementsSurveysPage = lazy(() => import('./pages/installation/measurements-surveys'));
const SiteReadinessPage = lazy(() => import('./pages/installation/site-readiness'));
const AgentControlDashboardPage = lazy(() => import('./pages/crm/agent-control-dashboard'));
const BehavioralAnalyticsPage = lazy(() => import('./pages/crm/behavioral-analytics'));
const CommunicationIntelligencePage = lazy(() => import('./pages/crm/communication-intelligence'));
const CrmCommunicationsHubPage = lazy(() => import('./pages/crm/crm-communications-hub'));
const DecisionEnginePage = lazy(() => import('./pages/crm/decision-engine'));
const IntelligenceEnginePage = lazy(() => import('./pages/crm/intelligence-engine'));
const NurtureSequencesPage = lazy(() => import('./pages/crm/nurture-sequences'));
const PipelineFinancialPage = lazy(() => import('./pages/crm/pipeline-financial'));
const PredictiveForecastingPage = lazy(() => import('./pages/crm/predictive-forecasting'));
const RelationshipGraphPage = lazy(() => import('./pages/crm/relationship-graph'));
const Quote360Page = lazy(() => import('./pages/sales/Quote360'));
const CompetitorAnalysisPage = lazy(() => import('./pages/procurement/competitor-analysis'));
const DeliveryDocumentsPage = lazy(() => import('./pages/procurement/delivery-documents'));
const DocumentsSignaturesPage = lazy(() => import('./pages/procurement/documents-signatures'));
const InventorySyncPage = lazy(() => import('./pages/procurement/inventory-sync'));
const LogisticsTrackingPage = lazy(() => import('./pages/procurement/logistics-tracking'));
const PoApprovalsPage = lazy(() => import('./pages/procurement/po-approvals'));
const PriceManagementPage = lazy(() => import('./pages/procurement/price-management'));
const ProcurementAlertsPage = lazy(() => import('./pages/procurement/procurement-alerts'));
const ProcurementCompliancePage = lazy(() => import('./pages/procurement/procurement-compliance'));
const ProcurementExceptionsPage = lazy(() => import('./pages/procurement/procurement-exceptions'));
const ProcurementProfitImpactPage = lazy(() => import('./pages/procurement/procurement-profit-impact'));
const ProcurementSettingsPage = lazy(() => import('./pages/procurement/procurement-settings'));
const ProcurementSimulationPage = lazy(() => import('./pages/procurement/procurement-simulation'));
const ProductBomPage = lazy(() => import('./pages/procurement/products/product-bom'));
const ProductCostingPage = lazy(() => import('./pages/procurement/products/product-costing'));
const ProductsDashboardPage = lazy(() => import('./pages/procurement/products/products-dashboard'));
const ProductsListPage = lazy(() => import('./pages/procurement/products/products-list'));
const ProfitabilityDashboardPage = lazy(() => import('./pages/procurement/profitability-dashboard'));
const QualityControlPage2 = lazy(() => import('./pages/procurement/quality-control'));
const CostAnalysisPage = lazy(() => import('./pages/procurement/raw-materials/cost-analysis'));
const RawMaterialStockPage = lazy(() => import('./pages/procurement/raw-materials/raw-material-stock'));
const RawMaterialsDashboardPage = lazy(() => import('./pages/procurement/raw-materials/raw-materials-dashboard'));
const RawMaterialsListPage = lazy(() => import('./pages/procurement/raw-materials/raw-materials-list'));
const ScrapWastePage = lazy(() => import('./pages/procurement/raw-materials/scrap-waste'));
const WeightCalculatorPage = lazy(() => import('./pages/procurement/raw-materials/weight-calculator'));
const SupplierDependencyPage = lazy(() => import('./pages/procurement/supplier-dependency'));
const SupplierManagementPage = lazy(() => import('./pages/procurement/supplier-management'));
const SupplierPortalPage3 = lazy(() => import('./pages/procurement/supplier-portal'));
const SupplierReturnsPage = lazy(() => import('./pages/procurement/supplier-returns'));
const VendorNegotiationPage = lazy(() => import('./pages/procurement/vendor-negotiation'));
const CustomerProjectPortalPagePage = lazy(() => import('./pages/projects/customer-project-portal-page'));
const ProjectAlertsPage = lazy(() => import('./pages/projects/project-alerts'));
const ProjectDocumentsPagePage = lazy(() => import('./pages/projects/project-documents-page'));
const ProjectEventsAuditPage = lazy(() => import('./pages/projects/project-events-audit'));
const ProjectPortalPagePage = lazy(() => import('./pages/projects/project-portal-page'));
const ProjectProductionTrackingPage = lazy(() => import('./pages/projects/project-production-tracking'));
const ProjectSettingsPage = lazy(() => import('./pages/projects/project-settings'));
const ProjectTemplatesPagePage = lazy(() => import('./pages/projects/project-templates-page'));
const ProjectWorkflowPage = lazy(() => import('./pages/projects/project-workflow'));
const RiskDashboardPagePage = lazy(() => import('./pages/projects/risk-dashboard-page'));
const AssetsDashboardPage = lazy(() => import('./pages/assets/assets-dashboard'));
const EquipmentInsurancePage = lazy(() => import('./pages/assets/equipment-insurance'));
const LeasingPage = lazy(() => import('./pages/assets/leasing'));
const ToolsDiesPage = lazy(() => import('./pages/assets/tools-dies'));
const InventoryAlertsPage2 = lazy(() => import('./pages/inventory/inventory-alerts'));
const InventoryUltraDashboardPage = lazy(() => import('./pages/inventory/inventory-ultra-dashboard'));
const StockItemsManagementPage = lazy(() => import('./pages/inventory/stock-items-management'));
const VmiSupplierPortalPage = lazy(() => import('./pages/inventory/vmi-supplier-portal'));
const WarehousesManagementPage = lazy(() => import('./pages/inventory/warehouses-management'));
const WmsAnalyticsPage = lazy(() => import('./pages/inventory/wms-analytics'));
const WmsConsignmentPage = lazy(() => import('./pages/inventory/wms-consignment'));
const WmsExpiryDashboardPage = lazy(() => import('./pages/inventory/wms-expiry-dashboard'));
const WmsKitsPage = lazy(() => import('./pages/inventory/wms-kits'));
const WmsLocationHierarchyPage = lazy(() => import('./pages/inventory/wms-location-hierarchy'));
const WmsValuationPage = lazy(() => import('./pages/inventory/wms-valuation'));
const AccountingExportPage = lazy(() => import('./pages/finance/accounting-export'));
const ContractorPaymentDecisionModelPage = lazy(() => import('./pages/finance/contractor-payment-decision-model'));
const FinControlCenterPage = lazy(() => import('./pages/finance/fin-control-center'));
const FinanceAlertsPage = lazy(() => import('./pages/finance/finance-alerts'));
const FinanceFixedAssetsPage = lazy(() => import('./pages/finance/finance-fixed-assets'));
const FinancialAnalyticsPage = lazy(() => import('./pages/finance/financial-analytics'));
const FinancialStatementsPage2 = lazy(() => import('./pages/finance/institutional/financial-statements'));
const MonteCarloEnginePage = lazy(() => import('./pages/finance/institutional/monte-carlo-engine'));
const RatioDashboardPage = lazy(() => import('./pages/finance/institutional/ratio-dashboard'));
const RiskDashboardPage = lazy(() => import('./pages/finance/institutional/risk-dashboard'));
const TreasuryDashboardPage = lazy(() => import('./pages/finance/institutional/treasury-dashboard'));
const IsraeliIntegrationsPage = lazy(() => import('./pages/settings/israeli-integrations'));
const MasavManagementPage = lazy(() => import('./pages/finance/masav-management'));
const PayablesDashboardPage = lazy(() => import('./pages/finance/payables-dashboard'));
const PaymentOperationsPage = lazy(() => import('./pages/finance/payment-operations'));
const ProfitabilityFeedbackLoopPage = lazy(() => import('./pages/finance/profitability-feedback-loop'));
const ComplianceDashboardPage = lazy(() => import('./pages/hr/compliance-dashboard'));
const DisciplinaryIncidentsPage = lazy(() => import('./pages/hr/disciplinary-incidents'));
const EmploymentHistoryPage = lazy(() => import('./pages/hr/employment-history'));
const Feedback360Page = lazy(() => import('./pages/hr/feedback-360'));
const HrAlertsPage = lazy(() => import('./pages/hr/hr-alerts'));
const HrAnalyticsPage = lazy(() => import('./pages/hr/hr-analytics'));
const HrSettingsPage = lazy(() => import('./pages/hr/hr-settings'));
const LaborCostAllocationPage = lazy(() => import('./pages/hr/labor-cost-allocation'));
const OffboardingRetirementPage = lazy(() => import('./pages/hr/offboarding-retirement'));
const TrainingManagementPage = lazy(() => import('./pages/hr/training-management'));
const Employee360Page = lazy(() => import('./pages/workforce/Employee360'));
const PayrollRun360Page = lazy(() => import('./pages/workforce/PayrollRun360'));
const WageSlipsArchivePage = lazy(() => import('./pages/workforce/WageSlipsArchivePage'));
const ComplaintsPage2 = lazy(() => import('./pages/quality/complaints'));
const RmaPage2 = lazy(() => import('./pages/customer-service/rma'));
const ServiceDashboardPage = lazy(() => import('./pages/customer-service/service-dashboard'));
// DEDUPED [WarrantyManagementPage] path differs; kept lazyPage @L830 — original: const WarrantyManagementPage = lazy(() => import('./pages/support/warranty-management'));
const ContractAiAnalysisPage = lazy(() => import('./pages/contracts/contract-ai-analysis'));
const ContractAnalyticsDashboardPage = lazy(() => import('./pages/contracts/contract-analytics-dashboard'));
const ContractRiskScoringPage = lazy(() => import('./pages/contracts/contract-risk-scoring'));
const ContractTemplatesPage = lazy(() => import('./pages/contracts/contract-templates'));
const ContractsDashboardPage = lazy(() => import('./pages/contracts/contracts-dashboard'));
const ContractsManagementPage2 = lazy(() => import('./pages/procurement/contracts-management'));
const NdaAgreementsPage = lazy(() => import('./pages/contracts/nda-agreements'));
const ServiceAgreementsPage = lazy(() => import('./pages/contracts/service-agreements'));
const BulkOperationsPage = lazy(() => import('./pages/documents/bulk-operations'));
// DEDUPED [DocumentControlPage] path differs; kept lazyPage @L809 — original: const DocumentControlPage = lazy(() => import('./pages/quality/document-control'));
const DocumentPermissionsPage = lazy(() => import('./pages/documents/document-permissions'));
const DocumentRegistryPage = lazy(() => import('./pages/documents/document-registry'));
const DocumentSearchPage = lazy(() => import('./pages/documents/document-search'));
const DocumentSettingsPage = lazy(() => import('./pages/documents/document-settings'));
const IncomingDocumentsPage = lazy(() => import('./pages/documents/incoming-documents'));
const ModuleDocumentsPage = lazy(() => import('./pages/documents/module-documents'));
const OcrProcessingPage = lazy(() => import('./pages/documents/ocr-processing'));
const OutgoingDocumentsPage = lazy(() => import('./pages/documents/outgoing-documents'));
const RetentionCompliancePage = lazy(() => import('./pages/documents/retention-compliance'));
const VersionControlPage = lazy(() => import('./pages/documents/version-control'));
const AnomalyDetectionPage = lazy(() => import('./pages/advanced/anomaly-detection'));
const DigitalTwinFactoryPage = lazy(() => import('./pages/advanced/digital-twin-factory'));
const GraphAnalyticsPage = lazy(() => import('./pages/advanced/graph-analytics'));
const NlQueryAssistantPage = lazy(() => import('./pages/advanced/nl-query-assistant'));
const PredictiveForecastingPage2 = lazy(() => import('./pages/crm/predictive-forecasting'));
const AiCustomerServicePage = lazy(() => import('./pages/sales/ai-customer-service'));
const Bash44AgentConfigPage = lazy(() => import('./pages/ai-engine/bash44-agent-config'));
const Bash44AgentRunsPage = lazy(() => import('./pages/ai-engine/bash44-agent-runs'));
const Bash44AlertsCenterPage = lazy(() => import('./pages/ai-engine/bash44-alerts-center'));
const Bash44ApprovalQueuePage = lazy(() => import('./pages/ai-engine/bash44-approval-queue'));
const Bash44ControlCenterPage = lazy(() => import('./pages/ai-engine/bash44-control-center'));
const Bash44ExecutiveBriefPage = lazy(() => import('./pages/ai-engine/bash44-executive-brief'));
const Bash44KnowledgeContextsPage = lazy(() => import('./pages/ai-engine/bash44-knowledge-contexts'));
const Bash44RecommendationsPage = lazy(() => import('./pages/ai-engine/bash44-recommendations'));
const EmployeeChatbotPage = lazy(() => import('./pages/ai-engine/employee-chatbot'));
const KobiPromptsPage = lazy(() => import('./pages/ai-engine/kobi-prompts'));
const MlTrainingPipelinePage = lazy(() => import('./pages/ai-engine/ml-training-pipeline'));
const BiHubPage = lazy(() => import('./pages/bi/bi-hub'));
const ComparativeAnalyticsPage = lazy(() => import('./pages/bi/comparative-analytics'));
const CustomDashboardsPage = lazy(() => import('./pages/bi/custom-dashboards'));
const DataExplorerPage = lazy(() => import('./pages/bi/data-explorer'));
const ScheduledReportsPage = lazy(() => import('./pages/bi/scheduled-reports'));
const BusinessRulesBuilderPage = lazy(() => import('./pages/builder/business-rules-builder'));
const ScheduledTasksPage = lazy(() => import('./pages/builder/scheduled-tasks'));
const VisualWorkflowDesignerPage = lazy(() => import('./pages/builder/visual-workflow-designer'));
const WebhookManagementPage = lazy(() => import('./pages/builder/webhook-management'));
const CausalImpactViewerPage = lazy(() => import('./pages/command-center/causal-impact-viewer'));
const CommandCenterPage2 = lazy(() => import('./pages/command-center/command-center'));
const BiFinancialStatementsPage = lazy(() => import('./pages/reports/bi-financial-statements'));
const BiHrAnalyticsPage = lazy(() => import('./pages/reports/bi-hr-analytics'));
const BiInventoryAnalyticsPage = lazy(() => import('./pages/reports/bi-inventory-analytics'));
const BiProductionAnalyticsPage = lazy(() => import('./pages/reports/bi-production-analytics'));
const BiSalesAnalyticsPage = lazy(() => import('./pages/reports/bi-sales-analytics'));
const ReportCustomerAgingPage = lazy(() => import('./pages/reports/financial/report-customer-aging'));
const ReportExecutiveSummaryPage = lazy(() => import('./pages/reports/financial/report-executive-summary'));
const ReportFiscalPage = lazy(() => import('./pages/reports/financial/report-fiscal'));
const ReportInvoiceAnalysisPage = lazy(() => import('./pages/reports/financial/report-invoice-analysis'));
const ReportVatPage = lazy(() => import('./pages/reports/financial/report-vat'));
const ReportVendorAgingPage = lazy(() => import('./pages/reports/financial/report-vendor-aging'));
const BackupDrPage = lazy(() => import('./pages/security/backup-dr'));
const EncryptionManagementPage = lazy(() => import('./pages/security/encryption-management'));
const ApiKeysSecurityPage = lazy(() => import('./pages/security/tabs/api-keys-security'));
const CorsManagementPage = lazy(() => import('./pages/security/tabs/cors-management'));
const GeoBlockingPage = lazy(() => import('./pages/security/tabs/geo-blocking'));
const IpManagementPage = lazy(() => import('./pages/security/tabs/ip-management'));
const RateLimitConfigPage = lazy(() => import('./pages/security/tabs/rate-limit-config'));
const VulnerabilityTrackerPage = lazy(() => import('./pages/security/tabs/vulnerability-tracker'));
const WebhookSecretsPage = lazy(() => import('./pages/security/tabs/webhook-secrets'));
const AuthTokensPage = lazy(() => import('./pages/integrations/auth-tokens'));
const IntegrationAlertsPage = lazy(() => import('./pages/integrations/integration-alerts'));
const IntegrationAuditPage = lazy(() => import('./pages/integrations/integration-audit'));
// DEDUPED [IntegrationSettingsPage] path differs; kept lazyPage @L673 — original: const IntegrationSettingsPage = lazy(() => import('./pages/integrations/integration-settings'));
const PayloadValidationPage = lazy(() => import('./pages/integrations/payload-validation'));
const RateLimitsPage2 = lazy(() => import('./pages/integrations/rate-limits'));
const RetriesDlqPage = lazy(() => import('./pages/integrations/retries-dlq'));
const TransformationEnginePage = lazy(() => import('./pages/integrations/transformation-engine'));
const DataFabricOverviewPage = lazy(() => import('./pages/data-fabric/data-fabric-overview'));
const DataProductsPage = lazy(() => import('./pages/data-fabric/data-products'));
const DataQualityDashboardPage = lazy(() => import('./pages/data-fabric/data-quality-dashboard'));
const IdentityResolutionPage = lazy(() => import('./pages/data-fabric/identity-resolution'));
const LineageGraphPage = lazy(() => import('./pages/data-fabric/lineage-graph'));
const DataMigrationPage = lazy(() => import('./pages/data-migration'));
const CanonicalExplorerPage = lazy(() => import('./pages/data-platform/canonical-explorer'));
const PlatformObservatoryPage = lazy(() => import('./pages/data-platform/platform-observatory'));
const QuarantineBrowserPage = lazy(() => import('./pages/data-platform/quarantine-browser'));
const AnnualSafetyReportPage = lazy(() => import('./pages/ehs/annual-safety-report'));
const EmergencyPreparednessPage = lazy(() => import('./pages/ehs/emergency-preparedness'));
const EnergyManagementPage = lazy(() => import('./pages/ehs/energy-management'));
const IsraeliRegulatoryPage = lazy(() => import('./pages/ehs/israeli-regulatory'));
const PpeManagementPage = lazy(() => import('./pages/ehs/ppe-management'));
const RiskAssessmentPage = lazy(() => import('./pages/ehs/risk-assessment'));
const SafetyInspectionsPage = lazy(() => import('./pages/ehs/safety-inspections'));
const SafetyTrainingCertsPage = lazy(() => import('./pages/ehs/safety-training-certs'));
const WasteManagementPage = lazy(() => import('./pages/ehs/waste-management'));
const WorkPermitsPage = lazy(() => import('./pages/ehs/work-permits'));
const DesignReviewsPage = lazy(() => import('./pages/engineering/design-reviews'));
const DrawingManagementPage = lazy(() => import('./pages/engineering/drawing-management'));
const EngineeringAlertsPage = lazy(() => import('./pages/engineering/engineering-alerts'));
const EngineeringAnalyticsPage = lazy(() => import('./pages/engineering/engineering-analytics'));
const EngineeringCalculationsPage = lazy(() => import('./pages/engineering/engineering-calculations'));
const EngineeringCommandCenterPage = lazy(() => import('./pages/engineering/engineering-command-center'));
const EngineeringDocumentsPage = lazy(() => import('./pages/engineering/engineering-documents'));
const EngineeringOfficePage = lazy(() => import('./pages/engineering/engineering-office'));
const EngineeringProjectsPage = lazy(() => import('./pages/engineering/engineering-projects'));
const EngineeringSettingsPage = lazy(() => import('./pages/engineering/engineering-settings'));
const EngineeringStandardsPage = lazy(() => import('./pages/engineering/engineering-standards'));
const MaterialSpecificationsPage = lazy(() => import('./pages/engineering/material-specifications'));
// DEDUPED [ProductCatalogPage] path differs; kept lazyPage @L787 — original: const ProductCatalogPage = lazy(() => import('./pages/modules/product-catalog'));
const PrototypeTestingPage = lazy(() => import('./pages/engineering/prototype-testing'));
const BiCommandCenterPage = lazy(() => import('./pages/executive/bi-command-center'));
const ExecutiveCommandCenterPage = lazy(() => import('./pages/executive/executive-command-center'));
const ExecutiveScorecardPage = lazy(() => import('./pages/executive/executive-scorecard'));
const FabAccessoriesPage = lazy(() => import('./pages/fabrication/fab-accessories'));
const FabAssemblyOrdersPage = lazy(() => import('./pages/fabrication/fab-assembly-orders'));
const FabCoatingOrdersPage = lazy(() => import('./pages/fabrication/fab-coating-orders'));
const FabCuttingListsPage = lazy(() => import('./pages/fabrication/fab-cutting-lists'));
const FabFinishesColorsPage = lazy(() => import('./pages/fabrication/fab-finishes-colors'));
const FabGlassCatalogPage = lazy(() => import('./pages/fabrication/fab-glass-catalog'));
const FabGlazingOrdersPage = lazy(() => import('./pages/fabrication/fab-glazing-orders'));
const FabInstallationOrdersPage = lazy(() => import('./pages/fabrication/fab-installation-orders'));
const FabPackingListsPage = lazy(() => import('./pages/fabrication/fab-packing-lists'));
const FabProfilesPage = lazy(() => import('./pages/fabrication/fab-profiles'));
const FabServiceTicketsPage = lazy(() => import('./pages/fabrication/fab-service-tickets'));
const FabSystemsPage = lazy(() => import('./pages/fabrication/fab-systems'));
const FabTransportOrdersPage = lazy(() => import('./pages/fabrication/fab-transport-orders'));
const FabWeldingOrdersPage = lazy(() => import('./pages/fabrication/fab-welding-orders'));
const FabWorkflowTrackerPage = lazy(() => import('./pages/fabrication/fab-workflow-tracker'));
const FinAccountingPage = lazy(() => import('./pages/fin/fin-accounting'));
const FinCreditClearingPage = lazy(() => import('./pages/fin/fin-credit-clearing'));
const FinDashboardPage = lazy(() => import('./pages/fin/fin-dashboard'));
const FinDocumentCreatePage = lazy(() => import('./pages/fin/fin-document-create'));
const FinDocumentDetailsPage = lazy(() => import('./pages/fin/fin-document-details'));
const FinDocumentsListPage = lazy(() => import('./pages/fin/fin-documents-list'));
const FinRecurringPage = lazy(() => import('./pages/fin/fin-recurring'));
const FinStandingOrdersPage = lazy(() => import('./pages/fin/fin-standing-orders'));
const ContainersPackagesPage = lazy(() => import('./pages/import/containers-packages'));
// DEDUPED [CustomsClearancePage] path differs; kept lazyPage @L704 — original: const CustomsClearancePage = lazy(() => import('./pages/modules/customs-clearance'));
// DEDUPED [ForeignSuppliersPage] path differs; kept lazyPage @L706 — original: const ForeignSuppliersPage = lazy(() => import('./pages/modules/foreign-suppliers'));
const ImportAnalyticsPage = lazy(() => import('./pages/import/import-analytics'));
const ImportApprovalsPage = lazy(() => import('./pages/import/import-approvals'));
// DEDUPED [ImportDashboardPage] path differs; kept lazyPage @L690 — original: const ImportDashboardPage = lazy(() => import('./pages/modules/import-dashboard'));
const ImportDocumentsPage = lazy(() => import('./pages/import/import-documents'));
const ImportPurchaseOrdersPage = lazy(() => import('./pages/import/import-purchase-orders'));
const ImportReceivingPage = lazy(() => import('./pages/import/import-receiving'));
const ImportRiskAlertsPage = lazy(() => import('./pages/import/import-risk-alerts'));
const ImportSettingsPage = lazy(() => import('./pages/import/import-settings'));
const ImportShipmentsPage = lazy(() => import('./pages/import/import-shipments'));
const ImportTrackingPage = lazy(() => import('./pages/import/import-tracking'));
const LandedCostCalculatorPage = lazy(() => import('./pages/import/landed-cost-calculator'));
const ShippingForwardersPage = lazy(() => import('./pages/import/shipping-forwarders'));
const CustomerHandoverPage = lazy(() => import('./pages/installation/customer-handover'));
const EquipmentToolsPage = lazy(() => import('./pages/installation/equipment-tools'));
const FieldExceptionsPage = lazy(() => import('./pages/installation/field-exceptions'));
const InstallationAlertsPage = lazy(() => import('./pages/installation/installation-alerts'));
const InstallationCostTrackingPage = lazy(() => import('./pages/installation/installation-cost-tracking'));
const InstallationDocumentsPage = lazy(() => import('./pages/installation/installation-documents'));
const InstallationManagementPage = lazy(() => import('./pages/installation/installation-management'));
const InstallationOrdersPage = lazy(() => import('./pages/installation/installation-orders'));
const InstallationProfitabilityPage = lazy(() => import('./pages/installation/installation-profitability'));
const InstallationProgressPage = lazy(() => import('./pages/installation/installation-progress'));
const InstallationQualityControlPage = lazy(() => import('./pages/installation/installation-quality-control'));
const InstallationSettingsPage = lazy(() => import('./pages/installation/installation-settings'));
const InstallerProfilesPage = lazy(() => import('./pages/installation/installer-profiles'));
const LoadingDispatchPage = lazy(() => import('./pages/installation/loading-dispatch'));
const ReturnServiceCallsPage = lazy(() => import('./pages/installation/return-service-calls'));
const GpsMapPage = lazy(() => import('./pages/installations/gps-map'));
const IntegrationHubPage = lazy(() => import('./pages/settings/sections/integration-hub'));
const FaqManagementPage = lazy(() => import('./pages/knowledge/faq-management'));
const KnowledgeBasePage = lazy(() => import('./pages/knowledge/knowledge-base'));
const KnowledgeCommandCenterPage = lazy(() => import('./pages/knowledge/knowledge-command-center'));
const LessonsLearnedPage = lazy(() => import('./pages/knowledge/lessons-learned'));
const SopProceduresPage = lazy(() => import('./pages/knowledge/sop-procedures'));
const BarcodeRfidPage = lazy(() => import('./pages/logistics/barcode-rfid'));
const CrossBorderPage = lazy(() => import('./pages/logistics/cross-border'));
const CustomerTrackingPortalPage = lazy(() => import('./pages/logistics/customer-tracking-portal'));
const DeliveryCostAnalysisPage = lazy(() => import('./pages/logistics/delivery-cost-analysis'));
const DeliverySchedulingPage = lazy(() => import('./pages/logistics/delivery-scheduling'));
const FleetAlertsPage = lazy(() => import('./pages/logistics/fleet-alerts'));
const FleetDeliveryPage = lazy(() => import('./pages/logistics/fleet-delivery'));
const FreightPage = lazy(() => import('./pages/logistics/freight'));
const FreightAuditPage = lazy(() => import('./pages/logistics/freight-audit'));
const FuelManagementPage = lazy(() => import('./pages/logistics/fuel-management'));
const LoadingDockPage = lazy(() => import('./pages/logistics/loading-dock'));
const LogisticsDashboardPage = lazy(() => import('./pages/logistics/logistics-dashboard'));
const PackagingPage = lazy(() => import('./pages/logistics/packaging'));
const ProofOfDeliveryPage = lazy(() => import('./pages/logistics/proof-of-delivery'));
const ReverseLogisticsPage = lazy(() => import('./pages/logistics/reverse-logistics'));
const VehicleRegistryPage = lazy(() => import('./pages/logistics/vehicle-registry'));
const DeliveryDashboardPage = lazy(() => import('./pages/notification-settings/delivery-dashboard'));
const EmailTemplatesPage3 = lazy(() => import('./pages/notification-settings/email-templates'));
const CostPerUnitPage = lazy(() => import('./pages/operations/cost-per-unit'));
const ActionsStudioPage = lazy(() => import('./pages/palantir/actions-studio'));
const AipAgentStudioPage = lazy(() => import('./pages/palantir/aip-agent-studio'));
const CodeWorkspacePage = lazy(() => import('./pages/palantir/code-workspace'));
const DossierPagePage = lazy(() => import('./pages/palantir/dossier-page'));
const MapGeospatialPage = lazy(() => import('./pages/palantir/map-geospatial'));
const PipelineBuilderPage = lazy(() => import('./pages/palantir/pipeline-builder'));
const TimelineAnalysisPage = lazy(() => import('./pages/palantir/timeline-analysis'));
const NotificationsCenterPage = lazy(() => import('./pages/platform/notifications-center'));
const SecurityAuditPage = lazy(() => import('./pages/platform/security-audit'));
const CustomerPortalLoginPage = lazy(() => import('./pages/portal/customer-portal-login'));
const ActualVsEstimatedPage = lazy(() => import('./pages/pricing/actual-vs-estimated'));
const LaborOperationsCostPage = lazy(() => import('./pages/pricing/labor-operations-cost'));
const LandedCostSourcePage = lazy(() => import('./pages/pricing/landed-cost-source'));
const MaterialPricePullPage = lazy(() => import('./pages/pricing/material-price-pull'));
const PricingApprovalsPage = lazy(() => import('./pages/pricing/pricing-approvals'));
const PricingCostBuilderPage = lazy(() => import('./pages/pricing/pricing-cost-builder'));
const PricingCostCalculatorPage = lazy(() => import('./pages/pricing/pricing-cost-calculator'));
const PricingDashboardPage = lazy(() => import('./pages/pricing/pricing-dashboard'));
const PricingPriceListsPage = lazy(() => import('./pages/pricing/pricing-price-lists'));
const PricingRequestsListPage = lazy(() => import('./pages/pricing/pricing-requests-list'));
const PricingVersionsPage = lazy(() => import('./pages/pricing/pricing-versions'));
const ProjectPricingDetailsPage = lazy(() => import('./pages/pricing/project-pricing-details'));
const RecommendedPricePage = lazy(() => import('./pages/pricing/recommended-price'));
const RiskMarginTargetPage = lazy(() => import('./pages/pricing/risk-margin-target'));
const StockVsBuyDecisionPage = lazy(() => import('./pages/pricing/stock-vs-buy-decision'));
const SupplierComparisonProjectPage = lazy(() => import('./pages/pricing/supplier-comparison-project'));
const ProductCertificationsPage = lazy(() => import('./pages/product-dev/product-certifications'));
const ProductDesignPage = lazy(() => import('./pages/production/product-design'));
const ProductDevCommandCenterPage = lazy(() => import('./pages/product-dev/product-dev-command-center'));
const ProductLaunchesPage = lazy(() => import('./pages/product-dev/product-launches'));
const AssemblyJobsPage = lazy(() => import('./pages/production/assembly-jobs'));
const CutJobsPage = lazy(() => import('./pages/production/cut-jobs'));
const FinishingJobsPage = lazy(() => import('./pages/production/finishing-jobs'));
const LaborControlPage = lazy(() => import('./pages/production/labor-control'));
const LaborTimeTrackingPage = lazy(() => import('./pages/production/labor-time-tracking'));
const MaintenanceDowntimePage = lazy(() => import('./pages/production/maintenance-downtime'));
const MasterProductionSchedulePage = lazy(() => import('./pages/production/master-production-schedule'));
const MaterialIssuancePage = lazy(() => import('./pages/production/material-issuance'));
const ProductionAlertsPage = lazy(() => import('./pages/production/production-alerts'));
const ProductionAnalyticsPage = lazy(() => import('./pages/production/production-analytics'));
const ProductionCostTrackingPage = lazy(() => import('./pages/production/production-cost-tracking'));
const ProductionExceptionsPage = lazy(() => import('./pages/production/production-exceptions'));
const ProductionOrdersPage = lazy(() => import('./pages/production/production-orders'));
const QualityDefectsReworkPage = lazy(() => import('./pages/production/quality-defects-rework'));
const ShortagesPagePage = lazy(() => import('./pages/production/shortages-page'));
const WeldingJobsPage = lazy(() => import('./pages/production/welding-jobs'));
const WorkStationsPage = lazy(() => import('./pages/production/work-stations'));
const CalibrationPage = lazy(() => import('./pages/quality/calibration'));
const DocumentControlPage2 = lazy(() => import('./pages/quality/document-control'));
const TestCertificatesPage = lazy(() => import('./pages/quality/test-certificates'));
const SafetyProceduresPage = lazy(() => import('./pages/safety/safety-procedures'));
const SafetyTrainingPage = lazy(() => import('./pages/safety/safety-training'));
const ServiceAnalyticsPage = lazy(() => import('./pages/service/service-analytics'));
const ServiceCasesPage = lazy(() => import('./pages/service/service-cases'));
const ServiceCostTrackingPage = lazy(() => import('./pages/service/service-cost-tracking'));
const ApiConnectionHubPage = lazy(() => import('./pages/settings/api-connection-hub'));
// DEDUPED [ApiKeysPage] path differs; kept lazyPage @L749 — original: const ApiKeysPage = lazy(() => import('./pages/settings/api-keys'));
const IsraeliIntegrationsPage2 = lazy(() => import('./pages/settings/israeli-integrations'));
const MfaSettingsPage = lazy(() => import('./pages/settings/sections/mfa-settings'));
const SessionManagementPage = lazy(() => import('./pages/settings/sections/session-management'));
const SsoSettingsPage = lazy(() => import('./pages/settings/sections/sso-settings'));
const SupplierDevelopmentPage = lazy(() => import('./pages/supplier-mgmt/supplier-development'));
const SupplierPortalDashboardPage = lazy(() => import('./pages/supplier-mgmt/supplier-portal-dashboard'));
const SupplierScorecardsPage = lazy(() => import('./pages/supplier-mgmt/supplier-scorecards'));
const Supplier360Page = lazy(() => import('./pages/supplier-mgmt/Supplier360'));
const SupplyChainRiskPage = lazy(() => import('./pages/supplier-mgmt/supply-chain-risk'));
const VendorCompliancePage = lazy(() => import('./pages/supplier-mgmt/vendor-compliance'));
const BomComparisonPage = lazy(() => import('./pages/supply-chain/bom-comparison'));
const BomCostRollupPage = lazy(() => import('./pages/supply-chain/bom-cost-rollup'));
const BomTemplatesPage = lazy(() => import('./pages/supply-chain/bom-templates'));
const BomVersionsPage = lazy(() => import('./pages/supply-chain/bom-versions'));
const EdiAdminPage = lazy(() => import('./pages/supply-chain/edi-admin'));
const SupplyChainAlertsPage = lazy(() => import('./pages/supply-chain/supply-chain-alerts'));
const SupplyChainAnalyticsPage = lazy(() => import('./pages/supply-chain/supply-chain-analytics'));
const SupplyChainCommandCenterPage = lazy(() => import('./pages/supply-chain/supply-chain-command-center'));
const SupplyChainSettingsPage = lazy(() => import('./pages/supply-chain/supply-chain-settings'));
const SupplyChainVisibilityPage = lazy(() => import('./pages/supply-chain/supply-chain-visibility'));
const SupportDashboardPage = lazy(() => import('./pages/support/support-dashboard'));
const RoleCardPage = lazy(() => import('./pages/system/role-card'));
const UserCardPage = lazy(() => import('./pages/system/user-card'));
const UserPermissionOverridePage = lazy(() => import('./pages/system/user-permission-override'));
const UserRoleAssignmentPage = lazy(() => import('./pages/system/user-role-assignment'));
const TenderAlertsPage = lazy(() => import('./pages/tenders/tender-alerts'));
const TenderAnalyticsPage = lazy(() => import('./pages/tenders/tender-analytics'));
const TenderCompetitorsPage = lazy(() => import('./pages/tenders/tender-competitors'));
const TenderTimelinePage = lazy(() => import('./pages/tenders/tender-timeline'));
const AiAgentsDashboardPage = lazy(() => import('./pages/ai-engine/ai-agents-dashboard'));

// Catch-all dynamic menu page — handles /registry/*, /marketplace/*, /db/*,
// /rpc/*, /view/*, /component/*, /hook/*, /api-doc/*, /addons/*,
// /integrations/*, /platform-module/*, /combo/*, /template/* routes that
// are seeded into public.app_menu but lack a dedicated React page.
const GenericMenuPage = lazy(() => import('./pages/GenericMenuPage'));

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
const MarketplaceModuleDetail = lazyPage(() => import("@/pages/marketplace-module-detail"));
const MarketplaceCategory = lazyPage(() => import("@/pages/marketplace-category"));
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

// === COMMERCIAL DOMAIN (Mega Batch 00043/00044) ===
const CommercialLeadSourcesPage = lazy(() => import('./pages/commercial/lead-sources'));
const CommercialCustomerSegmentsPage = lazy(() => import('./pages/commercial/customer-segments'));
const CommercialSalesOrdersPage = lazy(() => import('./pages/commercial/sales-orders'));
const CommercialPricingRulesPage = lazy(() => import('./pages/commercial/pricing-rules'));

// === FINANCE DOMAIN (Tier 1 — 00051/00052) ===
const FinanceInvoice360 = lazy(() => import('./pages/finance/Invoice360'));
const FinancePayment360 = lazy(() => import('./pages/finance/Payment360'));

// === GOVERNANCE DOMAIN (00059/00060) — admin-only surfaces ===
const GovUsersPage = lazy(() => import('./pages/governance/UsersPage'));
const GovRolesPage = lazy(() => import('./pages/governance/RolesPage'));
const GovPermissionsPage = lazy(() => import('./pages/governance/PermissionsPage'));
const GovAuditLogsPage = lazy(() => import('./pages/governance/AuditLogsPage'));
const GovStateHistoryPage = lazy(() => import('./pages/governance/StateHistoryPage'));
const GovDomainEventsPage = lazy(() => import('./pages/governance/DomainEventsPage'));
const GovWebhooksPage = lazy(() => import('./pages/governance/WebhooksPage'));
const GovWebhookDeliveriesPage = lazy(() => import('./pages/governance/WebhookDeliveriesPage'));
const GovIntegrationsPage = lazy(() => import('./pages/governance/IntegrationsPage'));
const GovIntegrationSyncLogsPage = lazy(() => import('./pages/governance/IntegrationSyncLogsPage'));
const GovFeatureFlagsPage = lazy(() => import('./pages/governance/FeatureFlagsPage'));
const GovHealthChecksPage = lazy(() => import('./pages/governance/HealthChecksPage'));
const GovValidationsLogPage = lazy(() => import('./pages/governance/ValidationsLogPage'));
const GovConfigEntriesPage = lazy(() => import('./pages/governance/ConfigEntriesPage'));
const GovQueueJobsPage = lazy(() => import('./pages/governance/QueueJobsPage'));
const GovSLATimersPage = lazy(() => import('./pages/governance/SLATimersPage'));
const GovEscalationRulesPage = lazy(() => import('./pages/governance/EscalationRulesPage'));
const GovSecurityEventsPage = lazy(() => import('./pages/governance/SecurityEventsPage'));

// === ORCHESTRATION DOMAIN (00063/00064) — 7 pages ===
const OrchWorkflowDefinitionsPage = lazy(() => import('./pages/orchestration/WorkflowDefinitionsPage'));
const OrchWorkflowRunsPage = lazy(() => import('./pages/orchestration/WorkflowRunsPage'));
const OrchWorkflowRunDetailPage = lazy(() => import('./pages/orchestration/WorkflowRunDetailPage'));
const OrchJobQueuePage = lazy(() => import('./pages/orchestration/JobQueuePage'));
const OrchUniversalInboxPage = lazy(() => import('./pages/orchestration/UniversalInboxPage'));
const OrchNotificationsPage = lazy(() => import('./pages/orchestration/NotificationsPage'));
const OrchWorkflowTriggersPage = lazy(() => import('./pages/orchestration/WorkflowTriggersPage'));

// === COMMS DOMAIN (00065/00066) — 10 pages ===
const CommsInboxPage = lazy(() => import('./pages/comms/CommunicationsInboxPage'));
const CommsEmailMessagesPage = lazy(() => import('./pages/comms/EmailMessagesPage'));
const CommsSMSMessagesPage = lazy(() => import('./pages/comms/SMSMessagesPage'));
const CommsWhatsAppMessagesPage = lazy(() => import('./pages/comms/WhatsAppMessagesPage'));
const CommsNotificationsPage = lazy(() => import('./pages/comms/NotificationsPage'));
const CommsSupportTicketsPage = lazy(() => import('./pages/comms/SupportTicketsPage'));
const CommsPortalUsersPage = lazy(() => import('./pages/comms/PortalUsersPage'));
const CommsChatbotSessionsPage = lazy(() => import('./pages/comms/ChatbotSessionsPage'));
const CommsHelpArticlesPage = lazy(() => import('./pages/comms/HelpArticlesPage'));
const CommsMessageTemplatesPage = lazy(() => import('./pages/comms/MessageTemplatesPage'));
const CommsBroadcastCampaignsPage = lazy(() => import('./pages/comms/BroadcastCampaignsPage'));

// === PROCUREMENT DOMAIN (Mega Batch 00047/00048) — 14 v2 pages ===
const ProcurementSuppliersListPageV2 = lazy(() => import('./pages/procurement/v2/SuppliersListPage'));
const ProcurementSupplier360V2 = lazy(() => import('./pages/procurement/v2/Supplier360'));
const ProcurementRFQsListPageV2 = lazy(() => import('./pages/procurement/v2/RFQsListPage'));
const ProcurementRFQ360V2 = lazy(() => import('./pages/procurement/v2/RFQ360'));
const ProcurementRFQItemsEditorV2 = lazy(() => import('./pages/procurement/v2/RFQItemsEditor'));
const ProcurementPurchaseOrdersListPageV2 = lazy(() => import('./pages/procurement/v2/PurchaseOrdersListPage'));
const ProcurementPurchaseOrder360V2 = lazy(() => import('./pages/procurement/v2/PurchaseOrder360'));
const ProcurementPurchaseOrderLinesPageV2 = lazy(() => import('./pages/procurement/v2/PurchaseOrderLinesPage'));
const ProcurementGoodsReceiptsPageV2 = lazy(() => import('./pages/procurement/v2/GoodsReceiptsPage'));
const ProcurementThreeWayMatchQueueV2 = lazy(() => import('./pages/procurement/v2/ThreeWayMatchQueue'));
const ProcurementSupplierInvoicesPageV2 = lazy(() => import('./pages/procurement/v2/SupplierInvoicesPage'));
const ProcurementSupplierEvaluationsPageV2 = lazy(() => import('./pages/procurement/v2/SupplierEvaluationsPage'));
const ProcurementApprovalsQueueV2 = lazy(() => import('./pages/procurement/v2/ProcurementApprovalsQueue'));
const ProcurementContract360V2 = lazy(() => import('./pages/procurement/v2/Contract360'));
const ProcurementSubcontractorsPageV2 = lazy(() => import('./pages/procurement/v2/SubcontractorsPage'));

// === INVENTORY DOMAIN (Mega Batch 00049/00050) — 14 v2 pages ===
const InventoryMaterialsListPageV2 = lazy(() => import('./pages/inventory/v2/MaterialsListPage'));
const InventoryMaterial360V2 = lazy(() => import('./pages/inventory/v2/Material360'));
const InventoryJournalPageV2 = lazy(() => import('./pages/inventory/v2/InventoryJournalPage'));
const InventoryReceiptsPageV2 = lazy(() => import('./pages/inventory/v2/InventoryReceiptsPage'));
const InventoryIssuesPageV2 = lazy(() => import('./pages/inventory/v2/InventoryIssuesPage'));
const InventoryTransfersPageV2 = lazy(() => import('./pages/inventory/v2/InventoryTransfersPage'));
const InventoryReservationsPageV2 = lazy(() => import('./pages/inventory/v2/InventoryReservationsPage'));
const InventoryMaterialLotsPageV2 = lazy(() => import('./pages/inventory/v2/MaterialLotsPage'));
const InventoryWarehousesPageV2 = lazy(() => import('./pages/inventory/v2/WarehousesPage'));
const InventoryManufacturingBatchesPageV2 = lazy(() => import('./pages/inventory/v2/ManufacturingBatchesPage'));
const InventoryReorderRulesPageV2 = lazy(() => import('./pages/inventory/v2/ReorderRulesPage'));
const InventoryShortageSnapshotsPageV2 = lazy(() => import('./pages/inventory/v2/ShortageSnapshotsPage'));
const InventoryStockCountsPageV2 = lazy(() => import('./pages/inventory/v2/StockCountsPage'));
const InventoryMaterialRequestsPageV2 = lazy(() => import('./pages/inventory/v2/MaterialRequestsPage'));

// === DOCS DOMAIN (Mega Batch 00055/00056) — 10 v2 pages ===
const DocsDocumentsListPageV2 = lazy(() => import('./pages/docs/v2/DocumentsListPage'));
const DocsDocument360V2 = lazy(() => import('./pages/docs/v2/Document360'));
const DocsDocumentVersionsPageV2 = lazy(() => import('./pages/docs/v2/DocumentVersionsPage'));
const DocsAttachmentsPageV2 = lazy(() => import('./pages/docs/v2/AttachmentsPage'));
const DocsOCRCenterPageV2 = lazy(() => import('./pages/docs/v2/OCRCenterPage'));
const DocsOCRRunsPageV2 = lazy(() => import('./pages/docs/v2/OCRRunsPage'));
const DocsExtractionRunsPageV2 = lazy(() => import('./pages/docs/v2/ExtractionRunsPage'));
const DocsClassificationRunsPageV2 = lazy(() => import('./pages/docs/v2/ClassificationRunsPage'));
const DocsSignatureRequestsPageV2 = lazy(() => import('./pages/docs/v2/SignatureRequestsPage'));
const DocsKnowledgeCardsPageV2 = lazy(() => import('./pages/docs/v2/KnowledgeCardsPage'));

// === ANALYTICS DOMAIN (00061/00062) — 8 pages ===
const AnalyticsDashboardsListPage = lazy(() => import('./pages/analytics/DashboardsListPage'));
const AnalyticsDashboardBuilderPage = lazy(() => import('./pages/analytics/DashboardBuilderPage'));
const AnalyticsReportsListPage = lazy(() => import('./pages/analytics/ReportsListPage'));
const AnalyticsReportDetailPage = lazy(() => import('./pages/analytics/ReportDetailPage'));
const AnalyticsKPIDefinitionsPage = lazy(() => import('./pages/analytics/KPIDefinitionsPage'));
const AnalyticsKPISnapshotsPage = lazy(() => import('./pages/analytics/KPISnapshotsPage'));
const AnalyticsDrilldownPathsPage = lazy(() => import('./pages/analytics/DrilldownPathsPage'));
const AnalyticsReadModelInvalidationsPage = lazy(() => import('./pages/analytics/ReadModelInvalidationsPage'));

// === INTELLIGENCE DOMAIN (Mega Batch 00057/00058) — 9 pages ===
const IntelligenceAIInsightsPage = lazy(() => import('./pages/intelligence/AIInsightsPage'));
const IntelligenceAnomalyCasesPage = lazy(() => import('./pages/intelligence/AnomalyCasesPage'));
const IntelligenceRecommendationCenterPage = lazy(() => import('./pages/intelligence/RecommendationCenterPage'));
const IntelligenceForecastModelsPage = lazy(() => import('./pages/intelligence/ForecastModelsPage'));
const IntelligenceAgentRegistryPage = lazy(() => import('./pages/intelligence/AgentRegistryPage'));
const IntelligenceAgentJobsPage = lazy(() => import('./pages/intelligence/AgentJobsPage'));
const IntelligenceOrchestrationFlowsPage = lazy(() => import('./pages/intelligence/OrchestrationFlowsPage'));
const IntelligencePromptTemplatesPage = lazy(() => import('./pages/intelligence/PromptTemplatesPage'));
const IntelligenceProcessMiningPage = lazy(() => import('./pages/intelligence/ProcessMiningPage'));

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
          {/* ───── Execution domain routes (mega batch 2026-04-18) ───── */}
          <Route path="/projects/list" component={ExecProjectsListPage} />
          <Route path="/projects/risks" component={ExecProjectRisksPage} />
          <Route path="/projects/blockers" component={ExecProjectBlockersPage} />
          <Route path="/projects/cost-plans" component={ExecProjectCostPlansPage} />
          <Route path="/projects/:id/risks" component={ExecProjectRisksPage} />
          <Route path="/projects/:id/blockers" component={ExecProjectBlockersPage} />
          <Route path="/projects/:id/cost-plans" component={ExecProjectCostPlansPage} />
          <Route path="/projects/:id" component={ExecProject360} />
          <Route path="/tasks" component={ExecTasksListPage} />
          <Route path="/tasks/:id" component={ExecTask360} />
          <Route path="/work-orders/list" component={ExecWorkOrdersListPage} />
          <Route path="/work-orders/:id/tasks" component={ExecWorkOrderTasksPage} />
          <Route path="/work-orders/:id" component={ExecWorkOrder360} />
          <Route path="/work-order-tasks" component={ExecWorkOrderTasksPage} />
          <Route path="/delivery-events" component={ExecDeliveryEventsPage} />
          <Route path="/installation-events" component={ExecInstallationEventsPage} />
          <Route path="/material-planning" component={ExecMaterialPlanningPage} />
          <Route path="/contracts/:id" component={ExecContract360} />
          <Route path="/alerts/:id" component={ExecAlert360} />
          <Route path="/production-orders" component={ExecProductionOrdersPage} />
          <Route path="/work-centers" component={ExecWorkCentersPage} />
          <Route path="/labor-logs" component={ExecLaborLogsPage} />
          <Route path="/installation-teams" component={ExecInstallationTeamsPage} />
          <Route path="/site-visits" component={ExecSiteVisitsPage} />
          <Route path="/punch-lists" component={ExecPunchListsPage} />
          <Route path="/drawings" component={ExecDrawingsPage} />
          <Route path="/bom-headers" component={ExecBomHeadersPage} />
          <Route path="/revision-control" component={ExecRevisionControlPage} />
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

          {/* Commercial Mega Batch (00043/00044) */}
          <Route path="/commercial/lead-sources" component={CommercialLeadSourcesPage} />
          <Route path="/commercial/customer-segments" component={CommercialCustomerSegmentsPage} />
          <Route path="/commercial/sales-orders" component={CommercialSalesOrdersPage} />
          <Route path="/commercial/pricing-rules" component={CommercialPricingRulesPage} />

          {/* Procurement Mega Batch (00047/00048) — 14 v2 pages */}
          <Route path="/suppliers" component={ProcurementSuppliersListPageV2} />
          <Route path="/suppliers/:id" component={ProcurementSupplier360V2} />
          <Route path="/rfqs" component={ProcurementRFQsListPageV2} />
          <Route path="/rfqs/:id" component={ProcurementRFQ360V2} />
          <Route path="/rfqs/:id/items" component={ProcurementRFQItemsEditorV2} />
          <Route path="/purchase-orders" component={ProcurementPurchaseOrdersListPageV2} />
          <Route path="/purchase-orders/:id" component={ProcurementPurchaseOrder360V2} />
          <Route path="/purchase-orders/:id/lines" component={ProcurementPurchaseOrderLinesPageV2} />
          <Route path="/goods-receipts" component={ProcurementGoodsReceiptsPageV2} />
          <Route path="/three-way-match" component={ProcurementThreeWayMatchQueueV2} />
          <Route path="/supplier-invoices" component={ProcurementSupplierInvoicesPageV2} />
          <Route path="/supplier-evaluations" component={ProcurementSupplierEvaluationsPageV2} />
          <Route path="/procurement-approvals" component={ProcurementApprovalsQueueV2} />
          <Route path="/contracts/:id" component={ProcurementContract360V2} />
          <Route path="/subcontractors" component={ProcurementSubcontractorsPageV2} />

          {/* Inventory Mega Batch (00049/00050) — 14 v2 pages */}
          <Route path="/materials" component={InventoryMaterialsListPageV2} />
          <Route path="/materials/:id" component={InventoryMaterial360V2} />
          <Route path="/material-requests" component={InventoryMaterialRequestsPageV2} />
          <Route path="/inventory/journal" component={InventoryJournalPageV2} />
          <Route path="/inventory/receipts" component={InventoryReceiptsPageV2} />
          <Route path="/inventory/issues" component={InventoryIssuesPageV2} />
          <Route path="/inventory/transfers" component={InventoryTransfersPageV2} />
          <Route path="/inventory/reservations" component={InventoryReservationsPageV2} />
          <Route path="/inventory/lots" component={InventoryMaterialLotsPageV2} />
          <Route path="/warehouses" component={InventoryWarehousesPageV2} />
          <Route path="/manufacturing-batches" component={InventoryManufacturingBatchesPageV2} />
          <Route path="/reorder-rules" component={InventoryReorderRulesPageV2} />
          <Route path="/shortage-snapshots" component={InventoryShortageSnapshotsPageV2} />
          <Route path="/stock-counts" component={InventoryStockCountsPageV2} />

          {/* Docs Mega Batch (00055/00056) — 10 v2 pages */}
          <Route path="/documents" component={DocsDocumentsListPageV2} />
          <Route path="/documents/:id/versions" component={DocsDocumentVersionsPageV2} />
          <Route path="/documents/:id" component={DocsDocument360V2} />
          <Route path="/attachments" component={DocsAttachmentsPageV2} />
          <Route path="/ocr-center" component={DocsOCRCenterPageV2} />
          <Route path="/ocr-runs" component={DocsOCRRunsPageV2} />
          <Route path="/extraction-runs" component={DocsExtractionRunsPageV2} />
          <Route path="/classification-runs" component={DocsClassificationRunsPageV2} />
          <Route path="/signature-requests" component={DocsSignatureRequestsPageV2} />
          <Route path="/knowledge-cards" component={DocsKnowledgeCardsPageV2} />

          {/* Finance Tier 1 (00051/00052) — Invoice360 + Payment360 */}
          <Route path="/invoices/:id" component={FinanceInvoice360} />
          <Route path="/payments/:id" component={FinancePayment360} />

          {/* Governance Tier (00059/00060) — admin-only surfaces */}
          <Route path="/users" component={GovUsersPage} />
          <Route path="/roles" component={GovRolesPage} />
          <Route path="/permissions" component={GovPermissionsPage} />
          <Route path="/audit-logs" component={GovAuditLogsPage} />
          <Route path="/state-history" component={GovStateHistoryPage} />
          <Route path="/domain-events" component={GovDomainEventsPage} />
          <Route path="/webhooks" component={GovWebhooksPage} />
          <Route path="/webhook-deliveries" component={GovWebhookDeliveriesPage} />
          <Route path="/integrations" component={GovIntegrationsPage} />
          <Route path="/integration-sync-logs" component={GovIntegrationSyncLogsPage} />
          <Route path="/feature-flags" component={GovFeatureFlagsPage} />
          <Route path="/health-checks" component={GovHealthChecksPage} />
          <Route path="/validations-log" component={GovValidationsLogPage} />
          <Route path="/config" component={GovConfigEntriesPage} />
          <Route path="/queue-jobs" component={GovQueueJobsPage} />
          <Route path="/sla-timers" component={GovSLATimersPage} />
          <Route path="/escalation-rules" component={GovEscalationRulesPage} />
          <Route path="/security-events" component={GovSecurityEventsPage} />

          {/* Orchestration Tier (00063/00064) — 7 pages */}
          <Route path="/workflows" component={OrchWorkflowDefinitionsPage} />
          <Route path="/workflows/:id" component={OrchWorkflowDefinitionsPage} />
          <Route path="/workflow-runs" component={OrchWorkflowRunsPage} />
          <Route path="/workflow-runs/:id" component={OrchWorkflowRunDetailPage} />
          <Route path="/workflow-triggers" component={OrchWorkflowTriggersPage} />
          <Route path="/job-queue" component={OrchJobQueuePage} />
          <Route path="/universal-inbox" component={OrchUniversalInboxPage} />
          <Route path="/inbox/:id" component={OrchUniversalInboxPage} />
          <Route path="/notifications" component={OrchNotificationsPage} />

          {/* Analytics Domain (00061/00062) — 8 pages */}
          <Route path="/dashboards" component={AnalyticsDashboardsListPage} />
          <Route path="/dashboards/:id" component={AnalyticsDashboardBuilderPage} />
          <Route path="/reports" component={AnalyticsReportsListPage} />
          <Route path="/reports/:id" component={AnalyticsReportDetailPage} />
          <Route path="/kpi-definitions" component={AnalyticsKPIDefinitionsPage} />
          <Route path="/kpi-snapshots" component={AnalyticsKPISnapshotsPage} />
          <Route path="/drilldown-paths" component={AnalyticsDrilldownPathsPage} />
          <Route path="/read-model-invalidations" component={AnalyticsReadModelInvalidationsPage} />

          {/* Comms Tier (00065/00066) — 10 pages */}
          <Route path="/communications" component={CommsInboxPage} />
          <Route path="/email-messages" component={CommsEmailMessagesPage} />
          <Route path="/sms-messages" component={CommsSMSMessagesPage} />
          <Route path="/whatsapp-messages" component={CommsWhatsAppMessagesPage} />
          <Route path="/notifications" component={CommsNotificationsPage} />
          <Route path="/support-tickets" component={CommsSupportTicketsPage} />
          <Route path="/portal-users" component={CommsPortalUsersPage} />
          <Route path="/chatbot-sessions" component={CommsChatbotSessionsPage} />
          <Route path="/help-articles" component={CommsHelpArticlesPage} />
          <Route path="/message-templates" component={CommsMessageTemplatesPage} />
          <Route path="/broadcast-campaigns" component={CommsBroadcastCampaignsPage} />

          {/* Intelligence Mega Batch (00057/00058) — 9 pages */}
          <Route path="/ai-insights" component={IntelligenceAIInsightsPage} />
          <Route path="/anomalies" component={IntelligenceAnomalyCasesPage} />
          <Route path="/recommendations" component={IntelligenceRecommendationCenterPage} />
          <Route path="/forecast-models" component={IntelligenceForecastModelsPage} />
          <Route path="/agents" component={IntelligenceAgentRegistryPage} />
          <Route path="/agent-jobs" component={IntelligenceAgentJobsPage} />
          <Route path="/orchestration-flows" component={IntelligenceOrchestrationFlowsPage} />
          <Route path="/prompt-templates" component={IntelligencePromptTemplatesPage} />
          <Route path="/process-mining" component={IntelligenceProcessMiningPage} />

          {/* Marketplace — 2,371 module routes seeded in app_menu */}
          <Route path="/marketplace/module/:id" component={MarketplaceModuleDetail} />
          <Route path="/marketplace/:category" component={MarketplaceCategory} />

          {/* Catch-all dynamic menu routes — backed by GenericMenuPage which
              reads /api/app-menu, /api/db-entity/* and /api/rpc-meta/* and
              renders a header + breadcrumb + stub body. Wouter v3 uses
              :rest* to capture any tail segments (including nested /a/b/c). */}
          <Route path="/registry/:rest*" component={GenericMenuPage} />
          <Route path="/marketplace/:rest*" component={GenericMenuPage} />
          <Route path="/db/:rest*" component={GenericMenuPage} />
          <Route path="/rpc/:rest*" component={GenericMenuPage} />
          <Route path="/view/:rest*" component={GenericMenuPage} />
          <Route path="/component/:rest*" component={GenericMenuPage} />
          <Route path="/hook/:rest*" component={GenericMenuPage} />
          <Route path="/api-doc/:rest*" component={GenericMenuPage} />
          <Route path="/addons/:rest*" component={GenericMenuPage} />
          <Route path="/integrations/:rest*" component={GenericMenuPage} />
          <Route path="/platform-module/:rest*" component={GenericMenuPage} />
          <Route path="/combo/:rest*" component={GenericMenuPage} />
          <Route path="/template/:rest*" component={GenericMenuPage} />

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
        {/* === AUTO-WIRED ROUTES === */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/customer-360" element={<Customer360Page />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/customer-portal" element={<CustomerPortalPage />} />
        <Route path="/crm-pipeline" element={<CrmPipelinePage />} />
        <Route path="/supplier-portal" element={<SupplierPortalPage />} />
        <Route path="/subcontractors" element={<SubcontractorsPage />} />
        <Route path="/procurement-analytics" element={<ProcurementAnalyticsPage />} />
        <Route path="/project-360" element={<Project360Page />} />
        <Route path="/quality-control" element={<QualityControlPage />} />
        <Route path="/warehouses" element={<WarehousesPage />} />
        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/stock-counts" element={<StockCountsPage />} />
        <Route path="/inventory-alerts" element={<InventoryAlertsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/bank-reconciliation" element={<BankReconciliationPage />} />
        <Route path="/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/vat-report" element={<VatReportPage />} />
        <Route path="/benefits" element={<BenefitsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/feature-flags" element={<FeatureFlagsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        <Route path="/sales/lead-scoring" element={<LeadScoringPage />} />
        <Route path="/sales/sales-forecast" element={<SalesForecastPage />} />
        <Route path="/customer/onboarding" element={<OnboardingPage />} />
        <Route path="/manufacturing/bom-manager" element={<BomManagerPage />} />
        <Route path="/manufacturing/capacity-planning" element={<CapacityPlanningPage />} />
        <Route path="/manufacturing/scrap-tracker" element={<ScrapTrackerPage />} />
        <Route path="/returns/rma" element={<RmaPage />} />
        <Route path="/bank/reconciliation" element={<ReconciliationPage />} />
        <Route path="/cash/petty-cash" element={<PettyCashPage />} />
        <Route path="/gl/financial-statements" element={<FinancialStatementsPage />} />
        <Route path="/hr/analytics" element={<AnalyticsPage />} />
        <Route path="/comms/email-templates" element={<EmailTemplatesPage />} />
        <Route path="/emails/email-templates" element={<EmailTemplatesPage2 />} />
        <Route path="/notifications/notification-preferences" element={<NotificationPreferencesPage />} />
        <Route path="/documents/expiry-alerts" element={<ExpiryAlertsPage />} />
        <Route path="/reporting/balance-sheet" element={<BalanceSheetPage2 />} />
        <Route path="/flags/feature-flags" element={<FeatureFlagsPage2 />} />
        <Route path="/middleware/rate-limits" element={<RateLimitsPage />} />
        <Route path="/wiring/event-bus" element={<EventBusPage />} />
        <Route path="/workflow/engine" element={<EnginePage />} />
        <Route path="/sales/opportunities" element={<OpportunitiesPage />} />
        <Route path="/sales/sales-dashboard" element={<SalesDashboardPage />} />
        <Route path="/sales/sales-analytics" element={<SalesAnalyticsPage />} />
        <Route path="/sales/sales-commissions" element={<SalesCommissionsPage />} />
        <Route path="/sales/sales-invoicing" element={<SalesInvoicingPage />} />
        <Route path="/sales/sales-orders" element={<SalesOrdersPage />} />
        <Route path="/sales/sales-returns" element={<SalesReturnsPage />} />
        <Route path="/sales/sales-scoring" element={<SalesScoringPage />} />
        <Route path="/sales/sales-territories" element={<SalesTerritoriesPage />} />
        <Route path="/sales/deal-room" element={<DealRoomPage />} />
        <Route path="/crm/customer-360" element={<Customer360Page2 />} />
        <Route path="/crm/crm-dashboard" element={<CrmDashboardPage />} />
        <Route path="/crm/segmentation-dashboard" element={<SegmentationDashboardPage />} />
        <Route path="/crm/territory-management" element={<TerritoryManagementPage />} />
        <Route path="/procurement/blanket-orders" element={<BlanketOrdersPage />} />
        <Route path="/procurement/contracts-management" element={<ContractsManagementPage />} />
        <Route path="/procurement/demand-planning" element={<DemandPlanningPage />} />
        <Route path="/procurement/goods-receiving" element={<GoodsReceivingPage />} />
        <Route path="/procurement/landed-cost" element={<LandedCostPage />} />
        <Route path="/procurement/make-vs-buy" element={<MakeVsBuyPage />} />
        <Route path="/procurement/market-price-tracking" element={<MarketPriceTrackingPage />} />
        <Route path="/procurement/po-approval-workflow" element={<PoApprovalWorkflowPage />} />
        <Route path="/procurement/procurement-analytics" element={<ProcurementAnalyticsPage2 />} />
        <Route path="/procurement/procurement-automation" element={<ProcurementAutomationPage />} />
        <Route path="/procurement/procurement-budgets" element={<ProcurementBudgetsPage />} />
        <Route path="/procurement/procurement-command-center" element={<ProcurementCommandCenterPage />} />
        <Route path="/procurement/purchase-requisitions" element={<PurchaseRequisitionsPage />} />
        <Route path="/procurement/rfq-management" element={<RfqManagementPage />} />
        <Route path="/procurement/subcontractor-management" element={<SubcontractorManagementPage />} />
        <Route path="/procurement/three-way-matching" element={<ThreeWayMatchingPage />} />
        <Route path="/projects/change-orders-page" element={<ChangeOrdersPagePage />} />
        <Route path="/projects/gantt-chart-page" element={<GanttChartPagePage />} />
        <Route path="/projects/portfolio-dashboard-page" element={<PortfolioDashboardPagePage />} />
        <Route path="/projects/project-360" element={<Project360Page2 />} />
        <Route path="/projects/project-ai-insights" element={<ProjectAiInsightsPage />} />
        <Route path="/projects/project-budget-page" element={<ProjectBudgetPagePage />} />
        <Route path="/projects/project-execution" element={<ProjectExecutionPage />} />
        <Route path="/projects/project-finance-hub" element={<ProjectFinanceHubPage />} />
        <Route path="/projects/project-installation-hub" element={<ProjectInstallationHubPage />} />
        <Route path="/projects/project-procurement-hub" element={<ProjectProcurementHubPage />} />
        <Route path="/projects/project-profitability" element={<ProjectProfitabilityPage />} />
        <Route path="/projects/projects-command-center" element={<ProjectsCommandCenterPage />} />
        <Route path="/projects/projects-dashboard" element={<ProjectsDashboardPage />} />
        <Route path="/projects/risk-register" element={<RiskRegisterPage />} />
        <Route path="/production/mes-system" element={<MesSystemPage />} />
        <Route path="/production/mrp-planning" element={<MrpPlanningPage />} />
        <Route path="/production/oee-dashboard" element={<OeeDashboardPage />} />
        <Route path="/production/production-command-center" element={<ProductionCommandCenterPage />} />
        <Route path="/production/production-kanban" element={<ProductionKanbanPage />} />
        <Route path="/production/shop-floor-control" element={<ShopFloorControlPage />} />
        <Route path="/production/smart-factory-dashboard" element={<SmartFactoryDashboardPage />} />
        <Route path="/production/work-orders-list" element={<WorkOrdersListPage />} />
        <Route path="/inventory/cycle-counts" element={<CycleCountsPage />} />
        <Route path="/inventory/damaged-quarantine" element={<DamagedQuarantinePage />} />
        <Route path="/inventory/inventory-command-center" element={<InventoryCommandCenterPage />} />
        <Route path="/inventory/reorder-intelligence" element={<ReorderIntelligencePage />} />
        <Route path="/inventory/reservations-allocations" element={<ReservationsAllocationsPage />} />
        <Route path="/inventory/stock-valuation-aging" element={<StockValuationAgingPage />} />
        <Route path="/inventory/vmi-management" element={<VmiManagementPage />} />
        <Route path="/inventory/wms-barcode" element={<WmsBarcodePage />} />
        <Route path="/inventory/wms-cross-docking" element={<WmsCrossDockingPage />} />
        <Route path="/inventory/wms-cycle-counting" element={<WmsCycleCountingPage />} />
        <Route path="/inventory/wms-lot-traceability" element={<WmsLotTraceabilityPage />} />
        <Route path="/inventory/wms-pick-pack-ship" element={<WmsPickPackShipPage />} />
        <Route path="/inventory/wms-putaway-rules" element={<WmsPutawayRulesPage />} />
        <Route path="/inventory/wms-stock-inquiry" element={<WmsStockInquiryPage />} />
        <Route path="/inventory/wms-transfer-orders" element={<WmsTransferOrdersPage />} />
        <Route path="/finance/accounts-payable" element={<AccountsPayablePage />} />
        <Route path="/finance/accounts-receivable" element={<AccountsReceivablePage />} />
        <Route path="/finance/bank-accounts" element={<BankAccountsPage />} />
        <Route path="/finance/checks-management" element={<ChecksManagementPage />} />
        <Route path="/finance/collections-dashboard" element={<CollectionsDashboardPage />} />
        <Route path="/finance/finance-control-center" element={<FinanceControlCenterPage />} />
        <Route path="/hr/ats-recruitment" element={<AtsRecruitmentPage />} />
        <Route path="/hr/employee-card" element={<EmployeeCardPage />} />
        <Route path="/hr/employee-documents" element={<EmployeeDocumentsPage />} />
        <Route path="/hr/employee-equipment" element={<EmployeeEquipmentPage />} />
        <Route path="/hr/employee-self-service" element={<EmployeeSelfServicePage />} />
        <Route path="/hr/employees-list" element={<EmployeesListPage />} />
        <Route path="/hr/hr-command-center" element={<HrCommandCenterPage />} />
        <Route path="/hr/hr-dashboard" element={<HrDashboardPage />} />
        <Route path="/hr/talent-management" element={<TalentManagementPage />} />
        <Route path="/documents/approval-workflows" element={<ApprovalWorkflowsPage />} />
        <Route path="/documents/dms-command-center" element={<DmsCommandCenterPage />} />
        <Route path="/documents/dms-repository" element={<DmsRepositoryPage />} />
        <Route path="/documents/document-alerts" element={<DocumentAlertsPage />} />
        <Route path="/documents/document-analytics" element={<DocumentAnalyticsPage />} />
        <Route path="/documents/document-audit-trail" element={<DocumentAuditTrailPage />} />
        <Route path="/documents/document-categories" element={<DocumentCategoriesPage />} />
        <Route path="/documents/entity-linked-documents" element={<EntityLinkedDocumentsPage />} />
        <Route path="/documents/templates-library" element={<TemplatesLibraryPage />} />
        <Route path="/ai-engine/ai-admin-settings" element={<AiAdminSettingsPage />} />
        <Route path="/ai-engine/ai-anomaly-detection" element={<AiAnomalyDetectionPage />} />
        <Route path="/ai-engine/ai-audit-log" element={<AiAuditLogPage />} />
        <Route path="/ai-engine/ai-automated-reports" element={<AiAutomatedReportsPage />} />
        <Route path="/ai-engine/ai-customer-service-pro" element={<AiCustomerServiceProPage />} />
        <Route path="/ai-engine/ai-engine-hub" element={<AiEngineHubPage />} />
        <Route path="/ai-engine/ai-executive-insights" element={<AiExecutiveInsightsPage />} />
        <Route path="/ai-engine/ai-follow-up" element={<AiFollowUpPage />} />
        <Route path="/ai-engine/ai-lead-scoring-pro" element={<AiLeadScoringProPage />} />
        <Route path="/ai-engine/ai-procurement-optimizer" element={<AiProcurementOptimizerPage />} />
        <Route path="/ai-engine/ai-production-insights" element={<AiProductionInsightsPage />} />
        <Route path="/ai-engine/ai-quotation-assistant" element={<AiQuotationAssistantPage />} />
        <Route path="/ai-engine/ai-recommendation-engine" element={<AiRecommendationEnginePage />} />
        <Route path="/ai-engine/ai-sales-assistant" element={<AiSalesAssistantPage />} />
        <Route path="/ai-engine/nl-query" element={<NlQueryPage />} />
        <Route path="/ai-engine/sentiment-analysis" element={<SentimentAnalysisPage />} />
        <Route path="/command-center/decision-queue" element={<DecisionQueuePage />} />
        <Route path="/command-center/execution-log" element={<ExecutionLogPage />} />
        <Route path="/command-center/live-event-stream" element={<LiveEventStreamPage />} />
        <Route path="/command-center/profit-intelligence" element={<ProfitIntelligencePage />} />
        <Route path="/palantir/object-explorer" element={<ObjectExplorerPage />} />
        <Route path="/palantir/ontology-manager" element={<OntologyManagerPage />} />
        <Route path="/palantir/link-analysis-graph" element={<LinkAnalysisGraphPage />} />
        <Route path="/ehs/ehs-dashboard" element={<EhsDashboardPage />} />
        <Route path="/ehs/environmental-permits" element={<EnvironmentalPermitsPage />} />
        <Route path="/ehs/hazardous-materials" element={<HazardousMaterialsPage />} />
        <Route path="/ehs/safety-incidents" element={<SafetyIncidentsPage />} />
        <Route path="/security/gdpr-center" element={<GdprCenterPage />} />
        <Route path="/security/data-retention" element={<DataRetentionPage />} />
        <Route path="/security/security-dashboard" element={<SecurityDashboardPage />} />
        <Route path="/security/compliance-reports" element={<ComplianceReportsPage />} />
        <Route path="/logistics/fleet-management" element={<FleetManagementPage />} />
        <Route path="/logistics/fleet-command-center" element={<FleetCommandCenterPage />} />
        <Route path="/logistics/route-planning" element={<RoutePlanningPage />} />
        <Route path="/logistics/driver-management" element={<DriverManagementPage />} />
        <Route path="/logistics/shipment-tracking-live" element={<ShipmentTrackingLivePage />} />
        <Route path="/logistics/vehicle-maintenance" element={<VehicleMaintenancePage />} />
        <Route path="/operations/oee-dashboard" element={<OeeDashboardPage2 />} />
        <Route path="/operations/operations-command-center" element={<OperationsCommandCenterPage />} />
        <Route path="/operations/shift-handover" element={<ShiftHandoverPage />} />
        <Route path="/operations/kpi-monitor" element={<KpiMonitorPage />} />
        <Route path="/operations/downtime-tracking" element={<DowntimeTrackingPage />} />
        <Route path="/operations/workflow-monitor" element={<WorkflowMonitorPage />} />
        <Route path="/integrations/api-gateway" element={<ApiGatewayPage />} />
        <Route path="/integrations/credentials-vault" element={<CredentialsVaultPage />} />
        <Route path="/integrations/event-bus" element={<EventBusPage2 />} />
        <Route path="/integrations/external-connectors" element={<ExternalConnectorsPage />} />
        <Route path="/integrations/integration-dashboard" element={<IntegrationDashboardPage />} />
        <Route path="/integrations/mcp-hub" element={<McpHubPage />} />
        <Route path="/integrations/sync-jobs" element={<SyncJobsPage />} />
        <Route path="/integrations/webhook-gateway" element={<WebhookGatewayPage />} />
        <Route path="/system/permissions-matrix" element={<PermissionsMatrixPage />} />
        <Route path="/system/roles-list" element={<RolesListPage />} />
        <Route path="/system/users-list" element={<UsersListPage />} />
        <Route path="/system/access-audit-view" element={<AccessAuditViewPage />} />
        <Route path="/system/approval-policy-management" element={<ApprovalPolicyManagementPage />} />
        <Route path="/system/data-scope-management" element={<DataScopeManagementPage />} />
        <Route path="/platform/master-data" element={<MasterDataPage />} />
        <Route path="/platform/recycle-bin" element={<RecycleBinPage />} />
        <Route path="/platform/sla-dashboard" element={<SlaDashboardPage />} />
        <Route path="/platform/workflow-engine" element={<WorkflowEnginePage />} />
        <Route path="/platform/approval-chains" element={<ApprovalChainsPage />} />
        <Route path="/tenders/tenders-management" element={<TendersManagementPage />} />
        <Route path="/tenders/tender-dashboard" element={<TenderDashboardPage />} />
        <Route path="/tenders/tender-submissions" element={<TenderSubmissionsPage />} />
        <Route path="/tenders/tender-evaluation" element={<TenderEvaluationPage />} />
        <Route path="/tenders/tender-pricing" element={<TenderPricingPage />} />
        <Route path="/tenders/tender-documents" element={<TenderDocumentsPage />} />
        <Route path="/tenders/bid-analysis" element={<BidAnalysisPage />} />
        <Route path="/tenders/tenders-command-center" element={<TendersCommandCenterPage />} />
        <Route path="/quality/quality-dashboard" element={<QualityDashboardPage />} />
        <Route path="/quality/capa" element={<CapaPage />} />
        <Route path="/quality/complaints" element={<ComplaintsPage />} />
        <Route path="/quality/internal-audit" element={<InternalAuditPage />} />
        <Route path="/quality/iso-management" element={<IsoManagementPage />} />
        <Route path="/quality/material-certs" element={<MaterialCertsPage />} />
        <Route path="/quality/quality-management-system" element={<QualityManagementSystemPage />} />
        <Route path="/quality/spc" element={<SpcPage />} />
        <Route path="/quality/supplier-quality" element={<SupplierQualityPage />} />
        <Route path="/quality/testing-lab" element={<TestingLabPage />} />
        <Route path="/support/sla-tracking" element={<SlaTrackingPage />} />
        <Route path="/support/support-command-center" element={<SupportCommandCenterPage />} />
        <Route path="/service/service-command-center" element={<ServiceCommandCenterPage />} />
        <Route path="/service/service-contracts" element={<ServiceContractsPage />} />
        <Route path="/service/service-warranty" element={<ServiceWarrantyPage />} />
        <Route path="/service/technician-management" element={<TechnicianManagementPage />} />
        <Route path="/service/spare-parts" element={<SparePartsPage />} />
        <Route path="/strategy/balanced-scorecard-page" element={<BalancedScorecardPagePage />} />
        <Route path="/strategy/business-plan-page" element={<BusinessPlanPagePage />} />
        <Route path="/strategy/competitive-analysis-page" element={<CompetitiveAnalysisPagePage />} />
        <Route path="/strategy/goals-page" element={<GoalsPagePage />} />
        <Route path="/strategy/swot-page" element={<SwotPagePage />} />
        <Route path="/supply-chain/supply-chain-dashboard" element={<SupplyChainDashboardPage />} />
        <Route path="/supply-chain/bom-command-center" element={<BomCommandCenterPage />} />
        <Route path="/supply-chain/bom-where-used" element={<BomWhereUsedPage />} />
        <Route path="/supply-chain/demand-planning" element={<DemandPlanningPage2 />} />
        <Route path="/supply-chain/edi-dashboard" element={<EdiDashboardPage />} />
        <Route path="/supply-chain/engineering-change-orders" element={<EngineeringChangeOrdersPage />} />
        <Route path="/supply-chain/lead-time-management" element={<LeadTimeManagementPage />} />
        <Route path="/portal/customer-portal-dashboard" element={<CustomerPortalDashboardPage />} />
        <Route path="/portal/contractor-portal" element={<ContractorPortalPage />} />
        <Route path="/portal/employee-portal" element={<EmployeePortalPage />} />
        <Route path="/portal/supplier-portal" element={<SupplierPortalPage2 />} />
        <Route path="/reports/reports-hub" element={<ReportsHubPage />} />
        <Route path="/reports/kpi-dashboard" element={<KpiDashboardPage />} />
        <Route path="/reports/financial-reports" element={<FinancialReportsPage />} />
        <Route path="/reports/operational-reports" element={<OperationalReportsPage />} />
        <Route path="/reports/risk-analysis" element={<RiskAnalysisPage />} />
        <Route path="/installation/installation-command-center" element={<InstallationCommandCenterPage />} />
        <Route path="/installation/installation-execution" element={<InstallationExecutionPage />} />
        <Route path="/installation/installation-teams" element={<InstallationTeamsPage />} />
        <Route path="/installation/installation-scheduling" element={<InstallationSchedulingPage />} />
        <Route path="/installation/measurements-surveys" element={<MeasurementsSurveysPage />} />
        <Route path="/installation/site-readiness" element={<SiteReadinessPage />} />
        <Route path="/crm/agent-control-dashboard" element={<AgentControlDashboardPage />} />
        <Route path="/crm/behavioral-analytics" element={<BehavioralAnalyticsPage />} />
        <Route path="/crm/communication-intelligence" element={<CommunicationIntelligencePage />} />
        <Route path="/crm/crm-communications-hub" element={<CrmCommunicationsHubPage />} />
        <Route path="/crm/decision-engine" element={<DecisionEnginePage />} />
        <Route path="/crm/intelligence-engine" element={<IntelligenceEnginePage />} />
        <Route path="/crm/nurture-sequences" element={<NurtureSequencesPage />} />
        <Route path="/crm/pipeline-financial" element={<PipelineFinancialPage />} />
        <Route path="/crm/predictive-forecasting" element={<PredictiveForecastingPage />} />
        <Route path="/crm/relationship-graph" element={<RelationshipGraphPage />} />
        <Route path="/sales/quote360" element={<Quote360Page />} />
        <Route path="/procurement/competitor-analysis" element={<CompetitorAnalysisPage />} />
        <Route path="/procurement/delivery-documents" element={<DeliveryDocumentsPage />} />
        <Route path="/procurement/documents-signatures" element={<DocumentsSignaturesPage />} />
        <Route path="/procurement/inventory-sync" element={<InventorySyncPage />} />
        <Route path="/procurement/logistics-tracking" element={<LogisticsTrackingPage />} />
        <Route path="/procurement/po-approvals" element={<PoApprovalsPage />} />
        <Route path="/procurement/price-management" element={<PriceManagementPage />} />
        <Route path="/procurement/procurement-alerts" element={<ProcurementAlertsPage />} />
        <Route path="/procurement/procurement-compliance" element={<ProcurementCompliancePage />} />
        <Route path="/procurement/procurement-exceptions" element={<ProcurementExceptionsPage />} />
        <Route path="/procurement/procurement-profit-impact" element={<ProcurementProfitImpactPage />} />
        <Route path="/procurement/procurement-settings" element={<ProcurementSettingsPage />} />
        <Route path="/procurement/procurement-simulation" element={<ProcurementSimulationPage />} />
        <Route path="/procurement/products/product-bom" element={<ProductBomPage />} />
        <Route path="/procurement/products/product-costing" element={<ProductCostingPage />} />
        <Route path="/procurement/products/products-dashboard" element={<ProductsDashboardPage />} />
        <Route path="/procurement/products/products-list" element={<ProductsListPage />} />
        <Route path="/procurement/profitability-dashboard" element={<ProfitabilityDashboardPage />} />
        <Route path="/procurement/quality-control" element={<QualityControlPage2 />} />
        <Route path="/procurement/raw-materials/cost-analysis" element={<CostAnalysisPage />} />
        <Route path="/procurement/raw-materials/raw-material-stock" element={<RawMaterialStockPage />} />
        <Route path="/procurement/raw-materials/raw-materials-dashboard" element={<RawMaterialsDashboardPage />} />
        <Route path="/procurement/raw-materials/raw-materials-list" element={<RawMaterialsListPage />} />
        <Route path="/procurement/raw-materials/scrap-waste" element={<ScrapWastePage />} />
        <Route path="/procurement/raw-materials/weight-calculator" element={<WeightCalculatorPage />} />
        <Route path="/procurement/supplier-dependency" element={<SupplierDependencyPage />} />
        <Route path="/procurement/supplier-management" element={<SupplierManagementPage />} />
        <Route path="/procurement/supplier-portal" element={<SupplierPortalPage3 />} />
        <Route path="/procurement/supplier-returns" element={<SupplierReturnsPage />} />
        <Route path="/procurement/vendor-negotiation" element={<VendorNegotiationPage />} />
        <Route path="/projects/customer-project-portal-page" element={<CustomerProjectPortalPagePage />} />
        <Route path="/projects/project-alerts" element={<ProjectAlertsPage />} />
        <Route path="/projects/project-documents-page" element={<ProjectDocumentsPagePage />} />
        <Route path="/projects/project-events-audit" element={<ProjectEventsAuditPage />} />
        <Route path="/projects/project-portal-page" element={<ProjectPortalPagePage />} />
        <Route path="/projects/project-production-tracking" element={<ProjectProductionTrackingPage />} />
        <Route path="/projects/project-settings" element={<ProjectSettingsPage />} />
        <Route path="/projects/project-templates-page" element={<ProjectTemplatesPagePage />} />
        <Route path="/projects/project-workflow" element={<ProjectWorkflowPage />} />
        <Route path="/projects/risk-dashboard-page" element={<RiskDashboardPagePage />} />
        <Route path="/assets/assets-dashboard" element={<AssetsDashboardPage />} />
        <Route path="/assets/equipment-insurance" element={<EquipmentInsurancePage />} />
        <Route path="/assets/leasing" element={<LeasingPage />} />
        <Route path="/assets/tools-dies" element={<ToolsDiesPage />} />
        <Route path="/inventory/inventory-alerts" element={<InventoryAlertsPage2 />} />
        <Route path="/inventory/inventory-ultra-dashboard" element={<InventoryUltraDashboardPage />} />
        <Route path="/inventory/stock-items-management" element={<StockItemsManagementPage />} />
        <Route path="/inventory/vmi-supplier-portal" element={<VmiSupplierPortalPage />} />
        <Route path="/inventory/warehouses-management" element={<WarehousesManagementPage />} />
        <Route path="/inventory/wms-analytics" element={<WmsAnalyticsPage />} />
        <Route path="/inventory/wms-consignment" element={<WmsConsignmentPage />} />
        <Route path="/inventory/wms-expiry-dashboard" element={<WmsExpiryDashboardPage />} />
        <Route path="/inventory/wms-kits" element={<WmsKitsPage />} />
        <Route path="/inventory/wms-location-hierarchy" element={<WmsLocationHierarchyPage />} />
        <Route path="/inventory/wms-valuation" element={<WmsValuationPage />} />
        <Route path="/finance/accounting-export" element={<AccountingExportPage />} />
        <Route path="/finance/contractor-payment-decision-model" element={<ContractorPaymentDecisionModelPage />} />
        <Route path="/finance/fin-control-center" element={<FinControlCenterPage />} />
        <Route path="/finance/finance-alerts" element={<FinanceAlertsPage />} />
        <Route path="/finance/finance-fixed-assets" element={<FinanceFixedAssetsPage />} />
        <Route path="/finance/financial-analytics" element={<FinancialAnalyticsPage />} />
        <Route path="/finance/institutional/financial-statements" element={<FinancialStatementsPage2 />} />
        <Route path="/finance/institutional/monte-carlo-engine" element={<MonteCarloEnginePage />} />
        <Route path="/finance/institutional/ratio-dashboard" element={<RatioDashboardPage />} />
        <Route path="/finance/institutional/risk-dashboard" element={<RiskDashboardPage />} />
        <Route path="/finance/institutional/treasury-dashboard" element={<TreasuryDashboardPage />} />
        <Route path="/finance/israeli-integrations" element={<IsraeliIntegrationsPage />} />
        <Route path="/finance/masav-management" element={<MasavManagementPage />} />
        <Route path="/finance/payables-dashboard" element={<PayablesDashboardPage />} />
        <Route path="/finance/payment-operations" element={<PaymentOperationsPage />} />
        <Route path="/finance/profitability-feedback-loop" element={<ProfitabilityFeedbackLoopPage />} />
        <Route path="/hr/compliance-dashboard" element={<ComplianceDashboardPage />} />
        <Route path="/hr/disciplinary-incidents" element={<DisciplinaryIncidentsPage />} />
        <Route path="/hr/employment-history" element={<EmploymentHistoryPage />} />
        <Route path="/hr/feedback-360" element={<Feedback360Page />} />
        <Route path="/hr/hr-alerts" element={<HrAlertsPage />} />
        <Route path="/hr/hr-analytics" element={<HrAnalyticsPage />} />
        <Route path="/hr/hr-settings" element={<HrSettingsPage />} />
        <Route path="/hr/labor-cost-allocation" element={<LaborCostAllocationPage />} />
        <Route path="/hr/offboarding-retirement" element={<OffboardingRetirementPage />} />
        <Route path="/hr/training-management" element={<TrainingManagementPage />} />
        <Route path="/workforce/employee360" element={<Employee360Page />} />
        <Route path="/payroll-runs/:id" element={<PayrollRun360Page />} />
        <Route path="/workforce/payroll-run/:id" element={<PayrollRun360Page />} />
        <Route path="/wage-slips-archive" element={<WageSlipsArchivePage />} />
        <Route path="/workforce/wage-slips-archive" element={<WageSlipsArchivePage />} />
        <Route path="/customer-service/complaints" element={<ComplaintsPage2 />} />
        <Route path="/customer-service/rma" element={<RmaPage2 />} />
        <Route path="/customer-service/service-dashboard" element={<ServiceDashboardPage />} />
        <Route path="/customer-service/warranty-management" element={<WarrantyManagementPage />} />
        <Route path="/contracts/contract-ai-analysis" element={<ContractAiAnalysisPage />} />
        <Route path="/contracts/contract-analytics-dashboard" element={<ContractAnalyticsDashboardPage />} />
        <Route path="/contracts/contract-risk-scoring" element={<ContractRiskScoringPage />} />
        <Route path="/contracts/contract-templates" element={<ContractTemplatesPage />} />
        <Route path="/contracts/contracts-dashboard" element={<ContractsDashboardPage />} />
        <Route path="/contracts/contracts-management" element={<ContractsManagementPage2 />} />
        <Route path="/contracts/nda-agreements" element={<NdaAgreementsPage />} />
        <Route path="/contracts/service-agreements" element={<ServiceAgreementsPage />} />
        <Route path="/documents/bulk-operations" element={<BulkOperationsPage />} />
        <Route path="/documents/document-control" element={<DocumentControlPage />} />
        <Route path="/documents/document-permissions" element={<DocumentPermissionsPage />} />
        <Route path="/documents/document-registry" element={<DocumentRegistryPage />} />
        <Route path="/documents/document-search" element={<DocumentSearchPage />} />
        <Route path="/documents/document-settings" element={<DocumentSettingsPage />} />
        <Route path="/documents/incoming-documents" element={<IncomingDocumentsPage />} />
        <Route path="/documents/module-documents" element={<ModuleDocumentsPage />} />
        <Route path="/documents/ocr-processing" element={<OcrProcessingPage />} />
        <Route path="/documents/outgoing-documents" element={<OutgoingDocumentsPage />} />
        <Route path="/documents/retention-compliance" element={<RetentionCompliancePage />} />
        <Route path="/documents/version-control" element={<VersionControlPage />} />
        <Route path="/advanced/anomaly-detection" element={<AnomalyDetectionPage />} />
        <Route path="/advanced/digital-twin-factory" element={<DigitalTwinFactoryPage />} />
        <Route path="/advanced/graph-analytics" element={<GraphAnalyticsPage />} />
        <Route path="/advanced/nl-query-assistant" element={<NlQueryAssistantPage />} />
        <Route path="/advanced/predictive-forecasting" element={<PredictiveForecastingPage2 />} />
        <Route path="/ai-engine/ai-customer-service" element={<AiCustomerServicePage />} />
        <Route path="/ai-engine/bash44-agent-config" element={<Bash44AgentConfigPage />} />
        <Route path="/ai-engine/bash44-agent-runs" element={<Bash44AgentRunsPage />} />
        <Route path="/ai-engine/bash44-alerts-center" element={<Bash44AlertsCenterPage />} />
        <Route path="/ai-engine/bash44-approval-queue" element={<Bash44ApprovalQueuePage />} />
        <Route path="/ai-engine/bash44-control-center" element={<Bash44ControlCenterPage />} />
        <Route path="/ai-engine/bash44-executive-brief" element={<Bash44ExecutiveBriefPage />} />
        <Route path="/ai-engine/bash44-knowledge-contexts" element={<Bash44KnowledgeContextsPage />} />
        <Route path="/ai-engine/bash44-recommendations" element={<Bash44RecommendationsPage />} />
        <Route path="/ai-engine/employee-chatbot" element={<EmployeeChatbotPage />} />
        <Route path="/ai-engine/kobi-prompts" element={<KobiPromptsPage />} />
        <Route path="/ai-engine/ml-training-pipeline" element={<MlTrainingPipelinePage />} />
        <Route path="/bi/bi-hub" element={<BiHubPage />} />
        <Route path="/bi/comparative-analytics" element={<ComparativeAnalyticsPage />} />
        <Route path="/bi/custom-dashboards" element={<CustomDashboardsPage />} />
        <Route path="/bi/data-explorer" element={<DataExplorerPage />} />
        <Route path="/bi/scheduled-reports" element={<ScheduledReportsPage />} />
        <Route path="/builder/business-rules-builder" element={<BusinessRulesBuilderPage />} />
        <Route path="/builder/scheduled-tasks" element={<ScheduledTasksPage />} />
        <Route path="/builder/visual-workflow-designer" element={<VisualWorkflowDesignerPage />} />
        <Route path="/builder/webhook-management" element={<WebhookManagementPage />} />
        <Route path="/command-center/causal-impact-viewer" element={<CausalImpactViewerPage />} />
        <Route path="/command-center/command-center" element={<CommandCenterPage2 />} />
        <Route path="/reports/bi-financial-statements" element={<BiFinancialStatementsPage />} />
        <Route path="/reports/bi-hr-analytics" element={<BiHrAnalyticsPage />} />
        <Route path="/reports/bi-inventory-analytics" element={<BiInventoryAnalyticsPage />} />
        <Route path="/reports/bi-production-analytics" element={<BiProductionAnalyticsPage />} />
        <Route path="/reports/bi-sales-analytics" element={<BiSalesAnalyticsPage />} />
        <Route path="/reports/financial/report-customer-aging" element={<ReportCustomerAgingPage />} />
        <Route path="/reports/financial/report-executive-summary" element={<ReportExecutiveSummaryPage />} />
        <Route path="/reports/financial/report-fiscal" element={<ReportFiscalPage />} />
        <Route path="/reports/financial/report-invoice-analysis" element={<ReportInvoiceAnalysisPage />} />
        <Route path="/reports/financial/report-vat" element={<ReportVatPage />} />
        <Route path="/reports/financial/report-vendor-aging" element={<ReportVendorAgingPage />} />
        <Route path="/security/backup-dr" element={<BackupDrPage />} />
        <Route path="/security/encryption-management" element={<EncryptionManagementPage />} />
        <Route path="/security/tabs/api-keys-security" element={<ApiKeysSecurityPage />} />
        <Route path="/security/tabs/cors-management" element={<CorsManagementPage />} />
        <Route path="/security/tabs/geo-blocking" element={<GeoBlockingPage />} />
        <Route path="/security/tabs/ip-management" element={<IpManagementPage />} />
        <Route path="/security/tabs/rate-limit-config" element={<RateLimitConfigPage />} />
        <Route path="/security/tabs/vulnerability-tracker" element={<VulnerabilityTrackerPage />} />
        <Route path="/security/tabs/webhook-secrets" element={<WebhookSecretsPage />} />
        <Route path="/integrations/auth-tokens" element={<AuthTokensPage />} />
        <Route path="/integrations/integration-alerts" element={<IntegrationAlertsPage />} />
        <Route path="/integrations/integration-audit" element={<IntegrationAuditPage />} />
        <Route path="/integrations/integration-settings" element={<IntegrationSettingsPage />} />
        <Route path="/integrations/payload-validation" element={<PayloadValidationPage />} />
        <Route path="/integrations/rate-limits" element={<RateLimitsPage2 />} />
        <Route path="/integrations/retries-dlq" element={<RetriesDlqPage />} />
        <Route path="/integrations/transformation-engine" element={<TransformationEnginePage />} />
        <Route path="/data-fabric/data-fabric-overview" element={<DataFabricOverviewPage />} />
        <Route path="/data-fabric/data-products" element={<DataProductsPage />} />
        <Route path="/data-fabric/data-quality-dashboard" element={<DataQualityDashboardPage />} />
        <Route path="/data-fabric/identity-resolution" element={<IdentityResolutionPage />} />
        <Route path="/data-fabric/lineage-graph" element={<LineageGraphPage />} />
        <Route path="/data-migration" element={<DataMigrationPage />} />
        <Route path="/data-platform/canonical-explorer" element={<CanonicalExplorerPage />} />
        <Route path="/data-platform/platform-observatory" element={<PlatformObservatoryPage />} />
        <Route path="/data-platform/quarantine-browser" element={<QuarantineBrowserPage />} />
        <Route path="/ehs/annual-safety-report" element={<AnnualSafetyReportPage />} />
        <Route path="/ehs/emergency-preparedness" element={<EmergencyPreparednessPage />} />
        <Route path="/ehs/energy-management" element={<EnergyManagementPage />} />
        <Route path="/ehs/israeli-regulatory" element={<IsraeliRegulatoryPage />} />
        <Route path="/ehs/ppe-management" element={<PpeManagementPage />} />
        <Route path="/ehs/risk-assessment" element={<RiskAssessmentPage />} />
        <Route path="/ehs/safety-inspections" element={<SafetyInspectionsPage />} />
        <Route path="/ehs/safety-training-certs" element={<SafetyTrainingCertsPage />} />
        <Route path="/ehs/waste-management" element={<WasteManagementPage />} />
        <Route path="/ehs/work-permits" element={<WorkPermitsPage />} />
        <Route path="/engineering/design-reviews" element={<DesignReviewsPage />} />
        <Route path="/engineering/drawing-management" element={<DrawingManagementPage />} />
        <Route path="/engineering/engineering-alerts" element={<EngineeringAlertsPage />} />
        <Route path="/engineering/engineering-analytics" element={<EngineeringAnalyticsPage />} />
        <Route path="/engineering/engineering-calculations" element={<EngineeringCalculationsPage />} />
        <Route path="/engineering/engineering-command-center" element={<EngineeringCommandCenterPage />} />
        <Route path="/engineering/engineering-documents" element={<EngineeringDocumentsPage />} />
        <Route path="/engineering/engineering-office" element={<EngineeringOfficePage />} />
        <Route path="/engineering/engineering-projects" element={<EngineeringProjectsPage />} />
        <Route path="/engineering/engineering-settings" element={<EngineeringSettingsPage />} />
        <Route path="/engineering/engineering-standards" element={<EngineeringStandardsPage />} />
        <Route path="/engineering/material-specifications" element={<MaterialSpecificationsPage />} />
        <Route path="/engineering/product-catalog" element={<ProductCatalogPage />} />
        <Route path="/engineering/prototype-testing" element={<PrototypeTestingPage />} />
        <Route path="/executive/bi-command-center" element={<BiCommandCenterPage />} />
        <Route path="/executive/executive-command-center" element={<ExecutiveCommandCenterPage />} />
        <Route path="/executive/executive-scorecard" element={<ExecutiveScorecardPage />} />
        <Route path="/fabrication/fab-accessories" element={<FabAccessoriesPage />} />
        <Route path="/fabrication/fab-assembly-orders" element={<FabAssemblyOrdersPage />} />
        <Route path="/fabrication/fab-coating-orders" element={<FabCoatingOrdersPage />} />
        <Route path="/fabrication/fab-cutting-lists" element={<FabCuttingListsPage />} />
        <Route path="/fabrication/fab-finishes-colors" element={<FabFinishesColorsPage />} />
        <Route path="/fabrication/fab-glass-catalog" element={<FabGlassCatalogPage />} />
        <Route path="/fabrication/fab-glazing-orders" element={<FabGlazingOrdersPage />} />
        <Route path="/fabrication/fab-installation-orders" element={<FabInstallationOrdersPage />} />
        <Route path="/fabrication/fab-packing-lists" element={<FabPackingListsPage />} />
        <Route path="/fabrication/fab-profiles" element={<FabProfilesPage />} />
        <Route path="/fabrication/fab-service-tickets" element={<FabServiceTicketsPage />} />
        <Route path="/fabrication/fab-systems" element={<FabSystemsPage />} />
        <Route path="/fabrication/fab-transport-orders" element={<FabTransportOrdersPage />} />
        <Route path="/fabrication/fab-welding-orders" element={<FabWeldingOrdersPage />} />
        <Route path="/fabrication/fab-workflow-tracker" element={<FabWorkflowTrackerPage />} />
        <Route path="/fin/fin-accounting" element={<FinAccountingPage />} />
        <Route path="/fin/fin-credit-clearing" element={<FinCreditClearingPage />} />
        <Route path="/fin/fin-dashboard" element={<FinDashboardPage />} />
        <Route path="/fin/fin-document-create" element={<FinDocumentCreatePage />} />
        <Route path="/fin/fin-document-details" element={<FinDocumentDetailsPage />} />
        <Route path="/fin/fin-documents-list" element={<FinDocumentsListPage />} />
        <Route path="/fin/fin-recurring" element={<FinRecurringPage />} />
        <Route path="/fin/fin-standing-orders" element={<FinStandingOrdersPage />} />
        <Route path="/import/containers-packages" element={<ContainersPackagesPage />} />
        <Route path="/import/customs-clearance" element={<CustomsClearancePage />} />
        <Route path="/import/foreign-suppliers" element={<ForeignSuppliersPage />} />
        <Route path="/import/import-analytics" element={<ImportAnalyticsPage />} />
        <Route path="/import/import-approvals" element={<ImportApprovalsPage />} />
        <Route path="/import/import-dashboard" element={<ImportDashboardPage />} />
        <Route path="/import/import-documents" element={<ImportDocumentsPage />} />
        <Route path="/import/import-purchase-orders" element={<ImportPurchaseOrdersPage />} />
        <Route path="/import/import-receiving" element={<ImportReceivingPage />} />
        <Route path="/import/import-risk-alerts" element={<ImportRiskAlertsPage />} />
        <Route path="/import/import-settings" element={<ImportSettingsPage />} />
        <Route path="/import/import-shipments" element={<ImportShipmentsPage />} />
        <Route path="/import/import-tracking" element={<ImportTrackingPage />} />
        <Route path="/import/landed-cost-calculator" element={<LandedCostCalculatorPage />} />
        <Route path="/import/shipping-forwarders" element={<ShippingForwardersPage />} />
        <Route path="/installation/customer-handover" element={<CustomerHandoverPage />} />
        <Route path="/installation/equipment-tools" element={<EquipmentToolsPage />} />
        <Route path="/installation/field-exceptions" element={<FieldExceptionsPage />} />
        <Route path="/installation/installation-alerts" element={<InstallationAlertsPage />} />
        <Route path="/installation/installation-cost-tracking" element={<InstallationCostTrackingPage />} />
        <Route path="/installation/installation-documents" element={<InstallationDocumentsPage />} />
        <Route path="/installation/installation-management" element={<InstallationManagementPage />} />
        <Route path="/installation/installation-orders" element={<InstallationOrdersPage />} />
        <Route path="/installation/installation-profitability" element={<InstallationProfitabilityPage />} />
        <Route path="/installation/installation-progress" element={<InstallationProgressPage />} />
        <Route path="/installation/installation-quality-control" element={<InstallationQualityControlPage />} />
        <Route path="/installation/installation-settings" element={<InstallationSettingsPage />} />
        <Route path="/installation/installer-profiles" element={<InstallerProfilesPage />} />
        <Route path="/installation/loading-dispatch" element={<LoadingDispatchPage />} />
        <Route path="/installation/return-service-calls" element={<ReturnServiceCallsPage />} />
        <Route path="/installations/gps-map" element={<GpsMapPage />} />
        <Route path="/integration-hub" element={<IntegrationHubPage />} />
        <Route path="/knowledge/faq-management" element={<FaqManagementPage />} />
        <Route path="/knowledge/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/knowledge/knowledge-command-center" element={<KnowledgeCommandCenterPage />} />
        <Route path="/knowledge/lessons-learned" element={<LessonsLearnedPage />} />
        <Route path="/knowledge/sop-procedures" element={<SopProceduresPage />} />
        <Route path="/logistics/barcode-rfid" element={<BarcodeRfidPage />} />
        <Route path="/logistics/cross-border" element={<CrossBorderPage />} />
        <Route path="/logistics/customer-tracking-portal" element={<CustomerTrackingPortalPage />} />
        <Route path="/logistics/delivery-cost-analysis" element={<DeliveryCostAnalysisPage />} />
        <Route path="/logistics/delivery-scheduling" element={<DeliverySchedulingPage />} />
        <Route path="/logistics/fleet-alerts" element={<FleetAlertsPage />} />
        <Route path="/logistics/fleet-delivery" element={<FleetDeliveryPage />} />
        <Route path="/logistics/freight" element={<FreightPage />} />
        <Route path="/logistics/freight-audit" element={<FreightAuditPage />} />
        <Route path="/logistics/fuel-management" element={<FuelManagementPage />} />
        <Route path="/logistics/loading-dock" element={<LoadingDockPage />} />
        <Route path="/logistics/logistics-dashboard" element={<LogisticsDashboardPage />} />
        <Route path="/logistics/packaging" element={<PackagingPage />} />
        <Route path="/logistics/proof-of-delivery" element={<ProofOfDeliveryPage />} />
        <Route path="/logistics/reverse-logistics" element={<ReverseLogisticsPage />} />
        <Route path="/logistics/vehicle-registry" element={<VehicleRegistryPage />} />
        <Route path="/notification-settings/delivery-dashboard" element={<DeliveryDashboardPage />} />
        <Route path="/notification-settings/email-templates" element={<EmailTemplatesPage3 />} />
        <Route path="/operations/cost-per-unit" element={<CostPerUnitPage />} />
        <Route path="/palantir/actions-studio" element={<ActionsStudioPage />} />
        <Route path="/palantir/aip-agent-studio" element={<AipAgentStudioPage />} />
        <Route path="/palantir/code-workspace" element={<CodeWorkspacePage />} />
        <Route path="/palantir/dossier-page" element={<DossierPagePage />} />
        <Route path="/palantir/map-geospatial" element={<MapGeospatialPage />} />
        <Route path="/palantir/pipeline-builder" element={<PipelineBuilderPage />} />
        <Route path="/palantir/timeline-analysis" element={<TimelineAnalysisPage />} />
        <Route path="/platform/notifications-center" element={<NotificationsCenterPage />} />
        <Route path="/platform/security-audit" element={<SecurityAuditPage />} />
        <Route path="/portal/customer-portal-login" element={<CustomerPortalLoginPage />} />
        <Route path="/pricing/actual-vs-estimated" element={<ActualVsEstimatedPage />} />
        <Route path="/pricing/labor-operations-cost" element={<LaborOperationsCostPage />} />
        <Route path="/pricing/landed-cost-source" element={<LandedCostSourcePage />} />
        <Route path="/pricing/material-price-pull" element={<MaterialPricePullPage />} />
        <Route path="/pricing/pricing-approvals" element={<PricingApprovalsPage />} />
        <Route path="/pricing/pricing-cost-builder" element={<PricingCostBuilderPage />} />
        <Route path="/pricing/pricing-cost-calculator" element={<PricingCostCalculatorPage />} />
        <Route path="/pricing/pricing-dashboard" element={<PricingDashboardPage />} />
        <Route path="/pricing/pricing-price-lists" element={<PricingPriceListsPage />} />
        <Route path="/pricing/pricing-requests-list" element={<PricingRequestsListPage />} />
        <Route path="/pricing/pricing-versions" element={<PricingVersionsPage />} />
        <Route path="/pricing/project-pricing-details" element={<ProjectPricingDetailsPage />} />
        <Route path="/pricing/recommended-price" element={<RecommendedPricePage />} />
        <Route path="/pricing/risk-margin-target" element={<RiskMarginTargetPage />} />
        <Route path="/pricing/stock-vs-buy-decision" element={<StockVsBuyDecisionPage />} />
        <Route path="/pricing/supplier-comparison-project" element={<SupplierComparisonProjectPage />} />
        <Route path="/product-dev/product-certifications" element={<ProductCertificationsPage />} />
        <Route path="/product-dev/product-design" element={<ProductDesignPage />} />
        <Route path="/product-dev/product-dev-command-center" element={<ProductDevCommandCenterPage />} />
        <Route path="/product-dev/product-launches" element={<ProductLaunchesPage />} />
        <Route path="/production/assembly-jobs" element={<AssemblyJobsPage />} />
        <Route path="/production/cut-jobs" element={<CutJobsPage />} />
        <Route path="/production/finishing-jobs" element={<FinishingJobsPage />} />
        <Route path="/production/labor-control" element={<LaborControlPage />} />
        <Route path="/production/labor-time-tracking" element={<LaborTimeTrackingPage />} />
        <Route path="/production/maintenance-downtime" element={<MaintenanceDowntimePage />} />
        <Route path="/production/master-production-schedule" element={<MasterProductionSchedulePage />} />
        <Route path="/production/material-issuance" element={<MaterialIssuancePage />} />
        <Route path="/production/production-alerts" element={<ProductionAlertsPage />} />
        <Route path="/production/production-analytics" element={<ProductionAnalyticsPage />} />
        <Route path="/production/production-cost-tracking" element={<ProductionCostTrackingPage />} />
        <Route path="/production/production-exceptions" element={<ProductionExceptionsPage />} />
        <Route path="/production/production-orders" element={<ProductionOrdersPage />} />
        <Route path="/production/quality-defects-rework" element={<QualityDefectsReworkPage />} />
        <Route path="/production/shortages-page" element={<ShortagesPagePage />} />
        <Route path="/production/welding-jobs" element={<WeldingJobsPage />} />
        <Route path="/production/work-stations" element={<WorkStationsPage />} />
        <Route path="/quality/calibration" element={<CalibrationPage />} />
        <Route path="/quality/document-control" element={<DocumentControlPage2 />} />
        <Route path="/quality/test-certificates" element={<TestCertificatesPage />} />
        <Route path="/safety/safety-procedures" element={<SafetyProceduresPage />} />
        <Route path="/safety/safety-training" element={<SafetyTrainingPage />} />
        <Route path="/service/service-analytics" element={<ServiceAnalyticsPage />} />
        <Route path="/service/service-cases" element={<ServiceCasesPage />} />
        <Route path="/service/service-cost-tracking" element={<ServiceCostTrackingPage />} />
        <Route path="/settings/api-connection-hub" element={<ApiConnectionHubPage />} />
        <Route path="/settings/api-keys" element={<ApiKeysPage />} />
        <Route path="/settings/israeli-integrations" element={<IsraeliIntegrationsPage2 />} />
        <Route path="/settings/sections/mfa-settings" element={<MfaSettingsPage />} />
        <Route path="/settings/sections/session-management" element={<SessionManagementPage />} />
        <Route path="/settings/sections/sso-settings" element={<SsoSettingsPage />} />
        <Route path="/supplier-mgmt/supplier-development" element={<SupplierDevelopmentPage />} />
        <Route path="/supplier-mgmt/supplier-portal-dashboard" element={<SupplierPortalDashboardPage />} />
        <Route path="/supplier-mgmt/supplier-scorecards" element={<SupplierScorecardsPage />} />
        <Route path="/supplier-mgmt/supplier360" element={<Supplier360Page />} />
        <Route path="/supplier-mgmt/supply-chain-risk" element={<SupplyChainRiskPage />} />
        <Route path="/supplier-mgmt/vendor-compliance" element={<VendorCompliancePage />} />
        <Route path="/supply-chain/bom-comparison" element={<BomComparisonPage />} />
        <Route path="/supply-chain/bom-cost-rollup" element={<BomCostRollupPage />} />
        <Route path="/supply-chain/bom-templates" element={<BomTemplatesPage />} />
        <Route path="/supply-chain/bom-versions" element={<BomVersionsPage />} />
        <Route path="/supply-chain/edi-admin" element={<EdiAdminPage />} />
        <Route path="/supply-chain/supply-chain-alerts" element={<SupplyChainAlertsPage />} />
        <Route path="/supply-chain/supply-chain-analytics" element={<SupplyChainAnalyticsPage />} />
        <Route path="/supply-chain/supply-chain-command-center" element={<SupplyChainCommandCenterPage />} />
        <Route path="/supply-chain/supply-chain-settings" element={<SupplyChainSettingsPage />} />
        <Route path="/supply-chain/supply-chain-visibility" element={<SupplyChainVisibilityPage />} />
        <Route path="/support/support-dashboard" element={<SupportDashboardPage />} />
        <Route path="/system/role-card" element={<RoleCardPage />} />
        <Route path="/system/user-card" element={<UserCardPage />} />
        <Route path="/system/user-permission-override" element={<UserPermissionOverridePage />} />
        <Route path="/system/user-role-assignment" element={<UserRoleAssignmentPage />} />
        <Route path="/tenders/tender-alerts" element={<TenderAlertsPage />} />
        <Route path="/tenders/tender-analytics" element={<TenderAnalyticsPage />} />
        <Route path="/tenders/tender-competitors" element={<TenderCompetitorsPage />} />
        <Route path="/tenders/tender-timeline" element={<TenderTimelinePage />} />
        <Route path="/ai-engine/ai-agents-dashboard" element={<AiAgentsDashboardPage />} />
        {/* === AUTO-WIRED ROUTES === */}
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/crm/dashboard" element={<DashboardPage />} />
        <Route path="/sales/crm-pipeline" element={<CrmPipelinePage />} />
        <Route path="/crm-activities" element={<CrmActivitiesPage />} />
        <Route path="/supplier-scorecards" element={<SupplierScorecardsPage />} />
        <Route path="/procurement/dashboard" element={<DashboardPage2 />} />
        <Route path="/procurement/contracts" element={<ContractsPage />} />
        <Route path="/vendor-negotiation" element={<VendorNegotiationPage />} />
        <Route path="/supplier-management" element={<SupplierManagementPage />} />
        <Route path="/raw-material-stock" element={<RawMaterialStockPage />} />
        <Route path="/fin/income" element={<IncomePage />} />
        <Route path="/fin/expenses" element={<ExpensesPage />} />
        <Route path="/finance/dashboard" element={<DashboardPage3 />} />
        <Route path="/company-financials" element={<CompanyFinancialsPage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
        <Route path="/hr/dashboard" element={<DashboardPage4 />} />
        <Route path="/hr/settings" element={<SettingsPage />} />
        <Route path="/portal/customer/login" element={<LoginPage />} />
        <Route path="/portal/customer/dashboard" element={<DashboardPage5 />} />
        <Route path="/executive/scorecard" element={<ScorecardPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/integrations-hub-data" element={<IntegrationsHubDataPage />} />
        <Route path="/integration-settings" element={<IntegrationSettingsPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/system-settings" element={<SystemSettingsPage />} />
        <Route path="/commercial/opportunities" element={<OpportunitiesPage2 />} />
        <Route path="/commercial/crm-activities" element={<CrmActivitiesPage2 />} />
        <Route path="/predictive-analytics" element={<PredictiveAnalyticsPage />} />
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
            <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />
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
          <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />
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
              <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />
              <GlobalErrorHandler />
            </ConfirmDialogProvider>
          </TooltipProvider>
        </PermissionsProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
