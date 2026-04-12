/**
 * Customer Success Plan Builder — Unit Tests
 * Agent Y-103 — Swarm 4 — Techno-Kol Uzi mega-ERP
 *
 * Run with:  node --test test/customer/success-plan.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 * Covers: plan creation, goal tracking, health calc, stakeholder
 * map, ROI computation, QBR, escalation, cadence, value realization,
 * renewal readiness, PDF generation and the "never delete, only
 * upgrade/grow" rule.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  SuccessPlan,
  GOAL_STATUS,
  SEVERITY,
  CADENCE,
  STAKEHOLDER_TYPES,
  RENEWAL_LABELS,
  HEALTH_LABELS,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'customer', 'success-plan.js'),
);

// ──────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────

const REF_NOW = '2026-04-11T10:00:00.000Z';

function buildEngine() {
  return new SuccessPlan({ now: () => REF_NOW });
}

function baseCreateArgs(overrides = {}) {
  return Object.assign(
    {
      customerId: 'cust_001',
      csm: 'ronit.levi@technokol.co.il',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.000Z',
      vision: {
        he: 'להיות ספק הליבה לניהול ERP של הלקוח',
        en: 'Become the core ERP provider for the customer',
      },
      goals: [
        {
          description_he: 'הפחתת עלויות רכש ב-15%',
          description_en: 'Reduce procurement costs by 15%',
          metric: 'cost_reduction_pct',
          target: 15,
          owner: 'david@customer.co.il',
          dueDate: '2026-09-30',
          status: 'not_started',
        },
        {
          description_he: 'אוטומציה של 80% מהזמנות הרכש',
          description_en: 'Automate 80% of purchase orders',
          metric: 'automation_pct',
          target: 80,
          owner: 'moshe@customer.co.il',
          dueDate: '2026-06-30',
          status: 'not_started',
        },
      ],
      stakeholders: [
        { name: 'Dana Ben-Ami', role: 'CFO', email: 'dana@customer.co.il', type: 'exec_sponsor' },
        { name: 'David Katz', role: 'Procurement Manager', email: 'david@customer.co.il', type: 'champion' },
        { name: 'Moshe Peretz', role: 'Buyer', email: 'moshe@customer.co.il', type: 'user' },
        { name: 'Sarah Cohen', role: 'Buyer', email: 'sarah@customer.co.il', type: 'user' },
        { name: 'Ronen Haim', role: 'Buyer', email: 'ronen@customer.co.il', type: 'user' },
      ],
      risks: [
        { description_he: 'התנגדות לשינוי', description_en: 'Change resistance', severity: 'medium' },
      ],
      milestones: [
        { name_he: 'העלאה לייצור', name_en: 'Go-live', targetDate: '2026-03-01' },
        { name_he: 'סקירה רבעונית ראשונה', name_en: 'First QBR', targetDate: '2026-04-15' },
      ],
      cadence: 'monthly',
    },
    overrides,
  );
}

// ──────────────────────────────────────────────────────────
// Suite 1 — createPlan
// ──────────────────────────────────────────────────────────

test('createPlan: returns a structured plan with ids and bilingual vision', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());

  assert.ok(plan.id, 'plan id must be set');
  assert.equal(plan.customer_id, 'cust_001');
  assert.equal(plan.csm, 'ronit.levi@technokol.co.il');
  assert.equal(plan.status, 'active');
  assert.equal(plan.cadence, 'monthly');
  assert.equal(plan.vision.he, 'להיות ספק הליבה לניהול ERP של הלקוח');
  assert.equal(plan.vision.en, 'Become the core ERP provider for the customer');
  assert.equal(plan.goals.length, 2);
  assert.equal(plan.stakeholders.length, 5);
  assert.equal(plan.risks.length, 1);
  assert.equal(plan.milestones.length, 2);
  assert.equal(plan.created_at, REF_NOW);
  assert.equal(plan.archived_at, null);
});

test('createPlan: every goal gets a deterministic id and bilingual status labels', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  for (const g of plan.goals) {
    assert.match(g.id, /^goal_/);
    assert.equal(g.status, 'not_started');
    assert.equal(g.status_he, GOAL_STATUS.not_started.he);
    assert.equal(g.status_en, GOAL_STATUS.not_started.en);
    assert.equal(g.created_at, REF_NOW);
    assert.ok(Array.isArray(g.actuals));
  }
});

test('createPlan: records a creation history entry (append-only trail)', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  assert.equal(plan.history.length, 1);
  assert.equal(plan.history[0].type, 'created');
  assert.equal(plan.history[0].note_he, 'תכנית נוצרה');
  assert.equal(plan.history[0].note_en, 'plan created');
});

test('createPlan: string vision expands into {he,en} shape', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs({ vision: 'Drive procurement automation' }));
  assert.equal(plan.vision.he, 'Drive procurement automation');
  assert.equal(plan.vision.en, 'Drive procurement automation');
});

test('createPlan: throws on missing required fields', () => {
  const eng = buildEngine();
  assert.throws(() => eng.createPlan({ customerId: '' }), /customerId is required/);
  assert.throws(() => eng.createPlan({ customerId: 'c1' }), /csm is required/);
  assert.throws(
    () => eng.createPlan({ customerId: 'c1', csm: 'x@y' }),
    /startDate and endDate are required/,
  );
  assert.throws(
    () => eng.createPlan(baseCreateArgs({ cadence: 'daily' })),
    /invalid cadence/,
  );
});

// ──────────────────────────────────────────────────────────
// Suite 2 — trackGoalProgress
// ──────────────────────────────────────────────────────────

test('trackGoalProgress: records actuals and derives on_track', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const goal = plan.goals[0]; // target: 15% cost reduction

  const updated = eng.trackGoalProgress({
    planId: plan.id,
    goalId: goal.id,
    actual: 13,
    notes: 'Early wins from consolidated suppliers',
    date: '2026-03-01T00:00:00.000Z',
  });

  assert.equal(updated.status, 'on_track');
  assert.equal(updated.latest_actual, 13);
  assert.equal(updated.actuals.length, 1);
  assert.ok(updated.latest_pct >= 80 && updated.latest_pct <= 100);
});

test('trackGoalProgress: achieved when actual >= target', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const g = plan.goals[1]; // automate 80%
  const updated = eng.trackGoalProgress({
    planId: plan.id,
    goalId: g.id,
    actual: 82,
    notes: 'Automated flow live',
  });
  assert.equal(updated.status, 'achieved');
  assert.equal(updated.latest_actual, 82);
});

test('trackGoalProgress: at_risk when 50% ≤ actual < 80%', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const g = plan.goals[0];
  const updated = eng.trackGoalProgress({
    planId: plan.id,
    goalId: g.id,
    actual: 10, // 66% of target 15
  });
  assert.equal(updated.status, 'at_risk');
});

test('trackGoalProgress: off_track when actual < 50%', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const g = plan.goals[0];
  const updated = eng.trackGoalProgress({
    planId: plan.id,
    goalId: g.id,
    actual: 5, // 33% of 15
  });
  assert.equal(updated.status, 'off_track');
});

test('trackGoalProgress: missed if past due and under target', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const g = plan.goals[0]; // due 2026-09-30
  const updated = eng.trackGoalProgress({
    planId: plan.id,
    goalId: g.id,
    actual: 4,
    date: '2026-10-15T00:00:00.000Z',
  });
  assert.equal(updated.status, 'missed');
});

test('trackGoalProgress: throws for unknown plan / goal', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  assert.throws(() => eng.trackGoalProgress({ planId: 'x', goalId: 'y', actual: 1 }), /plan not found/);
  assert.throws(
    () => eng.trackGoalProgress({ planId: plan.id, goalId: 'nope', actual: 1 }),
    /goal not found/,
  );
});

// ──────────────────────────────────────────────────────────
// Suite 3 — planHealth
// ──────────────────────────────────────────────────────────

test('planHealth: all goals not_started → red', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const h = eng.planHealth(plan.id);
  assert.equal(h.label, 'red');
  assert.equal(h.total, 2);
  assert.equal(h.breakdown.not_started, 2);
});

test('planHealth: one on_track + one achieved → green', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[0].id, actual: 14 });
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[1].id, actual: 85 });
  const h = eng.planHealth(plan.id);
  assert.equal(h.label, 'green');
  assert.equal(h.breakdown.on_track, 1);
  assert.equal(h.breakdown.achieved, 1);
  assert.equal(h.on_track_pct, 1);
});

test('planHealth: critical risks push score down', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs({
    risks: [
      { description_he: 'קריסה', description_en: 'Churn', severity: 'critical' },
      { description_he: 'קריסה שנייה', description_en: 'Second critical', severity: 'critical' },
    ],
  }));
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[0].id, actual: 14 });
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[1].id, actual: 85 });
  const h = eng.planHealth(plan.id);
  assert.ok(h.score < h.raw_score, 'critical risks should reduce adjusted score');
  assert.equal(h.critical_risks, 2);
});

test('planHealth: empty goals returns yellow placeholder', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs({ goals: [] }));
  const h = eng.planHealth(plan.id);
  assert.equal(h.total, 0);
  assert.equal(h.label, 'yellow');
});

// ──────────────────────────────────────────────────────────
// Suite 4 — stakeholderMap
// ──────────────────────────────────────────────────────────

test('stakeholderMap: groups by type and returns bilingual labels', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const map = eng.stakeholderMap(plan.id);

  assert.equal(map.exec_sponsor.length, 1);
  assert.equal(map.exec_sponsor[0].name, 'Dana Ben-Ami');
  assert.equal(map.champion.length, 1);
  assert.equal(map.champion[0].name, 'David Katz');
  assert.equal(map.user_base.length, 3);
  assert.equal(map.blockers.length, 0);
  assert.equal(map.labels.exec_sponsor.he, STAKEHOLDER_TYPES.exec_sponsor.he);
  assert.equal(map.labels.blockers.en, STAKEHOLDER_TYPES.blocker.en);
  // Coverage: exec 0.35 + champ 0.30 + 3 users 0.20 + no blockers 0.15 = 1.00
  assert.equal(map.coverage_score, 1.0);
});

test('stakeholderMap: coverage drops with a blocker and no exec', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs({
    stakeholders: [
      { name: 'Blocker Guy', role: 'IT Lead', type: 'blocker' },
      { name: 'Only User', role: 'Buyer', type: 'user' },
    ],
  }));
  const map = eng.stakeholderMap(plan.id);
  assert.equal(map.blockers.length, 1);
  assert.equal(map.exec_sponsor.length, 0);
  assert.ok(map.coverage_score < 0.5);
});

// ──────────────────────────────────────────────────────────
// Suite 5 — ROI computation
// ──────────────────────────────────────────────────────────

test('roiCalculation: computes positive ROI', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const roi = eng.roiCalculation({
    planId: plan.id,
    investments: [{ label: 'Licenses', amount: 100000 }, { label: 'Training', amount: 20000 }],
    returns: [{ label: 'Savings Y1', amount: 180000 }, { label: 'Efficiency', amount: 60000 }],
  });
  assert.equal(roi.total_investment, 120000);
  assert.equal(roi.total_return, 240000);
  assert.equal(roi.net_return, 120000);
  assert.equal(roi.roi_ratio, 1.0);
  assert.equal(roi.roi_percentage, 100);
  assert.equal(roi.label.en, 'Positive ROI');
  assert.equal(roi.label.he, 'החזר חיובי');
});

test('roiCalculation: negative ROI labelled correctly', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const roi = eng.roiCalculation({
    planId: plan.id,
    investments: [50000],
    returns: [20000],
  });
  assert.equal(roi.net_return, -30000);
  assert.equal(roi.label.en, 'Negative ROI');
  assert.equal(roi.label.he, 'החזר שלילי');
});

test('roiCalculation: zero investments → safe defaults', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const roi = eng.roiCalculation({ planId: plan.id });
  assert.equal(roi.total_investment, 0);
  assert.equal(roi.roi_ratio, 0);
});

test('roiCalculation: snapshot persisted on plan (never deleted)', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.roiCalculation({ planId: plan.id, investments: [{ amount: 10000 }], returns: [{ amount: 15000 }] });
  eng.roiCalculation({ planId: plan.id, investments: [{ amount: 10000 }], returns: [{ amount: 20000 }] });
  const stored = eng.getPlan(plan.id);
  assert.equal(stored.roi_snapshots.length, 2);
});

// ──────────────────────────────────────────────────────────
// Suite 6 — Quarterly Review
// ──────────────────────────────────────────────────────────

test('quarterlyReview: returns bilingual exec summary and sections', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[0].id, actual: 14 });
  eng.roiCalculation({
    planId: plan.id,
    investments: [{ amount: 100000 }],
    returns: [{ amount: 150000 }],
  });
  const qbr = eng.quarterlyReview({ planId: plan.id, quarter: 'Q2-2026' });
  assert.equal(qbr.quarter, 'Q2-2026');
  assert.ok(qbr.title.he.includes('Q2-2026'));
  assert.ok(qbr.title.en.includes('Q2-2026'));
  assert.ok(qbr.sections.health);
  assert.ok(qbr.sections.value_realization);
  assert.ok(qbr.sections.renewal_readiness);
  assert.ok(qbr.sections.stakeholder_map);
  assert.ok(qbr.sections.roi);
});

// ──────────────────────────────────────────────────────────
// Suite 7 — Escalation
// ──────────────────────────────────────────────────────────

test('escalation: builds chain matching severity', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const esc = eng.escalation({
    planId: plan.id,
    issue: 'Critical data loss',
    severity: 'critical',
  });
  assert.equal(esc.severity, 'critical');
  assert.equal(esc.sla_hours, SEVERITY.critical.sla_hours);
  assert.ok(esc.chain.includes('ceo'));
  assert.ok(esc.chain.includes('cro'));
  assert.equal(esc.status, 'open');
});

test('escalation: lower severity chain stops at account director', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const esc = eng.escalation({ planId: plan.id, issue: 'Typo in UI', severity: 'low' });
  assert.equal(esc.severity, 'low');
  assert.ok(!esc.chain.includes('ceo'));
  assert.ok(esc.chain.includes('account_director'));
});

test('escalation: explicit routedTo prepended to chain', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const esc = eng.escalation({
    planId: plan.id,
    issue: 'Integration broken',
    severity: 'high',
    routedTo: 'engineering_oncall',
  });
  assert.equal(esc.chain[0], 'engineering_oncall');
  assert.equal(esc.routed_to, 'engineering_oncall');
});

// ──────────────────────────────────────────────────────────
// Suite 8 — updatePlanWithCustomer (joint review, append-only)
// ──────────────────────────────────────────────────────────

test('updatePlanWithCustomer: appends decisions and history, never deletes', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const originalGoalCount = plan.goals.length;

  const updated = eng.updatePlanWithCustomer({
    planId: plan.id,
    reviewDate: '2026-04-10T09:00:00.000Z',
    decisions: [
      { text: 'Add mobile approvals module', owner: 'ronit.levi@technokol.co.il' },
      'Extend pilot to warehouse team',
    ],
    changes: {
      attendees: ['Dana', 'David', 'Ronit'],
      newGoals: [
        {
          description_he: 'הגדלת שימוש ב-50%',
          description_en: 'Increase usage by 50%',
          metric: 'mau',
          target: 150,
          owner: 'david@customer.co.il',
          dueDate: '2026-12-31',
        },
      ],
      newStakeholders: [{ name: 'Warehouse Lead', type: 'user' }],
      cadence: 'biweekly',
    },
  });

  assert.equal(updated.goals.length, originalGoalCount + 1, 'new goal appended');
  assert.equal(updated.stakeholders.length, baseCreateArgs().stakeholders.length + 1);
  assert.equal(updated.cadence, 'biweekly');
  assert.equal(updated.decisions.length, 2);
  assert.ok(updated.history.length >= 2);
  const reviewEntry = updated.history.find((h) => h.type === 'joint_review');
  assert.ok(reviewEntry);
  assert.ok(reviewEntry.snapshot_before.goals.length === originalGoalCount);
});

test('updatePlanWithCustomer: goalPatches update but preserve history snapshot', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const gid = plan.goals[0].id;

  eng.updatePlanWithCustomer({
    planId: plan.id,
    decisions: [],
    changes: {
      goalPatches: [{ id: gid, target: 20 }],
    },
  });
  const stored = eng.getPlan(plan.id);
  const updatedGoal = stored.goals.find((g) => g.id === gid);
  assert.equal(updatedGoal.target, 20);
  // Snapshot in history preserves the old value
  const reviewEntry = stored.history.find((h) => h.type === 'joint_review');
  const oldGoal = reviewEntry.snapshot_before.goals.find((g) => g.id === gid);
  assert.equal(oldGoal.target, 15);
});

// ──────────────────────────────────────────────────────────
// Suite 9 — Executive PDF
// ──────────────────────────────────────────────────────────

test('generateExecutivePDF: returns a valid PDF buffer with header', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const out = eng.generateExecutivePDF(plan.id);
  assert.ok(Buffer.isBuffer(out.bytes));
  const header = out.bytes.slice(0, 5).toString('utf8');
  assert.equal(header, '%PDF-');
  assert.ok(out.pdf_base64.length > 0);
  assert.equal(out.bilingual, true);
  assert.ok(out.text.includes('Executive Deck'));
  assert.ok(out.text.includes('תקציר מנהלים'));
});

// ──────────────────────────────────────────────────────────
// Suite 10 — Cadence tracker
// ──────────────────────────────────────────────────────────

test('cadenceTracker: schedules monthly touchpoints across plan window', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const out = eng.cadenceTracker({ planId: plan.id });
  assert.equal(out.cadence, 'monthly');
  assert.ok(out.total >= 10);
  assert.ok(Array.isArray(out.next_touchpoints));
  assert.ok(Array.isArray(out.overdue));
});

test('cadenceTracker: weekly cadence produces more touchpoints', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  const out = eng.cadenceTracker({ planId: plan.id, cadence: 'weekly' });
  assert.equal(out.cadence, 'weekly');
  assert.ok(out.total >= 40);
});

// ──────────────────────────────────────────────────────────
// Suite 11 — Value realization
// ──────────────────────────────────────────────────────────

test('valueRealization: sums targets and latest actuals', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[0].id, actual: 12 });
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[1].id, actual: 75 });
  const v = eng.valueRealization(plan.id);
  assert.equal(v.planned, 95); // 15 + 80
  assert.equal(v.delivered, 87); // 12 + 75
  assert.equal(v.gap, 8);
  assert.ok(v.pct > 90);
});

// ──────────────────────────────────────────────────────────
// Suite 12 — Renewal readiness
// ──────────────────────────────────────────────────────────

test('renewalReadiness: factors sum to score and produce label', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[0].id, actual: 14 });
  eng.trackGoalProgress({ planId: plan.id, goalId: plan.goals[1].id, actual: 82 });
  eng.roiCalculation({
    planId: plan.id,
    investments: [{ amount: 100000 }],
    returns: [{ amount: 250000 }],
  });
  const r = eng.renewalReadiness(plan.id);
  assert.equal(r.factors.length, 4);
  const keys = r.factors.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['plan_health', 'roi', 'stakeholder_coverage', 'value_realization']);
  assert.ok(r.score > 0.7);
  assert.ok(['likely', 'stable'].includes(r.label));
  assert.equal(r.label_he, RENEWAL_LABELS[r.label].he);
});

test('renewalReadiness: poor plan → critical/at_risk label', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs({
    stakeholders: [{ name: 'Lone User', role: 'Buyer', type: 'user' }],
  }));
  const r = eng.renewalReadiness(plan.id);
  assert.ok(r.score < 0.5);
  assert.ok(['at_risk', 'critical'].includes(r.label));
});

// ──────────────────────────────────────────────────────────
// Suite 13 — Accessors + "never delete" invariant
// ──────────────────────────────────────────────────────────

test('getPlan / listPlans: returns deep clones and filters', () => {
  const eng = buildEngine();
  const p1 = eng.createPlan(baseCreateArgs({ customerId: 'cust_A' }));
  const p2 = eng.createPlan(baseCreateArgs({ customerId: 'cust_B', csm: 'alon@technokol.co.il' }));
  assert.equal(eng.listPlans().length, 2);
  assert.equal(eng.listPlans({ customerId: 'cust_A' }).length, 1);
  assert.equal(eng.listPlans({ csm: 'alon@technokol.co.il' })[0].id, p2.id);

  const got = eng.getPlan(p1.id);
  got.csm = 'mutated';
  // mutation must not leak
  assert.notEqual(eng.getPlan(p1.id).csm, 'mutated');
});

test('never delete: history grows across updates and ROI snapshots', () => {
  const eng = buildEngine();
  const plan = eng.createPlan(baseCreateArgs());
  eng.updatePlanWithCustomer({
    planId: plan.id,
    decisions: [{ text: 'decision 1' }],
    changes: { attendees: ['A'] },
  });
  eng.updatePlanWithCustomer({
    planId: plan.id,
    decisions: [{ text: 'decision 2' }],
    changes: { attendees: ['A', 'B'] },
  });
  eng.roiCalculation({ planId: plan.id, investments: [{ amount: 1 }], returns: [{ amount: 2 }] });
  const stored = eng.getPlan(plan.id);
  assert.equal(stored.history.filter((h) => h.type === 'joint_review').length, 2);
  assert.equal(stored.decisions.length, 2);
  assert.equal(stored.roi_snapshots.length, 1);
});

// ══════════════════════════════════════════════════════════════
// Y-103 EXTENSION API TESTS
// ══════════════════════════════════════════════════════════════

const {
  RISK_BANDS,
  ESCALATION_LEVELS,
  REVIEW_CADENCES,
  PLAN_STATUS,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'customer', 'success-plan.js'),
);

function y103Engine(now) {
  return new SuccessPlan({ now: () => now || REF_NOW });
}

function y103Args(overrides = {}) {
  return Object.assign(
    {
      customerId: 'cust_Y103_1',
      csm: 'maya.cohen@technokol.co.il',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.000Z',
      reviewCadence: 'monthly',
      goals: [
        {
          id: 'g_adoption',
          name_he: 'שיעור אימוץ 80%',
          name_en: 'Adoption rate 80%',
          metric: 'adoption_pct',
          baseline: 20,
          target: 80,
          weight: 2,
          dueDate: '2026-06-30',
        },
        {
          id: 'g_nps',
          name_he: 'NPS ≥ 50',
          name_en: 'NPS ≥ 50',
          metric: 'nps_score',
          baseline: 10,
          target: 50,
          weight: 1,
          dueDate: '2026-09-30',
        },
        {
          id: 'g_roi',
          name_he: 'החזר השקעה פי 2',
          name_en: 'Double ROI',
          metric: 'roi_ratio',
          baseline: 0,
          target: 2,
          weight: 1,
          dueDate: '2026-11-30',
        },
      ],
    },
    overrides,
  );
}

// 1 — createPlan with Y-103 signature
test('Y103 createPlan: accepts reviewCadence + name_he/name_en/baseline/weight goals', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  assert.ok(plan.id);
  assert.equal(plan.customer_id, 'cust_Y103_1');
  assert.equal(plan.cadence, 'monthly');
  assert.equal(plan.review_cadence, 'monthly');
  assert.equal(plan.goals.length, 3);
  assert.equal(plan.goals[0].name_he, 'שיעור אימוץ 80%');
  assert.equal(plan.goals[0].name_en, 'Adoption rate 80%');
  assert.equal(plan.goals[0].baseline, 20);
  assert.equal(plan.goals[0].target, 80);
  assert.equal(plan.goals[0].weight, 2);
  assert.equal(plan.status, 'active');
});

// 2 — reviewCadence must be one of weekly/biweekly/monthly/quarterly
test('Y103 createPlan: rejects reviewCadence outside weekly/biweekly/monthly/quarterly', () => {
  const eng = y103Engine();
  assert.throws(
    () => eng.createPlan(y103Args({ reviewCadence: 'annually' })),
    /invalid reviewCadence/,
  );
  assert.throws(
    () => eng.createPlan(y103Args({ reviewCadence: 'daily' })),
    /invalid reviewCadence/,
  );
  // Positive: all four allowed cadences create a plan.
  for (const c of Object.keys(REVIEW_CADENCES)) {
    const p = eng.createPlan(y103Args({ customerId: `c_${c}`, reviewCadence: c }));
    assert.equal(p.review_cadence, c);
  }
});

// 3 — updateMilestone preserves history (append-only)
test('Y103 updateMilestone: appends actuals and history, nothing removed', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  eng.updateMilestone({
    planId: plan.id,
    goalId: 'g_adoption',
    currentValue: 30,
    notes: 'Pilot team live',
    updatedBy: 'maya.cohen@technokol.co.il',
  });
  eng.updateMilestone({
    planId: plan.id,
    goalId: 'g_adoption',
    currentValue: 55,
    notes: 'Wave 2 onboarded',
    updatedBy: 'maya.cohen@technokol.co.il',
  });
  const stored = eng.getPlan(plan.id);
  const goal = stored.goals.find((g) => g.id === 'g_adoption');
  assert.equal(goal.current_value, 55);
  assert.equal(goal.actuals.length, 2, 'both actuals retained');
  assert.equal(goal.actuals[0].actual, 30);
  assert.equal(goal.actuals[1].actual, 55);
  const updates = stored.history.filter((h) => h.type === 'milestone_update');
  assert.equal(updates.length, 2);
  assert.equal(updates[0].previous_value, null);
  assert.equal(updates[1].previous_value, 30);
});

// 4 — computeProgress returns a weighted 0-100%
test('Y103 computeProgress: weighted progress across goals 0-100%', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  // adoption: 20 → 50 of 80 → frac = (50-20)/(80-20) = 0.5, weight 2
  // nps:      10 → 30 of 50 → frac = (30-10)/(50-10) = 0.5, weight 1
  // roi:       0 →  1 of  2 → frac = (1-0)/(2-0)     = 0.5, weight 1
  // weighted = 0.5 * 4 / 4 = 0.5 → 50%
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 50 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_nps', currentValue: 30 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_roi', currentValue: 1 });
  const p = eng.computeProgress(plan.id);
  assert.equal(p.goal_count, 3);
  assert.equal(p.progress_pct, 50);
  assert.equal(p.per_goal.length, 3);
  assert.ok(p.per_goal.every((x) => x.progress >= 0 && x.progress <= 1));
  assert.ok(p.total_weight === 4);
});

// 5 — computeProgress empty plan
test('Y103 computeProgress: empty plan returns 0% with bilingual label', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args({ goals: [] }));
  const p = eng.computeProgress(plan.id);
  assert.equal(p.progress_pct, 0);
  assert.equal(p.goal_count, 0);
  assert.equal(p.label_he, 'ללא יעדים');
  assert.equal(p.label_en, 'No goals');
});

// 6 — riskAssessment bands green/yellow/red
test('Y103 riskAssessment: green when progress keeps pace with timeline', () => {
  const eng = y103Engine('2026-02-01T00:00:00.000Z');  // ~8% through the year
  const plan = eng.createPlan(y103Args());
  // Modest progress on month 2 — still green.
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 35 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_nps', currentValue: 20 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_roi', currentValue: 0.5 });
  const r = eng.riskAssessment(plan.id);
  assert.equal(r.band, 'green');
  assert.equal(r.band_he, RISK_BANDS.green.he);
});

test('Y103 riskAssessment: red when progress lags timeline badly', () => {
  const eng = y103Engine('2026-11-01T00:00:00.000Z');  // ~83% through year
  const plan = eng.createPlan(y103Args());
  // Almost nothing delivered at 83% elapsed → red.
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 22 });
  const r = eng.riskAssessment(plan.id);
  assert.equal(r.band, 'red');
  assert.equal(r.band_en, RISK_BANDS.red.en);
});

test('Y103 riskAssessment: yellow band sits between green and red', () => {
  const eng = y103Engine('2026-07-01T00:00:00.000Z');  // ~50% elapsed
  const plan = eng.createPlan(y103Args());
  // ~30% progress at 50% elapsed → ratio 0.6 → yellow
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 38 }); // (38-20)/60=0.3, weight 2
  eng.updateMilestone({ planId: plan.id, goalId: 'g_nps', currentValue: 22 });       // (22-10)/40=0.3, weight 1
  eng.updateMilestone({ planId: plan.id, goalId: 'g_roi', currentValue: 0.6 });      // 0.6/2=0.3, weight 1
  const r = eng.riskAssessment(plan.id);
  assert.equal(r.band, 'yellow');
});

// 7 — addMilestone preserves existing goals
test('Y103 addMilestone: appends new goal, existing goals preserved', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  const before = plan.goals.length;
  const added = eng.addMilestone(plan.id, {
    id: 'g_expansion',
    name_he: 'הרחבה למחלקות נוספות',
    name_en: 'Expand to more departments',
    metric: 'departments',
    baseline: 1,
    target: 5,
    weight: 1,
    dueDate: '2026-12-31',
  });
  const stored = eng.getPlan(plan.id);
  assert.equal(stored.goals.length, before + 1);
  assert.equal(added.id, 'g_expansion');
  // Original goals untouched
  assert.ok(stored.goals.find((g) => g.id === 'g_adoption'));
  assert.ok(stored.goals.find((g) => g.id === 'g_nps'));
  // History recorded
  assert.ok(stored.history.find((h) => h.type === 'milestone_added'));
});

// 8 — markAtRisk flag + notification recipients
test('Y103 markAtRisk: flags plan and returns notification recipients', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args({
    stakeholders: [
      { name: 'VP Biz', type: 'exec_sponsor', email: 'vp@customer.co.il' },
      { name: 'Admin', type: 'user', email: 'admin@customer.co.il' },
    ],
  }));
  const result = eng.markAtRisk(plan.id, 'Churn signal from CFO');
  assert.equal(result.at_risk, true);
  assert.equal(result.reason, 'Churn signal from CFO');
  assert.ok(result.recipients.includes(plan.csm));
  assert.ok(result.recipients.includes('csm_manager'));
  assert.ok(result.recipients.includes('vp_cs'));
  assert.ok(result.recipients.includes('vp@customer.co.il'));

  const stored = eng.getPlan(plan.id);
  assert.equal(stored.at_risk_flag, true);
  assert.equal(stored.at_risk_reason, 'Churn signal from CFO');
  assert.ok(stored.history.find((h) => h.type === 'marked_at_risk'));
});

// 9 — escalation path: csm_manager → vp_cs → executive
test('Y103 escalate: ladder csm_manager → vp_cs → executive', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());

  const e1 = eng.escalate(plan.id, 'csm_manager');
  assert.equal(e1.level, 'csm_manager');
  assert.deepEqual(e1.recipients, ['csm_manager']);

  const e2 = eng.escalate(plan.id, 'vp_cs');
  assert.equal(e2.level, 'vp_cs');
  assert.deepEqual(e2.recipients, ['csm_manager', 'vp_cs']);

  const e3 = eng.escalate(plan.id, 'executive');
  assert.equal(e3.level, 'executive');
  assert.deepEqual(e3.recipients, ['csm_manager', 'vp_cs', 'cro', 'ceo']);

  const stored = eng.getPlan(plan.id);
  assert.equal(stored.escalations.filter((e) => e.level === 'csm_manager').length, 1);
  assert.equal(stored.escalations.filter((e) => e.level === 'vp_cs').length, 1);
  assert.equal(stored.escalations.filter((e) => e.level === 'executive').length, 1);
  assert.equal(stored.history.filter((h) => h.type === 'escalation').length, 3);
});

test('Y103 escalate: unknown level throws', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  assert.throws(() => eng.escalate(plan.id, 'cto'), /invalid escalation level/);
});

// 10 — scheduleReview
test('Y103 scheduleReview: records review meeting and attendees', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  const rev = eng.scheduleReview(
    plan.id,
    '2026-05-15T10:00:00.000Z',
    ['maya.cohen@technokol.co.il', 'client.cfo@customer.co.il'],
  );
  assert.ok(rev.id.startsWith('rev_'));
  assert.equal(rev.scheduled_at, '2026-05-15T10:00:00.000Z');
  assert.equal(rev.attendees.length, 2);
  assert.equal(rev.status, 'scheduled');

  const stored = eng.getPlan(plan.id);
  assert.equal(stored.reviews.length, 1);
  assert.ok(stored.history.find((h) => h.type === 'review_scheduled'));
});

test('Y103 scheduleReview: requires a date', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  assert.throws(() => eng.scheduleReview(plan.id, null, []), /date is required/);
});

// 11 — generateDeck bilingual HTML
test('Y103 generateDeck: bilingual HTML deck with RTL + LTR sections', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 50 });

  const deck = eng.generateDeck(plan.id, 'both');
  assert.equal(deck.content_type, 'text/html; charset=utf-8');
  assert.equal(deck.bilingual, true);
  assert.ok(deck.html.includes('<!doctype html>'));
  // Hebrew section
  assert.ok(deck.html.includes('dir="rtl"'));
  assert.ok(deck.html.includes('תקציר מנהלים'));
  assert.ok(deck.html.includes('חזון'));
  // English section
  assert.ok(deck.html.includes('dir="ltr"'));
  assert.ok(deck.html.includes('Executive Summary'));
  assert.ok(deck.html.includes('Vision'));
  // Goals table with at least one goal id
  assert.ok(deck.html.includes('g_adoption'));
});

test('Y103 generateDeck: lang=he produces RTL-only deck', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  const deck = eng.generateDeck(plan.id, 'he');
  assert.equal(deck.bilingual, false);
  assert.ok(deck.html.includes('dir="rtl"'));
  assert.ok(!deck.html.includes('Executive Summary'));
});

// 12 — aggregatePortfolio for a CSM
test('Y103 aggregatePortfolio: returns all plans owned by a CSM', () => {
  const eng = y103Engine('2026-05-01T00:00:00.000Z');
  const p1 = eng.createPlan(y103Args({ customerId: 'cust_A' }));
  const p2 = eng.createPlan(y103Args({ customerId: 'cust_B' }));
  const p3 = eng.createPlan(y103Args({
    customerId: 'cust_C',
    csm: 'other@technokol.co.il',
  }));

  eng.updateMilestone({ planId: p1.id, goalId: 'g_adoption', currentValue: 70 });
  eng.markAtRisk(p2.id, 'Engagement drop');

  const portfolio = eng.aggregatePortfolio('maya.cohen@technokol.co.il');
  assert.equal(portfolio.total, 2);
  const ids = portfolio.plans.map((p) => p.id).sort();
  assert.deepEqual(ids, [p1.id, p2.id].sort());
  assert.ok(portfolio.totals.avg_progress_pct >= 0);
  assert.ok(portfolio.totals.green + portfolio.totals.yellow + portfolio.totals.red === 2);
  // The third plan must not leak
  assert.equal(portfolio.plans.filter((p) => p.id === p3.id).length, 0);
});

test('Y103 aggregatePortfolio: requires csmId', () => {
  const eng = y103Engine();
  assert.throws(() => eng.aggregatePortfolio(''), /csmId is required/);
});

// 13 — graduatePlan preserves record
test('Y103 graduatePlan: flips status to graduated, record fully preserved', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 80 });
  eng.scheduleReview(plan.id, '2026-06-10T10:00:00.000Z', ['maya.cohen@technokol.co.il']);

  const beforeGoalCount = plan.goals.length;
  const graduated = eng.graduatePlan(plan.id);
  assert.equal(graduated.status, 'graduated');
  assert.equal(graduated.status_he, PLAN_STATUS.graduated.he);
  assert.equal(graduated.status_en, PLAN_STATUS.graduated.en);
  assert.equal(graduated.graduated_at, REF_NOW);
  // Record preserved
  assert.equal(graduated.goals.length, beforeGoalCount);
  assert.equal(graduated.reviews.length, 1);
  assert.ok(graduated.history.find((h) => h.type === 'graduated'));
  // Goal still there with its actuals
  const adoption = graduated.goals.find((g) => g.id === 'g_adoption');
  assert.equal(adoption.actuals.length, 1);
});

// 14 — closeUnsuccessful preserves full history
test('Y103 closeUnsuccessful: status flip preserves full history', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 25 });
  eng.markAtRisk(plan.id, 'Churn');
  eng.escalate(plan.id, 'vp_cs');

  const closed = eng.closeUnsuccessful(plan.id, 'Customer went with competitor');
  assert.equal(closed.status, 'closed_unsuccessful');
  assert.equal(closed.closed_reason, 'Customer went with competitor');
  assert.equal(closed.closed_at, REF_NOW);
  // Every history event is retained
  assert.ok(closed.history.find((h) => h.type === 'created'));
  assert.ok(closed.history.find((h) => h.type === 'milestone_update'));
  assert.ok(closed.history.find((h) => h.type === 'marked_at_risk'));
  assert.ok(closed.history.find((h) => h.type === 'escalation'));
  assert.ok(closed.history.find((h) => h.type === 'closed_unsuccessful'));
  // Goals + escalations preserved
  assert.ok(closed.goals.length >= 3);
  assert.ok(closed.escalations.length >= 1);
});

test('Y103 closeUnsuccessful: requires reason', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  assert.throws(() => eng.closeUnsuccessful(plan.id, ''), /reason is required/);
});

// 15 — Immutable rule: "לא מוחקים רק משדרגים ומגדלים"
test('Y103 never-delete invariant: addMilestone + updates only grow the record', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args());
  const initialGoalCount = plan.goals.length;
  const initialHistoryLen = plan.history.length;

  eng.addMilestone(plan.id, {
    id: 'g_growth',
    name_he: 'גידול שיעור שימוש',
    name_en: 'Grow usage frequency',
    metric: 'daily_active',
    baseline: 10,
    target: 50,
    weight: 1,
    dueDate: '2026-10-31',
  });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_growth', currentValue: 20 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_growth', currentValue: 35 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_growth', currentValue: 45 });

  const stored = eng.getPlan(plan.id);
  assert.equal(stored.goals.length, initialGoalCount + 1);
  const g = stored.goals.find((x) => x.id === 'g_growth');
  assert.equal(g.actuals.length, 3, 'all three updates retained');
  assert.ok(stored.history.length > initialHistoryLen);
  // original goals still present & untouched
  for (const original of plan.goals) {
    assert.ok(stored.goals.find((x) => x.id === original.id));
  }
});

// 16 — computeProgress uses baseline and weight correctly
test('Y103 computeProgress: weights skew the weighted average', () => {
  const eng = y103Engine();
  const plan = eng.createPlan(y103Args({
    goals: [
      { id: 'heavy', name_he: 'כבד', name_en: 'Heavy', target: 100, baseline: 0, weight: 9, dueDate: '2026-10-01' },
      { id: 'light', name_he: 'קל',  name_en: 'Light', target: 100, baseline: 0, weight: 1, dueDate: '2026-10-01' },
    ],
  }));
  eng.updateMilestone({ planId: plan.id, goalId: 'heavy', currentValue: 90 });
  eng.updateMilestone({ planId: plan.id, goalId: 'light', currentValue: 10 });
  // Weighted: (0.9*9 + 0.1*1) / 10 = 8.2 / 10 = 0.82 → 82%
  const p = eng.computeProgress(plan.id);
  assert.equal(p.progress_pct, 82);
});

// 17 — riskAssessment downgrade for critical risks
test('Y103 riskAssessment: critical risks downgrade band', () => {
  const eng = y103Engine('2026-02-15T00:00:00.000Z');
  const plan = eng.createPlan(y103Args({
    risks: [
      { description_he: 'סיכון 1', description_en: 'Risk 1', severity: 'critical' },
      { description_he: 'סיכון 2', description_en: 'Risk 2', severity: 'critical' },
    ],
  }));
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 30 });
  const r = eng.riskAssessment(plan.id);
  assert.equal(r.critical_risks, 2);
  // With 2 criticals, the band is floored to yellow at best.
  assert.notEqual(r.band, 'green');
});

// 18 — Dictionary integrity: all exposed constants are bilingual
test('Y103 dictionaries: RISK_BANDS / ESCALATION_LEVELS / REVIEW_CADENCES all bilingual', () => {
  for (const k of Object.keys(RISK_BANDS)) {
    assert.ok(RISK_BANDS[k].he);
    assert.ok(RISK_BANDS[k].en);
  }
  for (const k of Object.keys(ESCALATION_LEVELS)) {
    assert.ok(ESCALATION_LEVELS[k].he);
    assert.ok(ESCALATION_LEVELS[k].en);
    assert.ok(Array.isArray(ESCALATION_LEVELS[k].recipients));
  }
  assert.deepEqual(
    Object.keys(REVIEW_CADENCES).sort(),
    ['biweekly', 'monthly', 'quarterly', 'weekly'],
  );
});

// 19 — End-to-end Y-103 flow
test('Y103 end-to-end: create → milestones → risk → escalate → graduate', () => {
  const eng = y103Engine('2026-09-01T00:00:00.000Z');
  const plan = eng.createPlan(y103Args({
    customerId: 'cust_E2E',
    reviewCadence: 'biweekly',
  }));
  eng.updateMilestone({ planId: plan.id, goalId: 'g_adoption', currentValue: 80 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_nps', currentValue: 50 });
  eng.updateMilestone({ planId: plan.id, goalId: 'g_roi', currentValue: 2 });
  const risk = eng.riskAssessment(plan.id);
  assert.equal(risk.band, 'green');

  const deck = eng.generateDeck(plan.id, 'both');
  assert.ok(deck.html.length > 500);

  eng.scheduleReview(plan.id, '2026-09-15T14:00:00.000Z', ['maya', 'cfo']);
  const graduated = eng.graduatePlan(plan.id);
  assert.equal(graduated.status, 'graduated');

  const port = eng.aggregatePortfolio('maya.cohen@technokol.co.il');
  assert.ok(port.plans.find((p) => p.id === plan.id));
});
