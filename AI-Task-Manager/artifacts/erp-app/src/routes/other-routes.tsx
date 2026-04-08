import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const ReportsHub = lazyPage(() => import("@/pages/reports/reports-hub"));
const FinancialReports = lazyPage(() => import("@/pages/reports/financial-reports"));
const RiskAnalysis = lazyPage(() => import("@/pages/reports/risk-analysis"));
const KPIDashboard = lazyPage(() => import("@/pages/reports/kpi-dashboard"));
const FunnelAnalysis = lazyPage(() => import("@/pages/reports/funnel-analysis"));
const OperationalReports = lazyPage(() => import("@/pages/reports/operational-reports"));
const BIDashboardPage = lazyPage(() => import("@/pages/reports/bi-dashboard"));
const BIFinancialStatements = lazyPage(() => import("@/pages/reports/bi-financial-statements"));
const BISalesAnalytics = lazyPage(() => import("@/pages/reports/bi-sales-analytics"));
const BIProductionAnalytics = lazyPage(() => import("@/pages/reports/bi-production-analytics"));
const BIInventoryAnalytics = lazyPage(() => import("@/pages/reports/bi-inventory-analytics"));
const BIHRAnalytics = lazyPage(() => import("@/pages/reports/bi-hr-analytics"));
const ReportCustomerAgingPage = lazyPage(() => import("@/pages/reports/financial/report-customer-aging"));
const ReportVendorAgingPage = lazyPage(() => import("@/pages/reports/financial/report-vendor-aging"));
const ReportVatPage = lazyPage(() => import("@/pages/reports/financial/report-vat"));
const ReportFiscalPage = lazyPage(() => import("@/pages/reports/financial/report-fiscal"));
const ReportInvoiceAnalysisPage = lazyPage(() => import("@/pages/reports/financial/report-invoice-analysis"));
const ReportExecutiveSummaryPage = lazyPage(() => import("@/pages/reports/financial/report-executive-summary"));
const CustomerVendorLedgerPage = lazyPage(() => import("@/pages/reports/financial/customer-vendor-ledger"));
const FinancialAnalyticsPage = lazyPage(() => import("@/pages/finance/financial-analytics"));

const ProjectsDashboard = lazyPage(() => import("@/pages/projects/projects-dashboard"));
const ProjectTasksPage = lazyPage(() => import("@/pages/projects/project-tasks-page"));
const GanttChartPage = lazyPage(() => import("@/pages/projects/gantt-chart-page"));
const MilestonesPage = lazyPage(() => import("@/pages/projects/milestones-page"));
const SubcontractorsPage = lazyPage(() => import("@/pages/projects/subcontractors"));
const Kiryati10Page = lazyPage(() => import("@/pages/projects/real-estate/kiryati10"));
const REUnitsPage = lazyPage(() => import("@/pages/projects/real-estate/units"));
const REPermitsPage = lazyPage(() => import("@/pages/projects/real-estate/permits"));
const REContractorsPage = lazyPage(() => import("@/pages/projects/real-estate/contractors"));
const ResourcesPage = lazyPage(() => import("@/pages/projects/resources-page"));
const ProjectBudgetPage = lazyPage(() => import("@/pages/projects/project-budget-page"));
const RiskRegisterPage = lazyPage(() => import("@/pages/projects/risk-register-page"));
const RiskDashboardPage = lazyPage(() => import("@/pages/projects/risk-dashboard-page"));
const ChangeOrdersPage = lazyPage(() => import("@/pages/projects/change-orders-page"));
const ProjectDocumentsPage = lazyPage(() => import("@/pages/projects/project-documents-page"));
const ProjectTemplatesPage = lazyPage(() => import("@/pages/projects/project-templates-page"));
const TimesheetsPage = lazyPage(() => import("@/pages/projects/timesheets-page"));
const PortfolioDashboardPage = lazyPage(() => import("@/pages/projects/portfolio-dashboard-page"));
const ProjectPortalPage = lazyPage(() => import("@/pages/projects/project-portal-page"));
const CustomerProjectPortalPage = lazyPage(() => import("@/pages/projects/customer-project-portal-page"));
const EarnedValuePage = lazyPage(() => import("@/pages/projects/earned-value"));
const ResourcePlanningPage = lazyPage(() => import("@/pages/projects/resource-planning"));
const RiskRegisterProjectPage = lazyPage(() => import("@/pages/projects/risk-register"));

const GoalsPage = lazyPage(() => import("@/pages/strategy/goals-page"));
const SwotPage = lazyPage(() => import("@/pages/strategy/swot-page"));
const StrategicPlanningPage = lazyPage(() => import("@/pages/strategy/planning"));
const MarketAnalysisPage = lazyPage(() => import("@/pages/strategy/market-analysis"));
const OKRsPage = lazyPage(() => import("@/pages/strategy/okrs"));
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

const QualityDashboardPage = lazyPage(() => import("@/pages/quality/quality-dashboard"));
const ISOManagementPage = lazyPage(() => import("@/pages/quality/iso-management"));
const QualityDocumentControlPage = lazyPage(() => import("@/pages/quality/document-control"));
const CalibrationPage = lazyPage(() => import("@/pages/quality/calibration"));
const CAPAPage = lazyPage(() => import("@/pages/quality/capa"));
const InternalAuditPage = lazyPage(() => import("@/pages/quality/internal-audit"));
const TestingLabPage = lazyPage(() => import("@/pages/quality/testing-lab"));
const SPCPage = lazyPage(() => import("@/pages/quality/spc"));
const TestCertificatesPage = lazyPage(() => import("@/pages/quality/test-certificates"));
const MaterialCertsPage = lazyPage(() => import("@/pages/quality/material-certs"));
const SupplierQualityPage = lazyPage(() => import("@/pages/quality/supplier-quality"));
const QualityComplaintsPage = lazyPage(() => import("@/pages/quality/complaints"));

const LogisticsDashboardPage = lazyPage(() => import("@/pages/logistics/logistics-dashboard"));
const FleetManagementPage = lazyPage(() => import("@/pages/logistics/fleet-management"));
const RoutePlanningPage = lazyPage(() => import("@/pages/logistics/route-planning"));
const DeliverySchedulingPage = lazyPage(() => import("@/pages/logistics/delivery-scheduling"));
const PackagingPage = lazyPage(() => import("@/pages/logistics/packaging"));
const BarcodeRFIDPage = lazyPage(() => import("@/pages/logistics/barcode-rfid"));
const FreightPage = lazyPage(() => import("@/pages/logistics/freight"));
const LoadingDockPage = lazyPage(() => import("@/pages/logistics/loading-dock"));
const CrossBorderPage = lazyPage(() => import("@/pages/logistics/cross-border"));
const FreightAuditPage = lazyPage(() => import("@/pages/logistics/freight-audit"));
const ShipmentTrackingLivePage = lazyPage(() => import("@/pages/logistics/shipment-tracking-live"));
const ProofOfDeliveryPage = lazyPage(() => import("@/pages/logistics/proof-of-delivery"));
const ReverseLogisticsPage = lazyPage(() => import("@/pages/logistics/reverse-logistics"));
const CustomerTrackingPortalPage = lazyPage(() => import("@/pages/logistics/customer-tracking-portal"));

const EHSDashboardPage = lazyPage(() => import("@/pages/ehs/ehs-dashboard"));
const HazardousMaterialsPage = lazyPage(() => import("@/pages/ehs/hazardous-materials"));
const WasteManagementPage = lazyPage(() => import("@/pages/ehs/waste-management"));
const EnvironmentalPermitsPage = lazyPage(() => import("@/pages/ehs/environmental-permits"));
const SafetyIncidentsPage = lazyPage(() => import("@/pages/ehs/safety-incidents"));
const PPEManagementPage = lazyPage(() => import("@/pages/ehs/ppe-management"));
const WorkPermitsPage = lazyPage(() => import("@/pages/ehs/work-permits"));
const EnergyManagementPage = lazyPage(() => import("@/pages/ehs/energy-management"));
const HSERiskAssessmentPage = lazyPage(() => import("@/pages/ehs/risk-assessment"));
const HSESafetyTrainingCertsPage = lazyPage(() => import("@/pages/ehs/safety-training-certs"));
const HSESafetyInspectionsPage = lazyPage(() => import("@/pages/ehs/safety-inspections"));
const EmergencyPreparednessPage = lazyPage(() => import("@/pages/ehs/emergency-preparedness"));
const IsraeliRegulatoryPage = lazyPage(() => import("@/pages/ehs/israeli-regulatory"));
const AnnualSafetyReportPage = lazyPage(() => import("@/pages/ehs/annual-safety-report"));

const AssetsDashboardPage = lazyPage(() => import("@/pages/assets/assets-dashboard"));
const ToolsDiesPage = lazyPage(() => import("@/pages/assets/tools-dies"));
const LeasingPage = lazyPage(() => import("@/pages/assets/leasing"));
const EquipmentInsurancePage = lazyPage(() => import("@/pages/assets/equipment-insurance"));
const AssetManagementPage = lazyPage(() => import("@/pages/modules/asset-management"));

const KnowledgeBasePage = lazyPage(() => import("@/pages/knowledge/knowledge-base"));
const SOPProceduresPage = lazyPage(() => import("@/pages/knowledge/sop-procedures"));
const LessonsLearnedPage = lazyPage(() => import("@/pages/knowledge/lessons-learned"));

const ContractsDashboardPage = lazyPage(() => import("@/pages/contracts/contracts-dashboard"));
const ServiceAgreementsPage = lazyPage(() => import("@/pages/contracts/service-agreements"));
const NDAAgreementsPage = lazyPage(() => import("@/pages/contracts/nda-agreements"));
const ContractTemplatesPage = lazyPage(() => import("@/pages/contracts/contract-templates"));
const ContractRiskScoringPage = lazyPage(() => import("@/pages/contracts/contract-risk-scoring"));
const ContractAnalyticsDashboardPage = lazyPage(() => import("@/pages/contracts/contract-analytics-dashboard"));
const ContractAIAnalysisPage = lazyPage(() => import("@/pages/contracts/contract-ai-analysis"));
const DocumentsContractsPage = lazyPage(() => import("@/pages/documents/contracts"));

const WarrantyMgmtPage = lazyPage(() => import("@/pages/customer-service/warranty-management"));
const RMAPage = lazyPage(() => import("@/pages/customer-service/rma"));
const ComplaintsPage = lazyPage(() => import("@/pages/customer-service/complaints"));

const DowntimeTrackingPage = lazyPage(() => import("@/pages/operations/downtime-tracking"));
const OEEDashboardPage = lazyPage(() => import("@/pages/operations/oee-dashboard"));
const OperationsControlCenterPage = lazyPage(() => import("@/pages/operations-control-center"));

const BIHubPage = lazyPage(() => import("@/pages/bi/bi-hub"));
const CustomDashboardsPage = lazyPage(() => import("@/pages/bi/custom-dashboards"));
const DataExplorerPage = lazyPage(() => import("@/pages/bi/data-explorer"));
const ScheduledReportsPage = lazyPage(() => import("@/pages/bi/scheduled-reports"));
const ComparativeAnalyticsPage = lazyPage(() => import("@/pages/bi/comparative-analytics"));

const TendersManagementPage = lazyPage(() => import("@/pages/tenders/tenders-management"));
const BidAnalysisPage = lazyPage(() => import("@/pages/tenders/bid-analysis"));

const AccidentReportsPage = lazyPage(() => import("@/pages/safety/accident-reports"));
const SafetyProceduresPage = lazyPage(() => import("@/pages/safety/safety-procedures"));
const SafetyTrainingPage = lazyPage(() => import("@/pages/safety/safety-training"));
const SafetyManagementPage = lazyPage(() => import("@/pages/modules/safety-management"));

const FacilitiesPage = lazyPage(() => import("@/pages/installations/facilities"));
const InstallationsWorkPage = lazyPage(() => import("@/pages/installations/work"));
const InstallationAssetsPage = lazyPage(() => import("@/pages/installations/assets"));
const InstallationsCalendarPage = lazyPage(() => import("@/pages/installations/calendar"));
const InstallationsGpsMapPage = lazyPage(() => import("@/pages/installations/gps-map"));


const MeetingsCalendarPage = lazyPage(() => import("@/pages/meetings/meetings-calendar"));
const UserCalendarPage = lazyPage(() => import("@/pages/calendar/user-calendar"));
const ChatPage = lazyPage(() => import("@/pages/chat/chat-page"));

const CostCalculationsPage = lazyPage(() => import("@/pages/pricing/cost-calculations"));
const CollectionManagementPage = lazyPage(() => import("@/pages/pricing/collection-management"));
const PricingCostCalculatorPage = lazyPage(() => import("@/pages/pricing/pricing-cost-calculator"));
const PricingPriceListsPage = lazyPage(() => import("@/pages/pricing/price-lists-ent"));
const CollectionsManagerPage = lazyPage(() => import("@/pages/pricing/collections-manager"));
const PriceListsManagerPage = lazyPage(() => import("@/pages/pricing/price-lists-manager"));
const CostCalculatorPage = lazyPage(() => import("@/pages/pricing/cost-calculator"));

const ProductRoadmapPage = lazyPage(() => import("@/pages/product-dev/product-roadmap"));
const RDProjectsPage = lazyPage(() => import("@/pages/product-dev/rd-projects"));
const FeatureRequestsPage = lazyPage(() => import("@/pages/product-dev/feature-requests"));
const QATestingPage = lazyPage(() => import("@/pages/product-dev/qa-testing"));

const WarRoomPage = lazyPage(() => import("@/pages/executive/war-room"));
const OrderLifecyclePage = lazyPage(() => import("@/pages/executive/order-lifecycle"));
const CEODashboardPage = lazyPage(() => import("@/pages/executive/ceo-dashboard"));
const ExecutiveScorecardPage = lazyPage(() => import("@/pages/executive/executive-scorecard"));
const LiveOpsPage = lazyPage(() => import("@/pages/executive/live-ops"));
const CompanyHealthPage = lazyPage(() => import("@/pages/executive/company-health"));
const ExecutiveKPIBoardPage = lazyPage(() => import("@/pages/executive/executive-kpi-board"));
const LiveAlertsCenterPage = lazyPage(() => import("@/pages/executive/live-alerts-center"));
const FinancialRiskPage = lazyPage(() => import("@/pages/executive/financial-risk"));
const OperationalBottlenecksPage = lazyPage(() => import("@/pages/executive/operational-bottlenecks"));
const DelayedProjectsPage = lazyPage(() => import("@/pages/executive/delayed-projects"));
const ProductionEfficiencyPage = lazyPage(() => import("@/pages/executive/production-efficiency"));
const ExecutiveProfitabilityDashboardPage = lazyPage(() => import("@/pages/executive/profitability-dashboard"));
const WorkforceStatusPage = lazyPage(() => import("@/pages/executive/workforce-status"));
const DataFlowDashboardPage = lazyPage(() => import("@/pages/executive/data-flow-dashboard"));

const DocumentsPage = lazyPage(() => import("@/pages/modules/documents"));
const DigitalArchivePage = lazyPage(() => import("@/pages/documents/digital-archive"));
const DigitalSignaturesPage = lazyPage(() => import("@/pages/documents/digital-signatures"));
const QualityDocsPage = lazyPage(() => import("@/pages/documents/quality-docs"));
const DocumentsChecklistsPage = lazyPage(() => import("@/pages/documents/checklists"));
const SystemSpecPage = lazyPage(() => import("@/pages/documents/system-spec"));
const ArchiveFilesPage = lazyPage(() => import("@/pages/documents/archive-files"));
const CompanyReportPage = lazyPage(() => import("@/pages/documents/company-report"));
const TemplatesLibraryPage = lazyPage(() => import("@/pages/documents/templates-library"));
const DMSRepositoryPage = lazyPage(() => import("@/pages/documents/dms-repository"));
const AIDocumentProcessorPage = lazyPage(() => import("@/pages/modules/ai-document-processor"));

const MaintenanceManagementPage = lazyPage(() => import("@/pages/modules/maintenance-management"));
const MediaLibraryPage = lazyPage(() => import("@/pages/modules/media-library"));
const DataSenderPage = lazyPage(() => import("@/pages/modules/data-sender"));
const PriceHistoryPage = lazyPage(() => import("@/pages/modules/price-history"));

const PortalManagementPage = lazyPage(() => import("@/pages/portal/portal-management"));
const EmailMarketingPage = lazyPage(() => import("@/pages/marketing/email-marketing"));

const ProcurementRiskPage = lazyPage(() => import("@/pages/modules/procurement-risk-hedging"));
const DynamicPricingPage = lazyPage(() => import("@/pages/crm/dynamic-pricing"));
const DailyProfitabilityPage = lazyPage(() => import("@/pages/crm/daily-profitability"));
const DocumentControlPage = lazyPage(() => import("@/pages/modules/document-control"));


const ProcurementDashboardPage = lazyPage(() => import("@/pages/procurement"));
const PayrollStandalonePage = lazyPage(() => import("@/pages/payroll"));
const IntegrationsHubDataPage = lazyPage(() => import("@/pages/integrations-hub-data"));
const PricingPriceListsPage2 = lazyPage(() => import("@/pages/pricing/pricing-price-lists"));

export const OtherRoutes = (

    <>
      {/* Executive */}
      <Route path="/operations-control-center" component={OperationsControlCenterPage} />
      <Route path="/executive/war-room" component={WarRoomPage} />
      <Route path="/executive/order-lifecycle" component={OrderLifecyclePage} />
      <Route path="/executive/ceo-dashboard" component={CEODashboardPage} />
      <Route path="/executive/scorecard" component={ExecutiveScorecardPage} />
      <Route path="/executive/live-ops" component={LiveOpsPage} />
      <Route path="/executive/company-health" component={CompanyHealthPage} />
      <Route path="/executive/kpi-board" component={ExecutiveKPIBoardPage} />
      <Route path="/executive/live-alerts" component={LiveAlertsCenterPage} />
      <Route path="/executive/financial-risk" component={FinancialRiskPage} />
      <Route path="/executive/operational-bottlenecks" component={OperationalBottlenecksPage} />
      <Route path="/executive/delayed-projects" component={DelayedProjectsPage} />
      <Route path="/executive/procurement-risk" component={ProcurementRiskPage} />
      <Route path="/executive/production-efficiency" component={ProductionEfficiencyPage} />
      <Route path="/executive/profitability" component={ExecutiveProfitabilityDashboardPage} />
      <Route path="/executive/workforce-status" component={WorkforceStatusPage} />
      <Route path="/executive/profitability-dashboard"><Redirect to="/executive/profitability" /></Route>
      <Route path="/data-flow" component={DataFlowDashboardPage} />

      {/* Reports */}
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
      <Route path="/reports/bi/financial-statements" component={BIFinancialStatements} />
      <Route path="/reports/bi/sales" component={BISalesAnalytics} />
      <Route path="/reports/bi/production" component={BIProductionAnalytics} />
      <Route path="/reports/bi/inventory" component={BIInventoryAnalytics} />
      <Route path="/reports/bi/hr" component={BIHRAnalytics} />

      {/* Projects */}
      <Route path="/projects/dashboard" component={ProjectsDashboard} />
      <Route path="/projects/tasks" component={ProjectTasksPage} />
      <Route path="/projects/gantt" component={GanttChartPage} />
      <Route path="/projects/milestones" component={MilestonesPage} />
      <Route path="/projects/subcontractors" component={SubcontractorsPage} />
      <Route path="/projects/real-estate/kiryati10" component={Kiryati10Page} />
      <Route path="/projects/real-estate/units" component={REUnitsPage} />
      <Route path="/projects/real-estate/permits" component={REPermitsPage} />
      <Route path="/projects/real-estate/contractors" component={REContractorsPage} />
      <Route path="/projects/resources" component={ResourcesPage} />
      <Route path="/projects/budget" component={ProjectBudgetPage} />
      <Route path="/projects/risks" component={RiskRegisterPage} />
      <Route path="/projects/risk-dashboard" component={RiskDashboardPage} />
      <Route path="/projects/change-orders" component={ChangeOrdersPage} />
      <Route path="/projects/documents" component={ProjectDocumentsPage} />
      <Route path="/projects/templates" component={ProjectTemplatesPage} />
      <Route path="/projects/timesheets" component={TimesheetsPage} />
      <Route path="/projects/portfolio" component={PortfolioDashboardPage} />
      <Route path="/projects/portal" component={ProjectPortalPage} />
      <Route path="/projects/earned-value" component={EarnedValuePage} />
      <Route path="/projects/resource-planning" component={ResourcePlanningPage} />
      <Route path="/projects/risk-register" component={RiskRegisterProjectPage} />
      <Route path="/projects/customer-portal" component={CustomerProjectPortalPage} />
      <Route path="/projects"><Redirect to="/projects/dashboard" /></Route>

      {/* Strategy */}
      <Route path="/strategy/goals" component={GoalsPage} />
      <Route path="/strategy/swot" component={SwotPage} />
      <Route path="/strategy/planning" component={StrategicPlanningPage} />
      <Route path="/strategy/market-analysis" component={MarketAnalysisPage} />
      <Route path="/strategy/okrs" component={OKRsPage} />
      <Route path="/strategy/balanced-scorecard" component={BalancedScorecardPage} />
      <Route path="/strategy/competitive-analysis" component={CompetitiveAnalysisPage} />
      <Route path="/strategy/business-plan" component={BusinessPlanPage} />

      {/* Marketing */}
      <Route path="/marketing" component={MarketingHubPage} />
      <Route path="/marketing/hub" component={MarketingHubPage} />
      <Route path="/marketing/integrations" component={MarketingIntegrationsPage} />
      <Route path="/marketing/analytics" component={MarketingAnalyticsPage} />
      <Route path="/marketing/campaigns" component={CampaignsPage} />
      <Route path="/marketing/content-calendar" component={ContentCalendarPage} />
      <Route path="/marketing/social-media" component={SocialMediaPage} />
      <Route path="/marketing/email-campaigns" component={EmailCampaignsPage} />
      <Route path="/marketing/budget" component={MarketingBudgetPage} />

      {/* Quality */}
      <Route path="/quality" component={QualityDashboardPage} />
      <Route path="/quality/iso" component={ISOManagementPage} />
      <Route path="/quality/document-control" component={QualityDocumentControlPage} />
      <Route path="/quality/documents" component={QualityDocumentControlPage} />
      <Route path="/quality/calibration" component={CalibrationPage} />
      <Route path="/quality/capa" component={CAPAPage} />
      <Route path="/quality/internal-audit" component={InternalAuditPage} />
      <Route path="/quality/testing-lab" component={TestingLabPage} />
      <Route path="/quality/spc" component={SPCPage} />
      <Route path="/quality/test-certificates" component={TestCertificatesPage} />
      <Route path="/quality/material-certs" component={MaterialCertsPage} />
      <Route path="/quality/supplier-quality" component={SupplierQualityPage} />
      <Route path="/quality/complaints" component={QualityComplaintsPage} />

      {/* Logistics */}
      <Route path="/logistics" component={LogisticsDashboardPage} />
      <Route path="/logistics/fleet" component={FleetManagementPage} />
      <Route path="/logistics/routes" component={RoutePlanningPage} />
      <Route path="/logistics/delivery-scheduling" component={DeliverySchedulingPage} />
      <Route path="/logistics/packaging" component={PackagingPage} />
      <Route path="/logistics/barcode-rfid" component={BarcodeRFIDPage} />
      <Route path="/logistics/freight" component={FreightPage} />
      <Route path="/logistics/loading-dock" component={LoadingDockPage} />
      <Route path="/logistics/cross-border" component={CrossBorderPage} />
      <Route path="/logistics/freight-audit" component={FreightAuditPage} />
      <Route path="/logistics/tracking" component={ShipmentTrackingLivePage} />
      <Route path="/logistics/shipment-tracking-live" component={ShipmentTrackingLivePage} />
      <Route path="/logistics/proof-of-delivery" component={ProofOfDeliveryPage} />
      <Route path="/logistics/returns" component={ReverseLogisticsPage} />
      <Route path="/logistics/reverse-logistics" component={ReverseLogisticsPage} />
      <Route path="/installations/gps-map" component={InstallationsGpsMapPage} />
      <Route path="/logistics/customer-tracking-portal" component={CustomerTrackingPortalPage} />
      <Route path="/logistics/track/:token" component={CustomerTrackingPortalPage} />

      {/* EHS */}
      <Route path="/ehs" component={EHSDashboardPage} />
      <Route path="/ehs/hazardous-materials" component={HazardousMaterialsPage} />
      <Route path="/ehs/waste" component={WasteManagementPage} />
      <Route path="/ehs/environmental-permits" component={EnvironmentalPermitsPage} />
      <Route path="/ehs/incidents" component={SafetyIncidentsPage} />
      <Route path="/ehs/ppe" component={PPEManagementPage} />
      <Route path="/ehs/work-permits" component={WorkPermitsPage} />
      <Route path="/ehs/energy" component={EnergyManagementPage} />
      <Route path="/ehs/risk-assessment" component={HSERiskAssessmentPage} />
      <Route path="/ehs/safety-training-certs" component={HSESafetyTrainingCertsPage} />
      <Route path="/ehs/safety-inspections" component={HSESafetyInspectionsPage} />
      <Route path="/ehs/emergency-preparedness" component={EmergencyPreparednessPage} />
      <Route path="/ehs/israeli-regulatory" component={IsraeliRegulatoryPage} />
      <Route path="/ehs/annual-report" component={AnnualSafetyReportPage} />

      {/* Assets */}
      <Route path="/assets" component={AssetsDashboardPage} />
      <Route path="/assets/management" component={AssetManagementPage} />
      <Route path="/assets/tools-dies" component={ToolsDiesPage} />
      <Route path="/assets/leasing" component={LeasingPage} />
      <Route path="/assets/insurance" component={EquipmentInsurancePage} />

      {/* Knowledge */}
      <Route path="/knowledge" component={KnowledgeBasePage} />
      <Route path="/knowledge/sop" component={SOPProceduresPage} />
      <Route path="/knowledge/lessons" component={LessonsLearnedPage} />

      {/* Contracts */}
      <Route path="/contracts" component={ContractsDashboardPage} />
      <Route path="/contracts/service-agreements" component={ServiceAgreementsPage} />
      <Route path="/contracts/nda" component={NDAAgreementsPage} />
      <Route path="/contracts/templates" component={ContractTemplatesPage} />
      <Route path="/contracts/risk-scoring" component={ContractRiskScoringPage} />
      <Route path="/contracts/analytics" component={ContractAnalyticsDashboardPage} />
      <Route path="/contracts/ai-analysis" component={ContractAIAnalysisPage} />
      <Route path="/documents/contracts" component={DocumentsContractsPage} />

      {/* Customer Service */}
      <Route path="/customer-service/warranty" component={WarrantyMgmtPage} />
      <Route path="/customer-service/rma" component={RMAPage} />
      <Route path="/customer-service/complaints" component={ComplaintsPage} />

      {/* Operations (shift-handover & cost-per-unit in production-routes.tsx) */}
      <Route path="/operations/downtime" component={DowntimeTrackingPage} />
      <Route path="/operations/oee" component={OEEDashboardPage} />
      <Route path="/operations/media-library" component={MediaLibraryPage} />
      <Route path="/operations/data-sender" component={DataSenderPage} />

      {/* BI */}
      <Route path="/bi" component={BIHubPage} />
      <Route path="/bi/custom-dashboards" component={CustomDashboardsPage} />
      <Route path="/bi/data-explorer" component={DataExplorerPage} />
      <Route path="/bi/scheduled-reports" component={ScheduledReportsPage} />
      <Route path="/bi/comparative-analytics" component={ComparativeAnalyticsPage} />

      {/* Tenders */}
      <Route path="/tenders" component={TendersManagementPage} />
      <Route path="/tenders/bid-analysis" component={BidAnalysisPage} />

      {/* Safety */}
      <Route path="/safety" component={SafetyManagementPage} />
      <Route path="/safety/procedures" component={SafetyProceduresPage} />
      <Route path="/safety/accident-reports" component={AccidentReportsPage} />
      <Route path="/safety/training" component={SafetyTrainingPage} />
      <Route path="/safety-management"><Redirect to="/safety" /></Route>

      {/* Installations */}
      <Route path="/installations/facilities" component={FacilitiesPage} />
      <Route path="/installations/work" component={InstallationsWorkPage} />
      <Route path="/installations/assets" component={InstallationAssetsPage} />
      <Route path="/installations/calendar" component={InstallationsCalendarPage} />
      <Route path="/installations/gps-map" component={InstallationsGpsMapPage} />

      {/* Fabrication — all routes in production-routes.tsx */}

      {/* Pricing */}
      <Route path="/pricing/price-lists-ent" component={PricingPriceListsPage} />
      <Route path="/pricing/price-lists"><Redirect to="/pricing/price-lists-ent" /></Route>
      <Route path="/pricing/cost-calculator" component={PricingCostCalculatorPage} />
      <Route path="/pricing/collection-management" component={CollectionManagementPage} />
      <Route path="/pricing/collections"><Redirect to="/pricing/collection-management" /></Route>
      <Route path="/pricing/cost-calculations" component={CostCalculationsPage} />
      <Route path="/pricing/collections-manager" component={CollectionsManagerPage} />
      <Route path="/pricing/price-lists-manager" component={PriceListsManagerPage} />
      <Route path="/pricing/price-history" component={PriceHistoryPage} />
      <Route path="/pricing/cost-calc-detailed" component={CostCalculatorPage} />
      <Route path="/pricing/cost-calc" component={PricingCostCalculatorPage} />
      <Route path="/pricing/dynamic" component={DynamicPricingPage} />
      <Route path="/pricing/daily-profit" component={DailyProfitabilityPage} />

      {/* Product Dev */}
      <Route path="/product-dev/roadmap" component={ProductRoadmapPage} />
      <Route path="/product-dev/rd-projects" component={RDProjectsPage} />
      <Route path="/product-dev/feature-requests" component={FeatureRequestsPage} />
      <Route path="/product-dev/qa-testing" component={QATestingPage} />

      {/* Calendar / Chat */}
      <Route path="/meetings" component={MeetingsCalendarPage} />
      <Route path="/calendar" component={UserCalendarPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/chat/chat-page" component={ChatPage} />

      {/* Documents */}
      <Route path="/documents" component={DocumentsPage} />
      <Route path="/documents/upload" component={AIDocumentProcessorPage} />
      <Route path="/documents/digital-archive" component={DigitalArchivePage} />
      <Route path="/documents/digital-signatures" component={DigitalSignaturesPage} />
      <Route path="/documents/quality-docs" component={QualityDocsPage} />
      <Route path="/documents/checklists" component={DocumentsChecklistsPage} />
      <Route path="/documents/system-spec" component={SystemSpecPage} />
      <Route path="/documents/archive-files" component={ArchiveFilesPage} />
      <Route path="/documents/company-report" component={CompanyReportPage} />
      <Route path="/documents/templates" component={TemplatesLibraryPage} />
      <Route path="/documents/dms" component={DMSRepositoryPage} />

      {/* Portal */}
      <Route path="/portal-management" component={PortalManagementPage} />

      {/* Maintenance */}
      <Route path="/maintenance" component={MaintenanceManagementPage} />

      {/* Supplier Management & Supply Chain / EDI — all routes in procurement-routes.tsx */}

      {/* Procurement */}
      <Route path="/procurement" component={ProcurementDashboardPage} />

      {/* Payroll standalone */}
      <Route path="/payroll" component={PayrollStandalonePage} />

      {/* Integrations Data */}
      <Route path="/integrations-hub-data" component={IntegrationsHubDataPage} />

      {/* Pricing */}
      <Route path="/pricing/pricing-price-lists" component={PricingPriceListsPage2} />

      {/* Marketing extra */}
      <Route path="/marketing/email-marketing" component={EmailMarketingPage} />

    </>
);
