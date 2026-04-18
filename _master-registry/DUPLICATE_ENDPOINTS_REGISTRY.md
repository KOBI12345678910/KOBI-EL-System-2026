# Duplicate API Endpoints Registry

Generated: 2026-04-18
Source: `_master-registry/QA_AGENT_08_API.md` (190 duplicate pairs reported)

## Summary

Express resolves route handlers in **registration order** — the FIRST handler
wins for any given path. Later mounts of the same path are effectively
**dead code**. Rather than remove handlers (risky — signatures / middleware
may differ), this registry documents the duplication so a targeted merge
can be executed in a follow-up task.

## Hot-Spot Duplicates (mounted in 20+ files)

| Endpoint | Canonical file (proposed) | Other registrations | Action |
|----------|---------------------------|---------------------|--------|
| `GET /init` | `api-server/src/routes/health.ts` | ~24 files including `*-enterprise.ts`, `*-engine.ts`, test/seed files | Keep health.ts; delete from engine/enterprise files |
| `GET /dashboard` | `api-server/src/routes/dashboard.ts` | `dashboard-stats.ts`, `dashboard-kpi.ts`, `*-enterprise.ts` | Namespace: `/dashboard/kpi`, `/dashboard/stats` |
| `GET /products` | `api-server/src/routes/generic-crud.ts` OR `api-server/src/routes/products.ts` | Many engine files auto-register `/products` | Pick `generic-crud.ts` (CRUD canonical), remove duplicates |
| `GET /suppliers` | `api-server/src/routes/suppliers.ts` | `supplier-intelligence.ts`, `foreign-suppliers.ts`, many enterprise files | Keep suppliers.ts canonical |
| `GET /customers` | `crm-enterprise.ts` | `crm.ts`, `crm-ultimate.ts`, `customer-portal.ts` | Merge into crm-enterprise.ts |
| `GET /orders` | `purchase-orders.ts` | `purchase_orders.ts` (deleted 2026-04-18), various | Already deduplicated |
| `GET /inventory` | `inventory-management.ts` | `inventory-warehouse.ts`, `warehouse-intelligence.ts` | Pick inventory-management.ts |

## Canonical-File Heuristic

When two files implement the same endpoint, prefer (in order):

1. The file with **more handlers** (wider feature coverage)
2. `*-enterprise.ts` over generic name (usually the SAP-Level upgrade)
3. The file **most recently modified** (`git log -1 --format=%ci`)
4. The file currently **imported & mounted** in `api-server/src/routes/index.ts`
5. Break ties by the file with the shortest, most canonical name

## Marker Comment

For each non-canonical duplicate handler, add at top of file:

```ts
// DUPLICATE-REGISTRY: see _master-registry/DUPLICATE_ENDPOINTS_REGISTRY.md
// Canonical file: <path>. Express resolves first-registered handler only;
// handlers in this file for duplicate paths are dead code pending merge.
```

## Full Pairs List

See `_master-registry/QA_AGENT_08_API.md` for the complete machine-generated
list of 190 duplicate pairs. This registry captures only the hot-spots.

## Action Policy

**Do NOT remove handlers in this sweep.** Express auto-resolves first-mount,
so behavior is unchanged. A follow-up task (Phase 11 consolidation) will:

* Merge business logic from later mounts into canonical file
* Remove dead-code routers
* Update index.ts imports/mounts

## Status

DOCUMENTED — no runtime changes.
