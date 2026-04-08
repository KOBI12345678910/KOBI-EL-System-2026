import { Route } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const FinDashboard = lazyPage(() => import("@/pages/fin/fin-dashboard"));
const FinIncomeList = lazyPage(() => import("@/pages/fin/fin-documents-list").then(m => ({ default: () => m.default({ direction: "income" }) })));
const FinExpenseList = lazyPage(() => import("@/pages/fin/fin-documents-list").then(m => ({ default: () => m.default({ direction: "expense" }) })));
const FinIncomeCreate = lazyPage(() => import("@/pages/fin/fin-document-create").then(m => ({ default: () => m.default({ direction: "income" }) })));
const FinExpenseCreate = lazyPage(() => import("@/pages/fin/fin-document-create").then(m => ({ default: () => m.default({ direction: "expense" }) })));
const FinIncomeDetails = lazyPage(() => import("@/pages/fin/fin-document-details").then(m => ({ default: () => m.default({ direction: "income" }) })));
const FinExpenseDetails = lazyPage(() => import("@/pages/fin/fin-document-details").then(m => ({ default: () => m.default({ direction: "expense" }) })));
const FinStandingOrders = lazyPage(() => import("@/pages/fin/fin-standing-orders"));
const FinCreditClearing = lazyPage(() => import("@/pages/fin/fin-credit-clearing"));
const FinRecurring = lazyPage(() => import("@/pages/fin/fin-recurring"));
const FinAccounting = lazyPage(() => import("@/pages/fin/fin-accounting"));

export function FinRoutes() {
  return (
    <>
      {/* Dashboard */}
      <Route path="/fin" component={FinDashboard} />
      <Route path="/fin/dashboard" component={FinDashboard} />

      {/* Income Documents */}
      <Route path="/fin/income" component={FinIncomeList} />
      <Route path="/fin/income/create" component={FinIncomeCreate} />
      <Route path="/fin/income/:id" component={FinIncomeDetails} />

      {/* Expense Documents */}
      <Route path="/fin/expenses" component={FinExpenseList} />
      <Route path="/fin/expenses/create" component={FinExpenseCreate} />
      <Route path="/fin/expenses/:id" component={FinExpenseDetails} />

      {/* Accounting */}
      <Route path="/fin/accounting" component={FinAccounting} />

      {/* Credit Clearing */}
      <Route path="/fin/credit" component={FinCreditClearing} />
      <Route path="/fin/credit/create" component={FinCreditClearing} />

      {/* Standing Orders */}
      <Route path="/fin/standing-orders" component={FinStandingOrders} />
      <Route path="/fin/standing-orders/create" component={FinStandingOrders} />

      {/* Recurring Documents */}
      <Route path="/fin/recurring" component={FinRecurring} />
      <Route path="/fin/recurring/create" component={FinRecurring} />
    </>
  );
}
