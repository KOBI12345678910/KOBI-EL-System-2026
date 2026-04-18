import { useState, useEffect } from "react";
import { getPermissions } from './PermissionGate';
import { authJson } from "@/lib/utils";

/**
 * Filter menu items based on user role
 */
export function filterMenuItemsByRole(menuItems, userRole) {
  const permissions = getPermissions(userRole);
  
  // Admin/managers see everything
  if (permissions.pages[0] === '*') {
    return menuItems;
  }

  return menuItems
    .map(item => {
      // If item has no page property, it's a category menu
      if (!item.page) {
        // Filter submenu items
        if (item.submenu) {
          const filteredSubmenu = item.submenu.filter(sub => 
            permissions.pages.includes(sub.page)
          );
          
          // Return item only if it has filtered submenu items
          if (filteredSubmenu.length > 0) {
            return { ...item, submenu: filteredSubmenu };
          }
        }
        return null;
      }
      
      // Filter single page items
      return permissions.pages.includes(item.page) ? item : null;
    })
    .filter(Boolean);
}

/**
 * Hook to get role-based permissions
 */
export function usePermissions() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authJson("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const permissions = getPermissions(user?.role || 'viewer');
  
  return {
    user,
    loading,
    role: user?.role || 'viewer',
    permissions,
    canImport: permissions.canImport,
    canExport: permissions.canExport,
    canDelete: permissions.canDelete,
  };
}