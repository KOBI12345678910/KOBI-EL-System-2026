import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const CustomerManagementPage = lazyPage(() => import("@/pages/sales/customer-management"));
const CustomerPortalPage = lazyPage(() => import("@/pages/sales/customer-portal"));
const SalesOrdersPage = lazyPage(() => import("@/pages/sales/sales-orders"));
const QuotationsPage = lazyPage(() => import("@/pages/sales/quotations"));
const SalesInvoicingPage = lazyPage(() => import("@/pages/sales/sales-invoicing"));
const CrmPipelinePage = lazyPage(() => import("@/pages/sales/crm-pipeline"));
const SalesForecastPage = lazyPage(() => import("@/pages/sales/sales-forecast"));
const SalesTerritoriesPage = lazyPage(() => import("@/pages/sales/sales-territories"));
const SalesCommissionsPage = lazyPage(() => import("@/pages/sales/sales-commissions"));
const SalesAnalyticsPage = lazyPage(() => import("@/pages/sales/sales-analytics"));
const SalesScoringPage = lazyPage(() => import("@/pages/sales/sales-scoring"));
const CustomerServicePage = lazyPage(() => import("@/pages/sales/ai-customer-service"));
const DeliveryNotesPage = lazyPage(() => import("@/pages/sales/delivery-notes"));
const SalesReturnsPage = lazyPage(() => import("@/pages/sales/sales-returns"));
const ProductCatalogPage = lazyPage(() => import("@/pages/modules/product-catalog"));
const SalesCustomerServicePage = lazyPage(() => import("@/pages/sales/customer-service"));
const StandaloneCustomerServicePage = lazyPage(() => import("@/pages/customer-service"));
const StandaloneLeadScoringPage = lazyPage(() => import("@/pages/lead-scoring"));
const AICustomerServicePage = lazyPage(() => import("@/pages/ai-engine/ai-customer-service"));

export const SalesRoutes = (

    <>
      <Route path="/sales/customers" component={CustomerManagementPage} />
      <Route path="/sales/customer-portal" component={CustomerPortalPage} />
      <Route path="/sales/orders" component={SalesOrdersPage} />
      <Route path="/sales/quotations" component={QuotationsPage} />
      <Route path="/sales/invoicing"><Redirect to="/sales/invoices" /></Route>
      <Route path="/sales/invoices" component={SalesInvoicingPage} />
      <Route path="/sales/pipeline" component={CrmPipelinePage} />
      <Route path="/sales/forecast" component={SalesForecastPage} />
      <Route path="/sales/territories" component={SalesTerritoriesPage} />
      <Route path="/sales/commissions" component={SalesCommissionsPage} />
      <Route path="/sales/analytics" component={SalesAnalyticsPage} />
      <Route path="/sales/scoring" component={SalesScoringPage} />
      <Route path="/sales/service" component={CustomerServicePage} />
      <Route path="/sales/delivery-notes" component={DeliveryNotesPage} />
      <Route path="/sales/returns" component={SalesReturnsPage} />
      <Route path="/sales/quotes" component={QuotationsPage} />
      <Route path="/sales/customer-service" component={SalesCustomerServicePage} />
      <Route path="/product-catalog" component={ProductCatalogPage} />
      <Route path="/ai-customer-service" component={AICustomerServicePage} />
      <Route path="/customer-service" component={StandaloneCustomerServicePage} />
      <Route path="/lead-scoring" component={StandaloneLeadScoringPage} />
      <Route path="/customers"><Redirect to="/sales/customers" /></Route>
      <Route path="/products"><Redirect to="/product-catalog" /></Route>
      <Route path="/invoices"><Redirect to="/finance/invoices" /></Route>
      <Route path="/sales-orders"><Redirect to="/sales/orders" /></Route>
      <Route path="/sales/price-quotes"><Redirect to="/price-quotes" /></Route>
      <Route path="/sales/sales-orders"><Redirect to="/sales/orders" /></Route>
    </>
);
