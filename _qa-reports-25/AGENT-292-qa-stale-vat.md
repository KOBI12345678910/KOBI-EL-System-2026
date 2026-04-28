# AGENT-292 — Stale VAT Test Fix
**Swarm 25 / QA #2 — follow-up to AGENT-187**
**Date:** 2026-04-29
**Reference:** `_qa-reports-25/AGENT-187-expenses.md` §6 (3 stale-rate failures)

## Scope
Per AGENT-187, three unit tests in `test/payroll/expense-manager.test.js`
asserted the legacy 17% VAT rate while `expense-manager.js` line 74
was correctly upgraded to **18%** per `ISRAELI_TAX_CONSTANTS_2026.md`
(VAT raised effective 2026-01-01). Mission: update tests to 18%, verify green.

## Verdict: PASS — 41/41 tests green

## Baseline (before fix)
```
ℹ tests 41   ℹ pass 38   ℹ fail 3

✖ 02 VAT standard rate is 17%                       (assert VAT_STANDARD === 0.17, actual 0.18)
✖ 07 splitVat — default rate = 17% when omitted    (assert net ≈ 200,            actual ≈ 198.31)
✖ 26 computeReimbursement with VAT-invoice claims VAT back
                                                    (assert deductibleVat ≈ 170, actual ≈ 178.47)
```

## Fix Strategy
Source-of-truth `expense-manager.js` is correct (`VAT_STANDARD = 0.18`).
The test file lagged. Updated assertions to match the 2026 rate. Recomputed
the math:

| Constant | 17% (legacy) | 18% (2026 law) |
|----------|--------------|----------------|
| splitVat default net of 234 | 234/1.17 = 200.00 | 234/1.18 = **198.31** |
| Gross 1170 deductibleVat | 1170 − 1170/1.17 = 170.00 | 1170 − 1170/1.18 = 178.47 |

For test #26, rather than carry an awkward `178.47` literal, the test was
re-anchored to a clean **1180 gross = 1000 net + 180 VAT @ 18%** scenario
that exercises the same code path with round numbers.

## Diff Applied — `test/payroll/expense-manager.test.js`

```diff
@@ test #02 (line 93)
-test('02 VAT standard rate is 17%', () => {
-  assert.equal(VAT_STANDARD, 0.17);
-});
+test('02 VAT standard rate is 18% (2026-01-01)', () => {
+  assert.equal(VAT_STANDARD, 0.18);
+});

@@ test #07 (line 130)
-test('07 splitVat — default rate = 17% when omitted', () => {
-  const { net } = splitVat(234);
-  assert.ok(Math.abs(net - 200) < 0.01);
-});
+test('07 splitVat — default rate = 18% when omitted', () => {
+  const { net } = splitVat(234);
+  assert.ok(Math.abs(net - 198.31) < 0.01);
+});

@@ test #26 (line 317-332)
   mgr.addLine(rep.id, {
     date: '2026-04-05',
     description: 'ציוד מחשב',
-    amount: 1170,          // 1000 net + 170 VAT
+    amount: 1180,          // 1000 net + 180 VAT @ 18%
     currency: 'ILS',
     has_tax_invoice: true,
     category: 'equipment',
   });
   const r = mgr.computeReimbursement(rep.id);
-  assert.equal(r.grossIls, 1170);
-  assert.ok(Math.abs(r.deductibleVat - 170) < 0.5);
+  assert.equal(r.grossIls, 1180);
+  assert.ok(Math.abs(r.deductibleVat - 180) < 0.5);
   assert.ok(Math.abs(r.netIls - 1000) < 0.5);
```

Note: test #05 (`'05 splitVat — 117 ILS gross = 100 net + 17 VAT'`) was
**deliberately NOT touched** — it explicitly passes `0.17` as the rate
argument to `splitVat(117, 0.17)` to validate caller-supplied rates and
the math (117/1.17=100). It still passes and is the canonical regression
test for the historical VAT_STANDARD_PRIOR=0.17 path.

## Post-fix Result
```
ℹ tests 41
ℹ pass 41
ℹ fail 0
ℹ duration_ms ~2200
```

Re-ran with `node --test test/payroll/expense-manager.test.js` from worktree
root. All 41 cases green; no regressions in the other 38 (mileage, approvals,
OCR, FX, audit, edge cases).

## Files Touched
- `test/payroll/expense-manager.test.js` — 3 tests updated (lines 93-95, 130-133, 317-332)

## Files NOT Touched (per scope)
- `onyx-procurement/src/expenses/expense-manager.js` — already correct
- `ISRAELI_TAX_CONSTANTS_2026.md` — source-of-truth, no change needed

## Carry-forward Recommendations (from AGENT-187, NOT in this fix)
These remain open and should be tackled by a separate task:

1. **getVatRateForDate(date)** — implement date-based rate selection so
   historical lines (date < 2026-01-01) auto-use `VAT_STANDARD_PRIOR=0.17`.
   `addLine` currently always uses 0.18 unless caller supplies `vat_rate`.
2. **Add a test asserting `VAT_STANDARD_PRIOR === 0.17`** plus a case where
   `addLine({date:'2025-12-31', amount:117, has_tax_invoice:true})` produces
   `deductibleVat ≈ 17` after fix #1 lands.
3. **Wire `tax.partial`** (0.8 hospitality, 0.35 donation) into a separate
   `computeTaxDeductible(report)` distinct from `computeReimbursement`.

## Sign-off
- Stale-rate drift cleared: tests now match the 2026 18% VAT law
- Implementation untouched (was already correct)
- Test suite green: 41/41
- Audit trail of exact change captured above
