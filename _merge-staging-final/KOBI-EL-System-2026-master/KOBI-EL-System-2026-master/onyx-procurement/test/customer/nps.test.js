/**
 * NPS System — unit tests
 * Agent Y-092 — 2026-04-11
 *
 * Run:  node --test test/customer/nps.test.js
 *
 * Covers:
 *   - NPS formula (%Promoters − %Detractors, rounded int)
 *   - Promoter / Passive / Detractor classification
 *   - Period filtering
 *   - Segment NPS
 *   - Trend over time (monthly delta, direction labels)
 *   - Closed-loop trigger on detractor (48h SLA, dedupe)
 *   - Follow-up outcome tracking
 *   - Verbatim theme extraction + sentiment lite
 *   - Industry benchmarks (metal-fab, b2b-manufacturing, default)
 *   - Survey versioning (never delete)
 *   - Bilingual labels surface everywhere
 *   - Executive dashboard shape
 *   - Edge cases: invalid score, invalid channel, missing survey
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  NPSSystem,
  BUCKETS,
  CHANNELS,
  TRIGGERS,
  CASE_STATUS,
  DEFAULT_QUESTION,
  INDUSTRY_BENCHMARKS,
  CLOSED_LOOP_SLA_HOURS,
  _classify,
  _bucketKey,
  _sentimentLite,
} = require('../../src/customer/nps.js');

// ─────────────────────────────────────────────────────────────
// 1. Classification — Promoter / Passive / Detractor
// ─────────────────────────────────────────────────────────────

test('01. classification — 0..6 detractor, 7..8 passive, 9..10 promoter', () => {
  for (let s = 0; s <= 6; s++) assert.equal(_classify(s), 'detractor', `score ${s}`);
  for (let s = 7; s <= 8; s++) assert.equal(_classify(s), 'passive',   `score ${s}`);
  for (let s = 9; s <= 10; s++) assert.equal(_classify(s), 'promoter', `score ${s}`);
});

test('02. BUCKETS catalog — bilingual + correct ranges', () => {
  assert.equal(BUCKETS.promoter.min, 9);
  assert.equal(BUCKETS.promoter.max, 10);
  assert.equal(BUCKETS.passive.min, 7);
  assert.equal(BUCKETS.passive.max, 8);
  assert.equal(BUCKETS.detractor.min, 0);
  assert.equal(BUCKETS.detractor.max, 6);
  for (const key of Object.keys(BUCKETS)) {
    assert.ok(BUCKETS[key].he.length > 0, `missing he for ${key}`);
    assert.ok(BUCKETS[key].en.length > 0, `missing en for ${key}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Survey creation, versioning, bilingual fields
// ─────────────────────────────────────────────────────────────

test('03. createSurvey — requires bilingual names + valid channels/trigger', () => {
  const nps = new NPSSystem({ seed: false });
  const s = nps.createSurvey({
    id: 's-post-delivery',
    name_he: 'סקר לאחר משלוח',
    name_en: 'Post-delivery survey',
    audience: 'buyers',
    schedule: { type: 'event', params: { event: 'order-delivered' } },
    channels: ['email', 'whatsapp'],
    trigger: 'transactional',
  });
  assert.equal(s.id, 's-post-delivery');
  assert.equal(s.version, 1);
  assert.equal(s.name_he, 'סקר לאחר משלוח');
  assert.equal(s.name_en, 'Post-delivery survey');
  assert.equal(s.question_he, DEFAULT_QUESTION.he);
  assert.equal(s.question_en, DEFAULT_QUESTION.en);
});

test('04. createSurvey — invalid channel throws bilingual error', () => {
  const nps = new NPSSystem({ seed: false });
  assert.throws(() => nps.createSurvey({
    name_he: 'ש',
    name_en: 's',
    audience: 'all',
    schedule: { type: 'monthly' },
    channels: ['carrier-pigeon'],
    trigger: 'relationship',
  }), /invalid channel/);
});

test('05. createSurvey — invalid trigger throws', () => {
  const nps = new NPSSystem({ seed: false });
  assert.throws(() => nps.createSurvey({
    name_he: 'ש',
    name_en: 's',
    audience: 'all',
    schedule: { type: 'monthly' },
    channels: ['email'],
    trigger: 'magic',
  }), /invalid trigger/);
});

test('06. versioning — re-defining bumps version, history preserved (never delete)', () => {
  const nps = new NPSSystem({ seed: false });
  const id = 's-ver';
  nps.createSurvey({
    id, name_he: 'v1', name_en: 'v1',
    audience: 'all',
    schedule: { type: 'monthly' },
    channels: ['email'],
    trigger: 'relationship',
  });
  nps.createSurvey({
    id, name_he: 'v2', name_en: 'v2',
    audience: 'all',
    schedule: { type: 'monthly' },
    channels: ['email', 'in-app'],
    trigger: 'relationship',
  });
  const cur = nps.getSurvey(id);
  assert.equal(cur.version, 2);
  assert.equal(cur.name_en, 'v2');
  const hist = nps.getSurveyHistory(id);
  assert.equal(hist.length, 2);
  assert.equal(hist[0].name_en, 'v1');
  const v1 = nps.getSurvey(id, 1);
  assert.equal(v1.name_en, 'v1');
});

test('07. seeded survey — annual relationship NPS is present by default', () => {
  const nps = new NPSSystem();
  const seeded = nps.getSurvey('nps-annual-relationship');
  assert.ok(seeded);
  assert.equal(seeded.trigger, 'relationship');
  assert.ok(seeded.channels.includes('email'));
});

// ─────────────────────────────────────────────────────────────
// 3. sendSurvey — bilingual 0-10 question
// ─────────────────────────────────────────────────────────────

test('08. sendSurvey — renders bilingual 0-10 question on a valid channel', () => {
  const nps = new NPSSystem();
  const d = nps.sendSurvey({
    customerId: 'C-1',
    surveyId: 'nps-annual-relationship',
    channel: 'email',
  });
  assert.equal(d.customer_id, 'C-1');
  assert.equal(d.channel, 'email');
  assert.ok(d.rendered_he.includes('0'));
  assert.ok(d.rendered_he.includes('10'));
  assert.ok(d.rendered_en.toLowerCase().includes('recommend'));
});

test('09. sendSurvey — rejects channel that is not configured', () => {
  const nps = new NPSSystem();
  assert.throws(() => nps.sendSurvey({
    customerId: 'C-1',
    surveyId: 'nps-annual-relationship',
    channel: 'sms',
  }), /channel sms not configured/);
});

// ─────────────────────────────────────────────────────────────
// 4. recordResponse + NPS formula
// ─────────────────────────────────────────────────────────────

test('10. recordResponse — invalid score rejected', () => {
  const nps = new NPSSystem();
  assert.throws(() => nps.recordResponse({
    surveyId: 'nps-annual-relationship',
    customerId: 'C-1',
    score: 11,
  }), /score must be an integer in the range 0-10/);
  assert.throws(() => nps.recordResponse({
    surveyId: 'nps-annual-relationship',
    customerId: 'C-1',
    score: -1,
  }), /score must be an integer/);
  assert.throws(() => nps.recordResponse({
    surveyId: 'nps-annual-relationship',
    customerId: 'C-1',
    score: 8.5,
  }), /score must be an integer/);
});

test('11. NPS formula — 6P, 2N, 2D → NPS = 40', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  // 6 promoters
  for (let i = 0; i < 6; i++) {
    nps.recordResponse({ surveyId: id, customerId: `P-${i}`, score: 10 });
  }
  // 2 passives
  nps.recordResponse({ surveyId: id, customerId: 'PA-1', score: 7 });
  nps.recordResponse({ surveyId: id, customerId: 'PA-2', score: 8 });
  // 2 detractors
  nps.recordResponse({ surveyId: id, customerId: 'D-1', score: 4 });
  nps.recordResponse({ surveyId: id, customerId: 'D-2', score: 0 });

  const report = nps.computeNPS({ survey: id });
  assert.equal(report.total_responses, 10);
  assert.equal(report.promoters, 6);
  assert.equal(report.passives, 2);
  assert.equal(report.detractors, 2);
  // %P = 60, %D = 20 → NPS = 40
  assert.equal(report.pct_promoters, 60);
  assert.equal(report.pct_detractors, 20);
  assert.equal(report.nps, 40);
  assert.equal(report.formula_en, 'NPS = %Promoters − %Detractors');
});

test('12. NPS formula — all detractors → −100', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  for (let i = 0; i < 4; i++) {
    nps.recordResponse({ surveyId: id, customerId: `x-${i}`, score: 3 });
  }
  assert.equal(nps.computeNPS({ survey: id }).nps, -100);
});

test('13. NPS formula — all promoters → +100', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  for (let i = 0; i < 4; i++) {
    nps.recordResponse({ surveyId: id, customerId: `x-${i}`, score: 9 });
  }
  assert.equal(nps.computeNPS({ survey: id }).nps, 100);
});

test('14. NPS formula — empty set returns 0 (no NaN)', () => {
  const nps = new NPSSystem({ seed: false });
  nps.createSurvey({
    id: 'empty', name_he: 'ר', name_en: 'e',
    audience: 'all', schedule: { type: 'adhoc' },
    channels: ['email'], trigger: 'event',
  });
  const r = nps.computeNPS({ survey: 'empty' });
  assert.equal(r.total_responses, 0);
  assert.equal(r.nps, 0);
});

test('15. re-submit — previous response is superseded but preserved', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'C-7', score: 3 });
  nps.recordResponse({ surveyId: id, customerId: 'C-7', score: 10 });
  const live = nps.listResponses({ surveyId: id });
  const customerResps = live.filter((r) => r.customer_id === 'C-7');
  assert.equal(customerResps.length, 1);
  assert.equal(customerResps[0].score, 10);
  const all = nps.listResponses({ surveyId: id, includeSuperseded: true });
  const historical = all.filter((r) => r.customer_id === 'C-7');
  assert.equal(historical.length, 2);
});

// ─────────────────────────────────────────────────────────────
// 5. Segment NPS
// ─────────────────────────────────────────────────────────────

test('16. segmentNPS — splits cleanly by segment', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  // Segment "enterprise": 2P, 1D → NPS = 33
  nps.recordResponse({ surveyId: id, customerId: 'E-1', score: 10, segment: 'enterprise' });
  nps.recordResponse({ surveyId: id, customerId: 'E-2', score: 9,  segment: 'enterprise' });
  nps.recordResponse({ surveyId: id, customerId: 'E-3', score: 5,  segment: 'enterprise' });
  // Segment "smb": 1P, 1P → NPS = 100
  nps.recordResponse({ surveyId: id, customerId: 'S-1', score: 9,  segment: 'smb' });
  nps.recordResponse({ surveyId: id, customerId: 'S-2', score: 10, segment: 'smb' });

  const e = nps.segmentNPS({ segment: 'enterprise' });
  assert.equal(e.total_responses, 3);
  assert.equal(e.nps, Math.round((2 / 3) * 100 - (1 / 3) * 100));

  const s = nps.segmentNPS({ segment: 'smb' });
  assert.equal(s.nps, 100);
});

// ─────────────────────────────────────────────────────────────
// 6. Trend over time
// ─────────────────────────────────────────────────────────────

test('17. trendOverTime — monthly buckets, delta + direction', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  // 2026-01: 2 promoters, 0 detractors → 100
  nps.recordResponse({ surveyId: id, customerId: 'A-1', score: 10, date: '2026-01-10T10:00:00Z' });
  nps.recordResponse({ surveyId: id, customerId: 'A-2', score: 9,  date: '2026-01-15T10:00:00Z' });
  // 2026-02: 1 promoter, 1 detractor → 0
  nps.recordResponse({ surveyId: id, customerId: 'B-1', score: 9,  date: '2026-02-05T10:00:00Z' });
  nps.recordResponse({ surveyId: id, customerId: 'B-2', score: 2,  date: '2026-02-20T10:00:00Z' });

  const trend = nps.trendOverTime(id);
  assert.equal(trend.points.length, 2);
  assert.equal(trend.points[0].period, '2026-01');
  assert.equal(trend.points[0].nps, 100);
  assert.equal(trend.points[1].period, '2026-02');
  assert.equal(trend.points[1].nps, 0);
  assert.equal(trend.points[1].delta, -100);
  assert.equal(trend.points[1].direction.en, 'down');
  assert.equal(trend.points[0].direction.en, 'flat');
});

test('18. _bucketKey — month / quarter / year formats', () => {
  const iso = '2026-04-11T12:00:00Z';
  assert.equal(_bucketKey(iso, 'month'),   '2026-04');
  assert.equal(_bucketKey(iso, 'quarter'), '2026-Q2');
  assert.equal(_bucketKey(iso, 'year'),    '2026');
});

// ─────────────────────────────────────────────────────────────
// 7. Closed-loop trigger (48h SLA)
// ─────────────────────────────────────────────────────────────

test('19. closedLoop — detractor response auto-opens case with 48h SLA', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({
    surveyId: id,
    customerId: 'C-99',
    score: 2,
    comment: 'slow delivery, rude agent',
  });
  const fu = nps.followupTracking('C-99');
  assert.equal(fu.cases.length, 1);
  const c = fu.cases[0];
  assert.equal(c.status, 'open');
  assert.equal(c.sla_hours, CLOSED_LOOP_SLA_HOURS);
  const durationMs = new Date(c.due_at).getTime() - new Date(c.opened_at).getTime();
  assert.equal(durationMs, 48 * 60 * 60 * 1000);
  assert.ok(c.workflow.steps_he.length >= 4);
  assert.ok(c.workflow.steps_en.length >= 4);
});

test('20. closedLoop — promoter does NOT open a case', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'C-HAPPY', score: 10 });
  const fu = nps.followupTracking('C-HAPPY');
  assert.equal(fu.cases.length, 0);
});

test('21. closedLoop — re-flagging same detractor does NOT duplicate', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'C-RE', score: 2 });
  nps.recordResponse({ surveyId: id, customerId: 'C-RE', score: 1 });
  const fu = nps.followupTracking('C-RE');
  assert.equal(fu.cases.length, 1);
  const c = fu.cases[0];
  // At least the opened event + one retrigger.
  const retriggers = c.events.filter((e) => e.type === 'retrigger');
  assert.ok(retriggers.length >= 1, 'expected retrigger event');
});

test('22. recordFollowupOutcome — sets status + appends event (append-only)', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'C-X', score: 3 });
  const { cases } = nps.followupTracking('C-X');
  const caseId = cases[0].id;

  const updated = nps.recordFollowupOutcome({
    caseId,
    status: 'contacted',
    outcome_he: 'התקשרנו והמחלקה הטכנית תחזור',
    outcome_en: 'Called, engineering will circle back',
    by: 'alice',
  });
  assert.equal(updated.status, 'contacted');
  const outcomeEvents = updated.events.filter((e) => e.type === 'outcome');
  assert.equal(outcomeEvents.length, 1);
  assert.equal(outcomeEvents[0].by, 'alice');
});

test('23. followupTracking — flags overdue when past 48h', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'C-OLD', score: 2 });

  // Hand-edit the in-memory case to back-date opened_at / due_at.
  const c = Array.from(nps._cases.values()).find((x) => x.detractor_id === 'C-OLD');
  const past = new Date(Date.now() - 72 * 60 * 60 * 1000);
  c.opened_at = past.toISOString();
  c.due_at    = new Date(past.getTime() + CLOSED_LOOP_SLA_HOURS * 60 * 60 * 1000)
    .toISOString();

  const fu = nps.followupTracking('C-OLD');
  assert.equal(fu.cases[0].overdue, true);
  assert.equal(fu.breached, 1);
});

// ─────────────────────────────────────────────────────────────
// 8. Verbatim analysis
// ─────────────────────────────────────────────────────────────

test('24. verbatimAnalysis — detects themes and sentiment', () => {
  const nps = new NPSSystem();
  const comments = [
    'Delivery was late and the agent was rude',
    'Great quality, very durable',
    'Too expensive for the price',
    'אספקה מהירה ונציג אדיב',
    '',
  ];
  const r = nps.verbatimAnalysis(comments);
  assert.equal(r.analysed, 4);
  const themes = r.themes.map((t) => t.theme);
  assert.ok(themes.includes('delivery'));
  assert.ok(themes.includes('service'));
  assert.ok(themes.includes('quality'));
  assert.ok(themes.includes('price'));
  assert.ok(r.sentiment.negative >= 1);
  assert.ok(r.sentiment.positive >= 1);
});

test('25. _sentimentLite — positive > negative, negative > positive, neutral', () => {
  assert.equal(_sentimentLite('great and excellent'), 1);
  assert.equal(_sentimentLite('terrible and slow'),  -1);
  assert.equal(_sentimentLite('received it'),         0);
});

// ─────────────────────────────────────────────────────────────
// 9. Industry benchmarks
// ─────────────────────────────────────────────────────────────

test('26. benchmarkIndustry — metal-fab + b2b-manufacturing + fallback', () => {
  const nps = new NPSSystem();
  const metal = nps.benchmarkIndustry({ industry: 'metal-fab' });
  assert.equal(metal.thresholds.average, INDUSTRY_BENCHMARKS['metal-fab'].avg);
  assert.equal(metal.thresholds.low,       INDUSTRY_BENCHMARKS['metal-fab'].low);
  assert.equal(metal.thresholds.good,      INDUSTRY_BENCHMARKS['metal-fab'].good);
  assert.equal(metal.thresholds.excellent, INDUSTRY_BENCHMARKS['metal-fab'].excellent);
  assert.ok(metal.label_he.length > 0);
  assert.ok(metal.label_en.length > 0);

  const b2b = nps.benchmarkIndustry({ industry: 'b2b-manufacturing' });
  assert.equal(b2b.thresholds.excellent, INDUSTRY_BENCHMARKS['b2b-manufacturing'].excellent);

  const unknown = nps.benchmarkIndustry({ industry: 'unknown-xyz' });
  assert.equal(unknown.thresholds.average, INDUSTRY_BENCHMARKS['default'].avg);
  assert.equal(unknown.label_en, INDUSTRY_BENCHMARKS['default'].en);
});

// ─────────────────────────────────────────────────────────────
// 10. Executive dashboard
// ─────────────────────────────────────────────────────────────

test('27. executiveDashboard — returns bilingual shape with headline + themes', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'X1', score: 10, comment: 'Excellent quality', segment: 'smb' });
  nps.recordResponse({ surveyId: id, customerId: 'X2', score: 9,  comment: 'Fast delivery',    segment: 'smb' });
  nps.recordResponse({ surveyId: id, customerId: 'X3', score: 4,  comment: 'Too expensive',    segment: 'enterprise' });

  const d = nps.executiveDashboard();
  assert.ok(d.headline);
  assert.equal(typeof d.headline.nps, 'number');
  assert.equal(d.headline.total, 3);
  assert.ok(d.labels.he.title.length > 0);
  assert.ok(d.labels.en.title.length > 0);
  assert.ok(Array.isArray(d.segments));
  assert.ok(d.themes);
  assert.ok(d.closed_loop);
  assert.equal(d.closed_loop.sla_hours, CLOSED_LOOP_SLA_HOURS);
});

// ─────────────────────────────────────────────────────────────
// 11. Bilingual coverage sanity
// ─────────────────────────────────────────────────────────────

test('28. CHANNELS / TRIGGERS / CASE_STATUS are bilingual', () => {
  for (const key of Object.keys(CHANNELS))    {
    assert.ok(CHANNELS[key].he && CHANNELS[key].en, `channel ${key}`);
  }
  for (const key of Object.keys(TRIGGERS))    {
    assert.ok(TRIGGERS[key].he && TRIGGERS[key].en, `trigger ${key}`);
  }
  for (const key of Object.keys(CASE_STATUS)) {
    assert.ok(CASE_STATUS[key].he && CASE_STATUS[key].en, `status ${key}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 12. Period filtering
// ─────────────────────────────────────────────────────────────

test('29. computeNPS — period filter excludes out-of-range responses', () => {
  const nps = new NPSSystem();
  const id = 'nps-annual-relationship';
  nps.recordResponse({ surveyId: id, customerId: 'P-1', score: 10, date: '2025-12-01T00:00:00Z' });
  nps.recordResponse({ surveyId: id, customerId: 'P-2', score: 10, date: '2026-02-01T00:00:00Z' });
  nps.recordResponse({ surveyId: id, customerId: 'D-1', score: 3,  date: '2026-02-15T00:00:00Z' });

  const full = nps.computeNPS({ survey: id });
  assert.equal(full.total_responses, 3);

  const q1 = nps.computeNPS({
    survey: id,
    period: { from: '2026-01-01T00:00:00Z', to: '2026-03-31T23:59:59Z' },
  });
  assert.equal(q1.total_responses, 2);
  assert.equal(q1.nps, 0); // 1P, 1D → 50 - 50 = 0
});
