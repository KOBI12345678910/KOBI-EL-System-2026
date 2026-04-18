# QA Agent 1+6 — Runtime & Smoke
Generated: 2026-04-18

Scope: `api-server`, `erp-app`, `onyx-procurement`, `onyx-ai`, `techno-kol-ops`, `vm-task-runner`.
Mode: Read-only static checks. No `npm install`, no long-running dev servers, no DB connections.

---

## Per-Service Boot Status

| service | tsc (noEmit) | build | entry parses | env guards | health endpoint | verdict |
|---|---|---|---|---|---|---|
| api-server | FAIL (tsconfig base missing + 1 syntax err) | not attempted | TS — needs tsc | GOOD (`PORT` fail-fast on boot) | `/api/health` (routes/index.ts, +9 other routers) | **fail** |
| erp-app | FAIL (~13,220 errors across codebase) | FAIL (vite: `@tailwindcss/typography` unresolved) | TSX — tsc fails | n/a (client) | n/a | **fail** |
| onyx-procurement | n/a (plain JS, no tsconfig) | n/a | `node --check server.js` = PARSE_OK | MIXED (many `process.env.X \|\| fallback`, but `SUPABASE_URL`/`ANON_KEY` required at line 170–171 w/o default) | `/health`, `/healthz` (17 matches in `server.js`) | **partial** |
| onyx-ai | PASS (0 errors) | not attempted (build emits) | TS OK via tsc | GOOD (dotenv + guards in `security.ts`, `health.ts`) | `/health`, `/healthz`, `/livez` (`src/index.ts:2286,2331,2358`; also `src/health.ts:208`) | **pass** |
| techno-kol-ops | PASS (0 errors) | not attempted | TS OK via tsc | GOOD (JWT_SECRET fail-closed in prod, auto-gen in dev; `src/index.ts:46`) | `/api/health` (`src/index.ts:168`) + root `/` status | **pass** |
| vm-task-runner | n/a (plain JS, no tsconfig) | n/a (noop build) | `node --check src/index.js` = PARSE_OK | GOOD (`VM_TASK_RUNNER_PORT`, `LOG_LEVEL` both default-fallback) | `/health` (`src/index.js:41`) | **pass** |

---

## TypeScript Compile Errors

Run: `node_modules/.bin/tsc -p <service> --noEmit` (using root monorepo `node_modules` — workspace npx is broken, see Blockers).

| service | exit | error count | notes |
|---|---|---|---|
| onyx-ai | 0 | 0 | clean |
| techno-kol-ops | 0 | 0 | clean |
| api-server | 2 | 2+ (compile aborted) | `error TS5083: Cannot read file 'C:/Users/kobi/Projects/tsconfig.base.json'` — `tsconfig.json` extends `../../tsconfig.base.json` which resolves OUTSIDE the repo (`C:/Users/kobi/Projects/`). Also `src/routes/ai-agents-system.ts(259,7): error TS1005: ',' expected.` |
| erp-app | 2 | **13,220** | Top codes: TS2322 (4,922), TS7006 (3,998), TS2307 (2,175 missing module — e.g. `wouter`), TS2339 (868), TS2304 (219), TS2451 (78 — `App.tsx` redeclared vars — duplicate lazy imports). Many modules missing entirely (e.g. `wouter`). |

---

## Build Output

### erp-app — `vite build` (FAIL, 81 ms)

```
✓ 3 modules transformed.
x Build failed in 81ms
error during build:
[@tailwindcss/vite:generate:build] Can't resolve '@tailwindcss/typography' in
  'C:\...\erp-app\src'
file: C:/.../erp-app/src/index.css
```

Dependency `@tailwindcss/typography` is referenced from `erp-app/src/index.css` but is not installed (and not listed in `erp-app/package.json`, per my inspection).

### Other services
- `onyx-ai`: build not attempted (would emit `dist/`); TS passes cleanly, so build should succeed barring I/O.
- `techno-kol-ops`: build not attempted; TS passes cleanly.
- `api-server`: build blocked by `tsconfig.base.json` missing path.
- `onyx-procurement`, `vm-task-runner`: no build step.

---

## Missing env guards / boot-time env requirements

Services that will crash at boot if env not set (fail-fast is good; listing for deploy checklist):

| service | var | behavior |
|---|---|---|
| api-server | `PORT` | `throw new Error('PORT ... required')` (`src/index.ts:21`) |
| onyx-procurement | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | referenced at `server.js:170–171`; no explicit guard with friendly message — will fail only inside `createClient`. **Recommend adding an explicit env-assert early.** |
| techno-kol-ops | `JWT_SECRET` | fail-closed in prod, auto-generated in dev with warning (GOOD). |

Silently-defaulted env (no guard, uses fallback — fine for dev, risky for prod):

- `onyx-procurement`: `TECHNO_KOL_OPS_URL`, `ONYX_AI_URL`, `ALLOWED_ORIGINS=*`, `RATE_LIMIT_*`, `VAT_RATE=0.18`, `AUTH_MODE` (defaults to `disabled` if no API_KEYS — but it does refuse `disabled` in production at line 218 — GOOD).
- `vm-task-runner`: `VM_TASK_RUNNER_PORT=3400`, `LOG_LEVEL=info`.

---

## Migration dry-check — `supabase/migrations/*.sql`

- **Count:** 43 migration files (`00000_master_schema.sql` through `00041_*` + `20260417000000_initial_schema.sql`).
- **Total size:** 15,518 lines.
- **Paren-balance heuristic** (very rough — catches only gross issues, false-positives on parens inside strings/comments):
  - 5 files show paren imbalance: `00010_enterprise_expansion_30_tables.sql`, `00011_...`, `00012_rpc_functions_core_block.sql`, `00015_read_model_views.sql`, `00016_trigger_functions_computed_fields.sql`. This is **very likely due to parens inside comments/strings**, not real SQL errors — requires a real SQL parser to confirm. Recommend running `psql --dry-run` or `sqlfluff lint` in a follow-up pass before treating as blockers.
- No file starts with a corrupted header; all begin with SQL comments (`-- FILE: ...`).

---

## Health-endpoint catalog

| service | route(s) | file |
|---|---|---|
| onyx-procurement | `/health`, `/healthz` (17 matches) | `server.js` |
| onyx-ai | `/health`, `/healthz`, `/livez` | `src/index.ts:2286, 2331, 2358`; `src/health.ts:208` |
| techno-kol-ops | `/api/health`, `/` (root status) | `src/index.ts:75, 168` |
| vm-task-runner | `/health` | `src/index.js:41` |
| api-server | `/health` present in multiple routers (`routes/index.ts`, `smart-payroll.ts`, `employee-value-engine.ts`, etc.) | 10+ files |
| erp-app | n/a (client) | — |

All 5 backend services have at least one health route.

---

## Smoke Verdict

- **Can the system boot?** **partial** — 3 of 5 backend services (onyx-ai, techno-kol-ops, vm-task-runner) are in a known-good state and can boot if deps are installed. onyx-procurement likely boots (entry parses; node_modules nearly empty but present). api-server and erp-app cannot currently compile.
- **Blockers (hard):**
  1. **Monorepo workspace is misconfigured** — `npm`/`npx` cannot resolve at all from the repo root: `EDUPLICATEWORKSPACE` errors for `onyx-procurement` (also living under `packages/files-2`) and name `workspace` duplicated across `packages/AI-Task-Manager`, `packages/GPS-Connect`, `packages/Location-Finder`. This blocks `npm install`, `npm run <anything>`, and `npx` in any child service. Until resolved, no service can be installed/built via the normal path.
  2. **api-server `tsconfig.json`** extends `../../tsconfig.base.json`, which resolves to `C:/Users/kobi/Projects/tsconfig.base.json` — a path **outside the repo** — file does not exist. Must create `tsconfig.base.json` at repo root or fix the relative `extends`.
  3. **api-server syntax error**: `src/routes/ai-agents-system.ts(259,7): error TS1005: ',' expected.` — one real TS syntax error.
  4. **erp-app TS is broken at massive scale** (~13,220 errors): missing `wouter` module, dozens of duplicate `const X = lazy(...)` declarations in `App.tsx`, broken lazy-load generic types. This is not a "small fix."
  5. **erp-app vite build fails** on missing `@tailwindcss/typography` (used in `src/index.css` but not declared in `package.json`).
  6. **Node dependencies not installed** for: `api-server`, `erp-app`, `vm-task-runner`. Existing `node_modules` in `onyx-ai`, `onyx-procurement`, `techno-kol-ops` are partial/hollow (e.g. `techno-kol-ops/node_modules/` contains only `@types` and `express-rate-limit`; no `.bin/`, no `tsc`, no runtime deps). Root `node_modules` has 766 entries and is the only usable install — because the workspace is broken, hoisting has not completed properly.

- **Warnings:**
  - `onyx-procurement` has duplicated copy at `packages/files-2/` (includes its own `server.js` and 2 seed SQL files) — this is the source of the `EDUPLICATEWORKSPACE` conflict.
  - `packages/{AI-Task-Manager,GPS-Connect,Location-Finder}` all declare the same package name `workspace` — cannot coexist.
  - `erp-app/node_modules` absent; top-level `node_modules` does include `vite` + `tsc`, which is how this QA run worked.
  - 5 migrations trigger the paren-balance heuristic — probably noise, but verify with a real SQL linter.
  - `onyx-procurement` reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` without an explicit, friendly env-validator (though `scripts/validate-env.js` exists via `prestart`).

---

## Issues (severity-tagged)

| severity | title | reproduce | module | fix |
|---|---|---|---|---|
| critical | Monorepo `EDUPLICATEWORKSPACE` — npm unusable | `cd <repo> && npx --no-install tsc` | root `package.json` + `packages/` | Either rename duplicate packages (`packages/files-2` contains a 2nd `onyx-procurement`; `packages/{AI-Task-Manager,GPS-Connect,Location-Finder}` all named `workspace`) or exclude them from the `workspaces` glob. |
| critical | `api-server/tsconfig.json` extends a path outside repo | `tsc -p api-server --noEmit` → `TS5083 Cannot read file 'C:/Users/kobi/Projects/tsconfig.base.json'` | `api-server/tsconfig.json` line 1 | Create `tsconfig.base.json` at repo root (or change `extends` to a path that exists — `lib/*` structure suggests base was expected to live at repo root). |
| critical | `erp-app` does not compile (13,220 TS errors) | `tsc -p erp-app/tsconfig.json --noEmit` | `erp-app/src/App.tsx` and many | (a) install `wouter` (TS2307 × 2,175 points to many missing modules — triage top 10). (b) Resolve the ~78 duplicate lazy `const X = ...` imports in `App.tsx` — a merge artifact. (c) After that, re-run and re-measure remaining classes (TS2322, TS7006). |
| critical | `erp-app` vite build cannot resolve `@tailwindcss/typography` | `cd erp-app && vite build` | `erp-app/src/index.css` + `erp-app/package.json` | Add `@tailwindcss/typography` to `erp-app/package.json` devDependencies, or remove the `@import` from `index.css`. |
| high | `api-server` syntax error | `tsc -p api-server` → `ai-agents-system.ts(259,7): error TS1005: ',' expected.` | `api-server/src/routes/ai-agents-system.ts:259` | Add missing `,` — likely a JSON-object-literal fix at line 259. |
| high | Service `node_modules` folders are hollow | `ls api-server/node_modules` → not found; `ls techno-kol-ops/node_modules` → 2 entries only | api-server, erp-app, vm-task-runner, techno-kol-ops, onyx-procurement | Fix workspace config (see top issue), then `npm install` at repo root. |
| medium | `onyx-procurement` required env not explicitly guarded before use | grep `SUPABASE_URL` in `server.js` — first use at line 170 without explicit throw | `onyx-procurement/server.js` | Although `scripts/validate-env.js` runs as `prestart`, the server itself will still create a Supabase client with `undefined` if launched via `node server.js` directly — add defensive check near top of `server.js`. |
| low | 5 migrations show paren imbalance via naive regex | see Migration dry-check | `supabase/migrations/0001[0-6]_*.sql` | Not confirmed real; re-run with `sqlfluff lint` or `psql -f ... --set ON_ERROR_STOP=on` against a scratch DB. |
| low | `erp-app` has 4 mirror package.json files (`.from-AI-Task-Manager`, `.from-erp-upload`, `.from-technokoluzi-erp`) | `ls erp-app/*.json*` | `erp-app/` | Clean up merge remnants to avoid confusion. Same pattern in api-server/tsconfig. |

---

## Summary

- total_services_checked: **6**
- tsc_passing: **2 / 4** (onyx-ai, techno-kol-ops pass; api-server, erp-app fail. onyx-procurement & vm-task-runner are plain JS and both pass `node --check`.)
- entry_parses: **4 / 4** that could be checked (all JS entries parse; TS entries rely on tsc above)
- build_passing: **0 / 1** attempted (erp-app vite FAIL)
- health_endpoints_present: **5 / 5** backend services
- migrations_found: **43** files, 15,518 lines
- critical_issues: **4** (workspace conflict, api-server tsconfig extends missing file, erp-app TS catastrophic, erp-app vite build broken)
- smoke_verdict: **partial**
- ready_for_further_qa: **no** — workspace-level `npm` must be unblocked first, then erp-app and api-server must be made compilable, before functional QA over the boot path is meaningful. `onyx-ai`, `techno-kol-ops`, `vm-task-runner` could be QA'd in isolation today if given a working install.
