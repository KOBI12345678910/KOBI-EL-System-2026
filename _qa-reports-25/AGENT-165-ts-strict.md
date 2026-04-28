# AGENT-165 — TypeScript Strict Mode Audit

> Generated 2026-04-29 by Agent-165
> Scope: per-package `tsconfig*.json` + `*.ts/*.tsx` in production source trees
> Reference: `onyx-ai/TYPESCRIPT_STRICT_PLAN.md` (Agent-19 plan)
> All counts exclude `node_modules/`, `_merge-incoming/`, `_merge-staging-final/`, `_audit_tmp/`

---

## 1. tsconfig inventory

| File | Extends | `strict` | `noImplicitAny` | `strictNullChecks` | Notes |
|------|---------|---------:|----------------:|-------------------:|-------|
| `tsconfig.base.json` (repo root) | — | true | **true** (explicit) | true (explicit) | All 8 strict flags ON. `noUnusedLocals/Params` OFF. |
| `onyx-ai/tsconfig.json` | — | true | **false** (override) | true (via strict) | DEVIATES from base. `noImplicitReturns` also OFF. |
| `onyx-ai/tsconfig.strict.json` | `./tsconfig.json` | true | true | true | Experimental — all 14 strict-family flags ON. Not used in build. |
| `api-server/tsconfig.json` | `../../tsconfig.base.json` | (inherits true) | (inherits true) | (inherits true) | Inherits base. Declares `types: [node, pdfkit]`. |
| `erp-app/tsconfig.json` | — | true | (via strict = true) | (via strict) | Vite/React app. `noUnusedLocals/Params` OFF. |
| `techno-kol-ops/tsconfig.json` | — | true | (via strict) | (via strict) | `allowJs: true` (mixed JS/TS service). |
| `payroll-autonomous/tsconfig.json` | — | — | — | — | **MISSING** — pure Vite/JS service, no TS config. |
| `enterprise_palantir_core/tsconfig.json` | — | — | — | — | **MISSING** — Python service. |
| `onyx-procurement/tsconfig.json` | — | — | — | — | **MISSING** — JS-only (`src/pipeline/*.js`, `*.js` modules). |

`api-server/tsconfig.json` references 5 lib packages (`db`, `api-zod`, `integrations-anthropic-ai`, `integrations-openai-ai-server`, `integrations-gemini-ai`) — none of those `lib/*` paths exist on disk in this worktree, so the project references are broken.

---

## 2. Strictness deviations from `tsconfig.base.json`

`onyx-ai/tsconfig.json` (the AI engine, ~22k LOC) explicitly weakens base:

```jsonc
"noImplicitAny": false,        // base = true
"noImplicitReturns": false,    // base = true
"noUnusedLocals": false,       // same as base
"noUnusedParameters": false    // same as base
```

`erp-app/tsconfig.json` and `techno-kol-ops/tsconfig.json` rely on `strict: true` umbrella (no overrides), but never set `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`. None of the per-package configs extend `tsconfig.base.json` except `api-server`.

`tsconfig.strict.json` exists ONLY in `onyx-ai/`. No equivalent for `api-server`, `erp-app`, or `techno-kol-ops`.

---

## 3. `any` abuse — production source code only

Patterns scanned: `:\s*any\b`, `as any\b`, `any[]`, `Record<string, any>`.

| Service | Files w/ `any` | Total `any` occurrences | `as any` casts |
|---------|---------------:|------------------------:|---------------:|
| `api-server/src/` | 250+ (truncated) | **3,983+** | **1,213** |
| `erp-app/src/` | 250+ (truncated) | **2,125+** | **360** |
| `techno-kol-ops/` | 59 | 278 | 78 |
| `onyx-ai/src/` | 11 | 159 | 57 |
| **TOTAL (lower bound)** | **570+** | **~6,545** | **~1,708** |

`api-server` and `erp-app` searches hit the 250-file pagination cap, so the true totals are higher.

### Top `any` offenders

**api-server (Express service — by `as any` count):**
| File | `as any` |
|------|---------:|
| `api-server/src/routes/crm-ultimate.ts` | 64 |
| `api-server/src/routes/external-portal.ts` | 34 |
| `api-server/src/routes/finance-enterprise4.ts` | 32 |
| `api-server/src/routes/finance-enterprise.ts` | 27 |
| `api-server/src/routes/communication-marketing-engine.ts` | 24 |
| `api-server/src/routes/finance-new-pages.ts` | 23 |
| `api-server/src/routes/crm-customer360.ts` | 21 |
| `api-server/src/routes/hse.ts` | 21 |
| `api-server/src/routes/oracle-financial-core.ts` | 61 |
| `api-server/src/routes/projects-sap-upgrade.ts` | 22 |

Typical pattern (from `crm-ultimate.ts:41-622`): unsafe DB row casts.
```ts
const val = Number((rows.rows as any[])?.[0]?.current_value || 1);
res.json({ data: rows, total: Number((countR[0] as any)?.total || 0) });
res.json({ ...(row as any), activities, meetings, quotes, tasks });
const result = await db.execute({ text, values: vals } as any);
res.json((result.rows as any[])[0]);
```
Cause: `pg`/Drizzle return values not properly typed; `as any` used to skip query-result schemas.

**erp-app (React frontend — by combined `any` count):**
| File | `: any` etc. | `as any` |
|------|-------------:|---------:|
| `erp-app/src/pages/builder/dynamic-data-view.tsx` | 112 | 2 |
| `erp-app/src/pages/builder/entity-editor.tsx` | 67 | 15 |
| `erp-app/src/pages/finance/accounting-portal.tsx` | 65 | — |
| `erp-app/src/pages/builder/dynamic-form-renderer.tsx` | 46 | — |
| `erp-app/src/pages/builder/actions-builder.tsx` | 33 | 20 |
| `erp-app/src/pages/builder/workflow-builder.tsx` | 33 | 2 |
| `erp-app/src/pages/builder/dynamic-detail-page.tsx` | 33 | — |
| `erp-app/src/pages/ehs/safety-incidents.tsx` | 65 | — |

The `pages/builder/*` family is the densest cluster — generic builder components forwarding loosely-typed config objects.

**onyx-ai (matches plan-doc baseline; deltas from Agent-19):**
| File | Plan (Agent-19) | Today |
|------|----------------:|------:|
| `onyx-integrations.ts` | 58 | 59 |
| `integrations.ts` | 54 | 53 |
| `index.ts` | 5 | 13 |
| `onyx-platform.ts` | 5 | 5 |
| `procurement-bridge.ts` | (n/a) | 11 (NEW since plan) |

Three new files appeared since Agent-19 ran: `procurement-bridge.ts` (11), `ml/drift-detector.ts` (7), `services/notificationService.ts` (4), `services/emailService.ts` (3), `stats/outlier-explainer.ts` (2). Plan was a one-shot snapshot and is now stale.

---

## 4. `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` audit

| Location | `@ts-nocheck` | `@ts-ignore` | `@ts-expect-error` | Total files |
|----------|--------------:|-------------:|-------------------:|------------:|
| `onyx-ai/src/` | 0 | 0 | 0 | 0 |
| `api-server/src/` | 0 | 0 | 0 | 0 |
| `erp-app/src/` | 0 | 0 | 0 | 0 |
| `techno-kol-ops/client/src/` | **9** | 0 | 0 | **9** |
| **TOTAL active code** | **9** | **0** | **0** | **9** |

All 9 are blanket `// @ts-nocheck` at file head 1 — entire-file suppressions:

| File |
|------|
| `techno-kol-ops/client/src/components/ClientDetailPanel.tsx` |
| `techno-kol-ops/client/src/components/EmployeeDetailPanel.tsx` |
| `techno-kol-ops/client/src/components/GlobalSearch.tsx` |
| `techno-kol-ops/client/src/components/Layout.tsx` |
| `techno-kol-ops/client/src/components/OrderDetailPanel.tsx` |
| `techno-kol-ops/client/src/components/TopNavbar.tsx` |
| `techno-kol-ops/client/src/engines/dmsEngine.ts` |
| `techno-kol-ops/client/src/engines/hrAutonomyEngine.ts` |
| `techno-kol-ops/client/src/engines/intelligentAlertEngine.ts` |

(Note: `techno-kol-ops/tsconfig.json` only includes `src/**/*` — the `client/src/**` path is NOT actually compiled by that tsconfig. The client likely has its own Vite build that effectively skips type-checking on these files.)

`api-server/src/` and `erp-app/src/` — **zero** suppressions — but only because they leaned on `as any` instead.

---

## 5. Other strict-related signals

| Pattern | api-server | erp-app | onyx-ai | techno-kol-ops |
|---------|-----------:|--------:|--------:|---------------:|
| `catch (e: any)` (defeats `useUnknownInCatchVariables`) | ~50 | ~10 | ~9 | (not measured) |
| Non-null assertion `!.` / `![` (per Agent-19, onyx-ai) | (not measured) | (not measured) | 21 | (not measured) |
| `as unknown as X` double casts | (not measured, but onyx-ai = 0 per plan) | | | |

`catch (e: any)` is the most common active strict-bypass — even with `strict: true` and `useUnknownInCatchVariables: true`, the explicit `: any` annotation locally overrides the rule.

---

## 6. Verdict per service

| Service | Strict score | Status |
|---------|:------------:|--------|
| `tsconfig.base.json` (root) | 8 / 8 core | **GREEN** — strong baseline |
| `api-server` | (inherits 8/8) but 1,213 `as any` + 3,983+ `any` | **AMBER** — config strict, code defeats it |
| `onyx-ai` | 7 / 8 (`noImplicitAny` OFF) + 159 `any` | **AMBER** — explicit weakening + `any` |
| `erp-app` | 8 / 8 (via umbrella) but 2,125+ `any` + 360 `as any` | **AMBER** — config strict, builder code lax |
| `techno-kol-ops` | 8 / 8 (via umbrella) but 9 `@ts-nocheck` (in client subdir not in tsconfig include) | **AMBER** — `client/` skipped from typecheck |
| `onyx-procurement` | — | **RED** — no `tsconfig.json`, JS-only pipeline (`src/pipeline/*.js`) |
| `payroll-autonomous` | — | **RED** — no `tsconfig.json`, Vite/JS only |

---

## 7. Recommendations (ranked by impact)

1. **`onyx-ai/tsconfig.json` — flip `noImplicitAny: true`** (Agent-19 Step 1, ~1–2d). Plan exists, no code change required to start.
2. **Add `tsconfig.json` to `onyx-procurement/`** — even minimal `allowJs: true` + `checkJs: false` so the `src/pipeline/*.js` blueprint at least lints. The architecture doc (`CLAUDE.md`) says this is the system's source of truth.
3. **Replace `as any` in `api-server/src/routes/`** — the top 10 files account for ~300 of 1,213 casts. Most are query-result casts; introduce typed query helpers (`db.query<Row>()`).
4. **Audit `erp-app/src/pages/builder/`** — the builder family has 280+ `any` in 6 files. These are generic config-driven components; once typed, the rest of the app benefits.
5. **Remove the 9 `@ts-nocheck` files in `techno-kol-ops/client/src/`** — file-level suppression is the worst kind. Either fix or move into `tsconfig.json` `include`.
6. **Write `tsconfig.strict.json` for `api-server`, `erp-app`, `techno-kol-ops`** — mirror what `onyx-ai` already has, so each service has an empirical baseline.
7. **Standardize on `tsconfig.base.json`** — only `api-server` extends it. Make `onyx-ai/erp-app/techno-kol-ops` extend the base as well.
8. **Lint rule**: add `@typescript-eslint/no-explicit-any` (warn) and `no-unsafe-assignment` to ratchet the count down.

---

## 8. Headline numbers

- Production TS files with `any` patterns: **570+**
- Total `any` occurrences (production): **~6,545** (lower bound)
- Total `as any` casts (production): **~1,708**
- `@ts-ignore` / `@ts-expect-error`: **0**
- `@ts-nocheck`: **9** (all in `techno-kol-ops/client/src/`)
- Services without any `tsconfig.json`: **3** (`onyx-procurement`, `payroll-autonomous`, `enterprise_palantir_core`)
- Services explicitly weakening base strict: **1** (`onyx-ai` — `noImplicitAny: false`)
- Existing migration plan in repo: `onyx-ai/TYPESCRIPT_STRICT_PLAN.md` (Agent-19, partially stale).

**Bottom line:** the configs are mostly strict; the source code is not. ~1,700 `as any` casts in production code are the real strict-mode violation, not the tsconfigs themselves.
