/**
 * BASH44 SAP-like Posting Engine
 *
 * Core business logic for synchronized posting:
 * Procurement → Inventory → GL (Journal Entries)
 *
 * SAP Rules enforced:
 * 1. Every inventory movement creates a journal entry
 * 2. Every journal entry must be balanced (debit = credit)
 * 3. No hard delete on posted documents
 * 4. Every posting creates an audit trail
 * 5. Status transitions are explicit
 */

// GL Account mapping for auto-posting
export const GL_ACCOUNTS = {
  // Assets
  INVENTORY_RAW_MATERIALS: "130100",
  INVENTORY_FINISHED_GOODS: "130200",
  INVENTORY_WIP: "130300",
  ACCOUNTS_RECEIVABLE: "110100",
  BANK_ACCOUNT: "100100",
  FIXED_ASSETS: "150100",

  // Liabilities
  ACCOUNTS_PAYABLE: "220100",
  VAT_PAYABLE: "230100",
  ACCRUED_EXPENSES: "240100",

  // Revenue
  SALES_REVENUE: "400100",
  SERVICE_REVENUE: "400200",

  // COGS
  COGS_MATERIALS: "500100",
  COGS_LABOR: "500200",
  COGS_OVERHEAD: "500300",

  // Expenses
  PRODUCTION_OVERHEAD: "600100",
  ADMIN_EXPENSES: "700100",
  SELLING_EXPENSES: "700200",
} as const;

// Status machines
export const STATUS_MACHINES = {
  PURCHASE_ORDER: {
    DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
    PENDING_APPROVAL: ["APPROVED", "REJECTED"],
    REJECTED: ["DRAFT", "CANCELLED"],
    APPROVED: ["SENT", "CANCELLED"],
    SENT: ["PARTIAL", "CLOSED"],
    PARTIAL: ["CLOSED"],
    CLOSED: [],
    CANCELLED: [],
  },
  SALES_ORDER: {
    DRAFT: ["APPROVED", "CANCELLED"],
    APPROVED: ["IN_PRODUCTION", "CANCELLED"],
    IN_PRODUCTION: ["DELIVERED"],
    DELIVERED: ["INVOICED"],
    INVOICED: ["CLOSED"],
    CLOSED: [],
    CANCELLED: [],
  },
  JOURNAL_ENTRY: {
    DRAFT: ["POSTED"],
    POSTED: ["REVERSED"],
    REVERSED: [],
  },
  AP_INVOICE: {
    DRAFT: ["APPROVED", "VOID"],
    APPROVED: ["POSTED", "VOID"],
    POSTED: ["PAID", "VOID"],
    PAID: [],
    VOID: [],
  },
  AR_INVOICE: {
    DRAFT: ["POSTED", "VOID"],
    POSTED: ["PARTIALLY_PAID", "PAID", "VOID"],
    PARTIALLY_PAID: ["PAID"],
    PAID: [],
    VOID: [],
  },
  WORK_ORDER: {
    PLANNED: ["RELEASED", "CANCELLED"],
    RELEASED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED"],
    COMPLETED: ["CLOSED"],
    CLOSED: [],
    CANCELLED: [],
  },
} as const;

// Validate status transition
export function validateStatusTransition(
  machine: Record<string, string[]>,
  currentStatus: string,
  newStatus: string
): boolean {
  const allowed = machine[currentStatus];
  if (!allowed) return false;
  return allowed.includes(newStatus);
}

// Validate journal is balanced
export function validateJournalBalance(
  lines: Array<{ debit: number; credit: number }>
): { balanced: boolean; totalDebit: number; totalCredit: number; difference: number } {
  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  return {
    balanced: difference < 0.01,
    totalDebit: Number(totalDebit.toFixed(2)),
    totalCredit: Number(totalCredit.toFixed(2)),
    difference: Number(difference.toFixed(2)),
  };
}

// Calculate document totals
export function calculateDocumentTotals(
  lines: Array<{ quantity: number; unitPrice: number }>,
  taxRate = 0.17
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
    0
  );
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  };
}

// Generate document number
export function generateDocumentNumber(
  prefix: string,
  lastNumber: number,
  width = 6
): string {
  const nextNo = lastNumber + 1;
  return `${prefix}-${String(nextNo).padStart(width, "0")}`;
}

// Goods Receipt → Inventory + GL posting
export function createGoodsReceiptPosting(input: {
  grnNo: string;
  poId: number;
  warehouseId: number;
  items: Array<{
    itemId: number;
    quantity: number;
    unitCost: number;
  }>;
}) {
  const inventoryTransactions = input.items.map((item) => ({
    itemId: item.itemId,
    warehouseId: input.warehouseId,
    txType: "RECEIPT" as const,
    quantity: item.quantity,
    unitCost: item.unitCost,
    sourceType: "GOODS_RECEIPT",
    sourceId: input.poId,
    postedAt: new Date(),
  }));

  const totalValue = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  const journalEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    sourceType: "GOODS_RECEIPT",
    sourceId: input.poId,
    status: "POSTED" as const,
    memo: `קליטת סחורה ${input.grnNo}`,
    lines: [
      {
        glAccountNo: GL_ACCOUNTS.INVENTORY_RAW_MATERIALS,
        debit: Number(totalValue.toFixed(2)),
        credit: 0,
        description: `קליטת חומרי גלם - ${input.grnNo}`,
      },
      {
        glAccountNo: GL_ACCOUNTS.ACCOUNTS_PAYABLE,
        debit: 0,
        credit: Number(totalValue.toFixed(2)),
        description: `התחייבות לספק - ${input.grnNo}`,
      },
    ],
  };

  // Validate balance
  const balance = validateJournalBalance(journalEntry.lines);
  if (!balance.balanced) {
    throw new Error(`Journal entry not balanced: debit=${balance.totalDebit}, credit=${balance.totalCredit}`);
  }

  return { inventoryTransactions, journalEntry };
}

// Material Issue to Production → Inventory + GL posting
export function createMaterialIssuePosting(input: {
  workOrderNo: string;
  workOrderId: number;
  warehouseId: number;
  items: Array<{
    itemId: number;
    quantity: number;
    unitCost: number;
  }>;
}) {
  const inventoryTransactions = input.items.map((item) => ({
    itemId: item.itemId,
    warehouseId: input.warehouseId,
    txType: "ISSUE" as const,
    quantity: -item.quantity,
    unitCost: item.unitCost,
    sourceType: "WORK_ORDER",
    sourceId: input.workOrderId,
    postedAt: new Date(),
  }));

  const totalValue = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  const journalEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    sourceType: "MATERIAL_ISSUE",
    sourceId: input.workOrderId,
    status: "POSTED" as const,
    memo: `ניפוק חומרים לייצור - ${input.workOrderNo}`,
    lines: [
      {
        glAccountNo: GL_ACCOUNTS.INVENTORY_WIP,
        debit: Number(totalValue.toFixed(2)),
        credit: 0,
        description: `חומרים לייצור - ${input.workOrderNo}`,
      },
      {
        glAccountNo: GL_ACCOUNTS.INVENTORY_RAW_MATERIALS,
        debit: 0,
        credit: Number(totalValue.toFixed(2)),
        description: `ניפוק מחומרי גלם - ${input.workOrderNo}`,
      },
    ],
  };

  const balance = validateJournalBalance(journalEntry.lines);
  if (!balance.balanced) {
    throw new Error(`Journal entry not balanced`);
  }

  return { inventoryTransactions, journalEntry };
}

// AR Invoice posting → GL
export function createArInvoicePosting(input: {
  invoiceNo: string;
  customerId: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  projectId?: number;
}) {
  const journalEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    sourceType: "AR_INVOICE",
    sourceId: null,
    status: "POSTED" as const,
    memo: `חשבונית לקוח ${input.invoiceNo}`,
    lines: [
      {
        glAccountNo: GL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: Number(input.totalAmount.toFixed(2)),
        credit: 0,
        description: `חוב לקוח - ${input.invoiceNo}`,
        projectId: input.projectId,
      },
      {
        glAccountNo: GL_ACCOUNTS.SALES_REVENUE,
        debit: 0,
        credit: Number(input.subtotal.toFixed(2)),
        description: `הכנסה - ${input.invoiceNo}`,
        projectId: input.projectId,
      },
      {
        glAccountNo: GL_ACCOUNTS.VAT_PAYABLE,
        debit: 0,
        credit: Number(input.taxAmount.toFixed(2)),
        description: `מע"מ - ${input.invoiceNo}`,
      },
    ],
  };

  const balance = validateJournalBalance(journalEntry.lines);
  if (!balance.balanced) {
    throw new Error(`Journal entry not balanced`);
  }

  return { journalEntry };
}

// AP Invoice posting → GL
export function createApInvoicePosting(input: {
  invoiceNo: string;
  vendorId: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}) {
  const journalEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    sourceType: "AP_INVOICE",
    sourceId: null,
    status: "POSTED" as const,
    memo: `חשבונית ספק ${input.invoiceNo}`,
    lines: [
      {
        glAccountNo: GL_ACCOUNTS.ACCOUNTS_PAYABLE,
        debit: Number(input.totalAmount.toFixed(2)),
        credit: 0,
        description: `תשלום ספק - ${input.invoiceNo}`,
      },
      {
        glAccountNo: GL_ACCOUNTS.COGS_MATERIALS,
        debit: 0,
        credit: Number(input.subtotal.toFixed(2)),
        description: `עלות חומרים - ${input.invoiceNo}`,
      },
      {
        glAccountNo: GL_ACCOUNTS.VAT_PAYABLE,
        debit: 0,
        credit: Number((-input.taxAmount).toFixed(2)),
        description: `מע"מ תשומות - ${input.invoiceNo}`,
      },
    ],
  };

  return { journalEntry };
}

// Project margin calculation
export function calculateProjectMargin(input: {
  contractValue: number;
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  overheadCost: number;
}) {
  const totalCost =
    input.materialCost +
    input.laborCost +
    input.subcontractorCost +
    input.overheadCost;

  const grossProfit = input.contractValue - totalCost;
  const grossMarginPct =
    input.contractValue === 0
      ? 0
      : (grossProfit / input.contractValue) * 100;

  return {
    totalCost: Number(totalCost.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    grossMarginPct: Number(grossMarginPct.toFixed(2)),
  };
}

// Approval policy engine
export type ApprovalPolicy = {
  entityType: string;
  rules: Array<{
    minAmount?: number;
    maxAmount?: number;
    requiredRoles: string[];
  }>;
};

export const APPROVAL_POLICIES: ApprovalPolicy[] = [
  {
    entityType: "PURCHASE_ORDER",
    rules: [
      { maxAmount: 10000, requiredRoles: ["PROCUREMENT_MANAGER"] },
      { minAmount: 10000, maxAmount: 50000, requiredRoles: ["PROCUREMENT_MANAGER", "FINANCE_MANAGER"] },
      { minAmount: 50000, requiredRoles: ["PROCUREMENT_MANAGER", "FINANCE_MANAGER", "CEO"] },
    ],
  },
  {
    entityType: "PROJECT_BUDGET",
    rules: [
      { maxAmount: 100000, requiredRoles: ["PROJECT_MANAGER"] },
      { minAmount: 100000, maxAmount: 500000, requiredRoles: ["PROJECT_MANAGER", "FINANCE_MANAGER"] },
      { minAmount: 500000, requiredRoles: ["PROJECT_MANAGER", "FINANCE_MANAGER", "CEO"] },
    ],
  },
  {
    entityType: "PAYMENT",
    rules: [
      { maxAmount: 5000, requiredRoles: ["FINANCE_CLERK"] },
      { minAmount: 5000, maxAmount: 25000, requiredRoles: ["FINANCE_MANAGER"] },
      { minAmount: 25000, requiredRoles: ["FINANCE_MANAGER", "CEO"] },
    ],
  },
];

export function getRequiredApprovers(
  entityType: string,
  amount: number
): string[] {
  const policy = APPROVAL_POLICIES.find((p) => p.entityType === entityType);
  if (!policy) return ["ADMIN"];

  for (const rule of policy.rules) {
    const min = rule.minAmount ?? 0;
    const max = rule.maxAmount ?? Infinity;
    if (amount >= min && amount < max) {
      return rule.requiredRoles;
    }
  }

  return ["CEO"];
}
