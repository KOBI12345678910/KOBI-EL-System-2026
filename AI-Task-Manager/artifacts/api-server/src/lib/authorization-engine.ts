/**
 * BASH44 Authorization Resolution Engine
 *
 * Enterprise RBAC + Data Scopes + Approval Limits
 *
 * Resolution order (deny overrides allow):
 * 1. system_super_admin → full access
 * 2. explicit_user_deny → block
 * 3. explicit_user_allow → allow (if data scope + approval pass)
 * 4. role_deny → block
 * 5. role_allow → allow (if data scope + approval pass)
 * 6. default → deny
 */

// ═══════════════════════════════════════════════════════════════
// Core Permission Resolution
// ═══════════════════════════════════════════════════════════════
export function resolvePermission(input: {
  isSystemAdmin: boolean;
  userDenies: string[];
  userAllows: string[];
  roleDenies: string[];
  roleAllows: string[];
  permissionCode: string;
  dataScopePassed: boolean;
  approvalLimitPassed: boolean;
}): boolean {
  // 1. Super admin bypasses everything
  if (input.isSystemAdmin) return true;

  // 2. Explicit user deny — highest priority block
  if (input.userDenies.includes(input.permissionCode)) return false;

  // 3. Explicit user allow — requires scope + approval
  if (input.userAllows.includes(input.permissionCode)) {
    return input.dataScopePassed && input.approvalLimitPassed;
  }

  // 4. Role deny — block
  if (input.roleDenies.includes(input.permissionCode)) return false;

  // 5. Role allow — requires scope + approval
  if (input.roleAllows.includes(input.permissionCode)) {
    return input.dataScopePassed && input.approvalLimitPassed;
  }

  // 6. Default deny
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Data Scope Check
// ═══════════════════════════════════════════════════════════════
export type DataScopeRule = {
  scopeType: "branch" | "warehouse" | "project" | "department" | "customer_group";
  scopeValue: string;
  accessMode: "ALLOW" | "DENY";
};

export function checkDataScope(
  userScopes: DataScopeRule[],
  entityScopeType: string,
  entityScopeValue: string
): boolean {
  const relevant = userScopes.filter((s) => s.scopeType === entityScopeType);

  // No scope rules = full access
  if (relevant.length === 0) return true;

  // Deny rules override allow
  const denied = relevant.find(
    (s) => s.accessMode === "DENY" && s.scopeValue === entityScopeValue
  );
  if (denied) return false;

  // Check if allowed
  const allowed = relevant.find(
    (s) => s.accessMode === "ALLOW" && s.scopeValue === entityScopeValue
  );
  return !!allowed;
}

// ═══════════════════════════════════════════════════════════════
// Approval Limit Check
// ═══════════════════════════════════════════════════════════════
export type ApprovalRule = {
  entityType: string;
  minAmount: number;
  maxAmount: number | null;
  requiredRoleCode: string;
  escalationRoleCode?: string;
};

export function checkApprovalLimit(
  rules: ApprovalRule[],
  entityType: string,
  amount: number,
  userRoleCodes: string[]
): { allowed: boolean; requiredRoles: string[]; escalationRole?: string } {
  const entityRules = rules.filter((r) => r.entityType === entityType);

  // No rules = no limit
  if (entityRules.length === 0) return { allowed: true, requiredRoles: [] };

  // Find matching tier
  const matchingRule = entityRules.find((r) => {
    const min = r.minAmount ?? 0;
    const max = r.maxAmount ?? Infinity;
    return amount >= min && amount < max;
  });

  if (!matchingRule) {
    // Amount exceeds all tiers — CEO required
    return { allowed: userRoleCodes.includes("CEO"), requiredRoles: ["CEO"] };
  }

  const hasRole = userRoleCodes.includes(matchingRule.requiredRoleCode);

  return {
    allowed: hasRole,
    requiredRoles: [matchingRule.requiredRoleCode],
    escalationRole: matchingRule.escalationRoleCode,
  };
}

// ═══════════════════════════════════════════════════════════════
// Field Visibility Resolution
// ═══════════════════════════════════════════════════════════════
export type FieldVisibility = "write" | "read" | "hidden";

export function resolveFieldVisibility(
  fieldPermissions: Array<{
    roleCode: string;
    fieldName: string;
    visibility: FieldVisibility;
  }>,
  userRoleCodes: string[],
  fieldName: string,
  isSystemAdmin: boolean
): FieldVisibility {
  if (isSystemAdmin) return "write";

  const relevant = fieldPermissions.filter((fp) => fp.fieldName === fieldName);
  if (relevant.length === 0) return "write"; // Default: full access

  // Find the highest access level across all user roles
  let best: FieldVisibility = "hidden";

  for (const fp of relevant) {
    if (userRoleCodes.includes(fp.roleCode)) {
      if (fp.visibility === "write") return "write"; // Can't get higher
      if (fp.visibility === "read" && best === "hidden") best = "read";
    }
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════
// Full Authorization Context Builder
// ═══════════════════════════════════════════════════════════════
export interface AuthorizationContext {
  userId: number;
  tenantId: number;
  isSystemAdmin: boolean;
  roleCodes: string[];
  roleAllows: string[];
  roleDenies: string[];
  userAllows: string[];
  userDenies: string[];
  dataScopes: DataScopeRule[];
  approvalRules: ApprovalRule[];
}

export function authorize(
  ctx: AuthorizationContext,
  permissionCode: string,
  options?: {
    entityScopeType?: string;
    entityScopeValue?: string;
    amount?: number;
    entityType?: string;
  }
): { allowed: boolean; reason: string } {
  // Data scope check
  let dataScopePassed = true;
  if (options?.entityScopeType && options?.entityScopeValue) {
    dataScopePassed = checkDataScope(
      ctx.dataScopes,
      options.entityScopeType,
      options.entityScopeValue
    );
  }

  // Approval limit check
  let approvalLimitPassed = true;
  if (options?.amount !== undefined && options?.entityType) {
    const result = checkApprovalLimit(
      ctx.approvalRules,
      options.entityType,
      options.amount,
      ctx.roleCodes
    );
    approvalLimitPassed = result.allowed;
  }

  // Core permission resolution
  const allowed = resolvePermission({
    isSystemAdmin: ctx.isSystemAdmin,
    userDenies: ctx.userDenies,
    userAllows: ctx.userAllows,
    roleDenies: ctx.roleDenies,
    roleAllows: ctx.roleAllows,
    permissionCode,
    dataScopePassed,
    approvalLimitPassed,
  });

  // Build reason
  let reason = "default_deny";
  if (allowed) {
    reason = ctx.isSystemAdmin ? "system_admin" : "permission_granted";
  } else if (!dataScopePassed) {
    reason = "data_scope_denied";
  } else if (!approvalLimitPassed) {
    reason = "approval_limit_exceeded";
  } else if (ctx.userDenies.includes(permissionCode)) {
    reason = "user_explicit_deny";
  } else if (ctx.roleDenies.includes(permissionCode)) {
    reason = "role_deny";
  }

  return { allowed, reason };
}

// ═══════════════════════════════════════════════════════════════
// Permission Codes Catalog
// ═══════════════════════════════════════════════════════════════
export const PERMISSION_CODES = {
  // System
  USERS_VIEW: "USERS_VIEW",
  USERS_CREATE: "USERS_CREATE",
  USERS_EDIT: "USERS_EDIT",
  USERS_DISABLE: "USERS_DISABLE",
  ROLES_VIEW: "ROLES_VIEW",
  ROLES_CREATE: "ROLES_CREATE",
  ROLES_EDIT: "ROLES_EDIT",
  PERMISSIONS_VIEW: "PERMISSIONS_VIEW",
  PERMISSIONS_EDIT: "PERMISSIONS_EDIT",
  AUDIT_VIEW: "AUDIT_VIEW",

  // Customers
  CUSTOMERS_VIEW: "CUSTOMERS_VIEW",
  CUSTOMERS_CREATE: "CUSTOMERS_CREATE",
  CUSTOMERS_EDIT: "CUSTOMERS_EDIT",

  // Vendors
  VENDORS_VIEW: "VENDORS_VIEW",
  VENDORS_CREATE: "VENDORS_CREATE",
  VENDORS_EDIT: "VENDORS_EDIT",

  // Items
  ITEMS_VIEW: "ITEMS_VIEW",
  ITEMS_CREATE: "ITEMS_CREATE",
  ITEMS_EDIT: "ITEMS_EDIT",
  ITEMS_COST_VIEW: "ITEMS_COST_VIEW",
  ITEMS_COST_EDIT: "ITEMS_COST_EDIT",

  // Inventory
  STOCK_VIEW: "STOCK_VIEW",
  STOCK_ADJUST: "STOCK_ADJUST",
  STOCK_TRANSFER: "STOCK_TRANSFER",

  // Procurement
  PR_CREATE: "PR_CREATE",
  PR_APPROVE: "PR_APPROVE",
  PO_CREATE: "PO_CREATE",
  PO_APPROVE: "PO_APPROVE",
  GOODS_RECEIPT_CREATE: "GOODS_RECEIPT_CREATE",
  AP_INVOICE_POST: "AP_INVOICE_POST",

  // Sales
  SALES_ORDER_CREATE: "SALES_ORDER_CREATE",
  SALES_ORDER_EDIT: "SALES_ORDER_EDIT",
  AR_INVOICE_POST: "AR_INVOICE_POST",

  // Projects
  PROJECT_VIEW: "PROJECT_VIEW",
  PROJECT_EDIT: "PROJECT_EDIT",
  PROJECT_MARGIN_VIEW: "PROJECT_MARGIN_VIEW",
  BOQ_EDIT: "BOQ_EDIT",

  // Finance
  JOURNAL_CREATE: "JOURNAL_CREATE",
  JOURNAL_POST: "JOURNAL_POST",
  GL_VIEW: "GL_VIEW",
  PNL_VIEW: "PNL_VIEW",
  BALANCE_SHEET_VIEW: "BALANCE_SHEET_VIEW",
} as const;

// ═══════════════════════════════════════════════════════════════
// Default Role → Permissions Mapping
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  CEO: Object.values(PERMISSION_CODES),
  SYSTEM_ADMIN: Object.values(PERMISSION_CODES),
  FINANCE_MANAGER: [
    "CUSTOMERS_VIEW", "VENDORS_VIEW", "ITEMS_VIEW", "ITEMS_COST_VIEW", "ITEMS_COST_EDIT",
    "STOCK_VIEW", "PO_APPROVE", "AP_INVOICE_POST", "AR_INVOICE_POST",
    "PROJECT_VIEW", "PROJECT_MARGIN_VIEW",
    "JOURNAL_CREATE", "JOURNAL_POST", "GL_VIEW", "PNL_VIEW", "BALANCE_SHEET_VIEW",
    "AUDIT_VIEW",
  ],
  PROCUREMENT_MANAGER: [
    "VENDORS_VIEW", "VENDORS_CREATE", "VENDORS_EDIT",
    "ITEMS_VIEW", "ITEMS_CREATE", "ITEMS_EDIT", "ITEMS_COST_VIEW",
    "STOCK_VIEW", "PR_CREATE", "PR_APPROVE", "PO_CREATE", "PO_APPROVE",
    "GOODS_RECEIPT_CREATE", "AP_INVOICE_POST",
  ],
  WAREHOUSE_MANAGER: [
    "ITEMS_VIEW", "STOCK_VIEW", "STOCK_ADJUST", "STOCK_TRANSFER",
    "GOODS_RECEIPT_CREATE",
  ],
  PROJECT_MANAGER: [
    "CUSTOMERS_VIEW", "ITEMS_VIEW", "STOCK_VIEW",
    "PROJECT_VIEW", "PROJECT_EDIT", "PROJECT_MARGIN_VIEW", "BOQ_EDIT",
    "PR_CREATE",
  ],
  SALES_MANAGER: [
    "CUSTOMERS_VIEW", "CUSTOMERS_CREATE", "CUSTOMERS_EDIT",
    "ITEMS_VIEW", "ITEMS_COST_VIEW", "STOCK_VIEW",
    "SALES_ORDER_CREATE", "SALES_ORDER_EDIT", "AR_INVOICE_POST",
    "PROJECT_VIEW",
  ],
  ACCOUNTANT: [
    "CUSTOMERS_VIEW", "VENDORS_VIEW", "ITEMS_VIEW", "ITEMS_COST_VIEW",
    "AP_INVOICE_POST", "AR_INVOICE_POST",
    "JOURNAL_CREATE", "JOURNAL_POST", "GL_VIEW", "PNL_VIEW", "BALANCE_SHEET_VIEW",
  ],
  PURCHASER: [
    "VENDORS_VIEW", "ITEMS_VIEW", "STOCK_VIEW",
    "PR_CREATE", "PO_CREATE", "GOODS_RECEIPT_CREATE",
  ],
  WAREHOUSE_OPERATOR: [
    "ITEMS_VIEW", "STOCK_VIEW", "STOCK_ADJUST", "STOCK_TRANSFER",
    "GOODS_RECEIPT_CREATE",
  ],
  VIEW_ONLY_AUDITOR: [
    "USERS_VIEW", "ROLES_VIEW", "PERMISSIONS_VIEW", "AUDIT_VIEW",
    "CUSTOMERS_VIEW", "VENDORS_VIEW", "ITEMS_VIEW", "ITEMS_COST_VIEW",
    "STOCK_VIEW", "PROJECT_VIEW", "PROJECT_MARGIN_VIEW",
    "GL_VIEW", "PNL_VIEW", "BALANCE_SHEET_VIEW",
  ],
};
