# AGENT-199 — Documentation Gap Audit

**Scope:** README files per service, JSDoc coverage, OpenAPI spec, architecture diagrams, USER_GUIDE_HE.md vs current code.
**Verdict:** PARTIAL — strong root-level docs and one OpenAPI spec, but service-level READMEs are uneven, JSDoc coverage is sparse, and the Hebrew user guide lags the actual pipeline architecture.

---

## 1. README files per service

| Service | README.md | Notes |
|---|---|---|
| `onyx-procurement/` | MISSING (no top-level README) | Has `INSTRUCTIONS_TO_WIRE.md` (instructions only), `AUDIT_REPORT.md`, `AUTH_AUDIT.md`, `CONFIG.md`. Sub-folder READMEs exist (`migrations/`, `test/`, `web/`) but not at service root. |
| `techno-kol-ops/` | PRESENT (12 KB) | Strong: identity, ASCII architecture diagram, runbook, env vars. |
| `payroll-autonomous/` | MISSING | Only `.env.example`, `package.json`, `playwright.config.js`. No service README at all. |
| `onyx-ai/` | MISSING | Has `INSTRUCTIONS_TO_WIRE.md`, `TYPESCRIPT_STRICT_PLAN.md`, `audit-report.md`. No README. |

**Gap:** 3 of 4 services lack a README. CLAUDE.md positions them as the "4 Services" of the ERP, but a new contributor cloning the repo cannot identify their roles, ports, or run commands without reading instructions/audit files. **Priority: HIGH.**

---

## 2. JSDoc coverage

**onyx-procurement/src/** (the largest service: 408 source `.js` files, 28 test files):

- Files with at least one `/** ... */` JSDoc block: ~200+ (capped by sample), but many are 1-2 line one-liners.
- Files containing structured tags (`@param`, `@returns`, `@description`): **180 occurrences across the top 10 files only** — meaning a small subset of files account for the vast majority of structured docstrings. Most modules have headers but no parameter/return documentation.
- **Pipeline modules** (`src/pipeline/*.js` — the 6 critical architectural files per CLAUDE.md): `0` `@param`/`@returns` tags found. `domain-model.js`, `entity-map.js`, `orchestrator.js`, `pipeline-engine.js`, `state-machines.js`, `wiring-spec.js`, `workflow-flows.js`, `state-enforcement.js`, `ontology.js` are the system blueprint and have **no JSDoc API surface**.
- **techno-kol-ops/src/** (TypeScript, ~390 files): types provide some self-doc, but no enforced TSDoc.
- **payroll-autonomous/src/**: 3 `@param` matches across the entire React tree — effectively unannotated.
- **onyx-ai/src/**: `0` `@param`/`@returns`/`@description` tags found across 12 routes and 7 module folders. Critical for an "Intelligence layer" claiming to expose `/api/orchestrator`, `/api/wiring/spec` style contracts.

**Gap:** JSDoc/TSDoc is essentially decorative. The 6 pipeline modules — explicitly called out as the system definition in CLAUDE.md — have zero tag-level coverage. **Priority: HIGH for `src/pipeline/*`, MEDIUM elsewhere.**

---

## 3. API spec (OpenAPI)

| Service | OpenAPI | Coverage |
|---|---|---|
| `onyx-procurement` | `docs/openapi.yaml` (1,815 lines, OpenAPI 3.0.3) | ~80 operations, 73 tags/operationIds. Code has **211 route definitions** (`app.*` / `router.*`). **Coverage ~38%.** |
| `techno-kol-ops` | MISSING | 113 routes across 22 route files (admin, alerts, attendance, brain, clients, employees, financials, gps, intelligence, leads, materials, ontology, pipeline, reports, suppliers, supplyChain, tasks, workOrders, etc.). **0% spec coverage.** |
| `payroll-autonomous` | MISSING | Frontend-only React app — no server routes. Acceptable. |
| `onyx-ai` | MISSING | 12 routes (raw `node:http` server). **0% spec coverage.** |

The single `onyx-procurement/docs/openapi.yaml` does not appear to import/extend, and root-level discovery has no aggregator. `onyx-procurement/docs/POSTMAN_COLLECTION.json` exists alongside it but is a separate artifact.

Root-level `lib-client/api-spec/openapi.yaml` and `AI-Task-Manager/lib/api-spec/openapi.yaml` are scaffolds for ancillary projects, not the four core services.

**Gap:** Of ~336 server routes across the three backend services, only ~80 (24%) are documented in OpenAPI. Cross-service contracts called out in CLAUDE.md (`/api/wiring/spec`, `/api/entity-map/:type`, `/api/state-machines/:type/transitions`, `/api/orchestrator/execute`, `/api/pipeline/stages`, `/api/workflows/:id`) need to be checked for spec presence — onyx-procurement spec uses generic tags (Suppliers, RFQ, VAT, etc.) and does not appear to expose the architectural meta-endpoints. **Priority: HIGH.**

---

## 4. Architecture diagrams

**Root-level architectural docs:**
- `ARCHITECTURE.md` — 301 lines (no Mermaid/PlantUML/SVG)
- `SYSTEM_MAP_360.md` — 537 lines
- `DATA_MODEL.md` — 319 lines
- `INTEGRATION_BRIDGE.md`, `MONOREPO.md`, `SECURITY_MODEL.md`, `SYSTEM_STATS.md`, `COMPLIANCE_CHECKLIST.md` — present.

**Diagram inventory:**
- `.mmd` / `.puml` / `.drawio` files: **0** (no source-controlled diagrams)
- `mermaid` code blocks in markdown: **0 in root-level docs** (matches found only in `onyx-procurement/docs/DATABASE_SCHEMA.md` and a couple QA agent reports)
- ASCII art diagrams: present in `techno-kol-ops/README.md` and CLAUDE.md
- Rendered images (`.svg`/`.png` named "diagram"/"architecture"): **0**

**Gap:** No machine-renderable diagrams. `ARCHITECTURE.md` is prose; the Master Flow (Lead → Quote → ... → Closure) and the 13-stage pipeline / 91 transitions / 5 business flows / 16 entities described in CLAUDE.md have **no visual representation**. A C4 (context/container/component) model is missing entirely. **Priority: MEDIUM-HIGH.**

---

## 5. USER_GUIDE_HE.md vs current code

`USER_GUIDE_HE.md` — 401 lines, well-structured RTL Hebrew, 10 ToC sections, "What I see / What I do" pattern.

**Code drift findings:**
- **Pipeline architecture absent.** `pipeline`, `orchestrator`, `wiring`, `state-machine`, `workflow-flow`: **0 mentions** in the guide. The Master Flow (Lead→Quote→Approval→Order→Project→WO→...→Closure) is the system spine per CLAUDE.md, but the Hebrew guide does not mention it.
- **9 Master 360 pages absent.** Customer360 / Supplier360 / Quote360 / RFQ360 / Project360 / WorkOrder360 / PO360 / Finance360 / Employee360: **0 mentions**. CLAUDE.md flags these as P0 priority with mandatory layout (header+status, primary actions, related records, audit log, next recommended action) — none of this is reflected in the guide.
- **Service boundaries blurred.** Guide section "4. מודול מס שנתי" attributes annual tax to `onyx-ai`, but `onyx-ai` is described in CLAUDE.md as the Intelligence/Automation layer (port 3300). Tax forms (102/857/6111/1320) actually live under `onyx-procurement/src/tax/` and `src/tax-exports/`. Guide misroutes the user.
- **Port references.** Guide says `localhost:3000`. CLAUDE.md ports are 3100 (procurement), 3200 (ops), 3300 (ai), 5173 (payroll). Default landing page is unspecified — likely a stale value from an earlier monolith.
- **No coverage of:** state-machine transitions, audit log access patterns, cross-service contracts (7 per CLAUDE.md), 18 executable orchestrator actions, action→API mappings (55 per CLAUDE.md).

**Gap:** USER_GUIDE_HE.md describes a v1 monolithic ERP. Current code is the Palantir-grade pipeline-driven architecture. **Priority: HIGH.** Needs sections on: 360 pages (9), Master Flow (13 stages), state transitions visible to users, service ports/URLs.

---

## Summary table

| Area | Status | Priority |
|---|---|---|
| Service READMEs | 1/4 present | HIGH |
| JSDoc on `src/pipeline/*` (6 critical files) | 0 tagged | HIGH |
| JSDoc/TSDoc elsewhere | Sparse, 180 occurrences in top 10 procurement files; ~0 in onyx-ai/payroll | MEDIUM |
| OpenAPI — onyx-procurement | ~38% coverage (80/211 routes) | MEDIUM |
| OpenAPI — techno-kol-ops | Missing (113 routes) | HIGH |
| OpenAPI — onyx-ai | Missing (12 routes) | MEDIUM |
| Architecture diagrams | 0 Mermaid/PlantUML/SVG; ASCII only | MEDIUM-HIGH |
| USER_GUIDE_HE.md vs code | Lags pipeline + 360 pages + ports | HIGH |

## Recommendations (ordered)

1. Add `README.md` to `onyx-procurement/`, `payroll-autonomous/`, `onyx-ai/` — identity, port, run commands, env vars, link to OpenAPI.
2. Document the 6 `src/pipeline/*.js` modules with JSDoc — these are the system contract per CLAUDE.md.
3. Generate OpenAPI from `techno-kol-ops` route files (express-openapi or tsoa) — 113 routes are undocumented.
4. Add Mermaid C4 diagrams to `ARCHITECTURE.md` (context, containers, master flow, state machines).
5. Update `USER_GUIDE_HE.md`: add 360-pages section, Master Flow walkthrough, correct service ports, fix the onyx-ai/tax misattribution.
6. Cover `onyx-procurement/docs/openapi.yaml` gap — currently 131 of 211 routes undocumented.

## Key file paths

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\USER_GUIDE_HE.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\ARCHITECTURE.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\docs\openapi.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\` (6 critical files, 0 JSDoc tags)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\README.md` (only service README)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\` (22 route files, no OpenAPI)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\INSTRUCTIONS_TO_WIRE.md` (in lieu of README)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\` (no README, no INSTRUCTIONS)
