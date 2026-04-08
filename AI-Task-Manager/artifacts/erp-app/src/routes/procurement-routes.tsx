import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

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
const ImportOrdersPage = lazyPage(() => import("@/pages/modules/import-orders"));
const CustomsClearancePage = lazyPage(() => import("@/pages/modules/customs-clearance"));
const ShipmentTrackingPage = lazyPage(() => import("@/pages/modules/shipment-tracking"));
const ForeignSuppliersPage = lazyPage(() => import("@/pages/modules/foreign-suppliers"));
const LettersOfCreditPage = lazyPage(() => import("@/pages/modules/letters-of-credit"));
const ImportCostCalculatorPage = lazyPage(() => import("@/pages/modules/import-cost-calculator"));
const ComplianceCertificatesPage = lazyPage(() => import("@/pages/modules/compliance-certificates"));
const ExchangeRatesPage = lazyPage(() => import("@/pages/modules/exchange-rates"));
const ProcurementAIPage = lazyPage(() => import("@/pages/modules/procurement-ai"));
const EdiAdminPage = lazyPage(() => import("@/pages/supply-chain/edi-admin"));
const EdiDashboardPage = lazyPage(() => import("@/pages/supply-chain/edi-dashboard"));
const PurchaseRequisitionsPage = lazyPage(() => import("@/pages/procurement/purchase-requisitions"));
const RfqManagementPage = lazyPage(() => import("@/pages/procurement/rfq-management"));
const ThreeWayMatchingPage = lazyPage(() => import("@/pages/procurement/three-way-matching"));
const LandedCostPage = lazyPage(() => import("@/pages/procurement/landed-cost"));
const PoApprovalWorkflowPage = lazyPage(() => import("@/pages/procurement/po-approval-workflow"));
const ProfitabilityDashboardPage = lazyPage(() => import("@/pages/procurement/profitability-dashboard"));
const CompetitorAnalysisPage = lazyPage(() => import("@/pages/procurement/competitor-analysis"));
const RiskHedgingPage = lazyPage(() => import("@/pages/procurement/risk-hedging"));
const ProcStockCountsPage = lazyPage(() => import("@/pages/procurement/stock-counts"));
const ProcStockMovementsPage = lazyPage(() => import("@/pages/procurement/stock-movements"));
const SpendAnalysisPage = lazyPage(() => import("@/pages/procurement/spend-analysis"));
const VendorEvaluationPage = lazyPage(() => import("@/pages/procurement/vendor-evaluation"));
const POApprovalsPage = lazyPage(() => import("@/pages/procurement/po-approvals"));
const ProcurementCompetitorsPage = lazyPage(() => import("@/pages/modules/procurement-competitors"));
const ProcurementRiskHedgingPage = lazyPage(() => import("@/pages/modules/procurement-risk-hedging"));
const ProcurementProfitabilityPage = lazyPage(() => import("@/pages/modules/procurement-profitability"));
const ImportCostCalcPage = lazyPage(() => import("@/pages/import/import-cost-calculator"));
const ImportInsurancePage = lazyPage(() => import("@/pages/import/import-insurance"));
const SupplierCommunicationsPage = lazyPage(() => import("@/pages/modules/supplier-communications"));
const SupplierScorecardsPage = lazyPage(() => import("@/pages/supplier-mgmt/supplier-scorecards"));
const SupplierDevelopmentPage = lazyPage(() => import("@/pages/supplier-mgmt/supplier-development"));
const VendorCompliancePage = lazyPage(() => import("@/pages/supplier-mgmt/vendor-compliance"));
const SupplyChainRiskPage = lazyPage(() => import("@/pages/supplier-mgmt/supply-chain-risk"));
const SupplierPortalDashboardPage = lazyPage(() => import("@/pages/supplier-mgmt/supplier-portal-dashboard"));
const DataMigrationPage = lazyPage(() => import("@/pages/data-migration"));
const ImportManagementPage = lazyPage(() => import("@/pages/import-management"));
const RawMaterialsPage = lazyPage(() => import("@/pages/modules/raw-materials"));

// Procurement main pages
const ProcurementCommandCenterPage = lazyPage(() => import("@/pages/procurement/procurement-command-center"));
const SupplierManagementPage = lazyPage(() => import("@/pages/procurement/supplier-management"));
const PriceManagementPage = lazyPage(() => import("@/pages/procurement/price-management"));
const PurchaseOrdersUltraPage = lazyPage(() => import("@/pages/procurement/purchase-orders"));
const GoodsReceivingPage = lazyPage(() => import("@/pages/procurement/goods-receiving"));
const DeliveryDocumentsPage = lazyPage(() => import("@/pages/procurement/delivery-documents"));
const ContractsManagementPage = lazyPage(() => import("@/pages/procurement/contracts-management"));
const ProcurementAlertsPage = lazyPage(() => import("@/pages/procurement/procurement-alerts"));
const DocumentsSignaturesPage = lazyPage(() => import("@/pages/procurement/documents-signatures"));
const LogisticsTrackingPage = lazyPage(() => import("@/pages/procurement/logistics-tracking"));
const QualityControlPage = lazyPage(() => import("@/pages/procurement/quality-control"));
const ProcurementAutomationPage = lazyPage(() => import("@/pages/procurement/procurement-automation"));
const ProcurementAnalyticsPage = lazyPage(() => import("@/pages/procurement/procurement-analytics"));
const ProcurementSettingsPage = lazyPage(() => import("@/pages/procurement/procurement-settings"));
const InventorySyncPage = lazyPage(() => import("@/pages/procurement/inventory-sync"));
const VendorNegotiationPage = lazyPage(() => import("@/pages/procurement/vendor-negotiation"));
const DemandPlanningPage = lazyPage(() => import("@/pages/procurement/demand-planning"));
const ProcurementExceptionsPage = lazyPage(() => import("@/pages/procurement/procurement-exceptions"));
const SubcontractorManagementPage = lazyPage(() => import("@/pages/procurement/subcontractor-management"));
const MarketPriceTrackingPage = lazyPage(() => import("@/pages/procurement/market-price-tracking"));
const MakeVsBuyPage = lazyPage(() => import("@/pages/procurement/make-vs-buy"));
const SupplierReturnsPage = lazyPage(() => import("@/pages/procurement/supplier-returns"));
const BlanketOrdersPage = lazyPage(() => import("@/pages/procurement/blanket-orders"));
const ProcurementBudgetsPage = lazyPage(() => import("@/pages/procurement/procurement-budgets"));
const SupplierPortalPage = lazyPage(() => import("@/pages/procurement/supplier-portal"));
const SupplierDependencyPage = lazyPage(() => import("@/pages/procurement/supplier-dependency"));
const ProcurementCompliancePage = lazyPage(() => import("@/pages/procurement/procurement-compliance"));
const ProcurementProfitImpactPage = lazyPage(() => import("@/pages/procurement/procurement-profit-impact"));
const ProcurementSimulationPage = lazyPage(() => import("@/pages/procurement/procurement-simulation"));

// Raw Materials sub-pages
const RawMaterialsDashboardPage = lazyPage(() => import("@/pages/procurement/raw-materials/raw-materials-dashboard"));
const RawMaterialsListPage = lazyPage(() => import("@/pages/procurement/raw-materials/raw-materials-list"));
const WeightCalculatorPage = lazyPage(() => import("@/pages/procurement/raw-materials/weight-calculator"));
const RawMaterialStockPage = lazyPage(() => import("@/pages/procurement/raw-materials/raw-material-stock"));
const RawMaterialsCostAnalysisPage = lazyPage(() => import("@/pages/procurement/raw-materials/cost-analysis"));
const ScrapWastePage = lazyPage(() => import("@/pages/procurement/raw-materials/scrap-waste"));

// Products sub-pages
const ProductsDashboardPage = lazyPage(() => import("@/pages/procurement/products/products-dashboard"));
const ProductsListPage = lazyPage(() => import("@/pages/procurement/products/products-list"));
const ProductBomPage = lazyPage(() => import("@/pages/procurement/products/product-bom"));
const ProductCostingPage = lazyPage(() => import("@/pages/procurement/products/product-costing"));

export const ProcurementRoutes = (

    <>
      <Route path="/suppliers" component={SuppliersPage} />
      <Route path="/suppliers/:id" component={SupplierCardPage} />
      <Route path="/procurement-dashboard" component={ProcurementDashboardPage} />
      <Route path="/import-dashboard" component={ImportDashboardPage} />
      <Route path="/data-migration" component={DataMigrationPage} />
      <Route path="/purchase-orders" component={PurchaseOrdersPage} />
      <Route path="/goods-receipt" component={GoodsReceiptPage} />
      <Route path="/purchase-requests" component={PurchaseRequestsPage} />
      <Route path="/purchase-approvals" component={PurchaseApprovalsPage} />
      <Route path="/price-quotes" component={PriceQuotesPage} />
      <Route path="/price-comparison" component={PriceComparisonPage} />
      <Route path="/inventory-management" component={InventoryManagementPage} />
      <Route path="/raw-materials" component={RawMaterialsPage} />
      <Route path="/supplier-evaluations" component={SupplierEvaluationsPage} />
      <Route path="/purchase-returns" component={PurchaseReturnsPage} />
      <Route path="/supplier-contracts" component={SupplierContractsPage} />
      <Route path="/supply-chain/edi" component={EdiAdminPage} />
      <Route path="/supply-chain/edi-admin" component={EdiAdminPage} />
      <Route path="/supply-chain/edi-monitor" component={EdiDashboardPage} />
      <Route path="/supply-chain/edi-dashboard" component={EdiDashboardPage} />
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
      <Route path="/procurement/rfq-management" component={RfqManagementPage} />
      <Route path="/procurement/three-way-matching" component={ThreeWayMatchingPage} />
      <Route path="/procurement/landed-cost" component={LandedCostPage} />
      <Route path="/procurement/po-approval-workflow" component={PoApprovalWorkflowPage} />
      <Route path="/procurement/requisitions" component={PurchaseRequisitionsPage} />
      <Route path="/procurement/rfq" component={RfqManagementPage} />
      <Route path="/procurement/profitability-analysis" component={ProfitabilityDashboardPage} />
      <Route path="/procurement/competitor-analysis" component={CompetitorAnalysisPage} />
      <Route path="/procurement/risk-hedging-analysis" component={RiskHedgingPage} />
      <Route path="/procurement/stock-count" component={ProcStockCountsPage} />
      <Route path="/procurement/stock-movements" component={ProcStockMovementsPage} />
      <Route path="/procurement/spend-analysis" component={SpendAnalysisPage} />
      <Route path="/procurement/vendor-evaluation" component={VendorEvaluationPage} />
      <Route path="/procurement/po-approvals" component={POApprovalsPage} />
      <Route path="/import/cost-calculator" component={ImportCostCalcPage} />
      <Route path="/import/insurance" component={ImportInsurancePage} />
      <Route path="/supplier-communications" component={SupplierCommunicationsPage} />
      <Route path="/supplier-card/:id" component={SupplierCardPage} />
      <Route path="/supplier/portal" component={SupplierPortalDashboardPage} />
      <Route path="/supplier-mgmt/portal" component={SupplierPortalDashboardPage} />
      <Route path="/supplier-mgmt/scorecards" component={SupplierScorecardsPage} />
      <Route path="/supplier-mgmt/development" component={SupplierDevelopmentPage} />
      <Route path="/supplier-mgmt/compliance" component={VendorCompliancePage} />
      <Route path="/supplier-mgmt/risk" component={SupplyChainRiskPage} />
      <Route path="/import-management" component={ImportManagementPage} />
      <Route path="/suppliers/communications" component={SupplierCommunicationsPage} />
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

      {/* Procurement main pages */}
      <Route path="/procurement/command-center" component={ProcurementCommandCenterPage} />
      <Route path="/procurement/supplier-management" component={SupplierManagementPage} />
      <Route path="/procurement/price-management" component={PriceManagementPage} />
      <Route path="/procurement/purchase-orders-ultra" component={PurchaseOrdersUltraPage} />
      <Route path="/procurement/goods-receiving" component={GoodsReceivingPage} />
      <Route path="/procurement/delivery-documents" component={DeliveryDocumentsPage} />
      <Route path="/procurement/contracts-management" component={ContractsManagementPage} />
      <Route path="/procurement/alerts" component={ProcurementAlertsPage} />
      <Route path="/procurement/documents-signatures" component={DocumentsSignaturesPage} />
      <Route path="/procurement/logistics-tracking" component={LogisticsTrackingPage} />
      <Route path="/procurement/quality-control" component={QualityControlPage} />
      <Route path="/procurement/automation" component={ProcurementAutomationPage} />
      <Route path="/procurement/analytics" component={ProcurementAnalyticsPage} />
      <Route path="/procurement/settings" component={ProcurementSettingsPage} />
      <Route path="/procurement/inventory-sync" component={InventorySyncPage} />
      <Route path="/procurement/vendor-negotiation" component={VendorNegotiationPage} />
      <Route path="/procurement/demand-planning" component={DemandPlanningPage} />
      <Route path="/procurement/exceptions" component={ProcurementExceptionsPage} />
      <Route path="/procurement/subcontractor-management" component={SubcontractorManagementPage} />
      <Route path="/procurement/market-price-tracking" component={MarketPriceTrackingPage} />
      <Route path="/procurement/make-vs-buy" component={MakeVsBuyPage} />
      <Route path="/procurement/supplier-returns" component={SupplierReturnsPage} />
      <Route path="/procurement/blanket-orders" component={BlanketOrdersPage} />
      <Route path="/procurement/budgets" component={ProcurementBudgetsPage} />
      <Route path="/procurement/supplier-portal" component={SupplierPortalPage} />
      <Route path="/procurement/supplier-dependency" component={SupplierDependencyPage} />
      <Route path="/procurement/compliance" component={ProcurementCompliancePage} />
      <Route path="/procurement/profit-impact" component={ProcurementProfitImpactPage} />
      <Route path="/procurement/simulation" component={ProcurementSimulationPage} />

      {/* Raw Materials sub-pages */}
      <Route path="/procurement/raw-materials" component={RawMaterialsDashboardPage} />
      <Route path="/procurement/raw-materials/list" component={RawMaterialsListPage} />
      <Route path="/procurement/raw-materials/weight-calculator" component={WeightCalculatorPage} />
      <Route path="/procurement/raw-materials/stock" component={RawMaterialStockPage} />
      <Route path="/procurement/raw-materials/cost-analysis" component={RawMaterialsCostAnalysisPage} />
      <Route path="/procurement/raw-materials/scrap-waste" component={ScrapWastePage} />

      {/* Products sub-pages */}
      <Route path="/procurement/products" component={ProductsDashboardPage} />
      <Route path="/procurement/products/list" component={ProductsListPage} />
      <Route path="/procurement/products/bom" component={ProductBomPage} />
      <Route path="/procurement/products/costing" component={ProductCostingPage} />
    </>
);
