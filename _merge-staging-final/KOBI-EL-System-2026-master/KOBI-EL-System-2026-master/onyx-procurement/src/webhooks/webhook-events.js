/**
 * ONYX — Webhook Event Registry
 * ═══════════════════════════════════════════════════════════════
 * Agent-80 — Webhook Delivery System
 *
 * Single source-of-truth for every outbound webhook event type
 * emitted by the ONYX procurement / payroll / tax platform.
 *
 * Categories:
 *   invoice.*              billing lifecycle
 *   wage_slip.*            payroll artifacts
 *   vat_export.*           tax filings
 *   bank_reconciliation.*  treasury workflows
 *   po.*                   purchase orders
 *   payment.*              money movement
 *   annual_tax.*           year-end compliance
 *   user.login.failed      security-critical
 *
 * Every event carries:
 *   - `type`:    fully-qualified event name (e.g. "invoice.paid")
 *   - `version`: schema version — bump when payload shape changes
 *   - `category`: grouping for UI/filtering
 *   - `description_he`: Hebrew label (RTL-friendly)
 *   - `pii_sensitive`: true if payload may include personal data —
 *     used by webhook-sender.js to decide if TLS is mandatory and
 *     to add a strict redaction policy to delivery logs.
 *
 * Subscribers specify `events: []` on their subscription row; the
 * dispatcher matches against `EVENT_TYPES` and rejects unknown types
 * so we never silently swallow typos.
 *
 * IMPORTANT: Never remove an event type once it has shipped — instead
 * mark it `deprecated: true` and bump `version` on replacement.
 */

'use strict';

// ─── Event type constants ─────────────────────────────────────────
const EVENT_TYPES = Object.freeze({
  // Invoices
  INVOICE_CREATED:       'invoice.created',
  INVOICE_PAID:          'invoice.paid',
  INVOICE_CANCELLED:     'invoice.cancelled',

  // Payroll
  WAGE_SLIP_ISSUED:      'wage_slip.issued',
  WAGE_SLIP_VOIDED:      'wage_slip.voided',

  // VAT / tax filings
  VAT_EXPORT_SUBMITTED:  'vat_export.submitted',

  // Bank reconciliation
  BANK_RECON_COMPLETED:  'bank_reconciliation.completed',

  // Purchase orders
  PO_APPROVED:           'po.approved',
  PO_DELIVERED:          'po.delivered',

  // Payments
  PAYMENT_RECEIVED:      'payment.received',

  // Annual tax
  ANNUAL_TAX_FILED:      'annual_tax.filed',

  // Security
  USER_LOGIN_FAILED:     'user.login.failed',
});

// ─── Registry metadata ────────────────────────────────────────────
const EVENT_REGISTRY = Object.freeze({
  [EVENT_TYPES.INVOICE_CREATED]: {
    type:           EVENT_TYPES.INVOICE_CREATED,
    version:        1,
    category:       'invoice',
    description_he: 'חשבונית נוצרה',
    description_en: 'Invoice created',
    pii_sensitive:  false,
    sample_payload: {
      invoice_id:  'inv_1234',
      number:      '2026-000123',
      customer_id: 'cust_42',
      total:       1170.00,
      currency:    'ILS',
      issued_at:   '2026-04-11T10:00:00Z',
    },
  },

  [EVENT_TYPES.INVOICE_PAID]: {
    type:           EVENT_TYPES.INVOICE_PAID,
    version:        1,
    category:       'invoice',
    description_he: 'חשבונית שולמה',
    description_en: 'Invoice paid',
    pii_sensitive:  false,
    sample_payload: {
      invoice_id:  'inv_1234',
      paid_at:     '2026-04-11T14:30:00Z',
      payment_id:  'pay_9876',
      amount:      1170.00,
    },
  },

  [EVENT_TYPES.INVOICE_CANCELLED]: {
    type:           EVENT_TYPES.INVOICE_CANCELLED,
    version:        1,
    category:       'invoice',
    description_he: 'חשבונית בוטלה',
    description_en: 'Invoice cancelled',
    pii_sensitive:  false,
    sample_payload: {
      invoice_id:   'inv_1234',
      cancelled_at: '2026-04-11T15:00:00Z',
      reason:       'customer_request',
    },
  },

  [EVENT_TYPES.WAGE_SLIP_ISSUED]: {
    type:           EVENT_TYPES.WAGE_SLIP_ISSUED,
    version:        1,
    category:       'payroll',
    description_he: 'תלוש שכר הונפק',
    description_en: 'Wage slip issued',
    pii_sensitive:  true,
    sample_payload: {
      wage_slip_id: 'ws_555',
      employee_id:  'emp_10',
      period:       '2026-03',
      net_pay:      9800.00,
      issued_at:    '2026-04-01T09:00:00Z',
    },
  },

  [EVENT_TYPES.WAGE_SLIP_VOIDED]: {
    type:           EVENT_TYPES.WAGE_SLIP_VOIDED,
    version:        1,
    category:       'payroll',
    description_he: 'תלוש שכר בוטל',
    description_en: 'Wage slip voided',
    pii_sensitive:  true,
    sample_payload: {
      wage_slip_id: 'ws_555',
      voided_at:    '2026-04-02T09:00:00Z',
      reason:       'correction_needed',
    },
  },

  [EVENT_TYPES.VAT_EXPORT_SUBMITTED]: {
    type:           EVENT_TYPES.VAT_EXPORT_SUBMITTED,
    version:        1,
    category:       'tax',
    description_he: 'דוח מע"מ הוגש',
    description_en: 'VAT report submitted',
    pii_sensitive:  false,
    sample_payload: {
      period:       '2026-03',
      format:       'PCN836',
      submitted_at: '2026-04-15T12:00:00Z',
      total_output: 52400.00,
      total_input:  14300.00,
    },
  },

  [EVENT_TYPES.BANK_RECON_COMPLETED]: {
    type:           EVENT_TYPES.BANK_RECON_COMPLETED,
    version:        1,
    category:       'treasury',
    description_he: 'התאמת בנק הושלמה',
    description_en: 'Bank reconciliation completed',
    pii_sensitive:  false,
    sample_payload: {
      account_id:     'acc_main',
      period:         '2026-03',
      matched:        148,
      unmatched:      2,
      closing_balance: 125430.55,
    },
  },

  [EVENT_TYPES.PO_APPROVED]: {
    type:           EVENT_TYPES.PO_APPROVED,
    version:        1,
    category:       'procurement',
    description_he: 'הזמנת רכש אושרה',
    description_en: 'Purchase order approved',
    pii_sensitive:  false,
    sample_payload: {
      po_id:       'po_7788',
      vendor_id:   'vnd_22',
      total:       45000.00,
      approved_by: 'user_admin',
      approved_at: '2026-04-11T11:00:00Z',
    },
  },

  [EVENT_TYPES.PO_DELIVERED]: {
    type:           EVENT_TYPES.PO_DELIVERED,
    version:        1,
    category:       'procurement',
    description_he: 'הזמנת רכש התקבלה',
    description_en: 'Purchase order delivered',
    pii_sensitive:  false,
    sample_payload: {
      po_id:        'po_7788',
      delivered_at: '2026-04-14T08:30:00Z',
      receipt_id:   'rcpt_9001',
    },
  },

  [EVENT_TYPES.PAYMENT_RECEIVED]: {
    type:           EVENT_TYPES.PAYMENT_RECEIVED,
    version:        1,
    category:       'payment',
    description_he: 'תשלום התקבל',
    description_en: 'Payment received',
    pii_sensitive:  false,
    sample_payload: {
      payment_id: 'pay_9876',
      amount:     1170.00,
      currency:   'ILS',
      method:     'bank_transfer',
      received_at: '2026-04-11T14:30:00Z',
    },
  },

  [EVENT_TYPES.ANNUAL_TAX_FILED]: {
    type:           EVENT_TYPES.ANNUAL_TAX_FILED,
    version:        1,
    category:       'tax',
    description_he: 'דוח שנתי הוגש',
    description_en: 'Annual tax filed',
    pii_sensitive:  false,
    sample_payload: {
      tax_year:    2025,
      form:        '1301',
      submitted_at: '2026-04-30T16:00:00Z',
      confirmation_number: 'IL-2025-9988776',
    },
  },

  [EVENT_TYPES.USER_LOGIN_FAILED]: {
    type:           EVENT_TYPES.USER_LOGIN_FAILED,
    version:        1,
    category:       'security',
    description_he: 'כשלון בכניסת משתמש',
    description_en: 'User login failed',
    pii_sensitive:  true,
    // Security webhook — consumers usually feed SIEM / SOC dashboards.
    sample_payload: {
      attempted_email: 'user@example.com',
      ip_address:      '203.0.113.7',
      reason:          'invalid_password',
      attempt_number:  3,
      at:              '2026-04-11T10:15:00Z',
    },
  },
});

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * listEventTypes — all fully-qualified event names (e.g. "invoice.paid").
 * Used by the subscription API to validate incoming `events[]`.
 */
function listEventTypes() {
  return Object.keys(EVENT_REGISTRY);
}

/**
 * isValidEventType — return true if `type` is a known event.
 */
function isValidEventType(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(EVENT_REGISTRY, type);
}

/**
 * getEventMeta — full registry entry for an event type, or null.
 */
function getEventMeta(type) {
  return EVENT_REGISTRY[type] || null;
}

/**
 * buildEventEnvelope — wrap a raw payload in the canonical envelope
 * that subscribers receive. Subscribers should verify `id` for
 * idempotency (we guarantee at-least-once delivery, not exactly-once).
 *
 * Envelope shape (subscribers rely on this):
 *   {
 *     id:        "evt_<uuid>",          unique per delivery attempt set
 *     type:      "invoice.paid",        one of EVENT_TYPES values
 *     version:   1,                     schema version from registry
 *     created_at: ISO8601 timestamp,
 *     data:      { ...payload },        domain-specific payload
 *   }
 */
function buildEventEnvelope({ id, type, data, createdAt }) {
  if (!isValidEventType(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  const meta = EVENT_REGISTRY[type];
  return {
    id:         id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    type,
    version:    meta.version,
    created_at: createdAt || new Date().toISOString(),
    data:       data || {},
  };
}

/**
 * filterSubscriptionsForEvent — given a list of subscription rows and
 * an event type, return only the ones subscribed to that event.
 * Supports exact match and the wildcard "*" (subscribe-to-all).
 */
function filterSubscriptionsForEvent(subscriptions, eventType) {
  if (!Array.isArray(subscriptions)) return [];
  return subscriptions.filter((sub) => {
    if (!sub || sub.active === false) return false;
    const events = Array.isArray(sub.events) ? sub.events : [];
    return events.includes('*') || events.includes(eventType);
  });
}

module.exports = {
  EVENT_TYPES,
  EVENT_REGISTRY,
  listEventTypes,
  isValidEventType,
  getEventMeta,
  buildEventEnvelope,
  filterSubscriptionsForEvent,
};
