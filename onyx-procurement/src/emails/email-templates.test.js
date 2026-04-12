/**
 * Unit tests for src/emails/email-templates.js and src/emails/send-email.js
 * ─────────────────────────────────────────────────────────────────────────
 * Agent-73 contribution — 10 transactional templates + SMTP sender.
 *
 * Run:
 *   node --test src/emails/email-templates.test.js
 *
 * Strategy:
 *   - No network. Uses the `noop` transport for send-email tests.
 *   - Verifies that every declared template produces non-empty subject / html /
 *     text after substitution.
 *   - Verifies bilingual coverage (Hebrew + English markers present).
 *   - Verifies RTL + lang="he" in the HTML shell.
 *   - Verifies variable substitution, missing-variable reporting, and HTML
 *     escaping for untrusted values.
 *   - Verifies MIME compose, queue retry with exponential back-off, and the
 *     audit log entries for the happy path and the failure path.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const templates = require('./email-templates');
const sender = require('./send-email');

// ───────────────────────────────────────────────────────────────
// Shared fixture — realistic variable map that covers every template
// ───────────────────────────────────────────────────────────────

const FIXTURE_VARS = {
  // wage slip
  employee_name: 'דנה כהן',
  period: '2026-03',
  net_amount: '₪12,345.67',
  gross_amount: '₪16,800.00',
  pay_date: '2026-04-10',
  slip_id: 'SLP-20260410-001',
  // invoice received
  vendor_name: 'ספק דוגמה בע"מ',
  invoice_number: 'INV-9001',
  amount: '₪4,500.00',
  due_date: '2026-05-15',
  received_date: '2026-04-11',
  // invoice overdue
  customer_name: 'לקוח חשוב',
  days_overdue: 12,
  // payment confirmation
  recipient_name: 'מוטב דוגמה',
  payment_reference: 'PAY-20260411-7788',
  payment_date: '2026-04-11',
  payment_method: 'העברה בנקאית',
  // vat report
  total_sales: '₪120,000',
  total_purchases: '₪60,000',
  vat_due: '₪10,200',
  submission_deadline: '2026-04-30',
  // annual tax
  tax_year: '2025',
  taxpayer_name: 'חברת דוגמה בע"מ',
  gross_income: '₪1,250,000',
  total_tax: '₪275,000',
  // po approval
  approver_name: 'מנהל רכש',
  po_number: 'PO-2026-0042',
  requester_name: 'עובד מבקש',
  approval_url: 'https://onyx.local/po/PO-2026-0042',
  // low cash
  account_name: 'חשבון תפעולי ראשי',
  current_balance: '₪5,000',
  threshold: '₪10,000',
  as_of_date: '2026-04-11',
  upcoming_outflows: '₪18,500',
  // bank recon
  matched_count: 142,
  unmatched_count: 3,
  reconciled_balance: '₪128,450',
  // failed payroll
  employee_count: 40,
  failed_count: 2,
  error_code: 'PAY-E-042',
  error_message: 'Missing rate for employee 10023',
};

// ───────────────────────────────────────────────────────────────
// email-templates.js tests
// ───────────────────────────────────────────────────────────────

test('listTemplates returns all 10 templates with declared variables', () => {
  const list = templates.listTemplates();
  assert.equal(list.length, 10);
  const names = list.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'annual_tax_report',
    'bank_reconciliation_completed',
    'failed_payroll_calculation',
    'invoice_overdue',
    'invoice_received',
    'low_cash_alert',
    'payment_confirmation',
    'po_approval_needed',
    'vat_report_ready',
    'wage_slip_issued',
  ]);
  for (const t of list) {
    assert.ok(t.subject_he.length > 0, `${t.name} missing subject_he`);
    assert.ok(t.subject_en.length > 0, `${t.name} missing subject_en`);
    assert.ok(Array.isArray(t.variables) && t.variables.length > 0,
      `${t.name} missing variables`);
  }
});

test('escapeHtml escapes all HTML metacharacters', () => {
  assert.equal(templates.escapeHtml('<b>&"\'</b>'),
    '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(templates.escapeHtml(null), '');
  assert.equal(templates.escapeHtml(undefined), '');
  assert.equal(templates.escapeHtml(42), '42');
});

test('replaceVariables handles known and unknown tokens', () => {
  const r = templates.replaceVariables('Hello {{name}} {{missing}}!', { name: 'World' });
  assert.equal(r.text, 'Hello World {{missing}}!');
  assert.deepEqual(r.missing, ['missing']);
});

test('replaceVariables honours escape option (HTML-safe)', () => {
  const r = templates.replaceVariables('<p>{{value}}</p>', { value: '<script>x</script>' }, { escape: true });
  assert.equal(r.text, '<p>&lt;script&gt;x&lt;/script&gt;</p>');
});

test('renderTemplate: every template produces non-empty output', () => {
  for (const name of Object.keys(templates.TEMPLATES)) {
    const out = templates.renderTemplate(name, FIXTURE_VARS);
    assert.ok(out.subject.length > 0, `${name}: empty subject`);
    assert.ok(out.subject_en.length > 0, `${name}: empty subject_en`);
    assert.ok(out.html.length > 200, `${name}: html too short`);
    assert.ok(out.text.length > 50, `${name}: text too short`);
    assert.equal(out.missing.length, 0,
      `${name}: missing variables -> ${out.missing.join(',')}`);
  }
});

test('renderTemplate: HTML shell is RTL + Hebrew lang', () => {
  const out = templates.renderTemplate('wage_slip_issued', FIXTURE_VARS);
  assert.match(out.html, /<html lang="he" dir="rtl">/);
  assert.match(out.html, /direction:rtl/);
  assert.match(out.html, /charset="utf-8"/);
  assert.match(out.html, /viewport/);
});

test('renderTemplate: bilingual content (Hebrew + English markers)', () => {
  for (const name of Object.keys(templates.TEMPLATES)) {
    const out = templates.renderTemplate(name, FIXTURE_VARS);
    // Hebrew presence: at least one Hebrew letter
    assert.match(out.html, /[\u0590-\u05FF]/, `${name}: html lacks Hebrew`);
    assert.match(out.text, /[\u0590-\u05FF]/, `${name}: text lacks Hebrew`);
    // English presence: the "English:" marker inside the bilingual section
    assert.match(out.html, /English:/i, `${name}: html lacks English section`);
    assert.match(out.text, /English:/i, `${name}: text lacks English section`);
  }
});

test('renderTemplate: branding footer present with support email', () => {
  const out = templates.renderTemplate('payment_confirmation', FIXTURE_VARS);
  assert.match(out.html, /support@onyx\.local/);
  assert.match(out.html, /Unsubscribe/i);
  assert.match(out.html, /Onyx Procurement/);
  assert.match(out.text, /support@onyx\.local/);
  assert.match(out.text, /Unsubscribe/i);
});

test('renderTemplate: brand override merges with defaults', () => {
  const out = templates.renderTemplate('payment_confirmation', {
    ...FIXTURE_VARS,
    brand: {
      name: 'Acme Corp',
      support_email: 'ops@acme.test',
      logo_url: 'https://acme.test/logo.svg',
    },
  });
  assert.match(out.html, /Acme Corp/);
  assert.match(out.html, /ops@acme\.test/);
  assert.match(out.html, /acme\.test\/logo\.svg/);
  // Default fields survive merging
  assert.match(out.html, /אוניקס פרוקיורמנט/);
});

test('renderTemplate: missing variables are reported, tokens remain', () => {
  const out = templates.renderTemplate('payment_confirmation', {
    recipient_name: 'Bob',
    amount: '$5',
    payment_date: '2026-04-11',
    // payment_reference + payment_method missing
  });
  assert.ok(out.missing.includes('payment_reference'));
  assert.ok(out.missing.includes('payment_method'));
  assert.match(out.html, /\{\{payment_reference\}\}/);
});

test('renderTemplate: unknown name throws', () => {
  assert.throws(() => templates.renderTemplate('does_not_exist', {}), /unknown template/);
});

test('renderTemplate: HTML-escapes untrusted values', () => {
  const out = templates.renderTemplate('invoice_received', {
    ...FIXTURE_VARS,
    vendor_name: '<script>alert(1)</script>',
  });
  assert.doesNotMatch(out.html, /<script>alert\(1\)<\/script>/);
  assert.match(out.html, /&lt;script&gt;/);
});

test('renderAll returns a result for every template', () => {
  const all = templates.renderAll(FIXTURE_VARS);
  assert.equal(Object.keys(all).length, 10);
  for (const [name, out] of Object.entries(all)) {
    assert.equal(out.name, name);
  }
});

test('getTemplate returns a read-only clone or null', () => {
  const cloned = templates.getTemplate('wage_slip_issued');
  assert.equal(cloned.name, 'wage_slip_issued');
  cloned.subject_he = 'tampered';
  assert.notEqual(templates.TEMPLATES.wage_slip_issued.subject_he, 'tampered');
  assert.equal(templates.getTemplate('nope'), null);
});

test('formatCurrency handles ILS and fallbacks', () => {
  assert.equal(templates.formatCurrency(1234.5), '₪1,234.50');
  assert.equal(templates.formatCurrency(-500), '-₪500.00');
  assert.equal(templates.formatCurrency('abc'), 'abc');
  assert.equal(templates.formatCurrency(null), '');
});

// ───────────────────────────────────────────────────────────────
// send-email.js tests
// ───────────────────────────────────────────────────────────────

test('composeMime builds a valid multipart/mixed message with attachment', () => {
  const mime = sender.composeMime({
    from: 'noreply@onyx.local',
    to: 'user@example.com',
    subject: 'שלום עולם',
    text: 'plain body',
    html: '<p>html body</p>',
    attachments: [
      { filename: 'slip.pdf', content: Buffer.from('PDF-DATA'), contentType: 'application/pdf' },
    ],
  });
  const raw = mime.raw.toString('utf8');
  assert.match(raw, /MIME-Version: 1\.0/);
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /Content-Type: text\/plain/);
  assert.match(raw, /Content-Type: text\/html/);
  assert.match(raw, /filename="slip\.pdf"/);
  assert.match(raw, /Content-Type: application\/pdf/);
  assert.ok(mime.messageId.startsWith('<'));
});

test('composeMime base64-encodes Hebrew subject as encoded-word', () => {
  const mime = sender.composeMime({
    from: 'a@b.c',
    to: 'd@e.f',
    subject: 'תלוש שכר',
    text: 'x',
  });
  const raw = mime.raw.toString('utf8');
  assert.match(raw, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
});

test('composeMime throws on missing from or to', () => {
  assert.throws(() => sender.composeMime({ to: 'x@y.z', subject: 's', text: 't' }), /from/);
  assert.throws(() => sender.composeMime({ from: 'x@y.z', subject: 's', text: 't' }), /to/);
});

test('createSender(noop) sends successfully and writes audit log', async () => {
  const s = sender.createSender({ transport: { type: 'noop', from: 'noreply@onyx.local' } });
  const result = await s.send({
    to: 'user@example.com',
    subject: 'test',
    text: 'hello',
    html: '<b>hello</b>',
  });
  assert.equal(result.transport, 'noop');
  assert.ok(result.messageId);
  const log = s.audit.all();
  assert.equal(log.length, 1);
  assert.equal(log[0].event, 'email.sent');
  assert.equal(log[0].to, 'user@example.com');
});

test('createSender: queue retries on failure with exponential back-off', async () => {
  const s = sender.createSender({
    transport: { type: 'noop', from: 'x@y.z' },
    maxRetries: 2,
    retryBaseDelayMs: 5,
    retryMaxDelayMs: 20,
  });
  // Wrap transport.send to fail twice then succeed
  let calls = 0;
  const origSend = s.transport.send.bind(s.transport);
  s.transport.send = async (msg) => {
    calls += 1;
    if (calls < 3) throw new Error('boom');
    return origSend(msg);
  };
  const result = await s.send({
    to: 'user@example.com', subject: 's', text: 't',
  });
  assert.equal(calls, 3);
  assert.equal(result.transport, 'noop');
  const events = s.audit.all().map((e) => e.event);
  assert.ok(events.includes('email.attempt_failed'));
  assert.ok(events.includes('email.sent'));
});

test('createSender: queue gives up after maxRetries and writes dead_letter', async () => {
  const s = sender.createSender({
    transport: { type: 'noop', from: 'x@y.z' },
    maxRetries: 1,
    retryBaseDelayMs: 2,
  });
  s.transport.send = async () => { throw new Error('nope'); };
  await assert.rejects(
    s.send({ to: 'user@example.com', subject: 's', text: 't' }),
    /nope/
  );
  const events = s.audit.all().map((e) => e.event);
  assert.ok(events.includes('email.dead_letter'));
});

test('createSender: stub transports (sendgrid/mailgun/ses) succeed in dryRun', async () => {
  for (const type of ['sendgrid', 'mailgun', 'ses']) {
    const s = sender.createSender({
      transport: {
        type,
        from: 'x@y.z',
        dryRun: true,
        apiKey: 'k', domain: 'd', accessKeyId: 'a', secretAccessKey: 'b',
      },
    });
    const result = await s.send({
      to: 'user@example.com', subject: 's', text: 't',
    });
    assert.equal(result.transport, type);
    assert.ok(result.accepted);
  }
});

test('createSender: unknown transport throws', () => {
  assert.throws(() => sender.createSender({ transport: { type: 'bogus' } }),
    /unknown transport/);
});

test('end-to-end: render wage slip template and send via noop with PDF attachment', async () => {
  const rendered = templates.renderTemplate('wage_slip_issued', FIXTURE_VARS);
  const s = sender.createSender({ transport: { type: 'noop', from: 'hr@onyx.local' } });
  const result = await s.send({
    to: { name: FIXTURE_VARS.employee_name, email: 'dana@example.com' },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: [
      { filename: 'wage-slip-2026-03.pdf', content: Buffer.from('%PDF-1.4\ntest'), contentType: 'application/pdf' },
    ],
  });
  assert.equal(result.accepted, true);
  const last = s.audit.all().slice(-1)[0];
  assert.equal(last.event, 'email.sent');
  assert.match(last.subject, /תלוש השכר/);
});
