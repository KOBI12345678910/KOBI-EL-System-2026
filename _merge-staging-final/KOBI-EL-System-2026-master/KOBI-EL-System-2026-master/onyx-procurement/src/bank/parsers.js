/**
 * Bank Statement Parsers
 * Wave 1.5 — B-11 fix
 *
 * Supports:
 *   - CSV (generic, Israeli bank variants via hints)
 *   - MT940 (SWIFT standard used by most Israeli banks for corporate exports)
 *   - Excel (.xlsx) — deferred to future milestone
 *
 * Each parser returns:
 *   { transactions: [...], openingBalance, closingBalance, period: {start, end}, meta }
 */

'use strict';

const { parse: parseCsv } = require('csv-parse/sync');

// ═══ CSV PARSER (Israeli bank variants) ═══

const CSV_COLUMN_HINTS = {
  date: ['תאריך', 'תאריך העסקה', 'Date', 'Transaction Date', 'Value Date', 'תאריך ערך'],
  description: ['תיאור', 'פרטים', 'Description', 'Narrative', 'פירוט התנועה'],
  amount: ['סכום', 'Amount', 'חובה/זכות', 'Debit/Credit'],
  debit: ['חובה', 'Debit', 'חוב'],
  credit: ['זכות', 'Credit', 'זכ'],
  balance: ['יתרה', 'Balance', 'יתרה לאחר תנועה'],
  reference: ['אסמכתא', 'Reference', 'מס תנועה'],
  counterparty: ['שם המעביר', 'שם הצד שכנגד', 'Counterparty'],
};

function matchColumn(headers, hintSet) {
  for (const hint of hintSet) {
    const idx = headers.findIndex(h => h && h.trim().toLowerCase() === hint.toLowerCase());
    if (idx !== -1) return idx;
  }
  // Fuzzy match
  for (const hint of hintSet) {
    const idx = headers.findIndex(h => h && h.toLowerCase().includes(hint.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(str) {
  if (!str) return null;
  // Try dd/mm/yyyy (Israeli) first
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    const day = parseInt(m1[1]);
    const month = parseInt(m1[2]);
    let year = parseInt(m1[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Try yyyy-mm-dd
  const m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, '0')}-${String(m2[3]).padStart(2, '0')}`;
  return null;
}

function parseNumber(str) {
  if (str === null || str === undefined || str === '') return 0;
  if (typeof str === 'number') return str;
  // Remove thousands separators, handle Hebrew minus, negative in parens
  let clean = String(str).trim().replace(/[₪,\s]/g, '');
  const neg = clean.startsWith('(') && clean.endsWith(')') || clean.startsWith('-');
  clean = clean.replace(/[()\-]/g, '');
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function parseCsvStatement(content, options = {}) {
  const records = parseCsv(content, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });

  if (records.length < 2) throw new Error('CSV too short — expected header + data rows');

  // Detect header row — first row with any known hint
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, records.length); i++) {
    const row = records[i];
    const hasDate = matchColumn(row, CSV_COLUMN_HINTS.date) !== -1;
    const hasAmount = matchColumn(row, CSV_COLUMN_HINTS.amount) !== -1 ||
                      matchColumn(row, CSV_COLUMN_HINTS.debit) !== -1;
    if (hasDate && hasAmount) { headerIdx = i; break; }
  }
  const headers = records[headerIdx];

  const colDate = matchColumn(headers, CSV_COLUMN_HINTS.date);
  const colDesc = matchColumn(headers, CSV_COLUMN_HINTS.description);
  const colAmt = matchColumn(headers, CSV_COLUMN_HINTS.amount);
  const colDebit = matchColumn(headers, CSV_COLUMN_HINTS.debit);
  const colCredit = matchColumn(headers, CSV_COLUMN_HINTS.credit);
  const colBalance = matchColumn(headers, CSV_COLUMN_HINTS.balance);
  const colRef = matchColumn(headers, CSV_COLUMN_HINTS.reference);

  if (colDate === -1) throw new Error('Could not locate date column');
  if (colAmt === -1 && colDebit === -1 && colCredit === -1) {
    throw new Error('Could not locate amount column(s)');
  }

  const transactions = [];
  for (let i = headerIdx + 1; i < records.length; i++) {
    const row = records[i];
    const date = parseDate(row[colDate]);
    if (!date) continue;

    let amount;
    if (colAmt !== -1) {
      amount = parseNumber(row[colAmt]);
    } else {
      const debit = colDebit !== -1 ? parseNumber(row[colDebit]) : 0;
      const credit = colCredit !== -1 ? parseNumber(row[colCredit]) : 0;
      amount = credit - debit;
    }

    transactions.push({
      transaction_date: date,
      description: colDesc !== -1 ? row[colDesc] : '',
      amount,
      balance_after: colBalance !== -1 ? parseNumber(row[colBalance]) : null,
      reference_number: colRef !== -1 ? row[colRef] : null,
      raw_data: { row, headers },
    });
  }

  if (transactions.length === 0) {
    throw new Error('No valid transactions parsed from CSV');
  }

  const dates = transactions.map(t => t.transaction_date).sort();
  const openingBalance = options.openingBalance ?? 0;
  const amountSum = transactions.reduce((s, t) => s + t.amount, 0);

  return {
    transactions,
    openingBalance,
    closingBalance: openingBalance + amountSum,
    period: { start: dates[0], end: dates[dates.length - 1] },
    meta: { format: 'csv', rowCount: transactions.length },
  };
}

// ═══ MT940 PARSER ═══

function parseMt940Statement(content) {
  // MT940 uses :tag: format lines
  const lines = content.split(/\r?\n/);
  const result = {
    transactions: [],
    openingBalance: 0,
    closingBalance: 0,
    period: { start: null, end: null },
    meta: { format: 'mt940' },
  };

  let accountNum = null;
  let currentTx = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tagMatch = line.match(/^:(\d{2}[A-Z]?):(.*)/);

    if (tagMatch) {
      const tag = tagMatch[1];
      const val = tagMatch[2];

      switch (tag) {
        case '25':
          accountNum = val.trim();
          result.meta.accountNumber = accountNum;
          break;
        case '60F':
        case '60M': {
          const m = val.match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)/);
          if (m) {
            const amt = parseFloat(m[4].replace(',', '.'));
            result.openingBalance = m[1] === 'D' ? -amt : amt;
            const yy = parseInt(m[2].slice(0, 2));
            const mm = parseInt(m[2].slice(2, 4));
            const dd = parseInt(m[2].slice(4, 6));
            result.period.start = `20${String(yy).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
          }
          break;
        }
        case '61': {
          // :61:YYMMDDMMDD[CD]amount,N...
          const m = val.match(/^(\d{6})(\d{4})?([CD])([NR]?)([\d,]+)([A-Z]\d{3})(.*)/);
          if (m) {
            const yy = parseInt(m[1].slice(0, 2));
            const mm = parseInt(m[1].slice(2, 4));
            const dd = parseInt(m[1].slice(4, 6));
            const date = `20${String(yy).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
            const sign = m[3] === 'D' ? -1 : 1;
            const amount = sign * parseFloat(m[5].replace(',', '.'));
            currentTx = {
              transaction_date: date,
              amount,
              description: '',
              reference_number: (m[7] || '').trim(),
              raw_data: { tag61: val },
            };
            result.transactions.push(currentTx);
          }
          break;
        }
        case '86':
          // :86:description (multi-line)
          if (currentTx) currentTx.description = val;
          break;
        case '62F':
        case '62M': {
          const m = val.match(/^([CD])(\d{6})([A-Z]{3})([\d,]+)/);
          if (m) {
            const amt = parseFloat(m[4].replace(',', '.'));
            result.closingBalance = m[1] === 'D' ? -amt : amt;
            const yy = parseInt(m[2].slice(0, 2));
            const mm = parseInt(m[2].slice(2, 4));
            const dd = parseInt(m[2].slice(4, 6));
            result.period.end = `20${String(yy).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
          }
          break;
        }
      }
    } else if (currentTx && line.trim() && !line.startsWith(':')) {
      // Continuation line for tag 86
      currentTx.description += ' ' + line.trim();
    }
  }

  if (result.transactions.length === 0) {
    throw new Error('No transactions found in MT940 content');
  }

  result.meta.rowCount = result.transactions.length;
  return result;
}

// ═══ AUTO-DETECTION ═══

function autoParse(content, hint) {
  if (hint === 'mt940' || content.startsWith(':20:') || /^:25:/.test(content.slice(0, 500))) {
    return parseMt940Statement(content);
  }
  return parseCsvStatement(content);
}

module.exports = {
  parseCsvStatement,
  parseMt940Statement,
  autoParse,
};
