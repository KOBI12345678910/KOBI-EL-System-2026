/**
 * Automatic Bank Reconciliation — Unit Tests | התאמה בנקאית אוטומטית — בדיקות יחידה
 * ========================================================================
 *
 * Agent X-37  |  Swarm 3C  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:  node --test test/payroll/bank-reconciliation.test.js
 *
 * 25+ cases covering every pass of the matching ladder, the full session
 * lifecycle (start → import → auto-match → adjust → complete → lock), plus
 * the defensive "never-delete" behaviours.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const R = require(path.resolve(
  __dirname, '..', '..', 'src', 'bank', 'reconciliation.js'
));

const {
  startReconciliation,
  importStatement,
  runAutoMatch,
  manualMatch,
  addAdjustment,
  complete,
  getStatus,
  undoMatch,
  loadGLEntries,
  getReconciliation,
  listReconciliations,
  resetAll,
  STATUS,
  MATCH_PASS,
  PASS_CONFIDENCE,
  DEFAULTS,
  _internal,
} = R;

// ─────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────

function bankEntry(over) {
  return Object.assign({
    id: 'btx-' + Math.random().toString(36).slice(2, 8),
    transaction_date: '2026-04-01',
    description: 'Payment from Acme Industries',
    reference: 'REF-001',
    amount: 1000,
    currency: 'ILS',
  }, over || {});
}

function glEntry(over) {
  return Object.assign({
    id: 'gl-' + Math.random().toString(36).slice(2, 8),
    transaction_date: '2026-04-01',
    description: 'Invoice Acme Industries',
    reference: 'REF-001',
    amount: 1000,
    currency: 'ILS',
    account_id: '1100',
  }, over || {});
}

function freshSession(opts = {}) {
  const reconId = startReconciliation(opts.accountId || '1100', opts.period || {
    from: '2026-04-01', to: '2026-04-30',
  });
  return reconId;
}

// ═════════════════════════════════════════════════════════════
// 1. Session lifecycle
// ═════════════════════════════════════════════════════════════

test('01. startReconciliation returns an id and initializes a draft session', () => {
  resetAll();
  const id = startReconciliation('1100', { from: '2026-04-01', to: '2026-04-30' });
  assert.match(id, /^recon-[0-9a-f]{12}$/);
  const r = getReconciliation(id);
  assert.equal(r.status, STATUS.DRAFT);
  assert.equal(r.account_id, '1100');
  assert.equal(r.bank_entries.length, 0);
  assert.equal(r.gl_entries.length, 0);
  assert.equal(r.matches.length, 0);
  assert.ok(r.audit.length >= 1, 'audit trail should start with one entry');
});

test('02. startReconciliation validates required inputs (bilingual errors)', () => {
  assert.throws(() => startReconciliation('', { from: '2026-04-01', to: '2026-04-30' }),
    /accountId is required.*חשבון נדרש/);
  assert.throws(() => startReconciliation('1100', null), /period must have.*מ-עד/);
  assert.throws(() => startReconciliation('1100', { from: 'xxx', to: '2026-04-30' }),
    /invalid dates.*לא תקינים/);
  assert.throws(() => startReconciliation('1100', { from: '2026-04-30', to: '2026-04-01' }),
    /from > period.to.*תחילה/);
});

test('03. importStatement accepts array and {transactions,opening,closing}', () => {
  resetAll();
  const id = freshSession();
  assert.equal(importStatement(id, [bankEntry(), bankEntry()]), 2);
  const id2 = freshSession();
  const n = importStatement(id2, {
    opening_balance: 5000,
    closing_balance: 6000,
    transactions: [bankEntry(), bankEntry(), bankEntry()],
  });
  assert.equal(n, 3);
  const r = getReconciliation(id2);
  assert.equal(r.opening_balance, 5000);
  assert.equal(r.statement_closing_balance, 6000);
  assert.equal(r.status, STATUS.IN_PROGRESS);
});

test('04. importStatement rejects non-array inputs with bilingual error', () => {
  resetAll();
  const id = freshSession();
  assert.throws(() => importStatement(id, 'not an array'), /array.*מערך/);
  assert.throws(() => importStatement(id, 42), /array.*מערך/);
});

// ═════════════════════════════════════════════════════════════
// 2. Pass 1 — EXACT match
// ═════════════════════════════════════════════════════════════

test('05. Pass EXACT: amount + date + reference → 1.00 confidence', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1' })]);
  loadGLEntries(id, [glEntry({ id: 'g1' })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.matched, 1);
  assert.equal(stats.by_pass[MATCH_PASS.EXACT], 1);
  assert.equal(stats.unmatched, 0);
  const r = getReconciliation(id);
  assert.equal(r.matches[0].confidence, PASS_CONFIDENCE[MATCH_PASS.EXACT]);
  assert.equal(r.matches[0].pass, MATCH_PASS.EXACT);
  assert.ok(r.matches[0].label_he.includes('התאמה מדויקת'));
});

// ═════════════════════════════════════════════════════════════
// 3. Pass 2 — DATE ±1
// ═════════════════════════════════════════════════════════════

test('06. Pass DATE_1: amount + date off by 1 day → 0.95 confidence', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', transaction_date: '2026-04-02', reference: 'X' })]);
  loadGLEntries(id, [glEntry({ id: 'g1', transaction_date: '2026-04-01', reference: 'Y' })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.matched, 1);
  assert.equal(stats.by_pass[MATCH_PASS.DATE_1], 1);
  const r = getReconciliation(id);
  assert.equal(r.matches[0].confidence, 0.95);
});

test('07. Pass DATE_1: date off by 2 days is NOT matched by this pass', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ transaction_date: '2026-04-03', reference: 'X', description: 'blah blah' })]);
  loadGLEntries(id, [glEntry({ transaction_date: '2026-04-01', reference: 'Y', description: 'blah blah' })]);
  const stats = runAutoMatch(id);
  // Still matches — falls through to DESC_3 pass (date ±3 + similar desc)
  assert.equal(stats.matched, 1);
  assert.equal(stats.by_pass[MATCH_PASS.DATE_1], 0);
  assert.equal(stats.by_pass[MATCH_PASS.DESC_3], 1);
});

// ═════════════════════════════════════════════════════════════
// 4. Pass 3 — DESC ±3
// ═════════════════════════════════════════════════════════════

test('08. Pass DESC_3: date ±3 + similar description → 0.85 confidence', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({
    id: 'b1',
    transaction_date: '2026-04-03',
    description: 'Payment Acme Industries April',
    reference: 'A',
  })]);
  loadGLEntries(id, [glEntry({
    id: 'g1',
    transaction_date: '2026-04-01',
    description: 'Acme Industries Invoice April',
    reference: 'B',
  })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.matched, 1);
  assert.equal(stats.by_pass[MATCH_PASS.DESC_3], 1);
  const r = getReconciliation(id);
  assert.equal(r.matches[0].confidence, 0.85);
});

// ═════════════════════════════════════════════════════════════
// 5. Pass 4 — ROUNDING
// ═════════════════════════════════════════════════════════════

test('09. Pass ROUNDING: amount off by 0.01 + same date → 0.90 confidence', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', amount: 1000.00, reference: 'R1' })]);
  loadGLEntries(id, [glEntry({ id: 'g1', amount: 1000.01, reference: 'R2' })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.matched, 1);
  assert.equal(stats.by_pass[MATCH_PASS.ROUNDING], 1);
  const r = getReconciliation(id);
  assert.equal(r.matches[0].confidence, 0.90);
});

// ═════════════════════════════════════════════════════════════
// 6. Pass 5 — GROUP (many GL → one bank)
// ═════════════════════════════════════════════════════════════

test('10. Pass GROUP: three GL entries summing to one bank entry → 0.80', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', amount: 600, reference: 'Z' })]);
  loadGLEntries(id, [
    glEntry({ id: 'g1', amount: 100, reference: 'A' }),
    glEntry({ id: 'g2', amount: 200, reference: 'B' }),
    glEntry({ id: 'g3', amount: 300, reference: 'C' }),
  ]);
  const stats = runAutoMatch(id);
  assert.equal(stats.by_pass[MATCH_PASS.GROUP], 1);
  const r = getReconciliation(id);
  const m = r.matches.find(x => x.pass === MATCH_PASS.GROUP);
  assert.ok(m);
  assert.equal(m.confidence, 0.80);
  assert.equal(m.gl_entry_ids.length, 3);
  assert.equal(m.bank_entry_ids.length, 1);
});

// ═════════════════════════════════════════════════════════════
// 7. Pass 6 — SPLIT (many bank → one GL)
// ═════════════════════════════════════════════════════════════

test('11. Pass SPLIT: three bank entries summing to one GL entry → 0.80', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [
    bankEntry({ id: 'b1', amount: 100, reference: 'X1' }),
    bankEntry({ id: 'b2', amount: 250, reference: 'X2' }),
    bankEntry({ id: 'b3', amount: 150, reference: 'X3' }),
  ]);
  loadGLEntries(id, [glEntry({ id: 'g1', amount: 500, reference: 'Y' })]);
  const stats = runAutoMatch(id);
  const r = getReconciliation(id);
  const m = r.matches.find(x => x.pass === MATCH_PASS.SPLIT);
  assert.ok(m, 'expected a SPLIT match');
  assert.equal(m.confidence, 0.80);
  assert.equal(m.bank_entry_ids.length, 3);
  assert.equal(m.gl_entry_ids.length, 1);
});

// ═════════════════════════════════════════════════════════════
// 8. Pass 7 — FUZZY DESC
// ═════════════════════════════════════════════════════════════

test('12. Pass FUZZY_DESC: typo in description → 0.60 confidence', () => {
  resetAll();
  const id = freshSession();
  // Amount matches, date matches, so an earlier pass should win. To isolate
  // FUZZY_DESC we make the amounts match but dates far and descriptions
  // close-but-not-similar-in-tokens.
  importStatement(id, [bankEntry({
    id: 'b1',
    amount: 1234.00,
    transaction_date: '2026-04-20',
    description: 'goldenstarr',
    reference: 'N1',
  })]);
  loadGLEntries(id, [glEntry({
    id: 'g1',
    amount: 1234.00,
    transaction_date: '2026-04-01',
    description: 'goldenstar',  // 1 edit away
    reference: 'N2',
  })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.by_pass[MATCH_PASS.FUZZY_DESC], 1);
  const r = getReconciliation(id);
  const m = r.matches.find(x => x.pass === MATCH_PASS.FUZZY_DESC);
  assert.ok(m);
  assert.equal(m.confidence, 0.60);
  assert.equal(m.suspicious, true, '0.60 < 0.75 threshold → suspicious');
});

// ═════════════════════════════════════════════════════════════
// 9. Pass 8 — UNMATCHED → proposals
// ═════════════════════════════════════════════════════════════

test('13. Unmatched bank entries produce adjustment proposals (classified)', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [
    bankEntry({ id: 'b1', description: 'Monthly bank fee', amount: -25, reference: 'F1' }),
    bankEntry({ id: 'b2', description: 'Interest credit',  amount: 12,  reference: 'I1' }),
    bankEntry({ id: 'b3', description: 'Mystery',          amount: 77,  reference: 'M1' }),
  ]);
  loadGLEntries(id, []); // no GL → everything unmatched
  const stats = runAutoMatch(id);
  assert.equal(stats.matched, 0);
  assert.ok(Array.isArray(stats.proposed_adjustments));
  assert.equal(stats.proposed_adjustments.length, 3);
  const kinds = stats.proposed_adjustments.map(p => p.proposed_kind).sort();
  assert.deepEqual(kinds, ['BANK_FEE', 'INTEREST', 'OTHER']);
});

// ═════════════════════════════════════════════════════════════
// 10. Manual operations
// ═════════════════════════════════════════════════════════════

test('14. manualMatch links two entries and records audit', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', amount: 99, reference: 'P1' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1', amount: 500, reference: 'P2' })]);
  const m = manualMatch(id, 'g1', 'b1');
  assert.equal(m.pass, MATCH_PASS.MANUAL);
  assert.equal(m.confidence, 1.00);
  const r = getReconciliation(id);
  assert.equal(r.audit.filter(a => a.action === 'manual_match').length, 1);
  assert.equal(r.bank_entries[0]._matched, true);
});

test('15. manualMatch rejects unknown ids with bilingual error', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1' })]);
  assert.throws(() => manualMatch(id, 'g-nope', 'b1'), /gl entry not found.*לא נמצאה/);
  assert.throws(() => manualMatch(id, 'g1', 'b-nope'), /bank entry not found.*לא נמצאה/);
});

test('16. manualMatch refuses already-matched entries', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1' })]);
  runAutoMatch(id); // auto-match handles it
  assert.throws(() => manualMatch(id, 'g1', 'b1'), /already matched.*כבר תואמה/);
});

// ═════════════════════════════════════════════════════════════
// 11. Undo
// ═════════════════════════════════════════════════════════════

test('17. undoMatch releases entries but keeps the match record (never-delete)', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1' })]);
  runAutoMatch(id);
  const r1 = getReconciliation(id);
  const matchId = r1.matches[0].id;

  undoMatch(id, matchId);

  const r2 = getReconciliation(id);
  // Record is still there
  assert.equal(r2.matches.length, 1);
  assert.equal(r2.matches[0].undone, true);
  assert.ok(r2.matches[0].undone_at);
  // Entries are released
  assert.equal(r2.bank_entries[0]._matched, false);
  assert.equal(r2.gl_entries[0]._matched, false);

  // Status excludes undone matches from matched_count
  const status = getStatus(id);
  assert.equal(status.matched_count, 0);
  assert.equal(status.undone_count, 1);
});

test('18. undoMatch rejects unknown match id', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1' })]);
  assert.throws(() => undoMatch(id, 'match-nope'), /not found.*לא נמצאה/);
});

// ═════════════════════════════════════════════════════════════
// 12. Adjustments
// ═════════════════════════════════════════════════════════════

test('19. addAdjustment creates a bank fee adjustment with bilingual labels', () => {
  resetAll();
  const id = freshSession();
  const adj = addAdjustment(id, { kind: 'BANK_FEE', amount: -25.50, description: 'Monthly fee' });
  assert.match(adj.id, /^adj-/);
  assert.equal(adj.kind, 'BANK_FEE');
  assert.equal(adj.amount, -25.50);
  assert.equal(adj.label_en, 'Bank fee');
  assert.equal(adj.label_he, 'עמלת בנק');
  const r = getReconciliation(id);
  assert.equal(r.adjustments.length, 1);
});

test('20. addAdjustment attached to a bank entry marks it matched (consumed)', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', amount: -25, description: 'fee' })]);
  const adj = addAdjustment(id, { kind: 'BANK_FEE', amount: -25, bank_entry_id: 'b1' });
  assert.ok(adj);
  const r = getReconciliation(id);
  assert.equal(r.bank_entries[0]._matched, true);
  assert.ok(String(r.bank_entries[0]._match_id).startsWith('adj:'));
});

test('21. addAdjustment rejects invalid amount', () => {
  resetAll();
  const id = freshSession();
  assert.throws(() => addAdjustment(id, { kind: 'BANK_FEE', amount: 'not a number' }),
    /number.*מספר/);
});

// ═════════════════════════════════════════════════════════════
// 13. Balance / status / complete
// ═════════════════════════════════════════════════════════════

test('22. getStatus computes reconciled balance and difference', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, {
    opening_balance: 5000,
    closing_balance: 6000,
    transactions: [bankEntry({ amount: 1000, reference: 'R1' })],
  });
  loadGLEntries(id, [glEntry({ amount: 1000, reference: 'R1' })]);
  runAutoMatch(id);
  const s = getStatus(id);
  assert.equal(s.matched_count, 1);
  assert.equal(s.unmatched_count, 0);
  assert.equal(s.reconciled_balance, 6000);
  assert.equal(s.difference, 0);
  assert.equal(s.is_balanced, true);
});

test('23. complete locks the session when everything is balanced', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, {
    opening_balance: 1000,
    closing_balance: 2000,
    transactions: [bankEntry({ amount: 1000, reference: 'X' })],
  });
  loadGLEntries(id, [glEntry({ amount: 1000, reference: 'X' })]);
  runAutoMatch(id);
  const r = complete(id, 'user-42');
  assert.equal(r.status, 'locked');
  assert.equal(r.completed_by, 'user-42');
  const session = getReconciliation(id);
  assert.equal(session.status, STATUS.LOCKED);
  // Mutations must fail after lock
  assert.throws(() => importStatement(id, [bankEntry()]), /locked.*נעולה/);
  assert.throws(() => manualMatch(id, 'g', 'b'), /locked.*נעולה/);
  assert.throws(() => undoMatch(id, 'x'), /locked.*נעולה/);
});

test('24. complete refuses when unbalanced or unmatched entries remain', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, {
    opening_balance: 0,
    closing_balance: 100,
    transactions: [bankEntry({ amount: 50, reference: 'R' })],
  });
  loadGLEntries(id, []);
  runAutoMatch(id);
  assert.throws(() => complete(id, 'u'), /unmatched.*לא תואמו/);
});

test('25. complete requires userId', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, {
    opening_balance: 0,
    closing_balance: 0,
    transactions: [],
  });
  loadGLEntries(id, []);
  runAutoMatch(id);
  assert.throws(() => complete(id, ''), /userId is required.*משתמש/);
});

// ═════════════════════════════════════════════════════════════
// 14. Suspicious + audit
// ═════════════════════════════════════════════════════════════

test('26. Suspicious count reflects matches below the threshold', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({
    id: 'b1', amount: 7777, transaction_date: '2026-04-20',
    description: 'typo-alphax', reference: 'P',
  })]);
  loadGLEntries(id, [glEntry({
    id: 'g1', amount: 7777, transaction_date: '2026-04-01',
    description: 'typo-alpha', reference: 'Q',
  })]);
  const stats = runAutoMatch(id);
  assert.equal(stats.suspicious, 1);
});

test('27. Audit trail records every user action, in order, never deleted', () => {
  resetAll();
  const id = freshSession();
  importStatement(id, [bankEntry({ id: 'b1', reference: 'R' })]);
  loadGLEntries(id,   [glEntry({   id: 'g1', reference: 'R' })]);
  runAutoMatch(id);
  const firstMatchId = getReconciliation(id).matches[0].id;
  undoMatch(id, firstMatchId);
  manualMatch(id, 'g1', 'b1');
  addAdjustment(id, { kind: 'INTEREST', amount: 10 });

  const r = getReconciliation(id);
  const actions = r.audit.map(a => a.action);
  assert.ok(actions.includes('start_reconciliation'));
  assert.ok(actions.includes('import_statement'));
  assert.ok(actions.includes('load_gl'));
  assert.ok(actions.includes('auto_match_run'));
  assert.ok(actions.includes('undo_match'));
  assert.ok(actions.includes('manual_match'));
  assert.ok(actions.includes('adjustment_added'));
  // Timestamps strictly increasing
  for (let i = 1; i < r.audit.length; i++) {
    assert.ok(r.audit[i].ts >= r.audit[i - 1].ts);
  }
  // Every audit entry has bilingual labels
  for (const e of r.audit) {
    assert.ok(e.label_en && typeof e.label_en === 'string');
    assert.ok(e.label_he && typeof e.label_he === 'string');
  }
});

// ═════════════════════════════════════════════════════════════
// 15. Internals — Levenshtein / jaccard / subset-sum
// ═════════════════════════════════════════════════════════════

test('28. Levenshtein & jaccard internals', () => {
  assert.equal(_internal.levenshtein('kitten', 'sitting'), 3);
  assert.equal(_internal.levenshtein('', 'abc'), 3);
  assert.equal(_internal.levenshtein(null, undefined), 0);
  assert.ok(_internal.jaccard('a b c', 'a b c') === 1);
  assert.ok(_internal.jaccard('alpha beta', 'gamma delta') === 0);
});

test('29. _findSubsetSum picks an exact subset or returns null', () => {
  const entries = [
    { id: 'a', amount: 100 },
    { id: 'b', amount: 200 },
    { id: 'c', amount: 300 },
    { id: 'd', amount: 50 },
  ];
  const ok = _internal._findSubsetSum(entries, 350, 4);
  assert.ok(ok);
  const sum = ok.reduce((s, e) => s + e.amount, 0);
  assert.ok(Math.abs(sum - 350) < 0.01);
  // Impossible target
  assert.equal(_internal._findSubsetSum(entries, 10000, 4), null);
});

test('30. listReconciliations returns summaries only', () => {
  resetAll();
  const id1 = freshSession({ accountId: 'A' });
  const id2 = freshSession({ accountId: 'B' });
  importStatement(id1, [bankEntry()]);
  const list = listReconciliations();
  assert.equal(list.length, 2);
  const item1 = list.find(x => x.id === id1);
  const item2 = list.find(x => x.id === id2);
  assert.equal(item1.account_id, 'A');
  assert.equal(item1.bank_entries, 1);
  assert.equal(item2.account_id, 'B');
  assert.equal(item2.bank_entries, 0);
});
