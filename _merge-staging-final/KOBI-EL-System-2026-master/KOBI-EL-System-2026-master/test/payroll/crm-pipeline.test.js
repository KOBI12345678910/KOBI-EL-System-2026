/**
 * Tests for onyx-procurement/src/crm/pipeline.js
 *
 * Agent X-35 | Swarm 3B | Techno-Kol Uzi mega-ERP 2026
 *
 * Zero-dependency CRM sales-pipeline tests. 32 cases covering:
 *  - Deal CRUD + validation
 *  - Stage transitions & history (append-only)
 *  - Activities + reminders + calendar
 *  - Pipeline view + filters + totals
 *  - Forecasting (committed / best-case / pipeline / weighted)
 *  - Velocity metrics
 *  - Win/loss analysis
 *  - Forecast accuracy (MAPE + bias)
 *  - Stale-deal detection
 *  - Auto-progression rules
 *  - Email template rendering (bilingual)
 *  - Immutability + never-delete guarantees
 *  - Bilingual label coverage
 *
 * Run:
 *   node --test test/payroll/crm-pipeline.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PIPELINE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'crm',
  'pipeline.js'
);

const {
  createPipeline,
  STAGE_KEYS,
  STAGE_LABELS,
  ACTIVITY_TYPES,
} = require(PIPELINE_PATH);

// ─────────────────────────────────────────────────────────────
// Fixed-clock helper — makes every test deterministic
// ─────────────────────────────────────────────────────────────
function fixedClock(startMs) {
  let t = startMs;
  return {
    now: function () { return t; },
    advanceDays: function (n) { t += n * 86400000; },
    advanceMs: function (ms) { t += ms; },
    set: function (ms) { t = ms; },
  };
}

const DAY_MS = 86400000;
const BASE = Date.UTC(2026, 3, 1); // 2026-04-01 UTC (month is 0-indexed)

function newPipeline() {
  const clock = fixedClock(BASE);
  const pipe = createPipeline({ now: function () { return clock.now(); } });
  return { pipe: pipe, clock: clock };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('CRM pipeline — module shape', function () {

  test('01: exports expected public API surface', function () {
    const { pipe } = newPipeline();
    const expected = [
      'createDeal', 'updateDeal', 'updateStage', 'getDeal',
      'listDeals', 'listByOwner',
      'addContact', 'getContact',
      'logActivity', 'getActivity', 'listActivities',
      'pipelineView', 'forecast', 'velocityReport',
      'winLossAnalysis', 'forecastAccuracy',
      'staleDeals', 'dueFollowUps', 'calendarEvents',
      'autoProgressRules', 'renderEmail', 'snapshot',
    ];
    for (let i = 0; i < expected.length; i += 1) {
      assert.equal(typeof pipe[expected[i]], 'function',
        'missing export: ' + expected[i]);
    }
    assert.ok(Array.isArray(pipe.STAGE_KEYS));
    assert.equal(pipe.STAGE_KEYS.length, 6);
  });

  test('02: default stage ladder has bilingual labels', function () {
    for (let i = 0; i < STAGE_KEYS.length; i += 1) {
      const k = STAGE_KEYS[i];
      const entry = STAGE_LABELS[k];
      assert.ok(entry, 'missing label for ' + k);
      assert.ok(typeof entry.he === 'string' && entry.he.length > 0,
        'missing Hebrew for ' + k);
      assert.ok(typeof entry.en === 'string' && entry.en.length > 0,
        'missing English for ' + k);
      assert.ok(entry.probability >= 0 && entry.probability <= 1);
    }
  });

  test('03: activity types include the required five', function () {
    const need = ['call', 'email', 'meeting', 'task', 'note'];
    for (let i = 0; i < need.length; i += 1) {
      assert.ok(ACTIVITY_TYPES[need[i]], 'missing activity type: ' + need[i]);
      assert.ok(ACTIVITY_TYPES[need[i]].he);
      assert.ok(ACTIVITY_TYPES[need[i]].en);
    }
  });
});

describe('CRM pipeline — deals CRUD', function () {

  test('04: createDeal returns a deterministic id and persists fields', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({
      title: 'מערכת ERP לבית חולים',
      client_id: 'CL001',
      owner: 'sara',
      value: 125000,
      expected_close_date: '2026-05-15',
      source: 'referral',
      tags: ['erp', 'healthcare'],
    });
    assert.match(id, /^DEAL_/);
    const d = pipe.getDeal(id);
    assert.equal(d.title, 'מערכת ERP לבית חולים');
    assert.equal(d.value, 125000);
    assert.equal(d.owner, 'sara');
    assert.equal(d.stage, 'Lead');
    assert.equal(d.probability, 0.10);
    assert.deepEqual(d.tags, ['erp', 'healthcare']);
    assert.equal(d.currency, 'ILS');
  });

  test('05: createDeal rejects missing title / negative value / bad stage', function () {
    const { pipe } = newPipeline();
    assert.throws(function () { pipe.createDeal({}); }, /title/);
    assert.throws(function () { pipe.createDeal({ title: 'X', value: -5 }); }, /value/);
    assert.throws(function () {
      pipe.createDeal({ title: 'X', value: 100, stage: 'Weird' });
    }, /stage/);
  });

  test('06: updateDeal patches only whitelisted fields and bumps updated_at', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    const before = pipe.getDeal(id).updated_at;
    clock.advanceMs(1000);
    const after = pipe.updateDeal(id, { value: 22, owner: 'dan', tags: ['hot'] });
    assert.equal(after.value, 22);
    assert.equal(after.owner, 'dan');
    assert.deepEqual(after.tags, ['hot']);
    assert.ok(after.updated_at > before);
    // unknown fields are ignored (id cannot be replaced)
    pipe.updateDeal(id, { id: 'HACK' });
    assert.equal(pipe.getDeal(id).id, id);
  });
});

describe('CRM pipeline — stage transitions', function () {

  test('07: updateStage appends to history and resets stage_entered_at', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 50 });
    clock.advanceDays(3);
    pipe.updateStage(id, 'Qualified', 'warm lead');
    const d = pipe.getDeal(id);
    assert.equal(d.stage, 'Qualified');
    assert.equal(d.stage_history.length, 2);
    assert.equal(d.stage_history[1].stage, 'Qualified');
    assert.equal(d.probability, 0.25);
  });

  test('08: updateStage → Won closes the deal, records actual_value', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 1000 });
    clock.advanceDays(10);
    pipe.updateStage(id, 'Won', 'signed contract');
    const d = pipe.getDeal(id);
    assert.equal(d.stage, 'Won');
    assert.equal(d.won, true);
    assert.equal(d.actual_value, 1000);
    assert.ok(d.closed_at != null);
    // cannot transition a closed deal
    assert.throws(function () { pipe.updateStage(id, 'Lead'); }, /closed/);
  });

  test('09: updateStage → Lost records reason and zero actual value', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 800 });
    pipe.updateStage(id, 'Lost', 'price too high');
    const d = pipe.getDeal(id);
    assert.equal(d.stage, 'Lost');
    assert.equal(d.won, false);
    assert.equal(d.lost_reason, 'price too high');
    assert.equal(d.actual_value, 0);
  });

  test('10: updateStage rejects invalid stage names', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    assert.throws(function () { pipe.updateStage(id, 'Frozen'); }, /stage/);
  });
});

describe('CRM pipeline — activities & reminders', function () {

  test('11: logActivity attaches the activity to the deal', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10, owner: 'sara' });
    const actId = pipe.logActivity(id, {
      type: 'call',
      subject: 'intro call',
      duration_minutes: 20,
      outcome: 'interested',
      completed: true,
    });
    assert.match(actId, /^ACT_/);
    const acts = pipe.listActivities(id);
    assert.equal(acts.length, 1);
    assert.equal(acts[0].type, 'call');
    assert.equal(acts[0].duration_minutes, 20);
  });

  test('12: logActivity rejects unknown activity type', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    assert.throws(function () {
      pipe.logActivity(id, { type: 'smoke-signal' });
    }, /activity/);
  });

  test('13: dueFollowUps surfaces activities whose reminder_at has passed', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    pipe.logActivity(id, {
      type: 'task',
      subject: 'send proposal',
      reminder_at: BASE + 2 * DAY_MS,
    });
    // not yet due
    assert.equal(pipe.dueFollowUps().length, 0);
    clock.advanceDays(3);
    const due = pipe.dueFollowUps();
    assert.equal(due.length, 1);
    assert.equal(due[0].subject, 'send proposal');
    assert.equal(due[0].deal_title, 'A');
  });

  test('14: calendarEvents only returns call/meeting/task inside window', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10, owner: 'tal' });
    pipe.logActivity(id, { type: 'meeting', datetime: BASE + DAY_MS, duration_minutes: 60, subject: 'kickoff' });
    pipe.logActivity(id, { type: 'note',    datetime: BASE + DAY_MS, body: 'offline note' });
    pipe.logActivity(id, { type: 'call',    datetime: BASE + 10 * DAY_MS, subject: 'status' });
    const events = pipe.calendarEvents(BASE, BASE + 5 * DAY_MS);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'meeting');
    assert.equal(events[0].end - events[0].start, 60 * 60000);
  });
});

describe('CRM pipeline — pipelineView + listing', function () {

  test('15: pipelineView groups deals by stage and computes totals', function () {
    const { pipe } = newPipeline();
    pipe.createDeal({ title: 'D1', value: 1000, owner: 'sara' });
    const d2 = pipe.createDeal({ title: 'D2', value: 2000, owner: 'sara' });
    pipe.updateStage(d2, 'Qualified');
    const d3 = pipe.createDeal({ title: 'D3', value: 4000, owner: 'dan' });
    pipe.updateStage(d3, 'Proposal');
    const view = pipe.pipelineView();
    assert.equal(view.stages.length, 6);
    const byKey = {};
    for (let i = 0; i < view.stages.length; i += 1) byKey[view.stages[i].stage] = view.stages[i];
    assert.equal(byKey.Lead.count, 1);
    assert.equal(byKey.Qualified.count, 1);
    assert.equal(byKey.Proposal.count, 1);
    assert.equal(byKey.Lead.total_value, 1000);
    assert.equal(byKey.Proposal.total_value, 4000);
    // weighted: proposal prob 0.45 → 1800
    assert.ok(Math.abs(byKey.Proposal.weighted_value - 1800) < 0.01);
    assert.equal(view.totals.count, 3);
    assert.equal(view.totals.total_value, 7000);
  });

  test('16: listByOwner returns only the owner\'s deals, newest first', function () {
    const { pipe, clock } = newPipeline();
    pipe.createDeal({ title: 'old',  value: 100, owner: 'sara' });
    clock.advanceDays(1);
    pipe.createDeal({ title: 'new',  value: 200, owner: 'sara' });
    pipe.createDeal({ title: 'dan1', value: 300, owner: 'dan' });
    const sara = pipe.listByOwner('sara');
    assert.equal(sara.length, 2);
    assert.equal(sara[0].title, 'new');
  });
});

describe('CRM pipeline — forecast', function () {

  test('17: forecast returns committed + best_case + pipeline + weighted', function () {
    const { pipe, clock } = newPipeline();
    // two open deals expected to close this month
    const d1 = pipe.createDeal({
      title: 'Won deal',
      value: 500,
      expected_close_date: BASE + 5 * DAY_MS,
    });
    pipe.updateStage(d1, 'Won', 'done');
    pipe.createDeal({
      title: 'Proposal deal',
      value: 1000,
      stage: 'Proposal',
      expected_close_date: BASE + 10 * DAY_MS,
    });
    const d3 = pipe.createDeal({
      title: 'Neg deal',
      value: 2000,
      expected_close_date: BASE + 15 * DAY_MS,
    });
    pipe.updateStage(d3, 'Qualified');
    pipe.updateStage(d3, 'Proposal');
    pipe.updateStage(d3, 'Negotiation');
    const f = pipe.forecast('month');
    assert.equal(f.committed, 500);
    // best case = committed(500) + proposal(1000) + negotiation(2000) = 3500
    assert.equal(f.best_case, 3500);
    // pipeline = open deals expected this month = 1000 + 2000 = 3000
    assert.equal(f.pipeline, 3000);
    // weighted = 1000*0.45 + 2000*0.70 = 450 + 1400 = 1850
    assert.ok(Math.abs(f.weighted - 1850) < 0.01);
    // (void from unused var — keep d1 reference)
    assert.ok(d1);
  });

  test('18: forecast skips deals outside the period', function () {
    const { pipe } = newPipeline();
    pipe.createDeal({
      title: 'next month',
      value: 1000,
      stage: 'Proposal',
      expected_close_date: BASE + 60 * DAY_MS,
    });
    const f = pipe.forecast('month');
    assert.equal(f.pipeline, 0);
    assert.equal(f.committed, 0);
    assert.equal(f.weighted, 0);
  });
});

describe('CRM pipeline — velocity', function () {

  test('19: velocityReport computes average days per stage', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 100 });
    clock.advanceDays(2);
    pipe.updateStage(id, 'Qualified');
    clock.advanceDays(3);
    pipe.updateStage(id, 'Proposal');
    clock.advanceDays(5);
    pipe.updateStage(id, 'Negotiation');
    clock.advanceDays(4);
    pipe.updateStage(id, 'Won');
    const vr = pipe.velocityReport('year');
    const by = {};
    for (let i = 0; i < vr.stages.length; i += 1) by[vr.stages[i].stage] = vr.stages[i];
    // Lead lasted 2 days, Qualified 3, Proposal 5, Negotiation 4
    assert.ok(Math.abs(by.Lead.avg_days - 2) < 0.01);
    assert.ok(Math.abs(by.Qualified.avg_days - 3) < 0.01);
    assert.ok(Math.abs(by.Proposal.avg_days - 5) < 0.01);
    assert.ok(Math.abs(by.Negotiation.avg_days - 4) < 0.01);
    // total 14 days
    assert.ok(Math.abs(vr.overall_days - 14) < 0.01);
    assert.equal(vr.closed_deals, 1);
  });
});

describe('CRM pipeline — win/loss analysis', function () {

  test('20: winLossAnalysis aggregates by source and reason', function () {
    const { pipe } = newPipeline();
    // Won via referral
    const a = pipe.createDeal({ title: 'A', value: 1000, source: 'referral' });
    pipe.updateStage(a, 'Won');
    const b = pipe.createDeal({ title: 'B', value: 500, source: 'referral' });
    pipe.updateStage(b, 'Won');
    // Lost via website
    const c = pipe.createDeal({ title: 'C', value: 800, source: 'website' });
    pipe.updateStage(c, 'Lost', 'price too high');
    const d = pipe.createDeal({ title: 'D', value: 700, source: 'website' });
    pipe.updateStage(d, 'Lost', 'timing');
    // Lost via referral with same reason
    const e = pipe.createDeal({ title: 'E', value: 200, source: 'referral' });
    pipe.updateStage(e, 'Lost', 'price too high');
    const an = pipe.winLossAnalysis('year');
    assert.equal(an.wins, 2);
    assert.equal(an.losses, 3);
    assert.equal(an.won_value, 1500);
    assert.equal(an.lost_value, 1700);
    // 2/5 = 0.4
    assert.ok(Math.abs(an.win_rate - 0.4) < 0.001);
    // by source: referral won 2 lost 1 (win_rate 2/3 = 0.667)
    const referral = an.by_source.find(function (x) { return x.source === 'referral'; });
    assert.equal(referral.won, 2);
    assert.equal(referral.lost, 1);
    assert.ok(Math.abs(referral.win_rate - 0.667) < 0.002);
    // reasons sorted by count — 'price too high' = 2
    assert.equal(an.by_reason[0].reason, 'price too high');
    assert.equal(an.by_reason[0].count, 2);
  });
});

describe('CRM pipeline — forecast accuracy', function () {

  test('21: forecastAccuracy computes MAPE + bias vs created-stage probability', function () {
    const { pipe } = newPipeline();
    // Deal created at Lead (prob 0.10) value 1000 → forecast = 100
    // Actual win 1000 → err = +900
    const a = pipe.createDeal({ title: 'A', value: 1000 });
    pipe.updateStage(a, 'Won');
    // Deal created at Lead value 500 → forecast = 50
    // Lost → actual 0 → err = -50
    const b = pipe.createDeal({ title: 'B', value: 500 });
    pipe.updateStage(b, 'Lost', 'no budget');
    const acc = pipe.forecastAccuracy(365);
    assert.equal(acc.samples, 2);
    assert.equal(acc.forecast_total, 150); // 100 + 50
    assert.equal(acc.actual_total, 1000);
    // MAPE = (|900| + |-50|) / 150 = 950/150 ≈ 6.333
    assert.ok(Math.abs(acc.mape - 6.333) < 0.01);
  });
});

describe('CRM pipeline — stale detection', function () {

  test('22: staleDeals surfaces open deals above threshold', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'stuck', value: 10 });
    // 20 days no movement, threshold 14
    clock.advanceDays(20);
    const stale = pipe.staleDeals(14);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].id, id);
    assert.ok(stale[0].stage_age_days >= 20);
    assert.ok(stale[0].warning_he.indexOf('תקועה') >= 0);
    assert.ok(stale[0].warning_en.indexOf('stale') >= 0);
  });

  test('23: staleDeals ignores closed deals', function () {
    const { pipe, clock } = newPipeline();
    const id = pipe.createDeal({ title: 'done', value: 10 });
    pipe.updateStage(id, 'Won');
    clock.advanceDays(40);
    const stale = pipe.staleDeals(14);
    assert.equal(stale.length, 0);
  });
});

describe('CRM pipeline — auto-progression rules', function () {

  test('24: Lead → Qualified after a completed meeting', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    pipe.logActivity(id, {
      type: 'meeting', subject: 'discovery', completed: true,
    });
    const applied = pipe.autoProgressRules();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].to, 'Qualified');
    assert.equal(pipe.getDeal(id).stage, 'Qualified');
  });

  test('25: custom rule overrides defaults and is applied only to matching deals', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 10 });
    const applied = pipe.autoProgressRules([
      function forceNegotiation(deal) {
        if (deal.stage === 'Lead') {
          return { newStage: 'Negotiation', comment: 'fast path' };
        }
        return null;
      },
    ]);
    assert.equal(applied.length, 1);
    assert.equal(pipe.getDeal(id).stage, 'Negotiation');
  });
});

describe('CRM pipeline — email templates', function () {

  test('26: renderEmail fills Hebrew template by default', function () {
    const { pipe } = newPipeline();
    const out = pipe.renderEmail('intro', {
      name: 'שרה',
      company: 'טכנו-קול',
      deal_title: 'מערכת ERP',
      owner: 'דני',
    });
    assert.equal(out.lang, 'he');
    assert.ok(out.subject.indexOf('טכנו-קול') >= 0);
    assert.ok(out.body.indexOf('שרה') >= 0);
  });

  test('27: renderEmail supports English variant', function () {
    const { pipe } = newPipeline();
    const out = pipe.renderEmail('followup', {
      lang: 'en',
      name: 'Sarah',
      deal_title: 'ERP system',
      value: 10000,
      owner: 'Dani',
    });
    assert.equal(out.lang, 'en');
    assert.ok(out.subject.indexOf('ERP system') >= 0);
    assert.ok(out.body.indexOf('Sarah') >= 0);
    assert.ok(out.body.indexOf('10000') >= 0);
  });

  test('28: renderEmail throws on unknown template', function () {
    const { pipe } = newPipeline();
    assert.throws(function () { pipe.renderEmail('unknown', {}); }, /template/);
  });
});

describe('CRM pipeline — immutability & never-delete', function () {

  test('29: returned deal objects are shallow copies — mutations do not affect state', function () {
    const { pipe } = newPipeline();
    const id = pipe.createDeal({ title: 'A', value: 100, tags: ['hot'] });
    const copy = pipe.getDeal(id);
    copy.value = 9999;
    copy.tags.push('mutated');
    const fresh = pipe.getDeal(id);
    assert.equal(fresh.value, 100);
    assert.deepEqual(fresh.tags, ['hot']);
  });

  test('30: there is no deleteDeal export (never-delete rule)', function () {
    const { pipe } = newPipeline();
    assert.equal(pipe.deleteDeal, undefined);
    assert.equal(pipe.removeDeal, undefined);
    assert.equal(pipe.purgeDeal, undefined);
  });
});

describe('CRM pipeline — contacts', function () {

  test('31: addContact + getContact round-trip', function () {
    const { pipe } = newPipeline();
    const cid = pipe.addContact({
      name: 'רונית כהן',
      role: 'רכש',
      phone: '03-1234567',
      email: 'ronit@example.co.il',
      client_id: 'CL007',
    });
    assert.match(cid, /^CONTACT_/);
    const c = pipe.getContact(cid);
    assert.equal(c.name, 'רונית כהן');
    assert.equal(c.client_id, 'CL007');
    // addContact rejects missing name
    assert.throws(function () { pipe.addContact({}); }, /name/);
  });
});

describe('CRM pipeline — snapshot & bilingual coverage', function () {

  test('32: snapshot contains all state and every stage has bilingual labels', function () {
    const { pipe } = newPipeline();
    pipe.createDeal({ title: 'A', value: 10 });
    pipe.addContact({ name: 'X' });
    const snap = pipe.snapshot();
    assert.equal(snap.deals.length, 1);
    assert.equal(snap.contacts.length, 1);
    assert.equal(snap.stages.length, 6);
    for (let i = 0; i < snap.stages.length; i += 1) {
      const s = snap.stages[i];
      assert.ok(s.label_he.length > 0);
      assert.ok(s.label_en.length > 0);
    }
  });
});
