# AGENT-164: ESM vs CJS Module System Audit

**Date:** 2026-04-29
**Scope:** Module system consistency across all services in the Techno-Kol Uzi ERP 2026 monorepo.
**Verdict:** MIXED — services use inconsistent module systems with multiple known friction points.

## 1. Service-Level Module System Map

| Service | `package.json` `type` | Source language | tsconfig `module` | Verdict |
|---|---|---|---|---|
| `onyx-procurement` | (unset = CJS) | JS (CommonJS) | n/a | Pure CJS, consistent |
| `onyx-ai` | `commonjs` (explicit) | TypeScript | `commonjs` (ES2022 target) | CJS + tsc → consistent |
| `techno-kol-ops` | (unset = CJS) | TypeScript | `commonjs` (ES2020) | CJS via `tsx` runtime |
| `payroll-autonomous` | `module` (ESM) | JSX (Vite) | n/a (bundler) | ESM front-end |
| `api-server` | `module` (ESM) | TypeScript | (NodeNext implied via tsx) | ESM + esbuild bundle to `.mjs` |
| `nexus_engine` | `commonjs` (explicit) | JS | n/a | Pure CJS |
| `paradigm_engine` | (unset = CJS) | JS | n/a | Pure CJS |
| `vm-task-runner` | `commonjs` (explicit) | JS | n/a | Pure CJS |
| `packages/technokoluzi-erp` | `module` (ESM) | tsx server | n/a (Vite/tsx) | ESM root |
| Root `package.json` | (unset = CJS) | n/a | n/a | Acts as workspace root |

## 2. .mjs / .cjs Files

Only one non-`node_modules` `.mjs` file exists in the actual service code:

- `api-server/build.mjs` — esbuild build script. Forced `.mjs` because the surrounding `api-server` is `type: module` and the file uses `import.meta.url` + `createRequire`. **Correct usage.**

No `.cjs` files exist outside `node_modules`. No services use `.cjs` to selectively opt out of ESM despite some using `type: module`.

## 3. ESM-Mode Files Using `require()` (HIGH RISK)

### 3.1 `onyx-ai` (declared `type: commonjs`, but TS files mix patterns)
File `onyx-ai/src/health.ts` line 84, `onyx-ai/src/index.ts` lines 2333 and 2990 use `require()` inside TypeScript that emits to CJS — **OK** because tsconfig `module: "commonjs"` matches `package.json`. These are intentional dynamic loads (for `package.json` version reading) and work correctly. Comments confirm awareness ("avoids a hard require so this still compiles when package.json is not on the runtime path").

However, the source mixes both paradigms — 28 `import ... from` statements across 13 TS files alongside `require()` calls. Since output is CJS, this works (ESM imports are transpiled by tsc), but it is stylistically inconsistent.

### 3.2 `payroll-autonomous` (declared `type: module`)
Two real risks here:

- `payroll-autonomous/src/components/BIDashboard.test.jsx:101,225` — calls `require('@testing-library/react')` and `require('react-dom/server')` inside an ESM-typed package. **Will fail** under native Node ESM but works under Vitest because Vitest provides a CJS-compatible `require()` shim. Vitest-only.
- `payroll-autonomous/src/components/SalesLeaderboard.jsx:44` — does `engine = require('../../../onyx-procurement/src/sales/leaderboard.js')` to dual-import a CJS engine from across services. The author flagged this in a comment: "CommonJS context (tests), require() works; when imported via bundler ...". Vite handles this via interop, but **this is a cross-service ESM-to-CJS leak that will break** if the import boundary is ever dynamically loaded by Node directly.

### 3.3 `api-server` (declared `type: module`)
Multiple `require()` calls inside TS files that emit ESM:

- `api-server/src/app.ts:1150-1151` — `require("./middleware/auth-allowlist")`, `require("./middleware/auth")`
- `api-server/src/lib/edi-processor.ts:66` — `require("ssh2-sftp-client")`
- `api-server/src/lib/openapi-spec.ts:229` — `require("../routes/entity-crud-registry")`
- `api-server/src/routes/edi.ts:159`, `routes/kobi/tools.ts:268` — additional native CJS requires.

These rely on the `globalThis.require = createRequire(import.meta.url)` shim **only injected at build time** by `build.mjs`. Under `tsx` dev mode (which interprets via esbuild loader) these may also work, but **running raw compiled output without the banner injection would crash**. This is a structural fragility, not a runtime bug today.

### 3.4 `api-server/src/middleware/error-handler.ts` — defensive mixing
Lines 7-8 contain dual-mode shims: `typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url)`. This means the file is intentionally written to run in both CJS and ESM contexts — strong evidence the codebase has historical churn between the two systems.

## 4. Top-Level Await

Located only in `api-server/src/lib/kimi-test.ts` (10+ instances). Safe because:
- File is in an ESM-typed package (`api-server` has `type: module`)
- TypeScript target is ES2022 which supports TLA
- Used only for test scaffolding, not in the import graph of `app.ts`

No top-level await found in `payroll-autonomous` or other ESM-typed packages.

## 5. Dynamic `await import()` Usage

23+ dynamic imports in `api-server` source — concentrated in:
- `src/app.ts:1211` — lazy `database-hardening` import
- `src/lib/action-executors.ts:208,275,322,343,387` — circular-dep avoidance via late binding
- `src/routes/ai-orchestration/orchestrator.ts:78,101,133` — provider SDKs (Anthropic, OpenAI, Google) loaded on demand
- `src/routes/auth.ts:437,442,450,504` — `@workspace/db` lazy-loaded (suggests circular dep with shared workspace package)
- `src/__tests__/unit/auth.test.ts` — `node:crypto` lazy import in tests

The frequency of `await import("@workspace/db")` in `auth.ts` (4 occurrences in the same file) is a **code smell** suggesting the static import path triggers a circular dependency. Should be refactored to a single top-of-file import, or the cycle eliminated.

## 6. tsconfig `module` Field Inventory (active services only)

| File | `module` setting | Notes |
|---|---|---|
| `tsconfig.base.json` (root) | `commonjs` | Root default |
| `onyx-ai/tsconfig.json` | `commonjs` | Matches `type: commonjs` — OK |
| `techno-kol-ops/tsconfig.json` | `commonjs` | Matches default `type` (CJS) — OK |
| `techno-kol-ops/client/tsconfig.json` | `ESNext` | Vite client — OK |
| `api-server/tsconfig.json` | (extends base) | Extends `tsconfig.base.json` (commonjs) but `package.json` says `type: module` — **MISMATCH** |
| `erp-app/tsconfig.json` | `ESNext` | Vite client — OK |
| `packages/technokoluzi-erp/tsconfig.base.json` | `ESNext` | OK |

**The `api-server` tsconfig/package.json mismatch is the most critical finding**: tsc would emit CJS while Node treats `.js` files as ESM. This works only because the actual build path is `build.mjs` → esbuild → `.mjs`, never raw `tsc`. If anyone runs `tsc` directly to produce `.js` output, every emitted file will fail at module load.

## 7. CJS Files Using ESM Patterns

`onyx-procurement` (CJS) has 250+ files with `module.exports` and 250+ with `require()` — fully consistent CJS. No `import` statements found in `.js` files. Clean.

`nexus_engine` (CJS): 24+ files with `require`, all consistent.

## 8. Critical Findings Summary

| # | Severity | Issue | File(s) |
|---|---|---|---|
| 1 | HIGH | `api-server` is `type: module` but extends `tsconfig.base.json` with `module: commonjs` — only works because `build.mjs` overrides | `api-server/tsconfig.json`, `api-server/package.json`, `tsconfig.base.json` |
| 2 | HIGH | `payroll-autonomous` (ESM) calls `require()` cross-service into `onyx-procurement` (CJS) | `payroll-autonomous/src/components/SalesLeaderboard.jsx:44` |
| 3 | MEDIUM | 7+ `require()` calls in `api-server` ESM TypeScript rely on banner-injected shim | `api-server/src/app.ts`, `lib/edi-processor.ts`, `routes/edi.ts`, etc. |
| 4 | MEDIUM | 4x `await import("@workspace/db")` in single file suggests circular dep | `api-server/src/routes/auth.ts:437-504` |
| 5 | LOW | `error-handler.ts` carries dual CJS/ESM shims — leftover from migration | `api-server/src/middleware/error-handler.ts:7-8` |
| 6 | LOW | `payroll-autonomous` test file uses `require()` in ESM jsx — Vitest-only | `payroll-autonomous/src/components/BIDashboard.test.jsx:101,225` |
| 7 | LOW | `onyx-ai` mixes `import` + `require()` in same file (works but inconsistent) | `onyx-ai/src/health.ts`, `onyx-ai/src/index.ts` |

## 9. Recommendations

1. **`api-server`**: Add an explicit `tsconfig.json` override of `compilerOptions.module = "NodeNext"` to align with `type: module`, OR add a comment that the canonical build path is `build.mjs` and `tsc` direct output is unsupported.
2. **`payroll-autonomous`**: Replace `require('../../../onyx-procurement/...')` cross-service import with a published workspace package (`@workspace/sales-engine`) and use ESM `import`. Same for tests — switch to ESM `import` everywhere.
3. **`api-server`**: Audit the 7 `require()` sites in ESM TS — convert to `await import()` or static `import` where possible.
4. **`api-server/auth.ts`**: Refactor the 4x lazy `@workspace/db` imports to a single top-of-file static import; resolve the underlying circular dep.
5. **`onyx-ai`**: Standardize on `require()`-only or `import`-only since output is CJS; pick one and remove the other for cleanliness.
6. Consider a repo-wide policy doc clarifying which services are ESM, which are CJS, and the expected interop pattern.
