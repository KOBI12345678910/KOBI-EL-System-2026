/**
 * Win / Loss Analyzer — Unit Tests
 * Agent Y-025 — Sales swarm — Techno-Kol Uzi Mega-ERP / onyx-procurement
 *
 * Run with:   node --test test/sales/win-loss.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * Rule reminder: לא מוחקים רק משדרגים ומגדלים — the analyzer's ledger is
 * append-only, so the test suite verifies that every recordOutcome call is
 * preserved in history even when the same opportunityId is replayed.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  WinLossAnalyzer,
  CAUSE_CATALOG,
  HEBREW_GLOSSARY,
  __internal__,
} = require(path.resolve(__dirname, '..', '..', 'src', 'sales', 'win-loss.js'));

// ─── fixtures ───────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-11T09:00:00Z');
const nowFn = () => FIXED_NOW;

function buildAnalyzer() {
  const a = new WinLossAnalyzer({
    now: nowFn,
    opportunities: [
      { opportunityId: 'OPP-1001', accountName: 'Teva Labs', industry: 'pharma', size: 'enterprise', region: 'north', product: 'ERP' },
      { opportunityId: 'OPP-1002', accountName: 'Yofi Manufacturing', industry: 'manufacturing', size: 'smb', region: 'south', product: 'ERP' },
      { opportunityId: 'OPP-1003', accountName: 'Shilo Logistics', industry: 'logistics', size: 'mid', region: 'center', product: 'ERP' },
      { opportunityId: 'OPP-1004', accountName: 'NorthStar Retail', industry: 'retail', size: 'enterprise', region: 'north', product: 'POS' },
      { opportunityId: 'OPP-1005', accountName: 'Galil Foods', industry: 'food', size: 'smb', region: 'north', product: 'ERP' },
      { opportunityId: 'OPP-1006', accountName: 'Atid Bank', industry: 'finance', size: 'enterprise', region: 'center', product: 'ERP' },
      { opportunityId: 'OPP-1007', accountName: 'Hof Hotels', industry: 'hospitality', size: 'mid', region: 'south', product: 'ERP' },
      { opportunityId: 'OPP-1008', accountName: 'Keshet Retail', industry: 'retail', size: 'smb', region: 'center', product: 'POS' },
    ],
  });
  return a;
}

function seed(a) {
  a.recordOutcome('OPP-1001', {
    outcome: 'won',
    closedAt: '2026-01-15T00:00:00Z',
    value: 120000,
    causes: [
      { category: 'features', subCategory: 'must_have', notes: 'demand forecasting' },
      { category: 'relationship', subCategory: 'strong_champion' },
    ],
  });
  a.recordOutcome('OPP-1002', {
    outcome: 'lost',
    closedAt: '2026-01-22T00:00:00Z',
    value: 45000,
    competitor: 'Priority',
    causes: [
      { category: 'price', subCategory: 'too_high' },
      { category: 'competitor', subCategory: 'incumbent', competitor: 'Priority' },
    ],
  });
  a.recordOutcome('OPP-1003', {
    outcome: 'lost',
    closedAt: '2026-02-05T00:00:00Z',
    value: 80000,
    competitor: 'Priority',
    causes: [{ category: 'price', subCategory: 'too_high' }],
  });
  a.recordOutcome('OPP-1004', {
    outcome: 'won',
    closedAt: '2026-02-12T00:00:00Z',
    value: 250000,
    causes: [{ category: 'competitor', subCategory: 'out_featured', competitor: 'SAP' }],
  });
  a.recordOutcome('OPP-1005', {
    outcome: 'lost',
    closedAt: '2026-02-18T00:00:00Z',
    value: 35000,
    competitor: 'Comax',
    causes: [
      { category: 'features', subCategory: 'missing_feature' },
      { category: 'timing', subCategory: 'too_late' },
    ],
  });
  a.recordOutcome('OPP-1006', {
    outcome: 'lost',
    closedAt: '2026-03-01T00:00:00Z',
    value: 300000,
    competitor: 'SAP',
    causes: [
      { category: 'competitor', subCategory: 'better_demo', competitor: 'SAP' },
      { category: 'relationship', subCategory: 'no_exec_sponsor' },
    ],
  });
  a.recordOutcome('OPP-1007', {
    outcome: 'won',
    closedAt: '2026-03-10T00:00:00Z',
    value: 90000,
    causes: [{ category: 'price', subCategory: 'competitive_bid' }],
  });
  a.recordOutcome('OPP-1008', {
    outcome: 'lost',
    closedAt: '2026-03-20T00:00:00Z',
    value: 25000,
    competitor: 'Comax',
    causes: [{ category: 'price', subCategory: 'too_high' }],
  });
  return a;
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('causeCatalog exposes bilingual hierarchical taxonomy', () => {
  const a = new WinLossAnalyzer({ now: nowFn });
  const cat = a.causeCatalog();
  // Every required top-level category exists
  for (const key of ['price', 'features', 'timing', 'relationship', 'competitor', 'budget_cut', 'no_decision']) {
    assert.ok(cat[key], `missing category ${key}`);
    assert.equal(typeof cat[key].he, 'string');
    assert.equal(typeof cat[key].en, 'string');
    assert.ok(cat[key].subCategories && typeof cat[key].subCategories === 'object');
  }
  // Bilingual labels exist on sub-categories
  assert.equal(cat.price.subCategories.too_high.he, 'יקר מדי');
  assert.equal(cat.price.subCategories.too_high.en, 'Too high');

  // Catalog must be a deep copy — mutating it must not affect subsequent calls
  cat.price.subCategories.too_high.he = 'MUTATED';
  const fresh = a.causeCatalog();
  assert.equal(fresh.price.subCategories.too_high.he, 'יקר מדי');
});

test('recordOutcome is append-only and preserves history (לא מוחקים)', () => {
  const a = buildAnalyzer();
  a.recordOutcome('OPP-2001', {
    outcome: 'lost',
    closedAt: '2026-02-01T00:00:00Z',
    causes: [{ category: 'price', subCategory: 'too_high' }],
  });
  // Replay the same opportunityId — the old record must remain in the
  // ledger. The analyzer uses the most recent entry for aggregates, but
  // the audit history is intact.
  a.recordOutcome('OPP-2001', {
    outcome: 'won',
    closedAt: '2026-02-15T00:00:00Z',
    causes: [{ category: 'features', subCategory: 'must_have' }],
  });
  const all = a.getRecords();
  assert.equal(all.length, 2, 'both outcomes preserved');
  assert.equal(all[0].outcome, 'lost');
  assert.equal(all[1].outcome, 'won');
});

test('recordOutcome rejects invalid inputs', () => {
  const a = new WinLossAnalyzer({ now: nowFn });
  assert.throws(() => a.recordOutcome('', { outcome: 'won', causes: [] }), TypeError);
  assert.throws(() => a.recordOutcome('OPP-1', null), TypeError);
  assert.throws(
    () => a.recordOutcome('OPP-1', { outcome: 'draw', causes: [] }),
    RangeError,
  );
});

test('topCauses aggregates and ranks by count', () => {
  const a = seed(buildAnalyzer());
  const losses = a.topCauses('lost');
  assert.ok(losses.length > 0);
  // price/too_high appears on OPP-1002, OPP-1003, OPP-1008 → 3 times
  const priceTooHigh = losses.find(
    (r) => r.category === 'price' && r.subCategory === 'too_high',
  );
  assert.ok(priceTooHigh, 'price/too_high must be ranked');
  assert.equal(priceTooHigh.count, 3);
  // Ranked descending
  for (let i = 1; i < losses.length; i += 1) {
    assert.ok(losses[i - 1].count >= losses[i].count, 'sorted desc by count');
  }
  // Bilingual labels attached
  assert.ok(priceTooHigh.labels.he.includes('מחיר'));
  assert.ok(priceTooHigh.labels.en.includes('Price'));
});

test('topCauses honours period filter', () => {
  const a = seed(buildAnalyzer());
  const feb = a.topCauses('lost', { from: '2026-02-01', to: '2026-02-28' });
  // Only OPP-1003 and OPP-1005 closed in February
  const count = feb.reduce((s, r) => s + r.count, 0);
  // OPP-1003: 1 cause (price/too_high)
  // OPP-1005: 2 causes (features/missing_feature, timing/too_late)
  assert.equal(count, 3);
});

test('topCauses also works for wins', () => {
  const a = seed(buildAnalyzer());
  const wins = a.topCauses('won');
  const musthave = wins.find(
    (r) => r.category === 'features' && r.subCategory === 'must_have',
  );
  assert.ok(musthave);
  assert.equal(musthave.count, 1);
});

test('competitorAnalysis computes win rate per competitor', () => {
  const a = seed(buildAnalyzer());
  const comps = a.competitorAnalysis();
  const priority = comps.find((c) => c.competitor === 'Priority');
  const sap = comps.find((c) => c.competitor === 'SAP');
  const comax = comps.find((c) => c.competitor === 'Comax');
  assert.ok(priority && sap && comax);

  // Priority: 2 losses, 0 wins (OPP-1002, OPP-1003)
  assert.equal(priority.wins, 0);
  assert.equal(priority.losses, 2);
  assert.equal(priority.winRate, 0);

  // SAP: 1 win (OPP-1004), 1 loss (OPP-1006)
  assert.equal(sap.wins, 1);
  assert.equal(sap.losses, 1);
  assert.equal(sap.winRate, 0.5);

  // Comax: 0 wins, 2 losses (OPP-1005, OPP-1008)
  assert.equal(comax.wins, 0);
  assert.equal(comax.losses, 2);
  assert.equal(comax.winRate, 0);

  // shareOfLosses sums to ~1 across non-empty competitor rows with losses
  const lossShares = comps
    .filter((c) => c.losses > 0 && c.competitor !== '(unknown)')
    .reduce((s, c) => s + c.shareOfLosses, 0);
  assert.ok(Math.abs(lossShares - 1) < 1e-6, 'loss shares sum to 1');
});

test('competitorAnalysis is period-scoped', () => {
  const a = seed(buildAnalyzer());
  const jan = a.competitorAnalysis({ from: '2026-01-01', to: '2026-01-31' });
  // Only OPP-1002 closed in January → Priority has 1 loss, nothing else
  const priority = jan.find((c) => c.competitor === 'Priority');
  assert.ok(priority);
  assert.equal(priority.total, 1);
  assert.equal(priority.losses, 1);
});

test('segmentAnalysis breaks down win rate per dimension', () => {
  const a = seed(buildAnalyzer());
  const byIndustry = a.segmentAnalysis({ dimension: 'industry' });
  // pharma: 1 win (Teva)  → 100%
  const pharma = byIndustry.find((r) => r.segment === 'pharma');
  assert.ok(pharma);
  assert.equal(pharma.wins, 1);
  assert.equal(pharma.losses, 0);
  assert.equal(pharma.winRate, 1);
  // retail: 1 win (NorthStar), 1 loss (Keshet) → 50%
  const retail = byIndustry.find((r) => r.segment === 'retail');
  assert.ok(retail);
  assert.equal(retail.winRate, 0.5);

  const bySize = a.segmentAnalysis({ dimension: 'size' });
  const enterprise = bySize.find((r) => r.segment === 'enterprise');
  // enterprise deals: OPP-1001 won, OPP-1004 won, OPP-1006 lost → 2/3
  assert.ok(enterprise);
  assert.equal(enterprise.total, 3);
  assert.equal(enterprise.wins, 2);
  assert.equal(enterprise.losses, 1);
  assert.ok(Math.abs(enterprise.winRate - 2 / 3) < 1e-3);

  const byRegion = a.segmentAnalysis({ dimension: 'region' });
  assert.ok(byRegion.length >= 3);

  assert.throws(() => a.segmentAnalysis({ dimension: 'color' }), RangeError);
});

test('segmentAnalysis surfaces unknown segments rather than dropping them', () => {
  const a = new WinLossAnalyzer({ now: nowFn });
  // No metadata → segment bucket is '(unknown)'
  a.recordOutcome('OPP-X', {
    outcome: 'lost',
    closedAt: '2026-02-10T00:00:00Z',
    causes: [{ category: 'price', subCategory: 'too_high' }],
  });
  const rows = a.segmentAnalysis({ dimension: 'industry' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].segment, '(unknown)');
  assert.equal(rows[0].losses, 1);
});

test('lossPatterns identifies at-risk cohorts with positive lift', () => {
  const a = seed(buildAnalyzer());
  const result = a.lossPatterns();
  assert.ok(result.globalLossRate > 0);
  assert.ok(Array.isArray(result.patterns));
  assert.ok(result.patterns.length > 0);

  // Priority and Comax are 100% loss cohorts → should appear with positive lift
  const riskyCompetitors = result.patterns.filter(
    (p) => p.traitType === 'competitor' && p.trait !== '(unknown)',
  );
  assert.ok(riskyCompetitors.length > 0);

  // Top pattern is sorted by lift desc
  for (let i = 1; i < result.patterns.length; i += 1) {
    assert.ok(
      result.patterns[i - 1].lift >= result.patterns[i].lift,
      'patterns sorted by lift desc',
    );
  }
});

test('interviewTemplate generates a Hebrew script with expected sections', () => {
  const a = seed(buildAnalyzer());
  const script = a.interviewTemplate('OPP-1002');
  assert.equal(script.opportunityId, 'OPP-1002');
  assert.equal(script.lang, 'he');
  assert.equal(script.suggestedDurationMinutes, 25);
  // Structure
  assert.deepEqual(script.sections, [
    'header',
    'ground_rules',
    'warm_up',
    'discovery',
    'decision_criteria',
    'competition',
    'gap',
    'advice',
    'wrap_up',
    'fields',
  ]);
  // Hebrew content present
  assert.ok(script.script.includes('תחקיר הפסד'));
  assert.ok(script.script.includes('קריטריוני החלטה'));
  assert.ok(script.script.includes('תחרות'));
  // Opportunity context (account + competitor) pre-filled
  assert.ok(script.script.includes('Yofi Manufacturing'));
  assert.ok(script.script.includes('Priority'));
  // Cause field hint carried along for the UI
  assert.ok(script.causeFieldsHint.price);
});

test('interviewTemplate falls back gracefully for unknown opportunity', () => {
  const a = new WinLossAnalyzer({ now: nowFn });
  const script = a.interviewTemplate('OPP-NEVER');
  assert.equal(script.opportunityId, 'OPP-NEVER');
  assert.ok(script.script.includes('OPP-NEVER'));
  // No account / competitor lines — must still be a valid script
  assert.ok(script.script.includes('תחקיר הפסד'));
});

test('generateReport produces bilingual summary with recommendations', () => {
  const a = seed(buildAnalyzer());
  const report = a.generateReport();
  assert.equal(report.summary.he.title, 'דוח ניצחונות והפסדים');
  assert.equal(report.summary.en.title, 'Win / Loss Report');
  assert.equal(report.summary.he.deals, 8);
  assert.equal(report.summary.he.wins, 3);
  assert.equal(report.summary.he.losses, 5);
  assert.ok(Math.abs(report.summary.he.winRate - 3 / 8) < 1e-6);
  assert.ok(Array.isArray(report.topWinCauses));
  assert.ok(Array.isArray(report.topLossCauses));
  assert.ok(Array.isArray(report.competitors));
  assert.ok(report.lossPatterns.patterns.length >= 0);
  assert.ok(Array.isArray(report.recommendations));
  assert.equal(report.ruleReminder, 'לא מוחקים רק משדרגים ומגדלים');
  assert.equal(report.glossary.won, 'ניצחון');
  assert.equal(report.glossary.lost, 'הפסד');
});

test('internal helpers behave as expected', () => {
  assert.equal(__internal__.classifyCorrelation(0.25), 'strong_loss_lift');
  assert.equal(__internal__.classifyCorrelation(0.12), 'loss_lift');
  assert.equal(__internal__.classifyCorrelation(0.05), 'mild_loss_lift');
  assert.equal(__internal__.classifyCorrelation(0), 'neutral');
  assert.equal(__internal__.classifyCorrelation(-0.25), 'strong_win_lift');
  assert.equal(__internal__.round(1 / 3, 4), 0.3333);
  assert.equal(__internal__.inPeriod('2026-02-10', { from: '2026-02-01', to: '2026-02-28' }), true);
  assert.equal(__internal__.inPeriod('2026-03-10', { from: '2026-02-01', to: '2026-02-28' }), false);
});

test('HEBREW_GLOSSARY covers required analyst vocabulary', () => {
  const required = ['won', 'lost', 'winRate', 'opportunity', 'competitor', 'segment', 'pattern'];
  for (const k of required) {
    assert.ok(HEBREW_GLOSSARY[k], `glossary missing ${k}`);
    assert.equal(typeof HEBREW_GLOSSARY[k], 'string');
  }
});
