# AGENT-FIX-CONSOLIDATOR — Applied

**Scope:** `onyx-procurement/src/consolidation/consolidator.js`
**Test file:** `onyx-procurement/test/payroll/consolidator.test.js`
**Date:** 2026-04-29

## What was wrong

`eliminateInvestmentAndComputeGoodwill` (line ~801 of `consolidator.js`) eliminated
`ownership × currentEquity` against the subsidiary's equity instead of the
IFRS 10 / IAS 27 prescribed amount. The investment-elimination journal entry
was therefore unbalanced whenever the subsidiary had any post-acquisition
movement in equity (retained earnings, FV uplifts, CTA, etc.).

Concretely, the journal would book:

```
DR Sub equity     ownership × currentEquity         (WRONG)
DR Goodwill       cost − ownership × (NA + FV)
CR Investment     cost
CR NCI            (1 − ownership) × currentEquity
```

The DR/CR mismatch equalled `ownership × postAcqMovement` — the parent's share
of post-acquisition retained earnings — which should have remained in
consolidated equity but was instead silently dropped, so the BS would not tie.

This produced six failing assertions (all `verifyEquality(...).balanced`):
1. IC AR/AP elimination (sub had post-acq loss of −600)
2. Investment ↔ equity elimination (post-acq +600)
3. NCI 80% (post-acq +200)
4. FV uplifts (post-acq +500)
5. FX-CTA on USD subsidiary
6. Full-stack regression (combined effect, delta = 1312.5)

## What was fixed

Replaced the equity elimination amount with the standard consolidation formula
(IFRS 10.B86, IAS 27 retained):

```
elim_equity = netAssetsAtAcq + (1 − ownership) × (currentEquity − netAssetsAtAcq)
            = pre-acq book + NCI's share of post-acq movement
```

This leaves `ownership × postAcqMovement` (the parent's share of retained
earnings since acquisition) inside consolidated equity, which is exactly what
IFRS requires. NCI continues to be recognised separately at
`(1 − ownership) × currentEquity` — the sum of pre-acq NCI and NCI's share of
post-acq movements rolled into one figure, consistent with the partial-goodwill
method already in use.

Hebrew comment added in the fix block explaining the rule.

**LOC changed:** ~17 (one elimination block + meta annotation). Within the
50 LOC budget.

## Test delta

Before: `pass 18 / fail 6` (24 total)
After:  `pass 24 / fail 0` (24 total)

Six previously-failing tests now pass:
- `consolidate — IC AR/AP fully offsets`
- `consolidate — investment eliminated against sub equity, goodwill recognized`
- `consolidate — NCI recognized at non-controlling share`
- `consolidate — fair value uplifts reduce goodwill, add FV adjustment lines`
- `consolidate — USD sub with FX translation produces CTA, balanced`
- `consolidate — full-stack regression: FX + IC AR/AP + IC Sales + NCI + goodwill`

No regressions in the rest of the suite. The 18 previously-passing tests
remain green; `test/wiring/grand-consolidator.test.js` (an unrelated file)
also still passes 18/18.
