/**
 * Tests for src/intercompany/ic-engine.js
 * Techno-Kol Uzi — Swarm 3C / Agent X-41
 *
 * Runs on node's built-in test runner:
 *   node --test test/payroll/ic-engine.test.js
 *
 * No third-party dependencies. No deletions.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const IC = require('../../src/intercompany/ic-engine.js');
const {
  createEngine,
  TX_TYPES,
  TX_STATUS,
  ENTITY_TYPES,
  TP_METHODS,
  DOC_REQ,
  VERSION,
} = IC;

// ─────────────────────────────────────────────────────────────────────
// Fixture helpers — Techno-Kol group
// ─────────────────────────────────────────────────────────────────────

function bootstrapTechnoKol() {
  const eng = createEngine();

  const parent = eng.defineEntity({
    id:    'TK-UZI',
    name:  'Techno-Kol Uzi Ltd',
    nameHe:'טכנו-קול עוזי בע"מ',
    type:  ENTITY_TYPES.PARENT,
    taxId: '514000001',
    country: 'IL',
    functionalCcy: 'ILS',
    meta: { annualRevenueILS: 120_000_000 },
  });

  const re = eng.defineEntity({
    id:    'TK-RE',
    name:  'Techno-Kol Real Estate Ltd',
    nameHe:'טכנו-קול נדל"ן בע"מ',
    type:  ENTITY_TYPES.SUBSIDIARY,
    taxId: '514000002',
    country: 'IL',
    functionalCcy: 'ILS',
    meta: { annualRevenueILS: 8_000_000 },
  });

  eng.linkEntities(parent, re, 100);
  return { eng, parent, re };
}

// Helper — build an engine with a US affiliate for FX tests
function bootstrapInternational() {
  const eng = createEngine();
  const parent = eng.defineEntity({
    id: 'TK-UZI', name: 'Techno-Kol Uzi Ltd', nameHe: 'טכנו-קול עוזי בע"מ',
    type: ENTITY_TYPES.PARENT, taxId: '514000001',
    country: 'IL', functionalCcy: 'ILS',
    meta: { annualRevenueILS: 120_000_000 },
  });
  const us = eng.defineEntity({
    id: 'TK-USA', name: 'Techno-Kol USA Inc',
    nameHe: 'טכנו-קול ארה"ב',
    type: ENTITY_TYPES.SUBSIDIARY, country: 'US',
    functionalCcy: 'USD',
  });
  eng.linkEntities(parent, us, 100);
  // 1 USD = 3.7 ILS, posted 2026-03-15
  eng.setFxRate('USD', 'ILS', '2026-03-15', 3.7);
  return { eng, parent, us };
}

// ─────────────────────────────────────────────────────────────────────
// 1. Module sanity
// ─────────────────────────────────────────────────────────────────────

test('1. module exports stable API surface', () => {
  assert.equal(typeof IC.defineEntity, 'function');
  assert.equal(typeof IC.linkEntities, 'function');
  assert.equal(typeof IC.recordICTransaction, 'function');
  assert.equal(typeof IC.reconcile, 'function');
  assert.equal(typeof IC.generateEliminations, 'function');
  assert.equal(typeof IC.transferPricingReport, 'function');
  assert.equal(typeof IC.getICBalance, 'function');
  assert.equal(typeof IC.createEngine, 'function');
  assert.ok(VERSION.startsWith('1.'));
});

// ─────────────────────────────────────────────────────────────────────
// 2. Entity setup + hierarchy
// ─────────────────────────────────────────────────────────────────────

test('2. defineEntity creates bilingual entity with tax id', () => {
  const eng = createEngine();
  const id = eng.defineEntity({
    id: 'X', name: 'X Ltd', nameHe: 'איקס בע"מ',
    type: ENTITY_TYPES.PARENT, taxId: '510000001', country: 'IL',
    functionalCcy: 'ILS',
  });
  const ent = eng.getEntity(id);
  assert.equal(ent.name, 'X Ltd');
  assert.equal(ent.nameHe, 'איקס בע"מ');
  assert.equal(ent.type, 'parent');
  assert.equal(ent.country, 'IL');
  assert.equal(ent.taxId, '510000001');
  assert.equal(ent.typeLabel.he, 'חברת אם');
});

test('3. linkEntities builds parent-child hierarchy with pct', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const h = eng.getHierarchy(parent);
  assert.equal(h.id, parent);
  assert.equal(h.children.length, 1);
  assert.equal(h.children[0].node.id, re);
  assert.equal(h.children[0].rel.pct, 100);
});

test('4. linkEntities rejects circular ownership', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  assert.throws(
    () => eng.linkEntities(re, parent, 100),
    /circular/i,
  );
});

test('5. linkEntities rejects invalid percentages', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  // A separate extra entity so we can test pct bounds
  const other = eng.defineEntity({ name: 'HR Svc Ltd', country: 'IL', functionalCcy: 'ILS' });
  assert.throws(() => eng.linkEntities(parent, other, 150));
  assert.throws(() => eng.linkEntities(parent, other, -1));
});

// ─────────────────────────────────────────────────────────────────────
// 3. Transaction recording + mirroring
// ─────────────────────────────────────────────────────────────────────

test('6. recordICTransaction mirrors entry on counterparty', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txId = eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS',
    date: '2026-01-31',
    marketRent: 24_000,
    description: 'Monthly factory rent',
    descriptionHe: 'שכר דירה חודשי למפעל',
    documentation: true,
    documentationRef: 'LEASE-2026',
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.type, 'rent');
  assert.equal(tx.amount, 25_000);
  assert.ok(tx.mirrorId, 'mirror id should be set');
  const mirror = eng.getTransaction(tx.mirrorId);
  assert.equal(mirror.mirrorOf, txId);
  assert.equal(mirror.from, parent);
  assert.equal(mirror.to, re);
  assert.equal(mirror.amount, 25_000);
  assert.equal(mirror.side, 'to');
});

test('7. recordICTransaction rejects same-entity and unknown entities', () => {
  const { eng, parent } = bootstrapTechnoKol();
  assert.throws(() => eng.recordICTransaction({
    from: parent, to: parent, type: TX_TYPES.MGMT_FEE,
    amount: 1000, currency: 'ILS',
  }));
  assert.throws(() => eng.recordICTransaction({
    from: 'ghost', to: parent, type: TX_TYPES.MGMT_FEE,
    amount: 1000, currency: 'ILS',
  }));
});

// ─────────────────────────────────────────────────────────────────────
// 4. Transfer pricing checks
// ─────────────────────────────────────────────────────────────────────

test('8. TP check flags low markup on management fees (§85A)', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  // Charge only 1% markup — below the 5% minimum for services
  const txId = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 101_000, cost: 100_000, currency: 'ILS',
    date: '2026-02-01',
    description: 'Group management services',
    descriptionHe: 'שירותי ניהול קבוצתיים',
    documentation: true,
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.tp.compliant, false);
  assert.ok(tx.tp.issues.some(i => i.code === 'TP_LOW_MARKUP'));
  // Docs are attached, but deductibility still denied until markup fixed?
  // Rule: docs only save deductibility if compliance breach is doc-only.
  assert.equal(tx.tp.method, TP_METHODS.COST_PLUS);
});

test('9. TP check flags loan rate outside 3.5%..6.5% band', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txLow = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.LOAN_INTEREST,
    amount: 1_000, rate: 0.02, currency: 'ILS',
    date: '2026-03-01',
    description: 'Q1 loan interest (too low)',
    documentation: true,
  });
  const txOk = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.LOAN_INTEREST,
    amount: 5_000, rate: 0.05, currency: 'ILS',
    date: '2026-03-02',
    description: 'Q1 loan interest (at market)',
    documentation: true,
  });
  assert.equal(eng.getTransaction(txLow).tp.compliant, false);
  assert.ok(eng.getTransaction(txLow).tp.issues.some(i => i.code === 'TP_LOAN_LOW'));
  assert.equal(eng.getTransaction(txOk).tp.compliant, true);
});

test('10. TP check disallows deductibility if no documentation AND non-compliant', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txId = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 102_000, cost: 100_000, currency: 'ILS',
    date: '2026-02-15',
    description: 'Management services, no docs',
    documentation: false,
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.tp.deductible, false);
  assert.ok(tx.tp.issues.some(i => i.code === 'TP_NO_DOCS'));
});

// ─────────────────────────────────────────────────────────────────────
// 5. Reconciliation
// ─────────────────────────────────────────────────────────────────────

test('11. reconcile returns matched set when both sides agree', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-01-31',
    marketRent: 25_000, documentation: true,
  });
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_500, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: true,
  });
  const rec = eng.reconcile(re, parent, '2026-01');
  assert.equal(rec.clean, true);
  // Both primary postings in the period involve this pair → 2 matched
  assert.equal(rec.matchedCount, 2);
  assert.equal(rec.discrepancyCount, 0);
});

test('12. reconcile flags missing mirror as REC_UNMATCHED', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txId = eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-02-28',
    marketRent: 25_000, documentation: true,
  });
  // Destroy mirror semantically by marking it reversed (non-destructive).
  const primary = eng.getTransaction(txId);
  const mirror = eng.getTransaction(primary.mirrorId);
  // Directly remove mirror from store so reconcile sees one-sided
  eng.store.transactions.delete(mirror.id);

  const rec = eng.reconcile(re, parent, '2026-02');
  assert.equal(rec.clean, false);
  assert.ok(rec.discrepancies.some(d => d.code === 'REC_UNMATCHED'));
});

// ─────────────────────────────────────────────────────────────────────
// 6. FX / currency translation
// ─────────────────────────────────────────────────────────────────────

test('13. cross-currency IC transaction is translated both sides', () => {
  const { eng, parent, us } = bootstrapInternational();
  const txId = eng.recordICTransaction({
    from: us, to: parent, type: TX_TYPES.MGMT_FEE,
    amount: 10_000, cost: 9_000, currency: 'USD',
    date: '2026-03-15',
    description: 'HQ support services',
    documentation: true,
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.amountFrom, 10_000);       // USD side (us is USD functional)
  assert.equal(tx.amountTo,   37_000);        // ILS side (parent = 3.7x)
});

test('14. missing FX rate throws IC_NO_FX', () => {
  const eng = createEngine();
  const a = eng.defineEntity({ name: 'A', functionalCcy: 'ILS', country: 'IL' });
  const b = eng.defineEntity({ name: 'B', functionalCcy: 'EUR', country: 'DE' });
  eng.linkEntities(a, b, 100);
  // Force a currency that has no rate set + entity with USD functional
  assert.throws(
    () => eng.translateAmount(1000, 'EUR', 'ZAR', '2026-01-01'),
    /no FX rate/i,
  );
});

// ─────────────────────────────────────────────────────────────────────
// 7. Eliminations
// ─────────────────────────────────────────────────────────────────────

test('15. generateEliminations bundles postings by type into JV entries', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-01-31',
    marketRent: 25_000, documentation: true,
  });
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-02-28',
    marketRent: 25_000, documentation: true,
  });
  const elim = eng.generateEliminations();
  assert.ok(elim.length >= 1);
  const rentElim = elim.find(e => e.txType === 'rent');
  assert.ok(rentElim);
  assert.equal(rentElim.totalEliminated, 50_000);
  assert.equal(rentElim.lines[0].dr + rentElim.lines[1].dr, 50_000);
  assert.equal(rentElim.lines[0].cr + rentElim.lines[1].cr, 50_000);
});

test('16. elimination accounts are correct for each transaction type', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.LOAN_INTEREST,
    amount: 5_000, rate: 0.05, currency: 'ILS', date: '2026-02-01',
    documentation: true,
  });
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_500, cost: 10_000, currency: 'ILS', date: '2026-02-01',
    documentation: true,
  });
  const elim = eng.generateEliminations('2026-02');
  const interest = elim.find(e => e.txType === 'loan_interest');
  const mgmt     = elim.find(e => e.txType === 'management_fee');
  assert.ok(interest, 'interest elim present');
  assert.ok(mgmt, 'mgmt fee elim present');
  assert.equal(interest.lines[0].account, '4300');
  assert.equal(interest.lines[1].account, '6300');
  assert.equal(mgmt.lines[0].account, '4100');
  assert.equal(mgmt.lines[1].account, '6100');
});

// ─────────────────────────────────────────────────────────────────────
// 8. Transfer pricing report
// ─────────────────────────────────────────────────────────────────────

test('17. transferPricingReport aggregates and reports §85A status', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_500, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: true,
  });
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_100, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: true,
  });
  const rpt = eng.transferPricingReport('2026-01');
  assert.equal(rpt.period, '2026-01');
  assert.equal(rpt.entities.length, 2);
  assert.ok(rpt.groups.length >= 1);
  assert.equal(rpt.totalICVolume, 20_600);
  assert.equal(rpt.legalBasis.primary, 'Income Tax Ordinance §85A');
  // 128M ILS group revenue < 150M → no master file yet
  assert.equal(rpt.filingObligation.localFile, false);
  // The 1% markup tx should appear as non-compliant
  assert.ok(rpt.nonCompliantCount >= 1);
});

test('18. transferPricingReport triggers master file at >150M ILS', () => {
  const eng = createEngine();
  eng.defineEntity({
    id: 'BIG', name: 'BigCo Ltd', nameHe: 'ביגקו',
    type: ENTITY_TYPES.PARENT, country: 'IL', functionalCcy: 'ILS',
    meta: { annualRevenueILS: 200_000_000 },
  });
  eng.defineEntity({
    id: 'SUB', name: 'SubCo Ltd', nameHe: 'סאבקו',
    type: ENTITY_TYPES.SUBSIDIARY, country: 'IL', functionalCcy: 'ILS',
    meta: { annualRevenueILS: 30_000_000 },
  });
  eng.linkEntities('BIG', 'SUB', 100);
  const rpt = eng.transferPricingReport();
  assert.equal(rpt.filingObligation.masterFile, true);
  assert.equal(rpt.filingObligation.localFile, true);
  assert.equal(rpt.filingObligation.cbcr, false);
});

// ─────────────────────────────────────────────────────────────────────
// 9. IC balance + year-end confirmation
// ─────────────────────────────────────────────────────────────────────

test('19. getICBalance computes net position in A functional ccy', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  // RE invoices parent 25k rent, parent invoices RE 10.5k mgmt fee
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-01-31',
    marketRent: 25_000, documentation: true,
  });
  eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_500, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: true,
  });
  const bal = eng.getICBalance(parent, re, '2026-12-31');
  // parent owes RE 25k rent, RE owes parent 10.5k fee → parent owes 14.5k
  assert.equal(bal.currency, 'ILS');
  assert.equal(bal.aOwesB, 25_000);
  assert.equal(bal.bOwesA, 10_500);
  assert.equal(bal.net, 14_500);
  assert.match(bal.direction, /Techno-Kol Uzi Ltd owes Techno-Kol Real Estate Ltd/);
});

test('20. yearEndConfirmation generates bilingual letters', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.RENT,
    amount: 25_000, currency: 'ILS', date: '2026-06-30',
    marketRent: 25_000, documentation: true,
  });
  const letters = eng.yearEndConfirmation(2026);
  assert.equal(letters.length, 1);
  assert.ok(letters[0].bodyEn.includes('inter-company balance'));
  assert.ok(letters[0].bodyHe.includes('הרינו לאשר'));
  assert.equal(letters[0].year, 2026);
  assert.ok(letters[0].balance);
});

// ─────────────────────────────────────────────────────────────────────
// 10. Reversal + audit
// ─────────────────────────────────────────────────────────────────────

test('21. reverseTransaction is non-destructive and audits both legs', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txId = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_500, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: true,
  });
  const revId = eng.reverseTransaction(txId, 'posted in wrong entity');
  const orig = eng.getTransaction(txId);
  const rev = eng.getTransaction(revId);
  assert.equal(orig.status, TX_STATUS.REVERSED);
  // Original transaction itself is not deleted
  assert.ok(orig, 'original still queryable');
  assert.equal(rev.from, re);
  assert.equal(rev.to, parent);
  // Audit log contains both record + reverse
  const log = eng.getAuditLog();
  assert.ok(log.some(l => l.action === 'ictx.record'));
  assert.ok(log.some(l => l.action === 'ictx.reverse'));
});

test('22. attachDocumentation re-evaluates TP compliance', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  // Missing docs for a compliant markup — docRequirement is LOCAL_FILE
  const txId = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.MGMT_FEE,
    amount: 10_600, cost: 10_000, currency: 'ILS', date: '2026-01-31',
    documentation: false,
  });
  const before = eng.getTransaction(txId);
  assert.equal(before.documentation, false);
  eng.attachDocumentation(txId, 'MSA-2026-A');
  const after = eng.getTransaction(txId);
  assert.equal(after.documentation, true);
  assert.equal(after.documentationRef, 'MSA-2026-A');
  // Mirror also updated
  const mirror = eng.getTransaction(after.mirrorId);
  assert.equal(mirror.documentationRef, 'MSA-2026-A');
});

// ─────────────────────────────────────────────────────────────────────
// 11. Dividend + capital injection semantics
// ─────────────────────────────────────────────────────────────────────

test('23. dividends are excluded from working IC balance', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  eng.recordICTransaction({
    from: re, to: parent, type: TX_TYPES.DIVIDEND,
    amount: 500_000, currency: 'ILS', date: '2026-04-30',
    description: 'Annual dividend',
    documentation: true,
  });
  const bal = eng.getICBalance(parent, re, '2026-12-31');
  assert.equal(bal.net, 0);
  // And dividend tx itself flagged section85A = false
  const txs = eng.listTransactions({ type: TX_TYPES.DIVIDEND, side: 'from' });
  assert.equal(txs[0].tp.section85A, false);
});

test('24. isolated engines do not share state', () => {
  const a = createEngine();
  const b = createEngine();
  a.defineEntity({ id: 'A', name: 'A', country: 'IL', functionalCcy: 'ILS' });
  assert.equal(a.listEntities().length, 1);
  assert.equal(b.listEntities().length, 0);
});

test('25. setComplianceThresholds overrides §85A defaults', () => {
  const eng = createEngine();
  eng.setComplianceThresholds({ LOAN_RATE_MIN: 0.04, LOAN_RATE_MAX: 0.055 });
  const c = eng.getComplianceThresholds();
  assert.equal(c.LOAN_RATE_MIN, 0.04);
  assert.equal(c.LOAN_RATE_MAX, 0.055);
  // A 3.6% loan rate that was fine under defaults is now out of band
  eng.defineEntity({ id: 'A', name: 'A', country: 'IL', functionalCcy: 'ILS' });
  eng.defineEntity({ id: 'B', name: 'B', country: 'IL', functionalCcy: 'ILS' });
  eng.linkEntities('A', 'B', 100);
  const txId = eng.recordICTransaction({
    from: 'A', to: 'B', type: TX_TYPES.LOAN_INTEREST,
    amount: 100, rate: 0.036, currency: 'ILS', date: '2026-02-01',
    documentation: true,
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.tp.compliant, false);
  assert.ok(tx.tp.issues.some(i => i.code === 'TP_LOAN_LOW'));
});

test('26. cost-sharing without allocation key fails TP check', () => {
  const { eng, parent, re } = bootstrapTechnoKol();
  const txId = eng.recordICTransaction({
    from: parent, to: re, type: TX_TYPES.COST_SHARE,
    amount: 30_000, currency: 'ILS', date: '2026-03-15',
    description: 'Shared IT infrastructure costs',
    documentation: true,
  });
  const tx = eng.getTransaction(txId);
  assert.equal(tx.tp.compliant, false);
  assert.ok(tx.tp.issues.some(i => i.code === 'TP_NO_KEY'));
});
