/**
 * Multi-Format Bank Statement Parser
 * ONYX Procurement — Agent 69 extension
 *
 * Adds support for additional bank statement formats on top of the existing
 * CSV + MT940 parsers in `./parsers.js`. This file is purely additive —
 * nothing in `./parsers.js`, `./matcher.js` or `./bank-routes.js` is touched.
 *
 * Supported formats:
 *   - 'ofx'       — OFX 2.x (Open Financial Exchange, XML flavour)
 *   - 'qif'       — Quicken Interchange Format (plain text)
 *   - 'mt940'     — SWIFT MT940 (delegated to existing parser, then normalised)
 *   - 'camt053'   — ISO 20022 CAMT.053 (European Bank-to-Customer Statement)
 *   - 'csv-il'    — Hebrew CSV from Israeli banks (Leumi, Hapoalim, Mizrahi,
 *                    Discount, Otsar HaHayal) with per-bank column maps,
 *                    auto-detected from headers. Handles UTF-8 and Windows-1255
 *                    encoded buffers, DD/MM/YYYY dates and the ₪ symbol.
 *   - 'pdf'       — OPTIONAL: PDF bank statements (soft-depends on `pdf-parse`).
 *                    Gracefully falls back to "unsupported" if the module is
 *                    not installed; nothing else breaks.
 *
 * Public API:
 *   detectFormat(buffer)              → format name (string)
 *   parseStatement(buffer, format?)   → Array<NormalizedTransaction>
 *   normalizeTransaction(raw, format) → NormalizedTransaction (single)
 *
 * Normalized Transaction schema (common across formats):
 *   {
 *     transaction_date:     'YYYY-MM-DD',
 *     value_date:           'YYYY-MM-DD' | null,
 *     description:          string,
 *     reference:            string | null,
 *     amount:               number  // signed: credit positive, debit negative
 *     currency:             'ILS' | 'USD' | 'EUR' | ...
 *     balance:              number | null,
 *     type:                 'credit' | 'debit',
 *     counterparty_name:    string | null,
 *     counterparty_iban:    string | null,
 *     external_id:          string | null,
 *     source_format:        'ofx' | 'qif' | 'mt940' | 'camt053' | 'csv-il' | 'pdf'
 *   }
 *
 * This module is dependency-light: it does NOT require an XML library — it
 * uses a tiny regex-based walker that is good enough for the well-formed XML
 * that OFX 2.x and CAMT.053 exports produce.  If the data is malformed the
 * parser will throw a descriptive error.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const SOURCE_FORMATS = Object.freeze({
  OFX: 'ofx',
  QIF: 'qif',
  MT940: 'mt940',
  CAMT053: 'camt053',
  CSV_IL: 'csv-il',
  PDF: 'pdf',
});

// Israeli bank identifiers — each bank has a slightly different CSV header set
// and a distinctive giveaway token we match for auto-detection.
const ISRAELI_BANKS = {
  leumi: {
    id: 'leumi',
    name: 'Bank Leumi',
    tokens: ['לאומי', 'bank leumi', 'leumi'],
    // Typical headers: תאריך,תאריך ערך,תיאור,אסמכתא,חובה,זכות,יתרה
    headers: {
      date: ['תאריך', 'תאריך ביצוע', 'תאריך פעולה'],
      valueDate: ['תאריך ערך'],
      description: ['תיאור', 'פרטים', 'פרטי פעולה'],
      reference: ['אסמכתא', 'מס אסמכתא', 'מספר אסמכתא'],
      debit: ['חובה', 'חיוב'],
      credit: ['זכות', 'זיכוי'],
      amount: ['סכום'],
      balance: ['יתרה', 'יתרה בש״ח'],
    },
  },
  hapoalim: {
    id: 'hapoalim',
    name: 'Bank Hapoalim',
    tokens: ['הפועלים', 'bank hapoalim', 'hapoalim', 'טכנו קול'],
    headers: {
      date: ['תאריך', 'תאריך ביצוע'],
      valueDate: ['תאריך ערך'],
      description: ['תיאור', 'תיאור תנועה', 'פירוט התנועה'],
      reference: ['אסמכתא', 'מס. אסמכתא'],
      debit: ['חובה', 'חוב'],
      credit: ['זכות', 'זכ'],
      amount: ['סכום'],
      balance: ['יתרה', 'יתרה לאחר תנועה'],
    },
  },
  mizrahi: {
    id: 'mizrahi',
    name: 'Mizrahi Tefahot',
    tokens: ['מזרחי', 'טפחות', 'mizrahi', 'tefahot'],
    headers: {
      date: ['תאריך', 'תאריך ביצוע'],
      valueDate: ['תאריך ערך'],
      description: ['פרטי פעולה', 'תיאור', 'תיאור הפעולה'],
      reference: ['אסמכתא'],
      debit: ['חובה'],
      credit: ['זכות'],
      amount: ['סכום בש״ח', 'סכום'],
      balance: ['יתרה', 'יתרה בש״ח'],
    },
  },
  discount: {
    id: 'discount',
    name: 'Bank Discount',
    tokens: ['דיסקונט', 'discount', 'bank discount'],
    headers: {
      date: ['תאריך', 'תאריך עסקה'],
      valueDate: ['תאריך ערך'],
      description: ['פרטים', 'תיאור עסקה', 'פרטי העסקה'],
      reference: ['אסמכתא', 'מס\' אסמכתא'],
      debit: ['חובה', 'חיוב'],
      credit: ['זכות', 'זיכוי'],
      amount: ['סכום'],
      balance: ['יתרה', 'יתרה שוטפת'],
    },
  },
  otsarHahayal: {
    id: 'otsar-hahayal',
    name: 'Otsar HaHayal',
    tokens: ['אוצר החייל', 'otsar', 'אוצרהחייל'],
    headers: {
      date: ['תאריך', 'תאריך פעולה'],
      valueDate: ['תאריך ערך'],
      description: ['תיאור פעולה', 'תיאור', 'פרטים'],
      reference: ['אסמכתא'],
      debit: ['חובה'],
      credit: ['זכות'],
      amount: ['סכום'],
      balance: ['יתרה', 'יתרה לאחר פעולה'],
    },
  },
};

// ══════════════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════════════

/**
 * Convert a Node Buffer (or string) to a UTF-8 string.
 * Detects Windows-1255 (Hebrew Windows) by looking for lots of high-bit
 * bytes in the 0xE0..0xFA range that would otherwise be mojibake as UTF-8.
 */
function bufferToString(buffer) {
  if (typeof buffer === 'string') return buffer;
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('bufferToString expects a Buffer or string');
  }

  // BOM detection — quick wins first
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.slice(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.slice(2).toString('utf16le');
  }

  // Try UTF-8 strict first. If it produces the replacement char (U+FFFD)
  // AND the buffer has bytes in 0xE0..0xFA (Hebrew Windows-1255 range),
  // fall back to Windows-1255 via a manual lookup.
  const utf8 = buffer.toString('utf8');
  const hasReplacement = utf8.includes('\uFFFD');

  if (!hasReplacement) return utf8;

  // Windows-1255 manual decoder — covers Hebrew range 0xE0..0xFA.
  // (Good enough for CSV exports from Israeli banks.)
  return decodeWindows1255(buffer);
}

/**
 * Minimal Windows-1255 (Hebrew) decoder. Characters 0x00-0x7F are ASCII;
 * 0xE0-0xFA map to Hebrew letters U+05D0..U+05EA; 0xFB-0xFF are punctuation.
 */
function decodeWindows1255(buffer) {
  const out = [];
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b < 0x80) {
      out.push(String.fromCharCode(b));
    } else if (b >= 0xE0 && b <= 0xFA) {
      // 0xE0 → U+05D0 (Alef), 0xFA → U+05EA (Tav)
      out.push(String.fromCharCode(0x05D0 + (b - 0xE0)));
    } else if (b === 0xA4) {
      out.push('\u20AA'); // ₪ New Shekel sign
    } else {
      // Fallback — keep printable, drop others
      out.push(String.fromCharCode(b));
    }
  }
  return out.join('');
}

/** Parse DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD → ISO YYYY-MM-DD. */
function parseDateFlexible(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;

  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  // Israeli / European dd/mm/yyyy
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // yyyymmdd compact
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // yymmdd (MT940 style) — accepted but 2-digit year assumed 20xx
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const yy = parseInt(m[1], 10);
    return `20${String(yy).padStart(2, '0')}-${m[2]}-${m[3]}`;
  }

  return null;
}

/** Parse amount with Hebrew / European formatting. */
function parseAmountFlexible(str) {
  if (str == null || str === '') return 0;
  if (typeof str === 'number') return str;
  let s = String(str).trim();

  // Strip currency symbols and spaces
  s = s.replace(/[\u20AA$€£₪]/g, '').replace(/\s+/g, '');

  // Detect negative via parentheses or leading minus
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }

  // European format: comma as decimal, dot as thousands → "1.234,56" → "1234.56"
  // Heuristic: if string contains both '.' and ',' — the LAST one is decimal.
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    // Only comma present — treat as decimal IF it has 1-2 digits after.
    // Otherwise treat as thousands.
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts.join('.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

/** Detect currency from a string. Falls back to ILS. */
function detectCurrency(str, fallback = 'ILS') {
  if (!str) return fallback;
  const s = String(str);
  if (s.includes('\u20AA') || s.includes('₪') || /\bILS\b/i.test(s) || /NIS/i.test(s)) return 'ILS';
  if (s.includes('$') || /\bUSD\b/i.test(s)) return 'USD';
  if (s.includes('€') || /\bEUR\b/i.test(s)) return 'EUR';
  if (s.includes('£') || /\bGBP\b/i.test(s)) return 'GBP';
  return fallback;
}

/**
 * Tiny tag-based XML walker: returns the first text value of <tag>...</tag>
 * Case-insensitive, namespace-agnostic (matches both <BALAMT> and <Amt Ccy="EUR">).
 */
function xmlTag(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Return ALL occurrences of <tag>...</tag> as an array of inner strings. */
function xmlTagAll(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Return the first attribute of a tag, e.g. xmlAttr('<Amt Ccy="EUR">123</Amt>', 'Ccy'). */
function xmlAttr(fragment, attr) {
  if (!fragment) return null;
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i');
  const m = fragment.match(re);
  return m ? m[1] : null;
}

/** Decode basic XML entities. */
function xmlDecode(str) {
  if (!str) return str;
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ══════════════════════════════════════════════════════════════════════
// detectFormat(buffer) → string
// ══════════════════════════════════════════════════════════════════════

/**
 * Inspect a Buffer or string and return the most likely source format.
 * Returns one of SOURCE_FORMATS.* values, or 'unknown'.
 */
function detectFormat(input) {
  if (!input) return 'unknown';

  // PDF — detect via magic bytes BEFORE string conversion so we don't
  // corrupt binary content.
  if (Buffer.isBuffer(input) && input.length >= 4) {
    if (input[0] === 0x25 && input[1] === 0x50 && input[2] === 0x44 && input[3] === 0x46) {
      return SOURCE_FORMATS.PDF; // %PDF
    }
  }

  const text = bufferToString(input);
  const head = text.slice(0, 4096);
  const trimmed = head.trimStart();

  // OFX 2.x — XML declaration with <OFX> root
  if (/^<\?xml[\s\S]*?<OFX[\s>]/i.test(trimmed) || /^<OFX[\s>]/i.test(trimmed)) {
    return SOURCE_FORMATS.OFX;
  }
  // OFX 1.x SGML header (OFXHEADER:...)
  if (/^OFXHEADER\s*[:=]/i.test(trimmed)) return SOURCE_FORMATS.OFX;

  // CAMT.053 — ISO 20022 XML with <BkToCstmrStmt> element
  if (/<(?:\w+:)?BkToCstmrStmt/i.test(head) || /camt\.053/i.test(head)) {
    return SOURCE_FORMATS.CAMT053;
  }

  // MT940 — starts with :20: tag (possibly after whitespace or SWIFT envelope)
  if (/^\s*:20:/m.test(head) && /:60[FM]:/m.test(head)) {
    return SOURCE_FORMATS.MT940;
  }

  // QIF — starts with "!Type:Bank" (or similar !Type: header)
  if (/^\s*!Type:/im.test(head)) return SOURCE_FORMATS.QIF;

  // Israeli CSV — presence of Hebrew column headers is a strong signal
  if (/תאריך/.test(head) && /(חובה|זכות|סכום|יתרה)/.test(head)) {
    return SOURCE_FORMATS.CSV_IL;
  }

  return 'unknown';
}

// ══════════════════════════════════════════════════════════════════════
// OFX 2.x parser
// ══════════════════════════════════════════════════════════════════════

function parseOfx(text) {
  // Strip any SGML-style OFX 1.x header leading to the first tag.
  const rootIdx = text.search(/<OFX[\s>]/i);
  if (rootIdx === -1) {
    throw new Error('OFX: could not locate <OFX> root element');
  }
  const xml = text.slice(rootIdx);

  const statements = [];

  // Currency
  const curDef = xmlTag(xml, 'CURDEF') || 'USD';

  // Account info
  const bankId = xmlTag(xml, 'BANKID');
  const acctId = xmlTag(xml, 'ACCTID');

  // All STMTTRN blocks
  const trnBlocks = xmlTagAll(xml, 'STMTTRN');
  if (trnBlocks.length === 0) {
    throw new Error('OFX: no <STMTTRN> transactions found');
  }

  for (const blk of trnBlocks) {
    const trnType = xmlTag(blk, 'TRNTYPE');         // CREDIT / DEBIT / PAYMENT / ...
    const dtPosted = xmlTag(blk, 'DTPOSTED');        // YYYYMMDD[HHMMSS]
    const dtUser = xmlTag(blk, 'DTUSER');            // value date (optional)
    const trnAmt = xmlTag(blk, 'TRNAMT');            // signed amount
    const fitId = xmlTag(blk, 'FITID');              // unique id
    const name = xmlTag(blk, 'NAME');                // counterparty
    const memo = xmlTag(blk, 'MEMO');                // description
    const checkNum = xmlTag(blk, 'CHECKNUM');        // reference (optional)
    const refNum = xmlTag(blk, 'REFNUM') || checkNum;

    statements.push({
      _format: SOURCE_FORMATS.OFX,
      trnType,
      dtPosted,
      dtUser,
      trnAmt,
      fitId,
      name,
      memo,
      refNum,
      currency: curDef,
      accountId: acctId,
      bankId,
    });
  }

  return statements;
}

function normalizeOfx(raw) {
  const dtPosted = raw.dtPosted ? raw.dtPosted.slice(0, 8) : null;
  const dtUser = raw.dtUser ? raw.dtUser.slice(0, 8) : null;
  const amount = parseAmountFlexible(raw.trnAmt);
  return {
    transaction_date: dtPosted ? `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}` : null,
    value_date: dtUser ? `${dtUser.slice(0, 4)}-${dtUser.slice(4, 6)}-${dtUser.slice(6, 8)}` : null,
    description: xmlDecode(raw.memo || raw.name || raw.trnType || ''),
    reference: raw.refNum || null,
    amount,
    currency: raw.currency || 'USD',
    balance: null,
    type: amount >= 0 ? 'credit' : 'debit',
    counterparty_name: xmlDecode(raw.name || null),
    counterparty_iban: null,
    external_id: raw.fitId || null,
    source_format: SOURCE_FORMATS.OFX,
  };
}

// ══════════════════════════════════════════════════════════════════════
// QIF parser
// ══════════════════════════════════════════════════════════════════════

/**
 * QIF format: lines prefixed with single-letter codes, records terminated
 * by a "^" line.
 *   D → date
 *   T → amount
 *   N → number / check#
 *   P → payee
 *   M → memo
 *   L → category
 *   C → cleared flag
 *   ^ → end of record
 */
function parseQif(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let current = {};
  let started = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (/^!Type:/i.test(line)) { started = true; continue; }
    if (!started) continue;

    if (line === '^') {
      if (Object.keys(current).length > 0) records.push(current);
      current = {};
      continue;
    }
    const code = line[0];
    const value = line.slice(1);
    switch (code) {
      case 'D': current.date = value; break;
      case 'T': current.amount = value; break;
      case 'U': current.amountU = value; break; // alt amount form
      case 'N': current.number = value; break;
      case 'P': current.payee = value; break;
      case 'M': current.memo = value; break;
      case 'L': current.category = value; break;
      case 'C': current.cleared = value; break;
      case 'A': // address lines — concatenate
        current.address = (current.address || '') + value + ' ';
        break;
      default: // ignore
        break;
    }
  }
  // Flush trailing record if no terminator
  if (Object.keys(current).length > 0) records.push(current);

  if (records.length === 0) {
    throw new Error('QIF: no records found');
  }

  return records.map(r => ({ _format: SOURCE_FORMATS.QIF, ...r }));
}

/**
 * QIF dates are traditionally US-format MM/DD/YYYY (Quicken is a US product),
 * with occasional variants like "1'2026" or "D 1/ 4'26". We try US order first.
 */
function parseQifDate(str) {
  if (str == null) return null;
  const s = String(str).trim()
    // Quicken sometimes uses "'" instead of "/" before the year
    .replace(/'/g, '/')
    .replace(/\s+/g, '');
  if (!s) return null;

  // MM/DD/YYYY or M/D/YY (US)
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Fallback: ISO / compact via the generic parser
  return parseDateFlexible(s);
}

function normalizeQif(raw) {
  const amount = parseAmountFlexible(raw.amount || raw.amountU || 0);
  return {
    transaction_date: parseQifDate(raw.date),
    value_date: null,
    description: [raw.payee, raw.memo].filter(Boolean).join(' — ') || '',
    reference: raw.number || null,
    amount,
    currency: 'USD', // QIF has no currency field; caller may override
    balance: null,
    type: amount >= 0 ? 'credit' : 'debit',
    counterparty_name: raw.payee || null,
    counterparty_iban: null,
    external_id: raw.number || null,
    source_format: SOURCE_FORMATS.QIF,
  };
}

// ══════════════════════════════════════════════════════════════════════
// MT940 parser (normalizing adapter around existing parseMt940Statement)
// ══════════════════════════════════════════════════════════════════════

function parseMt940Raw(text) {
  // We intentionally re-implement a minimal MT940 walker here so this file
  // stays self-contained for testing and the existing `parsers.js` is
  // not modified.  For rich behaviour callers can still use parseMt940Statement
  // from `./parsers.js`.
  const lines = text.split(/\r?\n/);
  const out = [];
  let acct = null;
  let currentTx = null;
  let openingBal = null;

  for (const line of lines) {
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)/);
    if (m) {
      const [, tag, val] = m;
      switch (tag) {
        case '25': acct = val.trim(); break;
        case '60F':
        case '60M': {
          const mm = val.match(/^([CD])(\d{6})([A-Z]{3})([\d,.]+)/);
          if (mm) {
            const amt = parseFloat(mm[4].replace(',', '.'));
            openingBal = mm[1] === 'D' ? -amt : amt;
          }
          break;
        }
        case '61': {
          // :61:YYMMDD[MMDD][DC][N]amount,N...
          const mm = val.match(/^(\d{6})(\d{4})?([DC])([NR]?)([\d,.]+)([A-Z]?\d{0,3})(.*)/);
          if (mm) {
            const yy = parseInt(mm[1].slice(0, 2), 10);
            const mo = mm[1].slice(2, 4);
            const dd = mm[1].slice(4, 6);
            const date = `20${String(yy).padStart(2, '0')}-${mo}-${dd}`;
            let valueDate = null;
            if (mm[2]) {
              const vMo = mm[2].slice(0, 2);
              const vDd = mm[2].slice(2, 4);
              valueDate = `20${String(yy).padStart(2, '0')}-${vMo}-${vDd}`;
            }
            const sign = mm[3] === 'D' ? -1 : 1;
            const amount = sign * parseFloat(mm[5].replace(',', '.'));
            currentTx = {
              _format: SOURCE_FORMATS.MT940,
              date,
              valueDate,
              amount,
              description: '',
              reference: (mm[7] || '').trim() || null,
              accountId: acct,
              currency: null, // MT940 currency lives on balance tags
              openingBalance: openingBal,
            };
            out.push(currentTx);
          }
          break;
        }
        case '86':
          if (currentTx) {
            currentTx.description = (currentTx.description + ' ' + val).trim();
          }
          break;
      }
    } else if (currentTx && line.trim() && !line.startsWith(':')) {
      currentTx.description = (currentTx.description + ' ' + line.trim()).trim();
    }
  }

  if (out.length === 0) throw new Error('MT940: no :61: transactions found');
  return out;
}

function normalizeMt940(raw) {
  return {
    transaction_date: raw.date,
    value_date: raw.valueDate || null,
    description: raw.description || '',
    reference: raw.reference || null,
    amount: raw.amount,
    currency: raw.currency || 'ILS',
    balance: null,
    type: raw.amount >= 0 ? 'credit' : 'debit',
    counterparty_name: null,
    counterparty_iban: null,
    external_id: raw.reference || null,
    source_format: SOURCE_FORMATS.MT940,
  };
}

// ══════════════════════════════════════════════════════════════════════
// CAMT.053 (ISO 20022) parser
// ══════════════════════════════════════════════════════════════════════

function parseCamt053(text) {
  // CAMT.053 contains one or more <Stmt> elements, each with <Ntry> entries.
  const stmts = xmlTagAll(text, 'Stmt');
  if (stmts.length === 0) {
    throw new Error('CAMT.053: no <Stmt> element found');
  }

  const out = [];
  for (const stmt of stmts) {
    const acctId = xmlTag(stmt, 'Id') || xmlTag(stmt, 'IBAN');
    // Entry-level currency falls back to balance currency
    const balAmt = stmt.match(/<(?:\w+:)?Amt\s+Ccy="([^"]+)"/i);
    const stmtCurrency = balAmt ? balAmt[1] : 'EUR';

    const entries = xmlTagAll(stmt, 'Ntry');
    for (const ntry of entries) {
      const amtFrag = ntry.match(/<(?:\w+:)?Amt(\s+Ccy="[^"]*")?>([\s\S]*?)<\/(?:\w+:)?Amt>/i);
      const amtVal = amtFrag ? parseAmountFlexible(amtFrag[2]) : 0;
      const currency = amtFrag && amtFrag[1] ? xmlAttr(amtFrag[1], 'Ccy') : stmtCurrency;

      const cdtDbtInd = xmlTag(ntry, 'CdtDbtInd'); // 'CRDT' or 'DBIT'
      const signed = cdtDbtInd === 'DBIT' ? -Math.abs(amtVal) : Math.abs(amtVal);

      const bookgDt = xmlTag(ntry, 'BookgDt') || '';
      const valDt = xmlTag(ntry, 'ValDt') || '';
      const bookDate = xmlTag(bookgDt, 'Dt') || bookgDt.trim();
      const valueDate = xmlTag(valDt, 'Dt') || valDt.trim();

      // Details
      const ntryDtls = xmlTag(ntry, 'NtryDtls') || '';
      const txDtls = xmlTag(ntryDtls, 'TxDtls') || ntryDtls;

      const acctSvcrRef = xmlTag(ntry, 'AcctSvcrRef');
      const endToEndId = xmlTag(txDtls, 'EndToEndId');
      const mndtId = xmlTag(txDtls, 'MndtId');

      // Counterparty
      const rltdPties = xmlTag(txDtls, 'RltdPties') || '';
      const dbtr = xmlTag(rltdPties, 'Dbtr') || '';
      const cdtr = xmlTag(rltdPties, 'Cdtr') || '';
      const counterparty =
        xmlTag(dbtr, 'Nm') || xmlTag(cdtr, 'Nm') || null;
      const rltdAgts = xmlTag(txDtls, 'RltdAgts') || '';
      const iban =
        xmlTag(xmlTag(rltdPties, 'DbtrAcct') || '', 'IBAN') ||
        xmlTag(xmlTag(rltdPties, 'CdtrAcct') || '', 'IBAN') ||
        null;

      // Remittance
      const rmtInf = xmlTag(txDtls, 'RmtInf') || '';
      const ustrd = xmlTag(rmtInf, 'Ustrd') || '';
      const addInf = xmlTag(ntry, 'AddtlNtryInf') || '';
      const description = xmlDecode([ustrd, addInf].filter(Boolean).join(' — ')) || '';

      out.push({
        _format: SOURCE_FORMATS.CAMT053,
        accountId: acctId,
        amount: signed,
        currency,
        transaction_date: parseDateFlexible(bookDate),
        value_date: parseDateFlexible(valueDate),
        description,
        reference: acctSvcrRef || endToEndId || mndtId || null,
        external_id: acctSvcrRef || endToEndId || null,
        counterparty_name: counterparty,
        counterparty_iban: iban,
      });
    }
  }

  if (out.length === 0) {
    throw new Error('CAMT.053: parsed statements but no <Ntry> entries');
  }
  return out;
}

function normalizeCamt053(raw) {
  return {
    transaction_date: raw.transaction_date,
    value_date: raw.value_date || null,
    description: raw.description || '',
    reference: raw.reference || null,
    amount: raw.amount,
    currency: raw.currency || 'EUR',
    balance: null,
    type: raw.amount >= 0 ? 'credit' : 'debit',
    counterparty_name: raw.counterparty_name || null,
    counterparty_iban: raw.counterparty_iban || null,
    external_id: raw.external_id || null,
    source_format: SOURCE_FORMATS.CAMT053,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Israeli CSV parser (multi-bank auto-detect)
// ══════════════════════════════════════════════════════════════════════

/** Simple, dependency-free CSV splitter that respects double-quoted fields. */
function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

/** Find the first row that looks like a header (contains a known date token). */
function findHeaderRow(rows) {
  const dateTokens = ['תאריך', 'Date'];
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i];
    if (row.some(c => dateTokens.some(t => c && c.includes(t)))) return i;
  }
  return 0;
}

/** Return the column index in `headers` matching any of the candidate strings. */
function findColumn(headers, candidates) {
  for (const cand of candidates) {
    const idx = headers.findIndex(h =>
      h && h.replace(/\s+/g, '').toLowerCase() === cand.replace(/\s+/g, '').toLowerCase()
    );
    if (idx !== -1) return idx;
  }
  // Fuzzy contains
  for (const cand of candidates) {
    const idx = headers.findIndex(h =>
      h && h.replace(/\s+/g, '').toLowerCase().includes(cand.replace(/\s+/g, '').toLowerCase())
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Identify bank id from either the CSV text (first ~2KB) or header columns. */
function detectIsraeliBank(text, headers) {
  const haystack = (text.slice(0, 2048) + ' ' + headers.join(' ')).toLowerCase();
  for (const bank of Object.values(ISRAELI_BANKS)) {
    if (bank.tokens.some(t => haystack.includes(t.toLowerCase()))) {
      return bank;
    }
  }
  // Fallback: Hapoalim (matches the existing fixture style)
  return ISRAELI_BANKS.hapoalim;
}

function parseCsvIsraeli(text) {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, '');
  const rawRows = clean.split(/\r?\n/).filter(l => l.length > 0);
  if (rawRows.length < 2) throw new Error('CSV-IL: need at least header + 1 row');

  const rows = rawRows.map(splitCsvLine);
  const headerIdx = findHeaderRow(rows);
  const headers = rows[headerIdx];
  const bank = detectIsraeliBank(text, headers);

  const colDate = findColumn(headers, bank.headers.date);
  const colValueDate = findColumn(headers, bank.headers.valueDate);
  const colDesc = findColumn(headers, bank.headers.description);
  const colRef = findColumn(headers, bank.headers.reference);
  const colDebit = findColumn(headers, bank.headers.debit);
  const colCredit = findColumn(headers, bank.headers.credit);
  const colAmount = findColumn(headers, bank.headers.amount);
  const colBalance = findColumn(headers, bank.headers.balance);

  if (colDate === -1) {
    throw new Error(`CSV-IL (${bank.name}): could not find date column in headers ${JSON.stringify(headers)}`);
  }
  const hasAmount = colAmount !== -1 || colDebit !== -1 || colCredit !== -1;
  if (!hasAmount) {
    throw new Error(`CSV-IL (${bank.name}): could not find any amount column`);
  }

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;
    const dateStr = row[colDate];
    const date = parseDateFlexible(dateStr);
    if (!date) continue;

    let amount;
    if (colAmount !== -1 && row[colAmount]) {
      amount = parseAmountFlexible(row[colAmount]);
    } else {
      const debit = colDebit !== -1 ? parseAmountFlexible(row[colDebit]) : 0;
      const credit = colCredit !== -1 ? parseAmountFlexible(row[colCredit]) : 0;
      amount = credit - debit;
    }

    out.push({
      _format: SOURCE_FORMATS.CSV_IL,
      bank: bank.id,
      bankName: bank.name,
      transaction_date: date,
      value_date: colValueDate !== -1 ? parseDateFlexible(row[colValueDate]) : null,
      description: colDesc !== -1 ? row[colDesc] : '',
      reference: colRef !== -1 ? row[colRef] : null,
      amount,
      currency: 'ILS',
      balance: colBalance !== -1 ? parseAmountFlexible(row[colBalance]) : null,
    });
  }

  if (out.length === 0) {
    throw new Error(`CSV-IL (${bank.name}): no valid transactions parsed`);
  }
  return out;
}

function normalizeCsvIsraeli(raw) {
  return {
    transaction_date: raw.transaction_date,
    value_date: raw.value_date || null,
    description: (raw.description || '').trim(),
    reference: raw.reference || null,
    amount: raw.amount,
    currency: raw.currency || 'ILS',
    balance: typeof raw.balance === 'number' ? raw.balance : null,
    type: raw.amount >= 0 ? 'credit' : 'debit',
    counterparty_name: null,
    counterparty_iban: null,
    external_id: raw.reference || null,
    source_format: SOURCE_FORMATS.CSV_IL,
    bank: raw.bank,
  };
}

// ══════════════════════════════════════════════════════════════════════
// PDF parser (optional — soft dependency on pdf-parse)
// ══════════════════════════════════════════════════════════════════════

/**
 * Attempts to extract transactions from a bank statement PDF. We try to
 * `require('pdf-parse')` lazily; if it's not installed the function throws
 * a clearly worded error with `code: 'PDF_UNSUPPORTED'`. Callers that want
 * to gracefully skip PDF should catch on that code.
 *
 * The extractor is heuristic: we split the text into lines and look for
 * patterns like "DD/MM/YYYY description ... amount [balance]".
 */
async function parsePdf(buffer) {
  let pdfParse;
  try {
    // eslint-disable-next-line global-require
    pdfParse = require('pdf-parse');
  } catch (err) {
    const e = new Error(
      'PDF parsing requires the `pdf-parse` package. Install it with `npm install pdf-parse`.'
    );
    e.code = 'PDF_UNSUPPORTED';
    throw e;
  }

  const result = await pdfParse(buffer);
  const text = result.text || '';
  const lines = text.split(/\r?\n/);

  // Line regex:
  //   dd/mm/yyyy  <description>  <amount>  [<balance>]
  // Amounts may carry ₪ and use comma thousands. Balance is optional.
  const lineRe =
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(.+?)\s+([₪\s\d,.()\-]+?)(?:\s+([₪\s\d,.()\-]+))?$/;

  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(lineRe);
    if (!m) continue;

    const date = parseDateFlexible(m[1]);
    if (!date) continue;

    const amount = parseAmountFlexible(m[3]);
    const balance = m[4] ? parseAmountFlexible(m[4]) : null;

    out.push({
      _format: SOURCE_FORMATS.PDF,
      transaction_date: date,
      value_date: null,
      description: m[2].trim(),
      reference: null,
      amount,
      currency: detectCurrency(line, 'ILS'),
      balance,
    });
  }

  if (out.length === 0) {
    throw new Error('PDF: no transaction-like lines found in extracted text');
  }
  return out;
}

function normalizePdf(raw) {
  return {
    transaction_date: raw.transaction_date,
    value_date: null,
    description: raw.description || '',
    reference: null,
    amount: raw.amount,
    currency: raw.currency || 'ILS',
    balance: raw.balance,
    type: raw.amount >= 0 ? 'credit' : 'debit',
    counterparty_name: null,
    counterparty_iban: null,
    external_id: null,
    source_format: SOURCE_FORMATS.PDF,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Top-level API
// ══════════════════════════════════════════════════════════════════════

/**
 * Dispatch a raw transaction into the common schema based on `format`.
 */
function normalizeTransaction(raw, format) {
  const fmt = format || raw._format || raw.source_format;
  switch (fmt) {
    case SOURCE_FORMATS.OFX: return normalizeOfx(raw);
    case SOURCE_FORMATS.QIF: return normalizeQif(raw);
    case SOURCE_FORMATS.MT940: return normalizeMt940(raw);
    case SOURCE_FORMATS.CAMT053: return normalizeCamt053(raw);
    case SOURCE_FORMATS.CSV_IL: return normalizeCsvIsraeli(raw);
    case SOURCE_FORMATS.PDF: return normalizePdf(raw);
    default:
      throw new Error(`normalizeTransaction: unknown format "${fmt}"`);
  }
}

/**
 * Parse a bank statement and return an array of normalized transactions.
 * If `format` is omitted it is auto-detected via detectFormat(buffer).
 *
 * Synchronous for all formats EXCEPT 'pdf' (which returns a Promise).
 * For consistency, callers can always `await parseStatement(...)`.
 */
function parseStatement(buffer, format) {
  const detected = format || detectFormat(buffer);

  if (detected === SOURCE_FORMATS.PDF) {
    // PDF path is async
    return parsePdf(buffer).then(rows => rows.map(r => normalizeTransaction(r, SOURCE_FORMATS.PDF)));
  }

  const text = bufferToString(buffer);
  let rawRows;
  switch (detected) {
    case SOURCE_FORMATS.OFX:     rawRows = parseOfx(text); break;
    case SOURCE_FORMATS.QIF:     rawRows = parseQif(text); break;
    case SOURCE_FORMATS.MT940:   rawRows = parseMt940Raw(text); break;
    case SOURCE_FORMATS.CAMT053: rawRows = parseCamt053(text); break;
    case SOURCE_FORMATS.CSV_IL:  rawRows = parseCsvIsraeli(text); break;
    default:
      throw new Error(`parseStatement: unsupported / unknown format "${detected}"`);
  }

  return rawRows.map(r => normalizeTransaction(r, detected));
}

// ══════════════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  SOURCE_FORMATS,
  ISRAELI_BANKS,

  // Top-level API
  detectFormat,
  parseStatement,
  normalizeTransaction,

  // Per-format parsers (exposed for targeted tests / advanced callers)
  parseOfx,
  parseQif,
  parseMt940Raw,
  parseCamt053,
  parseCsvIsraeli,
  parsePdf,

  // Per-format normalisers
  normalizeOfx,
  normalizeQif,
  normalizeMt940,
  normalizeCamt053,
  normalizeCsvIsraeli,
  normalizePdf,

  // Internal helpers (exposed for testing / reuse)
  _internal: {
    bufferToString,
    decodeWindows1255,
    parseDateFlexible,
    parseAmountFlexible,
    detectCurrency,
    xmlTag,
    xmlTagAll,
    xmlAttr,
    xmlDecode,
    splitCsvLine,
    findColumn,
    detectIsraeliBank,
  },
};
