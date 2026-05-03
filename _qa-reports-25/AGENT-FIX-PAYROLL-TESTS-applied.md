# AGENT-FIX-PAYROLL-TESTS — Applied

**Date:** 2026-04-29
**Scope:** `payroll-autonomous/` vitest suite

## Summary
| Metric | Before | After | Delta |
|---|---|---|---|
| Test files passed | 4 | **8** | +4 |
| Test files failed | 10 | **0** | -10 |
| Tests passed | 72 | **83** | +11 |
| Tests failed | 11 | **0** | -11 |
| Exit code | 1 | **0** | green |

## Pre-existing fixes already in HEAD (commit `3b16d0b`)
The following were already applied by the previous "wave-19+20" commit and
needed no further edits:
- **Group A** — `URL.createObjectURL`/`revokeObjectURL` polyfills in `src/test/setup.ts`
- **Group C** — `StatusBadge.test.tsx` color assertion uses `rgb(61, 204, 145)`
- **Group D** — `SwipeableRow.test.jsx` accepts `direction:rtl` (CSS) or `dir="rtl"` (attr)
- **Group E** — `vite.config.js` `test.exclude` covers e2e + node_modules + dist
- **Group F** — `vite.config.js` `test.exclude` also covers `test/smoke.test.js`

These pre-fixes left **3 root-cause failure groups** still red.

## Edits applied this run
Two files modified, **24 insertions / 9 deletions** total (≪ 30 LOC cap).

### 1. `payroll-autonomous/src/components/BIDashboard.test.jsx` (Group B, expanded)
Each chart card renders both an `<h3>` heading **and** an SVG `<title>` with
the same text — `getByText` raises `Found multiple elements`. Switched all 6
chart-title queries from `getByText(...)` to `getAllByText(...)[0]`. The user's
spec only mentioned `'הכנסות מול הוצאות'` but the same defect applied to all
six titles; fixed all to keep the test deterministic.

### 2. `payroll-autonomous/src/utils/export.test.ts` (Group A, secondary)
Once the URL polyfill landed, a downstream failure surfaced:
`vi.spyOn(globalThis, 'Blob')` replaces the native `Blob` class with a vitest
mock function that lacks `[[Construct]]`, so `new Blob(...)` inside
`exportToCSV/JSON` throws `Class constructor Blob cannot be invoked without 'new'`.
Added a constructable spy: a `SpiedBlob extends Blob` subclass plus a
`spyOnBlob()` helper that records `(parts, opts)` calls. Replaced the 4
in-test `vi.spyOn(globalThis, 'Blob')` calls with `spyOnBlob()`.

## Verification
```
$ npm test
Test Files  8 passed (8)
     Tests  83 passed (83)
   Duration  3.05s
```

## Constraints honored
- Minimal edits per fix (2 files touched, 15 LOC net)
- No production code modified — test-only changes
- 72 previously-passing tests still pass
- No commit (per instructions)
