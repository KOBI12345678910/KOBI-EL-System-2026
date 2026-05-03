# AGENT-FIX-TEST-SCRIPTS — Applied

**Date:** 2026-04-29
**Scope:** Wire `npm test` into 4 packages that previously had no test script.

## Scripts added

| Package | `package.json` change | Runner picked because |
|---|---|---|
| `api-server/package.json` | added `"scripts": { "test": "vitest run --reporter=default" }` | `vitest.config.ts` already exists; tests under `src/__tests__/**/*.test.ts` import from `vitest`; `vitest` binary present in root `node_modules/.bin/`. |
| `techno-kol-ops/package.json` | added `"test": "node --test --test-reporter=spec test/**/*.test.js src/**/*.test.js"` | All existing tests (`test/smoke.test.js`, `test/workOrders.routes.test.js`, `src/auth/jwt-helper.test.js`, `src/config/env.test.js`) use `require('node:test')`. No vitest config in this workspace. |
| `packages/shared-tax/package.json` | added `"test": "node --test --test-reporter=spec test/**/*.test.js"` + new `test/vat.test.js` smoke (6 cases against compiled `dist/vat.js`: `getVatRate` for 2025/2026, `calculateVat`, `reverseVat`, `VAT_RATE_CURRENT`). | Package only ships TS + compiled JS; avoids adding vitest devDep. |
| `packages/shared-events/package.json` | **created** (`@techno-kol/shared-events@0.1.0`, `main: index.js`) with `"test": "node --test --test-reporter=spec test/**/*.test.js"` + new `test/barrel.test.js` smoke (5 cases: `createEvent`, `TOPIC_MAP`, `EventProducer/Consumer`, idempotency helpers, package.json self-check). | Pure CommonJS package — `index.js` already the natural entrypoint; no runner deps needed. |

## Packages now testable

All 4 packages run `npm test` without "Missing script" — verified with `cd <pkg> && npm test`.

## Exit codes per run

| Package | exit | Notes |
|---|---|---|
| `packages/shared-events` | **0** | 5/5 pass (barrel exports + idempotency self-check). |
| `packages/shared-tax` | **0** | 6/6 pass (VAT 18%/17% rate logic, calc, reverse). |
| `techno-kol-ops` | **1** | 14/16 pass. 2 pre-existing legacy test files (`src/auth/jwt-helper.test.js`, `src/config/env.test.js`) are hand-rolled IIFE runners that call `process.exit(1)` on their own assertions — not new regressions. The new `test/smoke.test.js` and `test/workOrders.routes.test.js` both pass. |
| `api-server` | **1** | All 11 vitest files load. Collection fails on each with `Cannot find module '../../tsconfig.base.json'` — a pre-existing repo-level missing file (unrelated to wiring). The script itself runs vitest correctly and produces honest output. |

## Idempotency

Re-ran `shared-events` and `shared-tax` twice — same exit 0. Re-running the script a second time mutates nothing (scripts are simple, no install side-effects).

## Constraints honoured

- **No new devDependencies.** vitest already in root `node_modules`; node's built-in `node:test` covers the rest.
- **Idempotent.** All edits are additions to existing JSON keys or new files; safe to apply twice.
- **Honest exit codes.** Two packages legitimately exit 1 because tests really fail (pre-existing issues); two exit 0.

## Files touched

- `api-server/package.json` (added `scripts.test`)
- `techno-kol-ops/package.json` (added `scripts.test`)
- `packages/shared-tax/package.json` (added `scripts.test`)
- `packages/shared-tax/test/vat.test.js` (new — smoke)
- `packages/shared-events/package.json` (new file)
- `packages/shared-events/test/barrel.test.js` (new — smoke)
