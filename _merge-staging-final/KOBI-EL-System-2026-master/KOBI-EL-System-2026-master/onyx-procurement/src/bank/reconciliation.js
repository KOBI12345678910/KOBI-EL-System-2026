/**
 * Automatic Bank Reconciliation Engine  |  התאמה בנקאית אוטומטית
 * =================================================================
 *
 * Agent X-37  |  Swarm 3C  |  Techno-Kol Uzi mega-ERP
 * Project: onyx-procurement / bank / reconciliation
 *
 * Zero-dependency, Hebrew-bilingual, never-delete reconciliation engine that
 * matches a parsed bank statement against the general ledger using a
 * multi-pass ladder of progressively looser rules.
 *
 * Integrates with (but does not touch):
 *   • src/bank/matcher.js              (existing pair scorer)
 *   • src/bank/multi-format-parser.js  (Agent 69 multi-format parser)
 *   • src/bank/parsers.js              (legacy CSV / MT940 parser)
 *
 * This module owns the *state machine* around a reconciliation session:
 * draft → in_progress → completed(locked).  It never deletes matches — the
 * undoMatch operation moves them to an `unmatched` history slot while keeping
 * a permanent audit trail entry.
 *
 * ────────────────────────────────────────────────────────────────
 *  MULTI-PASS MATCHING LADDER
 * ────────────────────────────────────────────────────────────────
 *   Pass 1 — EXACT        amount + date + reference       confidence 1.00
 *   Pass 2 — DATE±1       amount + date ±1 day            confidence 0.95
 *   Pass 3 — DESC±3       amount + date ±3d + desc sim    confidence 0.85
 *   Pass 4 — ROUNDING     amount ±0.01 + date             confidence 0.90
 *   Pass 5 — GROUP        sum(GL[k..k+n]) ≈ bank entry    confidence 0.80
 *   Pass 6 — SPLIT        one bank entry → multiple GL    confidence 0.80
 *   Pass 7 — FUZZY DESC   description only (Lev < 5)      confidence 0.60
 *   Pass 8 — UNMATCHED    propose adjusting journal entry
 *
 * Each pass runs over the still-unmatched pool.  A GL or bank entry that has
 * been matched in an earlier pass is not re-considered in a later one
 * (except for SPLIT, which consumes a single bank entry across many GL rows).
 *
 * ────────────────────────────────────────────────────────────────
 *  PUBLIC API
 * ────────────────────────────────────────────────────────────────
 *   startReconciliation(accountId, period) → reconId
 *   importStatement(reconId, statementData) → imported count
 *   runAutoMatch(reconId) → { matched, unmatched, suspicious }
 *   manualMatch(reconId, glEntryId, bankEntryId) → match object
 *   addAdjustment(reconId, entry) → adjustment object
 *   complete(reconId, userId) → { status: 'locked', ... }
 *   getStatus(reconId) → { matched_count, unmatched_count, difference, ... }
 *   undoMatch(reconId, matchId) → void
 *
 *   loadGLEntries(reconId, glEntries)   ← helper to push GL data
 *   getReconciliation(reconId)          ← full object (read-only snapshot)
 *   listReconciliations()               ← all sessions in memory
 *   resetAll()                          ← test helper (clears in-memory store)
 *
 * ────────────────────────────────────────────────────────────────
 *  BILINGUAL LABELS
 * ────────────────────────────────────────────────────────────────
 * Every match, adjustment and audit trail entry carries both `label_en` and
 * `label_he`.  Error messages are bilingual too (English first, Hebrew
 * second, separated by ' | ').
 *
 * ────────────────────────────────────────────────────────────────
 *  RULES RESPECTED
 * ────────────────────────────────────────────────────────────────
 *   • Never delete — undoMatch moves, doesn't remove
 *   • Hebrew bilingual — every label/signal/error
 *   • Zero deps — only node:* built-ins (crypto for ids)
 *   • Real code — not stubs, fully exercised by the test suite
 */

'use strict';

const crypto = require('node:crypto');

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const STATUS = Object.freeze({
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  LOCKED: 'locked',
});

const MATCH_PASS = Object.freeze({
  EXACT: 'exact',
  DATE_1: 'date_pm1',
  DESC_3: 'desc_pm3',
  ROUNDING: 'rounding',
  GROUP: 'group',
  SPLIT: 'split',
  FUZZY_DESC: 'fuzzy_desc',
  MANUAL: 'manual',
});

const PASS_CONFIDENCE = Object.freeze({
  [MATCH_PASS.EXACT]: 1.00,
  [MATCH_PASS.DATE_1]: 0.95,
  [MATCH_PASS.DESC_3]: 0.85,
  [MATCH_PASS.ROUNDING]: 0.90,
  [MATCH_PASS.GROUP]: 0.80,
  [MATCH_PASS.SPLIT]: 0.80,
  [MATCH_PASS.FUZZY_DESC]: 0.60,
  [MATCH_PASS.MANUAL]: 1.00,
});

const PASS_LABELS = Object.freeze({
  [MATCH_PASS.EXACT]:       { en: 'Exact match (amount + date + reference)',       he: 'התאמה מדויקת (סכום + תאריך + אסמכתא)' },
  [MATCH_PASS.DATE_1]:      { en: 'Amount + date ±1 day',                          he: 'סכום + תאריך ±יום אחד' },
  [MATCH_PASS.DESC_3]:      { en: 'Amount + date ±3 days + similar description',   he: 'סכום + תאריך ±3 ימים + תיאור דומה' },
  [MATCH_PASS.ROUNDING]:    { en: 'Amount ±0.01 rounding + date',                  he: 'סכום ±0.01 (עיגול) + תאריך' },
  [MATCH_PASS.GROUP]:       { en: 'Grouped GL entries sum to bank entry',          he: 'קבוצת תנועות הנהלת חשבונות סוכמת לשורת בנק' },
  [MATCH_PASS.SPLIT]:       { en: 'Bank entry split across multiple GL entries',   he: 'שורת בנק מפוצלת לכמה תנועות הנהלת חשבונות' },
  [MATCH_PASS.FUZZY_DESC]:  { en: 'Fuzzy description similarity',                  he: 'דמיון תיאור מעורפל (Levenshtein)' },
  [MATCH_PASS.MANUAL]:      { en: 'Manual match by user',                          he: 'התאמה ידנית על ידי המשתמש' },
});

const ADJUSTMENT_KINDS = Object.freeze({
  BANK_FEE:  { en: 'Bank fee',            he: 'עמלת בנק' },
  INTEREST:  { en: 'Interest received',   he: 'ריבית שהתקבלה' },
  INTEREST_EXPENSE: { en: 'Interest paid', he: 'ריבית ששולמה' },
  FX_DIFF:   { en: 'FX rate difference',  he: 'הפרשי שער' },
  ERROR:     { en: 'Bank error correction', he: 'תיקון טעות בנק' },
  OTHER:     { en: 'Other adjustment',    he: 'התאמה אחרת' },
});

const DEFAULTS = Object.freeze({
  ROUNDING_TOLERANCE: 0.01,       // ±0.01 ₪
  DESC_WINDOW_DAYS:    3,
  DATE_WINDOW_DAYS:    1,
  FUZZY_LEV_MAX:       5,
  DESC_SIM_MIN:        0.5,       // Jaccard floor for "similar description"
  GROUP_MAX_MEMBERS:   5,         // sliding window cap for group/split
  SUSPICIOUS_BELOW:    0.75,      // confidence < this → suspicious list
});

// ══════════════════════════════════════════════════════════════════════
// In-memory session store
// ══════════════════════════════════════════════════════════════════════

const _sessions = new Map();

function _uid(prefix) {
  return prefix + '-' + crypto.randomBytes(6).toString('hex');
}

function _cloneDeep(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_cloneDeep);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = _cloneDeep(obj[k]);
  return out;
}

// ══════════════════════════════════════════════════════════════════════
// Utility: number / date / text
// ══════════════════════════════════════════════════════════════════════

function toNumber(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/[₪$€£,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function absAmount(entry) {
  const raw = entry && (entry.amount != null
    ? entry.amount
    : entry.gross_amount != null
      ? entry.gross_amount
      : entry.total != null
        ? entry.total
        : entry.debit != null
          ? -Math.abs(toNumber(entry.debit))
          : entry.credit != null
            ? Math.abs(toNumber(entry.credit))
            : 0);
  return Math.abs(toNumber(raw));
}

function signedAmount(entry) {
  if (entry == null) return NaN;
  if (entry.amount != null) return toNumber(entry.amount);
  if (entry.gross_amount != null) return toNumber(entry.gross_amount);
  if (entry.total != null) return toNumber(entry.total);
  if (entry.credit != null) return Math.abs(toNumber(entry.credit));
  if (entry.debit != null)  return -Math.abs(toNumber(entry.debit));
  return NaN;
}

function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  // ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function dayDiff(a, b) {
  const da = toDate(a), db = toDate(b);
  if (!da || !db) return Number.POSITIVE_INFINITY;
  return Math.abs((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

function entryDate(entry) {
  return (
    entry.transaction_date ||
    entry.value_date       ||
    entry.payment_date     ||
    entry.invoice_date     ||
    entry.posting_date     ||
    entry.date             ||
    null
  );
}

function entryReference(entry) {
  return (
    entry.reference        ||
    entry.reference_number ||
    entry.ref              ||
    entry.check_number     ||
    entry.external_id      ||
    null
  );
}

function entryDescription(entry) {
  return (
    entry.description      ||
    entry.memo             ||
    entry.narrative        ||
    entry.counterparty_name||
    entry.customer_name    ||
    entry.supplier_name    ||
    ''
  );
}

// ─────────────────────────────────────────────────────────────
// Levenshtein — two-row DP, O(min(|a|,|b|)) memory
// ─────────────────────────────────────────────────────────────

function levenshtein(a, b) {
  a = (a == null ? '' : String(a));
  b = (b == null ? '' : String(b));
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length < b.length) { const t = a; a = b; b = t; }
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = (ca === b.charCodeAt(j - 1)) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j]     + 1,
        prev[j - 1] + cost
      );
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[b.length];
}

// ─────────────────────────────────────────────────────────────
// Description similarity — Jaccard over token sets
// ─────────────────────────────────────────────────────────────

function tokenSet(s) {
  if (!s) return new Set();
  const clean = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
  return new Set(clean);
}

function jaccard(a, b) {
  const sa = tokenSet(a), sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function descSimilar(a, b, minJaccard = DEFAULTS.DESC_SIM_MIN) {
  return jaccard(a, b) >= minJaccard;
}

function fuzzyDescClose(a, b, maxLev = DEFAULTS.FUZZY_LEV_MAX) {
  const na = String(a || '').toLowerCase().trim();
  const nb = String(b || '').toLowerCase().trim();
  if (!na || !nb) return false;
  if (Math.abs(na.length - nb.length) > maxLev) return false;
  return levenshtein(na, nb) < maxLev;
}

// ══════════════════════════════════════════════════════════════════════
// Session lifecycle
// ══════════════════════════════════════════════════════════════════════

function startReconciliation(accountId, period) {
  if (accountId == null || String(accountId).trim() === '') {
    throw new Error('accountId is required | חשבון נדרש');
  }
  if (!period || !period.from || !period.to) {
    throw new Error('period must have {from,to} | תקופה חייבת לכלול מ-עד');
  }
  const df = toDate(period.from), dt = toDate(period.to);
  if (!df || !dt) throw new Error('period has invalid dates | תאריכי תקופה לא תקינים');
  if (df > dt) throw new Error('period.from > period.to | תחילה אחרי סיום');

  const reconId = _uid('recon');
  _sessions.set(reconId, {
    id: reconId,
    account_id: String(accountId),
    period: { from: period.from, to: period.to },
    status: STATUS.DRAFT,
    bank_entries: [],
    gl_entries: [],
    matches: [],
    adjustments: [],
    audit: [
      {
        id: _uid('audit'),
        ts: new Date().toISOString(),
        action: 'start_reconciliation',
        label_en: 'Reconciliation session started',
        label_he: 'סשן התאמה נפתח',
        details: { account_id: accountId, period },
      },
    ],
    opening_balance: 0,
    statement_closing_balance: 0,
    completed_by: null,
    completed_at: null,
  });
  return reconId;
}

function _mustSession(reconId) {
  const s = _sessions.get(reconId);
  if (!s) throw new Error('unknown reconId: ' + reconId + ' | מזהה התאמה לא ידוע');
  return s;
}

function _assertNotLocked(s) {
  if (s.status === STATUS.LOCKED || s.status === STATUS.COMPLETED) {
    throw new Error('reconciliation is locked | ההתאמה נעולה');
  }
}

function _audit(s, action, label_en, label_he, details) {
  s.audit.push({
    id: _uid('audit'),
    ts: new Date().toISOString(),
    action,
    label_en,
    label_he,
    details: details || {},
  });
}

// ══════════════════════════════════════════════════════════════════════
// Import statement / load GL
// ══════════════════════════════════════════════════════════════════════

function _normaliseBankEntry(raw, idx) {
  const amt = signedAmount(raw);
  return {
    id: raw.id || _uid('btx'),
    source_index: idx,
    transaction_date: raw.transaction_date || raw.date || raw.posting_date || null,
    value_date: raw.value_date || null,
    description: entryDescription(raw),
    reference: entryReference(raw),
    amount: amt,
    currency: raw.currency || 'ILS',
    balance: raw.balance != null ? toNumber(raw.balance) : null,
    counterparty_name: raw.counterparty_name || null,
    counterparty_iban: raw.counterparty_iban || null,
    external_id: raw.external_id || null,
    source_format: raw.source_format || null,
    _matched: false,
    _match_id: null,
  };
}

function _normaliseGLEntry(raw, idx) {
  const amt = signedAmount(raw);
  return {
    id: raw.id || _uid('gl'),
    source_index: idx,
    account_id: raw.account_id || null,
    transaction_date: entryDate(raw),
    description: entryDescription(raw),
    reference: entryReference(raw),
    amount: amt,
    currency: raw.currency || 'ILS',
    counterparty_name: raw.counterparty_name || raw.customer_name || raw.supplier_name || null,
    journal_id: raw.journal_id || null,
    _matched: false,
    _match_id: null,
  };
}

function importStatement(reconId, statementData) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);
  if (!Array.isArray(statementData)) {
    // Permit shape { transactions, opening_balance, closing_balance }
    if (statementData && Array.isArray(statementData.transactions)) {
      if (statementData.opening_balance != null) s.opening_balance = toNumber(statementData.opening_balance);
      if (statementData.closing_balance != null) s.statement_closing_balance = toNumber(statementData.closing_balance);
      statementData = statementData.transactions;
    } else {
      throw new Error('statementData must be an array (or {transactions:[]}) | הנתונים חייבים להיות מערך');
    }
  }
  const startIdx = s.bank_entries.length;
  for (let i = 0; i < statementData.length; i++) {
    const n = _normaliseBankEntry(statementData[i], startIdx + i);
    s.bank_entries.push(n);
  }
  if (s.status === STATUS.DRAFT) s.status = STATUS.IN_PROGRESS;
  _audit(s, 'import_statement',
    `Imported ${statementData.length} bank entries`,
    `יובאו ${statementData.length} שורות בנק`,
    { count: statementData.length });
  return statementData.length;
}

function loadGLEntries(reconId, glEntries) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);
  if (!Array.isArray(glEntries)) {
    throw new Error('glEntries must be an array | תנועות GL חייבות להיות מערך');
  }
  const startIdx = s.gl_entries.length;
  for (let i = 0; i < glEntries.length; i++) {
    const n = _normaliseGLEntry(glEntries[i], startIdx + i);
    s.gl_entries.push(n);
  }
  if (s.status === STATUS.DRAFT) s.status = STATUS.IN_PROGRESS;
  _audit(s, 'load_gl',
    `Loaded ${glEntries.length} GL entries`,
    `נטענו ${glEntries.length} תנועות הנהלת חשבונות`,
    { count: glEntries.length });
  return glEntries.length;
}

// ══════════════════════════════════════════════════════════════════════
// Core match helpers
// ══════════════════════════════════════════════════════════════════════

function _amountsEqual(a, b, tol = 0.001) {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tol;
}

function _amountsRounding(a, b, tol = DEFAULTS.ROUNDING_TOLERANCE) {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tol;
}

function _sameDirection(a, b) {
  // Both credits (positive) or both debits (negative).  NaN-safe: NaN > 0 and NaN < 0 are both false.
  const sa = a > 0 ? 1 : (a < 0 ? -1 : 0);
  const sb = b > 0 ? 1 : (b < 0 ? -1 : 0);
  return sa === sb || sa === 0 || sb === 0;
}

function _refsEqual(a, b) {
  if (!a || !b) return false;
  return String(a).trim() === String(b).trim();
}

function _mkMatch(session, passKind, bankIds, glIds, confidence, extra) {
  if (!Array.isArray(bankIds)) bankIds = [bankIds];
  if (!Array.isArray(glIds))   glIds   = [glIds];
  const labels = PASS_LABELS[passKind] || { en: passKind, he: passKind };
  const match = {
    id: _uid('match'),
    pass: passKind,
    confidence,
    label_en: labels.en,
    label_he: labels.he,
    bank_entry_ids: bankIds.slice(),
    gl_entry_ids:   glIds.slice(),
    amount: (() => {
      // Signed sum of matched bank entries (preferred reference amount)
      let sum = 0;
      for (const id of bankIds) {
        const be = session.bank_entries.find(e => e.id === id);
        if (be) sum += be.amount || 0;
      }
      return sum;
    })(),
    created_at: new Date().toISOString(),
    created_by: (extra && extra.created_by) || 'system',
    criteria: (extra && extra.criteria) || {},
    suspicious: confidence < DEFAULTS.SUSPICIOUS_BELOW,
  };
  // Apply to session
  for (const id of bankIds) {
    const be = session.bank_entries.find(e => e.id === id);
    if (be) { be._matched = true; be._match_id = match.id; }
  }
  for (const id of glIds) {
    const ge = session.gl_entries.find(e => e.id === id);
    if (ge) { ge._matched = true; ge._match_id = match.id; }
  }
  session.matches.push(match);
  _audit(session, 'match_created',
    `Match ${match.pass} @${confidence.toFixed(2)} [${bankIds.length}↔${glIds.length}]`,
    `התאמה ${match.pass} @${confidence.toFixed(2)} [${bankIds.length}↔${glIds.length}]`,
    { match_id: match.id, pass: passKind, confidence });
  return match;
}

// ══════════════════════════════════════════════════════════════════════
// PASS IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════════════

function _passExact(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    const ref = entryReference(b);
    for (const g of session.gl_entries) {
      if (g._matched) continue;
      if (!_sameDirection(b.amount, g.amount)) continue;
      if (!_amountsEqual(b.amount, g.amount, 0.005)) continue;
      if (dayDiff(b.transaction_date, g.transaction_date) > 0) continue;
      if (!_refsEqual(ref, entryReference(g))) continue;
      _mkMatch(session, MATCH_PASS.EXACT, b.id, g.id, PASS_CONFIDENCE[MATCH_PASS.EXACT], {
        criteria: { amount: 'exact', date: 'same_day', reference: 'exact' },
      });
      count++;
      break;
    }
  }
  return count;
}

function _passDatePm1(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    for (const g of session.gl_entries) {
      if (g._matched) continue;
      if (!_sameDirection(b.amount, g.amount)) continue;
      if (!_amountsEqual(b.amount, g.amount, 0.005)) continue;
      const dd = dayDiff(b.transaction_date, g.transaction_date);
      if (dd > DEFAULTS.DATE_WINDOW_DAYS) continue;
      _mkMatch(session, MATCH_PASS.DATE_1, b.id, g.id, PASS_CONFIDENCE[MATCH_PASS.DATE_1], {
        criteria: { amount: 'exact', date: `within_${DEFAULTS.DATE_WINDOW_DAYS}_day`, day_diff: dd },
      });
      count++;
      break;
    }
  }
  return count;
}

function _passDescPm3(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    for (const g of session.gl_entries) {
      if (g._matched) continue;
      if (!_sameDirection(b.amount, g.amount)) continue;
      if (!_amountsEqual(b.amount, g.amount, 0.005)) continue;
      const dd = dayDiff(b.transaction_date, g.transaction_date);
      if (dd > DEFAULTS.DESC_WINDOW_DAYS) continue;
      if (!descSimilar(b.description, g.description)) continue;
      _mkMatch(session, MATCH_PASS.DESC_3, b.id, g.id, PASS_CONFIDENCE[MATCH_PASS.DESC_3], {
        criteria: { amount: 'exact', date: `within_${DEFAULTS.DESC_WINDOW_DAYS}_days`, day_diff: dd, description: 'similar' },
      });
      count++;
      break;
    }
  }
  return count;
}

function _passRounding(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    for (const g of session.gl_entries) {
      if (g._matched) continue;
      if (!_sameDirection(b.amount, g.amount)) continue;
      if (_amountsEqual(b.amount, g.amount, 0.005)) continue; // skip exact — that's pass 1/2
      if (!_amountsRounding(b.amount, g.amount)) continue;
      if (dayDiff(b.transaction_date, g.transaction_date) > 0) continue;
      _mkMatch(session, MATCH_PASS.ROUNDING, b.id, g.id, PASS_CONFIDENCE[MATCH_PASS.ROUNDING], {
        criteria: { amount: 'rounding', diff: Math.abs(Math.abs(b.amount) - Math.abs(g.amount)) },
      });
      count++;
      break;
    }
  }
  return count;
}

/**
 * PASS 5 — GROUP:  multiple GL entries sum to one bank entry.
 * We pick the bank entry first (bigger aggregation target) and look for a
 * window of 2..GROUP_MAX_MEMBERS same-direction unmatched GL entries whose
 * signed sum equals the bank entry (within 0.01).  Date window is DESC_WINDOW_DAYS.
 * Greedy first-fit — not optimal, but deterministic and fast.
 */
function _passGroup(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    const candidates = session.gl_entries.filter(g =>
      !g._matched &&
      _sameDirection(b.amount, g.amount) &&
      dayDiff(b.transaction_date, g.transaction_date) <= DEFAULTS.DESC_WINDOW_DAYS
    );
    if (candidates.length < 2) continue;
    // Subset enumeration up to GROUP_MAX_MEMBERS
    const found = _findSubsetSum(candidates, b.amount, DEFAULTS.GROUP_MAX_MEMBERS);
    if (found && found.length >= 2) {
      _mkMatch(session, MATCH_PASS.GROUP, b.id, found.map(e => e.id), PASS_CONFIDENCE[MATCH_PASS.GROUP], {
        criteria: { type: 'group', gl_count: found.length, target_amount: b.amount },
      });
      count++;
    }
  }
  return count;
}

/**
 * PASS 6 — SPLIT:  one bank entry split across multiple GL entries (same
 * scenario as GROUP from the other direction — here we scan GL aggregations
 * that match *partial* bank entries).  We also handle the mirror case:
 * multiple bank entries summing to one GL entry.
 */
function _passSplit(session) {
  let count = 0;
  for (const g of session.gl_entries) {
    if (g._matched) continue;
    const candidates = session.bank_entries.filter(b =>
      !b._matched &&
      _sameDirection(g.amount, b.amount) &&
      dayDiff(g.transaction_date, b.transaction_date) <= DEFAULTS.DESC_WINDOW_DAYS
    );
    if (candidates.length < 2) continue;
    const found = _findSubsetSum(candidates, g.amount, DEFAULTS.GROUP_MAX_MEMBERS);
    if (found && found.length >= 2) {
      _mkMatch(session, MATCH_PASS.SPLIT, found.map(e => e.id), g.id, PASS_CONFIDENCE[MATCH_PASS.SPLIT], {
        criteria: { type: 'split', bank_count: found.length, target_amount: g.amount },
      });
      count++;
    }
  }
  return count;
}

/**
 * Subset-sum finder — backtracking with pruning.  Deterministic.
 * Returns array of entries whose amounts sum to target (within 0.01) or null.
 * Keeps size ≤ maxSize.  Amount comparison is on absolute value.
 */
function _findSubsetSum(entries, target, maxSize) {
  const absTarget = Math.abs(target);
  const pool = entries.map(e => ({ e, a: Math.abs(e.amount) }))
    .filter(x => Number.isFinite(x.a) && x.a > 0 && x.a <= absTarget + DEFAULTS.ROUNDING_TOLERANCE)
    .sort((x, y) => y.a - x.a);
  const picked = [];
  function bt(i, remaining) {
    if (Math.abs(remaining) <= DEFAULTS.ROUNDING_TOLERANCE && picked.length >= 2) return true;
    if (picked.length >= maxSize) return false;
    if (remaining < -DEFAULTS.ROUNDING_TOLERANCE) return false;
    for (let j = i; j < pool.length; j++) {
      if (pool[j].a > remaining + DEFAULTS.ROUNDING_TOLERANCE) continue;
      picked.push(pool[j].e);
      if (bt(j + 1, remaining - pool[j].a)) return true;
      picked.pop();
    }
    return false;
  }
  return bt(0, absTarget) ? picked.slice() : null;
}

function _passFuzzyDesc(session) {
  let count = 0;
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    // Skip entries with no description at all — otherwise we over-match.
    if (!b.description || String(b.description).trim().length < 3) continue;
    for (const g of session.gl_entries) {
      if (g._matched) continue;
      if (!_sameDirection(b.amount, g.amount)) continue;
      if (!g.description || String(g.description).trim().length < 3) continue;
      if (!fuzzyDescClose(b.description, g.description)) continue;
      _mkMatch(session, MATCH_PASS.FUZZY_DESC, b.id, g.id, PASS_CONFIDENCE[MATCH_PASS.FUZZY_DESC], {
        criteria: { description: 'fuzzy_levenshtein' },
      });
      count++;
      break;
    }
  }
  return count;
}

// ══════════════════════════════════════════════════════════════════════
// runAutoMatch — the main driver
// ══════════════════════════════════════════════════════════════════════

function runAutoMatch(reconId) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);

  const stats = { matched: 0, unmatched: 0, suspicious: 0, by_pass: {} };

  const order = [
    [MATCH_PASS.EXACT,     _passExact],
    [MATCH_PASS.DATE_1,    _passDatePm1],
    [MATCH_PASS.DESC_3,    _passDescPm3],
    [MATCH_PASS.ROUNDING,  _passRounding],
    [MATCH_PASS.GROUP,     _passGroup],
    [MATCH_PASS.SPLIT,     _passSplit],
    [MATCH_PASS.FUZZY_DESC, _passFuzzyDesc],
  ];
  for (const [name, fn] of order) {
    const c = fn(s);
    stats.by_pass[name] = c;
    stats.matched += c;
  }

  stats.unmatched = s.bank_entries.filter(b => !b._matched).length
                  + s.gl_entries.filter(g => !g._matched).length;

  stats.suspicious = s.matches.filter(m => m.suspicious).length;

  // Unmatched → propose adjusting entries (no write — just proposals)
  stats.proposed_adjustments = _proposeAdjustments(s);

  _audit(s, 'auto_match_run',
    `Auto-match created ${stats.matched} matches, ${stats.unmatched} items unmatched`,
    `הרצת התאמה אוטומטית יצרה ${stats.matched} התאמות, ${stats.unmatched} פריטים לא תואמים`,
    { stats: { matched: stats.matched, unmatched: stats.unmatched, suspicious: stats.suspicious } });

  return stats;
}

function _proposeAdjustments(session) {
  const proposals = [];
  for (const b of session.bank_entries) {
    if (b._matched) continue;
    const desc = (b.description || '').toLowerCase();
    let kind = 'OTHER';
    if (/fee|עמל/i.test(desc))        kind = 'BANK_FEE';
    else if (/interest|ריבית/i.test(desc)) kind = b.amount >= 0 ? 'INTEREST' : 'INTEREST_EXPENSE';
    else if (/fx|שער|exchange/i.test(desc)) kind = 'FX_DIFF';
    const labels = ADJUSTMENT_KINDS[kind] || ADJUSTMENT_KINDS.OTHER;
    proposals.push({
      bank_entry_id: b.id,
      proposed_kind: kind,
      amount: b.amount,
      date: b.transaction_date,
      label_en: `Propose ${labels.en} adjustment`,
      label_he: `הצעה להתאמת ${labels.he}`,
      description: b.description,
    });
  }
  return proposals;
}

// ══════════════════════════════════════════════════════════════════════
// Manual operations
// ══════════════════════════════════════════════════════════════════════

function manualMatch(reconId, glEntryId, bankEntryId) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);
  const ge = s.gl_entries.find(e => e.id === glEntryId);
  const be = s.bank_entries.find(e => e.id === bankEntryId);
  if (!ge) throw new Error('gl entry not found: ' + glEntryId + ' | תנועת GL לא נמצאה');
  if (!be) throw new Error('bank entry not found: ' + bankEntryId + ' | שורת בנק לא נמצאה');
  if (ge._matched || be._matched) {
    throw new Error('one of the entries is already matched | אחת התנועות כבר תואמה');
  }
  const m = _mkMatch(s, MATCH_PASS.MANUAL, be.id, ge.id, PASS_CONFIDENCE[MATCH_PASS.MANUAL], {
    created_by: 'user',
    criteria: { type: 'manual' },
  });
  _audit(s, 'manual_match',
    `Manual match ${be.id} ↔ ${ge.id}`,
    `התאמה ידנית ${be.id} ↔ ${ge.id}`,
    { bank_entry_id: be.id, gl_entry_id: ge.id, match_id: m.id });
  return m;
}

function undoMatch(reconId, matchId) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);
  const idx = s.matches.findIndex(m => m.id === matchId);
  if (idx === -1) throw new Error('match not found: ' + matchId + ' | התאמה לא נמצאה');
  const m = s.matches[idx];
  // Release the entries (never delete the match — move to history)
  for (const id of m.bank_entry_ids) {
    const be = s.bank_entries.find(e => e.id === id);
    if (be) { be._matched = false; be._match_id = null; }
  }
  for (const id of m.gl_entry_ids) {
    const ge = s.gl_entries.find(e => e.id === id);
    if (ge) { ge._matched = false; ge._match_id = null; }
  }
  m.undone = true;
  m.undone_at = new Date().toISOString();
  _audit(s, 'undo_match',
    `Undo match ${matchId} (${m.pass}, ${m.confidence.toFixed(2)})`,
    `ביטול התאמה ${matchId} (${m.pass}, ${m.confidence.toFixed(2)})`,
    { match_id: matchId });
  // Do NOT remove m from the array — never-delete rule.
}

function addAdjustment(reconId, entry) {
  const s = _mustSession(reconId);
  _assertNotLocked(s);
  if (!entry || typeof entry !== 'object') {
    throw new Error('adjustment entry is required | רשומת התאמה נדרשת');
  }
  const kind = entry.kind && ADJUSTMENT_KINDS[entry.kind] ? entry.kind : 'OTHER';
  const labels = ADJUSTMENT_KINDS[kind];
  const amount = toNumber(entry.amount);
  if (!Number.isFinite(amount)) {
    throw new Error('adjustment amount must be a number | סכום התאמה חייב להיות מספר');
  }
  const adj = {
    id: _uid('adj'),
    kind,
    amount,
    date: entry.date || new Date().toISOString().slice(0, 10),
    description: entry.description || labels.en,
    label_en: labels.en,
    label_he: labels.he,
    bank_entry_id: entry.bank_entry_id || null,
    created_at: new Date().toISOString(),
    created_by: entry.created_by || 'user',
  };
  s.adjustments.push(adj);
  // If the adjustment is tied to a bank entry, consume it (mark matched).
  if (adj.bank_entry_id) {
    const be = s.bank_entries.find(e => e.id === adj.bank_entry_id);
    if (be && !be._matched) {
      be._matched = true;
      be._match_id = 'adj:' + adj.id;
    }
  }
  _audit(s, 'adjustment_added',
    `${labels.en} adjustment ₪${amount.toFixed(2)}`,
    `התאמת ${labels.he} ₪${amount.toFixed(2)}`,
    { adjustment_id: adj.id, kind, amount });
  return adj;
}

// ══════════════════════════════════════════════════════════════════════
// Status / balance / completion
// ══════════════════════════════════════════════════════════════════════

function _sumAmounts(list, filter) {
  let s = 0;
  for (const x of list) {
    if (filter && !filter(x)) continue;
    const a = toNumber(x.amount);
    if (Number.isFinite(a)) s += a;
  }
  return s;
}

function getStatus(reconId) {
  const s = _mustSession(reconId);
  const activeMatches = s.matches.filter(m => !m.undone);
  const matchedBankSum = _sumAmounts(s.bank_entries, b => b._matched);
  const matchedGLSum   = _sumAmounts(s.gl_entries,   g => g._matched);
  const unmatchedBankSum = _sumAmounts(s.bank_entries, b => !b._matched);
  const unmatchedGLSum   = _sumAmounts(s.gl_entries,   g => !g._matched);
  const adjustmentsSum = _sumAmounts(s.adjustments);

  // Reconciled balance calc:
  //   opening + Σ(matched bank) + Σ(adjustments)  should equal statement_closing_balance
  const reconciledBalance = toNumber(s.opening_balance) + matchedBankSum + adjustmentsSum;
  const difference = s.statement_closing_balance - reconciledBalance;

  return {
    recon_id: s.id,
    account_id: s.account_id,
    period: s.period,
    status: s.status,
    matched_count: activeMatches.length,
    undone_count: s.matches.length - activeMatches.length,
    unmatched_count: s.bank_entries.filter(b => !b._matched).length
                   + s.gl_entries.filter(g => !g._matched).length,
    unmatched_bank_count: s.bank_entries.filter(b => !b._matched).length,
    unmatched_gl_count:   s.gl_entries.filter(g => !g._matched).length,
    suspicious_count: activeMatches.filter(m => m.suspicious).length,
    adjustments_count: s.adjustments.length,
    matched_bank_sum: matchedBankSum,
    matched_gl_sum: matchedGLSum,
    unmatched_bank_sum: unmatchedBankSum,
    unmatched_gl_sum: unmatchedGLSum,
    adjustments_sum: adjustmentsSum,
    opening_balance: s.opening_balance,
    statement_closing_balance: s.statement_closing_balance,
    reconciled_balance: reconciledBalance,
    difference,
    is_balanced: Math.abs(difference) < DEFAULTS.ROUNDING_TOLERANCE,
    label_en: 'Reconciliation status',
    label_he: 'מצב התאמה',
  };
}

function complete(reconId, userId) {
  const s = _mustSession(reconId);
  if (s.status === STATUS.LOCKED) {
    throw new Error('reconciliation already locked | ההתאמה כבר נעולה');
  }
  if (!userId || String(userId).trim() === '') {
    throw new Error('userId is required to complete | נדרש משתמש לסגירה');
  }
  const status = getStatus(reconId);
  if (status.unmatched_count > 0) {
    throw new Error('there are still unmatched entries | יש פריטים שלא תואמו');
  }
  if (!status.is_balanced) {
    throw new Error(
      `reconciliation not balanced (diff=${status.difference.toFixed(2)}) | ההתאמה לא מאוזנת`
    );
  }
  s.status = STATUS.LOCKED;
  s.completed_by = userId;
  s.completed_at = new Date().toISOString();
  _audit(s, 'complete',
    'Reconciliation locked',
    'ההתאמה ננעלה',
    { user_id: userId, status });
  return {
    status: 'locked',
    recon_id: s.id,
    completed_by: userId,
    completed_at: s.completed_at,
    label_en: 'Reconciliation locked',
    label_he: 'ההתאמה ננעלה',
  };
}

// ══════════════════════════════════════════════════════════════════════
// Read-only helpers
// ══════════════════════════════════════════════════════════════════════

function getReconciliation(reconId) {
  const s = _mustSession(reconId);
  return _cloneDeep(s);
}

function listReconciliations() {
  const out = [];
  for (const s of _sessions.values()) {
    out.push({
      id: s.id,
      account_id: s.account_id,
      period: s.period,
      status: s.status,
      matches: s.matches.length,
      bank_entries: s.bank_entries.length,
      gl_entries: s.gl_entries.length,
    });
  }
  return out;
}

function resetAll() {
  _sessions.clear();
}

// ══════════════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  // Public API per spec
  startReconciliation,
  importStatement,
  runAutoMatch,
  manualMatch,
  addAdjustment,
  complete,
  getStatus,
  undoMatch,
  // Supporting ops
  loadGLEntries,
  getReconciliation,
  listReconciliations,
  resetAll,
  // Constants
  STATUS,
  MATCH_PASS,
  PASS_CONFIDENCE,
  PASS_LABELS,
  ADJUSTMENT_KINDS,
  DEFAULTS,
  // Internals (exposed for unit tests)
  _internal: {
    levenshtein,
    jaccard,
    tokenSet,
    toNumber,
    toDate,
    dayDiff,
    signedAmount,
    absAmount,
    descSimilar,
    fuzzyDescClose,
    _findSubsetSum,
    _passExact,
    _passDatePm1,
    _passDescPm3,
    _passRounding,
    _passGroup,
    _passSplit,
    _passFuzzyDesc,
    _proposeAdjustments,
  },
};
