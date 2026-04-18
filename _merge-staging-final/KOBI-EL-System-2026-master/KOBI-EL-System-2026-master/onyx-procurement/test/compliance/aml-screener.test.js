/**
 * ════════════════════════════════════════════════════════════════════════
 * AMLScreener — unit tests
 * ════════════════════════════════════════════════════════════════════════
 * Agent Y-146 — Techno-Kol Uzi Mega-ERP
 * Run: node --test onyx-procurement/test/compliance/aml-screener.test.js
 *
 * Zero external deps. Uses node:test + node:assert/strict.
 * House rule: לא מוחקים רק משדרגים ומגדלים — only add new tests.
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AMLScreener,
  CASH_REPORT_THRESHOLD_ILS,
  BUSINESS_CASH_CAP_ILS,
  MIN_RETENTION_YEARS,
  FLAG_LABELS,
  normalizeName,
  hashPII,
  isRoundAmount,
  bandOf,
} = require('../../src/compliance/aml-screener');

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function makeClock(initialIso) {
  let ms = Date.parse(initialIso);
  const fn = () => new Date(ms);
  fn.advanceMs = (n) => { ms += n; };
  fn.advanceHours = (n) => { ms += n * 3_600_000; };
  fn.advanceDays = (n) => { ms += n * 86_400_000; };
  return fn;
}

function makeScreener(overrides = {}) {
  return new AMLScreener({
    clock: overrides.clock || makeClock('2026-04-11T09:00:00Z'),
    blacklist: overrides.blacklist || [
      { name: 'Acme Shell Corp', source: 'OFAC', severity: 'high', aliases: ['Acme SC'] },
      { name: 'Dmitri Ivanov', source: 'EU-SANCTIONS', reason: 'sanctions' },
    ],
    pepList: overrides.pepList || ['Avraham Example', 'Rina Minister'],
    piiSalt: 'test-salt-146',
    ...overrides,
  });
}

// ═════════════════════════════════════════════════════════════
//  1. Construction + retention invariants
// ═════════════════════════════════════════════════════════════

test('constructor enforces 7-year minimum retention', () => {
  const s1 = new AMLScreener({ retentionYears: 3 });
  assert.equal(s1.getRetentionYears(), MIN_RETENTION_YEARS);
  const s2 = new AMLScreener({ retentionYears: 10 });
  assert.equal(s2.getRetentionYears(), 10);
  s2.setRetentionYears(5); // should clamp up to 7
  assert.equal(s2.getRetentionYears(), MIN_RETENTION_YEARS);
  s2.setRetentionYears(12);
  assert.equal(s2.getRetentionYears(), 12);
});

// ═════════════════════════════════════════════════════════════
//  2. Transport injection (mock HTTP)
// ═════════════════════════════════════════════════════════════

test('injectTransport accepts a function and routes calls through it', async () => {
  const s = makeScreener();
  const captured = [];
  s.injectTransport(async (url, opts) => {
    captured.push({ url, opts });
    return { status: 200, body: { ok: true } };
  });

  const res = await s._callTransport('https://impa.gov.il/check', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://impa.gov.il/check');

  // Non-function should throw
  assert.throws(() => s.injectTransport('not-a-fn'), TypeError);
});

// ═════════════════════════════════════════════════════════════
//  3. Blacklist management + fuzzy match
// ═════════════════════════════════════════════════════════════

test('blacklist matching handles case, diacritics, and aliases', () => {
  const s = makeScreener();
  assert.equal(s.isBlacklisted('acme shell corp').hit, true);
  assert.equal(s.isBlacklisted('ACME  SHELL   CORP').hit, true);
  assert.equal(s.isBlacklisted('Acme SC').hit, true);
  assert.equal(s.isBlacklisted('Clean Co').hit, false);
  // Fuzzy substring
  assert.equal(s.isBlacklisted('Acme Shell Corp Ltd.', { fuzzy: true }).hit, true);
  // Add entry dynamically
  s.addToBlacklist({ name: 'Hydra GmbH', source: 'EU' });
  assert.equal(s.isBlacklisted('hydra gmbh').hit, true);
});

// ═════════════════════════════════════════════════════════════
//  4. PEP detection
// ═════════════════════════════════════════════════════════════

test('PEP list detects by normalized name', () => {
  const s = makeScreener();
  assert.equal(s.isPEP('Avraham Example'), true);
  assert.equal(s.isPEP('AVRAHAM   EXAMPLE'), true);
  assert.equal(s.isPEP('Ordinary Person'), false);
  s.addPEP('Yossi New-Minister');
  assert.equal(s.isPEP('yossi new minister'), true);
});

// ═════════════════════════════════════════════════════════════
//  5. Customer screening — clean vs flagged
// ═════════════════════════════════════════════════════════════

test('screenCustomer: clean KYC → low risk', () => {
  const s = makeScreener();
  const res = s.screenCustomer({
    name: 'Boring Bolts Ltd',
    country: 'IL',
    sourceOfFunds: 'metal fabrication revenue',
    expectedMonthlyVolume: 50_000,
  });
  assert.equal(res.rating, 'low');
  assert.equal(res.flags.length, 0);
  assert.equal(res.score, 0);
});

test('screenCustomer: blacklist hit → high + critical reason', () => {
  const s = makeScreener();
  const res = s.screenCustomer({
    name: 'Acme Shell Corp',
    country: 'IL',
    sourceOfFunds: 'consulting',
  });
  assert.ok(res.flags.includes('blacklist_hit'));
  assert.equal(res.rating, 'high');
  assert.ok(res.reasons.some((r) => r.code === 'blacklist_hit'));
});

test('screenCustomer: PEP + high-risk country + no source → high', () => {
  const s = makeScreener();
  const res = s.screenCustomer({
    name: 'Avraham Example',
    country: 'IR', // Iran — high risk
    sourceOfFunds: '',
  });
  assert.ok(res.flags.includes('pep_match'));
  assert.ok(res.flags.includes('high_risk_country'));
  assert.ok(res.flags.includes('unknown_source'));
  assert.equal(res.rating_tag, 'pep');
  assert.ok(res.score >= 60);
});

// ═════════════════════════════════════════════════════════════
//  6. checkThresholds — cash ≥ ₪50,000
// ═════════════════════════════════════════════════════════════

test('checkThresholds flags cash ≥ ₪50,000 under חוק איסור הלבנת הון', () => {
  const s = makeScreener();
  // Under the IMPA 50k threshold AND under the 15k private cap → no flag.
  const under = s.checkThresholds({ amount: 10_000, currency: 'ILS', type: 'cash' });
  assert.equal(under.triggered, false);

  // 49,999 is under IMPA 50k but over private cash cap → still triggers
  // (but NOT under code CASH_IMPA_50K).
  const edge = s.checkThresholds({ amount: 49_999, currency: 'ILS', type: 'cash' });
  assert.equal(edge.triggered, true);
  assert.equal(edge.items.some((i) => i.code === 'CASH_IMPA_50K'), false);

  // Over the IMPA ceiling → triggers the IMPA 50k flag specifically.
  const over = s.checkThresholds({ amount: 60_000, currency: 'ILS', type: 'cash' });
  assert.equal(over.triggered, true);
  assert.ok(over.items.some((i) => i.code === 'CASH_IMPA_50K'));
  assert.ok(over.items.some((i) => i.law.includes('הלבנת הון')));

  const atThreshold = s.checkThresholds({ amount: CASH_REPORT_THRESHOLD_ILS, currency: 'ILS', type: 'cash' });
  assert.equal(atThreshold.triggered, true);
  assert.ok(atThreshold.items.some((i) => i.code === 'CASH_IMPA_50K'));
});

// ═════════════════════════════════════════════════════════════
//  7. screenTransaction — structuring band detection
// ═════════════════════════════════════════════════════════════

test('screenTransaction detects structuring (80–100% of threshold)', () => {
  const s = makeScreener();
  // 80% of 50k = 40k; 48k should flag structuring
  const res = s.screenTransaction({
    amount: 48_000,
    currency: 'ILS',
    type: 'cash',
    businessDeal: false,
    counterparty: 'Some Guy',
  });
  assert.ok(res.flags.includes('structuring'));
  // 30k should NOT flag structuring
  const res2 = s.screenTransaction({
    amount: 30_000,
    currency: 'ILS',
    type: 'cash',
    businessDeal: false,
    counterparty: 'Some Guy',
  });
  assert.equal(res2.flags.includes('structuring'), false);
});

// ═════════════════════════════════════════════════════════════
//  8. dualCheck — cluster structuring + smurfing
// ═════════════════════════════════════════════════════════════

test('dualCheck detects cluster structuring and smurfing', () => {
  const s = makeScreener();
  const baseTx = {
    amount: 15_000,
    currency: 'ILS',
    type: 'cash',
    counterparty: 'Courier A',
    date: '2026-04-11T10:00:00Z',
    incoming: true,
  };
  const related = [
    { amount: 14_500, currency: 'ILS', counterparty: 'Courier B', date: '2026-04-11T10:30:00Z', incoming: true },
    { amount: 14_800, currency: 'ILS', counterparty: 'Courier C', date: '2026-04-11T11:00:00Z', incoming: true },
    { amount: 14_900, currency: 'ILS', counterparty: 'Courier D', date: '2026-04-11T11:30:00Z', incoming: true },
  ];
  const res = s.dualCheck(baseTx, related);
  assert.ok(res.flags.includes('structuring'));
  assert.ok(res.flags.includes('smurfing'));
  assert.ok(res.flags.includes('dual_check_cluster'));
  assert.ok(res.clusterTotal >= CASH_REPORT_THRESHOLD_ILS);
  assert.equal(res.relatedCount, 3);
  assert.equal(res.reportable, true);
});

// ═════════════════════════════════════════════════════════════
//  9. Rapid in/out detection
// ═════════════════════════════════════════════════════════════

test('dualCheck detects rapid in/out within 48h window', () => {
  const s = makeScreener();
  const inbound = {
    amount: 80_000,
    currency: 'ILS',
    type: 'wire',
    counterparty: 'Alpha Ltd',
    date: '2026-04-11T09:00:00Z',
    incoming: true,
  };
  const outbound = [
    {
      amount: 79_500,
      currency: 'ILS',
      type: 'wire',
      counterparty: 'Alpha Ltd',
      date: '2026-04-12T17:00:00Z',
      incoming: false,
    },
  ];
  const res = s.dualCheck(inbound, outbound);
  assert.ok(res.flags.includes('rapid_in_out'));
});

// ═════════════════════════════════════════════════════════════
//  10. High-risk country + round number detection
// ═════════════════════════════════════════════════════════════

test('screenTransaction flags high-risk country and round-number amounts', () => {
  const s = makeScreener();
  const res = s.screenTransaction({
    amount: 100_000,
    currency: 'ILS',
    type: 'wire',
    counterparty: 'Teheran Trading',
    counterpartyCountry: 'IR',
  });
  assert.ok(res.flags.includes('high_risk_country'));
  assert.ok(res.flags.includes('round_number'));
  assert.ok(res.score >= 40);
});

// ═════════════════════════════════════════════════════════════
//  11. SAR generation — hashed PII by default, raw on flag
// ═════════════════════════════════════════════════════════════

test('generateSAR produces draft with hashed PII by default', () => {
  const s = makeScreener();
  const sar = s.generateSAR({
    subjectName: 'Suspicious Sam',
    subjectId: '123456782',
    subjectCountry: 'IR',
    pep: true,
    flags: ['blacklist_hit', 'high_risk_country', 'structuring'],
    transaction: {
      amount: 52_000,
      currency: 'ILS',
      type: 'cash',
      date: '2026-04-11T08:30:00Z',
      counterparty: 'Unknown',
    },
    narrative: 'Customer arrived with unbundled cash in suitcase.',
  });
  assert.ok(sar.id.startsWith('SAR-'));
  assert.equal(sar.form.report_type, 'SAR');
  assert.equal(sar.form.status, 'draft');
  // Subject ID must be hashed (not raw)
  assert.notEqual(sar.form.subject.id_hash, '123456782');
  assert.equal(sar.form.subject.id_raw, null);
  assert.ok(typeof sar.form.subject.id_hash === 'string' && sar.form.subject.id_hash.length === 64);
  // Legal basis must cite the 2000 law
  assert.ok(sar.form.legal_basis.some((l) => l.includes('תש"ס-2000')));
  // Retention must be ≥ 7 years
  assert.ok(sar.form.retention.years >= MIN_RETENTION_YEARS);
  // Text body should have bilingual sections
  assert.ok(sar.text.includes('SAR Draft'));
  assert.ok(sar.text.includes('טופס דיווח'));
  assert.ok(sar.text.includes('Suspicion Flags'));

  // Now raw PII when explicitly opted in
  const sarRaw = s.generateSAR({
    subjectName: 'Suspicious Sam',
    subjectId: '123456782',
    flags: [],
    includeRawPII: true,
  });
  assert.equal(sarRaw.form.subject.id_raw, '123456782');
  assert.equal(sarRaw.form.subject.id_hash, null);
});

// ═════════════════════════════════════════════════════════════
//  12. Case record retention & purgeExpired
// ═════════════════════════════════════════════════════════════

test('recordCase stores case; purgeExpired respects 7-year retention', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const s = makeScreener({ clock });
  const id = s.recordCase({
    subjectName: 'Redacted Subject',
    subjectId: '987654321',
    amount: 75_000,
    flags: ['threshold_breach'],
  });
  assert.ok(typeof id === 'string' && id.startsWith('AML-'));
  // Raw PII must have been hashed away in-store
  const cases = s.listCases();
  assert.equal(cases.length, 1);
  assert.equal(cases[0].data.subjectId, undefined);
  assert.ok(typeof cases[0].data.subjectIdHash === 'string');
  assert.equal(cases[0].data.subjectIdHash.length, 64);

  // Immediate purge should not remove (still within 7y)
  assert.equal(s.purgeExpired(), 0);
  assert.equal(s.listCases().length, 1);

  // Advance clock 8 years → should purge
  clock.advanceDays(8 * 366);
  assert.equal(s.purgeExpired(), 1);
  assert.equal(s.listCases().length, 0);
});

// ═════════════════════════════════════════════════════════════
//  13. Cash-cap breaches (חוק לצמצום השימוש במזומן)
// ═════════════════════════════════════════════════════════════

test('checkThresholds flags business cash > ₪11,000', () => {
  const s = makeScreener();
  const res = s.checkThresholds({
    amount: 20_000,
    currency: 'ILS',
    type: 'cash',
    businessDeal: true,
  });
  assert.equal(res.triggered, true);
  assert.ok(res.items.some((i) => i.code === 'CASH_BIZ_CAP_11K'));
  assert.ok(res.items.some((i) => i.law.includes('צמצום השימוש במזומן')));
});

// ═════════════════════════════════════════════════════════════
//  14. Real-estate cash threshold
// ═════════════════════════════════════════════════════════════

test('screenTransaction flags real-estate cash portion ≥ ₪50,000', () => {
  const s = makeScreener();
  const res = s.screenTransaction({
    amount: 2_500_000,
    currency: 'ILS',
    type: 'real_estate',
    cashPortion: 75_000,
    counterparty: 'Buyer Co',
  });
  assert.ok(res.flags.includes('real_estate_cash'));
  assert.ok(res.flags.includes('threshold_breach'));
  assert.equal(res.reportable, true);
});

// ═════════════════════════════════════════════════════════════
//  15. Helper unit tests
// ═════════════════════════════════════════════════════════════

test('helpers: normalizeName / hashPII / isRoundAmount / bandOf', () => {
  assert.equal(normalizeName('  Acme,   Ltd.  '), 'acme ltd');
  const h1 = hashPII('123456782', 'salt-a');
  const h2 = hashPII('123456782', 'salt-a');
  const h3 = hashPII('123456782', 'salt-b');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.equal(h1.length, 64);

  assert.equal(isRoundAmount(50_000), true);
  assert.equal(isRoundAmount(49_500), false);
  assert.equal(isRoundAmount(999), false);

  assert.equal(bandOf(0), 'low');
  assert.equal(bandOf(29), 'low');
  assert.equal(bandOf(30), 'medium');
  assert.equal(bandOf(59), 'medium');
  assert.equal(bandOf(60), 'high');
  assert.equal(bandOf(999), 'high');
});

// ═════════════════════════════════════════════════════════════
//  16. Flag label completeness (bilingual)
// ═════════════════════════════════════════════════════════════

test('every flag has bilingual Hebrew + English label', () => {
  const required = [
    'structuring', 'smurfing', 'rapid_in_out', 'round_number',
    'high_risk_country', 'pep_match', 'blacklist_hit',
    'threshold_breach', 'velocity_anomaly', 'unknown_source',
    'cash_cap_breach', 'real_estate_cash', 'dual_check_cluster',
  ];
  for (const f of required) {
    assert.ok(FLAG_LABELS[f], `missing label for ${f}`);
    assert.ok(FLAG_LABELS[f].he && FLAG_LABELS[f].he.length > 0, `no Hebrew for ${f}`);
    assert.ok(FLAG_LABELS[f].en && FLAG_LABELS[f].en.length > 0, `no English for ${f}`);
  }
});
