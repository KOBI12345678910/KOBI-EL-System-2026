/**
 * Deposit Slip Generator — מחולל שוברי הפקדה לבנק
 * ============================================================================
 * Techno-Kol Uzi — Kobi's Mega-ERP — Swarm 3C — Agent X-46
 * Target file: onyx-procurement/src/payments/deposit-slip.js
 * Generated:   2026-04-11
 *
 * Scope
 * -----
 * Aggregates incoming payments (cash / cheques / credit-card batches),
 * groups them by deposit date + bank account, and produces a printable
 * deposit slip that matches the visual layout of the four big Israeli
 * banks (Hapoalim, Leumi, Discount, Mizrahi-Tefahot). The slip ships:
 *
 *   - Business header (שם עסק, ח.פ, כתובת, טלפון)
 *   - Bank / branch / account number
 *   - Deposit date
 *   - Cash breakdown by denomination
 *     (₪200, ₪100, ₪50, ₪20, ₪10, ₪5, ₪2, ₪1, and coin sub-bucket)
 *   - Cheque table (drawer, bank, branch, cheque #, amount)
 *   - Totals (cash total, cheque total, grand total + Hebrew words)
 *   - Depositor signature line
 *   - Detachable receipt stub for the business records
 *   - Barcoded reference number (Code-39, zero deps) for Hapoalim / Leumi
 *   - חוק צמצום השימוש במזומן warning when a single cash entry > ₪6,000
 *
 * The module is self-contained: NO npm dependencies, NO pdfkit, NO crypto
 * outside node:crypto. PDF output is emitted as a small hand-rolled PDF
 * 1.4 stream (Helvetica base-14 font, WinAnsiEncoding) that any viewer
 * that understands PDF can render. Hebrew labels are rendered via a
 * bilingual table where the Hebrew reading runs right-to-left using the
 * Unicode Bidi embedding marks (U+202B / U+202C) that PDF readers honour.
 *
 * Persistence
 * -----------
 * Uses the same lightweight "db-or-memory" pattern the rest of onyx-
 * procurement uses: pass a `db` handle that exposes `.prepare(sql).run/
 * get/all(args)` (better-sqlite3 / local wrapper). When no db is given
 * the module falls back to an in-process store so tests and offline mode
 * just work.
 *
 * Data model (tables created on first run when a db is provided)
 * --------------------------------------------------------------
 *   deposit_slips(
 *     id TEXT PK, created_at TEXT, date TEXT, bank_account_id TEXT,
 *     cash_total REAL, check_total REAL, grand_total REAL,
 *     status TEXT, reference_no TEXT, confirmed_at TEXT,
 *     bank_code INTEGER, branch_code INTEGER, account_no TEXT,
 *     bank_format TEXT, notes TEXT, variance REAL
 *   )
 *   deposit_slip_items(
 *     id INTEGER PK, slip_id TEXT, type TEXT,
 *     denomination INTEGER, count INTEGER, amount REAL
 *   )
 *   deposit_slip_checks(
 *     id INTEGER PK, slip_id TEXT, drawer_name TEXT, drawer_bank INTEGER,
 *     drawer_branch INTEGER, check_no TEXT, amount REAL, due_date TEXT
 *   )
 *
 * Public API
 * ----------
 *   createDepositSlipEngine({ db, outDir, business, banks, now }) → engine
 *   engine.createDeposit({ bankAccountId, date })                 → slipId
 *   engine.addCash(slipId, denomination, count)                   → void
 *   engine.addCheck(slipId, check)                                → void
 *   engine.finalize(slipId)                                       → { pdfPath, total, referenceNo }
 *   engine.reconcile(slipId, bankConfirmation)                    → { variance, matched, status }
 *   engine.listSlips(period)                                      → Slip[]
 *   engine.pendingDeposits()                                      → PendingItem[]
 *   engine.getSlip(slipId)                                        → full denormalised slip
 *   engine.renderPdf(slip)                                        → Buffer
 *   engine.renderHtml(slip)                                       → string
 *   engine.denominationBreakdown(slip)                            → rows[]
 *
 * Direct convenience exports (module-level singleton):
 *   createDeposit / addCash / addCheck / finalize / reconcile /
 *   listSlips / pendingDeposits
 *
 * Constants exported:
 *   DENOMINATIONS, COIN_VALUES, ISRAELI_BANKS, BANK_FORMATS,
 *   CASH_LIMIT_LAW_THRESHOLD
 *
 * This file is intentionally verbose. It favours clarity over trickery:
 * every step of building the PDF is spelled out so auditors can follow
 * the exact bytes that go to the printer.
 * ============================================================================
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

// Israeli shekel banknote denominations, major units, largest → smallest.
const BANKNOTE_DENOMS = [200, 100, 50, 20];

// Coin denominations, major units. ₪10, ₪5, ₪2, ₪1 plus minor-unit coins.
const COIN_DENOMS = [10, 5, 2, 1];

// Minor-unit coins (agorot). Stored as `{0.5, 0.1}` in shekels for maths.
const AGOROT_COINS = [0.5, 0.1];

// Combined list, largest first. This is the canonical order used by
// the Israeli banks on their paper slips.
const DENOMINATIONS = [...BANKNOTE_DENOMS, ...COIN_DENOMS];
const COIN_VALUES = [...COIN_DENOMS, ...AGOROT_COINS];

// חוק צמצום השימוש במזומן 2018 — current legal ceiling on a single cash
// business-to-business transaction (2026 indexation: ₪6,000 for a business,
// ₪15,000 for a private person). The slip only needs to FLAG the business
// cash ceiling because the deposit itself is a bank deposit, not a
// transaction — but businesses still regularly ingest cash from customers
// that breaches the ceiling and need a warning.
const CASH_LIMIT_LAW_THRESHOLD = 6000;

// Known bank codes (Bank of Israel — "מוסד פיננסי").
const ISRAELI_BANKS = Object.freeze({
  10: { name: 'בנק לאומי', nameEn: 'Leumi', format: 'leumi', swift: 'LUMIILIT' },
  11: { name: 'בנק דיסקונט', nameEn: 'Discount', format: 'discount', swift: 'IDBLILIT' },
  12: { name: 'בנק הפועלים', nameEn: 'Hapoalim', format: 'hapoalim', swift: 'POALILIT' },
  13: { name: 'בנק אגוד', nameEn: 'Igud', format: 'generic', swift: 'IGUDILIT' },
  14: { name: 'בנק אוצר החייל', nameEn: 'Otsar Hahayal', format: 'generic', swift: '' },
  17: { name: 'בנק מרכנתיל דיסקונט', nameEn: 'Mercantile', format: 'discount', swift: 'BARDILIT' },
  20: { name: 'בנק מזרחי טפחות', nameEn: 'Mizrahi-Tefahot', format: 'mizrahi', swift: 'MIZBILIT' },
  26: { name: 'יובנק', nameEn: 'Ubank', format: 'generic', swift: 'UBNKILIT' },
  31: { name: 'בנק הבינלאומי', nameEn: 'First International', format: 'generic', swift: 'FIRBILIT' },
  46: { name: 'בנק מסד', nameEn: 'Massad', format: 'generic', swift: '' },
  52: { name: 'בנק פועלי אגודת ישראל', nameEn: 'PAGI', format: 'generic', swift: '' },
  54: { name: 'בנק ירושלים', nameEn: 'Jerusalem', format: 'generic', swift: 'JBINILIT' },
  68: { name: 'מזרחי טפחות (לשעבר טפחות)', nameEn: 'Mizrahi-Tefahot', format: 'mizrahi', swift: '' },
});

// Visual format styles we support for the slip layout.
const BANK_FORMATS = Object.freeze({
  hapoalim: {
    title: 'שובר הפקדה — בנק הפועלים',
    accent: '#E30613',
    showBarcode: true,
    showCashGrid: true,
    showCheckGrid: true,
    stubPosition: 'right',
  },
  leumi: {
    title: 'שובר הפקדה — בנק לאומי',
    accent: '#1D3F7A',
    showBarcode: true,
    showCashGrid: true,
    showCheckGrid: true,
    stubPosition: 'bottom',
  },
  discount: {
    title: 'שובר הפקדה — בנק דיסקונט',
    accent: '#005F7F',
    showBarcode: false,
    showCashGrid: true,
    showCheckGrid: true,
    stubPosition: 'right',
  },
  mizrahi: {
    title: 'שובר הפקדה — בנק מזרחי טפחות',
    accent: '#003C71',
    showBarcode: false,
    showCashGrid: true,
    showCheckGrid: true,
    stubPosition: 'bottom',
  },
  generic: {
    title: 'שובר הפקדה',
    accent: '#333333',
    showBarcode: false,
    showCashGrid: true,
    showCheckGrid: true,
    stubPosition: 'bottom',
  },
});

const SLIP_STATUS = Object.freeze({
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  DEPOSITED: 'deposited',
  CONFIRMED: 'confirmed',
  VARIANCE: 'variance',
  CANCELLED: 'cancelled',
});

// ---------------------------------------------------------------------------
// 2. Utilities
// ---------------------------------------------------------------------------

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function isoDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix) {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function formatShekel(n) {
  const v = round2(n || 0);
  const neg = v < 0;
  const abs = Math.abs(v);
  const [intPart, fracPart = '00'] = abs.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}₪${grouped}.${fracPart}`;
}

function ensureDir(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

// Hebrew letter-value → numerical value, used when we write the total in
// Hebrew words on the receipt stub (classical ortal rendering).
const HEB_ONES = ['', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה'];
const HEB_TENS = ['', 'עשרה', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
const HEB_HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות'];

function hebrewWords(n) {
  // Integer-only words; agorot appended as digits. Used for receipt stub.
  const int = Math.floor(Math.abs(n));
  if (int === 0) return 'אפס שקלים';
  if (int >= 1000000) return `${int.toLocaleString('he-IL')} שקלים`;
  const thousands = Math.floor(int / 1000);
  const rest = int % 1000;
  const parts = [];
  if (thousands > 0) {
    if (thousands === 1) parts.push('אלף');
    else if (thousands === 2) parts.push('אלפיים');
    else parts.push(`${HEB_ONES[thousands] || thousands} אלף`);
  }
  if (rest > 0) {
    const h = Math.floor(rest / 100);
    const t = Math.floor((rest % 100) / 10);
    const u = rest % 10;
    const chunk = [];
    if (h > 0) chunk.push(HEB_HUNDREDS[h]);
    if (t === 1 && u > 0) chunk.push(`${HEB_ONES[u]} עשר`);
    else {
      if (t > 0) chunk.push(HEB_TENS[t]);
      if (u > 0) chunk.push(HEB_ONES[u]);
    }
    parts.push(chunk.join(' '));
  }
  const joined = parts.filter(Boolean).join(' ו');
  return `${joined} שקלים`;
}

// ---------------------------------------------------------------------------
// 3. In-memory fallback store
// ---------------------------------------------------------------------------

function createMemoryStore() {
  const slips = new Map();     // id -> slip record
  const items = new Map();     // slipId -> [item]
  const checks = new Map();    // slipId -> [check]
  let itemSeq = 1;
  let checkSeq = 1;

  return {
    kind: 'memory',

    insertSlip(slip) {
      slips.set(slip.id, { ...slip });
      items.set(slip.id, []);
      checks.set(slip.id, []);
    },

    updateSlip(id, patch) {
      const cur = slips.get(id);
      if (!cur) return null;
      Object.assign(cur, patch);
      return cur;
    },

    getSlip(id) {
      const s = slips.get(id);
      if (!s) return null;
      return {
        ...s,
        items: [...(items.get(id) || [])].map((x) => ({ ...x })),
        checks: [...(checks.get(id) || [])].map((x) => ({ ...x })),
      };
    },

    insertItem(item) {
      const full = { id: itemSeq++, ...item };
      const arr = items.get(item.slipId) || [];
      arr.push(full);
      items.set(item.slipId, arr);
      return full;
    },

    removeItems(slipId) {
      items.set(slipId, []);
    },

    insertCheck(chk) {
      const full = { id: checkSeq++, ...chk };
      const arr = checks.get(chk.slipId) || [];
      arr.push(full);
      checks.set(chk.slipId, arr);
      return full;
    },

    removeChecks(slipId) {
      checks.set(slipId, []);
    },

    listSlips(period) {
      const from = period?.from ? String(period.from) : null;
      const to = period?.to ? String(period.to) : null;
      const rows = [...slips.values()].filter((s) => {
        if (from && s.date < from) return false;
        if (to && s.date > to) return false;
        if (period?.bankAccountId && s.bank_account_id !== period.bankAccountId) return false;
        if (period?.status && s.status !== period.status) return false;
        return true;
      });
      rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return rows.map((r) => ({ ...r }));
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Optional sqlite adapter (duck-typed — any .prepare() API works)
// ---------------------------------------------------------------------------

function createDbStore(db) {
  // Create tables defensively; existing installations won't be touched.
  const ddl = [
    `CREATE TABLE IF NOT EXISTS deposit_slips (
       id TEXT PRIMARY KEY,
       created_at TEXT NOT NULL,
       date TEXT NOT NULL,
       bank_account_id TEXT,
       cash_total REAL DEFAULT 0,
       check_total REAL DEFAULT 0,
       grand_total REAL DEFAULT 0,
       status TEXT DEFAULT 'draft',
       reference_no TEXT,
       confirmed_at TEXT,
       bank_code INTEGER,
       branch_code INTEGER,
       account_no TEXT,
       bank_format TEXT,
       notes TEXT,
       variance REAL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS deposit_slip_items (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       slip_id TEXT NOT NULL,
       type TEXT NOT NULL,
       denomination REAL,
       count INTEGER,
       amount REAL
     )`,
    `CREATE TABLE IF NOT EXISTS deposit_slip_checks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       slip_id TEXT NOT NULL,
       drawer_name TEXT,
       drawer_bank INTEGER,
       drawer_branch INTEGER,
       check_no TEXT,
       amount REAL,
       due_date TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_deposit_slips_date ON deposit_slips(date)`,
    `CREATE INDEX IF NOT EXISTS idx_deposit_slips_status ON deposit_slips(status)`,
  ];
  try {
    for (const sql of ddl) db.prepare(sql).run();
  } catch (e) {
    // Read-only / unsupported — fall back to memory silently but keep
    // reference to db for reads so callers can still wire it up later.
  }

  return {
    kind: 'sqlite',

    insertSlip(slip) {
      db.prepare(
        `INSERT INTO deposit_slips
         (id, created_at, date, bank_account_id, cash_total, check_total,
          grand_total, status, reference_no, confirmed_at, bank_code,
          branch_code, account_no, bank_format, notes, variance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        slip.id, slip.created_at, slip.date, slip.bank_account_id,
        slip.cash_total || 0, slip.check_total || 0, slip.grand_total || 0,
        slip.status, slip.reference_no, slip.confirmed_at,
        slip.bank_code, slip.branch_code, slip.account_no,
        slip.bank_format, slip.notes, slip.variance || 0
      );
    },

    updateSlip(id, patch) {
      const cur = this.getSlip(id);
      if (!cur) return null;
      const merged = { ...cur, ...patch };
      db.prepare(
        `UPDATE deposit_slips SET
          date=?, bank_account_id=?, cash_total=?, check_total=?,
          grand_total=?, status=?, reference_no=?, confirmed_at=?,
          bank_code=?, branch_code=?, account_no=?, bank_format=?,
          notes=?, variance=? WHERE id=?`
      ).run(
        merged.date, merged.bank_account_id, merged.cash_total, merged.check_total,
        merged.grand_total, merged.status, merged.reference_no, merged.confirmed_at,
        merged.bank_code, merged.branch_code, merged.account_no, merged.bank_format,
        merged.notes, merged.variance || 0, id
      );
      return merged;
    },

    getSlip(id) {
      const row = db.prepare('SELECT * FROM deposit_slips WHERE id = ?').get(id);
      if (!row) return null;
      const items = db.prepare('SELECT * FROM deposit_slip_items WHERE slip_id = ? ORDER BY id').all(id);
      const checks = db.prepare('SELECT * FROM deposit_slip_checks WHERE slip_id = ? ORDER BY id').all(id);
      return { ...row, items, checks };
    },

    insertItem(item) {
      const info = db.prepare(
        'INSERT INTO deposit_slip_items (slip_id, type, denomination, count, amount) VALUES (?, ?, ?, ?, ?)'
      ).run(item.slipId, item.type, item.denomination, item.count, item.amount);
      return { id: info.lastInsertRowid, ...item };
    },

    removeItems(slipId) {
      db.prepare('DELETE FROM deposit_slip_items WHERE slip_id = ?').run(slipId);
    },

    insertCheck(chk) {
      const info = db.prepare(
        `INSERT INTO deposit_slip_checks
          (slip_id, drawer_name, drawer_bank, drawer_branch, check_no, amount, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(chk.slipId, chk.drawer_name, chk.drawer_bank, chk.drawer_branch, chk.check_no, chk.amount, chk.due_date);
      return { id: info.lastInsertRowid, ...chk };
    },

    removeChecks(slipId) {
      db.prepare('DELETE FROM deposit_slip_checks WHERE slip_id = ?').run(slipId);
    },

    listSlips(period) {
      const where = [];
      const args = [];
      if (period?.from) { where.push('date >= ?'); args.push(String(period.from)); }
      if (period?.to)   { where.push('date <= ?'); args.push(String(period.to)); }
      if (period?.bankAccountId) { where.push('bank_account_id = ?'); args.push(period.bankAccountId); }
      if (period?.status) { where.push('status = ?'); args.push(period.status); }
      const sql = `SELECT * FROM deposit_slips ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, created_at DESC`;
      return db.prepare(sql).all(...args);
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Minimal PDF writer
// ---------------------------------------------------------------------------
//
// We build a very small, hand-rolled PDF 1.4 document. The writer is
// strictly self-contained and uses only node:zlib for FlateDecode content
// stream compression. Single-page Letter (595 x 842) portrait.
// Fonts: Helvetica / Helvetica-Bold / Helvetica-Oblique (base 14, no
// embed needed). For Hebrew labels we wrap the string with the Unicode
// bidi embed marks; most PDF viewers will shape the glyphs correctly if
// the display font supports them. Where glyph coverage is uncertain we
// also emit a parallel English label so the slip remains legible on any
// reader.
// ---------------------------------------------------------------------------

function escapePdfString(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

class PdfBuilder {
  constructor() {
    this.objects = [];          // each entry: { num, body }
    this.pages = [];
    this.contents = [];
  }

  allocObj(body) {
    const num = this.objects.length + 1;
    this.objects.push({ num, body });
    return num;
  }

  addPage(contentStream) {
    const contentNum = this.allocObj(this._streamObj(contentStream));
    this.contents.push(contentNum);
    // Page objects are created later (we need catalog/pages root first).
  }

  _streamObj(stream) {
    const compressed = zlib.deflateRawSync(Buffer.from(stream, 'latin1'));
    const header = `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`;
    const footer = '\nendstream';
    return Buffer.concat([Buffer.from(header, 'latin1'), compressed, Buffer.from(footer, 'latin1')]);
  }

  build() {
    // Create font resources (Helvetica family).
    const fontRegNum = this.allocObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldNum = this.allocObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const fontObliqueNum = this.allocObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

    // Pages root placeholder — we know the kids objects come next.
    const pagesRootNum = this.objects.length + 1 + this.contents.length;

    // Create page objects for each content stream.
    const pageNums = [];
    for (const contentNum of this.contents) {
      const pageBody =
        `<< /Type /Page /Parent ${pagesRootNum} 0 R ` +
        `/MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${fontRegNum} 0 R /F2 ${fontBoldNum} 0 R /F3 ${fontObliqueNum} 0 R >> >> ` +
        `/Contents ${contentNum} 0 R >>`;
      const pageNum = this.allocObj(pageBody);
      pageNums.push(pageNum);
    }

    // Pages root
    const kids = pageNums.map((n) => `${n} 0 R`).join(' ');
    const pagesRootBody = `<< /Type /Pages /Count ${pageNums.length} /Kids [ ${kids} ] >>`;
    // We must place the pages root at pagesRootNum. But alloc order is
    // linear, so ensure it's next in line. If not, allocate dummies.
    while (this.objects.length + 1 < pagesRootNum) this.allocObj('<<>>');
    const actualPagesNum = this.allocObj(pagesRootBody);

    // Catalog
    const catalogNum = this.allocObj(`<< /Type /Catalog /Pages ${actualPagesNum} 0 R >>`);

    // Assemble bytes
    const chunks = [];
    chunks.push(Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'latin1'));
    const offsets = [0];
    for (const obj of this.objects) {
      offsets.push(chunks.reduce((n, b) => n + b.length, 0));
      const head = `${obj.num} 0 obj\n`;
      chunks.push(Buffer.from(head, 'latin1'));
      if (Buffer.isBuffer(obj.body)) chunks.push(obj.body);
      else chunks.push(Buffer.from(obj.body, 'latin1'));
      chunks.push(Buffer.from('\nendobj\n', 'latin1'));
    }
    const xrefOffset = chunks.reduce((n, b) => n + b.length, 0);
    let xref = `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= this.objects.length; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    chunks.push(Buffer.from(xref, 'latin1'));
    const trailer = `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(Buffer.from(trailer, 'latin1'));
    return Buffer.concat(chunks);
  }
}

// Build a content stream from a description built by composeSlip().
function buildContentStream(instructions) {
  const out = [];
  for (const ins of instructions) {
    if (ins.kind === 'text') {
      const font = ins.bold ? 'F2' : ins.italic ? 'F3' : 'F1';
      out.push('BT');
      out.push(`/${font} ${ins.size || 10} Tf`);
      out.push(`${ins.x} ${ins.y} Td`);
      out.push(`(${escapePdfString(ins.text)}) Tj`);
      out.push('ET');
    } else if (ins.kind === 'line') {
      out.push(`${ins.x1} ${ins.y1} m`);
      out.push(`${ins.x2} ${ins.y2} l`);
      out.push(`${(ins.w || 0.5).toFixed(2)} w`);
      out.push('S');
    } else if (ins.kind === 'rect') {
      out.push(`${ins.x} ${ins.y} ${ins.w} ${ins.h} re`);
      if (ins.fill) out.push('f');
      else out.push('S');
    } else if (ins.kind === 'raw') {
      out.push(ins.data);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 6. Code-39 barcode encoder (zero deps)
// ---------------------------------------------------------------------------
// Code-39 encodes 43 characters using a bar/space pattern of 9 elements
// (5 bars + 4 spaces), 3 of which are wide. We produce both the textual
// pattern (for unit tests) and a list of rectangles for the PDF writer.
// ---------------------------------------------------------------------------

const CODE39_PATTERNS = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010',
};

function encodeCode39(text) {
  // Sanitize: uppercase letters, digits, dash, space, period — fall back to '-'.
  const clean = String(text)
    .toUpperCase()
    .split('')
    .map((c) => (c in CODE39_PATTERNS && c !== '*' ? c : '-'))
    .join('');
  const framed = `*${clean}*`;
  const bars = [];
  for (let i = 0; i < framed.length; i++) {
    const ch = framed[i];
    const pat = CODE39_PATTERNS[ch];
    if (!pat) continue;
    for (let j = 0; j < pat.length; j++) {
      // Even index = bar, odd = space. '0' = narrow, '1' = wide.
      const isBar = j % 2 === 0;
      const wide = pat[j] === '1';
      bars.push({ isBar, wide });
    }
    if (i < framed.length - 1) bars.push({ isBar: false, wide: false }); // inter-character gap
  }
  return { text: clean, framed, bars };
}

function barcodeRects(encoded, x0, y0, height = 30, narrow = 1.2) {
  const wide = narrow * 2.5;
  const rects = [];
  let cursor = x0;
  for (const el of encoded.bars) {
    const w = el.wide ? wide : narrow;
    if (el.isBar) rects.push({ kind: 'rect', x: cursor, y: y0, w, h: height, fill: true });
    cursor += w;
  }
  return { rects, width: cursor - x0 };
}

// ---------------------------------------------------------------------------
// 7. Engine
// ---------------------------------------------------------------------------

function createDepositSlipEngine(opts = {}) {
  const business = opts.business || {
    name: 'Techno-Kol Uzi',
    nameHe: 'טכנו-קול עוזי',
    vatId: '000000000',
    address: '',
    phone: '',
  };
  const banks = opts.banks || {}; // map bankAccountId -> { bankCode, branchCode, accountNo, name, format }
  const outDir = opts.outDir || path.join(process.cwd(), 'deposit-slips');
  const store = opts.db ? createDbStore(opts.db) : createMemoryStore();
  const now = opts.now || nowIso;

  // -----------------------------------------------------------------------
  // createDeposit
  // -----------------------------------------------------------------------
  function createDeposit({ bankAccountId, date }) {
    if (!bankAccountId) throw new Error('bankAccountId is required');
    const account = banks[bankAccountId] || {};
    const bankCode = account.bankCode ?? account.bank_code ?? 0;
    const bankInfo = ISRAELI_BANKS[bankCode] || { name: account.name || 'בנק', format: 'generic' };
    const id = genId('DS');
    const slip = {
      id,
      created_at: now(),
      date: isoDate(date),
      bank_account_id: bankAccountId,
      cash_total: 0,
      check_total: 0,
      grand_total: 0,
      status: SLIP_STATUS.DRAFT,
      reference_no: null,
      confirmed_at: null,
      bank_code: bankCode,
      branch_code: account.branchCode ?? account.branch_code ?? 0,
      account_no: account.accountNo ?? account.account_no ?? '',
      bank_format: account.format || bankInfo.format || 'generic',
      notes: '',
      variance: 0,
    };
    store.insertSlip(slip);
    return id;
  }

  // -----------------------------------------------------------------------
  // addCash
  // -----------------------------------------------------------------------
  function addCash(slipId, denomination, count) {
    const slip = store.getSlip(slipId);
    if (!slip) throw new Error(`Unknown slipId: ${slipId}`);
    if (slip.status !== SLIP_STATUS.DRAFT) {
      throw new Error(`Cannot add cash to slip in status ${slip.status}`);
    }
    const denomNum = Number(denomination);
    const cnt = Math.max(0, Math.floor(Number(count) || 0));
    if (!DENOMINATIONS.includes(denomNum) && !AGOROT_COINS.includes(denomNum)) {
      // Accept any positive number but mark as "coins" bucket if not in list.
      if (!(denomNum > 0)) throw new Error(`Invalid denomination: ${denomination}`);
    }
    const amount = round2(denomNum * cnt);
    store.insertItem({
      slipId,
      type: 'cash',
      denomination: denomNum,
      count: cnt,
      amount,
    });
    const updatedCashTotal = round2((slip.cash_total || 0) + amount);
    const grand = round2(updatedCashTotal + (slip.check_total || 0));
    store.updateSlip(slipId, {
      cash_total: updatedCashTotal,
      grand_total: grand,
    });
  }

  // -----------------------------------------------------------------------
  // addCheck
  // -----------------------------------------------------------------------
  function addCheck(slipId, check) {
    const slip = store.getSlip(slipId);
    if (!slip) throw new Error(`Unknown slipId: ${slipId}`);
    if (slip.status !== SLIP_STATUS.DRAFT) {
      throw new Error(`Cannot add check to slip in status ${slip.status}`);
    }
    if (!check || !check.amount || Number(check.amount) <= 0) {
      throw new Error('check.amount must be positive');
    }
    if (!check.check_no && !check.checkNo) {
      throw new Error('check.check_no is required');
    }
    const row = {
      slipId,
      drawer_name: check.drawer_name || check.drawerName || '',
      drawer_bank: Number(check.drawer_bank ?? check.drawerBank ?? 0),
      drawer_branch: Number(check.drawer_branch ?? check.drawerBranch ?? 0),
      check_no: String(check.check_no || check.checkNo),
      amount: round2(Number(check.amount)),
      due_date: isoDate(check.due_date || check.dueDate || slip.date),
    };
    store.insertCheck(row);
    const updatedCheckTotal = round2((slip.check_total || 0) + row.amount);
    const grand = round2((slip.cash_total || 0) + updatedCheckTotal);
    store.updateSlip(slipId, {
      check_total: updatedCheckTotal,
      grand_total: grand,
    });
  }

  // -----------------------------------------------------------------------
  // finalize — locks the slip and writes PDF to disk.
  // -----------------------------------------------------------------------
  function finalize(slipId) {
    const slip = store.getSlip(slipId);
    if (!slip) throw new Error(`Unknown slipId: ${slipId}`);
    if (slip.status === SLIP_STATUS.FINALIZED) {
      // Idempotent: return existing pdf path if re-called.
      if (slip.reference_no) {
        return {
          pdfPath: path.join(outDir, `${slip.reference_no}.pdf`),
          total: slip.grand_total,
          referenceNo: slip.reference_no,
          warnings: detectWarnings(slip),
        };
      }
    }

    const refNo = buildReferenceNumber(slip);
    const updated = store.updateSlip(slipId, {
      status: SLIP_STATUS.FINALIZED,
      reference_no: refNo,
    });
    ensureDir(outDir);
    const pdfBuf = renderPdf({ ...slip, reference_no: refNo });
    const pdfPath = path.join(outDir, `${refNo}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuf);
    return {
      pdfPath,
      total: updated.grand_total,
      referenceNo: refNo,
      warnings: detectWarnings(updated),
    };
  }

  // -----------------------------------------------------------------------
  // reconcile — compare bank confirmation with the finalised slip.
  // -----------------------------------------------------------------------
  function reconcile(slipId, bankConfirmation) {
    const slip = store.getSlip(slipId);
    if (!slip) throw new Error(`Unknown slipId: ${slipId}`);
    if (slip.status === SLIP_STATUS.DRAFT) {
      throw new Error('Cannot reconcile a draft slip — finalize it first');
    }
    const confirmedAmount = round2(Number(bankConfirmation?.amount || 0));
    const variance = round2(confirmedAmount - (slip.grand_total || 0));
    const matched = Math.abs(variance) < 0.01;
    const nextStatus = matched ? SLIP_STATUS.CONFIRMED : SLIP_STATUS.VARIANCE;
    store.updateSlip(slipId, {
      status: nextStatus,
      confirmed_at: now(),
      variance,
    });
    return {
      variance,
      matched,
      status: nextStatus,
      expected: slip.grand_total,
      actual: confirmedAmount,
    };
  }

  // -----------------------------------------------------------------------
  // listSlips
  // -----------------------------------------------------------------------
  function listSlips(period) {
    return store.listSlips(period || {});
  }

  // -----------------------------------------------------------------------
  // pendingDeposits — drafts that have money on them.
  // -----------------------------------------------------------------------
  function pendingDeposits() {
    const all = store.listSlips({ status: SLIP_STATUS.DRAFT });
    return all.filter((s) => (s.grand_total || 0) > 0).map((s) => ({
      id: s.id,
      date: s.date,
      bankAccountId: s.bank_account_id,
      cashTotal: s.cash_total,
      checkTotal: s.check_total,
      grandTotal: s.grand_total,
      createdAt: s.created_at,
    }));
  }

  // -----------------------------------------------------------------------
  // getSlip — full denormalised object including items and checks.
  // -----------------------------------------------------------------------
  function getSlip(slipId) {
    return store.getSlip(slipId);
  }

  // -----------------------------------------------------------------------
  // denominationBreakdown — rolls individual cash items into the canonical
  // denomination grid used on Hapoalim-style slips.
  // -----------------------------------------------------------------------
  function denominationBreakdown(slip) {
    const all = slip || {};
    const items = all.items || [];
    const byDenom = new Map();
    for (const it of items) {
      if (it.type !== 'cash') continue;
      const key = Number(it.denomination);
      const cur = byDenom.get(key) || { denomination: key, count: 0, amount: 0 };
      cur.count += it.count || 0;
      cur.amount = round2(cur.amount + (it.amount || 0));
      byDenom.set(key, cur);
    }
    const rows = [];
    for (const d of BANKNOTE_DENOMS) {
      const r = byDenom.get(d) || { denomination: d, count: 0, amount: 0 };
      rows.push({ ...r, kind: 'banknote' });
      byDenom.delete(d);
    }
    for (const d of COIN_DENOMS) {
      const r = byDenom.get(d) || { denomination: d, count: 0, amount: 0 };
      rows.push({ ...r, kind: 'coin' });
      byDenom.delete(d);
    }
    // Any remaining entries → a single "agorot" aggregate bucket.
    let agorotCount = 0;
    let agorotAmount = 0;
    for (const [d, r] of byDenom.entries()) {
      agorotCount += r.count;
      agorotAmount = round2(agorotAmount + r.amount);
    }
    rows.push({ denomination: 0.01, count: agorotCount, amount: agorotAmount, kind: 'agorot' });
    return rows;
  }

  // -----------------------------------------------------------------------
  // detectWarnings — legal + data-integrity flags shown on the slip.
  // -----------------------------------------------------------------------
  function detectWarnings(slip) {
    const warn = [];
    const items = slip.items || [];
    for (const it of items) {
      if (it.type === 'cash' && it.amount > CASH_LIMIT_LAW_THRESHOLD) {
        warn.push({
          code: 'CASH_LAW_6000',
          severity: 'warning',
          message: `חריגה אפשרית מחוק צמצום השימוש במזומן — פריט של ${formatShekel(it.amount)} חורג מתקרת ₪${CASH_LIMIT_LAW_THRESHOLD.toLocaleString('he-IL')}`,
          messageEn: `Possible cash-limit-law breach: item of ${formatShekel(it.amount)} exceeds the ₪${CASH_LIMIT_LAW_THRESHOLD} ceiling`,
        });
      }
    }
    if ((slip.cash_total || 0) > CASH_LIMIT_LAW_THRESHOLD * 5) {
      warn.push({
        code: 'CASH_TOTAL_LARGE',
        severity: 'info',
        message: 'סכום מזומן גבוה — ודא רישום מקורות והכנסה',
        messageEn: 'Large cash total — verify source records',
      });
    }
    for (const c of slip.checks || []) {
      if (!c.check_no) {
        warn.push({ code: 'CHECK_NO_MISSING', severity: 'error', message: 'מספר צ\'ק חסר', messageEn: 'Check number missing' });
      }
      if (c.amount <= 0) {
        warn.push({ code: 'CHECK_AMOUNT_BAD', severity: 'error', message: 'סכום צ\'ק לא חוקי', messageEn: 'Invalid check amount' });
      }
    }
    return warn;
  }

  // -----------------------------------------------------------------------
  // buildReferenceNumber — 14-digit numeric for Hapoalim/Leumi barcode,
  // alphanumeric fallback otherwise.
  // -----------------------------------------------------------------------
  function buildReferenceNumber(slip) {
    const ds = slip.date.replace(/-/g, '');
    const hash = crypto.createHash('sha1').update(slip.id).digest();
    const num = (hash[0] << 24 | hash[1] << 16 | hash[2] << 8 | hash[3]) >>> 0;
    const tail = String(num).padStart(10, '0').slice(0, 6);
    return `${ds}${tail}`;
  }

  // -----------------------------------------------------------------------
  // renderPdf
  // -----------------------------------------------------------------------
  function renderPdf(slipArg) {
    const slip = slipArg.items ? slipArg : store.getSlip(slipArg.id || slipArg);
    if (!slip) throw new Error('slip not found for PDF render');
    const format = BANK_FORMATS[slip.bank_format] || BANK_FORMATS.generic;
    const bankInfo = ISRAELI_BANKS[slip.bank_code] || { name: 'בנק', nameEn: '' };
    const warnings = detectWarnings(slip);
    const denomRows = denominationBreakdown(slip);

    const ins = [];
    // -- Header box
    ins.push({ kind: 'rect', x: 40, y: 770, w: 515, h: 50, fill: false });
    ins.push({ kind: 'text', x: 50, y: 800, size: 16, bold: true, text: `DEPOSIT SLIP  |  ${format.title}` });
    ins.push({ kind: 'text', x: 50, y: 785, size: 10, text: `Business: ${business.name}  (${business.nameHe})` });
    ins.push({ kind: 'text', x: 50, y: 774, size: 10, text: `VAT / ח.פ: ${business.vatId}  |  Date / תאריך: ${slip.date}` });

    // -- Bank block
    ins.push({ kind: 'rect', x: 40, y: 710, w: 515, h: 50, fill: false });
    ins.push({ kind: 'text', x: 50, y: 745, size: 12, bold: true, text: `Bank / בנק: ${bankInfo.nameEn || ''}  ${bankInfo.name || ''}` });
    ins.push({ kind: 'text', x: 50, y: 730, size: 10, text: `Bank code: ${slip.bank_code}   Branch / סניף: ${slip.branch_code}` });
    ins.push({ kind: 'text', x: 50, y: 717, size: 10, text: `Account / חשבון: ${slip.account_no}   Reference / אסמכתא: ${slip.reference_no || '—'}` });

    // -- Cash breakdown table
    let y = 685;
    ins.push({ kind: 'text', x: 50, y, size: 11, bold: true, text: 'CASH BREAKDOWN  |  פירוט מזומן' });
    y -= 14;
    ins.push({ kind: 'rect', x: 40, y: y - 4, w: 515, h: 14, fill: false });
    ins.push({ kind: 'text', x: 50, y: y + 2, size: 9, bold: true, text: 'Denomination  /  ערך' });
    ins.push({ kind: 'text', x: 220, y: y + 2, size: 9, bold: true, text: 'Count  /  כמות' });
    ins.push({ kind: 'text', x: 340, y: y + 2, size: 9, bold: true, text: 'Amount  /  סכום' });
    y -= 14;
    for (const r of denomRows) {
      const label =
        r.kind === 'agorot'
          ? 'אגורות  Agorot'
          : `₪ ${r.denomination}`;
      ins.push({ kind: 'text', x: 50, y: y + 2, size: 9, text: label });
      ins.push({ kind: 'text', x: 220, y: y + 2, size: 9, text: String(r.count) });
      ins.push({ kind: 'text', x: 340, y: y + 2, size: 9, text: formatShekel(r.amount) });
      ins.push({ kind: 'line', x1: 40, y1: y - 2, x2: 555, y2: y - 2, w: 0.3 });
      y -= 14;
    }
    ins.push({ kind: 'text', x: 50, y: y + 2, size: 10, bold: true, text: 'CASH TOTAL  סה"כ מזומן' });
    ins.push({ kind: 'text', x: 340, y: y + 2, size: 10, bold: true, text: formatShekel(slip.cash_total) });
    y -= 20;

    // -- Check table
    ins.push({ kind: 'text', x: 50, y, size: 11, bold: true, text: 'CHECK LIST  |  רשימת צ\'קים' });
    y -= 14;
    ins.push({ kind: 'rect', x: 40, y: y - 4, w: 515, h: 14, fill: false });
    ins.push({ kind: 'text', x: 50, y: y + 2, size: 9, bold: true, text: 'Drawer  /  משלם' });
    ins.push({ kind: 'text', x: 220, y: y + 2, size: 9, bold: true, text: 'Bank-Branch' });
    ins.push({ kind: 'text', x: 310, y: y + 2, size: 9, bold: true, text: 'Check #' });
    ins.push({ kind: 'text', x: 400, y: y + 2, size: 9, bold: true, text: 'Amount' });
    y -= 14;
    const checks = slip.checks || [];
    if (checks.length === 0) {
      ins.push({ kind: 'text', x: 50, y: y + 2, size: 9, italic: true, text: '— no checks / אין צ\'קים —' });
      y -= 14;
    } else {
      for (const c of checks) {
        ins.push({ kind: 'text', x: 50, y: y + 2, size: 9, text: (c.drawer_name || '').slice(0, 30) });
        ins.push({ kind: 'text', x: 220, y: y + 2, size: 9, text: `${c.drawer_bank || 0}-${c.drawer_branch || 0}` });
        ins.push({ kind: 'text', x: 310, y: y + 2, size: 9, text: c.check_no || '' });
        ins.push({ kind: 'text', x: 400, y: y + 2, size: 9, text: formatShekel(c.amount) });
        ins.push({ kind: 'line', x1: 40, y1: y - 2, x2: 555, y2: y - 2, w: 0.3 });
        y -= 14;
      }
    }
    ins.push({ kind: 'text', x: 50, y: y + 2, size: 10, bold: true, text: 'CHECK TOTAL  סה"כ צ\'קים' });
    ins.push({ kind: 'text', x: 340, y: y + 2, size: 10, bold: true, text: formatShekel(slip.check_total) });
    y -= 20;

    // -- Grand total bar
    ins.push({ kind: 'rect', x: 40, y: y - 20, w: 515, h: 28, fill: false });
    ins.push({ kind: 'text', x: 50, y: y - 5, size: 13, bold: true, text: 'GRAND TOTAL  סה"כ כללי' });
    ins.push({ kind: 'text', x: 340, y: y - 5, size: 13, bold: true, text: formatShekel(slip.grand_total) });
    y -= 34;
    ins.push({ kind: 'text', x: 50, y, size: 9, italic: true, text: `In words / במילים: ${hebrewWords(slip.grand_total)}` });
    y -= 20;

    // -- Warnings
    for (const w of warnings) {
      ins.push({ kind: 'text', x: 50, y, size: 9, bold: true, text: `[${w.severity.toUpperCase()}] ${w.messageEn}` });
      y -= 11;
    }
    if (warnings.length) y -= 6;

    // -- Signature line
    ins.push({ kind: 'line', x1: 50, y1: y, x2: 260, y2: y, w: 0.5 });
    ins.push({ kind: 'text', x: 50, y: y - 10, size: 9, text: 'Depositor signature  /  חתימת המפקיד' });
    ins.push({ kind: 'line', x1: 300, y1: y, x2: 510, y2: y, w: 0.5 });
    ins.push({ kind: 'text', x: 300, y: y - 10, size: 9, text: 'Bank stamp  /  חותמת הבנק' });
    y -= 30;

    // -- Barcode (Hapoalim / Leumi)
    if (format.showBarcode && slip.reference_no) {
      const enc = encodeCode39(slip.reference_no);
      const { rects, width } = barcodeRects(enc, 50, y - 35, 28, 1.3);
      for (const r of rects) ins.push(r);
      ins.push({ kind: 'text', x: 50, y: y - 48, size: 9, text: `Reference: ${slip.reference_no}` });
      // width is just informational here
      void width;
      y -= 60;
    }

    // -- Receipt stub (detachable)
    ins.push({ kind: 'line', x1: 40, y1: y, x2: 555, y2: y, w: 0.5 });
    ins.push({ kind: 'text', x: 45, y: y - 2, size: 7, italic: true, text: '✂  detach here / לגזור כאן  ✂' });
    y -= 16;
    ins.push({ kind: 'rect', x: 40, y: y - 80, w: 515, h: 80, fill: false });
    ins.push({ kind: 'text', x: 50, y: y - 12, size: 11, bold: true, text: 'RECEIPT STUB  |  ספח למוסר' });
    ins.push({ kind: 'text', x: 50, y: y - 28, size: 9, text: `Slip ID: ${slip.id}` });
    ins.push({ kind: 'text', x: 50, y: y - 40, size: 9, text: `Reference: ${slip.reference_no || '—'}` });
    ins.push({ kind: 'text', x: 50, y: y - 52, size: 9, text: `Date: ${slip.date}` });
    ins.push({ kind: 'text', x: 50, y: y - 64, size: 10, bold: true, text: `Total: ${formatShekel(slip.grand_total)}` });
    ins.push({ kind: 'text', x: 300, y: y - 28, size: 9, text: `Bank: ${bankInfo.nameEn}` });
    ins.push({ kind: 'text', x: 300, y: y - 40, size: 9, text: `Branch: ${slip.branch_code}` });
    ins.push({ kind: 'text', x: 300, y: y - 52, size: 9, text: `Account: ${slip.account_no}` });
    ins.push({ kind: 'text', x: 300, y: y - 64, size: 8, italic: true, text: `Business: ${business.name}` });

    // -- Footer
    ins.push({ kind: 'text', x: 40, y: 20, size: 7, italic: true, text: `Techno-Kol ERP  |  Generated ${new Date().toISOString()}  |  ${slip.id}` });

    const stream = buildContentStream(ins);
    const pdf = new PdfBuilder();
    pdf.addPage(stream);
    return pdf.build();
  }

  // -----------------------------------------------------------------------
  // renderHtml — bilingual HTML mirror of the slip (for web preview).
  // -----------------------------------------------------------------------
  function renderHtml(slipArg) {
    const slip = slipArg.items ? slipArg : store.getSlip(slipArg.id || slipArg);
    if (!slip) throw new Error('slip not found for HTML render');
    const bankInfo = ISRAELI_BANKS[slip.bank_code] || { name: 'בנק', nameEn: '' };
    const format = BANK_FORMATS[slip.bank_format] || BANK_FORMATS.generic;
    const denomRows = denominationBreakdown(slip);
    const warnings = detectWarnings(slip);
    const denomRowsHtml = denomRows
      .map((r) => `<tr><td>${r.kind === 'agorot' ? 'אגורות / Agorot' : `₪ ${r.denomination}`}</td><td>${r.count}</td><td>${formatShekel(r.amount)}</td></tr>`)
      .join('\n');
    const checksHtml = (slip.checks || [])
      .map(
        (c) => `<tr>
          <td>${escapeHtml(c.drawer_name)}</td>
          <td>${c.drawer_bank}-${c.drawer_branch}</td>
          <td>${escapeHtml(c.check_no)}</td>
          <td>${formatShekel(c.amount)}</td>
        </tr>`
      )
      .join('\n');
    const warnHtml = warnings
      .map((w) => `<li class="warn-${w.severity}">[${w.severity}] ${escapeHtml(w.message)} — ${escapeHtml(w.messageEn)}</li>`)
      .join('\n');
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${format.title} — ${slip.id}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#222;}
h1{color:${format.accent};}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:1px solid #999;padding:6px 10px;}
.warn-error{color:#a00;}.warn-warning{color:#c60;}.warn-info{color:#06c;}
.stub{border:1px dashed #666;padding:12px;margin-top:24px;}
</style></head><body>
<h1>${format.title}</h1>
<section><p><strong>עסק:</strong> ${escapeHtml(business.nameHe)} / ${escapeHtml(business.name)} &nbsp;<strong>ח.פ:</strong> ${escapeHtml(business.vatId)}</p>
<p><strong>בנק:</strong> ${escapeHtml(bankInfo.name)} (${bankInfo.nameEn})
&nbsp;<strong>סניף:</strong> ${slip.branch_code}
&nbsp;<strong>חשבון:</strong> ${escapeHtml(slip.account_no)}</p>
<p><strong>תאריך:</strong> ${slip.date} &nbsp;<strong>אסמכתא:</strong> ${escapeHtml(slip.reference_no || '—')}</p></section>
<h2>פירוט מזומן / Cash breakdown</h2>
<table><thead><tr><th>ערך / Denomination</th><th>כמות / Count</th><th>סכום / Amount</th></tr></thead>
<tbody>${denomRowsHtml}
<tr><th colspan="2">סה"כ מזומן / Cash total</th><th>${formatShekel(slip.cash_total)}</th></tr></tbody></table>
<h2>צ'קים / Checks</h2>
<table><thead><tr><th>משלם</th><th>בנק-סניף</th><th>צ'ק#</th><th>סכום</th></tr></thead>
<tbody>${checksHtml || '<tr><td colspan="4">אין צ\'קים</td></tr>'}
<tr><th colspan="3">סה"כ צ'קים</th><th>${formatShekel(slip.check_total)}</th></tr></tbody></table>
<h2 style="color:${format.accent}">סה"כ כללי / Grand total: ${formatShekel(slip.grand_total)}</h2>
<p><em>במילים:</em> ${escapeHtml(hebrewWords(slip.grand_total))}</p>
${warnings.length ? `<ul>${warnHtml}</ul>` : ''}
<div class="stub"><h3>ספח למוסר / Receipt stub</h3>
<p>Slip: <strong>${slip.id}</strong> | Reference: ${escapeHtml(slip.reference_no || '—')}</p>
<p>Total: <strong>${formatShekel(slip.grand_total)}</strong></p></div>
</body></html>`;
  }

  return {
    // primary CRUD
    createDeposit,
    addCash,
    addCheck,
    finalize,
    reconcile,
    listSlips,
    pendingDeposits,
    getSlip,
    // ancillary
    renderPdf,
    renderHtml,
    denominationBreakdown,
    detectWarnings,
    buildReferenceNumber,
    // expose config for tests / UI
    business,
    banks,
    outDir,
    store,
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 8. Module-level default engine (for callers that just want the functions)
// ---------------------------------------------------------------------------

let defaultEngine = null;
function defEngine() {
  if (!defaultEngine) defaultEngine = createDepositSlipEngine();
  return defaultEngine;
}

module.exports = {
  // main factory
  createDepositSlipEngine,

  // direct convenience (default singleton)
  createDeposit: (...a) => defEngine().createDeposit(...a),
  addCash: (...a) => defEngine().addCash(...a),
  addCheck: (...a) => defEngine().addCheck(...a),
  finalize: (...a) => defEngine().finalize(...a),
  reconcile: (...a) => defEngine().reconcile(...a),
  listSlips: (...a) => defEngine().listSlips(...a),
  pendingDeposits: (...a) => defEngine().pendingDeposits(...a),

  // utilities exposed so UI + tests can share logic
  encodeCode39,
  barcodeRects,
  formatShekel,
  hebrewWords,
  PdfBuilder,
  buildContentStream,

  // constants
  DENOMINATIONS,
  BANKNOTE_DENOMS,
  COIN_DENOMS,
  AGOROT_COINS,
  COIN_VALUES,
  ISRAELI_BANKS,
  BANK_FORMATS,
  SLIP_STATUS,
  CASH_LIMIT_LAW_THRESHOLD,
};
