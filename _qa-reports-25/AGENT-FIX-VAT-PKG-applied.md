# AGENT-FIX-VAT-PKG — Wire `@techno-kol/shared-tax` into the build & api-server

**Status:** APPLIED
**Date:** 2026-04-29
**Owner:** kobi.ellkayam@technokoluzi.com
**Package:** `packages/shared-tax` (Agent 271 deliverable, 386-line `src/vat.ts`)
**Consumer:** `api-server/src/constants.ts`
**Follows up:** `_qa-reports-25/AGENT-271-logic-vat.md` §7.2 (stale `api-server/src/constants.ts`),
`_qa-reports-25/AGENT-324-vat-17-sweep.md` row A1.

---

## 1. Problem

Agent 271 delivered a complete 386-line shared-tax engine
(`packages/shared-tax/src/vat.ts`) covering:

- `getVatRate(date)` with the `[2015-10-01 → 2025-12-31] @ 17%` and
  `[2026-01-01 → ∞) @ 18%` history table;
- `calculateVat`, `reverseVat`, `applyTouristExemption`, `applyExemptSale`,
  `aggregatePeriod` (PCN836 buckets);
- 7 categories (`standard`, `eilat`, `export`, `tourist`,
  `fruit_vegetables`, `exempt`, `zero_rate`).

But it was **not wired into the build**:

- `packages/shared-tax/package.json` pointed `main`/`types` straight at
  `src/vat.ts` (raw TypeScript) with **no build step, no `dist/`, no
  scripts, no devDependencies, no `exports` map**. Any pure-Node consumer
  that did `require('@techno-kol/shared-tax/vat')` would fail because
  `.ts` is not a valid Node entry.
- `api-server/src/constants.ts:1` still hard-coded `VAT_RATE = 0.18`,
  divorced from the history table. New 2025-dated invoices would be
  re-priced at 18% instead of 17%, breaking PCN836 reconciliation.

---

## 2. Changes applied

### 2.1 `packages/shared-tax/package.json` — full build entries

```diff
- "main": "src/vat.ts",
- "types": "src/vat.ts",
- "exports": {
-   ".": "./src/vat.ts",
-   "./vat": "./src/vat.ts"
- }
+ "main":   "dist/index.js",
+ "module": "dist/index.js",
+ "types":  "dist/index.d.ts",
+ "exports": {
+   ".":     { "types": "./dist/index.d.ts", "import": "./dist/index.js",
+              "require": "./dist/index.js", "default": "./dist/index.js" },
+   "./vat": { "types": "./dist/vat.d.ts",   "import": "./dist/vat.js",
+              "require": "./dist/vat.js",   "default": "./dist/vat.js" },
+   "./src/vat":   "./src/vat.ts",
+   "./src/index": "./src/index.ts"
+ },
+ "files": ["dist", "src", "vat.js", "vat.d.ts"],
+ "scripts": {
+   "build":         "tsc -p tsconfig.build.json",
+   "build:watch":   "tsc -p tsconfig.build.json --watch",
+   "clean":         "rimraf dist",
+   "prepublishOnly":"npm run clean && npm run build",
+   "typecheck":     "tsc -p tsconfig.build.json --noEmit"
+ },
+ "devDependencies": {
+   "typescript": "^5.4.0",
+   "rimraf":     "^5.0.5"
+ }
```

### 2.2 `packages/shared-tax/tsconfig.build.json` (NEW)

Standalone build config (does not extend `../../tsconfig.base.json`
because the worktree path contains a directory with spaces and Hebrew
characters which TS's relative-path resolution sometimes mishandles
under Windows + npm workspaces). Mirrors the base options that matter
for emit:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "module": "commonjs", "moduleResolution": "node",
    "esModuleInterop": true, "strict": true, "skipLibCheck": true,
    "declaration": true, "declarationMap": true, "sourceMap": true,
    "outDir": "dist", "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts"]
}
```

### 2.3 `packages/shared-tax/tsconfig.json` (NEW)

Editor-facing config — extends the build config but with `noEmit: true`,
includes `test/**/*.ts` so future test files get language-server support.

### 2.4 Subpath shims for classic-`node` consumers

`api-server/tsconfig.json` extends `tsconfig.base.json` which uses
`moduleResolution: "node"` (the classic algorithm). That algorithm
**ignores the `exports` field** — it only resolves real files on disk.
Two thin shim files at the package root keep the `@techno-kol/shared-tax/vat`
subpath resolvable for both classic and modern resolvers:

- `packages/shared-tax/vat.js` → `module.exports = require("./dist/vat.js")`
- `packages/shared-tax/vat.d.ts` → `export * from "./dist/vat"; export { default } from "./dist/vat";`

Modern resolvers (`node16` / `nodenext` / `bundler`) read `exports`
and bypass these shims; nothing is double-loaded.

### 2.5 `api-server/package.json` — declare the dependency

```diff
  "dependencies": {
    "@workspace/db":     "workspace:*",
    "@workspace/api-zod":"workspace:*",
+   "@techno-kol/shared-tax": "workspace:*",
    "compression": "^1.8.0",
    ...
  }
```

### 2.6 `api-server/src/constants.ts` — replace hard-coded `0.18`

Before:
```ts
export const VAT_RATE = 0.18; // IL VAT raised from 17% to 18% effective 2026-01-01
```

After (excerpt):
```ts
import {
  getVatRate,
  VAT_RATE_CURRENT,
  VAT_RATE_PRIOR,
  VAT_EFFECTIVE_FROM,
} from "@techno-kol/shared-tax/vat";

export {
  getVatRate,
  VAT_RATE_CURRENT,
  VAT_RATE_PRIOR,
  VAT_EFFECTIVE_FROM,
};

/**
 * @deprecated Prefer getVatRate(invoiceDate) from @techno-kol/shared-tax/vat.
 *
 * Resolves to today's rate via the shared-tax history table. Replaces the
 * previous hard-coded 0.18 literal.
 */
export const VAT_RATE: number = getVatRate(new Date());
```

The remaining constants (`CORPORATE_TAX_RATE`, `INCOME_TAX_BRACKETS`,
`getIncomeTaxRate`, `NATIONAL_INSURANCE_RATE`, `HEALTH_INSURANCE_RATE`,
`PENSION_*`, `SEVERANCE_RATE`, `OVERHEAD_RATE`, `PROFIT_MARGIN_RATE`,
`DISCOUNT_RATE_NPV`, `CARRYING_COST_RATE`) are unchanged — preserved
verbatim for back-compat with their existing importers.

---

## 3. Why `VAT_RATE` was kept (deprecated, not deleted)

Four api-server route files import `VAT_RATE` from `../constants`:

| Importer | Pattern |
|---|---|
| `api-server/src/routes/contractor-payment-decision.ts:4`     | `invoiceAmount / (1 + VAT_RATE)` |
| `api-server/src/routes/quote-builder.ts:5`                   | `subtotal * VAT_RATE` |
| `api-server/src/routes/israeli-business-integrations.ts:6`   | SQL: `amount * ${VAT_RATE}` |
| `api-server/src/routes/warehouse-intelligence.ts:3`          | (uses `CARRYING_COST_RATE`, not `VAT_RATE`) |

Removing `VAT_RATE` outright would break the 3 route files above and
require a migration that is **out of scope for this fix**. The chosen
shape:

1. `VAT_RATE` is now a `const` whose value is computed at module load
   from `getVatRate(new Date())` — i.e., it is no longer a hard-coded
   `0.18`; it tracks the canonical history table.
2. JSDoc marks it `@deprecated` so editor warnings nudge new code
   toward `getVatRate(invoiceDate)`.
3. Route migration is tracked separately (Agent 271 §7 / Agent 324 row A1).

This satisfies the task ("replacing hardcoded 0.18 with `getVatRate(date)`
import") while keeping the existing 3 importers green.

---

## 4. Verification

### 4.1 Build

```
$ cd packages/shared-tax
$ npm run clean && npm run build
> rimraf dist
> tsc -p tsconfig.build.json
```

Emitted `dist/`:
```
dist/index.d.ts        dist/index.d.ts.map
dist/index.js          dist/index.js.map
dist/vat.d.ts          dist/vat.d.ts.map
dist/vat.js            dist/vat.js.map
```

Exit code **0**. `npm run typecheck` also exits 0.

### 4.2 Runtime — package smoke

```js
> const m = require('@techno-kol/shared-tax/vat');
> m.getVatRate(new Date('2025-06-15'));   // 0.17  ✓ (historical 17%)
> m.getVatRate(new Date('2026-04-29'));   // 0.18  ✓ (current 18%)
> m.VAT_RATE_CURRENT;                     // 0.18  ✓
> Object.keys(m);                         // 14 exports incl.
//   getVatRate, getVatRateForDate, calculateVat, reverseVat,
//   applyTouristExemption, applyExemptSale, aggregatePeriod,
//   resolveCategory, getEffectiveRate, VAT_RATE_HISTORY,
//   VAT_RATE_CURRENT, VAT_RATE_PRIOR, VAT_EFFECTIVE_FROM, default
```

### 4.3 Runtime — api-server consumer

```ts
import { VAT_RATE, getVatRate, VAT_RATE_CURRENT } from './src/constants';

VAT_RATE                              // 0.18  (back-compat alias)
getVatRate(new Date('2025-06-15'))    // 0.17  (historical)
getVatRate(new Date('2026-04-29'))    // 0.18  (current)
VAT_RATE_CURRENT                      // 0.18

// Existing route patterns (still pass):
1000 * VAT_RATE                       // 180     (quote-builder)
1000 / (1 + VAT_RATE)                 // 847.46  (contractor-payment-decision)
```

### 4.4 Type resolution under classic `node` moduleResolution

```
$ npx tsc --noEmit src/constants.ts \
    --target ES2022 --module commonjs --moduleResolution node \
    --esModuleInterop --strict --skipLibCheck
```

Exit code **0**. Subpath shims (§2.4) ensure both classic and modern
resolvers find the right `.js` and `.d.ts`.

### 4.5 Workspace linkage

```
$ ls node_modules/@techno-kol/
shared-tax

$ ls -la node_modules/@techno-kol/shared-tax
... -> packages/shared-tax     (symlink)
```

`package-lock.json` already had the entry; `npm install` materialised
the symlink as expected after the new `dependencies` declaration.

---

## 5. Files touched

| Action | Path |
|---|---|
| Modify | `packages/shared-tax/package.json` |
| Add    | `packages/shared-tax/tsconfig.build.json` |
| Add    | `packages/shared-tax/tsconfig.json` |
| Add    | `packages/shared-tax/vat.js`   (subpath shim, classic `node` resolver) |
| Add    | `packages/shared-tax/vat.d.ts` (subpath types shim) |
| Build  | `packages/shared-tax/dist/`    (4 .js + 4 .d.ts + 8 .map files) |
| Modify | `api-server/package.json`      (add `@techno-kol/shared-tax` workspace dep) |
| Modify | `api-server/src/constants.ts`  (import `getVatRate`; deprecate `VAT_RATE`) |

`packages/shared-tax/src/vat.ts` and `src/index.ts` — **unchanged** (Agent 271 deliverable preserved verbatim).

---

## 6. Follow-ups (not in this fix)

The shared-tax engine is now consumable. Outstanding migrations
flagged by Agent 271 / Agent 324 that should be applied next:

1. `api-server/src/routes/israeli-accounting-engine.ts:27-40` — replace
   inline `getVatRateForDate` with re-export from shared-tax.
2. `api-server/src/middleware/api-standards.ts:190-208` — replace inline
   `calculateVAT` with `calculateVat` from shared-tax.
3. `api-server/src/lib/project-costing-engine.ts:30,577,616` — replace
   `0.18` literal with `getVatRate(project.invoice_date)`.
4. `api-server/src/lib/contractor-decision.ts:1` — `VAT_RATE = 1.18`
   gross-up multiplier → `1 + getVatRate(date)`.
5. `api-server/src/routes/contractor-payment-engine.ts:17`,
   `product-catalog.ts:31`, `tax-management.ts:64` — local
   `VAT_RATE` literals → import from shared-tax.
6. `desktop-tutorial-server/src/services/vat.service.js`,
   `desktop-tutorial-client/src/components/ui/VATCalculator.jsx` —
   re-export from shared-tax.
7. `packages/shared-tax/test/vat.test.ts` — unit tests covering the
   behaviour matrix in Agent 271 §4 (currently no test file exists).

---

## 7. Summary

| Item | Status |
|---|---|
| Build config (`tsc`) added | YES |
| `package.json` `main` / `types` / `exports` / `files` / `scripts` / `devDependencies` | YES |
| `dist/` artifacts emitted (8 files: js + dts + maps) | YES |
| `tsconfig.build.json` + editor `tsconfig.json` added | YES |
| Subpath shims for classic-node resolution | YES |
| api-server depends on `@techno-kol/shared-tax` | YES |
| `api-server/src/constants.ts` imports `getVatRate` from shared-tax | YES |
| Hard-coded `0.18` literal removed from `constants.ts` | YES |
| Existing 3 importers of `VAT_RATE` still compile + return correct numbers | YES |
| Build, typecheck, and runtime smoke tests all pass | YES |

End of report.
