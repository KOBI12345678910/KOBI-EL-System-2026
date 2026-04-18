/**
 * Churn Prevention — Unit Tests
 * Agent Y-100 — Swarm 4 — Techno-Kol Uzi ERP
 *
 * Run with:   node --test test/customer/churn-prevention.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  ChurnPrevention,
  PLAYBOOK,
  SEVERITY_WEIGHT,
  CLOSE_OUTCOMES,
  INTERVENTION_COST_ILS,
  GLOSSARY,
  TRIGGERS,
  TRIGGER_SEVERITY,
  DEFAULT_PLAYBOOKS,
  LOOP_STATES,
  OFFER_KINDS,
  scoreToLevel,
  round2,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'churn-prevention.js'));

// ─── fixtures ──────────────────────────────────────────────────────────────

const REF = new Date('2026-04-11T09:00:00Z');

function daysAgo(n) {
  const d = new Date(REF.getTime());
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function makeSystem() {
  return new ChurnPrevention({ now: REF });
}

// ─── tests: catalog ────────────────────────────────────────────────────────

test('defineSignals — seeds defaults and accepts upgrades without deleting', () => {
  const sys = makeSystem();
  const catalog = sys.listSignalCatalog();
  // Seeded with at least the defaults
  assert.ok(catalog.length >= 10, `expected >=10 defaults, got ${catalog.length}`);
  const byName = Object.fromEntries(catalog.map((c) => [c.name, c]));
  assert.equal(byName.ticket_spike.severity, 'medium');
  assert.equal(byName.payment_missed.severity, 'high');
  assert.equal(byName.competitor_mention.severity, 'high');

  // Upgrade an existing signal — severity bumps, old metadata preserved
  sys.defineSignals({
    signals: [
      { name: 'ticket_spike', severity: 'high', source: 'helpdesk_v2' },
      { name: 'custom_manual_flag', source: 'ops', trigger: 'manual', severity: 'critical' },
    ],
  });
  const after = Object.fromEntries(sys.listSignalCatalog().map((c) => [c.name, c]));
  assert.equal(after.ticket_spike.severity, 'high');
  assert.equal(after.ticket_spike.source, 'helpdesk_v2');
  assert.equal(after.custom_manual_flag.severity, 'critical');
  // Nothing was deleted — still have payment_missed
  assert.ok(after.payment_missed);
});

test('defineSignals — rejects non-object input', () => {
  const sys = makeSystem();
  assert.throws(() => sys.defineSignals(null), TypeError);
  // Empty signals list is a no-op, not an error
  const empty = sys.defineSignals({ signals: [] });
  assert.deepEqual(empty, []);
});

// ─── tests: recordSignal & monitorCustomer ─────────────────────────────────

test('recordSignal — appends event and monitorCustomer returns it', () => {
  const sys = makeSystem();
  const ev = sys.recordSignal({
    customerId: 'CUS-001',
    name: 'payment_missed',
    source: 'billing',
    payload: { invoice: 'INV-999', amount: 12000 },
    at: daysAgo(2),
  });
  assert.match(ev.id, /^SIG-\d{6}$/);
  assert.equal(ev.customer_id, 'CUS-001');
  assert.equal(ev.severity, 'high');
  assert.equal(ev.label_he, 'תשלום שלא בוצע');
  assert.equal(ev.label_en, 'Payment Missed');

  const view = sys.monitorCustomer('CUS-001');
  assert.equal(view.total_signals, 1);
  assert.equal(view.signals[0].id, ev.id);
  assert.equal(view.risk_score.level, 'high');
  assert.equal(view.risk_score.score, SEVERITY_WEIGHT.high);
});

test('recordSignal — auto-registers unknown signal names', () => {
  const sys = makeSystem();
  const ev = sys.recordSignal({
    customerId: 'CUS-002',
    name: 'rogue_signal_zzz',
    source: 'scanner',
    severity: 'medium',
  });
  assert.equal(ev.name, 'rogue_signal_zzz');
  const cat = sys.listSignalCatalog().find((c) => c.name === 'rogue_signal_zzz');
  assert.ok(cat, 'expected auto-registered catalog entry');
  assert.equal(cat.severity, 'medium');
});

test('recordSignal — missing customerId throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.recordSignal({ name: 'payment_missed' }), TypeError);
  assert.throws(() => sys.recordSignal({ customerId: 'X' }), TypeError);
});

// ─── tests: detectAtRisk ───────────────────────────────────────────────────

test('detectAtRisk — ranks customers by weighted severity', () => {
  const sys = makeSystem();
  // CUS-A : one medium (weight 3)
  sys.recordSignal({ customerId: 'CUS-A', name: 'usage_drop', at: daysAgo(5) });
  // CUS-B : one high (weight 6) + one low (weight 1) = 7
  sys.recordSignal({ customerId: 'CUS-B', name: 'payment_missed', at: daysAgo(3) });
  sys.recordSignal({ customerId: 'CUS-B', name: 'feature_complaint', at: daysAgo(1) });
  // CUS-C : one critical (weight 10)
  sys.recordSignal({ customerId: 'CUS-C', name: 'contract_renewal_at_risk', at: daysAgo(4) });
  // CUS-D : outside the period — must not appear
  sys.recordSignal({ customerId: 'CUS-D', name: 'payment_missed', at: daysAgo(400) });

  const risky = sys.detectAtRisk({
    period: { from: daysAgo(30), to: REF.toISOString() },
  });

  assert.equal(risky.length, 3);
  // Order: C (10) > B (7) > A (3)
  assert.equal(risky[0].customer_id, 'CUS-C');
  assert.equal(risky[0].risk_level, 'critical');
  assert.equal(risky[0].score, 10);
  assert.equal(risky[1].customer_id, 'CUS-B');
  assert.equal(risky[1].risk_level, 'high');
  assert.equal(risky[1].score, 7);
  assert.equal(risky[2].customer_id, 'CUS-A');
  assert.equal(risky[2].risk_level, 'medium');
  assert.equal(risky[2].score, 3);
  // Signals are attached
  assert.equal(risky[1].signal_count, 2);
  assert.equal(risky[1].severities.high, 1);
  assert.equal(risky[1].severities.low, 1);
});

test('detectAtRisk — empty ledger returns []', () => {
  const sys = makeSystem();
  const r = sys.detectAtRisk({ period: { from: daysAgo(30), to: REF.toISOString() } });
  assert.deepEqual(r, []);
});

// ─── tests: interventionPlaybook ───────────────────────────────────────────

test('interventionPlaybook — returns bilingual playbook for each severity', () => {
  const sys = makeSystem();
  const low = sys.interventionPlaybook({ riskLevel: 'low' });
  const med = sys.interventionPlaybook({ riskLevel: 'medium' });
  const high = sys.interventionPlaybook({ riskLevel: 'high' });
  const critical = sys.interventionPlaybook({ riskLevel: 'critical' });

  assert.equal(low.label_en, 'Email check-in');
  assert.equal(med.label_en, 'Phone call from AM');
  assert.equal(high.label_en, 'Executive-sponsor meeting');
  assert.equal(critical.label_en, 'Save-team escalation');

  // Hebrew is populated
  assert.ok(low.label_he.length > 0);
  assert.ok(med.label_he.length > 0);
  assert.ok(high.label_he.length > 0);
  assert.ok(critical.label_he.length > 0);

  // SLA tightens with severity
  assert.ok(critical.sla_hours < high.sla_hours);
  assert.ok(high.sla_hours < med.sla_hours);
  assert.ok(med.sla_hours < low.sla_hours);
});

test('interventionPlaybook — "med" alias resolves to medium', () => {
  const sys = makeSystem();
  const pb = sys.interventionPlaybook({ riskLevel: 'med' });
  assert.equal(pb.key, 'medium');
});

test('interventionPlaybook — unknown level falls back to medium', () => {
  const sys = makeSystem();
  const pb = sys.interventionPlaybook({ riskLevel: 'unknown' });
  assert.equal(pb.key, 'medium');
});

// ─── tests: openIntervention / recordAction / closeIntervention ────────────

test('openIntervention — creates case, attaches playbook and SLA', () => {
  const sys = makeSystem();
  const iv = sys.openIntervention({
    customerId: 'CUS-777',
    severity: 'high',
    reason: 'payment_missed two months in a row',
    owner: 'alice@tk-uzi.co.il',
  });
  assert.match(iv.id, /^ITV-\d{6}$/);
  assert.equal(iv.customer_id, 'CUS-777');
  assert.equal(iv.severity, 'high');
  assert.equal(iv.status, 'open');
  assert.equal(iv.owner, 'alice@tk-uzi.co.il');
  assert.equal(iv.playbook_label_en, 'Executive-sponsor meeting');
  assert.equal(iv.cost_ils, INTERVENTION_COST_ILS.high);
  // due_at == now + 8 hours
  const due = new Date(iv.due_at).getTime() - new Date(iv.opened_at).getTime();
  assert.equal(due / (60 * 60 * 1000), PLAYBOOK.high.sla_hours);
});

test('openIntervention — missing customerId throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.openIntervention({ severity: 'high', reason: 'x' }), TypeError);
});

test('recordAction — appends action in order, blocks once closed', () => {
  const sys = makeSystem();
  const iv = sys.openIntervention({ customerId: 'CUS-10', severity: 'medium', reason: 'usage_drop' });
  const a1 = sys.recordAction({
    interventionId: iv.id,
    action: 'called primary contact',
    outcome: 'in_progress',
    date: daysAgo(1),
    notes: 'left voicemail',
  });
  const a2 = sys.recordAction({
    interventionId: iv.id,
    action: 'sent renewal offer',
    outcome: 'pending',
  });
  assert.equal(a1.intervention_id, iv.id);
  assert.equal(a2.intervention_id, iv.id);
  const actions = sys.listActions(iv.id);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].action, 'called primary contact');
  assert.equal(actions[1].action, 'sent renewal offer');

  // Close — further recordAction must fail
  sys.closeIntervention({
    interventionId: iv.id,
    outcome: 'saved',
    revenueSaved: 15000,
  });
  assert.throws(() => sys.recordAction({ interventionId: iv.id, action: 'too late' }), /closed/);
});

test('recordAction — unknown intervention and empty action throw', () => {
  const sys = makeSystem();
  assert.throws(() => sys.recordAction({ interventionId: 'ITV-999999', action: 'x' }), /unknown/);
  const iv = sys.openIntervention({ customerId: 'CUS-1', severity: 'low', reason: 'r' });
  assert.throws(() => sys.recordAction({ interventionId: iv.id, action: '' }), TypeError);
});

test('closeIntervention — valid outcomes only, idempotent guard', () => {
  const sys = makeSystem();
  const iv = sys.openIntervention({ customerId: 'CUS-50', severity: 'low', reason: 'x' });
  assert.throws(() => sys.closeIntervention({ interventionId: iv.id, outcome: 'deleted' }), TypeError);

  const closed = sys.closeIntervention({ interventionId: iv.id, outcome: 'churned', notes: 'client gone' });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.outcome, 'churned');
  assert.equal(closed.revenue_saved_ils, 0);

  // Second close must fail — nothing ever mutates twice
  assert.throws(() => sys.closeIntervention({ interventionId: iv.id, outcome: 'saved' }), /already/);
});

test('closeIntervention — saved records revenue, others zero it out', () => {
  const sys = makeSystem();
  const iv1 = sys.openIntervention({ customerId: 'CUS-60', severity: 'high', reason: 'r' });
  sys.closeIntervention({ interventionId: iv1.id, outcome: 'saved', revenueSaved: 50000 });
  const fetched1 = sys.getIntervention(iv1.id);
  assert.equal(fetched1.revenue_saved_ils, 50000);

  const iv2 = sys.openIntervention({ customerId: 'CUS-61', severity: 'high', reason: 'r' });
  sys.closeIntervention({ interventionId: iv2.id, outcome: 'downgraded', revenueSaved: 999 });
  const fetched2 = sys.getIntervention(iv2.id);
  assert.equal(fetched2.revenue_saved_ils, 0);
});

// ─── tests: saveRate ───────────────────────────────────────────────────────

test('saveRate — computes percentage and counts by outcome', () => {
  const sys = makeSystem();
  // 4 interventions, 2 saved, 1 churned, 1 downgraded
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const iv = sys.openIntervention({
      customerId: `CUS-${100 + i}`,
      severity: 'medium',
      reason: 'r',
    });
    ids.push(iv.id);
  }
  sys.closeIntervention({ interventionId: ids[0], outcome: 'saved', revenueSaved: 10000 });
  sys.closeIntervention({ interventionId: ids[1], outcome: 'saved', revenueSaved: 20000 });
  sys.closeIntervention({ interventionId: ids[2], outcome: 'churned' });
  sys.closeIntervention({ interventionId: ids[3], outcome: 'downgraded' });

  const r = sys.saveRate();
  assert.equal(r.total, 4);
  assert.equal(r.saved, 2);
  assert.equal(r.rate_pct, 50);
  assert.deepEqual(r.counts_by_outcome, {
    saved: 2,
    churned: 1,
    downgraded: 1,
    escalated: 0,
  });
});

test('saveRate — zero closed interventions returns 0%', () => {
  const sys = makeSystem();
  sys.openIntervention({ customerId: 'CUS-X', severity: 'low', reason: 'r' });
  const r = sys.saveRate();
  assert.equal(r.total, 0);
  assert.equal(r.saved, 0);
  assert.equal(r.rate_pct, 0);
});

// ─── tests: preventionROI ──────────────────────────────────────────────────

test('preventionROI — revenue saved minus cost of interventions, ROI %', () => {
  const sys = makeSystem();
  // low save 5000 ILS (cost 250)
  const a = sys.openIntervention({ customerId: 'C1', severity: 'low', reason: 'r' });
  sys.closeIntervention({ interventionId: a.id, outcome: 'saved', revenueSaved: 5000 });
  // medium churned (cost 1200, no revenue)
  const b = sys.openIntervention({ customerId: 'C2', severity: 'medium', reason: 'r' });
  sys.closeIntervention({ interventionId: b.id, outcome: 'churned' });
  // high saved 80000 ILS (cost 4500)
  const c = sys.openIntervention({ customerId: 'C3', severity: 'high', reason: 'r' });
  sys.closeIntervention({ interventionId: c.id, outcome: 'saved', revenueSaved: 80000 });

  const roi = sys.preventionROI();
  assert.equal(roi.closed_count, 3);
  assert.equal(roi.saved_count, 2);
  assert.equal(roi.revenue_saved_ils, 85000);
  // Cost = 250 + 1200 + 4500 = 5950
  assert.equal(roi.cost_ils, 5950);
  assert.equal(roi.net_ils, 85000 - 5950);
  // ROI pct = (net / cost) * 100 = 79050 / 5950 * 100 ≈ 1328.57
  assert.ok(Math.abs(roi.roi_pct - 1328.57) < 0.01);
  assert.equal(roi.per_severity_cost.high, 4500);
  assert.equal(roi.per_severity_saved.high, 80000);
});

test('preventionROI — no closed interventions returns zero cost, zero ROI', () => {
  const sys = makeSystem();
  const roi = sys.preventionROI();
  assert.equal(roi.cost_ils, 0);
  assert.equal(roi.roi_pct, 0);
  assert.equal(roi.closed_count, 0);
});

// ─── tests: winBack ────────────────────────────────────────────────────────

test('winBack — creates bilingual campaign record', () => {
  const sys = makeSystem();
  const rec = sys.winBack({
    customerId: 'CUS-999',
    reason: 'switched to competitor',
    offer: '20% discount + free onboarding',
    offerValue: 12000,
  });
  assert.match(rec.id, /^WB-\d{6}$/);
  assert.equal(rec.customer_id, 'CUS-999');
  assert.equal(rec.status, 'open');
  assert.equal(rec.offer_value_ils, 12000);
  assert.ok(rec.message_he.length > 0);
  assert.ok(rec.message_en.length > 0);
  assert.ok(rec.message_he.indexOf('התגעגענו') !== -1);
  assert.ok(rec.message_en.indexOf('missed you') !== -1);
});

test('winBack — missing customerId throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.winBack({ reason: 'x', offer: 'y' }), TypeError);
});

// ─── tests: churnDebriefing ────────────────────────────────────────────────

test('churnDebriefing — template has bilingual questions', () => {
  const sys = makeSystem();
  const tmpl = sys.churnDebriefing('CUS-11');
  assert.equal(tmpl.customer_id, 'CUS-11');
  assert.equal(tmpl.title_he, 'תחקיר פרידה');
  assert.equal(tmpl.title_en, 'Exit Debrief');
  assert.ok(tmpl.questions.length >= 6);
  for (const q of tmpl.questions) {
    assert.ok(q.he && q.en && q.key);
  }
});

test('churnDebriefing — stores answers when provided', () => {
  const sys = makeSystem();
  const answered = sys.churnDebriefing('CUS-12', {
    primary_reason: 'עלות',
    would_return: 'כן, בתנאים',
  });
  assert.match(answered.record_id, /^DBR-\d{6}$/);
  const all = sys.listDebriefs();
  assert.equal(all.length, 1);
  assert.equal(all[0].answers.primary_reason, 'עלות');
});

// ─── tests: alertExecutive & communicateToTeam (escalation / comms) ────────

test('alertExecutive — bilingual message with severity in Hebrew and English', () => {
  const sys = makeSystem();
  const alert = sys.alertExecutive({
    customerId: 'CUS-500',
    severity: 'critical',
    note: 'will cancel contract next week',
  });
  assert.match(alert.id, /^EXE-\d{6}$/);
  assert.equal(alert.severity, 'critical');
  assert.ok(alert.subject_he.indexOf('CUS-500') !== -1);
  assert.ok(alert.subject_en.indexOf('CUS-500') !== -1);
  assert.ok(alert.body_he.indexOf('קריטית') !== -1);
  assert.ok(alert.body_en.indexOf('critical') !== -1);
  assert.ok(alert.body_en.indexOf('Save-team escalation') !== -1);
  assert.ok(alert.to_role.includes('ceo'));

  const stored = sys.listExecutiveAlerts();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, alert.id);
});

test('alertExecutive — missing customerId throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.alertExecutive({ severity: 'high' }), TypeError);
});

test('communicateToTeam — builds bilingual notification from intervention', () => {
  const sys = makeSystem();
  const iv = sys.openIntervention({
    customerId: 'CUS-600',
    severity: 'high',
    reason: 'key_contact_left',
    owner: 'bob@tk-uzi.co.il',
  });
  const msg = sys.communicateToTeam(iv.id);
  assert.equal(msg.intervention_id, iv.id);
  assert.equal(msg.customer_id, 'CUS-600');
  assert.ok(msg.subject_he.indexOf(iv.id) !== -1);
  assert.ok(msg.subject_en.indexOf(iv.id) !== -1);
  assert.ok(msg.body_he.indexOf('פלייבוק') !== -1);
  assert.ok(msg.body_en.indexOf('Playbook') !== -1);
  assert.ok(msg.body_en.indexOf('Executive-sponsor meeting') !== -1);
  assert.ok(msg.body_en.indexOf('bob@tk-uzi.co.il') !== -1);
});

test('communicateToTeam — unknown intervention throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.communicateToTeam('ITV-999999'), /unknown/);
});

// ─── tests: never-delete, frozen results ──────────────────────────────────

test('listInterventions — returns frozen objects, filters by status', () => {
  const sys = makeSystem();
  const a = sys.openIntervention({ customerId: 'C1', severity: 'low', reason: 'r' });
  const b = sys.openIntervention({ customerId: 'C2', severity: 'high', reason: 'r' });
  sys.closeIntervention({ interventionId: a.id, outcome: 'saved', revenueSaved: 1000 });
  const open = sys.listInterventions({ status: 'open' });
  const closed = sys.listInterventions({ status: 'closed' });
  assert.equal(open.length, 1);
  assert.equal(closed.length, 1);
  assert.equal(open[0].id, b.id);
  assert.equal(closed[0].id, a.id);
  // Frozen — mutation attempts are no-ops in non-strict, throw in strict
  assert.ok(Object.isFrozen(open[0]));
});

test('export/import — round-trip preserves ledger', () => {
  const sys = makeSystem();
  sys.recordSignal({ customerId: 'CUS-001', name: 'payment_missed' });
  const iv = sys.openIntervention({ customerId: 'CUS-001', severity: 'high', reason: 'r' });
  sys.recordAction({ interventionId: iv.id, action: 'called' });
  sys.closeIntervention({ interventionId: iv.id, outcome: 'saved', revenueSaved: 5000 });
  const snap = sys.exportJson();
  const sys2 = makeSystem();
  sys2.importJson(snap);
  const roi1 = sys.preventionROI();
  const roi2 = sys2.preventionROI();
  assert.deepEqual(roi2, roi1);
  assert.deepEqual(sys2.listInterventions(), sys.listInterventions());
});

test('glossary exposes the Hebrew and English terms', () => {
  assert.equal(GLOSSARY.churn.he, 'נטישה');
  assert.equal(GLOSSARY.churn.en, 'Churn');
  assert.equal(GLOSSARY.severity_critical.he, 'קריטית');
  assert.equal(GLOSSARY.outcome_saved.en, 'Saved');
});

test('CLOSE_OUTCOMES enumerates exactly four values', () => {
  assert.deepEqual(CLOSE_OUTCOMES.slice().sort(), ['churned', 'downgraded', 'escalated', 'saved']);
});

// ═══════════════════════════════════════════════════════════════════════════
// AGENT Y-100 — NEW CHURN-PREVENTION API  (signals + playbooks + save)
// ═══════════════════════════════════════════════════════════════════════════

// ─── tests: seven canonical triggers are defined as defaults ───────────────

test('Y100: TRIGGERS exposes exactly the seven canonical triggers', () => {
  assert.equal(TRIGGERS.length, 7);
  assert.ok(TRIGGERS.indexOf('health-score-drop') !== -1);
  assert.ok(TRIGGERS.indexOf('nps-detractor') !== -1);
  assert.ok(TRIGGERS.indexOf('payment-late') !== -1);
  assert.ok(TRIGGERS.indexOf('support-escalation') !== -1);
  assert.ok(TRIGGERS.indexOf('contract-end-approaching') !== -1);
  assert.ok(TRIGGERS.indexOf('usage-decline') !== -1);
  assert.ok(TRIGGERS.indexOf('contact-change') !== -1);
});

test('Y100: constructor seeds a default playbook per trigger', () => {
  const sys = makeSystem();
  const pbs = sys.listPlaybooks();
  assert.ok(pbs.length >= 7, `expected >=7 default playbooks, got ${pbs.length}`);
  const triggers = new Set(pbs.map((p) => p.trigger));
  for (const t of TRIGGERS) assert.ok(triggers.has(t), `missing playbook for ${t}`);
});

// ─── tests: definePlaybook ────────────────────────────────────────────────

test('Y100: definePlaybook registers a new playbook and upgrades existing', () => {
  const sys = makeSystem();
  const pb = sys.definePlaybook({
    id: 'pb-custom-1',
    trigger: 'usage-decline',
    severity: 'high',
    owner: 'csm.alice',
    successMetric: 'dau_up_20_pct',
    steps: [
      { id: 's1', label_he: 'שיחת אימוץ', label_en: 'Adoption call' },
      { id: 's2', label_he: 'הדגמת פיצ׳ר', label_en: 'Feature demo' },
      { id: 's3', label_he: 'מעקב', label_en: 'Follow-up' },
    ],
  });
  assert.equal(pb.id, 'pb-custom-1');
  assert.equal(pb.trigger, 'usage-decline');
  assert.equal(pb.severity, 'high');
  assert.equal(pb.owner, 'csm.alice');
  assert.equal(pb.success_metric, 'dau_up_20_pct');
  assert.equal(pb.steps.length, 3);
  assert.equal(pb.steps[0].order, 1);

  // Upgrade — severity bumps but owner + metric persist
  const upgraded = sys.definePlaybook({
    id: 'pb-custom-1',
    trigger: 'usage-decline',
    severity: 'critical',
    owner: 'csm.alice',
    successMetric: 'dau_up_20_pct',
    steps: [
      { id: 's1', label_he: 'שיחת אימוץ', label_en: 'Adoption call' },
      { id: 's2', label_he: 'הדגמת פיצ׳ר', label_en: 'Feature demo' },
      { id: 's3', label_he: 'מעקב', label_en: 'Follow-up' },
      { id: 's4', label_he: 'QBR חירום', label_en: 'Emergency QBR' },
    ],
  });
  assert.equal(upgraded.severity, 'critical');
  assert.equal(upgraded.steps.length, 4);

  // Nothing else was deleted — default pb-usage-decline still present.
  const stillThere = sys.getPlaybook('pb-usage-decline');
  assert.ok(stillThere, 'default playbook should still exist after custom upgrade');
});

test('Y100: definePlaybook throws on missing id or trigger', () => {
  const sys = makeSystem();
  assert.throws(() => sys.definePlaybook({}), TypeError);
  assert.throws(() => sys.definePlaybook({ id: 'x' }), TypeError);
  assert.throws(() => sys.definePlaybook({ trigger: 'usage-decline' }), TypeError);
});

// ─── tests: registerSignal & churnRisk ────────────────────────────────────

test('Y100: registerSignal appends to the log and is visible via listSignals', () => {
  const sys = makeSystem();
  const s1 = sys.registerSignal({
    customerId: 'CUS-Y1',
    type: 'health-score-drop',
    value: { from: 82, to: 54 },
    timestamp: daysAgo(1),
  });
  assert.match(s1.id, /^SIG-\d{6}$/);
  assert.equal(s1.type, 'health-score-drop');
  assert.equal(s1.severity, 'high');
  const all = sys.listSignals('CUS-Y1');
  assert.equal(all.length, 1);
  assert.equal(all[0].id, s1.id);
});

test('Y100: registerSignal — missing customerId/type throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.registerSignal({ type: 'payment-late' }), TypeError);
  assert.throws(() => sys.registerSignal({ customerId: 'C' }), TypeError);
});

test('Y100: churnRisk — zero when no signals', () => {
  const sys = makeSystem();
  assert.equal(sys.churnRisk('CUS-EMPTY'), 0);
});

test('Y100: churnRisk — weighted aggregation grows with severity', () => {
  const sys = makeSystem();
  // Single low signal today
  sys.registerSignal({ customerId: 'CUS-A', type: 'contact-change', timestamp: REF.toISOString(), severity: 'low' });
  const lowRisk = sys.churnRisk('CUS-A');

  // Single critical signal today
  sys.registerSignal({ customerId: 'CUS-B', type: 'contract-end-approaching', timestamp: REF.toISOString() });
  const critRisk = sys.churnRisk('CUS-B');
  assert.ok(critRisk > lowRisk, `expected critical > low, got crit=${critRisk} low=${lowRisk}`);
  assert.ok(critRisk <= 100);

  // Multiple stacked mediums on another customer should beat the single low
  sys.registerSignal({ customerId: 'CUS-C', type: 'nps-detractor', timestamp: REF.toISOString() });
  sys.registerSignal({ customerId: 'CUS-C', type: 'usage-decline', timestamp: REF.toISOString() });
  sys.registerSignal({ customerId: 'CUS-C', type: 'nps-detractor', timestamp: REF.toISOString() });
  const stackedRisk = sys.churnRisk('CUS-C');
  assert.ok(stackedRisk > lowRisk);
});

test('Y100: churnRisk — capped at 100', () => {
  const sys = makeSystem();
  for (let i = 0; i < 20; i++) {
    sys.registerSignal({
      customerId: 'CUS-CAP',
      type: 'contract-end-approaching',
      timestamp: REF.toISOString(),
    });
  }
  assert.equal(sys.churnRisk('CUS-CAP'), 100);
});

test('Y100: churnRisk — older signals decay, very old are ignored', () => {
  const sys = makeSystem();
  // One critical 200 days ago — should be ignored entirely
  sys.registerSignal({
    customerId: 'CUS-OLD',
    type: 'contract-end-approaching',
    timestamp: daysAgo(200),
  });
  assert.equal(sys.churnRisk('CUS-OLD'), 0);

  // One high 70 days ago — decayed to 50%
  sys.registerSignal({
    customerId: 'CUS-MID',
    type: 'payment-late',
    timestamp: daysAgo(70),
  });
  const midRisk = sys.churnRisk('CUS-MID');

  // Same signal today
  sys.registerSignal({
    customerId: 'CUS-NEW',
    type: 'payment-late',
    timestamp: REF.toISOString(),
  });
  const newRisk = sys.churnRisk('CUS-NEW');
  assert.ok(newRisk > midRisk, `expected today > 70d-old, got ${newRisk} vs ${midRisk}`);
});

test('Y100: riskBreakdown returns explanation for UI', () => {
  const sys = makeSystem();
  sys.registerSignal({ customerId: 'CUS-RB', type: 'health-score-drop', timestamp: daysAgo(1) });
  sys.registerSignal({ customerId: 'CUS-RB', type: 'nps-detractor', timestamp: daysAgo(2) });
  const br = sys.riskBreakdown('CUS-RB');
  assert.equal(br.customer_id, 'CUS-RB');
  assert.equal(br.signal_count, 2);
  assert.equal(br.severities.high, 1);
  assert.equal(br.severities.medium, 1);
  assert.ok(br.score > 0);
  assert.ok(Array.isArray(br.top_signals));
});

// ─── tests: triggerPlaybook & executeStep ──────────────────────────────────

test('Y100: triggerPlaybook fires matching playbook and returns an execution', () => {
  const sys = makeSystem();
  const exe = sys.triggerPlaybook('CUS-T1', 'health-score-drop');
  assert.ok(exe);
  assert.match(exe.id, /^EXE-\d{6}$/);
  assert.equal(exe.customer_id, 'CUS-T1');
  assert.equal(exe.trigger, 'health-score-drop');
  assert.equal(exe.status, 'open');
  assert.ok(exe.steps_total > 0);
  assert.equal(exe.steps_completed, 0);
  assert.ok(exe.playbook_label_he.length > 0);
  assert.ok(exe.playbook_label_en.length > 0);
});

test('Y100: triggerPlaybook — unknown trigger returns null', () => {
  const sys = makeSystem();
  const exe = sys.triggerPlaybook('CUS-T2', 'nonexistent-trigger');
  assert.equal(exe, null);
});

test('Y100: triggerPlaybook — does not duplicate open executions for same customer', () => {
  const sys = makeSystem();
  const a = sys.triggerPlaybook('CUS-T3', 'payment-late');
  const b = sys.triggerPlaybook('CUS-T3', 'payment-late');
  assert.equal(a.id, b.id);
});

test('Y100: executeStep appends to step log and bumps completed counter on done', () => {
  const sys = makeSystem();
  const exe = sys.triggerPlaybook('CUS-STP', 'usage-decline');
  const step1 = sys.executeStep({
    playbookExecutionId: exe.id,
    stepId: 'ud1',
    outcome: 'done',
    notes: 'trained 8 users',
    by: 'csm.bob',
  });
  assert.match(step1.id, /^STP-\d{6}$/);
  assert.equal(step1.outcome, 'done');
  assert.equal(step1.by, 'csm.bob');

  // Skipped step should NOT bump counter
  sys.executeStep({
    playbookExecutionId: exe.id,
    stepId: 'ud2',
    outcome: 'skipped',
    by: 'csm.bob',
  });
  const logs = sys.listStepLogs(exe.id);
  assert.equal(logs.length, 2);
  const fresh = sys.listExecutions('CUS-STP')[0];
  assert.equal(fresh.steps_completed, 1);
});

test('Y100: executeStep — unknown execution throws', () => {
  const sys = makeSystem();
  assert.throws(
    () => sys.executeStep({ playbookExecutionId: 'EXE-999999', stepId: 'x' }),
    /unknown execution/
  );
});

// ─── tests: saveOffer ──────────────────────────────────────────────────────

test('Y100: saveOffer records a retention offer with kind validation', () => {
  const sys = makeSystem();
  const ofr = sys.saveOffer({
    customerId: 'CUS-O1',
    offer: { kind: 'discount', value: 20, label_he: 'הנחה 20%', label_en: '20% discount' },
    expiresAt: '2026-05-11T00:00:00Z',
    approvedBy: 'cfo@tk-uzi.co.il',
  });
  assert.match(ofr.id, /^OFR-\d{6}$/);
  assert.equal(ofr.kind, 'discount');
  assert.equal(ofr.value, 20);
  assert.equal(ofr.approved_by, 'cfo@tk-uzi.co.il');
  assert.ok(ofr.expires_at);
  assert.equal(ofr.status, 'offered');
});

test('Y100: saveOffer — all four offer kinds accepted', () => {
  const sys = makeSystem();
  for (const kind of OFFER_KINDS) {
    const ofr = sys.saveOffer({
      customerId: `CUS-K-${kind}`,
      offer: { kind, value: 1 },
      approvedBy: 'exec',
    });
    assert.equal(ofr.kind, kind);
  }
  assert.equal(sys.listOffers().length, OFFER_KINDS.length);
});

test('Y100: saveOffer — invalid kind throws', () => {
  const sys = makeSystem();
  assert.throws(
    () => sys.saveOffer({ customerId: 'C', offer: { kind: 'bribery', value: 1 }, approvedBy: 'x' }),
    TypeError
  );
});

// ─── tests: recordSave vs recordLoss ──────────────────────────────────────

test('Y100: recordSave stores successful retention and listSaves returns it', () => {
  const sys = makeSystem();
  const s = sys.recordSave({
    customerId: 'CUS-SV',
    method: 'discount-20',
    notes: 'Accepted 20% renewal discount',
    outcome: 'saved',
    revenueSaved: 35000,
  });
  assert.match(s.id, /^SAV-\d{6}$/);
  assert.equal(s.method, 'discount-20');
  assert.equal(s.revenue_saved_ils, 35000);
  assert.equal(sys.listSaves().length, 1);
});

test('Y100: recordLoss stores failed retention with competitor and value', () => {
  const sys = makeSystem();
  const l = sys.recordLoss({
    customerId: 'CUS-LS',
    reason: 'price',
    competitor: 'RivalCorp',
    totalValueLost: 80000,
  });
  assert.match(l.id, /^LOS-\d{6}$/);
  assert.equal(l.reason, 'price');
  assert.equal(l.competitor, 'RivalCorp');
  assert.equal(l.total_value_lost_ils, 80000);
});

test('Y100: recordSave & recordLoss — missing customerId throws', () => {
  const sys = makeSystem();
  assert.throws(() => sys.recordSave({ method: 'x' }), TypeError);
  assert.throws(() => sys.recordLoss({ reason: 'y' }), TypeError);
});

// ─── tests: exitInterview ──────────────────────────────────────────────────

test('Y100: exitInterview captures structured feedback with bilingual questions', () => {
  const sys = makeSystem();
  const ei = sys.exitInterview({
    customerId: 'CUS-EI',
    feedback: 'Too expensive vs alternatives',
    rating: 2,
    wouldReturn: true,
  });
  assert.match(ei.id, /^EXI-\d{6}$/);
  assert.equal(ei.customer_id, 'CUS-EI');
  assert.equal(ei.rating, 2);
  assert.equal(ei.would_return, true);
  assert.ok(ei.questions.length >= 6);
  for (const q of ei.questions) {
    assert.ok(q.he && q.en && q.key);
  }
});

test('Y100: exitInterview — rating clamped to 0..5', () => {
  const sys = makeSystem();
  const a = sys.exitInterview({ customerId: 'C1', rating: 999 });
  const b = sys.exitInterview({ customerId: 'C2', rating: -5 });
  assert.equal(a.rating, 5);
  assert.equal(b.rating, 0);
});

// ─── tests: winBackCampaign ────────────────────────────────────────────────

test('Y100: winBackCampaign creates a re-engagement campaign record', () => {
  const sys = makeSystem();
  const wb = sys.winBackCampaign({
    segmentId: 'SEG-CHURNED-2025',
    touchpoints: ['email-1', 'email-2', 'phone-call', 'gift-voucher'],
    duration: 45,
  });
  assert.match(wb.id, /^WBC-\d{6}$/);
  assert.equal(wb.segment_id, 'SEG-CHURNED-2025');
  assert.equal(wb.touchpoints.length, 4);
  assert.equal(wb.duration_days, 45);
  assert.equal(wb.status, 'active');
  assert.ok(wb.message_he.indexOf('התגעגענו') !== -1);
  assert.ok(wb.message_en.indexOf('missed') !== -1);
});

// ─── tests: retentionMetrics ──────────────────────────────────────────────

test('Y100: retentionMetrics — save rate, ROI, and top loss reasons', () => {
  const sys = makeSystem();
  // Two wins, one loss, one execution (for cost)
  sys.triggerPlaybook('CUS-M1', 'health-score-drop'); // cost via severity=high=4500
  sys.recordSave({ customerId: 'CUS-M1', method: 'executive-call', outcome: 'saved', revenueSaved: 60000 });
  sys.recordSave({ customerId: 'CUS-M2', method: 'discount-15', outcome: 'saved', revenueSaved: 20000 });
  sys.recordLoss({ customerId: 'CUS-M3', reason: 'price', competitor: 'X', totalValueLost: 45000 });

  const m = sys.retentionMetrics({});
  assert.equal(m.total_attempts, 3);
  assert.equal(m.saves, 2);
  assert.equal(m.losses, 1);
  assert.equal(m.save_rate_pct, round2((2 / 3) * 100));
  assert.equal(m.revenue_saved_ils, 80000);
  assert.equal(m.revenue_lost_ils, 45000);
  assert.equal(m.executions_opened, 1);
  assert.equal(m.cost_ils, INTERVENTION_COST_ILS.high);
  assert.equal(m.net_ils, 80000 - INTERVENTION_COST_ILS.high);
  assert.ok(m.top_loss_reasons.length === 1);
  assert.equal(m.top_loss_reasons[0].reason, 'price');
  // Bilingual labels for metrics
  assert.equal(m.labels.he.save_rate, 'אחוז הצלה');
  assert.equal(m.labels.en.save_rate, 'Save Rate');
});

test('Y100: retentionMetrics — empty ledger returns 0% save rate and 0 ROI', () => {
  const sys = makeSystem();
  const m = sys.retentionMetrics({});
  assert.equal(m.save_rate_pct, 0);
  assert.equal(m.roi_pct, 0);
  assert.equal(m.total_attempts, 0);
});

// ─── tests: closeLoop ──────────────────────────────────────────────────────

test('Y100: closeLoop writes status and preserves history (never deletes)', () => {
  const sys = makeSystem();
  const a = sys.closeLoop('CUS-CL', 'pending');
  const b = sys.closeLoop('CUS-CL', 'saved');
  assert.equal(a.status, 'pending');
  assert.equal(b.status, 'saved');
  // Both records are preserved in history
  const history = sys.loopHistory('CUS-CL');
  assert.equal(history.length, 2);
  // customerStatus returns the LATEST
  const latest = sys.customerStatus('CUS-CL');
  assert.equal(latest.status, 'saved');
});

test('Y100: closeLoop — saved outcome also closes any open execution for customer', () => {
  const sys = makeSystem();
  const exe = sys.triggerPlaybook('CUS-CL2', 'usage-decline');
  assert.equal(exe.status, 'open');
  sys.closeLoop('CUS-CL2', 'saved');
  const fresh = sys.listExecutions('CUS-CL2')[0];
  assert.equal(fresh.status, 'closed');
  assert.equal(fresh.outcome, 'saved');
});

test('Y100: closeLoop — invalid status throws, valid states enumerated', () => {
  const sys = makeSystem();
  assert.throws(() => sys.closeLoop('C', 'maybe'), TypeError);
  assert.deepEqual(LOOP_STATES.slice().sort(), ['churned', 'pending', 'saved']);
});

test('Y100: customerStatus returns pending for unknown customer', () => {
  const sys = makeSystem();
  const s = sys.customerStatus('CUS-UNKNOWN');
  assert.equal(s.status, 'pending');
  assert.equal(s.customer_id, 'CUS-UNKNOWN');
});

// ─── tests: full scenario — signal → risk → playbook → save → close ───────

test('Y100: end-to-end — signal drives risk, playbook fires, save closes loop', () => {
  const sys = makeSystem();

  // 1. signals flow in
  sys.registerSignal({ customerId: 'CUS-E2E', type: 'health-score-drop', value: 30, timestamp: daysAgo(3) });
  sys.registerSignal({ customerId: 'CUS-E2E', type: 'payment-late',      value: 45, timestamp: daysAgo(2) });

  // 2. risk is measurable
  const risk = sys.churnRisk('CUS-E2E');
  assert.ok(risk > 0);

  // 3. playbook fires
  const exe = sys.triggerPlaybook('CUS-E2E', 'payment-late');
  assert.ok(exe);

  // 4. steps executed
  sys.executeStep({ playbookExecutionId: exe.id, stepId: 'pl1', outcome: 'done', by: 'fin.carol' });
  sys.executeStep({ playbookExecutionId: exe.id, stepId: 'pl2', outcome: 'done', by: 'fin.carol' });

  // 5. save offer made
  const ofr = sys.saveOffer({
    customerId: 'CUS-E2E',
    offer: { kind: 'free-period', value: 30 },
    approvedBy: 'cfo',
  });
  assert.equal(ofr.kind, 'free-period');

  // 6. save recorded
  sys.recordSave({
    customerId: 'CUS-E2E',
    method: 'free-period-30d',
    outcome: 'saved',
    revenueSaved: 28000,
  });

  // 7. loop closed
  const loop = sys.closeLoop('CUS-E2E', 'saved');
  assert.equal(loop.status, 'saved');

  // 8. metrics reflect the win
  const m = sys.retentionMetrics({});
  assert.ok(m.saves >= 1);
  assert.ok(m.revenue_saved_ils >= 28000);
});

test('Y100: scoreToLevel helper maps score ranges to level names', () => {
  assert.equal(scoreToLevel(0), 'none');
  assert.equal(scoreToLevel(10), 'low');
  assert.equal(scoreToLevel(40), 'medium');
  assert.equal(scoreToLevel(70), 'high');
  assert.equal(scoreToLevel(95), 'critical');
});
