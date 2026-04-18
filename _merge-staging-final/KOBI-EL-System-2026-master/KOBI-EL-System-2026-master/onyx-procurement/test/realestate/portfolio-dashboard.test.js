/**
 * Unit tests for src/realestate/portfolio-dashboard.js
 * Run with: node --test test/realestate/portfolio-dashboard.test.js
 *
 * Coverage:
 *   • Aggregation math — value / equity / debt / rent / NOI / cash flow
 *   • HHI concentration — city / type / tenant buckets
 *   • Debt amortization schedule
 *   • Vacancy timeline weighted average
 *   • CapEx rollups — YTD / LTM / lifetime
 *   • Disposition — net proceeds & simplified betterment tax
 *   • Performance ranking by property
 *   • setPortfolio / getPortfolio immutability
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const pd = require('../../src/realestate/portfolio-dashboard.js');
const {
  setPortfolio,
  getPortfolio,
  aggregatePortfolio,
  performanceByProperty,
  concentrationRisk,
  debtSchedule,
  vacancyTimeline,
  capex,
  disposition,
  TAX_CONSTANTS_2026,
  HEBREW_LABELS,
  ENGLISH_LABELS,
  _internals,
} = pd;

// ═══════════════════════════════════════════════════════════════
// Fixture: four-property portfolio across Tel Aviv, Haifa, Rishon
// ═══════════════════════════════════════════════════════════════
function buildFixture() {
  return [
    {
      id: 'P001',
      ownerId: 'uzi',
      name_he: 'רוטשילד 10',
      name_en: 'Rothschild 10',
      city: 'תל אביב',
      propertyType: 'apartment',
      block: '7104',
      parcel: '28',
      purchaseDate: '2015-03-10',
      purchasePrice: 3_000_000,
      currentValue: 5_500_000,
      mortgages: [
        {
          id: 'M001',
          bank: 'בנק הפועלים',
          principal: 2_000_000,
          balance: 1_500_000,
          rate: 0.04,
          termMonths: 240,
          startDate: '2015-04-01',
          paymentMonthly: 9_095,
        },
      ],
      units: [
        {
          id: 'U1',
          sqm: 85,
          tenant: { id: 'T1', name: 'כהן דוד' },
          monthlyRent: 9_000,
          leaseStart: '2025-01-01',
          leaseEnd: '2027-01-01',
          vacant: false,
        },
      ],
      monthlyExpenses: {
        management: 300,
        maintenance: 500,
        insurance: 250,
        propertyTax: 400,
        utilities: 0,
        other: 100,
      },
      capex: [
        { date: '2026-02-15', amount: 40_000, category: 'שיפוץ', description: 'מטבח חדש' },
        { date: '2025-05-01', amount: 15_000, category: 'תחזוקה', description: 'דוד שמש' },
      ],
      vacancyHistory: [
        { yearMonth: '2026-01', vacancyPct: 0.0 },
        { yearMonth: '2026-02', vacancyPct: 0.0 },
        { yearMonth: '2026-03', vacancyPct: 0.0 },
      ],
    },
    {
      id: 'P002',
      ownerId: 'uzi',
      name_he: 'מגדל חיפה',
      name_en: 'Haifa Tower',
      city: 'חיפה',
      propertyType: 'commercial',
      block: '10800',
      parcel: '5',
      purchaseDate: '2018-06-01',
      purchasePrice: 12_000_000,
      currentValue: 15_000_000,
      mortgages: [
        {
          id: 'M002',
          bank: 'בנק לאומי',
          principal: 8_000_000,
          balance: 6_800_000,
          rate: 0.045,
          termMonths: 300,
          startDate: '2018-07-01',
          paymentMonthly: 44_520,
        },
      ],
      units: [
        {
          id: 'U2A',
          sqm: 200,
          tenant: { id: 'T2', name: 'טקנו-קול בע"מ' },
          monthlyRent: 35_000,
          leaseStart: '2024-01-01',
          leaseEnd: '2029-01-01',
          vacant: false,
        },
        {
          id: 'U2B',
          sqm: 150,
          tenant: null,
          monthlyRent: 28_000,
          leaseStart: null,
          leaseEnd: null,
          vacant: true,
        },
      ],
      monthlyExpenses: {
        management: 2_500,
        maintenance: 3_000,
        insurance: 1_200,
        propertyTax: 2_800,
        utilities: 500,
        other: 300,
      },
      capex: [
        { date: '2026-01-20', amount: 250_000, category: 'שדרוג', description: 'מעלית חדשה' },
      ],
      vacancyHistory: [
        { yearMonth: '2026-01', vacancyPct: 0.5 },
        { yearMonth: '2026-02', vacancyPct: 0.5 },
        { yearMonth: '2026-03', vacancyPct: 0.5 },
      ],
    },
    {
      id: 'P003',
      ownerId: 'uzi',
      name_he: 'ראשון לציון מרכזי',
      name_en: 'Rishon Central',
      city: 'ראשון לציון',
      propertyType: 'retail',
      block: '3925',
      parcel: '102',
      purchaseDate: '2020-09-15',
      purchasePrice: 6_500_000,
      currentValue: 7_200_000,
      mortgages: [
        {
          id: 'M003',
          bank: 'בנק דיסקונט',
          principal: 4_000_000,
          balance: 3_600_000,
          rate: 0.038,
          termMonths: 240,
          startDate: '2020-10-01',
          paymentMonthly: 21_350,
        },
      ],
      units: [
        {
          id: 'U3',
          sqm: 120,
          tenant: { id: 'T3', name: 'סופר-פארם' },
          monthlyRent: 22_000,
          leaseStart: '2022-01-01',
          leaseEnd: '2032-01-01',
          vacant: false,
        },
      ],
      monthlyExpenses: {
        management: 900,
        maintenance: 1_200,
        insurance: 400,
        propertyTax: 1_100,
        utilities: 0,
        other: 0,
      },
      capex: [],
      vacancyHistory: [
        { yearMonth: '2026-01', vacancyPct: 0.0 },
        { yearMonth: '2026-02', vacancyPct: 0.0 },
        { yearMonth: '2026-03', vacancyPct: 0.0 },
      ],
    },
    {
      id: 'P004',
      ownerId: 'uzi',
      name_he: 'דיזנגוף 50',
      name_en: 'Dizengoff 50',
      city: 'תל אביב',
      propertyType: 'apartment',
      block: '6213',
      parcel: '15',
      purchaseDate: '2012-01-10',
      purchasePrice: 2_200_000,
      currentValue: 4_000_000,
      mortgages: [], // paid off
      units: [
        {
          id: 'U4',
          sqm: 70,
          tenant: { id: 'T4', name: 'לוי שרה' },
          monthlyRent: 7_500,
          leaseStart: '2025-06-01',
          leaseEnd: '2027-06-01',
          vacant: false,
        },
      ],
      monthlyExpenses: {
        management: 250,
        maintenance: 400,
        insurance: 200,
        propertyTax: 350,
        utilities: 0,
        other: 0,
      },
      capex: [
        { date: '2025-11-10', amount: 20_000, category: 'צביעה', description: 'צביעה פנימית' },
      ],
      vacancyHistory: [
        { yearMonth: '2026-01', vacancyPct: 0.0 },
        { yearMonth: '2026-02', vacancyPct: 0.0 },
        { yearMonth: '2026-03', vacancyPct: 0.0 },
      ],
    },
  ];
}

beforeEach(() => {
  setPortfolio(buildFixture());
});

// ═══════════════════════════════════════════════════════════════
// setPortfolio / getPortfolio
// ═══════════════════════════════════════════════════════════════

describe('setPortfolio / getPortfolio', () => {
  test('setPortfolio returns length', () => {
    const n = setPortfolio(buildFixture());
    assert.equal(n, 4);
  });

  test('getPortfolio returns a copy, not the internal array', () => {
    const a = getPortfolio();
    const b = getPortfolio();
    assert.notEqual(a, b);
    assert.equal(a.length, b.length);
  });

  test('setPortfolio rejects non-arrays', () => {
    assert.throws(() => setPortfolio('oops'));
  });
});

// ═══════════════════════════════════════════════════════════════
// aggregatePortfolio
// ═══════════════════════════════════════════════════════════════

describe('aggregatePortfolio', () => {
  test('totalValue = sum of currentValue', () => {
    const a = aggregatePortfolio();
    // 5.5M + 15M + 7.2M + 4M = 31.7M
    assert.equal(a.totalValue, 31_700_000);
  });

  test('totalDebt = sum of mortgage balances', () => {
    const a = aggregatePortfolio();
    // 1.5M + 6.8M + 3.6M + 0 = 11.9M
    assert.equal(a.totalDebt, 11_900_000);
  });

  test('totalEquity = value − debt', () => {
    const a = aggregatePortfolio();
    assert.equal(a.totalEquity, 31_700_000 - 11_900_000);
  });

  test('ltv = debt / value', () => {
    const a = aggregatePortfolio();
    const expected = Math.round((11_900_000 / 31_700_000) * 10000) / 10000;
    assert.equal(a.ltv, expected);
  });

  test('monthlyRentRoll counts only non-vacant units', () => {
    const a = aggregatePortfolio();
    // 9000 + 35000 + 22000 + 7500 = 73,500  (U2B vacant, excluded)
    assert.equal(a.monthlyRentRoll, 73_500);
  });

  test('potentialRent counts all units (incl. vacant)', () => {
    const a = aggregatePortfolio();
    assert.equal(a.potentialRent, 73_500 + 28_000);
  });

  test('monthlyExpenses sums all categories', () => {
    const a = aggregatePortfolio();
    // P1: 1550, P2: 10300, P3: 3600, P4: 1200 → 16,650
    assert.equal(a.monthlyExpenses, 16_650);
  });

  test('monthlyNOI = rent − expenses', () => {
    const a = aggregatePortfolio();
    assert.equal(a.monthlyNOI, 73_500 - 16_650);
  });

  test('monthlyCashFlow = NOI − debt service', () => {
    const a = aggregatePortfolio();
    const debtService = 9_095 + 44_520 + 21_350;
    assert.equal(a.monthlyCashFlow, 73_500 - 16_650 - debtService);
  });

  test('occupancy < 1 because one unit is vacant', () => {
    const a = aggregatePortfolio();
    assert.ok(a.occupancy > 0 && a.occupancy < 1);
    // 4 of 5 units occupied → occupiedUnitCount = 4
    assert.equal(a.occupiedUnitCount, 4);
    assert.equal(a.unitCount, 5);
  });

  test('ownerId filter matches', () => {
    const a = aggregatePortfolio({ ownerId: 'uzi' });
    assert.equal(a.propertyCount, 4);
    const none = aggregatePortfolio({ ownerId: 'ghost' });
    assert.equal(none.propertyCount, 0);
    assert.equal(none.totalValue, 0);
  });

  test('exposes bilingual labels', () => {
    const a = aggregatePortfolio();
    assert.equal(a.labels.he, HEBREW_LABELS);
    assert.equal(a.labels.en, ENGLISH_LABELS);
  });

  test('cashOnCash = annual cash flow / equity', () => {
    const a = aggregatePortfolio();
    const expected = Math.round((a.annualCashFlow / a.totalEquity) * 10000) / 10000;
    assert.equal(a.cashOnCash, expected);
  });

  test('capRate = annual NOI / total value', () => {
    const a = aggregatePortfolio();
    const expected = Math.round((a.annualNOI / a.totalValue) * 10000) / 10000;
    assert.equal(a.capRate, expected);
  });
});

// ═══════════════════════════════════════════════════════════════
// performanceByProperty
// ═══════════════════════════════════════════════════════════════

describe('performanceByProperty', () => {
  test('returns one row per property', () => {
    const rows = performanceByProperty('month');
    assert.equal(rows.length, 4);
  });

  test('rows are sorted by NOI desc and carry rank', () => {
    const rows = performanceByProperty('month');
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].noi >= rows[i].noi);
      assert.equal(rows[i - 1].rank, i);
    }
  });

  test('quarter multiplier = x3', () => {
    const m = performanceByProperty('month');
    const q = performanceByProperty('quarter');
    const top = m[0];
    const topQ = q.find((r) => r.id === top.id);
    assert.equal(topQ.rentRoll, Math.round(top.rentRoll * 3 * 100) / 100);
  });

  test('ytd multiplier = x12', () => {
    const m = performanceByProperty('month');
    const y = performanceByProperty('ytd');
    const top = m[0];
    const topY = y.find((r) => r.id === top.id);
    assert.equal(topY.rentRoll, Math.round(top.rentRoll * 12 * 100) / 100);
  });

  test('Haifa Tower has the highest NOI in the fixture', () => {
    const rows = performanceByProperty('month');
    assert.equal(rows[0].id, 'P002');
  });
});

// ═══════════════════════════════════════════════════════════════
// concentrationRisk — HHI
// ═══════════════════════════════════════════════════════════════

describe('concentrationRisk', () => {
  test('byCity buckets sum to ≈ 1.0', () => {
    const r = concentrationRisk();
    const total = r.byCity.buckets.reduce((a, b) => a + b.share, 0);
    assert.ok(Math.abs(total - 1) < 0.001);
  });

  test('byType buckets: four types present', () => {
    const r = concentrationRisk();
    const keys = r.byType.buckets.map((b) => b.key).sort();
    assert.deepEqual(keys, ['apartment', 'commercial', 'retail'].sort());
  });

  test('Haifa Tower (15M) is the largest value bucket by city', () => {
    const r = concentrationRisk();
    assert.equal(r.byCity.buckets[0].key, 'חיפה');
  });

  test('HHI is in the 0..10000 range', () => {
    const r = concentrationRisk();
    assert.ok(r.byCity.hhi >= 0 && r.byCity.hhi <= 10000);
    assert.ok(r.byType.hhi >= 0 && r.byType.hhi <= 10000);
    assert.ok(r.byTenant.hhi >= 0 && r.byTenant.hhi <= 10000);
  });

  test('HHI formula: single bucket = 10000', () => {
    // Collapse fixture to a single property → city HHI must be 10,000
    setPortfolio([
      {
        id: 'only',
        city: 'תל אביב',
        propertyType: 'apartment',
        currentValue: 5_000_000,
        mortgages: [],
        units: [{ monthlyRent: 10_000, vacant: false, tenant: { name: 'דייר יחיד' } }],
        monthlyExpenses: {},
      },
    ]);
    const r = concentrationRisk();
    assert.equal(r.byCity.hhi, 10_000);
    assert.equal(r.byType.hhi, 10_000);
    assert.equal(r.byTenant.hhi, 10_000);
    assert.equal(r.byCity.classification.level, 'high');
  });

  test('classification thresholds honoured', () => {
    // Split portfolio equally between 10 cities → HHI ≈ 1000 (low)
    const ten = [];
    for (let i = 0; i < 10; i++) {
      ten.push({
        id: `T${i}`,
        city: `עיר ${i}`,
        propertyType: 'apartment',
        currentValue: 1_000_000,
        mortgages: [],
        units: [{ monthlyRent: 1000, vacant: false, tenant: { name: `דייר ${i}` } }],
        monthlyExpenses: {},
      });
    }
    setPortfolio(ten);
    const r = concentrationRisk();
    assert.equal(r.byCity.classification.level, 'low');
    assert.ok(r.byCity.hhi < 1500);
  });

  test('formula labels are bilingual', () => {
    const r = concentrationRisk();
    assert.ok(r.formula.he.includes('HHI'));
    assert.ok(r.formula.en.includes('HHI'));
    assert.equal(r.formula.thresholds.low, 1500);
    assert.equal(r.formula.thresholds.high, 2500);
  });
});

// ═══════════════════════════════════════════════════════════════
// debtSchedule — amortization
// ═══════════════════════════════════════════════════════════════

describe('debtSchedule', () => {
  test('one row per mortgage (3 in fixture)', () => {
    const ds = debtSchedule();
    assert.equal(ds.mortgages.length, 3);
  });

  test('totalBalance = sum of mortgage balances', () => {
    const ds = debtSchedule();
    assert.equal(ds.totals.totalBalance, 1_500_000 + 6_800_000 + 3_600_000);
  });

  test('each schedule balance decreases monotonically to small end-residual', () => {
    const ds = debtSchedule();
    for (const m of ds.mortgages) {
      // balance should strictly decrease month-over-month
      for (let i = 1; i < m.schedule.length; i++) {
        assert.ok(m.schedule[i].balance <= m.schedule[i - 1].balance);
      }
      // and end at a small fraction of the opening principal
      const last = m.schedule[m.schedule.length - 1];
      assert.ok(Math.abs(last.balance) < m.balance * 0.02 + 1);
    }
  });

  test('derived amortize with 0 paymentMonthly lands exactly at zero', () => {
    const am = _internals.amortize(500_000, 0.05, 60, 0); // derive payment
    const last = am.rows[am.rows.length - 1];
    assert.ok(Math.abs(last.balance) < 1);
  });

  test('principal + interest ≈ payment for every row', () => {
    const ds = debtSchedule();
    for (const m of ds.mortgages) {
      for (const r of m.schedule) {
        assert.ok(Math.abs(r.payment - (r.principal + r.interest)) < 1);
      }
    }
  });

  test('weightedAvgRate is between min and max', () => {
    const ds = debtSchedule();
    const rates = ds.mortgages.map((m) => m.rate);
    assert.ok(ds.totals.weightedAvgRate >= Math.min(...rates));
    assert.ok(ds.totals.weightedAvgRate <= Math.max(...rates));
  });

  test('amortize: 0% rate splits principal evenly', () => {
    const am = _internals.amortize(120_000, 0, 12, 0);
    assert.equal(am.payment, 10_000);
    assert.equal(am.totalInterest, 0);
    assert.equal(am.rows.length, 12);
  });

  test('amortize: fixed 5%/120 months matches formula', () => {
    const am = _internals.amortize(100_000, 0.05, 120, 0);
    // expected payment ≈ 1060.66
    assert.ok(Math.abs(am.payment - 1060.66) < 0.5);
    assert.equal(am.rows.length, 120);
  });
});

// ═══════════════════════════════════════════════════════════════
// vacancyTimeline
// ═══════════════════════════════════════════════════════════════

describe('vacancyTimeline', () => {
  test('one point per distinct yearMonth', () => {
    const v = vacancyTimeline();
    assert.equal(v.series.length, 3);
  });

  test('weighted by unit count', () => {
    const v = vacancyTimeline();
    // P2 has 2 units at 0.5, P1/P3/P4 each 1 unit at 0
    // Weighted vacancy = (0*1 + 0.5*2 + 0*1 + 0*1) / (1+2+1+1) = 1/5 = 0.2
    const first = v.series[0];
    assert.equal(first.vacancyPct, 0.2);
  });

  test('stats.avg is mean of series', () => {
    const v = vacancyTimeline();
    const mean = v.series.reduce((a, b) => a + b.vacancyPct, 0) / v.series.length;
    assert.equal(v.stats.avg, Math.round(mean * 10000) / 10000);
  });

  test('fallback to live occupancy when no history', () => {
    setPortfolio([
      {
        id: 'X',
        city: 'תל אביב',
        propertyType: 'apartment',
        currentValue: 1_000_000,
        mortgages: [],
        units: [
          { monthlyRent: 5_000, vacant: false, tenant: { name: 'א' } },
          { monthlyRent: 5_000, vacant: true, tenant: null },
        ],
        monthlyExpenses: {},
        capex: [],
        vacancyHistory: [],
      },
    ]);
    const v = vacancyTimeline();
    assert.equal(v.series.length, 1);
    assert.equal(v.series[0].vacancyPct, 0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// capex
// ═══════════════════════════════════════════════════════════════

describe('capex', () => {
  test('four property rows', () => {
    const c = capex();
    assert.equal(c.properties.length, 4);
  });

  test('lifetime per property sums items', () => {
    const c = capex();
    const p1 = c.properties.find((p) => p.propertyId === 'P001');
    assert.equal(p1.lifetime, 55_000);
  });

  test('totals.lifetime = grand total', () => {
    const c = capex();
    // 55000 + 250000 + 0 + 20000 = 325,000
    assert.equal(c.totals.lifetime, 325_000);
  });

  test('itemCount is correct', () => {
    const c = capex();
    assert.equal(c.totals.count, 4);
  });
});

// ═══════════════════════════════════════════════════════════════
// disposition
// ═══════════════════════════════════════════════════════════════

describe('disposition', () => {
  test('throws when propertyId missing', () => {
    assert.throws(() => disposition({ projectedPrice: 5_000_000 }));
  });

  test('throws when projectedPrice not numeric', () => {
    assert.throws(() => disposition({ propertyId: 'P001', projectedPrice: 'na' }));
  });

  test('throws when property unknown', () => {
    assert.throws(() => disposition({ propertyId: 'GHOST', projectedPrice: 1_000_000 }));
  });

  test('sells P001 with the full costing chain', () => {
    const d = disposition({
      propertyId: 'P001',
      projectedPrice: 6_000_000,
      costs: { sellerType: 'individual' },
    });
    assert.equal(d.purchase, 3_000_000);
    assert.equal(d.broker, 120_000); // 2%
    assert.equal(d.legal, 30_000);   // 0.5%
    // improvements = capex = 55,000 (40k + 15k)
    // gain = 6,000,000 − 3,000,000 − 55,000 − 0 = 2,945,000
    assert.equal(d.gain, 2_945_000);
    // betterment = 2,945,000 × 0.25 = 736,250
    assert.equal(d.bettermentTax, 736_250);
    // outstanding debt = 1,500,000
    assert.equal(d.outstandingDebt, 1_500_000);
    // net = 6,000,000 − 120,000 − 30,000 − 736,250 − 1,500,000 = 3,613,750
    assert.equal(d.netProceeds, 3_613_750);
  });

  test('company seller uses 23% rate', () => {
    const d = disposition({
      propertyId: 'P002',
      projectedPrice: 18_000_000,
      costs: { sellerType: 'company' },
    });
    assert.equal(d.bettermentRate, 0.23);
  });

  test('overrides broker / legal percentages', () => {
    const d = disposition({
      propertyId: 'P001',
      projectedPrice: 6_000_000,
      costs: { brokerCommissionPct: 0.01, legalFeesPct: 0.0025, sellerType: 'individual' },
    });
    assert.equal(d.broker, 60_000);
    assert.equal(d.legal, 15_000);
  });

  test('negative gain → zero betterment tax (not negative)', () => {
    setPortfolio([
      {
        id: 'loss',
        city: 'אילת',
        propertyType: 'apartment',
        purchaseDate: '2010-01-01',
        purchasePrice: 5_000_000,
        currentValue: 3_000_000,
        mortgages: [],
        units: [{ monthlyRent: 5000, vacant: false, tenant: { name: 'ל' } }],
        monthlyExpenses: {},
        capex: [],
      },
    ]);
    const d = disposition({
      propertyId: 'loss',
      projectedPrice: 4_000_000,
      costs: { sellerType: 'individual' },
    });
    assert.equal(d.bettermentTax, 0);
    assert.ok(d.gain < 0);
  });

  test('bilingual notes present', () => {
    const d = disposition({ propertyId: 'P001', projectedPrice: 6_000_000 });
    assert.ok(d.notes.he.length > 0);
    assert.ok(d.notes.en.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

describe('constants', () => {
  test('TAX_CONSTANTS_2026 has expected keys', () => {
    assert.equal(TAX_CONSTANTS_2026.BETTERMENT_INDIVIDUAL, 0.25);
    assert.equal(TAX_CONSTANTS_2026.BETTERMENT_COMPANY, 0.23);
    assert.equal(TAX_CONSTANTS_2026.VAT, 0.18);
  });

  test('HEBREW_LABELS has the core KPI keys', () => {
    assert.ok(HEBREW_LABELS.totalValue);
    assert.ok(HEBREW_LABELS.noi);
    assert.ok(HEBREW_LABELS.cashOnCash);
  });

  test('ENGLISH_LABELS mirrors HEBREW_LABELS keys', () => {
    for (const k of Object.keys(HEBREW_LABELS)) {
      assert.ok(ENGLISH_LABELS[k], `missing EN for ${k}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration — full end-to-end pull
// ═══════════════════════════════════════════════════════════════

describe('integration', () => {
  test('one call site can pull every widget without error', () => {
    const a = aggregatePortfolio();
    const p = performanceByProperty('ytd');
    const c = concentrationRisk();
    const d = debtSchedule();
    const v = vacancyTimeline();
    const x = capex();
    const disp = disposition({ propertyId: 'P001', projectedPrice: 6_500_000 });
    assert.ok(a && p && c && d && v && x && disp);
    assert.equal(a.propertyCount, 4);
    assert.equal(p.length, 4);
    assert.equal(d.mortgages.length, 3);
  });
});
