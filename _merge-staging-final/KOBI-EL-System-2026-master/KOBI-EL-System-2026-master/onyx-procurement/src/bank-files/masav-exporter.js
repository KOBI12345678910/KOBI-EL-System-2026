/* ============================================================================
 * Techno-Kol ERP — Masav (מס"ב) Bank File Exporter
 * Agent X-50 / Swarm 3C / Kobi's mega-ERP for Techno-Kol Uzi
 * ----------------------------------------------------------------------------
 * מס"ב — מרכז סליקה בנקאי (Israeli interbank mass clearing centre).
 *
 * This module builds, validates, exports and parses the fixed-width "Masav"
 * file format used by Israeli banks for bulk payments (salaries, supplier
 * payments, standing orders) and bulk collections (direct debits).
 *
 * Format reference
 *   - 120-character fixed-width records, one per line
 *   - Record types:
 *        1 = Header   (sender institution, batch, date, purpose)
 *        2 = Detail   (recipient bank/branch/account + amount + name + id)
 *        9 = Trailer  (record count, total amount, control hash)
 *   - All numeric fields are right-justified and left-padded with '0'
 *   - All alpha fields are left-justified and right-padded with ' '
 *   - Amounts are stored in aggurot (1/100 NIS) as 11-digit zero-padded ints
 *   - Text is emitted in ASCII (letters/digits/punct) — Hebrew names are
 *     transliterated when `opts.encoding === 'ascii'` (default) or kept in
 *     CP862 when `opts.encoding === 'cp862'` (legacy mainframe charset).
 *
 * Variants supported
 *   - 'payment'     → debit from us to N recipients
 *   - 'collection'  → debit from N payers to us
 *   - 'returns'     → response file from the bank (parsed, not written)
 *
 * Public API (all exports at the bottom of this file)
 *   createBatch({ sender, type, date, purpose?, encoding? }) → batchId
 *   addPayment(batchId, line)                                → void
 *   validateBatch(batchId)                                   → { valid, errors }
 *   exportFile(batchId)                                      → { file_content, line_count, total_amount }
 *   parseReturnFile(content)                                 → { confirmations, rejections }
 *   buildSummary(batchId, outPath?)                          → { path, bytes }
 *   ISRAELI_BANKS                                            → Object map
 *   RECORD_TYPE                                              → Object enum
 *   BATCH_TYPE                                               → Object enum
 *   _internal                                                → helpers for tests
 *
 * Zero dependencies — uses only `node:crypto`, `node:fs`, `node:path`, `node:os`.
 * Never deletes batches; `cancelBatch` only marks `state = 'cancelled'`.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/* ----------------------------------------------------------------------------
 * Constants — Israeli bank codes (seed list)
 * -------------------------------------------------------------------------- */

const ISRAELI_BANKS = Object.freeze({
  '04': { he: 'בנק יהב',             en: 'Yahav',            active: true },
  '09': { he: 'בנק הדואר',            en: 'Postal Bank',       active: true },
  '10': { he: 'בנק לאומי',            en: 'Leumi',             active: true },
  '11': { he: 'בנק דיסקונט',          en: 'Discount',          active: true },
  '12': { he: 'בנק הפועלים',          en: 'Hapoalim',          active: true },
  '13': { he: 'בנק אגוד',             en: 'Igud',              active: false },
  '14': { he: 'אוצר החייל',            en: 'Otzar HaChayal',    active: true },
  '17': { he: 'בנק מרכנתיל דיסקונט',   en: 'Mercantile',        active: true },
  '20': { he: 'בנק מזרחי טפחות',       en: 'Mizrahi Tefahot',   active: true },
  '26': { he: 'יובנק',                en: 'UBank (Union)',     active: true },
  '31': { he: 'הבנק הבינלאומי',        en: 'First Intl',        active: true },
  '34': { he: 'בנק ערבי ישראלי',       en: 'Arab-Israel',       active: true },
  '46': { he: 'בנק מסד',              en: 'Massad',            active: true },
  '52': { he: 'בנק פועלי אגודת ישראל', en: 'Poalei Agudat',     active: true },
  '54': { he: 'בנק ירושלים',          en: 'Jerusalem',         active: true },
  '68': { he: 'מזרחי טפחות (68)',      en: 'Mizrahi (68)',      active: true },
  '77': { he: 'בנק ירושלים (77)',      en: 'Jerusalem (77)',    active: true },
});

const RECORD_TYPE = Object.freeze({
  HEADER: '1',
  DETAIL: '2',
  TRAILER: '9',
});

const BATCH_TYPE = Object.freeze({
  PAYMENT: 'payment',       // we debit ourselves to pay others
  COLLECTION: 'collection', // we debit others to collect from them
  RETURNS: 'returns',       // bank response file (parsed only)
});

const BATCH_STATE = Object.freeze({
  DRAFT: 'draft',
  VALIDATED: 'validated',
  EXPORTED: 'exported',
  CANCELLED: 'cancelled',
});

const RECORD_LENGTH = 120;
const MAX_DETAIL_LINES = 999999; // format cap

/* ----------------------------------------------------------------------------
 * In-memory batch store (module-local; swap-in adapter supported)
 * -------------------------------------------------------------------------- */

const _store = new Map();
let _counter = 0;

function _nextBatchId() {
  _counter += 1;
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `MSB-${ts}-${_counter}-${rnd}`;
}

/* ----------------------------------------------------------------------------
 * Low-level field padders
 * -------------------------------------------------------------------------- */

function padNumeric(value, width) {
  const n = String(value == null ? 0 : value).replace(/[^0-9]/g, '');
  if (n.length > width) {
    throw new RangeError(`padNumeric: value "${value}" (${n.length}d) exceeds width ${width}`);
  }
  return n.padStart(width, '0');
}

function padAlpha(value, width) {
  let s = String(value == null ? '' : value);
  if (s.length > width) s = s.slice(0, width);
  return s.padEnd(width, ' ');
}

/**
 * Hebrew → ASCII transliteration (simple map). Masav files going over legacy
 * ASCII channels cannot carry Unicode Hebrew reliably, so we flatten names
 * to upper-case Latin approximations by default. When `encoding === 'cp862'`
 * we pass through the original text.
 */
const HE_TRANSLIT = Object.freeze({
  'א': 'A', 'ב': 'B', 'ג': 'G', 'ד': 'D', 'ה': 'H', 'ו': 'V', 'ז': 'Z',
  'ח': 'CH', 'ט': 'T', 'י': 'Y', 'כ': 'K', 'ך': 'K', 'ל': 'L', 'מ': 'M',
  'ם': 'M', 'נ': 'N', 'ן': 'N', 'ס': 'S', 'ע': 'A', 'פ': 'P', 'ף': 'P',
  'צ': 'TZ', 'ץ': 'TZ', 'ק': 'Q', 'ר': 'R', 'ש': 'SH', 'ת': 'T',
});

function transliterateHebrew(str) {
  if (!str) return '';
  let out = '';
  for (const ch of String(str)) {
    if (HE_TRANSLIT[ch]) out += HE_TRANSLIT[ch];
    else if (/[A-Za-z0-9 .,\-'/]/.test(ch)) out += ch.toUpperCase();
    else if (ch === '"' || ch === '\u05f4') out += "'"; // gershayim → apostrophe
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

function normaliseName(name, encoding) {
  if (encoding === 'cp862') return String(name || '').trim();
  return transliterateHebrew(name);
}

/* ----------------------------------------------------------------------------
 * Validators
 * -------------------------------------------------------------------------- */

function isValidBankCode(code) {
  const key = padNumeric(code, 2);
  const k3  = padNumeric(code, 3).slice(-2);
  return Object.prototype.hasOwnProperty.call(ISRAELI_BANKS, key) ||
         Object.prototype.hasOwnProperty.call(ISRAELI_BANKS, k3);
}

/**
 * Israeli ID (ת"ז) Luhn-like check.  Accepts strings/numbers up to 9 digits.
 * Company IDs (ח.פ.) use the same algorithm.  Pad-left with zeros to 9.
 */
function isValidIsraeliId(id) {
  const raw = String(id || '').replace(/\D/g, '');
  if (raw.length === 0 || raw.length > 9) return false;
  const padded = raw.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(padded[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

function isPositiveAmount(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function formatDateYYMMDD(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) {
    throw new TypeError(`formatDateYYMMDD: invalid date ${d}`);
  }
  const yy = String(dt.getFullYear() % 100).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/* ----------------------------------------------------------------------------
 * Record builders — fixed-width 120 char layout
 *
 * Header (type 1) layout:
 *    pos  1     (1)  : record type = '1'
 *    pos  2-4   (3)  : sender institution code (bank 3 digits)
 *    pos  5-12  (8)  : sender branch + account composite (left ID, right ref)
 *    pos 13-21  (9)  : sender company id (ח.פ)
 *    pos 22-27  (6)  : batch serial (zero-padded)
 *    pos 28-33  (6)  : creation date YYMMDD
 *    pos 34-39  (6)  : value date YYMMDD (usually same as creation)
 *    pos 40-41  (2)  : batch type code (01 = payment, 02 = collection)
 *    pos 42-71  (30) : purpose text
 *    pos 72-120 (49) : filler (spaces)
 *
 * Detail (type 2) layout:
 *    pos  1     (1)  : record type = '2'
 *    pos  2-4   (3)  : recipient bank code
 *    pos  5-7   (3)  : recipient branch code
 *    pos  8-20  (13) : recipient account number
 *    pos 21-24  (4)  : filler
 *    pos 25-35  (11) : amount in aggurot
 *    pos 36-55  (20) : recipient name (20 chars)
 *    pos 56-64  (9)  : recipient id / ח.פ
 *    pos 65-74  (10) : reference / invoice
 *    pos 75-80  (6)  : transaction code (0 = normal, 8 = cancel, etc.)
 *    pos 81-120 (40) : filler
 *
 * Trailer (type 9) layout:
 *    pos  1     (1)  : record type = '9'
 *    pos  2-4   (3)  : sender institution code (repeat)
 *    pos  5-10  (6)  : batch serial
 *    pos 11-16  (6)  : creation date YYMMDD
 *    pos 17-22  (6)  : total detail record count
 *    pos 23-35  (13) : total amount aggurot
 *    pos 36-51  (16) : control hash (sum of key fields, zero-padded)
 *    pos 52-120 (69) : filler
 * -------------------------------------------------------------------------- */

function buildHeaderRecord(batch) {
  const typeCode = batch.type === BATCH_TYPE.PAYMENT ? '01'
                 : batch.type === BATCH_TYPE.COLLECTION ? '02' : '09';
  const parts = [];
  parts.push(RECORD_TYPE.HEADER);                                        // 1
  parts.push(padNumeric(batch.sender.bank,   3));                        // 3
  parts.push(padNumeric(batch.sender.branch, 3));                        // 3
  parts.push(padNumeric(batch.sender.account, 5));                       // 5
  parts.push(padNumeric(batch.sender.id,     9));                        // 9
  parts.push(padNumeric(batch.serial,        6));                        // 6
  parts.push(formatDateYYMMDD(batch.date));                              // 6
  parts.push(formatDateYYMMDD(batch.valueDate || batch.date));           // 6
  parts.push(typeCode);                                                  // 2
  parts.push(padAlpha(normaliseName(batch.purpose || '', batch.encoding), 30)); // 30
  let record = parts.join('');
  if (record.length > RECORD_LENGTH) {
    throw new RangeError(`header overflow: ${record.length} > ${RECORD_LENGTH}`);
  }
  record = record.padEnd(RECORD_LENGTH, ' ');
  return record;
}

function buildDetailRecord(batch, line, idx) {
  const parts = [];
  parts.push(RECORD_TYPE.DETAIL);                                        // 1
  parts.push(padNumeric(line.bank,    3));                               // 3
  parts.push(padNumeric(line.branch,  3));                               // 3
  parts.push(padNumeric(line.account, 13));                              // 13
  parts.push(padNumeric(idx + 1,      4));                               // 4   serial within batch
  const aggurot = Math.round(line.amount * 100);
  parts.push(padNumeric(aggurot, 11));                                   // 11
  parts.push(padAlpha(normaliseName(line.name, batch.encoding), 20));    // 20
  parts.push(padNumeric(line.id, 9));                                    // 9
  parts.push(padAlpha(line.reference || '', 10));                        // 10
  parts.push(padNumeric(line.txCode || 0, 6));                           // 6
  let record = parts.join('');
  if (record.length > RECORD_LENGTH) {
    throw new RangeError(`detail overflow: ${record.length} > ${RECORD_LENGTH}`);
  }
  record = record.padEnd(RECORD_LENGTH, ' ');
  return record;
}

function buildTrailerRecord(batch, lines, controlHash) {
  const totalAggurot = lines.reduce((acc, ln) => acc + Math.round(ln.amount * 100), 0);
  const parts = [];
  parts.push(RECORD_TYPE.TRAILER);                                       // 1
  parts.push(padNumeric(batch.sender.bank, 3));                          // 3
  parts.push(padNumeric(batch.serial,      6));                          // 6
  parts.push(formatDateYYMMDD(batch.date));                              // 6
  parts.push(padNumeric(lines.length,      6));                          // 6
  parts.push(padNumeric(totalAggurot,      13));                         // 13
  parts.push(padNumeric(controlHash,       16));                         // 16
  let record = parts.join('');
  if (record.length > RECORD_LENGTH) {
    throw new RangeError(`trailer overflow: ${record.length} > ${RECORD_LENGTH}`);
  }
  record = record.padEnd(RECORD_LENGTH, ' ');
  return record;
}

/**
 * Control hash: sum of (bank + branch + account + aggurot) mod 10^16.
 * This is the classic "check sum" that Masav uses to detect truncation.
 */
function computeControlHash(lines) {
  let acc = 0n;
  for (const ln of lines) {
    const bank    = BigInt(padNumeric(ln.bank, 3));
    const branch  = BigInt(padNumeric(ln.branch, 3));
    const account = BigInt(padNumeric(ln.account, 13));
    const amount  = BigInt(Math.round(ln.amount * 100));
    acc += bank + branch + account + amount;
  }
  const mod = 10000000000000000n; // 16 digits
  return (acc % mod).toString();
}

/* ----------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

/**
 * Create a new batch.
 * @param {object} cfg
 * @param {object} cfg.sender  — { bank, branch, account, id, name }
 * @param {string} cfg.type    — one of BATCH_TYPE.*
 * @param {Date|string} cfg.date
 * @param {string} [cfg.purpose]
 * @param {'ascii'|'cp862'} [cfg.encoding='ascii']
 * @returns {string} batchId
 */
function createBatch(cfg) {
  if (!cfg || typeof cfg !== 'object') {
    throw new TypeError('createBatch: cfg object required');
  }
  const { sender, type, date, purpose, encoding, valueDate, serial } = cfg;
  if (!sender || typeof sender !== 'object') {
    throw new TypeError('createBatch: sender required');
  }
  for (const k of ['bank', 'branch', 'account', 'id', 'name']) {
    if (!sender[k] && sender[k] !== 0) {
      throw new TypeError(`createBatch: sender.${k} required`);
    }
  }
  if (type !== BATCH_TYPE.PAYMENT && type !== BATCH_TYPE.COLLECTION) {
    throw new TypeError(`createBatch: invalid type "${type}"`);
  }
  if (!date) {
    throw new TypeError('createBatch: date required');
  }
  if (!isValidBankCode(sender.bank)) {
    throw new RangeError(`createBatch: unknown sender bank code "${sender.bank}"`);
  }

  const id = _nextBatchId();
  const batch = {
    id,
    sender:   { ...sender },
    type,
    date:     new Date(date),
    valueDate: valueDate ? new Date(valueDate) : null,
    purpose:  purpose || (type === BATCH_TYPE.PAYMENT ? 'PAYMENT BATCH' : 'COLLECTION BATCH'),
    encoding: encoding || 'ascii',
    serial:   serial || (Math.floor(Date.now() / 1000) % 1000000),
    lines:    [],
    state:    BATCH_STATE.DRAFT,
    createdAt: new Date(),
    exportedAt: null,
  };
  _store.set(id, batch);
  return id;
}

/**
 * Append a payment/collection line to the batch.
 * @param {string} batchId
 * @param {object} line — { bank, branch, account, amount, name, id, reference, txCode? }
 */
function addPayment(batchId, line) {
  const batch = _store.get(batchId);
  if (!batch) throw new Error(`addPayment: unknown batchId ${batchId}`);
  if (batch.state === BATCH_STATE.EXPORTED) {
    throw new Error(`addPayment: batch ${batchId} already exported (immutable)`);
  }
  if (batch.state === BATCH_STATE.CANCELLED) {
    throw new Error(`addPayment: batch ${batchId} is cancelled`);
  }
  if (!line || typeof line !== 'object') {
    throw new TypeError('addPayment: line object required');
  }
  const required = ['bank', 'branch', 'account', 'amount', 'name', 'id'];
  for (const k of required) {
    if (line[k] == null || line[k] === '') {
      throw new TypeError(`addPayment: line.${k} required`);
    }
  }
  if (batch.lines.length >= MAX_DETAIL_LINES) {
    throw new RangeError(`addPayment: batch at max capacity (${MAX_DETAIL_LINES})`);
  }
  batch.lines.push({
    bank:      String(line.bank),
    branch:    String(line.branch),
    account:   String(line.account),
    amount:    Number(line.amount),
    name:      String(line.name),
    id:        String(line.id),
    reference: line.reference != null ? String(line.reference) : '',
    txCode:    line.txCode != null ? Number(line.txCode) : 0,
  });
  // addPayment returns void per spec
}

/**
 * Validate a batch: checks bank codes, Luhn IDs, positive amounts,
 * duplicate references, and name length.
 * @param {string} batchId
 * @returns {{valid:boolean, errors:Array<{index?:number, field?:string, message:string}>}}
 */
function validateBatch(batchId) {
  const batch = _store.get(batchId);
  if (!batch) throw new Error(`validateBatch: unknown batchId ${batchId}`);

  const errors = [];

  // Sender checks
  if (!isValidBankCode(batch.sender.bank)) {
    errors.push({ field: 'sender.bank', message: `unknown bank code ${batch.sender.bank}` });
  }
  if (!isValidIsraeliId(batch.sender.id)) {
    errors.push({ field: 'sender.id', message: `invalid sender company id ${batch.sender.id}` });
  }

  // Must have lines
  if (batch.lines.length === 0) {
    errors.push({ field: 'lines', message: 'batch has no detail lines' });
  }

  // Per-line checks
  const seenRefs = new Set();
  batch.lines.forEach((ln, idx) => {
    if (!isValidBankCode(ln.bank)) {
      errors.push({ index: idx, field: 'bank', message: `unknown recipient bank ${ln.bank}` });
    }
    if (!/^[0-9]{1,3}$/.test(ln.branch)) {
      errors.push({ index: idx, field: 'branch', message: `branch must be 1-3 digits` });
    }
    if (!/^[0-9]{1,13}$/.test(ln.account)) {
      errors.push({ index: idx, field: 'account', message: `account must be 1-13 digits` });
    }
    if (!isPositiveAmount(ln.amount)) {
      errors.push({ index: idx, field: 'amount', message: `amount must be > 0` });
    }
    if (ln.amount > 99999999.99) {
      errors.push({ index: idx, field: 'amount', message: `amount exceeds 11-digit aggurot field` });
    }
    if (!ln.name || ln.name.trim().length === 0) {
      errors.push({ index: idx, field: 'name', message: `name required` });
    }
    if (!isValidIsraeliId(ln.id)) {
      errors.push({ index: idx, field: 'id', message: `invalid Israeli ID ${ln.id}` });
    }
    if (ln.reference) {
      if (seenRefs.has(ln.reference)) {
        errors.push({ index: idx, field: 'reference', message: `duplicate reference ${ln.reference}` });
      } else {
        seenRefs.add(ln.reference);
      }
    }
  });

  const valid = errors.length === 0;
  if (valid && batch.state === BATCH_STATE.DRAFT) {
    batch.state = BATCH_STATE.VALIDATED;
  }
  return { valid, errors };
}

/**
 * Assemble the full Masav file text.
 * Does NOT write to disk — caller decides where to put the file.
 * @param {string} batchId
 * @returns {{file_content:string, line_count:number, total_amount:number, control_hash:string, batch_id:string}}
 */
function exportFile(batchId) {
  const batch = _store.get(batchId);
  if (!batch) throw new Error(`exportFile: unknown batchId ${batchId}`);
  if (batch.state === BATCH_STATE.CANCELLED) {
    throw new Error(`exportFile: batch ${batchId} cancelled`);
  }

  // Force validation first; export refuses on errors.
  const v = validateBatch(batchId);
  if (!v.valid) {
    const msg = v.errors.slice(0, 5).map((e) => `[${e.index ?? '*'}] ${e.field}: ${e.message}`).join('; ');
    throw new Error(`exportFile: batch invalid — ${msg}`);
  }

  const lines = batch.lines;
  const controlHash = computeControlHash(lines);

  const out = [];
  out.push(buildHeaderRecord(batch));
  for (let i = 0; i < lines.length; i++) {
    out.push(buildDetailRecord(batch, lines[i], i));
  }
  out.push(buildTrailerRecord(batch, lines, controlHash));

  // Sanity: every record exactly 120 chars
  for (let i = 0; i < out.length; i++) {
    if (out[i].length !== RECORD_LENGTH) {
      throw new RangeError(`exportFile: record ${i} has length ${out[i].length} (expected ${RECORD_LENGTH})`);
    }
  }

  const fileContent = out.join('\n') + '\n';
  const totalAggurot = lines.reduce((a, ln) => a + Math.round(ln.amount * 100), 0);
  const totalAmount = totalAggurot / 100;

  batch.state = BATCH_STATE.EXPORTED;
  batch.exportedAt = new Date();
  batch.exportHash = crypto.createHash('sha256').update(fileContent).digest('hex');
  batch.controlHash = controlHash;

  return {
    file_content: fileContent,
    line_count: out.length,         // header + details + trailer
    detail_count: lines.length,
    total_amount: totalAmount,
    control_hash: controlHash,
    batch_id: batchId,
    sha256: batch.exportHash,
  };
}

/**
 * Parse a Masav "return" response file from the bank. Each detail record
 * carries a "reason code" in the tx-code slot; 000 = confirmed, anything
 * else (00x, 0xx) is a rejection reason.
 *
 * @param {string} content
 * @returns {{confirmations: Array, rejections: Array, header: object|null, trailer: object|null}}
 */
function parseReturnFile(content) {
  if (typeof content !== 'string') {
    throw new TypeError('parseReturnFile: content must be a string');
  }
  const rawLines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const confirmations = [];
  const rejections = [];
  let header = null;
  let trailer = null;

  for (const raw of rawLines) {
    // Pad short lines so slice() doesn't crash — never truncate, never mutate
    const line = raw.length >= RECORD_LENGTH ? raw : raw.padEnd(RECORD_LENGTH, ' ');
    const type = line.charAt(0);

    if (type === RECORD_TYPE.HEADER) {
      header = {
        senderBank:   line.slice(1, 4).trim(),
        senderBranch: line.slice(4, 7).trim(),
        senderAccount:line.slice(7, 12).trim(),
        senderId:     line.slice(12, 21).trim(),
        serial:       line.slice(21, 27).trim(),
        date:         line.slice(27, 33).trim(),
        valueDate:    line.slice(33, 39).trim(),
        type:         line.slice(39, 41).trim(),
        purpose:      line.slice(41, 71).trim(),
      };
    } else if (type === RECORD_TYPE.DETAIL) {
      const bank    = line.slice(1, 4).trim();
      const branch  = line.slice(4, 7).trim();
      const account = line.slice(7, 20).trim();
      const serial  = line.slice(20, 24).trim();
      const aggurot = Number(line.slice(24, 35));
      const name    = line.slice(35, 55).trim();
      const id      = line.slice(55, 64).trim();
      const reference = line.slice(64, 74).trim();
      const txCode  = line.slice(74, 80).trim();
      const entry = {
        bank,
        branch,
        account,
        serial: Number(serial || 0),
        amount: aggurot / 100,
        name,
        id,
        reference,
        txCode,
        reasonCode: txCode,
      };
      // Reason 0 / 000 / 000000 = confirmed; everything else = rejected
      if (/^0+$/.test(txCode) || txCode === '') {
        confirmations.push(entry);
      } else {
        entry.reason = _rejectReasonText(txCode);
        rejections.push(entry);
      }
    } else if (type === RECORD_TYPE.TRAILER) {
      trailer = {
        senderBank: line.slice(1, 4).trim(),
        serial:     line.slice(4, 10).trim(),
        date:       line.slice(10, 16).trim(),
        count:      Number(line.slice(16, 22)),
        totalAggurot: Number(line.slice(22, 35)),
        controlHash: line.slice(35, 51).trim(),
      };
    }
  }

  return { confirmations, rejections, header, trailer };
}

function _rejectReasonText(code) {
  // Real Masav uses 3-digit reason codes; pad/normalise first.
  const c = String(code || '').replace(/^0+/, '') || '0';
  const TABLE = {
    '1':   'חשבון לא קיים / Account not found',
    '2':   'חשבון סגור / Account closed',
    '3':   'יתרה לא מספקת / Insufficient funds',
    '4':   'מוטב נפטר / Beneficiary deceased',
    '5':   'מס"ב מסרב לחיוב / Masav debit refused',
    '6':   'הוראה בוטלה / Standing order cancelled',
    '7':   'פרטי חשבון שגויים / Invalid account details',
    '8':   'סניף סגור / Branch closed',
    '9':   'זיהוי לקוח לא תקין / Invalid customer ID',
    '10':  'שם מוטב לא תואם / Beneficiary name mismatch',
    '99':  'שגיאה טכנית / Technical error',
  };
  return TABLE[c] || `קוד דחייה ${code} / Reject code ${code}`;
}

/**
 * Build a human-readable summary PDF (minimal PDF 1.4 writer, zero deps).
 * Returns the output path + byte size.
 *
 * @param {string} batchId
 * @param {string} [outPath] — optional explicit path; default = os.tmpdir()
 * @returns {{ path: string, bytes: number }}
 */
function buildSummary(batchId, outPath) {
  const batch = _store.get(batchId);
  if (!batch) throw new Error(`buildSummary: unknown batchId ${batchId}`);

  const lines = batch.lines;
  const total = lines.reduce((a, ln) => a + Math.round(ln.amount * 100), 0) / 100;
  const hash = batch.controlHash || computeControlHash(lines);
  const senderLabel = normaliseName(batch.sender.name || '', 'ascii');

  const body = [];
  body.push(`MASAV BATCH SUMMARY`);
  body.push(`-----------------------------------------`);
  body.push(`Batch ID:      ${batch.id}`);
  body.push(`Type:          ${batch.type}`);
  body.push(`State:         ${batch.state}`);
  body.push(`Sender:        ${senderLabel} (bank ${batch.sender.bank}/${batch.sender.branch})`);
  body.push(`Sender ID:     ${batch.sender.id}`);
  body.push(`Date:          ${batch.date.toISOString().slice(0, 10)}`);
  body.push(`Lines:         ${lines.length}`);
  body.push(`Total Amount:  ${total.toFixed(2)} NIS`);
  body.push(`Control Hash:  ${hash}`);
  body.push(`Purpose:       ${normaliseName(batch.purpose || '', 'ascii')}`);
  body.push(``);
  body.push(`# | Bank | Branch | Account       | Amount NIS    | Name`);
  lines.slice(0, 25).forEach((ln, i) => {
    const row = [
      String(i + 1).padStart(3, ' '),
      String(ln.bank).padStart(3, '0'),
      String(ln.branch).padStart(3, '0'),
      String(ln.account).padStart(13, '0'),
      ln.amount.toFixed(2).padStart(12, ' '),
      normaliseName(ln.name, 'ascii').slice(0, 20),
    ].join(' | ');
    body.push(row);
  });
  if (lines.length > 25) body.push(`... (${lines.length - 25} more)`);

  const pdfBytes = _renderMinimalPdf(body);

  const file = outPath || path.join(os.tmpdir(), `masav-${batch.id}.pdf`);
  fs.writeFileSync(file, pdfBytes);
  return { path: file, bytes: pdfBytes.length };
}

/**
 * Minimal PDF 1.4 writer — one page, Courier 10pt, text-only.
 * Not a full PDF library; good enough for human-readable batch summaries.
 */
function _renderMinimalPdf(textLines) {
  // Escape per PDF spec (paren / backslash)
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const pageWidth = 612;  // 8.5 x 72
  const pageHeight = 792;
  const startY = 760;
  const lineHeight = 12;

  let stream = 'BT\n/F1 10 Tf\n';
  textLines.forEach((ln, i) => {
    const y = startY - (i * lineHeight);
    stream += `1 0 0 1 36 ${y} Tm\n(${esc(ln)}) Tj\n`;
  });
  stream += 'ET\n';

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  objects.push(`<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}endstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  let out = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out, 'binary'));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, 'binary');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, 'binary');
}

/**
 * Cancel a batch — marks state, never deletes.
 */
function cancelBatch(batchId, reason) {
  const batch = _store.get(batchId);
  if (!batch) throw new Error(`cancelBatch: unknown batchId ${batchId}`);
  if (batch.state === BATCH_STATE.EXPORTED) {
    throw new Error(`cancelBatch: batch ${batchId} already exported — cannot cancel`);
  }
  batch.state = BATCH_STATE.CANCELLED;
  batch.cancelReason = reason || '';
  batch.cancelledAt = new Date();
}

function getBatch(batchId) {
  const batch = _store.get(batchId);
  if (!batch) return null;
  // Return a shallow copy so callers don't mutate internal state directly
  return {
    id: batch.id,
    sender: { ...batch.sender },
    type: batch.type,
    date: batch.date,
    valueDate: batch.valueDate,
    purpose: batch.purpose,
    encoding: batch.encoding,
    serial: batch.serial,
    state: batch.state,
    lineCount: batch.lines.length,
    lines: batch.lines.map((l) => ({ ...l })),
    createdAt: batch.createdAt,
    exportedAt: batch.exportedAt,
    controlHash: batch.controlHash || null,
    sha256: batch.exportHash || null,
  };
}

function listBatches(filter) {
  const out = [];
  for (const b of _store.values()) {
    if (filter && filter.state && b.state !== filter.state) continue;
    if (filter && filter.type && b.type !== filter.type) continue;
    out.push({
      id: b.id,
      type: b.type,
      state: b.state,
      lineCount: b.lines.length,
      date: b.date,
    });
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */

module.exports = {
  // Public API
  createBatch,
  addPayment,
  validateBatch,
  exportFile,
  parseReturnFile,
  buildSummary,
  cancelBatch,
  getBatch,
  listBatches,

  // Constants
  ISRAELI_BANKS,
  RECORD_TYPE,
  BATCH_TYPE,
  BATCH_STATE,
  RECORD_LENGTH,

  // Internals exposed for unit tests
  _internal: {
    padNumeric,
    padAlpha,
    transliterateHebrew,
    normaliseName,
    isValidBankCode,
    isValidIsraeliId,
    isPositiveAmount,
    formatDateYYMMDD,
    buildHeaderRecord,
    buildDetailRecord,
    buildTrailerRecord,
    computeControlHash,
    _renderMinimalPdf,
    _store,
  },
};
