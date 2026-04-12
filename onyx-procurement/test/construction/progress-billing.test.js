/**
 * AG-Y056 — Unit tests for Construction Progress Billing
 *
 * Covers:
 *   - defineContract (BOQ normalization, retention defaults)
 *   - submitPayment (completedQty vs completedPct)
 *   - computeG702 math (9 lines, incl. retention, change orders)
 *   - computeG703 line-item sum (totals vs sum of rows)
 *   - changeOrder (amount + schedule impact)
 *   - approveBilling + markBillingPaid
 *   - retentionRelease (partial + final, cumulative cap)
 *   - lienWaiver (4 types, effective flag, conditional vs unconditional)
 *   - subcontractorPayments (pay-when-paid partition)
 *
 * Run with:  node --test test/construction/progress-billing.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ProgressBilling,
  LIEN_WAIVER_TYPES,
  BOQ_UNITS,
  DEFAULT_RETENTION_PCT,
} = require('../../src/construction/progress-billing');

/* --------------------------------------------------------------------------
 * Helper: seed a contract for a two-storey residential project
 * ------------------------------------------------------------------------ */
function seedContract(pb, overrides) {
  const base = {
    projectId: 'PROJ-VILLA-NATANYA',
    client: { id: 'C-001', name_he: 'משפחת כהן', name_en: 'The Cohen Family' },
    contractor: { id: 'CO-TKU', name_he: 'טכנו-קול עוזי בע״מ', name_en: 'Techno-Kol Uzi Ltd' },
    totalAmount: 1000000,
    retention: 10,
    boq: [
      { item: 'עבודות עפר וחפירה', unit: 'm3', qty: 500, unitPrice: 200, section: 'site-prep', item_he: 'עבודות עפר וחפירה', item_en: 'Excavation and earthworks' },
      { item: 'בטון יסודות', unit: 'm3', qty: 100, unitPrice: 1500, section: 'foundations', item_he: 'יציקת בטון יסודות', item_en: 'Foundation concrete' },
      { item: 'קונסטרוקציית בטון', unit: 'm3', qty: 200, unitPrice: 2000, section: 'structure', item_he: 'קונסטרוקציית בטון מזויין', item_en: 'Reinforced concrete structure' },
      { item: 'חיפוי גבס', unit: 'm2', qty: 800, unitPrice: 125, section: 'finishing', item_he: 'חיפוי גבס פנים', item_en: 'Interior gypsum finishing' },
      { item: 'מערכות חשמל', unit: 'lump', qty: 1, unitPrice: 250000, section: 'mep', item_he: 'מערכות חשמל ותאורה', item_en: 'Electrical and lighting systems' },
    ],
    changeOrders: [],
    startDate: '2026-01-15',
    endDate: '2026-12-15',
  };
  return pb.defineContract(Object.assign(base, overrides || {}));
}

/* ==========================================================================
 * defineContract
 * ========================================================================= */
describe('defineContract', function () {
  test('accepts a valid BOQ and stores normalized line items', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    assert.equal(k.totalAmount, 1000000);
    assert.equal(k.retention, 10);
    assert.equal(k.boq.length, 5);
    assert.equal(k.boq[0].lineId, 'L-0001');
    assert.equal(k.boq[0].unit, 'm3');
    assert.equal(k.boq[0].unit_he, BOQ_UNITS.m3.he);
    assert.equal(k.boq[0].scheduledValue, 100000); // 500 * 200
    // BOQ sum: 100000 + 150000 + 400000 + 100000 + 250000 = 1,000,000
    assert.equal(k.boqTotal, 1000000);
  });

  test('defaults retention to DEFAULT_RETENTION_PCT (10)', function () {
    const pb = new ProgressBilling();
    const k = pb.defineContract({
      projectId: 'P-1',
      client: { id: 'C-1' },
      contractor: { id: 'CO-1' },
      totalAmount: 500000,
      boq: [{ item: 'x', unit: 'unit', qty: 1, unitPrice: 500000, section: 's' }],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    assert.equal(k.retention, DEFAULT_RETENTION_PCT);
    assert.equal(k.retention, 10);
  });

  test('rejects empty BOQ', function () {
    const pb = new ProgressBilling();
    assert.throws(function () {
      pb.defineContract({
        projectId: 'P-1',
        client: { id: 'C-1' },
        contractor: { id: 'CO-1' },
        totalAmount: 1000,
        boq: [],
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    }, /boq must be a non-empty array/);
  });

  test('rejects retention outside 0-100', function () {
    const pb = new ProgressBilling();
    assert.throws(function () {
      pb.defineContract({
        projectId: 'P-1',
        client: { id: 'C-1' },
        contractor: { id: 'CO-1' },
        totalAmount: 1000,
        retention: 150,
        boq: [{ item: 'x', unit: 'unit', qty: 1, unitPrice: 1000, section: 's' }],
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    }, /retention must be between 0 and 100/);
  });
});

/* ==========================================================================
 * submitPayment
 * ========================================================================= */
describe('submitPayment', function () {
  test('accepts completedPct and computes completedQty from BOQ qty', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [
        { item: 'L-0001', completedPct: 100 }, // all earthworks
        { item: 'L-0002', completedPct: 50 },  // half the foundations
      ],
      storedMaterials: 20000,
      notes: 'חשבון חלקי 1',
    });
    assert.equal(b.status, 'submitted');
    assert.equal(b.completedToDate['L-0001'].completedQty, 500);
    assert.equal(b.completedToDate['L-0001'].workCompleted, 100000);
    assert.equal(b.completedToDate['L-0002'].completedQty, 50);
    assert.equal(b.completedToDate['L-0002'].workCompleted, 75000);
    assert.equal(b.storedMaterials, 20000);
    assert.equal(b.retentionPct, 10);
  });

  test('rejects completedQty exceeding BOQ qty', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    assert.throws(function () {
      pb.submitPayment({
        contractId: k.id,
        period: '2026-02',
        completedToDate: [{ item: 'L-0001', completedQty: 600 }],
      });
    }, /exceeds BOQ qty/);
  });
});

/* ==========================================================================
 * computeG702 — the 9-line AIA payment certificate
 * ========================================================================= */
describe('computeG702', function () {
  test('single-draw math: 25% complete, no COs, 10% retention', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    // Complete 25% of earthworks + 25% of foundations, no stored
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [
        { item: 'L-0001', completedPct: 25 }, // 0.25 * 500 * 200 = 25,000
        { item: 'L-0002', completedPct: 25 }, // 0.25 * 100 * 1500 = 37,500
      ],
      storedMaterials: 0,
    });
    const g702 = pb.computeG702(k.id, '2026-02');

    // Line 1: original contract sum
    assert.equal(g702.lines.line1_originalContractSum, 1000000);
    // Line 2: no COs
    assert.equal(g702.lines.line2_changeOrderNet, 0);
    // Line 3: 1000000 + 0
    assert.equal(g702.lines.line3_contractSumToDate, 1000000);
    // Line 4a: work completed = 25000 + 37500 = 62500
    assert.equal(g702.lines.line4a_workCompleted, 62500);
    assert.equal(g702.lines.line4b_storedMaterials, 0);
    assert.equal(g702.lines.line4_totalCompletedAndStored, 62500);
    // Line 5: 10% of 62500 = 6250
    assert.equal(g702.lines.line5a_retentionOnWork, 6250);
    assert.equal(g702.lines.line5b_retentionOnStored, 0);
    assert.equal(g702.lines.line5_totalRetention, 6250);
    // Line 6: 62500 - 6250 = 56250
    assert.equal(g702.lines.line6_totalEarnedLessRetention, 56250);
    // Line 7: no previous certificates
    assert.equal(g702.lines.line7_previousCertificates, 0);
    // Line 8: current payment due = 56250
    assert.equal(g702.lines.line8_currentPaymentDue, 56250);
    // Line 9: 1000000 - 56250 = 943750
    assert.equal(g702.lines.line9_balanceToFinish, 943750);
  });

  test('two-draw math: previous certificates subtracted', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    // Draw 1: 25% complete on earthworks
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 25 }],
    });
    // Draw 2: 75% complete cumulative on earthworks (another 50% this period)
    pb.submitPayment({
      contractId: k.id,
      period: '2026-03',
      completedToDate: [{ item: 'L-0001', completedPct: 75 }],
    });
    const g702_2 = pb.computeG702(k.id, '2026-03');
    // Total work to date = 0.75 * 500 * 200 = 75,000
    assert.equal(g702_2.lines.line4a_workCompleted, 75000);
    // Retention = 7,500
    assert.equal(g702_2.lines.line5_totalRetention, 7500);
    // Earned less retention = 67,500
    assert.equal(g702_2.lines.line6_totalEarnedLessRetention, 67500);
    // Previous cert = draw 1 earned less retention
    //   draw 1 work = 25000, retention = 2500, earned less = 22500
    assert.equal(g702_2.lines.line7_previousCertificates, 22500);
    // Current due = 67500 - 22500 = 45000
    assert.equal(g702_2.lines.line8_currentPaymentDue, 45000);
  });

  test('change orders add to contract sum to date', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.changeOrder({
      contractId: k.id,
      description: 'תוספת שער חשמלי',
      description_he: 'תוספת שער חשמלי',
      description_en: 'Electric gate addition',
      amount: 50000,
      approved: true,
    });
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 10 }],
    });
    const g702 = pb.computeG702(k.id, '2026-02');
    assert.equal(g702.lines.line2_changeOrderNet, 50000);
    assert.equal(g702.lines.line3_contractSumToDate, 1050000);
  });

  test('stored materials carry retention too', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 10 }],
      storedMaterials: 100000, // 100k of stored rebar
    });
    const g702 = pb.computeG702(k.id, '2026-02');
    // L-0001: 10% of (500 m3 * 200 ILS/m3 = 100,000) = 10,000 work completed
    // stored = 100000, total = 110,000
    assert.equal(g702.lines.line4a_workCompleted, 10000);
    assert.equal(g702.lines.line4b_storedMaterials, 100000);
    assert.equal(g702.lines.line4_totalCompletedAndStored, 110000);
    // retention: work 1000 + stored 10000 = 11000
    assert.equal(g702.lines.line5a_retentionOnWork, 1000);
    assert.equal(g702.lines.line5b_retentionOnStored, 10000);
    assert.equal(g702.lines.line5_totalRetention, 11000);
    assert.equal(g702.lines.line6_totalEarnedLessRetention, 99000);
  });

  test('Hebrew + English labels are populated', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 25 }],
    });
    const g702 = pb.computeG702(k.id, '2026-02');
    assert.equal(g702.labels_he.line1, 'סכום חוזה מקורי');
    assert.equal(g702.labels_en.line1, 'Original contract sum');
    assert.equal(g702.labels_he.line8, 'לתשלום בחשבון זה');
    assert.equal(g702.labels_en.line8, 'Current payment due');
  });
});

/* ==========================================================================
 * computeG703 — line-item schedule of values
 * ========================================================================= */
describe('computeG703', function () {
  test('row totals equal line-item sum and tie to G702', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [
        { item: 'L-0001', completedPct: 100 }, // 100,000
        { item: 'L-0002', completedPct: 50 },  // 75,000
        { item: 'L-0003', completedPct: 10 },  // 40,000
      ],
      storedMaterials: 25000,
    });
    const g703 = pb.computeG703(k.id, '2026-02');
    assert.equal(g703.rows.length, 5);

    // Sum of colC should equal contract total (pure BOQ case)
    const sumColC = g703.rows.reduce(function (a, r) { return a + r.colC_scheduledValue; }, 0);
    assert.equal(sumColC, 1000000);
    assert.equal(g703.totals.colC_scheduledValue, 1000000);

    // This-period work = 100000 + 75000 + 40000 = 215000
    const sumColE = g703.rows.reduce(function (a, r) { return a + r.colE_thisPeriod; }, 0);
    assert.equal(sumColE, 215000);
    assert.equal(g703.totals.colE_thisPeriod, 215000);

    // Stored materials only in totals (doc-level)
    assert.equal(g703.totals.colF_storedMaterials, 25000);
    assert.equal(g703.totals.colG_totalCompletedAndStored, 240000);

    // % complete = 240000 / 1000000 = 24%
    assert.equal(g703.totals.colH_pctComplete, 24);

    // Retention at totals level = 10% of 240000 = 24000
    assert.equal(g703.totals.colJ_retention, 24000);

    // Cross-check: G702.line4 should match G703.totals.colG
    const g702 = pb.computeG702(k.id, '2026-02');
    assert.equal(g702.lines.line4_totalCompletedAndStored, g703.totals.colG_totalCompletedAndStored);
  });

  test('second draw: col D (from previous) populated correctly', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 40 }], // 0.4 * 100,000 = 40,000
    });
    pb.submitPayment({
      contractId: k.id,
      period: '2026-03',
      completedToDate: [{ item: 'L-0001', completedPct: 80 }], // cumulative 80%
    });
    const g703 = pb.computeG703(k.id, '2026-03');
    const line1 = g703.rows.find(function (r) { return r.lineId === 'L-0001'; });
    assert.equal(line1.colD_fromPrevious, 40000);
    assert.equal(line1.colE_thisPeriod, 40000);
    assert.equal(line1.colG_totalCompletedAndStored, 80000);
    assert.equal(line1.colH_pctComplete, 80);
    assert.equal(line1.colI_balanceToFinish, 20000);
  });

  test('columns are labelled in Hebrew and English', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 10 }],
    });
    const g703 = pb.computeG703(k.id, '2026-02');
    assert.equal(g703.columns_he.C, 'ערך מתוכנן');
    assert.equal(g703.columns_en.G, 'Total Completed & Stored');
    assert.equal(g703.columns_he.J, 'עיכבון');
  });
});

/* ==========================================================================
 * changeOrder
 * ========================================================================= */
describe('changeOrder', function () {
  test('adds amount and shifts endDate by schedule impact days', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const originalEnd = k.endDate; // '2026-12-15'
    const co = pb.changeOrder({
      contractId: k.id,
      description: 'Added upper-level porch',
      amount: 75000,
      scheduleImpactDays: 14,
      approved: true,
    });
    assert.equal(co.amount, 75000);
    assert.equal(co.scheduleImpactDays, 14);
    assert.equal(co.approved, true);

    const updated = pb.contracts.get(k.id);
    assert.notEqual(updated.endDate, originalEnd);
    // '2026-12-15' + 14 days = '2026-12-29'
    assert.equal(updated.endDate, '2026-12-29');
  });

  test('credit change orders (negative amount) allowed', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const co = pb.changeOrder({
      contractId: k.id,
      description: 'Value engineering credit',
      amount: -25000,
      approved: true,
    });
    assert.equal(co.amount, -25000);
  });

  test('approveChangeOrder flips pending → approved', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const co = pb.changeOrder({
      contractId: k.id,
      description: 'Extra waterproofing',
      amount: 12000,
      approved: false,
    });
    assert.equal(co.approved, false);
    pb.approveChangeOrder(k.id, co.id, 'engineer-uzi');
    const list = pb.changeOrders.get(k.id);
    assert.equal(list[0].approved, true);
    assert.equal(list[0].approvedBy, 'engineer-uzi');
  });
});

/* ==========================================================================
 * approveBilling + markBillingPaid
 * ========================================================================= */
describe('approval workflow', function () {
  test('approveBilling transitions submitted → approved', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 50 }],
    });
    pb.approveBilling(b.id, 'arch-levi', 'Inspected and certified');
    const updated = pb.billings.get(b.id);
    assert.equal(updated.status, 'approved');
    assert.equal(updated.approvedBy, 'arch-levi');
    assert.equal(updated.approverNotes, 'Inspected and certified');
  });

  test('markBillingPaid requires approved state', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 50 }],
    });
    assert.throws(function () { pb.markBillingPaid(b.id); }, /only approved/);
    pb.approveBilling(b.id, 'arch-levi');
    pb.markBillingPaid(b.id);
    assert.equal(pb.billings.get(b.id).status, 'paid');
  });
});

/* ==========================================================================
 * retentionRelease
 * ========================================================================= */
describe('retentionRelease', function () {
  test('computes amount as pct of (totalAmount * retention%)', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    // Base retention = 1,000,000 * 10% = 100,000
    const rr = pb.retentionRelease(k.id, {
      pct: 50,
      date: '2026-12-31',
      conditions: ['substantial completion', 'punchlist done'],
    });
    assert.equal(rr.baseRetention, 100000);
    assert.equal(rr.amount, 50000);
    assert.equal(rr.pct, 50);
    assert.equal(rr.cumulativePct, 50);
  });

  test('rejects cumulative release > 100%', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    pb.retentionRelease(k.id, { pct: 50, date: '2026-12-31' });
    pb.retentionRelease(k.id, { pct: 50, date: '2027-06-30' }); // cumulative 100%
    assert.throws(function () {
      pb.retentionRelease(k.id, { pct: 10, date: '2027-07-01' });
    }, /cumulative retention release would exceed 100%/);
  });

  test('final release at 100% is labelled "final"', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const rr = pb.retentionRelease(k.id, { pct: 100, date: '2027-01-15' });
    assert.equal(rr.label_en, 'Final retention release');
    assert.equal(rr.label_he, 'שחרור סופי של ערבות ביצוע');
  });
});

/* ==========================================================================
 * lienWaiver
 * ========================================================================= */
describe('lienWaiver', function () {
  test('unconditional waiver is effective immediately', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 100 }],
    });
    const w = pb.lienWaiver(b.id, 'unconditional');
    assert.equal(w.type, 'unconditional');
    assert.equal(w.effective, true);
    assert.equal(w.pendingPayment, false);
    assert.equal(w.coveredAmount, 100000);
    assert.equal(w.type_he, LIEN_WAIVER_TYPES.unconditional.he);
  });

  test('conditional waiver pending payment', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0002', completedPct: 100 }],
      storedMaterials: 10000,
    });
    const w = pb.lienWaiver(b.id, 'conditional');
    assert.equal(w.effective, false);
    assert.equal(w.pendingPayment, true);
    // coveredAmount = work (150000) + stored (10000) = 160000
    assert.equal(w.coveredAmount, 160000);
  });

  test('all four types supported with Hebrew labels', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 10 }],
    });
    const types = ['conditional', 'unconditional', 'partial', 'final'];
    for (let i = 0; i < types.length; i++) {
      const w = pb.lienWaiver(b.id, types[i]);
      assert.equal(w.type, types[i]);
      assert.equal(w.legalBasis_he.indexOf('חוק חוזה קבלנות') >= 0, true);
    }
    assert.equal((pb.lienWaivers.get(b.id) || []).length, 4);
  });

  test('rejects invalid lien waiver type', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 10 }],
    });
    assert.throws(function () {
      pb.lienWaiver(b.id, 'bogus-type');
    }, /invalid lien waiver type/);
  });
});

/* ==========================================================================
 * subcontractorPayments (pay-when-paid)
 * ========================================================================= */
describe('subcontractorPayments', function () {
  test('waiting until parent billing is paid', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0005', completedPct: 20 }],
    });
    pb.subcontractorPayments(k.id, {
      billingId: b.id,
      sub: { id: 'SUB-ELEC-001', name_he: 'חשמלאי ברק' },
      amount: 40000,
      scope: 'Electrical rough-in',
    });
    const view1 = pb.subcontractorPayments(k.id);
    assert.equal(view1.draws.length, 1);
    assert.equal(view1.waiting.length, 1);
    assert.equal(view1.eligible.length, 0);
    assert.equal(view1.waitingTotal, 40000);

    // Approve + pay the parent billing
    pb.approveBilling(b.id, 'engineer-uzi');
    pb.markBillingPaid(b.id);
    const view2 = pb.subcontractorPayments(k.id);
    assert.equal(view2.waiting.length, 0);
    assert.equal(view2.eligible.length, 1);
    assert.equal(view2.eligibleTotal, 40000);
  });

  test('multiple subs on same billing tracked independently', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0005', completedPct: 50 }],
    });
    pb.subcontractorPayments(k.id, {
      billingId: b.id, sub: { id: 'SUB-A' }, amount: 20000, scope: 'A',
    });
    pb.subcontractorPayments(k.id, {
      billingId: b.id, sub: { id: 'SUB-B' }, amount: 15000, scope: 'B',
    });
    const view = pb.subcontractorPayments(k.id);
    assert.equal(view.draws.length, 2);
    assert.equal(view.waitingTotal, 35000);
  });
});

/* ==========================================================================
 * Append-only invariant
 * ========================================================================= */
describe('append-only audit log', function () {
  test('every mutation leaves an audit entry', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const b = pb.submitPayment({
      contractId: k.id,
      period: '2026-02',
      completedToDate: [{ item: 'L-0001', completedPct: 25 }],
    });
    pb.changeOrder({ contractId: k.id, description: 'co1', amount: 1000, approved: true });
    pb.approveBilling(b.id, 'arch-levi');
    pb.markBillingPaid(b.id);
    pb.retentionRelease(k.id, { pct: 10, date: '2026-06-01' });
    pb.lienWaiver(b.id, 'partial');

    const actions = pb.auditLog.map(function (e) { return e.action; });
    assert.equal(actions.indexOf('defineContract') >= 0, true);
    assert.equal(actions.indexOf('submitPayment') >= 0, true);
    assert.equal(actions.indexOf('changeOrder') >= 0, true);
    assert.equal(actions.indexOf('approveBilling') >= 0, true);
    assert.equal(actions.indexOf('markBillingPaid') >= 0, true);
    assert.equal(actions.indexOf('retentionRelease') >= 0, true);
    assert.equal(actions.indexOf('lienWaiver') >= 0, true);
  });

  test('re-define contract pushes old shape to history', function () {
    const pb = new ProgressBilling();
    const k = seedContract(pb);
    const cid = k.id;
    // Re-define same ID with bigger total
    const updated = pb.defineContract({
      contractId: cid,
      projectId: k.projectId,
      client: k.client,
      contractor: k.contractor,
      totalAmount: 1200000,
      boq: [{ item: 'new scope', unit: 'lump', qty: 1, unitPrice: 1200000, section: 'all' }],
      startDate: k.startDate,
      endDate: k.endDate,
    });
    assert.equal(updated.id, cid);
    assert.equal(updated.totalAmount, 1200000);
    assert.equal(updated.history.length, 1);
    assert.equal(updated.history[0].totalAmount, 1000000);
  });
});
