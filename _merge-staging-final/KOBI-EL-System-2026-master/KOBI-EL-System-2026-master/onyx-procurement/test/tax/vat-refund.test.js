/**
 * Unit tests for src/tax/vat-refund.js
 * Run with: node --test test/tax/vat-refund.test.js
 *
 * Covers:
 *   - Eligibility: exporter fast-track vs routine vs rejection
 *   - Claim generation: happy path, no-refund path, validation
 *   - Supporting-docs checklist building (mandatory/optional, exporter cert)
 *   - Interest computation on delayed refund (exact + pro-rata)
 *   - Submission letter (text + HTML)
 *   - Status store + lifecycle transitions
 *   - Small-claim 30-day fast path (§39(a2))
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../../src/tax/vat-refund.js');
const {
  generateRefundClaim,
  checkExporterEligibility,
  generateSubmissionLetter,
  trackRefundStatus,
  computeRefundInterest,
  createStore,
  REFUND_STATUSES,
  STATUTORY_DAYS,
  SMALL_CLAIM_CEILING,
  REQUIRED_DOCS,
  EXPORTER_THRESHOLDS,
  _internals,
} = mod;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function addDaysISO(base, days) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// Exports surface
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: module surface', () => {
  test('exports required symbols', () => {
    assert.equal(typeof generateRefundClaim, 'function');
    assert.equal(typeof checkExporterEligibility, 'function');
    assert.equal(typeof generateSubmissionLetter, 'function');
    assert.equal(typeof trackRefundStatus, 'function');
    assert.equal(typeof computeRefundInterest, 'function');
    assert.equal(typeof createStore, 'function');
    assert.ok(REFUND_STATUSES && REFUND_STATUSES.SUBMITTED === 'submitted');
    assert.ok(Array.isArray(REQUIRED_DOCS));
    assert.ok(STATUTORY_DAYS.EXPORTER_FAST === 30);
    assert.ok(STATUTORY_DAYS.ROUTINE === 90);
  });

  test('REQUIRED_DOCS contains the four mandatory items', () => {
    const codes = REQUIRED_DOCS.map(d => d.code);
    for (const c of ['PCN836', 'INVOICE_LIST', 'BANK_CONFIRM', 'VAT_RETURN']) {
      assert.ok(codes.includes(c), `missing mandatory doc: ${c}`);
    }
    assert.ok(codes.includes('EXPORT_CERT'));
  });
});

// ═══════════════════════════════════════════════════════════════
// checkExporterEligibility
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: checkExporterEligibility', () => {
  test('fast-track — exporter meets every threshold', () => {
    const res = checkExporterEligibility({
      export_turnover_12m:  6_000_000,
      total_turnover_12m:   10_000_000,
      open_vat_debt_months: 0,
      books_in_order:       true,
      registered:           true,
    });
    assert.equal(res.eligible, true);
    assert.equal(res.fastTrack, true);
    assert.equal(res.statutoryDays, STATUTORY_DAYS.EXPORTER_FAST);
    assert.equal(res.reasons.length, 0);
    assert.equal(res.metrics.exportShare, 0.6);
  });

  test('routine exporter — eligible but below turnover threshold', () => {
    const res = checkExporterEligibility({
      export_turnover_12m:  1_500_000,
      total_turnover_12m:   5_000_000,
      open_vat_debt_months: 0,
      books_in_order:       true,
      registered:           true,
    });
    assert.equal(res.eligible, true);
    assert.equal(res.fastTrack, false);
    assert.equal(res.statutoryDays, STATUTORY_DAYS.EXPORTER_ROUTINE);
  });

  test('rejection — export share below 20%', () => {
    const res = checkExporterEligibility({
      export_turnover_12m: 100_000,
      total_turnover_12m:  10_000_000,
      books_in_order:      true,
      registered:          true,
    });
    assert.equal(res.eligible, false);
    assert.equal(res.fastTrack, false);
    assert.equal(res.statutoryDays, STATUTORY_DAYS.ROUTINE);
    assert.ok(res.reasons.some(r => /יצוא/.test(r)));
  });

  test('rejection — open VAT debt disqualifies', () => {
    const res = checkExporterEligibility({
      export_turnover_12m:  8_000_000,
      total_turnover_12m:   10_000_000,
      open_vat_debt_months: 2,
      books_in_order:       true,
      registered:           true,
    });
    assert.equal(res.eligible, false);
    assert.ok(res.reasons.some(r => /חוב/.test(r)));
  });

  test('rejection — books not in order disqualifies', () => {
    const res = checkExporterEligibility({
      export_turnover_12m:  5_000_000,
      total_turnover_12m:   10_000_000,
      books_in_order:       false,
      registered:           true,
    });
    assert.equal(res.eligible, false);
    assert.ok(res.reasons.some(r => /ספרים/.test(r)));
  });
});

// ═══════════════════════════════════════════════════════════════
// generateRefundClaim — happy path + validation
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: generateRefundClaim', () => {
  test('happy path — routine 90-day refund', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  50_000,
      outputVat: 20_000,
      dealerName: 'טכנו-קול עוזי בע"מ',
      dealerVatFile: '513456789',
      submittedAt: new Date('2026-04-05T00:00:00Z'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.claim.refund_amount, 30_000);
    assert.equal(res.claim.status, REFUND_STATUSES.DRAFT);
    // 30k > 18,880 small-claim ceiling, non-exporter → 90 days
    assert.equal(res.claim.statutory_days, STATUTORY_DAYS.ROUTINE);
    assert.equal(res.claim.deadline, addDaysISO('2026-04-05', 90));
    assert.equal(res.claim.exporter, false);
    assert.ok(res.claim.claim_id.startsWith('VR-'));
  });

  test('exporter fast-track — 30-day deadline', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  500_000,
      outputVat: 10_000,
      exporterStatus: {
        export_turnover_12m:  8_000_000,
        total_turnover_12m:  10_000_000,
        books_in_order:       true,
        registered:           true,
      },
      submittedAt: new Date('2026-04-05T00:00:00Z'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.claim.refund_amount, 490_000);
    assert.equal(res.claim.exporter, true);
    assert.equal(res.claim.fast_track, true);
    assert.equal(res.claim.statutory_days, STATUTORY_DAYS.EXPORTER_FAST);
    assert.equal(res.claim.deadline, addDaysISO('2026-04-05', 30));
  });

  test('small-claim fast path — non-exporter, refund ≤ ₪18,880 → 30 days', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  15_000,
      outputVat:  2_000,
      submittedAt: new Date('2026-04-05T00:00:00Z'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.claim.refund_amount, 13_000);
    assert.ok(res.claim.refund_amount <= SMALL_CLAIM_CEILING);
    assert.equal(res.claim.statutory_days, STATUTORY_DAYS.SMALL_CLAIM);
  });

  test('no refund — input ≤ output returns ok:false', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  10_000,
      outputVat: 20_000,
    });
    assert.equal(res.ok, false);
    assert.equal(res.refund_amount, 0);
    assert.match(res.error, /אין החזר/);
    assert.match(res.error_en, /No refund/);
  });

  test('validation — negative numbers throw with errors array', () => {
    assert.throws(
      () => generateRefundClaim({ period: '2026-03', inputVat: -5, outputVat: 1 }),
      err => {
        assert.ok(err instanceof Error);
        assert.ok(Array.isArray(err.errors));
        assert.ok(err.errors.some(e => /inputVat/.test(e)));
        return true;
      }
    );
  });

  test('supporting invoices — summary + pcn836 reference attached', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  6000,
      outputVat:   0,
      pcn836Ref: 'files/pcn836-202603.txt#sha256:abcdef',
      supportingInvoices: [
        { invoice_no: 'A-001', amount: 10_000, vat: 1700 },
        { invoice_no: 'A-002', amount: 15_000, vat: 2550 },
        { invoice_no: 'A-003', amount: 10_000, vat: 1700, is_export: true },
      ],
    });
    assert.equal(res.ok, true);
    assert.equal(res.claim.invoice_summary.count, 3);
    assert.equal(res.claim.invoice_summary.export_count, 1);
    assert.equal(res.claim.invoice_summary.total_amount, 35_000);
    assert.equal(res.claim.pcn836_ref, 'files/pcn836-202603.txt#sha256:abcdef');
    // PCN836 should be auto-attached when ref supplied.
    const pcn = res.required_docs.find(d => d.code === 'PCN836');
    assert.equal(pcn.attached, true);
  });

  test('export certificate becomes mandatory when exporterStatus eligible', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  100_000,
      outputVat: 10_000,
      exporterStatus: {
        export_turnover_12m:  5_000_000,
        total_turnover_12m:   10_000_000,
        books_in_order:       true,
        registered:           true,
      },
    });
    const cert = res.required_docs.find(d => d.code === 'EXPORT_CERT');
    assert.equal(cert.mandatory, true);
    assert.ok(res.missing_docs.includes('EXPORT_CERT'));
  });

  test('missing_docs checklist excludes optional doc when no exporter', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  100_000,
      outputVat: 50_000,
    });
    assert.ok(!res.missing_docs.includes('EXPORT_CERT'));
    assert.ok(res.missing_docs.includes('PCN836'));
    assert.ok(res.missing_docs.includes('INVOICE_LIST'));
    assert.ok(res.missing_docs.includes('BANK_CONFIRM'));
    assert.ok(res.missing_docs.includes('VAT_RETURN'));
  });

  test('summary strings are bilingual and include period + amount', () => {
    const res = generateRefundClaim({
      period:    '2026-02',
      inputVat:  40_000,
      outputVat: 10_000,
    });
    assert.match(res.claim.summary_he, /בקשת החזר מע"מ/);
    assert.match(res.claim.summary_he, /2026-02/);
    assert.match(res.claim.summary_en, /VAT refund claim/);
    assert.match(res.claim.summary_en, /2026-02/);
  });
});

// ═══════════════════════════════════════════════════════════════
// computeRefundInterest
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: computeRefundInterest', () => {
  test('paid on time → zero interest', () => {
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  50_000,
      outputVat: 10_000,
      submittedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const interest = computeRefundInterest(res.claim, '2026-06-30');
    assert.equal(interest.days_delayed, 0);
    assert.equal(interest.interest_amount, 0);
    assert.equal(interest.within_statute, true);
    assert.match(interest.label_he, /אין ריבית/);
    assert.match(interest.label_en, /on time/);
  });

  test('delayed refund — pro-rata annual 4%', () => {
    // Refund 100k, deadline 2026-07-01, paid 2026-10-29 → 120 days delay
    const claim = {
      claim_id: 'VR-DELAY-1',
      refund_amount: 100_000,
      submitted_at: '2026-04-02',
      statutory_days: STATUTORY_DAYS.ROUTINE,
      deadline: '2026-07-01',
    };
    const paid = '2026-10-29'; // exactly 120 days after 2026-07-01
    const interest = computeRefundInterest(claim, paid);

    assert.equal(interest.days_delayed, 120);
    const expected = Math.round(100_000 * 0.04 * (120 / 365) * 100) / 100;
    assert.equal(interest.interest_amount, expected);
    assert.equal(interest.total_due, Math.round((100_000 + expected) * 100) / 100);
    assert.equal(interest.applies_from, '2026-07-02');
    assert.equal(interest.within_statute, false);
    assert.match(interest.label_he, /איחור/);
    assert.match(interest.label_en, /120 days late/);
  });

  test('computes against explicit custom annualRate option', () => {
    const claim = {
      claim_id: 'VR-1',
      refund_amount: 50_000,
      deadline: '2026-01-01',
    };
    const interest = computeRefundInterest(claim, '2026-07-01', { annualRate: 0.06 });
    assert.ok(interest.days_delayed > 0);
    assert.equal(interest.annual_rate, 0.06);
    assert.ok(interest.interest_amount > 0);
  });

  test('rejects claim without refund_amount', () => {
    assert.throws(() => computeRefundInterest({}, '2026-01-01'), /refund_amount/);
  });
});

// ═══════════════════════════════════════════════════════════════
// generateSubmissionLetter
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: generateSubmissionLetter', () => {
  test('produces bilingual text + HTML with claim details', () => {
    const res = generateRefundClaim({
      period:         '2026-03',
      inputVat:       42_000.55,
      outputVat:      12_000.10,
      dealerName:     'טכנו-קול עוזי בע"מ',
      dealerVatFile:  '513456789',
    });
    const letter = generateSubmissionLetter(res.claim);
    assert.equal(typeof letter.text, 'string');
    assert.equal(typeof letter.html, 'string');
    // Hebrew block
    assert.match(letter.text, /בקשת החזר מע"מ/);
    assert.match(letter.text, /סעיף 39/);
    assert.match(letter.text, /טכנו-קול עוזי/);
    assert.match(letter.text, /513456789/);
    // English block
    assert.match(letter.text, /VAT Refund Claim/);
    assert.match(letter.text, /§39/);
    assert.match(letter.text, /513456789/);
    // HTML dir=rtl + contains amount
    assert.match(letter.html, /dir="rtl"/);
    assert.match(letter.html, /30,000\.45/);
  });

  test('throws if claim is missing claim_id', () => {
    assert.throws(() => generateSubmissionLetter({}), /claim_id/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Store + trackRefundStatus
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: store + trackRefundStatus', () => {
  test('lifecycle draft → submitted → under_review → approved → paid', () => {
    const store = createStore();
    const res = generateRefundClaim({
      period:    '2026-03',
      inputVat:  100_000,
      outputVat: 10_000,
    });
    store.save(res.claim);

    const t0 = trackRefundStatus(res.claim.claim_id, store);
    assert.equal(t0.found, true);
    assert.equal(t0.status, 'draft');
    assert.match(t0.nextAction, /submit/);

    store.transition(res.claim.claim_id, REFUND_STATUSES.SUBMITTED, 'hand-delivered');
    store.transition(res.claim.claim_id, REFUND_STATUSES.UNDER_REVIEW);
    store.transition(res.claim.claim_id, REFUND_STATUSES.APPROVED);
    store.transition(res.claim.claim_id, REFUND_STATUSES.PAID);

    const t1 = trackRefundStatus(res.claim.claim_id, store);
    assert.equal(t1.status, 'paid');
    assert.equal(t1.status_label_he, 'שולם');
    // Initial 'draft' event + 4 transitions = 5 history entries
    assert.equal(t1.history.length, 5);
  });

  test('missing claim returns found:false', () => {
    const out = trackRefundStatus('NOPE', createStore());
    assert.equal(out.found, false);
    assert.equal(out.claim_id, 'NOPE');
  });

  test('rejected path surfaces an objection next action', () => {
    const store = createStore();
    const r = generateRefundClaim({ period: '2026-03', inputVat: 50_000, outputVat: 10_000 });
    store.save(r.claim);
    store.transition(r.claim.claim_id, REFUND_STATUSES.REJECTED, 'lack of docs');
    const t = trackRefundStatus(r.claim.claim_id, store);
    assert.equal(t.status, 'rejected');
    assert.match(t.nextAction, /objection|השגה/);
  });

  test('overdue claim shows negative days_remaining + interest cue', () => {
    const store = createStore();
    // Build a claim whose deadline is clearly in the past relative to "today".
    // Deadline computed from submitted_at + statutory_days, so pick an old submission.
    const r = generateRefundClaim({
      period:    '2025-10',
      inputVat:  80_000,
      outputVat: 10_000,
      submittedAt: new Date('2025-10-01T00:00:00Z'),
    });
    store.save(r.claim);
    store.transition(r.claim.claim_id, REFUND_STATUSES.UNDER_REVIEW);
    const t = trackRefundStatus(r.claim.claim_id, store);
    assert.equal(t.overdue, true);
    assert.ok(t.days_remaining < 0);
    assert.match(t.nextAction, /interest|ריבית/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Internals sanity
// ═══════════════════════════════════════════════════════════════

describe('vat-refund: internals', () => {
  test('normalisePeriod accepts string + date', () => {
    assert.equal(_internals.normalisePeriod('2026-03'), '2026-03');
    assert.equal(_internals.normalisePeriod('2026-03-15'), '2026-03');
    assert.equal(
      _internals.normalisePeriod(new Date(Date.UTC(2026, 0, 1))),
      '2026-01'
    );
  });

  test('round2 rounds to two decimal places', () => {
    // Note: 1.005 is stored as 1.00499... so Math.round yields 1.00, not 1.01.
    // Use unambiguous inputs.
    assert.equal(_internals.round2(1.006), 1.01);
    assert.equal(_internals.round2(1.004), 1.0);
    assert.equal(_internals.round2(12.3456), 12.35);
  });

  test('daysBetween + addDays consistent (addDays must not mutate)', () => {
    const a = new Date('2026-01-01T00:00:00Z');
    const aBefore = a.getTime();
    const b = _internals.addDays(new Date(a), 30);
    assert.equal(a.getTime(), aBefore, 'addDays should not mutate its input clone');
    assert.equal(_internals.daysBetween(a, b), 30);
  });
});
