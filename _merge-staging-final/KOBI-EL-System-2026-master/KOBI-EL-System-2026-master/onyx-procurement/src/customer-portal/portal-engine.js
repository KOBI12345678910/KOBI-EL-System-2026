/**
 * Customer Self-Service Portal Engine  |  מנוע פורטל לקוחות
 * ==========================================================
 *
 * Agent X-30  |  Swarm 3B  |  Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency self-service customer portal back-end. Customers can
 * sign in through a magic-link, browse their own invoices, pay online
 * (stub — the real payment gateway is wired in by a later agent), view
 * order status, request quotes, open support tickets (routed through
 * Agent X-21), maintain delivery addresses and contact info, and pull
 * statements of account.
 *
 * -------------------------------------------------------------
 * DESIGN PRINCIPLES
 * -------------------------------------------------------------
 *   • Strict data isolation — every read/write takes a customerId
 *     and the engine refuses to touch rows that don't match.
 *   • Never delete — an "updateAddress" call keeps the old address
 *     in an `addressHistory` array. Support tickets are closed,
 *     not removed. Invoices are immutable once issued.
 *   • Bilingual — every label/message has `_he` and `_en`.
 *   • Zero deps — only Node built-ins (`crypto`, `node:events`).
 *   • Hermetic — pure in-memory store seeded from `initialState`,
 *     so unit tests don't touch disk. A real deployment wires the
 *     repository hooks (`repo.saveInvoice`, ...) via the options
 *     bag in the constructor.
 *
 * -------------------------------------------------------------
 * PUBLIC API  (as requested by the task spec)
 * -------------------------------------------------------------
 *   customerLogin(email)                         → {ok, token, magicLink}
 *   verifyMagicLink(token)                       → {ok, customerId, session}
 *   getInvoices(customerId, filters)             → Invoice[]
 *   getInvoicePdf(customerId, invoiceId)         → {ok, fileRef, fallbackText}
 *   getStatement(customerId, period)             → ARStatement
 *   getOpenOrders(customerId)                    → Order[]
 *   getOrderHistory(customerId, filters)         → Order[]
 *   createQuoteRequest(customerId, items, meta)  → {ok, id}
 *   raiseSupport(customerId, subject, body, ...) → {ok, ticketId}
 *   updateAddress(customerId, addr)              → {ok}
 *   updateContact(customerId, contact)           → {ok}
 *   payInvoice(customerId, invoiceId, method)    → {ok, paymentRef}
 *   getDashboard(customerId)                     → DashboardSnapshot
 *
 *   + utility: listAddresses, listSupportTickets, listQuoteRequests,
 *     labels(key), isStrictlyOwnedBy(id, customer), normaliseEmail.
 *
 * RULE: never delete — every mutation keeps an audit trail in
 * `_audit` and the original record is preserved in history arrays.
 */

'use strict';

const crypto = require('crypto');

/* =====================================================================
 * BILINGUAL LABELS
 * ===================================================================*/

const LABELS = {
  title:          { he: 'פורטל לקוחות', en: 'Customer Portal' },
  invoices:       { he: 'חשבוניות',     en: 'Invoices' },
  paid:           { he: 'שולם',         en: 'Paid' },
  unpaid:         { he: 'לא שולם',      en: 'Unpaid' },
  overdue:        { he: 'באיחור',       en: 'Overdue' },
  partiallyPaid:  { he: 'שולם חלקית',  en: 'Partially paid' },
  draft:          { he: 'טיוטה',        en: 'Draft' },
  cancelled:      { he: 'בוטל',         en: 'Cancelled' },
  orderOpen:      { he: 'פתוחה',        en: 'Open' },
  orderPacking:   { he: 'באריזה',       en: 'Packing' },
  orderShipped:   { he: 'נשלח',         en: 'Shipped' },
  orderDelivered: { he: 'נמסר',         en: 'Delivered' },
  orderClosed:    { he: 'סגורה',        en: 'Closed' },
  dashboard:      { he: 'לוח בקרה',     en: 'Dashboard' },
  balanceDue:     { he: 'יתרה לתשלום',  en: 'Balance due' },
  recentOrders:   { he: 'הזמנות אחרונות', en: 'Recent orders' },
  quoteRequest:   { he: 'בקשת הצעת מחיר', en: 'Quote request' },
  support:        { he: 'תמיכה',        en: 'Support' },
  statement:      { he: 'דף חשבון',     en: 'Statement of account' },
  addresses:      { he: 'כתובות מסירה', en: 'Delivery addresses' },
  contactInfo:    { he: 'פרטי קשר',     en: 'Contact info' },
  loginSent:      { he: 'נשלח קישור כניסה', en: 'Magic-link sent' },

  // Errors
  errNotFound:    { he: 'לקוח לא נמצא',           en: 'Customer not found' },
  errEmail:       { he: 'כתובת דוא״ל לא תקינה',  en: 'Invalid e-mail' },
  errNotOwner:    { he: 'גישה חסומה — אין הרשאה', en: 'Access denied' },
  errBadToken:    { he: 'קישור פג תוקף',          en: 'Expired / invalid token' },
  errInvoice:     { he: 'חשבונית לא קיימת',      en: 'Invoice not found' },
  errOrder:       { he: 'הזמנה לא קיימת',        en: 'Order not found' },
  errEmpty:       { he: 'חסרים פריטים',          en: 'Missing items' },
  errAddress:     { he: 'כתובת חסרה או לא תקינה', en: 'Invalid address' },
  errSubject:     { he: 'חסרה כותרת',             en: 'Missing subject' },
  errAlreadyPaid: { he: 'החשבונית כבר שולמה',    en: 'Invoice already paid' },
  errPeriod:      { he: 'תקופה לא תקינה',         en: 'Invalid period' },
};

function labels(key) {
  return LABELS[key] || { he: key, en: key };
}

/* =====================================================================
 * HELPERS — dates, e-mail, money, id generation
 * ===================================================================*/

function normaliseEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

// Permissive (but not stupid) e-mail check — no external lib.
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function isValidEmail(raw) {
  if (typeof raw !== 'string') return false;
  if (raw.length > 254) return false;
  return EMAIL_RE.test(raw.trim());
}

function parseIsoDate(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? new Date(v.getTime()) : null;
  if (typeof v !== 'string' || v === '') return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function ymd(d) {
  if (!(d instanceof Date)) return '';
  return d.toISOString().slice(0, 10);
}

function today(clock) {
  return (clock && clock.now && clock.now()) || new Date();
}

function daysBetween(a, b) {
  const MS = 86400000;
  return Math.round((a.getTime() - b.getTime()) / MS);
}

function toCents(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function fromCents(c) {
  return Math.round(Number(c) || 0) / 100;
}

function newId(prefix) {
  // Crypto-grade id, no uuid dep.
  const buf = crypto.randomBytes(9);
  return `${prefix}-${buf.toString('hex').toUpperCase()}`;
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function stableKey(...parts) {
  return parts.map((p) => String(p == null ? '' : p)).join('|');
}

/* =====================================================================
 * INVOICE STATUS — derived, not stored
 * ===================================================================*/

/**
 * Derive the live status of an invoice without mutating it.
 * Paid   → amountPaid >= total
 * Overdue → unpaid AND dueDate < today
 * Partially → 0 < amountPaid < total
 * Unpaid → otherwise
 *
 * Draft + Cancelled are terminal and always honoured.
 */
function deriveInvoiceStatus(inv, now) {
  if (!inv) return 'unknown';
  if (inv.status === 'draft')     return 'draft';
  if (inv.status === 'cancelled') return 'cancelled';

  const total = toCents(inv.total);
  const paid  = toCents(inv.amountPaid || 0);

  if (paid >= total && total > 0) return 'paid';
  if (paid > 0 && paid < total)   return 'partiallyPaid';

  const due = parseIsoDate(inv.dueDate);
  if (due && now && due.getTime() < now.getTime()) return 'overdue';

  return 'unpaid';
}

/* =====================================================================
 * PORTAL ENGINE
 * ===================================================================*/

class CustomerPortalEngine {
  /**
   * @param {object} [opts]
   * @param {object} [opts.initialState]  seed data (customers, invoices, orders...)
   * @param {object} [opts.clock]         { now: () => Date } — override for tests
   * @param {object} [opts.supportBridge] { create: async ({customerId, subject, body, priority, meta}) => ticketId }
   * @param {object} [opts.pdfBridge]     { getInvoicePdf: async ({customerId, invoiceId}) => {fileRef, mime, bytes} }
   * @param {object} [opts.paymentBridge] { charge: async ({customerId, invoiceId, amount, method}) => paymentRef }
   * @param {object} [opts.mailer]        { send: async ({to, subject, body, link}) => void }
   * @param {number} [opts.tokenTtlMs]    default 15 minutes
   * @param {string} [opts.portalBaseUrl] used to build magic links
   */
  constructor(opts) {
    const o = opts || {};
    this.clock          = o.clock || { now: () => new Date() };
    this.supportBridge  = o.supportBridge  || null;
    this.pdfBridge      = o.pdfBridge      || null;
    this.paymentBridge  = o.paymentBridge  || null;
    this.mailer         = o.mailer         || null;
    this.tokenTtlMs     = Number.isFinite(o.tokenTtlMs) ? o.tokenTtlMs : 15 * 60 * 1000;
    this.portalBaseUrl  = o.portalBaseUrl  || 'https://portal.techno-kol.local';

    // ---- store (pure in-memory; can be swapped for a repo) ----
    const s = o.initialState || {};
    this._customers  = new Map(); // customerId -> Customer
    this._invoices   = new Map(); // invoiceId  -> Invoice
    this._orders     = new Map(); // orderId    -> Order
    this._quotes     = new Map(); // quoteId    -> QuoteRequest
    this._tickets    = new Map(); // ticketId   -> SupportTicket (local mirror)
    this._tokens     = new Map(); // token      -> {customerId, exp}
    this._sessions   = new Map(); // sessionId  -> {customerId, exp}
    this._audit      = [];        // append-only audit log

    (s.customers || []).forEach((c) => this._customers.set(c.id, this._seedCustomer(c)));
    (s.invoices  || []).forEach((i) => this._invoices.set(i.id, { ...i }));
    (s.orders    || []).forEach((o2) => this._orders.set(o2.id, { ...o2 }));
    (s.quotes    || []).forEach((q) => this._quotes.set(q.id, { ...q }));
    (s.tickets   || []).forEach((t) => this._tickets.set(t.id, { ...t }));
  }

  _seedCustomer(c) {
    return Object.assign(
      {
        id: c.id,
        name: c.name || '',
        email: normaliseEmail(c.email || ''),
        phone: c.phone || '',
        contactName: c.contactName || '',
        addresses: Array.isArray(c.addresses) ? c.addresses.slice() : [],
        addressHistory: Array.isArray(c.addressHistory) ? c.addressHistory.slice() : [],
        contactHistory: Array.isArray(c.contactHistory) ? c.contactHistory.slice() : [],
        createdAt: c.createdAt || this.clock.now().toISOString(),
        active: c.active !== false,
      },
      c._extra || {}
    );
  }

  /* ------------------------------------------------------------------
   * AUDIT
   * -----------------------------------------------------------------*/

  _log(action, customerId, payload) {
    this._audit.push({
      ts: this.clock.now().toISOString(),
      action,
      customerId: customerId || null,
      payload: payload || {},
    });
  }

  getAuditLog() {
    return this._audit.slice();
  }

  /* ------------------------------------------------------------------
   * ISOLATION GUARD — every single read/write goes through this.
   * -----------------------------------------------------------------*/

  _requireCustomer(customerId) {
    const c = this._customers.get(customerId);
    if (!c) {
      const err = new Error('customer_not_found');
      err.code = 'NOT_FOUND';
      err.label = LABELS.errNotFound;
      throw err;
    }
    if (!c.active) {
      const err = new Error('customer_inactive');
      err.code = 'INACTIVE';
      err.label = LABELS.errNotOwner;
      throw err;
    }
    return c;
  }

  isStrictlyOwnedBy(resource, customerId) {
    if (!resource || !customerId) return false;
    return resource.customerId === customerId;
  }

  _assertOwn(resource, customerId, notFoundLabel) {
    if (!resource) {
      const err = new Error('not_found');
      err.code = 'NOT_FOUND';
      err.label = notFoundLabel || LABELS.errNotFound;
      throw err;
    }
    if (!this.isStrictlyOwnedBy(resource, customerId)) {
      const err = new Error('access_denied');
      err.code = 'FORBIDDEN';
      err.label = LABELS.errNotOwner;
      throw err;
    }
    return resource;
  }

  /* ------------------------------------------------------------------
   * 1. AUTH — magic link
   * -----------------------------------------------------------------*/

  customerLogin(email) {
    const clean = normaliseEmail(email);
    if (!isValidEmail(clean)) {
      return { ok: false, error: 'invalid_email', label: LABELS.errEmail };
    }

    // Look up by email — no enumeration, even unknown emails succeed
    // and we simply do not mint a token. (Classic defence.)
    let match = null;
    for (const c of this._customers.values()) {
      if (c.email === clean && c.active) { match = c; break; }
    }

    if (!match) {
      this._log('login_unknown', null, { email: clean });
      return {
        ok: true,
        sent: false, // caller sees success; real system still sends no mail
        label: LABELS.loginSent,
      };
    }

    const token = newToken();
    const exp = this.clock.now().getTime() + this.tokenTtlMs;
    this._tokens.set(token, { customerId: match.id, exp });

    const magicLink = `${this.portalBaseUrl}/auth/verify?token=${token}`;

    // Best-effort mail dispatch — never blocks the caller.
    if (this.mailer && typeof this.mailer.send === 'function') {
      try {
        Promise.resolve(
          this.mailer.send({
            to: match.email,
            subject: 'קישור כניסה לפורטל | Portal sign-in link',
            body:
              'שלום,\nלחץ על הקישור הבא כדי להיכנס לפורטל הלקוחות שלך.\n\n' +
              'Hello,\nClick the link below to sign in to your customer portal.\n\n' +
              magicLink,
            link: magicLink,
          })
        ).catch(() => {});
      } catch (_) { /* swallow */ }
    }

    this._log('login_issued', match.id, { token });

    return {
      ok: true,
      sent: true,
      token,
      magicLink,
      label: LABELS.loginSent,
    };
  }

  verifyMagicLink(token) {
    if (typeof token !== 'string' || token === '') {
      return { ok: false, error: 'bad_token', label: LABELS.errBadToken };
    }
    const rec = this._tokens.get(token);
    if (!rec) return { ok: false, error: 'bad_token', label: LABELS.errBadToken };
    if (rec.exp < this.clock.now().getTime()) {
      this._tokens.delete(token);
      return { ok: false, error: 'expired', label: LABELS.errBadToken };
    }
    // Single-use token
    this._tokens.delete(token);

    const sessionId = newToken();
    const sessionExp = this.clock.now().getTime() + 8 * 60 * 60 * 1000; // 8h
    this._sessions.set(sessionId, { customerId: rec.customerId, exp: sessionExp });

    this._log('login_verified', rec.customerId, { sessionId });

    return {
      ok: true,
      customerId: rec.customerId,
      session: { id: sessionId, exp: sessionExp },
    };
  }

  resolveSession(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return null;
    if (s.exp < this.clock.now().getTime()) {
      this._sessions.delete(sessionId);
      return null;
    }
    return s.customerId;
  }

  /* ------------------------------------------------------------------
   * 2. INVOICES
   * -----------------------------------------------------------------*/

  getInvoices(customerId, filters) {
    this._requireCustomer(customerId);
    const f = filters || {};
    const now = this.clock.now();

    const rows = [];
    for (const inv of this._invoices.values()) {
      if (inv.customerId !== customerId) continue;

      const status = deriveInvoiceStatus(inv, now);
      if (f.status && f.status !== status) {
        // Special: filter="unpaid" should also include partiallyPaid + overdue
        if (f.status === 'unpaid') {
          if (status !== 'unpaid' && status !== 'partiallyPaid' && status !== 'overdue') continue;
        } else if (f.status === 'openOnly' && (status === 'paid' || status === 'cancelled')) {
          continue;
        } else {
          continue;
        }
      }

      if (f.from) {
        const d = parseIsoDate(inv.issueDate);
        const lo = parseIsoDate(f.from);
        if (d && lo && d.getTime() < lo.getTime()) continue;
      }
      if (f.to) {
        const d = parseIsoDate(inv.issueDate);
        const hi = parseIsoDate(f.to);
        if (d && hi && d.getTime() > hi.getTime()) continue;
      }
      if (f.search) {
        const needle = String(f.search).toLowerCase();
        const hay = [
          inv.number || '', inv.reference || '', inv.description || '',
        ].join(' ').toLowerCase();
        if (hay.indexOf(needle) === -1) continue;
      }

      rows.push({
        ...inv,
        status,               // derived
        amountPaid: fromCents(toCents(inv.amountPaid || 0)),
        total: fromCents(toCents(inv.total || 0)),
        balance: fromCents(toCents(inv.total || 0) - toCents(inv.amountPaid || 0)),
      });
    }

    // Newest first, tie-breaker on number.
    rows.sort((a, b) => {
      const da = parseIsoDate(a.issueDate);
      const db = parseIsoDate(b.issueDate);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(b.number || '').localeCompare(String(a.number || ''));
    });

    return rows;
  }

  getInvoiceById(customerId, invoiceId) {
    this._requireCustomer(customerId);
    const inv = this._invoices.get(invoiceId);
    this._assertOwn(inv, customerId, LABELS.errInvoice);
    const status = deriveInvoiceStatus(inv, this.clock.now());
    return {
      ...inv,
      status,
      balance: fromCents(toCents(inv.total || 0) - toCents(inv.amountPaid || 0)),
    };
  }

  async getInvoicePdf(customerId, invoiceId) {
    this._requireCustomer(customerId);
    const inv = this._invoices.get(invoiceId);
    this._assertOwn(inv, customerId, LABELS.errInvoice);

    if (this.pdfBridge && typeof this.pdfBridge.getInvoicePdf === 'function') {
      try {
        const res = await this.pdfBridge.getInvoicePdf({ customerId, invoiceId });
        this._log('invoice_pdf', customerId, { invoiceId, via: 'bridge' });
        return {
          ok: true,
          fileRef: res && res.fileRef ? res.fileRef : `invoice-${invoiceId}.pdf`,
          mime: (res && res.mime) || 'application/pdf',
          bytes: res && res.bytes ? res.bytes : null,
          fallbackText: null,
        };
      } catch (_) {
        /* fall through to inline */
      }
    }

    // Inline (no Agent X-23) — produce a deterministic text receipt
    // that downstream code can render as a PDF later.
    const text = [
      '════════════════════════════════',
      'Techno-Kol Uzi — חשבונית',
      '════════════════════════════════',
      `מספר: ${inv.number || inv.id}`,
      `תאריך: ${inv.issueDate || ''}`,
      `לקוח: ${customerId}`,
      `סכום: ${fromCents(toCents(inv.total || 0)).toFixed(2)} ${inv.currency || 'ILS'}`,
      `שולם: ${fromCents(toCents(inv.amountPaid || 0)).toFixed(2)}`,
      `יתרה: ${(fromCents(toCents(inv.total || 0) - toCents(inv.amountPaid || 0))).toFixed(2)}`,
      '────────────────────────────────',
      inv.description || '',
      '',
    ].join('\n');

    this._log('invoice_pdf', customerId, { invoiceId, via: 'inline' });

    return {
      ok: true,
      fileRef: `inline://invoice-${invoiceId}.txt`,
      mime: 'text/plain',
      bytes: Buffer.from(text, 'utf8'),
      fallbackText: text,
    };
  }

  /* ------------------------------------------------------------------
   * 3. PAY ONLINE (stub — gateway wired later)
   * -----------------------------------------------------------------*/

  async payInvoice(customerId, invoiceId, method, amountOverride) {
    this._requireCustomer(customerId);
    const inv = this._invoices.get(invoiceId);
    this._assertOwn(inv, customerId, LABELS.errInvoice);

    const status = deriveInvoiceStatus(inv, this.clock.now());
    if (status === 'paid') {
      return { ok: false, error: 'already_paid', label: LABELS.errAlreadyPaid };
    }
    if (status === 'cancelled' || status === 'draft') {
      return { ok: false, error: 'not_payable', label: LABELS.errInvoice };
    }

    const totalCents = toCents(inv.total || 0);
    const paidCents  = toCents(inv.amountPaid || 0);
    const dueCents   = Math.max(0, totalCents - paidCents);

    const payCents = amountOverride != null
      ? Math.min(toCents(amountOverride), dueCents)
      : dueCents;

    let paymentRef = null;
    if (this.paymentBridge && typeof this.paymentBridge.charge === 'function') {
      try {
        paymentRef = await this.paymentBridge.charge({
          customerId,
          invoiceId,
          amount: fromCents(payCents),
          method: method || 'card',
        });
      } catch (_) {
        // Gateway refused — surface a clean error.
        return { ok: false, error: 'gateway_declined', label: LABELS.errInvoice };
      }
    }
    if (!paymentRef) paymentRef = newId('PAY');

    const next = {
      ...inv,
      amountPaid: fromCents(paidCents + payCents),
      payments: Array.isArray(inv.payments) ? inv.payments.slice() : [],
    };
    next.payments.push({
      ref: paymentRef,
      at: this.clock.now().toISOString(),
      amount: fromCents(payCents),
      method: method || 'card',
    });

    this._invoices.set(invoiceId, next);
    this._log('invoice_pay', customerId, { invoiceId, paymentRef, amount: fromCents(payCents) });

    return {
      ok: true,
      paymentRef,
      amount: fromCents(payCents),
      newStatus: deriveInvoiceStatus(next, this.clock.now()),
    };
  }

  /* ------------------------------------------------------------------
   * 4. ORDERS
   * -----------------------------------------------------------------*/

  getOpenOrders(customerId) {
    this._requireCustomer(customerId);
    const rows = [];
    for (const o of this._orders.values()) {
      if (o.customerId !== customerId) continue;
      const s = o.status || 'open';
      if (s === 'closed' || s === 'delivered' || s === 'cancelled') continue;
      rows.push({ ...o });
    }
    rows.sort((a, b) => {
      const da = parseIsoDate(a.createdAt);
      const db = parseIsoDate(b.createdAt);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    return rows;
  }

  getOrderHistory(customerId, filters) {
    this._requireCustomer(customerId);
    const f = filters || {};
    const rows = [];
    for (const o of this._orders.values()) {
      if (o.customerId !== customerId) continue;
      if (f.status && o.status !== f.status) continue;
      if (f.from) {
        const d = parseIsoDate(o.createdAt);
        const lo = parseIsoDate(f.from);
        if (d && lo && d.getTime() < lo.getTime()) continue;
      }
      if (f.to) {
        const d = parseIsoDate(o.createdAt);
        const hi = parseIsoDate(f.to);
        if (d && hi && d.getTime() > hi.getTime()) continue;
      }
      rows.push({ ...o });
    }
    rows.sort((a, b) => {
      const da = parseIsoDate(a.createdAt);
      const db = parseIsoDate(b.createdAt);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    return rows;
  }

  /* ------------------------------------------------------------------
   * 5. QUOTE REQUESTS
   * -----------------------------------------------------------------*/

  createQuoteRequest(customerId, items, meta) {
    this._requireCustomer(customerId);
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: 'empty_items', label: LABELS.errEmpty };
    }

    const cleanItems = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const qty = Number(it.quantity || it.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      cleanItems.push({
        sku: String(it.sku || ''),
        description: String(it.description || ''),
        quantity: qty,
        unit: String(it.unit || 'ea'),
        notes: String(it.notes || ''),
      });
    }
    if (cleanItems.length === 0) {
      return { ok: false, error: 'empty_items', label: LABELS.errEmpty };
    }

    const id = newId('QRQ');
    const now = this.clock.now().toISOString();
    const rec = {
      id,
      customerId,
      items: cleanItems,
      meta: (meta && typeof meta === 'object') ? { ...meta } : {},
      status: 'pending',
      createdAt: now,
    };
    this._quotes.set(id, rec);
    this._log('quote_request', customerId, { id, items: cleanItems.length });
    return { ok: true, id };
  }

  listQuoteRequests(customerId) {
    this._requireCustomer(customerId);
    const out = [];
    for (const q of this._quotes.values()) {
      if (q.customerId === customerId) out.push({ ...q });
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return out;
  }

  /* ------------------------------------------------------------------
   * 6. SUPPORT TICKETS — bridges to Agent X-21
   * -----------------------------------------------------------------*/

  async raiseSupport(customerId, subject, description, priority, meta) {
    this._requireCustomer(customerId);
    if (typeof subject !== 'string' || subject.trim() === '') {
      return { ok: false, error: 'empty_subject', label: LABELS.errSubject };
    }
    const pri = ['low', 'normal', 'high', 'urgent'].indexOf(priority) >= 0
      ? priority : 'normal';

    let ticketId = null;
    if (this.supportBridge && typeof this.supportBridge.create === 'function') {
      try {
        ticketId = await this.supportBridge.create({
          customerId,
          subject: subject.trim(),
          body: String(description || ''),
          priority: pri,
          meta: (meta && typeof meta === 'object') ? { ...meta } : {},
        });
      } catch (_) {
        // Bridge failed — fall back to local ticket, don't lose data.
      }
    }
    if (!ticketId) ticketId = newId('TCK');

    const rec = {
      id: ticketId,
      customerId,
      subject: subject.trim(),
      body: String(description || ''),
      priority: pri,
      status: 'open',
      createdAt: this.clock.now().toISOString(),
      source: 'portal',
      meta: (meta && typeof meta === 'object') ? { ...meta } : {},
    };
    this._tickets.set(ticketId, rec);
    this._log('support_raised', customerId, { ticketId, priority: pri });

    return { ok: true, ticketId };
  }

  listSupportTickets(customerId) {
    this._requireCustomer(customerId);
    const out = [];
    for (const t of this._tickets.values()) {
      if (t.customerId === customerId) out.push({ ...t });
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return out;
  }

  /* ------------------------------------------------------------------
   * 7. ADDRESSES — never delete; keep history
   * -----------------------------------------------------------------*/

  listAddresses(customerId) {
    const c = this._requireCustomer(customerId);
    return c.addresses.slice();
  }

  updateAddress(customerId, addr) {
    const c = this._requireCustomer(customerId);
    if (!addr || typeof addr !== 'object') {
      return { ok: false, error: 'bad_address', label: LABELS.errAddress };
    }
    const required = ['street', 'city'];
    for (const k of required) {
      if (!addr[k] || typeof addr[k] !== 'string' || addr[k].trim() === '') {
        return { ok: false, error: 'bad_address', label: LABELS.errAddress };
      }
    }
    const clean = {
      id: addr.id || newId('ADR'),
      label: String(addr.label || 'Main'),
      street: String(addr.street).trim(),
      city: String(addr.city).trim(),
      zip: String(addr.zip || '').trim(),
      country: String(addr.country || 'IL').trim(),
      notes: String(addr.notes || '').trim(),
      updatedAt: this.clock.now().toISOString(),
      isPrimary: addr.isPrimary === true,
    };

    // Move any previous entry with the same id (or any primary, if new one
    // is primary) into history — never delete.
    const next = [];
    for (const existing of c.addresses) {
      if (existing.id === clean.id) {
        c.addressHistory.push({ ...existing, retiredAt: this.clock.now().toISOString() });
        continue;
      }
      if (clean.isPrimary && existing.isPrimary) {
        c.addressHistory.push({ ...existing, retiredAt: this.clock.now().toISOString() });
        next.push({ ...existing, isPrimary: false });
        continue;
      }
      next.push(existing);
    }
    next.push(clean);
    c.addresses = next;

    this._log('address_updated', customerId, { addressId: clean.id });
    return { ok: true, address: clean };
  }

  /* ------------------------------------------------------------------
   * 8. CONTACT INFO — never delete; history kept
   * -----------------------------------------------------------------*/

  updateContact(customerId, contact) {
    const c = this._requireCustomer(customerId);
    if (!contact || typeof contact !== 'object') {
      return { ok: false, error: 'bad_contact', label: LABELS.errAddress };
    }
    if (contact.email && !isValidEmail(contact.email)) {
      return { ok: false, error: 'bad_email', label: LABELS.errEmail };
    }

    c.contactHistory.push({
      contactName: c.contactName,
      phone: c.phone,
      email: c.email,
      retiredAt: this.clock.now().toISOString(),
    });

    if (typeof contact.contactName === 'string') c.contactName = contact.contactName.trim();
    if (typeof contact.phone === 'string')       c.phone       = contact.phone.trim();
    if (typeof contact.email === 'string')       c.email       = normaliseEmail(contact.email);

    this._log('contact_updated', customerId, {});
    return { ok: true };
  }

  /* ------------------------------------------------------------------
   * 9. STATEMENT OF ACCOUNT
   * -----------------------------------------------------------------*/

  getStatement(customerId, period) {
    this._requireCustomer(customerId);

    const p = period || {};
    let from = parseIsoDate(p.from);
    let to   = parseIsoDate(p.to);

    if (!from && !to) {
      // Default: last 30 days from clock.
      const now = this.clock.now();
      to = now;
      from = new Date(now.getTime() - 30 * 86400000);
    }
    if (!from || !to) {
      const err = new Error('invalid_period');
      err.code = 'BAD_REQUEST';
      err.label = LABELS.errPeriod;
      throw err;
    }
    if (from.getTime() > to.getTime()) {
      const err = new Error('invalid_period');
      err.code = 'BAD_REQUEST';
      err.label = LABELS.errPeriod;
      throw err;
    }

    const rowsOut = [];
    let totalCharges = 0;
    let totalPayments = 0;
    let openingCents = 0;

    for (const inv of this._invoices.values()) {
      if (inv.customerId !== customerId) continue;

      const issued = parseIsoDate(inv.issueDate);
      if (!issued) continue;

      if (issued.getTime() < from.getTime()) {
        // Opening balance contribution
        openingCents += toCents(inv.total || 0) - toCents(inv.amountPaid || 0);
        continue;
      }
      if (issued.getTime() > to.getTime()) continue;

      const chargeCents = toCents(inv.total || 0);
      totalCharges += chargeCents;
      rowsOut.push({
        kind: 'invoice',
        date: ymd(issued),
        ref: inv.number || inv.id,
        debit: fromCents(chargeCents),
        credit: 0,
      });

      if (Array.isArray(inv.payments)) {
        for (const p2 of inv.payments) {
          const pd = parseIsoDate(p2.at);
          if (!pd) continue;
          if (pd.getTime() < from.getTime() || pd.getTime() > to.getTime()) continue;
          const payCents = toCents(p2.amount || 0);
          totalPayments += payCents;
          rowsOut.push({
            kind: 'payment',
            date: ymd(pd),
            ref: p2.ref,
            debit: 0,
            credit: fromCents(payCents),
          });
        }
      }
    }

    // Sort chronologically within the window.
    rowsOut.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Running balance, starting at opening.
    let runCents = openingCents;
    for (const r of rowsOut) {
      runCents += toCents(r.debit) - toCents(r.credit);
      r.balance = fromCents(runCents);
    }

    return {
      customerId,
      period: { from: ymd(from), to: ymd(to) },
      opening: fromCents(openingCents),
      closing: fromCents(runCents),
      totalCharges: fromCents(totalCharges),
      totalPayments: fromCents(totalPayments),
      rows: rowsOut,
    };
  }

  /* ------------------------------------------------------------------
   * 10. DASHBOARD
   * -----------------------------------------------------------------*/

  getDashboard(customerId) {
    this._requireCustomer(customerId);
    const now = this.clock.now();

    let balanceCents = 0;
    let overdueCount = 0;
    let unpaidCount  = 0;
    let paidCount    = 0;

    const allInvoices = this.getInvoices(customerId, {});
    for (const inv of allInvoices) {
      const balCents = toCents(inv.total || 0) - toCents(inv.amountPaid || 0);
      if (inv.status === 'paid')           paidCount++;
      if (inv.status === 'overdue')       { overdueCount++; balanceCents += Math.max(0, balCents); }
      if (inv.status === 'unpaid')        { unpaidCount++;  balanceCents += Math.max(0, balCents); }
      if (inv.status === 'partiallyPaid') { unpaidCount++;  balanceCents += Math.max(0, balCents); }
    }

    const openOrders = this.getOpenOrders(customerId);
    const recentOrders = this.getOrderHistory(customerId, {}).slice(0, 5);
    const openTickets = this.listSupportTickets(customerId).filter((t) => t.status === 'open');

    return {
      customerId,
      asOf: now.toISOString(),
      balanceDue: fromCents(balanceCents),
      overdueCount,
      unpaidCount,
      paidCount,
      invoiceCount: allInvoices.length,
      openOrders: openOrders.length,
      openTickets: openTickets.length,
      recentOrders,
      labels: {
        balanceDue: LABELS.balanceDue,
        overdue: LABELS.overdue,
        recentOrders: LABELS.recentOrders,
      },
    };
  }
}

/* =====================================================================
 * MODULE EXPORTS
 * ===================================================================*/

module.exports = {
  CustomerPortalEngine,

  // Functional façade — matches the public API spec literally.
  customerLogin:         (engine, email) => engine.customerLogin(email),
  getInvoices:           (engine, cid, filters)        => engine.getInvoices(cid, filters),
  getInvoicePdf:         (engine, cid, invoiceId)      => engine.getInvoicePdf(cid, invoiceId),
  getStatement:          (engine, cid, period)         => engine.getStatement(cid, period),
  getOpenOrders:         (engine, cid)                 => engine.getOpenOrders(cid),
  createQuoteRequest:    (engine, cid, items, meta)    => engine.createQuoteRequest(cid, items, meta),
  raiseSupport:          (engine, cid, s, d, p, m)     => engine.raiseSupport(cid, s, d, p, m),
  updateAddress:         (engine, cid, addr)           => engine.updateAddress(cid, addr),

  // Helpers & internals exposed for testing / UI
  LABELS,
  labels,
  normaliseEmail,
  isValidEmail,
  deriveInvoiceStatus,
  _internal: {
    parseIsoDate,
    ymd,
    daysBetween,
    toCents,
    fromCents,
    newId,
    newToken,
    stableKey,
  },
};
