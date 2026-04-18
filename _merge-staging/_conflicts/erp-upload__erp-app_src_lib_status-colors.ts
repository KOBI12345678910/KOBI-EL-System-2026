/**
 * Status Badge Colors & Hebrew Labels - TechnoKoluzi ERP (Frontend)
 * Provides consistent UI styling for all entity statuses across every module.
 * Based on BASH44 Enterprise Starter patterns.
 */

// ─── Color Map ───────────────────────────────────────────────────────────────

export interface StatusColor {
  bg: string;
  text: string;
  border?: string;
}

export const STATUS_COLORS: Record<string, StatusColor> = {
  // ── Generic Record Lifecycle ─────────────────────────────────────────────
  draft:            { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-300' },
  submitted:        { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  pending_approval: { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300' },
  approved:         { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  in_progress:      { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-300' },
  on_hold:          { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300' },
  completed:        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  rejected:         { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },
  cancelled:        { bg: 'bg-gray-100',    text: 'text-gray-500',    border: 'border-gray-300' },
  archived:         { bg: 'bg-gray-50',     text: 'text-gray-400',    border: 'border-gray-200' },

  // ── Lead / CRM ───────────────────────────────────────────────────────────
  new:              { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-300' },
  contacted:        { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  qualified:        { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-300' },
  proposal:         { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-300' },
  negotiation:      { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-300' },
  won:              { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  lost:             { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },
  dormant:          { bg: 'bg-stone-100',   text: 'text-stone-600',   border: 'border-stone-300' },

  // ── Quote / Sales ────────────────────────────────────────────────────────
  sent:             { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-300' },
  accepted:         { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  expired:          { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-300' },

  // ── Work Order / Production ──────────────────────────────────────────────
  released:         { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  paused:           { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300' },
  closed:           { bg: 'bg-gray-200',    text: 'text-gray-600',    border: 'border-gray-400' },

  // ── Invoice / Finance ────────────────────────────────────────────────────
  overdue:          { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },
  void:             { bg: 'bg-rose-100',    text: 'text-rose-600',    border: 'border-rose-300' },
  paid:             { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  partially_paid:   { bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-300' },

  // ── Purchase Order ───────────────────────────────────────────────────────
  partially_received: { bg: 'bg-amber-100', text: 'text-amber-700',   border: 'border-amber-300' },
  received:         { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },

  // ── Service Ticket ───────────────────────────────────────────────────────
  open:             { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  assigned:         { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-300' },
  waiting_parts:    { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300' },
  waiting_customer: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-300' },
  resolved:         { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  reopened:         { bg: 'bg-pink-100',    text: 'text-pink-700',    border: 'border-pink-300' },

  // ── Installation ─────────────────────────────────────────────────────────
  planned:          { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-300' },
  site_ready:       { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-300' },
  signed_off:       { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  exception:        { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },

  // ── AI Actions ───────────────────────────────────────────────────────────
  proposed:         { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-300' },
  executed:         { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  failed:           { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },

  // ── ECR ──────────────────────────────────────────────────────────────────
  under_review:     { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300' },
  implemented:      { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },

  // ── Dispatch ─────────────────────────────────────────────────────────────
  planning:         { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-300' },
  loaded:           { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  in_transit:       { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-300' },
  delivered:        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },

  // ── Quality ──────────────────────────────────────────────────────────────
  pending:          { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300' },
  passed:           { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  quarantine:       { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300' },
  rework:           { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-300' },

  // ── Inventory Movement Types ─────────────────────────────────────────────
  receipt:          { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300' },
  issue:            { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300' },
  transfer:         { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300' },
  adjustment:       { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300' },
  reservation:      { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-300' },
  allocation:       { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-300' },
  return:           { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-300' },
  scrap:            { bg: 'bg-stone-100',   text: 'text-stone-600',   border: 'border-stone-300' },
};

// ─── Hebrew Labels ───────────────────────────────────────────────────────────

export const STATUS_LABELS_HE: Record<string, string> = {
  // Generic Record
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

  // Lead / CRM
  new: 'חדש',
  contacted: 'נוצר קשר',
  qualified: 'מוסמך',
  proposal: 'הצעה',
  negotiation: 'משא ומתן',
  won: 'נסגר בהצלחה',
  lost: 'אבד',
  dormant: 'רדום',

  // Quote / Sales
  sent: 'נשלח',
  accepted: 'התקבל',
  expired: 'פג תוקף',

  // Work Order / Production
  released: 'שוחרר',
  paused: 'מושהה',
  closed: 'סגור',

  // Invoice / Finance
  overdue: 'באיחור',
  void: 'מבוטל',
  paid: 'שולם',
  partially_paid: 'שולם חלקית',

  // Purchase Order
  partially_received: 'התקבל חלקית',
  received: 'התקבל',

  // Service Ticket
  open: 'פתוח',
  assigned: 'הוקצה',
  waiting_parts: 'ממתין לחלקים',
  waiting_customer: 'ממתין ללקוח',
  resolved: 'נפתר',
  reopened: 'נפתח מחדש',

  // Installation
  planned: 'מתוכנן',
  site_ready: 'אתר מוכן',
  signed_off: 'נחתם',
  exception: 'חריגה',

  // AI Actions
  proposed: 'הוצע',
  executed: 'בוצע',
  failed: 'נכשל',

  // ECR
  under_review: 'בבדיקה',
  implemented: 'יושם',

  // Dispatch
  planning: 'בתכנון',
  loaded: 'נטען',
  in_transit: 'בדרך',
  delivered: 'סופק',

  // Quality
  pending: 'ממתין',
  passed: 'עבר',
  quarantine: 'הסגר',
  rework: 'תיקון',

  // Inventory Movement Types
  receipt: 'קבלה',
  issue: 'הוצאה',
  transfer: 'העברה',
  adjustment: 'התאמה',
  reservation: 'הזמנת מלאי',
  allocation: 'הקצאה',
  return: 'החזרה',
  scrap: 'גרוטאה',
};

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Get Tailwind color classes for a status string.
 * Falls back to `draft` styling for unknown statuses.
 */
export function getStatusColor(status: string): StatusColor {
  return STATUS_COLORS[status] || STATUS_COLORS.draft;
}

/**
 * Get the Hebrew label for any status.
 * Falls back to the raw status string if no translation exists.
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS_HE[status] || status;
}

/**
 * Build a complete className string for a status badge.
 * Usage: <span className={getStatusBadgeClass('approved')}>...</span>
 */
export function getStatusBadgeClass(status: string): string {
  const color = getStatusColor(status);
  const parts = [color.bg, color.text, 'px-2.5 py-0.5 rounded-full text-xs font-medium'];
  if (color.border) {
    parts.push('border', color.border);
  }
  return parts.join(' ');
}
