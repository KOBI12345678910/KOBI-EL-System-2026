/**
 * Unit tests — CheckRegister (src/finance/check-register.js)
 * Agent Y-082 — 2026-04-11
 *
 * Run:
 *   node --test test/finance/check-register.test.js
 *
 * Covers:
 *   - Issuance sequential numbering and duplicate protection
 *   - Recording incoming checks (drawer metadata, postdated flag)
 *   - Endorsement chain preservation (append-only)
 *   - Deposit + clearance lifecycle
 *   - Post-dated deposit blocked before due date
 *   - Bounce handling: counting vs. non-counting reasons
 *   - Restricted customer ladder at 10 and 15 bounces / 12 months
 *   - Void dual-signature requiring two distinct approvers
 *   - Post-dated check list aging buckets
 *   - Bank reconciliation matching, unmatched, and auto-bounce from statement
 *   - Audit log never loses entries
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CheckRegister,
  CHECK_STATUS,
  CHECK_DIRECTION,
  BOUNCE_REASON,
  RESTRICTED_CUSTOMER,
  createMemoryStore
} = require('../../src/finance/check-register');

/** Build a fresh register on an isolated store. */
function makeRegister(opts) {
  return new CheckRegister({ store: createMemoryStore(), ...(opts || {}) });
}

/* ==========================================================================
 * Issuance & sequential numbering
 * ========================================================================== */

test('nextAvailableNumber — issues sequential, monotonic numbers', () => {
  const reg = makeRegister();
  assert.equal(reg.peekNextNumber('ACC1'), 1);
  assert.equal(reg.nextAvailableNumber('ACC1'), 1);
  assert.equal(reg.nextAvailableNumber('ACC1'), 2);
  assert.equal(reg.nextAvailableNumber('ACC1'), 3);
  // Separate account has its own counter
  assert.equal(reg.nextAvailableNumber('ACC2'), 1);
});

test('setStartingNumber — aligns with pre-printed check book', () => {
  const reg = makeRegister();
  reg.setStartingNumber('ACC1', 5001);
  assert.equal(reg.nextAvailableNumber('ACC1'), 5001);
  assert.equal(reg.nextAvailableNumber('ACC1'), 5002);
  assert.throws(
    () => reg.setStartingNumber('ACC1', 4000),
    /ERR_NON_MONOTONIC/
  );
});

test('recordIssuedCheck — auto-assigns number and stores full record', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'BOI-12-900-111',
    payee: 'Acme Cement Ltd',
    amount: 14500,
    currency: 'ILS',
    dueDate: '2026-04-15',
    memo: 'Invoice 2026-0412',
    authorizer: 'emp-001'
  });

  const c = reg.getCheck(id);
  assert.equal(c.direction, CHECK_DIRECTION.OUTGOING);
  assert.equal(c.status, CHECK_STATUS.ISSUED);
  assert.equal(c.number, 1);
  assert.equal(c.amount, 14500);
  assert.equal(c.payee, 'Acme Cement Ltd');
  assert.equal(c.authorizer, 'emp-001');
  assert.equal(c.postdated, true); // today 2026-04-11 < dueDate 2026-04-15
});

test('recordIssuedCheck — rejects duplicate explicit number on same account', () => {
  const reg = makeRegister();
  reg.recordIssuedCheck({
    accountId: 'A',
    number: 100,
    payee: 'X',
    amount: 1,
    dueDate: '2026-05-01',
    authorizer: 'emp'
  });
  assert.throws(
    () => reg.recordIssuedCheck({
      accountId: 'A',
      number: 100,
      payee: 'Y',
      amount: 2,
      dueDate: '2026-05-02',
      authorizer: 'emp'
    }),
    /ERR_NUMBER_DUPLICATE/
  );
});

test('recordIssuedCheck — validates all required fields', () => {
  const reg = makeRegister();
  assert.throws(() => reg.recordIssuedCheck({}), /ERR_ACCOUNT_REQUIRED/);
  assert.throws(
    () => reg.recordIssuedCheck({ accountId: 'A' }),
    /ERR_PAYEE_REQUIRED/
  );
  assert.throws(
    () => reg.recordIssuedCheck({ accountId: 'A', payee: 'P' }),
    /ERR_AMOUNT_INVALID/
  );
  assert.throws(
    () => reg.recordIssuedCheck({ accountId: 'A', payee: 'P', amount: 10 }),
    /ERR_DUE_DATE_INVALID/
  );
  assert.throws(
    () => reg.recordIssuedCheck({
      accountId: 'A',
      payee: 'P',
      amount: 10,
      dueDate: '2026-05-01'
    }),
    /ERR_AUTHORIZER_REQUIRED/
  );
});

/* ==========================================================================
 * Incoming checks
 * ========================================================================== */

test('recordReceivedCheck — captures drawer info and postdated flag', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '12',          // Hapoalim
    drawerBranch: '623',
    drawerAccount: '12345678',
    number: 'CHK-0042',
    payer: 'Customer A',
    amount: 5000,
    dueDate: '2026-06-01',     // future = postdated
    issueDate: '2026-04-11'
  });
  const c = reg.getCheck(id);
  assert.equal(c.direction, CHECK_DIRECTION.INCOMING);
  assert.equal(c.drawerKey, '12-623-12345678');
  assert.equal(c.postdated, true);
  assert.equal(c.payer, 'Customer A');
});

test('recordReceivedCheck — rejects missing drawer data', () => {
  const reg = makeRegister();
  assert.throws(
    () => reg.recordReceivedCheck({}),
    /ERR_DRAWER_BANK_REQUIRED/
  );
});

/* ==========================================================================
 * Endorsement chain
 * ========================================================================== */

test('endorseCheck — appends endorsement records and preserves chain', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: '999',
    number: '1', payer: 'A', amount: 100, dueDate: '2026-04-11'
  });
  reg.endorseCheck(id, 'Beni Zohar');
  reg.endorseCheck(id, { name: 'Dani Properties', idNumber: '511234567' });
  reg.endorseCheck(id, 'Techno-Kol Uzi');

  const c = reg.getCheck(id);
  assert.equal(c.endorsements.length, 3);
  assert.equal(c.endorsements[0].name, 'Beni Zohar');
  assert.equal(c.endorsements[0].sequence, 1);
  assert.equal(c.endorsements[1].idNumber, '511234567');
  assert.equal(c.endorsements[2].sequence, 3);
  assert.equal(c.status, CHECK_STATUS.ENDORSED);
});

test('endorseCheck — blocks after clearance', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: '999',
    number: '1', payer: 'A', amount: 100, dueDate: '2026-04-11'
  });
  reg.depositCheck(id, 'OUR-ACC', '2026-04-11');
  reg.markCleared(id);
  assert.throws(
    () => reg.endorseCheck(id, 'Someone'),
    /ERR_CHECK_NOT_ENDORSABLE/
  );
});

/* ==========================================================================
 * Deposit + clearance
 * ========================================================================== */

test('depositCheck — moves to pending and forecasts clearance date', () => {
  const reg = makeRegister({ clearingDays: 2 });
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: '999',
    number: '1', payer: 'A', amount: 1000, dueDate: '2026-04-11'
  });
  const result = reg.depositCheck(id, 'OUR-ACC', '2026-04-11');
  assert.equal(result.accountId, 'OUR-ACC');
  assert.equal(result.expectedClearance, '2026-04-13');

  const s = reg.clearanceStatus(id);
  assert.equal(s.status, CHECK_STATUS.PENDING);
  assert.equal(s.statusHe, 'בהמתנה לפירעון');
});

test('depositCheck — rejects post-dated deposit before due date', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: '999',
    number: '2', payer: 'A', amount: 500, dueDate: '2026-12-31'
  });
  assert.throws(
    () => reg.depositCheck(id, 'OUR-ACC', '2026-04-11'),
    /ERR_POSTDATED_EARLY_DEPOSIT/
  );
});

test('depositCheck — prevents double deposit', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: '999',
    number: '3', payer: 'A', amount: 100, dueDate: '2026-04-11'
  });
  reg.depositCheck(id, 'OUR-ACC', '2026-04-11');
  assert.throws(
    () => reg.depositCheck(id, 'OUR-ACC', '2026-04-11'),
    /ERR_ALREADY_DEPOSITED/
  );
});

/* ==========================================================================
 * Bounce handling + restricted customer ladder
 * ========================================================================== */

test('bouncedCheckRecord — counts NO_COVER and transitions status', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: 'D1',
    number: '1', payer: 'Bad Payer', amount: 1000, dueDate: '2026-04-11'
  });
  const out = reg.bouncedCheckRecord({
    checkId: id, reason: BOUNCE_REASON.NO_COVER, fee: 25, bounceDate: '2026-04-12'
  });
  assert.equal(out.counts, true);
  assert.equal(out.statusAfter, CHECK_STATUS.BOUNCED);
  assert.equal(out.restriction.bounceCount, 1);
  assert.equal(out.restriction.restricted, false);
  assert.equal(out.restriction.remainingToRestriction, 9);
});

test('bouncedCheckRecord — technical reasons do NOT count toward restriction', () => {
  const reg = makeRegister();
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: 'D2',
    number: '1', payer: 'P', amount: 1000, dueDate: '2026-04-11'
  });
  const out = reg.bouncedCheckRecord({
    checkId: id, reason: BOUNCE_REASON.SIGNATURE_INVALID
  });
  assert.equal(out.counts, false);
  assert.equal(out.statusAfter, CHECK_STATUS.RETURNED);
  assert.equal(out.restriction, null);
});

test('restrictedCustomerCheck — ladder at 10 → regular, 15 → severe', () => {
  const reg = makeRegister();
  const drawer = 'D3';

  for (let i = 1; i <= 9; i++) {
    const id = reg.recordReceivedCheck({
      drawerBank: '10', drawerBranch: '001', drawerAccount: drawer,
      number: 'C' + i, payer: 'P', amount: 100, dueDate: '2026-04-11'
    });
    reg.bouncedCheckRecord({
      checkId: id, reason: BOUNCE_REASON.NO_COVER, bounceDate: '2026-04-12'
    });
  }
  // After 9 bounces: not restricted yet
  let status = reg.restrictedCustomerCheck(drawer);
  assert.equal(status.restricted, false);

  // 10th bounce → regular restriction
  const id10 = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: drawer,
    number: 'C10', payer: 'P', amount: 100, dueDate: '2026-04-11'
  });
  const out10 = reg.bouncedCheckRecord({
    checkId: id10, reason: BOUNCE_REASON.NO_COVER, bounceDate: '2026-04-12'
  });
  assert.equal(out10.restriction.restricted, true);
  assert.equal(out10.restriction.level, 'regular');
  assert.equal(out10.restriction.bounceCount, 10);

  status = reg.restrictedCustomerCheck(drawer);
  assert.equal(status.restricted, true);
  assert.equal(status.level, 'regular');

  // Push to 15 → severe
  for (let i = 11; i <= 15; i++) {
    const id = reg.recordReceivedCheck({
      drawerBank: '10', drawerBranch: '001', drawerAccount: drawer,
      number: 'C' + i, payer: 'P', amount: 100, dueDate: '2026-04-11'
    });
    reg.bouncedCheckRecord({
      checkId: id, reason: BOUNCE_REASON.NO_COVER, bounceDate: '2026-04-12'
    });
  }
  status = reg.restrictedCustomerCheck(drawer);
  assert.equal(status.restricted, true);
  assert.equal(status.level, 'severe');
  assert.ok(status.bounceCount >= RESTRICTED_CUSTOMER.BOUNCE_THRESHOLD_SEVERE);
});

test('restrictedCustomerCheck — external BoI registry fallback', () => {
  const reg = makeRegister({
    restrictedRegistry: {
      isRestricted(acc) {
        if (acc === 'BOI-BLACK') {
          return { drawerAccount: acc, restricted: true, level: 'severe' };
        }
        return false;
      }
    }
  });
  const r = reg.restrictedCustomerCheck('BOI-BLACK');
  assert.equal(r.restricted, true);
  assert.equal(r.source, 'boi');
  assert.equal(r.level, 'severe');

  const clean = reg.restrictedCustomerCheck('CLEAN-ACC');
  assert.equal(clean.restricted, false);
});

test('recordReceivedCheck — flags restrictedDrawerWarning when drawer is on list', () => {
  const reg = makeRegister({
    restrictedRegistry: { isRestricted: acc => acc === 'BAD' }
  });
  const id = reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: 'BAD',
    number: '1', payer: 'Blacklisted', amount: 100, dueDate: '2026-04-11'
  });
  const c = reg.getCheck(id);
  assert.equal(c.restrictedDrawerWarning, true);
});

/* ==========================================================================
 * Dual-signature void
 * ========================================================================== */

test('voidCheck — dual signature requires two distinct approvers', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'A', payee: 'P', amount: 1000,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });

  // First approver — still pending
  const r1 = reg.voidCheck(id, 'typo in payee', { approvers: ['emp-1'] });
  assert.equal(r1.voided, false);
  assert.equal(r1.pendingApprovers, 1);

  // Same approver re-submitted — still only 1 distinct, still pending
  const r2 = reg.voidCheck(id, 'typo', { approvers: ['emp-1'] });
  assert.equal(r2.voided, false);
  assert.equal(r2.pendingApprovers, 1);

  // Second distinct approver → committed
  const r3 = reg.voidCheck(id, 'typo', { approvers: ['emp-2'] });
  assert.equal(r3.voided, true);
  assert.equal(r3.status, CHECK_STATUS.VOIDED);
  assert.equal(r3.approvers.length, 2);

  // Cannot be voided twice
  assert.throws(
    () => reg.voidCheck(id, 'again', { approvers: ['emp-3', 'emp-4'] }),
    /ERR_NOT_VOIDABLE/
  );
});

test('voidCheck — single-signature mode when requires2Sig=false', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'A', payee: 'P', amount: 50,
    dueDate: '2026-05-01', authorizer: 'emp-1'
  });
  const r = reg.voidCheck(id, 'admin override',
    { approvers: ['admin-1'], requires2Sig: false });
  assert.equal(r.voided, true);
});

test('voidCheck — reason required', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'A', payee: 'P', amount: 50,
    dueDate: '2026-05-01', authorizer: 'emp-1'
  });
  assert.throws(
    () => reg.voidCheck(id, '', { approvers: ['a', 'b'] }),
    /ERR_REASON_REQUIRED/
  );
});

/* ==========================================================================
 * Post-dated check aging list
 * ========================================================================== */

test('postDatedCheckList — aging buckets and totals', () => {
  const reg = makeRegister();
  // Received 4 checks with varying due dates
  const today = '2026-04-11';
  const mkRecv = (num, dueDate, amount) => reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001',
    drawerAccount: 'D-' + num, number: num,
    payer: 'X', amount, dueDate, issueDate: today
  });
  mkRecv('1', '2026-04-01', 100);   // overdue
  mkRecv('2', '2026-04-15', 200);   // 0-7 bucket (4 days)
  mkRecv('3', '2026-05-01', 300);   // 8-30 bucket (20 days)
  mkRecv('4', '2026-07-01', 400);   // 61-90 bucket (81 days)

  // Note: entry #1 isn't postdated relative to its issueDate=today,
  // so force issueDate before dueDate for real postdated semantics.
  const list = reg.postDatedCheckList({ asOfDate: today });
  // Only checks that are postdated (dueDate > issueDate) appear
  const totalPostdated = list.checks.length;
  assert.ok(totalPostdated >= 3);
  assert.equal(list.buckets.due_0_7.count, 1);
  assert.equal(list.buckets.due_8_30.count, 1);
  assert.equal(list.buckets.due_61_90.count, 1);
  assert.equal(list.total, 900); // 200 + 300 + 400
});

test('postDatedCheckList — filter by direction', () => {
  const reg = makeRegister();
  reg.recordIssuedCheck({
    accountId: 'A', payee: 'P', amount: 500,
    dueDate: '2026-06-01', authorizer: 'emp-1'
  });
  reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: 'X',
    number: '1', payer: 'P', amount: 300,
    dueDate: '2026-06-01', issueDate: '2026-04-11'
  });

  const outgoing = reg.postDatedCheckList({
    asOfDate: '2026-04-11', direction: 'outgoing'
  });
  const incoming = reg.postDatedCheckList({
    asOfDate: '2026-04-11', direction: 'incoming'
  });
  assert.equal(outgoing.checks.length, 1);
  assert.equal(outgoing.checks[0].counterparty, 'P');
  assert.equal(incoming.checks.length, 1);
});

/* ==========================================================================
 * Bank reconciliation
 * ========================================================================== */

test('reconcileWithBank — matches cleared checks and flags unmatched', () => {
  const reg = makeRegister();
  const id1 = reg.recordIssuedCheck({
    accountId: 'BANK1', payee: 'Alpha', amount: 1000,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  const c1 = reg.getCheck(id1);

  const id2 = reg.recordIssuedCheck({
    accountId: 'BANK1', payee: 'Bravo', amount: 2500,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  const c2 = reg.getCheck(id2);

  // Bank statement: first cleared, second cleared, one mystery line
  const statement = [
    { checkNumber: c1.number, amount: 1000, date: '2026-04-12', status: 'cleared' },
    { checkNumber: c2.number, amount: 2500, date: '2026-04-13', status: 'cleared' },
    { checkNumber: 9999,      amount: 777,  date: '2026-04-14', status: 'cleared' }
  ];
  const rec = reg.reconcileWithBank('BANK1', statement);
  assert.equal(rec.summary.matchedCount, 2);
  assert.equal(rec.summary.matchedTotal, 3500);
  assert.equal(rec.summary.unmatchedBankCount, 1);
  assert.equal(reg.getCheck(id1).status, CHECK_STATUS.CLEARED);
  assert.equal(reg.getCheck(id1).reconciled, true);
});

test('reconcileWithBank — statement-returned lines trigger bounce flow', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'BANK1', payee: 'Bouncer', amount: 5000,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  const number = reg.getCheck(id).number;
  const rec = reg.reconcileWithBank('BANK1', [
    { number, amount: 5000, date: '2026-04-15', status: 'returned',
      reason: BOUNCE_REASON.NO_COVER }
  ]);
  assert.equal(rec.matched.length, 1);
  assert.equal(rec.matched[0].bounced, true);
  assert.equal(reg.getCheck(id).status, CHECK_STATUS.BOUNCED);
  assert.equal(reg.getCheck(id).bounceReason, BOUNCE_REASON.NO_COVER);
});

test('reconcileWithBank — ourUnmatched lists checks never seen on bank', () => {
  const reg = makeRegister();
  reg.recordIssuedCheck({
    accountId: 'BANK1', payee: 'Ghost', amount: 777,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  const rec = reg.reconcileWithBank('BANK1', []);
  assert.equal(rec.ourUnmatched.length, 1);
  assert.equal(rec.ourUnmatched[0].amount, 777);
});

test('reconcileWithBank — amount mismatch is flagged, not auto-matched', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'BANK1', payee: 'Typo', amount: 1000,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  const number = reg.getCheck(id).number;
  const rec = reg.reconcileWithBank('BANK1', [
    { number, amount: 999.50, date: '2026-04-12', status: 'cleared' }
  ]);
  assert.equal(rec.matched.length, 0);
  assert.equal(rec.unmatched.length, 1);
  assert.equal(rec.unmatched[0].reason, 'amount_mismatch');
  assert.equal(rec.ourUnmatched.length, 1);
});

/* ==========================================================================
 * Audit log immutability
 * ========================================================================== */

test('audit log — grows with every operation and is queryable by check', () => {
  const reg = makeRegister();
  const id = reg.recordIssuedCheck({
    accountId: 'A', payee: 'P', amount: 100,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  reg.voidCheck(id, 'err', { approvers: ['a', 'b'] });

  const all = reg.getAuditLog();
  assert.ok(all.length >= 2);
  const checkLog = reg.getAuditLog(id);
  const events = checkLog.map(e => e.event);
  assert.ok(events.includes('CHECK_ISSUED'));
  assert.ok(events.includes('CHECK_VOIDED'));
});

test('listChecks — filter by direction and status', () => {
  const reg = makeRegister();
  reg.recordIssuedCheck({
    accountId: 'A', payee: 'P1', amount: 100,
    dueDate: '2026-04-30', authorizer: 'emp-1'
  });
  reg.recordReceivedCheck({
    drawerBank: '10', drawerBranch: '001', drawerAccount: 'Z',
    number: '1', payer: 'X', amount: 200, dueDate: '2026-04-30'
  });
  assert.equal(reg.listChecks({ direction: 'outgoing' }).length, 1);
  assert.equal(reg.listChecks({ direction: 'incoming' }).length, 1);
});
