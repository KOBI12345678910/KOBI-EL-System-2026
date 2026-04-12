/**
 * Contract Clause Library — Unit Tests  |  מבחני ספריית סעיפי חוזה
 * =====================================================================
 *
 * Agent Y-116  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/docs/clause-library.test.js
 *      or:    node --test
 *
 * Covers (>=18 tests):
 *   1.  addClause — happy path, v1 stored
 *   2.  addClause — validation (category, required fields, risk)
 *   3.  addClause — rejects duplicate id
 *   4.  upgradeClause — append-only, head points to new version
 *   5.  upgradeClause — previous version still retrievable
 *   6.  upgradeClause — rejects non-increasing version
 *   7.  getClause — lang=he vs lang=en preferred field
 *   8.  getClause — specific version lookup
 *   9.  searchClauses — TF-IDF ranks query hits
 *  10.  searchClauses — category filter
 *  11.  assembleContract — variable substitution {party1} {amount}
 *  12.  assembleContract — surfaces unresolved variables
 *  13.  assembleContract — missing clause rejected
 *  14.  compareClauseVersions — diff stats added/removed
 *  15.  riskScore — aggregates included clauses
 *  16.  riskScore — empty contract = 0
 *  17.  alternativeClauses — same category, different risk
 *  18.  approvalWorkflow — mixed decisions → needs-revision
 *  19.  approvalWorkflow — all approved flips clause.approvalStatus
 *  20.  usageAnalytics — counts by template with period filter
 *  21.  deprecateClause — soft, preserves versions & usage
 *  22.  deprecateClause — getClause returns redirect hint
 *  23.  bilingualPairing — detects numeric mismatch
 *  24.  bilingualPairing — detects variable mismatch
 *  25.  event log append-only ordering
 *  26.  glossary + Israeli law citations present
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ClauseLibrary,
  CATEGORIES,
  HEBREW_GLOSSARY,
  IL_LAW_CITATIONS,
  RISK_LEVELS,
} = require('../../src/docs/clause-library.js');

/* ------------------------------------------------------------------
 * Fixture factory — a deterministic library with a handful of clauses
 * ------------------------------------------------------------------ */

function makeLib(now = Date.UTC(2026, 3, 11)) {
  let clock = now;
  const lib = new ClauseLibrary({ now: () => (clock += 1000) });
  return lib;
}

function seedBasic(lib) {
  lib.addClause({
    id: 'CL-NDA-001',
    category: 'confidentiality',
    title_he: 'סעיף סודיות',
    title_en: 'Confidentiality Clause',
    text_he: 'הצדדים מתחייבים לשמור בסודיות מלאה כל מידע שנמסר במסגרת ההתקשרות בין {party1} לבין {party2} לתקופה של 5 שנים.',
    text_en: 'The parties undertake full confidentiality regarding all information disclosed between {party1} and {party2} for a period of 5 years.',
    variables: ['party1', 'party2'],
    legalCitation: ['IL-CONTRACTS-GENERAL'],
    riskLevel: 'medium',
    approvedBy: 'legal-head',
    jurisdiction: ['IL'],
  });

  lib.addClause({
    id: 'CL-PAY-001',
    category: 'payment',
    title_he: 'תנאי תשלום',
    title_en: 'Payment Terms',
    text_he: 'סכום ההסכם הוא {amount} {currency}. התשלום יבוצע תוך 30 ימים מיום {date}.',
    text_en: 'The agreement amount is {amount} {currency}. Payment shall be made within 30 days of {date}.',
    legalCitation: ['IL-SALE-LAW'],
    riskLevel: 'low',
    approvedBy: 'cfo',
    jurisdiction: ['IL'],
  });

  lib.addClause({
    id: 'CL-LIAB-001',
    category: 'liability',
    title_he: 'הגבלת אחריות',
    title_en: 'Limitation of Liability',
    text_he: 'האחריות הכוללת של {party1} לא תעלה על {amount} {currency}.',
    text_en: 'Total liability of {party1} shall not exceed {amount} {currency}.',
    legalCitation: ['IL-CONTRACTS-REMEDIES'],
    riskLevel: 'high',
    approvedBy: 'legal-head',
    jurisdiction: ['IL'],
  });

  lib.addClause({
    id: 'CL-LIAB-002',
    category: 'liability',
    title_he: 'אחריות מוגבלת מאוד',
    title_en: 'Mutual Limitation of Liability',
    text_he: 'שני הצדדים מגבילים אחריות הדדית לסך של {amount} {currency}.',
    text_en: 'Both parties mutually limit liability to a sum of {amount} {currency}.',
    legalCitation: ['IL-CONTRACTS-REMEDIES'],
    riskLevel: 'low',
    approvedBy: 'legal-head',
    jurisdiction: ['IL'],
  });
}

/* =========================================================
 * 1.  addClause — happy path
 * ========================================================= */
test('1. addClause stores v1 with frozen metadata', () => {
  const lib = makeLib();
  const result = lib.addClause({
    id: 'CL-FM-001',
    category: 'force-majeure',
    title_he: 'כוח עליון',
    title_en: 'Force Majeure',
    text_he: 'בקרות אירוע של כוח עליון, הצדדים פטורים מקיום ההסכם.',
    text_en: 'In the event of force majeure, the parties are excused from performance.',
    legalCitation: ['IL-CONTRACTS-GENERAL'],
    riskLevel: 'low',
    jurisdiction: ['IL'],
  });
  assert.equal(result.clauseId, 'CL-FM-001');
  assert.equal(result.version, 1);
  const got = lib.getClause('CL-FM-001');
  assert.equal(got.currentVersion, 1);
  assert.equal(got.category, 'force-majeure');
  assert.equal(got.riskLevel, 'low');
  assert.deepEqual(Array.from(got.jurisdiction), ['IL']);
});

/* =========================================================
 * 2.  addClause — validation
 * ========================================================= */
test('2. addClause validates category, required fields, risk', () => {
  const lib = makeLib();
  assert.throws(() => lib.addClause({
    id: 'X', category: 'bogus',
    title_he: 'א', title_en: 'A',
    text_he: 'ב', text_en: 'B',
    riskLevel: 'low',
  }), /INVALID_CATEGORY/);

  assert.throws(() => lib.addClause({
    id: 'X', category: 'payment',
    title_he: '', title_en: 'A',
    text_he: 'ב', text_en: 'B',
    riskLevel: 'low',
  }), /INVALID_TITLE_HE/);

  assert.throws(() => lib.addClause({
    id: 'X', category: 'payment',
    title_he: 'א', title_en: 'A',
    text_he: 'ב', text_en: 'B',
    riskLevel: 'ultra',
  }), /INVALID_RISK_LEVEL/);
});

/* =========================================================
 * 3.  addClause — duplicate id
 * ========================================================= */
test('3. addClause rejects duplicate id', () => {
  const lib = makeLib();
  seedBasic(lib);
  assert.throws(() => lib.addClause({
    id: 'CL-PAY-001', category: 'payment',
    title_he: 'ב', title_en: 'B',
    text_he: 'ב', text_en: 'B',
    riskLevel: 'low',
  }), /CLAUSE_ALREADY_EXISTS/);
});

/* =========================================================
 * 4.  upgradeClause — appends new version, head advances
 * ========================================================= */
test('4. upgradeClause appends v2 and head advances', () => {
  const lib = makeLib();
  seedBasic(lib);
  const upgraded = lib.upgradeClause('CL-NDA-001', 2, {
    text_he: 'הצדדים מתחייבים לשמור בסודיות מלאה כל מידע שנמסר במסגרת ההתקשרות בין {party1} לבין {party2} לתקופה של 7 שנים.',
    text_en: 'The parties undertake full confidentiality regarding all information disclosed between {party1} and {party2} for a period of 7 years.',
    riskLevel: 'high',
    changeNote: 'Extended retention to 7 years',
  });
  assert.equal(upgraded.version, 2);
  const head = lib.getClause('CL-NDA-001');
  assert.equal(head.currentVersion, 2);
  assert.equal(head.riskLevel, 'high');
  assert.match(head.text_he, /7 שנים/);
});

/* =========================================================
 * 5.  upgradeClause — prior version retrievable
 * ========================================================= */
test('5. upgradeClause preserves prior versions (append-only)', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.upgradeClause('CL-NDA-001', 2, { riskLevel: 'high', changeNote: 'risk raised' });
  const v1 = lib.getClause('CL-NDA-001', { version: 1 });
  assert.equal(v1.requestedVersion, 1);
  assert.equal(v1.riskLevel, 'medium'); // original
  assert.match(v1.text_he, /5 שנים/);
  const versions = lib.listVersions('CL-NDA-001');
  assert.equal(versions.length, 2);
});

/* =========================================================
 * 6.  upgradeClause — rejects non-increasing version
 * ========================================================= */
test('6. upgradeClause rejects non-increasing version number', () => {
  const lib = makeLib();
  seedBasic(lib);
  assert.throws(() => lib.upgradeClause('CL-NDA-001', 1, {}), /INVALID_NEW_VERSION/);
});

/* =========================================================
 * 7.  getClause — lang preference
 * ========================================================= */
test('7. getClause returns preferred field in requested language', () => {
  const lib = makeLib();
  seedBasic(lib);
  const he = lib.getClause('CL-NDA-001', { lang: 'he' });
  const en = lib.getClause('CL-NDA-001', { lang: 'en' });
  assert.equal(he.preferred.lang, 'he');
  assert.equal(he.preferred.title, 'סעיף סודיות');
  assert.equal(en.preferred.lang, 'en');
  assert.equal(en.preferred.title, 'Confidentiality Clause');
});

/* =========================================================
 * 8.  getClause — specific version
 * ========================================================= */
test('8. getClause supports explicit version lookup', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.upgradeClause('CL-PAY-001', 2, {
    text_he: 'סכום ההסכם הוא {amount} {currency}. התשלום יבוצע תוך 45 ימים מיום {date}.',
    text_en: 'The agreement amount is {amount} {currency}. Payment shall be made within 45 days of {date}.',
    changeNote: '45-day terms',
  });
  const v1 = lib.getClause('CL-PAY-001', { version: 1 });
  const v2 = lib.getClause('CL-PAY-001', { version: 2 });
  assert.match(v1.text_he, /30 ימים/);
  assert.match(v2.text_he, /45 ימים/);
});

/* =========================================================
 * 9.  searchClauses — TF-IDF ranking
 * ========================================================= */
test('9. searchClauses ranks query hits (TF-IDF)', () => {
  const lib = makeLib();
  seedBasic(lib);
  const results = lib.searchClauses({ query: 'אחריות' });
  assert.ok(results.length >= 1);
  // The two liability clauses should rank above confidentiality
  const topCats = results.slice(0, 2).map((r) => r.category);
  assert.ok(topCats.every((c) => c === 'liability'));
});

/* =========================================================
 * 10.  searchClauses — category filter
 * ========================================================= */
test('10. searchClauses filters by category', () => {
  const lib = makeLib();
  seedBasic(lib);
  const results = lib.searchClauses({ category: 'payment' });
  assert.equal(results.length, 1);
  assert.equal(results[0].clauseId, 'CL-PAY-001');
});

/* =========================================================
 * 11.  assembleContract — variable substitution
 * ========================================================= */
test('11. assembleContract substitutes {party1} {amount} {currency} {date}', () => {
  const lib = makeLib();
  seedBasic(lib);
  const contract = lib.assembleContract({
    templateId: 'TMPL-SAAS-2026',
    clauseIds: ['CL-NDA-001', 'CL-PAY-001', 'CL-LIAB-001'],
    variables: {
      party1: 'Techno-Kol Uzi בע"מ',
      party2: 'Acme Supplier Ltd',
      amount: 500000,
      currency: 'ILS',
      date: '2026-05-01',
    },
  });
  assert.match(contract.contract_he, /Techno-Kol Uzi בע"מ/);
  assert.match(contract.contract_he, /Acme Supplier Ltd/);
  assert.match(contract.contract_he, /500000/);
  assert.match(contract.contract_he, /ILS/);
  assert.match(contract.contract_en, /Techno-Kol Uzi/);
  assert.match(contract.contract_en, /ILS/);
  assert.equal(contract.unresolvedVariables.length, 0);
  assert.equal(contract.includedClauses.length, 3);
});

/* =========================================================
 * 12.  assembleContract — surfaces unresolved variables
 * ========================================================= */
test('12. assembleContract reports unresolved variables', () => {
  const lib = makeLib();
  seedBasic(lib);
  const contract = lib.assembleContract({
    templateId: 'TMPL-X',
    clauseIds: ['CL-PAY-001'],
    variables: { amount: 1000 }, // currency + date omitted
  });
  const unresolved = new Set(contract.unresolvedVariables);
  assert.ok(unresolved.has('currency'));
  assert.ok(unresolved.has('date'));
});

/* =========================================================
 * 13.  assembleContract — missing clause error
 * ========================================================= */
test('13. assembleContract rejects missing clause ids', () => {
  const lib = makeLib();
  seedBasic(lib);
  assert.throws(() => lib.assembleContract({
    templateId: 'TMPL-Z',
    clauseIds: ['CL-NDA-001', 'CL-DOES-NOT-EXIST'],
    variables: { party1: 'A', party2: 'B' },
  }), /MISSING_CLAUSES/);
});

/* =========================================================
 * 14.  compareClauseVersions — diff stats
 * ========================================================= */
test('14. compareClauseVersions returns diff with add/remove counts', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.upgradeClause('CL-NDA-001', 2, {
    text_he: 'הצדדים מתחייבים לשמור בסודיות מלאה. כל מידע בין {party1} לבין {party2} יישמר 7 שנים.',
    text_en: 'The parties undertake full confidentiality. All information between {party1} and {party2} shall be kept 7 years.',
    riskLevel: 'high',
    changeNote: 'restructure',
  });
  const diff = lib.compareClauseVersions('CL-NDA-001', 1, 2);
  assert.equal(diff.from, 1);
  assert.equal(diff.to, 2);
  assert.equal(diff.riskChanged, true);
  assert.equal(diff.riskFrom, 'medium');
  assert.equal(diff.riskTo, 'high');
  assert.ok(diff.stats_he.added >= 1);
  assert.ok(diff.stats_he.removed >= 1);
  assert.ok(diff.stats_en.added >= 1);
});

/* =========================================================
 * 15.  riskScore — aggregates included clauses
 * ========================================================= */
test('15. riskScore aggregates weights from clauses found in text', () => {
  const lib = makeLib();
  seedBasic(lib);
  const fake = [
    'Confidentiality Clause — whatever',
    'Limitation of Liability — whatever',
    'Payment Terms — whatever',
  ].join('\n\n');
  const r = lib.riskScore(fake);
  assert.ok(r.score > 0);
  assert.ok(r.matchedClauses.length >= 3);
  assert.ok(['low', 'medium', 'high', 'critical'].includes(r.level));
});

/* =========================================================
 * 16.  riskScore — empty contract
 * ========================================================= */
test('16. riskScore returns zero for empty contract', () => {
  const lib = makeLib();
  seedBasic(lib);
  const r = lib.riskScore('');
  assert.equal(r.score, 0);
  assert.equal(r.level, 'low');
  assert.equal(r.matchedClauses.length, 0);
});

/* =========================================================
 * 17.  alternativeClauses — same category, different risk
 * ========================================================= */
test('17. alternativeClauses finds same-category different-risk clauses', () => {
  const lib = makeLib();
  seedBasic(lib);
  const alts = lib.alternativeClauses('CL-LIAB-001'); // high
  assert.ok(alts.length >= 1);
  assert.ok(alts.every((a) => a.category === 'liability'));
  assert.ok(alts.every((a) => a.riskLevel !== 'high'));
  const found = alts.find((a) => a.clauseId === 'CL-LIAB-002');
  assert.ok(found, 'expected CL-LIAB-002 as alternative');
  assert.ok(found.riskDelta < 0); // low is lower than high
});

/* =========================================================
 * 18.  approvalWorkflow — mixed decisions
 * ========================================================= */
test('18. approvalWorkflow computes needs-revision on mixed reviews', () => {
  const lib = makeLib();
  seedBasic(lib);
  const rec = lib.approvalWorkflow('CL-NDA-001', [
    { id: 'rev-legal',  decision: 'approved' },
    { id: 'rev-cfo',    decision: 'needs-revision', notes: 'clarify amount' },
  ]);
  assert.equal(rec.status, 'needs-revision');
  assert.equal(rec.reviews.length, 2);
});

/* =========================================================
 * 19.  approvalWorkflow — all approved
 * ========================================================= */
test('19. approvalWorkflow flips clause approvalStatus when all approved', () => {
  const lib = makeLib();
  // Add a clause WITHOUT approvedBy — starts in 'pending' approval state
  lib.addClause({
    id: 'CL-GOV-001',
    category: 'governing-law',
    title_he: 'הדין החל',
    title_en: 'Governing Law',
    text_he: 'על הסכם זה יחול הדין הישראלי, וסמכות השיפוט הייחודית תהיה לבתי המשפט ב-{jurisdiction}.',
    text_en: 'This agreement shall be governed by Israeli law with exclusive jurisdiction of the courts in {jurisdiction}.',
    legalCitation: ['IL-CONTRACTS-GENERAL'],
    riskLevel: 'low',
    jurisdiction: ['IL'],
    // approvedBy omitted → pending
  });
  const beforeHead = lib.getClause('CL-GOV-001');
  assert.equal(beforeHead.approvalStatus, 'pending');
  const rec = lib.approvalWorkflow('CL-GOV-001', [
    { id: 'rev-legal', decision: 'approved' },
    { id: 'rev-cfo',   decision: 'approved' },
  ]);
  assert.equal(rec.status, 'approved');
  const after = lib.getClause('CL-GOV-001');
  assert.equal(after.approvalStatus, 'approved');
});

/* =========================================================
 * 20.  usageAnalytics — counts + period filter
 * ========================================================= */
test('20. usageAnalytics counts uses by template with period filter', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.assembleContract({
    templateId: 'TMPL-A',
    clauseIds: ['CL-PAY-001'],
    variables: { amount: 100, currency: 'ILS', date: '2026-04-11' },
  });
  lib.assembleContract({
    templateId: 'TMPL-A',
    clauseIds: ['CL-PAY-001'],
    variables: { amount: 200, currency: 'ILS', date: '2026-04-12' },
  });
  lib.assembleContract({
    templateId: 'TMPL-B',
    clauseIds: ['CL-PAY-001'],
    variables: { amount: 300, currency: 'ILS', date: '2026-04-13' },
  });
  const stats = lib.usageAnalytics('CL-PAY-001');
  assert.equal(stats.totalUsage, 3);
  assert.equal(stats.byTemplate[0].templateId, 'TMPL-A');
  assert.equal(stats.byTemplate[0].count, 2);
  assert.equal(stats.byTemplate[1].templateId, 'TMPL-B');
  assert.equal(stats.byTemplate[1].count, 1);
});

/* =========================================================
 * 21.  deprecateClause — preserves everything
 * ========================================================= */
test('21. deprecateClause preserves versions & usage (append-only)', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.upgradeClause('CL-LIAB-001', 2, { changeNote: 'typo fix' });
  lib.assembleContract({
    templateId: 'TMPL-X',
    clauseIds: ['CL-LIAB-001'],
    variables: { party1: 'A', amount: 100, currency: 'ILS' },
  });
  const beforeVersions = lib.listVersions('CL-LIAB-001').length;
  const beforeUsage = lib.usageAnalytics('CL-LIAB-001').allTimeUsage;

  const dep = lib.deprecateClause('CL-LIAB-001', 'Replaced by mutual limitation', 'CL-LIAB-002');
  assert.equal(dep.deprecated, true);
  assert.equal(dep.supersededBy, 'CL-LIAB-002');

  const afterVersions = lib.listVersions('CL-LIAB-001').length;
  const afterUsage = lib.usageAnalytics('CL-LIAB-001').allTimeUsage;
  assert.equal(afterVersions, beforeVersions); // NOTHING deleted
  assert.equal(afterUsage, beforeUsage);       // NOTHING deleted

  const head = lib.getClause('CL-LIAB-001');
  assert.equal(head.deprecated, true);
});

/* =========================================================
 * 22.  deprecateClause — getClause redirect hint
 * ========================================================= */
test('22. getClause on deprecated clause exposes redirect hint', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.deprecateClause('CL-LIAB-001', 'Outdated', 'CL-LIAB-002');
  const got = lib.getClause('CL-LIAB-001');
  assert.ok(got.redirect);
  assert.equal(got.redirect.supersededBy, 'CL-LIAB-002');
  assert.match(got.redirect.message_he, /הוצא משימוש/);
  assert.match(got.redirect.message_en, /deprecated/);
});

/* =========================================================
 * 23.  bilingualPairing — numeric mismatch detection
 * ========================================================= */
test('23. bilingualPairing detects numeric mismatch', () => {
  const lib = makeLib();
  lib.addClause({
    id: 'CL-BADNUM',
    category: 'warranty',
    title_he: 'בדק',
    title_en: 'Warranty',
    text_he: 'תקופת הבדק היא 12 חודשים.',
    text_en: 'The warranty period is 24 months.',
    riskLevel: 'medium',
  });
  const r = lib.bilingualPairing('CL-BADNUM');
  assert.equal(r.equivalent, false);
  assert.equal(r.numericTokens.match, false);
  assert.ok(r.issues.some((i) => i.code === 'NUMERIC_MISMATCH'));
});

/* =========================================================
 * 24.  bilingualPairing — variable mismatch detection
 * ========================================================= */
test('24. bilingualPairing detects variable mismatch across languages', () => {
  const lib = makeLib();
  lib.addClause({
    id: 'CL-BADVAR',
    category: 'ip',
    title_he: 'קניין רוחני',
    title_en: 'Intellectual Property',
    text_he: 'כל זכויות הקניין הרוחני של {party1} נשמרות.',
    text_en: 'All intellectual property rights of {licensor} are preserved.',
    riskLevel: 'medium',
  });
  const r = lib.bilingualPairing('CL-BADVAR');
  assert.equal(r.equivalent, false);
  assert.ok(r.variables.missingInEn.includes('party1'));
  assert.ok(r.variables.missingInHe.includes('licensor'));
});

/* =========================================================
 * 25.  Event log is append-only with monotonic seq
 * ========================================================= */
test('25. event log is append-only with monotonic seq', () => {
  const lib = makeLib();
  seedBasic(lib);
  lib.upgradeClause('CL-NDA-001', 2, { riskLevel: 'high', changeNote: 'v2' });
  lib.approvalWorkflow('CL-NDA-001', [{ id: 'rev', decision: 'approved' }]);
  lib.deprecateClause('CL-LIAB-001', 'replaced', 'CL-LIAB-002');
  const log = lib.eventLog();
  const types = log.map((e) => e.type);
  assert.ok(types.includes('clause.added'));
  assert.ok(types.includes('clause.upgraded'));
  assert.ok(types.includes('clause.approval'));
  assert.ok(types.includes('clause.deprecated'));
  for (let i = 1; i < log.length; i++) {
    assert.equal(log[i].seq, log[i - 1].seq + 1);
  }
});

/* =========================================================
 * 26.  Glossary + Israeli law citations present
 * ========================================================= */
test('26. glossary + Israeli law citations bilingual coverage', () => {
  assert.ok(HEBREW_GLOSSARY.length >= 20);
  for (const term of HEBREW_GLOSSARY) {
    assert.ok(term.he && term.he.length > 0);
    assert.ok(term.en && term.en.length > 0);
  }
  assert.equal(CATEGORIES.length, 10);
  const citKeys = Object.keys(IL_LAW_CITATIONS);
  assert.ok(citKeys.includes('IL-CONTRACTS-GENERAL'));
  assert.ok(citKeys.includes('IL-CONTRACTS-REMEDIES'));
  assert.ok(citKeys.includes('IL-STANDARD-CONTRACTS'));
  assert.ok(citKeys.includes('IL-ARBITRATION'));
  for (const k of citKeys) {
    assert.ok(IL_LAW_CITATIONS[k].he.length > 0);
    assert.ok(IL_LAW_CITATIONS[k].en.length > 0);
  }
  assert.ok(RISK_LEVELS.includes('critical'));
});
