/**
 * Customer Journey Mapper — Unit Tests
 * Agent Y-102 / Swarm Customer / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run: node --test test/customer/journey-mapper.test.js
 *
 * Covers:
 *   - defineJourney / upgradeJourney (never-delete)
 *   - recordEvent + getEvents append-only semantics
 *   - currentStage / journeyDuration / stageTimes
 *   - conversionFunnel stage-to-stage calculation
 *   - abandonment detection per period
 *   - heatmapEvents matrix
 *   - anomalyDetection: skip / backtrack / stall
 *   - compareCohorts A/B delta
 *   - predictNextStage peer-based
 *   - interventionPoints severity ranking
 *   - npsPerStage attribution
 *   - generateJourneyMap SVG structural checks
 *   - Rule: never-delete invariant
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  JourneyMapper,
  STANDARD_JOURNEY,
  STANDARD_STAGES,
  EVENT_TYPES,
  TRIGGERS,
  LABELS,
  days,
  hours,
} = require('../../src/customer/journey-mapper.js');

// ─── helpers ──────────────────────────────────────────────────────────
const T0 = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86400000;

function at(dayOffset, hourOffset = 0) {
  return T0 + dayOffset * DAY + hourOffset * 3600000;
}

function makeMapper(nowMs = at(365)) {
  return new JourneyMapper({ now: () => new Date(nowMs) });
}

// ─── tests ────────────────────────────────────────────────────────────
describe('JourneyMapper — definition & seed', () => {
  test('seeds standard customer lifecycle journey by default', () => {
    const jm = makeMapper();
    const j = jm.getJourney('customer_lifecycle');
    assert.ok(j, 'standard journey present');
    assert.equal(j.stages.length, 7);
    assert.equal(j.stages[0].id, 'awareness');
    assert.equal(j.stages[6].id, 'advocacy');
    assert.equal(j.name_he, 'מחזור חיי לקוח');
  });

  test('STANDARD_STAGES matches 7-stage model', () => {
    assert.equal(STANDARD_STAGES.length, 7);
    const ids = STANDARD_STAGES.map((s) => s.id);
    assert.deepEqual(ids, [
      'awareness', 'consideration', 'purchase',
      'onboarding', 'adoption', 'expansion', 'advocacy',
    ]);
    for (const s of STANDARD_STAGES) {
      assert.ok(s.name_he && s.name_en, 'bilingual stage labels');
      assert.ok(Array.isArray(s.triggers), 'triggers array');
    }
  });

  test('defineJourney rejects invalid input', () => {
    const jm = makeMapper();
    assert.throws(() => jm.defineJourney(null), /journey def/);
    assert.throws(() => jm.defineJourney({}), /journey.id/);
    assert.throws(
      () => jm.defineJourney({ id: 'x', name_he: 'x', name_en: 'x', stages: [] }),
      /non-empty array/,
    );
    assert.throws(
      () => jm.defineJourney({
        id: 'x', name_he: 'x', name_en: 'x',
        stages: [
          { id: 'a', name_he: 'a', name_en: 'a' },
          { id: 'a', name_he: 'b', name_en: 'b' },
        ],
      }),
      /duplicate stage id/,
    );
  });

  test('defineJourney returns frozen record', () => {
    const jm = makeMapper();
    const j = jm.getJourney('customer_lifecycle');
    assert.ok(Object.isFrozen(j));
    assert.ok(Object.isFrozen(j.stages));
    assert.ok(Object.isFrozen(j.stages[0]));
  });

  test('listJourneys returns all current versions', () => {
    const jm = makeMapper();
    jm.defineJourney({
      id: 'b2b',
      name_he: 'עסקי',
      name_en: 'B2B',
      stages: [{ id: 'x', name_he: 'איקס', name_en: 'X', triggers: [], expectedDuration: days(1) }],
    });
    const all = jm.listJourneys();
    assert.equal(all.length, 2);
  });

  test('upgradeJourney creates a new version without deleting the old one (never-delete)', () => {
    const jm = makeMapper();
    jm.upgradeJourney('customer_lifecycle', {
      stages: [
        // new stage appended
        { id: 'renewal', name_he: 'חידוש', name_en: 'Renewal', triggers: ['renewed'], expectedDuration: days(30) },
      ],
    });
    const current = jm.getJourney('customer_lifecycle');
    assert.equal(current.version, 2);
    assert.ok(
      current.stages.find((s) => s.id === 'renewal'),
      'new stage present',
    );
    // original stages all still there
    for (const id of ['awareness', 'consideration', 'purchase', 'onboarding', 'adoption', 'expansion', 'advocacy']) {
      assert.ok(current.stages.find((s) => s.id === id), `stage ${id} preserved`);
    }
    // prior version also preserved inside the store
    const versions = jm._store.allVersions('customer_lifecycle');
    assert.equal(versions.length, 2);
    assert.equal(versions[0].version, 1);
    assert.equal(versions[1].version, 2);
  });
});

describe('JourneyMapper — events', () => {
  test('recordEvent stores all touchpoints append-only', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'product_view', timestamp: at(5) });
    jm.recordEvent({ customerId: 'c1', eventType: 'quote_request', timestamp: at(10) });
    const evs = jm.getEvents('c1');
    assert.equal(evs.length, 3);
    // chronological
    assert.ok(evs[0].ts < evs[1].ts && evs[1].ts < evs[2].ts);
    // ISO timestamp included
    assert.match(evs[0].timestamp, /^2026-01-01T/);
  });

  test('recordEvent rejects invalid args', () => {
    const jm = makeMapper();
    assert.throws(() => jm.recordEvent({}), /customerId/);
    assert.throws(() => jm.recordEvent({ customerId: 'c1' }), /eventType/);
    assert.throws(
      () => jm.recordEvent({ customerId: 'c1', eventType: 'x', timestamp: 'nope' }),
      /invalid timestamp/,
    );
  });

  test('events filter by journeyId', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({
      customerId: 'c1',
      eventType: 'lead_form',
      timestamp: at(1),
      properties: { journeyId: 'campaign_spring' },
    });
    const lifecycle = jm.getEvents('c1', 'customer_lifecycle');
    const campaign = jm.getEvents('c1', 'campaign_spring');
    assert.equal(lifecycle.length, 1);
    assert.equal(campaign.length, 1);
  });
});

describe('JourneyMapper — stage transitions', () => {
  test('currentStage resolves to latest stage', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'demo_booked', timestamp: at(5) });
    jm.recordEvent({ customerId: 'c1', eventType: 'order_placed', timestamp: at(10) });
    const cs = jm.currentStage('c1', 'customer_lifecycle');
    assert.equal(cs.stageId, 'purchase');
    assert.equal(cs.name_he, 'רכישה');
  });

  test('currentStage returns null when no events', () => {
    const jm = makeMapper();
    assert.equal(jm.currentStage('ghost', 'customer_lifecycle'), null);
  });

  test('journeyDuration = last now minus first entry', () => {
    const jm = makeMapper(at(30));
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    const dur = jm.journeyDuration('c1', 'customer_lifecycle');
    assert.equal(dur, 30 * DAY);
  });

  test('stageTimes accumulates per stage', () => {
    const jm = makeMapper(at(30));
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'demo_booked', timestamp: at(10) });
    jm.recordEvent({ customerId: 'c1', eventType: 'order_placed', timestamp: at(15) });
    const t = jm.stageTimes('c1', 'customer_lifecycle');
    assert.equal(t.awareness, 10 * DAY);
    assert.equal(t.consideration, 5 * DAY);
    assert.equal(t.purchase, 15 * DAY);
  });
});

describe('JourneyMapper — funnel & abandonment', () => {
  function seedCohort(jm) {
    // 5 customers: everyone hits awareness, 4 consideration, 3 purchase, 2 onboarding, 1 adoption
    const plans = [
      ['c1', ['website_visit', 'demo_booked', 'order_placed', 'first_login', 'feature_used']],
      ['c2', ['website_visit', 'demo_booked', 'order_placed', 'first_login']],
      ['c3', ['website_visit', 'demo_booked', 'order_placed']],
      ['c4', ['website_visit', 'demo_booked']],
      ['c5', ['website_visit']],
    ];
    plans.forEach(([id, evs]) => {
      evs.forEach((ev, i) => {
        jm.recordEvent({ customerId: id, eventType: ev, timestamp: at(i) });
      });
    });
  }

  test('conversionFunnel returns stage-to-stage percentages', () => {
    const jm = makeMapper();
    seedCohort(jm);
    const f = jm.conversionFunnel('customer_lifecycle');
    assert.equal(f.totalCustomers, 5);
    assert.equal(f.stages[0].reached, 5);
    assert.equal(f.stages[1].reached, 4);
    assert.equal(f.stages[2].reached, 3);
    assert.equal(f.stages[3].reached, 2);
    assert.equal(f.stages[4].reached, 1);
    // awareness → consideration = 4/5 = 80%
    assert.equal(f.stages[1].fromPrev, 80);
    assert.equal(f.stages[0].fromTop, 100);
  });

  test('abandonment flags customers stalled beyond 2x expected duration', () => {
    // customer enters consideration at day 0, now is day 180 (way past 21*2=42 days)
    const jm = makeMapper(at(180));
    jm.recordEvent({ customerId: 'lost', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'lost', eventType: 'demo_booked', timestamp: at(1) });
    const a = jm.abandonment({
      journeyId: 'customer_lifecycle',
      period: { from: at(-1), to: at(365) },
    });
    const consideration = a.stages.find((s) => s.stageId === 'consideration');
    assert.equal(consideration.dropped, 1);
    assert.equal(a.total, 1);
  });

  test('abandonment ignores customers inside expected window', () => {
    const jm = makeMapper(at(5));
    jm.recordEvent({ customerId: 'fresh', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'fresh', eventType: 'demo_booked', timestamp: at(4) });
    const a = jm.abandonment({
      journeyId: 'customer_lifecycle',
      period: { from: at(-1), to: at(10) },
    });
    assert.equal(a.total, 0);
  });
});

describe('JourneyMapper — heatmap & anomalies', () => {
  test('heatmapEvents counts events per stage per type', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c2', eventType: 'website_visit', timestamp: at(1) });
    jm.recordEvent({ customerId: 'c3', eventType: 'ad_click', timestamp: at(2) });
    jm.recordEvent({ customerId: 'c1', eventType: 'demo_booked', timestamp: at(3) });
    const h = jm.heatmapEvents({
      journeyId: 'customer_lifecycle',
      period: { from: at(-1), to: at(10) },
    });
    const awareness = h.matrix.find((m) => m.stageId === 'awareness');
    assert.equal(awareness.events.website_visit, 2);
    assert.equal(awareness.events.ad_click, 1);
    assert.equal(awareness.total, 3);
    const consideration = h.matrix.find((m) => m.stageId === 'consideration');
    assert.equal(consideration.total, 1);
  });

  test('anomalyDetection catches backtrack', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'order_placed', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(1) });
    const a = jm.anomalyDetection({ customerId: 'c1', journeyId: 'customer_lifecycle' });
    const back = a.anomalies.find((x) => x.type === 'backtrack');
    assert.ok(back, 'backtrack detected');
    assert.equal(back.from, 'purchase');
    assert.equal(back.to, 'awareness');
  });

  test('anomalyDetection catches skip', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'feature_used', timestamp: at(1) });
    const a = jm.anomalyDetection({ customerId: 'c1', journeyId: 'customer_lifecycle' });
    const skip = a.anomalies.find((x) => x.type === 'skip');
    assert.ok(skip, 'skip detected');
    assert.ok(skip.skipped.includes('consideration'));
  });

  test('anomalyDetection catches stall', () => {
    // customer stuck in consideration way past 21 * 2 days
    const jm = makeMapper(at(200));
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'demo_booked', timestamp: at(1) });
    const a = jm.anomalyDetection({ customerId: 'c1', journeyId: 'customer_lifecycle' });
    const stall = a.anomalies.find((x) => x.type === 'stall');
    assert.ok(stall, 'stall detected');
    assert.equal(stall.stageId, 'consideration');
  });
});

describe('JourneyMapper — predict / intervene / cohort', () => {
  function seed(jm) {
    // 4 peers who all went awareness → consideration → purchase
    ['p1', 'p2', 'p3', 'p4'].forEach((p, i) => {
      jm.recordEvent({ customerId: p, eventType: 'website_visit', timestamp: at(0, i) });
      jm.recordEvent({ customerId: p, eventType: 'demo_booked', timestamp: at(1, i) });
      jm.recordEvent({ customerId: p, eventType: 'order_placed', timestamp: at(2, i) });
    });
    // target customer: awareness → consideration only
    jm.recordEvent({ customerId: 'target', eventType: 'website_visit', timestamp: at(3) });
    jm.recordEvent({ customerId: 'target', eventType: 'demo_booked', timestamp: at(4) });
  }

  test('predictNextStage uses peer trajectories', () => {
    const jm = makeMapper(at(10));
    seed(jm);
    const p = jm.predictNextStage('target', 'customer_lifecycle');
    assert.equal(p.nextStageId, 'purchase');
    assert.ok(p.confidence > 0.9, `confidence ${p.confidence}`);
  });

  test('predictNextStage at terminal returns null', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'nps_promoter', timestamp: at(0) });
    const p = jm.predictNextStage('c1', 'customer_lifecycle');
    assert.equal(p.nextStageId, null);
  });

  test('interventionPoints ranks stalls by count', () => {
    const jm = makeMapper(at(200));
    // three customers stalled in consideration
    ['a', 'b', 'c'].forEach((id) => {
      jm.recordEvent({ customerId: id, eventType: 'website_visit', timestamp: at(0) });
      jm.recordEvent({ customerId: id, eventType: 'demo_booked', timestamp: at(5) });
    });
    // one stalled in onboarding
    jm.recordEvent({ customerId: 'd', eventType: 'first_login', timestamp: at(10) });
    const ips = jm.interventionPoints('customer_lifecycle');
    assert.ok(ips.interventions.length >= 2);
    assert.equal(ips.interventions[0].stageId, 'consideration');
    assert.equal(ips.interventions[0].stalled_count, 3);
  });

  test('compareCohorts computes delta', () => {
    const jm = makeMapper(at(30));
    // cohort A: two customers, both complete the journey
    ['a1', 'a2'].forEach((id) => {
      jm.recordEvent({ customerId: id, eventType: 'website_visit', timestamp: at(0) });
      jm.recordEvent({ customerId: id, eventType: 'demo_booked', timestamp: at(3) });
      jm.recordEvent({ customerId: id, eventType: 'order_placed', timestamp: at(5) });
      jm.recordEvent({ customerId: id, eventType: 'first_login', timestamp: at(6) });
      jm.recordEvent({ customerId: id, eventType: 'feature_used', timestamp: at(8) });
      jm.recordEvent({ customerId: id, eventType: 'upsell_accepted', timestamp: at(10) });
      jm.recordEvent({ customerId: id, eventType: 'referral_sent', timestamp: at(12) });
    });
    // cohort B: only awareness
    ['b1', 'b2'].forEach((id) => {
      jm.recordEvent({ customerId: id, eventType: 'website_visit', timestamp: at(0) });
    });
    const cmp = jm.compareCohorts({
      cohortA: { label: 'VIP', customerIds: ['a1', 'a2'] },
      cohortB: { label: 'Cold', customerIds: ['b1', 'b2'] },
    });
    assert.equal(cmp.cohortA.completion, 100);
    assert.equal(cmp.cohortB.completion, 0);
    assert.equal(cmp.delta.completion, -100);
  });
});

describe('JourneyMapper — NPS per stage', () => {
  test('attributes NPS response to stage at the time of the event', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c1', eventType: 'demo_booked', timestamp: at(1) });
    jm.recordEvent({
      customerId: 'c1',
      eventType: 'nps_response',
      timestamp: at(2),
      properties: { score: 9 },
    });
    jm.recordEvent({ customerId: 'c1', eventType: 'order_placed', timestamp: at(3) });
    jm.recordEvent({
      customerId: 'c1',
      eventType: 'nps_response',
      timestamp: at(4),
      properties: { score: 5 },
    });
    const nps = jm.npsPerStage('customer_lifecycle');
    const consideration = nps.stages.find((s) => s.stageId === 'consideration');
    const purchase = nps.stages.find((s) => s.stageId === 'purchase');
    assert.equal(consideration.responses, 1);
    assert.equal(consideration.promoters, 1);
    assert.equal(consideration.nps, 100);
    assert.equal(purchase.responses, 1);
    assert.equal(purchase.detractors, 1);
    assert.equal(purchase.nps, -100);
  });

  test('empty NPS returns null scores', () => {
    const jm = makeMapper();
    const nps = jm.npsPerStage('customer_lifecycle');
    for (const s of nps.stages) {
      assert.equal(s.responses, 0);
      assert.equal(s.nps, null);
    }
  });
});

describe('JourneyMapper — SVG generation', () => {
  test('generateJourneyMap returns a valid SVG with bilingual labels', () => {
    const jm = makeMapper();
    jm.recordEvent({ customerId: 'c1', eventType: 'website_visit', timestamp: at(0) });
    jm.recordEvent({ customerId: 'c2', eventType: 'demo_booked', timestamp: at(1) });
    jm.recordEvent({ customerId: 'c3', eventType: 'order_placed', timestamp: at(2) });
    const svg = jm.generateJourneyMap('customer_lifecycle');
    assert.ok(svg.startsWith('<svg'), 'starts with <svg>');
    assert.ok(svg.endsWith('</svg>'), 'ends with </svg>');
    // bilingual title present
    assert.ok(svg.includes('Customer Lifecycle'), 'English title');
    assert.ok(svg.includes('מחזור חיי לקוח'), 'Hebrew title');
    // contains every stage label
    for (const s of STANDARD_STAGES) {
      assert.ok(svg.includes(s.name_en), `stage ${s.name_en}`);
      assert.ok(svg.includes(s.name_he), `stage ${s.name_he}`);
    }
    // version stamp
    assert.ok(svg.includes('v1'), 'version stamp');
    // arrow marker def
    assert.ok(svg.includes('marker id="arrow"'), 'arrow marker');
    // % symbols for conversions
    assert.ok(svg.includes('%'), 'percentages');
  });

  test('SVG width scales with number of stages', () => {
    const jm = makeMapper();
    const svg = jm.generateJourneyMap('customer_lifecycle');
    const match = svg.match(/width="(\d+)"/);
    assert.ok(match, 'width attribute present');
    const w = parseInt(match[1], 10);
    assert.ok(w > 800, `width ${w} should scale with 7 stages`);
  });
});

describe('JourneyMapper — never-delete invariant', () => {
  test('no event removal method exists', () => {
    const jm = makeMapper();
    assert.equal(typeof jm.deleteEvent, 'undefined');
    assert.equal(typeof jm.removeEvent, 'undefined');
    assert.equal(typeof jm.clear, 'undefined');
  });

  test('no journey removal method exists', () => {
    const jm = makeMapper();
    assert.equal(typeof jm.deleteJourney, 'undefined');
    assert.equal(typeof jm.removeJourney, 'undefined');
  });

  test('upgrade preserves the old version in the store', () => {
    const jm = makeMapper();
    jm.upgradeJourney('customer_lifecycle', { name_en: 'Customer Lifecycle v2' });
    const versions = jm._store.allVersions('customer_lifecycle');
    assert.equal(versions.length, 2);
    assert.equal(versions[0].name_en, 'Customer Lifecycle');
    assert.equal(versions[1].name_en, 'Customer Lifecycle v2');
  });
});

describe('JourneyMapper — bilingual labels', () => {
  test('LABELS dictionary covers all headers in Hebrew and English', () => {
    assert.ok(LABELS.headers.journey.he);
    assert.ok(LABELS.headers.journey.en);
    assert.ok(LABELS.anomalies.skip.he);
    assert.ok(LABELS.anomalies.backtrack.he);
    assert.ok(LABELS.anomalies.stall.he);
  });

  test('EVENT_TYPES and TRIGGERS align', () => {
    for (const t of TRIGGERS) {
      assert.ok(EVENT_TYPES[t], `trigger ${t} in catalog`);
      assert.ok(EVENT_TYPES[t].stage, `trigger ${t} has stage`);
    }
  });
});
