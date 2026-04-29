import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardStatsRouter from "./dashboard-stats";
import aiProvidersRouter from "./ai-providers";
import aiModelsRouter from "./ai-models";
import aiApiKeysRouter from "./ai-api-keys";
import aiUsageLogsRouter from "./ai-usage-logs";
import aiQueriesRouter from "./ai-queries";
import aiResponsesRouter from "./ai-responses";
import aiRecommendationsRouter from "./ai-recommendations";
import aiPermissionsRouter from "./ai-permissions";
import aiPromptTemplatesRouter from "./ai-prompt-templates";
import notificationsRouter from "./notifications";
import platformRouter from "./platform";
import claudeRouter from "./claude";
import suppliersRouter from "./suppliers";
import supplierDetailsRouter from "./supplier-details";
import rawMaterialsRouter from "./raw-materials";
import purchaseRequestsRouter from "./purchase-requests";
import purchaseOrdersRouter from "./purchase-orders";
import goodsReceiptsRouter from "./goods-receipts";
import priceHistoryRouter from "./price-history";
import priceQuotesRouter from "./price-quotes";
import authRouter from "./auth";
import financeRouter from "./finance";
import hrRouter from "./hr";
import crmRouter from "./crm";
import crmSeedRouter from "./crm-seed";
import integrationsRouter from "./integrations";
import projectAnalysesRouter from "./project-analyses";
import reportsCenterRouter from "./reports-center";
import purchaseMigrationRouter from "./platform/purchase-migration";
import supplierEvaluationsRouter from "./supplier-evaluations";
import purchaseReturnsRouter from "./purchase-returns";
import supplierContractsRouter from "./supplier-contracts";
import budgetsRouter from "./budgets";
import importOrdersRouter from "./import-orders";
import customsClearancesRouter from "./customs-clearances";
import shipmentTrackingRouter from "./shipment-tracking";
import foreignSuppliersRouter from "./foreign-suppliers";
import lettersOfCreditRouter from "./letters-of-credit";
import importCostCalculationsRouter from "./import-cost-calculations";
import complianceCertificatesRouter from "./compliance-certificates";
import exchangeRatesRouter from "./exchange-rates";
import financeEnterpriseRouter from "./finance-enterprise";
import hrEnterpriseRouter from "./hr-enterprise";
import productionEnterpriseRouter from "./production-enterprise";
import maintenanceEnterpriseRouter from "./maintenance-enterprise";
import financeEnterprise2Router from "./finance-enterprise2";
import financeEnterprise3Router from "./finance-enterprise3";
import chartOfAccountsRouter from "./chart-of-accounts";
import apEnterpriseRouter from "./ap-enterprise";
import arEnterpriseRouter from "./ar-enterprise";
import crmEnterpriseRouter from "./crm-enterprise";
import chatRouter from "./chat";
import financeAccountingRouter from "./finance-accounting";
import marketingEnterpriseRouter from "./marketing-enterprise";
import productDevEnterpriseRouter from "./product-dev-enterprise";
import productionEnterprise2Router from "./production-enterprise2";
import pricingEnterpriseRouter from "./pricing-enterprise";
import salesPricingEnterpriseRouter from "./sales-pricing-enterprise";
import projectsModuleRouter from "./projects-module";
import projectResourcesBudgetRouter from "./project-resources-budget";
import projectRisksTimesheetsRouter from "./project-risks-timesheets";
import strategyModuleRouter from "./strategy-module";
import marketingModuleRouter from "./marketing-module";
import externalPortalRouter from "./external-portal";
import externalApiRouter from "./external-api";
import productionProductDevRouter from "./production-product-dev";
import financeEnterprise4Router from "./finance-enterprise4";
import supplierCommunicationsRouter from "./supplier-communications";
import businessAnalyticsRouter from "./business-analytics";
import productCatalogRouter from "./product-catalog";
import calendarRouter from "./calendar";
import workforceAnalysisRouter from "./workforce-analysis";
import documentsRouter from "./documents";
import financeNewPagesRouter from "./finance-new-pages";
import marketingSyncRouter from "./marketing-sync";
import crmNewCapabilitiesRouter from "./crm-new-capabilities";
import aiDocumentProcessorRouter from "./ai-document-processor";
import financeCustomersSuppliersRouter from "./finance-customers-suppliers";
import financeControlRouter from "./finance-control";
import dataFlowAutomationsRouter from "./data-flow-automations";
import kimiRouter from "./kimi";
import n8nIntegrationsRouter from "./n8n-integrations";
import payrollModuleRouter from "./payroll-module";
import globalSearchRouter from "./global-search";
import auditLogRouter from "./audit-log";
import dashboardKpiRouter from "./dashboard-kpi";
import escalationRouter from "./escalation";
import aiSmartAlertsRouter from "./ai-smart-alerts";
import aiOperationsRouter from "./ai-operations";
import investmentPortfolioRouter from "./investment-portfolio";
import fieldMeasurementsRouter from "./field-measurements";
import routeAliasesRouter from "./route-aliases";
import crmAnalyticsSyncRouter from "./crm-analytics-sync";
import executiveWarRoomRouter from "./executive-war-room";
import executiveControlRouter from "./executive-control";
import modulePathAliasesRouter from "./module-path-aliases";
import fabricationCatalogRouter from "./fabrication-catalog";
import fabricationProductionRouter from "./fabrication-production";
import fabricationLogisticsRouter from "./fabrication-logistics";
import inventoryWarehouseRouter from "./inventory-warehouse";
import deliveryReturnsRouter from "./delivery-returns";
import productionGapsRouter from "./production-gaps";
import installationsModuleRouter from "./installations-module";
import aiGapsRouter from "./ai-gaps";
import dataFlowSystemRouter from "./data-flow-system";
import builderSeedRouter from "./builder-seed";
import missingEntitiesRouter from "./missing-entities";
import entityCrudRouter from "./entity-crud-registry";
import aiDataFlowRouter from "./ai-data-flow";
import dedicatedEntityRoutes from "./dedicated-entity-routes";
import factorySeedRouter from "./factory-seed";
import taskChallengesRouter from "./task-challenges";
import kobiRouter from "./kobi";
import superAgentRouter from "./super-agent";
import liveOpsRouter from "./live-ops";
import analyticsEngineRouter from "./analytics-engine";
import cmmsRouter from "./cmms";
import settingsRouter from "./settings";
import productsRouter from "./products";
// DEDUPED 2026-04-18: raw_materials / purchase_orders / purchase_requests / goods_receipts
// removed — canonical kebab-case versions already imported above (see lines ~18-21).
import warehousesRouter from "./warehouses";
import stock_countsRouter from "./stock_counts";
import stock_movementsRouter from "./stock_movements";
import purchase_order_itemsRouter from "./purchase_order_items";
import commercialRouter from "./commercial";
import procurementRouter from "./procurement";
import inventoryDomainRouter from "./inventory";
import executionRouter from "./execution";
import financeV2Router from "./finance/index";
import governanceRouter from "./governance";
import docsRouter from "./docs";
import intelligenceRouter from "./intelligence";
import analyticsRouter from "./analytics";
import commsRouter from "./comms";
import orchestrationRouter from "./orchestration";
import workforceRouter from "./workforce";

const router: IRouter = Router();

router.use("/commercial", commercialRouter);
router.use("/execution", executionRouter);
router.use("/procurement", procurementRouter);
router.use("/inventory", inventoryDomainRouter);
router.use("/docs", docsRouter);
router.use("/governance", governanceRouter);
router.use("/intelligence", intelligenceRouter);
router.use("/analytics", analyticsRouter);
router.use("/comms", commsRouter);
router.use("/orchestration", orchestrationRouter);
router.use("/workforce", workforceRouter);
router.use(healthRouter);
router.use(dashboardStatsRouter);
router.use(dedicatedEntityRoutes);
router.use(externalPortalRouter);
router.use(externalApiRouter);
router.use(aiProvidersRouter);
router.use(aiModelsRouter);
router.use(aiApiKeysRouter);
router.use(aiUsageLogsRouter);
router.use(aiQueriesRouter);
router.use(aiResponsesRouter);
router.use(aiRecommendationsRouter);
router.use(aiPermissionsRouter);
router.use(aiPromptTemplatesRouter);
router.use(notificationsRouter);
router.use(platformRouter);
router.use(claudeRouter);
router.use(suppliersRouter);
router.use(supplierDetailsRouter);
router.use(rawMaterialsRouter);
router.use(purchaseRequestsRouter);
router.use(purchaseOrdersRouter);
router.use(goodsReceiptsRouter);
router.use(priceHistoryRouter);
router.use(priceQuotesRouter);
router.use(authRouter);
router.use(kimiRouter);
router.use(financeRouter);
router.use(hrRouter);
router.use(crmRouter);
router.use(crmSeedRouter);
router.use(integrationsRouter);
router.use(projectAnalysesRouter);
router.use(reportsCenterRouter);
router.use(purchaseMigrationRouter);
router.use(supplierEvaluationsRouter);
router.use(purchaseReturnsRouter);
router.use(supplierContractsRouter);
router.use(budgetsRouter);
router.use(importOrdersRouter);
router.use(customsClearancesRouter);
router.use(shipmentTrackingRouter);
router.use(foreignSuppliersRouter);
router.use(lettersOfCreditRouter);
router.use(importCostCalculationsRouter);
router.use(complianceCertificatesRouter);
router.use(exchangeRatesRouter);
router.use(financeEnterpriseRouter);
router.use(hrEnterpriseRouter);
router.use(productionEnterpriseRouter);
router.use(maintenanceEnterpriseRouter);
router.use(financeEnterprise2Router);
router.use(financeEnterprise3Router);
router.use(chartOfAccountsRouter);
router.use(apEnterpriseRouter);
router.use(arEnterpriseRouter);
router.use(crmEnterpriseRouter);
router.use(chatRouter);
router.use(financeAccountingRouter);
router.use(marketingEnterpriseRouter);
router.use(productDevEnterpriseRouter);
router.use(productionEnterprise2Router);
router.use(pricingEnterpriseRouter);
router.use(salesPricingEnterpriseRouter);
router.use(projectsModuleRouter);
router.use(projectResourcesBudgetRouter);
router.use(projectRisksTimesheetsRouter);
router.use(strategyModuleRouter);
router.use(marketingModuleRouter);
router.use(productionProductDevRouter);
router.use(financeEnterprise4Router);
router.use(supplierCommunicationsRouter);
router.use(businessAnalyticsRouter);
router.use(productCatalogRouter);
router.use(calendarRouter);
router.use(workforceAnalysisRouter);
router.use(documentsRouter);
router.use(financeNewPagesRouter);
router.use(marketingSyncRouter);
router.use(crmNewCapabilitiesRouter);
router.use(aiDocumentProcessorRouter);
router.use(financeCustomersSuppliersRouter);
router.use(financeControlRouter);
router.use(dataFlowAutomationsRouter);
router.use(n8nIntegrationsRouter);
router.use(payrollModuleRouter);
router.use(globalSearchRouter);
router.use(auditLogRouter);
router.use(dashboardKpiRouter);
router.use(escalationRouter);
router.use(aiSmartAlertsRouter);
router.use("/ai-ops", aiOperationsRouter);
router.use(investmentPortfolioRouter);
router.use(fieldMeasurementsRouter);
router.use(routeAliasesRouter);
router.use(crmAnalyticsSyncRouter);
router.use(executiveWarRoomRouter);
router.use(executiveControlRouter);
router.use(entityCrudRouter);
router.use(modulePathAliasesRouter);
router.use(fabricationCatalogRouter);
router.use(fabricationProductionRouter);
router.use(fabricationLogisticsRouter);
router.use(inventoryWarehouseRouter);
router.use(deliveryReturnsRouter);
router.use(productionGapsRouter);
router.use(installationsModuleRouter);
router.use(aiGapsRouter);
router.use(dataFlowSystemRouter);
router.use(builderSeedRouter);
router.use(missingEntitiesRouter);
router.use(aiDataFlowRouter);
router.use(factorySeedRouter);
router.use(taskChallengesRouter);
router.use(kobiRouter);
router.use(superAgentRouter);
router.use(liveOpsRouter);
router.use(analyticsEngineRouter);
router.use(cmmsRouter);
router.use(settingsRouter);

router.use(productsRouter);

// DEDUPED 2026-04-18: raw_materialsRouter / purchase_ordersRouter / purchase_requestsRouter / goods_receiptsRouter
// removed — canonical kebab-case routers already mounted above.
router.use(warehousesRouter);

router.use(stock_countsRouter);

router.use(stock_movementsRouter);

router.use(purchase_order_itemsRouter);

// ============================================================
// SAP-Level Upgrade Routes (Wave 1-4)
// ============================================================
import vectorSearchRouter from "./vector-search";
import aiAutonomousAgentRouter from "./ai-autonomous-agent";
import multimodalRouter from "./multimodal";
import metricsRouter from "./metrics";
import hrSapUpgradeRouter from "./hr-sap-upgrade";
import financeSapUpgradeRouter from "./finance-sap-upgrade";
import productionSapUpgradeRouter from "./production-sap-upgrade";
import crmSapUpgradeRouter from "./crm-sap-upgrade";
import procurementSapUpgradeRouter from "./procurement-sap-upgrade";
import projectsSapUpgradeRouter from "./projects-sap-upgrade";

// Vector Search & RAG
router.use("/vector", vectorSearchRouter);

// AI Autonomous Agent
router.use("/ai-agent", aiAutonomousAgentRouter);

// Multi-Modal AI (Vision, Voice, OCR)
router.use("/multimodal", multimodalRouter);

// Metrics & Monitoring
router.use("/metrics", metricsRouter);

// CRM Ultimate
import crmUltimateRouter from "./crm-ultimate";
router.use("/crm-ultimate", crmUltimateRouter);

// System Settings, Automations, Permissions
import systemSettingsUpgradeRouter from "./system-settings-upgrade";
router.use("/system-upgrade", systemSettingsUpgradeRouter);

// Employee Value & Payroll Engine
import employeeValueRouter from "./employee-value-engine";
router.use("/employee-value-engine", employeeValueRouter);

// Measurement Comparison & Project Approvals
import measurementApprovalRouter from "./measurement-approval-engine";
router.use("/measurements", measurementApprovalRouter);

// Product Catalog & Quote Engine
import productQuoteRouter from "./product-quote-engine";
router.use("/product-engine", productQuoteRouter);

// Communication & Marketing
import communicationMarketingRouter from "./communication-marketing-engine";
router.use("/communication", communicationMarketingRouter);

// TechnoKolUzi AI Data Flow Engine
import aiEngineRoutesRouter from "./ai-engine-routes";
router.use("/ai-engine", aiEngineRoutesRouter);

// Oracle-Level Financial Core (GL, AP, AR, Cash, Assets)
import oracleFinancialRouter from "./oracle-financial-core";
router.use("/financial-core", oracleFinancialRouter);

// CEO Control Tower
import ceoControlTowerRouter from "./ceo-control-tower";
router.use("/ceo-tower", ceoControlTowerRouter);

// Import & Customs Management
import importManagementRouter from "./import-management-engine";
router.use("/import-management", importManagementRouter);

// Israeli Accounting
import israeliAccountingRouter from "./israeli-accounting-engine";
router.use("/accounting-il", israeliAccountingRouter);

// Risk Management & Monte Carlo
import riskMonteCarloRouter from "./risk-monte-carlo-engine";
router.use("/risk-engine", riskMonteCarloRouter);

// Marketing Automation
import marketingAutomationRouter from "./marketing-automation-engine";
router.use("/marketing-automation", marketingAutomationRouter);

// Strategy & Growth
import strategyGrowthRouter from "./strategy-growth-engine";
router.use("/strategy-growth", strategyGrowthRouter);

// Asset & Tools Management
import assetToolsRouter from "./asset-tools-management";
router.use("/asset-management", assetToolsRouter);

// Supply Chain Lifecycle - שרשרת אספקה מלאה מסגירת עסקה עד התקנה
import supplyChainLifecycleRouter from "./supply-chain-lifecycle-engine";
router.use("/supply-chain", supplyChainLifecycleRouter);

// Digital Contracts & Signatures - חוזים וחתימות דיגיטליות
import digitalContractsRouter from "./digital-contracts-signatures-engine";
router.use("/digital-contracts", digitalContractsRouter);

// AI Document Intelligence - מנוע מסמכים חכם
import aiDocumentIntelligenceRouter from "./ai-document-intelligence-engine";
router.use("/ai-documents", aiDocumentIntelligenceRouter);

// Attendance & Payroll - נוכחות ושכר
import attendancePayrollRouter from "./attendance-payroll-engine";
router.use("/attendance-payroll", attendancePayrollRouter);

// Real-time Company Financials - מצב פיננסי בזמן אמת
import realtimeFinancialsRouter from "./realtime-financials-engine";
router.use("/realtime-financials", realtimeFinancialsRouter);

// Field Agent GPS & Analytics - ניתוח סוכני שטח
import fieldAgentAnalyticsRouter from "./field-agent-analytics-engine";
router.use("/field-agents", fieldAgentAnalyticsRouter);

// Installer Management - ניהול מתקינים
import installerManagementRouter from "./installer-management-engine";
router.use("/installers", installerManagementRouter);

// Measurement Engineers - ניהול מהנדסי מדידות
import measurementEngineerRouter from "./measurement-engineer-engine";
router.use("/measurements", measurementEngineerRouter);

// Employee Portfolio - תיק עובד מלא
import employeePortfolioRouter from "./employee-portfolio-engine";
router.use("/employee-portfolio", employeePortfolioRouter);

// Project Costing - תמכור פרויקטים
import projectCostingRouter from "./project-costing-engine";
router.use("/project-costing", projectCostingRouter);

// Commission Calculator - חישוב עמלות
import commissionCalculatorRouter from "./commission-calculator-engine";
router.use("/commissions", commissionCalculatorRouter);

// Quality Control - בקרת איכות
import qualityControlRouter from "./quality-control-engine";
router.use("/quality-control", qualityControlRouter);

// Payroll Engine - חישוב משכורות ישראלי
import payrollEngineRouter from "./payroll-engine";
router.use("/payroll-engine", payrollEngineRouter);

// BOM Product Engine - עץ מוצר ותמכור
import bomProductRouter from "./bom-product-engine";
router.use("/bom", bomProductRouter);

// Lead Scoring & Agent Analytics - ניקוד לידים וניתוח סוכנים
import leadScoringRouter from "./lead-scoring-agent-analytics-engine";
router.use("/lead-scoring", leadScoringRouter);

// WhatsApp AI - בינה מלאכותית לוואטסאפ
import whatsappAiRouter from "./whatsapp-ai-engine";
router.use("/whatsapp-ai", whatsappAiRouter);

// Customer Service AI - שירות לקוחות חכם
import customerServiceAiRouter from "./customer-service-ai-engine";
router.use("/customer-service", customerServiceAiRouter);

// Contractor Smart Payment - תשלומים חכמים לקבלנים
import contractorPaymentRouter from "./contractor-payment-engine";
router.use("/contractor-payments", contractorPaymentRouter);

// Digital Contracts & Signatures v2 - חוזים וחתימות
import digitalContractsV2Router from "./digital-contracts-engine";
router.use("/contracts", digitalContractsV2Router);

// Attendance & Leave - נוכחות וחופשות
import attendanceLeaveRouter from "./attendance-leave-engine";
router.use("/attendance", attendanceLeaveRouter);

// Company Financials Real-time - מצב פיננסי בזמן אמת
import companyFinancialsRouter from "./company-financials-realtime-engine";
router.use("/company-financials", companyFinancialsRouter);

// SAP Module Upgrades
router.use("/hr-sap", hrSapUpgradeRouter);
router.use("/finance-sap", financeSapUpgradeRouter);
router.use("/production-sap", productionSapUpgradeRouter);
router.use("/crm-sap", crmSapUpgradeRouter);
router.use("/procurement-sap", procurementSapUpgradeRouter);
router.use("/projects-sap", projectsSapUpgradeRouter);

// Enterprise Gap Modules (SAP-Level)
import revenueRecognitionRouter from "./revenue-recognition";
router.use("/revenue-recognition", revenueRecognitionRouter);

import engineeringChangeRouter from "./engineering-change";
router.use("/engineering-change", engineeringChangeRouter);

import slaManagementRouter from "./sla-management";
router.use("/sla-management", slaManagementRouter);

import intercompanyRouter from "./intercompany";
router.use("/intercompany", intercompanyRouter);

import warrantyManagementRouter from "./warranty-management";
router.use("/warranty-management", warrantyManagementRouter);

import multiSiteRouter from "./multi-site";
router.use("/multi-site", multiSiteRouter);

// Enterprise Platform Engines (Wave 2)
import knowledgeGraphRouter from "./knowledge-graph";
router.use("/knowledge-graph", knowledgeGraphRouter);

import digitalTwinRouter from "./digital-twin";
router.use("/digital-twin", digitalTwinRouter);

import cpqEngineRouter from "./cpq-engine";
router.use("/cpq", cpqEngineRouter);

import threeWayMatchRouter from "./three-way-match";
router.use("/three-way-match", threeWayMatchRouter);

import dispatchPlanningRouter from "./dispatch-planning";
router.use("/dispatch", dispatchPlanningRouter);

import variationOrdersRouter from "./variation-orders";
router.use("/variation-orders", variationOrdersRouter);

// Closure — Final stage of Master Flow (Lead → ... → Closure)
import closureRouter from "./closure";
router.use(closureRouter);

import featureFlagsRouter from "./feature-flags";
router.use("/feature-flags", featureFlagsRouter);

import importStagingRouter from "./import-staging";
router.use("/import-staging", importStagingRouter);

import duplicateResolutionRouter from "./duplicate-resolution";
router.use("/duplicates", duplicateResolutionRouter);

import metricDictionaryRouter from "./metric-dictionary";
router.use("/metric-dictionary", metricDictionaryRouter);

import agentOrchestrationRouter from "./agent-orchestration";
router.use("/agents", agentOrchestrationRouter);

import cutNestingRouter from "./cut-nesting";
router.use("/cut-nesting", cutNestingRouter);

import remnantManagementRouter from "./remnant-management";
router.use("/remnants", remnantManagementRouter);

// World-Class Enterprise Engines (Wave 3)
import predictiveAnalyticsRouter from "./predictive-analytics-engine";
router.use("/predictions", predictiveAnalyticsRouter);

import realtimeCollaborationRouter from "./realtime-collaboration";
router.use("/collaboration", realtimeCollaborationRouter);

import esgSustainabilityRouter from "./esg-sustainability";
router.use("/esg", esgSustainabilityRouter);

import supplyChainTraceabilityRouter from "./supply-chain-traceability";
router.use("/traceability", supplyChainTraceabilityRouter);

import optimizationLabRouter from "./optimization-lab";
router.use("/optimization", optimizationLabRouter);

import iotSensorHubRouter from "./iot-sensor-hub";
router.use("/iot", iotSensorHubRouter);

import customerExperienceRouter from "./customer-experience";
router.use("/cem", customerExperienceRouter);

import documentIntelligenceRouter from "./document-intelligence";
router.use("/doc-intel", documentIntelligenceRouter);

import riskManagementCenterRouter from "./risk-management-center";
router.use("/risk", riskManagementCenterRouter);

import intelligentNotificationsRouter from "./intelligent-notifications";
router.use("/smart-notifications", intelligentNotificationsRouter);

import processMiningRouter from "./process-mining";
router.use("/process-mining", processMiningRouter);

import capacityPlanningRouter from "./capacity-planning";
router.use("/capacity", capacityPlanningRouter);

import contractIntelligenceRouter from "./contract-intelligence";
router.use("/contract-intel", contractIntelligenceRouter);

import performanceOkrRouter from "./performance-okr";
router.use("/performance-okr", performanceOkrRouter);

import vmiConsignmentRouter from "./vmi-consignment";
router.use("/vmi", vmiConsignmentRouter);

// Metal Factory Specific Modules (Wave 4)
import supplyChainWorkflowRouter from "./supply-chain-workflow";
router.use("/supply-chain-workflow", supplyChainWorkflowRouter);

import employeeValueAnalysisRouter from "./employee-value-analysis";
router.use("/employee-value", employeeValueAnalysisRouter);

import projectCostCalculatorRouter from "./project-cost-calculator";
router.use("/project-cost", projectCostCalculatorRouter);

import agentPerformanceRouter from "./agent-performance";
router.use("/agent-performance", agentPerformanceRouter);

import measurementComparisonRouter from "./measurement-comparison";
router.use("/measurements-compare", measurementComparisonRouter);

import installationSchedulerRouter from "./installation-scheduler";
router.use("/installation-scheduler", installationSchedulerRouter);

// Wave 5: Financial + Intelligence + Communications
import smartPayrollRouter from "./smart-payroll";
router.use("/smart-payroll", smartPayrollRouter);

import apArControlRouter from "./ap-ar-control";
router.use("/ap-ar", apArControlRouter);

import dailyProfitRouter from "./daily-profit-monitor";
router.use("/daily-profit", dailyProfitRouter);

import competitorIntelligenceRouter from "./competitor-intelligence";
router.use("/competitors", competitorIntelligenceRouter);

import financialStatementsRouter from "./financial-statements";
router.use("/financial-statements", financialStatementsRouter);

import fraudDetectionRouter from "./fraud-detection";
router.use("/fraud", fraudDetectionRouter);

import whatsappHubRouter from "./whatsapp-hub";
router.use("/whatsapp-hub", whatsappHubRouter);

import callAnalysisRouter from "./call-analysis";
router.use("/call-analysis", callAnalysisRouter);

import documentTemplatesRouter from "./document-templates";
router.use("/document-templates", documentTemplatesRouter);

// Recruitment & HR Pipeline
import recruitmentRouter from "./recruitment";
router.use("/recruitment", recruitmentRouter);

// Cash Flow Management & Forecasting
import cashflowManagementRouter from "./cashflow-management";
router.use("/cashflow", cashflowManagementRouter);

// Tax & VAT Management
import taxManagementRouter from "./tax-management";
router.use("/tax", taxManagementRouter);

// Social Media Marketing
import socialMarketingRouter from "./social-marketing";
router.use("/social-marketing", socialMarketingRouter);

// Import Management
import importManagementV2Router from "./import-management";
router.use("/import-mgmt", importManagementV2Router);

// Department & Org Structure
import departmentManagerRouter from "./department-manager";
router.use("/departments-mgmt", departmentManagerRouter);

// AI Agents System (12 specialized agents)
import aiAgentsSystemRouter from "./ai-agents-system";
router.use("/ai-agents", aiAgentsSystemRouter);

// Wave 7: Bolt-Level Factory Modules
import rawMaterialCatalogRouter from "./raw-material-catalog";
router.use("/material-catalog", rawMaterialCatalogRouter);

import bomBuilderRouter from "./bom-builder";
router.use("/bom-builder", bomBuilderRouter);

import scrapTrackerRouter from "./scrap-tracker";
router.use("/scrap", scrapTrackerRouter);

import toolEquipmentRouter from "./tool-equipment";
router.use("/equipment", toolEquipmentRouter);

import shiftSchedulingRouter from "./shift-scheduling";
router.use("/shifts", shiftSchedulingRouter);

import safetyIncidentsRouter from "./safety-incidents";
router.use("/safety", safetyIncidentsRouter);

import customerPortalRouter from "./customer-portal";
router.use("/customer-portal", customerPortalRouter);

import supplierPortalRouter from "./supplier-portal";
router.use("/supplier-portal", supplierPortalRouter);

import mobileFieldOpsRouter from "./mobile-field-ops";
router.use("/field-ops", mobileFieldOpsRouter);

// Missing routes - added
import genericCrudRouter from "./generic-crud";
router.use("/crud", genericCrudRouter);

import pdfGeneratorRouter from "./pdf-generator-engine";
router.use("/pdf-generator", pdfGeneratorRouter);

import technoKolUziAiRouter from "./techno-kol-uzi-ai-engine";
router.use("/ai-core", technoKolUziAiRouter);

import whatsappBusinessRouter from "./whatsapp-business-engine";

// ==========================================================
// AUTO-WIRED BY scripts/auto-wire-routes.js — do not edit by hand
// Generated: 2026-04-18T06:24:36.149Z
// Added: 3 route modules
// ==========================================================
import dashboardRouter from './dashboard';
import finRouterRouter from './fin-router';
import savedPlacesRouter from './saved-places';

// ==========================================================
// AUTO-WIRED by scripts/auto-wire-routes.js — do not edit
// Generated: 2026-04-18T06:25:30.494Z
// Added: 84 modules
// ==========================================================
import accountingExportRouter from './accounting-export';
import advancedRouter from './advanced';
import adminCronTriggersRouter from './admin-cron-triggers';
import aiBusinessAutomationRouter from './ai-business-automation';
import aiSearchEnhanceRouter from './ai-search-enhance';
import anomalyDetectionRouter from './anomaly-detection';
import apiConnectionHubRouter from './api-connection-hub';
import apiHubRouter from './api-hub';
import apiKeysRouter from './api-keys';
import biAdhocQueryRouter from './bi-adhoc-query';
import biComparativeAnalyticsRouter from './bi-comparative-analytics';
import biDashboardsRouter from './bi-dashboards';
import biExportRouter from './bi-export';
import biScheduledReportsRouter from './bi-scheduled-reports';
import contractAiAnalysisRouter from './contract-ai-analysis';
import contractAnalyticsRouter from './contract-analytics';
import contractLifecycleRouter from './contract-lifecycle';
import contractTemplatesRouter from './contract-templates';
import contractorPaymentDecisionRouter from './contractor-payment-decision';
import contractsRouter from './contracts';
import crmCommunicationsRouter from './crm-communications';
import crmCustomer360Router from './crm-customer360';
import crmSalesPipelineRouter from './crm-sales-pipeline';
import dataFabricRouter from './data-fabric';
import dataImportExportRouter from './data-import-export';
import dataMigrationRouter from './data-migration';
import dataPlatformCoreRouter from './data-platform-core';
import dmsRouter from './dms';
import ediRouter from './edi';
import emailTemplatesRouter from './email-templates';
import employeeChatbotRouter from './employee-chatbot';
import executiveScorecardRouter from './executive-scorecard';
import fieldOperationsRouter from './field-operations';
import finDocumentsRouter from './fin-documents';
import finMasterDataRouter from './fin-master-data';
import finPaymentsRouter from './fin-payments';
import paymentsUnifiedRouter from './payments';
import finQuantRouter from './fin-quant';
import fleetLogisticsRouter from './fleet-logistics';
import graphqlRouter from './graphql';
import hrAttendanceAdvancedRouter from './hr-attendance-advanced';
import hrWorkforceRouter from './hr-workforce';
import hseRoutesRouter from './hse-routes';
import hseRouter from './hse';
import integrationHubRouter from './integration-hub';
import inventoryManagementRouter from './inventory-management';
import israeliBusinessIntegrationsNewRouter from './israeli-business-integrations-new';
import israeliBusinessIntegrationsRouter from './israeli-business-integrations';
import israeliPayrollRouter from './israeli-payroll';
import landedCostRouter from './landed-cost';
import locationsRouter from './locations';
import logisticsTrackingPodRmaRouter from './logistics-tracking-pod-rma';
import mfaRouter from './mfa';
import nlQueryRouter from './nl-query';
import notificationsHubRouter from './notifications-hub';
import openapiRouter from './openapi';
import poApprovalWorkflowRouter from './po-approval-workflow';
import procurementAnalysisRouter from './procurement-analysis';
import procurementRfqRouter from './procurement-rfq';
import projectPmExtendedRouter from './project-pm-extended';
import pushNotificationsRouter from './push-notifications';
import qmsInspectionRouter from './qms-inspection';
import qmsRouter from './qms';
import qualityManagementRouter from './quality-management';
import quoteBuilderRouter from './quote-builder';
import realtimePlatformRouter from './realtime-platform';
import recycleBinRouter from './recycle-bin';
import rfqRouter from './rfq';
import securityComplianceRouter from './security-compliance';
import securityRouter from './security';
import sentimentAnalysisRouter from './sentiment-analysis';
import serverHealthRouter from './server-health';
import sessionAdminRouter from './session-admin';
import sessionsRouter from './sessions';
import shareRouter from './share';
import shippingFreightRouter from './shipping-freight';
import ssoRouter from './sso';
import storageRouter from './storage';
import supplierIntelligenceNewRouter from './supplier-intelligence-new';
import supplierIntelligenceRouter from './supplier-intelligence';
import systemDataResetRouter from './system-data-reset';
import threeWayMatchingRouter from './three-way-matching';
import warehouseIntelligenceRouter from './warehouse-intelligence';
import wmsCoreRouter from './wms-core';
import wmsOperationsRouter from './wms-operations';
import workOrdersRouter from './work-orders';
router.use("/whatsapp-business", whatsappBusinessRouter);

// AUTO-WIRED MOUNTS
router.use('/accounting-export', accountingExportRouter);
router.use('/advanced', advancedRouter);
router.use('/admin-cron-triggers', adminCronTriggersRouter);
router.use('/ai-business-automation', aiBusinessAutomationRouter);
router.use('/ai-search-enhance', aiSearchEnhanceRouter);
router.use('/anomaly-detection', anomalyDetectionRouter);
router.use('/api-connection-hub', apiConnectionHubRouter);
router.use('/api-hub', apiHubRouter);
router.use('/api-keys', apiKeysRouter);
router.use('/bi-adhoc-query', biAdhocQueryRouter);
router.use('/bi-comparative-analytics', biComparativeAnalyticsRouter);
router.use('/bi-dashboards', biDashboardsRouter);
router.use('/bi-export', biExportRouter);
router.use('/bi-scheduled-reports', biScheduledReportsRouter);
router.use('/contract-ai-analysis', contractAiAnalysisRouter);
router.use('/contract-analytics', contractAnalyticsRouter);
router.use('/contract-lifecycle', contractLifecycleRouter);
router.use('/contract-templates', contractTemplatesRouter);
router.use('/contractor-payment-decision', contractorPaymentDecisionRouter);
router.use('/api/v2/contracts', contractsRouter);
router.use('/api/v2/finance', financeV2Router);
router.use('/crm-communications', crmCommunicationsRouter);
router.use('/crm-customer360', crmCustomer360Router);
router.use('/crm-sales-pipeline', crmSalesPipelineRouter);
router.use('/data-fabric', dataFabricRouter);
router.use('/data-import-export', dataImportExportRouter);
router.use('/data-migration', dataMigrationRouter);
router.use('/data-platform-core', dataPlatformCoreRouter);
router.use('/dms', dmsRouter);
router.use('/edi', ediRouter);
router.use('/email-templates', emailTemplatesRouter);
router.use('/employee-chatbot', employeeChatbotRouter);
router.use('/executive-scorecard', executiveScorecardRouter);
router.use('/field-operations', fieldOperationsRouter);
router.use('/fin-documents', finDocumentsRouter);
router.use('/fin-master-data', finMasterDataRouter);
router.use('/fin-payments', finPaymentsRouter);
router.use(paymentsUnifiedRouter); // unified GET /api/payments/:id (CRUD-GAP-FIX)
router.use('/fin-quant', finQuantRouter);
router.use('/fleet-logistics', fleetLogisticsRouter);
router.use('/graphql', graphqlRouter);
router.use('/hr-attendance-advanced', hrAttendanceAdvancedRouter);
router.use('/hr-workforce', hrWorkforceRouter);
router.use('/hse-routes', hseRoutesRouter);
router.use('/hse', hseRouter);
router.use('/integration-hub', integrationHubRouter);
router.use('/inventory-management', inventoryManagementRouter);
router.use('/israeli-business-integrations-new', israeliBusinessIntegrationsNewRouter);
router.use('/israeli-business-integrations', israeliBusinessIntegrationsRouter);
router.use('/israeli-payroll', israeliPayrollRouter);
router.use('/landed-cost', landedCostRouter);
router.use('/locations', locationsRouter);
router.use('/logistics-tracking-pod-rma', logisticsTrackingPodRmaRouter);
router.use('/mfa', mfaRouter);
router.use('/nl-query', nlQueryRouter);
router.use('/notifications-hub', notificationsHubRouter);
router.use('/openapi', openapiRouter);
router.use('/po-approval-workflow', poApprovalWorkflowRouter);
router.use('/procurement-analysis', procurementAnalysisRouter);
router.use('/procurement-rfq', procurementRfqRouter);
router.use('/project-pm-extended', projectPmExtendedRouter);
router.use('/push-notifications', pushNotificationsRouter);
router.use('/qms-inspection', qmsInspectionRouter);
router.use('/qms', qmsRouter);
router.use('/quality-management', qualityManagementRouter);
router.use('/quote-builder', quoteBuilderRouter);
router.use('/realtime-platform', realtimePlatformRouter);
router.use('/recycle-bin', recycleBinRouter);
router.use('/rfq', rfqRouter);
router.use('/security-compliance', securityComplianceRouter);
router.use('/security', securityRouter);
router.use('/sentiment-analysis', sentimentAnalysisRouter);
router.use('/server-health', serverHealthRouter);
router.use('/session-admin', sessionAdminRouter);
router.use('/sessions', sessionsRouter);
router.use('/share', shareRouter);
router.use('/shipping-freight', shippingFreightRouter);
router.use('/sso', ssoRouter);
router.use('/storage', storageRouter);
router.use('/supplier-intelligence-new', supplierIntelligenceNewRouter);
router.use('/supplier-intelligence', supplierIntelligenceRouter);
router.use('/system-data-reset', systemDataResetRouter);
router.use('/three-way-matching', threeWayMatchingRouter);
router.use('/warehouse-intelligence', warehouseIntelligenceRouter);
router.use('/wms-core', wmsCoreRouter);
router.use('/wms-operations', wmsOperationsRouter);
router.use('/work-orders', workOrdersRouter);

export default router;
