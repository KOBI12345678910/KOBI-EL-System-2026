/**
 * Tests for src/customer/csat.js — CSATTracker
 * Agent Y-093 / Techno-Kol Uzi mega-ERP 2026
 *
 * Run:
 *   cd onyx-procurement
 *   node --test test/customer/csat.test.js
 *
 * Zero third-party deps. Pure node:test + node:assert.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  CSATTracker,
  EVENTS,
  FORMATS,
  EVENT_TICKET_CLOSED,
  EVENT_ORDER_DELIVERED,
  EVENT_PROJECT_COMPLETED,
  EVENT_INSTALL_COMPLETED,
  FORMAT_FIVE_STAR,
  FORMAT_ONE_TO_FIVE,
  FORMAT_THUMBS,
  FORMAT_EMOJI,
  FORMAT_DETAILED_MATRIX,
  BAND_POOR,
  BAND_FAIR,
  BAND_GOOD,
  BAND_EXCELLENT,
  bandFromCSAT,
  pearson,
  tokenize,
} = require('../../src/customer/csat.js');

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function respond(tracker, overrides = {}) {
  const base = {
    surveyId: overrides.surveyId || 'SRV-fixed',
    customerId: overrides.customerId || 'cust-1',
    rating: 5,
    feedback: '',
    submittedAt: '2026-04-01T10:00:00.000Z',
  };
  return tracker.recordResponse({ ...base, ...overrides });
}

/* ------------------------------------------------------------------ */
/* Constructor / defaults                                               */
/* ------------------------------------------------------------------ */

test('constructor — default thresholds for 1-5 scale', () => {
  const t = new CSATTracker();
  assert.equal(t.maxRating, 5);
  assert.equal(t.satisfactionThreshold, 4);
  assert.equal(t.dissatisfactionThreshold, 2);
});

test('constructor — honors custom thresholds', () => {
  const t = new CSATTracker({
    maxRating: 10,
    satisfactionThreshold: 8,
    dissatisfactionThreshold: 3,
  });
  assert.equal(t.maxRating, 10);
  assert.equal(t.satisfactionThreshold, 8);
  assert.equal(t.dissatisfactionThreshold, 3);
});

test('constructor — rejects maxRating < 2', () => {
  assert.throws(() => new CSATTracker({ maxRating: 1 }), /maxRating/);
});

/* ------------------------------------------------------------------ */
/* triggerSurvey                                                        */
/* ------------------------------------------------------------------ */

test('triggerSurvey — all 4 events produce a survey with id + questions', () => {
  const t = new CSATTracker();
  for (const ev of EVENTS) {
    const s = t.triggerSurvey({ event: ev, customerId: 'c-1', triggerData: { ref: 1 } });
    assert.ok(s.surveyId, `event ${ev} must produce a surveyId`);
    assert.equal(s.event, ev);
    assert.equal(s.customerId, 'c-1');
    assert.ok(Array.isArray(s.questions));
    assert.ok(s.questions.length >= 1);
    assert.ok(s.questions[0].text.he);
    assert.ok(s.questions[0].text.en);
    assert.ok(s.sentAt);
  }
});

test('triggerSurvey — default format per event matches spec', () => {
  const t = new CSATTracker();
  const ticket = t.triggerSurvey({ event: EVENT_TICKET_CLOSED, customerId: 'c' });
  assert.equal(ticket.format.type, FORMAT_EMOJI);
  const order = t.triggerSurvey({ event: EVENT_ORDER_DELIVERED, customerId: 'c' });
  assert.equal(order.format.type, FORMAT_FIVE_STAR);
  const project = t.triggerSurvey({ event: EVENT_PROJECT_COMPLETED, customerId: 'c' });
  assert.equal(project.format.type, FORMAT_DETAILED_MATRIX);
  const install = t.triggerSurvey({ event: EVENT_INSTALL_COMPLETED, customerId: 'c' });
  assert.equal(install.format.type, FORMAT_DETAILED_MATRIX);
});

test('triggerSurvey — unknown event throws', () => {
  const t = new CSATTracker();
  assert.throws(
    () => t.triggerSurvey({ event: 'foo', customerId: 'c' }),
    /Unknown event/
  );
});

test('triggerSurvey — missing customerId throws', () => {
  const t = new CSATTracker();
  assert.throws(
    () => t.triggerSurvey({ event: EVENT_TICKET_CLOSED }),
    /customerId/
  );
});

test('triggerSurvey — trigger data is copied, not aliased', () => {
  const t = new CSATTracker();
  const src = { ticketId: 'T-1' };
  const s = t.triggerSurvey({ event: EVENT_TICKET_CLOSED, customerId: 'c', triggerData: src });
  src.ticketId = 'MUTATED';
  assert.equal(s.triggerData.ticketId, 'T-1');
});

/* ------------------------------------------------------------------ */
/* surveyFormat                                                         */
/* ------------------------------------------------------------------ */

test('surveyFormat — every format returns scale 1..5', () => {
  const t = new CSATTracker();
  for (const f of FORMATS) {
    const out = t.surveyFormat({ type: f });
    assert.equal(out.type, f);
    assert.deepEqual(out.scale, { min: 1, max: 5 });
  }
});

test('surveyFormat — thumbs has only 2 values', () => {
  const t = new CSATTracker();
  const thumbs = t.surveyFormat({ type: FORMAT_THUMBS });
  assert.deepEqual(thumbs.values, [1, 5]);
});

test('surveyFormat — detailed matrix signals hasAspects', () => {
  const t = new CSATTracker();
  const matrix = t.surveyFormat({ type: FORMAT_DETAILED_MATRIX });
  assert.equal(matrix.hasAspects, true);
});

test('surveyFormat — unknown type throws', () => {
  const t = new CSATTracker();
  assert.throws(() => t.surveyFormat({ type: 'foo' }), /Unknown survey format/);
});

/* ------------------------------------------------------------------ */
/* recordResponse                                                       */
/* ------------------------------------------------------------------ */

test('recordResponse — rating is clamped + rounded to int', () => {
  const t = new CSATTracker();
  const r = respond(t, { rating: 4.6 });
  assert.equal(r.rating, 5);
});

test('recordResponse — rejects out-of-range ratings', () => {
  const t = new CSATTracker();
  assert.throws(() => respond(t, { rating: 0 }), /rating/);
  assert.throws(() => respond(t, { rating: 6 }), /rating/);
  assert.throws(() => respond(t, { rating: NaN }), /rating/);
});

test('recordResponse — missing surveyId/customerId throws', () => {
  const t = new CSATTracker();
  assert.throws(() => t.recordResponse({ customerId: 'c', rating: 5 }), /surveyId/);
  assert.throws(() => t.recordResponse({ surveyId: 's', rating: 5 }), /customerId/);
});

test('recordResponse — specificAspects as map and array both work', () => {
  const t = new CSATTracker();
  const asMap = respond(t, {
    surveyId: 'SRV-A',
    specificAspects: { 'on-time': 5, 'packaging': 3, 'bad': 99 },
  });
  assert.equal(asMap.specificAspects['on-time'], 5);
  assert.equal(asMap.specificAspects.packaging, 3);
  assert.equal(asMap.specificAspects.bad, undefined);

  const asArray = respond(t, {
    surveyId: 'SRV-B',
    specificAspects: [
      { aspect: 'quality', rating: 4 },
      { aspect: 'safety',  rating: 5 },
      { aspect: 'x',       rating: 0 },
    ],
  });
  assert.equal(asArray.specificAspects.quality, 4);
  assert.equal(asArray.specificAspects.safety, 5);
  assert.equal(asArray.specificAspects.x, undefined);
});

test('recordResponse — response is frozen (immutable)', () => {
  const t = new CSATTracker();
  const r = respond(t);
  assert.throws(() => { r.rating = 1; });
  assert.equal(Object.isFrozen(r), true);
});

test('recordResponse — supersedes chain tracked (never-delete rule)', () => {
  const t = new CSATTracker();
  const r1 = respond(t, { surveyId: 'SRV-redo', rating: 2 });
  const r2 = respond(t, { surveyId: 'SRV-redo', rating: 5 });
  assert.equal(r1.version, 1);
  assert.equal(r1.supersedes, null);
  assert.equal(r2.version, 2);
  assert.equal(r2.supersedes, r1);
  // Both still present — nothing was deleted.
  assert.equal(t.responses.length, 2);
});

/* ------------------------------------------------------------------ */
/* computeCSAT — calculation                                            */
/* ------------------------------------------------------------------ */

test('computeCSAT — empty returns 0% poor band', () => {
  const t = new CSATTracker();
  const out = t.computeCSAT({});
  assert.equal(out.total, 0);
  assert.equal(out.csat, 0);
  assert.equal(out.band, BAND_POOR);
});

test('computeCSAT — 8/10 satisfied = 80% good band', () => {
  const t = new CSATTracker();
  [5, 5, 5, 5, 4, 4, 4, 4, 2, 1].forEach((rating, i) => {
    respond(t, { surveyId: `SRV-${i}`, rating });
  });
  const out = t.computeCSAT({});
  assert.equal(out.total, 10);
  assert.equal(out.satisfied, 8);
  assert.equal(out.dissatisfied, 2);
  assert.equal(out.neutral, 0);
  assert.equal(out.csat, 80);
  assert.equal(out.band, BAND_GOOD);
});

test('computeCSAT — 9/10 satisfied = 90% excellent band', () => {
  const t = new CSATTracker();
  [5, 5, 5, 5, 5, 4, 4, 4, 4, 1].forEach((rating, i) => {
    respond(t, { surveyId: `SRV-${i}`, rating });
  });
  const out = t.computeCSAT({});
  assert.equal(out.csat, 90);
  assert.equal(out.band, BAND_EXCELLENT);
});

test('computeCSAT — 7/10 satisfied = 70% fair band', () => {
  const t = new CSATTracker();
  [5, 5, 5, 5, 5, 5, 4, 3, 2, 1].forEach((rating, i) => {
    respond(t, { surveyId: `SRV-${i}`, rating });
  });
  const out = t.computeCSAT({});
  assert.equal(out.csat, 70);
  assert.equal(out.band, BAND_FAIR);
});

test('computeCSAT — 5/10 = 50% poor band', () => {
  const t = new CSATTracker();
  [5, 5, 5, 5, 5, 3, 3, 2, 2, 1].forEach((rating, i) => {
    respond(t, { surveyId: `SRV-${i}`, rating });
  });
  const out = t.computeCSAT({});
  assert.equal(out.csat, 50);
  assert.equal(out.band, BAND_POOR);
});

test('computeCSAT — period filter', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 5, submittedAt: '2026-01-10T00:00:00Z' });
  respond(t, { surveyId: 'b', rating: 1, submittedAt: '2026-03-10T00:00:00Z' });
  respond(t, { surveyId: 'c', rating: 5, submittedAt: '2026-04-01T00:00:00Z' });
  const q1 = t.computeCSAT({ period: { from: '2026-01-01', to: '2026-02-01' } });
  assert.equal(q1.total, 1);
  assert.equal(q1.csat, 100);
  const q2 = t.computeCSAT({ period: { from: '2026-03-01', to: '2026-04-30' } });
  assert.equal(q2.total, 2);
  assert.equal(q2.csat, 50);
});

test('computeCSAT — filter by event', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 5, event: EVENT_TICKET_CLOSED });
  respond(t, { surveyId: 'b', rating: 1, event: EVENT_TICKET_CLOSED });
  respond(t, { surveyId: 'c', rating: 5, event: EVENT_ORDER_DELIVERED });
  const tc = t.computeCSAT({ filter: { event: EVENT_TICKET_CLOSED } });
  assert.equal(tc.total, 2);
  assert.equal(tc.csat, 50);
});

test('computeCSAT — average is correct to 3 decimals', () => {
  const t = new CSATTracker();
  [1, 2, 3, 4, 5].forEach((r, i) => respond(t, { surveyId: `s${i}`, rating: r }));
  const out = t.computeCSAT({});
  assert.equal(out.average, 3);
});

/* ------------------------------------------------------------------ */
/* ces                                                                  */
/* ------------------------------------------------------------------ */

test('ces — empty returns zeros', () => {
  const t = new CSATTracker();
  const out = t.ces({});
  assert.equal(out.count, 0);
  assert.equal(out.average, 0);
});

test('ces — only responses with effortRating count', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 5 });
  respond(t, { surveyId: 'b', rating: 5, effortRating: 6 });
  respond(t, { surveyId: 'c', rating: 4, effortRating: 7 });
  respond(t, { surveyId: 'd', rating: 2, effortRating: 2 });
  const out = t.ces({});
  assert.equal(out.count, 3);
  assert.equal(out.average, 5);
  // (5 - 1) / 6 * 100 = 66.67
  assert.equal(out.cesNormalized, 66.67);
  assert.equal(out.easy, 2);
  assert.equal(out.hard, 1);
});

test('ces — filter by period', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 5, effortRating: 7, submittedAt: '2026-01-01T00:00Z' });
  respond(t, { surveyId: 'b', rating: 5, effortRating: 2, submittedAt: '2026-02-01T00:00Z' });
  const out = t.ces({ period: { from: '2026-01-15' } });
  assert.equal(out.count, 1);
  assert.equal(out.average, 2);
});

/* ------------------------------------------------------------------ */
/* driverAnalysis                                                       */
/* ------------------------------------------------------------------ */

test('driverAnalysis — correlates aspects with overall', () => {
  const t = new CSATTracker();
  // Strong driver: price tracks overall exactly
  // Weak driver: packaging is constant
  const pairs = [
    { overall: 1, price: 1, packaging: 3 },
    { overall: 2, price: 2, packaging: 3 },
    { overall: 3, price: 3, packaging: 3 },
    { overall: 4, price: 4, packaging: 3 },
    { overall: 5, price: 5, packaging: 3 },
  ];
  pairs.forEach((p, i) => {
    t.recordResponse({
      surveyId: `SRV-${i}`,
      customerId: 'c',
      rating: p.overall,
      specificAspects: { price: p.price, packaging: p.packaging },
      submittedAt: '2026-04-01T10:00:00.000Z',
    });
  });
  const out = t.driverAnalysis({});
  const price = out.aspects.find((a) => a.aspect === 'price');
  const packaging = out.aspects.find((a) => a.aspect === 'packaging');
  assert.ok(price);
  assert.ok(packaging);
  assert.equal(price.correlation, 1);       // perfect correlation
  assert.equal(packaging.correlation, 0);   // zero variance → 0
  assert.equal(price.rank, 1);              // strongest driver first
});

test('driverAnalysis — labels are bilingual', () => {
  const t = new CSATTracker();
  t.recordResponse({
    surveyId: 'SRV-1', customerId: 'c', rating: 5,
    specificAspects: { 'on-time': 5 },
    submittedAt: '2026-04-01T10:00:00.000Z',
  });
  t.recordResponse({
    surveyId: 'SRV-2', customerId: 'c', rating: 4,
    specificAspects: { 'on-time': 4 },
    submittedAt: '2026-04-01T10:00:00.000Z',
  });
  const out = t.driverAnalysis({});
  assert.equal(out.aspects[0].label.he, 'עמידה בזמנים');
  assert.equal(out.aspects[0].label.en, 'On Time');
});

/* ------------------------------------------------------------------ */
/* segmentByTouchpoint                                                  */
/* ------------------------------------------------------------------ */

test('segmentByTouchpoint — splits by all dimensions', () => {
  const t = new CSATTracker();
  // Agent Alice: 2×5-star, Agent Bob: 2×1-star
  respond(t, { surveyId: 'a', rating: 5, agent: 'Alice', product: 'AC', channel: 'web',  region: 'North' });
  respond(t, { surveyId: 'b', rating: 5, agent: 'Alice', product: 'AC', channel: 'web',  region: 'North' });
  respond(t, { surveyId: 'c', rating: 1, agent: 'Bob',   product: 'Lift', channel: 'phone', region: 'South' });
  respond(t, { surveyId: 'd', rating: 1, agent: 'Bob',   product: 'Lift', channel: 'phone', region: 'South' });

  const seg = t.segmentByTouchpoint();
  assert.equal(seg.byAgent.Alice.csat, 100);
  assert.equal(seg.byAgent.Bob.csat, 0);
  assert.equal(seg.byProduct.AC.band, BAND_EXCELLENT);
  assert.equal(seg.byProduct.Lift.band, BAND_POOR);
  assert.equal(seg.byChannel.web.total, 2);
  assert.equal(seg.byRegion.South.total, 2);
});

test('segmentByTouchpoint — omits null dimensions', () => {
  const t = new CSATTracker();
  respond(t, { rating: 5 });  // no agent/product/channel/region
  const seg = t.segmentByTouchpoint();
  assert.deepEqual(seg.byAgent, {});
  assert.deepEqual(seg.byProduct, {});
});

/* ------------------------------------------------------------------ */
/* actionableInsights                                                   */
/* ------------------------------------------------------------------ */

test('actionableInsights — groups recurring low-score keywords', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 1, agent: 'Bob', feedback: 'late delivery and damaged box' });
  respond(t, { surveyId: 'b', rating: 2, agent: 'Bob', feedback: 'delivery was late again' });
  respond(t, { surveyId: 'c', rating: 5, agent: 'Alice', feedback: 'great service' });
  const out = t.actionableInsights();
  assert.equal(out.totalLow, 2);
  const delivery = out.patterns.find(
    (p) => p.keyword === 'delivery' && p.segment === 'Bob'
  );
  assert.ok(delivery);
  assert.equal(delivery.count, 2);
  assert.ok(delivery.examples.length >= 1);
});

test('actionableInsights — empty returns empty patterns', () => {
  const t = new CSATTracker();
  respond(t, { rating: 5 });
  const out = t.actionableInsights();
  assert.equal(out.totalLow, 0);
  assert.deepEqual(out.patterns, []);
});

/* ------------------------------------------------------------------ */
/* alertLowSatisfaction (threshold alerts)                              */
/* ------------------------------------------------------------------ */

test('alertLowSatisfaction — default threshold = 2', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 5 });
  respond(t, { surveyId: 'b', rating: 2 });
  respond(t, { surveyId: 'c', rating: 1 });
  respond(t, { surveyId: 'd', rating: 3 });
  const out = t.alertLowSatisfaction({});
  assert.equal(out.threshold, 2);
  assert.equal(out.count, 2);
  const critical = out.alerts.find((a) => a.rating === 1);
  const high = out.alerts.find((a) => a.rating === 2);
  assert.equal(critical.severity, 'critical');
  assert.equal(high.severity, 'high');
});

test('alertLowSatisfaction — custom threshold', () => {
  const t = new CSATTracker();
  respond(t, { surveyId: 'a', rating: 4 });
  respond(t, { surveyId: 'b', rating: 3 });
  respond(t, { surveyId: 'c', rating: 1 });
  const out = t.alertLowSatisfaction({ threshold: 3 });
  assert.equal(out.threshold, 3);
  assert.equal(out.count, 2);
});

/* ------------------------------------------------------------------ */
/* linkToNPS                                                            */
/* ------------------------------------------------------------------ */

test('linkToNPS — aligned when CSAT and NPS are similar', () => {
  const t = new CSATTracker();
  respond(t, { customerId: 'c1', surveyId: 'a', rating: 5 });
  respond(t, { customerId: 'c1', surveyId: 'b', rating: 4 });
  // CSAT avg = 4.5 → normalized ((4.5-1)/4)*100 = 87.5
  t.setNPS('c1', 9);   // 9/10*100 = 90
  const link = t.linkToNPS('c1');
  assert.equal(link.csatCount, 2);
  assert.equal(link.nps, 9);
  assert.equal(link.alignment, 'aligned');
  assert.ok(Math.abs(link.gap) <= 10);
});

test('linkToNPS — csat-higher bucket', () => {
  const t = new CSATTracker();
  respond(t, { customerId: 'c2', surveyId: 'a', rating: 5 });  // 100
  t.setNPS('c2', 4);   // 40
  const link = t.linkToNPS('c2');
  assert.equal(link.alignment, 'csat-higher');
  assert.ok(link.gap > 10);
});

test('linkToNPS — nps-higher bucket', () => {
  const t = new CSATTracker();
  respond(t, { customerId: 'c3', surveyId: 'a', rating: 1 });  // 0
  t.setNPS('c3', 9);   // 90
  const link = t.linkToNPS('c3');
  assert.equal(link.alignment, 'nps-higher');
  assert.ok(link.gap < -10);
});

test('linkToNPS — unknown customer returns unknown alignment', () => {
  const t = new CSATTracker();
  const link = t.linkToNPS('ghost');
  assert.equal(link.alignment, 'unknown');
});

test('setNPS — rejects out-of-range scores', () => {
  const t = new CSATTracker();
  assert.throws(() => t.setNPS('c', 11), /NPS/);
  assert.throws(() => t.setNPS('c', -1), /NPS/);
});

/* ------------------------------------------------------------------ */
/* reportingDashboard                                                   */
/* ------------------------------------------------------------------ */

test('reportingDashboard — bilingual labels present', () => {
  const t = new CSATTracker();
  respond(t, { rating: 5 });
  const d = t.reportingDashboard();
  assert.ok(d.labels.he.title);
  assert.ok(d.labels.en.title);
  assert.ok(d.labels.he.csat);
  assert.ok(d.labels.en.csat);
  assert.ok(d.moduleVersion);
  assert.ok(d.overall);
  assert.ok(d.ces);
  assert.ok(d.segments);
  assert.ok(d.drivers);
  assert.ok(d.insights);
  assert.ok(d.alerts);
});

test('reportingDashboard — band label is translated correctly', () => {
  const t = new CSATTracker();
  // 100 % → excellent
  respond(t, { surveyId: 'a', rating: 5 });
  respond(t, { surveyId: 'b', rating: 5 });
  const d = t.reportingDashboard();
  assert.equal(d.labels.en.band, 'Excellent');
  assert.equal(d.labels.he.band, 'מצוין');
});

/* ------------------------------------------------------------------ */
/* Low-level helpers                                                    */
/* ------------------------------------------------------------------ */

test('bandFromCSAT — mapping', () => {
  assert.equal(bandFromCSAT(95), BAND_EXCELLENT);
  assert.equal(bandFromCSAT(85), BAND_GOOD);
  assert.equal(bandFromCSAT(75), BAND_FAIR);
  assert.equal(bandFromCSAT(69), BAND_POOR);
});

test('pearson — perfect positive = 1', () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
});

test('pearson — perfect negative = -1', () => {
  assert.equal(pearson([1, 2, 3], [6, 4, 2]), -1);
});

test('pearson — zero variance returns 0', () => {
  assert.equal(pearson([3, 3, 3], [1, 2, 3]), 0);
});

test('pearson — n<2 returns 0', () => {
  assert.equal(pearson([1], [1]), 0);
  assert.equal(pearson([], []), 0);
});

test('tokenize — drops stop words and short tokens', () => {
  const toks = tokenize('The delivery was very late and damaged');
  assert.ok(toks.includes('delivery'));
  assert.ok(toks.includes('late'));
  assert.ok(toks.includes('damaged'));
  assert.ok(!toks.includes('the'));
  assert.ok(!toks.includes('was'));
});

test('tokenize — handles hebrew + empty safely', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  const heb = tokenize('המשלוח איחר והיה שבור');
  assert.ok(heb.includes('המשלוח'));
  assert.ok(heb.includes('שבור'));
});
