# AGENT FIX: PayrollRun360 JSX Escape Sequences

## Status: APPLIED

## Issue
File `erp-app/src/pages/workforce/PayrollRun360.tsx` lines 176-177 contained invalid `\"` escape sequences inside JSX attribute strings (`label="סה\"כ ברוטו"`). The `\"` is invalid inside JSX double-quoted attribute strings and broke the Vite/Rollup build.

## Fix
Replaced outer double quotes with single quotes so the inner `"` (Hebrew gershayim usage) renders literally:

```tsx
<StatCard label='סה"כ ברוטו' value={money.format(Number(run.total_gross ?? 0))} />
<StatCard label='סה"כ נטו'  value={money.format(Number(run.total_net ?? 0))} />
```

No other `\\"` occurrences found in `erp-app/src/pages/workforce/PayrollRun360.tsx` or under `erp-app/src` (grep confirmed).

## Build Verification
Ran `cd erp-app && npm run build`. The JSX parse error is resolved — Vite now successfully transforms 3874 modules (previously aborted on parser error at this file).

Build still exits non-zero on a SEPARATE, UNRELATED issue: missing dependency `@xyflow/react` imported by `erp-app/src/pages/builder/visual-workflow-designer.tsx`. That blocker is out of scope for this task.

## Files Touched
- `erp-app/src/pages/workforce/PayrollRun360.tsx` (lines 176-177)

## Not Committed
Per instructions, no git commit performed.
