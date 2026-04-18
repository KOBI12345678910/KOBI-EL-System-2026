# FOUNDATION FIX REPORT — Safe Subset

| Field | Value |
|---|---|
| Date | 2026-04-18 |
| Batch | `B-BATCH-FOUNDATION-FIX-01` |
| Mode | Safe subset (items 1, 2, 4, 7, 8, 9, 10) |
| Blocked | Items 3, 5, 6 (auth global mount, VAT literals, AR/AP asymmetry) |
| Changelog IDs | C015–C020 |
| Decision IDs | B-D030–B-D035 |

---

## 1. Summary

- **4 fixes applied** (tsconfig base, ai-agents comma, JWT fail-fast, erp-app dep verify)
- **3 items blocked** with full decision-log entries requiring human sign-off
- **2 verification checks** passed (workspace duplicates, .env leak)
- **1 parseability check** passed (App.tsx, notes on --jsx/project-config context)

---

## 2. Per-fix detail

### Fix 1 — `tsconfig.base.json` at repo root (C015, B-D034)

**File:** `C:/Users/kobi/Projects/techno-kol-uzi-2026/tsconfig.base.json`  (NEW)

**Before:** File did not exist. `api-server/tsconfig.json` `extends` resolved to missing file:
```
error TS5083: Cannot read file 'C:/Users/kobi/Projects/tsconfig.base.json'.
```

**After:** Created at repo root with strict-mode preset (ES2022, `strict:true`, `noImplicitReturns:true`, `allowSyntheticDefaultImports:true`, `resolveJsonModule:true`).

**Risk:** Low for new code. Introduces `strict:true` baseline — downstream packages that later `extends` this will inherit strict checks; any package already wired to it will see new errors. Mitigation: only apply per-package by explicit `extends`, one package at a time.

**Path-drift note:** `api-server/tsconfig.json` has `"extends": "../../tsconfig.base.json"`. From `techno-kol-uzi-2026/api-server/` that resolves to `C:/Users/kobi/Projects/tsconfig.base.json` (one level **outside** repo root). Pre-existing bug. **Not changed this pass** per directive. Follow-up action: flip to `"../tsconfig.base.json"`.

### Fix 2 — Syntax error in `ai-agents-system.ts` (C016)

**File:** `api-server/src/routes/ai-agents-system.ts:257`

**Before:**
```ts
        autonomy_level: "advisory"
      }
      // ─── 20 QA Testing Agents ─────────────────────────────────────
      {
        agent_key: "qa_terminal_runtime",
```

**After:**
```ts
        autonomy_level: "advisory"
      },
      // ─── 20 QA Testing Agents ─────────────────────────────────────
      {
        agent_key: "qa_terminal_runtime",
```

**Change:** Added trailing comma to close the `ceo_advisor` agent object literal before the next element of the outer array.

**Risk:** Zero. Syntactic only, no runtime behaviour changed — the object literal was always intended to be an array element.

**Evidence:** `error TS1005: ',' expected.` at `src/routes/ai-agents-system.ts(259,7)` cleared after fix.

### Fix 4 — JWT / ENCRYPTION_KEY fail-fast (C017, B-D035)

**File:** `api-server/src/lib/security-upgrade.ts:15-25`

**Before:**
```ts
/** מפתח סודי ל-JWT - נטען ממשתנה סביבה */
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_change_in_production_2026";

/** מפתח הצפנה לסודות 2FA */
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default_encryption_key_32chars!!";
```

**After:**
```ts
/** מפתח סודי ל-JWT - נטען ממשתנה סביבה (חובה) */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required. Set it in .env before starting the server.");
}

/** מפתח הצפנה לסודות 2FA (חובה) */
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable is required. Set it in .env before starting the server.");
}
```

**Risk:** Medium — Operational: any environment that was booting without `JWT_SECRET` or `ENCRYPTION_KEY` set will now fail at server start. This is intentional (fail-closed). Dev/test/CI must set both env vars (even with a test value) before the module is imported.

**Type safety:** TypeScript narrows `string | undefined` → `string` at module scope after the guard. Downstream usages at lines 66, 172, 183, 409 remain type-safe.

### Fix 7 — `erp-app` package.json deps (C018)

**File:** `erp-app/package.json`

**Verified present:**
- `@tailwindcss/typography: ^0.5.15` (devDependencies:82)
- `wouter: ^3.3.5` (dependencies:74)

**No changes required.** Both dependencies already declared correctly.

**wouter vs react-router check:** `grep` shows only `wouter` imports across erp-app routing files (`App.tsx`, `routes/production-routes.tsx`, `routes/sales-routes.tsx`). No react-router usage detected. Canonical router is `wouter`. No mismatch.

### Fix 8 — Workspace package duplicates (verification)

**Command:**
```bash
ls C:/Users/kobi/Projects/techno-kol-uzi-2026/packages/*/package.json
```

**Result:**
```
packages/erp-upload/package.json        → "name": "technokoluzi-erp"
packages/technokoluzi-erp/package.json  → "name": "techno-kol-uzi"
```

**Status:** No package is named `"workspace"`. The two sibling packages use distinct names. Note: `packages/erp-upload/` is named `technokoluzi-erp` and `packages/technokoluzi-erp/` is named `techno-kol-uzi` — folder names and package names do not align, which is confusing but not a `workspace:*` collision. Out of scope for this pass.

### Fix 9 — `.env` leak check (verification)

**Command:**
```bash
git ls-files | grep -E '\.env$|\.env\..*$' | grep -v example
```

**Result (only non-`example` match):**
```
_merge-staging-final/KOBI-EL-System-2026-master/.../scripts/gcp/secrets.template.env
scripts/gcp/secrets.template.env
```

Both files are templates (`.template.env`) — they are tracked by design, not real secrets. No real `.env` or `.env.local` is tracked.

**`.gitignore` verification:** matches for `.env` and `.env.local` confirmed present.

**Status:** Clean. No secret leakage risk detected.

### Fix 10 — App.tsx parseability (verification)

**Command:**
```bash
cd erp-app && npx --no-install tsc --noEmit --skipLibCheck src/App.tsx
```

**Result:** No `TS1xxx` parse/syntax errors. Errors reported are exclusively:
- `TS2307` — module not found (expected: running tsc on a single file bypasses `tsconfig.json`, so `@/*` path aliases and `wouter` do not resolve).
- `TS6142` — `--jsx` flag not set (expected for the same reason).

**Status:** App.tsx **parses cleanly**. The reported errors are artefacts of the single-file invocation, not real defects.

---

## 3. Blocked items — required for unblock

### B-D030 — authMiddleware global mount
- **Required:** security owner + ops owner sign-off; audit of service-to-service callers; exemption allow-list; staging rollout plan; rollback procedure.
- **Interim:** per-router auth on new commercial / execution / procurement routes.

### B-D031 — 30 VAT literal replacements
- **Required:** accounting owner sign-off; `getVatRateForDate()` historical audit; in-flight-invoice migration plan; posted-entry reconciliation plan.
- **Interim:** new code uses `getVatRateForDate()` already.

### B-D032 — AR/AP gross/net asymmetry
- **Required:** chart-of-accounts owner decision; data migration plan; report regeneration plan.
- **Interim:** new Zod schemas document `amount` semantics explicitly.

Full context in `_master-registry/BUILD_DECISION_LOG.md` §5.

---

## 4. tsc delta measurements

| Target | Before | After | Delta |
|---|---:|---:|---:|
| `api-server/tsconfig.json` | 2 | 7 | +5 (revealed pre-existing errors, no new errors introduced) |
| `erp-app/tsconfig.json` | 13259 | 13259 | 0 |

**api-server explanation:** Before, tsc halted early at the syntax error on line 259. After the comma fix, tsc now traverses the full program, which exposes 5 pre-existing issues masked by the early halt:
- `error TS5083: Cannot read file 'C:/Users/kobi/Projects/tsconfig.base.json'` — pre-existing path drift (`../../` from `api-server/` points **outside** the repo root). Fix at repo root is correct per directive; the api-server tsconfig extends-path is the problem.
- `error TS2688: Cannot find type definition file for 'pdfkit'` — `@types/pdfkit` not installed.
- `error TS6053: File 'C:/Users/kobi/Projects/lib/db' not found` ×5 — project references use the same wrong `../../` pattern and resolve outside the repo.

None of the 5 revealed errors are regressions. They pre-date this change and are documented for follow-up.

**erp-app explanation:** No erp-app source files were modified. 13259 errors before and after, unchanged. Pre-existing.

---

## 5. Files changed

- `C:/Users/kobi/Projects/techno-kol-uzi-2026/tsconfig.base.json` (NEW)
- `C:/Users/kobi/Projects/techno-kol-uzi-2026/api-server/src/routes/ai-agents-system.ts` (1-char edit — added comma)
- `C:/Users/kobi/Projects/techno-kol-uzi-2026/api-server/src/lib/security-upgrade.ts` (fail-fast on env vars)
- `C:/Users/kobi/Projects/techno-kol-uzi-2026/_master-registry/BUILD_DECISION_LOG.md` (append §5, §6; B-D030–B-D035)
- `C:/Users/kobi/Projects/techno-kol-uzi-2026/_master-registry/BUILD_CHANGELOG.md` (append C015–C020)
- `C:/Users/kobi/Projects/techno-kol-uzi-2026/_master-registry/FOUNDATION_FIX_REPORT.md` (this file, NEW)

---

## 6. Validation checklist

- [x] `tsconfig.base.json` exists at repo root
- [x] `ai-agents-system.ts` syntax error cleared (TS1005 gone)
- [x] `security-upgrade.ts` no longer contains fallback default secrets
- [x] `erp-app/package.json` contains `@tailwindcss/typography` + `wouter`
- [x] Packages uniquely named (no `"workspace"` duplicates)
- [x] No real `.env` tracked in git
- [x] `.gitignore` covers `.env`, `.env.local`
- [x] App.tsx parses cleanly (no TS1xxx syntax errors)
- [x] 3 blocked items have full decision-log entries with unblock criteria
- [x] Changelog updated (C015–C020)
- [x] No protected files touched (AUDIT_REAL.md, migrations 00000–00048, RECOVERY_*, QA_AGENT_*, VAT_18_UPDATE.md, MISSING_MODELS_SCAN.md, MERGE_REPORT.md, FINAL_MERGE_REPORT.md)
- [x] tsc delta measured before + after, both numbers reported
- [ ] B-D030 auth global mount — **pending human sign-off**
- [ ] B-D031 VAT literals — **pending accounting review**
- [ ] B-D032 AR/AP asymmetry — **pending accounting + data owner sign-off**

---

## 7. Rollback (if needed)

- `tsconfig.base.json`: delete the new file — no other package extends it yet.
- `ai-agents-system.ts`: remove the comma on line 257 (but this re-introduces the syntax error — not recommended).
- `security-upgrade.ts`: restore the `|| "default_..."` fallbacks (but this re-introduces the insecure default — not recommended; set env vars instead).
- Decision-log / changelog entries: append a retraction row, do not delete.
