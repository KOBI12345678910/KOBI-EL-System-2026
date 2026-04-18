/**
 * Customer Advocacy Program — Unit Tests
 * Agent Y-105 • Techno-Kol Uzi • Swarm Customer Success
 *
 * Run with:
 *    node --test onyx-procurement/test/customer/advocacy.test.js
 *
 * Zero external dependencies. Covers:
 *   - eligibility filtering (NPS / health / tenure / contract size)
 *   - nomination validation + idempotency
 *   - consent: grant, revoke, expiry, per-use
 *   - reference request gating (fatigue + consent)
 *   - fatigue prevention: quarterly cap, heavy cap, cool-downs
 *   - engagement tracking
 *   - reward issuance
 *   - case-study pipeline (intake → draft → customer-review → legal-review → publish)
 *   - quote library (approved vs pending)
 *   - reference matching (never overloads)
 *   - hall of fame
 *   - bilingual reference deck
 *   - append-only ledger invariant
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'customer', 'advocacy.js',
));
const {
  AdvocacyProgram,
  CONSTANTS,
  LABELS_HE,
  CASE_STUDY_STAGES,
  REQUEST_FORMATS,
  REWARD_TYPES,
} = mod;

// ─── Fixtures ───────────────────────────────────────────────────────
function newEngine() {
  return new AdvocacyProgram();
}

function seed(eng, overrides = {}) {
  return eng.seedCustomer({
    id: 'cust-100',
    name: 'Rimon Industries Ltd.',
    nameHe: 'רימון תעשיות בע"מ',
    nps: 10,
    healthScore: 92,
    tenureMonths: 18,
    contractSize: 180_000,
    industry: 'construction',
    language: 'he',
    churnRisk: 0.05,
    ...overrides,
  });
}

function fullyNominate(eng, customerOverrides = {}) {
  const c = seed(eng, customerOverrides);
  const adv = eng.nominateAdvocate({
    customerId: c.id,
    nominator: 'csm-alice',
    reason: 'Renewed 3x, active community contributor',
  });
  eng.grantConsent(adv.id, 'all', { channel: 'signed-dpa' });
  return adv;
}

// ─── 1. identifyAdvocates ───────────────────────────────────────────

test('identifyAdvocates: filters by NPS, health, tenure, contract size', () => {
  const eng = newEngine();
  eng.seedCustomer({ id: 'a', nps: 10, healthScore: 95, tenureMonths: 24, contractSize: 500_000, churnRisk: 0.02 });
  eng.seedCustomer({ id: 'b', nps: 7, healthScore: 95, tenureMonths: 24, contractSize: 500_000 });
  eng.seedCustomer({ id: 'c', nps: 9, healthScore: 60, tenureMonths: 24, contractSize: 500_000 });
  eng.seedCustomer({ id: 'd', nps: 9, healthScore: 95, tenureMonths: 3, contractSize: 500_000 });
  eng.seedCustomer({ id: 'e', nps: 9, healthScore: 95, tenureMonths: 24, contractSize: 5_000 });

  const out = eng.identifyAdvocates({
    criteria: { npsMin: 9, healthMin: 80, tenureMonths: 6, contractSize: 100_000 },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].customerId, 'a');
  assert.equal(out[0].eligibilityHe, LABELS_HE.eligible);
});

test('identifyAdvocates: excludes high churn risk even if other stats are strong', () => {
  const eng = newEngine();
  eng.seedCustomer({ id: 'risky', nps: 10, healthScore: 100, tenureMonths: 36, contractSize: 1_000_000, churnRisk: 0.5 });
  const out = eng.identifyAdvocates({ criteria: { npsMin: 9, healthMin: 80, tenureMonths: 6 } });
  assert.equal(out.length, 0);
});

test('identifyAdvocates: ranks by NPS+health+tenure descending', () => {
  const eng = newEngine();
  eng.seedCustomer({ id: 'x', nps: 9, healthScore: 85, tenureMonths: 12, contractSize: 100_000, churnRisk: 0.05 });
  eng.seedCustomer({ id: 'y', nps: 10, healthScore: 95, tenureMonths: 30, contractSize: 100_000, churnRisk: 0.05 });
  const out = eng.identifyAdvocates({ criteria: { npsMin: 9, healthMin: 80, tenureMonths: 6 } });
  assert.equal(out[0].customerId, 'y');
});

// ─── 2. nominateAdvocate ────────────────────────────────────────────

test('nominateAdvocate: creates an advocate for eligible customer', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({
    customerId: 'cust-100',
    nominator: 'csm-alice',
    reason: 'Active community member',
  });
  assert.ok(adv.id.startsWith('adv-'));
  assert.equal(adv.customerId, 'cust-100');
  assert.equal(adv.status, 'active');
  const ledger = eng.ledgerFor(adv.id);
  assert.equal(ledger[0].type, 'nomination');
});

test('nominateAdvocate: rejects ineligible customer', () => {
  const eng = newEngine();
  seed(eng, { nps: 4 });
  assert.throws(
    () => eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'x' }),
    /not eligible/,
  );
});

test('nominateAdvocate: idempotent — re-nomination reaffirms, no duplicates', () => {
  const eng = newEngine();
  seed(eng);
  const first = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'alice' });
  const second = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'bob' });
  assert.equal(first.id, second.id);
  const ledger = eng.ledgerFor(first.id);
  assert.equal(ledger.filter(e => e.type === 'nomination-reaffirmed').length, 1);
});

test('nominateAdvocate: requires customerId and nominator', () => {
  const eng = newEngine();
  assert.throws(() => eng.nominateAdvocate({}), /customerId required/);
  assert.throws(() => eng.nominateAdvocate({ customerId: 'x' }), /nominator required/);
});

// ─── 3. Consent management ──────────────────────────────────────────

test('consentManagement: no consent by default', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  const c = eng.consentManagement(adv.id);
  assert.equal(c.active.length, 0);
});

test('grantConsent: scoped consent becomes active', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  eng.grantConsent(adv.id, 'case-study', { channel: 'signed-dpa' });
  const c = eng.consentManagement(adv.id);
  assert.equal(c.active.length, 1);
  assert.equal(c.active[0].scope, 'case-study');
  assert.equal(c.active[0].channel, 'signed-dpa');
});

test('revokeConsent: marks inactive but stays on ledger', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  eng.grantConsent(adv.id, 'quote');
  eng.revokeConsent(adv.id, 'quote', 'customer requested');
  const c = eng.consentManagement(adv.id);
  assert.equal(c.active.length, 0);
  assert.equal(c.consents.length, 1);
  assert.equal(c.consents[0].status, 'revoked');
  const ledger = eng.ledgerFor(adv.id);
  assert.ok(ledger.some(e => e.type === 'consent-revoked'));
});

test('grantConsent: per-use consent consumed on each request', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  // Replace 'all' with a scoped per-use consent.
  eng.revokeConsent(adv.id, 'all');
  eng.grantConsent(adv.id, 'call', { perUse: true, usesAllowed: 1 });
  const r1 = eng.requestReference({
    advocateId: adv.id, prospectId: 'p1', format: 'call',
  });
  assert.equal(r1.status, 'scheduled');
  // Second call blocked (consent used up, not cool-down yet).
  const r2 = eng.requestReference({
    advocateId: adv.id, prospectId: 'p2', format: 'call',
    asOf: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  assert.equal(r2.status, 'blocked-consent');
});

// ─── 4. requestReference gates ──────────────────────────────────────

test('requestReference: happy path schedules with consent', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const r = eng.requestReference({
    advocateId: adv.id,
    prospectId: 'p-1',
    format: 'call',
    urgency: 'high',
  });
  assert.equal(r.status, 'scheduled');
  assert.equal(r.formatHe, LABELS_HE.format.call);
});

test('requestReference: blocked without consent', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  const r = eng.requestReference({
    advocateId: adv.id, prospectId: 'p1', format: 'call',
  });
  assert.equal(r.status, 'blocked-consent');
});

test('requestReference: rejects unknown format', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  assert.throws(
    () => eng.requestReference({ advocateId: adv.id, prospectId: 'p1', format: 'carrier-pigeon' }),
    /format must be/,
  );
});

// ─── 5. fatiguePrevention ───────────────────────────────────────────

test('fatiguePrevention: blocks after quarterly cap reached', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  // 3 email requests (light) over 30 days each — fills quarterly cap.
  const base = new Date('2026-01-01T00:00:00.000Z').getTime();
  const cap = CONSTANTS.DEFAULT_MAX_REQUESTS_PER_QUARTER;
  for (let i = 0; i < cap; i++) {
    const ts = new Date(base + i * 20 * 86_400_000).toISOString();
    eng.requestReference({
      advocateId: adv.id, prospectId: `p${i}`, format: 'email', asOf: ts,
    });
  }
  const nextTs = new Date(base + cap * 20 * 86_400_000).toISOString();
  const res = eng.fatiguePrevention({ advocateId: adv.id, asOf: nextTs });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'quarterly-cap-reached');
});

test('fatiguePrevention: light cooldown blocks follow-up within 14 days', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.requestReference({
    advocateId: adv.id, prospectId: 'p1', format: 'email',
    asOf: '2026-02-01T00:00:00.000Z',
  });
  const blocked = eng.requestReference({
    advocateId: adv.id, prospectId: 'p2', format: 'email',
    asOf: '2026-02-05T00:00:00.000Z',
  });
  assert.equal(blocked.status, 'blocked-fatigue');
  assert.equal(blocked.reason, 'light-cooldown');
  assert.ok(blocked.cooldownUntil);
});

test('fatiguePrevention: heavy caps limit site-visits to 2/year', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.trackEngagement({
    advocateId: adv.id, type: 'site-visit', date: '2025-05-01T00:00:00.000Z',
  });
  eng.trackEngagement({
    advocateId: adv.id, type: 'site-visit', date: '2025-11-01T00:00:00.000Z',
  });
  const res = eng.fatiguePrevention({
    advocateId: adv.id, asOf: '2026-01-10T00:00:00.000Z',
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'heavy-cap-reached');
});

test('fatiguePrevention: heavy cooldown enforced after heavy event', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.trackEngagement({
    advocateId: adv.id, type: 'site-visit', date: '2026-03-01T00:00:00.000Z',
  });
  const res = eng.fatiguePrevention({
    advocateId: adv.id, asOf: '2026-04-01T00:00:00.000Z',
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'heavy-cooldown');
});

test('fatiguePrevention: honors custom maxRequestsPerQuarter override', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.requestReference({
    advocateId: adv.id, prospectId: 'p1', format: 'email',
    asOf: '2026-01-01T00:00:00.000Z',
  });
  const res = eng.fatiguePrevention({
    advocateId: adv.id,
    maxRequestsPerQuarter: 1,
    asOf: '2026-01-20T00:00:00.000Z',
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'quarterly-cap-reached');
});

// ─── 6. trackEngagement & rewards ───────────────────────────────────

test('trackEngagement: appends to ledger for downstream scoring', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.trackEngagement({
    advocateId: adv.id, type: 'webinar', outcome: 'high-impact',
    date: '2026-03-15T00:00:00.000Z',
  });
  const l = eng.ledgerFor(adv.id);
  assert.ok(l.some(e => e.type === 'engagement' && e.payload.format === 'webinar'));
});

test('rewardAdvocate: issues reward, default value from catalog', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const r = eng.rewardAdvocate({
    advocateId: adv.id, type: 'thank-you-gift',
  });
  assert.equal(r.currency, 'ILS');
  assert.equal(r.value, CONSTANTS.REWARD_DEFAULT_VALUE['thank-you-gift']);
  assert.equal(r.typeHe, LABELS_HE.thankYouGift);
  const rewards = eng.rewardsFor(adv.id);
  assert.equal(rewards.length, 1);
});

test('rewardAdvocate: rejects unknown reward type', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  assert.throws(
    () => eng.rewardAdvocate({ advocateId: adv.id, type: 'yacht' }),
    /reward type must be/,
  );
});

// ─── 7. caseStudyWorkflow ──────────────────────────────────────────

test('caseStudyWorkflow: starts in intake stage', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const cs = eng.caseStudyWorkflow({
    advocateId: adv.id,
    topic: 'cost-savings',
    topicHe: 'חיסכון בעלויות',
  });
  assert.equal(cs.stage, 'intake');
  assert.equal(cs.stageHe, LABELS_HE.intake);
  assert.deepEqual(cs.stages, CASE_STUDY_STAGES.slice());
});

test('caseStudyWorkflow: requires case-study consent', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  assert.throws(
    () => eng.caseStudyWorkflow({ advocateId: adv.id, topic: 't' }),
    /no active consent/,
  );
});

test('caseStudyWorkflow: advances through full pipeline to publish', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const cs = eng.caseStudyWorkflow({ advocateId: adv.id, topic: 'roi' });
  const d = eng.advanceCaseStudy(cs.id, 'draft', { actor: 'writer' });
  assert.equal(d.stage, 'draft');
  eng.advanceCaseStudy(cs.id, 'customer-review', { actor: 'csm' });
  eng.advanceCaseStudy(cs.id, 'legal-review', { actor: 'counsel' });
  const p = eng.advanceCaseStudy(cs.id, 'publish', { actor: 'marketing' });
  assert.equal(p.stage, 'publish');
  assert.equal(p.status, 'published');
  assert.ok(p.publishedAt);
  // Publishing emits an engagement tick for the hall of fame / fatigue.
  const l = eng.ledgerFor(adv.id);
  assert.ok(l.some(e => e.type === 'engagement' && e.payload.format === 'case-study'));
});

test('caseStudyWorkflow: refuses to skip stages', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const cs = eng.caseStudyWorkflow({ advocateId: adv.id, topic: 'roi' });
  assert.throws(
    () => eng.advanceCaseStudy(cs.id, 'publish'),
    /one stage at a time/,
  );
});

test('caseStudyWorkflow: refuses to go backwards', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  const cs = eng.caseStudyWorkflow({ advocateId: adv.id, topic: 'roi' });
  eng.advanceCaseStudy(cs.id, 'draft');
  assert.throws(
    () => eng.advanceCaseStudy(cs.id, 'intake'),
    /backwards/,
  );
});

// ─── 8. quoteLibrary ───────────────────────────────────────────────

test('quoteLibrary: only approved quotes surface', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.addQuote({
    advocateId: adv.id,
    text: 'They deliver on time, every time.',
    textHe: 'הם מספקים בזמן, בכל פעם.',
    topic: 'reliability',
    industry: 'construction',
    approved: true,
    by: 'alice',
  });
  eng.addQuote({
    advocateId: adv.id,
    text: 'Pending one',
    textHe: 'ציטוט ממתין',
    topic: 'reliability',
    approved: false,
  });
  const lib = eng.quoteLibrary({ topic: 'reliability' });
  assert.equal(lib.length, 1);
  assert.equal(lib[0].approved, true);
});

test('quoteLibrary: approval requires consent', () => {
  const eng = newEngine();
  seed(eng);
  const adv = eng.nominateAdvocate({ customerId: 'cust-100', nominator: 'a' });
  // No consent granted, approved should throw.
  assert.throws(
    () => eng.addQuote({
      advocateId: adv.id, text: 'x', topic: 't', approved: true,
    }),
    /no active quote consent/,
  );
});

// ─── 9. referenceRequests matcher ──────────────────────────────────

test('referenceRequests: returns ranked advocates, never an over-fatigued one', () => {
  const eng = newEngine();
  // Two advocates, one already saturated
  eng.seedCustomer({ id: 'c1', name: 'Alpha', nps: 10, healthScore: 90, tenureMonths: 12, contractSize: 200_000, industry: 'construction', language: 'he', churnRisk: 0.05 });
  eng.seedCustomer({ id: 'c2', name: 'Beta', nps: 9, healthScore: 85, tenureMonths: 12, contractSize: 200_000, industry: 'construction', language: 'he', churnRisk: 0.05 });
  const a1 = eng.nominateAdvocate({ customerId: 'c1', nominator: 'csm' });
  const a2 = eng.nominateAdvocate({ customerId: 'c2', nominator: 'csm' });
  eng.grantConsent(a1.id, 'all');
  eng.grantConsent(a2.id, 'all');
  // Saturate a2 with 3 requests in quarter.
  for (let i = 0; i < CONSTANTS.DEFAULT_MAX_REQUESTS_PER_QUARTER; i++) {
    eng.requestReference({
      advocateId: a2.id, prospectId: `p${i}`, format: 'email',
      asOf: new Date(Date.now() - (i * 20 + 1) * 86_400_000).toISOString(),
    });
  }
  const matches = eng.referenceRequests({
    prospectId: 'prospect-42',
    need: { industry: 'construction', language: 'he' },
  });
  // a2 excluded (fatigue); a1 included.
  const ids = matches.map(m => m.advocateId);
  assert.ok(ids.includes(a1.id));
  assert.ok(!ids.includes(a2.id));
});

test('referenceRequests: filters by industry and language', () => {
  const eng = newEngine();
  eng.seedCustomer({ id: 'c-he', name: 'Hebrew Co', nps: 10, healthScore: 90, tenureMonths: 12, contractSize: 150_000, industry: 'tech', language: 'he', churnRisk: 0.05 });
  eng.seedCustomer({ id: 'c-en', name: 'English Co', nps: 10, healthScore: 90, tenureMonths: 12, contractSize: 150_000, industry: 'tech', language: 'en', churnRisk: 0.05 });
  const a1 = eng.nominateAdvocate({ customerId: 'c-he', nominator: 'csm' });
  const a2 = eng.nominateAdvocate({ customerId: 'c-en', nominator: 'csm' });
  eng.grantConsent(a1.id, 'all');
  eng.grantConsent(a2.id, 'all');
  const matches = eng.referenceRequests({
    prospectId: 'p1',
    need: { industry: 'tech', language: 'he' },
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].advocateId, a1.id);
});

// ─── 10. hallOfFame ────────────────────────────────────────────────

test('hallOfFame: ranks top contributors by weighted engagement', () => {
  const eng = newEngine();
  eng.seedCustomer({ id: 'ca', name: 'A', nps: 10, healthScore: 90, tenureMonths: 12, contractSize: 100_000, churnRisk: 0.05 });
  eng.seedCustomer({ id: 'cb', name: 'B', nps: 10, healthScore: 90, tenureMonths: 12, contractSize: 100_000, churnRisk: 0.05 });
  const aa = eng.nominateAdvocate({ customerId: 'ca', nominator: 'x' });
  const ab = eng.nominateAdvocate({ customerId: 'cb', nominator: 'x' });
  eng.trackEngagement({ advocateId: aa.id, type: 'case-study', date: new Date().toISOString() });
  eng.trackEngagement({ advocateId: ab.id, type: 'email', date: new Date().toISOString() });
  const hof = eng.hallOfFame('year');
  assert.equal(hof[0].advocateId, aa.id);
  assert.ok(hof[0].weightedScore > hof[1].weightedScore);
});

// ─── 11. generateReferenceDeck ─────────────────────────────────────

test('generateReferenceDeck: bilingual slides with quotes and advocates', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.addQuote({
    advocateId: adv.id,
    text: 'Best ERP in Israel.',
    textHe: 'ה-ERP הכי טוב בישראל.',
    topic: 'reliability',
    industry: 'construction',
    approved: true,
  });
  eng.trackEngagement({ advocateId: adv.id, type: 'case-study', date: new Date().toISOString() });
  const deck = eng.generateReferenceDeck({ topic: 'reliability', count: 3 });
  assert.equal(deck.slides[0].kind, 'title');
  assert.ok(deck.slides[0].titleHe.includes('reliability') || deck.slides[0].titleHe.includes(LABELS_HE.referenceDeck));
  const quoteSlide = deck.slides.find(s => s.kind === 'quote');
  assert.ok(quoteSlide);
  assert.equal(quoteSlide.quoteHe, 'ה-ERP הכי טוב בישראל.');
  const advSlide = deck.slides.find(s => s.kind === 'advocates');
  assert.ok(advSlide);
  assert.ok(advSlide.advocates.length >= 1);
});

// ─── 12. Append-only ledger invariant ──────────────────────────────

test('ledgerFor: entries are frozen and append-only', () => {
  const eng = newEngine();
  const adv = fullyNominate(eng);
  eng.trackEngagement({ advocateId: adv.id, type: 'call' });
  const l1 = eng.ledgerFor(adv.id);
  assert.throws(() => { l1[0].payload.hacked = true; }, TypeError);
  // Mutations to the returned slice must not affect internal state.
  l1.push({ fake: true });
  const l2 = eng.ledgerFor(adv.id);
  assert.notEqual(l1.length, l2.length + 0); // l1 was mutated locally
  // internal ledger length is unchanged regardless
  const l3 = eng.ledgerFor(adv.id);
  assert.equal(l3.length, l2.length);
});

test('AdvocacyProgram: no public delete method exposed', () => {
  const eng = newEngine();
  const proto = Object.getPrototypeOf(eng);
  const forbidden = ['delete', 'deleteAdvocate', 'removeAdvocate', 'removeQuote', 'deleteCaseStudy'];
  for (const m of forbidden) {
    assert.equal(typeof proto[m], 'undefined', `must not expose ${m}`);
    assert.equal(typeof eng[m], 'undefined', `must not expose ${m}`);
  }
});

// ─── 13. constants & labels sanity ─────────────────────────────────

test('CONSTANTS: sensible defaults and frozen', () => {
  assert.equal(CONSTANTS.DEFAULT_NPS_MIN, 9);
  assert.equal(CONSTANTS.DEFAULT_HEALTH_MIN, 80);
  assert.equal(CONSTANTS.DEFAULT_MAX_REQUESTS_PER_QUARTER, 3);
  assert.throws(() => { CONSTANTS.DEFAULT_NPS_MIN = 0; }, TypeError);
});

test('LABELS_HE: covers all request formats and reward types', () => {
  for (const f of REQUEST_FORMATS) {
    assert.ok(LABELS_HE.format[f], `missing Hebrew label for format ${f}`);
  }
  const needed = ['swag', 'discount', 'eventInvite', 'featureAccess', 'certification', 'thankYouGift'];
  for (const k of needed) {
    assert.ok(LABELS_HE[k], `missing Hebrew label for ${k}`);
  }
  // Ensure all reward types map to *some* Hebrew label via the engine
  void REWARD_TYPES;
});

// ═══════════════════════════════════════════════════════════════════
// Y-105 Advocacy class tests (added 2026-04-11)
// ═══════════════════════════════════════════════════════════════════
//
// These exercise the NEW Advocacy class layered on top of
// AdvocacyProgram. Every test MUST remain additive — no edits to
// tests above this line.

const {
  Advocacy,
  ACTIVITY_POINTS,
  TIER_THRESHOLDS,
  CASE_STUDY_WORKFLOW_STATES,
  USAGE_RIGHTS,
  REWARD_CATALOGUE,
  REFERENCE_FREQUENCY_CAP,
  LABELS_Y105,
} = mod;

// A deterministic clock factory so frequency / rotation tests are stable
function clockFactory(start) {
  let d = new Date(start).getTime();
  return {
    now: () => new Date(d).toISOString(),
    advance: (days) => { d += days * 86_400_000; },
    set: (iso) => { d = new Date(iso).getTime(); },
  };
}

function freshAdvocacy(startIso = '2026-01-01T08:00:00.000Z') {
  const c = clockFactory(startIso);
  const eng = new Advocacy({ clock: c.now });
  return { eng, clock: c };
}

function nominatePlus({ eng }, overrides = {}) {
  return eng.nominateAdvocate({
    customerId: overrides.customerId || 'cust-y105-001',
    nominatedBy: overrides.nominatedBy || 'rep-avi',
    reason: overrides.reason || 'outstanding case-study candidate',
    eligibilityNotes: overrides.eligibilityNotes || 'nps=10, 3y tenure',
  });
}

function validConsent(overrides = {}) {
  return {
    channel: 'email',
    obtainedAt: '2026-01-02T10:00:00.000Z',
    text: 'I agree to participate in the Techno-Kol advocacy program',
    ref: 'CASE-12345',
    ...overrides,
  };
}

test('Y105: Advocacy exports are present and shaped', () => {
  assert.ok(typeof Advocacy === 'function');
  assert.ok(ACTIVITY_POINTS && typeof ACTIVITY_POINTS === 'object');
  assert.equal(ACTIVITY_POINTS.case_study, 500);
  assert.equal(ACTIVITY_POINTS.reference_call, 100);
  assert.equal(ACTIVITY_POINTS.testimonial, 50);
  assert.equal(ACTIVITY_POINTS.event_speaker, 300);
  assert.equal(ACTIVITY_POINTS.bug_report, 20);
  assert.equal(ACTIVITY_POINTS.feature_request, 10);
  assert.deepEqual(CASE_STUDY_WORKFLOW_STATES, ['draft', 'review', 'published']);
  assert.ok(USAGE_RIGHTS.includes('internal'));
  assert.ok(USAGE_RIGHTS.includes('marketing'));
  assert.ok(USAGE_RIGHTS.includes('public'));
  assert.ok(USAGE_RIGHTS.includes('redistribution'));
});

test('Y105: nominateAdvocate creates append-only pending record', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  assert.equal(rec.status, 'pending');
  assert.equal(rec.customerId, 'cust-y105-001');
  assert.equal(rec.nominatedBy, 'rep-avi');
  assert.ok(rec.id.startsWith('advy105-'));
  // History captures the nomination
  const h = eng.history(rec.id);
  assert.equal(h.length, 1);
  assert.equal(h[0].type, 'nomination');
  assert.equal(h[0].payload.customerId, 'cust-y105-001');
});

test('Y105: nominateAdvocate enforces required fields', () => {
  const { eng } = freshAdvocacy();
  assert.throws(() => eng.nominateAdvocate({}), /customerId required/);
  assert.throws(() => eng.nominateAdvocate({ customerId: 'c1' }), /nominatedBy required/);
  assert.throws(() => eng.nominateAdvocate({ customerId: 'c1', nominatedBy: 'r' }), /reason required/);
});

test('Y105: approveAdvocate requires explicit consentRecord per PDPL', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });

  assert.throws(
    () => eng.approveAdvocate(rec.id, { approver: 'mgr-dana' }),
    /consentRecord required per PDPL/,
  );
  assert.throws(
    () => eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: {} }),
    /channel required/,
  );
  assert.throws(
    () => eng.approveAdvocate(rec.id, {
      approver: 'mgr-dana',
      consentRecord: { channel: 'email' },
    }),
    /obtainedAt required/,
  );
  assert.throws(
    () => eng.approveAdvocate(rec.id, {
      approver: 'mgr-dana',
      consentRecord: { channel: 'email', obtainedAt: '2026-01-02' },
    }),
    /text required/,
  );

  const approved = eng.approveAdvocate(rec.id, {
    approver: 'mgr-dana',
    consentRecord: validConsent(),
  });
  assert.equal(approved.status, 'active');
  assert.equal(approved.approvedBy, 'mgr-dana');
  assert.equal(approved.consentRecord.channel, 'email');
  assert.equal(approved.consentRecord.ref, 'CASE-12345');
  // History grew
  const h = eng.history(rec.id);
  assert.ok(h.some(e => e.type === 'approval'));
});

test('Y105: approveAdvocate cannot approve an opted-out record', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() });
  eng.withdrawConsent(rec.id, 'user request');
  assert.throws(
    () => eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() }),
    /opted-out/,
  );
});

test('Y105: requestCaseStudy flows draft → review → published', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() });

  const cs = eng.requestCaseStudy({
    advocateId: rec.id,
    projectId: 'proj-200',
    approvedBy: 'mgr-dana',
  });
  assert.equal(cs.state, 'draft');
  assert.equal(cs.projectId, 'proj-200');

  const review = eng.advanceCaseStudyY105(cs.id, 'review', 'editor-yael');
  assert.equal(review.state, 'review');

  const published = eng.advanceCaseStudyY105(cs.id, 'published', 'legal-noam');
  assert.equal(published.state, 'published');
  assert.ok(published.publishedAt);

  // Cannot regress
  assert.throws(
    () => eng.advanceCaseStudyY105(cs.id, 'draft', 'someone'),
    /cannot move/,
  );
});

test('Y105: requestCaseStudy blocks non-active advocates', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  // still pending — no approval
  assert.throws(
    () => eng.requestCaseStudy({
      advocateId: rec.id, projectId: 'proj-1', approvedBy: 'mgr-dana',
    }),
    /active/,
  );
});

test('Y105: requestReference enforces 4-per-year frequency cap', () => {
  const { eng, clock } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() });

  const refs = [];
  for (let i = 0; i < REFERENCE_FREQUENCY_CAP; i += 1) {
    clock.advance(10);
    refs.push(eng.requestReference({
      advocateId: rec.id,
      requestingRepId: `rep-${i}`,
      prospectName: `Prospect ${i}`,
      purpose: 'sales cycle',
    }));
  }
  assert.equal(refs.length, 4);
  for (const r of refs) assert.equal(r.status, 'scheduled');

  // 5th should be blocked
  clock.advance(10);
  const fifth = eng.requestReference({
    advocateId: rec.id,
    requestingRepId: 'rep-5',
    prospectName: 'Fifth prospect',
    purpose: 'sales cycle',
  });
  assert.equal(fifth.status, 'blocked-cap');
  assert.match(fifth.reason, /cap reached/);
});

test('Y105: requestReference override bypasses cap and emits audit event', () => {
  const { eng, clock } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() });

  for (let i = 0; i < REFERENCE_FREQUENCY_CAP; i += 1) {
    clock.advance(10);
    eng.requestReference({
      advocateId: rec.id,
      requestingRepId: `rep-${i}`,
      prospectName: `Prospect ${i}`,
      purpose: 'sales cycle',
    });
  }
  clock.advance(10);
  const override = eng.requestReference({
    advocateId: rec.id,
    requestingRepId: 'rep-override',
    prospectName: 'VIP Prospect',
    purpose: 'enterprise deal',
    approvedByOverride: true,
  });
  assert.equal(override.status, 'scheduled');
  assert.equal(override.overrideUsed, true);

  const h = eng.history(rec.id);
  assert.ok(h.some(e => e.type === 'reference-override-audit'));
});

test('Y105: trackTestimonial validates usageRights allow-list', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr-dana', consentRecord: validConsent() });

  const t = eng.trackTestimonial({
    advocateId: rec.id,
    quote: 'Techno-Kol transformed our procurement process',
    attribution: 'CEO, Rimon Industries',
    usageRights: ['internal', 'marketing'],
  });
  assert.equal(t.quote, 'Techno-Kol transformed our procurement process');
  assert.deepEqual(t.usageRights, ['internal', 'marketing']);
  assert.ok(t.usageRightsHe.includes(LABELS_Y105.internal));

  assert.throws(
    () => eng.trackTestimonial({
      advocateId: rec.id,
      quote: 'test',
      attribution: 'test',
      usageRights: ['bogus'],
    }),
    /invalid usage right/,
  );

  // All four rights accepted
  const full = eng.trackTestimonial({
    advocateId: rec.id,
    quote: 'Full rights testimonial',
    attribution: 'VP Ops',
    usageRights: ['internal', 'marketing', 'public', 'redistribution'],
  });
  assert.equal(full.usageRights.length, 4);
});

test('Y105: scheduleUserGroupEvent auto-awards speakers 300 points', () => {
  const { eng } = freshAdvocacy();
  const a1 = nominatePlus({ eng, customerId: 'cust-1' });
  const a2 = nominatePlus({ eng, customerId: 'cust-2' });
  eng.approveAdvocate(a1.id, { approver: 'mgr', consentRecord: validConsent() });
  eng.approveAdvocate(a2.id, { approver: 'mgr', consentRecord: validConsent() });

  const evt = eng.scheduleUserGroupEvent({
    title: 'TKU Meetup Tel Aviv Q2',
    date: '2026-05-15',
    location: 'Tel Aviv',
    targetAttendees: 80,
    speakers: [a1.id, a2.id],
  });
  assert.equal(evt.speakers.length, 2);
  assert.equal(evt.locationHe, 'תל אביב');

  assert.equal(eng.pointsBalance(a1.id).earned, 300);
  assert.equal(eng.pointsBalance(a2.id).earned, 300);
});

test('Y105: awardPoints uses defaults when points argument omitted', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  eng.awardPoints(rec.id, 'case_study');
  eng.awardPoints(rec.id, 'reference_call');
  eng.awardPoints(rec.id, 'testimonial');
  eng.awardPoints(rec.id, 'bug_report');
  eng.awardPoints(rec.id, 'feature_request');

  const bal = eng.pointsBalance(rec.id);
  assert.equal(bal.earned, 500 + 100 + 50 + 20 + 10);
  assert.equal(bal.redeemed, 0);
  assert.equal(bal.balance, 680);
});

test('Y105: awardPoints rejects unknown activities', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  assert.throws(
    () => eng.awardPoints(rec.id, 'foo', 10),
    /unknown activity/,
  );
});

test('Y105: tier advances bronze → silver → gold → platinum as points accrue', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  assert.equal(eng.getAdvocateV2(rec.id).tier, 'bronze');

  // 300 → silver
  eng.awardPoints(rec.id, 'event_speaker');           // +300
  assert.equal(eng.getAdvocateV2(rec.id).tier, 'silver');

  // 900 total → gold
  eng.awardPoints(rec.id, 'case_study');              // +500 → 800
  eng.awardPoints(rec.id, 'reference_call');          // +100 → 900
  assert.equal(eng.getAdvocateV2(rec.id).tier, 'gold');

  // 2000 total → platinum
  eng.awardPoints(rec.id, 'case_study');              // +500 → 1400
  eng.awardPoints(rec.id, 'case_study');              // +500 → 1900
  eng.awardPoints(rec.id, 'case_study');              // +500 → 2400
  assert.equal(eng.getAdvocateV2(rec.id).tier, 'platinum');

  const tiers = eng.tierThresholds();
  assert.equal(tiers.platinum.points, 2000);
  assert.equal(tiers.platinum.nameHe, 'פלטינה');
});

test('Y105: redeemPoints checks balance and records redemption', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });
  eng.awardPoints(rec.id, 'case_study'); // 500

  // Not enough for conference_ticket (1500)
  assert.throws(
    () => eng.redeemPoints(rec.id, 'conference_ticket'),
    /insufficient balance/,
  );

  // swag (200) → works, balance 300
  const r = eng.redeemPoints(rec.id, 'swag');
  assert.equal(r.points, 200);
  assert.equal(r.reward, 'swag');
  const bal = eng.pointsBalance(rec.id);
  assert.equal(bal.earned, 500);
  assert.equal(bal.redeemed, 200);
  assert.equal(bal.balance, 300);

  // Reward must exist in catalogue
  assert.throws(
    () => eng.redeemPoints(rec.id, 'private_jet'),
    /unknown reward/,
  );
});

test('Y105: advocatesByScore returns leaderboard sorted by earned points', () => {
  const { eng } = freshAdvocacy();
  const a1 = nominatePlus({ eng, customerId: 'cust-a' });
  const a2 = nominatePlus({ eng, customerId: 'cust-b' });
  const a3 = nominatePlus({ eng, customerId: 'cust-c' });
  for (const a of [a1, a2, a3]) {
    eng.approveAdvocate(a.id, { approver: 'mgr', consentRecord: validConsent() });
  }
  eng.awardPoints(a1.id, 'case_study');   // 500
  eng.awardPoints(a2.id, 'reference_call'); // 100
  eng.awardPoints(a3.id, 'case_study');   // 500
  eng.awardPoints(a3.id, 'testimonial');  // 50 → 550

  const lb = eng.advocatesByScore(5);
  assert.equal(lb.length, 3);
  assert.equal(lb[0].advocateId, a3.id);
  assert.equal(lb[0].earned, 550);
  assert.equal(lb[1].advocateId, a1.id);
  assert.equal(lb[1].earned, 500);
  assert.equal(lb[2].advocateId, a2.id);
});

test('Y105: advocatesByScore omits opted-out advocates', () => {
  const { eng } = freshAdvocacy();
  const a1 = nominatePlus({ eng, customerId: 'cust-a' });
  const a2 = nominatePlus({ eng, customerId: 'cust-b' });
  eng.approveAdvocate(a1.id, { approver: 'mgr', consentRecord: validConsent() });
  eng.approveAdvocate(a2.id, { approver: 'mgr', consentRecord: validConsent() });
  eng.awardPoints(a1.id, 'case_study');
  eng.awardPoints(a2.id, 'case_study');

  eng.withdrawConsent(a2.id, 'user opt-out');
  const lb = eng.advocatesByScore(5);
  assert.equal(lb.length, 1);
  assert.equal(lb[0].advocateId, a1.id);
});

test('Y105: rotationPolicy prefers advocates with fewer recent requests', () => {
  const { eng, clock } = freshAdvocacy();
  const a1 = nominatePlus({ eng, customerId: 'cust-1' });
  const a2 = nominatePlus({ eng, customerId: 'cust-2' });
  const a3 = nominatePlus({ eng, customerId: 'cust-3' });
  for (const a of [a1, a2, a3]) {
    eng.approveAdvocate(a.id, { approver: 'mgr', consentRecord: validConsent() });
  }
  // a1 gets 2 requests, a2 gets 1, a3 gets 0
  clock.advance(5);
  eng.requestReference({
    advocateId: a1.id, requestingRepId: 'r', prospectName: 'p1', purpose: 's',
  });
  clock.advance(5);
  eng.requestReference({
    advocateId: a1.id, requestingRepId: 'r', prospectName: 'p2', purpose: 's',
  });
  clock.advance(5);
  eng.requestReference({
    advocateId: a2.id, requestingRepId: 'r', prospectName: 'p3', purpose: 's',
  });

  const rows = eng.rotationPolicy();
  // a3 (0 recent) before a2 (1 recent) before a1 (2 recent)
  assert.equal(rows[0].advocateId, a3.id);
  assert.equal(rows[1].advocateId, a2.id);
  assert.equal(rows[2].advocateId, a1.id);
});

test('Y105: rotationPolicy excludes non-active advocates', () => {
  const { eng } = freshAdvocacy();
  const a1 = nominatePlus({ eng, customerId: 'cust-1' });
  const a2 = nominatePlus({ eng, customerId: 'cust-2' });
  eng.approveAdvocate(a1.id, { approver: 'mgr', consentRecord: validConsent() });
  // a2 remains pending
  const rows = eng.rotationPolicy();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].advocateId, a1.id);
});

test('Y105: withdrawConsent preserves record, flips status, blocks future requests', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  // Build up some history
  eng.requestReference({
    advocateId: rec.id, requestingRepId: 'r1', prospectName: 'P1', purpose: 'sales',
  });
  eng.awardPoints(rec.id, 'reference_call');

  const before = eng.history(rec.id).length;
  assert.ok(before >= 3);

  const withdrawn = eng.withdrawConsent(rec.id, 'privacy request');
  assert.equal(withdrawn.status, 'opted-out');
  assert.equal(withdrawn.statusHe, LABELS_Y105.optedOut);
  assert.equal(withdrawn.optedOutReason, 'privacy request');
  assert.ok(withdrawn.optedOutAt);

  // History preserved AND grew (append-only)
  const after = eng.history(rec.id);
  assert.ok(after.length > before);
  assert.ok(after.some(e => e.type === 'consent-withdrawn'));
  // Original nomination event is still the first entry
  assert.equal(after[0].type, 'nomination');

  // Future writes all throw
  assert.throws(
    () => eng.requestReference({
      advocateId: rec.id, requestingRepId: 'r2', prospectName: 'P2', purpose: 's',
    }),
    /opted-out/,
  );
  assert.throws(
    () => eng.requestCaseStudy({
      advocateId: rec.id, projectId: 'proj', approvedBy: 'mgr',
    }),
    /opted-out/,
  );
  assert.throws(
    () => eng.trackTestimonial({
      advocateId: rec.id, quote: 'q', attribution: 'a', usageRights: ['internal'],
    }),
    /opted-out/,
  );
  assert.throws(
    () => eng.awardPoints(rec.id, 'bug_report'),
    /opted-out/,
  );
});

test('Y105: history is append-only and returns a defensive copy', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  const h1 = eng.history(rec.id);
  // Try to corrupt the returned copy
  h1.push({ ts: 'fake', type: 'bogus', payload: {} });
  const h2 = eng.history(rec.id);
  assert.ok(h2.length < h1.length, 'returned slice must be defensive');
  // Events are frozen
  assert.throws(() => { h2[0].type = 'x'; }, TypeError);
});

test('Y105: testimonial and reference records listable and lookup', () => {
  const { eng } = freshAdvocacy();
  const rec = nominatePlus({ eng });
  eng.approveAdvocate(rec.id, { approver: 'mgr', consentRecord: validConsent() });

  const t = eng.trackTestimonial({
    advocateId: rec.id,
    quote: 'Excellent!',
    attribution: 'CFO',
    usageRights: ['marketing'],
  });
  const fetched = eng.getTestimonial(t.id);
  assert.equal(fetched.quote, 'Excellent!');

  const all = eng.listTestimonials();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, t.id);

  // Reward catalogue is immutable from outside
  const cat = eng.rewardCatalogue();
  cat.swag.points = 0;
  assert.equal(eng.rewardCatalogue().swag.points, REWARD_CATALOGUE.swag.points);
});
