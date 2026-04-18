/**
 * Status Lifecycle Registry - TechnoKoluzi ERP
 * Defines all enterprise status enums, lifecycle rules, and Hebrew labels.
 * Based on BASH44 Enterprise Starter patterns.
 */

// ─── Generic Record Lifecycle ────────────────────────────────────────────────

export enum RecordStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
  DORMANT = 'dormant',
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export enum QuoteStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  VOID = 'void',
  CANCELLED = 'cancelled',
}

// ─── Procurement ─────────────────────────────────────────────────────────────

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  SENT = 'sent',
  PARTIALLY_RECEIVED = 'partially_received',
  RECEIVED = 'received',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

// ─── Production / Manufacturing ──────────────────────────────────────────────

export enum WorkOrderStatus {
  DRAFT = 'draft',
  RELEASED = 'released',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

// ─── Service & Field Operations ──────────────────────────────────────────────

export enum ServiceTicketStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  WAITING_PARTS = 'waiting_parts',
  WAITING_CUSTOMER = 'waiting_customer',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

export enum InstallationStatus {
  PLANNED = 'planned',
  SITE_READY = 'site_ready',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  SIGNED_OFF = 'signed_off',
  EXCEPTION = 'exception',
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export enum MovementType {
  RECEIPT = 'receipt',
  ISSUE = 'issue',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment',
  RESERVATION = 'reservation',
  ALLOCATION = 'allocation',
  RETURN = 'return',
  SCRAP = 'scrap',
}

// ─── Quality ─────────────────────────────────────────────────────────────────

export enum QualityStatus {
  PENDING = 'pending',
  PASSED = 'passed',
  FAILED = 'failed',
  QUARANTINE = 'quarantine',
  RELEASED = 'released',
  REWORK = 'rework',
}

// ─── AI Actions ──────────────────────────────────────────────────────────────

export enum AIActionStatus {
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ─── Engineering Change Request ──────────────────────────────────────────────

export enum ECRStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IMPLEMENTED = 'implemented',
  CLOSED = 'closed',
}

// ─── Dispatch / Logistics ────────────────────────────────────────────────────

export enum DispatchStatus {
  PLANNING = 'planning',
  LOADED = 'loaded',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  EXCEPTION = 'exception',
}

// ─── Hebrew Labels ───────────────────────────────────────────────────────────

export const STATUS_LABELS_HE: Record<string, Record<string, string>> = {
  RecordStatus: {
    draft: 'טיוטה',
    submitted: 'הוגש',
    pending_approval: 'ממתין לאישור',
    approved: 'מאושר',
    in_progress: 'בביצוע',
    on_hold: 'מושהה',
    completed: 'הושלם',
    rejected: 'נדחה',
    cancelled: 'בוטל',
    archived: 'בארכיון',
  },
  QuoteStatus: {
    draft: 'טיוטה',
    submitted: 'הוגש',
    pending_approval: 'ממתין לאישור',
    approved: 'מאושר',
    sent: 'נשלח',
    accepted: 'התקבל',
    expired: 'פג תוקף',
    rejected: 'נדחה',
    cancelled: 'בוטל',
    archived: 'בארכיון',
  },
  LeadStatus: {
    new: 'חדש',
    contacted: 'נוצר קשר',
    qualified: 'מוסמך',
    proposal: 'הצעה',
    negotiation: 'משא ומתן',
    won: 'נסגר בהצלחה',
    lost: 'אבד',
    dormant: 'רדום',
  },
  WorkOrderStatus: {
    draft: 'טיוטה',
    released: 'שוחרר',
    in_progress: 'בביצוע',
    paused: 'מושהה',
    completed: 'הושלם',
    closed: 'סגור',
    cancelled: 'בוטל',
  },
  PurchaseOrderStatus: {
    draft: 'טיוטה',
    submitted: 'הוגש',
    approved: 'מאושר',
    sent: 'נשלח',
    partially_received: 'התקבל חלקית',
    received: 'התקבל',
    closed: 'סגור',
    cancelled: 'בוטל',
  },
  InvoiceStatus: {
    draft: 'טיוטה',
    sent: 'נשלח',
    partially_paid: 'שולם חלקית',
    paid: 'שולם',
    overdue: 'באיחור',
    void: 'מבוטל',
    cancelled: 'בוטל',
  },
  ServiceTicketStatus: {
    open: 'פתוח',
    assigned: 'הוקצה',
    in_progress: 'בביצוע',
    waiting_parts: 'ממתין לחלקים',
    waiting_customer: 'ממתין ללקוח',
    resolved: 'נפתר',
    closed: 'סגור',
    reopened: 'נפתח מחדש',
  },
  InstallationStatus: {
    planned: 'מתוכנן',
    site_ready: 'אתר מוכן',
    in_progress: 'בביצוע',
    paused: 'מושהה',
    completed: 'הושלם',
    signed_off: 'נחתם',
    exception: 'חריגה',
  },
  MovementType: {
    receipt: 'קבלה',
    issue: 'הוצאה',
    transfer: 'העברה',
    adjustment: 'התאמה',
    reservation: 'הזמנת מלאי',
    allocation: 'הקצאה',
    return: 'החזרה',
    scrap: 'גרוטאה',
  },
  QualityStatus: {
    pending: 'ממתין',
    passed: 'עבר',
    failed: 'נכשל',
    quarantine: 'הסגר',
    released: 'שוחרר',
    rework: 'תיקון',
  },
  AIActionStatus: {
    proposed: 'הוצע',
    approved: 'מאושר',
    rejected: 'נדחה',
    executed: 'בוצע',
    failed: 'נכשל',
    cancelled: 'בוטל',
  },
  ECRStatus: {
    draft: 'טיוטה',
    submitted: 'הוגש',
    under_review: 'בבדיקה',
    approved: 'מאושר',
    rejected: 'נדחה',
    implemented: 'יושם',
    closed: 'סגור',
  },
  DispatchStatus: {
    planning: 'בתכנון',
    loaded: 'נטען',
    in_transit: 'בדרך',
    delivered: 'סופק',
    exception: 'חריגה',
  },
};

// ─── Lifecycle Transition Rules ──────────────────────────────────────────────

export type TransitionMap = Record<string, string[]>;

export const LIFECYCLE_TRANSITIONS: Record<string, TransitionMap> = {
  RecordStatus: {
    draft: ['submitted', 'cancelled'],
    submitted: ['pending_approval', 'rejected', 'cancelled'],
    pending_approval: ['approved', 'rejected'],
    approved: ['in_progress', 'on_hold', 'cancelled'],
    in_progress: ['on_hold', 'completed', 'cancelled'],
    on_hold: ['in_progress', 'cancelled'],
    completed: ['archived'],
    rejected: ['draft', 'archived'],
    cancelled: ['archived'],
    archived: [],
  },
  QuoteStatus: {
    draft: ['submitted', 'cancelled'],
    submitted: ['pending_approval', 'cancelled'],
    pending_approval: ['approved', 'rejected'],
    approved: ['sent', 'cancelled'],
    sent: ['accepted', 'expired', 'rejected'],
    accepted: ['archived'],
    expired: ['draft', 'archived'],
    rejected: ['draft', 'archived'],
    cancelled: ['archived'],
    archived: [],
  },
  LeadStatus: {
    new: ['contacted', 'lost', 'dormant'],
    contacted: ['qualified', 'lost', 'dormant'],
    qualified: ['proposal', 'lost', 'dormant'],
    proposal: ['negotiation', 'lost', 'dormant'],
    negotiation: ['won', 'lost', 'dormant'],
    won: [],
    lost: ['new', 'dormant'],
    dormant: ['new', 'contacted'],
  },
  WorkOrderStatus: {
    draft: ['released', 'cancelled'],
    released: ['in_progress', 'cancelled'],
    in_progress: ['paused', 'completed', 'cancelled'],
    paused: ['in_progress', 'cancelled'],
    completed: ['closed'],
    closed: [],
    cancelled: [],
  },
  PurchaseOrderStatus: {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'cancelled'],
    approved: ['sent', 'cancelled'],
    sent: ['partially_received', 'received', 'cancelled'],
    partially_received: ['received', 'cancelled'],
    received: ['closed'],
    closed: [],
    cancelled: [],
  },
  InvoiceStatus: {
    draft: ['sent', 'cancelled'],
    sent: ['partially_paid', 'paid', 'overdue', 'void'],
    partially_paid: ['paid', 'overdue', 'void'],
    paid: [],
    overdue: ['partially_paid', 'paid', 'void'],
    void: [],
    cancelled: [],
  },
  ServiceTicketStatus: {
    open: ['assigned', 'closed'],
    assigned: ['in_progress', 'closed'],
    in_progress: ['waiting_parts', 'waiting_customer', 'resolved', 'closed'],
    waiting_parts: ['in_progress', 'closed'],
    waiting_customer: ['in_progress', 'closed'],
    resolved: ['closed', 'reopened'],
    closed: ['reopened'],
    reopened: ['assigned', 'in_progress'],
  },
  InstallationStatus: {
    planned: ['site_ready', 'exception'],
    site_ready: ['in_progress', 'exception'],
    in_progress: ['paused', 'completed', 'exception'],
    paused: ['in_progress', 'exception'],
    completed: ['signed_off', 'exception'],
    signed_off: [],
    exception: ['planned', 'in_progress'],
  },
  DispatchStatus: {
    planning: ['loaded', 'exception'],
    loaded: ['in_transit', 'exception'],
    in_transit: ['delivered', 'exception'],
    delivered: [],
    exception: ['planning', 'loaded', 'in_transit'],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check whether a transition from `fromStatus` to `toStatus` is allowed
 * for the given lifecycle name.
 */
export function isTransitionAllowed(
  lifecycle: string,
  fromStatus: string,
  toStatus: string
): boolean {
  const map = LIFECYCLE_TRANSITIONS[lifecycle];
  if (!map) return false;
  const allowed = map[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

/**
 * Get allowed next statuses for the given lifecycle and current status.
 */
export function getAllowedTransitions(
  lifecycle: string,
  currentStatus: string
): string[] {
  const map = LIFECYCLE_TRANSITIONS[lifecycle];
  if (!map) return [];
  return map[currentStatus] || [];
}

/**
 * Get the Hebrew label for a status within a specific lifecycle.
 * Falls back to the raw status string.
 */
export function getStatusLabelHe(lifecycle: string, status: string): string {
  return STATUS_LABELS_HE[lifecycle]?.[status] || status;
}
