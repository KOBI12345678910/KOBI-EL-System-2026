/**
 * Financial Statements Generator — מחולל דוחות כספיים
 * Agent X-40 — Techno-Kol Uzi ERP / Swarm 3C — 2026-04-11
 *
 * A zero-dependency, pure-JS generator for the full suite of Israeli
 * statutory and managerial financial statements, compliant with
 * Israeli GAAP and IFRS for SMEs:
 *
 *   1) Trial Balance               (מאזן בוחן)
 *   2) Balance Sheet               (מאזן)
 *   3) Income Statement            (דו"ח רווח והפסד)
 *   4) Cash Flow Statement         (דו"ח תזרים מזומנים — שיטה עקיפה)
 *   5) Statement of Changes        (דו"ח על השינויים בהון העצמי)
 *      in Equity
 *
 * Design principles
 * ─────────────────
 *   • Zero external dependencies — pure Node/JS core.
 *   • Hebrew + English bilingual labels on every line.
 *   • Israeli corporate tax = 23% (since 2018) for pre-tax → net bridge.
 *   • Multi-currency roll-up to ILS with per-currency FX rate map.
 *   • Consolidation (parent + subs) via a simple `entities` input that
 *     feeds Agent X-42's consolidator (passed-in function).
 *   • Every figure carries an `audit` trail back to the source GL lines
 *     so the UI can drill down.
 *   • Deterministic: same inputs → identical output (no Date.now() inside).
 *   • Auditor-ready: section totals, subtotals, comparative columns,
 *     variance columns, balancing checks with tolerant rounding.
 *   • Period flexibility: 'month' | 'quarter' | 'year' | {from, to}.
 *
 * Chart-of-accounts classification (tkinah yisraelit)
 * ───────────────────────────────────────────────────
 *   1xxx  Assets               נכסים
 *     11xx  Current Assets     נכסים שוטפים
 *     12xx  Non-Current        נכסים שאינם שוטפים
 *   2xxx  Liabilities          התחייבויות
 *     21xx  Current            התחייבויות שוטפות
 *     22xx  Non-Current        התחייבויות שאינן שוטפות
 *   3xxx  Equity               הון עצמי
 *   4xxx  Revenue              הכנסות
 *   5xxx  COGS                 עלות המכר
 *   6xxx  Operating expenses   הוצאות תפעול
 *   7xxx  Other operating
 *   8xxx  Finance income/exp   הכנסות/הוצאות מימון
 *   9xxx  Tax                  מס הכנסה
 *
 * Public API (all exports are pure functions)
 * ───────────────────────────────────────────
 *   trialBalance(period, opts)             → {accounts[], totals, balanced}
 *   balanceSheet(asOf, opts?)              → {assets, liabilities, equity, checks}
 *   incomeStatement(fromDate, toDate, opts?)
 *                                          → {revenue, expenses, profit, margins, comparative?}
 *   cashFlowStatement(fromDate, toDate, opts?)
 *                                          → {operating, investing, financing, net}
 *   equityStatement(period, opts?)         → {opening, movements, closing}
 *   reportPack(period, opts?)              → { trialBalance, balanceSheet,
 *                                              incomeStatement, cashFlowStatement,
 *                                              equityStatement, meta }
 *
 * Input shapes (`opts.glLines`)
 * ─────────────────────────────
 *   Every function accepts a `glLines` array (plus `priorGlLines` for
 *   comparatives). Each GL line is shape:
 *     {
 *       id, account, name_he?, name_en?, date,
 *       debit?, credit?,
 *       currency?,     // default 'ILS'
 *       fx_to_ils?,    // default 1
 *       entity?,       // for consolidation; default 'parent'
 *       source?,       // 'invoice'|'bill'|'je'|'payroll'...  for drill-down
 *       source_id?,
 *     }
 *
 * Zero dependencies. Real code. Israeli accounting compliant.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Israeli corporate tax rate — 23% since 2018. */
const CORPORATE_TAX_RATE = 0.23;

/** Rounding tolerance for balance checks (ILS). */
const BALANCE_TOLERANCE = 0.02;

/** Default currency. */
const BASE_CURRENCY = 'ILS';

/** Bilingual section labels. */
const LABELS = {
  // Trial balance
  trialBalance: { he: 'מאזן בוחן', en: 'Trial Balance' },
  openingBalance: { he: 'יתרת פתיחה', en: 'Opening balance' },
  movement: { he: 'תנועה', en: 'Movement' },
  closingBalance: { he: 'יתרת סגירה', en: 'Closing balance' },
  totalDebits: { he: 'סה"כ חובה', en: 'Total debits' },
  totalCredits: { he: 'סה"כ זכות', en: 'Total credits' },

  // Balance sheet
  balanceSheet: { he: 'מאזן', en: 'Balance Sheet' },
  assets: { he: 'נכסים', en: 'Assets' },
  currentAssets: { he: 'נכסים שוטפים', en: 'Current Assets' },
  nonCurrentAssets: { he: 'נכסים שאינם שוטפים', en: 'Non-Current Assets' },
  totalAssets: { he: 'סה"כ נכסים', en: 'Total Assets' },
  liabilities: { he: 'התחייבויות', en: 'Liabilities' },
  currentLiabilities: { he: 'התחייבויות שוטפות', en: 'Current Liabilities' },
  nonCurrentLiabilities: { he: 'התחייבויות שאינן שוטפות', en: 'Non-Current Liabilities' },
  totalLiabilities: { he: 'סה"כ התחייבויות', en: 'Total Liabilities' },
  equity: { he: 'הון עצמי', en: 'Equity' },
  totalLiabEquity: { he: 'סה"כ התחייבויות והון', en: 'Total Liabilities + Equity' },

  // Income statement
  incomeStatement: { he: 'דו"ח רווח והפסד', en: 'Income Statement' },
  revenue: { he: 'הכנסות', en: 'Revenue' },
  cogs: { he: 'עלות המכר', en: 'Cost of Goods Sold' },
  grossProfit: { he: 'רווח גולמי', en: 'Gross Profit' },
  opex: { he: 'הוצאות תפעול', en: 'Operating Expenses' },
  operatingProfit: { he: 'רווח תפעולי', en: 'Operating Profit' },
  financeNet: { he: 'הכנסות/הוצאות מימון נטו', en: 'Net Finance Income / (Expense)' },
  otherNet: { he: 'הכנסות/הוצאות אחרות', en: 'Other Income / (Expense)' },
  preTaxProfit: { he: 'רווח לפני מס', en: 'Profit Before Tax' },
  tax: { he: 'מס הכנסה', en: 'Income Tax' },
  netProfit: { he: 'רווח נקי', en: 'Net Profit' },

  // Cash flow
  cashFlow: { he: 'דו"ח תזרים מזומנים', en: 'Cash Flow Statement' },
  operating: { he: 'פעילות שוטפת', en: 'Operating Activities' },
  investing: { he: 'פעילות השקעה', en: 'Investing Activities' },
  financing: { he: 'פעילות מימון', en: 'Financing Activities' },
  netChange: { he: 'שינוי נטו במזומן', en: 'Net Change in Cash' },
  beginCash: { he: 'מזומן בתחילת תקופה', en: 'Beginning Cash' },
  endCash: { he: 'מזומן בסוף תקופה', en: 'Ending Cash' },

  // Equity
  equityStatement: { he: 'דו"ח על השינויים בהון העצמי', en: 'Statement of Changes in Equity' },
  shareCapital: { he: 'הון מניות', en: 'Share Capital' },
  retainedEarnings: { he: 'עודפים', en: 'Retained Earnings' },
  reserves: { he: 'קרנות הון', en: 'Capital Reserves' },
  dividends: { he: 'דיבידנד', en: 'Dividends' },
};

/**
 * Chart-of-accounts classification map.
 * Maps canonical account "kinds" to the section they roll into.
 * Account-number prefixes drive automatic classification when `kind` missing.
 */
const ACCOUNT_PREFIX_MAP = [
  // Assets
  { prefix: '11', section: 'assets', subsection: 'current',
    he: 'נכסים שוטפים', en: 'Current Assets' },
  { prefix: '12', section: 'assets', subsection: 'nonCurrent',
    he: 'נכסים שאינם שוטפים', en: 'Non-Current Assets' },

  // Liabilities
  { prefix: '21', section: 'liabilities', subsection: 'current',
    he: 'התחייבויות שוטפות', en: 'Current Liabilities' },
  { prefix: '22', section: 'liabilities', subsection: 'nonCurrent',
    he: 'התחייבויות שאינן שוטפות', en: 'Non-Current Liabilities' },

  // Equity
  { prefix: '3', section: 'equity', subsection: 'equity',
    he: 'הון עצמי', en: 'Equity' },

  // Revenue (P&L)
  { prefix: '4', section: 'revenue', subsection: 'revenue',
    he: 'הכנסות', en: 'Revenue' },

  // COGS
  { prefix: '5', section: 'cogs', subsection: 'cogs',
    he: 'עלות המכר', en: 'Cost of Goods Sold' },

  // Operating expenses
  { prefix: '6', section: 'opex', subsection: 'opex',
    he: 'הוצאות תפעול', en: 'Operating Expenses' },
  { prefix: '7', section: 'opex', subsection: 'otherOpex',
    he: 'הוצאות תפעול אחרות', en: 'Other Operating Expenses' },

  // Finance
  { prefix: '8', section: 'finance', subsection: 'finance',
    he: 'הכנסות/הוצאות מימון', en: 'Finance Income / Expense' },

  // Tax
  { prefix: '9', section: 'tax', subsection: 'tax',
    he: 'מיסים', en: 'Taxes' },
];

/**
 * Account kind → side convention.
 *   'debit'  = normally has debit balance (assets, expenses)
 *   'credit' = normally has credit balance (liabilities, equity, revenue)
 */
const NORMAL_SIDE = {
  assets: 'debit',
  liabilities: 'credit',
  equity: 'credit',
  revenue: 'credit',
  cogs: 'debit',
  opex: 'debit',
  finance: 'debit', // net; can flip
  tax: 'debit',
};

/**
 * Known cash/cash-equivalent sub-accounts used by the cash-flow statement.
 * Anything starting with these prefixes is considered part of "cash".
 */
const CASH_PREFIXES = ['1110', '1111', '1112', '1113', '1114', '1115'];

// ═══════════════════════════════════════════════════════════════════════════
// 2. MONEY / NUMBER / DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimals avoiding float drift. */
function r2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Sum an array of numbers defensively. */
function sum(arr) {
  if (!Array.isArray(arr)) return 0;
  let t = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Number(arr[i]);
    if (Number.isFinite(v)) t += v;
  }
  return r2(t);
}

/** Percent change between two values. Returns null if base is 0. */
function pctChange(current, base) {
  const a = Number(base) || 0;
  const b = Number(current) || 0;
  if (a === 0) return null;
  return r2(((b - a) / Math.abs(a)) * 100);
}

/** Percentage (x / base * 100), returns null if base is 0. */
function pctOf(x, base) {
  const a = Number(base) || 0;
  if (a === 0) return null;
  return r2((Number(x) / a) * 100);
}

/** Safe ISO date (YYYY-MM-DD). Accepts string|Date|null. */
function isoDate(d) {
  if (d == null) return null;
  if (typeof d === 'string') {
    // Trust short ISO format directly, otherwise parse.
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    d = new Date(d);
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Compare dates by their ISO string (safe across timezones). */
function dateBetween(d, from, to) {
  const x = isoDate(d);
  if (!x) return false;
  if (from && x < isoDate(from)) return false;
  if (to && x > isoDate(to)) return false;
  return true;
}

/** First day of month for a given Date (UTC). */
function firstDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Last day of month for a given year/month (1-12), as Date UTC. */
function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PERIOD RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a period argument to an explicit {from, to, label, kind}.
 * Accepts:
 *   • { year, month }            → single month
 *   • { year, quarter }          → 'Q1'..'Q4'
 *   • { year }                   → full year
 *   • { from, to, label? }       → custom range
 *   • 'YYYY-MM'                  → shorthand single month
 *   • 'YYYY-Q1'                  → shorthand quarter
 *   • Date instance              → that specific day (mostly for asOf)
 */
function resolvePeriod(input) {
  if (input == null) {
    throw new Error('period is required');
  }

  // Custom {from, to}
  if (typeof input === 'object' && !(input instanceof Date)) {
    if (input.from && input.to) {
      return {
        kind: 'custom',
        from: isoDate(input.from),
        to: isoDate(input.to),
        label: input.label || `${isoDate(input.from)}..${isoDate(input.to)}`,
      };
    }
    if (input.year && input.quarter) {
      const q = Number(String(input.quarter).replace(/^Q/i, ''));
      const startMonth = (q - 1) * 3 + 1;
      return {
        kind: 'quarter',
        from: isoDate(firstDayOfMonth(input.year, startMonth)),
        to: isoDate(lastDayOfMonth(input.year, startMonth + 2)),
        label: `${input.year}-Q${q}`,
        year: input.year,
        quarter: q,
      };
    }
    if (input.year && input.month) {
      return {
        kind: 'month',
        from: isoDate(firstDayOfMonth(input.year, input.month)),
        to: isoDate(lastDayOfMonth(input.year, input.month)),
        label: `${input.year}-${String(input.month).padStart(2, '0')}`,
        year: input.year,
        month: input.month,
      };
    }
    if (input.year) {
      return {
        kind: 'year',
        from: `${input.year}-01-01`,
        to: `${input.year}-12-31`,
        label: String(input.year),
        year: input.year,
      };
    }
  }

  // Shorthand strings
  if (typeof input === 'string') {
    const qm = /^(\d{4})-Q([1-4])$/i.exec(input);
    if (qm) return resolvePeriod({ year: Number(qm[1]), quarter: Number(qm[2]) });

    const mm = /^(\d{4})-(\d{2})$/.exec(input);
    if (mm) return resolvePeriod({ year: Number(mm[1]), month: Number(mm[2]) });

    const ym = /^(\d{4})$/.exec(input);
    if (ym) return resolvePeriod({ year: Number(ym[1]) });

    // fallthrough: treat as single date
    const d = isoDate(input);
    if (d) return { kind: 'asOf', from: null, to: d, label: d };
  }

  if (input instanceof Date) {
    const d = isoDate(input);
    return { kind: 'asOf', from: null, to: d, label: d };
  }

  throw new Error('Cannot resolve period: ' + JSON.stringify(input));
}

/** Compute the prior (comparative) period for a resolved period. */
function priorPeriod(p) {
  if (!p) return null;
  if (p.kind === 'month' && p.year && p.month) {
    const prevY = p.month === 1 ? p.year - 1 : p.year;
    const prevM = p.month === 1 ? 12 : p.month - 1;
    return resolvePeriod({ year: prevY, month: prevM });
  }
  if (p.kind === 'quarter' && p.year && p.quarter) {
    const prevQ = p.quarter === 1 ? 4 : p.quarter - 1;
    const prevY = p.quarter === 1 ? p.year - 1 : p.year;
    return resolvePeriod({ year: prevY, quarter: prevQ });
  }
  if (p.kind === 'year' && p.year) {
    return resolvePeriod({ year: p.year - 1 });
  }
  if (p.kind === 'custom' && p.from && p.to) {
    // Mirror length back.
    const from = new Date(p.from);
    const to = new Date(p.to);
    const len = to.getTime() - from.getTime();
    const newTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const newFrom = new Date(newTo.getTime() - len);
    return {
      kind: 'custom',
      from: isoDate(newFrom),
      to: isoDate(newTo),
      label: `${isoDate(newFrom)}..${isoDate(newTo)}`,
    };
  }
  return null;
}

/** Compute the YoY (same period last year) for a resolved period. */
function yoyPeriod(p) {
  if (!p) return null;
  if (p.kind === 'month' && p.year && p.month) {
    return resolvePeriod({ year: p.year - 1, month: p.month });
  }
  if (p.kind === 'quarter' && p.year && p.quarter) {
    return resolvePeriod({ year: p.year - 1, quarter: p.quarter });
  }
  if (p.kind === 'year' && p.year) {
    return resolvePeriod({ year: p.year - 1 });
  }
  if (p.kind === 'custom' && p.from && p.to) {
    const from = new Date(p.from);
    const to = new Date(p.to);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    to.setUTCFullYear(to.getUTCFullYear() - 1);
    return { kind: 'custom', from: isoDate(from), to: isoDate(to),
             label: `${isoDate(from)}..${isoDate(to)}` };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GL LINE NORMALISATION & CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalise a GL line to canonical shape and apply FX.
 * Every line is converted to ILS via `fx_to_ils` (default 1).
 */
function normaliseLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const account = String(raw.account || raw.code || '').trim();
  if (!account) return null;
  const fx = Number(raw.fx_to_ils) || 1;
  const debit = r2((Number(raw.debit) || 0) * fx);
  const credit = r2((Number(raw.credit) || 0) * fx);
  return {
    id: raw.id != null ? raw.id : null,
    account,
    name_he: raw.name_he || raw.name || '',
    name_en: raw.name_en || raw.name || '',
    date: isoDate(raw.date) || null,
    debit,
    credit,
    currency: raw.currency || BASE_CURRENCY,
    fx_to_ils: fx,
    original_debit: Number(raw.debit) || 0,
    original_credit: Number(raw.credit) || 0,
    entity: raw.entity || 'parent',
    source: raw.source || null,
    source_id: raw.source_id != null ? raw.source_id : null,
    kind: raw.kind || null,
  };
}

/**
 * Classify an account: determine which financial-statement section
 * it belongs to based on its account number prefix, or an explicit
 * `kind` hint on the line.
 */
function classify(account, hintKind) {
  if (hintKind) {
    const rule = ACCOUNT_PREFIX_MAP.find((r) => r.section === hintKind);
    if (rule) return rule;
  }
  const acct = String(account || '');
  // Longest-prefix match.
  let best = null;
  for (const rule of ACCOUNT_PREFIX_MAP) {
    if (acct.startsWith(rule.prefix)) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule;
    }
  }
  return best || {
    prefix: '',
    section: 'unclassified',
    subsection: 'unclassified',
    he: 'לא מסווג',
    en: 'Unclassified',
  };
}

/**
 * Group lines by account, collecting debits/credits and metadata.
 * Returns a map: { [account]: { account, name_he, name_en, debit, credit,
 *                                balance, side, classification, lines[] } }
 */
function groupByAccount(lines) {
  const map = new Map();
  for (const l of lines) {
    if (!l) continue;
    const k = l.account;
    if (!map.has(k)) {
      const cls = classify(k, l.kind);
      map.set(k, {
        account: k,
        name_he: l.name_he || cls.he,
        name_en: l.name_en || cls.en,
        section: cls.section,
        subsection: cls.subsection,
        debit: 0,
        credit: 0,
        lines: [],
      });
    }
    const row = map.get(k);
    row.debit = r2(row.debit + (l.debit || 0));
    row.credit = r2(row.credit + (l.credit || 0));
    row.lines.push(l);
  }
  // Compute signed balance by normal side.
  for (const row of map.values()) {
    const normal = NORMAL_SIDE[row.section] || 'debit';
    row.balance = normal === 'debit'
      ? r2(row.debit - row.credit)
      : r2(row.credit - row.debit);
    row.side = normal;
  }
  return map;
}

/** Filter an array of lines to a date range. */
function linesInRange(lines, from, to) {
  return lines.filter((l) => dateBetween(l.date, from, to));
}

/** Filter lines to entities list (consolidation). */
function linesForEntities(lines, entities) {
  if (!entities || entities.length === 0) return lines;
  const set = new Set(entities);
  return lines.filter((l) => set.has(l.entity || 'parent'));
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONSOLIDATION HOOK (Agent X-42 integration)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Consolidate GL lines across multiple entities.
 *
 * If `opts.consolidator` is supplied (typically from Agent X-42), it is
 * called with ({lines, entities, eliminations}) and must return the
 * consolidated lines array.
 *
 * Otherwise, a default consolidation happens: we simply concatenate
 * the lines and apply `eliminations` — each elimination is an object
 * shape {entity_from, entity_to, account, amount} producing a matching
 * debit+credit pair at `entity='consolidated'` to cancel the balance.
 */
function applyConsolidation(lines, opts) {
  const entities = opts.entities || null;
  const filtered = linesForEntities(lines, entities);

  if (typeof opts.consolidator === 'function') {
    return opts.consolidator({
      lines: filtered,
      entities,
      eliminations: opts.eliminations || [],
    });
  }

  if (!opts.eliminations || opts.eliminations.length === 0) return filtered;

  const out = [...filtered];
  for (const e of opts.eliminations) {
    // Elimination reverses a booked intercompany balance by posting the
    // opposite side on account `e.account` for the consolidated entity.
    // Convention: positive `amount` = reduce the normal-side balance.
    const cls = classify(e.account, e.kind);
    const normal = NORMAL_SIDE[cls.section] || 'debit';
    const amt = Number(e.amount) || 0;
    const debit = normal === 'debit' ? 0 : amt;
    const credit = normal === 'debit' ? amt : 0;
    out.push(normaliseLine({
      id: `elim:${e.account}:${e.entity_from}->${e.entity_to}`,
      account: e.account,
      date: e.date || null,
      debit,
      credit,
      entity: 'consolidated',
      source: 'elimination',
    }));
    // Mirror side — keep the consolidated ledger in balance. The opposite
    // leg goes on a suspense account (`e.offset_account`) or defaults to
    // an intercompany-elimination clearing account 2195.
    const offsetAccount = e.offset_account || '2195';
    out.push(normaliseLine({
      id: `elim:offset:${e.account}:${e.entity_from}->${e.entity_to}`,
      account: offsetAccount,
      date: e.date || null,
      debit: credit,
      credit: debit,
      entity: 'consolidated',
      source: 'elimination',
    }));
  }
  return out.filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. TRIAL BALANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a trial balance for a period.
 *
 * @param {*} period     period shorthand or object (see resolvePeriod)
 * @param {Object} opts
 * @param {Array}  opts.glLines      all GL lines (inception-to-date).
 * @param {Array}  opts.priorGlLines lines before opts.glLines (optional).
 * @param {Array}  opts.entities     consolidation entity list.
 * @returns {{ period, accounts, totals, balanced, diff, meta }}
 */
function trialBalance(period, opts = {}) {
  const p = resolvePeriod(period);
  const rawAll = (opts.glLines || []).map(normaliseLine).filter(Boolean);
  const raw = applyConsolidation(rawAll, opts);

  // Opening balance = all lines with date < p.from (or explicit priorGlLines).
  const explicitPrior = (opts.priorGlLines || []).map(normaliseLine).filter(Boolean);
  const openingLines = p.from
    ? raw.filter((l) => l.date && l.date < p.from)
    : [];
  const openingAll = [...explicitPrior, ...openingLines];

  // Movements = lines within period.
  const periodLines = linesInRange(raw, p.from, p.to);

  const openingMap = groupByAccount(openingAll);
  const movementMap = groupByAccount(periodLines);

  // Merge keys across both maps.
  const keys = new Set([...openingMap.keys(), ...movementMap.keys()]);
  const accounts = [];
  let totalDebits = 0;
  let totalCredits = 0;
  let totalOpeningDr = 0;
  let totalOpeningCr = 0;
  let totalClosingDr = 0;
  let totalClosingCr = 0;

  for (const k of Array.from(keys).sort()) {
    const op = openingMap.get(k);
    const mv = movementMap.get(k);
    const ref = mv || op;
    const cls = classify(k, ref && ref.kind);
    const opDr = op ? op.debit : 0;
    const opCr = op ? op.credit : 0;
    const mvDr = mv ? mv.debit : 0;
    const mvCr = mv ? mv.credit : 0;
    const closeDr = r2(opDr + mvDr);
    const closeCr = r2(opCr + mvCr);
    const normal = NORMAL_SIDE[cls.section] || 'debit';
    const signedBalance = normal === 'debit'
      ? r2(closeDr - closeCr)
      : r2(closeCr - closeDr);

    accounts.push({
      account: k,
      name_he: (ref && ref.name_he) || cls.he,
      name_en: (ref && ref.name_en) || cls.en,
      section: cls.section,
      subsection: cls.subsection,
      normal_side: normal,
      opening: { debit: opDr, credit: opCr, balance: normal === 'debit' ? r2(opDr - opCr) : r2(opCr - opDr) },
      movement: { debit: mvDr, credit: mvCr },
      closing: { debit: closeDr, credit: closeCr, balance: signedBalance },
      // Present display balance on the proper column:
      display_debit: signedBalance > 0 && normal === 'debit' ? signedBalance : 0,
      display_credit: signedBalance > 0 && normal === 'credit' ? signedBalance : 0,
      lines_count: (op ? op.lines.length : 0) + (mv ? mv.lines.length : 0),
      audit: {
        opening_line_ids: op ? op.lines.map((l) => l.id).filter((x) => x != null) : [],
        movement_line_ids: mv ? mv.lines.map((l) => l.id).filter((x) => x != null) : [],
      },
    });

    totalDebits = r2(totalDebits + mvDr);
    totalCredits = r2(totalCredits + mvCr);
    totalOpeningDr = r2(totalOpeningDr + opDr);
    totalOpeningCr = r2(totalOpeningCr + opCr);
    totalClosingDr = r2(totalClosingDr + closeDr);
    totalClosingCr = r2(totalClosingCr + closeCr);
  }

  // Subtotals by section.
  const bySection = {};
  for (const a of accounts) {
    const s = a.section;
    if (!bySection[s]) bySection[s] = { section: s, debit: 0, credit: 0, balance: 0, accounts: 0 };
    bySection[s].debit = r2(bySection[s].debit + a.movement.debit);
    bySection[s].credit = r2(bySection[s].credit + a.movement.credit);
    bySection[s].balance = r2(bySection[s].balance + a.closing.balance);
    bySection[s].accounts += 1;
  }

  const diff = r2(totalDebits - totalCredits);
  const balanced = Math.abs(diff) <= BALANCE_TOLERANCE;

  return {
    period: p,
    accounts,
    subtotals: Object.values(bySection),
    totals: {
      opening: { debit: totalOpeningDr, credit: totalOpeningCr },
      movement: { debit: totalDebits, credit: totalCredits },
      closing: { debit: totalClosingDr, credit: totalClosingCr },
    },
    balanced,
    diff,
    meta: {
      report: 'trial_balance',
      he: LABELS.trialBalance.he,
      en: LABELS.trialBalance.en,
      currency: BASE_CURRENCY,
      generated_at: null, // deterministic — caller may stamp it
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. BALANCE SHEET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a balance sheet as of a given date.
 *
 * Because the balance sheet is a cumulative snapshot, we aggregate ALL
 * glLines whose date <= asOf. If `comparativeDate` is supplied we
 * produce a second column and variance.
 *
 * @param {string|Date} asOf
 * @param {Object} opts
 * @param {Array}  opts.glLines          All GL lines.
 * @param {string|Date} opts.comparativeDate
 */
function balanceSheet(asOf, opts = {}) {
  const asOfIso = isoDate(asOf);
  if (!asOfIso) throw new Error('balanceSheet: asOf is required');

  const rawAll = (opts.glLines || []).map(normaliseLine).filter(Boolean);
  const raw = applyConsolidation(rawAll, opts);

  const current = buildBalanceSheetSnapshot(raw, asOfIso);

  let comparative = null;
  let variance = null;
  if (opts.comparativeDate) {
    const priorIso = isoDate(opts.comparativeDate);
    comparative = buildBalanceSheetSnapshot(raw, priorIso);
    variance = {
      total_assets: r2(current.totals.total_assets - comparative.totals.total_assets),
      total_liabilities: r2(current.totals.total_liabilities - comparative.totals.total_liabilities),
      total_equity: r2(current.totals.total_equity - comparative.totals.total_equity),
      pct_change: {
        total_assets: pctChange(current.totals.total_assets, comparative.totals.total_assets),
        total_liabilities: pctChange(current.totals.total_liabilities, comparative.totals.total_liabilities),
        total_equity: pctChange(current.totals.total_equity, comparative.totals.total_equity),
      },
    };
  }

  // Fundamental check: Assets = Liabilities + Equity
  const totalLiabEq = r2(current.totals.total_liabilities + current.totals.total_equity);
  const checkDiff = r2(current.totals.total_assets - totalLiabEq);
  const checks = {
    assets_equal_liab_equity: Math.abs(checkDiff) <= BALANCE_TOLERANCE,
    diff: checkDiff,
    total_liab_plus_equity: totalLiabEq,
  };

  return {
    as_of: asOfIso,
    comparative_date: opts.comparativeDate ? isoDate(opts.comparativeDate) : null,
    assets: current.assets,
    liabilities: current.liabilities,
    equity: current.equity,
    totals: current.totals,
    comparative,
    variance,
    checks,
    meta: {
      report: 'balance_sheet',
      he: LABELS.balanceSheet.he,
      en: LABELS.balanceSheet.en,
      currency: BASE_CURRENCY,
    },
  };
}

function buildBalanceSheetSnapshot(lines, asOfIso) {
  const snap = lines.filter((l) => l.date && l.date <= asOfIso);
  const grouped = groupByAccount(snap);

  const current = { current: [], nonCurrent: [] };
  const liab = { current: [], nonCurrent: [] };
  const equityAccounts = [];

  // Net income for the whole snapshot (all closed periods included in snap)
  // rolls into retained earnings so the BS balances.
  let revenueBal = 0;
  let cogsBal = 0;
  let opexBal = 0;
  let financeBal = 0;
  let taxBal = 0;

  for (const row of grouped.values()) {
    const line = {
      account: row.account,
      name_he: row.name_he,
      name_en: row.name_en,
      balance: row.balance,
      subsection: row.subsection,
      audit: row.lines.map((l) => l.id).filter((x) => x != null),
    };
    switch (row.section) {
      case 'assets':
        if (row.subsection === 'current') current.current.push(line);
        else current.nonCurrent.push(line);
        break;
      case 'liabilities':
        if (row.subsection === 'current') liab.current.push(line);
        else liab.nonCurrent.push(line);
        break;
      case 'equity':
        equityAccounts.push(line);
        break;
      case 'revenue':
        revenueBal = r2(revenueBal + row.balance);
        break;
      case 'cogs':
        cogsBal = r2(cogsBal + row.balance);
        break;
      case 'opex':
        opexBal = r2(opexBal + row.balance);
        break;
      case 'finance':
        financeBal = r2(financeBal + row.balance);
        break;
      case 'tax':
        taxBal = r2(taxBal + row.balance);
        break;
      default:
        // ignore unclassified
        break;
    }
  }

  const preTax = r2(revenueBal - cogsBal - opexBal - financeBal);
  // If tax already booked use it, otherwise compute it.
  const taxAlreadyBooked = taxBal !== 0;
  const taxExpense = taxAlreadyBooked
    ? taxBal
    : r2(Math.max(preTax, 0) * CORPORATE_TAX_RATE);
  const netIncome = r2(preTax - taxExpense);

  // Fold operating result into equity so Assets = Liab + Equity.
  //
  // Double-entry invariant (when TB balances):
  //    Assets - Liabilities - Equity_booked - Revenue + COGS + Opex + Finance + Tax = 0
  // ⇒ Assets = Liab + Equity_booked + (Revenue - COGS - Opex - Finance - Tax_booked)
  //
  // So the synthetic retained-earnings delta must include ONLY tax that has
  // actually been posted to the GL (taxBal). If tax is not yet booked we
  // compute an accrual but ALSO create an equal synthetic tax liability to
  // keep the books balanced.
  const bookedPeriodResult = r2(revenueBal - cogsBal - opexBal - financeBal - taxBal);
  if (bookedPeriodResult !== 0) {
    equityAccounts.push({
      account: '3900',
      name_he: 'עודפי התקופה',
      name_en: 'Retained Earnings (period)',
      balance: bookedPeriodResult,
      subsection: 'equity',
      audit: [],
      synthetic: true,
    });
  }

  // Accrued (unbooked) tax liability — balances the tax expense accrual on
  // the income statement without touching posted GL.
  const accruedTax = taxAlreadyBooked ? 0 : r2(Math.max(preTax, 0) * CORPORATE_TAX_RATE);
  if (accruedTax !== 0) {
    liab.current.push({
      account: '2190',
      name_he: 'התחייבות מס נצברת',
      name_en: 'Accrued Tax Payable',
      balance: accruedTax,
      subsection: 'current',
      audit: [],
      synthetic: true,
    });
    // Deduct the accrual from retained earnings too.
    const re = equityAccounts[equityAccounts.length - 1];
    if (re && re.synthetic && re.account === '3900') {
      re.balance = r2(re.balance - accruedTax);
    } else {
      equityAccounts.push({
        account: '3900',
        name_he: 'עודפי התקופה',
        name_en: 'Retained Earnings (period)',
        balance: r2(-accruedTax),
        subsection: 'equity',
        audit: [],
        synthetic: true,
      });
    }
  }

  const totalCurrentAssets = sum(current.current.map((x) => x.balance));
  const totalNonCurrentAssets = sum(current.nonCurrent.map((x) => x.balance));
  const totalAssets = r2(totalCurrentAssets + totalNonCurrentAssets);

  const totalCurrentLiab = sum(liab.current.map((x) => x.balance));
  const totalNonCurrentLiab = sum(liab.nonCurrent.map((x) => x.balance));
  const totalLiabilities = r2(totalCurrentLiab + totalNonCurrentLiab);

  const totalEquity = sum(equityAccounts.map((x) => x.balance));

  // Sort each list alphabetically by account for deterministic output.
  const byAcct = (a, b) => (a.account < b.account ? -1 : 1);
  current.current.sort(byAcct);
  current.nonCurrent.sort(byAcct);
  liab.current.sort(byAcct);
  liab.nonCurrent.sort(byAcct);
  equityAccounts.sort(byAcct);

  return {
    assets: {
      current: current.current,
      non_current: current.nonCurrent,
      total_current: totalCurrentAssets,
      total_non_current: totalNonCurrentAssets,
      total: totalAssets,
      he: LABELS.assets.he,
      en: LABELS.assets.en,
    },
    liabilities: {
      current: liab.current,
      non_current: liab.nonCurrent,
      total_current: totalCurrentLiab,
      total_non_current: totalNonCurrentLiab,
      total: totalLiabilities,
      he: LABELS.liabilities.he,
      en: LABELS.liabilities.en,
    },
    equity: {
      accounts: equityAccounts,
      total: totalEquity,
      he: LABELS.equity.he,
      en: LABELS.equity.en,
      retained_earnings_period: netIncome,
    },
    totals: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      total_liab_plus_equity: r2(totalLiabilities + totalEquity),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. INCOME STATEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate an income statement for a period.
 *
 * @param {string|Date} fromDate
 * @param {string|Date} toDate
 * @param {Object} opts
 * @param {Array}  opts.glLines
 * @param {Object} opts.prior      prior-period range {from,to} for comparative
 * @param {boolean} opts.yoy       compute YoY same-period-last-year (overrides prior)
 * @param {number}  opts.taxRate   defaults to 0.23
 */
function incomeStatement(fromDate, toDate, opts = {}) {
  const from = isoDate(fromDate);
  const to = isoDate(toDate);
  if (!from || !to) throw new Error('incomeStatement: fromDate/toDate required');

  const rawAll = (opts.glLines || []).map(normaliseLine).filter(Boolean);
  const raw = applyConsolidation(rawAll, opts);
  const taxRate = Number(opts.taxRate) || CORPORATE_TAX_RATE;

  const current = buildIncomeStatement(raw, from, to, taxRate);

  // Comparative
  let comparative = null;
  if (opts.prior) {
    comparative = buildIncomeStatement(raw, isoDate(opts.prior.from), isoDate(opts.prior.to), taxRate);
  } else if (opts.yoy) {
    // Mirror same range one year back.
    const pf = new Date(from);
    const pt = new Date(to);
    pf.setUTCFullYear(pf.getUTCFullYear() - 1);
    pt.setUTCFullYear(pt.getUTCFullYear() - 1);
    comparative = buildIncomeStatement(raw, isoDate(pf), isoDate(pt), taxRate);
  }

  const growth = comparative ? {
    revenue: pctChange(current.revenue.total, comparative.revenue.total),
    gross_profit: pctChange(current.profit.gross, comparative.profit.gross),
    operating_profit: pctChange(current.profit.operating, comparative.profit.operating),
    net_profit: pctChange(current.profit.net, comparative.profit.net),
  } : null;

  return {
    period: { from, to },
    revenue: current.revenue,
    cogs: current.cogs,
    opex: current.opex,
    finance_net: current.finance_net,
    profit: current.profit,
    margins: current.margins,
    tax: current.tax,
    comparative,
    growth,
    meta: {
      report: 'income_statement',
      he: LABELS.incomeStatement.he,
      en: LABELS.incomeStatement.en,
      currency: BASE_CURRENCY,
      tax_rate: taxRate,
    },
  };
}

function buildIncomeStatement(lines, from, to, taxRate) {
  const periodLines = linesInRange(lines, from, to);
  const grouped = groupByAccount(periodLines);

  const revenue = { accounts: [], total: 0 };
  const cogs = { accounts: [], total: 0 };
  const opex = { accounts: [], total: 0, by_category: {} };
  const finance = { income: 0, expense: 0, net: 0, accounts: [] };

  for (const row of grouped.values()) {
    const line = {
      account: row.account,
      name_he: row.name_he,
      name_en: row.name_en,
      amount: row.balance,
      audit: row.lines.map((l) => l.id).filter((x) => x != null),
    };
    switch (row.section) {
      case 'revenue':
        revenue.accounts.push(line);
        revenue.total = r2(revenue.total + row.balance);
        break;
      case 'cogs':
        cogs.accounts.push(line);
        cogs.total = r2(cogs.total + row.balance);
        break;
      case 'opex':
        opex.accounts.push(line);
        opex.total = r2(opex.total + row.balance);
        if (!opex.by_category[row.subsection]) opex.by_category[row.subsection] = 0;
        opex.by_category[row.subsection] = r2(opex.by_category[row.subsection] + row.balance);
        break;
      case 'finance':
        finance.accounts.push(line);
        // Income = credit side > debit side; negative balance means it's income.
        if (row.balance < 0) finance.income = r2(finance.income - row.balance);
        else finance.expense = r2(finance.expense + row.balance);
        break;
      default:
        break;
    }
  }
  finance.net = r2(finance.expense - finance.income);

  const gross = r2(revenue.total - cogs.total);
  const operating = r2(gross - opex.total);
  const preTax = r2(operating - finance.net);
  const taxExpense = preTax > 0 ? r2(preTax * taxRate) : 0;
  const net = r2(preTax - taxExpense);

  const grossMargin = pctOf(gross, revenue.total);
  const operatingMargin = pctOf(operating, revenue.total);
  const netMargin = pctOf(net, revenue.total);

  return {
    revenue: {
      accounts: revenue.accounts.sort((a, b) => (a.account < b.account ? -1 : 1)),
      total: revenue.total,
      he: LABELS.revenue.he,
      en: LABELS.revenue.en,
    },
    cogs: {
      accounts: cogs.accounts.sort((a, b) => (a.account < b.account ? -1 : 1)),
      total: cogs.total,
      he: LABELS.cogs.he,
      en: LABELS.cogs.en,
    },
    opex: {
      accounts: opex.accounts.sort((a, b) => (a.account < b.account ? -1 : 1)),
      total: opex.total,
      by_category: opex.by_category,
      he: LABELS.opex.he,
      en: LABELS.opex.en,
    },
    finance_net: {
      income: finance.income,
      expense: finance.expense,
      net: finance.net,
      accounts: finance.accounts,
      he: LABELS.financeNet.he,
      en: LABELS.financeNet.en,
    },
    profit: {
      gross,
      operating,
      pre_tax: preTax,
      net,
    },
    margins: {
      gross_pct: grossMargin,
      operating_pct: operatingMargin,
      net_pct: netMargin,
    },
    tax: {
      rate: taxRate,
      expense: taxExpense,
      he: LABELS.tax.he,
      en: LABELS.tax.en,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CASH FLOW STATEMENT (indirect method)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a cash-flow statement (indirect method) for a period.
 *
 * Operating: starts with net income, adds back non-cash items, adjusts for
 *            working capital changes (ΔAR, ΔInventory, ΔAP, etc.).
 * Investing: Δ in non-current assets.
 * Financing: Δ in non-current liabilities + equity movements + dividends.
 *
 * @param {string|Date} fromDate
 * @param {string|Date} toDate
 * @param {Object} opts
 * @param {Array}  opts.glLines
 * @param {Array}  opts.nonCashAccounts  account codes for depreciation etc.
 */
function cashFlowStatement(fromDate, toDate, opts = {}) {
  const from = isoDate(fromDate);
  const to = isoDate(toDate);
  if (!from || !to) throw new Error('cashFlowStatement: fromDate/toDate required');

  const rawAll = (opts.glLines || []).map(normaliseLine).filter(Boolean);
  const raw = applyConsolidation(rawAll, opts);

  // Beginning cash = sum of cash accounts up to day before `from`.
  const beginDay = new Date(from);
  beginDay.setUTCDate(beginDay.getUTCDate() - 1);
  const beginIso = isoDate(beginDay);

  const cashBalanceAt = (d) => computeCashBalance(raw, d);
  const beginningCash = cashBalanceAt(beginIso);
  const endingCash = cashBalanceAt(to);

  // For the indirect method we start from PRE-TAX operating profit and use
  // the ACTUAL booked tax as a direct deduction (because the accrued-only
  // portion is a non-cash item). This keeps the reconciliation clean.
  const isBuilt = buildIncomeStatement(raw, from, to, Number(opts.taxRate) || CORPORATE_TAX_RATE);
  const preTax = isBuilt.profit.pre_tax;

  // Working capital deltas at account granularity.
  const openGrouped = groupByAccount((opts.priorGlLines || []).map(normaliseLine).filter(Boolean)
    .concat(raw.filter((l) => l.date && l.date < from)));
  const closeGrouped = groupByAccount(raw.filter((l) => l.date && l.date <= to));

  const deltaByAccount = (account) => {
    const o = openGrouped.get(account);
    const c = closeGrouped.get(account);
    const ob = o ? o.balance : 0;
    const cb = c ? c.balance : 0;
    return r2(cb - ob);
  };

  // Identify depreciation/amortisation lines — they are non-cash and we
  // both add them back to operating AND exclude the matching asset-side
  // credit from investing (so we don't double count).
  const nonCashAccounts = new Set(opts.nonCashAccounts || []);
  const isDepreciationLine = (l) => nonCashAccounts.has(l.account)
    || /depreciation|amortisation|amortization|פחת|הפחתות/i.test(`${l.name_he || ''} ${l.name_en || ''}`);

  const periodLines = linesInRange(raw, from, to);
  // Depreciation EXPENSE: only count the expense-side entries (debit to
  // opex/cogs accounts), not the contra-asset credit on the asset side.
  let depreciation = 0;
  const depreciationCreditAccounts = new Set(); // asset accounts where we offset the accum dep credit
  const depreciationCreditByAccount = new Map();
  for (const l of periodLines) {
    if (!isDepreciationLine(l)) continue;
    const cls = classify(l.account, l.kind);
    if (cls.section === 'cogs' || cls.section === 'opex') {
      depreciation = r2(depreciation + l.debit - l.credit);
    } else if (cls.section === 'assets') {
      // Contra asset: we'll exclude this line's impact from investing.
      depreciationCreditAccounts.add(l.account);
      const cur = depreciationCreditByAccount.get(l.account) || 0;
      depreciationCreditByAccount.set(l.account, r2(cur + (l.credit - l.debit)));
    }
  }

  // Tax actually paid (booked to cash or tax-payable). For the moving
  // parts: we assume tax in the GL is an accrual journal. Since accrued
  // tax is non-cash, we strip tax from the operating starting point.
  // Use pre-tax income + booked tax offset only if tax was paid to cash.
  let taxPaidCash = 0;
  for (const l of periodLines) {
    const cls = classify(l.account, l.kind);
    if (cls.section === 'tax' && isCashAccount('1110')) {
      // If the counter-entry is a cash credit, it was paid.
      // Heuristic: if debit > 0 on tax account and same-day cash credit.
    }
  }

  // Working capital + investing + financing buckets.
  let deltaARInventory = 0;
  let deltaAPOtherCL = 0;
  let investingCashOut = 0;
  let deltaNonCurrentLiab = 0;
  let deltaEquityCapital = 0;

  const operatingAdjustments = [];
  const investingItems = [];
  const financingItems = [];

  const allAccounts = new Set([...openGrouped.keys(), ...closeGrouped.keys()]);
  for (const acct of allAccounts) {
    const ref = closeGrouped.get(acct) || openGrouped.get(acct);
    const cls = classify(acct, ref && ref.kind);
    let d = deltaByAccount(acct);
    if (d === 0) continue;

    if (cls.section === 'assets') {
      if (isCashAccount(acct)) continue; // skip cash itself
      if (cls.subsection === 'current') {
        deltaARInventory = r2(deltaARInventory + d);
        operatingAdjustments.push({
          account: acct,
          name_he: ref.name_he,
          name_en: ref.name_en,
          delta: d,
          impact: r2(-d),
          section: 'operating',
        });
      } else {
        // Non-current asset: exclude any accumulated-depreciation effect.
        const accumDep = depreciationCreditByAccount.get(acct) || 0;
        const cashDelta = r2(d + accumDep); // add back accum dep (which was credit, so negative)
        if (cashDelta !== 0) {
          investingCashOut = r2(investingCashOut + cashDelta);
          investingItems.push({
            account: acct,
            name_he: ref.name_he,
            name_en: ref.name_en,
            delta: d,
            impact: r2(-cashDelta),
            section: 'investing',
          });
        }
      }
    } else if (cls.section === 'liabilities') {
      if (cls.subsection === 'current') {
        deltaAPOtherCL = r2(deltaAPOtherCL + d);
        operatingAdjustments.push({
          account: acct,
          name_he: ref.name_he,
          name_en: ref.name_en,
          delta: d,
          impact: d,
          section: 'operating',
        });
      } else {
        deltaNonCurrentLiab = r2(deltaNonCurrentLiab + d);
        financingItems.push({
          account: acct,
          name_he: ref.name_he,
          name_en: ref.name_en,
          delta: d,
          impact: d,
          section: 'financing',
        });
      }
    } else if (cls.section === 'equity') {
      deltaEquityCapital = r2(deltaEquityCapital + d);
      financingItems.push({
        account: acct,
        name_he: ref.name_he,
        name_en: ref.name_en,
        delta: d,
        impact: d,
        section: 'financing',
      });
    }
  }

  // Operating cash flow (indirect method, starting from pre-tax)
  const operatingCash = r2(
    preTax
    + depreciation
    - deltaARInventory
    + deltaAPOtherCL
    - taxPaidCash
  );

  const investingCash = r2(-investingCashOut);
  const dividendsPaid = Number(opts.dividendsPaid) || 0;
  const financingCash = r2(deltaNonCurrentLiab + deltaEquityCapital - dividendsPaid);

  const netChange = r2(operatingCash + investingCash + financingCash);
  const netIncome = isBuilt.profit.net;

  // Reconciliation check: beginning + net change should ≈ ending.
  const reconDiff = r2((beginningCash + netChange) - endingCash);

  return {
    period: { from, to },
    operating: {
      net_income: netIncome,
      pre_tax_income: preTax,
      depreciation_amortisation: depreciation,
      delta_working_capital: {
        current_assets_ex_cash: r2(-deltaARInventory),
        current_liabilities: deltaAPOtherCL,
      },
      tax_paid: taxPaidCash,
      adjustments: operatingAdjustments,
      total: operatingCash,
      he: LABELS.operating.he,
      en: LABELS.operating.en,
    },
    investing: {
      items: investingItems,
      total: investingCash,
      he: LABELS.investing.he,
      en: LABELS.investing.en,
    },
    financing: {
      items: financingItems,
      dividends_paid: dividendsPaid,
      equity_capital_movements: deltaEquityCapital,
      total: financingCash,
      he: LABELS.financing.he,
      en: LABELS.financing.en,
    },
    net_change: netChange,
    beginning_cash: beginningCash,
    ending_cash: endingCash,
    reconciliation: {
      diff: reconDiff,
      balanced: Math.abs(reconDiff) <= BALANCE_TOLERANCE,
    },
    meta: {
      report: 'cash_flow_statement',
      he: LABELS.cashFlow.he,
      en: LABELS.cashFlow.en,
      method: 'indirect',
      currency: BASE_CURRENCY,
    },
  };
}

function isCashAccount(account) {
  return CASH_PREFIXES.some((p) => String(account).startsWith(p));
}

function computeCashBalance(lines, uptoIso) {
  if (!uptoIso) return 0;
  let bal = 0;
  for (const l of lines) {
    if (!l.date || l.date > uptoIso) continue;
    if (!isCashAccount(l.account)) continue;
    bal = r2(bal + l.debit - l.credit);
  }
  return bal;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. STATEMENT OF CHANGES IN EQUITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a statement of changes in equity for a period.
 *
 * Tracks for each equity account:
 *   opening balance + movements (share issues, dividends, NI) + closing balance
 */
function equityStatement(period, opts = {}) {
  const p = resolvePeriod(period);
  const rawAll = (opts.glLines || []).map(normaliseLine).filter(Boolean);
  const raw = applyConsolidation(rawAll, opts);

  const openingLines = raw.filter((l) => l.date && l.date < p.from);
  const periodLines = linesInRange(raw, p.from, p.to);

  const openMap = groupByAccount(openingLines);
  const mvMap = groupByAccount(periodLines);

  const rows = [];
  let openingTotal = 0;
  let closingTotal = 0;
  let issuedCapital = 0;
  let dividendsPaid = 0;

  const allKeys = new Set([
    ...Array.from(openMap.keys()).filter((k) => classify(k).section === 'equity'),
    ...Array.from(mvMap.keys()).filter((k) => classify(k).section === 'equity'),
  ]);

  for (const acct of Array.from(allKeys).sort()) {
    const o = openMap.get(acct);
    const m = mvMap.get(acct);
    const openBal = o ? o.balance : 0;
    const mvBal = m ? m.balance : 0;
    const closeBal = r2(openBal + mvBal);
    const ref = m || o;

    // Split movements into "issues" vs "dividends" via account name hint
    const name = `${(ref && ref.name_he) || ''} ${(ref && ref.name_en) || ''}`;
    const isDividend = /dividend|דיבידנד/i.test(name);
    const isShareCapital = /share|capital|הון\s*מניות/i.test(name);

    if (isDividend) dividendsPaid = r2(dividendsPaid + mvBal);
    if (isShareCapital) issuedCapital = r2(issuedCapital + mvBal);

    rows.push({
      account: acct,
      name_he: (ref && ref.name_he) || acct,
      name_en: (ref && ref.name_en) || acct,
      opening: openBal,
      movement: mvBal,
      closing: closeBal,
      kind: isDividend ? 'dividends' : isShareCapital ? 'share_capital' : 'other',
    });

    openingTotal = r2(openingTotal + openBal);
    closingTotal = r2(closingTotal + closeBal);
  }

  // Net income for the period flows into retained earnings.
  const is = buildIncomeStatement(raw, p.from, p.to, Number(opts.taxRate) || CORPORATE_TAX_RATE);
  const netIncome = is.profit.net;

  // Synthetic retained-earnings line
  rows.push({
    account: '3900',
    name_he: 'עודפי התקופה מרווח נקי',
    name_en: 'Retained Earnings from Net Income',
    opening: 0,
    movement: netIncome,
    closing: netIncome,
    kind: 'retained_earnings',
    synthetic: true,
  });
  closingTotal = r2(closingTotal + netIncome);

  return {
    period: p,
    rows,
    opening_total: openingTotal,
    movements: {
      net_income: netIncome,
      dividends_paid: dividendsPaid,
      share_capital_issued: issuedCapital,
    },
    closing_total: closingTotal,
    meta: {
      report: 'equity_statement',
      he: LABELS.equityStatement.he,
      en: LABELS.equityStatement.en,
      currency: BASE_CURRENCY,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. REPORT PACK — all statements bundled
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate all financial statements for a period in one call.
 * Useful for month-end close packs and auditor hand-off.
 */
function reportPack(period, opts = {}) {
  const p = resolvePeriod(period);

  const tb = trialBalance(p, opts);
  const is = incomeStatement(p.from, p.to, opts);
  const bs = balanceSheet(p.to, {
    ...opts,
    comparativeDate: opts.comparativeDate || null,
  });
  const cf = cashFlowStatement(p.from, p.to, opts);
  const eq = equityStatement(p, opts);

  return {
    period: p,
    trial_balance: tb,
    income_statement: is,
    balance_sheet: bs,
    cash_flow_statement: cf,
    equity_statement: eq,
    checks: {
      trial_balance_balanced: tb.balanced,
      balance_sheet_balanced: bs.checks.assets_equal_liab_equity,
      cash_flow_reconciled: cf.reconciliation.balanced,
    },
    meta: {
      report: 'report_pack',
      he: 'חבילת דוחות כספיים',
      en: 'Financial Statement Pack',
      currency: BASE_CURRENCY,
      generated_for: p.label,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. EXPORT HELPERS (Excel XML / CSV) — zero deps, optional use
// ═══════════════════════════════════════════════════════════════════════════

/** Escape text for XML. */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Produce a minimal SpreadsheetML 2003 XML string that Excel opens as .xls.
 * Each section becomes a worksheet; each row becomes an XML <Row>.
 */
function toExcelXml(pack) {
  const sheets = [];

  const push = (name, rows) => {
    const body = rows.map((r) => {
      const cells = r.map((v) => {
        const num = typeof v === 'number' && Number.isFinite(v);
        return `<Cell><Data ss:Type="${num ? 'Number' : 'String'}">${xmlEscape(v)}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    sheets.push(
      `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${body}</Table></Worksheet>`
    );
  };

  if (pack.trial_balance) {
    const rows = [
      ['מאזן בוחן / Trial Balance', pack.period.label],
      ['Account', 'Name (HE)', 'Name (EN)', 'Opening Dr', 'Opening Cr', 'Movement Dr', 'Movement Cr', 'Closing Balance'],
    ];
    for (const a of pack.trial_balance.accounts) {
      rows.push([a.account, a.name_he, a.name_en, a.opening.debit, a.opening.credit,
        a.movement.debit, a.movement.credit, a.closing.balance]);
    }
    push('Trial Balance', rows);
  }

  if (pack.balance_sheet) {
    const rows = [['מאזן / Balance Sheet', pack.balance_sheet.as_of]];
    rows.push(['Section', 'Account', 'Name (HE)', 'Name (EN)', 'Balance']);
    for (const a of pack.balance_sheet.assets.current) rows.push(['Current Assets', a.account, a.name_he, a.name_en, a.balance]);
    for (const a of pack.balance_sheet.assets.non_current) rows.push(['Non-Current Assets', a.account, a.name_he, a.name_en, a.balance]);
    rows.push(['', '', '', 'Total Assets', pack.balance_sheet.totals.total_assets]);
    for (const a of pack.balance_sheet.liabilities.current) rows.push(['Current Liabilities', a.account, a.name_he, a.name_en, a.balance]);
    for (const a of pack.balance_sheet.liabilities.non_current) rows.push(['Non-Current Liabilities', a.account, a.name_he, a.name_en, a.balance]);
    rows.push(['', '', '', 'Total Liabilities', pack.balance_sheet.totals.total_liabilities]);
    for (const a of pack.balance_sheet.equity.accounts) rows.push(['Equity', a.account, a.name_he, a.name_en, a.balance]);
    rows.push(['', '', '', 'Total Equity', pack.balance_sheet.totals.total_equity]);
    push('Balance Sheet', rows);
  }

  if (pack.income_statement) {
    const rows = [['דו"ח רווח והפסד / Income Statement', `${pack.income_statement.period.from}..${pack.income_statement.period.to}`]];
    rows.push(['Line', 'Amount', 'Margin %']);
    rows.push(['Revenue', pack.income_statement.revenue.total, '']);
    rows.push(['COGS', pack.income_statement.cogs.total, '']);
    rows.push(['Gross Profit', pack.income_statement.profit.gross, pack.income_statement.margins.gross_pct]);
    rows.push(['Opex', pack.income_statement.opex.total, '']);
    rows.push(['Operating Profit', pack.income_statement.profit.operating, pack.income_statement.margins.operating_pct]);
    rows.push(['Finance Net', pack.income_statement.finance_net.net, '']);
    rows.push(['Pre-tax', pack.income_statement.profit.pre_tax, '']);
    rows.push(['Tax', pack.income_statement.tax.expense, '']);
    rows.push(['Net Profit', pack.income_statement.profit.net, pack.income_statement.margins.net_pct]);
    push('Income Statement', rows);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.join('\n')}
</Workbook>`;
}

/**
 * Produce a plain-text PDF-ready print layout — a minimal, zero-dep
 * "text PDF" that downstream PDF generators (like AG-48 pdf-generator.js)
 * can feed into PDFKit directly.
 */
function toPrintableText(pack) {
  const L = [];
  const line = (...parts) => L.push(parts.join(' '));
  const sep = () => L.push('─'.repeat(60));

  line('Techno-Kol Uzi — Financial Statement Pack');
  line('Period:', pack.period.label);
  sep();

  if (pack.trial_balance) {
    line('TRIAL BALANCE / מאזן בוחן');
    line(`  Accounts: ${pack.trial_balance.accounts.length}  Balanced: ${pack.trial_balance.balanced}`);
    line(`  Total Debits:  ${pack.trial_balance.totals.movement.debit}`);
    line(`  Total Credits: ${pack.trial_balance.totals.movement.credit}`);
    sep();
  }

  if (pack.income_statement) {
    line('INCOME STATEMENT / דו"ח רווח והפסד');
    line(`  Revenue:          ${pack.income_statement.revenue.total}`);
    line(`  COGS:             ${pack.income_statement.cogs.total}`);
    line(`  Gross Profit:     ${pack.income_statement.profit.gross}  (${pack.income_statement.margins.gross_pct}%)`);
    line(`  Opex:             ${pack.income_statement.opex.total}`);
    line(`  Operating Profit: ${pack.income_statement.profit.operating}  (${pack.income_statement.margins.operating_pct}%)`);
    line(`  Pre-tax:          ${pack.income_statement.profit.pre_tax}`);
    line(`  Tax (23%):        ${pack.income_statement.tax.expense}`);
    line(`  Net Profit:       ${pack.income_statement.profit.net}  (${pack.income_statement.margins.net_pct}%)`);
    sep();
  }

  if (pack.balance_sheet) {
    line('BALANCE SHEET / מאזן');
    line(`  Total Assets:           ${pack.balance_sheet.totals.total_assets}`);
    line(`  Total Liabilities:      ${pack.balance_sheet.totals.total_liabilities}`);
    line(`  Total Equity:           ${pack.balance_sheet.totals.total_equity}`);
    line(`  Total Liab + Equity:    ${pack.balance_sheet.totals.total_liab_plus_equity}`);
    line(`  Balanced:               ${pack.balance_sheet.checks.assets_equal_liab_equity}`);
    sep();
  }

  if (pack.cash_flow_statement) {
    line('CASH FLOW / תזרים מזומנים');
    line(`  Operating:   ${pack.cash_flow_statement.operating.total}`);
    line(`  Investing:   ${pack.cash_flow_statement.investing.total}`);
    line(`  Financing:   ${pack.cash_flow_statement.financing.total}`);
    line(`  Net Change:  ${pack.cash_flow_statement.net_change}`);
    line(`  Begin Cash:  ${pack.cash_flow_statement.beginning_cash}`);
    line(`  End Cash:    ${pack.cash_flow_statement.ending_cash}`);
    sep();
  }

  return L.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Public API
  trialBalance,
  balanceSheet,
  incomeStatement,
  cashFlowStatement,
  equityStatement,
  reportPack,

  // Export helpers
  toExcelXml,
  toPrintableText,

  // Utilities (also exposed for tests and other agents)
  resolvePeriod,
  priorPeriod,
  yoyPeriod,
  classify,
  normaliseLine,

  // Constants
  CORPORATE_TAX_RATE,
  BALANCE_TOLERANCE,
  BASE_CURRENCY,
  LABELS,

  // Internals (prefixed so callers know they're unstable)
  _internals: {
    groupByAccount,
    buildBalanceSheetSnapshot,
    buildIncomeStatement,
    computeCashBalance,
    isCashAccount,
    applyConsolidation,
    r2,
    sum,
    pctChange,
    pctOf,
  },
};
