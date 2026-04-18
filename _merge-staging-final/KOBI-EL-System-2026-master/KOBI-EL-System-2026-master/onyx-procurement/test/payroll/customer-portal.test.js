/**
 * Customer Portal Engine — Unit Tests  |  מבחני פורטל לקוחות
 * ==============================================================
 *
 * Agent X-30  |  Swarm 3B  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:    node --test test/payroll/customer-portal.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * 30+ test cases exercising:
 *   • Magic-link login happy-path & enumeration defence
 *   • Session verification + single-use token + expiry
 *   • Strict data isolation across every read/write
 *   • Invoice listing + derived status (paid/unpaid/overdue/partially)
 *   • Invoice filters + search + sort
 *   • Invoice PDF bridge + inline fallback
 *   • Online payment + partial payment + already-paid rejection
 *   • Open orders + order history with filters
 *   • Quote request creation + empty-items rejection
 *   • Support ticket raise via bridge + local fallback
 *   • Address update — never delete, history preserved
 *   • Contact update — never delete, history preserved
 *   • Statement of account with opening balance + running balance
 *   • Dashboard snapshot (balance due, overdue, recent orders)
 *   • Audit trail is append-only
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CustomerPortalEngine,
  deriveInvoiceStatus,
  isValidEmail,
  normaliseEmail,
  LABELS,
  labels,
  _internal,
} = require(path.resolve(
  __dirname, '..', '..',
  'src', 'customer-portal', 'portal-engine.js'
));

/* -------------------------------------------------------------------
 * Fixture helpers
 * -----------------------------------------------------------------*/

function fixedClock(iso) {
  let now = new Date(iso);
  return {
    now: () => new Date(now.getTime()),
    advance: (ms) => { now = new Date(now.getTime() + ms); },
  };
}

function baseState() {
  return {
    customers: [
      {
        id: 'C-1', name: 'לקוח אלפא',
        email: 'alpha@example.co.il', phone: '050-1111111',
        contactName: 'רוני כהן',
        addresses: [
          { id: 'ADR-1', label: 'Main', street: 'הרצל 1', city: 'תל אביב', zip: '6100000', isPrimary: true },
        ],
      },
      {
        id: 'C-2', name: 'לקוח בטא',
        email: 'beta@example.co.il', phone: '050-2222222',
        contactName: 'דני לוי',
        addresses: [],
      },
      {
        id: 'C-3', name: 'לקוח גמא', email: 'gamma@example.co.il',
        active: false,
      },
    ],
    invoices: [
      // C-1 invoices
      { id: 'INV-1', customerId: 'C-1', number: '2026-0001',
        issueDate: '2026-02-01', dueDate: '2026-02-28',
        total: 1000, amountPaid: 1000, status: 'issued',
        description: 'ציוד אלומיניום', currency: 'ILS' },
      { id: 'INV-2', customerId: 'C-1', number: '2026-0002',
        issueDate: '2026-03-01', dueDate: '2026-03-31',
        total: 2000, amountPaid: 0, status: 'issued',
        description: 'ידיות וזכוכיות', currency: 'ILS' },
      { id: 'INV-3', customerId: 'C-1', number: '2026-0003',
        issueDate: '2026-03-10', dueDate: '2026-03-20',
        total: 500, amountPaid: 100, status: 'issued',
        description: 'משלוח דחוף' },
      { id: 'INV-4', customerId: 'C-1', number: '2026-0004',
        issueDate: '2026-04-05', dueDate: '2026-05-05',
        total: 1500, amountPaid: 0, status: 'issued',
        description: 'פרופילים' },
      // C-2 invoice — must never appear for C-1
      { id: 'INV-X', customerId: 'C-2', number: '2026-9999',
        issueDate: '2026-03-15', dueDate: '2026-04-15',
        total: 9000, amountPaid: 0 },
    ],
    orders: [
      { id: 'ORD-1', customerId: 'C-1', number: 'O-1001',
        status: 'packing', total: 1234, currency: 'ILS',
        createdAt: '2026-04-01T10:00:00Z' },
      { id: 'ORD-2', customerId: 'C-1', number: 'O-1002',
        status: 'delivered', total: 900, currency: 'ILS',
        createdAt: '2026-03-20T10:00:00Z' },
      { id: 'ORD-3', customerId: 'C-1', number: 'O-1003',
        status: 'shipped', total: 500, currency: 'ILS',
        createdAt: '2026-04-06T10:00:00Z' },
      { id: 'ORD-Y', customerId: 'C-2', number: 'O-9999',
        status: 'packing', total: 7777, createdAt: '2026-04-02T10:00:00Z' },
    ],
  };
}

function makeEngine(overrides) {
  const clock = (overrides && overrides.clock) || fixedClock('2026-04-10T09:00:00Z');
  const state = (overrides && overrides.state) || baseState();
  return new CustomerPortalEngine({
    clock,
    initialState: state,
    supportBridge: overrides && overrides.supportBridge,
    pdfBridge:     overrides && overrides.pdfBridge,
    paymentBridge: overrides && overrides.paymentBridge,
    mailer:        overrides && overrides.mailer,
    portalBaseUrl: 'https://portal.test',
  });
}

/* ===================================================================
 * 1. Helpers & validation
 * =================================================================*/

test('isValidEmail accepts standard addresses', () => {
  assert.equal(isValidEmail('kobi@techno-kol.co.il'), true);
  assert.equal(isValidEmail('a.b+tag@sub.example.com'), true);
});

test('isValidEmail rejects malformed addresses', () => {
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('no-at'), false);
  assert.equal(isValidEmail('two@@at.com'), false);
  assert.equal(isValidEmail('trailing@dot.'), false);
  assert.equal(isValidEmail(null), false);
});

test('normaliseEmail lowercases and trims', () => {
  assert.equal(normaliseEmail('  Kobi@Techno-Kol.CO.IL  '), 'kobi@techno-kol.co.il');
  assert.equal(normaliseEmail(42), '');
});

test('labels() always returns bilingual object', () => {
  const l = labels('invoices');
  assert.equal(l.he, 'חשבוניות');
  assert.equal(l.en, 'Invoices');
  const missing = labels('__unknown__');
  assert.equal(missing.he, '__unknown__');
  assert.equal(missing.en, '__unknown__');
});

test('LABELS contains Hebrew translations for all exposed keys', () => {
  for (const k of Object.keys(LABELS)) {
    assert.ok(LABELS[k].he, `missing he for ${k}`);
    assert.ok(LABELS[k].en, `missing en for ${k}`);
  }
});

/* ===================================================================
 * 2. Invoice status derivation
 * =================================================================*/

test('deriveInvoiceStatus: paid when amountPaid >= total', () => {
  const inv = { total: 100, amountPaid: 100, dueDate: '2020-01-01' };
  assert.equal(deriveInvoiceStatus(inv, new Date('2026-04-10')), 'paid');
});

test('deriveInvoiceStatus: overdue when unpaid and past due', () => {
  const inv = { total: 100, amountPaid: 0, dueDate: '2026-01-01' };
  assert.equal(deriveInvoiceStatus(inv, new Date('2026-04-10')), 'overdue');
});

test('deriveInvoiceStatus: partiallyPaid when 0 < paid < total', () => {
  const inv = { total: 100, amountPaid: 50, dueDate: '2099-12-31' };
  assert.equal(deriveInvoiceStatus(inv, new Date('2026-04-10')), 'partiallyPaid');
});

test('deriveInvoiceStatus: draft and cancelled are preserved', () => {
  assert.equal(
    deriveInvoiceStatus({ total: 1, status: 'draft' }, new Date()),
    'draft'
  );
  assert.equal(
    deriveInvoiceStatus({ total: 1, status: 'cancelled' }, new Date()),
    'cancelled'
  );
});

/* ===================================================================
 * 3. Auth — magic link
 * =================================================================*/

test('customerLogin mints a token for a known customer', () => {
  const e = makeEngine();
  const res = e.customerLogin('alpha@example.co.il');
  assert.equal(res.ok, true);
  assert.equal(res.sent, true);
  assert.ok(res.token && res.token.length > 10);
  assert.match(res.magicLink, /^https:\/\/portal\.test\/auth\/verify\?token=/);
});

test('customerLogin normalises and accepts upper-case e-mail', () => {
  const e = makeEngine();
  const res = e.customerLogin('  ALPHA@Example.CO.IL  ');
  assert.equal(res.ok, true);
  assert.equal(res.sent, true);
});

test('customerLogin returns ok but no token for unknown e-mail (enum defence)', () => {
  const e = makeEngine();
  const res = e.customerLogin('ghost@example.com');
  assert.equal(res.ok, true);
  assert.equal(res.sent, false);
  assert.equal(res.token, undefined);
});

test('customerLogin rejects invalid e-mail with bilingual error label', () => {
  const e = makeEngine();
  const res = e.customerLogin('not-an-email');
  assert.equal(res.ok, false);
  assert.equal(res.label.he, 'כתובת דוא״ל לא תקינה');
});

test('verifyMagicLink establishes a session for a valid token', () => {
  const e = makeEngine();
  const login = e.customerLogin('alpha@example.co.il');
  const v = e.verifyMagicLink(login.token);
  assert.equal(v.ok, true);
  assert.equal(v.customerId, 'C-1');
  assert.ok(v.session && v.session.id);
});

test('verifyMagicLink is single-use (re-use rejected)', () => {
  const e = makeEngine();
  const login = e.customerLogin('alpha@example.co.il');
  const first = e.verifyMagicLink(login.token);
  assert.equal(first.ok, true);
  const second = e.verifyMagicLink(login.token);
  assert.equal(second.ok, false);
});

test('verifyMagicLink rejects expired token', () => {
  const clock = fixedClock('2026-04-10T09:00:00Z');
  const e = new CustomerPortalEngine({
    clock,
    initialState: baseState(),
    tokenTtlMs: 1000,
  });
  const login = e.customerLogin('alpha@example.co.il');
  clock.advance(2000);
  const v = e.verifyMagicLink(login.token);
  assert.equal(v.ok, false);
  assert.equal(v.error, 'expired');
});

test('resolveSession returns null for unknown sessions', () => {
  const e = makeEngine();
  assert.equal(e.resolveSession('nope'), null);
});

test('mailer is invoked best-effort on login without blocking', async () => {
  let sent = null;
  const mailer = { send: async (msg) => { sent = msg; } };
  const e = makeEngine({ mailer });
  e.customerLogin('alpha@example.co.il');
  // flush microtasks
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(sent);
  assert.equal(sent.to, 'alpha@example.co.il');
  assert.match(sent.body, /portal\.test\/auth\/verify/);
});

/* ===================================================================
 * 4. Strict data isolation
 * =================================================================*/

test('getInvoices returns only the caller\'s invoices', () => {
  const e = makeEngine();
  const c1 = e.getInvoices('C-1', {});
  const c2 = e.getInvoices('C-2', {});
  assert.equal(c1.length, 4);
  assert.equal(c2.length, 1);
  assert.deepEqual(c1.map((r) => r.customerId).filter((x) => x !== 'C-1'), []);
});

test('getInvoiceById refuses cross-tenant access', () => {
  const e = makeEngine();
  assert.throws(
    () => e.getInvoiceById('C-1', 'INV-X'),
    (err) => err.code === 'FORBIDDEN'
  );
});

test('getOpenOrders never leaks other customers\' orders', () => {
  const e = makeEngine();
  const open = e.getOpenOrders('C-1');
  assert.ok(open.every((o) => o.customerId === 'C-1'));
  assert.ok(open.find((o) => o.id === 'ORD-1'));
  assert.ok(open.find((o) => o.id === 'ORD-3'));
  assert.ok(!open.find((o) => o.id === 'ORD-2')); // delivered -> not open
  assert.ok(!open.find((o) => o.id === 'ORD-Y')); // different customer
});

test('_requireCustomer throws NOT_FOUND for unknown ids', () => {
  const e = makeEngine();
  assert.throws(() => e.getInvoices('C-999', {}), (err) => err.code === 'NOT_FOUND');
});

test('inactive customers cannot read their own data', () => {
  const e = makeEngine();
  assert.throws(() => e.getInvoices('C-3', {}), (err) => err.code === 'INACTIVE');
});

/* ===================================================================
 * 5. Invoices — filters, status, sort
 * =================================================================*/

test('getInvoices exposes derived status + balance', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', {});
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId['INV-1'].status, 'paid');
  assert.equal(byId['INV-1'].balance, 0);
  assert.equal(byId['INV-2'].status, 'overdue');     // due 2026-03-31, today 2026-04-10
  assert.equal(byId['INV-2'].balance, 2000);
  assert.equal(byId['INV-3'].status, 'partiallyPaid'); // 100 of 500
  assert.equal(byId['INV-3'].balance, 400);
  assert.equal(byId['INV-4'].status, 'unpaid');      // due in future
});

test('getInvoices filter=paid returns only paid', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', { status: 'paid' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'INV-1');
});

test('getInvoices filter=unpaid includes overdue + partiallyPaid', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', { status: 'unpaid' });
  const ids = rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ['INV-2', 'INV-3', 'INV-4']);
});

test('getInvoices filter=overdue isolates overdue only', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', { status: 'overdue' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'INV-2');
});

test('getInvoices date range filter narrows results', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', { from: '2026-03-01', to: '2026-03-31' });
  const ids = rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ['INV-2', 'INV-3']);
});

test('getInvoices search matches number & description substring', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', { search: '0003' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'INV-3');
  const byDesc = e.getInvoices('C-1', { search: 'אלומיניום' });
  assert.equal(byDesc[0].id, 'INV-1');
});

test('getInvoices sorts newest first', () => {
  const e = makeEngine();
  const rows = e.getInvoices('C-1', {});
  const dates = rows.map((r) => r.issueDate);
  const sorted = dates.slice().sort().reverse();
  assert.deepEqual(dates, sorted);
});

/* ===================================================================
 * 6. Invoice PDFs
 * =================================================================*/

test('getInvoicePdf uses bridge when available', async () => {
  const calls = [];
  const bridge = {
    getInvoicePdf: async ({ customerId, invoiceId }) => {
      calls.push([customerId, invoiceId]);
      return { fileRef: 'foundry://inv/INV-2', mime: 'application/pdf', bytes: Buffer.from('PDF') };
    },
  };
  const e = makeEngine({ pdfBridge: bridge });
  const res = await e.getInvoicePdf('C-1', 'INV-2');
  assert.equal(res.ok, true);
  assert.equal(res.fileRef, 'foundry://inv/INV-2');
  assert.equal(res.mime, 'application/pdf');
  assert.deepEqual(calls, [['C-1', 'INV-2']]);
});

test('getInvoicePdf falls back to inline text when no bridge', async () => {
  const e = makeEngine();
  const res = await e.getInvoicePdf('C-1', 'INV-2');
  assert.equal(res.ok, true);
  assert.match(res.fileRef, /^inline:\/\/invoice-INV-2/);
  assert.match(res.fallbackText, /Techno-Kol Uzi/);
  assert.match(res.fallbackText, /2026-0002/);
});

test('getInvoicePdf forbids cross-tenant access', async () => {
  const e = makeEngine();
  await assert.rejects(
    () => e.getInvoicePdf('C-1', 'INV-X'),
    (err) => err.code === 'FORBIDDEN'
  );
});

/* ===================================================================
 * 7. Online payment (stub)
 * =================================================================*/

test('payInvoice pays full outstanding balance', async () => {
  const e = makeEngine();
  const res = await e.payInvoice('C-1', 'INV-2', 'card');
  assert.equal(res.ok, true);
  assert.equal(res.amount, 2000);
  assert.equal(res.newStatus, 'paid');
  const after = e.getInvoiceById('C-1', 'INV-2');
  assert.equal(after.status, 'paid');
  assert.equal(after.balance, 0);
});

test('payInvoice supports partial amount override', async () => {
  const e = makeEngine();
  const res = await e.payInvoice('C-1', 'INV-4', 'card', 500);
  assert.equal(res.ok, true);
  assert.equal(res.amount, 500);
  assert.equal(res.newStatus, 'partiallyPaid');
});

test('payInvoice rejects already-paid invoice', async () => {
  const e = makeEngine();
  const res = await e.payInvoice('C-1', 'INV-1', 'card');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'already_paid');
});

test('payInvoice uses payment bridge when present', async () => {
  let called = false;
  const bridge = { charge: async () => { called = true; return 'EXT-REF-42'; } };
  const e = makeEngine({ paymentBridge: bridge });
  const res = await e.payInvoice('C-1', 'INV-2', 'card');
  assert.equal(called, true);
  assert.equal(res.paymentRef, 'EXT-REF-42');
});

test('payInvoice handles bridge rejection gracefully', async () => {
  const bridge = { charge: async () => { throw new Error('declined'); } };
  const e = makeEngine({ paymentBridge: bridge });
  const res = await e.payInvoice('C-1', 'INV-2', 'card');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'gateway_declined');
});

/* ===================================================================
 * 8. Orders
 * =================================================================*/

test('getOpenOrders lists only open-ish statuses', () => {
  const e = makeEngine();
  const rows = e.getOpenOrders('C-1');
  const ids = rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ['ORD-1', 'ORD-3']);
});

test('getOrderHistory returns all orders sorted newest-first', () => {
  const e = makeEngine();
  const rows = e.getOrderHistory('C-1', {});
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, 'ORD-3'); // 2026-04-06
});

test('getOrderHistory filters by status', () => {
  const e = makeEngine();
  const rows = e.getOrderHistory('C-1', { status: 'delivered' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'ORD-2');
});

/* ===================================================================
 * 9. Quote requests
 * =================================================================*/

test('createQuoteRequest persists cleaned items', () => {
  const e = makeEngine();
  const res = e.createQuoteRequest('C-1', [
    { sku: 'A1', description: 'פרופיל אלומיניום 3m', quantity: 5, unit: 'm' },
    { sku: '',    description: 'זכוכית 6mm',           quantity: 2 },
    { sku: 'bad', quantity: 0 }, // filtered out
  ]);
  assert.equal(res.ok, true);
  assert.ok(res.id.startsWith('QRQ-'));
  const list = e.listQuoteRequests('C-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].items.length, 2);
});

test('createQuoteRequest rejects empty items', () => {
  const e = makeEngine();
  const res = e.createQuoteRequest('C-1', []);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'empty_items');
});

/* ===================================================================
 * 10. Support tickets (Agent X-21 bridge)
 * =================================================================*/

test('raiseSupport uses supportBridge and returns ticket id', async () => {
  const bridge = {
    create: async ({ customerId, subject, priority }) => {
      assert.equal(customerId, 'C-1');
      assert.equal(subject, 'בעיה בהתקנה');
      assert.equal(priority, 'high');
      return 'TCK-X21-001';
    },
  };
  const e = makeEngine({ supportBridge: bridge });
  const res = await e.raiseSupport('C-1', 'בעיה בהתקנה', 'תיאור מפורט', 'high');
  assert.equal(res.ok, true);
  assert.equal(res.ticketId, 'TCK-X21-001');
});

test('raiseSupport falls back to local id when bridge throws', async () => {
  const bridge = { create: async () => { throw new Error('x21 down'); } };
  const e = makeEngine({ supportBridge: bridge });
  const res = await e.raiseSupport('C-1', 'סטאטוס הזמנה', 'איפה ההזמנה שלי?');
  assert.equal(res.ok, true);
  assert.ok(res.ticketId.startsWith('TCK-'));
});

test('raiseSupport rejects empty subject', async () => {
  const e = makeEngine();
  const res = await e.raiseSupport('C-1', '   ', 'body');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'empty_subject');
});

test('listSupportTickets is strictly isolated', async () => {
  const e = makeEngine();
  await e.raiseSupport('C-1', 's1', 'b1');
  await e.raiseSupport('C-2', 's2', 'b2');
  assert.equal(e.listSupportTickets('C-1').length, 1);
  assert.equal(e.listSupportTickets('C-2').length, 1);
});

/* ===================================================================
 * 11. Address & contact update — never delete
 * =================================================================*/

test('updateAddress never deletes: old entry lands in addressHistory', () => {
  const e = makeEngine();
  const res = e.updateAddress('C-1', {
    id: 'ADR-1',
    label: 'Main',
    street: 'דיזנגוף 100',
    city: 'תל אביב',
    zip: '6100010',
    isPrimary: true,
  });
  assert.equal(res.ok, true);
  const c = e._customers.get('C-1');
  assert.equal(c.addresses.length, 1);
  assert.equal(c.addresses[0].street, 'דיזנגוף 100');
  // Old entry preserved in history
  assert.ok(c.addressHistory.find((h) => h.street === 'הרצל 1'));
});

test('updateAddress demotes previous primary into history when new primary added', () => {
  const e = makeEngine();
  e.updateAddress('C-1', {
    label: 'Warehouse', street: 'אזור תעשייה 5', city: 'רעננה',
    isPrimary: true,
  });
  const c = e._customers.get('C-1');
  const primaries = c.addresses.filter((a) => a.isPrimary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].city, 'רעננה');
  assert.ok(c.addressHistory.length >= 1);
});

test('updateAddress rejects missing street/city', () => {
  const e = makeEngine();
  const res = e.updateAddress('C-1', { label: 'X' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'bad_address');
});

test('updateContact preserves previous values in contactHistory', () => {
  const e = makeEngine();
  e.updateContact('C-1', {
    contactName: 'אבי ישראלי',
    phone: '050-9999999',
    email: 'avi@example.co.il',
  });
  const c = e._customers.get('C-1');
  assert.equal(c.contactName, 'אבי ישראלי');
  assert.equal(c.email, 'avi@example.co.il');
  assert.ok(c.contactHistory.length >= 1);
  assert.equal(c.contactHistory[0].contactName, 'רוני כהן');
});

test('updateContact rejects invalid email', () => {
  const e = makeEngine();
  const res = e.updateContact('C-1', { email: 'nope' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'bad_email');
});

/* ===================================================================
 * 12. Statement of account
 * =================================================================*/

test('getStatement computes opening, running and closing balances', () => {
  const e = makeEngine();
  const stmt = e.getStatement('C-1', { from: '2026-03-01', to: '2026-04-30' });
  // Opening balance = invoices issued before 2026-03-01 that remain unpaid
  // INV-1 was issued 2026-02-01, paid 1000 -> 0 opening
  assert.equal(stmt.opening, 0);
  // Charges in window: INV-2 (2000) + INV-3 (500) + INV-4 (1500) = 4000
  assert.equal(stmt.totalCharges, 4000);
  // Payments recorded on those invoices in the window:
  // The fixture did not add payments array; amountPaid on INV-3 is historical
  // so totalPayments stays 0 unless inv.payments has entries.
  assert.equal(stmt.totalPayments, 0);
  assert.equal(stmt.closing, 4000);
  assert.ok(Array.isArray(stmt.rows));
  assert.ok(stmt.rows.length >= 3);
  // Rows are chronologically ordered
  for (let i = 1; i < stmt.rows.length; i++) {
    assert.ok(stmt.rows[i].date >= stmt.rows[i - 1].date);
  }
});

test('getStatement default period is last 30 days', () => {
  const e = makeEngine();
  const stmt = e.getStatement('C-1', {});
  assert.equal(stmt.period.to, '2026-04-10');
  assert.equal(stmt.period.from, '2026-03-11');
});

test('getStatement rejects invalid period', () => {
  const e = makeEngine();
  assert.throws(
    () => e.getStatement('C-1', { from: '2026-05-01', to: '2026-04-01' }),
    (err) => err.code === 'BAD_REQUEST'
  );
});

test('getStatement reflects payment recorded through payInvoice', async () => {
  const e = makeEngine();
  await e.payInvoice('C-1', 'INV-2', 'card');
  const stmt = e.getStatement('C-1', { from: '2026-03-01', to: '2026-04-30' });
  assert.equal(stmt.totalPayments, 2000);
  // Closing = charges(4000) - payments(2000) = 2000
  assert.equal(stmt.closing, 2000);
});

/* ===================================================================
 * 13. Dashboard
 * =================================================================*/

test('getDashboard aggregates balance and counts', () => {
  const e = makeEngine();
  const d = e.getDashboard('C-1');
  assert.equal(d.customerId, 'C-1');
  // Balance: INV-2 (2000) + INV-3 (400) + INV-4 (1500) = 3900
  assert.equal(d.balanceDue, 3900);
  assert.equal(d.overdueCount, 1);
  // unpaid count: INV-3 partially + INV-4 unpaid + INV-2 overdue actually
  // overdue is counted separately; unpaidCount is unpaid+partial = 2
  assert.equal(d.unpaidCount, 2);
  assert.equal(d.paidCount, 1);
  assert.equal(d.openOrders, 2); // ORD-1 + ORD-3
  assert.ok(Array.isArray(d.recentOrders));
  assert.ok(d.recentOrders.length <= 5);
});

test('getDashboard labels are bilingual', () => {
  const e = makeEngine();
  const d = e.getDashboard('C-1');
  assert.equal(d.labels.balanceDue.he, 'יתרה לתשלום');
  assert.equal(d.labels.balanceDue.en, 'Balance due');
});

/* ===================================================================
 * 14. Audit trail — append-only
 * =================================================================*/

test('audit log records login + payment + support without mutation', async () => {
  const e = makeEngine();
  e.customerLogin('alpha@example.co.il');
  await e.payInvoice('C-1', 'INV-2', 'card');
  await e.raiseSupport('C-1', 's', 'b');
  const log = e.getAuditLog();
  const actions = log.map((r) => r.action);
  assert.ok(actions.includes('login_issued'));
  assert.ok(actions.includes('invoice_pay'));
  assert.ok(actions.includes('support_raised'));
  // Returned copy must be independent
  log.push({ bogus: true });
  assert.ok(!e.getAuditLog().find((r) => r.bogus));
});

/* ===================================================================
 * 15. Money helpers
 * =================================================================*/

test('internal toCents / fromCents round-trip safely', () => {
  assert.equal(_internal.toCents(12.34), 1234);
  assert.equal(_internal.fromCents(1234), 12.34);
  assert.equal(_internal.toCents('0.1') + _internal.toCents('0.2'), 30);
});

test('internal newId is unique per call and has the requested prefix', () => {
  const a = _internal.newId('PAY');
  const b = _internal.newId('PAY');
  assert.match(a, /^PAY-/);
  assert.notEqual(a, b);
});
