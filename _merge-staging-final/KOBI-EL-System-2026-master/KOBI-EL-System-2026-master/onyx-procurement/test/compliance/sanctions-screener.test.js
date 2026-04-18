/**
 * Tests — SanctionsScreener
 * Zero-dep (node:assert + node:test).
 *
 * Covers:
 *   - Constants + source registry
 *   - Transport injection (mock fetcher)
 *   - loadList for OFAC / EU / UN / IL_DECA with custom parsers
 *   - SHA-256 checksum tracking + version bumping
 *   - Delta alerts (new additions since last load)
 *   - fuzzyMatch (exact, alias, fuzzy token overlap)
 *   - screen() against multiple lists simultaneously
 *   - Blocked jurisdictions (canonical, alias, substring)
 *   - Dual-use goods check (Wassenaar-adjacent)
 *   - Israeli export-control keyword scanning
 *   - End-use declaration validation (success + failure)
 *   - False-positive review queue (non-destructive)
 *   - Append-only audit trail (לא מוחקים)
 *   - Hebrew RTL + bilingual metadata
 *   - Stats summary
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SanctionsScreener,
  SOURCES,
  BLOCKED_JURISDICTIONS,
  DUAL_USE_KEYWORDS,
  ISRAELI_EXPORT_KEYWORDS,
  normalise,
  tokenize,
  levenshtein,
  tokenSimilarity,
  fuzzyTokenOverlap,
  sha256,
  defaultParser,
} = require('../../src/compliance/sanctions-screener');

// ---- fixtures ---------------------------------------------------------------

const OFAC_V1 = [
  { uid: 'OFAC-001', name: 'Ali Akbar Velayati', aliases: ['Velayati, Ali'], country: 'Iran', type: 'individual' },
  { uid: 'OFAC-002', name: 'Bank Melli Iran', aliases: ['BMI'], country: 'Iran', type: 'entity' },
  { uid: 'OFAC-003', name: 'Sanctioned Shipping Co', aliases: [], country: 'Syria', type: 'entity' },
];

const OFAC_V2 = [
  // V1 entries (retained)
  { uid: 'OFAC-001', name: 'Ali Akbar Velayati', aliases: ['Velayati, Ali'], country: 'Iran', type: 'individual' },
  { uid: 'OFAC-002', name: 'Bank Melli Iran', aliases: ['BMI'], country: 'Iran', type: 'entity' },
  { uid: 'OFAC-003', name: 'Sanctioned Shipping Co', aliases: [], country: 'Syria', type: 'entity' },
  // New additions
  { uid: 'OFAC-004', name: 'Abu Mazen Engineering', aliases: ['AME Ltd'], country: 'Lebanon', type: 'entity' },
  { uid: 'OFAC-005', name: 'Pyongyang Metals', aliases: [], country: 'North Korea', type: 'entity' },
];

const EU_LIST = [
  { uid: 'EU-101', name: 'Dmitri Ivanovich Petrov', aliases: ['D. Petrov'], country: 'Russia', type: 'individual' },
  { uid: 'EU-102', name: 'Rosoboronexport', aliases: [], country: 'Russia', type: 'entity' },
];

const UN_LIST = [
  { uid: 'UN-901', name: 'Al Qaeda Financial Network', aliases: ['AQFN'], country: 'Somalia', type: 'entity' },
];

const IL_DECA_LIST = [
  { uid: 'IL-D-501', name: 'Shahid Industries Group', aliases: ['SIG', 'Shahid'], country: 'Iran', type: 'entity' },
];

// Mock transport — receives sourceKey, returns list payload.
function makeTransport(map) {
  return async (sourceKey) => {
    if (!(sourceKey in map)) throw new Error(`no mock for ${sourceKey}`);
    return map[sourceKey];
  };
}

function makeScreener(opts) {
  return new SanctionsScreener(opts);
}

// ---- tests ------------------------------------------------------------------

test('constants export correctly (SOURCES, BLOCKED_JURISDICTIONS, DUAL_USE_KEYWORDS, ISRAELI_EXPORT_KEYWORDS)', () => {
  assert.ok(SOURCES.OFAC && SOURCES.OFAC.key === 'OFAC');
  assert.ok(SOURCES.EU && SOURCES.EU.authority === 'European Union');
  assert.ok(SOURCES.UN && SOURCES.UN.authority === 'United Nations');
  assert.ok(SOURCES.IL_DECA && /Israel/.test(SOURCES.IL_DECA.authority));

  assert.ok(BLOCKED_JURISDICTIONS.iran);
  assert.equal(BLOCKED_JURISDICTIONS.iran.he, 'איראן');
  assert.equal(BLOCKED_JURISDICTIONS['north-korea'].severity, 'critical');
  assert.ok(BLOCKED_JURISDICTIONS.crimea);
  assert.ok(BLOCKED_JURISDICTIONS.syria);

  assert.ok(DUAL_USE_KEYWORDS.metallurgy);
  assert.ok(DUAL_USE_KEYWORDS.aerospace);
  assert.ok(DUAL_USE_KEYWORDS['machine-tools']);
  assert.ok(Array.isArray(DUAL_USE_KEYWORDS.metallurgy.keywords));

  assert.ok(ISRAELI_EXPORT_KEYWORDS.includes('כלי נשק'));
  assert.ok(ISRAELI_EXPORT_KEYWORDS.includes('פריט לשימוש כפול'));
  assert.ok(ISRAELI_EXPORT_KEYWORDS.includes('MCTL'));
});

test('helpers: normalise / tokenize / levenshtein / tokenSimilarity / fuzzyTokenOverlap / sha256', () => {
  assert.equal(normalise('  Dr. Velayati, Ali!  '), 'dr velayati ali');
  assert.deepEqual(tokenize('Bank Melli Iran'), ['bank', 'melli', 'iran']);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.ok(tokenSimilarity('velayati', 'velayti') > 0.85);
  assert.equal(tokenSimilarity('abc', 'abc'), 1);
  const ov = fuzzyTokenOverlap(['bank', 'melli', 'iran'], ['melli', 'iran', 'bank']);
  assert.ok(ov >= 0.99);
  // sha256 is deterministic
  assert.equal(sha256('hello'), sha256('hello'));
  assert.notEqual(sha256('a'), sha256('b'));
  assert.equal(sha256('abc').length, 64);
});

test('injectTransport + loadList: mock fetcher feeds OFAC/EU/UN/IL_DECA', async () => {
  const s = makeScreener();
  s.injectTransport(makeTransport({
    OFAC: OFAC_V1,
    EU: EU_LIST,
    UN: UN_LIST,
    IL_DECA: IL_DECA_LIST,
  }));

  const ofac = await s.loadList('OFAC');
  const eu = await s.loadList('EU');
  const un = await s.loadList('UN');
  const il = await s.loadList('IL_DECA');

  assert.equal(ofac.source, 'OFAC');
  assert.equal(ofac.count, 3);
  assert.equal(eu.count, 2);
  assert.equal(un.count, 1);
  assert.equal(il.count, 1);

  // All four lists are present
  assert.equal(s.lists.size, 4);

  // Each has a SHA-256 checksum
  for (const src of ['OFAC', 'EU', 'UN', 'IL_DECA']) {
    const rec = s.lists.get(src);
    assert.ok(/^[a-f0-9]{64}$/.test(rec.checksum), `${src} checksum is sha256 hex`);
    assert.equal(rec.version, 1);
  }
});

test('loadList: rejects unknown source and missing transport', async () => {
  const s = makeScreener();
  await assert.rejects(() => s.loadList('BOGUS'), /unknown sanctions source/);
  await assert.rejects(() => s.loadList('OFAC'), /no transport injected/);
});

test('loadList: custom parser is invoked (CSV → entries)', async () => {
  const s = makeScreener();
  const csvParser = (payload) => {
    return payload.split('\n').filter(Boolean).map(line => {
      const [name, ...aliases] = line.split(';').map(x => x.trim());
      return { name, aliases };
    });
  };
  s.injectTransport(async () => 'Alpha Corp;Alpha\nBeta LLC;Beta\nGamma Ltd');
  const res = await s.loadList('OFAC', csvParser);
  assert.equal(res.count, 3);
  assert.equal(s.lists.get('OFAC').entries[0].name, 'Alpha Corp');
  assert.deepEqual(s.lists.get('OFAC').entries[0].aliases, ['Alpha']);
});

test('loadList: version bumps and delta alerts fire for new additions', async () => {
  const s = makeScreener();
  let version = 1;
  s.injectTransport(async () => (version === 1 ? OFAC_V1 : OFAC_V2));

  const r1 = await s.loadList('OFAC');
  assert.equal(r1.version, 1);
  assert.equal(r1.added.length, 3); // first load: everything is new
  assert.equal(s.alerts.length, 1);

  version = 2;
  const r2 = await s.loadList('OFAC');
  assert.equal(r2.version, 2);
  assert.equal(r2.added.length, 2); // OFAC-004, OFAC-005
  // Two alerts in total (one per load that had new additions)
  assert.equal(s.alerts.length, 2);
  assert.equal(s.alerts[1].type, 'new-additions');
  assert.equal(s.alerts[1].count, 2);

  // Checksums differ between V1 and V2
  assert.notEqual(
    sha256(JSON.stringify(OFAC_V1)),
    sha256(JSON.stringify(OFAC_V2)),
  );
});

test('fuzzyMatch: exact, alias, fuzzy (typo), and below-threshold', async () => {
  const s = makeScreener({ fuzzyThreshold: 0.82 });
  s.injectTransport(makeTransport({ OFAC: OFAC_V1 }));
  await s.loadList('OFAC');

  const entries = s.lists.get('OFAC').entries;
  const velayati = entries.find(e => e.name === 'Ali Akbar Velayati');

  // Exact
  const exact = s.fuzzyMatch('Ali Akbar Velayati', velayati);
  assert.ok(exact && exact.score === 1 && exact.matchedOn === 'exact');

  // Alias
  const alias = s.fuzzyMatch('Velayati, Ali', velayati);
  assert.ok(alias && alias.score === 1 && alias.matchedOn === 'alias');

  // Fuzzy typo (single-char typo in "Velayati")
  const typo = s.fuzzyMatch('Ali Akbar Velayti', velayati);
  assert.ok(typo, 'typo should still match');
  assert.ok(typo.score >= 0.82);
  assert.ok(['fuzzy', 'alias-fuzzy'].includes(typo.matchedOn));

  // Below threshold — completely unrelated
  const miss = s.fuzzyMatch('Totally Unrelated Person', velayati);
  assert.equal(miss, null);
});

test('screen: entity hits across OFAC+EU+IL_DECA and flags jurisdiction + israeli export keywords', async () => {
  const s = makeScreener();
  s.injectTransport(makeTransport({
    OFAC: OFAC_V1,
    EU: EU_LIST,
    UN: UN_LIST,
    IL_DECA: IL_DECA_LIST,
  }));
  await s.loadList('OFAC');
  await s.loadList('EU');
  await s.loadList('UN');
  await s.loadList('IL_DECA');

  const result = s.screen({
    name: 'Shahid Industries Group',
    country: 'Iran',
    goods: [{ description: 'פריט לשימוש כפול — titanium alloy parts' }],
  });

  assert.equal(result.query, 'Shahid Industries Group');
  assert.equal(result.clear, false);
  // Hits at minimum from IL_DECA
  assert.ok(result.hitsBySource.IL_DECA.length >= 1);
  // Jurisdiction blocked (Iran)
  assert.equal(result.jurisdictionBlocked.blocked, true);
  assert.equal(result.jurisdictionBlocked.jurisdiction, 'iran');
  assert.equal(result.jurisdictionBlocked.severity, 'critical');
  // Dual-use flag (titanium alloy)
  assert.equal(result.dualUseHits.flagged, true);
  // Israeli export flag
  assert.equal(result.israeliExportFlags.flagged, true);
  assert.ok(result.israeliExportFlags.matched.includes('פריט לשימוש כפול'));
  // Recommendation is block
  assert.equal(result.recommendation.action, 'block');
  assert.equal(result.recommendation.he, 'חסימה וביקורת מיידית');
});

test('screen: clean entity with valid end-use declaration is approved', async () => {
  const s = makeScreener();
  s.injectTransport(makeTransport({
    OFAC: OFAC_V1,
    EU: EU_LIST,
    UN: UN_LIST,
    IL_DECA: IL_DECA_LIST,
  }));
  await s.loadList('OFAC');
  await s.loadList('EU');
  await s.loadList('UN');
  await s.loadList('IL_DECA');

  const result = s.screen({
    name: 'Tel Aviv Widgets Ltd',
    country: 'Israel',
    goods: [{ description: 'Plastic widgets for toy factory' }],
    endUseDeclaration: {
      endUser: 'ACME Toys Germany GmbH',
      country: 'Germany',
      purpose: 'civil toy manufacturing',
      certifiesNoDiversion: true,
      signedBy: 'Hans Schmidt',
      signedAt: '2026-04-01',
    },
  });

  assert.equal(result.clear, true);
  assert.equal(result.totalHits, 0);
  assert.equal(result.jurisdictionBlocked.blocked, false);
  assert.equal(result.dualUseHits.flagged, false);
  assert.equal(result.israeliExportFlags.flagged, false);
  assert.equal(result.endUseValidation.valid, true);
  assert.equal(result.recommendation.action, 'approve');
});

test('checkJurisdiction: canonical keys, aliases, Hebrew names, substrings', () => {
  const s = makeScreener();
  assert.equal(s.checkJurisdiction('Iran').blocked, true);
  assert.equal(s.checkJurisdiction('ir').blocked, true);
  assert.equal(s.checkJurisdiction('Islamic Republic of Iran').blocked, true);
  assert.equal(s.checkJurisdiction('איראן').blocked, true);
  assert.equal(s.checkJurisdiction('צפון קוריאה').blocked, true);
  assert.equal(s.checkJurisdiction('DPRK').blocked, true);
  assert.equal(s.checkJurisdiction('Crimea Peninsula').blocked, true);
  assert.equal(s.checkJurisdiction('Germany').blocked, false);
  assert.equal(s.checkJurisdiction('').blocked, false);
  const iran = s.checkJurisdiction('Iran');
  assert.equal(iran.severity, 'critical');
  assert.equal(iran.he, 'איראן');
  assert.equal(iran.en, 'Iran');
});

test('checkDualUseGoods: metallurgy + aerospace + machine-tools are flagged', () => {
  const s = makeScreener();
  const res = s.checkDualUseGoods([
    { description: '500kg titanium alloy ingots (Ti-6Al-4V)' },
    { description: 'spare 5-axis CNC head' },
    { description: 'commercial polycarbonate sheet' }, // should NOT flag
  ]);
  assert.equal(res.flagged, true);
  assert.ok(res.hits.length >= 2);
  const cats = new Set(res.hits.map(h => h.category));
  assert.ok(cats.has('metallurgy'));
  assert.ok(cats.has('machine-tools'));
  // Hebrew label present
  const titanHit = res.hits.find(h => h.keyword === 'titanium');
  assert.equal(titanHit.categoryHe, 'מתכות ומוצרי מתכת לשימוש כפול');
});

test('validateEndUseDeclaration: missing fields, red flags, and happy path', () => {
  const s = makeScreener();

  // Missing everything
  const empty = s.validateEndUseDeclaration(null);
  assert.equal(empty.valid, false);
  assert.ok(empty.reasons.includes('missing-declaration'));

  // Partial structured
  const partial = s.validateEndUseDeclaration({
    endUser: 'Buyer',
    country: 'Germany',
    purpose: 'research',
  });
  assert.equal(partial.valid, false);
  assert.ok(partial.reasons.includes('missing-non-diversion-certification'));
  assert.ok(partial.reasons.includes('missing-signatory'));

  // Red-flag phrase (military application)
  const redFlag = s.validateEndUseDeclaration({
    endUser: 'Institute X',
    country: 'Germany',
    purpose: 'military application research on titanium',
    certifiesNoDiversion: true,
    signedBy: 'Dr. Y',
    signedAt: '2026-04-10',
  });
  assert.equal(redFlag.valid, false);
  assert.ok(redFlag.reasons.includes('red-flag-phrases'));
  assert.ok(redFlag.redFlags.includes('military application'));

  // Blocked destination
  const blocked = s.validateEndUseDeclaration({
    endUser: 'Tehran Lab',
    country: 'Iran',
    purpose: 'civil research',
    certifiesNoDiversion: true,
    signedBy: 'A',
    signedAt: '2026-04-10',
  });
  assert.equal(blocked.valid, false);
  assert.ok(blocked.reasons.includes('blocked-destination'));
  assert.equal(blocked.jurisdiction.jurisdiction, 'iran');

  // Happy path
  const good = s.validateEndUseDeclaration({
    endUser: 'ACME Toys Germany GmbH',
    country: 'Germany',
    purpose: 'civil toy manufacturing',
    certifiesNoDiversion: true,
    signedBy: 'Hans Schmidt',
    signedAt: '2026-04-01',
  });
  assert.equal(good.valid, true);
  assert.deepEqual(good.reasons, []);
});

test('false-positive review queue: fuzzy hits go in, resolve transitions state (never deletes)', async () => {
  const s = makeScreener();
  s.injectTransport(makeTransport({ OFAC: OFAC_V1 }));
  await s.loadList('OFAC');

  // Typo on Velayati → fuzzy hit → review queue
  const result = s.screen({ name: 'Ali Akbar Velayti' });
  assert.ok(result.totalHits >= 1);

  const pending = s.falsePositiveReview({ state: 'pending' });
  assert.ok(pending.length >= 1);
  const first = pending[0];

  const resolved = s.resolveReview(first.id, 'false-positive', 'compliance@uzi.co.il', 'typo');
  assert.equal(resolved.state, 'resolved-false-positive');
  assert.equal(resolved.reviewedBy, 'compliance@uzi.co.il');

  // Item is still present (never delete), only state changed
  const all = s.falsePositiveReview();
  assert.equal(all.length, pending.length);
  assert.equal(all.find(r => r.id === first.id).state, 'resolved-false-positive');

  // Unknown id rejected
  assert.throws(() => s.resolveReview('nope', 'false-positive'));
  assert.throws(() => s.resolveReview(first.id, 'bogus-decision'));
});

test('audit trail: append-only, logs every mutation (לא מוחקים)', async () => {
  const s = makeScreener();
  const before = s.auditTrail.length;

  s.injectTransport(makeTransport({ OFAC: OFAC_V1 }));
  await s.loadList('OFAC');
  s.screen({ name: 'Bank Melli Iran', country: 'Iran' });
  s.validateEndUseDeclaration({ country: 'Iran' });

  assert.ok(s.auditTrail.length > before);
  const actions = s.auditTrail.map(a => a.action);
  assert.ok(actions.includes('injectTransport'));
  assert.ok(actions.includes('loadList'));
  assert.ok(actions.includes('screen'));
  assert.ok(actions.includes('validateEndUseDeclaration'));

  // Every audit entry has ts + action + payload
  for (const entry of s.auditTrail) {
    assert.ok(entry.ts);
    assert.ok(entry.action);
    assert.ok(entry.payload);
  }
});

test('getChecksums + getAlerts + stats: reporting surface is present and bilingual RTL', async () => {
  const s = makeScreener();
  s.injectTransport(makeTransport({
    OFAC: OFAC_V1,
    EU: EU_LIST,
    UN: UN_LIST,
    IL_DECA: IL_DECA_LIST,
  }));
  await s.loadList('OFAC');
  await s.loadList('EU');
  await s.loadList('UN');
  await s.loadList('IL_DECA');

  const checksums = s.getChecksums();
  assert.equal(Object.keys(checksums).length, 4);
  for (const k of ['OFAC', 'EU', 'UN', 'IL_DECA']) {
    assert.ok(/^[a-f0-9]{64}$/.test(checksums[k].checksum));
    assert.equal(checksums[k].version, 1);
  }

  const alerts = s.getAlerts();
  assert.ok(alerts.length >= 4); // one per list on first load

  const stats = s.stats();
  assert.equal(stats.direction, 'rtl');
  assert.equal(stats.locale, 'he');
  assert.equal(Object.keys(stats.lists).length, 4);
  assert.ok(stats.auditEntries >= 4);
});

test('defaultParser: handles arrays, wrapped objects, JSON strings, CSV strings', () => {
  assert.deepEqual(defaultParser([{ name: 'A' }]), [{ name: 'A' }]);
  assert.deepEqual(defaultParser({ entries: [{ name: 'B' }] }), [{ name: 'B' }]);

  const jsonStr = JSON.stringify([{ name: 'C' }]);
  assert.deepEqual(defaultParser(jsonStr), [{ name: 'C' }]);

  const csv = 'Delta Corp,Delta\nEcho Ltd';
  const parsed = defaultParser(csv);
  assert.equal(parsed[0].name, 'Delta Corp');
  assert.deepEqual(parsed[0].aliases, ['Delta']);
  assert.equal(parsed[1].name, 'Echo Ltd');

  // Unknown payload
  assert.deepEqual(defaultParser(42), []);
});
