/**
 * Client Churn Predictor — Unit Tests
 * Agent X-06 — Swarm 3 — Techno-Kol Uzi ERP
 *
 * Run with:   node --test test/payroll/churn-predictor.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * NOTE: the suite is intentionally placed under test/payroll/ per the
 * agent brief. The module itself lives at src/analytics/churn-predictor.js.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  predictChurn,
  rankAllClients,
  generateRetentionReport,
  suggestAction,
  computeLtv,
  computeCacToLtvRatio,
  classify,
  WEIGHTS,
  CLASSIFICATION_THRESHOLDS,
  SIGNAL_LABELS,
  __internal__,
} = require(path.resolve(__dirname, '..', '..', 'src', 'analytics', 'churn-predictor.js'));

// ─── fixtures ──────────────────────────────────────────────────────────────

const REF = new Date('2026-04-11T00:00:00Z');

function daysAgo(n) {
  const d = new Date(REF.getTime());
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/**
 * Build a "healthy, steady" client that invoices roughly once a week for
 * a full year, pays on time, and chats with the rep regularly.
 */
function makeHealthyHistory() {
  const invoices = [];
  for (let i = 0; i < 52; i++) {
    invoices.push({ date: daysAgo(i * 7 + 1), amount: 5000 });
  }
  const orders = invoices.map((inv) => ({ date: inv.date }));
  const contacts = [];
  for (let i = 0; i < 12; i++) contacts.push({ at: daysAgo(i * 14 + 3) });
  return {
    invoices,
    orders,
    disputes: [],
    tickets: [],
    quotes: [],
    info_changes: [],
    contacts,
    reference_date: REF.toISOString(),
  };
}

/**
 * Build a "critical" client — everything is going wrong.
 * - Frequent invoices in the old window, near-silence in the last 90d.
 * - A drop in average invoice amount.
 * - Order gap widening.
 * - Late payments rising.
 * - Unresolved disputes.
 * - Critical support tickets.
 * - Cancelled quotes.
 * - Bank account changed recently.
 * - Contact frequency dropped.
 */
function makeCriticalHistory() {
  const invoices = [];
  // 365..91 days ago: 30 invoices of 10_000
  for (let i = 0; i < 30; i++) {
    invoices.push({ date: daysAgo(100 + i * 9), amount: 10000 });
  }
  // last 90 days: only 1 tiny invoice, late
  invoices.push({ date: daysAgo(70), amount: 1500, paid_late: true, days_late: 21 });
  // baseline late ratio = 0 (nothing late in the baseline)
  for (let i = 0; i < 6; i++) {
    invoices.push({ date: daysAgo(200 + i * 10), amount: 12000 });
  }
  const orders = invoices.map((inv) => ({ date: inv.date }));
  return {
    invoices,
    orders,
    disputes: [
      { raised_at: daysAgo(40), resolved: false },
      { raised_at: daysAgo(15), resolved: false },
    ],
    tickets: [
      { opened_at: daysAgo(20), severity: 'critical', type: 'complaint' },
      { opened_at: daysAgo(10), severity: 'high', complaint: true },
      { opened_at: daysAgo(5), severity: 'high', complaint: true },
    ],
    quotes: [
      { created_at: daysAgo(60), status: 'cancelled' },
      { created_at: daysAgo(30), status: 'cancelled' },
      { created_at: daysAgo(10), status: 'rejected' },
    ],
    info_changes: [{ changed_at: daysAgo(12), field: 'bank_account' }],
    contacts: [
      // 90..180d ago: many contacts
      { at: daysAgo(100) },
      { at: daysAgo(110) },
      { at: daysAgo(120) },
      { at: daysAgo(150) },
      { at: daysAgo(170) },
      // last 90d: nothing
    ],
    reference_date: REF.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. classify()
// ═══════════════════════════════════════════════════════════════════════════

test('classify: 0 → healthy', () => {
  assert.equal(classify(0), 'healthy');
});

test('classify: 30 → healthy (upper edge)', () => {
  assert.equal(classify(30), 'healthy');
});

test('classify: 31 → watch (lower edge)', () => {
  assert.equal(classify(31), 'watch');
});

test('classify: 60 → watch (upper edge)', () => {
  assert.equal(classify(60), 'watch');
});

test('classify: 61 → at_risk (lower edge)', () => {
  assert.equal(classify(61), 'at_risk');
});

test('classify: 80 → at_risk (upper edge)', () => {
  assert.equal(classify(80), 'at_risk');
});

test('classify: 81 → critical (lower edge)', () => {
  assert.equal(classify(81), 'critical');
});

test('classify: 100 → critical (upper edge)', () => {
  assert.equal(classify(100), 'critical');
});

test('classify: clamps values > 100 to critical', () => {
  assert.equal(classify(150), 'critical');
});

test('classify: clamps negative values to healthy', () => {
  assert.equal(classify(-20), 'healthy');
});

test('classify: bucket thresholds follow spec (0-30 / 31-60 / 61-80 / 81-100)', () => {
  assert.equal(CLASSIFICATION_THRESHOLDS.healthy.min, 0);
  assert.equal(CLASSIFICATION_THRESHOLDS.healthy.max, 30);
  assert.equal(CLASSIFICATION_THRESHOLDS.watch.min, 31);
  assert.equal(CLASSIFICATION_THRESHOLDS.watch.max, 60);
  assert.equal(CLASSIFICATION_THRESHOLDS.at_risk.min, 61);
  assert.equal(CLASSIFICATION_THRESHOLDS.at_risk.max, 80);
  assert.equal(CLASSIFICATION_THRESHOLDS.critical.min, 81);
  assert.equal(CLASSIFICATION_THRESHOLDS.critical.max, 100);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. predictChurn — healthy client baseline
// ═══════════════════════════════════════════════════════════════════════════

test('predictChurn: steady client is classified healthy', () => {
  const history = makeHealthyHistory();
  const res = predictChurn('C-001', history);
  assert.equal(res.client_id, 'C-001');
  assert.equal(res.classification, 'healthy');
  assert.ok(res.risk_score <= 30, `expected score <= 30, got ${res.risk_score}`);
  assert.ok(Array.isArray(res.signals));
  assert.ok(res.signals.length >= 10);
});

test('predictChurn: return shape always includes required fields', () => {
  const res = predictChurn('C-X', makeHealthyHistory());
  assert.ok('risk_score' in res);
  assert.ok('classification' in res);
  assert.ok('signals' in res);
  assert.ok('suggested_actions' in res);
  assert.equal(typeof res.risk_score, 'number');
  assert.equal(typeof res.classification, 'string');
  assert.ok(Array.isArray(res.signals));
  assert.ok(Array.isArray(res.suggested_actions));
});

test('predictChurn: every signal has label_he + label_en + score + weight', () => {
  const res = predictChurn('C-X', makeHealthyHistory());
  for (const s of res.signals) {
    assert.ok(s.key, 'signal key');
    assert.equal(typeof s.label_he, 'string');
    assert.equal(typeof s.label_en, 'string');
    assert.ok(/[\u0590-\u05FF]/.test(s.label_he), `expected Hebrew in ${s.key}`);
    assert.equal(typeof s.score, 'number');
    assert.ok(s.score >= 0 && s.score <= 100);
    assert.equal(typeof s.weight, 'number');
  }
});

test('predictChurn: critical client crosses the critical threshold', () => {
  const history = makeCriticalHistory();
  const res = predictChurn('C-BAD', history);
  assert.ok(res.risk_score >= 61, `expected at_risk or above, got ${res.risk_score}`);
  assert.ok(
    res.classification === 'critical' || res.classification === 'at_risk',
    `expected at_risk/critical, got ${res.classification}`
  );
});

test('predictChurn: deterministic — same input twice yields identical score', () => {
  const a = predictChurn('C-DET', makeCriticalHistory());
  const b = predictChurn('C-DET', makeCriticalHistory());
  assert.equal(a.risk_score, b.risk_score);
  assert.equal(a.classification, b.classification);
  assert.equal(a.signals.length, b.signals.length);
});

test('predictChurn: empty history gives a low but non-throwing score', () => {
  const res = predictChurn('C-NEW', { reference_date: REF.toISOString() });
  assert.equal(typeof res.risk_score, 'number');
  assert.ok(res.risk_score >= 0);
  assert.ok(res.risk_score <= 100);
});

test('predictChurn: throws when clientId missing', () => {
  assert.throws(() => predictChurn(undefined, makeHealthyHistory()), /clientId/);
  assert.throws(() => predictChurn(null, makeHealthyHistory()), /clientId/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Individual signals
// ═══════════════════════════════════════════════════════════════════════════

test('signal: frequency_drop — near-total halt in last 90d', () => {
  const history = {
    invoices: [
      // 12 invoices spread across old window
      ...Array.from({ length: 12 }, (_, i) => ({ date: daysAgo(120 + i * 20), amount: 3000 })),
      // none in the recent 90d
    ],
  };
  const score = __internal__.signalFrequencyDrop(history, REF);
  assert.ok(score >= 50, `expected high freq drop, got ${score}`);
});

test('signal: amount_drop — halved average triggers mid-range signal', () => {
  const history = {
    invoices: [
      ...Array.from({ length: 6 }, (_, i) => ({ date: daysAgo(120 + i * 20), amount: 10000 })),
      ...Array.from({ length: 6 }, (_, i) => ({ date: daysAgo(10 + i * 10), amount: 5000 })),
    ],
  };
  const score = __internal__.signalAmountDrop(history, REF);
  assert.ok(score > 40 && score < 70, `expected mid-range, got ${score}`);
});

test('signal: disputes — unresolved recent dispute adds ≥50', () => {
  const score = __internal__.signalDisputes(
    { disputes: [{ raised_at: daysAgo(30), resolved: false }] },
    REF
  );
  assert.ok(score >= 50);
});

test('signal: disputes — resolved dispute contributes less', () => {
  const unresolved = __internal__.signalDisputes(
    { disputes: [{ raised_at: daysAgo(30), resolved: false }] },
    REF
  );
  const resolved = __internal__.signalDisputes(
    { disputes: [{ raised_at: daysAgo(30), resolved: true, resolved_at: daysAgo(20) }] },
    REF
  );
  assert.ok(unresolved > resolved);
});

test('signal: support_tickets — critical severity weighs more than normal', () => {
  const critical = __internal__.signalSupportTickets(
    { tickets: [{ opened_at: daysAgo(10), severity: 'critical' }] },
    REF
  );
  const normal = __internal__.signalSupportTickets(
    { tickets: [{ opened_at: daysAgo(10), severity: 'normal' }] },
    REF
  );
  assert.ok(critical > normal);
});

test('signal: cancelled_quotes — multiple cancellations without conversion', () => {
  const score = __internal__.signalCancelledQuotes(
    {
      quotes: [
        { created_at: daysAgo(30), status: 'cancelled' },
        { created_at: daysAgo(15), status: 'cancelled' },
        { created_at: daysAgo(5), status: 'cancelled' },
      ],
    },
    REF
  );
  assert.ok(score >= 40);
});

test('signal: info_changes — recent bank account change scores high', () => {
  const score = __internal__.signalInfoChanges(
    { info_changes: [{ changed_at: daysAgo(10), field: 'bank_account' }] },
    REF
  );
  assert.ok(score >= 20);
});

test('signal: contact_drop — zero recent contacts with historical activity', () => {
  const score = __internal__.signalContactDrop(
    {
      contacts: [{ at: daysAgo(120) }, { at: daysAgo(140) }, { at: daysAgo(160) }],
    },
    REF
  );
  assert.ok(score >= 50);
});

test('signal: order_gap — widening gap registers as signal', () => {
  const orders = [
    { date: daysAgo(400) },
    { date: daysAgo(380) },
    { date: daysAgo(360) },
    { date: daysAgo(340) },
    { date: daysAgo(50) }, // big jump
  ];
  const score = __internal__.signalOrderGap({ orders }, REF);
  assert.ok(score > 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Seasonal adjustment
// ═══════════════════════════════════════════════════════════════════════════

test('seasonal: explicit seasonal buyer in quiet month gets damped score', () => {
  const baseHistory = makeCriticalHistory();
  baseHistory.seasonal = true;
  // Mark April (the reference month) as a known quiet month.
  baseHistory.quiet_months = [4];
  const seasonal = predictChurn('C-SEASON', baseHistory);

  const nonSeasonal = predictChurn('C-SEASON', makeCriticalHistory());
  assert.ok(
    seasonal.risk_score < nonSeasonal.risk_score,
    `expected seasonal < non-seasonal, got ${seasonal.risk_score} vs ${nonSeasonal.risk_score}`
  );
  assert.ok(seasonal.seasonal_note, 'expected a seasonal note');
});

test('seasonal: explicit non-seasonal clients are not damped', () => {
  const history = makeCriticalHistory();
  history.seasonal = false;
  const res = predictChurn('C-NONSEASON', history);
  assert.equal(res.seasonal_note, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. suggestAction()
// ═══════════════════════════════════════════════════════════════════════════

test('suggestAction: healthy client still gets a retention suggestion', () => {
  const actions = suggestAction({ classification: 'healthy', signals: [] });
  assert.ok(actions.length >= 1);
  assert.ok(actions.some((a) => /[\u0590-\u05FF]/.test(a)), 'expected Hebrew actions');
});

test('suggestAction: critical client gets escalation actions', () => {
  const actions = suggestAction({
    classification: 'critical',
    risk_score: 92,
    signals: [
      { key: 'disputes', score: 80 },
      { key: 'late_payments', score: 70 },
    ],
  });
  assert.ok(actions.length >= 3);
  const joined = actions.join(' ');
  assert.match(joined, /פגישה|הנחה|ועדת/);
  assert.ok(actions.some((a) => a.includes('מחלוקות')));
  assert.ok(actions.some((a) => a.includes('תנאי תשלום')));
});

test('suggestAction: dedupes repeated entries', () => {
  const actions = suggestAction({
    classification: 'at_risk',
    signals: [
      { key: 'late_payments', score: 90 },
      { key: 'late_payments', score: 90 },
    ],
  });
  const set = new Set(actions);
  assert.equal(set.size, actions.length);
});

test('suggestAction: returns array for null input', () => {
  assert.deepEqual(suggestAction(null), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. rankAllClients()
// ═══════════════════════════════════════════════════════════════════════════

test('rankAllClients: sorts descending by risk_score', () => {
  const clients = [
    { id: 'A', name: 'Alpha', history: makeHealthyHistory() },
    { id: 'B', name: 'Bravo', history: makeCriticalHistory() },
    { id: 'C', name: 'Charlie', history: makeHealthyHistory() },
  ];
  const ranked = rankAllClients(clients);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].client_id, 'B');
  assert.ok(ranked[0].risk_score >= ranked[1].risk_score);
  assert.ok(ranked[1].risk_score >= ranked[2].risk_score);
});

test('rankAllClients: does not mutate input array', () => {
  const clients = [
    { id: 'A', history: makeHealthyHistory() },
    { id: 'B', history: makeCriticalHistory() },
  ];
  const snapshot = clients.map((c) => c.id);
  rankAllClients(clients);
  assert.deepEqual(clients.map((c) => c.id), snapshot);
});

test('rankAllClients: empty array → empty result', () => {
  assert.deepEqual(rankAllClients([]), []);
  assert.deepEqual(rankAllClients(null), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. generateRetentionReport()
// ═══════════════════════════════════════════════════════════════════════════

test('generateRetentionReport: returns Hebrew-bilingual string with summary', () => {
  const clients = [
    { id: 'A', name: 'Alpha', history: makeHealthyHistory() },
    { id: 'B', name: 'Bravo Ltd', history: makeCriticalHistory() },
    { id: 'C', name: 'Charlie', history: makeHealthyHistory() },
  ];
  const report = generateRetentionReport(clients, {
    reference_date: REF.toISOString(),
    top_n: 5,
  });
  assert.equal(typeof report, 'string');
  assert.ok(/[\u0590-\u05FF]/.test(report), 'report has Hebrew characters');
  assert.ok(report.includes('Client Retention Report') || report.includes('דוח שימור'));
  assert.ok(report.includes('Bravo Ltd'));
  assert.ok(report.includes('קריטי') || report.includes('critical'));
});

test('generateRetentionReport: mentions zero-delete rule in footer', () => {
  const report = generateRetentionReport([
    { id: 'A', name: 'A', history: makeHealthyHistory() },
  ]);
  assert.ok(report.includes('לא מוחקים'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. LTV / CAC
// ═══════════════════════════════════════════════════════════════════════════

test('computeLtv: sums all positive invoice amounts', () => {
  const ltv = computeLtv({
    invoices: [
      { date: daysAgo(300), amount: 1000 },
      { date: daysAgo(200), amount: 2500 },
      { date: daysAgo(100), amount: 1500 },
    ],
    reference_date: REF.toISOString(),
  });
  assert.equal(ltv.total, 5000);
  assert.ok(ltv.monthly_avg > 0);
  assert.ok(ltv.years > 0);
});

test('computeLtv: empty history → zeros', () => {
  const ltv = computeLtv({ invoices: [] });
  assert.deepEqual(ltv, { total: 0, monthly_avg: 0, years: 0 });
});

test('computeLtv: ignores negative / invalid amounts', () => {
  const ltv = computeLtv({
    invoices: [
      { date: daysAgo(200), amount: 1000 },
      { date: daysAgo(100), amount: -500 }, // ignored
      { date: daysAgo(50), amount: 'bad' }, // ignored
    ],
    reference_date: REF.toISOString(),
  });
  assert.equal(ltv.total, 1000);
});

test('computeCacToLtvRatio: healthy ratio ≥3 classified as healthy', () => {
  const client = {
    cac: 1000,
    history: {
      invoices: [
        { date: daysAgo(300), amount: 2000 },
        { date: daysAgo(200), amount: 2000 },
      ],
      reference_date: REF.toISOString(),
    },
  };
  const r = computeCacToLtvRatio(client);
  assert.equal(r.cac, 1000);
  assert.equal(r.ltv, 4000);
  assert.equal(r.ratio, 4);
  assert.equal(r.quality, 'healthy');
  assert.equal(r.quality_he, 'בריא');
});

test('computeCacToLtvRatio: excellent ≥5', () => {
  const r = computeCacToLtvRatio({
    cac: 1000,
    history: {
      invoices: [{ date: daysAgo(200), amount: 6000 }],
      reference_date: REF.toISOString(),
    },
  });
  assert.equal(r.quality, 'excellent');
  assert.equal(r.quality_he, 'מצוין');
});

test('computeCacToLtvRatio: loss when ratio < 1', () => {
  const r = computeCacToLtvRatio({
    cac: 5000,
    history: {
      invoices: [{ date: daysAgo(200), amount: 1000 }],
      reference_date: REF.toISOString(),
    },
  });
  assert.equal(r.quality, 'loss');
  assert.equal(r.quality_he, 'הפסדי');
});

test('computeCacToLtvRatio: cac=0 → unknown (no division by zero)', () => {
  const r = computeCacToLtvRatio({
    cac: 0,
    history: {
      invoices: [{ date: daysAgo(200), amount: 1000 }],
      reference_date: REF.toISOString(),
    },
  });
  assert.equal(r.quality, 'unknown');
  assert.equal(r.ratio, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Bilingual label contract
// ═══════════════════════════════════════════════════════════════════════════

test('labels: every signal key has Hebrew + English label', () => {
  for (const key of Object.keys(WEIGHTS)) {
    assert.ok(SIGNAL_LABELS[key], `missing label for ${key}`);
    assert.ok(/[\u0590-\u05FF]/.test(SIGNAL_LABELS[key].he));
    assert.ok(/[A-Za-z]/.test(SIGNAL_LABELS[key].en));
  }
});

test('weights: ten signals defined, no nulls', () => {
  const keys = Object.keys(WEIGHTS);
  assert.equal(keys.length, 10);
  for (const k of keys) {
    assert.equal(typeof WEIGHTS[k], 'number');
    assert.ok(WEIGHTS[k] > 0);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Robustness
// ═══════════════════════════════════════════════════════════════════════════

test('robust: handles undefined history without throwing', () => {
  const res = predictChurn('C-Z', undefined);
  assert.equal(typeof res.risk_score, 'number');
});

test('robust: handles malformed invoice entries', () => {
  const res = predictChurn('C-BAD', {
    invoices: [null, undefined, { date: 'bad' }, { amount: 'NaN' }, { date: daysAgo(30) }],
    reference_date: REF.toISOString(),
  });
  assert.ok(Number.isFinite(res.risk_score));
});

test('robust: risk_score is always in 0..100', () => {
  const histories = [
    makeHealthyHistory(),
    makeCriticalHistory(),
    {},
    { invoices: [] },
    { invoices: null, orders: undefined, disputes: 'bad' },
  ];
  for (const h of histories) {
    const res = predictChurn('C', h);
    assert.ok(res.risk_score >= 0 && res.risk_score <= 100, `out of range: ${res.risk_score}`);
  }
});
