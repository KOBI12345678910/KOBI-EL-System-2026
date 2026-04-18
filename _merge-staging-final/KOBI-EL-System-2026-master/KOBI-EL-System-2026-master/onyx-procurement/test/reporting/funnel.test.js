/**
 * Tests for FunnelAnalyzer — Agent Y-191
 * =======================================
 * Runner: node --test (built-in)
 * Asserts: node:assert/strict
 *
 * Zero runtime dependencies.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  FunnelAnalyzer,
  DEFAULT_STEPS,
  DEFAULT_DROP_REASONS,
  toMillis,
  formatDuration,
  round,
} = require('../../src/reporting/funnel');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-01-01T00:00:00Z');

/**
 * Build a sample dataset of 10 entities moving through the default
 * 5-stage funnel with different drop-off points.
 */
function sampleEvents() {
  // All 10 start as leads.
  const events = [];
  for (let i = 1; i <= 10; i += 1) {
    events.push({
      entity_id: `e${i}`,
      stage: 'lead',
      timestamp: new Date(T0 + i * 1000).toISOString(),
    });
  }
  // 8 / 10 become MQL (2 drop: budget, no_response)
  for (let i = 1; i <= 8; i += 1) {
    events.push({
      entity_id: `e${i}`,
      stage: 'mql',
      timestamp: new Date(T0 + 2 * DAY + i * 1000).toISOString(),
    });
  }
  events.push({ entity_id: 'e9',  stage: 'lead', timestamp: new Date(T0 + 3 * DAY).toISOString(), drop_reason: 'budget' });
  events.push({ entity_id: 'e10', stage: 'lead', timestamp: new Date(T0 + 3 * DAY).toISOString(), drop_reason: 'no_response' });

  // 5 / 8 become SQL (3 drop: 2 timing, 1 no_fit)
  for (let i = 1; i <= 5; i += 1) {
    events.push({
      entity_id: `e${i}`,
      stage: 'sql',
      timestamp: new Date(T0 + 5 * DAY + i * 1000).toISOString(),
    });
  }
  events.push({ entity_id: 'e6', stage: 'mql', timestamp: new Date(T0 + 6 * DAY).toISOString(), drop_reason: 'timing' });
  events.push({ entity_id: 'e7', stage: 'mql', timestamp: new Date(T0 + 6 * DAY).toISOString(), drop_reason: 'timing' });
  events.push({ entity_id: 'e8', stage: 'mql', timestamp: new Date(T0 + 6 * DAY).toISOString(), drop_reason: 'no_fit' });

  // 3 / 5 become opportunity (2 drop: 1 competitor, 1 price)
  for (let i = 1; i <= 3; i += 1) {
    events.push({
      entity_id: `e${i}`,
      stage: 'opportunity',
      timestamp: new Date(T0 + 10 * DAY + i * 1000).toISOString(),
    });
  }
  events.push({ entity_id: 'e4', stage: 'sql', timestamp: new Date(T0 + 11 * DAY).toISOString(), drop_reason: 'competitor' });
  events.push({ entity_id: 'e5', stage: 'sql', timestamp: new Date(T0 + 11 * DAY).toISOString(), drop_reason: 'price' });

  // 2 / 3 won (1 drop: other)
  for (let i = 1; i <= 2; i += 1) {
    events.push({
      entity_id: `e${i}`,
      stage: 'won',
      timestamp: new Date(T0 + 20 * DAY + i * 1000).toISOString(),
    });
  }
  events.push({ entity_id: 'e3', stage: 'opportunity', timestamp: new Date(T0 + 21 * DAY).toISOString(), drop_reason: 'other' });

  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('01 — FunnelAnalyzer constructs with default 5-stage funnel', () => {
  const fa = new FunnelAnalyzer();
  const steps = fa.getSteps();
  assert.equal(steps.length, 5);
  assert.deepEqual(
    steps.map((s) => s.key),
    ['lead', 'mql', 'sql', 'opportunity', 'won']
  );
  assert.equal(steps[0].labelHe, 'ליד');
  assert.equal(steps[4].labelHe, 'חתום');
  assert.equal(steps[0].labelEn, 'Lead');
  assert.equal(steps[4].labelEn, 'Won / Closed');
});

test('02 — defineSteps rejects fewer than 2 steps', () => {
  const fa = new FunnelAnalyzer();
  assert.throws(() => fa.defineSteps([{ key: 'only' }]), /at least 2 steps/);
  assert.throws(() => fa.defineSteps([]),                  /at least 2 steps/);
  assert.throws(() => fa.defineSteps(null),                /at least 2 steps/);
});

test('03 — defineSteps rejects duplicate keys and missing key', () => {
  const fa = new FunnelAnalyzer();
  assert.throws(
    () => fa.defineSteps([{ key: 'a' }, { key: 'a' }]),
    /duplicate step key/
  );
  assert.throws(
    () => fa.defineSteps([{ key: 'a' }, { labelEn: 'no key' }]),
    /missing "key"/
  );
});

test('04 — custom funnel definition (procurement: RFQ -> PO -> invoice -> paid)', () => {
  const fa = new FunnelAnalyzer({
    steps: [
      { key: 'rfq',     labelHe: 'בקשת הצעה', labelEn: 'RFQ' },
      { key: 'po',      labelHe: 'הזמנה',      labelEn: 'Purchase Order' },
      { key: 'invoice', labelHe: 'חשבונית',    labelEn: 'Invoice' },
      { key: 'paid',    labelHe: 'שולם',       labelEn: 'Paid' },
    ],
  });
  assert.equal(fa.getSteps().length, 4);
  assert.equal(fa.getSteps()[0].labelHe, 'בקשת הצעה');
  assert.equal(fa.getSteps()[3].labelEn, 'Paid');
});

test('05 — addEvent and addEvents store events (and addEvents rejects non-array)', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvent({ entity_id: 'e1', stage: 'lead', timestamp: '2026-01-01T00:00:00Z' });
  fa.addEvents([
    { entity_id: 'e2', stage: 'lead', timestamp: '2026-01-02T00:00:00Z' },
    { entity_id: 'e3', stage: 'mql',  timestamp: '2026-01-03T00:00:00Z' },
  ]);
  assert.equal(fa.eventCount(), 3);
  assert.throws(() => fa.addEvents('not-an-array'), /expected an array/);
  assert.throws(() => fa.addEvent(null),             /non-null object/);
});

test('06 — assignEventsToSteps groups events and ignores unknown stages', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents([
    { entity_id: 'e1', stage: 'lead',    timestamp: T0 },
    { entity_id: 'e2', stage: 'mql',     timestamp: T0 + 1000 },
    { entity_id: 'e3', stage: 'unknown', timestamp: T0 + 2000 }, // ignored
  ]);
  const buckets = fa.assignEventsToSteps();
  assert.equal(buckets.lead.length, 1);
  assert.equal(buckets.mql.length, 1);
  assert.equal(buckets.sql.length, 0);
  assert.equal(buckets.opportunity.length, 0);
  assert.equal(buckets.won.length, 0);
  // unknown stage does not appear as a key
  assert.equal(Object.prototype.hasOwnProperty.call(buckets, 'unknown'), false);
});

test('07 — computeStepCounts produces correct funnel counts', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const counts = fa.computeStepCounts();
  assert.equal(counts.lead,        10);
  assert.equal(counts.mql,          8);
  assert.equal(counts.sql,          5);
  assert.equal(counts.opportunity,  3);
  assert.equal(counts.won,          2);
});

test('08 — computeStepCounts dedupes repeated events for the same entity', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents([
    { entity_id: 'e1', stage: 'lead', timestamp: T0 },
    { entity_id: 'e1', stage: 'lead', timestamp: T0 + 1000 }, // duplicate
    { entity_id: 'e2', stage: 'lead', timestamp: T0 + 2000 },
  ]);
  const counts = fa.computeStepCounts();
  assert.equal(counts.lead, 2); // deduped by entity_id
});

test('09 — convRate computes step_i -> step_i+1 correctly', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  assert.equal(fa.convRate('lead', 'mql'),         round(8 / 10, 6));
  assert.equal(fa.convRate('mql', 'sql'),          round(5 / 8, 6));
  assert.equal(fa.convRate('sql', 'opportunity'),  round(3 / 5, 6));
  assert.equal(fa.convRate('opportunity', 'won'),  round(2 / 3, 6));
});

test('10 — convRate throws on unknown step key', () => {
  const fa = new FunnelAnalyzer();
  assert.throws(() => fa.convRate('bogus', 'mql'), /unknown step/);
  assert.throws(() => fa.convRate('lead',  'bogus'), /unknown step/);
});

test('11 — convRate handles zero-source gracefully (returns 0)', () => {
  const fa = new FunnelAnalyzer();
  // no events at all
  assert.equal(fa.convRate('lead', 'mql'), 0);
});

test('12 — allConvRates returns bilingual labels for every adjacent pair', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const all = fa.allConvRates();
  assert.equal(all.length, 4); // 5 steps -> 4 transitions
  assert.equal(all[0].fromKey, 'lead');
  assert.equal(all[0].toKey,   'mql');
  assert.equal(all[0].fromLabelHe, 'ליד');
  assert.equal(all[0].toLabelHe,   'ליד מוסמך שיווקית');
  assert.equal(all[0].fromCount, 10);
  assert.equal(all[0].toCount,   8);
  assert.equal(all[0].rate,      round(8 / 10, 6));
  // last transition
  assert.equal(all[3].fromKey, 'opportunity');
  assert.equal(all[3].toKey,   'won');
  assert.equal(all[3].fromLabelHe, 'הזדמנות');
  assert.equal(all[3].toLabelHe,   'חתום');
});

test('13 — overallConversion is first->last independent of intermediate', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  // 2 won / 10 leads = 0.2
  assert.equal(fa.overallConversion(), round(2 / 10, 6));
});

test('14 — avgTimeInStage computes per-entity average correctly', () => {
  const fa = new FunnelAnalyzer();
  // Two entities, one spends 1 day in lead, the other 3 days.
  // Expected average = 2 days in ms.
  fa.addEvents([
    { entity_id: 'a', stage: 'lead', timestamp: T0 },
    { entity_id: 'a', stage: 'mql',  timestamp: T0 + 1 * DAY },
    { entity_id: 'b', stage: 'lead', timestamp: T0 },
    { entity_id: 'b', stage: 'mql',  timestamp: T0 + 3 * DAY },
  ]);
  const avg = fa.avgTimeInStage('lead');
  assert.equal(avg, 2 * DAY);
});

test('15 — avgTimeInStage returns null for terminal step and for empty data', () => {
  const fa = new FunnelAnalyzer();
  assert.equal(fa.avgTimeInStage('won'), null);
  // Terminal stage always null
  fa.addEvents([{ entity_id: 'x', stage: 'lead', timestamp: T0 }]);
  assert.equal(fa.avgTimeInStage('lead'), null); // no one advanced to MQL
  assert.throws(() => fa.avgTimeInStage('bogus'), /unknown step/);
});

test('16 — allAvgTimeInStage reports every stage including null for terminal', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const tim = fa.allAvgTimeInStage();
  // sample data: all 8 who advanced spent exactly 2 days in lead (T0+Nsec -> T0+2d+Nsec)
  // but the avg is computed per-entity, so each contributes exactly 2 days.
  assert.equal(tim.lead,        2 * DAY);
  assert.equal(tim.mql,         3 * DAY); // T0+2d -> T0+5d
  assert.equal(tim.sql,         5 * DAY); // T0+5d -> T0+10d
  assert.equal(tim.opportunity, 10 * DAY); // T0+10d -> T0+20d
  assert.equal(tim.won,         null);
});

test('17 — dropOffByReason tallies raw drop reasons', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const tally = fa.dropOffByReason();
  assert.equal(tally.budget,      1);
  assert.equal(tally.no_response, 1);
  assert.equal(tally.timing,      2);
  assert.equal(tally.no_fit,      1);
  assert.equal(tally.competitor,  1);
  assert.equal(tally.price,       1);
  assert.equal(tally.other,       1);
});

test('18 — dropOffByReasonBilingual sorts by desc count and ships HE+EN', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const list = fa.dropOffByReasonBilingual();
  assert.equal(list[0].key,   'timing');
  assert.equal(list[0].count, 2);
  assert.equal(list[0].he,    'תזמון לא מתאים');
  assert.equal(list[0].en,    'Bad timing');
  // Total drop-offs = 8; timing = 2 -> pct = 0.25
  assert.equal(list[0].pct, round(2 / 8, 6));
});

test('19 — custom dropReasons dictionary overrides defaults', () => {
  const fa = new FunnelAnalyzer({
    dropReasons: { custom_reason: { he: 'סיבה מיוחדת', en: 'Custom reason' } },
  });
  fa.addEvents([
    { entity_id: 'e1', stage: 'lead', timestamp: T0, drop_reason: 'custom_reason' },
  ]);
  const list = fa.dropOffByReasonBilingual();
  assert.equal(list.length, 1);
  assert.equal(list[0].he, 'סיבה מיוחדת');
  assert.equal(list[0].en, 'Custom reason');
});

test('20 — analyze() returns a self-contained snapshot', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const snap = fa.analyze();
  assert.ok(Array.isArray(snap.steps) && snap.steps.length === 5);
  assert.equal(snap.counts.lead, 10);
  assert.equal(snap.counts.won,  2);
  assert.equal(snap.conv.length, 4);
  assert.equal(snap.overall,     round(2 / 10, 6));
  assert.equal(snap.avgTime.won, null);
  assert.ok(Array.isArray(snap.dropOff));
  assert.ok(snap.totalEvents > 0);
});

test('21 — renderReport(both) contains Hebrew and English headers', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const out = fa.renderReport('both');
  assert.ok(out.includes('דו"ח ניתוח משפך'));
  assert.ok(out.includes('Funnel Analysis Report'));
  assert.ok(out.includes('ליד'));
  assert.ok(out.includes('Lead'));
  assert.ok(out.includes('חתום'));
  assert.ok(out.includes('Won / Closed'));
  // Overall 20%
  assert.ok(out.includes('20%'));
});

test('22 — renderReport(he) and renderReport(en) are language-pure', () => {
  const fa = new FunnelAnalyzer();
  fa.addEvents(sampleEvents());
  const he = fa.renderReport('he');
  assert.ok(he.includes('דו"ח ניתוח משפך'));
  assert.ok(!he.includes('Funnel Analysis Report'));
  const en = fa.renderReport('en');
  assert.ok(en.includes('Funnel Analysis Report'));
  assert.ok(!en.includes('דו"ח ניתוח משפך'));
});

test('23 — toMillis handles strings, numbers, Date, and nulls', () => {
  assert.equal(toMillis(null),      null);
  assert.equal(toMillis(undefined), null);
  assert.equal(toMillis('not-a-date'), null);
  assert.equal(toMillis(T0),  T0);
  assert.equal(toMillis(new Date(T0)), T0);
  assert.equal(toMillis('2026-01-01T00:00:00Z'), T0);
});

test('24 — formatDuration formats bilingual durations', () => {
  const ms = 2 * DAY + 3 * 3600 * 1000 + 15 * 60 * 1000;
  assert.equal(formatDuration(ms, 'en'), '2d 3h 15m');
  assert.equal(formatDuration(ms, 'he'), '2 ימים 3 שעות 15 דקות');
  assert.equal(formatDuration(null, 'en'), 'n/a');
  assert.equal(formatDuration(null, 'he'), 'אין נתונים');
});

test('25 — analyzer is deterministic across repeated runs', () => {
  const fa1 = new FunnelAnalyzer();
  const fa2 = new FunnelAnalyzer();
  const data = sampleEvents();
  fa1.addEvents(data);
  fa2.addEvents(data);
  assert.deepEqual(fa1.analyze(), fa2.analyze());
  assert.equal(fa1.renderReport('both'), fa2.renderReport('both'));
});

test('26 — adding events does not mutate caller payload', () => {
  const original = [
    { entity_id: 'z1', stage: 'lead', timestamp: T0, drop_reason: 'budget' },
  ];
  const snapshot = JSON.parse(JSON.stringify(original));
  const fa = new FunnelAnalyzer();
  fa.addEvents(original);
  fa.computeStepCounts();
  fa.analyze();
  assert.deepEqual(original, snapshot);
});

test('27 — custom 3-stage funnel with custom drop reasons works end-to-end', () => {
  const fa = new FunnelAnalyzer({
    steps: [
      { key: 'signup',   labelHe: 'הרשמה',  labelEn: 'Sign-up' },
      { key: 'trial',    labelHe: 'ניסיון', labelEn: 'Trial' },
      { key: 'paid',     labelHe: 'משלם',   labelEn: 'Paid' },
    ],
    dropReasons: {
      price_shock:  { he: 'הלם מחיר',    en: 'Price shock' },
      feature_gap:  { he: 'חסר פיצ\'ר', en: 'Feature gap' },
    },
  });
  fa.addEvents([
    { entity_id: 's1', stage: 'signup', timestamp: T0 },
    { entity_id: 's1', stage: 'trial',  timestamp: T0 + 1 * DAY },
    { entity_id: 's1', stage: 'paid',   timestamp: T0 + 2 * DAY },
    { entity_id: 's2', stage: 'signup', timestamp: T0, drop_reason: 'price_shock' },
    { entity_id: 's3', stage: 'signup', timestamp: T0 },
    { entity_id: 's3', stage: 'trial',  timestamp: T0 + 1 * DAY, drop_reason: 'feature_gap' },
  ]);
  const a = fa.analyze();
  assert.equal(a.counts.signup, 3);
  assert.equal(a.counts.trial,  2);
  assert.equal(a.counts.paid,   1);
  assert.equal(a.overall, round(1 / 3, 6));
  assert.equal(a.dropOff.length, 2);
  // Both reasons present bilingually
  const haveHe = a.dropOff.some((d) => d.he === 'הלם מחיר');
  const haveEn = a.dropOff.some((d) => d.en === 'Feature gap');
  assert.ok(haveHe);
  assert.ok(haveEn);
});

test('28 — avgTimeInStage ignores out-of-order events gracefully', () => {
  const fa = new FunnelAnalyzer();
  // Entity "y" has a nonsense trail: reached mql BEFORE its lead event
  fa.addEvents([
    { entity_id: 'x', stage: 'lead', timestamp: T0 },
    { entity_id: 'x', stage: 'mql',  timestamp: T0 + 1 * DAY },
    { entity_id: 'y', stage: 'mql',  timestamp: T0 },       // broken ordering
    { entity_id: 'y', stage: 'lead', timestamp: T0 + 2 * DAY },
  ]);
  // Only x's 1-day transition contributes.
  assert.equal(fa.avgTimeInStage('lead'), 1 * DAY);
});

test('29 — DEFAULT_STEPS and DEFAULT_DROP_REASONS are frozen', () => {
  assert.equal(Object.isFrozen(DEFAULT_STEPS), true);
  assert.equal(Object.isFrozen(DEFAULT_DROP_REASONS), true);
  assert.throws(() => { DEFAULT_STEPS.push({ key: 'hack' }); });
});

test('30 — round() helper is stable and handles non-finite input', () => {
  assert.equal(round(0.123456789, 3), 0.123);
  assert.equal(round(1 / 3, 6),       0.333333);
  assert.equal(Number.isNaN(round(NaN, 2)), true);
  assert.equal(round(Infinity, 2),    Infinity);
});
