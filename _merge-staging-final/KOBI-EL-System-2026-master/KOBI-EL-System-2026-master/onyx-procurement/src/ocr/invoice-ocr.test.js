/**
 * Unit tests — src/ocr/invoice-ocr.js
 * Wave 1.5 — Agent 88 — 2026-04-11
 *
 * Exercises the mock backend end-to-end, the field extractors
 * individually, the validator, and the backend registry.
 *
 * Run with:
 *   node --test src/ocr/invoice-ocr.test.js
 *   node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scanInvoice,
  validateInvoice,
  detectInvoiceType,
  extractCompanyId,
  extractAllocationNumber,
  registerOcrRoutes,
  SUPPORTED_BACKENDS,
  OcrError,
  _internal,
} = require('./invoice-ocr.js');

const {
  normalize,
  resolveBackend,
  extractInvoiceNumber,
  extractDate,
  extractDueDate,
  extractPaymentTerms,
  extractCurrency,
  extractTotals,
  extractLineItems,
  extractSupplier,
  inferVatRate,
  _parseMoney,
  _mockFixtures,
  VAT_RATE_STANDARD,
  VAT_ROUNDING_TOLERANCE,
} = _internal;


// ────────────────────────────────────────────────────────────────
//  1. Backend registry
// ────────────────────────────────────────────────────────────────

test('SUPPORTED_BACKENDS lists the five required backends', () => {
  assert.deepEqual(new Set(SUPPORTED_BACKENDS), new Set([
    'mock', 'tesseract', 'google-vision', 'azure-form-recognizer', 'openai-vision',
  ]));
});

test('resolveBackend: defaults to mock when env not set', () => {
  const prev = process.env.OCR_BACKEND;
  delete process.env.OCR_BACKEND;
  try {
    assert.equal(resolveBackend(), 'mock');
  } finally {
    if (prev !== undefined) process.env.OCR_BACKEND = prev;
  }
});

test('resolveBackend: honors explicit override', () => {
  assert.equal(resolveBackend('openai-vision'), 'openai-vision');
});

test('resolveBackend: rejects unknown backend', () => {
  assert.throws(() => resolveBackend('foo'), (err) => err instanceof OcrError && err.code === 'OCR_BACKEND_UNSUPPORTED');
});


// ────────────────────────────────────────────────────────────────
//  2. Type detection — Hebrew invoice variants
// ────────────────────────────────────────────────────────────────

test('detectInvoiceType: חשבונית מס → invoice', () => {
  assert.equal(detectInvoiceType('חשבונית מס\nחברה בע"מ'), 'invoice');
});

test('detectInvoiceType: חשבונית מס-קבלה → invoice_receipt (wins over חשבונית מס)', () => {
  assert.equal(detectInvoiceType('חשבונית מס-קבלה\nסכום 100'), 'invoice_receipt');
});

test('detectInvoiceType: חשבונית זיכוי → credit_note', () => {
  assert.equal(detectInvoiceType('חשבונית זיכוי'), 'credit_note');
});

test('detectInvoiceType: חשבונית עסקה → proforma', () => {
  assert.equal(detectInvoiceType('חשבונית עסקה\nפרופורמה'), 'proforma');
});

test('detectInvoiceType: קבלה → receipt', () => {
  assert.equal(detectInvoiceType('קבלה\nתודה'), 'receipt');
});

test('detectInvoiceType: empty → invoice (default)', () => {
  assert.equal(detectInvoiceType(''), 'invoice');
  assert.equal(detectInvoiceType(null), 'invoice');
});


// ────────────────────────────────────────────────────────────────
//  3. Company-ID extraction — ח"פ / ת.ז
// ────────────────────────────────────────────────────────────────

test('extractCompanyId: labelled ח.פ. with dashes', () => {
  assert.equal(extractCompanyId('ח.פ. 514-321-987'), '514321987');
});

test('extractCompanyId: labelled ח"פ without dashes', () => {
  assert.equal(extractCompanyId('ח"פ 515999888'), '515999888');
});

test('extractCompanyId: labelled ע.מ.', () => {
  assert.equal(extractCompanyId('ע.מ. 123456789'), '123456789');
});

test('extractCompanyId: unlabelled 9-digit fallback', () => {
  assert.equal(extractCompanyId('Bla bla 123456789 bla'), '123456789');
});

test('extractCompanyId: returns null when no 9-digit block', () => {
  assert.equal(extractCompanyId('No numbers here'), null);
  assert.equal(extractCompanyId(''), null);
  assert.equal(extractCompanyId(null), null);
});


// ────────────────────────────────────────────────────────────────
//  4. Allocation number — רפורמת חשבונית 2024
// ────────────────────────────────────────────────────────────────

test('extractAllocationNumber: מספר הקצאה: AL...', () => {
  assert.equal(extractAllocationNumber('מספר הקצאה: AL202604110088'), 'AL202604110088');
});

test('extractAllocationNumber: no allocation present → null', () => {
  assert.equal(extractAllocationNumber('חשבונית מס\nסכום 100'), null);
});


// ────────────────────────────────────────────────────────────────
//  5. Field extractors — individual
// ────────────────────────────────────────────────────────────────

test('extractInvoiceNumber: "מספר חשבונית: INV-2026-000088"', () => {
  assert.equal(extractInvoiceNumber('מספר חשבונית: INV-2026-000088'), 'INV-2026-000088');
});

test('extractInvoiceNumber: fallback on free-standing INV token', () => {
  assert.equal(extractInvoiceNumber('Some text INV-2026-000012 here'), 'INV-2026-000012');
});

test('extractDate: "תאריך: 11/04/2026" → ISO', () => {
  assert.equal(extractDate('תאריך: 11/04/2026'), '2026-04-11');
});

test('extractDate: DD-MM-YYYY', () => {
  assert.equal(extractDate('תאריך: 05-04-2026'), '2026-04-05');
});

test('extractDate: rejects 32/13/2026', () => {
  assert.equal(extractDate('תאריך: 32/13/2026'), null);
});

test('extractDueDate: מועד תשלום', () => {
  assert.equal(extractDueDate('מועד תשלום: 11/05/2026'), '2026-05-11');
});

test('extractPaymentTerms: שוטף + 30', () => {
  assert.equal(extractPaymentTerms('תנאי תשלום: שוטף + 30'), 'שוטף + 30');
});

test('extractPaymentTerms: fallback to net-style token', () => {
  assert.equal(extractPaymentTerms('Some text שוטף 45 end'), 'שוטף 45');
});

test('extractCurrency: ₪ → ILS', () => {
  assert.equal(extractCurrency('סה"כ 100 ₪'), 'ILS');
});

test('extractCurrency: USD / $', () => {
  assert.equal(extractCurrency('Total 100 USD'), 'USD');
  assert.equal(extractCurrency('Total $100'), 'USD');
});

test('extractCurrency: EUR', () => {
  assert.equal(extractCurrency('Total 100 EUR'), 'EUR');
});

test('extractCurrency: default when unknown', () => {
  assert.equal(extractCurrency('plain text'), 'ILS');
});

test('_parseMoney: strips commas, symbols', () => {
  assert.equal(_parseMoney('1,205.10'), 1205.10);
  assert.equal(_parseMoney('₪ 85.50'), 85.50);
  assert.equal(_parseMoney('-585.00'), -585);
  assert.equal(_parseMoney(''), null);
});

test('inferVatRate: 175.10 / 1030 ≈ 0.17', () => {
  const r = inferVatRate(1030, 175.10);
  assert.ok(Math.abs(r - 0.17) < 0.005, `expected 0.17, got ${r}`);
});

test('inferVatRate: guard on zero / NaN', () => {
  assert.equal(inferVatRate(0, 100), null);
  assert.equal(inferVatRate(NaN, 100), null);
});


// ────────────────────────────────────────────────────────────────
//  6. Totals extraction (composite)
// ────────────────────────────────────────────────────────────────

test('extractTotals: full Hebrew tax invoice', () => {
  const text = [
    'סה"כ לפני מע"מ: 1,030.00 ₪',
    'מע"מ 17%:        175.10 ₪',
    'סה"כ לתשלום:   1,205.10 ₪',
  ].join('\n');
  const t = extractTotals(text);
  assert.equal(t.total_before_vat, 1030);
  assert.ok(Math.abs(t.vat_amount - 175.10) < 0.01);
  assert.ok(Math.abs(t.total_with_vat - 1205.10) < 0.01);
});

test('extractTotals: credit note with negative numbers', () => {
  const text = [
    'סה"כ לפני מע"מ: -500.00 ₪',
    'מע"מ 17%:        -85.00 ₪',
    'סה"כ זיכוי:     -585.00 ₪',
  ].join('\n');
  const t = extractTotals(text);
  assert.equal(t.total_before_vat, -500);
  assert.equal(t.vat_amount, -85);
  assert.equal(t.total_with_vat, -585);
});


// ────────────────────────────────────────────────────────────────
//  7. Line items extraction
// ────────────────────────────────────────────────────────────────

test('extractLineItems: default fixture parses 3 rows', () => {
  const items = extractLineItems(_mockFixtures.default.raw_text);
  assert.equal(items.length, 3);
  assert.equal(items[0].description, 'כבל חשמל 2.5 מ"מ');
  assert.equal(items[0].quantity, 10);
  assert.equal(items[0].unit_price, 25);
  assert.equal(items[0].total, 250);
  // Sum of line totals ≈ subtotal_before_vat
  const sum = items.reduce((a, i) => a + i.total, 0);
  assert.equal(sum, 1030);
});


// ────────────────────────────────────────────────────────────────
//  8. Supplier extraction
// ────────────────────────────────────────────────────────────────

test('extractSupplier: default fixture → name, cid, phone, address', () => {
  const s = extractSupplier(_mockFixtures.default.raw_text);
  assert.equal(s.name, 'טכנו-קול עוזי בע"מ');
  assert.equal(s.company_id, '514321987');
  assert.equal(s.address, 'רחוב התעשייה 12, תל אביב');
  assert.ok(s.phone && s.phone.includes('03-5551234'));
});


// ────────────────────────────────────────────────────────────────
//  9. scanInvoice — mock backend end-to-end
// ────────────────────────────────────────────────────────────────

test('scanInvoice: mock default fixture — fully populated', async () => {
  const inv = await scanInvoice(Buffer.from('any'), { backend: 'mock' });
  assert.equal(inv.backend, 'mock');
  assert.equal(inv.invoice.type, 'invoice');
  assert.equal(inv.invoice.number, 'INV-2026-000088');
  assert.equal(inv.invoice.date, '2026-04-11');
  assert.equal(inv.invoice.total_before_vat, 1030);
  assert.ok(Math.abs(inv.invoice.total_with_vat - 1205.10) < 0.01);
  assert.equal(inv.invoice.currency, 'ILS');
  assert.equal(inv.invoice.allocation_number, 'AL202604110088');
  assert.equal(inv.supplier.company_id, '514321987');
  assert.ok(inv.confidence >= 0.9);
  assert.equal(inv.line_items.length, 3);
  assert.equal(inv.payment_terms, 'שוטף + 30');
  assert.equal(inv.due_date, '2026-05-11');
});

test('scanInvoice: mock credit_note fixture → type credit_note, negatives', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock', hint: { fixture: 'credit_note' } });
  assert.equal(inv.invoice.type, 'credit_note');
  assert.equal(inv.invoice.total_before_vat, -500);
  assert.equal(inv.invoice.total_with_vat, -585);
});

test('scanInvoice: mock tax_invoice_receipt fixture', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock', hint: { fixture: 'tax_invoice_receipt' } });
  assert.equal(inv.invoice.type, 'invoice_receipt');
  assert.equal(inv.supplier.name, 'אבי חשמלאי בע"מ');
  assert.equal(inv.supplier.company_id, '515999888');
});

test('scanInvoice: mock receipt fixture', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock', hint: { fixture: 'receipt' } });
  assert.equal(inv.invoice.type, 'receipt');
  assert.equal(inv.supplier.company_id, '200123456');
});

test('scanInvoice: mock proforma fixture', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock', hint: { fixture: 'proforma' } });
  assert.equal(inv.invoice.type, 'proforma');
  assert.equal(inv.invoice.total_before_vat, 5000);
});

test('scanInvoice: unreadable fixture yields low confidence', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock', hint: { fixture: 'unreadable' } });
  assert.ok(inv.confidence < 0.5);
});

test('scanInvoice: unknown backend throws OcrError', async () => {
  await assert.rejects(
    () => scanInvoice(Buffer.from(''), { backend: 'fake' }),
    (err) => err instanceof OcrError && err.code === 'OCR_BACKEND_UNSUPPORTED'
  );
});

test('scanInvoice: tesseract stub throws NOT_INSTALLED (clean error path)', async () => {
  await assert.rejects(
    () => scanInvoice(Buffer.from(''), { backend: 'tesseract' }),
    (err) => err instanceof OcrError && err.code === 'OCR_BACKEND_NOT_INSTALLED' && err.backend === 'tesseract'
  );
});

test('scanInvoice: google-vision stub throws NOT_INSTALLED', async () => {
  await assert.rejects(
    () => scanInvoice(Buffer.from(''), { backend: 'google-vision' }),
    (err) => err.code === 'OCR_BACKEND_NOT_INSTALLED' && err.backend === 'google-vision'
  );
});

test('scanInvoice: azure-form-recognizer stub throws NOT_INSTALLED', async () => {
  await assert.rejects(
    () => scanInvoice(Buffer.from(''), { backend: 'azure-form-recognizer' }),
    (err) => err.code === 'OCR_BACKEND_NOT_INSTALLED'
  );
});

test('scanInvoice: openai-vision stub throws NOT_INSTALLED', async () => {
  await assert.rejects(
    () => scanInvoice(Buffer.from(''), { backend: 'openai-vision' }),
    (err) => err.code === 'OCR_BACKEND_NOT_INSTALLED'
  );
});


// ────────────────────────────────────────────────────────────────
// 10. Validator
// ────────────────────────────────────────────────────────────────

test('validateInvoice: good mock default → valid', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock' });
  const v = validateInvoice(inv);
  assert.ok(v.valid, `expected valid, got errors: ${v.errors.join('; ')}`);
  assert.deepEqual(v.errors, []);
});

test('validateInvoice: missing invoice → errors list number/date/type', () => {
  const v = validateInvoice({ supplier: {}, invoice: {} });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => /number/i.test(e)));
  assert.ok(v.errors.some(e => /date/i.test(e)));
  assert.ok(v.errors.some(e => /type/i.test(e)));
});

test('validateInvoice: bad ח"פ → error', () => {
  const base = {
    supplier: { company_id: '123' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 100, vat_rate: 0.17, vat_amount: 17, total_with_vat: 117 },
    confidence: 0.9,
  };
  const v = validateInvoice(base);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => /ח"פ|company_id/i.test(e)));
});

test('validateInvoice: VAT sums mismatch → error', () => {
  const bad = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 100, vat_rate: 0.17, vat_amount: 17, total_with_vat: 200 },
    confidence: 0.9,
  };
  const v = validateInvoice(bad);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => /VAT|mismatch/i.test(e)));
});

test('validateInvoice: VAT sums agree within tolerance → valid', () => {
  const ok = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 1030, vat_rate: 0.17, vat_amount: 175.10, total_with_vat: 1205.10 },
    confidence: 0.9,
  };
  const v = validateInvoice(ok);
  assert.ok(v.valid);
});

test('validateInvoice: rate × before ≈ with_vat inside ±2 agorot tolerance', () => {
  const ok = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 99.99, vat_rate: 0.17, vat_amount: 16.998, total_with_vat: 116.99 },
    confidence: 0.9,
  };
  const v = validateInvoice(ok);
  assert.ok(v.valid, `errors: ${v.errors.join('; ')}`);
  assert.ok(Math.abs(99.99 * 1.17 - 116.99) <= VAT_ROUNDING_TOLERANCE);
});

test('validateInvoice: sane-date range — 1950 rejected', () => {
  const bad = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '1950-01-01', type: 'invoice',
                total_before_vat: 100, vat_rate: 0.17, vat_amount: 17, total_with_vat: 117 },
    confidence: 0.9,
  };
  const v = validateInvoice(bad);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => /sane range|out/i.test(e)));
});

test('validateInvoice: low confidence → warning not error', () => {
  const inv = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 100, vat_rate: 0.17, vat_amount: 17, total_with_vat: 117 },
    confidence: 0.2,
  };
  const v = validateInvoice(inv);
  assert.ok(v.valid);
  assert.ok(v.warnings.some(w => /confidence/i.test(w)));
});

test('validateInvoice: tax invoice > 25,000 without allocation → warning', () => {
  const inv = {
    supplier: { company_id: '514321987' },
    invoice:  { number: 'X', date: '2026-04-11', type: 'invoice',
                total_before_vat: 30000, vat_rate: 0.17, vat_amount: 5100, total_with_vat: 35100,
                allocation_number: null },
    confidence: 0.9,
  };
  const v = validateInvoice(inv);
  assert.ok(v.valid);
  assert.ok(v.warnings.some(w => /allocation|הקצאה|רפורמה/iu.test(w)));
});

test('validateInvoice: null argument → invalid', () => {
  const v = validateInvoice(null);
  assert.equal(v.valid, false);
});


// ────────────────────────────────────────────────────────────────
// 11. Normalizer standalone — deterministic shape
// ────────────────────────────────────────────────────────────────

test('normalize: fills all top-level keys even on empty input', () => {
  const n = normalize({ raw_text: '', confidence: 0, meta: null }, { backend: 'mock' });
  assert.ok('supplier' in n);
  assert.ok('invoice' in n);
  assert.ok('line_items' in n);
  assert.ok('payment_terms' in n);
  assert.ok('due_date' in n);
  assert.ok('raw_text' in n);
  assert.ok('confidence' in n);
  assert.equal(n.backend, 'mock');
  assert.ok(n.scanned_at);
  assert.equal(n.invoice.currency, 'ILS');
  assert.equal(n.invoice.type, 'invoice');
});

test('normalize: default vat_rate falls back to 17%', () => {
  const n = normalize({ raw_text: 'חשבונית מס', confidence: 0.5 }, {});
  assert.equal(n.invoice.vat_rate, VAT_RATE_STANDARD);
});


// ────────────────────────────────────────────────────────────────
// 12. registerOcrRoutes — smoke test against a fake express app
// ────────────────────────────────────────────────────────────────

function fakeApp() {
  const routes = {};
  return {
    routes,
    post(path, handler) { routes[`POST ${path}`] = handler; },
    get(path, handler)  { routes[`GET ${path}`]  = handler; },
  };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

test('registerOcrRoutes: registers POST /api/ocr/invoice and /verify', () => {
  const app = fakeApp();
  registerOcrRoutes(app, {});
  assert.ok(app.routes['POST /api/ocr/invoice']);
  assert.ok(app.routes['POST /api/ocr/invoice/verify']);
});

test('POST /api/ocr/invoice: decodes body and returns structured data', async () => {
  const app = fakeApp();
  registerOcrRoutes(app, {});
  const res = fakeRes();
  const req = { body: { file: Buffer.from('dummy').toString('base64'), mime: 'image/png' } };
  await app.routes['POST /api/ocr/invoice'](req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.backend, 'mock');
  assert.ok(res.body.invoice);
  assert.ok(res.body.validation);
  assert.equal(res.body.invoice.invoice.number, 'INV-2026-000088');
});

test('POST /api/ocr/invoice: missing file → 400', async () => {
  const app = fakeApp();
  registerOcrRoutes(app, {});
  const res = fakeRes();
  await app.routes['POST /api/ocr/invoice']({ body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'OCR_NO_FILE');
});

test('POST /api/ocr/invoice/verify: no supabase — returns merged+validated payload', async () => {
  const app = fakeApp();
  registerOcrRoutes(app, {}); // no supabase
  const res = fakeRes();
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock' });
  await app.routes['POST /api/ocr/invoice/verify']({ body: { invoice: inv, actor: 'tester' } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.saved, false);
  assert.equal(res.body.invoice.verified, true);
  assert.equal(res.body.invoice.verified_by, 'tester');
});

test('POST /api/ocr/invoice/verify: applies corrections before save', async () => {
  const app = fakeApp();
  registerOcrRoutes(app, {});
  const res = fakeRes();
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock' });
  const corrections = { supplier: { name: 'New Name Ltd' }, invoice: { number: 'INV-CORRECTED' } };
  await app.routes['POST /api/ocr/invoice/verify']({
    body: { invoice: inv, corrections, actor: 'tester' }
  }, res);
  assert.equal(res.body.invoice.supplier.name, 'New Name Ltd');
  assert.equal(res.body.invoice.invoice.number, 'INV-CORRECTED');
});

test('POST /api/ocr/invoice/verify: saves when supabase wired and validation passes', async () => {
  const app = fakeApp();
  const calls = [];
  const supabase = {
    from(table) {
      return {
        insert(row) {
          calls.push({ table, row });
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'row-1', ...row }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const audit = async (...args) => { calls.push({ audit: args }); };
  registerOcrRoutes(app, { supabase, audit });
  const res = fakeRes();
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock' });
  await app.routes['POST /api/ocr/invoice/verify']({ body: { invoice: inv, actor: 'tester' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.invoice.id, 'expected saved row id');
  assert.ok(calls.some(c => c.table === 'ocr_scanned_invoices'), 'expected insert into ocr_scanned_invoices');
  assert.ok(calls.some(c => c.audit), 'expected audit call');
});

test('POST /api/ocr/invoice/verify: missing invoice → 400', async () => {
  const app = fakeApp();
  registerOcrRoutes(app, {});
  const res = fakeRes();
  await app.routes['POST /api/ocr/invoice/verify']({ body: {} }, res);
  assert.equal(res.statusCode, 400);
});


// ────────────────────────────────────────────────────────────────
// 13. RTL / Hebrew smoke
// ────────────────────────────────────────────────────────────────

test('RTL: mixed Hebrew/English/numbers survive round trip', async () => {
  const inv = await scanInvoice(Buffer.from(''), { backend: 'mock' });
  assert.ok(inv.raw_text.includes('חשבונית מס'));
  assert.ok(inv.raw_text.includes('INV-2026-000088'));
  assert.ok(inv.raw_text.includes('₪'));
  assert.ok(inv.supplier.name.includes('בע"מ'));
});
