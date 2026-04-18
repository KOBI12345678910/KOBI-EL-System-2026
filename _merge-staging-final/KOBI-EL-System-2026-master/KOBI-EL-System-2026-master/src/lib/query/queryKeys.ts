/**
 * Canonical React Query key definitions — TechnoKol Uzi ERP 2026
 *
 * Rules:
 *  - Every list page gets stable query keys
 *  - Every 360 page gets one root key plus tab-specific keys
 *  - Mutations must invalidate affected parent summaries and control rooms
 *  - No random ad hoc keys
 */

// ─── Control Rooms ──────────────────────────────────────────
export const executiveControlTower = () => ["executiveControlTower"] as const;
export const operationsControlRoom = () => ["operationsControlRoom"] as const;
export const procurementControlRoom = () => ["procurementControlRoom"] as const;
export const financeControlRoom = () => ["financeControlRoom"] as const;
export const workforceControlRoom = () => ["workforceControlRoom"] as const;
export const aiControlRoom = () => ["aiControlRoom"] as const;

// ─── 360 Pages (root) ──────────────────────────────────────
export const customer360 = (id: number) => ["customer360", id] as const;
export const supplier360 = (id: number) => ["supplier360", id] as const;
export const quote360 = (id: number) => ["quote360", id] as const;
export const rfq360 = (id: number) => ["rfq360", id] as const;
export const project360 = (id: number) => ["project360", id] as const;
export const workOrder360 = (id: number) => ["workOrder360", id] as const;
export const po360 = (id: number) => ["po360", id] as const;
export const finance360 = () => ["finance360"] as const;
export const employee360 = (id: number) => ["employee360", id] as const;

// ─── 360 Tabs ──────────────────────────────────────────────
export const customer360Tab = (id: number, tab: string) => ["customer360", id, tab] as const;
export const project360Tab = (id: number, tab: string) => ["project360", id, tab] as const;
export const employee360Tab = (id: number, tab: string) => ["employee360", id, tab] as const;
export const workOrder360Tab = (id: number, tab: string) => ["workOrder360", id, tab] as const;

// ─── List Pages ────────────────────────────────────────────
export const customerList = (filters?: Record<string, unknown>) => ["customers", filters] as const;
export const supplierList = (filters?: Record<string, unknown>) => ["suppliers", filters] as const;
export const quoteList = (filters?: Record<string, unknown>) => ["quotes", filters] as const;
export const rfqList = (filters?: Record<string, unknown>) => ["rfqs", filters] as const;
export const poList = (filters?: Record<string, unknown>) => ["purchaseOrders", filters] as const;
export const projectList = (filters?: Record<string, unknown>) => ["projects", filters] as const;
export const workOrderList = (filters?: Record<string, unknown>) => ["workOrders", filters] as const;
export const invoiceList = (filters?: Record<string, unknown>) => ["invoices", filters] as const;
export const employeeList = (filters?: Record<string, unknown>) => ["employees", filters] as const;
export const alertList = (filters?: Record<string, unknown>) => ["alerts", filters] as const;

// ─── Mutation Invalidation Maps ────────────────────────────
// Usage: on mutation success, invalidate all keys returned by the map.
export const invalidationMap = {
  approveQuote: (quoteId: number, customerId: number) => [
    quote360(quoteId),
    customer360(customerId),
    executiveControlTower(),
  ],
  receivePo: (poId: number, projectId?: number) => [
    po360(poId),
    procurementControlRoom(),
    operationsControlRoom(),
    ...(projectId ? [project360(projectId)] : []),
  ],
  issueInvoice: (invoiceId: number, customerId: number, projectId?: number) => [
    finance360(),
    customer360(customerId),
    financeControlRoom(),
    executiveControlTower(),
    ...(projectId ? [project360(projectId)] : []),
  ],
  approveAttendance: (employeeId: number, projectId?: number) => [
    employee360(employeeId),
    workforceControlRoom(),
    ...(projectId ? [project360(projectId)] : []),
  ],
  createCustomer: () => [
    customerList(),
    executiveControlTower(),
  ],
  createProject: (customerId: number) => [
    customer360(customerId),
    projectList(),
    operationsControlRoom(),
    executiveControlTower(),
  ],
  createSupplier: () => [
    supplierList(),
    procurementControlRoom(),
  ],
  createWorkOrder: (projectId: number) => [
    project360(projectId),
    workOrderList(),
    operationsControlRoom(),
  ],
  sendRfq: (rfqId: number) => [
    rfq360(rfqId),
    rfqList(),
    procurementControlRoom(),
  ],
  approvePo: (poId: number, projectId?: number) => [
    po360(poId),
    poList(),
    procurementControlRoom(),
    ...(projectId ? [project360(projectId)] : []),
  ],
  submitAttendance: (employeeId: number) => [
    employee360(employeeId),
    workforceControlRoom(),
  ],
  convertQuoteToProject: (quoteId: number, customerId: number) => [
    quote360(quoteId),
    customer360(customerId),
    projectList(),
    executiveControlTower(),
    operationsControlRoom(),
  ],
  changeProjectState: (projectId: number) => [
    project360(projectId),
    projectList(),
    operationsControlRoom(),
    executiveControlTower(),
  ],
  registerPayment: (invoiceId: number, customerId: number) => [
    finance360(),
    customer360(customerId),
    invoiceList(),
    financeControlRoom(),
    executiveControlTower(),
  ],
} as const;
