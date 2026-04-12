/**
 * Unit tests for src/tax/dividend-withholding.js
 * Agent Y-009 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run:   node --test test/tax/dividend-withholding.test.js
 *
 * Covers (per spec AG-Y009):
 *   1. Substantial-shareholder threshold (10% — §88).
 *   2. Treaty lookup, including country-specific thresholds and fallback
 *      to domestic rate when no treaty exists.
 *   3. Inter-company exemption — Israeli co. → Israeli co. = 0%.
 *   4. Form 867B row generation + annual aggregation.
 *   5. applyTaxCredit — cap vs. refundable split.
 *   6. Oleh chadash foreign-source exemption (§14).
 *   7. Input-validation error paths.
 *
 * Principle: these tests MUST never delete or rewrite production rates —
 * every assertion is *additive* and guards an existing compliance path.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeDividendWithholding,
  loadTreatyRates,
  applyTaxCredit,
  generateForm867B,
  createCalculator,
  SHAREHOLDER_TYPES,
  DOMESTIC_RATES,
  SUBSTANTIAL_SHAREHOLDER_THRESHOLD,
} = require('../../src/tax/dividend-withholding.js');

// ═══════════════════════════════════════════════════════════════════
// 1. Substantial-shareholder threshold (10%)
// ═══════════════════════════════════════════════════════════════════

test('01. SUBSTANTIAL_SHAREHOLDER_THRESHOLD = 0.10 (10% per §88)', () => {
  assert.equal(SUBSTANTIAL_SHAREHOLDER_THRESHOLD, 0.10);
});

test('02. Israeli individual 9.99% ownership → 25% regular rate', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.0999,
  });
  assert.equal(r.rate, 0.25);
  assert.equal(r.withheld, 25000);
  assert.equal(r.netPaid, 75000);
  assert.match(r.rule, /25%/);
});

test('03. Israeli individual exactly 10% ownership → 30% substantial rate', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.10,
  });
  assert.equal(r.rate, 0.30);
  assert.equal(r.withheld, 30000);
  assert.equal(r.netPaid, 70000);
  assert.match(r.rule, /בעל מניות מהותי/);
});

test('04. Israeli individual 25% ownership → 30% substantial rate', () => {
  const r = computeDividendWithholding({
    gross: 50000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.25,
  });
  assert.equal(r.rate, 0.30);
  assert.equal(r.withheld, 15000);
  assert.equal(r.netPaid, 35000);
});

test('05. Explicit isSubstantial=true overrides ownership pct', () => {
  const r = computeDividendWithholding({
    gross: 10000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.05,
    isSubstantial: true,
  });
  assert.equal(r.rate, 0.30);
});

test('06. Explicit isSubstantial=false overrides ownership pct', () => {
  const r = computeDividendWithholding({
    gross: 10000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.50,
    isSubstantial: false,
  });
  assert.equal(r.rate, 0.25);
});

// ═══════════════════════════════════════════════════════════════════
// 2. Inter-company exemption (§126(ב))
// ═══════════════════════════════════════════════════════════════════

test('07. Israeli company recipient → 0% inter-company exemption', () => {
  const r = computeDividendWithholding({
    gross: 1_000_000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_COMPANY,
    ownershipPct: 1.0,
  });
  assert.equal(r.rate, 0);
  assert.equal(r.withheld, 0);
  assert.equal(r.netPaid, 1_000_000);
  assert.match(r.rule, /§126/);
  assert.match(r.rule, /inter-company/);
});

test('08. Israeli company even minority holding still 0%', () => {
  const r = computeDividendWithholding({
    gross: 123456,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_COMPANY,
    ownershipPct: 0.02,
  });
  assert.equal(r.rate, 0);
  assert.equal(r.withheld, 0);
});

// ═══════════════════════════════════════════════════════════════════
// 3. Treaty lookup + fallback
// ═══════════════════════════════════════════════════════════════════

test('09. loadTreatyRates returns frozen table with US/UK/DE/FR', () => {
  const t = loadTreatyRates();
  assert.ok(Object.isFrozen(t));
  assert.ok(t.US);
  assert.ok(t.GB);
  assert.ok(t.DE);
  assert.ok(t.FR);
  assert.equal(t.US.country, 'US');
  assert.match(t.US.article, /US-IL/);
});

test('10. US treaty substantial holder (12%) → 12.5% rate', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.12,
    recipientCountry: 'US',
  });
  assert.equal(r.rate, 0.125);
  assert.equal(r.withheld, 12500);
  assert.equal(r.netPaid, 87500);
  assert.ok(r.treatyCited);
  assert.equal(r.treatyCited.country, 'US');
});

test('11. UK treaty substantial holder (20%) → 5% rate', () => {
  const r = computeDividendWithholding({
    gross: 200000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.20,
    recipientCountry: 'GB',
  });
  assert.equal(r.rate, 0.05);
  assert.equal(r.withheld, 10000);
  assert.equal(r.netPaid, 190000);
  assert.equal(r.treatyCited.country, 'GB');
});

test('12. DE treaty portfolio holder (2%) → 10% rate', () => {
  const r = computeDividendWithholding({
    gross: 50000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.02,
    recipientCountry: 'DE',
  });
  assert.equal(r.rate, 0.10);
  assert.equal(r.withheld, 5000);
});

test('13. NL treaty requires 25% threshold — 20% holder gets portfolio 15%', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.20,
    recipientCountry: 'NL',
  });
  // Ownership ≥10% would normally trigger substantial but NL treaty wants ≥25%.
  // computeDividendWithholding treats 20% as "substantial hint" (≥10%),
  // which keeps the substantial branch but treaty.threshold = 0.25 is NOT met
  // — so pickTreatyRate must fall back to portfolio 15%.
  assert.equal(r.rate, 0.15);
});

test('14. NL treaty at 30% holding → substantial 5% rate', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.30,
    recipientCountry: 'NL',
  });
  assert.equal(r.rate, 0.05);
});

test('15. Unknown country → fallback 25% domestic for foreign company', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.05,
    recipientCountry: 'ZZ', // does not exist
  });
  assert.equal(r.rate, 0.25);
  assert.equal(r.treatyCited, null);
});

test('16. Unknown country, foreign company ≥10% → OECD 15%', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.15,
    recipientCountry: 'ZZ',
  });
  assert.equal(r.rate, 0.15);
  assert.match(r.rule, /OECD/);
});

test('17. No country at all, foreign individual → 25% default', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_INDIVIDUAL,
    ownershipPct: 0.01,
  });
  assert.equal(r.rate, 0.25);
});

test('18. Foreign individual, 15% holding, no treaty → 30% substantial', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_INDIVIDUAL,
    ownershipPct: 0.15,
  });
  assert.equal(r.rate, 0.30);
});

test('19. Custom treatyLookup injected via params', () => {
  const fake = {
    ZZ: {
      country: 'ZZ',
      name_he: 'מדינה דמיונית',
      name_en: 'Fakeland',
      portfolio: 0.07,
      substantial: 0.03,
      threshold: 0.10,
      article: 'Art.10 (ZZ-IL test)',
      signed: 2024,
      notes: '',
    },
  };
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.20,
    recipientCountry: 'ZZ',
    treatyLookup: fake,
  });
  assert.equal(r.rate, 0.03);
  assert.equal(r.treatyCited.country, 'ZZ');
});

// ═══════════════════════════════════════════════════════════════════
// 4. Form 867B row + annual aggregation
// ═══════════════════════════════════════════════════════════════════

test('20. form867BRow has all required Tax-Authority fields', () => {
  const r = computeDividendWithholding({
    gross: 10000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.05,
    recipientId: '123456789',
    recipientName: 'ישראל ישראלי',
    payerTaxId: '987654321',
    date: '2026-03-15',
  });
  const row = r.form867BRow;
  assert.equal(row.formType, '867B');
  assert.match(row.formTitle_he, /דיבידנד/);
  assert.equal(row.date_of_distribution, '2026-03-15');
  assert.equal(row.income_type, 'DIVIDEND');
  assert.equal(row.recipient_tax_id, '123456789');
  assert.equal(row.recipient_name, 'ישראל ישראלי');
  assert.equal(row.payer_tax_id, '987654321');
  assert.equal(row.recipient_type, SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL);
  assert.equal(row.gross_amount, 10000);
  assert.equal(row.withholding_rate, 25);
  assert.equal(row.withheld_amount, 2500);
  assert.equal(row.net_amount, 7500);
  assert.equal(row.is_substantial, false);
  assert.equal(row.ownership_pct, 5);
});

test('21. form867BRow for foreign company includes treaty citation', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
    ownershipPct: 0.15,
    recipientCountry: 'US',
    recipientId: 'EIN-12-3456789',
    recipientName: 'Acme Corp',
  });
  const row = r.form867BRow;
  assert.equal(row.treaty_country, 'US');
  assert.match(row.treaty_article, /US-IL/);
  assert.equal(row.treaty_signed, 1975);
  assert.equal(row.recipient_country, 'US');
});

test('22. generateForm867B aggregates multiple distributions', () => {
  const dists = [
    {
      gross: 10000,
      shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
      ownershipPct: 0.05,
      recipientId: '111111111',
      recipientName: 'אבי',
      date: '2026-01-15',
    },
    {
      gross: 20000,
      shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
      ownershipPct: 0.05,
      recipientId: '111111111',
      recipientName: 'אבי',
      date: '2026-06-15',
    },
    {
      gross: 50000,
      shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
      ownershipPct: 0.15,
      recipientCountry: 'US',
      recipientId: 'EIN-12-3456789',
      recipientName: 'Acme Corp',
      date: '2026-03-01',
    },
  ];
  const form = generateForm867B(dists, {
    year: 2026,
    payerTaxId: '987654321',
    payerName: 'Techno-Kol Uzi Ltd',
  });

  assert.equal(form.header.formType, '867B');
  assert.equal(form.header.tax_year, 2026);
  assert.equal(form.header.row_count, 3);
  assert.equal(form.rows.length, 3);

  // Aggregation totals
  assert.equal(form.summary.total_gross, 80000);
  // 10000*0.25 + 20000*0.25 + 50000*0.125 = 2500 + 5000 + 6250 = 13750
  assert.equal(form.summary.total_withheld, 13750);
  assert.equal(form.summary.total_net, 66250);
  assert.equal(form.summary.recipients.length, 2);

  // Per-recipient bucketing: אבי got two distributions
  const avi = form.summary.recipients.find((r) => r.recipient_tax_id === '111111111');
  assert.ok(avi);
  assert.equal(avi.distributions, 2);
  assert.equal(avi.gross_amount, 30000);
  assert.equal(avi.withheld_amount, 7500);
});

test('23. generateForm867B XML envelope is non-empty and well-formed-ish', () => {
  const form = generateForm867B(
    [
      {
        gross: 10000,
        shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
        ownershipPct: 0.05,
        recipientId: '111111111',
        recipientName: 'Test',
        date: '2026-01-01',
      },
    ],
    { year: 2026, payerTaxId: '123456789', payerName: 'Co' }
  );
  assert.match(form.xml, /<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(form.xml, /<Form867B>/);
  assert.match(form.xml, /<\/Form867B>/);
  assert.match(form.xml, /<TaxYear>2026<\/TaxYear>/);
  assert.match(form.xml, /<Rate>25<\/Rate>/);
});

test('24. generateForm867B accepts already-computed results too', () => {
  const r1 = computeDividendWithholding({
    gross: 1000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.01,
    recipientId: 'A',
    recipientName: 'A',
  });
  const r2 = computeDividendWithholding({
    gross: 2000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.50,
    recipientId: 'B',
    recipientName: 'B',
  });
  const form = generateForm867B([r1, r2]);
  assert.equal(form.rows.length, 2);
  assert.equal(form.summary.total_gross, 3000);
  // 1000*0.25 + 2000*0.30 = 250 + 600 = 850
  assert.equal(form.summary.total_withheld, 850);
});

// ═══════════════════════════════════════════════════════════════════
// 5. applyTaxCredit
// ═══════════════════════════════════════════════════════════════════

test('25. applyTaxCredit with WHT within cap → fully creditable', () => {
  const credit = applyTaxCredit(100000, 25000); // 25% domestic cap
  assert.equal(credit.creditable, 25000);
  assert.equal(credit.refundable, 0);
  assert.equal(credit.cap, 25000);
  assert.equal(credit.effectiveRate, 0.25);
});

test('26. applyTaxCredit with WHT > cap → refundable excess', () => {
  const credit = applyTaxCredit(100000, 30000); // substantial 30% paid
  assert.equal(credit.cap, 25000);
  assert.equal(credit.creditable, 25000);
  assert.equal(credit.refundable, 5000);
});

test('27. applyTaxCredit accepts computeDividendWithholding result', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.15,
  });
  const credit = applyTaxCredit(100000, r);
  assert.equal(credit.withheld, 30000);
  assert.equal(credit.creditable, 25000);
  assert.equal(credit.refundable, 5000);
});

test('28. applyTaxCredit custom capRate option', () => {
  const credit = applyTaxCredit(100000, 12500, { capRate: 0.125 });
  assert.equal(credit.cap, 12500);
  assert.equal(credit.creditable, 12500);
  assert.equal(credit.refundable, 0);
});

// ═══════════════════════════════════════════════════════════════════
// 6. Oleh chadash (§14)
// ═══════════════════════════════════════════════════════════════════

test('29. Oleh chadash — foreign-source dividend exempt (0%)', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.05,
    isOlehBenefits: true,
    foreignSource: true,
  });
  assert.equal(r.rate, 0);
  assert.equal(r.withheld, 0);
  assert.equal(r.netPaid, 100000);
  assert.match(r.rule, /§14/);
});

test('30. Oleh chadash — domestic-source dividend still taxable 25%', () => {
  const r = computeDividendWithholding({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.05,
    isOlehBenefits: true,
    foreignSource: false,
  });
  assert.equal(r.rate, 0.25);
});

// ═══════════════════════════════════════════════════════════════════
// 7. Validation / error paths
// ═══════════════════════════════════════════════════════════════════

test('31. Negative gross throws RangeError', () => {
  assert.throws(
    () =>
      computeDividendWithholding({
        gross: -100,
        shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
      }),
    RangeError
  );
});

test('32. Invalid shareholder type throws RangeError', () => {
  assert.throws(
    () => computeDividendWithholding({ gross: 100, shareholderType: 'alien' }),
    RangeError
  );
});

test('33. Ownership pct out of [0,1] throws RangeError', () => {
  assert.throws(
    () =>
      computeDividendWithholding({
        gross: 100,
        shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
        ownershipPct: 1.5,
      }),
    RangeError
  );
});

test('34. Missing params throws TypeError', () => {
  assert.throws(() => computeDividendWithholding(null), TypeError);
});

test('35. applyTaxCredit negative withheld throws', () => {
  assert.throws(() => applyTaxCredit(100, -5), RangeError);
});

test('36. generateForm867B on non-array throws', () => {
  assert.throws(() => generateForm867B('not an array'), TypeError);
});

// ═══════════════════════════════════════════════════════════════════
// 8. Immutability ("לא מוחקים רק מגדלים")
// ═══════════════════════════════════════════════════════════════════

test('37. Result object is frozen (immutable)', () => {
  const r = computeDividendWithholding({
    gross: 10000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
  });
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.form867BRow));
});

test('38. DOMESTIC_RATES table is frozen', () => {
  assert.ok(Object.isFrozen(DOMESTIC_RATES));
  assert.equal(DOMESTIC_RATES.ISRAELI_INDIVIDUAL_REGULAR, 0.25);
  assert.equal(DOMESTIC_RATES.ISRAELI_INDIVIDUAL_SUBSTANTIAL, 0.30);
  assert.equal(DOMESTIC_RATES.ISRAELI_COMPANY_INTER_CO, 0);
  assert.equal(DOMESTIC_RATES.FOREIGN_COMPANY_OECD_10PCT, 0.15);
});

// ═══════════════════════════════════════════════════════════════════
// 9. createCalculator instance wrapper
// ═══════════════════════════════════════════════════════════════════

test('39. createCalculator exposes bound API with injected treaties', () => {
  const calc = createCalculator();
  assert.ok(calc.compute);
  assert.ok(calc.applyCredit);
  assert.ok(calc.generate867B);
  assert.ok(calc.treaties.US);

  const r = calc.compute({
    gross: 100000,
    shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
    ownershipPct: 0.11,
  });
  assert.equal(r.rate, 0.30);
});

// ═══════════════════════════════════════════════════════════════════
// 10. Realistic scenarios — end-to-end
// ═══════════════════════════════════════════════════════════════════

test('40. End-to-end: mixed shareholder portfolio annual 867B', () => {
  const dists = [
    // Israeli individual, minor holder
    {
      gross: 50000,
      shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
      ownershipPct: 0.03,
      recipientId: '111111111',
      recipientName: 'דני כהן',
      date: '2026-02-01',
    },
    // Israeli individual, substantial
    {
      gross: 500000,
      shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
      ownershipPct: 0.35,
      recipientId: '222222222',
      recipientName: 'מירי לוי',
      date: '2026-02-01',
    },
    // Israeli company, inter-company
    {
      gross: 1_000_000,
      shareholderType: SHAREHOLDER_TYPES.ISRAELI_COMPANY,
      ownershipPct: 0.60,
      recipientId: '333333333',
      recipientName: 'Parent Co Ltd',
      date: '2026-02-01',
    },
    // US corp, treaty substantial
    {
      gross: 300000,
      shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
      ownershipPct: 0.20,
      recipientCountry: 'US',
      recipientId: 'EIN-44-1111111',
      recipientName: 'Acme Inc',
      date: '2026-02-01',
    },
    // UAE corp, treaty >10% → 0%
    {
      gross: 150000,
      shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
      ownershipPct: 0.50,
      recipientCountry: 'AE',
      recipientId: 'TRN-55-2222222',
      recipientName: 'Abu Dhabi Holdings',
      date: '2026-02-01',
    },
  ];
  const form = generateForm867B(dists, {
    year: 2026,
    payerTaxId: '514000000',
    payerName: 'Techno-Kol Uzi Ltd',
  });

  // Totals check:
  //  50 000 * 0.25   =  12 500
  // 500 000 * 0.30   = 150 000
  // 1 000 000 * 0    =      0   (inter-company)
  // 300 000 * 0.125  =  37 500   (US treaty substantial)
  // 150 000 * 0      =      0   (UAE treaty 0%)
  // total gross                  2 000 000
  // total withheld                 200 000
  assert.equal(form.summary.total_gross, 2_000_000);
  assert.equal(form.summary.total_withheld, 200_000);
  assert.equal(form.summary.total_net, 1_800_000);
  assert.equal(form.summary.recipients.length, 5);
  assert.equal(form.header.row_count, 5);
});
