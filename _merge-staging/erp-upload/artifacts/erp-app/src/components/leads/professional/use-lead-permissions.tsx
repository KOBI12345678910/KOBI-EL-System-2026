import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeadPermissions {
  canEditLead: boolean;
  canChangeStage: boolean;
  canChangeSource: boolean;
  canDelete: false | "approve" | "request";
  canChangeOwnership: boolean;
  canEditSensitiveFields: boolean;
  canAddModules: boolean;
  userRole: "admin" | "manager" | "sales_rep" | null;
  isOwner: boolean;
  isManager: boolean;
  isAdmin: boolean;
}

interface UserRecord {
  role?: string;
  email?: string;
}

interface LeadRecord {
  owner_user_id?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useLeadPermissions(
  user: UserRecord | undefined | null,
  lead: LeadRecord | undefined | null
): LeadPermissions {
  return useMemo<LeadPermissions>(() => {
    if (!user) {
      return {
        canEditLead: false,
        canChangeStage: false,
        canChangeSource: false,
        canDelete: false,
        canChangeOwnership: false,
        canEditSensitiveFields: false,
        canAddModules: false,
        userRole: null,
        isOwner: false,
        isManager: false,
        isAdmin: false,
      };
    }

    const isAdmin = user.role === "admin";
    const isManager = isAdmin; // For now, admin = manager
    const isOwner = lead?.owner_user_id === user.email;

    return {
      canEditLead: isManager || isOwner,
      canChangeStage: true,
      canChangeSource: isManager,
      canDelete: isManager ? "approve" : "request",
      canChangeOwnership: isManager,
      canEditSensitiveFields: isManager,
      canAddModules: isManager,
      userRole: isAdmin ? "admin" : isManager ? "manager" : "sales_rep",
      isOwner,
      isManager,
      isAdmin,
    };
  }, [user, lead]);
}

/**
 * Field-level permissions
 */
export function useFieldPermission(permissions: LeadPermissions, fieldName: string): boolean {
  const sensitiveFields = [
    "sensitive_notes",
    "risk_score",
    "probability_to_close",
    "custom_fields",
    "source",
    "owner_user_id",
    "assigned_region",
  ];

  if (sensitiveFields.includes(fieldName)) {
    return permissions.canEditSensitiveFields;
  }

  return permissions.canEditLead;
}
