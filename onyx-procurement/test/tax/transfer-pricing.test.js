/**
 * Tests for src/tax/transfer-pricing.js
 *
 * Israeli transfer-pricing documentation tool — Section 85A.
 * Covers:
 *   • generateMasterFile  — structural completeness
 *   • generateLocalFile   — controlled transactions + per-tx arm's length
 *   • generateCbCR        — OECD CbC XML schema validity + summary math
 *   • computeArmLength    — TNMM interquartile range + boundary cases
 *   • checkThreshold      — €750M Israeli CbCR threshold + FX conversion
 *   • generateForm1385    — header/row/total mapping + XML round-trip
 *
 * Run: node --test test/tax/transfer-pricing.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const tp = require('../../src/tax/transfer-pricing.js');

const {
  generateMasterFile,
  generateLocalFile,
  generateCbCR,
  computeArmLength,
  checkThreshold,
  generateForm1385,
  METHODS,
  THRESHOLDS,
  CBCR_SCHEMA,
  FORM_1385_FIELDS,
  createEngine,
} = tp;

// ═══ FIXTURES ═══════════════════════════════════════════════════════════════

const FY = 2026;

const ultimateParent = {
  entity_id: 'TKU-ISR-HQ',
  legal_name: 'Techno-Kol Uzi Ltd.',
  country: 'IL',
  tax_id: '516123456',
  functional_currency: 'ILS',
  employees: 420,
  revenue: 950_000_000,
  unrelated_revenue: 700_000_000,
  related_revenue: 250_000_000,
  profit_before_tax: 120_000_000,
  tax_paid: 25_000_000,
  tax_accrued: 27_000_000,
  stated_capital: 100_000_000,
  accumulated_earnings: 300_000_000,
  tangible_assets: 450_000_000,
  address: { country: 'IL', street: 'HaMelacha 10', city: 'Tel Aviv' },
};

const subsUS = {
  entity_id: 'TKU-US-LLC',
  legal_name: 'Techno-Kol Uzi USA LLC',
  country: 'US',
  tax_id: '98-7654321',
  functional_currency: 'USD',
  employees: 40,
  revenue: 120_000_000,
  unrelated_revenue: 100_000_000,
  related_revenue: 20_000_000,
  profit_before_tax: 8_000_000,
  tax_paid: 1_600_000,
  tax_accrued: 1_680_000,
  stated_capital: 5_000_000,
  accumulated_earnings: 25_000_000,
  tangible_assets: 30_000_000,
};

const subsDE = {
  entity_id: 'TKU-DE-GMBH',
  legal_name: 'Techno-Kol Uzi Deutschland GmbH',
  country: 'DE',
  tax_id: 'DE312345678',
  functional_currency: 'EUR',
  employees: 60,
  revenue: 140_000_000,
  unrelated_revenue: 110_000_000,
  related_revenue: 30_000_000,
  profit_before_tax: 10_000_000,
  tax_paid: 2_800_000,
  tax_accrued: 2_900_000,
  stated_capital: 8_000_000,
  accumulated_earnings: 22_000_000,
  tangible_assets: 35_000_000,
};

const controlledTxs = [
  {
    tx_id: 'TX-001',
    counterparty: 'TKU-US-LLC',
    counterparty_country: 'US',
    type: 'goods',
    description: 'Sale of electronic components',
    amount: 12_000_000,
    currency: 'ILS',
    method: 'TNMM',
    tested_party: 'local',
    pli: 'operating_margin',
    // seven benchmarks — test data for arm's length
    comparables: [0.035, 0.042, 0.051, 0.057, 0.063, 0.068, 0.074],
    result: 0.055,
  },
  {
    tx_id: 'TX-002',
    counterparty: 'TKU-DE-GMBH',
    counterparty_country: 'DE',
    type: 'services',
    description: 'IT support services',
    amount: 3_500_000,
    currency: 'EUR',
    method: 'cost plus',
    comparables: [0.05, 0.07, 0.08, 0.1, 0.12],
    result: 0.085,
  },
  {
    tx_id: 'TX-003',
    counterparty: 'TKU-DE-GMBH',
    counterparty_country: 'DE',
    type: 'royalty',
    description: 'Licence of patented process',
    amount: 1_500_000,
    currency: 'ILS',
    method: 'CUP',
    comparables: [0.04, 0.045, 0.05, 0.055, 0.06],
    result: 0.09, // too high
  },
];

const localEntity = {
  ...ultimateParent,
  fiscal_year: FY,
  functions: ['R&D', 'manufacturing', 'HQ services', 'IP ownership'],
  assets: ['patents', 'know-how', 'manufacturing plant'],
  risks: ['market risk', 'technology risk', 'FX risk'],
  controlled_transactions: controlledTxs,
};

const group = {
  group_id: 'TKU-GRP',
  group_name: 'Techno-Kol Uzi Group',
  fiscal_year: FY,
  reporting_currency: 'ILS',
  ultimate_parent: ultimateParent,
  entities: [ultimateParent, subsUS, subsDE],
  business_lines: [
    {
      code: 'CONSTR',
      name: 'Construction supplies',
      revenue: 600_000_000,
      value_drivers: ['scale', 'distribution'],
    },
    {
      code: 'TECH',
      name: 'Technology services',
      revenue: 410_000_000,
      value_drivers: ['R&D', 'IP'],
    },
  ],
  intangibles: [
    {
      id: 'IP-001',
      name: 'Proprietary coating process',
      type: 'patent',
      legal_owner: 'TKU-ISR-HQ',
      economic_owner: 'TKU-ISR-HQ',
      current_value: 80_000_000,
    },
  ],
  financing: [
    { type: 'loan', lender: 'TKU-ISR-HQ', borrower: 'TKU-DE-GMBH', principal: 20_000_000, rate: 0.045 },
    { type: 'guarantee', guarantor: 'TKU-ISR-HQ', beneficiary: 'TKU-US-LLC', amount: 5_000_000 },
  ],
  consolidated_financials: {
    revenue: 1_210_000_000,
    profit_before_tax: 138_000_000,
    tax_accrued: 31_580_000,
    tax_paid: 29_400_000,
  },
  apas: [],
  maps: [],
  // threshold test helpers — group revenue in EUR for CbCR test
  group_revenue: 820_000_000,
  group_revenue_currency: 'EUR',
  transmitting_country: 'IL',
  receiving_country: 'IL',
  contact: 'tax@technokoluzi.co.il',
};

// ═══ TESTS ══════════════════════════════════════════════════════════════════

describe('transfer-pricing: module surface', () => {
  test('exports the full public API', () => {
    assert.equal(typeof generateMasterFile, 'function');
    assert.equal(typeof generateLocalFile, 'function');
    assert.equal(typeof generateCbCR, 'function');
    assert.equal(typeof computeArmLength, 'function');
    assert.equal(typeof checkThreshold, 'function');
    assert.equal(typeof generateForm1385, 'function');
    assert.equal(typeof createEngine, 'function');
    assert.ok(METHODS.CUP && METHODS.TNMM && METHODS.PROFIT_SPLIT);
    assert.ok(THRESHOLDS.CBCR_EUR === 750_000_000);
  });

  test('createEngine() returns a bound instance', () => {
    const eng = createEngine();
    assert.equal(typeof eng.generateMasterFile, 'function');
    assert.equal(typeof eng.computeArmLength, 'function');
    assert.equal(typeof eng._internal.quantile, 'function');
  });
});

describe('transfer-pricing: generateMasterFile()', () => {
  test('includes every Section 85A required section', () => {
    const mf = generateMasterFile(group);
    assert.equal(mf.meta.document_type, 'MASTER_FILE');
    assert.equal(mf.meta.fiscal_year, FY);
    assert.ok(mf.section_1_organizational_structure);
    assert.ok(mf.section_2_business_description);
    assert.ok(mf.section_3_intangibles);
    assert.ok(mf.section_4_intercompany_financial_activities);
    assert.ok(mf.section_5_financial_and_tax_positions);
    assert.ok(mf.appendices.a_legal_chart);
  });

  test('aggregates entities, employees, and assets correctly', () => {
    const mf = generateMasterFile(group);
    assert.equal(
      mf.section_1_organizational_structure.constituent_entities.length,
      3,
    );
    assert.equal(
      mf.section_5_financial_and_tax_positions.total_employees,
      420 + 40 + 60,
    );
    assert.equal(
      mf.section_5_financial_and_tax_positions.total_tangible_assets,
      450_000_000 + 30_000_000 + 35_000_000,
    );
  });

  test('splits financing into loans / guarantees / cash pools', () => {
    const mf = generateMasterFile(group);
    assert.equal(
      mf.section_4_intercompany_financial_activities.loans.length,
      1,
    );
    assert.equal(
      mf.section_4_intercompany_financial_activities.guarantees.length,
      1,
    );
  });

  test('throws on missing group', () => {
    assert.throws(() => generateMasterFile(null), TypeError);
  });
});

describe('transfer-pricing: generateLocalFile()', () => {
  test('includes every Section 85A local sub-section', () => {
    const lf = generateLocalFile(localEntity);
    assert.equal(lf.meta.document_type, 'LOCAL_FILE');
    assert.ok(lf.section_1_local_entity);
    assert.ok(lf.section_2_controlled_transactions);
    assert.ok(lf.section_3_functional_analysis);
    assert.ok(lf.section_4_economic_analysis);
    assert.ok(lf.section_5_financial_information);
  });

  test('sums controlled transactions', () => {
    const lf = generateLocalFile(localEntity);
    assert.equal(
      lf.section_2_controlled_transactions.total_value,
      12_000_000 + 3_500_000 + 1_500_000,
    );
    assert.equal(
      lf.section_2_controlled_transactions.transactions.length,
      3,
    );
  });

  test('runs per-transaction arm\'s length results', () => {
    const lf = generateLocalFile(localEntity);
    const results = lf.section_4_economic_analysis.arm_length_results;
    assert.equal(results.length, 3);
    // TX-001 tested 0.055 — Q1..Q3 of [0.035..0.074] is around [0.046..0.066]
    assert.equal(results[0].decision, 'WITHIN_RANGE');
    // TX-003 tested 0.09 — clearly OUTSIDE_RANGE_HIGH
    assert.equal(results[2].decision, 'OUTSIDE_RANGE_HIGH');
    assert.ok(results[2].adjustment !== null);
  });

  test('canonicalises method aliases (cost plus → COST_PLUS)', () => {
    const lf = generateLocalFile(localEntity);
    const tx2 = lf.section_2_controlled_transactions.transactions[1];
    assert.equal(tx2.method, 'COST_PLUS');
  });
});

describe('transfer-pricing: computeArmLength() — method coverage', () => {
  test('TNMM with 7 comparables produces a valid interquartile range', () => {
    const tnmm = computeArmLength({
      method: 'TNMM',
      comparables: [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
      tested: 0.06,
    });
    assert.equal(tnmm.method, 'TNMM');
    assert.equal(tnmm.count, 7);
    // symmetric data → Q1=0.045, Q3=0.075, median=0.06
    assert.ok(Math.abs(tnmm.median - 0.06) < 1e-9);
    assert.ok(Math.abs(tnmm.range.lower - 0.045) < 1e-9);
    assert.ok(Math.abs(tnmm.range.upper - 0.075) < 1e-9);
    assert.equal(tnmm.decision, 'WITHIN_RANGE');
    assert.equal(tnmm.withinRange, true);
  });

  test('TNMM tested below Q1 → OUTSIDE_RANGE_LOW with positive adjustment', () => {
    const r = computeArmLength({
      method: 'TNMM',
      comparables: [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
      tested: 0.02,
    });
    assert.equal(r.decision, 'OUTSIDE_RANGE_LOW');
    assert.equal(r.withinRange, false);
    assert.ok(r.adjustment > 0);
  });

  test('TNMM tested above Q3 → OUTSIDE_RANGE_HIGH with negative adjustment', () => {
    const r = computeArmLength({
      method: 'TNMM',
      comparables: [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
      tested: 0.12,
    });
    assert.equal(r.decision, 'OUTSIDE_RANGE_HIGH');
    assert.equal(r.withinRange, false);
    assert.ok(r.adjustment < 0);
  });

  test('no tested value → NO_TESTED_PARTY_RESULT, withinRange=null', () => {
    const r = computeArmLength({
      method: 'CUP',
      comparables: [100, 110, 120, 130, 140],
    });
    assert.equal(r.decision, 'NO_TESTED_PARTY_RESULT');
    assert.equal(r.withinRange, null);
  });

  test('accepts all 5 methods (CUP, RESALE_PRICE, COST_PLUS, TNMM, PROFIT_SPLIT)', () => {
    for (const m of ['CUP', 'RESALE_PRICE', 'COST_PLUS', 'TNMM', 'PROFIT_SPLIT']) {
      const r = computeArmLength({
        method: m,
        comparables: [1, 2, 3, 4, 5],
        tested: 3,
      });
      assert.equal(r.method, m);
      assert.equal(r.decision, 'WITHIN_RANGE');
    }
  });

  test('rejects unknown methods', () => {
    assert.throws(
      () => computeArmLength({ method: 'FOOBAR', comparables: [1, 2] }),
      TypeError,
    );
  });

  test('rejects empty comparables', () => {
    assert.throws(
      () => computeArmLength({ method: 'TNMM', comparables: [] }),
      TypeError,
    );
  });
});

describe('transfer-pricing: generateCbCR() — XML schema validity', () => {
  test('returns xml, json, summary, byJurisdiction', () => {
    const out = generateCbCR(group);
    assert.ok(typeof out.xml === 'string');
    assert.ok(typeof out.json === 'object');
    assert.ok(typeof out.summary === 'object');
    assert.ok(Array.isArray(out.byJurisdiction));
  });

  test('XML has well-formed prolog + OECD CbC root + namespaces', () => {
    const { xml } = generateCbCR(group);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<cbc:CBC_OECD'));
    assert.ok(xml.includes('xmlns:cbc="urn:oecd:ties:cbc:v2"'));
    assert.ok(xml.includes('xmlns:stf="urn:oecd:ties:cbcstf:v5"'));
    assert.ok(xml.includes(`version="${CBCR_SCHEMA.version}"`));
    assert.ok(xml.includes('</cbc:CBC_OECD>'));
  });

  test('XML contains MessageSpec + ReportingEntity + CbcReports per country', () => {
    const { xml, byJurisdiction } = generateCbCR(group);
    assert.ok(xml.includes('<cbc:MessageSpec>'));
    assert.ok(xml.includes('<cbc:ReportingEntity>'));
    for (const r of byJurisdiction) {
      assert.ok(xml.includes(`<cbc:ResCountryCode>${r.country}</cbc:ResCountryCode>`));
    }
    // one CbcReports per jurisdiction
    const matches = xml.match(/<cbc:CbcReports>/g) || [];
    assert.equal(matches.length, byJurisdiction.length);
  });

  test('XML is a well-formed document (balanced tags)', () => {
    const { xml } = generateCbCR(group);
    // cheap well-formedness: open tag count == close tag count for every prefix
    const openTags = xml.match(/<cbc:[A-Za-z_]+(?=[\s/>])/g) || [];
    const closeTags = xml.match(/<\/cbc:[A-Za-z_]+>/g) || [];
    // Exclude self-closing tags (we don't emit any)
    const openCounts = {};
    for (const t of openTags) {
      const name = t.slice(5);
      openCounts[name] = (openCounts[name] || 0) + 1;
    }
    const closeCounts = {};
    for (const t of closeTags) {
      const name = t.slice(6, -1);
      closeCounts[name] = (closeCounts[name] || 0) + 1;
    }
    for (const k of Object.keys(openCounts)) {
      assert.equal(
        openCounts[k],
        closeCounts[k] || 0,
        `Tag <cbc:${k}> is unbalanced: ${openCounts[k]} open vs ${closeCounts[k] || 0} close`,
      );
    }
  });

  test('summary math aggregates correctly', () => {
    const { summary } = generateCbCR(group);
    assert.equal(summary.jurisdictions, 3);
    assert.equal(
      summary.total_employees,
      420 + 40 + 60,
    );
    assert.equal(
      summary.total_tax_paid,
      25_000_000 + 1_600_000 + 2_800_000,
    );
  });

  test('byJurisdiction sorted alphabetically (DE, IL, US)', () => {
    const { byJurisdiction } = generateCbCR(group);
    assert.deepEqual(
      byJurisdiction.map((r) => r.country),
      ['DE', 'IL', 'US'],
    );
  });

  test('XML escapes special characters in entity names', () => {
    const g2 = {
      ...group,
      entities: [
        {
          ...ultimateParent,
          legal_name: 'Foo & Bar <Inc> "Ltd."',
        },
      ],
    };
    const { xml } = generateCbCR(g2);
    assert.ok(xml.includes('Foo &amp; Bar &lt;Inc&gt; &quot;Ltd.&quot;'));
    assert.ok(!xml.includes('Foo & Bar <Inc>')); // raw version absent
  });
});

describe('transfer-pricing: checkThreshold()', () => {
  test('group with EUR 820M revenue → filing required', () => {
    const r = checkThreshold({
      group_revenue: 820_000_000,
      group_revenue_currency: 'EUR',
    });
    assert.equal(r.required, true);
    assert.equal(r.threshold, 750_000_000);
  });

  test('group with EUR 500M revenue → filing NOT required', () => {
    const r = checkThreshold({
      group_revenue: 500_000_000,
      group_revenue_currency: 'EUR',
    });
    assert.equal(r.required, false);
  });

  test('ILS revenue is converted using caller-supplied FX rate', () => {
    // 3.5B ILS ÷ 4.0 = 875M EUR → required
    const r = checkThreshold({
      group_revenue: 3_500_000_000,
      group_revenue_currency: 'ILS',
      fx_rate_eur_ils: 4.0,
    });
    assert.equal(r.required, true);
    assert.ok(Math.abs(r.groupRevenueEur - 875_000_000) < 1);
  });

  test('ILS revenue below threshold after conversion → not required', () => {
    // 2.8B ILS ÷ 4.0 = 700M EUR → NOT required
    const r = checkThreshold({
      group_revenue: 2_800_000_000,
      group_revenue_currency: 'ILS',
      fx_rate_eur_ils: 4.0,
    });
    assert.equal(r.required, false);
  });

  test('USD revenue without an fx rate returns null with explanatory message', () => {
    const r = checkThreshold({
      group_revenue: 900_000_000,
      group_revenue_currency: 'USD',
    });
    assert.equal(r.required, null);
    assert.ok(r.message.includes('fx_rate_eur_usd'));
  });

  test('response has bilingual messages', () => {
    const r = checkThreshold({
      group_revenue: 800_000_000,
      group_revenue_currency: 'EUR',
    });
    assert.ok(r.message.length > 0);
    assert.ok(r.message_he.length > 0);
    assert.ok(r.message_he.includes('CbCR'));
  });
});

describe('transfer-pricing: generateForm1385() — row mapping', () => {
  const txs = [
    {
      type: 'goods',
      counterparty_name: 'TKU USA',
      counterparty_country: 'US',
      counterparty_tax_id: '98-7654321',
      amount: 12_000_000,
      currency: 'ILS',
      method: 'TNMM',
      documentation_prepared: true,
      analysis_outcome: 'WITHIN_RANGE',
      notes: 'Sale of goods to US affiliate',
    },
    {
      type: 'services',
      counterparty_name: 'TKU DE',
      counterparty_country: 'DE',
      counterparty_tax_id: 'DE312345678',
      amount: 1_000_000,
      currency: 'EUR',
      method: 'cost plus',
      documentation_prepared: 'yes',
    },
  ];

  test('header maps to codes 010..013', () => {
    const f = generateForm1385(
      {
        legal_name: 'Techno-Kol Uzi Ltd.',
        tax_id: '516123456',
        fiscal_year: 2026,
        functional_currency: 'ILS',
        fx_eur_ils: 4.0,
      },
      txs,
    );
    assert.equal(f.header['010'], 'Techno-Kol Uzi Ltd.');
    assert.equal(f.header['011'], '516123456');
    assert.equal(f.header['012'], 2026);
    assert.equal(f.header['013'], 'ILS');
    // labels attached for both languages
    assert.equal(f.header._labels.he['010'], FORM_1385_FIELDS.header.row_1.he);
    assert.equal(f.header._labels.en['010'], FORM_1385_FIELDS.header.row_1.en);
  });

  test('each row maps to codes 020..031 with correct type/ccy/ILS amount', () => {
    const f = generateForm1385(
      {
        legal_name: 'Techno-Kol Uzi Ltd.',
        tax_id: '516123456',
        fiscal_year: 2026,
        functional_currency: 'ILS',
        fx_eur_ils: 4.0,
      },
      txs,
    );
    assert.equal(f.rows.length, 2);
    // row 1 — goods, US, TNMM, ILS 12M → ILS 12M
    // FORM_1385_FIELDS.row_fields:
    //   col_a=020 type, col_b=021 name, col_c=022 country, col_d=023 tax id,
    //   col_e=024 relationship, col_f=025 amount, col_g=026 currency,
    //   col_h=027 ILS amount, col_i=028 method, col_j=029 doc prepared
    assert.equal(f.rows[0]['020'], 'goods');
    assert.equal(f.rows[0]['021'], 'TKU USA');
    assert.equal(f.rows[0]['022'], 'US');
    assert.equal(f.rows[0]['023'], '98-7654321');
    assert.equal(f.rows[0]['024'], 'related_party');
    assert.equal(f.rows[0]['025'], 12_000_000); // amount
    assert.equal(f.rows[0]['026'], 'ILS'); // currency
    assert.equal(f.rows[0]['027'], 12_000_000); // ILS amount
    assert.equal(f.rows[0]['028'], 'TNMM'); // method
    assert.equal(f.rows[0]['029'], 'YES'); // doc prepared (true)
    // row 2 — services, DE, cost plus → COST_PLUS, YES for 'yes'
    assert.equal(f.rows[1]['020'], 'services');
    assert.equal(f.rows[1]['022'], 'DE');
    assert.equal(f.rows[1]['026'], 'EUR');
    assert.equal(f.rows[1]['028'], 'COST_PLUS');
    assert.equal(f.rows[1]['029'], 'YES'); // 'yes' string
  });

  test('totals row 099 equals sum of col_h (ILS)', () => {
    const entity = {
      legal_name: 'Techno-Kol Uzi Ltd.',
      tax_id: '516123456',
      fiscal_year: 2026,
      functional_currency: 'ILS',
      fx_eur_ils: 4.0,
    };
    const f = generateForm1385(entity, txs);
    const sum = f.rows.reduce((s, r) => s + r['027'], 0);
    assert.equal(f.totals['099'], Math.round(sum * 100) / 100);
    assert.equal(f.totals.row_count, 2);
  });

  test('emits schema-tagged Form1385 XML with all row codes', () => {
    const f = generateForm1385(
      {
        legal_name: 'Techno-Kol Uzi Ltd.',
        tax_id: '516123456',
        fiscal_year: 2026,
        functional_currency: 'ILS',
      },
      txs,
    );
    assert.ok(f.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(f.xml.includes('<Form1385 xmlns="urn:israel:tax:form:1385:v2026">'));
    assert.ok(f.xml.includes('<Field code="010">Techno-Kol Uzi Ltd.</Field>'));
    assert.ok(f.xml.includes('<Field code="099">')); // totals row
    for (const k of Object.keys(FORM_1385_FIELDS.row_fields)) {
      const code = FORM_1385_FIELDS.row_fields[k].code;
      assert.ok(f.xml.includes(`<Field code="${code}">`), `missing field ${code}`);
    }
  });

  test('includes a warning note when no transactions were supplied', () => {
    const f = generateForm1385(
      { legal_name: 'X', tax_id: '1', fiscal_year: 2026 },
      [],
    );
    assert.equal(f.rows.length, 0);
    assert.ok(f.notes.some((n) => n.includes('No international')));
  });
});

describe('transfer-pricing: internal helpers (via createEngine)', () => {
  const eng = createEngine();
  const { quantile, median, mean, interquartileRange, canonicalMethod } =
    eng._internal;

  test('quantile matches OECD linear-interpolation formula', () => {
    const arr = [1, 2, 3, 4, 5];
    // n=5, pos = 4*q; q=0.25 → pos=1, base=1, s[1]=2 → 2
    assert.equal(quantile(arr, 0.25), 2);
    // q=0.75 → pos=3, s[3]=4 → 4
    assert.equal(quantile(arr, 0.75), 4);
    assert.equal(quantile(arr, 0.5), 3); // median
  });

  test('median of even array averages middle two', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  test('mean handles empty array', () => {
    assert.equal(mean([]), 0);
  });

  test('interquartileRange returns { q1, q3, width }', () => {
    const r = interquartileRange([1, 2, 3, 4, 5]);
    assert.equal(r.q1, 2);
    assert.equal(r.q3, 4);
    assert.equal(r.width, 2);
  });

  test('canonicalMethod handles common aliases', () => {
    assert.equal(canonicalMethod('cup'), 'CUP');
    assert.equal(canonicalMethod('cost plus'), 'COST_PLUS');
    assert.equal(canonicalMethod('Resale-Price'), 'RESALE_PRICE');
    assert.equal(canonicalMethod('TNMM'), 'TNMM');
    assert.equal(canonicalMethod('psm'), 'PROFIT_SPLIT');
    assert.equal(canonicalMethod('bogus'), null);
    assert.equal(canonicalMethod(null), null);
  });
});
