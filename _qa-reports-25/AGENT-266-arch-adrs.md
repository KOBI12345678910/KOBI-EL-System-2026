# AGENT-266 — Architecture Decision Records (ADRs)

**Agent:** 266 (ARCH #1)
**Date:** 2026-04-29
**Scope:** 4 services + 6 pipeline modules of Techno-Kol Uzi ERP 2026
**Format:** Lightweight ADR (context / decision / alternatives / consequences / lessons)

---

## Service Inventory

| Service | Role | Port | Stack | Entities Owned |
|---|---|---|---|---|
| `techno-kol-ops` | Operational Core (hub) | 3200 | TS / Node + React client | lead, customer, project, work_order, task, material_request, logistics_order, employee_assignment, alert, report |
| `onyx-procurement` | Finance & Procurement backbone | 3100 | Express / Node 20 | rfq, supplier, supplier_quote, po, approval, contract, invoice, payment, vat, tax, bank_match, gl_transaction, collection_case |
| `payroll-autonomous` | Workforce & Salary engine | 5173 | React / Vite | employee, employer, attendance, payroll, wage_slip, pension, hr_profile |
| `onyx-ai` | Intelligence & Automation layer | 3300 | TS / Node | ai_insight, forecast_model, anomaly_case, quality_score, decision_recommendation |

---

## ADR-001 — Four-Service Polyrepo Split

### Context
Project began as a procurement tool (`onyx-procurement`). As scope expanded to a full Palantir-grade ERP (Lead → Closure), three additional concerns emerged: operational execution, workforce/payroll, and intelligence. Three options existed for organising the growing surface area.

### Decision
Split into **4 services along business-capability boundaries**, not technical layers.

- **OPS** owns the *commercial-to-operational* path (lead, project, work order).
- **PROCUREMENT** owns the *money path* (PO, AP/AR, VAT, bank, GL).
- **PAYROLL** owns the *workforce path* (attendance, wage slip, pension).
- **AI** is a sidecar that observes and recommends; it never owns transactional state.

### Alternatives Considered
1. **Monolith.** Rejected — Israeli payroll/VAT lives on a different release cadence than the field-ops UI; one deployable would block both teams. Also: payroll has tighter compliance/audit needs than CRM.
2. **Microservices-per-entity (~30 services).** Rejected — operational overhead (30 Dockerfiles, 30 CI pipelines) would dwarf the 4-engineer team. Cross-entity transactions (e.g. `lead → quote → project`) would require sagas for what is logically one click.
3. **Modular monolith (single repo, multiple modules).** Considered seriously. Rejected because (a) procurement already had 18 months of independent code, (b) payroll needed Vite/React for the dashboard whereas ops needed TS/Express on the server, (c) compliance reviews benefit from physical isolation of the payroll engine.

### Consequences
- Cross-service contracts must be explicit (see `CROSS_SERVICE_CONTRACTS` in `wiring-spec.js`, line 243). 7 such contracts exist today.
- Each service has its own `package.json`, Dockerfile, port, and DB schema scope — but all share one Supabase Postgres instance.
- AI is read-only with respect to other services' tables; it writes only to its own `ai_*` tables and emits events.

### Lessons Learned
- The capability-boundary split survived three scope expansions (Wave 1.5 added VAT/tax/bank without forcing a payroll change).
- **Trap:** "operational alerts" almost ended up in OPS *and* AI. The `wiring-spec.js` SERVICE_OWNERSHIP map (line 19) was the tie-breaker — alerts live in OPS, signals/recommendations live in AI.
- Polyrepo-in-one-folder (a "polyrepo monorepo") gave us the isolation of polyrepo with the cross-cutting refactor power of a monorepo. Worth keeping.

---

## ADR-002 — `onyx-procurement` as Schema Authority

### Context
All 6 pipeline modules (entity-map, state-machines, etc.) live under `onyx-procurement/src/pipeline/`. This is unintuitive — why does the *procurement* service own the *system-wide* schema?

### Decision
Procurement is the **schema authority**: it defines entities, state machines, workflows, and orchestrations for *all* services. Other services consume the spec via `GET /api/wiring/spec` (one call returns the entire blueprint).

### Alternatives Considered
1. **Shared `packages/shared-schema` library.** Rejected initially because procurement was already running and the schema lived there organically. Worth revisiting if a 5th service is added.
2. **Each service owns its own schema.** Rejected — would defeat the "single source of truth" principle. The whole point is that a button on a Quote page (rendered by techno-kol-ops) and the Supabase row it updates (owned by procurement) agree on the state machine.
3. **Schema in a separate `core` service.** Rejected — adds a hop, and procurement is already the system of record for money (the most-audited domain), so it gets the most scrutiny anyway.

### Consequences
- `onyx-procurement` is on the critical path for *every* service's startup (they fetch the spec).
- Refactoring an entity touches one file, but redeploys one service.
- Other services degrade gracefully if procurement is down — they cache the last spec.

### Lessons Learned
- Naming is a debt: `onyx-procurement` doing schema authority confuses new contributors. Either rename the service or move pipeline/ to `packages/core-schema`.
- A `GET /api/wiring/spec` endpoint that returns *everything* is enormously useful for AI agents and admin tooling. Worth the bandwidth.

---

## ADR-003 — Six-Module Pipeline Decomposition

### Context
The "pipeline" (Lead → Closure) is the spine of the ERP. It has many concerns: stage definitions, entity shapes, state transitions, orchestration, route mapping. Putting all of it in one file would be a 3,000-line monster (it is — 3,016 lines split across 9 files).

### Decision
**Six canonical modules** under `onyx-procurement/src/pipeline/`, each with one responsibility.

| # | File | Responsibility | LOC | Single Question Answered |
|---|---|---|---|---|
| 1 | `pipeline-engine.js` | 13 master-flow stages, topology, event triggers | 567 | "What stage am I in and what comes next?" |
| 2 | `entity-map.js` | 16 entities — fields, statuses, actions, related sections | 402 | "What does this entity look like on screen?" |
| 3 | `workflow-flows.js` | 5 business flows (Sales→Project→Procurement→Execution→Cash + Employee→Payroll) | 129 | "What is the canonical happy-path flow?" |
| 4 | `state-machines.js` | 13 state machines, 91 transitions, side-effect triggers | 454 | "Can I move from state X to state Y?" |
| 5 | `wiring-spec.js` | Service ownership, 20 entity relationships, 19 route groups, 9 page contracts, 55 action→API mappings, 7 cross-service contracts | 333 | "Who owns this entity and what API serves it?" |
| 6 | `orchestrator.js` | 18 executable actions (preconditions / effects / events / listeners) | 337 | "What actually happens when I click this button?" |

Two supporting files round it out: `state-enforcement.js` (115 LOC, runtime guard imported by `server.js`) and `domain-model.js` + `ontology.js` (richer field-level / Palantir-style metadata; not part of the canonical six).

### Alternatives Considered
1. **One `pipeline.js` mega-file.** Rejected — diff conflicts during parallel agent work would be constant.
2. **One file per entity (`lead.js`, `quote.js`...).** Rejected — state machines and workflows are inherently cross-entity (a quote→project transition touches both). Would scatter related logic.
3. **Three files: schema, behaviour, wiring.** Considered. Rejected because *behaviour* alone splits naturally into "what state am I in" (state-machines) and "what action am I executing" (orchestrator) — they have different consumers.
4. **Each module as its own npm package.** Rejected — premature. Ship as files first, package later if a second consumer appears.

### Consequences
- Each module exports a plain JS object/map → easy to JSON-serialize for the `/api/wiring/spec` endpoint.
- A new entity requires touches in ~5 of the 6 files (entity-map, state-machines, wiring-spec, orchestrator, sometimes pipeline-engine). This is intentional friction — it forces the contributor to define every facet before merging.
- `state-enforcement.js` reads from `state-machines.js` only — runtime guard does not depend on orchestrator, keeping the hot path small.

### Lessons Learned
- The clear naming (engine / map / flows / machines / spec / orchestrator) shaved hours off code review. New contributors find the right file in seconds.
- **Trap:** entity definitions briefly drifted across `entity-map.js`, `domain-model.js`, and `ontology.js`. Resolution: `entity-map.js` is the UI/screen authority, `domain-model.js` is the field-level schema authority, `ontology.js` is the Palantir-style object-graph view. Documented this in the headers.
- The 91-transition state machine catalogue is the single highest-leverage file in the codebase — it gates every business action.

---

## ADR-004 — AI as Sidecar, Not Orchestrator

### Context
AI could either drive the system (agent-first) or observe it (sidecar). Driver mode means AI calls orchestrator actions directly; sidecar means AI emits recommendations a human/UI executes.

### Decision
**Sidecar.** `onyx-ai` reads events and writes only to its own tables (`ai_insight`, `decision_recommendation`, etc.). All state-changing actions still flow through the human-facing orchestrator with full preconditions/audit.

### Alternatives Considered
1. **Agent-first.** Rejected for v1 — Israeli ERP audit requirements (VAT, tax, payroll) demand a human-in-the-loop on every state-changing action. AI-initiated PO approval would not pass audit.
2. **Embedded in each service.** Rejected — duplicates ML infra and breaks the "single intelligence layer" principle. Cross-service signals (e.g. supplier risk → project margin) need a service that sees everything.

### Consequences
- AI can recommend "approve this PO" but cannot click the button.
- All AI actions go through `decision_recommendation` records with explainability.
- We can flip AI to driver mode per-action by adding it as an allowed `actor` in `state-enforcement.js`. Hooks are in place.

### Lessons Learned
- The sidecar pattern made AI feature shipping safe — we ship recommendations weekly without compliance review.
- The audit story is much cleaner: every state change has a human actor, even if the human just clicked "accept" on an AI suggestion.

---

## ADR-005 — Hebrew/RTL as a First-Class Concern

### Context
Every label, status, and action exists in both Hebrew and English (`label` and `labelEn` in entity-map). Israeli ERP users expect RTL UI; auditors expect Hebrew artefacts; some integrations (Tax Authority) demand Hebrew payloads.

### Decision
Bake bilingual labels into the schema modules themselves. No i18n framework — labels travel with the data.

### Alternatives Considered
1. **i18n JSON files (`he.json`, `en.json`).** Rejected — adds a lookup hop and risks drift between the schema and translations.
2. **Hebrew-only.** Rejected — onboarding international contractors and AI tooling work better with English keys.

### Consequences
- Schema files are bilingual at every level (`label` + `labelEn` on stages, statuses, actions).
- Adding a new entity costs two label fields, not a separate translation PR.

### Lessons Learned
- Embedding both languages in the spec was cheap and paid off when AI started reading the spec — English `labelEn` gives LLMs a stable handle while Hebrew `label` powers the UI.

---

## Summary of Lessons (cross-cutting)

| Theme | Lesson |
|---|---|
| **Boundaries** | Split by business capability, not technical layer. |
| **Schema authority** | One service owns the spec; others fetch via API. Don't duplicate. |
| **Files per concern** | When a pipeline gets >1k LOC, split by *role-played-in-the-flow* (engine, map, flows, machines, spec, orchestrator) rather than by entity. |
| **AI placement** | Sidecar first; promote to driver per-action only when audit allows. |
| **State enforcement** | A central `state-enforcement.js` reading from `state-machines.js` is worth more than scattered status checks in handlers. |
| **Bilingual schema** | Labels travel with the data. Cheaper than i18n indirection. |
| **Polyrepo-in-one-folder** | Keeps each service's release cadence independent while preserving cross-cutting refactor power. |
| **One-call blueprint** | `GET /api/wiring/spec` returning the entire system map is the highest-ROI endpoint we built. |

---

## Open Issues (for follow-up ADRs)

1. **Schema authority naming.** `onyx-procurement` owning system-wide schema is confusing. Move to `packages/core-schema` or rename the service.
2. **`domain-model.js` vs `entity-map.js` vs `ontology.js`** — three overlapping views of entities. Consolidate or formalise the three-view contract.
3. **AI driver mode.** Define the gating policy (which actions, which actors, which audit hooks) before flipping the first action.
4. **State machine versioning.** When a state machine changes, in-flight entities can break. Need a migration story.

---

**Files referenced (absolute paths):**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\pipeline-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\entity-map.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\workflow-flows.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-machines.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\orchestrator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-enforcement.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\domain-model.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\ontology.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\ARCHITECTURE.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\CLAUDE.md`
