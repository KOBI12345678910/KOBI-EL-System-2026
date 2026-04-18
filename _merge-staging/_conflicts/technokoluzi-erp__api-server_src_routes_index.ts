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
import raw_materialsRouter from "./raw_materials";
import warehousesRouter from "./warehouses";
import stock_countsRouter from "./stock_counts";
import stock_movementsRouter from "./stock_movements";
import purchase_ordersRouter from "./purchase_orders";
import purchase_order_itemsRouter from "./purchase_order_items";
import purchase_requestsRouter from "./purchase_requests";
import goods_receiptsRouter from "./goods_receipts";

const router: IRouter = Router();

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

router.use(raw_materialsRouter);

router.use(warehousesRouter);

router.use(stock_countsRouter);

router.use(stock_movementsRouter);

router.use(purchase_ordersRouter);

router.use(purchase_order_itemsRouter);

router.use(purchase_requestsRouter);

router.use(goods_receiptsRouter);

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

// Measurement Approval & Contracts
import measurementApprovalRouter from "./measurement-approval-engine";
router.use("/measurements", measurementApprovalRouter);

// Product Catalog & Quote Engine
import productQuoteRouter from "./product-quote-engine";
router.use("/product-engine", productQuoteRouter);

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

export default router;
