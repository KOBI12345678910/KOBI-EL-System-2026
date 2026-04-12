/**
 * AG-Y081 — Unit tests for the Bank Signatory & Authorization Workflow
 *
 * Covers:
 *   - defineSignatoryMatrix (+ version history on redefine)
 *   - requestAuthorization (default matrix + override)
 *   - routeForApproval (tiered matrix routing)
 *   - signRequest (integrity hash, role gating)
 *   - verifySignatures (complete / incomplete / must-include)
 *   - segregationOfDuties (initiator cannot approve)
 *   - dualControl (2-person-present enforcement)
 *   - complianceCheck (OFAC + AML)
 *   - expiredRequests (timeout handling)
 *   - auditTrail (who/when/what integrity)
 *   - notifyApprovers (bilingual)
 *
 * Run with:  node --test test/finance/signatory-workflow.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  SignatoryWorkflow,
  TRANSACTION_TYPES,
  SIGNER_ROLES,
  SIGNATURE_METHODS,
  REQUEST_STATUS,
  DEFAULT_MATRIX_RULES,
  OFAC_BLOCKLIST,
} = require('../../src/finance/signatory-workflow');

/* --------------------------------------------------------------------
 * Test helpers
 * ------------------------------------------------------------------ */

function freshWorkflow(clockStart) {
  let tick = clockStart || Date.UTC(2026, 3, 11, 9, 0, 0);
  return {
    wf: new SignatoryWorkflow({
      clock: () => tick,
      defaultTimeoutHours: 48,
    }),
    advance: (ms) => { tick += ms; },
    now: () => tick,
  };
}

const ALICE = { id: 'U-ALICE',   name: 'Alice Levy',   role: 'clerk' };
const BOB   = { id: 'U-BOB',     name: 'Bob Cohen',    role: 'finance_manager' };
const CAROL = { id: 'U-CAROL',   name: 'Carol Mizrahi',role: 'controller' };
const DAN   = { id: 'U-DAN',     name: 'Dan Peretz',   role: 'cfo' };
const EVA   = { id: 'U-EVA',     name: 'Eva Bar',      role: 'ceo' };

function baseRequestPayload(overrides) {
  return Object.assign(
    {
      transactionType: 'wire',
      amount: 25_000,
      currency: 'ILS',
      beneficiary: {
        name: 'Spot Welders Ltd',
        account: '123-456-7890',
        bank:    'Hapoalim',
        country: 'IL',
      },
      purpose: 'May invoice settlement',
    },
    overrides || {}
  );
}

/* --------------------------------------------------------------------
 * 1. defineSignatoryMatrix
 * ------------------------------------------------------------------ */
describe('defineSignatoryMatrix', () => {
  test('accepts a valid 3-tier matrix and normalizes ranges', () => {
    const { wf } = freshWorkflow();
    const m = wf.defineSignatoryMatrix({
      accountId: 'ACC-001',
      rules: [
        {
          amountRange: { min: 0, max: 50_000 },
          signersRequired: 1,
          signerRoles: ['finance_manager', 'controller'],
          timeWindow: { hours: 48 },
        },
        {
          amountRange: { min: 50_000, max: 500_000 },
          signersRequired: 2,
          signerRoles: ['finance_manager', 'cfo'],
          mustInclude: ['finance_manager'],
          timeWindow: { hours: 48 },
        },
        {
          amountRange: { min: 500_000, max: null },
          signersRequired: 2,
          signerRoles: ['cfo', 'ceo'],
          mustInclude: ['cfo'],
          dualControl: true,
          timeWindow: { hours: 24 },
        },
      ],
    });
    assert.equal(m.version, 1);
    assert.equal(m.rules.length, 3);
    assert.equal(m.rules[0].amountRange.min, 0);
    assert.equal(m.rules[2].amountRange.max, Number.POSITIVE_INFINITY);
    assert.equal(m.rules[2].dualControl, true);
  });

  test('rejects unknown roles', () => {
    const { wf } = freshWorkflow();
    assert.throws(() =>
      wf.defineSignatoryMatrix({
        accountId: 'ACC-002',
        rules: [
          {
            amountRange: { min: 0, max: 1000 },
            signersRequired: 1,
            signerRoles: ['janitor'],
          },
        ],
      })
    );
  });

  test('rejects min >= max', () => {
    const { wf } = freshWorkflow();
    assert.throws(() =>
      wf.defineSignatoryMatrix({
        accountId: 'ACC-003',
        rules: [
          {
            amountRange: { min: 1000, max: 500 },
            signersRequired: 1,
            signerRoles: ['finance_manager'],
          },
        ],
      })
    );
  });

  test('re-defining preserves history (never-delete)', () => {
    const { wf } = freshWorkflow();
    wf.defineSignatoryMatrix({
      accountId: 'ACC-004',
      rules: [
        {
          amountRange: { min: 0, max: 10_000 },
          signersRequired: 1,
          signerRoles: ['finance_manager'],
        },
      ],
    });
    const v2 = wf.defineSignatoryMatrix({
      accountId: 'ACC-004',
      rules: [
        {
          amountRange: { min: 0, max: 20_000 },
          signersRequired: 1,
          signerRoles: ['finance_manager'],
        },
      ],
    });
    assert.equal(v2.version, 2);
    assert.equal(v2.history.length, 1);
    assert.equal(v2.history[0].version, 1);
    assert.equal(v2.history[0].rules[0].amountRange.max, 10_000);
  });
});

/* --------------------------------------------------------------------
 * 2. routeForApproval — matrix routing
 * ------------------------------------------------------------------ */
describe('routeForApproval (tiered matrix routing)', () => {
  test('tier 0: ≤50k → 1 signer', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      BOB
    );
    assert.equal(req.routing.tierIndex, 0);
    assert.equal(req.routing.signersRequired, 1);
  });

  test('tier 1: 50k–500k → 2 signers incl. finance_manager', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 120_000 }),
      CAROL
    );
    assert.equal(req.routing.tierIndex, 1);
    assert.equal(req.routing.signersRequired, 2);
    assert.ok(req.routing.mustInclude.includes('finance_manager'));
  });

  test('tier 2: >500k → 2 signers incl. CFO + dual control', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 750_000 }),
      CAROL
    );
    assert.equal(req.routing.tierIndex, 2);
    assert.equal(req.routing.signersRequired, 2);
    assert.ok(req.routing.mustInclude.includes('cfo'));
    assert.equal(req.routing.dualControl, true);
  });

  test('explicit matrix overrides the default', () => {
    const { wf } = freshWorkflow();
    wf.defineSignatoryMatrix({
      accountId: 'ACC-MAIN',
      rules: [
        {
          amountRange: { min: 0, max: 1_000_000 },
          signersRequired: 1,
          signerRoles: ['finance_manager'],
        },
      ],
    });
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 300_000, accountId: 'ACC-MAIN' }),
      CAROL
    );
    assert.equal(req.routing.signersRequired, 1);
    assert.equal(req.routing.matrixVersion, 1);
  });
});

/* --------------------------------------------------------------------
 * 3. segregationOfDuties
 * ------------------------------------------------------------------ */
describe('segregationOfDuties (SoD)', () => {
  test('initiator cannot sign their own request', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 10_000 }),
      BOB
    );
    assert.throws(
      () => wf.signRequest(req.id, BOB, 'digital'),
      /SoD violation/
    );
  });

  test('a different finance_manager can sign', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 10_000 }),
      CAROL // controller initiates
    );
    const signed = wf.signRequest(req.id, BOB, 'digital');
    assert.equal(signed.status, REQUEST_STATUS.approved);
    assert.equal(signed.signatures.length, 1);
  });

  test('direct SoD audit of a populated request catches initiator in signers', () => {
    const { wf } = freshWorkflow();
    const sod = wf.segregationOfDuties({
      initiator: BOB,
      signatures: [{ signerId: BOB.id, role: 'finance_manager' }],
    });
    assert.equal(sod.ok, false);
    assert.equal(sod.reason, 'initiator_is_in_signers');
  });
});

/* --------------------------------------------------------------------
 * 4. signRequest + verifySignatures (integrity hash)
 * ------------------------------------------------------------------ */
describe('signRequest + verifySignatures', () => {
  test('single-signer tier: 1 signature → approved', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    const after = wf.signRequest(req.id, BOB, 'digital');
    assert.equal(after.status, REQUEST_STATUS.approved);
    const v = wf.verifySignatures(req.id);
    assert.equal(v.complete, true);
    assert.equal(v.integrityOk, true);
  });

  test('two-signer tier: 1 of 2 → partially_signed, 2 of 2 → approved', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 120_000 }),
      CAROL
    );
    wf.signRequest(req.id, BOB, 'digital'); // finance_manager
    let v = wf.verifySignatures(req.id);
    assert.equal(v.complete, false);
    assert.equal(v.presentSignerCount, 1);

    // Second signer — another qualifying role
    wf.signRequest(req.id, DAN, '2fa'); // cfo
    v = wf.verifySignatures(req.id);
    assert.equal(v.complete, true);
    assert.equal(v.presentSignerCount, 2);
    assert.ok(v.presentRoles.includes('finance_manager'));
    assert.ok(v.presentRoles.includes('cfo'));
  });

  test('mustInclude enforcement: tier 1 without finance_manager is incomplete', () => {
    const { wf } = freshWorkflow();
    wf.defineSignatoryMatrix({
      accountId: 'ACC-MI',
      rules: [
        {
          amountRange: { min: 0, max: 500_000 },
          signersRequired: 2,
          signerRoles: ['finance_manager', 'cfo', 'ceo'],
          mustInclude: ['finance_manager'],
        },
      ],
    });
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 200_000, accountId: 'ACC-MI' }),
      CAROL
    );
    wf.signRequest(req.id, DAN, 'digital'); // cfo
    wf.signRequest(req.id, EVA, 'digital'); // ceo
    const v = wf.verifySignatures(req.id);
    assert.equal(v.complete, false);
    assert.deepEqual(v.missingMustInclude, ['finance_manager']);
  });

  test('disallowed role is rejected', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    assert.throws(
      () => wf.signRequest(req.id, EVA, 'digital'), // ceo not in tier 0 roles
      /not permitted/
    );
  });

  test('duplicate signer blocked', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 120_000 }),
      CAROL
    );
    wf.signRequest(req.id, BOB, 'digital');
    assert.throws(() => wf.signRequest(req.id, BOB, '2fa'), /already signed/);
  });

  test('integrity hash detects tampering of amount after signing', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    wf.signRequest(req.id, BOB, 'digital');
    // Tamper
    const internal = wf.requests.get(req.id);
    internal.amount = 99_999;
    const v = wf.verifySignatures(req.id);
    assert.equal(v.integrityOk, false);
    assert.equal(v.complete, false);
  });
});

/* --------------------------------------------------------------------
 * 5. dualControl
 * ------------------------------------------------------------------ */
describe('dualControl enforcement', () => {
  test('high-value wire triggers dual control', () => {
    const { wf } = freshWorkflow();
    const dc = wf.dualControl(
      baseRequestPayload({ amount: 600_000, transactionType: 'wire' })
    );
    assert.equal(dc.required, true);
    assert.match(dc.reason_he, /דואל|קונטרול|נוכחות/);
  });

  test('small wire does NOT trigger dual control', () => {
    const { wf } = freshWorkflow();
    const dc = wf.dualControl(
      baseRequestPayload({ amount: 25_000, transactionType: 'wire' })
    );
    assert.equal(dc.required, false);
  });

  test('dual-control request is NOT complete when signers are far apart', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 750_000 }),
      CAROL
    );
    h.wf.signRequest(req.id, DAN, 'digital'); // cfo
    h.advance(60 * 60 * 1000); // +1h
    h.wf.signRequest(req.id, EVA, 'digital'); // ceo
    const v = h.wf.verifySignatures(req.id);
    assert.equal(v.dualControlRequired, true);
    assert.equal(v.dualControlSatisfied, false);
    assert.equal(v.complete, false);
  });

  test('dual-control satisfied when both sign within 15 min', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 750_000 }),
      CAROL
    );
    h.wf.signRequest(req.id, DAN, 'digital'); // cfo
    h.advance(5 * 60 * 1000); // +5 min
    h.wf.signRequest(req.id, EVA, 'digital'); // ceo
    const v = h.wf.verifySignatures(req.id);
    assert.equal(v.dualControlSatisfied, true);
    assert.equal(v.complete, true);
  });

  test('dual-control satisfied when both use physical (wet-ink) method', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 750_000 }),
      CAROL
    );
    h.wf.signRequest(req.id, DAN, 'physical');
    h.advance(2 * 60 * 60 * 1000); // +2 h
    h.wf.signRequest(req.id, EVA, 'physical');
    const v = h.wf.verifySignatures(req.id);
    assert.equal(v.dualControlSatisfied, true);
  });
});

/* --------------------------------------------------------------------
 * 6. expiredRequests
 * ------------------------------------------------------------------ */
describe('expiredRequests (timeout handling)', () => {
  test('request expires after the 48h window', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    h.advance(49 * 3600 * 1000);
    const sweep = h.wf.expiredRequests();
    assert.equal(sweep.count, 1);
    assert.equal(sweep.requests[0].id, req.id);
    assert.equal(sweep.requests[0].status, REQUEST_STATUS.expired);
  });

  test('approved request is never swept as expired', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    h.wf.signRequest(req.id, BOB, 'digital');
    h.advance(60 * 3600 * 1000);
    const sweep = h.wf.expiredRequests();
    assert.equal(sweep.count, 0);
    const internal = h.wf.requests.get(req.id);
    assert.equal(internal.status, REQUEST_STATUS.approved);
  });

  test('signing past the deadline throws and marks expired', () => {
    const h = freshWorkflow();
    const req = h.wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    h.advance(72 * 3600 * 1000);
    assert.throws(() => h.wf.signRequest(req.id, BOB, 'digital'), /expired/);
    const internal = h.wf.requests.get(req.id);
    assert.equal(internal.status, REQUEST_STATUS.expired);
  });
});

/* --------------------------------------------------------------------
 * 7. complianceCheck
 * ------------------------------------------------------------------ */
describe('complianceCheck', () => {
  test('clear when below AML threshold and no sanctions hit', () => {
    const { wf } = freshWorkflow();
    const c = wf.complianceCheck(
      baseRequestPayload({ amount: 10_000 })
    );
    assert.equal(c.status, 'clear');
    assert.equal(c.hits.length, 0);
  });

  test('review when above AML threshold', () => {
    const { wf } = freshWorkflow();
    const c = wf.complianceCheck(
      baseRequestPayload({ amount: 60_000 })
    );
    assert.equal(c.status, 'review');
    assert.ok(c.hits.some((h) => h.type === 'aml_threshold'));
  });

  test('high-value gate fires above 500k', () => {
    const { wf } = freshWorkflow();
    const c = wf.complianceCheck(
      baseRequestPayload({ amount: 600_000 })
    );
    assert.equal(c.status, 'review');
    assert.ok(c.hits.some((h) => h.type === 'high_value_gate'));
  });

  test('OFAC hit blocks the request', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({
        amount: 5_000,
        beneficiary: {
          name: 'OFAC-BLOCKED-DEMO Trading Co.',
          country: 'Unknown',
        },
      }),
      CAROL
    );
    assert.equal(req.status, REQUEST_STATUS.compliance_hold);
    assert.equal(req.compliance.status, 'blocked');
    assert.ok(req.compliance.hits.some((h) => h.type === 'sanctions'));
  });

  test('cannot sign a blocked request', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({
        amount: 5_000,
        beneficiary: {
          name: 'SDN-SAMPLE Corp',
          country: 'Unknown',
        },
      }),
      CAROL
    );
    assert.throws(
      () => wf.signRequest(req.id, BOB, 'digital'),
      /compliance hold/
    );
  });
});

/* --------------------------------------------------------------------
 * 8. auditTrail integrity
 * ------------------------------------------------------------------ */
describe('auditTrail', () => {
  test('records created / routed / signed / approved', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    wf.signRequest(req.id, BOB, 'digital');
    const trail = wf.auditTrail(req.id);
    const actions = trail.map((e) => e.action);
    assert.ok(actions.includes('request.created'));
    assert.ok(actions.includes('request.routed'));
    assert.ok(actions.includes('request.signed'));
    assert.ok(actions.includes('request.approved'));
  });

  test('audit trail is append-only — older entries preserved after rejection', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    wf.rejectRequest(req.id, BOB, 'wrong beneficiary');
    const trail = wf.auditTrail(req.id);
    assert.ok(trail.some((e) => e.action === 'request.created'));
    assert.ok(trail.some((e) => e.action === 'request.rejected'));
  });

  test('SoD violation is logged', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      BOB
    );
    assert.throws(() => wf.signRequest(req.id, BOB, 'digital'));
    const trail = wf.auditTrail(req.id);
    assert.ok(trail.some((e) => e.action === 'request.sod_violation'));
  });
});

/* --------------------------------------------------------------------
 * 9. notifyApprovers
 * ------------------------------------------------------------------ */
describe('notifyApprovers (bilingual)', () => {
  test('emits one message per role in the tier', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 120_000 }),
      CAROL
    );
    const msgs = wf.notifyApprovers(req.id);
    assert.equal(msgs.length, req.routing.signerRoles.length);
    assert.ok(msgs[0].subject_he.length > 0);
    assert.ok(msgs[0].subject_en.length > 0);
    assert.match(msgs[0].body_he, /ממתינה|בקשה/);
    assert.match(msgs[0].body_en, /Request|signature/);
  });

  test('notifications are queued for downstream channels', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 120_000 }),
      CAROL
    );
    wf.notifyApprovers(req.id);
    assert.ok(wf.notificationQueue.length >= 1);
    assert.equal(wf.notificationQueue[0].requestId, req.id);
  });
});

/* --------------------------------------------------------------------
 * 10. catalogs + disclaimer
 * ------------------------------------------------------------------ */
describe('catalogs + disclaimer', () => {
  test('TRANSACTION_TYPES exposes the 4 canonical channels', () => {
    assert.ok(TRANSACTION_TYPES.wire);
    assert.ok(TRANSACTION_TYPES.check);
    assert.ok(TRANSACTION_TYPES.electronic);
    assert.ok(TRANSACTION_TYPES.paylink);
  });

  test('SIGNER_ROLES covers clerk → board_member', () => {
    assert.ok(SIGNER_ROLES.clerk);
    assert.ok(SIGNER_ROLES.finance_manager);
    assert.ok(SIGNER_ROLES.cfo);
    assert.ok(SIGNER_ROLES.ceo);
    assert.ok(SIGNER_ROLES.board_member);
  });

  test('SIGNATURE_METHODS: digital / 2fa / hardware-token / physical', () => {
    assert.ok(SIGNATURE_METHODS.digital);
    assert.ok(SIGNATURE_METHODS['2fa']);
    assert.ok(SIGNATURE_METHODS['hardware-token']);
    assert.ok(SIGNATURE_METHODS.physical);
  });

  test('DEFAULT_MATRIX_RULES have three tiers', () => {
    assert.equal(DEFAULT_MATRIX_RULES.length, 3);
  });

  test('OFAC_BLOCKLIST is non-empty', () => {
    assert.ok(OFAC_BLOCKLIST.length > 0);
  });

  test('disclaimer is exposed on every request', () => {
    const { wf } = freshWorkflow();
    const req = wf.requestAuthorization(
      baseRequestPayload({ amount: 25_000 }),
      CAROL
    );
    assert.match(req.disclaimer.he, /בנק|בפועל|שומר/);
    assert.match(req.disclaimer.en, /bank|signatures|execute/i);
  });
});
