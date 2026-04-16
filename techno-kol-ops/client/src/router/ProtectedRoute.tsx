import React from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../hooks/usePermissions";

type ProtectedRouteProps = {
  requiredPermission?: string;
  children: React.ReactNode;
};

/**
 * Wraps a route element and checks the user's permissions before rendering.
 * If `requiredPermission` is set and the user lacks it → redirect to /unauthorized.
 * If no `requiredPermission` → render children immediately (any authenticated user).
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredPermission,
  children,
}) => {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">
        בודק הרשאות...
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
