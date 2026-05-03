# AGENT-307 — Sanity Audit of PR #63 Recent Fixes

**Date:** 2026-04-29
**Scope:** Verify the 11 areas patched in PR #63 (200-agent QA + critical fixes) actually solved the problems and did not introduce regressions.
**Reviewer:** Sanity Agent 307
**Branch:** `claude/objective-merkle-40ff93`
**Repo:** Techno-Kol Uzi ERP 2026
**Method:** static read of each touched file, cross-check against `state-machines.js`, runtime sanity script for orchestrator preconditions, recursive grep for regressions.

---

## TL;DR Verdict

| # | Area | Status |
|---|---|---|
| 1 | VAT 17→18 | ✅ Fixed (canonical migrations + .env), ⚠️ legacy 0.17 still in tests/old QA docs |
| 2 | Payroll port 5174→5173 | ✅ Fixed |
| 3 | 3 orchestrator preconditions | ✅ Fixed (0 mismatches vs state-machines) |
| 4 | CI branches `[main]`→`[main, master]` | 🟡 Partial — only `ci.yml` updated |
| 5 | dotenv loading | ✅ Fixed (`onyx-ai/src/index.ts` line 67, `onyx-procurement/server.js` line 52) |
| 6 | dir=rtl on root HTML | ✅ Fixed (all 4 index.html) |
| 7 | K8s secret CHANGE_ME placeholder | 🟡 Cosmetic — generator still emits `CHANGE_ME` |
| 8 | form-validation hook (validateAll/reset/clearField) | ✅ Fixed |
| 9 | sales_order state machine | ✅ Added (state-machines.js + migration 00084) |
| 10 | Breadcrumb component | 🟡 Partial — 4/9 360 pages wired, 5 still bare |
| 11 | Action wiring (Customer360 etc.) | 🔴 Drift — AGENT-244 spec ≠ in-tree component |

**Net:** 6 clean fixes, 3 partial, 1 drift, 1 legacy pollution. **No new bugs introduced**, but the PR description over-promised on items 4, 7, 10, 11.

---

## ISSUE-307-01 — security.yml & deploy-preview.yml branches NOT updated

- **תיאור:** PR #63 body claims `branches: [main]` → `[main, master]` for `security.yml` and `deploy-preview.yml`. Inspecting tree confirms only `.github/workflows/ci.yml` was touched.
- **שלבים:** `cat .github/workflows/security.yml | head -10`, line 8 still shows `branches: [main]`. Same for `deploy-preview.yml` line 4.
- **בפועל:** master pushes get CI but no security audit and no deploy-preview comment.
- **צפוי:** all three workflows trigger on `master`.
- **חומרה:** HIGH (security gap until master is GitHub default branch — `7a02049` lives only on master).
- **מודול:** `.github/workflows/security.yml` line 8; `.github/workflows/deploy-preview.yml` line 4.
- **תיקון:** `branches: [main, master]` on the two `pull_request:` blocks. While there, set `audit-level=high` (PR claimed `critical→high` but file still shows `critical` on lines 59 and 63).

## ISSUE-307-02 — manifest-generator.js still emits CHANGE_ME literals

- **תיאור:** `k8s/02-secret.yaml` was hand-fixed to `__REPLACE_VIA_KUBECTL__`. The generator at `onyx-procurement/src/deploy/manifest-generator.js:875-882` still hard-codes `CHANGE_ME`. Anybody re-running the manifest pipeline silently regenerates the bad placeholder.
- **שלבים:** `grep -n "CHANGE_ME" onyx-procurement/src/deploy/manifest-generator.js` returns 7 hits in `out['02-secret.yaml']`.
- **בפועל:** running the generator overwrites the hardened file with `CHANGE_ME`.
- **צפוי:** generator emits `__REPLACE_VIA_KUBECTL__` (or aborts if no `--allow-placeholder` flag).
- **חומרה:** MEDIUM (cosmetic until next regen, then HIGH again).
- **מודול:** `onyx-procurement/src/deploy/manifest-generator.js:875-882`.
- **תיקון:** replace literal `'CHANGE_ME'` with `'__REPLACE_VIA_KUBECTL__'` (7 lines), or pass placeholder via `cfg.secretPlaceholder` so the value is one config switch away. Note: `techno-kol-ops/src/auth/jwt-helper.js:61` correctly keeps `CHANGE_ME` in a denylist — that occurrence is fine and must stay.

## ISSUE-307-03 — VAT 0.17 lingers in tests + e2e fixtures

- **תיאור:** Production migrations (`004-vat-module.sql`, `005-annual-tax-module.sql`) and `.env.example` correctly use `0.18`. However:
  - `onyx-procurement/test/vat-routes.test.js:302` `const VAT_RATE = 0.17;`
  - `onyx-procurement/test/annual-tax-routes.test.js:400, 423, 701` hard-coded `vat_rate: 0.17`
  - `onyx-procurement/tests/e2e/fixtures.js:70, 223` `Math.round(amount * 0.17)`
  - `docs/INVOICE_PDF.md` examples + `docs/DATABASE_SCHEMA.md` rendered defaults still say 0.17
- **שלבים:** `grep -rn "0\.17" onyx-procurement/test onyx-procurement/tests onyx-procurement/docs`.
- **בפועל:** any test that auto-computes VAT against the prod default (`0.18`) will fail; tax-period assertions for ≥ 2026-01-01 are wrong.
- **צפוי:** all tests dated post-2026-01-01 use 0.18; pre-2026 tests stay 0.17 with explicit comment + tax-period date.
- **חומרה:** MEDIUM (CI-blocking once migrations 004/005 are applied to test DB).
- **מודול:** `onyx-procurement/test/vat-routes.test.js`, `onyx-procurement/test/annual-tax-routes.test.js`, `onyx-procurement/tests/e2e/fixtures.js`.
- **תיקון:** parametrize the rate (`process.env.VAT_RATE || 0.18`) in fixtures, update test fixtures with explicit `transaction_date` to choose the historical rate; update `.md` examples.

## ISSUE-307-04 — Customer360 production component has no Breadcrumb

- **תיאור:** AGENT-244 (`_qa-reports-25/AGENT-244-customer360-wiring.md`) describes a richly wired Customer360 with Breadcrumb, NextActionCard, audit log, and 4 actions. The actually-shipped component at `techno-kol-ops/client/src/pages/360/Customer360.tsx:1-30` is a 30-line baseline that calls `supabase.rpc("get_customer_360_fast")` and contains zero `Breadcrumb` import.
- **שלבים:** `head -30 techno-kol-ops/client/src/pages/360/Customer360.tsx`; `grep "Breadcrumb" techno-kol-ops/client/src/pages/360/Customer360.tsx` (empty).
- **בפועל:** No "Where am I?" answer on Customer360, conflicting with CLAUDE.md "No Dead Pages Rule".
- **צפוי:** Customer360 wraps in `<Page360Layout breadcrumbs={...}>` (the layout used by PO/Project/Quote/WorkOrder 360).
- **חומרה:** MEDIUM (P0 page violates explicit project rule).
- **מודול:** `techno-kol-ops/client/src/pages/360/Customer360.tsx`.
- **תיקון:** import `Page360Layout` (or `shared360.tsx`) and pass `breadcrumbs={[{label:"בית",to:"/"},{label:"לקוחות",to:"/customers"},{label:data.legal_name}]}`. Same fix needed for `Supplier360.tsx`, `RFQ360.tsx`, `Finance360.tsx`, `Employee360.tsx` (all five lack the layout import — ran `grep -L "Page360Layout" techno-kol-ops/client/src/pages/360/*.tsx`).

## ISSUE-307-05 — `validate-env.js` warns on CHANGE_ME but is not run at boot

- **תיאור:** `onyx-procurement/scripts/validate-env.js` knows about `CHANGE_ME`, but the script is opt-in (`npm run validate-env`) and not invoked from `server.js` startup. The boot path therefore still accepts placeholder secrets.
- **שלבים:** `grep "validate-env\|validateEnv" onyx-procurement/server.js` → no hit.
- **בפועל:** server starts with placeholder secrets; only the `jwt-helper.js` lazy denylist catches them on first sign/verify, after the listener is up.
- **צפוי:** fast-fail on boot if a known-weak secret is set.
- **חומרה:** MEDIUM.
- **מודול:** `onyx-procurement/server.js` ~ line 52 (right after `dotenv` is loaded).
- **תיקון:** `if (process.env.NODE_ENV === 'production') require('./scripts/validate-env')();` immediately after `dotenv.config()`.

---

## VERIFICATIONS PASSED (no issue)

### V-1. Orchestrator preconditions (3 fixes)

Ran a sanity script that loads `ORCHESTRATIONS` and `STATE_MACHINES` and asserts every `status_in`/`status_is` precondition references a state declared in the entity's machine.

- `project.create_work_order` → preconditions `[approved, in_planning, in_procurement]` — all exist on `STATE_MACHINES.project.states`. ✅
- `rfq.convert_to_po` → precondition `approved` — exists on `STATE_MACHINES.rfq.states`. ✅
- `work_order.signoff` → precondition `completed` — exists on `STATE_MACHINES.work_order.states`. ✅
- Total mismatches across all 18 orchestrations: **0**.

### V-2. Payroll port 5173

`payroll-autonomous/vite.config.js:50` shows `port: 5173`. PWA manifest at line 22-23 keeps `lang: 'he'`, `dir: 'rtl'`. ✅

### V-3. dotenv loading

- `onyx-ai/src/index.ts:67` — `import 'dotenv/config';` (with comment "FIX from Agent 03 audit — was declared in deps but never imported"). ✅
- `onyx-procurement/server.js:52` — `require('dotenv').config();`. ✅

### V-4. dir=rtl on root HTML

`grep -c 'dir="rtl"' erp-app/index.html payroll-autonomous/index.html onyx-ai/index.html techno-kol-ops/client/index.html` → 1 each (4/4). ✅

### V-5. CI branches in `ci.yml`

Lines 5 + 7 confirmed `branches: [main, master]` on both `push` and `pull_request`; `timeout-minutes: 30` set on the two largest jobs and `20` on `unit-tests`. ✅

### V-6. form-validation hook aliases

`erp-app/src/hooks/use-form-validation.tsx:42, 46, 49` declare the typed aliases; lines 155, 158, 160 wire them to the original implementations. Returned `inputProps` slot includes `aria-invalid`, `aria-describedby`, `aria-required`, and a `ref` callback for first-invalid-field auto-focus. ✅

### V-7. sales_order state machine

- JS layer: `onyx-procurement/src/pipeline/state-machines.js:61-121` — full 8-status machine + 11 trigger sets + UI badges (Hebrew + English).
- DB layer: `supabase/migrations/00084_sales_order_state_machine.sql:31-66` — drops old check, backfills `in_fulfillment` → `in_production`, re-adds canonical CHECK, and persists transitions in a metadata table for RPC consumption. ✅

### V-8. Breadcrumb component

`techno-kol-ops/client/src/components/Breadcrumb.tsx` is a 100-line, ARIA-clean, schema.org-microdata, RTL-correct React component. Used by `shared360.tsx` and four 360 pages. ✅ (partial wiring — see ISSUE-307-04).

---

## DELTA SUMMARY

| Severity | Count | Items |
|---|---|---|
| HIGH | 1 | ISSUE-307-01 (security.yml + deploy-preview.yml branches not bumped) |
| MEDIUM | 4 | 307-02, 307-03, 307-04, 307-05 |
| Verified clean | 8 | V-1 ... V-8 |

**No regressions** were introduced by PR #63 — every code change either landed correctly or is missing only follow-through wiring. The single HIGH issue is purely a CI-config oversight: master branch is now the active branch (per `git status`) but two of three workflow files still gate on `[main]`.

---

## RECOMMENDED FOLLOW-UP

1. **30-minute fix** — patch `.github/workflows/security.yml` and `.github/workflows/deploy-preview.yml` to add `master` to `branches:`; flip `audit-level` to `high`.
2. **30-minute fix** — replace 7 `CHANGE_ME` literals in `manifest-generator.js` with `__REPLACE_VIA_KUBECTL__` (or thread via cfg).
3. **2-hour fix** — wire `Page360Layout` + `Breadcrumb` into the remaining 5 360 pages (Customer, Supplier, RFQ, Finance, Employee).
4. **2-hour fix** — port the AGENT-244 Customer360 design into the live `techno-kol-ops/client/src/pages/360/Customer360.tsx`, or explicitly mark AGENT-244 as a design doc with no implementation yet.
5. **1-hour fix** — parameterize VAT in `tests/e2e/fixtures.js` and the two `test/*.test.js` files with hard-coded 0.17.
6. **1-hour fix** — invoke `validate-env.js` on prod boot in `onyx-procurement/server.js`.

Total cleanup: ≈ 6.5 hours of focused work to take PR #63 from "mostly fixed" to "fully fixed".
