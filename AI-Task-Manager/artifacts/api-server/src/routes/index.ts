import { Router, type IRouter } from "express";
import systemDataResetRouter from "./system-data-reset";
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
import mfaRouter from "./mfa";
import ssoRouter from "./sso";
import sessionAdminRouter from "./session-admin";
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
import projectPmExtendedRouter from "./project-pm-extended";
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
import dmsRouter from "./dms";
import contractsRouter from "./contracts";
import contractTemplatesRouter from "./contract-templates";
import contractAnalyticsRouter from "./contract-analytics";
import procurementRfqRouter from "./procurement-rfq";
import supplierIntelligenceNewRouter from "./supplier-intelligence-new";
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
import israeliPayrollRouter from "./israeli-payroll";
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
import crmSalesPipelineRouter from "./crm-sales-pipeline";
import executiveWarRoomRouter from "./executive-war-room";
import executiveControlRouter from "./executive-control";
import modulePathAliasesRouter from "./module-path-aliases";
import fabricationCatalogRouter from "./fabrication-catalog";
import fabricationProductionRouter from "./fabrication-production";
import fabricationLogisticsRouter from "./fabrication-logistics";
import workOrdersRouter from "./work-orders";
import inventoryManagementRouter from "./inventory-management";
import inventoryWarehouseRouter from "./inventory-warehouse";
import deliveryReturnsRouter from "./delivery-returns";
import productionGapsRouter from "./production-gaps";
import installationsModuleRouter from "./installations-module";
import aiGapsRouter from "./ai-gaps";
import dataFlowSystemRouter from "./data-flow-system";
import builderSeedRouter from "./builder-seed";
import missingEntitiesRouter from "./missing-entities";
import entityCrudRouter from "./entity-crud-registry";
import securityComplianceRouter from "./security-compliance";
import aiDataFlowRouter from "./ai-data-flow";
import dedicatedEntityRoutes from "./dedicated-entity-routes";
import finRouter from "./fin-router";
import factorySeedRouter from "./factory-seed";
import taskChallengesRouter from "./task-challenges";
import kobiRouter from "./kobi";
import superAgentRouter from "./super-agent";
import liveOpsRouter from "./live-ops";
import analyticsEngineRouter from "./analytics-engine";
import cmmsRouter from "./cmms";
import settingsRouter from "./settings";
import quoteBuilderRouter from "./quote-builder";
import productsRouter from "./products";
import raw_materialsRouter from "./raw_materials";
import warehousesRouter from "./warehouses";
import stock_countsRouter from "./stock_counts";
import stock_movementsRouter from "./stock_movements";
import purchase_order_itemsRouter from "./purchase_order_items";
import purchase_requestsRouter from "./purchase_requests";
import goods_receiptsRouter from "./goods_receipts";
import hrAttendanceAdvancedRouter from "./hr-attendance-advanced";
import hrWorkforceRouter from "./hr-workforce";
import hrSapUpgradeRouter from "./hr-sap-upgrade";
import crmCommunicationsRouter from "./crm-communications";
import crmCustomer360Router from "./crm-customer360";
import warehouseIntelligenceRouter from "./warehouse-intelligence";
import supplierIntelligenceRouter from "./supplier-intelligence";
import storageRouter from "./storage";
import ediRouter from "./edi";
import aiOrchestrationRouter from "./ai-orchestration/index";
import aiOrchestrationAuditRouter from "./ai-orchestration/audit-log";
import aiOrchestrationMlRouter from "./ai-orchestration/ml-pipeline";
import qualityManagementRouter from "./quality-management";
import qmsRouter from "./qms";
import rfqRouter from "./rfq";
import poApprovalWorkflowRouter from "./po-approval-workflow";
import threeWayMatchingRouter from "./three-way-matching";
import landedCostRouter from "./landed-cost";
import qmsInspectionRouter from "./qms-inspection";
import israeliBusinessIntegrationsRouter from "./israeli-business-integrations";
import nlQueryRouter from "./nl-query";
import anomalyDetectionRouter from "./anomaly-detection";
import dataImportExportRouter from "./data-import-export";
import dataMigrationRouter from "./data-migration";
import employeeChatbotRouter from "./employee-chatbot";
import sentimentAnalysisRouter from "./sentiment-analysis";
import aiSearchEnhanceRouter from "./ai-search-enhance";
import fleetLogisticsRouter from "./fleet-logistics";
import shippingFreightRouter from "./shipping-freight";
import aiBusinessAutomationRouter from "./ai-business-automation";
import logisticsTrackingPodRmaRouter from "./logistics-tracking-pod-rma";
import biDashboardsRouter from "./bi-dashboards";
import biExportRouter from "./bi-export";
import biScheduledReportsRouter from "./bi-scheduled-reports";
import biAdhocQueryRouter from "./bi-adhoc-query";
import biComparativeAnalyticsRouter from "./bi-comparative-analytics";
import fieldOperationsRouter from "./field-operations";
import hseRouter from "./hse";
import emailTemplatesRouter from "./email-templates";
import pushNotificationsRouter from "./push-notifications";
import executiveScorecardRouter from "./executive-scorecard";
import contractLifecycleRouter from "./contract-lifecycle";
import apiKeysRouter from "./api-keys";
import israeliBusinessIntegrationsNewRouter from "./israeli-business-integrations-new";
import notificationsHubRouter from "./notifications-hub";
import contractorPaymentRouter from "./contractor-payment-decision";
import procurementAnalysisRouter from "./procurement-analysis";
import contractAiAnalysisRouter, { startContractAIReminderScheduler } from "./contract-ai-analysis";
import recycleBinRouter from "./recycle-bin";
import adminCronTriggersRouter from "./admin-cron-triggers";
import wmsCoreRouter from "./wms-core";
import wmsOperationsRouter from "./wms-operations";
import apiConnectionHubRouter from "./api-connection-hub";
import apiHubRouter from "./api-hub";
import integrationHubRouter from "./integration-hub";
import realtimePlatformRouter from "./realtime-platform";

const router: IRouter = Router();

router.use("/realtime", realtimePlatformRouter);
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
if (process.env.NODE_ENV !== "production") {
  router.use(crmSeedRouter);
}
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
router.use(hrAttendanceAdvancedRouter);
router.use(hrWorkforceRouter);
router.use(hrSapUpgradeRouter);
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
router.use(projectPmExtendedRouter);
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
router.use(israeliPayrollRouter);
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
router.use(crmSalesPipelineRouter);
router.use(executiveWarRoomRouter);
router.use(executiveControlRouter);
router.use(israeliBusinessIntegrationsRouter);
router.use(modulePathAliasesRouter);
router.use("/inventory", inventoryManagementRouter);
router.use(inventoryWarehouseRouter);
router.use(entityCrudRouter);
router.use(fabricationCatalogRouter);
router.use(fabricationProductionRouter);
router.use(fabricationLogisticsRouter);
router.use("/work-orders", workOrdersRouter);
router.use(deliveryReturnsRouter);
router.use(productionGapsRouter);
router.use(installationsModuleRouter);
router.use(aiGapsRouter);
router.use(dataFlowSystemRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(builderSeedRouter);
}
router.use(missingEntitiesRouter);
router.use(aiDataFlowRouter);
if (process.env.NODE_ENV !== "production") {
  router.use(factorySeedRouter);
}
router.use(taskChallengesRouter);
router.use(kobiRouter);
router.use(superAgentRouter);
router.use(liveOpsRouter);
router.use(analyticsEngineRouter);
router.use(cmmsRouter);
router.use(settingsRouter);
router.use(quoteBuilderRouter);

router.use(productsRouter);

router.use(raw_materialsRouter);

router.use(warehousesRouter);

router.use(stock_countsRouter);

router.use(stock_movementsRouter);

router.use(purchase_order_itemsRouter);

router.use(purchase_requestsRouter);

router.use(goods_receiptsRouter);
router.use(crmCommunicationsRouter);
router.use(crmCustomer360Router);
router.use(warehouseIntelligenceRouter);
router.use(storageRouter);
router.use(supplierIntelligenceRouter);
router.use(ediRouter);
router.use(aiOrchestrationRouter);
router.use(aiOrchestrationAuditRouter);
router.use(aiOrchestrationMlRouter);
router.use(qualityManagementRouter);
router.use(qmsRouter);
router.use(qmsInspectionRouter);
router.use(rfqRouter);
router.use(poApprovalWorkflowRouter);
router.use(threeWayMatchingRouter);
router.use(landedCostRouter);
router.use(nlQueryRouter);
router.use(anomalyDetectionRouter);
router.use(dataImportExportRouter);
router.use(dataMigrationRouter);
router.use(employeeChatbotRouter);
router.use(sentimentAnalysisRouter);
router.use(aiSearchEnhanceRouter);
router.use(mfaRouter);
router.use(ssoRouter);
router.use(sessionAdminRouter);
router.use(fleetLogisticsRouter);
router.use(shippingFreightRouter);
router.use(aiBusinessAutomationRouter);
router.use(securityComplianceRouter);
router.use(logisticsTrackingPodRmaRouter);
router.use(biDashboardsRouter);
router.use(biExportRouter);
router.use(biScheduledReportsRouter);
router.use(biAdhocQueryRouter);
router.use(biComparativeAnalyticsRouter);
router.use(fieldOperationsRouter);
router.use(hseRouter);
router.use(emailTemplatesRouter);
router.use(pushNotificationsRouter);
router.use(executiveScorecardRouter);
router.use(contractLifecycleRouter);
router.use(dmsRouter);
router.use(contractsRouter);
router.use(contractTemplatesRouter);
router.use(contractAnalyticsRouter);
router.use(procurementRfqRouter);
router.use(supplierIntelligenceNewRouter);
router.use(apiKeysRouter);
router.use(israeliBusinessIntegrationsNewRouter);
router.use(notificationsHubRouter);
router.use(contractorPaymentRouter);
router.use(procurementAnalysisRouter);
router.use(contractAiAnalysisRouter);
router.use(recycleBinRouter);
router.use(adminCronTriggersRouter);
router.use(wmsCoreRouter);
router.use(systemDataResetRouter);
router.use(wmsOperationsRouter);
router.use(apiConnectionHubRouter);
router.use(apiHubRouter);
router.use(integrationHubRouter);

// Financial Module (New Architecture)
router.use("/fin", finRouter);
startContractAIReminderScheduler();

// H-02: Computed Customer Balance endpoint
router.get("/customers/balance", async (_req, res) => {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql.raw("SELECT * FROM customer_balance_view ORDER BY customer_name"));
    res.json(result.rows || []);
  } catch (e: any) {
    console.error("Customer balance query error:", e.message);
    res.status(500).json({ error: "Failed to fetch customer balances" });
  }
});

// H-02: Get single customer balance
router.get("/customers/:id/balance", async (req, res) => {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const customerId = parseInt(req.params.id, 10);
    if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer ID" }); return; }
    const result = await db.execute(sql`SELECT * FROM customer_balance_view WHERE id = ${customerId}`);
    const row = result.rows?.[0];
    if (!row) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json(row);
  } catch (e: any) {
    console.error("Customer balance query error:", e.message);
    res.status(500).json({ error: "Failed to fetch customer balance" });
  }
});

// H-04: Audit Log endpoints
router.get("/audit-log", async (req, res) => {
  try {
    const { getAuditLog } = await import("../lib/audit-log");
    const tableName = req.query.table as string | undefined;
    const recordId = req.query.recordId ? parseInt(req.query.recordId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const logs = await getAuditLog(tableName, recordId, limit, offset);
    res.json(logs);
  } catch (e: any) {
    console.error("Audit log query error:", e.message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/audit-log/stats", async (_req, res) => {
  try {
    const { getAuditStats } = await import("../lib/audit-log");
    const stats = await getAuditStats();
    res.json(stats);
  } catch (e: any) {
    console.error("Audit log stats error:", e.message);
    res.status(500).json({ error: "Failed to fetch audit log statistics" });
  }
});

router.get("/audit-log/:recordId", async (req, res) => {
  try {
    const { getAuditLog } = await import("../lib/audit-log");
    const recordId = parseInt(req.params.recordId);
    const logs = await getAuditLog(undefined, recordId, 1000, 0);
    res.json(logs);
  } catch (e: any) {
    console.error("Audit log query error:", e.message);
    res.status(500).json({ error: "Failed to fetch audit logs for record" });
  }
});

// Main dashboard endpoint
router.get("/dashboard", (_req, res) => {
  res.json({ status: "ok", message: "Dashboard loaded" });
});

// L-08: Settings Endpoints
router.get("/settings", async (_req, res) => {
  try {
    // Return default company settings
    const settings = {
      companyName: "טכנו-כל עוזי",
      companyId: "514123456",
      address: "רחוב ראשי 123, רמלה",
      logoUrl: "/images/logo.png",
      vatRate: 17,
      currency: "ILS",
      minimumWage: 34,
      pensionPercentage: 5,
    };
    res.json(settings);
  } catch (error: any) {
    console.error("Settings fetch error:", error);
    res.status(500).json({ error: "אירעה שגיאה בטעינת ההגדרות" });
  }
});

router.put("/settings", async (req: any, res) => {
  try {
    const settings = req.body;
    
    // Validate settings
    if (!settings.companyName || !settings.companyId) {
      return res.status(400).json({ error: "שם החברה ומספר ח.פ. חובה" });
    }
    
    // In production, save to database
    // For now, return the settings as confirmation
    res.json({ success: true, settings });
  } catch (error: any) {
    console.error("Settings update error:", error);
    res.status(500).json({ error: "אירעה שגיאה בעדכון ההגדרות" });
  }
});

// I-02: Refresh token endpoint
router.post("/auth/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: "אין טוקן רענון" });
    }
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: "Server misconfiguration" });
      return;
    }
    const decoded = require("jsonwebtoken").verify(refreshToken, jwtSecret) as any;
    
    const newAccessToken = require("jsonwebtoken").sign(
      { userId: decoded.userId, username: decoded.username, isSuperAdmin: false },
      jwtSecret,
      { expiresIn: "15m" }
    );
    
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    
    res.json({ success: true, accessToken: newAccessToken });
  } catch (error: any) {
    res.status(403).json({ error: "רענון טוקן נכשל" });
  }
});

// Logout endpoint
router.post("/auth/logout", (_req, res) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  res.json({ success: true });
});

export default router;
