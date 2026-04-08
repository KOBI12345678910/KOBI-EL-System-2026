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
    </>
);
