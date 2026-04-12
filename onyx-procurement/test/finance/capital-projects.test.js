/**
 * Capital Projects Tracker — Unit Tests
 * Agent Y-077 | Techno-Kol Uzi mega-ERP
 *
 * Coverage:
 *   - Project initiation + validation
 *   - Approval routing (AUTO / MANAGER / CFO / CEO_BOARD) thresholds
 *   - Approval decisions (approve / reject / multi-signature)
 *   - CIP expenditure posting
 *   - CIP-to-FA transfer (capitalize), including asset-store integration
 *   - Budget vs actual variance
 *   - Milestones (create, upgrade)
 *   - NPV / IRR / payback math
 *   - Post-installation review
 *   - Kill-switch preserves history (never delete)
 *
 * Run with:  node --test test/finance/capital-projects.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CapitalProjectsTracker,
  APPROVAL_TIERS,
  STATUSES,
  USE_CASES,
  npv,
  irr,
  payback,
  round2,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'finance', 'capital-projects.js'),
);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function near(a, b, eps = 0.01) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

function assertNear(actual, expected, eps = 0.01, msg) {
  assert.ok(
    near(actual, expected, eps),
    `${msg || 'value'}: expected ${expected} ± ${eps}, got ${actual}`,
  );
}

function freshTracker() {
  return new CapitalProjectsTracker();
}

// ─────────────────────────────────────────────────────────────
// 1. Pure math — npv / irr / payback
// ─────────────────────────────────────────────────────────────

test('npv: classic textbook example — returns positive at 10% discount', () => {
  // -1000 initial, +500 for 3 years @ 10%
  // NPV = -1000 + 500/1.1 + 500/1.21 + 500/1.331 = 243.43
  const val = npv([-1000, 500, 500, 500], 0.10);
  assertNear(val, 243.43, 0.01, 'NPV of classic example');
});

test('npv: zero rate returns simple sum', () => {
  assert.equal(npv([-1000, 500, 500, 500], 0), 500);
});

test('npv: rejects rate <= -1', () => {
  assert.throws(() => npv([-100, 50, 50], -1), /rate/);
});

test('irr: classic example — converges to ~23.38%', () => {
  // -1000 / +500 x 3 years → IRR ≈ 23.38%
  const r = irr([-1000, 500, 500, 500]);
  assert.ok(r !== null, 'IRR should find a root');
  assertNear(r, 0.2338, 0.001, 'IRR value');
});

test('irr: returns null when all cashflows same sign', () => {
  assert.equal(irr([100, 200, 300]), null);
  assert.equal(irr([-100, -200, -300]), null);
});

test('payback: simple 4-year even recovery', () => {
  // -4000 investment, +1000/yr → payback at exactly year 4.
  const p = payback([-4000, 1000, 1000, 1000, 1000]);
  assert.equal(p, 4);
});

test('payback: pro-rated partial year', () => {
  // -1000 invest, 400 yr1, 400 yr2, 400 yr3 →
  //  cumulative after yr2 = -200, yr3 recovers 400 → frac 0.5
  //  payback = 2 + 0.5 = 2.5
  const p = payback([-1000, 400, 400, 400]);
  assertNear(p, 2.5, 0.001);
});

test('payback: returns null when never recovered', () => {
  assert.equal(payback([-1000, 100, 100]), null);
});

// ─────────────────────────────────────────────────────────────
// 2. Project initiation — validation
// ─────────────────────────────────────────────────────────────

test('initiateProject: happy path returns frozen project', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'שדרוג קו ייצור',
    name_en: 'Production line upgrade',
    sponsor: 'Uzi Elimelech',
    budgetRequested: 250_000,
    useCase: 'capacity',
    estimatedPayback: 3.5,
    estimatedNPV: 150_000,
    estimatedIRR: 0.18,
  });
  assert.equal(p.name_he, 'שדרוג קו ייצור');
  assert.equal(p.budget_requested, 250_000);
  assert.equal(p.status, STATUSES.INITIATED);
  assert.equal(p.use_case, 'capacity');
  assert.equal(p.estimated_payback, 3.5);
  assert.equal(Object.isFrozen(p), true);
});

test('initiateProject: rejects unknown useCase', () => {
  const t = freshTracker();
  assert.throws(
    () => t.initiateProject({
      name_he: 'x', name_en: 'y', sponsor: 'z',
      budgetRequested: 100, useCase: 'mystery',
    }),
    /useCase/,
  );
});

test('initiateProject: rejects negative budget', () => {
  const t = freshTracker();
  assert.throws(
    () => t.initiateProject({
      name_he: 'x', name_en: 'y', sponsor: 'z',
      budgetRequested: -100, useCase: 'growth',
    }),
    /budgetRequested/,
  );
});

test('initiateProject: accepts all 5 canonical use cases', () => {
  const t = freshTracker();
  const cases = ['growth', 'replacement', 'regulatory', 'cost-reduction', 'capacity'];
  for (const uc of cases) {
    const p = t.initiateProject({
      name_he: uc, name_en: uc, sponsor: 's',
      budgetRequested: 10_000, useCase: uc,
    });
    assert.equal(p.use_case, uc);
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Approval routing thresholds
// ─────────────────────────────────────────────────────────────

test('approvalWorkflow: <50K routes to AUTO and auto-approves', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'קטן', name_en: 'small',
    sponsor: 'sponsor1',
    budgetRequested: 25_000,
    useCase: 'replacement',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'AUTO');
  assert.equal(r.status, STATUSES.APPROVED);

  const live = t.getProject(p.id);
  assert.equal(live.budget_approved, 25_000);
  assert.equal(live.approval_chain.length, 1);
  assert.equal(live.approval_chain[0].decision, 'APPROVED');
  assert.equal(live.approval_chain[0].approver, 'SYSTEM');
});

test('approvalWorkflow: exactly 50K routes to MANAGER tier', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'גבולי', name_en: 'boundary',
    sponsor: 's',
    budgetRequested: 50_000,
    useCase: 'growth',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'MANAGER');
  assert.equal(r.status, STATUSES.PENDING_APPROVAL);
});

test('approvalWorkflow: 250K routes to MANAGER, pending', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'בינוני', name_en: 'medium',
    sponsor: 's',
    budgetRequested: 250_000,
    useCase: 'cost-reduction',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'MANAGER');
  assert.equal(r.status, STATUSES.PENDING_APPROVAL);
  assert.equal(r.chain.length, 1);
});

test('approvalWorkflow: 500,001₪ routes to CFO', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'גדול', name_en: 'large',
    sponsor: 's',
    budgetRequested: 500_001,
    useCase: 'capacity',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'CFO');
  assert.equal(r.chain.length, 1);
  assert.equal(r.chain[0].role, 'CFO');
});

test('approvalWorkflow: 2M routes to CFO', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: '2M', name_en: '2M',
    sponsor: 's',
    budgetRequested: 2_000_000,
    useCase: 'growth',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'CFO');
});

test('approvalWorkflow: >5M routes to CEO_BOARD with two signatures', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'ענק', name_en: 'mega',
    sponsor: 's',
    budgetRequested: 8_500_000,
    useCase: 'growth',
  });
  const r = t.approvalWorkflow(p.id);
  assert.equal(r.route, 'CEO_BOARD');
  assert.equal(r.status, STATUSES.PENDING_APPROVAL);
  assert.equal(r.chain.length, 2);
  const roles = r.chain.map((s) => s.role).sort();
  assert.deepEqual(roles, ['BOARD', 'CEO_BOARD']);
});

test('decide: CFO approval transitions to APPROVED', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: '1M', name_en: '1M',
    sponsor: 's',
    budgetRequested: 1_000_000,
    useCase: 'growth',
  });
  t.approvalWorkflow(p.id);
  const out = t.decide(p.id, { approver: 'Rina CFO', decision: 'APPROVED' });
  assert.equal(out.status, STATUSES.APPROVED);
  const live = t.getProject(p.id);
  assert.equal(live.budget_approved, 1_000_000);
});

test('decide: rejection sets project to REJECTED', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 1_000_000, useCase: 'growth',
  });
  t.approvalWorkflow(p.id);
  t.decide(p.id, { approver: 'CFO', decision: 'REJECTED', note: 'Not aligned' });
  const live = t.getProject(p.id);
  assert.equal(live.status, STATUSES.REJECTED);
  // History preserved
  assert.ok(live.history.find((h) => h.action === 'DECISION_REJECTED'));
});

test('decide: mega project requires BOTH CEO and board', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 10_000_000, useCase: 'growth',
  });
  t.approvalWorkflow(p.id);

  // First signature — status stays pending
  let out = t.decide(p.id, {
    approver: 'CEO Avi',
    decision: 'APPROVED',
    role: 'CEO_BOARD',
  });
  assert.equal(out.status, STATUSES.PENDING_APPROVAL);

  // Second signature — fully approved
  out = t.decide(p.id, {
    approver: 'Board',
    decision: 'APPROVED',
    role: 'BOARD',
  });
  assert.equal(out.status, STATUSES.APPROVED);
});

// ─────────────────────────────────────────────────────────────
// 4. Expenditures + CIP
// ─────────────────────────────────────────────────────────────

test('recordExpenditure: posts to CIP and bumps status to IN_PROGRESS', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  const tx = t.recordExpenditure({
    projectId: p.id,
    invoice: 'INV-1001',
    vendor: 'ABC Ltd',
    amount: 10_000,
    category: 'equipment',
  });
  assert.equal(tx.amount, 10_000);
  assert.equal(tx.account_dr, '1520');
  const live = t.getProject(p.id);
  assert.equal(live.status, STATUSES.IN_PROGRESS);
  assert.equal(live.cip_balance, 10_000);
});

test('recordExpenditure: rejects before approval', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 250_000, useCase: 'growth',
  });
  t.approvalWorkflow(p.id); // routes to MANAGER, status PENDING
  assert.throws(
    () => t.recordExpenditure({
      projectId: p.id,
      invoice: 'I', vendor: 'V', amount: 1000, category: 'c',
    }),
    /APPROVED/,
  );
});

test('recordExpenditure: multiple entries accumulate CIP balance', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'A', vendor: 'V', amount: 1000, category: 'c' });
  t.recordExpenditure({ projectId: p.id, invoice: 'B', vendor: 'V', amount: 2500, category: 'c' });
  t.recordExpenditure({ projectId: p.id, invoice: 'C', vendor: 'V', amount: 1750.50, category: 'c' });
  const live = t.getProject(p.id);
  assertNear(live.cip_balance, 5250.50, 0.001);
  assert.equal(live.expenditures.length, 3);
});

// ─────────────────────────────────────────────────────────────
// 5. Capitalize — CIP → FA with asset store stub
// ─────────────────────────────────────────────────────────────

test('capitalize: transfers CIP to shadow FA when no store provided', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 10_000, category: 'c' });
  t.recordExpenditure({ projectId: p.id, invoice: 'I2', vendor: 'V', amount: 15_000, category: 'c' });

  const out = t.capitalize(p.id, {
    completionDate: '2026-04-01',
    assetCategories: [
      { cat: 'MACHINERY_GENERAL', amount: 20_000 },
      { cat: 'COMPUTERS', amount: 5_000 },
    ],
  });
  assert.equal(out.totalCapitalized, 25_000);
  assert.equal(out.assets.length, 2);
  const live = t.getProject(p.id);
  assert.equal(live.status, STATUSES.CAPITALIZED);
  assert.equal(live.cip_balance, 0);
  assert.equal(live.capitalization.total_capitalized, 25_000);
});

test('capitalize: integrates with asset store adapter (Y-076 bridge)', () => {
  const calls = [];
  const fakeStore = {
    addAsset(fields) {
      calls.push(fields);
      return `FA-${calls.length}`;
    },
  };
  const t = new CapitalProjectsTracker({ assetStore: fakeStore });
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 30_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 30_000, category: 'c' });
  const out = t.capitalize(p.id, {
    completionDate: '2026-04-01',
    assetCategories: [
      { cat: 'HEAVY_EQUIPMENT', amount: 30_000, name_he: 'באגר', name_en: 'Excavator' },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'HEAVY_EQUIPMENT');
  assert.equal(calls[0].cost, 30_000);
  assert.equal(out.assets[0].asset_id, 'FA-1');
});

test('capitalize: rejects mismatched category totals', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 20_000, category: 'c' });

  assert.throws(
    () => t.capitalize(p.id, {
      completionDate: '2026-04-01',
      assetCategories: [{ cat: 'COMPUTERS', amount: 10_000 }],
    }),
    /CIP balance/,
  );
});

// ─────────────────────────────────────────────────────────────
// 6. Budget vs actual variance
// ─────────────────────────────────────────────────────────────

test('budgetVsActual: on-budget returns 0 variance', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 40_000, category: 'c' });
  const v = t.budgetVsActual(p.id);
  assert.equal(v.budget, 40_000);
  assert.equal(v.actual, 40_000);
  assert.equal(v.variance, 0);
  assert.equal(v.overrun, false);
});

test('budgetVsActual: overrun flagged with positive variance', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 42_500, category: 'c' });
  const v = t.budgetVsActual(p.id);
  assert.equal(v.variance, 2500);
  assert.equal(v.overrun, true);
  assertNear(v.variance_pct, 0.0625, 0.001);
});

test('budgetVsActual: under-budget returns negative variance', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 30_000, category: 'c' });
  const v = t.budgetVsActual(p.id);
  assert.equal(v.variance, -10_000);
  assert.equal(v.overrun, false);
});

// ─────────────────────────────────────────────────────────────
// 7. Milestones
// ─────────────────────────────────────────────────────────────

test('milestone: creates new entry', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'growth',
  });
  const m = t.milestone(p.id, {
    name: 'foundation',
    name_he: 'יסודות',
    plannedDate: '2026-05-01',
  });
  assert.equal(m.name, 'foundation');
  assert.equal(m.planned_date, '2026-05-01');
  assert.equal(m.payment, 0);
});

test('milestone: updates existing (upgrade, never delete)', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'growth',
  });
  t.milestone(p.id, { name: 'foundation', plannedDate: '2026-05-01' });
  t.milestone(p.id, { name: 'foundation', actualDate: '2026-05-10', payment: 5000 });
  const live = t.getProject(p.id);
  assert.equal(live.milestones.length, 1);
  const m = live.milestones[0];
  assert.equal(m.planned_date, '2026-05-01'); // preserved
  assert.equal(m.actual_date, '2026-05-10');
  assert.equal(m.payment, 5000);
  assert.equal(m.revisions, 1);
});

// ─────────────────────────────────────────────────────────────
// 8. NPV / IRR / payback reviews
// ─────────────────────────────────────────────────────────────

test('npvReview: records review and flags accept/reject', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 1_000_000, useCase: 'growth',
    estimatedNPV: 200_000,
  });
  const r = t.npvReview({
    projectId: p.id,
    cashflows: [-1_000_000, 400_000, 400_000, 400_000, 400_000],
    discountRate: 0.10,
  });
  assert.ok(r.npv > 0, 'positive NPV expected');
  assert.equal(r.decision, 'ACCEPT');
  // Variance against estimate recorded
  assert.ok(typeof r.variance_npv === 'number');
});

test('npvReview: negative NPV flagged as REJECT', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 1_000_000, useCase: 'growth',
  });
  const r = t.npvReview({
    projectId: p.id,
    cashflows: [-1_000_000, 100_000, 100_000, 100_000],
    discountRate: 0.10,
  });
  assert.ok(r.npv < 0);
  assert.equal(r.decision, 'REJECT');
});

test('paybackAnalysis: compares estimate vs actual', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 1_000_000, useCase: 'growth',
    estimatedPayback: 3.0,
  });
  t.npvReview({
    projectId: p.id,
    cashflows: [-1_000_000, 400_000, 400_000, 400_000, 400_000],
    discountRate: 0.10,
  });
  const pa = t.paybackAnalysis(p.id);
  assertNear(pa.actual_payback, 2.5, 0.01);
  assert.equal(pa.estimated_payback, 3.0);
  assert.equal(pa.meets_estimate, true);
});

// ─────────────────────────────────────────────────────────────
// 9. Post-installation review (12-month lookback)
// ─────────────────────────────────────────────────────────────

test('postInstallationReview: 12-month lookback after capitalization', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 100_000, useCase: 'growth',
    estimatedNPV: 40_000,
    estimatedIRR: 0.15,
    estimatedPayback: 3.0,
  });
  t.approvalWorkflow(p.id);
  t.decide(p.id, { approver: 'mgr', decision: 'APPROVED' });
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 100_000, category: 'c' });
  t.capitalize(p.id, {
    completionDate: '2026-04-01',
    assetCategories: [{ cat: 'MACHINERY_GENERAL', amount: 100_000 }],
  });

  const r = t.postInstallationReview(p.id, {
    months: 12,
    cashflows: [-100_000, 40_000, 40_000, 40_000, 40_000],
    discountRate: 0.10,
  });
  assert.equal(r.type, 'POST_INSTALL');
  assert.equal(r.window_months, 12);
  assert.ok(typeof r.npv === 'number');
  assert.ok(r.variance_npv != null);
  assert.ok(r.verdict === 'ON_TRACK' || r.verdict === 'UNDERPERFORMING');
});

test('postInstallationReview: requires CAPITALIZED status', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 10_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  assert.throws(
    () => t.postInstallationReview(p.id, 12),
    /CAPITALIZED/,
  );
});

// ─────────────────────────────────────────────────────────────
// 10. Kill-switch — preserves history, NEVER deletes
// ─────────────────────────────────────────────────────────────

test('killSwitch: cancels project preserving history', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 100_000, useCase: 'growth',
  });
  t.approvalWorkflow(p.id);
  t.decide(p.id, { approver: 'mgr', decision: 'APPROVED' });
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 25_000, category: 'c' });

  const killed = t.killSwitch({ projectId: p.id, reason: 'Priorities changed' });
  assert.equal(killed.status, STATUSES.CANCELLED);
  assert.equal(killed.cancel_reason, 'Priorities changed');

  // Still retrievable
  const retrieved = t.getProject(p.id);
  assert.equal(retrieved.status, STATUSES.CANCELLED);
  // Expenditures still there
  assert.equal(retrieved.expenditures.length, 1);
  // History contains CANCELLED action
  assert.ok(retrieved.history.find((h) => h.action === 'CANCELLED'));
  // Journal contains CIP_WRITEOFF
  const jnl = t.exportJournal();
  assert.ok(jnl.find((j) => j.type === 'CIP_WRITEOFF'));
});

test('killSwitch: cannot cancel capitalized project', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 10_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 10_000, category: 'c' });
  t.capitalize(p.id, {
    completionDate: '2026-04-01',
    assetCategories: [{ cat: 'COMPUTERS', amount: 10_000 }],
  });
  assert.throws(
    () => t.killSwitch({ projectId: p.id, reason: 'oops' }),
    /capitalized/,
  );
});

test('killSwitch: idempotent on already-cancelled project', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 10_000, useCase: 'replacement',
  });
  t.killSwitch({ projectId: p.id, reason: 'first' });
  // Second call does not throw
  const again = t.killSwitch({ projectId: p.id, reason: 'second' });
  assert.equal(again.status, STATUSES.CANCELLED);
});

// ─────────────────────────────────────────────────────────────
// 11. Append-only invariants
// ─────────────────────────────────────────────────────────────

test('append-only: project map never shrinks', () => {
  const t = freshTracker();
  const p1 = t.initiateProject({
    name_he: 'a', name_en: 'a', sponsor: 's',
    budgetRequested: 1000, useCase: 'growth',
  });
  const p2 = t.initiateProject({
    name_he: 'b', name_en: 'b', sponsor: 's',
    budgetRequested: 1000, useCase: 'growth',
  });
  t.killSwitch({ projectId: p1.id, reason: 'test' });
  assert.equal(t.listProjects().length, 2);
});

test('append-only: CIP ledger is truly append-only', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 40_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id);
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 1000, category: 'c' });
  t.recordExpenditure({ projectId: p.id, invoice: 'I2', vendor: 'V', amount: 2000, category: 'c' });
  const before = t.exportCIPSubledger();
  assert.equal(before.length, 2);
  // Attempt to mutate the exported copy — internal state must not change
  before.pop();
  assert.equal(t.exportCIPSubledger().length, 2);
});

test('bilingual: every project record exposes Hebrew and English labels', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'פרויקט', name_en: 'Project',
    sponsor: 's',
    budgetRequested: 25_000,
    useCase: 'capacity',
  });
  const live = t.getProject(p.id);
  assert.ok(live.name_he);
  assert.ok(live.name_en);
  assert.ok(live.status_he);
  assert.ok(live.use_case_he);
  assert.ok(live.use_case_en);
});

test('constants sanity: APPROVAL_TIERS thresholds monotonic', () => {
  assert.ok(APPROVAL_TIERS.AUTO.max < APPROVAL_TIERS.MANAGER.max);
  assert.ok(APPROVAL_TIERS.MANAGER.max < APPROVAL_TIERS.CFO.max);
  assert.ok(APPROVAL_TIERS.CFO.max < APPROVAL_TIERS.CEO_BOARD.max);
  assert.equal(APPROVAL_TIERS.CEO_BOARD.requires_board, true);
});

test('exportJournal: captures approvals, postings, capitalizations', () => {
  const t = freshTracker();
  const p = t.initiateProject({
    name_he: 'x', name_en: 'x', sponsor: 's',
    budgetRequested: 25_000, useCase: 'replacement',
  });
  t.approvalWorkflow(p.id); // AUTO approval
  t.recordExpenditure({ projectId: p.id, invoice: 'I1', vendor: 'V', amount: 25_000, category: 'c' });
  t.capitalize(p.id, {
    completionDate: '2026-04-01',
    assetCategories: [{ cat: 'COMPUTERS', amount: 25_000 }],
  });
  const jnl = t.exportJournal();
  const types = jnl.map((j) => j.type);
  assert.ok(types.includes('APPROVAL'));
  assert.ok(types.includes('CIP_POST'));
  assert.ok(types.includes('CAPITALIZE'));
});
