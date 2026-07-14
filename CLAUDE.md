# Techno-Kol Uzi ERP 2026 — System Architecture Guide

## System Identity
This is a **Palantir-grade Enterprise ERP** — not a collection of pages.
Treat it as a fully connected operating system with business flow from end to end.

## 5 Services
| Service | Role | Port |
|---------|------|------|
| **TECHNO_KOL_OPS** | Operational Core (hub) | 3200 |
| **ONYX_PROCUREMENT** | Finance & Procurement backbone | 3100 |
| **PAYROLL_AUTONOMOUS** | Workforce & Salary engine | 5173 (served at /payroll) |
| **ONYX_AI** | Intelligence & Automation layer | 3300 (served at /ai) |
| **SMARTBUILD_PILOT** | Real-Estate Development Control Tower (`smartbuild-pilot/`) | 3400 |

`smartbuild-pilot/` is a zero-dependency Node service (see `smartbuild-pilot/SPEC.md`) that re-implements the SmartBuildPilot/YzmCon real-estate finance system with the same core-module pattern as `onyx-procurement/src/pipeline/` plus 11 deterministic financial engines (budget, Sale-Law sales, 36-month cashflow, zero-report/IRR, covenants, risk, Monte Carlo, alerts, insights, health).

## Architecture — `src/pipeline/`
All system definitions live in 6 modules under `onyx-procurement/src/pipeline/`:

| Module | Purpose |
|--------|---------|
| `pipeline-engine.js` | 13 Master Flow stages, topology, event triggers |
| `entity-map.js` | 16 entities with links, statuses, actions, fields, related sections |
| `workflow-flows.js` | 5 business flows (Sales→Project→Procurement→Execution→Cash + Employee→Payroll) |
| `state-machines.js` | 13 state machines with 91 transitions and trigger side-effects |
| `wiring-spec.js` | Service ownership, 20 entity relationships, 19 route groups, 9 page contracts, 55 action→API mappings, 7 cross-service contracts |
| `orchestrator.js` | 18 executable actions with preconditions, effects, events, listeners |

## Master Flow
```
Lead → Quote → Approval → Order → Project → Work Orders → Procurement →
Inventory → Execution → Delivery → Invoice → Payment → Closure
```

## 9 Master 360 Pages (P0 Priority)
Customer360, Supplier360, Quote360, RFQ360, Project360, WorkOrder360, PO360, Finance360, Employee360

Every 360 page must have: header+status, primary actions, related records, documents, audit log, next recommended action.

## No Dead Pages Rule
Every page must answer: Where am I? What is this? Current status? What can I do? Next step? Related records?

## Key APIs
- `GET /api/wiring/spec` — Full system blueprint in one call
- `GET /api/entity-map/:type` — Entity definition with all buttons/relations
- `GET /api/state-machines/:type/transitions?current=X` — Available transitions
- `POST /api/orchestrator/execute` — Execute a business action
- `GET /api/pipeline/stages` — Master Flow stages
- `GET /api/workflows/:id` — Business flow steps

## Build Priority
1. **P0**: Core entities, 360 pages, state machines, workflows, audit
2. **P1**: Dashboards, forecasting, AI recommendations, portals
3. **P2**: Advanced NLQ, deep ML, experimentation modules
