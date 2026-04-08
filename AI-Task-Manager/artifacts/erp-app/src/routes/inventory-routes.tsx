import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const InventoryDashboardPage = lazyPage(() => import("@/pages/inventory/inventory-dashboard"));
const WarehousesPage = lazyPage(() => import("@/pages/inventory/warehouses"));
const StockMovementsPage = lazyPage(() => import("@/pages/inventory/stock-movements"));
const StockCountsPage = lazyPage(() => import("@/pages/inventory/stock-counts"));
const RawMaterialStockPage = lazyPage(() => import("@/pages/inventory/raw-material-stock"));
const FinishedGoodsStockPage = lazyPage(() => import("@/pages/inventory/finished-goods-stock"));
const WarehouseLocationsPage = lazyPage(() => import("@/pages/inventory/warehouse-locations"));
const ReorderIntelligencePage = lazyPage(() => import("@/pages/inventory/reorder-intelligence"));
const VmiManagementPage = lazyPage(() => import("@/pages/inventory/vmi-management"));
const VmiSupplierPortalPage = lazyPage(() => import("@/pages/inventory/vmi-supplier-portal"));
const WmsLocationHierarchyPage = lazyPage(() => import("@/pages/inventory/wms-location-hierarchy"));
const WmsBarcodeQrPage = lazyPage(() => import("@/pages/inventory/wms-barcode"));
const WmsStockInquiryPage = lazyPage(() => import("@/pages/inventory/wms-stock-inquiry"));
const WmsValuationPage = lazyPage(() => import("@/pages/inventory/wms-valuation"));
const WmsLotTraceabilityPage = lazyPage(() => import("@/pages/inventory/wms-lot-traceability"));
const WmsExpiryDashboardPage = lazyPage(() => import("@/pages/inventory/wms-expiry-dashboard"));
const WMSAnalyticsPage = lazyPage(() => import("@/pages/inventory/wms-analytics"));
const WmsCycleCountingPage = lazyPage(() => import("@/pages/inventory/wms-cycle-counting"));
const WmsPickPackShipPage = lazyPage(() => import("@/pages/inventory/wms-pick-pack-ship"));
const WmsPutawayRulesPage = lazyPage(() => import("@/pages/inventory/wms-putaway-rules"));
const WmsTransferOrdersPage = lazyPage(() => import("@/pages/inventory/wms-transfer-orders"));
const WmsKitsPage = lazyPage(() => import("@/pages/inventory/wms-kits"));
const WmsConsignmentPage = lazyPage(() => import("@/pages/inventory/wms-consignment"));
const WmsCrossDockingPage = lazyPage(() => import("@/pages/inventory/wms-cross-docking"));
const ExpiryAlertsPage = lazyPage(() => import("@/pages/inventory/expiry-alerts"));
const InventoryManagementPage = lazyPage(() => import("@/pages/modules/inventory-management"));

export const InventoryRoutes = (

    <>
      <Route path="/inventory" component={InventoryManagementPage} />
      <Route path="/inventory/warehouses" component={WarehousesPage} />
      <Route path="/inventory/stock-movements" component={StockMovementsPage} />
      <Route path="/inventory/stock-counts" component={StockCountsPage} />
      <Route path="/inventory/raw-material-stock" component={RawMaterialStockPage} />
      <Route path="/inventory/finished-goods-stock" component={FinishedGoodsStockPage} />
      <Route path="/inventory/warehouse-locations" component={WarehouseLocationsPage} />
      <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
      <Route path="/inventory/reorder-intelligence" component={ReorderIntelligencePage} />
      <Route path="/inventory/vmi-management" component={VmiManagementPage} />
      <Route path="/inventory/vmi-supplier-portal" component={VmiSupplierPortalPage} />
      <Route path="/inventory/wms-location-hierarchy" component={WmsLocationHierarchyPage} />
      <Route path="/inventory/wms-barcode" component={WmsBarcodeQrPage} />
      <Route path="/inventory/wms-stock-inquiry" component={WmsStockInquiryPage} />
      <Route path="/inventory/wms-valuation" component={WmsValuationPage} />
      <Route path="/inventory/wms-lot-traceability" component={WmsLotTraceabilityPage} />
      <Route path="/inventory/wms-expiry-dashboard" component={WmsExpiryDashboardPage} />
      <Route path="/inventory/wms-analytics" component={WMSAnalyticsPage} />
      <Route path="/inventory/wms-cycle-counting" component={WmsCycleCountingPage} />
      <Route path="/inventory/wms-pick-pack-ship" component={WmsPickPackShipPage} />
      <Route path="/inventory/wms-putaway-rules" component={WmsPutawayRulesPage} />
      <Route path="/inventory/wms-transfer-orders" component={WmsTransferOrdersPage} />
      <Route path="/inventory/wms-kits" component={WmsKitsPage} />
      <Route path="/inventory/wms-consignment" component={WmsConsignmentPage} />
      <Route path="/inventory/wms-cross-docking" component={WmsCrossDockingPage} />
      <Route path="/inventory/expiry-alerts" component={ExpiryAlertsPage} />
      <Route path="/inventory/inventory-dashboard"><Redirect to="/inventory/dashboard" /></Route>
    </>
);
