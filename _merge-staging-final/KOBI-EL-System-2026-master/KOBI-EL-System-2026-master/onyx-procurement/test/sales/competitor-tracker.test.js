/**
 * Tests for CompetitorTracker
 * Zero-dep test runner (node --test compatible + standalone runnable)
 *
 * Covers:
 *  - battlecard generation (bilingual HE/EN, feature + price comparison,
 *    positioning, objection handlers, proof points, trap questions)
 *  - win rate calculation
 *  - intel append (non-destructive, history preserved)
 *  - SWOT auto-generation
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — verified via history/version checks.
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  CompetitorTracker,
  OUTCOMES,
  INTEL_CATEGORIES,
} = require('../../src/sales/competitor-tracker.js');

// ---------- helpers ---------------------------------------------------------

function seededTracker() {
  const t = new CompetitorTracker();
  t.defineCompetitor({
    id: 'acme',
    name: 'Acme ERP',
    website: 'https://acme.example',
    country: 'IL',
    size: 'large',
    segments: ['procurement', 'finance'],
    strengths: ['Brand recognition', 'Large installed base'],
    weaknesses: ['Slow support', 'Expensive add-ons'],
    pricingModel: 'Per-user annual',
    features: {
      'Hebrew UI':          { us: 'full', them: 'partial', advantage: 'us' },
      'Israeli tax reports': { us: 'built-in', them: 'plugin', advantage: 'us' },
      'Global presence':    { us: 'limited', them: 'extensive', advantage: 'them' },
    },
    priceBands: {
      small:  { us: 100, them: 120, currency: 'ILS' },
      medium: { us: 250, them: 300, currency: 'ILS' },
    },
  });
  return t;
}

// ---------- defineCompetitor & upgrade --------------------------------------

test('defineCompetitor stores a record with version=1', () => {
  const t = new CompetitorTracker();
  const rec = t.defineCompetitor({
    id: 'c1',
    name: 'Comp One',
    segments: ['finance'],
    strengths: ['one'],
  });
  assert.equal(rec.id, 'c1');
  assert.equal(rec.version, 1);
  assert.deepEqual(rec.segments, ['finance']);
  assert.equal(rec.history.length, 0);
});

test('defineCompetitor upgrades existing competitor, preserves old in history', () => {
  const t = new CompetitorTracker();
  t.defineCompetitor({ id: 'c1', name: 'Old Name', segments: ['finance'] });
  const v2 = t.defineCompetitor({
    id: 'c1',
    name: 'New Name',
    segments: ['finance', 'hr'],
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.name, 'New Name');
  assert.equal(v2.history.length, 1);
  assert.equal(v2.history[0].name, 'Old Name');
});

test('defineCompetitor throws on missing id or name', () => {
  const t = new CompetitorTracker();
  assert.throws(() => t.defineCompetitor({}), /id/);
  assert.throws(() => t.defineCompetitor({ id: 'x' }), /name/);
});

// ---------- recordEncounter -------------------------------------------------

test('recordEncounter stores opportunity + auto-creates stub competitor', () => {
  const t = new CompetitorTracker();
  const enc = t.recordEncounter('opp-001', 'new-comp', OUTCOMES.WON, 'demo better');
  assert.equal(enc.opportunityId, 'opp-001');
  assert.equal(enc.outcome, 'won');
  // Auto-created stub
  const c = t.getCompetitor('new-comp');
  assert.ok(c);
  assert.equal(c.name, 'new-comp');
});

test('recordEncounter rejects invalid outcome', () => {
  const t = seededTracker();
  assert.throws(
    () => t.recordEncounter('opp-1', 'acme', 'maybe'),
    /outcome must be one of/,
  );
});

// ---------- winRateVsCompetitor ---------------------------------------------

test('winRateVsCompetitor computes 60% over 5 decisive deals', () => {
  const t = seededTracker();
  t.recordEncounter('opp-1', 'acme', OUTCOMES.WON);
  t.recordEncounter('opp-2', 'acme', OUTCOMES.WON);
  t.recordEncounter('opp-3', 'acme', OUTCOMES.WON);
  t.recordEncounter('opp-4', 'acme', OUTCOMES.LOST);
  t.recordEncounter('opp-5', 'acme', OUTCOMES.LOST);
  // Non-decisive — must NOT move ratio
  t.recordEncounter('opp-6', 'acme', OUTCOMES.TIE);
  t.recordEncounter('opp-7', 'acme', OUTCOMES.NO_DECISION);

  const wr = t.winRateVsCompetitor('acme');
  assert.equal(wr.total, 7);
  assert.equal(wr.won, 3);
  assert.equal(wr.lost, 2);
  assert.equal(wr.tie, 1);
  assert.equal(wr.noDecision, 1);
  assert.equal(wr.decisive, 5);
  assert.equal(wr.winRatePct, 60);
  assert.equal(wr.winRate, 0.6);
});

test('winRateVsCompetitor returns 0 when no decisive encounters', () => {
  const t = seededTracker();
  const wr = t.winRateVsCompetitor('acme');
  assert.equal(wr.total, 0);
  assert.equal(wr.winRatePct, 0);
  assert.equal(wr.winRate, 0);
});

// ---------- getBattlecard (bilingual) ---------------------------------------

test('getBattlecard returns bilingual HE+EN with all required sections', () => {
  const t = seededTracker();
  t.recordEncounter('opp-a', 'acme', OUTCOMES.WON);
  t.recordEncounter('opp-b', 'acme', OUTCOMES.LOST);

  const bc = t.getBattlecard('acme');
  assert.equal(bc.name, 'Acme ERP');

  // Hebrew section sanity
  assert.equal(bc.he.dir, 'rtl');
  assert.equal(bc.he.lang, 'he');
  assert.ok(bc.he.title.includes('Acme ERP'));
  assert.ok(bc.he.title.includes('כרטיס קרב'));
  assert.ok(bc.he.sections['סקירה כללית']);
  assert.ok(Array.isArray(bc.he.sections['חוזקות']));
  assert.ok(bc.he.sections['חוזקות'].includes('Brand recognition'));
  assert.ok(Array.isArray(bc.he.sections['מענה להתנגדויות']));
  assert.ok(bc.he.sections['מענה להתנגדויות'].length >= 2);
  assert.ok(Array.isArray(bc.he.sections['נקודות הוכחה']));
  assert.ok(Array.isArray(bc.he.sections['שאלות מלכודת']));

  // English section sanity
  assert.equal(bc.en.dir, 'ltr');
  assert.equal(bc.en.lang, 'en');
  assert.ok(bc.en.title.includes('Battlecard'));
  assert.ok(bc.en.sections.Overview);
  assert.ok(Array.isArray(bc.en.sections.Strengths));
  assert.ok(Array.isArray(bc.en.sections['Objection Handlers']));
  assert.ok(Array.isArray(bc.en.sections['Proof Points']));
  assert.ok(Array.isArray(bc.en.sections['Trap Questions']));

  // Feature comparison
  assert.equal(bc.featureComparison.length, 3);
  const heb = bc.featureComparison.find((f) => f.feature === 'Hebrew UI');
  assert.equal(heb.advantage, 'us');

  // Price comparison with delta
  assert.equal(bc.priceComparison.length, 2);
  const small = bc.priceComparison.find((p) => p.tier === 'small');
  assert.equal(small.us, 100);
  assert.equal(small.them, 120);
  assert.ok(Math.abs(small.delta - (-16.7)) < 0.1);

  // Win rate embedded in sections (ends with %)
  assert.ok(bc.he.sections['שיעור ניצחון'].includes('%'));
  assert.ok(bc.en.sections['Win Rate'].includes('%'));
});

test('getBattlecard custom positioning overrides defaults', () => {
  const t = new CompetitorTracker();
  t.defineCompetitor({
    id: 'zeta',
    name: 'Zeta',
    positioning: { he: 'מיצוב מותאם', en: 'Custom positioning' },
  });
  const bc = t.getBattlecard('zeta');
  assert.equal(bc.positioning.he, 'מיצוב מותאם');
  assert.equal(bc.positioning.en, 'Custom positioning');
});

// ---------- updateIntel (append, never delete) ------------------------------

test('updateIntel appends entries, preserves history, bumps version', () => {
  const t = seededTracker();
  const before = t.getCompetitor('acme');
  const startVersion = before.version;

  t.updateIntel('acme', {
    category: INTEL_CATEGORIES.NEWS,
    summary: { he: 'חדשות: הודעה על דור חדש', en: 'News: new generation announced' },
    source: 'Globes',
  });

  t.updateIntel('acme', {
    category: INTEL_CATEGORIES.PRICING_CHANGE,
    summary: 'Pricing increased 10%',
    delta: {
      priceBands: {
        large: { us: 400, them: 500, currency: 'ILS' },
      },
    },
  });

  const intel = t.listIntel('acme');
  assert.equal(intel.length, 2);
  assert.equal(intel[0].category, 'news');
  assert.equal(intel[1].category, 'pricing_change');

  // Second update normalizes string summary to {he, en}
  assert.equal(intel[1].summary.he, 'Pricing increased 10%');
  assert.equal(intel[1].summary.en, 'Pricing increased 10%');

  // Competitor record upgraded — history must grow, NOT be wiped
  const after = t.getCompetitor('acme');
  assert.equal(after.version, startVersion + 2);
  assert.equal(after.history.length, 2);
  assert.equal(after.history[0].version, startVersion);

  // Structured delta applied: price band added
  assert.ok(after.priceBands.large);
  assert.equal(after.priceBands.large.us, 400);
  assert.equal(after.priceBands.large.them, 500);
});

test('updateIntel throws on unknown competitor', () => {
  const t = new CompetitorTracker();
  assert.throws(
    () => t.updateIntel('ghost', { category: 'news', summary: 'x' }),
    /Competitor not found/,
  );
});

test('updateIntel throws on missing category or summary', () => {
  const t = seededTracker();
  assert.throws(() => t.updateIntel('acme', {}), /category/);
  assert.throws(
    () => t.updateIntel('acme', { category: 'news' }),
    /summary/,
  );
});

// ---------- listActiveCompetitors -------------------------------------------

test('listActiveCompetitors filters by segment and recency', () => {
  const t = seededTracker();
  t.defineCompetitor({
    id: 'beta',
    name: 'Beta',
    segments: ['hr'],
  });

  // Acme is active (we add encounter)
  t.recordEncounter('opp-1', 'acme', OUTCOMES.WON);

  const activeFinance = t.listActiveCompetitors('finance');
  assert.equal(activeFinance.length, 1);
  assert.equal(activeFinance[0].id, 'acme');

  // Beta has no encounter, no intel — not active
  const activeHr = t.listActiveCompetitors('hr');
  assert.equal(activeHr.length, 0);

  // After adding intel, beta becomes active
  t.updateIntel('beta', {
    category: INTEL_CATEGORIES.NEWS,
    summary: 'new hire',
  });
  const activeHr2 = t.listActiveCompetitors('hr');
  assert.equal(activeHr2.length, 1);
  assert.equal(activeHr2[0].id, 'beta');

  // No segment = all active competitors
  const all = t.listActiveCompetitors();
  assert.equal(all.length, 2);
});

// ---------- generateSWOT ----------------------------------------------------

test('generateSWOT produces bilingual SWOT with all four quadrants', () => {
  const t = seededTracker();

  // Strong win rate (4/5 = 80%)
  t.recordEncounter('o1', 'acme', OUTCOMES.WON);
  t.recordEncounter('o2', 'acme', OUTCOMES.WON);
  t.recordEncounter('o3', 'acme', OUTCOMES.WON);
  t.recordEncounter('o4', 'acme', OUTCOMES.WON);
  t.recordEncounter('o5', 'acme', OUTCOMES.LOST);

  // Opportunity-generating intel
  t.updateIntel('acme', { category: INTEL_CATEGORIES.LAYOFF, summary: 'layoffs' });
  t.updateIntel('acme', { category: INTEL_CATEGORIES.CUSTOMER_LOSS, summary: 'lost big customer' });
  t.updateIntel('acme', { category: INTEL_CATEGORIES.PRICING_CHANGE, summary: 'price up' });

  // Threat-generating intel
  t.updateIntel('acme', { category: INTEL_CATEGORIES.FUNDING, summary: 'new round' });
  t.updateIntel('acme', { category: INTEL_CATEGORIES.PRODUCT_LAUNCH, summary: 'new product' });

  const swot = t.generateSWOT('acme');

  // Bilingual shape
  assert.ok(swot.he);
  assert.ok(swot.en);
  assert.equal(swot.he.dir, 'rtl');
  assert.equal(swot.en.dir, 'ltr');
  assert.ok(swot.he.title.includes('Acme ERP'));
  assert.ok(swot.en.title.includes('Acme ERP'));

  // Must produce non-empty buckets given the seeded data
  assert.ok(swot.he.strengths.length > 0,     'HE strengths');
  assert.ok(swot.he.weaknesses.length > 0,    'HE weaknesses');
  assert.ok(swot.he.opportunities.length > 0, 'HE opportunities');
  assert.ok(swot.he.threats.length > 0,       'HE threats');

  assert.ok(swot.en.strengths.length > 0);
  assert.ok(swot.en.weaknesses.length > 0);
  assert.ok(swot.en.opportunities.length > 0);
  assert.ok(swot.en.threats.length > 0);

  // The LAYOFF intel must surface as opportunity in both languages
  const hasLayoffOpp = swot.en.opportunities.some((x) =>
    /layoff/i.test(x) || /poach/i.test(x),
  );
  assert.ok(hasLayoffOpp);

  // Since win rate 80% decisive 5, the "we win X% of deals" weakness (for them)
  // should appear in weaknesses bucket
  const hasWinWeakness = swot.en.weaknesses.some((x) => /win/i.test(x));
  assert.ok(hasWinWeakness);

  // Funding intel must surface as threat
  const hasFundingThreat = swot.en.threats.some((x) => /funding|firepower/i.test(x));
  assert.ok(hasFundingThreat);

  // Score clamped -100..100
  assert.ok(swot.score >= -100 && swot.score <= 100);

  // Summary bilingual
  assert.ok(typeof swot.he.summary === 'string' && swot.he.summary.length > 0);
  assert.ok(typeof swot.en.summary === 'string' && swot.en.summary.length > 0);

  // raw payload contains counts
  assert.ok(swot.raw.categoryCounts.layoff === 1);
  assert.ok(swot.raw.categoryCounts.funding === 1);
  assert.equal(swot.raw.winStats.winRatePct, 80);
});

// ---------- non-destructive guarantee ---------------------------------------

test('no delete — every mutation is additive / upgradable', () => {
  const t = seededTracker();

  t.recordEncounter('o1', 'acme', OUTCOMES.WON);
  t.updateIntel('acme', { category: 'news', summary: 'hi' });
  t.defineCompetitor({
    id: 'acme', name: 'Acme ERP v2',
    segments: ['procurement', 'finance', 'inventory'],
  });

  // Audit log captures everything
  const log = t.getAuditLog();
  assert.ok(log.length >= 3);
  assert.equal(log[0].action, 'defineCompetitor');

  // Stats
  const stats = t.getStats();
  assert.equal(stats.competitorCount, 1);
  assert.equal(stats.encounterCount, 1);
  assert.equal(stats.intelEntryCount, 1);
  assert.ok(stats.auditLogSize >= 3);

  // History preserved on upgrades
  const rec = t.getCompetitor('acme');
  assert.ok(rec.version >= 2);
  assert.ok(rec.history.length >= 1);
});
