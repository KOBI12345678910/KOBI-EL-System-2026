/**
 * Tests — PEPScreener
 * Agent Y-147 — Techno-Kol Uzi ERP / Compliance
 * Zero-dep (node:assert + node:test)
 *
 * Runs with:
 *   node --test test/compliance/pep-screener.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PEPScreener,
  PEP_CATEGORY,
  PEP_CATEGORY_HE,
  RISK_LEVEL,
  OFFICE_BRANCH,
  OFFICE_BRANCH_HE,
  COOLING_OFF_MONTHS,
  REVIEW_INTERVAL_MONTHS,
  hebrewSoundex,
  englishSoundex,
  levenshtein,
  similarity,
  transliterateHebrew,
} = require('../../src/compliance/pep-screener');

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

/** Build a screener with a fixed clock so periodic-review logic is deterministic. */
function makeScreener(frozenAt = '2026-04-11T12:00:00Z') {
  let nowRef = new Date(frozenAt);
  const screener = new PEPScreener({ clock: () => nowRef });
  // expose so tests can advance time
  screener._setNow = (iso) => { nowRef = new Date(iso); };
  return screener;
}

function seedCabinet(screener) {
  screener.addWatchlist({
    id: 'IL-KNE-0001',
    name_he: 'יהודה כהן',
    name_en: 'Yehuda Cohen',
    category: PEP_CATEGORY.DOMESTIC,
    role: 'Knesset Member',
    role_he: 'חבר כנסת',
    branch: OFFICE_BRANCH.KNESSET,
    country: 'IL',
    startDate: '2023-01-15',
  });
  screener.addWatchlist({
    id: 'IL-CAB-0001',
    name_he: 'משה לוי',
    name_en: 'Moshe Levi',
    category: PEP_CATEGORY.DOMESTIC,
    role: 'Minister of Finance',
    role_he: 'שר האוצר',
    branch: OFFICE_BRANCH.CABINET,
    country: 'IL',
    startDate: '2024-03-01',
  });
  screener.addWatchlist({
    id: 'IL-IDF-0001',
    name_he: 'דוד ישראלי',
    name_en: 'David Israeli',
    category: PEP_CATEGORY.DOMESTIC,
    role: 'Major General (Aluf)',
    role_he: 'אלוף',
    branch: OFFICE_BRANCH.IDF_SENIOR,
    country: 'IL',
    startDate: '2024-01-01',
  });
  screener.addWatchlist({
    id: 'IL-JUD-0001',
    name_he: 'שרה כהן',
    name_en: 'Sarah Cohen',
    category: PEP_CATEGORY.DOMESTIC,
    role: 'Supreme Court Justice',
    role_he: 'שופטת בית המשפט העליון',
    branch: OFFICE_BRANCH.JUDICIARY,
    country: 'IL',
    startDate: '2022-06-01',
  });
  screener.addWatchlist({
    id: 'FR-FOR-0001',
    name_he: 'ז׳אן דופונט',
    name_en: 'Jean Dupont',
    category: PEP_CATEGORY.FOREIGN,
    role: 'Foreign Minister',
    role_he: 'שר חוץ',
    branch: OFFICE_BRANCH.CABINET,
    country: 'FR',
    startDate: '2023-09-01',
  });
  screener.addWatchlist({
    id: 'UN-IO-0001',
    name_he: 'מריה גונזלס',
    name_en: 'Maria Gonzales',
    category: PEP_CATEGORY.INTERNATIONAL_ORG,
    role: 'UN Under-Secretary-General',
    role_he: 'סגנית מזכ״ל האו״ם',
    country: 'INT',
    startDate: '2022-02-01',
  });
  screener.addWatchlist({
    id: 'IL-FAM-0001',
    name_he: 'רחל לוי',
    name_en: 'Rachel Levi',
    category: PEP_CATEGORY.FAMILY_MEMBER,
    relationTo: 'IL-CAB-0001',
    relationType: 'spouse',
    country: 'IL',
    startDate: '2024-03-01',
  });
  screener.addWatchlist({
    id: 'IL-ASSOC-0001',
    name_he: 'יוסי פרידמן',
    name_en: 'Yossi Friedman',
    category: PEP_CATEGORY.CLOSE_ASSOCIATE,
    relationTo: 'IL-KNE-0001',
    relationType: 'partner',
    country: 'IL',
    startDate: '2023-01-15',
    notes: 'business partner / שותף עסקי',
  });
}

// ─────────────────────────────────────────────────────────────
// tests
// ─────────────────────────────────────────────────────────────

test('constants + exports are frozen and bilingual', () => {
  assert.equal(PEP_CATEGORY.DOMESTIC, 'domestic');
  assert.equal(PEP_CATEGORY.FOREIGN, 'foreign');
  assert.equal(PEP_CATEGORY.INTERNATIONAL_ORG, 'international-org');
  assert.equal(PEP_CATEGORY.FAMILY_MEMBER, 'family-member');
  assert.equal(PEP_CATEGORY.CLOSE_ASSOCIATE, 'close-associate');
  assert.equal(PEP_CATEGORY_HE[PEP_CATEGORY.DOMESTIC], 'איש ציבור מקומי');
  assert.equal(PEP_CATEGORY_HE[PEP_CATEGORY.FOREIGN], 'איש ציבור זר');
  assert.equal(RISK_LEVEL.HIGH, 'HIGH');
  assert.equal(OFFICE_BRANCH_HE[OFFICE_BRANCH.KNESSET], 'כנסת');
  assert.equal(COOLING_OFF_MONTHS, 12);
  assert.equal(REVIEW_INTERVAL_MONTHS, 12);
  // Immutability
  assert.throws(() => { PEP_CATEGORY.DOMESTIC = 'xxx'; }, TypeError);
});

test('addWatchlist: validates category and stores pre-computed match keys', () => {
  const s = makeScreener();
  const rec = s.addWatchlist({
    name_he: 'יהודה כהן',
    name_en: 'Yehuda Cohen',
    category: PEP_CATEGORY.DOMESTIC,
    role: 'Knesset Member',
    role_he: 'חבר כנסת',
    branch: OFFICE_BRANCH.KNESSET,
    startDate: '2023-01-01',
  });
  assert.ok(rec.id);
  assert.equal(rec.category, PEP_CATEGORY.DOMESTIC);
  assert.equal(rec.category_he, 'איש ציבור מקומי');
  assert.equal(rec.branch_he, 'כנסת');
  assert.ok(rec._keyHe.length > 0);
  assert.ok(rec._keyLat.length > 0);
  assert.ok(rec._soundexHe.length === 4);
  assert.ok(rec._soundexEn.length === 4);

  // invalid category
  assert.throws(
    () => s.addWatchlist({ name_he: 'x', category: 'not-a-real-cat' }),
    /invalid category/,
  );
  // missing name
  assert.throws(
    () => s.addWatchlist({ category: PEP_CATEGORY.DOMESTIC }),
    /name_he or name_en required/,
  );
  // invalid branch
  assert.throws(
    () => s.addWatchlist({
      name_he: 'x',
      category: PEP_CATEGORY.DOMESTIC,
      branch: 'bogus-branch',
    }),
    /invalid branch/,
  );
});

test('screen: exact Hebrew match returns isPEP=true, HIGH risk, EDD required', () => {
  const s = makeScreener();
  seedCabinet(s);
  const res = s.screen({ name_he: 'יהודה כהן' });
  assert.equal(res.isPEP, true);
  assert.equal(res.category, PEP_CATEGORY.DOMESTIC);
  assert.equal(res.category_he, 'איש ציבור מקומי');
  assert.equal(res.riskRating, RISK_LEVEL.HIGH);
  assert.equal(res.eddRequired, true);
  assert.equal(res.bestMatch.entry.id, 'IL-KNE-0001');
  assert.equal(res.bestMatch.method, 'exact-hebrew');
  assert.ok(res.bestMatch.score >= 0.99);
  assert.ok(res.matches.length >= 1);
});

test('fuzzyMatch: Yehuda ↔ Yehudah variant is detected via alias map', () => {
  const s = makeScreener();
  seedCabinet(s);
  // English variant
  const res1 = s.screen({ name_en: 'Yehudah Cohen' });
  assert.equal(res1.isPEP, true, 'Yehudah Cohen should hit Yehuda Cohen');
  assert.equal(res1.bestMatch.entry.id, 'IL-KNE-0001');
  assert.ok(['variant-alias', 'exact-latin', 'levenshtein-latin', 'english-soundex']
    .includes(res1.bestMatch.method));

  // Jehuda variant
  const res2 = s.screen({ name_en: 'Jehuda Cohen' });
  assert.equal(res2.isPEP, true, 'Jehuda Cohen should hit Yehuda Cohen');
  assert.equal(res2.bestMatch.entry.id, 'IL-KNE-0001');
});

test('fuzzyMatch: Levenshtein catches single-char typos (Moshe → Moshi/Moshe)', () => {
  const s = makeScreener();
  seedCabinet(s);
  const res = s.screen({ name_en: 'Moshe Levii' }); // extra i
  assert.equal(res.isPEP, true);
  assert.equal(res.bestMatch.entry.id, 'IL-CAB-0001');
  const method = res.bestMatch.method;
  assert.ok(
    ['levenshtein-latin', 'variant-alias', 'english-soundex', 'exact-latin'].includes(method),
    `expected levenshtein/variant/soundex, got ${method}`,
  );
});

test('fuzzyMatch: Hebrew Soundex catches phonetic near-miss', () => {
  const s = makeScreener();
  seedCabinet(s);
  // Length invariant — always padded to 4 chars
  const soundexMoshe = hebrewSoundex('משה לוי');
  assert.equal(soundexMoshe.length, 4);
  assert.equal(hebrewSoundex('לוי').length, 4);

  // Phonetic equivalence — כהן ↔ קהן (k vs q), שרון ↔ סרון (sh vs s),
  // both pairs collapse because כ/ק/ש/ס all sit in the sibilant/velar group.
  assert.equal(hebrewSoundex('כהן'), hebrewSoundex('קהן'));
  assert.equal(hebrewSoundex('שרון'), hebrewSoundex('סרון'));

  // Fuzzy screening still fires on a near-miss: a Hebrew typo of a
  // watchlisted name should still be flagged through soundex + levenshtein.
  const res = s.screen({ name_he: 'משא לוי' }); // א instead of ה
  assert.equal(res.isPEP, true, 'phonetic near-miss must still match');
  assert.equal(res.bestMatch.entry.id, 'IL-CAB-0001');
});

test('riskRating: default HIGH; PROHIBITED when entry flagged', () => {
  const s = makeScreener();
  seedCabinet(s);
  const knes = s.getEntry('IL-KNE-0001');
  assert.equal(s.riskRating(knes), RISK_LEVEL.HIGH);
  assert.equal(s.riskRating(null), RISK_LEVEL.LOW);
  knes.prohibited = true;
  assert.equal(s.riskRating(knes), RISK_LEVEL.PROHIBITED);
});

test('enhancedDueDiligenceRequired: true for any match, false for null', () => {
  const s = makeScreener();
  seedCabinet(s);
  assert.equal(s.enhancedDueDiligenceRequired(s.getEntry('IL-KNE-0001')), true);
  assert.equal(s.enhancedDueDiligenceRequired(s.getEntry('IL-FAM-0001')), true);
  assert.equal(s.enhancedDueDiligenceRequired(s.getEntry('UN-IO-0001')), true);
  assert.equal(s.enhancedDueDiligenceRequired(null), false);
});

test('removeWatchlist: preserves the record, marks inactive, audit-logged (לא מוחקים)', () => {
  const s = makeScreener();
  seedCabinet(s);
  const beforeCount = s.getAllEntries({ includeInactive: true }).length;
  s.removeWatchlist({ id: 'IL-KNE-0001', actor: 'compliance-officer', reason: 'term ended / סיום כהונה' });

  // Record still exists (not deleted)
  const e = s.getEntry('IL-KNE-0001');
  assert.ok(e, 'entry must still be retrievable');
  assert.equal(e.active, false);
  assert.equal(e.deactivatedBy, 'compliance-officer');
  assert.ok(e.deactivatedAt instanceof Date);
  assert.match(e.deactivationReason, /term ended/);

  // Count of inactive-included entries unchanged
  assert.equal(s.getAllEntries({ includeInactive: true }).length, beforeCount);
  // Active-only count decreased
  assert.equal(s.getAllEntries().length, beforeCount - 1);

  // Audit log contains the event
  const hist = s.getHistory({ action: 'removeWatchlist' });
  assert.equal(hist.length, 1);
  assert.equal(hist[0].details.id, 'IL-KNE-0001');
  assert.equal(hist[0].details.actor, 'compliance-officer');

  // Screen no longer hits it
  const res = s.screen({ name_he: 'יהודה כהן' });
  assert.equal(res.isPEP, false);

  // Required args enforced
  assert.throws(() => s.removeWatchlist({ id: 'x' }), /actor required/);
  assert.throws(() => s.removeWatchlist({ actor: 'a' }), /id required/);
  assert.throws(
    () => s.removeWatchlist({ id: 'does-not-exist', actor: 'a' }),
    /unknown id/,
  );
});

test('searchByRole: supports string branch + object filter (judiciary, IDF, Knesset)', () => {
  const s = makeScreener();
  seedCabinet(s);
  const knes = s.searchByRole('knesset');
  assert.equal(knes.length, 1);
  assert.equal(knes[0].id, 'IL-KNE-0001');

  const jud = s.searchByRole(OFFICE_BRANCH.JUDICIARY);
  assert.equal(jud.length, 1);
  assert.equal(jud[0].id, 'IL-JUD-0001');

  const idf = s.searchByRole(OFFICE_BRANCH.IDF_SENIOR);
  assert.equal(idf.length, 1);
  assert.equal(idf[0].role_he, 'אלוף');

  const cabIL = s.searchByRole({ branch: OFFICE_BRANCH.CABINET, country: 'IL' });
  assert.equal(cabIL.length, 1);
  assert.equal(cabIL[0].id, 'IL-CAB-0001');

  const cabFR = s.searchByRole({ branch: OFFICE_BRANCH.CABINET, country: 'FR' });
  assert.equal(cabFR.length, 1);
  assert.equal(cabFR[0].id, 'FR-FOR-0001');
});

test('periodicReview: flags entries older than 12 months; mark-reviewed updates them', () => {
  const s = makeScreener('2026-04-11T00:00:00Z');
  s.addWatchlist({
    id: 'OLD-1',
    name_he: 'ישן ישן',
    category: PEP_CATEGORY.DOMESTIC,
    branch: OFFICE_BRANCH.MINISTRY,
    startDate: '2022-01-01',
  });
  s.addWatchlist({
    id: 'NEW-1',
    name_he: 'חדש חדש',
    category: PEP_CATEGORY.DOMESTIC,
    branch: OFFICE_BRANCH.MINISTRY,
    startDate: '2026-01-01',
  });
  // Force lastReviewedAt back on OLD-1 (simulate stale record)
  s.getEntry('OLD-1').lastReviewedAt = new Date('2024-01-01T00:00:00Z');
  s.getEntry('NEW-1').lastReviewedAt = new Date('2026-01-01T00:00:00Z');

  const due = s.periodicReview();
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'OLD-1');

  // Mark reviewed
  const due2 = s.periodicReview({ markReviewed: true, actor: 'amlo-officer' });
  assert.equal(due2.length, 1);
  assert.equal(s.getEntry('OLD-1').lastReviewedAt.toISOString(),
    new Date('2026-04-11T00:00:00Z').toISOString());

  // Next call: nothing due
  const due3 = s.periodicReview();
  assert.equal(due3.length, 0);

  // Audit trail records the review
  const hist = s.getHistory({ action: 'periodicReview' });
  assert.ok(hist.length >= 1);
  assert.equal(hist[hist.length - 1].details.actor, 'amlo-officer');
});

test('cooling-off: PEP status persists exactly 12 months after endDate, then lapses', () => {
  const s = makeScreener('2026-04-11T00:00:00Z');
  s.addWatchlist({
    id: 'EX-1',
    name_he: 'לשעבר כהן',
    name_en: 'Former Cohen',
    category: PEP_CATEGORY.DOMESTIC,
    branch: OFFICE_BRANCH.MINISTRY,
    startDate: '2020-01-01',
    endDate: '2026-01-01', // 3 months ago → still in cooling-off
  });
  const res1 = s.screen({ name_he: 'לשעבר כהן' });
  assert.equal(res1.isPEP, true, 'within cooling-off must still be PEP');

  // Advance time to >12 months after endDate
  s._setNow('2027-02-01T00:00:00Z');
  const res2 = s.screen({ name_he: 'לשעבר כהן' });
  assert.equal(res2.isPEP, false, 'past 12-month cooling-off must no longer be PEP');
});

test('family members + close associates are screened like principals', () => {
  const s = makeScreener();
  seedCabinet(s);
  const fam = s.screen({ name_he: 'רחל לוי' });
  assert.equal(fam.isPEP, true);
  assert.equal(fam.category, PEP_CATEGORY.FAMILY_MEMBER);
  assert.equal(fam.bestMatch.entry.relationTo, 'IL-CAB-0001');
  assert.equal(fam.eddRequired, true);
  assert.equal(fam.riskRating, RISK_LEVEL.HIGH);

  const assoc = s.screen({ name_en: 'Yossi Friedman' });
  assert.equal(assoc.isPEP, true);
  assert.equal(assoc.category, PEP_CATEGORY.CLOSE_ASSOCIATE);
  assert.equal(assoc.bestMatch.entry.relationTo, 'IL-KNE-0001');
});

test('international org PEPs are matched and categorised correctly', () => {
  const s = makeScreener();
  seedCabinet(s);
  const res = s.screen({ name_en: 'Maria Gonzales' });
  assert.equal(res.isPEP, true);
  assert.equal(res.category, PEP_CATEGORY.INTERNATIONAL_ORG);
  assert.equal(res.bestMatch.entry.id, 'UN-IO-0001');

  const res2 = s.screen({ name_en: 'Jean Dupont' });
  assert.equal(res2.isPEP, true);
  assert.equal(res2.category, PEP_CATEGORY.FOREIGN);
});

test('history log is append-only and ordered (לא מוחקים)', () => {
  const s = makeScreener();
  seedCabinet(s);
  s.screen({ name_he: 'יהודה כהן' });
  s.screen({ name_he: 'לא קיים' });
  s.removeWatchlist({ id: 'FR-FOR-0001', actor: 'op', reason: 'term ended' });

  const hist = s.getHistory();
  assert.ok(hist.length >= 10);
  // seq numbers strictly increasing
  for (let i = 1; i < hist.length; i++) {
    assert.ok(hist[i].seq > hist[i - 1].seq, 'seq must be monotonic');
  }
  // contains all expected action kinds
  const actions = new Set(hist.map(h => h.action));
  assert.ok(actions.has('addWatchlist'));
  assert.ok(actions.has('screen'));
  assert.ok(actions.has('removeWatchlist'));

  // filter by action
  const onlyAdds = s.getHistory({ action: 'addWatchlist' });
  assert.ok(onlyAdds.length >= 8);
  for (const e of onlyAdds) assert.equal(e.action, 'addWatchlist');

  // getHistory returns a shallow COPY (mutations don't bleed back)
  onlyAdds[0].action = 'tampered';
  assert.equal(s.getHistory({ action: 'addWatchlist' })[0].action, 'addWatchlist');
});

test('utility helpers: hebrewSoundex + englishSoundex + levenshtein + transliterate', () => {
  // Hebrew Soundex sanity
  assert.equal(hebrewSoundex('כהן').length, 4);
  assert.equal(hebrewSoundex('כהן'), hebrewSoundex('קהן')); // k/q equivalent
  // English Soundex classic: Robert → R163
  assert.equal(englishSoundex('Robert'), 'R163');
  assert.equal(englishSoundex('Rupert'), 'R163');
  // Levenshtein
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
  // Similarity
  assert.ok(similarity('yehuda', 'yehudah') >= 0.85);
  assert.equal(similarity('abc', 'abc'), 1);
  assert.equal(similarity('', ''), 1);
  // Transliteration: יהודה → starts with y, contains h+d+h-ish letters.
  // Hebrew is unvoweled so we don't require every vowel to appear — we
  // only assert structural presence of the consonants (y, h, d / v).
  const t = transliterateHebrew('יהודה');
  assert.equal(t[0], 'y', `transliteration should start with y, got "${t}"`);
  assert.match(t, /[hd]/, `transliteration should contain h or d, got "${t}"`);
  // Roundtrip: a transliterated name should be non-empty
  assert.ok(t.length >= 3, `transliteration too short: "${t}"`);
  // Cohen / כהן
  const tc = transliterateHebrew('כהן');
  assert.ok(tc.length >= 2, `transliteration of כהן too short: "${tc}"`);
});

test('stats: summarises state, bilingual labels', () => {
  const s = makeScreener();
  seedCabinet(s);
  const stats = s.stats();
  assert.equal(stats.total, 8);
  assert.equal(stats.active, 8);
  assert.equal(stats.inactive, 0);
  assert.equal(stats.byCategory[PEP_CATEGORY.DOMESTIC], 4);
  assert.equal(stats.byCategory[PEP_CATEGORY.FOREIGN], 1);
  assert.equal(stats.byCategory[PEP_CATEGORY.INTERNATIONAL_ORG], 1);
  assert.equal(stats.byCategory[PEP_CATEGORY.FAMILY_MEMBER], 1);
  assert.equal(stats.byCategory[PEP_CATEGORY.CLOSE_ASSOCIATE], 1);
  assert.equal(stats.labels.he, 'סיכום מסך PEP');
  assert.equal(stats.labels.en, 'PEP screener summary');
  assert.ok(stats.historyCount >= 8);

  // After removeWatchlist, inactive increments
  s.removeWatchlist({ id: 'IL-KNE-0001', actor: 'op', reason: 'test' });
  const s2 = s.stats();
  assert.equal(s2.active, 7);
  assert.equal(s2.inactive, 1);
  assert.equal(s2.total, 8, 'never delete — total unchanged');
});

test('screen: non-PEP returns isPEP=false, LOW risk, no EDD', () => {
  const s = makeScreener();
  seedCabinet(s);
  const res = s.screen({ name_he: 'אדם פרטי', name_en: 'Private Adam' });
  assert.equal(res.isPEP, false);
  assert.equal(res.category, null);
  assert.equal(res.riskRating, RISK_LEVEL.LOW);
  assert.equal(res.eddRequired, false);
  assert.equal(res.bestMatch, null);
  assert.deepEqual(res.matches, []);

  // Missing name throws
  assert.throws(() => s.screen({}), /name_he or name_en required/);
});

test('seeded constructor: screener accepts seed[] and pre-populates watchlist', () => {
  const s = new PEPScreener({
    matchThreshold: 0.82,
    seed: [
      {
        id: 'SEED-1',
        name_he: 'בנימין אברהם',
        name_en: 'Binyamin Avraham',
        category: PEP_CATEGORY.DOMESTIC,
        branch: OFFICE_BRANCH.KNESSET,
      },
    ],
  });
  assert.equal(s.getAllEntries().length, 1);
  // Variant alias Benjamin ↔ Binyamin should hit
  const res = s.screen({ name_en: 'Benjamin Avraham' });
  assert.equal(res.isPEP, true);
  assert.equal(res.bestMatch.entry.id, 'SEED-1');
});
