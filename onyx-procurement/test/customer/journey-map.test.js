/**
 * Customer Journey Map — Unit Tests
 * Agent Y-102 / Swarm Customer / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run: node --test test/customer/journey-map.test.js
 *
 * Covers:
 *   - seed of 9 standard stages + define custom stage
 *   - defineTouchpoint validation (stage + channel)
 *   - recordInteraction append-only
 *   - journeyFor ordered timeline
 *   - frictionScore calculation
 *   - delightScore calculation
 *   - stageConversion rates
 *   - timeInStage dwell calculation
 *   - momentsOfTruth ranking
 *   - generateMap bilingual SVG structure
 *   - personas per-segment aggregation
 *   - dropoffAnalysis
 *   - 10-channel coverage
 *   - never-delete invariant (upgrade stores history)
 *   - input validation (bad channel, bad outcome, bad sentiment)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  JourneyMap,
  STANDARD_STAGES,
  CHANNELS,
  CHANNEL_LABELS,
  FRICTION_WEIGHTS,
  DELIGHT_WEIGHTS,
} = require('../../src/customer/journey-map.js');

// ─── Helpers ────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-01-01T00:00:00Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function makeMap() {
  return new JourneyMap({ now: function () { return T0; } });
}

function seedTouchpoints(m) {
  m.defineTouchpoint({
    id: 'tp-website-home',
    stageId: 'awareness',
    channel: 'website',
    name_he: 'דף בית',
    name_en: 'Homepage',
    owner: 'marketing',
    sla: 2 * HOUR,
  });
  m.defineTouchpoint({
    id: 'tp-sales-demo',
    stageId: 'evaluation',
    channel: 'sales-rep',
    name_he: 'הדגמת מכירות',
    name_en: 'Sales Demo',
    owner: 'sales',
    sla: 24 * HOUR,
  });
  m.defineTouchpoint({
    id: 'tp-checkout',
    stageId: 'purchase',
    channel: 'portal',
    name_he: 'קופה',
    name_en: 'Checkout',
    owner: 'product',
    sla: 15 * 60 * 1000,
  });
  m.defineTouchpoint({
    id: 'tp-support-ticket',
    stageId: 'retention',
    channel: 'support',
    name_he: 'פנייה לתמיכה',
    name_en: 'Support Ticket',
    owner: 'support',
    sla: 4 * HOUR,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('JourneyMap — seed + definitions', function () {
  test('01 seeds 9 standard stages', function () {
    const m = makeMap();
    const stages = m.listStages();
    assert.equal(stages.length, 9);
    assert.deepEqual(
      stages.map(function (s) { return s.id; }),
      ['awareness','consideration','evaluation','purchase','onboarding',
       'adoption','retention','expansion','advocacy']
    );
  });

  test('02 bilingual labels on every standard stage', function () {
    const m = makeMap();
    const stages = m.listStages();
    for (const s of stages) {
      assert.ok(s.name_he && s.name_he.length > 0, 'missing Hebrew for ' + s.id);
      assert.ok(s.name_en && s.name_en.length > 0, 'missing English for ' + s.id);
    }
  });

  test('03 defineTouchpoint validates stage + channel', function () {
    const m = makeMap();
    assert.throws(function () {
      m.defineTouchpoint({
        id: 'x', stageId: 'nope', channel: 'website',
        name_he: 'א', name_en: 'A',
      });
    }, /unknown stageId/);
    assert.throws(function () {
      m.defineTouchpoint({
        id: 'x', stageId: 'awareness', channel: 'telegram',
        name_he: 'א', name_en: 'A',
      });
    }, /unknown channel/);
  });

  test('04 supports all 10 channels', function () {
    const m = makeMap();
    for (let i = 0; i < CHANNELS.length; i++) {
      m.defineTouchpoint({
        id: 'tp-' + CHANNELS[i],
        stageId: 'awareness',
        channel: CHANNELS[i],
        name_he: 'ערוץ ' + i,
        name_en: 'Channel ' + i,
      });
    }
    assert.equal(m.listTouchpoints('awareness').length, 10);
  });
});

describe('JourneyMap — interactions', function () {
  test('05 recordInteraction appends with sequential seq', function () {
    const m = makeMap();
    seedTouchpoints(m);
    const a = m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    const b = m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'converted', sentiment: 'positive',
    });
    assert.equal(a.seq, 0);
    assert.equal(b.seq, 1);
    assert.equal(m._allInteractions().length, 2);
  });

  test('06 rejects unknown touchpoint / outcome / sentiment', function () {
    const m = makeMap();
    seedTouchpoints(m);
    assert.throws(function () {
      m.recordInteraction({ customerId: 'c1', touchpointId: 'ghost', timestamp: T0 });
    }, /unknown touchpointId/);
    assert.throws(function () {
      m.recordInteraction({
        customerId: 'c1', touchpointId: 'tp-website-home', timestamp: T0,
        outcome: 'lost-in-space',
      });
    }, /unknown outcome/);
    assert.throws(function () {
      m.recordInteraction({
        customerId: 'c1', touchpointId: 'tp-website-home', timestamp: T0,
        sentiment: 'angry',
      });
    }, /unknown sentiment/);
  });

  test('07 journeyFor returns ordered timeline', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // record out of order
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-sales-demo',
      timestamp: T0 + 2 * DAY, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-checkout',
      timestamp: T0 + 3 * DAY, outcome: 'converted', sentiment: 'positive',
    });
    const timeline = m.journeyFor('c2');
    assert.equal(timeline.length, 3);
    assert.equal(timeline[0].touchpointId, 'tp-website-home');
    assert.equal(timeline[1].touchpointId, 'tp-sales-demo');
    assert.equal(timeline[2].touchpointId, 'tp-checkout');
  });
});

describe('JourneyMap — scoring', function () {
  test('08 frictionScore weights abandonment + negative + sla breach', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // 4 interactions on tp-support-ticket: 1 abandoned, 1 negative, 1 sla breach, 1 success
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-support-ticket',
      timestamp: T0, outcome: 'abandoned', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-support-ticket',
      timestamp: T0, outcome: 'success', sentiment: 'negative',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-support-ticket',
      timestamp: T0, outcome: 'success', sentiment: 'neutral',
      durationMs: 6 * HOUR, // > 4h SLA → breach
    });
    m.recordInteraction({
      customerId: 'c4', touchpointId: 'tp-support-ticket',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
      durationMs: 1 * HOUR,
    });
    const f = m.frictionScore('tp-support-ticket');
    assert.equal(f.volume, 4);
    assert.equal(f.abandonmentRate, 0.25);
    assert.equal(f.negativeSentimentRate, 0.25);
    assert.equal(f.slaBreachRate, 0.25);
    const expected =
      FRICTION_WEIGHTS.abandon  * 0.25 +
      FRICTION_WEIGHTS.negative * 0.25 +
      FRICTION_WEIGHTS.sla      * 0.25;
    // engine rounds score to 3 decimals — allow tolerance
    assert.ok(Math.abs(f.score - expected) < 1e-3,
      'expected ~' + expected + ' got ' + f.score);
  });

  test('09 frictionScore is 0 for empty touchpoint', function () {
    const m = makeMap();
    seedTouchpoints(m);
    const f = m.frictionScore('tp-website-home');
    assert.equal(f.score, 0);
    assert.equal(f.volume, 0);
  });

  test('10 delightScore weights positive + conversion + repeat', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // 4 interactions:
    //   - 3 positive sentiment / 1 neutral
    //   - 3 conversion outcomes (converted|success) / 1 abandoned
    //   - c1 appears twice → its 2 interactions count toward repeat engagement
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0, outcome: 'converted', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + HOUR, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-sales-demo',
      timestamp: T0, outcome: 'converted', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-sales-demo',
      timestamp: T0, outcome: 'abandoned', sentiment: 'neutral',
    });
    const d = m.delightScore('tp-sales-demo');
    assert.equal(d.volume, 4);
    assert.equal(d.positiveSentimentRate, 0.75);
    // 3 conversion-like outcomes (2 converted + 1 success) out of 4 = 0.75
    assert.equal(d.conversionRate, 0.75);
    // c1 has 2 interactions ⇒ repeat counts 2 out of 4 → 0.5
    assert.equal(d.repeatEngagementRate, 0.5);
    const expected = clamp01(
      DELIGHT_WEIGHTS.positive * 0.75 +
      DELIGHT_WEIGHTS.convert  * 0.75 +
      DELIGHT_WEIGHTS.repeat   * 0.5
    );
    // engine rounds score to 3 decimals — allow tolerance
    assert.ok(Math.abs(d.score - expected) < 1e-3,
      'expected ~' + expected + ' got ' + d.score);

    function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  });

  test('11 scoring honours period filter', function () {
    const m = makeMap();
    seedTouchpoints(m);
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0, outcome: 'abandoned', sentiment: 'negative',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-sales-demo',
      timestamp: T0 + 10 * DAY, outcome: 'success', sentiment: 'positive',
    });
    const fEarly = m.frictionScore('tp-sales-demo', { from: T0, to: T0 + DAY });
    assert.equal(fEarly.volume, 1);
    assert.equal(fEarly.abandonmentRate, 1);
    const fLate = m.frictionScore('tp-sales-demo', { from: T0 + 5 * DAY, to: T0 + 15 * DAY });
    assert.equal(fLate.volume, 1);
    assert.equal(fLate.abandonmentRate, 0);
  });
});

describe('JourneyMap — flow analytics', function () {
  test('12 stageConversion computes stage→next rates', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // c1 and c2 hit awareness; c1 also hits evaluation+purchase; c2 drops at awareness
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'abandoned', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-checkout',
      timestamp: T0 + 2 * DAY, outcome: 'converted', sentiment: 'positive',
    });
    const conv = m.stageConversion();
    const awarenessRow = conv.find(function (r) { return r.from === 'awareness'; });
    // awareness → consideration: neither c1 nor c2 have interactions at consideration → 0
    assert.equal(awarenessRow.reachedFrom, 2);
    assert.equal(awarenessRow.reachedTo, 0);
    assert.equal(awarenessRow.rate, 0);
    const evalRow = conv.find(function (r) { return r.from === 'evaluation'; });
    // evaluation → purchase: c1 hit both → 1/1
    assert.equal(evalRow.reachedFrom, 1);
    assert.equal(evalRow.reachedTo, 1);
    assert.equal(evalRow.rate, 1);
  });

  test('13 timeInStage computes dwell correctly', function () {
    const m = makeMap();
    seedTouchpoints(m);
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0 + 3 * HOUR, outcome: 'success', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + 5 * HOUR, outcome: 'success', sentiment: 'positive',
    });
    // awareness dwell = first awareness → first post-awareness = 5h
    const dwell = m.timeInStage('c1', 'awareness');
    assert.equal(dwell, 5 * HOUR);
  });

  test('14 dropoffAnalysis flags highest-reached stage per customer', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // c1 drops at evaluation, c2 drops at awareness, c3 reaches purchase
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'abandoned', sentiment: 'negative',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'abandoned', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-checkout',
      timestamp: T0 + 2 * DAY, outcome: 'converted', sentiment: 'positive',
    });
    const rows = m.dropoffAnalysis();
    const evalRow = rows.find(function (r) { return r.stageId === 'evaluation'; });
    const awareRow = rows.find(function (r) { return r.stageId === 'awareness'; });
    const purchaseRow = rows.find(function (r) { return r.stageId === 'purchase'; });
    assert.equal(evalRow.dropped, 1);
    assert.equal(awareRow.dropped, 1);
    // c3 reaches purchase but purchase is not final (advocacy is), so c3 shows as drop at purchase
    assert.equal(purchaseRow.dropped, 1);
  });
});

describe('JourneyMap — moments of truth + visualization', function () {
  test('15 momentsOfTruth ranks highest-impact touchpoints first', function () {
    const m = makeMap();
    seedTouchpoints(m);
    // high-volume, polarised tp-sales-demo: mix of abandon + positive
    for (let i = 0; i < 10; i++) {
      m.recordInteraction({
        customerId: 'c' + i, touchpointId: 'tp-sales-demo',
        timestamp: T0 + i * HOUR,
        outcome: i < 5 ? 'abandoned' : 'converted',
        sentiment: i < 5 ? 'negative' : 'positive',
      });
    }
    // low-volume, balanced tp-website-home
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'neutral',
    });
    const rank = m.momentsOfTruth();
    assert.ok(rank.length >= 2);
    assert.equal(rank[0].touchpointId, 'tp-sales-demo');
    assert.ok(rank[0].impact > 0);
    // high-volume should beat low-volume
    const websiteRank = rank.findIndex(function (r) { return r.touchpointId === 'tp-website-home'; });
    const demoRank = rank.findIndex(function (r) { return r.touchpointId === 'tp-sales-demo'; });
    assert.ok(demoRank < websiteRank);
  });

  test('16 generateMap produces bilingual SVG with touchpoint dots', function () {
    const m = makeMap();
    seedTouchpoints(m);
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'abandoned', sentiment: 'negative',
    });
    const svg = m.generateMap();
    assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(svg.indexOf('<svg ') !== -1);
    assert.ok(svg.indexOf('direction="rtl"') !== -1);
    // Hebrew stage name present
    assert.ok(svg.indexOf('מודעות') !== -1);
    // English stage name present
    assert.ok(svg.indexOf('Awareness') !== -1);
    // bilingual title
    assert.ok(svg.indexOf('מפת מסע לקוח') !== -1);
    assert.ok(svg.indexOf('Customer Journey Map') !== -1);
    // touchpoint labels present
    assert.ok(svg.indexOf('דף בית') !== -1);
    assert.ok(svg.indexOf('Homepage') !== -1);
    // legend
    assert.ok(svg.indexOf('Delight') !== -1);
    assert.ok(svg.indexOf('Friction') !== -1);
    assert.ok(svg.endsWith('</svg>'));
  });
});

describe('JourneyMap — personas + never-delete', function () {
  test('17 personas aggregate per segment', function () {
    const m = makeMap();
    seedTouchpoints(m);
    m.tagCustomer('c1', 'enterprise');
    m.tagCustomer('c2', 'enterprise');
    m.tagCustomer('c3', 'smb');
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c1', touchpointId: 'tp-sales-demo',
      timestamp: T0 + DAY, outcome: 'converted', sentiment: 'positive',
    });
    m.recordInteraction({
      customerId: 'c2', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'abandoned', sentiment: 'neutral',
    });
    m.recordInteraction({
      customerId: 'c3', touchpointId: 'tp-website-home',
      timestamp: T0, outcome: 'success', sentiment: 'positive',
    });
    const ent = m.personas({ segmentId: 'enterprise' });
    assert.equal(ent.customerCount, 2);
    assert.equal(ent.totalInteractions, 3);
    assert.ok(ent.avgInteractionsPerCustomer > 1);
    // enterprise touched sales-rep + website; smb only website
    const channels = ent.topChannels.map(function (c) { return c.channel; });
    assert.ok(channels.indexOf('website') !== -1);
    assert.ok(channels.indexOf('sales-rep') !== -1);

    const smb = m.personas({ segmentId: 'smb' });
    assert.equal(smb.customerCount, 1);
    assert.equal(smb.totalInteractions, 1);
  });

  test('18 never-delete: defineStage with same id creates a new version + keeps history', function () {
    const m = makeMap();
    const before = m._historySize();
    m.defineStage({
      id: 'awareness',
      name_he: 'מודעות חדשה',
      name_en: 'Awareness v2',
      order: 1,
      description: 'upgraded',
    });
    const after = m._historySize();
    assert.equal(after, before + 1, 'history should retain old revision');
    assert.equal(m.getStage('awareness').version, 2);
    assert.equal(m.getStage('awareness').name_en, 'Awareness v2');
  });

  test('19 all 9 standard stage ids are exported as constants', function () {
    assert.equal(STANDARD_STAGES.length, 9);
    const ids = STANDARD_STAGES.map(function (s) { return s.id; });
    const expected = ['awareness','consideration','evaluation','purchase','onboarding',
                      'adoption','retention','expansion','advocacy'];
    assert.deepEqual(ids, expected);
  });

  test('20 all 10 channels have bilingual labels', function () {
    assert.equal(CHANNELS.length, 10);
    for (let i = 0; i < CHANNELS.length; i++) {
      const c = CHANNELS[i];
      assert.ok(CHANNEL_LABELS[c], 'missing label object for ' + c);
      assert.ok(CHANNEL_LABELS[c].he && CHANNEL_LABELS[c].he.length > 0, 'missing he for ' + c);
      assert.ok(CHANNEL_LABELS[c].en && CHANNEL_LABELS[c].en.length > 0, 'missing en for ' + c);
    }
  });
});
