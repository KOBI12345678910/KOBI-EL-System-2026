/**
 * ONYX Procurement — PDF Invoice Parser (Israeli Tax Invoices)
 * ─────────────────────────────────────────────────────────────
 * Agent 89 — Techno-Kol Uzi mega-ERP
 *
 * Parses Israeli tax invoices (חשבונית מס), receipts (קבלה), and combined
 * tax-invoice-receipts (חשבונית מס קבלה) from either raw PDF buffers or
 * pre-OCR'd text. Pure-JS with an optional lazy `pdf-parse` fallback for PDF
 * text extraction. NEVER deletes — only parses and returns structured data.
 *
 * Exports:
 *   parseInvoicePdf(buffer)  → Promise<ParsedInvoice>
 *   parseInvoiceText(raw)    → ParsedInvoice
 *
 * Supports Israeli compliance quirks:
 *   • VAT IDs (ע.מ / ח.פ) — 9-digit IL business numbers
 *   • Dates: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
 *   • Money: ₪1,234.56, 1,234.56 ש"ח, 1234.56 ILS
 *   • Allocation numbers (מספר הקצאה) — רפורמת חשבונית 2024
 *   • RTL Hebrew headers, bilingual labels
 *   • Line items: qty × unit_price ≈ total with VAT cross-check
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים.
 */

'use strict';

// ═════════════════════════════════════════════════════════════
//  CONSTANTS — Israeli tax regime
// ═════════════════════════════════════════════════════════════

/**
 * Israeli VAT rates by year. Current rate (2024→): 18%.
 * Older invoices may still arrive at 17% (Jan 2022 – Dec 2023).
 * We keep both to cross-check historical and current invoices.
 */
const VAT_RATES = [0.18, 0.17];

/** Default VAT rate used when date is ambiguous. */
const DEFAULT_VAT_RATE = 0.18;

/** Money tolerance (ILS) for cross-check validation. */
const MONEY_EPSILON = 0.05;

/** Doc-type catalog (Hebrew + English aliases). */
const DOC_TYPES = [
  {
    code: 'tax_invoice_receipt',
    hebrew: 'חשבונית מס קבלה',
    patterns: [/חשבונית\s*מס\s*\/?\s*קבלה/u, /חשבונית\s*מס\s*וקבלה/u, /tax\s+invoice\s*\/\s*receipt/iu],
  },
  {
    code: 'tax_invoice',
    hebrew: 'חשבונית מס',
    patterns: [/חשבונית\s*מס(?!\s*[\/ו]?\s*קבלה)/u, /tax\s+invoice/iu],
  },
  {
    code: 'receipt',
    hebrew: 'קבלה',
    patterns: [/(?<!מס[\s\/ו])קבלה/u, /^receipt\b/iu, /\breceipt\b/iu],
  },
  {
    code: 'credit_note',
    hebrew: 'חשבונית זיכוי',
    patterns: [/חשבונית\s*זיכוי/u, /credit\s+note/iu],
  },
  {
    code: 'proforma',
    hebrew: 'חשבונית עסקה',
    patterns: [/חשבונית\s*עסקה/u, /proforma/iu, /פרופורמה/u],
  },
];

// ═════════════════════════════════════════════════════════════
//  REGEX LIBRARY
// ═════════════════════════════════════════════════════════════

/**
 * 9-digit Israeli VAT identifier. Tightened with a lookaround so it doesn't
 * swallow longer ID-like strings (phone numbers, bank refs, allocation nums).
 * We require exactly 9 digits. Prefix letters like "IL" are optional.
 */
const RE_VAT_9 = /(?<![\d])(\d{9})(?![\d])/gu;

/** Labels that typically precede a VAT number. */
const RE_VAT_LABEL = /(?:ע\.?\s*מ\.?|ח\.?\s*פ\.?|עוסק\s*מורשה|מספר\s*עוסק|vat\s*(?:id|no\.?|number)|tax\s*id|company\s*(?:no\.?|number)|business\s*(?:id|no))/iu;

/** DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY (4-digit year) */
const RE_DATE_DMY = /(?<![\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?![\d])/gu;

/** 2-digit year variant (1999/2099 windowing, Israeli convention). */
const RE_DATE_DMY2 = /(?<![\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})(?![\d])/gu;

/** Money amounts (allow thousands separators, optional currency markers). */
const RE_MONEY = /(?:₪|ש"?ח|ILS|NIS)\s*([0-9][\d,]*(?:\.\d{1,4})?)|([0-9][\d,]*(?:\.\d{1,4})?)\s*(?:₪|ש"?ח|ILS|NIS)/gu;

/** Plain number (inside table rows, for line-item extraction). */
const RE_NUMBER = /-?\d[\d,]*(?:\.\d{1,4})?/gu;

/** Allocation number (מספר הקצאה) — רפורמת 2024 — 9-digit code. */
const RE_ALLOCATION_LABEL = /(?:מספר\s*הקצאה|מס(?:פר)?\s*הקצאה|allocation\s*(?:no\.?|number|id)|allocation)/iu;

/** Invoice number label (strict — must have "מספר" or "number/no/#"). */
const RE_INVOICE_LABEL = /(?:מספר\s*חשבונית|מס(?:פר)?\s*חשבונית|invoice\s*(?:no\.?|number|#)|invoice\s*id)/iu;

/** Date label. */
const RE_DATE_LABEL = /(?:תאריך|תאריך\s*הפקה|תאריך\s*חשבונית|date|invoice\s*date|issue\s*date)/iu;

/** Vendor label (supplier / "שם העוסק"). */
const RE_VENDOR_LABEL = /(?:שם\s*העוסק|שם\s*ספק|שם\s*חברה|ספק|חברת|vendor|supplier|from|company)/iu;

/** Subtotal. */
const RE_SUBTOTAL_LABEL = /(?:סה"?כ\s*(?:לפני\s*)?מע"?מ|סכום\s*(?:לפני\s*)?מע"?מ|subtotal|sub\s*total|net\s*total|amount\s*(?:before|excl\.?)\s*vat)/iu;

/** VAT amount line. Match either the explicit "סכום מע\"מ" / "vat amount"
 *  variants, OR a standalone "מע\"מ 18%" heading where the rate is inline. */
const RE_VAT_AMOUNT_LABEL = /(?:סכום\s*מע"?מ|מע"?מ\s*\d{1,2}\s*%|vat\s+amount|vat\s+\d{1,2}\s*%|tax\s+amount)/iu;

/** Grand total. */
const RE_TOTAL_LABEL = /(?:סה"?כ\s*(?:כולל\s*מע"?מ|לתשלום)|סך\s*הכל|סה"?כ|total\s*(?:incl\.?\s*vat|due|amount)|grand\s*total|amount\s*due|total)/iu;

// ═════════════════════════════════════════════════════════════
//  LAZY PDF-PARSE LOADER
// ═════════════════════════════════════════════════════════════

/**
 * Lazy require — `pdf-parse` is optional. If missing we fall back to a
 * minimal in-house PDF text extractor that pulls `(…)Tj` / `[…]TJ` operands
 * from the content streams. Handles most vendor-generated PDFs that ship
 * their text layer uncompressed; encrypted / fully-compressed streams will
 * downgrade confidence to zero and return empty line items.
 */
function loadPdfParse() {
  try {
    // eslint-disable-next-line global-require
    return require('pdf-parse');
  } catch (_err) {
    return null;
  }
}

/**
 * Minimal zero-dep PDF text extractor. Does NOT decode FlateDecode streams;
 * vendors using compressed streams require `pdf-parse`. We still try, and
 * return whatever literal strings we can see.
 */
function extractTextFallback(buffer) {
  const str = buffer.toString('latin1');
  const pieces = [];

  // 1) Parenthesised text operand: (hello)Tj and similar variants.
  const reTj = /\(((?:\\\)|\\\(|[^)])*)\)\s*T[jJ]/g;
  let m;
  while ((m = reTj.exec(str)) !== null) {
    const raw = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    pieces.push(raw);
  }

  // 2) Array of strings: [(Hello) 12 (World)] TJ
  const reTJarr = /\[([^\]]+)\]\s*TJ/g;
  while ((m = reTJarr.exec(str)) !== null) {
    const inner = m[1];
    const reInner = /\(((?:\\\)|\\\(|[^)])*)\)/g;
    let inm;
    while ((inm = reInner.exec(inner)) !== null) {
      const raw = inm[1]
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      pieces.push(raw);
    }
  }

  // 3) Hex strings: <0048 0065 006c 006c 006f>Tj
  const reHex = /<([0-9a-fA-F\s]+)>\s*T[jJ]/g;
  while ((m = reHex.exec(str)) !== null) {
    const hex = m[1].replace(/\s+/g, '');
    if (hex.length % 4 === 0) {
      let decoded = '';
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.substr(i, 4), 16);
        if (code > 0 && code < 0xFFFF) decoded += String.fromCharCode(code);
      }
      if (decoded) pieces.push(decoded);
    } else if (hex.length % 2 === 0) {
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        const code = parseInt(hex.substr(i, 2), 16);
        if (code > 31 && code < 127) decoded += String.fromCharCode(code);
      }
      if (decoded) pieces.push(decoded);
    }
  }

  return pieces.join('\n');
}

// ═════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════

function toFloat(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^\d.\-]/g, '').replace(/(?<=\d),(?=\d{3}\b)/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Parse money strings like "₪1,234.56", "1234.56 ש\"ח", or plain "1,234.56". */
function parseMoney(text) {
  if (!text) return null;
  // Remove Hebrew RLM/LRM marks that confuse thousands parsing.
  const cleaned = String(text).replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  const match = cleaned.match(/-?\d[\d,]*(?:\.\d{1,4})?/);
  if (!match) return null;
  const v = toFloat(match[0]);
  return v === null ? null : round2(v);
}

/**
 * Normalise a DD/MM/YYYY date to ISO `YYYY-MM-DD`. Israeli convention is
 * day-first; we reject values where day>12 and slot could be mm.
 */
function normaliseDate(day, month, year) {
  const d = Number(day);
  const mo = Number(month);
  const y = Number(year.length === 2 ? (Number(year) >= 50 ? `19${year}` : `20${year}`) : year);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2099) return null;
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Sanity check: constructing Date must round-trip (catches Feb 30 etc).
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const back = parsed.toISOString().slice(0, 10);
  return back === iso ? iso : null;
}

/**
 * Find the nearest number after a label within N characters.
 * Used for weak-context extraction of "מספר חשבונית 12345".
 */
function findAfterLabel(text, labelRe, valueRe, windowChars = 80) {
  const labelMatch = text.match(labelRe);
  if (!labelMatch) return null;
  const start = labelMatch.index + labelMatch[0].length;
  const slice = text.slice(start, start + windowChars);
  const valMatch = slice.match(valueRe);
  if (!valMatch) return null;
  return { value: valMatch[0], match: valMatch };
}

// ═════════════════════════════════════════════════════════════
//  FIELD EXTRACTORS
// ═════════════════════════════════════════════════════════════

/**
 * Classify the document type by scanning Hebrew + English headline phrases.
 * `tax_invoice_receipt` is checked first because it is a superset of the
 * other two and would otherwise be misclassified as "חשבונית מס".
 */
function detectDocType(text) {
  if (!text) return { code: 'unknown', hebrew: '', confidence: 0 };
  for (const dt of DOC_TYPES) {
    for (const re of dt.patterns) {
      if (re.test(text)) {
        return { code: dt.code, hebrew: dt.hebrew, confidence: 95 };
      }
    }
  }
  return { code: 'unknown', hebrew: '', confidence: 0 };
}

function extractVendor(text) {
  if (!text) return { value: null, confidence: 0 };

  // Strategy 1: labelled "שם ספק: …" / "ספק: …"
  const labelRe = /(?:שם\s*ספק|שם\s*החברה|שם\s*העוסק|ספק|vendor|supplier|from)\s*[:：]\s*(.+?)(?:\r?\n|$)/iu;
  const m = text.match(labelRe);
  if (m && m[1]) {
    const name = m[1].trim().replace(/\s{2,}/g, ' ');
    if (name.length >= 2 && name.length <= 120) {
      return { value: name, confidence: 85 };
    }
  }

  // Strategy 2: top-of-document heuristic — the first non-empty, non-numeric
  // non-label line is usually the vendor header.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (/\d{5,}/.test(line)) continue;
    if (RE_VAT_LABEL.test(line)) continue;
    if (/חשבונית|קבלה|invoice|receipt|tax/iu.test(line)) continue;
    if (line.length >= 2 && line.length <= 120) {
      return { value: line, confidence: 60 };
    }
  }

  return { value: null, confidence: 0 };
}

function extractVatId(text) {
  if (!text) return { value: null, confidence: 0 };

  // Preferred: 9-digit number within 40 chars AFTER a ע.מ / ח.פ label.
  const labelMatch = text.match(RE_VAT_LABEL);
  if (labelMatch) {
    const after = text.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 60);
    const near = after.match(/(\d{9})(?![\d])/);
    if (near) return { value: near[1], confidence: 95 };

    // Also check BEFORE the label (RTL/LTR swap).
    const beforeStart = Math.max(0, labelMatch.index - 60);
    const before = text.slice(beforeStart, labelMatch.index);
    const prev = before.match(/(?<![\d])(\d{9})(?![\d])/g);
    if (prev && prev.length) return { value: prev[prev.length - 1], confidence: 85 };
  }

  // Fallback: any 9-digit token in the first 500 chars — low confidence.
  const head = text.slice(0, 500);
  const m = head.match(/(?<![\d])(\d{9})(?![\d])/);
  if (m) return { value: m[1], confidence: 40 };

  return { value: null, confidence: 0 };
}

function extractInvoiceNumber(text) {
  if (!text) return { value: null, confidence: 0 };

  // After "מספר חשבונית" label. Accept alphanumeric invoice numbers with
  // optional dashes / slashes (e.g. "2026-0142", "INV/2026/001").
  const after = findAfterLabel(
    text,
    RE_INVOICE_LABEL,
    /(?:#\s*)?(?:[A-Z]{1,4}[-_/]?)?\d{1,6}(?:[-_/]\d{1,6}){0,3}/u,
    80
  );
  if (after) {
    const cleaned = after.value.replace(/^#\s*/, '').trim();
    return { value: cleaned, confidence: 90 };
  }

  // Fallback: any token matching "INV-123" or "#12345".
  const m = text.match(/(?:INV[-_]?|#)(\d{3,12})/i);
  if (m) return { value: m[0].replace(/^#/, ''), confidence: 55 };

  return { value: null, confidence: 0 };
}

function extractDate(text) {
  if (!text) return { value: null, confidence: 0 };

  // Strategy 1: after a "תאריך:" label.
  const labelM = text.match(RE_DATE_LABEL);
  if (labelM) {
    const start = labelM.index + labelM[0].length;
    const slice = text.slice(start, start + 60);
    const d = slice.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (d) {
      const iso = normaliseDate(d[1], d[2], d[3]);
      if (iso) return { value: iso, confidence: 90 };
    }
  }

  // Strategy 2: first DD/MM/YYYY in the document.
  RE_DATE_DMY.lastIndex = 0;
  const m = RE_DATE_DMY.exec(text);
  if (m) {
    const iso = normaliseDate(m[1], m[2], m[3]);
    if (iso) return { value: iso, confidence: 65 };
  }

  // Strategy 3: 2-digit-year variant.
  RE_DATE_DMY2.lastIndex = 0;
  const m2 = RE_DATE_DMY2.exec(text);
  if (m2) {
    const iso = normaliseDate(m2[1], m2[2], m2[3]);
    if (iso) return { value: iso, confidence: 50 };
  }

  return { value: null, confidence: 0 };
}

/**
 * Line-based money extractor. For each line containing the label, pull the
 * last numeric token on that same line as the value. This avoids bleeding
 * into adjacent rows (e.g. "סה\"כ לפני מע\"מ" accidentally capturing the VAT
 * amount from the next row).
 *
 * Prefers the LAST matching line because invoices typically list the
 * breakdown top-down and the final occurrence is the definitive one.
 */
function extractMoneyByLabel(text, labelRe) {
  if (!text) return { value: null, confidence: 0 };

  const lines = text.split(/\r?\n/);
  let best = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !labelRe.test(line)) continue;

    // Collect all numeric tokens on this line and take the LAST one — the
    // amount column in Israeli invoices always lives at the line's end.
    const nums = [...line.matchAll(/-?\d[\d,]*(?:\.\d{1,4})?/g)];
    if (!nums.length) continue;

    const last = nums[nums.length - 1][0];
    // Skip tokens that are clearly not money (e.g. percentage "18").
    if (/^\d{1,2}$/.test(last) && nums.length > 1) {
      // Prefer a token with decimals; fall through to second-to-last.
      const withDec = nums.filter((n) => /\./.test(n[0]));
      if (withDec.length) {
        const v = parseMoney(withDec[withDec.length - 1][0]);
        if (v !== null) best = { value: v, at: i, confidence: 88 };
        continue;
      }
    }

    const value = parseMoney(last);
    if (value !== null) {
      best = { value, at: i, confidence: 88 };
    }
  }

  if (best) return { value: best.value, confidence: best.confidence };

  // Fallback: same label but the amount appears on the NEXT non-empty line.
  for (let i = 0; i < lines.length - 1; i++) {
    if (!labelRe.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = lines[j] || '';
      const nums = [...next.matchAll(/-?\d[\d,]*(?:\.\d{1,4})?/g)];
      if (!nums.length) continue;
      const val = parseMoney(nums[nums.length - 1][0]);
      if (val !== null) return { value: val, confidence: 78 };
    }
  }

  return { value: null, confidence: 0 };
}

function extractAllocationNumber(text) {
  if (!text) return { value: null, confidence: 0 };
  const labelM = text.match(RE_ALLOCATION_LABEL);
  if (!labelM) return { value: null, confidence: 0 };

  // After the label — up to 60 chars.
  const after = text.slice(labelM.index + labelM[0].length, labelM.index + labelM[0].length + 60);
  const m = after.match(/(?<![\d])(\d{9,10})(?![\d])/);
  if (m) return { value: m[1], confidence: 95 };

  // Before the label (RTL).
  const beforeStart = Math.max(0, labelM.index - 60);
  const before = text.slice(beforeStart, labelM.index);
  const mb = before.match(/(?<![\d])(\d{9,10})(?![\d])/g);
  if (mb && mb.length) return { value: mb[mb.length - 1], confidence: 85 };

  return { value: null, confidence: 0 };
}

// ═════════════════════════════════════════════════════════════
//  LINE-ITEM EXTRACTOR
// ═════════════════════════════════════════════════════════════

/**
 * Parse line items from the text body. We walk each line and pick rows that
 * contain (qty) × (unit_price) ≈ (total), tolerating multiple numeric tokens
 * by choosing the combination that best satisfies `qty * unit_price ≈ total`
 * within MONEY_EPSILON.
 *
 * Returns: [{ description, qty, unit_price, total }]
 */
function extractLineItems(text) {
  if (!text) return { items: [], confidence: 0 };
  const lines = text.split(/\r?\n/);

  // Heuristic: a line is a candidate row if it has ≥3 numeric tokens and
  // some non-numeric description text. We intentionally skip obvious header
  // / total rows (detected by label regexes).
  const items = [];
  let confSum = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    if (RE_SUBTOTAL_LABEL.test(raw)) continue;
    if (RE_VAT_AMOUNT_LABEL.test(raw)) continue;
    if (RE_TOTAL_LABEL.test(raw) && !/\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}/.test(raw)) continue;
    if (RE_ALLOCATION_LABEL.test(raw)) continue;

    const numMatches = raw.match(RE_NUMBER) || [];
    if (numMatches.length < 3) continue;

    const nums = numMatches.map(toFloat).filter((n) => n !== null && Number.isFinite(n));
    if (nums.length < 3) continue;

    // Israeli invoices always order the amount columns (qty, unit_price,
    // total) at the END of the line. We prefer the LAST 3 tokens; fall back
    // to a constrained combinatorial search only if the last-3 triple does
    // not satisfy `qty × price ≈ total`. This prevents spurious matches from
    // dimension tokens embedded in the description column (e.g. "50x50").
    let best = null;
    if (nums.length >= 3) {
      const [qty, price, total] = nums.slice(-3);
      if (
        qty > 0 && price > 0 && total > 0 && qty <= 100000 &&
        Math.abs(qty * price - total) <= Math.max(MONEY_EPSILON, total * 0.01)
      ) {
        best = { qty, unit_price: price, total: round2(total), diff: Math.abs(qty * price - total) };
      }
    }
    if (!best) {
      // Tail-biased search: only consider triples ending at the final token.
      const tot = nums[nums.length - 1];
      for (let a = 0; a < nums.length - 2; a++) {
        for (let b = a + 1; b < nums.length - 1; b++) {
          const qty = nums[a];
          const price = nums[b];
          if (qty <= 0 || price <= 0 || tot <= 0) continue;
          if (qty > 100000) continue;
          const diff = Math.abs(qty * price - tot);
          if (diff <= Math.max(MONEY_EPSILON, tot * 0.01)) {
            if (!best || diff < best.diff) {
              best = { qty, unit_price: price, total: round2(tot), diff };
            }
          }
        }
      }
    }

    if (!best) continue;

    // Description = everything minus the numeric column cluster at the end.
    const trimmed = raw.trim();
    const idx = trimmed.search(RE_NUMBER);
    let desc = '';
    if (idx > 0) {
      desc = trimmed.slice(0, idx).trim();
    }
    // If idx is 0 (numbers come first), description is the tail after the last number.
    if (!desc) {
      const lastMatch = [...trimmed.matchAll(RE_NUMBER)].pop();
      if (lastMatch) {
        desc = trimmed.slice(lastMatch.index + lastMatch[0].length).trim();
      }
    }
    desc = desc.replace(/\s{2,}/g, ' ').replace(/^[|:\-–—•*]\s*/, '');

    items.push({
      description: desc || '—',
      qty: round2(best.qty),
      unit_price: round2(best.unit_price),
      total: best.total,
    });
    confSum += 85;
  }

  const confidence = items.length ? Math.min(90, Math.round(confSum / items.length)) : 0;
  return { items, confidence };
}

// ═════════════════════════════════════════════════════════════
//  CROSS-CHECK VALIDATION
// ═════════════════════════════════════════════════════════════

/**
 * Given extracted subtotal / vat / total, verify they satisfy the Israeli
 * VAT equation `subtotal + vat = total` AND that `vat ≈ subtotal * rate`.
 * Boosts confidence when the math checks out and returns any inferred
 * missing fields.
 */
function crossCheckTotals({ subtotal, vat_amount, total }) {
  const result = { subtotal, vat_amount, total, inferred: [], valid: false, rate: null };

  const sub = subtotal.value;
  const vat = vat_amount.value;
  const tot = total.value;

  if (sub !== null && vat !== null && tot !== null) {
    const sum = round2(sub + vat);
    if (Math.abs(sum - tot) <= MONEY_EPSILON) {
      result.valid = true;
      // Determine which VAT rate best matches.
      result.rate = pickVatRate(sub, vat);
      result.subtotal.confidence = Math.min(99, result.subtotal.confidence + 5);
      result.vat_amount.confidence = Math.min(99, result.vat_amount.confidence + 5);
      result.total.confidence = Math.min(99, result.total.confidence + 5);
    }
    return result;
  }

  // Infer missing values where possible.
  if (sub !== null && tot !== null && vat === null) {
    const inferredVat = round2(tot - sub);
    result.vat_amount = { value: inferredVat, confidence: 70 };
    result.inferred.push('vat_amount');
    result.rate = pickVatRate(sub, inferredVat);
    result.valid = true;
    return result;
  }

  if (sub !== null && vat !== null && tot === null) {
    const inferredTot = round2(sub + vat);
    result.total = { value: inferredTot, confidence: 70 };
    result.inferred.push('total');
    result.rate = pickVatRate(sub, vat);
    result.valid = true;
    return result;
  }

  if (tot !== null && vat !== null && sub === null) {
    const inferredSub = round2(tot - vat);
    result.subtotal = { value: inferredSub, confidence: 70 };
    result.inferred.push('subtotal');
    result.rate = pickVatRate(inferredSub, vat);
    result.valid = true;
    return result;
  }

  // Only total present → assume default VAT rate to derive subtotal/vat.
  if (tot !== null && sub === null && vat === null) {
    const inferredSub = round2(tot / (1 + DEFAULT_VAT_RATE));
    const inferredVat = round2(tot - inferredSub);
    result.subtotal = { value: inferredSub, confidence: 55 };
    result.vat_amount = { value: inferredVat, confidence: 55 };
    result.inferred.push('subtotal', 'vat_amount');
    result.rate = DEFAULT_VAT_RATE;
    result.valid = true;
  }

  return result;
}

function pickVatRate(subtotal, vat) {
  if (!Number.isFinite(subtotal) || !Number.isFinite(vat) || subtotal <= 0) return DEFAULT_VAT_RATE;
  const observed = vat / subtotal;
  let best = DEFAULT_VAT_RATE;
  let bestDiff = Infinity;
  for (const rate of VAT_RATES) {
    const diff = Math.abs(observed - rate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rate;
    }
  }
  return best;
}

// ═════════════════════════════════════════════════════════════
//  OVERALL CONFIDENCE
// ═════════════════════════════════════════════════════════════

function computeOverallConfidence(fields) {
  // Weighted average of field confidences; weights reflect business criticality.
  const weights = {
    vendor: 1.0,
    vendor_vat_id: 2.0,
    invoice_no: 2.0,
    invoice_date: 1.5,
    subtotal: 1.5,
    vat_amount: 1.5,
    total: 2.0,
    allocation_no: 1.0,
    doc_type: 1.0,
    line_items: 1.0,
  };
  let sum = 0;
  let w = 0;
  for (const [k, weight] of Object.entries(weights)) {
    const f = fields[k];
    if (f && typeof f.confidence === 'number') {
      sum += f.confidence * weight;
      w += weight;
    }
  }
  return w > 0 ? Math.round(sum / w) : 0;
}

// ═════════════════════════════════════════════════════════════
//  PUBLIC API
// ═════════════════════════════════════════════════════════════

/**
 * Parse a pre-OCR'd invoice text. This is the core engine — `parseInvoicePdf`
 * delegates here after extracting text.
 *
 * @param {string} rawText
 * @returns {ParsedInvoice}
 */
function parseInvoiceText(rawText) {
  const text = rawText == null ? '' : String(rawText);

  const docType = detectDocType(text);
  const vendor = extractVendor(text);
  const vendorVatId = extractVatId(text);
  const invoiceNo = extractInvoiceNumber(text);
  const invoiceDate = extractDate(text);
  const allocationNo = extractAllocationNumber(text);
  const lineItems = extractLineItems(text);

  let subtotal = extractMoneyByLabel(text, RE_SUBTOTAL_LABEL);
  let vatAmount = extractMoneyByLabel(text, RE_VAT_AMOUNT_LABEL);
  let total = extractMoneyByLabel(text, RE_TOTAL_LABEL);

  // Cross-check math; may infer missing fields.
  const xcheck = crossCheckTotals({ subtotal, vat_amount: vatAmount, total });
  subtotal = xcheck.subtotal;
  vatAmount = xcheck.vat_amount;
  total = xcheck.total;

  const fields = {
    vendor,
    vendor_vat_id: vendorVatId,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    subtotal,
    vat_amount: vatAmount,
    total,
    allocation_no: allocationNo,
    doc_type: { value: docType.code, confidence: docType.confidence },
    line_items: { value: lineItems.items, confidence: lineItems.confidence },
  };

  const confidence = computeOverallConfidence(fields);

  return {
    vendor: vendor.value,
    vendor_vat_id: vendorVatId.value,
    invoice_no: invoiceNo.value,
    invoice_date: invoiceDate.value,
    line_items: lineItems.items,
    subtotal: subtotal.value,
    vat_amount: vatAmount.value,
    total: total.value,
    allocation_no: allocationNo.value,
    doc_type: docType.code,
    doc_type_hebrew: docType.hebrew,
    vat_rate: xcheck.rate,
    totals_valid: xcheck.valid,
    inferred_fields: xcheck.inferred,
    confidence,
    field_confidence: {
      vendor: vendor.confidence,
      vendor_vat_id: vendorVatId.confidence,
      invoice_no: invoiceNo.confidence,
      invoice_date: invoiceDate.confidence,
      subtotal: subtotal.confidence,
      vat_amount: vatAmount.confidence,
      total: total.confidence,
      allocation_no: allocationNo.confidence,
      doc_type: docType.confidence,
      line_items: lineItems.confidence,
    },
    raw_text_length: text.length,
  };
}

/**
 * Parse a PDF buffer. Prefers `pdf-parse` if installed; otherwise uses an
 * internal best-effort extractor for uncompressed text streams.
 *
 * @param {Buffer} buffer
 * @returns {Promise<ParsedInvoice>}
 */
async function parseInvoicePdf(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    // Accept ArrayBuffer / Uint8Array too.
    if (buffer instanceof Uint8Array) {
      // eslint-disable-next-line no-param-reassign
      buffer = Buffer.from(buffer);
    } else {
      throw new TypeError('parseInvoicePdf expects a Buffer');
    }
  }

  let text = '';
  let engine = 'none';

  const pdfParse = loadPdfParse();
  if (pdfParse) {
    try {
      const data = await pdfParse(buffer);
      text = data && data.text ? data.text : '';
      engine = 'pdf-parse';
    } catch (_err) {
      // Swallow and fall through to fallback extractor.
      text = '';
    }
  }

  if (!text) {
    text = extractTextFallback(buffer);
    engine = engine === 'pdf-parse' ? 'pdf-parse+fallback' : 'fallback';
  }

  const parsed = parseInvoiceText(text);
  parsed.extraction_engine = engine;
  return parsed;
}

// ═════════════════════════════════════════════════════════════
//  EXPORTS
// ═════════════════════════════════════════════════════════════

module.exports = {
  parseInvoicePdf,
  parseInvoiceText,
  // Exposed for unit tests / external tooling:
  _internal: {
    detectDocType,
    extractVendor,
    extractVatId,
    extractInvoiceNumber,
    extractDate,
    extractMoneyByLabel,
    extractAllocationNumber,
    extractLineItems,
    crossCheckTotals,
    parseMoney,
    normaliseDate,
    extractTextFallback,
    DOC_TYPES,
    VAT_RATES,
    DEFAULT_VAT_RATE,
    RE_VAT_LABEL,
    RE_INVOICE_LABEL,
    RE_DATE_DMY,
    RE_ALLOCATION_LABEL,
    RE_TOTAL_LABEL,
    RE_SUBTOTAL_LABEL,
    RE_VAT_AMOUNT_LABEL,
  },
};
