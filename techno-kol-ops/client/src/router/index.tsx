import React, { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../app/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { appRouteRegistry } from "./routeRegistry";

/** Suspense fallback for lazy-loaded routes */
const RouteFallback = () => (
  <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">
    טוען עמוד...
  </div>
);

/** Unauthorized landing page */
const Unauthorized = () => (
  <div className="flex flex-col items-center justify-center h-64 gap-4">
    <div className="text-red-400 text-4xl">🔒</div>
    <h1 className="text-lg font-bold text-white">אין הרשאה</h1>
    <p className="text-gray-400 text-sm">אין לך הרשאה לצפות בעמוד זה. פנה למנהל המערכת.</p>
  </div>
);

/**
 * Build route children from the registry.
 * Each route is wrapped in Suspense (for lazy loading) + ProtectedRoute (for permissions).
 */
const registryRoutes = appRouteRegistry.map((r) => ({
  path: r.path.replace(/^\//, ""), // strip leading slash for nested routes
  element: (
    <Suspense fallback={<RouteFallback />}>
      <ProtectedRoute requiredPermission={r.requiredPermission}>
        <r.component />
      </ProtectedRoute>
    </Suspense>
  ),
}));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      // Default → Operations
      { index: true, element: <Navigate to="/operations" replace /> },

      // ── All registry routes (lazy + permission-gated) ──
      ...registryRoutes,

      // ── List pages (for menu navigation) ──
      { path: "customers", element: <div className="text-gray-400">רשימת לקוחות — TODO</div> },
      { path: "suppliers", element: <div className="text-gray-400">רשימת ספקים — TODO</div> },
      { path: "projects", element: <div className="text-gray-400">רשימת פרויקטים — TODO</div> },
      { path: "work-orders", element: <div className="text-gray-400">הזמנות עבודה — TODO</div> },
      { path: "rfqs", element: <div className="text-gray-400">בקשות הצעת מחיר — TODO</div> },
      { path: "pos", element: <div className="text-gray-400">הזמנות רכש — TODO</div> },
      { path: "employees", element: <div className="text-gray-400">רשימת עובדים — TODO</div> },
      { path: "payroll", element: <div className="text-gray-400">שכר — TODO</div> },
      { path: "attendance", element: <div className="text-gray-400">נוכחות — TODO</div> },

      // ── Unauthorized ──
      { path: "unauthorized", element: <Unauthorized /> },
    ],
  },
]);
