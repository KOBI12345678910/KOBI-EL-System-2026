import { useEffect, useState } from "react";

/**
 * Permission roles and their allowed pages/features
 * Supports: admin, manager, sales_agent, technical, viewer
 */
const ROLE_PERMISSIONS = {
  admin: {
    pages: ['*'], // All pages
    features: ['*'], // All features
    canImport: true,
    canExport: true,
    canDelete: true,
  },
  manager: {
    pages: ['*'],
    features: ['*'],
    canImport: true,
    canExport: true,
    canDelete: true,
  },
  sales_agent: {
    pages: [
      'Dashboard', 'Leads', 'LeadDetail', 'Deals', 'DealDetail', 'Customers', 'Customer360',
      'Quotes', 'SalesOrders', 'Activities', 'Contacts', 'Companies', 'Opportunities',
      'Tasks', 'Meetings', 'MeetingsCalendar', 'CalendarReminders', 'SalesPersonDashboard',
      'CRMDashboard', 'CRMPipeline', 'PipelineKanban'
    ],
    features: [
      'view_leads', 'create_leads', 'edit_leads', 'log_call', 'send_email', 'send_whatsapp',
      'create_quote', 'create_order', 'view_customer_details', 'add_activity', 'schedule_meeting'
    ],
    canImport: false, // Sales agents cannot import
    canExport: true,
    canDelete: false,
  },
  technical: {
    pages: [
      'Dashboard', 'ProductionOrders', 'ProductionBoard', 'Inventory', 'QualityControl',
      'Drawings', 'BOMs', 'WorkOrders', 'Tasks', 'CalendarReminders'
    ],
    features: [
      'view_production', 'manage_inventory', 'log_defects', 'view_drawings', 'update_tasks'
    ],
    canImport: false,
    canExport: true,
    canDelete: false,
  },
  viewer: {
    pages: ['Dashboard', 'Reports'],
    features: ['view_dashboards', 'view_reports'],
    canImport: false,
    canExport: false,
    canDelete: false,
  }
};

export function canAccessPage(userRole, pageName) {
  const permissions = ROLE_PERMISSIONS[userRole];
  if (!permissions) return false;
  
  // Admin and managers can access everything
  if (permissions.pages[0] === '*') return true;
  
  return permissions.pages.includes(pageName);
}

export function canAccessFeature(userRole, featureName) {
  const permissions = ROLE_PERMISSIONS[userRole];
  if (!permissions) return false;
  
  if (permissions.features[0] === '*') return true;
  
  return permissions.features.includes(featureName);
}

export function getPermissions(userRole) {
  return ROLE_PERMISSIONS[userRole] || { pages: [], features: [], canImport: false, canExport: false, canDelete: false };
}

/**
 * PermissionGate Component - Shows content only if user has permission
 */
export default function PermissionGate({
  children,
  requiredRole = null,
  requiredFeature = null,
  fallback = null,
  userRole = null
}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authJson("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-slate-500">טוען הרשאות...</div>;

  const role = userRole || user?.role || 'viewer';
  const permissions = getPermissions(role);

  // Check role requirement
  if (requiredRole && role !== requiredRole) {
    return fallback || <div className="p-4 text-red-600">אין לך הרשאה לגשת לחלק זה</div>;
  }

  // Check feature requirement
  if (requiredFeature && !canAccessFeature(role, requiredFeature)) {
    return fallback || <div className="p-4 text-red-600">אין לך הרשאה לבצע פעולה זו</div>;
  }

  return children;
}