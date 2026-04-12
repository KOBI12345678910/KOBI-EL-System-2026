/**
 * Invoice OCR Scanner — סורק חשבוניות חכם
 * Wave 1.5 — Agent 88 — 2026-04-11
 *
 * Pluggable OCR backend for Israeli tax invoices (חשבונית מס),
 * credit notes (זיכוי), tax-invoice-receipts (חשבונית מס-קבלה),
 * proforma (חשבונית עסקה) and cash receipts (קבלה).
 *
 * This is a STUB. It defines the integration interface and returns
 * structured, validated data shaped like a real OCR result. The
 * `mock` backend returns canned fixtures so the rest of the
 * procurement pipeline can be wired, tested and audited end-to-end
 * without pulling in tesseract.js, Google Vision, Azure Form
 * Recognizer or GPT-4 Vision dependencies. Real backends are
 * plugged in by swapping the stub body with the vendor SDK call;
 * the outer contract does not change.
 *
 * ─────────────────────────────────────────────────────────────
 *  BACKENDS (selected by env `OCR_BACKEND`)
 * ─────────────────────────────────────────────────────────────
 *   mock                  — default; deterministic fake data for tests
 *   tesseract             — stub for tesseract.js / node-tesseract
 *   google-vision         — stub for Google Cloud Vision
 *   azure-form-recognizer — stub for Azure Document Intelligence
 *   openai-vision         — stub for GPT-4 Vision via openai SDK
 *
 * ─────────────────────────────────────────────────────────────
 *  HEBREW / RTL OCR CONSIDERATIONS
 * ─────────────────────────────────────────────────────────────
 *   - Direction:      Hebrew is RTL; numbers and English stay LTR.
 *                     We expose `raw_text` already logically
 *                     reversed so downstream regexes work over
 *                     left-to-right character order.
 *   - Fonts:          Stam / David / Arial Hebrew / Narkisim —
 *                     the mock backend ignores fonts; a real one
 *                     would pass `heb+eng` to tesseract.
 *   - Mixed script:   VAT % , dates (DD/MM/YYYY), phone numbers
 *                     and company IDs are ASCII; narratives are
 *                     Hebrew. The normalizer keeps both.
 *   - Identifiers:    ח"פ / ת.ז patterns are 9 digits, sometimes
 *                     printed 123-456-789 or 12345 6789.
 *   - Currency:       the ₪ symbol is `\u20AA`. We accept ₪, NIS,
 *                     ש"ח, ILS.
 *
 * ─────────────────────────────────────────────────────────────
 *  ISRAELI INVOICE TYPES — detection keywords
 * ─────────────────────────────────────────────────────────────
 *   חשבונית מס                 → 'invoice'        (tax_invoice)
 *   חשבונית מס-קבלה / מס קבלה → 'invoice_receipt'
 *   חשבונית זיכוי / זיכוי      → 'credit_note'
 *   חשבונית עסקה / פרופורמה    → 'proforma'
 *   קבלה                        → 'receipt'
 *
 *   רפורמת חשבונית 2024 adds an allocation number (מספר הקצאה)
 *   for any invoice whose pre-VAT total exceeds the phased
 *   threshold — we scan for it so downstream validation can flag
 *   missing allocations.
 *
 * ─────────────────────────────────────────────────────────────
 *  PUBLIC API
 * ─────────────────────────────────────────────────────────────
 *   scanInvoice(buffer, { backend, hint })   → Promise<Invoice>
 *   validateInvoice(invoice)                 → { valid, errors, warnings }
 *   detectInvoiceType(text)                  → 'invoice' | 'credit_note' | ...
 *   extractCompanyId(text)                   → '512345678' | null
 *   extractAllocationNumber(text)            → 'AL123456789' | null
 *   registerOcrRoutes(app, deps)             → wires /api/ocr/invoice
 *
 *   _internal — normalizer, regex registry, mock fixtures (exposed
 *                for unit tests)
 *
 * ─────────────────────────────────────────────────────────────
 *  RETURN SHAPE
 * ─────────────────────────────────────────────────────────────
 *   {
 *     supplier: { name, company_id, address, phone },
 *     invoice:  {
 *       number, date, type, allocation_number,
 *       total_before_vat, vat_rate, vat_amount, total_with_vat,
 *       currency
 *     },
 *     line_items: [ { description, quantity, unit_price, total } ],
 *     payment_terms, due_date,
 *     raw_text, confidence,
 *     backend, scanned_at
 *   }
 */

'use strict';

// ════════════════════════════════════════════════════════════════
//  1. Constants
// ════════════════════════════════════════════════════════════════

const VAT_RATE_STANDARD = 0.17;             // מע"מ ישראל — 17 %
const VAT_ROUNDING_TOLERANCE = 0.02;        // 2 agorot per line
const DEFAULT_CURRENCY = 'ILS';

const SUPPORTED_BACKENDS = [
  'mock',
  'tesseract',
  'google-vision',
  'azure-form-recognizer',
  'openai-vision',
];

// Israeli invoice document type keywords, ordered from most
// specific to least specific — order matters because
// "חשבונית מס-קבלה" must beat "חשבונית מס".
const INVOICE_TYPE_KEYWORDS = [
  { type: 'invoice_receipt', patterns: ['חשבונית מס-קבלה', 'חשבונית מס קבלה', 'מס קבלה', 'מס-קבלה'] },
  { type: 'credit_note',     patterns: ['חשבונית זיכוי', 'תעודת זיכוי', 'זיכוי'] },
  { type: 'proforma',        patterns: ['חשבונית עסקה', 'חשבון עסקה', 'פרופורמה', 'proforma'] },
  { type: 'invoice',         patterns: ['חשבונית מס', 'tax invoice', 'חשבונית'] },
  { type: 'receipt',         patterns: ['קבלה', 'receipt'] },
];

// ח"פ / ת.ז — exactly 9 digits, may be printed with dashes/spaces.
const RE_COMPANY_ID = /\b(\d{2,3}[-\s]?\d{3}[-\s]?\d{3,4})\b/g;

// Allocation number — רפורמת חשבונית 2024.
// Common printed form is `AL` / `הקצאה` followed by 6-12 digits.
const RE_ALLOCATION_NUMBER = /(?:AL|הקצאה\s*מס'?|מספר\s*הקצאה)\s*[:#]?\s*([A-Z]{0,2}\d{6,12})/iu;

// Currency: ₪ (U+20AA), ש"ח, NIS, ILS.
const RE_CURRENCY_SHEKEL = /(?:₪|ש"ח|ש''ח|NIS|ILS)/i;

// Dates: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY — the Israeli norm.
const RE_DATE_DMY = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;

// Money amounts — up to 9 integer digits, optional thousand
// separators, 2 decimal fraction. We match numeric values
// *after* removing the currency symbol.
const RE_MONEY = /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/g;


// ════════════════════════════════════════════════════════════════
//  2. Custom error
// ════════════════════════════════════════════════════════════════

class OcrError extends Error {
  constructor(message, { code = 'OCR_ERROR', backend = null, cause = null } = {}) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
    this.backend = backend;
    if (cause) this.cause = cause;
  }
}


// ════════════════════════════════════════════════════════════════
//  3. Backend selection
// ════════════════════════════════════════════════════════════════

function resolveBackend(explicit) {
  const name = (explicit || process.env.OCR_BACKEND || 'mock').toLowerCase();
  if (!SUPPORTED_BACKENDS.includes(name)) {
    throw new OcrError(
      `Unsupported OCR backend "${name}". Supported: ${SUPPORTED_BACKENDS.join(', ')}`,
      { code: 'OCR_BACKEND_UNSUPPORTED', backend: name }
    );
  }
  return name;
}


// ════════════════════════════════════════════════════════════════
//  4. Backend stubs — raw-text extractors
//
//  Each backend returns `{ raw_text, confidence, meta }`. Real
//  implementations live behind the same contract.
// ════════════════════════════════════════════════════════════════

async function backendMock(buffer, hint = {}) {
  // The mock backend honors a hint so tests can pump a specific
  // fixture through the full pipeline. `hint.fixture` picks a
  // canonical Israeli document; unknown hint falls back to the
  // deterministic `default` fixture.
  const fixtureName = hint.fixture || 'default';
  const fixture = _mockFixtures[fixtureName] || _mockFixtures.default;
  return {
    raw_text: fixture.raw_text,
    confidence: fixture.confidence,
    meta: { fixture: fixtureName, buffer_size: _bufferSize(buffer) },
  };
}

async function backendTesseract(buffer, _hint = {}) {
  // STUB — real impl:
  //   const Tesseract = require('tesseract.js');
  //   const { data } = await Tesseract.recognize(buffer, 'heb+eng', { ... });
  //   return { raw_text: data.text, confidence: data.confidence / 100, meta: { words: data.words.length } };
  throw new OcrError(
    'tesseract backend not installed — `npm i tesseract.js` and wire backendTesseract()',
    { code: 'OCR_BACKEND_NOT_INSTALLED', backend: 'tesseract' }
  );
}

async function backendGoogleVision(buffer, _hint = {}) {
  // STUB — real impl:
  //   const vision = require('@google-cloud/vision');
  //   const client = new vision.ImageAnnotatorClient();
  //   const [result] = await client.documentTextDetection({ image: { content: buffer } });
  //   const full = result.fullTextAnnotation;
  //   return { raw_text: full.text, confidence: full.pages[0].confidence, meta: {...} };
  throw new OcrError(
    'google-vision backend not installed — set GOOGLE_APPLICATION_CREDENTIALS and wire backendGoogleVision()',
    { code: 'OCR_BACKEND_NOT_INSTALLED', backend: 'google-vision' }
  );
}

async function backendAzureFormRecognizer(buffer, _hint = {}) {
  // STUB — real impl:
  //   const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
  //   const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  //   const poller = await client.beginAnalyzeDocument('prebuilt-invoice', buffer);
  //   const { content, pages } = await poller.pollUntilDone();
  //   return { raw_text: content, confidence: pages[0].confidence, meta: {...} };
  throw new OcrError(
    'azure-form-recognizer backend not installed — set AZURE_FR_ENDPOINT/AZURE_FR_KEY and wire backendAzureFormRecognizer()',
    { code: 'OCR_BACKEND_NOT_INSTALLED', backend: 'azure-form-recognizer' }
  );
}

async function backendOpenAiVision(buffer, _hint = {}) {
  // STUB — real impl:
  //   const OpenAI = require('openai');
  //   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  //   const resp = await openai.chat.completions.create({
  //     model: 'gpt-4-vision-preview',
  //     messages: [{ role: 'user', content: [
  //       { type: 'text',      text: 'Extract structured Israeli invoice data as JSON.' },
  //       { type: 'image_url', image_url: { url: `data:image/png;base64,${buffer.toString('base64')}` } },
  //     ] }],
  //   });
  //   return { raw_text: resp.choices[0].message.content, confidence: 0.9, meta: { model: resp.model } };
  throw new OcrError(
    'openai-vision backend not installed — set OPENAI_API_KEY and wire backendOpenAiVision()',
    { code: 'OCR_BACKEND_NOT_INSTALLED', backend: 'openai-vision' }
  );
}

const BACKENDS = {
  'mock':                  backendMock,
  'tesseract':             backendTesseract,
  'google-vision':         backendGoogleVision,
  'azure-form-recognizer': backendAzureFormRecognizer,
  'openai-vision':         backendOpenAiVision,
};

function _bufferSize(buffer) {
  if (!buffer) return 0;
  if (Buffer.isBuffer(buffer)) return buffer.length;
  if (typeof buffer === 'string') return buffer.length;
  if (buffer.byteLength != null) return buffer.byteLength;
  return 0;
}


// ════════════════════════════════════════════════════════════════
//  5. Mock fixtures — canned Hebrew invoices
// ════════════════════════════════════════════════════════════════

const _mockFixtures = {

  default: {
    confidence: 0.92,
    raw_text: [
      'חשבונית מס',
      'טכנו-קול עוזי בע"מ',
      'ח.פ. 514-321-987',
      'רחוב התעשייה 12, תל אביב',
      'טל: 03-5551234',
      'מספר חשבונית: INV-2026-000088',
      'תאריך: 11/04/2026',
      'לכבוד: לקוח לדוגמה בע"מ',
      '',
      'תיאור             כמות   מחיר יחידה   סה"כ',
      'כבל חשמל 2.5 מ"מ     10      25.00    250.00',
      'ממסר LS תלת-פאזי     2      150.00    300.00',
      'שעות עבודה           4      120.00    480.00',
      '',
      'סה"כ לפני מע"מ:  1,030.00 ₪',
      'מע"מ 17%:          175.10 ₪',
      'סה"כ לתשלום:     1,205.10 ₪',
      '',
      'תנאי תשלום: שוטף + 30',
      'מועד תשלום: 11/05/2026',
      'מספר הקצאה: AL202604110088',
    ].join('\n'),
  },

  credit_note: {
    confidence: 0.89,
    raw_text: [
      'חשבונית זיכוי',
      'טכנו-קול עוזי בע"מ',
      'ח.פ. 514321987',
      'מספר: CN-2026-000009',
      'תאריך: 05/04/2026',
      '',
      'תיאור: החזרת טובין מחשבונית INV-2026-000080',
      '',
      'סה"כ לפני מע"מ: -500.00 ₪',
      'מע"מ 17%:        -85.00 ₪',
      'סה"כ זיכוי:     -585.00 ₪',
    ].join('\n'),
  },

  tax_invoice_receipt: {
    confidence: 0.95,
    raw_text: [
      'חשבונית מס-קבלה',
      'אבי חשמלאי בע"מ',
      'ח"פ 515999888',
      'רח\' הרצל 5, חיפה',
      'טל: 04-8123456',
      'מספר: TIR-2026-000045',
      'תאריך: 10/04/2026',
      '',
      'פריט                     כמות   מחיר   סה"כ',
      'תיקון לוח חשמל             1   800.00   800.00',
      'חומרים                     1   200.00   200.00',
      '',
      'סה"כ לפני מע"מ: 1000.00 ₪',
      'מע"מ 17%:        170.00 ₪',
      'סה"כ כולל מע"מ:  1170.00 ₪',
      '',
      'שולם במזומן',
      'מספר הקצאה: AL202604100045',
    ].join('\n'),
  },

  receipt: {
    confidence: 0.88,
    raw_text: [
      'קבלה',
      'חנות המכולת של משה',
      'ח"פ 200123456',
      'מספר: 8877',
      'תאריך: 11/04/2026',
      'סה"כ: 85.50 ₪',
      'תודה ולהתראות',
    ].join('\n'),
  },

  proforma: {
    confidence: 0.90,
    raw_text: [
      'חשבונית עסקה',
      'פרופורמה — אינה חשבונית מס',
      'חברת הייעוץ בע"מ',
      'ח.פ. 516-111-222',
      'מספר: PRO-2026-000003',
      'תאריך: 11/04/2026',
      '',
      'שירותי ייעוץ אפריל       1    5000.00    5000.00',
      '',
      'סה"כ לפני מע"מ:  5,000.00 ₪',
      'מע"מ 17%:          850.00 ₪',
      'סה"כ לתשלום:     5,850.00 ₪',
      '',
      'תנאי תשלום: שוטף + 45',
    ].join('\n'),
  },

  unreadable: {
    confidence: 0.12,
    raw_text: '??? ??? ???\n@@@',
  },
};


// ════════════════════════════════════════════════════════════════
//  6. Field extractors
// ════════════════════════════════════════════════════════════════

function detectInvoiceType(text) {
  if (!text) return 'invoice';
  for (const group of INVOICE_TYPE_KEYWORDS) {
    for (const needle of group.patterns) {
      if (text.includes(needle)) return group.type;
    }
  }
  return 'invoice';
}

function extractCompanyId(text) {
  if (!text) return null;
  const candidates = [];
  // Prefer matches that come *after* a ח"פ / ת.ז label.
  const labelRe = /(?:ח"?פ|ח\.פ\.?|ע\.מ\.?|ת\.?ז\.?|עוסק\s*מורשה)\s*[:.#]?\s*([0-9][0-9\-\s]{6,14})/gu;
  let m;
  while ((m = labelRe.exec(text)) !== null) {
    candidates.push(m[1]);
  }
  if (candidates.length === 0) {
    // Unlabelled 9-digit block scan as fallback.
    const re = new RegExp(RE_COMPANY_ID.source, RE_COMPANY_ID.flags);
    while ((m = re.exec(text)) !== null) {
      candidates.push(m[1]);
    }
  }
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 9) return digits;
  }
  return null;
}

function extractAllocationNumber(text) {
  if (!text) return null;
  const m = RE_ALLOCATION_NUMBER.exec(text);
  return m ? m[1] : null;
}

function extractInvoiceNumber(text) {
  if (!text) return null;
  // Hebrew: "מספר חשבונית: X" or "מספר: X"
  const re = /(?:מספר\s*(?:חשבונית|חשבון)?|invoice\s*#|inv\s*#)[:#\s]*([A-Z]{2,5}[-\s]?\d{2,}[-\s]?\d{3,})/iu;
  const m = text.match(re);
  if (m) return m[1].replace(/\s+/g, '');
  // Fallback — first token that looks like INV-YYYY-NNN etc.
  const loose = /\b([A-Z]{2,5}-\d{4}-\d{3,})\b/;
  const l = text.match(loose);
  return l ? l[1] : null;
}

function extractDate(text) {
  if (!text) return null;
  // Look for "תאריך: DD/MM/YYYY" preferentially.
  const labelRe = /תאריך\s*[:.]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/u;
  const m = text.match(labelRe);
  const tokens = m ? [m[1], m[2], m[3]] : (function () {
    RE_DATE_DMY.lastIndex = 0;
    const first = RE_DATE_DMY.exec(text);
    return first ? [first[1], first[2], first[3]] : null;
  })();
  if (!tokens) return null;
  let [dd, mm, yyyy] = tokens;
  if (yyyy.length === 2) yyyy = (Number(yyyy) >= 70 ? '19' : '20') + yyyy;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1970 || y > 2100) return null;
  return `${y.toString().padStart(4, '0')}-${mo.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

function extractDueDate(text) {
  if (!text) return null;
  const re = /(?:מועד\s*תשלום|due\s*date|תאריך\s*תשלום)\s*[:.]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/iu;
  const m = text.match(re);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const yyyy = yy.length === 2 ? (Number(yy) >= 70 ? '19' : '20') + yy : yy;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function extractPaymentTerms(text) {
  if (!text) return null;
  // "שוטף + 30", "שוטף 30", "net 30", "שוטף פלוס"
  const re = /(?:תנאי\s*תשלום|payment\s*terms)\s*[:.]?\s*([^\n\r]{3,40})/iu;
  const m = text.match(re);
  if (m) return m[1].trim();
  const net = /(שוטף\s*\+?\s*\d+|net\s*\d+)/iu;
  const n = text.match(net);
  return n ? n[1].trim() : null;
}

function extractCurrency(text) {
  if (!text) return DEFAULT_CURRENCY;
  if (RE_CURRENCY_SHEKEL.test(text)) return 'ILS';
  if (/\$|USD/.test(text)) return 'USD';
  if (/€|EUR/.test(text)) return 'EUR';
  return DEFAULT_CURRENCY;
}

function _parseMoney(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractTotals(text) {
  if (!text) return { total_before_vat: null, vat_amount: null, total_with_vat: null };
  const out = { total_before_vat: null, vat_amount: null, total_with_vat: null };

  // The "before VAT" line is matched by its distinctive "לפני מע"מ".
  const beforeRe = /(?:סה"?כ\s*לפני\s*מע"?מ|subtotal|לפני\s*מע"?מ)\s*[:.]?\s*(-?\s*[\d,.]+)/iu;
  // The VAT line is identified by the rate itself ("מע"מ NN%") so we
  // don't accidentally match "לפני מע"מ". The percent token is required.
  const vatRe = /(?<!לפני\s)(?:מע"?מ\s*\d{1,2}\s*%|VAT\s*\d{1,2}\s*%)\s*[:.]?\s*(-?\s*[\d,.]+)/iu;
  // "סה"כ לתשלום / כולל / זיכוי / לחיוב" → the grand total.
  const totalRe = /(?:סה"?כ\s*(?:לתשלום|כולל\s*מע"?מ|כולל|זיכוי|לחיוב)|grand\s*total|total)\s*[:.]?\s*(-?\s*[\d,.]+)/iu;

  const bm = text.match(beforeRe); if (bm) out.total_before_vat = _parseMoney(bm[1]);
  const vm = text.match(vatRe);    if (vm) out.vat_amount       = _parseMoney(vm[1]);
  const tm = text.match(totalRe);  if (tm) out.total_with_vat   = _parseMoney(tm[1]);

  return out;
}

function extractLineItems(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const items = [];
  for (const ln of lines) {
    // Skip totals / headers.
    if (/סה"?כ|מע"?מ|חשבונית|תאריך|מספר|תיאור\s+כמות|תנאי|מועד|הקצאה/u.test(ln)) continue;
    // Match: description … qty  unit_price  total (3 numbers at end of line).
    const re = /^(.{3,50}?)\s+(\d+(?:\.\d+)?)\s+([\d,.]+)\s+([\d,.]+)$/u;
    const m = ln.match(re);
    if (!m) continue;
    const qty  = Number(m[2]);
    const unit = _parseMoney(m[3]);
    const tot  = _parseMoney(m[4]);
    if (qty == null || unit == null || tot == null) continue;
    items.push({
      description: m[1].trim(),
      quantity:    qty,
      unit_price:  unit,
      total:       tot,
    });
  }
  return items;
}

function extractSupplier(text) {
  if (!text) return { name: null, company_id: null, address: null, phone: null };
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Supplier name: first non-title line (title = document type keyword).
  const isTitle = (ln) => INVOICE_TYPE_KEYWORDS.some(g => g.patterns.some(p => ln === p || ln.startsWith(p)));
  let name = null;
  for (const ln of lines) {
    if (isTitle(ln)) continue;
    if (/ח"?פ|ח\.פ|ת\.?ז/u.test(ln)) continue;
    if (/\d{2,3}[\/.\-]\d{2,3}/.test(ln)) continue;  // date
    if (/מספר/u.test(ln)) continue;
    if (ln.length < 3 || ln.length > 60) continue;
    name = ln;
    break;
  }

  const phoneMatch = text.match(/(?:טל|phone|tel)[:.\s]*([0-9\-\s+()]{7,20})/iu);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s{2,}/g, ' ').trim() : null;

  const addressMatch = text.match(/(רחוב|רח'|שד'|רחבת)[^\n\r]{3,80}/u);
  const address = addressMatch ? addressMatch[0].trim() : null;

  return {
    name,
    company_id: extractCompanyId(text),
    address,
    phone,
  };
}

function inferVatRate(before, vat) {
  if (!Number.isFinite(before) || !Number.isFinite(vat) || before === 0) return null;
  // Round to one decimal. Real VAT in IL is fixed at 17 %, but older
  // invoices may show 16 % / 18 %.
  return Math.round((vat / before) * 1000) / 1000;
}


// ════════════════════════════════════════════════════════════════
//  7. Normalizer — raw OCR result → structured invoice
// ════════════════════════════════════════════════════════════════

function normalize({ raw_text, confidence, meta }, { backend, hint } = {}) {
  const text = raw_text || '';
  const type = detectInvoiceType(text);
  const { total_before_vat, vat_amount, total_with_vat } = extractTotals(text);
  const vat_rate = inferVatRate(total_before_vat, vat_amount) ?? VAT_RATE_STANDARD;

  return {
    supplier:   extractSupplier(text),
    invoice: {
      number:            extractInvoiceNumber(text),
      date:              extractDate(text),
      type,
      allocation_number: extractAllocationNumber(text),
      total_before_vat,
      vat_rate,
      vat_amount,
      total_with_vat,
      currency:          extractCurrency(text),
    },
    line_items:     extractLineItems(text),
    payment_terms:  extractPaymentTerms(text),
    due_date:       extractDueDate(text),
    raw_text:       text,
    confidence:     confidence ?? 0,
    backend:        backend || 'mock',
    scanned_at:     new Date().toISOString(),
    hint:           hint || null,
    meta:           meta || null,
  };
}


// ════════════════════════════════════════════════════════════════
//  8. Validator — business rules
// ════════════════════════════════════════════════════════════════

function _isValidCompanyId(id) {
  return typeof id === 'string' && /^\d{9}$/.test(id);
}

function _isSaneInvoiceDate(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  const tenYearsAgo = now - (10 * 365 * 86400 * 1000);
  const oneYearAhead = now + (365 * 86400 * 1000);
  const t = d.getTime();
  return t >= tenYearsAgo && t <= oneYearAhead;
}

function _vatSumsAgree(before, vat, total, rate) {
  if (!Number.isFinite(before) || !Number.isFinite(total)) return false;
  const expected = Math.round(before * (1 + (rate || VAT_RATE_STANDARD)) * 100) / 100;
  const diff = Math.abs(expected - total);
  return diff <= VAT_ROUNDING_TOLERANCE;
}

function validateInvoice(invoice) {
  const errors = [];
  const warnings = [];

  if (!invoice || typeof invoice !== 'object') {
    return { valid: false, errors: ['Invoice object required'], warnings };
  }

  const inv = invoice.invoice || {};
  const sup = invoice.supplier || {};

  if (!inv.number)  errors.push('Invoice number missing');
  if (!inv.date)    errors.push('Invoice date missing');
  if (!inv.type)    errors.push('Invoice type missing');

  if (!sup.company_id) {
    warnings.push('Supplier company_id (ח"פ) missing — cannot verify against רשות המיסים');
  } else if (!_isValidCompanyId(sup.company_id)) {
    errors.push(`Supplier company_id "${sup.company_id}" is not a valid 9-digit ח"פ`);
  }

  if (inv.date && !_isSaneInvoiceDate(inv.date)) {
    errors.push(`Invoice date ${inv.date} is outside the sane range (±10 years)`);
  }

  if (inv.total_before_vat != null && inv.total_with_vat != null) {
    const ok = _vatSumsAgree(inv.total_before_vat, inv.vat_amount, inv.total_with_vat, inv.vat_rate);
    if (!ok) {
      errors.push(
        `VAT totals mismatch: ${inv.total_before_vat} × (1 + ${inv.vat_rate}) ≠ ${inv.total_with_vat}`
      );
    }
  } else {
    warnings.push('Totals incomplete — cannot reconcile VAT');
  }

  if ((invoice.confidence ?? 0) < 0.5) {
    warnings.push(`Low OCR confidence (${invoice.confidence}) — manual review recommended`);
  }

  // Allocation number — only required for tax invoices above the 2024 reform threshold.
  if (inv.type === 'invoice' && !inv.allocation_number && (inv.total_before_vat ?? 0) > 25000) {
    warnings.push('Tax invoice above ILS 25,000 with no allocation number (רפורמת חשבונית 2024)');
  }

  return { valid: errors.length === 0, errors, warnings };
}


// ════════════════════════════════════════════════════════════════
//  9. Public entry point
// ════════════════════════════════════════════════════════════════

async function scanInvoice(imageOrPdfBuffer, opts = {}) {
  const backend = resolveBackend(opts.backend);
  const hint = opts.hint || {};
  const impl = BACKENDS[backend];
  if (!impl) {
    throw new OcrError(`No implementation registered for backend "${backend}"`, { code: 'OCR_BACKEND_MISSING', backend });
  }
  const raw = await impl(imageOrPdfBuffer, hint);
  return normalize(raw, { backend, hint });
}


// ════════════════════════════════════════════════════════════════
// 10. Express routes — POST /api/ocr/invoice, /verify
// ════════════════════════════════════════════════════════════════

function registerOcrRoutes(app, { supabase, audit } = {}) {
  // Decode { file: base64, mime?, hint? } into a Buffer.
  function decodeBody(body) {
    if (!body) throw new OcrError('No body', { code: 'OCR_NO_BODY' });
    const { file, mime, hint } = body;
    if (!file) throw new OcrError('Missing "file" (base64)', { code: 'OCR_NO_FILE' });
    const buf = Buffer.from(file, 'base64');
    return { buffer: buf, mime: mime || 'application/octet-stream', hint: hint || {} };
  }

  // POST /api/ocr/invoice — upload image/PDF → structured data
  app.post('/api/ocr/invoice', async (req, res) => {
    try {
      const { buffer, mime, hint } = decodeBody(req.body);
      const invoice = await scanInvoice(buffer, { hint });
      const v = validateInvoice(invoice);
      res.json({
        ok: true,
        mime,
        backend: invoice.backend,
        invoice,
        validation: v,
      });
    } catch (err) {
      const status = err.code === 'OCR_BACKEND_NOT_INSTALLED' ? 501 : 400;
      res.status(status).json({
        ok: false,
        error: err.message,
        code: err.code || 'OCR_ERROR',
        backend: err.backend || null,
      });
    }
  });

  // POST /api/ocr/invoice/verify — human verification + save
  app.post('/api/ocr/invoice/verify', async (req, res) => {
    try {
      const { invoice, corrections, actor } = req.body || {};
      if (!invoice) return res.status(400).json({ ok: false, error: 'invoice required' });

      const verifier = actor || req.actor || 'api';
      const merged = corrections
        ? {
            ...invoice,
            supplier: { ...(invoice.supplier || {}), ...(corrections.supplier || {}) },
            invoice:  { ...(invoice.invoice  || {}), ...(corrections.invoice  || {}) },
            line_items: corrections.line_items || invoice.line_items,
            payment_terms: corrections.payment_terms ?? invoice.payment_terms,
            due_date:      corrections.due_date      ?? invoice.due_date,
            verified:      true,
            verified_by:   verifier,
            verified_at:   new Date().toISOString(),
          }
        : {
            ...invoice,
            verified:    true,
            verified_by: verifier,
            verified_at: new Date().toISOString(),
          };

      const validation = validateInvoice(merged);

      if (supabase && validation.valid) {
        const { data, error } = await supabase
          .from('ocr_scanned_invoices')
          .insert({
            supplier_name:   merged.supplier?.name,
            supplier_cid:    merged.supplier?.company_id,
            invoice_number:  merged.invoice?.number,
            invoice_date:    merged.invoice?.date,
            invoice_type:    merged.invoice?.type,
            total_before_vat: merged.invoice?.total_before_vat,
            vat_amount:      merged.invoice?.vat_amount,
            total_with_vat:  merged.invoice?.total_with_vat,
            currency:        merged.invoice?.currency,
            allocation_number: merged.invoice?.allocation_number,
            raw_text:        merged.raw_text,
            confidence:      merged.confidence,
            backend:         merged.backend,
            line_items:      merged.line_items,
            verified_by:     merged.verified_by,
            verified_at:     merged.verified_at,
            created_at:      new Date().toISOString(),
          })
          .select()
          .single();
        if (error) return res.status(400).json({ ok: false, error: error.message, validation });
        if (audit) {
          await audit(
            'ocr_invoice', data.id, 'verified',
            merged.verified_by || 'api',
            `OCR invoice verified: ${merged.invoice?.number || '(no number)'} — ${merged.supplier?.name || '(no supplier)'}`,
            null, data
          );
        }
        return res.status(201).json({ ok: true, invoice: data, validation });
      }

      return res.json({ ok: validation.valid, invoice: merged, validation, saved: false });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message, code: err.code || 'OCR_ERROR' });
    }
  });
}


// ════════════════════════════════════════════════════════════════
// 11. Exports
// ════════════════════════════════════════════════════════════════

module.exports = {
  scanInvoice,
  validateInvoice,
  detectInvoiceType,
  extractCompanyId,
  extractAllocationNumber,
  registerOcrRoutes,
  OcrError,
  SUPPORTED_BACKENDS,

  // Exposed for unit tests — internal surface, not part of the
  // stable public contract.
  _internal: {
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
  },
};
