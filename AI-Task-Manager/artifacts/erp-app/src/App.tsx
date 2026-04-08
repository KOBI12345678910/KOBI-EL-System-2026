import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { isDataHungryRoute, triggerSyncForModule } from "@/lib/sync-manager";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { Layout } from "@/components/layout";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { AuthContext } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ui/unified-states";
import { useToast } from "@/hooks/use-toast";
import { setSentryUser, clearSentryUser, captureError, Sentry } from "@/lib/sentry";
import { hebrewApiError } from "@/lib/error-utils";
import { addNetworkErrorListener, NetworkTimeoutError, STREAMING_URL_PATTERNS } from "@/lib/utils";
import { lazyPage } from "@/routes/lazy-utils";
import { usePageTitle } from "@/hooks/use-page-title";

import { FinanceRoutes } from "@/routes/finance-routes";
import { HRRoutes } from "@/routes/hr-routes";
import { CRMRoutes } from "@/routes/crm-routes";
import { ProductionRoutes } from "@/routes/production-routes";
import { ProcurementRoutes } from "@/routes/procurement-routes";
import { BuilderRoutes } from "@/routes/builder-routes";
import { SalesRoutes } from "@/routes/sales-routes";
import { InventoryRoutes } from "@/routes/inventory-routes";
import { PlatformRoutes } from "@/routes/platform-routes";
import { AIRoutes } from "@/routes/ai-routes";
import { OtherRoutes } from "@/routes/other-routes";

const OnboardingTour = lazy(() =>
  import("@/components/onboarding-tour").then((m) => ({ default: m.OnboardingTour }))
);

const LoginPage = lazyPage(() => import("@/pages/login"));
const Dashboard = lazyPage(() => import("@/pages/dashboard"));
const KPIDashboard = lazyPage(() => import("@/pages/reports/kpi-dashboard"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const ForbiddenPage = lazyPage(() => import("@/pages/forbidden"));
const ForgotPasswordPage = lazyPage(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazyPage(() => import("@/pages/reset-password"));
const PortalLoginPage = lazyPage(() => import("@/pages/portal/portal-login"));
const SupplierPortalPage = lazyPage(() => import("@/pages/portal/supplier-portal"));
const ContractorPortalPage = lazyPage(() => import("@/pages/portal/contractor-portal"));
const EmployeePortalPage = lazyPage(() => import("@/pages/portal/employee-portal"));
const PortalManagementPage = lazyPage(() => import("@/pages/portal/portal-management"));
const CustomerPortalLoginPage = lazyPage(() => import("@/pages/portal/customer-portal-login"));
const CustomerPortalDashboardPage = lazyPage(() => import("@/pages/portal/customer-portal-dashboard"));
const CustomerProjectPortalPage = lazyPage(() => import("@/pages/projects/customer-project-portal-page"));
const InventoryManagementPage = lazyPage(() => import("@/pages/modules/inventory-management"));
const ProductionDashboardPage = lazyPage(() => import("@/pages/production/production-dashboard"));

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
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={() => window.location.reload()} className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors">
          נסה שוב
        </button>
        <button onClick={() => window.history.back()} className="px-5 py-2 border border-border rounded-lg hover:bg-muted text-sm font-medium transition-colors">
          חזור אחורה
        </button>
        <button onClick={() => { window.location.href = import.meta.env.BASE_URL; }} className="px-5 py-2 border border-border rounded-lg hover:bg-muted text-sm font-medium transition-colors">
          חזור לדף הבית
        </button>
      </div>
    </div>
  );
}

function Router() {
  const [location, setLocation] = useLocation();

  usePageTitle();

  useEffect(() => {
    if (isDataHungryRoute(location)) {
      triggerSyncForModule();
    }
  }, [location]);

  if (location === "/login" || location === "/login/") {
    setLocation("/", { replace: true });
    return null;
  }
  return (
    <Layout>
      <ErrorBoundary key={location} fallback={<LazyErrorFallback />}>
      <Suspense fallback={<PageLoader />}>
        <Switch key={location}>
          <Route path="/" component={KPIDashboard} />
          <Route path="/platform" component={Dashboard} />
          <Route path="/dashboard"><Redirect to="/" /></Route>
          <Route path="/accounting"><Redirect to="/finance/accounting-portal" /></Route>
          <Route path="/blackrock"><Redirect to="/finance/blackrock-2026" /></Route>
          <Route path="/kimi"><Redirect to="/ai-engine/kimi" /></Route>
          <Route path="/kimi2"><Redirect to="/ai-engine/kimi" /></Route>
          <Route path="/employees"><Redirect to="/hr/employees" /></Route>
          <Route path="/payroll"><Redirect to="/hr/payroll" /></Route>
          <Route path="/attendance"><Redirect to="/hr/attendance" /></Route>
          <Route path="/inventory" component={InventoryManagementPage} />
          <Route path="/production" component={ProductionDashboardPage} />

          {FinanceRoutes}
          {HRRoutes}
          {CRMRoutes}
          {ProductionRoutes}
          {ProcurementRoutes}
          {BuilderRoutes}
          {SalesRoutes}
          {InventoryRoutes}
          {PlatformRoutes}
          {AIRoutes}
          {OtherRoutes}

          <Route path="/403" component={ForbiddenPage} />
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
        <Route path="/portal/customer/login" component={CustomerPortalLoginPage} />
        <Route path="/portal/customer/dashboard" component={CustomerPortalDashboardPage} />
        <Route path="/portal/project/:token">
          {(params) => <CustomerProjectPortalPage token={params.token || ""} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function GlobalErrorHandler() {
  const { toast } = useToast();
  useEffect(() => {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      const msg = event.reason?.message || String(event.reason) || "שגיאה לא צפויה";
      if (
        msg.includes("ResizeObserver") ||
        msg.includes("Script error") ||
        msg.includes("cancelled") ||
        msg.includes("AbortError") ||
        msg.includes("NetworkError") ||
        msg.includes("timeout") ||
        msg.includes("הבקשה נכשלה עקב timeout")
      ) return;
      console.error("[Unhandled rejection]", event.reason);
      captureError(event.reason, { type: "unhandledrejection" });
      const status = event.reason?.status || event.reason?.statusCode;
      if (status === 401 || status === 403) return;
      const message = hebrewApiError(Number(event.reason?.status || event.reason?.statusCode) || 500, msg) || msg;
      if (message.length < 200) {
        toast({
          title: "שגיאה",
          description: message,
          variant: "destructive",
        });
      }
    };
    const errorHandler = (event: ErrorEvent) => {
      if (
        event.message?.includes("ResizeObserver") ||
        event.message?.includes("Script error") ||
        !event.message
      ) return;
      console.error("[Uncaught error]", event.error);
      captureError(event.error ?? new Error(event.message), { type: "window.onerror", filename: event.filename });
    };
    const removeNetworkListener = addNetworkErrorListener((err) => {
      if (
        err instanceof NetworkTimeoutError &&
        err.url !== undefined &&
        STREAMING_URL_PATTERNS.some(p => err.url!.includes(p))
      ) return;
      toast({
        title: "שגיאת רשת",
        description: "לא ניתן להתחבר לשרת",
        variant: "destructive",
      });
    });
    window.addEventListener("unhandledrejection", rejectionHandler);
    window.addEventListener("error", errorHandler);
    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      window.removeEventListener("error", errorHandler);
      removeNetworkListener();
    };
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
    clearSentryUser();
  }, [token, apiBase]);

  useEffect(() => {
    const handleAuthLogout = () => {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("token");
      localStorage.removeItem("erp_user");
      setToken(null);
      setUser(null);
      clearSentryUser();
    };
    window.addEventListener("erp:auth:logout", handleAuthLogout);
    return () => window.removeEventListener("erp:auth:logout", handleAuthLogout);
  }, []);

  useEffect(() => {
    if (isPortalPath || !token || !user) return;

    let activityDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleActivity = () => {
      if (activityDebounceTimer) return;
      activityDebounceTimer = setTimeout(() => {
        activityDebounceTimer = null;
        const activeToken = localStorage.getItem("erp_token") || localStorage.getItem("token");
        if (!activeToken) return;
        fetch(`${apiBase}/api/auth/refresh-session`, {
          method: "POST",
          headers: { Authorization: `Bearer ${activeToken}` },
        }).catch(() => {});
      }, 60_000);
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    const heartbeatInterval = setInterval(() => {
      const activeToken = localStorage.getItem("erp_token") || localStorage.getItem("token");
      if (!activeToken) return;
      fetch(`${apiBase}/api/auth/refresh-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
      }).then(r => {
        if (r.status === 401) {
          localStorage.removeItem("erp_token");
          localStorage.removeItem("token");
          localStorage.removeItem("erp_user");
          setToken(null);
          setUser(null);
          clearSentryUser();
        }
      }).catch(() => {});
    }, 5 * 60_000);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      if (activityDebounceTimer) clearTimeout(activityDebounceTimer);
      clearInterval(heartbeatInterval);
    };
  }, [isPortalPath, token, user, apiBase]);

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
    localStorage.setItem("erp_user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    setSentryUser(
      Number(userData.id || 0),
      String(userData.username || userData.name || ""),
      String(userData.role || "user"),
    );
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const currentPath = window.location.pathname;
    const rel = currentPath.startsWith(base) ? currentPath.slice(base.length) : currentPath;
    if (rel === "/login" || rel === "/login/" || rel === "") {
      window.history.replaceState(null, "", base + "/");
    }
  }

  if (isPortalPath) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmDialogProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <PortalRouter />
            </WouterRouter>
            <Toaster />
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
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const relativePath = path.startsWith(base) ? path.slice(base.length) : path;
    const isForgot = relativePath === "/forgot-password";
    const resetMatch = relativePath.match(/^\/reset-password(?:\/(.+))?$/);
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ErrorBoundary fallback={<LazyErrorFallback />}>
            <Suspense fallback={<PageLoader />}>
              {isForgot ? (
                <ForgotPasswordPage onBack={() => { window.history.replaceState(null, "", base + "/"); window.location.reload(); }} />
              ) : resetMatch ? (
                <ResetPasswordPage token={resetMatch[1] || ""} />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )}
            </Suspense>
          </ErrorBoundary>
          <Toaster />
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
              <Sentry.ErrorBoundary fallback={<LazyErrorFallback />}>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                </WouterRouter>
                <Suspense fallback={null}>
                  <OnboardingTour />
                </Suspense>
                <Toaster />
                <GlobalErrorHandler />
              </Sentry.ErrorBoundary>
            </ConfirmDialogProvider>
          </TooltipProvider>
        </PermissionsProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function AppWithTopLevelErrorBoundary() {
  return (
    <ErrorBoundary fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">אירעה שגיאה במערכת</h1>
          <p className="text-sm text-slate-400 mb-6">המערכת נתקלה בשגיאה לא צפויה. נסה לרענן את הדף או לחזור לדשבורד.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              נסה שוב
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-5 py-2.5 border border-slate-600 rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors"
            >
              חזור אחורה
            </button>
            <button
              onClick={() => { window.location.href = import.meta.env.BASE_URL || "/"; }}
              className="px-5 py-2.5 border border-slate-600 rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    }>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithTopLevelErrorBoundary;
