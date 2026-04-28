# AGENT-15 — Architecture Audit

**Audit date:** 2026-04-29
**Branch:** claude/objective-merkle-40ff93
**Auditor:** Agent 15 (architecture)
**Scope per CLAUDE.md:** 4 services, 6 pipeline modules, 13 Master Flow stages, packages/* shared libs.

---

## Status: AMBER — major drift between CLAUDE.md spec and code

The four service directories exist, the six pipeline modules exist, and there are no
illegal cross-imports between service `src/` trees. **However**, the documented system
contracts (ports, the `/api/wiring/*` blueprint endpoints, shared-package consumption,
and workspace declarations) are largely unimplemented. The architecture is "scaffolded"
but not "wired" as CLAUDE.md describes.

---

## 1. Service-boundary violations

### 1a. Port assignments do NOT match CLAUDE.md

| Service | CLAUDE.md port | Actual default in code | Status |
|---|---|---|---|
| TECHNO_KOL_OPS | 3200 | 3200 (`techno-kol-ops/src/index.ts:292`) | OK |
| ONYX_PROCUREMENT | 3100 | 3100 (`onyx-procurement/server.js:1781`) | OK |
| ONYX_AI | **3300** | **3200** (`techno-kol-ops/src/index.ts:2979` — collides with OPS!) | **BROKEN** |
| PAYROLL_AUTONOMOUS | 5173 (Vite) | Vite default (no explicit) | partial OK |

`techno-kol-ops/src/index.ts:2979` uses `process.env.PORT || '3200'` and prints
`"ONYX AI listening on port ${PORT}"` — meaning what CLAUDE.md calls "ONYX_AI" is
actually living inside the ops repo on port 3200, colliding with OPS itself.

`onyx-procurement/server.js:294` and `:321` configure `ONYX_AI_URL` defaulting to
`http://localhost:3200` — should be `:3300`.

### 1b. Sub-app mounts collapse the boundary

`onyx-procurement/server.js:381-382`:
```
mountSibling('/payroll',  'payroll-autonomous/dist',  ...);
mountSibling('/ai',       'onyx-ai',                  ...);
```
Procurement (3100) statically serves payroll and AI dist bundles. CLAUDE.md describes
`/payroll` and `/ai` as paths "served at" — implementation-wise this is OK but it means
the four "services" are actually one Express monolith on 3100 plus an OPS instance on
3200, plus a Vite dev server. The "4 services on 4 ports" model is aspirational.

### 1c. Cross-service imports from test tree

`test/payroll/*.test.js` (3 files) reach into `onyx-procurement/src/payments`,
`/src/ops`, `/src/rfq`. Tests live at the repo root rather than inside the
service. Not a runtime violation, but couples the root test tree to procurement
internals — moving any of those modules will silently break tests.

### 1d. No service-to-service src/ cross-imports

Direct grep of `from "../../<sibling-service>"` and `require("../../<sibling-service>")`
in each service's `src/` directory returned **zero matches** across all 4 services.
That part of the boundary is intact.

---

## 2. Pipeline-module issues

All 6 required modules exist in `onyx-procurement/src/pipeline/`:

| Module | Exists | Wired to API? |
|---|---|---|
| pipeline-engine.js | yes | **NO** |
| entity-map.js | yes | **NO** |
| workflow-flows.js | yes | **NO** |
| state-machines.js | yes | **NO** |
| wiring-spec.js | yes | **NO** |
| orchestrator.js | yes | **NO** |
| (extras) domain-model.js, ontology.js, state-enforcement.js | yes | partial |

### 2a. ZERO route handlers for the documented APIs

CLAUDE.md promises:
- `GET /api/wiring/spec`
- `GET /api/entity-map/:type`
- `GET /api/state-machines/:type/transitions`
- `POST /api/orchestrator/execute`
- `GET /api/pipeline/stages`
- `GET /api/workflows/:id`

A repo-wide grep for these route patterns finds matches **only in CLAUDE.md, web HTML
files, and one client call** (`techno-kol-ops/client/src/pages/WorkOrder360.tsx:308`
calls `/api/orchestrator/execute`). **No `app.get`/`app.post` handler is registered
in `server.js` or anywhere else.** The frontend will 404.

### 2b. Pipeline modules are dead code

`onyx-procurement/server.js` (1838 lines) only requires `./src/pipeline/state-enforcement`
(line 184). The other 8 pipeline modules export their constants/functions but no caller
imports them. They are effectively documentation in JS form.

### 2c. WorkOrder360 client expects an API that doesn't exist

The TSX page posts to `/api/orchestrator/execute` with `{entity, entity_id, action}`
— this endpoint is unimplemented. Any user clicking the action will get a 404.

---

## 3. Workspace drift

Root `package.json` workspaces declares:
```
techno-kol-ops, techno-kol-ops/client, onyx-procurement, onyx-ai,
payroll-autonomous, vm-task-runner, nexus_engine, paradigm_engine, packages/*
```

### 3a. AI-Task-Manager — NOT in workspaces, but exists at repo root

`AI-Task-Manager/package.json` is `{"name": "workspace", "private": true}` and uses
**pnpm with its own `pnpm-workspace.yaml` and `pnpm-lock.yaml`**. The root repo uses
**npm workspaces**. This is a separate, parallel monorepo embedded inside our monorepo.
Drift is **intentional-looking but unmanaged**: it has its own deps, lockfile, and
package manager. Recommend either:
- Add `AI-Task-Manager` to root workspaces and migrate to npm; or
- Document it explicitly as a vendored standalone subproject and add to `.npmignore`.

### 3b. Most packages/* sub-dirs are NOT real packages

`packages/` contains 11 subdirs (shared-audit, shared-events, shared-types, shared-ui,
shared-validation, shared-permissions, shared-observability, shared-workflows,
erp-upload, files-4, technokoluzi-erp). Of these:

- **8 of the 8 "shared-*" dirs have NO `package.json`** — they are bare folders.
  The root `workspaces: ["packages/*"]` glob matches them but npm will skip them
  silently because they lack a manifest. They are usable only via raw relative paths
  (`require("../packages/shared-audit")`), which is exactly what `onyx-procurement`
  does. They are not consumable as `@technokoluzi/shared-audit` etc.
- `packages/erp-upload/package.json` and `packages/technokoluzi-erp/package.json` exist
  but use conflicting names (`technokoluzi-erp` and `techno-kol-uzi`).

### 3c. nexus_engine, paradigm_engine, vm-task-runner

All three are listed in workspaces and exist on disk with `package.json`. Confirmed
present, but I did not verify they are referenced from the four core services' code.
A spot grep shows no service imports `nexus_engine` or `paradigm_engine` — these
appear to be parked / experimental.

---

## 4. Duplication

### 4a. Payroll exists in BOTH services

- `onyx-procurement/src/payroll/payroll-routes.js`, `pdf-generator.js`,
  `wage-slip-calculator.js`, `CONSTANTS_VERIFICATION.md`
- `payroll-autonomous/src/...` — full Vite/React app

Procurement registers payroll routes at line 1556 (`registerPayrollRoutes`) AND mounts
the payroll-autonomous bundle at `/payroll`. Two parallel implementations of the same
domain, both reachable at the same time.

### 4b. AI exists in BOTH locations

- `onyx-procurement/src/ai/summarizer.js`
- `onyx-ai/src/...` — full TS service tree
- The "ONYX AI" entrypoint lives in `techno-kol-ops/src/index.ts:2877+` (search hit
  at line 2979 "ONYX AI listening...")

Three places where AI logic lives. There is no single owner.

### 4c. server.js duplicates

`_merge-staging/files-2/server.js` and
`_merge-staging-final/.../onyx-procurement/server.js` are byte-similar copies of the
real `onyx-procurement/server.js`. These are merge-staging artifacts and should be
deleted from main. They are NOT in `.gitignore` (`git status` shows them tracked
historically — verify before deletion).

### 4d. Two CLAUDE.md files

- `/CLAUDE.md` (the source of truth used by tooling)
- `/docs/merged-final/KOBI-EL-System-2026-master/CLAUDE.md` (stale duplicate)

The merged-final tree is a build/merge artifact. Should not be in git.

---

## 5. Recommendations (priority order)

### P0 — block production until fixed
1. **Wire the pipeline APIs in `onyx-procurement/server.js`.** Add Express handlers
   for `/api/wiring/spec`, `/api/entity-map/:type`,
   `/api/state-machines/:type/transitions`, `/api/orchestrator/execute`,
   `/api/pipeline/stages`, `/api/workflows/:id`. Without these, CLAUDE.md is fiction
   and `WorkOrder360.tsx:308` is broken.
2. **Fix the ONYX_AI port collision.** `techno-kol-ops/src/index.ts:2979` defaults to
   3200 but prints "ONYX AI" — change to 3300 (per spec) or rename the log line.
   `onyx-procurement/server.js:294,321` should default `ONYX_AI_URL` to
   `http://localhost:3300`.
3. **Decide payroll ownership.** Either `payroll-autonomous` is canonical (delete
   `onyx-procurement/src/payroll/*` + the `registerPayrollRoutes` mount) or procurement
   is canonical (deprecate the Vite app). Two implementations cannot coexist.

### P1 — fix the foundation
4. **Add `package.json` to all 8 `shared-*` packages** with proper names
   (`@technokoluzi/shared-audit`, etc.) so they become real workspace packages.
   Then update consumers from `require('../packages/shared-audit')` to
   `require('@technokoluzi/shared-audit')`.
5. **Adopt the shared packages in OPS, AI, and Payroll.** Currently only procurement
   uses any of them (and only 2 of 8). Either delete the unused ones or wire them
   into the other services.
6. **Resolve `AI-Task-Manager`.** Pick npm or pnpm. If keeping it standalone, add it
   to `.gitignore` patterns or document the dual-PM nature in `MONOREPO.md`.

### P2 — cleanup
7. Remove `_merge-staging/`, `_merge-staging-final/`, `_merge-incoming/` from git
   (these are build artifacts, currently untracked-or-stale duplicates of working
   code).
8. Move root-level `test/payroll/*.test.js` into `payroll-autonomous/test/` or
   `onyx-procurement/test/` so test/code locality is restored.
9. Decide if `nexus_engine` and `paradigm_engine` are part of the system. If yes,
   document their role in CLAUDE.md. If no, remove from workspaces.
10. Delete or regenerate `docs/merged-final/.../CLAUDE.md` to prevent two-source-of-truth.

---

## Summary of evidence files

- `package.json` (root) — workspaces declaration
- `onyx-procurement/server.js:184,294,321,381-382,1556,1781` — wiring + ports
- `onyx-procurement/src/pipeline/*.js` — 6 modules + 3 extras, all exporting but
  none mounted on Express routes
- `techno-kol-ops/src/index.ts:292,2979` — OPS port 3200 + AI also 3200 inside OPS
- `techno-kol-ops/client/src/pages/WorkOrder360.tsx:308` — calls unimplemented API
- `packages/shared-*/` — 8 dirs without `package.json`
- `AI-Task-Manager/package.json` — separate pnpm monorepo at repo root

**Bottom line:** The system has the right shape (4 service folders, 6 pipeline files,
9 packages folders) but the contracts that make it a "Palantir-grade ERP" — typed
APIs, shared packages, single-owner domains, port hygiene — are unimplemented. The
documentation has out-run the code.
