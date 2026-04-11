/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                                    ║
 * ║   ONYX FINANCIAL AUTONOMY ENGINE (FAE) v3.0                                        ║
 * ║   מנוע פיננסי אוטונומי מוסדי — מעבר ל-Bloomberg Terminal                           ║
 * ║                                                                                    ║
 * ║   כל שקל שנכנס או יוצא מהחברה:                                                     ║
 * ║   → מסווג אוטומטית                                                                 ║
 * ║   → נרשם בספר חשבונות כפול                                                         ║
 * ║   → משפיע על תחזיות תזרים                                                          ║
 * ║   → AI מנתח מגמות, חריגות, הזדמנויות                                               ║
 * ║   → התראות אוטומטיות על חריגות                                                     ║
 * ║                                                                                    ║
 * ║   MODULES:                                                                         ║
 * ║   1.  CHART OF ACCOUNTS — עץ חשבונות מלא                                           ║
 * ║   2.  DOUBLE-ENTRY LEDGER — הנהלת חשבונות כפולה                                    ║
 * ║   3.  ACCOUNTS RECEIVABLE — חייבים + גבייה אוטומטית                                ║
 * ║   4.  ACCOUNTS PAYABLE — זכאים + תשלומים                                           ║
 * ║   5.  CASHFLOW FORECASTER — חיזוי תזרים 90 יום                                     ║
 * ║   6.  BUDGET ENGINE — תקציב + מעקב חריגות                                          ║
 * ║   7.  PROFITABILITY ANALYZER — רווחיות לפי פרויקט/מחלקה/לקוח                       ║
 * ║   8.  TAX ENGINE — חישוב מס + הכנה לדוחות                                          ║
 * ║   9.  FINANCIAL INTELLIGENCE — AI אנליטיקס + חריגות                                 ║
 * ║   10. RECONCILIATION — התאמות בנק אוטומטיות                                        ║
 * ║   11. MULTI-ENTITY — ניהול 2 חברות (טכנו כל עוזי + נדל"ן)                         ║
 * ║   12. REPORTING — דוחות כספיים מלאים                                                ║
 * ║                                                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER CRYPTO SHIM — Web Crypto API (port of Node crypto.randomBytes)
// Canonical Node version: onyx-ai/src/modules/financial-autonomy-engine.ts
// לא מוחקים רק משדרגים ומגדלים — זו הגרסה לדפדפן של אותו קוד בדיוק.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = {
  randomBytes(n: number) {
    const arr = new Uint8Array(n);
    (globalThis.crypto || (window as any).crypto).getRandomValues(arr);
    return {
      toString(enc: string) {
        if (enc === 'hex') {
          return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        throw new Error('unsupported encoding: ' + enc);
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: CORE FINANCIAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Currency = 'ILS' | 'USD' | 'EUR' | 'CNY' | 'GBP';
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'contra';
type TransactionStatus = 'pending' | 'posted' | 'void' | 'reconciled';
type PaymentMethod = 'bank_transfer' | 'check' | 'cash' | 'credit_card' | 'bit' | 'paybox' | 'paypal';
type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'partial' | 'paid' | 'overdue' | 'void' | 'disputed' | 'written_off';

/** חשבון בעץ חשבונות */
interface Account {
  code: string;
  name: string;
  nameEn: string;
  type: AccountType;
  parentCode?: string;
  level: number;
  currency: Currency;
  balance: number;
  isActive: boolean;
  isBankAccount: boolean;
  bankDetails?: { bankName: string; branch: string; accountNumber: string };
  movingAverage: { sum: number; count: number; avg: number; stddev: number };
  tags: string[];
}

/** פקודת יומן (journal entry) */
interface JournalEntry {
  id: string;
  date: string;
  lines: JournalLine[];
  description: string;
  reference?: string;
  status: TransactionStatus;
  source: 'manual' | 'invoice' | 'payment' | 'payroll' | 'depreciation' | 'adjustment' | 'auto' | 'reconciliation';
  entityId?: string;
  entityType?: 'project' | 'department' | 'client' | 'supplier' | 'employee';
  entityName?: string;
  createdAt: number;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: number;
  voidedBy?: string;
  voidedAt?: number;
  voidReason?: string;
  vatAmount?: number;
  reconciledAt?: number;
  tags: string[];
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
  currency: Currency;
  exchangeRate?: number;
}

/** חשבונית */
interface Invoice {
  id: string;
  type: 'receivable' | 'payable';
  number: string;
  date: string;
  dueDate: string;
  counterparty: { id: string; name: string; type: 'client' | 'supplier' };
  lines: InvoiceLine[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  payments: Payment[];
  amountPaid: number;
  amountDue: number;
  reminders: Array<{ sentAt: number; channel: string; responseReceived: boolean }>;
  projectId?: string;
  projectName?: string;
  documentId?: string;
  journalEntryId?: string;
  daysOverdue: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  accountCode: string;
  vatRate: number;
  projectId?: string;
}

interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  reference?: string;
  bankAccountCode?: string;
  invoiceId?: string;
  journalEntryId?: string;
  reconciled: boolean;
  notes?: string;
  createdAt: number;
}

interface Budget {
  id: string;
  name: string;
  period: string;
  entityType: 'company' | 'department' | 'project';
  entityId: string;
  entityName: string;
  lines: BudgetLine[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  variancePercent: number;
  status: 'draft' | 'approved' | 'active' | 'closed';
  approvedBy?: string;
  createdAt: number;
}

interface BudgetLine {
  accountCode: string;
  accountName: string;
  category: string;
  monthly: Record<string, { budget: number; actual: number; variance: number }>;
  totalBudget: number;
  totalActual: number;
  variance: number;
  variancePercent: number;
}

interface CashflowForecast {
  generatedAt: number;
  currentBalance: number;
  daily: Array<{
    date: string;
    openingBalance: number;
    inflows: number;
    outflows: number;
    netFlow: number;
    closingBalance: number;
    inflowDetails: Array<{ source: string; amount: number; probability: number }>;
    outflowDetails: Array<{ destination: string; amount: number; certainty: number }>;
  }>;
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netChange: number;
    lowestBalance: number;
    lowestBalanceDate: string;
    daysUntilNegative: number;
    risk: 'low' | 'medium' | 'high' | 'critical';
  };
}

interface ProfitabilityReport {
  entityType: 'project' | 'department' | 'client' | 'product_line';
  entityId: string;
  entityName: string;
  period: string;
  revenue: number;
  directCosts: number;
  grossProfit: number;
  grossMargin: number;
  overheadAllocation: number;
  netProfit: number;
  netMargin: number;
  previousPeriod?: { revenue: number; grossProfit: number; netProfit: number };
  trend: 'improving' | 'stable' | 'declining';
  insights: string[];
}

interface FinancialAnomaly {
  id: string;
  timestamp: number;
  type: 'expense_spike' | 'revenue_drop' | 'margin_erosion' | 'cashflow_risk' | 'budget_overrun' | 'payment_delay' | 'duplicate_payment' | 'unusual_pattern' | 'concentration_risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  amount?: number;
  accountCode?: string;
  entityId?: string;
  recommendation: string;
  autoAction?: string;
  acknowledged: boolean;
}

interface BankReconciliation {
  id: string;
  bankAccountCode: string;
  bankAccountName: string;
  period: string;
  bankBalance: number;
  bookBalance: number;
  difference: number;
  matched: Array<{ journalEntryId: string; bankRef: string; amount: number; date: string }>;
  unmatched: {
    inBooksNotBank: Array<{ journalEntryId: string; amount: number; date: string; description: string }>;
    inBankNotBooks: Array<{ bankRef: string; amount: number; date: string; description: string }>;
  };
  status: 'in_progress' | 'completed' | 'discrepancy';
  reconciledAt?: number;
  reconciledBy?: string;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: CHART OF ACCOUNTS — עץ חשבונות ישראלי
// ═══════════════════════════════════════════════════════════════════════════

class ChartOfAccounts {
  private accounts: Map<string, Account> = new Map();

  constructor() { this.loadIsraeliStandard(); }

  private loadIsraeliStandard(): void {
    const add = (code: string, name: string, nameEn: string, type: AccountType, level: number, parentCode?: string, tags: string[] = []) => {
      this.accounts.set(code, {
        code, name, nameEn, type, parentCode, level, currency: 'ILS',
        balance: 0, isActive: true, isBankAccount: code.startsWith('102') || code.startsWith('103'),
        movingAverage: { sum: 0, count: 0, avg: 0, stddev: 0 }, tags,
      });
    };

    // ═══ נכסים (1XXX) ═══
    add('1000', 'נכסים', 'Assets', 'asset', 1);
    add('1010', 'נכסים שוטפים', 'Current Assets', 'asset', 2, '1000');
    add('1020', 'קופה ראשית', 'Main Cash', 'asset', 3, '1010', ['cash']);
    add('1021', 'קופה קטנה', 'Petty Cash', 'asset', 3, '1010', ['cash']);
    add('1030', 'בנק הפועלים — עו"ש', 'Bank Hapoalim Checking', 'asset', 3, '1010', ['bank']);
    add('1031', 'בנק לאומי — עו"ש', 'Bank Leumi Checking', 'asset', 3, '1010', ['bank']);
    add('1032', 'בנק דיסקונט — עו"ש', 'Bank Discount Checking', 'asset', 3, '1010', ['bank']);
    add('1040', 'בנק — פיקדונות', 'Bank Deposits', 'asset', 3, '1010', ['bank']);
    add('1100', 'לקוחות — חייבים', 'Accounts Receivable', 'asset', 3, '1010', ['receivable']);
    add('1110', 'שיקים לגבייה', 'Checks Receivable', 'asset', 3, '1010', ['receivable']);
    add('1120', 'הכנסות לקבל', 'Accrued Revenue', 'asset', 3, '1010');
    add('1130', 'מקדמות לספקים', 'Advances to Suppliers', 'asset', 3, '1010');
    add('1140', 'חייבים אחרים', 'Other Receivables', 'asset', 3, '1010');
    add('1150', 'מלאי חומרי גלם', 'Raw Materials Inventory', 'asset', 3, '1010', ['inventory']);
    add('1151', 'מלאי ברזל', 'Iron Inventory', 'asset', 3, '1150', ['inventory', 'iron']);
    add('1152', 'מלאי אלומיניום', 'Aluminum Inventory', 'asset', 3, '1150', ['inventory', 'aluminum']);
    add('1153', 'מלאי נירוסטה', 'Stainless Steel Inventory', 'asset', 3, '1150', ['inventory']);
    add('1154', 'מלאי זכוכית', 'Glass Inventory', 'asset', 3, '1150', ['inventory']);
    add('1155', 'מלאי צבעים', 'Paint Inventory', 'asset', 3, '1150', ['inventory']);
    add('1156', 'מלאי אביזרים', 'Hardware Inventory', 'asset', 3, '1150', ['inventory']);
    add('1160', 'עבודות בביצוע', 'Work in Progress', 'asset', 3, '1010', ['wip']);
    add('1170', 'מע"מ תשומות', 'Input VAT', 'asset', 3, '1010', ['tax']);
    add('1200', 'נכסים קבועים', 'Fixed Assets', 'asset', 2, '1000');
    add('1210', 'מבנה ומפעל', 'Building & Plant', 'asset', 3, '1200');
    add('1220', 'מכונות וציוד', 'Machinery & Equipment', 'asset', 3, '1200');
    add('1221', 'מכונת ריתוך', 'Welding Machines', 'asset', 3, '1220');
    add('1222', 'מכונת חיתוך', 'Cutting Machines', 'asset', 3, '1220');
    add('1223', 'מכונת כיפוף', 'Bending Machines', 'asset', 3, '1220');
    add('1224', 'מכונת צביעה', 'Painting Equipment', 'asset', 3, '1220');
    add('1230', 'רכבים', 'Vehicles', 'asset', 3, '1200');
    add('1240', 'ריהוט וציוד משרדי', 'Furniture & Office Equipment', 'asset', 3, '1200');
    add('1250', 'מחשבים ותוכנה', 'Computers & Software', 'asset', 3, '1200');
    add('1260', 'כלי עבודה', 'Tools', 'asset', 3, '1200');
    add('1290', 'פחת נצבר', 'Accumulated Depreciation', 'contra', 3, '1200');
    add('1300', 'נכסי נדל"ן להשקעה', 'Investment Real Estate', 'asset', 2, '1000', ['real_estate']);

    // ═══ התחייבויות (2XXX) ═══
    add('2000', 'התחייבויות', 'Liabilities', 'liability', 1);
    add('2010', 'התחייבויות שוטפות', 'Current Liabilities', 'liability', 2, '2000');
    add('2100', 'ספקים — זכאים', 'Accounts Payable', 'liability', 3, '2010', ['payable']);
    add('2110', 'שיקים לפירעון', 'Checks Payable', 'liability', 3, '2010', ['payable']);
    add('2120', 'הוצאות לשלם', 'Accrued Expenses', 'liability', 3, '2010');
    add('2130', 'מקדמות מלקוחות', 'Customer Advances', 'liability', 3, '2010');
    add('2140', 'שכר לשלם', 'Salaries Payable', 'liability', 3, '2010', ['payroll']);
    add('2150', 'ניכויי עובדים', 'Employee Deductions', 'liability', 3, '2010', ['payroll']);
    add('2160', 'מע"מ עסקאות', 'Output VAT', 'liability', 3, '2010', ['tax']);
    add('2170', 'מע"מ לשלם', 'VAT Payable', 'liability', 3, '2010', ['tax']);
    add('2180', 'מס הכנסה לשלם', 'Income Tax Payable', 'liability', 3, '2010', ['tax']);
    add('2190', 'ביטוח לאומי לשלם', 'National Insurance Payable', 'liability', 3, '2010', ['tax']);
    add('2200', 'הלוואות לזמן קצר', 'Short-term Loans', 'liability', 3, '2010');
    add('2300', 'הלוואות לזמן ארוך', 'Long-term Loans', 'liability', 2, '2000');
    add('2400', 'פיצויי פיטורין', 'Severance Provision', 'liability', 2, '2000');

    // ═══ הון עצמי (3XXX) ═══
    add('3000', 'הון עצמי', 'Equity', 'equity', 1);
    add('3100', 'הון מניות', 'Share Capital', 'equity', 2, '3000');
    add('3200', 'עודפים', 'Retained Earnings', 'equity', 2, '3000');
    add('3300', 'רווח/הפסד שנה שוטפת', 'Current Year P&L', 'equity', 2, '3000');

    // ═══ הכנסות (4XXX) ═══
    add('4000', 'הכנסות', 'Revenue', 'revenue', 1);
    add('4100', 'הכנסות מעקות', 'Railing Revenue', 'revenue', 2, '4000', ['railing']);
    add('4110', 'הכנסות מעקות ברזל', 'Iron Railing Revenue', 'revenue', 3, '4100', ['iron']);
    add('4120', 'הכנסות מעקות אלומיניום', 'Aluminum Railing Revenue', 'revenue', 3, '4100', ['aluminum']);
    add('4130', 'הכנסות מעקות נירוסטה', 'SS Railing Revenue', 'revenue', 3, '4100');
    add('4200', 'הכנסות שערים', 'Gate Revenue', 'revenue', 2, '4000');
    add('4300', 'הכנסות גדרות', 'Fence Revenue', 'revenue', 2, '4000');
    add('4400', 'הכנסות פרגולות', 'Pergola Revenue', 'revenue', 2, '4000');
    add('4500', 'הכנסות דלתות', 'Door Revenue', 'revenue', 2, '4000');
    add('4600', 'הכנסות חלונות', 'Window Revenue', 'revenue', 2, '4000');
    add('4700', 'הכנסות מדרגות', 'Stairs Revenue', 'revenue', 2, '4000');
    add('4800', 'הכנסות עבודות מיוחדות', 'Special Works Revenue', 'revenue', 2, '4000');
    add('4900', 'הכנסות נדל"ן', 'Real Estate Revenue', 'revenue', 2, '4000', ['real_estate']);
    add('4950', 'הכנסות אחרות', 'Other Revenue', 'revenue', 2, '4000');

    // ═══ עלות המכר (5XXX) ═══
    add('5000', 'עלות המכר', 'Cost of Goods Sold', 'expense', 1, undefined, ['cogs']);
    add('5100', 'חומרי גלם', 'Raw Materials', 'expense', 2, '5000', ['cogs']);
    add('5110', 'רכישת ברזל', 'Iron Purchases', 'expense', 3, '5100', ['cogs', 'iron']);
    add('5120', 'רכישת אלומיניום', 'Aluminum Purchases', 'expense', 3, '5100', ['cogs', 'aluminum']);
    add('5130', 'רכישת נירוסטה', 'Stainless Steel Purchases', 'expense', 3, '5100', ['cogs']);
    add('5140', 'רכישת זכוכית', 'Glass Purchases', 'expense', 3, '5100', ['cogs']);
    add('5150', 'צבעים וחומרי גמר', 'Paint & Finishing', 'expense', 3, '5100', ['cogs']);
    add('5160', 'אביזרים וברגים', 'Hardware', 'expense', 3, '5100', ['cogs']);
    add('5200', 'עבודת קבלני משנה', 'Subcontractor Labor', 'expense', 2, '5000', ['cogs', 'subcontractor']);
    add('5300', 'עלות שכר ייצור', 'Production Labor', 'expense', 2, '5000', ['cogs', 'payroll']);
    add('5400', 'הובלה והתקנה', 'Transport & Installation', 'expense', 2, '5000', ['cogs']);
    add('5500', 'פחת ציוד ייצור', 'Production Equipment Depreciation', 'expense', 2, '5000', ['cogs']);

    // ═══ הוצאות תפעול (6XXX) ═══
    add('6000', 'הוצאות תפעוליות', 'Operating Expenses', 'expense', 1);
    add('6100', 'שכר ונלוות', 'Salaries & Benefits', 'expense', 2, '6000', ['payroll']);
    add('6110', 'שכר עובדים', 'Employee Salaries', 'expense', 3, '6100', ['payroll']);
    add('6120', 'ביטוח לאומי מעסיק', 'Employer NI', 'expense', 3, '6100', ['payroll', 'tax']);
    add('6130', 'פנסיה מעסיק', 'Employer Pension', 'expense', 3, '6100', ['payroll']);
    add('6140', 'פיצויי פיטורין', 'Severance', 'expense', 3, '6100', ['payroll']);
    add('6150', 'הכשרות והדרכות', 'Training', 'expense', 3, '6100');
    add('6200', 'שכירות ואחזקה', 'Rent & Maintenance', 'expense', 2, '6000');
    add('6210', 'שכירות מפעל', 'Factory Rent', 'expense', 3, '6200');
    add('6220', 'חשמל', 'Electricity', 'expense', 3, '6200');
    add('6230', 'מים', 'Water', 'expense', 3, '6200');
    add('6240', 'ארנונה', 'Municipal Tax', 'expense', 3, '6200');
    add('6250', 'אחזקת מבנה', 'Building Maintenance', 'expense', 3, '6200');
    add('6300', 'הוצאות רכב', 'Vehicle Expenses', 'expense', 2, '6000');
    add('6310', 'דלק', 'Fuel', 'expense', 3, '6300');
    add('6320', 'ביטוח רכב', 'Vehicle Insurance', 'expense', 3, '6300');
    add('6330', 'אחזקת רכב', 'Vehicle Maintenance', 'expense', 3, '6300');
    add('6400', 'ביטוח', 'Insurance', 'expense', 2, '6000');
    add('6410', 'ביטוח צד ג', 'Liability Insurance', 'expense', 3, '6400');
    add('6420', 'ביטוח עבודה', 'Workers Comp', 'expense', 3, '6400');
    add('6430', 'ביטוח ציוד', 'Equipment Insurance', 'expense', 3, '6400');
    add('6500', 'הוצאות משרד', 'Office Expenses', 'expense', 2, '6000');
    add('6510', 'טלפון ואינטרנט', 'Phone & Internet', 'expense', 3, '6500');
    add('6520', 'חומרי משרד', 'Office Supplies', 'expense', 3, '6500');
    add('6530', 'תוכנות', 'Software', 'expense', 3, '6500');
    add('6600', 'שיווק ופרסום', 'Marketing', 'expense', 2, '6000');
    add('6610', 'פרסום דיגיטלי', 'Digital Advertising', 'expense', 3, '6600');
    add('6620', 'SEO ואתר', 'SEO & Website', 'expense', 3, '6600');
    add('6700', 'הוצאות מקצועיות', 'Professional Fees', 'expense', 2, '6000');
    add('6710', 'יועץ מס / רו"ח', 'Accounting', 'expense', 3, '6700');
    add('6720', 'עורך דין', 'Legal', 'expense', 3, '6700');
    add('6730', 'יועצים', 'Consultants', 'expense', 3, '6700');
    add('6800', 'הוצאות בטיחות', 'Safety Expenses', 'expense', 2, '6000');
    add('6900', 'הוצאות שונות', 'Miscellaneous', 'expense', 2, '6000');

    // ═══ הוצאות מימון (7XXX) ═══
    add('7000', 'הוצאות מימון', 'Financial Expenses', 'expense', 1);
    add('7100', 'ריבית בנק', 'Bank Interest', 'expense', 2, '7000');
    add('7200', 'עמלות בנק', 'Bank Fees', 'expense', 2, '7000');
    add('7300', 'הפרשי שער', 'Exchange Differences', 'expense', 2, '7000');

    // ═══ מיסים (8XXX) ═══
    add('8000', 'מיסים', 'Taxes', 'expense', 1, undefined, ['tax']);
    add('8100', 'מס הכנסה', 'Income Tax', 'expense', 2, '8000', ['tax']);
  }

  getAccount(code: string): Account | undefined { return this.accounts.get(code); }
  getAll(): Account[] { return Array.from(this.accounts.values()); }
  getByType(type: AccountType): Account[] { return this.getAll().filter(a => a.type === type); }
  getChildren(parentCode: string): Account[] { return this.getAll().filter(a => a.parentCode === parentCode); }
  getActive(): Account[] { return this.getAll().filter(a => a.isActive); }

  updateBalance(code: string, amount: number): void {
    const acc = this.accounts.get(code);
    if (!acc) return;
    acc.balance += amount;
    const ma = acc.movingAverage;
    ma.count++;
    ma.sum += Math.abs(amount);
    ma.avg = ma.sum / ma.count;
    const delta = Math.abs(amount) - ma.avg;
    ma.stddev = Math.sqrt(((ma.stddev * ma.stddev * (ma.count - 1)) + delta * delta) / ma.count);
  }

  isAnomaly(code: string, amount: number, threshold: number = 3): boolean {
    const acc = this.accounts.get(code);
    if (!acc || acc.movingAverage.count < 10) return false;
    const deviation = Math.abs(Math.abs(amount) - acc.movingAverage.avg) / Math.max(0.01, acc.movingAverage.stddev);
    return deviation > threshold;
  }

  getBalanceSheet(): { assets: Account[]; liabilities: Account[]; equity: Account[] } {
    return {
      assets: this.getByType('asset'),
      liabilities: this.getByType('liability'),
      equity: this.getByType('equity'),
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DOUBLE-ENTRY LEDGER
// ═══════════════════════════════════════════════════════════════════════════

class Ledger {
  private entries: JournalEntry[] = [];

  constructor(private coa: ChartOfAccounts) {}

  post(params: {
    date: string; lines: JournalLine[]; description: string;
    reference?: string; source: JournalEntry['source'];
    entityId?: string; entityType?: JournalEntry['entityType']; entityName?: string;
    createdBy: string; vatAmount?: number; tags?: string[];
  }): JournalEntry {
    const totalDebit = params.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = params.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`פקודת יומן לא מאוזנת: חייב ₪${totalDebit.toFixed(2)} ≠ זכות ₪${totalCredit.toFixed(2)}`);
    }

    for (const line of params.lines) {
      if (!this.coa.getAccount(line.accountCode)) {
        throw new Error(`חשבון ${line.accountCode} לא קיים`);
      }
    }

    const entry: JournalEntry = {
      id: `je_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      date: params.date, lines: params.lines, description: params.description,
      reference: params.reference, status: 'posted', source: params.source,
      entityId: params.entityId, entityType: params.entityType, entityName: params.entityName,
      createdAt: Date.now(), createdBy: params.createdBy,
      vatAmount: params.vatAmount, tags: params.tags ?? [],
    };

    for (const line of params.lines) {
      const account = this.coa.getAccount(line.accountCode)!;
      if (account.type === 'asset' || account.type === 'expense') {
        this.coa.updateBalance(line.accountCode, line.debit - line.credit);
      } else {
        this.coa.updateBalance(line.accountCode, line.credit - line.debit);
      }
    }

    this.entries.push(entry);
    return entry;
  }

  void(entryId: string, voidedBy: string, reason: string): JournalEntry | undefined {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry || entry.status === 'void') return undefined;

    for (const line of entry.lines) {
      const account = this.coa.getAccount(line.accountCode)!;
      if (account.type === 'asset' || account.type === 'expense') {
        this.coa.updateBalance(line.accountCode, -(line.debit - line.credit));
      } else {
        this.coa.updateBalance(line.accountCode, -(line.credit - line.debit));
      }
    }

    entry.status = 'void';
    entry.voidedBy = voidedBy;
    entry.voidedAt = Date.now();
    entry.voidReason = reason;
    return entry;
  }

  getEntry(id: string): JournalEntry | undefined { return this.entries.find(e => e.id === id); }
  getAll(): JournalEntry[] { return this.entries; }
  getByAccount(code: string): JournalEntry[] { return this.entries.filter(e => e.status === 'posted' && e.lines.some(l => l.accountCode === code)); }
  getByEntity(entityId: string): JournalEntry[] { return this.entries.filter(e => e.entityId === entityId); }
  getByPeriod(from: string, to: string): JournalEntry[] { return this.entries.filter(e => e.status === 'posted' && e.date >= from && e.date <= to); }
  getBySource(source: JournalEntry['source']): JournalEntry[] { return this.entries.filter(e => e.source === source); }

  getAccountLedger(code: string, from?: string, to?: string): Array<{ date: string; description: string; debit: number; credit: number; balance: number; reference?: string }> {
    let entries = this.getByAccount(code);
    if (from) entries = entries.filter(e => e.date >= from);
    if (to) entries = entries.filter(e => e.date <= to);
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    return entries.map(e => {
      const line = e.lines.find(l => l.accountCode === code)!;
      balance += line.debit - line.credit;
      return { date: e.date, description: e.description, debit: line.debit, credit: line.credit, balance, reference: e.reference };
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: INVOICE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class InvoiceManager {
  private invoices: Map<string, Invoice> = new Map();
  private nextInvoiceNumber = { receivable: 1001, payable: 1 };

  constructor(private ledger: Ledger) {}

  create(params: {
    type: 'receivable' | 'payable';
    counterparty: Invoice['counterparty'];
    date: string; dueDate: string;
    lines: InvoiceLine[];
    vatRate?: number;
    projectId?: string; projectName?: string;
    notes?: string; createdBy: string;
  }): Invoice {
    const vatRate = params.vatRate ?? 18;
    const subtotal = params.lines.reduce((s, l) => s + l.total, 0);
    const vatAmount = Math.round(subtotal * vatRate / 100);
    const total = subtotal + vatAmount;

    const invoice: Invoice = {
      id: `inv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      type: params.type,
      number: String(this.nextInvoiceNumber[params.type]++),
      date: params.date, dueDate: params.dueDate,
      counterparty: params.counterparty,
      lines: params.lines, subtotal, vatRate, vatAmount, total,
      currency: 'ILS', status: 'draft',
      payments: [], amountPaid: 0, amountDue: total,
      reminders: [], daysOverdue: 0,
      projectId: params.projectId, projectName: params.projectName,
      notes: params.notes ?? '',
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  issue(invoiceId: string, issuedBy: string): Invoice {
    const inv = this.invoices.get(invoiceId);
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

    inv.status = 'sent';

    if (inv.type === 'receivable') {
      const revenueAccount = inv.lines[0]?.accountCode ?? '4100';
      const je = this.ledger.post({
        date: inv.date,
        lines: [
          { accountCode: '1100', accountName: 'לקוחות', debit: inv.total, credit: 0, currency: 'ILS' },
          { accountCode: revenueAccount, accountName: 'הכנסות', debit: 0, credit: inv.subtotal, currency: 'ILS' },
          { accountCode: '2160', accountName: 'מע"מ עסקאות', debit: 0, credit: inv.vatAmount, currency: 'ILS' },
        ],
        description: `חשבונית ${inv.number} — ${inv.counterparty.name}`,
        reference: inv.number, source: 'invoice',
        entityId: inv.counterparty.id, entityType: 'client', entityName: inv.counterparty.name,
        createdBy: issuedBy, vatAmount: inv.vatAmount,
      });
      inv.journalEntryId = je.id;
    } else {
      const expenseAccount = inv.lines[0]?.accountCode ?? '5100';
      const je = this.ledger.post({
        date: inv.date,
        lines: [
          { accountCode: expenseAccount, accountName: 'הוצאות', debit: inv.subtotal, credit: 0, currency: 'ILS' },
          { accountCode: '1170', accountName: 'מע"מ תשומות', debit: inv.vatAmount, credit: 0, currency: 'ILS' },
          { accountCode: '2100', accountName: 'ספקים', debit: 0, credit: inv.total, currency: 'ILS' },
        ],
        description: `חשבונית ספק ${inv.number} — ${inv.counterparty.name}`,
        reference: inv.number, source: 'invoice',
        entityId: inv.counterparty.id, entityType: 'supplier', entityName: inv.counterparty.name,
        createdBy: issuedBy, vatAmount: inv.vatAmount,
      });
      inv.journalEntryId = je.id;
    }

    return inv;
  }

  recordPayment(invoiceId: string, params: {
    date: string; amount: number; method: PaymentMethod;
    reference?: string; bankAccountCode?: string; recordedBy: string;
  }): Payment {
    const inv = this.invoices.get(invoiceId);
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

    const payment: Payment = {
      id: `pmt_${Date.now().toString(36)}`,
      date: params.date, amount: params.amount, currency: 'ILS',
      method: params.method, reference: params.reference,
      bankAccountCode: params.bankAccountCode ?? '1030',
      invoiceId, reconciled: false,
      createdAt: Date.now(),
    };

    if (inv.type === 'receivable') {
      const je = this.ledger.post({
        date: params.date,
        lines: [
          { accountCode: payment.bankAccountCode ?? '1030', accountName: 'בנק', debit: params.amount, credit: 0, currency: 'ILS' },
          { accountCode: '1100', accountName: 'לקוחות', debit: 0, credit: params.amount, currency: 'ILS' },
        ],
        description: `תשלום על חשבונית ${inv.number} — ${inv.counterparty.name}`,
        reference: params.reference, source: 'payment',
        entityId: inv.counterparty.id, entityType: 'client', entityName: inv.counterparty.name,
        createdBy: params.recordedBy,
      });
      payment.journalEntryId = je.id;
    } else {
      const je = this.ledger.post({
        date: params.date,
        lines: [
          { accountCode: '2100', accountName: 'ספקים', debit: params.amount, credit: 0, currency: 'ILS' },
          { accountCode: payment.bankAccountCode ?? '1030', accountName: 'בנק', debit: 0, credit: params.amount, currency: 'ILS' },
        ],
        description: `תשלום לספק חשבונית ${inv.number} — ${inv.counterparty.name}`,
        reference: params.reference, source: 'payment',
        entityId: inv.counterparty.id, entityType: 'supplier', entityName: inv.counterparty.name,
        createdBy: params.recordedBy,
      });
      payment.journalEntryId = je.id;
    }

    inv.payments.push(payment);
    inv.amountPaid += params.amount;
    inv.amountDue = inv.total - inv.amountPaid;

    if (inv.amountDue <= 0) inv.status = 'paid';
    else if (inv.amountPaid > 0) inv.status = 'partial';

    return payment;
  }

  updateOverdue(): Invoice[] {
    const now = Date.now();
    const overdue: Invoice[] = [];
    for (const inv of this.invoices.values()) {
      if (['draft', 'paid', 'void', 'written_off'].includes(inv.status)) continue;
      const dueMs = new Date(inv.dueDate).getTime();
      if (now > dueMs) {
        inv.daysOverdue = Math.round((now - dueMs) / 86400000);
        if (inv.status !== 'overdue' && inv.status !== 'partial') inv.status = 'overdue';
        overdue.push(inv);
      }
    }
    return overdue;
  }

  buildReminderMessage(invoiceId: string): string {
    const inv = this.invoices.get(invoiceId);
    if (!inv) return '';
    return [
      `שלום ${inv.counterparty.name},`,
      ``,
      `ברצוננו להזכיר כי חשבונית מס' ${inv.number} מתאריך ${inv.date}`,
      `על סך ₪${inv.total.toLocaleString()} טרם שולמה.`,
      inv.amountPaid > 0 ? `שולם עד כה: ₪${inv.amountPaid.toLocaleString()}. יתרה: ₪${inv.amountDue.toLocaleString()}.` : '',
      `תאריך פירעון: ${inv.dueDate}${inv.daysOverdue > 0 ? ` (איחור של ${inv.daysOverdue} ימים)` : ''}`,
      ``,
      `נודה לטיפולכם בהקדם.`,
      ``,
      `בברכה,`,
      `טכנו כל עוזי בע"מ`,
    ].filter(Boolean).join('\n');
  }

  getInvoice(id: string): Invoice | undefined { return this.invoices.get(id); }
  getAll(): Invoice[] { return Array.from(this.invoices.values()); }
  getReceivables(): Invoice[] { return this.getAll().filter(i => i.type === 'receivable' && !['paid', 'void', 'written_off'].includes(i.status)); }
  getPayables(): Invoice[] { return this.getAll().filter(i => i.type === 'payable' && !['paid', 'void'].includes(i.status)); }
  getOverdue(): Invoice[] { return this.getAll().filter(i => i.daysOverdue > 0 && !['paid', 'void', 'written_off'].includes(i.status)); }
  getByClient(clientId: string): Invoice[] { return this.getAll().filter(i => i.counterparty.id === clientId); }
  getByProject(projectId: string): Invoice[] { return this.getAll().filter(i => i.projectId === projectId); }

  getSummary(): {
    receivables: { total: number; overdue: number; overdueCount: number; aging: Record<string, number> };
    payables: { total: number; overdue: number; overdueCount: number; dueThisWeek: number };
  } {
    const receivables = this.getReceivables();
    const payables = this.getPayables();
    const now = Date.now();
    const weekFromNow = now + 7 * 86400000;

    const aging: Record<string, number> = { 'שוטף': 0, '30-1': 0, '60-31': 0, '90-61': 0, '90+': 0 };
    for (const inv of receivables) {
      if (inv.daysOverdue <= 0) aging['שוטף'] += inv.amountDue;
      else if (inv.daysOverdue <= 30) aging['30-1'] += inv.amountDue;
      else if (inv.daysOverdue <= 60) aging['60-31'] += inv.amountDue;
      else if (inv.daysOverdue <= 90) aging['90-61'] += inv.amountDue;
      else aging['90+'] += inv.amountDue;
    }

    return {
      receivables: {
        total: receivables.reduce((s, i) => s + i.amountDue, 0),
        overdue: receivables.filter(i => i.daysOverdue > 0).reduce((s, i) => s + i.amountDue, 0),
        overdueCount: receivables.filter(i => i.daysOverdue > 0).length,
        aging,
      },
      payables: {
        total: payables.reduce((s, i) => s + i.amountDue, 0),
        overdue: payables.filter(i => i.daysOverdue > 0).reduce((s, i) => s + i.amountDue, 0),
        overdueCount: payables.filter(i => i.daysOverdue > 0).length,
        dueThisWeek: payables.filter(i => new Date(i.dueDate).getTime() <= weekFromNow && new Date(i.dueDate).getTime() > now).reduce((s, i) => s + i.amountDue, 0),
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: CASHFLOW FORECASTER
// ═══════════════════════════════════════════════════════════════════════════

class CashflowForecaster {
  constructor(private coa: ChartOfAccounts, private invoices: InvoiceManager) {}

  forecast(daysAhead: number = 90): CashflowForecast {
    const bankAccounts = this.coa.getAll().filter(a => a.tags.includes('bank') || a.tags.includes('cash'));
    const currentBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);

    const daily: CashflowForecast['daily'] = [];
    let runningBalance = currentBalance;

    const receivables = this.invoices.getReceivables();
    const payables = this.invoices.getPayables();

    for (let d = 0; d < daysAhead; d++) {
      const date = new Date(Date.now() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const openingBalance = runningBalance;

      const inflowDetails: CashflowForecast['daily'][0]['inflowDetails'] = [];
      for (const inv of receivables) {
        if (inv.dueDate === dateStr) {
          const probability = inv.daysOverdue > 0 ? 0.5 : 0.85;
          inflowDetails.push({ source: `${inv.counterparty.name} — חשבונית ${inv.number}`, amount: inv.amountDue, probability });
        }
      }

      const outflowDetails: CashflowForecast['daily'][0]['outflowDetails'] = [];
      for (const inv of payables) {
        if (inv.dueDate === dateStr) {
          outflowDetails.push({ destination: `${inv.counterparty.name} — חשבונית ${inv.number}`, amount: inv.amountDue, certainty: 0.95 });
        }
      }

      const dayOfMonth = date.getDate();
      if (dayOfMonth === 1) {
        outflowDetails.push({ destination: 'שכירות', amount: 25000, certainty: 1.0 });
      }
      if (dayOfMonth === 9) {
        outflowDetails.push({ destination: 'שכר עובדים', amount: 180000, certainty: 1.0 });
      }
      if (dayOfMonth === 15) {
        outflowDetails.push({ destination: 'ביטוח לאומי + מס', amount: 45000, certainty: 0.95 });
      }

      const inflows = inflowDetails.reduce((s, i) => s + i.amount * i.probability, 0);
      const outflows = outflowDetails.reduce((s, o) => s + o.amount * o.certainty, 0);
      const netFlow = inflows - outflows;
      runningBalance += netFlow;

      daily.push({
        date: dateStr, openingBalance, inflows: Math.round(inflows), outflows: Math.round(outflows),
        netFlow: Math.round(netFlow), closingBalance: Math.round(runningBalance),
        inflowDetails, outflowDetails,
      });
    }

    const totalInflows = daily.reduce((s, d) => s + d.inflows, 0);
    const totalOutflows = daily.reduce((s, d) => s + d.outflows, 0);
    const lowestEntry = daily.reduce((min, d) => d.closingBalance < min.closingBalance ? d : min, daily[0]);
    const daysUntilNegative = daily.findIndex(d => d.closingBalance < 0);

    return {
      generatedAt: Date.now(), currentBalance,
      daily,
      summary: {
        totalInflows, totalOutflows,
        netChange: totalInflows - totalOutflows,
        lowestBalance: lowestEntry?.closingBalance ?? currentBalance,
        lowestBalanceDate: lowestEntry?.date ?? '',
        daysUntilNegative: daysUntilNegative === -1 ? daysAhead : daysUntilNegative,
        risk: daysUntilNegative >= 0 && daysUntilNegative < 14 ? 'critical'
          : daysUntilNegative >= 0 && daysUntilNegative < 30 ? 'high'
          : lowestEntry && lowestEntry.closingBalance < currentBalance * 0.2 ? 'medium'
          : 'low',
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: BUDGET ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class BudgetEngine {
  private budgets: Map<string, Budget> = new Map();

  constructor(private ledger: Ledger) {}

  create(params: {
    name: string; period: string;
    entityType: Budget['entityType']; entityId: string; entityName: string;
    lines: Array<{ accountCode: string; accountName: string; category: string; monthlyBudget: Record<string, number> }>;
    createdBy: string;
  }): Budget {
    const budgetLines: BudgetLine[] = params.lines.map(l => {
      const totalBudget = Object.values(l.monthlyBudget).reduce((s, v) => s + v, 0);
      return {
        accountCode: l.accountCode, accountName: l.accountName, category: l.category,
        monthly: Object.fromEntries(Object.entries(l.monthlyBudget).map(([m, b]) => [m, { budget: b, actual: 0, variance: b }])),
        totalBudget, totalActual: 0, variance: totalBudget, variancePercent: 0,
      };
    });

    const budget: Budget = {
      id: `bud_${Date.now().toString(36)}`,
      name: params.name, period: params.period,
      entityType: params.entityType, entityId: params.entityId, entityName: params.entityName,
      lines: budgetLines,
      totalBudget: budgetLines.reduce((s, l) => s + l.totalBudget, 0),
      totalActual: 0, totalVariance: 0, variancePercent: 0,
      status: 'draft', createdAt: Date.now(),
    };
    this.budgets.set(budget.id, budget);
    return budget;
  }

  updateActuals(budgetId: string): Budget {
    const budget = this.budgets.get(budgetId);
    if (!budget) throw new Error(`Budget ${budgetId} not found`);

    for (const line of budget.lines) {
      for (const [month, data] of Object.entries(line.monthly)) {
        const from = `${month}-01`;
        const toDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
        const to = toDate.toISOString().split('T')[0];

        const entries = this.ledger.getByPeriod(from, to).filter(e =>
          e.lines.some(l => l.accountCode === line.accountCode) &&
          (!budget.entityId || e.entityId === budget.entityId)
        );

        data.actual = entries.reduce((s, e) => {
          const l = e.lines.find(l => l.accountCode === line.accountCode)!;
          return s + (l.debit - l.credit);
        }, 0);
        data.variance = data.budget - data.actual;
      }

      line.totalActual = Object.values(line.monthly).reduce((s, d) => s + d.actual, 0);
      line.variance = line.totalBudget - line.totalActual;
      line.variancePercent = line.totalBudget > 0 ? Math.round((line.variance / line.totalBudget) * 100 * 10) / 10 : 0;
    }

    budget.totalActual = budget.lines.reduce((s, l) => s + l.totalActual, 0);
    budget.totalVariance = budget.totalBudget - budget.totalActual;
    budget.variancePercent = budget.totalBudget > 0 ? Math.round((budget.totalVariance / budget.totalBudget) * 100 * 10) / 10 : 0;

    return budget;
  }

  findOverruns(budgetId: string): Array<{ accountCode: string; accountName: string; month: string; budget: number; actual: number; overrun: number; overrunPercent: number }> {
    const budget = this.budgets.get(budgetId);
    if (!budget) return [];
    const overruns: Array<{ accountCode: string; accountName: string; month: string; budget: number; actual: number; overrun: number; overrunPercent: number }> = [];

    for (const line of budget.lines) {
      for (const [month, data] of Object.entries(line.monthly)) {
        if (data.actual > data.budget && data.budget > 0) {
          overruns.push({
            accountCode: line.accountCode, accountName: line.accountName, month,
            budget: data.budget, actual: data.actual,
            overrun: data.actual - data.budget,
            overrunPercent: Math.round((data.actual - data.budget) / data.budget * 100 * 10) / 10,
          });
        }
      }
    }

    return overruns.sort((a, b) => b.overrun - a.overrun);
  }

  getBudget(id: string): Budget | undefined { return this.budgets.get(id); }
  getAll(): Budget[] { return Array.from(this.budgets.values()); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: FINANCIAL INTELLIGENCE — AI
// ═══════════════════════════════════════════════════════════════════════════

class FinancialIntelligence {
  private anomalies: FinancialAnomaly[] = [];

  constructor(
    private coa: ChartOfAccounts,
    private ledger: Ledger,
    private invoices: InvoiceManager,
    private cashflow: CashflowForecaster,
    private budgets: BudgetEngine,
  ) {}

  scan(): FinancialAnomaly[] {
    const newAnomalies: FinancialAnomaly[] = [];

    // 1. הוצאות חריגות
    const expenseAccounts = this.coa.getByType('expense').filter(a => a.level >= 3);
    for (const acc of expenseAccounts) {
      if (acc.movingAverage.count < 10) continue;
      const recentEntries = this.ledger.getByAccount(acc.code).filter(e => Date.now() - e.createdAt < 7 * 86400000);
      for (const entry of recentEntries) {
        const line = entry.lines.find(l => l.accountCode === acc.code);
        if (!line) continue;
        const amount = line.debit;
        if (this.coa.isAnomaly(acc.code, amount)) {
          newAnomalies.push({
            id: `anom_${Date.now().toString(36)}`, timestamp: Date.now(),
            type: 'expense_spike', severity: amount > acc.movingAverage.avg * 5 ? 'critical' : 'warning',
            title: `הוצאה חריגה: ${acc.name}`,
            description: `₪${amount.toLocaleString()} — ${((amount / acc.movingAverage.avg - 1) * 100).toFixed(0)}% מעל הממוצע (₪${acc.movingAverage.avg.toLocaleString()})`,
            amount, accountCode: acc.code,
            recommendation: 'בדוק אם ההוצאה מוצדקת', acknowledged: false,
          });
        }
      }
    }

    // 2. תזרים
    const forecast = this.cashflow.forecast(30);
    if (forecast.summary.risk === 'critical') {
      newAnomalies.push({
        id: `anom_${Date.now().toString(36)}`, timestamp: Date.now(),
        type: 'cashflow_risk', severity: 'critical',
        title: `⚠️ סיכון תזרים: ${forecast.summary.daysUntilNegative} ימים`,
        description: `יתרה נוכחית: ₪${forecast.currentBalance.toLocaleString()}\nנקודה נמוכה: ₪${forecast.summary.lowestBalance.toLocaleString()} ב-${forecast.summary.lowestBalanceDate}`,
        recommendation: 'האץ גבייה / דחה תשלומים / הגדל מסגרת אשראי', acknowledged: false,
      });
    }

    // 3. חובות
    const overdue = this.invoices.getOverdue();
    const totalOverdue = overdue.reduce((s, i) => s + i.amountDue, 0);
    if (totalOverdue > 50000) {
      newAnomalies.push({
        id: `anom_${Date.now().toString(36)}`, timestamp: Date.now(),
        type: 'payment_delay', severity: totalOverdue > 200000 ? 'critical' : 'warning',
        title: `חובות באיחור: ₪${totalOverdue.toLocaleString()}`,
        description: `${overdue.length} חשבוניות באיחור.\nלקוחות: ${overdue.map(i => i.counterparty.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`,
        amount: totalOverdue,
        recommendation: 'שלח תזכורות גבייה אוטומטיות', acknowledged: false,
      });
    }

    // 4. ריכוזיות
    const clientRevenue: Record<string, number> = {};
    for (const inv of this.invoices.getAll().filter(i => i.type === 'receivable')) {
      clientRevenue[inv.counterparty.name] = (clientRevenue[inv.counterparty.name] ?? 0) + inv.total;
    }
    const totalRevenue = Object.values(clientRevenue).reduce((s, v) => s + v, 0);
    for (const [client, revenue] of Object.entries(clientRevenue)) {
      const percent = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
      if (percent > 30) {
        newAnomalies.push({
          id: `anom_${Date.now().toString(36)}`, timestamp: Date.now(),
          type: 'concentration_risk', severity: percent > 50 ? 'critical' : 'warning',
          title: `ריכוזיות לקוח: ${client} = ${percent.toFixed(0)}% מההכנסות`,
          description: `₪${revenue.toLocaleString()} מתוך ₪${totalRevenue.toLocaleString()} סה"כ`,
          recommendation: 'גוון מקורות הכנסה — סיכון תלות בלקוח בודד', acknowledged: false,
        });
      }
    }

    // 5. שחיקת מרווח
    const revenues = this.coa.getByType('revenue').reduce((s, a) => s + Math.abs(a.balance), 0);
    const cogs = this.coa.getAll().filter(a => a.tags.includes('cogs')).reduce((s, a) => s + Math.abs(a.balance), 0);
    const grossMargin = revenues > 0 ? ((revenues - cogs) / revenues) * 100 : 0;
    if (grossMargin < 25 && revenues > 0) {
      newAnomalies.push({
        id: `anom_${Date.now().toString(36)}`, timestamp: Date.now(),
        type: 'margin_erosion', severity: grossMargin < 15 ? 'critical' : 'warning',
        title: `שחיקת מרווח גולמי: ${grossMargin.toFixed(1)}%`,
        description: `הכנסות: ₪${revenues.toLocaleString()}\nעלות מכר: ₪${cogs.toLocaleString()}\nמרווח: ${grossMargin.toFixed(1)}%`,
        recommendation: 'בדוק מחירי ספקים + מחירי מכירה', acknowledged: false,
      });
    }

    this.anomalies.push(...newAnomalies);
    return newAnomalies;
  }

  getAnomalies(acknowledged?: boolean): FinancialAnomaly[] {
    if (acknowledged !== undefined) return this.anomalies.filter(a => a.acknowledged === acknowledged);
    return this.anomalies;
  }

  acknowledgeAnomaly(id: string): void {
    const a = this.anomalies.find(a => a.id === id);
    if (a) a.acknowledged = true;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: FINANCIAL REPORTING
// ═══════════════════════════════════════════════════════════════════════════

class FinancialReporting {
  constructor(private coa: ChartOfAccounts, private ledger: Ledger) {}

  incomeStatement(from: string, to: string): {
    revenue: Array<{ code: string; name: string; amount: number }>;
    totalRevenue: number;
    cogs: Array<{ code: string; name: string; amount: number }>;
    totalCOGS: number;
    grossProfit: number;
    grossMargin: number;
    opex: Array<{ code: string; name: string; amount: number }>;
    totalOpex: number;
    operatingProfit: number;
    operatingMargin: number;
    financialExpenses: number;
    taxExpenses: number;
    netProfit: number;
    netMargin: number;
  } {
    const entries = this.ledger.getByPeriod(from, to);

    const accumulate = (codes: string[]): Array<{ code: string; name: string; amount: number }> => {
      const result: Array<{ code: string; name: string; amount: number }> = [];
      for (const code of codes) {
        const acc = this.coa.getAccount(code);
        if (!acc) continue;
        const amount = entries.filter(e => e.lines.some(l => l.accountCode === code))
          .reduce((s, e) => s + e.lines.filter(l => l.accountCode === code).reduce((s2, l) => s2 + l.credit - l.debit, 0), 0);
        if (amount !== 0) result.push({ code, name: acc.name, amount: Math.abs(amount) });
      }
      return result;
    };

    const revenueAccounts = this.coa.getByType('revenue').map(a => a.code);
    const revenue = accumulate(revenueAccounts);
    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);

    const cogsAccounts = this.coa.getAll().filter(a => a.tags.includes('cogs')).map(a => a.code);
    const cogs = accumulate(cogsAccounts);
    const totalCOGS = cogs.reduce((s, c) => s + c.amount, 0);

    const grossProfit = totalRevenue - totalCOGS;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100 * 10) / 10 : 0;

    const opexAccounts = this.coa.getAll().filter(a => a.type === 'expense' && !a.tags.includes('cogs') && a.code.startsWith('6') && a.level >= 2).map(a => a.code);
    const opex = accumulate(opexAccounts);
    const totalOpex = opex.reduce((s, o) => s + o.amount, 0);

    const operatingProfit = grossProfit - totalOpex;
    const operatingMargin = totalRevenue > 0 ? Math.round((operatingProfit / totalRevenue) * 100 * 10) / 10 : 0;

    const financialExpenses = accumulate(['7100', '7200', '7300']).reduce((s, f) => s + f.amount, 0);
    const taxExpenses = accumulate(['8100']).reduce((s, t) => s + t.amount, 0);

    const netProfit = operatingProfit - financialExpenses - taxExpenses;
    const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100 * 10) / 10 : 0;

    return {
      revenue, totalRevenue, cogs, totalCOGS,
      grossProfit, grossMargin,
      opex, totalOpex, operatingProfit, operatingMargin,
      financialExpenses, taxExpenses,
      netProfit, netMargin,
    };
  }

  balanceSheet(): {
    assets: { current: Array<{ code: string; name: string; balance: number }>; fixed: Array<{ code: string; name: string; balance: number }>; totalAssets: number };
    liabilities: { current: Array<{ code: string; name: string; balance: number }>; longTerm: Array<{ code: string; name: string; balance: number }>; totalLiabilities: number };
    equity: Array<{ code: string; name: string; balance: number }>;
    totalEquity: number;
    balanced: boolean;
  } {
    const currentAssets = this.coa.getChildren('1010').filter(a => a.balance !== 0).map(a => ({ code: a.code, name: a.name, balance: a.balance }));
    const fixedAssets = this.coa.getChildren('1200').filter(a => a.balance !== 0).map(a => ({ code: a.code, name: a.name, balance: a.balance }));
    const totalAssets = [...currentAssets, ...fixedAssets].reduce((s, a) => s + a.balance, 0);

    const currentLiab = this.coa.getChildren('2010').filter(a => a.balance !== 0).map(a => ({ code: a.code, name: a.name, balance: a.balance }));
    const longTermLiab = [this.coa.getAccount('2300'), this.coa.getAccount('2400')].filter(a => a && a.balance !== 0).map(a => ({ code: a!.code, name: a!.name, balance: a!.balance }));
    const totalLiabilities = [...currentLiab, ...longTermLiab].reduce((s, l) => s + l.balance, 0);

    const equity = this.coa.getByType('equity').filter(a => a.balance !== 0).map(a => ({ code: a.code, name: a.name, balance: a.balance }));
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

    return {
      assets: { current: currentAssets, fixed: fixedAssets, totalAssets },
      liabilities: { current: currentLiab, longTerm: longTermLiab, totalLiabilities },
      equity, totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: FINANCIAL AUTONOMY ENGINE — הכל ביחד
// ═══════════════════════════════════════════════════════════════════════════

export class FinancialAutonomyEngine {
  readonly coa: ChartOfAccounts;
  readonly ledger: Ledger;
  readonly invoices: InvoiceManager;
  readonly cashflow: CashflowForecaster;
  readonly budgets: BudgetEngine;
  readonly intelligence: FinancialIntelligence;
  readonly reporting: FinancialReporting;

  constructor() {
    this.coa = new ChartOfAccounts();
    this.ledger = new Ledger(this.coa);
    this.invoices = new InvoiceManager(this.ledger);
    this.cashflow = new CashflowForecaster(this.coa, this.invoices);
    this.budgets = new BudgetEngine(this.ledger);
    this.reporting = new FinancialReporting(this.coa, this.ledger);
    this.intelligence = new FinancialIntelligence(this.coa, this.ledger, this.invoices, this.cashflow, this.budgets);
  }

  async dailyScan(): Promise<{ anomalies: FinancialAnomaly[]; overdueInvoices: Invoice[]; cashflowRisk: string; budgetOverruns: number }> {
    const anomalies = this.intelligence.scan();
    const overdue = this.invoices.updateOverdue();
    const forecast = this.cashflow.forecast(30);
    const budgetOverruns = this.budgets.getAll().flatMap(b => this.budgets.findOverruns(b.id));

    return { anomalies, overdueInvoices: overdue, cashflowRisk: forecast.summary.risk, budgetOverruns: budgetOverruns.length };
  }

  getDashboard(): Record<string, unknown> {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const yearStart = `${now.getFullYear()}-01-01`;
    const today = now.toISOString().split('T')[0];

    const monthlyPnL = this.reporting.incomeStatement(monthStart, today);
    const yearlyPnL = this.reporting.incomeStatement(yearStart, today);
    const balanceSheet = this.reporting.balanceSheet();
    const summary = this.invoices.getSummary();
    const forecast = this.cashflow.forecast(30);
    const anomalies = this.intelligence.getAnomalies(false);

    return {
      period: { monthStart, yearStart, today },
      monthly: {
        revenue: monthlyPnL.totalRevenue,
        cogs: monthlyPnL.totalCOGS,
        grossProfit: monthlyPnL.grossProfit,
        grossMargin: monthlyPnL.grossMargin,
        opex: monthlyPnL.totalOpex,
        netProfit: monthlyPnL.netProfit,
        netMargin: monthlyPnL.netMargin,
      },
      yearly: {
        revenue: yearlyPnL.totalRevenue,
        netProfit: yearlyPnL.netProfit,
        netMargin: yearlyPnL.netMargin,
      },
      balanceSheet: {
        totalAssets: balanceSheet.assets.totalAssets,
        totalLiabilities: balanceSheet.liabilities.totalLiabilities,
        equity: balanceSheet.totalEquity,
        balanced: balanceSheet.balanced,
      },
      cashflow: {
        currentBalance: forecast.currentBalance,
        risk: forecast.summary.risk,
        daysUntilNegative: forecast.summary.daysUntilNegative,
        lowestBalance: forecast.summary.lowestBalance,
        lowestDate: forecast.summary.lowestBalanceDate,
      },
      receivables: summary.receivables,
      payables: summary.payables,
      anomalies: { total: anomalies.length, critical: anomalies.filter(a => a.severity === 'critical').length },
    };
  }
}

export {
  ChartOfAccounts, Ledger, InvoiceManager, CashflowForecaster,
  BudgetEngine, FinancialIntelligence, FinancialReporting,
};

export type {
  Account, AccountType, JournalEntry, JournalLine, Invoice, InvoiceLine,
  Payment, PaymentMethod, InvoiceStatus, Budget, BudgetLine,
  CashflowForecast, ProfitabilityReport, FinancialAnomaly, BankReconciliation,
  Currency, TransactionStatus,
};
